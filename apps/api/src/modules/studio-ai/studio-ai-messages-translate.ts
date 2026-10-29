/**
 * studio-ai-messages-translate.ts — 서버 고성능 경로(Messages API)의 요청·응답 변환과,
 * 같은 요청을 무료 풀(OpenAI 호환 Chat Completions) 형식으로 바꾸는 순수 모듈이다(fetch·키 없음).
 *
 * 서버 텍스트 경로(studio-ai.service.ts)는 고성능 경로를 먼저 부르고, 추론 전에 거절되면 같은 요청을
 * 무료 풀로 이어 보낸다. 보조 기능 경로(`/studio-ai/messages`)는 이미지·시스템 블록·JSON 스키마
 * 구조화 출력을 담은 요청을 받으므로, 무료 풀로 넘길 때 이 모듈이 형식을 바꾸고 응답을 다시
 * Messages 형태로 맞춰 브라우저가 경로와 무관하게 같은 방식으로 검증하게 한다.
 */
import {
  studioAiMessageBlocks,
  type StudioAiMessagesRequest,
} from "./studio-ai-messages.dto";

export const STUDIO_AI_PREMIUM_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const STUDIO_AI_PREMIUM_API_VERSION = "2023-06-01";
/** 거절(refusal) 시 서버 측 대체 모델로 같은 요청을 이어 주는 기능의 베타 헤더. */
export const STUDIO_AI_PREMIUM_SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/**
 * 고성능 모델은 사고 토큰이 출력 상한을 함께 쓰므로 응답이 잘리지 않게 더하는 여유분.
 * 실제 과금은 생성량 기준이고, 쿼터 예약은 이 상한까지 보수적으로 잡는다.
 */
export const STUDIO_AI_PREMIUM_THINKING_HEADROOM_TOKENS = 4_000;
export const STUDIO_AI_PREMIUM_MAX_OUTPUT_TOKENS = 16_000;
/** 무료 풀 제공자 대부분이 받는 한 번의 출력 상한. */
export const STUDIO_AI_FREE_MAX_OUTPUT_TOKENS = 8_192;

export type StudioAiPremiumEffort = "low" | "medium" | "high";

function normalizedModelId(model: string): string {
  return model.trim().toLowerCase().replace(/-\d{8}$/u, "");
}

/** `output_config.effort`를 받는 모델(5.x 전 계열, Opus 4.6~4.8, Sonnet 4.6)인지. 모르는 모델에 보내면 400이다. */
export function studioAiPremiumModelSupportsEffort(model: string): boolean {
  const id = normalizedModelId(model);
  return /^claude-(?:haiku|sonnet|opus|fable)-5(?:-\d+)?$/u.test(id)
    || /^claude-opus-4-[678]$/u.test(id)
    || id === "claude-sonnet-4-6";
}

/**
 * 거절 시 서버 측 대체(`fallbacks: "default"`)를 받는 모델. Haiku 5.5는 서버 측 대체가 없어 보내면 안 된다.
 */
export function studioAiPremiumModelSupportsServerFallback(model: string): boolean {
  const id = normalizedModelId(model);
  return id === "claude-opus-5-5"
    || id === "claude-opus-5"
    || id === "claude-sonnet-5-5"
    || id === "claude-fable-5-1";
}

export interface StudioAiPremiumChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface StudioAiPremiumRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: readonly unknown[];
  readonly system?: string | readonly unknown[];
  readonly output_config?: {
    readonly effort?: StudioAiPremiumEffort;
    readonly format?: { readonly type: "json_schema"; readonly schema: Record<string, unknown> };
  };
  readonly fallbacks?: "default";
}

function premiumOutputExtras(
  model: string,
  effort: StudioAiPremiumEffort | undefined,
  format: { type: "json_schema"; schema: Record<string, unknown> } | undefined,
): Pick<StudioAiPremiumRequestBody, "output_config" | "fallbacks"> {
  const outputConfig = {
    ...(effort && studioAiPremiumModelSupportsEffort(model) ? { effort } : {}),
    ...(format ? { format } : {}),
  };
  return {
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    ...(studioAiPremiumModelSupportsServerFallback(model) ? { fallbacks: "default" as const } : {}),
  };
}

/** 요청 본문에 맞는 Messages API 헤더. 서버 측 대체를 실을 때만 베타 헤더를 붙인다. */
export function studioAiPremiumRequestHeaders(
  apiKey: string,
  body: Pick<StudioAiPremiumRequestBody, "fallbacks">,
): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": STUDIO_AI_PREMIUM_API_VERSION,
    "Content-Type": "application/json",
    ...(body.fallbacks ? { "anthropic-beta": STUDIO_AI_PREMIUM_SERVER_FALLBACK_BETA } : {}),
  };
}

/** 텍스트 작업(시스템 지시 + 사용자 글)의 Messages API 요청 본문. 버전 헤더는 호출부가 붙인다. */
export function buildPremiumChatRequest(input: {
  readonly model: string;
  readonly system?: string;
  readonly messages: readonly StudioAiPremiumChatMessage[];
  readonly maxTokens: number;
  readonly effort?: StudioAiPremiumEffort;
}): StudioAiPremiumRequestBody | null {
  if (!input.model.trim()) return null;
  if (input.messages.length === 0) return null;
  if (!input.messages.every((message) => message.content.trim())) return null;
  const body: StudioAiPremiumRequestBody = {
    model: input.model,
    max_tokens: Math.min(STUDIO_AI_PREMIUM_MAX_OUTPUT_TOKENS, Math.max(1, Math.floor(input.maxTokens))),
    messages: Object.freeze(
      input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ),
    ...premiumOutputExtras(input.model, input.effort, undefined),
  };
  if (input.system?.trim()) {
    return { ...body, system: input.system.trim() };
  }
  return body;
}

/**
 * 보조 기능 요청을 Messages API 본문으로 옮긴다. 검증된 블록만 그대로 싣고, 서버가 정한 모델·출력 상한과
 * 작업 범위 지시(`scope`)를 앞에 둔다. 범위 지시는 시스템 블록의 맨 앞이라 프롬프트 캐시 접두가 바뀌지 않는다.
 */
export function buildPremiumMessagesRequest(
  request: StudioAiMessagesRequest,
  input: { readonly model: string; readonly scope: string },
): StudioAiPremiumRequestBody {
  const systemBlocks = typeof request.system === "string"
    ? [{ type: "text" as const, text: request.system }]
    : request.system ?? [];
  const effort = request.output_config?.effort;
  const format = request.output_config?.format;
  return {
    model: input.model,
    max_tokens: Math.min(STUDIO_AI_PREMIUM_MAX_OUTPUT_TOKENS, request.max_tokens),
    system: [{ type: "text", text: input.scope }, ...systemBlocks],
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    ...premiumOutputExtras(input.model, effort, format),
  };
}

export type StudioAiPremiumStopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "refusal"
  | "pause_turn"
  | "model_context_window_exceeded"
  | "other";

export type StudioAiPremiumParseResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly model?: string;
      readonly stopReason: StudioAiPremiumStopReason;
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheReadTokens: number;
      readonly cacheWriteTokens: number;
    }
  | { readonly ok: false; readonly reason: "invalid_response" };

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function stopReason(value: unknown): StudioAiPremiumStopReason {
  return value === "end_turn"
    || value === "max_tokens"
    || value === "stop_sequence"
    || value === "refusal"
    || value === "pause_turn"
    || value === "model_context_window_exceeded"
    ? value
    : "other";
}

/** Messages API 응답을 텍스트·멈춤 사유·토큰 사용량으로 파싱한다. 텍스트가 아닌 블록(사고·대체 표시)은 건너뛴다. */
export function parsePremiumMessagesResponse(body: unknown): StudioAiPremiumParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "invalid_response" };
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record["content"])) {
    return { ok: false, reason: "invalid_response" };
  }
  const text = (record["content"] as unknown[])
    .filter(
      (block): block is Record<string, unknown> =>
        typeof block === "object" && block !== null,
    )
    .filter((block) => block["type"] === "text")
    .map((block) => (typeof block["text"] === "string" ? block["text"] : ""))
    .join("");
  const usage = record["usage"];
  if (typeof usage !== "object" || usage === null) {
    return { ok: false, reason: "invalid_response" };
  }
  const usageRecord = usage as Record<string, unknown>;
  const inputTokens = nonNegativeInteger(usageRecord["input_tokens"]);
  const outputTokens = nonNegativeInteger(usageRecord["output_tokens"]);
  if (inputTokens === undefined || outputTokens === undefined) {
    return { ok: false, reason: "invalid_response" };
  }
  const model = typeof record["model"] === "string" && record["model"].trim()
    ? record["model"].trim().slice(0, 200)
    : undefined;
  return {
    ok: true,
    text,
    ...(model ? { model } : {}),
    stopReason: record["stop_reason"] === null || record["stop_reason"] === undefined
      ? "end_turn"
      : stopReason(record["stop_reason"]),
    inputTokens,
    outputTokens,
    cacheReadTokens: nonNegativeInteger(usageRecord["cache_read_input_tokens"]) ?? 0,
    cacheWriteTokens: nonNegativeInteger(usageRecord["cache_creation_input_tokens"]) ?? 0,
  };
}

type FreeChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

export interface StudioAiFreeChatBody {
  readonly model: string;
  readonly messages: ReadonlyArray<{
    readonly role: "system" | "user" | "assistant";
    readonly content: string | readonly FreeChatContentPart[];
  }>;
  readonly max_tokens: number;
  readonly stream: false;
  readonly response_format?: { readonly type: "json_object" };
}

/**
 * 구조화 출력 스키마를 무료 모델에게 글로 알려 준다. 무료 제공자마다 스키마 강제 지원이 달라
 * `json_object` 모드 + 스키마 지시로 맞추고, 받은 뒤에는 브라우저가 같은 Zod 스키마로 다시 검증한다.
 */
function schemaInstruction(schema: Record<string, unknown>): string {
  return [
    "출력 형식: 아래 JSON Schema를 만족하는 JSON 객체 하나만 출력하세요.",
    "설명 문장·마크다운·코드 펜스를 붙이지 말고, 필수 속성을 빠뜨리지 마세요.",
    "<json_schema>",
    JSON.stringify(schema),
    "</json_schema>",
  ].join("\n");
}

/** 보조 기능 요청을 무료 풀(OpenAI 호환) 본문으로 바꾼다. 이미지는 data URL 블록으로 옮긴다. */
export function premiumMessagesToFreeChatBody(
  request: StudioAiMessagesRequest,
  input: { readonly model: string; readonly scope: string },
): StudioAiFreeChatBody {
  const systemText = typeof request.system === "string"
    ? request.system
    : (request.system ?? []).map((block) => block.text).join("\n\n");
  const schema = request.output_config?.format?.schema;
  const system = [input.scope, systemText, schema ? schemaInstruction(schema) : ""]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
  const messages = request.messages.map((message) => {
    const blocks = studioAiMessageBlocks(message.content);
    if (!blocks.some((block) => block.type === "image")) {
      return {
        role: message.role,
        content: blocks.map((block) => (block.type === "text" ? block.text : "")).join("\n\n"),
      };
    }
    return {
      role: message.role,
      content: blocks.map((block): FreeChatContentPart => block.type === "text"
        ? { type: "text", text: block.text }
        : { type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }),
    };
  });
  return {
    model: input.model,
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: Math.min(STUDIO_AI_FREE_MAX_OUTPUT_TOKENS, request.max_tokens),
    stream: false,
    ...(schema ? { response_format: { type: "json_object" as const } } : {}),
  };
}

/** 응답이 ```json … ``` 처럼 코드 펜스로 감싸 오면 벗긴다(무료 모델이 지시를 어기는 흔한 경우). */
export function stripJsonCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/iu.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

/** 브라우저에 돌려주는 Messages 형태의 결과. 경로(고성능·무료)와 무관하게 같은 검증을 받게 한다. */
export interface StudioAiNormalizedMessage {
  readonly id: string;
  readonly type: "message";
  readonly role: "assistant";
  readonly model: string;
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly stop_reason: Exclude<StudioAiPremiumStopReason, "other"> | "end_turn";
  readonly stop_sequence: null;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_read_input_tokens: number;
    readonly cache_creation_input_tokens: number;
  };
}

export function normalizedPremiumMessage(input: {
  readonly id: string;
  readonly model: string;
  readonly text: string;
  readonly stopReason: StudioAiPremiumStopReason;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}): StudioAiNormalizedMessage {
  return {
    id: input.id,
    type: "message",
    role: "assistant",
    model: input.model,
    content: [{ type: "text", text: input.text }],
    stop_reason: input.stopReason === "other" ? "end_turn" : input.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cache_read_input_tokens: input.cacheReadTokens ?? 0,
      cache_creation_input_tokens: input.cacheWriteTokens ?? 0,
    },
  };
}

/** 무료 풀 종료 사유를 Messages 멈춤 사유로 옮긴다. 정상 종료가 아니면 브라우저가 사유를 보여 주고 멈춘다. */
export function freeFinishReasonToStopReason(finishReason: unknown): StudioAiPremiumStopReason {
  if (finishReason === undefined || finishReason === null || finishReason === "stop") return "end_turn";
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "content_filter") return "refusal";
  return "other";
}
