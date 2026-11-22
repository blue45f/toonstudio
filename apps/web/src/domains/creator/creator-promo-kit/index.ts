/**
 * 창작자 홍보·연재 완충 킷 (9:16 숏폼·오디오 드라마 큐 시트 + 연재 마감 버퍼 플래너 + Before/After 시연 카드)
 */

export {
  estimateDialogueDurationMs,
  formatSrtTimestamp,
  formatVttTimestamp,
  inferLocalSfxPreset,
  LOCAL_WEBAUDIO_SFX_RECIPES,
  planShortsAudioCueSheet,
  scheduleWebAudioSfxStems,
  wrapSubtitleLines,
} from "./shorts-audio-cue-planner";
export type {
  CutEmotionTone,
  LocalSfxPresetId,
  MinimalAudioBufferLike,
  MinimalAudioNodeLike,
  MinimalAudioParamLike,
  MinimalBiquadFilterNodeLike,
  MinimalBufferSourceNodeLike,
  MinimalGainNodeLike,
  MinimalOscillatorNodeLike,
  MinimalWebAudioContextLike,
  ShortsAudioCuePlan,
  ShortsCuePlannerOptions,
  ShortsCutTimingSpan,
  ShortsReelPart,
  ShortsSubtitleCue,
  ShortsViewportSpec,
  WebAudioFilterKind,
  WebAudioOscillatorKind,
  WebAudioSfxStemEvent,
  WebAudioSynthRecipe,
  WebtoonCutDialogueLine,
  WebtoonCutSfxTrigger,
  WebtoonCutTimelineItem,
} from "./shorts-audio-cue-planner";

export {
  addDaysToIsoDate,
  planSerializationBuffer,
} from "./serialization-buffer-planner";
export type {
  AssistantBottleneckItem,
  AssistantPipelineTask,
  AssistantStageRole,
  BufferAlertLevel,
  RecentCutVelocitySample,
  SerializationBufferInput,
  SerializationBufferMetrics,
  SerializationBufferPlan,
  SerializationNoticeDraft,
  SerializationVelocityMetrics,
  StageWeeklyCutAllocation,
  WeeklyCutAllocationRecommendation,
} from "./serialization-buffer-planner";

export {
  buildBeforeAfterEmbedSnippets,
  clampComparisonPct,
  computePointerComparisonPct,
  DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS,
  escapeHtmlAttribute,
  sanitizeEmbedUrl,
  SHOWCASE_CATEGORY_LABEL_KO,
  stepComparisonPctForKey,
} from "./before-after-showcase-model";
export type {
  BeforeAfterEmbedOptions,
  BeforeAfterEmbedSnippets,
  BeforeAfterShowcaseAsset,
  EmbedSnippetKind,
  ShowcaseCategory,
} from "./before-after-showcase-model";

export { StudioBeforeAfterShowcaseCard } from "./StudioBeforeAfterShowcaseCard";
export type { StudioBeforeAfterShowcaseCardProps } from "./StudioBeforeAfterShowcaseCard";
