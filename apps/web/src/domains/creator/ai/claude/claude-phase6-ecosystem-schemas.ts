import { z } from "zod";

import type { ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import type { ClaudeCreatorTaskId, ClaudeCreatorTaskProfile } from "./claude-creator-model-router";
import type { WebtoonProductionAssistInput } from "./claude-webtoon-production-schemas";

export type { WebtoonProductionAssistInput };

export interface Phase6EcosystemExecutionMeta {
  readonly taskId: ClaudeCreatorTaskId;
  readonly taskProfile: ClaudeCreatorTaskProfile;
  readonly routedModel: string;
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly fallbackReason?: string;
}

export interface Phase6EcosystemEnvelope<T> {
  readonly source: "claude-live" | "local-fallback";
  readonly report: T;
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly taskProfile: ClaudeCreatorTaskProfile;
  readonly routedModel: string;
  readonly fallbackReason?: string;
  readonly meta: Phase6EcosystemExecutionMeta;
}

/* ------------------------------------------------------------------ */
/* 1. NovelAI V4.5 / V5 — 다중 캐릭터 X/Y 공간 좌표 분리 & Vibe Transfer */
/* ------------------------------------------------------------------ */

export const NovelAiCharacterRegionSchema = z.object({
  characterName: z.string(),
  roleLabelKo: z.string(),
  bboxNormalized: z.object({
    xMin: z.number(),
    yMin: z.number(),
    xMax: z.number(),
    yMax: z.number(),
  }),
  positiveAppearanceTags: z.string(),
  negativeBleedingGuardTags: z.string(),
  interactionVectorKo: z.string(),
});

export const NovelAiVibeTransferSpecSchema = z.object({
  vibeReferenceLabelKo: z.string(),
  referenceStrength: z.number(),
  informationExtracted: z.number(),
  colorMoodLockHex: z.string(),
});

export const NovelAiLorebookTriggerSchema = z.object({
  keyword: z.string(),
  injectedWorldContextKo: z.string(),
  priorityOrder: z.number(),
});

export const NovelAiMultiCharVibeReportSchema = z.object({
  sceneCompositionSummaryKo: z.string(),
  attributeBleedingZeroGuarantee: z.boolean(),
  spatialOverlapRatioPct: z.number(),
  characterRegions: z.array(NovelAiCharacterRegionSchema),
  vibeTransfer: NovelAiVibeTransferSpecSchema,
  lorebookTriggers: z.array(NovelAiLorebookTriggerSchema),
});

export type NovelAiCharacterRegion = z.infer<typeof NovelAiCharacterRegionSchema>;
export type NovelAiVibeTransferSpec = z.infer<typeof NovelAiVibeTransferSpecSchema>;
export type NovelAiLorebookTrigger = z.infer<typeof NovelAiLorebookTriggerSchema>;
export type NovelAiMultiCharVibeReport = z.infer<typeof NovelAiMultiCharVibeReportSchema>;
export type NovelAiMultiCharVibeEnvelope = Phase6EcosystemEnvelope<NovelAiMultiCharVibeReport>;

/* ------------------------------------------------------------------ */
/* 2. MangaFlow Studio & DiffSensei — 캐릭터 동일성(ArcFace) & 말풍선 꼬리 */
/* ------------------------------------------------------------------ */

export const MangaFlowCutIdentityAuditSchema = z.object({
  cutNumber: z.number(),
  speakerName: z.string(),
  groundingDinoFaceBox: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  arcFaceSimilarityScore: z.number(),
  mllmIdentityAdapterWeight: z.number(),
  outfitContinuityPass: z.boolean(),
  balloonAnchorXY: z.object({
    x: z.number(),
    y: z.number(),
  }),
  speakerMouthTargetXY: z.object({
    x: z.number(),
    y: z.number(),
  }),
  correctivePromptKo: z.string(),
});

export const MangaFlowIdentityVerificationReportSchema = z.object({
  averageArcFaceScore: z.number(),
  identityPassRatePct: z.number(),
  diffSenseiAdapterSummaryKo: z.string(),
  cutAudits: z.array(MangaFlowCutIdentityAuditSchema),
});

export type MangaFlowCutIdentityAudit = z.infer<typeof MangaFlowCutIdentityAuditSchema>;
export type MangaFlowIdentityVerificationReport = z.infer<
  typeof MangaFlowIdentityVerificationReportSchema
>;
export type MangaFlowIdentityVerificationEnvelope =
  Phase6EcosystemEnvelope<MangaFlowIdentityVerificationReport>;

/* ------------------------------------------------------------------ */
/* 3. 그림나비 (Glimnavi, 와이즈허브) — 브러시 컬러 힌트 스트로크 자동 채색 */
/* ------------------------------------------------------------------ */

export const GlimnaviColorHintStrokeSchema = z.object({
  strokeId: z.string(),
  targetRegionLabelKo: z.string(),
  targetLayer: z.enum(["base-flat", "ambient-occlusion", "cel-shadow", "rim-highlight"]),
  hexColor: z.string(),
  brushRadiusPx: z.number(),
  strokePathNormalized: z.object({
    startX: z.number(),
    startY: z.number(),
    endX: z.number(),
    endY: z.number(),
  }),
  leakPreventionConfidence: z.number(),
});

export const GlimnaviColorHintReportSchema = z.object({
  closeGapTolerancePx: z.number(),
  coloringTimeSavedEstPct: z.number(),
  humanInTheLoopGuideKo: z.string(),
  hintStrokes: z.array(GlimnaviColorHintStrokeSchema),
});

export type GlimnaviColorHintStroke = z.infer<typeof GlimnaviColorHintStrokeSchema>;
export type GlimnaviColorHintReport = z.infer<typeof GlimnaviColorHintReportSchema>;
export type GlimnaviColorHintEnvelope = Phase6EcosystemEnvelope<GlimnaviColorHintReport>;

/* ------------------------------------------------------------------ */
/* 4. 스냅툰 (Snaptoon) & 에이콘3D (ACON3D) — 3D 배경 툰셰이더·환경광 */
/* ------------------------------------------------------------------ */

export const SnaptoonTimePresetSchema = z.enum([
  "daylight-clear",
  "sunset-golden",
  "night-neon",
  "indoor-fluorescent",
  "dungeon-torch",
]);

export const SnaptoonCutEnvironmentSpecSchema = z.object({
  cutNumber: z.number(),
  acon3dAssetPackKo: z.string(),
  savedCameraBookmarkId: z.string(),
  timeOfDayPreset: SnaptoonTimePresetSchema,
  sunAzimuthDeg: z.number(),
  sunElevationDeg: z.number(),
  toonShadowHardness: z.number(),
  windowGlowIntensity: z.number(),
  bloomIntensity: z.number(),
  depthFogDensity: z.number(),
  characterHeadHeightMatchCm: z.number(),
  compositingTipKo: z.string(),
});

export const Snaptoon3dEnvironmentShaderReportSchema = z.object({
  masterEnvironmentSummaryKo: z.string(),
  sketchupToSnaptoonBridgeNoteKo: z.string(),
  cutEnvironments: z.array(SnaptoonCutEnvironmentSpecSchema),
});

export type SnaptoonTimePreset = z.infer<typeof SnaptoonTimePresetSchema>;
export type SnaptoonCutEnvironmentSpec = z.infer<typeof SnaptoonCutEnvironmentSpecSchema>;
export type Snaptoon3dEnvironmentShaderReport = z.infer<
  typeof Snaptoon3dEnvironmentShaderReportSchema
>;
export type Snaptoon3dEnvironmentShaderEnvelope =
  Phase6EcosystemEnvelope<Snaptoon3dEnvironmentShaderReport>;

/* ------------------------------------------------------------------ */
/* 5. 더컬쳐툰·마이닝5000·Storyflow — 웹소설 각색 & 2차 IP OSMU 스코어카드 */
/* ------------------------------------------------------------------ */

export const StoryArchetypeKindSchema = z.enum([
  "heros-journey",
  "regression-revenge",
  "contract-romance",
  "dungeon-awakening",
  "mystery-thriller",
]);

export const NovelToWebtoonBeatAdaptationSchema = z.object({
  beatNumber: z.number(),
  originalProseSummaryKo: z.string(),
  visualShowDontTellActionKo: z.string(),
  adaptedBubbleDialogueKo: z.string(),
  monologueCompressionPct: z.number(),
  recommendedScrollGapPx: z.number(),
});

export const OsmuMediaFormatScoreSchema = z.object({
  mediaFormat: z.enum([
    "k-drama-series",
    "ott-animation",
    "audio-drama",
    "short-form-reels",
    "character-game",
  ]),
  readinessScore: z.number(),
  keySellingPointKo: z.string(),
  adaptationBottleneckKo: z.string(),
});

export const NovelAdaptationAndIpExpansionReportSchema = z.object({
  storyArchetype: StoryArchetypeKindSchema,
  overallProseCompressionPct: z.number(),
  narrativePacingVerdictKo: z.string(),
  adaptedBeats: z.array(NovelToWebtoonBeatAdaptationSchema),
  osmuExpansionScores: z.array(OsmuMediaFormatScoreSchema),
});

export type StoryArchetypeKind = z.infer<typeof StoryArchetypeKindSchema>;
export type NovelToWebtoonBeatAdaptation = z.infer<typeof NovelToWebtoonBeatAdaptationSchema>;
export type OsmuMediaFormatScore = z.infer<typeof OsmuMediaFormatScoreSchema>;
export type NovelAdaptationAndIpExpansionReport = z.infer<
  typeof NovelAdaptationAndIpExpansionReportSchema
>;
export type NovelAdaptationAndIpExpansionEnvelope =
  Phase6EcosystemEnvelope<NovelAdaptationAndIpExpansionReport>;

/* ------------------------------------------------------------------ */
/* 6. ToonCrafter & AniDoc & Krita/Comistitch — 인비트윈 동화 & 세로 스티칭 */
/* ------------------------------------------------------------------ */

export const ToonCrafterKeyframeBridgeSchema = z.object({
  bridgeId: z.string(),
  startKeyframeCut: z.number(),
  endKeyframeCut: z.number(),
  inbetweenFrameCount: z.number(),
  motionCurveType: z.enum(["ease-in-out", "impact-snap", "slow-anticipation", "linear-pan"]),
  anidocColorReferenceLock: z.boolean(),
  occlusionRepairGuideKo: z.string(),
});

export const KritaComistitchSliceSpecSchema = z.object({
  sliceIndex: z.number(),
  startYPx: z.number(),
  endYPx: z.number(),
  safeSplitInGutterConfirmed: z.boolean(),
  kritaOutpaintTransitionPromptKo: z.string(),
});

export const ToonCrafterInbetweenAndStitchReportSchema = z.object({
  totalStitchedHeightPx: z.number(),
  zeroBubbleSliceGuarantee: z.boolean(),
  productionSummaryKo: z.string(),
  inbetweenBridges: z.array(ToonCrafterKeyframeBridgeSchema),
  comistitchSlices: z.array(KritaComistitchSliceSpecSchema),
});

export type ToonCrafterKeyframeBridge = z.infer<typeof ToonCrafterKeyframeBridgeSchema>;
export type KritaComistitchSliceSpec = z.infer<typeof KritaComistitchSliceSpecSchema>;
export type ToonCrafterInbetweenAndStitchReport = z.infer<
  typeof ToonCrafterInbetweenAndStitchReportSchema
>;
export type ToonCrafterInbetweenAndStitchEnvelope =
  Phase6EcosystemEnvelope<ToonCrafterInbetweenAndStitchReport>;
