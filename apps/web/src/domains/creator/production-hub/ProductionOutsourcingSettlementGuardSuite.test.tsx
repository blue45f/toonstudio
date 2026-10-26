// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  calculateDivisionSettlementItem,
  DEFAULT_DIVISION_OUTSOURCING_ORDERS,
  summarizeDivisionSettlementLedger,
} from "./production-outsourcing-settlement-guard-model";
import { ProductionOutsourcingSettlementGuardSuite } from "./ProductionOutsourcingSettlementGuardSuite";

afterEach(() => {
  cleanup();
});

describe("production-outsourcing-settlement-guard-model", () => {
  it("컷 단가·난이도 할증·무료 수정 초과 할증·원천징수(3.3%)/법인 부가세(10%)를 정확히 계산한다", () => {
    const lineOrder = DEFAULT_DIVISION_OUTSOURCING_ORDERS[0];
    const lineCalc = calculateDivisionSettlementItem(lineOrder);
    // 45 * 18000 * 1.25 = 1,012,500 + 1 excess revision (85,000) = 1,097,500
    expect(lineCalc.baseSupplyKrw).toBe(1012500);
    expect(lineCalc.excessRevisionRounds).toBe(1);
    expect(lineCalc.revisionSurchargeKrw).toBe(85000);
    expect(lineCalc.grossSupplyKrw).toBe(1097500);
    expect(lineCalc.withholdingTax33Krw).toBe(Math.round(1097500 * 0.033));
    expect(lineCalc.scopeCreepDetected).toBe(true);

    const corpOrder = DEFAULT_DIVISION_OUTSOURCING_ORDERS[1];
    const corpCalc = calculateDivisionSettlementItem(corpOrder);
    expect(corpCalc.scopeCreepDetected).toBe(false);
    expect(corpCalc.vat10Krw).toBe(Math.round(corpCalc.grossSupplyKrw * 0.1));
    expect(corpCalc.netPayoutOrInvoiceKrw).toBe(corpCalc.grossSupplyKrw + corpCalc.vat10Krw);

    const summary = summarizeDivisionSettlementLedger(DEFAULT_DIVISION_OUTSOURCING_ORDERS);
    expect(summary.totalOrders).toBe(4);
    expect(summary.scopeCreepOrderCount).toBe(2);
    expect(summary.settledOrderCount).toBe(2);
  });
});

describe("ProductionOutsourcingSettlementGuardSuite", () => {
  it("무료 수정 횟수 가드 조정 및 전 공정 에스크로 정산 완료를 수행한다", () => {
    render(<ProductionOutsourcingSettlementGuardSuite />);

    expect(screen.getByText(/수정 초과 할증 2건/)).toBeTruthy();
    expect(screen.getByText(/에스크로 정산 2\/4/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /전 공정 에스크로 검수 승인 및 정산 완료 처리/ }));
    expect(screen.getByText(/에스크로 정산 4\/4/)).toBeTruthy();
  });
});
