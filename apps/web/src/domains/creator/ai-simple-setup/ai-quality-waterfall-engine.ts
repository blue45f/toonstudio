/**
 * 초보자용 AI 설정 초단순화 · 품질 최우선(Quality-First) 무료 토큰 워터폴 라우터.
 *
 * 우선순위 정책:
 *   Tier 1: 최상급 품질 무료 티어 (Google Gemini 무료 API 티어 최상위 모델)
 *   Tier 2: 고성능 무료 라우터 (OpenRouter 무료 최상위 코딩·비전·텍스트 모델)
 *   Tier 3: 사용자 본인 API 키 (BYOK: Gemini / OpenRouter / OpenAI / Anthropic / Local Ollama)
 *   Tier 4: 완전 오프라인 ₩0 로컬 엔진 (WebGPU / ONNX / 절차적 어시스트)
 *
 * 보안 원칙:
 * - 실제 API 키 원문을 상태 스냅샷이나 로그에 보관하지 않고 마스킹된 지문(fingerprint)만 남긴다.
 * - 브라우저 영구 저장소에 직접 접근하지 않고 상위 보안 콜백에 위임한다.
 */

import {
  AI_DEFAULT_TIER1_FREE_TOKENS,
  AI_DEFAULT_TIER2_FREE_TOKENS,
  AI_FREE_LOW_THRESHOLD_RATIO,
  AI_TASK_SMART_DEFAULTS,
  USER_BYOK_PROVIDER_GUIDES,
  getUserByokProviderGuide,
  type AiSignalTone,
  type AiTaskCategory,
  type AiTaskSmartDefault,
  type AiTierAvailabilityStatus,
  type AiWaterfallTierId,
  type UserByokProviderGuide,
  type UserByokProviderId,
} from "./ai-quality-waterfall-catalog";

export {
  AI_DEFAULT_TIER1_FREE_TOKENS,
  AI_DEFAULT_TIER2_FREE_TOKENS,
  AI_FREE_LOW_THRESHOLD_RATIO,
  AI_TASK_SMART_DEFAULTS,
  USER_BYOK_PROVIDER_GUIDES,
  getUserByokProviderGuide,
  type AiSignalTone,
  type AiTaskCategory,
  type AiTaskSmartDefault,
  type AiTierAvailabilityStatus,
  type AiWaterfallTierId,
  type UserByokProviderGuide,
  type UserByokProviderId,
};

export interface AiFreeTierPoolInput {
  readonly totalTokens: number;
  readonly remainingTokens: number;
}

export interface UserByokKeyState {
  readonly providerId: UserByokProviderId;
  readonly configured: boolean;
  readonly keyFingerprint: string | null;
  readonly endpointUrl: string | null;
  readonly modelOverride: string | null;
}

export interface AiWaterfallState {
  readonly tier1GeminiFree: AiFreeTierPoolInput;
  readonly tier2OpenRouterFree: AiFreeTierPoolInput;
  readonly userByok: UserByokKeyState | null;
  readonly localOfflineReady: boolean;
}

export interface AiSimpleModePreferences {
  /** 초보자가 보는 단일 기본 스위치: 켜면 품질 최우선 무료 워터폴과 작업별 스마트 기본값을 자동 적용한다. */
  readonly autoBestQuality: boolean;
  /** 원클릭 '오프라인 ₩0 로컬 모드로 계속하기' 선택 여부 */
  readonly preferOfflineZeroCost: boolean;
  readonly taskCategory: AiTaskCategory;
  /** 고급 접힘(<details>) 파라미터 */
  readonly preferredModelOverride: string | null;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly systemPromptNote: string;
}

export interface AiTierQuotaSnapshot {
  readonly tierId: AiWaterfallTierId;
  readonly rank: 1 | 2 | 3 | 4;
  readonly providerLabelKo: string;
  readonly shortLabelKo: string;
  readonly modelId: string;
  readonly qualityScore: number;
  readonly costKrwPerRequest: 0 | null;
  readonly totalTokens: number;
  readonly remainingTokens: number;
  readonly remainingRatio: number;
  readonly status: AiTierAvailabilityStatus;
  readonly resetWindowKo: string;
  readonly summaryKo: string;
}

export interface AiWaterfallRoutingDecision {
  readonly activeTierId: AiWaterfallTierId;
  readonly activeTier: AiTierQuotaSnapshot;
  readonly fallbackChain: readonly AiWaterfallTierId[];
  readonly allFreeTiersExhausted: boolean;
  readonly needsUserKeyPrompt: boolean;
  readonly freePoolTotalTokens: number;
  readonly freePoolRemainingTokens: number;
  readonly freePoolRemainingPercent: number;
  readonly signalTone: AiSignalTone;
  readonly headlineKo: string;
  readonly sublineKo: string;
  readonly effectiveModelId: string;
  readonly effectiveTemperature: number;
  readonly effectiveMaxOutputTokens: number;
  readonly effectiveSystemPromptNote: string;
  readonly tiers: readonly AiTierQuotaSnapshot[];
}

export interface AiTokenConsumptionResult {
  readonly nextState: AiWaterfallState;
  readonly deductedFromTier1: number;
  readonly deductedFromTier2: number;
  readonly unfulfilledTokens: number;
  readonly cascadedToTier2: boolean;
  readonly exhaustedAllFreeTiers: boolean;
}

export interface UserByokValidationResult {
  readonly valid: boolean;
  readonly reasonKo: string | null;
  readonly maskedFingerprint: string | null;
  readonly normalizedEndpointUrl: string | null;
}

export function createDefaultAiSimplePreferences(
  overrides: Partial<AiSimpleModePreferences> = {},
): AiSimpleModePreferences {
  const category = overrides.taskCategory ?? "story-dialogue";
  const taskDefault = AI_TASK_SMART_DEFAULTS[category];
  return Object.freeze({
    autoBestQuality: overrides.autoBestQuality ?? true,
    preferOfflineZeroCost: overrides.preferOfflineZeroCost ?? false,
    taskCategory: category,
    preferredModelOverride: overrides.preferredModelOverride ?? null,
    temperature: clampTemperature(overrides.temperature ?? taskDefault.defaultTemperature),
    maxOutputTokens: clampMaxOutputTokens(overrides.maxOutputTokens ?? taskDefault.defaultMaxOutputTokens),
    systemPromptNote: overrides.systemPromptNote ?? taskDefault.defaultSystemPromptNote,
  });
}

export function createInitialAiWaterfallState(
  overrides: Partial<AiWaterfallState> = {},
): AiWaterfallState {
  return Object.freeze({
    tier1GeminiFree: normalizePool(overrides.tier1GeminiFree ?? {
      totalTokens: AI_DEFAULT_TIER1_FREE_TOKENS,
      remainingTokens: AI_DEFAULT_TIER1_FREE_TOKENS,
    }),
    tier2OpenRouterFree: normalizePool(overrides.tier2OpenRouterFree ?? {
      totalTokens: AI_DEFAULT_TIER2_FREE_TOKENS,
      remainingTokens: AI_DEFAULT_TIER2_FREE_TOKENS,
    }),
    userByok: overrides.userByok ? Object.freeze({ ...overrides.userByok }) : null,
    localOfflineReady: overrides.localOfflineReady ?? true,
  });
}

function normalizePool(pool: AiFreeTierPoolInput): AiFreeTierPoolInput {
  const totalTokens = Number.isFinite(pool.totalTokens) ? Math.max(0, Math.round(pool.totalTokens)) : 0;
  const remainingTokens = Number.isFinite(pool.remainingTokens)
    ? Math.min(totalTokens, Math.max(0, Math.round(pool.remainingTokens)))
    : 0;
  return Object.freeze({ totalTokens, remainingTokens });
}

export function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.round(Math.min(1.2, Math.max(0, value)) * 100) / 100;
}

export function clampMaxOutputTokens(value: number): number {
  if (!Number.isFinite(value)) return 2048;
  return Math.min(8192, Math.max(128, Math.round(value)));
}

export function classifyQuotaStatus(
  remainingTokens: number,
  totalTokens: number,
  lowThresholdRatio: number = AI_FREE_LOW_THRESHOLD_RATIO,
): Exclude<AiTierAvailabilityStatus, "user-key-required"> {
  if (totalTokens <= 0 || remainingTokens <= 0) return "exhausted";
  const ratio = remainingTokens / totalTokens;
  if (ratio <= lowThresholdRatio) return "low";
  return "ready";
}

/**
 * 품질 최우선 무료 토큰 차감:
 * Tier 1(Gemini 무료)에서 먼저 차감하고, Tier 1이 바닥나면 남은 양을 자동으로 Tier 2(OpenRouter 무료)로 승계 차감한다.
 */
export function consumeFreeTierTokens(
  state: AiWaterfallState,
  requestedTokens: number,
): AiTokenConsumptionResult {
  const safeRequested = Number.isFinite(requestedTokens) ? Math.max(0, Math.round(requestedTokens)) : 0;
  const tier1Before = state.tier1GeminiFree.remainingTokens;
  const tier2Before = state.tier2OpenRouterFree.remainingTokens;

  const deductedFromTier1 = Math.min(tier1Before, safeRequested);
  const afterTier1Need = safeRequested - deductedFromTier1;
  const deductedFromTier2 = Math.min(tier2Before, afterTier1Need);
  const unfulfilledTokens = afterTier1Need - deductedFromTier2;

  const nextState: AiWaterfallState = Object.freeze({
    ...state,
    tier1GeminiFree: normalizePool({
      totalTokens: state.tier1GeminiFree.totalTokens,
      remainingTokens: tier1Before - deductedFromTier1,
    }),
    tier2OpenRouterFree: normalizePool({
      totalTokens: state.tier2OpenRouterFree.totalTokens,
      remainingTokens: tier2Before - deductedFromTier2,
    }),
  });

  const cascadedToTier2 =
    tier1Before > 0 && nextState.tier1GeminiFree.remainingTokens === 0 && nextState.tier2OpenRouterFree.remainingTokens > 0;
  const exhaustedAllFreeTiers =
    nextState.tier1GeminiFree.remainingTokens === 0 && nextState.tier2OpenRouterFree.remainingTokens === 0;

  return Object.freeze({
    nextState,
    deductedFromTier1,
    deductedFromTier2,
    unfulfilledTokens,
    cascadedToTier2,
    exhaustedAllFreeTiers,
  });
}

function buildMaskedFingerprint(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 6) return `****(${trimmed.length}자)`;
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-2)}(${trimmed.length}자)`;
}

function isLocalhostEndpointUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * 사용자 API 키 또는 로컬 Ollama 주소 형식을 검증한다.
 * 원문 키를 저장하거나 반환하지 않으며, 마스킹된 지문만 돌려준다.
 */
export function validateUserByokKeyInput(
  providerId: UserByokProviderId,
  rawKeyInput: string,
  rawEndpointUrl?: string,
): UserByokValidationResult {
  const guide = getUserByokProviderGuide(providerId);
  if (guide.requiresEndpointUrl) {
    const candidateUrl = (rawEndpointUrl ?? rawKeyInput).trim();
    if (!candidateUrl) {
      return Object.freeze({
        valid: false,
        reasonKo: "로컬 Ollama 서버 주소(예: http://127.0.0.1:11434)를 입력해 주세요.",
        maskedFingerprint: null,
        normalizedEndpointUrl: null,
      });
    }
    if (!isLocalhostEndpointUrl(candidateUrl)) {
      return Object.freeze({
        valid: false,
        reasonKo: "보안을 위해 Local Ollama는 localhost 또는 127.0.0.1 주소만 연결할 수 있어요.",
        maskedFingerprint: null,
        normalizedEndpointUrl: null,
      });
    }
    const normalized = candidateUrl.replace(/\/+$/u, "");
    return Object.freeze({
      valid: true,
      reasonKo: null,
      maskedFingerprint: `local(${new URL(normalized).host})`,
      normalizedEndpointUrl: normalized,
    });
  }

  const trimmed = rawKeyInput.trim();
  if (trimmed.length === 0) {
    return Object.freeze({
      valid: false,
      reasonKo: `${guide.labelKo} API 키를 입력해 주세요.`,
      maskedFingerprint: null,
      normalizedEndpointUrl: null,
    });
  }
  if (/\s/u.test(trimmed)) {
    return Object.freeze({
      valid: false,
      reasonKo: "API 키 안에 공백이나 줄바꿈이 들어 있어요. 키 값만 다시 붙여 넣어 주세요.",
      maskedFingerprint: null,
      normalizedEndpointUrl: null,
    });
  }
  if (trimmed.length < 12) {
    return Object.freeze({
      valid: false,
      reasonKo: "API 키 길이가 너무 짧아요(최소 12자 이상). 발급 페이지에서 전체 키를 복사해 주세요.",
      maskedFingerprint: null,
      normalizedEndpointUrl: null,
    });
  }
  if (/^(test|demo|example|sample|placeholder|your[_-]?api[_-]?key)/iu.test(trimmed)) {
    return Object.freeze({
      valid: false,
      reasonKo: "예시 문구가 입력돼 있어요. 발급받은 실제 개인 API 키를 붙여 넣어 주세요.",
      maskedFingerprint: null,
      normalizedEndpointUrl: null,
    });
  }
  return Object.freeze({
    valid: true,
    reasonKo: null,
    maskedFingerprint: buildMaskedFingerprint(trimmed),
    normalizedEndpointUrl: null,
  });
}

export function registerUserByokKeyInState(
  state: AiWaterfallState,
  providerId: UserByokProviderId,
  validation: UserByokValidationResult,
  modelOverride?: string | null,
): AiWaterfallState {
  if (!validation.valid || !validation.maskedFingerprint) return state;
  const trimmedModel = modelOverride?.trim() ? modelOverride.trim() : null;
  return Object.freeze({
    ...state,
    userByok: Object.freeze({
      providerId,
      configured: true,
      keyFingerprint: validation.maskedFingerprint,
      endpointUrl: validation.normalizedEndpointUrl,
      modelOverride: trimmedModel,
    }),
  });
}

interface TierResolutionSummary {
  readonly activeTier: AiTierQuotaSnapshot;
  readonly needsUserKeyPrompt: boolean;
  readonly signalTone: AiSignalTone;
  readonly headlineKo: string;
  readonly sublineKo: string;
}

function resolveActiveTierSummary(
  tier1: AiTierQuotaSnapshot,
  tier2: AiTierQuotaSnapshot,
  tier3: AiTierQuotaSnapshot,
  tier4: AiTierQuotaSnapshot,
  byokConfigured: boolean,
  preferOfflineZeroCost: boolean,
): TierResolutionSummary {
  if (preferOfflineZeroCost) {
    return {
      activeTier: tier4,
      needsUserKeyPrompt: false,
      signalTone: "cool",
      headlineKo: "오프라인 ₩0 로컬 모드로 작업 중",
      sublineKo: "네트워크 전송과 비용 없이 기기 내부 WebGPU/ONNX 엔진만 사용합니다.",
    };
  }
  if (tier1.status !== "exhausted") {
    return {
      activeTier: tier1,
      needsUserKeyPrompt: false,
      signalTone: tier1.status === "low" ? "warn" : "good",
      headlineKo: "최상 품질 무료 AI 사용 가능",
      sublineKo: tier1.status === "low"
        ? `1단계 Gemini 무료 한도가 적게 남았어요. 바닥나면 2단계 OpenRouter 무료(${tier2.modelId})로 자동 전환됩니다.`
        : `1단계 최상급 품질(${tier1.modelId})로 자동 연결돼 있어요. 별도 설정 없이 바로 작업하세요.`,
    };
  }
  if (tier2.status !== "exhausted") {
    return {
      activeTier: tier2,
      needsUserKeyPrompt: false,
      signalTone: tier2.status === "low" ? "warn" : "good",
      headlineKo: "최상 품질 무료 AI 사용 가능",
      sublineKo: tier2.status === "low"
        ? "2단계 OpenRouter 무료 잔여량도 얼마 남지 않았어요. 곧 내 API 키 연결 또는 오프라인 ₩0 모드를 안내해 드려요."
        : `1단계 한도를 다 써서 2단계 OpenRouter 고성능 무료(${tier2.modelId})로 자동 전환했어요.`,
    };
  }
  if (byokConfigured) {
    return {
      activeTier: tier3,
      needsUserKeyPrompt: false,
      signalTone: "good",
      headlineKo: "내 API 키로 최상 품질 연결됨",
      sublineKo: `${tier3.providerLabelKo}(${tier3.modelId})로 바로 작업합니다. 키는 상위 보안 저장소에 위임됩니다.`,
    };
  }
  return {
    activeTier: tier4,
    needsUserKeyPrompt: true,
    signalTone: "bad",
    headlineKo: "무료 토큰 모두 소진 — 내 API 키 연결 필요",
    sublineKo: "1·2단계 무료 토큰을 모두 사용했어요. 3초 안내로 무료 개인 키를 연결하거나 오프라인 ₩0 모드로 바로 이어가세요.",
  };
}

/**
 * 품질 최우선(Quality-First) 무료 크레딧 워터폴 라우터:
 *   1) Tier 1 (Google Gemini 무료 최상위)
 *   2) Tier 2 (OpenRouter 고성능 무료 코딩/비전/텍스트)
 *   3) Tier 3 (사용자 BYOK — 연결된 경우)
 *   4) Tier 4 (완전 오프라인 ₩0 WebGPU/ONNX 로컬 엔진)
 */
export function selectBestAvailableAiTier(
  state: AiWaterfallState,
  preferences: AiSimpleModePreferences = createDefaultAiSimplePreferences(),
): AiWaterfallRoutingDecision {
  const taskDefault = AI_TASK_SMART_DEFAULTS[preferences.taskCategory];
  const tier1Status = classifyQuotaStatus(state.tier1GeminiFree.remainingTokens, state.tier1GeminiFree.totalTokens);
  const tier2Status = classifyQuotaStatus(state.tier2OpenRouterFree.remainingTokens, state.tier2OpenRouterFree.totalTokens);
  const byokConfigured = Boolean(state.userByok?.configured);
  const byokGuide = state.userByok ? getUserByokProviderGuide(state.userByok.providerId) : null;

  const tier1: AiTierQuotaSnapshot = Object.freeze({
    tierId: "tier-1-gemini-free",
    rank: 1,
    providerLabelKo: "Google Gemini 무료 티어",
    shortLabelKo: "1단계 · Gemini 무료",
    modelId: taskDefault.tier1GeminiModel,
    qualityScore: 96,
    costKrwPerRequest: 0,
    totalTokens: state.tier1GeminiFree.totalTokens,
    remainingTokens: state.tier1GeminiFree.remainingTokens,
    remainingRatio: state.tier1GeminiFree.totalTokens > 0
      ? state.tier1GeminiFree.remainingTokens / state.tier1GeminiFree.totalTokens
      : 0,
    status: tier1Status,
    resetWindowKo: "일일 무료 한도 자동 초기화",
    summaryKo: "최상급 품질 무료 우선 호출 — 처음 켠 순간 별도 설정 없이 바로 사용합니다.",
  });

  const tier2: AiTierQuotaSnapshot = Object.freeze({
    tierId: "tier-2-openrouter-free",
    rank: 2,
    providerLabelKo: "OpenRouter 고성능 무료",
    shortLabelKo: "2단계 · OpenRouter 무료",
    modelId: taskDefault.tier2OpenRouterModel,
    qualityScore: 91,
    costKrwPerRequest: 0,
    totalTokens: state.tier2OpenRouterFree.totalTokens,
    remainingTokens: state.tier2OpenRouterFree.remainingTokens,
    remainingRatio: state.tier2OpenRouterFree.totalTokens > 0
      ? state.tier2OpenRouterFree.remainingTokens / state.tier2OpenRouterFree.totalTokens
      : 0,
    status: tier2Status,
    resetWindowKo: "무료 풀 자동 승계",
    summaryKo: "1단계 무료 한도가 끝나면 코딩·비전·텍스트 무료 최상위 모델로 끊김 없이 이어집니다.",
  });

  const tier3: AiTierQuotaSnapshot = Object.freeze({
    tierId: "tier-3-user-byok",
    rank: 3,
    providerLabelKo: byokGuide ? `내 API 키 (${byokGuide.labelKo})` : "내 API 키 (BYOK)",
    shortLabelKo: "3단계 · 내 API 키",
    modelId: state.userByok?.modelOverride ?? byokGuide?.defaultModel ?? "user-selected-model",
    qualityScore: byokConfigured ? 98 : 0,
    costKrwPerRequest: state.userByok?.providerId === "ollama" ? 0 : null,
    totalTokens: 0,
    remainingTokens: 0,
    remainingRatio: byokConfigured ? 1 : 0,
    status: byokConfigured ? "ready" : "user-key-required",
    resetWindowKo: byokConfigured ? `연결됨 · ${state.userByok?.keyFingerprint ?? "확인됨"}` : "무료 소진 시 3초 연결",
    summaryKo: byokConfigured
      ? "사용자 본인 키를 브라우저 보안 설정 위임으로 직접 호출합니다."
      : "Gemini·OpenRouter·OpenAI·Anthropic·Local Ollama 키를 원클릭으로 연결할 수 있어요.",
  });

  const tier4: AiTierQuotaSnapshot = Object.freeze({
    tierId: "tier-4-local-offline",
    rank: 4,
    providerLabelKo: "오프라인 ₩0 로컬 엔진 (WebGPU/ONNX)",
    shortLabelKo: "4단계 · 오프라인 ₩0",
    modelId: taskDefault.tier4LocalModel,
    qualityScore: 72,
    costKrwPerRequest: 0,
    totalTokens: 0,
    remainingTokens: 0,
    remainingRatio: state.localOfflineReady ? 1 : 0,
    status: state.localOfflineReady ? "ready" : "exhausted",
    resetWindowKo: "무제한 · 기기 내 ₩0 실행",
    summaryKo: "인터넷이나 키가 없어도 브라우저 WebGPU/ONNX·절차적 어시스트로 계속 작업합니다.",
  });

  const tiers: readonly AiTierQuotaSnapshot[] = Object.freeze([tier1, tier2, tier3, tier4]);
  const freePoolTotalTokens = tier1.totalTokens + tier2.totalTokens;
  const freePoolRemainingTokens = tier1.remainingTokens + tier2.remainingTokens;
  const freePoolRemainingPercent = freePoolTotalTokens > 0
    ? Math.round((freePoolRemainingTokens / freePoolTotalTokens) * 100)
    : 0;
  const allFreeTiersExhausted = tier1Status === "exhausted" && tier2Status === "exhausted";

  const resolved = resolveActiveTierSummary(
    tier1,
    tier2,
    tier3,
    tier4,
    byokConfigured,
    preferences.preferOfflineZeroCost,
  );

  const fallbackChain: readonly AiWaterfallTierId[] = Object.freeze(
    tiers
      .filter((tier) => tier.tierId !== resolved.activeTier.tierId && tier.status !== "exhausted")
      .map((tier) => tier.tierId),
  );

  const manualOverride = !preferences.autoBestQuality && preferences.preferredModelOverride?.trim()
    ? preferences.preferredModelOverride.trim()
    : null;

  return Object.freeze({
    activeTierId: resolved.activeTier.tierId,
    activeTier: resolved.activeTier,
    fallbackChain,
    allFreeTiersExhausted,
    needsUserKeyPrompt: resolved.needsUserKeyPrompt,
    freePoolTotalTokens,
    freePoolRemainingTokens,
    freePoolRemainingPercent,
    signalTone: resolved.signalTone,
    headlineKo: resolved.headlineKo,
    sublineKo: resolved.sublineKo,
    effectiveModelId: manualOverride ?? resolved.activeTier.modelId,
    effectiveTemperature: preferences.autoBestQuality
      ? taskDefault.defaultTemperature
      : clampTemperature(preferences.temperature),
    effectiveMaxOutputTokens: preferences.autoBestQuality
      ? taskDefault.defaultMaxOutputTokens
      : clampMaxOutputTokens(preferences.maxOutputTokens),
    effectiveSystemPromptNote: preferences.autoBestQuality
      ? taskDefault.defaultSystemPromptNote
      : (preferences.systemPromptNote.trim() || taskDefault.defaultSystemPromptNote),
    tiers,
  });
}
