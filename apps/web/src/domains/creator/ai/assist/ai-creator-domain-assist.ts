/**
 * claude-creator-domain-assist.ts
 *
 * Phase 3 크리에이터 핵심 도메인(캐릭터 캐논 · 프롬프트 증강 · 2D 셀 음영/조명 · 말투 지문 OOC 교정)
 * Claude 구조화 출력(`assistParse`) 및 로컬 결정적 폴백 통합 엔진.
 */
import { z } from "zod";

import {
  ASSIST_DEFAULT_MODEL_ID,
  assistModelInfo,
  assistModelSupportsEffort,
  EMPTY_ASSIST_TOKEN_USAGE,
  estimateAssistCostUsd,
  type AssistTokenUsage,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import {
  CANON_APPEARANCE_MAX,
  CANON_OUTFIT_MAX,
} from "../canon/studio-character-canon";
import {
  StudioAiPromptEnhancer,
  type EnhancedPromptResult,
  type PromptEnhancementOptions,
  type PromptGenreHint,
} from "../studio-ai-prompt-enhancer";
import {
  StudioAiShadingAssistEngine,
  type ComputedShadingParams,
  type LightSourceConfig,
} from "../studio-ai-shading-assist";

import {
  resolveCreatorTaskModelRoute,
  type AssistCreatorTaskId,
} from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";
import { clampInt, type RunWebtoonProductionAssistOptions } from "./assist-webtoon-production-schemas";

import type Anthropic from "@anthropic-ai/sdk";

const MAX_OUTPUT_TOKENS = 3_200;

function resolveActiveAssistRoute(
  explicit?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null,
): Pick<AssistRoute, "apiKey" | "revision" | "model"> | null {
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
  return explicit ?? resolveAssistRoute();
}

function safeHex(raw: string, fallback: string): string {
  const cleaned = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/u.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

// ── 1. 캐릭터 캐논 시트 AI 아키텍트 (`runAssistCharacterCanonArchitect`) ───────────────

export const AssistCharacterCanonArchitectSchema = z.object({
  appearanceKo: z.string(),
  outfitKo: z.string(),
  traitTags: z.array(z.string()),
  englishPromptLockTokens: z.string(),
  negativeDriftTokens: z.string(),
  speechStyleSummaryKo: z.string(),
});

export interface CharacterCanonArchitectInput {
  readonly name: string;
  readonly genre?: string;
  readonly roleArchetype?: string;
  readonly roughNotes?: string;
  readonly existingTags?: readonly string[];
}

export interface CharacterCanonArchitectView {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly appearanceKo: string;
  readonly outfitKo: string;
  readonly traitTags: readonly string[];
  readonly englishPromptLockTokens: string;
  readonly negativeDriftTokens: string;
  readonly speechStyleSummaryKo: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicCharacterCanonView(
  input: CharacterCanonArchitectInput,
): CharacterCanonArchitectView {
  const name = cleanSingleLineText(input.name || "유진", 40) || "유진";
  const genre = cleanSingleLineText(input.genre ?? "로맨스 판타지", 40) || "로맨스 판타지";
  const notes = cleanSingleLineText(input.roughNotes ?? "", 160);
  const baseTags =
    input.existingTags && input.existingTags.length > 0
      ? [...input.existingTags.slice(0, 6)]
      : ["냉철한 눈매", "은발 레이어드 컷", "왼쪽 눈 밑 점", "슬림한 실루엣"];

  return Object.freeze({
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    appearanceKo:
      `${name} — ${genre} 화풍의 날카롭고 정교한 이목구비, 빛을 받으면 푸른빛이 감도는 칠흑색 눈동자, 귀를 살짝 덮는 레이어드 헤어스타일과 균형 잡힌 8등신 웹툰 프로포션.${notes ? ` (${notes})` : ""}`.slice(
        0,
        CANON_APPEARANCE_MAX,
      ),
    outfitKo:
      "짙은 네이비 하이칼라 롱코트, 은장식 견장과 버클 벨트, 크림색 드레스 셔츠와 가죽 장갑".slice(
        0,
        CANON_OUTFIT_MAX,
      ),
    traitTags: Object.freeze(baseTags),
    englishPromptLockTokens:
      "consistent character sheet, sharp manhwa lineart, deep navy high-collar coat, silver shoulder epaulettes, piercing dark-blue iris, mole under left eye",
    negativeDriftTokens:
      "inconsistent hair color, missing mole, asymmetrical eyes, 3d plastic skin, extra fingers, blurry costume ornaments",
    speechStyleSummaryKo: "감정을 절제한 단문 위주 반말·하대체, 위기 상황일수록 어조가 차분해지는 스타일",
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export async function runAssistCharacterCanonArchitect(
  input: CharacterCanonArchitectInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CharacterCanonArchitectView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicCharacterCanonView(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveAssistRequestModel(
    options.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 라이언로켓 젠버스(Genvas)·클립스튜디오 기준 웹툰 캐릭터 캐논 시트(Character Canon Sheet) 디렉터입니다. 매 컷마다 동일한 얼굴·머리색·체형·의상이 유지되도록 외모 묘사(appearanceKo), 의상 묘사(outfitKo), 핵심 특징 태그(traitTags), 영문 이미지 시드 고정 토큰(englishPromptLockTokens), 외모 드리프트 방지 네거티브 토큰(negativeDriftTokens), 캐릭터 말투 요약(speechStyleSummaryKo)을 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `캐릭터 이름: ${cleanSingleLineText(input.name || "유진", 40)}`,
          `장르: ${cleanSingleLineText(input.genre ?? "로맨스 판타지", 40)}`,
          `역할 아키타입: ${cleanSingleLineText(input.roleArchetype ?? "주인공", 40)}`,
          ...(input.roughNotes ? [`작가 메모: ${cleanSingleLineText(input.roughNotes, 240)}`] : []),
          ...(input.existingTags?.length
            ? [`기존 태그: ${input.existingTags.slice(0, 8).join(", ")}`]
            : []),
          "",
          "위 캐릭터의 웹툰 캐논 시트를 JSON으로 완성해 주세요.",
        ].join("\n"),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistCharacterCanonArchitectSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistCharacterCanonArchitectSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      appearanceKo: cleanSingleLineText(parsed.appearanceKo, CANON_APPEARANCE_MAX),
      outfitKo: cleanSingleLineText(parsed.outfitKo, CANON_OUTFIT_MAX),
      traitTags: Object.freeze(
        (parsed.traitTags ?? [])
          .map((t) => cleanSingleLineText(t, 28))
          .filter(Boolean)
          .slice(0, 8),
      ),
      englishPromptLockTokens: cleanSingleLineText(parsed.englishPromptLockTokens, 320),
      negativeDriftTokens: cleanSingleLineText(parsed.negativeDriftTokens, 260),
      speechStyleSummaryKo: cleanSingleLineText(parsed.speechStyleSummaryKo, 160),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicCharacterCanonView(input);
    }
    throw error;
  }
}

// ── 2. 웹툰 프롬프트 증강 & 카메라/조명 앵커 생성기 (`runAssistPromptEnhancer`) ─────────

export const AssistPromptEnhancerSchema = z.object({
  detectedGenre: z.enum(["action", "romance", "fantasy", "slice-of-life", "horror"]),
  enhancedPositivePrompt: z.string(),
  recommendedNegativePrompt: z.string(),
  cameraAndLensTag: z.string(),
  lightingAndColorTag: z.string(),
  keywordsAdded: z.array(z.string()),
});

export interface AssistEnhancedPromptView extends EnhancedPromptResult {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly cameraAndLensTag: string;
  readonly lightingAndColorTag: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicEnhancedPromptView(
  rawPrompt: string,
  options: PromptEnhancementOptions = {},
): AssistEnhancedPromptView {
  const enhancer = new StudioAiPromptEnhancer();
  const base = enhancer.enhance(rawPrompt, options);
  return Object.freeze({
    ...base,
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    cameraAndLensTag: "35mm cinematic webtoon framing, clean vertical scroll composition",
    lightingAndColorTag: "L3 multiply cel shading 60%, crisp rim light highlight, color-hold ink lineart",
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export async function runAssistPromptEnhancer(
  rawPrompt: string,
  enhanceOptions: PromptEnhancementOptions = {},
  runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistEnhancedPromptView> {
  const activeRoute = resolveActiveAssistRoute(runOptions.route);
  if (!activeRoute) {
    if (runOptions.fallbackOnError !== false) {
      return buildDeterministicEnhancedPromptView(rawPrompt, enhanceOptions);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveAssistRequestModel(
    runOptions.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 K-웹툰 작화·연출 전문 프롬프트 엔지니어입니다. 사용자의 한글/영문 장면 설명을 분석해 장르(action/romance/fantasy/slice-of-life/horror)를 판별하고, 고해상도 웹툰 생성에 최적화된 영문+한글 포지티브 프롬프트(enhancedPositivePrompt), 네거티브 프롬프트(recommendedNegativePrompt), 카메라·렌즈 태그(cameraAndLensTag), 4레이어 조명·채색 태그(lightingAndColorTag), 추가된 핵심 키워드 배열(keywordsAdded)을 JSON으로 반환하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `원본 장면 입력: ${cleanSingleLineText(rawPrompt, 500) || "달빛 아래 검을 뽑는 주인공"}`,
          ...(enhanceOptions.genre ? [`지정 장르 힌트: ${enhanceOptions.genre}`] : []),
          "",
          "위 웹툰 장면을 위한 구조화 프롬프트 증강 결과를 JSON으로 생성해 주세요.",
        ].join("\n"),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistPromptEnhancerSchema,
      {
        signal: runOptions.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistPromptEnhancerSchema,
        }),
        budgetOverride: runOptions.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    const detectedGenre: PromptGenreHint = enhanceOptions.genre ?? parsed.detectedGenre;
    return Object.freeze({
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      originalInput: rawPrompt.trim(),
      detectedGenre,
      enhancedPositivePrompt: cleanSingleLineText(parsed.enhancedPositivePrompt, 600),
      recommendedNegativePrompt: cleanSingleLineText(parsed.recommendedNegativePrompt, 400),
      cameraAndLensTag: cleanSingleLineText(parsed.cameraAndLensTag, 180),
      lightingAndColorTag: cleanSingleLineText(parsed.lightingAndColorTag, 180),
      keywordsAdded: Object.freeze(
        (parsed.keywordsAdded ?? [])
          .map((k) => cleanSingleLineText(k, 50))
          .filter(Boolean)
          .slice(0, 12),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (runOptions.fallbackOnError !== false && !runOptions.signal?.aborted) {
      return buildDeterministicEnhancedPromptView(rawPrompt, enhanceOptions);
    }
    throw error;
  }
}

// ── 3. 장면 맥락 기반 2단 셀 음영 & 림라이트 디렉터 (`runAssistSceneShadingDirector`) ────

export const AssistSceneShadingSchema = z.object({
  shadow1ColorHex: z.string(),
  shadow2ColorHex: z.string(),
  rimLightColorHex: z.string(),
  colorHoldInkHex: z.string(),
  subsurfaceScatterHex: z.string(),
  shadow1OpacityPct: z.number(),
  shadow2OpacityPct: z.number(),
  coloristCoachingKo: z.string(),
  promptInstruction: z.string(),
});

export interface AssistSceneShadingView extends ComputedShadingParams {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly colorHoldInkHex: string;
  readonly subsurfaceScatterHex: string;
  readonly coloristCoachingKo: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicSceneShadingView(
  config: LightSourceConfig,
): AssistSceneShadingView {
  const engine = new StudioAiShadingAssistEngine();
  const base = engine.compute(config);
  return Object.freeze({
    ...base,
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    colorHoldInkHex: "#2E1035",
    subsurfaceScatterHex: "#FB7185",
    coloristCoachingKo:
      "1단 셀 음영(Multiply)과 피부 경계면에 얇은 서브서피스 스캐터링(채도 높은 코랄/버건디 보더)을 넣으면 웹툰 작화 밀도가 살아납니다.",
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export async function runAssistSceneShadingDirector(
  config: LightSourceConfig,
  sceneDescriptionKo = "",
  runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistSceneShadingView> {
  const activeRoute = resolveActiveAssistRoute(runOptions.route);
  if (!activeRoute) {
    if (runOptions.fallbackOnError !== false) return buildDeterministicSceneShadingView(config);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveAssistRequestModel(
    runOptions.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const base = new StudioAiShadingAssistEngine().compute(config);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 네이버웹툰 AI Painter·클립스튜디오 Shading Assist 기준 웹툰 채색·조명 디렉터입니다. 광원 방향·강도·색온도와 장면 설명을 바탕으로 1단 셀 음영(shadow1ColorHex), 2단 심층 암부(shadow2ColorHex), 역광 림라이트(rimLightColorHex), 선화 색트랩(colorHoldInkHex), 피부 경계 투과광(subsurfaceScatterHex)의 #RRGGBB HEX 코드와 불투명도(%), 채색 코칭(coloristCoachingKo)을 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `광원 방향: ${config.direction}, 강도: ${config.intensityPercent}%, 소프트니스: ${config.softnessPercent}%, 색온도 프리셋: ${config.temperature}, 림라이트 활성: ${config.enableRimLight}`,
          ...(sceneDescriptionKo ? [`장면 분위기 설명: ${cleanSingleLineText(sceneDescriptionKo, 300)}`] : []),
          "",
          "위 웹툰 컷의 2단 셀 음영 및 선화 색트랩 팔레트를 JSON으로 추천해 주세요.",
        ].join("\n"),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistSceneShadingSchema,
      {
        signal: runOptions.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistSceneShadingSchema,
        }),
        budgetOverride: runOptions.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      ...base,
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      shadow1ColorHex: safeHex(parsed.shadow1ColorHex, base.shadow1ColorHex),
      shadow2ColorHex: safeHex(parsed.shadow2ColorHex, base.shadow2ColorHex),
      rimLightColorHex: safeHex(parsed.rimLightColorHex, base.rimLightColorHex ?? "#38BDF8"),
      colorHoldInkHex: safeHex(parsed.colorHoldInkHex, "#2E1035"),
      subsurfaceScatterHex: safeHex(parsed.subsurfaceScatterHex, "#FB7185"),
      shadow1Opacity: Number((clampInt(parsed.shadow1OpacityPct, 10, 90, 35) / 100).toFixed(2)),
      shadow2Opacity: Number((clampInt(parsed.shadow2OpacityPct, 15, 95, 60) / 100).toFixed(2)),
      coloristCoachingKo: cleanSingleLineText(parsed.coloristCoachingKo, 220),
      promptInstruction: cleanSingleLineText(parsed.promptInstruction, 240) || base.promptInstruction,
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (runOptions.fallbackOnError !== false && !runOptions.signal?.aborted) {
      return buildDeterministicSceneShadingView(config);
    }
    throw error;
  }
}

// ── 4~9. Wave 18~20 웹툰 작화 일관성 & 연출 AI 엔진 6종 ────────────────────────────────

interface Wave18LiveMeta<T> {
  readonly actualModel: string;
  readonly parsed: T;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

async function runWave18DomainConsistencyEngine<T extends z.ZodTypeAny>(
  taskId: AssistCreatorTaskId,
  systemPromptKo: string,
  userPromptKo: string,
  schema: T,
  runOptions: RunWebtoonProductionAssistOptions,
): Promise<Wave18LiveMeta<z.infer<T>> | null> {
  const routed = resolveCreatorTaskModelRoute(taskId, runOptions);
  const activeRoute = resolveActiveAssistRoute(runOptions.route);
  if (!activeRoute) {
    if (runOptions.fallbackOnError !== false) return null;
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveAssistRequestModel(routed.mergedOptions.model, activeRoute.model || ASSIST_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: routed.mergedOptions.maxTokens ?? MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: systemPromptKo, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPromptKo }],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: routed.mergedOptions.effort ?? ("low" as const) } } : {}),
  };
  try {
    const { message, parsed } = await assistParse(activeRoute, request, schema, {
      signal: runOptions.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema }),
      budgetOverride: runOptions.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return { actualModel: assistModelInfo(actualModel)?.id ?? actualModel, parsed, usage, estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null };
  } catch (error) {
    if (runOptions.fallbackOnError !== false && !runOptions.signal?.aborted) return null;
    throw error;
  }
}

export interface Wave18ResultEnvelope {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// 4) 스마트폰 화면·게임 상태창(Status Window)·홀로그램 UI·간판 텍스트/시각 연속성 고정기
export const AssistPropScreenUiHologramLockSchema = z.object({
  uiDeviceType: z.string(), clockAndBatteryBadgeRuleKo: z.string(), statOrChatRowCount: z.number(),
  primaryAccentHex: z.string(), typographyAndAlignmentRuleKo: z.string(), continuityWarningKo: z.string(), directorNoteKo: z.string(),
});
export type AssistPropScreenUiHologramLockOutput = z.infer<typeof AssistPropScreenUiHologramLockSchema>;
export type AssistPropScreenUiHologramLockView = AssistPropScreenUiHologramLockOutput & Wave18ResultEnvelope;

export function buildDeterministicPropScreenUiHologramLockView(sceneNoteKo = ""): AssistPropScreenUiHologramLockView {
  const isFantasy = /상태창|스탯|홀로그램|시스템|퀘스트/u.test(sceneNoteKo);
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-haiku-5-5",
    uiDeviceType: isFantasy ? "반투명 시스템 홀로그램 상태창 (Status Window)" : "현대 스마트폰 메신저 화면",
    clockAndBatteryBadgeRuleKo: isFantasy
      ? "상단 퀘스트 타이머(00:14:59) 및 마나 게이지(78%) 수치가 연속 컷에서 역행하지 않도록 고정"
      : "상단 상태바 시각(23:42) 및 배터리 잔량(18% 붉은 아이콘)이 컷 전환 후에도 동일하게 유지되도록 고정",
    statOrChatRowCount: 4, primaryAccentHex: isFantasy ? "#38BDF8" : "#FACC15",
    typographyAndAlignmentRuleKo: "본문 고딕 산세리프 14pt 고정 · 발신자 우측 정렬 / 수신자 좌측 정렬 반전 금지",
    continuityWarningKo: "클로즈업과 오버더숄더(OTS) 컷 사이에서 화면 텍스트 줄 수나 배터리 잔량이 바뀌는 오류 차단",
    directorNoteKo: "스마트폰/상태창 UI는 별도 벡터 스마트 오브젝트 레이어로 분리해 3D 원근 변형(Perspective Warp)만 적용하세요.",
    usage: EMPTY_ASSIST_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runAssistPropScreenUiHologramLockDirector(
  sceneNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistPropScreenUiHologramLockView> {
  const fb = buildDeterministicPropScreenUiHologramLockView(sceneNoteKo);
  const res = await runWave18DomainConsistencyEngine(
    "domain:prop-screen-ui-hologram-text-consistency",
    "당신은 웹툰 스마트폰 채팅 화면·게임 판타지 상태창(Status Window)·홀로그램 UI 연속성 감독입니다. 컷 간 시각/배터리/스탯 수치/정렬 일관성 규칙을 JSON으로 설계하세요.",
    `장면 설명: ${cleanSingleLineText(sceneNoteKo, 360) || "주인공이 밤거리에서 스마트폰 긴급 문자와 시스템 상태창을 확인하는 컷"}`,
    AssistPropScreenUiHologramLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    uiDeviceType: cleanSingleLineText(res.parsed.uiDeviceType, 90) || fb.uiDeviceType,
    clockAndBatteryBadgeRuleKo: cleanSingleLineText(res.parsed.clockAndBatteryBadgeRuleKo, 180) || fb.clockAndBatteryBadgeRuleKo,
    statOrChatRowCount: clampInt(res.parsed.statOrChatRowCount, 1, 12, fb.statOrChatRowCount),
    primaryAccentHex: safeHex(res.parsed.primaryAccentHex, fb.primaryAccentHex),
    typographyAndAlignmentRuleKo: cleanSingleLineText(res.parsed.typographyAndAlignmentRuleKo, 180) || fb.typographyAndAlignmentRuleKo,
    continuityWarningKo: cleanSingleLineText(res.parsed.continuityWarningKo, 180) || fb.continuityWarningKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 5) 땋은 머리(Braid) 마디 수·포니테일 결속 높이·비녀/헤어핀/리본 매듭 위치 고정기
export const AssistBraidPonytailAccessoryKnotLockSchema = z.object({
  hairstyleCategory: z.string(), braidSegmentCount: z.number(), tieHeightAnchorKo: z.string(),
  accessorySideRuleKo: z.string(), ribbonTailLengthRatio: z.string(), motionInertiaRuleKo: z.string(), directorNoteKo: z.string(),
});
export type AssistBraidPonytailAccessoryKnotLockOutput = z.infer<typeof AssistBraidPonytailAccessoryKnotLockSchema>;
export type AssistBraidPonytailAccessoryKnotLockView = AssistBraidPonytailAccessoryKnotLockOutput & Wave18ResultEnvelope;

export function buildDeterministicBraidPonytailAccessoryKnotLockView(characterHairNoteKo = ""): AssistBraidPonytailAccessoryKnotLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-haiku-5-5",
    hairstyleCategory: cleanSingleLineText(characterHairNoteKo, 70) || "사이드 브레이드(땋은 머리) + 하이 포니테일 리본",
    braidSegmentCount: 7,
    tieHeightAnchorKo: "귓바퀴 상단 연장선(후두부 상단 15도) 결속점 고정 — 컷마다 묶은 위치가 처지지 않도록 앵커 유지",
    accessorySideRuleKo: "캐릭터 기준 좌측 관자놀이 진주 헤어핀 2개 고정 (좌우 반전 절대 금지)",
    ribbonTailLengthRatio: "매듭 루프 1 : 리본 늘어뜨린 꼬리 2.4 (쇄골 하단 3cm 도달)",
    motionInertiaRuleKo: "고개 회전 후 0.15초 뒤늦게 땋은 머리 끝단과 리본 꼬리가 원심력 궤적을 그리며 추종",
    directorNoteKo: "땋은 머리 교차 마디 수(7마디)와 좌측 헤어핀 개수를 턴어라운드 시트에 고정해 어시스턴트 작붕을 예방하세요.",
    usage: EMPTY_ASSIST_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runAssistBraidPonytailAccessoryKnotLockDirector(
  characterHairNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistBraidPonytailAccessoryKnotLockView> {
  const fb = buildDeterministicBraidPonytailAccessoryKnotLockView(characterHairNoteKo);
  const res = await runWave18DomainConsistencyEngine(
    "domain:braid-ponytail-ribbon-accessory-knot-lock",
    "당신은 웹툰 캐릭터 헤어스타일(땋은 머리 마디 수·포니테일 높이·비녀/헤어핀/리본 매듭 좌우 위치) 연속성 감독입니다. JSON으로 고정 규칙을 설계하세요.",
    `캐릭터 헤어/장신구 설명: ${cleanSingleLineText(characterHairNoteKo, 360) || "좌측 진주 핀 2개와 붉은 벨벳 리본으로 묶은 7마디 땋은 머리 여주인공"}`,
    AssistBraidPonytailAccessoryKnotLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    hairstyleCategory: cleanSingleLineText(res.parsed.hairstyleCategory, 90) || fb.hairstyleCategory,
    braidSegmentCount: clampInt(res.parsed.braidSegmentCount, 3, 24, fb.braidSegmentCount),
    tieHeightAnchorKo: cleanSingleLineText(res.parsed.tieHeightAnchorKo, 180) || fb.tieHeightAnchorKo,
    accessorySideRuleKo: cleanSingleLineText(res.parsed.accessorySideRuleKo, 180) || fb.accessorySideRuleKo,
    ribbonTailLengthRatio: cleanSingleLineText(res.parsed.ribbonTailLengthRatio, 120) || fb.ribbonTailLengthRatio,
    motionInertiaRuleKo: cleanSingleLineText(res.parsed.motionInertiaRuleKo, 180) || fb.motionInertiaRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 6) 망토·코트 자락 겉감/안감(Lining) 배색·금박 문양·바람 펄럭임 위상 고정기
export const AssistCapeCloakHemLiningFlutterLockSchema = z.object({
  outerFabricHex: z.string(), innerLiningHex: z.string(), hemEmbroideryPatternKo: z.string(),
  claspAnchorRuleKo: z.string(), windFlutterPhaseRuleKo: z.string(), flipPreventionRuleKo: z.string(), directorNoteKo: z.string(),
});
export type AssistCapeCloakHemLiningFlutterLockOutput = z.infer<typeof AssistCapeCloakHemLiningFlutterLockSchema>;
export type AssistCapeCloakHemLiningFlutterLockView = AssistCapeCloakHemLiningFlutterLockOutput & Wave18ResultEnvelope;

export function buildDeterministicCapeCloakHemLiningFlutterLockView(cloakNoteKo = ""): AssistCapeCloakHemLiningFlutterLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-sonnet-5-5",
    outerFabricHex: "#1E293B", innerLiningHex: "#991B1B",
    hemEmbroideryPatternKo: cleanSingleLineText(cloakNoteKo, 90) || "밑단 외측에만 금박 쌍두독수리 보더 문양 배치 (안감에는 문양 없음)",
    claspAnchorRuleKo: "우측 쇄골 위 사자 머리 금속 브로치 1점 고정 + 좌측 어깨 위로는 망토가 절반만 덮이는 비대칭 드레이프",
    windFlutterPhaseRuleKo: "주풍향(좌→우 30도) 기준 S자 2주기 사인파 주름 유지 — 인접 컷에서 바람 방향 역전 금지",
    flipPreventionRuleKo: "망토 자락이 뒤집히는 접힘 경계선(Fold Line)에서 겉감(#1E293B)과 안감(#991B1B) 채색 영역이 섞이지 않도록 클리핑 분리",
    directorNoteKo: "망토 겉감/안감 레이어를 분리하고 밑단 금박 브러시는 겉감 마스크에만 귀속시켜 채색 반전 사고를 차단하세요.",
    usage: EMPTY_ASSIST_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runAssistCapeCloakHemLiningFlutterLockDirector(
  cloakNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistCapeCloakHemLiningFlutterLockView> {
  const fb = buildDeterministicCapeCloakHemLiningFlutterLockView(cloakNoteKo);
  const res = await runWave18DomainConsistencyEngine(
    "domain:cape-cloak-hem-lining-wind-flutter-lock",
    "당신은 웹툰 망토·롱코트 겉감/안감(Lining) 배색·밑단 금박 문양·바람 펄럭임 위상(Phase) 연속성 감독입니다. JSON으로 설계하세요.",
    `망토/코트 연출 설명: ${cleanSingleLineText(cloakNoteKo, 360) || "황실 기사단장의 짙은 남색 겉감 + 진홍색 안감 망토가 성벽 바람에 휘날리는 장면"}`,
    AssistCapeCloakHemLiningFlutterLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    outerFabricHex: safeHex(res.parsed.outerFabricHex, fb.outerFabricHex),
    innerLiningHex: safeHex(res.parsed.innerLiningHex, fb.innerLiningHex),
    hemEmbroideryPatternKo: cleanSingleLineText(res.parsed.hemEmbroideryPatternKo, 180) || fb.hemEmbroideryPatternKo,
    claspAnchorRuleKo: cleanSingleLineText(res.parsed.claspAnchorRuleKo, 180) || fb.claspAnchorRuleKo,
    windFlutterPhaseRuleKo: cleanSingleLineText(res.parsed.windFlutterPhaseRuleKo, 180) || fb.windFlutterPhaseRuleKo,
    flipPreventionRuleKo: cleanSingleLineText(res.parsed.flipPreventionRuleKo, 180) || fb.flipPreventionRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 7) 도검 코등이(Crossguard)·자루 보석·칼집(Scabbard) 패용 위치·룬 각인 고정기
export const AssistSwordHiltGuardScabbardLockSchema = z.object({
  weaponNameAndClassKo: z.string(), crossguardAsymmetryRuleKo: z.string(), pommelGemHex: z.string(),
  scabbardWearingSideRuleKo: z.string(), bladeFullerAndRuneRuleKo: z.string(), gripHandDominanceRuleKo: z.string(), directorNoteKo: z.string(),
});
export type AssistSwordHiltGuardScabbardLockOutput = z.infer<typeof AssistSwordHiltGuardScabbardLockSchema>;
export type AssistSwordHiltGuardScabbardLockView = AssistSwordHiltGuardScabbardLockOutput & Wave18ResultEnvelope;

export function buildDeterministicSwordHiltGuardScabbardLockView(weaponNoteKo = ""): AssistSwordHiltGuardScabbardLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-sonnet-5-5",
    weaponNameAndClassKo: cleanSingleLineText(weaponNoteKo, 80) || "비대칭 날개형 코등이 롱소드 (Bastard Sword)",
    crossguardAsymmetryRuleKo: "코등이 좌측은 위로 휜 은빛 독수리 날개, 우측은 아래로 꺾인 가드 — 발도 후에도 방향 고정",
    pommelGemHex: "#38BDF8",
    scabbardWearingSideRuleKo: "오른손잡이 기준 캐릭터 좌측 허리 패용 고정 — 발도 후에도 빈 칼집(Scabbard)이 좌측 허리에 반드시 남아 있어야 함",
    bladeFullerAndRuneRuleKo: "도신 중앙 혈조(Fuller) 1줄 내부에 코발트 블루 고대 룬 문자 5음절이 코등이에서 검끝 방향으로 각인",
    gripHandDominanceRuleKo: "양손 파지 시 오른손이 코등이 바로 아래(상단), 왼손이 폼멜 쪽(하단)을 잡는 파지 순서 엄수",
    directorNoteKo: "발도 장면 이후 컷에서 허리의 빈 칼집이 증발하거나 양손 파지 위아래 손 위치가 바뀌는 작붕을 중점 검수하세요.",
    usage: EMPTY_ASSIST_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runAssistSwordHiltGuardScabbardLockDirector(
  weaponNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistSwordHiltGuardScabbardLockView> {
  const fb = buildDeterministicSwordHiltGuardScabbardLockView(weaponNoteKo);
  const res = await runWave18DomainConsistencyEngine(
    "domain:sword-hilt-guard-gem-scabbard-engraving-lock",
    "당신은 판타지·무협 웹툰 무기/도검 코등이(Crossguard)·폼멜 보석·칼집(Scabbard) 패용 위치·양손 파지 순서 연속성 감독입니다. JSON으로 설계하세요.",
    `무기/전투 설명: ${cleanSingleLineText(weaponNoteKo, 360) || "푸른 마석 폼멜과 비대칭 날개 코등이를 가진 성검을 좌측 허리 칼집에서 발도하는 컷"}`,
    AssistSwordHiltGuardScabbardLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    weaponNameAndClassKo: cleanSingleLineText(res.parsed.weaponNameAndClassKo, 90) || fb.weaponNameAndClassKo,
    crossguardAsymmetryRuleKo: cleanSingleLineText(res.parsed.crossguardAsymmetryRuleKo, 180) || fb.crossguardAsymmetryRuleKo,
    pommelGemHex: safeHex(res.parsed.pommelGemHex, fb.pommelGemHex),
    scabbardWearingSideRuleKo: cleanSingleLineText(res.parsed.scabbardWearingSideRuleKo, 180) || fb.scabbardWearingSideRuleKo,
    bladeFullerAndRuneRuleKo: cleanSingleLineText(res.parsed.bladeFullerAndRuneRuleKo, 180) || fb.bladeFullerAndRuneRuleKo,
    gripHandDominanceRuleKo: cleanSingleLineText(res.parsed.gripHandDominanceRuleKo, 180) || fb.gripHandDominanceRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 8) 과거 회상(유년기/소년기)·현재·타임스킵 연령대별 두신비·하관·흉터 타임라인 고정기
export const AssistCharacterAgeFlashbackProportionLockSchema = z.object({
  childhoodHeadRatio: z.string(), adolescentHeadRatio: z.string(), adultCurrentHeadRatio: z.string(),
  facialEyeToJawRatioRuleKo: z.string(), scarAndMarkTimelineRuleKo: z.string(), flashbackColorGradingRuleKo: z.string(), directorNoteKo: z.string(),
});
export type AssistCharacterAgeFlashbackProportionLockOutput = z.infer<typeof AssistCharacterAgeFlashbackProportionLockSchema>;
export type AssistCharacterAgeFlashbackProportionLockView = AssistCharacterAgeFlashbackProportionLockOutput & Wave18ResultEnvelope;

export function buildDeterministicCharacterAgeFlashbackProportionLockView(timelineNoteKo = ""): AssistCharacterAgeFlashbackProportionLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-sonnet-5-5",
    childhoodHeadRatio: "5.2등신 (8세 유년기 · 어깨너비 머리 1.3배)",
    adolescentHeadRatio: "6.6등신 (15세 소년기 · 어깨너비 머리 1.7배)",
    adultCurrentHeadRatio: "7.8등신 (24세 성인 현재 · 어깨너비 머리 2.2배)",
    facialEyeToJawRatioRuleKo: "유년기는 눈 세로폭이 크고 코~턱 하관이 짧음(1:0.7) · 성인은 콧날과 하관 각도가 길어짐(1:1.15)",
    scarAndMarkTimelineRuleKo: cleanSingleLineText(timelineNoteKo, 120) || "15세 전쟁 에피소드 이전(8세 유년기 회상)에는 좌측 눈썹 자상 흉터가 절대 그려지지 않도록 타임라인 락 적용",
    flashbackColorGradingRuleKo: "과거 회상 컷은 채도 -18% 세피아 웜톤 + 상하단 부드러운 비네팅으로 현재 시점과 즉시 구분",
    directorNoteKo: "회상 컷에서 성인 체형에 얼굴만 어리게 그리거나 사건 발생 전 흉터를 미리 그리는 타임라인 오류를 차단하세요.",
    usage: EMPTY_ASSIST_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runAssistCharacterAgeFlashbackProportionLockDirector(
  timelineNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistCharacterAgeFlashbackProportionLockView> {
  const fb = buildDeterministicCharacterAgeFlashbackProportionLockView(timelineNoteKo);
  const res = await runWave18DomainConsistencyEngine(
    "domain:character-age-flashback-growth-proportion-lock",
    "당신은 웹툰 과거 회상(유년기/소년기)·현재·타임스킵 연령대별 두신비(Head Ratio)·안면 하관 비율·시대별 흉터 유무 타임라인 감독입니다. JSON으로 설계하세요.",
    `회상/타임스킵 설명: ${cleanSingleLineText(timelineNoteKo, 360) || "8세 유년기 아카데미 입학 전 회상과 15세 첫 출전(눈썹 흉터 발생), 24세 현재 시점이 교차되는 연출"}`,
    AssistCharacterAgeFlashbackProportionLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    childhoodHeadRatio: cleanSingleLineText(res.parsed.childhoodHeadRatio, 80) || fb.childhoodHeadRatio,
    adolescentHeadRatio: cleanSingleLineText(res.parsed.adolescentHeadRatio, 80) || fb.adolescentHeadRatio,
    adultCurrentHeadRatio: cleanSingleLineText(res.parsed.adultCurrentHeadRatio, 80) || fb.adultCurrentHeadRatio,
    facialEyeToJawRatioRuleKo: cleanSingleLineText(res.parsed.facialEyeToJawRatioRuleKo, 180) || fb.facialEyeToJawRatioRuleKo,
    scarAndMarkTimelineRuleKo: cleanSingleLineText(res.parsed.scarAndMarkTimelineRuleKo, 180) || fb.scarAndMarkTimelineRuleKo,
    flashbackColorGradingRuleKo: cleanSingleLineText(res.parsed.flashbackColorGradingRuleKo, 180) || fb.flashbackColorGradingRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 9) 전경(Out-of-focus)·중경(인물)·원경(보케) 3평면 피사계 심도(DoF) 블러 감독
export const AssistMultiPlaneParallaxBokehLockSchema = z.object({
  virtualLensMmAndFStop: z.string(), foregroundBlurRadiusPx: z.number(), midgroundSharpFocusRuleKo: z.string(),
  backgroundBokehRadiusPx: z.number(), bokehShapeAndHex: z.string(), chromaticAberrationRuleKo: z.string(), directorNoteKo: z.string(),
});
export type AssistMultiPlaneParallaxBokehLockOutput = z.infer<typeof AssistMultiPlaneParallaxBokehLockSchema>;
export type AssistMultiPlaneParallaxBokehLockView = AssistMultiPlaneParallaxBokehLockOutput & Wave18ResultEnvelope;

export function buildDeterministicMultiPlaneParallaxBokehLockView(depthSceneNoteKo = ""): AssistMultiPlaneParallaxBokehLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-opus-5-5",
    virtualLensMmAndFStop: "85mm 인물 망원 렌즈 · 조리개 f/1.8 얕은 피사계 심도 고정",
    foregroundBlurRadiusPx: 18,
    midgroundSharpFocusRuleKo: cleanSingleLineText(depthSceneNoteKo, 110) || "중경(피사체 눈동자·속눈썹·입술) 선화 샤프니스 100% 유지 — 가우시안 블러 침범 금지",
    backgroundBokehRadiusPx: 26,
    bokehShapeAndHex: "6각 조리개 하이라이트 보케 (#FDE047 웜골드 + #38BDF8 네온 시안 혼합)",
    chromaticAberrationRuleKo: "전경/원경 외곽 보케 경계에만 Red/Cyan 색수차 1.5px 적용 (중경 인물 얼굴에는 색수차 0px)",
    directorNoteKo: "전경(나뭇가지/어깨 실루엣 18px 블러) · 중경(0px 초점) · 원경(26px 보케) 3레이어 Z-Depth 수치를 시퀀스 내내 유지하세요.",
    usage: EMPTY_ASSIST_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runAssistMultiPlaneParallaxBokehLockDirector(
  depthSceneNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<AssistMultiPlaneParallaxBokehLockView> {
  const fb = buildDeterministicMultiPlaneParallaxBokehLockView(depthSceneNoteKo);
  const res = await runWave18DomainConsistencyEngine(
    "domain:multi-plane-parallax-depth-blur-bokeh-lock",
    "당신은 웹툰 3평면(전경 아웃포커싱·중경 인물 초점·원경 보케) 피사계 심도(DoF) 및 렌즈 블러 연속성 감독입니다. JSON으로 설계하세요.",
    `3평면 심도 연출 설명: ${cleanSingleLineText(depthSceneNoteKo, 360) || "전경 벚꽃 가지 너머로 중경 남녀 주인공의 시선이 교차하고 원경 야경 불빛이 보케로 맺히는 클라이맥스 컷"}`,
    AssistMultiPlaneParallaxBokehLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    virtualLensMmAndFStop: cleanSingleLineText(res.parsed.virtualLensMmAndFStop, 90) || fb.virtualLensMmAndFStop,
    foregroundBlurRadiusPx: clampInt(res.parsed.foregroundBlurRadiusPx, 4, 48, fb.foregroundBlurRadiusPx),
    midgroundSharpFocusRuleKo: cleanSingleLineText(res.parsed.midgroundSharpFocusRuleKo, 180) || fb.midgroundSharpFocusRuleKo,
    backgroundBokehRadiusPx: clampInt(res.parsed.backgroundBokehRadiusPx, 6, 64, fb.backgroundBokehRadiusPx),
    bokehShapeAndHex: cleanSingleLineText(res.parsed.bokehShapeAndHex, 140) || fb.bokehShapeAndHex,
    chromaticAberrationRuleKo: cleanSingleLineText(res.parsed.chromaticAberrationRuleKo, 180) || fb.chromaticAberrationRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}
