import { createHash } from "node:crypto";

import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  parseFinalSubmissionBoard,
  type BoardState, type FinalSubmissionRecord, type HistoryEntry, type SaveFinalSubmissionRequest,
} from "@toonstudio/contracts/final-submission";
import type { Pool, PoolClient } from "pg";

import { parseSaveFinalSubmissionRequest } from "./final-submission.dto";

export const FINAL_SUBMISSION_POOL = Symbol("FINAL_SUBMISSION_POOL");
interface StoredBoard { revision: number; payload: unknown; updated_at: Date | null }
interface StoredHistory { mutation_id: string; revision: number; occurred_at: Date; summary: string }
interface Receipt { request_digest: string; accepted_revision: number }

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({ code: "final_submission_storage_unavailable", message: "최종 제출 점검 저장소를 사용할 수 없습니다. 서버 연결과 migration 준비 상태를 확인해 주세요. 기존 기록은 초기화하지 않습니다." });
}

function conflict(revision: number, message = "다른 기기에서 기록이 변경되었습니다. 현재 입력을 보관하고 최신 저장본을 다시 확인해 주세요."): ConflictException {
  return new ConflictException({ code: "final_submission_conflict", currentRevision: revision, message });
}

export function finalSubmissionDigest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === "object") return Object.fromEntries(Object.entries(item)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, stable(entry)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function decode(row: StoredBoard | undefined): Pick<FinalSubmissionRecord, "board" | "revision" | "updatedAt"> {
  if (!row) return { board: null, revision: 0, updatedAt: null };
  if (!Number.isInteger(row.revision) || row.revision < 0 || row.revision > 2_147_483_647) throw unavailable();
  if (row.revision === 0 && row.payload === null && row.updated_at === null) return { board: null, revision: 0, updatedAt: null };
  if (!(row.updated_at instanceof Date) || !Number.isFinite(row.updated_at.getTime()) || row.revision === 0) throw unavailable();
  const parsed = parseFinalSubmissionBoard(row.payload);
  const updatedAt = row.updated_at.toISOString();
  if (!parsed.ok || parsed.value.revision !== row.revision || parsed.value.updatedAt !== updatedAt) throw unavailable();
  return { board: parsed.value, revision: row.revision, updatedAt };
}

/** 활성 계정별 저장 범위를 고정한다. 다른 관리자 자료를 읽거나 공유하는 API는 없다. */
@Injectable()
export class FinalSubmissionRepository {
  constructor(@Inject(FINAL_SUBMISSION_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let discard = false;
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
        try { await client.query("ROLLBACK"); } catch { discard = true; }
      }
      // SQL·연결 문자열·사용자 입력은 오류 응답과 로그에 포함하지 않는다.
      if (error instanceof HttpException) throw error;
      throw unavailable();
    } finally { client?.release(discard); }
  }

  private async requireOwner(client: PoolClient, actor: string): Promise<void> {
    if (typeof actor !== "string" || !actor || actor.trim() !== actor || actor.length > 255
      || [...actor].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new ForbiddenException("관리자 로그인이 필요합니다.");
    const user = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor],
    )).rows[0];
    if (user?.role !== "admin" && user?.role !== "operator") throw new ForbiddenException("활성 관리자·운영자만 본인의 최종 제출 점검 기록을 사용할 수 있습니다.");
    // 트랜잭션이 끝나면 사라지는 RLS 컨텍스트다. 연결 풀의 다음 사용자에게 남지 않는다.
    await client.query("SELECT set_config('toonstudio.final_submission_owner', $1, true)", [actor]);
  }

  private async ready(client: PoolClient): Promise<void> {
    // 최초 GET도 이력·영수증까지 준비됐는지 확인하며 DDL이나 기본값 저장은 하지 않는다.
    await client.query(`SELECT board.owner_user_id,board.revision,board.payload,board.updated_at,
      audit.owner_user_id,audit.revision,audit.actor_user_id,audit.mutation_id,audit.summary,audit.before_digest,audit.after_digest,audit.occurred_at,
      receipt.owner_user_id,receipt.mutation_id,receipt.request_digest,receipt.accepted_revision
      FROM admin_final_submission board CROSS JOIN admin_final_submission_audit audit
      CROSS JOIN admin_final_submission_receipt receipt WHERE FALSE`);
  }

  private async load(client: PoolClient, actor: string, write = false): Promise<StoredBoard | undefined> {
    return (await client.query<StoredBoard>(
      `SELECT revision,payload,updated_at FROM admin_final_submission WHERE owner_user_id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [actor],
    )).rows[0];
  }

  private async snapshot(client: PoolClient, actor: string, row: StoredBoard | undefined): Promise<FinalSubmissionRecord> {
    const record = decode(row);
    if (record.board === null) return { ...record, ownerUserId: actor, history: [] };
    const rows = (await client.query<StoredHistory>(
      `SELECT mutation_id,revision,occurred_at,summary FROM admin_final_submission_audit
       WHERE owner_user_id=$1 AND revision<=$2 ORDER BY revision DESC LIMIT 100`, [actor, record.revision],
    )).rows;
    const history: HistoryEntry[] = rows.map((entry) => {
      if (!Number.isInteger(entry.revision) || entry.revision < 1 || entry.revision > record.revision
        || !(entry.occurred_at instanceof Date) || !Number.isFinite(entry.occurred_at.getTime())
        || typeof entry.summary !== "string" || !entry.summary.trim() || entry.summary.length > 500
        || typeof entry.mutation_id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(entry.mutation_id)) throw unavailable();
      return { id: entry.mutation_id, revision: entry.revision, changedAt: entry.occurred_at.toISOString(), summary: entry.summary };
    });
    if (history[0]?.revision !== record.revision || history[0].changedAt !== record.updatedAt) throw unavailable();
    return { ...record, ownerUserId: actor, history };
  }

  read(actor: string): Promise<FinalSubmissionRecord> {
    return this.transaction(async (client) => {
      await this.requireOwner(client, actor);
      await this.ready(client);
      return this.snapshot(client, actor, await this.load(client, actor));
    });
  }

  export(actor: string): Promise<FinalSubmissionRecord> {
    return this.read(actor);
  }

  save(actor: string, value: SaveFinalSubmissionRequest): Promise<FinalSubmissionRecord> {
    const input = parseSaveFinalSubmissionRequest(value);
    // 변경 요약도 요청의 일부다. 같은 ID로 다른 요약을 기록할 수 없다.
    const requestDigest = finalSubmissionDigest(input);
    return this.transaction(async (client) => {
      await this.requireOwner(client, actor);
      await this.ready(client);
      await client.query(`INSERT INTO admin_final_submission(owner_user_id) VALUES($1) ON CONFLICT(owner_user_id) DO NOTHING`, [actor]);
      const row = await this.load(client, actor, true);
      if (!row) throw unavailable();
      const current = decode(row);
      const previous = (await client.query<Receipt>(`SELECT request_digest,accepted_revision FROM admin_final_submission_receipt
        WHERE owner_user_id=$1 AND mutation_id=$2`, [actor, input.mutationId])).rows[0];
      if (previous) {
        if (previous.request_digest !== requestDigest) throw conflict(current.revision, "같은 저장 요청 ID의 내용이나 요약이 다릅니다. 입력을 보관하고 새 요청으로 저장해 주세요.");
        if (!Number.isInteger(previous.accepted_revision) || previous.accepted_revision < 1 || previous.accepted_revision > current.revision) throw unavailable();
        // 지연 재시도는 현재 원장을 반환해 다른 기기의 후속 편집을 되돌리지 않는다.
        return this.snapshot(client, actor, row);
      }
      if (current.revision !== input.expectedRevision || current.revision === 2_147_483_647) throw conflict(current.revision);
      const parsed = parseFinalSubmissionBoard(input.board, current.board ?? undefined);
      if (!parsed.ok) throw new BadRequestException({ code: "final_submission_invalid_transition", message: "승인 항목과 변경된 파일의 최종 확인 근거를 다시 검토해 주세요." });
      const now = (await client.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0]?.at;
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw unavailable();
      const at = now.toISOString();
      const oldTasks = new Map(current.board?.tasks.map((task) => [task.id, task]));
      const board: BoardState = {
        ...parsed.value, revision: current.revision + 1, updatedAt: at,
        tasks: parsed.value.tasks.map((task) => {
          const old = oldTasks.get(task.id);
          const changed = !old || finalSubmissionDigest({ ...old, updatedAt: "" }) !== finalSubmissionDigest({ ...task, updatedAt: "" });
          return { ...task, updatedAt: changed ? at : old.updatedAt };
        }),
      };
      // 서버 메타데이터를 반영한 결과도 전체 계약을 충족해야 저장한다.
      if (!parseFinalSubmissionBoard(board).ok) throw new BadRequestException("서버 시각을 반영한 기록의 형식·크기를 확인해 주세요.");
      const saved = (await client.query<StoredBoard>(`UPDATE admin_final_submission SET revision=$2,payload=$3::jsonb,updated_at=$4
        WHERE owner_user_id=$1 RETURNING revision,payload,updated_at`, [actor, board.revision, JSON.stringify(board), at])).rows[0];
      if (!saved) throw unavailable();
      await client.query(`INSERT INTO admin_final_submission_audit(owner_user_id,revision,actor_user_id,mutation_id,summary,before_digest,after_digest,occurred_at)
        VALUES($1,$2,$1,$3,$4,$5,$6,$7)`, [actor, board.revision, input.mutationId, input.summary, finalSubmissionDigest(current.board), finalSubmissionDigest(board), at]);
      await client.query(`INSERT INTO admin_final_submission_receipt(owner_user_id,mutation_id,request_digest,accepted_revision)
        VALUES($1,$2,$3,$4)`, [actor, input.mutationId, requestDigest, board.revision]);
      return this.snapshot(client, actor, saved);
    });
  }
}
