import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 로컬 격리 서버만 사용하며 모든 API는 실패 fixture로 막는다.
const base = process.env.ABOUT_QA_BASE || 'http://127.0.0.1:4197';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = path.resolve('docs/about-responsive-20261107');
fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
const captureScreenshots = process.env.ABOUT_QA_SCREENSHOTS !== '0';
const browser = await chromium.launch({ headless: true });
const conditions = [
  { id: 'mobile-320', width: 320, height: 844 },
  { id: 'mobile-390', width: 390, height: 844 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'desktop-1440', width: 1440, height: 900 },
  { id: 'desktop-zoom200', width: 1440, height: 900, zoom: 2 },
  { id: 'mobile-light', width: 390, height: 844, theme: 'light' },
  { id: 'mobile-contrast', width: 390, height: 844, theme: 'contrast' },
  { id: 'desktop-reduced-motion', width: 1440, height: 900, reducedMotion: 'reduce' },
  { id: 'mobile-forced-colors', width: 390, height: 844, forcedColors: 'active' },
  { id: 'mobile-english', width: 390, height: 844, locale: 'en' },
  { id: 'mobile-image-error', width: 390, height: 844, imageError: true },
];
const results = [];
try {
  for (const condition of conditions) {
    const context = await browser.newContext({ viewport: condition, hasTouch: condition.width < 640, reducedMotion: condition.reducedMotion || 'no-preference', forcedColors: condition.forcedColors || 'none' });
    const copy = condition.locale === 'en' ? { nav: 'On this page', jump: 'Start by role', drawing: 'Drawing' } : { nav: '이 페이지 바로가기', jump: '내 역할로 시작', drawing: '드로잉' };
    await context.addInitScript(({ theme, locale }) => {
      localStorage.setItem('webtoon.onboarding.seen', '1');
      localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: locale }, version: 0 }));
      localStorage.setItem('toonstudio-theme', JSON.stringify({ state: { preference: theme, studioPreference: 'inherit' }, version: 0 }));
    }, { theme: condition.theme || 'starlight', locale: condition.locale || 'ko' });
    await context.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'local_about_offline_fixture' }) }));
    if (condition.imageError) await context.route(/\.(?:png|jpg|webp)(?:\?.*)?$/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/about`, { waitUntil: 'domcontentloaded' });
    await page.locator('#about-features-title').waitFor({ timeout: 90000 });
    // 첫 방문 인트로가 실제로 끝난 뒤 화면과 조작을 검증한다.
    await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden', timeout: 20000 });
    if (condition.zoom) await page.addStyleTag({ content: `html { zoom: ${condition.zoom}; }` });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.locator('.about-overview').evaluate((root) => ({
      bodyOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      steps: Array.from(root.querySelectorAll('.about-overview__steps a')).map((el) => ({ text: el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
      filmCount: root.querySelectorAll('.about-overview__films a').length,
      resourceCount: root.querySelectorAll('.about-overview__resources a').length,
      promises: root.querySelectorAll('.about-overview__values li').length,
      clippedRails: ['.about-overview__values', '.about-overview__steps', '.about-overview__films'].filter((selector) => { const el = root.querySelector(selector); return el.scrollWidth > el.clientWidth + 1; }),
      jumpMinHeight: Math.min(...Array.from(root.querySelectorAll('.about-overview__jumps a')).map((el) => el.getBoundingClientRect().height)),
    }));
    assert.equal(metrics.bodyOverflow, false, `${condition.id}: page overflow`);
    assert.equal(metrics.clippedRails.length, 0, `${condition.id}: hidden content`);
    assert.equal(metrics.steps.length, 4);
    assert.equal(metrics.filmCount, 2);
    assert.equal(metrics.promises, 3);
    assert.equal(metrics.resourceCount, 11);
    assert(metrics.jumpMinHeight >= 44);
    const jump = page.getByRole('navigation', { name: copy.nav }).getByRole('link', { name: copy.jump });
    await jump.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'about-audience-title');
    const summary = page.locator('.about-overview__resources > summary');
    await summary.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('.about-overview__resources')?.open === true);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('.about-overview__resources')?.open === false);
    const drawing = page.getByRole('tab', { name: copy.drawing, exact: true });
    await drawing.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: '3D', exact: true }).getAttribute('aria-selected'), 'true');
    await drawing.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    if (captureScreenshots) await page.screenshot({ path: path.join(output, 'screenshots', `${condition.id}.png`), fullPage: true });
    await summary.click();
    if (captureScreenshots && condition.id === 'mobile-390') await page.locator('.about-overview__resources').screenshot({ path: path.join(output, 'screenshots', 'mobile-390-resources-open.png') });
    const axe = await new AxeBuilder({ page }).include('.about-overview').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    await summary.click();
    const violations = axe.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(({ target }) => target) }));
    // 실제 콘텐츠 링크 이동 및 브라우저 뒤로/앞으로. 외부 저장·발행 작업은 실행하지 않는다.
    if (condition.id === 'mobile-390') {
      const link = page.getByRole('list', { name: '소개 영상' }).getByRole('link', { name: /24초 브랜드 필름/ });
      await link.tap();
      await page.waitForURL('**/brand-film');
      await page.goBack();
      await page.locator('#about-features-title').waitFor();
      await page.goForward();
      await page.waitForURL('**/brand-film');
      await page.goBack();
      await page.locator('#about-features-title').waitFor();
    }
    results.push({ id: condition.id, theme: await page.locator('html').getAttribute('data-design-theme'), metrics, keyboard: 'passed', history: condition.id === 'mobile-390' ? 'passed' : 'not-run', axe: violations, errors });
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ base, results, zoomMethod: 'CSS zoom 2; OS browser zoom not tested', dataMode: 'API 503 fixture; guest page only' }, null, 2) + '\n');
    console.log(condition.id, JSON.stringify({ violations, errors, metrics }));
    assert.equal(violations.length, 0, `${condition.id}: accessibility violation`);
    assert.equal(errors.length, 0, `${condition.id}: runtime error`);
    await context.close();
  }
} finally { await browser.close(); }
