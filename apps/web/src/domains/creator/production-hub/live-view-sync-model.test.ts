import { describe, expect, it } from "vitest";

import {
  buildLiveViewState,
  deriveFollowView,
  deriveLiveViewFocus,
  isFreshLiveView,
  liveCursorColor,
  mergeLiveViews,
  nextLiveFollowState,
  pruneLiveViews,
  shouldPublishLiveCursor,
  shouldPublishLiveView,
  smoothLiveCursor,
  type LiveViewState,
} from "./live-view-sync-model";

const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function view(overrides: Partial<LiveViewState> = {}): LiveViewState {
  return {
    actorId: "actor-a",
    displayName: "검수자 A",
    pageId: "page-1",
    cursor: { x: 0.5, y: 0.5 },
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    updatedAt: T0.toISOString(),
    interactedAt: T0.toISOString(),
    ...overrides,
  };
}

describe("라이브 뷰 생존·정리", () => {
  it("TTL 안의 하트비트만 살아남고 사람당 최신 하나만 남는다", () => {
    const stale = view({ actorId: "actor-b", updatedAt: at(-20_000).toISOString() });
    const older = view({ updatedAt: at(-3_000).toISOString(), cursor: { x: 0.1, y: 0.1 } });
    const newer = view({ updatedAt: at(-1_000).toISOString(), cursor: { x: 0.9, y: 0.9 } });
    const result = pruneLiveViews([stale, older, newer], T0);
    expect(result).toHaveLength(1);
    expect(result[0]?.cursor).toEqual({ x: 0.9, y: 0.9 });
  });

  it("미래로 살짝 어긋난 하트비트(시계 오차)는 인정하고 크게 어긋나면 버린다", () => {
    expect(isFreshLiveView(view({ updatedAt: at(3_000).toISOString() }), T0)).toBe(true);
    expect(isFreshLiveView(view({ updatedAt: at(30_000).toISOString() }), T0)).toBe(false);
  });

  it("merge는 최근 하트비트 쪽을 이기게 한다", () => {
    const base = [view({ updatedAt: at(-2_000).toISOString(), cursor: { x: 0.2, y: 0.2 } })];
    const incoming = [view({ updatedAt: at(-500).toISOString(), cursor: { x: 0.8, y: 0.8 } })];
    expect(mergeLiveViews(base, incoming, T0)[0]?.cursor).toEqual({ x: 0.8, y: 0.8 });
    expect(mergeLiveViews(incoming, base, T0)[0]?.cursor).toEqual({ x: 0.8, y: 0.8 });
  });
});

describe("자리 비움 판정", () => {
  it("하트비트는 살아 있어도 상호작용이 45초를 넘기면 idle이다", () => {
    const idle = view({ updatedAt: T0.toISOString(), interactedAt: at(-50_000).toISOString() });
    expect(deriveLiveViewFocus(idle, T0)).toBe("idle");
    const active = view({ updatedAt: T0.toISOString(), interactedAt: at(-10_000).toISOString() });
    expect(deriveLiveViewFocus(active, T0)).toBe("active");
  });
});

describe("발행 스로틀", () => {
  it("최소 간격 안에서는 거리와 무관하게 발행하지 않는다", () => {
    const last = { atMs: 1_000, cursor: { x: 0.1, y: 0.1 } };
    expect(shouldPublishLiveCursor(last, { x: 0.9, y: 0.9 }, 1_030)).toBe(false);
    expect(shouldPublishLiveCursor(last, { x: 0.9, y: 0.9 }, 1_100)).toBe(true);
  });

  it("간격이 지나도 미세한 떨림은 발행하지 않고, 커서가 나가고 들어오는 것은 즉시 발행한다", () => {
    const last = { atMs: 1_000, cursor: { x: 0.5, y: 0.5 } };
    expect(shouldPublishLiveCursor(last, { x: 0.5005, y: 0.5005 }, 2_000)).toBe(false);
    expect(shouldPublishLiveCursor(last, null, 1_010)).toBe(true);
    expect(shouldPublishLiveCursor({ atMs: 1_000, cursor: null }, { x: 0.5, y: 0.5 }, 1_010)).toBe(true);
  });

  it("스크롤 발행은 페이지 전환·의미 있는 변화에서만 일어난다", () => {
    const last = { scrollX: 0, scrollY: 0.2, zoom: 1, pageId: "page-1" };
    expect(shouldPublishLiveView(last, { ...last, scrollY: 0.205 })).toBe(false);
    expect(shouldPublishLiveView(last, { ...last, scrollY: 0.3 })).toBe(true);
    expect(shouldPublishLiveView(last, { ...last, pageId: "page-2" })).toBe(true);
  });
});

describe("커서 보간", () => {
  it("시간이 흐를수록 목표에 가까워지고 지나친 시간에는 거의 도달한다", () => {
    const start = { x: 0, y: 0 };
    const target = { x: 1, y: 1 };
    const mid = smoothLiveCursor(start, target, 90);
    expect(mid.x).toBeGreaterThan(0.5);
    expect(mid.x).toBeLessThan(1);
    const end = smoothLiveCursor(start, target, 2_000);
    expect(end.x).toBeCloseTo(1, 3);
    expect(smoothLiveCursor(start, target, 0)).toEqual(start);
  });
});

describe("팔로우 상태 기계", () => {
  it("팔로우 시작→수동 조작 해제가 정상 전이로 일어난다", () => {
    const following = nextLiveFollowState({ mode: "off" }, { type: "follow", actorId: "actor-b" });
    expect(following).toEqual({ mode: "following", actorId: "actor-b" });
    expect(nextLiveFollowState(following, { type: "manual-interaction" })).toEqual({ mode: "off" });
    expect(nextLiveFollowState(following, { type: "stop" })).toEqual({ mode: "off" });
  });

  it("팔로우 대상이 사라지면 target-missing을 돌려주고 상태는 꺼진다", () => {
    const state = { mode: "following", actorId: "actor-b" } as const;
    expect(deriveFollowView([view()], state, T0)).toEqual({ kind: "target-missing" });
    expect(nextLiveFollowState(state, { type: "target-missing" })).toEqual({ mode: "off" });
    const present = deriveFollowView([view({ actorId: "actor-b" })], state, T0);
    expect(present.kind).toBe("view");
  });
});

describe("내 상태 만들기·색상", () => {
  it("움직임이 없는 하트비트는 interactedAt을 유지한다", () => {
    const previous = view({ interactedAt: at(-30_000).toISOString() });
    const next = buildLiveViewState({
      actorId: "actor-a", displayName: "검수자 A", pageId: "page-1",
      cursor: { x: 0.5, y: 0.5 }, scrollX: 0, scrollY: 0, zoom: 1,
      previous, interacted: false, now: T0,
    });
    expect(next.updatedAt).toBe(T0.toISOString());
    expect(next.interactedAt).toBe(at(-30_000).toISOString());
  });

  it("커서 색상은 사람마다 고정된다", () => {
    expect(liveCursorColor("actor-a")).toBe(liveCursorColor("actor-a"));
    expect(liveCursorColor("actor-a")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("라이브 뷰 위치(공정) 보존", () => {
  it("buildLiveViewState는 공정을 생략하면 직전 공정을 유지하고, 넘기면 교체한다", () => {
    const first = buildLiveViewState({
      actorId: "actor-a", displayName: "검수자 A", pageId: "page-1", stageId: "review",
      cursor: null, scrollX: 0, scrollY: 0, zoom: 1,
      previous: null, interacted: true, now: T0,
    });
    expect(first.stageId).toBe("review");
    const kept = buildLiveViewState({
      actorId: "actor-a", displayName: "검수자 A", pageId: "page-1",
      cursor: null, scrollX: 0, scrollY: 0, zoom: 1,
      previous: first, interacted: false, now: T0,
    });
    expect(kept.stageId).toBe("review");
    const cleared = buildLiveViewState({
      actorId: "actor-a", displayName: "검수자 A", pageId: "page-1", stageId: null,
      cursor: null, scrollX: 0, scrollY: 0, zoom: 1,
      previous: kept, interacted: false, now: T0,
    });
    expect(cleared.stageId).toBeNull();
    const fresh = buildLiveViewState({
      actorId: "actor-a", displayName: "검수자 A", pageId: "page-1",
      cursor: null, scrollX: 0, scrollY: 0, zoom: 1,
      previous: null, interacted: false, now: T0,
    });
    expect(fresh.stageId).toBeNull();
  });
});
