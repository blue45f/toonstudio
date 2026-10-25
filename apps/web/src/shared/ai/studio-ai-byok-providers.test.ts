import { describe, expect, it } from "vitest";

import {
  findByokProviderPreset,
  findProviderCapability,
} from "./studio-ai-byok-providers";

describe("studio-ai-byok-providers", () => {
  it("OpenAI 호환 프리셋을 찾는다", () => {
    expect(findByokProviderPreset("openai")?.baseUrl).toBe(
      "https://api.openai.com/v1",
    );
    expect(findByokProviderPreset("nope")).toBeNull();
  });

  it("클라우드 채색은 프롬프트 힌트만 되고 레이어 분리·인페인팅은 안 된다", () => {
    const capability = findProviderCapability("byok-images-edits");
    expect(capability?.supportsHintViaPrompt).toBe(true);
    expect(capability?.supportsLayeredOutput).toBe(false);
    expect(capability?.supportsInpainting).toBe(false);
  });

  it("기기 채색은 태그 힌트와 레이어 분리를 지원한다", () => {
    const capability = findProviderCapability("local-onnx");
    expect(capability?.supportsHintViaTags).toBe(true);
    expect(capability?.supportsLayeredOutput).toBe(true);
    expect(capability?.supportsInpainting).toBe(false);
  });
});
