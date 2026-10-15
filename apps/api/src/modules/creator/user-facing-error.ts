import { BadRequestException, type HttpException } from "@nestjs/common";

import { isDatabaseAvailabilityError } from "../../platform/http/database-availability";

const POSTGRES_SQLSTATE = /^[0-9A-Z]{5}$/u;
const DRIVER_ERROR_NAMES: ReadonlySet<string> = new Set([
  "DrizzleQueryError",
  "DatabaseError",
  "PostgresError",
]);
const MAXIMUM_CAUSE_DEPTH = 4;

function hasPersistenceDriverFingerprint(error: unknown, depth = 0): boolean {
  if (depth > MAXIMUM_CAUSE_DEPTH || typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    readonly name?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
    readonly severity?: unknown;
    readonly routine?: unknown;
    readonly cause?: unknown;
  };
  if (typeof candidate.name === "string" && DRIVER_ERROR_NAMES.has(candidate.name)) {
    return true;
  }
  // Drizzle 은 실패한 쿼리의 SQL 본문과 바인딩 값을 메시지에 그대로 담는다.
  if (typeof candidate.message === "string" && candidate.message.startsWith("Failed query:")) {
    return true;
  }
  if (
    typeof candidate.code === "string"
    && POSTGRES_SQLSTATE.test(candidate.code)
    && (typeof candidate.severity === "string" || typeof candidate.routine === "string")
  ) {
    return true;
  }
  return hasPersistenceDriverFingerprint(candidate.cause, depth + 1);
}

/**
 * DB 드라이버·연결 계층에서 올라온 내부 오류인지 판별한다. 이런 오류의 메시지에는 SQL 본문,
 * 바인딩 값, 제약조건 이름, 호스트 주소가 들어 있어 사용자에게 보여 줄 문구가 아니다.
 */
export function isPersistenceInternalError(error: unknown): boolean {
  return isDatabaseAvailabilityError(error) || hasPersistenceDriverFingerprint(error);
}

/**
 * 도메인 서비스가 `catch (error)` 에서 4xx 예외로 바꿀 때 쓰는 경계 함수.
 *
 * - 도메인 검증 오류(한글 안내 문장을 담은 일반 Error)는 기존처럼 메시지를 그대로 쓴다.
 * - DB 드라이버·연결 오류는 메시지를 응답으로 내보내지 않고 원래 예외를 그대로 던져, 전역
 *   예외 필터가 5xx 는 정화된 본문으로, DB 가용성 오류는 503 으로 변환하게 한다.
 */
export function userFacingException(
  error: unknown,
  fallback: string,
  create: (message: string) => HttpException = (message) => new BadRequestException(message),
): HttpException | Error {
  if (error instanceof Error && isPersistenceInternalError(error)) return error;
  return create(error instanceof Error ? error.message : fallback);
}
