/**
 * 웹툰 1~60컷+ 전 에피소드 자동 연속성 감시관(Webtoon Continuity Guard) 공개 API.
 */

export {
  CONTINUITY_PROP_META,
  DEFAULT_CONTINUITY_GUARD_CONFIG,
  analyzeEpisodeContinuity,
  applyAllContinuityFixes,
  applyContinuityFix,
  clamp01,
  computeCiede2000,
  computeOklchDeltaE00,
  createDemo60CutEpisode,
  formatOklchCss,
  formatOklchSummary,
  normalizeAngleDeg,
  oklchToCieLab,
  shortestAngularDiffDeg,
} from "./webtoon-continuity-guard";

export type {
  AsymmetricSide,
  AttachmentSide,
  BatchContinuityFixResult,
  CharacterAsymmetricTraits,
  CharacterCutSnapshot,
  CharacterPropSnapshot,
  CieLabColor,
  ContinuityCategoryCounts,
  ContinuityExemptTransition,
  ContinuityFixResult,
  ContinuityGateStatus,
  ContinuityGuardConfig,
  ContinuityIssue,
  ContinuityIssueCategory,
  ContinuityIssueMetrics,
  ContinuityIssueSubtype,
  ContinuityPatch,
  ContinuityPatchOperation,
  ContinuityPropKind,
  ContinuityScanReport,
  ContinuitySeverity,
  ContinuitySeverityCounts,
  CutSceneTag,
  IntentionalPropEvent,
  KeyLightSnapshot,
  OklchColor,
  WebtoonCutSnapshot,
  WebtoonEpisodeTimeline,
} from "./webtoon-continuity-guard";

export { StudioWebtoonContinuityGuardPanel } from "./StudioWebtoonContinuityGuardPanel";
export type { StudioWebtoonContinuityGuardPanelProps } from "./StudioWebtoonContinuityGuardPanel";
