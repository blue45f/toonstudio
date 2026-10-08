import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "./fixtures/non-studio-test";

import type { Locator, Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  });
  await page.addLocatorHandler(page.getByRole("button", { name: "설치 안내 닫기" }), async () => {
    await page.getByRole("button", { name: "설치 안내 닫기" }).click();
  });
  await page.route("**/api/**", async (route) => {
    await route.fulfill(new URL(route.request().url()).pathname.endsWith("/auth/session")
      ? { status: 200, json: { authenticated: false, user: null } }
      : { status: 503, json: { message: "Seminar public-page regression" } });
  });
});

/** 발표 모드의 슬라이드 선택 상자(페이지 안 미리보기 기준). 발표 화면(dialog) 안의 것과 구분한다. */
function pageSlideSelect(page: Page) {
  return page.locator("[data-engineering-deck-shell]").getByRole("combobox", { name: "발표 슬라이드 선택" });
}

/** 트랙 버튼에 적힌 "약 N분 · M장"에서 장수 M을 읽는다. 장수를 스펙에 적어 두면 덱이 바뀔 때마다 낡는다(15분 12장·30분 25장 → 11분 11장·30분 19장·45분 30장). */
async function slidesShownOn(button: Locator): Promise<number> {
  const shown = await button.textContent();
  const slides = Number(shown?.match(/(\d+)\s*장/u)?.[1]);
  expect(slides, `${shown ?? ""}에서 읽은 장수`).toBeGreaterThan(0);
  return slides;
}

test("발표 링크·트랙 구성·키보드·해시 이동을 복원한다", async ({ page }) => {
  await page.goto("/about/technology/deck?track=talk#slide-3", { waitUntil: "domcontentloaded" });
  const shell = page.locator("[data-engineering-deck-shell]");
  const select = pageSlideSelect(page);
  const tracks = shell.getByRole("group", { name: "발표 트랙" });

  // 정본 주소의 #slide-3 은 세 번째 슬라이드(0부터 세면 2)이고, 무대에는 선택 상자와 같은 제목이 놓인다.
  await expect(select).toHaveValue("2");
  const selectedTitle = ((await select.locator("option:checked").textContent()) ?? "").replace(/^\d+\.\s*/u, "");
  expect(selectedTitle.length).toBeGreaterThan(0);
  await expect(shell.locator("[data-deck-stage] [data-deck-slide] .deck-slide__title")).toContainText(selectedTitle);

  // 기본 트랙은 30분 세미나 발표다. 트랙은 네 가지(세미나·요약·강의·도감 부록)이고 선택 상자의 장수는 버튼에 적힌 장수와 같다.
  await expect(tracks.getByRole("button")).toHaveCount(4);
  const talk = tracks.getByRole("button", { name: /세미나 발표/u });
  await expect(talk).toHaveAttribute("aria-pressed", "true");
  await expect(talk).toContainText("약 30분");
  const talkSlides = await slidesShownOn(talk);
  await expect(select.locator("option")).toHaveCount(talkSlides);

  // 선택 상자나 버튼에 초점이 없으면 ←/→·Home/End 로 넘기고 주소의 #slide-N 이 따라온다.
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("ArrowRight");
  await expect(select).toHaveValue("3");
  await expect(page).toHaveURL(/\?track=talk#slide-4$/u);
  await page.keyboard.press("End");
  await expect(select).toHaveValue(String(talkSlides - 1));
  await page.keyboard.press("Home");
  await expect(select).toHaveValue("0");

  // 주소의 해시를 바꾸면 그 슬라이드로 이동하고, 새로고침해도 유지된다.
  await page.evaluate(() => { window.location.hash = "slide-4"; });
  await expect(select).toHaveValue("3");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(select).toHaveValue("3");

  // 트랙을 바꾸면 첫 슬라이드부터 그 트랙의 장수로 열리고 주소가 따라온다.
  for (const [name, track] of [["핵심 요약", "brief"], ["심화 강의", "lecture"], ["세미나 발표", "talk"]] as const) {
    const button = tracks.getByRole("button", { name: new RegExp(name, "u") });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(select.locator("option")).toHaveCount(await slidesShownOn(button));
    await expect(select).toHaveValue("0");
    await expect(page).toHaveURL(new RegExp(`\\?track=${track}#slide-1$`, "u"));
  }

  // 도감 부록 트랙은 카드 단위로 이동한다: 슬라이드 선택 상자 대신 도감 카드 선택 상자가 나오고 시간 배정이 없다.
  const atlas = tracks.getByRole("button", { name: /도감 부록/u });
  await atlas.click();
  await expect(atlas).toHaveAttribute("aria-pressed", "true");
  // 도감 부록은 슬라이드가 수백 장이라 번호 대신 슬라이드 id(atlas-<카드 id>-<면>)가 해시에 들어간다.
  await expect(page).toHaveURL(/\?track=atlas#slide-atlas-[a-z0-9-]+$/u);
  await expect(shell.getByRole("combobox", { name: "도감 카드 선택" }).locator("option")).not.toHaveCount(0);
  await expect(shell.getByRole("combobox", { name: "발표 슬라이드 선택" })).toHaveCount(0);
  await tracks.getByRole("button", { name: /세미나 발표/u }).click();
});

test("예전에 공유한 발표 주소도 같은 위치의 정본 주소로 열린다", async ({ page }) => {
  await page.goto("/about/technology/deck?audience=seminar&duration=30#deck=seminar:9", { waitUntil: "domcontentloaded" });
  // seminar → talk 트랙, 슬라이드 번호는 그대로(9번째 = 선택 상자 값 8). duration 은 더 이상 쓰지 않는다.
  await expect(pageSlideSelect(page)).toHaveValue("8");
  await expect(page).toHaveURL(/\?track=talk#slide-9$/u);
  await expect(page.getByRole("combobox", { name: "발표 시간 선택" })).toHaveCount(0);
});

test("청중 화면의 노트·배경 포커스를 숨기고 모든 슬라이드가 데스크톱에 맞는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // 슬라이드가 가장 많은 심화 강의 트랙으로 모든 장이 화면에 들어가는지 본다.
  await page.goto("/about/technology/deck?track=lecture", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "발표 시작" }).click();
  const stage = page.getByRole("dialog", { name: "기술 발표 화면" });
  await expect(stage).toBeVisible();
  expect(await page.locator("#root").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(stage.locator("aside")).toHaveCount(0);
  const select = stage.getByRole("combobox", { name: "발표 슬라이드 선택" });
  const slideCount = await select.locator("option").count();
  expect(slideCount).toBeGreaterThan(1);
  for (let index = 0; index < slideCount; index += 1) {
    await select.selectOption(String(index));
    expect(await stage.evaluate((element) => element.scrollWidth <= element.clientWidth + 2 && element.scrollHeight <= element.clientHeight + 2), `${index + 1}번째 슬라이드`).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("seminar-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(stage).toHaveCount(0);
  expect(await page.locator("#root").evaluate((element) => Boolean((element as HTMLElement).inert))).toBe(false);
});

test("모바일 발표와 참고 자료는 가로 넘침 없이 탐색한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/about/technology/deck?track=talk",
    "/about/technology/references",
    "/about",
    "/about/workflow",
    "/features",
    "/brand-film",
    "/product-tour",
    "/about/technology",
    "/about/technology/videos",
  ]) {
    await page.goto(route, { waitUntil: "domcontentloaded" }); await page.locator("main h1").first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), route).toBe(true);
  }
  await page.goto("/about/technology/deck?track=talk", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "발표 시작" }).click();
  const stage = page.getByRole("dialog", { name: "기술 발표 화면" });
  await stage.getByRole("combobox").selectOption("12");
  expect(await stage.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("seminar-mobile.png") });
});

test("발표 백업은 네트워크 없이 열리고 키보드로 진행한다", async ({ page, context }) => {
  // 짧은 핵심 요약 트랙으로 백업을 만든다. 오프라인 발표본은 현재 트랙의 슬라이드만 담는다.
  await page.goto("/about/technology/deck?track=brief", { waitUntil: "domcontentloaded" });
  const slides = await slidesShownOn(page.getByRole("group", { name: "발표 트랙" }).getByRole("button", { pressed: true }));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "오프라인 발표본", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("toonstudio-brief-deck.html");
  const filename = test.info().outputPath("seminar-offline.html");
  await download.saveAs(filename);
  await context.setOffline(true);
  await page.goto(`file://${filename}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-slide]:visible")).toHaveCount(1);
  await expect(page.locator("#jump option")).toHaveCount(slides);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#jump")).toHaveValue("1");
  await page.keyboard.press("End"); await expect(page.locator("#jump")).toHaveValue(String(slides - 1));
});

async function serveCompleteMediaWithoutRanges(page: Page): Promise<void> {
  await page.route(/\/brand\/.*\.(m4a|mp4)(?:\?.*)?$/u, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = await readFile(path.join(process.cwd(), "apps/web/public", pathname));
    await route.fulfill({ status: 200, body, headers: { "content-type": pathname.endsWith(".m4a") ? "audio/mp4" : "video/mp4", "content-length": String(body.byteLength) } });
  });
}

async function expectTourSynchronized(page: Page, start: number): Promise<void> {
  await expect.poll(async () => page.locator(".product-tour-player").evaluate((section, target) => {
    const frame = Number(section.getAttribute("data-current-frame"));
    const time = frame / 30;
    const audio = Array.from(section.querySelectorAll("audio"));
    return time >= target && time < target + 25 && audio.length === 2 && audio.every((media) =>
      media.currentSrc.startsWith("blob:") && !media.paused && media.readyState >= 3 && !media.seeking && Math.abs(media.currentTime - time) < 0.8);
  }, start)).toBe(true);
}

test("Range 없는 CDN에서 최초 중간 재생·앞뒤·연속 탐색의 화면과 음성을 맞춘다", async ({ page }) => {
  await serveCompleteMediaWithoutRanges(page);
  await page.goto("/product-tour?t=228", { waitUntil: "domcontentloaded" });
  await page.locator(".product-tour-player__poster").click();
  await expectTourSynchronized(page, 228);
  const soundRecovery = page.locator(".product-tour-player__sound-recovery");
  if (await soundRecovery.isVisible()) await soundRecovery.click();
  await expect(page.locator("[data-player-engine=remotion]")).toHaveAttribute("data-player-muted", "false");
  await expect.poll(async () => page.locator(".product-tour-player audio").evaluateAll((elements) => elements.length === 2 && elements.every((element) => !(element as HTMLAudioElement).muted && (element as HTMLAudioElement).volume > 0))).toBe(true);
  const chapters = page.locator(".product-tour-player__chapter > button");
  await chapters.nth(2).click(); await expectTourSynchronized(page, 108);
  await chapters.nth(7).click(); await expectTourSynchronized(page, 420);
  await chapters.evaluateAll((buttons) => {
    for (const index of [4, 1, 5, 2]) (buttons[index] as HTMLButtonElement).click();
  });
  await expectTourSynchronized(page, 108);
  await page.screenshot({ path: test.info().outputPath("tour-remotion-synchronized.png") });
  await page.getByRole("button", { name: "Pause video", exact: true }).click();
  await expect.poll(async () => page.locator(".product-tour-player audio").evaluateAll((audio) => audio.every((element) => (element as HTMLAudioElement).paused))).toBe(true);
  await page.getByRole("button", { name: "호환 재생", exact: true }).click();
  await expect(page.locator('[data-player-engine="mp4"]')).toBeVisible();
  await expect(page.locator(".product-tour-player__poster")).toBeVisible();
});

test("호환 MP4는 요청한 중간 위치·빠른 역방향 탐색·일시정지를 유지한다", async ({ page }) => {
  await serveCompleteMediaWithoutRanges(page);
  await page.goto("/product-tour?t=228&player=mp4", { waitUntil: "domcontentloaded" });
  await page.locator(".product-tour-player__poster").click();
  const video = page.locator(".product-tour-player video");
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => !media.paused && media.currentTime >= 228 && media.currentTime < 250 && media.readyState >= 3)).toBe(true);
  await page.locator(".product-tour-player__chapter > button").evaluateAll((buttons) => {
    for (const index of [7, 4, 1]) (buttons[index] as HTMLButtonElement).click();
  });
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => !media.paused && media.currentTime >= 48 && media.currentTime < 70 && !media.seeking)).toBe(true);
  await video.focus(); await page.keyboard.press("Space");
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.paused)).toBe(true);
  const before = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  await page.waitForTimeout(350);
  expect(await video.evaluate((media: HTMLVideoElement) => media.currentTime)).toBeCloseTo(before, 1);
});

test("브랜드 필름도 최초 마지막 챕터와 역방향 탐색 후 다시 열 수 있다", async ({ page }) => {
  await serveCompleteMediaWithoutRanges(page);
  await page.goto("/brand-film", { waitUntil: "domcontentloaded" });
  const chapters = page.locator(".ch-film-chapters button");
  await chapters.nth(3).click();
  const video = page.locator("#creator-brand-video");
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.currentTime >= 18 && media.currentTime < 24 && media.readyState >= 3)).toBe(true);
  await chapters.nth(1).click();
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.currentTime >= 6 && media.currentTime < 15 && !media.paused)).toBe(true);
  await page.locator(".ch-film-details > button").click();
  await expect(video).toHaveCount(0);
  await chapters.nth(2).click();
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.currentSrc.startsWith("blob:") && media.currentTime >= 12 && media.currentTime < 23 && !media.paused)).toBe(true);
});
