import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import { decodePng } from "image-js";

const modes = ["standard-eraser", "kneaded-eraser", "precision-eraser", "broad-eraser", "lift-eraser"] as const;
type Mode = typeof modes[number];

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
}

async function output(page: Page, filename: string) {
  await page.locator("summary[data-studio-clarity-more-trigger]").filter({ visible: true }).click();
  await page.getByRole("button", { name: /내보내기와 협업 파일/ }).click();
  await button(page, "원고 내보내기").click();
  const download = page.waitForEvent("download");
  await button(page, "현재 페이지 PNG 다운로드").click();
  await (await download).saveAs(filename);
  const close = button(page, "출력 설정 닫기");
  if (await close.isVisible()) await close.click();
  return decodePng(await readFile(filename));
}

async function openErasers(page: Page) {
  const eraser = button(page, "지우개");
  if (await eraser.getAttribute("aria-pressed") !== "true") await eraser.click();
  if (await eraser.getAttribute("aria-expanded") !== "true") await eraser.click();
  const picker = page.locator("[data-studio-eraser-quick-picker=true]").filter({ visible: true }).first();
  await expect(picker.getByRole("button")).toHaveCount(5);
  return picker;
}

async function stroke(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 18 });
  await page.mouse.up();
}

test("원고의 지우개 다섯 종은 선택·PNG·실행 취소·다시 열기에 같은 결과를 남긴다", async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/studio/draft/eraser-pixels-${Date.now()}?startTool=draw`);
  const viewport = page.locator("[data-studio-canvas-viewport]").first();
  await expect(viewport).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  const pen = button(page, "펜");
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  const box = (await viewport.boundingBox())!;
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height * 0.43);
  await expect.poll(() => page.evaluate(([cx, cy]) => document.elementFromPoint(cx, cy)?.tagName, [x, y])).toBe("CANVAS");
  await stroke(page, [x - 90, y], [x + 90, y]);
  const undo = button(page, "되돌리기 · 실행취소");
  await expect(undo).toBeEnabled();
  const original = await output(page, info.outputPath("ink.png"));
  const affected = new Map<Mode, number>();
  for (const mode of modes) {
    const card = (await openErasers(page)).locator(`[data-studio-eraser-quick-option="${mode}"]`);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    const close = button(page, "브러시 설정 닫기");
    if (await close.isVisible()) await close.click();
    await stroke(page, [x, y - 32], [x, y + 32]);
    const erased = await output(page, info.outputPath(`${mode}.png`));
    expect([erased.width, erased.height, erased.channels]).toEqual([original.width, original.height, original.channels]);
    let count = 0, lift = 0, lowestAlpha = 255;
    for (let i = 0; i < original.size; i++) {
      if (erased.channels === 4) lowestAlpha = Math.min(lowestAlpha, erased.getValueByIndex(i, 3));
      const before = original.getValueByIndex(i, 1), after = erased.getValueByIndex(i, 1);
      // 잉크가 있는 자리에서 8비트 합성 반올림을 넘는 밝기 변화만 센다.
      if (before < 180 && after - before > 4) {
        count++;
        lift = Math.max(lift, (after - before) / (255 - before));
      }
    }
    expect(lowestAlpha).toBe(255);
    expect(count).toBeGreaterThan(0);
    affected.set(mode, count);
    if (mode === "lift-eraser" || mode === "kneaded-eraser") {
      expect(lift).toBeCloseTo(mode === "lift-eraser" ? 0.16 : 0.38, 1);
    } else expect(lift).toBe(1);
    await undo.click();
  }
  expect(affected.get("precision-eraser")!).toBeLessThan(affected.get("standard-eraser")!);
  expect(affected.get("broad-eraser")!).toBeGreaterThan(affected.get("standard-eraser")!);
  const restored = await output(page, info.outputPath("undo.png"));
  expect(Buffer.compare(Buffer.from(original.data), Buffer.from(restored.data))).toBe(0);
  await pen.click();
  const last = '[data-studio-eraser-quick-option="lift-eraser"]';
  await expect((await openErasers(page)).locator(last)).toHaveAttribute("aria-pressed", "true");
  // 펜 전환이나 파일 출력을 거치지 않고 고른 직후 새로 열어 SQLite 복구를 확인한다.
  const broad = '[data-studio-eraser-quick-option="broad-eraser"]';
  await (await openErasers(page)).locator(broad).click();
  await page.reload();
  await expect(viewport).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  await expect((await openErasers(page)).locator(broad)).toHaveAttribute("aria-pressed", "true");
});
