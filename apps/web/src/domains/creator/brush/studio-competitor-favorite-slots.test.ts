import { describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";

import {
  BRUSH_LIBRARY_KEY,
  BRUSH_LIBRARY_STORAGE_VERSION,
  createBrush,
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  readBrushLibrary,
  saveBrush,
  selectQuickBrushes,
  type BrushLibraryStorage,
  type StudioSavedBrush,
} from "./studio-brush-library";
import { studioBrushProductProfile } from "./studio-brush-product-profile";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";
import { assignStudioBrushSlot, emptyStudioBrushSlots } from "./studio-brush-slots";
import { studioV6BrushCatalogItemById } from "./studio-brush-v6-catalog";
import {
  applyStudioSavedBrushWithRecovery,
  buildStudioCompetitorFavoriteSlotBrushes,
  pinStudioCompetitorFavoritesToBrushLibrary,
  pinStudioCompetitorFavoritesToProductRepository,
  recoverStudioBrushForCanvasApply,
  STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS,
  syncStudioCompetitorFavoritesToQuickSlotsState,
} from "./studio-competitor-favorite-slots";
import { planStudioMaterialBrush } from "./studio-material-brush-runtime";

function createMemoryStorage(initial: Record<string, string> = {}): BrushLibraryStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("studio competitor flagship favorite slots", () => {
  it("materializes 6 no-fallback pinned flagship brushes under permissive-only without bypassing private-grant gates", async () => {
    const slotBrushes = buildStudioCompetitorFavoriteSlotBrushes(1_762_950_000_000);
    expect(slotBrushes).toHaveLength(6);

    for (const [idx, brush] of slotBrushes.entries()) {
      const spec = STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS[idx]!;
      expect(brush.id).toBe(spec.savedId);
      expect(brush.pinned).toBe(true);
      expect(brush.sourcePresetId).toBe(spec.catalogId);
      expect(brush.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");
      expect(brush.enginePrograms?.material?.runtime?.licenseProfile).toBe("permissive-only");

      const catalogSelection = await materializeStudioBrushCatalogSelection(spec.catalogId);
      expect(catalogSelection, spec.catalogId).not.toBeNull();
      expect(catalogSelection?.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");

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

    // 무폴백 정책 유지 검증: private-grant 권리(mineral-bloom: deposit-wet, physics-inkwash)는 기본 프로필에서 계속 차단된다.
    expect(() => createBrushStudioV6ProductBrush(createBrushStudioV6Program("mineral-bloom"))).toThrow(
      /deposit-wet/u,
    );
  });

  it("collapses unmodified same-preset clones while preserving customized and legacy presets", () => {
    const storage = createMemoryStorage();
    const canonicalFirst = buildStudioCompetitorFavoriteSlotBrushes(1_762_950_000_000)[0]!;

    saveBrush(storage, {
      ...canonicalFirst,
      id: "legacy-clone:v6:csp-real-gpen-aa",
      pinned: true,
    });
    saveBrush(storage, {
      ...canonicalFirst,
      id: "user-tuned-gpen",
      name: "내 필압 튜닝 G펜",
      strokeWidth: 19,
      pinned: true,
    });
    const legacyWatercolor = createBrush("내 수채화 펜", {
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      brushId: "watercolor",
      strokeWidth: 14,
    });
    saveBrush(storage, legacyWatercolor);

    const pinned = pinStudioCompetitorFavoritesToBrushLibrary(storage, 1_762_950_000_000);
    expect(pinned.status).toBe("pinned-storage");
    expect(pinned.durable).toBe(true);
    expect(pinned.collapsedDuplicateCount).toBe(1);

    const persisted = readBrushLibrary(storage);
    expect(persisted.status).toBe("ok");
    expect(persisted.brushes.some((b) => b.id === "legacy-clone:v6:csp-real-gpen-aa")).toBe(false);
    expect(persisted.brushes.some((b) => b.id === "user-tuned-gpen" && b.strokeWidth === 19)).toBe(
      true,
    );
    expect(persisted.brushes.some((b) => b.id === legacyWatercolor.id)).toBe(true);
    expect(persisted.brushes).toHaveLength(8);
  });

  it("restores canonical 1-to-6 quick shelf order even after newer activity timestamps or slot usage", () => {
    const storage = createMemoryStorage();
    const newerPinned = {
      ...createBrush("최신 고정 브러시", DEFAULT_STUDIO_BRUSH_SNAPSHOT),
      pinned: true,
      createdAt: 1_900_000_000_000,
      updatedAt: 1_900_000_000_000,
      lastUsedAt: 1_900_000_000_000,
    };
    saveBrush(storage, newerPinned);

    const firstPin = pinStudioCompetitorFavoritesToBrushLibrary(storage, 1_762_950_000_000);
    expect(firstPin.quickShelfIds.slice(0, 6)).toEqual(
      STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((s) => s.savedId),
    );

    const fourthSlot = firstPin.brushes.find(
      (b) => b.id === "favorite-slot:v6:procreate-6b-tilt-graphite",
    )!;
    saveBrush(storage, {
      ...fourthSlot,
      color: "#123456",
      strokeWidth: 22,
      lastUsedAt: 1_950_000_000_000,
    });
    expect(selectQuickBrushes(readBrushLibrary(storage).brushes)[0]?.id).toBe(
      "favorite-slot:v6:procreate-6b-tilt-graphite",
    );

    const reordered = pinStudioCompetitorFavoritesToBrushLibrary(storage, 1_762_950_000_000);
    expect(reordered.quickShelfIds.slice(0, 6)).toEqual(
      STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((s) => s.savedId),
    );
    const preservedFourth = reordered.brushes.find(
      (b) => b.id === "favorite-slot:v6:procreate-6b-tilt-graphite",
    )!;
    expect(preservedFourth.color).toBe("#123456");
    expect(preservedFourth.strokeWidth).toBe(22);

    const resetResult = pinStudioCompetitorFavoritesToBrushLibrary(storage, 1_762_950_000_000, {
      resetCustomizations: true,
    });
    const resetFourth = resetResult.brushes.find(
      (b) => b.id === "favorite-slot:v6:procreate-6b-tilt-graphite",
    )!;
    expect(resetFourth.strokeWidth).not.toBe(22);
    expect(resetResult.quickShelfIds.slice(0, 6)).toEqual(
      STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((s) => s.savedId),
    );
  });

  it("syncs numbered quick slots (1-6) while preserving non-flagship user slot assignments", () => {
    const withCustomSlot2 = assignStudioBrushSlot(emptyStudioBrushSlots(), 1, {
      brushId: "watercolor",
      strokeWidth: 16,
      brushOpacity: 0.75,
      color: "#225588",
    });

    const synced = syncStudioCompetitorFavoritesToQuickSlotsState(withCustomSlot2);
    expect(synced.slots[0]?.sourcePresetId).toBe("v6:csp-real-gpen-aa");
    expect(synced.slots[1]?.brushId).toBe("watercolor");
    expect(synced.slots[2]?.sourcePresetId).toBe("v6:calligraphy-barrel-twist-nib");

    const overwritten = syncStudioCompetitorFavoritesToQuickSlotsState(withCustomSlot2, {
      overwriteOccupied: true,
    });
    expect(overwritten.slots[1]?.sourcePresetId).toBe("v6:csp-dual-chalk-ink-liner");
  });

  it("does not overwrite corrupt storage and reports non-durable memory-only recovery", () => {
    let writeCount = 0;
    const corruptStorage: BrushLibraryStorage = {
      getItem: () => "{broken-json",
      setItem: () => {
        writeCount += 1;
      },
    };
    const result = pinStudioCompetitorFavoritesToBrushLibrary(corruptStorage);
    expect(result.status).toBe("memory-only");
    expect(result.durable).toBe(false);
    expect(result.failureCode).toBe("corrupt");
    expect(result.brushes).toHaveLength(6);
    expect(writeCount).toBe(0);
  });

  it("self-heals stripped permissive V6 receipts, aligns display name, and preserves existing brush without pen fallback on failure", () => {
    const canonical = buildStudioCompetitorFavoriteSlotBrushes()[2]!;
    const brokenFlagship: StudioSavedBrush = {
      ...canonical,
      name: "내 커스텀 캘리 닙",
      color: "#224466",
      strokeWidth: 15,
      enginePrograms: null,
    };

    const recovered = recoverStudioBrushForCanvasApply(brokenFlagship);
    expect(recovered.status).toBe("rebuilt-v6-receipt");
    expect(recovered.brush).not.toBeNull();
    expect(recovered.brush?.color).toBe("#224466");
    expect(recovered.brush?.strokeWidth).toBe(15);
    expect(recovered.brush?.sourcePresetName).toBe("내 커스텀 캘리 닙");
    expect(recovered.brush?.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");

    const legacy = createBrush("내 콘티 펜", {
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      brushId: "gpen",
    });
    const recoveredLegacy = recoverStudioBrushForCanvasApply(legacy);
    expect(recoveredLegacy.status).toBe("ok");
    expect(recoveredLegacy.brush?.sourcePresetName).toBe("내 콘티 펜");

    // 런타임 예외 시 기본 펜("pen")으로 2차 덮어쓰기하지 않고 기존 브러시를 그대로 보존한다.
    const onApply = vi.fn<(resolved: StudioSavedBrush) => void>(() => {
      throw new Error("gpu pipeline unavailable");
    });
    const execResult = applyStudioSavedBrushWithRecovery(recovered.brush!, onApply);
    expect(execResult.status).toBe("apply-failed");
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(execResult.appliedBrush).toBeNull();
    expect(execResult.reason).toContain("gpu pipeline unavailable");
    expect(execResult.reason).toContain("현재 브러시는 그대로 유지됩니다");
  });

  it("blocks private-grant and incompatible provider presets under fallbackPolicy: none without calling onApply", () => {
    const baseValid = buildStudioCompetitorFavoriteSlotBrushes()[0]!;

    // 1) 라이선스·권리 차단(private-grant: mineral-bloom -> deposit-wet, pigment-inkwash-density, physics-inkwash)
    const blockedRecipeBrush: StudioSavedBrush = {
      ...baseValid,
      id: "saved:v6:mineral-bloom",
      name: "미네랄 수묵 번짐",
      sourcePresetId: "v6:mineral-bloom",
      enginePrograms: null,
    };
    const onApply = vi.fn();
    const blockedResult = applyStudioSavedBrushWithRecovery(blockedRecipeBrush, onApply);
    expect(blockedResult.status).toBe("provider-unavailable");
    expect(blockedResult.appliedBrush).toBeNull();
    expect(blockedResult.blockedNodeIds).toEqual(
      expect.arrayContaining(["deposit-wet", "physics-inkwash"]),
    );
    expect(blockedResult.reason).toContain("deposit-wet");
    expect(onApply).not.toHaveBeenCalled();

    // 2) 비호환 제품 경로(wrong-product-path: carrier-google-mesh) 머티리얼 슬롯 차단
    const wrongPathBrush: StudioSavedBrush = {
      ...baseValid,
      id: "saved:custom:mesh",
      name: "벡터 메쉬 실험 펜",
      sourcePresetId: undefined,
      enginePrograms: {
        ...baseValid.enginePrograms,
        material: {
          ...baseValid.enginePrograms!.material!,
          slots: {
            ...baseValid.enginePrograms!.material!.slots,
            carrier: "carrier-google-mesh",
          },
        },
      },
    };
    const wrongPathResult = applyStudioSavedBrushWithRecovery(wrongPathBrush, onApply);
    expect(wrongPathResult.status).toBe("provider-unavailable");
    expect(wrongPathResult.appliedBrush).toBeNull();
    expect(wrongPathResult.blockedNodeIds).toContain("carrier-google-mesh");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("commits to product repository and coalesces concurrent pin requests", async () => {
    const storage = createMemoryStorage({
      [BRUSH_LIBRARY_KEY]: JSON.stringify({
        version: BRUSH_LIBRARY_STORAGE_VERSION,
        brushes: [],
      }),
    });
    const [first, second] = await Promise.all([
      pinStudioCompetitorFavoritesToProductRepository(storage),
      pinStudioCompetitorFavoritesToProductRepository(storage),
    ]);
    expect(first.pinnedCount).toBe(6);
    expect(second.pinnedCount).toBe(6);
    expect(first.quickShelfIds.slice(0, 6)).toEqual(
      STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((s) => s.savedId),
    );
  });
});
