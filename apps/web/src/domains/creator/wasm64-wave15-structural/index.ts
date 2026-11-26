/**
 * Wasm64 Wave 15 구조적 작화·음영·대기·무손실 점진 코덱 공개 진입점.
 *
 * - `planar-map-diffusion-curves`: 반간선 평면 분할(DCEL) 빈틈 제로 채색 커널 및
 *   라플라스 확산 곡선(∇²u = 0) 무한 해상도 음영 솔버
 * - `kajiya-hair-aerial-progressive-codec`: Kajiya-Kay / Marschner 이방성 머리카락 엔젤링 하이라이트 생성기,
 *   Rayleigh-Mie 물리 대기 산란 공기원근법 깊이 합성기, 가역 정수 Haar + LOCO-I(MED) 점진적 무손실 컷 코덱
 *
 * 주의: Studio 초기 진입 그래프에서 정적으로 import하지 않고 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  assignPlanarFaceColor,
  buildPlanarArrangement,
  computeSignedShoelaceArea,
  evaluateCubicBezier2D,
  isPointInBoundedFace,
  isPointInRingHalfOpen,
  projectPointToSegment2D,
  rasterizePlanarArrangement,
  solveDiffusionCurves,
  type BuildPlanarArrangementOptions,
  type DiffusionColorStop,
  type DiffusionCurveSpec,
  type DiffusionSegmentGeometry,
  type DiffusionSolveOptions,
  type DiffusionSolveResult,
  type PlanarArrangement,
  type PlanarBoundedFace,
  type PlanarHalfEdge,
  type PlanarOuterCycle,
  type PlanarRasterizeOptions,
  type PlanarRasterizeReport,
  type PlanarStrokeInput,
  type PlanarVertex,
  type Point2D,
  type RgbaColor,
} from "./planar-map-diffusion-curves";

export {
  applyAerialPerspectiveDepthBuffer,
  composeAerialPerspectiveLayers,
  computeCutFnv1a32,
  computeRayleighCoefficients,
  computeRayleighMieAtmosphereSample,
  decodeProgressiveCutLossless,
  decodeProgressiveCutPreview,
  encodeProgressiveCutLossless,
  forwardHaar2DInt,
  generateKajiyaMarschnerHairHighlight,
  inverseHaar2DInt,
  predictLocoIMed,
  RAYLEIGH_WAVELENGTHS_NM,
  type AerialAtmosphereOptions,
  type AerialDepthBufferReport,
  type AerialLayerComposeReport,
  type AerialPerspectiveLayerInput,
  type AerialScatteringSample,
  type HairShadingStyle,
  type IntegerHaar2DSubbands,
  type KajiyaHairHighlightInput,
  type KajiyaHairHighlightResult,
  type ProgressiveCutDecodeResult,
  type ProgressiveCutEncodedPacket,
  type ProgressiveCutEncodeOptions,
  type Vec3,
} from "./kajiya-hair-aerial-progressive-codec";
