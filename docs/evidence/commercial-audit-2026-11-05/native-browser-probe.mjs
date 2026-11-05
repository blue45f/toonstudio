import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4178';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const requested = [];
  const blocked = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { blocked.push(url.origin); await route.abort(); }
    else if (url.pathname === '/__native-probe__') await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ko"><title>자체 축소기 검증</title></html>' });
    else await route.continue();
  });
  await page.goto(`${base}/__native-probe__`);
  const result = await page.evaluate(async () => {
    const module = await import('/src/domains/creator/export/studio-vips-export.ts');
    const input = Uint8Array.from({ length: 257 * 129 * 4 }, (_, index) => index % 4 === 3 ? 255 : (index * 17) % 251);
    const before = new Uint8Array(input);
    const start = performance.now();
    const first = await module.downscaleForExport(input, 257, 129, 61, 31);
    const second = await module.downscaleForExport(input, 257, 129, 61, 31);
    const levels = await module.exportPyramid(input, 257, 129, 12);
    const identity = await module.downscaleForExport(input, 257, 129, 257, 129);
    const constant = Uint8Array.from({ length: 17 * 13 * 4 }, (_, index) => [71,129,203,97][index % 4]);
    const constantOutput = await module.downscaleForExport(constant, 17, 13, 7, 5);
    let rejectsUpscale = false;
    try { await module.downscaleForExport(input, 257, 129, 258, 129); } catch { rejectsUpscale = true; }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', first.rgba))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    return {
      width: first.width, height: first.height, bytes: first.rgba.length,
      repeatedBytesEqual: first.rgba.every((byte, index) => byte === second.rgba[index]),
      inputUnchanged: input.every((byte, index) => byte === before[index]),
      identityIndependent: identity.rgba.buffer !== input.buffer && identity.rgba.every((byte, index) => byte === input[index]),
      constantPreserved: constantOutput.rgba.every((byte, index) => byte === [71,129,203,97][index % 4]),
      rejectsUpscale,
      pyramid: levels.map(level => [level.width, level.height]), sha256: digest,
      elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    };
  });
  assert.deepEqual([result.width, result.height, result.bytes], [61,31,61*31*4]);
  for (const field of ['repeatedBytesEqual','inputUnchanged','identityIndependent','constantPreserved','rejectsUpscale']) assert.equal(result[field], true, field);
  assert.deepEqual(result.pyramid, [[128,64],[64,32],[32,16],[16,8],[8,4],[4,2],[2,1],[1,1]]);
  assert.equal(blocked.length, 0);
  const externalVipsRequests = requested.filter(path => /node_modules\/.*wasm-vips|vips[^/]*\.wasm/iu.test(path));
  assert.deepEqual(externalVipsRequests, []);
  assert.ok(requested.some(path => path.includes('studio-native-resize-runtime')));
  writeFileSync(new URL('./native-browser-probe-result.json', import.meta.url), JSON.stringify({ browser: await browser.version(), scope: 'isolated-source-browser-native-export-not-full-studio-e2e', ...result, requested, blocked, externalVipsRequests }, null, 2) + '\n');
  console.log('자체 축소기 Chromium 경로·피라미드·원본 보존·외부 vips 요청 부재 검증 통과');
} finally { await browser.close(); }
