import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const { test } = process.env.VITEST ? await import('vitest') : await import('node:test');
import {
  applySearchObservationEvidence,
  buildObservationKey,
  createProductionSearchBudget,
  createSearchRequestTracker,
  isCreatorResourceSearch,
  isProductionObservation,
  PRODUCTION_SEARCH_POLICY,
  retryAfterDelayMs,
} from './public-site-observation-policy.mjs';

test('같은 PR·SHA·시간 구간만 재사용하고 다음 구간과 다른 변경은 새로 관측한다', () => {
  const input = { sha: 'a'.repeat(40), pullRequest: 2830, now: Date.UTC(2026, 10, 19, 1, 5) };
  const key = buildObservationKey(input);
  assert.equal(buildObservationKey({ ...input, now: input.now + 30 * 60_000 }), key);
  assert.notEqual(buildObservationKey({ ...input, now: input.now + 60 * 60_000 }), key);
  assert.notEqual(buildObservationKey({ ...input, pullRequest: 2831 }), key);
  assert.notEqual(buildObservationKey({ ...input, sha: 'b'.repeat(40) }), key);
  assert.notEqual(buildObservationKey({ ...input, pullRequest: undefined }), key);
  assert.throws(() => buildObservationKey({ ...input, sha: 'main' }), /40자리/u);
});

test('후보 로컬 관측과 외부 URL에는 운영 검색 예산을 적용하지 않는다', () => {
  assert.equal(isProductionObservation('https://www.toonstudio.cloud'), true);
  assert.equal(isProductionObservation('https://toonstudio.cloud'), true);
  assert.equal(isProductionObservation('http://127.0.0.1:5281'), false);
  assert.equal(isProductionObservation('http://localhost:5281'), false);
  const base = 'https://www.toonstudio.cloud';
  assert.equal(isCreatorResourceSearch(`${base}/api/creator-resources/search?q=test`, base), true);
  assert.equal(isCreatorResourceSearch(`${base}/api/health/live`, base), false);
  assert.equal(isCreatorResourceSearch('https://example.com/api/creator-resources/search', base), false);
});

test('동시 페이지와 뷰포트의 검색을 합산하여 분당 15회와 최소 간격을 지킨다', async () => {
  let clock = 0;
  const budget = createProductionSearchBudget({ now: () => clock, sleep: async (ms) => { clock += ms; } });
  const results = await Promise.all(Array.from({ length: 34 }, () => budget.acquire()));
  const dispatches = results.map((result) => result.waitMs);
  assert.equal(dispatches[0], 0);
  for (let i = 1; i < dispatches.length; i += 1) {
    assert.ok(dispatches[i] - dispatches[i - 1] >= PRODUCTION_SEARCH_POLICY.minimumIntervalMs);
    assert.ok(dispatches.filter((time) => time > dispatches[i] - 60_000 && time <= dispatches[i]).length <= 15);
  }
  assert.equal(budget.snapshot().dispatched, 34);
  assert.equal(budget.snapshot().delayed, 33);
});

test('429의 초·HTTP 날짜를 존중하며 누락되면 30초 기다린다', async () => {
  const start = Date.UTC(2026, 10, 19, 1, 0);
  assert.equal(retryAfterDelayMs('45', start), 45_000);
  assert.equal(retryAfterDelayMs(new Date(start + 90_000).toUTCString(), start), 90_000);
  assert.equal(retryAfterDelayMs(new Date(start - 1000).toUTCString(), start), 0);
  assert.equal(retryAfterDelayMs(undefined, start), 30_000);
  assert.equal(retryAfterDelayMs('invalid', start), 30_000);
  assert.equal(retryAfterDelayMs('-1', start), 30_000);
  assert.equal(retryAfterDelayMs('1.5', start), 30_000);
  assert.equal(retryAfterDelayMs('9'.repeat(400), start), 30_000);
  let clock = start;
  const waits = [];
  const budget = createProductionSearchBudget({ now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
  await budget.acquire();
  budget.observeRateLimit('45');
  await budget.acquire();
  assert.deepEqual(waits, [45_000]);
  assert.equal(budget.snapshot().dispatched, 2);
  assert.equal(budget.snapshot().rateLimited, 1);
});

test('이미 기다리는 요청도 뒤늦은 429에 맞춰 재계산하고 자동 재전송하지 않는다', async () => {
  let clock = 0;
  const waits = [];
  const budget = createProductionSearchBudget({
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      if (waits.length === 1) budget.observeRateLimit('45');
      clock += ms;
    },
  });
  await budget.acquire();
  await budget.acquire();
  assert.equal(clock, 45_000);
  assert.deepEqual(waits, [4100, 40_900]);
  assert.equal(budget.snapshot().dispatched, 2);
});

test('닫힌 페이지의 대기는 취소하고 다음 페이지는 계속 관측한다', async () => {
  let clock = 0;
  const budget = createProductionSearchBudget({ now: () => clock, sleep: async (ms) => { clock += ms; } });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(budget.acquire(controller.signal), { name: 'AbortError' });
  await budget.acquire();
  assert.equal(budget.snapshot().dispatched, 1);
});

test('지연한 검색의 성공·실패 종료 전에는 캡처를 진행하지 않는다', async () => {
  const tracker = createSearchRequestTracker();
  const first = {};
  const second = {};
  tracker.start(first);
  tracker.start(second);
  let finished = false;
  const observation = tracker.wait(1000).then((completed) => { finished = completed; });
  tracker.finish(first);
  await Promise.resolve();
  assert.equal(finished, false);
  tracker.finish(second);
  await observation;
  assert.equal(finished, true);
  assert.equal(tracker.size, 0);
});

test('유한 대기를 넘긴 검색은 완료로 처리하지 않고 보류 수를 보존한다', async () => {
  const tracker = createSearchRequestTracker();
  const request = {};
  tracker.start(request);
  assert.equal(await tracker.wait(1), false);
  assert.equal(tracker.size, 1);
  tracker.finish(request);
  assert.equal(await tracker.wait(1), true);
});

test('45초 정책 대기 중 30초 클라이언트 취소는 전송하지 않고 보류 증거로 남긴다', async () => {
  let clock = 0;
  let cancelSleep;
  let waiting;
  const sleepStarted = new Promise((resolve) => { waiting = resolve; });
  const budget = createProductionSearchBudget({
    now: () => clock,
    sleep: (ms, signal) => new Promise((resolve, reject) => {
      cancelSleep = () => { clock += ms; resolve(); };
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      waiting();
    }),
  });
  budget.observeRateLimit('45');
  const tracker = createSearchRequestTracker();
  const request = {};
  const page = new AbortController();
  const signal = tracker.start(request, page.signal);
  const pending = budget.acquire(signal);
  await sleepStarted;
  clock = 30_000;
  tracker.finish(request, { failed: true });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  assert.equal(page.signal.aborted, false);
  assert.equal(tracker.queuedCancellations, 1);
  assert.equal(tracker.size, 0);
  assert.equal(await tracker.wait(1), true);
  assert.equal(budget.snapshot().dispatched, 0);
  const result = applySearchObservationEvidence({ observation: 'rendered', searchRequestFailures: 1 }, tracker.queuedCancellations);
  assert.equal(result.observation, 'needs-review');
  assert.equal(result.loadPolicyDeferred.queuedCancellations, 1);
  // 취소한 요청이 예산을 소비하거나 다음 페이지를 막지 않는다.
  const next = budget.acquire(new AbortController().signal);
  await Promise.resolve();
  cancelSleep();
  await next;
  assert.equal(budget.snapshot().dispatched, 1);
});

test('전송 후 네트워크 실패와 페이지 종료는 대기 중 클라이언트 취소와 구분한다', () => {
  const tracker = createSearchRequestTracker();
  const sent = {};
  const queued = {};
  const page = new AbortController();
  tracker.start(sent, page.signal);
  tracker.dispatched(sent);
  tracker.finish(sent, { failed: true });
  assert.equal(tracker.queuedCancellations, 0);
  const failures = [{ path: '/api/creator-resources/search', reason: 'net::ERR_CONNECTION_RESET' }];
  const result = applySearchObservationEvidence({ observation: 'rendered', failedRequests: failures, searchRequestFailures: 1 }, tracker.queuedCancellations);
  assert.equal(result.observation, 'needs-review');
  assert.equal(result.loadPolicyDeferred, undefined);
  assert.deepEqual(result.failedRequests, failures);
  const signal = tracker.start(queued, page.signal);
  page.abort();
  assert.equal(signal.aborted, true);
});

test('운영 관측만 직렬화·중복 억제하며 후보 회귀와 전체 경로 탐색은 유지한다', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/public-site-experience.yml', import.meta.url), 'utf8'));
  const production = workflow.jobs['production-observation'];
  const candidate = workflow.jobs['candidate-regression'];
  assert.deepEqual(production.concurrency, { group: 'public-site-production-observation', 'cancel-in-progress': false });
  const restore = production.steps.find((step) => step.uses === 'actions/cache/restore@v6');
  assert.equal(restore.with.key, '${{ steps.observation-window.outputs.key }}');
  assert.equal(restore.with['restore-keys'], undefined);
  const save = production.steps.find((step) => step.uses === 'actions/cache/save@v6');
  assert.match(save.if, /success\(\)/u);
  assert.equal(candidate.if, undefined);
  assert.equal(candidate.concurrency, undefined);
  const candidateRuns = candidate.steps.map((step) => step.run ?? '').join('\n');
  assert.match(candidateRuns, /pnpm run build:bundle/u);
  assert.match(candidateRuns, /verify-public-webtoon-experience\.mjs/u);
  assert.match(candidateRuns, /verify-public-site-experience\.mjs/u);
  assert.match(candidateRuns, /AUDIT_BASE_URL=http:\/\/127\.0\.0\.1:5281.*audit-public-site-experience\.mjs/u);
  const script = readFileSync(new URL('./audit-public-site-experience.mjs', import.meta.url), 'utf8');
  assert.match(script, /width: 1440/u);
  assert.match(script, /width: 390/u);
  assert.match(script, /while \(cursor < routes\.length\)/u);
  assert.match(script, /result\.loadPolicyDeferred/u);
  assert.match(script, /result\.searchRequestFailures/u);
  assert.match(script, /tracker\.finish\(request, \{ failed: true \}\)/u);
});
