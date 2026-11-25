/**
 * Wave 40F — 절차적 2.5D 온보딩 디오라마 · 60초 첫 컷 체험 · 창작자 맞춤 스타터 매처 배럴 모듈.
 */

export {
  CREATOR_DEVICE_OPTIONS,
  CREATOR_GENRE_OPTIONS,
  CREATOR_GOAL_OPTIONS,
  CREATOR_MEDIUM_OPTIONS,
  DEFAULT_CREATOR_MATCHER_ANSWERS,
  DEFAULT_DIORAMA_DEPTH_PROFILE,
  FIRST_CUT_SPRINT_STEPS,
  ONBOARDING_DIORAMA_CHAPTERS,
  collectAllOnboardingAtelierAssetPaths,
  computeDioramaParallax,
  createInitialDioramaState,
  createInitialFirstCutSprint,
  getDioramaChapterById,
  matchCreatorStarterPrescription,
  normalizePointerInRect,
  recordFirstCutAction,
  summarizeFirstCutSprint,
  transitionDioramaChapter,
} from "./onboarding-diorama-engine";

export type {
  CreatorDeviceChoice,
  CreatorGenreChoice,
  CreatorGoalChoice,
  CreatorMatcherAnswers,
  CreatorMediumChoice,
  CreatorStarterPrescription,
  DioramaChapterId,
  DioramaChapterSpec,
  DioramaDepthLayer,
  DioramaDepthProfile,
  DioramaHotspotSpec,
  DioramaLayerOffset,
  DioramaParallaxInput,
  DioramaParallaxSolution,
  DioramaPointerRect,
  DioramaState,
  DioramaTransitionAction,
  FirstCutCanvasPreset,
  FirstCutSprintAction,
  FirstCutSprintState,
  FirstCutSprintStepSpec,
  FirstCutSprintSummary,
  MatchedBackgroundSpec,
  MatchedBrushSpec,
  MatchedPaperSpec,
  MatchedSpaceSpec,
  MatchedWorkspaceRoute,
  MatcherOptionSpec,
} from "./onboarding-diorama-engine";

export {
  StudioOnboardingDioramaPanel,
  type StudioOnboardingDioramaPanelProps,
} from "./StudioOnboardingDioramaPanel";
