import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG,
  applyStudioBrushInOutTaperToDabs,
  computeStrokeSpeedEma,
  evaluateStudioBrushInOutTaper,
  isStudioBrushInOutTaperIdentity,
  normalizeStudioBrushInOutTaperConfig,
} from "./studio-brush-inout-taper";

describe("studio-brush-inout-taper", () => {
  it("비활성 기본 설정은 항등원으로 판정되고 댑 수치를 전혀 바꾸지 않는다", () => {
    expect(isStudioBrushInOutTaperIdentity(DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG)).toBe(true);
    const sampleDabs = [
      { distanceFromStrokeStart: 0, size: 12, opacity: 0.9, flow: 0.8 },
      { distanceFromStrokeStart: 50, size: 12, opacity: 0.9, flow: 0.8 },
      { distanceFromStrokeStart: 100, size: 12, opacity: 0.9, flow: 0.8 },
    ];
    expect(
      applyStudioBrushInOutTaperToDabs(sampleDabs, 100, DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG),
    ).toEqual(sampleDabs);
  });

  it("절대 픽셀(px) 단위와 퍼센트(%) 단위 감쇠 구간을 정확히 구분한다", () => {
    const pxConfig = normalizeStudioBrushInOutTaperConfig({
      useIn: true,
      inLength: 40,
      inUnit: "px",
      inMinRatio: 0.1,
      curve: 1,
      targets: { size: true, opacity: true, flow: false },
    });
    const atHalfIn = evaluateStudioBrushInOutTaper(pxConfig, {
      distanceFromStartPx: 20,
      totalStrokeLengthPx: 200,
    });
    expect(atHalfIn.effectiveInLengthPx).toBe(40);
    expect(atHalfIn.sizeFactor).toBeCloseTo(0.55, 5);
    expect(atHalfIn.opacityFactor).toBeCloseTo(0.55, 5);
    expect(atHalfIn.flowFactor).toBe(1);

    const pctConfig = normalizeStudioBrushInOutTaperConfig({
      useOut: true,
      outLength: 25,
      outUnit: "percent",
      outMinRatio: 0,
      curve: 1,
    });
    const nearEnd = evaluateStudioBrushInOutTaper(pctConfig, {
      distanceFromStartPx: 175,
      totalStrokeLengthPx: 200,
    });
    expect(nearEnd.effectiveOutLengthPx).toBe(50);
    expect(nearEnd.sizeFactor).toBeCloseTo(0.5, 5);
  });

  it("속도 연동(bySpeed) 모드에서 빠른 손목 스냅이 느린 선보다 더 긴 끝단 테이퍼를 만든다", () => {
    const speedTaper = normalizeStudioBrushInOutTaperConfig({
      useOut: true,
      outLength: 30,
      outUnit: "px",
      outMinRatio: 0,
      curve: 1.2,
      bySpeed: true,
      referenceSpeedPxPerMs: 0.8,
      maxSpeedScale: 2.5,
    });
    const slow = evaluateStudioBrushInOutTaper(speedTaper, {
      distanceFromStartPx: 160,
      totalStrokeLengthPx: 200,
      speedPxPerMs: 0.25,
    });
    const fast = evaluateStudioBrushInOutTaper(speedTaper, {
      distanceFromStartPx: 160,
      totalStrokeLengthPx: 200,
      speedPxPerMs: 2.4,
    });

    expect(fast.effectiveOutLengthPx).toBeGreaterThan(slow.effectiveOutLengthPx);
    expect(fast.sizeFactor).toBeLessThan(slow.sizeFactor);
  });

  it("EMA 속도 평활화와 댑 일괄 재가중이 시작·끝 양끝을 단조롭게 가늘게 만든다", () => {
    const ema = computeStrokeSpeedEma([0.2, 0.8, 1.6, 2.2], 0.5);
    expect(ema).toHaveLength(4);
    expect(ema[3]!).toBeGreaterThan(ema[0]!);

    const dabs = Array.from({ length: 11 }, (_, idx) => ({
      distanceFromStrokeStart: idx * 10,
      size: 10,
      opacity: 1,
      flow: 1,
    }));
    const tapered = applyStudioBrushInOutTaperToDabs(
      dabs,
      100,
      normalizeStudioBrushInOutTaperConfig({
        useIn: true,
        inLength: 30,
        inUnit: "px",
        useOut: true,
        outLength: 30,
        outUnit: "px",
        targets: { size: true, opacity: false, flow: true },
      }),
    );

    expect(tapered[0]!.size).toBeCloseTo(0, 5);
    expect(tapered[5]!.size).toBeCloseTo(10, 5);
    expect(tapered[10]!.size).toBeCloseTo(0, 5);
    expect(tapered[1]!.size).toBeLessThan(tapered[2]!.size);
    expect(tapered[9]!.flow).toBeLessThan(tapered[8]!.flow);
    expect(tapered[0]!.opacity).toBe(1);
  });
});
