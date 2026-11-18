import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  MAX_WORKSPACE_BYTES, hasPrivateWorkspaceData, parseAdminWorkspace, projectWorkspaceScope, validateWorkspaceTransition,
  type AdminWorkspace, type AdminWorkspaceAccess, type AdminWorkspaceGrantAck, type AdminWorkspaceSave, type AdminWorkspaceSaveAck, type AdminWorkspaceScope, type AdminWorkspaceView,
} from "@toonstudio/contracts/admin-workspace";

import { mergeWorkspaceScope, requireBusinessGrant, requireScopedWorkspace, requireWorkspaceScope, workspaceAccess, type WorkspaceBusinessGrant } from "./admin-workspace-access";
import { requireAdminWorkspaceSave } from "./admin-workspace.dto";

import type { Pool, PoolClient } from "pg";

export const ADMIN_WORKSPACE_POOL = Symbol("ADMIN_WORKSPACE_POOL");
const BOARD_ID = "toonstudio" as const;
const MAX_REVISION = 2_147_483_647;

interface WorkspaceRow {
  revision: number;
  payload: unknown;
  payload_digest: string | null;
  updated_at: Date | string | null;
  operations_revision: number;
  operations_updated_at: Date | string | null;
  business_revision: number;
  business_updated_at: Date | string | null;
  business_owner_user_id: string | null;
}
interface WorkspaceRecord {
  revision: number;
  state: AdminWorkspace | null;
  digest: string | null;
  updatedAt: string | null;
  scopes: Record<AdminWorkspaceScope, { revision: number; updatedAt: string | null }>;
  businessOwner: string | null;
}
interface WorkspaceReceipt {
  request_digest: string;
  accepted_revision: number;
  accepted_at: Date | string;
  scope: string;
  accepted_scope_revision: number | null;
}

interface AccessReceipt { request_digest: string; occurred_at: Date | string }

function unavailable(): ServiceUnavailableException {
  // DB 오류 원문에는 SQL 값이나 사용자 원문이 포함될 수 있으므로 응답·로그에 복사하지 않는다.
  return new ServiceUnavailableException({
    code: "admin_workspace_storage_unavailable",
    message: "작업 보드 저장소가 준비되지 않았거나 연결할 수 없습니다. 관리자에게 migration·접근 권한을 확인해 달라고 요청해 주세요. 기존 기록은 초기화하지 않습니다.",
  });
}

function timestamp(value: Date | string | null): string {
  if (value === null) throw unavailable();
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) throw unavailable();
  return instant.toISOString();
}

/** 키 순서 차이로 같은 저장 요청을 다른 요청으로 판정하지 않는다. */
export function adminWorkspaceDigest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, stable(entry)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function conflict(currentRevision: number, message = "다른 관리자가 기록을 변경했습니다. 현재 편집을 백업한 뒤 최신 기록을 다시 확인해 주세요.") {
  return new ConflictException({ code: "admin_workspace_conflict", currentRevision, message });
}

function decodeRecord(row: WorkspaceRow | undefined, now: Date): WorkspaceRecord {
  if (!row || !Number.isInteger(row.revision) || row.revision < 0 || row.revision > MAX_REVISION) throw unavailable();
  const scope = (revision: number, updatedAt: Date | string | null) => {
    if (!Number.isInteger(revision) || revision < 0 || revision > MAX_REVISION || (revision === 0) !== (updatedAt === null)) throw unavailable();
    return { revision, updatedAt: updatedAt === null ? null : timestamp(updatedAt) };
  };
  if (row.business_owner_user_id !== null && (typeof row.business_owner_user_id !== "string" || !row.business_owner_user_id.trim() || row.business_owner_user_id.length > 256)) throw unavailable();
  const accessMetadata = {
    scopes: { operations: scope(row.operations_revision, row.operations_updated_at), business: scope(row.business_revision, row.business_updated_at) },
    businessOwner: row.business_owner_user_id,
  };
  if (row.payload === null) {
    if (row.revision !== 0 || row.payload_digest !== null || row.updated_at !== null || row.business_owner_user_id !== null
      || row.operations_revision !== 0 || row.business_revision !== 0) throw unavailable();
    return { revision: 0, state: null, digest: null, updatedAt: null, ...accessMetadata };
  }
  if (row.revision === 0 || typeof row.payload_digest !== "string" || !/^[a-f0-9]{64}$/u.test(row.payload_digest)) throw unavailable();
  const parsed = parseAdminWorkspace(row.payload, now);
  if (!parsed.ok || adminWorkspaceDigest(parsed.value) !== row.payload_digest) throw unavailable();
  return { revision: row.revision, state: parsed.value, digest: row.payload_digest, updatedAt: timestamp(row.updated_at), ...accessMetadata };
}

@Injectable()
export class AdminWorkspaceRepository {
  constructor(@Inject(ADMIN_WORKSPACE_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let discard = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); }
        catch { discard = true; }
      }
      if (error instanceof HttpException) throw error;
      throw unavailable();
    } finally {
      client?.release(discard);
    }
  }

  private async actor(client: PoolClient, userId: string): Promise<"admin" | "operator"> {
    // 같은 트랜잭션의 역할 잠금으로 저장 도중의 비활성화·권한 회수와 경쟁하지 않는다.
    const row = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [userId],
    )).rows[0];
    if (!row || (row.role !== "admin" && row.role !== "operator")) {
      throw new ForbiddenException("활성 관리자·운영자 계정만 작업 보드를 볼 수 있습니다.");
    }
    return row.role;
  }

  private async ready(client: PoolClient): Promise<void> {
    // 런타임은 migration을 수행하지 않는다. 감사·receipt까지 없으면 저장 가능하다고 표시하지 않는다.
    await client.query(`SELECT workspace.id,workspace.revision,workspace.payload,workspace.payload_digest,workspace.updated_by,workspace.updated_at,
      workspace.operations_revision,workspace.operations_updated_at,workspace.business_revision,workspace.business_updated_at,workspace.business_owner_user_id,
      audit.board_id,audit.revision,audit.actor_user_id,audit.action,audit.before_digest,audit.after_digest,audit.occurred_at,
      audit.scope,audit.scope_revision,
      receipt.board_id,receipt.actor_user_id,receipt.mutation_id,receipt.request_digest,receipt.accepted_revision,receipt.accepted_at,receipt.scope,receipt.accepted_scope_revision,
      permission.board_id,permission.user_id,permission.can_write,permission.can_export,permission.granted_by,permission.updated_at,permission.revoked_at,
      access.id,access.board_id,access.actor_user_id,access.subject_user_id,access.action,access.mutation_id,access.request_digest,access.can_write,access.can_export,access.occurred_at
      FROM admin_workspace AS workspace CROSS JOIN admin_workspace_audit AS audit CROSS JOIN admin_workspace_receipt AS receipt
      CROSS JOIN admin_workspace_business_grant AS permission CROSS JOIN admin_workspace_access_audit AS access WHERE FALSE`);
  }

  private async load(client: PoolClient, lock: boolean, now: Date): Promise<WorkspaceRecord> {
    const rows = (await client.query<WorkspaceRow>(
      `SELECT revision,payload,payload_digest,updated_at,operations_revision,operations_updated_at,business_revision,business_updated_at,business_owner_user_id
        FROM admin_workspace WHERE id=$1${lock ? " FOR UPDATE" : " FOR SHARE"}`, [BOARD_ID],
    )).rows;
    if (rows.length !== 1) throw unavailable();
    return decodeRecord(rows[0], now);
  }

  private async access(client: PoolClient, record: WorkspaceRecord, userId: string, role: "admin" | "operator"): Promise<AdminWorkspaceAccess> {
    const grant = record.businessOwner && record.businessOwner !== userId ? (await client.query<WorkspaceBusinessGrant>(
      "SELECT can_write,can_export FROM admin_workspace_business_grant WHERE board_id=$1 AND user_id=$2 AND revoked_at IS NULL FOR SHARE", [BOARD_ID, userId],
    )).rows[0] : undefined;
    if (grant && (typeof grant.can_write !== "boolean" || typeof grant.can_export !== "boolean")) throw unavailable();
    return workspaceAccess(role, userId, record.businessOwner, grant);
  }

  private async accessAudit(client: PoolClient, userId: string, action: "read" | "export" | "claim" | "access-list"): Promise<void> {
    await client.query(`INSERT INTO admin_workspace_access_audit(id,board_id,actor_user_id,action)
      VALUES($1,$2,$3,$4)`, [randomUUID(), BOARD_ID, userId, action]);
  }

  async read(userId: string, requestedScope: AdminWorkspaceScope = "operations", exporting = false): Promise<AdminWorkspaceView> {
    const scope = requireWorkspaceScope(requestedScope);
    return this.transaction(async (client) => {
      const role = await this.actor(client, userId);
      await this.ready(client);
      const record = await this.load(client, false, new Date());
      const access = await this.access(client, record, userId, role);
      if (!access[scope].canRead || (exporting && !access[scope].canExport)) throw new ForbiddenException("이 자료를 조회하거나 내보낼 권한이 없습니다.");
      if (scope === "business") await this.accessAudit(client, userId, exporting ? "export" : "read");
      const projected = record.state === null ? null : projectWorkspaceScope(record.state, scope);
      // 비공개 자료의 최초 저장 여부도 운영 응답의 null/빈 객체 차이로 노출하지 않는다.
      const state = scope === "operations" && record.scopes.operations.revision === 0 && projected?.records.length === 0 ? null : projected;
      return { boardId: BOARD_ID, ...record.scopes[scope], state, canEdit: access[scope].canWrite, scope, access };
    });
  }

  async save(userId: string, value: AdminWorkspaceSave): Promise<AdminWorkspaceSaveAck> {
    const now = new Date();
    const input = requireAdminWorkspaceSave(value, now);
    const scope = requireWorkspaceScope(input.scope);
    requireScopedWorkspace(input.state, scope);
    const requestDigest = adminWorkspaceDigest(input);
    return this.transaction(async (client) => {
      const role = await this.actor(client, userId);
      await this.ready(client);
      const record = await this.load(client, true, now);
      const access = await this.access(client, record, userId, role);
      const canClaim = scope === "business" && input.claimBusinessOwnership === true && role === "admin"
        && record.businessOwner === null && !hasPrivateWorkspaceData(record.state) && hasPrivateWorkspaceData(input.state);
      if ((!access[scope].canWrite && !canClaim)
        || (input.claimBusinessOwnership === true && record.businessOwner !== userId && !canClaim)) throw new ForbiddenException("이 범위를 저장할 권한이 없습니다. 비공개 자료는 소유자 또는 명시적으로 허용된 담당자만 변경할 수 있습니다.");
      const current = record.scopes[scope];
      const previous = (await client.query<WorkspaceReceipt>(
        `SELECT request_digest,accepted_revision,accepted_at,scope,accepted_scope_revision FROM admin_workspace_receipt WHERE board_id=$1 AND actor_user_id=$2 AND mutation_id=$3`,
        [BOARD_ID, userId, input.mutationId],
      )).rows[0];
      if (previous) {
        if (previous.request_digest !== requestDigest || previous.scope !== scope) throw conflict(current.revision, "같은 저장 요청 ID의 내용이 다릅니다. 현재 편집을 보존한 뒤 새 요청으로 저장해 주세요.");
        if (!Number.isInteger(previous.accepted_revision) || previous.accepted_revision < 1 || previous.accepted_revision > record.revision
          || previous.accepted_scope_revision === null || !Number.isInteger(previous.accepted_scope_revision)
          || previous.accepted_scope_revision < 1 || previous.accepted_scope_revision > current.revision) throw unavailable();
        return { boardId: BOARD_ID, revision: previous.accepted_scope_revision, updatedAt: timestamp(previous.accepted_at), replayed: true, scope };
      }
      if (current.revision !== input.expectedRevision) throw conflict(current.revision);
      if (record.revision === MAX_REVISION || current.revision === MAX_REVISION) throw conflict(current.revision, "이 보드의 버전 한도에 도달했습니다. 기록을 보존한 뒤 관리자에게 확인해 주세요.");
      const errors = validateWorkspaceTransition(record.state === null ? null : projectWorkspaceScope(record.state, scope), input.state, now);
      if (errors.length) throw new BadRequestException({ code: "admin_workspace_invalid", message: "원본·근거·승인 상태의 변경 조건을 확인해 주세요.", errors: errors.slice(0, 20) });
      const state = mergeWorkspaceScope(record.state, input.state, scope);
      if (!parseAdminWorkspace(state, now).ok || validateWorkspaceTransition(record.state, state, now).length) throw new BadRequestException({
        code: "admin_workspace_invalid", message: "보존된 원문과 다른 영역의 기록을 변경할 수 없습니다.",
      });

      // JSONB는 지수 숫자를 십진수로 펼친다. 원문을 변경하지 않고 실제 저장 표현의 상한을 확인한다.
      const payload = JSON.stringify(state);
      const bytes = (await client.query<{ bytes: number }>(
        "SELECT octet_length($1::jsonb::text)::integer AS bytes", [payload],
      )).rows[0]?.bytes;
      if (!Number.isSafeInteger(bytes) || bytes < 2) throw unavailable();
      if (bytes > MAX_WORKSPACE_BYTES) throw new BadRequestException({
        code: "admin_workspace_invalid", message: "원문과 숫자를 보존한 저장 자료가 12MiB 한도를 넘습니다. 가져올 자료의 범위를 줄여 주세요.",
        errors: ["원문을 변환하거나 버리지 않고 저장하려면 자료를 12MiB 이내로 줄여야 합니다."],
      });
      const revision = record.revision + 1;
      const scopeRevision = current.revision + 1;
      const digest = adminWorkspaceDigest(state);
      const updated = (await client.query<{ updated_at: Date | string }>(
        `UPDATE admin_workspace SET revision=$1,payload=$2::jsonb,payload_digest=$3,updated_by=$4,updated_at=now(),
          ${scope}_revision=$7,${scope}_updated_at=now(),business_owner_user_id=$8 WHERE id=$5 AND revision=$6 RETURNING updated_at`,
        [revision, payload, digest, userId, BOARD_ID, record.revision, scopeRevision, canClaim ? userId : record.businessOwner],
      )).rows[0];
      if (!updated) throw conflict(current.revision);
      const updatedAt = timestamp(updated.updated_at);
      await client.query(`INSERT INTO admin_workspace_audit(board_id,revision,actor_user_id,action,before_digest,after_digest,occurred_at,scope,scope_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [BOARD_ID, revision, userId, record.state === null ? "import" : "save", record.digest, digest, updatedAt, scope, scopeRevision]);
      await client.query(`INSERT INTO admin_workspace_receipt(board_id,actor_user_id,mutation_id,request_digest,accepted_revision,accepted_at,scope,accepted_scope_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [BOARD_ID, userId, input.mutationId, requestDigest, revision, updatedAt, scope, scopeRevision]);
      if (canClaim) await this.accessAudit(client, userId, "claim");
      return { boardId: BOARD_ID, revision: scopeRevision, updatedAt, replayed: false, scope };
    });
  }

  async listBusinessAccess(userId: string) {
    return this.transaction(async (client) => {
      const role = await this.actor(client, userId);
      await this.ready(client);
      const record = await this.load(client, false, new Date());
      if (!(await this.access(client, record, userId, role)).business.canManageAccess) throw new ForbiddenException("비공개 자료의 소유자만 접근 권한을 관리할 수 있습니다.");
      const grants = (await client.query<{ user_id: string; can_write: boolean; can_export: boolean; updated_at: Date | string }>(
        "SELECT user_id,can_write,can_export,updated_at FROM admin_workspace_business_grant WHERE board_id=$1 AND revoked_at IS NULL ORDER BY user_id", [BOARD_ID],
      )).rows.map(row => ({ userId: row.user_id, canRead: true, canWrite: row.can_write, canExport: row.can_export, updatedAt: timestamp(row.updated_at) }));
      await this.accessAudit(client, userId, "access-list");
      return { ownerUserId: record.businessOwner, grants };
    });
  }

  async changeBusinessAccess(userId: string, value: unknown): Promise<AdminWorkspaceGrantAck> {
    const input = requireBusinessGrant(value);
    const digest = adminWorkspaceDigest(input);
    return this.transaction(async (client) => {
      const role = await this.actor(client, userId);
      await this.ready(client);
      const record = await this.load(client, true, new Date());
      if (!(await this.access(client, record, userId, role)).business.canManageAccess) throw new ForbiddenException("비공개 자료의 소유자만 접근 권한을 관리할 수 있습니다.");
      if (input.userId === record.businessOwner) throw new BadRequestException("소유자의 권한은 담당자 권한 변경으로 수정할 수 없습니다.");
      const previous = (await client.query<AccessReceipt>(
        "SELECT request_digest,occurred_at FROM admin_workspace_access_audit WHERE board_id=$1 AND actor_user_id=$2 AND mutation_id=$3", [BOARD_ID, userId, input.mutationId],
      )).rows[0];
      if (previous) {
        if (previous.request_digest !== digest) throw new ConflictException("같은 권한 변경 요청의 내용이 다릅니다.");
        return { updatedAt: timestamp(previous.occurred_at), replayed: true };
      }
      if (input.canRead) await this.actor(client, input.userId);
      const changed = (await client.query<{ updated_at: Date | string }>(
        `INSERT INTO admin_workspace_business_grant(board_id,user_id,can_write,can_export,granted_by,updated_at,revoked_at)
          VALUES($1,$2,$3,$4,$5,now(),CASE WHEN $6 THEN NULL ELSE now() END)
          ON CONFLICT(board_id,user_id) DO UPDATE SET can_write=EXCLUDED.can_write,can_export=EXCLUDED.can_export,
            granted_by=EXCLUDED.granted_by,updated_at=EXCLUDED.updated_at,revoked_at=EXCLUDED.revoked_at RETURNING updated_at`,
        [BOARD_ID, input.userId, input.canWrite, input.canExport, userId, input.canRead],
      )).rows[0];
      if (!changed) throw unavailable();
      const updatedAt = timestamp(changed.updated_at);
      await client.query(`INSERT INTO admin_workspace_access_audit(id,board_id,actor_user_id,subject_user_id,action,mutation_id,request_digest,can_write,can_export,occurred_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), BOARD_ID, userId, input.userId, input.canRead ? "grant" : "revoke", input.mutationId, digest, input.canWrite, input.canExport, updatedAt]);
      return { updatedAt, replayed: false };
    });
  }
}
