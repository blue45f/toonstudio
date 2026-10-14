import { describe, expect, it } from "vitest";

import {
  endReviewSession,
  joinReviewSession,
  leaveReviewSession,
  recordSessionDecision,
  startReviewSession,
  type ReviewSession,
} from "./review-session-model";
import {
  attachSessionSummaryToLedger,
  buildReviewSessionSummaryExport,
  formatSessionDecisionLine,
  formatSessionSummaryExportText,
  latestSessionSummaryForEpisode,
  sessionSummariesForEpisode,
  type ReviewSessionSummaryExport,
  type SessionSummaryLedger,
} from "./review-session-summary-export";

const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function endedSession(decisions: ReadonlyArray<{
  readonly actorId: string;
  readonly displayName: string;
  readonly kind: "approve" | "request-changes" | "note";
  readonly summary: string;
}> = []): ReviewSession {
  let session = startReviewSession({
    id: "session-1",
    scopeId: "episode-1",
    host: { actorId: "host", displayName: "PD" },
    now: T0,
  });
  session = joinReviewSession(session, { actorId: "a", displayName: "작가 A" }, at(1_000));
  decisions.forEach((decision, index) => {
    session = recordSessionDecision(session, { ...decision, at: at(2_000 + index * 1_000).toISOString() });
  });
  return endReviewSession(session, "host", at(62_000));
}

describe("세션 요약 내보내기 (build)", () => {
  it("살아 있는 세션은 내보내지 않는다 — 진행 중 판정을 굳히지 않는다", () => {
    const live = startReviewSession({
      id: "session-live", scopeId: "episode-1",
      host: { actorId: "host", displayName: "PD" }, now: T0,
    });
    expect(buildReviewSessionSummaryExport(live, at(1_000))).toBeNull();
  });

  it("끝난 세션은 참여자·판정·집계를 굳힌 레코드가 된다", () => {
    const built = buildReviewSessionSummaryExport(endedSession([
      { actorId: "a", displayName: "작가 A", kind: "request-changes", summary: "3컷 표정 수정" },
      { actorId: "host", displayName: "PD", kind: "approve", summary: "선화 승인" },
      { actorId: "host", displayName: "PD", kind: "note", summary: "다음 화에서 톤 통일" },
    ]), at(70_000));
    expect(built).not.toBeNull();
    expect(built?.sessionId).toBe("session-1");
    expect(built?.episodeId).toBe("episode-1");
    expect(built?.participantNames).toEqual(["PD", "작가 A"]);
    expect(built?.hostName).toBe("PD");
    expect(built?.approvals).toBe(1);
    expect(built?.changeRequests).toBe(1);
    expect(built?.notes).toBe(1);
    expect(built?.durationMs).toBe(62_000);
    expect(built?.endedAt).toBe(at(62_000).toISOString());
    expect(built?.decisions).toHaveLength(3);
  });

  it("결과는 판정에서만 도출한다: 수정 요청 > 승인 > 논의만", () => {
    const withChanges = buildReviewSessionSummaryExport(endedSession([
      { actorId: "host", displayName: "PD", kind: "approve", summary: "승인" },
      { actorId: "a", displayName: "작가 A", kind: "request-changes", summary: "수정" },
    ]), at(70_000));
    expect(withChanges?.outcome).toBe("changes-requested");
    const approvedOnly = buildReviewSessionSummaryExport(endedSession([
      { actorId: "host", displayName: "PD", kind: "approve", summary: "승인" },
    ]), at(70_000));
    expect(approvedOnly?.outcome).toBe("approved");
    const notesOnly = buildReviewSessionSummaryExport(endedSession([
      { actorId: "host", displayName: "PD", kind: "note", summary: "메모" },
    ]), at(70_000));
    expect(notesOnly?.outcome).toBe("discussion-only");
    const empty = buildReviewSessionSummaryExport(endedSession(), at(70_000));
    expect(empty?.outcome).toBe("discussion-only");
    expect(empty?.headline).toContain("논의만 진행");
  });

  it("전원이 나가 자동 종료된 세션도 실효 상태로 내보낸다", () => {
    let session = startReviewSession({
      id: "session-2", scopeId: "episode-9",
      host: { actorId: "host", displayName: "PD" }, now: T0,
    });
    session = recordSessionDecision(session, {
      actorId: "host", displayName: "PD", kind: "approve", summary: "승인", at: at(1_000).toISOString(),
    });
    session = leaveReviewSession(session, "host", at(5_000));
    const built = buildReviewSessionSummaryExport(session, at(6_000));
    expect(built?.episodeId).toBe("episode-9");
    expect(built?.endedAt).toBe(at(5_000).toISOString());
    expect(built?.outcome).toBe("approved");
  });
});

describe("평문 내보내기 (인계 패키지·외부 전달)", () => {
  it("판정 줄은 종류·이름·요약을 한 줄로 고정한다", () => {
    expect(formatSessionDecisionLine({
      id: "d1", actorId: "a", displayName: "작가 A", kind: "request-changes",
      summary: "3컷 표정 수정", at: at(1_000).toISOString(),
    })).toBe("수정 요청 · 작가 A — 3컷 표정 수정");
  });

  it("평문 블록은 제목·참여자·판정을 빠짐없이 담는다", () => {
    const built = buildReviewSessionSummaryExport(endedSession([
      { actorId: "host", displayName: "PD", kind: "approve", summary: "선화 승인" },
    ]), at(70_000));
    const text = formatSessionSummaryExportText(built as ReviewSessionSummaryExport);
    expect(text).toContain("[검수 세션 결정]");
    expect(text).toContain("참여자: PD, 작가 A");
    expect(text).toContain("- 승인 · PD — 선화 승인");
  });

  it("판정이 없는 세션은 평문에서도 없다고 정직하게 쓴다", () => {
    const built = buildReviewSessionSummaryExport(endedSession(), at(70_000));
    const text = formatSessionSummaryExportText(built as ReviewSessionSummaryExport);
    expect(text).toContain("이 세션에서 남긴 판정은 없습니다.");
  });
});

describe("회차 검수 기록 장부 (연결)", () => {
  const first = buildReviewSessionSummaryExport(endedSession([
    { actorId: "host", displayName: "PD", kind: "approve", summary: "승인" },
  ]), at(70_000)) as ReviewSessionSummaryExport;

  it("붙이면 회차별로 골라 읽을 수 있고 최신 세션을 대표로 뽑는다", () => {
    const other = { ...first, sessionId: "session-0", episodeId: "episode-2" };
    let ledger: SessionSummaryLedger = attachSessionSummaryToLedger([], first);
    ledger = attachSessionSummaryToLedger(ledger, other);
    expect(sessionSummariesForEpisode(ledger, "episode-1")).toEqual([first]);
    expect(sessionSummariesForEpisode(ledger, "episode-2")).toEqual([other]);
    expect(latestSessionSummaryForEpisode(ledger, "episode-1")?.sessionId).toBe("session-1");
    expect(latestSessionSummaryForEpisode(ledger, "episode-none")).toBeNull();
  });

  it("같은 세션 재내보내기는 중복이 아니라 최신본 교체다", () => {
    const older = { ...first, exportedAt: at(70_000).toISOString(), headline: "이전 요약" };
    const newer = { ...first, exportedAt: at(80_000).toISOString(), headline: "새 요약" };
    let ledger: SessionSummaryLedger = attachSessionSummaryToLedger([], older);
    ledger = attachSessionSummaryToLedger(ledger, newer);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.headline).toBe("새 요약");
    // 더 오래된 재내보내기가 최신본을 덮지 않는다.
    ledger = attachSessionSummaryToLedger(ledger, older);
    expect(ledger[0]?.headline).toBe("새 요약");
  });

  it("장부 순서는 종료 시각 오름차순으로 고정된다", () => {
    const later = { ...first, sessionId: "session-3", endedAt: at(90_000).toISOString(), exportedAt: at(95_000).toISOString() };
    const ledger = attachSessionSummaryToLedger(attachSessionSummaryToLedger([], later), first);
    expect(ledger.map((entry) => entry.sessionId)).toEqual(["session-1", "session-3"]);
  });
});
