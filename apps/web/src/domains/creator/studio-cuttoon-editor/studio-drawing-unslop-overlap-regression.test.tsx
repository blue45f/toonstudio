// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorPopover } from "../StudioColorPopover";
import { StudioCreationModeLauncher } from "../StudioCreationModeLauncher";
import { StudioSpectralBlendPreviewChip } from "../canvas-chrome/StudioSpectralBlendPreviewChip";
import { resolveStudioColorSurfacePosition } from "../color/studio-color-surface-position";
import { resolveStudioRailMorePosition } from "../studio-left-tool-rail-position";
import { StudioDrawingAppBar } from "./StudioDrawingAppBar";
import { StudioDrawingInputHudStrip } from "./StudioDrawingInputHudStrip";
import { StudioLiveFoleyFeelControls } from "./StudioLiveFoleyFeelControls";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

const ROOT = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function createMinimalAppBarSession(): StudioCuttoonEditorViewSession {
  return {
    name: "에피소드 1화",
    brush: "g-pen",
    activeCatalogBrush: { id: "g-pen", name: "G펜" },
    strokeWidth: 8,
    setStrokeWidth: vi.fn(),
    brushOpacity: 1,
    setBrushOpacity: vi.fn(),
    stabilizer: 7,
    setStabilizer: vi.fn(),
    color: "#1f4435",
    colorWheelOpen: false,
    setColorWheelOpen: vi.fn(),
    symmetryType: "off",
    changeStudioSymmetryType: vi.fn(),
    setSymmetryType: vi.fn(),
    canvasFlipH: false,
    studioOptionsBarsHandlers: {
      flipCanvasHorizontal: vi.fn(),
      openBrushStudio: vi.fn(),
    },
    studioBrushCatalogHandlers: {
      toggle: vi.fn(),
    },
    quickAccessPaletteOpen: false,
    setQuickAccessPaletteOpen: vi.fn(),
    visibleLeftPanelOpen: true,
    setLeftPanelOpenWithOverride: vi.fn(),
    visibleRightPanelOpen: true,
    setRightPanelOpenWithOverride: vi.fn(),
    exportMenuOpen: false,
    setExportMenuOpen: vi.fn(),
    canvasOnlyMode: false,
    setCanvasOnlyMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    menuEditUndoDisabled: false,
    menuEditRedoDisabled: false,
    isMobile: false,
    setMobileSheet: vi.fn(),
    zoom: 1,
    setZoom: vi.fn(),
    quickShapeActive: false,
    setQuickShapeActive: vi.fn(),
    saving: false,
    collaborationOperationSyncPending: false,
    offlineSceneNotice: null,
    serverRevisionError: null,
    shortcutsOpen: false,
    requestSaveFlush: vi.fn(),
    setShortcutsOpen: vi.fn(),
  } as unknown as StudioCuttoonEditorViewSession;
}

afterEach(() => {
  cleanup();
});

describe("Wave 46A · 드로잉 툴 UI/UX 겹침 해소 회귀 계약", () => {
  it("StudioDrawingAppBar가 z-[50] 상단바·z-[55] 고급 패널·safe-area·overscroll-contain 계층을 유지한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/studio?drawingShell=app"]}>
        <StudioDrawingAppBar session={createMinimalAppBarSession()} />
      </MemoryRouter>,
    );

    const header = container.querySelector('[data-studio-drawing-app-bar="true"]');
    expect(header?.className).toContain("z-[50]");
    expect(header?.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(header?.className).not.toContain("z-30");

    const coreControls = container.querySelector('[data-studio-appbar-core-controls="true"]');
    expect(coreControls?.className).toContain("overscroll-x-contain");

    fireEvent.click(screen.getByTestId("drawing-appbar-advanced-toggle"));
    const advancedPanel = container.querySelector("#studio-drawing-appbar-advanced-panel");
    expect(advancedPanel?.className).toContain("z-[55]");
    expect(advancedPanel?.className).toContain("overscroll-contain");
    expect(advancedPanel?.className).toContain("max-h-[calc(100dvh-4rem-env(safe-area-inset-top))]");
  });

  it("데스크톱(1440×900·1024×768)·태블릿(820×1180)·모바일(390×844)에서 컬러 팝오버가 상단바·좌측 레일과 겹치지 않는다", () => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      const fromRail = resolveStudioColorSurfacePosition(
        { left: 4, right: 48, top: 24, bottom: 68 },
        viewport,
      );
      expect(fromRail.sheet).toBe(false);
      expect(fromRail.left).toBeGreaterThanOrEqual(56);
      expect(fromRail.top).toBeGreaterThanOrEqual(52);
      expect(fromRail.left + fromRail.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(fromRail.top + fromRail.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
    }

    const tablet = resolveStudioColorSurfacePosition(
      { left: 16, right: 60, top: 64, bottom: 108 },
      { width: 820, height: 1180 },
    );
    expect(tablet.sheet).toBe(false);
    expect(tablet.left).toBeGreaterThanOrEqual(8);
    expect(tablet.left + tablet.width).toBeLessThanOrEqual(820 - 8);

    const mobile = resolveStudioColorSurfacePosition(
      { left: 12, right: 56, top: 760, bottom: 804 },
      { width: 390, height: 844 },
    );
    expect(mobile.sheet).toBe(true);
    expect(mobile.left).toBe(8);
    expect(mobile.width).toBe(390 - 16);
    expect(mobile.top).toBeGreaterThanOrEqual(8);
    expect(mobile.top + mobile.maxHeight).toBeLessThanOrEqual(844 - 8);
  });

  it("데스크톱 1024×768에서 전체 도구 팝오버가 topClearance=44로 상단 44px 바 아래(top >= 52)에 배치된다", () => {
    const pos = resolveStudioRailMorePosition({
      popoverHeight: 544,
      popoverWidth: 416,
      topClearance: 44,
      trigger: { right: 48, bottom: 200 },
      viewport: { width: 1024, height: 768 },
    });
    expect(pos.left).toBe(52);
    expect(pos.top).toBeGreaterThanOrEqual(52);
    expect(pos.top + 544).toBeLessThanOrEqual(768 - 8);
  });

  it("StudioDrawingClarity.css와 StudioDrawingMobileWorkspace.css가 패널·독·배지·HUD 비충돌 규칙을 선언한다", () => {
    const clarityCss = readRepoFile("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css");
    const mobileCss = readRepoFile("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingMobileWorkspace.css");

    // 좌측 도구 레일 계층 및 스크롤 격리
    expect(clarityCss).toContain(".studio-drawing-clarity-rail{position:relative;z-index:20;");
    expect(clarityCss).toContain("overscroll-behavior:contain");
    expect(clarityCss).toContain("overscroll-behavior-x:contain");
    // 열린 브러시·페이지·레이어 패널과 플로팅 컨텍스트 바 비충돌
    expect(clarityCss).toContain("[data-studio-drawing-clarity-panel=brush],[data-studio-drawing-clarity-panel=pages]) .studio-drawing-clarity-context-row:not(.studio-drawing-clarity-mobile-context)");
    expect(clarityCss).toContain("[data-studio-drawing-clarity-panel=layers]:not([data-studio-drawing-clarity-mobile=true]):has([data-studio-inspector-dock=right]) .studio-drawing-clarity-context-row:not(.studio-drawing-clarity-mobile-context)");
    // 우측 인스펙터 열림 시 오프라인 배지·플로팅 저장 센터 회피
    expect(clarityCss).toContain('[data-studio-shell-floating-target="offline-readiness"],[data-studio-draft-save-placement="floating"]');
    // 줌·회전 HUD와 상단 플로팅 컨텍스트 바 비충돌
    expect(clarityCss).toContain("[data-studio-canvas-viewport]>[data-studio-view-tools-hud]{");
    // 모바일 상태 바가 하단 독 위로 상승
    expect(clarityCss).toContain("[data-studio-drawing-clarity=true][data-studio-drawing-clarity-mobile=true]:not([data-studio-drawing-clarity-panel=pages]) [data-studio-status-bar=true]{");

    // 모바일 컨텍스트 바 z-index, safe-area, 선택 바 vs 오프라인 배지 및 시트 양보
    expect(mobileCss).toContain("z-index: 45;");
    expect(mobileCss).toContain("overscroll-behavior-x: contain;");
    expect(mobileCss).toContain("env(safe-area-inset-left)");
    expect(mobileCss).toContain("env(safe-area-inset-right)");
    expect(mobileCss).toContain('[data-studio-mobile-selection-actions="true"]) [data-studio-shell-floating-target="offline-readiness"]');
    expect(mobileCss).toContain('[data-studio-mobile-sheet="true"]:not([hidden]):not([aria-hidden="true"])');
    expect(mobileCss).toContain('[data-studio-brush-library="true"][role="dialog"]');
  });

  it("브러시 시트·오프라인 배지·모바일 독·미니 독·단축키 HUD가 safe-area와 계층화된 z-index를 지킨다", () => {
    const brushSheetSrc = readRepoFile("apps/web/src/domains/creator/brush/StudioBrushLibrarySheet.tsx");
    const offlineSrc = readRepoFile("apps/web/src/domains/creator/offline/StudioOfflinePanel.tsx");
    const mobileDockSrc = readRepoFile("apps/web/src/domains/creator/StudioMobileEditingDock.tsx");
    const quickBarSrc = readRepoFile("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar.tsx");
    const shortcutHudSrc = readRepoFile("apps/web/src/domains/creator/studio-cuttoon-editor/StudioVisualShortcutHud.tsx");
    const chromeUiSrc = readRepoFile("apps/web/src/domains/creator/studio-chrome-ui.tsx");

    expect(brushSheetSrc).toContain("insetTop={100}");
    expect(brushSheetSrc).toContain("insetLeft={56}");
    expect(brushSheetSrc).toContain("z-[65]");
    expect(brushSheetSrc).toContain("top-[max(3.25rem,calc(env(safe-area-inset-top)+3rem))]");
    expect(offlineSrc).toContain("right-[max(0.75rem,env(safe-area-inset-right))]");
    expect(mobileDockSrc).toContain("overscroll-x-contain");
    expect(mobileDockSrc).toContain("left-[max(0.5rem,env(safe-area-inset-left))]");
    expect(quickBarSrc).toContain("z-[45]");
    expect(quickBarSrc).toContain("env(safe-area-inset-bottom)");
    expect(shortcutHudSrc).toContain("--studio-canvas-bottom-inset");
    expect(chromeUiSrc).toContain("relative z-[20]");
  });
});

describe("Wave 46A · 드로잉 1차 크롬 어려운 용어·장황한 설명 언슬롭 회귀 계약", () => {
  it("StudioDrawingAppBar에서 경쟁사명·플러시·다이내믹스·font-black·hover:scale- 슬롭이 제거됐다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/studio?drawingShell=app"]}>
        <StudioDrawingAppBar session={createMinimalAppBarSession()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("drawing-appbar-advanced-toggle"));

    const syncBtn = screen.getByTestId("drawing-appbar-sync-status");
    expect(syncBtn.getAttribute("title")).toBe("지금 원고 저장");
    expect(syncBtn.getAttribute("title")).not.toContain("플러시");

    const helpBtn = screen.getByTestId("drawing-appbar-help-button");
    expect(helpBtn.getAttribute("title")).not.toMatch(/클립스튜디오|프로크리에이트/u);

    const brushLabBtn = container.querySelector('[data-studio-open-brush-lab="true"]');
    expect(brushLabBtn?.getAttribute("title")).not.toContain("다이내믹스");

    expect(container.innerHTML).not.toContain("font-black");
    expect(container.innerHTML).not.toContain("hover:scale-");
  });

  it("집중 모드와 펜촉 효과 칩이 생활 한글 라벨을 표시하고 기존 접근성 이름을 유지한다", () => {
    render(
      <>
        <StudioDrawingInputHudStrip
          activeAuxCount={2}
          auxCollapsed={false}
          onToggleAuxCollapsed={vi.fn()}
          zenFocus={false}
          onToggleZenFocus={vi.fn()}
          handedness="right"
          onToggleHandedness={vi.fn()}
          tool="draw"
          blocked={false}
        />
        <StudioLiveFoleyFeelControls blocked={false} blockedReasonId="test-blocked" />
      </>,
    );

    const zenBtn = screen.getByRole("button", { name: "Zen 캔버스 집중 모드 켜기" });
    expect(zenBtn.textContent?.trim()).toBe("집중");

    const nibBtn = document.querySelector<HTMLButtonElement>("[data-studio-nib-vfx-mode]");
    expect(nibBtn?.textContent).toContain("펜촉 효과");
    expect(nibBtn?.textContent).not.toContain("필기감 FX");
    expect(nibBtn?.getAttribute("title")).not.toContain("이펙트");
  });

  it("StudioColorPopover가 물감 섞임 미리보기를 접이식 <details> 안에 정리하고 버튼 title을 두지 않는다", () => {
    render(
      <StudioColorPopover
        value="#1f4435"
        onChange={vi.fn()}
        recentColors={["#faf8f3"]}
        label="선 색"
        initialOpen
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "선 색 선택" });
    const disclosure = dialog.querySelector<HTMLDetailsElement>('[data-studio-spectral-blend-disclosure="true"]');
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.querySelector("summary")?.textContent?.trim()).toBe("물감 섞임 미리보기");

    const titledButtons = Array.from(dialog.querySelectorAll("button")).filter((btn) => btn.hasAttribute("title"));
    expect(titledButtons).toEqual([]);
  });

  it("StudioSpectralBlendPreviewChip과 StudioCreationModeLauncher, 좌측 레일 카탈로그에서 어려운 영문·전문 용어를 줄였다", () => {
    const { container } = render(
      <>
        <StudioSpectralBlendPreviewChip foregroundHex="#1f4435" onPickMixedColor={vi.fn()} />
        <StudioCreationModeLauncher onSelectMode={vi.fn()} />
      </>,
    );

    expect(container.textContent).toContain("물감 섞임 미리보기");
    expect(container.textContent).not.toContain("7밴드 분광 혼색");
    expect(container.textContent).not.toContain("일반 sRGB");
    expect(container.innerHTML).not.toContain("text-[11px]");

    fireEvent.click(screen.getByRole("button", { name: /만들기/ }));
    const palette = screen.getByRole("dialog", { name: "무엇을 만들까요?" });
    expect(palette.textContent).not.toContain("CREATOR WORKSPACES");
    expect(palette.textContent).not.toContain("7밴드 브러시 매핑");
    expect(palette.textContent).toContain("다른 앱 단축키·브러시 가져오기");

    const clarityBarSrc = readRepoFile("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityBar.tsx");
    const mobileBarSrc = readRepoFile("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityMobileBar.tsx");
    const leftRailSrc = readRepoFile("apps/web/src/domains/creator/StudioLeftToolRail.tsx");
    expect(clarityBarSrc).not.toContain("스냅샷 복원");
    expect(clarityBarSrc).not.toContain("세로 스크롤 분할");
    expect(mobileBarSrc).not.toContain("세로 스크롤 분할");
    expect(leftRailSrc).not.toContain('"Hybrid 3D DCC"');
    expect(leftRailSrc).not.toContain("안티앨리어스");
    expect(leftRailSrc).not.toContain("샘플링해");
  });
});
