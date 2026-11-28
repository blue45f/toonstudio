/**
 * Wave 142 — 웹툰 OLED 다크모드 vs 라이트모드 독자 뷰어 시인성 대비(APCA/WCAG) ·
 * 눈부심(Luminance Shock) & 투명 여백 자동 보정 감사기 공개 배럴.
 */

export {
  ALL_VIEWER_THEME_IDS,
  VIEWER_THEME_PROFILES,
  compositeSrgbOverBackground,
  computeApcaContrastLc,
  computeOklabDeltaE,
  computeWcagContrastRatio,
  computeWcagRelativeLuminance,
  evaluateColorPairContrast,
  formatOklchCss,
  getViewerThemeProfile,
  linearToSrgbChannel,
  normalizeSrgbColor,
  normalizeSrgbaColor,
  oklchToSrgb,
  srgbChannelToLinear,
  srgbToOklab,
  srgbToOklch,
  srgbToOklchCss,
  type AlphaBlendSpace,
  type ContrastPolarity,
  type OklabColor,
  type OklchColor,
  type SrgbColor,
  type SrgbaColor,
  type ThemeContrastMeasurement,
  type ViewerThemeId,
  type ViewerThemeProfile,
} from "./viewer-contrast-and-apca-math";

export {
  DEFAULT_DUAL_THEME_AUDIT_CONFIG,
  auditEpisodeDualThemeReadability,
  evaluateElementOnViewerTheme,
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
} from "./dual-theme-visibility-auditor";

export { synthesizeThemeSafeRemediation } from "./dual-theme-remediation-solver";

export {
  buildDualThemePreviewWgsl,
  validateDualThemePreviewWgsl,
  type DualThemePreviewMode,
  type DualThemePreviewWgslArtifact,
  type DualThemeWgslBindingDescriptor,
  type DualThemeWgslValidationReport,
} from "./dual-theme-preview-wgsl";

export {
  escapeDualThemeXml,
  renderDualThemeAuditSvg,
  summarizeDualThemeAuditKo,
  type DualThemeAuditSvgOptions,
  type DualThemeQaReportKo,
} from "./dual-theme-svg-and-report";

export {
  canonicalizeDualThemeJson,
  computeDualThemeManifestSha256Hex,
  encodeDualThemeUtf8Bytes,
  sha256DualThemeBytesHex,
  sha256DualThemeUtf8Hex,
} from "./dual-theme-sha256";
