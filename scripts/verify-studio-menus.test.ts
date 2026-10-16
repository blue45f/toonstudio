// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ko from "../apps/web/public/i18n/studio/background/ko.json";
import {
  defaultStudioAppSettings,
  showStudioRailTool,
  STUDIO_RAIL_TOOL_CATALOG,
} from "../apps/web/src/domains/creator/studio-app-settings";
import { studioDrawingVisibleTools } from "../apps/web/src/domains/creator/studio-drawing-core-tools";
import { resetStudioFloatingSurfaceStackForTest } from "../apps/web/src/domains/creator/studio-floating-surface-stack";
import { subscribeStudioHelpHub } from "../apps/web/src/domains/creator/studio-help-hub-channel";
import { buildStudioHelpGroupItems } from "../apps/web/src/domains/creator/studio-help-menu-items";
import { buildStudioViewSurfaceMenuItems } from "../apps/web/src/domains/creator/studio-main-menu-items-authoring";
import { buildStudioBrushMenuItems } from "../apps/web/src/domains/creator/studio-main-menu-items-brush";
import { localizeStudioRailToolLabel } from "../apps/web/src/domains/creator/studio-rail-tool-localization";
import { StudioShellFloatingLayoutManager } from "../apps/web/src/domains/creator/studio-shell/StudioShellFloatingLayoutManager";
import { StudioShellFloatingLayoutProvider } from "../apps/web/src/domains/creator/studio-shell/StudioShellFloatingLayoutProvider";
import { resetStudioStrokeFocusActivityForTests, setStudioStrokeFocusActivity } from "../apps/web/src/domains/creator/studio-stroke-focus-activity";
import { createStudioUiPreferencesRepository } from "../apps/web/src/domains/creator/studio-ui-preferences-sqlite";
import { StudioBackgroundPanel } from "../apps/web/src/domains/creator/StudioBackgroundPanel";

import {
  STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS,
  clickAndWaitForRenderer,
  selectCanvasResizeRow,
  waitForRendererQuiet,
} from "./lib/studio-verify-render-settle";
import {
  CANVAS_RESIZE_AUTHORITY_MESSAGE,
  CATALOGUE_GROUPS,
  classifyStudioCanvasResizeResult,
  closeFloatingUi,
  dismissCinematicCanvasWelcome,
  dismissOverlays,
  IMAGE_RAIL_ENTRY,
  QUICK_ACCESS_CLOSE_LABEL,
  DESKTOP_FLOATING_LAYOUT_DIALOG,
  FIRST_RUN_RAIL_TOOL_IDS,
  MENU_DRIVEN_POPOVERS,
  menuItemRowHasExactLabel,
  OPTIONAL_RAIL_TOOLS,
} from "./verify-studio-menus.mts";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "../apps/web/src/domains/creator/studio-main-menu-contract";

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => (ko as Record<string, string>)[key] ?? key,
}));

afterEach(() => {
  cleanup();
  resetStudioFloatingSurfaceStackForTest();
  resetStudioStrokeFocusActivityForTests();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("production menu verifier follows shipped feature entry points", () => {
  it("정확한 자체 preview의 권한 거절과 불변 높이만 별도 계약으로 인정한다", () => {
    const denied = {
      expectedHeight: "높이 8348px", previousHeight: "높이 1080px", actualHeight: "높이 1080px",
      authorityAlertVisible: true, currentOrigin: "http://127.0.0.1:5279", ownedPreviewOrigin: "http://127.0.0.1:5279",
    };
    expect(classifyStudioCanvasResizeResult(denied)).toBe("denied");
    expect(classifyStudioCanvasResizeResult({ ...denied, authorityAlertVisible: false })).toBe("failed");
    expect(classifyStudioCanvasResizeResult({ ...denied, actualHeight: null })).toBe("failed");
    expect(classifyStudioCanvasResizeResult({ ...denied, actualHeight: "높이 8000px" })).toBe("failed");
    expect(classifyStudioCanvasResizeResult({ ...denied, actualHeight: "높이 8348px" })).toBe("failed");
    expect(classifyStudioCanvasResizeResult({ ...denied, ownedPreviewOrigin: undefined })).toBe("failed");
    expect(classifyStudioCanvasResizeResult({ ...denied, currentOrigin: "https://toonstudio.cloud" })).toBe("failed");
    expect(() => classifyStudioCanvasResizeResult({
      ...denied, currentOrigin: "https://toonstudio.cloud", ownedPreviewOrigin: "https://toonstudio.cloud",
    })).toThrow(/owned loopback/u);
    expect(classifyStudioCanvasResizeResult({
      ...denied, actualHeight: "높이 8348px", authorityAlertVisible: false, ownedPreviewOrigin: undefined,
    })).toBe("applied");
  });

  it("preserves eight stored defaults and verifies ten rendered tools plus More additions", () => {
    let visibleIds = defaultStudioAppSettings().toolbar.visibleIds;
    expect(visibleIds).toHaveLength(8);
    expect(studioDrawingVisibleTools(visibleIds)).toEqual(FIRST_RUN_RAIL_TOOL_IDS);
    expect(FIRST_RUN_RAIL_TOOL_IDS).toHaveLength(10);
    expect(visibleIds).not.toContain("eyedropper");
    expect(visibleIds).not.toContain("bubble");
    expect(OPTIONAL_RAIL_TOOLS.map(({ id }) => id)).toEqual([
      "eyedropper", "bubble", "smart-shape", "shape-rect", "shape-ellipse", "reference",
    ]);
    for (const { id, moreLabel } of OPTIONAL_RAIL_TOOLS) {
      expect(STUDIO_RAIL_TOOL_CATALOG.find((tool) => tool.id === id)?.label).toBe(moreLabel);
      const previous = visibleIds;
      visibleIds = showStudioRailTool(visibleIds, id);
      expect(visibleIds).toEqual(expect.arrayContaining([...previous, id]));
      expect(new Set(visibleIds).size).toBe(visibleIds.length);
    }
    expect(visibleIds).toHaveLength(13);
    expect(studioDrawingVisibleTools(visibleIds)).toHaveLength(15);
    expect(studioDrawingVisibleTools(visibleIds)).toEqual(expect.arrayContaining([...FIRST_RUN_RAIL_TOOL_IDS]));
  });

  it("uses catalogue picker names and the actual localized shortcut-bearing rail names", () => {
    for (const [id, authoredLabel] of [
      ["eyedropper", "스포이드 (I / Alt+클릭)"], ["bubble", "말풍선 추가"],
    ] as const) {
      const requirement = OPTIONAL_RAIL_TOOLS.find((tool) => tool.id === id)!;
      expect(localizeStudioRailToolLabel({
        toolId: id, authoredLabel, lang: "ko",
        t: (key) => STUDIO_RAIL_TOOL_CATALOG.find((tool) => tool.labelKey === key)?.label ?? key,
      })).toBe(requirement.railLabel);
    }
  });

  it("opens the real desktop floating manager from the menu and closes its named window", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1024px)", media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    }));
    render(createElement(StudioShellFloatingLayoutProvider, null,
      createElement("div", { "data-studio-draw-options-dock": "true" }),
      createElement(StudioShellFloatingLayoutManager),
    ));
    const menuAction = buildStudioViewSurfaceMenuItems({
      state: {} as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: {} as StudioMainMenuUiActions,
    }).find((item) => item.commandId === "view.floating-layout")!;
    act(() => menuAction.onSelect());
    const dialog = await screen.findByRole("dialog", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.name, exact: true });
    expect(screen.queryByRole("dialog", { name: "보기 및 플로팅 UI 설정", exact: true })).toBeNull();
    expect(within(dialog).getByRole("heading", { name: "플로팅 UI 작업공간", exact: true })).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("switch", { name: "그리기 옵션 숨기기", exact: true }));
    expect(await within(dialog).findByRole("switch", { name: "그리기 옵션 표시하기", exact: true })).toBeTruthy();
    const autoHide = within(dialog).getByRole("switch", { name: /펜으로 그리는 동안 자동 숨김/u });
    if (autoHide.getAttribute("aria-checked") !== "true") fireEvent.click(autoHide);
    expect(autoHide.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("button", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.closeLabel, exact: true }));
    expect(screen.queryByRole("dialog", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.name, exact: true })).toBeNull();
    const launcher = screen.getByRole("button", { name: /보기 설정/u });
    const launcherRoot = launcher.closest('[data-studio-shell-view-options="true"]')!;
    act(() => setStudioStrokeFocusActivity("canvas-stroke", true));
    expect(launcherRoot.hasAttribute("inert")).toBe(true);
    expect(launcherRoot.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button", { name: /보기 설정/u })).toBeNull();
    act(() => resetStudioStrokeFocusActivityForTests());
    expect(launcherRoot.hasAttribute("inert")).toBe(false);
    expect(launcherRoot.hasAttribute("aria-hidden")).toBe(false);
    expect(screen.getByRole("button", { name: /보기 설정/u })).toBe(launcher);
  });

  it("matches a direct menu-row label exactly without confusing shortcut or prefix text", () => {
    expect(menuItemRowHasExactLabel("AI 어시스트", "AI 어시스트")).toBe(true);
    expect(menuItemRowHasExactLabel("초안 저장\n⌘S", "초안 저장")).toBe(true);
    expect(menuItemRowHasExactLabel("게시 패키지…", "게시")).toBe(false);
    expect(menuItemRowHasExactLabel("슬롯 3: 초안 저장", "초안 저장")).toBe(false);
  });
  it("requires the current stroke label and preserves the same correction action", () => {
    const correctCurrentStroke = vi.fn();
    const item = buildStudioBrushMenuItems({
      state: { pixelArtEnabled: false } as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: { correctCurrentStroke } as StudioMainMenuUiActions,
    }).find((candidate) => candidate.commandId === "brush.correct-current-stroke");
    expect(item).toBeDefined();
    expect(CATALOGUE_GROUPS.find((group) => group.id === "brush")?.items).toContain(item!.label);
    expect(item!.disabled).toBe(false);
    item!.onSelect();
    expect(correctCurrentStroke).toHaveBeenCalledOnce();
  });

  it("requires the renamed help home and retains the tutorial journey inside that hub", () => {
    const openFeatureTutorial = vi.fn();
    const requests: Parameters<Parameters<typeof subscribeStudioHelpHub>[0]>[0][] = [];
    const unsubscribe = subscribeStudioHelpHub((request) => requests.push(request));
    try {
      const item = buildStudioHelpGroupItems({
        state: { activeToolCommandId: "tool.pen" } as StudioMainMenuBuilderState,
        editor: { openFeatureTutorial } as StudioMainMenuEditorActions,
        ui: { openShortcuts: vi.fn() } as StudioMainMenuUiActions,
        helpGroupLabel: "도움말",
      }).find((candidate) => candidate.commandId === "help.feature-tutorials");
      expect(item).toBeDefined();
      expect(CATALOGUE_GROUPS.find((group) => group.id === "help")?.items).toContain(item!.label);
      item!.onSelect();
      expect(requests).toHaveLength(1);
      requests[0]!.actions?.openFeatureTutorial?.();
      expect(openFeatureTutorial).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("matches background content inside the actual editor whose preset still applies", async () => {
    const openStudioMenu = vi.fn();
    buildStudioBrushMenuItems({
      state: {} as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: { openStudioMenu } as StudioMainMenuUiActions,
    }).find((item) => item.commandId === "brush.background-tone")!.onSelect();
    expect(openStudioMenu).toHaveBeenCalledWith("bgFill");

    const entry = MENU_DRIVEN_POPOVERS.find((candidate) => candidate.item === "배경 · 톤")!;
    expect(entry.contentSelector).toBe('[data-studio-background-panel="true"]');
    const repository = createStudioUiPreferencesRepository({
      get: async () => null, set: async () => {}, delete: async () => {},
    });
    const onApply = vi.fn();
    const { container } = render(createElement(StudioBackgroundPanel, {
      canvasW: 720, canvasH: 1080, currentBg: "#ffffff", onApply,
      acquireUiPreferences: async () => repository,
    }));
    const panel = container.querySelector<HTMLElement>(entry.contentSelector!);
    expect(panel).not.toBeNull();
    for (const marker of entry.expectVisible) {
      expect(within(panel!).getByText(marker, { exact: true }).isConnected).toBe(true);
    }
    const preset = panel!.querySelector<HTMLButtonElement>('[data-studio-bg-preset="s-white"]');
    expect(preset).not.toBeNull();
    fireEvent.click(preset!);
    expect(onApply).toHaveBeenCalledWith({ kind: "solid", color: "#ffffff", presetId: "s-white" });
  });

  it("pins the eight saved defaults independently of rendered core tools", () => {
    expect(defaultStudioAppSettings().toolbar.visibleIds).toEqual([
      "select", "pen", "eraser", "fill", "marquee-rect", "smart-shape", "text", "image",
    ]);
  });
});


function betaNoticePageFixture(options?: { clickRejects?: boolean }) {
  const acknowledgeClick = vi.fn(async () => {
    if (options?.clickRejects) throw new Error("runner click did not settle");
  });
  const acknowledgeDispatch = vi.fn(async () => undefined);
  const noticeWaitFor = vi.fn(async ({ state, timeout }: { state: string; timeout: number }) => {
    if (options?.clickRejects && state === "hidden" && timeout === 750) {
      throw new Error("notice is still visible");
    }
  });
  const notice = {
    locator: vi.fn(() => ({ click: acknowledgeClick, dispatchEvent: acknowledgeDispatch })),
    waitFor: noticeWaitFor,
  };
  const optionalOverlay = {
    first: () => ({ isVisible: vi.fn(async () => false), click: vi.fn(async () => undefined) }),
  };
  const keyboardPress = vi.fn(async () => undefined);
  const page = {
    locator: vi.fn(() => notice),
    getByRole: vi.fn(() => optionalOverlay),
    waitForTimeout: vi.fn(async () => undefined),
    keyboard: { press: keyboardPress },
  };
  return { acknowledgeClick, acknowledgeDispatch, keyboardPress, notice, noticeWaitFor, page };
}

it("dismisses the late empty-canvas welcome before using the intentionally hidden view launcher", async () => {
  const click = vi.fn(async () => undefined);
  const waitFor = vi.fn(async () => undefined);
  const getByRole = vi.fn(() => ({ click }));
  const welcome = { isVisible: vi.fn(async () => true), getByRole, waitFor };
  const page = { locator: vi.fn(() => welcome) };

  await expect(dismissCinematicCanvasWelcome(
    page as unknown as import("playwright").Page,
  )).resolves.toBe(true);

  expect(page.locator).toHaveBeenCalledWith('[data-studio-cinematic-canvas-welcome="true"]');
  expect(getByRole).toHaveBeenCalledWith("button", { name: "시작 안내 닫기", exact: true });
  expect(click).toHaveBeenCalledWith({ timeout: 5_000 });
  expect(waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 5_000 });
});

it("acknowledges the blocking Studio beta notice before menu interactions", async () => {
  const fixture = betaNoticePageFixture();

  await dismissOverlays(fixture.page as unknown as import("playwright").Page);

  expect(fixture.page.locator).toHaveBeenCalledWith('[data-studio-beta-notice="true"]');
  expect(fixture.noticeWaitFor).toHaveBeenNthCalledWith(1, { state: "visible", timeout: 10_000 });
  expect(fixture.notice.locator).toHaveBeenCalledWith(
    '[data-studio-beta-notice-acknowledge="true"]',
  );
  expect(fixture.acknowledgeClick).toHaveBeenCalledWith({ timeout: 30_000, noWaitAfter: true });
  expect(fixture.acknowledgeDispatch).not.toHaveBeenCalled();
  expect(fixture.noticeWaitFor).toHaveBeenNthCalledWith(2, { state: "hidden", timeout: 30_000 });
  expect(fixture.acknowledgeClick.mock.invocationCallOrder[0]).toBeLessThan(
    fixture.keyboardPress.mock.invocationCallOrder[0]!,
  );
});

it("falls back to the acknowledgement event when a loaded CI runner cannot settle the pointer click", async () => {
  const fixture = betaNoticePageFixture({ clickRejects: true });

  await dismissOverlays(fixture.page as unknown as import("playwright").Page);

  expect(fixture.acknowledgeClick).toHaveBeenCalledWith({ timeout: 30_000, noWaitAfter: true });
  expect(fixture.noticeWaitFor).toHaveBeenNthCalledWith(2, { state: "hidden", timeout: 750 });
  expect(fixture.acknowledgeDispatch).toHaveBeenCalledWith("click");
  expect(fixture.noticeWaitFor).toHaveBeenNthCalledWith(3, { state: "hidden", timeout: 30_000 });
  expect(fixture.acknowledgeDispatch.mock.invocationCallOrder[0]).toBeLessThan(
    fixture.keyboardPress.mock.invocationCallOrder[0]!,
  );
});


it("pins the localized image action rather than a retired hidden caption", () => {
  expect(STUDIO_RAIL_TOOL_CATALOG.find((tool) => tool.id === IMAGE_RAIL_ENTRY.id)?.label).toBe(IMAGE_RAIL_ENTRY.label);
});

it("closes persistent Quick Access explicitly without clicking canvas coordinates", async () => {
  const click = vi.fn(async () => undefined);
  const waitFor = vi.fn(async () => undefined);
  const getByRole = vi.fn(() => ({ click }));
  const page = { keyboard: { press: vi.fn(async () => undefined) }, waitForTimeout: vi.fn(async () => undefined),
    mouse: { click: vi.fn() }, locator: vi.fn(() => ({ isVisible: async () => true, getByRole, waitFor })) };
  await closeFloatingUi(page as unknown as import("playwright").Page);
  expect(getByRole).toHaveBeenCalledWith("button", { name: QUICK_ACCESS_CLOSE_LABEL, exact: true });
  expect(click).toHaveBeenCalledOnce();
  expect(waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 5000 });
  expect(page.mouse.click).not.toHaveBeenCalled();
});


describe("긴 세로 캔버스를 다시 그리는 단계의 대기 계약", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  type PlaywrightPage = import("playwright").Page;
  type PlaywrightLocator = import("playwright").Locator;

  /** 시계는 직접 정한다: `elapsed` 가 타이머 주기(40ms)보다 훨씬 크면 그 사이 메인 스레드가 막혀 있었던 것이다. */
  function quietHarness(options?: Parameters<typeof waitForRendererQuiet>[1]) {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const page = {
      evaluate: async (callback: (argument: unknown) => unknown, argument: unknown) => callback(argument),
    };
    const result = waitForRendererQuiet(page as unknown as PlaywrightPage, options);
    let settled: boolean | undefined;
    void result.then((value) => { settled = value; });
    const tick = async (elapsed = 40) => {
      now += elapsed;
      await vi.advanceTimersByTimeAsync(40);
    };
    return { result, settled: () => settled, tick };
  }

  it("막힘 없이 quietMs 동안 돌면 잠잠해진 것으로 돌아온다", async () => {
    const { result, settled, tick } = quietHarness({ quietMs: 1_000, timeoutMs: 10_000 });
    for (let index = 0; index < 24; index += 1) await tick();
    expect(settled()).toBeUndefined();
    await tick();
    await expect(result).resolves.toBe(true);
  });

  it("중간에 메인 스레드가 막히면 그 막힘이 끝난 시점부터 quietMs 를 다시 센다", async () => {
    const { result, settled, tick } = quietHarness({ quietMs: 1_000, timeoutMs: 60_000 });
    for (let index = 0; index < 10; index += 1) await tick();
    await tick(2_000);
    for (let index = 0; index < 24; index += 1) await tick();
    expect(settled()).toBeUndefined();
    await tick();
    await expect(result).resolves.toBe(true);
  });

  it("한도까지 계속 막혀 있으면 던지지 않고 false 로 돌아간다", async () => {
    const { result, tick } = quietHarness({ quietMs: 1_000, timeoutMs: 500 });
    for (let index = 0; index < 3; index += 1) await tick(200);
    await expect(result).resolves.toBe(false);
  });

  it("페이지가 한도까지 응답하지 않아도 Node 쪽에서 false 로 돌아가 검증기가 끝없이 멈추지 않는다", async () => {
    vi.useFakeTimers();
    const page = { evaluate: () => new Promise<boolean>(() => undefined) };
    const result = waitForRendererQuiet(page as unknown as PlaywrightPage, { timeoutMs: 1_000 });
    let settled: boolean | undefined;
    void result.then((value) => { settled = value; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBe(false);
  });

  it("메뉴 클릭은 항목을 짧게 확인하고 입력만 보낸 뒤 클릭 예산을 재렌더 시간에 맞춰 짧게 잠잠해지기를 기다린다", async () => {
    const calls: string[] = [];
    let quietTimeoutMs = 0;
    const waitFor = vi.fn(async () => { calls.push("appear"); });
    const click = vi.fn(async () => { calls.push("click"); });
    const evaluate = vi.fn(async (_callback: unknown, argument: { timeout: number }) => {
      calls.push("quiet");
      quietTimeoutMs = argument.timeout;
      return true;
    });
    await clickAndWaitForRenderer(
      { evaluate } as unknown as PlaywrightPage,
      { waitFor, click } as unknown as PlaywrightLocator,
    );

    // 기본 click 은 입력 뒤 렌더러 왕복까지 같은 예산에서 기다려, 수 초짜리 재렌더가 4초 클릭 예산을 소진한다.
    expect(STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: expect.any(Number) });
    expect(click).toHaveBeenCalledWith({ timeout: STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS, noWaitAfter: true });
    expect(calls).toEqual(["appear", "click", "quiet"]);
    // 잠잠해짐 대기는 8000px대 문서를 다시 그리는 단계보다 짧은 상한을 쓴다: 계속 바쁜 러너에서 메뉴마다 1분씩 쓰지 않는다.
    expect(quietTimeoutMs).toBeGreaterThan(0);
    expect(quietTimeoutMs).toBeLessThan(STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS);
  });

  it("플랫폼 규격 행은 입력 전달만 확인하고 결과와 잠잠해짐을 같은 예산으로 기다린다", async () => {
    const calls: string[] = [];
    const waitFor = vi.fn(async () => { calls.push("appear"); });
    const click = vi.fn(async () => { calls.push("click"); });
    const waitForFunction = vi.fn(async () => { calls.push("outcome"); });
    const evaluate = vi.fn(async () => { calls.push("quiet"); return true; });
    await selectCanvasResizeRow(
      { waitForFunction, evaluate } as unknown as PlaywrightPage,
      { waitFor, click } as unknown as PlaywrightLocator,
      8_348,
      CANVAS_RESIZE_AUTHORITY_MESSAGE,
    );

    expect(click).toHaveBeenCalledWith({ timeout: STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS, noWaitAfter: true });
    expect(waitForFunction).toHaveBeenCalledWith(
      expect.any(Function), { height: 8_348, message: CANVAS_RESIZE_AUTHORITY_MESSAGE },
      { timeout: STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS },
    );
    expect(calls).toEqual(["appear", "click", "outcome", "quiet"]);
  });

  it("눌러야 할 항목이 없으면 느린 입력 확인 예산을 쓰지 않고 짧은 대기 뒤에 던진다", async () => {
    const missing = new Error("locator.waitFor: Timeout 15000ms exceeded.");
    const waitFor = vi.fn(async () => { throw missing; });
    const click = vi.fn(async () => undefined);
    const evaluate = vi.fn(async () => true);
    const page = { evaluate, waitForFunction: vi.fn(async () => undefined) } as unknown as PlaywrightPage;
    const row = { waitFor, click } as unknown as PlaywrightLocator;

    await expect(clickAndWaitForRenderer(page, row)).rejects.toBe(missing);
    await expect(selectCanvasResizeRow(page, row, 8_348, CANVAS_RESIZE_AUTHORITY_MESSAGE)).rejects.toBe(missing);

    // 항목의 유무는 렌더 비용과 무관하다: 60초 입력 확인 예산이 아니라 짧은 예산으로 기다리고, 없으면 누르지도 않는다.
    // (항목 이름이 바뀐 날 CI 가 항목마다 1분씩 멈추지 않고, 실패 문구가 어떤 항목을 못 찾았는지 그대로 말한다.)
    expect(waitFor).toHaveBeenCalledTimes(2);
    for (const [options] of waitFor.mock.calls as unknown as [{ timeout: number }][]) {
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThan(STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS);
    }
    expect(click).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("결과가 끝내 없어도 던지지 않고 호출자가 높이·안내·URL 로 판정하게 남긴다", async () => {
    const waitForFunction = vi.fn(async () => { throw new Error("Timeout 60000ms exceeded"); });
    const evaluate = vi.fn(async () => false);
    await expect(selectCanvasResizeRow(
      { waitForFunction, evaluate } as unknown as PlaywrightPage,
      { waitFor: vi.fn(async () => undefined), click: vi.fn(async () => undefined) } as unknown as PlaywrightLocator,
      8_000,
      CANVAS_RESIZE_AUTHORITY_MESSAGE,
    )).resolves.toBeUndefined();
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("결과 조건은 목표 높이 표시 또는 정본 거절 안내 둘 중 하나만 인정한다", async () => {
    const waitForFunction = vi.fn(async () => undefined);
    await selectCanvasResizeRow(
      { waitForFunction, evaluate: vi.fn(async () => true) } as unknown as PlaywrightPage,
      { waitFor: vi.fn(async () => undefined), click: vi.fn(async () => undefined) } as unknown as PlaywrightLocator,
      8_348,
      CANVAS_RESIZE_AUTHORITY_MESSAGE,
    );
    const [predicate, argument] = waitForFunction.mock.calls[0] as unknown as [
      (input: { height: number; message: string }) => boolean, { height: number; message: string },
    ];
    expect(predicate(argument)).toBe(false);
    document.body.innerHTML = '<span aria-label="높이 8000px">8000</span>';
    expect(predicate(argument)).toBe(false);
    document.body.innerHTML = '<span aria-label="높이 8348px">8348</span>';
    expect(predicate(argument)).toBe(true);
    document.body.innerHTML = `<div role="alert">${CANVAS_RESIZE_AUTHORITY_MESSAGE}</div>`;
    expect(predicate(argument)).toBe(true);
    document.body.innerHTML = '<div role="alert">다른 안내</div>';
    expect(predicate(argument)).toBe(false);
  });

  it("문서를 8000px대로 바꾸는 플랫폼 규격 단계는 검증기의 마지막 단계다", () => {
    // 이 단계 뒤에는 문서가 8348px 로 남아, 이어지는 모든 입력이 수 초짜리 재그리기에 밀려 4초 예산을 넘긴다.
    // 실행 위치(cwd)와 무관하게 이 시험 파일 옆의 검증기 원문을 읽는다.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "verify-studio-menus.mts"), "utf8");
    const steps = [...source.matchAll(/^\s*\.\.\.\(await (assert\w+)\(/gmu)].map((match) => match[1]);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.filter((step) => step === "assertCurrentCanvasPlatformResize")).toHaveLength(1);
    expect(steps.at(-1)).toBe("assertCurrentCanvasPlatformResize");
  });
});
