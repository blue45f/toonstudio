import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";

import {
  applyRecolorMappingToElements,
  applyRecolorMoodPreset,
  createRecolorWheelState,
  evaluateRecolorMapping,
  extractArtworkColorClusters,
  extractArtworkColorTargetsFromElements,
  formatOklchCss,
  hexToOklch,
  oklchToHexGamutMapped,
  remapArtworkToPalette,
  srgbToOklch,
} from "./studio-recolor-artwork-engine";

import type { El } from "../studio-element-model";

describe("studio-recolor-artwork-engine", () => {
  it("sRGB <-> OKLCH 왕복 변환과 명도 보존 가멋 매핑이 정확하게 동작한다", () => {
    const crimson = rgbToHex(212, 58, 72);
    const oklch = hexToOklch(crimson);
    expect(oklch.l).toBeGreaterThan(0.5);
    expect(oklch.l).toBeLessThan(0.68);
    expect(oklch.c).toBeGreaterThan(0.15);

    const roundtrip = oklchToHexGamutMapped(oklch);
    expect(roundtrip).toBe(crimson);
    expect(formatOklchCss(oklch)).toMatch(/^oklch\(/);

    // 범위를 넘는 높은 크로마를 넣어도 목표 명도(L)를 보존한 채 sRGB 안으로 투영한다
    const highChromaBlue = oklchToHexGamutMapped({ l: 0.62, c: 0.38, h: 250 });
    const mappedOklch = hexToOklch(highChromaBlue);
    expect(Math.abs(mappedOklch.l - 0.62)).toBeLessThan(0.015);
    expect(srgbToOklch({ r: 255, g: 255, b: 255 }).l).toBeCloseTo(1, 2);
  });

  it("문서 요소에서 면적 가중 지배색 클러스터를 추출하고 무채색 선화를 분리 보존한다", () => {
    const inkBlack = rgbToHex(18, 18, 22);
    const jacketRed = rgbToHex(205, 56, 62);
    const jacketShadow = rgbToHex(192, 52, 58); // jacketRed와 유사 -> 동일 클러스터 병합 대상
    const skyBlue = rgbToHex(72, 148, 226);

    const elements: El[] = [
      {
        id: "bg",
        type: "frame",
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        bgColor: skyBlue,
        stroke: inkBlack,
        strokeWidth: 2,
      },
      {
        id: "coat",
        type: "draw",
        kind: "rect",
        mode: "pen",
        points: [20, 20, 220, 220],
        stroke: inkBlack,
        strokeWidth: 3,
        fill: jacketRed,
      },
      {
        id: "coat-fold",
        type: "draw",
        kind: "rect",
        mode: "pen",
        points: [40, 40, 120, 120],
        stroke: inkBlack,
        strokeWidth: 2,
        fill: jacketShadow,
      },
    ];

    const targets = extractArtworkColorTargetsFromElements(elements);
    const clusters = extractArtworkColorClusters(targets, { maxClusters: 8, mergeDeltaE: 0.08 });
    expect(clusters.length).toBe(3); // skyBlue, jacketRed+Shadow, inkBlack
    const prominenceSum = clusters.reduce((s, c) => s + c.prominence, 0);
    expect(prominenceSum).toBeCloseTo(1, 2);

    const achromatic = clusters.find((c) => c.isAchromatic);
    expect(achromatic?.representativeHex).toBe(inkBlack);

    // 보색/삼각 하모니 휠 회전 시 OKLCH 명도(L) 보존 및 무채색 선화 잠금 검증
    const wheel = createRecolorWheelState(clusters, {
      harmonyRule: "triadic",
      hueRotationDeg: 90,
      preserveLuminance: true,
      preserveAchromatic: true,
    });
    const mapped = evaluateRecolorMapping(wheel);
    expect(mapped.maxLuminanceDelta).toBeLessThan(0.015);
    expect(mapped.colorMap[inkBlack]).toBe(inkBlack);
    expect(mapped.colorMap[skyBlue]).not.toBe(skyBlue);

    // 요소 비파괴 재배색 적용
    const applied = applyRecolorMappingToElements(elements, mapped);
    expect(applied.changedElementIds).toContain("bg");
    expect(applied.changedElementIds).toContain("coat");
    // 원본 불변 보장
    expect(elements[0]!.type === "frame" && elements[0]!.bgColor).toBe(skyBlue);
  });

  it("팔레트 전이(Palette Remap)와 시간대·무드 프리셋(심야·회상 세피아·인쇄 CMYK 안전)을 적용한다", () => {
    const vividMagenta = rgbToHex(250, 20, 220);
    const brightGreen = rgbToHex(40, 210, 90);
    const clusters = extractArtworkColorClusters([
      { elementId: "e1", slot: "fill", colorHex: vividMagenta, areaWeight: 600 },
      { elementId: "e2", slot: "fill", colorHex: brightGreen, areaWeight: 400 },
    ]);
    const baseState = createRecolorWheelState(clusters, { preserveLuminance: true });

    // 팔레트 전이
    const warmOrange = rgbToHex(220, 120, 45);
    const deepTeal = rgbToHex(32, 128, 134);
    const remappedState = remapArtworkToPalette(baseState, [warmOrange, deepTeal], { preserveLuminance: true });
    const remapResult = evaluateRecolorMapping(remappedState);
    expect(remapResult.maxLuminanceDelta).toBeLessThan(0.015);

    // 심야 프리셋 -> 명도 하강
    const midnight = applyRecolorMoodPreset(baseState, "midnight");
    const firstMidnight = midnight.clusterResults[0]!;
    expect(firstMidnight.targetOklch.l).toBeLessThan(firstMidnight.sourceOklch.l);

    // 인쇄 CMYK 안전 영역 -> 고채도 네온 크로마를 압축하면서 명도 보존
    const cmykSafe = applyRecolorMoodPreset(baseState, "print-cmyk-safe");
    expect(cmykSafe.clusterResults[0]!.targetOklch.c).toBeLessThanOrEqual(0.155);
    expect(cmykSafe.maxLuminanceDelta).toBeLessThan(0.015);

    // 회상 세피아 -> 저채도 따뜻한 색조
    const sepia = applyRecolorMoodPreset(baseState, "memory-sepia");
    expect(sepia.clusterResults[0]!.targetOklch.c).toBeLessThan(0.11);
  });
});
