import { describe, expect, it } from "vitest";

import { applyByokPreset } from "./studio-ai-byok-preset-apply";
import { STUDIO_AI_BYOK_PROVIDER_PRESETS } from "./studio-ai-byok-providers";

describe("studio-ai-byok-preset-apply", () => {
  it("OpenAI 호환 프리셋은 주소만 바꾸고 모델명은 유지한다", () => {
    const preset = STUDIO_AI_BYOK_PROVIDER_PRESETS[0];
    const result = applyByokPreset(preset, {
      baseUrl: "https://예전.example/v1",
      imageModel: "내 모델",
    });
    expect(result).toEqual({
      found: true,
      settings: { baseUrl: "https://api.openai.com/v1", imageModel: "내 모델" },
    });
  });

  it("직접 입력 프리셋은 기존 설정을 유지한다", () => {
    const preset = STUDIO_AI_BYOK_PROVIDER_PRESETS[1];
    const current = { baseUrl: "https://직접.example/v1", imageModel: "m" };
    expect(applyByokPreset(preset, current)).toEqual({
      found: true,
      settings: current,
    });
  });

  it("모르는 프리셋은 설정을 바꾸지 않는다", () => {
    const current = { baseUrl: "https://a.example/v1", imageModel: "m" };
    expect(applyByokPreset(null, current)).toEqual({
      found: false,
      settings: current,
    });
  });
});
