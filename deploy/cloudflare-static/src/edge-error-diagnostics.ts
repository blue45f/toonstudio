export interface EdgeErrorDiagnosticsEnv {
  /** 실제 Free 요금제와 수집 여유를 확인한 뒤에만 true로 설정한다. 기본값은 비활성이다. */
  readonly EDGE_ERROR_DIAGNOSTICS_ENABLED?: string;
  readonly RELEASE_SHA?: string;
}

type DiagnosticRoute = "core" | "public-read" | "social" | "playground" | "admin" | "realtime" | "large-asset";
type DiagnosticOperation = "r2_get" | "r2_head" | "r2_response" | "upstream_fetch" | "upstream_response";

interface EdgeFailure {
  readonly route: DiagnosticRoute;
  readonly operation: DiagnosticOperation;
  readonly attempt: number;
  readonly retrying: boolean;
}

export type EdgeErrorReporter = (
  env: EdgeErrorDiagnosticsEnv,
  request: Request,
  failure: EdgeFailure,
  cause: unknown,
) => void;

const ROUTES = new Set<DiagnosticRoute>(["core", "public-read", "social", "playground", "admin", "realtime", "large-asset"]);
const OPERATIONS = new Set<DiagnosticOperation>(["r2_get", "r2_head", "r2_response", "upstream_fetch", "upstream_response"]);
const ERROR_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "URIError", "EvalError", "ReferenceError", "AbortError", "TimeoutError", "AggregateError"]);
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 20;
const MAX_EVENT_JSON_BYTES = 512;

function errorType(cause: unknown): string {
  if (cause === null || (typeof cause !== "object" && typeof cause !== "function")) return "unknown";
  try {
    // 원문 message/stack과 getter는 읽지 않는다. 허용한 오류 이름만 분류한다.
    // DOMException처럼 name을 native accessor로 제공하는 오류도 unknown으로 분류될 수 있다.
    let target: object | null = cause;
    for (let depth = 0; target !== null && depth < 3; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(target, "name");
      if (descriptor) {
        const value: unknown = "value" in descriptor ? descriptor.value : undefined;
        return typeof value === "string" && ERROR_NAMES.has(value) ? value : "unknown";
      }
      target = Object.getPrototypeOf(target) as object | null;
    }
  } catch {
    // Proxy 등 분류할 수 없는 예외도 요청 처리를 방해하지 않는 고정 분류로만 남긴다.
    return "unknown";
  }
  return "unknown";
}

/**
 * 명시적으로 켜기 전까지 이 진단 함수는 로그를 출력하지 않는다. 네트워크·영속 저장소를 사용하지 않는다.
 * isolate별 60초 고정 창당 최대 20건/유형별 첫 1건이며 창 경계에서는 순간 집중이 가능하다.
 * 이 제한은 isolate 내 잡음 억제이며 계정 전체의 과금 상한이 아니다.
 * 생략된 반복 건수·요청별 문맥은 복구할 수 없으므로 전체 오류 집계로 해석하지 않는다.
 */
export function createEdgeErrorDiagnostics(
  write: (event: string) => void = (event) => console.error(event),
  now: () => number = Date.now,
): EdgeErrorReporter {
  let windowStarted = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();

  return (env, request, failure, cause) => {
    try {
      // 비활성일 때는 예외·요청 헤더를 읽거나 직렬화하지 않는다.
      if (env.EDGE_ERROR_DIAGNOSTICS_ENABLED !== "true") return;
      const at = Math.floor(now());
      if (!Number.isSafeInteger(at) || at < 0) return;
      if (at < windowStarted || at - windowStarted >= WINDOW_MS) {
        windowStarted = at;
        seen.clear();
      }
      if (seen.size >= MAX_EVENTS_PER_WINDOW) return;
      if (!ROUTES.has(failure.route) || !OPERATIONS.has(failure.operation)
        || !Number.isInteger(failure.attempt) || failure.attempt < 1 || failure.attempt > 8
        || typeof failure.retrying !== "boolean") return;

      const error = errorType(cause);
      const signature = `${failure.route}:${failure.operation}:${error}:${failure.retrying}`;
      if (seen.has(signature)) return;

      const release = env.RELEASE_SHA;
      const ray = request.headers.get("cf-ray");
      const event = JSON.stringify({
        event: "edge_dependency_failure",
        at,
        dependency: failure.operation.startsWith("upstream_") ? "upstream" : "r2",
        route: failure.route,
        operation: failure.operation,
        errorType: error,
        attempt: failure.attempt,
        retrying: failure.retrying,
        ...(typeof release === "string" && release.length === 40 && /^[a-f0-9]{40}$/u.test(release)
          ? { releaseSha: release } : {}),
        ...(ray !== null && /^[a-fA-F0-9]{16}(?:-[A-Z]{3})?$/u.test(ray) ? { rayId: ray } : {}),
      });
      // 출력 본문의 ASCII 길이만 제한한다. Cloudflare가 추가하는 속성의 수집 크기는 별도다.
      if (event.length > MAX_EVENT_JSON_BYTES) return;
      seen.add(signature);
      write(event);
    } catch {
      // 진단 출력 실패 때문에 기존 폴백·재시도·응답 계약을 바꾸지 않는다.
      return;
    }
  };
}
