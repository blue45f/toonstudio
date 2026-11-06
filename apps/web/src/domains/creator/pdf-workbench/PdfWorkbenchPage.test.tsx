// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PdfWorkbenchPage } from "./PdfWorkbenchPage";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("PdfWorkbenchPage — REA 단행본 인쇄 도련 & CMYK 프리플라이트 워크벤치", () => {
  it("벤치마크 배지와 기본 재단 규격·잉크 프로파일 상태를 표시한다", () => {
    render(<PdfWorkbenchPage />);
    const bar = screen.getByTestId("pdf-workbench-rea-cmyk-bleed-bar");
    expect(bar.textContent).toContain("Clip Studio EX Multi-Page · Affinity Publisher · Adobe InDesign Print Preflight");

    expect(screen.getByTestId("pdf-rea-trim-b5-manga-bleed3mm").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pdf-rea-ink-cmyk-japan-color-300pct").getAttribute("aria-pressed")).toBe("true");

    const status = screen.getByTestId("pdf-workbench-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("b5-manga-bleed3mm");
    expect(status.textContent).toContain("cmyk-japan-color-300pct");
  });

  it("재단 규격과 잉크 프로파일을 전환하면 aria-pressed 와 실시간 상태가 갱신된다", () => {
    render(<PdfWorkbenchPage />);

    fireEvent.click(screen.getByTestId("pdf-rea-trim-a5-tankobon-spread"));
    expect(screen.getByTestId("pdf-rea-trim-a5-tankobon-spread").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pdf-rea-trim-b5-manga-bleed3mm").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("pdf-workbench-rea-status").textContent).toContain("a5-tankobon-spread");

    fireEvent.click(screen.getByTestId("pdf-rea-trim-webtoon-scroll-to-page"));
    expect(screen.getByTestId("pdf-rea-trim-webtoon-scroll-to-page").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pdf-workbench-rea-status").textContent).toContain("webtoon-scroll-to-page");

    fireEvent.click(screen.getByTestId("pdf-rea-ink-monochrome-600dpi-screentone"));
    expect(screen.getByTestId("pdf-rea-ink-monochrome-600dpi-screentone").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pdf-rea-ink-cmyk-japan-color-300pct").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("pdf-workbench-rea-status").textContent).toContain("monochrome-600dpi-screentone");

    fireEvent.click(screen.getByTestId("pdf-rea-ink-pdfx4-font-outline"));
    expect(screen.getByTestId("pdf-rea-ink-pdfx4-font-outline").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pdf-workbench-rea-status").textContent).toContain("pdfx4-font-outline");
  });

  it("en 로케일에서는 한글이 전혀 포함되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(<PdfWorkbenchPage />);
    const bar = screen.getByTestId("pdf-workbench-rea-cmyk-bleed-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("pdf-workbench-rea-status").textContent).toContain("Trim:");
  });
});
