// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  StudioDrawingQuickErgonomicsBar,
  type StudioDrawingErgonomicsSession,
} from "./StudioDrawingQuickErgonomicsBar";
import { StudioRadialQuickWheel } from "./StudioRadialQuickWheel";
import {
  countActiveAuxiliaryTools,
  DEFAULT_JEWEL_8_WHEEL_SLOTS,
  stepBrushWidthFromWheel,
} from "./studio-drawing-ergonomics-presets";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
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
    effScale: 1,
    setZoom: vi.fn(),
    zoomLocked: false,
    viewTransformSuppressed: false,
    bg3dOpen: false,
    studioLeftToolRailHandlers: { toggleBg3dEditor: vi.fn() },
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

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  useI18n.setState({ lang: "ko" });
});

describe("Wave 13 Track 5 — Jewel Canvas-Max CSS · 멀티입력 · 방사형 퀵 휠 계약", () => {
  it("주얼 도구 계열별 OKLCH 규칙·동심원 라운드·자동 후퇴·왼손 미러·원시색 0건·transition-all 0건·backdrop-filter -webkit- 쌍을 충족한다", () => {
    const clarityCss = readSource(
      "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css",
    );
    const jewelCss = readSource(
      "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingJewelChrome.css",
    );

    // 1) 계열별 주얼 도구 셀렉터 · 1px 광학 림 · 동심원 라운드
    for (const toolId of [
      "pen",
      "eraser",
      "color",
      "fill",
      "layers",
      "select",
      "cut-split",
      "bubble",
      "bg3d",
      "pin-comment",
    ]) {
      expect(clarityCss).toContain(`[data-studio-rail-tool-id="${toolId}"]`);
    }
    expect(clarityCss).toContain("--studio-jewel-ink");
    expect(clarityCss).toContain("calc(var(--studio-jewel-radius-outer) - var(--studio-jewel-padding))");
    expect(clarityCss).toContain("inset 0 1px 0 color-mix(in oklch");
    expect(clarityCss).toContain("border-inline-start:3px solid var(--studio-jewel-ink)");

    // 2) 그리기 중 자동 후퇴(Breathing Auto-Recede) + prefers-reduced-motion 대응
    expect(clarityCss).toContain('#studio-app-shell[data-studio-stroke-active="true"]');
    expect(clarityCss).toContain("opacity:0.24");
    expect(clarityCss).toContain("pointer-events:none");
    expect(clarityCss).toContain("@media (prefers-reduced-motion: reduce)");

    // 3) 왼손잡이 미러 레이아웃 (data-studio-handedness="left" -> order: 2)
    expect(clarityCss).toContain('[data-studio-handedness="left"]');
    expect(clarityCss).toContain("order:2");

    // 4) 원시 hex / rgb / rgba / hsl / hsla · transition-all 0건 검증 (양쪽 CSS 전수)
    for (const [label, css] of [
      ["StudioDrawingClarity.css", clarityCss],
      ["StudioDrawingJewelChrome.css", jewelCss],
    ] as const) {
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/gu), `${label} 원시 hex 금지`).toBeNull();
      expect(css.match(/\brgba?\s*\(/gu), `${label} 원시 rgb/rgba 금지`).toBeNull();
      expect(css.match(/\bhsla?\s*\(/gu), `${label} 원시 hsl/hsla 금지`).toBeNull();
      expect(css, `${label} transition-all 금지`).not.toContain("transition-all");
    }

    // 5) backdrop-filter 선언마다 동일한 값의 -webkit-backdrop-filter 쌍 존재 검증
    const standardBackdropMatches = [
      ...jewelCss.matchAll(/(?<!-webkit-)backdrop-filter:\s*([^;]+);/gu),
    ].map((match) => match[1]?.trim());
    const webkitBackdropMatches = [
      ...jewelCss.matchAll(/-webkit-backdrop-filter:\s*([^;]+);/gu),
    ].map((match) => match[1]?.trim());
    expect(standardBackdropMatches.length).toBeGreaterThanOrEqual(2);
    expect(webkitBackdropMatches).toEqual(standardBackdropMatches);

    // 6) 신규·수정 TSX 위생 검증 (transition-all / <Sparkles> / sub-12px 0건)
    for (const tsxPath of [
      "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar.tsx",
      "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingInputHudStrip.tsx",
      "apps/web/src/domains/creator/studio-cuttoon-editor/StudioRadialQuickWheel.tsx",
    ]) {
      const src = readSource(tsxPath);
      expect(src, `${tsxPath} transition-all 금지`).not.toContain("transition-all");
      expect(src, `${tsxPath} <Sparkles> 금지`).not.toMatch(/<Sparkles\b/u);
      expect(src, `${tsxPath} sub-12px/font-black 금지`).not.toMatch(
        /\bfont-black\b|text-\[(?:9px|10px|0\.6rem|0\.625rem)\]/u,
      );
    }
  });

  it("마우스 휠 스크롤로 브러시 두께를 즉시 증감하고 Shift+휠 고속 조절 및 잠금 무시를 보장한다", () => {
    expect(stepBrushWidthFromWheel(8, -120)).toBe(10);
    expect(stepBrushWidthFromWheel(8, 120)).toBe(6);
    expect(stepBrushWidthFromWheel(8, -120, true)).toBe(13);
    expect(stepBrushWidthFromWheel(8, 0)).toBe(8);

    function WheelHarness({ blocked = false }: { readonly blocked?: boolean }) {
      const [width, setWidth] = useState(8);
      const session = createErgonomicsSession({
        strokeWidth: width,
        setStrokeWidth: setWidth,
        activeSurfaceReviewLocked: blocked,
      });
      return <StudioDrawingQuickErgonomicsBar session={session} />;
    }

    const { rerender } = render(<WheelHarness />);
    const stepper = screen.getByRole("group", { name: "브러시 두께 빠른 조절" });
    expect(stepper.getAttribute("data-studio-brush-width-wheel")).toBe("true");
    expect(screen.getByText("두께 8px")).toBeTruthy();

    fireEvent.wheel(stepper, { deltaY: -120 });
    expect(screen.getByText("두께 10px")).toBeTruthy();

    fireEvent.wheel(stepper, { deltaY: -120, shiftKey: true });
    expect(screen.getByText("두께 16px")).toBeTruthy();

    fireEvent.wheel(stepper, { deltaY: 120 });
    expect(screen.getByText("두께 13px")).toBeTruthy();

    // 잠금 상태에서는 마우스 휠로 두께가 바뀌지 않아야 한다.
    rerender(<WheelHarness blocked />);
    fireEvent.wheel(stepper, { deltaY: -120 });
    expect(screen.getByText("두께 13px")).toBeTruthy();
  });

  it("Zen 캔버스 집중 모드 토글과 Escape 복귀가 셸 속성·세션 콜백을 동기화한다", () => {
    const setCanvasOnlyMode = vi.fn();

    function ZenHarness() {
      const [canvasOnly, setCanvasOnly] = useState(false);
      const session = createErgonomicsSession({
        canvasOnlyMode: canvasOnly,
        setCanvasOnlyMode: (next) => {
          setCanvasOnlyMode(next);
          setCanvasOnly((prev) => (typeof next === "function" ? next(prev) : next));
        },
      });
      return (
        <div id="studio-app-shell" data-studio-editor="true">
          <StudioDrawingQuickErgonomicsBar session={session} />
        </div>
      );
    }

    render(<ZenHarness />);
    const shell = document.getElementById("studio-app-shell");
    const zenBtn = screen.getByRole("button", { name: "Zen 캔버스 집중 모드 켜기" });
    expect(zenBtn.getAttribute("aria-pressed")).toBe("false");
    expect(shell?.hasAttribute("data-studio-zen-focus")).toBe(false);

    fireEvent.click(zenBtn);
    expect(zenBtn.getAttribute("aria-pressed")).toBe("true");
    expect(shell?.getAttribute("data-studio-zen-focus")).toBe("true");
    expect(setCanvasOnlyMode).toHaveBeenLastCalledWith(true);

    // Escape로 Zen 집중 모드 즉시 해제
    fireEvent.keyDown(window, { key: "Escape" });
    expect(zenBtn.getAttribute("aria-pressed")).toBe("false");
    expect(shell?.hasAttribute("data-studio-zen-focus")).toBe(false);
    expect(setCanvasOnlyMode).toHaveBeenLastCalledWith(false);
  });

  it("왼손/오른손 전환 · 보조 도구 카운트 토글 · 그리기 중 자동 후퇴(data-studio-stroke-active)를 정확히 반영한다", () => {
    expect(
      countActiveAuxiliaryTools({
        stabilizer: 2,
        pressurePreset: "soft-ink",
        quickShapeEnabled: true,
        sizeLocked: false,
        canvasFlipH: true,
        symmetryType: "vertical",
        perspectiveRulerActive: false,
        showWebtoonGuides: true,
      }),
    ).toBe(6);

    const session = createErgonomicsSession({
      stabilizer: 2,
      canvasFlipH: true,
      symmetryType: "vertical",
      showWebtoonGuides: true,
    });

    const { rerender } = render(
      <div id="studio-app-shell" data-studio-editor="true">
        <StudioDrawingQuickErgonomicsBar session={session} />
        <div id="studio-canvas-workspace" data-testid="canvas-workspace" />
      </div>,
    );

    const shell = document.getElementById("studio-app-shell")!;
    const toolbar = screen.getByRole("toolbar", { name: /그리기 옵션/ });

    // 보조 도구 카운트 & 기본 펼침 유지 (기존 버튼 전수 접근 가능)
    const auxToggle = document.querySelector<HTMLButtonElement>('[data-studio-aux-tools-toggle="true"]')!;
    expect(auxToggle.getAttribute("aria-expanded")).toBe("true");
    expect(auxToggle.getAttribute("data-studio-aux-active-count")).toBe("5");
    expect(toolbar.getAttribute("data-studio-compact-aux-collapsed")).toBe("false");
    fireEvent.click(auxToggle);
    expect(auxToggle.getAttribute("aria-expanded")).toBe("false");
    expect(toolbar.getAttribute("data-studio-compact-aux-collapsed")).toBe("true");

    // 왼손/오른손 전환 → #studio-app-shell[data-studio-handedness="left"]
    const handednessBtn = document.querySelector<HTMLButtonElement>('[data-studio-handedness-toggle="true"]')!;
    expect(handednessBtn.getAttribute("aria-pressed")).toBe("false");
    expect(handednessBtn.textContent).toContain("오른손");

    fireEvent.click(handednessBtn);
    expect(handednessBtn.getAttribute("aria-pressed")).toBe("true");
    expect(handednessBtn.textContent).toContain("왼손");
    expect(shell.getAttribute("data-studio-handedness")).toBe("left");

    // 영문 로케일 검증
    useI18n.setState({ lang: "en" });
    rerender(
      <div id="studio-app-shell" data-studio-editor="true">
        <StudioDrawingQuickErgonomicsBar session={session} />
        <div id="studio-canvas-workspace" data-testid="canvas-workspace" />
      </div>,
    );
    expect(handednessBtn.textContent).toContain("Left");

    fireEvent.click(handednessBtn);
    expect(shell.getAttribute("data-studio-handedness")).toBe("right");
    expect(handednessBtn.textContent).toContain("Right");

    // 그리기 중 Breathing Auto-Recede: 캔버스 pointerdown → data-studio-stroke-active="true", pointerup → 해제
    const canvasArea = screen.getByTestId("canvas-workspace");
    fireEvent.pointerDown(canvasArea, { button: 0, pointerType: "pen" });
    expect(shell.getAttribute("data-studio-stroke-active")).toBe("true");
    fireEvent.pointerUp(window);
    expect(shell.hasAttribute("data-studio-stroke-active")).toBe(false);
  });

  it("주얼 8슬롯 방사형 퀵 휠이 카테고리 액센트 링 · 중앙 도구/굵기/단축키 HUD · 마우스 휠 회전 · 1~8 숫자키 즉시 실행을 지원한다", () => {
    const onSelectAction = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioRadialQuickWheel
        open
        slotCount={8}
        slots={DEFAULT_JEWEL_8_WHEEL_SLOTS}
        activeToolLabel="G펜"
        strokeWidth={12}
        shortcutHint="Q"
        anchor={{ x: 640, y: 400 }}
        onSelectAction={onSelectAction}
        onClose={onClose}
      />,
    );

    const menu = screen.getByRole("menu", { name: "빠른 도구 방사형 휠" });
    expect(menu.getAttribute("data-studio-radial-slot-count")).toBe("8");
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(8);
    for (const item of items) {
      expect(item.getAttribute("data-jewel-category")).toMatch(/^(?:history|transform|layer|color|view)$/u);
    }

    // 중앙 주얼 HUD: 활성 도구 · 굵기 · 단축키 힌트 표시
    const centerHud = document.querySelector<HTMLElement>('[data-studio-radial-center-hud="true"]')!;
    expect(centerHud.textContent).toContain("G펜");
    expect(centerHud.textContent).toContain("12px");
    expect(centerHud.textContent).toContain("Q");

    // 마우스 호버로 활성 슬롯 강조
    fireEvent.mouseEnter(items[2]!);
    expect(menu.getAttribute("data-active-slot")).toBe("toggle-alpha-lock");

    // 마우스 휠로 활성 슬롯 순방향/역방향 회전 후 Enter로 실행
    fireEvent.wheel(menu, { deltaY: 120 });
    expect(menu.getAttribute("data-active-slot")).toBe("toggle-clipping-mask");
    fireEvent.wheel(menu, { deltaY: -120 });
    expect(menu.getAttribute("data-active-slot")).toBe("toggle-alpha-lock");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSelectAction).toHaveBeenCalledWith(
      "toggle-alpha-lock",
      expect.objectContaining({ index: 2, actionId: "toggle-alpha-lock" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    // 숫자키 7(스포이드) · 8(다시 실행) 즉시 실행
    fireEvent.keyDown(window, { key: "7" });
    expect(onSelectAction).toHaveBeenLastCalledWith(
      "eyedropper",
      expect.objectContaining({ index: 6, actionId: "eyedropper" }),
    );
    fireEvent.keyDown(window, { key: "8" });
    expect(onSelectAction).toHaveBeenLastCalledWith(
      "redo",
      expect.objectContaining({ index: 7, actionId: "redo" }),
    );
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
