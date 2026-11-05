import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import pressureBaseline from "./fixtures/studio-chemy-v1-pressure/baseline.json";
import { checkLegacyChemyV1Pressure, inspectLegacyChemyPrimitives, observeChemyPixels, type ChemyPressureBaseline, type ChemyPressureObservation } from "./lib/studio-chemy-v1-pressure-policy";
import { brushV6InkDistance, brushV6InkField, brushV6InkStatistics, brushV6RelativeInkError } from "./studio-brush-v6-pixel-quality";

describe("V6 material pixel comparison", () => {
  it("does not count a different paper texture as a painted brush", () => {
    const roughPaper = new Uint8ClampedArray([240, 230, 220, 255, 100, 95, 90, 255]);
    const blank = brushV6InkField(roughPaper.slice(), roughPaper);
    expect(brushV6InkStatistics(blank)).toEqual({ paintedPixels: 0, inkMass: 0 });
  });

  it("rejects an opacity-only duplicate while preserving spatial material differences", () => {
    const first = new Float32Array([0, 0.2, 0.4, 0]);
    const opacityVariant = new Float32Array([0, 0.1, 0.2, 0]);
    const textured = new Float32Array([0.2, 0, 0.4, 0]);
    expect(brushV6InkDistance(first, opacityVariant)).toBe(0);
    expect(brushV6InkDistance(first, textured)).toBeCloseTo(1 / 3);
    expect(brushV6InkDistance(first, textured)).toBe(brushV6InkDistance(textured, first));
  });

  it("detects light pigment and alpha removal and rejects mismatched buffers", () => {
    const paper = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    const painted = new Uint8ClampedArray([200, 200, 200, 255, 100, 100, 100, 100]);
    expect(brushV6InkStatistics(brushV6InkField(painted, paper)).paintedPixels).toBe(2);
    expect(() => brushV6InkField(painted, paper.slice(1))).toThrow("matching RGBA");
    expect(() => brushV6InkDistance(new Float32Array(1), new Float32Array(2))).toThrow("matching dimensions");
  });

  it("rejects a blank, shifted, or changed replay even when total pigment mass matches", () => {
    const paper = [255, 255, 255, 255], original = [255, 155, 155, 255];
    expect(brushV6RelativeInkError(paper, original, original)).toBe(0);
    expect(brushV6RelativeInkError(paper, original, [254, 155, 155, 254])).toBe(0.01);
    expect(brushV6RelativeInkError(paper, original, paper)).toBe(1);
    expect(brushV6RelativeInkError(paper, original, [155, 255, 255, 155])).toBe(2);
    expect(brushV6RelativeInkError(paper, original, [255, 55, 255, 255])).toBe(1);
    expect(() => brushV6RelativeInkError(paper, original, [])).toThrow("matching dimensions");
  });
});

describe("Chemy V1 검토 계약: 관측 객체 음성 회귀이며 engine mutation 실행은 아님", () => {
  const baseline: ChemyPressureBaseline = pressureBaseline;
  const valid = (): ChemyPressureObservation => ({
    environment: structuredClone(baseline.environment), snapshot: structuredClone(baseline.snapshot),
    sourceSha256: { ...baseline.sourceSha256 },
    geometrySha256: { low: baseline.orderedGeometrySha256, high: baseline.orderedGeometrySha256 },
    pixels: structuredClone(baseline.pixels),
    primitive: { countLow: 1758, countHigh: 1758, proportionalityViolations: 0, invalidMarks: 0,
      opacitySha256: { ...baseline.opacitySha256 } }, alphaMonotonicViolations: 0,
  });
  it("합격 관측도 이전 15% 보장은 미충족이며 사용자 결정 범위를 명시한다", () => {
    const result = checkLegacyChemyV1Pressure(valid(), baseline);
    expect(result.ok).toBe(true); expect(result.evaluated).toBe(true);
    expect(result.originalAggregatePasses).toBe(false);
    expect(result.originalAggregateGateRetained).toBe(false);
    expect(result.approvalStatus).toBe("owner-approved-2026-11-05");
  });
  const negatives: [string, (actual: ChemyPressureObservation) => void][] = [
    ["같은 low 픽셀을 high에도 전달", (a) => { a.pixels.high = { ...a.pixels.low }; }],
    ["필압 무시 관측", (a) => { a.primitive.proportionalityViolations = 1758; }],
    ["필압 trace 상수화", (a) => { a.snapshot.mappedPressures = [0.5, 0.5]; }],
    ["low/high 반전", (a) => { a.sourceSha256 = { low: a.sourceSha256.high, high: a.sourceSha256.low }; }],
    ["mark 누락", (a) => { a.primitive.countHigh--; }],
    ["순서·기하 변경", (a) => { a.geometrySha256.high = "0".repeat(64); }],
    ["동일 alpha mass인 RGB 순서 변경", (a) => { a.pixels.high.rgbaSha256 = "1".repeat(64); }],
    ["공통 opacity 배율 drift", (a) => { a.primitive.opacitySha256.low = "2".repeat(64); }],
    ["seed 변경", (a) => { a.snapshot.seed++; }],
    ["보정 pressure 잘못 전달", (a) => { a.snapshot.mappedPressures = [0.15, 0.85]; }],
    ["material version 변경", (a) => { a.snapshot.materialVersion = 2; }],
    ["crop 크기 변경", (a) => { a.snapshot.width--; }],
    ["PNG fixture 누락", (a) => { a.pixels.low.fixturePngSha256 = ""; }],
    ["saturation histogram 손상", (a) => { a.pixels.high.histogramSha256 = "3".repeat(64); }],
    ["겹침 뒤 alpha 역전", (a) => { a.alphaMonotonicViolations = 1; }],
  ];
  it.each(negatives)("%s를 정상 환경에서 거부한다", (_label, mutate) => {
    const actual = valid(); expect(checkLegacyChemyV1Pressure(actual, baseline).ok).toBe(true);
    mutate(actual); const result = checkLegacyChemyV1Pressure(actual, baseline);
    expect(result.evaluated).toBe(true); expect(result.ok).toBe(false);
  });
  it("Linux 미검증은 mutation kill이 아니라 미평가 실패다", () => {
    const actual = valid(); actual.environment = { ...actual.environment, platform: "linux", architecture: "x64" };
    const result = checkLegacyChemyV1Pressure(actual, baseline);
    expect(result.ok).toBe(false); expect(result.evaluated).toBe(false);
  });
  it("골든 누락·손상과 승인 의미 누락을 거부한다", () => {
    expect(checkLegacyChemyV1Pressure(valid(), null).ok).toBe(false);
    const changed = structuredClone(baseline); changed.pixels.low.rgbaSha256 = "broken";
    expect(checkLegacyChemyV1Pressure(valid(), changed).ok).toBe(false);
    changed.contract.originalMinimumRetained = true;
    expect(checkLegacyChemyV1Pressure(valid(), changed).ok).toBe(false);
  });
  it("실제 fixture PNG bytes와 raw RGBA 지문을 구분해 고정한다", () => {
    for (const side of ["low", "high"] as const) {
      const bytes = readFileSync(new URL("./fixtures/studio-chemy-v1-pressure/" + side + ".png", import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(baseline.pixels[side].fixturePngSha256);
      expect(baseline.pixels[side].fixturePngSha256).not.toBe(baseline.pixels[side].rgbaSha256);
    }
  });
  it("단일 관측의 alpha 채널 합과 해시를 독립 Node crypto로 확인한다", async () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 64, 100, 110, 120, 255]);
    const result = await observeChemyPixels(rgba, "0".repeat(64));
    expect(result.alphaMass).toBe(319); expect(result.visiblePixels).toBe(2);
    expect(result.rgbaSha256).toBe(createHash("sha256").update(rgba).digest("hex"));
    await expect(observeChemyPixels(new Uint8ClampedArray(3), "")).rejects.toThrow();
  });
  it("sqrt 비례와 절대 opacity 지문은 서로 다른 보장을 검사한다", async () => {
    const ratio = Math.sqrt(baseline.snapshot.mappedPressures[1]! / baseline.snapshot.mappedPressures[0]!);
    const low = [{ x: 0, y: 0, secondaryMix: 0, opacity: 0.3 }, { x: 1, y: 1, secondaryMix: 1, opacity: 0.4 }];
    const high = low.map((m) => ({ ...m, opacity: m.opacity * ratio }));
    const original = await inspectLegacyChemyPrimitives(low, high, baseline.snapshot.mappedPressures);
    expect(original.proportionalityViolations).toBe(0);
    const drift = await inspectLegacyChemyPrimitives(low.map((m) => ({ ...m, opacity: m.opacity * 0.9 })),
      high.map((m) => ({ ...m, opacity: m.opacity * 0.9 })), baseline.snapshot.mappedPressures);
    expect(drift.proportionalityViolations).toBe(0);
    expect(drift.opacitySha256).not.toEqual(original.opacitySha256);
    const ignored = await inspectLegacyChemyPrimitives(low, low, baseline.snapshot.mappedPressures);
    expect(ignored.proportionalityViolations).toBeGreaterThan(0);
    const linear = await inspectLegacyChemyPrimitives(low,
      low.map((m) => ({ ...m, opacity: m.opacity * ratio * ratio })), baseline.snapshot.mappedPressures);
    expect(linear.proportionalityViolations).toBeGreaterThan(0);
  });
  it.each([[], [NaN, NaN], [0, 0], [0.9, 0.2], [Number.MIN_VALUE, Number.MAX_VALUE]].map((mapped) => [mapped]))("유효하지 않은 mapped %j를 정상 비례로 처리하지 않는다", async (mapped) => {
    const marks = [{ x: 0, y: 0, secondaryMix: 0, opacity: 0.3 }];
    expect((await inspectLegacyChemyPrimitives(marks, marks, mapped)).invalidMarks).toBeGreaterThan(0);
  });
});
