import { buffer } from "node:stream/consumers";

import { expect, test, type Page } from "@playwright/test";

import { openStudioLayerNavigator, openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

async function archive(page: Page) {
  const file = await openStudioMainMenu(page, "file");
  const [download] = await Promise.all([
    page.waitForEvent("download"), file.locator('[data-studio-menu-item-id="export-json"]').click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("원고 백업을 읽을 수 없습니다.");
  return JSON.parse((await buffer(stream)).toString("utf8"));
}

test("선택한 두 번째 컷에만 대사를 추가하고 원고 순서와 저장본을 보존한다", async ({ page }, info) => {
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/draft/selected-panel-dialogue", { waitUntil: "domcontentloaded" });
  const canvas = page.locator("[data-studio-canvas-viewport]").first();
  await expect(canvas).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  const project = await archive(page);
  const scene = project.payload.data;
  scene.title = "비 오는 오후";
  const frame = { type: "frame", x: 24, width: 600, height: 600, bg: "#fff", bgColor: "#fff", strokeWidth: 1 };
  scene.pagesList[0].elements = [
    { ...frame, id: "first", y: 32 },
    { type: "bubble", id: "original", variant: "speech", text: "비가 온다", x: 80, y: 100,
      width: 160, height: 70, fill: "#fff", textFill: "#000", rotation: 0 },
    { ...frame, id: "second", y: 680 },
  ];
  const file = await openStudioMainMenu(page, "file");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"), file.locator('[data-studio-menu-item-id="import-json"]').click(),
  ]);
  await chooser.setFiles({ name: "비 오는 오후.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole("heading", { name: scene.title, exact: true }).first()).toBeVisible();
  const baseline = (await archive(page)).payload.data.pagesList;
  await openStudioLayerNavigator(page);
  const frameRow = page.locator("#studio-layer-second:visible");
  await frameRow.click({ position: { x: 12, y: 18 } });
  await expect(frameRow).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "말풍선", exact: true }).filter({ visible: true }).first().click();
  const panel = page.locator('[data-studio-tool-popover="bubble-menu"]:visible');
  const insert = panel.getByRole("button", { name: "선택한 컷에 대사 넣기" });
  await expect(insert).toBeDisabled();
  await panel.locator("textarea").fill("민수: 빗소리야.\n지영: 우산은 여기 있어.");
  await info.attach("선택 컷과 대사", { body: await panel.screenshot(), contentType: "image/png" });
  await insert.click();
  await expect(panel).toBeHidden();
  const updated = (await archive(page)).payload.data.pagesList;
  const elements = updated[0].elements;
  expect(elements.slice(0, 3)).toEqual(baseline[0].elements);
  expect(elements).toHaveLength(5);
  expect(elements.slice(3).map((e: { text: string }) => e.text)).toEqual(["빗소리야.", "우산은 여기 있어."]);
  for (const bubble of elements.slice(3)) {
    expect(bubble.type).toBe("bubble");
    expect(bubble.y).toBeGreaterThanOrEqual(680);
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(1280);
  }
  for (const [id, expected] of [["undo", baseline], ["redo", updated]] as const) {
    const edit = await openStudioMainMenu(page, "edit");
    await edit.locator(`[data-studio-menu-item-id="${id}"]`).click();
    expect((await archive(page)).payload.data.pagesList).toEqual(expected);
  }
  const save = await openStudioMainMenu(page, "file");
  await save.locator('[data-studio-menu-item-id="save-draft"]').click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(canvas).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: scene.title, exact: true }).first()).toBeVisible();
  const restored = (await archive(page)).payload.data.pagesList;
  expect(restored).toEqual(updated);
  await info.attach("다시 연 두 컷", { body: JSON.stringify(restored), contentType: "application/json" });
});

test.describe("터치 원고의 사선 컷", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("아래 컷에 대사를 넣고 사선 경계와 원래 컷 연결을 저장한다", async ({ page }, info) => {
    test.setTimeout(200_000);
    await page.goto("/studio/draft/selected-diagonal-dialogue", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("[data-studio-canvas-viewport]").first();
    await expect(canvas).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
    const project = await archive(page);
    project.payload.data.title = "소나기";
    const upper = { type: "frame", id: "upper", x: 24, y: 24, width: 672, height: 264, points: [0, 0, 672, 0, 672, 176, 0, 264] };
    const lower = { type: "frame", id: "lower", x: 24, y: 218, width: 672, height: 246, points: [0, 88, 672, 0, 672, 246, 0, 246] };
    project.payload.data.pagesList[0].elements = [upper, lower];
    const file = await openStudioMainMenu(page, "file");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"), file.locator('[data-studio-menu-item-id="import-json"]').click(),
    ]);
    await chooser.setFiles({ name: "사선으로 나눈 컷.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
    await expect(page.getByRole("heading", { name: "소나기", exact: true }).first()).toBeVisible();
    await openStudioLayerNavigator(page);
    const frame = page.locator("#studio-layer-lower:visible");
    await frame.tap({ position: { x: 12, y: 18 } });
    await expect(frame).toHaveAttribute("aria-selected", "true");
    await page.getByRole("dialog", { name: "작업 패널" }).getByRole("button", { name: "설정 닫기" }).tap();
    await page.locator('[data-studio-clarity-more-trigger="true"]:visible').tap();
    await page.locator('[data-drawing-task-category="drawing"]:visible').tap();
    await page.getByRole("button", { name: "말풍선·대사", exact: true }).tap();
    const panel = page.locator('[data-studio-tool-popover="bubble-menu"]:visible');
    await panel.locator("textarea").fill("민수: 비가 와.\n지영: 우산을 가져왔어.");
    await panel.getByRole("button", { name: "선택한 컷에 대사 넣기" }).tap();
    await expect(panel).toBeHidden();
    const updated = (await archive(page)).payload.data.pagesList;
    const bubbles = updated[0].elements.filter((el: { type: string }) => el.type === "bubble");
    expect(bubbles).toHaveLength(2);
    await info.attach("사선 컷 대사 좌표", { body: JSON.stringify(updated), contentType: "application/json" });
    await info.attach("390px 사선 컷", { body: await page.screenshot(), contentType: "image/png" });
    for (const bubble of bubbles) {
      const edgeAtLeft = lower.y + 88 * (1 - (bubble.x - lower.x) / lower.width);
      expect(bubble.y, "말풍선의 왼쪽이 위쪽 사선을 벗어났습니다.").toBeGreaterThanOrEqual(edgeAtLeft);
    }
    for (const bubble of bubbles) expect(bubble.frameClipId).toBe(lower.id);
    const save = await openStudioMainMenu(page, "file");
    await save.locator('[data-studio-menu-item-id="save-draft"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(canvas).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
    expect((await archive(page)).payload.data.pagesList).toEqual(updated);
  });
});
