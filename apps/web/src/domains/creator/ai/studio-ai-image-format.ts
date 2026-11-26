import { isOpenAiGptImageModel } from "@/shared/ai/openai-model-compat";

import type { StudioAiSettings } from "./studio-ai-settings";

/** GPT Image 호환 경로는 제공자의 기본 출력을 사용하고, OpenAI 직접 연결에서만 PNG를 지정한다. */
export function studioImageFormatField(
  { baseUrl, imageModel }: Pick<StudioAiSettings, "baseUrl" | "imageModel">,
): [field: "output_format", value: "png"] | [field: "response_format", value: "b64_json"] | null {
  if (!isOpenAiGptImageModel(imageModel)) return ["response_format", "b64_json"];
  return /^https:\/\/api\.openai\.com(?::443)?(?:\/|$)/iu.test(baseUrl.trim())
    ? ["output_format", "png"]
    : null;
}
