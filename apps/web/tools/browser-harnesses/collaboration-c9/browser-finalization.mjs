import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function privacyPrecondition(code) {
  return Object.assign(new Error(code), { code });
}

/** 탐색 전의 호출자 소유 페이지에서 기본 DNT 값을 읽는다. 페이지나 navigator를 바꾸지 않는다. */
export async function assertNativeDnt(page) {
  if (page.url() !== 'about:blank') throw privacyPrecondition('C9_DNT_BLANK_PAGE_REQUIRED');
  const value = await page.evaluate(() => ({
    url: location.href,
    doNotTrack: navigator.doNotTrack ?? null,
    navigatorOwnProperty: Object.prototype.hasOwnProperty.call(navigator, 'doNotTrack'),
  }));
  if (value.url !== 'about:blank') throw privacyPrecondition('C9_DNT_BLANK_PAGE_REQUIRED');
  if (value.doNotTrack !== '1' || value.navigatorOwnProperty !== false) {
    throw privacyPrecondition('C9_NATIVE_DNT_REQUIRED');
  }
  return { doNotTrack: value.doNotTrack, navigatorOwnProperty: value.navigatorOwnProperty };
}

/** 매번 새 프로필의 실제 Chrome 설정을 사용한다. 기존 프로필·속성 주입·대체 실행은 사용하지 않는다. */
export async function launchPrivateDntBrowser({ chromium, outputDir, launchOptions }) {
  const userDataDir = await mkdtemp(join(outputDir, 'c9-native-dnt-'));
  await chmod(userDataDir, 0o700);
  const defaultProfile = join(userDataDir, 'Default');
  await mkdir(defaultProfile, { mode: 0o700 });
  await writeFile(join(defaultProfile, 'Preferences'), `${JSON.stringify({ enable_do_not_track: true })}\n`, { flag: 'wx', mode: 0o600 });
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, launchOptions);
    const browser = context.browser();
    if (browser === null) throw privacyPrecondition('C9_PERSISTENT_BROWSER_REQUIRED');
    const page = context.pages()[0] ?? await context.newPage();
    const native = await assertNativeDnt(page);
    await page.close();
    return { browser, privacy: { method: 'native-chrome-profile-preference', ...native, userDataDir } };
  } catch (error) {
    const failures = [error];
    if (context) {
      try { await context.close(); } catch (cleanupError) { failures.push(cleanupError); }
    }
    if (failures.length > 1) throw new AggregateError(failures, 'DNT 확인 실패와 소유 브라우저 종료 실패를 함께 보존합니다.', { cause: error });
    throw error;
  }
}

function errorIdentity(error) {
  return {
    errorType: typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name) ? error.name : 'Error',
    errorCode: typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(error.code) ? error.code : null,
  };
}

function classifiedFailure(error) {
  return { ...errorIdentity(error), validationId: typeof error?.c9SafeMessage === 'string' ? createHash('sha256').update(error.c9SafeMessage).digest('hex') : null };
}

class BrowserFinalizationError extends AggregateError {
  constructor(failures) {
    super(failures.map(({ error }) => error), 'C9 실행과 종료 단계에서 오류가 발생했습니다.', { cause: failures[0].error });
    this.failures = failures.map(({ phase, error }) => ({ phase, ...classifiedFailure(error) }));
  }
}

/** 실행 중 등록한 context를 모두 닫고 최초 실행 실패와 정리 실패를 순서대로 보존한다. */
export async function runWithOwnedContexts(contexts, run) {
  const failures = [];
  let value;
  try { value = await run(); } catch (error) { failures.push(error); }
  for (const context of contexts) {
    try { await context.close(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, '실행과 소유 context 종료의 모든 실패를 함께 보존합니다.', { cause: failures[0] });
  return value;
}

/** 시작 결과 저장도 포함해, 소유 브라우저의 모든 종료 단계를 시도한다. */
export async function runWithOwnedBrowser(browser, run, afterClose) {
  const failures = [];
  let value;
  try { value = await run(); } catch (error) { failures.push({ phase: 'measurement', error }); }
  try { await browser.close(); } catch (error) { failures.push({ phase: 'browser-close', error }); }
  try { await afterClose(); } catch (error) { failures.push({ phase: 'mutation-zero-after', error }); }
  if (failures.length > 0) throw new BrowserFinalizationError(failures);
  return value;
}

/** 저장 오류의 원문 대신 식별 정보만 남기고 최종 실패 보고를 보장한다. */
export async function persistAndReportFailure(persist, report) {
  let persistenceFailure = null;
  try { await persist(); } catch (error) {
    persistenceFailure = errorIdentity(error);
  }
  return report(persistenceFailure);
}

/** 실제 최종 보고 경로에서도 단계별 원인을 보존하고 오류 원문은 내보내지 않는다. */
export async function reportBrowserFailure({ error, result, stage, resultPath, persist, report }) {
  const failure = { ...classifiedFailure(error), causes: error instanceof BrowserFinalizationError ? error.failures : [] };
  result.status = 'failed'; result.failedStage = stage;
  result.failure = { ...failure, note: 'cookie/password/signed URL/원고·외부 응답 본문·stack는 기록하지 않음' };
  result.finishedAt = new Date().toISOString();
  return persistAndReportFailure(persist, (persistenceFailure) => report({
    status: 'failed', stage, originalFailureStage: result.originalFailureStage ?? null, ...failure, resultPath: resultPath ?? null,
    failureRecordSaved: persistenceFailure === null, persistenceFailure,
  }));
}
