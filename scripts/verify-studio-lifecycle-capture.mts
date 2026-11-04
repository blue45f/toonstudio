/** Chromium DOM 계약 fixture 회귀: 실제 CanvasKit/GPU 렌더링 품질의 증거는 아니다. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

import { captureStableLifecycleArtwork, comparePngPixels } from "./lib/studio-lifecycle-capture.mjs";
import { inspectPngIntegrity } from "./studio-lifecycle-verifier-policy";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = process.env.TOONSPECTRUM_LIFECYCLE_CAPTURE_VERIFY_DIR
  ? resolve(REPO_ROOT, process.env.TOONSPECTRUM_LIFECYCLE_CAPTURE_VERIFY_DIR)
  : mkdtempSync(join(tmpdir(), "toonstudio-lifecycle-capture-"));
const ARTWORK_CROP = {
  leftRatio: 0.1085948158253752,
  topRatio: 0.06289222373806273,
  rightRatio: 0.9145975443383357,
  bottomRatio: 0.26298317417007727,
};
// 원래 전체 Stage PNG(733×1100 CSS)에서 floor/ceil로 선택하던 물리 ROI다.
const CASES = [
  { dpr: 1, left: 429, top: 400, width: 592, height: 221 },
  { dpr: 2, left: 859, top: 800, width: 1182, height: 441 },
] as const;

async function mountFixture(page: Page, fallback: boolean): Promise<void> {
  await page.setContent(`<!doctype html><html><body style="margin:0;overflow:hidden;background:#fff">
    <div data-studio-document-renderer="${fallback ? "compatibility" : "skia-canvaskit-document-webgl2"}"
      data-studio-vello-hub-authority="${fallback ? "unavailable" : "starting"}"
      data-studio-konva-document-shadow="mounted"
      style="position:absolute;left:350px;top:331px;width:733px;height:1099.5px">
      <div class="konvajs-content" style="position:relative;width:733px;height:1099.5px">
        <canvas data-fixture-native></canvas>
        ${fallback ? "" : `<canvas data-studio-skia-document-surface data-studio-skia-phase="initializing"
          data-studio-skia-cached-items="0" data-studio-skia-request="fixture-1"
          style="visibility:hidden"></canvas>`}
      </div>
    </div></body></html>`);
  await page.locator("canvas").evaluateAll((canvases) => {
    for (const element of canvases) {
      if (!(element instanceof HTMLCanvasElement)) throw new Error("fixture canvas가 없습니다.");
      element.width = 733 * devicePixelRatio;
      element.height = 1100 * devicePixelRatio;
      Object.assign(element.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
      const context = element.getContext("2d");
      if (!context) throw new Error("fixture Canvas2D를 만들지 못했습니다.");
      context.fillStyle = element.hasAttribute("data-fixture-native") ? "#b33048" : "#209040";
      context.fillRect(0, 0, element.width, element.height);
      // 좌표가 다른 ROI도 같은 단색으로 통과하지 않도록 비주기적인 위치 표식을 넣는다.
      for (const [x, y, width, height] of [[91, 81, 19, 7], [327, 173, 11, 31], [611, 268, 23, 9]]) {
        context.fillStyle = "#15375d";
        context.fillRect(x! * devicePixelRatio, y! * devicePixelRatio, width! * devicePixelRatio, height! * devicePixelRatio);
      }
    }
  });
}

async function setPublication(page: Page, visible: boolean, cachedItems: number): Promise<void> {
  await page.locator("[data-studio-document-renderer]").evaluate((owner, state) => {
    owner.setAttribute("data-studio-vello-hub-authority", "active");
    const canvas = owner.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]");
    if (!canvas) throw new Error("fixture 문서 표면이 없습니다.");
    canvas.style.visibility = state.visible ? "visible" : "hidden";
    canvas.setAttribute("data-studio-skia-phase", "presented");
    canvas.setAttribute("data-studio-skia-cached-items", String(state.cachedItems));
  }, { visible, cachedItems });
}

async function referenceRoi(page: Page, roi: typeof CASES[number]): Promise<Buffer> {
  // helper의 좌표 계획을 재사용하지 않고 전체 viewport PNG에서 정수 픽셀을 추출한다.
  const viewport = await page.screenshot({ animations: "disabled" });
  const base64 = await page.evaluate(async ({ png, bounds }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("기준 PNG의 픽셀 추출에 실패했습니다.");
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, -bounds.left, -bounds.top);
    bitmap.close();
    return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
  }, { png: viewport.toString("base64"), bounds: roi });
  return Buffer.from(base64, "base64");
}

async function assertSameRoi(page: Page, actual: Buffer, expected: Buffer, roi: typeof CASES[number]) {
  const { width, height } = inspectPngIntegrity(actual);
  assert.equal(width, roi.width, `DPR ${roi.dpr}: 원래 ROI 너비가 달라졌습니다.`);
  assert.equal(height, roi.height, `DPR ${roi.dpr}: 원래 ROI 높이가 달라졌습니다.`);
  const diff = await comparePngPixels(page, actual, expected, 2);
  assert.equal(diff.changedPixels, 0, `DPR ${roi.dpr}: 같은 물리 ROI의 픽셀이 달라졌습니다.`);
  assert.equal(diff.totalPixels, roi.width * roi.height);
  return diff;
}

async function verifyCase(browser: Browser, roi: typeof CASES[number]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: roi.dpr });
  try {
    const page = await context.newPage();
    await mountFixture(page, false);
    const stage = page.locator(".konvajs-content");
    const initial = await captureStableLifecycleArtwork(page, stage, ARTWORK_CROP);
    await assertSameRoi(page, initial, await referenceRoi(page, roi), roi);
    writeFileSync(join(ARTIFACT_DIR, `dpr-${roi.dpr}-initial.png`), initial);

    let settled = false;
    const pendingCapture = captureStableLifecycleArtwork(page, stage, ARTWORK_CROP, true).then(
      (bytes) => ({ ok: true as const, bytes }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    void pendingCapture.then(() => { settled = true; });
    const heldStates: string[] = [];
    const assertPending = async (state: string): Promise<void> => {
      // 기존 픽셀 안정화 루프(최대 약 400ms)보다 길게 이미 안정된 이전 표면을 유지한다.
      await page.waitForTimeout(650);
      assert.equal(settled, false, `DPR ${roi.dpr}: ${state}에서 이전 문서 표면을 조기 채택했습니다.`);
      heldStates.push(state);
    };
    await assertPending("starting");
    await setPublication(page, false, 1);
    await assertPending("active/hidden/presented/cache1");
    await setPublication(page, true, 0);
    await assertPending("active/visible/presented/cache0");
    await setPublication(page, true, 1);
    const result = await pendingCapture;
    if (!result.ok) throw result.error;
    const reference = await referenceRoi(page, roi);
    const publishedDiff = await assertSameRoi(page, result.bytes, reference, roi);
    const initialToPublished = await comparePngPixels(page, initial, result.bytes, 2);
    assert.ok(initialToPublished.changedPixels > roi.width * roi.height / 2,
      `DPR ${roi.dpr}: 게시된 녹색 문서 표면으로 전환되지 않았습니다.`);
    writeFileSync(join(ARTIFACT_DIR, `dpr-${roi.dpr}-published.png`), result.bytes);
    writeFileSync(join(ARTIFACT_DIR, `dpr-${roi.dpr}-reference.png`), reference);

    await mountFixture(page, true);
    assert.equal(await page.locator("[data-studio-skia-document-surface]").count(), 0);
    const fallback = await captureStableLifecycleArtwork(page, stage, ARTWORK_CROP, true);
    const fallbackDiff = await assertSameRoi(page, fallback, await referenceRoi(page, roi), roi);
    writeFileSync(join(ARTIFACT_DIR, `dpr-${roi.dpr}-fallback.png`), fallback);
    return { deviceScaleFactor: roi.dpr, roi, heldStates, publishedDiff, initialToPublished, fallbackDiff };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const explicitPath = process.env.TOONSPECTRUM_CHROMIUM_PATH ?? process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const executablePath = explicitPath ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const cases = [];
    for (const roi of CASES) cases.push(await verifyCase(browser, roi));
    const report = {
      ok: true,
      evidence: "Chromium DOM-contract fixture",
      limitation: "Skia 속성이 있는 Canvas2D fixture이며 실제 GPU/CanvasKit 픽셀 품질은 별도 검증해야 합니다.",
      cases,
    };
    writeFileSync(join(ARTIFACT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Studio 생명주기 캡처 DOM 계약 회귀 통과: DPR 1/2, 게시 대기와 fallback, ${ARTIFACT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, "report.json"), `${JSON.stringify({ ok: false, evidence: "Chromium DOM-contract fixture", error: message }, null, 2)}\n`);
  console.error(`Studio 캡처 회귀 실패: ${message}\n복구: Chromium 설치 또는 TOONSPECTRUM_CHROMIUM_PATH를 확인한 뒤 pnpm exec tsx scripts/verify-studio-lifecycle-capture.mts를 실행하세요. 증거: ${ARTIFACT_DIR}`);
  process.exitCode = 1;
});
