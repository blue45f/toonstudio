import { createHash } from 'node:crypto';

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
