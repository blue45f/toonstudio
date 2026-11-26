import type { StudioAiSettings } from "./studio-ai-settings";

/** GPT Image는 PNG를 base64로 반환한다. 다른 BYOK 제공자는 기존 응답 형식을 사용한다. */
export function studioImageFormatField(
  { baseUrl, imageModel }: Pick<StudioAiSettings, "baseUrl" | "imageModel">,
): [field: "output_format" | "response_format", value: "png" | "b64_json"] {
  if (/^https:\/\/api\.openai\.com(?::443)?(?:\/|$)/i.test(baseUrl.trim()) && imageModel.startsWith("gpt-image-")) {
    return ["output_format", "png"];
  }
  return ["response_format", "b64_json"];
}
