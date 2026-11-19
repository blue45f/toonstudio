import { text } from "node:stream/consumers";

import { expect, test, type Locator } from "@playwright/test";

test("원고 배경에서 고정한 두 컷의 촬영표를 TXT로 받고 다시 연다", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/studio/bg3d?project=shot-list-roundtrip", { waitUntil: "domcontentloaded" });
  const dialog = page.getByTestId("studio-bg3d-dialog");
  const ready = dialog.getByTestId("studio-bg3d-active-engine-badge");
  const panel = dialog.getByTestId("scene3d-cut-panel");
  const name = panel.getByLabel("컷 이름", { exact: true });
  const create = panel.getByRole("button", { name: "현재 장면으로 컷 만들기", exact: true });
  async function expand(details: Locator) {
    if (await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
  }
  async function enter() {
    await expect(ready).toHaveAttribute("data-readiness", "ready", { timeout: 120_000 });
    await expand(panel);
    await expect(create).toBeEnabled({ timeout: 45_000 });
  }
  async function downloadText() {
    const pending = page.waitForEvent("download");
    await panel.getByRole("button", { name: "촬영표 TXT 다운로드" }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("studio-3d-shot-list.txt");
    const stream = await download.createReadStream();
    if (!stream) throw Error("다운로드된 촬영표를 읽을 수 없습니다.");
    return text(stream);
  }

  await enter();
  for (const title of ["골목 전경", "주인공 눈높이"]) {
    await name.fill(title);
    await create.click();
    await expect(panel.getByRole("button", { name: new RegExp(title) })).toHaveAttribute("aria-pressed", "true");
  }
  const list = panel.locator("details").filter({ has: page.locator("summary", { hasText: /^촬영표$/u }) });
  await expand(list);
  const first = await downloadText();
  expect(first).toContain("주인공 눈높이");
  expect(first).not.toContain("골목 전경");
  expect(first).toContain("카메라 위치");
  await panel.getByRole("combobox", { name: "포함할 컷" }).selectOption("all");
  const chart = await downloadText();
  expect(chart.indexOf("골목 전경")).toBe(0);
  expect(chart.indexOf("주인공 눈높이")).toBeGreaterThan(0);
  await testInfo.attach("두-컷-촬영표.txt", { body: Buffer.from(chart), contentType: "text/plain" });
  await panel.getByRole("button", { name: "로컬 저장", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "로컬 컷 프로젝트를 저장했습니다." })).toBeVisible({ timeout: 30_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await enter();
  await panel.getByRole("button", { name: /주인공 눈높이/u }).click();
  await expand(list);
  await panel.getByRole("combobox", { name: "포함할 컷" }).selectOption("all");
  expect(await downloadText()).toBe(chart);
});
