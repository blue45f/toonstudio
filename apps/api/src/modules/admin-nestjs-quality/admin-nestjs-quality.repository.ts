import { createHash } from "node:crypto";
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable,
  NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import {
  parseNestBoardDocument, type NestBoardDocument, type NestBoardHistoryDetail,
  type NestBoardHistorySummary, type NestBoardMutation, type NestBoardView,
} from "@toonstudio/contracts/admin-nestjs-quality";
import { createNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality-seed";

export const ADMIN_NESTJS_QUALITY_POOL = Symbol("ADMIN_NESTJS_QUALITY_POOL");
const REPOSITORY = "blue45f/toonstudio";
const HISTORY_LIMIT = 20;

interface BoardRow { revision: number; document: unknown; updated_at: Date }
interface HistoryRow {
  revision: number; actor_id: string; created_at: Date; reason: string;
  changed_task_ids: string[]; snapshot_changed: boolean;
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({ code: "nestjs_board_unavailable",
    message: "검증 보드 저장소를 사용할 수 없습니다. 저장된 기록을 대체하지 않고 다시 확인해주세요." });
}

export function nestBoardDigest(value: unknown): string {
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

function taskContent(task: NestBoardDocument["tasks"][number]): unknown {
  return Object.fromEntries(Object.entries(task).filter(([key]) => key !== "revision" && key !== "updatedAt"));
}

/** 수정 시각과 개별 항목 revision은 가져온 파일이나 브라우저가 정하지 않는다. */
export function stampNestBoardDocument(before: NestBoardDocument, input: NestBoardDocument, at: string) {
  const previous = new Map(before.tasks.map((task) => [task.id, task]));
  for (const task of before.tasks) {
    if (task.approvalRequired && !input.tasks.some((candidate) => candidate.id === task.id && candidate.approvalRequired)) {
      throw new BadRequestException("기존 승인 대기 항목을 삭제하거나 승인 요구를 해제할 수 없습니다.");
    }
  }
  const changedTaskIds = new Set<string>();
  const tasks = input.tasks.map((task) => {
    const saved = previous.get(task.id);
    if (saved && nestBoardDigest(taskContent(saved)) === nestBoardDigest(taskContent(task))) return saved;
    changedTaskIds.add(task.id);
    return { ...task, revision: (saved?.revision ?? 0) + 1, updatedAt: at };
  });
  const remaining = new Set(tasks.map((task) => task.id));
  for (const task of before.tasks) if (!remaining.has(task.id)) changedTaskIds.add(task.id);
  return { document: { ...input, tasks }, changedTaskIds: [...changedTaskIds],
    snapshotChanged: nestBoardDigest(before.snapshot) !== nestBoardDigest(input.snapshot) };
}

function summary(row: HistoryRow): NestBoardHistorySummary {
  return { revision: row.revision, actorId: row.actor_id, createdAt: row.created_at.toISOString(),
    reason: row.reason, changedTaskIds: row.changed_task_ids, snapshotChanged: row.snapshot_changed };
}

@Injectable()
export class AdminNestjsQualityRepository {
  constructor(@Inject(ADMIN_NESTJS_QUALITY_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    let client: PoolClient;
    try { client = await this.pool.connect(); }
    catch { throw unavailable(); }
    let broken = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); }
      catch { broken = true; }
      if (error instanceof HttpException) throw error;
      throw unavailable();
    } finally { client.release(broken); }
  }

  private async requireActor(client: PoolClient, actorId: string, mutation = false): Promise<boolean> {
    const row = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actorId])).rows[0];
    if (!row || (row.role !== "admin" && (mutation || row.role !== "operator"))) {
      throw new ForbiddenException("검증 보드 조회는 관리자·운영자, 변경은 관리자 권한이 필요합니다.");
    }
    return row.role === "admin";
  }

  private async current(client: PoolClient, lock = false) {
    const row = (await client.query<BoardRow>(
      `SELECT revision,document,updated_at FROM admin_nestjs_quality_board WHERE repository=$1${lock ? " FOR UPDATE" : ""}`,
      [REPOSITORY])).rows[0];
    if (!row) return { document: createNestBoardDocument(), revision: 0, updatedAt: null };
    return { document: parseNestBoardDocument(row.document, Date.now()), revision: row.revision,
      updatedAt: row.updated_at.toISOString() };
  }

  private async view(client: PoolClient, canEdit: boolean): Promise<NestBoardView> {
    const board = await this.current(client);
    const history = await client.query<HistoryRow>(
      `SELECT revision,actor_id,created_at,reason,changed_task_ids,snapshot_changed
       FROM admin_nestjs_quality_history WHERE repository=$1 ORDER BY revision DESC LIMIT $2`, [REPOSITORY, HISTORY_LIMIT]);
    return { ...board, canEdit, history: history.rows.map(summary) };
  }

  read(actorId: string): Promise<NestBoardView> {
    return this.transaction(async (client) => this.view(client, await this.requireActor(client, actorId)), true);
  }

  history(actorId: string, revision: number): Promise<NestBoardHistoryDetail> {
    return this.transaction(async (client) => {
      await this.requireActor(client, actorId);
      const row = (await client.query<HistoryRow & { before_document: unknown; after_document: unknown }>(
        `SELECT revision,actor_id,created_at,reason,changed_task_ids,snapshot_changed,before_document,after_document
         FROM admin_nestjs_quality_history WHERE repository=$1 AND revision=$2`, [REPOSITORY, revision])).rows[0];
      if (!row) throw new NotFoundException("변경 이력을 찾을 수 없습니다.");
      return { ...summary(row), before: parseNestBoardDocument(row.before_document, Date.now()),
        after: parseNestBoardDocument(row.after_document, Date.now()) };
    }, true);
  }

  save(actorId: string, input: NestBoardMutation): Promise<NestBoardView> {
    return this.transaction(async (client) => {
      await this.requireActor(client, actorId, true);
      // 첫 저장도 같은 행 잠금으로 직렬화한다. 충돌 시 초기 행 생성까지 함께 원복된다.
      await client.query(`INSERT INTO admin_nestjs_quality_board(repository,document,revision)
        VALUES($1,$2::jsonb,0) ON CONFLICT(repository) DO NOTHING`, [REPOSITORY, JSON.stringify(createNestBoardDocument())]);
      const before = await this.current(client, true);
      const requestDigest = nestBoardDigest(input);
      const prior = (await client.query<{ request_digest: string }>(
        `SELECT request_digest FROM admin_nestjs_quality_history WHERE repository=$1 AND actor_id=$2 AND mutation_id=$3`,
        [REPOSITORY, actorId, input.mutationId])).rows[0];
      if (prior) {
        if (prior.request_digest !== requestDigest) {
          throw new ConflictException({ code: "nestjs_board_mutation_conflict", message: "같은 요청 ID의 내용이 다릅니다." });
        }
        // 이전 요청의 재전송에도 현재 보드를 돌려주어 이미 더 진행된 화면을 되돌리지 않는다.
        return this.view(client, true);
      }
      if (before.revision !== input.expectedRevision) {
        throw new ConflictException({ code: "nestjs_board_conflict", currentRevision: before.revision,
          message: "다른 관리자가 보드를 변경했습니다. 초안을 내보낸 뒤 최신 기록과 비교해주세요." });
      }
      const now = (await client.query<{ at: Date }>("SELECT now() AS at")).rows[0].at;
      const change = stampNestBoardDocument(before.document, input.document, now.toISOString());
      try { change.document = parseNestBoardDocument(change.document, now.getTime()); }
      catch { throw new BadRequestException("서버 수정 정보를 포함한 문서가 저장 한도를 넘거나 올바르지 않습니다."); }
      const revision = before.revision + 1;
      await client.query(`UPDATE admin_nestjs_quality_board SET document=$2::jsonb,revision=$3,updated_by=$4,updated_at=$5
        WHERE repository=$1`, [REPOSITORY, JSON.stringify(change.document), revision, actorId, now]);
      await client.query(`INSERT INTO admin_nestjs_quality_history
        (repository,revision,actor_id,mutation_id,request_digest,reason,changed_task_ids,snapshot_changed,before_document,after_document,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11)`,
      [REPOSITORY, revision, actorId, input.mutationId, requestDigest, input.reason, JSON.stringify(change.changedTaskIds),
        change.snapshotChanged, JSON.stringify(before.document), JSON.stringify(change.document), now]);
      return this.view(client, true);
    });
  }
}
