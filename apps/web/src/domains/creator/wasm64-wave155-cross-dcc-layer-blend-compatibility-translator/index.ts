/**
 * Wasm64 Wave 155 공개 배럴 진입점 (`wasm64-wave155-cross-dcc-layer-blend-compatibility-translator`).
 *
 * - `dcc-blend-math-and-matrix`: 5종 DCC 포맷 능력 매트릭스, 18종 정본 블렌드모드 픽셀 합성 수학 커널,
 *   W3C 알파 결합 및 64-색상 표준 RGB 프로브 격자 기반 Björn Ottosson OKLab ΔE 색차 측정기
 * - `cross-dcc-layer-translator`: 레이어 트리 크로스-DCC 호환성 감사기, 최적 대체 블렌드 근사 솔버 및
 *   순수 ES2017 동기 FIPS 180-4 SHA-256 매니페스트 지문 산출기
 * - `dcc-compat-svg-and-report`: 순수 OKLCH 호환성 매트릭스·리스크 SVG 렌더러 및 한국어 파이프라인 TD 검수 브리프
 */

export {
  BLEND_MODE_LABEL_KO,
  CANONICAL_BLEND_MODES,
  clampFiniteRange,
  clampUnit,
  compositeLayerPixelSrgb,
  computeSrgbOklabDeltaE,
  DCC_CAPABILITY_MATRIX,
  DCC_FORMAT_IDS,
  DCC_LAYER_KINDS,
  evaluateBlendModeOklabFidelity,
  evaluateBlendModeRgb,
  formatOklchCss,
  getDccCapabilityProfile,
  isBlendModeSupportedInDcc,
  LAYER_KIND_LABEL_KO,
  PIXEL_BLEND_MODES,
  roundFixed,
  srgbChannelToLinear,
  srgbToOklab,
  srgbToOklch,
  STANDARD_64_RGB_PROBE_GRID,
  type BlendModeOklabFidelityOptions,
  type BlendModeOklabFidelityResult,
  type BlendModeWorstCaseSample,
  type CanonicalBlendMode,
  type CompositedRgbaPixel,
  type DccBitDepth,
  type DccCapabilityProfile,
  type DccFormatId,
  type DccLayerKind,
  type OklabColor,
  type OklchColor,
  type RgbTuple,
} from "./dcc-blend-math-and-matrix";

export {
  ALL_DCC_LOSS_RISK_CODES,
  findClosestSupportedBlendMode,
  sha256CrossDccHex,
  translateDccLayerTree,
  type BlendModeApproximationCandidate,
  type ClosestBlendModeResult,
  type DccAuditGrade,
  type DccLayerNode,
  type DccLayerRiskItem,
  type DccLayerTranslationAuditResult,
  type DccLossRiskCode,
  type DccRiskSeverity,
  type LayerBlendMappingStatus,
  type TranslateDccLayerTreeInput,
  type TranslatedLayerAuditItem,
} from "./cross-dcc-layer-translator";

export {
  escapeDccAuditXml,
  renderDccCompatibilityAuditSvg,
  summarizeDccTranslationAuditKo,
  type DccCompatibilitySvgOptions,
  type DccTranslationAuditReportKo,
} from "./dcc-compat-svg-and-report";
