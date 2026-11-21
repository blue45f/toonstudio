import { buffer } from "node:stream/consumers";

import { expect, test, type Page } from "@playwright/test";

import { installStudioInAppGuestBoundary } from "../scripts/lib/studio-inapp-sweep-harness.mts";
import { openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

test.use({ serviceWorkers: "block" });

interface ManuscriptPage { id: string; elements: unknown[] }

async function exportBackup(page: Page) {
  await expect(page.locator("[data-studio-canvas-viewport]:visible").first()).toHaveAttribute(
    "data-studio-canvas-input-state", "ready", { timeout: 60_000 },
  );
  const menu = await openStudioMainMenu(page, "file");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    menu.locator('[data-studio-menu-item-id="export-json"]').click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("원고 다운로드를 읽을 수 없습니다.");
  const backup = JSON.parse((await buffer(stream)).toString("utf8")) as {
    payload: { data: { title: string; pagesList: ManuscriptPage[] } };
  };
  expect(backup.payload.data.pagesList).toHaveLength(1);
  return backup;
}

test("내 작업에서 복제한 원고는 별도 문서와 페이지로 열리며 다시 열어도 작화를 유지한다", async ({ page, baseURL }, info) => {
  test.setTimeout(160_000);
  const origin = new URL(baseURL ?? "");
  expect(["127.0.0.1", "localhost"]).toContain(origin.hostname);
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === origin.origin) await route.fallback();
    else await route.abort();
  });
  await installStudioInAppGuestBoundary(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const title = "QA 합성 원고 복제";
  await page.goto("/studio/new?lane=blank", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /프로젝트 이름/u }).fill(title);
  await page.getByRole("button", { name: "다음: 시작 확인", exact: true }).click();
  await page.locator("#studio-create-primary-action").click();
  await expect(page).toHaveURL(/\/studio\/p\/[^/]+\/d\/[^/?]+/u, { timeout: 45_000 });
  const originalPath = new URL(page.url()).pathname;

  const synthetic = await exportBackup(page);
  synthetic.payload.data.title = "QA 합성 컷";
  synthetic.payload.data.pagesList[0].elements = [{
    id: "qa-copy-cut", type: "frame", x: 15, y: 25, width: 280, height: 180,
    bg: "#d03935", bgColor: "#d03935", strokeWidth: 1,
  }];
  const file = await openStudioMainMenu(page, "file");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"), file.locator('[data-studio-menu-item-id="import-json"]').click(),
  ]);
  await chooser.setFiles({ name: "합성 원고.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(synthetic)) });
  await expect(page.getByRole("heading", { name: "QA 합성 컷", exact: true }).first()).toBeVisible();
  const original = (await exportBackup(page)).payload.data;
  expect(original.pagesList[0].elements).toHaveLength(1);

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "프로젝트 검색", exact: true }).fill(title);
  const card = (name: string) => page.locator('[data-studio-project-card="true"]')
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const source = card(title);
  await source.locator("summary").click();
  await source.getByRole("button", { name: title + " 복제", exact: true }).click();
  const copy = card(title + " 복사본");
  await expect(copy).toHaveCount(1);
  await copy.getByRole("link", { name: "이어서 작업", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/p\/[^/]+\/d\/[^/?]+/u, { timeout: 35_000 });
  const originalParts = originalPath.split("/");
  const copyParts = new URL(page.url()).pathname.split("/");
  expect(copyParts[3]).not.toBe(originalParts[3]);
  expect(copyParts[5]).not.toBe(originalParts[5]);
  const copied = (await exportBackup(page)).payload.data;
  expect(copied.pagesList[0].id).not.toBe(original.pagesList[0].id);
  expect(copied.pagesList[0].elements).toEqual(original.pagesList[0].elements);

  await page.reload({ waitUntil: "domcontentloaded" });
  expect((await exportBackup(page)).payload.data.pagesList).toEqual(copied.pagesList);
  await info.attach("복제 원고 재열기", { body: await page.screenshot(), contentType: "image/png" });
  await page.goto(originalPath, { waitUntil: "domcontentloaded" });
  expect((await exportBackup(page)).payload.data.pagesList).toEqual(original.pagesList);
  expect(errors).toEqual([]);
});
