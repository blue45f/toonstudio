/**
 * claude-competitor-full-suite.ts
 *
 * REA(reverse-engineer-anything) 정적/의무 원장 분석 및 2025~2026 글로벌·국내 13대 웹툰 AI 경쟁사 벤치마크를 통해
 * 도출된 5대 핵심 프로덕션 AI 엔진:
 * 1. `runClaudeSketchToLineartLayerSplitter` (Cream AiD & Clip Studio Paint 5.0)
 * 2. `runClaudeStyleTransferAndRelightingDirector` (Komiko AI & LlamaGen Colorizer Suite)
 * 3. `runClaudeSakugaMotionAndFacialMatrixDirector` (SkyReels & Mootion)
 * 4. `runClaude3dHandHeadPoseAndLtRigDirector` (Clip Studio Paint 3.0~5.0 & Posemaniacs)
 * 5. `runClaudeScreenplayBeatAndLoraLockBridge` (Katalist.ai & Anifusion)
 */

import type Anthropic from "@anthropic-ai/sdk";

import {
  CLAUDE_DEFAULT_MODEL_ID,
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
  buildLocal3dHandHeadPoseAndLtRig,
  buildLocalSakugaMotionAndFacialMatrix,
  buildLocalScreenplayBeatAndLoraLock,
  buildLocalSketchToLineartLayerSplit,
  buildLocalStyleTransferAndRelighting,
  Claude3dHandHeadRigReportSchema,
  ClaudeSakugaMotionReportSchema,
  ClaudeScreenplayLoraBridgeReportSchema,
  ClaudeSketchToLineartReportSchema,
  ClaudeStyleTransferReportSchema,
  type Claude3dHandHeadRigReport,
  type ClaudeSakugaMotionReport,
  type ClaudeScreenplayLoraBridgeReport,
  type ClaudeSketchToLineartReport,
  type ClaudeStyleTransferReport,
  type CompetitorEngineExecutionMeta,
  type WebtoonStyleTransferPresetId,
} from "./claude-competitor-full-suite-schemas";
import { resolveCreatorTaskModelRoute } from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  clampInt,
  type RunWebtoonProductionAssistOptions,
  type WebtoonProductionAssistInput,
} from "./claude-webtoon-production-schemas";

export * from "./claude-competitor-full-suite-schemas";

const MAX_OUTPUT_TOKENS = 4_096;

function resolveOrHydrateClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  const current = resolveClaudeRoute();
  if (current) return current;
  hydrateDefaultEnvClaudeConnection();
  return resolveClaudeRoute();
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

export async function runClaudeSketchToLineartLayerSplitter(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<ClaudeSketchToLineartReport>> {
  const fallback = buildLocalSketchToLineartLayerSplit(input);
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude 경로가 없어 로컬 AiD 4레이어 분리 엔진을 사용했습니다.",
    };
  }
  const taskRoute = resolveCreatorTaskModelRoute("competitor:beluga-clipstudio-production", {
    model: options.model as never,
  });
  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text:
          "당신은 크림 에이드(Cream AiD)와 클립스튜디오 페인트 5.0 벡터 선화 공정을 총괄하는 웹툰 선화·레이어 분리 디렉터입니다. " +
          "컷별 외곽선/내선 굵기(mm), 벡터 교차점 트리밍 규칙, L4~L1 4레이어 분리 사양을 한국어로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildCompetitorPromptContext(
          input,
          "위 웹툰 에피소드의 주요 4컷에 대해 스케치→벡터 선화 변환 사양과 L4(벡터 선화), L3(셀 그림자), L2(밑색 ID), L1(3D 배경 LT) 4레이어 분리 가이드를 JSON으로 생성해 주세요.",
        ),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeSketchToLineartReportSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeSketchToLineartReportSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    return {
      report: {
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
      },
      source: "claude-live",
      modelUsed: actualModel,
      usage,
      estimatedCostUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0,
    };
  } catch (err) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: requestedModel,
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: err instanceof Error ? err.message : "Claude API 호출 실패",
    };
  }
}

export async function runClaudeStyleTransferAndRelightingDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions & {
    readonly preferredPreset?: WebtoonStyleTransferPresetId;
  } = {},
): Promise<CompetitorEngineExecutionMeta<ClaudeStyleTransferReport>> {
  const preset = options.preferredPreset ?? "rofan-watercolor-glow";
  const fallback = buildLocalStyleTransferAndRelighting(input, preset);
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude 경로가 없어 로컬 Komiko/LlamaGen 리라이팅 엔진을 사용했습니다.",
    };
  }
  const taskRoute = resolveCreatorTaskModelRoute("competitor:llamagen-manga-ai", {
    model: options.model as never,
  });
  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text:
          "당신은 Komiko AI와 LlamaGen Colorizer Suite를 능가하는 웹툰 화풍 변환 및 3D 리라이팅(Relighting) 감독입니다. " +
          "선화 보존율(lineartPreservationPct)은 0~100 정수로, 모든 지침은 한국어로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildCompetitorPromptContext(
          input,
          `타깃 화풍 프리셋 '${preset}'을 적용해 주요 4컷의 화풍 변환 및 3D 광원 리라이팅(방위각, 고도각, 색온도 K, 대표 HEX 팔레트) 지시서를 JSON으로 작성해 주세요.`,
        ),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeStyleTransferReportSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeStyleTransferReportSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    return {
      report: {
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
      },
      source: "claude-live",
      modelUsed: actualModel,
      usage,
      estimatedCostUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0,
    };
  } catch (err) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: requestedModel,
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: err instanceof Error ? err.message : "Claude API 호출 실패",
    };
  }
}

export async function runClaudeSakugaMotionAndFacialMatrixDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<ClaudeSakugaMotionReport>> {
  const fallback = buildLocalSakugaMotionAndFacialMatrix(input);
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude 경로가 없어 로컬 SkyReels/Mootion 모션웹툰 엔진을 사용했습니다.",
    };
  }
  const taskRoute = resolveCreatorTaskModelRoute("competitor:llamagen-manga-ai", {
    model: options.model as never,
  });
  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text:
          "당신은 SkyReels Comic Studio와 Mootion의 33종 표정 매트릭스 및 사쿠가(Sakuga) 모션웹툰 총괄 감독입니다. " +
          "pupilConstrictionPct는 0~100 정수로, 모든 해설은 한국어로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildCompetitorPromptContext(
          input,
          "위 웹툰 에피소드의 주요 4컷을 33종 안면 근육(FACS) 표정 매트릭스 코드와 사쿠가(Sakuga) 카메라 모션 곡선, 9:16 숏폼 비디오 트레일러 키프레임으로 변환해 JSON으로 출력하세요.",
        ),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeSakugaMotionReportSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeSakugaMotionReportSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    return {
      report: {
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
      },
      source: "claude-live",
      modelUsed: actualModel,
      usage,
      estimatedCostUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0,
    };
  } catch (err) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: requestedModel,
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: err instanceof Error ? err.message : "Claude API 호출 실패",
    };
  }
}

export async function runClaude3dHandHeadPoseAndLtRigDirector(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<Claude3dHandHeadRigReport>> {
  const fallback = buildLocal3dHandHeadPoseAndLtRig(input);
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude 경로가 없어 로컬 CSP 5.0 3D 핸드·헤드 리그 엔진을 사용했습니다.",
    };
  }
  const taskRoute = resolveCreatorTaskModelRoute("competitor:beluga-clipstudio-production", {
    model: options.model as never,
  });
  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text:
          "당신은 클립스튜디오 페인트 5.0 3D 핸드·헤드 및 Posemaniacs 인체 투시, 3D LT(Line & Tone) 변환 수석 테크니컬 디렉터입니다. " +
          "모든 설명은 한국어로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildCompetitorPromptContext(
          input,
          "위 웹툰 에피소드의 주요 4컷에 대해 3D 손 관절 프리셋, 3D 두상 Pitch/Yaw/Roll 각도, Posemaniacs 과장 투시 배율, CSP 5.0 카툰 LT 윤곽선·셀 그림자 추출 임계값을 JSON으로 설계해 주세요.",
        ),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      Claude3dHandHeadRigReportSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: Claude3dHandHeadRigReportSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    return {
      report: {
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
      },
      source: "claude-live",
      modelUsed: actualModel,
      usage,
      estimatedCostUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0,
    };
  } catch (err) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: requestedModel,
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: err instanceof Error ? err.message : "Claude API 호출 실패",
    };
  }
}

export async function runClaudeScreenplayBeatAndLoraLockBridge(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<CompetitorEngineExecutionMeta<ClaudeScreenplayLoraBridgeReport>> {
  const fallback = buildLocalScreenplayBeatAndLoraLock(input);
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude 경로가 없어 로컬 Katalist/Anifusion 브리지 엔진을 사용했습니다.",
    };
  }
  const taskRoute = resolveCreatorTaskModelRoute("competitor:onoma-kakaopage-ip", {
    model: options.model as never,
  });
  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text:
          "당신은 Katalist.ai와 Anifusion의 시나리오 비트 분해 및 FLUX/Animagine 캐릭터 LoRA 시드 락 파이프라인 아키텍트입니다. " +
          "pipelineCompatibilityScore는 0~100 정수로, 모든 해설은 한국어로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildCompetitorPromptContext(
          input,
          "위 웹툰 에피소드의 주요 4컷을 시나리오 액션 비트와 패널 그리드 템플릿, FLUX/Animagine 캐릭터 LoRA 가중치 및 REA 의무 원장 ID(reaObligationId)로 분해해 JSON으로 출력하세요.",
        ),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeScreenplayLoraBridgeReportSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeScreenplayLoraBridgeReportSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    return {
      report: {
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
      },
      source: "claude-live",
      modelUsed: actualModel,
      usage,
      estimatedCostUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0,
    };
  } catch (err) {
    return {
      report: fallback,
      source: "local-fallback",
      modelUsed: requestedModel,
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: err instanceof Error ? err.message : "Claude API 호출 실패",
    };
  }
}
