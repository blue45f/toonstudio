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

import { isStudioLifecycleDocumentPublicationReady } from "./lib/studio-lifecycle-capture-policy.mjs";
import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";

import type Konva from "konva";

const origin = new URL(process.env.STUDIO_PEN_ORIGIN ?? "http://127.0.0.1:5173");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname), "로컬 Studio 주소가 필요합니다.");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR" });

interface Crop { x: number; y: number; width: number; height: number }

async function inkFrame(page: Page, live: boolean, crop: Crop) {
  const frame = await page.evaluate(async ({ live, crop }) => {
    if (live) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const host = document.querySelector<HTMLElement>("[data-studio-document-renderer]");
    const stage = host?.querySelector<HTMLElement>(".konvajs-content");
    if (!host || !stage) return null;
    const isVisible = (node: Element) => node.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    const skia = stage.querySelector<HTMLCanvasElement>("canvas[data-studio-skia-document-surface]");
    const publication = {
      authorityStatus: host.dataset.studioVelloHubAuthority ?? null,
      documentRenderer: host.dataset.studioDocumentRenderer ?? null,
      konvaDocumentShadow: host.dataset.studioKonvaDocumentShadow ?? null,
      skiaSurface: skia ? {
        visibility: isVisible(skia) ? "visible" : "hidden",
        phase: skia.dataset.studioSkiaPhase ?? null,
        cachedItems: Number(skia.dataset.studioSkiaCachedItems ?? 0),
      } : null,
    };
    let canvas: HTMLCanvasElement | null = null;
    if (live) {
      canvas = host.querySelector('[data-studio-gpu-active="true"] canvas[data-studio-gpu-surface="webgpu"]');
    } else {
      if (document.documentElement.dataset.studioStrokeFocusPhase || host.querySelector('[data-studio-gpu-pinned="true"]')) return null;
      if (publication.documentRenderer === "skia-canvaskit-document-webgl2") {
        canvas = skia;
      } else if (publication.authorityStatus === "unavailable") {
        const runtime = (window as Window & { Konva?: typeof Konva }).Konva;
        const documentGroup = runtime?.stages.find(candidate => candidate.content === stage)?.findOne(".studio-konva-document-shadow");
        if (documentGroup?.isVisible()) canvas = documentGroup.getLayer()?.getNativeCanvasElement() ?? null;
      }
    }
    if (!canvas || !isVisible(canvas)) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width !== canvas.width || rect.height !== canvas.height) return null;
    const scratch = document.createElement("canvas");
    scratch.width = crop.width;
    scratch.height = crop.height;
    const ctx = scratch.getContext("2d")!;
    // 확대·보간 없이 같은 viewport 픽셀을 읽는다. 커밋 표면의 상태와 RGBA는 같은 작업에서 읽는다.
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
    if (covered.length <= 200 || covered.length >= crop.width * crop.height / 2) return null;
    return { x: rect.x, y: rect.y, width: canvas.width, height: canvas.height, bytes, covered, publication };
  }, { live, crop });
  return frame && (live || isStudioLifecycleDocumentPublicationReady(frame.publication)) ? frame : null;
}

async function publishedInkFrame(page: Page, crop: Crop) {
  const result: { frame: Awaited<ReturnType<typeof inkFrame>> } = { frame: null };
  await expect.poll(async () => {
    result.frame = await inkFrame(page, false, crop);
    return result.frame !== null;
  }, { timeout: 30_000, message: "현재 원고를 게시한 표면에서 획을 읽지 못했습니다." }).toBe(true);
  assert.ok(result.frame);
  return result.frame;
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
  const stabilizerGroup = page.getByRole("group", { name: "손떨림 보정 강도 조절" });
  await expect(stabilizerGroup).toBeVisible();
  const stabilizer = stabilizerGroup.getByRole("slider", { includeHidden: true });
  if (await stabilizer.isVisible()) {
    await stabilizer.press("Home");
  } else {
    const presetButton = stabilizerGroup.getByRole("button");
    await expect(presetButton).toBeVisible();
    // 좁은 데스크톱에서는 버튼으로 꺼짐·약함·표준·강함 네 단계를 순환한다.
    for (let step = 0; step < 3 && (await stabilizer.inputValue()) !== "0"; step++) {
      await presetButton.click();
    }
    await expect(presetButton).toHaveAttribute("aria-pressed", "false");
  }
  await expect(stabilizer).toHaveValue("0");
  const stage = await page.locator(".konvajs-content").boundingBox();
  assert.ok(stage);
  const start = { x: stage.x + 278, y: stage.y + 286 };
  const crop = { x: 266, y: 274, width: 81, height: 37 };
  assert.equal(stage.width, 1392, "720px 문서를 너비 1392px에 맞춘 193.33% 조건이 필요합니다.");
  const editor = page.locator('[data-studio-editor="true"]');
  const undoDepth = async () => {
    const depth = await editor.getAttribute("data-studio-history-undo-depth");
    assert.ok(depth !== null, "원고의 되돌리기 기록을 찾지 못했습니다.");
    return Number(depth);
  };
  const initialDepth = await undoDepth();
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
  await expect.poll(undoDepth, { timeout: 30_000 }).toBeGreaterThan(initialDepth);
  await expect.poll(readLine, { timeout: 30_000 }).toBeTruthy();
  const saved = await readLine();
  assert.ok(saved);
  assert.equal(saved.pressures.length, 14);
  assert.ok(saved.pressures[0] < 0.31 && saved.pressures.at(-1)! > 0.78);
  assert.deepEqual(saved.tiltXs, Array<number>(14).fill(12));
  const committed = await publishedInkFrame(page, crop);
  assert.deepEqual([live.x, live.y, live.width], [committed.x, committed.y, committed.width]);
  assertCoverage(live.covered, committed.covered, crop.width);
  assertCoverage(committed.covered, live.covered, crop.width);
  await page.reload({ waitUntil: "commit" });
  await ready.waitFor({ timeout: 120_000 });
  const reopened = await publishedInkFrame(page, crop);
  assert.equal(reopened.publication.documentRenderer, committed.publication.documentRenderer, "재열기로 원고 표시 엔진이 달라졌습니다.");
  assert.deepEqual([reopened.x, reopened.y, reopened.width, reopened.height],
    [committed.x, committed.y, committed.width, committed.height]);
  const hash = (bytes: number[]) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  assert.equal(hash(reopened.bytes), hash(committed.bytes),
    `재열기 후 동일 영역의 RGBA가 바뀌었습니다. 커밋 픽셀 ${committed.covered.length}, 재열기 픽셀 ${reopened.covered.length}`);
  assert.deepEqual(await readLine(), saved, "재열기 후 저장한 획의 필압·좌표 또는 속성이 달라졌습니다.");
  console.log(JSON.stringify({ zoom: 1392 / 720, samples: saved.pressures.length, livePixels: live.covered.length,
    documentRenderer: committed.publication.documentRenderer, committedPixels: committed.covered.length, contourTolerancePx: 1,
    reopenedRgbaSha256: hash(reopened.bytes) }));
} finally {
  await context.close();
  await browser.close(); // connectOverCDP로 연결한 전송 채널을 끊는다.
}
