// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createStudioRasterExportOrchestration } from "../render/studio-raster-export-orchestration-runtime";
import { DEFAULT_PAGE_GRADE } from "../studio-page-grade";
import { createStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import { StudioExportPanel } from "../studio-shell/StudioExportPanel";
import { DEFAULT_WATERMARK } from "../studio-watermark";
import { renderExpandedExportPanel } from "./StudioExportMenuPanel.test-helpers";
import { resetStudioExportGeometryDraft } from "./studio-export-geometry-draft";
import {
  EXPORT_PRESETS,
  exportPresetSlices,
  PresetSliceExportCancelledError,
} from "./studio-export-presets";
import { StudioExportMenuPanel } from "./StudioExportMenuPanel";

import type { PageState } from "../studio-page-state";
import type Konva from "konva";

const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const VALID_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

const hoisted = vi.hoisted(() => ({
  download: vi.fn<(blob: Blob, fileName: string) => void>(),
}));

vi.mock("./studio-export", async (original) => ({
  ...(await original<typeof import("./studio-export")>()),
  downloadBlob: hoisted.download,
}));

function makeFakeSliceCanvas(width = 800, height = 2880): HTMLCanvasElement {
  const ctx = {
    fillStyle: "#ffffff",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high" as ImageSmoothingQuality,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
  };
  return {
    width,
    height,
    getContext: vi.fn((kind: string) => (kind === "2d" ? ctx : null)),
    toBlob: vi.fn((cb: BlobCallback, mime?: string) => {
      if (mime === "image/jpeg") {
        cb(new Blob([VALID_JPEG_BYTES], { type: "image/jpeg" }));
        return;
      }
      cb(new Blob([VALID_PNG_BYTES], { type: "image/png" }));
    }),
  } as unknown as HTMLCanvasElement;
}

describe("내보내기 중 취소·작업공간 복귀 시 미완성 산출물 분리 및 원고 불변성 계약 (백로그 30)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useI18n.setState({ lang: "ko" });
    resetStudioExportGeometryDraft();
    hoisted.download.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("분할 저장 중 1/3장 직후 내보내기 취소 시 후속 다운로드를 즉시 멈추고 미완성 산출물 경고를 표시하며 이어서 저장으로 나머지 2장만 받는다", async () => {
    const savedFileNames: string[] = [];

    const onExportSlices = vi.fn(
      async (
        _indices: readonly number[] | null,
        options: Omit<Parameters<typeof exportPresetSlices>[0], "pages">,
      ) =>
        exportPresetSlices({
          ...options,
          pages: [makeFakeSliceCanvas(720, 2880)],
          createCanvas: (w, h) => makeFakeSliceCanvas(w, h),
          delayMs: 120,
          download: (_blob, name) => {
            savedFileNames.push(name);
          },
        }),
    );

    const dialoguePages = [
      {
        id: "p1",
        canvasH: 2880,
        elements: [{ id: "b1", type: "bubble" as const, text: "원본 대사 보존", x: 40, y: 80 }],
      },
    ];
    const snapshotBefore = structuredClone(dialoguePages);

    renderExpandedExportPanel(
      <StudioExportMenuPanel
        canvasWidth={720}
        canvasHeight={2880}
        exportScale={1.111}
        exportFormat="png"
        exportTransparent={false}
        exportPresetId="webtoon-canvas"
        watermark={DEFAULT_WATERMARK}
        isExporting={false}
        exportTitle="취소분할검증"
        pageCount={1}
        activePageIndex={0}
        pageLabels={["1"]}
        dialoguePages={dialoguePages}
        capturePagesForPreset={vi.fn(async () => [makeFakeSliceCanvas(720, 2880)])}
        exportPresetSlicesFromDocument={onExportSlices as never}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
      />,
    );

    const saveBtn = screen.getAllByRole("button", { name: /^규격으로 저장$/u })[0];
    if (!saveBtn) throw new Error("규격으로 저장 버튼 누락");
    fireEvent.click(saveBtn);

    // 1번째 조각이 저장되고 상단 진행/취소 바에 취소 버튼이 뜰 때까지 대기
    await waitFor(() => {
      expect(savedFileNames).toEqual(["취소분할검증-webtoon-canvas-1of3.png"]);
      expect(screen.getByTestId("studio-export-cancel-btn")).toBeTruthy();
    });

    // 120ms 슬라이스 대기 구간 도중 즉시 내보내기 취소 클릭
    fireEvent.click(screen.getByTestId("studio-export-cancel-btn"));

    const banner = await screen.findByTestId("studio-export-cancelled-banner");
    expect(banner.getAttribute("data-incomplete-output")).toBe("true");
    expect(banner.textContent).toContain("미완성 산출물 (1/3장 · 완성본 아님)");
    expect(banner.textContent).toContain("편집 중인 원고는 수정되지 않았으며");
    // 성공 문구와 절대 혼동되지 않아야 함
    expect(banner.textContent).not.toContain("저장했어요");

    // 대기 시간(180ms)이 지나도 2of3, 3of3이 백그라운드로 저장되지 않음
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(savedFileNames).toEqual(["취소분할검증-webtoon-canvas-1of3.png"]);
    expect(dialoguePages).toEqual(snapshotBefore);

    // 이어서 저장 클릭 시 성공 1장을 건너뛰고 나머지 2장만 중복 없이 저장
    const resumeBtn = screen.getByTestId("studio-preset-slice-resume-retry");
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(savedFileNames).toEqual([
        "취소분할검증-webtoon-canvas-1of3.png",
        "취소분할검증-webtoon-canvas-2of3.png",
        "취소분할검증-webtoon-canvas-3of3.png",
      ]);
    });
  });

  it("파일이 아직 저장되기 전(0장) 내보내기를 취소하면 다운로드가 0건이며 파일 미저장·원고 무수정 안내를 표시한다", async () => {
    let releaseCapture = null as ((pages: HTMLCanvasElement[]) => void) | null;
    const capturePagesForPreset = vi.fn(
      () =>
        new Promise<HTMLCanvasElement[]>((resolve) => {
          releaseCapture = resolve;
        }),
    );

    renderExpandedExportPanel(
      <StudioExportMenuPanel
        canvasWidth={720}
        canvasHeight={1280}
        exportScale={1}
        exportFormat="png"
        exportTransparent={false}
        exportPresetId={null}
        watermark={DEFAULT_WATERMARK}
        isExporting={false}
        exportTitle="영건취소검증"
        pageCount={1}
        activePageIndex={0}
        pageLabels={["1"]}
        capturePagesForPreset={capturePagesForPreset}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
      />,
    );

    const pdfBtn = screen.getByRole("button", { name: /PDF로 저장/u });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(screen.getByTestId("studio-export-cancel-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("studio-export-cancel-btn"));

    const banner = await screen.findByTestId("studio-export-cancelled-banner");
    expect(banner.getAttribute("data-incomplete-output")).toBe("false");
    expect(banner.textContent).toContain("내보내기 취소됨 · 파일 미저장");
    expect(banner.textContent).toContain("저장된 파일이 없으며 편집 중인 원고는 수정되지 않았어요");

    // 뒤늦게 캡처가 완료되더라도 취소 신호로 PDF 다운로드가 발생하지 않음
    releaseCapture?.([makeFakeSliceCanvas(720, 1280)]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(hoisted.download).not.toHaveBeenCalled();
  });

  it("취소하고 작업공간 복귀 클릭 및 패널 언마운트(Escape) 시 백그라운드 후속 다운로드를 차단하고 작업공간 상태 레일에 미완성 산출물 고지를 전달한다", async () => {
    const savedOnButtonReturn: string[] = [];
    const onClose = vi.fn();
    const onWorkspaceNotice = vi.fn<(msg: string) => void>();

    const makeDelayedSliceExporter = (bucket: string[]) =>
      vi.fn(
        async (
          _indices: readonly number[] | null,
          options: Omit<Parameters<typeof exportPresetSlices>[0], "pages">,
        ) =>
          exportPresetSlices({
            ...options,
            pages: [makeFakeSliceCanvas(720, 2880)],
            createCanvas: (w, h) => makeFakeSliceCanvas(w, h),
            delayMs: 120,
            download: (_blob, name) => {
              bucket.push(name);
            },
          }),
      );

    const view1 = renderExpandedExportPanel(
      <StudioExportMenuPanel
        canvasWidth={720}
        canvasHeight={2880}
        exportScale={1.111}
        exportFormat="png"
        exportTransparent={false}
        exportPresetId="webtoon-canvas"
        watermark={DEFAULT_WATERMARK}
        isExporting={false}
        exportTitle="복귀버튼검증"
        pageCount={1}
        activePageIndex={0}
        pageLabels={["1"]}
        capturePagesForPreset={vi.fn(async () => [makeFakeSliceCanvas(720, 2880)])}
        exportPresetSlicesFromDocument={makeDelayedSliceExporter(savedOnButtonReturn) as never}
        onRequestCloseAndReturn={onClose}
        onWorkspaceAbortNotice={onWorkspaceNotice}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^규격으로 저장$/u })[0]!);

    await waitFor(() => {
      expect(savedOnButtonReturn).toEqual(["복귀버튼검증-webtoon-canvas-1of3.png"]);
      expect(screen.getByTestId("studio-export-cancel-and-return-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("studio-export-cancel-and-return-btn"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onWorkspaceNotice).toHaveBeenCalledTimes(1);
    expect(onWorkspaceNotice.mock.calls[0]?.[0]).toContain("미완성 산출물 (1/3장만 저장됨 — 완성본 아님)");
    expect(onWorkspaceNotice.mock.calls[0]?.[0]).toContain("편집 중인 원고는 수정되지 않았어요");

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(savedOnButtonReturn).toEqual(["복귀버튼검증-webtoon-canvas-1of3.png"]);
    view1.unmount();

    // 시나리오 B: Escape/외부 클릭 등으로 패널이 바로 언마운트되는 경우에도 백그라운드 다운로드 0건 + 상태 고지 1회
    const savedOnUnmount: string[] = [];
    const onUnmountNotice = vi.fn<(msg: string) => void>();

    const view2 = renderExpandedExportPanel(
      <StudioExportMenuPanel
        canvasWidth={720}
        canvasHeight={2880}
        exportScale={1.111}
        exportFormat="png"
        exportTransparent={false}
        exportPresetId="webtoon-canvas"
        watermark={DEFAULT_WATERMARK}
        isExporting={false}
        exportTitle="언마운트검증"
        pageCount={1}
        activePageIndex={0}
        pageLabels={["1"]}
        capturePagesForPreset={vi.fn(async () => [makeFakeSliceCanvas(720, 2880)])}
        exportPresetSlicesFromDocument={makeDelayedSliceExporter(savedOnUnmount) as never}
        onWorkspaceAbortNotice={onUnmountNotice}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^규격으로 저장$/u })[0]!);
    await waitFor(() => {
      expect(savedOnUnmount).toEqual(["언마운트검증-webtoon-canvas-1of3.png"]);
    });

    // 패널 즉시 언마운트 (Escape로 출력 설정 닫힘 재현)
    view2.unmount();

    expect(onUnmountNotice).toHaveBeenCalledTimes(1);
    expect(onUnmountNotice.mock.calls[0]?.[0]).toContain("미완성 산출물 (1/3장만 저장됨 — 완성본 아님)");

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(savedOnUnmount).toEqual(["언마운트검증-webtoon-canvas-1of3.png"]);
  });

  it("오케스트레이션 런타임에서 내보내기 취소 시 선택 요소(selectedId)·현재 페이지·원고 데이터가 원래 상태로 완벽히 복원된다", async () => {
    const webtoonPreset = EXPORT_PRESETS.find((p) => p.id === "webtoon-canvas")!;
    const pages: PageState[] = [
      {
        id: "page-1",
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1280,
        elements: [
          {
            id: "stroke-keep-1",
            type: "freehand",
            x: 10,
            y: 20,
            points: [0, 0, 40, 50],
            stroke: "#111827",
            strokeWidth: 4,
          } as never,
        ],
      },
      {
        id: "page-2",
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1280,
        elements: [
          {
            id: "bubble-keep-2",
            type: "bubble",
            x: 80,
            y: 120,
            width: 180,
            height: 90,
            text: "수정되면 안 되는 대사",
          } as never,
        ],
      },
    ];
    const pagesSnapshot = structuredClone(pages);

    let selectedId: string | null = "stroke-keep-1";
    let currentPageId = "page-1";
    let masterEditMode = false;
    let isExporting = false;

    const controller = new AbortController();
    let capturedPages = 0;

    let stageW = 720;
    let stageH = 1280;
    let stageX = 0;
    let stageY = 0;
    let stageRot = 0;
    let stageSx = 1;
    let stageSy = 1;
    const background = { hide: vi.fn(), show: vi.fn() };
    const fakeStage = {
      width: vi.fn(() => stageW),
      height: vi.fn(() => stageH),
      x: vi.fn(() => stageX),
      y: vi.fn(() => stageY),
      scaleX: vi.fn(() => stageSx),
      scaleY: vi.fn(() => stageSy),
      rotation: vi.fn((next?: number) => {
        if (next !== undefined) stageRot = next;
        return stageRot;
      }),
      size: vi.fn((box: { width: number; height: number }) => {
        stageW = box.width;
        stageH = box.height;
      }),
      position: vi.fn((pt: { x: number; y: number }) => {
        stageX = pt.x;
        stageY = pt.y;
      }),
      scale: vi.fn((next: { x: number; y: number }) => {
        stageSx = next.x;
        stageSy = next.y;
      }),
      draw: vi.fn(),
      batchDraw: vi.fn(),
      findOne: vi.fn(() => background),
      toCanvas: vi.fn(({ width, height }: { width: number; height: number }) => makeFakeSliceCanvas(width, height)),
    } as unknown as Konva.Stage;

    const runtime = createStudioRasterExportOrchestration({
      activePage: pages[0]!,
      pages,
      masterElements: [],
      captureSkiaDocumentForExport: vi.fn(async () => {
        capturedPages += 1;
        if (capturedPages === 1) {
          // 1페이지 캡처 직후 사용자가 취소한 상황 재현
          controller.abort();
        }
        return { status: "unavailable" as const, reason: "test-stage-fallback" };
      }),
      currentPageId,
      selectedId,
      masterEditMode,
      effectiveScale: 1,
      exportScale: 1.111,
      exportFormat: "png",
      exportTransparent: false,
      pageGrade: DEFAULT_PAGE_GRADE,
      title: "런타임복원검증",
      ensureSharedDocumentAvailableForExport: () => true,
      ensureWatermarkLoaded: async () => DEFAULT_WATERMARK,
      drawWatermarkOnCanvas: vi.fn(),
      captureReadyStageForPage: async (readyPage, onReady) => {
        onReady?.(readyPage);
        return fakeStage;
      },
      preserveStudioViewBeforeCapture: vi.fn(),
      setExportMenuOpen: vi.fn(),
      setSelectedId: (next) => {
        selectedId = next;
      },
      setMasterEditMode: (next) => {
        masterEditMode = next;
      },
      setIsExporting: (next) => {
        isExporting = next;
      },
      setError: vi.fn(),
      setCurrentPageId: (next) => {
        currentPageId = next;
      },
    });

    await expect(
      runtime.handleExportPresetSlices([0, 1], {
        preset: webtoonPreset,
        format: "png",
        title: "런타임복원검증",
        watermark: DEFAULT_WATERMARK,
        signal: controller.signal,
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof PresetSliceExportCancelledError || (err instanceof DOMException && err.name === "AbortError"));

    // 2번째 페이지 캡처로 넘어가지 않고 즉시 멈췄으며, 모든 편집 상태와 원고가 그대로 유지됨
    expect(capturedPages).toBe(1);
    expect(selectedId).toBe("stroke-keep-1");
    expect(currentPageId).toBe("page-1");
    expect(masterEditMode).toBe(false);
    expect(isExporting).toBe(false);
    expect(pages).toEqual(pagesSnapshot);
  });

  it("출고 사전검사 패널(StudioExportPanel)에서 작업공간으로 돌아가기 링크가 파일 생성 없이 순수 편집기 경로를 제공한다", () => {
    createStudioProject(window.localStorage, {
      id: "proj-return-30",
      title: "복귀 경로 점검작",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-return-30", {
      id: "doc-return-30",
      title: "1화",
      kind: "webtoon",
      width: 800,
      height: 2560,
    });

    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-return-30" locale="ko" />
      </MemoryRouter>,
    );

    const returnLink = screen.getByTestId("studio-export-return-workspace-link");
    expect(returnLink.textContent).toContain("작업공간으로 돌아가기 (파일 미생성)");
    expect(returnLink.getAttribute("href")).toBe(
      "/studio/p/proj-return-30/d/doc-return-30?resume=latest&workspace=comic",
    );
    expect(returnLink.getAttribute("href")).not.toContain("exportPanel=1");
  });
});
