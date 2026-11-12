// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPOSITE_PRESETS } from "../studio-background-3d-composites";
import { KITBASH_V10_BG_OBJECT_PRESETS } from "../studio-background-3d-kitbash-presets";
import { StudioBg3dBackgroundObjectClusterSection } from "./StudioBg3dBackgroundObjectClusterSection";
import { StudioBg3dWebtoonBackgroundPicker } from "./StudioBg3dWebtoonBackgroundPicker";
import {
  STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES,
  buildBg3dObjectClusterPrimitives,
} from "./studio-bg3d-background-object-cluster";
import { findStudioBg3dEssentialAsset } from "./studio-bg3d-essential-pose-prop-catalog";

describe("studio-bg3d-background-object-cluster & V10 presets", () => {
  afterEach(() => {
    cleanup();
  });

  it("defines 8 background object cluster archetypes linked to verified V10 GLB catalog entries and builds floor-grounded primitives", () => {
    expect(STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES).toHaveLength(8);

    for (const arch of STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES) {
      const linkedGlb = findStudioBg3dEssentialAsset(arch.v10GlbAssetId);
      expect(linkedGlb).toBeDefined();
      expect(linkedGlb?.category).toBe("kitbash-v10-prop-3d");

      const essential = buildBg3dObjectClusterPrimitives({
        archetype: arch.id,
        moduleCount: 1,
        clutterDensity: "essential",
        arrangement: "linear-wall",
        surfaceTheme: "daylight-neutral",
      });
      const livedIn = buildBg3dObjectClusterPrimitives({
        archetype: arch.id,
        moduleCount: 3,
        clutterDensity: "lived-in",
        arrangement: "l-corner",
        surfaceTheme: "night-glow",
      });

      expect(essential.partCount).toBeGreaterThanOrEqual(6);
      expect(livedIn.partCount).toBeGreaterThan(essential.partCount * 3);
      expect(livedIn.monotonyReliefScore).toBeGreaterThanOrEqual(80);

      for (const prim of livedIn.primitives) {
        const bottomY = prim.position[1] - prim.scale[1] * 0.5;
        expect(bottomY).toBeGreaterThanOrEqual(-1e-3);
        expect(prim.tags).toContain("BgObject_Cluster_V10");
      }
    }
  });

  it("registers 8 KITBASH_V10_BG_OBJECT_PRESETS (11+ parts each) into COMPOSITE_PRESETS", () => {
    expect(KITBASH_V10_BG_OBJECT_PRESETS).toHaveLength(8);
    const compositeIds = new Set(COMPOSITE_PRESETS.map((preset) => preset.id));

    for (const preset of KITBASH_V10_BG_OBJECT_PRESETS) {
      expect(preset.parts.length).toBeGreaterThanOrEqual(11);
      expect(compositeIds.has(preset.id)).toBe(true);
    }
  });

  it("places background object clusters via both StudioBg3dBackgroundObjectClusterSection and StudioBg3dWebtoonBackgroundPicker", () => {
    const onInsert = vi.fn(() => true);
    const onStatus = vi.fn();

    render(
      <StudioBg3dBackgroundObjectClusterSection
        defaultExpanded
        onInsertScenePrimitives={onInsert}
        onStatusChange={onStatus}
      />,
    );

    fireEvent.click(screen.getByTestId("bg3d-object-cluster-arch-hanok-jangdokdae-stone-wall"));
    fireEvent.change(screen.getByTestId("bg3d-object-cluster-module-slider"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByTestId("bg3d-object-cluster-arr-staggered-street"));
    fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("장면 배치 완료"));

    cleanup();

    let pickerAddedCount = 0;
    const onBuild = vi.fn(
      (
        buildParts: (
          existingCount: number,
          view: { position: readonly [number, number, number]; target: readonly [number, number, number] },
        ) => unknown[],
      ) => {
        const parts = buildParts(2, { position: [0, 2, 8], target: [0, 1, 0] });
        pickerAddedCount = parts.length;
        return true;
      },
    );

    render(
      <StudioBg3dWebtoonBackgroundPicker
        autoCutaway={false}
        onAutoCutawayChange={vi.fn()}
        onBuild={onBuild}
      />,
    );

    fireEvent.click(screen.getByTestId("bg3d-object-cluster-toggle"));
    fireEvent.click(screen.getByTestId("bg3d-object-cluster-arch-fantasy-dungeon-alchemy-props"));
    fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));

    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(pickerAddedCount).toBeGreaterThanOrEqual(16);
  });
});
