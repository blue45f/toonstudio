/**
 * 응답 헤더뿐 아니라 본문 읽기·로그아웃 재시도 전체에 하나의 대기 상한을 적용한다.
 * 전송을 취소하면서 호출자도 확실히 해제한다. 늦은 응답의 커밋 전에는 signal을 다시 검사한다.
 */
export async function withAuthRequestDeadline<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
): Promise<T> {
  callerSignal?.throwIfAborted();
  const controller = new AbortController();
  let rejectDeadline: (reason: unknown) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
  const abort = (reason: unknown) => {
    if (controller.signal.aborted) return;
    controller.abort(reason);
    rejectDeadline(reason);
  };
  const onCallerAbort = () => abort(callerSignal?.reason ?? new DOMException("요청이 취소되었습니다.", "AbortError"));
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = globalThis.setTimeout(
    () => abort(new DOMException("인증 서버 응답 시간이 초과되었습니다.", "TimeoutError")),
    timeoutMs,
  );
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    globalThis.clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
