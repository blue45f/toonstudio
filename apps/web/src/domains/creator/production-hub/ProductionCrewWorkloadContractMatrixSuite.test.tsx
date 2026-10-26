// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  INITIAL_CREW_SEAT_CONTRACT_RECORDS,
  evaluateCrewWorkloadAndContractMatrix,
  rebalanceOverloadedInkingCuts,
} from "./production-crew-workload-contract-matrix-model";
import { ProductionCrewWorkloadContractMatrixSuite } from "./ProductionCrewWorkloadContractMatrixSuite";

describe("ProductionCrewWorkloadContractMatrixSuite", () => {
  it("evaluates overloaded seats and improves readiness score after rebalancing and signing contract", () => {
    const initial = evaluateCrewWorkloadAndContractMatrix(INITIAL_CREW_SEAT_CONTRACT_RECORDS);
    expect(initial.overloadedSeatCount).toBe(1);
    expect(initial.compliantSeatCount).toBe(4);

    const rebalanced = evaluateCrewWorkloadAndContractMatrix(
      rebalanceOverloadedInkingCuts(INITIAL_CREW_SEAT_CONTRACT_RECORDS, 8)
    );
    expect(rebalanced.overloadedSeatCount).toBe(0);
    expect(rebalanced.readinessScore).toBeGreaterThan(initial.readinessScore);
  });

  it("renders crew workload matrix and supports cut rebalancing + contract signature toggle", () => {
    render(<ProductionCrewWorkloadContractMatrixSuite />);

    expect(screen.getByTestId("production-crew-workload-contract-matrix-suite")).toBeTruthy();
    expect(screen.getByTestId("crew-overloaded-count").textContent).toBe("1");

    fireEvent.click(screen.getByTestId("rebalance-inking-cuts-btn"));
    expect(screen.getByTestId("crew-overloaded-count").textContent).toBe("0");

    fireEvent.click(screen.getByTestId("toggle-contract-btn-seat-color-fx"));
    expect(screen.getByTestId("crew-compliant-count").textContent).toBe("5/5");
  });
});
