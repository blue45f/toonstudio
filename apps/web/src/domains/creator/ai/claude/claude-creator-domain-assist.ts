/**
 * claude-creator-domain-assist.ts
 *
 * Phase 3 크리에이터 핵심 도메인(캐릭터 캐논 · 프롬프트 증강 · 2D 셀 음영/조명 · 말투 지문 OOC 교정)
 * Claude 구조화 출력(`claudeParse`) 및 로컬 결정적 폴백 통합 엔진.
 */
import { z } from "zod";

import {
  CLAUDE_DEFAULT_MODEL_ID,
  claudeModelInfo,
  claudeModelSupportsEffort,
  EMPTY_CLAUDE_TOKEN_USAGE,
  estimateClaudeCostUsd,
  type ClaudeTokenUsage,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

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

import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import { clampInt, type RunWebtoonProductionAssistOptions } from "./claude-webtoon-production-schemas";

import type Anthropic from "@anthropic-ai/sdk";

const MAX_OUTPUT_TOKENS = 3_200;

function resolveOrHydrateClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  const current = resolveClaudeRoute();
  if (current) return current;
  hydrateDefaultEnvClaudeConnection();
  return resolveClaudeRoute();
}

function safeHex(raw: string, fallback: string): string {
  const cleaned = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/u.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

// ── 1. 캐릭터 캐논 시트 AI 아키텍트 (`runClaudeCharacterCanonArchitect`) ───────────────

export const ClaudeCharacterCanonArchitectSchema = z.object({
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
  readonly usage: ClaudeTokenUsage;
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
    usage: EMPTY_CLAUDE_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export async function runClaudeCharacterCanonArchitect(
  input: CharacterCanonArchitectInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CharacterCanonArchitectView> {
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicCharacterCanonView(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveClaudeRequestModel(
    options.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
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
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeCharacterCanonArchitectSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeCharacterCanonArchitectSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toClaudeTokenUsage(message.usage);
    return Object.freeze({
      source: "claude-live",
      model: claudeModelInfo(actualModel)?.id ?? actualModel,
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
      estimatedUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicCharacterCanonView(input);
    }
    throw error;
  }
}

// ── 2. 웹툰 프롬프트 증강 & 카메라/조명 앵커 생성기 (`runClaudePromptEnhancer`) ─────────

export const ClaudePromptEnhancerSchema = z.object({
  detectedGenre: z.enum(["action", "romance", "fantasy", "slice-of-life", "horror"]),
  enhancedPositivePrompt: z.string(),
  recommendedNegativePrompt: z.string(),
  cameraAndLensTag: z.string(),
  lightingAndColorTag: z.string(),
  keywordsAdded: z.array(z.string()),
});

export interface ClaudeEnhancedPromptView extends EnhancedPromptResult {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly cameraAndLensTag: string;
  readonly lightingAndColorTag: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicEnhancedPromptView(
  rawPrompt: string,
  options: PromptEnhancementOptions = {},
): ClaudeEnhancedPromptView {
  const enhancer = new StudioAiPromptEnhancer();
  const base = enhancer.enhance(rawPrompt, options);
  return Object.freeze({
    ...base,
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    cameraAndLensTag: "35mm cinematic webtoon framing, clean vertical scroll composition",
    lightingAndColorTag: "L3 multiply cel shading 60%, crisp rim light highlight, color-hold ink lineart",
    usage: EMPTY_CLAUDE_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export async function runClaudePromptEnhancer(
  rawPrompt: string,
  enhanceOptions: PromptEnhancementOptions = {},
  runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeEnhancedPromptView> {
  const activeRoute = resolveOrHydrateClaudeRoute(runOptions.route);
  if (!activeRoute) {
    if (runOptions.fallbackOnError !== false) {
      return buildDeterministicEnhancedPromptView(rawPrompt, enhanceOptions);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveClaudeRequestModel(
    runOptions.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
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
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudePromptEnhancerSchema,
      {
        signal: runOptions.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudePromptEnhancerSchema,
        }),
        budgetOverride: runOptions.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toClaudeTokenUsage(message.usage);
    const detectedGenre: PromptGenreHint = enhanceOptions.genre ?? parsed.detectedGenre;
    return Object.freeze({
      source: "claude-live",
      model: claudeModelInfo(actualModel)?.id ?? actualModel,
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
      estimatedUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (runOptions.fallbackOnError !== false && !runOptions.signal?.aborted) {
      return buildDeterministicEnhancedPromptView(rawPrompt, enhanceOptions);
    }
    throw error;
  }
}

// ── 3. 장면 맥락 기반 2단 셀 음영 & 림라이트 디렉터 (`runClaudeSceneShadingDirector`) ────

export const ClaudeSceneShadingSchema = z.object({
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

export interface ClaudeSceneShadingView extends ComputedShadingParams {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly colorHoldInkHex: string;
  readonly subsurfaceScatterHex: string;
  readonly coloristCoachingKo: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicSceneShadingView(
  config: LightSourceConfig,
): ClaudeSceneShadingView {
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
    usage: EMPTY_CLAUDE_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export async function runClaudeSceneShadingDirector(
  config: LightSourceConfig,
  sceneDescriptionKo = "",
  runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeSceneShadingView> {
  const activeRoute = resolveOrHydrateClaudeRoute(runOptions.route);
  if (!activeRoute) {
    if (runOptions.fallbackOnError !== false) return buildDeterministicSceneShadingView(config);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveClaudeRequestModel(
    runOptions.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
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
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeSceneShadingSchema,
      {
        signal: runOptions.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeSceneShadingSchema,
        }),
        budgetOverride: runOptions.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toClaudeTokenUsage(message.usage);
    return Object.freeze({
      ...base,
      source: "claude-live",
      model: claudeModelInfo(actualModel)?.id ?? actualModel,
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
      estimatedUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (runOptions.fallbackOnError !== false && !runOptions.signal?.aborted) {
      return buildDeterministicSceneShadingView(config);
    }
    throw error;
  }
}
