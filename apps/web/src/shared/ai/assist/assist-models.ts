/**
 * Claude 모델 카탈로그와 비용 추정 — 순수 데이터·함수.
 *
 * 모델 ID는 2026-10-30에 `GET /v1/models`로 재확인했고, 단가는 Anthropic이
 * 공개한 1M 토큰당 USD 가격표(2026-10-30 기준)다.
 * 출처: https://platform.claude.com/docs/en/about-claude/pricing 가격은 바뀔 수 있으므로 화면에는 반드시
 * "추정"과 기준일을 함께 보여 주고, 실제 청구는 Anthropic 콘솔이 기준이다.
 *
 * 자동으로 더 싼 모델로 바꾸지 않는다(선택한 모델을 조용히 바꾸지 않는 비용 정책).
 * 등급(tier)은 사용자가 고르는 기본 모델의 묶음일 뿐이다.
 */
export const ASSIST_PRICE_AS_OF = "2026-10-30";

export type AssistModelTier = "fast" | "balanced" | "best" | "max" | "legacy";

export interface AssistModelInfo {
  readonly id: string;
  readonly label: string;
  readonly tier: AssistModelTier;
  readonly contextTokens: number;
  readonly maxOutputTokens: number;
  /** 1M 입력 토큰당 USD. */
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
  /** 캐시 읽기 단가가 공개돼 있으면 그 값, 없으면 입력 단가의 10%로 근사한다. */
  readonly cacheReadUsdPerMTok?: number;
  /** 이 토큰 수를 넘는 프롬프트에 적용되는 단가(Haiku 5.5는 100K 초과 시 상향). */
  readonly longPrompt?: {
    readonly thresholdTokens: number;
    readonly inputUsdPerMTok: number;
    readonly outputUsdPerMTok: number;
    readonly cacheReadUsdPerMTok?: number;
  };
}

const M = 1_000_000;

export const ASSIST_MODEL_CATALOG: readonly AssistModelInfo[] = Object.freeze([
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    tier: "fast",
    contextTokens: M,
    maxOutputTokens: 128_000,
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    cacheReadUsdPerMTok: 0.01,
    longPrompt: { thresholdTokens: 100_000, inputUsdPerMTok: 0.5, outputUsdPerMTok: 2.5, cacheReadUsdPerMTok: 0.05 },
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    tier: "balanced",
    contextTokens: M,
    maxOutputTokens: 128_000,
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    cacheReadUsdPerMTok: 0.1,
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    tier: "best",
    contextTokens: M,
    maxOutputTokens: 128_000,
    inputUsdPerMTok: 4,
    outputUsdPerMTok: 20,
    cacheReadUsdPerMTok: 0.2,
  },
  {
    id: "claude-fable-5-1",
    label: "Claude Fable 5.1",
    tier: "max",
    contextTokens: M,
    maxOutputTokens: 128_000,
    inputUsdPerMTok: 10,
    outputUsdPerMTok: 50,
    cacheReadUsdPerMTok: 0.25,
  },
  { id: "claude-fable-5", label: "Claude Fable 5", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  { id: "claude-opus-5", label: "Claude Opus 5", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "legacy", contextTokens: M, maxOutputTokens: 128_000, inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", tier: "legacy", contextTokens: 200_000, maxOutputTokens: 64_000, inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
] satisfies readonly AssistModelInfo[]);

/** 사용자가 고르지 않았을 때의 기본 모델. 가장 낮은 등급으로 몰래 바꾸지 않는다. */
export const ASSIST_DEFAULT_MODEL_ID = "claude-opus-5-5";

export const ASSIST_TIER_DEFAULT_MODEL: Readonly<Record<Exclude<AssistModelTier, "legacy">, string>> = Object.freeze({
  fast: "claude-haiku-5-5",
  balanced: "claude-sonnet-5-5",
  best: "claude-opus-5-5",
  max: "claude-fable-5-1",
});

/** 날짜 접미사(-YYYYMMDD)가 붙은 별칭도 같은 모델로 본다. */
function normalizedModelId(modelId: string): string {
  return modelId.trim().toLowerCase().replace(/-\d{8}$/u, "");
}

export function assistModelInfo(modelId: string): AssistModelInfo | undefined {
  const id = normalizedModelId(modelId);
  return ASSIST_MODEL_CATALOG.find((model) => model.id === id);
}

/**
 * `output_config.effort`는 지원하지 않는 모델에 보내면 400이다(Sonnet 4.5·Haiku 4.5 등).
 * 확인된 모델(5.x 전 계열과 Opus 4.6~4.8, Sonnet 4.6)에만 보내고, 모르는 모델은 보내지 않는다.
 */
export function assistModelSupportsEffort(modelId: string): boolean {
  const id = normalizedModelId(modelId);
  return /^claude-(?:haiku|sonnet|opus|fable)-5(?:-\d+)?$/u.test(id)
    || /^claude-opus-4-[678]$/u.test(id)
    || id === "claude-sonnet-4-6";
}

export interface AssistTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export const EMPTY_ASSIST_TOKEN_USAGE: AssistTokenUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export interface AssistCostEstimate {
  readonly usd: number;
  /** 캐시 읽기 단가가 공개되지 않아 입력 단가의 10%로 근사했으면 true. */
  readonly approximate: boolean;
}

/**
 * 한 번의 호출 사용량으로 비용을 추정한다. 카탈로그에 없는 모델은 null(모른다고 말한다).
 * 캐시 쓰기는 입력 단가의 1.25배(5분 TTL)로 계산한다.
 */
export function estimateAssistCostUsd(
  modelId: string,
  usage: AssistTokenUsage,
): AssistCostEstimate | null {
  const model = assistModelInfo(modelId);
  if (!model) return null;
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const longPrompt = model.longPrompt && promptTokens > model.longPrompt.thresholdTokens
    ? model.longPrompt
    : undefined;
  const inputRate = longPrompt?.inputUsdPerMTok ?? model.inputUsdPerMTok;
  const outputRate = longPrompt?.outputUsdPerMTok ?? model.outputUsdPerMTok;
  const publishedCacheReadRate = longPrompt?.cacheReadUsdPerMTok ?? model.cacheReadUsdPerMTok;
  const cacheReadRate = publishedCacheReadRate ?? inputRate * 0.1;
  const usd = (
    usage.inputTokens * inputRate
    + usage.cacheReadTokens * cacheReadRate
    + usage.cacheWriteTokens * inputRate * 1.25
    + usage.outputTokens * outputRate
  ) / M;
  return {
    usd,
    approximate: usage.cacheReadTokens > 0 && publishedCacheReadRate === undefined,
  };
}

export function addAssistTokenUsage(left: AssistTokenUsage, right: AssistTokenUsage): AssistTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}
