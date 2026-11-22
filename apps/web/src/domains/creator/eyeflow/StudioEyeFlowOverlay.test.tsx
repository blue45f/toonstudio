// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReaderPreviewPanel, type ReaderPreviewPage } from "../reader-preview/ReaderPreviewPanel";

import { StudioEyeFlowOverlay } from "./StudioEyeFlowOverlay";
import { StudioEyeFlowSummaryRail } from "./StudioEyeFlowSummaryRail";
import { analyzeEyeFlowAndTailGuard } from "./studio-eyeflow-geometry";
import { analyzeReaderPagesEyeFlow } from "./studio-eyeflow-page-adapter";

vi.mock("../StudioPageThumbnails", () => ({
  StudioPageThumbnail: ({ page }: { page: ReaderPreviewPage }) => (
    <div data-page-thumbnail={page.id} />
  ),
}));

vi.mock("@/shared/lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/i18n")>();
  return {
    ...actual,
    useT: () => (key: string) => key,
  };
});

afterEach(() => cleanup());

describe("StudioEyeFlowOverlay", () => {
  const sampleAnalysis = analyzeEyeFlowAndTailGuard({
    canvasWidth: 720,
    canvasHeight: 1_280,
    balloons: [
      {
        id: "b1",
        readingOrder: 1,
        bounds: { x: 460, y: 420, width: 180, height: 80 },
        tailTip: { x: 340, y: 330 },
      },
      {
        id: "b2",
        readingOrder: 2,
        bounds: { x: 60, y: 140, width: 180, height: 80 },
      },
    ],
    faces: [
      {
        id: "hero",
        label: "주인공",
        faceBounds: { x: 260, y: 260, width: 160, height: 180 },
      },
    ],
  });

  it("visible=false일 때는 캔버스 위에 아무 노드도 렌더링하지 않는다", () => {
    const { container } = render(
      <StudioEyeFlowOverlay analysis={sampleAnalysis} visible={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("visible=true일 때 얇은 pointer-events-none SVG에 번호 배지·역주행·눈 가림·권장 좌표를 렌더링한다", () => {
    render(<StudioEyeFlowOverlay analysis={sampleAnalysis} visible />);

    const svg = document.querySelector('[data-studio-eyeflow-overlay="true"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class")).toContain("pointer-events-none");
    expect(svg?.getAttribute("data-eyeflow-reversals")).toBe("1");
    expect(svg?.getAttribute("data-eyeflow-occlusions")).toBe("1");
    expect(screen.getByText("역주행")).toBeTruthy();
    expect(screen.getByText("눈 가림")).toBeTruthy();
    expect(document.querySelector('[data-eyeflow-recommended-tip="true"]')).not.toBeNull();
    expect(document.querySelectorAll("[data-eyeflow-node-id]")).toHaveLength(2);
  });
});

describe("StudioEyeFlowSummaryRail", () => {
  it("역주행·얼굴 가림 요약과 권장 꼬리 좌표를 표시하고 토글/점프 콜백을 호출한다", () => {
    const onToggleOverlay = vi.fn();
    const onChangeDirection = vi.fn();
    const onJumpToPage = vi.fn();

    const summary = analyzeReaderPagesEyeFlow([
      {
        id: "p1",
        canvasH: 1_280,
        elements: [
          { id: "hero", type: "face", label: "주인공", x: 260, y: 260, width: 160, height: 180 },
          {
            id: "b1",
            type: "bubble",
            x: 60,
            y: 80,
            width: 180,
            height: 80,
            tailAnchorPoint: { x: 340, y: 330 },
          },
        ],
      },
    ]);

    render(
      <StudioEyeFlowSummaryRail
        summary={summary}
        pageLabels={new Map([["p1", "1페이지"]])}
        overlayVisible={false}
        onToggleOverlay={onToggleOverlay}
        direction="ltr-ttb"
        onChangeDirection={onChangeDirection}
        onJumpToPage={onJumpToPage}
      />,
    );

    expect(screen.getByText("시선 동선 · 꼬리 가드")).toBeTruthy();
    expect(screen.getByText(/^권장 꼬리 끝 \(\d+, \d+\)$/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "동선 안내선 켜기" }));
    expect(onToggleOverlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "우→좌 만화" }));
    expect(onChangeDirection).toHaveBeenCalledWith("rtl-ttb");

    fireEvent.click(screen.getByRole("button", { name: /눈을 가로지릅니다/ }));
    expect(onJumpToPage).toHaveBeenCalledWith("p1");
  });

  it("1클릭 3종 리듬 변환(긴장 고조 / 코미디 템포 / 감정 여운) 버튼 클릭 시 콜백을 호출하고 390×844 가드를 표시한다", () => {
    const onApplyRhythmPreset = vi.fn();
    const summary = analyzeReaderPagesEyeFlow([
      {
        id: "p-rhythm",
        canvasW: 720,
        canvasH: 1_400,
        elements: [
          { id: "cut-1", type: "frame", x: 20, y: 20, width: 680, height: 460 },
          { id: "b1", type: "bubble", x: 60, y: 300, width: 180, height: 80, text: "대사 하나" },
          { id: "cut-2", type: "frame", x: 20, y: 540, width: 680, height: 460, isClimaxBeat: true },
          { id: "b2", type: "bubble", x: 420, y: 600, width: 180, height: 80, text: "대사 둘" },
        ],
      },
    ]);

    render(
      <StudioEyeFlowSummaryRail
        summary={summary}
        pageLabels={new Map([["p-rhythm", "1페이지"]])}
        overlayVisible={false}
        onToggleOverlay={() => undefined}
        direction="ltr-ttb"
        onChangeDirection={() => undefined}
        onApplyRhythmPreset={onApplyRhythmPreset}
      />,
    );

    expect(screen.getByText(/390×844 가드/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "코미디 템포" }));
    expect(onApplyRhythmPreset).toHaveBeenCalledWith("comedy-tempo");
    fireEvent.click(screen.getByRole("button", { name: "감정 여운" }));
    expect(onApplyRhythmPreset).toHaveBeenCalledWith("emotional-lingering");
    fireEvent.click(screen.getByRole("button", { name: "긴장 고조" }));
    expect(onApplyRhythmPreset).toHaveBeenCalledWith("tension-escalation");
  });
});

describe("ReaderPreviewPanel 시선 동선 오버레이 통합", () => {
  it("기본 상태에서는 오버레이를 숨긴 채 레일에서 경고를 알리고, 토글 버튼으로 SVG 오버레이를 켜고 끌 수 있다", () => {
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const pages: ReaderPreviewPage[] = [
      {
        id: "p1",
        name: "1화 1페이지",
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1_280,
        elements: [
          { id: "c1", type: "frame", y: 0, height: 1_200 },
          { id: "b1", type: "bubble", x: 460, y: 120, width: 180, height: 80, text: "먼저" },
          { id: "b2", type: "bubble", x: 60, y: 130, width: 180, height: 80, text: "다음" },
        ],
      },
    ];

    render(
      <ReaderPreviewPanel
        open
        onClose={() => undefined}
        pages={pages}
        currentPageId="p1"
      />,
    );

    // 기본은 꺼짐(캔버스 비침습 유지) + 레일에 같은 행 역행 경고 표시
    expect(document.querySelector('[data-studio-eyeflow-overlay="true"]')).toBeNull();
    expect(document.querySelector('[data-studio-eyeflow-rail="true"]')).not.toBeNull();
    expect(screen.getByText(/같은 행 시선 역행/)).toBeTruthy();

    // 상단 툴바 '시선 동선' 토글 버튼 클릭 시 SVG 오버레이 마운트
    const toolbarToggle = screen.getByRole("button", { name: /시선 동선/ });
    expect(toolbarToggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toolbarToggle);
    expect(toolbarToggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-studio-eyeflow-overlay="true"]')).not.toBeNull();

    // 우→좌 만화 방향으로 전환 시 같은 행 우→좌 배치가 정상으로 재계산됨
    fireEvent.click(screen.getByRole("button", { name: "우→좌 만화" }));
    expect(screen.queryByText(/같은 행 시선 역행/)).toBeNull();
    expect(screen.getByText(/시선 동선과 꼬리 배치가 안전합니다/)).toBeTruthy();
  });
});
