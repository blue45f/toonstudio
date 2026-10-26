// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CUT_DRAW_OVER_PINS,
  DEFAULT_DEPARTMENT_CONSENSUS_VOTES,
  DEFAULT_VERSION_STACK_SNAPSHOTS,
  evaluateCreativeReviewConsensus,
} from "./production-creative-review-consensus-model";
import { ProductionCreativeReviewConsensusSuite } from "./ProductionCreativeReviewConsensusSuite";

afterEach(() => {
  cleanup();
});

describe("production-creative-review-consensus-model", () => {
  it("미해결 필수 드로오버 핀과 5대 분업 데스크 승인 쿼럼을 평가한다", () => {
    const initial = evaluateCreativeReviewConsensus(
      DEFAULT_CUT_DRAW_OVER_PINS,
      DEFAULT_DEPARTMENT_CONSENSUS_VOTES,
      DEFAULT_VERSION_STACK_SNAPSHOTS,
    );
    expect(initial.quorumReached).toBe(false);
    expect(initial.approvedRequiredCount).toBe(3);
    expect(initial.totalRequiredCount).toBe(5);
    expect(initial.unresolvedMustFixPins).toBe(2);
    expect(initial.c2paAllVerified).toBe(true);

    const allApproved = evaluateCreativeReviewConsensus(
      DEFAULT_CUT_DRAW_OVER_PINS.map((p) => ({ ...p, resolved: true })),
      DEFAULT_DEPARTMENT_CONSENSUS_VOTES.map((v) => ({ ...v, status: "approved" })),
      DEFAULT_VERSION_STACK_SNAPSHOTS,
    );
    expect(allApproved.quorumReached).toBe(true);
    expect(allApproved.publishReadinessScore).toBe(100);
  });
});

describe("ProductionCreativeReviewConsensusSuite", () => {
  it("버전 스택 전환과 드로오버 핀 해결 및 5대 데스크 일괄 승인을 수행한다", () => {
    render(<ProductionCreativeReviewConsensusSuite />);

    expect(screen.getAllByText(/필수 수정 핀 2건/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /필수 핀 일괄 해결 및 5대 데스크 전원 승인/ }));
    expect(screen.getAllByText(/필수 수정 핀 0건/).length).toBeGreaterThan(0);
    expect(screen.getByText(/반출 준비도 100%/)).toBeTruthy();
  });
});
