/**
 * Wave 110 — 다국어 웹툰 번역 텍스트 팽창 예산·말풍선 피팅 & 용어집/말투 감사 브리지 배럴 익스포트.
 */

export {
  ALL_LOCALIZATION_LOCALES,
  LOCALIZATION_LOCALE_PROFILES,
  MATRIX_DISPLAY_LOCALE_ORDER,
  auditAndFitLocalizedDialogueBalloons,
  estimateCrossLocaleExpansionBudget,
  estimateGlyphAdvanceEm,
} from "./localization-balloon-fit-solver";

export type {
  BalloonFitAuditOptions,
  BalloonFitAuditResult,
  BalloonInteriorShape,
  BalloonRemediationTier,
  CrossLocaleExpansionBudgetReport,
  ExpansionBudgetOptions,
  LocaleBalloonFitSummary,
  LocaleExpansionBudgetEntry,
  LocaleShortCode,
  LocaleTypographyProfile,
  LocalizationBalloonFitReport,
  LocalizationTargetLocale,
  LocalizedDialogueBalloonEntry,
  ScriptFamily,
} from "./localization-balloon-fit-solver";

export {
  auditLocalizationGlossaryAndRegister,
  canonicalizeLocalizationJson,
  detectStrayHangulSnippets,
  sha256LocalizationHex,
} from "./glossary-register-and-leak-auditor";

export type {
  CutLocaleAuditStatus,
  EpisodeLocalizationPayload,
  EpisodeLocalizedDialogueLine,
  GlossaryRegisterLeakAuditReport,
  LocaleGlossaryAuditSummary,
  LocalizationAuditFinding,
  LocalizationAuditFindingCode,
  LocalizationAuditSeverity,
  RegisterPolitenessLevel,
  SeriesGlossarySpec,
  SeriesGlossaryTerm,
  SpeakerListenerRegisterRule,
  SpeakerRegisterMatrix,
} from "./glossary-register-and-leak-auditor";

export {
  escapeLocalizationSvgXml,
  renderLocalizationFitMatrixSvg,
  summarizeLocalizationBridgeAuditKo,
} from "./localization-bridge-svg-and-audit";

export type {
  LocalizationAuditSummaryOptions,
  LocalizationFitMatrixSvgOptions,
  LocalizationMatrixCellCode,
} from "./localization-bridge-svg-and-audit";
