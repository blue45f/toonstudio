import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

const ROOT = process.cwd();
const routeDirectory = resolve(ROOT, "apps/web/src/app/routes/groups");
const EXCLUDED = /^\/(?:studio|admin|make|shaper|brush-lab|music|creator-hub|publishing|auth)(?:\/|$)/u;
const routes = [...new Set([...readdirSync(routeDirectory)
  .filter((name) => name.endsWith(".routes.tsx"))
  .flatMap((name) => [...readFileSync(resolve(routeDirectory, name), "utf8").matchAll(/path:\s*["']([^"']+)["']/gu)].map((match) => match[1]))
  .filter((path) => path.startsWith("/") && !/[:*]/u.test(path) && !EXCLUDED.test(path)),
  "/learn", "/learn/glossary", "/learn/records", "/learn/studio",
])].sort();

// Actual production UI; anonymous API outage fixtures are not live-backend success.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
    } else {
      await route.fulfill({ status: 503, json: { message: "Browser regression: service temporarily unavailable", error: "Service Unavailable" } });
    }
  });
});

// Each URL receives a fresh browser context and its own finite timeout. A slow page
// must not consume every subsequent route's budget or prevent their evidence upload.
for (const width of [390, 1440]) {
  test.describe(`${width}px public route inventory`, () => {
    test.describe.configure({
      mode: "parallel",
      retries: process.env.CI ? 1 : 0,
    });
    for (const path of routes) {
      test(`${path} remains navigable during API outage`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(path, { waitUntil: "domcontentloaded" });
        const main = page.getByRole("main");
        await expect(main, `${path}: unique main landmark`).toHaveCount(1);
        await expect(main).toBeVisible();
        await expect(main.locator("h1").first(), `${path}: page heading`).toBeVisible();
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        await testInfo.attach("route-result", { body: JSON.stringify({ path, width, errors, horizontalOverflow, text: (await main.innerText()).slice(0, 2000) }), contentType: "application/json" });
        expect(errors, `${path}: uncaught errors`).toEqual([]);
        expect(horizontalOverflow, `${path}: horizontal overflow`).toBe(false);
        await capturePageEvidence(page, testInfo, `${width}-${path.replace(/[^a-z0-9-]/giu, "_") || "home"}`);
        expect(errors, `${path}: errors after full-page rendering`).toEqual([]);
      });
    }
  });
}

test("route inventory retains comprehensive coverage", () => {
  expect(routes.length).toBeGreaterThanOrEqual(65);
  expect(routes.some((path) => EXCLUDED.test(path))).toBe(false);
});

test("public and workspace navigation connects references, research, discovery and showcase by real clicks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/references");
  const referenceHero = page.locator(".ref-hero");
  await expect(referenceHero.getByRole("heading", { level: 1 })).toBeVisible();
  const openStudio = referenceHero.getByRole("link");
  await expect(openStudio).toHaveAttribute("href", "/studio");
  await openStudio.click();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByRole("region", { name: "작품 관리", exact: true })).toBeVisible();

  // 공개 페이지의 빠른 이동과 작업실의 주 메뉴는 같은 실제 목적지를 연결한다.
  const navigation = page.getByRole("navigation", { name: /^(?:빠른 이동|주 메뉴)$/u });
  await expect(navigation).toHaveCount(1);
  await navigation.getByRole("button", { name: "전체 메뉴", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "전체 메뉴", exact: true });
  await expect(menu).toBeVisible();
  const directory = menu.getByRole("link", { name: "전체 기능", exact: true });
  await expect(directory).toHaveAttribute("href", "/sitemap");
  await directory.click();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/\/sitemap$/u);
  await page.getByRole("searchbox", { name: "메뉴·도구 바로 찾기", exact: true }).fill("/research");
  const research = page.getByRole("list", { name: "메뉴 검색 결과", exact: true }).locator('a[href="/research"]');
  await expect(research).toHaveCount(1);
  await research.click();
  await expect(page).toHaveURL(/\/research$/u);
  await expect(page.getByRole("heading", { level: 1, name: "창작 리서치 데스크", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "리서치 통합 검색", exact: true })).toBeVisible();

  const discover = navigation.getByRole("link", { name: "작품 찾기", exact: true });
  await expect(discover).toHaveAttribute("href", "/discover");
  await discover.click();
  await expect(page).toHaveURL(/\/discover$/u);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.getByRole("button", { name: "전체 메뉴", exact: true }).click();
  const communityMenu = page.getByRole("dialog", { name: "전체 메뉴", exact: true });
  await expect(communityMenu).toBeVisible();
  const communityLink = communityMenu.locator('a[href="/community"]');
  await expect(communityLink).toHaveCount(1);
  const communityGroup = communityLink.locator("xpath=ancestor::details[1]");
  const communitySummary = communityGroup.locator(":scope > summary");
  await expect(communitySummary).toHaveAccessibleName("함께 보기");
  if (await communityGroup.getAttribute("open") === null) await communitySummary.click();
  await expect(communityGroup).toHaveAttribute("open", "");
  await expect(communityLink).toHaveAccessibleName("커뮤니티");
  await expect(communityLink).toHaveAttribute("href", "/community");
  await communityLink.click();
  await expect(communityMenu).toHaveCount(0);
  await expect(page).toHaveURL(/\/community$/u);
  await expect(page.getByRole("heading", { level: 1, name: "혼자 그린 이야기, 함께 넓어지는 세계.", exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "창작자 갤러리", exact: true }).click();
  await expect(page).toHaveURL(/\/showcase$/u);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();
  const myWork = navigation.getByRole("link", { name: "내 작업", exact: true });
  await expect(myWork).toHaveAttribute("href", "/studio");
  await myWork.click();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByRole("region", { name: "작품 관리", exact: true })).toBeVisible();
});

test("public pages keep the skip link keyboard-operable with a single footer", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1, name: "아이디어부터 완성된 웹툰까지, 하나의 작업실에서.", exact: true })).toBeVisible();
  await expect(page.locator("footer")).toHaveCount(1);
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main).toHaveAttribute("id", "main-content");
  const skip = page.locator('a[href="#main-content"]');
  await expect(skip).toHaveCount(1);
  await skip.focus();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(main).toBeFocused();
});

test("literal percent names and malformed shared URLs cannot crash the app shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [path, label] of [["/author/100%25", "100%"], ["/pencafe/ink%2525", "ink%25"]]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toContainText(label);
    await expect(page).toHaveTitle(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  // Vite preview rejects malformed encoding before the SPA. Exercise the real
  // client router after loading a valid document, without masking HTTP behavior.
  await page.evaluate(() => {
    history.pushState({}, "", "/author/%E0%A4%A");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator("h1").first()).toContainText("%E0%A4%A");
  await expect(page).toHaveTitle(/%E0%A4%A/u);
  expect(errors).toEqual([]);
});

test("account pages never receive promotional onward cards", async ({ page }) => {
  for (const path of ["/my", "/settings", "/library", "/market/library", "/market/manage", "/market/wishlist"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("[data-public-wayfinder]")).toHaveCount(0);
    await expect(page.locator(".public-site-journey")).toHaveCount(0);
  }
});

test("studio introduction keeps its artwork, reduced motion and responsive theme bounds", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-theme", JSON.stringify({
      state: { preference: "light", studioPreference: "inherit", theme: "light" },
      version: 0,
    }));
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/studio");
  const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');
  const heroArtwork = home.locator('.cf-hero img[src="/brand/hero-20261009-wave11/studio-intro-world.webp"]');
  const tour = home.locator("#creator-tour");
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute("data-home-view", "introduction");
  await expect(home).toHaveAttribute("data-theme-art", "light");
  await expect(heroArtwork).toBeVisible();
  await expect.poll(() => heroArtwork.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(tour.locator(".isw")).toBeVisible();
  await expect(tour.getByRole("group", { name: "작업실 영역 고르기", exact: true }).getByRole("button")).toHaveCount(5);
  await expect(home.getByRole("tablist")).toHaveCount(0);
  await expect(home.locator('#creator-flow video, section[aria-labelledby="creator-closing-title"] video')).toHaveCount(0);
  await expect(home.locator('.cf-hero a[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-hero a[href="/studio"]')).toBeVisible();
  await expect(home.getByRole("heading", { level: 1 })).toHaveText("기획부터 연재까지, 웹툰 제작의 모든 것을 한곳에서.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await capturePageEvidence(page, testInfo, "home-320-light");

  const dark = JSON.stringify({
    state: { preference: "dark", studioPreference: "inherit", theme: "dark" },
    version: 0,
  });
  await page.evaluate((value) => {
    localStorage.setItem("toonstudio-theme", value);
    window.dispatchEvent(new StorageEvent("storage", {
      key: "toonstudio-theme",
      newValue: value,
      storageArea: localStorage,
    }));
  }, dark);
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute("data-theme-art", "dark");
  await expect(heroArtwork).toBeVisible();
  await expect(tour.locator(".isw")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await capturePageEvidence(page, testInfo, "home-320-dark");
});

test("directory search supports real navigation, a shared query, Back and recovery", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sitemap", { waitUntil: "domcontentloaded" });
  const input = page.getByRole("searchbox", { name: "메뉴·도구 바로 찾기" });
  await expect(input).toBeVisible();
  await input.fill("학습 기록");
  const results = page.getByRole("list", { name: "메뉴 검색 결과" });
  await expect(results.getByRole("link")).toHaveCount(1);
  await expect(page).toHaveURL(/menu=/u);
  await input.press("Enter");
  await expect(results.getByRole("link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/learn\/records$/u);
  await page.goBack();
  await expect(input).toHaveValue("학습 기록");
  await input.fill("unmatched-menu-xyz");
  await expect(page.locator(".directory-search__status")).toContainText("0개의 목적지");
  await page.getByRole("button", { name: "검색 초기화", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.locator("#sitemap-extended-title")).toBeVisible();
});

test("evidence snapshots terminate when an infinite feed grows at the fold", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent('<main id="feed" style="height:2400px;background:linear-gradient(white,gray)"><h1>Growing feed</h1></main>');
  await page.evaluate(() => {
    const feed = document.querySelector<HTMLElement>("#feed")!;
    addEventListener("scroll", () => {
      feed.style.height = `${feed.offsetHeight + 900}px`;
    }, { passive: true });
  });

  await capturePageEvidence(page, info, "growing-feed");
  const attachment = info.attachments.find((item) => item.name === "growing-feed-coverage");
  expect(attachment?.body).toBeTruthy();
  const coverage = JSON.parse(attachment!.body!.toString()) as {
    height: number;
    coveredHeight: number;
    observedDocumentHeight: number;
    grewDuringCapture: boolean;
  };
  expect(coverage.coveredHeight).toBe(coverage.height);
  expect(coverage.observedDocumentHeight).toBeGreaterThan(coverage.height);
  expect(coverage.grewDuringCapture).toBe(true);
});

test("long-page evidence covers every vertical region without changing the viewport or losing scroll", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent('<main style="height:5100px;background:linear-gradient(white,gray)"><h1>Complete page evidence</h1></main>');
  await page.evaluate(() => scrollTo(0, 350));
  const original = await page.evaluate(() => ({ y: scrollY, height: innerHeight, width: innerWidth }));
  await capturePageEvidence(page, info, "long-page");
  const attachment = info.attachments.find((item) => item.name === "long-page-coverage");
  expect(attachment?.body).toBeTruthy();
  const coverage = JSON.parse(attachment!.body!.toString()) as {
    height: number; coveredHeight: number; tiles: { y: number; height: number; width: number }[];
  };
  expect(coverage.tiles.length).toBeGreaterThan(5);
  expect(coverage.coveredHeight).toBe(coverage.height);
  expect(coverage.tiles[0].y).toBe(0);
  for (const [index, tile] of coverage.tiles.entries()) {
    expect(tile.width).toBe(original.width);
    expect(tile.height).toBe(original.height);
    if (index) expect(tile.y).toBeLessThanOrEqual(coverage.tiles[index - 1].y + coverage.tiles[index - 1].height);
  }
  expect(await page.evaluate(() => ({ y: scrollY, height: innerHeight, width: innerWidth }))).toEqual(original);
});
