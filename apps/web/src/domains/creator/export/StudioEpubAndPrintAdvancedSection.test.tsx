// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioEpubAndPrintAdvancedSection } from "./StudioEpubAndPrintAdvancedSection";
import { DEFAULT_STUDIO_EPUB_AND_PRINT_ADVANCED_STATE } from "./studio-export-print-spec";

import type { StudioEpubAndPrintAdvancedState } from "./StudioEpubAndPrintAdvancedSection";

afterEach(cleanup);

describe("StudioEpubAndPrintAdvancedSection", () => {
  it("EPUB 3.0 좌철·우철 전환과 패키지 내보내기 콜백을 44px 터치 타깃으로 전달한다", () => {
    const onChange = vi.fn();
    const onExportEpub = vi.fn();

    const { container } = render(
      <StudioEpubAndPrintAdvancedSection
        value={DEFAULT_STUDIO_EPUB_AND_PRINT_ADVANCED_STATE}
        pageCount={24}
        onChange={onChange}
        onExportEpub={onExportEpub}
      />,
    );

    // transition-all 금지 및 초기 모든 details 접힘(Calm 5-9 컨트롤 예산) 검증
    expect(container.innerHTML).not.toContain("transition-all");
    const detailsList = Array.from(container.querySelectorAll("details"));
    expect(detailsList.every((d) => !d.hasAttribute("open"))).toBe(true);
    detailsList[0]!.open = true;

    expect(screen.getByText("양면 펼침 표시")).toBeTruthy();

    const rtlBtn = screen.getByRole("button", { name: "우철 (오른쪽 넘김)" });
    expect(rtlBtn.className).toContain("min-h-11");
    fireEvent.click(rtlBtn);
    expect(onChange).toHaveBeenLastCalledWith({ epubProgressionDirection: "rtl" });

    const exportBtn = screen.getByRole("button", {
      name: "EPUB 3.0 전자책 패키지 생성 (24쪽)",
    });
    expect(exportBtn.className).toContain("min-h-11");
    fireEvent.click(exportBtn);
    expect(onExportEpub).toHaveBeenCalledTimes(1);
  });

  it("1비트 모노크롬·회색조 농담 인쇄 설정과 중철 밀림 보정 계산 요약을 정확히 렌더링한다", () => {
    const onChange = vi.fn();
    const activeState: StudioEpubAndPrintAdvancedState = {
      ...DEFAULT_STUDIO_EPUB_AND_PRINT_ADVANCED_STATE,
      monochromeEnabled: true,
      monochromeMode: "monochrome-1bit",
      halftoneLpi: 65,
      halftoneDpi: 1200,
      saddleCreepEnabled: true,
      maxCreepMm: 2.0,
    };

    const { container } = render(
      <StudioEpubAndPrintAdvancedSection
        value={activeState}
        pageCount={16}
        onChange={onChange}
      />,
    );

    for (const d of Array.from(container.querySelectorAll("details"))) {
      d.open = true;
    }

    expect(screen.getByRole("button", { name: "회색조 농담 인쇄" })).toBeTruthy();

    fireEvent.change(screen.getByRole("slider", { name: "망점 선수 (LPI)" }), {
      target: { value: "70" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ halftoneLpi: 70 });

    fireEvent.change(screen.getByLabelText("망점 모양"), {
      target: { value: "cross" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ halftoneSpotShape: "cross" });

    // 16쪽 = 4장 접지 -> 가운데장(시트 3) 밀림 보정 2.00mm 표시 확인
    expect(screen.getByRole("status").textContent).toContain("총 4장 접지 기준");
    expect(screen.getByRole("status").textContent).toContain("2.00mm");
  });
});
