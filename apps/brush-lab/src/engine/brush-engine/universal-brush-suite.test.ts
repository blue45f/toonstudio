import { describe, expect, it } from "vitest";

import {
  evaluateLabSaiWatercolorPressure,
  filterLabPixelPerfectCells,
  generateLabHarmonySegments,
  stepLabKmMixerBrushReservoir,
} from "./universal-brush-suite";

describe("universal-brush-suite (Sumi 클린룸 범용 브러시 커널)", () => {
  it("Harmony 절차적 브러시 모드별로 결정론적 근접 코드 세그먼트를 생성한다", () => {
    const anchors = Array.from({ length: 12 }, (_, idx) => ({
      x: 10 + idx * 6,
      y: 20 + Math.sin(idx) * 4,
      pressure01: 0.85,
    }));

    const sketchy = generateLabHarmonySegments("sketchy", anchors, 42);
    const shaded = generateLabHarmonySegments("shaded", anchors, 42);
    const chrome = generateLabHarmonySegments("chrome", anchors, 42);
    const fur = generateLabHarmonySegments("fur", anchors, 42);
    const longfur = generateLabHarmonySegments("longfur", anchors, 42);
    const web = generateLabHarmonySegments("web", anchors, 42);

    expect(sketchy.some((seg) => seg.isChordLink)).toBe(true);
    expect(shaded.some((seg) => seg.isChordLink)).toBe(true);
    expect(chrome.some((seg) => seg.isChordLink)).toBe(true);
    expect(fur.some((seg) => seg.isChordLink)).toBe(true);
    expect(longfur.some((seg) => seg.isChordLink)).toBe(true);
    expect(web.some((seg) => seg.isChordLink)).toBe(true);
  });

  it("Kubelka-Munk 기반 Mixer Brush 저수조 스텝이 캔버스 안료 흡수와 착색을 동시에 수행한다", () => {
    const step = stepLabKmMixerBrushReservoir({
      wet01: 0.8,
      load01: 0.65,
      mix01: 0.7,
      flow01: 0.9,
      canvasRgb: [0.95, 0.85, 0.1],
      reservoirRgb: [0.1, 0.25, 0.9],
      supplyRgb: [0.1, 0.25, 0.9],
    });

    expect(step.transfer01).toBeGreaterThan(0.5);
    expect(step.reservoirRgb[1]).toBeGreaterThan(0.25);
    expect(step.canvasRgb[2]).toBeGreaterThan(0.1);
  });

  it("SAI Ver.2 수채화 필압 임계값 이하에서는 블러 전용, 초과 시 안료 착색 모드로 전환한다", () => {
    const light = evaluateLabSaiWatercolorPressure(0.15, 0.28, 0.2, 0.8);
    expect(light.isBlurOnlyMode).toBe(true);
    expect(light.depositAlpha01).toBe(0);
    expect(light.blurStrength01).toBeGreaterThan(0.5);

    const firm = evaluateLabSaiWatercolorPressure(0.85, 0.28, 0.2, 0.8);
    expect(firm.isBlurOnlyMode).toBe(false);
    expect(firm.depositAlpha01).toBeGreaterThan(0.75);
  });

  it("Pixel-Perfect 1px 직각 L-코너 계단 픽셀을 제거한다", () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    const filtered = filterLabPixelPerfectCells(raw);
    expect(filtered).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });
});
