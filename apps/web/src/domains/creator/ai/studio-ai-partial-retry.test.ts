import { describe, expect, it } from "vitest";

import { createPartialRetryRequest } from "./studio-ai-partial-retry";

describe("studio-ai-partial-retry", () => {
  it("유효한 영역·프롬프트·원본으로 요청을 만든다", () => {
    const result = createPartialRetryRequest({
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      prompt: "이 부분만 파랗게",
      sourceImageId: "el-1",
    });
    expect(result).toEqual({
      ok: true,
      request: {
        region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        prompt: "이 부분만 파랗게",
        sourceImageId: "el-1",
        fallback: "full-regen-mask-composite",
      },
    });
  });

  it("범위를 벗어난 영역과 빈 프롬프트·원본을 거부한다", () => {
    expect(
      createPartialRetryRequest({
        region: { x: 0.9, y: 0, width: 0.2, height: 0.1 },
        prompt: "고쳐줘",
        sourceImageId: "el-1",
      }),
    ).toEqual({ ok: false, reason: "invalid_region" });
    expect(
      createPartialRetryRequest({
        region: { x: 0, y: 0, width: 0.5, height: 0.5 },
        prompt: "   ",
        sourceImageId: "el-1",
      }),
    ).toEqual({ ok: false, reason: "empty_prompt" });
    expect(
      createPartialRetryRequest({
        region: { x: 0, y: 0, width: 0.5, height: 0.5 },
        prompt: "고쳐줘",
        sourceImageId: "  ",
      }),
    ).toEqual({ ok: false, reason: "empty_source" });
  });
});
