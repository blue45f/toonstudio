// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  DrawingClarityContext,
  type DrawingClarityState,
} from "./StudioDrawingClarityContext";
import {
  StudioDrawingQuickErgonomicsBar,
  type StudioDrawingErgonomicsSession,
  type StudioDrawingErgonomicsSymmetryType,
} from "./StudioDrawingQuickErgonomicsBar";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useI18n.setState({ lang: "ko" });
});

function createClarityMock(
  overrides: Partial<DrawingClarityState> = {},
): DrawingClarityState {
  return {
    active: true,
    available: true,
    panel: null,
    open: vi.fn(),
    reveal: vi.fn(),
    close: vi.fn(),
    chooseSimple: vi.fn(),
    showSavedLayout: vi.fn(),
    ...overrides,
  };
}

function createErgonomicsSession(
  overrides: Partial<StudioDrawingErgonomicsSession> = {},
): StudioDrawingErgonomicsSession {
  return {
    activeSurfaceReviewLocked: false,
    pageEditLocked: false,
    canvasInteractionBlocked: false,
    scopedCanvasDrawingAvailable: false,
    tool: "draw",
    drawMode: "pen",
    activatePrimaryCanvasTool: vi.fn(),
    strokeWidth: 8,
    setStrokeWidth: vi.fn(),
    stabilizer: 0,
    setStabilizer: vi.fn(),
    showWebtoonGuides: false,
    setShowWebtoonGuides: vi.fn(),
    effScale: 1.5,
    setZoom: vi.fn(),
    zoomLocked: false,
    viewTransformSuppressed: false,
    bg3dOpen: false,
    setBg3dOpen: vi.fn(),
    exportMenuOpen: false,
    setExportMenuOpen: vi.fn(),
    canvasFlipH: false,
    symmetryType: "none",
    changeStudioSymmetryType: vi.fn(),
    proDrawPrefs: { sizeLocked: false },
    studioOptionsBarsHandlers: {
      toggleSizeLock: vi.fn(),
      flipCanvasHorizontal: vi.fn(),
      openBrushStudio: vi.fn(),
    },
    studioToolBeltContentHandlers: {
      setActualPixelView: vi.fn(),
    },
    ...overrides,
  };
}

describe("StudioDrawingQuickErgonomicsBar", () => {
  it("웹툰 제작 5단계 바로가기(① 콘티·컷 ~ ⑤ 마감·출고)가 각각의 세션·패널 핸들러를 호출한다", () => {
    const clarity = createClarityMock({ panel: "pages" });
    const session = createErgonomicsSession();

    render(
      <DrawingClarityContext.Provider value={clarity}>
        <StudioDrawingQuickErgonomicsBar session={session} />
      </DrawingClarityContext.Provider>,
    );

    const storyboardBtn = screen.getByRole("button", { name: "① 콘티·컷" });
    expect(storyboardBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(storyboardBtn);
    expect(clarity.open).toHaveBeenCalledWith("pages", storyboardBtn);

    const stage3dBtn = screen.getByRole("button", { name: "④ 3D 배경" });
    fireEvent.click(stage3dBtn);
    expect(session.setBg3dOpen).toHaveBeenCalledTimes(1);

    const inkBtn = screen.getByRole("button", { name: "② 선화·펜터치" });
    expect(inkBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(inkBtn);
    expect(session.activatePrimaryCanvasTool).toHaveBeenCalledWith("draw", "pen");

    const brushesBtn = screen.getByRole("button", { name: "③ 채색·톤" });
    fireEvent.click(brushesBtn);
    expect(clarity.open).toHaveBeenCalledWith("brush", brushesBtn);

    const publishBtn = screen.getByRole("button", { name: "⑤ 마감·출고" });
    fireEvent.click(publishBtn);
    expect(session.setExportMenuOpen).toHaveBeenCalledWith(true);
  });

  it("브러시 두께 - / px / + 스테퍼가 단계적 증감을 수행하고 두께 표시 클릭 시 브러시 패널을 연다", () => {
    const clarity = createClarityMock();

    function StepperHarness() {
      const [width, setWidth] = useState(8);
      const session = createErgonomicsSession({
        strokeWidth: width,
        setStrokeWidth: setWidth,
      });
      return (
        <DrawingClarityContext.Provider value={clarity}>
          <StudioDrawingQuickErgonomicsBar session={session} />
        </DrawingClarityContext.Provider>
      );
    }

    render(<StepperHarness />);

    expect(screen.getByText("8px")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "브러시 크기 키우기" }));
    expect(screen.getByText("10px")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "브러시 크기 키우기" }));
    expect(screen.getByText("13px")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "브러시 크기 줄이기" }));
    expect(screen.getByText("10px")).toBeTruthy();

    const readoutBtn = screen.getByRole("button", { name: /현재 브러시 두께 10px/ });
    fireEvent.click(readoutBtn);
    expect(clarity.open).toHaveBeenCalledWith("brush", readoutBtn);
  });

  it("손떨림 보정 1클릭 버튼이 0 -> 1 -> 2 -> 3 -> 0 단계로 순환한다", () => {
    function StabilizerHarness() {
      const [stabilizer, setStabilizer] = useState(0);
      const session = createErgonomicsSession({
        stabilizer,
        setStabilizer,
      });
      return <StudioDrawingQuickErgonomicsBar session={session} />;
    }

    render(<StabilizerHarness />);

    const offBtn = screen.getByRole("button", { name: "보정 꺼짐" });
    expect(offBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(offBtn);

    const lowBtn = screen.getByRole("button", { name: "보정 약함" });
    expect(lowBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(lowBtn);

    const stdBtn = screen.getByRole("button", { name: "보정 표준" });
    expect(stdBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(stdBtn);

    const highBtn = screen.getByRole("button", { name: "보정 강함" });
    expect(highBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(highBtn);

    expect(screen.getByRole("button", { name: "보정 꺼짐" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("크기 고정, 좌우 반전, 대칭 순환, 브러시 랩(아이콘 포함), 모바일 폭 가이드(690·720px), 100% 배율 복귀가 정확히 동작한다", () => {
    const toggleSizeLock = vi.fn();
    const flipCanvasHorizontal = vi.fn();
    const openBrushStudio = vi.fn();
    const setActualPixelView = vi.fn();

    function ControlsHarness() {
      const [flipH, setFlipH] = useState(false);
      const [symmetry, setSymmetry] = useState<StudioDrawingErgonomicsSymmetryType>("none");
      const [guides, setGuides] = useState(false);
      const session = createErgonomicsSession({
        canvasFlipH: flipH,
        symmetryType: symmetry,
        changeStudioSymmetryType: (next) => setSymmetry(next),
        showWebtoonGuides: guides,
        setShowWebtoonGuides: setGuides,
        effScale: 1.5,
        proDrawPrefs: { sizeLocked: true },
        studioOptionsBarsHandlers: {
          toggleSizeLock,
          flipCanvasHorizontal: () => {
            flipCanvasHorizontal();
            setFlipH((prev) => !prev);
          },
          openBrushStudio,
        },
        studioToolBeltContentHandlers: {
          setActualPixelView,
        },
      });
      return <StudioDrawingQuickErgonomicsBar session={session} />;
    }

    render(<ControlsHarness />);

    // 크기 고정
    const sizeLockBtn = screen.getByRole("button", { name: "크기 고정" });
    expect(sizeLockBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(sizeLockBtn);
    expect(toggleSizeLock).toHaveBeenCalledTimes(1);

    // 좌우 반전
    const flipBtn = screen.getByRole("button", { name: "좌우 반전" });
    expect(flipBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(flipBtn);
    expect(flipCanvasHorizontal).toHaveBeenCalledTimes(1);
    expect(flipBtn.getAttribute("aria-pressed")).toBe("true");

    // 대칭 순환: none -> vertical -> horizontal -> radial -> kaleidoscope -> silk -> none
    const symmetryBtn = screen.getByRole("button", { name: "대칭" });
    expect(symmetryBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(symmetryBtn);
    expect(symmetryBtn.getAttribute("aria-pressed")).toBe("true");
    // 나머지 5단계를 더 클릭하면 다시 none으로 복귀
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(symmetryBtn);
    }
    expect(symmetryBtn.getAttribute("aria-pressed")).toBe("false");

    // 브러시 랩 (펜·잉크 아이콘 18x18 aria-hidden 포함)
    const brushLabBtn = screen.getByRole("button", { name: "브러시 랩" });
    const brushIcon = brushLabBtn.querySelector("img");
    expect(brushIcon?.getAttribute("src")).toBe(
      "/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp",
    );
    expect(brushIcon?.getAttribute("width")).toBe("18");
    expect(brushIcon?.getAttribute("height")).toBe("18");
    expect(brushIcon?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(brushLabBtn);
    expect(openBrushStudio).toHaveBeenCalledWith(brushLabBtn);

    // 모바일 폭 가이드 (690·720px title 안내)
    const guideBtn = screen.getByRole("button", { name: "모바일 폭 가이드" });
    expect(guideBtn.getAttribute("title")).toContain("690·720px");
    expect(guideBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(guideBtn);
    expect(guideBtn.getAttribute("aria-pressed")).toBe("true");

    // 100% 실제 픽셀 배율 복귀
    const zoomBtn = screen.getByRole("button", { name: /캔버스 배율 150%/ });
    expect(zoomBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(zoomBtn);
    expect(setActualPixelView).toHaveBeenCalledTimes(1);
  });

  it("setActualPixelView 핸들러가 없는 최소 세션에서도 setZoom(1)로 100% 배율 복귀하며 영문 로케일을 지원한다", () => {
    useI18n.setState({ lang: "en" });
    const setZoom = vi.fn();
    const session = createErgonomicsSession({
      effScale: 2,
      setZoom,
      studioToolBeltContentHandlers: undefined,
    });

    render(<StudioDrawingQuickErgonomicsBar session={session} />);

    expect(screen.getByRole("button", { name: "Flip view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Symmetry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Brush Lab" })).toBeTruthy();

    const zoomBtn = screen.getByRole("button", { name: /Canvas zoom 200%/ });
    fireEvent.click(zoomBtn);
    expect(setZoom).toHaveBeenCalledWith(1);
  });

  it("간단한 그리기 모드에서도 그리기 옵션 계약(draw-options·활성 브러시 알약·주 색 선택)을 노출해 첫 획 준비와 카탈로그 전환을 지원한다", () => {
    const toggleCatalog = vi.fn();
    const setColor = vi.fn();
    const activatePrimaryCanvasTool = vi.fn();
    const session = createErgonomicsSession({
      tool: "select" as StudioDrawingErgonomicsSession["tool"],
      drawMode: "pen",
      activeCatalogBrush: { id: "gpen", name: "G펜" },
      brushOpacity: 0.85,
      color: "#1e293b",
      setColor,
      activatePrimaryCanvasTool,
      studioBrushCatalogHandlers: { toggle: toggleCatalog },
    });

    const { rerender } = render(<StudioDrawingQuickErgonomicsBar session={session} />);
    const toolbar = screen.getByRole("toolbar", { name: /그리기 옵션/ });
    expect(toolbar.getAttribute("data-studio-draw-options")).toBe("true");
    expect(toolbar.getAttribute("data-studio-active-draw-mode")).toBe("inactive");

    const brushPill = screen.getByRole("button", { name: /현재 도구 G펜, 8px, 불투명도 85%, 브러시 선택 열기/ });
    expect(brushPill.getAttribute("data-studio-brush-active-pill")).toBe("true");
    fireEvent.click(brushPill);
    expect(activatePrimaryCanvasTool).toHaveBeenCalledWith("draw", "pen");
    expect(toggleCatalog).toHaveBeenCalledWith("desktop-dock", brushPill);

    const colorPicker = screen.getByLabelText("주 색 선택") as HTMLInputElement;
    expect(colorPicker.value).toBe("#1e293b");
    fireEvent.change(colorPicker, { target: { value: "#e11d48" } });
    expect(setColor).toHaveBeenCalledWith("#e11d48");

    rerender(
      <StudioDrawingQuickErgonomicsBar
        session={{ ...session, tool: "draw", drawMode: "eraser" }}
      />,
    );
    expect(toolbar.getAttribute("data-studio-active-draw-mode")).toBe("eraser");
  });
});
