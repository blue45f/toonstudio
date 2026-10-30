import { expect, test } from "./fixtures/non-studio-test";

// API failures remain explicit; this suite verifies client-side interaction, not live writes.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    const session = new URL(route.request().url()).pathname.endsWith("/auth/session");
    await route.fulfill({ status: session ? 200 : 503, json: session ? { authenticated: false, user: null } : { message: "Deliberate offline fixture" } });
  });
});

for (const width of [390, 1440]) {
  test(`${width}px community route keeps its current sections and real destinations usable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/community");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "혼자 그린 이야기, 함께 넓어지는 세계.", exact: true })).toBeVisible();
    await expect(main.getByRole("group", { name: "커뮤니티 구역 보기 전환", exact: true })).toBeVisible();
    await expect(page.getByTestId("site-atelier-chapter")).toHaveCount(1);
    await expect(page.getByTestId("atelier-workbench")).toHaveCount(1);
    await expect(page.getByTestId("atelier-workbench")).toHaveAttribute("data-scene", "motion");
    await expect(main.locator('[data-smart-ai-spotlight="nb-community-plaza"]')).toHaveCount(1);
    const gallery = main.getByRole("link", { name: "창작자 갤러리", exact: true });
    await expect(gallery).toHaveAttribute("href", "/showcase");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await gallery.click();
    await expect(page).toHaveURL(/\/showcase$/u);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("community section and guide controls remain keyboard-operable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/community");
  const modes = page.getByRole("group", { name: "커뮤니티 구역 보기 전환", exact: true });
  const all = modes.getByRole("button", { name: "전체 보기", exact: true });
  const league = page.getByRole("region", { name: "오픈 연재 승격 리그 및 창작자 성장 트랙", exact: true });
  const feed = page.getByRole("region", { name: "통합 커뮤니티 피드", exact: true });
  const promotion = page.getByRole("heading", { name: "아마추어 작가의 첫 연재, 새로운 웹툰의 첫 독자", exact: true });
  await expect(modes.getByRole("button")).toHaveCount(4);
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(league).toBeVisible();
  await expect(feed).toBeVisible();
  await expect(promotion).toBeVisible();

  for (const [name, key, visible, hidden] of [
    ["승격 리그 · 활동", "Enter", league, [feed, promotion]],
    ["대화방 · 통합 피드", "Space", feed, [league, promotion]],
    ["작품 홍보 · 예고편", "Enter", promotion, [league, feed]],
  ] as const) {
    const choice = modes.getByRole("button", { name, exact: true });
    await choice.focus();
    await page.keyboard.press(key);
    await expect(choice).toBeFocused();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(modes.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expect(visible).toBeVisible();
    for (const section of hidden) await expect(section).toBeHidden();
  }
  await all.focus();
  await page.keyboard.press("Space");
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(league).toBeVisible();
  await expect(feed).toBeVisible();
  await expect(promotion).toBeVisible();
  const spotlight = page.locator('[data-smart-ai-spotlight="nb-community-plaza"]');
  await expect(spotlight).toHaveCount(1);
  const lenses = spotlight.getByRole("group", { name: "스포트라이트 초점 렌즈", exact: true });
  await expect(lenses.getByRole("button")).toHaveCount(3);
  const pencafes = lenses.getByRole("button", { name: "펜카페·작가 소통", exact: true });
  await pencafes.focus();
  await page.keyboard.press("Space");
  await expect(pencafes).toBeFocused();
  await expect(pencafes).toHaveAttribute("aria-pressed", "true");
  await expect(spotlight.getByRole("link", { name: "펜카페 둘러보기", exact: true })).toHaveAttribute("href", "/pencafe");

  // 접힌 체험 영역을 실제 키보드 동작으로 연 뒤 조작을 검증한다.
  const preview = page.locator("details.public-site-demo");
  const previewToggle = preview.locator("summary");
  await expect(preview).toHaveJSProperty("open", false);
  await previewToggle.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveJSProperty("open", true);
  await expect(previewToggle).toBeFocused();
  const workbench = preview.getByTestId("atelier-workbench");
  await expect(workbench).toHaveCount(1);
  await expect(workbench).toHaveAttribute("data-running", "false");
  await expect(workbench.getByText("모션 감소 설정 적용 중", { exact: true })).toBeVisible();
  const approaches = workbench.getByRole("tablist", { name: "드로잉 표현 방식", exact: true });
  await expect(approaches.getByRole("tab")).toHaveCount(5);
  await approaches.getByRole("tab", { name: "움직이는 컷", exact: true }).focus();
  await page.keyboard.press("Home");
  const ink = approaches.getByRole("tab", { name: "선의 감각", exact: true });
  await expect(ink).toBeFocused();
  await expect(ink).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  const layers = approaches.getByRole("tab", { name: "색과 레이어", exact: true });
  await expect(layers).toBeFocused();
  await expect(layers).toHaveAttribute("aria-selected", "true");
  const line = workbench.getByRole("group", { name: "설명 레이어 표시", exact: true }).getByRole("button", { name: "선화 가이드", exact: true });
  await line.focus();
  await page.keyboard.press("Space");
  await expect(line).toHaveAttribute("aria-pressed", "false");
  await expect(workbench.locator(".atelier-workbench__visual")).toHaveAttribute("data-line", "false");
  await layers.focus();
  await page.keyboard.press("End");
  const materials = approaches.getByRole("tab", { name: "창작 재료", exact: true });
  await expect(materials).toBeFocused();
  await expect(materials).toHaveAttribute("aria-selected", "true");
  const resources = workbench.getByRole("link", { name: "리소스 찾아보기", exact: true });
  await expect(resources).toHaveAttribute("href", "/market/browse");
  await resources.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/market\/browse$/u);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("artwork failures cannot block search in the current research workspace", async ({ page }) => {
  let failedWorkbenchImages = 0;
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") {
      if (new URL(route.request().url()).pathname.startsWith("/brand/atelier-")) failedWorkbenchImages += 1;
      await route.abort();
      return;
    }
    await route.fallback();
  });
  await page.goto("/research");
  await expect(page.getByRole("heading", { level: 1, name: "창작 리서치 데스크", exact: true })).toBeVisible();
  const search = page.getByRole("region", { name: "리서치 통합 검색", exact: true });
  await expect(search).toBeVisible();
  // 접힌 체험 영역을 실제 키보드 동작으로 연 뒤 조작을 검증한다.
  const preview = page.locator("details.public-site-demo");
  const previewToggle = preview.locator("summary");
  await expect(preview).toHaveJSProperty("open", false);
  await previewToggle.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveJSProperty("open", true);
  await expect(previewToggle).toBeFocused();
  const workbench = preview.getByTestId("atelier-workbench");
  await expect(workbench).toHaveCount(1);
  await expect(workbench).toHaveAttribute("data-scene", "layers");
  await workbench.scrollIntoViewIfNeeded();
  await expect.poll(() => failedWorkbenchImages).toBeGreaterThan(0);
  await expect(workbench.getByText("이미지 없이도 아래 조작과 설명을 살펴볼 수 있어요.", { exact: true })).toBeVisible();
  await expect(workbench.getByRole("group", { name: "설명 레이어 표시", exact: true })).toBeVisible();
  await search.getByRole("button", { name: /글로벌 판본/u }).click();
  await search.getByRole("searchbox", { name: "글로벌 판본 검색", exact: true }).fill("Alice in Wonderland");
  await search.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page).toHaveURL(/\/research\/books\?q=Alice\+in\+Wonderland&page=1$/u);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("sensitive routes remain free of interactive promotional chapters", async ({ page }) => {
  for (const route of ["/settings", "/login", "/market/manage", "/terms", "/privacy"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId("atelier-workbench")).toHaveCount(0);
  }
});

test("calendar day lists expand without losing keyboard navigation or full export", async ({ page }, info) => {
  const { readFile } = await import("node:fs/promises");
  const calendar = JSON.parse(await readFile("apps/web/public/data/calendar.json", "utf8"));
  await page.route("**/api/calendar**", (route) => route.fulfill({ status: 200, json: calendar }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/calendar");
  const monday = page.getByRole("tab", { name: /^월/u });
  await monday.click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator('a[href^="/title/"]')).toHaveCount(24);
  await panel.getByRole("button", { name: /월요일 .*더 보기/u }).click();
  await expect(panel.locator('a[href^="/title/"]')).toHaveCount(48);
  await monday.focus();
  await page.keyboard.press("ArrowRight");
  const tuesday = page.getByRole("tab", { name: /^화/u });
  await expect(tuesday).toBeFocused();
  await expect(tuesday).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator('a[href^="/title/"]')).toHaveCount(24);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /내보내기/u }).click();
  const download = await downloading;
  await download.saveAs(info.outputPath("full-week-calendar.ics"));
  const content = await readFile(info.outputPath("full-week-calendar.ics"), "utf8");
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content.match(/BEGIN:VEVENT/gu)!.length).toBeGreaterThan(48);
});
