import { describe, expect, it } from "vitest";

import {
  extractSmartAssetAutotagMetadata,
  extractStudioAssetAutotagMetadata,
} from "./studio-asset-smart-autotag";
import { selectStudioLocalAssetPage } from "../studio-asset-library-management";
import {
  buildStudioUnifiedAssetCatalog,
  searchStudioUnifiedAssets,
} from "../studio-unified-asset-catalog";
import { assetWorkspaceDetailsForItem } from "./studio-unified-asset-workspace-model";

import type { StudioAsset } from "../studio-asset-library";

function makeSolidRgba(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): Uint8ClampedArray {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    buffer[i * 4] = rgba[0];
    buffer[i * 4 + 1] = rgba[1];
    buffer[i * 4 + 2] = rgba[2];
    buffer[i * 4 + 3] = rgba[3];
  }
  return buffer;
}

function makeCutoutRgba(
  width: number,
  height: number,
  fg: readonly [number, number, number, number],
): Uint8ClampedArray {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const inCenter = x >= width * 0.25 && x < width * 0.75 && y >= height * 0.25 && y < height * 0.75;
      if (inCenter) {
        buffer[idx] = fg[0];
        buffer[idx + 1] = fg[1];
        buffer[idx + 2] = fg[2];
        buffer[idx + 3] = fg[3];
      } else {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }
  return buffer;
}

describe("studio-asset-smart-autotag", () => {
  it("세로 고해상도 노을 배경 이미지에서 세로컷·배경·고해상도·따뜻한톤 태그와 재사용 블록을 결정적으로 추출한다", () => {
    const rgba = makeSolidRgba(32, 64, [238, 128, 62, 255]);
    const result = extractSmartAssetAutotagMetadata({
      fileName: "교실_노을_배경_bg.png",
      width: 1600,
      height: 4800,
      rgba,
      rgbaWidth: 32,
      rgbaHeight: 64,
    });

    expect(result.extension).toBe("png");
    expect(result.mimeType).toBe("image/png");
    expect(result.geometry.orientation).toBe("vertical-strip");
    expect(result.geometry.resolutionTier).toBe("ultra-high");
    expect(result.alpha.hasTransparency).toBe(false);
    expect(result.alpha.confidence).toBe("pixel-verified");
    expect(result.color.temperature).toBe("warm");
    expect(result.color.dominantHex).toBe("#ee803e");
    expect(result.tagsKo).toContain("세로컷");
    expect(result.tagsKo).toContain("배경");
    expect(result.tagsKo).toContain("고해상도");
    expect(result.tagsKo).toContain("따뜻한톤");
    expect(result.tagsEn).toContain("vertical-strip");
    expect(result.tagsEn).toContain("background");
    expect(result.tagsEn).toContain("high-res");
    expect(result.tagsEn).toContain("warm-tone");
    expect(result.reusableBlock.role).toBe("vertical-panel-template");
    expect(result.reusableBlock.recommendedPlacement).toBe("page");

    // 동일 입력에 대한 완전 결정성 검증
    const repeat = extractSmartAssetAutotagMetadata({
      fileName: "교실_노을_배경_bg.png",
      width: 1600,
      height: 4800,
      rgba,
      rgbaWidth: 32,
      rgbaHeight: 64,
    });
    expect(repeat).toEqual(result);
  });

  it("투명 알파 채널이 있는 캐릭터 PNG에서 투명PNG·누끼·차가운톤 태그와 캐릭터 컷아웃 블록을 추출한다", () => {
    const rgba = makeCutoutRgba(32, 48, [48, 118, 224, 255]);
    const result = extractSmartAssetAutotagMetadata({
      fileName: "heroine_character_pose.png",
      width: 1024,
      height: 1536,
      rgba,
      rgbaWidth: 32,
      rgbaHeight: 48,
    });

    expect(result.alpha.hasTransparency).toBe(true);
    expect(result.alpha.transparentPixelRatio).toBeGreaterThan(0.5);
    expect(result.color.temperature).toBe("cool");
    expect(result.tagsKo).toContain("투명PNG");
    expect(result.tagsKo).toContain("누끼");
    expect(result.tagsKo).toContain("캐릭터");
    expect(result.tagsKo).toContain("차가운톤");
    expect(result.tagsEn).toContain("transparent-png");
    expect(result.tagsEn).toContain("alpha-cutout");
    expect(result.tagsEn).toContain("cool-tone");
    expect(result.reusableBlock.role).toBe("character-cutout");
    expect(result.reusableBlock.recommendedPlacement).toBe("selection");
  });

  it("3D 소품(GLB/bg3d)과 무채색 다크톤 픽셀 버퍼를 정확히 분류한다", () => {
    const darkMonoRgba = makeSolidRgba(16, 16, [28, 30, 32, 255]);
    const glbResult = extractSmartAssetAutotagMetadata({
      fileName: "classroom_chair_prop.glb",
      width: 1024,
      height: 1024,
      rgba: darkMonoRgba,
      rgbaWidth: 16,
      rgbaHeight: 16,
    });

    expect(glbResult.tagsKo).toContain("3D소품");
    expect(glbResult.tagsKo).toContain("무채색");
    expect(glbResult.tagsKo).toContain("다크톤");
    expect(glbResult.tagsEn).toContain("3d-prop");
    expect(glbResult.tagsEn).toContain("monochrome");
    expect(glbResult.tagsEn).toContain("dark-mood");
    expect(glbResult.reusableBlock.role).toBe("3d-stage-prop");
  });

  it("비정상 크기·빈 버퍼 입력에서도 예외 없이 안전한 기본값을 반환한다", () => {
    const result = extractSmartAssetAutotagMetadata({
      fileName: "   ",
      width: Number.NaN,
      height: -50,
      rgba: new Uint8ClampedArray(0),
    });

    expect(result.normalizedFileName).toBe("asset");
    expect(result.geometry.width).toBe(1);
    expect(result.geometry.height).toBe(1);
    expect(result.color.analyzedFromPixels).toBe(false);
    expect(result.tagsKo.length).toBeGreaterThan(0);
  });

  it("로컬 에셋 검색·통합 카탈로그·상세 정보 진입점에 자동 태그와 재사용 블록 메타데이터가 연결된다", () => {
    const verticalBg: StudioAsset = {
      id: "local-vertical-bg",
      name: "비오는_거리_배경_투명.png",
      dataUrl: "data:image/png;base64,AA==",
      width: 1600,
      height: 4000,
      createdAt: 100,
    };
    const prop3d: StudioAsset = {
      id: "local-3d-desk",
      name: "교실 책상",
      dataUrl: "data:image/webp;base64,AA==",
      width: 1024,
      height: 1024,
      createdAt: 90,
      kind: "bg3d",
    };

    const meta = extractStudioAssetAutotagMetadata(verticalBg);
    expect(meta.tagsKo).toContain("세로컷");
    expect(meta.tagsKo).toContain("투명PNG");

    // 1. StudioLocalAssetManager 검색 엔진 연결 확인
    expect(selectStudioLocalAssetPage([verticalBg, prop3d], "세로컷 고해상도").items.map((a) => a.id))
      .toEqual(["local-vertical-bg"]);
    expect(selectStudioLocalAssetPage([verticalBg, prop3d], "3d소품").items.map((a) => a.id))
      .toEqual(["local-3d-desk"]);

    // 2. 통합 카탈로그 및 상세 정보 연결 확인
    const catalog = buildStudioUnifiedAssetCatalog({
      backgrounds: [],
      sceneTemplates: [],
      localAssets: [verticalBg, prop3d],
      elements: [],
      objects: [],
      nativeTools: [],
    });
    expect(searchStudioUnifiedAssets(catalog, { query: "vertical-strip" }).map((i) => i.id))
      .toEqual(["local:local-vertical-bg"]);
    expect(searchStudioUnifiedAssets(catalog, { query: "3d-prop" }).map((i) => i.id))
      .toEqual(["local:local-3d-desk"]);

    const detailItem = catalog.find((item) => item.id === "local:local-vertical-bg");
    expect(detailItem).toBeDefined();
    if (detailItem) {
      const details = assetWorkspaceDetailsForItem(detailItem);
      expect(details.some((line) => line.includes("세로 웹툰 컷 블록"))).toBe(true);
      expect(details.some((line) => line.includes("자동 태그"))).toBe(true);
    }
  });
});
