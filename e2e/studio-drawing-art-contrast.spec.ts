import { expect, test, type Locator } from "@playwright/test";

/** 빈 SVG도 DOM에는 보인다. 글자와 도형을 따로 캡처해 실제 픽셀에 명암 차가 있는지 검사한다. */
async function hasVisibleInk(region: Locator): Promise<boolean> {
  const png = await region.screenshot();
  return region.page().evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("픽셀을 읽을 수 없습니다.");
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkest = 255, brightest = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const brightness = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
        darkest = Math.min(darkest, brightness);
        brightest = Math.max(brightest, brightness);
      }
      return brightest - darkest >= 100;
    } finally {
      bitmap.close();
    }
  }, png.toString("base64"));
}

test("시스템 강제색에서 선택한 펜과 지우개의 도형·이름을 실제 픽셀로 읽을 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/draft/tool-art-contrast", { waitUntil: "domcontentloaded" });
  const rail = page.getByRole("toolbar", { name: /^(그리기 도구|Drawing tools)$/u });
  await expect(rail.locator('[data-studio-tool-art="pen"] img[data-ready]')).toHaveCount(1, { timeout: 60_000 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  for (const tool of ["eraser", "pen"]) {
    const button = rail.locator(`[data-studio-rail-tool-id="${tool}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const art = button.locator(`[data-studio-tool-art="${tool}"]`);
    await expect(art.locator("img")).toBeHidden();
    expect(await hasVisibleInk(art), tool).toBe(true);
    expect(await hasVisibleInk(button.locator("span").filter({ hasText: /^(펜|지우개|Pen|Eraser)$/u }).last()), tool).toBe(true);
  }
});
