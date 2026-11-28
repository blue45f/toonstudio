/**
 * Wasm64 Wave 82 공개 배럴 진입점 (`wasm64-wave82-audio-driven-pacing-director`).
 *
 * - `waveform-energy-and-beat-analyzer`: 순수 TypeScript 모노 PCM·합성 파형 3대역 에너지 분리,
 *   스펙트럼 플럭스 온셋·BPM 추정, 직전 무음 숨고르기(`silenceHolds`)·클라이맥스(`climaxMoments`) 분석기
 * - `scroll-whitespace-and-speedline-choreographer`: 오디오 역동성 기반 세로 스크롤 여백 확장,
 *   클라이맥스 풀블리드·고속 액션 스태카토 컷 비율, 얼굴·말풍선 보호 방사형 집중선 및
 *   `prefersReducedMotion` 전정 보호 카메라 쉐이크 자동 연출기
 * - `pacing-timeline-and-speedline-svg-exporter`: 비파괴 방사형 집중선 SVG 레이어 내보내기 및
 *   엄격 단조 증가 `scrollY <-> audioTimeMs` 오디오-스크롤 동기화 매니페스트 빌더
 */

export {
  analyzeAudioTrackForComicPacing,
  synthesizeTestAudioWaveform,
  type AudioEnvelopeFrame,
  type AudioPacingAnalysis,
  type AudioTrackAnalysisInput,
  type BeatOnsetEvent,
  type ClimaxMoment,
  type ClimaxMomentKind,
  type SilenceHoldSegment,
  type SyntheticAudioPreset,
  type SyntheticAudioWaveformSpec,
  type SynthesizedAudioWaveform,
  type ThreeBandEnergySnapshot,
} from "./waveform-energy-and-beat-analyzer";

export {
  DEFAULT_MAX_WHITESPACE_PX,
  DEFAULT_MIN_WHITESPACE_PX,
  DEFAULT_READER_SCROLL_SPEED_PX_PER_SEC,
  DEFAULT_VIEWPORT_WIDTH_PX,
  choreographWebtoonPacingFromAudio,
  countSpeedlinesIntrudingClearZone,
  sampleDampedCameraShakeOffset,
  synthesizeRadialSpeedlinesForCut,
  type CameraShakeCue,
  type ChoreographedWebtoonCut,
  type CutAudioWindowSummary,
  type FocalClearEllipsePx,
  type RadialSpeedlineVector,
  type ReducedMotionSubstituteStyle,
  type SampledCameraShakeOffset,
  type SpeedlineLayerPlan,
  type SpeedlineVisualStyle,
  type WebtoonCutRoleHint,
  type WebtoonFocalZone,
  type WebtoonPacingChoreographyInput,
  type WebtoonPacingChoreographyResult,
  type WebtoonPacingCutInput,
  type WebtoonPacingMode,
  type WebtoonPanelLayoutStyle,
} from "./scroll-whitespace-and-speedline-choreographer";

export {
  buildAudioScrollSyncManifest,
  mapAudioTimeMsToScrollY,
  mapScrollYToAudioTimeMs,
  renderAudioDrivenSpeedlinesSvg,
  validateAudioScrollSyncManifest,
  type AudioScrollEffectCue,
  type AudioScrollKeyframePhase,
  type AudioScrollSyncKeyframe,
  type AudioScrollSyncManifest,
  type AudioScrollSyncValidationReport,
  type RenderSpeedlinesSvgOptions,
  type SpeedlineSvgExportResult,
} from "./pacing-timeline-and-speedline-svg-exporter";
