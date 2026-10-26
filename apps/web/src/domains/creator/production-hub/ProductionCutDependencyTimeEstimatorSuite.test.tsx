// @vitest-environment jsdom
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { evaluateEpisodeCutDependencyCriticalPath } from "./production-cut-dependency-time-estimator-model";
import { ProductionCutDependencyTimeEstimatorSuite } from "./ProductionCutDependencyTimeEstimatorSuite";

describe("ProductionCutDependencyTimeEstimatorSuite", () => {
  it("calculates parallel critical path savings over sequential hours across 6 DAG stages", () => {
    const report = evaluateEpisodeCutDependencyCriticalPath({
      targetCutCount: 70,
      actionCutRatioPercent: 40,
      bg3dCutRatioPercent: 50,
      parallelInkingAssistants: 2,
      weeklyDeadlineBudgetHours: 96,
    });

    expect(report.nodes).toHaveLength(6);
    expect(report.criticalPathHours).toBeLessThan(report.sequentialTotalHours);
    expect(report.parallelSavedHours).toBe(
      report.sequentialTotalHours - report.criticalPathHours
    );
  });

  it("renders DAG critical path table and updates hours when parallel inking crew changes", () => {
    render(<ProductionCutDependencyTimeEstimatorSuite defaultTargetCuts={75} />);

    expect(screen.getByTestId("production-cut-dependency-time-estimator-suite")).toBeTruthy();
    const initialCritical = screen.getByTestId("dag-critical-path-hours").textContent;

    fireEvent.change(screen.getByTestId("dag-ink-crew-select"), {
      target: { value: "1" },
    });
    const soloCritical = screen.getByTestId("dag-critical-path-hours").textContent;
    expect(soloCritical).not.toBe(initialCritical);
  });
});
