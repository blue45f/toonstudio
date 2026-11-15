// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderExpandedExportPanel } from "./StudioExportMenuPanel.test-helpers";
import { parsePromoDocumentCutBundle } from "../promo/promo-document-cuts";
import { DEFAULT_WATERMARK } from "../studio-watermark";
import { resetStudioExportGeometryDraft } from "./studio-export-geometry-draft";
import { EXPORT_PRESETS, exportPresetSlices, PresetSlicePartialExportError } from "./studio-export-presets";
import { StudioExportMenuPanel } from "./StudioExportMenuPanel";
import { StudioPromoHandoffSection } from "./StudioPromoHandoffSection";
import type { DialogueElementLike } from "../lettering/studio-dialogue-batch";
import type { DialogueReviewPageLike } from "../lettering/studio-dialogue-review";
import type { StudioPromoCutCrop } from "./studio-promo-cuts";
import type { StudioPromoCutImageRenderer } from "./studio-promo-handoff";

const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const VALID_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

const hoisted = vi.hoisted(() => ({
  renderCut: vi.fn<StudioPromoCutImageRenderer>(),
  download: vi.fn<(blob: Blob, fileName: string) => void>(),
}));

vi.mock("./studio-promo-handoff", async (original) => ({
  ...(await original<typeof import("./studio-promo-handoff")>()),
  createStudioPromoCutImageRenderer: () => hoisted.renderCut,
}));

vi.mock("./studio-export", async (original) => ({
  ...(await original<typeof import("./studio-export")>()),
  downloadBlob: hoisted.download,
}));

const frame = (id: string, x: number, y: number, width: number, height: number): DialogueElementLike => ({
  id,
  type: "frame",
  x,
  y,
  width,
  height,
});
const bubble = (id: string, text: string, x: number, y: number): DialogueElementLike => ({
  id,
  type: "bubble",
  text,
  x,
  y,
  width: 80,
  height: 36,
});

function sampleDialoguePages(): DialogueReviewPageLike[] {
  return [
    {
      id: "p1",
      elements: [
        frame("f1", 20, 20, 320, 280),
        frame("f2", 360, 20, 320, 280),
        bubble("b1", "첫 컷 대사", 40, 40),
        bubble("b2", "둘째 컷 대사", 380, 50),
      ],
    },
    {
      id: "p2",
      elements: [frame("f3", 20, 40, 680, 360), bubble("b3", "셋째 컷 대사", 60, 70)],
    },
  ];
}

function makeCanvas(width = 1440, height = 2000): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeFakeSliceCanvas(
  width: number,
  height: number,
  options?: { shouldFailBlob?: () => boolean },
): HTMLCanvasElement {
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
      if (options?.shouldFailBlob?.()) {
        cb(null);
        return;
      }
      if (mime === "image/jpeg") {
        cb(new Blob([VALID_JPEG_BYTES], { type: "image/jpeg" }));
        return;
      }
      cb(new Blob([VALID_PNG_BYTES], { type: "image/png" }));
    }),
  } as unknown as HTMLCanvasElement;
}

describe("컷·분할 내보내기 중간 실패 후 이어받기 무중복 계약 (백로그 27)", () => {
  beforeEach(() => {
    resetStudioExportGeometryDraft();
    hoisted.renderCut.mockReset();
    hoisted.download.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("컷 묶음 중 2번째 컷이 실패해도 1번째 성공 컷을 유지하고, 이어서 재시도 시 성공분을 재렌더링하지 않으며 중복 없이 3컷 묶음을 완성한다", async () => {
    const renderedSyHistory: number[] = [];
    let failedSecondCutOnce = false;

    hoisted.renderCut.mockImplementation((_source: HTMLCanvasElement, crop: StudioPromoCutCrop) => {
      renderedSyHistory.push(crop.sx);
      // f2는 x=360 → 2x 배율 sx=720
      if (crop.sx === 720 && !failedSecondCutOnce) {
        failedSecondCutOnce = true;
        return Promise.reject(new Error("2번째 컷 인코딩 일시 오류"));
      }
      return Promise.resolve(`data:image/png;base64,aGVsbG8=`);
    });

    const capturePages = vi.fn(() =>
      Promise.resolve({
        pages: [makeCanvas(), makeCanvas()],
        indices: [0, 1],
        rangeLabel: "페이지 1–2",
      }),
    );

    const view = render(
      <StudioPromoHandoffSection
        context={{
          pageIndices: [0, 1],
          canExport: true,
          busy: false,
          rangeLabel: "페이지 1–2",
          capturePages,
        }}
        pages={sampleDialoguePages()}
        canvasWidth={720}
        exportScale={2}
        exportTitle="이어받기검증작"
        watermark={DEFAULT_WATERMARK}
        sourceWorkId="work-resume-27"
        onBusyChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "홍보 쇼츠용 컷 묶음 저장" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("성공한 컷 1개는 유지했어요");
    });
    expect(hoisted.download).not.toHaveBeenCalled();
    // 1차 시도: f1(sx=40) 성공, f2(sx=720) 실패 → 총 2회 호출 후 중단
    expect(renderedSyHistory).toEqual([40, 720]);

    const resumeBtn = screen.getByTestId("studio-promo-cuts-resume-retry");
    expect(resumeBtn.textContent).toContain("실패 2개만 이어서");

    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(hoisted.download).toHaveBeenCalledTimes(1);
    });

    // 2차 이어서 시도: f1(sx=40)은 건너뛰고 f2(sx=720), f3(sx=40 on p2)만 렌더링!
    expect(renderedSyHistory).toEqual([40, 720, 720, 40]);

    const [blob, fileName] = hoisted.download.mock.calls[0] ?? [];
    expect(fileName).toBe("이어받기검증작-promo-cuts.json");
    const parsed = parsePromoDocumentCutBundle(JSON.parse(await (blob?.text() ?? Promise.resolve("null"))));
    expect(parsed.cuts.map((cut) => cut.id)).toEqual(["p1:f1", "p1:f2", "p2:f3"]);
    expect(parsed.cuts.map((cut) => cut.order)).toEqual([0, 1, 2]);
    expect(new Set(parsed.cuts.map((cut) => cut.id)).size).toBe(3);

    view.unmount();
  });

  it("컷 묶음 부분 실패 뒤 내보내기 배율이 바뀌면 이전 부분 캐시를 폐기해 다른 해상도 컷이 섞이지 않는다", async () => {
    let callCount = 0;
    hoisted.renderCut.mockImplementation(() => {
      callCount += 1;
      if (callCount === 2) {
        return Promise.reject(new Error("일시 실패"));
      }
      return Promise.resolve("data:image/png;base64,aGVsbG8=");
    });

    const baseProps = {
      context: {
        pageIndices: [0, 1],
        canExport: true,
        busy: false,
        rangeLabel: "페이지 1–2",
        capturePages: vi.fn(() =>
          Promise.resolve({
            pages: [makeCanvas(), makeCanvas()],
            indices: [0, 1],
            rangeLabel: "페이지 1–2",
          }),
        ),
      },
      pages: sampleDialoguePages(),
      canvasWidth: 720,
      exportScale: 2,
      exportTitle: "배율변경검증",
      watermark: DEFAULT_WATERMARK,
      sourceWorkId: "work-scale-27",
      onBusyChange: vi.fn(),
    };

    const { rerender } = render(<StudioPromoHandoffSection {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "홍보 쇼츠용 컷 묶음 저장" }));
    await waitFor(() => expect(screen.getByTestId("studio-promo-cuts-resume-retry")).toBeTruthy());

    rerender(<StudioPromoHandoffSection {...baseProps} exportScale={1} />);
    expect(screen.queryByTestId("studio-promo-cuts-resume-retry")).toBeNull();
  });

  it("플랫폼 분할 저장 중 2번째 조각 실패 시 이미 저장된 1of3을 보존하고 이어서 저장 시 2of3·3of3만 다운로드해 중복 파일이 생기지 않는다", async () => {
    const webtoonPreset = EXPORT_PRESETS.find((preset) => preset.id === "webtoon-canvas");
    if (!webtoonPreset) throw new Error("webtoon-canvas preset missing");

    const savedFileNames: string[] = [];
    let createdSliceCount = 0;
    let failedSecondSliceOnce = false;

    const createSliceCanvas = (w: number, h: number) => {
      const mySliceOrder = createdSliceCount;
      createdSliceCount += 1;
      return makeFakeSliceCanvas(w, h, {
        shouldFailBlob: () => {
          // 첫 실행의 2번째 슬라이스(mySliceOrder === 1)에서 1회 실패 유발
          if (mySliceOrder === 1 && !failedSecondSliceOnce) {
            failedSecondSliceOnce = true;
            return true;
          }
          return false;
        },
      });
    };

    const onExportSlices = vi.fn(
      async (_indices: readonly number[] | null, options: Parameters<typeof exportPresetSlices>[0] extends infer T ? Omit<T & object, "pages"> : never) =>
        exportPresetSlices({
          ...(options as Omit<Parameters<typeof exportPresetSlices>[0], "pages">),
          pages: [makeFakeSliceCanvas(720, 2880)],
          createCanvas: createSliceCanvas,
          delayMs: 0,
          download: (_blob, name) => {
            savedFileNames.push(name);
          },
        }),
    );

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
        exportTitle="이어받기검증작"
        pageCount={1}
        activePageIndex={0}
        pageLabels={["1"]}
        dialoguePages={[{ id: "p1", canvasH: 2880, elements: [] }]}
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

    // 1차 저장 실행 → 1of3 성공 직후 2of3 인코딩 실패
    const saveCurrentBtn = screen.getAllByRole("button", { name: /^규격으로 저장$/u })[0];
    if (!saveCurrentBtn) throw new Error("규격으로 저장 버튼을 찾지 못했습니다.");
    fireEvent.click(saveCurrentBtn);

    await waitFor(() => {
      expect(screen.getByTestId("studio-preset-slice-resume-retry")).toBeTruthy();
    });
    expect(savedFileNames).toEqual(["이어받기검증작-webtoon-canvas-1of3.png"]);
    expect(screen.getByTestId("studio-preset-slice-resume-retry").textContent).toContain(
      "실패한 2장만 이어서 저장 (성공 1장 유지)",
    );

    // 2차 이어서 저장 클릭 → skipSliceIndices=[0]이 전달되어 2of3, 3of3만 저장!
    fireEvent.click(screen.getByTestId("studio-preset-slice-resume-retry"));

    await waitFor(() => {
      expect(screen.queryByTestId("studio-preset-slice-resume-retry")).toBeNull();
    });

    expect(savedFileNames).toEqual([
      "이어받기검증작-webtoon-canvas-1of3.png",
      "이어받기검증작-webtoon-canvas-2of3.png",
      "이어받기검증작-webtoon-canvas-3of3.png",
    ]);
    expect(new Set(savedFileNames).size).toBe(3);

    // 직접 API 레벨에서도 PresetSlicePartialExportError 타입 검증
    await expect(
      exportPresetSlices({
        pages: [makeFakeSliceCanvas(800, 2560)],
        preset: webtoonPreset,
        format: "png",
        title: "direct",
        delayMs: 0,
        download: vi.fn(),
        createCanvas: (() => {
          let n = 0;
          return (w: number, h: number) => {
            n += 1;
            return makeFakeSliceCanvas(w, h, { shouldFailBlob: () => n === 2 });
          };
        })(),
      }),
    ).rejects.toBeInstanceOf(PresetSlicePartialExportError);
  });
});
