/**
 * Wave 81 공개 배럴 진입점 (`wasm64-wave81-sketch-to-parametric-scene-lift`).
 *
 * - `perspective-vanishing-point-lifter`: 2D 러프 투시 스케치 소실점(1·2·3점) RANSAC+IRLS 보정,
 *   직교 제약 초점거리 복원 및 미터 단위 바닥 접지 3D 파라메트릭 씬 리프터
 * - `multicam-ink-dna-reprojector`: 임의 카메라 회전·돌리 재투영, 해석적 HLR 은선 제거,
 *   월드 소품 무드리프트 불변식 및 작가 Ink DNA 필압·굵기 계층 적응기
 * - `parametric-scene-svg-and-gltf-exporter`: 4레이어 비파괴 만화 선화 SVG 익스포터 및
 *   미터 규격 수밀 매니폴드 glTF 호환 메쉬 매니페스트 생성기
 */

export {
  buildCameraBasis,
  liftRoughSketchToParametricScene3d,
  projectDirectionToVanishingPoint,
  projectWorldPointToScreen,
  solveCameraFromRoughPerspectiveStrokes,
  unprojectScreenPointToFloorPlane,
  type ArchitecturalPlane3d,
  type ArchitecturalPlaneRole,
  type CalibratedCameraState,
  type CameraBasis3d,
  type CameraCalibrationOptions,
  type CameraCalibrationResult,
  type FocalLengthSource,
  type ParametricBoxProp3d,
  type ParametricPropCategory,
  type ParametricScene3d,
  type PerspectiveAxisHint,
  type PerspectiveType,
  type RoughPerspectiveStroke2d,
  type SceneArchetype,
  type SketchStrokeSemanticRole,
  type SketchToSceneLiftInput,
  type VanishingPointSolveDiagnostics,
  type Vec2,
  type Vec3,
} from "./perspective-vanishing-point-lifter";

export {
  applyCameraRigDelta,
  computeBoxWorldGeometry,
  reprojectParametricSceneWithInkDna,
  resolveArtistInkDnaConfig,
  type ArtistInkDnaConfig,
  type CameraRigDelta,
  type HlrVisibilityStats,
  type InkEdgeRole,
  type OrientedBoxWorldGeometry,
  type PerspectiveConvergenceRay2d,
  type PerspectiveGuideOverlay,
  type ProjectedInkSegment2d,
  type ReprojectedSceneResult,
  type ReprojectionOptions,
  type ResolvedArtistInkDnaConfig,
  type WorldPropAnchorSnapshot,
} from "./multicam-ink-dna-reprojector";

export {
  exportParametricSceneMeshManifest,
  renderReprojectedSceneInkSvg,
  serializeParametricSceneMeshManifestJson,
  type GltfCompatibleMeshNode,
  type GltfMaterialSlotDescriptor,
  type ParametricSceneMeshManifest,
  type ParametricSceneMeshManifestAudit,
  type RenderedSceneInkSvg,
  type SceneInkSvgExportOptions,
} from "./parametric-scene-svg-and-gltf-exporter";
