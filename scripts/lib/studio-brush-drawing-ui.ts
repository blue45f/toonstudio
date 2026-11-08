import { waitForStudioDrawingReady } from "./studio-drawing-readiness";

import type { Page } from "playwright";


/** 픽셀 측정 전에 실제 안내 닫기와 펜·브러시 옵션 준비를 같은 순서로 확인한다. */
export async function prepareStudioBrushDrawingUi(page: Page): Promise<void> {
  const stage = page.locator(".konvajs-content").first();
  await stage.waitFor({ state: "visible", timeout: 15_000 });
  await waitForStudioDrawingReady(page, { requireWelcome: true });
  // 빈 캔버스 안내의 그림자가 잉크 ROI에 섞이지 않도록 출시된 UI로 닫는다.
  const welcome = page.locator("[data-studio-cinematic-canvas-welcome]");
  if (await welcome.isVisible()) {
    const drawNow = welcome.getByRole("button", { name: /^(바로 그리기|Draw now)$/u });
    if (await drawNow.isVisible()) await drawNow.click();
    else await welcome.getByRole("button", { name: /^(시작 안내 닫기|Close start guide)$/u }).click();
    await welcome.waitFor({ state: "hidden", timeout: 10_000 });
  }
  await page.keyboard.press("b");
  const toolbar = page.getByRole("toolbar", { name: /그리기 옵션/u });
  await toolbar.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector('[data-studio-draw-options="true"]')
      ?.getAttribute("data-studio-active-draw-mode") === "pen"
  );
  await toolbar.getByRole("button", { name: /브러시 선택 열기$/u }).waitFor({
    state: "visible",
  });
}
