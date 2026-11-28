/**
 * Wasm64 Wave 114 공개 배럴 진입점 (`wasm64-wave114-sfx-procedural-foley-and-haptic-bridge`).
 *
 * - `korean-sfx-procedural-foley-dsp`: 한국어 웹툰 효과음 6종 정규 폴리 아키타입 분류기,
 *   결정론적 프로시저럴 모노 PCM 합성기, DC 오프셋 제거·`-1.0 dBFS` 피크 안전 리미터 및 실측 음향 기술자
 * - `spatial-sfx-mixer-and-haptic-bridge`: 정전력(`cos`/`sin`) 스테레오 패닝 믹서,
 *   다중 큐 중첩 스테레오 링크 트루피크 리미터, 무음·청각장애 독자 한국어 자막·햅틱(`<= 120ms`)
 *   접근성 브리지 및 무압축 WAV 대비 바이트 절감 계산기
 * - `sfx-foley-timeline-svg-and-audit`: 인쇄 안전 OKLCH 폴리 타임라인 SVG 렌더러,
 *   출고 감사 리포트 및 사운드 디렉터 한국어 QA 브리프
 */

export {
  PEAK_SAFETY_CEILING_DBFS,
  PEAK_SAFETY_CEILING_LINEAR,
  SFX_FOLEY_ARCHETYPES,
  analyzePcmAcousticDescriptors,
  classifyKoreanComicSfxText,
  getArchetypeCaptionCategoryKo,
  linearToDbfs,
  normalizeDeterministicSeed,
  synthesizeKoreanSfxFoleyPcm,
  type KoreanSfxClassification,
  type KoreanSfxFoleyRequest,
  type SfxAcousticDescriptors,
  type SfxFoleyArchetype,
  type SfxSampleRateHz,
  type SynthesizedKoreanSfxFoley,
} from "./korean-sfx-procedural-foley-dsp";

export {
  MAX_HAPTIC_BURST_MS,
  compileEpisodeSfxMixAndAccessibilityBridge,
  computeConstantPowerStereoPan,
  type CompiledEpisodeSfxCue,
  type ConstantPowerStereoPan,
  type EpisodeSfxCueInput,
  type EpisodeSfxMixOptions,
  type EpisodeSfxMixReport,
  type HapticPulseEvent,
  type ProceduralByteBudgetComparison,
  type SfxIntensityTierKo,
  type SilentReaderAccessibilityBridge,
  type SilentReaderCaptionEvent,
  type StereoMasterMetrics,
  type StereoPanZone,
} from "./spatial-sfx-mixer-and-haptic-bridge";

export {
  auditSfxFoleyBridge,
  renderSfxFoleyTimelineSvg,
  summarizeSfxFoleyBridgeKo,
  type RenderSfxFoleyTimelineSvgOptions,
  type SfxFoleyBridgeAuditReport,
} from "./sfx-foley-timeline-svg-and-audit";
