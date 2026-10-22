/**
 * AI 번역·현지화 실행 — 요청 생성 → Claude 구조화 출력 호출 → 번호 검증을 한 번에 묶는다.
 *
 * 자동 재시도·모델 대체는 없다. 줄이 많으면 시간이 길어질 수 있어 이 호출만 제한 시간을 5분으로 늘린다(`LOCALIZE_TIMEOUT_MS`).
 */
import { estimateClaudeCostUsd, claudeModelInfo, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import {
  buildLocalizeRequest,
  LOCALIZE_TIMEOUT_MS,
  LocalizeSchema,
  localizeMaxOutputTokens,
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
    { signal: options.signal, timeoutMs: LOCALIZE_TIMEOUT_MS },
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
 * 이번 번역이 낼 수 있는 비용의 상한(USD). 출력은 줄 수에 맞춘 `max_tokens`가 하드 상한이고, 입력은 보내는 글자 수만큼의 토큰으로
 * 가정한다(글자당 1토큰 이하라 상한으로 쓴다). 단가를 모르는 모델은 null.
 */
export function estimateLocalizeCostCapUsd(model: string, input: LocalizeInput, depth: ClaudeEffortDepth): number | null {
  const params = buildLocalizeRequest(model, input, depth);
  const system = Array.isArray(params.system) ? params.system.reduce((sum, block) => sum + block.text.length, 0) : 0;
  const user = typeof params.messages[0]?.content === "string" ? params.messages[0].content.length : 0;
  const estimate = estimateClaudeCostUsd(model, {
    inputTokens: system + user,
    outputTokens: localizeMaxOutputTokens(input.lines.length),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  return estimate ? estimate.usd : null;
}
