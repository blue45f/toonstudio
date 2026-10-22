/**
 * Claude SDK가 사용하는 `fetch` — 기존 BYOK 전송(`userAiFetch`)과 같은 브라우저 안전 규칙을 강제한다.
 *
 * SDK를 직접 쓰면 편하지만 키가 든 요청을 SDK 기본 `fetch`에 맡기게 된다. 그래서 SDK에는 이 가드
 * `fetch`만 넘기고 다음을 항상 적용한다.
 * - 공식 origin(https://api.anthropic.com)이 아니면 전송하지 않는다(키를 엉뚱한 곳으로 보내는 통로 차단).
 *   origin 안에서도 이 앱이 쓰는 두 끝점(메시지 보내기, 모델 목록)과 URL 자격 증명 없는 주소만 허용해, 키가 붙은 요청이
 *   파일·배치처럼 쓰지 않는 경로로 나가지 않게 한다.
 * - 쿠키·사이트 사용자 헤더·추적 헤더(`traceparent`·`tracestate`·`baggage`)를 제거하고 `credentials: omit`,
 *   `redirect: error`, `referrerPolicy: no-referrer`, `cache: no-store`로 보낸다.
 * - 자격 증명 헤더(SDK 1.x는 `Authorization: Bearer <키>`, 구버전은 `x-api-key`)는 사용자가 넣은 키와
 *   정확히 같을 때만 통과시킨다. 다른 비밀이 Anthropic으로 새는 경로를 막는 방어선이다.
 * - 연결 설정 리비전이 바뀌었으면 전송 전에도, 응답 후에도 결과를 쓰지 않는다.
 * - 진행 중 요청은 보관함 잠금·설정 변경 때 일괄 취소되도록 스토어에 등록하고 시간 제한을 둔다.
 * - 응답은 상한까지만 읽는다. 자동 재시도는 하지 않는다(SDK `maxRetries: 0`은 클라이언트 생성부에서).
 */
import { readBoundedResponseBytes } from "../user-ai-bounded-read";
import { getUserAiSnapshot, registerUserAiRequest } from "../user-ai-store";

import { ANTHROPIC_API_ORIGIN } from "./claude-protocol";

export const CLAUDE_REQUEST_TIMEOUT_MS = 180_000;
export const CLAUDE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type FetchInput = string | URL | Request;
type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClaudeGuardedFetchOptions {
  /** 사용자가 넣은 API 키. 요청의 자격 증명 헤더는 이 값과 같아야만 전송된다. */
  readonly apiKey: string;
  /** 요청을 시작한 시점의 연결 리비전. 달라지면 보내지도, 결과를 쓰지도 않는다. */
  readonly revision: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  /** 테스트용 주입 지점. 기본은 전역 fetch. */
  readonly fetchImpl?: FetchImpl;
  /**
   * 요청이 Anthropic에 도달해 처리됐을 수 있는 시점에 호출된다: 본문을 넘긴 뒤 취소·시간 초과로 끝났을 때, 또는 성공(2xx) 응답을
   * 받았을 때. 4xx·5xx 응답이나 연결 자체의 실패는 처리되지 않았다고 보므로 호출하지 않는다.
   */
  readonly onPossiblyBilled?: () => void;
}

/**
 * 가드가 스스로 막은 경우의 오류. SDK는 `fetch` 예외를 `APIConnectionError`로 감싸므로, 오류 매핑이
 * `cause`에서 이 클래스를 찾아 구체적인 사유(연결 변경·용량 초과·잘못된 주소)를 그대로 보여 준다.
 */
export class ClaudeGuardError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClaudeGuardError";
  }
}

const REVISION_CHANGED = "AI 연결이 변경되어 이전 작업을 전송하지 않았습니다.";

function inputUrl(input: FetchInput): URL {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw);
}

/** 이 앱이 쓰는 Anthropic 끝점. SDK가 `client.messages.create`·`client.models.list`로 부르는 경로와 정확히 같다. */
const ALLOWED_ENDPOINTS: ReadonlyArray<{ readonly method: string; readonly path: string }> = [
  { method: "POST", path: "/v1/messages" },
  { method: "GET", path: "/v1/models" },
];

/** 허용한 끝점·형태가 아니면 전송하지 않는 사유를, 괜찮으면 null을 돌려준다. */
function disallowedRequestReason(url: URL, method: string): string | null {
  if (url.username || url.password) return "Claude 요청 주소에 인증 정보가 들어 있어 전송하지 않았습니다.";
  if (!ALLOWED_ENDPOINTS.some((endpoint) => endpoint.method === method && endpoint.path === url.pathname)) {
    return "Claude 요청 경로가 허용된 API가 아니라서 전송하지 않았습니다.";
  }
  if (url.search) {
    const names = [...url.searchParams.keys()];
    const limit = url.searchParams.get("limit") ?? "";
    const modelListLimit = url.pathname === "/v1/models" && names.length === 1 && names[0] === "limit" && /^\d{1,3}$/u.test(limit);
    if (!modelListLimit) return "Claude 요청 주소에 허용되지 않은 값이 들어 있어 전송하지 않았습니다.";
  }
  return null;
}

/** 사이트 사용자·추적 정보가 키와 함께 Anthropic으로 나가지 않도록 지우는 헤더. */
const STRIPPED_HEADERS = ["cookie", "x-user-id", "traceparent", "tracestate", "baggage"] as const;

export function createClaudeGuardedFetch(options: ClaudeGuardedFetchOptions) {
  const timeoutMs = options.timeoutMs ?? CLAUDE_REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? CLAUDE_MAX_RESPONSE_BYTES;

  return async function claudeGuardedFetch(
    input: FetchInput,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = inputUrl(input);
    if (url.origin !== ANTHROPIC_API_ORIGIN) {
      throw new ClaudeGuardError("Claude 요청 주소가 공식 API가 아니라서 전송하지 않았습니다.");
    }
    const method = (init.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    const disallowed = disallowedRequestReason(url, method);
    if (disallowed) throw new ClaudeGuardError(disallowed);
    if (getUserAiSnapshot().revision !== options.revision) {
      throw new ClaudeGuardError(REVISION_CHANGED);
    }
    if (options.signal?.aborted || init.signal?.aborted) {
      throw new ClaudeGuardError("AI 요청이 전송되기 전에 취소되었습니다.");
    }

    const headers = new Headers(init.headers);
    for (const name of STRIPPED_HEADERS) headers.delete(name);
    const bearer = headers.get("authorization");
    const keyHeader = headers.get("x-api-key");
    if (
      !options.apiKey
      || (bearer !== null && bearer !== `Bearer ${options.apiKey}`)
      || (keyHeader !== null && keyHeader !== options.apiKey)
    ) {
      throw new ClaudeGuardError("연결된 키와 다른 인증 정보가 있어 전송하지 않았습니다.");
    }

    const controller = new AbortController();
    const unregister = registerUserAiRequest(controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(timeoutMs),
      ...(init.signal ? [init.signal] : []),
      ...(options.signal ? [options.signal] : []),
    ]);
    try {
      signal.throwIfAborted();
      const send: FetchImpl = options.fetchImpl ?? ((target, request) => fetch(target, request));
      let response: Response;
      try {
        response = await send(url.href, {
          method: init.method,
          headers,
          body: init.body,
          signal,
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          cache: "no-store",
        });
      } catch (error) {
        // 본문을 넘긴 뒤의 취소·시간 초과는 서버가 이미 처리 중일 수 있다. 연결 자체의 실패(오프라인·CORS)는 처리되지 않았다고 본다.
        if (signal.aborted) options.onPossiblyBilled?.();
        throw error;
      }
      if (response.ok) options.onPossiblyBilled?.();
      let bytes: Uint8Array<ArrayBuffer> | null = null;
      if (response.status !== 204 && response.status !== 205) {
        try {
          bytes = await readBoundedResponseBytes(response, maxResponseBytes);
        } catch (error) {
          if (signal.aborted) throw error;
          throw new ClaudeGuardError(
            error instanceof Error ? error.message : "AI 응답을 읽지 못했습니다.",
            { cause: error },
          );
        }
      }
      signal.throwIfAborted();
      if (getUserAiSnapshot().revision !== options.revision) {
        throw new ClaudeGuardError("AI 연결이 변경되어 결과를 적용하지 않았습니다.");
      }
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      unregister();
    }
  };
}
