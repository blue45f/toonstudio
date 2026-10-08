import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { message: "Engineering story browser regression", error: "Service Unavailable" },
    });
  });
});

/** 화면에 적힌 "… N …" 문구에서 첫 숫자를 읽는다. 개수를 스펙에 적어 두면 콘텐츠가 늘 때마다 낡는다(챕터 31 → 40, 참고 카드 13 → 15). */
async function numberShownIn(page: Page, text: RegExp, pick: RegExp): Promise<number> {
  const shown = await page.getByText(text).first().textContent();
  const value = Number(shown?.match(pick)?.[1]);
  expect(value, `${String(text)} 문구에서 읽은 개수`).toBeGreaterThan(0);
  return value;
}

test("mobile engineering hub leads to every evidence-backed chapter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("브라우저에서 웹툰 제작 스튜디오");
  await expect(page.getByRole("link", { name: "전체 제작 과정 보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "발표 모드 열기" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  // 허브가 약속한 챕터 수를 먼저 읽고, 제작 스토리의 본문·목차가 그 수와 같은지 본다.
  const promised = await numberShownIn(page, /^챕터 \d+개 · 전체 읽기 약 \d+분$/u, /챕터 (\d+)개/u);

  await page.getByRole("link", { name: "전체 제작 과정 보기" }).click();
  await expect(page).toHaveURL(/\/about\/technology\/story$/u);
  await expect(page.locator("article[id]")).toHaveCount(promised);
  // 넓은 화면 목차와 좁은 화면 목차가 모두 DOM에 있으므로 첫 목차의 링크 수로 대조한다.
  await expect(page.locator('nav[aria-label="기술 스토리 목차"]').first().locator('a[href^="#"]')).toHaveCount(promised);

  const firstDetails = page.locator("article[id] details").first();
  await firstDetails.locator("summary").click();
  await expect(firstDetails.locator("code").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("guide filters and deck shortcuts preserve control keyboard behavior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology/guides");

  const liveFilter = page.getByRole("button", { name: "운영", exact: true });
  await liveFilter.click();
  await expect(liveFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "성능 예산" })).toBeVisible();

  await page.goto("/about/technology/deck");
  const previous = page.getByRole("button", { name: "이전", exact: true });
  const notes = page.getByRole("button", { name: "발표자 노트", exact: true });
  await expect(previous).toBeDisabled();

  await notes.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect(previous).toBeDisabled();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowRight");
  await expect(previous).toBeEnabled();
  // 정본 주소는 ?track=talk#slide-N 이다(슬라이드 번호는 1부터). 이전 #deck=seminar:N 형식은 열린 뒤 이 형식으로 바뀐다.
  await expect(page).toHaveURL(/\?track=talk#slide-2$/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("reference search and the incident log it points to remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology/references");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("사용한 기술");
  // 카드 수는 머리말 칩("참고 항목 N")이 말하는 수와 같아야 한다.
  const references = await numberShownIn(page, /^참고 항목 \d+$/u, /(\d+)/u);
  await expect(page.locator("[data-reference-card]")).toHaveCount(references);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  await page.getByRole("searchbox").fill("Blender MCP");
  await expect(page.locator("[data-reference-card]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Blender MCP" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  // 장애 기록은 참고 자료가 아니라 심화 노트로 옮겼고, 이 페이지는 그 링크만 둔다.
  await page.getByRole("searchbox").fill("");
  const incidentLink = page.getByRole("link", { name: "심화 노트의 장애 기록" });
  await expect(incidentLink).toHaveAttribute("href", "/about/technology/field-notes#incidents");
  await incidentLink.click();
  await expect(page).toHaveURL(/\/about\/technology\/field-notes#incidents$/u);

  // 기록 주소로 들어오면 그 기록이 펼쳐진다(#incidents 는 구역 주소라 첫 기록만 펼친다).
  await page.evaluate(() => {
    window.location.hash = "service-worker-update-race";
  });
  const incident = page.locator("#service-worker-update-race");
  await expect(incident).toHaveJSProperty("open", true);
  await expect(incident.getByText("잘못된 접근", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("field notes expose workers, PWA, free-first AI, Blender, Open APIs and troubleshooting on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology/field-notes");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("실제 구현에서 남은 기술 판단");
  // 노트 수는 검색 결과 줄("N개 / 전체 M개 노트")의 전체 수와 같아야 한다.
  const totalNotes = await numberShownIn(page, /^\d+개 \/ 전체 \d+개 노트$/u, /전체 (\d+)개/u);
  await expect(page.locator("[data-engineering-field-note]")).toHaveCount(totalNotes);
  await expect(page.getByRole("heading", { name: /Open API마다/u })).toBeVisible();
  await expect(page.getByRole("heading", { name: /실패를 숨기지 않고/u })).toBeVisible();
  // 참고한 제품과 채택 경계는 참고 자료로 옮겼으므로 이 페이지에는 제목이 아니라 이동 링크가 있다.
  await expect(page.getByRole("link", { name: "참고한 제품 보기" })).toHaveAttribute(
    "href",
    "/about/technology/references#reference-products",
  );

  const blenderFilter = page.getByRole("button", { name: "Blender · 3D", exact: true });
  await blenderFilter.click();
  await expect(blenderFilter).toHaveAttribute("aria-pressed", "true");
  const threeDNotes = page.locator('[data-engineering-field-note="three-d-dcc"]');
  await expect(threeDNotes.first()).toBeVisible();
  await expect(page.locator("[data-engineering-field-note]")).toHaveCount(await threeDNotes.count());

  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("searchbox", { name: "기술 노트 검색" }).fill("MediaPipe");
  await expect(page.locator('[data-engineering-field-note-id="browser-local-ai"]')).toHaveCount(1);
  await expect(page.locator("[data-engineering-field-note]")).toHaveCount(1);
  await expect(page.getByText(`1개 / 전체 ${totalNotes}개 노트`, { exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "기술 노트 검색" }).fill("");

  // 공식 문서 링크는 Open API 제공처 카드마다 하나씩 있다. 제품 비교 링크("공식 사이트")는 참고 자료 페이지로 옮겼으므로 여기서 세지 않는다.
  const providerCards = await page.locator("#open-api article").count();
  expect(providerCards).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: /공식 API 문서/u })).toHaveCount(providerCards);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});
