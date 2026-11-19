import { setTimeout as delay } from 'node:timers/promises';

export const PRODUCTION_SEARCH_POLICY = Object.freeze({
  requestsPerMinute: 15,
  minimumIntervalMs: 4100,
  windowMs: 60_000,
  pageWaitMs: 120_000,
});

export function buildObservationKey({ sha, pullRequest, now = Date.now() }) {
  if (!/^[a-f\d]{40}$/u.test(sha)) throw new Error('관측 SHA는 40자리 Git 커밋이어야 합니다.');
  if (pullRequest && !/^\d+$/u.test(String(pullRequest))) throw new Error('관측 PR 번호가 올바르지 않습니다.');
  if (!Number.isFinite(now)) throw new Error('관측 시각이 올바르지 않습니다.');
  return `public-site-observation-v1-${pullRequest ? `pr-${pullRequest}` : 'direct'}-${sha}-${Math.floor(now / 3_600_000)}`;
}

export function isProductionObservation(base) {
  return ['www.toonstudio.cloud', 'toonstudio.cloud'].includes(new URL(base).hostname);
}

export function isCreatorResourceSearch(url, base) {
  const request = new URL(url);
  return request.origin === new URL(base).origin && request.pathname === '/api/creator-resources/search';
}

export function retryAfterDelayMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return 30_000;
  const text = value.trim();
  if (/^\d+$/u.test(text)) {
    const duration = Number(text) * 1000;
    return Number.isSafeInteger(duration) ? duration : 30_000;
  }
  if (!/^[a-z]{3,9}(?:,| )/iu.test(text)) return 30_000;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : 30_000;
}

export function applySearchObservationEvidence(result, queuedCancellations) {
  if (queuedCancellations > 0) {
    result.loadPolicyDeferred = {
      ...result.loadPolicyDeferred,
      queuedCancellations,
      reason: result.loadPolicyDeferred?.reason || '관측 예산 대기 중 클라이언트가 검색 요청을 취소했습니다. 서버에 전송되지 않은 검색은 검증하지 않았습니다.',
    };
  }
  if ((result.loadPolicyDeferred || result.searchRequestFailures) && result.observation === 'rendered') result.observation = 'needs-review';
  return result;
}

// 모든 페이지와 뷰포트가 하나의 예산을 공유한다. 429 응답 자체를 자동 재시도하지 않는다.
export function createProductionSearchBudget({ now = Date.now, sleep = (ms, signal) => delay(ms, undefined, { signal }) } = {}) {
  const dispatches = [];
  const stats = { dispatched: 0, delayed: 0, waitMs: 0, rateLimited: 0 };
  let tail = Promise.resolve();
  let nextAllowedAt = 0;
  let cooldownUntil = 0;
  return {
    acquire(signal) {
      const requestedAt = now();
      const pending = tail.then(async () => {
        for (;;) {
          signal?.throwIfAborted();
          const current = now();
          while (dispatches.length && dispatches[0] <= current - PRODUCTION_SEARCH_POLICY.windowMs) dispatches.shift();
          const windowAvailableAt = dispatches.length >= PRODUCTION_SEARCH_POLICY.requestsPerMinute
            ? dispatches[0] + PRODUCTION_SEARCH_POLICY.windowMs : current;
          const waitMs = Math.max(nextAllowedAt, cooldownUntil, windowAvailableAt) - current;
          if (waitMs > 0) {
            await sleep(Math.min(waitMs, PRODUCTION_SEARCH_POLICY.pageWaitMs), signal);
            continue;
          }
          dispatches.push(current);
          nextAllowedAt = current + PRODUCTION_SEARCH_POLICY.minimumIntervalMs;
          stats.dispatched += 1;
          const totalWaitMs = current - requestedAt;
          if (totalWaitMs > 0) stats.delayed += 1;
          stats.waitMs += totalWaitMs;
          return { waitMs: totalWaitMs };
        }
      });
      // 종료한 페이지의 취소가 뒤에 대기 중인 다른 페이지의 관측을 막지 않는다.
      tail = pending.catch(() => undefined);
      return pending;
    },
    observeRateLimit(retryAfter) {
      stats.rateLimited += 1;
      cooldownUntil = Math.max(cooldownUntil, now() + retryAfterDelayMs(retryAfter, now()));
    },
    snapshot() {
      return { ...PRODUCTION_SEARCH_POLICY, ...stats, cooldownUntil };
    },
  };
}

// 느리게 전송한 검색 요청의 완료까지 기다린 뒤 화면을 캡처한다.
// 유한 대기 시간이 끝나면 보류 사실을 보고서에 남기고 해당 페이지의 대기를 취소한다.
export function createSearchRequestTracker() {
  const pending = new Map();
  let queuedCancellations = 0;
  let idleResolvers = [];
  return {
    start(request, pageSignal) {
      const controller = new AbortController();
      const signal = pageSignal ? AbortSignal.any([pageSignal, controller.signal]) : controller.signal;
      pending.set(request, { controller, dispatched: false });
      return signal;
    },
    dispatched(request) {
      const entry = pending.get(request);
      if (entry) entry.dispatched = true;
    },
    finish(request, { failed = false } = {}) {
      const entry = pending.get(request);
      if (entry && failed) {
        if (!entry.dispatched) queuedCancellations += 1;
        entry.controller.abort();
      }
      pending.delete(request);
      if (pending.size === 0) {
        for (const resolve of idleResolvers) resolve();
        idleResolvers = [];
      }
    },
    get size() { return pending.size; },
    get queuedCancellations() { return queuedCancellations; },
    async wait(timeoutMs = PRODUCTION_SEARCH_POLICY.pageWaitMs) {
      const deadline = Date.now() + timeoutMs;
      while (pending.size) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        let timer;
        let onIdle;
        try {
          const completed = await Promise.race([
            new Promise((resolve) => { onIdle = resolve; idleResolvers.push(resolve); }),
            new Promise((resolve) => { timer = setTimeout(() => resolve(false), remaining); }),
          ]);
          if (completed === false) return false;
        } finally {
          clearTimeout(timer);
          idleResolvers = idleResolvers.filter((resolve) => resolve !== onIdle);
        }
      }
      return true;
    },
  };
}
