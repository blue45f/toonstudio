// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReactionSummaryPanel } from "./reaction-summary-panel";

import type { MisclassificationReport } from "./reaction-summary";
import type { SeedReview } from "@/shared/lib/types";

const ATTACK_TEXT = "작가 씨발 한심하다 그만 그려라";

function makeReview(partial: Partial<SeedReview> & { readonly id: string }): SeedReview {
  return {
    titleId: "title-1",
    author: "독자",
    avatar: "#888888",
    rating: 3,
    text: "",
    tags: [],
    spoiler: false,
    likes: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

const reviews: SeedReview[] = [
  makeReview({ id: "r-praise", text: "최고의 회차였다. 작화도 스토리도 감동.", rating: 5, likes: 42 }),
  makeReview({ id: "r-attack", text: ATTACK_TEXT, rating: 1, likes: 99 }),
  makeReview({ id: "r-critique", text: "전개가 지루해서 아쉽다.", rating: 2, likes: 3 }),
];

afterEach(cleanup);

describe("ReactionSummaryPanel — 악성 댓글 방벽 판정", () => {
  it("요약 모드 기본 상태에서는 인신공격 댓글 원본이 어디에도 노출되지 않는다", () => {
    const { container } = render(<ReactionSummaryPanel reviews={reviews} />);
    expect(container.textContent).not.toContain("씨발");
    expect(container.textContent).not.toContain("그만 그려라");
    // 가려진 개수만 안내된다.
    expect(container.textContent).toContain("인신공격으로 분류된 댓글 1개");
  });

  it("원본을 명시적으로 열어도 인신공격 댓글은 가린 행으로만 보이고 오분류 신고 경로가 있다", () => {
    const onReport = vi.fn<(report: MisclassificationReport) => void>();
    const { container } = render(<ReactionSummaryPanel reviews={reviews} onReportMisclassification={onReport} />);

    fireEvent.click(screen.getByRole("button", { name: /원본 댓글 보기/ }));
    // 원본 목록이 열려도 공격 원문은 DOM에 없다.
    expect(container.textContent).not.toContain("씨발");
    expect(container.textContent).toContain("인신공격으로 분류되어 가려진 댓글");
    // 비공격 원본은 열린 뒤에만 보인다.
    expect(container.textContent).toContain("전개가 지루해서 아쉽다.");

    // 오분류 신고: 가려진 행에서 바로 신고할 수 있다.
    const reportButtons = screen.getAllByRole("button", { name: /분류가 달라요/ });
    expect(reportButtons.length).toBeGreaterThan(0);
    fireEvent.click(reportButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: /신고 보내기/ }));
    expect(onReport).toHaveBeenCalledTimes(1);
    const report = onReport.mock.calls[0]![0];
    expect(report.reviewId).toBe("r-praise");
    expect(report.classifiedAs).toBe("praise");
  });

  it("공격 행의 오분류 신고는 원본을 보지 않고도 접수되고 재분류가 반영된다", () => {
    const onReport = vi.fn<(report: MisclassificationReport) => void>();
    const { container } = render(<ReactionSummaryPanel reviews={reviews} onReportMisclassification={onReport} />);
    fireEvent.click(screen.getByRole("button", { name: /원본 댓글 보기/ }));

    const reportButtons = screen.getAllByRole("button", { name: /분류가 달라요/ });
    // 두 번째 행이 공격 댓글 (입력 순서 유지)
    fireEvent.click(reportButtons[1]!);
    fireEvent.click(screen.getByRole("button", { name: /신고 보내기/ }));

    expect(onReport).toHaveBeenCalledTimes(1);
    const report = onReport.mock.calls[0]![0];
    expect(report.reviewId).toBe("r-attack");
    expect(report.classifiedAs).toBe("attack");
    expect(report.claimedAs).toBe("work");
    // 재분류가 반영되면 가려진 개수 안내가 사라진다.
    expect(container.textContent).not.toContain("인신공격으로 분류된 댓글 1개는");
  });
});
