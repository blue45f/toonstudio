import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import {
  claudeModelInfo,
  claudeModelSupportsEffort,
  EMPTY_CLAUDE_TOKEN_USAGE,
  estimateClaudeCostUsd,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import {
  resolveCreatorTaskModelRoute,
  type ClaudeCreatorTaskId,
} from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  GlimnaviColorHintReportSchema,
  MangaFlowIdentityVerificationReportSchema,
  NovelAdaptationAndIpExpansionReportSchema,
  NovelAiMultiCharVibeReportSchema,
  Snaptoon3dEnvironmentShaderReportSchema,
  ToonCrafterInbetweenAndStitchReportSchema,
  type GlimnaviColorHintReport,
  type MangaFlowIdentityVerificationReport,
  type NovelAdaptationAndIpExpansionReport,
  type NovelAiMultiCharVibeReport,
  type Phase6EcosystemEnvelope,
  type Phase6EcosystemExecutionMeta,
  type Snaptoon3dEnvironmentShaderReport,
  type ToonCrafterInbetweenAndStitchReport,
} from "./claude-phase6-ecosystem-schemas";
import type {
  RunWebtoonProductionAssistOptions,
  WebtoonProductionAssistInput,
} from "./claude-webtoon-production-schemas";

export * from "./claude-phase6-ecosystem-schemas";

function resolveOrHydrateClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  const current = resolveClaudeRoute();
  if (current) return current;
  hydrateDefaultEnvClaudeConnection();
  return resolveClaudeRoute();
}

function buildEcosystemPromptContext(
  input: WebtoonProductionAssistInput,
  directiveKo: string,
): string {
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";
  const conflict =
    cleanSingleLineText(input.coreConflict ?? "봉인된 고대 유물의 각성과 두 주인공의 숙명적 대립", 160) ||
    "봉인된 고대 유물의 각성과 두 주인공의 숙명적 대립";
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const artistLabel = cleanSingleLineText(input.artistLabel ?? "K-웹툰 마스터 화풍", 60);
  const scriptSnippet = cleanSingleLineText(input.scriptText ?? "", 600);

  return [
    `장르: ${genre}`,
    `핵심 갈등: ${conflict}`,
    `주요 인물: ${protagonist}, ${partner} (관계성: ${input.relationshipDynamic ?? "fated-rivals"})`,
    `작가 화풍: ${artistLabel} (트리거: ${input.triggerWord ?? "ts_signature_webtoon"})`,
    ...(scriptSnippet ? [`현재 원고 대본: ${scriptSnippet}`] : []),
    "",
    directiveKo,
  ].join("\n");
}

function makeEnvelope<T>(
  report: T,
  source: "claude-live" | "local-fallback",
  meta: Phase6EcosystemExecutionMeta,
): Phase6EcosystemEnvelope<T> {
  return Object.freeze({
    source,
    report,
    modelUsed: meta.modelUsed,
    usage: meta.usage,
    estimatedCostUsd: meta.estimatedCostUsd,
    taskProfile: meta.taskProfile,
    routedModel: meta.routedModel,
    ...(meta.fallbackReason ? { fallbackReason: meta.fallbackReason } : {}),
    meta,
  });
}

async function executePhase6EcosystemEngine<TSchema extends z.ZodTypeAny>(params: {
  taskId: ClaudeCreatorTaskId;
  input: WebtoonProductionAssistInput;
  options: RunWebtoonProductionAssistOptions;
  systemPromptKo: string;
  userDirectiveKo: string;
  schema: TSchema;
  fallbackReport: z.infer<TSchema>;
}): Promise<Phase6EcosystemEnvelope<z.infer<TSchema>>> {
  const { taskId, input, options, systemPromptKo, userDirectiveKo, schema, fallbackReport } =
    params;
  const taskRoute = resolveCreatorTaskModelRoute(taskId, {
    model: options.model as never,
  });
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);

  if (!activeRoute) {
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude API 경로가 없어 결정적 로컬 폴백 엔진을 사용했습니다.",
    };
    return makeEnvelope(fallbackReport, "local-fallback", meta);
  }

  // 호출자가 options.model을 명시한 경우 우선하고, 아니면 Task-Aware Smart Model Router의 최적 티어 모델을 사용
  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || taskRoute.model,
  );

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: [
      {
        type: "text",
        text: systemPromptKo,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEcosystemPromptContext(input, userDirectiveKo),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel)
      ? { output_config: { effort: taskRoute.effort } }
      : {}),
  };

  try {
    const { message, parsed } = await claudeParse(activeRoute, request, schema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({
        model: requestedModel,
        request,
        schema,
      }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel =
      claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    const estimatedCostUsd = estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0;
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: actualModel,
      usage,
      estimatedCostUsd,
    };
    return makeEnvelope(parsed, "claude-live", meta);
  } catch (error) {
    if (options.fallbackOnError === false) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: cleanSingleLineText(reason, 220),
    };
    return makeEnvelope(fallbackReport, "local-fallback", meta);
  }
}

/* ============================================================================
 * 1. NovelAI V4.5 / V5 — 다중 캐릭터 X/Y 공간 좌표 분리 & Vibe Transfer 디렉터
 * ============================================================================ */

export function buildLocalNovelAiMultiCharVibeReport(
  input: WebtoonProductionAssistInput = {},
): NovelAiMultiCharVibeReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    sceneCompositionSummaryKo: `${protagonist}(좌측 전경 X:0.06~0.46)과 ${partner}(우측 중경 X:0.54~0.94)의 바운딩박스를 물리적으로 격리하여 다중 인물 머리색·의상 속성 혼선(Attribute Bleeding)을 원천 차단한 ${genre} 투샷 구도입니다.`,
    attributeBleedingZeroGuarantee: true,
    spatialOverlapRatioPct: 0,
    characterRegions: [
      {
        characterName: protagonist,
        roleLabelKo: "좌측 전경 주연 (리드 포커스)",
        bboxNormalized: { xMin: 0.06, yMin: 0.12, xMax: 0.46, yMax: 0.92 },
        positiveAppearanceTags: `${protagonist}, black long coat, silver shoulder pauldron, sharpobsidian eyes, glowing blue aura blade`,
        negativeBleedingGuardTags: "blonde hair, white dress, twin tails, gold staff",
        interactionVectorKo: `우측 상단(${partner} 방향)으로 검 끝과 시선을 고정`,
      },
      {
        characterName: partner,
        roleLabelKo: "우측 중경 파트너/대립자",
        bboxNormalized: { xMin: 0.54, yMin: 0.16, xMax: 0.94, yMax: 0.94 },
        positiveAppearanceTags: `${partner}, crimson cape, silver hair, golden crest uniform, defensive magic barrier`,
        negativeBleedingGuardTags: "black long coat, obsidian hair, blue blade",
        interactionVectorKo: `좌측 전경(${protagonist} 방향)의 참격을 마법 방벽으로 받아내는 역동적 시선`,
      },
    ],
    vibeTransfer: {
      vibeReferenceLabelKo: `${input.artistLabel ?? "K-웹툰 마스터 화풍"} 시그니처 역광 셀셰이딩 레퍼런스`,
      referenceStrength: 0.68,
      informationExtracted: 0.82,
      colorMoodLockHex: "#1E293B",
    },
    lorebookTriggers: [
      {
        keyword: protagonist,
        injectedWorldContextKo: `${protagonist}: 북부 흑랑 기사단 지휘관, 왼쪽 손목에 푸른 성흔 보유`,
        priorityOrder: 1,
      },
      {
        keyword: partner,
        injectedWorldContextKo: `${partner}: 황실 마탑의 최연소 수석 마도사, 붉은 금장 망토 착용`,
        priorityOrder: 2,
      },
    ],
  };
}

export async function runClaudeNovelAiMultiCharVibeDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<NovelAiMultiCharVibeReport>> {
  const fallbackReport = buildLocalNovelAiMultiCharVibeReport(input);
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:novelai-multi-char-vibe",
    input,
    options,
    systemPromptKo:
      "당신은 NovelAI V4.5/V5의 다중 캐릭터 X/Y 공간 좌표 프롬프팅(Multi-Character Spatial Coordinate Isolation)과 Vibe Transfer, Lorebook 트리거 설계를 총괄하는 웹툰 AI 디렉터입니다. " +
      "2인 이상 등장 컷에서 인물 간 머리색·의상·무기 속성이 섞이는 현상(Attribute Bleeding)을 방지하기 위해 정규화 바운딩박스(0~1)를 분리하고, Vibe Transfer(referenceStrength, informationExtracted) 및 Lorebook 키워드 주입 사양을 JSON으로 작성하세요.",
    userDirectiveKo:
      "위 에피소드의 핵심 투샷(2인 이상 대립/대화) 장면에 대해 NovelAI V4.5/V5 다중 캐릭터 X/Y 좌표 분리, Vibe Transfer 파라미터, Lorebook 트리거 명세를 JSON으로 생성해 주세요.",
    schema: NovelAiMultiCharVibeReportSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 2. MangaFlow Studio & DiffSensei — 캐릭터 동일성(ArcFace) & 말풍선 꼬리 디렉터
 * ============================================================================ */

export function buildLocalMangaFlowIdentityVerificationReport(
  input: WebtoonProductionAssistInput = {},
): MangaFlowIdentityVerificationReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    averageArcFaceScore: 0.93,
    identityPassRatePct: 100,
    diffSenseiAdapterSummaryKo: `Grounding DINO 얼굴 바운딩박스 검출 + ArcFace 임베딩 코사인 유사도 평균 0.93으로 ${protagonist}·${partner}의 다중 컷 얼굴·복장 동일성을 100% 통과했으며, 화자 입 좌표를 향해 말풍선 꼬리 벡터를 정밀 정렬했습니다.`,
    cutAudits: [
      {
        cutNumber: 1,
        speakerName: protagonist,
        groundingDinoFaceBox: { x: 0.24, y: 0.22, w: 0.26, h: 0.28 },
        arcFaceSimilarityScore: 0.95,
        mllmIdentityAdapterWeight: 0.88,
        outfitContinuityPass: true,
        balloonAnchorXY: { x: 0.18, y: 0.1 },
        speakerMouthTargetXY: { x: 0.36, y: 0.38 },
        correctivePromptKo: `${protagonist} 안면 특징점(눈매·턱선) 및 왼쪽 어깨 견장 디테일 유지 양호`,
      },
      {
        cutNumber: 2,
        speakerName: partner,
        groundingDinoFaceBox: { x: 0.58, y: 0.26, w: 0.24, h: 0.26 },
        arcFaceSimilarityScore: 0.92,
        mllmIdentityAdapterWeight: 0.9,
        outfitContinuityPass: true,
        balloonAnchorXY: { x: 0.78, y: 0.12 },
        speakerMouthTargetXY: { x: 0.68, y: 0.41 },
        correctivePromptKo: `${partner} 은발 레이어드 컷 및 붉은 망토 브로치 좌우 반전 방지 락 적용`,
      },
      {
        cutNumber: 3,
        speakerName: protagonist,
        groundingDinoFaceBox: { x: 0.32, y: 0.18, w: 0.34, h: 0.36 },
        arcFaceSimilarityScore: 0.92,
        mllmIdentityAdapterWeight: 0.91,
        outfitContinuityPass: true,
        balloonAnchorXY: { x: 0.22, y: 0.08 },
        speakerMouthTargetXY: { x: 0.48, y: 0.39 },
        correctivePromptKo: `익스트림 클로즈업에서도 ${protagonist} 홍채 채도와 흉터 위치 고정`,
      },
    ],
  };
}

export async function runClaudeMangaFlowIdentityVerificationDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<MangaFlowIdentityVerificationReport>> {
  const fallbackReport = buildLocalMangaFlowIdentityVerificationReport(input);
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:mangaflow-identity-verification",
    input,
    options,
    systemPromptKo:
      "당신은 MangaFlow Studio와 DiffSensei 아키텍처(Grounding DINO + ArcFace/FaceNet + MLLM Identity Adapter) 기반의 다중 컷 캐릭터 동일성 검증 및 말풍선 꼬리 벡터 디렉터입니다. " +
      "컷별 캐릭터 얼굴 바운딩박스, ArcFace 동일성 점수(0~1), 복장 연속성 여부, 말풍선 중심 좌표에서 화자의 입(Mouth) 좌표를 향하는 꼬리 타깃 좌표를 JSON으로 설계하세요.",
    userDirectiveKo:
      "위 에피소드의 주요 3~4컷에 대해 Grounding DINO 얼굴 영역, ArcFace 동일성 점수, MLLM 어댑터 가중치, 화자 입 위치 기반 말풍선 꼬리 좌표를 JSON으로 생성해 주세요.",
    schema: MangaFlowIdentityVerificationReportSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 3. 그림나비 (Glimnavi, 와이즈허브) — 브러시 컬러 힌트 스트로크 자동 채색 디렉터
 * ============================================================================ */

export function buildLocalGlimnaviColorHintReport(
  input: WebtoonProductionAssistInput = {},
): GlimnaviColorHintReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    closeGapTolerancePx: 5,
    coloringTimeSavedEstPct: 79,
    humanInTheLoopGuideKo: `선화 레이어의 미세 끊김 구간을 5px Close-Gap 허용치로 자동 봉합한 뒤, ${protagonist}·${partner}의 주요 파츠에 브러시 컬러 힌트 스트로크 4개를 배치해 밑색·앰비언트 오클루전·셀 그림자·림라이트를 번짐 없이 분리 채색합니다.`,
    hintStrokes: [
      {
        strokeId: "hint-skin-main",
        targetRegionLabelKo: `${protagonist} 안면 및 목 피부 베이스`,
        targetLayer: "base-flat",
        hexColor: "#FDE6D8",
        brushRadiusPx: 14,
        strokePathNormalized: { startX: 0.32, startY: 0.24, endX: 0.36, endY: 0.31 },
        leakPreventionConfidence: 0.98,
      },
      {
        strokeId: "hint-coat-main",
        targetRegionLabelKo: `${protagonist} 흑색 롱코트 메인 파츠`,
        targetLayer: "base-flat",
        hexColor: "#1E293B",
        brushRadiusPx: 22,
        strokePathNormalized: { startX: 0.26, startY: 0.48, endX: 0.38, endY: 0.74 },
        leakPreventionConfidence: 0.96,
      },
      {
        strokeId: "hint-shadow-cel",
        targetRegionLabelKo: `${protagonist} 턱 밑 및 코트 접힘부 1단 셀 그림자`,
        targetLayer: "cel-shadow",
        hexColor: "#334155",
        brushRadiusPx: 12,
        strokePathNormalized: { startX: 0.34, startY: 0.35, endX: 0.41, endY: 0.58 },
        leakPreventionConfidence: 0.94,
      },
      {
        strokeId: "hint-rim-magic",
        targetRegionLabelKo: `${partner} 마법진 역광 림 하이라이트`,
        targetLayer: "rim-highlight",
        hexColor: "#38BDF8",
        brushRadiusPx: 8,
        strokePathNormalized: { startX: 0.56, startY: 0.22, endX: 0.59, endY: 0.62 },
        leakPreventionConfidence: 0.95,
      },
    ],
  };
}

export async function runClaudeGlimnaviColorHintStrokeDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<GlimnaviColorHintReport>> {
  const fallbackReport = buildLocalGlimnaviColorHintReport(input);
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:glimnavi-color-hint-stroke",
    input,
    options,
    systemPromptKo:
      "당신은 한국형 웹툰 AI 솔루션 그림나비(Glimnavi)의 휴먼인더루프(Human-in-the-loop) 브러시 컬러 힌트 스트로크 자동 채색 디렉터입니다. " +
      "작가의 펜선 끊김(Close-Gap) 허용 픽셀과 주요 파츠별 색상 힌트 브러시 스트로크 좌표(0~1), HEX 컬러, 분리 레이어(base-flat, ambient-occlusion, cel-shadow, rim-highlight)를 JSON으로 설계하세요.",
    userDirectiveKo:
      "위 에피소드 핵심 컷의 선화 자동 채색을 위한 Close-Gap 허용치(px)와 파츠별 브러시 컬러 힌트 스트로크 명세를 JSON으로 생성해 주세요.",
    schema: GlimnaviColorHintReportSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 4. 스냅툰 (Snaptoon) & 에이콘3D (ACON3D) — 3D 배경 툰셰이더·환경광 디렉터
 * ============================================================================ */

export function buildLocalSnaptoon3dEnvironmentShaderReport(
  input: WebtoonProductionAssistInput = {},
): Snaptoon3dEnvironmentShaderReport {
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    masterEnvironmentSummaryKo: `${genre} 장르에 맞춘 에이콘3D(ACON3D) 배경 에셋과 스냅툰(Snaptoon) 실시간 툰셰이더 프리셋을 결합하여, 시간대별 태양광 방위각·창문 발광(Window Glow)·수심 안개(Depth Fog)와 2D 캐릭터 신장(178cm) 원근 매칭을 자동 동기화했습니다.`,
    sketchupToSnaptoonBridgeNoteKo:
      "스케치업(.skp) 레이어 태그에서 유리창 재질을 자동 분리해 야간 Window Glow 채널에 연결하고, 그림자 경계선 경도(Hardness)를 0.82로 고정해 2D 셀 작화와 이질감을 없앱니다.",
    cutEnvironments: [
      {
        cutNumber: 1,
        acon3dAssetPackKo: "ACON3D 황궁 대성당 & 고딕 회랑 풀패키지",
        savedCameraBookmarkId: "cam-cathedral-low-wide-24mm",
        timeOfDayPreset: "sunset-golden",
        sunAzimuthDeg: 245,
        sunElevationDeg: 18,
        toonShadowHardness: 0.82,
        windowGlowIntensity: 0.65,
        bloomIntensity: 0.42,
        depthFogDensity: 0.24,
        characterHeadHeightMatchCm: 180,
        compositingTipKo: "스테인드글라스 투과광 레이어를 Screen 45%로 캐릭터 어깨 외곽에 클리핑",
      },
      {
        cutNumber: 2,
        acon3dAssetPackKo: "ACON3D 지하 봉인 제단 & 고대 유적 던전",
        savedCameraBookmarkId: "cam-altar-dutch-tilt-35mm",
        timeOfDayPreset: "dungeon-torch",
        sunAzimuthDeg: 120,
        sunElevationDeg: -10,
        toonShadowHardness: 0.88,
        windowGlowIntensity: 0.85,
        bloomIntensity: 0.58,
        depthFogDensity: 0.46,
        characterHeadHeightMatchCm: 172,
        compositingTipKo: "제단 하단 청색 발광(Glow)과 깊이 안개(Depth Fog)로 전경 인물 실루엣 분리",
      },
    ],
  };
}

export async function runClaudeSnaptoon3dEnvironmentShaderDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<Snaptoon3dEnvironmentShaderReport>> {
  const fallbackReport = buildLocalSnaptoon3dEnvironmentShaderReport(input);
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:snaptoon-3d-environment-shader",
    input,
    options,
    systemPromptKo:
      "당신은 스냅툰(Snaptoon)과 에이콘3D(ACON3D) 웹툰 3D 배경 렌더링을 총괄하는 배경·조명 디렉터입니다. " +
      "컷별 ACON3D 에셋 팩, 저장된 카메라 뷰 북마크 ID, 시간대 프리셋, 태양광 방위각/고도각, 툰 그림자 경도, 창문 발광(Window Glow), 블룸(Bloom), 안개(Fog), 2D 캐릭터 신장(cm) 매칭 수치를 JSON으로 설계하세요.",
    userDirectiveKo:
      "위 에피소드의 주요 배경 전환 컷들에 대해 스냅툰 툰셰이더·환경광 파라미터와 에이콘3D 카메라 북마크 매칭 사양을 JSON으로 생성해 주세요.",
    schema: Snaptoon3dEnvironmentShaderReportSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 5. 더컬쳐툰·마이닝5000·Storyflow — 웹소설 각색 & 2차 IP OSMU 디렉터
 * ============================================================================ */

export function buildLocalNovelAdaptationAndIpExpansionReport(
  input: WebtoonProductionAssistInput = {},
): NovelAdaptationAndIpExpansionReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    storyArchetype: "regression-revenge",
    overallProseCompressionPct: 74,
    narrativePacingVerdictKo: `원작 웹소설의 장문 내면 독백을 74% 압축하여 'Show, Don't Tell' 시각 액션 비트로 전환했으며, 회귀 복수극 아키타입에 맞춰 3컷 이내 초반 훅과 클리프행어 여백(1,100px)을 배치했습니다.`,
    adaptedBeats: [
      {
        beatNumber: 1,
        originalProseSummaryKo: `${protagonist}이 과거 배신당했던 기억을 떠올리며 속으로 분노를 삼키는 3문단 독백`,
        visualShowDontTellActionKo: `부서진 회중시계를 쥔 ${protagonist}의 손등 핏줄 익스트림 클로즈업과 차갑게 가라앉은 눈빛`,
        adaptedBubbleDialogueKo: "이번 생엔, 단 한 명도 놓치지 않는다.",
        monologueCompressionPct: 78,
        recommendedScrollGapPx: 420,
      },
      {
        beatNumber: 2,
        originalProseSummaryKo: `${partner}이 ${protagonist}의 달라진 기세를 느끼고 경계하며 마력을 끌어올리는 묘사`,
        visualShowDontTellActionKo: `${partner}의 발밑에서 퍼져 나가는 푸른 마법진 파동과 바람에 흩날리는 망토 로우앵글`,
        adaptedBubbleDialogueKo: "당신… 내가 알던 그 사람이 아니군요.",
        monologueCompressionPct: 70,
        recommendedScrollGapPx: 1100,
      },
    ],
    osmuExpansionScores: [
      {
        mediaFormat: "k-drama-series",
        readinessScore: 94,
        keySellingPointKo: `${protagonist}·${partner}의 혐관→공조 감정선과 명확한 에피소드 엔딩 훅으로 12부작 OTT 드라마 각색 최적`,
        adaptationBottleneckKo: "대규모 마법 결전 씬의 VFX 예산을 중반부 실내 정치 암투 씬과 균형 배분 필요",
      },
      {
        mediaFormat: "ott-animation",
        readinessScore: 96,
        keySellingPointKo: "레이어 분리된 이펙트와 속도감 있는 액션 비트 덕분에 시즌제 애니메이션 콘티로 즉시 전환 가능",
        adaptationBottleneckKo: "복잡한 제복 장식 문양을 애니메이션 작화용 2단 셰이딩 시트로 단순화 권장",
      },
      {
        mediaFormat: "audio-drama",
        readinessScore: 91,
        keySellingPointKo: "캐릭터 간 뚜렷한 보이스 레지스터 대비와 효과음(SFX) 큐시트 연동으로 몰입형 오디오툰 제작 용이",
        adaptationBottleneckKo: "비언어적 시선 교환 컷에 짧은 폴리 사운드(칼집 마찰음·발걸음) 보강 필요",
      },
    ],
  };
}

export async function runClaudeNovelAdaptationAndIpExpansionDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<NovelAdaptationAndIpExpansionReport>> {
  const fallbackReport = buildLocalNovelAdaptationAndIpExpansionReport(input);
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:novel-adaptation-ip-expansion",
    input,
    options,
    systemPromptKo:
      "당신은 더컬쳐툰(The Culture Toon), 마이닝5000(Mining5000), Storyflow의 웹소설→웹툰 각색 및 2차 IP(OSMU) 확장 분석을 총괄하는 수석 스토리 아키텍트입니다. " +
      "원작 산문의 장문 독백을 시각적 연출(Show, Don't Tell)과 간결한 말풍선 대사로 압축하고, 서사 아키타입 분류 및 드라마·애니메이션·오디오드라마 등 2차 IP 확장성 스코어카드를 JSON으로 작성하세요.",
    userDirectiveKo:
      "위 에피소드 대본/갈등을 기반으로 웹소설→웹툰 비트 각색표(독백 압축률·시각 액션·권장 스크롤 여백)와 2차 IP OSMU 확장성 평가표를 JSON으로 생성해 주세요.",
    schema: NovelAdaptationAndIpExpansionReportSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 6. ToonCrafter & AniDoc & Krita/Comistitch — 인비트윈 동화 & 세로 스티칭 디렉터
 * ============================================================================ */

export function buildLocalToonCrafterInbetweenAndStitchReport(
  input: WebtoonProductionAssistInput = {},
): ToonCrafterInbetweenAndStitchReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";

  return {
    totalStitchedHeightPx: 9_600,
    zeroBubbleSliceGuarantee: true,
    productionSummaryKo: `ToonCrafter 키프레임 보간과 AniDoc 컬러 전파 락으로 ${protagonist}의 발도술 액션 중간 동화 8프레임을 일관된 채색으로 생성하고, Krita AI Diffusion 아웃페인팅 및 Comistitch 여백(Gutter) 안전 분할선으로 말풍선 잘림 0건을 보장했습니다.`,
    inbetweenBridges: [
      {
        bridgeId: "bridge-slash-01",
        startKeyframeCut: 1,
        endKeyframeCut: 2,
        inbetweenFrameCount: 8,
        motionCurveType: "impact-snap",
        anidocColorReferenceLock: true,
        occlusionRepairGuideKo: `${protagonist}의 오른팔 뒤로 가려지는 망토 안감 영역을 AniDoc 턴어라운드 컬러 시트 기준으로 복원`,
      },
      {
        bridgeId: "bridge-camera-pan-02",
        startKeyframeCut: 2,
        endKeyframeCut: 3,
        inbetweenFrameCount: 6,
        motionCurveType: "ease-in-out",
        anidocColorReferenceLock: true,
        occlusionRepairGuideKo: "배경 기둥 패럴랙스 이동 시 발생하는 외곽선 끊김을 Krita ControlNet Lineart로 보정",
      },
    ],
    comistitchSlices: [
      {
        sliceIndex: 1,
        startYPx: 0,
        endYPx: 4_800,
        safeSplitInGutterConfirmed: true,
        kritaOutpaintTransitionPromptKo: "검은 안개에서 황궁 대리석 바닥으로 이어지는 수직 그라데이션 아웃페인팅",
      },
      {
        sliceIndex: 2,
        startYPx: 4_800,
        endYPx: 9_600,
        safeSplitInGutterConfirmed: true,
        kritaOutpaintTransitionPromptKo: "클리프행어 암전 여백(1,100px) 구간에 미세한 마력 입자 잔광 추가",
      },
    ],
  };
}

export async function runClaudeToonCrafterInbetweenAndStitchDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<ToonCrafterInbetweenAndStitchReport>> {
  const fallbackReport = buildLocalToonCrafterInbetweenAndStitchReport(input);
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:tooncrafter-inbetween-stitch",
    input,
    options,
    systemPromptKo:
      "당신은 ToonCrafter, AniDoc, Krita AI Diffusion, Comistitch를 결합한 모션웹툰 인비트윈 동화 보간 및 세로 스크롤 무한 캔버스 스티칭 디렉터입니다. " +
      "시작·끝 키프레임 사이의 중간 동화 프레임 수와 모션 커브, AniDoc 컬러 전파 락, Krita 아웃페인팅 프롬프트, 말풍선이 절대 잘리지 않는 Comistitch 안전 분할 Y좌표를 JSON으로 설계하세요.",
    userDirectiveKo:
      "위 에피소드의 핵심 액션 전환 구간에 대해 ToonCrafter/AniDoc 인비트윈 브리지 명세와 Krita/Comistitch 세로 스크롤 안전 분할 명세를 JSON으로 생성해 주세요.",
    schema: ToonCrafterInbetweenAndStitchReportSchema,
    fallbackReport,
  });
}
