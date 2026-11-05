import { describe, expect, it } from "vitest";

import { planStudioDynamicBrushCoverageAndLegacyMarks } from "../studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "../studio-dynamic-brush-render-plan";
import type { DrawEl } from "../studio-element-model";
import { materializeStudioMaterialBrushDynamics } from "./studio-material-morphology-runtime";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";

import {
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  resolveStudioBrushDynamics,
  serializeStudioBrushDynamicsSettingsCanonical,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import { studioBrushCatalogItemById, STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";
import {
  STUDIO_MATERIAL_BRUSH_DEFINITIONS,
  STUDIO_MATERIAL_BRUSH_IDS,
  studioMaterialBrushDefinition,
} from "./studio-material-brush-catalog";
import { studioProceduralTipCache } from "./studio-procedural-tip-rasterizer";

const input = {
  points: [0, 0, 20, 5, 50, -5, 100, 10, 200, 0],
  pressures: [0.15, 0.3, 0.7, 0.95, 0.2],
  speeds: [0.2, 0.2, 1, 2, 0.5],
  tiltXs: [0, 10, 20, 50, 10],
  tiltYs: [0, 0, 10, 30, 0],
  baseWidth: 40,
  baseOpacity: 1,
  maxDabs: 4096,
  seed: 20260913,
};


function graphiteShortStrokeSummary(
  settings: NormalizedStudioBrushDynamicsSettings,
  id = "9f54f65f-053e-4ad8-bf06-6103a5d2694a",
) {
  const source: DrawEl = {
    id, type: "draw", kind: "freehand", mode: "pen",
    brush: "dry-media", brushCatalogId: "material-graphite-platelets", stroke: "#7c5cfc",
    strokeWidth: 15, opacity: 0.82,
    points: [502.9195088676671, 301.69238528985335, 494.07912687585264, 298.74425123164633],
    pressures: [0.55, 0.7317572025598869], brushDynamics: settings,
    paintModel: "bounded-flow-v2", paperModel: "contact-tooth-v2",
  };
  const result = planStudioDynamicBrushRender(source, "dry-media", false);
  if (result.status !== "ready") throw new Error("흑연 단획 계획이 거부됐습니다.");
  const plan = result.plan;
  const coverage = planStudioDynamicBrushCoverageAndLegacyMarks({
    dabVariations: plan.dabVariations, dynamics: plan.dynamics, materialIdentity: plan.materialIdentity,
    dynamicSeed: plan.seed, stroke: source.stroke, stampGrid: plan.renderBudget.stampGrid,
    markBudget: plan.markBudget, ...(plan.paper ? { paper: plan.paper } : {}),
  }).coveragePlan;
  if (!coverage.ok) throw new Error("흑연 단획 커버리지가 거부됐습니다.");
  return {
    flow: plan.dynamics.flow.base,
    seed: plan.seed,
    markCount: coverage.marks.length,
    alphaPeak: coverage.marks.reduce((peak, mark) => Math.max(peak, mark.alpha), 0),
    energy: coverage.marks.reduce((sum, mark) => sum + mark.alpha * mark.radiusX * mark.radiusY, 0),
  };
}

describe("material brushes in the actual product selection contract", () => {
  it("exposes 40 new tools in the public picker, not only an internal registry", () => {
    expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(88);
    for (const id of STUDIO_MATERIAL_BRUSH_IDS) {
      expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.some((row) => row.id === id), id).toBe(true);
      expect(studioBrushCatalogItemById(id)?.source, id).toBe("pro");
      expect(materializeStudioBrushPackSelection(id)?.catalogId, id).toBe(id);
    }
    expect(studioMaterialBrushDefinition("material-invented")).toBeNull();
    expect(materializeStudioBrushPackSelection("material-invented")).toBeNull();
  });

  it("does no field compilation on selection and keeps immutable snapshots detached", () => {
    studioProceduralTipCache.clear();
    for (const id of STUDIO_MATERIAL_BRUSH_IDS) {
      const first = materializeStudioBrushPackSelection(id)!;
      const second = materializeStudioBrushPackSelection(id)!;
      expect(first.brushDynamics).not.toBe(second.brushDynamics);
      first.brushDynamics.width.base = 999;
      expect(second.brushDynamics.width.base).toBe(second.defaultWidth);
      expect(second.brushDynamics.tip.alphaMapSize).toBe(64);
      expect(second.brushDynamics.tipLayers).toHaveLength(0);
      expect(second.brushDynamics.opacity.base).toBe(1);
      expect(second.brushDynamics.colorDynamics.hueJitter).toBe(0);
      expect(new TextEncoder().encode(JSON.stringify(second.brushDynamics)).byteLength).toBeLessThan(14 * 1024);
    }
    expect(studioProceduralTipCache.stats().misses).toBe(0);
  });

  it.each(STUDIO_MATERIAL_BRUSH_IDS)("preserves %s material bytes and dabs after JSON persistence", (id) => {
    const selection = materializeStudioBrushPackSelection(id)!;
    const settings = selection.brushDynamics;
    const replay = normalizeStudioBrushDynamicsSettings(JSON.parse(JSON.stringify(settings)));
    expect(serializeStudioBrushDynamicsSettingsCanonical(replay))
      .toBe(serializeStudioBrushDynamicsSettingsCanonical(settings));
    const first = planNormalizedStudioDynamicBrushDabs(input, settings);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(input.maxDabs);
    expect(planNormalizedStudioDynamicBrushDabs(input, replay)).toEqual(first);
    expect(settings.tip.alphaMapBase64).toBe(replay.tip.alphaMapBase64);
  });

  it.each(STUDIO_MATERIAL_BRUSH_IDS)("maps real pressure monotonically for %s without changing spacing by speed", (id) => {
    const settings = materializeStudioBrushPackSelection(id)!.brushDynamics;
    const widths: number[] = [], flows: number[] = [];
    for (const pressure of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const resolved = resolveStudioBrushDynamics({ pressure, speed: 0.5, tiltX: 0, tiltY: 0 }, settings);
      widths.push(resolved.width); flows.push(resolved.flow);
    }
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(flows).toEqual([...flows].sort((a, b) => a - b));
    expect(widths.at(-1)!).toBeGreaterThan(widths[0]! * 1.5);
    expect(settings.spacing.mappings).toHaveLength(0);
    expect(settings.width.jitter).toBeNull();
  });


  it("흑연 새 선택의 flow를 보강해도 저장 snapshot과 사용자 flow를 다시 해석하지 않는다", async () => {
    const definition = studioMaterialBrushDefinition("material-graphite-platelets");
    const selection = await materializeStudioBrushCatalogSelection("material-graphite-platelets");
    if (!definition || !selection?.brushDynamics) throw new Error("흑연 선택 계약이 없습니다.");
    const saved = materializeStudioMaterialBrushDynamics({ ...definition, flow: 0.46 }, 15);
    const savedJson = JSON.stringify(saved);
    const replay = normalizeStudioBrushDynamicsSettings(JSON.parse(savedJson));
    const historical = graphiteShortStrokeSummary(replay);
    expect(historical.flow).toBe(0.46);
    expect(historical.seed).toBe(2022802637);
    expect(historical.markCount).toBe(4);
    expect(historical.alphaPeak).toBeCloseTo(0.023558385882381724, 14);
    expect(historical.energy).toBeCloseTo(3.5426084394055932, 13);
    expect(serializeStudioBrushDynamicsSettingsCanonical(replay))
      .toBe(serializeStudioBrushDynamicsSettingsCanonical(saved));
    const custom = normalizeStudioBrushDynamicsSettings({ ...saved, flow: { ...saved.flow, base: 0.21 } });
    expect(graphiteShortStrokeSummary(custom).flow).toBe(0.21);
    expect(JSON.stringify(saved)).toBe(savedJson);
    expect(selection.defaultWidth).toBe(15);
    expect(selection.defaultOpacity).toBe(0.82);
    // 실제 Canvas 검사의 두 UUID와 40조합 중 최저 적분 energy 입력을 함께 보존한다.
    const boundaries = [
      { id: "9f54f65f-053e-4ad8-bf06-6103a5d2694a", seed: 2022802637,
        alphaPeak: 0.03000588490164325, energy: 4.488417715808125 },
      { id: "9f54f65f-053e-4ad8-bf06-6103a5d2694b", seed: 1230059198,
        alphaPeak: 0.028551700263625676, energy: 4.19446699070399 },
      { id: "00000000-0000-4000-8000-000000000002", seed: 1942638054,
        alphaPeak: 0.02916679548509142, energy: 4.096084747284305 },
    ];
    for (const boundary of boundaries) {
      const authored = graphiteShortStrokeSummary(selection.brushDynamics, boundary.id);
      expect(authored.flow).toBe(0.57);
      expect(authored.seed).toBe(boundary.seed);
      expect(authored.markCount).toBe(4);
      expect(authored.alphaPeak).toBeCloseTo(boundary.alphaPeak, 14);
      expect(authored.energy).toBeCloseTo(boundary.energy, 13);
    }
  });

  it("keeps tilt shading responsive and small opaque decoration geometry unsquashed", () => {
    for (const definition of STUDIO_MATERIAL_BRUSH_DEFINITIONS) {
      const settings = materializeStudioBrushPackSelection(`material-${definition.program}`)!.brushDynamics;
      const flat = resolveStudioBrushDynamics({ pressure: 0.5, tiltX: 0, tiltY: 0 }, settings);
      const tilted = resolveStudioBrushDynamics({ pressure: 0.5, tiltX: 60, tiltY: 20 }, settings);
      if (definition.tiltRatio < 0.8) {
        expect(tilted.width, definition.program).toBeGreaterThan(flat.width);
        expect(tilted.roundness, definition.program).toBeLessThan(flat.roundness);
      } else if (definition.tiltRatio === 1) {
        expect(tilted.roundness, definition.program).toBe(flat.roundness);
      }
    }
  });
});
