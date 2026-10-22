import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCanvasViewportStack } from "./canvas/read-studio-canvas-viewport-stack";
import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";
import {
  saveStudioMobileImmersivePreference,
  shouldStartStudioMobileImmersive,
  STUDIO_MOBILE_IMMERSIVE_SESSION_KEY,
} from "./studio-mobile-immersive";


const studioPageSource = readStudioCuttoonEditorSource();
const studioCanvasViewportSource = readStudioCanvasViewportStack(import.meta.url, "./canvas/");
// 2026-08-21 intentional: the desktop stage HUD (the status bar this test's desktop-lane guard
// reads) moved verbatim out of StudioCanvasViewport.tsx into its own leaf module.
const studioCanvasStageHudSource = readFileSync(
  new URL("./canvas/StudioCanvasStageHud.tsx", import.meta.url),
  "utf8",
);
const studioMobileEditingDockSource = readFileSync(
  new URL("./StudioMobileEditingDock.tsx", import.meta.url),
  "utf8",
);
const studioChromeSource = readFileSync(new URL("./studio-chrome-ui.tsx", import.meta.url), "utf8");
const studioQuickControlsSource = readFileSync(
  new URL("./live/StudioLiveCollaborationQuickControls.tsx", import.meta.url),
  "utf8",
);
// 스튜디오 실행 시 함께 적용되는 스타일 전체가 검사 대상이다: 전역 규칙(globals.css —
// 앱 툴팁 레이어 등)과 스튜디오 전용 규칙의 정본인 studio-route.css를 합쳐 읽는다.
// 스튜디오 규칙은 globals.css 머리말 정책상 studio-route.css에만 둔다.
const studioGlobalsSource = [
  readFileSync(new URL("../../app/styles/globals.css", import.meta.url), "utf8"),
  readFileSync(new URL("../../shared/styles/studio-route.css", import.meta.url), "utf8"),
].join("\n");

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STUDIO_MOBILE_IMMERSIVE_SESSION_KEY, initial);
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("Studio mobile immersive preference", () => {
  it("starts in the dedicated drawing shell by default", () => {
    expect(shouldStartStudioMobileImmersive(memoryStorage())).toBe(true);
    expect(shouldStartStudioMobileImmersive(null)).toBe(true);
  });

  it("remembers an explicit exit for the current browser session", () => {
    const storage = memoryStorage();
    saveStudioMobileImmersivePreference(storage, false);
    expect(shouldStartStudioMobileImmersive(storage)).toBe(false);

    saveStudioMobileImmersivePreference(storage, true);
    expect(shouldStartStudioMobileImmersive(storage)).toBe(true);
  });

  it("fails open when session storage is unavailable", () => {
    const blocked = {
      getItem(): string | null {
        throw new Error("blocked");
      },
      setItem(): void {
        throw new Error("blocked");
      },
    };

    expect(shouldStartStudioMobileImmersive(blocked)).toBe(true);
    expect(() => saveStudioMobileImmersivePreference(blocked, false)).not.toThrow();
  });

  it("uses one adaptive canvas lane instead of stacking duplicate mobile chrome", () => {
    expect(studioPageSource).toContain('mobileImmersive && "max-lg:hidden"');
    expect(studioPageSource).toContain('"lg:hidden"');
    expect(studioPageSource).not.toContain("lg:h-0 lg:w-0 lg:overflow-visible");
    expect(studioCanvasStageHudSource).toContain("!canvasOnlyMode && !isMobile");
    expect(studioPageSource).toContain("<StudioMobileEditingDock");
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-editing-dock="true"');
    expect(studioMobileEditingDockSource).toContain('data-studio-canvas-transient="coach"');
    expect(studioPageSource).toContain("!hasAutosave &&");
    expect(studioPageSource).toContain("drawingShortcutNotice === null");
    expect(studioPageSource).toContain('data-studio-mobile-canvas-workspace={isMobile ? "true" : undefined}');
    expect(studioCanvasViewportSource).toContain(
      'data-studio-mobile-dock-safe-area={isMobile ? "true" : undefined}',
    );
    expect(studioGlobalsSource).toContain("--studio-canvas-bottom-inset");
  });

  it("keeps desktop HUD actions named and at least 44px in both dimensions", () => {
    expect(studioCanvasStageHudSource).toContain(
      'className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-full px-1.5',
    );
    expect(studioCanvasStageHudSource).toContain(
      'localizeText(t, "캔버스만 보기", "studio.canvas.canvasOnlyModeShowCanvasOnly")',
    );
    expect(studioCanvasStageHudSource).toContain(
      "min-h-11 min-w-11",
    );
  });

  it("clears a temporary inspector override when entering the super-simple layout", () => {
    // 밀도 세터는 전용 런타임 모듈로 분리됐다 — useStudioPreferencesRuntime은
    // app-settings 상태·영속만 소유하고 세터는 이 모듈에서 위임받는다.
    const preferencesSource = readFileSync(
      new URL(
        "./studio-cuttoon-editor/runtime/useStudioUiDensityPreference.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const densitySetter = preferencesSource.slice(
      preferencesSource.indexOf("const setStudioUiDensity ="),
      preferencesSource.indexOf("const setUiAdvancedToolsExpanded ="),
    );
    expect(densitySetter).toContain('if (mode === "focus" && !appSettingsRef.current.general.colorPanelPinned) closeRightPanelForFocusModeRef.current();');
    // The host owns the panel state the runtime hook closes over.
    const hostCloser = studioPageSource.slice(
      studioPageSource.indexOf("const closeStudioRightPanelForFocusMode ="),
    );
    expect(hostCloser.slice(0, 200)).toContain("setForceRightPanelOpen(false);");
  });

  it("keeps every 320px dock target at 44px with a fixed essential row and a disclosed work menu", () => {
    expect(studioChromeSource).toContain(
      '"flex min-h-11 min-w-[44px] flex-none flex-col items-center justify-center',
    );
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-primary-actions="true"');
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-workspace-menu="true"');
    expect(studioMobileEditingDockSource).toContain(
      'data-studio-mobile-dock-expanded={workspaceDockExpanded ? "true" : "false"}',
    );
    expect(studioMobileEditingDockSource).toContain("hidden={!workspaceDockExpanded}");
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-workspace-toggle="true"');
    expect(studioMobileEditingDockSource).toContain(
      'data-studio-mobile-control-side={mobileControlSide}',
    );
    expect(studioMobileEditingDockSource).toContain(
      'data-studio-mobile-quick-actions-slot="left"',
    );
    expect(studioMobileEditingDockSource).toContain(
      'data-studio-mobile-quick-actions-slot="right"',
    );
    expect(studioMobileEditingDockSource).toContain(
      'workspaceState.mobileControlSide === "left" ? "left" : "right"',
    );
    expect(studioMobileEditingDockSource).toContain("min-h-11 min-w-11");
    expect(studioMobileEditingDockSource).toContain("grid-cols-6");
    expect(studioMobileEditingDockSource).toContain("[&_button]:min-h-[44px] [&_button]:min-w-[44px]");
    expect(studioMobileEditingDockSource).not.toContain('data-studio-mobile-dock-scroll="primary"');
    expect(studioGlobalsSource).toContain("[data-studio-mobile-dock-scroll] :focus-visible");
    expect(studioGlobalsSource).toContain("outline-offset: -2px");
  });

  it("measures the single essential row while keeping final canvas pixels scroll-reachable", () => {
    expect(studioGlobalsSource).toContain("--studio-mobile-dock-compact-height: calc(64px");
    expect(studioGlobalsSource).toContain("--studio-mobile-dock-expanded-height: var(--studio-mobile-dock-compact-height)");
    expect(studioGlobalsSource).toContain(":root,");
    expect(studioGlobalsSource).toContain(":root:has(");
    expect(studioGlobalsSource).toContain(
      'body:has([data-studio-mobile-sheet]:not([aria-hidden="true"])) [data-studio-shell-view-options="true"]',
    );
    expect(studioGlobalsSource).toContain(
      'body:has([data-studio-mobile-sheet]:not([aria-hidden="true"])) .studio-p2p-huddle-dock',
    );
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-coach="true"');
    expect(studioGlobalsSource).toContain(
      'body:has([data-studio-mobile-coach="true"]) .studio-p2p-huddle-dock:not([data-studio-shell-force-visible="true"])',
    );
    expect(studioGlobalsSource).toContain("@media (hover: none), (pointer: coarse)");
    expect(studioGlobalsSource).toContain('[data-app-tooltip-layer="true"]');
    expect(studioGlobalsSource).toContain('data-studio-mobile-dock-expanded="false"');
    expect(studioGlobalsSource).toContain('[data-studio-mobile-canvas-workspace="true"]');
    expect(studioGlobalsSource).toContain("padding-bottom: 0 !important");
    expect(studioGlobalsSource).toContain(
      '[data-studio-canvas-viewport][data-studio-mobile-dock-safe-area="true"]',
    );
    expect(studioGlobalsSource).toContain(
      "padding-bottom: var(--studio-canvas-bottom-inset)",
    );
    expect(studioGlobalsSource).toContain(
      "scroll-padding-bottom: calc(var(--studio-canvas-bottom-inset) + 0.75rem)",
    );
    expect(studioGlobalsSource).toContain("min-height: 100svh");
    expect(studioGlobalsSource).toContain("height: 100dvh");
    expect(studioGlobalsSource).toContain(
      '[data-studio-editor="true"][data-studio-mobile-immersive="true"]',
    );
    expect(studioGlobalsSource).toContain('[data-studio-app-menubar="true"]');
    expect(studioGlobalsSource).toContain("position: absolute");
    // 의도적 변경(2026-07-24): 고정 14rem 캡이 게시하기 버튼을 클립해 콘텐츠 기반 폭으로 교체.
    expect(studioGlobalsSource).toContain("width: fit-content");
    // 의도적 변경(2026-07-24): 몰입 필은 셸 safe-area 패딩 위 둥근 칩 — 이중 top inset 제거,
    // overflow visible + 실간격으로 종료/임시저장/게시 겹침 방지.
    expect(studioGlobalsSource).toContain("border-radius: 9999px");
    expect(studioGlobalsSource).toContain("overflow: visible");
    expect(studioGlobalsSource).toContain("padding-top: 2.75rem");
  });

  it("몰입 알약이 두 줄로 커져도 실시간 협업 빠른 조작 단추가 알약 아래로 내려가 가려지지 않는다", () => {
    // 접근성 점검(axe target-size)이 잡은 결함: 오프라인 안내가 붙어 알약이 약 100px 가 되면 sticky top-16(64px)에
    // 놓인 단추가 알약에 가려져 44×9px 만 보였다. 알약 높이를 재는 변수를 한 줄 기준(4.25rem)과 비교해 내린다.
    expect(studioQuickControlsSource).toContain('data-studio-live-quick-controls-root="true"');
    const rule = studioGlobalsSource.match(
      /\[data-studio-live-quick-controls-root="true"\]\s*\{\s*margin-top:\s*max\(\s*0px,\s*calc\(var\(--studio-immersive-menubar-block,\s*4\.25rem\)\s*-\s*4\.25rem\)\s*\);/u,
    );
    expect(rule, "몰입 알약 높이만큼 빠른 조작 단추를 내리는 규칙").not.toBeNull();
    // 한 줄짜리 알약에서는 위치가 달라지지 않아야 한다: 기준(4.25rem = 68px)이 한 줄 알약 높이 + 12px(약 67px) 이상이다.
    expect(studioGlobalsSource).toContain("--studio-immersive-menubar-block: calc(0.375rem + 2.75rem + 0.5rem + 2px)");
  });
});
