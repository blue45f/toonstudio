/**
 * OpenAI 호환 요청 파라미터 정규화 헬퍼(순수·무부수효과).
 *
 * - GPT-5 / GPT-6 / o3 / o4 계열 추론 모델은 `max_tokens`와 비기본 `temperature`를
 *   HTTP 400으로 거부하므로 `max_completion_tokens`를 사용하고 `temperature`를 생략한다.
 * - `gpt-image-*` / `chatgpt-image-*` 계열은 `response_format` 필드를 거부하며
 *   기본적으로 `b64_json`을 반환하고, 세로/가로 해상도로 `1024x1536`·`1536x1024`를 지원한다.
 * - 레거시(`dall-e-3` 등) 및 서드파티 OpenAI 호환 모델은 기존 계약을 유지한다.
 */

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";

const REASONING_CHAT_MODEL_PATTERN = /^(?:openai\/)?(?:gpt-5|gpt-6|o3|o4)(?:$|[-._:])/iu;
const GPT_IMAGE_MODEL_PATTERN = /^(?:openai\/)?(?:gpt-image|chatgpt-image)(?:$|[-._:])/iu;
const RETIRED_OPENAI_IMAGE_MODEL_PATTERN = /^dall-e-[23]$/iu;

const REASONING_MIN_COMPLETION_TOKENS = 4_000;
const REASONING_EXTRA_HEADROOM_TOKENS = 2_400;
const REASONING_MAX_COMPLETION_TOKENS = 8_192;

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

export function isOpenAiReasoningChatModel(model: string): boolean {
  return REASONING_CHAT_MODEL_PATTERN.test(model.trim());
}

export function isOpenAiGptImageModel(model: string): boolean {
  return GPT_IMAGE_MODEL_PATTERN.test(model.trim());
}

export function isRetiredOpenAiImageModel(model: string): boolean {
  return RETIRED_OPENAI_IMAGE_MODEL_PATTERN.test(model.trim());
}

export function normalizeOpenAiImageSizeValue(model: string, size: string): string {
  if (!isOpenAiGptImageModel(model)) return size;
  if (size === "1024x1792") return "1024x1536";
  if (size === "1792x1024") return "1536x1024";
  return size;
}

export function computeReasoningMaxCompletionTokens(requestedMaxTokens: number): number {
  const normalized = Math.max(1, Math.round(requestedMaxTokens));
  if (normalized <= 16) return 16;
  return Math.min(
    REASONING_MAX_COMPLETION_TOKENS,
    Math.max(normalized + REASONING_EXTRA_HEADROOM_TOKENS, REASONING_MIN_COMPLETION_TOKENS),
  );
}

export function buildUserAiTextCompletionBody(
  model: string,
  system: string,
  user: string,
  maxTokens = 4_096,
): Record<string, unknown> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  if (isOpenAiReasoningChatModel(model)) {
    return {
      model,
      messages,
      max_completion_tokens: Math.max(4_096, Math.round(maxTokens)),
    };
  }
  return {
    model,
    messages,
    max_tokens: Math.round(maxTokens),
  };
}

export function normalizeOpenAiLegacyChatBody(
  model: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...values, model };
  if (isOpenAiReasoningChatModel(model)) {
    delete next.temperature;
    const existingCompletion = positiveInt(next.max_completion_tokens);
    const existingMaxTokens = positiveInt(next.max_tokens);
    delete next.max_tokens;
    if (existingCompletion !== null) {
      next.max_completion_tokens = existingCompletion;
    } else if (existingMaxTokens !== null) {
      next.max_completion_tokens = computeReasoningMaxCompletionTokens(existingMaxTokens);
    }
    return next;
  }

  if (!("max_tokens" in next)) {
    const existingCompletion = positiveInt(next.max_completion_tokens);
    if (existingCompletion !== null) {
      next.max_tokens = existingCompletion;
      delete next.max_completion_tokens;
    }
  }
  return next;
}

export function normalizeOpenAiLegacyImageBody(
  model: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...values, model };
  if (isOpenAiGptImageModel(model)) {
    delete next.response_format;
    if (typeof next.size === "string") {
      next.size = normalizeOpenAiImageSizeValue(model, next.size);
    }
  }
  return next;
}

export function normalizeOpenAiLegacyImageForm(model: string, form: FormData): void {
  form.set("model", model);
  if (isOpenAiGptImageModel(model)) {
    form.delete("response_format");
    const size = form.get("size");
    if (typeof size === "string") {
      form.set("size", normalizeOpenAiImageSizeValue(model, size));
    }
  }
}
