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

import {
  resolveCreatorTaskModelRoute,
  type ClaudeCreatorTaskId,
} from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  AsymmetricCostumePropWoundLedgerReportSchema,
  CameraAxisEyelineHeightLockReportSchema,
  CollarTieLapelNecklineLockReportSchema,
  CompanionFamiliarScaleLockReportSchema,
  CrossCutColorScriptAlbedoLockReportSchema,
  GlimnaviColorHintReportSchema,
  InteriorRoomGeographyLockReportSchema,
  MangaFlowIdentityVerificationReportSchema,
  MicroExpressionActingContinuityReportSchema,
  NovelAdaptationAndIpExpansionReportSchema,
  NovelAiMultiCharVibeReportSchema,
  ScrollPaceSilentBeatRhythmReportSchema,
  Snaptoon3dEnvironmentShaderReportSchema,
  SubsurfaceScatteringTearSpecularLockReportSchema,
  TattooStigmaUvTopologyLockReportSchema,
  ToonCrafterInbetweenAndStitchReportSchema,
  type AsymmetricCostumePropWoundLedgerReport,
  type CameraAxisEyelineHeightLockReport,
  type CollarTieLapelNecklineLockReport,
  type CompanionFamiliarScaleLockReport,
  type CrossCutColorScriptAlbedoLockReport,
  type GlimnaviColorHintReport,
  type InteriorRoomGeographyLockReport,
  type MangaFlowIdentityVerificationReport,
  type MicroExpressionActingContinuityReport,
  type NovelAdaptationAndIpExpansionReport,
  type NovelAiMultiCharVibeReport,
  type Phase6EcosystemEnvelope,
  type Phase6EcosystemExecutionMeta,
  type ScrollPaceSilentBeatRhythmReport,
  type Snaptoon3dEnvironmentShaderReport,
  type SubsurfaceScatteringTearSpecularLockReport,
  type TattooStigmaUvTopologyLockReport,
  type ToonCrafterInbetweenAndStitchReport,
} from "./claude-phase6-ecosystem-schemas";
import type {
  RunWebtoonProductionAssistOptions,
  WebtoonProductionAssistInput,
} from "./claude-webtoon-production-schemas";

export * from "./claude-phase6-ecosystem-schemas";

function resolveActiveClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
  return explicit ?? resolveClaudeRoute();
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
  const { taskId, input, options, systemPromptKo, userDirectiveKo, schema, fallbackReport } = params;
  const taskRoute = resolveCreatorTaskModelRoute(taskId, { model: options.model as never });
  const activeRoute = resolveActiveClaudeRoute(options.route);

  if (!activeRoute) {
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "사용할 수 있는 AI 경로가 없어 결정적 로컬 폴백 엔진을 사용했습니다.",
    };
    return makeEnvelope(fallbackReport, "local-fallback", meta);
  }

  // 호출자가 options.model을 명시한 경우 우선하고, 아니면 Task-Aware Smart Model Router의 최적 티어 모델을 사용
  const requestedModel = resolveClaudeRequestModel(options.model ?? taskRoute.model, activeRoute.model || taskRoute.model);

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: [{ type: "text", text: systemPromptKo, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildEcosystemPromptContext(input, userDirectiveKo) }],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: taskRoute.effort } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(activeRoute, request, schema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
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
      { characterName: protagonist, roleLabelKo: "좌측 전경 주연 (리드 포커스)", bboxNormalized: { xMin: 0.06, yMin: 0.12, xMax: 0.46, yMax: 0.92 }, positiveAppearanceTags: `${protagonist}, black long coat, silver shoulder pauldron, sharpobsidian eyes, glowing blue aura blade`, negativeBleedingGuardTags: "blonde hair, white dress, twin tails, gold staff", interactionVectorKo: `우측 상단(${partner} 방향)으로 검 끝과 시선을 고정` },
      { characterName: partner, roleLabelKo: "우측 중경 파트너/대립자", bboxNormalized: { xMin: 0.54, yMin: 0.16, xMax: 0.94, yMax: 0.94 }, positiveAppearanceTags: `${partner}, crimson cape, silver hair, golden crest uniform, defensive magic barrier`, negativeBleedingGuardTags: "black long coat, obsidian hair, blue blade", interactionVectorKo: `좌측 전경(${protagonist} 방향)의 참격을 마법 방벽으로 받아내는 역동적 시선` },
    ],
    vibeTransfer: {
      vibeReferenceLabelKo: `${input.artistLabel ?? "K-웹툰 마스터 화풍"} 시그니처 역광 셀셰이딩 레퍼런스`,
      referenceStrength: 0.68,
      informationExtracted: 0.82,
      colorMoodLockHex: "#1E293B",
    },
    lorebookTriggers: [
      { keyword: protagonist, injectedWorldContextKo: `${protagonist}: 북부 흑랑 기사단 지휘관, 왼쪽 손목에 푸른 성흔 보유`, priorityOrder: 1 },
      { keyword: partner, injectedWorldContextKo: `${partner}: 황실 마탑의 최연소 수석 마도사, 붉은 금장 망토 착용`, priorityOrder: 2 },
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
      { cutNumber: 1, speakerName: protagonist, groundingDinoFaceBox: { x: 0.24, y: 0.22, w: 0.26, h: 0.28 }, arcFaceSimilarityScore: 0.95, mllmIdentityAdapterWeight: 0.88, outfitContinuityPass: true, balloonAnchorXY: { x: 0.18, y: 0.1 }, speakerMouthTargetXY: { x: 0.36, y: 0.38 }, correctivePromptKo: `${protagonist} 안면 특징점(눈매·턱선) 및 왼쪽 어깨 견장 디테일 유지 양호` },
      { cutNumber: 2, speakerName: partner, groundingDinoFaceBox: { x: 0.58, y: 0.26, w: 0.24, h: 0.26 }, arcFaceSimilarityScore: 0.92, mllmIdentityAdapterWeight: 0.9, outfitContinuityPass: true, balloonAnchorXY: { x: 0.78, y: 0.12 }, speakerMouthTargetXY: { x: 0.68, y: 0.41 }, correctivePromptKo: `${partner} 은발 레이어드 컷 및 붉은 망토 브로치 좌우 반전 방지 락 적용` },
      { cutNumber: 3, speakerName: protagonist, groundingDinoFaceBox: { x: 0.32, y: 0.18, w: 0.34, h: 0.36 }, arcFaceSimilarityScore: 0.92, mllmIdentityAdapterWeight: 0.91, outfitContinuityPass: true, balloonAnchorXY: { x: 0.22, y: 0.08 }, speakerMouthTargetXY: { x: 0.48, y: 0.39 }, correctivePromptKo: `익스트림 클로즈업에서도 ${protagonist} 홍채 채도와 흉터 위치 고정` },
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
      "당신은 MangaFlow Studio와 DiffSensei 아키텍처(Grounding DINO + ArcFace/FaceNet + MLLM Identity Adapter) 기반의 다중 컷 캐릭터 동일성 검증 및 말풍선 꼬리 벡터 디렉터입니다. 컷별 캐릭터 얼굴 바운딩박스, ArcFace 동일성 점수(0~1), 복장 연속성 여부, 말풍선 중심 좌표에서 화자의 입(Mouth) 좌표를 향하는 꼬리 타깃 좌표를 JSON으로 설계하세요.",
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
      { strokeId: "hint-skin-main", targetRegionLabelKo: `${protagonist} 안면 및 목 피부 베이스`, targetLayer: "base-flat", hexColor: "#FDE6D8", brushRadiusPx: 14, strokePathNormalized: { startX: 0.32, startY: 0.24, endX: 0.36, endY: 0.31 }, leakPreventionConfidence: 0.98 },
      { strokeId: "hint-coat-main", targetRegionLabelKo: `${protagonist} 흑색 롱코트 메인 파츠`, targetLayer: "base-flat", hexColor: "#1E293B", brushRadiusPx: 22, strokePathNormalized: { startX: 0.26, startY: 0.48, endX: 0.38, endY: 0.74 }, leakPreventionConfidence: 0.96 },
      { strokeId: "hint-shadow-cel", targetRegionLabelKo: `${protagonist} 턱 밑 및 코트 접힘부 1단 셀 그림자`, targetLayer: "cel-shadow", hexColor: "#334155", brushRadiusPx: 12, strokePathNormalized: { startX: 0.34, startY: 0.35, endX: 0.41, endY: 0.58 }, leakPreventionConfidence: 0.94 },
      { strokeId: "hint-rim-magic", targetRegionLabelKo: `${partner} 마법진 역광 림 하이라이트`, targetLayer: "rim-highlight", hexColor: "#38BDF8", brushRadiusPx: 8, strokePathNormalized: { startX: 0.56, startY: 0.22, endX: 0.59, endY: 0.62 }, leakPreventionConfidence: 0.95 },
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
      "당신은 한국형 웹툰 AI 솔루션 그림나비(Glimnavi)의 휴먼인더루프(Human-in-the-loop) 브러시 컬러 힌트 스트로크 자동 채색 디렉터입니다. 작가의 펜선 끊김(Close-Gap) 허용 픽셀과 주요 파츠별 색상 힌트 브러시 스트로크 좌표(0~1), HEX 컬러, 분리 레이어(base-flat, ambient-occlusion, cel-shadow, rim-highlight)를 JSON으로 설계하세요.",
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
      { cutNumber: 1, acon3dAssetPackKo: "ACON3D 황궁 대성당 & 고딕 회랑 풀패키지", savedCameraBookmarkId: "cam-cathedral-low-wide-24mm", timeOfDayPreset: "sunset-golden", sunAzimuthDeg: 245, sunElevationDeg: 18, toonShadowHardness: 0.82, windowGlowIntensity: 0.65, bloomIntensity: 0.42, depthFogDensity: 0.24, characterHeadHeightMatchCm: 180, compositingTipKo: "스테인드글라스 투과광 레이어를 Screen 45%로 캐릭터 어깨 외곽에 클리핑" },
      { cutNumber: 2, acon3dAssetPackKo: "ACON3D 지하 봉인 제단 & 고대 유적 던전", savedCameraBookmarkId: "cam-altar-dutch-tilt-35mm", timeOfDayPreset: "dungeon-torch", sunAzimuthDeg: 120, sunElevationDeg: -10, toonShadowHardness: 0.88, windowGlowIntensity: 0.85, bloomIntensity: 0.58, depthFogDensity: 0.46, characterHeadHeightMatchCm: 172, compositingTipKo: "제단 하단 청색 발광(Glow)과 깊이 안개(Depth Fog)로 전경 인물 실루엣 분리" },
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
      "당신은 스냅툰(Snaptoon)과 에이콘3D(ACON3D) 웹툰 3D 배경 렌더링을 총괄하는 배경·조명 디렉터입니다. 컷별 ACON3D 에셋 팩, 저장된 카메라 뷰 북마크 ID, 시간대 프리셋, 태양광 방위각/고도각, 툰 그림자 경도, 창문 발광(Window Glow), 블룸(Bloom), 안개(Fog), 2D 캐릭터 신장(cm) 매칭 수치를 JSON으로 설계하세요.",
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
      { beatNumber: 1, originalProseSummaryKo: `${protagonist}이 과거 배신당했던 기억을 떠올리며 속으로 분노를 삼키는 3문단 독백`, visualShowDontTellActionKo: `부서진 회중시계를 쥔 ${protagonist}의 손등 핏줄 익스트림 클로즈업과 차갑게 가라앉은 눈빛`, adaptedBubbleDialogueKo: "이번 생엔, 단 한 명도 놓치지 않는다.", monologueCompressionPct: 78, recommendedScrollGapPx: 420 },
      { beatNumber: 2, originalProseSummaryKo: `${partner}이 ${protagonist}의 달라진 기세를 느끼고 경계하며 마력을 끌어올리는 묘사`, visualShowDontTellActionKo: `${partner}의 발밑에서 퍼져 나가는 푸른 마법진 파동과 바람에 흩날리는 망토 로우앵글`, adaptedBubbleDialogueKo: "당신… 내가 알던 그 사람이 아니군요.", monologueCompressionPct: 70, recommendedScrollGapPx: 1100 },
    ],
    osmuExpansionScores: [
      { mediaFormat: "k-drama-series", readinessScore: 94, keySellingPointKo: `${protagonist}·${partner}의 혐관→공조 감정선과 명확한 에피소드 엔딩 훅으로 12부작 OTT 드라마 각색 최적`, adaptationBottleneckKo: "대규모 마법 결전 씬의 VFX 예산을 중반부 실내 정치 암투 씬과 균형 배분 필요" },
      { mediaFormat: "ott-animation", readinessScore: 96, keySellingPointKo: "레이어 분리된 이펙트와 속도감 있는 액션 비트 덕분에 시즌제 애니메이션 콘티로 즉시 전환 가능", adaptationBottleneckKo: "복잡한 제복 장식 문양을 애니메이션 작화용 2단 셰이딩 시트로 단순화 권장" },
      { mediaFormat: "audio-drama", readinessScore: 91, keySellingPointKo: "캐릭터 간 뚜렷한 보이스 레지스터 대비와 효과음(SFX) 큐시트 연동으로 몰입형 오디오툰 제작 용이", adaptationBottleneckKo: "비언어적 시선 교환 컷에 짧은 폴리 사운드(칼집 마찰음·발걸음) 보강 필요" },
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
      { bridgeId: "bridge-slash-01", startKeyframeCut: 1, endKeyframeCut: 2, inbetweenFrameCount: 8, motionCurveType: "impact-snap", anidocColorReferenceLock: true, occlusionRepairGuideKo: `${protagonist}의 오른팔 뒤로 가려지는 망토 안감 영역을 AniDoc 턴어라운드 컬러 시트 기준으로 복원` },
      { bridgeId: "bridge-camera-pan-02", startKeyframeCut: 2, endKeyframeCut: 3, inbetweenFrameCount: 6, motionCurveType: "ease-in-out", anidocColorReferenceLock: true, occlusionRepairGuideKo: "배경 기둥 패럴랙스 이동 시 발생하는 외곽선 끊김을 Krita ControlNet Lineart로 보정" },
    ],
    comistitchSlices: [
      { sliceIndex: 1, startYPx: 0, endYPx: 4_800, safeSplitInGutterConfirmed: true, kritaOutpaintTransitionPromptKo: "검은 안개에서 황궁 대리석 바닥으로 이어지는 수직 그라데이션 아웃페인팅" },
      { sliceIndex: 2, startYPx: 4_800, endYPx: 9_600, safeSplitInGutterConfirmed: true, kritaOutpaintTransitionPromptKo: "클리프행어 암전 여백(1,100px) 구간에 미세한 마력 입자 잔광 추가" },
    ],
  };
}

export async function runClaudeToonCrafterInbetweenAndStitchDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<ToonCrafterInbetweenAndStitchReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:tooncrafter-inbetween-stitch",
    input,
    options,
    systemPromptKo:
      "당신은 ToonCrafter, AniDoc, Krita AI Diffusion, Comistitch를 결합한 모션웹툰 인비트윈 동화 보간 및 세로 스크롤 무한 캔버스 스티칭 디렉터입니다. 시작·끝 키프레임 사이의 중간 동화 프레임 수와 모션 커브, AniDoc 컬러 전파 락, Krita 아웃페인팅 프롬프트, 말풍선이 절대 잘리지 않는 Comistitch 안전 분할 Y좌표를 JSON으로 설계하세요.",
    userDirectiveKo:
      "위 에피소드의 핵심 액션 전환 구간에 대해 ToonCrafter/AniDoc 인비트윈 브리지 명세와 Krita/Comistitch 세로 스크롤 안전 분할 명세를 JSON으로 생성해 주세요.",
    schema: ToonCrafterInbetweenAndStitchReportSchema,
    fallbackReport: buildLocalToonCrafterInbetweenAndStitchReport(input),
  });
}

/* ============================================================================
 * 7. 비대칭 복식·흉터·무기 파지 비례·부상 누적 연속성 원장 디렉터 (Sonnet 5.5)
 * ============================================================================ */

export function buildLocalAsymmetricCostumePropWoundLedgerReport(
  input: WebtoonProductionAssistInput = {},
): AsymmetricCostumePropWoundLedgerReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    chiralityConsistencyScore: 99,
    zeroMirrorFlipGuarantee: true,
    ledgerSummaryKo: `${protagonist}·${partner}의 신체 해부학적 좌우(Anatomical L/R) 기준 흉터·견장·검집 위치와 손 대비 무기 그립 비례, 전투 중 발생한 의상 파손·혈흔의 컷간 누적 상태를 고정하여 AI 생성 시 흔히 발생하는 좌우 반전 작붕을 원천 차단했습니다.`,
    ledgerItems: [
      { itemId: "asym-scar-01", characterName: protagonist, anatomicalAnchorSide: "anatomical-left", featureCategory: "facial-scar-mole", canonicalSpecKo: `${protagonist} 왼쪽 눈썹 위에서 광대까지 이어지는 사선 자상 흉터와 왼쪽 귀 은색 피어싱`, weaponToHandScaleRatio: "N/A (안면 고정 랜드마크)", mirrorFlipRiskWarningKo: "우측 측면 앵글(Right Profile) 촬영 시 흉터가 오른쪽 눈에 그려지지 않도록 가림 처리 필수", activeFromCutToCut: "Cut 1 ~ 전체 회차 영구 유지", persistencePromptLock: "scar strictly on character's anatomical left eyebrow, never mirrored to right eye" },
      { itemId: "asym-weapon-02", characterName: protagonist, anatomicalAnchorSide: "anatomical-right", featureCategory: "weapon-scabbard-grip", canonicalSpecKo: "오른손 주 파지 흑철 장검(검집은 왼쪽 허리 패용), 검자루(Hilt) 길이 28cm / 검신 폭 4.5cm 고정", weaponToHandScaleRatio: "손바닥 폭(9cm) 대비 검자루 3.1배 · 검신 길이 신장의 0.62배 고정", mirrorFlipRiskWarningKo: "발도 후 클로즈업 컷에서 검집이 오른쪽 허리로 이동하거나 왼손잡이로 반전되는 현상 차단", activeFromCutToCut: "Cut 1 ~ Cut 12", persistencePromptLock: "right-handed sword grip, scabbard anchored on left hip, fixed hilt-to-hand ratio 3.1:1" },
      { itemId: "asym-wound-03", characterName: partner, anatomicalAnchorSide: "anatomical-left", featureCategory: "cumulative-battle-wound", canonicalSpecKo: `Cut 2 방어전 이후 ${partner}의 왼쪽 어깨 망토 찢김(12cm) 및 소매 끝단 그을림 누적 유지`, weaponToHandScaleRatio: "마법 지팡이 헤드 직경 = 머리 크기의 0.75배 고정", mirrorFlipRiskWarningKo: "Cut 3 이후 컷에서 찢어진 망토가 멀쩡하게 복구되는 연속성 증발 방지", activeFromCutToCut: "Cut 2 발생 → 에피소드 종료까지 비가역 유지", persistencePromptLock: "persistent torn left cape shoulder and scorched cuff from Cut 2 onward" },
    ],
  };
}

export async function runClaudeAsymmetricCostumePropWoundLedgerDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<AsymmetricCostumePropWoundLedgerReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:asymmetric-costume-prop-wound-ledger",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 캐릭터의 비대칭 복식·흉터·안대·검집의 신체 해부학적 좌우(Anatomical Left/Right) 고정, 손 크기 대비 무기 비례(Scale Lock), 컷간 부상·혈흔·의상 파손 누적 원장을 총괄하는 일관성 감독입니다. 좌우 반전 작붕과 소품 증발을 차단하는 명세를 JSON으로 작성하세요.",
    userDirectiveKo:
      "위 에피소드 주요 인물들의 비대칭 외형/복식/무기 파지 비례 및 컷간 부상 누적 연속성 원장을 JSON으로 생성해 주세요.",
    schema: AsymmetricCostumePropWoundLedgerReportSchema,
    fallbackReport: buildLocalAsymmetricCostumePropWoundLedgerReport(input),
  });
}

/* ============================================================================
 * 8. 180도 시선 축(180° Rule)·다중 인물 키 차이·원근 소실점 일관성 감독 (Opus 5.5)
 * ============================================================================ */

export function buildLocalCameraAxisEyelineHeightLockReport(
  input: WebtoonProductionAssistInput = {},
): CameraAxisEyelineHeightLockReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    canonicalHeightDeltaCm: 16,
    axis180ViolationCount: 0,
    spatialContinuitySummaryKo: `2인 대치 씬 전체에서 180도 액션 축(Action Axis) Side-A를 엄격히 고수하여 화면 좌측=${protagonist}(184cm), 우측=${partner}(168cm)의 위치·시선 교환 벡터(좌→우 하향 -8°, 우→좌 상향 +8°)와 신장 차이(16cm)를 원근 소실점에 맞춰 동기화했습니다.`,
    cutAxisAudits: [
      { cutNumber: 1, cameraSideOfAxis: "axis-side-A-standard", leftScreenCharacter: protagonist, rightScreenCharacter: partner, eyelineVectorMatchPass: true, heightDeltaApparentCm: 16, horizonLineRatioY: 0.48, spatialCorrectionGuideKo: `아이레벨(Y:0.48) 투샷에서 ${partner}의 정수리가 ${protagonist}의 눈썹 높이에 오도록 신장 차 16cm 고정` },
      { cutNumber: 2, cameraSideOfAxis: "axis-side-A-standard", leftScreenCharacter: protagonist, rightScreenCharacter: partner, eyelineVectorMatchPass: true, heightDeltaApparentCm: 19, horizonLineRatioY: 0.28, spatialCorrectionGuideKo: `로우앵글(Y:0.28) 오버더숄더 컷에서 원근 과장으로 전경 ${protagonist} 어깨 너머 ${partner}가 위압감 있게 내려다보이는 시선각 보정` },
    ],
  };
}

export async function runClaudeCameraAxisEyelineHeightLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<CameraAxisEyelineHeightLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:camera-axis-eyeline-height-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 연출의 180도 시선 축(180-Degree Rule / Line of Action), 다중 인물 신장 차이(Height Delta) 원근 보정, 오버더숄더 시선 벡터 일관성을 총괄하는 시네마틱 공간 감독입니다. 컷간 카메라 축 침범(Axis Jump)과 키 비율 붕괴를 방지하는 명세를 JSON으로 설계하세요.",
    userDirectiveKo:
      "위 에피소드 대치/대화 장면의 180도 카메라 축 유지, 인물 좌우 배치, 시선 교환 각도, 앵글별 체감 신장 차이 보정표를 JSON으로 생성해 주세요.",
    schema: CameraAxisEyelineHeightLockReportSchema,
    fallbackReport: buildLocalCameraAxisEyelineHeightLockReport(input),
  });
}

/* ============================================================================
 * 9. 컷간 피부톤·의상 고유색(Albedo) 드리프트 방지 & 환경광 일관성 고정기 (Haiku 5.5)
 * ============================================================================ */

export function buildLocalCrossCutColorScriptAlbedoLockReport(
  input: WebtoonProductionAssistInput = {},
): CrossCutColorScriptAlbedoLockReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    maxDeltaEDrift: 1.4,
    albedoConsistencyPass: true,
    sceneLightingKelvinsSummaryKo: `야간 청색 달빛(4,100K)과 마법진 역광 환경에서도 ${protagonist}·${partner}의 고유 피부톤·머리색(Albedo HEX)이 회색빛으로 탁해지거나 컷마다 채도가 널뛰지 않도록 Delta-E 오차 1.4 이내로 고정했습니다.`,
    colorLocks: [
      { characterOrPropName: protagonist, partLabelKo: "안면 피부 베이스 (Cool Ivory Albedo)", albedoBaseHex: "#FCE7DC", shadowMultiplyHex: "#C99E93", lightingKelvinK: 4100, renderedApparentHex: "#DFD2D8", deltaEDriftTolerance: 1.5 },
      { characterOrPropName: partner, partLabelKo: "시그니처 실버 헤어 & 크림슨 망토", albedoBaseHex: "#E2E8F0", shadowMultiplyHex: "#94A3B8", lightingKelvinK: 4100, renderedApparentHex: "#CBD5E1", deltaEDriftTolerance: 1.8 },
    ],
  };
}

export async function runClaudeCrossCutColorScriptAlbedoLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<CrossCutColorScriptAlbedoLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:cross-cut-color-script-albedo-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 컷간 피부톤·머리색·의상 고유색(Albedo HEX)과 시간대별 환경광 색온도(Kelvin) 합성 시 발생하는 색상 드리프트(Delta-E)를 통제하는 컬러스크립트 디렉터입니다. JSON으로 고유색·그림자색·조명 반영색 락을 설계하세요.",
    userDirectiveKo:
      "위 에피소드 주요 인물과 핵심 소품의 고유색(Albedo HEX), 셀 그림자 Multiply HEX, 조명 색온도(K) 반영 HEX 및 Delta-E 허용치를 JSON으로 생성해 주세요.",
    schema: CrossCutColorScriptAlbedoLockReportSchema,
    fallbackReport: buildLocalCrossCutColorScriptAlbedoLockReport(input),
  });
}

/* ============================================================================
 * 10. 컷간 미세 표정(FACS 근육)·시선 궤적·호흡 감정선 연속성 디렉터 (Sonnet 5.5)
 * ============================================================================ */

export function buildLocalMicroExpressionActingContinuityReport(
  input: WebtoonProductionAssistInput = {},
): MicroExpressionActingContinuityReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    emotionalContinuityScore: 98,
    zeroWhiplashGuarantee: true,
    actingArcSummaryKo: `컷마다 표정이 갑자기 무표정으로 초기화되거나 과장된 AI 표정으로 튀는 현상(Emotional Whiplash)을 막기 위해, FACS 안면 근육 유닛(AU)과 동공 수축률·눈썹 긴장도의 컷간 감정 관성(Emotional Inertia)을 정밀 연결했습니다.`,
    microExpressionBeats: [
      { cutNumber: 1, characterName: protagonist, facsActionUnits: "AU4(미간 수축) + AU7(눈꺼풀 긴장) + AU24(입술 굳게 다묾)", pupilConstrictionLevel: "contracted-rage", browTensionPct: 82, gazeTrajectoryKo: "하단 검 끝에서 정면 상대의 미간으로 15° 급격히 치켜뜨는 시선", emotionalInertiaNoteKo: "이전 컷의 배신감 충격이 식지 않은 채 차가운 살의로 응축되는 전환", actingPromptLock: "subtle furrowed brow AU4, tightened lower eyelids AU7, pressed lips, constricted pupils, cold suppressed fury" },
      { cutNumber: 2, characterName: partner, facsActionUnits: "AU1+2(안쪽 눈썹 미세 거상) + AU5(상안검 확장) + AU17(턱 끝 미세 떨림)", pupilConstrictionLevel: "trembling-grief", browTensionPct: 68, gazeTrajectoryKo: `${protagonist}의 눈을 마주보다가 죄책감에 0.5초간 좌하단으로 흔들리는 시선`, emotionalInertiaNoteKo: "단호한 방어 태세 이면에 숨겨진 동요가 눈가 미세 떨림으로 잔류", actingPromptLock: "micro-trembling pupils, slightly raised inner brows AU1, guarded yet conflicted expression, no exaggerated smiling" },
    ],
  };
}

export async function runClaudeMicroExpressionActingContinuityDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<MicroExpressionActingContinuityReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:micro-expression-acting-continuity",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 캐릭터의 컷간 미세 표정 연기(FACS 안면 근육 Action Units, 동공 수축도, 눈썹 긴장도, 시선 이동 궤적, 감정 관성) 연속성을 총괄하는 액팅 디렉터입니다. 컷 사이에 표정이 급변하거나 마네킹처럼 굳는 현상을 방지하는 명세를 JSON으로 작성하세요.",
    userDirectiveKo:
      "위 에피소드 핵심 감정 교차 컷들에 대해 캐릭터별 FACS 안면 근육 코드, 동공 상태, 시선 궤적, 감정 관성(Emotional Inertia) 프롬프트 락을 JSON으로 생성해 주세요.",
    schema: MicroExpressionActingContinuityReportSchema,
    fallbackReport: buildLocalMicroExpressionActingContinuityReport(input),
  });
}

/* ============================================================================
 * 11~16. Wave 15~17 Webtoon Consistency & Production AI Engines (6종)
 * ============================================================================ */

export function buildLocalCollarTieLapelNecklineLockReport(
  input: WebtoonProductionAssistInput = {},
): CollarTieLapelNecklineLockReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    necklineConsistencyScore: 98,
    unbuttonedTopButtonCount: 2,
    collarAndLapelSpecKo: `${protagonist} 블랙 셔츠 상단 단추 2개 풀림(쇄골 V라인 노출 각도 38°) + 코트 피크드 라펠(Peaked Lapel) 좌측 버튼홀 고정`,
    tieCravatBroochRuleKo: `${partner} 로판 하이넥 크라바트 리본 중앙 청옥 브로치(직경 3.2cm) 수직 중심선 정렬 유지`,
    readyNecklineGuardLine: `[칼라·단추·크라바트 고정] ${protagonist} 상단 단추 2개 풀림 고정 · ${partner} 크라바트 청옥 브로치 중심축 잠금`,
  };
}

export async function runClaudeCollarTieLapelNecklineLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<CollarTieLapelNecklineLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:collar-tie-lapel-neckline-symmetry-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 캐릭터의 셔츠 단추 풀림 개수, 넥타이 매듭, 로판 크라바트 브로치, 코트 라펠 대칭 일관성을 총괄하는 의상 목선 디렉터입니다. JSON으로만 응답하세요.",
    userDirectiveKo:
      "위 에피소드 컷 전환 시 셔츠 단추 풀림 개수나 넥타이/크라바트 브로치가 제멋대로 바뀌는 작붕을 막기 위한 고정 명세를 JSON으로 생성해 주세요.",
    schema: CollarTieLapelNecklineLockReportSchema,
    fallbackReport: buildLocalCollarTieLapelNecklineLockReport(input),
  });
}

export function buildLocalTattooStigmaUvTopologyLockReport(
  input: WebtoonProductionAssistInput = {},
): TattooStigmaUvTopologyLockReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  return {
    uvTopologyLockScore: 99,
    anatomicalUvZoneKo: `${protagonist} 좌측 쇄골 내측단에서 좌측 삼각근(Deltoid) 외측을 감싸 내려오는 고대 흑룡 성흔(Stigma) UV 스킨 좌표 고정`,
    foreshorteningWarpRuleKo: "팔을 앞으로 뻗는 단축법(Foreshortening) 컷에서 성흔 문양이 평면 스티커처럼 떠 보이지 않고 삼각근 곡률을 따라 타원 압축(0.62x)",
    emissionStageAndHexKo: "평상시 흑청색 잉크(`#1E3A8A`) → 각성 컷 시안 블루 발광(`#38BDF8`, Bloom 45%)",
    readyStigmaUvGuardLine: `[문신·성흔 UV 곡면 고정] ${protagonist} 좌측 쇄골~삼각근 성흔 UV 토폴로지 고정 · 평면 스티커화 금지`,
  };
}

export async function runClaudeTattooStigmaUvTopologyLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<TattooStigmaUvTopologyLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:tattoo-stigma-curse-mark-uv-topology-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 캐릭터의 문신·성흔(Stigma)·저주 낙인의 신체 해부학적 UV 스킨 좌표와 근육 굴곡 왜곡 및 발광 단계를 고정하는 디렉터입니다. JSON으로만 응답하세요.",
    userDirectiveKo:
      "위 에피소드에서 캐릭터의 성흔·문신이 다른 부위로 이동하거나 평면 스티커처럼 보이는 작붕을 막기 위한 UV 곡면 잠금 명세를 JSON으로 설계해 주세요.",
    schema: TattooStigmaUvTopologyLockReportSchema,
    fallbackReport: buildLocalTattooStigmaUvTopologyLockReport(input),
  });
}

export function buildLocalCompanionFamiliarScaleLockReport(
  input: WebtoonProductionAssistInput = {},
): CompanionFamiliarScaleLockReport {
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    companionScaleScore: 97,
    bodyLengthCm: 26,
    hornWingTailCountRuleKo: "이마 은빛 외뿔(1개) · 반투명 날개 1쌍(2장) · 끝단이 푸르게 타오르는 단일 꼬리(1개) 불변 고정",
    shoulderPalmPerchSpecKo: `${partner}의 왼쪽 어깨 견장 위에 앉을 때 체고 18cm(성인 머리 높이의 0.78배), 두 손바닥 위에 안길 때 체장 26cm 비례 유지`,
    readyCompanionGuardLine: `[소환수·신수 비례 고정] ${partner} 어깨 신수 체장 26cm · 외뿔 1개/날개 2장/꼬리 1개 수량 및 크기 잠금`,
  };
}

export async function runClaudeCompanionFamiliarScaleLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<CompanionFamiliarScaleLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:companion-pet-familiar-mascot-scale-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 소환수·신수·사역마·반려동물의 체구 비례(어깨/손바닥 안착 크기) 및 뿔·날개·꼬리 개수를 전 컷 고정하는 크리처 디렉터입니다. JSON으로만 응답하세요.",
    userDirectiveKo:
      "위 에피소드에서 소환수·반려동물이 컷마다 크기가 고무줄처럼 변하거나 뿔/꼬리 개수가 달라지는 작붕을 차단하는 명세를 JSON으로 설계해 주세요.",
    schema: CompanionFamiliarScaleLockReportSchema,
    fallbackReport: buildLocalCompanionFamiliarScaleLockReport(input),
  });
}

export function buildLocalInteriorRoomGeographyLockReport(
  input: WebtoonProductionAssistInput = {},
): InteriorRoomGeographyLockReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  return {
    roomGeographyScore: 99,
    windowWallCompassDirection: "북측 정면 대형 아치창(달빛 유입 방위각 0° N) · 서측 벽면 책장 · 동측 벽면 벽난로",
    doorHingeSideAndSwingRuleKo: "남측 출입문: 실내에서 바라볼 때 좌측 경첩(Left Hinge), 손잡이는 우측(높이 95cm), 실내 안쪽(Inward)으로 90° 개폐",
    furnitureCoordinateGridKo: `중앙 집무 데스크(X:0.5, Z:0.35) 뒤편에 ${protagonist} 착석, 방문 진입자는 남→북 동선으로 접근(역앵글 전환 시 창문-출입문 좌우 반전 금지)`,
    readyRoomGeographyGuardLine: `[실내 평면도·문 경첩 고정] 북측 아치창 · 남측 출입문(좌경첩·우손잡이·내측개폐) · 역앵글 벽면 반전 금지`,
  };
}

export async function runClaudeInteriorRoomGeographyLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<InteriorRoomGeographyLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:interior-room-furniture-door-hinge-geography-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 실내 씬의 2D/3D 건축 평면도(창문 방위, 가구 좌표, 방문 경첩 및 손잡이 위치, 문 열리는 방향) 일관성을 총괄하는 공간 감독입니다. JSON으로만 응답하세요.",
    userDirectiveKo:
      "위 에피소드 실내 대화/액션 씬에서 카메라 역앵글 전환 시 창문·책상·방문 경첩 방향이 뒤집히는 공간 작붕을 막기 위한 평면도 고정 명세를 JSON으로 설계해 주세요.",
    schema: InteriorRoomGeographyLockReportSchema,
    fallbackReport: buildLocalInteriorRoomGeographyLockReport(input),
  });
}

export function buildLocalScrollPaceSilentBeatRhythmReport(
  input: WebtoonProductionAssistInput = {},
): ScrollPaceSilentBeatRhythmReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    silentPacingScore: 98,
    silentBeatGutterHeightPx: 1380,
    gradientFadeTransitionKo: `${protagonist}의 떨리는 눈동자 익스트림 클로즈업 직후 #090D16 → #000000 1,380px 무대사 수직 암전 여백을 배치해 ${partner}의 대사 전 정적 호흡 극대화`,
    eyeContactHoldDurationSec: 2.8,
    readySilentBeatGuardLine: `[무대사 여운 리듬 고정] 시선 교환 클로즈업 후 1,380px 암전 페이드 여백 배치(체류 호흡 2.8초 유도)`,
  };
}

export async function runClaudeScrollPaceSilentBeatRhythmDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<ScrollPaceSilentBeatRhythmReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:scroll-pace-silent-beat-panel-height-rhythm",
    input,
    options,
    systemPromptKo:
      "당신은 모바일 세로 스크롤 웹툰의 무대사 감정 여운 컷(Silent Beat) 세로 픽셀 높이(px)와 그라데이션 여백 호흡을 설계하는 연출 감독입니다. JSON으로만 응답하세요.",
    userDirectiveKo:
      "위 에피소드의 감정 클라이맥스 직전 대사 없이 독자의 스크롤 속도를 늦추고 여운을 주는 무대사 컷·여백 리듬 명세를 JSON으로 설계해 주세요.",
    schema: ScrollPaceSilentBeatRhythmReportSchema,
    fallbackReport: buildLocalScrollPaceSilentBeatRhythmReport(input),
  });
}

export function buildLocalSubsurfaceScatteringTearSpecularLockReport(
  input: WebtoonProductionAssistInput = {},
): SubsurfaceScatteringTearSpecularLockReport {
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  return {
    sssAndSpecularScore: 98,
    earFingertipSssHex: "#FF6B6B",
    tearSweatRefractionRuleKo: `${partner}의 아래 속눈썹 중앙에 맺힌 눈물방울(직경 3.5px) 내부 굴절 하이라이트(` + "`#FFFFFF`" + `) + 뺨을 타고 흐르는 투명 수막 궤적 고정`,
    catchlightPositionSpecKo: "양안 동공 좌상단 10시 방향 주 캐치라이트(타원형) + 우하단 4시 방향 마법진 반사 보조광 고정",
    readySssTearGuardLine: `[피하산란·눈물 굴절 고정] 역광 귀바퀴/손끝 SSS(#FF6B6B) 투과광 · 10시 방향 캐치라이트 · 속눈썹 눈물 굴절 잠금`,
  };
}

export async function runClaudeSubsurfaceScatteringTearSpecularLockDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Phase6EcosystemEnvelope<SubsurfaceScatteringTearSpecularLockReport>> {
  return executePhase6EcosystemEngine({
    taskId: "ecosystem:subsurface-scattering-skin-tear-sweat-specular-lock",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 클로즈업 작화의 역광 피하산란(Subsurface Scattering: 귀바퀴·손가락 끝 붉은 투과광), 눈동자 캐치라이트 방향, 눈물·땀방울 굴절 하이라이트 일관성을 총괄하는 조명 디렉터입니다. JSON으로만 응답하세요.",
    userDirectiveKo:
      "위 에피소드 감정 클로즈업 컷에서 역광 피부 SSS 투과광과 눈물/땀방울 스페큘러·동공 캐치라이트를 고정하는 명세를 JSON으로 설계해 주세요.",
    schema: SubsurfaceScatteringTearSpecularLockReportSchema,
    fallbackReport: buildLocalSubsurfaceScatteringTearSpecularLockReport(input),
  });
}
