import { beforeEach, describe, expect, it, vi } from "vitest";

import { COMMAND_PLAN_MAX_OUTPUT_TOKENS, type AiCommandCandidate } from "./claude-command-plan";
import { estimateCommandAnswerCostCapUsd, estimateCommandPlanCostCapUsd, runCommandAnswer, runCommandPlan } from "./claude-command-plan-run";

const claudeParse = vi.hoisted(() => vi.fn());
vi.mock("@/shared/ai/claude/claude-transport", () => ({ claudeParse }));

const ROUTE = { apiKey: "sk-test-plan", revision: 2, model: "claude-opus-5-5" } as const;
const CANDIDATES: AiCommandCandidate[] = [
  { commandId: "view.grid", label: "격자 보기", disabled: false },
  { commandId: "view.zoom-fit", label: "화면에 맞추기", disabled: false },
  { commandId: "view.rulers", label: "눈금자", disabled: true, unavailableReason: "페이지 없음" },
];

function reply(parsed: unknown, model = "claude-opus-5-5") {
  return {
    message: { model, usage: { input_tokens: 5_000, output_tokens: 400, cache_read_input_tokens: 4_000, cache_creation_input_tokens: null } },
    parsed,
  };
}

describe("runCommandPlan", () => {
  beforeEach(() => {
    claudeParse.mockReset();
  });

  it("허용목록으로 계획을 검증하고 모르는 명령은 사유와 함께 버린다", async () => {
    claudeParse.mockResolvedValueOnce(reply({
      intent: "화면 정리",
      steps: [
        { commandId: "view.grid", reason: "격자 켜기" },
        { commandId: "file.delete-everything", reason: "만들어낸 명령" },
        { commandId: "view.rulers", reason: "비활성" },
      ],
      questions: [],
    }));

    const result = await runCommandPlan(ROUTE, "격자를 켜 줘", CANDIDATES);

    expect(result.plan.steps.map((step) => step.commandId)).toEqual(["view.grid"]);
    expect(result.plan.rejected).toEqual([
      { commandId: "file.delete-everything", why: "unknown" },
      { commandId: "view.rulers", why: "disabled" },
    ]);
    const [route, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(route).toBe(ROUTE);
    expect(params.model).toBe("claude-opus-5-5");
    // 실행 전 확인에 보인 비용 상한과 같은 값이 전송 계층의 예산 판정으로 넘어간다.
    expect(options).toEqual({
      signal: undefined,
      capUsd: estimateCommandPlanCostCapUsd("claude-opus-5-5", "격자를 켜 줘", CANDIDATES),
      budgetOverride: undefined,
    });
    expect(options.capUsd).toBeGreaterThan(0);
  });

  it("예산을 넘어도 진행하겠다고 고른 요청만 판정 건너뛰기를 알린다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ intent: "", steps: [], questions: [] }));

    await runCommandPlan(ROUTE, "격자", CANDIDATES, { budgetOverride: true });

    const [, , , options] = claudeParse.mock.calls[0] ?? [];
    expect(options.budgetOverride).toBe(true);
  });

  it("같은 질문을 되풀이해도 한 번만 남긴다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ intent: "x", steps: [], questions: ["무엇을 할까요?", "무엇을  할까요?", "어느 페이지인가요?"] }));

    const result = await runCommandPlan(ROUTE, "뭔가", CANDIDATES);

    expect(result.plan.questions).toEqual(["무엇을 할까요?", "어느 페이지인가요?"]);
  });

  it("사용량과 추정 비용을 캐시 읽기까지 합쳐 돌려준다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ intent: "x", steps: [], questions: ["무엇을 할까요?"] }));

    const result = await runCommandPlan(ROUTE, "뭔가 해 줘", CANDIDATES);

    expect(result.usage).toEqual({ inputTokens: 5_000, outputTokens: 400, cacheReadTokens: 4_000, cacheWriteTokens: 0 });
    // Opus 5.5: 입력 $4, 캐시 읽기 $0.2, 출력 $20 (100만 토큰당)
    expect(result.estimatedUsd).toBeCloseTo((5_000 * 4 + 4_000 * 0.2 + 400 * 20) / 1_000_000, 8);
    expect(result.plan.questions).toEqual(["무엇을 할까요?"]);
  });

  it("선택한 모델과 중단 신호를 그대로 넘긴다", async () => {
    claudeParse.mockResolvedValueOnce(reply({ intent: "", steps: [], questions: [] }, "claude-haiku-5-5-20261001"));
    const controller = new AbortController();

    const result = await runCommandPlan(ROUTE, "격자", CANDIDATES, { model: "claude-haiku-5-5", signal: controller.signal });

    const [, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(options.signal).toBe(controller.signal);
    expect(result.model).toBe("claude-haiku-5-5");
  });

  it("모델 ID 형식이 아니면 요청을 보내지 않는다", async () => {
    await expect(runCommandPlan(ROUTE, "격자", CANDIDATES, { model: "gpt-4o" })).rejects.toThrow("모델을 다시 선택해 주세요");
    expect(claudeParse).not.toHaveBeenCalled();
  });
});

describe("estimateCommandPlanCostCapUsd", () => {
  it("보내는 글자 수와 출력 상한으로 계산하고 후보가 많을수록 커진다", () => {
    const few = estimateCommandPlanCostCapUsd("claude-opus-5-5", "격자", CANDIDATES);
    const many = estimateCommandPlanCostCapUsd(
      "claude-opus-5-5",
      "격자",
      Array.from({ length: 200 }, (_, index): AiCommandCandidate => ({ commandId: `view.cmd-${index}`, label: `명령 ${index}`, disabled: false })),
    );
    expect(few).not.toBeNull();
    expect(few ?? 0).toBeGreaterThan((COMMAND_PLAN_MAX_OUTPUT_TOKENS * 20) / 1_000_000);
    expect(many ?? 0).toBeGreaterThan(few ?? 0);
  });

  it("비활성 후보는 보내지 않으므로 비용에 넣지 않는다", () => {
    const base = estimateCommandPlanCostCapUsd("claude-opus-5-5", "격자", [CANDIDATES[0] as AiCommandCandidate]);
    const withDisabled = estimateCommandPlanCostCapUsd("claude-opus-5-5", "격자", [
      CANDIDATES[0] as AiCommandCandidate,
      { commandId: "view.rulers", label: "눈금자", disabled: true },
    ]);
    expect(withDisabled).toBe(base);
  });

  it("단가를 모르는 모델이면 null", () => {
    expect(estimateCommandPlanCostCapUsd("claude-future-9", "격자", CANDIDATES)).toBeNull();
  });
});

describe("runCommandAnswer", () => {
  const KNOWLEDGE: AiCommandCandidate[] = [
    { commandId: "file.save", label: "저장", shortcut: "⌘S", executable: false, disabled: false },
    { commandId: "view.grid", label: "격자 보기", shortcut: "G", executable: true, disabled: false },
  ];

  beforeEach(() => {
    claudeParse.mockReset();
  });

  it("카탈로그로 답을 검증하고 단축키는 카탈로그 값으로 채운다", async () => {
    claudeParse.mockResolvedValueOnce(reply({
      answer: "저장은 ⌘S예요.",
      commands: [{ commandId: "file.save", why: "저장해요" }, { commandId: "file.nuke", why: "지어낸 명령" }],
      followUps: ["내보내기는요?"],
    }));

    const result = await runCommandAnswer(ROUTE, "저장 단축키가 뭐야?", KNOWLEDGE, { budgetOverride: true });

    expect(result.answer.commands).toEqual([{ commandId: "file.save", label: "저장", shortcut: "⌘S", why: "저장해요", executable: false }]);
    expect(result.answer.rejected).toBe(1);
    expect(result.answer.followUps).toEqual(["내보내기는요?"]);
    const [route, params, , options] = claudeParse.mock.calls[0] ?? [];
    expect(route).toBe(ROUTE);
    expect(params.output_config).toEqual({ effort: "low" });
    expect(options).toEqual({
      signal: undefined,
      capUsd: estimateCommandAnswerCostCapUsd("claude-opus-5-5", "저장 단축키가 뭐야?", KNOWLEDGE),
      budgetOverride: true,
    });
    expect(result.usage.cacheReadTokens).toBe(4_000);
  });

  it("모델 ID 형식이 아니면 요청을 보내지 않는다", async () => {
    await expect(runCommandAnswer(ROUTE, "질문", KNOWLEDGE, { model: "gpt-4o" })).rejects.toThrow("모델을 다시 선택해 주세요");
    expect(claudeParse).not.toHaveBeenCalled();
  });

  it("비용 상한은 출력 상한(2,000토큰)과 지식 글자 수로 계산한다", () => {
    const cap = estimateCommandAnswerCostCapUsd("claude-opus-5-5", "저장?", KNOWLEDGE);
    expect(cap).not.toBeNull();
    expect(cap ?? 0).toBeGreaterThan((2_000 * 20) / 1_000_000);
    expect(estimateCommandAnswerCostCapUsd("claude-future-9", "저장?", KNOWLEDGE)).toBeNull();
  });
});
