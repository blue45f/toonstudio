/**
 * 관리형 보조 경로 런타임 — 사용자 키 없이 ToonStudio 서버(`POST /studio-ai/messages`)로 보낸다.
 *
 * 항상 `await import("./assist-managed-runtime")`로 지연 로드한다(구조화 출력 스키마 변환기가 SDK 도우미라서).
 * 서버는 운영 고성능 모델을 먼저 쓰고, 추론 전에 거절되면 같은 요청을 성능 순 무료 모델로 이어 보낸 뒤
 * Messages 형태로 돌려준다. 브라우저는 BYOK 경로와 같은 규칙(멈춤 사유·Zod 검증)으로 결과를 확인한다.
 *
 * 안전 규칙
 * - 요청마다 새 멱등 키를 쓰고 같은 요청을 자동으로 다시 보내지 않는다(서버가 이미 처리했을 수 있다).
 * - 예외는 구조화 출력의 형식 복구 한 번뿐이다: 답이 스키마에 맞지 않으면 앞 답과 검증 문제를 붙인
 *   새 요청을 한 번 보낸다. 무료 모델이 형식을 조금 어긴 답을 실패로 끝내지 않기 위해서이며 사용자 비용은 없다.
 * - 서버가 받지 않는 매개변수(샘플링·도구·사고 설정·URL 이미지)는 보내기 전에 거르거나 막는다.
 * - 오류는 사용자에게 보여도 안전한 문구로만 바꾼다.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { api, isAppApiError } from "@/platform/api";

import { UserAiTransportError } from "../user-ai-transport-error";

import { describeSchemaIssues, extractJsonCandidate } from "./assist-json";
import { managedAssistModelLabel } from "./assist-route";
import { assertAssistMessageComplete } from "./assist-stop-reason";

import type { AssistParseParams } from "./assist-runtime";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/** 서버의 고성능 경로 제한 시간(120초)에 응답 여유를 더한 값. 서버보다 먼저 끊어 이미 처리된 결과를 놓치지 않게 한다. */
export const MANAGED_ASSIST_TIMEOUT_MS = 135_000;
/** 서버 계약(`STUDIO_AI_MESSAGES_LIMITS.maxOutputTokens`)과 같은 출력 상한. */
const MANAGED_MAX_OUTPUT_TOKENS = 16_000;
/** 서버 계약(`STUDIO_AI_MESSAGES_LIMITS.maxMessages`)의 메시지 수 상한. 형식 복구는 두 개를 더 붙인다. */
const MANAGED_MAX_MESSAGES = 8;
/** 형식 복구 요청에 다시 싣는 앞 답의 최대 길이(문자). 긴 답 전체를 다시 보내 요청을 키우지 않는다. */
const REPAIR_ECHO_MAX_CHARS = 8_000;
const FORMAT_ERROR_MESSAGE = "AI 응답을 정해진 형식으로 해석하지 못했어요. 다시 시도해 주세요.";

export interface ManagedAssistOptions {
  readonly signal?: AbortSignal;
  /** 테스트에서 서버 호출을 바꿔 끼운다. */
  readonly post?: (body: ManagedAssistRequestBody, init: { signal?: AbortSignal; idempotencyKey: string }) => Promise<unknown>;
}

type ManagedEffort = "low" | "medium" | "high";

interface ManagedTextBlock {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral"; readonly ttl?: "5m" | "1h" };
}

interface ManagedImageBlock {
  readonly type: "image";
  readonly source: { readonly type: "base64"; readonly media_type: string; readonly data: string };
  readonly cache_control?: { readonly type: "ephemeral"; readonly ttl?: "5m" | "1h" };
}

export interface ManagedAssistRequestBody {
  readonly model?: string;
  readonly max_tokens: number;
  readonly system?: string | readonly ManagedTextBlock[];
  readonly messages: ReadonlyArray<{
    readonly role: "user" | "assistant";
    readonly content: string | ReadonlyArray<ManagedTextBlock | ManagedImageBlock>;
  }>;
  readonly output_config?: {
    readonly effort?: ManagedEffort;
    readonly format?: { readonly type: "json_schema"; readonly schema: Record<string, unknown> };
  };
}

const UNSUPPORTED_MESSAGE =
  "이 요청 형식은 ToonStudio AI에서 지원하지 않아요. 설정 > AI에서 내 Claude 키를 연결하면 그대로 쓸 수 있어요.";

function unsupported(): UserAiTransportError {
  return new UserAiTransportError("http-error", UNSUPPORTED_MESSAGE, 400);
}

function cacheControl(value: unknown): ManagedTextBlock["cache_control"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { type?: unknown; ttl?: unknown };
  if (record.type !== "ephemeral") return undefined;
  return record.ttl === "5m" || record.ttl === "1h"
    ? { type: "ephemeral", ttl: record.ttl }
    : { type: "ephemeral" };
}

function textBlock(block: { text: string; cache_control?: unknown }): ManagedTextBlock {
  const cache = cacheControl(block.cache_control);
  return { type: "text", text: block.text, ...(cache ? { cache_control: cache } : {}) };
}

function contentBlock(block: Anthropic.ContentBlockParam): ManagedTextBlock | ManagedImageBlock {
  if (block.type === "text") return textBlock(block);
  if (block.type === "image" && block.source.type === "base64") {
    const cache = cacheControl(block.cache_control);
    return {
      type: "image",
      source: { type: "base64", media_type: block.source.media_type, data: block.source.data },
      ...(cache ? { cache_control: cache } : {}),
    };
  }
  // URL 이미지·문서·도구 결과 블록은 서버 경로 계약 밖이다.
  throw unsupported();
}

function managedEffort(value: unknown): ManagedEffort | undefined {
  if (value === "low" || value === "medium" || value === "high") return value;
  // 서버 경로는 비용 상한을 위해 high까지만 받는다. 더 깊은 요청은 high로 맞춘다.
  if (value === "xhigh" || value === "max") return "high";
  return undefined;
}

/** SDK 요청 본문에서 서버 경로 계약에 맞는 부분만 옮긴다. 샘플링·사고 설정·도구는 서버가 정한다. */
export function toManagedAssistRequest(
  params: Anthropic.MessageCreateParamsNonStreaming,
  format?: { type: "json_schema"; schema: Record<string, unknown> },
): ManagedAssistRequestBody {
  if (params.tools?.length || params.tool_choice) throw unsupported();
  const system = typeof params.system === "string"
    ? params.system
    : params.system?.map((block) => textBlock(block));
  const effort = managedEffort(params.output_config?.effort);
  const outputConfig = {
    ...(effort ? { effort } : {}),
    ...(format ? { format } : {}),
  };
  return {
    model: params.model,
    max_tokens: Math.max(1, Math.min(MANAGED_MAX_OUTPUT_TOKENS, Math.floor(params.max_tokens))),
    ...(system && (typeof system === "string" ? system.trim() : system.length > 0) ? { system } : {}),
    messages: params.messages.map((message) => {
      // 대화 중간의 system 역할 메시지는 서버 경로 계약 밖이다(지시는 최상위 system으로만 받는다).
      if (message.role !== "user" && message.role !== "assistant") throw unsupported();
      return {
        role: message.role,
        content: typeof message.content === "string"
          ? message.content
          : message.content.map((block) => contentBlock(block)),
      };
    }),
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
  };
}

function newIdempotencyKey(): string {
  const entropy = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `assist-${entropy}`.slice(0, 128);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * 서버 응답에서 Messages 형태 결과만 꺼낸다. 형식이 다르면 처리 여부를 알 수 없으므로 재시도하지 않고 알린다.
 * 모델 이름은 "ToonStudio AI (실제 모델)"로 바꿔 돌려준다 — 결과 화면이 사용자 비용을 추정하지 않게 하기 위해서다.
 */
function managedMessage(value: unknown): Anthropic.Message {
  const message = isRecord(value) ? value.message : undefined;
  if (
    !isRecord(message)
    || message.type !== "message"
    || !Array.isArray(message.content)
    || !isRecord(message.usage)
    || typeof message.model !== "string"
  ) {
    throw new UserAiTransportError("http-error", "ToonStudio AI 응답 형식을 확인하지 못했어요. 다시 시도해 주세요.", 200);
  }
  return { ...(message as unknown as Anthropic.Message), model: managedAssistModelLabel(message.model) };
}

const LOGIN_MESSAGE = "로그인하면 ToonStudio AI를 키 없이 바로 쓸 수 있어요. 로그인하거나 설정 > AI에서 내 API 키를 연결해 주세요.";
const UNAVAILABLE_MESSAGE = "ToonStudio AI가 아직 준비되지 않았어요. 잠시 후 다시 시도하거나 설정 > AI에서 내 API 키를 연결해 주세요.";
// 서버는 오늘 한도를 다 쓴 경우와 무료 제공자가 잠시 요청을 제한한 경우에 같은 코드를 보낸다. 둘 다 맞는 문구를 쓴다.
const EXHAUSTED_MESSAGE = "ToonStudio AI 사용 한도에 닿았어요. 잠시 뒤 다시 시도해 보고, 계속되면 오늘 한도를 다 쓴 것이라 UTC 자정 이후 다시 쓰거나 설정 > AI에서 내 API 키를 연결해 주세요.";
const CANCELLED_MESSAGE = "AI 요청이 취소되거나 제한 시간을 초과했습니다. 앱은 같은 요청을 자동 재전송하지 않습니다.";

/** 서버 오류를 기존 보조 기능 오류 모델로 바꾼다. 코드에 따라 화면이 로그인·설정 안내를 고른다. */
export function mapManagedAssistError(error: unknown, signal?: AbortSignal): Error {
  if (error instanceof UserAiTransportError) return error;
  if (signal?.aborted || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
    return new Error(CANCELLED_MESSAGE, { cause: error });
  }
  if (isAppApiError(error)) {
    const code = error.code ?? "";
    if (error.status === 401 || code === "FREE_AI_LOGIN_REQUIRED") {
      return new UserAiTransportError("authentication", LOGIN_MESSAGE, 401);
    }
    if (code === "FREE_AI_POOL_EXHAUSTED" || code === "FREE_AI_PROVIDER_QUOTA_EXHAUSTED") {
      return new UserAiTransportError("all-free-exhausted", EXHAUSTED_MESSAGE, error.status ?? 429);
    }
    if (error.status === 429) {
      return new UserAiTransportError("quota-exhausted", error.message || EXHAUSTED_MESSAGE, 429);
    }
    if (code === "FREE_AI_POOL_UNAVAILABLE" || code === "PREMIUM_AI_UNAVAILABLE") {
      return new UserAiTransportError("not-configured", UNAVAILABLE_MESSAGE, error.status ?? 503);
    }
    return new UserAiTransportError(
      "http-error",
      error.message || "ToonStudio AI가 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
      error.status ?? undefined,
    );
  }
  return error instanceof Error
    ? error
    : new Error("ToonStudio AI 요청 중 알 수 없는 오류가 발생했어요.");
}

let managedQueueTail: Promise<unknown> = Promise.resolve();

/** 앞 요청이 끝나기를 기다린다. 기다리는 동안 취소되면 바로 끝낸다(앞 요청은 그대로 둔다). */
function waitForManagedTurn(previous: Promise<unknown>, signal?: AbortSignal): Promise<void> {
  const settled = previous.then(() => undefined, () => undefined);
  if (!signal) return settled;
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    void settled.then(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
}

/**
 * 서버는 사용자당 한 번에 하나의 AI 요청만 받는다(동시에 보내면 429 "이미 처리 중"). 같은 탭에서 여러 보조 기능을
 * 함께 실행해도 실패하지 않게 관리형 요청을 차례로 보낸다. 다음 차례는 앞 요청과 이 요청이 모두 끝난 뒤다.
 */
function inManagedQueue<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  const previous = managedQueueTail;
  const run = waitForManagedTurn(previous, signal).then(task);
  managedQueueTail = Promise.allSettled([previous, run]);
  return run;
}

async function postManaged(
  body: ManagedAssistRequestBody,
  options: ManagedAssistOptions,
): Promise<unknown> {
  return inManagedQueue(options.signal, () => {
    const idempotencyKey = newIdempotencyKey();
    if (options.post) return options.post(body, { signal: options.signal, idempotencyKey });
    return api.post<unknown>("/studio-ai/messages", body, {
      ...(options.signal ? { signal: options.signal } : {}),
      headers: { "Idempotency-Key": idempotencyKey },
      timeout: MANAGED_ASSIST_TIMEOUT_MS,
      totalTimeout: MANAGED_ASSIST_TIMEOUT_MS + 5_000,
      errorMessage: "ToonStudio AI 요청을 처리하지 못했어요.",
    });
  });
}

/** 관리형 경로의 자유 형식 Messages 호출. 멈춤 사유 판정은 호출 쪽이 BYOK와 같은 함수로 한다. */
export async function runManagedAssistMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: ManagedAssistOptions = {},
): Promise<Anthropic.Message> {
  const body = toManagedAssistRequest(params);
  try {
    return managedMessage(await postManaged(body, options));
  } catch (error) {
    throw mapManagedAssistError(error, options.signal);
  }
}

function messageText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

type StructuredRead<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly text: string; readonly issues: readonly string[] };

/** 답에서 JSON을 꺼내(앞뒤 설명·코드 펜스 허용) 같은 Zod 스키마로 검증한다. */
function readStructured<Schema extends z.ZodType>(message: Anthropic.Message, schema: Schema): StructuredRead<z.infer<Schema>> {
  const text = messageText(message);
  const candidate = extractJsonCandidate(text);
  if (candidate === undefined) return { ok: false, text, issues: ["JSON 객체를 찾지 못했어요."] };
  const result = schema.safeParse(candidate);
  return result.success
    ? { ok: true, data: result.data as z.infer<Schema> }
    : { ok: false, text, issues: describeSchemaIssues(result.error) };
}

function repairInstruction(issues: readonly string[]): string {
  return [
    "앞 답은 정해진 JSON 형식에 맞지 않았어요.",
    "문제:",
    ...issues.map((line) => `- ${line}`),
    "같은 내용으로, 지정된 JSON 스키마를 만족하는 JSON 객체 하나만 다시 출력하세요. 설명·마크다운·코드 펜스는 붙이지 마세요.",
  ].join("\n");
}

/**
 * 관리형 경로의 구조화 출력 호출. 서버가 어느 모델로 처리했든 같은 Zod 스키마로 다시 검증한다.
 * 답이 스키마에 맞지 않으면 앞 답과 검증 문제를 붙여 한 번만 고쳐 달라고 하고, 그래도 맞지 않으면 형식 오류로 알린다.
 */
export async function runManagedAssistParse<Schema extends z.ZodType>(
  params: AssistParseParams,
  schema: Schema,
  options: ManagedAssistOptions = {},
): Promise<{ message: Anthropic.Message; parsed: z.infer<Schema> }> {
  const format = zodOutputFormat(schema);
  const body = toManagedAssistRequest(
    params as Anthropic.MessageCreateParamsNonStreaming,
    { type: "json_schema", schema: format.schema as Record<string, unknown> },
  );
  const send = async (request: ManagedAssistRequestBody): Promise<Anthropic.Message> => {
    let message: Anthropic.Message;
    try {
      message = managedMessage(await postManaged(request, options));
    } catch (error) {
      throw mapManagedAssistError(error, options.signal);
    }
    assertAssistMessageComplete(message);
    return message;
  };

  const first = await send(body);
  const firstRead = readStructured(first, schema);
  if (firstRead.ok) return { message: first, parsed: firstRead.data };
  if (options.signal?.aborted) throw mapManagedAssistError(null, options.signal);
  if (body.messages.length + 2 > MANAGED_MAX_MESSAGES) {
    throw new UserAiTransportError("http-error", FORMAT_ERROR_MESSAGE, 200);
  }

  let repaired: Anthropic.Message;
  try {
    repaired = await send({
      ...body,
      messages: [
        ...body.messages,
        { role: "assistant", content: firstRead.text.trim().slice(0, REPAIR_ECHO_MAX_CHARS) || "(빈 답)" },
        { role: "user", content: repairInstruction(firstRead.issues) },
      ],
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // 복구 요청이 막혀도(한도·서버 형식 검사) 사용자에게는 처음 답의 형식 문제를 알린다.
    throw new UserAiTransportError("http-error", FORMAT_ERROR_MESSAGE, 200);
  }
  const secondRead = readStructured(repaired, schema);
  if (secondRead.ok) return { message: repaired, parsed: secondRead.data };
  throw new UserAiTransportError("http-error", FORMAT_ERROR_MESSAGE, 200);
}
