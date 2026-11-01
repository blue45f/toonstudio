/** 본 작업 실패를 보존하면서 저장 권위 정리 실패도 함께 전달한다. */
export async function withStudioHistoryCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<unknown>,
): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
  try { outcome = { ok: true, value: await operation() }; }
  catch (cause) { outcome = { ok: false, cause }; }
  let cleanupFailure: { cause: unknown } | null = null;
  try { await cleanup(); }
  catch (cause) { cleanupFailure = { cause }; }
  if (!outcome.ok) {
    if (cleanupFailure) throw new AggregateError(
      [outcome.cause, cleanupFailure.cause], "편집 이력 작업과 저장 권위 정리에 실패했습니다.", { cause: outcome.cause },
    );
    throw outcome.cause;
  }
  if (cleanupFailure) throw cleanupFailure.cause;
  return outcome.value;
}
