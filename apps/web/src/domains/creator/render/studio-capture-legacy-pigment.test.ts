import { describe, expect, it, vi } from "vitest";
import { waitForStudioCaptureReady } from "../studio-capture-readiness";
import { BrushStudioV6LegacyPigmentMigrationRequiredError } from "../brush-lab/brush-studio-v6-legacy-pigment";

const legacy = { id: "previous-pigment", type: "draw", kind: "freehand", brushEnginePrograms: {
  material: { version: 2, runtime: { bindings: [{ providerId: "mixbox-js-v2" }] } },
} };

function captureFixture(mode: "current" | "historical", elements: readonly unknown[] = []) {
  const page = { id: "page", elements, groups: [] as readonly unknown[], hideMaster: false };
  let master = { elements: [] as readonly unknown[] };
  let generation = 2;
  const stage = { batchDraw: vi.fn(), toCanvas: vi.fn() };
  const onReady = vi.fn();
  const options = {
    pageId: page.id, getRenderedPageId: () => page.id, getStage: () => stage,
    getMaster: () => master, getDocumentGeneration: () => generation,
    expectedDocumentGeneration: generation,
    ...(mode === "current" ? { document: {
      drawingRef: { current: null }, drawingPointerTransportRef: { current: null },
      pendingStrokeCommitsRef: { current: null }, flushPendingStrokes: vi.fn(),
      pagesHistoryRef: { current: [[page]] }, pagesHiRef: { current: 0 },
      captureCommitRef: { current: { pageId: page.id, historyIndex: 0, page } }, master, onReady,
    } } : { sourcePage: page }),
    nextFrame: vi.fn(async () => undefined), waitForFonts: vi.fn(async () => undefined),
    preloadImage: vi.fn(async () => undefined), waitForWetPaperBakes: vi.fn(async () => false),
    waitForRasterPresentations: vi.fn(async (_identities: unknown, draw: () => unknown) => { draw(); }),
  };
  return { page, options, stage, onReady, setMaster: (next: typeof master) => { master = next; },
    advanceGeneration: () => { generation += 1; } };
}

describe("모든 Stage 출력의 이전 안료·최신 마스터 경계", () => {
  it.each(["current", "historical"] as const)("%s 페이지의 원본 획은 PNG·PSD·타임랩스 공통 준비 단계에서 막는다", async (mode) => {
    const f = captureFixture(mode, [legacy]);
    await expect(waitForStudioCaptureReady(f.options)).rejects.toBeInstanceOf(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(f.stage.batchDraw).not.toHaveBeenCalled();
    expect(f.stage.toCanvas).not.toHaveBeenCalled();
    expect(f.onReady).not.toHaveBeenCalled();
  });

  it.each(["current", "historical"] as const)("%s의 최신 마스터 원본은 닫힌 이전 마스터와 별도로 확인한다", async (mode) => {
    const f = captureFixture(mode);
    f.setMaster({ elements: [legacy] });
    await expect(waitForStudioCaptureReady(f.options)).rejects.toBeInstanceOf(BrushStudioV6LegacyPigmentMigrationRequiredError);
    expect(f.stage.batchDraw).not.toHaveBeenCalled();
  });

  it.each(["current", "historical"] as const)("%s가 숨긴 마스터는 출력에서 제외한다", async (mode) => {
    const f = captureFixture(mode); f.page.hideMaster = true;
    f.setMaster({ elements: [legacy] });
    await expect(waitForStudioCaptureReady(f.options)).resolves.toBe(f.stage);
  });

  it.each(["current", "historical"] as const)("%s 준비 중 마스터가 바뀌면 페이지 history가 같아도 출력하지 않는다", async (mode) => {
    const f = captureFixture(mode);
    f.options.waitForFonts.mockImplementation(async () => { f.setMaster({ elements: [legacy] }); });
    await expect(waitForStudioCaptureReady(f.options)).rejects.toMatchObject({ code: "stale-page" });
    expect(f.stage.batchDraw).not.toHaveBeenCalled();
    expect(f.stage.toCanvas).not.toHaveBeenCalled();
    expect(f.onReady).not.toHaveBeenCalled();
  });

  it.each(["current", "historical"] as const)("%s는 마스터 React commit 전의 문서 세대 변경도 차단한다", async (mode) => {
    const f = captureFixture(mode);
    f.options.waitForFonts.mockImplementation(async () => { f.advanceGeneration(); });
    await expect(waitForStudioCaptureReady(f.options)).rejects.toMatchObject({ code: "stale-page" });
    expect(f.stage.batchDraw).not.toHaveBeenCalled();
  });

  it("준비 모듈을 불러오는 동안의 세대 변경을 첫 렌더 전에 거부한다", async () => {
    const f = captureFixture("current"); f.advanceGeneration();
    await expect(waitForStudioCaptureReady(f.options)).rejects.toMatchObject({ code: "stale-page" });
    expect(f.options.nextFrame).not.toHaveBeenCalled();
  });

  it("보관 원본의 숨김과 숨김 그룹을 타임랩스에서도 존중한다", async () => {
    const f = captureFixture("historical", [{ ...legacy, id: "hidden", hidden: true }, { ...legacy, groupId: "archive" }]);
    f.page.groups = [{ id: "archive", hidden: true }];
    await expect(waitForStudioCaptureReady(f.options)).resolves.toBe(f.stage);
  });
});
