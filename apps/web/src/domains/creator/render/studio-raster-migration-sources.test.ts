import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { studioMaterialBrushBounds } from "../brush/studio-material-brush-runtime";
import { exportPageToSvg } from "../export/studio-svg-export";
import {
  planStudioEditableRasterCopy,
  prepareAndRenderStudioEditableRasterCopy,
  summarizeStudioRasterPreparationSources,
} from "./studio-raster-edit-preparation";

import type { BrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import type { DrawEl } from "../studio-element-model";
import type { StudioVectorReferencePreparedExport } from "../studio-vector-fill-reference";

// classifier의 판별 규칙이 아니라 집계 경계를 검사한다. 실제 판별은 기존 migration 테스트가 소유한다.
const contract = vi.hoisted(() => ({ legacy: new WeakSet<object>(), message: "명시 전환이 필요합니다. 원본은 유지됩니다." }));
vi.mock("../brush-lab/brush-studio-v6-legacy-pigment", () => ({
  requiresLegacyMixboxStrokeMigration: (program: object) => contract.legacy.has(program),
  BrushStudioV6LegacyPigmentMigrationRequiredError: class extends Error {
    constructor() { super(contract.message); }
  },
}));
vi.mock("../brush/studio-material-brush-runtime", () => ({
  studioMaterialBrushBounds: vi.fn((element: DrawEl) => {
    if (element.brushEnginePrograms?.material && contract.legacy.has(element.brushEnginePrograms.material)) {
      throw new Error("전환 전 획의 geometry를 재생했습니다.");
    }
    return { x: 20, y: 30, width: 40, height: 50 };
  }),
}));
vi.mock("../export/studio-svg-export", () => ({
  exportPageToSvg: vi.fn((input: { elements: readonly DrawEl[] }) => {
    if (input.elements.some((element) => element.brushEnginePrograms?.material && contract.legacy.has(element.brushEnginePrograms.material))) {
      throw new Error("전환 전 획의 SVG를 재생했습니다.");
    }
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', skipped: [], fontFamilies: [], caveats: [], elementCount: input.elements.length };
  }),
}));

function line(id: string, patch: Partial<DrawEl> = {}): DrawEl {
  return { id, type: "draw", kind: "freehand", mode: "pen", points: [10, 10, 40, 40], stroke: "#111111", strokeWidth: 4, ...patch };
}

function materialStroke(version: 1 | 2, legacy = true): DrawEl {
  const receipt = createBrushStudioV6MaterialReceipt({ ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" });
  const material: BrushStudioV6MaterialConfig = version === 1
    ? { version: 1, seed: receipt.seed, slots: receipt.slots, tuning: receipt.tuning, input: receipt.input }
    : receipt;
  if (legacy) contract.legacy.add(material);
  return line(`material-v${version}`, { name: "보존할 원본", brushEnginePrograms: { version: 1, material } });
}

function freezeDeep(value: object): void {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  Object.freeze(value);
}

describe("명시 전환이 필요한 획의 래스터 집계 경계", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([1, 2] as const)("V%s 획을 재생하지 않고 ids·count·잠금·원본을 유지한다", (version) => {
    const legacy = materialStroke(version);
    const elements = [line("before"), { ...legacy, locked: true }, line("after")];
    const before = JSON.stringify(elements);
    freezeDeep(elements);
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements });
    expect(summary).toMatchObject({
      sourceBounds: { x: 0, y: 0, width: 320, height: 480 },
      orderedVisibleSourceIds: ["before", legacy.id, "after"],
      exactRenderableSourceIds: ["before", "after"],
      lockedVisibleSourceIds: [legacy.id],
      visibleContentCount: 3,
      visibleVectorDrawCount: 3,
      visibleCompositeVectorCount: 3,
      exactRenderableVisibleCount: 2,
      unsupportedVisibleCount: 1,
      unsupportedReasons: [contract.message],
    });
    expect(studioMaterialBrushBounds).not.toHaveBeenCalled();
    expect(vi.mocked(exportPageToSvg).mock.calls[0]?.[0].elements).toEqual([elements[0], elements[2]]);
    expect(JSON.stringify(elements)).toBe(before);
    expect(elements[1]?.brushEnginePrograms?.material).toBe(legacy.brushEnginePrograms?.material);
  });

  it("전부 전환 전 획이어도 빈 원고 또는 정확히 재생 가능한 원고로 판정하지 않는다", () => {
    const elements = [materialStroke(1), materialStroke(2)];
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements });
    expect(summary).toMatchObject({
      sourceBounds: { x: 0, y: 0, width: 320, height: 480 },
      orderedVisibleSourceIds: elements.map((element) => element.id),
      exactRenderableSourceIds: [], exactRenderableVisibleCount: 0, unsupportedVisibleCount: 2,
      unsupportedReasons: [contract.message],
    });
    expect(vi.mocked(exportPageToSvg).mock.calls[0]?.[0].elements).toEqual([]);
  });

  it("geometry만 예외를 피하더라도 전환 전 획은 뒤이은 SVG 검사에 전달하지 않는다", () => {
    vi.mocked(studioMaterialBrushBounds).mockReturnValueOnce(null);
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [materialStroke(1)] });
    expect(summary.unsupportedVisibleCount).toBe(1);
    expect(vi.mocked(exportPageToSvg).mock.calls[0]?.[0].elements).toEqual([]);
  });

  it.each(["element", "group", "opacity"] as const)("%s로 보이지 않는 전환 전 획은 기존 가시성 집계를 유지한다", (hiddenBy) => {
    const legacy = materialStroke(1);
    const source = { ...legacy, hidden: hiddenBy === "element", opacity: hiddenBy === "opacity" ? 0 : 1, groupId: hiddenBy === "group" ? "hidden" : undefined };
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [line("base"), source], groups: [{ id: "hidden", name: "숨긴 원본", hidden: true }] });
    expect(summary).toMatchObject({ orderedVisibleSourceIds: ["base"], exactRenderableSourceIds: ["base"], unsupportedVisibleCount: 0, sourceBounds: { x: 8, y: 8, width: 34, height: 34 } });
    expect(studioMaterialBrushBounds).not.toHaveBeenCalled();
  });

  it("일반 재질 획의 정확한 geometry·SVG 경로는 그대로 호출한다", () => {
    const current = materialStroke(2, false);
    const summary = summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [current] });
    expect(summary).toMatchObject({ sourceBounds: { x: 20, y: 30, width: 40, height: 50 }, exactRenderableSourceIds: [current.id], unsupportedVisibleCount: 0 });
    expect(studioMaterialBrushBounds).toHaveBeenCalledWith(current);
    expect(vi.mocked(exportPageToSvg).mock.calls[0]?.[0].elements).toEqual([current]);
  });

  it("잘못된 페이지 크기의 기존 안전 경계를 유지한다", () => {
    const summary = summarizeStudioRasterPreparationSources({ width: 0, height: 480, elements: [materialStroke(1)] });
    expect(summary).toMatchObject({ sourceBounds: null, exactRenderableVisibleCount: 0, unsupportedVisibleCount: 1 });
    expect(exportPageToSvg).not.toHaveBeenCalled();
  });

  it.each([1, 2] as const)("V%s 획의 동기 래스터 복사는 부분 SVG를 성공으로 반환하지 않는다", (version) => {
    const source = materialStroke(version);
    const result = planStudioEditableRasterCopy({ pageId: "page", width: 320, height: 480, elements: [line("base"), source] });
    expect(result).toMatchObject({ ok: false, code: "unsupported-fidelity", reason: { code: "unsupportedFidelity.filter", params: { layers: "‘보존할 원본’" } } });
  });

  it("준비된 SVG를 받는 비동기 복사도 전환 전 원본의 픽셀 렌더링을 막는다", async () => {
    const prepared: StudioVectorReferencePreparedExport = {
      result: { svg: "<svg/>", skipped: [], fontFamilies: [], caveats: [], elementCount: 1 },
      execution: "worker", width: 320, height: 480, fingerprintNamespace: "editable-raster-copy-v1", maxSvgBytes: 1000, maxPngBytes: 1000,
    };
    const render = vi.fn();
    const result = await prepareAndRenderStudioEditableRasterCopy({ pageId: "page", width: 320, height: 480, elements: [materialStroke(1)] }, vi.fn(async () => prepared), render);
    expect(result).toMatchObject({ ok: false, code: "unsupported-fidelity" });
    expect(render).not.toHaveBeenCalled();
    expect(exportPageToSvg).not.toHaveBeenCalled();
  });

  it("관련 없는 geometry 오류를 catch로 숨기지 않는다", () => {
    const failure = new Error("unrelated geometry error");
    vi.mocked(studioMaterialBrushBounds).mockImplementationOnce(() => { throw failure; });
    expect(() => summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [materialStroke(2, false)] })).toThrow(failure);
  });

  it("관련 없는 SVG 오류를 catch로 숨기지 않는다", () => {
    const failure = new Error("unrelated SVG error");
    vi.mocked(exportPageToSvg).mockImplementationOnce(() => { throw failure; });
    expect(() => summarizeStudioRasterPreparationSources({ width: 320, height: 480, elements: [line("base")] })).toThrow(failure);
  });
});
