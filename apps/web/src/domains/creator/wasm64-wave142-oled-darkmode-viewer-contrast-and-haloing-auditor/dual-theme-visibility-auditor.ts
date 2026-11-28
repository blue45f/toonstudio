/**
 * Wave 142 — 연속 컷 양면 뷰어 감사기 & 비파괴 림/배경판·완충 거터 자동 교정 솔버 통합 진입점.
 */

export {
  auditEpisodeDualThemeReadability,
  evaluateElementOnViewerTheme,
} from "./dual-theme-audit-core";

export { synthesizeThemeSafeRemediation } from "./dual-theme-remediation-solver";

export {
  DEFAULT_DUAL_THEME_AUDIT_CONFIG,
  clampUnitLuma,
  requiredThresholdsForElement,
  resolveDualThemeAuditConfig,
  type AppliedGutterRamp,
  type AuditedEpisodeCut,
  type AuditedVisualElement,
  type CutLuminanceTransition,
  type DualThemeAuditConfig,
  type DualThemeAuditReport,
  type DualThemeDefect,
  type DualThemeDefectCode,
  type DualThemeRemediationResult,
  type ElementAuditSummary,
  type ElementBackdropMode,
  type ElementContrastGlazeSpec,
  type ElementHaloSpec,
  type ElementPlateSpec,
  type ElementRemediationPatch,
  type ElementThemeEvaluation,
  type EpisodeDualThemeInput,
  type EpisodeElementKind,
  type GutterRampPatch,
  type NormalizedElementBox,
  type RemediationStrategyKind,
  type RemediationVerificationSummary,
  type ThemeReadinessSummary,
} from "./dual-theme-types";
