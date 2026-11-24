/**
 * 툰스튜디오·드로잉 전체 기능 아틀라스 · 8대 차별화 기술·주변기기 쇼케이스 · 역할별 10분 실습 매뉴얼 공개 배럴.
 */

export {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  STUDIO_FEATURE_AXES,
  STUDIO_SHORTCUT_CHEATSHEET,
  getAllStudioFeatures,
  getAtlasCatalogSummary,
  getDifferentiatorById,
  getFeatureAxisById,
  type AtlasCatalogSummary,
  type AtlasRoutePath,
  type DifferentiatorShowcaseCard,
  type FeatureAxisId,
  type ShortcutCategoryId,
  type StudioFeatureAxis,
  type StudioFeatureItem,
  type StudioShortcutEntry,
} from "./studio-feature-catalog";

export {
  CONTEXTUAL_TROUBLESHOOTING_FAQS,
  CREATOR_ROLE_MANUALS,
  ManualProgressTracker,
  computeOverallManualProgress,
  computeRoleManualProgress,
  extractHangulChoseong,
  getRoleManualById,
  getTroubleshootingFaqsForContext,
  searchAtlasAndShortcuts,
  type ContextualTroubleshootingFaq,
  type CreatorRoleId,
  type CreatorRoleManual,
  type ManualPracticeStep,
  type OverallManualProgress,
  type RoleManualProgress,
  type UnifiedAtlasSearchResult,
} from "./interactive-manual-engine";

export {
  StudioFeatureAtlasPanel,
  type AtlasSectionTab,
  type StudioFeatureAtlasPanelProps,
} from "./StudioFeatureAtlasPanel";
