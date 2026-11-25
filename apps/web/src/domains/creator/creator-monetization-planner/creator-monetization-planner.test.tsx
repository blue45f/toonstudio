// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BURNOUT_SCENARIO_PRESETS,
  DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
  DEFAULT_KOREAN_SETTLEMENT_INPUT,
  DEFAULT_PAYWALL_FUNNEL_INPUT,
  DEFAULT_STAGE_MINUTES_PER_CUT,
  DEFAULT_WEEKLY_BURNOUT_INPUT,
  GOODS_PRESETS,
  PAYWALL_SCENARIO_PRESETS,
  PRODUCTION_STAGE_CATALOG,
  StudioCreatorMonetizationPanel,
  calculateGoodsUnitEconomics,
  calculateKoreanCreatorSettlement,
  forecastWeeklyBurnoutRisk,
  formatKrw,
  simulatePaywallFunnel,
} from "./index";

afterEach(cleanup);

describe("1. 유료 미리보기 전환 퍼널 · MG 회수 시뮬레이터 (simulatePaywallFunnel)", () => {
  it("유료 미리보기 5화 단계별 전환·구매자 수·매출과 추정(estimate) 메타를 정확히 산출한다", () => {
    const result = simulatePaywallFunnel({
      freeEpisodeReaders: 100000,
      freeEpisodeCount: 10,
      previewEpisodeCount: 5,
      initialPreviewConversionPct: 5,
      stepRetentionRatePct: 80,
      pricePerPreviewEpisodeKrw: 200,
      appStoreFeePct: 10,
      platformFeePct: 30,
      episodesPerMonth: 4,
      mgPerEpisodeKrw: 0,
      upfrontAdvanceKrw: 0,
    });

    expect(result.dataSourceKind).toBe("estimate");
    expect(result.provenance.badgeLabelKo).toBe("추정");
    expect(result.previewSteps).toHaveLength(5);
    expect(result.previewSteps[0]?.payingReaders).toBe(5000);
    expect(result.previewSteps[1]?.payingReaders).toBe(4000);
    expect(result.previewSteps[2]?.payingReaders).toBe(3200);
    expect(result.previewSteps[3]?.payingReaders).toBe(2560);
    expect(result.previewSteps[4]?.payingReaders).toBe(2048);
    expect(result.totalPaidUnlocksPerCycle).toBe(16808);
    expect(result.creatorSharePct).toBe(70);
    expect(result.netRealizationRatePct).toBe(63);
    expect(result.grossRevenuePerEpisodeKrw).toBe(3_361_600);
    expect(result.monthlyGrossRevenueKrw).toBe(13_446_400);
    expect(result.mgRecoupmentStatus).toBe("no-mg");
    expect(result.mgRecoupmentMonths).toBe(0);
  });

  it("회차당 RS가 MG를 초과하고 선인세가 있으면 정확한 회수 회차와 개월 수를 계산한다", () => {
    const result = simulatePaywallFunnel(DEFAULT_PAYWALL_FUNNEL_INPUT);

    expect(result.creatorRsPerEpisodeKrw).toBeGreaterThan(DEFAULT_PAYWALL_FUNNEL_INPUT.mgPerEpisodeKrw);
    expect(result.mgRecoupmentStatus).toBe("recouping-advance");
    expect(result.mgRecoupmentEpisodes).not.toBeNull();
    expect(result.mgRecoupmentMonths).not.toBeNull();
    expect(result.monthlyRsSurplusOverMgKrw).toBeGreaterThan(0);
    expect(result.monthlyMgShortfallKrw).toBe(0);
    expect(result.mgCoverageRatioPct).toBeGreaterThan(100);
  });

  it("선인세 없이 회차당 RS가 MG 이상이면 매 회차 즉시 회수(surplus-immediate)로 판정한다", () => {
    const hitPreset = PAYWALL_SCENARIO_PRESETS.find((item) => item.id === "hit-preview-5");
    expect(hitPreset).toBeDefined();
    const result = simulatePaywallFunnel(hitPreset!.input);

    expect(result.mgRecoupmentStatus).toBe("surplus-immediate");
    expect(result.mgRecoupmentEpisodes).toBe(1);
    expect(result.monthlyCashflowBeforeTaxKrw).toBe(result.monthlyCreatorRsKrw);
  });

  it("회차당 RS가 MG에 미달하면 mg-deficit과 필요 전환율·필요 독자 수를 산출한다", () => {
    const result = simulatePaywallFunnel({
      ...DEFAULT_PAYWALL_FUNNEL_INPUT,
      freeEpisodeReaders: 25000,
      mgPerEpisodeKrw: 1_500_000,
      upfrontAdvanceKrw: 0,
    });

    expect(result.mgRecoupmentStatus).toBe("mg-deficit");
    expect(result.mgRecoupmentMonths).toBeNull();
    expect(result.monthlyMgShortfallKrw).toBeGreaterThan(0);
    expect(result.monthlyCashflowBeforeTaxKrw).toBe(result.monthlyMgAdvanceKrw);
    expect(result.requiredInitialConversionPctForMg).not.toBeNull();
    expect(result.requiredInitialConversionPctForMg!).toBeGreaterThan(
      DEFAULT_PAYWALL_FUNNEL_INPUT.initialPreviewConversionPct,
    );
    expect(result.requiredFreeReadersForMg!).toBeGreaterThan(25000);
  });

  it("보수·기준·낙관 3구간 민감도 밴드가 단조 증가하며 비정상 입력을 안전하게 보정한다", () => {
    const normal = simulatePaywallFunnel(DEFAULT_PAYWALL_FUNNEL_INPUT);
    expect(normal.sensitivityBands).toHaveLength(3);
    expect(normal.sensitivityBands[0]!.monthlyCreatorRsKrw).toBeLessThan(
      normal.sensitivityBands[1]!.monthlyCreatorRsKrw,
    );
    expect(normal.sensitivityBands[1]!.monthlyCreatorRsKrw).toBeLessThan(
      normal.sensitivityBands[2]!.monthlyCreatorRsKrw,
    );

    const sanitized = simulatePaywallFunnel({
      freeEpisodeReaders: Number.NaN,
      freeEpisodeCount: -5,
      previewEpisodeCount: 99,
      initialPreviewConversionPct: 250,
      stepRetentionRatePct: -10,
      pricePerPreviewEpisodeKrw: -300,
      appStoreFeePct: 99,
      platformFeePct: 120,
      episodesPerMonth: 0,
      mgPerEpisodeKrw: Number.POSITIVE_INFINITY,
      upfrontAdvanceKrw: -100,
    });
    expect(sanitized.sanitizedInput.previewEpisodeCount).toBe(20);
    expect(sanitized.sanitizedInput.initialPreviewConversionPct).toBe(100);
    expect(sanitized.sanitizedInput.stepRetentionRatePct).toBe(0);
    expect(sanitized.sanitizedInput.pricePerPreviewEpisodeKrw).toBe(0);
    expect(sanitized.sanitizedInput.appStoreFeePct).toBe(50);
    expect(sanitized.sanitizedInput.platformFeePct).toBe(90);
    expect(sanitized.sanitizedInput.episodesPerMonth).toBe(1);
    expect(sanitized.sanitizedInput.upfrontAdvanceKrw).toBe(0);
  });
});

describe("2. 굿즈 제작 손익분기(MOQ/BEP) 계산기 (calculateGoodsUnitEconomics)", () => {
  it("아크릴 스탠드·포토카드·단행본 3종 프리셋 모두 양수 공헌이익과 실전 BEP 수량을 산출한다", () => {
    expect(GOODS_PRESETS).toHaveLength(3);
    for (const preset of GOODS_PRESETS) {
      const result = calculateGoodsUnitEconomics(preset.input);
      expect(result.dataSourceKind).toBe("estimate");
      expect(result.isUnitMarginPositive).toBe(true);
      expect(result.contributionMarginPerUnitKrw).toBeGreaterThan(0);
      expect(result.breakEvenUnits).not.toBeNull();
      expect(result.moqAchievable).toBe(true);
      expect(result.netProfitKrw).toBeGreaterThan(0);
      expect(result.netProfitMarginPct).toBeGreaterThan(0);
    }
  });

  it("발주 계획 수량이 MOQ 미만이면 belowMoqWarning을 켜고 MOQ 기준으로 선투자 원가를 산정한다", () => {
    const result = calculateGoodsUnitEconomics({
      ...DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
      moqUnits: 100,
      plannedOrderUnits: 40,
    });

    expect(result.belowMoqWarning).toBe(true);
    expect(result.effectiveOrderUnits).toBe(100);
    expect(result.totalManufacturingCostKrw).toBe(100 * DEFAULT_GOODS_UNIT_ECONOMICS_INPUT.unitManufacturingCostKrw);
  });

  it("개당 변동비가 판매가 이상인 역마진 구조에서는 BEP를 null로 반환하고 경고를 표시한다", () => {
    const result = calculateGoodsUnitEconomics({
      ...DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
      sellingPriceKrw: 6000,
      unitManufacturingCostKrw: 4000,
      packagingAndShippingPerUnitKrw: 2500,
      channelFeePct: 10,
    });

    expect(result.isUnitMarginPositive).toBe(false);
    expect(result.contributionMarginPerUnitKrw).toBeLessThan(0);
    expect(result.breakEvenUnits).toBeNull();
    expect(result.moqAchievable).toBe(false);
    expect(result.netProfitKrw).toBeLessThan(0);
  });

  it("예상 판매율 변화에 따라 판매 수량·잔여 재고·순이익이 정확히 연동된다", () => {
    const highSell = calculateGoodsUnitEconomics({
      ...DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
      plannedOrderUnits: 100,
      expectedSellThroughPct: 90,
    });
    const lowSell = calculateGoodsUnitEconomics({
      ...DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
      plannedOrderUnits: 100,
      expectedSellThroughPct: 30,
    });

    expect(highSell.expectedSoldUnits).toBe(90);
    expect(highSell.unsoldInventoryUnits).toBe(10);
    expect(lowSell.expectedSoldUnits).toBe(30);
    expect(lowSell.unsoldInventoryUnits).toBe(70);
    expect(highSell.netProfitKrw).toBeGreaterThan(lowSell.netProfitKrw);
    expect(lowSell.netProfitKrw).toBeLessThan(0);
  });
});

describe("3. 한국 창작자 정산 비교기 (calculateKoreanCreatorSettlement)", () => {
  it("프리랜서 3.3%(국세 3.0%+지방세 0.3%) 원천징수와 실수령액을 원 단위까지 정확히 계산한다", () => {
    const result = calculateKoreanCreatorSettlement({
      grossContractAmountKrw: 4_000_000,
      deductibleExpenseKrw: 0,
      vatContractMode: "vat-exclusive",
    });

    expect(result.dataSourceKind).toBe("estimate");
    expect(result.freelancer.nationalIncomeTaxKrw).toBe(120_000);
    expect(result.freelancer.localIncomeTaxKrw).toBe(12_000);
    expect(result.freelancer.totalWithholdingTaxKrw).toBe(132_000);
    expect(result.freelancer.immediateNetPayoutKrw).toBe(3_868_000);
  });

  it("사업자 부가세 별도(vat-exclusive) 계약에서 매출부가세 10%와 매입세액 공제(1/11)를 정확히 정산한다", () => {
    const result = calculateKoreanCreatorSettlement(DEFAULT_KOREAN_SETTLEMENT_INPUT);

    expect(result.businessVat.supplyAmountKrw).toBe(4_000_000);
    expect(result.businessVat.outputVatKrw).toBe(400_000);
    expect(result.businessVat.invoiceTotalKrw).toBe(4_400_000);
    expect(result.businessVat.inputVatCreditKrw).toBe(80_000);
    expect(result.businessVat.netVatPayableKrw).toBe(320_000);
    expect(result.businessVat.vatRefundKrw).toBe(0);
    expect(result.businessVat.netAfterVatAndExpensesKrw).toBe(3_200_000);
    expect(result.comparison.favoredCashflowStructure).toBe("business-vat-10");
  });

  it("사업자 부가세 포함(vat-inclusive) 계약에서는 1/1.1 역산 공급가와 프리랜서 3.3% 차이를 정확히 비교한다", () => {
    const result = calculateKoreanCreatorSettlement({
      grossContractAmountKrw: 4_400_000,
      deductibleExpenseKrw: 0,
      vatContractMode: "vat-inclusive",
    });

    expect(result.businessVat.invoiceTotalKrw).toBe(4_400_000);
    expect(result.businessVat.supplyAmountKrw).toBe(4_000_000);
    expect(result.businessVat.outputVatKrw).toBe(400_000);
    expect(result.businessVat.netAfterVatAndExpensesKrw).toBe(4_000_000);
    expect(result.freelancer.immediateNetPayoutKrw).toBe(4_254_800);
    expect(result.comparison.favoredCashflowStructure).toBe("freelancer-3.3");
  });

  it("매입 경비가 매출보다 큰 초기 제작 투자 구간에서는 부가세 환급(vatRefundKrw)을 산출한다", () => {
    const result = calculateKoreanCreatorSettlement({
      grossContractAmountKrw: 1_000_000,
      deductibleExpenseKrw: 2_200_000,
      vatContractMode: "vat-exclusive",
    });

    expect(result.businessVat.outputVatKrw).toBe(100_000);
    expect(result.businessVat.inputVatCreditKrw).toBe(200_000);
    expect(result.businessVat.netVatPayableKrw).toBe(0);
    expect(result.businessVat.vatRefundKrw).toBe(100_000);
    expect(result.businessVat.netAfterVatAndExpensesKrw).toBe(-1_000_000);
  });
});

describe("4. 주간 마감 번아웃 · 어시스트 배분 예측기 (forecastWeeklyBurnoutRisk)", () => {
  it("5개 공정(콘티·선화·채색·배경·식자) 소요시간과 수정 버퍼를 합산하고 0~100 범위 점수를 반환한다", () => {
    expect(PRODUCTION_STAGE_CATALOG.map((s) => s.stageId)).toEqual([
      "conti",
      "lineart",
      "coloring",
      "background",
      "lettering",
    ]);

    const result = forecastWeeklyBurnoutRisk(DEFAULT_WEEKLY_BURNOUT_INPUT);
    expect(result.dataSourceKind).toBe("estimate");
    expect(result.stages).toHaveLength(5);
    expect(result.rawProductionHours).toBe(62.8);
    expect(result.totalRequiredHours).toBe(72.3);
    expect(result.overtimeHours).toBe(27.3);
    expect(result.burnoutScore).toBeGreaterThanOrEqual(80);
    expect(result.burnoutScore).toBeLessThanOrEqual(100);
    expect(result.burnoutLevel).toBe("critical");
  });

  it("여유 프리셋은 safe 등급이며 연속 과부하 주차가 늘수록 번아웃 점수가 단조 증가한다", () => {
    const calmPreset = BURNOUT_SCENARIO_PRESETS.find((item) => item.id === "biweekly-calm");
    expect(calmPreset).toBeDefined();
    const calm = forecastWeeklyBurnoutRisk(calmPreset!.input);
    expect(calm.burnoutLevel).toBe("safe");
    expect(calm.recommendedDelegations).toHaveLength(0);

    const w0 = forecastWeeklyBurnoutRisk({
      ...DEFAULT_WEEKLY_BURNOUT_INPUT,
      weeklyCutCount: 46,
      consecutiveCrunchWeeks: 0,
    });
    const w4 = forecastWeeklyBurnoutRisk({
      ...DEFAULT_WEEKLY_BURNOUT_INPUT,
      weeklyCutCount: 46,
      consecutiveCrunchWeeks: 4,
    });
    expect(w4.burnoutScore).toBeGreaterThan(w0.burnoutScore);
  });

  it("과부하 시 핵심 창작 공정(콘티)을 보존하고 채색·배경·식자 순으로 위임 추천을 생성한다", () => {
    const result = forecastWeeklyBurnoutRisk(DEFAULT_WEEKLY_BURNOUT_INPUT);
    expect(result.recommendedDelegations.length).toBeGreaterThanOrEqual(2);
    const recommendedIds = result.recommendedDelegations.map((rec) => rec.stageId);
    expect(recommendedIds).not.toContain("conti");
    expect(recommendedIds.slice(0, 2).sort()).toEqual(["background", "coloring"]);
  });

  it("공정을 위임하면 작가 직접 시간과 번아웃 점수가 감소하고 주간 위임 예산이 합산된다", () => {
    const before = forecastWeeklyBurnoutRisk(DEFAULT_WEEKLY_BURNOUT_INPUT);
    const after = forecastWeeklyBurnoutRisk({
      ...DEFAULT_WEEKLY_BURNOUT_INPUT,
      delegatedStages: ["background", "coloring", "lettering"],
    });

    expect(after.remainingAuthorHours).toBeLessThan(before.remainingAuthorHours);
    expect(after.burnoutScore).toBeLessThan(before.burnoutScore);
    expect(after.burnoutScoreBeforeDelegation).toBe(before.burnoutScore);
    expect(after.burnoutReliefPoints).toBe(before.burnoutScore - after.burnoutScore);
    expect(after.weeklyDelegationBudgetKrw).toBeGreaterThan(0);
    expect(after.sustainableCutCapacity).toBeGreaterThan(before.sustainableCutCapacity);
  });

  it("formatKrw 유틸리티가 유한 숫자와 비정상 숫자를 안전하게 원화 문자열로 포맷한다", () => {
    expect(formatKrw(1_250_000)).toBe("1,250,000원");
    expect(formatKrw(Number.NaN)).toBe("0원");
  });
});

describe("5. StudioCreatorMonetizationPanel UI 인터랙션 및 접근성 검증", () => {
  it("props 없이 단독 렌더링되며 추정 배지와 3개 접근성 탭을 표시한다", () => {
    render(<StudioCreatorMonetizationPanel />);

    expect(screen.getByTestId("creator-monetization-planner-panel")).toBeTruthy();
    expect(screen.getByTestId("monetization-estimate-badge").textContent).toContain("추정");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("planner-tab-paywall").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("tabpanel-paywall")).toBeTruthy();
    expect(screen.getByTestId("paywall-step-5")).toBeTruthy();
  });

  it("유료 미리보기 탭에서 프리셋 변경 및 독자 수 입력 시 KPI와 MG 상태가 실시간 갱신된다", () => {
    render(<StudioCreatorMonetizationPanel />);

    fireEvent.click(screen.getByTestId("paywall-preset-indie-challenge"));
    expect(screen.getByTestId("mg-status-pill").textContent).toContain("무MG");

    fireEvent.click(screen.getByTestId("paywall-preset-weekly-pro-mg"));
    fireEvent.change(screen.getByTestId("input-free-readers"), { target: { value: "10000" } });
    expect(screen.getByTestId("mg-status-pill").textContent).toContain("MG 미달");
  });

  it("굿즈·세무 정산 탭에서 품목 전환·MOQ 경고·매출 연동·부가세 모드 전환이 동작한다", () => {
    const onTabChange = vi.fn();
    render(<StudioCreatorMonetizationPanel onTabChange={onTabChange} />);

    fireEvent.click(screen.getByTestId("planner-tab-goods-tax"));
    expect(onTabChange).toHaveBeenCalledWith("goods-tax");
    expect(screen.getByTestId("tabpanel-goods-tax")).toBeTruthy();

    fireEvent.click(screen.getByTestId("goods-preset-print-book"));
    fireEvent.change(screen.getByTestId("input-goods-order-units"), { target: { value: "100" } });
    expect(screen.getByTestId("goods-moq-warning")).toBeTruthy();

    fireEvent.click(screen.getByTestId("sync-goods-to-tax"));
    const exclNet = screen.getByTestId("tax-business-net-after-expenses").textContent;
    fireEvent.click(screen.getByTestId("vat-mode-vat-inclusive"));
    const inclNet = screen.getByTestId("tax-business-net-after-expenses").textContent;
    expect(inclNet).not.toBe(exclNet);
  });

  it("주간 번아웃 탭에서 추천 위임 일괄 적용·개별 공정 토글 시 번아웃 점수가 감소하고 콜백이 호출된다", () => {
    const onDelegationApply = vi.fn();
    render(<StudioCreatorMonetizationPanel initialTab="burnout" onDelegationApply={onDelegationApply} />);

    const initialScoreText = screen.getByTestId("burnout-score-value").textContent ?? "";
    const initialScore = Number.parseInt(initialScoreText, 10);
    expect(initialScore).toBeGreaterThanOrEqual(80);

    fireEvent.click(screen.getByTestId("btn-apply-recommended-delegation"));
    expect(onDelegationApply).toHaveBeenCalledTimes(1);

    const afterScoreText = screen.getByTestId("burnout-score-value").textContent ?? "";
    const afterScore = Number.parseInt(afterScoreText, 10);
    expect(afterScore).toBeLessThan(initialScore);
    expect(screen.getByTestId("burnout-relief-badge")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-clear-delegation"));
    const resetScore = Number.parseInt(screen.getByTestId("burnout-score-value").textContent ?? "", 10);
    expect(resetScore).toBe(initialScore);
  });

  it("영문 locale prop을 전달하면 영문 레이블과 Estimate 배지로 렌더링된다", () => {
    render(<StudioCreatorMonetizationPanel locale="en" initialTab="burnout" />);

    expect(screen.getByTestId("monetization-estimate-badge").textContent).toContain("Estimate");
    expect(screen.getByTestId("planner-tab-burnout").textContent).toContain("Burnout");
    expect(DEFAULT_STAGE_MINUTES_PER_CUT.conti).toBe(10);
  });

  it("모든 3개 탭의 렌더 DOM이 Calm Atelier 시맨틱 토큰·접근성 레이블·추정 배지를 유지한다", () => {
    const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
    const rawPaletteClassPattern =
      /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

    const { container } = render(<StudioCreatorMonetizationPanel />);
    const tabIds = ["paywall", "goods-tax", "burnout"] as const;

    for (const tabId of tabIds) {
      fireEvent.click(screen.getByTestId(`planner-tab-${tabId}`));
      expect(screen.getByTestId("tab-estimate-notice").textContent).toContain("추정");

      const html = container.innerHTML;
      expect(html).toContain("[word-break:keep-all]");
      expect(html).toContain("tabular-nums");
      expect(html).toContain("min-h-11");
      expect(rawColorPattern.test(html)).toBe(false);
      expect(rawPaletteClassPattern.test(html)).toBe(false);

      const inputs = Array.from(container.querySelectorAll("input"));
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        const id = input.getAttribute("id");
        expect(id).toBeTruthy();
        expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
      }
    }
  });
});
