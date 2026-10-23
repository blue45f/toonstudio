/**
 * AI 번역·현지화 실행 — 요청 생성 → Claude 구조화 출력 호출 → 번호 검증을 한 번에 묶는다.
 *
 * - 줄이 `LOCALIZE_CHUNK_LINES`(25)를 넘으면 같은 크기의 묶음으로 나눠 **차례로** 보낸다. 한 요청이 길어져 잘리는 일을 구조적으로 막고,
 *   묶음마다 전송 계층의 예산 판정을 받으며, 끝난 묶음은 곧바로 `onProgress`로 알린다.
 * - 첫 묶음이 아닌 곳에서 실패하면 이미 번역된 줄을 버리지 않고 돌려준다(`chunks.error`). 첫 묶음 실패·중단은 던진다.
 * - 자동 재시도·모델 대체는 없다. 묶음으로 나눈 것은 재시도가 아니라 서로 다른 줄을 보내는 별개 요청이다.
 * - 묶음마다 제한 시간은 5분이다(`LOCALIZE_TIMEOUT_MS`).
 */
import { claudeModelInfo, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  buildLocalizeChunkRequest,
  LOCALIZE_TIMEOUT_MS,
  LocalizeSchema,
  mergeLocalizeViews,
  normalizeLocalizeResult,
  planLocalizeChunks,
  type LocalizeChunk,
  type LocalizeInput,
  type LocalizeResultView,
} from "./claude-localize";

import type { ClaudeEffortDepth } from "@/shared/ai/claude/claude-effort-presets";
import type { ClaudeRoute } from "@/shared/ai/claude/claude-route";

export interface LocalizeChunkStatus {
  /** 보낸 묶음 수(전체). 한 번에 보낸 경우 1. */
  readonly total: number;
  /** 끝난 묶음 수. `total`보다 작으면 번역하지 못한 줄이 남아 있다. */
  readonly done: number;
  /** 묶음 중간에 멈춘 이유(사용자에게 보여도 안전한 문장). 없으면 오류 없이 끝났거나 사용자가 멈췄다. */
  readonly error?: string;
}

export interface LocalizeRunResult {
  /** 끝난 묶음의 줄만 담는다. 남은 줄은 화면이 `withMissingLocalizeLines`로 채운다. */
  readonly view: LocalizeResultView;
  readonly model: string;
  /** 모든 묶음의 합계. */
  readonly usage: ClaudeTokenUsage;
  /** 모든 묶음의 추정 비용 합계. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
  readonly chunks: LocalizeChunkStatus;
}

export interface LocalizeRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly depth: ClaudeEffortDepth;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 모든 묶음의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
  /** 묶음 하나가 끝날 때마다 그때까지의 결과로 불린다(줄이 많을 때 먼저 끝난 줄을 바로 보여 주려고). */
  readonly onProgress?: (result: LocalizeRunResult) => void;
}

const ZERO_USAGE: ClaudeTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function addUsage(left: ClaudeTokenUsage, right: ClaudeTokenUsage): ClaudeTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

export async function runLocalize(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  input: LocalizeInput,
  options: LocalizeRunOptions,
): Promise<LocalizeRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const plan = planLocalizeChunks(input.lines.length);
  const parts: Array<{ chunk: LocalizeChunk; view: LocalizeResultView }> = [];
  let usage = ZERO_USAGE;
  let estimatedUsd: number | null = 0;
  let model = requested;

  const snapshot = (error?: string): LocalizeRunResult => ({
    view: mergeLocalizeViews(parts),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd,
    chunks: { total: plan.length, done: parts.length, ...(error ? { error } : {}) },
  });

  for (const chunk of plan) {
    try {
      const params = buildLocalizeChunkRequest(requested, input, options.depth, chunk);
      const { message, parsed } = await claudeParse(route, params, LocalizeSchema, {
        signal: options.signal,
        timeoutMs: LOCALIZE_TIMEOUT_MS,
        // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 묶음마다 예산 판정과 진행 중 예약에 쓴다.
        capUsd: estimateStructuredCostCapUsd({ model: requested, request: params, schema: LocalizeSchema }),
        budgetOverride: options.budgetOverride,
      });
      model = message.model || requested;
      const chunkUsage = toClaudeTokenUsage(message.usage);
      usage = addUsage(usage, chunkUsage);
      const chunkUsd = estimateClaudeCostUsd(model, chunkUsage)?.usd ?? null;
      estimatedUsd = estimatedUsd === null || chunkUsd === null ? null : estimatedUsd + chunkUsd;
      parts.push({ chunk, view: normalizeLocalizeResult(parsed, { lines: input.lines.slice(chunk.start, chunk.end) }) });
    } catch (error) {
      // 첫 묶음 실패나 사용자의 중단은 결과가 없거나 사용자가 정한 것이라 그대로 올린다.
      if (parts.length === 0 || options.signal?.aborted) throw error;
      return snapshot(error instanceof Error ? error.message : String(error));
    }
    options.onProgress?.(snapshot());
  }
  return snapshot();
}

/**
 * 이번 번역이 낼 수 있는 비용의 상한(USD) — 묶음마다 잰 상한의 합. 출력은 줄 수에 맞춘 `max_tokens`가 하드 상한이고, 입력은 보내는 글의 UTF-8 바이트 수(토큰은
 * 바이트보다 많을 수 없다)에 스키마·틀을 더해 센다. 한글은 글자당 약 1.4~1.6토큰이라 "글자당 1토큰"은 상한이 못 된다(2026-10-22 실측).
 * 실행 전 확인과 실제 실행이 같은 함수를 쓴다. 단가를 모르는 모델은 null.
 */
export function estimateLocalizeCostCapUsd(model: string, input: LocalizeInput, depth: ClaudeEffortDepth): number | null {
  let total = 0;
  for (const chunk of planLocalizeChunks(input.lines.length)) {
    const cap = estimateStructuredCostCapUsd({ model, request: buildLocalizeChunkRequest(model, input, depth, chunk), schema: LocalizeSchema });
    if (cap === null) return null;
    total += cap;
  }
  return total;
}
