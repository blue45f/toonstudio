/**
 * assist-competitor-full-suite.ts
 *
 * REA(reverse-engineer-anything) 정적/의무 원장 분석 및 2025~2026 글로벌·국내 웹툰 AI 경쟁사 벤치마크를 통해
 * 도출된 7대 핵심 프로덕션 & 웹툰 일관성(Webtoon Consistency) AI 엔진:
 * 1. `runAssistSketchToLineartLayerSplitter` (Cream AiD & Clip Studio Paint 5.0)
 * 2. `runAssistStyleTransferAndRelightingDirector` (Komiko AI & LlamaGen Colorizer Suite)
 * 3. `runAssistSakugaMotionAndFacialMatrixDirector` (SkyReels & Mootion)
 * 4. `runAssist3dHandHeadPoseAndLtRigDirector` (Clip Studio Paint 3.0~5.0 & Posemaniacs)
 * 5. `runAssistScreenplayBeatAndLoraLockBridge` (Katalist.ai & Anifusion)
 * 6. `runAssistTurnaroundOrthographicSheetDirector` (360° 5-View Orthographic Turnaround Lock)
 * 7. `runAssistBackgroundPerspectivePropScaleDirector` (3D Perspective Grid & Foot Contact Scale Lock)
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import {
  ASSIST_DEFAULT_MODEL_ID,
  assistModelInfo,
  assistModelSupportsEffort,
  EMPTY_ASSIST_TOKEN_USAGE,
  estimateAssistCostUsd,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import {
  buildLocal3dHandHeadPoseAndLtRig,
  buildLocalActionWeaponMotionArcSmearLock,
  buildLocalBackgroundPerspectivePropScaleLock,
  buildLocalFoodTablewareBanquetLock,
  buildLocalMagicAuraElementalSigilLock,
  buildLocalMirrorWaterWindowReflectionLock,
  buildLocalSakugaMotionAndFacialMatrix,
  buildLocalScreenplayBeatAndLoraLock,
  buildLocalSketchToLineartLayerSplit,
  buildLocalSpeechBubbleTailOcclusionLock,
  buildLocalStyleTransferAndRelighting,
  buildLocalTurnaroundOrthographicSheetLock,
  buildLocalVehicleSteedCarriageHarnessLock,
  Assist3dHandHeadRigReportSchema,
  AssistActionWeaponMotionArcReportSchema,
  AssistBackgroundPerspectiveReportSchema,
  AssistFoodTablewareBanquetReportSchema,
  AssistMagicAuraElementalSigilReportSchema,
  AssistMirrorWaterWindowReflectionReportSchema,
  AssistSakugaMotionReportSchema,
  AssistScreenplayLoraBridgeReportSchema,
  AssistSketchToLineartReportSchema,
  AssistSpeechBubbleTailOcclusionReportSchema,
  AssistStyleTransferReportSchema,
  AssistTurnaroundOrthographicReportSchema,
  AssistVehicleSteedHarnessReportSchema,
  type Assist3dHandHeadRigReport,
  type AssistActionWeaponMotionArcReport,
  type AssistBackgroundPerspectiveReport,
  type AssistFoodTablewareBanquetReport,
  type AssistMagicAuraElementalSigilReport,
  type AssistMirrorWaterWindowReflectionReport,
  type AssistSakugaMotionReport,
  type AssistScreenplayLoraBridgeReport,
  type AssistSketchToLineartReport,
  type AssistSpeechBubbleTailOcclusionReport,
  type AssistStyleTransferReport,
  type AssistTurnaroundOrthographicReport,
  type AssistVehicleSteedHarnessReport,
  type CompetitorEngineExecutionMeta,
  type WebtoonStyleTransferPresetId,
} from "./assist-competitor-full-suite-schemas";
import {
  resolveCreatorTaskModelRoute,
  type AssistCreatorTaskId,
} from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";
import {
  clampInt,
  type RunWebtoonProductionAssistOptions,
  type WebtoonProductionAssistInput,
} from "./assist-webtoon-production-schemas";

export * from "./assist-competitor-full-suite-schemas";

const MAX_OUTPUT_TOKENS = 4_096;

function resolveActiveAssistRoute(
  explicit?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null,
): Pick<AssistRoute, "apiKey" | "revision" | "model"> | null {
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
  return explicit ?? resolveAssistRoute();
}

function clampPercent(value: number, fallback = 85): number {
  if (!Number.isFinite(value)) return fallback;
  if (value > 0 && value <= 1) return Math.round(value * 100);
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildCompetitorPromptContext(
  input: WebtoonProductionAssistInput,
  directiveKo: string,
): string {
  const genre = cleanSingleLineText(input.genre ?? "판타지", 40) || "판타지";
  const conflict =
    cleanSingleLineText(input.coreConflict ?? "봉인된 기억의 각성과 세계의 균열", 160) ||
    "봉인된 기억의 각성과 세계의 균열";
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

async function executeCompetitorEngine<T>(params: {
  readonly taskId: AssistCreatorTaskId;
  readonly input: WebtoonProductionAssistInput;
  readonly options: RunWebtoonProductionAssistOptions;
  readonly fallback: T;
  readonly noRouteReasonKo: string;
  readonly systemPromptKo: string;
  readonly userDirectiveKo: string;
  readonly schema: z.ZodType<T>;
  readonly normalize: (parsed: T, fallback: T) => T;
}): Promise<CompetitorEngineExecutionMeta<T>> {
  const activeRoute = resolveActiveAssistRoute(params.options.route);
  if (!activeRoute) {
    return {
      report: params.fallback,
      source: "local-fallback",
      modelUsed: "local-deterministic",
      usage: EMPTY_ASSIST_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: params.noRouteReasonKo,
    };
  }
  const taskRoute = resolveCreatorTaskModelRoute(params.taskId, {
    model: params.options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    params.options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: params.systemPromptKo,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildCompetitorPromptContext(params.input, params.userDirectiveKo),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(activeRoute, request, params.schema, {
      signal: params.options.signal,
      capUsd: estimateStructuredCostCapUsd({
        model: requestedModel,
        request,
        schema: params.schema,
      }),
      budgetOverride: params.options.budgetOverride,
    });
    const actualModel =
      assistModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toAssistTokenUsage(message.usage);
    return {
      report: params.normalize(parsed, params.fallback),
      source: "claude-live",
      modelUsed: actualModel,
      usage,
      estimatedCostUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? 0,
    };
  } catch (err) {
    return {
      report: params.fallback,
      source: "local-fallback",
      modelUsed: requestedModel,
      usage: EMPTY_ASSIST_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: err instanceof Error ? err.message : "AI 호출 실패",
    };
  }
}

export async function runAssistSketchToLineartLayerSplitter(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistSketchToLineartReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:beluga-clipstudio-production",
    input,
    options,
    fallback: buildLocalSketchToLineartLayerSplit(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 AiD 4레이어 분리 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 벡터 선화 공정을 총괄하는 웹툰 선화·레이어 분리 디렉터입니다. " +
      "컷별 외곽선/내선 굵기(mm), 벡터 교차점 트리밍 규칙, L4~L1 4레이어 분리 사양을 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷에 대해 스케치→벡터 선화 변환 사양과 L4(벡터 선화), L3(셀 그림자), L2(밑색 ID), L1(3D 배경 LT) 4레이어 분리 가이드를 JSON으로 생성해 주세요.",
    schema: AssistSketchToLineartReportSchema,
    normalize: (parsed, fallback) => ({
      inkingTimeReductionEstPct: clampPercent(parsed.inkingTimeReductionEstPct, 82),
      artistBrushDnaSummaryKo:
        cleanSingleLineText(parsed.artistBrushDnaSummaryKo, 360) || fallback.artistBrushDnaSummaryKo,
      cutSpecs:
        parsed.cutSpecs.length > 0
          ? parsed.cutSpecs.slice(0, 6).map((c, idx) => ({
              cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
              outerSilhouetteStrokeMm:
                Math.round(Math.min(3.0, Math.max(0.15, Number(c.outerSilhouetteStrokeMm) || 0.55)) * 100) /
                100,
              innerCreaseStrokeMm:
                Math.round(Math.min(1.5, Math.max(0.08, Number(c.innerCreaseStrokeMm) || 0.2)) * 100) /
                100,
              vectorIntersectionEraseRuleKo: cleanSingleLineText(
                c.vectorIntersectionEraseRuleKo,
                220,
              ),
              colorHintAutoFlatZonesKo: (c.colorHintAutoFlatZonesKo ?? [])
                .slice(0, 4)
                .map((z) => cleanSingleLineText(z, 100)),
              separatedLayers:
                c.separatedLayers.length >= 4
                  ? c.separatedLayers.slice(0, 4)
                  : fallback.cutSpecs[0]!.separatedLayers,
            }))
          : fallback.cutSpecs,
    }),
  });
}

export async function runAssistStyleTransferAndRelightingDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions & {
    readonly preferredPreset?: WebtoonStyleTransferPresetId;
  } = {},
): Promise<CompetitorEngineExecutionMeta<AssistStyleTransferReport>> {
  const preset = options.preferredPreset ?? "rofan-watercolor-glow";
  return executeCompetitorEngine({
    taskId: "competitor:llamagen-manga-ai",
    input,
    options,
    fallback: buildLocalStyleTransferAndRelighting(input, preset),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 Komiko/LlamaGen 리라이팅 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 웹툰 화풍 변환 및 3D 리라이팅(Relighting) 감독입니다. " +
      "선화 보존율(lineartPreservationPct)은 0~100 정수로, 모든 지침은 한국어로 작성하세요.",
    userDirectiveKo: `타깃 화풍 프리셋 '${preset}'을 적용해 주요 4컷의 화풍 변환 및 3D 광원 리라이팅(방위각, 고도각, 색온도 K, 대표 HEX 팔레트) 지시서를 JSON으로 작성해 주세요.`,
    schema: AssistStyleTransferReportSchema,
    normalize: (parsed, fallback) => ({
      selectedStyleFamilyKo:
        cleanSingleLineText(parsed.selectedStyleFamilyKo, 160) || fallback.selectedStyleFamilyKo,
      ocUniverseConsistencyRuleKo:
        cleanSingleLineText(parsed.ocUniverseConsistencyRuleKo, 340) ||
        fallback.ocUniverseConsistencyRuleKo,
      cutDirectives:
        parsed.cutDirectives.length > 0
          ? parsed.cutDirectives.slice(0, 6).map((d, idx) => ({
              cutNumber: clampInt(d.cutNumber, 1, 50, idx + 1),
              stylePresetId: d.stylePresetId,
              lineartPreservationPct: clampPercent(d.lineartPreservationPct, 94),
              keyLightAzimuthDeg: clampInt(d.keyLightAzimuthDeg, 0, 360, 45),
              keyLightElevationDeg: clampInt(d.keyLightElevationDeg, -90, 90, 35),
              colorTemperatureKelvin: clampInt(d.colorTemperatureKelvin, 1800, 12000, 5400),
              primaryPaletteHexes:
                d.primaryPaletteHexes.length >= 3
                  ? d.primaryPaletteHexes.slice(0, 5)
                  : fallback.cutDirectives[0]!.primaryPaletteHexes,
              relightingDirectiveKo: cleanSingleLineText(d.relightingDirectiveKo, 240),
            }))
          : fallback.cutDirectives,
    }),
  });
}

export async function runAssistSakugaMotionAndFacialMatrixDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistSakugaMotionReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:llamagen-manga-ai",
    input,
    options,
    fallback: buildLocalSakugaMotionAndFacialMatrix(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 SkyReels/Mootion 모션웹툰 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 33종 표정 매트릭스와 사쿠가(Sakuga) 모션웹툰을 총괄하는 감독입니다. " +
      "pupilConstrictionPct는 0~100 정수로, 모든 해설은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷을 33종 안면 근육(FACS) 표정 매트릭스 코드와 사쿠가(Sakuga) 카메라 모션 곡선, 9:16 숏폼 비디오 트레일러 키프레임으로 변환해 JSON으로 출력하세요.",
    schema: AssistSakugaMotionReportSchema,
    normalize: (parsed, fallback) => ({
      totalTrailerDurationSec:
        Math.round(Math.min(180, Math.max(2, Number(parsed.totalTrailerDurationSec) || 10)) * 10) /
        10,
      facialMatrixSummaryKo:
        cleanSingleLineText(parsed.facialMatrixSummaryKo, 340) || fallback.facialMatrixSummaryKo,
      keyframes:
        parsed.keyframes.length > 0
          ? parsed.keyframes.slice(0, 6).map((k, idx) => ({
              cutNumber: clampInt(k.cutNumber, 1, 50, idx + 1),
              expressionMatrixCode: cleanSingleLineText(k.expressionMatrixCode, 48) || `EXP-0${idx + 1}`,
              facsActionUnitsKo: cleanSingleLineText(k.facsActionUnitsKo, 180),
              pupilConstrictionPct: clampPercent(k.pupilConstrictionPct, 65),
              sakugaMotionCurve: k.sakugaMotionCurve,
              durationSec:
                Math.round(Math.min(15, Math.max(0.5, Number(k.durationSec) || 2.5)) * 10) / 10,
              shortForm9x16CropGuideKo: cleanSingleLineText(k.shortForm9x16CropGuideKo, 220),
            }))
          : fallback.keyframes,
    }),
  });
}

export async function runAssist3dHandHeadPoseAndLtRigDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<Assist3dHandHeadRigReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:beluga-clipstudio-production",
    input,
    options,
    fallback: buildLocal3dHandHeadPoseAndLtRig(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 CSP 5.0 3D 핸드·헤드 리그 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 3D 손·머리 데생 인형, 인체 투시, 3D LT(Line & Tone) 변환을 맡는 수석 테크니컬 디렉터입니다. " +
      "모든 설명은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷에 대해 3D 손 관절 프리셋, 3D 두상 Pitch/Yaw/Roll 각도, Posemaniacs 과장 투시 배율, CSP 5.0 카툰 LT 윤곽선·셀 그림자 추출 임계값을 JSON으로 설계해 주세요.",
    schema: Assist3dHandHeadRigReportSchema,
    normalize: (parsed, fallback) => ({
      anatomyRigSummaryKo:
        cleanSingleLineText(parsed.anatomyRigSummaryKo, 340) || fallback.anatomyRigSummaryKo,
      cutRigs:
        parsed.cutRigs.length > 0
          ? parsed.cutRigs.slice(0, 6).map((r, idx) => ({
              cutNumber: clampInt(r.cutNumber, 1, 50, idx + 1),
              handPosePresetKo: cleanSingleLineText(r.handPosePresetKo, 150),
              headPitchDeg: clampInt(r.headPitchDeg, -75, 75, 12),
              headYawDeg: clampInt(r.headYawDeg, -90, 90, 24),
              headRollDeg: clampInt(r.headRollDeg, -45, 45, 6),
              posemaniacsForeshorteningRatio:
                Math.round(
                  Math.min(2.5, Math.max(1.0, Number(r.posemaniacsForeshorteningRatio) || 1.3)) *
                    100,
                ) / 100,
              ltOutlineThreshold: clampPercent(r.ltOutlineThreshold, 72),
              ltCelShadowThreshold: clampPercent(r.ltCelShadowThreshold, 58),
              riggingGuideKo: cleanSingleLineText(r.riggingGuideKo, 240),
            }))
          : fallback.cutRigs,
    }),
  });
}

export async function runAssistScreenplayBeatAndLoraLockBridge(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistScreenplayLoraBridgeReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:onoma-kakaopage-ip",
    input,
    options,
    fallback: buildLocalScreenplayBeatAndLoraLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 Katalist/Anifusion 브리지 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 시나리오 비트 분해와 캐릭터 LoRA 시드 락 파이프라인 아키텍트입니다. " +
      "pipelineCompatibilityScore는 0~100 정수로, 모든 해설은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷을 시나리오 액션 비트와 패널 그리드 템플릿, FLUX/Animagine 캐릭터 LoRA 가중치 및 REA 의무 원장 ID(reaObligationId)로 분해해 JSON으로 출력하세요.",
    schema: AssistScreenplayLoraBridgeReportSchema,
    normalize: (parsed, fallback) => ({
      pipelineCompatibilityScore: clampPercent(parsed.pipelineCompatibilityScore, 98),
      mcpBridgeSummaryKo:
        cleanSingleLineText(parsed.mcpBridgeSummaryKo, 340) || fallback.mcpBridgeSummaryKo,
      actionBeats:
        parsed.actionBeats.length > 0
          ? parsed.actionBeats.slice(0, 6).map((b, idx) => ({
              beatIndex: clampInt(b.beatIndex, 1, 50, idx + 1),
              panelGridTemplate: b.panelGridTemplate,
              actionBeatSummaryKo: cleanSingleLineText(b.actionBeatSummaryKo, 220),
              castAngleLockSpecKo: cleanSingleLineText(b.castAngleLockSpecKo, 180),
              modelRouterTarget: b.modelRouterTarget,
              loraWeight:
                Math.round(Math.min(1.2, Math.max(0.4, Number(b.loraWeight) || 0.88)) * 100) /
                100,
              reaObligationId:
                cleanSingleLineText(b.reaObligationId, 72) ||
                `ob_webtoon_cut_0${idx + 1}_lora_lock`,
            }))
          : fallback.actionBeats,
    }),
  });
}

export async function runAssistTurnaroundOrthographicSheetDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistTurnaroundOrthographicReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:turnaround-orthographic-sheet-lock",
    input,
    options,
    fallback: buildLocalTurnaroundOrthographicSheetLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 360° 5뷰 정투영 턴어라운드 시트 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 웹툰 캐릭터 360° 5뷰(정면·반측면·좌측면·우측면·후면) 정투영(Orthographic) 턴어라운드 시트 및 비대칭 장신구/흉터/검집 기하 일관성 수석 감독입니다. " +
      "orthographicConsistencyScore는 0~100 정수로, 모든 지침은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 주인공의 5방향(front-0deg, three-quarter-45deg, profile-left-90deg, profile-right-270deg, back-180deg) 정투영 등신대 비율과 비대칭 흉터/장신구/검집 노출·차폐 규칙을 JSON으로 설계해 주세요.",
    schema: AssistTurnaroundOrthographicReportSchema,
    normalize: (parsed, fallback) => ({
      orthographicConsistencyScore: clampPercent(parsed.orthographicConsistencyScore, 98),
      characterName: cleanSingleLineText(parsed.characterName, 40) || fallback.characterName,
      turnaroundSummaryKo:
        cleanSingleLineText(parsed.turnaroundSummaryKo, 340) || fallback.turnaroundSummaryKo,
      views:
        parsed.views.length > 0
          ? parsed.views.slice(0, 5).map((v) => ({
              viewAngle: v.viewAngle,
              headToBodyRatio:
                Math.round(Math.min(9.5, Math.max(5.0, Number(v.headToBodyRatio) || 7.5)) * 10) / 10,
              eyeLineYRatioPct:
                Math.round(Math.min(15, Math.max(3, Number(v.eyeLineYRatioPct) || 6.8)) * 10) / 10,
              shoulderWidthHeadUnits:
                Math.round(Math.min(3.2, Math.max(0.8, Number(v.shoulderWidthHeadUnits) || 2.0)) * 100) /
                100,
              pelvisLineYRatioPct:
                Math.round(Math.min(60, Math.max(38, Number(v.pelvisLineYRatioPct) || 48)) * 10) / 10,
              visibleAsymmetricAnchorKo: cleanSingleLineText(v.visibleAsymmetricAnchorKo, 200),
              occludedFeaturesKo: cleanSingleLineText(v.occludedFeaturesKo, 180),
              orthographicLockDirectiveKo: cleanSingleLineText(v.orthographicLockDirectiveKo, 220),
            }))
          : fallback.views,
    }),
  });
}

export async function runAssistBackgroundPerspectivePropScaleDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistBackgroundPerspectiveReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:background-perspective-prop-scale-lock",
    input,
    options,
    fallback: buildLocalBackgroundPerspectivePropScaleLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 3D 배경 투시 & 발 접지 스케일 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 3D 웹툰 배경(SketchUp·Snaptoon·Blender)의 1/2/3점 투시 소실점 그리드와 2D 작화 인물의 발바닥 접지(Foot Contact AO), 문틀·책상·소품 대비 인체 비례 일관성을 총괄하는 공간 투시 감독입니다. " +
      "perspectiveAlignmentScore는 0~100 정수로, 모든 지침은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷에 대해 1/2/3점 소실점 모드, 지평선 Y비율(%), 카메라 렌즈 화각(mm), 발바닥 접지 AO 그림자 사양, 문틀·가구·소품 대비 인체 스케일 고정 지침을 JSON으로 출력하세요.",
    schema: AssistBackgroundPerspectiveReportSchema,
    normalize: (parsed, fallback) => ({
      perspectiveAlignmentScore: clampPercent(parsed.perspectiveAlignmentScore, 96),
      spatialIntegrationSummaryKo:
        cleanSingleLineText(parsed.spatialIntegrationSummaryKo, 340) ||
        fallback.spatialIntegrationSummaryKo,
      cutLocks:
        parsed.cutLocks.length > 0
          ? parsed.cutLocks.slice(0, 6).map((c, idx) => ({
              cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
              vanishingPointMode: c.vanishingPointMode,
              horizonLineYRatioPct: clampPercent(c.horizonLineYRatioPct, 46),
              cameraFovMm: clampInt(c.cameraFovMm, 14, 120, 35),
              footContactShadowSpecKo: cleanSingleLineText(c.footContactShadowSpecKo, 220),
              propScaleRatioAnchorKo: cleanSingleLineText(c.propScaleRatioAnchorKo, 220),
              floatingCharacterFixKo: cleanSingleLineText(c.floatingCharacterFixKo, 220),
            }))
          : fallback.cutLocks,
    }),
  });
}

export async function runAssistSpeechBubbleTailOcclusionDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistSpeechBubbleTailOcclusionReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:speech-bubble-tail-occlusion-lock",
    input,
    options,
    fallback: buildLocalSpeechBubbleTailOcclusionLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 말풍선·SFX 비가림 & 꼬리 벡터 고정 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 웹툰 말풍선 및 대형 효과음(SFX)이 캐릭터의 얼굴·눈빛·비대칭 흉터·핵심 손동작을 가리지 않도록 네거티브 여백 좌표를 배치하고, 화자의 입 방향으로 말풍선 꼬리 각도를 고정하는 식자 공간 감독입니다. " +
      "antiOcclusionHealthScore는 0~100 정수로, 모든 지침은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷에 대해 화자별 말풍선 안전 배치 영역(safeAnchorZone), 안면 가림률(%), 입 방향 꼬리 각도(deg), SFX 레이어 Z-index 및 비가림 지침을 JSON으로 출력하세요.",
    schema: AssistSpeechBubbleTailOcclusionReportSchema,
    normalize: (parsed, fallback) => ({
      antiOcclusionHealthScore: clampPercent(parsed.antiOcclusionHealthScore, 99),
      letteringSpatialSummaryKo:
        cleanSingleLineText(parsed.letteringSpatialSummaryKo, 340) ||
        fallback.letteringSpatialSummaryKo,
      cutBubbleLocks:
        parsed.cutBubbleLocks.length > 0
          ? parsed.cutBubbleLocks.slice(0, 6).map((b, idx) => ({
              cutNumber: clampInt(b.cutNumber, 1, 50, idx + 1),
              speakerName: cleanSingleLineText(b.speakerName, 40) || "서진",
              safeAnchorZone: b.safeAnchorZone,
              faceAndEyeOcclusionPct: clampInt(b.faceAndEyeOcclusionPct, 0, 15, 0),
              tailTargetMouthAngleDeg: clampInt(b.tailTargetMouthAngleDeg, -180, 180, 132),
              sfxZIndexLayer: b.sfxZIndexLayer,
              antiOcclusionDirectiveKo: cleanSingleLineText(b.antiOcclusionDirectiveKo, 220),
            }))
          : fallback.cutBubbleLocks,
    }),
  });
}

export async function runAssistActionWeaponMotionArcDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistActionWeaponMotionArcReport>> {
  return executeCompetitorEngine({
    taskId: "competitor:action-weapon-motion-arc-smear-lock",
    input,
    options,
    fallback: buildLocalActionWeaponMotionArcSmearLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 검격·마법 궤적(Motion Arc) & 잔상 연속성 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 웹툰 액션 씬의 예비 동작(Wind-up) → 참격(Slash Smear) → 타격 역경직(Hit-Stop) → 잔심(Follow-through) 컷 간 무기/마법 궤적(Motion Arc) 각도 연속성과 잔상(Smear) 왜곡률을 총괄하는 액션 동화 감독입니다. " +
      "kineticContinuityScore는 0~100 정수로, 모든 지침은 한국어로 작성하세요.",
    userDirectiveKo:
      "위 웹툰 에피소드의 주요 4컷에 대해 액션 단계(actionPhase), 궤적 진입/이탈 각도(deg), 잔상 스트레치 배율, 집중선 수렴점 및 궤적 연속성 지침을 JSON으로 출력하세요.",
    schema: AssistActionWeaponMotionArcReportSchema,
    normalize: (parsed, fallback) => ({
      kineticContinuityScore: clampPercent(parsed.kineticContinuityScore, 97),
      combatChoreographySummaryKo:
        cleanSingleLineText(parsed.combatChoreographySummaryKo, 340) ||
        fallback.combatChoreographySummaryKo,
      cutArcs:
        parsed.cutArcs.length > 0
          ? parsed.cutArcs.slice(0, 6).map((a, idx) => ({
              cutNumber: clampInt(a.cutNumber, 1, 50, idx + 1),
              actionPhase: a.actionPhase,
              entryVectorAngleDeg: clampInt(a.entryVectorAngleDeg, -180, 180, -45),
              exitVectorAngleDeg: clampInt(a.exitVectorAngleDeg, -180, 180, 135),
              smearStretchRatio:
                Math.round(Math.min(3.0, Math.max(1.0, Number(a.smearStretchRatio) || 1.4)) * 100) /
                100,
              speedlineConvergencePointKo: cleanSingleLineText(a.speedlineConvergencePointKo, 160),
              arcContinuityDirectiveKo: cleanSingleLineText(a.arcContinuityDirectiveKo, 220),
            }))
          : fallback.cutArcs,
    }),
  });
}

export async function runAssistVehicleSteedCarriageHarnessDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistVehicleSteedHarnessReport>> {
  return executeCompetitorEngine({
    taskId: "production:vehicle-steed-carriage-harness-lock",
    input,
    options,
    fallback: buildLocalVehicleSteedCarriageHarnessLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 말/마차/차량 탑승 비례 & 마구 연속성 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 웹툰 말(마필)·마차·차량 탑승 씬에서 기수와 탑승물의 인체 비례, 등자(Stirrup)·고삐(Reins)·운전석 핸들 방향 연속성을 감독하는 3D 에셋·작화 감독입니다.",
    userDirectiveKo:
      "위 에피소드에 등장하는 탑승물 명칭, 기수 비례 점수(0~100), 조향/고삐 방식, 등자·안장 접점 및 마구 증발 방지 규칙을 JSON으로 출력하세요.",
    schema: AssistVehicleSteedHarnessReportSchema,
    normalize: (parsed, fallback) => ({
      mountOrVehicleNameKo: cleanSingleLineText(parsed.mountOrVehicleNameKo, 120) || fallback.mountOrVehicleNameKo,
      riderProportionRatioScore: clampPercent(parsed.riderProportionRatioScore, 96),
      steeringOrReinSide: parsed.steeringOrReinSide,
      stirrupAndSeatHeightAnchorKo: cleanSingleLineText(parsed.stirrupAndSeatHeightAnchorKo, 240) || fallback.stirrupAndSeatHeightAnchorKo,
      harnessContinuityRuleKo: cleanSingleLineText(parsed.harnessContinuityRuleKo, 240) || fallback.harnessContinuityRuleKo,
    }),
  });
}

export async function runAssistMagicAuraElementalSigilDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistMagicAuraElementalSigilReport>> {
  return executeCompetitorEngine({
    taskId: "production:magic-aura-elemental-sigil-geometry-lock",
    input,
    options,
    fallback: buildLocalMagicAuraElementalSigilLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 마법진 기하 도면 & 오러 발광 연속성 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 판타지·무협 웹툰의 마법진(Sigil) 다각형 기하 구조·룬 문자 링 수·오러/검기 코어 및 외곽 글로우 HEX 색온도를 고정하는 이펙트(VFX) 감독입니다.",
    userDirectiveKo:
      "시전자 이름, 마법진 다각형 꼭짓점 수, 내부 룬 링 수, 코어/외곽 HEX, 블렌드 모드 및 3D 평면 투영 일관성 규칙을 JSON으로 출력하세요.",
    schema: AssistMagicAuraElementalSigilReportSchema,
    normalize: (parsed, fallback) => ({
      casterName: cleanSingleLineText(parsed.casterName, 60) || fallback.casterName,
      sigilPolygonVertices: clampInt(parsed.sigilPolygonVertices, 3, 24, 8),
      innerRuneRingCount: clampInt(parsed.innerRuneRingCount, 1, 8, 3),
      coreGlowHex: cleanSingleLineText(parsed.coreGlowHex, 16) || fallback.coreGlowHex,
      outerRimAuraHex: cleanSingleLineText(parsed.outerRimAuraHex, 16) || fallback.outerRimAuraHex,
      blendLayerMode: parsed.blendLayerMode,
      sigilGeometryLockRuleKo: cleanSingleLineText(parsed.sigilGeometryLockRuleKo, 260) || fallback.sigilGeometryLockRuleKo,
      consistencyScore: clampPercent(parsed.consistencyScore, 98),
    }),
  });
}

export async function runAssistFoodTablewareBanquetPropDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistFoodTablewareBanquetReport>> {
  return executeCompetitorEngine({
    taskId: "production:food-tableware-banquet-prop-continuity",
    input,
    options,
    fallback: buildLocalFoodTablewareBanquetLock(),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 다과회/만찬 식기 배치 & 음료 수위 연속성 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 로맨스판타지 다과회·현대 카페·만찬 씬에서 찻잔/와인잔의 음료 수위 단조 감소(Monotonic Decrease)와 커틀러리 좌우 파지 일관성을 감수하는 소품 감독입니다.",
    userDirectiveKo:
      "장소명, 테이블 식기 배치 규칙, 컷 진행에 따른 음료 수위 변화 규칙, 커틀러리 파지 규칙 및 일관성 점수(0~100)를 JSON으로 출력하세요.",
    schema: AssistFoodTablewareBanquetReportSchema,
    normalize: (parsed, fallback) => ({
      sceneLocationKo: cleanSingleLineText(parsed.sceneLocationKo, 100) || fallback.sceneLocationKo,
      tablewareLayoutRuleKo: cleanSingleLineText(parsed.tablewareLayoutRuleKo, 240) || fallback.tablewareLayoutRuleKo,
      liquidLevelProgressionKo: cleanSingleLineText(parsed.liquidLevelProgressionKo, 240) || fallback.liquidLevelProgressionKo,
      cutleryHandRuleKo: cleanSingleLineText(parsed.cutleryHandRuleKo, 220) || fallback.cutleryHandRuleKo,
      continuityScore: clampPercent(parsed.continuityScore, 96),
    }),
  });
}

export async function runAssistMirrorWaterWindowReflectionDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<AssistMirrorWaterWindowReflectionReport>> {
  return executeCompetitorEngine({
    taskId: "production:mirror-water-window-reflection-axis-lock",
    input,
    options,
    fallback: buildLocalMirrorWaterWindowReflectionLock(input),
    noRouteReasonKo: "활성 Claude 경로가 없어 로컬 거울·수면·유리창 반사상 광학 대칭축 엔진을 사용했습니다.",
    systemPromptKo:
      "당신은 웹툰 거울·유리창·수면 반사 컷에서 입사각/반사각 법선 벡터와 비대칭 흉터·가르마의 평면 대칭(Plane Symmetry), 프레넬 반투명도를 감수하는 광학 연출 감독입니다.",
    userDirectiveKo:
      "반사 표면 종류, 대칭 검증 여부, 법선 벡터 규칙, 비대칭 특징 반사 규칙, 프레넬 불투명도(%) 및 광학 점수(0~100)를 JSON으로 출력하세요.",
    schema: AssistMirrorWaterWindowReflectionReportSchema,
    normalize: (parsed, fallback) => ({
      reflectiveSurfaceType: parsed.reflectiveSurfaceType,
      reflectionSymmetryVerified: Boolean(parsed.reflectionSymmetryVerified),
      normalVectorLawRuleKo: cleanSingleLineText(parsed.normalVectorLawRuleKo, 240) || fallback.normalVectorLawRuleKo,
      asymmetricFeatureReflectionKo: cleanSingleLineText(parsed.asymmetricFeatureReflectionKo, 240) || fallback.asymmetricFeatureReflectionKo,
      fresnelOpacityPct: clampPercent(parsed.fresnelOpacityPct, 78),
      opticalConsistencyScore: clampPercent(parsed.opticalConsistencyScore, 98),
    }),
  });
}
