// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioCreatorMonetizationPanel } from "./StudioCreatorMonetizationPanel";
import { calculateKoreanCreatorSettlement } from "./monetization-burnout-engine";

afterEach(() => { cleanup(); useI18n.setState({ lang: "ko" }); });

describe("수익 계산 예제 경계", () => {
  it("세율은 사용자 입력 가정이며 법정 고정값으로 덮어쓰지 않는다", () => {
    const result = calculateKoreanCreatorSettlement({
      grossContractAmountKrw: 1_000_000, deductibleExpenseKrw: 120_000,
      vatContractMode: "vat-exclusive", nationalIncomeTaxRatePct: 5,
      localIncomeTaxRatePct: 1, vatRatePct: 20,
    });
    expect(result.freelancer.totalWithholdingTaxKrw).toBe(60_000);
    expect(result.businessVat.outputVatKrw).toBe(200_000);
    expect(result.businessVat.inputVatCreditKrw).toBe(20_000);
    expect(result.provenance.noticeKo).toContain("가정");
  });

  it("소액의 두 세액을 각각 반올림해도 원천징수 합계가 총액을 넘지 않는다", () => {
    const result = calculateKoreanCreatorSettlement({
      grossContractAmountKrw: 1, deductibleExpenseKrw: 0, vatContractMode: "vat-exclusive",
      nationalIncomeTaxRatePct: 50, localIncomeTaxRatePct: 50, vatRatePct: 0,
    });
    expect(result.freelancer.totalWithholdingTaxKrw).toBe(1);
    expect(result.freelancer.immediateNetPayoutKrw).toBe(0);
    expect(result.freelancer.nationalIncomeTaxKrw + result.freelancer.localIncomeTaxKrw).toBe(1);
  });

  it("가정 세율의 비유한 값과 합산 상한을 처리하고 입력 필드와 결과를 연결한다", () => {
    const result = calculateKoreanCreatorSettlement({
      grossContractAmountKrw: Number.NaN, deductibleExpenseKrw: Number.POSITIVE_INFINITY,
      vatContractMode: "vat-inclusive", nationalIncomeTaxRatePct: 100,
      localIncomeTaxRatePct: Number.NaN, vatRatePct: Number.POSITIVE_INFINITY,
    });
    expect(result.freelancer.withholdingRatePct).toBe(100);
    expect(Number.isFinite(result.businessVat.invoiceTotalKrw)).toBe(true);
    render(<StudioCreatorMonetizationPanel initialTab="goods-tax" />);
    fireEvent.change(screen.getByTestId("input-vatRatePct"), { target: { value: "20" } });
    expect(screen.getByTestId("tax-business-invoice").textContent).toBe("4,800,000원");
    expect(screen.getByText("부가세 가정 20%")).toBeTruthy();
  });

  it("저장·의학적 진단과 구분하고 현재 앱의 영어 설정을 따른다", () => {
    useI18n.setState({ lang: "en" });
    render(<StudioCreatorMonetizationPanel />);
    expect(screen.getByTestId("monetization-estimate-badge").textContent).toContain("Estimate");
    expect(screen.getByTestId("monetization-example-scope").textContent).toContain("not saved");
    expect(screen.getByTestId("monetization-example-scope").textContent).toContain("medical");
  });

  it("알림 대기 중 중복 적용을 막고 실패한 같은 결과를 최신 수신자에게 재알림한다", async () => {
    let rejectAttempt: (error: Error) => void = () => { throw new Error("알림 미실행"); };
    const first = vi.fn((_value: unknown) => new Promise<void>((_resolve, reject) => { rejectAttempt = reject; }));
    const latest = vi.fn();
    const { rerender } = render(<StudioCreatorMonetizationPanel initialTab="burnout" onDelegationApply={first} />);
    fireEvent.click(screen.getByTestId("btn-apply-recommended-delegation"));
    const score = screen.getByTestId("burnout-score-value").textContent;
    expect(screen.getByTestId("btn-clear-delegation").hasAttribute("disabled") || screen.getByTestId("btn-clear-delegation").closest("fieldset")?.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("btn-apply-recommended-delegation"));
    expect(first).toHaveBeenCalledTimes(1);
    await act(async () => { rejectAttempt(new Error("예제 알림 실패")); });
    expect(screen.getByRole("alert").textContent).toContain("알림");
    rerender(<StudioCreatorMonetizationPanel initialTab="burnout" onDelegationApply={latest} />);
    fireEvent.click(screen.getByTestId("retry-delegation-notification"));
    expect(latest).toHaveBeenCalledWith(first.mock.calls[0]?.[0]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("burnout-score-value").textContent).toBe(score);
  });

  it("탭 알림의 동기 예외도 화면에 표시하고 재시도할 수 있다", () => {
    const failed = vi.fn(() => { throw new Error("연결 실패"); });
    const latest = vi.fn();
    const { rerender } = render(<StudioCreatorMonetizationPanel onTabChange={failed} />);
    fireEvent.click(screen.getByTestId("planner-tab-goods-tax"));
    expect(screen.getByRole("alert").textContent).toContain("알림");
    rerender(<StudioCreatorMonetizationPanel onTabChange={latest} />);
    fireEvent.click(screen.getByTestId("retry-tab-notification"));
    expect(latest).toHaveBeenCalledWith("goods-tax");
  });
});
