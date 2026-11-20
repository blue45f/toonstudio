import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 열린 편집기에서 점검하는 대표 패널의 열기·닫기 절차.
 * 데스크톱(1440×900)과 모바일(390×844)은 화면 구성이 달라서 목록을 따로 둔다.
 * 각 단계는 사용자가 실제로 하는 조작(클릭·단축키)으로 열고, 닫는 표면이 사라질 때까지 기다린 뒤 끝난다.
 */

export interface PanelStep {
  readonly id: string;
  /** 점검 결과에 붙는 이름. */
  readonly label: string;
  readonly open: (page: Page) => Promise<void>;
  readonly close: (page: Page) => Promise<void>;
}

/** 열린 동안 보이는 떠 있는 창(소재·말풍선 등). */
export function toolPopover(page: Page, id: string): Locator {
  return page.locator(`[data-studio-tool-popover="${id}"]`);
}

function clarityRail(page: Page): Locator {
  return page.locator("nav.studio-drawing-clarity-rail");
}

function inspector(page: Page): Locator {
  return page.locator("#studio-inspector");
}

/** 데스크톱 기본 드로잉 셸에서 레이어·속성 패널이 닫혀 있으면 좌측 레일에서 연다. */
export async function ensureDesktopInspectorOpen(page: Page): Promise<void> {
  if (await inspector(page).isVisible()) return;
  await clarityRail(page).getByRole("button", { name: "레이어", exact: true }).click();
  await expect(inspector(page)).toBeVisible();
  await waitForNoBusySurface(page);
}

/** 데스크톱 기본 드로잉 셸에서 펜·브러시 작업대가 닫혀 있으면 옵션 바에서 연다. */
export async function ensureDesktopBrushPanelOpen(page: Page): Promise<void> {
  const pane = page.locator("#studio-drawing-clarity-panel-brush");
  if (!(await pane.isVisible())) {
    await page.locator(".studio-drawing-clarity-context-row .studio-drawing-stepper-readout").first().click();
    await expect(pane).toBeVisible();
  }
  await expect(pane.locator("[data-studio-brush-kind-badge]").first()).toBeVisible({ timeout: 20_000 });
  await waitForNoBusySurface(page);
}

/** 작업 패널 맨 위의 탭(선택 항목·페이지). 페이지 탭 안쪽에도 같은 이름의 하위 탭이 있어 tablist 로 한정한다. */
function inspectorTab(page: Page, name: string): Locator {
  return inspector(page).getByRole("tablist", { name: "스튜디오 설정" }).getByRole("tab", { name, exact: true });
}

/** 지연 로딩 조각(aria-busy)이 끝날 때까지 기다린다. 패널 안의 늦은 렌더가 점검 도중 DOM 을 바꾸지 않게 한다. */
export async function waitForNoBusySurface(page: Page): Promise<void> {
  await expect
    .poll(() => page.locator('[aria-busy="true"], [data-studio-lazy-surface]').count(), {
      timeout: 30_000,
      message: "패널 안의 지연 로딩이 끝나지 않았어요",
    })
    .toBe(0);
}

/**
 * 내용을 처음 고치면 첫 저장이 끝난 뒤 "게시 준비 제안" 카드가 작업 패널 머리글 위에 뜬다(비모달, 한 번만).
 * 뜨는 시각이 저장 시점에 달려 있어서, 점검이 카드의 유무에 따라 흔들리지 않게 뜰 때까지 잠깐 기다렸다가 닫는다.
 * 끝내 뜨지 않으면(저장이 늦거나 이미 기억됨) 그대로 진행한다.
 */
export async function dismissFirstPublishSuggestion(page: Page): Promise<void> {
  const card = page.locator('[data-studio-first-publish-suggestion="true"]');
  const shown = await card.waitFor({ state: "visible", timeout: 8_000 }).then(() => true, () => false);
  if (!shown) return;
  await card.getByRole("button", { name: "게시 준비 제안 닫기" }).click();
  await expect(card).toBeHidden();
}

async function closeWithEscape(page: Page, surface: Locator): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(surface).toBeHidden();
}

const START_DOCK = '[data-studio-cinematic-canvas-welcome="true"]';

export const DESKTOP_PANEL_STEPS: readonly PanelStep[] = [
  {
    id: "first-run",
    label: "첫 화면 — 빈 캔버스 시작 도크가 펼쳐진 편집기",
    open: async (page) => {
      await expect(page.locator(START_DOCK)).toBeVisible();
    },
    close: async (page) => {
      const dock = page.locator(START_DOCK);
      await dock.getByRole("button", { name: "시작 안내 닫기" }).click();
      await expect(dock).toBeHidden();
    },
  },
  {
    id: "assets",
    label: "소재 — 템플릿·에셋 창",
    open: async (page) => {
      await page.locator('[data-studio-main-menu-trigger="view-help"]').click();
      await page.locator('[data-studio-menu-item-id="template"]').click();
      await expect(toolPopover(page, "asset-group")).toBeVisible();
      await waitForNoBusySurface(page);
    },
    close: async (page) => closeWithEscape(page, toolPopover(page, "asset-group")),
  },
  {
    id: "bubbles",
    label: "말풍선 창",
    open: async (page) => {
      await clarityRail(page).locator('[data-studio-rail-tool-id="bubble"]').click();
      await expect(toolPopover(page, "bubble-menu")).toBeVisible();
      await waitForNoBusySurface(page);
    },
    close: async (page) => closeWithEscape(page, toolPopover(page, "bubble-menu")),
  },
  {
    id: "brush-panel",
    label: "브러시 — 펜·브러시 작업대",
    open: async (page) => {
      await ensureDesktopBrushPanelOpen(page);
      await expect(page.locator("#studio-drawing-clarity-panel-brush")).toBeVisible();
    },
    close: async (page) => closeWithEscape(page, page.locator("#studio-drawing-clarity-panel-brush")),
  },
  {
    id: "layers",
    label: "레이어 — 작업 패널의 레이어 탐색기",
    open: async (page) => {
      await ensureDesktopInspectorOpen(page);
      await expect(inspector(page).getByRole("tabpanel", { name: "레이어", exact: true })).toBeVisible();
      await waitForNoBusySurface(page);
    },
    close: async () => undefined,
  },
  {
    id: "layer-filter",
    label: "레이어 — 필터 팝업",
    open: async (page) => {
      await ensureDesktopInspectorOpen(page);
      await inspector(page).getByRole("button", { name: "필터", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "레이어 필터" })).toBeVisible();
    },
    close: async (page) => closeWithEscape(page, page.getByRole("dialog", { name: "레이어 필터" })),
  },
  {
    id: "pages",
    label: "페이지 — 작업 패널의 페이지 탭",
    open: async (page) => {
      await ensureDesktopInspectorOpen(page);
      await inspectorTab(page, "페이지").click();
      await expect(inspectorTab(page, "페이지")).toHaveAttribute("aria-selected", "true");
      await waitForNoBusySurface(page);
    },
    close: async (page) => {
      await inspectorTab(page, "선택 항목").click();
      await expect(inspectorTab(page, "선택 항목")).toHaveAttribute("aria-selected", "true");
    },
  },
  {
    id: "command-search",
    label: "기능·설정 찾기 — 모달 대화상자",
    open: async (page) => {
      await ensureDesktopInspectorOpen(page);
      await inspector(page).getByRole("button", { name: /^기능·설정 찾기/u }).first().click();
      await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
      await waitForNoBusySurface(page);
    },
    close: async (page) => closeWithEscape(page, page.locator('[role="dialog"][aria-modal="true"]')),
  },
  {
    id: "file-menu",
    label: "파일 메뉴",
    open: async (page) => {
      await page.locator('[data-studio-main-menu-trigger="file"]').click();
      await expect(page.getByRole("menu", { name: "파일" })).toBeVisible();
    },
    close: async (page) => closeWithEscape(page, page.getByRole("menu", { name: "파일" })),
  },
  {
    id: "properties",
    label: "속성 — 텍스트를 고른 작업 패널(선택 동작 줄 포함)",
    open: async (page) => {
      await page.locator('[data-studio-main-menu-trigger="webtoon-lettering"]').click();
      await page.locator('[data-studio-menu-item-id="text"]').click();
      await ensureDesktopInspectorOpen(page);
      await expect(inspector(page).getByRole("spinbutton", { name: "불투명도" })).toBeVisible();
      await dismissFirstPublishSuggestion(page);
      await waitForNoBusySurface(page);
    },
    close: async () => undefined,
  },
];

const MOBILE_SHEET = (name: string): string => `[data-studio-mobile-sheet="${name}"]:not([aria-hidden="true"])`;

async function openMobileMoreDialog(page: Page): Promise<void> {
  await page.locator('[data-studio-clarity-more-trigger="true"]').first().click();
  await expect(page.getByRole("dialog", { name: "원고 도구" })).toBeVisible();
}

export const MOBILE_PANEL_STEPS: readonly PanelStep[] = [
  {
    id: "first-run",
    label: "첫 화면 — 모바일 캔버스와 편집기 크롬",
    open: async (page) => {
      await expect(page.locator("#studio-menubar")).toBeVisible();
      await expect(page.locator("#studio-canvas-workspace")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "스튜디오 모바일 도구막대" })).toBeVisible();
    },
    close: async (page) => {
      const dock = page.locator(START_DOCK);
      if (await dock.isVisible()) {
        await dock.getByRole("button", { name: "시작 안내 닫기" }).click();
        await expect(dock).toBeHidden();
      }
    },
  },
  {
    id: "work-menu",
    label: "원고 도구 시트(더보기)",
    open: openMobileMoreDialog,
    close: async (page) => closeWithEscape(page, page.getByRole("dialog", { name: "원고 도구" })),
  },
  {
    id: "device-guide",
    label: "기기 안내 — 가능한 작업과 제한 상세",
    open: async (page) => {
      await openMobileMoreDialog(page);
      await page.locator('[data-drawing-task-category="workspace"]').click();
      await page.getByRole("button", { name: "이 기기에서 할 수 있는 작업", exact: true }).click();
      const notice = page.getByRole("complementary", { name: "모바일 편집 안내" });
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute("data-studio-mobile-notice-expanded", "true");
      await expect(notice.getByRole("heading", { name: "지금 할 수 있어요", exact: true })).toBeVisible();
      await expect(notice.getByRole("heading", { name: "이 기기에서는 안 돼요", exact: true })).toBeVisible();
    },
    close: async (page) => {
      const notice = page.locator('[data-testid="mobile-full-edit-notice"]');
      await notice.getByRole("button", { name: "모바일 편집 안내 닫기", exact: true }).click();
      await expect(notice).toHaveAttribute("data-studio-mobile-notice-compact", "true");
      await expect(notice).toBeHidden();
      await expect(page.locator('[data-studio-clarity-more-trigger="true"]').first()).toBeFocused();
    },
  },
  {
    id: "colors",
    label: "브러시 색상 시트",
    open: async (page) => {
      await page.getByRole("button", { name: "브러시 색상", exact: true }).first().click();
      await expect(page.locator(MOBILE_SHEET("colors"))).toBeVisible();
    },
    close: async (page) => closeWithEscape(page, page.locator(MOBILE_SHEET("colors"))),
  },
  {
    id: "inspector",
    label: "레이어·속성 — 작업 패널 시트",
    open: async (page) => {
      await page.getByRole("button", { name: "레이어 열기", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "작업 패널" })).toBeVisible();
      await waitForNoBusySurface(page);
    },
    close: async (page) => closeWithEscape(page, page.getByRole("dialog", { name: "작업 패널" })),
  },
];
