// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PAGE_GRADE } from "../studio-page-grade";

import type { PageState } from "../studio-page-state";
import type Konva from "konva";

import {
  StudioPageGradeBakeUnavailableError,
  bakeStudioPageGradeIntoCanvas,
  createStudioRasterExportOrchestration,
} from "./studio-raster-export-orchestration-runtime";

describe("bakeStudioPageGradeIntoCanvas exact grade authority", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the source only when the operation selected the explicit default-grade no-op", () => {
    const source = { width: 320, height: 180 } as HTMLCanvasElement;
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        throw new Error("default grade must not allocate a surface");
      }),
    });

    expect(bakeStudioPageGradeIntoCanvas(source, DEFAULT_PAGE_GRADE)).toBe(source);
  });

  it("does not export the ungraded source when the selected grade surface is unavailable", () => {
    const source = { width: 320, height: 180 } as HTMLCanvasElement;
    const output = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { createElement: vi.fn(() => output) });

    expect(() => bakeStudioPageGradeIntoCanvas(source, {
      ...DEFAULT_PAGE_GRADE,
      brightness: 1.1,
    })).toThrow(StudioPageGradeBakeUnavailableError);
  });
});


function exportPage(): PageState {
  return {
    id: "page-1",
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 100,
  };
}

function stageHarness() {
  let width = 720;
  let height = 100;
  let x = 0;
  let y = 0;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  const legacyCanvas = document.createElement("canvas");
  legacyCanvas.width = 720;
  legacyCanvas.height = 100;
  const background = { hide: vi.fn(), show: vi.fn() };
  const stage = {
    width: vi.fn(() => width),
    height: vi.fn(() => height),
    x: vi.fn(() => x),
    y: vi.fn(() => y),
    scaleX: vi.fn(() => scaleX),
    scaleY: vi.fn(() => scaleY),
    rotation: vi.fn((next?: number) => {
      if (next !== undefined) rotation = next;
      return rotation;
    }),
    size: vi.fn((box: { width: number; height: number }) => {
      width = box.width;
      height = box.height;
    }),
    position: vi.fn((point: { x: number; y: number }) => {
      x = point.x;
      y = point.y;
    }),
    scale: vi.fn((next: { x: number; y: number }) => {
      scaleX = next.x;
      scaleY = next.y;
    }),
    draw: vi.fn(),
    batchDraw: vi.fn(),
    findOne: vi.fn(() => background),
    toCanvas: vi.fn(() => legacyCanvas),
  } as unknown as Konva.Stage;
  return { stage, legacyCanvas, background };
}

function orchestrationInput(
  stage: Konva.Stage,
  captureSkiaDocumentForExport: NonNullable<
    Parameters<typeof createStudioRasterExportOrchestration>[0]["captureSkiaDocumentForExport"]
  >,
) {
  const page = exportPage();
  return {
    activePage: page,
    pages: [page],
    masterElements: [],
    captureSkiaDocumentForExport,
    currentPageId: page.id,
    masterEditMode: false,
    exportTransparent: false,
    exportFormat: "png" as const,
    exportScale: 1,
    effectiveScale: 1,
    pageGrade: DEFAULT_PAGE_GRADE,
    title: "test",
    ensureSharedDocumentAvailableForExport: () => true,
    ensureWatermarkLoaded: async () => ({ enabled: false, text: "", opacity: 0.2, position: "br" as const, size: 1 }),
    drawWatermarkOnCanvas: vi.fn(),
    captureReadyStageForPage: async (readyPage: PageState, onReady?: (page: PageState) => void) => {
      onReady?.(readyPage);
      return stage;
    },
    preserveStudioViewBeforeCapture: vi.fn(),
    setExportMenuOpen: vi.fn(),
    setSelectedId: vi.fn(),
    setMasterEditMode: vi.fn(),
    setIsExporting: vi.fn(),
    setError: vi.fn(),
    setCurrentPageId: vi.fn(),
  };
}

describe("raster export renderer migration", () => {
  it("대형 출력의 다음 타일 전에 마스터가 바뀌면 이전 Stage를 다시 읽지 않는다", async () => {
    const module = await import("../export/studio-export-presets"); const h = stageHarness();
    const input = orchestrationInput(h.stage, vi.fn(async () => { throw new Error("전체 캡처 금지"); }));
    const page = { ...input.activePage, canvasH: 20_000 }; let generation = 2;
    const runtime = createStudioRasterExportOrchestration({ ...input, activePage: page, pages: [page], getDocumentGeneration: () => generation });
    vi.mocked(h.stage.toCanvas).mockImplementation(() => ({ width: 8, height: 8,
      getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(256) }) }),
    }) as unknown as HTMLCanvasElement);
    const exporter = vi.spyOn(module, "exportPresetSlices").mockImplementation(async (options) => {
      const source = options.pages[0]; if (!source || !("kind" in source)) throw new Error("타일 원본 없음");
      await source.readRegion({ x: 0, y: 0, width: 8, height: 8 }); generation += 1;
      await source.readRegion({ x: 0, y: 8, width: 8, height: 8 });
      throw new Error("바뀐 원고를 출력하면 안 됩니다.");
    });
    try {
      const preset = module.findExportPreset("original"); if (!preset) throw new Error("프리셋 없음");
      await expect(runtime.handleExportPresetSlices(null, { preset, format: "png", title: "원고" })).rejects.toThrow("마스터 또는 원고가 바뀌어");
      expect(h.stage.toCanvas).toHaveBeenCalledTimes(1);
    } finally { exporter.mockRestore(); }
  });

  it("캡처 준비를 기다리는 동안 최신 마스터가 바뀌면 닫힌 원소나 placeholder를 출력하지 않는다", async () => {
    const h = stageHarness(); const capture = vi.fn(async () => ({ status: "unsupported" as const, reason: "gradient-page-background" }));
    const input = orchestrationInput(h.stage, capture);
    let master: readonly import("../studio-element-model").El[] = [];
    const runtime = createStudioRasterExportOrchestration({ ...input, getMasterElements: () => master,
      captureReadyStageForPage: async () => { master = []; return h.stage; } });
    await expect(runtime.handleCapturePagesForPreset("current")).rejects.toThrow("마스터 또는 원고가 바뀌어");
    expect(capture).not.toHaveBeenCalled(); expect(h.stage.toCanvas).not.toHaveBeenCalled();
  });

  it.each(["master", "generation"] as const)("Skia 준비 중 %s 변경은 호환 캡처 fallback으로 숨기지 않는다", async (changed) => {
    const h = stageHarness(); let master: readonly import("../studio-element-model").El[] = []; let generation = 2;
    const capture = vi.fn(async () => {
      if (changed === "master") master = []; else generation += 1;
      throw new Error("GPU 표면을 만들 수 없습니다.");
    });
    const runtime = createStudioRasterExportOrchestration({ ...orchestrationInput(h.stage, capture),
      getMasterElements: () => master, getDocumentGeneration: () => generation });
    await expect(runtime.handleCapturePagesForPreset("current")).rejects.toThrow("마스터 또는 원고가 바뀌어");
    expect(h.stage.toCanvas).not.toHaveBeenCalled();
  });

  it("대형 규격 출력은 전체 페이지 캔버스를 만들지 않고 같은 문서 renderer의 영역만 읽는다", async () => {
    const module = await import("../export/studio-export-presets");
    const h = stageHarness();
    const capture = vi.fn(async () => { throw new Error("전체 캡처는 실행되면 안 됩니다."); });
    const input = orchestrationInput(h.stage, capture);
    const page = { ...input.activePage, canvasH: 20_000 };
    const runtime = createStudioRasterExportOrchestration({ ...input, activePage: page, pages: [page] });
    const sizes: number[][] = [];
    vi.mocked(h.stage.toCanvas).mockImplementation(() => {
      sizes.push([h.stage.width(), h.stage.height()]);
      return {
        width: h.stage.width(), height: h.stage.height(),
        getContext: () => ({ getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4).fill(127) }) }),
      } as unknown as HTMLCanvasElement;
    });
    const exporter = vi.spyOn(module, "exportPresetSlices").mockImplementation(async (options) => {
      const source = options.pages[0];
      if (!source || !("kind" in source)) throw new Error("타일 원본이 연결되지 않았습니다.");
      expect(source.height).toBe(20_000);
      expect(await source.readRegion({ x: 8, y: 19_990, width: 16, height: 10 })).toHaveLength(640);
      return { files: 2, oversized: 0, format: "png", targetWidth: 720, tiledPages: 1 };
    });
    try {
      const preset = module.findExportPreset("original");
      if (!preset) throw new Error("테스트 프리셋 없음");
      expect(await runtime.handleExportPresetSlices(null, { preset, format: "png", title: "원고" })).toMatchObject({ tiledPages: 1 });
      expect(sizes).toEqual([[16, 10]]);
      expect(capture).not.toHaveBeenCalled();
      expect(input.setIsExporting).toHaveBeenLastCalledWith(false);
      expect(input.setCurrentPageId).toHaveBeenLastCalledWith(page.id);
    } finally { exporter.mockRestore(); }
  });

  it("uses an exact detached Skia document capture without reading visible Stage pixels", async () => {
    const h = stageHarness();
    const skiaCanvas = document.createElement("canvas");
    skiaCanvas.width = 720;
    skiaCanvas.height = 100;
    const captureSkiaDocumentForExport = vi.fn(async () => ({
      status: "captured" as const,
      canvas: skiaCanvas,
      ownedDocumentIds: [] as string[],
    }));
    const runtime = createStudioRasterExportOrchestration(
      orchestrationInput(h.stage, captureSkiaDocumentForExport),
    );

    await expect(runtime.handleCapturePagesForPreset("current")).resolves.toEqual([skiaCanvas]);
    expect(h.stage.toCanvas).not.toHaveBeenCalled();
    expect(captureSkiaDocumentForExport).toHaveBeenCalledWith(expect.objectContaining({
      page: expect.objectContaining({ id: "page-1" }),
      exportScale: 1,
      transparent: false,
    }));
  });

  it("retains the canonical compatibility capture when Skia cannot represent the document", async () => {
    const h = stageHarness();
    const captureSkiaDocumentForExport = vi.fn(async () => ({
      status: "unsupported" as const,
      reason: "gradient-page-background",
    }));
    const runtime = createStudioRasterExportOrchestration(
      orchestrationInput(h.stage, captureSkiaDocumentForExport),
    );

    const result = await runtime.handleCapturePagesForPreset("current");
    expect(result).toEqual([h.legacyCanvas]);
    expect(h.stage.toCanvas).toHaveBeenCalledOnce();
    expect(h.legacyCanvas.dataset.studioRasterExportBackend).toBe("konva-compatibility");
  });
});
