import { createHash, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { parseBusinessPlanState, type BusinessPlanAccess, type BusinessPlanAccessAck, type BusinessPlanAccessList, type BusinessPlanRecord, type ChangeBusinessPlanAccessRequest, type SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";
import type { Pool, PoolClient } from "pg";

export const BUSINESS_PLAN_POOL = Symbol("BUSINESS_PLAN_POOL");

interface BoardRow { revision: number; payload: unknown; updated_at: Date | null; owner_user_id?: string | null }
interface ReceiptRow { request_digest: string; accepted_revision: number }
interface AccessReceiptRow { request_digest: string; occurred_at: Date }
interface GrantRow { user_id: string; can_write: boolean; can_export: boolean; updated_at: Date }

const noAccess = (): BusinessPlanAccess => ({ canRead: false, canWrite: false, canExport: false, canManageAccess: false, canClaimOwnership: false });
const denied = () => new ForbiddenException("사업계획서 자료에 대한 명시적 접근 권한을 확인할 수 없습니다.");

export function businessPlanDigest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, entry]) => [key, stable(entry)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({ code: "business_plan_storage_unavailable", message: "사업계획서 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해주세요." });
}

function record(row: BoardRow | undefined, access: BusinessPlanAccess): BusinessPlanRecord {
  if (!row) return { board: null, revision: 0, updatedAt: null, access };
  if (row.revision === 0 && row.payload === null && row.updated_at === null) return { board: null, revision: 0, updatedAt: null, access };
  if (!Number.isInteger(row.revision) || row.revision < 1 || !(row.updated_at instanceof Date) || !Number.isFinite(row.updated_at.getTime())) throw unavailable();
  const board = parseBusinessPlanState(row.payload);
  if (!board.ok) throw unavailable();
  return { board: board.value, revision: row.revision, updatedAt: row.updated_at.toISOString(), access };
}

function conflict(currentRevision: number): ConflictException {
  return new ConflictException({ code: "business_plan_conflict", currentRevision, message: "다른 관리자가 보드를 변경했습니다. 작업을 보관하고 최신 버전을 다시 확인해주세요." });
}

@Injectable()
export class BusinessPlanRepository {
  constructor(@Inject(BUSINESS_PLAN_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); }
        catch { client.release(true); client = undefined; }
      }
      if (error instanceof ForbiddenException || error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      // DB 오류의 SQL·연결 정보·입력 본문은 응답 및 애플리케이션 로그에 노출하지 않는다.
      throw unavailable();
    } finally { client?.release(); }
  }

  private async requireActor(client: PoolClient, actorUserId: string): Promise<"admin" | "operator"> {
    const user = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actorUserId],
    )).rows[0];
    if (user?.role !== "admin" && user?.role !== "operator") throw denied();
    return user.role;
  }

  private async load(client: PoolClient, write = false): Promise<BoardRow | undefined> {
    return (await client.query<BoardRow>(`SELECT revision,payload,updated_at,owner_user_id FROM admin_business_plan WHERE id=1 FOR ${write ? "UPDATE" : "SHARE"}`)).rows[0];
  }

  private async access(client: PoolClient, actor: string, role: "admin" | "operator", row: BoardRow | undefined): Promise<BusinessPlanAccess> {
    if (row?.owner_user_id === actor && role === "admin") {
      return { canRead: true, canWrite: true, canExport: true, canManageAccess: true, canClaimOwnership: false };
    }
    if (row?.owner_user_id) {
      const grant = (await client.query<GrantRow>("SELECT user_id,can_write,can_export,updated_at FROM admin_business_plan_grant WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE", [actor])).rows[0];
      return grant ? { canRead: true, canWrite: grant.can_write, canExport: grant.can_export, canManageAccess: false, canClaimOwnership: false } : noAccess();
    }
    if (role === "admin" && (!row || (row.revision === 0 && row.payload === null && row.updated_at === null))) {
      // 소유자 없는 과거 원문·snapshot은 임의의 다음 관리자에게 귀속하지 않는다.
      const history = (await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM admin_business_plan_revision
        UNION ALL SELECT accepted_revision FROM admin_business_plan_receipt
        UNION ALL SELECT revision FROM admin_business_plan_audit) AS exists`)).rows[0];
      if (history?.exists === false) return { ...noAccess(), canClaimOwnership: true };
    }
    return noAccess();
  }

  private async auditAccess(client: PoolClient, actor: string, action: string, input?: { mutationId: string; digest: string; subject?: string; canWrite?: boolean; canExport?: boolean }): Promise<string> {
    const row = (await client.query<{ occurred_at: Date }>(`INSERT INTO admin_business_plan_access_audit
      (id,actor_user_id,action,subject_user_id,mutation_id,request_digest,can_write,can_export)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING occurred_at`,
    [randomUUID(), actor, action, input?.subject ?? null, input?.mutationId ?? null, input?.digest ?? null, input?.canWrite ?? null, input?.canExport ?? null])).rows[0];
    if (!(row?.occurred_at instanceof Date) || !Number.isFinite(row.occurred_at.getTime())) throw unavailable();
    return row.occurred_at.toISOString();
  }

  private async accessReceipt(client: PoolClient, actor: string, mutationId: string, digest: string): Promise<BusinessPlanAccessAck | null> {
    const previous = (await client.query<AccessReceiptRow>("SELECT request_digest,occurred_at FROM admin_business_plan_access_audit WHERE actor_user_id=$1 AND mutation_id=$2", [actor, mutationId])).rows[0];
    if (!previous) return null;
    if (previous.request_digest !== digest) throw new ConflictException("같은 접근 권한 요청 ID의 내용이 다릅니다. 새 요청 ID로 확인해주세요.");
    if (!(previous.occurred_at instanceof Date) || !Number.isFinite(previous.occurred_at.getTime())) throw unavailable();
    return { updatedAt: previous.occurred_at.toISOString(), replayed: true };
  }

  async read(actorUserId: string, exportRequested = false): Promise<BusinessPlanRecord> {
    return this.transaction(async (client) => {
      const role = await this.requireActor(client, actorUserId);
      const row = await this.load(client);
      const access = await this.access(client, actorUserId, role, row);
      if (exportRequested ? !access.canExport : !access.canRead && !access.canClaimOwnership) throw denied();
      if (access.canRead) await this.auditAccess(client, actorUserId, exportRequested ? "export" : "read");
      return record(row, access);
    });
  }

  async claim(actorUserId: string, mutationId: string): Promise<BusinessPlanRecord> {
    return this.transaction(async (client) => {
      const role = await this.requireActor(client, actorUserId);
      if (role !== "admin") throw denied();
      await client.query("INSERT INTO admin_business_plan(id,revision) VALUES(1,0) ON CONFLICT(id) DO NOTHING");
      const row = await this.load(client, true);
      if (!row) throw unavailable();
      const access = await this.access(client, actorUserId, role, row);
      if (!access.canClaimOwnership && !access.canManageAccess) throw denied();
      const digest = businessPlanDigest({ action: "claim", mutationId });
      if (await this.accessReceipt(client, actorUserId, mutationId, digest)) {
        await this.auditAccess(client, actorUserId, "read");
        return record(row, access);
      }
      if (!access.canClaimOwnership) throw denied();
      await client.query("UPDATE admin_business_plan SET owner_user_id=$1 WHERE id=1", [actorUserId]);
      await this.auditAccess(client, actorUserId, "claim", { mutationId, digest });
      return record(row, { canRead: true, canWrite: true, canExport: true, canManageAccess: true, canClaimOwnership: false });
    });
  }

  async listAccess(actorUserId: string): Promise<BusinessPlanAccessList> {
    return this.transaction(async (client) => {
      const role = await this.requireActor(client, actorUserId);
      const row = await this.load(client);
      if (!(await this.access(client, actorUserId, role, row)).canManageAccess || !row?.owner_user_id) throw denied();
      const grants = (await client.query<GrantRow>("SELECT user_id,can_write,can_export,updated_at FROM admin_business_plan_grant WHERE revoked_at IS NULL ORDER BY user_id")).rows;
      await this.auditAccess(client, actorUserId, "access-list");
      return { ownerUserId: row.owner_user_id, grants: grants.map((grant) => ({ userId: grant.user_id, canRead: true, canWrite: grant.can_write, canExport: grant.can_export, updatedAt: grant.updated_at.toISOString() })) };
    });
  }

  async changeAccess(actorUserId: string, input: ChangeBusinessPlanAccessRequest): Promise<BusinessPlanAccessAck> {
    return this.transaction(async (client) => {
      const role = await this.requireActor(client, actorUserId);
      const row = await this.load(client, true);
      if (!(await this.access(client, actorUserId, role, row)).canManageAccess || input.userId === row?.owner_user_id) throw denied();
      const digest = businessPlanDigest({ action: "grant", ...input });
      const previous = await this.accessReceipt(client, actorUserId, input.mutationId, digest);
      if (previous) return previous;
      if (input.canRead) await this.requireActor(client, input.userId);
      const updatedAt = await this.auditAccess(client, actorUserId, input.canRead ? "grant" : "revoke", { mutationId: input.mutationId, digest, subject: input.userId, canWrite: input.canWrite, canExport: input.canExport });
      await client.query(`INSERT INTO admin_business_plan_grant(user_id,can_write,can_export,granted_by,updated_at,revoked_at)
        VALUES($1,$2,$3,$4,$5,CASE WHEN $6::boolean THEN NULL ELSE $5::timestamptz END)
        ON CONFLICT(user_id) DO UPDATE SET can_write=EXCLUDED.can_write,can_export=EXCLUDED.can_export,
          granted_by=EXCLUDED.granted_by,updated_at=EXCLUDED.updated_at,revoked_at=EXCLUDED.revoked_at`,
      [input.userId, input.canWrite, input.canExport, actorUserId, updatedAt, input.canRead]);
      return { updatedAt, replayed: false };
    });
  }

  async save(actorUserId: string, input: SaveBusinessPlanRequest): Promise<BusinessPlanRecord> {
    return this.transaction(async (client) => {
      // 재전송도 현재 역할을 다시 확인한다. 철회된 권한으로 이전 원문을 가져올 수 없다.
      const role = await this.requireActor(client, actorUserId);
      const currentRow = await this.load(client, true);
      const access = await this.access(client, actorUserId, role, currentRow);
      if (!access.canWrite || !currentRow) throw denied();
      const digest = businessPlanDigest(input);
      const previous = (await client.query<ReceiptRow>(
        "SELECT request_digest,accepted_revision FROM admin_business_plan_receipt WHERE actor_user_id=$1 AND mutation_id=$2", [actorUserId, input.mutationId],
      )).rows[0];
      if (previous) {
        if (previous.request_digest !== digest) {
          throw new ConflictException({ code: "business_plan_mutation_reused", currentRevision: currentRow.revision, message: "같은 저장 요청 ID의 내용이 다릅니다. 최신 보드를 확인한 뒤 새 요청으로 저장해주세요." });
        }
        const snapshot = (await client.query<BoardRow>(
          "SELECT revision,payload,created_at AS updated_at FROM admin_business_plan_revision WHERE revision=$1", [previous.accepted_revision],
        )).rows[0];
        if (!snapshot) throw unavailable();
        await this.auditAccess(client, actorUserId, "read");
        return record(snapshot, access);
      }
      const current = record(currentRow, access);
      if (current.revision !== input.expectedRevision) throw conflict(current.revision);
      const revision = current.revision + 1;
      // 서버 기록 시각은 DB에서 생성한다. 보드의 과거 검증일·백업 시각은 원문 메타데이터로 보존한다.
      const saved = (await client.query<BoardRow>(
        "UPDATE admin_business_plan SET revision=$1,payload=$2::jsonb,updated_at=clock_timestamp() WHERE id=1 RETURNING revision,payload,updated_at",
        [revision, JSON.stringify(input.board)],
      )).rows[0];
      const result = record(saved, access);
      await client.query(
        "INSERT INTO admin_business_plan_revision(revision,payload,created_at) VALUES($1,$2::jsonb,$3)",
        [revision, JSON.stringify(result.board), result.updatedAt],
      );
      await client.query(
        "INSERT INTO admin_business_plan_audit(revision,actor_user_id,before_digest,after_digest,occurred_at) VALUES($1,$2,$3,$4,$5)",
        [revision, actorUserId, businessPlanDigest(current.board), businessPlanDigest(result.board), result.updatedAt],
      );
      await client.query(
        "INSERT INTO admin_business_plan_receipt(actor_user_id,mutation_id,request_digest,accepted_revision,created_at) VALUES($1,$2,$3,$4,$5)",
        [actorUserId, input.mutationId, digest, revision, result.updatedAt],
      );
      return result;
    });
  }
}
