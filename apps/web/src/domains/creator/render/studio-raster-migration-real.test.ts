import { describe, expect, it } from "vitest";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import {
  BrushStudioV6LegacyPigmentMigrationRequiredError,
  hasVisibleLegacyMixboxStrokes,
  requiresLegacyMixboxStrokeMigration,
} from "../brush-lab/brush-studio-v6-legacy-pigment";
import { createBrushStudioV6MaterialStroke } from "../brush-lab/brush-studio-v6-material-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { planStudioMaterialBrush, studioMaterialBrushBounds, studioMaterialBrushToSvg } from "../brush/studio-material-brush-runtime";
import { exportPageToSvg } from "../export/studio-svg-export";
import { planStudioEditableRasterCopy, summarizeStudioRasterPreparationSources } from "./studio-raster-edit-preparation";
import { partitionStudioRasterMigrationSources } from "./studio-raster-migration-sources";

import type { BrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import type { DrawEl } from "../studio-element-model";

// 실제 canonical E2E와 같은 합성 receipt다. classifier·engine·bounds·export를 mock하지 않는다.
function legacyStroke(version: 1 | 2): DrawEl {
  const program = { ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" as const };
  const receipt = createBrushStudioV6MaterialReceipt(program);
  const material: BrushStudioV6MaterialConfig = version === 1
    ? { version: 1, seed: receipt.seed, slots: receipt.slots, tuning: receipt.tuning, input: receipt.input }
    : { ...receipt, runtime: { ...receipt.runtime, bindings: receipt.runtime.bindings.map((binding) => binding.nodeIds.includes("pigment-mixbox")
      ? { providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial", execution: "native", nodeIds: ["pigment-mixbox"] }
      : binding) } };
  return { id: `legacy-v${version}`, name: "보존할 이전 혼색 획", type: "draw", kind: "freehand", mode: "pen",
    points: [40, 60, 100, 80, 240, 120], pressures: [0.3, 0.7, 0.8],
    stroke: "#fde000", strokeWidth: 20, brushEnginePrograms: { version: 1, material } };
}

function nativeStroke(version: 1 | 2): DrawEl {
  const program = createBrushStudioV6Program("clean-ink");
  const receipt = createBrushStudioV6MaterialReceipt({ ...program, slots: { ...program.slots, pigment: "pigment-latent" } });
  const material: BrushStudioV6MaterialConfig = version === 1
    ? { version: 1, seed: receipt.seed, slots: receipt.slots, tuning: receipt.tuning, input: receipt.input }
    : receipt;
  return { id: `native-v${version}`, type: "draw", kind: "freehand", mode: "pen", points: [50, 50, 80, 80],
    stroke: "#334455", strokeWidth: 10, brushEnginePrograms: { version: 1, material } };
}

function freezeDeep(value: object): void {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  Object.freeze(value);
}

describe("실제 legacy 판별·재질 엔진을 사용하는 집계 회귀", () => {
  it.each([1, 2] as const)("V%s 실제 원본은 유지하고 inspector 집계만 안전하게 연다", (version) => {
    const source = legacyStroke(version);
    const current = nativeStroke(2);
    const elements = [current, source];
    const before = JSON.stringify(elements);
    freezeDeep(elements);
    expect(requiresLegacyMixboxStrokeMigration(source.brushEnginePrograms?.material)).toBe(true);
    expect(hasVisibleLegacyMixboxStrokes(elements, [])).toBe(true);
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements });
    expect(summary).toMatchObject({ sourceBounds: { x: 0, y: 0, width: 320, height: 480 },
      orderedVisibleSourceIds: [current.id, source.id], exactRenderableSourceIds: [current.id],
      visibleContentCount: 2, visibleVectorDrawCount: 2, exactRenderableVisibleCount: 1, unsupportedVisibleCount: 1,
      unsupportedReasons: [new BrushStudioV6LegacyPigmentMigrationRequiredError().message] });
    expect(JSON.stringify(elements)).toBe(before);
    expect(elements[1]).toBe(source);
    expect(requiresLegacyMixboxStrokeMigration(source.brushEnginePrograms?.material)).toBe(true);
  });

  it.each([1, 2] as const)("V%s direct engine·bounds·plan·SVG의 명시 전환 전 거절은 유지한다", (version) => {
    const source = legacyStroke(version);
    const material = source.brushEnginePrograms?.material;
    if (!material) throw new Error("합성 material이 없습니다.");
    const before = structuredClone(source);
    expect(() => createBrushStudioV6MaterialStroke(material)).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(() => studioMaterialBrushBounds(source)).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(() => planStudioMaterialBrush(source)).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(() => studioMaterialBrushToSvg(source)).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(() => exportPageToSvg({ width: 320, height: 480, elements: [source] })).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(source).toEqual(before);
  });

  it.each([1, 2] as const)("V%s legacy만 있는 페이지는 빈 원고로 집계하거나 부분 복사하지 않는다", (version) => {
    const source = legacyStroke(version);
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [source] });
    expect(summary).toMatchObject({ sourceBounds: { x: 0, y: 0, width: 320, height: 480 }, exactRenderableVisibleCount: 0, unsupportedVisibleCount: 1 });
    expect(planStudioEditableRasterCopy({ pageId: "page", width: 320, height: 480, elements: [source] }))
      .toMatchObject({ ok: false, code: "unsupported-fidelity" });
  });

  it.each([1, 2] as const)("V%s 내부 안료 receipt는 기존 정확한 geometry·SVG 경로를 사용한다", (version) => {
    const source = nativeStroke(version);
    expect(requiresLegacyMixboxStrokeMigration(source.brushEnginePrograms?.material)).toBe(false);
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [source] });
    expect(summary).toMatchObject({ sourceBounds: studioMaterialBrushBounds(source), exactRenderableSourceIds: [source.id], unsupportedVisibleCount: 0 });
    expect(exportPageToSvg({ width: 320, height: 480, elements: [source] }).svg).toContain("material-contact-v1");
  });

  it.each(["eraser", "shape"] as const)("%s는 기존 visible legacy 정책과 동일하게 전환 대상으로 추가하지 않는다", (kind) => {
    const source: DrawEl = { ...legacyStroke(1), ...(kind === "eraser" ? { mode: "eraser" as const } : { kind: "ellipse" as const }) };
    expect(hasVisibleLegacyMixboxStrokes([source], [])).toBe(false);
    const partition = partitionStudioRasterMigrationSources([source]);
    expect(partition.unsupported.size).toBe(0);
    expect(partition.replayable).toEqual([source]);
    expect(summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [source] }).unsupportedVisibleCount).toBe(0);
  });

  it.each(["element", "group", "opacity"] as const)("%s로 보이지 않는 legacy 원본은 replay하지 않는다", (hiddenBy) => {
    const source = { ...legacyStroke(1), hidden: hiddenBy === "element", groupId: hiddenBy === "group" ? "hidden" : undefined, opacity: hiddenBy === "opacity" ? 0 : 1 };
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [source], groups: [{ id: "hidden", name: "숨긴 원본", hidden: true }] });
    expect(summary).toMatchObject({ sourceBounds: null, orderedVisibleSourceIds: [], exactRenderableSourceIds: [], unsupportedVisibleCount: 0 });
  });
});
