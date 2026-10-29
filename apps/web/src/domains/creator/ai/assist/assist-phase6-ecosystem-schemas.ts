import { z } from "zod";

import type { AssistTokenUsage } from "@/shared/ai/assist/assist-models";
import type { AssistCreatorTaskId, AssistCreatorTaskProfile } from "./assist-creator-model-router";
import type { WebtoonProductionAssistInput } from "./assist-webtoon-production-schemas";

export type { WebtoonProductionAssistInput };

export interface Phase6EcosystemExecutionMeta {
  readonly taskId: AssistCreatorTaskId;
  readonly taskProfile: AssistCreatorTaskProfile;
  readonly routedModel: string;
  readonly modelUsed: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedCostUsd: number;
  readonly fallbackReason?: string;
}

export interface Phase6EcosystemEnvelope<T> {
  readonly source: "claude-live" | "local-fallback";
  readonly report: T;
  readonly modelUsed: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedCostUsd: number;
  readonly taskProfile: AssistCreatorTaskProfile;
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

/* ------------------------------------------------------------------ */
/* 7. 비대칭 복식·흉터·무기 파지 비례·부상 누적 연속성 원장 디렉터        */
/* ------------------------------------------------------------------ */

export const AsymmetricCostumePropWoundItemSchema = z.object({
  itemId: z.string(),
  characterName: z.string(),
  anatomicalAnchorSide: z.enum([
    "anatomical-left",
    "anatomical-right",
    "bilateral-symmetric",
  ]),
  featureCategory: z.enum([
    "facial-scar-mole",
    "asymmetric-pauldron-cape",
    "weapon-scabbard-grip",
    "cumulative-battle-wound",
  ]),
  canonicalSpecKo: z.string(),
  weaponToHandScaleRatio: z.string(),
  mirrorFlipRiskWarningKo: z.string(),
  activeFromCutToCut: z.string(),
  persistencePromptLock: z.string(),
});

export const AsymmetricCostumePropWoundLedgerReportSchema = z.object({
  chiralityConsistencyScore: z.number(),
  zeroMirrorFlipGuarantee: z.boolean(),
  ledgerSummaryKo: z.string(),
  ledgerItems: z.array(AsymmetricCostumePropWoundItemSchema),
});

export type AsymmetricCostumePropWoundItem = z.infer<
  typeof AsymmetricCostumePropWoundItemSchema
>;
export type AsymmetricCostumePropWoundLedgerReport = z.infer<
  typeof AsymmetricCostumePropWoundLedgerReportSchema
>;
export type AsymmetricCostumePropWoundLedgerEnvelope =
  Phase6EcosystemEnvelope<AsymmetricCostumePropWoundLedgerReport>;

/* ------------------------------------------------------------------ */
/* 8. 180도 시선 축(180° Rule)·다중 인물 키 차이·원근 소실점 일관성 감독  */
/* ------------------------------------------------------------------ */

export const CameraAxisCutSpecSchema = z.object({
  cutNumber: z.number(),
  cameraSideOfAxis: z.enum(["axis-side-A-standard", "intentional-axis-bridge"]),
  leftScreenCharacter: z.string(),
  rightScreenCharacter: z.string(),
  eyelineVectorMatchPass: z.boolean(),
  heightDeltaApparentCm: z.number(),
  horizonLineRatioY: z.number(),
  spatialCorrectionGuideKo: z.string(),
});

export const CameraAxisEyelineHeightLockReportSchema = z.object({
  canonicalHeightDeltaCm: z.number(),
  axis180ViolationCount: z.number(),
  spatialContinuitySummaryKo: z.string(),
  cutAxisAudits: z.array(CameraAxisCutSpecSchema),
});

export type CameraAxisCutSpec = z.infer<typeof CameraAxisCutSpecSchema>;
export type CameraAxisEyelineHeightLockReport = z.infer<
  typeof CameraAxisEyelineHeightLockReportSchema
>;
export type CameraAxisEyelineHeightLockEnvelope =
  Phase6EcosystemEnvelope<CameraAxisEyelineHeightLockReport>;

/* ------------------------------------------------------------------ */
/* 9. 컷간 피부톤·의상 고유색(Albedo) 드리프트 방지 & 환경광 일관성 고정기 */
/* ------------------------------------------------------------------ */

export const CrossCutColorSwatchLockSchema = z.object({
  characterOrPropName: z.string(),
  partLabelKo: z.string(),
  albedoBaseHex: z.string(),
  shadowMultiplyHex: z.string(),
  lightingKelvinK: z.number(),
  renderedApparentHex: z.string(),
  deltaEDriftTolerance: z.number(),
});

export const CrossCutColorScriptAlbedoLockReportSchema = z.object({
  maxDeltaEDrift: z.number(),
  albedoConsistencyPass: z.boolean(),
  sceneLightingKelvinsSummaryKo: z.string(),
  colorLocks: z.array(CrossCutColorSwatchLockSchema),
});

export type CrossCutColorSwatchLock = z.infer<typeof CrossCutColorSwatchLockSchema>;
export type CrossCutColorScriptAlbedoLockReport = z.infer<
  typeof CrossCutColorScriptAlbedoLockReportSchema
>;
export type CrossCutColorScriptAlbedoLockEnvelope =
  Phase6EcosystemEnvelope<CrossCutColorScriptAlbedoLockReport>;

/* ------------------------------------------------------------------ */
/* 10. 컷간 미세 표정(FACS 근육)·시선 궤적·호흡 감정선 연속성 디렉터     */
/* ------------------------------------------------------------------ */

export const MicroExpressionBeatTransitionSchema = z.object({
  cutNumber: z.number(),
  characterName: z.string(),
  facsActionUnits: z.string(),
  pupilConstrictionLevel: z.enum(["normal", "dilated-shock", "contracted-rage", "trembling-grief"]),
  browTensionPct: z.number(),
  gazeTrajectoryKo: z.string(),
  emotionalInertiaNoteKo: z.string(),
  actingPromptLock: z.string(),
});

export const MicroExpressionActingContinuityReportSchema = z.object({
  emotionalContinuityScore: z.number(),
  zeroWhiplashGuarantee: z.boolean(),
  actingArcSummaryKo: z.string(),
  microExpressionBeats: z.array(MicroExpressionBeatTransitionSchema),
});

export type MicroExpressionBeatTransition = z.infer<
  typeof MicroExpressionBeatTransitionSchema
>;
export type MicroExpressionActingContinuityReport = z.infer<
  typeof MicroExpressionActingContinuityReportSchema
>;
export type MicroExpressionActingContinuityEnvelope =
  Phase6EcosystemEnvelope<MicroExpressionActingContinuityReport>;

/* ------------------------------------------------------------------ */
/* 11. 의상 칼라·넥타이 매듭·로판 리본·갑옷 목깃(Gorget) 대칭 및 풀림 고정 */
/* ------------------------------------------------------------------ */

export const CollarTieLapelNecklineLockReportSchema = z.object({
  necklineConsistencyScore: z.number(),
  unbuttonedTopButtonCount: z.number(),
  collarAndLapelSpecKo: z.string(),
  tieCravatBroochRuleKo: z.string(),
  readyNecklineGuardLine: z.string(),
});

export type CollarTieLapelNecklineLockReport = z.infer<
  typeof CollarTieLapelNecklineLockReportSchema
>;
export type CollarTieLapelNecklineLockEnvelope =
  Phase6EcosystemEnvelope<CollarTieLapelNecklineLockReport>;

/* ------------------------------------------------------------------ */
/* 12. 문신·성흔(Stigma)·마안·저주 낙인 신체 UV 곡면 왜곡 및 발광 고정기   */
/* ------------------------------------------------------------------ */

export const TattooStigmaUvTopologyLockReportSchema = z.object({
  uvTopologyLockScore: z.number(),
  anatomicalUvZoneKo: z.string(),
  foreshorteningWarpRuleKo: z.string(),
  emissionStageAndHexKo: z.string(),
  readyStigmaUvGuardLine: z.string(),
});

export type TattooStigmaUvTopologyLockReport = z.infer<
  typeof TattooStigmaUvTopologyLockReportSchema
>;
export type TattooStigmaUvTopologyLockEnvelope =
  Phase6EcosystemEnvelope<TattooStigmaUvTopologyLockReport>;

/* ------------------------------------------------------------------ */
/* 13. 소환수·신수·마스코트·반려동물 체구 비례 및 뿔·날개·꼬리 수 고정기   */
/* ------------------------------------------------------------------ */

export const CompanionFamiliarScaleLockReportSchema = z.object({
  companionScaleScore: z.number(),
  bodyLengthCm: z.number(),
  hornWingTailCountRuleKo: z.string(),
  shoulderPalmPerchSpecKo: z.string(),
  readyCompanionGuardLine: z.string(),
});

export type CompanionFamiliarScaleLockReport = z.infer<
  typeof CompanionFamiliarScaleLockReportSchema
>;
export type CompanionFamiliarScaleLockEnvelope =
  Phase6EcosystemEnvelope<CompanionFamiliarScaleLockReport>;

/* ------------------------------------------------------------------ */
/* 14. 실내 방 구조·가구 배치·창문 채광 방향·문 경첩 개폐 평면도 고정 감독 */
/* ------------------------------------------------------------------ */

export const InteriorRoomGeographyLockReportSchema = z.object({
  roomGeographyScore: z.number(),
  windowWallCompassDirection: z.string(),
  doorHingeSideAndSwingRuleKo: z.string(),
  furnitureCoordinateGridKo: z.string(),
  readyRoomGeographyGuardLine: z.string(),
});

export type InteriorRoomGeographyLockReport = z.infer<
  typeof InteriorRoomGeographyLockReportSchema
>;
export type InteriorRoomGeographyLockEnvelope =
  Phase6EcosystemEnvelope<InteriorRoomGeographyLockReport>;

/* ------------------------------------------------------------------ */
/* 15. 무대사 감정 여운 컷(Silent Beat) 세로 픽셀 호흡·페이드 리듬 디렉터  */
/* ------------------------------------------------------------------ */

export const ScrollPaceSilentBeatRhythmReportSchema = z.object({
  silentPacingScore: z.number(),
  silentBeatGutterHeightPx: z.number(),
  gradientFadeTransitionKo: z.string(),
  eyeContactHoldDurationSec: z.number(),
  readySilentBeatGuardLine: z.string(),
});

export type ScrollPaceSilentBeatRhythmReport = z.infer<
  typeof ScrollPaceSilentBeatRhythmReportSchema
>;
export type ScrollPaceSilentBeatRhythmEnvelope =
  Phase6EcosystemEnvelope<ScrollPaceSilentBeatRhythmReport>;

/* ------------------------------------------------------------------ */
/* 16. 역광 귀·손가락 피하산란(SSS) 및 눈물·땀방울 굴절 하이라이트 고정기  */
/* ------------------------------------------------------------------ */

export const SubsurfaceScatteringTearSpecularLockReportSchema = z.object({
  sssAndSpecularScore: z.number(),
  earFingertipSssHex: z.string(),
  tearSweatRefractionRuleKo: z.string(),
  catchlightPositionSpecKo: z.string(),
  readySssTearGuardLine: z.string(),
});

export type SubsurfaceScatteringTearSpecularLockReport = z.infer<
  typeof SubsurfaceScatteringTearSpecularLockReportSchema
>;
export type SubsurfaceScatteringTearSpecularLockEnvelope =
  Phase6EcosystemEnvelope<SubsurfaceScatteringTearSpecularLockReport>;
