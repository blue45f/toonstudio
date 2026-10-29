/**
 * claude-webtoon-episodic-doctor.ts
 *
 * Phase 2 차세대 웹툰 에피소드 프로덕션 AI 보조 엔진 4종:
 * 1. 독자 스크롤 체류·이탈 구간 & 베스트 댓글·별점 예측 시뮬레이터 (네이버웹툰·카카오페이지·쿠아이칸 데이터 벤치마크)
 * 2. 캐릭터 말투·성격 캐붕(OOC) 레이더 & 3종 서브텍스트 대사 윤색기 (오노마AI 페뷸레이터·캐릭터 캐논 벤치마크)
 * 3. 컷별 3D 배경·소품 에셋 배치 & 카메라 렌즈/심도(DoF)/안개 디렉터 (리얼드로우·클립스튜디오 3D 소재 벤치마크)
 * 4. 웹툰 BGM · 폴리 효과음 · 오디오툰(보이스 드라마) 큐시트 디렉터 (네이버웹툰 BGM·오디오툰 파이프라인 벤치마크)
 */
import {
  ASSIST_DEFAULT_MODEL_ID,
  assistModelInfo,
  assistModelSupportsEffort,
  estimateAssistCostUsd,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import { resolveCreatorTaskModelRoute } from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";
import {
  buildDeterministicBg3dLightingAssetReport,
  buildDeterministicBgmAudioToonReport,
  buildDeterministicCharacterOocRadarReport,
  buildDeterministicCrowdDepthFogLockReport,
  buildDeterministicFootwearStrideLockReport,
  buildDeterministicMultiEpisodeCanonVaultReport,
  buildDeterministicReaderRetentionReport,
  buildDeterministicVisualContinuityLinterReport,
  AssistBg3dLightingAssetSchema,
  AssistBgmAudioToonSchema,
  AssistCharacterOocRadarSchema,
  AssistCrowdDepthFogLockSchema,
  AssistFootwearStrideLockSchema,
  AssistMultiEpisodeCanonVaultSchema,
  AssistReaderRetentionSchema,
  AssistVisualContinuityLinterSchema,
  type AssistBg3dLightingAssetView,
  type AssistBgmAudioToonView,
  type AssistCharacterOocRadarView,
  type AssistCrowdDepthFogLockView,
  type AssistFootwearStrideLockView,
  type AssistMultiEpisodeCanonVaultView,
  type AssistReaderRetentionView,
  type AssistVisualContinuityLinterView,
  type WebtoonEpisodicDoctorMode,
  type WebtoonEpisodicDoctorView,
} from "./assist-webtoon-episodic-schemas";
import {
  clampInt,
  type RunWebtoonProductionAssistOptions,
  type WebtoonProductionAssistInput,
} from "./assist-webtoon-production-schemas";

import type Anthropic from "@anthropic-ai/sdk";

export * from "./assist-webtoon-episodic-schemas";

const MAX_OUTPUT_TOKENS = 4_000;

function resolveActiveAssistRoute(
  explicit?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null,
): Pick<AssistRoute, "apiKey" | "revision" | "model"> | null {
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
  return explicit ?? resolveAssistRoute();
}

function buildEpisodicContextPrompt(
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
    `작가 화풍: ${artistLabel}`,
    `타깃 로케일: ${input.targetLocale ?? "ko"}`,
    ...(scriptSnippet ? [`현재 대본 초안: ${scriptSnippet}`] : []),
    "",
    directiveKo,
  ].join("\n");
}

function clampStarRating(value: number): number {
  if (!Number.isFinite(value)) return 9.92;
  return Math.round(Math.min(10, Math.max(7.5, value)) * 100) / 100;
}

export async function runAssistReaderRetentionSimulator(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistReaderRetentionView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicReaderRetentionReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:retention-simulator", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 네이버웹툰·카카오페이지·쿠아이칸 독자 스크롤 빅데이터를 분석하는 웹툰 에피소드 독자 체류·이탈 시뮬레이터입니다. 컷별 예상 체류 시간(초), 스크롤 이탈 위험도(%), 이탈 원인 및 잔존율 개선 지문, 예상 베스트 댓글 3선과 목표 별점을 JSON으로 예측하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 에피소드의 컷별 독자 체류 시간(초)·이탈 위험도(%) 곡선(최대 4컷)과 예상 베스트 댓글 3선, 예상 별점을 JSON으로 시뮬레이션해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistReaderRetentionSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistReaderRetentionSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "reader-retention-simulator",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      predictedEpisodeStarRating: clampStarRating(parsed.predictedEpisodeStarRating),
      completionRatePct: clampInt(parsed.completionRatePct, 50, 100, 94),
      scrollVelocitySummaryKo: cleanSingleLineText(parsed.scrollVelocitySummaryKo, 200),
      cutRetentionCurve: Object.freeze(
        (parsed.cutRetentionCurve ?? []).slice(0, 4).map((item, idx) =>
          Object.freeze({
            cutNumber: clampInt(item.cutNumber, 1, 50, idx + 1),
            dwellTimeSeconds:
              Math.round(Math.min(15, Math.max(0.8, Number(item.dwellTimeSeconds) || 3.2)) * 10) /
              10,
            dropOffRiskPct: clampInt(item.dropOffRiskPct, 1, 80, 8),
            dropOffReasonKo: cleanSingleLineText(item.dropOffReasonKo, 180),
            retentionBoostFixKo: cleanSingleLineText(item.retentionBoostFixKo, 180),
            readyRetentionDirectionLine: cleanSingleLineText(item.readyRetentionDirectionLine, 180),
          }),
        ),
      ),
      predictedTopComments: Object.freeze(
        (parsed.predictedTopComments ?? []).slice(0, 4).map((c) =>
          Object.freeze({
            personaLabelKo: cleanSingleLineText(c.personaLabelKo, 40) || "독자",
            commentTextKo: cleanSingleLineText(c.commentTextKo, 180),
            predictedLikes: clampInt(c.predictedLikes, 10, 99999, 1200),
            sentimentTone: c.sentimentTone,
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicReaderRetentionReport(input);
    }
    throw error;
  }
}

export async function runAssistCharacterOocRadar(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistCharacterOocRadarView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicCharacterOocRadarReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:ooc-voice-doctor", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 캐릭터 캐논 기준 웹툰 대사 캐붕(OOC: Out of Character) 감수 및 서브텍스트 윤색 디렉터입니다. 인물별 어조/어미 일관성 점수(0~100), 캐붕 위험도, 숨겨진 욕망(Subtext), 그리고 3가지 대안 대사(캐논 정통형·고긴장 서브텍스트형·모바일 42자 압축형)를 JSON으로 제안하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 대본의 주요 대사(최대 4개 비트)에 대해 캐릭터 말투 일관성(OOC 여부)을 진단하고 3종 윤색 대안을 JSON으로 작성해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistCharacterOocRadarSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistCharacterOocRadarSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "character-ooc-radar",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      voiceConsistencyScore: clampInt(parsed.voiceConsistencyScore, 0, 100, 94),
      relationshipTensionSummaryKo: cleanSingleLineText(parsed.relationshipTensionSummaryKo, 200),
      dialogueAudits: Object.freeze(
        (parsed.dialogueAudits ?? []).slice(0, 4).map((d, idx) =>
          Object.freeze({
            cutNumber: clampInt(d.cutNumber, 1, 50, idx + 1),
            speakerName: cleanSingleLineText(d.speakerName, 40) || "주인공",
            originalLine: cleanSingleLineText(d.originalLine, 140),
            oocRiskLevel: d.oocRiskLevel,
            speechRegisterKo: cleanSingleLineText(d.speechRegisterKo, 80),
            oocDiagnosisKo: cleanSingleLineText(d.oocDiagnosisKo, 160),
            subtextHiddenDesireKo: cleanSingleLineText(d.subtextHiddenDesireKo, 160),
            canonicalLine: cleanSingleLineText(d.canonicalLine, 120),
            highTensionSubtextLine: cleanSingleLineText(d.highTensionSubtextLine, 120),
            conciseMobileLine: cleanSingleLineText(d.conciseMobileLine, 60),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicCharacterOocRadarReport(input);
    }
    throw error;
  }
}

export async function runAssistBg3dLightingAssetDirector(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistBg3dLightingAssetView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicBg3dLightingAssetReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:3d-asset-placement", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 웹툰 3D 배경 에셋 디렉터입니다. 컷별 3D 공간 카테고리, 카메라 초점거리(mm), 카메라 높이(cm), 틸트 각도(°), 피사계 심도(DoF 블러 %), 안개 농도(%), 전경/중경 소품 배치와 그림자 방향을 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 장면의 컷별 3D 배경·소품 배치 및 카메라 렌즈/DoF/안개 파라미터(최대 4컷)를 JSON으로 추천해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistBg3dLightingAssetSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistBg3dLightingAssetSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "bg3d-lighting-asset-director",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      spatialSceneSummaryKo: cleanSingleLineText(parsed.spatialSceneSummaryKo, 200),
      recommendedAssetPackKo: cleanSingleLineText(parsed.recommendedAssetPackKo, 160),
      cut3dSpecs: Object.freeze(
        (parsed.cut3dSpecs ?? []).slice(0, 4).map((c, idx) =>
          Object.freeze({
            cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
            spaceCategory: c.spaceCategory,
            cameraLensMm: clampInt(c.cameraLensMm, 14, 200, 35),
            cameraHeightCm: clampInt(c.cameraHeightCm, 10, 500, 140),
            cameraTiltDeg: clampInt(c.cameraTiltDeg, -60, 60, 0),
            dofBlurStrengthPct: clampInt(c.dofBlurStrengthPct, 0, 100, 35),
            fogDensityPct: clampInt(c.fogDensityPct, 0, 100, 25),
            keyPropPlacementsKo: cleanSingleLineText(c.keyPropPlacementsKo, 160),
            shadowCastDirectionKo: cleanSingleLineText(c.shadowCastDirectionKo, 140),
            ready3dStageLine: cleanSingleLineText(c.ready3dStageLine, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicBg3dLightingAssetReport(input);
    }
    throw error;
  }
}

export async function runAssistBgmAudioToonCuesheet(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistBgmAudioToonView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicBgmAudioToonReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:audio-cuesheet-director", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 네이버웹툰 BGM 및 글로벌 오디오툰(Audio-Toon · 보이스 드라마) 사운드 큐시트 디렉터입니다. 에피소드 메인 테마·권장 BPM·조성(Key)과 컷별 스크롤 진입 트리거, BGM 편곡, 폴리(Foley) 환경음, 성우 호흡·포즈(ms) 디렉션을 JSON으로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 장면의 스크롤 연동 BGM·폴리 효과음·성우 연기 큐시트(최대 4컷)를 JSON으로 설계해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistBgmAudioToonSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistBgmAudioToonSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "bgm-audiotoon-cuesheet",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      episodeSoundtrackThemeKo: cleanSingleLineText(parsed.episodeSoundtrackThemeKo, 180),
      recommendedBpm: clampInt(parsed.recommendedBpm, 45, 200, 96),
      musicalKeySignature: cleanSingleLineText(parsed.musicalKeySignature, 40) || "D Minor",
      audioCues: Object.freeze(
        (parsed.audioCues ?? []).slice(0, 4).map((c, idx) =>
          Object.freeze({
            cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
            scrollTriggerTiming: c.scrollTriggerTiming,
            bgmTrackStyleKo: cleanSingleLineText(c.bgmTrackStyleKo, 140),
            foleyAmbienceKo: cleanSingleLineText(c.foleyAmbienceKo, 140),
            voiceActingDirectionKo: cleanSingleLineText(c.voiceActingDirectionKo, 160),
            breathAndPauseMs: clampInt(c.breathAndPauseMs, 50, 3000, 250),
            readyAudioCueLine: cleanSingleLineText(c.readyAudioCueLine, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicBgmAudioToonReport(input);
    }
    throw error;
  }
}

export async function runAssistVisualContinuityLinter(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistVisualContinuityLinterView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false)
      return buildDeterministicVisualContinuityLinterReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:visual-continuity-linter", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 웹툰 연재 원고의 컷간 작붕(비대칭 흉터·안대·검집 좌우 반전, 무기/소품 증발, 전투 부상 초기화, 배경-인물 그림자 광원 충돌)을 전수 감사하는 비주얼 연속성 린터(Visual Continuity Linter)입니다. 컷 전환 구간별 작붕 위험도와 예방 프롬프트 가드를 JSON으로 출력하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 에피소드의 연속 컷 전환 구간(최대 4개 전환)에서 발생하기 쉬운 작붕 위험과 예방 프롬프트 가드를 JSON으로 진단해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel)
      ? { output_config: { effort: taskRoute.effort } }
      : {}),
  };

  try {
    const { message, parsed } = await assistParse(activeRoute, request, AssistVisualContinuityLinterSchema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema: AssistVisualContinuityLinterSchema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "episodic-visual-continuity-linter",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      visualContinuityScore: clampInt(parsed.visualContinuityScore, 50, 100, 98),
      zeroAnimationErrorGuarantee: Boolean(parsed.zeroAnimationErrorGuarantee),
      linterSummaryKo: cleanSingleLineText(parsed.linterSummaryKo, 200),
      cutContinuityChecks: Object.freeze(
        (parsed.cutContinuityChecks ?? []).slice(0, 4).map((c) =>
          Object.freeze({
            cutTransitionLabel: cleanSingleLineText(c.cutTransitionLabel, 80) || "Cut 1 → Cut 2",
            errorCategory: c.errorCategory,
            riskSeverity: c.riskSeverity,
            detectedRiskKo: cleanSingleLineText(c.detectedRiskKo, 180),
            preventivePromptGuardKo: cleanSingleLineText(c.preventivePromptGuardKo, 180),
            readyContinuityGuardLine: cleanSingleLineText(c.readyContinuityGuardLine, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicVisualContinuityLinterReport(input);
    }
    throw error;
  }
}

export async function runAssistMultiEpisodeCanonVault(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistMultiEpisodeCanonVaultView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicMultiEpisodeCanonVaultReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:multi-episode-canon-vault", { model: options.model as never });
  const requestedModel = resolveAssistRequestModel(options.model ?? taskRoute.model, activeRoute.model || ASSIST_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 장편 연재 웹툰(1~100화)의 캐릭터 외형 변천사, 상호 호칭/말투 매트릭스, 미회수 복선(Chekhov's Gun), 세계관 공간 규칙을 관리하는 멀티 에피소드 캐논 메모리 볼트(Canon Memory Vault) 디렉터입니다. JSON으로 캐논 무결성 점검 결과를 생성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 에피소드가 장편 연재 캐논(외형 변천·상호 호칭·미회수 떡밥·공간 규칙)과 100% 일관되도록 캐논 메모리 볼트 항목(최대 4개)을 JSON으로 설계해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: taskRoute.effort } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(activeRoute, request, AssistMultiEpisodeCanonVaultSchema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema: AssistMultiEpisodeCanonVaultSchema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "multi-episode-canon-memory-vault",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      canonVaultIntegrityScore: clampInt(parsed.canonVaultIntegrityScore, 50, 100, 99),
      serializedArcTimelineKo: cleanSingleLineText(parsed.serializedArcTimelineKo, 200),
      canonEntries: Object.freeze(
        (parsed.canonEntries ?? []).slice(0, 4).map((e, idx) =>
          Object.freeze({
            entryId: cleanSingleLineText(e.entryId, 40) || `canon-vault-0${idx + 1}`,
            canonCategory: e.canonCategory,
            establishedEpisodeLabel: cleanSingleLineText(e.establishedEpisodeLabel, 60) || "EP.01",
            immutableRuleKo: cleanSingleLineText(e.immutableRuleKo, 180),
            currentEpisodeSyncDirectiveKo: cleanSingleLineText(e.currentEpisodeSyncDirectiveKo, 180),
            readyCanonVaultLine: cleanSingleLineText(e.readyCanonVaultLine, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicMultiEpisodeCanonVaultReport(input);
    }
    throw error;
  }
}

export async function runAssistFootwearStrideLockDirector(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistFootwearStrideLockView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicFootwearStrideLockReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:footwear-floor-contact-stride-lock", { model: options.model as never });
  const requestedModel = resolveAssistRequestModel(options.model ?? taskRoute.model, activeRoute.model || ASSIST_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 웹툰 캐릭터의 신발·부츠 굽 높이, 밑창·버클 디테일, 계단·경사로 바닥 접지(Floor Contact AO) 및 보폭 투시 일관성을 총괄하는 디렉터입니다. JSON으로만 응답하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 에피소드에서 캐릭터 신발 굽·밑창 변형 및 계단 공중부양 작붕을 막기 위한 접지 고정 명세를 JSON으로 설계해 주세요.",
        ),
      },
    ],
  };

  try {
    const { message, parsed } = await assistParse(activeRoute, request, AssistFootwearStrideLockSchema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema: AssistFootwearStrideLockSchema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "episodic-footwear-floor-contact-stride-lock",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      footwearIntegrityScore: clampInt(parsed.footwearIntegrityScore, 50, 100, 97),
      strideSummaryKo: cleanSingleLineText(parsed.strideSummaryKo, 200),
      heelHeightCm: Math.max(0, Math.min(20, Number(parsed.heelHeightCm) || 4.5)),
      soleAndBuckleSpecKo: cleanSingleLineText(parsed.soleAndBuckleSpecKo, 180),
      stairSlopeContactRuleKo: cleanSingleLineText(parsed.stairSlopeContactRuleKo, 180),
      readyFootwearGuardLine: cleanSingleLineText(parsed.readyFootwearGuardLine, 180),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicFootwearStrideLockReport(input);
    }
    throw error;
  }
}

export async function runAssistCrowdDepthFogLockDirector(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistCrowdDepthFogLockView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicCrowdDepthFogLockReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("nextgen:crowd-silhouette-depth-fog-lock", { model: options.model as never });
  const requestedModel = resolveAssistRequestModel(options.model ?? taskRoute.model, activeRoute.model || ASSIST_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 웹툰 전경 주연과 중경·원경 군중 엑스트라의 선화 굵기 감쇠비율 및 대기 원근 안개(Depth Fog) 밀도를 통제하는 배경·군중 디렉터입니다. JSON으로만 응답하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildEpisodicContextPrompt(
          input,
          "위 웹툰 에피소드에서 배경 엑스트라가 주연보다 튀는 작붕을 막기 위한 3단 선화·대기원근 고정 명세를 JSON으로 설계해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: taskRoute.effort } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(activeRoute, request, AssistCrowdDepthFogLockSchema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema: AssistCrowdDepthFogLockSchema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "episodic-crowd-silhouette-depth-fog-lock",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      depthHierarchyScore: clampInt(parsed.depthHierarchyScore, 50, 100, 98),
      crowdAtmosphereSummaryKo: cleanSingleLineText(parsed.crowdAtmosphereSummaryKo, 200),
      heroLineWeightMultiplier: Math.max(0.5, Math.min(2.0, Number(parsed.heroLineWeightMultiplier) || 1.0)),
      midgroundCrowdLineMultiplier: Math.max(0.2, Math.min(1.0, Number(parsed.midgroundCrowdLineMultiplier) || 0.65)),
      backgroundSilhouetteFogPct: clampInt(parsed.backgroundSilhouetteFogPct, 10, 90, 45),
      readyCrowdDepthGuardLine: cleanSingleLineText(parsed.readyCrowdDepthGuardLine, 180),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicCrowdDepthFogLockReport(input);
    }
    throw error;
  }
}

export async function runAssistWebtoonEpisodicDoctor(
  mode: WebtoonEpisodicDoctorMode,
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<WebtoonEpisodicDoctorView> {
  switch (mode) {
    case "reader-retention-simulator":
      return runAssistReaderRetentionSimulator(input, options);
    case "character-ooc-radar":
      return runAssistCharacterOocRadar(input, options);
    case "bg3d-lighting-asset-director":
      return runAssistBg3dLightingAssetDirector(input, options);
    case "bgm-audiotoon-cuesheet":
      return runAssistBgmAudioToonCuesheet(input, options);
    case "episodic-visual-continuity-linter":
      return runAssistVisualContinuityLinter(input, options);
    case "multi-episode-canon-memory-vault":
      return runAssistMultiEpisodeCanonVault(input, options);
    case "episodic-footwear-floor-contact-stride-lock":
      return runAssistFootwearStrideLockDirector(input, options);
    case "episodic-crowd-silhouette-depth-fog-lock":
      return runAssistCrowdDepthFogLockDirector(input, options);
  }
}
