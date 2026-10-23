import { describe, expect, it } from "vitest";

import { SumiError } from "../core/errors";

import {
  applyDab,
  generateDabMask,
  generateEllipticalDabMask,
  smudgeDabColor,
  type DabMode,
} from "./krita-concepts";

describe("Krita dab mask applicator 개념", () => {
  it("generateDabMask(16, 1.0): 중심 1.0, 가장자리 0.0(hard edge)", () => {
    const mask = generateDabMask(16, 1.0);
    expect(mask.length).toBe(256);
    expect(mask[8 * 16 + 8]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[15 * 16 + 15]).toBe(0);
    for (const v of mask) expect(v === 0 || v === 1).toBe(true);
  });

  it("generateDabMask(17, 0.0): 그라디언트, 중심 1.0, 반경 위의 엣지 0.0", () => {
    const mask = generateDabMask(17, 0.0);
    expect(mask.length).toBe(289);
    expect(mask[8 * 17 + 8]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[15 * 17 + 0]).toBe(0); // 반경 밖(거리 ≈10.63 > 8.5)
  });

  it("generateDabMask: size/hardness 범위 밖 → SumiError('kc-invalid-mask')", () => {
    expect(() => generateDabMask(0, 0.5)).toThrow(SumiError);
    expect(() => generateDabMask(-1, 0.5)).toThrow(SumiError);
    expect(() => generateDabMask(2.5, 0.5)).toThrow(SumiError);
    expect(() => generateDabMask(16, -0.1)).toThrow(SumiError);
    expect(() => generateDabMask(16, 1.2)).toThrow(SumiError);
    expect(() => generateDabMask(16, NaN as unknown as number)).toThrow(SumiError);
  });

  it("applyDab additive: 기존 canvas + mask × color", () => {
    const canvas = new Float32Array(4 * 4 * 4); // 4x4 RGBA, 모두 0
    const mask = new Float32Array([1, 0, 0, 0]); // size 2, 왼쪽 위만 1
    const color: readonly [number, number, number, number] = [1, 0.5, 0.25, 1];
    applyDab(mask, color, canvas, 1, 1, "additive");
    // (1,1) = index 20
    expect(canvas[20]).toBe(1);
    expect(canvas[21]).toBe(0.5);
    expect(canvas[22]).toBe(0.25);
    expect(canvas[23]).toBe(1);
    // mask가 0인 칸과 범위 밖은 변함 없음
    expect(canvas[0]).toBe(0);
    expect(canvas[24]).toBe(0);
  });

  it("applyDab erase: 기존 canvas × (1 - mask)", () => {
    const canvas = new Float32Array(4 * 4 * 4).fill(1);
    const mask = new Float32Array([1]); // size 1
    applyDab(mask, [1, 1, 1, 1] as const, canvas, 0, 0, "erase");
    expect(canvas[0]).toBe(0);
    expect(canvas[1]).toBe(0);
    expect(canvas[2]).toBe(0);
    expect(canvas[3]).toBe(0);
    // 다른 픽셀은 그대로
    expect(canvas[4]).toBe(1);
  });

  it("applyDab multiply: 기존 × (1 - mask + mask × color)", () => {
    const canvas = new Float32Array(4 * 4 * 4).fill(1);
    const mask = new Float32Array([0.5]); // size 1
    applyDab(mask, [0, 0, 0, 1] as const, canvas, 0, 0, "multiply");
    expect(canvas[0]).toBe(0.5);
    expect(canvas[1]).toBe(0.5);
    expect(canvas[2]).toBe(0.5);
    expect(canvas[3]).toBe(1);
  });

  it("applyDab: offset이 범위를 벗어나면 픽셀을 건너뛰고 예외를 던지지 않는다(클리핑)", () => {
    const canvas = new Float32Array(4 * 4 * 4).fill(1);
    const mask = new Float32Array([1, 1, 1, 1]); // size 2
    expect(() => applyDab(mask, [0, 0, 0, 1] as const, canvas, 10, 10, "erase")).not.toThrow();
    expect(canvas.every((v) => v === 1)).toBe(true);
  });

  it("applyDab: 지원하지 않는 모드 → SumiError('kc-invalid-mode')", () => {
    const canvas = new Float32Array(16);
    const mask = new Float32Array([1]);
    expect(() => applyDab(mask, [1, 1, 1, 1] as const, canvas, 0, 0, ("unknown" as unknown) as DabMode)).toThrow(
      SumiError,
    );
  });

  it("generateEllipticalDabMask: 납작한 치즐 비율(aspect)과 sharpness 양자화를 지원한다", () => {
    const round = generateEllipticalDabMask(11, 0.8, { aspect: 1, angleRad: 0 });
    const flat = generateEllipticalDabMask(11, 0.8, { aspect: 0.35, angleRad: 0, sharpness: 1 });
    const roundCoverage = round.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
    const flatCoverage = flat.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
    expect(flatCoverage).toBeLessThan(roundCoverage);
    expect(flat.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("smudgeDabColor: 캔버스 하부 안료를 샘플링해 K/S 공간에서 혼색한다", () => {
    const canvas = new Float32Array(4 * 4 * 4);
    // (1,1)에 노랑 안료 도포
    canvas[20] = 0.95;
    canvas[21] = 0.9;
    canvas[22] = 0.05;
    canvas[23] = 1;
    const mixed = smudgeDabColor(canvas, 0, 0, 2, [0.05, 0.2, 0.9, 1], 0.5);
    expect(mixed[1]).toBeGreaterThan(0.2);
  });
});
