/**
 * Story · Mood Lighting · Print CMYK/Bleed Preflight · Human Craft Badge · Global Localization Pro
 * 100% 브라우저 로컬(₩0) 결정적 창작·인쇄·글로벌 파이프라인 진입 배럴.
 */

export {
  generateStoryboardFromScript,
  parseScriptDocument,
} from "./script-to-storyboard-engine";
export type {
  BubbleShapeKind,
  CameraAngle,
  CameraShotType,
  CompositionRule,
  PacingBeatPhase,
  ParsedScriptDocument,
  ParsedScriptLine,
  ParsedScriptScene,
  StoryboardBubblePlacement,
  StoryboardCut,
  StoryboardEmotion,
  StoryboardGenerationOptions,
  StoryboardPacingProfile,
  StoryboardPacingWarning,
  StoryboardPlan,
  StoryboardSfxCue,
} from "./script-to-storyboard-engine";

export {
  computeMoodLightingRig,
  detectScriptMoodProfile,
  interpolateMoodLightingRigs,
  kelvinToRgb,
  mapStoryboardToMoodLighting,
  MAX_KELVIN,
  MIN_KELVIN,
  rgbToHex,
  SCRIPT_MOOD_PRESETS,
} from "./script-mood-lighting-engine";
export type {
  AmbientHemisphereSpec,
  CanvasColorGradeSpec,
  CutMoodLightingEntry,
  KeyLightSpec,
  MoodDetectionResult,
  MoodLightingRig,
  MoodWeightContribution,
  RgbColor8,
  RimLight3dTo2dMapping,
  ScriptMoodPresetId,
  ShadowTintSpec,
  Vec2,
  Vec3,
} from "./script-mood-lighting-engine";

export {
  calculateBookSpineThicknessMm,
  computeDeltaE76,
  computePrintPageGeometry,
  DEFAULT_GUTTER_SAFE_MARGIN_MM,
  DEFAULT_OUTER_SAFE_MARGIN_MM,
  DEFAULT_PRINT_BLEED_MM,
  evaluateColorGamutBatch,
  MIN_RECOMMENDED_BLEED_MM,
  MIN_RECOMMENDED_PRINT_DPI,
  mmToPx,
  PRINT_ICC_PROFILES,
  PRINT_TRIM_PRESETS,
  rgbToCmykSoftProof,
  runPrintCmykBleedPreflight,
} from "./print-cmyk-bleed-preflight";
export type {
  BookBindingKind,
  BookSpineCalculation,
  BookSpineInput,
  CmykColorPercent,
  ColorGamutBatchReport,
  CropMarkSegmentMm,
  PaperStockKind,
  PrintCriticalElementBox,
  PrintIccProfileId,
  PrintIccProfileSpec,
  PrintPageGeometry,
  PrintPreflightInput,
  PrintPreflightIssue,
  PrintPreflightReport,
  PrintTrimFormatId,
  PrintTrimPreset,
  RectMm,
  SoftProofColorResult,
} from "./print-cmyk-bleed-preflight";

export {
  canonicalJsonStringify,
  evaluateRightsBomGovernance,
  issueHumanCraftReceipt,
  sha256Hex,
  summarizeStrokeHistory,
  summarizeTimelapseEvidence,
  verifyHumanCraftReceipt,
} from "./human-craft-and-license-governance";
export type {
  EvaluatedRightsBomAsset,
  HumanCraftBadgeStatus,
  HumanCraftReceiptInput,
  HumanCraftReceiptPayload,
  HumanCraftReceiptVerificationResult,
  HumanCraftVerificationReceipt,
  OnDeviceStrokeSample,
  RightsBomAssetInput,
  RightsBomGovernanceSummary,
  RightsGovernanceTag,
  RightsLicenseCode,
  StrokeHistoryDigestSummary,
  StrokeToolKind,
  TimelapseCheckpointFrame,
  TimelapseEvidenceSummary,
} from "./human-craft-and-license-governance";

export {
  DEFAULT_NUANCE_GLOSSARY,
  detectKoreanSpeechRegister,
  LOCALE_EXPANSION_BASELINES,
  localizeScriptNuances,
  measureVisualTextUnits,
  planEpisodeLocalization,
  verifyBubbleLocalizationReflow,
} from "./global-localization-nuance";
export type {
  AppliedNuanceSubstitution,
  BubbleGeometrySpec,
  BubbleReflowStatus,
  BubbleReflowVerification,
  CulturalNuanceGlossaryEntry,
  EpisodeBubbleInput,
  EpisodeLocalizationReport,
  LocalizationLocale,
  LocalizedEpisodeBubbleReport,
  NuanceLocalizationOptions,
  NuanceLocalizationResult,
  NuanceTermCategory,
  SpeechRegisterLevel,
  WritingDirectionMode,
} from "./global-localization-nuance";
