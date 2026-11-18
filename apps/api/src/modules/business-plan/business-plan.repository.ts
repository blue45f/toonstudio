import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { parseBusinessPlanState, type BusinessPlanRecord, type SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";
import type { Pool, PoolClient } from "pg";

export const BUSINESS_PLAN_POOL = Symbol("BUSINESS_PLAN_POOL");

interface BoardRow { revision: number; payload: unknown; updated_at: Date | null }
interface ReceiptRow { request_digest: string; accepted_revision: number }

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

function record(row: BoardRow | undefined): BusinessPlanRecord {
  if (!row) return { board: null, revision: 0, updatedAt: null };
  if (row.revision === 0 && row.payload === null && row.updated_at === null) return { board: null, revision: 0, updatedAt: null };
  if (!Number.isInteger(row.revision) || row.revision < 1 || !(row.updated_at instanceof Date) || !Number.isFinite(row.updated_at.getTime())) throw unavailable();
  const board = parseBusinessPlanState(row.payload);
  if (!board.ok) throw unavailable();
  return { board: board.value, revision: row.revision, updatedAt: row.updated_at.toISOString() };
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

  private async requireAdmin(client: PoolClient, actorUserId: string): Promise<void> {
    const user = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actorUserId],
    )).rows[0];
    if (user?.role !== "admin") throw new ForbiddenException("사업계획서 보드는 활성 서비스 관리자만 이용할 수 있습니다.");
  }

  async read(actorUserId: string): Promise<BusinessPlanRecord> {
    return this.transaction(async (client) => {
      await this.requireAdmin(client, actorUserId);
      const row = (await client.query<BoardRow>("SELECT revision,payload,updated_at FROM admin_business_plan WHERE id=1")).rows[0];
      return record(row);
    });
  }

  async save(actorUserId: string, input: SaveBusinessPlanRequest): Promise<BusinessPlanRecord> {
    return this.transaction(async (client) => {
      // 재전송도 현재 역할을 다시 확인한다. 철회된 권한으로 이전 원문을 가져올 수 없다.
      await this.requireAdmin(client, actorUserId);
      await client.query("INSERT INTO admin_business_plan(id,revision) VALUES(1,0) ON CONFLICT(id) DO NOTHING");
      const currentRow = (await client.query<BoardRow>("SELECT revision,payload,updated_at FROM admin_business_plan WHERE id=1 FOR UPDATE")).rows[0];
      if (!currentRow) throw unavailable();
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
        return record(snapshot);
      }
      const current = record(currentRow);
      if (current.revision !== input.expectedRevision) throw conflict(current.revision);
      const revision = current.revision + 1;
      // 서버 기록 시각은 DB에서 생성한다. 보드의 과거 검증일·백업 시각은 원문 메타데이터로 보존한다.
      const saved = (await client.query<BoardRow>(
        "UPDATE admin_business_plan SET revision=$1,payload=$2::jsonb,updated_at=clock_timestamp() WHERE id=1 RETURNING revision,payload,updated_at",
        [revision, JSON.stringify(input.board)],
      )).rows[0];
      const result = record(saved);
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
