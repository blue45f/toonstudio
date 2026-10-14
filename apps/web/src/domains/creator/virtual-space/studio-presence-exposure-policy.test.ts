import { describe, expect, it } from "vitest";

import {
  deriveStudioPresenceBroadcast,
  deriveStudioPresenceExposure,
  deriveStudioPresenceExposures,
  visibleStudioPresenceExposures,
  type StudioPresenceSessionScope,
} from "./studio-presence-exposure-policy";

const SCOPE: StudioPresenceSessionScope = {
  sessionId: "review-1",
  participantSessionIds: ["me", "a", "b"],
};

describe("deriveStudioPresenceExposure — 세션 한정", () => {
  it("세션이 없으면 참여 여부와 무관하게 전부 숨긴다 (상시 신호 없음)", () => {
    const exposure = deriveStudioPresenceExposure(
      { sessionId: "a", userStatus: "available" },
      null,
      "me",
    );
    expect(exposure.visible).toBe(false);
    expect(exposure.showOnlineDot).toBe(false);
    expect(exposure.showLiveCursor).toBe(false);
    expect(exposure.showTyping).toBe(false);
  });

  it("내가 세션에 참여하지 않았으면 참여자 명단 자체가 보이지 않는다", () => {
    const exposure = deriveStudioPresenceExposure(
      { sessionId: "a", userStatus: "available" },
      SCOPE,
      "outsider",
    );
    expect(exposure.visible).toBe(false);
  });

  it("세션 참여자가 아닌 사람은 명단에도 없다", () => {
    const exposure = deriveStudioPresenceExposure(
      { sessionId: "stranger", userStatus: "available" },
      SCOPE,
      "me",
    );
    expect(exposure.visible).toBe(false);
  });

  it("세션 안의 실시간 상태는 신호를 전부 연다", () => {
    const exposure = deriveStudioPresenceExposure(
      { sessionId: "a", userStatus: "available" },
      SCOPE,
      "me",
    );
    expect(exposure).toMatchObject({
      visible: true,
      rosterOnly: false,
      showLiveCursor: true,
      showTyping: true,
      showOnlineDot: true,
      replyExpectation: "live",
      suppressNudge: false,
      note: null,
    });
  });

  it("상태 미지정 참여자는 세션 기본값(실시간)으로 취급한다", () => {
    const exposure = deriveStudioPresenceExposure({ sessionId: "a" }, SCOPE, "me");
    expect(exposure.visible).toBe(true);
    expect(exposure.replyExpectation).toBe("live");
    expect(exposure.status).toBeNull();
  });
});

describe("deriveStudioPresenceExposure — 집중 존중", () => {
  it("집중 중: 명단에만 남고 온라인 점·커서·타이핑이 전부 꺼진다", () => {
    const exposure = deriveStudioPresenceExposure(
      { sessionId: "a", userStatus: "focusing" },
      SCOPE,
      "me",
    );
    expect(exposure).toMatchObject({
      visible: true,
      rosterOnly: true,
      showLiveCursor: false,
      showTyping: false,
      showOnlineDot: false,
      replyExpectation: "async",
      suppressNudge: true,
    });
    expect(exposure.note?.ko).toContain("기대하지 마세요");
  });

  it("자리 비움·휴식: 답 기대 없음으로 판정하고 문구가 붙는다", () => {
    const away = deriveStudioPresenceExposure({ sessionId: "a", userStatus: "away" }, SCOPE, "me");
    const rest = deriveStudioPresenceExposure({ sessionId: "b", userStatus: "break" }, SCOPE, "me");
    expect(away.replyExpectation).toBe("none");
    expect(rest.replyExpectation).toBe("none");
    expect(away.note?.ko).toContain("자리 비움");
    expect(rest.note?.ko).toContain("휴식 중");
    expect(away.suppressNudge).toBe(true);
    expect(rest.suppressNudge).toBe(true);
  });

  it("회의 중·발표 중은 세션 맥락이므로 실시간으로 둔다", () => {
    for (const userStatus of ["in-meeting", "presenting"] as const) {
      const exposure = deriveStudioPresenceExposure({ sessionId: "a", userStatus }, SCOPE, "me");
      expect(exposure.rosterOnly).toBe(false);
      expect(exposure.replyExpectation).toBe("live");
    }
  });
});

describe("deriveStudioPresenceExposures / visible", () => {
  it("스냅샷 전체에 적용하고 visible만 추릴 수 있다", () => {
    const exposures = deriveStudioPresenceExposures(
      [
        { sessionId: "a", userStatus: "available" },
        { sessionId: "b", userStatus: "focusing" },
        { sessionId: "ghost", userStatus: "available" },
      ],
      SCOPE,
      "me",
    );
    expect(exposures).toHaveLength(3);
    expect(visibleStudioPresenceExposures(exposures).map((e) => e.sessionId)).toEqual(["a", "b"]);
  });

  it("세션이 끝나면(scope null) 추린 결과도 비어 상시 표시가 남지 않는다", () => {
    const exposures = deriveStudioPresenceExposures(
      [{ sessionId: "a", userStatus: "available" }],
      null,
      "me",
    );
    expect(visibleStudioPresenceExposures(exposures)).toEqual([]);
  });
});

describe("deriveStudioPresenceBroadcast — 내 신호 발행", () => {
  it("세션 밖에서는 아무것도 발행하지 않는다", () => {
    expect(deriveStudioPresenceBroadcast("available", null, "me")).toEqual({
      publishPresence: false,
      publishCursor: false,
      publishTyping: false,
      publishStatus: false,
    });
  });

  it("세션에 참여하지 않은 나는 발행하지 않는다", () => {
    expect(deriveStudioPresenceBroadcast("available", SCOPE, "outsider").publishPresence).toBe(false);
  });

  it("집중 중이면 명단용 상태만 나가고 커서·타이핑은 나가지 않는다", () => {
    expect(deriveStudioPresenceBroadcast("focusing", SCOPE, "me")).toEqual({
      publishPresence: true,
      publishCursor: false,
      publishTyping: false,
      publishStatus: true,
    });
  });

  it("자리 비움·휴식도 커서·타이핑은 나가지 않는다", () => {
    for (const status of ["away", "break"] as const) {
      const broadcast = deriveStudioPresenceBroadcast(status, SCOPE, "me");
      expect(broadcast.publishCursor).toBe(false);
      expect(broadcast.publishTyping).toBe(false);
      expect(broadcast.publishPresence).toBe(true);
    }
  });

  it("실시간 상태면 전부 발행한다", () => {
    expect(deriveStudioPresenceBroadcast("available", SCOPE, "me")).toEqual({
      publishPresence: true,
      publishCursor: true,
      publishTyping: true,
      publishStatus: true,
    });
  });
});
