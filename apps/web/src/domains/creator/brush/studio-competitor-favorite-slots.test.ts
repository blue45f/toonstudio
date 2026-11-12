import { describe, expect, it } from "vitest";

import {
  createBrush,
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  readBrushLibrary,
  saveBrush,
  selectQuickBrushes,
  type BrushLibraryStorage,
} from "./studio-brush-library";
import { studioBrushProductProfile } from "./studio-brush-product-profile";
import { studioV6BrushCatalogItemById } from "./studio-brush-v6-catalog";
import {
  buildStudioCompetitorFavoriteSlotBrushes,
  pinStudioCompetitorFavoritesToBrushLibrary,
  STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS,
} from "./studio-competitor-favorite-slots";
import { planStudioMaterialBrush } from "./studio-material-brush-runtime";

function createMemoryStorage(): BrushLibraryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("studio competitor flagship favorite slots", () => {
  it("materializes 6 no-fallback pinned flagship brushes that emit real canvas marks", () => {
    const slotBrushes = buildStudioCompetitorFavoriteSlotBrushes(1_762_950_000_000);
    expect(slotBrushes).toHaveLength(6);

    for (const [idx, brush] of slotBrushes.entries()) {
      const spec = STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS[idx]!;
      expect(brush.id).toBe(spec.savedId);
      expect(brush.pinned).toBe(true);
      expect(brush.sourcePresetId).toBe(spec.catalogId);
      expect(brush.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");

      const catalogItem = studioV6BrushCatalogItemById(spec.catalogId);
      expect(catalogItem).not.toBeNull();
      const profile = studioBrushProductProfile(catalogItem!);
      expect(profile.traits.length).toBeGreaterThan(0);

      const marks = planStudioMaterialBrush({
        points: [10, 36, 40, 12, 74, 38, 108, 14],
        pressures: [0.32, 0.84, 0.92, 0.18],
        tiltXs: [12, 22, 28, 15],
        tiltYs: [8, 14, 18, 10],
        twists: [0, 45, 90, 135],
        stroke: brush.color,
        strokeWidth: brush.strokeWidth,
        opacity: brush.brushOpacity,
        brushEnginePrograms: brush.enginePrograms ?? undefined,
      });
      expect(marks.length).toBeGreaterThan(0);
    }
  });

  it("idempotently pins flagship slots to the quick shelf while preserving custom user brushes", () => {
    const storage = createMemoryStorage();
    const userCustom = createBrush("내 커스텀 펜", {
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      strokeWidth: 9,
    });
    saveBrush(storage, userCustom);

    const first = pinStudioCompetitorFavoritesToBrushLibrary(storage, 1_762_950_000_000);
    expect(first.status).toBe("pinned-storage");
    expect(first.pinnedCount).toBe(6);
    expect(first.quickShelfIds.slice(0, 6)).toEqual(
      STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((s) => s.savedId),
    );

    const second = pinStudioCompetitorFavoritesToBrushLibrary(storage, 1_762_950_050_000);
    const persisted = readBrushLibrary(storage);
    expect(persisted.status).toBe("ok");
    // 6 flagship slots + 1 existing user custom brush = 7 (zero duplicates)
    expect(persisted.brushes).toHaveLength(7);
    expect(persisted.brushes.some((b) => b.name === "내 커스텀 펜")).toBe(true);
    expect(selectQuickBrushes(second.brushes)[0]?.id).toBe("favorite-slot:v6:csp-real-gpen-aa");
  });
});
