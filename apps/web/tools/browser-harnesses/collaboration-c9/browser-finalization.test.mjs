import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { assertNativeDnt, launchPrivateDntBrowser, persistAndReportFailure, reportBrowserFailure, runWithOwnedBrowser, runWithOwnedContexts } from './browser-finalization.mjs';

function blankPage({ doNotTrack = '1', ownProperty = false, url = 'about:blank', evaluatedUrl = url, evaluationError = null, closeError = null } = {}) {
  const calls = [];
  return {
    calls,
    url: () => url,
    evaluate: async (callback) => {
      calls.push('evaluate');
      if (evaluationError) throw evaluationError;
      const navigator = Object.create({ doNotTrack });
      if (ownProperty) Object.defineProperty(navigator, 'doNotTrack', { value: doNotTrack });
      return runInNewContext(`(${callback.toString()})()`, { navigator, location: { href: evaluatedUrl } });
    },
    close: async () => { calls.push('page-close'); if (closeError) throw closeError; },
  };
}

async function privateOutput(t) {
  const directory = await mkdtemp(join(tmpdir(), 'toon-c9-native-dnt-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('기본 DNT 확인은 blank 페이지 값을 읽고 호출자의 페이지를 유지한다', async () => {
  const page = blankPage();
  assert.deepEqual(await assertNativeDnt(page), { doNotTrack: '1', navigatorOwnProperty: false });
  assert.deepEqual(page.calls, ['evaluate']);
});

test('DNT 미설정·직접 주입·탐색된 페이지는 거절한다', async () => {
  for (const [options, code] of [
    [{ doNotTrack: null }, 'C9_NATIVE_DNT_REQUIRED'],
    [{ doNotTrack: '0' }, 'C9_NATIVE_DNT_REQUIRED'],
    [{ doNotTrack: 1 }, 'C9_NATIVE_DNT_REQUIRED'],
    [{ ownProperty: true }, 'C9_NATIVE_DNT_REQUIRED'],
    [{ url: 'https://example.invalid/' }, 'C9_DNT_BLANK_PAGE_REQUIRED'],
    [{ evaluatedUrl: 'https://example.invalid/' }, 'C9_DNT_BLANK_PAGE_REQUIRED'],
  ]) {
    const page = blankPage(options);
    await assert.rejects(assertNativeDnt(page), (error) => error.code === code);
    assert.equal(page.calls.includes('page-close'), false);
    if (options.url) assert.deepEqual(page.calls, []);
  }
});

test('새 private 프로필에 DNT 설정을 먼저 저장하고 실행 옵션과 브라우저 소유권을 유지한다', async (t) => {
  const outputDir = await privateOutput(t), options = { channel: 'chrome', headless: true, args: ['--enable-automation'] };
  const page = blankPage(), browser = { close: async () => assert.fail('정상 종료는 호출자 담당') };
  let contextClosed = false, launchCount = 0;
  const chromium = { launchPersistentContext: async (userDataDir, actualOptions) => {
    launchCount++;
    assert.equal(dirname(userDataDir), outputDir);
    assert.equal(actualOptions, options);
    assert.equal((await stat(userDataDir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(userDataDir, 'Default'))).mode & 0o777, 0o700);
    const preferences = join(userDataDir, 'Default', 'Preferences');
    assert.equal((await stat(preferences)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(preferences, 'utf8')), { enable_do_not_track: true });
    return { browser: () => browser, pages: () => [page], newPage: async () => assert.fail('기존 blank 페이지 사용'), close: async () => { contextClosed = true; } };
  } };
  const launched = await launchPrivateDntBrowser({ chromium, outputDir, launchOptions: options });
  assert.equal(launched.browser, browser);
  assert.deepEqual(launched.privacy, { method: 'native-chrome-profile-preference', doNotTrack: '1', navigatorOwnProperty: false, userDataDir: join(outputDir, (await readdir(outputDir))[0]) });
  assert.deepEqual(page.calls, ['evaluate', 'page-close']);
  assert.equal(contextClosed, false); assert.equal(launchCount, 1);
});

test('기존 blank 페이지가 없으면 검증용 페이지를 만들고 매 실행 프로필을 분리한다', async (t) => {
  const outputDir = await privateOutput(t), profiles = [], pages = [];
  const chromium = { launchPersistentContext: async (userDataDir) => {
    profiles.push(userDataDir);
    return { browser: () => ({}), pages: () => [], newPage: async () => { const page = blankPage(); pages.push(page); return page; }, close: async () => assert.fail('성공한 context는 유지') };
  } };
  await launchPrivateDntBrowser({ chromium, outputDir, launchOptions: undefined });
  await launchPrivateDntBrowser({ chromium, outputDir, launchOptions: undefined });
  assert.equal(new Set(profiles).size, 2);
  assert.equal(pages.length, 2); assert(pages.every((page) => page.calls.join(',') === 'evaluate,page-close'));
});

test('persistent browser가 없거나 기본 DNT가 다르면 context를 닫고 대체 실행하지 않는다', async (t) => {
  const outputDir = await privateOutput(t);
  for (const missingBrowser of [true, false]) {
    const page = blankPage({ doNotTrack: null }); let closed = 0, launched = 0;
    const chromium = { launchPersistentContext: async () => {
      launched++;
      return { browser: () => missingBrowser ? null : {}, pages: () => [page], close: async () => { closed++; } };
    } };
    await assert.rejects(launchPrivateDntBrowser({ chromium, outputDir, launchOptions: {} }),
      (error) => error.code === (missingBrowser ? 'C9_PERSISTENT_BROWSER_REQUIRED' : 'C9_NATIVE_DNT_REQUIRED'));
    assert.equal(closed, 1); assert.equal(launched, 1);
  }
});

test('DNT 읽기 실패와 context 종료 실패를 AggregateError에 함께 보존한다', async (t) => {
  const outputDir = await privateOutput(t), failure = new Error('DNT 읽기 실패'), cleanupFailure = new Error('context 종료 실패');
  const page = blankPage({ evaluationError: failure }); let closed = 0;
  const chromium = { launchPersistentContext: async () => ({ browser: () => ({}), pages: () => [page], close: async () => { closed++; throw cleanupFailure; } }) };
  await assert.rejects(launchPrivateDntBrowser({ chromium, outputDir, launchOptions: {} }),
    (error) => error instanceof AggregateError && error.cause === failure && error.errors[0] === failure && error.errors[1] === cleanupFailure);
  assert.equal(closed, 1);
});

test('검증용 페이지 종료가 실패해도 소유 context 종료를 시도한다', async (t) => {
  const outputDir = await privateOutput(t), failure = new Error('페이지 종료 실패'); let closed = 0;
  const page = blankPage({ closeError: failure });
  const chromium = { launchPersistentContext: async () => ({ browser: () => ({}), pages: () => [page], close: async () => { closed++; } }) };
  await assert.rejects(launchPrivateDntBrowser({ chromium, outputDir, launchOptions: {} }), (error) => error === failure);
  assert.equal(closed, 1);
});

test('브라우저 시작 실패는 원인을 보존하고 프로필 설정을 증거로 남긴다', async (t) => {
  const outputDir = await privateOutput(t), failure = new Error('브라우저 시작 실패'); let launches = 0;
  const chromium = { launchPersistentContext: async () => { launches++; throw failure; } };
  await assert.rejects(launchPrivateDntBrowser({ chromium, outputDir, launchOptions: {} }), (error) => error === failure);
  assert.equal(launches, 1);
  const [profile] = await readdir(outputDir);
  assert.deepEqual(JSON.parse(await readFile(join(outputDir, profile, 'Default', 'Preferences'), 'utf8')), { enable_do_not_track: true });
});

test('context 실행 실패와 복수 종료 실패를 최초 원인부터 보존하고 모든 종료를 시도한다', async () => {
  const failures = [new Error('세션 확인 실패'), new Error('첫 context 종료 실패'), new Error('마지막 context 종료 실패')];
  const calls = [], contexts = [];
  await assert.rejects(runWithOwnedContexts(contexts, async () => {
    contexts.push({ close: async () => { calls.push('first'); throw failures[1]; } });
    contexts.push({ close: async () => { calls.push('middle'); } });
    contexts.push({ close: async () => { calls.push('last'); throw failures[2]; } });
    throw failures[0];
  }), (error) => error instanceof AggregateError && error.cause === failures[0]
    && error.errors.length === failures.length && error.errors.every((entry, index) => entry === failures[index]));
  assert.deepEqual(calls, ['first', 'middle', 'last']);
});

test('실행이 성공해도 첫 context 종료 실패 뒤 남은 context를 모두 닫는다', async () => {
  const failure = new Error('첫 context 종료 실패'), calls = [];
  const contexts = [
    { close: async () => { calls.push('first'); throw failure; } },
    { close: async () => { calls.push('second'); } },
    { close: async () => { calls.push('third'); } },
  ];
  await assert.rejects(runWithOwnedContexts(contexts, async () => '측정 완료'), (error) => error === failure);
  assert.deepEqual(calls, ['first', 'second', 'third']);
});

test('정상 실행 값은 실행 중 등록한 context 종료를 마친 뒤 그대로 반환한다', async () => {
  const contexts = [], calls = [], expected = { completed: true };
  const value = await runWithOwnedContexts(contexts, async () => {
    calls.push('run');
    contexts.push({ close: async () => { calls.push('close'); } });
    return expected;
  });
  assert.equal(value, expected);
  assert.deepEqual(calls, ['run', 'close']);
});

test('context 종료가 성공하면 실행의 원래 오류 객체를 그대로 전달한다', async () => {
  const failure = new Error('실제 계정 확인 실패'); let closed = 0;
  await assert.rejects(runWithOwnedContexts([{ close: async () => { closed++; } }], async () => {
    throw failure;
  }), (error) => error === failure);
  assert.equal(closed, 1);
});

test('첫 running 결과 저장이 실패해도 브라우저 종료와 DB 후속 확인을 수행한다', async () => {
  const calls = [];
  const failure = Object.assign(new Error('저장 공간 부족'), { code: 'ENOSPC' });
  await assert.rejects(runWithOwnedBrowser({ close: async () => { calls.push('close'); } }, async () => {
    calls.push('initial-save'); throw failure;
  }, async () => { calls.push('after-close'); }), (error) => error.errors[0] === failure && error.failures[0].phase === 'measurement');
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
  }), (error) => error.errors[0] === failure && error.failures[0].phase === 'browser-close');
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

for (const saveFails of [false, true]) test(`실제 최종 보고는 복합 실패 원인과 검증 식별자를 보존한다: 저장 실패 ${saveFails}`, async () => {
  const privateMarker = 'fixture-private-response-body';
  const failures = [
    Object.assign(new Error(privateMarker), { name: 'C9PreconditionError', c9SafeMessage: '고정 수량 검증 식별자' }),
    Object.assign(new Error(privateMarker), { code: 'ECONNRESET' }),
    Object.assign(new Error(privateMarker), { code: 'ECONNREFUSED' }),
  ];
  let aggregate;
  await assert.rejects(runWithOwnedBrowser({ close: async () => { throw failures[1]; } }, async () => {
    throw failures[0];
  }, async () => { throw failures[2]; }), (error) => { aggregate = error; return true; });
  const result = { originalFailureStage: 'sample-completeness' }; let saved; let summary; let exitCode = 0;
  await reportBrowserFailure({ error: aggregate, result, stage: 'mutation-zero-after', resultPath: null,
    persist: async () => {
      if (saveFails) throw Object.assign(new Error(privateMarker), { code: 'ENOSPC' });
      saved = JSON.parse(JSON.stringify(result));
    },
    report: (value) => { exitCode = 1; summary = value; },
  });
  const causes = [
    { phase: 'measurement', errorType: 'C9PreconditionError', errorCode: null, validationId: createHash('sha256').update('고정 수량 검증 식별자').digest('hex') },
    { phase: 'browser-close', errorType: 'Error', errorCode: 'ECONNRESET', validationId: null },
    { phase: 'mutation-zero-after', errorType: 'Error', errorCode: 'ECONNREFUSED', validationId: null },
  ];
  assert.equal(exitCode, 1); assert.equal(result.status, 'failed');
  assert.deepEqual(summary.causes, causes); assert.deepEqual(result.failure.causes, causes);
  assert.equal(summary.originalFailureStage, 'sample-completeness');
  assert.equal(summary.failureRecordSaved, !saveFails);
  assert.deepEqual(summary.persistenceFailure, saveFails ? { errorType: 'Error', errorCode: 'ENOSPC' } : null);
  if (!saveFails) assert.deepEqual(saved.failure.causes, causes);
  const serialized = JSON.stringify({ result, saved, summary });
  assert.equal(serialized.includes(privateMarker), false);
  assert.equal(serialized.includes('고정 수량 검증 식별자'), false);
  assert.equal(serialized.includes('"stack"'), false);
});
