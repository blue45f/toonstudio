import { describe, expect, it } from "vitest";

import { assertStudioNativeUvPrecision, StudioNativeUvPrecisionError, type StudioNativeUvPoint } from "./studio-hybrid-dcc-native-uv-precision";

function f32(points: readonly StudioNativeUvPoint[], flipV = false): readonly StudioNativeUvPoint[] {
  return points.map(([u, v]) => [Math.fround(u), Math.fround(flipV ? 1 - v : v)]);
}
const collapsedCases: readonly { readonly source: readonly StudioNativeUvPoint[] }[] = [
  { source: [[0, 0], [0, 0], [0, 0]] },
  { source: [[0, 0], [1, 1], [1, 1], [0, 0]] },
  { source: [[0, 0], [2, 2], [0, 2], [2, 0]] },
  { source: [[0, 1e-50], [1, 1e-50], [2, 1e-50]] },
];

describe("native UV 변환의 새 정밀도 손실 경계", () => {
  it("음수·타일 밖 UV와 명시적 V축 반전은 정상적으로 보존한다", () => {
    const source: readonly StudioNativeUvPoint[] = [[-.25, 1.5], [2, .2], [.125, -.75], [-1, -.1]];
    const original = JSON.stringify(source);
    expect(() => assertStudioNativeUvPrecision(source, f32(source), 1)).not.toThrow();
    expect(() => assertStudioNativeUvPrecision(source, f32(source, true), -1)).not.toThrow();
    expect(JSON.stringify(source)).toBe(original);
  });

  it.each(collapsedCases)("원래 접힌 fan·반복 edge·bowtie UV도 새 손실이 없으면 허용한다: $source", ({ source }) => {
    expect(() => assertStudioNativeUvPrecision(source, f32(source), 1)).not.toThrow();
    expect(() => assertStudioNativeUvPrecision(source, f32(source, true), -1)).not.toThrow();
  });

  it("source의 양수 edge가 Float32에서 새로 같아지면 거부한다", () => {
    const source: readonly StudioNativeUvPoint[] = [[1, 0], [1.00000001, 0], [1, 1]];
    expect(() => assertStudioNativeUvPrecision(source, f32(source), 1)).toThrow(/모서리/u);
  });

  it("edge 길이가 남아 있어도 양수 폭·높이의 새 소실은 거부한다", () => {
    const source: readonly StudioNativeUvPoint[] = [[1, 0], [1.00000001, 1], [1, 2]];
    expect(() => assertStudioNativeUvPrecision(source, f32(source), 1)).toThrow(/폭 또는 높이/u);
  });

  it("bounds와 edge가 남아 있어도 각 fan의 비영 면적과 예상 방향은 보존한다", () => {
    const almostLine: readonly StudioNativeUvPoint[] = [[0, 0], [1, 1], [2, 2.00000001]];
    expect(() => assertStudioNativeUvPrecision(almostLine, f32(almostLine), 1)).toThrow(/fan/u);
    const triangle: readonly StudioNativeUvPoint[] = [[0, 0], [1, 0], [0, 1]];
    expect(() => assertStudioNativeUvPrecision(triangle, f32(triangle), -1)).toThrow(/방향/u);
    const mixed: readonly StudioNativeUvPoint[] = [[0, 0], [1, 1], [2, 2.00000001], [0, 3]];
    expect(() => assertStudioNativeUvPrecision(mixed, f32(mixed), 1)).toThrow(/fan/u);
  });

  it("GLB 원본 Float32의 tiny V가 double 1-v 단계부터 사라져도 원본 좌표와 비교해 거부한다", () => {
    const source: readonly StudioNativeUvPoint[] = [[0, 0], [1, 0], [0, Math.fround(1e-10)]];
    const target = f32(source, true);
    expect(target).toEqual([[0, 1], [1, 1], [0, 1]]);
    expect(() => assertStudioNativeUvPrecision(source, target, -1)).toThrow(StudioNativeUvPrecisionError);
    const subnormal: readonly StudioNativeUvPoint[] = [[0, 0], [1, 0], [0, Math.fround(1e-45)]];
    expect(1 - subnormal[2]![1]).toBe(1);
    expect(() => assertStudioNativeUvPrecision(subnormal, f32(subnormal, true), -1)).toThrow(StudioNativeUvPrecisionError);
  });

  it("비유한 좌표·범위 밖 edge·corner 수 불일치를 공개 오류로 거부한다", () => {
    const triangle: readonly StudioNativeUvPoint[] = [[0, 0], [1, 0], [0, 1]];
    expect(() => assertStudioNativeUvPrecision(triangle, [[0, 0], [Infinity, 0], [0, 1]], 1)).toThrow(StudioNativeUvPrecisionError);
    expect(() => assertStudioNativeUvPrecision(triangle, triangle.slice(0, 2), 1)).toThrow(StudioNativeUvPrecisionError);
    const overflowing: readonly StudioNativeUvPoint[] = [[-1e308, 0], [1e308, 0], [0, 1]];
    expect(() => assertStudioNativeUvPrecision(overflowing, overflowing, 1)).toThrow(/범위/u);
  });
});
