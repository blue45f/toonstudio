/**
 * 3D 실루엣·크리즈 → 크리에이터 개인 G펜 벡터 잉크 투영 모듈 공개 진입점.
 */

export type {
  ChainPolylinesOptions,
  CreatorGpenProfile,
  CubicBezierSegment,
  ExportVectorInkSvgOptions,
  ExtractedInkEdgeResult,
  ExtractInkEdgesOptions,
  FitBezierInkOptions,
  FittedBezierInkStroke,
  GpenStyleId,
  IndexedTriangleMesh,
  InkEdgeKind,
  InkPolyline,
  InkPolylinePoint,
  MeshBounds,
  MeshEdgeRecord,
  MeshManifoldStats,
  MeshPresetId,
  ProjectedInkEdge,
  ProjectionCameraConfig,
  TriangleIndices,
  Vec2,
  Vec3,
  VectorInkLayerPayload,
  VectorInkLayerStrokePayload,
  VectorInkProjectionResult,
  VectorInkProjectionStats,
  VectorInkSvgExport,
} from "./types";

export {
  buildIndexedTriangleMesh,
  createArchitecturalArchMesh,
  createHeroBustMesh,
  createKatanaPropMesh,
  createMeshPreset,
  MESH_PRESET_IDS,
} from "./mesh-presets";

export {
  chainInkEdgesToPolylines,
  createKeyLightDirection,
  DEFAULT_KEY_LIGHT_DIRECTION,
  evaluateGpenStrokeWidth,
  exportVectorInkSvg,
  extract3dInkEdges,
  fitCubicBezierInkStrokes,
  getGpenStyleProfile,
  GPEN_STYLE_IDS,
  GPEN_STYLE_PRESETS,
  projectMeshToVectorInk,
  simplifyPolylineRdp,
  type ProjectMeshToVectorInkInput,
} from "./vector-ink-projection-engine";

export {
  StudioVectorInkProjectionPanel,
  type StudioVectorInkProjectionPanelProps,
} from "./StudioVectorInkProjectionPanel";
