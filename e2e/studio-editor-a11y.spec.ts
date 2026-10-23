import { expect, test, type Page } from "@playwright/test";

import {
  auditAccessibleNames,
  compareTabDirections,
  describeActiveElement,
  expectFocusContained,
  expectOpenCloseRestoresFocus,
  describeAxeSummary,
  isFocusInside,
  openGuestEditor,
  parkPointer,
  reportTabTraversal,
  scanBlockingAxe,
  scanNameRoleAxe,
  summarizeStops,
  walkTabOrder,
  warmUpEditor,
} from "./helpers/studio-editor-a11y";
import {
  DESKTOP_PANEL_STEPS,
  MOBILE_PANEL_STEPS,
  toolPopover,
  type PanelStep,
} from "./helpers/studio-editor-panels";

/**
 * 열린 편집기(로그인 없는 게스트·오프라인 흐름, /studio/canvas)의 접근성 증명.
 *
 * - 대표 패널을 하나씩 열 때마다 axe serious/critical 위반이 0건이다(데스크톱·모바일).
 * - 접근성 트리의 버튼·입력·탭·슬라이더에 이름이 있고 역할 구조가 맞다.
 * - 건너뛰기 링크 → 메뉴바 → 작업 모드 → 도구 → 캔버스 → 작업 패널을 Tab/Shift+Tab 으로 지나도
 *   포커스 함정이 없고 포커스가 보인다.
 * - 메뉴·창·대화상자는 Esc 로 닫히고 포커스가 여는 단추로 돌아온다.
 *
 * 범위 밖: 실제 스크린리더 낭독(미확인), 3D 장면 대화상자(WebGL 엔진이 필요해 별도 점검).
 * 방법·예외·미해결: docs/features/accessibility-stage1.md
 */

test.use({ reducedMotion: "reduce" });

// 콜드 스타트한 개발 서버는 편집기 모듈을 처음 열 때 1~3분을 쓴다. 그 비용이 첫 시험의 제한 시간을 갉아먹지 않게
// 한 번 미리 열어 둔다(이 훅은 시험 제한 시간과 별개로 10분까지 기다린다).
test.beforeAll(async ({ browser }, workerInfo) => {
  test.setTimeout(600_000);
  await warmUpEditor(browser, workerInfo.project.use.baseURL);
});

/** 패널을 차례로 열고 점검을 돌린 뒤 닫는다. 점검 실패는 soft 라서 한 번의 실행이 모든 패널의 결과를 보고한다. */
async function forEachPanel(
  page: Page,
  steps: readonly PanelStep[],
  inspect: (step: PanelStep) => Promise<void>,
): Promise<void> {
  for (const step of steps) {
    await test.step(step.label, async () => {
      await step.open(page);
      await parkPointer(page);
      await inspect(step);
      await step.close(page);
    });
  }
}

async function expectNoBlockingViolations(page: Page, step: PanelStep): Promise<void> {
  const violations = await scanBlockingAxe(page);
  expect.soft(describeAxeSummary(violations), `${step.label}: axe serious/critical 위반`).toEqual([]);
}

async function expectNamesAndRolesAreSound(page: Page, step: PanelStep): Promise<void> {
  const axe = await scanNameRoleAxe(page);
  expect.soft(describeAxeSummary(axe), `${step.label}: 이름·역할·값 axe 규칙 위반`).toEqual([]);
  const tree = await auditAccessibleNames(page);
  expect.soft(tree, `${step.label}: 접근성 트리의 이름·역할 위반`).toEqual([]);
}

const DESKTOP_REGION_ORDER = [
  "skip-links",
  "menubar",
  "work-modes",
  "tool-rail",
  "brush-panel",
  "canvas",
  "inspector",
] as const;

test.describe("열린 편집기 접근성 — 데스크톱 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("대표 패널을 열 때마다 axe serious/critical 위반이 없다", async ({ page }) => {
    await openGuestEditor(page);
    await forEachPanel(page, DESKTOP_PANEL_STEPS, (step) => expectNoBlockingViolations(page, step));
  });

  test("버튼·입력·탭·슬라이더는 접근성 이름이 있고 역할 구조가 맞다", async ({ page }) => {
    await openGuestEditor(page);
    await forEachPanel(page, DESKTOP_PANEL_STEPS, (step) => expectNamesAndRolesAreSound(page, step));
  });

  test("Tab·Shift+Tab 으로 메뉴바·작업 모드·도구·캔버스·작업 패널을 지나도 포커스 함정이 없고 포커스가 보인다", async ({ page }) => {
    await openGuestEditor(page, { dismissStartDock: true });
    const skipLinks = page.getByRole("navigation", { name: "작업 영역 바로가기" });

    const forward = await walkTabOrder(page, {
      start: skipLinks.getByRole("button").first(),
      maxStops: 420,
      until: (stops) => stops.filter((stop) => stop.region === "inspector").length >= 3,
    });
    const forwardReport = reportTabTraversal(forward, { regionOrder: DESKTOP_REGION_ORDER });
    expect(forwardReport.problems, `Tab 순회 문제\n${summarizeStops(forward)}`).toEqual([]);

    const backward = await walkTabOrder(page, {
      start: page.locator(":focus"),
      direction: "backward",
      maxStops: forward.length + 40,
      until: (stops) => stops.some((stop) => stop.region === "skip-links"),
    });
    const backwardReport = reportTabTraversal(backward, { regionOrder: [...DESKTOP_REGION_ORDER].reverse() });
    expect(backwardReport.problems, `Shift+Tab 순회 문제\n${summarizeStops(backward)}`).toEqual([]);

    // 같은 요소끼리 보면 거꾸로 지난 순서는 앞으로 지난 순서를 뒤집은 것이어야 한다(방향에 따라 포커스를 옮기는 코드가 없다).
    // 연결 상태에 따라 켜졌다 꺼지는 단추처럼 한쪽에서만 닿은 요소는 순서 문제가 아니라서 보고서에 적어 두기만 한다.
    const comparison = compareTabDirections(forward, backward);
    expect(comparison.problems, "Tab·Shift+Tab 순서 비대칭").toEqual([]);
    for (const [type, labels] of [["앞으로만 닿은 요소", comparison.onlyForward], ["거꾸로만 닿은 요소", comparison.onlyBackward]] as const) {
      if (labels.length > 0) test.info().annotations.push({ type, description: labels.join(" / ") });
    }
  });

  test("메뉴·창·팝업은 Esc 로 닫히고 포커스가 여는 단추로 돌아온다", async ({ page }) => {
    await openGuestEditor(page, { dismissStartDock: true });
    const menubar = page.locator("#studio-menubar");
    const inspector = page.locator("#studio-inspector");
    const pressEnter = async (): Promise<void> => page.keyboard.press("Enter");

    await expectOpenCloseRestoresFocus(page, {
      label: "파일 메뉴",
      opener: page.locator('[data-studio-main-menu-trigger="file"]'),
      surface: page.getByRole("menu", { name: "파일" }),
      open: pressEnter,
    });
    await expectOpenCloseRestoresFocus(page, {
      label: "소재(템플릿·에셋) 창",
      opener: menubar.getByRole("button", { name: "템플릿·에셋", exact: true }),
      surface: toolPopover(page, "asset-group"),
      open: pressEnter,
    });
    await expectOpenCloseRestoresFocus(page, {
      label: "말풍선 창",
      opener: menubar.getByRole("button", { name: "말풍선", exact: true }),
      surface: toolPopover(page, "bubble-menu"),
      open: pressEnter,
    });
    await expectOpenCloseRestoresFocus(page, {
      label: "작업 내역 패널",
      opener: menubar.getByRole("button", { name: "작업 내역", exact: true }),
      surface: page.getByRole("region", { name: "작업 내역" }),
      open: pressEnter,
    });
    await expectOpenCloseRestoresFocus(page, {
      label: "프로젝트 센터 창",
      opener: menubar.getByRole("button", { name: "프로젝트 센터", exact: true }),
      surface: page.getByRole("dialog", { name: "프로젝트 센터" }),
      open: pressEnter,
    });
    await expectOpenCloseRestoresFocus(page, {
      label: "레이어 필터 팝업",
      opener: inspector.getByRole("button", { name: "필터", exact: true }),
      surface: page.getByRole("dialog", { name: "레이어 필터" }),
      open: pressEnter,
    });

    // 모달: 포커스가 안에 갇히고(Tab·Shift+Tab 이 밖으로 새지 않음) Esc 로 닫으면 여는 단추로 돌아온다.
    const opener = inspector.getByRole("button", { name: /^기능·설정 찾기/u }).first();
    const modal = page.locator('[role="dialog"][aria-modal="true"]');
    await expectOpenCloseRestoresFocus(page, {
      label: "기능·설정 찾기 모달",
      opener,
      surface: modal,
      open: async () => {
        await page.keyboard.press("Enter");
        // 모달은 다음 프레임에 검색 입력으로 포커스를 옮긴다. 그 전에 Tab 을 누르면 여는 단추 다음 요소로 가 버려 판정이 틀린다.
        await expect(modal).toBeVisible();
        await expect.poll(() => isFocusInside(modal), { message: "기능·설정 찾기 모달: 열린 뒤 포커스가 안으로 들어오지 않았어요" }).toBe(true);
        await expectFocusContained(page, modal, 12, "기능·설정 찾기 모달");
      },
    });
    expect(await describeActiveElement(page)).toContain("기능·설정 찾기");
  });
});

test.describe("열린 편집기 접근성 — 모바일 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("대표 시트를 열 때마다 axe serious/critical 위반이 없다", async ({ page }) => {
    await openGuestEditor(page);
    await forEachPanel(page, MOBILE_PANEL_STEPS, (step) => expectNoBlockingViolations(page, step));
  });

  test("시트의 버튼·입력·탭·슬라이더는 접근성 이름이 있고 역할 구조가 맞다", async ({ page }) => {
    await openGuestEditor(page);
    await forEachPanel(page, MOBILE_PANEL_STEPS, (step) => expectNamesAndRolesAreSound(page, step));
  });

  test("시트는 Esc 로 닫히고 포커스가 여는 단추로 돌아온다", async ({ page }) => {
    await openGuestEditor(page, { dismissStartDock: true });
    await page.getByRole("button", { name: "이해했어요", exact: true }).click();
    const workMenu = page.getByRole("button", { name: "작업 메뉴", exact: true }).first();
    await expectOpenCloseRestoresFocus(page, {
      label: "작업 메뉴 시트",
      opener: workMenu,
      surface: page.locator('[data-studio-mobile-sheet="tools"]:not([aria-hidden="true"])'),
      open: async () => page.keyboard.press("Enter"),
    });
    const colors = page.getByRole("button", { name: "브러시 색상", exact: true }).first();
    await expectOpenCloseRestoresFocus(page, {
      label: "브러시 색상 시트",
      opener: colors,
      surface: page.locator('[data-studio-mobile-sheet="colors"]:not([aria-hidden="true"])'),
      open: async () => page.keyboard.press("Enter"),
    });
  });
});
