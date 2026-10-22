/**
 * AI 명령 도우미 실행 — 요청 생성 → Claude 구조화 출력 호출 → 허용목록 검증을 한 번에 묶는다.
 *
 * 여기서는 **아무 명령도 실행하지 않는다**. 계획만 만들고, 실행은 사용자가 단계를 확인한 뒤
 * `executeCommandPlanSteps`로 따로 한다. 자동 재시도·모델 대체는 없다.
 */
import { claudeModelInfo, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import {
  buildCommandAnswerRequest,
  COMMAND_ANSWER_MAX_OUTPUT_TOKENS,
  CommandAnswerSchema,
  validateCommandAnswer,
  type CommandAnswer,
} from "./claude-command-explain";
import {
  buildCommandPlanRequest,
  COMMAND_PLAN_MAX_OUTPUT_TOKENS,
  CommandPlanSchema,
  validateCommandPlan,
  type AiCommandCandidate,
  type CommandPlan,
} from "./claude-command-plan";

import type Anthropic from "@anthropic-ai/sdk";

import type { ClaudeRoute } from "@/shared/ai/claude/claude-route";

export interface CommandPlanRunResult {
  readonly plan: CommandPlan;
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
}

export interface CommandPlanRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly signal?: AbortSignal;
}

export async function runCommandPlan(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  request: string,
  candidates: readonly AiCommandCandidate[],
  options: CommandPlanRunOptions = {},
): Promise<CommandPlanRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildCommandPlanRequest(requested, request, candidates),
    CommandPlanSchema,
    { signal: options.signal },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    plan: validateCommandPlan(parsed, candidates),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}

/** 요청이 보내는 글자 수만큼의 입력 토큰과 출력 상한으로 계산한 비용 상한. 단가를 모르는 모델은 null. */
function requestCostCapUsd(model: string, params: Anthropic.MessageCreateParamsNonStreaming, maxOutputTokens: number): number | null {
  const system = Array.isArray(params.system) ? params.system.reduce((sum, block) => sum + block.text.length, 0) : 0;
  const user = typeof params.messages[0]?.content === "string" ? params.messages[0].content.length : 0;
  const estimate = estimateClaudeCostUsd(model, {
    inputTokens: system + user,
    outputTokens: maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  return estimate ? estimate.usd : null;
}

/**
 * 계획 요청 한 번이 낼 수 있는 비용의 상한(USD). 출력은 `max_tokens`가 하드 상한이고, 입력은 보내는 글자 수만큼의
 * 토큰이라고 가정한다(한글·영문 모두 보통 글자당 1토큰 이하라 상한으로 쓴다). 단가를 모르는 모델은 null.
 * 프롬프트 캐시가 적용되면 입력 단가가 내려가므로 실제 비용은 이보다 작을 수 있다.
 */
export function estimateCommandPlanCostCapUsd(
  model: string,
  request: string,
  candidates: readonly AiCommandCandidate[],
): number | null {
  return requestCostCapUsd(model, buildCommandPlanRequest(model, request, candidates), COMMAND_PLAN_MAX_OUTPUT_TOKENS);
}

export interface CommandAnswerRunResult {
  readonly answer: CommandAnswer;
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
}

/** "방법 알려 줘" 질문 한 번. 아무것도 실행하지 않고 설명과 관련 명령만 돌려준다. */
export async function runCommandAnswer(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  question: string,
  knowledge: readonly AiCommandCandidate[],
  options: CommandPlanRunOptions = {},
): Promise<CommandAnswerRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildCommandAnswerRequest(requested, question, knowledge),
    CommandAnswerSchema,
    { signal: options.signal },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    answer: validateCommandAnswer(parsed, knowledge),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}

export function estimateCommandAnswerCostCapUsd(
  model: string,
  question: string,
  knowledge: readonly AiCommandCandidate[],
): number | null {
  return requestCostCapUsd(model, buildCommandAnswerRequest(model, question, knowledge), COMMAND_ANSWER_MAX_OUTPUT_TOKENS);
}
