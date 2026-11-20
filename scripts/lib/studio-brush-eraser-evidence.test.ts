import { describe, expect, it } from "vitest";

import { STUDIO_ERASER_PRESETS } from "../../apps/web/src/domains/creator/brush/studio-eraser-presets";

import { eraserLiftMatchesPreset } from "./studio-brush-eraser-evidence";

describe("한 획을 지운 뒤 남는 원래 농도", () => {
  it.each([
    ["standard-eraser", 0, 0, true],
    ["precision-eraser", 0.19, 0, true],
    ["precision-eraser", 0.19, 0.19, false],
    ["precision-eraser", 0.6, 0, false],
    ["broad-eraser", 0, 0, true],
    ["broad-eraser", 0.19, 0, false],
    ["kneaded-eraser", 0.62, 0.62, true],
    ["lift-eraser", 0.84, 0.84, true],
    ["kneaded-eraser", 0.84, 0.84, false],
    ["lift-eraser", 0.62, 0.62, false],
    ["lift-eraser", 0, 0, false],
  ] as const)("%s 평균 %s / 하위 사분위 %s", (id, residualEnergyRatio, lowerQuartileResidual, pass) => {
    const preset = STUDIO_ERASER_PRESETS.find(preset => preset.id === id)!;
    expect(eraserLiftMatchesPreset(preset, { affectedPixels: 12, residualEnergyRatio, lowerQuartileResidual })).toBe(pass);
  });

  it("네 픽셀 미만은 근거 부족으로 실패한다", () => {
    expect(eraserLiftMatchesPreset({ defaultOpacity: 1, defaultWidth: 4 }, {
      affectedPixels: 3, residualEnergyRatio: 0, lowerQuartileResidual: 0,
    })).toBe(false);
  });
});
