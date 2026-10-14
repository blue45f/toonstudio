import { describe, expect, it } from "vitest";

import {
  DEFAULT_FEEDBACK_WINDOW_DAYS,
  PUBLISH_VERDICT_PORTFOLIO_NOTE,
  formatPublishVerdictDate,
  resolvePublishVerdictView,
} from "./studio-publish-verdict";

/**
 * 첫 게시 후 판정 가시화 계약:
 * - 상태는 항상 표시되고, 검토 중이면 다음 피드백·판단 시점이 반드시,
 *   종결이면 클로징 메시지가 반드시 도출된다(빈칸 금지).
 * - 시점 산출 순서: 명시 시점 → 기간 상한(챌린지·학습) → 제출 + 보장 기간.
 * - 학습·챌린지는 상한 표기와 포트폴리오 보존 안내가 처음부터 붙는다.
 */
const NOW = new Date("2026-10-14T03:00:00.000Z");

describe("publish verdict visibility model", () => {
  it("always shows a next feedback point while in review (explicit time wins)", () => {
    const view = resolvePublishVerdictView(
      {
        kind: "submission",
        status: "in-review",
        submittedAt: "2026-10-14T01:00:00.000Z",
        nextFeedbackAt: "2026-10-21T03:00:00.000Z",
        caps: { periodEnd: "2026-10-28T03:00:00.000Z" },
      },
      NOW,
    );
    expect(view.terminal).toBe(false);
    expect(view.statusLabel).toBe("검토 중");
    expect(view.nextFeedbackAt).toBe("2026-10-21T03:00:00.000Z");
    expect(view.nextFeedbackLabel).toContain("다음 피드백·판단 시점:");
    expect(view.nextFeedbackLabel).toContain("2026년 10월 21일");
    expect(view.nextFeedbackOverdue).toBe(false);
    expect(view.closingMessage).toBeNull();
  });

  it("uses the challenge period cap as the judgment point when no explicit time exists", () => {
    const view = resolvePublishVerdictView(
      {
        kind: "challenge",
        status: "in-review",
        submittedAt: "2026-10-14T01:00:00.000Z",
        caps: { periodStart: "2026-10-12T03:00:00.000Z", periodEnd: "2026-10-18T14:59:59.000Z" },
      },
      NOW,
    );
    expect(view.nextFeedbackAt).toBe("2026-10-18T14:59:59.000Z");
    expect(view.capsLabel).toContain("기간");
    expect(view.portfolioNote).toBe(PUBLISH_VERDICT_PORTFOLIO_NOTE);
  });

  it("falls back to submitted + feedback window so the point is never blank", () => {
    const view = resolvePublishVerdictView(
      { kind: "publish", status: "in-review", submittedAt: "2026-10-14T01:00:00.000Z" },
      NOW,
    );
    const expected = new Date(
      Date.parse("2026-10-14T01:00:00.000Z") + DEFAULT_FEEDBACK_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    expect(view.nextFeedbackAt).toBe(expected);
    expect(view.nextFeedbackLabel).toContain("다음 피드백·판단 시점:");

    const custom = resolvePublishVerdictView(
      {
        kind: "publish",
        status: "in-review",
        submittedAt: "2026-10-14T01:00:00.000Z",
        feedbackWindowDays: 3,
      },
      NOW,
    );
    expect(custom.nextFeedbackAt).toBe("2026-10-17T01:00:00.000Z");
  });

  it("still shows a next-step line even when no date can be derived", () => {
    const view = resolvePublishVerdictView(
      { kind: "publish", status: "in-review", submittedAt: "not-a-date" },
      NOW,
    );
    expect(view.nextFeedbackAt).toBeNull();
    expect(view.nextFeedbackLabel).toContain("정해지는 대로 이 화면에 바로 표시됩니다");
  });

  it("flags an overdue feedback point instead of silently passing it", () => {
    const view = resolvePublishVerdictView(
      {
        kind: "submission",
        status: "in-review",
        submittedAt: "2026-09-01T01:00:00.000Z",
        nextFeedbackAt: "2026-09-10T03:00:00.000Z",
      },
      NOW,
    );
    expect(view.nextFeedbackOverdue).toBe(true);
    expect(view.nextFeedbackLabel).toContain("예정보다 늦어지고 있어");
  });

  it("always closes with a closing message once decided", () => {
    for (const [status, label] of [
      ["passed", "통과"],
      ["needs-revision", "보완 필요"],
      ["closed", "종료"],
    ] as const) {
      const view = resolvePublishVerdictView(
        { kind: "challenge", status, submittedAt: "2026-10-01T01:00:00.000Z" },
        NOW,
      );
      expect(view.terminal).toBe(true);
      expect(view.statusLabel).toBe(label);
      expect(view.nextFeedbackLabel).toBeNull();
      expect(view.closingMessage).toBeTruthy();
      expect(view.closingMessage).toContain("포트폴리오");
    }
  });

  it("prefers a caller-provided closing message", () => {
    const view = resolvePublishVerdictView(
      {
        kind: "learning",
        status: "closed",
        submittedAt: "2026-10-01T01:00:00.000Z",
        closingMessage: "클래스가 종료됐습니다. 수고하셨어요.",
      },
      NOW,
    );
    expect(view.closingMessage).toBe("클래스가 종료됐습니다. 수고하셨어요.");
  });

  it("shows episode and period caps for learning tasks from the start", () => {
    const view = resolvePublishVerdictView(
      {
        kind: "learning",
        status: "in-review",
        submittedAt: "2026-10-14T01:00:00.000Z",
        caps: {
          maxEpisodes: 12,
          completedEpisodes: 3,
          periodStart: "2026-10-05T03:00:00.000Z",
          periodEnd: "2026-12-28T14:59:59.000Z",
        },
      },
      NOW,
    );
    expect(view.capsLabel).toContain("총 12화까지 제출할 수 있어요");
    expect(view.capsLabel).toContain("지금까지 3화 제출");
    expect(view.capsLabel).toContain("기간");
    expect(view.portfolioNote).toBe(PUBLISH_VERDICT_PORTFOLIO_NOTE);
  });

  it("keeps plain publishes free of portfolio noise while in review", () => {
    const view = resolvePublishVerdictView(
      { kind: "publish", status: "in-review", submittedAt: "2026-10-14T01:00:00.000Z" },
      NOW,
    );
    expect(view.capsLabel).toBeNull();
    expect(view.portfolioNote).toBeNull();
    expect(view.portfolioHref).toBeNull();
  });

  it("formats dates in Asia/Seoul and rejects garbage", () => {
    // 2026-10-20T16:00Z is already Oct 21 in Seoul.
    expect(formatPublishVerdictDate("2026-10-20T16:00:00.000Z")).toContain("2026년 10월 21일");
    expect(formatPublishVerdictDate("nope")).toBeNull();
    expect(formatPublishVerdictDate(null)).toBeNull();
  });
});
