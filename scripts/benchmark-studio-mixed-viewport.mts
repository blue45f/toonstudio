/** Run the actual Studio app from this checkout. Local isolated UI only, no account or cloud save. */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect } from '@playwright/test';
import { chromium, type Page } from 'playwright';

import { REPO_ROOT, WEB_PUBLIC } from './lib/repo-paths.mjs';
import { findFreePort, stopChildProcess, waitForServer } from './lib/studio-verify-preview-harness.mjs';
import { openStudioAllTools, openStudioBg3dEnginePanel, openStudioBg3dProfessionalMode, prepareStudioBg3dViewportCapture, selectStudioBg3dTaskTab } from './lib/studio-bg3d-ui-interactions';

const output = path.resolve(process.env.STUDIO_MIXED_VIEWPORT_OUT ?? 'artifacts/mixed-viewport');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const slug = 'korean-highschool-window-corridor-bay-v14';
const vrm = 'vrm/sample.vrm';
const glb = 'studio-assets/blender-precision-bg-v14/' + slug + '.glb';
const assets: Record<string, {sha256: string, bytes: number}> = {};
for (const file of [vrm, glb]) {
  const bytes = await readFile(path.join(WEB_PUBLIC, file));
  assets[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
await mkdir(output, { recursive: true });
const port = await findFreePort();
const origin = 'http://127.0.0.1:' + port;
// Keep Vite's native ESM configuration and React compiler outside the TypeScript QA launcher.
const server = spawn(process.execPath, [
  path.join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--config', 'apps/web/vite.config.ts',
  '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], { cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
let browser;
let observedPage: Page | undefined;
try {
  await waitForServer(origin + '/studio/canvas', { timeoutMs: 120000 });
  const args = process.env.STUDIO_MIXED_VIEWPORT_RENDERER === 'native' ? [] :
    ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ args });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  await context.route('**/api/auth/session', r => r.fulfill({ json: { authenticated: false, user: null } }));
  await context.addInitScript(() => {
    localStorage.setItem('toonstudio-studio-quick-start-dismissed', '1');
    localStorage.setItem('toonstudio-studio-mobile-hint-dismissed', '1');
  });
  const page = await context.newPage();
  observedPage = page;
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => console.error('[Studio page]', error));
  const received = new Set<string>();
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.ok() && url.origin === origin) received.add(decodeURIComponent(url.pathname).slice(1));
  });
  await page.addLocatorHandler(page.locator('[data-studio-first-publish-suggestion="true"]'),
    suggestion => suggestion.getByRole('button', { name: '게시 준비 제안 닫기' }).click());
  await page.goto(origin + '/studio/canvas?preset=illustration&language=ko', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-studio-post-processing-scope]').first().waitFor({ timeout: 180000 });
  const selectTool = async (id: string) => {
    const rail = page.locator('[data-studio-rail-tool-id="' + id + '"]').filter({ visible: true });
    if (await rail.count()) await rail.first().click();
    else {
      const catalog = await openStudioAllTools(page);
      await catalog.getByRole('searchbox', { name: '전체 도구 검색', exact: true }).fill(id);
      await catalog.locator('button[data-studio-catalog-tool-id="' + id + '"]').click();
    }
  };
  console.log('[mixed-viewport] Opening Studio VRM poser');
  await selectTool('vrm3d');
  const poser = page.locator('[data-studio-vrm-dialog="true"]').filter({ visible: true }).first();
  await expect(poser).toBeVisible({ timeout: 180000 });
  const insert = poser.getByRole('button', { name: /이 포즈로 추가/u });
  await expect(async () => {
    if (await poser.isVisible()) await insert.click();
    await expect(poser).toBeHidden({ timeout: 10000 });
  }).toPass({ timeout: 240000 });
  console.log('[mixed-viewport] Opening Studio shared background editor');
  await selectTool('bg3d');
  const dialog = page.getByTestId('studio-bg3d-dialog').filter({ visible: true }).first();
  await openStudioBg3dProfessionalMode(dialog, 120000);
  await openStudioBg3dEnginePanel(dialog, 120000);
  const webgl = dialog.getByTestId('studio-bg3d-engine-preference-webgl2').filter({ visible: true }).first();
  if (await webgl.getAttribute('aria-pressed') !== 'true') await webgl.click();
  await expect(dialog.getByTestId('studio-bg3d-engine-active-backend').filter({ visible: true }).first()).toContainText('WebGL2', { timeout: 120000 });
  await selectStudioBg3dTaskTab(dialog, 'models', 120000);
  const toggle = dialog.getByTestId('bg3d-essential-pose-prop-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await dialog.getByTestId('bg3d-essential-search-input').fill(slug);
  await dialog.getByTestId('bg3d-essential-import-blender-precision-bg-v14-' + slug).click();
  await expect(dialog.getByTestId('bg3d-essential-status')).toContainText('모델을 가져왔습니다.', { timeout: 180000 });
  await prepareStudioBg3dViewportCapture(dialog);
  const canvas = dialog.getByTestId('studio-bg3d-viewport').locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const probeUrl = '/tools/browser-harnesses/studio-mixed-viewport.js';
  await expect.poll(async () => canvas.evaluate(async (c, url) => {
    const { readMixedScene } = await import(/* @vite-ignore */ url);
    const s = await readMixedScene(c);
    return s.skinnedMeshes > 0 && s.staticMeshes > 0 && s.modelCount === 1;
  }, probeUrl), { timeout: 160000, intervals: [500,1000] }).toBe(true);
  for (const file of [vrm, glb]) {
    if (!received.has(file)) throw new Error('The UI never loaded the measured asset: ' + file);
  }
  await canvas.screenshot({ path: path.join(output, 'mixed-viewport.png') });
  const timing = await canvas.evaluate(async (c, url) => {
    const { measureMixedViewport } = await import(/* @vite-ignore */ url);
    return measureMixedViewport(c);
  }, probeUrl);
  const metadata = { sha, assets, date: new Date().toISOString(), os: os.platform(), arch: os.arch(),
    cpu: os.cpus()[0]?.model, runner: process.env.RUNNER_OS, runnerImage: process.env.ImageVersion,
    browser: browser.version(), build: 'Studio app served by Vite with the source checkout', launchArgs: args };
  await writeFile(path.join(output, 'timing.json'), JSON.stringify({ ...metadata, ...timing }, null, 2) + '\n');
  console.log('[mixed-viewport] ' + JSON.stringify({ sha, samples: timing.sampleCount, p50Ms: timing.p50, p95Ms: timing.p95, gpu: timing.gpu, counts: timing.counts, viewport: timing.buffer }));
} catch (error) {
  if (observedPage) {
    await observedPage.screenshot({ path: path.join(output, 'failed-view.png'), timeout: 10000 }).catch(() => {});
    const controls = await observedPage.locator('body').innerText({timeout: 5000}).catch(() => '');
    await writeFile(path.join(output, 'failure.txt'), String(error) + '\n' + controls.slice(-18000));
  }
  throw error;
} finally {
  await browser?.close();
  await stopChildProcess(server);
}
