/**
 * Claude SDK 런타임 — `@anthropic-ai/sdk`를 정적으로 import하는 **유일한** 모듈.
 *
 * 항상 `await import("./claude-runtime")`로 지연 로드한다. 정적 모듈(정책·전송·UI)이 이 파일을
 * 직접 import하면 SDK가 스튜디오 진입 번들에 들어가므로 금지한다(`check:studio-eager-graph`).
 *
 * 안전 규칙
 * - 키는 사용자 브라우저에서 사용자 본인의 Anthropic 계정으로만 간다. 앱 서버를 거치지 않는다.
 * - `maxRetries: 0` — 처리 여부가 불명확한 실패를 자동 재전송해 중복 과금을 만들지 않는다.
 * - SDK `fetch`는 가드 `fetch`(공식 origin 고정·쿠키 제거·리비전 검사·응답 상한)로 교체한다.
 * - SDK의 OpenTelemetry 추적과 추적 헤더 전파는 끈다. 나중에 앱에 추적 SDK가 들어와도 `traceparent`·`baggage`가 키와 함께 나가지 않는다.
 * - 오류는 사용자에게 보여도 안전한 문구로만 바꾼다(요청 본문·키 값·원문 응답을 싣지 않는다).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { UserAiTransportError } from "../user-ai-transport-error";

import {
  ClaudeGuardError,
  createClaudeGuardedFetch,
  CLAUDE_REQUEST_TIMEOUT_MS,
} from "./claude-guarded-fetch";
import { ANTHROPIC_API_ORIGIN } from "./claude-protocol";
import { assertClaudeMessageComplete } from "./claude-stop-reason";

import type { z } from "zod";

/** 호출 한 번에 필요한 최소 정보. 화면으로 새어 나가지 않도록 키는 이 객체 안에서만 쓴다. */
export interface ClaudeRuntimeRoute {
  readonly apiKey: string;
  readonly revision: number;
}

export interface ClaudeRuntimeOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** 테스트·프로브용 `fetch` 주입. */
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  /**
   * 응답 메시지를 받은 직후(거절·잘림 검사 전) 호출된다. 이미 과금된 호출의 사용량을
   * 오류로 끝나더라도 빠뜨리지 않고 기록하기 위한 훅이다.
   */
  readonly onMessage?: (message: Anthropic.Message) => void;
  /**
   * 요청이 Anthropic에 도달해 처리됐을 수 있는 시점에 한 번 호출된다(본문을 넘긴 뒤의 취소·시간 초과, 또는 성공 응답 수신).
   * 이 뒤에 사용량을 받지 못하고 끝나면 요금이 청구됐을 수 있어, 호출 쪽이 "확인되지 않은 요청"으로 센다.
   */
  readonly onPossiblyBilled?: () => void;
}

const CANCELLED_MESSAGE =
  "AI 요청이 취소되거나 제한 시간을 초과했습니다. 앱은 같은 요청을 자동 재전송하지 않습니다.";
const NETWORK_MESSAGE =
  "클라우드 제공자 연결·CORS·네트워크 상태를 확인하세요. 다른 경로로 중복 전송하지 않았습니다.";

export function createClaudeClient(
  route: ClaudeRuntimeRoute,
  options: ClaudeRuntimeOptions = {},
): Anthropic {
  return new Anthropic({
    apiKey: route.apiKey,
    baseURL: ANTHROPIC_API_ORIGIN,
    // BYOK: 사용자가 직접 넣은 자기 키로 자기 계정에 요청한다. 앱 서버나 제3자에는 보내지 않는다.
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    openTelemetry: false,
    timeout: options.timeoutMs ?? CLAUDE_REQUEST_TIMEOUT_MS,
    fetch: createClaudeGuardedFetch({
      apiKey: route.apiKey,
      revision: route.revision,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      onPossiblyBilled: options.onPossiblyBilled,
    }),
  });
}

/** 키 형태 문자열이 오류 문구에 섞여 들어가도 화면·로그에 남지 않게 지운다. */
function scrubbed(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/gu, "[비밀정보 제거]").trim();
}

function apiErrorDetail(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const raw = typeof body?.error?.message === "string" ? body.error.message : "";
  return scrubbed(raw).slice(0, 240);
}

function isBillingFailure(error: InstanceType<typeof Anthropic.APIError>): boolean {
  return error.type === "billing_error" || /credit balance|billing|plans? (?:&|and) billing/iu.test(apiErrorDetail(error));
}

/** SDK·가드 오류를 기존 BYOK 전송이 쓰는 오류 모델(`UserAiTransportError`/`Error`)로 바꾼다. */
export function mapClaudeError(error: unknown): Error {
  if (error instanceof UserAiTransportError || error instanceof ClaudeGuardError) return error;
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new Error(CANCELLED_MESSAGE, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    if (error.cause instanceof ClaudeGuardError) return error.cause;
    return new Error(NETWORK_MESSAGE, { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 401) {
      return new UserAiTransportError(
        "authentication",
        "Claude API 키 인증에 실패했습니다 (HTTP 401). 키가 맞는지, 폐기되지 않았는지 확인하세요.",
        401,
      );
    }
    if (status === 403) {
      return new UserAiTransportError(
        "authentication",
        "이 Claude API 키로는 요청을 보낼 권한이 없습니다 (HTTP 403). 워크스페이스·모델 권한을 확인하세요.",
        403,
      );
    }
    if (status === 429) {
      return new UserAiTransportError(
        "quota-exhausted",
        "Claude 요청 한도에 도달했습니다 (HTTP 429). 잠시 후 다시 시도하세요. 자동으로 재전송하지 않았습니다.",
        429,
      );
    }
    if (status === 400 && isBillingFailure(error)) {
      return new UserAiTransportError(
        "quota-exhausted",
        "Anthropic 계정의 크레딧이 부족합니다. 콘솔에서 결제·크레딧 상태를 확인하세요. 다른 공급자로 자동 전환하지 않았습니다.",
        400,
      );
    }
    if (status === 404) {
      return new UserAiTransportError(
        "http-error",
        "Claude 모델이나 경로를 찾지 못했습니다 (HTTP 404). 모델 ID를 확인하세요.",
        404,
      );
    }
    if (typeof status === "number" && status >= 500) {
      return new UserAiTransportError(
        "http-error",
        `Claude 서버가 일시적으로 응답하지 않습니다 (HTTP ${status}). 앱은 자동 재시도하지 않습니다.`,
        status,
      );
    }
    const detail = apiErrorDetail(error);
    return new UserAiTransportError(
      "http-error",
      `Claude가 요청을 처리하지 못했습니다 (HTTP ${status ?? "?"})${detail ? `: ${detail}` : ""}`,
      status,
    );
  }
  return error instanceof Error ? error : new Error("Claude 요청 중 알 수 없는 오류가 발생했습니다.");
}

/** 한 번의 Messages 호출. 자동 재시도 없음. */
export async function runClaudeMessage(
  route: ClaudeRuntimeRoute,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: ClaudeRuntimeOptions = {},
): Promise<Anthropic.Message> {
  const client = createClaudeClient(route, options);
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(params, { signal: options.signal });
  } catch (error) {
    throw mapClaudeError(error);
  }
  options.onMessage?.(message);
  return message;
}

/** 구조화 출력은 `format`을 이 함수가 채우므로 호출자는 `output_config.format`을 줄 수 없다. */
export type ClaudeParseParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "output_config"> & {
  output_config?: Omit<NonNullable<Anthropic.MessageCreateParamsNonStreaming["output_config"]>, "format">;
};

export interface ClaudeParsedResult<TOutput> {
  readonly message: Anthropic.Message;
  readonly parsed: TOutput;
}

/**
 * 구조화 출력(`output_config.format`) 호출. Zod 스키마로 응답을 검증해 돌려준다.
 *
 * SDK의 `messages.parse()`는 스키마가 맞지 않으면 메시지를 돌려주기 전에 던져 이미 과금된 호출의
 * 사용량을 놓친다. 그래서 `create()`로 받은 메시지를 먼저 `onMessage`로 넘긴 뒤 직접 검증한다.
 * 거절·잘림·스키마 불일치는 모두 사유가 드러나는 오류가 되며 자동 재시도하지 않는다.
 */
export async function runClaudeParse<Schema extends z.ZodType>(
  route: ClaudeRuntimeRoute,
  params: ClaudeParseParams,
  schema: Schema,
  options: ClaudeRuntimeOptions = {},
): Promise<ClaudeParsedResult<z.infer<Schema>>> {
  const client = createClaudeClient(route, options);
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        ...params,
        output_config: { ...params.output_config, format: zodOutputFormat(schema) },
      },
      { signal: options.signal },
    );
  } catch (error) {
    throw mapClaudeError(error);
  }
  options.onMessage?.(message);
  assertClaudeMessageComplete(message);
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    candidate = undefined;
  }
  const result = candidate === undefined ? null : schema.safeParse(candidate);
  if (!result?.success) {
    throw new UserAiTransportError(
      "http-error",
      "Claude 응답을 정해진 형식으로 해석하지 못했어요. 다시 시도해 주세요.",
      200,
    );
  }
  return { message, parsed: result.data as z.infer<Schema> };
}

export interface ClaudeModelListing {
  readonly id: string;
  readonly displayName: string;
  readonly lifecycle: "active" | "deprecated" | "retired";
  readonly imageInput: boolean;
  readonly structuredOutputs: boolean;
  readonly maxInputTokens: number | null;
  readonly maxOutputTokens: number | null;
}

/** 키로 접근 가능한 모델 목록(무료 호출). 키가 유효한지의 증거이기도 하다. */
export async function listClaudeModels(
  route: ClaudeRuntimeRoute,
  options: ClaudeRuntimeOptions = {},
): Promise<ClaudeModelListing[]> {
  const client = createClaudeClient(route, options);
  try {
    const page = await client.models.list({ limit: 100 }, { signal: options.signal });
    return page.data.map((model) => ({
      id: model.id,
      displayName: model.display_name,
      lifecycle: model.lifecycle,
      imageInput: model.capabilities?.image_input?.supported === true,
      structuredOutputs: model.capabilities?.structured_outputs?.supported === true,
      maxInputTokens: model.max_input_tokens ?? null,
      maxOutputTokens: model.max_tokens ?? null,
    }));
  } catch (error) {
    throw mapClaudeError(error);
  }
}
