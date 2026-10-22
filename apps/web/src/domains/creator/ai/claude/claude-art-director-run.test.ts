import { beforeEach, describe, expect, it, vi } from "vitest";

import { runArtDirectorReview } from "./claude-art-director-run";

import { estimateArtDirectorCostCapUsd, type ArtDirectorRawReview } from "./claude-art-director";

const claudeParse = vi.hoisted(() => vi.fn());
vi.mock("@/shared/ai/claude/claude-transport", () => ({ claudeParse }));

const ROUTE = { apiKey: "sk-test-run", revision: 3, model: "claude-opus-5-5" } as const;
const IMAGE = { mediaType: "image/png", data: "AAAA", width: 1_000, height: 2_000 } as const;

const RAW: ArtDirectorRawReview = {
  summary: "읽는 흐름이 자연스러워요.",
  scores: { composition: 4, readability: 3, mood: 4 },
  strengths: ["색 대비가 좋아요"],
  readingOrder: [{ step: 1, label: "첫 컷", region: { x: 0, y: 0, width: 1_000, height: 800 } }],
  issues: [{
    category: "balloon",
    severity: "high",
    confidence: "high",
    title: "말풍선이 얼굴을 가려요",
    detail: "입 주변이 가려져요.",
    fix: "말풍선을 오른쪽으로 옮겨요.",
    region: { x: 100, y: 200, width: 400, height: 200 },
  }],
  nextActions: ["말풍선 위치부터 고치기"],
};

function reply(model = "claude-opus-5-5") {
  return {
    message: { model, usage: { input_tokens: 2_000, output_tokens: 1_500, cache_read_input_tokens: null } },
    parsed: RAW,
  };
}

describe("runArtDirectorReview", () => {
  it("사용자가 '이번 한 번만'을 고른 요청만 예산 판정을 건너뛰도록 전송 계층에 알린다", async () => {
    await runArtDirectorReview(ROUTE, IMAGE, { medium: "page" }, { budgetOverride: true });
    expect(claudeParse.mock.calls[0]?.[3]).toMatchObject({ budgetOverride: true });
  });

  beforeEach(() => {
    claudeParse.mockReset();
    claudeParse.mockResolvedValue(reply());
  });

  it("연결의 기본 모델로 구조화 출력 요청을 보내고 결과를 정규화한다", async () => {
    const result = await runArtDirectorReview(ROUTE, IMAGE, { medium: "vertical-scroll", depth: "high" });

    expect(claudeParse).toHaveBeenCalledTimes(1);
    const [route, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(route).toBe(ROUTE);
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config).toEqual({ effort: "high" });
    // 전송 계층이 예산 판정·예약에 쓰도록, 실행 전 확인에 보인 값과 같은 함수로 잰 상한을 함께 넘긴다.
    expect(options).toEqual({ signal: undefined, capUsd: estimateArtDirectorCostCapUsd("claude-opus-5-5", IMAGE, { medium: "vertical-scroll", depth: "high" }), budgetOverride: undefined });
    expect(options.capUsd).toBeGreaterThan(0.16);

    expect(result.review.issues[0]?.region).toEqual({ x: 0.1, y: 0.1, width: 0.4, height: 0.1 });
    expect(result.review.issues[0]?.id).toBe("issue-1");
    expect(result.model).toBe("claude-opus-5-5");
    expect(result.usage).toEqual({ inputTokens: 2_000, outputTokens: 1_500, cacheReadTokens: 0, cacheWriteTokens: 0 });
    // Opus 5.5: 입력 $4 / 출력 $20 (100만 토큰당)
    expect(result.estimatedUsd).toBeCloseTo((2_000 * 4 + 1_500 * 20) / 1_000_000, 8);
  });

  it("선택한 모델을 연결 기본 모델보다 우선하고 중단 신호를 그대로 넘긴다", async () => {
    claudeParse.mockResolvedValueOnce(reply("claude-haiku-5-5-20261001"));
    const controller = new AbortController();

    const result = await runArtDirectorReview(ROUTE, IMAGE, { medium: "page" }, {
      model: "claude-haiku-5-5",
      signal: controller.signal,
    });

    const [, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(options.signal).toBe(controller.signal);
    // 날짜 접미사가 붙은 응답 모델도 카탈로그 id로 보여 주고 같은 단가로 추정한다.
    expect(result.model).toBe("claude-haiku-5-5");
    expect(result.estimatedUsd).toBeCloseTo((2_000 * 0.1 + 1_500 * 0.5) / 1_000_000, 8);
  });

  it("단가를 모르는 모델은 비용을 추정하지 않는다", async () => {
    claudeParse.mockResolvedValueOnce(reply("claude-future-9"));

    const result = await runArtDirectorReview(ROUTE, IMAGE, { medium: "page" }, { model: "claude-future-9" });

    expect(result.model).toBe("claude-future-9");
    expect(result.estimatedUsd).toBeNull();
  });

  it("모델 ID 형식이 아니면 요청을 보내지 않는다", async () => {
    await expect(
      runArtDirectorReview(ROUTE, IMAGE, { medium: "page" }, { model: "gpt-4o" }),
    ).rejects.toThrow("모델을 다시 선택해 주세요");
    expect(claudeParse).not.toHaveBeenCalled();
  });

  it("전송 오류는 그대로 올리고 재시도하지 않는다", async () => {
    claudeParse.mockRejectedValueOnce(new Error("키를 확인해 주세요."));

    await expect(runArtDirectorReview(ROUTE, IMAGE, { medium: "page" })).rejects.toThrow("키를 확인해 주세요.");
    expect(claudeParse).toHaveBeenCalledTimes(1);
  });
});
