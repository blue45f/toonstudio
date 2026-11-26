import { isOpenAiGptImageModel } from "@/shared/ai/openai-model-compat";

import type { StudioAiSettings } from "./studio-ai-settings";

/**
 * GPT Image 계열(`gpt-image-*`, `chatgpt-image-*`)은 `response_format` 파라미터를 거부한다.
 * - OpenAI 직접 연결(`api.openai.com`)에서는 `output_format: "png"`를 명시한다.
 * - 프록시·호환 게이트웨이 경유 GPT Image 모델은 `response_format`을 생략해 기본 base64 응답을 받는다.
 * - 그 외 BYOK 이미지 모델은 기존 `response_format: "b64_json"` 계약을 유지한다.
 */
export function studioImageFormatField(
  { baseUrl, imageModel }: Pick<StudioAiSettings, "baseUrl" | "imageModel">,
): [field: "output_format" | "response_format", value: "png" | "b64_json"] | null {
  if (isOpenAiGptImageModel(imageModel)) {
    if (/^https:\/\/api\.openai\.com(?::443)?(?:\/|$)/iu.test(baseUrl.trim())) {
      return ["output_format", "png"];
    }
    return null;
  }
  return ["response_format", "b64_json"];
}
