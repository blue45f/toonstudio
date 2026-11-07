import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.STATUS_QA_BASE || 'http://127.0.0.1:4198';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = 'docs/status-responsive-20261107';
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 640, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('webtoon.onboarding.seen', '1');
      localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: 'ko' }, version: 0 }));
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route('**/api/**', async route => {
      if (route.request().url().includes('/health/capabilities')) await gate;
      await route.fulfill({ status: 503, headers: { 'retry-after': '3600' }, json: { message: '로컬 검증: 상태 응답 없음', retryAfterSeconds: 3600 } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/status', { waitUntil: 'domcontentloaded' });
    const root = page.locator('.service-status-page');
    try {
      await root.getByText('기능 상태를 확인하고 있습니다.', { exact: true }).waitFor({ timeout: 90000 });
      await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden', timeout: 20000 });
      assert.equal(await root.locator('li').count(), 0);
      assert.equal(await root.getByRole('button', { name: '상태 확인 중' }).isDisabled(), true);
      const animations = await root.locator('.animate-spin').evaluateAll(elements => elements.map(el => getComputedStyle(el).animationName));
      assert(animations.length > 0);
      assert(animations.every(value => value === 'none'));
      await root.screenshot({ path: out + '/screenshots/initial-loading-' + width + '.png' });
    } finally { release(); }
    await root.getByRole('alert').waitFor();
    await root.getByText('기능 상태를 아직 확인하지 못했습니다.', { exact: true }).waitFor();
    assert.equal(await root.locator('li').count(), 0);
    assert.equal(await root.getByRole('button', { name: '상태 확인 다시 시도' }).isEnabled(), true);
    const axe = await new AxeBuilder({ page }).include('.service-status-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    assert.deepEqual(axe.violations, []);
    assert.deepEqual(errors, []);
    await root.screenshot({ path: out + '/screenshots/initial-error-' + width + '.png' });
    results.push({ width, loading: 'passed', noReportError: 'passed', reducedMotion: 'passed', axeViolations: 0, errors });
    console.log(width + ' initial states passed');
    await context.close();
  }
  fs.writeFileSync(out + '/initial-report.json', JSON.stringify({ base, results }, null, 2) + '\n');
} finally { await browser.close(); }
