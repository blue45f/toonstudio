import assert from 'node:assert/strict';
import test from 'node:test';
import { persistAndReportFailure, runWithOwnedBrowser } from './browser-finalization.mjs';

test('첫 running 결과 저장이 실패해도 브라우저 종료와 DB 후속 확인을 수행한다', async () => {
  const calls = [];
  const failure = Object.assign(new Error('저장 공간 부족'), { code: 'ENOSPC' });
  await assert.rejects(runWithOwnedBrowser({ close: async () => { calls.push('close'); } }, async () => {
    calls.push('initial-save'); throw failure;
  }, async () => { calls.push('after-close'); }), (error) => error === failure);
  assert.deepEqual(calls, ['initial-save', 'close', 'after-close']);
});

test('정상 결과를 반환하기 전에 소유 브라우저와 후속 확인을 마친다', async () => {
  const calls = [];
  const value = await runWithOwnedBrowser({ close: async () => { calls.push('close'); } }, async () => {
    calls.push('run'); return 42;
  }, async () => { calls.push('after-close'); });
  assert.equal(value, 42); assert.deepEqual(calls, ['run', 'close', 'after-close']);
});

test('브라우저 종료 실패가 후속 DB 확인을 건너뛰지 않는다', async () => {
  const failure = new Error('브라우저 종료 실패'); let checked = false;
  await assert.rejects(runWithOwnedBrowser({ close: async () => { throw failure; } }, async () => {}, async () => {
    checked = true;
  }), (error) => error === failure);
  assert.equal(checked, true);
});

test('실행·종료·후속 확인의 여러 실패를 모두 보존한다', async () => {
  const failures = [new Error('실행 실패'), new Error('종료 실패'), new Error('후속 확인 실패')];
  await assert.rejects(runWithOwnedBrowser({ close: async () => { throw failures[1]; } }, async () => {
    throw failures[0];
  }, async () => { throw failures[2]; }), (error) => error instanceof AggregateError && error.errors.length === 3 && error.errors.every((entry, index) => entry === failures[index]));
});

test('결과 저장 큐가 거절돼도 안전한 실패 보고를 수행한다', async () => {
  const failure = Object.assign(new Error('https://127.0.0.1/image?signature=fixture-private-query'), { code: 'ENOSPC' });
  const poisonedQueue = Promise.reject(failure);
  let exitCode = 0; let summary;
  await persistAndReportFailure(() => poisonedQueue.then(() => {}), (persistenceFailure) => {
    exitCode = 1; summary = { status: 'failed', persistenceFailure };
  });
  assert.equal(exitCode, 1);
  assert.deepEqual(summary.persistenceFailure, { errorType: 'Error', errorCode: 'ENOSPC' });
  assert.equal(JSON.stringify(summary).includes('fixture-private-query'), false);
});

test('실패 기록 저장이 성공한 경우도 최종 보고를 정확히 한 번 수행한다', async () => {
  const calls = [];
  await persistAndReportFailure(async () => { calls.push('save'); }, (failure) => {
    assert.equal(failure, null); calls.push('report');
  });
  assert.deepEqual(calls, ['save', 'report']);
});

test('오류 식별자의 민감 문자열은 실패 식별 정보로 내보내지 않는다', async () => {
  let reported;
  const failure = Object.assign(new Error('fixture-private-body'), { name: 'https://private.invalid', code: 'signed=query' });
  await persistAndReportFailure(async () => { throw failure; }, (value) => { reported = value; });
  assert.deepEqual(reported, { errorType: 'Error', errorCode: null });
});
