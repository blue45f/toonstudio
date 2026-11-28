/**
 * Wave 87: 인과 의존성 그래프 기반 시간 역행(Time-Travel) 비파괴 캔버스 엔진 공개 배럴
 */

export {
  CausalGraphCycleError,
  CausalNodeNotFoundError,
  CausalStrokeDependencyGraph,
  bindPointToParentBones,
  computeCausalContentHash,
  computeGraphStateHash,
  extractNodeGeometryPoints,
  hashCausalNode,
  projectPointToBoneLocal,
  reconstructPointFromBoneLocal,
  sealUpdatedCausalNode,
  updateSpeechBalloonTailForBone,
} from "./causal-stroke-dependency-graph";
export type {
  BoneLocalAnchor,
  CausalCanvasNode,
  CausalNodeInput,
  CausalNodeKind,
  CausalNodeWithoutHash,
  CausalReprojectionHandler,
  CelFillRegionNode,
  CelFillRegionPayload,
  CubicHandlePair,
  FluidWashEffectNode,
  FluidWashEffectPayload,
  HistoricalEditContext,
  HistoricalEditRequest,
  HistoricalEditResult,
  InkLineartStrokeNode,
  InkLineartStrokePayload,
  Point2D,
  RoughSkeletonBoneNode,
  RoughSkeletonBonePayload,
  ShadowHighlightPassNode,
  ShadowHighlightPassPayload,
  SpeechBalloonTailNode,
  SpeechBalloonTailPayload,
  TimeTravelRevision,
} from "./causal-stroke-dependency-graph";

export {
  reprojectCausalSubgraph,
  reprojectDownstreamFromHistoricalEdit,
  rotateAndTranslatePoint2D,
  sampleBoneCageControls,
  solveMlsRigidWarpPoint,
  solveMlsRigidWarpPoints,
  transformRoughSkeletonBone,
} from "./mls-rigid-warp-reprojection-solver";
export type {
  ControlPointCorrespondence,
  HistoricalReprojectionOutput,
  HistoricalReprojectionRequest,
  MlsWarpMode,
  MlsWarpOptions,
  NodeReprojectionAudit,
  ReprojectionFidelityReport,
} from "./mls-rigid-warp-reprojection-solver";

export {
  renderTimeTravelDiffSvg,
  summarizeCausalImpactReportKo,
} from "./time-travel-diff-and-svg-visualizer";
export type {
  CausalImpactSummaryKo,
  DistortionGradeKo,
  TimeTravelDiffLayout,
  TimeTravelDiffSvgOptions,
} from "./time-travel-diff-and-svg-visualizer";
