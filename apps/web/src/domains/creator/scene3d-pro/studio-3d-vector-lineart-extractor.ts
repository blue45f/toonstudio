/**
 * 3D→웹툰 편집 가능 벡터 강약선(LT 변환) 클린룸 추출기.
 *
 * 인덱스 삼각형 메쉬와 카메라 뷰/투영 행렬에서 100% 자체 기하 알고리즘으로
 * 1) 정점 용접 및 무방향 인접 엣지 그래프 구성
 * 2) 실루엣(전면/후면 전환), 크리즈(이면각 임계치 초과), 경계·재질 경계 엣지 분류
 * 3) 동차 클립 프러스텀 클리핑 + 2D 화면 그리드 가속 Möller–Trumbore 레이-삼각형
 *    은선 제거(이진 탐색 부분 가림 분할 포함)
 * 4) 카메라 거리·법선 경사도·끝단 필압 테이퍼 기반 가변 선 굵기(강약선) 계산
 * 5) 편집 가능한 중심선 경로 + 가변 폭 리본 윤곽 SVG 문서 출력
 * 을 수행한다.
 */

import {
  buildOcclusionGrid,
  extractVisibleSegments,
  type FeatureEdgeCandidate,
  type WorldTriangle,
} from "./studio-3d-vector-lineart-hlr";
import {
  IDENTITY_MAT4,
  clamp,
  clamp01,
  createLookAtViewMatrix,
  createOrthographicProjectionMatrix,
  createPerspectiveProjectionMatrix,
  createVectorLineArtCubeMesh,
  createVectorLineArtCylinderMesh,
  dot3,
  extractCameraBasis,
  invertMat4,
  multiplyMat4,
  normalize3Tuple,
  projectWorldPointToScreen,
  type CameraBasis,
  type CameraProjectionInput,
  type IndexedTriangleMesh,
  type NdcDepthRange,
  type ProjectedScreenPoint,
  type VectorLineArtVec3,
} from "./studio-3d-vector-lineart-math";
import {
  assembleVectorLineArtSvg,
  buildCenterlineSvgPath,
  buildVariableWidthRibbonPath,
  chainVisibleSegments,
  sanitizeSvgColor,
  simplifyChainPoints,
  type VectorLineArtEdgeKind,
  type VectorLineArtPoint,
  type VectorLineArtPolyline,
  type VectorLineArtSvgRenderMode,
} from "./studio-3d-vector-lineart-svg";

export {
  IDENTITY_MAT4,
  createLookAtViewMatrix,
  createOrthographicProjectionMatrix,
  createPerspectiveProjectionMatrix,
  createVectorLineArtCubeMesh,
  createVectorLineArtCylinderMesh,
  invertMat4,
  multiplyMat4,
  type CameraBasis,
  type CameraProjectionInput,
  type IndexedTriangleMesh,
  type NdcDepthRange,
  type ProjectedScreenPoint,
  type VectorLineArtEdgeKind,
  type VectorLineArtPoint,
  type VectorLineArtPolyline,
  type VectorLineArtSvgRenderMode,
  type VectorLineArtVec3,
};

export interface Studio3dVectorLineArtOptions {
  /** 크리즈(접힘선) 이면각 임계치(도). 기본 `32`. */
  readonly creaseAngleThresholdDeg?: number;
  /** 실루엣 엣지 추출 여부. 기본 `true`. */
  readonly extractSilhouette?: boolean;
  /** 크리즈 엣지 추출 여부. 기본 `true`. */
  readonly extractCrease?: boolean;
  /** 열린 경계 엣지 추출 여부. 기본 `true`. */
  readonly extractBoundary?: boolean;
  /** 재질 경계 엣지 추출 여부. 기본 `false`. */
  readonly extractMaterialBoundary?: boolean;
  /** 레이-삼각형 깊이 기반 은선 제거(HLR) 활성화 여부. 기본 `true`. */
  readonly hiddenLineRemoval?: boolean;
  /** 열린 천/판 메쉬도 양면 차폐자로 취급할지 여부. 기본 `true`. */
  readonly doubleSidedOcclusion?: boolean;
  /** 후면 엣지(양 인접면 모두 후면)도 후보에 포함할지 여부. 기본 `false`. */
  readonly includeBackfaceEdges?: boolean;
  /** 정점 위치 용접 허용 오차(m, 0이면 원본 인덱스 유지). 기본 `1e-5`. */
  readonly weldTolerance?: number;
  /** 가시성 샘플링 간격(px). 기본 `6`. */
  readonly visibilitySampleStepPx?: number;
  /** 깊이 바이어스(m, 자체 그림자·Z-파이팅 방지). 기본 `1e-3`. */
  readonly depthBias?: number;
  /** 출력 최소 선분 길이(px). 기본 `1.25`. */
  readonly minSegmentLengthPx?: number;
  /** 폴리라인 연결 허용 거리(px). 기본 `1.5`. */
  readonly chainTolerancePx?: number;
  /** Douglas–Peucker 단순화 허용 오차(px, 0이면 비활성). 기본 `0.25`. */
  readonly simplifyTolerancePx?: number;
  /** 기본 선 굵기(px). 기본 `2.0`. */
  readonly baseWidthPx?: number;
  /** 최소 선 굵기(px). 기본 `0.6`. */
  readonly minWidthPx?: number;
  /** 최대 선 굵기(px). 기본 `5.5`. */
  readonly maxWidthPx?: number;
  /** 카메라 거리 원근 강약 강도(0..1). 기본 `0.75`. */
  readonly distanceWeightStrength?: number;
  /** 법선 경사도(grazing) 강약 강도(0..1). 기본 `0.65`. */
  readonly normalSlopeStrength?: number;
  /** 열린 폴리라인 양 끝단 테이퍼 비율(0..0.4). 기본 `0.14`. */
  readonly endTaperRatio?: number;
  /** 선택적 기준 근거리 깊이(m, 미지정 시 가시 점 최소 깊이 자동 보정). */
  readonly depthReferenceNear?: number;
  /** 선택적 기준 원거리 깊이(m, 미지정 시 가시 점 최대 깊이 자동 보정). */
  readonly depthReferenceFar?: number;
  /** 실루엣/크리즈/경계 굵기 배율. */
  readonly silhouetteWidthScale?: number;
  readonly creaseWidthScale?: number;
  readonly boundaryWidthScale?: number;
  /** SVG 선 색상. 기본 `"#111111"`. */
  readonly strokeColor?: string;
  /** SVG 출력 모드. 기본 `"variable-ribbon"`. */
  readonly svgRenderMode?: VectorLineArtSvgRenderMode;
}

export interface VectorLineArtExtractionStats {
  readonly inputTriangleCount: number;
  readonly frontFacingTriangleCount: number;
  readonly totalUniqueEdges: number;
  readonly candidateFeatureEdges: number;
  readonly silhouetteEdgeCount: number;
  readonly creaseEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly materialBoundaryEdgeCount: number;
  readonly occludedEdgeSegmentCount: number;
  readonly visibleSegmentCount: number;
  readonly polylineCount: number;
}

export interface Studio3dVectorLineArtResult {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly polylines: readonly VectorLineArtPolyline[];
  readonly svg: string;
  readonly stats: VectorLineArtExtractionStats;
}

interface ResolvedLineArtOptions {
  readonly creaseAngleThresholdDeg: number;
  readonly extractSilhouette: boolean;
  readonly extractCrease: boolean;
  readonly extractBoundary: boolean;
  readonly extractMaterialBoundary: boolean;
  readonly hiddenLineRemoval: boolean;
  readonly doubleSidedOcclusion: boolean;
  readonly includeBackfaceEdges: boolean;
  readonly weldTolerance: number;
  readonly visibilitySampleStepPx: number;
  readonly depthBias: number;
  readonly minSegmentLengthPx: number;
  readonly chainTolerancePx: number;
  readonly simplifyTolerancePx: number;
  readonly baseWidthPx: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly distanceWeightStrength: number;
  readonly normalSlopeStrength: number;
  readonly endTaperRatio: number;
  readonly depthReferenceNear: number | null;
  readonly depthReferenceFar: number | null;
  readonly silhouetteWidthScale: number;
  readonly creaseWidthScale: number;
  readonly boundaryWidthScale: number;
  readonly strokeColor: string;
  readonly svgRenderMode: VectorLineArtSvgRenderMode;
}

const RAD_TO_DEG = 180 / Math.PI;

function resolveOptions(options?: Studio3dVectorLineArtOptions): ResolvedLineArtOptions {
  const minW = clamp(options?.minWidthPx ?? 0.6, 0.1, 20);
  const maxW = clamp(options?.maxWidthPx ?? 5.5, minW, 40);
  return {
    creaseAngleThresholdDeg: clamp(options?.creaseAngleThresholdDeg ?? 32, 0.5, 179.5),
    extractSilhouette: options?.extractSilhouette ?? true,
    extractCrease: options?.extractCrease ?? true,
    extractBoundary: options?.extractBoundary ?? true,
    extractMaterialBoundary: options?.extractMaterialBoundary ?? false,
    hiddenLineRemoval: options?.hiddenLineRemoval ?? true,
    doubleSidedOcclusion: options?.doubleSidedOcclusion ?? true,
    includeBackfaceEdges: options?.includeBackfaceEdges ?? false,
    weldTolerance: clamp(options?.weldTolerance ?? 1e-5, 0, 0.1),
    visibilitySampleStepPx: clamp(options?.visibilitySampleStepPx ?? 6, 1, 64),
    depthBias: clamp(options?.depthBias ?? 1e-3, 1e-5, 0.2),
    minSegmentLengthPx: clamp(options?.minSegmentLengthPx ?? 1.25, 0.1, 50),
    chainTolerancePx: clamp(options?.chainTolerancePx ?? 1.5, 0.05, 16),
    simplifyTolerancePx: clamp(options?.simplifyTolerancePx ?? 0.25, 0, 8),
    baseWidthPx: clamp(options?.baseWidthPx ?? 2.0, minW, maxW),
    minWidthPx: minW,
    maxWidthPx: maxW,
    distanceWeightStrength: clamp01(options?.distanceWeightStrength ?? 0.75),
    normalSlopeStrength: clamp01(options?.normalSlopeStrength ?? 0.65),
    endTaperRatio: clamp(options?.endTaperRatio ?? 0.14, 0, 0.4),
    depthReferenceNear:
      typeof options?.depthReferenceNear === "number" && Number.isFinite(options.depthReferenceNear)
        ? Math.max(0, options.depthReferenceNear)
        : null,
    depthReferenceFar:
      typeof options?.depthReferenceFar === "number" && Number.isFinite(options.depthReferenceFar)
        ? Math.max(0, options.depthReferenceFar)
        : null,
    silhouetteWidthScale: clamp(options?.silhouetteWidthScale ?? 1.35, 0.2, 4),
    creaseWidthScale: clamp(options?.creaseWidthScale ?? 0.82, 0.2, 4),
    boundaryWidthScale: clamp(options?.boundaryWidthScale ?? 1.15, 0.2, 4),
    strokeColor: sanitizeSvgColor(options?.strokeColor ?? "#111111"),
    svgRenderMode: options?.svgRenderMode ?? "variable-ribbon",
  };
}

function transformWorldVertex(
  model: Float32Array | readonly number[],
  x: number,
  y: number,
  z: number,
): readonly [number, number, number] {
  return [
    (model[0] ?? 1) * x + (model[4] ?? 0) * y + (model[8] ?? 0) * z + (model[12] ?? 0),
    (model[1] ?? 0) * x + (model[5] ?? 1) * y + (model[9] ?? 0) * z + (model[13] ?? 0),
    (model[2] ?? 0) * x + (model[6] ?? 0) * y + (model[10] ?? 1) * z + (model[14] ?? 0),
  ];
}

function buildSceneGeometryAndFeatureEdges(
  meshes: readonly IndexedTriangleMesh[],
  camera: CameraProjectionInput,
  camBasis: CameraBasis,
  viewProj: Float64Array,
  opts: ResolvedLineArtOptions,
): {
  readonly triangles: readonly WorldTriangle[];
  readonly featureEdges: readonly FeatureEdgeCandidate[];
  readonly frontFacingTriangleCount: number;
  readonly totalUniqueEdges: number;
  readonly edgeKindCounts: Record<VectorLineArtEdgeKind, number>;
} {
  const triangles: WorldTriangle[] = [];
  const featureEdges: FeatureEdgeCandidate[] = [];
  let frontFacingTriangleCount = 0;
  let totalUniqueEdges = 0;
  const edgeKindCounts: Record<VectorLineArtEdgeKind, number> = {
    silhouette: 0,
    crease: 0,
    boundary: 0,
    "material-boundary": 0,
  };

  for (const mesh of meshes) {
    const pos = mesh.positions;
    const idx = mesh.indices;
    const vertexCount = Math.floor(pos.length / 3);
    const triCount = Math.floor(idx.length / 3);
    if (vertexCount < 3 || triCount < 1) continue;

    const model = mesh.modelMatrix && mesh.modelMatrix.length >= 16 ? mesh.modelMatrix : IDENTITY_MAT4;
    const worldCoords = new Float64Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v += 1) {
      const [wx, wy, wz] = transformWorldVertex(
        model,
        pos[v * 3] ?? 0,
        pos[v * 3 + 1] ?? 0,
        pos[v * 3 + 2] ?? 0,
      );
      worldCoords[v * 3] = wx;
      worldCoords[v * 3 + 1] = wy;
      worldCoords[v * 3 + 2] = wz;
    }

    const weldedIds = new Uint32Array(vertexCount);
    const weldedPositions: number[] = [];
    if (opts.weldTolerance > 0) {
      const invTol = 1 / opts.weldTolerance;
      const hashToId = new Map<string, number>();
      for (let v = 0; v < vertexCount; v += 1) {
        const wx = worldCoords[v * 3] ?? 0;
        const wy = worldCoords[v * 3 + 1] ?? 0;
        const wz = worldCoords[v * 3 + 2] ?? 0;
        const key = `${Math.round(wx * invTol)},${Math.round(wy * invTol)},${Math.round(wz * invTol)}`;
        let wid = hashToId.get(key);
        if (wid === undefined) {
          wid = weldedPositions.length / 3;
          hashToId.set(key, wid);
          weldedPositions.push(wx, wy, wz);
        }
        weldedIds[v] = wid;
      }
    } else {
      for (let v = 0; v < vertexCount; v += 1) {
        weldedIds[v] = v;
        weldedPositions.push(
          worldCoords[v * 3] ?? 0,
          worldCoords[v * 3 + 1] ?? 0,
          worldCoords[v * 3 + 2] ?? 0,
        );
      }
    }

    const edgeMap = new Map<string, { readonly u: number; readonly v: number; readonly tris: number[] }>();
    const addEdge = (u: number, v: number, triId: number) => {
      if (u === v) return;
      const lo = u < v ? u : v;
      const hi = u < v ? v : u;
      const key = `${lo}:${hi}`;
      let entry = edgeMap.get(key);
      if (!entry) {
        entry = { u: lo, v: hi, tris: [] };
        edgeMap.set(key, entry);
      }
      entry.tris.push(triId);
    };

    for (let t = 0; t < triCount; t += 1) {
      const i0 = idx[t * 3] ?? -1;
      const i1 = idx[t * 3 + 1] ?? -1;
      const i2 = idx[t * 3 + 2] ?? -1;
      if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) {
        continue;
      }
      const w0 = weldedIds[i0] ?? 0;
      const w1 = weldedIds[i1] ?? 0;
      const w2 = weldedIds[i2] ?? 0;
      if (w0 === w1 || w1 === w2 || w2 === w0) continue;

      const v0x = weldedPositions[w0 * 3] ?? 0;
      const v0y = weldedPositions[w0 * 3 + 1] ?? 0;
      const v0z = weldedPositions[w0 * 3 + 2] ?? 0;
      const v1x = weldedPositions[w1 * 3] ?? 0;
      const v1y = weldedPositions[w1 * 3 + 1] ?? 0;
      const v1z = weldedPositions[w1 * 3 + 2] ?? 0;
      const v2x = weldedPositions[w2 * 3] ?? 0;
      const v2y = weldedPositions[w2 * 3 + 1] ?? 0;
      const v2z = weldedPositions[w2 * 3 + 2] ?? 0;

      const e1x = v1x - v0x;
      const e1y = v1y - v0y;
      const e1z = v1z - v0z;
      const e2x = v2x - v0x;
      const e2y = v2y - v0y;
      const e2z = v2z - v0z;
      const crx = e1y * e2z - e1z * e2y;
      const cry = e1z * e2x - e1x * e2z;
      const crz = e1x * e2y - e1y * e2x;
      const doubleArea = Math.hypot(crx, cry, crz);
      if (!Number.isFinite(doubleArea) || doubleArea <= 1e-11) continue;

      const nx = crx / doubleArea;
      const ny = cry / doubleArea;
      const nz = crz / doubleArea;
      const cx = (v0x + v1x + v2x) / 3;
      const cy = (v0y + v1y + v2y) / 3;
      const cz = (v0z + v1z + v2z) / 3;

      let facing: number;
      if (camBasis.isOrthographic) {
        facing = -(nx * camBasis.forward[0] + ny * camBasis.forward[1] + nz * camBasis.forward[2]);
      } else {
        const vx = camBasis.position[0] - cx;
        const vy = camBasis.position[1] - cy;
        const vz = camBasis.position[2] - cz;
        const vLen = Math.hypot(vx, vy, vz) || 1;
        facing = dot3(nx, ny, nz, vx / vLen, vy / vLen, vz / vLen);
      }
      const frontFacing = facing > 1e-7;
      if (frontFacing) frontFacingTriangleCount += 1;

      const p0 = projectWorldPointToScreen(
        v0x, v0y, v0z, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
      );
      const p1 = projectWorldPointToScreen(
        v1x, v1y, v1z, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
      );
      const p2 = projectWorldPointToScreen(
        v2x, v2y, v2z, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
      );

      let screenMinX = 0;
      let screenMaxX = camera.viewportWidth;
      let screenMinY = 0;
      let screenMaxY = camera.viewportHeight;
      if (p0 && p1 && p2) {
        screenMinX = Math.min(p0.x, p1.x, p2.x) - 2;
        screenMaxX = Math.max(p0.x, p1.x, p2.x) + 2;
        screenMinY = Math.min(p0.y, p1.y, p2.y) - 2;
        screenMaxY = Math.max(p0.y, p1.y, p2.y) + 2;
      }
      const outsideViewport =
        screenMaxX < 0 ||
        screenMinX > camera.viewportWidth ||
        screenMaxY < 0 ||
        screenMinY > camera.viewportHeight;

      const triId = triangles.length;
      triangles.push({
        id: triId,
        v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z,
        nx, ny, nz,
        frontFacing,
        materialId: mesh.materialIds?.[t] ?? 0,
        screenMinX, screenMaxX, screenMinY, screenMaxY,
        canOcclude: !outsideViewport && (opts.doubleSidedOcclusion || frontFacing),
      });

      addEdge(w0, w1, triId);
      addEdge(w1, w2, triId);
      addEdge(w2, w0, triId);
    }

    totalUniqueEdges += edgeMap.size;

    for (const edge of edgeMap.values()) {
      const tris = edge.tris;
      if (tris.length === 0) continue;

      let hasFront = false;
      let hasBack = false;
      let avgNx = 0;
      let avgNy = 0;
      let avgNz = 0;
      let frontCount = 0;
      for (const tid of tris) {
        const tri = triangles[tid];
        if (!tri) continue;
        if (tri.frontFacing) {
          hasFront = true;
          avgNx += tri.nx;
          avgNy += tri.ny;
          avgNz += tri.nz;
          frontCount += 1;
        } else {
          hasBack = true;
        }
      }
      if (frontCount === 0) {
        for (const tid of tris) {
          const tri = triangles[tid];
          if (!tri) continue;
          avgNx += tri.nx;
          avgNy += tri.ny;
          avgNz += tri.nz;
        }
      }
      const [normX, normY, normZ] = normalize3Tuple(avgNx, avgNy, avgNz);

      let maxDihedralDeg = 0;
      let hasMaterialDiff = false;
      for (let a = 0; a < tris.length; a += 1) {
        const ta = triangles[tris[a] ?? -1];
        if (!ta) continue;
        for (let b = a + 1; b < tris.length; b += 1) {
          const tb = triangles[tris[b] ?? -1];
          if (!tb) continue;
          const cosAngle = clamp(dot3(ta.nx, ta.ny, ta.nz, tb.nx, tb.ny, tb.nz), -1, 1);
          const angleDeg = Math.acos(cosAngle) * RAD_TO_DEG;
          if (angleDeg > maxDihedralDeg) maxDihedralDeg = angleDeg;
          if (ta.materialId !== tb.materialId) hasMaterialDiff = true;
        }
      }

      let kind: VectorLineArtEdgeKind | null = null;
      if (tris.length === 1) {
        if (opts.extractBoundary && (opts.doubleSidedOcclusion || opts.includeBackfaceEdges || hasFront)) {
          kind = "boundary";
        }
      } else if (hasFront && hasBack) {
        if (opts.extractSilhouette) kind = "silhouette";
      } else if (
        opts.extractCrease &&
        maxDihedralDeg >= opts.creaseAngleThresholdDeg &&
        (opts.includeBackfaceEdges || hasFront)
      ) {
        kind = "crease";
      } else if (
        opts.extractMaterialBoundary &&
        hasMaterialDiff &&
        (opts.includeBackfaceEdges || hasFront)
      ) {
        kind = "material-boundary";
      }

      if (!kind) continue;
      edgeKindCounts[kind] += 1;
      featureEdges.push({
        kind,
        ax: weldedPositions[edge.u * 3] ?? 0,
        ay: weldedPositions[edge.u * 3 + 1] ?? 0,
        az: weldedPositions[edge.u * 3 + 2] ?? 0,
        bx: weldedPositions[edge.v * 3] ?? 0,
        by: weldedPositions[edge.v * 3 + 1] ?? 0,
        bz: weldedPositions[edge.v * 3 + 2] ?? 0,
        avgNx: normX, avgNy: normY, avgNz: normZ,
        dihedralAngleDeg: maxDihedralDeg,
        ownerTriIds: tris,
      });
    }
  }

  return { triangles, featureEdges, frontFacingTriangleCount, totalUniqueEdges, edgeKindCounts };
}

/**
 * 3D 메쉬(단일 또는 다중)와 카메라 행렬에서 은선이 제거된 가변 굵기 웹툰 벡터 선화와
 * 편집 가능한 SVG 문서를 추출한다.
 */
export function extract3dVectorLineArt(
  meshOrMeshes: IndexedTriangleMesh | readonly IndexedTriangleMesh[],
  camera: CameraProjectionInput,
  options?: Studio3dVectorLineArtOptions,
): Studio3dVectorLineArtResult {
  const opts = resolveOptions(options);
  const viewportWidth = Math.max(1, Number.isFinite(camera.viewportWidth) ? camera.viewportWidth : 800);
  const viewportHeight = Math.max(1, Number.isFinite(camera.viewportHeight) ? camera.viewportHeight : 600);
  const normalizedCamera: CameraProjectionInput = { ...camera, viewportWidth, viewportHeight };
  const ndcDepthRange: NdcDepthRange = camera.ndcDepthRange ?? "neg-one-to-one";
  const meshes = Array.isArray(meshOrMeshes)
    ? (meshOrMeshes as readonly IndexedTriangleMesh[])
    : [meshOrMeshes as IndexedTriangleMesh];

  const camBasis = extractCameraBasis(normalizedCamera);
  const viewProj = multiplyMat4(normalizedCamera.projectionMatrix, normalizedCamera.viewMatrix);

  const {
    triangles,
    featureEdges,
    frontFacingTriangleCount,
    totalUniqueEdges,
    edgeKindCounts,
  } = buildSceneGeometryAndFeatureEdges(meshes, normalizedCamera, camBasis, viewProj, opts);

  const occlusionGrid = opts.hiddenLineRemoval
    ? buildOcclusionGrid(triangles, viewportWidth, viewportHeight)
    : [];

  const { segments, occludedCount } = extractVisibleSegments(
    featureEdges, triangles, occlusionGrid, normalizedCamera, camBasis, viewProj, ndcDepthRange, opts,
  );

  const rawChains = chainVisibleSegments(segments, opts.chainTolerancePx);

  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  for (const chain of rawChains) {
    for (const v of chain.vertices) {
      if (v.depth < minDepth) minDepth = v.depth;
      if (v.depth > maxDepth) maxDepth = v.depth;
    }
  }
  const depthNear = opts.depthReferenceNear ?? (Number.isFinite(minDepth) ? minDepth : 1);
  const depthFar = opts.depthReferenceFar ?? (Number.isFinite(maxDepth) ? maxDepth : depthNear + 1);
  const depthSpan = depthFar - depthNear;

  const polylines: VectorLineArtPolyline[] = [];
  for (let chainIdx = 0; chainIdx < rawChains.length; chainIdx += 1) {
    const chain = rawChains[chainIdx];
    if (!chain || chain.vertices.length < 2) continue;

    const cumLen: number[] = [0];
    let totalLen = 0;
    for (let i = 1; i < chain.vertices.length; i += 1) {
      const prev = chain.vertices[i - 1];
      const cur = chain.vertices[i];
      if (!prev || !cur) continue;
      totalLen += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      cumLen.push(totalLen);
    }

    const kindScale =
      chain.kind === "silhouette"
        ? opts.silhouetteWidthScale
        : chain.kind === "boundary"
          ? opts.boundaryWidthScale
          : chain.kind === "crease"
            ? opts.creaseWidthScale
            : 0.72;

    const styledPoints: VectorLineArtPoint[] = [];
    for (let i = 0; i < chain.vertices.length; i += 1) {
      const v = chain.vertices[i];
      if (!v) continue;

      const depthNorm = depthSpan > 1e-4 ? clamp01((v.depth - depthNear) / depthSpan) : 0.5;
      const distFactor = 1 + (0.5 - depthNorm) * 0.9 * opts.distanceWeightStrength;

      const viewDir = camBasis.isOrthographic
        ? normalize3Tuple(-camBasis.forward[0], -camBasis.forward[1], -camBasis.forward[2])
        : normalize3Tuple(
            camBasis.position[0] - v.wx,
            camBasis.position[1] - v.wy,
            camBasis.position[2] - v.wz,
          );
      const nDotV = clamp01(Math.abs(dot3(v.avgNx, v.avgNy, v.avgNz, viewDir[0], viewDir[1], viewDir[2])));
      const grazing = 1 - nDotV;
      const grazingAngleDeg = Math.acos(nDotV) * RAD_TO_DEG;
      const sharpnessBoost = clamp01(v.dihedralAngleDeg / 180) * 0.15;
      const normalFactor = 1 + (grazing - 0.5) * 0.7 * opts.normalSlopeStrength + sharpnessBoost;

      let taperFactor = 1;
      if (!chain.closed && opts.endTaperRatio > 0 && totalLen > 1e-4) {
        const s = (cumLen[i] ?? 0) / totalLen;
        const edgeDist = Math.min(s, 1 - s);
        const t = clamp01(edgeDist / opts.endTaperRatio);
        const smooth = t * t * (3 - 2 * t);
        taperFactor = 0.55 + 0.45 * smooth;
      }

      const widthPx = clamp(
        opts.baseWidthPx * kindScale * distFactor * normalFactor * taperFactor,
        opts.minWidthPx,
        opts.maxWidthPx,
      );

      styledPoints.push({
        x: v.x, y: v.y, depth: v.depth, widthPx, grazingAngleDeg,
        worldPosition: [v.wx, v.wy, v.wz],
      });
    }

    const finalPoints = simplifyChainPoints(styledPoints, opts.simplifyTolerancePx, chain.closed);
    if (finalPoints.length < 2) continue;

    let sumW = 0;
    let minW = Number.POSITIVE_INFINITY;
    let maxW = Number.NEGATIVE_INFINITY;
    for (const pt of finalPoints) {
      sumW += pt.widthPx;
      if (pt.widthPx < minW) minW = pt.widthPx;
      if (pt.widthPx > maxW) maxW = pt.widthPx;
    }

    polylines.push({
      id: `line-${chain.kind}-${chainIdx + 1}`,
      kind: chain.kind,
      closed: chain.closed,
      points: finalPoints,
      averageWidthPx: sumW / finalPoints.length,
      minWidthPx: minW,
      maxWidthPx: maxW,
      centerlinePathData: buildCenterlineSvgPath(finalPoints, chain.closed),
      variableWidthPathData: buildVariableWidthRibbonPath(finalPoints, chain.closed),
    });
  }

  const svg = assembleVectorLineArtSvg(
    polylines, viewportWidth, viewportHeight, opts.strokeColor, opts.svgRenderMode,
  );

  return {
    viewportWidth,
    viewportHeight,
    polylines,
    svg,
    stats: {
      inputTriangleCount: triangles.length,
      frontFacingTriangleCount,
      totalUniqueEdges,
      candidateFeatureEdges: featureEdges.length,
      silhouetteEdgeCount: edgeKindCounts.silhouette,
      creaseEdgeCount: edgeKindCounts.crease,
      boundaryEdgeCount: edgeKindCounts.boundary,
      materialBoundaryEdgeCount: edgeKindCounts["material-boundary"],
      occludedEdgeSegmentCount: occludedCount,
      visibleSegmentCount: segments.length,
      polylineCount: polylines.length,
    },
  };
}
