/**
 * op 채널 병행 로그 영속 — 방(work) 단위 append-only 로그.
 *
 * 패턴은 `studio-crdt.repository.ts`를 그대로 따른다:
 *  - 작품 단위 transaction advisory lock이 영속의 linearization 지점이다
 *    (네임스페이스만 op 로그 전용으로 분리해 CRDT append와 서로 막지 않는다).
 *  - seq는 PostgreSQL identity가 부여한다 — 두 API 노드가 같은 방에 써도
 *    커밋 순서와 seq 순서가 어긋나지 않는다.
 *  - (workId, opId) 유니크가 dedupe 정본이다. 재제출은 기존 seq를 돌려준다.
 * 차이점: op 로그는 검증·복제 용도의 병행 기록으로 시작하므로(HOST_INSERTION_SPEC 2)
 * v1에서는 로그 본문을 압축·삭제하지 않는다. 스냅샷은 hydrate 가속용 기준점일 뿐,
 * opId 집합은 스냅샷 행에 함께 저장해 계약 요구 1(스냅샷 opId 포함)을
 * 재시작 뒤에도 지킨다.
 */

import { and, asc, eq, gt, sql } from "drizzle-orm";

import {
  creatorWorkOpLogs,
  creatorWorkOpSnapshots,
  db,
} from "../../platform/database";

import type {
  SequencedStudioLiveOp,
  StudioLiveOp,
  StudioLiveOpAppendResult,
  StudioLiveOpLogStore,
  StudioLiveOpStoredSnapshot,
} from "./studio-live-op";
import type {
  DrizzleStudioCrdtTransaction,
} from "./studio-crdt.repository";

export const STUDIO_LIVE_OP_REPOSITORY = Symbol("STUDIO_LIVE_OP_REPOSITORY");
export const STUDIO_OP_ADVISORY_LOCK_NAMESPACE = "toonspectrum:creator-work-op-log:v1:";

export function studioLiveOpWorkAdvisoryLockQuery(workId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`${STUDIO_OP_ADVISORY_LOCK_NAMESPACE}${workId}`}, 0))`;
}

async function withStudioLiveOpWorkMutationLock<T>(
  transaction: DrizzleStudioCrdtTransaction,
  workId: string,
  operation: () => Promise<T>
): Promise<T> {
  await transaction.execute(studioLiveOpWorkAdvisoryLockQuery(workId));
  return operation();
}

function storedOp(row: typeof creatorWorkOpLogs.$inferSelect): SequencedStudioLiveOp {
  return { ...(row.op as StudioLiveOp), seq: Number(row.sequence) };
}

/** PostgreSQL-backed op 로그. */
export class DrizzleStudioLiveOpLogStore implements StudioLiveOpLogStore {
  async appendOp(
    workId: string,
    op: StudioLiveOp,
    actorUserId: string
  ): Promise<StudioLiveOpAppendResult> {
    return db.transaction((transaction) =>
      withStudioLiveOpWorkMutationLock(transaction, workId, async () => {
        const [existing] = await transaction
          .select()
          .from(creatorWorkOpLogs)
          .where(
            and(eq(creatorWorkOpLogs.workId, workId), eq(creatorWorkOpLogs.opId, op.opId))
          )
          .limit(1);
        if (existing) return { inserted: false, op: storedOp(existing) };

        const [inserted] = await transaction
          .insert(creatorWorkOpLogs)
          .values({
            workId,
            opId: op.opId,
            actorId: op.actorId,
            actorUserId,
            op: op as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing({
            target: [creatorWorkOpLogs.workId, creatorWorkOpLogs.opId],
          })
          .returning();
        if (!inserted) {
          const [conflicting] = await transaction
            .select()
            .from(creatorWorkOpLogs)
            .where(
              and(
                eq(creatorWorkOpLogs.workId, workId),
                eq(creatorWorkOpLogs.opId, op.opId)
              )
            )
            .limit(1);
          if (!conflicting) throw new Error("studio op log record disappeared");
          return { inserted: false, op: storedOp(conflicting) };
        }
        return { inserted: true, op: storedOp(inserted) };
      })
    );
  }

  async listOpsAfter(workId: string, afterSeq: number): Promise<SequencedStudioLiveOp[]> {
    const rows = await db
      .select()
      .from(creatorWorkOpLogs)
      .where(
        and(
          eq(creatorWorkOpLogs.workId, workId),
          gt(creatorWorkOpLogs.sequence, BigInt(afterSeq))
        )
      )
      .orderBy(asc(creatorWorkOpLogs.sequence));
    return rows.map(storedOp);
  }

  async loadSnapshot(workId: string): Promise<StudioLiveOpStoredSnapshot | null> {
    const [row] = await db
      .select()
      .from(creatorWorkOpSnapshots)
      .where(eq(creatorWorkOpSnapshots.workId, workId))
      .limit(1);
    if (!row) return null;
    const snapshot = row.snapshot as unknown as StudioLiveOpStoredSnapshot;
    return { seq: Number(row.seq), state: snapshot.state, opIds: snapshot.opIds };
  }

  async saveSnapshot(workId: string, snapshot: StudioLiveOpStoredSnapshot): Promise<void> {
    await db.transaction((transaction) =>
      withStudioLiveOpWorkMutationLock(transaction, workId, async () => {
        await transaction
          .insert(creatorWorkOpSnapshots)
          .values({
            workId,
            seq: BigInt(snapshot.seq),
            snapshot: snapshot as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: creatorWorkOpSnapshots.workId,
            set: {
              seq: BigInt(snapshot.seq),
              snapshot: snapshot as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            },
            setWhere: sql`${creatorWorkOpSnapshots.seq} < ${BigInt(snapshot.seq)}`,
          });
      })
    );
  }
}

export const studioLiveOpLogStoreProvider = {
  provide: STUDIO_LIVE_OP_REPOSITORY,
  useFactory: (): StudioLiveOpLogStore => new DrizzleStudioLiveOpLogStore(),
};

/** 인메모리 구현은 프레임워크 무의존 코어에 있다 (통합 테스트가 그대로 쓴다). */
export { InMemoryStudioLiveOpLogStore } from "./studio-live-op";
