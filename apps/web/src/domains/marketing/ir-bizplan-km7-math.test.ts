import { describe, expect, it } from "vitest";

import {
  CLEANROOM_EIGHT_ENGINES,
  INFRA_COST_COMPARISON,
  INVESTOR_DEFENSE_QA,
  IR_SHARED_VERIFIED_DATE,
  IR_SHARED_VERIFIED_METRICS,
  SOLO_LICENSE_INTEGRITY_CHECKS,
  UNIT_ECONOMICS_PRESETS,
} from "./ir-bizplan-shared-facts";
import {
  compareKm7AndRgbMix,
  computeUnitEconomics,
  PIGMENT_DEMO_PRESETS,
  rgb01ToHex,
} from "./ir-bizplan-km7-math";

describe("7밴드 KM 분광 안료 및 단위경제성 수학 정본", () => {
  it("코발트 블루 + 카드뮴 옐로 50% 혼색 시 KM7이 일반 RGB보다 선명한 녹색을 만든다", () => {
    const preset = PIGMENT_DEMO_PRESETS[0];
    const mix = compareKm7AndRgbMix(preset.colorA, preset.colorB, 0.5);

    expect(mix.km7Bands).toHaveLength(7);
    for (const band of mix.km7Bands) {
      expect(band).toBeGreaterThanOrEqual(0.002);
      expect(band).toBeLessThanOrEqual(1);
    }
    // 물리적 녹색 대역(Oklab hue 약 110°~175°)과 뚜렷한 채도 보존 확인
    expect(mix.km7HueDeg).toBeGreaterThan(105);
    expect(mix.km7HueDeg).toBeLessThan(175);
    expect(mix.km7Chroma).toBeGreaterThan(mix.rgbChroma);
    expect(mix.km7Hex).not.toBe(mix.rgbHex);
  });

  it("혼색 비율 0%와 100% 끝점에서 입력 색상을 그대로 보존한다", () => {
    const preset = PIGMENT_DEMO_PRESETS[1];
    const atStart = compareKm7AndRgbMix(preset.colorA, preset.colorB, 0);
    const atEnd = compareKm7AndRgbMix(preset.colorA, preset.colorB, 1);

    expect(atStart.km7Hex).toBe(rgb01ToHex(preset.colorA));
    expect(atStart.rgbHex).toBe(rgb01ToHex(preset.colorA));
    expect(atEnd.km7Hex).toBe(rgb01ToHex(preset.colorB));
    expect(atEnd.rgbHex).toBe(rgb01ToHex(preset.colorB));
  });

  it("단위경제성 계산기가 베타 ₩0 고정비·LTV:CAC·Payback·BEP를 정확히 산출한다", () => {
    const lean = computeUnitEconomics(UNIT_ECONOMICS_PRESETS[0].input);
    expect(lean.monthlyGrossRevenueKrw).toBe(19_900 * 50);
    expect(lean.contributionPerUserKrw).toBe(17_400);
    expect(lean.grossMarginPct).toBeCloseTo((17_400 / 19_900) * 100, 2);
    expect(lean.breakevenSubscribers).toBe(1);
    expect(lean.ltvToCacRatio).toBeGreaterThan(5);
    expect(lean.paybackMonths).toBeCloseTo(35_000 / 17_400, 3);

    const growth = computeUnitEconomics(UNIT_ECONOMICS_PRESETS[1].input);
    expect(growth.breakevenSubscribers).toBe(Math.ceil(450_000 / (19_900 - 2_800)));

    const negativeMargin = computeUnitEconomics({
      monthlyArpuKrw: 5_000,
      paidSubscribers: 20,
      monthlyChurnPct: 5,
      cacKrw: 20_000,
      variableCostPerUserKrw: 8_000,
      fixedMonthlyInfraKrw: 100_000,
    });
    expect(negativeMargin.breakevenSubscribers).toBeNull();
    expect(negativeMargin.paybackMonths).toBeNull();
    expect(negativeMargin.ltvKrw).toBe(0);
  });

  it("2026-11-22 단일 정본이 클린룸 8종·심사 방어 Q&A 5종·실측과 추정을 엄격히 구분한다", () => {
    expect(IR_SHARED_VERIFIED_DATE).toBe("2026-11-22");
    expect(IR_SHARED_VERIFIED_METRICS).toHaveLength(4);
    expect(CLEANROOM_EIGHT_ENGINES).toHaveLength(8);
    expect(SOLO_LICENSE_INTEGRITY_CHECKS).toHaveLength(4);
    expect(INVESTOR_DEFENSE_QA).toHaveLength(5);

    const actualInfra = INFRA_COST_COMPARISON.find((row) => row.tier === "current");
    expect(actualInfra?.monthlyCostKrw).toBe(0);
    expect(INFRA_COST_COMPARISON.filter((row) => row.tier === "estimate")).toHaveLength(2);

    const serialized = JSON.stringify({
      IR_SHARED_VERIFIED_METRICS,
      CLEANROOM_EIGHT_ENGINES,
      INVESTOR_DEFENSE_QA,
      SOLO_LICENSE_INTEGRITY_CHECKS,
    });
    expect(serialized).toContain("0133");
    expect(serialized).toContain("590");
    expect(serialized).toContain("1 GiB");
    expect(serialized).toContain("DEPLOY_MANIFEST.json");
    expect(serialized).not.toMatch(/Vercel|96\.84|96\.74|171/);
  });
});
