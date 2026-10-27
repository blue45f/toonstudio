// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  approveAndPassLayerOwnerRule,
  DEFAULT_LAYER_OWNER_RULES,
  evaluateLayerOwnersMergeGate,
  pushNewLayerRevisionWithStaleDismissal,
} from "./production-layer-owners-merge-gate-model";
import { ProductionLayerOwnersMergeGateSuite } from "./ProductionLayerOwnersMergeGateSuite";

afterEach(() => {
  cleanup();
});

describe("ProductionLayerOwnersMergeGateSuite (GitHub CODEOWNERS + Airtable Rollup REA)", () => {
  it("evaluates initial merge gate as blocked until color-fx rule is approved and checks pass", () => {
    const initial = evaluateLayerOwnersMergeGate(DEFAULT_LAYER_OWNER_RULES);
    expect(initial.protectedBranchReady).toBe(false);
    expect(initial.blockedRuleCount).toBe(1);
    expect(initial.mergeableRuleCount).toBe(3);

    const afterApproval = evaluateLayerOwnersMergeGate(
      approveAndPassLayerOwnerRule(DEFAULT_LAYER_OWNER_RULES, "owner-rule-color"),
    );
    expect(afterApproval.protectedBranchReady).toBe(true);
    expect(afterApproval.blockedRuleCount).toBe(0);
  });

  it("dismisses existing approvals when a new layer revision is pushed", () => {
    const updated = pushNewLayerRevisionWithStaleDismissal(
      DEFAULT_LAYER_OWNER_RULES,
      "owner-rule-lineart",
      "rev_new_lineart_02",
    );
    const lineart = updated.find((r) => r.id === "owner-rule-lineart")!;
    expect(lineart.currentApprovals).toBe(0);
    expect(lineart.staleDismissedCount).toBe(2);
    expect(lineart.fieldLocked).toBe(false);
    expect(lineart.latestRevisionHash).toBe("rev_new_lineart_02");
  });

  it("renders accessible scrollable table region and unlocks merge gate on approval click", () => {
    render(<ProductionLayerOwnersMergeGateSuite />);

    const region = screen.getByRole("region");
    expect(region.getAttribute("tabindex")).toBe("0");

    expect(screen.getByText(/병합 차단/)).toBeTruthy();

    const approveBtn = screen.getByRole("button", { name: /오너 승인 및 규격 통과/ });
    fireEvent.click(approveBtn);

    expect(screen.getByText(/보호 브랜치 병합 가능/)).toBeTruthy();
  });
});
