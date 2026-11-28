/**
 * Wasm64 Wave 119 공개 배럴 진입점 (`wasm64-wave119-gap-closing-flat-fill-and-underbleed-solver`).
 *
 * - `gap-closing-flood-fill-solver`: 웹툰 선화 틈새 자동 밀봉(2~6px 정밀 브리징 · 넓은 통로 비오차단)
 *   및 4-연결/8-연결 버킷 채색, Naive 대비 경계 누출 0건 실측 비교기
 * - `underbleed-trapping-and-wgsl`: 다중 구역 최단 유클리드 보로노이 안티-할로 언더블리드 트래핑
 *   (잔여 흰 할로 0px · 이웃 교차 침범 0px 동시 달성) 및 16바이트 정렬 WebGPU WGSL 셰이더/검증기
 * - `flat-fill-audit-svg-and-report`: 인쇄 안전 순수 `oklch(...)` 3패널 비교 검수 SVG 렌더러 및
 *   번역투 없는 한국어 웹툰 채색 QA 리포트 생성기
 */

export {
  DEFAULT_GAP_WIDTH_PX,
  DEFAULT_INK_THRESHOLD,
  MAX_SUPPORTED_GAP_WIDTH_PX,
  clampUnit,
  closeLineartGapsDeterministically,
  compareNaiveVsGapClosedFloodFill,
  runGapClosingFloodFill,
  validateLineartField,
  type CompareNaiveVsGapClosedOptions,
  type DetectedGapSegment,
  type FloodFillConnectivity,
  type GapClosingBarrierResult,
  type GapClosingFailureCode,
  type GapClosingFloodFillOptions,
  type GapClosingFloodFillResult,
  type GapClosingOptions,
  type LineartAlphaField,
  type NaiveVsGapClosedComparison,
  type PixelBoundingBox,
} from "./gap-closing-flood-fill-solver";

export {
  DEFAULT_HALO_MIN_ALPHA,
  DEFAULT_INK_SOLID_THRESHOLD,
  DEFAULT_UNDERBLEED_RADIUS_PX,
  buildGapClosingFlatFillWgsl,
  packGapClosingFlatFillUniforms,
  synthesizeAntiHaloUnderbleedFlats,
  validateGapClosingFlatFillWgsl,
  type AntiHaloUnderbleedOptions,
  type AntiHaloUnderbleedReport,
  type GapClosingFlatFillWgslBundle,
  type GapClosingUniformPackInput,
  type GapClosingWgslOptions,
  type GapClosingWgslValidationReport,
  type OklchColor,
  type UnderbleedRegionSeed,
  type UnderbleedRegionSummary,
} from "./underbleed-trapping-and-wgsl";

export {
  renderGapClosingFlatFillAuditSvg,
  summarizeGapClosingFlatFillKo,
  type FlatFillQaCheckItem,
  type GapClosingAuditSvgOptions,
  type GapClosingAuditSvgResult,
  type GapClosingFlatFillKoReport,
} from "./flat-fill-audit-svg-and-report";
