import { describe, expect, it } from "vitest";

import type { LiveViewState } from "./live-view-sync-model";
import {
  createFollowSession,
  deriveObserveEligibility,
  followViewportFromLiveView,
  observerInteracted,
  receiveTargetViewport,
  resumeFollow,
  startFollow,
  stopFollow,
  syncObserverViewport,
  targetBlockedObserve,
  type FollowViewport,
} from "./observe-follow-model";

const VP: FollowViewport = { pageId: "p1", scrollX: 0, scrollY: 0, zoom: 1 };

function liveView(overrides: Partial<LiveViewState> = {}): LiveViewState {
  return {
    actorId: "lead",
    displayName: "리드",
    pageId: "p1",
    cursor: { x: 0.5, y: 0.5 },
    scrollX: 0.25,
    scrollY: 0.5,
    zoom: 1.5,
    updatedAt: "2026-10-14T00:00:00.000Z",
    interactedAt: "2026-10-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("관찰(팔로우) 시작·권한", () => {
  it("대상이 허용하지 않으면 시작 즉시 blocked다", () => {
    const session = startFollow(createFollowSession("me", "lead"), { targetAllowsObserve: false });
    expect(session.state).toBe("blocked");
  });

  it("허용하면 following이고, stopFollow는 off로 되돌린다", () => {
    const session = startFollow(createFollowSession("me", "lead"), { targetAllowsObserve: true });
    expect(session.state).toBe("following");
    expect(stopFollow(session).state).toBe("off");
  });

  it("자격 판정: 차단 > 세션 비공개 > 집중 > 부재 순으로 막는다", () => {
    const base = { targetPresent: true, sessionVisible: true, targetCursorsVisible: true, targetBlocked: false };
    expect(deriveObserveEligibility(base)).toEqual({ allowed: true, reason: "ok" });
    expect(deriveObserveEligibility({ ...base, targetBlocked: true }).reason).toBe("target-blocked");
    expect(deriveObserveEligibility({ ...base, sessionVisible: false }).reason).toBe("session-hidden");
    expect(deriveObserveEligibility({ ...base, targetCursorsVisible: false }).reason).toBe("target-focus");
    expect(deriveObserveEligibility({ ...base, targetPresent: false }).reason).toBe("target-missing");
    // 차단과 부재가 겹쳐도 차단이 먼저다 (가장 강한 신호 우선).
    expect(deriveObserveEligibility({ ...base, targetBlocked: true, targetPresent: false }).reason).toBe("target-blocked");
  });
});

describe("관찰자 조작 — 일시정지(해제 아님)", () => {
  it("following에서 직접 조작하면 paused-manual로 남고 resume으로 복귀한다", () => {
    let session = startFollow(createFollowSession("me", "lead"), { targetAllowsObserve: true });
    session = observerInteracted(session);
    expect(session.state).toBe("paused-manual");
    // 빠져나간 것이 아니므로 대상 정보가 그대로 남는다.
    expect(session.targetUserId).toBe("lead");
    session = resumeFollow(session);
    expect(session.state).toBe("following");
  });

  it("off·blocked에서는 조작·복귀가 상태를 바꾸지 않는다", () => {
    const off = createFollowSession("me", "lead");
    expect(observerInteracted(off).state).toBe("off");
    expect(resumeFollow(off).state).toBe("off");
    const blocked = targetBlockedObserve(startFollow(off, { targetAllowsObserve: true }));
    expect(resumeFollow(blocked).state).toBe("blocked");
  });
});

describe("대상 차단 — 즉시 해제", () => {
  it("following·paused-manual 어디서든 blocked로 전이한다", () => {
    const following = startFollow(createFollowSession("me", "lead"), { targetAllowsObserve: true });
    expect(targetBlockedObserve(following).state).toBe("blocked");
    expect(targetBlockedObserve(observerInteracted(following)).state).toBe("blocked");
  });

  it("off인 세션은 차단 신호에도 그대로 off다", () => {
    expect(targetBlockedObserve(createFollowSession("me", "lead")).state).toBe("off");
  });
});

describe("뷰포트 동기", () => {
  it("같은 페이지는 스크롤·줌을 t만큼 보간한다", () => {
    const synced = syncObserverViewport(VP, { pageId: "p1", scrollX: 1, scrollY: 0.5, zoom: 2 }, 0.5);
    expect(synced).toEqual({ pageId: "p1", scrollX: 0.5, scrollY: 0.25, zoom: 1.5 });
  });

  it("페이지가 다르면 보간 없이 대상 페이지로 즉시 이동한다", () => {
    const synced = syncObserverViewport(VP, { pageId: "p2", scrollX: 0.9, scrollY: 0.9, zoom: 3 }, 0.5);
    expect(synced).toEqual({ pageId: "p2", scrollX: 0.9, scrollY: 0.9, zoom: 3 });
  });

  it("t는 0..1로 고정된다", () => {
    const target: FollowViewport = { pageId: "p1", scrollX: 1, scrollY: 1, zoom: 2 };
    expect(syncObserverViewport(VP, target, 2)).toEqual(target);
    expect(syncObserverViewport(VP, target, -1)).toEqual(VP);
  });

  it("라이브 뷰를 팔로우 뷰포트로 바꾸면 페이지·스크롤·줌이 그대로 온다", () => {
    expect(followViewportFromLiveView(liveView())).toEqual({
      pageId: "p1", scrollX: 0.25, scrollY: 0.5, zoom: 1.5,
    });
  });

  it("같은 뷰포트를 다시 받으면 세션 참조가 유지된다(불필요한 재렌더 방지)", () => {
    const session = receiveTargetViewport(createFollowSession("me", "lead"), VP);
    expect(receiveTargetViewport(session, VP)).toBe(session);
    expect(receiveTargetViewport(session, { ...VP, scrollY: 0.5 })).not.toBe(session);
  });
});
