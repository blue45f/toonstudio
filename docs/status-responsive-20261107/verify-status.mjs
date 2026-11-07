import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 실제 계정·운영 API를 사용하지 않는 localhost 전용 검증이다.
const base = process.env.STATUS_QA_BASE || 'http://127.0.0.1:4198';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = path.resolve('docs/status-responsive-20261107');
fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
const capture = process.env.STATUS_QA_SCREENSHOTS !== '0';
const keys = ['publicCatalog', 'authSession', 'communityRead', 'communityWrite', 'marketplaceRead', 'studioLocalEditing', 'studioProjectRead', 'studioCloudSave', 'realtimeCollaboration', 'publishing', 'serverAi'];
const longIncident = 'inc_' + 'longidentifier'.repeat(16);
const longRequest = 'req_' + 'longidentifier'.repeat(16);
function report(healthy = false) {
  return {
    status: healthy ? 'available' : 'degraded',
    incidentId: healthy ? null : longIncident,
    retryAfterSeconds: healthy ? null : 3600,
    checkedAt: new Date().toISOString(),
    capabilities: Object.fromEntries(keys.map(key => [key, healthy || key === 'publicCatalog' || key === 'studioLocalEditing' ? 'available' : key === 'authSession' || key === 'serverAi' ? 'degraded' : 'unavailable'])),
  };
}
const conditions = [
  { id: 'mobile-320', width: 320, height: 844 },
  { id: 'mobile-390', width: 390, height: 844, flows: true },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'desktop-1440', width: 1440, height: 900, flows: true },
  { id: 'desktop-zoom200', width: 1440, height: 900, zoom: 2 },
  { id: 'mobile-light', width: 390, height: 844, theme: 'light' },
  { id: 'mobile-contrast', width: 390, height: 844, theme: 'contrast' },
  { id: 'desktop-reduced-motion', width: 1440, height: 900, reducedMotion: 'reduce' },
  { id: 'mobile-forced-colors', width: 390, height: 844, forcedColors: 'active' },
  { id: 'mobile-english', width: 320, height: 844, locale: 'en' },
  { id: 'mobile-image-error', width: 390, height: 844, imageError: true },
];
const results = [];
const browser = await chromium.launch({ headless: true });
async function screenshot(page, id) {
  if (capture) await page.locator('.service-status-page').screenshot({ path: path.join(output, 'screenshots', id + '.png') });
}
async function audit(page) {
  const axe = await new AxeBuilder({ page }).include('.service-status-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return axe.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(({ target }) => target) }));
}
async function metrics(page) {
  return page.locator('.service-status-page').evaluate(root => ({
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    clipped: Array.from(root.querySelectorAll('p, dd, h1, h2, h3, li, button, a')).filter(el => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0).map(el => ({ tag: el.tagName, text: el.textContent.slice(0, 60), width: el.clientWidth, content: el.scrollWidth })),
    cards: root.querySelectorAll('.service-status-page__capabilities > li').length,
    actions: Array.from(root.querySelectorAll('button, a')).map(el => ({ text: el.textContent, minHeight: getComputedStyle(el).minHeight, height: getComputedStyle(el).height, className: el.className })),
    incidentText: root.querySelector('.service-status-page__reference > div:last-child dd')?.textContent,
    actionMinHeight: Math.min(...Array.from(root.querySelectorAll('button, a')).map(el => el.getBoundingClientRect().height)),
    actionMinWidth: Math.min(...Array.from(root.querySelectorAll('button, a')).map(el => el.getBoundingClientRect().width)),
    columns: getComputedStyle(root.querySelector('.service-status-page__capabilities')).gridTemplateColumns.split(' ').length,
    incident: root.querySelector('.service-status-page__reference dd:last-child')?.textContent,
  }));
}
try {
  for (const condition of conditions.filter(item => !process.env.STATUS_QA_ONLY || item.id === process.env.STATUS_QA_ONLY)) {
    const context = await browser.newContext({
      viewport: { width: condition.width, height: condition.height },
      hasTouch: condition.width < 640,
      reducedMotion: condition.reducedMotion || 'no-preference',
      forcedColors: condition.forcedColors || 'none',
    });
    await context.addInitScript(({ theme, locale }) => {
      localStorage.setItem('webtoon.onboarding.seen', '1');
      localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: locale }, version: 0 }));
      localStorage.setItem('toonstudio-theme', JSON.stringify({ state: { preference: theme, studioPreference: 'inherit' }, version: 0 }));
    }, { theme: condition.theme || 'starlight', locale: condition.locale || 'ko' });
    let mode = 'degraded';
    let probes = 0;
    let delay = 0;
    await context.route('**/api/**', async route => {
      if (!route.request().url().includes('/health/capabilities')) {
        return route.fulfill({ status: 503, json: { error: 'isolated_status_qa' } });
      }
      probes++;
      const current = mode;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (current === 'error') return route.fulfill({
        status: 503, headers: { 'retry-after': '3600', 'x-request-id': longRequest },
        json: { message: '로컬 검증: 연결을 확인해 주세요.', requestId: longRequest, retryAfterSeconds: 3600 },
      });
      return route.fulfill({ json: report(current === 'healthy') });
    });
    if (condition.imageError) await context.route(/\.(?:png|jpg|webp)(?:\?.*)?$/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/status', { waitUntil: 'domcontentloaded' });
    const root = page.locator('.service-status-page');
    await root.locator('li').first().waitFor({ timeout: 90000 });
    await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden', timeout: 20000 });
    if (condition.zoom) await page.addStyleTag({ content: 'html { zoom: 2; }' });
    await page.evaluate(() => document.fonts.ready);
    const measured = await metrics(page);
    assert.equal(measured.documentOverflow, false, condition.id + ': overflow');
    assert.deepEqual(measured.clipped, [], condition.id + ': clipped content');
    assert.equal(measured.cards, 11);
    assert(measured.actionMinHeight >= 44 && measured.actionMinWidth >= 44, JSON.stringify(measured));
    const refreshName = condition.locale === 'en' ? 'Check again' : '지금 다시 확인';
    const refresh = root.getByRole('button', { name: refreshName, exact: true });
    await refresh.focus();
    const focus = await refresh.evaluate(el => ({ visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle }));
    assert.equal(focus.visible, true);
    assert.notEqual(focus.outline, 'none');
    const violations = await audit(page);
    assert.deepEqual(violations, [], condition.id + ': accessibility');
    await screenshot(page, condition.id);
    let flow = 'not-run';
    if (condition.flows) {
      const flowResult = {};
      mode = 'error';
      await refresh.focus();
      await page.keyboard.press('Enter');
      await root.getByRole('alert').waitFor();
      assert.equal(await root.locator('li').count(), 11);
      assert.match(await root.getByRole('alert').innerText(), /req_longidentifier/);
      assert.equal(await root.locator('section').first().getAttribute('aria-labelledby'), 'status-check-error-title');
      const errorMetrics = await metrics(page);
      assert.deepEqual(errorMetrics.clipped, []);
      assert.equal(errorMetrics.documentOverflow, false);
      const errorAxe = await audit(page);
      assert.deepEqual(errorAxe, []);
      await screenshot(page, condition.id + '-error');
      const help = root.getByRole('link', { name: '도움말 보기' });
      if (condition.width < 640) await help.tap(); else await help.click();
      await page.waitForURL('**/help');
      await page.getByRole('heading', { level: 1, name: '막힌 곳을 풀고, 다음 컷으로.' }).waitFor({ timeout: 60000 });
      await page.goBack();
      await root.getByRole('alert').waitFor();
      await page.goForward();
      await page.getByRole('heading', { level: 1, name: '막힌 곳을 풀고, 다음 컷으로.' }).waitFor();
      await page.goBack();
      await root.getByRole('alert').waitFor();
      flowResult.helpHistory = 'passed';
      const retry = root.getByRole('button', { name: '상태 확인 다시 시도', exact: true });
      const beforeRetry = probes;
      delay = 1200;
      await retry.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.service-status-page__capabilities')?.getAttribute('aria-busy') === 'true');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('.service-status-page__capabilities')?.getAttribute('aria-busy') === 'false');
      assert.equal(probes - beforeRetry, 1, 'duplicate retries');
      assert.equal(await root.locator('li').count(), 11);
      assert.equal(await retry.evaluate(el => el === document.activeElement), true);
      flowResult.failedRetry = 'passed';
      mode = 'healthy';
      await retry.focus();
      await page.keyboard.press('Enter');
      await root.getByRole('alert').waitFor({ state: 'detached' });
      await root.getByRole('heading', { level: 1, name: '현재 주요 기능이 정상입니다.' }).waitFor();
      await page.waitForFunction(() => document.activeElement?.textContent?.includes('지금 다시 확인'));
      assert.equal(await root.locator('li').count(), 11);
      assert.equal(await root.locator('li').filter({ hasText: '일시 중지' }).count(), 0);
      await screenshot(page, condition.id + '-recovered');
      flowResult.recoveryAndFocus = 'passed';
      const feedback = root.getByRole('link', { name: '문제 제보하기' });
      if (condition.width < 640) await feedback.tap(); else await feedback.click();
      await page.waitForURL('**/feedback');
      await page.getByRole('heading', { level: 1, name: /더 나은 창작 경험/ }).waitFor({ timeout: 60000 });
      await page.goBack();
      await root.getByRole('heading', { level: 1, name: '현재 주요 기능이 정상입니다.' }).waitFor();
      flowResult.feedbackBack = 'passed';
      flow = { ...flowResult, errorMetrics, errorAxe };
    }
    assert.deepEqual(errors, [], condition.id + ': runtime errors');
    results.push({ id: condition.id, metrics: measured, focus, axe: violations, flow, errors });
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({
      base, dataMode: '모든 API는 로컬 fixture. 상태 API 성공·실패·복구, 나머지는 503. 실제 전송 없음.',
      zoomMethod: 'CSS zoom 2; 실제 브라우저 UI 확대는 미검증', results,
    }, null, 2) + '\n');
    console.log(condition.id + ' passed');
    await context.close();
  }
} finally { await browser.close(); }
