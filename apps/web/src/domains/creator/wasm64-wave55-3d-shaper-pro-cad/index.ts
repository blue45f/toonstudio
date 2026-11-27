/**
 * Wasm64 Wave 55 공개 진입점 (`wasm64-wave55-3d-shaper-pro-cad`).
 *
 * Shapr3D 급 이상 웹툰 특화 직관적 3D CAD·조형·만화 NPR 선화 추출 커널 모음:
 * - `cad-manifold-primitives`: glTF Y-Up 미터 단위 수밀 솔리드 표현, 공간 해시 정점 용접 및 외향 법선/UV 마무리
 * - `direct-sketch-pushpull-manifold-kernel`: 2D 스케치 Push/Pull 돌출, 축 회전(Revolve),
 *   다단 로프트(Loft), 면 오프셋 인셋 돌출 및 오일러-푸앵카레 수밀 무결성 감사기(`auditSolidManifoldIntegrity`)
 * - `parametric-fillet-chamfer-csg-kernel`: 자동 안전 클램핑 파라메트릭 챔퍼/원호 필렛 베벨(`applyParametricEdgeBevel`),
 *   T-접합 치유 기반 3D BSP CSG 불리언(`booleanSolidUnion | Subtract | Intersect`),
 *   비파괴 파라메트릭 히스토리 트리(`ParametricCadFeatureTree`)
 * - `comic-npr-crease-ink-projector`: 원근/직교 카메라 투영 기반 실루엣·하드 프레임·크리즈 분류 및
 *   해석적 레이-삼각형 은선 제거(HLR) 2D 웹툰 선화 추출기(`extractComicNprInkStrokes`)
 */

export {
  cleanZero,
  clampNumber,
  computeBounds,
  computeSignedVolumeAndArea,
  DEFAULT_WELD_EPSILON_M,
  DEGENERATE_AREA_THRESHOLD,
  GEOMETRY_EPSILON,
  triangleNormalAndArea,
  undirectedEdgeKey,
  vec3Add,
  vec3Cross,
  vec3Distance,
  vec3DistanceSq,
  vec3Dot,
  vec3Length,
  vec3LengthSq,
  vec3Lerp,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  weldAndFinalizeSolidMesh,
  type Aabb3,
  type CadEdgePair,
  type CadSolidMesh,
  type CadTriangle,
  type FinalizeSolidMeshInput,
  type Mat4,
  type SolidManifoldAuditReport,
  type Vec2,
  type Vec3,
} from "./cad-manifold-primitives";

export { auditSolidManifoldIntegrity } from "./cad-manifold-integrity-audit";

export {
  extrudeSketchPushPull,
  insetExtrudePlanarFace,
  loftCrossSectionsSolid,
  revolveProfileSolid,
  signedArea2D,
  triangulateSimplePolygon2D,
  type FaceInsetExtrudeInput,
  type LoftCrossSection,
  type LoftSolidInput,
  type PushPullExtrudeInput,
  type RevolveProfileInput,
} from "./direct-sketch-pushpull-manifold-kernel";

export {
  applyParametricEdgeBevel,
  booleanSolidIntersect,
  booleanSolidOperation,
  booleanSolidSubtract,
  booleanSolidUnion,
  createBoxSolidPrimitive,
  transformSolidMesh,
  type BooleanSolidOperationKind,
  type BooleanSolidOptions,
  type BoxSolidPrimitiveInput,
  type ParametricBevelEdgeScope,
  type ParametricEdgeBevelInput,
  type ParametricEdgeBevelResult,
  type SolidTransformInput,
} from "./parametric-fillet-chamfer-csg-kernel";

export {
  ParametricCadFeatureTree,
  type CadFeatureNode,
  type CadFeatureParamsByKind,
  type ParametricFeatureStepAudit,
  type ParametricTreeEvaluationResult,
} from "./parametric-cad-feature-tree";

export {
  buildCameraProjection,
  classifyComicFeatureEdges,
  extractComicNprInkStrokes,
  type ClassifiedComicEdge,
  type ComicCameraConfig,
  type ComicCameraProjection,
  type ComicInkEdgeCategory,
  type ComicNprExtractionOptions,
  type ComicNprProjectionResult,
  type ComicNprProjectionStats,
  type ComicProjectedInkStroke,
  type ProjectedPoint2D,
} from "./comic-npr-crease-ink-projector";
