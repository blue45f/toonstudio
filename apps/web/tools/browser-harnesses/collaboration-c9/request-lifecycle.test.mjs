import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeCompletedResponse } from './request-lifecycle.mjs';
import { runWithOwnedContexts } from './browser-finalization.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function manualTimers() {
  let nextId = 0;
  const active = new Map();
  const cleared = [];
  const scheduled = [];
  const watchers = [];
  return {
    active, cleared, scheduled,
    setTimeout(callback, milliseconds) {
      const id = ++nextId;
      active.set(id, callback);
      scheduled.push({ id, milliseconds });
      for (const watcher of watchers) if (scheduled.length >= watcher.count) watcher.resolve();
      return id;
    },
    clearTimeout(id) { active.delete(id); cleared.push(id); },
    whenScheduled(count) {
      if (scheduled.length >= count) return Promise.resolve();
      const gate = deferred();
      watchers.push({ count, resolve: gate.resolve });
      return gate.promise;
    },
    expireNext() {
      const entry = active.entries().next().value;
      assert.ok(entry, '종료할 timer가 있어야 합니다.');
      active.delete(entry[0]);
      entry[1]();
    },
  };
}

const guard = { timeout: 2000 };

test('실패 종결 신호는 끝나지 않는 Response.finished에 들어가기 전에 즉시 실패한다', guard, async () => {
  const timers = manualTimers();
  const never = deferred();
  let finishedCalls = 0, bodyCalls = 0;
  await assert.rejects(consumeCompletedResponse({
    response: { finished: () => { finishedCalls += 1; return never.promise; } },
    terminalSignal: Promise.resolve(), readTerminal: () => ({ failed: true }), timeoutMs: 60000, timers,
    consume: () => { bodyCalls += 1; },
  }), { code: 'C9_REQUEST_FAILED' });
  assert.equal(finishedCalls, 0);
  assert.equal(bodyCalls, 0);
  assert.equal(timers.active.size, 0);
  assert.equal(timers.cleared.length, 1);
});

test('성공 종결과 응답 완료 뒤에만 원래 본문 검증을 한 번 실행한다', guard, async () => {
  const timers = manualTimers();
  const gate = deferred();
  const order = [];
  const terminal = { failed: false, finishedHostMs: 12 };
  const expected = Buffer.from('정본 응답');
  const response = {
    finished: async () => { order.push('response-finished'); },
    body: async () => { order.push('body'); return Buffer.from(expected); },
  };
  const pending = consumeCompletedResponse({
    response, terminalSignal: gate.promise,
    readTerminal: () => { order.push('terminal-read'); return terminal; },
    timeoutMs: 60000, timers,
    consume: async (observed) => {
      assert.equal(observed, terminal);
      const bytes = await response.body();
      assert.deepEqual(bytes, expected);
      order.push('body-validated');
      return bytes.length;
    },
  });
  await timers.whenScheduled(1);
  assert.deepEqual(order, []);
  gate.resolve();
  assert.equal(await pending, expected.length);
  assert.deepEqual(order, ['terminal-read', 'response-finished', 'body', 'body-validated']);
  assert.equal(timers.active.size, 0);
  assert.equal(timers.cleared.length, 2);
  assert.ok(timers.scheduled.every(({ milliseconds }) => milliseconds === 60000));
});

test('종결 이벤트가 오지 않으면 지정 상한에서 실패하고 timer를 정리한다', guard, async () => {
  const timers = manualTimers();
  const terminal = deferred();
  let finishedCalls = 0, bodyCalls = 0;
  const pending = consumeCompletedResponse({
    response: { finished: () => { finishedCalls += 1; } },
    terminalSignal: terminal.promise, readTerminal: () => undefined, timeoutMs: 60000, timers,
    consume: () => { bodyCalls += 1; },
  });
  const rejected = assert.rejects(pending, { code: 'C9_REQUEST_TERMINAL_TIMEOUT' });
  await timers.whenScheduled(1);
  timers.expireNext();
  await rejected;
  assert.equal(finishedCalls, 0);
  assert.equal(bodyCalls, 0);
  assert.equal(timers.active.size, 0);
  assert.equal(timers.cleared.length, 1);
});

test('성공 신호 뒤 Response.finished도 끝나지 않으면 별도 상한에서 실패한다', guard, async () => {
  const timers = manualTimers();
  const never = deferred();
  let consumed = false;
  const pending = consumeCompletedResponse({
    response: { finished: () => never.promise }, terminalSignal: Promise.resolve(),
    readTerminal: () => ({ failed: false }), timeoutMs: 60000, timers,
    consume: () => { consumed = true; },
  });
  const rejected = assert.rejects(pending, { code: 'C9_RESPONSE_FINISHED_TIMEOUT' });
  await timers.whenScheduled(2);
  timers.expireNext();
  await rejected;
  assert.equal(consumed, false);
  assert.equal(timers.active.size, 0);
  assert.equal(timers.cleared.length, 2);
});

test('본문 검증의 원래 오류도 교체하지 않고 전파한다', guard, async () => {
  const timers = manualTimers();
  const original = new Error('정본 검증 실패');
  await assert.rejects(consumeCompletedResponse({
    response: { finished: async () => {} }, terminalSignal: Promise.resolve(),
    readTerminal: () => ({ failed: false }), timeoutMs: 60000, timers,
    consume: () => { throw original; },
  }), (error) => error === original);
  assert.equal(timers.active.size, 0);
});

test('요청의 첫 실패와 소유 context 종료 실패를 순서와 cause에 함께 보존한다', guard, async () => {
  const timers = manualTimers();
  const cleanup = new Error('context 종료 실패');
  let primary;
  let closeCalls = 0;
  await assert.rejects(runWithOwnedContexts([{ close: async () => { closeCalls += 1; throw cleanup; } }], async () => {
    try {
      await consumeCompletedResponse({
        response: { finished: () => deferred().promise }, terminalSignal: Promise.resolve(),
        readTerminal: () => ({ failed: true }), timeoutMs: 60000, timers, consume: () => assert.fail('검증 진입 금지'),
      });
    } catch (error) { primary = error; throw error; }
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], primary);
    assert.equal(primary.code, 'C9_REQUEST_FAILED');
    assert.equal(error.errors[1], cleanup);
    assert.equal(error.cause, primary);
    return true;
  });
  assert.equal(closeCalls, 1);
  assert.equal(timers.active.size, 0);
});
