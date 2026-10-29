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
  CreativeDopamineAndUxSynthesizerSchema,
  GlimnaviRelightAndLineartV23Schema,
  KaistorySingleEnvelopeAndKaionSchema,
  ManhwaKomikoAnifusionFlowSchema,
  REA15_PLATFORM_IDS,
  REA15_PLATFORM_UI_THEME_CATALOG,
  SnaptoonFrameoShaper3dDirectorSchema,
  type CreativeDopamineAndUxSynthesizerReport,
  type GlimnaviRelightAndLineartV23Report,
  type KaistorySingleEnvelopeAndKaionReport,
  type ManhwaKomikoAnifusionFlowReport,
  type Rea15Envelope,
  type Rea15ExecutionMeta,
  type Rea15FullSuiteBundle,
  type Rea15PlatformId,
  type Rea15PlatformUiThemeSpec,
  type SnaptoonFrameoShaper3dDirectorReport,
} from "./claude-rea15-webtoon-ecosystem-schemas";
import {
  runCotransVroidSkyboxWorldLocalizerAssist,
  runKreaSplineLumiereRealtimeShaderAssist,
  runLtxBoordsCascadeurRiveAnimaticAssist,
  runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist,
  runNijiPixaiCivitaiLoraSrefDirectorAssist,
  runRunwayLumaPikaViggleLive2dSpineMotionAssist,
  runSketchupBlenderPetalicaMagmaRecraftStudioAssist,
  runStoryboarderDreamsKritaArtbreederDirectorAssist,
  runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist,
  runTootoonGentoonTooningKrSuiteAssist,
  runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist,
} from "./claude-rea39-extended-engines";
import type {
  RunWebtoonProductionAssistOptions,
  WebtoonProductionAssistInput,
} from "./claude-webtoon-production-schemas";

export * from "./claude-rea15-webtoon-ecosystem-schemas";
export * from "./claude-rea39-extended-engines";

function resolveActiveClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  if (import.meta.env.MODE === "test") return null;
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
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

export async function executeRea15Engine<TSchema extends z.ZodTypeAny>(params: {
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
  const activeRoute = resolveActiveClaudeRoute(options.route);

  if (!activeRoute) {
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "사용할 수 있는 AI 경로가 없어 결정적 로컬 폴백 엔진을 사용했습니다.",
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
      { cutNumber: 1, narrativeBeatKo: `도입부 정적 — ${protagonist}의 결의와 불길한 전조 조명`, predictedDwellTimeMs: 1850, scrollVelocityPxPerSec: 420, dopamineSpikePct: 68, recommendedVisualAmplifierKo: "Snaptoon 다크 스튜디오(#0A0A0A) 여백과 28mm 광각 구도로 공간적 압박감 부여" },
      { cutNumber: 2, narrativeBeatKo: `갈등 폭발 — ${protagonist}과 ${partner}의 시선 교차 및 유물 각성`, predictedDwellTimeMs: 2640, scrollVelocityPxPerSec: 210, dopamineSpikePct: 89, recommendedVisualAmplifierKo: "ManhwaAI FocusingLine + GlimNavi v2.3 선화 + 역광(#00A8C2) 림라이트로 스크롤 감속 유도" },
      { cutNumber: 3, narrativeBeatKo: "엔딩 클리프행어 — 세로 풀블리드 충격 컷 & 단문 반전 대사", predictedDwellTimeMs: 3480, scrollVelocityPxPerSec: 95, dopamineSpikePct: 97, recommendedVisualAmplifierKo: "Frameo 45도 스포트라이트 콘(#C084FC) + KAION 다음 화 추리 퀴즈 카드로 댓글·결제 전환 극대화" },
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
      "당신은 웹툰 독자 행동 데이터 과학자이자 100대 웹툰·스토리보드·3D·드로잉·출판 AI 플랫폼의 UI/UX 디자인 시스템 총괄 아키텍트입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 원고의 컷별(3개 핵심 컷) 독자 체류 시간(ms), 스크롤 속도(px/s), 도파민 스파이크(%)와 시각 증폭 처방을 시뮬레이션하고, 작품 분위기에 가장 잘 어울리는 100대 플랫폼 기반 합성 UI/UX 테마 토큰을 설계하세요.",
    schema: CreativeDopamineAndUxSynthesizerSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 16. 16대 REA 100-Platform & Creative AI 통합 실행기
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
    cotransVroidSkyboxLocalizer,
    storyboarderDreamsKritaArtbreeder,
    nijiPixaiCivitaiLoraSrefDirector,
    tripoMeshyHeroforgeSunoElevenlabsOsmu,
    runwayLumaPikaViggleLive2dSpineMotion,
    sketchupBlenderPetalicaMagmaRecraftStudio,
    tapasTappytoonRidiPostypeSudowriteNovelcrafter,
    mixamoMarvelousCoolorsNoonnuBlambotToonboomEagle,
  ] = await Promise.all([
    runGlimnaviRelightAndLineartV23Assist(input, options),
    runKaistorySingleEnvelopeAndKaionAssist(input, options),
    runSnaptoonFrameoShaper3dDirectorAssist(input, options),
    runManhwaKomikoAnifusionFlowAssist(input, options),
    runCreativeDopamineAndUxSynthesizerAssist(input, options),
    runTootoonGentoonTooningKrSuiteAssist(input, options),
    runKreaSplineLumiereRealtimeShaderAssist(input, options),
    runLtxBoordsCascadeurRiveAnimaticAssist(input, options),
    runCotransVroidSkyboxWorldLocalizerAssist(input, options),
    runStoryboarderDreamsKritaArtbreederDirectorAssist(input, options),
    runNijiPixaiCivitaiLoraSrefDirectorAssist(input, options),
    runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist(input, options),
    runRunwayLumaPikaViggleLive2dSpineMotionAssist(input, options),
    runSketchupBlenderPetalicaMagmaRecraftStudioAssist(input, options),
    runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist(input, options),
    runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist(input, options),
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
    cotransVroidSkyboxLocalizer,
    storyboarderDreamsKritaArtbreeder,
    nijiPixaiCivitaiLoraSrefDirector,
    tripoMeshyHeroforgeSunoElevenlabsOsmu,
    runwayLumaPikaViggleLive2dSpineMotion,
    sketchupBlenderPetalicaMagmaRecraftStudio,
    tapasTappytoonRidiPostypeSudowriteNovelcrafter,
    mixamoMarvelousCoolorsNoonnuBlambotToonboomEagle,
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
    cotransVroidSkyboxLocalizer,
    storyboarderDreamsKritaArtbreeder,
    nijiPixaiCivitaiLoraSrefDirector,
    tripoMeshyHeroforgeSunoElevenlabsOsmu,
    runwayLumaPikaViggleLive2dSpineMotion,
    sketchupBlenderPetalicaMagmaRecraftStudio,
    tapasTappytoonRidiPostypeSudowriteNovelcrafter,
    mixamoMarvelousCoolorsNoonnuBlambotToonboomEagle,
  });
}
