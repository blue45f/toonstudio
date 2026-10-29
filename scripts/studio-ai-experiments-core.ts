import { performance } from "node:perf_hooks";

import {
  ASSIST_PRICE_AS_OF,
  assistModelInfo,
  estimateAssistCostUsd,
  type AssistTokenUsage,
} from "../apps/web/src/shared/ai/assist/assist-models";

import {
  buildExperimentPlan,
  evaluateExperimentOutput,
  EXPERIMENT_FIXTURE_VERSION,
  type ExperimentCheck,
  type ExperimentPlanEntry,
} from "./studio-ai-experiments-fixtures";

import type Anthropic from "@anthropic-ai/sdk";

export interface ExperimentResponse {
  readonly model: string;
  readonly messageId: string;
  readonly requestId: string | null;
  readonly text: string;
  readonly stopReason: string | null;
  readonly usage: unknown;
}

export interface ExperimentUsage extends AssistTokenUsage {
  readonly cacheWriteOneHourTokens: number;
}

export type ExperimentOutcome = "dry-run" | "passed" | "quality-failed" | "incomplete" | "invalid-usage" | "unknown-cost" | "provider-failed" | "cancelled" | "budget-stopped" | "cost-cap-exceeded" | "model-mismatch";

export interface ExperimentResult {
  readonly fixtureId: string;
  readonly requestHash: string;
  readonly provider: "anthropic-direct";
  readonly requestedModel: string;
  readonly actualModel: string | null;
  readonly requestId: string | null;
  readonly messageId: string | null;
  readonly durationMs: number;
  readonly stopReason: string | null;
  readonly outcome: ExperimentOutcome;
  readonly usage: ExperimentUsage | null;
  readonly estimatedUsd: number | null;
  readonly reservedUsd: number;
  readonly unconfirmedReservedUsd: number;
  readonly checks: readonly ExperimentCheck[];
  readonly errorCode: string | null;
}

export interface ExperimentReport {
  readonly schemaVersion: 1;
  readonly fixtureVersion: string;
  readonly runLabel: string;
  readonly mode: "dry-run" | "live";
  readonly requestedModel: string;
  readonly priceAsOf: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly budgetUsd: number;
  readonly estimatedUsd: number;
  readonly unconfirmedReservedUsd: number;
  readonly accountingNote: string;
  readonly qualityScope: string;
  readonly creditBalanceVerified: false;
  readonly completedAll: boolean;
  readonly passed: boolean;
  readonly results: readonly ExperimentResult[];
}

export interface ExperimentOptions {
  readonly model: string;
  readonly execute: boolean;
  readonly budgetUsd: number;
  readonly runLabel: string;
  readonly signal?: AbortSignal;
}

export type ExperimentExecutor = (
  request: Anthropic.MessageCreateParamsNonStreaming,
  signal?: AbortSignal,
) => Promise<ExperimentResponse>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown, optional = false): number | null {
  if (optional && (value === undefined || value === null)) return 0;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function readExperimentUsage(raw: unknown): ExperimentUsage | null {
  if (!record(raw)) return null;
  const inputTokens = count(raw.input_tokens);
  const outputTokens = count(raw.output_tokens);
  const cacheReadTokens = count(raw.cache_read_input_tokens, true);
  const cacheWriteTokens = count(raw.cache_creation_input_tokens, true);
  const cache = record(raw.cache_creation) ? raw.cache_creation : undefined;
  const cacheWriteOneHourTokens = count(cache?.ephemeral_1h_input_tokens, true);
  const fiveMinuteTokens = count(cache?.ephemeral_5m_input_tokens, true);
  if (inputTokens === null || outputTokens === null || cacheReadTokens === null || cacheWriteTokens === null || cacheWriteOneHourTokens === null || fiveMinuteTokens === null) return null;
  if (cacheWriteOneHourTokens > cacheWriteTokens || (cache && fiveMinuteTokens + cacheWriteOneHourTokens !== cacheWriteTokens)) return null;
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheWriteOneHourTokens };
}

export function estimateExperimentUsd(modelId: string, usage: ExperimentUsage): number | null {
  const model = assistModelInfo(modelId);
  const estimate = estimateAssistCostUsd(modelId, usage);
  if (!model || !estimate || estimate.approximate || !Number.isFinite(estimate.usd)) return null;
  const totalInput = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const inputRate = model.longPrompt && totalInput > model.longPrompt.thresholdTokens
    ? model.longPrompt.inputUsdPerMTok : model.inputUsdPerMTok;
  // 공통 계산기의 5분 쓰기 1.25배에 1시간 쓰기의 차이(2배)를 더한다.
  return estimate.usd + usage.cacheWriteOneHourTokens * inputRate * 0.75 / 1_000_000;
}

/** 제공자 오류 원문에는 요청/키가 섞일 수 있으므로 고정 코드만 보고서에 남긴다. */
export function experimentErrorCode(error: unknown): string {
  if (!record(error)) return "provider-error";
  const name = typeof error.name === "string" ? error.name : "";
  if (/abort/iu.test(name)) return "aborted";
  if (/timeout/iu.test(name)) return "timeout";
  const status = typeof error.status === "number" ? error.status : null;
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate-or-spend-limit";
  if (status === 400 || status === 402) return "request-or-billing";
  if (status !== null && status >= 500) return "provider-unavailable";
  return "provider-error";
}

function initialResult(plan: ExperimentPlanEntry, model: string): ExperimentResult {
  return {
    fixtureId: plan.fixture.id, requestHash: plan.requestHash, provider: "anthropic-direct",
    requestedModel: model, actualModel: null, requestId: null, messageId: null,
    durationMs: 0, stopReason: null, outcome: "dry-run", usage: null,
    estimatedUsd: null, reservedUsd: plan.reservedUsd, unconfirmedReservedUsd: 0,
    checks: [], errorCode: null,
  };
}

export async function runExperiments(options: ExperimentOptions, executeRequest?: ExperimentExecutor): Promise<ExperimentReport> {
  if (!Number.isFinite(options.budgetUsd) || options.budgetUsd <= 0 || options.budgetUsd > 100) {
    throw new Error("--budget-usd는 0보다 크고 100 이하인 금액이어야 합니다.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(options.runLabel)) {
    throw new Error("--label에는 64자 이내 영문·숫자·점·밑줄·하이픈만 사용할 수 있습니다.");
  }
  if (!assistModelInfo(options.model)) throw new Error("단가를 아는 Claude 모델 ID를 지정하세요.");
  const startedAt = new Date().toISOString();
  const plan = buildExperimentPlan(options.model);
  const results: ExperimentResult[] = [];
  let estimatedUsd = 0;
  let unconfirmedReservedUsd = 0;

  for (const item of plan) {
    const base = initialResult(item, options.model);
    if (!options.execute) { results.push(base); continue; }
    if (!executeRequest) throw new Error("실행 모드에는 API 실행기가 필요합니다.");
    if (options.signal?.aborted) {
      results.push({ ...base, outcome: "cancelled", errorCode: "aborted-before-request" });
      break;
    }
    if (estimatedUsd + unconfirmedReservedUsd + item.reservedUsd > options.budgetUsd) {
      results.push({ ...base, outcome: "budget-stopped", errorCode: "budget-cap" });
      break;
    }
    const start = performance.now();
    let response: ExperimentResponse;
    try {
      response = await executeRequest(item.request, options.signal);
    } catch (error) {
      // 처리 여부를 알 수 없는 요청은 최대 비용 예약을 남기고 더 호출하지 않는다.
      unconfirmedReservedUsd += item.reservedUsd;
      const code = experimentErrorCode(error);
      results.push({ ...base, durationMs: Math.round(performance.now() - start), outcome: options.signal?.aborted || code === "aborted" ? "cancelled" : "provider-failed", unconfirmedReservedUsd: item.reservedUsd, errorCode: code });
      break;
    }
    const usage = readExperimentUsage(response.usage);
    const cost = usage ? estimateExperimentUsd(response.model, usage) : null;
    const received = {
      ...base, actualModel: response.model, requestId: response.requestId, messageId: response.messageId,
      durationMs: Math.round(performance.now() - start), stopReason: response.stopReason, usage,
    };
    if (usage === null || cost === null) {
      unconfirmedReservedUsd += item.reservedUsd;
      results.push({ ...received, outcome: usage === null ? "invalid-usage" : "unknown-cost", unconfirmedReservedUsd: item.reservedUsd, errorCode: "cost-unconfirmed" });
      break;
    }
    estimatedUsd += cost;
    if (cost > item.reservedUsd || estimatedUsd > options.budgetUsd) {
      results.push({ ...received, outcome: "cost-cap-exceeded", estimatedUsd: cost, errorCode: "cost-cap-exceeded" });
      break;
    }
    if (assistModelInfo(response.model)?.id !== assistModelInfo(options.model)?.id) {
      results.push({ ...received, outcome: "model-mismatch", estimatedUsd: cost, errorCode: "unexpected-model" });
      break;
    }
    if (response.stopReason !== "end_turn") {
      results.push({ ...received, outcome: "incomplete", estimatedUsd: cost, errorCode: "incomplete-response" });
      break;
    }
    const checks = evaluateExperimentOutput(item.fixture, response.text);
    const passed = checks.every((check) => check.passed);
    results.push({ ...received, outcome: passed ? "passed" : "quality-failed", estimatedUsd: cost, checks });
    // 품질 실패·예상 상한 초과도 중단하여 원인을 고친 뒤 같은 fixture로 다시 비교한다.
    if (!passed) break;
  }

  return {
    schemaVersion: 1, fixtureVersion: EXPERIMENT_FIXTURE_VERSION, runLabel: options.runLabel,
    mode: options.execute ? "live" : "dry-run", requestedModel: options.model,
    priceAsOf: ASSIST_PRICE_AS_OF, startedAt, finishedAt: new Date().toISOString(),
    budgetUsd: options.budgetUsd, estimatedUsd, unconfirmedReservedUsd,
    accountingNote: "모델 공개 단가에 따른 이 실행의 추정액입니다. 조직의 실제 청구액·Max 프로모션 잔액·만료일을 뜻하지 않습니다.",
    qualityScope: "고정 합성 사례의 JSON·줄 번호·용어·기호 보존·목표 언어 문자·정중체 표지 자동 검사입니다. 번역 자연스러움이나 작품의 완성도를 평가한 점수가 아닙니다.",
    creditBalanceVerified: false,
    completedAll: results.length === plan.length && results.every((result) => result.outcome === "passed" || result.outcome === "dry-run"),
    passed: options.execute && results.length === plan.length && results.every((result) => result.outcome === "passed"),
    results,
  };
}
