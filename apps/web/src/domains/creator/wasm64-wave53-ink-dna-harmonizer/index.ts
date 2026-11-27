/**
 * Wasm64 Wave-53 공개 진입점 (`wasm64-wave53-ink-dna-harmonizer`).
 *
 * - `ink-dna-spectral-extractor`: `128×128` 손그림 RGBA 샘플 및 참조 벡터 스트로크에서
 *   선폭 분포·고주파 거칠기·필압 테이퍼 감마·잉크 농도 바닥값·미세 번짐 반경·2D FFT 종이 결 스펙트럼 추출
 * - `lineart-style-harmonizer`: 어시스턴트·3D 배경 추출선을 작가의 `InkDnaProfile`로
 *   자동 동화(호길이 세분화·유기적 선폭 변조·끝단 테이퍼·결정론적 미세 필치 흔들림·3D 과밀 정리)
 * - `seamless-paper-screentone-synthesizer`: 토러스 주기 래핑과 역격자 정수 파동으로
 *   상하·좌우 경계 불연속이 없는 무한 타일 브러시 텍스처 및 맞춤형 웹툰 스크린톤 합성
 */

export {
  DEFAULT_DNA_SAMPLE_SIZE,
  DEFAULT_INK_LUMINANCE_THRESHOLD,
  DEFAULT_MIN_SAMPLE_ALPHA,
  DEFAULT_PAPER_LUMINANCE_THRESHOLD,
  computeInkStyleDistance,
  computeStyleFeatureDistance,
  extractInkDnaProfile,
  measureVectorStrokeMetrics,
  type InkDnaExtractionOptions,
  type InkDnaProfile,
  type InkSampleRgbaBuffer,
  type InkStyleFeatureVector,
  type PaperGrainSpectrum,
  type ReferenceVectorStroke,
  type VectorStrokePoint,
} from "./ink-dna-spectral-extractor";

export {
  DEFAULT_CROWDING_ANGLE_RAD,
  DEFAULT_CROWDING_RADIUS_PX,
  DEFAULT_HARMONIZE_SEED,
  DEFAULT_MIN_3D_SEGMENT_LENGTH_PX,
  DEFAULT_RESAMPLE_STEP_PX,
  harmonizeLineartToInkDna,
  type HarmonizedVectorStroke,
  type LineartHarmonizeOptions,
  type LineartHarmonizeReport,
} from "./lineart-style-harmonizer";

export {
  DEFAULT_SYNTH_SEED,
  DEFAULT_TILE_SIZE,
  measureToroidalSeamMetrics,
  sampleToroidalValueNoise,
  synthesizeSeamlessBrushTexture,
  synthesizeSeamlessScreentone,
  type ScreentonePatternKind,
  type SeamlessBrushTexture,
  type SeamlessBrushTextureOptions,
  type SeamlessScreentoneOptions,
  type SeamlessScreentoneResult,
  type ToroidalSeamMetrics,
} from "./seamless-paper-screentone-synthesizer";
