/**
 * Claude 전송 파사드 — 정적으로 import해도 가벼운 얇은 층(SDK는 호출 시점에 지연 로드).
 *
 * 두 진입점이 있다.
 * 1. 기존 OpenAI 호환 호출자용 브리지: `userAiFetch`가 Claude 연결을 만나면 `claudeBridgedResponse`로
 *    위임해, 호출자가 OpenAI 형식으로 보내고 받는 그대로 Claude를 쓴다.
 * 2. Claude 네이티브 기능용: `claudeCreate`(자유 형식 Messages)와 `claudeParse`(Zod 구조화 출력).
 *
 * 모든 호출은 사용량 미터에 기록되고(오류로 끝나도 이미 과금된 호출이면 기록), 거절·잘림·빈 응답은
 * 조용히 넘기지 않고 사유가 드러나는 오류가 된다. 자동 재시도·모델 대체는 없다.
 */
import { getUserAiSnapshot } from "../user-ai-store";
import { UserAiTransportError } from "../user-ai-transport-error";

import {
  claudeMessageText,
  claudeMessageToOpenAiChat,
  ClaudeBridgeError,
  openAiChatToClaudeRequest,
  type ClaudeEffort,
} from "./claude-bridge";
import { recordClaudeUsage } from "./claude-usage-meter";

import type { ClaudeModelListing, ClaudeParseParams, ClaudeRuntimeOptions } from "./claude-runtime";
import type { ClaudeRoute } from "./claude-route";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

const loadClaudeRuntime = () => import("./claude-runtime");

export interface ClaudeCallOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly fetchImpl?: ClaudeRuntimeOptions["fetchImpl"];
}

/** `userAiFetch`가 이미 검증한 연결 정보 중 Claude 호출에 필요한 최소 필드. */
export interface ClaudeBridgeConnection {
  readonly id: string;
  readonly apiKey: string;
  readonly textModel: string;
  readonly chatCompletionsPath: string;
}

const REFUSED_MESSAGE = "Claude 안전 정책으로 이 요청을 처리하지 않았어요. 요청 내용을 조정해 보세요.";
const TRUNCATED_MESSAGE =
  "Claude 응답이 길이 제한에서 잘렸어요. 입력을 줄이거나 다시 시도하세요. 자동으로 재전송하지 않았어요.";

function runtimeOptions(options: ClaudeCallOptions): ClaudeRuntimeOptions {
  return {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    onMessage: (message) => recordClaudeUsage(message.model, message.usage),
  };
}

/** 응답이 끝까지 온 정상 응답인지 확인한다. 아니면 사유가 드러나는 오류. */
export function assertClaudeMessageComplete(message: Anthropic.Message): void {
  if (message.stop_reason === "refusal") {
    throw new UserAiTransportError("http-error", REFUSED_MESSAGE, 200);
  }
  if (
    message.stop_reason === "max_tokens"
    || message.stop_reason === "model_context_window_exceeded"
    || message.stop_reason === "pause_turn"
  ) {
    throw new UserAiTransportError("http-error", TRUNCATED_MESSAGE, 200);
  }
}

/** OpenAI 형식으로 들어온 요청을 Claude로 보내고 OpenAI 형식 응답을 돌려준다. */
async function claudeChatCompletion(
  connection: ClaudeBridgeConnection,
  body: unknown,
  revision: number,
  options: ClaudeCallOptions & { readonly effort?: ClaudeEffort },
) {
  let request: ReturnType<typeof openAiChatToClaudeRequest>;
  try {
    request = openAiChatToClaudeRequest(body, { model: connection.textModel, effort: options.effort });
  } catch (error) {
    if (error instanceof ClaudeBridgeError) throw new Error(error.message, { cause: error });
    throw error;
  }
  const runtime = await loadClaudeRuntime();
  const message = await runtime.runClaudeMessage(
    { apiKey: connection.apiKey, revision },
    request.params,
    runtimeOptions(options),
  );
  assertClaudeMessageComplete(message);
  if (claudeMessageText(message).trim().length === 0) {
    throw new UserAiTransportError("http-error", "Claude 응답이 비어 있어요. 다시 시도해 주세요.", 200);
  }
  return claudeMessageToOpenAiChat(message);
}

/**
 * `userAiFetch`가 Claude 연결에 대해 돌려주는 응답. 호출자는 OpenAI 채팅 응답 JSON을 그대로 읽는다.
 * Claude 연결은 텍스트 채팅 한 경로만 있으므로 그 밖의 경로·메서드는 보내지 않고 거절한다.
 */
export async function claudeBridgedResponse(
  capability: string,
  path: string,
  method: string,
  body: unknown,
  connection: ClaudeBridgeConnection,
  revision: number,
  options: ClaudeCallOptions,
): Promise<Response> {
  if (capability !== "text" || method.toUpperCase() !== "POST" || path !== connection.chatCompletionsPath) {
    throw new Error("Claude 연결은 텍스트 채팅 요청만 지원합니다. 이미지·음성 작업에는 다른 공급자를 사용하세요.");
  }
  const completion = await claudeChatCompletion(connection, body, revision, options);
  return new Response(JSON.stringify(completion), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Claude 네이티브 호출(비전·시스템 블록·캐시 등 자유 형식). */
export async function claudeCreate(
  route: Pick<ClaudeRoute, "apiKey" | "revision">,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: ClaudeCallOptions = {},
): Promise<Anthropic.Message> {
  const runtime = await loadClaudeRuntime();
  const message = await runtime.runClaudeMessage(route, params, runtimeOptions(options));
  assertClaudeMessageComplete(message);
  return message;
}

/** Claude 구조화 출력 호출. Zod 스키마를 만족하는 값만 돌려준다. */
export async function claudeParse<Schema extends z.ZodType>(
  route: Pick<ClaudeRoute, "apiKey" | "revision">,
  params: ClaudeParseParams,
  schema: Schema,
  options: ClaudeCallOptions = {},
): Promise<{ message: Anthropic.Message; parsed: z.infer<Schema> }> {
  const runtime = await loadClaudeRuntime();
  return runtime.runClaudeParse(route, params, schema, runtimeOptions(options));
}

export type ClaudeKeyProbeResult =
  | { readonly status: "ok"; readonly modelCount: number | null }
  | { readonly status: "unauthorized" }
  | { readonly status: "http_error"; readonly httpStatus: number }
  | { readonly status: "unreachable" };

/** 키가 실제로 유효한지 모델 목록(무료 호출)으로 확인한다. 키 값은 결과에 담지 않는다. */
export async function probeClaudeKey(
  apiKey: string,
  options: ClaudeCallOptions = {},
): Promise<ClaudeKeyProbeResult> {
  try {
    const runtime = await loadClaudeRuntime();
    const models = await runtime.listClaudeModels(
      { apiKey, revision: getUserAiSnapshot().revision },
      { signal: options.signal, timeoutMs: options.timeoutMs, fetchImpl: options.fetchImpl },
    );
    return { status: "ok", modelCount: models.length };
  } catch (error) {
    if (error instanceof UserAiTransportError) {
      if (error.code === "authentication") return { status: "unauthorized" };
      if (typeof error.status === "number") return { status: "http_error", httpStatus: error.status };
    }
    return { status: "unreachable" };
  }
}

/** 설정 카드의 모델 선택용 목록. 실패하면 오류를 그대로 올려 카드가 사유를 보여 준다. */
export async function listClaudeModelsForKey(
  apiKey: string,
  options: ClaudeCallOptions = {},
): Promise<ClaudeModelListing[]> {
  const runtime = await loadClaudeRuntime();
  return runtime.listClaudeModels(
    { apiKey, revision: getUserAiSnapshot().revision },
    { signal: options.signal, timeoutMs: options.timeoutMs, fetchImpl: options.fetchImpl },
  );
}
