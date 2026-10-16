/**
 * 면 모델링 커널이 함께 쓰는 준비·조립 도구: 메시를 읽어 컨텍스트를 만들고, 볼록 평면 면을 평면 좌표계로
 * 준비하고, 결과 면 목록을 속성을 지키며 조립한 뒤 사후 조건(닫힘·방향·면적 보존)까지 확인한다.
 * 안쪽 테두리·오프셋(kernel)과 면 그리기(draw)가 같은 준비·조립 경로를 쓰도록 한곳에 둔다.
 */

import {
  buildStudioPlanarFrame,
  describeStudioPlanarPolygon,
  projectToStudioPlanarFrame,
  studioPlanarFrameDistance,
  type StudioPlanarFrame,
  type StudioPlanarPoint,
  type StudioPlanarPolygonShape,
} from "./studio-hybrid-dcc-face-modeling-geometry";
import {
  buildStudioEditableMeshFromFaceSpecs,
  failStudioFaceModeling,
  findRenderableStartCorner,
  okStudioFaceModeling,
  preflightStudioFaceModelingMesh,
  STUDIO_FACE_MODELING_LIMITS,
  studioFaceCornerPositions,
  studioFaceModelingExtent,
  studioFaceModelingMinFeature,
  verifyStudioFaceModelingResult,
  type StudioFaceBuildSpec,
  type StudioFaceModelingFailure,
  type StudioFaceModelingOperation,
  type StudioFaceModelingOutcome,
  type StudioFaceModelingResult,
  type StudioMeshFaceLoop,
} from "./studio-hybrid-dcc-face-modeling-mesh";

import type {
  StudioEditableMesh,
  StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

export interface StudioPreparedConvexFace {
  readonly loop: StudioMeshFaceLoop;
  readonly points3: StudioMeshVec3[];
  readonly frame: StudioPlanarFrame;
  /** 면 좌표계의 반시계 다각형. */
  readonly polygon: StudioPlanarPoint[];
  readonly shape: StudioPlanarPolygonShape;
}

export interface StudioFaceModelingContext {
  readonly mesh: StudioEditableMesh;
  readonly loops: readonly StudioMeshFaceLoop[];
  readonly loopById: ReadonlyMap<number, StudioMeshFaceLoop>;
  readonly extent: number;
  readonly minFeature: number;
}

export function createStudioFaceModelingContext(mesh: StudioEditableMesh): StudioFaceModelingResult<StudioFaceModelingContext> {
  const preflight = preflightStudioFaceModelingMesh(mesh);
  if (!preflight.ok) return preflight;
  const extent = studioFaceModelingExtent(mesh);
  return okStudioFaceModeling({
    mesh,
    loops: preflight.value,
    loopById: new Map(preflight.value.map((loop) => [loop.id, loop] as const)),
    extent,
    minFeature: studioFaceModelingMinFeature(extent),
  });
}

export function validateStudioFaceModelingDistance(distance: number): StudioFaceModelingFailure | null {
  if (!Number.isFinite(distance)) {
    return failStudioFaceModeling("invalid-parameter", "distance must be a finite number");
  }
  if (distance < STUDIO_FACE_MODELING_LIMITS.minDistance) {
    return failStudioFaceModeling("invalid-parameter", "distance is below the tool resolution");
  }
  if (distance > STUDIO_FACE_MODELING_LIMITS.maxDistance) {
    return failStudioFaceModeling("invalid-parameter", "distance is above the tool range", {
      maxDistance: STUDIO_FACE_MODELING_LIMITS.maxDistance,
    });
  }
  return null;
}

export function selectStudioFaceLoops(
  context: StudioFaceModelingContext,
  faceIds: readonly number[],
): StudioFaceModelingResult<readonly StudioMeshFaceLoop[]> {
  const unique = [...new Set(faceIds)].sort((left, right) => left - right);
  if (unique.length === 0) return failStudioFaceModeling("empty-selection", "no faces selected");
  if (unique.length > STUDIO_FACE_MODELING_LIMITS.maxSelectionFaces) {
    return failStudioFaceModeling("budget-exceeded", "too many faces selected");
  }
  const loops: StudioMeshFaceLoop[] = [];
  for (const id of unique) {
    const loop = Number.isSafeInteger(id) ? context.loopById.get(id) : undefined;
    if (!loop) return failStudioFaceModeling("not-found", `face ${id} not found`, { elementIds: [id] });
    loops.push(loop);
  }
  return okStudioFaceModeling(loops);
}

export function prepareStudioConvexFace(
  context: StudioFaceModelingContext,
  loop: StudioMeshFaceLoop,
): StudioFaceModelingResult<StudioPreparedConvexFace> {
  const unsupported = (detail: string) => failStudioFaceModeling("unsupported-face", detail, {
    elementIds: [loop.id],
  });
  if (loop.vertexIds.length > STUDIO_FACE_MODELING_LIMITS.maxFaceCorners) {
    return unsupported(`face ${loop.id} has more corners than the viewport can triangulate`);
  }
  const points3 = studioFaceCornerPositions(context.mesh, loop.vertexIds);
  const frame = buildStudioPlanarFrame(points3);
  if (!frame || !(frame.area > context.minFeature * context.minFeature)) {
    return unsupported(`face ${loop.id} has no usable area`);
  }
  const planarTolerance = Math.max(1e-7, context.extent * 1e-5);
  if (points3.some((point) => Math.abs(studioPlanarFrameDistance(frame, point)) > planarTolerance)) {
    return unsupported(`face ${loop.id} is not planar`);
  }
  const polygon = points3.map((point) => projectToStudioPlanarFrame(frame, point));
  const shape = describeStudioPlanarPolygon(polygon);
  if (!shape.convex || !(shape.signedArea > 0)) {
    return failStudioFaceModeling("non-convex", `face ${loop.id} is not convex`, { elementIds: [loop.id] });
  }
  if (shape.minEdgeLength < context.minFeature) {
    return unsupported(`face ${loop.id} has an edge shorter than the tool resolution`);
  }
  return okStudioFaceModeling({ loop, points3, frame, polygon, shape });
}

export function studioFaceEdgeCreases(mesh: StudioEditableMesh, loop: StudioMeshFaceLoop): number[] {
  return loop.halfEdgeIds.map((id) => mesh.halfEdges[id]?.crease ?? 0);
}

export interface StudioFaceOutput {
  readonly positions: StudioMeshVec3[];
  readonly vertexCreases: number[];
  readonly specs: StudioFaceBuildSpec[];
  readonly createdFaceIds: number[];
  readonly faceRemap: Map<number, number | null>;
  addVertex(position: StudioMeshVec3): number;
  keepFace(loop: StudioMeshFaceLoop): number;
  /** 새 면을 더한다. 뷰포트가 그릴 수 있는 시작 꼭짓점으로 돌려 놓고, 그릴 수 없는 모양이면 null. */
  addFace(
    loop: readonly number[],
    source: StudioMeshFaceLoop,
    creases?: readonly number[],
  ): number | null;
}

export function createStudioFaceOutput(mesh: StudioEditableMesh): StudioFaceOutput {
  const positions = mesh.vertices.map((vertex) => vertex.position);
  const vertexCreases = mesh.vertices.map((vertex) => vertex.crease);
  const specs: StudioFaceBuildSpec[] = [];
  const createdFaceIds: number[] = [];
  const faceRemap = new Map<number, number | null>();
  return {
    positions,
    vertexCreases,
    specs,
    createdFaceIds,
    faceRemap,
    addVertex(position) {
      positions.push(position);
      vertexCreases.push(0);
      return positions.length - 1;
    },
    keepFace(loop) {
      const id = specs.length;
      specs.push({
        loop: loop.vertexIds,
        materialSlot: loop.materialSlot,
        smooth: loop.smooth,
        edgeCreases: studioFaceEdgeCreases(mesh, loop),
      });
      faceRemap.set(loop.id, id);
      return id;
    },
    addFace(loop, source, creases) {
      const start = findRenderableStartCorner(loop.map((index) => positions[index]!));
      if (start < 0) return null;
      const rotate = <T>(items: readonly T[]): T[] => items.map((_, index) => items[(start + index) % items.length]!);
      const id = specs.length;
      specs.push({
        loop: rotate(loop),
        materialSlot: source.materialSlot,
        smooth: source.smooth,
        ...(creases ? { edgeCreases: rotate(creases) } : {}),
      });
      createdFaceIds.push(id);
      return id;
    },
  };
}

export function studioPolygonArea(points: readonly StudioMeshVec3[]): number {
  return buildStudioPlanarFrame(points)?.area ?? 0;
}

export function finishStudioFaceOutput(
  context: StudioFaceModelingContext,
  output: StudioFaceOutput,
  operation: StudioFaceModelingOperation,
  selectionFaceIds: readonly number[],
  areaBalance: { readonly removed: number; readonly created: number },
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  // 평면 재분할 연산이라 사라진 면적과 생긴 면적이 같아야 한다(법선이 뒤집히거나 겹치면 어긋난다).
  const tolerance = Math.max(areaBalance.removed, 1e-300) * 1e-6;
  if (Math.abs(areaBalance.removed - areaBalance.created) > tolerance) {
    return failStudioFaceModeling("invalid-mesh", "created face area does not match the replaced area");
  }
  const built = buildStudioEditableMeshFromFaceSpecs(output.positions, output.vertexCreases, output.specs);
  if (!built.ok) return built;
  const violation = verifyStudioFaceModelingResult(context.mesh, built.value, output.createdFaceIds);
  if (violation) return violation;
  return okStudioFaceModeling({
    operation,
    mesh: built.value,
    createdFaceIds: [...output.createdFaceIds].sort((left, right) => left - right),
    selectionFaceIds: [...selectionFaceIds].sort((left, right) => left - right),
    faceRemap: [...output.faceRemap.entries()].sort((left, right) => left[0] - right[0]),
  });
}
