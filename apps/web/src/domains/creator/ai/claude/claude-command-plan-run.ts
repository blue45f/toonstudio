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

import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  buildCommandAnswerRequest,
  CommandAnswerSchema,
  validateCommandAnswer,
  type CommandAnswer,
} from "./claude-command-explain";
import {
  buildCommandPlanRequest,
  CommandPlanSchema,
  validateCommandPlan,
  type AiCommandCandidate,
  type CommandPlan,
} from "./claude-command-plan";

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
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 전송 계층의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
}

export async function runCommandPlan(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  request: string,
  candidates: readonly AiCommandCandidate[],
  options: CommandPlanRunOptions = {},
): Promise<CommandPlanRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const params = buildCommandPlanRequest(requested, request, candidates);
  const { message, parsed } = await claudeParse(
    route,
    params,
    CommandPlanSchema,
    {
      signal: options.signal,
      // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 예산 판정과 진행 중 예약에 쓴다.
      capUsd: estimateStructuredCostCapUsd({ model: requested, request: params, schema: CommandPlanSchema }),
      budgetOverride: options.budgetOverride,
    },
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

/**
 * 계획 요청 한 번이 낼 수 있는 비용의 상한(USD). 출력은 `max_tokens`가 하드 상한이고, 입력은 보내는 글의 UTF-8 바이트 수
 * (토큰은 바이트보다 많을 수 없다)와 구조화 출력 스키마로 잰다. 단가를 모르는 모델은 null.
 * 프롬프트 캐시가 적용되면 입력 단가가 내려가므로 실제 비용은 이보다 작을 수 있다.
 */
export function estimateCommandPlanCostCapUsd(
  model: string,
  request: string,
  candidates: readonly AiCommandCandidate[],
): number | null {
  return estimateStructuredCostCapUsd({ model, request: buildCommandPlanRequest(model, request, candidates), schema: CommandPlanSchema });
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
  const params = buildCommandAnswerRequest(requested, question, knowledge);
  const { message, parsed } = await claudeParse(
    route,
    params,
    CommandAnswerSchema,
    {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requested, request: params, schema: CommandAnswerSchema }),
      budgetOverride: options.budgetOverride,
    },
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
  return estimateStructuredCostCapUsd({ model, request: buildCommandAnswerRequest(model, question, knowledge), schema: CommandAnswerSchema });
}
