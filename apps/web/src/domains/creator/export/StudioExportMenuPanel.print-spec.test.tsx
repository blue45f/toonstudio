// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStudioExportGeometryDraft } from "./studio-export-geometry-draft";
import {
  readStudioPdfPrintSpecDraft,
  resetStudioPdfPrintSpecDraft,
} from "./studio-export-print-spec";
import { StudioExportMenuPanel, type StudioExportMenuPanelProps } from "./StudioExportMenuPanel";

const encoders = vi.hoisted(() => ({
  cbz: vi.fn(async () => ({ blob: new Blob(["cbz"]), warnings: [] })),
  pdf: vi.fn(async () => ({ pageCount: 3, bytes: 100, fileName: "test.pdf" })),
  contact: vi.fn(async () => ({ pageCount: 3, sheetCount: 1, columns: 3, rows: 3, bytes: 100, fileName: "test.pdf" })),
  preset: vi.fn(async () => ({ files: 3, oversized: 0, targetWidth: 800, format: "png" })),
  verified: vi.fn(async () => ({ blob: new Blob(["zip"]), fileName: "test.zip", manifest: { pageCount: 3 } })),
}));

vi.mock("../studio-cbz-interchange", () => ({ buildStudioCbzBlob: encoders.cbz }));
vi.mock("./studio-download-package", () => ({ buildStudioDownloadPackage: encoders.verified }));
vi.mock("./studio-pdf-export", async (original) => ({
  ...await original<typeof import("./studio-pdf-export")>(),
  exportPagesToPdf: encoders.pdf,
}));
vi.mock("../studio-pdf-contact-sheet", async (original) => ({
  ...await original<typeof import("../studio-pdf-contact-sheet")>(),
  exportContactSheetPdf: encoders.contact,
}));
vi.mock("./studio-export-presets", async (original) => ({
  ...await original<typeof import("./studio-export-presets")>(),
  exportPresetSlices: encoders.preset,
}));

function canvas(page: number): HTMLCanvasElement {
  return {
    width: 800,
    height: 1200,
    toBlob: (callback: BlobCallback) => callback(new Blob([
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, page]),
    ], { type: "image/png" })),
  } as HTMLCanvasElement;
}

function panelProps(overrides: Partial<StudioExportMenuPanelProps> = {}): StudioExportMenuPanelProps {
  return {
    canvasWidth: 800, canvasHeight: 1200, exportScale: 1, exportFormat: "png",
    exportTransparent: false, exportPresetId: "webtoon-canvas", isExporting: false,
    watermark: { enabled: false, text: "", opacity: 0.2, position: "br", size: 0.028 },
    exportTitle: "선택 원고", pageCount: 5, pageLabels: ["표지", "장면 A", "장면 B", "장면 C", "후기"],
    setExportScale: vi.fn(), setExportFormat: vi.fn(), setExportTransparent: vi.fn(),
    setExportPresetId: vi.fn(), setWatermark: vi.fn(), onCopyToClipboard: vi.fn(),
    capturePagesForPreset: vi.fn(async () => Array.from({ length: 5 }, (_, i) => canvas(i))),
    capturePagesForIndices: vi.fn(async (indices) => indices.map(canvas)),
    ...overrides,
  };
}

function clickPdf() {
  fireEvent.click(screen.getByRole("button", { name: /^PDF \(/u }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStudioExportGeometryDraft();
  resetStudioPdfPrintSpecDraft();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:selection") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PDF 인쇄 스펙 연결", () => {
  it("기본 상태에서는 인쇄 스펙 세부 조절이 숨겨져 있고 도움말도 없다", () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    const toggle = screen.getByTestId("export-print-spec-enabled") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByTestId("export-print-spec-bleed")).toBeNull();
    expect(screen.queryByText(/ICC 프로파일 기반 색관리가 아닙니다/u)).toBeNull();
  });

  it("스펙을 끈 채 PDF를 내보내면 print 옵션이 아예 실리지 않는다 — 기본 경로 불변", async () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    clickPdf();
    await waitFor(() => expect(encoders.pdf).toHaveBeenCalledOnce());
    const arg = (encoders.pdf.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("print");
    expect(screen.queryByText(/인쇄 스펙 적용/u)).toBeNull();
  });

  it("켠 채 기본값 그대로면 기본값 옵션 객체가 빌더로 간다", async () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    fireEvent.click(screen.getByTestId("export-print-spec-enabled"));
    clickPdf();
    await waitFor(() => expect(encoders.pdf).toHaveBeenCalledOnce());
    expect(encoders.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        print: { bleedMm: 0, cropMarks: false, colorMode: "rgb", imposition: "none" },
      })
    );
    await waitFor(() => expect(screen.getByText(/인쇄 스펙 적용: 기본 구성/u)).toBeTruthy());
  });

  it("도련·재단 마크·CMYK·중철을 고르면 네 항목이 그대로 빌더 옵션과 상태 문구로 간다", async () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    fireEvent.click(screen.getByTestId("export-print-spec-enabled"));
    fireEvent.change(screen.getByTestId("export-print-spec-bleed"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("export-print-spec-crop-marks"));
    fireEvent.click(screen.getByTestId("export-print-spec-color-cmyk"));
    fireEvent.click(screen.getByTestId("export-print-spec-imposition-booklet"));
    expect(
      (screen.getByTestId("export-print-spec-color-cmyk") as HTMLButtonElement).getAttribute("aria-pressed")
    ).toBe("true");
    clickPdf();
    await waitFor(() => expect(encoders.pdf).toHaveBeenCalledOnce());
    expect(encoders.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        print: { bleedMm: 3, cropMarks: true, colorMode: "cmyk", imposition: "booklet" },
      })
    );
    await waitFor(() =>
      expect(screen.getByText(/인쇄 스펙 적용: 도련 3mm · 재단 마크 · CMYK · 중철 스프레드/u)).toBeTruthy()
    );
  });

  it("켰을 때만 정직한 한계 도움말이 보인다", () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    fireEvent.click(screen.getByTestId("export-print-spec-enabled"));
    expect(screen.getByText(/ICC 프로파일 기반 색관리가 아닙니다/u)).toBeTruthy();
    expect(screen.getByText(/재단보다 큰 원본이 없으면 진짜 도련이/u)).toBeTruthy();
    expect(screen.getByText(/모든 페이지 크기가 같아야 하며/u)).toBeTruthy();
  });

  it("고른 스펙은 초안에 남아 메뉴를 닫았다 열어도(리마운트) 유지된다", () => {
    const first = render(<StudioExportMenuPanel {...panelProps()} />);
    fireEvent.click(screen.getByTestId("export-print-spec-enabled"));
    fireEvent.change(screen.getByTestId("export-print-spec-bleed"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("export-print-spec-color-cmyk"));
    expect(readStudioPdfPrintSpecDraft()).toEqual({
      enabled: true,
      bleedMm: 3,
      cropMarks: false,
      colorMode: "cmyk",
      imposition: "none",
    });
    first.unmount();
    render(<StudioExportMenuPanel {...panelProps()} />);
    expect((screen.getByTestId("export-print-spec-enabled") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("export-print-spec-bleed") as HTMLInputElement).value).toBe("3");
    expect(
      (screen.getByTestId("export-print-spec-color-cmyk") as HTMLButtonElement).getAttribute("aria-pressed")
    ).toBe("true");
  });
});
