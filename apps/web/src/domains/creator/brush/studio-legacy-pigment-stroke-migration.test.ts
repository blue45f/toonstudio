import { describe, expect, it, vi } from "vitest";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { createBrushStudioV6MaterialStroke, normalizeBrushStudioV6MaterialConfig, type BrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { BrushStudioV6LegacyPigmentMigrationRequiredError, hasVisibleLegacyMixboxStrokes, requiresLegacyMixboxStrokeMigration } from "../brush-lab/brush-studio-v6-legacy-pigment";
import { planStudioMaterialBrush, studioMaterialBrushToSvg } from "./studio-material-brush-runtime";
import { planLegacyPigmentStrokeCopies, restoreLegacyPigmentArchivedStroke } from "./studio-legacy-pigment-stroke-migration";
import { hasContiguousLayerGroups, isEffectivelyHidden } from "../studio-layers";
import { resolveTimelineComposite, resolveTimelineTransforms, type AnimationTimelineDoc } from "../studio-anim-tracks";
import { exportPageToSvg } from "../export/studio-svg-export";
import { createStudioRasterExportOrchestration } from "../render/studio-raster-export-orchestration-runtime";
import { DEFAULT_PAGE_GRADE } from "../studio-page-grade";
import type { DrawEl, El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { withMasterElements } from "../studio-master-page";

export function legacyPigmentStroke(version: 1 | 2 = 2): DrawEl {
  const program = { ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" as const };
  const material = createBrushStudioV6MaterialReceipt(program);
  const source: BrushStudioV6MaterialConfig = version === 1
    ? { version: 1, seed: material.seed, slots: material.slots, tuning: material.tuning, input: material.input }
    : { ...material, runtime: { ...material.runtime, bindings: material.runtime.bindings.map((binding) => binding.nodeIds.includes("pigment-mixbox")
      ? { providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial", execution: "native", nodeIds: ["pigment-mixbox"] } : binding) } };
  return { id: "old-stroke", type: "draw", kind: "freehand", points: [20, 30, 50, 60], pressures: [0.3, 0.8], stroke: "#fde000", strokeWidth: 20,
    brushEnginePrograms: { version: 1, material: source } };
}

describe("원고 안의 이전 Mixbox 획 이주 경계", () => {
  it.each([1, 2] as const)("V%s 원본의 raw replay·SVG를 자체 혼색으로 조용히 바꾸지 않는다", (version) => {
    const source = legacyPigmentStroke(version);
    const material = source.brushEnginePrograms?.material;
    expect(material).toBeDefined();
    expect(requiresLegacyMixboxStrokeMigration(material)).toBe(true);
    expect(() => planStudioMaterialBrush(source)).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(() => studioMaterialBrushToSvg(source)).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(() => exportPageToSvg({ width: 100, height: 100, elements: [source] })).toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
  });

  it.each([1, 2] as const)("V%s는 명시 사본에서만 자체 혼색을 실행하며 원본·포인트·파라미터를 보존한다", (version) => {
    const source = legacyPigmentStroke(version);
    const before = structuredClone(source);
    let nextId = 0;
    const plan = planLegacyPigmentStrokeCopies([source], [], () => `archive-${nextId++}`);
    expect(source).toEqual(before);
    const archive = plan.elements[0];
    if (archive?.type !== "draw") throw new Error("원본 보관본이 없습니다.");
    expect(restoreLegacyPigmentArchivedStroke(archive)).toEqual({ element: before, sourceIndex: 0 });
    const copy = plan.elements[1];
    expect(copy?.type).toBe("draw");
    if (copy?.type !== "draw") throw new Error("사본 획이 없습니다.");
    expect(copy.id).toBe(source.id);
    expect(copy.points).toEqual(source.points);
    expect(copy.pressures).toEqual(source.pressures);
    expect(copy.brushEnginePrograms?.material?.input).toEqual(source.brushEnginePrograms?.material?.input);
    expect(copy.brushEnginePrograms?.material?.tuning).toEqual(source.brushEnginePrograms?.material?.tuning);
    expect(copy.brushEnginePrograms?.material?.version).toBe(version);
    expect(requiresLegacyMixboxStrokeMigration(copy.brushEnginePrograms?.material)).toBe(false);
    expect(planStudioMaterialBrush(copy).length).toBeGreaterThan(0);
    const svgElements = plan.elements.map((element) => {
      if (element.type !== "draw") throw new Error("이주 계획에 획이 아닌 요소가 있습니다.");
      return element;
    });
    const exported = exportPageToSvg({ width: 100, height: 100, elements: svgElements, groups: plan.groups });
    expect(exported.svg).toContain("material-contact-v1");
    expect(exported.elementCount).toBe(1);
    expect(exported.svg).toBe(exportPageToSvg({ width: 100, height: 100, elements: [copy], groups: plan.groups }).svg);
    expect(hasVisibleLegacyMixboxStrokes(plan.elements, [])).toBe(false);
  });

  it("숨긴 원본은 정상적인 내보내기 제외 규칙을 따른다", () => {
    const source = { ...legacyPigmentStroke(), hidden: true };
    expect(() => exportPageToSvg({ width: 100, height: 100, elements: [source] })).not.toThrow();
    expect(hasVisibleLegacyMixboxStrokes([source], [])).toBe(false);
    expect(hasVisibleLegacyMixboxStrokes([{ ...source, hidden: false, groupId: "hidden" }], [{ id: "hidden", hidden: true }])).toBe(false);
  });

  it("실제로 안료를 쓰지 않는 도형·지우개는 불필요하게 전환하지 않는다", () => {
    const source = legacyPigmentStroke();
    const elements: El[] = [{ ...source, id: "shape", kind: "rect" }, { ...source, id: "eraser", mode: "eraser" }];
    expect(hasVisibleLegacyMixboxStrokes(elements, [])).toBe(false);
    expect(planLegacyPigmentStrokeCopies(elements, [], () => "unused")).toEqual({ elements, groups: [], sourceIds: [], copyIds: [], archiveIds: [] });
  });

  it("권한·잠금·손상된 다른 제공자·중복 ID를 이주로 우회하지 않는다", () => {
    const source = legacyPigmentStroke();
    expect(() => planLegacyPigmentStrokeCopies([{ ...source, locked: true }], [], () => "copy")).toThrow("잠긴");
    expect(() => planLegacyPigmentStrokeCopies([{ ...source, groupId: "g" }], [{ id: "g", name: "g", locked: true }], () => "copy")).toThrow("잠긴");
    expect(() => planLegacyPigmentStrokeCopies([source], [], () => source.id)).toThrow("식별자");
    const material = source.brushEnginePrograms?.material;
    if (material?.version !== 2) throw new Error("V2 원본이 없습니다.");
    const broken = { ...source, brushEnginePrograms: { version: 1 as const, material: { ...material, runtime: { ...material.runtime, bindings: material.runtime.bindings.map((binding) => binding.providerId !== "mixbox-js-v2" ? { ...binding, version: "wrong" } : binding) } } } };
    expect(() => planLegacyPigmentStrokeCopies([broken], [], () => "copy")).toThrow("안료 이외");
  });

  it("현재 live 프로그램과 현재 내부 영수증은 원래 실행 경로를 유지한다", () => {
    const program = createBrushStudioV6Program("mixbox-pigment-spray");
    expect(requiresLegacyMixboxStrokeMigration(program)).toBe(false);
    expect(() => createBrushStudioV6MaterialStroke(program)).not.toThrow();
    const material = createBrushStudioV6MaterialReceipt({ ...program, licenseProfile: "noncommercial-full" });
    expect(requiresLegacyMixboxStrokeMigration(material)).toBe(false);
    expect(normalizeBrushStudioV6MaterialConfig(material)).toEqual(material);
  });

  it("그룹이 없는 마스터는 dangling group을 만들지 않고 원래 locked 값과 숨김 원본을 보존한다", () => {
    const source = legacyPigmentStroke();
    const plan = planLegacyPigmentStrokeCopies([source], [], () => "master-archive", { archiveInGroup: false });
    expect(plan.groups).toEqual([]);
    const saved = withMasterElements({ elements: [source] }, plan.elements);
    const archive = saved.elements[0];
    if (archive?.type !== "draw") throw new Error("마스터 원본 보관본이 없습니다.");
    expect(archive.hidden).toBe(true); expect(archive.locked).toBe(source.locked);
    expect(Object.hasOwn(archive, "groupId")).toBe(false);
    expect(restoreLegacyPigmentArchivedStroke(archive)).toEqual({ element: source, sourceIndex: 0 });
    expect(saved.elements[1]?.id).toBe(source.id);
  });

  it("원본을 별도 숨김 그룹에 보관해 clipBelow의 직접 아래 레이어와 그룹 연속성을 유지한다", () => {
    const base: DrawEl = { id: "base", type: "draw", kind: "rect", points: [0, 0, 100, 100], stroke: "#000", strokeWidth: 2, groupId: "group" };
    const source: DrawEl = { ...legacyPigmentStroke(), groupId: "group", hidden: false, clipBelow: true };
    const front: DrawEl = { ...base, id: "front", clipBelow: true };
    const elements: El[] = [base, source, front]; const groups = [{ id: "group", name: "원래 그룹" }];
    let serial = 0; const plan = planLegacyPigmentStrokeCopies(elements, groups, () => `archive-${serial++}`);
    const below = (list: readonly El[], id: string, layerGroups: typeof groups) => {
      const index = list.findIndex((element) => element.id === id); const element = list[index], previous = list[index - 1];
      return element?.clipBelow && previous && !isEffectivelyHidden(previous, layerGroups) ? previous.id : null;
    };
    expect(below(plan.elements, source.id, plan.groups)).toBe(below(elements, source.id, groups));
    expect(below(plan.elements, front.id, plan.groups)).toBe(below(elements, front.id, groups));
    expect(plan.elements.filter((element) => !isEffectivelyHidden(element, plan.groups)).map((element) => element.id)).toEqual(elements.map((element) => element.id));
    expect(hasContiguousLayerGroups(plan.elements)).toBe(true);
    const archive = plan.elements[0];
    if (archive?.type !== "draw") throw new Error("보관본이 없습니다.");
    expect(restoreLegacyPigmentArchivedStroke(archive)).toEqual({ element: source, sourceIndex: 1 });
    expect(plan.groups.find((group) => group.id === archive.groupId)).toMatchObject({ hidden: true, locked: true });
  });

  it("활성 identity를 유지하여 원래 애니메이션·댓글 대상과 키프레임을 그대로 보존한다", () => {
    const source = legacyPigmentStroke(); let serial = 0;
    const timeline: AnimationTimelineDoc = { fps: 12, frameCount: 24, tracks: { [source.id]: [
      { frameIndex: 0, frame: { id: "frame1", src: "data:image/png;base64,AAAA", durationMs: 100 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
      { frameIndex: 23, frame: { id: "frame2", src: "data:image/png;base64,BBBB", durationMs: 100 }, transform: { x: 40, y: 30, rotation: 30, scaleX: 1.5, scaleY: 0.8 } },
    ] } };
    const before = structuredClone(timeline);
    const plan = planLegacyPigmentStrokeCopies([source], [], () => `archive-${serial++}`);
    const beforeIds = [source.id], afterIds = plan.elements.map((element) => element.id);
    for (const frame of [0, 11, 23]) {
      expect(resolveTimelineTransforms(timeline, afterIds, frame)).toEqual(resolveTimelineTransforms(before, beforeIds, frame));
      expect(resolveTimelineComposite(timeline, afterIds, frame)).toEqual(resolveTimelineComposite(before, beforeIds, frame));
    }
    expect(plan.archiveIds.every((id) => !Object.hasOwn(timeline.tracks, id))).toBe(true);
    expect(plan.archiveIds.every((id) => plan.elements.some((element) => element.id === id && isEffectivelyHidden(element, plan.groups)))).toBe(true);
    expect(timeline).toEqual(before);
  });
});

describe("래스터 내보내기의 이전 혼색 확인", () => {
  it.each(["page", "master", "hidden-master"] as const)("%s의 이전 획을 실제 표시 범위대로 캡처 전에 확인한다", async (source) => {
    const elements: El[] = source === "page" ? [legacyPigmentStroke()] : [];
    const page: PageState = { id: "page", elements, bg: "#fff", bgGrad: null, canvasH: 100, ...(source === "hidden-master" ? { hideMaster: true } : {}) };
    const capture = vi.fn(async () => { throw new Error("캡처되면 안 됩니다."); });
    const runtime = createStudioRasterExportOrchestration({ activePage: page, pages: [page], masterElements: source !== "page" ? [legacyPigmentStroke()] : [], currentPageId: page.id,
      masterEditMode: false, exportTransparent: false, exportFormat: "png", exportScale: 1, effectiveScale: 1, pageGrade: DEFAULT_PAGE_GRADE, title: "test",
      ensureSharedDocumentAvailableForExport: () => true, ensureWatermarkLoaded: async () => ({ enabled: false, text: "", opacity: 0.2, position: "br", size: 1 }),
      drawWatermarkOnCanvas: vi.fn(), captureReadyStageForPage: capture, preserveStudioViewBeforeCapture: vi.fn(), setExportMenuOpen: vi.fn(), setSelectedId: vi.fn(), setMasterEditMode: vi.fn(), setIsExporting: vi.fn(), setError: vi.fn(), setCurrentPageId: vi.fn() });
    if (source === "hidden-master") {
      await expect(runtime.handleCapturePagesForIndices([0])).rejects.toThrow("캡처되면 안 됩니다.");
      expect(capture).toHaveBeenCalledTimes(1);
    } else {
      await expect(runtime.handleCapturePagesForIndices([0])).rejects.toThrow(BrushStudioV6LegacyPigmentMigrationRequiredError);
      expect(capture).not.toHaveBeenCalled();
    }
  });
});
