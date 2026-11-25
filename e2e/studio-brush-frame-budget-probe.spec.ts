import { expect, test } from "@playwright/test";

import { studioBrushPointerDispatchInitSource } from "../scripts/lib/studio-brush-pointer-dispatch-probe";
import { profileStudioBrushFrameBudget } from "../scripts/studio-brush-frame-budget-profiler";

test("지속 획 검사기가 형제 캔버스의 잉크가 지워진 두 프레임을 센다", async ({ page }) => {
  await page.addInitScript({ content: studioBrushPointerDispatchInitSource() });
  const fixture = `<main class="relative" style="position:relative">
    <div class="konvajs-content"><canvas width="320" height="220"></canvas></div>
    <canvas id="ink" width="320" height="220" style="position:absolute;inset:0;pointer-events:none"></canvas>
  </main>`;
  await page.goto(`data:text/html,${encodeURIComponent(fixture)}`);
  await page.evaluate(() => {
    const ink = document.querySelector<HTMLCanvasElement>("#ink")?.getContext("2d");
    if (!ink) throw new Error("검증용 잉크 캔버스를 열 수 없습니다.");
    const stage = document.querySelector(".konvajs-content");
    if (!stage) throw new Error("검증용 입력 영역이 없습니다.");
    stage.addEventListener("pointerdown", () => {
      ink.fillRect(48, 64, 80, 24);
      requestAnimationFrame(() => {
        ink.clearRect(48, 64, 80, 24);
        requestAnimationFrame(() => requestAnimationFrame(() => ink.fillRect(48, 64, 80, 24)));
      });
    });
    // 옵션 생략도 false로 표시되므로 브라우저에 전달한 생성 옵션까지 확인한다.
    const prototype = OffscreenCanvas.prototype;
    prototype.getContext = new Proxy(prototype.getContext, {
      apply(target, canvas: OffscreenCanvas, args) {
        const context = Reflect.apply(target, canvas, args);
        if (context instanceof OffscreenCanvasRenderingContext2D) {
          ink.canvas.dataset.readHints = JSON.stringify([
            args[1]?.willReadFrequently, context.getContextAttributes().willReadFrequently,
          ]);
        }
        return context;
      },
    });
  });
  const points = Array.from({ length: 13 }, (_, index) => ({ x: 72 + 10 * index, y: 84 }));
  const result = await profileStudioBrushFrameBudget(page, { points, durationTargetMs: 24 });
  expect(result.observedPointerMoves).toBe(points.length - 1);
  expect(result.pointerDispatchBoundary?.complete).toBe(true);
  expect(result.compositorCanvasCount).toBe(2);
  expect(result.blankFrameCount).toBe(2);
  expect(result.blankFrameObservationCount).toBeGreaterThan(2);
  expect(await page.locator("#ink").getAttribute("data-read-hints")).toBe("[false,false]");
});
