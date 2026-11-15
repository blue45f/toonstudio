import { describe, expect, it } from "vitest";

import { materializeStudioBrushCatalogSelection } from "../brush/studio-brush-selection";
import { studioV6BrushCatalogSelectionBlock } from "../brush/studio-brush-v6-catalog-runtime";
import {
  BRUSH_STUDIO_V6_FULL_CAPABILITIES,
  BRUSH_STUDIO_V6_RECIPES,
  analyzeBrushStudioV6Program,
  createBrushStudioV6Program,
  normalizeBrushStudioV6Program,
} from "./brush-studio-v6-engine";
import {
  BRUSH_STUDIO_V9_WEBTOON_MASTER_RECIPE_SEEDS,
  BRUSH_STUDIO_V9_WEBTOON_MASTER_SPECS,
} from "./brush-studio-v6-recipe-catalog-v9-webtoon-master";

const EXPECTED_V9_RECIPE_IDS = [
  "v9-webtoon-razor-gpen",
  "v9-manhwa-emotional-maru",
  "v9-cel-shadow-hard-fill",
  "v9-romance-petal-glow",
  "v9-action-speed-rake",
  "v9-bg3d-freestyle-liner",
  "v9-granulating-sky-wash",
  "v9-skin-blush-soft-air",
] as const;

describe("BRUSH_STUDIO_V9_WEBTOON_MASTER_RECIPE_SEEDS", () => {
  it("마스터 웹툰 브러시 8종이 정확한 ID·한영 명세·물리 파라미터 범위로 등록된다", () => {
    expect(BRUSH_STUDIO_V9_WEBTOON_MASTER_RECIPE_SEEDS).toHaveLength(8);
    expect(BRUSH_STUDIO_V9_WEBTOON_MASTER_RECIPE_SEEDS.map((seed) => seed.id)).toEqual(
      EXPECTED_V9_RECIPE_IDS,
    );

    const catalogIds = new Set(BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.id));
    for (const spec of BRUSH_STUDIO_V9_WEBTOON_MASTER_SPECS) {
      expect(catalogIds.has(spec.id)).toBe(true);
      expect(spec.labelEn).not.toMatch(/[가-힣]/u);
      expect(spec.descriptionEn).not.toMatch(/[가-힣]/u);
      expect(spec.masterPhysics.size).toBeGreaterThan(0);
      expect(spec.masterPhysics.taperOut).toBeGreaterThanOrEqual(0);
      expect(spec.masterPhysics.taperOut).toBeLessThanOrEqual(1);
      expect(spec.masterPhysics.edgeCrispness).toBeGreaterThanOrEqual(0);
      expect(spec.masterPhysics.edgeCrispness).toBeLessThanOrEqual(1);
    }
  });

  it.each(EXPECTED_V9_RECIPE_IDS)(
    "%s 레시피가 상업용 기본 라이선스 프로필에서 무오류 분석·정규화·캔버스 실체화를 통과한다",
    async (recipeId) => {
      const program = createBrushStudioV6Program(recipeId);
      expect(program.id).toBe(recipeId);
      expect(normalizeBrushStudioV6Program(program)).toEqual(program);

      const analysis = analyzeBrushStudioV6Program(program, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
      expect(analysis.valid).toBe(true);
      expect(analysis.rightsProfile).toBe("commercial-safe");
      expect(analysis.providerPlan.blockedNodeIds).toEqual([]);
      expect(analysis.issues.filter((issue) => issue.severity === "error")).toEqual([]);

      const catalogId = `v6:${recipeId}`;
      expect(studioV6BrushCatalogSelectionBlock(catalogId)).toBeNull();
      const selection = await materializeStudioBrushCatalogSelection(catalogId);
      expect(selection).not.toBeNull();
      expect(selection?.catalogId).toBe(catalogId);
    },
  );
});
