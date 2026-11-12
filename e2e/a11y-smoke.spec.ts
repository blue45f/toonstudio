import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DESKTOP_A11Y_ROUTES = [
  "/",
  "/discover",
  "/community",
  "/market",
  "/home",
  "/studio",
  "/studio/new",
  "/production",
  "/production/projects",
  "/settings",
] as const;
const MOBILE_A11Y_ROUTES = ["/", "/discover", "/studio", "/studio/new"] as const;
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

// 이 스모크는 진입 연출이 끝난 정지 화면의 색을 잰다. 연출 중간 프레임의 반투명한 색은 사용자가 읽는 상태가 아닌데도
// 임계값 근처의 글자를 위반으로 잡는다. 간헐 실패(홈 `.rd-new-project > span`)의 원인은 확정하지 못했고, 콜드 스타트
// 개발 서버에서 연출이 판정 직전에 다시 시작했을 가능성이 가장 크다. 그래서 움직임 줄이기로 연출 자체를 없애고(앱은
// prefers-reduced-motion 을 존중한다) CI 에서는 한 번 다시 시도한다 — 결정적인 위반은 두 번 다 실패하므로 가려지지
// 않고, 한 번 실패 뒤 통과하면 보고서가 flaky 로 표시하며 첫 시도의 진단(아래 details)을 남긴다.
test.use({ reducedMotion: "reduce" });
test.describe.configure({ retries: process.env.CI ? 1 : 0 });

/** 실패한 노드의 실제 환경: 맨 위 요소, 조상 불투명도, 진행 중인 애니메이션·전환 수. */
async function describeNodeEnvironment(page: Page, target: unknown): Promise<unknown> {
  const selector = Array.isArray(target) ? target.filter((part): part is string => typeof part === "string").join(" ") : "";
  if (!selector) return null;
  return page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!element) return { found: false };
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const fades: string[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const opacity = getComputedStyle(node).opacity;
      if (opacity !== "1") fades.push(`${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}=${opacity}`);
    }
    return {
      found: true,
      rect: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)],
      viewport: [window.innerWidth, window.innerHeight],
      onTop: top === element || Boolean(top && element.contains(top)),
      topElement: top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}` : null,
      ancestorOpacity: fades,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    };
  }, selector).catch(() => null);
}

async function assertNoBlockingViolations(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForFunction(() => {
    const stage = document.querySelector(".route-stage");
    if (!stage) return false;
    const state = stage.getAttribute("data-route-state");
    return state !== null && state !== "pending" && state !== "empty";
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  // 페이지 진입 연출은 0.5~1.1초 동안 내용을 페이드시킨다. 중간 프레임의 반투명한 색으로 대비를 재면
  // 사용자가 읽는 상태가 아닌데도 임계값 근처의 선택 버튼이 실패로 잡혀 판정이 흔들린다.
  // 끝이 정해진 애니메이션이 모두 끝난 뒤의 색으로 판정하고, 무한 반복하는 앰비언트 효과는 기다리지 않는다.
  // 부하가 큰 CI(첫 시험은 콜드 스타트로 1분 넘게 걸린다)에서는 연출이 이 대기 직후에 새로 시작되기도 한다.
  // 그래서 끝이 정해진 애니메이션이 300ms 동안 새로 생기지 않을 때까지 한 번 더 기다린 뒤 잰다(전체 상한 5초).
  await page.evaluate(async () => {
    const deadline = performance.now() + 5_000;
    const pending = () => document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();
      return animation.playState === "running" && Number.isFinite(timing?.iterations ?? 1);
    });
    const untilDeadline = () => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, deadline - performance.now())));
    let quietSince = performance.now();
    while (performance.now() < deadline) {
      const running = pending();
      if (running.length > 0) {
        await Promise.race([Promise.allSettled(running.map((animation) => animation.finished)), untilDeadline()]);
        quietSince = performance.now();
      } else if (performance.now() - quietSince >= 300) {
        break;
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    }
  });

  // Freeze opt-in readable modal motion near its first frame. Contrast must not depend on
  // waiting for an entrance fade to finish before a control becomes readable.
  const readableOpacity = await page.locator('[data-stable-contrast="true"]').evaluateAll((dialogs) => dialogs.map((dialog) => {
    for (const animation of dialog.getAnimations()) { animation.pause(); animation.currentTime = 20; }
    return Number(getComputedStyle(dialog).opacity);
  }));
  for (const opacity of readableOpacity) expect(opacity).toBe(1);

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  const blocking = result.violations.filter(
    (violation) => violation.impact && BLOCKING_IMPACTS.has(violation.impact),
  );
  // 실패했을 때만 도는 진단이다. 색 대비는 간헐적으로만 실패해 대상 선택자만으로는 원인을 알 수 없었다:
  // axe 가 잰 전경·배경색과 비율, 그리고 그 요소 중심에서 실제로 맨 위에 있는 요소(겹침)와 조상의 불투명도(진행 중
  // 전환)를 남기면 다음에 같은 실패가 나도 재현 없이 원인을 가를 수 있다.
  const summary = await Promise.all(blocking.map(async (violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    targets: violation.nodes.slice(0, 5).map((node) => node.target),
    details: await Promise.all(violation.nodes.slice(0, 5).map(async (node) => ({
      html: node.html.slice(0, 240),
      checks: node.any.map((check) => check.data),
      environment: await describeNodeEnvironment(page, node.target),
    }))),
  })));

  expect(
    summary,
    `${route}: axe serious/critical violations\n${JSON.stringify(summary, null, 2)}`,
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "toonstudio-lang",
      JSON.stringify({ state: { lang: "ko" }, version: 0 }),
    );
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    localStorage.setItem(
      "toonstudio-studio-beta-notice-acknowledged",
      "2026-09-24-data-and-policy-v1",
    );
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        json: { authenticated: false, user: null },
      });
      return;
    }
    await route.fulfill({
      status: 503,
      json: {
        message: "Accessibility smoke: service temporarily unavailable",
        error: "Service Unavailable",
      },
    });
  });
});

for (const route of DESKTOP_A11Y_ROUTES) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await assertNoBlockingViolations(page, route);
  });
}

test.describe("mobile shell accessibility", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("페이지 검색 결과는 44px 터치 영역으로 목적지에 이동한다", async ({ page }) => {
    await page.goto("/about/technology", { waitUntil: "domcontentloaded" });
    await expect(page.locator('.route-stage[data-route-state="ready"]')).toBeVisible();
    await expect(page.locator("[data-route-loading-fallback]")).toHaveCount(0);
    await page.locator(".site-header__utilities > button").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#command-palette-mode-pages").click();
    await dialog.getByRole("combobox").fill("배우기");
    const result = dialog.locator('[cmdk-item][data-value="page-nav-learn"]');
    await expect(result).toBeVisible();
    const target = await result.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await result.click();
    await expect(page).toHaveURL(/\/learn$/u);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  const readServiceOstGeometry = (page: Page) => page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>("[data-service-degraded-banner]");
    const ost = document.querySelector<HTMLElement>('[data-testid="site-background-music-player"]');
    const settings = ost?.querySelector<HTMLElement>(":scope > div");
    if (!notice || !ost) return { surfacesPresent: false };
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const inViewport = (r: ReturnType<typeof rect>) => r.width > 0 && r.height > 0
      && r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    const hits = (element: Element, r: ReturnType<typeof rect>) => inViewport(r)
      && [0.2, 0.5, 0.8].every((x) => [0.2, 0.5, 0.8].every((y) =>
        element.contains(document.elementFromPoint(r.x + r.width * x, r.y + r.height * y))));
    const controls = (surface: Element, selector: string) => [...surface.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden")
      .map((element) => {
        const r = rect(element);
        return { label: element.getAttribute("aria-label") ?? element.textContent?.trim(), rect: r,
          touchAndHit: r.width >= 44 && r.height >= 44 && hits(element, r) };
      });
    const bannerRect = rect(notice), panelRect = settings ? rect(settings) : null, position = getComputedStyle(notice).position;
    const pill = controls(ost, "[data-site-ost-pill] button"), bannerControls = controls(notice, "button, a");
    const expanded = ost.getAttribute("data-site-ost-expanded") === "true";
    const settingsVisible = Boolean(settings && settings.querySelector('button[aria-label="OST 플레이어 접기"]')
      && settings.getClientRects().length > 0 && getComputedStyle(settings).visibility !== "hidden");
    return { surfacesPresent: true, expanded, settingsVisible, position, floating: position === "fixed", bannerRect, panelRect, pill, bannerControls,
      ostVisible: rect(ost).width > 0 && rect(ost).height > 0 && getComputedStyle(ost).visibility !== "hidden",
      pillCount: pill.length, bannerControlCount: bannerControls.length,
      bannerInViewport: inViewport(bannerRect), bannerOnTop: hits(notice, bannerRect),
      bannerTouchAndHit: bannerControls.length === 3 && bannerControls.every((control) => control.touchAndHit),
      panelInViewport: panelRect !== null && inViewport(panelRect),
      noOverlap: panelRect !== null && (panelRect.right <= bannerRect.left || bannerRect.right <= panelRect.left || panelRect.bottom <= bannerRect.top || bannerRect.bottom <= panelRect.top),
      floatingOrder: position !== "fixed" || (panelRect !== null && panelRect.bottom < bannerRect.top),
      touchAndHit: pill.length === 2 && [...pill, ...bannerControls].every((control) => control.touchAndHit) };
  });

  async function assertOstExpanded(page: Page, entry: "menu" | "pill") {
    const player = page.getByTestId("site-background-music-player");
    await expect(player).toHaveCount(1);
    await expect(player).toBeVisible();
    await expect(player).toHaveAttribute("data-site-ost-expanded", "true");
    const focusedControl = entry === "menu"
      ? player.getByRole("button", { name: "OST 플레이어 접기", exact: true })
      : player.getByRole("button", { name: /오리지널 애니·웹툰 OST/u });
    await expect(focusedControl).toBeFocused();
    await expect(player.locator("[data-site-ost-pill] button")).toHaveCount(2);
  }

  async function assertAllOstButtonsReachable(page: Page) {
    const controls = page.getByTestId("site-background-music-player").getByRole("button");
    expect(await controls.count()).toBeGreaterThan(0);
    for (const control of await controls.all()) {
      await control.scrollIntoViewIfNeeded();
      await expect.poll(() => control.evaluate((button) => {
        const r = button.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.top >= 0
          && r.right <= innerWidth && r.bottom <= innerHeight
          && [0.2, 0.5, 0.8].every((x) => [0.2, 0.5, 0.8].every((y) =>
            button.contains(document.elementFromPoint(r.x + r.width * x, r.y + r.height * y))));
      })).toBe(true);
    }
  }

  test("서비스 장애 알림과 OST: 본문 연결 안내는 세 폭에서 터치를 가리지 않는다", async ({ page }) => {
    // 기존 전체 API 503의 실제 연결 준비 상태에는 펼침 버튼이 없다.
    await assertNoBlockingViolations(page, "/studio");
    const banner = page.locator('[data-service-degraded-banner="warming"][data-service-status-placement="page-inline"]');
    const player = page.getByTestId("site-background-music-player");
    await expect(banner).toBeVisible();
    await expect(banner.locator("button, a")).toHaveCount(0);
    await expect(player).toHaveCount(1);
    await expect(player).toBeHidden();
    const scrollBeforeMenu = await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }));
    const menuTrigger = page.locator('button[data-site-mobile-menu-trigger="true"]:visible');
    await expect(menuTrigger).toHaveCount(1);
    const menu = page.locator('[role="dialog"][data-site-menu-panel="true"]');
    for (const width of [390, 320, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(player).toBeHidden();
      await menuTrigger.click();
      await expect(menu).toHaveCount(1);
      await expect(menu).toBeVisible();
      await menu.locator('button[data-site-menu-ost="true"]').click();
      await expect(menu).toHaveCount(0);
      await assertOstExpanded(page, "menu");
      await expect.poll(async () => player.evaluate((element) => element.closest("[inert]") === null)).toBe(true);
      await expect.poll(async () => page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }))).toEqual(scrollBeforeMenu);
      // main의 실제 배너/뷰포트 패널 배치를 함께 검증한다. 스크롤되는 설정 버튼은 정상
      // 스크롤로 노출한 뒤 모두 검사하고, 고정 배너의 실제 별도 상태 검증도 아래에서 유지한다.
      await assertAllOstButtonsReachable(page);
      await expect.poll(() => readServiceOstGeometry(page), { message: `본문 연결 안내·OST ${width}px` }).toMatchObject({
        surfacesPresent: true, expanded: true, settingsVisible: true, floating: false, pillCount: 2, bannerControlCount: 0,
        panelInViewport: true, touchAndHit: true, noOverlap: true,
      });
      await player.getByRole("button", { name: "OST 플레이어 접기", exact: true }).click();
      await expect(player).not.toHaveAttribute("data-site-ost-expanded", "true");
      await expect(player).toBeHidden();
      await expect(menuTrigger).toBeFocused();
      await expect(banner).toBeVisible();
      await expect.poll(() => readServiceOstGeometry(page), { message: `OST 닫은 뒤 본문 안내 복원 ${width}px` }).toMatchObject({
        surfacesPresent: true, expanded: false, settingsVisible: false, ostVisible: false,
        floating: false, bannerControlCount: 0, bannerInViewport: true, bannerOnTop: true,
      });
    }
  });

  test("서비스 장애 알림과 OST: 고정 장애 배너의 여섯 상태가 터치를 가리지 않는다", async ({ page }) => {
    // production-workflows의 서비스 응답 계약을 재사용한다. DOM·CSS·저장소를 강제로 바꾸지 않는다.
    await page.route(/\/health\/capabilities(?:\?.*)?$/u, (route) => route.fulfill({ json: {
      status: "degraded", incidentId: "qa-ost-floating-notice", retryAfterSeconds: 60,
      checkedAt: new Date().toISOString(),
      capabilities: {
        publicCatalog: "unavailable", authSession: "available", communityRead: "unavailable", communityWrite: "unavailable",
        marketplaceRead: "unavailable", studioLocalEditing: "available", studioProjectRead: "unavailable",
        studioCloudSave: "unavailable", realtimeCollaboration: "unavailable", publishing: "unavailable", serverAi: "unavailable",
      },
    } }));
    // 모바일 캐릭터 로비는 OST 전체를 숨긴다(space-lobby.css). 고정 알림과 OST를 강제로
    // 합성하지 않고, 기존 여섯 상태의 실제 알림 조작·화면 경계와 OST 비노출을 함께 검증한다.
    // 캐릭터 선택·입장·저장은 실행하지 않는다.
    await page.goto("/onboarding/character", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
    const banner = page.locator('[data-service-degraded-banner="degraded"]');
    const player = page.getByTestId("site-background-music-player");
    await expect(banner).toHaveCount(1);
    await expect(banner).toBeVisible();
    await expect.poll(() => banner.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
    await expect(player).toHaveCount(1);
    await expect(player).toBeHidden();
    for (const width of [390, 320, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const expanded of [false, true]) {
        if (expanded) await banner.getByRole("button", { name: "서비스 상태 알림 펼치기", exact: true }).click();
        await expect(banner.getByRole("button", { name: expanded ? "서비스 상태 알림 접기" : "서비스 상태 알림 펼치기", exact: true })).toHaveAttribute("aria-expanded", String(expanded));
        await expect(player).toBeHidden();
        await expect.poll(() => readServiceOstGeometry(page), { message: `고정 서비스 알림·OST 비노출 ${width}px / ${expanded ? "펼침" : "접힘"}` }).toMatchObject({
          surfacesPresent: true, expanded: false, settingsVisible: false, ostVisible: false, floating: true,
          pillCount: 0, bannerControlCount: 3, bannerInViewport: true, bannerTouchAndHit: true,
        });
        if (expanded) await banner.getByRole("button", { name: "서비스 상태 알림 접기", exact: true }).click();
      }
    }
    await expect(player).toBeHidden();
  });

  for (const route of MOBILE_A11Y_ROUTES) {
    test(`${route} mobile has no serious or critical automated accessibility violations`, async ({ page }) => {
      await assertNoBlockingViolations(page, route);
    });
  }
});

const storyworldCss = readFileSync(resolve("apps/web/src/domains/creator/storyworld/studio-storyworld-lab.css"), "utf8");
const sitewideCss = readFileSync(resolve("apps/web/src/app/styles/sitewide-visual-ux.css"), "utf8");

// 실제 비계층 CSS와 Tailwind의 계층 순서를 함께 적용한다. 클래스 유무만으로는 크기를 보증할 수 없다.
const utilities = `
  @layer utilities {
    .min-h-11 { min-height: 2.75rem; }
    .min-h-8 { min-height: 2rem; }
  }
  :root { font-size: 16px; --site-control-size: 44px; }
`;

for (const mode of ["desktop", "touch", "contrast"] as const) {
  test.describe(`컨트롤 크기 CSS 우선순위: ${mode}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, hasTouch: mode === "touch" });

    test("스토리월드의 자체 크기 컨트롤은 기존 비계층 CSS 아래에서도 44px를 유지한다", async ({ page }) => {
      await page.setContent(`
        <style>${utilities}${sitewideCss}${storyworldCss}</style>
        <main id="main-content"><div class="storyworld-shell">
          <header data-own-control-size><button class="storyworld-button min-h-11">설정 불러오기</button></header>
          <aside class="storyworld-sidebar" data-own-control-size>
            <nav><button class="min-h-11">설정 파일</button></nav>
          </aside>
          <section data-own-control-size>
            <button class="storyworld-text-button min-h-11">편집 닫기</button>
            <div class="storyworld-branch-controls"><label>장면<select class="min-h-11"><option>장면 1</option></select></label></div>
            <div class="storyworld-segmented"><button class="min-h-11">전체</button></div>
          </section>
        </div></main>
      `);
      if (mode === "contrast") await page.locator("html").evaluate((element) => { element.dataset.designTheme = "contrast"; });

      for (const control of await page.locator("button, select").all()) {
        const size = await control.boundingBox();
        expect(size).not.toBeNull();
        expect(size?.height).toBeGreaterThanOrEqual(44);
      }
    });

    test("크기 면제 밖의 직군 편집기는 전역 최소 높이를 유지한다", async ({ page }) => {
      // 페이지의 실제 면제 경계는 RoleWorkspaceSettingsPage.test.tsx에서 렌더 결과로 확인한다.
      await page.setContent(`
        <style>${utilities}${sitewideCss}</style>
        <main id="main-content">
          <div data-own-control-size><button class="min-h-11">내 직군</button></div>
          <div role="tabpanel"><button class="min-h-8">직군 분류</button></div>
        </main>
      `);
      if (mode === "contrast") await page.locator("html").evaluate((element) => { element.dataset.designTheme = "contrast"; });
      const size = await page.getByRole("button", { name: "직군 분류" }).boundingBox();
      expect(size).not.toBeNull();
      expect(size?.height).toBeGreaterThanOrEqual(mode === "desktop" ? 40 : 44);
    });
  });
}
