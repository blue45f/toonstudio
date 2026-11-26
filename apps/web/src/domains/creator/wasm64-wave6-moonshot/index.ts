/**
 * Wasm64 Wave 6 문샷(Moonshot) 5대 창작·연재 코어 엔진 공개 진입점.
 *
 * - `sdf-balloon-cut-sculptor`: 해석적 2D SDF 말풍선 `smin` 불리언 조각기·사선 컷 프레임 및
 *   2ms 이내 Marching Squares 내·외곽 등치선 추출기
 * - `spring-scroll-cinema-rig`: 임계 감쇠(ζ = 1) 스프링-댐퍼 스크롤 시네마 카메라 리그 및
 *   `prefersReducedMotion` 대응 4평면 시차(parallax)·60/120Hz 결정론적 스텝퍼
 * - `fft-screentone-moire-detector`: 온디바이스 2D Radix-2 FFT 모바일 뷰포트(`375/390/768px`)
 *   스크린톤 모아레 조기 경보기 및 안전 선수도(LPI)·전통 망점 회전각(`15°/45°/75°`) 솔버
 * - `temporal-narrative-solver`: 회차 횡단 Allen/차분 시간 제약 Bellman-Ford 음수 사이클 모순
 *   탐지기 및 소품·부상·복장 상태머신 연속성 검증기
 * - `cdc-rabinkarp-delta-pack`: 서버 비용 `₩0` 콘텐츠 정의 청킹(Gear/Rabin-Karp 롤링 해시)
 *   회차 매니페스트·바이너리 델타 패치 및 SHA-256/FNV-1a 비트 완전 복원기
 *
 * 주의: 초기 진입 그래프 크기 증가가 `0B`로 유지되도록 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  contourLoopsToSmoothSvgPath,
  evaluateBalloonClusterSdf,
  evaluateCutFrameSdf,
  polynomialSmoothMax,
  polynomialSmoothMin,
  sculptBalloonClusterContours,
  sculptDiagonalCutFrameContours,
  sdEllipseExact,
  sdQuadraticBezierTail,
  sdRoundedRectExact,
  type BalloonClusterSculptInput,
  type BalloonClusterSculptResult,
  type BalloonPrimitive,
  type BezierTailShape,
  type BoundingBox2D,
  type ContourLoop,
  type CutFrameDefinition,
  type CutFrameSculptResult,
  type DiagonalGutterCut,
  type EllipseBalloonShape,
  type Point2D,
  type RoundedRectBalloonShape,
} from "./sdf-balloon-cut-sculptor";

export {
  DEFAULT_CINEMA_PARALLAX_PLANES,
  estimateTouchFlickVelocity,
  SpringScrollCinemaRig,
  stepCriticallyDampedSpringAnalytical,
  type AnalyticalSpringState,
  type CinemaCameraFrame,
  type ParallaxLayerTransform,
  type ParallaxPlaneId,
  type ParallaxPlaneSpec,
  type SpringScrollCinemaRigOptions,
  type TouchScrollSample,
} from "./spring-scroll-cinema-rig";

export {
  analyzeScreentoneMoireRisk,
  CLASSIC_SAFE_HALFTONE_ANGLES_DEG,
  compute2dRadix2PowerSpectrum,
  recommendMoireSafeScreentone,
  resampleTileToViewportPatch,
  synthesizeHalftoneTile,
  TARGET_MOBILE_VIEWPORT_WIDTHS_PX,
  type ClassicHalftoneAngleDeg,
  type FrequencyPeak2D,
  type MoireAnalysisInput,
  type MoireAnalysisReport,
  type MoireSeverity,
  type SafeToneCandidateScore,
  type SafeToneRecommendation,
  type ScreentoneTileBitmap,
  type Spectrum2DResult,
  type SynthesizeHalftoneTileInput,
  type ViewportMoireDiagnostic,
} from "./fft-screentone-moire-detector";

export {
  solveTemporalNarrativeTimeline,
  TIME_OF_DAY_WINDOWS_MINUTES,
  type AllenOrDifferenceKind,
  type CharacterStateViolation,
  type ConstraintCycleEdgeWitness,
  type ContinuityDomainCategory,
  type ContradictionCategory,
  type CostumeLifecycleState,
  type InjuryLifecycleState,
  type LocationTravelRule,
  type NarrativeSceneNode,
  type NarrativeTimelineInput,
  type NarrativeTimelineSolveReport,
  type PropLifecycleState,
  type SceneCharacterStateAssertion,
  type SceneTemporalConstraint,
  type SolvedSceneSchedule,
  type TemporalContradiction,
  type TimeOfDaySlot,
} from "./temporal-narrative-solver";

export {
  applyEpisodeDeltaPatch,
  buildEpisodeChunkManifest,
  CDC_DEFAULT_AVG_CHUNK_BYTES,
  CDC_DEFAULT_MAX_CHUNK_BYTES,
  CDC_DEFAULT_MIN_CHUNK_BYTES,
  computeFnv1a64Hex,
  computeSha256Bytes,
  computeSha256Hex,
  createEpisodeDeltaPatch,
  type CdcChunkerOptions,
  type EpisodeChunkDescriptor,
  type EpisodeChunkManifest,
  type EpisodeDeltaPatchResult,
  type ReconstructedEpisodeResult,
  type RollingHashAlgorithm,
} from "./cdc-rabinkarp-delta-pack";
