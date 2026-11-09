// 로컬 합성 오류 화면에서 랭킹 보조 정보 밀도와 반복 조작을 검증한다.
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert/strict');
const base = process.env.QA_BASE || 'http://127.0.0.1:5301';
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const results = [];
  try {
    for (const width of [320, 390, 834, 1440]) {
      const context = await browser.newContext({viewport: {width, height: 1000}, reducedMotion: 'reduce', serviceWorkers: 'block'});
      await context.route('**/*', r => {
        const u = new URL(r.request().url());
        if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/data/')) return r.fulfill({status: 503, json: {error: '합성 검증 오류'}});
        return u.origin === base ? r.continue() : r.abort();
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/ranking`);
      await page.getByRole('heading', {name: '통합 랭킹', exact: true}).waitFor({timeout: 90000});
      await page.getByRole('button', {name: '재시도', exact: true}).waitFor();
      await page.waitForTimeout(6500);
      const nav = page.getByRole('navigation', {name: '랭킹 다음 행동'});
      for (const theme of ['starlight', 'light', 'contrast']) {
        await page.evaluate(async theme => { const {useTheme} = await import('/src/shared/lib/theme.ts'); useTheme.getState().setPreference(theme); }, theme);
        const geometry = await nav.evaluate(e => ({overflow: document.documentElement.scrollWidth-innerWidth, height: e.getBoundingClientRect().height, links: [...e.querySelectorAll('a')].map(a => ({height:a.getBoundingClientRect().height,width:a.getBoundingClientRect().width,text:a.textContent,href:a.getAttribute('href')}))}));
        assert.equal(geometry.overflow, 0); assert.equal(geometry.links.length, 3);
        assert.ok(geometry.links.every(l => l.height>=44 && l.width>=44));
        assert.ok(geometry.height<=100);
        await nav.evaluate(e => e.scrollIntoView({block: 'center'}));
        if (theme === 'light') assert.notEqual(await page.locator('#ranking-board summary').first().evaluate(e => getComputedStyle(e).color), 'rgb(241, 245, 249)');
        await page.screenshot({path:`${__dirname}/ranking-${width}-${theme}.png`});
        results.push({width,theme,geometry});
      }
      const disclosures = page.locator('.ranking-page-support');
      for (let i=0;i<await disclosures.count();i++) {
        const d=disclosures.nth(i), summary=d.locator(':scope > summary');
        for(let n=0;n<2;n++) {
          await summary.focus(); await page.keyboard.press('Enter');
          assert.equal(await d.evaluate(e=>e.open), true);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth), 0);
          await summary.focus(); await page.keyboard.press('Enter');
          assert.equal(await d.evaluate(e=>e.open), false);
        }
      }
      const filters=page.getByRole('button',{name:'필터',exact:true});
      await filters.click(); assert.equal(await filters.getAttribute('aria-expanded'),'true');
      await filters.click(); assert.equal(await filters.getAttribute('aria-expanded'),'false');
      await nav.getByRole('link',{name:/조건으로 탐색/}).click(); await page.waitForURL('**/explore');
      await page.goBack(); await nav.waitFor(); assert.equal(new URL(page.url()).pathname,'/ranking');
      assert.deepEqual(errors,[]); await context.close();
    }
    fs.writeFileSync(`${__dirname}/results.json`,JSON.stringify(results,null,2));
    console.log(JSON.stringify({passed:results.length}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
