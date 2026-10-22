/**
 * OpenAI 채팅 본문 ↔ Claude Messages API 번역 — 순수 함수(SDK 타입만 참조, 런타임 import 없음).
 *
 * 기존 BYOK 호출자(`completeUserAiText`, `userAiLegacyJson` 등)는 OpenAI 형식 본문을 보내고
 * `choices[0].message.content`를 읽는다. 전송 계층이 이 브리지를 거치면 호출자를 하나도 고치지 않고
 * 같은 기능이 Claude로 동작한다.
 *
 * API 계약(2026-10-21 버전):
 * - `temperature`·`top_p`·`top_k`는 모든 모델에서 400이다. 호출자가 보내도 조용히 제거하고
 *   제거한 항목을 `droppedParameters`로 돌려줘 테스트·진단이 볼 수 있게 한다.
 * - 5.x 모델은 사고(thinking)가 기본으로 켜져 `max_tokens`에 사고 토큰이 포함된다. 호출자가 요구한
 *   출력 상한 위에 사고 여유분을 더해, 사고가 상한을 다 써서 본문이 비는 일을 막는다. 과금은
 *   실제 생성 토큰 기준이지만 사고가 그 여유분까지 쓸 수 있으므로, 비용 상한은 여유분을 더한 `max_tokens`로 잰다
 *   (전송 계층의 예산 판정과 같은 값이다).
 * - JSON 모드(`json_object`)는 스키마 없는 JSON을 강제할 수 없으므로 시스템 지시로 요청하고,
 *   `json_schema`는 구조화 출력(`output_config.format`)으로 그대로 옮긴다.
 */
import { claudeModelSupportsEffort } from "./claude-models";

import type Anthropic from "@anthropic-ai/sdk";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export class ClaudeBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeBridgeError";
  }
}

export interface ClaudeBridgeOptions {
  model: string;
  /** 기본 medium. 지원하지 않는 모델에는 보내지 않는다. */
  effort?: ClaudeEffort;
  /** 호출자 상한 위에 더하는 사고 여유분. 기본 2048. */
  thinkingHeadroomTokens?: number;
  /** 호출자가 상한을 주지 않았을 때의 출력 상한. 기본 4096. */
  defaultMaxTokens?: number;
}

export interface ClaudeBridgeRequest {
  params: Anthropic.MessageCreateParamsNonStreaming;
  /** Claude로 옮기지 않고 버린 OpenAI 파라미터 이름. */
  droppedParameters: readonly string[];
}

const DEFAULT_MAX_TOKENS = 4_096;
const DEFAULT_THINKING_HEADROOM = 2_048;
const MAX_OUTPUT_TOKENS = 16_000;
const MIN_OUTPUT_TOKENS = 16;
const MAX_MESSAGES = 200;
const MAX_STOP_SEQUENCES = 8;
/** API 이미지 한도(5MB)에 base64 팽창을 더한 문자 수. */
const MAX_IMAGE_BASE64_CHARS = 7_000_000;
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/u;

/** 호출 중인 기능과 무관하게 Claude가 받지 못하는(또는 보내면 400인) 샘플링·로짓 계열 파라미터. */
const DROPPED_PARAMETER_NAMES = [
  "temperature",
  "top_p",
  "top_k",
  "presence_penalty",
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "top_logprobs",
  "seed",
  "user",
  "parallel_tool_calls",
  "store",
  "metadata",
] as const;

const JSON_ONLY_INSTRUCTION =
  "응답은 설명·머리말·코드 펜스 없이 유효한 JSON 하나만 출력하세요.";

type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function imageBlock(url: unknown): Anthropic.ImageBlockParam {
  const match = typeof url === "string" ? IMAGE_DATA_URL.exec(url) : null;
  if (!match) {
    throw new ClaudeBridgeError(
      "이미지는 PNG·JPEG·GIF·WebP 데이터 URL만 Claude로 보낼 수 있어요. 외부 주소는 전송하지 않아요.",
    );
  }
  const data = match[2] ?? "";
  if (data.length > MAX_IMAGE_BASE64_CHARS) {
    throw new ClaudeBridgeError("이미지가 너무 커요. 한 장당 약 5MB 이하로 줄여 주세요.");
  }
  return {
    type: "image",
    source: { type: "base64", media_type: match[1] as ImageMediaType, data },
  };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) throw new ClaudeBridgeError("지원하지 않는 메시지 형식이에요.");
  const parts: string[] = [];
  for (const part of content) {
    const record = asRecord(part);
    if (record?.type !== "text" || typeof record.text !== "string") {
      throw new ClaudeBridgeError("시스템 지시에는 텍스트만 넣을 수 있어요.");
    }
    parts.push(record.text);
  }
  return parts.join("\n");
}

function userContent(content: unknown): string | Anthropic.ContentBlockParam[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new ClaudeBridgeError("지원하지 않는 메시지 형식이에요.");
  }
  return content.map((part): Anthropic.ContentBlockParam => {
    const record = asRecord(part);
    if (record?.type === "text" && typeof record.text === "string") {
      return { type: "text", text: record.text };
    }
    if (record?.type === "image_url") {
      const image = asRecord(record.image_url);
      return imageBlock(image?.url);
    }
    throw new ClaudeBridgeError("텍스트와 이미지 외의 입력은 Claude로 보내지 않아요.");
  });
}

function boundedTokens(value: unknown, fallback: number): number {
  const requested = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, requested));
}

function stopSequences(value: unknown): string[] | undefined {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const clean = list
    .filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 200)
    .slice(0, MAX_STOP_SEQUENCES);
  return clean.length > 0 ? clean : undefined;
}

/** OpenAI 채팅 본문을 Claude Messages 요청으로 옮긴다. 옮길 수 없는 형식은 `ClaudeBridgeError`. */
export function openAiChatToClaudeRequest(
  body: unknown,
  options: ClaudeBridgeOptions,
): ClaudeBridgeRequest {
  const source = asRecord(body);
  if (!source || !Array.isArray(source.messages) || source.messages.length === 0) {
    throw new ClaudeBridgeError("AI 요청에 메시지가 없어요.");
  }
  if (source.messages.length > MAX_MESSAGES) {
    throw new ClaudeBridgeError("AI 요청의 메시지가 너무 많아요.");
  }
  if (source.stream === true) {
    throw new ClaudeBridgeError("스트리밍 응답은 이 경로에서 지원하지 않아요.");
  }
  if (typeof source.n === "number" && source.n > 1) {
    throw new ClaudeBridgeError("Claude는 응답 여러 개를 한 번에 만들지 않아요(n=1만 지원).");
  }
  if (source.tools !== undefined || source.functions !== undefined || source.tool_choice !== undefined) {
    throw new ClaudeBridgeError("도구 호출은 이 경로에서 지원하지 않아요.");
  }

  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const raw of source.messages) {
    const message = asRecord(raw);
    const role = message?.role;
    if (role === "system" || role === "developer") {
      systemParts.push(textOf(message?.content));
    } else if (role === "user") {
      messages.push({ role: "user", content: userContent(message?.content) });
    } else if (role === "assistant") {
      if (typeof message?.content !== "string") {
        throw new ClaudeBridgeError("어시스턴트 메시지는 텍스트만 지원해요.");
      }
      messages.push({ role: "assistant", content: message.content });
    } else {
      throw new ClaudeBridgeError("지원하지 않는 메시지 역할이에요.");
    }
  }
  if (messages.length === 0 || messages[0]?.role !== "user") {
    throw new ClaudeBridgeError("첫 메시지는 사용자 메시지여야 해요.");
  }

  const format = asRecord(source.response_format);
  let jsonSchema: Record<string, unknown> | null = null;
  if (format?.type === "json_object") {
    systemParts.push(JSON_ONLY_INSTRUCTION);
  } else if (format?.type === "json_schema") {
    jsonSchema = asRecord(asRecord(format.json_schema)?.schema);
    if (!jsonSchema) throw new ClaudeBridgeError("JSON 스키마가 올바르지 않아요.");
  }

  const requested = boundedTokens(
    source.max_completion_tokens ?? source.max_tokens,
    options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
  );
  const headroom = Math.max(0, options.thinkingHeadroomTokens ?? DEFAULT_THINKING_HEADROOM);
  const system = systemParts.map((part) => part.trim()).filter(Boolean).join("\n\n");
  const stop = stopSequences(source.stop);
  const effort = options.effort ?? "medium";

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: options.model,
    max_tokens: requested + headroom,
    messages,
    ...(system ? { system } : {}),
    ...(stop ? { stop_sequences: stop } : {}),
    ...(claudeModelSupportsEffort(options.model) || jsonSchema
      ? {
          output_config: {
            ...(claudeModelSupportsEffort(options.model) ? { effort } : {}),
            ...(jsonSchema ? { format: { type: "json_schema" as const, schema: jsonSchema } } : {}),
          },
        }
      : {}),
  };

  const droppedParameters = DROPPED_PARAMETER_NAMES.filter((name) => source[name] !== undefined);
  return { params, droppedParameters };
}

/** 응답의 텍스트 블록만 이어 붙인다(사고·도구 블록은 제외). */
export function claudeMessageText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export type OpenAiFinishReason = "stop" | "length" | "content_filter" | "tool_calls";

export function claudeStopToFinishReason(stop: Anthropic.Message["stop_reason"]): OpenAiFinishReason {
  switch (stop) {
    case "max_tokens":
    case "model_context_window_exceeded":
    case "pause_turn":
      return "length";
    case "refusal":
      return "content_filter";
    case "tool_use":
      return "tool_calls";
    default:
      return "stop";
  }
}

export interface OpenAiChatCompletionLike {
  id: string;
  object: "chat.completion";
  model: string;
  requestId?: string;
  choices: Array<{
    index: 0;
    finish_reason: OpenAiFinishReason;
    message: { role: "assistant"; content: string };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

/** Claude 응답을 기존 호출자가 읽는 OpenAI 채팅 응답 형태로 되돌린다. */
export function claudeMessageToOpenAiChat(message: Anthropic.Message): OpenAiChatCompletionLike {
  const cacheRead = message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  const prompt = message.usage.input_tokens + cacheRead + cacheWrite;
  const requestId = (message as { _request_id?: string | null })._request_id;
  return {
    id: message.id,
    object: "chat.completion",
    model: message.model,
    ...(requestId ? { requestId } : {}),
    choices: [{
      index: 0,
      finish_reason: claudeStopToFinishReason(message.stop_reason),
      message: { role: "assistant", content: claudeMessageText(message) },
    }],
    usage: {
      prompt_tokens: prompt,
      completion_tokens: message.usage.output_tokens,
      total_tokens: prompt + message.usage.output_tokens,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheWrite,
    },
  };
}
