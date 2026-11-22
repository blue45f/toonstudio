import { describe, expect, it } from "vitest";

import { createOfflineFirstSyncBridge } from "../localization-sync-pro/studio-offline-first-sync-bridge";
import {
  computeOfflineSyncRetryDelayMs,
  deriveOfflineSyncIdempotencyKey,
  mergeOfflineSyncQueue,
  offlineSyncCutKey,
  planOfflineSyncRetrySchedule,
  type OfflineSyncQueueEntry,
} from "./studio-offline-sync-queue-merger";

function entry(overrides: Partial<OfflineSyncQueueEntry> & { opId: string }): OfflineSyncQueueEntry {
  const surface = overrides.surface ?? "tooning-plus";
  const cutId = overrides.cutId ?? "cut-01";
  const kind = overrides.kind ?? "patch";
  const causalSequence = overrides.causalSequence ?? 1;
  const actorId = overrides.actorId ?? "author-local";
  const patch = overrides.patch ?? { balloons: 1 };
  return {
    opId: overrides.opId,
    idempotencyKey:
      overrides.idempotencyKey ??
      deriveOfflineSyncIdempotencyKey({ surface, cutId, kind, causalSequence, actorId, patch }),
    surface,
    cutId,
    kind,
    causalSequence,
    ...(overrides.revision !== undefined ? { revision: overrides.revision } : {}),
    patch,
    actorId,
    createdAtMs: overrides.createdAtMs ?? 1_000 + causalSequence * 10,
    ...(overrides.retryCount !== undefined ? { retryCount: overrides.retryCount } : {}),
    ...(overrides.maxRetries !== undefined ? { maxRetries: overrides.maxRetries } : {}),
    ...(overrides.nextRetryAtMs !== undefined ? { nextRetryAtMs: overrides.nextRetryAtMs } : {}),
    ...(overrides.lastError !== undefined ? { lastError: overrides.lastError } : {}),
  };
}

describe("studio-offline-sync-queue-merger · 인과 순서 및 멱등 키 중복 제거", () => {
  it("뒤섞여 도착한 OPFS 큐를 인과 순서(causalSequence)로 정렬하고 동일 멱등 키를 중복 제거한다", () => {
    const dupKey = "idem:cut-02:stroke:v1";
    const result = mergeOfflineSyncQueue([
      entry({ opId: "op-3", cutId: "cut-03", causalSequence: 3, patch: { title: "3컷" } }),
      entry({ opId: "op-2-dup", cutId: "cut-02", causalSequence: 2, idempotencyKey: dupKey, patch: { balloons: 2 } }),
      entry({ opId: "op-1", cutId: "cut-01", causalSequence: 1, patch: { title: "1컷" } }),
      entry({ opId: "op-2-orig", cutId: "cut-02", causalSequence: 2, idempotencyKey: dupKey, patch: { balloons: 2 } }),
    ]);

    expect(result.inputCount).toBe(4);
    expect(result.deduplicatedCount).toBe(1);
    expect(result.conflictCount).toBe(0);
    expect(result.operations.map((op) => op.cutId)).toEqual(["cut-01", "cut-02", "cut-03"]);
    expect(result.operations.map((op) => op.causalSequence)).toEqual([1, 2, 3]);
    expect(result.droppedDuplicateOpIds).toEqual(["op-2-orig"]);
  });

  it("이미 서버에 반영된 acknowledgedIdempotencyKeys 작업은 재접속 시 전송 대상에서 제외한다", () => {
    const alreadySynced = entry({
      opId: "op-old",
      cutId: "cut-01",
      causalSequence: 1,
      idempotencyKey: "idem:already-acked",
      patch: { balloons: 1 },
    });
    const fresh = entry({
      opId: "op-new",
      cutId: "cut-02",
      causalSequence: 2,
      idempotencyKey: "idem:fresh-op",
      patch: { balloons: 5 },
    });

    const result = mergeOfflineSyncQueue([alreadySynced, fresh], {
      acknowledgedIdempotencyKeys: new Set(["idem:already-acked"]),
    });

    expect(result.deduplicatedCount).toBe(1);
    expect(result.droppedDuplicateOpIds).toEqual(["op-old"]);
    expect(result.operations.map((op) => op.opId)).toEqual(["op-new"]);
  });

  it("동일 멱등 키가 상이한 페이로드에 재사용되면 변조 충돌을 명시적으로 반환한다", () => {
    const result = mergeOfflineSyncQueue([
      entry({ opId: "op-a", cutId: "cut-01", causalSequence: 1, idempotencyKey: "idem:reused", patch: { balloons: 2 } }),
      entry({ opId: "op-b", cutId: "cut-01", causalSequence: 2, idempotencyKey: "idem:reused", patch: { balloons: 9 } }),
    ]);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.patch).toEqual({ balloons: 2 });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      code: "duplicate-idempotency-divergence",
      conflictingOpId: "op-b",
      idempotencyKey: "idem:reused",
      conflictingFields: ["balloons"],
      resolutionRequired: "inspect-duplicate-key",
    });
  });
});

describe("studio-offline-sync-queue-merger · 동일 컷 최신 개정 압축 및 삭제 후 수정 충돌", () => {
  it("동일 컷의 연속 patch를 최신 개정 우선으로 병합·압축하고, 구 개정이 늦게 와도 최신 필드를 덮어쓰지 않는다", () => {
    const result = mergeOfflineSyncQueue([
      entry({
        opId: "op-rev1",
        cutId: "cut-07",
        causalSequence: 1,
        revision: 1,
        patch: { title: "초안", balloons: 2, dpi: 300 },
      }),
      entry({
        opId: "op-rev3",
        cutId: "cut-07",
        causalSequence: 2,
        revision: 3,
        patch: { title: "최종 대사", balloons: 5 },
      }),
      // 다른 탭에서 지연 기록된 구 개정(revision 2 < 3)
      entry({
        opId: "op-rev2-stale",
        cutId: "cut-07",
        causalSequence: 3,
        revision: 2,
        patch: { title: "오래된 초안", tone: "dramatic" },
      }),
    ]);

    expect(result.operations).toHaveLength(1);
    expect(result.compactedCount).toBe(2);
    expect(result.operations[0]).toMatchObject({
      opId: "op-rev3",
      revision: 3,
      compactedCount: 2,
      mergedOpIds: ["op-rev1", "op-rev3", "op-rev2-stale"],
      patch: {
        title: "최종 대사",
        balloons: 5,
        dpi: 300,
        tone: "dramatic",
      },
    });
  });

  it("동일 컷에서 수정 후 삭제가 이어지면 단일 delete 작업으로 압축한다", () => {
    const result = mergeOfflineSyncQueue([
      entry({ opId: "op-edit", cutId: "cut-10", causalSequence: 1, kind: "patch", patch: { title: "임시 컷" } }),
      entry({ opId: "op-del-1", cutId: "cut-10", causalSequence: 2, kind: "delete", patch: {} }),
      entry({ opId: "op-del-2", cutId: "cut-10", causalSequence: 3, kind: "delete", patch: {} }),
    ]);

    expect(result.conflictCount).toBe(0);
    expect(result.compactedCount).toBe(2);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      opId: "op-del-2",
      kind: "delete",
      patch: {},
      mergedOpIds: ["op-edit", "op-del-1", "op-del-2"],
    });
  });

  it("삭제 후 수정(modify-after-delete) 충돌을 자동 덮어쓰기 없이 명시적으로 반환한다", () => {
    const result = mergeOfflineSyncQueue([
      entry({ opId: "op-del", cutId: "cut-04", causalSequence: 10, kind: "delete", patch: {} }),
      entry({
        opId: "op-late-edit",
        cutId: "cut-04",
        causalSequence: 11,
        kind: "patch",
        patch: { balloons: 6, localized: true },
      }),
    ]);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.kind).toBe("delete");
    expect(result.operations[0]?.opId).toBe("op-del");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      code: "modify-after-delete",
      surface: "tooning-plus",
      cutId: "cut-04",
      deleteOpId: "op-del",
      deleteCausalSequence: 10,
      conflictingOpId: "op-late-edit",
      conflictingCausalSequence: 11,
      conflictingFields: ["balloons", "localized"],
      resolutionRequired: "manual-restore-or-discard",
    });
  });

  it("외부 삭제 툼스톤이 존재하는 컷에 대한 수정도 삭제 후 수정 충돌로 차단하며, allowRecreateAfterDelete는 upsert만 허용한다", () => {
    const tombstones = new Map([[offlineSyncCutKey("tooning-plus", "cut-99"), { opId: "op-remote-del", causalSequence: 5 }]]);
    const patchAfterTombstone = entry({
      opId: "op-patch-99",
      cutId: "cut-99",
      causalSequence: 6,
      kind: "patch",
      patch: { balloons: 1 },
    });
    const upsertAfterTombstone = entry({
      opId: "op-recreate-99",
      cutId: "cut-99",
      causalSequence: 7,
      kind: "upsert",
      patch: { balloons: 3, title: "복원 컷" },
    });

    const strict = mergeOfflineSyncQueue([patchAfterTombstone, upsertAfterTombstone], {
      deletedCutTombstones: tombstones,
    });
    expect(strict.operations).toHaveLength(0);
    expect(strict.conflicts).toHaveLength(2);
    expect(strict.conflicts.every((c) => c.code === "modify-after-delete")).toBe(true);

    const allowRecreate = mergeOfflineSyncQueue([patchAfterTombstone, upsertAfterTombstone], {
      deletedCutTombstones: tombstones,
      allowRecreateAfterDelete: true,
    });
    expect(allowRecreate.conflicts).toHaveLength(1);
    expect(allowRecreate.conflicts[0]?.conflictingOpId).toBe("op-patch-99");
    expect(allowRecreate.operations).toHaveLength(1);
    expect(allowRecreate.operations[0]?.opId).toBe("op-recreate-99");
    expect(allowRecreate.operations[0]?.kind).toBe("upsert");
  });
});

describe("studio-offline-sync-queue-merger · 지수 백오프 재시도 계획", () => {
  it("순수 지수 백오프 상한 클램프 및 결정론적 FNV-1a 지터를 계산한다", () => {
    expect(computeOfflineSyncRetryDelayMs(0)).toBe(1_000);
    expect(computeOfflineSyncRetryDelayMs(1)).toBe(2_000);
    expect(computeOfflineSyncRetryDelayMs(3)).toBe(8_000);
    expect(computeOfflineSyncRetryDelayMs(10, { baseDelayMs: 1_000, maxDelayMs: 30_000 })).toBe(30_000);

    const jitteredA = computeOfflineSyncRetryDelayMs(2, { baseDelayMs: 1_000, jitterRatio: 0.25 }, "idem:cut-01:2");
    const jitteredB = computeOfflineSyncRetryDelayMs(2, { baseDelayMs: 1_000, jitterRatio: 0.25 }, "idem:cut-01:2");
    expect(jitteredA).toBe(jitteredB);
    expect(jitteredA).toBeGreaterThanOrEqual(3_000);
    expect(jitteredA).toBeLessThanOrEqual(5_000);
  });

  it("재시도 한도 미만은 retrying으로, 한도 도달은 failed로 분류하고 최단 재시도 시각을 계산한다", () => {
    const schedule = planOfflineSyncRetrySchedule(
      [
        entry({ opId: "op-retry-1", cutId: "cut-01", retryCount: 0, maxRetries: 4 }),
        entry({ opId: "op-retry-2", cutId: "cut-02", retryCount: 2, maxRetries: 4 }),
        entry({ opId: "op-exhausted", cutId: "cut-03", retryCount: 3, maxRetries: 4 }),
      ],
      {
        nowMs: 10_000,
        policy: { baseDelayMs: 1_000, maxDelayMs: 60_000, multiplier: 2, jitterRatio: 0 },
        failureReasons: new Map([
          ["op-retry-1", "503 Service Unavailable"],
          ["op-exhausted", "422 Unprocessable"],
        ]),
      },
    );

    expect(schedule.retryingCount).toBe(2);
    expect(schedule.exhaustedCount).toBe(1);
    expect(schedule.earliestNextRetryAtMs).toBe(12_000);
    expect(schedule.entries[0]).toMatchObject({
      opId: "op-retry-1",
      status: "retrying",
      attempt: 1,
      delayMs: 2_000,
      nextRetryAtMs: 12_000,
      reason: "503 Service Unavailable",
    });
    expect(schedule.entries[1]).toMatchObject({
      opId: "op-retry-2",
      status: "retrying",
      attempt: 3,
      delayMs: 8_000,
      nextRetryAtMs: 18_000,
    });
    expect(schedule.entries[2]).toMatchObject({
      opId: "op-exhausted",
      status: "failed",
      exhausted: true,
      attempt: 4,
      reason: "422 Unprocessable",
    });
  });
});

describe("studio-offline-first-sync-bridge 통합 연결 검증", () => {
  it("브리지 재접속 시 멱등 중복 제거·삭제 후 수정 충돌 노출·지수 백오프 재시도 스케줄이 동작한다", async () => {
    const bridge = createOfflineFirstSyncBridge("proj-merger-int", { initialNetwork: "offline" });

    // 1. 동일 멱등 키 중복 등록은 1건으로 유지된다.
    bridge.enqueueLocalMutation({
      surface: "tooning-plus",
      entityId: "cut-01",
      patch: { balloons: 2 },
      idempotencyKey: "idem:same-1",
      nowMs: 1_000,
    });
    bridge.enqueueLocalMutation({
      surface: "tooning-plus",
      entityId: "cut-01",
      patch: { balloons: 2 },
      idempotencyKey: "idem:same-1",
      nowMs: 1_010,
    });
    expect(bridge.getState().queue).toHaveLength(1);

    // 2. 삭제 후 수정 시 충돌을 명시적으로 기록하고 삭제 연산을 유지한다.
    bridge.enqueueLocalMutation({
      surface: "tooning-plus",
      entityId: "cut-02",
      kind: "delete",
      patch: {},
      nowMs: 1_020,
    });
    const postDelete = bridge.enqueueLocalMutation({
      surface: "tooning-plus",
      entityId: "cut-02",
      kind: "patch",
      patch: { balloons: 7 },
      nowMs: 1_030,
    });
    expect(postDelete.queueConflicts).toHaveLength(1);
    expect(postDelete.queueConflicts?.[0]?.code).toBe("modify-after-delete");
    expect(bridge.getQueueConflicts()).toHaveLength(1);

    // 3. 온라인 복귀 후 전송 실패 시 retrySchedule을 반환하고, 다음 시각에 정상 반영한다.
    bridge.setNetworkStatus("online");
    const planBefore = bridge.planReconnectMerge(2_000);
    expect(planBefore.operations).toHaveLength(2);

    const failedCycle = await bridge.syncNow(
      { pushOperations: async () => { throw new Error("GATEWAY_TIMEOUT"); } },
      { nowMs: 2_000 },
    );
    expect(failedCycle.retried).toBe(2);
    expect(failedCycle.retrySchedule?.earliestNextRetryAtMs).toBe(4_000);

    const pushedIds: string[] = [];
    const okCycle = await bridge.syncNow(
      {
        pushOperations: async (ops) => {
          pushedIds.push(...ops.map((o) => o.opId));
          return { acceptedOpIds: ops.map((o) => o.opId) };
        },
      },
      { nowMs: 5_000 },
    );
    expect(okCycle.synced).toBe(2);
    expect(pushedIds).toHaveLength(2);
    expect(bridge.getState().queue).toHaveLength(0);

    // 4. 이미 반영된 동일 멱등 키가 재입력되면 중복 전송 없이 걸러진다.
    bridge.enqueueLocalMutation({
      surface: "tooning-plus",
      entityId: "cut-01",
      patch: { balloons: 2 },
      idempotencyKey: "idem:same-1",
      nowMs: 6_000,
    });
    expect(bridge.getState().queue).toHaveLength(0);
  });
});
