// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioBg3dDynamicComponentsPanel } from "../bg3d/StudioBg3dDynamicComponentsPanel";

import {
  DONTDRAW_360_PANORAMA_DOME_PRESETS,
  DONTDRAW_ASSET_FORMAT_BADGES,
  DONTDRAW_STORE_TAXONOMY,
  WEBTOON_SKP_MARKETPLACE_PLATFORMS,
  matchDontDrawStoreCategoryByScript,
  validateDontDrawAssetFormatBundle,
} from "./studio-3d-dynamic-components";

afterEach(() => {
  cleanup();
});

describe("studio-3d-dontdraw-store-taxonomy (DontDraw · ACON3D · Tumblbug)", () => {
  it("돈드로우(dontdraw)가 WEBTOON_SKP_MARKETPLACE_PLATFORMS에 정식 등록되어 있다", () => {
    const dontdraw = WEBTOON_SKP_MARKETPLACE_PLATFORMS.find((p) => p.id === "dontdraw");
    expect(dontdraw).toBeDefined();
    expect(dontdraw?.label).toContain("돈드로우");
    expect(dontdraw?.supportsDynamicComponents).toBe(true);
  });

  it("돈드로우 6대 상위 카테고리, 11종 다중 포맷 배지, 360도 파노라마 프리셋을 모두 보유한다", () => {
    expect(DONTDRAW_STORE_TAXONOMY).toHaveLength(6);
    expect(DONTDRAW_ASSET_FORMAT_BADGES).toHaveLength(11);
    expect(DONTDRAW_360_PANORAMA_DOME_PRESETS).toHaveLength(4);

    const validation = validateDontDrawAssetFormatBundle([
      ".skp",
      "cs3o",
      "cs3c",
      "clip",
      "laf",
      "pdf",
    ]);
    expect(validation.isValid).toBe(true);
    expect(validation.supportsSketchUpDirect).toBe(true);
    expect(validation.supportsClipStudioDirect).toBe(true);
    expect(validation.hasLicenseGuidePdf).toBe(true);
    expect(validation.recommendedImportRoute).toBe("sketchup-skp-to-glb");
  });

  it("대본 지문에서 돈드로우 2계층 배경 카테고리 및 360도 파노라마 스카이돔을 자동 매칭한다", () => {
    const schoolMatch = matchDontDrawStoreCategoryByScript(
      "고등학교 교실 복도에서 주인공이 경찰서 취조실 기록을 떠올린다.",
    );
    expect(schoolMatch.topCategoryId).toBe("bg-modern");
    expect(schoolMatch.subCategoryId).toBe("modern-school-public");
    expect(schoolMatch.recommendedPanoramaDome.id).toBe("pano-highschool-rooftop-day");

    const fantasyMatch = matchDontDrawStoreCategoryByScript(
      "황실 대공저의 유리온실 정원에서 분수대 너머로 티파티가 열린다.",
    );
    expect(fantasyMatch.topCategoryId).toBe("bg-fantasy");
    expect(fantasyMatch.subCategoryId).toBe("fantasy-garden-greenhouse");
    expect(fantasyMatch.recommendedPanoramaDome.id).toBe("pano-imperial-garden-sunset");
  });

  it("StudioBg3dDynamicComponentsPanel에 돈드로우 마켓 필터와 분류 카드가 렌더된다", () => {
    render(<StudioBg3dDynamicComponentsPanel />);
    expect(screen.getByTestId("dontdraw-store-taxonomy-card")).toBeTruthy();
    expect(screen.getByRole("button", { name: /돈드로우/u })).toBeTruthy();
  });
});
