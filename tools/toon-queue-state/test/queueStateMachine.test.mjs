/**
 * ToonStudio 생성 작업 큐 순수 상태머신 32개 자동 테스트 스위트
 * 실행 명령:
 *   /Users/hjunkim/.nvm/versions/node/v24.22.1/bin/node --test test/queueStateMachine.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  JOB_STATUS,
  EVENT_TYPE,
  REJECT_REASON,
  isTerminalStatus,
  stableFingerprint,
  computeBackoffMs,
  createInitialQueueState,
  getRunningJobs,
  transitionQueueState,
  FakeClock,
  QueueHarness,
} from "../src/index.mjs";

test("T01: 초기 큐 상태 생성 시 기본값과 Object.freeze 불변 컬렉션을 보장한다", () => {
  const state = createInitialQueueState({
    maxConcurrency: 3,
    defaultMaxRetries: 4,
    initialNowMs: 1_000,
  });
  assert.equal(state.nowMs, 1_000);
  assert.equal(state.maxConcurrency, 3);
  assert.equal(state.defaultMaxRetries, 4);
  assert.equal(state.jobOrder.length, 0);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.jobsById));
});

test("T02: ENQUEUE(autoDispatch=false)는 작업을 즉시 실행하지 않고 queued 상태로 유지한다", () => {
  const state0 = createInitialQueueState({
    maxConcurrency: 2,
    initialNowMs: 500,
  });
  const { state: state1, effects, outcome } = transitionQueueState(state0, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-1",
    payload: { projectId: "proj-1", shotId: "shot-01", tool: "background" },
    autoDispatch: false,
  });
  assert.equal(outcome.accepted, true);
  assert.equal(effects.length, 0);
  assert.equal(state1.jobsById["job-1"].status, JOB_STATUS.QUEUED);
  assert.equal(state1.jobsById["job-1"].attempt, 0);
});

test("T03: ENQUEUE(기본 autoDispatch=true)는 동시성 여유 슬롯이 있을 때 queued -> running으로 전이하고 EXECUTE_JOB 이펙트를 방출한다", () => {
  const state0 = createInitialQueueState({
    maxConcurrency: 2,
    initialNowMs: 1_000,
  });
  const { state: state1, effects, outcome } = transitionQueueState(state0, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-1",
    payload: { panel: 1 },
  });
  assert.equal(outcome.accepted, true);
  assert.equal(state1.jobsById["job-1"].status, JOB_STATUS.RUNNING);
  assert.equal(state1.jobsById["job-1"].attempt, 1);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].type, "EXECUTE_JOB");
  assert.equal(effects[0].jobId, "job-1");
});

test("T04: running -> succeeded 전이 시 progress=100, result, completedAtMs를 기록하고 activeRunToken을 해제한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-1",
    payload: { panel: 1 },
  }).state;
  const runToken = state.jobsById["job-1"].activeRunToken;

  const suc = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-1",
    runToken,
    attempt: 1,
    result: { artifactUrl: "mock://panel-1.webp" },
    nowMs: 250,
  });
  const job = suc.state.jobsById["job-1"];
  assert.equal(suc.outcome.accepted, true);
  assert.equal(job.status, JOB_STATUS.SUCCEEDED);
  assert.equal(job.progress, 100);
  assert.equal(job.activeRunToken, null);
  assert.equal(job.completedAtMs, 250);
  assert.equal(job.result.artifactUrl, "mock://panel-1.webp");
});

test("T05: 재시도 가능 실패(retryable=true) 발생 시 running -> queued로 전이하고 backoff 타이머를 예약한다", () => {
  let state = createInitialQueueState({
    maxConcurrency: 1,
    defaultMaxRetries: 2,
    backoffPolicy: {
      strategy: "exponential",
      baseDelayMs: 1_000,
      factor: 2,
      maxDelayMs: 10_000,
      jitterRatio: 0,
    },
    initialNowMs: 1_000,
  });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-retry",
    payload: { panel: 2 },
  }).state;

  const token1 = state.jobsById["job-retry"].activeRunToken;
  const failRes = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "job-retry",
    runToken: token1,
    errorCode: "RENDER_TIMEOUT",
    errorMessage: "Timed out",
    retryable: true,
    nowMs: 1_500,
  });

  assert.equal(failRes.outcome.accepted, true);
  assert.equal(failRes.outcome.retrying, true);
  assert.equal(failRes.outcome.backoffMs, 1_000);
  assert.equal(failRes.outcome.nextEligibleAtMs, 2_500);

  const job = failRes.state.jobsById["job-retry"];
  assert.equal(job.status, JOB_STATUS.QUEUED);
  assert.equal(job.attempt, 1);
  assert.equal(job.nextEligibleAtMs, 2_500);
  assert.equal(job.retryHistory.length, 1);
  assert.equal(failRes.effects[0].type, "SCHEDULE_RETRY_TIMER");
});

test("T06: retryable=false 치명적 실패 발생 시 남은 재시도 횟수가 있어도 즉시 running -> failed로 전이한다", () => {
  let state = createInitialQueueState({
    maxConcurrency: 1,
    defaultMaxRetries: 3,
    initialNowMs: 100,
  });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-fatal",
    payload: { invalidPrompt: true },
  }).state;

  const token = state.jobsById["job-fatal"].activeRunToken;
  const failRes = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "job-fatal",
    runToken: token,
    errorCode: "INVALID_PARAMETERS",
    errorMessage: "Unrecoverable input error",
    retryable: false,
    nowMs: 200,
  });

  assert.equal(failRes.outcome.accepted, true);
  assert.equal(failRes.outcome.retrying, false);
  assert.equal(failRes.state.jobsById["job-fatal"].status, JOB_STATUS.FAILED);
  assert.equal(failRes.state.jobsById["job-fatal"].completedAtMs, 200);
});

test("T07: 최대 재시도 횟수(maxRetries)를 모두 소진하면 running -> failed 종단 상태로 전이한다", () => {
  const clock = new FakeClock(1_000);
  const harness = new QueueHarness({
    clock,
    maxConcurrency: 1,
    defaultMaxRetries: 2,
    backoffPolicy: {
      strategy: "exponential",
      baseDelayMs: 500,
      factor: 2,
      maxDelayMs: 5_000,
      jitterRatio: 0,
    },
  });

  harness.executor.setJobScript("job-exhaust", [
    { durationMs: 100, outcome: "fail", errorCode: "E1", retryable: true },
    { durationMs: 100, outcome: "fail", errorCode: "E2", retryable: true },
    { durationMs: 100, outcome: "fail", errorCode: "E3", retryable: true },
  ]);

  harness.dispatch({
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-exhaust",
    payload: { cut: 3 },
  });

  clock.advanceTo(3_000);

  const job = harness.getJob("job-exhaust");
  assert.equal(job.status, JOB_STATUS.FAILED);
  assert.equal(job.attempt, 3);
  assert.equal(job.retryHistory.length, 3);
  assert.equal(job.completedAtMs, 2_800);
});

test("T08: 대기 중인 작업에 CANCEL 이벤트를 보내면 queued -> cancelled로 즉시 전이한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-1",
    payload: { p: 1 },
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-2",
    payload: { p: 2 },
  }).state;

  assert.equal(state.jobsById["job-2"].status, JOB_STATUS.QUEUED);

  const cancelRes = transitionQueueState(state, {
    type: EVENT_TYPE.CANCEL,
    jobId: "job-2",
    reason: "USER_ABORTED_QUEUE",
    nowMs: 150,
  });

  assert.equal(cancelRes.outcome.accepted, true);
  const job2 = cancelRes.state.jobsById["job-2"];
  assert.equal(job2.status, JOB_STATUS.CANCELLED);
  assert.equal(job2.cancelReason, "USER_ABORTED_QUEUE");
  assert.equal(job2.completedAtMs, 150);
});

test("T09: 실행 중인 작업 취소(running -> cancelled) 시 ABORT_RUNNING_ATTEMPT를 방출하고 다음 대기 작업을 즉시 디스패치한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-1",
    payload: { p: 1 },
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-2",
    payload: { p: 2 },
  }).state;

  const oldRunToken = state.jobsById["job-1"].activeRunToken;
  const cancelRes = transitionQueueState(state, {
    type: EVENT_TYPE.CANCEL,
    jobId: "job-1",
    reason: "CANCEL_ACTIVE",
    nowMs: 120,
  });

  assert.equal(cancelRes.outcome.accepted, true);
  assert.equal(
    cancelRes.state.jobsById["job-1"].status,
    JOB_STATUS.CANCELLED,
  );
  assert.equal(cancelRes.state.jobsById["job-2"].status, JOB_STATUS.RUNNING);
  assert.equal(cancelRes.effects.length, 2);
  assert.equal(cancelRes.effects[0].type, "ABORT_RUNNING_ATTEMPT");
  assert.equal(cancelRes.effects[0].runToken, oldRunToken);
  assert.equal(cancelRes.effects[1].type, "EXECUTE_JOB");
  assert.equal(cancelRes.effects[1].jobId, "job-2");
});

test("T10: 동시성 제한(maxConcurrency)을 엄격히 준수하며 작업 완료 시마다 대기 작업을 순차 디스패치한다", () => {
  const clock = new FakeClock(0);
  const harness = new QueueHarness({ clock, maxConcurrency: 2 });

  for (let i = 1; i <= 5; i += 1) {
    harness.executor.setJobScript(`job-${i}`, [
      { durationMs: 100 * i, outcome: "succeed" },
    ]);
    harness.dispatch({
      type: EVENT_TYPE.ENQUEUE,
      jobId: `job-${i}`,
      payload: { index: i },
    });
  }

  assert.equal(getRunningJobs(harness.state).length, 2);
  assert.equal(harness.getJob("job-1").status, JOB_STATUS.RUNNING);
  assert.equal(harness.getJob("job-2").status, JOB_STATUS.RUNNING);
  assert.equal(harness.getJob("job-3").status, JOB_STATUS.QUEUED);

  clock.advanceTo(100);
  assert.equal(harness.getJob("job-1").status, JOB_STATUS.SUCCEEDED);
  assert.equal(getRunningJobs(harness.state).length, 2);
  assert.equal(harness.getJob("job-3").status, JOB_STATUS.RUNNING);

  clock.advanceTo(2_000);
  const summary = harness.getSummary();
  assert.equal(summary.counts.succeeded, 5);
  assert.equal(summary.counts.running, 0);
  assert.equal(summary.counts.queued, 0);
});

test("T11: 우선순위(priority)가 높은 대기 작업을 낮은 우선순위 작업보다 먼저 디스패치한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 0 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-running",
    priority: 1,
    payload: { p: 1 },
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-low",
    priority: 1,
    payload: { p: 2 },
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-high",
    priority: 10,
    payload: { p: 3 },
  }).state;

  const token = state.jobsById["job-running"].activeRunToken;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-running",
    runToken: token,
    nowMs: 50,
  }).state;

  assert.equal(state.jobsById["job-high"].status, JOB_STATUS.RUNNING);
  assert.equal(state.jobsById["job-low"].status, JOB_STATUS.QUEUED);
});

test("T12: SET_CONCURRENCY로 동시성 한도를 높이면 대기 중인 작업을 즉시 추가 디스패치한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 0 });
  for (const id of ["j1", "j2", "j3"]) {
    state = transitionQueueState(state, {
      type: EVENT_TYPE.ENQUEUE,
      jobId: id,
      payload: { id },
    }).state;
  }
  assert.equal(getRunningJobs(state).length, 1);

  const res = transitionQueueState(state, {
    type: EVENT_TYPE.SET_CONCURRENCY,
    maxConcurrency: 3,
    nowMs: 10,
  });

  assert.equal(getRunningJobs(res.state).length, 3);
  assert.equal(res.effects.length, 2);
});

test("T13: SET_CONCURRENCY로 동시성 한도를 낮추면 실행 중인 작업을 중단하지 않되 새 한도 미만으로 내려갈 때까지 신규 디스패치를 보류한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 3, initialNowMs: 0 });
  for (const id of ["j1", "j2", "j3", "j4"]) {
    state = transitionQueueState(state, {
      type: EVENT_TYPE.ENQUEUE,
      jobId: id,
      payload: { id },
    }).state;
  }
  assert.equal(getRunningJobs(state).length, 3);
  assert.equal(state.jobsById["j4"].status, JOB_STATUS.QUEUED);

  state = transitionQueueState(state, {
    type: EVENT_TYPE.SET_CONCURRENCY,
    maxConcurrency: 1,
    nowMs: 10,
  }).state;
  assert.equal(getRunningJobs(state).length, 3);

  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "j1",
    runToken: state.jobsById["j1"].activeRunToken,
    nowMs: 20,
  }).state;
  assert.equal(getRunningJobs(state).length, 2);
  assert.equal(state.jobsById["j4"].status, JOB_STATUS.QUEUED);

  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "j2",
    runToken: state.jobsById["j2"].activeRunToken,
    nowMs: 30,
  }).state;
  assert.equal(state.jobsById["j4"].status, JOB_STATUS.QUEUED);

  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "j3",
    runToken: state.jobsById["j3"].activeRunToken,
    nowMs: 40,
  }).state;
  assert.equal(state.jobsById["j4"].status, JOB_STATUS.RUNNING);
});

test("T14: computeBackoffMs는 exponential, linear, fixed 전략과 maxDelayMs 상한 캡을 정확히 계산한다", () => {
  const expPolicy = {
    strategy: "exponential",
    baseDelayMs: 1_000,
    factor: 2,
    maxDelayMs: 5_000,
    jitterRatio: 0,
  };
  assert.equal(computeBackoffMs(1, expPolicy), 1_000);
  assert.equal(computeBackoffMs(2, expPolicy), 2_000);
  assert.equal(computeBackoffMs(3, expPolicy), 4_000);
  assert.equal(computeBackoffMs(4, expPolicy), 5_000);

  const linPolicy = {
    strategy: "linear",
    baseDelayMs: 1_000,
    maxDelayMs: 3_500,
    jitterRatio: 0,
  };
  assert.equal(computeBackoffMs(1, linPolicy), 1_000);
  assert.equal(computeBackoffMs(2, linPolicy), 2_000);
  assert.equal(computeBackoffMs(3, linPolicy), 3_000);
  assert.equal(computeBackoffMs(4, linPolicy), 3_500);

  const fixPolicy = {
    strategy: "fixed",
    baseDelayMs: 1_500,
    maxDelayMs: 5_000,
    jitterRatio: 0,
  };
  assert.equal(computeBackoffMs(1, fixPolicy), 1_500);
  assert.equal(computeBackoffMs(5, fixPolicy), 1_500);
});

test("T15: computeBackoffMs의 결정론적 지터(jitterRatio)는 동일 시드에서 항상 동일한 범위 내 값을 반환한다", () => {
  const policy = {
    strategy: "exponential",
    baseDelayMs: 1_000,
    factor: 2,
    maxDelayMs: 10_000,
    jitterRatio: 0.25,
  };
  const d1 = computeBackoffMs(2, policy, "job-seed-alpha");
  const d2 = computeBackoffMs(2, policy, "job-seed-alpha");
  const d3 = computeBackoffMs(2, policy, "job-seed-beta");

  assert.equal(d1, d2);
  assert.ok(d1 >= 1_500 && d1 <= 2_500);
  assert.ok(d3 >= 1_500 && d3 <= 2_500);
});

test("T16: 재시도 backoff 대기 중인 작업은 nextEligibleAtMs 이전에는 디스패치되지 않고 정확히 도달 시점에 디스패치된다", () => {
  let state = createInitialQueueState({
    maxConcurrency: 1,
    defaultMaxRetries: 2,
    backoffPolicy: {
      strategy: "fixed",
      baseDelayMs: 1_000,
      maxDelayMs: 5_000,
      jitterRatio: 0,
    },
    initialNowMs: 100,
  });

  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-backoff",
    payload: { cut: 1 },
  }).state;

  const token1 = state.jobsById["job-backoff"].activeRunToken;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "job-backoff",
    runToken: token1,
    retryable: true,
    nowMs: 200,
  }).state;

  const earlyDispatch = transitionQueueState(state, {
    type: EVENT_TYPE.DISPATCH,
    jobId: "job-backoff",
    nowMs: 1_199,
  });
  assert.equal(earlyDispatch.outcome.accepted, false);
  assert.equal(
    earlyDispatch.outcome.reason,
    REJECT_REASON.BACKOFF_NOT_ELAPSED,
  );
  assert.equal(
    earlyDispatch.state.jobsById["job-backoff"].status,
    JOB_STATUS.QUEUED,
  );

  const dueTick = transitionQueueState(earlyDispatch.state, {
    type: EVENT_TYPE.TICK,
    nowMs: 1_200,
  });
  assert.equal(dueTick.outcome.accepted, true);
  assert.equal(
    dueTick.state.jobsById["job-backoff"].status,
    JOB_STATUS.RUNNING,
  );
  assert.equal(dueTick.state.jobsById["job-backoff"].attempt, 2);
});

test("T17: 동일 idempotencyKey와 동일 페이로드로 재요청된 ENQUEUE는 중복 작업을 생성하지 않고 멱등 응답을 반환한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 2, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-a",
    idempotencyKey: "idem-ep1-cut1",
    payload: { episode: 1, cut: 1, style: "webtoon" },
  }).state;

  const second = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-a",
    idempotencyKey: "idem-ep1-cut1",
    payload: { style: "webtoon", cut: 1, episode: 1 },
    nowMs: 150,
  });

  assert.equal(second.outcome.accepted, true);
  assert.equal(second.outcome.deduplicated, true);
  assert.equal(second.outcome.reason, REJECT_REASON.IDEMPOTENT_DUPLICATE);
  assert.equal(second.effects.length, 0);
  assert.equal(second.state.jobOrder.length, 1);
});

test("T18: 동일 idempotencyKey에 서로 다른 페이로드로 ENQUEUE 요청 시 IDEMPOTENCY_PAYLOAD_MISMATCH로 거부한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 2, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-a",
    idempotencyKey: "idem-ep1-cut1",
    payload: { episode: 1, cut: 1 },
  }).state;

  const conflict = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-a",
    idempotencyKey: "idem-ep1-cut1",
    payload: { episode: 1, cut: 999 },
    nowMs: 120,
  });

  assert.equal(conflict.outcome.accepted, false);
  assert.equal(
    conflict.outcome.reason,
    REJECT_REASON.IDEMPOTENCY_PAYLOAD_MISMATCH,
  );
  assert.equal(conflict.state.jobOrder.length, 1);
});

test("T19: 이미 succeeded 완료된 작업과 동일한 idempotencyKey로 재요청 시 재실행 없이 완료된 작업을 그대로 반환한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-done",
    idempotencyKey: "key-done",
    payload: { scene: 7 },
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-done",
    runToken: state.jobsById["job-done"].activeRunToken,
    result: { imageId: "img-7" },
    nowMs: 200,
  }).state;

  const reEnqueue = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-done",
    idempotencyKey: "key-done",
    payload: { scene: 7 },
    nowMs: 300,
  });

  assert.equal(reEnqueue.outcome.accepted, true);
  assert.equal(reEnqueue.outcome.deduplicated, true);
  assert.equal(reEnqueue.outcome.job.status, JOB_STATUS.SUCCEEDED);
  assert.equal(reEnqueue.effects.length, 0);
});

test("T20: 이미 처리된 eventId가 재전달되면 DUPLICATE_EVENT_ID로 멱등 차단한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 2, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    eventId: "evt-001",
    jobId: "job-1",
    payload: { cut: 1 },
  }).state;

  const res2 = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    eventId: "evt-001",
    jobId: "job-2",
    payload: { cut: 2 },
    nowMs: 110,
  });

  assert.equal(res2.outcome.accepted, false);
  assert.equal(res2.outcome.deduplicated, true);
  assert.equal(res2.outcome.reason, REJECT_REASON.DUPLICATE_EVENT_ID);
  assert.equal(res2.state.jobOrder.length, 1);
});

test("T21: 동일한 runToken의 중복 SUCCEED 이벤트는 DUPLICATE_COMPLETION으로 차단하고 최초 완료 결과를 보존한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-dup",
    payload: { cut: 1 },
  }).state;

  const runToken = state.jobsById["job-dup"].activeRunToken;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-dup",
    runToken,
    result: { url: "first-valid.webp" },
    nowMs: 200,
  }).state;

  const dupSucceed = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-dup",
    runToken,
    result: { url: "second-duplicate.webp" },
    nowMs: 250,
  });

  assert.equal(dupSucceed.outcome.accepted, false);
  assert.equal(dupSucceed.outcome.deduplicated, true);
  assert.equal(dupSucceed.outcome.reason, REJECT_REASON.DUPLICATE_COMPLETION);
  assert.equal(
    dupSucceed.state.jobsById["job-dup"].result.url,
    "first-valid.webp",
  );
  assert.equal(dupSucceed.state.jobsById["job-dup"].completedAtMs, 200);
});

test("T22: 이미 SUCCEEDED된 작업에 뒤늦게 도착한 FAIL 이벤트는 ALREADY_TERMINAL로 무시한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-1",
    payload: { cut: 1 },
  }).state;
  const runToken = state.jobsById["job-1"].activeRunToken;

  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-1",
    runToken,
    nowMs: 200,
  }).state;

  const lateFail = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "job-1",
    runToken,
    errorCode: "LATE_TIMEOUT",
    nowMs: 300,
  });

  assert.equal(lateFail.outcome.accepted, false);
  assert.equal(lateFail.outcome.reason, REJECT_REASON.ALREADY_TERMINAL);
  assert.equal(lateFail.state.jobsById["job-1"].status, JOB_STATUS.SUCCEEDED);
});

test("T23: CANCELLED된 작업에 뒤늦게 도착한 SUCCEED 이벤트는 무시되며 취소 상태를 되돌리지 않는다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 100 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-cancel-race",
    payload: { cut: 1 },
  }).state;
  const runToken = state.jobsById["job-cancel-race"].activeRunToken;

  state = transitionQueueState(state, {
    type: EVENT_TYPE.CANCEL,
    jobId: "job-cancel-race",
    reason: "USER_CANCEL",
    nowMs: 150,
  }).state;

  const lateSucceed = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-cancel-race",
    runToken,
    result: { url: "ghost-output.webp" },
    nowMs: 220,
  });

  assert.equal(lateSucceed.outcome.accepted, false);
  assert.equal(lateSucceed.outcome.reason, REJECT_REASON.ALREADY_TERMINAL);
  assert.equal(
    lateSucceed.state.jobsById["job-cancel-race"].status,
    JOB_STATUS.CANCELLED,
  );
  assert.equal(lateSucceed.state.jobsById["job-cancel-race"].result, null);
});

test("T24: 2차 시도(attempt 2)가 running 중일 때 1차 시도 워커에서 뒤늦게 도착한 완료 이벤트는 STALE_RUN_TOKEN으로 펜싱 차단된다", () => {
  let state = createInitialQueueState({
    maxConcurrency: 1,
    defaultMaxRetries: 2,
    backoffPolicy: {
      strategy: "fixed",
      baseDelayMs: 500,
      maxDelayMs: 500,
      jitterRatio: 0,
    },
    initialNowMs: 100,
  });

  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-fenced",
    payload: { cut: 1 },
  }).state;
  const tokenAttempt1 = state.jobsById["job-fenced"].activeRunToken;

  state = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "job-fenced",
    runToken: tokenAttempt1,
    errorCode: "WORKER_LEASE_EXPIRED",
    retryable: true,
    nowMs: 200,
  }).state;

  state = transitionQueueState(state, {
    type: EVENT_TYPE.TICK,
    nowMs: 700,
  }).state;
  const tokenAttempt2 = state.jobsById["job-fenced"].activeRunToken;
  assert.notEqual(tokenAttempt1, tokenAttempt2);

  const staleSucceed = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-fenced",
    runToken: tokenAttempt1,
    result: { fromAttempt: 1 },
    nowMs: 750,
  });

  assert.equal(staleSucceed.outcome.accepted, false);
  assert.equal(staleSucceed.outcome.reason, REJECT_REASON.STALE_RUN_TOKEN);
  assert.equal(
    staleSucceed.state.jobsById["job-fenced"].status,
    JOB_STATUS.RUNNING,
  );
  assert.equal(
    staleSucceed.state.jobsById["job-fenced"].activeRunToken,
    tokenAttempt2,
  );

  const validSucceed = transitionQueueState(staleSucceed.state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-fenced",
    runToken: tokenAttempt2,
    result: { fromAttempt: 2 },
    nowMs: 800,
  });
  assert.equal(validSucceed.outcome.accepted, true);
  assert.equal(
    validSucceed.state.jobsById["job-fenced"].status,
    JOB_STATUS.SUCCEEDED,
  );
  assert.equal(validSucceed.state.jobsById["job-fenced"].result.fromAttempt, 2);
});

test("T25: 재시도 backoff 대기(queued) 중에 이전 시도의 늦은 SUCCEED가 도착하면 STALE_RUN_TOKEN으로 차단된다", () => {
  let state = createInitialQueueState({
    maxConcurrency: 1,
    defaultMaxRetries: 2,
    backoffPolicy: {
      strategy: "fixed",
      baseDelayMs: 1_000,
      maxDelayMs: 1_000,
      jitterRatio: 0,
    },
    initialNowMs: 100,
  });

  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-queued-backoff",
    payload: { cut: 4 },
  }).state;
  const tokenAttempt1 = state.jobsById["job-queued-backoff"].activeRunToken;

  state = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "job-queued-backoff",
    runToken: tokenAttempt1,
    retryable: true,
    nowMs: 200,
  }).state;

  assert.equal(state.jobsById["job-queued-backoff"].status, JOB_STATUS.QUEUED);

  const lateWhileQueued = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "job-queued-backoff",
    runToken: tokenAttempt1,
    nowMs: 500,
  });

  assert.equal(lateWhileQueued.outcome.accepted, false);
  assert.equal(lateWhileQueued.outcome.reason, REJECT_REASON.STALE_RUN_TOKEN);
  assert.equal(
    lateWhileQueued.state.jobsById["job-queued-backoff"].status,
    JOB_STATUS.QUEUED,
  );
});

test("T26: PROGRESS 이벤트는 활성 runToken에 대해서만 단조 증가로 반영하고 오래된 runToken은 거부한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 0 });
  state = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-prog",
    payload: { cut: 1 },
  }).state;
  const validToken = state.jobsById["job-prog"].activeRunToken;

  const p1 = transitionQueueState(state, {
    type: EVENT_TYPE.PROGRESS,
    jobId: "job-prog",
    runToken: validToken,
    progress: 45,
    nowMs: 50,
  });
  assert.equal(p1.outcome.accepted, true);
  assert.equal(p1.state.jobsById["job-prog"].progress, 45);

  const p2 = transitionQueueState(p1.state, {
    type: EVENT_TYPE.PROGRESS,
    jobId: "job-prog",
    runToken: validToken,
    progress: 20,
    nowMs: 60,
  });
  assert.equal(p2.state.jobsById["job-prog"].progress, 45);

  const pStale = transitionQueueState(p2.state, {
    type: EVENT_TYPE.PROGRESS,
    jobId: "job-prog",
    runToken: "wrong-token",
    progress: 90,
    nowMs: 70,
  });
  assert.equal(pStale.outcome.accepted, false);
  assert.equal(pStale.outcome.reason, REJECT_REASON.STALE_RUN_TOKEN);
  assert.equal(pStale.state.jobsById["job-prog"].progress, 45);
});

test("T27: 순수 상태머신 불변성 검증 — 모든 전이 호출은 이전 state 스냅샷을 절대 변경하지 않는다", () => {
  const state0 = createInitialQueueState({
    maxConcurrency: 2,
    initialNowMs: 100,
  });
  const snapshot0 = JSON.stringify(state0);

  const { state: state1 } = transitionQueueState(state0, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "imm-1",
    payload: { nested: { a: 1 } },
  });
  const snapshot1 = JSON.stringify(state1);

  transitionQueueState(state1, {
    type: EVENT_TYPE.CANCEL,
    jobId: "imm-1",
    nowMs: 200,
  });

  assert.equal(JSON.stringify(state0), snapshot0);
  assert.equal(JSON.stringify(state1), snapshot1);
});

test("T28: FakeClock + MockExecutor 통합 시뮬레이션 — 일시적 실패 2회 후 지수 backoff를 거쳐 3차 시도에서 성공한다", () => {
  const clock = new FakeClock(10_000);
  const harness = new QueueHarness({
    clock,
    maxConcurrency: 1,
    defaultMaxRetries: 3,
    backoffPolicy: {
      strategy: "exponential",
      baseDelayMs: 1_000,
      factor: 2,
      maxDelayMs: 8_000,
      jitterRatio: 0,
    },
  });

  harness.executor.setJobScript("panel-42", [
    { durationMs: 200, outcome: "fail", errorCode: "GPU_BUSY", retryable: true },
    { durationMs: 200, outcome: "fail", errorCode: "GPU_BUSY", retryable: true },
    {
      durationMs: 300,
      outcome: "succeed",
      progressSteps: [
        { atOffsetMs: 100, progress: 35 },
        { atOffsetMs: 200, progress: 75 },
      ],
      result: {
        mockArtifactUri: "mock://toonstudio/panel-42.webp",
        costUsd: 0,
      },
    },
  ]);

  harness.dispatch({
    type: EVENT_TYPE.ENQUEUE,
    jobId: "panel-42",
    payload: { episodeId: "ep-10", panelNumber: 42 },
  });

  clock.advanceTo(10_500);
  assert.equal(harness.getJob("panel-42").status, JOB_STATUS.QUEUED);
  assert.equal(harness.getJob("panel-42").attempt, 1);

  clock.advanceTo(12_000);
  assert.equal(harness.getJob("panel-42").status, JOB_STATUS.QUEUED);
  assert.equal(harness.getJob("panel-42").attempt, 2);

  clock.advanceTo(13_550);
  assert.equal(harness.getJob("panel-42").status, JOB_STATUS.RUNNING);
  assert.equal(harness.getJob("panel-42").progress, 35);

  clock.advanceTo(13_700);
  const finalJob = harness.getJob("panel-42");
  assert.equal(finalJob.status, JOB_STATUS.SUCCEEDED);
  assert.equal(finalJob.attempt, 3);
  assert.equal(finalJob.progress, 100);
  assert.equal(finalJob.result.costUsd, 0);
  assert.equal(harness.executor.executionHistory.length, 3);
});

test("T29: MockExecutor의 중복 완료 콜백 시뮬레이션이 DUPLICATE_COMPLETION으로 안전하게 흡수된다", () => {
  const clock = new FakeClock(0);
  const harness = new QueueHarness({ clock, maxConcurrency: 1 });

  harness.executor.setJobScript("job-dup-cb", [
    {
      durationMs: 100,
      outcome: "succeed",
      duplicateCompleteAfterMs: 50,
      result: { ok: true },
    },
  ]);

  harness.dispatch({
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-dup-cb",
    payload: { panel: 9 },
  });

  clock.advanceTo(200);
  const job = harness.getJob("job-dup-cb");
  assert.equal(job.status, JOB_STATUS.SUCCEEDED);
  assert.equal(harness.state.ignoredEvents.length, 1);
  assert.equal(
    harness.state.ignoredEvents[0].reason,
    REJECT_REASON.DUPLICATE_COMPLETION,
  );
});

test("T30: 종단 상태(succeeded, failed, cancelled) 작업에 대한 CANCEL 및 DISPATCH 재시도를 모두 거부한다", () => {
  let state = createInitialQueueState({ maxConcurrency: 3, initialNowMs: 0 });
  for (const id of ["j-suc", "j-fail", "j-can"]) {
    state = transitionQueueState(state, {
      type: EVENT_TYPE.ENQUEUE,
      jobId: id,
      maxRetries: 0,
      payload: { id },
    }).state;
  }

  state = transitionQueueState(state, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "j-suc",
    runToken: state.jobsById["j-suc"].activeRunToken,
    nowMs: 10,
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.FAIL,
    jobId: "j-fail",
    runToken: state.jobsById["j-fail"].activeRunToken,
    nowMs: 10,
  }).state;
  state = transitionQueueState(state, {
    type: EVENT_TYPE.CANCEL,
    jobId: "j-can",
    nowMs: 10,
  }).state;

  for (const id of ["j-suc", "j-fail", "j-can"]) {
    assert.equal(isTerminalStatus(state.jobsById[id].status), true);
    const cancelAgain = transitionQueueState(state, {
      type: EVENT_TYPE.CANCEL,
      jobId: id,
      nowMs: 20,
    });
    assert.equal(cancelAgain.outcome.accepted, false);
    assert.equal(cancelAgain.outcome.reason, REJECT_REASON.ALREADY_TERMINAL);

    const dispatchAgain = transitionQueueState(state, {
      type: EVENT_TYPE.DISPATCH,
      jobId: id,
      nowMs: 20,
    });
    assert.equal(dispatchAgain.outcome.accepted, false);
    assert.equal(dispatchAgain.outcome.reason, REJECT_REASON.ALREADY_TERMINAL);
  }
});

test("T31: 존재하지 않는 jobId 또는 잘못된 형식의 이벤트를 상태 오염 없이 거부한다", () => {
  const state0 = createInitialQueueState({
    maxConcurrency: 2,
    initialNowMs: 100,
  });
  const r1 = transitionQueueState(state0, null);
  assert.equal(r1.outcome.accepted, false);
  assert.equal(r1.outcome.reason, REJECT_REASON.INVALID_ARGUMENT);

  const r2 = transitionQueueState(state0, {
    type: EVENT_TYPE.SUCCEED,
    jobId: "non-existent",
    nowMs: 110,
  });
  assert.equal(r2.outcome.accepted, false);
  assert.equal(r2.outcome.reason, REJECT_REASON.JOB_NOT_FOUND);

  const r3 = transitionQueueState(state0, {
    type: "UNKNOWN_EVENT_TYPE",
    nowMs: 120,
  });
  assert.equal(r3.outcome.accepted, false);
  assert.equal(r3.outcome.reason, REJECT_REASON.INVALID_ARGUMENT);
});

test("T32: stableFingerprint는 중첩 객체의 키 삽입 순서와 무관하게 동일한 지문을 생성한다", () => {
  const a = { z: [1, { b: 2, a: 1 }], m: "toon", a: true };
  const b = { a: true, m: "toon", z: [1, { a: 1, b: 2 }] };
  const c = { a: true, m: "toon", z: [1, { a: 1, b: 3 }] };

  assert.equal(stableFingerprint(a), stableFingerprint(b));
  assert.notEqual(stableFingerprint(a), stableFingerprint(c));
});


test("T33: ENQUEUE deep-clones and deep-freezes nested payload so external mutation preserves snapshot immutability and idempotency fingerprint", () => {
  let state = createInitialQueueState({ maxConcurrency: 1, initialNowMs: 1_000 });
  const externalPayload = {
    nested: {
      prompt: "original",
      layers: ["ink", "color"],
    },
  };

  const first = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-deep-freeze-1",
    idempotencyKey: "idem-deep-freeze-1",
    payload: externalPayload,
    autoDispatch: false,
    nowMs: 1_000,
  });
  state = first.state;

  const originalFingerprint = state.jobsById["job-deep-freeze-1"].payloadFingerprint;
  assert.equal(state.jobsById["job-deep-freeze-1"].payload.nested.prompt, "original");
  assert.equal(Object.isFrozen(state.jobsById["job-deep-freeze-1"].payload), true);
  assert.equal(Object.isFrozen(state.jobsById["job-deep-freeze-1"].payload.nested), true);
  assert.equal(Object.isFrozen(state.jobsById["job-deep-freeze-1"].payload.nested.layers), true);

  // Mutate the caller's nested object after ENQUEUE
  externalPayload.nested.prompt = "changed externally";
  externalPayload.nested.layers.push("tampered");

  // Stored snapshot and fingerprint must remain intact
  const storedJob = state.jobsById["job-deep-freeze-1"];
  assert.equal(storedJob.payload.nested.prompt, "original");
  assert.deepEqual(storedJob.payload.nested.layers, ["ink", "color"]);
  assert.equal(stableFingerprint(storedJob.payload), originalFingerprint);

  // Re-enqueuing with the mutated object under the same idempotencyKey must be rejected as IDEMPOTENCY_PAYLOAD_MISMATCH
  const mismatch = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-deep-freeze-1",
    idempotencyKey: "idem-deep-freeze-1",
    payload: externalPayload,
    autoDispatch: false,
    nowMs: 1_010,
  });
  assert.equal(mismatch.outcome.accepted, false);
  assert.equal(mismatch.outcome.reason, REJECT_REASON.IDEMPOTENCY_PAYLOAD_MISMATCH);

  // Re-enqueuing with a fresh matching nested structure must deduplicate cleanly
  const dup = transitionQueueState(state, {
    type: EVENT_TYPE.ENQUEUE,
    jobId: "job-deep-freeze-1",
    idempotencyKey: "idem-deep-freeze-1",
    payload: { nested: { prompt: "original", layers: ["ink", "color"] } },
    autoDispatch: false,
    nowMs: 1_020,
  });
  assert.equal(dup.outcome.accepted, true);
  assert.equal(dup.outcome.deduplicated, true);
  assert.equal(dup.outcome.reason, REJECT_REASON.IDEMPOTENT_DUPLICATE);
});
