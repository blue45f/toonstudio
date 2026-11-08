import fs from 'node:fs';
import { chromium } from '@playwright/test';
const out = 'docs/status-responsive-20261107/screenshots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem('webtoon.onboarding.seen', '1');
    localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: 'en' }, version: 0 }));
  });
  await page.route('**/api/**', route => {
    if (route.request().url().includes('/health/capabilities')) return route.fulfill({ json: {
      status: 'degraded', incidentId: 'inc_' + 'longidentifier'.repeat(16), retryAfterSeconds: 3600, checkedAt: new Date().toISOString(),
      capabilities: Object.fromEntries(['publicCatalog','authSession','communityRead','communityWrite','marketplaceRead','studioLocalEditing','studioProjectRead','studioCloudSave','realtimeCollaboration','publishing','serverAi'].map((key,i) => [key, i % 3 === 0 ? 'available' : i % 3 === 1 ? 'degraded' : 'unavailable']))
    }});
    return route.fulfill({ status: 503, json: { error: 'isolated_status_qa' } });
  });
  await page.goto('http://127.0.0.1:4198/status');
  await page.locator('#capability-status-title').waitFor({ timeout: 90000 });
  await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden', timeout: 20000 });
  await page.getByText('inc_' + 'longidentifier'.repeat(16), { exact: false }).waitFor();
  await page.screenshot({ path: out + '/before-mobile-english.png', fullPage: true });
  console.log(JSON.stringify(await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))));
} finally { await browser.close(); }
