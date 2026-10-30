/**
 * assist-webtoon-episodic-schemas.ts
 *
 * Phase 2 차세대 웹툰 에피소드 프로덕션 AI 보조 엔진 4종:
 * 1. 독자 스크롤 체류·이탈 구간 & 베스트 댓글·별점 예측 시뮬레이터 (`reader-retention-simulator`)
 * 2. 캐릭터 말투·성격 캐붕(OOC) 레이더 & 3종 서브텍스트 대사 윤색기 (`character-ooc-radar`)
 * 3. 컷별 3D 배경·소품 에셋 배치 & 카메라 렌즈/심도(DoF)/안개 디렉터 (`bg3d-lighting-asset-director`)
 * 4. 웹툰 BGM · 폴리 효과음 · 오디오툰(보이스 드라마) 큐시트 디렉터 (`bgm-audiotoon-cuesheet`)
 */
import { z } from "zod";

import {
  EMPTY_ASSIST_TOKEN_USAGE,
  type AssistTokenUsage,
} from "@/shared/ai/assist/assist-models";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";

import { runWebtoonStoryboardMasterPipeline } from "../studio-webtoon-storyboard-pipeline";

import {
  clampInt,
  type WebtoonProductionAssistInput,
} from "./assist-webtoon-production-schemas";

export type WebtoonEpisodicDoctorMode =
  | "reader-retention-simulator"
  | "character-ooc-radar"
  | "bg3d-lighting-asset-director"
  | "bgm-audiotoon-cuesheet"
  | "episodic-visual-continuity-linter"
  | "multi-episode-canon-memory-vault"
  | "episodic-footwear-floor-contact-stride-lock"
  | "episodic-crowd-silhouette-depth-fog-lock";

// ── 1. 독자 스크롤 체류·이탈 구간 & 베스트 댓글·별점 예측 시뮬레이터 ──────────────────

export const AssistReaderRetentionSchema = z.object({
  predictedEpisodeStarRating: z.number(),
  completionRatePct: z.number(),
  scrollVelocitySummaryKo: z.string(),
  cutRetentionCurve: z.array(
    z.object({
      cutNumber: z.number(),
      dwellTimeSeconds: z.number(),
      dropOffRiskPct: z.number(),
      dropOffReasonKo: z.string(),
      retentionBoostFixKo: z.string(),
      readyRetentionDirectionLine: z.string(),
    }),
  ),
  predictedTopComments: z.array(
    z.object({
      personaLabelKo: z.string(),
      commentTextKo: z.string(),
      predictedLikes: z.number(),
      sentimentTone: z.enum([
        "hype",
        "theory-crafting",
        "emotional-catharsis",
        "humor-meme",
      ]),
    }),
  ),
});

export type AssistReaderRetentionRaw = z.infer<typeof AssistReaderRetentionSchema>;

export interface AssistReaderRetentionView {
  readonly mode: "reader-retention-simulator";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  /** 실제 독자 지표는 제공되지 않는다. 숫자 필드는 이전 호출자 호환용 0이며 측정값이 아니다. */
  readonly audienceMetricsAvailable?: false;
  readonly predictedEpisodeStarRating: number;
  readonly completionRatePct: number;
  readonly scrollVelocitySummaryKo: string;
  readonly cutRetentionCurve: ReadonlyArray<{
    readonly cutNumber: number;
    readonly dwellTimeSeconds: number;
    readonly dropOffRiskPct: number;
    readonly dropOffReasonKo: string;
    readonly retentionBoostFixKo: string;
    readonly readyRetentionDirectionLine: string;
  }>;
  readonly predictedTopComments: ReadonlyArray<{
    readonly personaLabelKo: string;
    readonly commentTextKo: string;
    readonly predictedLikes: number;
    readonly sentimentTone:
      | "hype"
      | "theory-crafting"
      | "emotional-catharsis"
      | "humor-meme";
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 2. 캐릭터 말투·성격 캐붕(OOC) 레이더 & 3종 서브텍스트 대사 윤색기 ────────────────

export const AssistCharacterOocRadarSchema = z.object({
  voiceConsistencyScore: z.number(),
  relationshipTensionSummaryKo: z.string(),
  dialogueAudits: z.array(
    z.object({
      cutNumber: z.number(),
      speakerName: z.string(),
      originalLine: z.string(),
      oocRiskLevel: z.enum(["safe", "mild-drift", "severe-ooc"]),
      speechRegisterKo: z.string(),
      oocDiagnosisKo: z.string(),
      subtextHiddenDesireKo: z.string(),
      canonicalLine: z.string(),
      highTensionSubtextLine: z.string(),
      conciseMobileLine: z.string(),
    }),
  ),
});

export type AssistCharacterOocRadarRaw = z.infer<typeof AssistCharacterOocRadarSchema>;

export interface AssistCharacterOocRadarView {
  readonly mode: "character-ooc-radar";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly voiceConsistencyScore: number;
  readonly relationshipTensionSummaryKo: string;
  readonly dialogueAudits: ReadonlyArray<{
    readonly cutNumber: number;
    readonly speakerName: string;
    readonly originalLine: string;
    readonly oocRiskLevel: "safe" | "mild-drift" | "severe-ooc";
    readonly speechRegisterKo: string;
    readonly oocDiagnosisKo: string;
    readonly subtextHiddenDesireKo: string;
    readonly canonicalLine: string;
    readonly highTensionSubtextLine: string;
    readonly conciseMobileLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 3. 컷별 3D 배경·소품 에셋 배치 & 카메라 렌즈/심도(DoF)/안개 디렉터 ───────────────

export const AssistBg3dLightingAssetSchema = z.object({
  spatialSceneSummaryKo: z.string(),
  recommendedAssetPackKo: z.string(),
  cut3dSpecs: z.array(
    z.object({
      cutNumber: z.number(),
      spaceCategory: z.enum([
        "indoor-architecture",
        "urban-street",
        "fantasy-dungeon-citadel",
        "nature-sky-horizon",
        "abstract-emotion-void",
      ]),
      cameraLensMm: z.number(),
      cameraHeightCm: z.number(),
      cameraTiltDeg: z.number(),
      dofBlurStrengthPct: z.number(),
      fogDensityPct: z.number(),
      keyPropPlacementsKo: z.string(),
      shadowCastDirectionKo: z.string(),
      ready3dStageLine: z.string(),
    }),
  ),
});

export type AssistBg3dLightingAssetRaw = z.infer<typeof AssistBg3dLightingAssetSchema>;

export interface AssistBg3dLightingAssetView {
  readonly mode: "bg3d-lighting-asset-director";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly spatialSceneSummaryKo: string;
  readonly recommendedAssetPackKo: string;
  readonly cut3dSpecs: ReadonlyArray<{
    readonly cutNumber: number;
    readonly spaceCategory:
      | "indoor-architecture"
      | "urban-street"
      | "fantasy-dungeon-citadel"
      | "nature-sky-horizon"
      | "abstract-emotion-void";
    readonly cameraLensMm: number;
    readonly cameraHeightCm: number;
    readonly cameraTiltDeg: number;
    readonly dofBlurStrengthPct: number;
    readonly fogDensityPct: number;
    readonly keyPropPlacementsKo: string;
    readonly shadowCastDirectionKo: string;
    readonly ready3dStageLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 4. 웹툰 BGM · 폴리 효과음 · 오디오툰(보이스 드라마) 큐시트 디렉터 ─────────────────

export const AssistBgmAudioToonSchema = z.object({
  episodeSoundtrackThemeKo: z.string(),
  recommendedBpm: z.number(),
  musicalKeySignature: z.string(),
  audioCues: z.array(
    z.object({
      cutNumber: z.number(),
      scrollTriggerTiming: z.enum([
        "cut-enter-fade-in",
        "mid-cut-swell",
        "cliffhanger-hard-stop",
        "seamless-loop",
      ]),
      bgmTrackStyleKo: z.string(),
      foleyAmbienceKo: z.string(),
      voiceActingDirectionKo: z.string(),
      breathAndPauseMs: z.number(),
      readyAudioCueLine: z.string(),
    }),
  ),
});

export type AssistBgmAudioToonRaw = z.infer<typeof AssistBgmAudioToonSchema>;

export interface AssistBgmAudioToonView {
  readonly mode: "bgm-audiotoon-cuesheet";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly episodeSoundtrackThemeKo: string;
  readonly recommendedBpm: number;
  readonly musicalKeySignature: string;
  readonly audioCues: ReadonlyArray<{
    readonly cutNumber: number;
    readonly scrollTriggerTiming:
      | "cut-enter-fade-in"
      | "mid-cut-swell"
      | "cliffhanger-hard-stop"
      | "seamless-loop";
    readonly bgmTrackStyleKo: string;
    readonly foleyAmbienceKo: string;
    readonly voiceActingDirectionKo: string;
    readonly breathAndPauseMs: number;
    readonly readyAudioCueLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 5. 전 회차 컷간 작붕(비대칭 흉터·검집 반전·소품 증발·부상 초기화) 자동 검출 린터 ──

export const AssistVisualContinuityLinterSchema = z.object({
  visualContinuityScore: z.number(),
  zeroAnimationErrorGuarantee: z.boolean(),
  linterSummaryKo: z.string(),
  cutContinuityChecks: z.array(
    z.object({
      cutTransitionLabel: z.string(),
      errorCategory: z.enum([
        "chirality-mirror-flip",
        "prop-disappearance",
        "wound-reset-error",
        "shadow-lighting-conflict",
      ]),
      riskSeverity: z.enum(["pass-locked", "watch-guard", "critical-fix"]),
      detectedRiskKo: z.string(),
      preventivePromptGuardKo: z.string(),
      readyContinuityGuardLine: z.string(),
    }),
  ),
});

export type AssistVisualContinuityLinterRaw = z.infer<typeof AssistVisualContinuityLinterSchema>;

export interface AssistVisualContinuityLinterView {
  readonly mode: "episodic-visual-continuity-linter";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly visualContinuityScore: number;
  readonly zeroAnimationErrorGuarantee: boolean;
  readonly linterSummaryKo: string;
  readonly cutContinuityChecks: ReadonlyArray<{
    readonly cutTransitionLabel: string;
    readonly errorCategory:
      | "chirality-mirror-flip"
      | "prop-disappearance"
      | "wound-reset-error"
      | "shadow-lighting-conflict";
    readonly riskSeverity: "pass-locked" | "watch-guard" | "critical-fix";
    readonly detectedRiskKo: string;
    readonly preventivePromptGuardKo: string;
    readonly readyContinuityGuardLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 6. 장편 연재(1~100화) 캐릭터·세계관·복선·비주얼 캐논 메모리 볼트 디렉터 ──────────

export const AssistMultiEpisodeCanonVaultSchema = z.object({
  canonVaultIntegrityScore: z.number(),
  serializedArcTimelineKo: z.string(),
  canonEntries: z.array(
    z.object({
      entryId: z.string(),
      canonCategory: z.enum([
        "character-appearance-evolution",
        "honorific-speech-matrix",
        "unresolved-foreshadow-chekhov",
        "world-spatial-rule",
      ]),
      establishedEpisodeLabel: z.string(),
      immutableRuleKo: z.string(),
      currentEpisodeSyncDirectiveKo: z.string(),
      readyCanonVaultLine: z.string(),
    }),
  ),
});

export type AssistMultiEpisodeCanonVaultRaw = z.infer<typeof AssistMultiEpisodeCanonVaultSchema>;

export interface AssistMultiEpisodeCanonVaultView {
  readonly mode: "multi-episode-canon-memory-vault";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly canonVaultIntegrityScore: number;
  readonly serializedArcTimelineKo: string;
  readonly canonEntries: ReadonlyArray<{
    readonly entryId: string;
    readonly canonCategory:
      | "character-appearance-evolution"
      | "honorific-speech-matrix"
      | "unresolved-foreshadow-chekhov"
      | "world-spatial-rule";
    readonly establishedEpisodeLabel: string;
    readonly immutableRuleKo: string;
    readonly currentEpisodeSyncDirectiveKo: string;
    readonly readyCanonVaultLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export const AssistFootwearStrideLockSchema = z.object({
  footwearIntegrityScore: z.number(),
  strideSummaryKo: z.string(),
  heelHeightCm: z.number(),
  soleAndBuckleSpecKo: z.string(),
  stairSlopeContactRuleKo: z.string(),
  readyFootwearGuardLine: z.string(),
});

export interface AssistFootwearStrideLockView extends z.infer<typeof AssistFootwearStrideLockSchema> {
  readonly mode: "episodic-footwear-floor-contact-stride-lock";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export const AssistCrowdDepthFogLockSchema = z.object({
  depthHierarchyScore: z.number(),
  crowdAtmosphereSummaryKo: z.string(),
  heroLineWeightMultiplier: z.number(),
  midgroundCrowdLineMultiplier: z.number(),
  backgroundSilhouetteFogPct: z.number(),
  readyCrowdDepthGuardLine: z.string(),
});

export interface AssistCrowdDepthFogLockView extends z.infer<typeof AssistCrowdDepthFogLockSchema> {
  readonly mode: "episodic-crowd-silhouette-depth-fog-lock";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export type WebtoonEpisodicDoctorView =
  | AssistReaderRetentionView
  | AssistCharacterOocRadarView
  | AssistBg3dLightingAssetView
  | AssistBgmAudioToonView
  | AssistVisualContinuityLinterView
  | AssistMultiEpisodeCanonVaultView
  | AssistFootwearStrideLockView
  | AssistCrowdDepthFogLockView;

// ── 결정적(Deterministic) 폴백 빌더 4종 ──────────────────────────────────────────

export function buildDeterministicReaderRetentionReport(
  input: WebtoonProductionAssistInput = {},
): AssistReaderRetentionView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 24) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 24) || "하윤";

  const cutRetentionCurve = master.enrichedCuts.slice(0, 4).map((item, idx) => {
    const cutNum = item.cutPlan.cutNumber;
    const dwellTimeSeconds = 0;
    const dropOffRiskPct = 0;
    const dropOffReasonKo =
      idx === 1
        ? "점검 예시: 설명형 대사가 길다면 한 컷에 정보가 몰리는지 확인하세요."
        : "점검 예시: 시선 고정점과 감정 변화가 다음 컷으로 자연스럽게 이어지는지 확인하세요.";
    const retentionBoostFixKo =
      idx === 1
        ? `말풍선을 2개로 쪼개고 컷 하단에 ${partner}의 미세한 동공 흔들림 인서트를 배치하세요.`
        : `현재 ${item.productionLayers.lensFocalLengthMm}mm 렌즈 구도와 스크롤 여백을 유지해 몰입감을 고정하세요.`;
    return Object.freeze({
      cutNumber: cutNum,
      dwellTimeSeconds,
      dropOffRiskPct,
      dropOffReasonKo,
      retentionBoostFixKo,
      readyRetentionDirectionLine: `[연출 제안 예시 컷 ${cutNum}] ${retentionBoostFixKo}`,
    });
  });

  const predictedTopComments = Object.freeze([
    Object.freeze({
      personaLabelKo: "정주행 과몰입 독자",
      commentTextKo: `와 마지막 컷 ${protagonist} 눈빛 돌변하는 거 소름 돋았네... 다음 화 쿠키 바로 굽습니다`,
      predictedLikes: 0,
      sentimentTone: "hype" as const,
    }),
    Object.freeze({
      personaLabelKo: "떡밥 고고학자",
      commentTextKo: `잠깐만 아까 2컷 배경에 있던 균열 무늬, 1화 프롤로그에서 ${partner}가 숨겼던 유물이랑 똑같지 않음??`,
      predictedLikes: 0,
      sentimentTone: "theory-crafting" as const,
    }),
    Object.freeze({
      personaLabelKo: "감정선 분석러",
      commentTextKo: `${protagonist}랑 ${partner} 입으로는 날 세우는데 시선은 서로 못 떼는 거 진짜 서사 미쳤다...`,
      predictedLikes: 0,
      sentimentTone: "emotional-catharsis" as const,
    }),
  ]);

  return Object.freeze({
    mode: "reader-retention-simulator",
    source: "deterministic-fallback",
    model: "local-example",
    audienceMetricsAvailable: false,
    predictedEpisodeStarRating: 0,
    completionRatePct: 0,
    scrollVelocitySummaryKo:
      "로컬 연출 예시입니다. 실제 독자 반응이나 체류시간을 측정한 결과가 아니며, 인물·장면·댓글은 대본과 대조해 고쳐 쓰세요.",
    cutRetentionCurve: Object.freeze(cutRetentionCurve),
    predictedTopComments,
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicCharacterOocRadarReport(
  input: WebtoonProductionAssistInput = {},
): AssistCharacterOocRadarView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const dialogueAudits = master.dialogueExchange.beats.slice(0, 4).map((beat, idx) => {
    const cutNum = idx + 1;
    const isMildDrift = idx === 1;
    return Object.freeze({
      cutNumber: cutNum,
      speakerName: beat.speaker,
      originalLine: beat.text,
      oocRiskLevel: (isMildDrift ? "mild-drift" : "safe") as "safe" | "mild-drift" | "severe-ooc",
      speechRegisterKo: idx % 2 === 0 ? "냉소적 반말 · 단문 위주 절제어" : "격식체 위장 · 우회적 압박 어조",
      oocDiagnosisKo: isMildDrift
        ? "감정이 직접 노출되어 캐릭터 특유의 포커페이스 설정과 미세하게 충돌합니다."
        : "캐릭터 고유 어미와 심리적 방어기제가 일관되게 유지되었습니다.",
      subtextHiddenDesireKo:
        idx % 2 === 0
          ? "상대를 밀어내서라도 위험에서 격리하려는 자기희생적 통제 욕구"
          : "상대의 진심을 끝까지 추궁해 동등한 파트너로 인정받으려는 욕망",
      canonicalLine: beat.text,
      highTensionSubtextLine:
        idx % 2 === 0
          ? "그 선을 넘는 순간, 내가 널 어떻게 할지 나도 장담 못 해."
          : "그렇게 눈을 피하는 걸 보니, 이미 답은 정해졌나 보네요.",
      conciseMobileLine:
        idx % 2 === 0
          ? "선 넘지 마. 마지막 경고야."
          : "눈 피하지 마요. 다 알고 왔으니까.",
    });
  });

  return Object.freeze({
    mode: "character-ooc-radar",
    source: "deterministic-fallback",
    model: "local-example",
    voiceConsistencyScore: 95,
    relationshipTensionSummaryKo: `${master.fabulatorNarrativeChain.relationshipLabel} 구도에 맞춰 표면 대사와 속뜻(Subtext)의 온도차를 유지했습니다.`,
    dialogueAudits: Object.freeze(dialogueAudits),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicBg3dLightingAssetReport(
  input: WebtoonProductionAssistInput = {},
): AssistBg3dLightingAssetView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const spaces = [
    "fantasy-dungeon-citadel",
    "indoor-architecture",
    "urban-street",
    "abstract-emotion-void",
  ] as const;

  const cut3dSpecs = master.enrichedCuts.slice(0, 4).map((item, idx) => {
    const cutNum = item.cutPlan.cutNumber;
    const lensMm = item.productionLayers.lensFocalLengthMm;
    const spaceCategory = spaces[idx % spaces.length] ?? "indoor-architecture";
    const cameraHeightCm = lensMm <= 24 ? 45 : lensMm >= 85 ? 162 : 140;
    const cameraTiltDeg = lensMm <= 24 ? 18 : lensMm >= 85 ? -4 : 0;
    const dofBlurStrengthPct = lensMm >= 85 ? 75 : lensMm >= 50 ? 45 : 15;
    const fogDensityPct = idx === 0 ? 40 : idx === 3 ? 65 : 25;
    return Object.freeze({
      cutNumber: cutNum,
      spaceCategory,
      cameraLensMm: clampInt(lensMm, 14, 200, 35),
      cameraHeightCm,
      cameraTiltDeg,
      dofBlurStrengthPct,
      fogDensityPct,
      keyPropPlacementsKo:
        idx === 0
          ? "전경 좌측 아웃포커스 기둥 실루엣 + 중경 바닥 균열 파티클"
          : "인물 등 뒤 역광 창틀 프레임 + 부유하는 먼지/불티 레이어",
      shadowCastDirectionKo: "좌상단 135° 주광원 → 우하단 긴 바닥 그림자(투시 소실점 일치)",
      ready3dStageLine: `[3D 배경 컷 ${cutNum}] ${spaceCategory} · ${lensMm}mm(높이 ${cameraHeightCm}cm, 틸트 ${cameraTiltDeg}°) · DoF 블러 ${dofBlurStrengthPct}% · 안개 ${fogDensityPct}%`,
    });
  });

  return Object.freeze({
    mode: "bg3d-lighting-asset-director",
    source: "deterministic-fallback",
    model: "local-example",
    spatialSceneSummaryKo:
      "리얼드로우·클립스튜디오 3D 카메라 기준 광각(18~24mm) 공간 압도 컷과 망원(85mm) 아웃포커스 인물 감정 컷을 교차 배치했습니다.",
    recommendedAssetPackKo: `${input.genre ?? "판타지"} 시네마틱 모듈형 3D 배경 키트 + 볼류메트릭 안개/빛기둥(God-Ray) 브러시 세트`,
    cut3dSpecs: Object.freeze(cut3dSpecs),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicBgmAudioToonReport(
  input: WebtoonProductionAssistInput = {},
): AssistBgmAudioToonView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const timings = [
    "cut-enter-fade-in",
    "seamless-loop",
    "mid-cut-swell",
    "cliffhanger-hard-stop",
  ] as const;

  const audioCues = master.enrichedCuts.slice(0, 4).map((item, idx) => {
    const cutNum = item.cutPlan.cutNumber;
    const timing = timings[idx % timings.length] ?? "seamless-loop";
    const bgmTrackStyleKo =
      idx === 3
        ? "서브 베이스 드롭 직후 완전 무음(Hard-Stop Silence)"
        : idx === 2
          ? "현악 오스티나토 + 브라스 크레센도 빌드업"
          : "로우파이 피아노 아르페지오 & 앰비언트 패드";
    const foleyAmbienceKo =
      idx === 3
        ? "심장 박동 단발음(쿵-) + 옷자락 스치는 마찰음"
        : "낮은 바람 공명음 + 발걸음 울림 폴리(Foley)";
    const voiceActingDirectionKo =
      idx === 3
        ? "속삭이듯 낮게 깔린 진성, 마지막 음절 전에 450ms 숨 고르기 휴지"
        : "감정을 억누른 차분한 중저음, 어미 끝을 흐리지 않고 단호하게 마무리";
    const breathAndPauseMs = idx === 3 ? 450 : 220;
    return Object.freeze({
      cutNumber: cutNum,
      scrollTriggerTiming: timing,
      bgmTrackStyleKo,
      foleyAmbienceKo,
      voiceActingDirectionKo,
      breathAndPauseMs,
      readyAudioCueLine: `[오디오툰 큐 컷 ${cutNum}] (${timing}) BGM: ${bgmTrackStyleKo} | 폴리: ${foleyAmbienceKo} | 성우 디렉션: ${voiceActingDirectionKo}`,
    });
  });

  return Object.freeze({
    mode: "bgm-audiotoon-cuesheet",
    source: "deterministic-fallback",
    model: "local-example",
    episodeSoundtrackThemeKo:
      "다크 시네마틱 체임버 오케스트라 & 하이브리드 신스 펄스 (클라이맥스 직전 무음 텐션 드롭 구조)",
    recommendedBpm: 96,
    musicalKeySignature: "D Minor",
    audioCues: Object.freeze(audioCues),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicVisualContinuityLinterReport(
  input: WebtoonProductionAssistInput = {},
): AssistVisualContinuityLinterView {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 24) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 24) || "하윤";

  const cutContinuityChecks = Object.freeze([
    Object.freeze({
      cutTransitionLabel: "Cut 1 → Cut 2 (전경 발도 → 오버더숄더 리액션)",
      errorCategory: "chirality-mirror-flip" as const,
      riskSeverity: "pass-locked" as const,
      detectedRiskKo: `${protagonist}의 왼쪽 눈썹 자상 흉터와 왼쪽 허리 검집이 측면 역앵글에서 우측으로 반전될 위험`,
      preventivePromptGuardKo: `신체 해부학적 좌측(Anatomical Left) 앵커를 고정하고 우측 프로필에서는 흉터 노출을 억제`,
      readyContinuityGuardLine: `[작붕 방지 린터 Cut 1→2] ${protagonist} 왼쪽 눈썹 흉터·왼쪽 허리 검집 좌우 반전 금지(Anatomical L-Lock)`,
    }),
    Object.freeze({
      cutTransitionLabel: "Cut 2 → Cut 3 (마법 방벽 충돌 → 클로즈업 대치)",
      errorCategory: "wound-reset-error" as const,
      riskSeverity: "watch-guard" as const,
      detectedRiskKo: `Cut 2 충격파로 발생한 ${partner}의 왼쪽 망토 어깨 찢김(12cm)과 뺨의 미세 찰과상이 Cut 3에서 초기화될 위험`,
      preventivePromptGuardKo: `부상 누적 상태 원장(Wound State Ledger)을 활성화해 Cut 3 이후 모든 컷에 망토 파손 태그 강제 승계`,
      readyContinuityGuardLine: `[작붕 방지 린터 Cut 2→3] ${partner} 왼쪽 망토 찢김 및 뺨 찰과상 비가역 누적 유지(No Wound Reset)`,
    }),
    Object.freeze({
      cutTransitionLabel: "Cut 3 → Cut 4 (인물 클로즈업 → 와이드 클리프행어)",
      errorCategory: "shadow-lighting-conflict" as const,
      riskSeverity: "pass-locked" as const,
      detectedRiskKo: `주광원(좌상단 135° 달빛)과 마법진 하단 보조광의 그림자 투사 방향 불일치 위험`,
      preventivePromptGuardKo: `3D 배경 그림자 방위각(135°)과 2D 셀 그림자 방향을 단일 라이트 리그로 동기화`,
      readyContinuityGuardLine: `[작붕 방지 린터 Cut 3→4] 좌상단 135° 주광원 그림자 방향 및 하단 청색 림라이트 일관성 고정`,
    }),
  ]);

  return Object.freeze({
    mode: "episodic-visual-continuity-linter",
    source: "deterministic-fallback",
    model: "local-example",
    visualContinuityScore: 98,
    zeroAnimationErrorGuarantee: false,
    linterSummaryKo: `${protagonist}·${partner}의 컷간 좌우 비대칭 복식·흉터 반전(Chirality Flip), 무기 소품 증발, 전투 부상 초기화, 배경-인물 그림자 역방향 충돌 등을 살펴보는 로컬 점검 예시입니다. 실제 원고를 전수 검사한 결과가 아닙니다.`,
    cutContinuityChecks,
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicMultiEpisodeCanonVaultReport(
  input: WebtoonProductionAssistInput = {},
): AssistMultiEpisodeCanonVaultView {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 24) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 24) || "하윤";

  const canonEntries = Object.freeze([
    Object.freeze({
      entryId: "canon-vault-01",
      canonCategory: "character-appearance-evolution" as const,
      establishedEpisodeLabel: "EP.01 프롤로그 ~ EP.14 현재",
      immutableRuleKo: `${protagonist}의 왼손목 푸른 성흔은 마력 과부하 시에만 발광하며, 평상시에는 검은 가죽 리스트밴드로 차폐됨`,
      currentEpisodeSyncDirectiveKo: `이번 화 각성 컷(Cut 3)에서 리스트밴드가 끊어지며 푸른 성흔 문양이 최초 노출되도록 연출`,
      readyCanonVaultLine: `[장편 캐논 볼트 #1] ${protagonist} 왼손목 리스트밴드 파손 후 푸른 성흔 최초 발광(EP.01 복선 회수)`,
    }),
    Object.freeze({
      entryId: "canon-vault-02",
      canonCategory: "honorific-speech-matrix" as const,
      establishedEpisodeLabel: "EP.03 첫 대면 ~ 현재",
      immutableRuleKo: `${protagonist}→${partner}: 냉소적 반말('너/그쪽'), ${partner}→${protagonist}: 거리감 있는 공적 존댓말('단장님/당신') 고정`,
      currentEpisodeSyncDirectiveKo: `감정이 격해지는 클라이맥스에서도 ${partner}가 갑자기 반말로 이탈하지 않도록 어미('-군요/-니까') 유지`,
      readyCanonVaultLine: `[장편 캐논 볼트 #2] ${protagonist}(반말) ↔ ${partner}(공적 존댓말) 상호 호칭·어미 매트릭스 고정`,
    }),
    Object.freeze({
      entryId: "canon-vault-03",
      canonCategory: "unresolved-foreshadow-chekhov" as const,
      establishedEpisodeLabel: "EP.05 황궁 지하 서고 씬",
      immutableRuleKo: `부서진 회중시계 안쪽에 각인된 고대 룬 문자 3글자는 황실 배신자의 진명을 가리키는 핵심 단서`,
      currentEpisodeSyncDirectiveKo: `클리프행어 컷 바닥에 떨어진 회중시계 클로즈업 인서트로 독자 추리 댓글 유도`,
      readyCanonVaultLine: `[장편 캐논 볼트 #3] EP.05 회중시계 내부 고대 룬 각인 클로즈업 인서트 배치(미회수 떡밥 연동)`,
    }),
  ]);

  return Object.freeze({
    mode: "multi-episode-canon-memory-vault",
    source: "deterministic-fallback",
    model: "local-example",
    canonVaultIntegrityScore: 99,
    serializedArcTimelineKo: `아래 항목은 외형·호칭·복선을 관리하는 로컬 예시입니다. 과거 회차 설정과 실제로 대조한 결과가 아니므로 사용자 캐논과 확인해 주세요.`,
    canonEntries,
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicFootwearStrideLockReport(
  input: WebtoonProductionAssistInput = {},
): AssistFootwearStrideLockView {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 24) || "서진";
  return Object.freeze({
    mode: "episodic-footwear-floor-contact-stride-lock",
    source: "deterministic-fallback",
    model: "local-example",
    footwearIntegrityScore: 97,
    strideSummaryKo: `${protagonist}의 롱부츠 굽 높이(4.5cm)·발목 은장 버클 2개·계단 디딤판(Tread) 수평 접지 각도를 전 컷 고정해 공중 부양 작붕을 차단합니다.`,
    heelHeightCm: 4.5,
    soleAndBuckleSpecKo: "무릎 아래 블랙 가죽 롱부츠 + 외측 복숭아뼈 위 은장 버클 2단 고정",
    stairSlopeContactRuleKo: "계단 승강 컷에서 앞발 볼(Ball of foot)과 뒷굽이 계단 디딤판 투시선과 평행하게 밀착(AO 그림자 6px)",
    readyFootwearGuardLine: `[신발·계단 접지 고정] ${protagonist} 4.5cm 굽 은장 2버클 롱부츠 유지 · 계단 디딤판 수평 접지 AO 강제`,
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicCrowdDepthFogLockReport(
  input: WebtoonProductionAssistInput = {},
): AssistCrowdDepthFogLockView {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 24) || "서진";
  return Object.freeze({
    mode: "episodic-crowd-silhouette-depth-fog-lock",
    source: "deterministic-fallback",
    model: "local-example",
    depthHierarchyScore: 98,
    crowdAtmosphereSummaryKo: `전경 주연(${protagonist} 선굵기 1.0x) 대비 중경 엑스트라(0.65x)·원경 군중(0.35x + 대기 안개 45%)을 계층 분리해 시선 분산을 막습니다.`,
    heroLineWeightMultiplier: 1.0,
    midgroundCrowdLineMultiplier: 0.65,
    backgroundSilhouetteFogPct: 45,
    readyCrowdDepthGuardLine: `[군중 대기원근 고정] 주연 선굵기 1.0x · 중경 엑스트라 0.65x · 원경 군중 실루엣 안개 45% 채도 감쇠`,
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}
