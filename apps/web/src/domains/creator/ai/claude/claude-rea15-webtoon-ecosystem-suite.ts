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
  CreativeDopamineAndUxSynthesizerSchema,
  GlimnaviRelightAndLineartV23Schema,
  KaistorySingleEnvelopeAndKaionSchema,
  KreaSplineLumiereRealtimeShaderSchema,
  LtxBoordsCascadeurRiveAnimaticSchema,
  ManhwaKomikoAnifusionFlowSchema,
  REA15_PLATFORM_IDS,
  REA15_PLATFORM_UI_THEME_CATALOG,
  SnaptoonFrameoShaper3dDirectorSchema,
  TootoonGentoonTooningKrSuiteSchema,
  type CreativeDopamineAndUxSynthesizerReport,
  type GlimnaviRelightAndLineartV23Report,
  type KaistorySingleEnvelopeAndKaionReport,
  type KreaSplineLumiereRealtimeShaderReport,
  type LtxBoordsCascadeurRiveAnimaticReport,
  type ManhwaKomikoAnifusionFlowReport,
  type Rea15Envelope,
  type Rea15ExecutionMeta,
  type Rea15FullSuiteBundle,
  type Rea15PlatformId,
  type Rea15PlatformUiThemeSpec,
  type SnaptoonFrameoShaper3dDirectorReport,
  type TootoonGentoonTooningKrSuiteReport,
} from "./claude-rea15-webtoon-ecosystem-schemas";
import type {
  RunWebtoonProductionAssistOptions,
  WebtoonProductionAssistInput,
} from "./claude-webtoon-production-schemas";

export * from "./claude-rea15-webtoon-ecosystem-schemas";

function resolveOrHydrateClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  if (import.meta.env.MODE === "test") return null;
  const current = resolveClaudeRoute();
  if (current) return current;
  hydrateDefaultEnvClaudeConnection();
  return resolveClaudeRoute();
}

function buildRea15PromptContext(
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

function makeRea15Envelope<T>(
  report: T,
  source: "claude-live" | "local-fallback",
  meta: Rea15ExecutionMeta,
): Rea15Envelope<T> {
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

async function executeRea15Engine<TSchema extends z.ZodTypeAny>(params: {
  taskId: ClaudeCreatorTaskId;
  input: WebtoonProductionAssistInput;
  options: RunWebtoonProductionAssistOptions;
  systemPromptKo: string;
  userDirectiveKo: string;
  schema: TSchema;
  fallbackReport: z.infer<TSchema>;
}): Promise<Rea15Envelope<z.infer<TSchema>>> {
  const { taskId, input, options, systemPromptKo, userDirectiveKo, schema, fallbackReport } =
    params;
  const taskRoute = resolveCreatorTaskModelRoute(taskId, {
    model: options.model as never,
  });
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);

  if (!activeRoute) {
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude API 경로가 없어 결정적 로컬 폴백 엔진을 사용했습니다.",
    };
    return makeRea15Envelope(fallbackReport, "local-fallback", meta);
  }

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
        content: buildRea15PromptContext(input, userDirectiveKo),
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
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: actualModel,
      usage,
      estimatedCostUsd,
    };
    return makeRea15Envelope(parsed, "claude-live", meta);
  } catch (error) {
    if (options.fallbackOnError === false) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: cleanSingleLineText(reason, 220),
    };
    return makeRea15Envelope(fallbackReport, "local-fallback", meta);
  }
}

/* ============================================================================
 * 0. 15대 플랫폼 UI/UX 테마 토큰 조회 및 CSS 변수 생성 헬퍼
 * ============================================================================ */

export function listRea15PlatformThemes(): readonly Rea15PlatformUiThemeSpec[] {
  return REA15_PLATFORM_IDS.map((id) => REA15_PLATFORM_UI_THEME_CATALOG[id]);
}

export function getRea15PlatformTheme(platformId: Rea15PlatformId): Rea15PlatformUiThemeSpec {
  return REA15_PLATFORM_UI_THEME_CATALOG[platformId];
}

export function buildRea15ThemeCssVariables(
  platformId: Rea15PlatformId,
): Readonly<Record<string, string>> {
  const spec = REA15_PLATFORM_UI_THEME_CATALOG[platformId];
  return Object.freeze({
    "--rea15-surface": spec.surfaceHex,
    "--rea15-panel": spec.panelHex,
    "--rea15-border": spec.borderHex,
    "--rea15-text-primary": spec.textPrimaryHex,
    "--rea15-text-muted": spec.textMutedHex,
    "--rea15-accent-primary": spec.accentPrimaryHex,
    "--rea15-accent-secondary": spec.accentSecondaryHex,
    "--rea15-radius": `${spec.borderRadiusPx}px`,
    "--rea15-font-stack": spec.fontStack,
  });
}

/* ============================================================================
 * 1. GlimNavi Studio v2.3 — 5종 선화 워크플로우 · 6종 표현 프리셋 · 컬러 레이어 분리 · Relight
 * ============================================================================ */

export function buildLocalGlimnaviRelightAndLineartV23Report(
  input: WebtoonProductionAssistInput = {},
): GlimnaviRelightAndLineartV23Report {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    studioStageSummaryKo: `그림나비(GlimNavi) Studio v2.3 5단계 파이프라인(기획·각색→콘티→선화 v2.3 균형 선화→자동 채색→AI 그림자·조명·명암 Relight)을 적용해 ${protagonist}·${partner}의 ${genre} 클라이맥스 컷을 비파괴 레이어 제안으로 분리했습니다.`,
    selectedLineartVersion: "v2.3-balanced",
    selectedLineartPreset: "face-preserve",
    canvasBaseSize: "1920x1080",
    colorLayerSeparationEnabled: true,
    nonDestructiveProposalId: "prop_glimnavi_v23_relight_01",
    separatedColorLayers: [
      {
        layerId: "layer-skin-base",
        layerNameKo: `${protagonist}·${partner} 피부 밑색 분리 레이어`,
        dominantHex: "#FAD6C3",
        blendMode: "normal",
        opacityPct: 100,
        strokeGapTolerancePx: 3,
      },
      {
        layerId: "layer-costume-main",
        layerNameKo: "주연 전투 코트·제복 분리 레이어",
        dominantHex: "#1E293B",
        blendMode: "normal",
        opacityPct: 100,
        strokeGapTolerancePx: 4,
      },
      {
        layerId: "layer-ai-shadow",
        layerNameKo: "5단계 효과 — AI 그림자(Multiply)",
        dominantHex: "#312E81",
        blendMode: "multiply",
        opacityPct: 68,
        strokeGapTolerancePx: 2,
      },
      {
        layerId: "layer-ai-lighting",
        layerNameKo: "5단계 효과 — AI 조명효과·명암 하이라이트(Screen)",
        dominantHex: "#38BDF8",
        blendMode: "screen",
        opacityPct: 82,
        strokeGapTolerancePx: 2,
      },
    ],
    relightPass: {
      aiShadowDirectionDeg: 135,
      aiShadowSoftnessPct: 42,
      lightingKelvin: 5400,
      rimLightHex: "#00A8C2",
      ambientOcclusionIntensityPct: 64,
      shadingContrastBoostPct: 28,
      relightDirectiveKo:
        "우상단 135도 역광(Rim Light #00A8C2)으로 인물 실루엣을 배경에서 분리하고, 눈매·턱선 셀 그림자 경계를 선명하게 유지합니다.",
    },
    exportReadiness: {
      downloadCanvasReady: true,
      downloadAllLayersZipReady: true,
      downloadPsdReady: true,
    },
  };
}

export async function runGlimnaviRelightAndLineartV23Assist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<GlimnaviRelightAndLineartV23Report>> {
  const fallbackReport = buildLocalGlimnaviRelightAndLineartV23Report(input);
  return executeRea15Engine({
    taskId: "rea15:glimnavi-relight-lineart-v23",
    input,
    options,
    systemPromptKo:
      "당신은 그림나비(GlimNavi Studio /function-step3.html)의 5단계 웹툰 파이프라인(기획·각색→콘티→선화 v1.0~v2.3→자동채색→AI 그림자·조명·명암 Relight) 수석 테크니컬 아트 디렉터입니다. JSON 스키마에 맞춰 간결하고 정확한 한국어로 응답하세요.",
    userDirectiveKo:
      "현재 장면에 최적화된 선화 버전(v1.0-basic~v2.3-balanced), 선화 프리셋(face-preserve 등), 컬러 레이어 분리(4개 레이어), 그리고 AI 그림자·조명·명암 Relight 파라미터를 설계하세요.",
    schema: GlimnaviRelightAndLineartV23Schema,
    fallbackReport,
  });
}

/* ============================================================================
 * 2. KAISTORY — 4단계 단일 프로젝트 데이터 엔벨로프 & KAION 학습카드·독자 퀴즈
 * ============================================================================ */

export function buildLocalKaistorySingleEnvelopeAndKaionReport(
  input: WebtoonProductionAssistInput = {},
): KaistorySingleEnvelopeAndKaionReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const conflict =
    cleanSingleLineText(input.coreConflict ?? "봉인된 고대 유물의 각성과 두 주인공의 숙명적 대립", 120) ||
    "봉인된 고대 유물의 각성과 두 주인공의 숙명적 대립";

  return {
    envelopeSummaryKo: `KAISTORY 단일 프로젝트 엔벨로프(conti→design→editor→story)로 오프라인 우선 콘티부터 다국어 식자·화자별 TTS·KAION 독자 몰입 퀴즈 카드까지 하나의 정본 데이터로 연결했습니다.`,
    projectEnvelopeVersion: "kaistory-envelope-v2.6.0",
    offlineFirstSyncStatus: "synced-local-authoritative",
    subdomainStages: [
      {
        subdomain: "conti.kaistory.net",
        stageNameKo: "오프라인 우선 콘티 저작",
        derivedRevisionHash: "rev_conti_8a41f0",
        keyOutputSummaryKo: "IndexedDB 로컬 권위 기반 컷 분할·말풍선 좌표·카메라 샷 정의 완료",
      },
      {
        subdomain: "design.kaistory.net",
        stageNameKo: "레이어 PSD · 다국어 자동화 · 화자별 TTS",
        derivedRevisionHash: "rev_design_3c92b1",
        keyOutputSummaryKo: `${protagonist}·${partner} 대사 3개 국어(KO/EN/JA) 레이어 분리 및 화자별 TTS 타임코드 매핑`,
      },
      {
        subdomain: "editor.kaistory.net",
        stageNameKo: "브라우저 무손실 고해상도 출력",
        derivedRevisionHash: "rev_editor_7d19e4",
        keyOutputSummaryKo: "세로 스크롤 1440px 폭 슬라이스 및 식자 오버플로 0건 검증",
      },
      {
        subdomain: "story.kaistory.net",
        stageNameKo: "글로벌 웹툰 유통 & KAION 학습·퀴즈",
        derivedRevisionHash: "rev_story_9f04c8",
        keyOutputSummaryKo: "에피소드 뷰어 배포 및 KAION 세계관·서사 복습 퀴즈 카드 2종 동시 발행",
      },
    ],
    speakerTtsAndMultilingualTracks: [
      {
        speakerName: protagonist,
        voicePresetId: "voice-kr-baritone-calm",
        koLine: "이 봉인을 여는 순간, 우리의 시간은 되돌릴 수 없어.",
        enLine: "The moment we break this seal, our time can never be turned back.",
        jaLine: "この封印を解いた瞬間、俺たちの時間は二度と戻せない。",
        estimatedDurationMs: 3650,
      },
      {
        speakerName: partner,
        voicePresetId: "voice-kr-alto-resolute",
        koLine: "그래도 멈추지 않아. 네가 숨긴 진실을 끝까지 볼 거야.",
        enLine: "Even so, I won't stop. I'll see the truth you hid to the very end.",
        jaLine: "それでも止まらない。あなたが隠した真実を最後まで見届けるから。",
        estimatedDurationMs: 3920,
      },
    ],
    kaionLearningCards: [
      {
        cardId: "kaion-card-01",
        titleKo: "핵심 서사 갈등 & 복선 체크 카드",
        narrativeConceptKo: conflict,
        quizQuestionKo: `이번 화에서 ${protagonist}이(가) 봉인 해제 직전 경고한 핵심 대가는 무엇인가요?`,
        choicesKo: [
          "두 사람의 시간을 되돌릴 수 없게 되는 비가역적 변화",
          "유물의 마력이 일시적으로 소멸하는 현상",
          "배경 공간의 중력이 역전되는 현상",
        ],
        correctChoiceIndex: 0,
        explanationKo: `${protagonist}의 대사를 통해 봉인 해제가 단순한 전투가 아니라 시간과 운명의 비가역적 전환점임을 암시합니다.`,
        rewardBadgeNameKo: "세계관 통찰자 배지",
      },
      {
        cardId: "kaion-card-02",
        titleKo: "다국어 핵심 대사 표현 카드 (KO/EN/JA)",
        narrativeConceptKo: "클라이맥스 대립 장면의 다국어 감정 뉘앙스 비교",
        quizQuestionKo: `'되돌릴 수 없다'의 영어 웹툰 로컬라이징 표현으로 채택된 문구는?`,
        choicesKo: [
          "can never be turned back",
          "might be paused briefly",
          "is fácil to rewind",
        ],
        correctChoiceIndex: 0,
        explanationKo: "단호한 비가역성을 살리기 위해 'can never be turned back'으로 카피피팅되었습니다.",
        rewardBadgeNameKo: "글로벌 로컬라이저 배지",
      },
    ],
  };
}

export async function runKaistorySingleEnvelopeAndKaionAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<KaistorySingleEnvelopeAndKaionReport>> {
  const fallbackReport = buildLocalKaistorySingleEnvelopeAndKaionReport(input);
  return executeRea15Engine({
    taskId: "rea15:kaistory-single-envelope-kaion-quiz",
    input,
    options,
    systemPromptKo:
      "당신은 카이스토리(KAISTORY / KAITOON)의 단일 프로젝트 데이터 아키텍트이자 에듀테크·웹툰 융합 디렉터입니다. conti→design→editor→story 4단계 파이프라인과 화자별 다국어 TTS, 그리고 독자 몰입을 높이는 KAION 학습카드·퀴즈(2개)를 JSON 스키마로 설계하세요.",
    userDirectiveKo:
      "현재 대본과 캐릭터 설정을 바탕으로 4개 서브도메인 단계별 리비전 요약, 주연 2인의 한/영/일 대사 및 TTS 트랙, 그리고 독자 세계관 퀴즈·다국어 학습카드 2장을 생성하세요.",
    schema: KaistorySingleEnvelopeAndKaionSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 3. Snaptoon · Frameo · NAVER SHAPER · Plask · Posemaniacs 3D & 스포트라이트 콘 디렉터
 * ============================================================================ */

export function buildLocalSnaptoonFrameoShaper3dDirectorReport(
  input: WebtoonProductionAssistInput = {},
): SnaptoonFrameoShaper3dDirectorReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    directorSummaryKo: `스냅툰(Snaptoon 3D→Snapboard AI 변환), Frameo 스포트라이트 콘 조명(--cursor-angle: 45deg, --cone-spread: 25), NAVER WEBTOON SHAPER 3D 직접 드로잉·포즈 캡처, Plask 모션 캡처 및 Posemaniacs 해부학 리그를 결합한 ${genre} 입체 연출 사양입니다.`,
    snaptoonBridge: {
      themeMode: "dark-studio-0A0A0A",
      warehouseScenePresetNameKo: "고대 신전 회랑 & 도심 야경 하이브리드 3D 세트",
      cameraFocalLengthMm: 28,
      snapboardAiTransformStrengthPct: 62,
      preservedLineFidelityPct: 94,
    },
    frameoSpotlightShader: {
      cursorAngleDeg: 45,
      coneSpreadDeg: 25,
      edgeSensitivity: 30,
      colorSensitivity: 50,
      glowPrimaryHex: "#C084FC",
      glowSecondaryHex: "#38BDF8",
      shortDramaTransitionRuleKo:
        "클라이맥스 컷 진입 시 45도 스포트라이트 콘이 주인공 눈동자에 수렴하며 0.35초 줌인 트랜지션으로 시선을 고정합니다.",
    },
    shaperAndPoseRig: {
      shaperPresetComboKo: `${protagonist} 샤프 턱선 V3 + 롱 코트 물리 프리셋 + 역동적 로우앵글 포즈`,
      surfaceDirectDrawLayerCount: 4,
      posemaniacsEcorcheCameraPitchDeg: -18,
      posemaniacsHandRigPresetKo: "검자루 파지 & 마력 응집 긴장 수부(Hand) 리그",
      plaskMocapFootLockConfidencePct: 98,
      layeredPsdPassNames: [
        "01_SHAPER_LineArt_Pass",
        "02_SHAPER_DirectSurfaceDraw_Pass",
        "03_Snapboard_3D_Environment_Pass",
        "04_Frameo_Spotlight_Cone_Glow_Pass",
      ],
    },
  };
}

export async function runSnaptoonFrameoShaper3dDirectorAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<SnaptoonFrameoShaper3dDirectorReport>> {
  const fallbackReport = buildLocalSnaptoonFrameoShaper3dDirectorReport(input);
  return executeRea15Engine({
    taskId: "rea15:snaptoon-frameo-shaper-3d-lighting",
    input,
    options,
    systemPromptKo:
      "당신은 Snaptoon(스냅툰·스냅보드), Frameo AI(스포트라이트 콘 조명·스토리보드), NAVER WEBTOON SHAPER(3D 캐릭터 표면 직접 드로잉·포즈 캡처), Plask Motion, Posemaniacs를 통합 운용하는 3D·조명 웹툰 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "장면의 입체감과 시선 집중도를 극대화하는 Snaptoon→Snapboard 변환 수치, Frameo 스포트라이트 콘(--cursor-angle, --cone-spread, glow HEX), SHAPER 3D 직접 드로잉 및 Posemaniacs/Plask 포즈 리그 사양을 생성하세요.",
    schema: SnaptoonFrameoShaper3dDirectorSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 4. ManhwaAI · Komiko AI · Anifusion 통합 화풍·효과톤·레이어 분리기·노드 플로우 디렉터
 * ============================================================================ */

export function buildLocalManhwaKomikoAnifusionFlowReport(
  input: WebtoonProductionAssistInput = {},
): ManhwaKomikoAnifusionFlowReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    pipelineSummaryKo: `ManhwaAI의 6대 만화 화풍 및 5종 효과톤 오버레이(FocusingLine·SpeedLine·ToneNoise), Komiko AI의 비파괴 레이어 분리기(/layer_splitter)와 인비트윈(/inbetween), Anifusion의 5노드 플로우 그래프(/dashboard/flow/)를 하나로 결합했습니다.`,
    manhwaStylePreset: "full-color",
    activeToneOverlays: [
      {
        toneType: "FocusingLine",
        targetCutNumber: 1,
        opacityPct: 72,
        angleDeg: 0,
        dramaticPurposeKo: `${protagonist}의 각성 클로즈업 눈빛에 독자 시선을 즉각 집중`,
      },
      {
        toneType: "SpeedLine",
        targetCutNumber: 2,
        opacityPct: 84,
        angleDeg: -22,
        dramaticPurposeKo: "고속 돌진 궤적과 세로 스크롤 가속감 극대화",
      },
      {
        toneType: "ToneNoise",
        targetCutNumber: 3,
        opacityPct: 45,
        angleDeg: 15,
        dramaticPurposeKo: `${partner}의 심리적 동요와 공기의 밀도를 표현하는 그레인 텍스처`,
      },
    ],
    komikoLayerSplitterAndInbetween: {
      ocAnchorId: `oc_anchor_${protagonist}_v1`,
      splitParts: ["foreground_fx", "character_hair_face", "character_outfit", "midground_props", "background_sky"],
      inbetweenFrameCount: 4,
      motionCurveType: "anticipation-snap",
    },
    anifusionNodeFlowGraph: [
      {
        nodeId: "node-1-prompt",
        nodeType: "UniversalPromptEditor",
        upstreamNodeIds: [],
        outputSummaryKo: "장르·감정선·카메라 화각 태그 정규화 및 프롬프트 리프레이즈",
      },
      {
        nodeId: "node-2-char-sheet",
        nodeType: "CharacterSheetAnchor",
        upstreamNodeIds: ["node-1-prompt"],
        outputSummaryKo: `${protagonist}·${partner} 3면도 캐릭터 시트 시드 및 의상 팔레트 락`,
      },
      {
        nodeId: "node-3-flow-selector",
        nodeType: "FlowImageSelector",
        upstreamNodeIds: ["node-2-char-sheet"],
        outputSummaryKo: "후보 컷 4종 중 구도·시선 유도 최상위 컷 자동 선별",
      },
      {
        nodeId: "node-4-preset-stylizer",
        nodeType: "ComicPresetStylizer",
        upstreamNodeIds: ["node-3-flow-selector"],
        outputSummaryKo: "ManhwaAI full-color 화풍 및 집중선/스피드선 절차적 합성",
      },
      {
        nodeId: "node-5-layer-splitter",
        nodeType: "LayerSplitterOutput",
        upstreamNodeIds: ["node-4-preset-stylizer"],
        outputSummaryKo: "Komiko 5파트 비파괴 레이어 분리 및 PSD/모션 트랙 내보내기",
      },
    ],
  };
}

export async function runManhwaKomikoAnifusionFlowAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<ManhwaKomikoAnifusionFlowReport>> {
  const fallbackReport = buildLocalManhwaKomikoAnifusionFlowReport(input);
  return executeRea15Engine({
    taskId: "rea15:manhwa-komiko-anifusion-flow",
    input,
    options,
    systemPromptKo:
      "당신은 ManhwaAI(6대 화풍·5대 톤 오버레이), Komiko AI(/oc-maker, /layer_splitter, /inbetween), Anifusion(/dashboard/flow/ 노드 그래프) 통합 파이프라인 아키텍트입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면에 가장 적합한 ManhwaAI 화풍과 효과톤 오버레이 3종, Komiko 레이어 분리 파트 및 인비트윈 보간 설정, 그리고 Anifusion 5단계 노드 플로우 그래프를 설계하세요.",
    schema: ManhwaKomikoAnifusionFlowSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 5. [창의적 AI 특화] 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & 15대 UI/UX 테마 합성기
 * ============================================================================ */

export function buildLocalCreativeDopamineAndUxSynthesizerReport(
  input: WebtoonProductionAssistInput = {},
): CreativeDopamineAndUxSynthesizerReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    executiveSummaryKo: `15대 웹툰 AI 플랫폼의 연출·조명·모션 신호를 결합해 ${genre} 독자의 컷별 도파민 스파이크와 스크롤 정지 시간(Dwell Time)을 시뮬레이션하고, GlimNavi·Frameo의 REA 디자인 토큰을 합성한 고몰입 UI 테마를 산출했습니다.`,
    overallDopaminePeakScore: 94,
    predictedEpisodeCompletionRatePct: 91,
    cliffhangerHookPowerPct: 96,
    cutScrollHeatmap: [
      {
        cutNumber: 1,
        narrativeBeatKo: `도입부 정적 — ${protagonist}의 결의와 불길한 전조 조명`,
        predictedDwellTimeMs: 1850,
        scrollVelocityPxPerSec: 420,
        dopamineSpikePct: 68,
        recommendedVisualAmplifierKo:
          "Snaptoon 다크 스튜디오(#0A0A0A) 여백과 28mm 광각 구도로 공간적 압박감 부여",
      },
      {
        cutNumber: 2,
        narrativeBeatKo: `갈등 폭발 — ${protagonist}과 ${partner}의 시선 교차 및 유물 각성`,
        predictedDwellTimeMs: 2640,
        scrollVelocityPxPerSec: 210,
        dopamineSpikePct: 89,
        recommendedVisualAmplifierKo:
          "ManhwaAI FocusingLine + GlimNavi v2.3 선화 + 역광(#00A8C2) 림라이트로 스크롤 감속 유도",
      },
      {
        cutNumber: 3,
        narrativeBeatKo: "엔딩 클리프행어 — 세로 풀블리드 충격 컷 & 단문 반전 대사",
        predictedDwellTimeMs: 3480,
        scrollVelocityPxPerSec: 95,
        dopamineSpikePct: 97,
        recommendedVisualAmplifierKo:
          "Frameo 45도 스포트라이트 콘(#C084FC) + KAION 다음 화 추리 퀴즈 카드로 댓글·결제 전환 극대화",
      },
    ],
    synthesizedUiUxTheme: {
      themeTitleKo: "GlimNavi × Frameo 시네마틱 네온 스튜디오 테마",
      primarySourcePlatform: "frameo",
      secondarySourcePlatform: "glimnavi",
      surfaceHex: "#09090B",
      panelHex: "#18181B",
      accentPrimaryHex: "#00A8C2",
      accentSecondaryHex: "#C084FC",
      textPrimaryHex: "#F5F5F7",
      borderRadiusPx: 14,
      recommendedFontPairKo: "Pretendard Variable (UI/대사) + Instrument Serif (타이틀/인용구)",
      wcagContrastRatio: 15.8,
      designRationaleKo:
        "Frameo의 딥 다크 캔버스(#09090B)로 원고 색감 왜곡을 막으면서, GlimNavi의 시안 그라데이션(#00A8C2)과 14px 라운드 카드를 결합해 장시간 작화 피로도를 낮추고 시각적 위계를 명확히 했습니다.",
    },
  };
}

export async function runCreativeDopamineAndUxSynthesizerAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<CreativeDopamineAndUxSynthesizerReport>> {
  const fallbackReport = buildLocalCreativeDopamineAndUxSynthesizerReport(input);
  return executeRea15Engine({
    taskId: "rea15:creative-dopamine-scroll-ux-synthesizer",
    input,
    options,
    systemPromptKo:
      "당신은 웹툰 독자 행동 데이터 과학자이자 39대 웹툰·스토리보드·3D·드로잉 AI 플랫폼의 UI/UX 디자인 시스템 총괄 아키텍트입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 원고의 컷별(3개 핵심 컷) 독자 체류 시간(ms), 스크롤 속도(px/s), 도파민 스파이크(%)와 시각 증폭 처방을 시뮬레이션하고, 작품 분위기에 가장 잘 어울리는 39대 플랫폼 기반 합성 UI/UX 테마 토큰을 설계하세요.",
    schema: CreativeDopamineAndUxSynthesizerSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 6. TooToon 5-Studio(fabulator~emporium) · GenToon 뷰어/굿즈 · Tooning Plus 6부위 캐릭터 디렉터
 * ============================================================================ */

export function buildLocalTootoonGentoonTooningKrSuiteReport(
  input: WebtoonProductionAssistInput = {},
): TootoonGentoonTooningKrSuiteReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    suiteSummaryKo: `TooToon(오노마AI)의 5대 스튜디오 모듈(/fabulator·/character-studio·/visual-studio·/artifex·/emporium), GenToon의 읽기 방향·뷰어 토큰(--reading-direction:1, --paper:#f4ebfc, --ink:#40215f) 및 굿즈 수익화, Tooning Plus의 6부위 모듈형 캐릭터 빌더(/character-make-*)를 결합한 K-웹툰 전 주기 제작 사양입니다.`,
    tootoonFiveStudios: [
      {
        moduleId: "fabulator",
        routePath: "/fabulator",
        stageTitleKo: "Fabulator — 세계관·대본 집필 스튜디오",
        deliverableSummaryKo: `${genre} 에피소드 기승전결 대본 및 ${protagonist}·${partner} 대사 지문 구조화`,
      },
      {
        moduleId: "character-studio",
        routePath: "/character-studio",
        stageTitleKo: "Character Studio — 캐릭터 시트 & 시드 앵커",
        deliverableSummaryKo: `${protagonist}·${partner} 표정 6종 및 전투 복식 컬러 시드 고정`,
      },
      {
        moduleId: "visual-studio",
        routePath: "/visual-studio",
        stageTitleKo: "Visual Studio — 콘티 & 카메라 레이아웃",
        deliverableSummaryKo: "세로 스크롤 컷 분할 및 소실점·말풍선 동선 배치",
      },
      {
        moduleId: "artifex",
        routePath: "/artifex",
        stageTitleKo: "Artifex — 최종 작화·채색·후보정",
        deliverableSummaryKo: "선화 정리, 셀 셰이딩, 역광 글로우 합성 완료",
      },
      {
        moduleId: "emporium",
        routePath: "/emporium",
        stageTitleKo: "Emporium — 3D 배경·브러시·소품 에셋 마켓 연동",
        deliverableSummaryKo: "황궁 결전 3D 배경 및 고대 유물 이펙트 브러시 번들 마운트",
      },
    ],
    gentoonReaderAndCommerce: {
      readingDirection: "vertical-scroll-1",
      paperHex: "#f4ebfc",
      inkHex: "#40215f",
      violetAccentHex: "#7646bd",
      recommendedGoodsItems: [
        {
          skuId: "goods-acrylic-diorama-01",
          goodsNameKo: `${protagonist} × ${partner} 각성 결전 아크릴 디오라마 스탠드`,
          targetSupporterTierKo: "로열 서포터즈 (/supporters)",
          estimatedMarginPct: 64,
        },
        {
          skuId: "goods-lenticular-card-02",
          goodsNameKo: "고대 유물 봉인 해제 렌티큘러 포토카드 세트",
          targetSupporterTierKo: "얼리버드 독자 펀딩 (/goods/orders)",
          estimatedMarginPct: 72,
        },
      ],
    },
    tooningSixPartCharacterRecipe: [
      {
        partRoute: "/character-make-basic",
        partLabelKo: "기본 체형·비율 (8등신 웹툰 주연)",
        selectedPresetSummaryKo: `${protagonist} 슬림 근육형 8등신 베이스 체형`,
        consistencyLockScorePct: 98,
      },
      {
        partRoute: "/character-make-face",
        partLabelKo: "얼굴·눈매·표정 파츠",
        selectedPresetSummaryKo: "날카로운 청안(Cyan) 눈매 + 각성 문양 레이어",
        consistencyLockScorePct: 96,
      },
      {
        partRoute: "/character-make-body",
        partLabelKo: "의상·전투복 파츠",
        selectedPresetSummaryKo: "다크 네이비 롱코트 & 은장 견장 세트",
        consistencyLockScorePct: 95,
      },
      {
        partRoute: "/character-make-hand",
        partLabelKo: "손 동작·파지 파츠",
        selectedPresetSummaryKo: "검자루 파지 및 마력 방출 제스처 프리셋",
        consistencyLockScorePct: 94,
      },
      {
        partRoute: "/character-make-hair",
        partLabelKo: "헤어 전면·후면 레이어",
        selectedPresetSummaryKo: "바람에 흩날리는 흑발 레이어드 컷",
        consistencyLockScorePct: 97,
      },
      {
        partRoute: "/character-make-etc",
        partLabelKo: "소품·오라·귀걸이 파츠",
        selectedPresetSummaryKo: "고대 유물 파편 홀로그램 오라 파츠",
        consistencyLockScorePct: 95,
      },
    ],
  };
}

export async function runTootoonGentoonTooningKrSuiteAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<TootoonGentoonTooningKrSuiteReport>> {
  const fallbackReport = buildLocalTootoonGentoonTooningKrSuiteReport(input);
  return executeRea15Engine({
    taskId: "rea15:tootoon-gentoon-tooning-kr-suite",
    input,
    options,
    systemPromptKo:
      "당신은 국내 대표 웹툰 AI 플랫폼 TooToon(fabulator·character-studio·visual-studio·artifex·emporium), GenToon(--reading-direction, --paper, --ink, 서포터즈·굿즈 정산), Tooning Plus(6부위 캐릭터 파츠 조립 /character-make-*) 통합 프로듀서입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 작품을 위한 TooToon 5대 스튜디오 단계별 산출물, GenToon 뷰어 테마 및 서포터즈 굿즈 상품 2종, 그리고 Tooning Plus 6부위 캐릭터 파츠 레시피를 설계하세요.",
    schema: TootoonGentoonTooningKrSuiteSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 7. Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더 디렉터
 * ============================================================================ */

export function buildLocalKreaSplineLumiereRealtimeShaderReport(
  input: WebtoonProductionAssistInput = {},
): KreaSplineLumiereRealtimeShaderReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";

  return {
    realtimePipelineSummaryKo: `Krea의 실시간 디렉터(/realtime-director) 도형 블로킹, Spline 3D & Hana의 실시간 3D 스타일 트랜스퍼(/ai-style-transfer), Lumiere Graphics의 Kuwahara·Halation WebGPU 포스트프로세싱, Graphite/PixiEditor 비파괴 노드 그래프를 결합한 실시간 셰이더 파이프라인입니다.`,
    kreaRealtimeDirector: {
      activeRoute: "/realtime-director",
      i2iDenoiseStrength: 0.58,
      enhanceUpscaleFactor: 2,
      blockingPrimitiveCount: 6,
      directorCoachingKo: `${protagonist} 실루엣과 배경 기둥을 6개 3D 기본 도형으로 블로킹한 뒤 denoise 0.58로 실시간 선화·채색 합성을 구동합니다.`,
    },
    spline3dAndHanaBridge: {
      activeRoute: "/ai-style-transfer",
      styleTransferPresetKo: "Cel-Shaded Manhwa Ink & Rim Glow",
      cameraOrbitAzimuthDeg: -28,
      cameraOrbitElevationDeg: 16,
      interactiveStateTriggerKo: "마우스/스크롤 패럴랙스 시 배경 부유석 3D 레이어가 12deg 역방향 회전",
    },
    lumiereAndNodeGraphShaders: {
      kuwaharaPaintRadiusPx: 4,
      filmHalationIntensityPct: 38,
      anamorphicGlareStreakPct: 62,
      graphiteProceduralNodeCount: 7,
      pixiEditorFrameLoopCount: 12,
      compositeShaderNoteKo:
        "원경 배경에는 Kuwahara 반경 4px 회화 필터를 적용해 인물 선화와 공간감을 분리하고, 유물 발광부에는 Film Halation 38%와 아나모픽 플레어 62%를 비파괴 노드로 합성합니다.",
    },
  };
}

export async function runKreaSplineLumiereRealtimeShaderAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<KreaSplineLumiereRealtimeShaderReport>> {
  const fallbackReport = buildLocalKreaSplineLumiereRealtimeShaderReport(input);
  return executeRea15Engine({
    taskId: "rea15:krea-spline-lumiere-realtime-shader",
    input,
    options,
    systemPromptKo:
      "당신은 Krea AI(/realtime-director, /apps/enhance), Spline 3D(/3d-design, /hana, /ai-style-transfer), Lumiere Graphics(WebGPU Kuwahara·Halation·Glare), Graphite Editor(비파괴 노드), PixiEditor를 통합 제어하는 실시간 테크니컬 셰이더 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면을 위한 Krea 실시간 블로킹/업스케일 파라미터, Spline 3D/Hana 스타일 트랜스퍼 카메라 궤도, 그리고 Lumiere/Graphite/PixiEditor 비파괴 WebGPU 포스트프로세싱 수치를 산출하세요.",
    schema: KreaSplineLumiereRealtimeShaderSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 8. LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터
 * ============================================================================ */

export function buildLocalLtxBoordsCascadeurRiveAnimaticReport(
  input: WebtoonProductionAssistInput = {},
): LtxBoordsCascadeurRiveAnimaticReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    animaticExecutiveSummaryKo: `LTX Studio와 Boords의 프리비즈 애니매틱 카메라 시퀀서, Cascadeur의 무게중심(Center of Mass)·탄도 물리 기반 AutoPosing/AutoPhysics, Rive·Jitter의 스크롤 반응형 2D 메쉬 상태머신(State Machine)을 결합한 무빙툰·숏폼 프리비즈 사양입니다.`,
    ltxAndBoordsAnimaticShots: [
      {
        shotNumber: 1,
        cameraMove: "dolly-in",
        durationMs: 1800,
        voiceoverBeatKo: `${protagonist}: "이 봉인을 여는 순간, 우리의 시간은 되돌릴 수 없어."`,
        visualTransitionKo: "전경 유물 파편 블러 처리 후 주연 눈동자 익스트림 클로즈업으로 달리 인",
      },
      {
        shotNumber: 2,
        cameraMove: "dutch-tilt-push",
        durationMs: 2100,
        voiceoverBeatKo: `${partner}: "그래도 멈추지 않아. 끝까지 볼 거야."`,
        visualTransitionKo: "18도 더치 틸트 회전과 함께 두 인물의 대립 구도를 대각선 분할",
      },
      {
        shotNumber: 3,
        cameraMove: "tracking-orbit",
        durationMs: 2400,
        voiceoverBeatKo: "유물 코어 폭발음(SFX) 및 공중 도약 액션 비트",
        visualTransitionKo: "카메라가 180도 트래킹 오빗하며 슬로모션 충격파 프레임을 포착",
      },
    ],
    cascadeurPhysicsRig: {
      autoPosingConfidencePct: 96,
      centerOfMassHeightCm: 92,
      ballisticTrajectoryArcKo: "초속 7.8m/s 도약 후 정점 체공 0.28초 구간에서 검격 회전 모멘트 극대화",
      angularMomentumTorqueNm: 148,
      secondaryClothHairFollowThroughKo:
        "착지 직후 3프레임 지연(Follow-through)으로 롱코트 자락과 머리카락이 관성 궤적을 따라 감속",
    },
    riveAndJitterStateMachine: {
      stateMachineName: "SM_WebtoonCut_Climax_Interactive",
      scrollTriggerThresholdPct: 65,
      states: [
        {
          stateName: "Idle_Tension_Breathing",
          triggerConditionKo: "뷰포트 진입 0% ~ 64% 구간",
          meshDeformationSummaryKo: "흉곽 호흡 메쉬 미세 수축·팽창 및 안광 파티클 24fps 루프",
          loopFps: 24,
        },
        {
          stateName: "Relic_Awaken_Burst",
          triggerConditionKo: "스크롤 진행률 65% 돌파 시 즉시 전이",
          meshDeformationSummaryKo: "헤어·망토 메쉬 외곽 팽창 + 충격파 링 60fps 버스트 재생",
          loopFps: 60,
        },
      ],
    },
  };
}

export async function runLtxBoordsCascadeurRiveAnimaticAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<LtxBoordsCascadeurRiveAnimaticReport>> {
  const fallbackReport = buildLocalLtxBoordsCascadeurRiveAnimaticReport(input);
  return executeRea15Engine({
    taskId: "rea15:ltx-boords-cascadeur-rive-animatic",
    input,
    options,
    systemPromptKo:
      "당신은 LTX Studio·Boords(프리비즈 애니매틱 시퀀서), Cascadeur(AI AutoPosing & AutoPhysics 무게중심·탄도 물리), Rive·Jitter(인터랙티브 상태머신 무빙툰)를 통합 설계하는 시네마틱 액션·모션 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 대본의 3개 핵심 샷 애니매틱 카메라 무빙·보이스오버 비트, Cascadeur 물리 기반 무게중심/탄도/관성 팔로우스루 수치, 그리고 Rive/Jitter 스크롤 반응형 상태머신(State Machine) 2개 상태를 설계하세요.",
    schema: LtxBoordsCascadeurRiveAnimaticSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 9. 8대 REA 39-Platform & Creative AI 통합 실행기
 * ============================================================================ */

export async function runRea15WebtoonEcosystemFullSuite(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15FullSuiteBundle> {
  const [
    glimnaviRelightLineart,
    kaistoryEnvelopeKaion,
    snaptoonFrameoShaper3d,
    manhwaKomikoAnifusionFlow,
    creativeDopamineUxSynthesizer,
    tootoonGentoonTooningKrSuite,
    kreaSplineLumiereRealtimeShader,
    ltxBoordsCascadeurRiveAnimatic,
  ] = await Promise.all([
    runGlimnaviRelightAndLineartV23Assist(input, options),
    runKaistorySingleEnvelopeAndKaionAssist(input, options),
    runSnaptoonFrameoShaper3dDirectorAssist(input, options),
    runManhwaKomikoAnifusionFlowAssist(input, options),
    runCreativeDopamineAndUxSynthesizerAssist(input, options),
    runTootoonGentoonTooningKrSuiteAssist(input, options),
    runKreaSplineLumiereRealtimeShaderAssist(input, options),
    runLtxBoordsCascadeurRiveAnimaticAssist(input, options),
  ]);

  const envelopes = [
    glimnaviRelightLineart,
    kaistoryEnvelopeKaion,
    snaptoonFrameoShaper3d,
    manhwaKomikoAnifusionFlow,
    creativeDopamineUxSynthesizer,
    tootoonGentoonTooningKrSuite,
    kreaSplineLumiereRealtimeShader,
    ltxBoordsCascadeurRiveAnimatic,
  ];

  const totalEstimatedCostUsd = Number(
    envelopes.reduce((acc, item) => acc + item.estimatedCostUsd, 0).toFixed(6),
  );
  const liveEngineCount = envelopes.filter((item) => item.source === "claude-live").length;
  const fallbackEngineCount = envelopes.length - liveEngineCount;

  return Object.freeze({
    generatedAtIso: new Date().toISOString(),
    totalEstimatedCostUsd,
    liveEngineCount,
    fallbackEngineCount,
    glimnaviRelightLineart,
    kaistoryEnvelopeKaion,
    snaptoonFrameoShaper3d,
    manhwaKomikoAnifusionFlow,
    creativeDopamineUxSynthesizer,
    tootoonGentoonTooningKrSuite,
    kreaSplineLumiereRealtimeShader,
    ltxBoordsCascadeurRiveAnimatic,
  });
}
