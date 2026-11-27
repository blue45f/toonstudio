/**
 * Wasm64 Wave 44 공개 진입점 (`wasm64-wave44-gap-closing-cel-lighting`).
 *
 * - `sdf-gap-closing-flood-fill`: 부호 거리장(`Meijster 2-Pass EDT`) 기반 `1px~16px` 선화 틈새 봉합 스마트 채색 및
 *   안티앨리어싱 흰 테두리 들뜸 제거(`Halo-Free Trapping`) 커널
 * - `silhouette-pseudo-normal-estimator`: 실루엣 내부 거리장과 스무스 베벨 구배 기반 2.5D 의사 법선 맵(`nx, ny, nz`) 생성기
 * - `directional-cel-shadow-rim-generator`: 웹툰 광원 프리셋(역광 드라마틱·정오 야외·창가 사선광·공포 하단광·노을 측면광) 결합
 *   계단형 셀 그림자 및 역광 림라이트 알파 마스크(`Uint8ClampedArray`) 생성기
 */

export {
  generateDirectionalCelShadowAndRim,
  resolveLightDirectionVector,
  WEBTOON_CEL_LIGHT_PRESETS,
  type CelShadowBandMode,
  type DirectionalCelShadowRimInput,
  type DirectionalCelShadowRimResult,
  type LightDirection3d,
  type WebtoonCelLightPreset,
  type WebtoonCelLightPresetId,
} from "./directional-cel-shadow-rim-generator";

export {
  computeLineartSignedDistanceField,
  computeMeijsterEdt2d,
  extractLineartInkStrength,
  floodFillWithSdfGapClosing,
  type LineartChannelMode,
  type SdfGapClosingFloodFillInput,
  type SdfGapClosingFloodFillResult,
  type SdfRgbaColor,
} from "./sdf-gap-closing-flood-fill";

export {
  estimateSilhouettePseudoNormals,
  samplePseudoNormalAt,
  type NormalYAxisConvention,
  type PseudoNormal3d,
  type PseudoNormalEstimatorInput,
  type PseudoNormalMapResult,
  type SilhouetteBevelProfile,
} from "./silhouette-pseudo-normal-estimator";
