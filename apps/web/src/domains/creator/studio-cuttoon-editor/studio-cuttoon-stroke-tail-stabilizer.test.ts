import { afterEach, describe, expect, it } from "vitest";

import { captureStudioInkInputContractV2 } from "@/shared/lib/studio-ink-input-contract";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import type { DrawEl } from "../studio-element-model";
import { STUDIO_PIXEL_PENCIL_RENDER_MODE } from "../studio-pixel-pencil";
import {
  getStudioDrawingStabilityTelemetrySnapshot,
  resetStudioDrawingStabilityTelemetryForTests,
} from "./studio-cuttoon-drawing-stability-telemetry";
import {
  sanitizeStudioLiftReleaseRawPressure,
  stabilizeStudioStrokeLiftTail,
} from "./studio-cuttoon-stroke-tail-stabilizer";

afterEach(() => {
  resetStudioDrawingStabilityTelemetryForTests();
});

function buildV2Stroke(input: {
  points: number[];
  pressures: number[];
  sampleTimeOffsets: number[];
  brush?: string;
  mode?: "pen" | "eraser";
  brushEnginePrograms?: DrawEl["brushEnginePrograms"];
}): DrawEl {
  const count = Math.floor(input.points.length / 2);
  return {
    id: "stroke-tail-test",
    type: "draw",
    kind: "freehand",
    mode: input.mode ?? "pen",
    brush: input.brush ?? "pen",
    stroke: "#111827",
    strokeWidth: 4,
    opacity: 1,
    inkInput: captureStudioInkInputContractV2("pen"),
    points: input.points,
    pressures: input.pressures,
    tiltXs: Array.from({ length: count }, (_, idx) => idx),
    tiltYs: Array.from({ length: count }, (_, idx) => -idx),
    twists: Array.from({ length: count }, () => 15),
    speeds: Array.from({ length: count }, () => 1.2),
    tangentialPressures: Array.from({ length: count }, () => 0),
    altitudeAngles: Array.from({ length: count }, () => 1.1),
    azimuthAngles: Array.from({ length: count }, () => 0.4),
    contactWidths: Array.from({ length: count }, () => 2),
    contactHeights: Array.from({ length: count }, () => 2),
    sampleTimeOffsets: input.sampleTimeOffsets,
    brushEnginePrograms: input.brushEnginePrograms,
  };
}

describe("studio-cuttoon-stroke-tail-stabilizer", () => {
  it("펜촉 리프트 마지막 8~16ms에 발생한 갈고리 신발끈 점프를 제거하고 모든 v2 센서 길이를 일치시킨다", () => {
    const stroke = buildV2Stroke({
      points: [
        10, 20,
        20, 20,
        30, 20,
        40, 20,
        50, 20,
        // 8ms 만에 90도 꺾이며 85px 튀는 전형적인 디지타이저 리프트 신발끈
        54, 105,
      ],
      pressures: [0.45, 0.5, 0.52, 0.48, 0.32, 0.08],
      sampleTimeOffsets: [0, 8, 16, 24, 32, 40],
    });

    const result = stabilizeStudioStrokeLiftTail(stroke, {
      pointerType: "pen",
      releaseRawPressure: 0,
      coordinateScale: 1,
    });

    expect(result.changed).toBe(true);
    expect(result.removedTailSampleCount).toBe(1);
    expect(result.stroke.points).toEqual([10, 20, 20, 20, 30, 20, 40, 20, 50, 20]);
    const expectedLen = 5;
    expect(result.stroke.pressures).toHaveLength(expectedLen);
    expect(result.stroke.tiltXs).toHaveLength(expectedLen);
    expect(result.stroke.tiltYs).toHaveLength(expectedLen);
    expect(result.stroke.twists).toHaveLength(expectedLen);
    expect(result.stroke.speeds).toHaveLength(expectedLen);
    expect(result.stroke.tangentialPressures).toHaveLength(expectedLen);
    expect(result.stroke.altitudeAngles).toHaveLength(expectedLen);
    expect(result.stroke.azimuthAngles).toHaveLength(expectedLen);
    expect(result.stroke.contactWidths).toHaveLength(expectedLen);
    expect(result.stroke.contactHeights).toHaveLength(expectedLen);
    expect(result.stroke.sampleTimeOffsets).toHaveLength(expectedLen);
    // 제거 후 남은 끝단은 직전 본체 압력(0.48)보다 자연스럽게 감쇠되어 마감된다.
    expect(result.stroke.pressures?.at(-1)).toBeLessThan(0.48);
    expect(getStudioDrawingStabilityTelemetrySnapshot().tailSpikesSuppressed).toBe(1);
  });

  it("접선 방향 초고배율 오버슈트 점프는 직전 진행 연장선 안쪽으로 클램핑해 매끄럽게 수렴시킨다", () => {
    const stroke = buildV2Stroke({
      points: [
        0, 50,
        8, 50,
        16, 50,
        24, 50,
        32, 50,
        // 같은 수평 방향이지만 12ms 만에 120px 급발진한 호버 점프
        152, 51,
      ],
      pressures: [0.5, 0.55, 0.55, 0.52, 0.4, 0.05],
      sampleTimeOffsets: [0, 8, 16, 24, 32, 44],
    });

    const result = stabilizeStudioStrokeLiftTail(stroke, {
      pointerType: "pen",
      releaseRawPressure: 0,
      coordinateScale: 1,
    });

    expect(result.changed).toBe(true);
    expect(result.clampedTailEndpoint).toBe(true);
    expect(result.removedTailSampleCount).toBe(0);
    const endX = result.stroke.points.at(-2) ?? 0;
    const endY = result.stroke.points.at(-1) ?? 0;
    expect(endX).toBeGreaterThan(32);
    expect(endX).toBeLessThanOrEqual(40);
    expect(endY).toBeCloseTo(50, 5);
  });

  it("0.02 -> 0.95 -> 0 형태의 리프트 압력 스파이크를 실시간 억제하고 단조 감쇠 테이퍼로 마감한다", () => {
    const stroke = buildV2Stroke({
      points: [
        10, 10,
        22, 12,
        34, 14,
        46, 16,
        54, 17,
        60, 18,
      ],
      pressures: [0.52, 0.56, 0.54, 0.46, 0.02, 0.95],
      sampleTimeOffsets: [0, 8, 16, 24, 32, 42],
    });

    const result = stabilizeStudioStrokeLiftTail(stroke, {
      pointerType: "pen",
      releaseRawPressure: 0,
      coordinateScale: 1,
    });

    expect(result.changed).toBe(true);
    expect(result.suppressedPressureSpike).toBe(true);
    const pressures = result.stroke.pressures ?? [];
    expect(pressures).toHaveLength(6);
    // 0.95 스파이크가 완전히 제거되고 꼬리 구간이 단조 비증가로 자연스럽게 가늘어진다.
    const p3 = pressures[3] ?? 1;
    const p4 = pressures[4] ?? 1;
    const p5 = pressures[5] ?? 1;
    expect(p4).toBeLessThanOrEqual(p3);
    expect(p5).toBeLessThanOrEqual(p4);
    expect(p5).toBeLessThan(0.2);
    expect(getStudioDrawingStabilityTelemetrySnapshot().pressureSpikesSuppressed).toBe(1);
  });

  it("정상적인 빠른 해칭(일관된 고속 직선 스트로크)은 단 1픽셀도 깎지 않고 그대로 보존한다", () => {
    const fastHatch = buildV2Stroke({
      points: [
        0, 0,
        45, 12,
        92, 25,
        140, 38,
        190, 51,
        242, 65,
      ],
      pressures: [0.35, 0.62, 0.7, 0.65, 0.42, 0.18],
      sampleTimeOffsets: [0, 8, 16, 24, 32, 40],
    });

    const result = stabilizeStudioStrokeLiftTail(fastHatch, {
      pointerType: "pen",
      releaseRawPressure: 0,
      coordinateScale: 1,
    });

    expect(result.changed).toBe(false);
    expect(result.removedTailSampleCount).toBe(0);
    expect(result.clampedTailEndpoint).toBe(false);
    expect(result.suppressedPressureSpike).toBe(false);
    expect(result.stroke).toBe(fastHatch);
    expect(result.stroke.points).toEqual(fastHatch.points);
    expect(result.stroke.pressures).toEqual(fastHatch.pressures);
  });

  it("머티리얼 브러시의 원시 필압 계약과 픽셀 펜슬 그리드 좌표를 변형하지 않는다", () => {
    const materialBrush = createBrushStudioV6ProductBrush(
      createBrushStudioV6Program("oil-hair-mixer"),
    );
    const materialStroke = buildV2Stroke({
      points: [10, 10, 20, 10, 30, 10, 40, 10, 50, 10],
      pressures: [0.4, 0.4, 0.02, 0.95, 1],
      sampleTimeOffsets: [0, 8, 16, 24, 32],
      brushEnginePrograms: materialBrush.enginePrograms,
    });
    const materialResult = stabilizeStudioStrokeLiftTail(materialStroke, {
      pointerType: "pen",
      releaseRawPressure: 0,
    });
    expect(materialResult.suppressedPressureSpike).toBe(false);
    expect(materialResult.stroke.pressures).toEqual([0.4, 0.4, 0.02, 0.95, 1]);

    const pixelStroke = buildV2Stroke({
      points: [1, 1, 2, 1, 3, 1, 4, 1, 40, 40],
      pressures: [1, 1, 1, 1, 1],
      sampleTimeOffsets: [0, 8, 16, 24, 32],
      brush: STUDIO_PIXEL_PENCIL_RENDER_MODE,
    });
    const pixelResult = stabilizeStudioStrokeLiftTail(pixelStroke, {
      pointerType: "pen",
      releaseRawPressure: 0,
    });
    expect(pixelResult.changed).toBe(false);
    expect(pixelResult.stroke).toBe(pixelStroke);
  });

  it("pointerup 이벤트 자체의 하드웨어 압력 급등을 사전에 클램핑한다", () => {
    const clamped = sanitizeStudioLiftReleaseRawPressure({
      pointerType: "pen",
      rawPressure: 0.94,
      lastContactPressure: 0.05,
      rawMaterialPressure: false,
    });
    expect(clamped).toBeCloseTo(0.05 * 0.35, 5);

    const untouched = sanitizeStudioLiftReleaseRawPressure({
      pointerType: "pen",
      rawPressure: 0.12,
      lastContactPressure: 0.25,
      rawMaterialPressure: false,
    });
    expect(untouched).toBe(0.12);
  });
});
