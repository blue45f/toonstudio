import { createHash } from "node:crypto";
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException,
  Inject, Injectable, ServiceUnavailableException,
} from "@nestjs/common";
import {
  parseAiOperationsSave, parseAiOperationsSnapshot,
  type AiOperationsAudit, type AiOperationsSave, type AiOperationsView, type BoardSnapshot,
} from "@toonstudio/contracts/ai-operations";
import type { Pool, PoolClient } from "pg";

export const AI_OPERATIONS_POOL = Symbol("AI_OPERATIONS_POOL");

interface StoredBoard { revision: number; payload: unknown; updated_at: Date | null }
interface StoredReceipt { request_digest: string; accepted_revision: number }
type BoardRecord = { snapshot: BoardSnapshot | null; revision: number; updatedAt: string | null };

export function aiOperationsDigest(value: unknown): string {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, ordered(entry)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: "ai_operations_storage_unavailable",
    message: "운영 보드 저장소를 확인할 수 없습니다. 기존 기록을 초기화하지 않았습니다. 관리자에게 문의하세요.",
  });
}

function parseStored(row: StoredBoard | undefined): BoardRecord {
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0) throw unavailable();
  if (row.payload === null) {
    if (row.revision !== 0 || row.updated_at !== null) throw unavailable();
    return { snapshot: null, revision: 0, updatedAt: null };
  }
  if (row.revision === 0 || !(row.updated_at instanceof Date) || !Number.isFinite(row.updated_at.getTime())) {
    throw unavailable();
  }
  try {
    return { snapshot: parseAiOperationsSnapshot(row.payload), revision: row.revision, updatedAt: row.updated_at.toISOString() };
  } catch {
    throw unavailable();
  }
}

@Injectable()
export class AiOperationsRepository {
  constructor(@Inject(AI_OPERATIONS_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch { throw unavailable(); }
    let released = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      await client.query("SET LOCAL lock_timeout = '2000ms'");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      try { await client.query("ROLLBACK"); } catch {
        console.error("[admin-ai-operations] 트랜잭션 롤백 실패: 연결을 폐기합니다.");
        client.release(true);
        released = true;
      }
      if (cause instanceof HttpException) throw cause;
      throw unavailable();
    } finally {
      if (!released) client.release();
    }
  }

  private async requireActor(client: PoolClient, actor: string, writing: boolean): Promise<boolean> {
    const row = (await client.query<{ role: string }>(
      `SELECT lower(role) AS role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor],
    )).rows[0];
    if (!row || (row.role !== "admin" && row.role !== "operator") || (writing && row.role !== "admin")) {
      throw new ForbiddenException(writing ? "운영 보드 수정은 관리자만 할 수 있습니다." : "관리자 권한을 확인할 수 없습니다.");
    }
    return row.role === "admin";
  }

  private async load(client: PoolClient, lock: "share" | "update"): Promise<BoardRecord> {
    const suffix = lock === "update" ? " FOR UPDATE" : " FOR SHARE";
    const row = (await client.query<StoredBoard>(
      `SELECT revision,payload,updated_at FROM admin_ai_operations_board WHERE id=1${suffix}`,
    )).rows[0];
    return parseStored(row);
  }

  private async view(client: PoolClient, record: BoardRecord, canEdit: boolean): Promise<AiOperationsView> {
    const audit = (await client.query<AiOperationsAudit>(
      `SELECT revision,actor_user_id AS "actorUserId",before_digest AS "beforeDigest",after_digest AS "afterDigest",
        to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
       FROM admin_ai_operations_audit ORDER BY revision DESC LIMIT 50`,
    )).rows;
    const receipt = (await client.query<{ actor_user_id: string }>(
      `SELECT actor_user_id FROM admin_ai_operations_receipt WHERE accepted_revision=$1`, [record.revision],
    )).rows[0];
    if (record.revision === 0 ? audit.length > 0
      : audit[0]?.revision !== record.revision || audit[0]?.afterDigest !== aiOperationsDigest(record.snapshot)
        || receipt?.actor_user_id !== audit[0]?.actorUserId) {
      throw unavailable();
    }
    return { ...record, canEdit, audit };
  }

  read(actor: string): Promise<AiOperationsView> {
    return this.transaction(async (client) => {
      const canEdit = await this.requireActor(client, actor, false);
      return this.view(client, await this.load(client, "share"), canEdit);
    });
  }

  save(actor: string, rawInput: AiOperationsSave): Promise<AiOperationsView> {
    return this.transaction(async (client) => {
      await this.requireActor(client, actor, true);
      let input: AiOperationsSave;
      try { input = parseAiOperationsSave(rawInput); } catch (cause) {
        throw new BadRequestException(cause instanceof Error ? cause.message : "입력 형식을 확인하세요.");
      }
      const record = await this.load(client, "update");
      await this.view(client, record, true);
      const requestDigest = aiOperationsDigest(input);
      const receipt = (await client.query<StoredReceipt>(
        `SELECT request_digest,accepted_revision FROM admin_ai_operations_receipt WHERE actor_user_id=$1 AND mutation_id=$2`,
        [actor, input.mutationId],
      )).rows[0];
      if (receipt) {
        if (!Number.isSafeInteger(receipt.accepted_revision) || receipt.accepted_revision < 1
          || receipt.accepted_revision > record.revision) throw unavailable();
        if (receipt.request_digest !== requestDigest) throw new ConflictException("같은 저장 요청 ID의 내용이 다릅니다.");
        // 재시도는 새 이력을 만들지 않고 현재 저장본을 반환한다. 회수된 권한은 위에서 다시 거부한다.
        return this.view(client, record, true);
      }
      if (record.revision !== input.expectedRevision) {
        throw new ConflictException({ code: "ai_operations_revision_conflict", currentRevision: record.revision,
          message: "다른 관리자가 기록을 변경했습니다. 입력을 백업한 뒤 최신 저장본을 다시 읽으세요." });
      }
      try { input = parseAiOperationsSave(input, record.snapshot); } catch (cause) {
        throw new BadRequestException(cause instanceof Error ? cause.message : "승인 대기와 근거 제한을 확인하세요.");
      }
      const revision = record.revision + 1;
      const saved = (await client.query<StoredBoard>(
        `UPDATE admin_ai_operations_board SET revision=$1,payload=$2::jsonb,updated_at=now()
         WHERE id=1 AND revision=$3 RETURNING revision,payload,updated_at`,
        [revision, JSON.stringify(input.snapshot), record.revision],
      )).rows[0];
      if (!saved) throw new ConflictException("저장본이 변경되었습니다. 최신 기록을 다시 읽으세요.");
      await client.query(
        `INSERT INTO admin_ai_operations_audit(revision,actor_user_id,before_digest,after_digest) VALUES($1,$2,$3,$4)`,
        [revision, actor, aiOperationsDigest(record.snapshot), aiOperationsDigest(input.snapshot)],
      );
      await client.query(
        `INSERT INTO admin_ai_operations_receipt(actor_user_id,mutation_id,request_digest,accepted_revision) VALUES($1,$2,$3,$4)`,
        [actor, input.mutationId, requestDigest, revision],
      );
      return this.view(client, parseStored(saved), true);
    });
  }
}
