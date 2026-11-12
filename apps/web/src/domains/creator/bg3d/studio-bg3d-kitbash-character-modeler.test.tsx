// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPOSITE_PRESETS, createCompositePrimitives } from "../studio-background-3d-composites";
import { KITBASH_COMPOSITE_PRESETS } from "../studio-background-3d-kitbash-presets";
import { StudioBg3dArchitecturalModelingPanel } from "./StudioBg3dArchitecturalModelingPanel";
import { StudioBg3dKitbashCharacterModelerPanel } from "./StudioBg3dKitbashCharacterModelerPanel";
import {
  buildBlenderPresetScenePrimitives,
  evaluateBlenderEditSculptSession,
} from "./studio-bg3d-blender-full-engine";
import {
  KITBASH_BACKGROUND_ARCHETYPES,
  buildParametricBackgroundKitbashPrimitives,
  buildParametricCharacterModelingPrimitives,
  generateKitbashCharacterModelingFreshIdeas,
} from "./studio-bg3d-kitbash-character-modeler";
import { buildSketchUpArchitecturalComponentPrimitives } from "./studio-bg3d-sketchup-full-engine";

describe("studio-bg3d-kitbash-character-modeler & high-density background presets", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides 14 multi-part kitbash composite presets (10~14 parts each) integrated into COMPOSITE_PRESETS", () => {
    expect(KITBASH_COMPOSITE_PRESETS).toHaveLength(14);
    expect(COMPOSITE_PRESETS.length).toBeGreaterThanOrEqual(43);

    for (const preset of KITBASH_COMPOSITE_PRESETS) {
      expect(preset.parts.length).toBeGreaterThanOrEqual(10);
      const created = createCompositePrimitives(preset.id, [], { position: [1.5, 0, -2.0] });
      expect(created).toHaveLength(preset.parts.length);
      for (const prim of created) {
        expect(prim.scale[0]).toBeGreaterThan(0);
        expect(prim.scale[1]).toBeGreaterThan(0);
        expect(prim.scale[2]).toBeGreaterThan(0);
      }
    }
  });

  it("synthesizes parametric background kitbash assemblies across all 6 archetypes and density levels", () => {
    for (const arch of KITBASH_BACKGROUND_ARCHETYPES) {
      const cleanRes = buildParametricBackgroundKitbashPrimitives({
        archetype: arch.id,
        bayCount: 2,
        floorCount: 1,
        detailDensity: "clean",
        bevelTrimAccent: false,
        paletteMood: "daylight-warm",
      });
      const clutteredRes = buildParametricBackgroundKitbashPrimitives({
        archetype: arch.id,
        bayCount: 4,
        floorCount: 3,
        detailDensity: "cluttered",
        bevelTrimAccent: true,
        paletteMood: "night-neon",
      });

      expect(cleanRes.primitives.length).toBeGreaterThanOrEqual(8);
      expect(clutteredRes.primitives.length).toBeGreaterThan(cleanRes.primitives.length);
      expect(clutteredRes.silhouetteContrastScore).toBeGreaterThanOrEqual(cleanRes.silhouetteContrastScore);
    }
  });

  it("builds grounded parametric 3D character blockouts across 4.5~8.5 head ratios, outfits, poses, and props", () => {
    const chibi = buildParametricCharacterModelingPrimitives({
      headRatio: 4.8,
      build: "compact-chibi",
      hair: "short-layered",
      outfit: "school-blazer",
      pose: "desk-seated",
      handProp: "smartphone",
    });
    const hero = buildParametricCharacterModelingPrimitives({
      headRatio: 8.2,
      build: "heroic-muscular",
      hair: "long-flowing",
      outfit: "knight-pauldrons",
      pose: "sword-guard",
      handProp: "rune-greatsword",
    });

    expect(chibi.primitives.length).toBeGreaterThanOrEqual(22);
    expect(hero.primitives.length).toBeGreaterThan(chibi.primitives.length);
    expect(hero.totalHeightMeters).toBeGreaterThan(chibi.totalHeightMeters);

    const minShoeCenterY = Math.min(...hero.primitives.map((p) => p.position[1] - p.scale[1] * 0.5));
    expect(minShoeCenterY).toBeGreaterThanOrEqual(-0.02);

    const ideas = generateKitbashCharacterModelingFreshIdeas(
      buildParametricBackgroundKitbashPrimitives({
        archetype: "korean-commercial-facade",
        bayCount: 3,
        floorCount: 2,
        detailDensity: "cluttered",
        bevelTrimAccent: true,
        paletteMood: "daylight-warm",
      }),
      hero,
    );
    expect(ideas.remixes).toHaveLength(5);
    expect(ideas.remixes.map((r) => r.id)).toEqual([
      "contrarian-take",
      "personal-story-hook",
      "data-evidence-angle",
      "practical-playbook",
      "what-they-missed",
    ]);
  });

  it("enriches Blender 5.2 preset scenes, Edit/Sculpt assemblies, and SketchUp urban architectural components", () => {
    for (const theme of [
      "fantasy-citadel",
      "cyberpunk-neon-alley",
      "arcane-astronomy-tower",
      "boss-raid-altar",
    ] as const) {
      const built = buildBlenderPresetScenePrimitives(theme);
      expect(built.primitives.length).toBeGreaterThanOrEqual(9);
    }

    const sculpt = evaluateBlenderEditSculptSession({
      editOperator: "bevel",
      editIntensity: 1.0,
      sculptTool: "face_set_edit",
      dyntopoDetailSizePx: 6,
      symmetryAxes: ["X"],
    });
    expect(sculpt.primitives.length).toBeGreaterThanOrEqual(8);

    for (const kind of ["storefront-awning", "rooftop-mechanical", "street-bus-shelter"] as const) {
      const comp = buildSketchUpArchitecturalComponentPrimitives({
        kind,
        widthMeters: 4.2,
        heightMeters: 2.8,
        depthMeters: 2.4,
        stepOrBayCount: 4,
      });
      expect(comp.primitiveCount).toBeGreaterThanOrEqual(7);
    }
  });

  it("renders StudioBg3dKitbashCharacterModelerPanel & StudioBg3dArchitecturalModelingPanel and dispatches scene primitives", () => {
    const onInsert = vi.fn().mockReturnValue(true);
    const onStatus = vi.fn();

    render(
      <div>
        <StudioBg3dKitbashCharacterModelerPanel
          onStatusChange={onStatus}
          onInsertScenePrimitives={onInsert}
        />
        <StudioBg3dArchitecturalModelingPanel
          onStatusChange={onStatus}
          onInsertScenePrimitives={onInsert}
        />
      </div>,
    );

    fireEvent.click(screen.getByTestId("bg3d-kitbash-arch-hanok-courtyard-pavilion"));
    fireEvent.click(screen.getByTestId("bg3d-kitbash-insert-bg-btn"));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect((onInsert.mock.calls[0]?.[0] as unknown[]).length).toBeGreaterThan(10);

    fireEvent.click(screen.getByTestId("bg3d-kitbash-tab-character"));
    fireEvent.change(screen.getByTestId("bg3d-kitbash-char-ratio-slider"), {
      target: { value: "8.0" },
    });
    fireEvent.click(screen.getByTestId("bg3d-kitbash-insert-char-btn"));
    expect(onInsert).toHaveBeenCalledTimes(2);
    expect((onInsert.mock.calls[1]?.[0] as unknown[]).length).toBeGreaterThan(22);

    fireEvent.click(screen.getByTestId("bg3d-kitbash-tab-fresh-ideas"));
    expect(screen.getByTestId("bg3d-kitbash-fresh-ideas-surface").textContent).toContain(
      "CONTRARIAN TAKE",
    );

    fireEvent.click(screen.getByTestId("spatial-modeler-arch-kind-storefront-awning"));
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(onInsert).toHaveBeenCalledTimes(3);
  });
});
