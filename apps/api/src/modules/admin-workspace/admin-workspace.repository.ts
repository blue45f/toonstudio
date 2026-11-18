import { createHash } from "node:crypto";

import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  MAX_WORKSPACE_BYTES, parseAdminWorkspace, validateWorkspaceTransition,
  type AdminWorkspace, type AdminWorkspaceSave, type AdminWorkspaceSaveAck, type AdminWorkspaceView,
} from "@toonstudio/contracts/admin-workspace";

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
}
interface WorkspaceRecord {
  revision: number;
  state: AdminWorkspace | null;
  digest: string | null;
  updatedAt: string | null;
}
interface WorkspaceReceipt {
  request_digest: string;
  accepted_revision: number;
  accepted_at: Date | string;
}

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
  if (row.payload === null) {
    if (row.revision !== 0 || row.payload_digest !== null || row.updated_at !== null) throw unavailable();
    return { revision: 0, state: null, digest: null, updatedAt: null };
  }
  if (row.revision === 0 || typeof row.payload_digest !== "string" || !/^[a-f0-9]{64}$/u.test(row.payload_digest)) throw unavailable();
  const parsed = parseAdminWorkspace(row.payload, now);
  if (!parsed.ok || adminWorkspaceDigest(parsed.value) !== row.payload_digest) throw unavailable();
  return { revision: row.revision, state: parsed.value, digest: row.payload_digest, updatedAt: timestamp(row.updated_at) };
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

  private async actor(client: PoolClient, userId: string, write: boolean): Promise<"admin" | "operator"> {
    // 같은 트랜잭션의 역할 잠금으로 저장 도중의 비활성화·권한 회수와 경쟁하지 않는다.
    const row = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [userId],
    )).rows[0];
    if (!row || (row.role !== "admin" && row.role !== "operator") || (write && row.role !== "admin")) {
      throw new ForbiddenException(write ? "작업 보드는 관리자만 저장할 수 있습니다. 운영자는 조회만 가능합니다." : "활성 관리자·운영자 계정만 작업 보드를 볼 수 있습니다.");
    }
    return row.role;
  }

  private async ready(client: PoolClient): Promise<void> {
    // 런타임은 migration을 수행하지 않는다. 감사·receipt까지 없으면 저장 가능하다고 표시하지 않는다.
    await client.query(`SELECT workspace.id,workspace.revision,workspace.payload,workspace.payload_digest,workspace.updated_by,workspace.updated_at,
      audit.board_id,audit.revision,audit.actor_user_id,audit.action,audit.before_digest,audit.after_digest,audit.occurred_at,
      receipt.board_id,receipt.actor_user_id,receipt.mutation_id,receipt.request_digest,receipt.accepted_revision,receipt.accepted_at
      FROM admin_workspace AS workspace CROSS JOIN admin_workspace_audit AS audit CROSS JOIN admin_workspace_receipt AS receipt WHERE FALSE`);
  }

  private async load(client: PoolClient, lock: boolean, now: Date): Promise<WorkspaceRecord> {
    const rows = (await client.query<WorkspaceRow>(
      `SELECT revision,payload,payload_digest,updated_at FROM admin_workspace WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [BOARD_ID],
    )).rows;
    if (rows.length !== 1) throw unavailable();
    return decodeRecord(rows[0], now);
  }

  async read(userId: string): Promise<AdminWorkspaceView> {
    return this.transaction(async (client) => {
      const role = await this.actor(client, userId, false);
      await this.ready(client);
      const record = await this.load(client, false, new Date());
      return { boardId: BOARD_ID, revision: record.revision, state: record.state, updatedAt: record.updatedAt, canEdit: role === "admin" };
    });
  }

  async save(userId: string, value: AdminWorkspaceSave): Promise<AdminWorkspaceSaveAck> {
    const now = new Date();
    const input = requireAdminWorkspaceSave(value, now);
    const requestDigest = adminWorkspaceDigest(input);
    return this.transaction(async (client) => {
      await this.actor(client, userId, true);
      await this.ready(client);
      const record = await this.load(client, true, now);
      const previous = (await client.query<WorkspaceReceipt>(
        `SELECT request_digest,accepted_revision,accepted_at FROM admin_workspace_receipt WHERE board_id=$1 AND actor_user_id=$2 AND mutation_id=$3`,
        [BOARD_ID, userId, input.mutationId],
      )).rows[0];
      if (previous) {
        if (previous.request_digest !== requestDigest) throw conflict(record.revision, "같은 저장 요청 ID의 내용이 다릅니다. 현재 편집을 보존한 뒤 새 요청으로 저장해 주세요.");
        if (!Number.isInteger(previous.accepted_revision) || previous.accepted_revision < 1 || previous.accepted_revision > record.revision) throw unavailable();
        return { boardId: BOARD_ID, revision: previous.accepted_revision, updatedAt: timestamp(previous.accepted_at), replayed: true };
      }
      if (record.revision !== input.expectedRevision) throw conflict(record.revision);
      if (record.revision === MAX_REVISION) throw conflict(record.revision, "이 보드의 버전 한도에 도달했습니다. 기록을 보존한 뒤 관리자에게 확인해 주세요.");
      const errors = validateWorkspaceTransition(record.state, input.state, now);
      if (errors.length) throw new BadRequestException({ code: "admin_workspace_invalid", message: "원본·근거·승인 상태의 변경 조건을 확인해 주세요.", errors: errors.slice(0, 20) });

      // JSONB는 지수 숫자를 십진수로 펼친다. 원문을 변경하지 않고 실제 저장 표현의 상한을 확인한다.
      const payload = JSON.stringify(input.state);
      const bytes = (await client.query<{ bytes: number }>(
        "SELECT octet_length($1::jsonb::text)::integer AS bytes", [payload],
      )).rows[0]?.bytes;
      if (!Number.isSafeInteger(bytes) || bytes < 2) throw unavailable();
      if (bytes > MAX_WORKSPACE_BYTES) throw new BadRequestException({
        code: "admin_workspace_invalid", message: "원문과 숫자를 보존한 저장 자료가 12MiB 한도를 넘습니다. 가져올 자료의 범위를 줄여 주세요.",
        errors: ["원문을 변환하거나 버리지 않고 저장하려면 자료를 12MiB 이내로 줄여야 합니다."],
      });
      const revision = record.revision + 1;
      const digest = adminWorkspaceDigest(input.state);
      const updated = (await client.query<{ updated_at: Date | string }>(
        `UPDATE admin_workspace SET revision=$1,payload=$2::jsonb,payload_digest=$3,updated_by=$4,updated_at=now() WHERE id=$5 AND revision=$6 RETURNING updated_at`,
        [revision, payload, digest, userId, BOARD_ID, record.revision],
      )).rows[0];
      if (!updated) throw conflict(record.revision);
      const updatedAt = timestamp(updated.updated_at);
      await client.query(`INSERT INTO admin_workspace_audit(board_id,revision,actor_user_id,action,before_digest,after_digest,occurred_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [BOARD_ID, revision, userId, record.state === null ? "import" : "save", record.digest, digest, updatedAt]);
      await client.query(`INSERT INTO admin_workspace_receipt(board_id,actor_user_id,mutation_id,request_digest,accepted_revision,accepted_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [BOARD_ID, userId, input.mutationId, requestDigest, revision, updatedAt]);
      return { boardId: BOARD_ID, revision, updatedAt, replayed: false };
    });
  }
}
