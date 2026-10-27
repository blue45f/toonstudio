// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { evaluateStepConfirmAndRollbackGuard } from "./collaboration-step-confirm-spec-model";
import { CollaborationStepConfirmSpecSuite } from "./CollaborationStepConfirmSpecSuite";

describe("CollaborationStepConfirmSpecSuite", () => {
  it("flags upstream rollback surcharge when requesting step1-rough changes while at step3-flats", () => {
    const rollbackEval = evaluateStepConfirmAndRollbackGuard({
      currentStageId: "step3-flats",
      requestedChangeTargetStageId: "step1-rough",
      baseEpisodeContractKRW: 600_000,
      usedConfirmCountInCurrentStage: 1,
      includedConfirmQuotaPerStage: 2,
      brushPresetSynced: true,
      colorScriptSynced: true,
      layerNamingRuleSynced: true,
      ndaAndPilotEscrowLocked: true,
    });

    expect(rollbackEval.isUpstreamRollback).toBe(true);
    expect(rollbackEval.rollbackStepsCount).toBe(2);
    expect(rollbackEval.rollbackSurchargeKRW).toBeGreaterThan(0);
    expect(rollbackEval.gateVerdict).toBe("upstream-rollback-guard");
  });

  it("renders 4-stage confirm gate and switches verdict when upstream rollback is selected", () => {
    render(<CollaborationStepConfirmSpecSuite />);

    expect(screen.getByTestId("collaboration-step-confirm-spec-suite")).toBeTruthy();
    expect(
      screen.getByTestId("step-confirm-verdict-banner").getAttribute("data-verdict")
    ).toBe("pass-in-scope");

    fireEvent.change(screen.getByTestId("step-confirm-target-stage-select"), {
      target: { value: "step1-rough" },
    });
    expect(
      screen.getByTestId("step-confirm-verdict-banner").getAttribute("data-verdict")
    ).toBe("upstream-rollback-guard");
  });
});
