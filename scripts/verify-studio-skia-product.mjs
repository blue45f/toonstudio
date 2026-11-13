import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.argv[2] ?? 'http://127.0.0.1:5298';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Loopback product QA only');
const output = path.resolve('artifacts/skia-product'); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const report = { checks: [], errors: [], driver: null };
const deadline = setTimeout(() => { report.errors.push('Product verification exceeded 180 seconds'); void browser.close(); }, 180000);
let page;
async function gpuReady(count) {
  await page.waitForFunction((expected) => {
    const host = document.querySelector('[data-studio-document-renderer="skia-canvaskit-document-webgl2"]');
    const canvas = document.querySelector('[data-studio-skia-document-surface]');
    return host && canvas && canvas.dataset.studioSkiaCachedItems === String(expected)
      && canvas.dataset.studioSkiaPhase === 'presented' && getComputedStyle(canvas).visibility === 'visible';
  }, count, { timeout: 45000 });
  assert.equal(await page.locator('[data-studio-skia-document-surface]').count(), 1);
}
async function viewTool(id) {
  await page.getByRole('button', { name: '전체 도구', exact: true }).click();
  const catalog = page.getByRole('dialog', { name: '전체 도구', exact: true });
  await catalog.getByRole('searchbox', { name: '전체 도구 검색', exact: true }).fill(id);
  await catalog.locator(`[data-studio-catalog-tool-id="${id}"]`).click();
}
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(new URL('/studio/canvas', origin).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ timeout: 60000 });
  for (const name of ['나중에', '닫기', '빈 캔버스', '확인']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    if (await button.isVisible()) await button.click({ timeout: 1500 }).catch(() => undefined);
  }
  await page.keyboard.press('Escape');
  // 새 문서의 시작 안내에서 실제 사용자가 고르는 그리기 동작을 먼저 완료한다.
  const startDrawing = page.locator('[data-canvas-start-mode="draw"]');
  await startDrawing.waitFor({ state: 'visible', timeout: 15000 });
  await startDrawing.click();
  await expect(page.locator('[data-studio-cinematic-canvas-welcome="true"]')).toHaveCount(0);
  const pen = page.locator('[data-studio-rail-tool-id="pen"]');
  await expect(pen).toBeEnabled({ timeout: 45000 }); await pen.click();
  await page.locator('[data-studio-brush-active-pill]').waitFor({ timeout: 30000 });
  const bounds = await page.locator('.konvajs-content').boundingBox();
  assert(bounds && bounds.width > 300 && bounds.height > 300, 'Actual editor canvas was not available');
  for (let index = 0; index < 3; index++) {
    const y = bounds.y + 150 + index * 35;
    await page.mouse.move(bounds.x + bounds.width * 0.3, y); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.5, y + 30, { steps: 12 }); await page.mouse.up();
    // 실제 획이 표시된 뒤 다음 획을 그려 초기 렌더러 준비와 입력을 경합시키지 않는다.
    await gpuReady(index + 1);
  }
  await page.mouse.move(20, 20); await gpuReady(3);
  await expect(page.locator('[data-studio-skia-document-surface]')).toHaveAttribute(
    'data-studio-skia-source-fence',
    'settled-ink',
  );
  report.checks.push('Settled live ink protects the exact Skia handoff without a redundant visible Konva document draw');
  report.driver = await page.locator('[data-studio-skia-document-surface]').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'); const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  report.checks.push('Real /studio/canvas: three normal pointer strokes acquire one visible Skia surface without changing document authorization');
  const host = page.locator('[data-studio-konva-document-shadow]');
  await expect(host).toHaveAttribute('data-studio-konva-document-shadow', 'unmounted');
  const selectRail = page.locator('[data-studio-rail-tool-id="select"]');
  if (await selectRail.isVisible()) await selectRail.click(); else await viewTool('select');
  // 선택 도구로 바뀌면 도구 옵션 높이도 달라지므로 현재 캔버스 위치에서 같은 획을 선택한다.
  const selectionBounds = await page.locator('.konvajs-content').boundingBox();
  assert(selectionBounds, '선택 도구의 실제 캔버스 위치를 확인하지 못했습니다');
  await page.mouse.click(selectionBounds.x + selectionBounds.width * 0.4, selectionBounds.y + 165);
  await expect(page.locator('[data-studio-selection-badge="true"]')).toBeVisible();
  await gpuReady(3);
  await expect(host).toHaveAttribute('data-studio-konva-document-shadow', 'unmounted');
  await expect(page.locator('[data-studio-document-renderer="skia-canvaskit-document-webgl2"]')).toBeVisible();
  report.checks.push('A single exact ink selection keeps Skia ownership; the hit-only proxy selects it without remounting the Konva paint tree');
  await page.mouse.click(bounds.x + 45, bounds.y + 45);
  await gpuReady(3);
  await expect(host).toHaveAttribute('data-studio-konva-document-shadow', 'unmounted');
  await viewTool('zoom');
  await page.getByRole('button', { name: '캔버스 실제 픽셀 100%', exact: true }).click();
  await gpuReady(3);
  await expect(page.locator('[data-studio-skia-document-surface]')).toHaveAttribute('data-studio-skia-compiled-items', '0');
  await page.getByRole('button', { name: '보기 도구 닫기', exact: true }).click();
  await viewTool('rotate-view');
  await page.getByRole('button', { name: '캔버스 오른쪽으로 90도 회전', exact: true }).click();
  await gpuReady(3);
  await expect(page.getByRole('group', { name: '캔버스 회전', exact: true }).getByRole('status', { name: '현재 회전 각도 90도', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'rotated-document.png') });
  await page.getByRole('button', { name: '캔버스 보기 초기화', exact: true }).click();
  await gpuReady(3);
  await page.getByRole('button', { name: '보기 도구 닫기', exact: true }).click();
  report.checks.push('Real zoom and 90-degree rotation controls re-present the same three original strokes with zero geometry recompilation');
  await page.keyboard.press('ControlOrMeta+z'); await gpuReady(2);
  await page.keyboard.press('ControlOrMeta+Shift+z'); await gpuReady(3);
  report.checks.push('Existing document Undo/Redo remains authoritative and the GPU display follows its restored source');
  await page.screenshot({ path: path.join(output, 'restored-document.png') });
  const surface = page.locator('[data-studio-skia-document-surface]');
  const beforeLossPixels = await surface.evaluate(canvas => canvas.toDataURL());
  await fs.writeFile(path.join(output, 'before-recovery.png'), Buffer.from(beforeLossPixels.split(',')[1], 'base64'));
  report.recovery = await surface.evaluate(canvas => ({
    width: canvas.width, height: canvas.height,
    context: canvas.getContext('webgl2')?.getContextAttributes(),
  }));
  await page.locator('[data-studio-skia-document-surface]').evaluate(canvas => {
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('GPU context-loss injection is unavailable');
    return new Promise(resolve => {
      canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
      extension.loseContext();
    });
  });
  await expect(page.locator('[data-studio-vello-unavailable="true"]')).toBeVisible();
  await expect(page.locator('[data-studio-skia-document-surface]')).toHaveCSS('visibility', 'hidden');
  await page.getByRole('button', { name: '작업 화면 다시 열기', exact: true }).click();
  await gpuReady(3);
  const immediatePixels = await surface.evaluate(canvas => canvas.toDataURL());
  await fs.writeFile(path.join(output, 'immediate-recovery.png'), Buffer.from(immediatePixels.split(',')[1], 'base64'));
  report.recovery.waitedForRecoveredFrame = immediatePixels !== beforeLossPixels;
  // 복구 메타데이터가 먼저 보일 수 있으므로 새 GPU 프레임까지 기다린다. 픽셀 동일성은 그대로 요구한다.
  await expect.poll(() => surface.evaluate(canvas => canvas.toDataURL()), {
    timeout: 45000, intervals: [16, 50, 100, 250],
    message: '명시적 GPU 복구가 원본과 동일한 픽셀을 다시 표시해야 합니다',
  }).toBe(beforeLossPixels);
  const recoveredPixels = await surface.evaluate(canvas => canvas.toDataURL());
  await fs.writeFile(path.join(output, 'after-recovery.png'), Buffer.from(recoveredPixels.split(',')[1], 'base64'));
  assert(recoveredPixels === beforeLossPixels, 'Explicit same-engine recovery changed the document pixels');
  await expect(page.locator('[data-studio-vello-unavailable="true"]')).toHaveCount(0);
  report.checks.push('Real GPU context loss shows recovery UI; explicit retry restores one same-engine surface and exact document pixels');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  if (page && !page.isClosed()) {
    report.body = (await page.locator('body').innerText().catch(() => '')).slice(-5000);
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  }
} finally {
  clearTimeout(deadline); await browser.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
