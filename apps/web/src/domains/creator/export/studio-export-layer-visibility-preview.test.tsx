// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioRasterExportOrchestration } from "../render/studio-raster-export-orchestration-runtime";
import { DEFAULT_PAGE_GRADE } from "../studio-page-grade";
import type { PageState } from "../studio-page-state";
import { DEFAULT_WATERMARK } from "../studio-watermark";
import { StudioExportBasicOptions } from "./StudioExportBasicOptions";
import {
  renderStudioExportCompositePreviewToCanvas,
  summarizeStudioExportLayerVisibility,
} from "./studio-export-composite-preview";

import type Konva from "konva";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createSyntheticVisibilityPage(): PageState {
  return {
    id: "page-vis-1",
    bg: "#1e293b",
    bgGrad: ["#1e293b", "#0f172a"],
    canvasH: 720,
    groups: [{ id: "grp-draft", name: "밑그림 폴더", hidden: true }],
    elements: [
      {
        id: "vis-frame",
        type: "frame",
        name: "가시 초록 컷",
        x: 180,
        y: 180,
        width: 360,
        height: 280,
        bgColor: "#10b981",
        stroke: "#059669",
        strokeWidth: 4,
      },
      {
        id: "hid-layer",
        type: "frame",
        name: "숨김 마젠타 레이어",
        hidden: true,
        x: 20,
        y: 20,
        width: 120,
        height: 120,
        bgColor: "#ff00ff",
        stroke: "#ff00ff",
        strokeWidth: 2,
      },
      {
        id: "hid-folder-member",
        type: "frame",
        name: "숨김 폴더 멤버",
        hidden: false,
        groupId: "grp-draft",
        x: 560,
        y: 20,
        width: 120,
        height: 120,
        bgColor: "#ff00aa",
        stroke: "#ff00aa",
        strokeWidth: 2,
      },
    ] as PageState["elements"],
  };
}

describe("Item 29 — 출력 미리보기와 결과의 레이어 가시성·배경·투명도 정합성", () => {
  it("개별 숨김 레이어와 숨김 폴더 하위 레이어를 미리보기 가시성 집계 및 드로잉 호출에서 모두 제외한다", () => {
    const page = createSyntheticVisibilityPage();
    const summary = summarizeStudioExportLayerVisibility(page, "png", false);

    expect(summary).toEqual({
      visibleElementCount: 1,
      hiddenLayerCount: 1,
      hiddenGroupMemberCount: 1,
      excludedHiddenTotal: 2,
      masterHidden: false,
      effectiveTransparent: false,
    });

    const fillStyles: unknown[] = [];
    const clearCalls: number[][] = [];
    const fakeCtx = {
      clearRect: (x: number, y: number, w: number, h: number) => clearCalls.push([x, y, w, h]),
      createLinearGradient: () => ({ addColorStop: vi.fn(), kind: "bg-gradient" }),
      fillRect: vi.fn(function (this: { fillStyle?: unknown }) {
        fillStyles.push(this.fillStyle);
      }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(function (this: { fillStyle?: unknown }) {
        fillStyles.push(this.fillStyle);
      }),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      fillStyle: "" as unknown,
      strokeStyle: "",
      lineWidth: 1,
      filter: "none",
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
    } as unknown as HTMLCanvasElement;

    renderStudioExportCompositePreviewToCanvas(canvas, {
      page,
      canvasWidth: 720,
      canvasHeight: 720,
      exportFormat: "png",
      exportTransparent: false,
      watermark: DEFAULT_WATERMARK,
    });

    expect(clearCalls).toEqual([[0, 0, 360, 360]]);
    // 지정 그라디언트 배경 + 가시 초록 요소(#10b981)만 채워지고 숨김 마젠타(#ff00ff / #ff00aa)는 단 한 번도 채워지지 않는다
    expect(fillStyles).toContain("#10b981");
    expect(fillStyles).not.toContain("#ff00ff");
    expect(fillStyles).not.toContain("#ff00aa");
  });

  it("PNG·WebP 투명 배경에서는 배경 채우기를 생략(알파 0)하고 JPG에서는 투명 요청 시에도 지정 배경을 불투명하게 채운다", () => {
    const page: PageState = {
      ...createSyntheticVisibilityPage(),
      bgGrad: null,
      bg: "#1e293b",
    };

    const runPreview = (exportFormat: "png" | "jpg" | "webp", exportTransparent: boolean) => {
      const fillRectStyles: unknown[] = [];
      const fakeCtx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(function (this: { fillStyle?: unknown }) {
          fillRectStyles.push(this.fillStyle);
        }),
        save: vi.fn(),
        restore: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        rect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        globalAlpha: 1,
        fillStyle: "" as unknown,
        strokeStyle: "",
        lineWidth: 1,
        filter: "none",
      } as unknown as CanvasRenderingContext2D;
      const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => fakeCtx),
      } as unknown as HTMLCanvasElement;
      const result = renderStudioExportCompositePreviewToCanvas(canvas, {
        page,
        canvasWidth: 720,
        canvasHeight: 720,
        exportFormat,
        exportTransparent,
        watermark: DEFAULT_WATERMARK,
      });
      return { result, fillRectStyles };
    };

    const pngTrans = runPreview("png", true);
    expect(pngTrans.result.effectiveTransparent).toBe(true);
    expect(pngTrans.fillRectStyles).toEqual([]);

    const webpTrans = runPreview("webp", true);
    expect(webpTrans.result.effectiveTransparent).toBe(true);
    expect(webpTrans.fillRectStyles).toEqual([]);

    const jpgTrans = runPreview("jpg", true);
    expect(jpgTrans.result.effectiveTransparent).toBe(false);
    expect(jpgTrans.fillRectStyles).toEqual(["#1e293b"]);
  });

  it("StudioExportBasicOptions에 activePage를 전달하면 숨김 제외 개수·편집 오버레이 제외·투명 체크보드 상태를 표시한다", () => {
    const page = createSyntheticVisibilityPage();
    const view = render(
      <StudioExportBasicOptions
        canvasWidth={720}
        canvasHeight={720}
        exportScale={1}
        exportFormat="png"
        exportTransparent={true}
        watermark={DEFAULT_WATERMARK}
        isExporting={false}
        busy={false}
        activePage={page}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
        onDownloadCurrentPage={vi.fn()}
      />,
    );

    const preview = screen.getByTestId("studio-export-composite-preview");
    expect(preview.getAttribute("data-effective-transparent")).toBe("true");
    expect(preview.textContent).toContain("숨김 레이어 2개 제외");
    expect(preview.textContent).toContain("편집 오버레이 제외");
    expect(preview.textContent).toContain("투명 배경 (알파 0)");

    view.rerender(
      <StudioExportBasicOptions
        canvasWidth={720}
        canvasHeight={720}
        exportScale={1}
        exportFormat="jpg"
        exportTransparent={true}
        watermark={DEFAULT_WATERMARK}
        isExporting={false}
        busy={false}
        activePage={page}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
        onDownloadCurrentPage={vi.fn()}
      />,
    );

    expect(preview.getAttribute("data-effective-transparent")).toBe("false");
    expect(preview.textContent).toContain("JPG 불투명 배경 유지");
  });

  it("투명 내보내기 호환 캡처에서 .bg와 .paper-grain을 모두 숨긴 뒤 복원하고, 다중 페이지 스트립도 투명도를 유지한다", async () => {
    const bgNode = { hide: vi.fn(), show: vi.fn(), visible: () => true };
    const paperGrainNode = { hide: vi.fn(), show: vi.fn(), visible: () => true };
    const legacyCanvas = document.createElement("canvas");
    legacyCanvas.width = 720;
    legacyCanvas.height = 120;

    let w = 720;
    let h = 120;
    let x = 0;
    let y = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    const stage = {
      width: vi.fn(() => w),
      height: vi.fn(() => h),
      x: vi.fn(() => x),
      y: vi.fn(() => y),
      scaleX: vi.fn(() => sx),
      scaleY: vi.fn(() => sy),
      rotation: vi.fn((next?: number) => {
        if (next !== undefined) rot = next;
        return rot;
      }),
      size: vi.fn((box: { width: number; height: number }) => {
        w = box.width;
        h = box.height;
      }),
      position: vi.fn((pt: { x: number; y: number }) => {
        x = pt.x;
        y = pt.y;
      }),
      scale: vi.fn((next: { x: number; y: number }) => {
        sx = next.x;
        sy = next.y;
      }),
      draw: vi.fn(),
      batchDraw: vi.fn(),
      findOne: vi.fn((selector: string) => {
        if (selector === ".bg") return bgNode;
        if (selector === ".paper-grain") return paperGrainNode;
        return null;
      }),
      toCanvas: vi.fn(() => legacyCanvas),
    } as unknown as Konva.Stage;

    const exportMod = await import("./studio-export");
    const blobSpy = vi
      .spyOn(exportMod, "canvasToBlob")
      .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    const downloadSpy = vi.spyOn(exportMod, "downloadBlob").mockImplementation(() => undefined);

    const compositeFillCalls: unknown[] = [];
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      return {
        fillStyle: "",
        fillRect: vi.fn(function (this: { fillStyle: unknown }) {
          compositeFillCalls.push(this.fillStyle);
        }),
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const p1 = createSyntheticVisibilityPage();
      const p2 = { ...p1, id: "page-vis-2" };
      const runtime = createStudioRasterExportOrchestration({
        activePage: p1,
        pages: [p1, p2],
        masterElements: [],
        captureSkiaDocumentForExport: vi.fn(async () => ({
          status: "unsupported" as const,
          reason: "paper-grain-background",
        })),
        currentPageId: p1.id,
        masterEditMode: false,
        exportTransparent: true,
        exportFormat: "png",
        exportScale: 1,
        effectiveScale: 1,
        pageGrade: DEFAULT_PAGE_GRADE,
        title: "투명스트립검증",
        ensureSharedDocumentAvailableForExport: () => true,
        ensureWatermarkLoaded: async () => DEFAULT_WATERMARK,
        drawWatermarkOnCanvas: vi.fn(),
        captureReadyStageForPage: async (readyPage, onReady) => {
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
      });

      await runtime.handleDownloadAll(12);

      // 2페이지 모두 캡처 중 .bg와 .paper-grain을 숨겼다가 복원해야 한다
      expect(bgNode.hide).toHaveBeenCalledTimes(2);
      expect(paperGrainNode.hide).toHaveBeenCalledTimes(2);
      expect(bgNode.show).toHaveBeenCalledTimes(2);
      expect(paperGrainNode.show).toHaveBeenCalledTimes(2);
      // 투명 PNG 스트립 합성 시 흰색(#ffffff) 불투명 배경으로 덮어쓰지 않아야 한다
      expect(compositeFillCalls).toEqual([]);
      expect(downloadSpy).toHaveBeenCalledOnce();
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      blobSpy.mockRestore();
      downloadSpy.mockRestore();
    }
  });
});
