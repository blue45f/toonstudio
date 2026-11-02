/** 시작 결과 저장도 포함해, 소유 브라우저의 모든 종료 단계를 시도한다. */
export async function runWithOwnedBrowser(browser, run, afterClose) {
  const failures = [];
  let value;
  try { value = await run(); } catch (error) { failures.push(error); }
  try { await browser.close(); } catch (error) { failures.push(error); }
  try { await afterClose(); } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'C9 실행과 종료 단계에서 오류가 발생했습니다.');
  return value;
}

/** 저장 오류의 원문 대신 식별 정보만 남기고 최종 실패 보고를 보장한다. */
export async function persistAndReportFailure(persist, report) {
  let persistenceFailure = null;
  try { await persist(); } catch (error) {
    persistenceFailure = {
      errorType: typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name) ? error.name : 'Error',
      errorCode: typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(error.code) ? error.code : null,
    };
  }
  return report(persistenceFailure);
}
