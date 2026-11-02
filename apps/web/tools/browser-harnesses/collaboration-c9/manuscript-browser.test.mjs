import assert from 'node:assert/strict';
import test from 'node:test';
import { captureManuscriptMilestones } from './manuscript-browser.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('all three real-milestone callbacks start before the opening action', async () => {
  const calls = [];
  const operations = ['first-list', 'full-list', 'image-0'];
  const captured = await captureManuscriptMilestones({
    action: () => {
      assert.deepEqual(calls, operations);
      calls.push('open');
    },
    completions: operations.map((operation) => ({ operation, complete: async () => {
      calls.push(operation);
      return { marker: operation };
    } })),
    now: () => 10, timestamp: () => '2026-11-02T05:00:00.000Z',
  });
  assert.deepEqual(calls, [...operations, 'open']);
  assert.deepEqual(captured.map((entry) => entry.operation), operations);
  assert.deepEqual(captured.map((entry) => entry.observed.marker), operations);
});

test('full-list and decode retain their earlier completion clocks while first-list is pending', async () => {
  const first = deferred(), full = deferred(), decode = deferred();
  let clock = 0;
  let utc = 'start';
  const capture = captureManuscriptMilestones({ action: async () => {},
    completions: [
      { operation: 'first-list', complete: () => first.promise },
      { operation: 'full-list', complete: () => full.promise },
      { operation: 'image-0', complete: () => decode.promise },
    ], now: () => clock, timestamp: () => utc,
  });
  clock = 11; utc = 'full-completed'; full.resolve({ pages: 60 });
  await nextTurn();
  clock = 14; utc = 'decode-completed'; decode.resolve({ image: { ordinal: 0, complete: true } });
  await nextTurn();
  clock = 100; utc = 'first-completed'; first.resolve({ pages: 32 });
  const captured = await capture;
  assert.deepEqual(captured.map(({ operation, hostEndMs, finishedAt }) => ({ operation, hostEndMs, finishedAt })), [
    { operation: 'first-list', hostEndMs: 100, finishedAt: 'first-completed' },
    { operation: 'full-list', hostEndMs: 11, finishedAt: 'full-completed' },
    { operation: 'image-0', hostEndMs: 14, finishedAt: 'decode-completed' },
  ]);
  clock = 500;
  assert.equal(captured[1].hostEndMs, 11);
});

test('action failure rejects while observers remain pending and handles their later failures', async () => {
  const first = deferred(), full = deferred(), action = deferred();
  const expected = new Error('opening-action-failed');
  const unhandled = [];
  const listener = (error) => unhandled.push(error);
  process.on('unhandledRejection', listener);
  try {
    const capture = captureManuscriptMilestones({ action: () => action.promise, completions: [
      { operation: 'first-list', complete: () => first.promise },
      { operation: 'full-list', complete: () => full.promise },
    ] });
    const rejection = assert.rejects(capture, (error) => error === expected);
    action.reject(expected);
    await rejection;
    first.reject(new Error('late-first-failure'));
    full.reject(new Error('late-full-failure'));
    await nextTurn();
    assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', listener); }
});

test('one successful observer cannot hide a failing probe while action and another probe wait', async () => {
  const action = deferred(), full = deferred(), decode = deferred();
  const expected = new Error('full-list-failed');
  const unhandled = [];
  const listener = (error) => unhandled.push(error);
  process.on('unhandledRejection', listener);
  try {
    const capture = captureManuscriptMilestones({ action: () => action.promise, completions: [
      { operation: 'first-list', complete: async () => ({ pages: 32 }) },
      { operation: 'full-list', complete: () => full.promise },
      { operation: 'image-0', complete: () => decode.promise },
    ] });
    const rejection = assert.rejects(capture, (error) => error === expected);
    full.reject(expected);
    await rejection;
    action.reject(new Error('late-action-failure'));
    decode.reject(new Error('late-decode-failure'));
    await nextTurn();
    assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', listener); }
});

test('all observer successes still wait for the action result', async () => {
  const action = deferred();
  let finished = false;
  const capture = captureManuscriptMilestones({ action: () => action.promise,
    completions: [{ operation: 'image-0', complete: async () => ({ complete: true }) }],
  });
  const observed = capture.then((value) => { finished = true; return value; });
  await nextTurn();
  assert.equal(finished, false);
  action.resolve();
  assert.equal((await observed)[0].observed.complete, true);
});

test('synchronous observer throws are handled and do not prevent registration of other probes', async () => {
  const expected = new Error('probe-threw');
  const calls = [];
  await assert.rejects(captureManuscriptMilestones({ action: () => { calls.push('open'); }, completions: [
    { operation: 'first-list', complete: () => { calls.push('first-list'); throw expected; } },
    { operation: 'full-list', complete: async () => { calls.push('full-list'); return { pages: 60 }; } },
  ] }), (error) => error === expected);
  assert.deepEqual(calls, ['first-list', 'full-list', 'open']);
});

test('a synchronous opening-action throw rejects after all observers have started', async () => {
  const expected = new Error('action-threw');
  const calls = [];
  await assert.rejects(captureManuscriptMilestones({
    action: () => { assert.deepEqual(calls, ['first-list', 'full-list']); throw expected; },
    completions: ['first-list', 'full-list'].map((operation) => ({ operation,
      complete: async () => { calls.push(operation); return { operation }; } })),
  }), (error) => error === expected);
});
