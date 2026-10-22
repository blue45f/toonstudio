import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALT_TEXT_MAX_OUTPUT_TOKENS, type AltTextRaw } from "./claude-alt-text";
import { runAltText } from "./claude-alt-text-run";

const claudeParse = vi.hoisted(() => vi.fn());
vi.mock("@/shared/ai/claude/claude-transport", () => ({ claudeParse }));

const ROUTE = { apiKey: "sk-test-alt-text", revision: 7, model: "claude-opus-5-5" } as const;
const IMAGE = { mediaType: "image/png", data: "QUJD", width: 800, height: 1_000 } as const;

const RAW: AltTextRaw = {
  short: "비 오는 골목에서 우산을 나눠 쓴다.",
  long: "어두운 골목에 비가 내리고 두 사람이 우산 하나를 함께 쓴다.",
  panels: [{ step: 1, description: "골목 전경", text: ["같이 쓸래?"] }],
  warnings: [],
};

function reply(parsed: unknown, model = "claude-opus-5-5") {
  return {
    message: { model, usage: { input_tokens: 1_500, output_tokens: 600, cache_read_input_tokens: null } },
    parsed,
  };
}

describe("runAltText", () => {
  beforeEach(() => {
    claudeParse.mockReset();
  });

  it("범위에 맞춰 결과를 정리하고 사용량과 추정 비용을 돌려준다", async () => {
    claudeParse.mockResolvedValueOnce(reply(RAW));

    const result = await runAltText(ROUTE, IMAGE, { scope: "standard", language: "ko" });

    expect(result.scope).toBe("standard");
    expect(result.view.short).toBe("비 오는 골목에서 우산을 나눠 쓴다.");
    expect(result.view.panels).toEqual([]);
    expect(result.model).toBe("claude-opus-5-5");
    expect(result.usage).toEqual({ inputTokens: 1_500, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(result.estimatedUsd).toBeCloseTo((1_500 * 4 + 600 * 20) / 1_000_000, 8);
  });

  it("선택한 모델·깊이·중단 신호를 넘기고 범위별 출력 상한을 쓴다", async () => {
    claudeParse.mockResolvedValueOnce(reply(RAW, "claude-haiku-5-5-20261001"));
    const controller = new AbortController();

    const result = await runAltText(ROUTE, IMAGE, { scope: "detailed", language: "en", depth: "low" }, { model: "claude-haiku-5-5", signal: controller.signal });

    const [route, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(route).toBe(ROUTE);
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.max_tokens).toBe(ALT_TEXT_MAX_OUTPUT_TOKENS.detailed);
    expect(options).toEqual({ signal: controller.signal });
    expect(result.model).toBe("claude-haiku-5-5");
    expect(result.view.panels).toHaveLength(1);
  });

  it("모델 ID 형식이 아니면 요청을 보내지 않는다", async () => {
    await expect(runAltText(ROUTE, IMAGE, { scope: "brief", language: "ko" }, { model: "gpt-4o" })).rejects.toThrow("모델을 다시 선택해 주세요");
    expect(claudeParse).not.toHaveBeenCalled();
  });

  it("전송 오류는 그대로 올리고 다시 보내지 않는다", async () => {
    claudeParse.mockRejectedValueOnce(new Error("요청이 너무 많아요."));

    await expect(runAltText(ROUTE, IMAGE, { scope: "brief", language: "ko" })).rejects.toThrow("요청이 너무 많아요.");
    expect(claudeParse).toHaveBeenCalledTimes(1);
  });
});
