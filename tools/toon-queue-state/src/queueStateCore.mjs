/**
 * ToonStudio 생성 작업 큐 순수 상태머신 (toon-queue-state)
 *
 * - 외부 API / 실제 이미지 생성 / 네트워크 / 타이머 I/O가 전혀 없는 순수 함수형 상태머신
 * - 모든 상태와 하위 엔티티는 `Object.freeze`로 불변성(Immutability)을 보장
 * - 기존 12 UI 설계, 예약 코어(Reservation Core), JSON Manifest 검증기와 코드 소유를 공유하지 않음
 */

export const JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export const TERMINAL_STATUSES = Object.freeze(
  new Set([JOB_STATUS.SUCCEEDED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED]),
);

export const EVENT_TYPE = Object.freeze({
  ENQUEUE: "ENQUEUE",
  DISPATCH: "DISPATCH",
  PROGRESS: "PROGRESS",
  SUCCEED: "SUCCEED",
  FAIL: "FAIL",
  CANCEL: "CANCEL",
  TICK: "TICK",
  SET_CONCURRENCY: "SET_CONCURRENCY",
});

export const REJECT_REASON = Object.freeze({
  NONE: null,
  DUPLICATE_EVENT_ID: "DUPLICATE_EVENT_ID",
  IDEMPOTENT_DUPLICATE: "IDEMPOTENT_DUPLICATE",
  IDEMPOTENCY_PAYLOAD_MISMATCH: "IDEMPOTENCY_PAYLOAD_MISMATCH",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  ALREADY_TERMINAL: "ALREADY_TERMINAL",
  DUPLICATE_COMPLETION: "DUPLICATE_COMPLETION",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  STALE_RUN_TOKEN: "STALE_RUN_TOKEN",
  STALE_ATTEMPT: "STALE_ATTEMPT",
  CONCURRENCY_LIMIT_REACHED: "CONCURRENCY_LIMIT_REACHED",
  BACKOFF_NOT_ELAPSED: "BACKOFF_NOT_ELAPSED",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
});

export const DEFAULT_BACKOFF_POLICY = Object.freeze({
  strategy: "exponential", // "exponential" | "linear" | "fixed"
  baseDelayMs: 1_000,
  factor: 2,
  maxDelayMs: 30_000,
  jitterRatio: 0, // 0..1 결정론적 시드 기반 지터 비율
});

/**
 * 종단 상태(succeeded, failed, cancelled) 여부를 판별합니다.
 * @param {string} status
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

/**
 * ToonStudio `packages/core/src/production/automation-execution.ts` 패턴과 호환되는
 * 32비트 FNV-1a 결정론적 해시 유틸리티입니다.
 * @param {string} value
 * @param {number} [seed=0x811c9dc5]
 * @returns {number}
 */
export function hash32(value, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 시드 문자열로부터 [0, 1) 구간의 재현 가능한 실수를 반환합니다.
 * @param {string} seedStr
 * @returns {number}
 */
export function deterministicUnitHash(seedStr) {
  return hash32(String(seedStr), 0x811c9dc5) / 0x100000000;
}

/**
 * 객체 키 순서에 무관하게 동일한 정규화 문자열 지문(Canonical Fingerprint)을 생성합니다.
 * @param {unknown} value
 * @returns {string}
 */
export function stableFingerprint(value) {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value !== "object") {
    return `${typeof value}:${String(value)}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableFingerprint(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${stableFingerprint(value[k])}`,
  );
  return `{${entries.join(",")}}`;
}

/**
 * 재시도 대기 시간(backoffMs)을 순수 계산합니다.
 * @param {number} failedAttemptNumber 방금 실패한 시도 번호 (1부터 시작)
 * @param {Partial<typeof DEFAULT_BACKOFF_POLICY>} [policyInput]
 * @param {string} [jitterSeed=""]
 * @returns {number}
 */
export function computeBackoffMs(
  failedAttemptNumber,
  policyInput = {},
  jitterSeed = "",
) {
  const policy = { ...DEFAULT_BACKOFF_POLICY, ...policyInput };
  const attemptIndex = Math.max(1, Math.floor(Number(failedAttemptNumber) || 1));
  const base = Math.max(0, Number(policy.baseDelayMs ?? 1_000));
  const maxDelay = Math.max(base, Number(policy.maxDelayMs ?? 30_000));
  const factor = Math.max(1, Number(policy.factor ?? 2));

  let rawDelay;
  if (policy.strategy === "fixed") {
    rawDelay = base;
  } else if (policy.strategy === "linear") {
    rawDelay = base * attemptIndex;
  } else {
    rawDelay = base * Math.pow(factor, attemptIndex - 1);
  }

  const cappedDelay = Math.min(maxDelay, rawDelay);
  const jitterRatio = Math.min(1, Math.max(0, Number(policy.jitterRatio ?? 0)));
  if (jitterRatio === 0) {
    return Math.round(cappedDelay);
  }

  const unit = deterministicUnitHash(`${jitterSeed}#attempt:${attemptIndex}`);
  const offset = (unit * 2 - 1) * jitterRatio * cappedDelay;
  return Math.max(0, Math.min(maxDelay, Math.round(cappedDelay + offset)));
}

/**
 * 초기 큐 상태를 생성합니다.
 * @param {object} [options]
 * @param {number} [options.maxConcurrency=2]
 * @param {number} [options.defaultMaxRetries=3]
 * @param {Partial<typeof DEFAULT_BACKOFF_POLICY>} [options.backoffPolicy]
 * @param {number} [options.initialNowMs=0]
 */
export function createInitialQueueState(options = {}) {
  const maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? 2));
  const defaultMaxRetries = Math.max(
    0,
    Math.floor(options.defaultMaxRetries ?? 3),
  );
  const backoffPolicy = Object.freeze({
    ...DEFAULT_BACKOFF_POLICY,
    ...(options.backoffPolicy || {}),
  });
  const nowMs = Number(options.initialNowMs ?? 0);

  return Object.freeze({
    nowMs,
    maxConcurrency,
    defaultMaxRetries,
    backoffPolicy,
    nextEnqueueSeq: 1,
    nextDispatchSeq: 1,
    jobsById: Object.freeze({}),
    jobOrder: Object.freeze([]),
    idempotencyIndex: Object.freeze({}),
    processedEventIds: Object.freeze({}),
    ignoredEvents: Object.freeze([]),
    transitionLog: Object.freeze([]),
  });
}

export function cloneStateWith(state, patch) {
  return Object.freeze({
    ...state,
    ...patch,
  });
}

export function recordIgnoredEvent(state, event, reason, nowMs, extra = {}) {
  const entry = Object.freeze({
    eventType: event?.type ?? "UNKNOWN",
    jobId: event?.jobId ?? null,
    eventId: event?.eventId ?? null,
    runToken: event?.runToken ?? null,
    attempt: event?.attempt ?? null,
    reason,
    atMs: nowMs,
    ...extra,
  });
  return Object.freeze([...state.ignoredEvents, entry]);
}

export function recordTransition(
  state,
  jobId,
  fromStatus,
  toStatus,
  eventType,
  atMs,
  meta = {},
) {
  const entry = Object.freeze({
    jobId,
    fromStatus,
    toStatus,
    eventType,
    atMs,
    ...meta,
  });
  return Object.freeze([...state.transitionLog, entry]);
}

/**
 * 현재 `running` 상태인 모든 작업 목록을 반환합니다.
 */
export function getRunningJobs(state) {
  const list = [];
  for (const jobId of state.jobOrder) {
    const job = state.jobsById[jobId];
    if (job && job.status === JOB_STATUS.RUNNING) {
      list.push(job);
    }
  }
  return Object.freeze(list);
}

/**
 * `nowMs` 시점에 실행 가능한 `queued` 작업들을 우선순위·재시도 가능 시각·등록 순번 순으로 반환합니다.
 */
export function getEligibleQueuedJobs(state, nowMs = state.nowMs) {
  const candidates = [];
  for (const jobId of state.jobOrder) {
    const job = state.jobsById[jobId];
    if (
      job &&
      job.status === JOB_STATUS.QUEUED &&
      job.nextEligibleAtMs <= nowMs
    ) {
      candidates.push(job);
    }
  }
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    if (a.nextEligibleAtMs !== b.nextEligibleAtMs) {
      return a.nextEligibleAtMs - b.nextEligibleAtMs;
    }
    return a.enqueueSeq - b.enqueueSeq;
  });
  return Object.freeze(candidates);
}

/**
 * 여유 동시성 슬롯 한도 내에서 실행 가능한 `queued` 작업을 `running`으로 전이시킵니다.
 */
export function scheduleEligibleJobs(state, nowMs, triggerEventType) {
  let currentState = state;
  const effects = [];
  const dispatchedJobIds = [];

  while (true) {
    const runningCount = getRunningJobs(currentState).length;
    if (runningCount >= currentState.maxConcurrency) {
      break;
    }
    const eligible = getEligibleQueuedJobs(currentState, nowMs);
    if (eligible.length === 0) {
      break;
    }
    const nextJob = eligible[0];
    const nextAttempt = nextJob.attempt + 1;
    const dispatchSeq = currentState.nextDispatchSeq;
    const runToken = `${nextJob.jobId}:attempt-${nextAttempt}:seq-${dispatchSeq}`;

    const updatedJob = Object.freeze({
      ...nextJob,
      status: JOB_STATUS.RUNNING,
      attempt: nextAttempt,
      activeRunToken: runToken,
      startedAtMs: nowMs,
      updatedAtMs: nowMs,
      progress: 0,
    });

    const jobsById = Object.freeze({
      ...currentState.jobsById,
      [nextJob.jobId]: updatedJob,
    });

    const transitionLog = recordTransition(
      currentState,
      nextJob.jobId,
      JOB_STATUS.QUEUED,
      JOB_STATUS.RUNNING,
      triggerEventType,
      nowMs,
      { attempt: nextAttempt, runToken },
    );

    currentState = cloneStateWith(currentState, {
      nowMs,
      nextDispatchSeq: dispatchSeq + 1,
      jobsById,
      transitionLog,
    });

    dispatchedJobIds.push(nextJob.jobId);
    effects.push(
      Object.freeze({
        type: "EXECUTE_JOB",
        jobId: nextJob.jobId,
        attempt: nextAttempt,
        runToken,
        payload: updatedJob.payload,
        scheduledAtMs: nowMs,
      }),
    );
  }

  return { state: currentState, effects, dispatchedJobIds };
}

/**
 * 순수 상태 전이 함수.
 * 입력 `state`를 절대 변경하지 않으며 `{ state, effects, outcome }`을 반환합니다.
 */

/**
 * 중첩 객체·배열을 재귀적으로 깊은 복사(Deep Clone)하고 모든 노드를 `Object.freeze`로 동결합니다.
 * 외부 호출자가 입력 객체의 중첩 프로퍼티를 사후 변경하더라도 큐 내부 스냅샷과 멱등 지문이 오염되지 않도록 보장합니다.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreezeClone(value) {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return Object.freeze(new Date(value.getTime()));
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepFreezeClone(item)));
  }
  const copy = {};
  for (const key of Object.keys(value)) {
    copy[key] = deepFreezeClone(value[key]);
  }
  return Object.freeze(copy);
}

export function getQueueSnapshotSummary(state) {
  const counts = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    total: state.jobOrder.length,
  };
  for (const jobId of state.jobOrder) {
    const job = state.jobsById[jobId];
    if (job && Object.prototype.hasOwnProperty.call(counts, job.status)) {
      counts[job.status] += 1;
    }
  }
  return Object.freeze({
    nowMs: state.nowMs,
    maxConcurrency: state.maxConcurrency,
    counts: Object.freeze(counts),
    ignoredEventCount: state.ignoredEvents.length,
    transitionCount: state.transitionLog.length,
  });
}
