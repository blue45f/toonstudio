// 로컬 앱과 합성 오류 응답만 사용하는 탐색 시안 검증.
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert/strict');
const base = 'http://127.0.0.1:5299';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const width of [320, 390, 834, 1440]) {
      const context = await browser.newContext({viewport: {width, height: 1000}, reducedMotion: 'reduce', serviceWorkers: 'block'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await context.route('**/*', r => {
        const u = new URL(r.request().url());
        if (u.pathname === '/data/home.json') return r.fulfill({status: 503, json: {error: '합성 검증 오류'}});
        if (u.pathname.startsWith('/api/')) return r.fulfill({json: {items: [], data: [], user: null}});
        return u.origin === base ? r.continue() : r.abort();
      });
      await page.goto(`${base}/discover`);
      const nav = page.getByRole('navigation', {name: '장르로 바로 찾기'});
      await nav.waitFor({timeout: 90000});
      await page.waitForTimeout(6000);
      if (process.env.QA_BEFORE) {
        await page.screenshot({path: `${__dirname}/before-${width}.png`});
        await context.close(); continue;
      }
      for (const theme of ['starlight', 'light', 'contrast']) {
        await page.evaluate(async theme => { const { useTheme } = await import('/src/shared/lib/theme.ts'); useTheme.getState().setPreference(theme); }, theme);
        const geometry = await nav.evaluate(e => ({overflow: document.documentElement.scrollWidth - innerWidth, scroll: e.querySelector('ul').scrollWidth - e.querySelector('ul').clientWidth, links: [...e.querySelectorAll('a')].map(a => ({text: a.textContent, width: a.getBoundingClientRect().width, height: a.getBoundingClientRect().height}))}));
        assert.equal(geometry.overflow, 0);
        assert.equal(geometry.scroll, 0);
        const visible = geometry.links.filter(l => l.width > 0);
        assert.equal(visible.length, width < 1024 ? 4 : 8);
        assert.ok(visible.every(l => l.height >= 44));
        assert.ok(visible.some(l => l.text.includes('전체 장르')));
        await page.screenshot({path: `${__dirname}/discover-${width}-${theme}.png`});
        results.push({width, theme, geometry});
      }
      const input = page.getByRole('searchbox', {name: '작품명·작가·태그 검색'});
      await input.fill('달 & 별');
      const clear = page.getByRole('button', {name: '검색어 지우기'});
      const box = await clear.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await clear.click(); assert.equal(await input.inputValue(), '');
      await input.fill('달 & 별');
      await nav.getByRole('link', {name: '전체 장르'}).click();
      await page.waitForURL('**/explore');
      await page.goBack(); await nav.waitFor();
      assert.equal(await input.inputValue(), '달 & 별');
      await page.getByRole('search').getByRole('button', {name: '검색', exact: true}).click();
      await page.waitForURL('**/search?*');
      assert.equal(new URL(page.url()).searchParams.get('q'), '달 & 별');
      assert.deepEqual(errors, []);
      await context.close();
    }
    if (!process.env.QA_BEFORE) fs.writeFileSync(`${__dirname}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({passed: results.length, before: Boolean(process.env.QA_BEFORE)}));
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
