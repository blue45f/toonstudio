// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStudioExportGeometryDraft } from "./studio-export-geometry-draft";
import { resetStudioPdfPrintSpecDraft } from "./studio-export-print-spec";
import { StudioEnhancedExportMenuPanel } from "./StudioEnhancedExportMenuPanel";
import { StudioExportMenuPanel, type StudioExportMenuPanelProps } from "./StudioExportMenuPanel";
import { openStudioExportSection } from "./StudioExportMenuPanel.test-helpers";

function panelProps(overrides: Partial<StudioExportMenuPanelProps> = {}): StudioExportMenuPanelProps {
  return {
    canvasWidth: 800, canvasHeight: 1200, exportScale: 1, exportFormat: "png",
    exportTransparent: false, exportPresetId: null, isExporting: false,
    watermark: { enabled: false, text: "", opacity: 0.2, position: "br", size: 0.028 },
    exportTitle: "첫 원고", pageCount: 4, pageLabels: ["1", "2", "3", "4"],
    setExportScale: vi.fn(), setExportFormat: vi.fn(), setExportTransparent: vi.fn(),
    setExportPresetId: vi.fn(), setWatermark: vi.fn(), onCopyToClipboard: vi.fn(),
    onDownloadCurrentPage: vi.fn(), capturePagesForPreset: vi.fn(async () => []),
    ...overrides,
  };
}

function section(id: string): HTMLDetailsElement {
  const element = document.querySelector(`[data-studio-export-section="${id}"]`);
  if (!(element instanceof HTMLDetailsElement)) throw new Error(`설정 섹션 누락: ${id}`);
  return element;
}

beforeEach(() => { resetStudioExportGeometryDraft(); resetStudioPdfPrintSpecDraft(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("처음 사용하는 사람의 이미지 다운로드", () => {
  it("형식·크기·현재 페이지 다운로드를 먼저 보여주고 전문 설정은 접어 둔다", () => {
    const props = panelProps();
    render(<StudioExportMenuPanel {...props} />);

    expect(screen.getByRole("button", { name: "PNG" }).getAttribute("aria-pressed")).toBe("true");
    const download = screen.getByRole("button", { name: "현재 페이지 PNG 다운로드" });
    expect(download.closest("details")).toBeNull();
    for (const id of ["appearance", "range", "print", "exchange", "publish"]) {
      expect(section(id).open).toBe(false);
    }
    expect(download.compareDocumentPosition(section("print")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(props.capturePagesForPreset).not.toHaveBeenCalled();
    expect(props.onDownloadCurrentPage).not.toHaveBeenCalled();
  });

  it("선택한 파일 형식을 표시하고 툴바의 현재 페이지 저장 함수를 한 번 실행한다", () => {
    const props = panelProps();
    const result = render(<StudioExportMenuPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "WebP" }));
    expect(props.setExportFormat).toHaveBeenCalledExactlyOnceWith("webp");
    result.rerender(<StudioExportMenuPanel {...props} exportFormat="webp" />);
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지 WebP 다운로드" }));
    expect(props.onDownloadCurrentPage).toHaveBeenCalledOnce();
    expect(props.capturePagesForPreset).not.toHaveBeenCalled();
  });

  it("다른 내보내기가 진행 중이면 현재 페이지 중복 저장을 막는다", () => {
    const props = panelProps({ isExporting: true });
    render(<StudioExportMenuPanel {...props} />);
    const download = screen.getByRole("button", { name: "파일 준비 중…" });
    expect(download.hasAttribute("disabled")).toBe(true);
    fireEvent.click(download);
    expect(props.onDownloadCurrentPage).not.toHaveBeenCalled();
  });

  it("전체 페이지 ZIP도 기본 화면에서 찾을 수 있고 검증 상세만 접혀 있다", () => {
    render(<StudioEnhancedExportMenuPanel {...panelProps()} />);
    expect(screen.getByRole("heading", { name: "전체 4페이지 PNG · ZIP" })).toBeTruthy();
    const zip = screen.getByRole("button", { name: "페이지 ZIP 다운로드" });
    expect(zip.closest("details")).toBeNull();
    expect(section("zip-options").open).toBe(false);
    expect(zip.compareDocumentPosition(section("publish")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("접기 구역을 열어 기존 교환 형식과 인쇄 설정을 계속 사용할 수 있다", () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    openStudioExportSection("다른 편집기용 파일");
    expect(section("exchange").open).toBe(true);
    expect(screen.getByRole("button", { name: "ORA" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "CBZ · 4P" })).toBeTruthy();
    openStudioExportSection("인쇄·PDF");
    expect(screen.getByRole("button", { name: "PDF (전체 4페이지)" })).toBeTruthy();
  });

  it("인쇄 설정을 접었다 다시 열어도 수정한 해상도를 보존한다", () => {
    render(<StudioExportMenuPanel {...panelProps()} />);
    openStudioExportSection("인쇄·PDF");
    const dpi = screen.getByLabelText("내보내기 해상도 DPI") as HTMLInputElement;
    fireEvent.change(dpi, { target: { value: "150" } });
    const summary = section("print").querySelector("summary");
    if (!summary) throw new Error("인쇄 설정 제목 누락");
    fireEvent.click(summary);
    expect(section("print").open).toBe(false);
    openStudioExportSection("인쇄·PDF");
    expect((screen.getByLabelText("내보내기 해상도 DPI") as HTMLInputElement).value).toBe("150");
  });

  it("범위 오류가 있으면 숨기지 않고 수정할 페이지 범위를 펼친다", () => {
    render(<StudioExportMenuPanel {...panelProps({ pageCount: 0, pageLabels: [] })} />);
    expect(section("range").open).toBe(true);
    expect(screen.getByRole("spinbutton", { name: "내보내기 시작 페이지" })).toBeTruthy();
  });
});
