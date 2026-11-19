import { buffer } from "node:stream/consumers";

import { expect, test, type Page } from "@playwright/test";
import { decodePng } from "image-js";

import { openStudioExportPanel, openStudioLayerNavigator, openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

async function openDrawingStyle(page: Page) {
  await expect(page.locator("[data-studio-canvas-viewport]").first()).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 120_000 });
  const trigger = page.locator('[data-studio-drawing-clarity-header]:visible [data-studio-main-menu-trigger="3d"]');
  await expect(trigger).toBeVisible({ timeout: 120_000 });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu").filter({ visible: true }).last().getByText("기본 데생 인형", { exact: true }).click();
  const dialog = page.locator('[data-studio-mannequin-dialog="true"]');
  await expect(dialog.locator("[data-studio-mannequin-viewport]")).toBeVisible({ timeout: 120_000 });
  const camera = dialog.getByRole("button", { name: "카메라·캡처", exact: true });
  await camera.focus();
  await camera.press("Enter");
  const panel = dialog.getByTestId("composition-brief-panel");
  await panel.locator("summary").filter({ hasText: "그림체 설정" }).click();
  return panel;
}

test("3D 데생 인형에서 그림체를 저장하고 새로 연 원고에서 같은 지시와 대비를 복원한다", async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const go = () => page.goto("/studio/draft/art-direction", { waitUntil: "domcontentloaded" });
  await go();
  let panel = await openDrawingStyle(page);
  await panel.getByLabel("그림체 이름", { exact: true }).fill("항구의 저녁");
  await panel.getByLabel("선", { exact: true }).fill("끊긴 마른 붓선");
  await panel.getByLabel("배경과 효과", { exact: true }).fill("수평선에 옅은 안개");
  await panel.getByRole("combobox", { name: "이미지 보정", exact: true }).selectOption("sumi-e-webtoon");
  await panel.getByRole("slider", { name: /대비 미세 조정/ }).press("Home");
  await panel.getByRole("slider", { name: /대비 미세 조정/ }).press("ArrowRight");
  await panel.getByRole("button", { name: "새 그림체 저장", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "이 기기에 저장했습니다." })).toBeVisible({ timeout: 45_000 });
  await go();
  panel = await openDrawingStyle(page);
  const presets = panel.getByRole("combobox", { name: "이 기기의 그림체", exact: true });
  await expect(presets.locator("option")).toHaveCount(2, { timeout: 45_000 });
  await presets.selectOption({ label: "항구의 저녁" });
  await expect(panel.getByRole("slider", { name: /대비 미세 조정/ })).toHaveValue("-49");
  await expect(panel.getByLabel("배경과 효과", { exact: true })).toHaveValue("수평선에 옅은 안개");
  await panel.getByRole("button", { name: "현재 작업에 적용" }).click();
  await expect(panel.getByTestId("composition-brief-text")).toContainText("끊긴 마른 붓선");
  await expect(panel.getByTestId("composition-brief-text")).toContainText("수묵 웹툰");
  await info.attach("그림체 저장 및 구도 인계", { body: await panel.screenshot(), contentType: "image/png" });
});

test("선택한 이미지에 그림체 보정을 적용하면 PNG의 색이 바뀌고 되돌리면 원래 픽셀이 돌아온다", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/draft/art-direction-image", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-studio-canvas-viewport]").first()).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  const layers = await openStudioMainMenu(page, "layer");
  const picking = page.waitForEvent("filechooser");
  await layers.getByRole("menuitem", { name: /^이미지…/u }).click();
  await (await picking).setFiles("apps/web/public/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-speed-b.png");
  await expect(page.locator(".studio-drawing-selected-tools")).toBeVisible();
  async function pixels() {
    const panel = await openStudioExportPanel(page);
    const downloading = page.waitForEvent("download");
    await panel.getByRole("button", { name: "현재 페이지 PNG 다운로드", exact: true }).click();
    const stream = await (await downloading).createReadStream();
    if (!stream) throw new Error("내려받은 PNG를 열 수 없습니다.");
    const data = await buffer(stream);
    const close = panel.getByRole("button", { name: "출력 설정 닫기" });
    if (await close.isVisible()) await close.click();
    return { data, image: decodePng(data) };
  }
  const before = await pixels();
  await openStudioLayerNavigator(page, 30_000);
  await page.locator('[data-studio-inspector-primary-tab="properties"]:visible').first().press("Enter");
  await page.getByRole("tab", { name: "빠른 수정", exact: true }).filter({ visible: true }).press("Enter");
  const editor = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^그림체 설정$/ }) }).last();
  await editor.locator("summary").click();
  await editor.getByRole("combobox", { name: "이미지 보정", exact: true }).selectOption("noir");
  await editor.getByRole("slider", { name: "대비 미세 조정" }).press("ArrowRight");
  await editor.getByRole("button", { name: "선택한 이미지에 보정 적용", exact: true }).click();
  await expect(editor.getByRole("status").filter({ hasText: "현재 작업에 적용했습니다." })).toBeVisible();
  const after = await pixels();
  expect(after.image.width).toBe(before.image.width);
  expect(after.image.height).toBe(before.image.height);
  let grayscaleChanges = 0;
  for (let i = 0; i < before.image.size; i++) {
    const [r, g, b] = before.image.getPixelByIndex(i);
    if (Math.max(r, g, b) - Math.min(r, g, b) < 30) continue;
    const [rr, gg, bb] = after.image.getPixelByIndex(i);
    if (Math.max(rr, gg, bb) - Math.min(rr, gg, bb) <= 4) grayscaleChanges++;
  }
  expect(grayscaleChanges).toBeGreaterThan(100);
  await page.getByRole("button", { name: "되돌리기 · 실행취소", exact: true }).filter({ visible: true }).click();
  const restored = await pixels();
  expect(Buffer.from(restored.image.getRawImage().data).equals(Buffer.from(before.image.getRawImage().data))).toBe(true);
  await info.attach("선택한 이미지 보정 전", { body: before.data, contentType: "image/png" });
  await info.attach("선택한 이미지 누아르 보정", { body: after.data, contentType: "image/png" });
  await info.attach("누아르 보정 픽셀 수", { body: String(grayscaleChanges), contentType: "text/plain" });
});
