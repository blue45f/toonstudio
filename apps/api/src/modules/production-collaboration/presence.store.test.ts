import { describe, expect, it } from "vitest";

import {
  PresenceStore,
  sessionWins,
  type PresenceSyncInput,
  type ServerPagePresenceEntry,
  type ServerReviewSession,
} from "./presence.store";

const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();

function entry(actorId: string, mode: "editing" | "viewing", heartbeatMs: number): ServerPagePresenceEntry {
  return { pageId: "page-1", actorId, displayName: actorId, mode, heartbeatAt: iso(heartbeatMs) };
}

function syncInput(partial: Partial<PresenceSyncInput>): PresenceSyncInput {
  return { presence: [], liveView: null, session: null, leaving: false, ...partial };
}

function session(id: string, startedMs: number, decisions: number, state = "live"): ServerReviewSession {
  return {
    id, scopeId: "ep-1", startedAt: iso(startedMs), state,
    hostActorId: "a-1", endedAt: state === "ended" ? iso(startedMs + 1000) : null,
    participants: [], decisions: Array.from({ length: decisions }, (_, i) => ({ id: `d-${i}` })),
  } as ServerReviewSession;
}

describe("PresenceStore — 기기 간 프레즌스·잠금", () => {
  it("두 기기가 서로의 프레즌스를 보고, 먼저 편집을 시작한 사람이 잠금 보유자가 된다(웹 모델 규칙)", () => {
    const store = new PresenceStore();
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ presence: [entry("a-1", "editing", 0)] }), at(0));
    const seenByB = store.sync("p-1", "ep-1", "page-1", "user-b", syncInput({ presence: [entry("b-1", "viewing", 1000)] }), at(1000));
    expect(seenByB.presence.map((e) => e.actorId)).toEqual(["a-1", "b-1"]);
    const seenByA = store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ presence: [entry("a-1", "editing", 2000)] }), at(2000));
    expect(seenByA.presence.find((e) => e.mode === "editing")?.actorId).toBe("a-1");
  });

  it("하트비트가 TTL(90초)을 넘긴 항목은 사라져 잠금이 풀린다", () => {
    const store = new PresenceStore();
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ presence: [entry("a-1", "editing", 0)] }), at(0));
    const after = store.sync("p-1", "ep-1", "page-1", "user-b", syncInput({ presence: [entry("b-1", "viewing", 91_000)] }), at(91_000));
    expect(after.presence.map((e) => e.actorId)).toEqual(["b-1"]);
  });

  it("leaving이면 제출자 본인의 항목만 지워진다", () => {
    const store = new PresenceStore();
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ presence: [entry("a-1", "editing", 0)] }), at(0));
    store.sync("p-1", "ep-1", "page-1", "user-b", syncInput({ presence: [entry("b-1", "viewing", 0)] }), at(0));
    const after = store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ leaving: true }), at(1000));
    expect(after.presence.map((e) => e.actorId)).toEqual(["b-1"]);
  });

  it("다른 사용자는 살아 있는 남의 항목을 덮어쓸 수 없다(위조 방지)", () => {
    const store = new PresenceStore();
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ presence: [entry("a-1", "editing", 0)] }), at(0));
    const after = store.sync("p-1", "ep-1", "page-1", "user-b", syncInput({ presence: [entry("a-1", "viewing", 5000)] }), at(5000));
    expect(after.presence.find((e) => e.actorId === "a-1")?.mode).toBe("editing");
  });

  it("라이브 뷰는 12초 TTL로 정리되고 최신 updatedAt이 이긴다", () => {
    const store = new PresenceStore();
    const view = (updatedMs: number, x: number) => ({
      actorId: "a-1", displayName: "A", pageId: "page-1",
      cursor: { x, y: 0.5 }, scrollX: 0, scrollY: 0, zoom: 1,
      updatedAt: iso(updatedMs), interactedAt: iso(updatedMs),
    });
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ liveView: view(0, 0.1) }), at(0));
    const fresh = store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ liveView: view(3000, 0.9) }), at(3000));
    expect(fresh.liveViews[0]?.cursor?.x).toBe(0.9);
    const stale = store.snapshot("p-1", "ep-1", "page-1", at(16_000));
    expect(stale.liveViews).toEqual([]);
  });

  it("세션은 먼저 시작된 쪽이 이기고, 같은 세션이면 결정이 많은 쪽·종료 상태가 이긴다", () => {
    const store = new PresenceStore();
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ session: session("s-1", 5000, 0) }), at(5000));
    const earlier = store.sync("p-1", "ep-1", "page-1", "user-b", syncInput({ session: session("s-2", 1000, 0) }), at(6000));
    expect(earlier.session?.id).toBe("s-2");
    expect(sessionWins(session("s-2", 1000, 3), session("s-2", 1000, 1))).toBe(true);
    expect(sessionWins(session("s-2", 1000, 0, "ended"), session("s-2", 1000, 5))).toBe(true);
  });

  it("프로젝트·페이지 범위가 다르면 섞이지 않는다", () => {
    const store = new PresenceStore();
    store.sync("p-1", "ep-1", "page-1", "user-a", syncInput({ presence: [entry("a-1", "editing", 0)] }), at(0));
    expect(store.snapshot("p-2", "ep-1", "page-1", at(0)).presence).toEqual([]);
    expect(store.snapshot("p-1", "ep-1", "page-2", at(0)).presence).toEqual([]);
  });
});
