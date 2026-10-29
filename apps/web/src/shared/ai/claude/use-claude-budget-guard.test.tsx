// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lockUserAi, setUserAiConfiguration } from "../user-ai-store";
import { EMPTY_AI_CONNECTION } from "../user-ai-types";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "./claude-budget";
import { beginClaudeRequest, recordClaudeUsage, resetClaudeUsage } from "./claude-usage-meter";
import { useClaudeBudgetGuard } from "./use-claude-budget-guard";

/** 예산은 내 키(사용자 결제) 경로에만 걸리므로, 예산 판정 시험은 Claude 키를 등록한 상태에서 한다. */
function connectClaudeKey() {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      ...structuredClone(EMPTY_AI_CONNECTION),
      id: "claude-byok",
      label: "Claude (Anthropic)",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-test-budget-guard-0000",
      textModel: "claude-opus-5-5",
      imageModel: "",
      costPolicy: "user-funded-byok",
      apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "sk-test-budget-guard-0000", enabled: true, priority: 100 }],
      models: [{ id: "text-1", label: "Claude", model: "claude-opus-5-5", capability: "text", enabled: true, priority: 100 }],
    }],
    assignments: { text: "claude-byok", image: null, inference: null, "three-d": null },
  });
}

beforeEach(() => {
  resetClaudeUsage();
  resetClaudeBudgetForTests();
  connectClaudeKey();
});

afterEach(() => {
  cleanup();
  resetClaudeUsage();
  resetClaudeBudgetForTests();
  lockUserAi(false);
});

describe("useClaudeBudgetGuard", () => {
  it("한도가 없으면 언제나 보낼 수 있다", () => {
    const { result } = renderHook(() => useClaudeBudgetGuard(99));
    expect(result.current.verdict).toEqual({ kind: "no-limit" });
    expect(result.current.allowed).toBe(true);
  });

  it("키가 없어 ToonStudio AI로 보내는 요청은 사용자 비용이 없어 예산 한도를 적용하지 않는다", () => {
    lockUserAi(false);
    setClaudeBudgetLimit(0.1);
    const { result } = renderHook(() => useClaudeBudgetGuard(0.17));
    expect(result.current.limitUsd).toBeNull();
    expect(result.current.verdict).toEqual({ kind: "no-limit" });
    expect(result.current.allowed).toBe(true);
  });

  it("넘을 수 있는 요청은 확인하기 전에는 보내지 않고, 확인하면 보낼 수 있다", () => {
    setClaudeBudgetLimit(0.1);
    const { result } = renderHook(() => useClaudeBudgetGuard(0.17));
    expect(result.current.verdict.kind).toBe("exceeds");
    expect(result.current.allowed).toBe(false);

    act(() => result.current.setOverridden(true));
    expect(result.current.overridden).toBe(true);
    expect(result.current.allowed).toBe(true);

    act(() => result.current.consumeOverride());
    expect(result.current.overridden).toBe(false);
    expect(result.current.allowed).toBe(false);
  });

  it("'이번 한 번만' 동의는 동의한 상한 이하에서만 유효하고, 상한이 커지면 다시 묻는다", () => {
    setClaudeBudgetLimit(0.1);
    const { result, rerender } = renderHook(({ cap }: { cap: number | null }) => useClaudeBudgetGuard(cap), { initialProps: { cap: 0.17 as number | null } });
    act(() => result.current.setOverridden(true));
    expect(result.current.allowed).toBe(true);

    // 더 비싼 모델·옵션으로 바꿔 상한이 0.42가 되면 같은 체크가 남아 있어도 다시 확인해야 한다.
    rerender({ cap: 0.42 });
    expect(result.current.verdict.kind).toBe("exceeds");
    expect(result.current.overridden).toBe(false);
    expect(result.current.allowed).toBe(false);

    // 동의한 상한보다 낮아지면 동의가 그대로 유효하다.
    rerender({ cap: 0.12 });
    expect(result.current.overridden).toBe(true);
    expect(result.current.allowed).toBe(true);
  });

  it("단가를 모르는 요청(null)에 한 동의는 상한이 숫자가 되면 이어지지 않는다", () => {
    setClaudeBudgetLimit(1);
    const { result, rerender } = renderHook(({ cap }: { cap: number | null }) => useClaudeBudgetGuard(cap), { initialProps: { cap: null as number | null } });
    expect(result.current.verdict.kind).toBe("unknown-cost");
    act(() => result.current.setOverridden(true));
    expect(result.current.allowed).toBe(true);

    rerender({ cap: 5 });
    expect(result.current.overridden).toBe(false);
    expect(result.current.allowed).toBe(false);
  });

  it("입력이 아직 없으면(undefined) 단가를 모른다는 경고를 띄우지 않고 동의 칸도 만들지 않는다", () => {
    setClaudeBudgetLimit(1);
    const { result } = renderHook(() => useClaudeBudgetGuard(undefined));
    expect(result.current.pending).toBe(true);
    expect(result.current.verdict).toMatchObject({ kind: "within" });

    act(() => result.current.setOverridden(true));
    expect(result.current.overridden).toBe(false);
  });

  it("받은 사용량·진행 중 예약·응답을 받지 못한 요청을 모두 이미 쓴 것으로 센다", () => {
    setClaudeBudgetLimit(5);
    recordClaudeUsage("claude-opus-5-5", { input_tokens: 500_000, output_tokens: 0 }); // $2
    beginClaudeRequest(1.5).markUnconfirmed();
    beginClaudeRequest(1);

    const { result } = renderHook(() => useClaudeBudgetGuard(1));

    expect(result.current.spentUsd).toBeCloseTo(4.5, 10);
    expect(result.current.unconfirmedRequests).toBe(1);
    expect(result.current.unconfirmedUsd).toBeCloseTo(1.5, 10);
    expect(result.current.verdict.kind).toBe("exceeds");
  });
});
