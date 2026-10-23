import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALIZE_TIMEOUT_MS, localizeMaxOutputTokens, planLocalizeChunks, type LocalizeInput } from "./claude-localize";
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
    // 전송 계층이 예산 판정·예약에 쓰도록, 실행 전 확인에 보인 값과 같은 함수로 잰 상한을 함께 넘긴다.
    expect(options).toEqual({
      signal: controller.signal,
      timeoutMs: LOCALIZE_TIMEOUT_MS,
      capUsd: estimateLocalizeCostCapUsd("claude-haiku-5-5", INPUT, "low"),
      budgetOverride: undefined,
    });
    expect(result.model).toBe("claude-haiku-5-5");
    expect(result.chunks).toEqual({ total: 1, done: 1 });
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

  it("한글 위주의 큰 입력(50줄×240자)도 실측 토큰(글자당 약 1.6토큰)보다 작게 가늠하지 않는다", () => {
    const lines = Array.from({ length: 50 }, () => "가나다라 마바사 아자차카 ".repeat(20).slice(0, 240));
    const cap = estimateLocalizeCostCapUsd("claude-opus-5-5", { ...INPUT, lines }, "medium") ?? 0;
    const realisticInputTokens = 50 * 240 * 1.6 + 1_500; // 글 + 고정 지시·스키마
    const realisticUsd = (realisticInputTokens * 4 + localizeMaxOutputTokens(50) * 20) / 1_000_000;
    expect(cap).toBeGreaterThanOrEqual(realisticUsd);
  });
});

describe("runLocalize — 예산", () => {
  it("사용자가 '이번 한 번만'을 고른 요청만 전송 계층에 예산 판정 건너뛰기를 알린다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ items: [], warnings: [] }));
    await runLocalize(ROUTE, INPUT, { depth: "medium", budgetOverride: true });
    expect(claudeParse.mock.calls.at(-1)?.[3]).toMatchObject({ budgetOverride: true });
  });
});

describe("runLocalize — 묶음으로 나눠 보내기", () => {
  const LONG: LocalizeInput = { ...INPUT, lines: Array.from({ length: 50 }, (_, index) => `대사 ${index + 1}`) };

  function chunkReply(count: number, prefix: string) {
    return reply({
      items: Array.from({ length: count }, (_, index) => ({ index: index + 1, translation: `${prefix}${index + 1}`, shorter: null, note: null })),
      warnings: [`${prefix} 경고`],
    });
  }

  beforeEach(() => {
    claudeParse.mockReset();
  });

  it("25줄을 넘으면 같은 크기의 묶음으로 차례로 보내고 전체 줄 번호로 합친다", async () => {
    claudeParse.mockResolvedValueOnce(chunkReply(25, "A")).mockResolvedValueOnce(chunkReply(25, "B"));
    const progress: Array<{ done: number; lines: number }> = [];

    const result = await runLocalize(ROUTE, LONG, { depth: "medium", onProgress: (partial) => progress.push({ done: partial.chunks.done, lines: partial.view.lines.length }) });

    expect(claudeParse).toHaveBeenCalledTimes(2);
    const [firstParams, secondParams] = claudeParse.mock.calls.map((call) => call[1]);
    expect(firstParams.messages[0].content).toContain("전체 50줄 중 1~25번째 줄");
    expect(secondParams.messages[0].content).toContain("전체 50줄 중 26~50번째 줄");
    // 각 묶음의 번호는 1부터 다시 매기고, 둘째 묶음은 앞 줄을 번역하지 않는 문맥으로만 받는다.
    expect(secondParams.messages[0].content).toContain("25. 대사 50");
    expect(secondParams.messages[0].content).toContain("- 대사 25");
    expect(secondParams.messages[0].content).not.toContain("1. 대사 1\n");
    expect(result.view.lines).toHaveLength(50);
    expect(result.view.lines[0]).toMatchObject({ index: 1, source: "대사 1", translation: "A1" });
    expect(result.view.lines[25]).toMatchObject({ index: 26, source: "대사 26", translation: "B1" });
    expect(result.view.lines[49]).toMatchObject({ index: 50, translation: "B25" });
    expect(result.view.warnings).toEqual(["A 경고", "B 경고"]);
    expect(result.chunks).toEqual({ total: 2, done: 2 });
    expect(result.usage.inputTokens).toBe(1_600);
    expect(result.usage.outputTokens).toBe(600);
    expect(result.estimatedUsd).toBeCloseTo(2 * (800 * 4 + 300 * 20) / 1_000_000, 8);
    expect(progress).toEqual([{ done: 1, lines: 25 }, { done: 2, lines: 50 }]);
  });

  it("묶음마다 상한을 전송 계층에 넘기고, 상한의 합이 실행 전 확인의 값이다", async () => {
    claudeParse.mockResolvedValueOnce(chunkReply(25, "A")).mockResolvedValueOnce(chunkReply(25, "B"));

    await runLocalize(ROUTE, LONG, { depth: "high", budgetOverride: true });

    const caps = claudeParse.mock.calls.map((call) => call[3].capUsd as number);
    expect(caps.every((cap) => cap > 0)).toBe(true);
    expect(caps[0] + caps[1]).toBeCloseTo(estimateLocalizeCostCapUsd("claude-opus-5-5", LONG, "high") ?? 0, 10);
    expect(claudeParse.mock.calls.map((call) => call[3].budgetOverride)).toEqual([true, true]);
    // 한 요청의 출력 상한은 25줄 기준이라 한 번에 보내던 때(50줄)보다 작다.
    expect(claudeParse.mock.calls[0]?.[1].max_tokens).toBe(localizeMaxOutputTokens(25));
    expect(planLocalizeChunks(50)).toEqual([{ start: 0, end: 25 }, { start: 25, end: 50 }]);
  });

  it("둘째 묶음에서 실패하면 이미 번역한 줄을 버리지 않고 이유와 함께 돌려준다", async () => {
    claudeParse.mockResolvedValueOnce(chunkReply(25, "A")).mockRejectedValueOnce(new Error("연결이 불안정해요. 잠시 뒤 다시 시도해 주세요."));

    const result = await runLocalize(ROUTE, LONG, { depth: "medium" });

    expect(claudeParse).toHaveBeenCalledTimes(2);
    expect(result.view.lines).toHaveLength(25);
    expect(result.chunks).toEqual({ total: 2, done: 1, error: "연결이 불안정해요. 잠시 뒤 다시 시도해 주세요." });
  });

  it("첫 묶음이 실패하면 결과가 없으니 그대로 던진다", async () => {
    claudeParse.mockRejectedValueOnce(new Error("키를 확인해 주세요."));

    await expect(runLocalize(ROUTE, LONG, { depth: "medium" })).rejects.toThrow("키를 확인해 주세요.");
    expect(claudeParse).toHaveBeenCalledTimes(1);
  });

  it("중단하면 남은 묶음을 보내지 않고 던진다(끝난 묶음은 진행 알림으로 이미 전달됐다)", async () => {
    const controller = new AbortController();
    claudeParse.mockImplementationOnce(async () => {
      const done = chunkReply(25, "A");
      return done;
    }).mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("취소했어요.");
    });
    const seen: number[] = [];

    await expect(runLocalize(ROUTE, LONG, { depth: "medium", signal: controller.signal, onProgress: (partial) => seen.push(partial.chunks.done) })).rejects.toThrow("취소했어요.");

    expect(claudeParse).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([1]);
  });

  it("25줄 이하면 한 번에 보내고 묶음 안내 문구를 넣지 않는다", async () => {
    claudeParse.mockResolvedValueOnce(chunkReply(2, "A"));

    await runLocalize(ROUTE, INPUT, { depth: "medium" });

    expect(claudeParse).toHaveBeenCalledTimes(1);
    expect(claudeParse.mock.calls[0]?.[1].messages[0].content).not.toContain("분량:");
  });
});
