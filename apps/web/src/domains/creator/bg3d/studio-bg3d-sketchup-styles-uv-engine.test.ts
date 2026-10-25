import { describe, expect, it } from "vitest";

import {
  SKP_EDGE_FLAG_HIDDEN,
  SKP_EDGE_FLAG_SMOOTH,
  SKP_EDGE_FLAG_SOFT,
  STUDIO_SKETCHUP_STYLE_PRESETS,
  computeSketchUpFaceUvBasis,
  decodeSketchUpEdgeFlagsByte,
  encodeSketchUpEdgeFlagsByte,
  evaluateSketchUpFaceUv,
  filterSketchUpDrawableEdges,
  isSketchUpDrawableEdge,
  resolveSketchUpStyleToBg3dSettings,
  solveSketchUpFourPinHomography,
} from "./studio-bg3d-sketchup-styles-uv-engine";

describe("studio-bg3d-sketchup-styles-uv-engine", () => {
  it("D307 모서리 플래그 바이트(0x01 hidden, 0x08 soft, 0x10 smooth)를 인코딩·디코딩하고 가시 모서리를 필터링한다", () => {
    const byte = encodeSketchUpEdgeFlagsByte({ hidden: false, soft: true, smooth: true });
    expect(byte).toBe(SKP_EDGE_FLAG_SOFT | SKP_EDGE_FLAG_SMOOTH);

    const decoded = decodeSketchUpEdgeFlagsByte(byte);
    expect(decoded).toEqual({ hidden: false, soft: true, smooth: true });

    expect(isSketchUpDrawableEdge({ a: [0, 0, 0], b: [1, 0, 0], flagsByte: 0 })).toBe(true);
    expect(isSketchUpDrawableEdge({ a: [0, 0, 0], b: [1, 0, 0], flagsByte: SKP_EDGE_FLAG_SOFT })).toBe(false);
    expect(isSketchUpDrawableEdge({ a: [0, 0, 0], b: [1, 0, 0], flagsByte: SKP_EDGE_FLAG_HIDDEN })).toBe(false);

    const filtered = filterSketchUpDrawableEdges([
      { a: [0, 0, 0], b: [1, 0, 0], flagsByte: 0 },
      { a: [1, 0, 0], b: [1, 1, 0], flagsByte: SKP_EDGE_FLAG_SOFT | SKP_EDGE_FLAG_SMOOTH },
      { a: [1, 1, 0], b: [0, 1, 0], flagsByte: SKP_EDGE_FLAG_HIDDEN },
    ]);
    expect(filtered.drawable).toHaveLength(1);
    expect(filtered.softenedCount).toBe(1);
    expect(filtered.hiddenCount).toBe(1);
    expect(filtered.smoothCount).toBe(1);
  });

  it("SketchUp 6종 스타일 프리셋을 ToonStudio LT·재질 설정으로 변환한다", () => {
    const hiddenLine = STUDIO_SKETCHUP_STYLE_PRESETS.find((s) => s.faceStyle === "hidden-line")!;
    const resolved = resolveSketchUpStyleToBg3dSettings(hiddenLine);
    expect(resolved.line.enabled).toBe(true);
    expect(resolved.tone.mode).toBe("none");
    expect(resolved.materialOverride.colorMode).toBe("replace");

    const xray = STUDIO_SKETCHUP_STYLE_PRESETS.find((s) => s.faceStyle === "xray")!;
    const xrayResolved = resolveSketchUpStyleToBg3dSettings(xray);
    expect(xrayResolved.materialOverride.opacityMultiplier).toBe(0.35);
    expect(xrayResolved.line.hiddenLineRemoval).toBe(false);
  });

  it("4-Pin 투영 호모그래피(uvTransform)를 계산하고 면 정점 UV를 정확히 투영한다", () => {
    const basis = computeSketchUpFaceUvBasis([0, 0, 1]);
    expect(Math.hypot(...basis.uAxis)).toBeCloseTo(1, 5);
    expect(Math.hypot(...basis.vAxis)).toBeCloseTo(1, 5);

    const homography = solveSketchUpFourPinHomography([
      { planePoint: [0, 0], uv: [0, 0] },
      { planePoint: [2, 0], uv: [1, 0] },
      { planePoint: [1.8, 2], uv: [1, 1] },
      { planePoint: [0.2, 2], uv: [0, 1] },
    ]);
    expect(homography.ok).toBe(true);
    expect(homography.uvProjected).toBe(true);

    const uv00 = evaluateSketchUpFaceUv({
      vertexWorld: [0, 0, 0],
      faceOriginWorld: [0, 0, 0],
      faceNormal: [0, 0, 1],
      uvTransform: homography.uvTransform,
      uvProjected: homography.uvProjected,
    });
    expect(uv00[0]).toBeCloseTo(0, 4);
    expect(uv00[1]).toBeCloseTo(0, 4);
  });
});
