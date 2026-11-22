import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioScrollPreviewPanel,
  type ScrollPreviewPage,
} from "./StudioScrollPreviewPanel";

const { createPortalMock } = vi.hoisted(() => ({
  createPortalMock: vi.fn((children: unknown) => children),
}));

vi.mock("react-dom", () => ({
  createPortal: createPortalMock,
}));

vi.mock("./StudioPageThumbnails", () => ({
  StudioPageThumbnail: ({ page }: { page: ScrollPreviewPage }) => (
    <div data-page-thumbnail={page.id} />
  ),
}));

function makePage(
  id: string,
  elements: ScrollPreviewPage["elements"],
  canvasH = 1_280
): ScrollPreviewPage {
  return {
    id,
    name: id,
    elements,
    bg: "#ffffff",
    bgGrad: null,
    canvasH,
  };
}

function renderPanel(pages: ScrollPreviewPage[]): string {
  vi.stubGlobal("document", { body: { nodeName: "BODY" } });
  return renderToStaticMarkup(
    <StudioScrollPreviewPanel
      open
      onClose={() => undefined}
      pages={pages}
      currentPageId={pages[0]?.id ?? ""}
    />
  );
}

describe("StudioScrollPreviewPanel rhythm analysis", () => {
  afterEach(() => {
    createPortalMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("shows a local rhythm score, screen count, density, and ending analysis by default", () => {
    const html = renderPanel([
      makePage("1화", [
        { id: "f1", type: "frame", y: 80, height: 560 },
        { id: "b1", type: "bubble", y: 160, height: 140, text: "다음 화에서 계속" },
      ]),
    ]);

    expect(html).toContain('aria-label="스크롤 리듬 분석"');
    expect(html).toContain("연출 리듬 진단");
    expect(html).toContain("1화면");
    expect(html).toContain("마지막 비트");
    expect(html).toContain("밀도");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="독자 스크롤 속도 시뮬레이션"');
    expect(html).toContain('aria-label="자동 스크롤 속도"');
    expect(html).toContain('aria-label="자동 스크롤 재생"');
    expect(html).toContain(">천천히<");
    expect(html).toContain(">빠르게<");
  });

  it("surfaces actionable high-density findings instead of a generic warning", () => {
    const html = renderPanel([
      makePage(
        "과밀 페이지",
        Array.from({ length: 15 }, (_, index) => ({
          id: `frame-${index}`,
          type: "frame",
          y: index * 75,
          height: 70,
        }))
      ),
    ]);

    expect(html).toContain("정보 밀도가 높음");
    expect(html).toContain("컷을 분리하거나 컷 사이 여백을 늘려");
    expect(html).toContain("과밀 페이지");
  });

  it("renders localized OVERSIZED_PANEL insight when a single panel exceeds 1.4 screens", () => {
    const html = renderPanel([
      makePage("긴 컷 페이지", [{ id: "tall-frame", type: "frame", y: 40, height: 2_000 }], 2_400),
    ]);

    expect(html).toContain('data-insight-code="OVERSIZED_PANEL"');
    expect(html).toContain("세로로 과도하게 긴 컷");
    expect(html).toContain("한눈에 들어오도록 컷을 나누거나");
  });

  it("keeps page selection optional and exposes per-page rhythm badges as read-only overlays", () => {
    const html = renderPanel([
      makePage("p1", [{ id: "f1", type: "frame", y: 100, height: 400 }]),
      makePage("p2", [{ id: "f2", type: "frame", y: 200, height: 500 }]),
    ]);

    expect(html).toContain('data-page-thumbnail="p1"');
    expect(html).toContain('data-page-thumbnail="p2"');
    expect(html).toContain("p1 리듬");
    expect(html).toContain("p2 리듬");
    expect(html).not.toContain("편집하기");
  });

  it("names insight pages the way a reader reads them and keeps the raw id on the diagnostic hook", () => {
    const pageId = "864fd343-f4e9-47f5-abda-84e1941780a5";
    const unnamed = (id: string): ScrollPreviewPage => ({
      id,
      elements: [],
      bg: "#ffffff",
      bgGrad: null,
      canvasH: 1_280,
    });
    const html = renderPanel([unnamed("e0e2b0ce-0000-4000-8000-000000000000"), unnamed(pageId)]);

    // 화면 문구에는 내부 UUID 가 없다.
    expect(html).toContain("빈 페이지");
    expect(html).toContain("· 2페이지");
    expect(html).not.toContain(`· ${pageId}`);
    // 진단 가치는 남는다 — DOM 훅으로 어느 페이지인지 여전히 특정할 수 있다.
    expect(html).toContain(`data-page-id="${pageId}"`);
    expect(html).toContain('data-insight-code="');
  });

  it("renders nothing and avoids a portal while closed", () => {
    vi.stubGlobal("document", { body: { nodeName: "BODY" } });
    const html = renderToStaticMarkup(
      <StudioScrollPreviewPanel
        open={false}
        onClose={() => undefined}
        pages={[]}
        currentPageId=""
      />
    );

    expect(html).toBe("");
    expect(createPortalMock).not.toHaveBeenCalled();
  });

  it("renders the mobile 390x844 cut rhythm summary and actionable Korean spacing feedback", () => {
    const html = renderPanel([
      makePage(
        "밀집 화",
        [
          { id: "f1", type: "frame", y: 40, height: 500 },
          {
            id: "b1",
            type: "bubble",
            y: 120,
            height: 120,
            text: "지금 바로 떠나지 않으면 문이 닫혀 버립니다 어서 서두르세요",
          },
          { id: "f2", type: "frame", y: 580, height: 500 },
          {
            id: "b2",
            type: "bubble",
            y: 660,
            height: 120,
            text: "알았어 지금 바로 따라갈 테니까 먼저 계단 아래로 내려가 있어",
          },
        ],
        1_280,
      ),
    ]);

    expect(html).toContain('data-testid="mobile-scroll-cut-rhythm-section"');
    expect(html).toContain("모바일 390×844 컷 리듬");
    expect(html).toContain('data-mobile-feedback-category="suffocating"');
    expect(html).toContain("여백을");
    expect(html).toContain("대사 호흡이 살아납니다");
  });
});
