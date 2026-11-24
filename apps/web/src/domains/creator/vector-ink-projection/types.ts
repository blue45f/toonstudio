/**
 * 3D 실루엣·크리즈 → 크리에이터 개인 G펜 벡터 잉크 투영 모듈 타입 계약.
 * Three.js WebGL 런타임 없이 순수 결정론 3D 기하·투영·베지어 잉크 연산을 정의한다.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type TriangleIndices = readonly [number, number, number];

export type MeshPresetId = "hero-bust" | "architectural-arch" | "katana-prop";

export type GpenStyleId = "webtoon-gpen" | "expressive-brush" | "architectural-technical";

export type InkEdgeKind = "silhouette" | "crease" | "boundary";

export interface MeshEdgeRecord {
  readonly edgeKey: string;
  readonly v0: number;
  readonly v1: number;
  readonly faceA: number;
  readonly faceB: number | null;
  readonly dihedralAngleDeg: number;
  readonly averageNormal: Vec3;
}

export interface MeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly center: Vec3;
  readonly radius: number;
}

export interface MeshManifoldStats {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly edgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly isWatertightManifold: boolean;
}

export interface IndexedTriangleMesh {
  readonly id: MeshPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultCamera: {
    readonly yawDeg: number;
    readonly pitchDeg: number;
    readonly distance: number;
    readonly fovDeg: number;
    readonly target: Vec3;
  };
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly TriangleIndices[];
  readonly faceNormals: readonly Vec3[];
  readonly faceCentroids: readonly Vec3[];
  readonly edges: readonly MeshEdgeRecord[];
  readonly bounds: MeshBounds;
  readonly manifoldStats: MeshManifoldStats;
}

export interface ProjectionCameraConfig {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly distance: number;
  readonly fovDeg: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly target: Vec3;
  readonly nearClip?: number;
}

export interface ProjectedInkEdge {
  readonly edgeKey: string;
  readonly kind: InkEdgeKind;
  readonly a2d: Vec2;
  readonly b2d: Vec2;
  readonly depth: number;
  readonly dihedralAngleDeg: number;
  readonly shadowFactor: number;
  readonly normal3d: Vec3;
  readonly v0: number;
  readonly v1: number;
}

export interface ExtractInkEdgesOptions {
  readonly creaseAngleDeg?: number;
  readonly keyLightDirection?: Vec3;
  readonly includeSilhouettes?: boolean;
  readonly includeCreases?: boolean;
  readonly depthOcclusionBias?: number;
  readonly enableOcclusionCulling?: boolean;
}

export interface ExtractedInkEdgeResult {
  readonly edges: readonly ProjectedInkEdge[];
  readonly silhouetteCount: number;
  readonly creaseCount: number;
  readonly boundaryCount: number;
  readonly frontFacingTriangleCount: number;
  readonly culledEdgeCount: number;
  readonly cameraPosition: Vec3;
}

export interface InkPolylinePoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly shadowFactor: number;
  readonly vertexIndex: number;
}

export interface InkPolyline {
  readonly id: string;
  readonly kind: InkEdgeKind;
  readonly closed: boolean;
  readonly points: readonly InkPolylinePoint[];
  readonly averageDepth: number;
  readonly averageShadowFactor: number;
  readonly arcLengthPx: number;
}

export interface ChainPolylinesOptions {
  readonly cornerBreakAngleDeg?: number;
  readonly rdpTolerancePx?: number;
  readonly minStrokeLengthPx?: number;
}

export interface CreatorGpenProfile {
  readonly id: GpenStyleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly baseWidthPx: number;
  /** 획 시작부 테이퍼 강도 (0..1) */
  readonly entryTaper: number;
  /** 획 끝부분 G펜 빼기/스냅 강도 (0..1) */
  readonly exitFlick: number;
  /** 획 중앙부 필압 배부름 (0..1) */
  readonly bellySwell: number;
  /** 곡률이 급할수록 날카롭게 가늘어지는 가중치 (0..1) */
  readonly curvatureWeight: number;
  /** 주광 반대편 그림자 측 선 굵기 강조 (0..1.5) */
  readonly shadowSideThickening: number;
  /** 실루엣 대비 내부 크리즈 선 굵기 비율 (0.3..1.1) */
  readonly creaseWidthRatio: number;
  readonly minWidthPx?: number;
}

export interface CubicBezierSegment {
  readonly p0: Vec2;
  readonly cp1: Vec2;
  readonly cp2: Vec2;
  readonly p3: Vec2;
  readonly widthStart: number;
  readonly widthEnd: number;
  readonly shadowFactor: number;
}

export interface FittedBezierInkStroke {
  readonly id: string;
  readonly kind: InkEdgeKind;
  readonly closed: boolean;
  readonly averageDepth: number;
  readonly averageShadowFactor: number;
  readonly arcLengthPx: number;
  readonly segments: readonly CubicBezierSegment[];
  readonly outlinePolygon: readonly Vec2[];
  readonly svgOutlinePathD: string;
  readonly svgCenterlinePathD: string;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly meanWidthPx: number;
}

export interface FitBezierInkOptions {
  readonly subdivisionsPerSegment?: number;
}

export interface VectorInkProjectionStats {
  readonly meshVertexCount: number;
  readonly meshTriangleCount: number;
  readonly meshEdgeCount: number;
  readonly extractedEdgeCount: number;
  readonly silhouetteEdgeCount: number;
  readonly creaseEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly culledEdgeCount: number;
  readonly polylineCount: number;
  readonly bezierSegmentCount: number;
  readonly avgLineWidthPx: number;
  readonly maxLineWidthPx: number;
  readonly shadowThickenedStrokeCount: number;
}

export interface VectorInkProjectionResult {
  readonly mesh: IndexedTriangleMesh;
  readonly camera: ProjectionCameraConfig;
  readonly keyLightDirection: Vec3;
  readonly creaseAngleDeg: number;
  readonly gpenProfile: CreatorGpenProfile;
  readonly extracted: ExtractedInkEdgeResult;
  readonly polylines: readonly InkPolyline[];
  readonly strokes: readonly FittedBezierInkStroke[];
  readonly stats: VectorInkProjectionStats;
}

export interface VectorInkLayerStrokePayload {
  readonly id: string;
  readonly kind: InkEdgeKind;
  readonly closed: boolean;
  readonly averageDepth: number;
  readonly averageShadowFactor: number;
  readonly arcLengthPx: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly segments: readonly CubicBezierSegment[];
  readonly svgOutlinePathD: string;
  readonly svgCenterlinePathD: string;
}

export interface VectorInkLayerPayload {
  readonly schemaVersion: "toonstudio.vector-ink-layer.v1";
  readonly meshId: MeshPresetId;
  readonly gpenStyleId: GpenStyleId;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly camera: ProjectionCameraConfig;
  readonly keyLightDirection: Vec3;
  readonly creaseAngleDeg: number;
  readonly gpenProfile: CreatorGpenProfile;
  readonly strokes: readonly VectorInkLayerStrokePayload[];
  readonly stats: VectorInkProjectionStats;
}

export interface ExportVectorInkSvgOptions {
  readonly includeEditableBezierGuides?: boolean;
  readonly inkFillToken?: string;
}

export interface VectorInkSvgExport {
  readonly svgMarkup: string;
  readonly layerJson: string;
  readonly payload: VectorInkLayerPayload;
  readonly pathCount: number;
  readonly byteLength: number;
}
