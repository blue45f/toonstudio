import { expect, test } from "@playwright/test";

const WIDTHS = [320, 390, 768, 1024, 1440, 1920] as const;
const PROJECT = `project-${"long-material-library-".repeat(4)}`;

for (const language of ["ko", "en"] as const) {
  test(`asset guide and navigation remain contained and readable (${language})`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((lang) => {
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang }, version: 0 }));
      sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    }, language);
    await page.route("**/api/**", async (route) => {
      const session = new URL(route.request().url()).pathname.endsWith("/auth/session");
      await route.fulfill({ status: session ? 200 : 503,
        json: session ? { authenticated: false, user: null } : { message: "Layout test: offline service" } });
    });
    await page.goto(`/studio/assets?project=${PROJECT}`, { waitUntil: "domcontentloaded" });
    const hub = page.locator("[data-studio-asset-hub]");
    await expect(hub).toBeVisible();
    const guide = hub.locator("details");
    await expect(guide).not.toHaveAttribute("open", "");
    await guide.locator("summary").click();
    const intro = page.locator(".studio-asset-visual-intro");
    const hero = intro.locator(".studio-asset-visual-intro__hero");
    const scenes = intro.locator(".studio-asset-visual-intro__scenes");
    await expect(hero).toHaveCSS("display", "grid");
    await expect(scenes).toHaveCSS("display", "grid");
    for (const image of await intro.locator("img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0)).toBeGreaterThan(0);
    }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      // 세로 스크롤바의 예약 폭은 가로 넘침이 아니다. html 에 `scrollbar-gutter: stable` 이 걸려 있어 클래식 스크롤바 환경에서는
      // 레이아웃 폭(scrollWidth)이 clientWidth 보다 스크롤바 폭(15px)만큼 작게 나온다(음수). 넘침은 양수일 때만 센다.
      await expect.poll(() => page.evaluate(() => ({
        viewport: window.innerWidth,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      }))).toEqual({ viewport: width, overflow: 0 });
      const contentWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(contentWidth).toBeGreaterThan(0);
      const layout = await intro.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const cards = [...element.querySelectorAll<HTMLElement>(".studio-asset-visual-intro__scene-copy")];
        const controls = [...element.querySelectorAll<HTMLElement>(".studio-asset-visual-intro__actions a")];
        const heading = element.querySelector<HTMLElement>("h2")!;
        return { left: rect.left, right: rect.right,
          cards: cards.map((card) => ({ width: card.clientWidth, scroll: card.scrollWidth })),
          controls: controls.map((control) => ({ height: control.clientHeight, width: control.clientWidth, scroll: control.scrollWidth })),
          heading: { width: heading.clientWidth, scroll: heading.scrollWidth } };
      });
      expect(layout.left, `guide left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(layout.right, `guide right at ${width}px`).toBeLessThanOrEqual(contentWidth);
      for (const card of layout.cards) {
        expect(card.width, `readable card copy at ${width}px`).toBeGreaterThanOrEqual(96);
        expect(card.scroll).toBeLessThanOrEqual(card.width + 1);
      }
      for (const control of layout.controls) {
        expect(control.height).toBeGreaterThanOrEqual(42);
        expect(control.scroll).toBeLessThanOrEqual(control.width + 1);
      }
      expect(layout.heading.scroll).toBeLessThanOrEqual(layout.heading.width + 1);
      if (width === 390 || width === 1440) {
        await testInfo.attach(`asset-guide-${language}-${width}`, { body: await intro.screenshot(), contentType: "image/png" });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const lastView = hub.locator("nav a").last();
    await lastView.focus();
    await expect(lastView).toBeFocused();
    const tab = await lastView.boundingBox();
    expect(tab).not.toBeNull();
    expect(tab!.x).toBeGreaterThanOrEqual(0);
    expect(tab!.x + tab!.width).toBeLessThanOrEqual(390);
    await guide.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(guide).not.toHaveAttribute("open", "");
    expect(pageErrors).toEqual([]);
  });
}

test("전문 제작 도구는 작은 화면과 강제색에서도 이름·선택·작품 경로를 유지한다", async ({ page }) => {
  await page.goto("/studio/assets?project=tool-art-review", { waitUntil: "domcontentloaded" });
  const suite = page.getByTestId("studio-specialist-suite-bar");
  const model = suite.locator('a[href="/studio/3d/dcc/model?project=tool-art-review"]');
  const space = suite.locator('a[href="/studio/p/tool-art-review/space"]');
  await expect(model).toHaveAccessibleName(/정밀 3D 모델러|Precision 3D Modeler/u);
  await expect(space).toHaveAccessibleName(/가상 스튜디오|Virtual studio/u);
  const drawings = suite.locator("[data-studio-tool-art]");
  await expect(drawings).toHaveCount(9);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const stage = suite.locator('a[href^="/studio/bg3d"]');
    const character = suite.locator('a[href^="/studio/assets/characters/new"]');
    await stage.focus();
    await page.keyboard.press("Tab");
    await expect(character).toBeFocused();
    for (const link of [character, space]) {
      await link.focus();
      const bounds = await link.evaluate((anchor) => {
        const container = anchor.parentElement?.getBoundingClientRect();
        const rect = anchor.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height, start: container?.left, end: container?.right };
      });
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.left).toBeGreaterThanOrEqual((bounds.start ?? width) - 1);
      expect(bounds.right).toBeLessThanOrEqual((bounds.end ?? 0) + 1);
    }
    await expect(space.locator('[data-studio-tool-art="space"] img[data-ready]')).toBeVisible();
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect(space.locator("img")).toBeHidden();
  await expect(space.locator("svg")).toBeVisible();
  await expect(space).toBeFocused();
});
