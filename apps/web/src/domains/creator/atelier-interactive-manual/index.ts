/**
 * Wave 65A — AtelierGuide 서비스 내장 완전판 인터랙티브 매뉴얼 · 5단계 로드맵 · 숨은 기능 전수 가이드 공개 배럴.
 */

export {
  ATELIER_MANUAL_BRAND_NAME,
  ATELIER_MANUAL_SCHEMA_VERSION,
  ATELIER_MANUAL_UPDATED_AT,
  EVERYDAY_QUICK_SEARCH_CHIPS,
  LEARNING_LEVEL_ROADMAP,
  MANUAL_WORK_CONTEXT_SPECS,
  STUDIO_COMPLETE_FEATURE_GUIDES,
  STUDIO_JOURNEY_SUBWAY_STATIONS,
  computeMasteryProgress,
  exportInteractiveManualJson,
  formatOklch,
  getGuidesForStation,
  getManualGuideById,
  getRelatedHiddenGuides,
  isVioletSlopHue,
  recommendNextGuideForContext,
  sanitizeNonVioletHue,
  searchManualGuides,
} from "./atelier-manual-engine";

export type {
  ContextCoachInput,
  FeatureUsageFrequency,
  InteractiveManualExportBundle,
  InteractiveManualExportOptions,
  InteractiveManualExportPayload,
  LearningLevel,
  LearningLevelSpec,
  ManualContextRecommendation,
  ManualFeatureCategory,
  ManualFollowStep,
  ManualLevelProgress,
  ManualMasteryBadge,
  ManualMasteryProgress,
  ManualMasteryRank,
  ManualSearchFilters,
  ManualSearchHit,
  ManualSearchMatchKind,
  ManualWorkContext,
  ManualWorkContextSpec,
  OklchColor,
  StudioFeatureGuide,
  StudioJourneyStationId,
  StudioJourneyStationSpec,
} from "./atelier-manual-engine";

export { StudioAtelierManualOsPanel } from "./StudioAtelierManualOsPanel";
export type { StudioAtelierManualOsPanelProps } from "./StudioAtelierManualOsPanel";
