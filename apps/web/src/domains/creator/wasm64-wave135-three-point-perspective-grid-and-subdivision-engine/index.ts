/**
 * Wasm64 Wave 135 공개 배럴 진입점 (`wasm64-wave135-three-point-perspective-grid-and-subdivision-engine`).
 *
 * - `perspective-camera-and-vp-solver`: 35mm 환산 3점 투시 핀홀 카메라 모델, 소실점(VP1·VP2·VP3)
 *   및 지평선 방정식, 수심=주점(Orthocenter) 기하 검증, 왜곡 위험 경보, 가이드 선분 기반
 *   결정론적 RANSAC/MSAC + IRLS 소실점 역추정 솔버
 * - `projective-subdivision-and-snap`: Hartley 정규화 DLT 3×3 Homography, 교차비(Cross-Ratio)
 *   불변량 및 X-대각선 기반 건축 창문·기둥·타일 원근 등분할, 3D 원근 계단(트레드+라이저) 생성,
 *   실시간 투시 자 브러시 스냅 보정기
 * - `perspective-grid-wgsl`: 128바이트(16바이트 정렬) 유니폼 패킹 및 `fwidth` 안티앨리어싱
 *   WebGPU WGSL 생성·검증기
 * - `perspective-blueprint-svg-and-report`: 순수 `oklch(...)` 투시 블루프린트 SVG 렌더러,
 *   한국어 배경 연출 QA 브리프 및 순수 ES2017 동기 FIPS 180-4 SHA-256 지문 생성기
 */

export {
  buildLineThroughHomogeneousPoints,
  clampFinitePerspective,
  computeSegmentToVpAngleErrorDeg,
  estimateVanishingPointsFromGuides,
  projectWorldPointToCanvas,
  solveThreePointPerspectiveRig,
  verifyOrthocenterPrincipalPoint,
  type EstimateVanishingPointsOptions,
  type EstimatedVanishingPointCluster,
  type GuideSegment2D,
  type HomogeneousVec3,
  type LineEquation2D,
  type Matrix3x3,
  type OrthocenterPrincipalPointCheck,
  type PerspectiveAxisId,
  type PerspectiveDistortionAlert,
  type PerspectiveDistortionSeverity,
  type PerspectiveMode,
  type ThreePointPerspectiveRig,
  type ThreePointPerspectiveRigInput,
  type VanishingPoint2D,
  type VanishingPointEstimationResult,
  type Vec2D,
  type Vec3D,
} from "./perspective-camera-and-vp-solver";

export {
  applyHomography,
  buildPerspectiveStaircase,
  computeCollinearCrossRatio2D,
  computeCrossRatio1D,
  computeHomographyNormalizedDlt,
  invertHomography3x3,
  isConvexNonDegenerateQuad,
  snapStrokeToPerspectiveRuler,
  subdividePerspectiveQuad,
  type BrushStrokePoint,
  type BuildPerspectiveStaircaseInput,
  type LineSegment2D,
  type PerspectiveQuad2D,
  type PerspectiveStairStep2D,
  type PerspectiveStaircaseResult,
  type ProjectiveSubdivisionVerification,
  type SnapStrokeToPerspectiveRulerOptions,
  type SnappedPerspectiveStrokeResult,
  type StaircaseDirectionAxis,
  type SubdividePerspectiveQuadOptions,
  type SubdividedPerspectiveCell,
  type SubdividedPerspectiveQuadResult,
} from "./projective-subdivision-and-snap";

export {
  PERSPECTIVE_GRID_UNIFORM_ALIGNMENT,
  PERSPECTIVE_GRID_UNIFORM_BYTE_SIZE,
  PERSPECTIVE_GRID_UNIFORM_LAYOUT,
  buildPerspectiveGridWgsl,
  packPerspectiveGridUniforms,
  validatePerspectiveGridWgsl,
  type BuildPerspectiveGridWgslOptions,
  type PerspectiveGridUniformFieldLayout,
  type PerspectiveGridWgslArtifact,
  type PerspectiveGridWgslValidationResult,
} from "./perspective-grid-wgsl";

export {
  canonicalizePerspectiveJson,
  computePerspectiveRigFingerprint,
  escapePerspectiveXml,
  renderThreePointPerspectiveSvg,
  sha256PerspectiveHex,
  summarizeThreePointPerspectiveKo,
  type PerspectiveRigFingerprint,
  type RenderThreePointPerspectiveSvgInput,
  type SummarizeThreePointPerspectiveKoInput,
} from "./perspective-blueprint-svg-and-report";
