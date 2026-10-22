import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALIZE_TIMEOUT_MS, localizeMaxOutputTokens, type LocalizeInput } from "./claude-localize";
import { estimateLocalizeCostCapUsd, runLocalize } from "./claude-localize-run";

const claudeParse = vi.hoisted(() => vi.fn());
vi.mock("@/shared/ai/claude/claude-transport", () => ({ claudeParse }));

const ROUTE = { apiKey: "sk-test-localize", revision: 5, model: "claude-opus-5-5" } as const;
const INPUT: LocalizeInput = {
  lines: ["안녕, 지훈아!", "오늘은 비가 오네."],
  sourceLang: "ko",
  targetLang: "en",
  tone: "casual",
  budget: "comfortable",
  glossary: [{ source: "지훈", target: "Jihoon" }],
};

function reply(parsed: unknown, model = "claude-opus-5-5") {
  return {
    message: { model, usage: { input_tokens: 800, output_tokens: 300, cache_read_input_tokens: null } },
    parsed,
  };
}

describe("runLocalize", () => {
  beforeEach(() => {
    claudeParse.mockReset();
  });

  it("줄 번호로 결과를 맞추고 사용량과 추정 비용을 돌려준다", async () => {
    claudeParse.mockResolvedValueOnce(reply({
      items: [
        { index: 1, translation: "Hey, Jihoon!", shorter: null, note: null },
        { index: 2, translation: "It's raining today.", shorter: "Rainy today.", note: null },
      ],
      warnings: [],
    }));

    const result = await runLocalize(ROUTE, INPUT, { depth: "medium" });

    expect(result.view.lines.map((line) => line.translation)).toEqual(["Hey, Jihoon!", "It's raining today."]);
    expect(result.model).toBe("claude-opus-5-5");
    expect(result.usage).toEqual({ inputTokens: 800, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(result.estimatedUsd).toBeCloseTo((800 * 4 + 300 * 20) / 1_000_000, 8);
  });

  it("선택한 모델·깊이·중단 신호를 넘기고, 줄이 많을 수 있어 제한 시간을 늘린다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ items: [], warnings: [] }, "claude-haiku-5-5-20261001"));
    const controller = new AbortController();

    const result = await runLocalize(ROUTE, INPUT, { model: "claude-haiku-5-5", depth: "low", signal: controller.signal });

    const [route, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(route).toBe(ROUTE);
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.max_tokens).toBe(localizeMaxOutputTokens(2));
    expect(options).toEqual({ signal: controller.signal, timeoutMs: LOCALIZE_TIMEOUT_MS });
    expect(result.model).toBe("claude-haiku-5-5");
  });

  it("모델이 줄을 빠뜨려도 빠졌다고 표시한 채 돌려준다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ items: [{ index: 1, translation: "Hi", shorter: null, note: null }], warnings: ["문맥이 짧아요."] }));

    const result = await runLocalize(ROUTE, INPUT, { depth: "medium" });

    expect(result.view.lines.map((line) => line.missing)).toEqual([false, true]);
    expect(result.view.warnings).toEqual(["문맥이 짧아요."]);
  });

  it("모델 ID 형식이 아니면 요청을 보내지 않는다", async () => {
    await expect(runLocalize(ROUTE, INPUT, { model: "gpt-4o", depth: "medium" })).rejects.toThrow("모델을 다시 선택해 주세요");
    expect(claudeParse).not.toHaveBeenCalled();
  });
});

describe("estimateLocalizeCostCapUsd", () => {
  it("줄이 많을수록 상한이 커지고 비싼 모델일수록 커진다", () => {
    const few = estimateLocalizeCostCapUsd("claude-opus-5-5", INPUT, "medium");
    const many = estimateLocalizeCostCapUsd("claude-opus-5-5", { ...INPUT, lines: Array.from({ length: 40 }, (_, index) => `대사 ${index}`) }, "medium");
    const haiku = estimateLocalizeCostCapUsd("claude-haiku-5-5", INPUT, "medium");
    expect(few).not.toBeNull();
    expect(many ?? 0).toBeGreaterThan(few ?? 0);
    expect(haiku ?? 0).toBeLessThan(few ?? 0);
    expect(few ?? 0).toBeGreaterThan((localizeMaxOutputTokens(2) * 20) / 1_000_000);
  });

  it("단가를 모르는 모델이면 null", () => {
    expect(estimateLocalizeCostCapUsd("claude-future-9", INPUT, "medium")).toBeNull();
  });
});
