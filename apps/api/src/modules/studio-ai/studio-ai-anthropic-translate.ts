/**
 * studio-ai-anthropic-translate.ts — 서버 클로드 어댑터 요청·응답 변환 (순수 모듈, fetch 없음).
 *
 * 서버 텍스트 경로(studio-ai.service.ts)는 OpenAI Chat Completions 형태
 * fetch만 있고 제공자 목록에 Anthropic이 없었다. 이 모듈은 서버가
 * 클로드 Messages API를 부를 때 필요한 요청 본문 구성과 응답 파싱만
 * 담당한다. 실제 fetch·키 보관·게이트·크레딧 차감은 서비스 호출부가
 * 기존 completeAdmitted 경로로 수행한다. 키 값은 다루지 않는다.
 */

export interface StudioAiAnthropicMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface StudioAiAnthropicRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: readonly StudioAiAnthropicMessage[];
  readonly system?: string;
}

export const STUDIO_AI_ANTHROPIC_API_URL =
  "https://api.anthropic.com/v1/messages";

/** Messages API 요청 본문을 만든다. 버전 헤더는 호출부가 붙인다. */
export function buildAnthropicMessagesRequest(input: {
  readonly model: string;
  readonly system?: string;
  readonly messages: readonly StudioAiAnthropicMessage[];
  readonly maxTokens: number;
}): StudioAiAnthropicRequestBody | null {
  if (!input.model.trim()) return null;
  if (input.messages.length === 0) return null;
  if (!input.messages.every((message) => message.content.trim())) return null;
  const body: StudioAiAnthropicRequestBody = {
    model: input.model,
    max_tokens: Math.min(4096, Math.max(1, Math.floor(input.maxTokens))),
    messages: Object.freeze(
      input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ),
  };
  if (input.system?.trim()) {
    return { ...body, system: input.system.trim() };
  }
  return body;
}

export type StudioAiAnthropicParseResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  | { readonly ok: false; readonly reason: "invalid_response" };

/** Messages API 응답을 텍스트·토큰 사용량으로 파싱한다. */
export function parseAnthropicMessagesResponse(
  body: unknown,
): StudioAiAnthropicParseResult {
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
  if (
    typeof usageRecord["input_tokens"] !== "number" ||
    typeof usageRecord["output_tokens"] !== "number"
  ) {
    return { ok: false, reason: "invalid_response" };
  }
  return {
    ok: true,
    text,
    inputTokens: usageRecord["input_tokens"] as number,
    outputTokens: usageRecord["output_tokens"] as number,
  };
}
