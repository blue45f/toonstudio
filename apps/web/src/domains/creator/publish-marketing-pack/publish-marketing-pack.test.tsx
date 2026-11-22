// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext } from "@/domains/auth/public/session/auth-session-store";
import { StudioExportPanel } from "../studio-shell/StudioExportPanel";
import {
  buildSocialShareSnippets,
  createDefaultOgMarketingInput,
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  renderOgCardSvg,
  renderOgCardToCanvas,
} from "./og-card-renderer";
import {
  calculatePrintCoverSpec,
  renderPrintCoverTemplateSvg,
} from "./print-cover-template-engine";
import { StudioPublishMarketingPackPanel } from "./StudioPublishMarketingPackPanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("og-card-renderer — 1200×630 3컷 OG 공유 카드 SVG·Canvas 렌더러", () => {
  it("정확한 1200×630 SVG를 생성하고 XML 특수문자를 안전하게 이스케이프한다", () => {
    const base = createDefaultOgMarketingInput("유리시계 <공작가> & 비밀", 14);
    const artifact = renderOgCardSvg({ ...base, showSafeGuide: true });

    expect(artifact.widthPx).toBe(OG_CARD_WIDTH);
    expect(artifact.heightPx).toBe(OG_CARD_HEIGHT);
    expect(artifact.svgMarkup).toContain('width="1200" height="630"');
    expect(artifact.svgMarkup).toContain('viewBox="0 0 1200 630"');
    expect(artifact.svgMarkup).toContain("EP.14");
    expect(artifact.svgMarkup).toContain("유리시계 &lt;공작가&gt; &amp; 비밀");
    expect(artifact.svgMarkup).not.toContain("<공작가>");
    expect(artifact.svgDataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
  });

  it("X·인스타·블로그용 공유 스니펫과 Canvas 2D 1200×630 렌더링을 제공한다", () => {
    const input = createDefaultOgMarketingInput("밤의 우편배달부", 12);
    const snippets = buildSocialShareSnippets(input, "https://toonstudio.kr/work/night-post");

    expect(snippets.xPostText).toContain("[밤의 우편배달부] 12화 공개");
    expect(snippets.instagramCaption).toContain("#웹툰");
    expect(snippets.blogOgMetaHtml).toContain('og:image:width" content="1200"');
    expect(snippets.blogOgMetaHtml).toContain('og:image:height" content="630"');

    // jsdom canvas 2D mock으로 Canvas 렌더러 호출 검증
    const mockCtx = {
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
    };
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockImplementation(
      (() => mockCtx as unknown as CanvasRenderingContext2D) as unknown as typeof canvas.getContext,
    );

    expect(renderOgCardToCanvas(canvas, input)).toBe(true);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(630);
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });
});

describe("print-cover-template-engine — 단행본 책등 폭(spineMm) 및 3mm 재단선 가이드", () => {
  it("신국판 240쪽 스노우지 100g 무선제본 책등 폭과 펼침면 300DPI 규격을 정확히 계산한다", () => {
    const spec = calculatePrintCoverSpec({
      formatId: "shinguk",
      pageCount: 240,
      paperStockId: "art-100",
      binding: "perfect-soft",
      bleedMm: 3,
      bookTitle: "밤의 우편배달부",
      volumeLabel: "1권",
      authorName: "김작가",
    });

    // 240쪽 = 120장 × 0.092mm = 11.04mm + 무선제본 0.6mm = 11.64mm
    expect(spec.sheetCount).toBe(120);
    expect(spec.paperThicknessMm).toBe(11.04);
    expect(spec.spineMm).toBe(11.64);
    // 펼침면 가로 = 3 + 152 + 11.64 + 152 + 3 = 321.64mm, 세로 = 3 + 225 + 3 = 231mm
    expect(spec.totalWidthMm).toBe(321.64);
    expect(spec.totalHeightMm).toBe(231);
    expect(spec.canPrintSpineText).toBe(true);
    expect(spec.totalWidthPx300).toBe(Math.round((321.64 / 25.4) * 300));
    expect(spec.totalHeightPx300).toBe(Math.round((231 / 25.4) * 300));
  });

  it("쪽수가 얇아 책등 폭이 6mm 미만이면 책등 텍스트 생략 경고를 띄우고, 홀수 쪽수는 짝수로 보정한다", () => {
    const thinSpec = calculatePrintCoverSpec({
      formatId: "b6",
      pageCount: 61,
      paperStockId: "art-100",
      binding: "perfect-soft",
      bookTitle: "단편집",
      volumeLabel: "단권",
      authorName: "김작가",
    });

    expect(thinSpec.normalizedPageCount).toBe(62);
    expect(thinSpec.spineMm).toBeLessThan(6);
    expect(thinSpec.canPrintSpineText).toBe(false);
    expect(thinSpec.spineSafe).toBeNull();
    expect(thinSpec.warningsKo.some((w) => w.includes("홀수 쪽수"))).toBe(true);
    expect(thinSpec.warningsKo.some((w) => w.includes("텍스트 생략"))).toBe(true);
  });

  it("A5 양장제본 표지 가이드 SVG에 뒤표지·책등·앞표지·바코드 안전구역과 mm 치수가 포함된다", () => {
    const artifact = renderPrintCoverTemplateSvg({
      formatId: "a5",
      pageCount: 200,
      paperStockId: "mozo-100",
      binding: "hardcover",
      bleedMm: 3,
      bookTitle: "별빛 아틀리에",
      volumeLabel: "2권",
      authorName: "박작가",
    });

    // 100장 × 0.118 + 4.0 = 15.8mm
    expect(artifact.spec.spineMm).toBe(15.8);
    expect(artifact.svgMarkup).toContain(`width="${artifact.spec.totalWidthMm}mm"`);
    expect(artifact.svgMarkup).toContain("뒤표지 (BACK COVER)");
    expect(artifact.svgMarkup).toContain("앞표지 (FRONT COVER)");
    expect(artifact.svgMarkup).toContain("ISBN 바코드 안전구역");
    expect(artifact.svgMarkup).toContain("15.8mm");
  });
});

describe("StudioPublishMarketingPackPanel 및 StudioExportPanel 지연 연결", () => {
  it("StudioExportPanel의 마케팅·출판 패키지 영역을 펼치면 지연 마운트되고 OG·단행본 탭이 동작한다", async () => {
    render(
      <SessionContext.Provider
        value={{ data: null, ready: true, status: "unauthenticated", update: async () => null }}
      >
        <MemoryRouter>
          <StudioExportPanel projectId="proj-mkt-1" locale="ko" />
        </MemoryRouter>
      </SessionContext.Provider>,
    );

    const details = screen.getByTestId("studio-export-marketing-pack") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.queryByTestId("publish-marketing-pack-panel")).toBeNull();

    // <details> 열기
    details.open = true;
    fireEvent(details, new Event("toggle"));

    const panel = await screen.findByTestId("publish-marketing-pack-panel");
    expect(within(panel).getByTestId("og-card-preview-img")).toBeTruthy();

    // 단행본 재단선 표지 탭으로 전환 후 B6 + 320쪽 선택
    fireEvent.click(within(panel).getByTestId("marketing-pack-tab-print"));
    expect(within(panel).getByTestId("print-cover-preview-img")).toBeTruthy();
    expect(within(panel).getByTestId("print-cover-spine-badge").textContent).toContain("11.64 mm");

    fireEvent.click(within(panel).getByTestId("print-format-b6"));
    fireEvent.change(within(panel).getByTestId("print-page-count-input"), {
      target: { value: "320" },
    });
    // 320쪽 = 160장 × 0.092 + 0.6 = 15.32mm
    expect(within(panel).getByTestId("print-cover-spine-badge").textContent).toContain("15.32 mm");
  });

  it("단독 렌더에서 OG·단행본 탭과 다운로드 버튼이 44px 이상 터치 타겟을 충족한다", () => {
    render(<StudioPublishMarketingPackPanel projectId="proj-mkt-solo" seriesTitle="테스트 웹툰" />);
    expect(screen.getByTestId("marketing-pack-tab-og").className).toContain("min-h-11");
    expect(screen.getByTestId("marketing-pack-tab-print").className).toContain("min-h-11");
    expect(screen.getByTestId("og-download-svg-btn").className).toContain("min-h-11");
  });
});
