import type { Pool, QueryConfig } from "pg";

/**
 * 준비 상태 질의 한 건이 기다리는 최대 시간(밀리초).
 * `health-readiness.repository.ts`가 같은 이름으로 다시 내보내므로 기존 import 경로는 그대로다.
 */
export const HEALTH_READINESS_QUERY_TIMEOUT_MS = 3_000;

export type QueryablePool = Pick<Pool, "query">;
export type TimedHealthQuery = QueryConfig & { query_timeout: number };

export function timedHealthQuery(
  text: string,
  values?: unknown[],
): TimedHealthQuery {
  return {
    text,
    values: values as QueryConfig["values"],
    query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
  };
}

export function containsEvery(
  actual: readonly string[] | null,
  required: readonly string[],
): boolean {
  if (!actual) return false;
  const actualSet = new Set(actual);
  return (
    actualSet.size === required.length &&
    required.every((value) => actualSet.has(value))
  );
}
