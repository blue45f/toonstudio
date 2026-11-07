import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.ABOUT_QA_BASE || 'http://127.0.0.1:4197';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390 });
    await context.addInitScript(() => {
      localStorage.setItem('webtoon.onboarding.seen', '1');
      localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: 'ko' }, version: 0 }));
    });
    await context.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    const page = await context.newPage();
    await page.goto(`${base}/about`);
    await page.locator('#about-audience-title').waitFor();
    await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden', timeout: 20000 });
    await page.getByRole('navigation', { name: '이 페이지 바로가기' }).getByRole('link', { name: '내 역할로 시작' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '/story-lab');
    const film = page.getByRole('list', { name: '소개 영상' }).getByRole('link', { name: /24초 브랜드 필름/ });
    if (width === 390) await film.tap(); else await film.click();
    await page.locator('.brand-film-page #creator-film').waitFor();
    await page.getByTestId('creator-film-play').waitFor();
    const destinationHeading = await page.locator('.brand-film-page h1').innerText();
    await page.goBack();
    await page.locator('#about-audience-title').waitFor();
    assert.equal(new URL(page.url()).pathname, '/about');
    await page.goForward();
    await page.locator('.brand-film-page #creator-film').waitFor();
    await page.goBack();
    await page.locator('#about-audience-title').waitFor();
    const summary = page.locator('.about-overview__resources > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.locator('.about-overview__resources a[href="/features"]').click();
    await page.waitForURL('**/features');
    const featureHeading = page.getByRole('heading', { level: 1, name: '툰스튜디오의 모든 기능을 한눈에.' });
    await featureHeading.waitFor();
    const resourceHeading = await featureHeading.innerText();
    await page.goBack();
    await page.locator('#about-features-title').waitFor();
    results.push({ width, result: 'passed', keyboardContinuesIntoSelectedSection: true, filmDestinationRendered: destinationHeading, resourceDestinationRendered: resourceHeading, browserBackForward: true, mediaPlayback: 'not-run', studioSavePublish: 'not-run' });
    await context.close();
  }
  fs.writeFileSync('docs/about-responsive-20261107/navigation-report.json', JSON.stringify({ base, results }, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
