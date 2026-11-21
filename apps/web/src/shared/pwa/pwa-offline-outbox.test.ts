// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryOutboxStorage,
  mergeOutboxPayloads,
  PwaOfflineOutbox,
  PwaOutboxConflictError,
  summarizeOutboxConflictDiff,
} from "./pwa-offline-outbox";

describe("pwa-offline-outbox", () => {
  let outbox: PwaOfflineOutbox;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    outbox = new PwaOfflineOutbox(createMemoryOutboxStorage(), () => now);
  });

  it("오프라인 작업을 큐에 쌓는다", () => {
    const item = outbox.enqueue("note", "에피소드 3 메모", { text: "hello" });
    expect(item.status).toBe("queued");
    expect(item.attempts).toBe(0);
    expect(outbox.pending()).toHaveLength(1);
  });

  it("동기화 성공 시 큐에서 제거한다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    outbox.enqueue("comment", "댓글", { text: "b" });
    const progress: Array<[number, number]> = [];
    const report = await outbox.syncAll(
      async () => undefined,
      (done, total) => {
        progress.push([done, total]);
      },
    );
    expect(report).toMatchObject({ synced: 2, failed: 0, conflicted: 0, remaining: 0 });
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(outbox.list()).toHaveLength(0);
  });

  it("실패 시 failed로 두고 attempts를 올린다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    const report = await outbox.syncAll(async () => {
      throw new Error("network down");
    });
    expect(report.failed).toBe(1);
    const [item] = outbox.pending();
    expect(item.status).toBe("failed");
    expect(item.attempts).toBe(1);
    expect(item.lastError).toBe("network down");
  });

  it("충돌 시 conflicted 상태로 두고 양쪽 시간과 원격 페이로드를 보관한다", async () => {
    outbox.enqueue("note", "메모", { text: "로컬 대사", localMemo: "컷 3 강조" });
    const report = await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_000_000, "원격 사본", {
        text: "원격 대사",
        remoteReviewer: "편집자",
      });
    });
    expect(report.conflicted).toBe(1);
    const [item] = outbox.list();
    expect(item.status).toBe("conflicted");
    expect(item.conflict?.remoteUpdatedAt).toBe(2_000_000);
    expect(item.conflict?.remoteLabel).toBe("원격 사본");
    expect(item.conflict?.remotePayload).toEqual({ text: "원격 대사", remoteReviewer: "편집자" });
  });

  it("'내 버전 유지(mine)'를 선택하면 다시 큐에 들어간다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_000_000);
    });
    const [conflicted] = outbox.list();
    outbox.resolveConflict(conflicted.id, "mine");
    const [queued] = outbox.pending();
    expect(queued.status).toBe("queued");
    expect(queued.attempts).toBe(0);
    expect(queued.conflict).toBeUndefined();
  });

  it("'원격 버전 사용(theirs)'을 선택하면 항목을 버린다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_000_000);
    });
    const [conflicted] = outbox.list();
    outbox.resolveConflict(conflicted.id, "theirs");
    expect(outbox.list()).toHaveLength(0);
  });

  it("'병합(merge)'을 선택하면 충돌하지 않는 필드를 안전하게 합치고 충돌 메타데이터를 보존해 재큐잉한다", async () => {
    outbox.enqueue("note", "에피소드 5 메모", {
      title: "로컬 제목",
      localNote: "내 메모 유지",
      tags: ["액션", "명장면"],
    });
    await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_500_000, "동료 태블릿", {
        title: "원격 제목",
        remoteAssignee: "채색 담당",
        tags: ["액션", "조명수정"],
      });
    });
    const [conflicted] = outbox.list();
    now = 3_000_000;
    outbox.resolveConflict(conflicted.id, "merge");

    const [queued] = outbox.pending();
    expect(queued.status).toBe("queued");
    expect(queued.attempts).toBe(0);
    expect(queued.conflict).toBeUndefined();
    expect(queued.payload).toEqual({
      title: "로컬 제목",
      localNote: "내 메모 유지",
      remoteAssignee: "채색 담당",
      tags: ["액션", "명장면", "조명수정"],
    });
    expect(queued.mergeResolution).toMatchObject({
      strategy: "merge",
      mergedAt: 3_000_000,
      remoteUpdatedAt: 2_500_000,
      remoteLabel: "동료 태블릿",
      localOnlyKeys: ["localNote"],
      remoteOnlyKeys: ["remoteAssignee"],
      overlappingKeys: ["title", "tags"],
      remotePayloadSnapshot: {
        title: "원격 제목",
        remoteAssignee: "채색 담당",
        tags: ["액션", "조명수정"],
      },
    });
  });

  it("차이 비교 요약이 로컬 전용·원격 전용·동시 변경 필드를 정확히 분류한다", () => {
    const summary = summarizeOutboxConflictDiff(
      { same: 1, mineOnly: "a", shared: "local" },
      { same: 1, remoteOnly: "b", shared: "remote" },
    );
    expect(summary.hasPayloadComparison).toBe(true);
    expect(summary.localOnlyCount).toBe(1);
    expect(summary.remoteOnlyCount).toBe(1);
    expect(summary.bothChangedCount).toBe(1);
    expect(summary.sameCount).toBe(1);

    const merged = mergeOutboxPayloads(
      { nested: { a: 1 }, mine: true },
      { nested: { b: 2 }, remote: true },
    );
    expect(merged.merged).toEqual({ nested: { a: 1, b: 2 }, mine: true, remote: true });
  });

  it("구독자에게 상태 변화를 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = outbox.subscribe(listener);
    outbox.enqueue("note", "메모", {});
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    outbox.enqueue("note", "메모2", {});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("5회 실패하면 루프를 중단한다", async () => {
    outbox.enqueue("note", "메모", {});
    for (let i = 0; i < 6; i += 1) {
      await outbox.syncAll(async () => {
        throw new Error("down");
      });
    }
    const [item] = outbox.list();
    expect(item.attempts).toBe(5);
  });

  it("한 항목이 상한에 도달해도 나머지 항목 동기화를 계속한다", async () => {
    outbox.enqueue("note", "실패 항목", {});
    outbox.enqueue("comment", "성공 항목", {});
    await outbox.syncAll(async (item) => {
      if (item.kind === "note") {
        throw new Error("down");
      }
    });
    const report = await outbox.syncAll(async () => undefined);
    expect(report.synced).toBe(1);
    expect(outbox.list().some((entry) => entry.kind === "comment")).toBe(false);
  });
});
