import { createHash } from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  boardSchema,
  cloudWorkboardResponseSchema,
  emptyBoard,
  type Board,
  type CloudWorkboardResponse,
  type CloudWorkboardSave,
} from "@toonstudio/contracts/admin-cloud-workboard";
import type { Pool, PoolClient } from "pg";

export const ADMIN_CLOUD_WORKBOARD_POOL = Symbol("ADMIN_CLOUD_WORKBOARD_POOL");
const BOARD_ID = "cloud-workboard-v1";
type StoredBoard = { payload: unknown; revision: string; stored_at: Date | null };
type AuditRow = { mutation_id: string; occurred_at: Date; task_count: number };

function digest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: "cloud_workboard_unavailable",
    message: "작업 보드 저장소를 확인할 수 없습니다. 데이터베이스 준비 상태를 확인해주세요.",
  });
}

function revisionOf(row: StoredBoard): number {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw unavailable();
  return revision;
}

@Injectable()
export class AdminCloudWorkboardRepository {
  constructor(@Inject(ADMIN_CLOUD_WORKBOARD_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let releaseError: Error | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          // 연결이 끊긴 클라이언트는 풀에서 폐기하고 저장소 오류만 노출한다.
          releaseError = rollbackError instanceof Error ? rollbackError : new Error("workboard rollback failed");
        }
      }
      if (releaseError) throw unavailable();
      if (error instanceof HttpException) throw error;
      throw unavailable();
    } finally {
      client?.release(releaseError);
    }
  }

  private async requireOwner(client: PoolClient, actor: string): Promise<void> {
    const row = (await client.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor],
    )).rows[0];
    if (row?.role !== "admin") {
      throw new ForbiddenException("활성 관리자 계정만 개인 작업 보드를 사용할 수 있습니다.");
    }
  }

  private async snapshot(client: PoolClient, actor: string, row: StoredBoard): Promise<CloudWorkboardResponse> {
    const revision = revisionOf(row);
    const parsed = boardSchema.safeParse(row.payload);
    if (!parsed.success) throw unavailable();
    const audit = (await client.query<AuditRow>(
      `SELECT mutation_id,occurred_at,task_count FROM admin_cloud_workboard_audit
       WHERE owner_user_id=$1 AND board_id=$2 AND revision<=$3
       ORDER BY revision DESC LIMIT 200`, [actor, BOARD_ID, revision],
    )).rows.map((entry) => ({
      id: entry.mutation_id,
      at: entry.occurred_at.toISOString(),
      taskId: BOARD_ID,
      title: "개인 작업 보드 저장",
      detail: `작업 ${entry.task_count}개를 저장했습니다. 외부 작업은 실행하지 않았습니다.`,
    }));
    const result = cloudWorkboardResponseSchema.safeParse({
      board: { ...parsed.data, audit }, revision, storedAt: row.stored_at?.toISOString() ?? null,
    });
    if (!result.success) throw unavailable();
    return result.data;
  }

  async read(actor: string): Promise<CloudWorkboardResponse> {
    return this.transaction(async (client) => {
      await this.requireOwner(client, actor);
      const row = (await client.query<StoredBoard>(
        `SELECT payload,revision::text,stored_at FROM admin_cloud_workboard
         WHERE owner_user_id=$1 AND board_id=$2 FOR SHARE`, [actor, BOARD_ID],
      )).rows[0];
      // 최초 조회는 개인 행을 만들지 않는다. 실제 저장은 명시적 POST만 수행한다.
      return row ? this.snapshot(client, actor, row) : { board: emptyBoard(), revision: 0, storedAt: null };
    });
  }

  async save(actor: string, input: CloudWorkboardSave): Promise<CloudWorkboardResponse> {
    // 가져온 파일의 감사 배열은 서버 감사 이력으로 승격하지 않는다.
    const board: Board = { ...input.board, audit: [] };
    const requestDigest = digest({ ...input, board });
    return this.transaction(async (client) => {
      await this.requireOwner(client, actor);
      // 동일 소유자의 최초 저장도 PK 충돌 대기와 행 잠금으로 직렬화한다.
      await client.query(
        `INSERT INTO admin_cloud_workboard(owner_user_id,board_id,payload)
         VALUES($1,$2,$3::jsonb) ON CONFLICT(owner_user_id,board_id) DO NOTHING`,
        [actor, BOARD_ID, JSON.stringify(emptyBoard())],
      );
      const row = (await client.query<StoredBoard>(
        `SELECT payload,revision::text,stored_at FROM admin_cloud_workboard
         WHERE owner_user_id=$1 AND board_id=$2 FOR UPDATE`, [actor, BOARD_ID],
      )).rows[0];
      if (!row) throw unavailable();
      const previous = (await client.query<{ request_digest: string }>(
        `SELECT request_digest FROM admin_cloud_workboard_receipt
         WHERE owner_user_id=$1 AND board_id=$2 AND mutation_id=$3`, [actor, BOARD_ID, input.mutationId],
      )).rows[0];
      if (previous) {
        if (previous.request_digest !== requestDigest) {
          throw new ConflictException({ code: "cloud_workboard_conflict", message: "같은 저장 요청 ID의 내용이 다릅니다." });
        }
        // 늦은 재요청으로 다른 기기의 후속 편집을 되돌리지 않도록 현재 스냅샷을 반환한다.
        return this.snapshot(client, actor, row);
      }
      const revision = revisionOf(row);
      if (revision !== input.expectedRevision || revision === Number.MAX_SAFE_INTEGER) {
        throw new ConflictException({
          code: "cloud_workboard_conflict", currentRevision: revision,
          message: "다른 기기에서 보드를 변경했습니다. 최신 내용을 불러온 뒤 다시 저장해주세요.",
        });
      }
      const updated = (await client.query<StoredBoard>(
        `UPDATE admin_cloud_workboard SET payload=$3::jsonb,revision=revision+1,stored_at=clock_timestamp()
         WHERE owner_user_id=$1 AND board_id=$2 RETURNING payload,revision::text,stored_at`,
        [actor, BOARD_ID, JSON.stringify(board)],
      )).rows[0];
      if (!updated?.stored_at) throw unavailable();
      const acceptedRevision = revisionOf(updated);
      await client.query(
        `INSERT INTO admin_cloud_workboard_audit
         (owner_user_id,board_id,revision,actor_user_id,mutation_id,before_digest,after_digest,task_count,occurred_at)
         VALUES($1,$2,$3,$1,$4,$5,$6,$7,$8)`,
        [actor, BOARD_ID, acceptedRevision, input.mutationId, digest(row.payload), digest(board), board.tasks.length, updated.stored_at],
      );
      await client.query(
        `INSERT INTO admin_cloud_workboard_receipt(owner_user_id,board_id,mutation_id,request_digest,accepted_revision)
         VALUES($1,$2,$3,$4,$5)`, [actor, BOARD_ID, input.mutationId, requestDigest, acceptedRevision],
      );
      return this.snapshot(client, actor, updated);
    });
  }
}
