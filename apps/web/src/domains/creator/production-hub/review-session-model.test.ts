import { describe, expect, it } from "vitest";

import {
  deriveEffectiveSession,
  deriveSessionPresence,
  endReviewSession,
  joinReviewSession,
  leaveReviewSession,
  recordSessionDecision,
  setSessionAttention,
  startReviewSession,
  summarizeReviewSession,
  type ReviewSession,
} from "./review-session-model";

const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function liveSession(): ReviewSession {
  return startReviewSession({
    id: "session-1",
    scopeId: "episode-1",
    host: { actorId: "host", displayName: "PD" },
    now: T0,
  });
}

describe("세션 생애주기", () => {
  it("시작하면 호스트가 참여자로 들어가고 live가 된다", () => {
    const session = liveSession();
    expect(session.state).toBe("live");
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0]?.actorId).toBe("host");
  });

  it("참여·재참여가 되고, 전원이 나가면 자동 종료된다", () => {
    let session = joinReviewSession(liveSession(), { actorId: "a", displayName: "작가 A" }, at(1_000));
    session = leaveReviewSession(session, "a", at(2_000));
    expect(session.state).toBe("live");
    session = joinReviewSession(session, { actorId: "a", displayName: "작가 A" }, at(3_000));
    expect(session.participants.find((p) => p.actorId === "a")?.leftAt).toBeNull();
    session = leaveReviewSession(session, "a", at(4_000));
    session = leaveReviewSession(session, "host", at(5_000));
    expect(session.state).toBe("ended");
    expect(session.endedAt).toBe(at(5_000).toISOString());
  });

  it("호스트만 세션을 끝낼 수 있고, 끝난 세션은 불변이다", () => {
    const session = liveSession();
    expect(endReviewSession(session, "someone-else", at(1_000)).state).toBe("live");
    const ended = endReviewSession(session, "host", at(1_000));
    expect(ended.state).toBe("ended");
    expect(joinReviewSession(ended, { actorId: "a", displayName: "A" }, at(2_000))).toBe(ended);
    expect(recordSessionDecision(ended, {
      actorId: "host", displayName: "PD", kind: "approve", summary: "승인", at: at(2_000).toISOString(),
    })).toBe(ended);
  });

  it("방치된 세션은 최대 시간을 넘기면 끝난 것으로 본다", () => {
    const session = liveSession();
    const effective = deriveEffectiveSession(session, at(5 * 60 * 60 * 1000));
    expect(effective.state).toBe("ended");
  });
});

describe("프레즌스 노출 정책 (세션 한정·집중 존중)", () => {
  it("세션이 없거나 참여하지 않으면 명단조차 보이지 않는다", () => {
    expect(deriveSessionPresence(null, "host", T0).visible).toBe(false);
    const display = deriveSessionPresence(liveSession(), "outsider", T0);
    expect(display.visible).toBe(false);
    expect(display.reason).toBe("not-joined");
    expect(display.participants).toHaveLength(0);
  });

  it("참여하면 명단이 열리고, 집중 중인 사람은 커서가 숨는다", () => {
    let session = joinReviewSession(liveSession(), { actorId: "a", displayName: "작가 A" }, at(1_000));
    session = setSessionAttention(session, "a", "focus");
    const display = deriveSessionPresence(session, "host", at(2_000));
    expect(display.visible).toBe(true);
    const focused = display.participants.find((p) => p.actorId === "a");
    expect(focused?.attention).toBe("focus");
    expect(focused?.cursorsVisible).toBe(false);
    expect(display.selfCursorAllowed).toBe(true);
  });

  it("내가 집중 모드면 내 커서 발행도 허용되지 않는다", () => {
    const session = setSessionAttention(liveSession(), "host", "focus");
    const display = deriveSessionPresence(session, "host", at(1_000));
    expect(display.selfCursorAllowed).toBe(false);
  });

  it("나간 사람은 명단에서 빠진다", () => {
    let session = joinReviewSession(liveSession(), { actorId: "a", displayName: "작가 A" }, at(1_000));
    session = leaveReviewSession(session, "a", at(2_000));
    const display = deriveSessionPresence(session, "host", at(3_000));
    expect(display.participants.map((p) => p.actorId)).toEqual(["host"]);
  });
});

describe("결정 이력과 요약", () => {
  it("결정은 순서대로 쌓이고 결정적 ID가 붙는다", () => {
    let session = liveSession();
    session = recordSessionDecision(session, {
      actorId: "host", displayName: "PD", kind: "request-changes", summary: "3컷 표정 수정", at: at(1_000).toISOString(),
    });
    session = recordSessionDecision(session, {
      actorId: "host", displayName: "PD", kind: "approve", summary: "선화 승인", at: at(2_000).toISOString(),
    });
    expect(session.decisions.map((d) => d.id)).toEqual(["decision:session-1:1", "decision:session-1:2"]);
    const summary = summarizeReviewSession(endReviewSession(session, "host", at(62_000)), at(62_000));
    expect(summary.approvals).toBe(1);
    expect(summary.changeRequests).toBe(1);
    expect(summary.participantCount).toBe(1);
    expect(summary.durationMs).toBe(62_000);
  });
});
