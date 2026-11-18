import { test as base, expect } from "@playwright/test";

const test = process.env.STUDIO_CHROME_CDP === "9223" ? base.extend({
  browser: [async ({ playwright }, use) => {
    const browser = await playwright.chromium.connectOverCDP("http://127.0.0.1:9223");
    try { await use(browser); } finally { await browser.close(); }
  }, { scope: "worker" }],
}) : base;

test("맞춤 두상과 계단이 되돌리기·자동 저장·새로고침·작업파일 교체를 거쳐 복원된다", async ({ page, baseURL }, info) => {
  test.skip(process.env.TOONSTUDIO_LOCAL_FULLSTACK_E2E !== "1", "인증된 로컬 풀스택에서 실행합니다.");
  const url = new URL(baseURL);
  expect(url.hostname).toMatch(/^(?:127\.0\.0\.1|localhost)$/u);
  const login = await page.request.post("/api/auth/login", {
    headers: { origin: url.origin, "x-toonstudio-csrf": "1" },
    data: { email: process.env.TOONSTUDIO_LOCAL_TEST_EMAIL, password: process.env.TOONSTUDIO_LOCAL_TEST_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/studio/3d/dcc/model", { waitUntil: "domcontentloaded" });
  await page.getByText("맞춤 두상·계단", { exact: true }).click({ timeout: 180_000 });
  const height = page.getByLabel("두상 높이 (cm)");
  const stats = page.locator("[data-studio-hybrid-dcc-stats]");
  const dimensions = page.locator("[data-studio-hybrid-dcc-selection-metrics]");
  const checkpoint = page.locator("[data-studio-hybrid-dcc-persistence]");
  await height.fill("0");
  await page.getByRole("button", { name: "두상 추가", exact: true }).click();
  expect(await height.evaluate((input) => input.validity.rangeUnderflow)).toBe(true);
  await expect(stats).toHaveAttribute("data-assets", "0");
  await height.fill("23");
  await page.getByLabel("조형 밀도").selectOption("24");
  await page.getByRole("button", { name: "두상 추가", exact: true }).click();
  await expect(dimensions).toContainText("6,912 tris");
  await expect(checkpoint).toHaveAttribute("data-studio-hybrid-dcc-persistence", "saved");
  const firstHash = await checkpoint.getAttribute("data-studio-hybrid-dcc-persistence-document-state-hash");
  expect(firstHash).toMatch(/^sha256:[a-f0-9]{64}$/u);

  const workfile = info.outputPath("custom-head.toon3d");
  for (const [name, file] of [["GLB 저장", info.outputPath("custom-head.glb")], ["작업파일 저장", workfile]]) {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const download = await downloading;
    await download.saveAs(file);
    expect(await download.failure()).toBeNull();
  }

  await page.getByLabel("만들 도형").selectOption("stairs");
  await page.getByLabel("단수", { exact: true }).fill("10");
  await page.getByLabel("계단 너비 (cm)").fill("150");
  await page.getByRole("button", { name: "계단 추가", exact: true }).click();
  await expect(dimensions).toContainText("1.50m × 1.70m × 2.80m");
  await expect(stats).toHaveAttribute("data-assets", "2");
  await page.getByRole("button", { name: "마지막 3D 편집 되돌리기" }).click();
  await expect(stats).toHaveAttribute("data-assets", "1");
  await page.getByRole("button", { name: "되돌린 3D 편집 다시 실행" }).click();
  await expect(stats).toHaveAttribute("data-assets", "2");
  await expect(checkpoint).toHaveAttribute("data-studio-hybrid-dcc-persistence", "saved");
  const sceneHash = await checkpoint.getAttribute("data-studio-hybrid-dcc-persistence-document-state-hash");
  expect(sceneHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  expect(sceneHash).not.toBe(firstHash);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(stats).toHaveAttribute("data-assets", "2");
  await expect(checkpoint).toHaveAttribute("data-studio-hybrid-dcc-persistence-document-state-hash", sceneHash);
  await page.locator('input[accept=".toon3d"]').setInputFiles(workfile);
  await page.getByRole("button", { name: "현재 작업을 교체하고 열기" }).click();
  await expect(stats).toHaveAttribute("data-assets", "1");
  await expect(dimensions).toContainText("6,912 tris");

  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await page.getByLabel("만들 도형").isVisible())) await page.getByText("맞춤 두상·계단", { exact: true }).click();
  await page.getByLabel("만들 도형").selectOption("stairs");
  for (const control of [page.getByLabel("단수", { exact: true }), page.getByRole("button", { name: "계단 추가", exact: true })]) {
    const bounds = await control.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);
});
