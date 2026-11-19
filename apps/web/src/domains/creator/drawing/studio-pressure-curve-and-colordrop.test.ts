import { describe, expect, it } from "vitest";

import {
  ColorDropThresholdController,
  PRESSURE_CURVE_PRESETS,
  evaluateEffectivePressure,
  evaluatePressureCurve,
} from "./studio-pressure-curve-and-colordrop";

describe("studio-pressure-curve-and-colordrop (AC-016 T3 + T6)", () => {
  it("T3: 베지어 압력 곡선이 경계값(0, 1)과 프리셋 특성(soft-ink > linear > firm-gpen)을 만족한다", () => {
    expect(evaluatePressureCurve(0, PRESSURE_CURVE_PRESETS.linear)).toBe(0);
    expect(evaluatePressureCurve(1, PRESSURE_CURVE_PRESETS.linear)).toBe(1);

    const midLinear = evaluatePressureCurve(0.5, PRESSURE_CURVE_PRESETS.linear);
    const midSoft = evaluatePressureCurve(0.5, PRESSURE_CURVE_PRESETS["soft-ink"]);
    const midFirm = evaluatePressureCurve(0.5, PRESSURE_CURVE_PRESETS["firm-gpen"]);

    expect(midSoft).toBeGreaterThan(midLinear);
    expect(midLinear).toBeGreaterThan(midFirm);

    const combined = evaluateEffectivePressure(
      0.5,
      PRESSURE_CURVE_PRESETS["soft-ink"],
      PRESSURE_CURVE_PRESETS["firm-gpen"],
    );
    expect(combined).toBeGreaterThan(0);
    expect(combined).toBeLessThan(1);
  });

  it("T6: ColorDrop 450ms 홀드 후 좌우 스크럽으로 임계값을 조절하고 다음 드롭에 sticky 기억한다", () => {
    const controller = new ColorDropThresholdController({
      initialThresholdPercent: 30,
      holdDelayMs: 450,
      scrubPixelsForFullRange: 200,
    });

    const start = controller.beginDrop(100, 120, 1000);
    expect(start.phase).toBe("holding");
    expect(start.thresholdPercent).toBe(30);

    // 450ms 이전 이동은 스크럽 진입 안 함
    expect(controller.moveDuringDrop(140, 1200).phase).toBe("holding");

    // 450ms 경과 후 스크럽 진입 및 우측 50px 이동 (+25%)
    expect(controller.moveDuringDrop(140, 1500).phase).toBe("scrubbing");
    const scrubbed = controller.moveDuringDrop(190, 1560);
    expect(scrubbed.thresholdPercent).toBe(55);

    const committed = controller.commitDrop();
    expect(committed.phase).toBe("committed");
    expect(committed.thresholdPercent).toBe(55);
    expect(controller.getStickyThresholdPercent()).toBe(55);

    // 다음 드롭 시작 시 직전 sticky 값(55%)을 자동 복원
    expect(controller.beginDrop(200, 200, 2000).thresholdPercent).toBe(55);
  });
});
