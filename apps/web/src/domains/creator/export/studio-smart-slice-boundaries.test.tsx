// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EXPORT_PRESETS, exportPresetSlices } from "./studio-export-presets";
import { StudioExportMenuPanel, type StudioExportMenuPanelProps } from "./StudioExportMenuPanel";
import {
  adjustSingleSliceBoundary,
  analyzeStripSlicePlan,
  buildInspectableStripModel,
  planSmartStripSliceBoundaries,
  stripSlicesToBoundaries,
} from "./studio-smart-slice-boundaries";

afterEach(() => {
  cleanup();
});

const webtoonCanvasPreset = EXPORT_PRESETS.find((preset) => preset.id === "webtoon-canvas")!;

describe("studio-smart-slice-boundaries", () => {
  it("분할선(1280px)이 말풍선·컷을 가로지를 때 감지하고 숨김 레이어 요소는 무시한다", () => {
    const model = buildInspectableStripModel({
      sourceCanvasWidth: 800,
      fallbackPageHeight: 3000,
      exportScale: 1,
      preset: webtoonCanvasPreset,
      pages: [
        {
          id: "p1",
          canvasH: 3000,
          elements: [
            { id: "cut-1", type: "frame", x: 40, y: 100, width: 720, height: 950 },
            // 1280px 경계선을 가로지르는 말풍선 (1220 ~ 1360)
            { id: "bub-1", type: "bubble", text: "잠깐만요 멈춰요!", x: 180, y: 1220, width: 320, height: 140 },
            // 2560px 경계선을 가로지르는 컷 프레임 (2400 ~ 2800)
            { id: "cut-2", type: "frame", x: 40, y: 2400, width: 720, height: 400 },
            // 숨겨진 말풍선은 충돌에서 제외되어야 한다
            { id: "bub-hidden", type: "bubble", text: "숨김", x: 100, y: 2520, width: 200, height: 90, hidden: true },
          ],
        },
      ],
    });

    const initialReport = analyzeStripSlicePlan({
      targetWidth: model.targetWidth,
      totalHeight: model.totalHeight,
      maxSliceHeight: model.maxSliceHeight,
      boundaries: [1280, 2560],
      obstacles: model.obstacles,
    });

    expect(initialReport.bubbleCutCount).toBe(1);
    expect(initialReport.frameCutCount).toBe(1);
    expect(initialReport.boundaryReports[0]?.status).toBe("bubble-cut");
    expect(initialReport.boundaryReports[1]?.status).toBe("frame-cut");
    expect(initialReport.heightSumMatches).toBe(true);
    expect(initialReport.orderMonotonic).toBe(true);

    const smartBoundaries = planSmartStripSliceBoundaries({
      totalHeight: model.totalHeight,
      maxSliceHeight: model.maxSliceHeight,
      obstacles: model.obstacles,
    });

    const smartReport = analyzeStripSlicePlan({
      targetWidth: model.targetWidth,
      totalHeight: model.totalHeight,
      maxSliceHeight: model.maxSliceHeight,
      boundaries: smartBoundaries,
      obstacles: model.obstacles,
    });

    expect(smartReport.bubbleCutCount).toBe(0);
    expect(smartReport.frameCutCount).toBe(0);
    expect(smartReport.oversizedSliceIndices).toEqual([]);
    expect(smartReport.heightSumMatches).toBe(true);
    expect(smartReport.orderMonotonic).toBe(true);
    expect(smartReport.slices.reduce((sum, slice) => sum + slice.height, 0)).toBe(3000);
  });

  it("개별 경계를 극단값으로 수동 조정해도 인접 경계를 역전시키지 않고 전체 높이와 순서를 유지한다", () => {
    const clampedHigh = adjustSingleSliceBoundary({
      totalHeight: 3000,
      boundaries: [1200, 2400],
      boundaryIndex: 0,
      nextY: 9999,
    });
    expect(clampedHigh[0]).toBeLessThan(clampedHigh[1]!);

    const clampedLow = adjustSingleSliceBoundary({
      totalHeight: 3000,
      boundaries: clampedHigh,
      boundaryIndex: 1,
      nextY: -500,
    });
    expect(clampedLow[0]).toBeLessThan(clampedLow[1]!);

    const report = analyzeStripSlicePlan({
      targetWidth: 800,
      totalHeight: 3000,
      maxSliceHeight: 1280,
      boundaries: clampedLow,
      obstacles: [],
    });
    expect(report.orderMonotonic).toBe(true);
    expect(report.heightSumMatches).toBe(true);
    expect(stripSlicesToBoundaries(report.slices)).toEqual(clampedLow);
  });

  it("exportPresetSlices에 customSlices를 전달하면 지정된 경계 높이·순서대로 분할 저장하고 높이 불일치는 거부한다", async () => {
    const fakePage = { width: 800, height: 3000 } as HTMLCanvasElement;
    const createdHeights: number[] = [];
    const downloadedNames: string[] = [];

    const createCanvas = (w: number, h: number) => {
      createdHeights.push(h);
      return {
        width: w,
        height: h,
        getContext: () => ({
          fillStyle: "",
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toBlob: (cb: (blob: Blob | null) => void, mime?: string) => {
          const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
          cb(new Blob([jpegHeader], { type: mime ?? "image/jpeg" }));
        },
      } as unknown as HTMLCanvasElement;
    };

    const customSlices = [
      { index: 0, y: 0, height: 1180 },
      { index: 1, y: 1180, height: 1190 },
      { index: 2, y: 2370, height: 630 },
    ];

    const result = await exportPresetSlices({
      pages: [fakePage],
      preset: webtoonCanvasPreset,
      format: "jpg",
      title: "세로웹툰",
      customSlices,
      delayMs: 0,
      createCanvas,
      download: (_blob, filename) => {
        downloadedNames.push(filename);
      },
    });

    expect(result).toEqual({
      files: 3,
      oversized: 0,
      format: "jpg",
      targetWidth: 800,
    });
    expect(createdHeights).toEqual([1180, 1190, 630]);
    expect(createdHeights.reduce((sum, h) => sum + h, 0)).toBe(3000);
    expect(downloadedNames).toEqual([
      "세로웹툰-webtoon-canvas-1of3.jpg",
      "세로웹툰-webtoon-canvas-2of3.jpg",
      "세로웹툰-webtoon-canvas-3of3.jpg",
    ]);

    await expect(
      exportPresetSlices({
        pages: [fakePage],
        preset: webtoonCanvasPreset,
        format: "jpg",
        title: "세로웹툰",
        customSlices: [
          { index: 0, y: 0, height: 1000 },
          { index: 1, y: 1000, height: 1000 },
        ],
        delayMs: 0,
        createCanvas,
        download: vi.fn(),
      }),
    ).rejects.toThrow("전체 출력 높이");

    // Konva 호환 캡처(799×3199 → 800×3203)처럼 소수 배율 반올림 차이(3px)가 있어도
    // 내부 경계선(1168, 2267)은 그대로 유지하고 전체 출력 높이(3203px)를 빈틈없이 채운다.
    const konvaHeights: number[] = [];
    const konvaPage = { width: 799, height: 3199 } as HTMLCanvasElement;
    await exportPresetSlices({
      pages: [konvaPage],
      preset: webtoonCanvasPreset,
      format: "jpg",
      title: "세로웹툰",
      customSlices: [
        { index: 0, y: 0, height: 1168 },
        { index: 1, y: 1168, height: 1099 },
        { index: 2, y: 2267, height: 933 },
      ],
      delayMs: 0,
      createCanvas: (w, h) => {
        konvaHeights.push(h);
        return createCanvas(w, h);
      },
      download: vi.fn(),
    });
    expect(konvaHeights).toEqual([1168, 1099, 936]);
    expect(konvaHeights.reduce((sum, h) => sum + h, 0)).toBe(3203);
  });

  it("StudioExportMenuPanel에서 말풍선 절단 경고를 확인하고 안전 여백 맞춤·수동 조정 후 분할 내보내기에 반영한다", () => {
    const onExportSlices = vi.fn<NonNullable<StudioExportMenuPanelProps["exportPresetSlicesFromDocument"]>>(async () => ({
      files: 3,
      oversized: 0,
      format: "jpg" as const,
      targetWidth: 800,
    }));

    render(
      <StudioExportMenuPanel
        canvasWidth={800}
        canvasHeight={3000}
        exportScale={1}
        exportFormat="jpg"
        exportTransparent={false}
        exportPresetId="webtoon-canvas"
        watermark={{
          enabled: false,
          text: "",
          position: "br",
          opacity: 0.5,
          size: 0.028,
        }}
        isExporting={false}
        exportTitle="1화"
        pageCount={1}
        activePageIndex={0}
        pageLabels={["1페이지"]}
        dialoguePages={[
          {
            id: "p1",
            canvasH: 3000,
            elements: [
              { id: "b1", type: "bubble", text: "위험해!", x: 120, y: 1230, width: 280, height: 120 },
            ],
          } as never,
        ]}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
        capturePagesForPreset={vi.fn(async () => [])}
        exportPresetSlicesFromDocument={onExportSlices}
      />,
    );

    expect(screen.getByTestId("studio-slice-collision-status").textContent).toContain(
      "말풍선·대사 절단 1건",
    );

    fireEvent.click(screen.getByTestId("studio-slice-auto-adjust"));
    expect(screen.getByTestId("studio-slice-collision-status").textContent).toContain(
      "말풍선·컷 절단 없음",
    );
    expect(screen.getByTestId("studio-slice-height-check").textContent).toContain(
      "3,000 / 3,000 px 일치",
    );

    fireEvent.click(screen.getByTestId("studio-slice-boundary-up-0"));
    expect(screen.getByTestId("studio-slice-height-check").textContent).toContain(
      "3,000 / 3,000 px 일치",
    );

    fireEvent.click(screen.getByRole("button", { name: /규격으로 저장/u }));
    expect(onExportSlices).toHaveBeenCalledTimes(1);
    const passedOptions = onExportSlices.mock.calls[0]?.[1];
    expect(passedOptions?.customSlices).toBeDefined();
    const total = passedOptions!.customSlices!.reduce((sum, s) => sum + s.height, 0);
    expect(total).toBe(3000);
  });
});
