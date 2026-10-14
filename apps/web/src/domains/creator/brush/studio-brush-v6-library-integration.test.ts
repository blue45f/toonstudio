import { describe, expect, it } from "vitest";

import { BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE } from "../brush-lab/brush-studio-v6-license-profile";
import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "../brush-lab/brush-studio-v6-recipe-catalog";
import { isStudioBrushEngineProgramWireValue } from "../../../shared/lib/studio-brush-material-program-contract";
import {
  STUDIO_BRUSH_LIBRARY_COUNTS,
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS,
  filterStudioBrushCatalogItems,
} from "./studio-brush-catalog";
import { createStudioBuiltInBrushDefaultRestoreProfile } from "./studio-brush-default-restore";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import {
  materializeStudioBrushCatalogSelection,
} from "./studio-brush-selection";
import { studioBrushCatalogSelectionSnapshot } from "./studio-brush-selection-snapshot";
import {
  STUDIO_V6_BRUSH_CATALOG_COUNT,
  STUDIO_V6_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-v6-catalog";
import { studioV6BrushCatalogSelectionBlock } from "./studio-brush-v6-catalog-runtime";

const expectedV6RecipeCount = BRUSH_STUDIO_V6_RECIPE_SEEDS.length;

describe("Studio V6 complete brush library integration", () => {
  it("places every V6 recipe in the artist-facing complete library", () => {
    expect(STUDIO_V6_BRUSH_CATALOG_COUNT).toBe(expectedV6RecipeCount);
    expect(STUDIO_V6_BRUSH_CATALOG_COUNT).toBeGreaterThanOrEqual(50);
    expect(STUDIO_BRUSH_LIBRARY_COUNTS.v6).toBe(expectedV6RecipeCount);
    expect(STUDIO_BRUSH_LIBRARY_COUNTS.total).toBe(
      STUDIO_BRUSH_LIBRARY_COUNTS.classic + expectedV6RecipeCount,
    );
    expect(STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LIBRARY_COUNTS.paint,
    );
    expect(STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LIBRARY_COUNTS.erase,
    );
    expect(new Set(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.map(({ id }) => id))).toHaveProperty(
      "size",
      STUDIO_BRUSH_LIBRARY_COUNTS.total,
    );
    const v6Start = STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.length;
    expect(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.slice(
      v6Start,
      v6Start + expectedV6RecipeCount,
    )).toEqual(STUDIO_V6_BRUSH_CATALOG_ITEMS);
  });

  it("exposes a dedicated next-generation lane and global search aliases", () => {
    expect(filterStudioBrushCatalogItems({
      operation: "paint",
      category: "nextgen",
      includeV6: true,
    })).toEqual(STUDIO_V6_BRUSH_CATALOG_ITEMS);
    const searched = filterStudioBrushCatalogItems({
      operation: "paint",
      query: "차세대",
      includeV6: true,
    });
    expect(searched).toHaveLength(expectedV6RecipeCount);
    expect(searched.every(({ id }) => id.startsWith("v6:"))).toBe(true);
    for (const provider of ["Krita", "Hokusai", "Mixbox", "WebGPU", "libmypaint"]) {
      expect(filterStudioBrushCatalogItems({
        operation: "paint",
        query: provider,
        includeV6: true,
      }).some(({ id }) => id.startsWith("v6:")), provider).toBe(true);
    }
  });

  it("materializes all V6 rows with exact no-fallback provider receipts", async () => {
    for (const item of STUDIO_V6_BRUSH_CATALOG_ITEMS) {
      const selection = await materializeStudioBrushCatalogSelection(item.id);
      if (!selection) {
        // 라이선스 P0: 기본 프로필(permissive-only) 밖의 재료를 쓰는 행은 카탈로그에
        // 남아 있되 제공되지 않는다 — 선택은 null이고 차단 사유가 레코드로 조회돼야
        // 한다. 게이트가 조용히 풀리거나 사유 없이 비면 여기서 실패한다.
        const block = studioV6BrushCatalogSelectionBlock(item.id);
        expect(block, item.id).not.toBeNull();
        expect(block?.catalogId).toBe(item.id);
        expect(block?.licenseProfile).toBe(BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE);
        expect(block?.blockedNodeIds.length).toBeGreaterThan(0);
        expect(
          block?.blockedNodes.every(({ reason }) => reason === "license-profile"),
          item.id,
        ).toBe(true);
        expect(block?.reason).toContain(block?.blockedNodeIds[0] ?? "");
        expect(await materializeStudioBrushCatalogSelection(item.id)).toBeNull();
        continue;
      }
      expect(studioV6BrushCatalogSelectionBlock(item.id), item.id).toBeNull();
      expect(selection, item.id).not.toBeNull();
      expect(selection?.catalogId).toBe(item.id);
      expect(selection?.runtimeBrushId).toBe("brush");
      expect(selection?.enginePrograms?.material?.version).toBe(2);
      expect(selection?.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");
      expect(selection?.enginePrograms?.material?.runtime?.bindings.length).toBeGreaterThan(0);
      expect(isStudioBrushEngineProgramWireValue(selection?.enginePrograms)).toBe(true);
      expect(await materializeStudioBrushCatalogSelection(item.id)).toBe(selection);
    }
  });

  it("preserves the physical program through apply and default restore", async () => {
    const item = STUDIO_V6_BRUSH_CATALOG_ITEMS[0];
    expect(item).toBeDefined();
    const selection = await materializeStudioBrushCatalogSelection(item?.id);
    expect(selection).not.toBeNull();
    if (!selection) return;
    const applied = {
      brushId: selection.runtimeBrushId,
      strokeWidth: selection.defaultWidth,
      brushOpacity: selection.defaultOpacity,
      color: selection.defaultColor ?? DEFAULT_STUDIO_BRUSH_SNAPSHOT.color,
    };
    const snapshot = studioBrushCatalogSelectionSnapshot(
      DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      selection,
      applied,
    );
    expect(snapshot.sourcePresetId).toBe(selection.catalogId);
    expect(snapshot.enginePrograms).toEqual(selection.enginePrograms);
    expect(createStudioBuiltInBrushDefaultRestoreProfile(selection).values.enginePrograms)
      .toEqual(selection.enginePrograms);
  });
});
