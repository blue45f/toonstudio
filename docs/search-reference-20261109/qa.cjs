// 실행: PLAYWRIGHT_MODULE=/설치된/playwright node docs/search-reference-20261109/qa.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const assert = require('assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5297';
const titles = ['달빛 도서관', '별의 기록', '숲의 문', '하늘의 정원'].map((title, i) => ({
  id: `qa-search-${i}`, slug: `qa-search-${i}`, type: 'webtoon', title, author: '합성 검증 작가', genres: ['판타지'], tags: [], synopsis: '시안 검증 전용 합성 자료', cover: ['#334455', '#554466'], status: 'ongoing', ageRating: '15', releaseYear: 2025, updateDays: ['월'], availability: [],
  stats: { views: 1200, likes: 34, bookmarks: 12, ratingAvg: 9.8, ratingCount: 42, ratingDist: [1, 2, 5, 20, 72], rankDelta: 0, trendingScore: 88, completionRate: 86, bingeIndex: 92 },
}));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const width of [320, 390, 834, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await context.route('**/*', async r => {
        const u = new URL(r.request().url());
        if (u.pathname === '/api/search') return r.fulfill({ json: { items: titles, typeCount: { webtoon: 4, webnovel: 0 }, topTags: [] } });
        if (u.pathname.startsWith('/api/')) return r.fulfill({ json: { items: [], data: [], user: null } });
        if (u.origin === base) return r.continue();
        return r.abort();
      });
      await page.goto(`${base}/search?q=판타지`);
      const nav = page.getByRole('navigation', { name: '유형별 검색 바로가기' });
      await nav.waitFor({ timeout: 90000 });
      await page.waitForTimeout(2000);
      const details = page.getByTestId('search-other-types-details');
      const summary = details.locator('summary');
      assert.equal(await details.evaluate(e => e.open), false);
      for (let i = 0; i < 3; i++) {
        await summary.click(); assert.equal(await details.evaluate(e => e.open), true);
        await page.keyboard.press('Enter'); assert.equal(await details.evaluate(e => e.open), false);
      }
      assert.equal(await page.locator('#search-explorer-query').inputValue(), '판타지');
      if (width < 1024) {
        const filter = page.locator('button[aria-controls="search-mobile-filter-sheet"]');
        await filter.click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await filter.evaluate(e => document.activeElement === e), true);
      } else {
        const sidebar = page.locator('.search-page-results > section > aside > div');
        const scroll = await sidebar.evaluate(e => { e.scrollTop = e.scrollHeight; return { top: e.scrollTop, height: e.clientHeight, content: e.scrollHeight }; });
        assert.ok(scroll.top > 0);
      }
      if (width === 390) {
        await nav.getByRole('link', { name: '페이지', exact: true }).click();
        await page.waitForURL('**/sitemap?menu=*');
        assert.equal(new URL(page.url()).searchParams.get('menu'), '판타지');
        await page.goBack();
        await nav.waitFor();
        assert.equal(await page.locator('#search-explorer-query').inputValue(), '판타지');
      }
      for (const theme of ['starlight', 'light', 'contrast']) {
        await page.evaluate(async theme => { const { useTheme } = await import('/src/shared/lib/theme.ts'); useTheme.getState().setPreference(theme); }, theme);
        assert.equal(await page.locator('html').getAttribute('data-design-theme'), theme);
        await nav.scrollIntoViewIfNeeded();
        const geometry = await nav.evaluate(e => ({ overflow: document.documentElement.scrollWidth - innerWidth, links: [...e.querySelectorAll('a')].map(a => ({ height: a.getBoundingClientRect().height, width: a.getBoundingClientRect().width, href: a.getAttribute('href') })) }));
        assert.equal(geometry.overflow, 0);
        assert.ok(geometry.links.every(a => a.height >= 44 && a.width >= 44));
        await page.locator('.search-other-types').screenshot({ path: `${__dirname}/types-${width}-${theme}.png` });
        results.push({ width, theme, geometry, errors: [...errors] });
      }
      await page.evaluate(async () => { const { useTheme } = await import('/src/shared/lib/theme.ts'); useTheme.getState().setPreference('starlight'); });
      await page.evaluate(() => { window.scrollTo(0, 0); const sidebar = document.querySelector('.search-page-results > section > aside > div'); if (sidebar) sidebar.scrollTop = 0; if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${__dirname}/search-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    }
    fs.writeFileSync(`${__dirname}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ passed: results.length, widths: [320, 390, 834, 1440], themes: ['starlight', 'light', 'contrast'] }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
