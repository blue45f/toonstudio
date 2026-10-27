// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COAUTHOR_LANES,
  evaluateCoauthorRevenueMirror,
} from "./collaboration-coauthor-revenue-mirror-model";
import { CollaborationCoauthorRevenueMirrorSuite } from "./CollaborationCoauthorRevenueMirrorSuite";

afterEach(() => {
  cleanup();
});

describe("evaluateCoauthorRevenueMirror", () => {
  it("verifies 100% balanced RS & secondary rights and computes net distributable pool with sponsorship bonus", () => {
    const result = evaluateCoauthorRevenueMirror({
      ledgerCode: "POSTYPE-RS-2026",
      settlementCycle: "monthly-25th",
      projectedGrossKrw: 10_000_000,
      platformFeePct: 10,
      includeFanSponsorshipPool: true,
      lanes: DEFAULT_COAUTHOR_LANES,
    });

    expect(result.totalSharePct).toBe(100);
    expect(result.totalSecondaryRightsPct).toBe(100);
    expect(result.allocationBalanced).toBe(true);
    // (10,000,000 + 800,000) * 0.9 = 9,720,000
    expect(result.netDistributableKrw).toBe(9_720_000);
    expect(result.lanes[0]?.estimatedMonthlyNetKrw).toBe(3_402_000);
  });

  it("flags unbalanced battery warning when total RS percentages do not sum to 100%", () => {
    const unbalancedLanes = DEFAULT_COAUTHOR_LANES.map((lane, index) =>
      index === 0 ? { ...lane, revenueSharePct: 50 } : lane,
    );

    const result = evaluateCoauthorRevenueMirror({
      ledgerCode: "POSTYPE-RS-2026",
      settlementCycle: "per-episode-release",
      projectedGrossKrw: 10_000_000,
      platformFeePct: 10,
      includeFanSponsorshipPool: false,
      lanes: unbalancedLanes,
    });

    expect(result.totalSharePct).toBe(115);
    expect(result.allocationBalanced).toBe(false);
    expect(result.statusSummaryKo).toContain("배터리 지분 불일치 경고");
  });
});

describe("CollaborationCoauthorRevenueMirrorSuite", () => {
  it("renders Postype & Monday.com co-author RS suite, switches to 4-way equal split, and inserts summary into terms", () => {
    const onApplySummary = vi.fn();
    render(<CollaborationCoauthorRevenueMirrorSuite onApplySummaryToTerms={onApplySummary} />);

    expect(screen.getByTestId("collaboration-coauthor-revenue-mirror-suite")).toBeDefined();
    expect(screen.getByTestId("coauthor-rs-battery-badge").textContent).toContain("100%");

    fireEvent.click(screen.getByTestId("coauthor-equal-split-btn"));
    // (12,000,000 * 1.08 * 0.9) * 0.25 = 2,916,000
    expect(screen.getByTestId("coauthor-payout-story_conte").textContent).toContain("2,916,000원");

    fireEvent.click(screen.getByTestId("coauthor-insert-terms-btn"));
    expect(onApplySummary).toHaveBeenCalledTimes(1);
  });
});
