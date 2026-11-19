import { chromium } from 'playwright';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applySearchObservationEvidence, createProductionSearchBudget, createSearchRequestTracker, isCreatorResourceSearch, isProductionObservation } from './public-site-observation-policy.mjs';

// Read-only observation: no sign-in, payment, upload, deletion or form submission.
// A successful process means evidence was captured, NOT that all features passed.
const root = process.env.AUDIT_REPOSITORY || process.cwd();
const output = process.env.AUDIT_OUTPUT || path.join(root, 'public-site-audit');
const base = new URL(process.env.AUDIT_BASE_URL || 'https://www.toonstudio.cloud');
if (!['www.toonstudio.cloud', 'toonstudio.cloud', '127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Audit origin is not allow-listed');
const productionObservation = isProductionObservation(base);
const searchBudget = productionObservation ? createProductionSearchBudget() : undefined;
const pageObservations = new WeakMap();
await mkdir(output, { recursive: true });
const groupDir = path.join(root, 'apps/web/src/app/routes/groups');
// These legacy entrypoints were observed redirecting into the excluded editor.
const studioAliases = new Set(['/make', '/brush-lab', '/creator-hub', '/music', '/publishing', '/shaper']);
const concrete = new Set(['/', '/learn', '/learn/glossary', '/learn/studio', '/admin']);
const deferred = [];
const excluded = [];
for (const name of (await readdir(groupDir)).filter((name) => name.endsWith('.routes.tsx'))) {
  const source = await readFile(path.join(groupDir, name), 'utf8');
  for (const [, route] of source.matchAll(/\bpath:\s*["']([^"']+)["']/g)) {
    if (route === '/studio' || route.startsWith('/studio/') || studioAliases.has(route)) excluded.push({ route, reason: 'User excluded Studio, including legacy aliases' });
    else if (route.includes(':') || route.includes('*')) deferred.push({ route, reason: 'Needs a real record or an explicit nested-route fixture' });
    else if (route.startsWith('/')) concrete.add(route);
  }
}
const priority = ['/', '/discover', '/search', '/ranking', '/explore', '/research', '/learn', '/market', '/showcase', '/community', '/library', '/my', '/settings', '/help', '/about'];
const routes = [...concrete].sort((a, b) => {
  const ai = priority.indexOf(a); const bi = priority.indexOf(b);
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
});
// 작업 시간 제한으로 종료되어도 전체 예정 경로와 완료한 관측 증거를 보존한다.
await writeFile(path.join(output, 'inventory.json'), JSON.stringify({ routes, deferred, excluded, viewports: [1440, 390] }, null, 2));
const progressPath = path.join(output, 'observations.ndjson');
await writeFile(progressPath, '');
let progressWrites = Promise.resolve();
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const results = [];
try {
  let auditUserAgent;
  if (productionObservation) {
    const identityPage = await browser.newPage();
    try {
      auditUserAgent = `${await identityPage.evaluate(() => navigator.userAgent)} ToonStudio-PublicSite-Audit/1.0`;
    } finally {
      await identityPage.close();
    }
  }
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport, locale: 'ko-KR', reducedMotion: 'reduce',
      ...(auditUserAgent ? { userAgent: auditUserAgent } : {}),
    });
    // Block both document navigation and SPA redirects into the excluded editor.
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.isNavigationRequest() && (url.pathname === '/studio' || url.pathname.startsWith('/studio/'))) {
        await route.abort('blockedbyclient');
        return;
      }
      const observation = searchBudget && isCreatorResourceSearch(url, base)
        ? pageObservations.get(request.frame().page()) : undefined;
      if (!observation) {
        await route.continue();
        return;
      }
      const signal = observation.tracker.start(request, observation.controller.signal);
      try {
        await searchBudget.acquire(signal);
        signal.throwIfAborted();
        observation.tracker.dispatched(request);
        await route.continue();
      } catch (error) {
        observation.tracker.finish(request);
        if (!signal.aborted) throw error;
        // 클라이언트의 개별 요청 취소와 페이지 종료 모두 대기 중 전송을 막는다.
        await route.abort('aborted').catch(() => undefined);
      }
    });
    await context.addInitScript(() => {
      for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        history[method] = function (state, unused, url) {
          const pathname = url == null ? location.pathname : new URL(String(url), location.href).pathname;
          if (pathname === '/studio' || pathname.startsWith('/studio/')) throw new DOMException('Studio is excluded from this audit', 'AbortError');
          return original.call(this, state, unused, url);
        };
      }
    });
    let cursor = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < routes.length) {
        const route = routes[cursor++];
        const page = await context.newPage();
        const tracker = createSearchRequestTracker();
        const controller = new AbortController();
        pageObservations.set(page, { tracker, controller });
        const errors = [];
        const failedRequests = [];
        const apiFailures = [];
        const result = { route, viewport: viewport.width, errors, failedRequests, apiFailures, searchRequestFailures: 0 };
        page.on('pageerror', (error) => errors.push(error.message.slice(0, 350)));
        page.on('requestfailed', (request) => {
          tracker.finish(request, { failed: true });
          if (isCreatorResourceSearch(request.url(), base)) result.searchRequestFailures += 1;
          if (failedRequests.length < 20) failedRequests.push({ path: new URL(request.url()).pathname, reason: request.failure()?.errorText });
        });
        page.on('requestfinished', (request) => tracker.finish(request));
        page.on('response', (response) => {
          const url = new URL(response.url());
          if (searchBudget && isCreatorResourceSearch(url, base) && response.status() === 429) searchBudget.observeRateLimit(response.headers()['retry-after']);
          if (response.status() >= 400 && url.origin === base.origin && apiFailures.length < 20) apiFailures.push({ path: url.pathname, status: response.status() });
        });
        try {
          const response = await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.locator('#main-content').waitFor({ timeout: 15000 });
          await page.waitForTimeout(1800);
          if (searchBudget && !await tracker.wait()) {
            result.loadPolicyDeferred = { pendingAtDeadline: tracker.size, reason: '검색 요청 예산 대기가 120초를 초과했습니다. 완료되지 않은 검색 결과는 검증하지 않았습니다.' };
            controller.abort();
          }
          result.status = response?.status();
          result.finalPath = new URL(page.url()).pathname;
          result.title = await page.title();
          result.view = await page.evaluate(() => {
            const main = document.querySelector('#main-content');
            const visible = (element) => element.getClientRects().length > 0;
            return {
              headings: [...document.querySelectorAll('h1,h2')].filter(visible).slice(0, 14).map((element) => element.textContent?.trim()),
              body: (main?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2200),
              overflow: document.documentElement.scrollWidth - window.innerWidth,
              links: [...document.querySelectorAll('a[href]')].filter(visible).map((element) => ({ text: element.textContent?.trim().slice(0, 80), href: element.getAttribute('href') })).slice(0, 100),
              unnamedButtons: [...document.querySelectorAll('button')].filter(visible).filter((element) => !element.textContent?.trim() && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !element.getAttribute('title')).length,
            };
          });
          const file = `${viewport.width}-${route === '/' ? 'home' : route.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
          await page.screenshot({ path: path.join(output, file), fullPage: false });
          result.screenshot = file;
          result.observation = errors.length || result.view.overflow > 2 || (result.status ?? 0) >= 400 || apiFailures.length || result.loadPolicyDeferred ? 'needs-review' : 'rendered';
          applySearchObservationEvidence(result, tracker.queuedCancellations);
          if (result.finalPath !== route) result.observation = 'redirected-needs-review';
        } catch (error) {
          result.observation = 'blocked-or-failed';
          result.failure = String(error).slice(0, 700);
        } finally {
          controller.abort();
          await page.close();
          applySearchObservationEvidence(result, tracker.queuedCancellations);
          results.push(result);
          const progress = `${JSON.stringify(result)}\n`;
          progressWrites = progressWrites.then(() => writeFile(progressPath, progress, { flag: 'a' }));
          await progressWrites;
          console.log(JSON.stringify({ route, viewport: viewport.width, observation: result.observation, title: result.title, overflow: result.view?.overflow, failure: result.failure }));
        }
      }
    }));
    await context.close();
  }
} finally {
  await browser.close();
  const report = { date: new Date().toISOString(), base: base.origin, mode: 'read-only unauthenticated observation, not full feature verification', loadPolicy: searchBudget?.snapshot() ?? null, routes, deferred, excluded, results };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  const count = (status) => results.filter((result) => result.observation === status).length;
  const summary = `# Public site browser observation\n\nOrigin: ${base.origin}\n\n${results.length} observations across ${routes.length} concrete routes, desktop and mobile.\n\nRendered: ${count('rendered')}; needs review: ${count('needs-review')}; redirects: ${count('redirected-needs-review')}; blocked: ${count('blocked-or-failed')}.\n\nThis is not a claim of authenticated, mutation, payment, or full feature coverage. Studio paths and known legacy editor aliases were excluded. ${deferred.length} parameterized/nested definitions require separate fixtures.\n`;
  await writeFile(path.join(output, 'SUMMARY.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
}
