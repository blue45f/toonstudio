import { describe, expect, it } from "vitest";

import { rgbToLab } from "../studio-lab-color";
import {
  buildHierarchicalTagTree,
  deltaE2000,
  deserializeSmartFolder,
  evaluateSmartFolder,
  extractDominantLabPaletteFromRgba,
  matchHierarchicalTag,
  queryAssetsByColorSimilarity,
  resolveAssetHoverPreviewPlan,
  serializeSmartFolder,
  type ColorIndexedAssetRecord,
  type SmartFolderDefinition,
} from "./studio-asset-color-smart-folder-index";

function buildSolidBuffer(
  width: number,
  height: number,
  leftRgb: readonly [number, number, number],
  rightRgb: readonly [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const c = x < width * 0.7 ? leftRgb : rightRgb;
      data[idx] = c[0];
      data[idx + 1] = c[1];
      data[idx + 2] = c[2];
      data[idx + 3] = 255;
    }
  }
  return data;
}

describe("studio-asset-color-smart-folder-index", () => {
  it("Sharma-Wu-Dalal(2005) CIEDE2000 기준 쌍과 동일 색상의 색차를 정확히 계산한다", () => {
    const identical = { l: 50, a: 2.6772, b: -79.7751 };
    expect(deltaE2000(identical, identical)).toBe(0);

    // Sharma 2005 Table 1 pair #1: (50.0, 2.6772, -79.7751) vs (50.0, 0.0, -82.7485) -> ΔE00 ≈ 2.0425
    const refDiff = deltaE2000(
      { l: 50.0, a: 2.6772, b: -79.7751 },
      { l: 50.0, a: 0.0, b: -82.7485 },
    );
    expect(refDiff).toBeCloseTo(2.0425, 3);
  });

  it("RGBA 버퍼에서 대표 색상을 추출하고 CIEDE2000 유사색 검색으로 순위화한다", () => {
    const sunsetBuf = buildSolidBuffer(20, 20, [235, 118, 62], [68, 48, 92]);
    const sunsetPalette = extractDominantLabPaletteFromRgba(sunsetBuf, 20, 20, 5);
    expect(sunsetPalette.length).toBeGreaterThanOrEqual(2);
    expect(sunsetPalette[0]!.ratio01).toBeGreaterThan(0.6);

    const nightBuf = buildSolidBuffer(20, 20, [20, 34, 72], [42, 60, 110]);
    const nightPalette = extractDominantLabPaletteFromRgba(nightBuf, 20, 20, 5);

    const assets: ColorIndexedAssetRecord[] = [
      {
        id: "bg-sunset-classroom",
        title: "노을 교실",
        format: "2d-bg",
        rating: 5,
        flag: "pick",
        rightsStatus: "commercial-ok",
        hierarchicalTags: ["조명/역광/노을", "배경/실내/교실"],
        palette: sunsetPalette,
      },
      {
        id: "bg-night-alley",
        title: "심야 골목",
        format: "2d-bg",
        rating: 4,
        flag: "hold",
        rightsStatus: "commercial-ok",
        hierarchicalTags: ["조명/야간/네온", "배경/실외/골목"],
        palette: nightPalette,
      },
    ];

    const matches = queryAssetsByColorSimilarity(assets, { r: 240, g: 120, b: 60 }, {
      thresholdDeltaE: 15,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.asset.id).toBe("bg-sunset-classroom");
    expect(matches[0]!.bestDeltaE).toBeLessThan(5);
  });

  it("계층 태그 트리와 AND/OR 동적 스마트 폴더, 멀티포맷 호버 스크러버를 평가한다", () => {
    expect(matchHierarchicalTag("조명/역광/노을", "조명")).toBe(true);
    expect(matchHierarchicalTag("조명기구/스탠드", "조명")).toBe(false);

    const warmLab = rgbToLab(235, 120, 60);
    const assets: ColorIndexedAssetRecord[] = [
      {
        id: "a1",
        title: "노을 배경",
        format: "2d-bg",
        rating: 5,
        flag: "pick",
        rightsStatus: "commercial-ok",
        hierarchicalTags: ["조명/역광/노을"],
        palette: [{ rgb: { r: 235, g: 120, b: 60 }, lab: warmLab, ratio01: 1 }],
      },
      {
        id: "a2",
        title: "웹툰 대사체",
        format: "font",
        rating: 4,
        flag: "pick",
        rightsStatus: "commercial-ok",
        hierarchicalTags: ["식자/명조"],
        palette: [],
        fontSampleText: "오늘 마감이야!",
      },
      {
        id: "a3",
        title: "3D 책상 소품",
        format: "3d-prop",
        rating: 3,
        flag: "none",
        rightsStatus: "personal-only",
        hierarchicalTags: ["배경/실내/교실"],
        palette: [],
        turntableFrameCount: 8,
      },
      {
        id: "a4",
        title: "쾅 효과음",
        format: "audio",
        rating: 5,
        flag: "pick",
        rightsStatus: "commercial-ok",
        hierarchicalTags: ["음향/타격"],
        palette: [],
        audioWaveformBins: [0.1, 0.9, 0.4, 0.2],
      },
    ];

    const tree = buildHierarchicalTagTree(assets);
    const lightRoot = tree.find((n) => n.segment === "조명");
    expect(lightRoot?.totalCount).toBe(1);
    expect(lightRoot?.children[0]?.fullPath).toBe("조명/역광");

    const folder: SmartFolderDefinition = {
      id: "sf-commercial-warm",
      name: "상업용 노을 픽",
      combinator: "all",
      rules: [
        { kind: "rights-status", statuses: ["commercial-ok"] },
        { kind: "min-rating", minRating: 4 },
        { kind: "hierarchical-tag", tagPath: "조명" },
        { kind: "color-near", queryLab: warmLab, maxDeltaE: 10 },
      ],
    };

    const roundtripped = deserializeSmartFolder(serializeSmartFolder(folder))!;
    expect(evaluateSmartFolder(assets, roundtripped).map((a) => a.id)).toEqual(["a1"]);

    expect(resolveAssetHoverPreviewPlan(assets[1]!, 0.5)).toEqual({
      kind: "font-glyph",
      sampleText: "오늘 마감이야!",
    });
    expect(resolveAssetHoverPreviewPlan(assets[2]!, 0.5)).toEqual({
      kind: "turntable-3d",
      angleIndex: 4,
      totalAngles: 8,
      yawDeg: 180,
    });
    expect(resolveAssetHoverPreviewPlan(assets[3]!, 0.3)).toEqual({
      kind: "audio-waveform",
      playheadRatio01: 0.3,
      binIndex: 1,
      amplitude01: 0.9,
    });
  });
});
