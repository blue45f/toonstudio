/**
 * Studio AI 모델별 OpenAI 호환 파라미터 정규화 헬퍼(순수·무부수효과).
 *
 * 공통 판정·정규화 규칙은 `@/shared/ai/openai-model-compat` 단일 기준을 재사용한다.
 */
import {
  computeReasoningMaxCompletionTokens,
  isOpenAiGptImageModel,
  isOpenAiReasoningChatModel,
  normalizeOpenAiImageSizeValue,
} from "@/shared/ai/openai-model-compat";

import type { StudioAiImageSize } from "./studio-ai-response-parsing";

export type OpenAiEffectiveImageSize = StudioAiImageSize | "1024x1536" | "1536x1024";

export function isReasoningChatModel(model: string): boolean {
  return isOpenAiReasoningChatModel(model);
}

export function isGptImageModel(model: string): boolean {
  return isOpenAiGptImageModel(model);
}

export function normalizeOpenAiImageSize(
  model: string,
  size: StudioAiImageSize,
): OpenAiEffectiveImageSize {
  return normalizeOpenAiImageSizeValue(model, size) as OpenAiEffectiveImageSize;
}

export function buildOpenAiTextCompletionBody(params: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  responseFormat: "text" | "json" | "json-array";
}): Record<string, unknown> {
  const reasoning = isReasoningChatModel(params.model);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };

  if (reasoning) {
    body.reasoning_effort = "low";
    body.max_completion_tokens = computeReasoningMaxCompletionTokens(params.maxTokens);
  } else {
    body.temperature = params.temperature;
    body.max_tokens = params.maxTokens;
  }

  if (params.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  return body;
}

export function buildOpenAiConnectionTestBody(model: string): Record<string, unknown> {
  if (isReasoningChatModel(model)) {
    return {
      model,
      messages: [{ role: "user", content: "ping" }],
      max_completion_tokens: 16,
    };
  }
  return {
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
  };
}

export function buildOpenAiImageGenerationBody(
  model: string,
  prompt: string,
  size: StudioAiImageSize,
): { body: Record<string, unknown>; effectiveSize: OpenAiEffectiveImageSize } {
  const effectiveSize = normalizeOpenAiImageSize(model, size);
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: effectiveSize,
    ...(isGptImageModel(model) ? {} : { response_format: "b64_json" }),
  };
  return { body, effectiveSize };
}

export function appendOpenAiImageEditCommonFields(
  form: FormData,
  model: string,
  prompt: string,
): void {
  form.set("prompt", prompt);
  form.set("model", model);
  form.set("n", "1");
  if (!isGptImageModel(model)) {
    form.set("response_format", "b64_json");
  }
}
