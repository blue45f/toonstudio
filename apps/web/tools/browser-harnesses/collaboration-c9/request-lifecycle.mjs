function lifecycleError(code) {
  return Object.assign(new Error(code), { name: 'C9RequestLifecycleError', code });
}

async function waitBounded(run, timeoutMs, code, timers) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      new Promise((_, reject) => { timer = timers.setTimeout(() => reject(lifecycleError(code)), timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) timers.clearTimeout(timer);
  }
}

/** 실패한 요청의 Response.finished는 끝나지 않을 수 있으므로 종결 이벤트를 먼저 확인한다. */
export async function consumeCompletedResponse({ response, terminalSignal, readTerminal, timeoutMs, consume,
  timers = { setTimeout, clearTimeout } }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw lifecycleError('C9_REQUEST_TIMEOUT_REQUIRED');
  if (!terminalSignal || typeof terminalSignal.then !== 'function') throw lifecycleError('C9_REQUEST_TERMINAL_SIGNAL_MISSING');
  if (typeof readTerminal !== 'function' || typeof consume !== 'function') throw lifecycleError('C9_REQUEST_CALLBACK_REQUIRED');
  await waitBounded(() => terminalSignal, timeoutMs, 'C9_REQUEST_TERMINAL_TIMEOUT', timers);
  const terminal = readTerminal();
  if (!terminal) throw lifecycleError('C9_REQUEST_TERMINAL_MISSING');
  if (terminal.failed) throw lifecycleError('C9_REQUEST_FAILED');
  await waitBounded(() => response.finished(), timeoutMs, 'C9_RESPONSE_FINISHED_TIMEOUT', timers);
  // 본문·정합성 검증은 호출자가 그대로 수행한다. 실패나 취소를 통과로 바꾸지 않는다.
  return consume(terminal);
}
