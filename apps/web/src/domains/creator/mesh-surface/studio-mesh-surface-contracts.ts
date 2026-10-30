/** 원본 half-edge와 렌더·내보내기가 공유하는 순수 표면 계약이다. */
import type { StudioEditableFace, StudioEditableHalfEdge, StudioEditableMesh, StudioEditableVertex, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

export const STUDIO_MESH_SURFACE_MAX_FACE_CORNERS = 256;
export const STUDIO_MESH_SURFACE_MAX_ISSUE_IDS = 1024;
export const STUDIO_MESH_SURFACE_MAX_REPORT_ISSUES = 4096;
export type StudioMeshSurfaceIssueCode = "bow-tie-vertex"
  | "crease-invalid"
  | "crease-unsupported"
  | "duplicate-stable-id"
  | "edge-orientation-mismatch"
  | "edge-zero-length"
  | "empty-mesh"
  | "face-collinear-corner-omitted"
  | "face-corner-budget-exceeded"
  | "face-degenerate-corner"
  | "face-loop-duplicate-vertex"
  | "face-loop-incomplete"
  | "face-loop-open"
  | "face-loop-too-small"
  | "face-non-planar"
  | "face-property-invalid"
  | "face-self-intersection"
  | "face-zero-area"
  | "half-edge-face-mismatch"
  | "half-edge-link-mismatch"
  | "half-edge-reference-invalid"
  | "half-edge-twin-mismatch"
  | "index-overflow"
  | "invalid-input"
  | "isolated-vertex"
  | "mesh-budget-exceeded"
  | "mesh-revision-unsupported"
  | "non-manifold-edge"
  | "normal-unresolved"
  | "position-non-finite"
  | "position-float32-collapse"
  | "position-float32-overflow"
  | "stable-id-counter-invalid"
  | "stable-id-invalid"
  | "surface-budget-exceeded"
  | "triangulation-failed"
  | "uv-coordinate-invalid"
  | "vertex-half-edge-invalid";
export interface StudioMeshSurfaceIssue {
 readonly severity: "error" | "warning";
 readonly code: StudioMeshSurfaceIssueCode;
 readonly message: string;
 readonly detail: string;
 readonly vertexIds?: readonly number[];
 readonly halfEdgeIds?: readonly number[];
 readonly faceIds?: readonly number[];
}
export type StudioMeshSurfaceResult<T> = {readonly ok:true;readonly value:T}|{readonly ok:false;readonly issue:StudioMeshSurfaceIssue};
export interface StudioMeshSurfaceWork { readonly linear:number; readonly polygonPairs:number; readonly earTests:number; readonly triangles:number }
export interface StudioMeshSurfaceBudget {
 readonly maxFaces?:number; readonly maxFaceCorners?:number; readonly maxLinearWork?:number;
 readonly maxPolygonPairs?:number; readonly maxEarTests?:number; readonly maxTriangles?:number;
}
export interface StudioMeshSurfaceOptions {
 readonly allowCreaseMetadata?: boolean;
 /** 편집 정본만 허용한다. 생략 시 GLB의 엄격한 topology 정책을 사용한다. */
 readonly topologyPolicy?: "editable";
}
export interface StudioMeshSurfaceTriangle {
 readonly faceId:number; readonly triangleIndexWithinFace:number;
 readonly vertexIds:readonly[number,number,number];
 /** 각 원본 half-edge origin(prev.vertex)에 대응한다. */
 readonly cornerHalfEdgeIds:readonly[number,number,number]; readonly materialSlot:number;
}
export interface StudioMeshSurfacePlan { readonly validated:StudioMeshSurfaceValidated;readonly geometry:StudioMeshSurfaceGeometry;readonly triangles:readonly StudioMeshSurfaceTriangle[];readonly work:StudioMeshSurfaceWork }

export interface StudioMeshSurfaceValidatedFace {
  readonly face: StudioEditableFace;
  readonly halfEdgeIds: readonly number[];
  readonly vertexIds: readonly number[];
  readonly triangulationVertexIds: readonly number[];
  readonly triangles: readonly (readonly [number, number, number])[];
  readonly rawNormal: StudioMeshVec3;
  readonly normal: StudioMeshVec3;
  readonly warped: boolean;
}

export interface StudioMeshSurfaceEdgeUse {
  readonly key: string;
  readonly a: number;
  readonly b: number;
  readonly halfEdges: readonly StudioEditableHalfEdge[];
}

export interface StudioMeshSurfaceValidated {
  readonly allowCreaseMetadata: boolean;
  readonly topologyPolicy: "strict" | "editable";
  /** 실제 export topology 예외가 있는 경우만 기존 편집 음영 연결을 사용한다. */
  readonly hasEditableTopologyExceptions: boolean;
  readonly maxFaceCorners: number;
  readonly vertices: readonly StudioEditableVertex[];
  readonly vertexById: ReadonlyMap<number, StudioEditableVertex>;
  readonly halfEdgeById: ReadonlyMap<number, StudioEditableHalfEdge>;
  readonly faceById: ReadonlyMap<number, StudioEditableFace>;
  readonly faces: readonly StudioMeshSurfaceValidatedFace[];
  readonly edgeUses: readonly StudioMeshSurfaceEdgeUse[];
  readonly boundaryEdgeCount: number;
  readonly warnings: readonly StudioMeshSurfaceIssue[];
  readonly warningCount: number;
  readonly sourceMesh: StudioEditableMesh;
  readonly work: StudioMeshSurfaceWork;
}

export interface StudioMeshSurfaceGeometry {
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly indices: readonly number[];
  readonly texcoords?: readonly number[];
  readonly outputSourceVertexIds: readonly number[];
  readonly outputSourceNormalFaceIds: readonly (number | null)[];
  readonly triangleSourceFaceIds: readonly number[];
}

export function surfaceIssue(
  severity: "error" | "warning",
  code: StudioMeshSurfaceIssueCode,
  message: string,
  ids: Pick<StudioMeshSurfaceIssue, "vertexIds" | "halfEdgeIds" | "faceIds"> = {},
): StudioMeshSurfaceIssue {
  const boundedIds: {
    vertexIds?: readonly number[];
    halfEdgeIds?: readonly number[];
    faceIds?: readonly number[];
  } = {};
  const truncation: string[] = [];
  for (const key of ["vertexIds", "halfEdgeIds", "faceIds"] as const) {
    const values = ids[key];
    if (values === undefined) continue;
    const retained = values.slice(0, STUDIO_MESH_SURFACE_MAX_ISSUE_IDS);
    boundedIds[key] = retained;
    if (retained.length < values.length) {
      truncation.push(
        `${key} total=${values.length} retained=${retained.length} omitted=${values.length - retained.length}`,
      );
    }
  }
  const boundedMessage = truncation.length > 0
    ? `${message} [diagnostic IDs bounded: ${truncation.join("; ")}]`
    : message;
  return { severity, code, message: boundedMessage, detail: boundedMessage, ...boundedIds };
}


export function surfacePass<T>(value:T):StudioMeshSurfaceResult<T>{return {ok:true,value};}
export function surfaceStop<T>(issue:StudioMeshSurfaceIssue):StudioMeshSurfaceResult<T>{return {ok:false,issue};}
