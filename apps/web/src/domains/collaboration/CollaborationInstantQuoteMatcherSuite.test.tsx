// @vitest-environment jsdom
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { evaluateInstantQuoteAndSpecialistMatch } from "./collaboration-instant-quote-matcher-model";
import { CollaborationInstantQuoteMatcherSuite } from "./CollaborationInstantQuoteMatcherSuite";

describe("CollaborationInstantQuoteMatcherSuite", () => {
  it("computes deterministic 3-step milestone splits and ranks matched specialists by role", () => {
    const result = evaluateInstantQuoteAndSpecialistMatch({
      processRole: "background",
      episodeCutCount: 70,
      turnaroundUrgency: "express-72h",
      ipRightsScope: "global-localization",
      sourceFileDelivery: "full-3d-scene-bundle",
    });

    expect(result.clampedCutCount).toBe(70);
    expect(result.estimatedTotalKRW).toBe(result.perCutUnitKRW * 70);
    const sumMilestones = result.milestoneSplit.reduce((acc, item) => acc + item.amountKRW, 0);
    expect(sumMilestones).toBe(result.estimatedTotalKRW);
    expect(result.matchedSpecialists[0]?.processRole).toBe("background");
    expect(result.freeRevisionRounds).toBe(3);
  });

  it("renders interactive quote estimator, triggers role filter callback, and dispatches instant quote request", () => {
    const onApplyRoleFilter = vi.fn();
    render(<CollaborationInstantQuoteMatcherSuite onApplyRoleFilter={onApplyRoleFilter} />);

    expect(screen.getByTestId("collaboration-instant-quote-matcher-suite")).toBeTruthy();

    fireEvent.change(screen.getByTestId("quote-role-select"), {
      target: { value: "color" },
    });
    expect(onApplyRoleFilter).toHaveBeenCalledWith("color");

    fireEvent.change(screen.getByTestId("quote-cut-count-input"), {
      target: { value: "80" },
    });
    expect(screen.getByTestId("instant-quote-total-badge").textContent).toContain("80");

    const topProBtn = screen.getByTestId("dispatch-quote-btn-pro-color-01");
    fireEvent.click(topProBtn);
    expect(topProBtn.textContent).toMatch(/견적 발송 완료|Quote Sent/);
  });
});
