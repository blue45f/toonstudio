import { buffer } from "node:stream/consumers";

import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodePng } from "image-js";

import { openStudioExportPanel, openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

async function bytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("다운로드 스트림이 없습니다.");
  return buffer(stream);
}

async function openTestPanels(page: Page, elements: object[]) {
  await page.goto("/studio/draft/panel-output", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-studio-canvas-viewport]").first()).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  const file = await openStudioMainMenu(page, "file");
  const [backup] = await Promise.all([
    page.waitForEvent("download"), file.locator('[data-studio-menu-item-id="export-json"]').click(),
  ]);
  const project = JSON.parse((await bytes(backup)).toString("utf8"));
  project.payload.data.title = "저녁 우체국";
  project.payload.data.pagesList[0].elements = elements;
  const imp = await openStudioMainMenu(page, "file");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), imp.locator('[data-studio-menu-item-id="import-json"]').click()]);
  await chooser.setFiles({ name: "작가 원고.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole("heading", { name: "저녁 우체국", exact: true }).first()).toBeVisible();
  const panel = await openStudioExportPanel(page);
  const section = panel.locator('[data-studio-export-section="panel-delivery"]');
  await section.locator("summary").click();
  return section;
}

test("모바일 원고에서 이미지 없는 글콘티와 실제 두 컷을 정사각 ZIP·네 컷 시트로 출력한다", async ({ page }, info) => {
  test.setTimeout(210_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const elements = [
    { id: "first-cut", type: "frame", x: 15, y: 25, width: 280, height: 180, bg: "#d03935", bgColor: "#d03935", strokeWidth: 1, storyBeat: { type: "setup", summary: "창문을 연다." } },
    { id: "second-cut", type: "frame", x: 15, y: 255, width: 180, height: 250, bg: "#1780a0", bgColor: "#1780a0", strokeWidth: 1, storyBeat: { type: "reveal", summary: "우편함이 보인다." } },
  ];
  const section = await openTestPanels(page, elements);
  async function download(label: string) {
    const [output] = await Promise.all([page.waitForEvent("download"), section.getByRole("button", { name: label, exact: true }).click()]);
    return bytes(output);
  }
  const script = await download("글콘티 TXT");
  const text = script.toString("utf8");
  expect(text).toContain("창문을 연다.");
  expect(text.indexOf("우편함이 보인다.")).toBeGreaterThan(text.indexOf("창문을 연다."));
  const archive = await download("정사각 낱장 ZIP");
  const zip = unzipSync(archive);
  expect(Object.keys(zip).sort()).toEqual(["panel-0001.png", "panel-0002.png"]);
  const first = decodePng(zip["panel-0001.png"]), second = decodePng(zip["panel-0002.png"]);
  expect([first.width, first.height, second.width, second.height]).toEqual([1080, 1080, 1080, 1080]);
  const firstColor = first.getPixel(540, 540), secondColor = second.getPixel(540, 540);
  expect(firstColor[0]).toBeGreaterThan(firstColor[2] + 75);
  expect(secondColor[2]).toBeGreaterThan(secondColor[0] + 75);
  const sheetBytes = await download("네 컷 모아보기");
  const sheet = decodePng(sheetBytes);
  expect([sheet.width, sheet.height]).toEqual([2160, 2160]);
  expect(sheet.getPixel(540, 540)).toEqual(firstColor);
  expect(sheet.getPixel(1620, 540)).toEqual(secondColor);
  await info.attach("storyboard.txt", { body: script, contentType: "text/plain" });
  await info.attach("square-panels.zip", { body: archive, contentType: "application/zip" });
  await info.attach("four-panels.png", { body: sheetBytes, contentType: "image/png" });
  await info.attach("모바일 컷 출력", { body: await page.screenshot(), contentType: "image/png" });
});

test("데스크톱에서 빈 글콘티를 안내하고 다섯 컷을 두 시트에 순서대로 나눈다", async ({ page }, info) => {
  test.setTimeout(210_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"];
  const elements = colors.map((color, index) => ({
    id: "panel-" + index, type: "frame", order: index + 1, x: 10, y: 10 + index * 90,
    width: 60, height: 60, bg: color, bgColor: color, strokeWidth: 1,
  }));
  const section = await openTestPanels(page, elements);
  await expect(section.getByRole("button", { name: "글콘티 TXT" })).toBeDisabled();
  const [output] = await Promise.all([
    page.waitForEvent("download"), section.getByRole("button", { name: "네 컷 모아보기", exact: true }).click(),
  ]);
  const sheets = await bytes(output);
  const zip = unzipSync(sheets);
  expect(Object.keys(zip).sort()).toEqual(["sheet-0001.png", "sheet-0002.png"]);
  const first = decodePng(zip["sheet-0001.png"]), second = decodePng(zip["sheet-0002.png"]);
  const samples = [first.getPixel(540, 540), first.getPixel(1620, 540), first.getPixel(540, 1620),
    first.getPixel(1620, 1620), second.getPixel(540, 540)].map(color => color.slice(0, 3));
  expect(samples).toEqual([[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255]]);
  expect(second.getPixel(1620, 540).slice(0, 3)).toEqual([255,255,255]);
  await info.attach("다섯 컷 두 시트", { body: sheets, contentType: "application/zip" });
});
