import { GUEST_SESSION_KEY } from "../apps/web/src/domains/auth/public/session/guest-session";
import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";
import { STUDIO_START_GATEWAY_HREF } from "../apps/web/src/domains/creator/studio-start-entry";
import { WORKSPACE_TOUR_STORAGE_KEY } from "../apps/web/src/domains/creator/workspace/studio-workspace-tour-state";
import { CREATOR_EXPERIENCE_STORAGE_KEY } from "../apps/web/src/shared/lib/creator-experience-mode";
import { assertStudioWorkspaceHome } from "../scripts/lib/studio-workspace-browser-contract.mjs";

import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

import type { Page } from "@playwright/test";

const THEME_STORAGE_KEY = "toonstudio-theme";
const CREATOR_INTENT_DESTINATIONS = [
  "/story-lab",
  "/studio/new",
  "/studio/bg3d",
  "/studio/assets",
  "/production",
  "/studio/publish",
];

/**
 * 작업 홈(/home)은 로그인하지 않았고 게스트도 아니면 환영 게이트를 먼저 보여 준다.
 * 홈의 실제 내비게이션·상태 바를 검증하는 테스트는 의도적으로 고른 게스트 신원을 심고 시작한다.
 */
async function seedGuestSession(page: Page) {
  await page.addInitScript(({ key, tourKey }) => {
    localStorage.setItem(key, JSON.stringify({ id: "guest_e2e-creator-flagship", createdAt: Date.now() }));
    // 첫 방문 스포트라이트 투어는 활성인 동안 포커스를 카드로 옮기는 것이 설계다(전용 단위 테스트가 검증).
    // 이 테스트는 닫은 패널이 호출 버튼으로 포커스를 돌려주는 계약을 보므로 투어를 완료 상태로 둔다.
    localStorage.setItem(tourKey, "done");
  }, { key: GUEST_SESSION_KEY, tourKey: WORKSPACE_TOUR_STORAGE_KEY });
}

/** 사이트 공통 컨트롤 높이 바닥이 데스크톱 값(2.5rem)으로 바뀌는 폭(sitewide-visual-ux.css). 그 아래가 44px 터치 영역 계약의 대상이다. */
const DESKTOP_CONTROL_FLOOR_WIDTH = 768;

/**
 * 작업 우선 진입(/studio 로비)이 좁은 화면과 노트북 폭에서 잘리거나 쪼개져 읽기 어려운 곳을 실제 치수로 모은다.
 * 입력칸의 고유 폭이 히어로 열을 넓혀 오른쪽 조작이 카드 밖으로 잘렸던 결함과, 빠른 시작 카드의 글 열이 좁아
 * 제목이 글자 단위로 쪼개졌던 결함을 그대로 잡는다.
 * (가시성만 보는 toBeVisible 은 조상의 overflow 로 잘린 요소도 "보임"으로 판정하므로 경계를 직접 비교한다.)
 * 라이브러리가 늦게 채워져 밀도(full/compact)가 바뀌는 순간을 재지 않도록 호출부가 문제 목록이 빌 때까지 다시 잰다.
 */
async function collectStudioLobbyProblems(page: Page, width: number): Promise<string[]> {
  const lobby = page.locator('[data-studio-creator-lobby="true"]');
  const frame = await lobby.boundingBox();
  if (!frame) return ["로비 경계를 측정하지 못했습니다."];
  const problems: string[] = [];
  if (frame.x < -1) problems.push("로비가 왼쪽으로 넘칩니다.");
  if (frame.x + frame.width > width + 1) problems.push("로비가 화면 오른쪽으로 넘칩니다.");

  // 로비 안의 모든 조작 요소(링크·버튼·입력)는 로비 경계 안에 있고, 휴대폰·태블릿 세로 폭에서는 44px 이상의 터치 영역을 가진다.
  const controls = await lobby.locator("a:visible, button:visible, input:visible").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const label = node.getAttribute("aria-label") ?? node.getAttribute("placeholder") ?? node.textContent ?? "";
    return { label: label.trim().slice(0, 30), left: rect.left, right: rect.right, height: rect.height };
  }));
  if (controls.length <= 10) problems.push(`조작 요소가 ${controls.length}개뿐입니다(로비가 다 그려지지 않았습니다).`);
  for (const control of controls) {
    if (control.left < frame.x - 1) problems.push(`${control.label}: 왼쪽 경계 밖으로 잘렸습니다.`);
    if (control.right > frame.x + frame.width + 1) problems.push(`${control.label}: 오른쪽 경계 밖으로 잘렸습니다.`);
    if (width < DESKTOP_CONTROL_FLOOR_WIDTH && control.height < 43.5) {
      problems.push(`${control.label}: 터치 영역이 44px 미만입니다(${Math.round(control.height)}px).`);
    }
  }

  // 빠른 시작 카드 제목은 어절 단위로 두 줄 안에서 읽혀야 한다(글 열이 좁아 세로로 쪼개지면 안 된다).
  // 줄 수만으로는 "스튜디오"가 "스튜디/오"로 끊긴 두 줄짜리를 놓치므로 어절마다 글자 범위가 한 줄에 놓였는지도 잰다.
  const titles = await lobby.locator(".studio-lobby-quick__copy strong").evaluateAll((nodes) => nodes.map((node) => {
    const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
    const brokenWords: string[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      for (const match of (text.textContent ?? "").matchAll(/\S+/gu)) {
        const start = match.index;
        if (start === undefined) continue;
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + match[0].length);
        const rows = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)));
        if (rows.size > 1) brokenWords.push(match[0]);
      }
    }
    return {
      title: node.textContent ?? "",
      lines: Math.round(node.getBoundingClientRect().height / (Number.isFinite(lineHeight) ? lineHeight : 18)),
      brokenWords,
    };
  }));
  if (titles.length === 0) problems.push("빠른 시작 카드가 없습니다.");
  for (const { title, lines, brokenWords } of titles) {
    if (lines > 2) problems.push(`${title}: 제목이 ${lines}줄로 쪼개졌습니다.`);
    if (brokenWords.length > 0) problems.push(`${title}: 어절이 줄 중간에서 끊겼습니다(${brokenWords.join(", ")}).`);
  }
  return problems;
}

function themeEnvelope() {
  return JSON.stringify({
    state: { preference: "light", studioPreference: "inherit", theme: "light" },
    version: 0,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({
    language,
    themeKey,
    theme,
    creatorExperienceKey,
    betaNoticeKey,
    betaNoticeRevision,
  }) => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: language }, version: 0 }));
    localStorage.setItem(themeKey, theme);
    localStorage.setItem(creatorExperienceKey, JSON.stringify({ mode: "classic" }));
    localStorage.setItem(betaNoticeKey, betaNoticeRevision);
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  }, {
    language: "ko",
    themeKey: THEME_STORAGE_KEY,
    theme: themeEnvelope(),
    creatorExperienceKey: CREATOR_EXPERIENCE_STORAGE_KEY,
    betaNoticeKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
    betaNoticeRevision: STUDIO_BETA_NOTICE_REVISION,
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline fixture" } });
  });
});

for (const width of [320, 390, 820, 1440]) {
  test(`studio-first home keeps real navigation and accessible controls at ${width}px`, async ({ page }, testInfo) => {
    await seedGuestSession(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await assertStudioWorkspaceHome(page);
    await capturePageEvidence(page, testInfo, `studio-workspace-${width}`);
  });
}

for (const width of [320, 390, 820, 1440]) {
  test(`studio introduction stays readable and unclipped at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/about/studio", { waitUntil: "domcontentloaded" });
    const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');
    const primaryAction = home.locator('.cf-hero a[href="/studio/new"]');

    await expect(home).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("기획부터 연재까지, 웹툰 제작의 모든 것을 한곳에서.");
    await expect(home.locator('.cf-hero a[href="/studio"]')).toBeVisible();
    await expect(primaryAction).toBeVisible();
    // 소개는 탭 없이 한 번에 읽히는 서사다. 둘러보기 예시 편집기는 서사 아래에 바로 놓인다.
    await expect(page.getByRole("tablist")).toHaveCount(0);
    const tour = home.locator("#creator-tour");
    await tour.scrollIntoViewIfNeeded();
    await expect(tour.locator(".isw")).toBeVisible();
    await expect(tour.getByRole("group", { name: "작업실 영역 고르기" }).getByRole("button")).toHaveCount(5);

    // '바로 시작' 섹션: 시작 선택기가 모든 시작점으로 이어진다.
    const intentCards = home.locator("#creator-start .cf-intent-visual-nav a");
    await expect(intentCards).toHaveCount(CREATOR_INTENT_DESTINATIONS.length);
    expect(await intentCards.evaluateAll((links) => links.map((link) => link.getAttribute("href"))))
      .toEqual(CREATOR_INTENT_DESTINATIONS);
    await intentCards.first().focus();
    await expect(intentCards.first()).toBeFocused();

    // 소개 흐름의 이전·다음.
    await expect(home.locator('a[rel="prev"][href="/about"]')).toBeVisible();
    await expect(home.locator('a[rel="next"][href="/about/workflow"]')).toBeVisible();

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);

    if (width <= 820) {
      const actionBox = await primaryAction.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // 지연 로드된 알림·인증 컨트롤이 나타나도 작은 화면의 헤더 액션이 잘리지 않아야 한다.
    await page.getByRole("link", { name: "알림 센터", exact: true }).first().waitFor({ state: "visible" });
    const header = page.locator('[data-site-chrome="header"]');
    const headerActions = header.locator(':scope > div').first().locator('button:visible, a:visible');
    for (const action of await headerActions.all()) {
      const box = await action.boundingBox();
      if (!box) continue;
      expect(box.x, "헤더 액션이 왼쪽으로 넘치면 안 됩니다.").toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, "헤더 액션이 오른쪽으로 넘치면 안 됩니다.").toBeLessThanOrEqual(width + 1);
    }
    await capturePageEvidence(page, testInfo, `all-in-one-home-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("task-first search opens the global command palette without losing the query", async ({ page }) => {
  await seedGuestSession(page);
  await page.goto("/home");
  await page.getByRole("button", { name: "작품·도구·메뉴 검색", exact: true }).click();
  const search = page.getByPlaceholder(/작품 제목, 작가, 기능 명령/u);
  await expect(search).toBeVisible();
  await search.fill("비 오는 교실 배경");
  await expect(search).toHaveValue("비 오는 교실 배경");
});

test("the front door exposes planning, 2D, 3D, assets, collaboration and publishing", async ({ page }) => {
  await page.goto("/about/studio");
  const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');

  await expect(home.locator('.cf-hero a[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-hero a[href="/studio"]')).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(home.locator("#creator-start .cf-intent-visual-nav a")).toHaveCount(CREATOR_INTENT_DESTINATIONS.length);
  for (const destination of CREATOR_INTENT_DESTINATIONS) {
    await expect(home.locator(`#creator-start .cf-intent-visual-nav a[href="${destination}"]`)).toBeVisible();
  }
  await expect(home.locator("#creator-support a[href]").first()).toBeVisible();
  await expect(home).not.toContainText("그림은 익숙한 도구에서");
  await expect(home).not.toContainText("기존 드로잉 도구 그대로");
});

test("legacy section links open the matching section without tabs", async ({ page }) => {
  // 탭은 의도적으로 없앴다(소개 서사로 재구성). 예전 섹션 주소(#creator-*)는 막다른 길 없이
  // 해당 섹션 제목으로 이동하고 포커스를 줘야 한다.
  const cases = [
    { hash: "#creator-support", heading: "#creator-support-title" },
    { hash: "#creator-flow", heading: "#creator-process-title" },
    { hash: "#creator-faq-title", heading: "#creator-support-title" },
  ];
  // CI 에서만 간헐적으로 제목이 보이는데도 15초 동안 포커스를 못 받는 실패가 있었다(실패 트레이스에는 "inactive" 만 남는다).
  // 로컬 Chrome·headless shell 에서 CPU 20배·청크·API 지연을 걸어 반복해도 재현되지 않아, 다시 실패하면 원인을 가를 수 있게
  // 포커스 이동과 제목 노드 교체를 기록해 실패 메시지에 붙인다. 판정 기준(제목이 포커스를 받아야 함)은 그대로다.
  await page.addInitScript(() => {
    const log: Array<[number, string, string | number]> = [];
    (window as unknown as { __creatorFocusLog: typeof log }).__creatorFocusLog = log;
    const describe = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}` : String(target);
    };
    for (const type of ["focusin", "focusout"] as const) {
      document.addEventListener(type, (event) => log.push([Math.round(performance.now()), type, describe(event.target)]), true);
    }
    // 같은 id 의 제목 노드가 새로 만들어지면(지연 경로 재마운트) 세대 번호가 올라가 기록에 남는다.
    const seen = new Map<string, { node: Element; generation: number }>();
    new MutationObserver(() => {
      for (const heading of document.querySelectorAll("h2[id^='creator-']")) {
        const known = seen.get(heading.id);
        if (known?.node === heading) continue;
        const generation = (known?.generation ?? 0) + 1;
        seen.set(heading.id, { node: heading, generation });
        log.push([Math.round(performance.now()), "heading-node", `${heading.id}#${generation}`]);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  for (const { hash, heading } of cases) {
    await page.goto(`/about/studio${hash}`, { waitUntil: "domcontentloaded" });
    const title = page.locator(heading);
    await expect(title).toBeVisible();
    try {
      await expect(title).toBeFocused();
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        active: document.activeElement?.tagName.toLowerCase() + (document.activeElement?.id ? `#${document.activeElement.id}` : ""),
        documentHasFocus: document.hasFocus(),
        hash: location.hash,
        dialogs: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
        log: (window as unknown as { __creatorFocusLog: unknown[] }).__creatorFocusLog,
      })).catch((evaluateError: unknown) => ({ evaluateError: String(evaluateError) }));
      throw new Error(`${hash} 이동 뒤 ${heading} 이 포커스를 받지 못했다: ${JSON.stringify(diagnostics)}`, { cause: error });
    }
  }
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

// 320/390 은 휴대폰, 912 는 세로 태블릿(3열 구간), 1024/1280 은 노트북 폭(4열 구간)이다. 7열 그대로면 글 열이 좁아 제목이 쪼개졌다.
for (const width of [320, 390, 912, 1024, 1280]) {
  test(`Studio task-first entry stays readable and unclipped at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/studio", { waitUntil: "domcontentloaded" });

    const library = page.getByRole("region", { name: "작품 관리", exact: true });
    await expect(library).toBeVisible();
    await expect(library.getByRole("heading", { name: "내 작업", exact: true })).toBeVisible();
    // 작업 우선 진입의 주 행동은 로비 히어로의 "새 작품 시작"(작품 시작 정문 /create — 시작 입구 단일화)과 "작업 가져오기"(/studio/import)다.
    // 목록 머리글은 같은 동선을 중복해 두지 않으므로(활성 뷰) 로비의 링크가 유일한 시작점이어야 한다.
    const startNew = library.getByRole("link", { name: "새 작품 시작", exact: true });
    const importWork = library.getByRole("link", { name: "작업 가져오기", exact: true });
    await expect(startNew).toBeVisible();
    await expect(startNew).toHaveAttribute("href", STUDIO_START_GATEWAY_HREF);
    await expect(importWork).toBeVisible();
    await expect(importWork).toHaveAttribute("href", "/studio/import");
    const views = library.getByRole("navigation", { name: "내 작업 보기", exact: true });
    await expect(views.getByRole("link")).toHaveCount(3);
    await expect(library.getByRole("navigation", { name: "저장과 배포", exact: true })).toBeVisible();
    await expect(library.getByLabel("프로젝트 검색", { exact: true })).toBeVisible();
    await expect(page.getByText("클라우드와 동기화됨", { exact: true })).toHaveCount(0);
    await expect(page.getByText("보관·복구·저장은 각 작품의 실제 상태를 기준으로 확인합니다.", { exact: true })).toBeVisible();

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);

    // 문서 폭만으로는 overflow 가 숨겨진 조상 안에서 잘린 조작을 놓치므로 로비 경계와 터치 영역을 직접 잰다.
    await expect.poll(async () => (await collectStudioLobbyProblems(page, width)).join("\n"), {
      message: "작업 우선 진입(로비)이 좁은 화면에서 잘리거나 쪼개졌습니다.",
      timeout: 15_000,
    }).toBe("");

    await capturePageEvidence(page, testInfo, `studio-task-first-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("new project flow explains a disabled start action and preserves the chosen setup", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/studio/new?kind=webtoon&template=webtoon-vertical", { waitUntil: "domcontentloaded" });

  await expect(page.locator('[data-workspace-surface="focused"]')).toBeVisible();
  await expect(page.locator(".workspace-sidebar, .campus-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("site-background-music-player")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "완성할 콘텐츠를 선택하세요", exact: true })).toBeVisible();
  await expect(page.locator('[data-studio-create-format="vertical-webtoon"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "시작 템플릿", exact: true })).toHaveValue("webtoon-vertical");
  await expect(page.locator('[data-studio-format-preview="vertical-webtoon"]')).toBeVisible();
  await expect(page.locator('[data-studio-mode-preview="webtoon"]')).toBeVisible();
  await expect(page.locator('[data-studio-auxiliary-workspaces="true"]')).not.toHaveAttribute("open", "");

  const projectName = page.getByLabel("프로젝트 이름");
  await projectName.fill("");
  const startButton = page.locator('button[aria-describedby*="studio-create-disabled-reason"]');
  await expect(startButton).toBeDisabled();
  await expect(page.getByText("프로젝트 이름을 입력해 주세요.", { exact: true })).toBeVisible();

  await projectName.fill("별빛 식당 1화");
  await expect(startButton).toHaveCount(0);
  await expect(projectName).toHaveValue("별빛 식당 1화");
  await expect(page.getByRole("button", { name: /시작$/u }).last()).toBeEnabled();
  await expect(page.getByText("이 기기에 저장됨", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/작업은 이 기기에 자동 저장됩니다/u)).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(hasNoHorizontalOverflow).toBe(true);
  await capturePageEvidence(page, testInfo, "studio-new-guided-320");
});
