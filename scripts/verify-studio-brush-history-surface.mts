import assert from "node:assert/strict";

import { decodePng } from "image-js";
import { chromium } from "playwright";

import { matchesStudioBrushHistoryBaseline, prepareStudioBrushHistoryEvidence } from "./lib/studio-brush-history-evidence";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 240, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`
    <style>
      body { margin: 0; background: white }
      main,.konvajs-content,canvas { width: 160px; height: 120px; position: absolute; left: 0; top: 0 }
      aside { position: absolute; left: 50px; top: 20px; width: 50px; height: 4px; pointer-events: none }
      aside.visible { box-shadow: 0 22px 3px 4px #aaa }
    </style>
    <main data-studio-document-renderer="compatibility">
      <div class="konvajs-content"><canvas id="retained" width="160" height="120"></canvas></div>
      <canvas id="live" width="160" height="120"></canvas>
    </main><aside></aside>
  `);
  await page.evaluate("globalThis.__name ??= (fn) => fn");
  await page.evaluate(() => {
    Object.assign(window, {
      Konva: { stages: [{
        container: () => document.querySelector("main"), width: () => 160, height: () => 120,
        getAbsoluteTransform: () => ({ point: (p: { x: number; y: number }) => p }),
      }] },
    });
  });
  const clip = { x: 24, y: 24, width: 110, height: 80 };
  const original = await page.screenshot({ clip });
  const history = await prepareStudioBrushHistoryEvidence(page, clip);
  await page.locator("#retained").evaluate((node) => {
    const ctx = (node as HTMLCanvasElement).getContext("2d")!;
    ctx.fillStyle = "#7c5cfc"; ctx.fillRect(54, 41, 30, 8);
  });
  const painted = decodePng(await history.capture("painted"));
  const paper = decodePng(history.before);
  let changedPixels = 0, maxChannelDelta = 0;
  for (let i = 0; i < paper.data.length; i += paper.channels) {
    const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(paper.data[i + c]! - painted.data[i + c]!)));
    if (delta > 2) changedPixels += 1;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  const visibleInk = { changedPixels, maxChannelDelta };
  assert.ok(changedPixels >= 200 && maxChannelDelta >= 150);
  await page.evaluate(() => {
    document.querySelector<HTMLCanvasElement>("#retained")!.getContext("2d")!.clearRect(0, 0, 160, 120);
    document.querySelector("aside")!.classList.add("visible");
  });
  assert.ok(!original.equals(await page.screenshot({ clip })), "external shadow must alter the actual screen");
  assert.ok(matchesStudioBrushHistoryBaseline(history.before, await history.capture("undo"), visibleInk));
  for (const target of ["#retained", "#live"]) {
    const canvas = page.locator(target);
    await canvas.evaluate((node) => {
      const ctx = (node as HTMLCanvasElement).getContext("2d")!;
      ctx.fillStyle = "#e2e2e2"; ctx.fillRect(66, 43, 1, 1);
    });
    assert.ok(!matchesStudioBrushHistoryBaseline(history.before, await history.capture(target), visibleInk),
      `single neutral residual on ${target} must fail Undo`);
    await canvas.evaluate((node) => (node as HTMLCanvasElement).getContext("2d")!.clearRect(0, 0, 160, 120));
  }
  console.log("브러시 Undo 화면 검사 통과. 원고 밖 그림자, 확정 잔류 1px, 라이브 잔류 1px.");
} finally {
  await browser.close();
}
