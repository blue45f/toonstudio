/**
 * 1440×1000, DPR 1의 로컬 Studio에서 실제 웹툰 프로젝트로 펜을 검증한다.
 * 실행: STUDIO_PEN_ORIGIN=http://127.0.0.1:5173 pnpm verify:studio-pen-render-roundtrip
 * 브라우저는 프로젝트의 Chrome CDP :9223을 사용한다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { expect } from "@playwright/test";
import { chromium, type Page } from "playwright";

import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";

import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";

const origin = new URL(process.env.STUDIO_PEN_ORIGIN ?? "http://127.0.0.1:5173");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname), "로컬 Studio 주소가 필요합니다.");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR" });

interface Crop { x: number; y: number; width: number; height: number }

async function inkFrame(page: Page, live: boolean, crop: Crop) {
  return page.evaluate(async ({ live, crop }) => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const canvases = live
      ? Array.from(document.querySelectorAll<HTMLCanvasElement>('[data-studio-gpu-surface="webgpu"]'))
      : Array.from(document.querySelectorAll<HTMLCanvasElement>('.konvajs-content canvas:not([data-studio-brush-cursor-canvas])'));
    for (const canvas of canvases) {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== 1392 || rect.width !== canvas.width || rect.height !== canvas.height) continue;
      const scratch = document.createElement("canvas");
      scratch.width = crop.width;
      scratch.height = crop.height;
      const ctx = scratch.getContext("2d")!;
      // WebGPU와 Konva 캔버스의 동일한 원본 픽셀 영역을 읽는다. 확대나 정합 보간은 없다.
      if (live) {
        const image = new Image();
        image.src = canvas.toDataURL();
        await image.decode();
        ctx.drawImage(image, -crop.x, -crop.y);
      } else {
        ctx.drawImage(canvas, -crop.x, -crop.y);
      }
      const bytes = Array.from(ctx.getImageData(0, 0, crop.width, crop.height).data);
      const covered = bytes.flatMap((value, i) => i % 4 === 3 && value >= 128 ? [Math.floor(i / 4)] : []);
      if (covered.length > 200 && covered.length < crop.width * crop.height / 2) {
        return { x: rect.x, y: rect.y, width: canvas.width, height: canvas.height, bytes, covered };
      }
    }
    return null;
  }, { live, crop });
}

function assertCoverage(source: number[], target: number[], width: number) {
  const ink = new Set(target);
  for (const pixel of source) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const touches = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx =>
      x + dx >= 0 && x + dx < width && ink.has((y + dy) * width + x + dx)));
    assert.ok(touches, `반투명도 50% 윤곽이 1픽셀을 벗어났습니다. (${x}, ${y})`);
  }
}

try {
  await context.addInitScript({ content: "globalThis.__name ??= value => value;" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.addLocatorHandler(page.locator('[data-studio-beta-notice="true"]'), async banner => {
    await banner.locator('[data-studio-beta-notice-acknowledge="true"]').click();
  });
  await page.goto(new URL("/studio/new", origin).href, { waitUntil: "commit" });
  await page.getByRole("button", { name: "다음: 작품 이름", exact: true }).click({ timeout: 120_000 });
  await page.getByRole("textbox", { name: /프로젝트 이름/ }).first().fill("합성 펜 검증 회차");
  await page.getByRole("button", { name: /다음.*시작 확인/ }).click();
  await page.getByRole("button", { name: /세로 연재 웹툰 시작|웹툰.*시작/ }).last().click();
  await page.waitForURL(/\/studio\/p\//u, { waitUntil: "commit" });
  if (new URL(page.url()).pathname.endsWith("/story")) {
    await page.getByRole("link", { name: "이어서 그리기", exact: true }).first().click();
  }
  await page.waitForURL(/\/studio\/p\/[^/]+\/d\//u);
  const ready = page.locator('[data-studio-canvas-input-state="ready"]');
  await ready.waitFor({ timeout: 120_000 });
  for (const selector of ["[data-studio-quickstart-dismiss]", "[data-studio-page-sequence-close]"]) {
    const close = page.locator(selector + ":visible").first();
    if (await close.isVisible()) await close.click();
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  const stabilizer = page.getByRole("group", { name: "손떨림 보정 강도 조절" }).getByRole("slider");
  await stabilizer.press("Home");
  await expect(stabilizer).toHaveValue("0");
  const stage = await page.locator(".konvajs-content").boundingBox();
  assert.ok(stage);
  const start = { x: stage.x + 278, y: stage.y + 286 };
  const crop = { x: 266, y: 274, width: 81, height: 37 };
  assert.equal(stage.width, 1392, "720px 문서를 너비 1392px에 맞춘 193.33% 조건이 필요합니다.");
  const cdp = await context.newCDPSession(page);
  const pen = { pointerType: "pen", tiltX: 12 } as const;
  await cdp.send("Input.dispatchMouseEvent", { ...pen, type: "mousePressed", ...start, button: "left", buttons: 1, force: 0.3, clickCount: 1 });
  for (let n = 1; n <= 13; n++) {
    const progress = n / 13;
    await cdp.send("Input.dispatchMouseEvent", {
      ...pen, type: "mouseMoved", x: start.x + 55 * progress, y: start.y + 10 * progress,
      button: "none", buttons: 1, force: 0.3 + 0.5 * progress,
    });
    // 프레임마다 서로 다른 좌표를 전달해 Chrome이 같은 위치의 이동을 병합하는 경우를 피한다.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  const live = await inkFrame(page, true, crop);
  assert.ok(live, "현재 브라우저의 WebGPU 미리보기에서 획을 읽을 수 없습니다.");
  await cdp.send("Input.dispatchMouseEvent", { ...pen, type: "mouseReleased", x: start.x + 55, y: start.y + 10, button: "left", buttons: 0, force: 0, clickCount: 1 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-studio-stroke-focus-phase"));
  await expect(page.locator('[data-studio-gpu-pinned="true"]')).toHaveCount(0);
  const key = studioAutosaveKey({ workId: new URL(page.url()).pathname.split("/").at(-1) });
  const readLine = async () => {
    const doc = await readDurableStudioAutosaveDocument(page, key);
    return doc?.pagesList.flatMap(record => record.elements ?? []).find((el): el is { type: "draw"; pressures: number[]; tiltXs: number[] } =>
      typeof el === "object" && el !== null && "type" in el && el.type === "draw");
  };
  await expect.poll(readLine, { timeout: 30_000 }).toBeTruthy();
  const saved = await readLine();
  assert.ok(saved);
  assert.equal(saved.pressures.length, 14);
  assert.ok(saved.pressures[0] < 0.31 && saved.pressures.at(-1)! > 0.78);
  assert.deepEqual(saved.tiltXs, Array<number>(14).fill(12));
  await expect.poll(async () => Boolean(await inkFrame(page, false, crop)), { timeout: 30_000 }).toBe(true);
  const committed = await inkFrame(page, false, crop);
  assert.ok(committed, "저장된 획이 화면에 없습니다.");
  assert.deepEqual([live.x, live.y, live.width], [committed.x, committed.y, committed.width]);
  assertCoverage(live.covered, committed.covered, crop.width);
  assertCoverage(committed.covered, live.covered, crop.width);
  await page.reload({ waitUntil: "commit" });
  await ready.waitFor({ timeout: 120_000 });
  await expect.poll(async () => Boolean(await inkFrame(page, false, crop)), { timeout: 30_000 }).toBe(true);
  const reopened = await inkFrame(page, false, crop);
  assert.ok(reopened);
  assert.deepEqual([reopened.x, reopened.y, reopened.width, reopened.height],
    [committed.x, committed.y, committed.width, committed.height]);
  const hash = (bytes: number[]) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  assert.equal(hash(reopened.bytes), hash(committed.bytes),
    `재열기 후 동일 영역의 RGBA가 바뀌었습니다. 커밋 픽셀 ${committed.covered.length}, 재열기 픽셀 ${reopened.covered.length}`);
  assert.deepEqual(await readLine(), saved, "재열기 후 저장한 획의 필압·좌표 또는 속성이 달라졌습니다.");
  console.log(JSON.stringify({ zoom: 1392 / 720, samples: saved.pressures.length, livePixels: live.covered.length,
    committedPixels: committed.covered.length, contourTolerancePx: 1,
    reopenedRgbaSha256: hash(reopened.bytes) }));
} finally {
  await context.close();
  await browser.close(); // connectOverCDP로 연결한 전송 채널을 끊는다.
}
