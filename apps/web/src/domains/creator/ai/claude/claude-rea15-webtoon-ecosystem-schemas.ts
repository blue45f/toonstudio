import { z } from "zod";

import type { ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import type { ClaudeCreatorTaskId, ClaudeCreatorTaskProfile } from "./claude-creator-model-router";
import { REA15_PLATFORM_IDS } from "./claude-rea15-platform-ui-theme-catalog";

export {
  REA15_PLATFORM_IDS,
  REA15_PLATFORM_UI_THEME_CATALOG,
  REA39_PLATFORM_IDS,
  REA39_PLATFORM_UI_THEME_CATALOG,
  REA50_PLATFORM_IDS,
  REA50_PLATFORM_UI_THEME_CATALOG,
  REA65_PLATFORM_IDS,
  REA65_PLATFORM_UI_THEME_CATALOG,
  REA80_PLATFORM_IDS,
  REA80_PLATFORM_UI_THEME_CATALOG,
  type Rea15PlatformId,
  type Rea15PlatformUiThemeSpec,
  type Rea39PlatformId,
  type Rea50PlatformId,
  type Rea65PlatformId,
  type Rea80PlatformId,
} from "./claude-rea15-platform-ui-theme-catalog";

/* ============================================================================
 * 1. GlimNavi Studio v2.3 — 5종 선화 워크플로우 · 6종 표현 프리셋 · 컬러 레이어 분리 · Relight
 * ============================================================================ */

export const GLIMNAVI_LINEART_VERSIONS = [
  "v1.0-basic",
  "v2.0-preserve-original",
  "v2.1-precision",
  "v2.2-learned",
  "v2.3-balanced",
] as const;

export const GLIMNAVI_LINEART_PRESETS = [
  "thin-line",
  "face-preserve",
  "shading-keep",
  "fast-convert",
  "clean-line",
  "detail-preserve",
] as const;

export const GLIMNAVI_CANVAS_PRESETS = [
  "800x600",
  "1024x768",
  "1280x720",
  "1920x1080",
  "2560x1440",
] as const;

export const GlimnaviRelightAndLineartV23Schema = z.object({
  studioStageSummaryKo: z.string(),
  selectedLineartVersion: z.enum(GLIMNAVI_LINEART_VERSIONS),
  selectedLineartPreset: z.enum(GLIMNAVI_LINEART_PRESETS),
  canvasBaseSize: z.enum(GLIMNAVI_CANVAS_PRESETS),
  colorLayerSeparationEnabled: z.boolean(),
  nonDestructiveProposalId: z.string(),
  separatedColorLayers: z.array(
    z.object({
      layerId: z.string(),
      layerNameKo: z.string(),
      dominantHex: z.string(),
      blendMode: z.enum(["normal", "multiply", "screen", "overlay", "soft-light"]),
      opacityPct: z.number(),
      strokeGapTolerancePx: z.number(),
    }),
  ),
  relightPass: z.object({
    aiShadowDirectionDeg: z.number(),
    aiShadowSoftnessPct: z.number(),
    lightingKelvin: z.number(),
    rimLightHex: z.string(),
    ambientOcclusionIntensityPct: z.number(),
    shadingContrastBoostPct: z.number(),
    relightDirectiveKo: z.string(),
  }),
  exportReadiness: z.object({
    downloadCanvasReady: z.boolean(),
    downloadAllLayersZipReady: z.boolean(),
    downloadPsdReady: z.boolean(),
  }),
});

export type GlimnaviRelightAndLineartV23Report = z.infer<
  typeof GlimnaviRelightAndLineartV23Schema
>;

/* ============================================================================
 * 2. KAISTORY — 4단계 단일 프로젝트 데이터 엔벨로프 & KAION 학습카드·독자 퀴즈
 * ============================================================================ */

export const KaistorySingleEnvelopeAndKaionSchema = z.object({
  envelopeSummaryKo: z.string(),
  projectEnvelopeVersion: z.string(),
  offlineFirstSyncStatus: z.enum(["synced-local-authoritative", "pending-delta", "conflict-free-merged"]),
  subdomainStages: z.array(
    z.object({
      subdomain: z.enum([
        "conti.kaistory.net",
        "design.kaistory.net",
        "editor.kaistory.net",
        "story.kaistory.net",
      ]),
      stageNameKo: z.string(),
      derivedRevisionHash: z.string(),
      keyOutputSummaryKo: z.string(),
    }),
  ),
  speakerTtsAndMultilingualTracks: z.array(
    z.object({
      speakerName: z.string(),
      voicePresetId: z.string(),
      koLine: z.string(),
      enLine: z.string(),
      jaLine: z.string(),
      estimatedDurationMs: z.number(),
    }),
  ),
  kaionLearningCards: z.array(
    z.object({
      cardId: z.string(),
      titleKo: z.string(),
      narrativeConceptKo: z.string(),
      quizQuestionKo: z.string(),
      choicesKo: z.array(z.string()),
      correctChoiceIndex: z.number(),
      explanationKo: z.string(),
      rewardBadgeNameKo: z.string(),
    }),
  ),
});

export type KaistorySingleEnvelopeAndKaionReport = z.infer<
  typeof KaistorySingleEnvelopeAndKaionSchema
>;

/* ============================================================================
 * 3. Snaptoon · Frameo · NAVER SHAPER · Plask · Posemaniacs 3D & 스포트라이트 콘 디렉터
 * ============================================================================ */

export const SnaptoonFrameoShaper3dDirectorSchema = z.object({
  directorSummaryKo: z.string(),
  snaptoonBridge: z.object({
    themeMode: z.enum(["paper-warm-FAF8F5", "dark-studio-0A0A0A"]),
    warehouseScenePresetNameKo: z.string(),
    cameraFocalLengthMm: z.number(),
    snapboardAiTransformStrengthPct: z.number(),
    preservedLineFidelityPct: z.number(),
  }),
  frameoSpotlightShader: z.object({
    cursorAngleDeg: z.number(),
    coneSpreadDeg: z.number(),
    edgeSensitivity: z.number(),
    colorSensitivity: z.number(),
    glowPrimaryHex: z.string(),
    glowSecondaryHex: z.string(),
    shortDramaTransitionRuleKo: z.string(),
  }),
  shaperAndPoseRig: z.object({
    shaperPresetComboKo: z.string(),
    surfaceDirectDrawLayerCount: z.number(),
    posemaniacsEcorcheCameraPitchDeg: z.number(),
    posemaniacsHandRigPresetKo: z.string(),
    plaskMocapFootLockConfidencePct: z.number(),
    layeredPsdPassNames: z.array(z.string()),
  }),
});

export type SnaptoonFrameoShaper3dDirectorReport = z.infer<
  typeof SnaptoonFrameoShaper3dDirectorSchema
>;

/* ============================================================================
 * 4. ManhwaAI · Komiko AI · Anifusion 통합 화풍·효과톤·레이어 분리기·노드 플로우 디렉터
 * ============================================================================ */

export const MANHWAAI_STYLE_PRESETS = [
  "full-color",
  "black-and-white",
  "grayscale",
  "monochrome",
  "sketch",
  "watercolor",
] as const;

export const MANHWAAI_TONE_OVERLAYS = [
  "FocusingLine",
  "SpeedLine",
  "Tone",
  "ToneNoise",
  "ToneSnow",
] as const;

export const ManhwaKomikoAnifusionFlowSchema = z.object({
  pipelineSummaryKo: z.string(),
  manhwaStylePreset: z.enum(MANHWAAI_STYLE_PRESETS),
  activeToneOverlays: z.array(
    z.object({
      toneType: z.enum(MANHWAAI_TONE_OVERLAYS),
      targetCutNumber: z.number(),
      opacityPct: z.number(),
      angleDeg: z.number(),
      dramaticPurposeKo: z.string(),
    }),
  ),
  komikoLayerSplitterAndInbetween: z.object({
    ocAnchorId: z.string(),
    splitParts: z.array(z.string()),
    inbetweenFrameCount: z.number(),
    motionCurveType: z.enum(["ease-in-out", "anticipation-snap", "impact-hold", "linear"]),
  }),
  anifusionNodeFlowGraph: z.array(
    z.object({
      nodeId: z.string(),
      nodeType: z.enum([
        "UniversalPromptEditor",
        "CharacterSheetAnchor",
        "FlowImageSelector",
        "ComicPresetStylizer",
        "LayerSplitterOutput",
      ]),
      upstreamNodeIds: z.array(z.string()),
      outputSummaryKo: z.string(),
    }),
  ),
});

export type ManhwaKomikoAnifusionFlowReport = z.infer<
  typeof ManhwaKomikoAnifusionFlowSchema
>;

/* ============================================================================
 * 5. [창의적 AI 특화] 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & 15대 UI/UX 테마 합성기
 * ============================================================================ */

export const CreativeDopamineAndUxSynthesizerSchema = z.object({
  executiveSummaryKo: z.string(),
  overallDopaminePeakScore: z.number(),
  predictedEpisodeCompletionRatePct: z.number(),
  cliffhangerHookPowerPct: z.number(),
  cutScrollHeatmap: z.array(
    z.object({
      cutNumber: z.number(),
      narrativeBeatKo: z.string(),
      predictedDwellTimeMs: z.number(),
      scrollVelocityPxPerSec: z.number(),
      dopamineSpikePct: z.number(),
      recommendedVisualAmplifierKo: z.string(),
    }),
  ),
  synthesizedUiUxTheme: z.object({
    themeTitleKo: z.string(),
    primarySourcePlatform: z.enum(REA15_PLATFORM_IDS),
    secondarySourcePlatform: z.enum(REA15_PLATFORM_IDS),
    surfaceHex: z.string(),
    panelHex: z.string(),
    accentPrimaryHex: z.string(),
    accentSecondaryHex: z.string(),
    textPrimaryHex: z.string(),
    borderRadiusPx: z.number(),
    recommendedFontPairKo: z.string(),
    wcagContrastRatio: z.number(),
    designRationaleKo: z.string(),
  }),
});

export type CreativeDopamineAndUxSynthesizerReport = z.infer<
  typeof CreativeDopamineAndUxSynthesizerSchema
>;

/* ============================================================================
 * 6. TooToon 5-Studio(fabulator~emporium) · GenToon 뷰어/굿즈 · Tooning Plus 6부위 캐릭터 디렉터
 * ============================================================================ */

export const TOOTOON_STUDIO_MODULES = [
  "fabulator",
  "character-studio",
  "visual-studio",
  "artifex",
  "emporium",
] as const;

export const TOONING_CHARACTER_PART_ROUTES = [
  "/character-make-basic",
  "/character-make-face",
  "/character-make-body",
  "/character-make-hand",
  "/character-make-hair",
  "/character-make-etc",
] as const;

export const TootoonGentoonTooningKrSuiteSchema = z.object({
  suiteSummaryKo: z.string(),
  tootoonFiveStudios: z.array(
    z.object({
      moduleId: z.enum(TOOTOON_STUDIO_MODULES),
      routePath: z.string(),
      stageTitleKo: z.string(),
      deliverableSummaryKo: z.string(),
    }),
  ),
  gentoonReaderAndCommerce: z.object({
    readingDirection: z.enum(["vertical-scroll-1", "paged-ltr-0", "paged-rtl-2"]),
    paperHex: z.string(),
    inkHex: z.string(),
    violetAccentHex: z.string(),
    recommendedGoodsItems: z.array(
      z.object({
        skuId: z.string(),
        goodsNameKo: z.string(),
        targetSupporterTierKo: z.string(),
        estimatedMarginPct: z.number(),
      }),
    ),
  }),
  tooningSixPartCharacterRecipe: z.array(
    z.object({
      partRoute: z.enum(TOONING_CHARACTER_PART_ROUTES),
      partLabelKo: z.string(),
      selectedPresetSummaryKo: z.string(),
      consistencyLockScorePct: z.number(),
    }),
  ),
});

export type TootoonGentoonTooningKrSuiteReport = z.infer<
  typeof TootoonGentoonTooningKrSuiteSchema
>;

/* ============================================================================
 * 7. Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더 디렉터
 * ============================================================================ */

export const KreaSplineLumiereRealtimeShaderSchema = z.object({
  realtimePipelineSummaryKo: z.string(),
  kreaRealtimeDirector: z.object({
    activeRoute: z.enum(["/realtime", "/realtime-director", "/apps/image/flux-krea", "/apps/enhance"]),
    i2iDenoiseStrength: z.number(),
    enhanceUpscaleFactor: z.number(),
    blockingPrimitiveCount: z.number(),
    directorCoachingKo: z.string(),
  }),
  spline3dAndHanaBridge: z.object({
    activeRoute: z.enum(["/3d-design", "/hana", "/ai-generate", "/ai-style-transfer", "/mcp"]),
    styleTransferPresetKo: z.string(),
    cameraOrbitAzimuthDeg: z.number(),
    cameraOrbitElevationDeg: z.number(),
    interactiveStateTriggerKo: z.string(),
  }),
  lumiereAndNodeGraphShaders: z.object({
    kuwaharaPaintRadiusPx: z.number(),
    filmHalationIntensityPct: z.number(),
    anamorphicGlareStreakPct: z.number(),
    graphiteProceduralNodeCount: z.number(),
    pixiEditorFrameLoopCount: z.number(),
    compositeShaderNoteKo: z.string(),
  }),
});

export type KreaSplineLumiereRealtimeShaderReport = z.infer<
  typeof KreaSplineLumiereRealtimeShaderSchema
>;

/* ============================================================================
 * 8. LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터
 * ============================================================================ */

export const LtxBoordsCascadeurRiveAnimaticSchema = z.object({
  animaticExecutiveSummaryKo: z.string(),
  ltxAndBoordsAnimaticShots: z.array(
    z.object({
      shotNumber: z.number(),
      cameraMove: z.enum([
        "dolly-in",
        "whip-pan",
        "crane-up",
        "dutch-tilt-push",
        "tracking-orbit",
      ]),
      durationMs: z.number(),
      voiceoverBeatKo: z.string(),
      visualTransitionKo: z.string(),
    }),
  ),
  cascadeurPhysicsRig: z.object({
    autoPosingConfidencePct: z.number(),
    centerOfMassHeightCm: z.number(),
    ballisticTrajectoryArcKo: z.string(),
    angularMomentumTorqueNm: z.number(),
    secondaryClothHairFollowThroughKo: z.string(),
  }),
  riveAndJitterStateMachine: z.object({
    stateMachineName: z.string(),
    scrollTriggerThresholdPct: z.number(),
    states: z.array(
      z.object({
        stateName: z.string(),
        triggerConditionKo: z.string(),
        meshDeformationSummaryKo: z.string(),
        loopFps: z.number(),
      }),
    ),
  }),
});

export type LtxBoordsCascadeurRiveAnimaticReport = z.infer<
  typeof LtxBoordsCascadeurRiveAnimaticSchema
>;

/* ============================================================================
 * 9. Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드 로컬라이저
 * ============================================================================ */

export const CotransVroidSkyboxWorldLocalizerSchema = z.object({
  worldLocalizerSummaryKo: z.string(),
  cotransLetteringAndInpaint: z.object({
    ocrDetectorModel: z.enum(["ctd-comic-text-detector", "dbnet-manga", "craft-vertical"]),
    inpaintingModel: z.enum(["lama-large-512px", "aot-inpaint-manga"]),
    balloonMaskDilatePx: z.number(),
    localizedRegions: z.array(
      z.object({
        regionId: z.string(),
        sourceKoText: z.string(),
        translatedEnText: z.string(),
        translatedJaText: z.string(),
        verticalTypesetting: z.boolean(),
      }),
    ),
  }),
  vroidParametricAvatar: z.object({
    vrmSpecVersion: z.enum(["VRM-1.0", "VRM-0.0"]),
    rimShadeWidthPct: z.number(),
    outlineWidthMm: z.number(),
    hairSpringBoneStiffness: z.number(),
    expressionBlendshapePresetKo: z.string(),
  }),
  skybox360Environment: z.object({
    equirectangularResolution: z.enum(["8192x4096-8K", "6144x3072-6K"]),
    depthMapParallaxStrengthPct: z.number(),
    horizonPitchOffsetDeg: z.number(),
    skyboxStylePresetKo: z.string(),
    ambientIblTintHex: z.string(),
  }),
});

export type CotransVroidSkyboxWorldLocalizerReport = z.infer<
  typeof CotransVroidSkyboxWorldLocalizerSchema
>;

/* ============================================================================
 * 10. WonderUnit Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자 디렉터
 * ============================================================================ */

export const StoryboarderDreamsKritaArtbreederDirectorSchema = z.object({
  directorExecutiveSummaryKo: z.string(),
  shotGeneratorAndComicFactory: z.object({
    lensMm: z.number(),
    cameraHeightCm: z.number(),
    comicGridTemplateKo: z.string(),
    inkLineCleanlinessPct: z.number(),
    storyboardThatPropCount: z.number(),
  }),
  procreateDreamsPerformingTrack: z.object({
    performingRecordSamplingHz: z.number(),
    warpMeshGridSubdivisions: z.number(),
    flipbookOnionSkinFrames: z.number(),
    liveMotionGestureSummaryKo: z.string(),
  }),
  kritaLiveDiffusionAndArtbreederGenes: z.object({
    kritaControlNetStack: z.array(z.string()),
    livePaintingLatencyMs: z.number(),
    artbreederGeneSliders: z.array(
      z.object({
        geneNameKo: z.string(),
        weightNormalized: z.number(),
        visualEffectKo: z.string(),
      }),
    ),
    pixivSketchBrushSyncNoteKo: z.string(),
  }),
});

export type StoryboarderDreamsKritaArtbreederDirectorReport = z.infer<
  typeof StoryboarderDreamsKritaArtbreederDirectorSchema
>;

/* ============================================================================
 * 11. Wave 5: NijiJourney V6 · PixAI · Civitai · TensorArt · SeaArt · WaifuLabs · Picrew · CHARAT 디렉터
 * ============================================================================ */

export const NijiPixaiCivitaiLoraSrefDirectorSchema = z.object({
  loraAndSrefSummaryKo: z.string(),
  nijiJourneyV6Spec: z.object({
    nijiStyleMode: z.enum(["expressive", "cute", "scenic", "original"]),
    srefCode: z.string(),
    styleWeightSw: z.number(),
    characterWeightCw: z.number(),
    compiledNijiPrompt: z.string(),
  }),
  civitaiPixaiTensorLoraStack: z.object({
    baseCheckpointModel: z.string(),
    loraAdapters: z.array(
      z.object({
        loraNameKo: z.string(),
        platformSource: z.string(),
        weight: z.number(),
        triggerWords: z.string(),
      }),
    ),
    controlNetPreprocessor: z.string(),
    moescapeTavernPersonaHookKo: z.string(),
  }),
  waifuLabsPicrewCharatModularParts: z.object({
    waifuLabs4StepSeedGridKo: z.string(),
    picrewLayerZOrder: z.array(z.string()),
    charatPngTuberExpressions: z.array(z.string()),
    paletteSwapHexList: z.array(z.string()),
  }),
});

export type NijiPixaiCivitaiLoraSrefDirectorReport = z.infer<
  typeof NijiPixaiCivitaiLoraSrefDirectorSchema
>;

/* ============================================================================
 * 12. Wave 5: Tripo3D · Meshy 7 · HeroForge 3D 소품/갑주 · Suno V6 OST · ElevenLabs 더빙 · MANGA Plus 디렉터
 * ============================================================================ */

export const TripoMeshyHeroforgeSunoElevenlabsOsmuSchema = z.object({
  osmuExecutiveSummaryKo: z.string(),
  tripoMeshyHeroforge3dPropSpec: z.object({
    targetPropAndArmorNameKo: z.string(),
    tripoQuadPolyCount: z.number(),
    meshyTextureStyle: z.enum(["toon-cel-pbr", "handpainted-arcane", "metallic-gilded"]),
    heroforgePosePresetKo: z.string(),
    toonOutlineThicknessMm: z.number(),
  }),
  sunoAndElevenLabsAudioScore: z.object({
    sunoV6TrackTitleKo: z.string(),
    sunoGenreAndBpmTags: z.string(),
    stemSeparationChannels: z.array(z.string()),
    elevenLabsVoiceCast: z.array(
      z.object({
        characterNameKo: z.string(),
        voiceTimbreKo: z.string(),
        stabilityPct: z.number(),
        styleExaggerationPct: z.number(),
      }),
    ),
    foleySfxPromptKo: z.string(),
  }),
  mangaPlusCreatorsGlobalRelease: z.object({
    readingMode: z.enum(["vertical-scroll", "rtl-page-spread"]),
    localizedLanguages: z.array(z.string()),
    shueishaMonthlyAwardTargetScore: z.number(),
    globalPromoHookKo: z.string(),
  }),
});

export type TripoMeshyHeroforgeSunoElevenlabsOsmuReport = z.infer<
  typeof TripoMeshyHeroforgeSunoElevenlabsOsmuSchema
>;

/* ============================================================================
 * 13. Wave 6: Runway Gen-4.5 · Luma Ray 2 · Pika 2.2 · Viggle JST-2 · Live2D Cubism · Spine 2D 무빙툰 디렉터
 * ============================================================================ */

export const RunwayLumaPikaViggleLive2dSpineMotionSchema = z.object({
  movingToonExecutiveSummaryKo: z.string(),
  motionBrushAndCameraRig: z.object({
    runwayMotionBrushVectors: z.array(
      z.object({
        regionNameKo: z.string(),
        horizontalX: z.number(),
        verticalY: z.number(),
        proximityZ: z.number(),
        ambientNoise: z.number(),
      }),
    ),
    lumaStartEndKeyframeLock: z.object({
      startKeyframePromptKo: z.string(),
      endKeyframePromptKo: z.string(),
      cameraOrbitAndDollyKo: z.string(),
    }),
    pikaffectsAndPhysics: z.object({
      effectPreset: z.enum(["pika-crush", "pika-melt", "pika-explode", "mana-shatter"]),
      lipSyncPhonemeFps: z.number(),
    }),
    viggleJst2MotionTransfer: z.object({
      commandMode: z.enum(["/mix", "/animate", "/ideate", "/character"]),
      drivingMotionSourceKo: z.string(),
      backgroundPlateMode: z.enum(["green-screen-alpha", "original-plate", "toon-bg-lock"]),
    }),
  }),
  live2dAndSpine2dRig: z.object({
    live2dArtMeshVertexCount: z.number(),
    warpDeformerGrid: z.string(),
    eyeBlinkAndLipSyncParams: z.array(z.string()),
    spine2dIkConstraints: z.array(z.string()),
    hairAndCapePhysicsDamping: z.number(),
  }),
});

export type RunwayLumaPikaViggleLive2dSpineMotionReport = z.infer<
  typeof RunwayLumaPikaViggleLive2dSpineMotionSchema
>;

/* ============================================================================
 * 14. Wave 6: SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 30인 협업 · Recraft SVG · Cara Glaze 디렉터
 * ============================================================================ */

export const SketchupBlenderPetalicaMagmaRecraftStudioSchema = z.object({
  hybridStudioExecutiveSummaryKo: z.string(),
  sketchupAndGreasePencil3d: z.object({
    warehouseDynamicComponentKo: z.string(),
    hiddenLineStyleAndShadowTime: z.string(),
    greasePencilStrokeLayers: z.array(z.string()),
    cameraPlane3dProjectionNoteKo: z.string(),
  }),
  petalicaAndOpenArtColorStudio: z.object({
    petalicaModelStyle: z.enum(["Tanpopo", "Satsuki", "Canna"]),
    colorHintStrokeCount: z.number(),
    lineSimplifyLevel: z.number(),
    openArtDirectorConsistencyScorePct: z.number(),
    playgroundMixedCanvasStickerSpecKo: z.string(),
  }),
  magmaRecraftCaraProduction: z.object({
    magmaCollaboratorRoles: z.array(z.string()),
    recraftCanvaskitSvgEmblemKo: z.string(),
    caraGlazeProtectionStrength: z.enum([
      "low-perceptual",
      "balanced-shield",
      "max-adversarial-glaze",
    ]),
    noAiMetaTagEnabled: z.boolean(),
  }),
});

export type SketchupBlenderPetalicaMagmaRecraftStudioReport = z.infer<
  typeof SketchupBlenderPetalicaMagmaRecraftStudioSchema
>;

/* ============================================================================
 * 공통 실행 엔벨로프 및 통합 번들
 * ============================================================================ */

export interface Rea15ExecutionMeta {
  readonly taskId: ClaudeCreatorTaskId;
  readonly taskProfile: ClaudeCreatorTaskProfile;
  readonly routedModel: string;
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly fallbackReason?: string;
}

export interface Rea15Envelope<T> {
  readonly source: "claude-live" | "local-fallback";
  readonly report: T;
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly taskProfile: ClaudeCreatorTaskProfile;
  readonly routedModel: string;
  readonly fallbackReason?: string;
  readonly meta: Rea15ExecutionMeta;
}

export interface Rea15FullSuiteBundle {
  readonly generatedAtIso: string;
  readonly totalEstimatedCostUsd: number;
  readonly liveEngineCount: number;
  readonly fallbackEngineCount: number;
  readonly glimnaviRelightLineart: Rea15Envelope<GlimnaviRelightAndLineartV23Report>;
  readonly kaistoryEnvelopeKaion: Rea15Envelope<KaistorySingleEnvelopeAndKaionReport>;
  readonly snaptoonFrameoShaper3d: Rea15Envelope<SnaptoonFrameoShaper3dDirectorReport>;
  readonly manhwaKomikoAnifusionFlow: Rea15Envelope<ManhwaKomikoAnifusionFlowReport>;
  readonly creativeDopamineUxSynthesizer: Rea15Envelope<CreativeDopamineAndUxSynthesizerReport>;
  readonly tootoonGentoonTooningKrSuite: Rea15Envelope<TootoonGentoonTooningKrSuiteReport>;
  readonly kreaSplineLumiereRealtimeShader: Rea15Envelope<KreaSplineLumiereRealtimeShaderReport>;
  readonly ltxBoordsCascadeurRiveAnimatic: Rea15Envelope<LtxBoordsCascadeurRiveAnimaticReport>;
  readonly cotransVroidSkyboxLocalizer: Rea15Envelope<CotransVroidSkyboxWorldLocalizerReport>;
  readonly storyboarderDreamsKritaArtbreeder: Rea15Envelope<StoryboarderDreamsKritaArtbreederDirectorReport>;
  readonly nijiPixaiCivitaiLoraSrefDirector: Rea15Envelope<NijiPixaiCivitaiLoraSrefDirectorReport>;
  readonly tripoMeshyHeroforgeSunoElevenlabsOsmu: Rea15Envelope<TripoMeshyHeroforgeSunoElevenlabsOsmuReport>;
  readonly runwayLumaPikaViggleLive2dSpineMotion: Rea15Envelope<RunwayLumaPikaViggleLive2dSpineMotionReport>;
  readonly sketchupBlenderPetalicaMagmaRecraftStudio: Rea15Envelope<SketchupBlenderPetalicaMagmaRecraftStudioReport>;
}
