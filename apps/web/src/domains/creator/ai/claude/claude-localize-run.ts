/**
 * AI 번역·현지화 실행 — 요청 생성 → Claude 구조화 출력 호출 → 번호 검증을 한 번에 묶는다.
 *
 * 자동 재시도·모델 대체는 없다. 줄이 많으면 시간이 길어질 수 있어 이 호출만 제한 시간을 5분으로 늘린다(`LOCALIZE_TIMEOUT_MS`).
 */
import { claudeModelInfo, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  buildLocalizeRequest,
  LOCALIZE_TIMEOUT_MS,
  LocalizeSchema,
  normalizeLocalizeResult,
  type LocalizeInput,
  type LocalizeResultView,
} from "./claude-localize";

import type { ClaudeEffortDepth } from "@/shared/ai/claude/claude-effort-presets";
import type { ClaudeRoute } from "@/shared/ai/claude/claude-route";

export interface LocalizeRunResult {
  readonly view: LocalizeResultView;
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
}

export interface LocalizeRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly depth: ClaudeEffortDepth;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 전송 계층의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
}

export async function runLocalize(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  input: LocalizeInput,
  options: LocalizeRunOptions,
): Promise<LocalizeRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildLocalizeRequest(requested, input, options.depth),
    LocalizeSchema,
    {
      signal: options.signal,
      timeoutMs: LOCALIZE_TIMEOUT_MS,
      // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 예산 판정과 진행 중 예약에 쓴다.
      capUsd: estimateLocalizeCostCapUsd(requested, input, options.depth),
      budgetOverride: options.budgetOverride,
    },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    view: normalizeLocalizeResult(parsed, input),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}

/**
 * 이번 번역이 낼 수 있는 비용의 상한(USD). 출력은 줄 수에 맞춘 `max_tokens`가 하드 상한이고, 입력은 보내는 글의 UTF-8 바이트 수(토큰은
 * 바이트보다 많을 수 없다)에 스키마·틀을 더해 센다. 한글은 글자당 약 1.4~1.6토큰이라 "글자당 1토큰"은 상한이 못 된다(2026-10-22 실측).
 * 실행 전 확인과 실제 실행이 같은 함수를 쓴다. 단가를 모르는 모델은 null.
 */
export function estimateLocalizeCostCapUsd(model: string, input: LocalizeInput, depth: ClaudeEffortDepth): number | null {
  return estimateStructuredCostCapUsd({ model, request: buildLocalizeRequest(model, input, depth), schema: LocalizeSchema });
}
