/**
 * 면 단위 모델링 커널: 거리 기반 안쪽 테두리(Inset), 면 둘레 오프셋(Offset), 면 그리기(Draw).
 *
 * 모두 순수 함수이며 입력 메시를 바꾸지 않는다. 성공하면 새 메시와 선택·ID 대응을 돌려주고, 실패하면
 * 이유 코드와 (거리 문제면) 허용 최대 거리를 돌려준다. 결과는 항상 같은 사후 조건을 통과해야 한다:
 * 새 경계 반변·방향 충돌·비다양체 모서리가 없고, 새 면이 퇴화하지 않고 뷰포트가 그릴 수 있는 볼록 평면이며,
 * 평면 재분할 연산이므로 새 면의 면적 합이 대체된 면의 면적 합과 같다.
 *
 * 정의(문서: docs/features/hybrid-dcc-face-modeling.md)
 * - 면은 평면 위의 볼록 다각형이어야 한다(렌더 경로가 볼록 면만 그린다). 일직선 꼭짓점은 허용한다.
 * - Inset/Offset 안쪽: 모서리마다 d만큼 평행 이동한 직선의 교점(mitre)을 새 꼭짓점으로 삼고, 원래 모서리와
 *   새 모서리 사이를 사다리꼴 고리로 잇는다. 어떤 모서리든 사라지면 붕괴로 보고 거부한다.
 * - Offset 바깥: 면과 같은 평면에 놓인 이웃 면 영역 안에서만 가능하다. 그 영역을 다시 쪼개
 *   (면 + 고리 + 나머지 영역) 구조로 만든다. 이웃이 없거나 영역을 벗어나면 거부한다.
 * - 면 그리기: 면 안쪽에 완전히 들어오는 볼록 다각형을 새 면으로 떼어 내고, 면의 나머지(구멍 뚫린 고리)는
 *   half-edge가 구멍을 표현하지 못하므로 볼록 조각으로 나눈다. 면의 경계 정점과 모서리는 그대로라
 *   이웃 면은 건드리지 않는다.
 */

import {
  buildStudioPlanarFrame,
  convexPolygonInsetMargin,
  describeStudioPlanarPolygon,
  maxInwardOffsetDistance,
  maxOutwardOffsetWithin,
  mergeStudioPlanarPolygons,
  mitreLengthRatio,
  offsetConvexPolygon,
  projectToStudioPlanarFrame,
  studioPlanarFrameDistance,
  triangulateConvexAnnulus,
  unprojectFromStudioPlanarFrame,
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

import type { StudioEditableMesh, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

/** 바깥쪽 오프셋 때 허용하는 mitre 길이 비(오프셋 거리 대비). 이보다 뾰족한 모서리는 너무 멀리 뻗는다. */
const MAX_MITRE_RATIO = 10;

interface PreparedFace {
  readonly loop: StudioMeshFaceLoop;
  readonly points3: StudioMeshVec3[];
  readonly frame: StudioPlanarFrame;
  /** 면 좌표계의 반시계 다각형. */
  readonly polygon: StudioPlanarPoint[];
  readonly shape: StudioPlanarPolygonShape;
}

interface ModelingContext {
  readonly mesh: StudioEditableMesh;
  readonly loops: readonly StudioMeshFaceLoop[];
  readonly loopById: ReadonlyMap<number, StudioMeshFaceLoop>;
  readonly extent: number;
  readonly minFeature: number;
}

function createContext(mesh: StudioEditableMesh): StudioFaceModelingResult<ModelingContext> {
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

function selectedLoops(
  context: ModelingContext,
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

function prepareConvexFace(
  context: ModelingContext,
  loop: StudioMeshFaceLoop,
): StudioFaceModelingResult<PreparedFace> {
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

function edgeCreases(mesh: StudioEditableMesh, loop: StudioMeshFaceLoop): number[] {
  return loop.halfEdgeIds.map((id) => mesh.halfEdges[id]?.crease ?? 0);
}

interface FaceOutput {
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

function createFaceOutput(mesh: StudioEditableMesh): FaceOutput {
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
        edgeCreases: edgeCreases(mesh, loop),
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

function polygonAreaOf(points: readonly StudioMeshVec3[]): number {
  return buildStudioPlanarFrame(points)?.area ?? 0;
}

function finishOutput(
  context: ModelingContext,
  output: FaceOutput,
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

/** 안쪽 오프셋(= 안쪽 테두리) 공통 구현. 선택한 각 면을 따로 줄인다. */
function insetFaces(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
  distance: number,
  operation: "inset" | "offset",
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  const invalid = validateStudioFaceModelingDistance(distance);
  if (invalid) return invalid;
  const context = createContext(mesh);
  if (!context.ok) return context;
  const selected = selectedLoops(context.value, faceIds);
  if (!selected.ok) return selected;

  const prepared = new Map<number, PreparedFace>();
  let limit = Number.POSITIVE_INFINITY;
  const collapsed: number[] = [];
  for (const loop of selected.value) {
    const face = prepareConvexFace(context.value, loop);
    if (!face.ok) return face;
    prepared.set(loop.id, face.value);
    const faceLimit = maxInwardOffsetDistance(face.value.polygon, context.value.minFeature);
    limit = Math.min(limit, faceLimit);
    if (distance > faceLimit) collapsed.push(loop.id);
  }
  if (collapsed.length > 0) {
    return failStudioFaceModeling(
      "collapse",
      "inset distance makes an edge disappear",
      { maxDistance: limit, elementIds: collapsed },
    );
  }

  const output = createFaceOutput(mesh);
  const selectedIds = new Set(selected.value.map((loop) => loop.id));
  const selection: number[] = [];
  let removedArea = 0;
  let createdArea = 0;
  for (const loop of context.value.loops) {
    const face = prepared.get(loop.id);
    if (!selectedIds.has(loop.id) || !face) {
      output.keepFace(loop);
      continue;
    }
    const count = loop.vertexIds.length;
    const innerPolygon = offsetConvexPolygon(face.polygon, distance);
    const innerShape = describeStudioPlanarPolygon(innerPolygon);
    if (!innerShape.convex || !(innerShape.signedArea > 0)) {
      return failStudioFaceModeling("collapse", "inset result is not a valid polygon", {
        maxDistance: limit,
        elementIds: [loop.id],
      });
    }
    const innerPoints = innerPolygon.map((point) => unprojectFromStudioPlanarFrame(face.frame, point));
    const innerIndices = innerPoints.map((point) => output.addVertex(point));
    const creases = edgeCreases(mesh, loop);
    const firstId = output.specs.length;
    const innerId = output.addFace(innerIndices, loop);
    if (innerId === null) {
      return failStudioFaceModeling("unrenderable-result", "inner face cannot be triangulated", {
        elementIds: [loop.id],
      });
    }
    const ringIds: number[] = [];
    for (let edge = 0; edge < count; edge += 1) {
      const next = (edge + 1) % count;
      const ringId = output.addFace(
        [loop.vertexIds[edge]!, loop.vertexIds[next]!, innerIndices[next]!, innerIndices[edge]!],
        loop,
        [creases[edge] ?? 0, 0, 0, 0],
      );
      if (ringId === null) {
        return failStudioFaceModeling("unrenderable-result", "ring face cannot be triangulated", {
          elementIds: [loop.id],
        });
      }
      ringIds.push(ringId);
    }
    output.faceRemap.set(loop.id, innerId);
    selection.push(...(operation === "inset" ? [innerId] : ringIds));
    removedArea += face.frame.area;
    createdArea += output.specs
      .slice(firstId)
      .reduce((sum, spec) => sum + polygonAreaOf(spec.loop.map((index) => output.positions[index]!)), 0);
  }
  return finishOutput(context.value, output, operation, selection, {
    removed: removedArea,
    created: createdArea,
  });
}

/**
 * 선택한 면을 각각 `distance`(메시 단위, 양수)만큼 안쪽으로 줄인다. 면마다 안쪽 면 하나와 사다리꼴 고리
 * 모서리 수만큼이 생긴다. 어느 면이든 모서리가 사라지면(붕괴) 아무것도 바꾸지 않고 허용 최대 거리를 알린다.
 * 선택은 안쪽 면으로 옮겨 이어서 밀기/당기기를 할 수 있다.
 */
export function insetStudioEditableMeshFacesByDistance(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
  distance: number,
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  return insetFaces(mesh, faceIds, distance, "inset");
}

export type StudioOffsetDirection = "inward" | "outward";

interface RegionBoundary {
  /** 영역 바깥 경계의 정점 ID(반시계). */
  readonly vertexIds: readonly number[];
  /** 경계 반변 (from, to) -> 접힘 값. */
  readonly creaseByEdge: ReadonlyMap<string, number>;
}

/** 시작 면과 같은 평면에 놓여 모서리로 이어진 면들을 모은다. */
function collectCoplanarRegion(
  context: ModelingContext,
  start: PreparedFace,
): StudioFaceModelingResult<ReadonlySet<number>> {
  const { mesh, loopById } = context;
  const region = new Set<number>([start.loop.id]);
  const queue = [start.loop.id];
  const planarTolerance = Math.max(1e-7, context.extent * 1e-5);
  const checked = new Map<number, boolean>();
  const coplanar = (loop: StudioMeshFaceLoop): boolean => {
    const known = checked.get(loop.id);
    if (known !== undefined) return known;
    const points = studioFaceCornerPositions(mesh, loop.vertexIds);
    const frame = buildStudioPlanarFrame(points);
    const normal = start.frame.normal;
    const aligned = frame
      ? frame.normal.x * normal.x + frame.normal.y * normal.y + frame.normal.z * normal.z > 1 - 1e-9
      : false;
    const flat = aligned
      && points.every((point) => Math.abs(studioPlanarFrameDistance(start.frame, point)) <= planarTolerance);
    checked.set(loop.id, flat);
    return flat;
  };
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const loop = loopById.get(queue[cursor]!)!;
    for (const halfEdgeId of loop.halfEdgeIds) {
      const twinId = mesh.halfEdges[halfEdgeId]?.twin ?? -1;
      if (twinId < 0) continue;
      const neighborId = mesh.halfEdges[twinId]?.face ?? -1;
      const neighbor = loopById.get(neighborId);
      if (!neighbor || region.has(neighborId) || !coplanar(neighbor)) continue;
      region.add(neighborId);
      queue.push(neighborId);
      if (region.size > STUDIO_FACE_MODELING_LIMITS.maxRegionFaces) {
        return failStudioFaceModeling("budget-exceeded", "coplanar region is too large");
      }
    }
  }
  return okStudioFaceModeling(region);
}

/** 영역의 경계 반변을 하나의 닫힌 고리로 잇는다. 구멍이 있거나 한 점에서 맞닿으면 지원하지 않는다. */
function traceRegionBoundary(
  context: ModelingContext,
  region: ReadonlySet<number>,
): StudioFaceModelingResult<RegionBoundary> {
  const { mesh, loopById } = context;
  const nextFrom = new Map<number, number>();
  const creaseByEdge = new Map<string, number>();
  for (const id of region) {
    const loop = loopById.get(id)!;
    const count = loop.vertexIds.length;
    for (let corner = 0; corner < count; corner += 1) {
      const halfEdge = mesh.halfEdges[loop.halfEdgeIds[corner]!]!;
      const twinFace = halfEdge.twin < 0 ? -1 : mesh.halfEdges[halfEdge.twin]?.face ?? -1;
      if (twinFace >= 0 && region.has(twinFace)) continue;
      const from = loop.vertexIds[corner]!;
      const to = loop.vertexIds[(corner + 1) % count]!;
      if (nextFrom.has(from)) {
        return failStudioFaceModeling("unsupported-region", "region boundary touches itself at a vertex");
      }
      nextFrom.set(from, to);
      creaseByEdge.set(`${from}|${to}`, halfEdge.crease);
    }
  }
  const first = nextFrom.keys().next();
  if (first.done) return failStudioFaceModeling("unsupported-region", "region has no boundary");
  const vertexIds: number[] = [];
  let current = first.value;
  do {
    vertexIds.push(current);
    const next = nextFrom.get(current);
    if (next === undefined || vertexIds.length > nextFrom.size) {
      return failStudioFaceModeling("unsupported-region", "region boundary is not a closed loop");
    }
    current = next;
  } while (current !== first.value);
  if (vertexIds.length !== nextFrom.size) {
    return failStudioFaceModeling("unsupported-region", "region has a hole or several boundary loops");
  }
  return okStudioFaceModeling({ vertexIds, creaseByEdge });
}

/** 같은 평면 이웃 영역 안에서 면 둘레를 바깥쪽으로 오프셋한다. */
function offsetFaceOutward(
  context: ModelingContext,
  face: PreparedFace,
  distance: number,
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  const { mesh, loopById, minFeature } = context;
  const regionResult = collectCoplanarRegion(context, face);
  if (!regionResult.ok) return regionResult;
  const region = regionResult.value;
  if (region.size === 1) {
    return failStudioFaceModeling(
      "no-coplanar-region",
      "outward offset needs coplanar neighbour faces to grow into",
      { elementIds: [face.loop.id] },
    );
  }
  const boundary = traceRegionBoundary(context, region);
  if (!boundary.ok) return boundary;
  const boundaryPoints3 = studioFaceCornerPositions(mesh, boundary.value.vertexIds);
  const boundaryPolygon = boundaryPoints3.map((point) => projectToStudioPlanarFrame(face.frame, point));
  const boundaryShape = describeStudioPlanarPolygon(boundaryPolygon);
  if (!boundaryShape.convex || !(boundaryShape.signedArea > 0)) {
    return failStudioFaceModeling("unsupported-region", "coplanar region outline is not convex");
  }
  if (mitreLengthRatio(face.polygon) > MAX_MITRE_RATIO) {
    return failStudioFaceModeling("degenerate-input", "a sharp corner would extend the outward offset too far", {
      elementIds: [face.loop.id],
    });
  }
  const room = maxOutwardOffsetWithin(face.polygon, boundaryPolygon, minFeature);
  if (distance > room) {
    return failStudioFaceModeling("out-of-region", "outward offset leaves the coplanar region", {
      maxDistance: room,
      elementIds: [face.loop.id],
    });
  }
  const outerPolygon = offsetConvexPolygon(face.polygon, -distance);
  const outerShape = describeStudioPlanarPolygon(outerPolygon);
  if (!outerShape.convex || !(outerShape.signedArea > 0)) {
    return failStudioFaceModeling("degenerate-input", "outward offset is not a valid polygon");
  }
  const annulus = triangulateConvexAnnulus(boundaryPolygon, outerPolygon);
  if (!annulus) {
    return failStudioFaceModeling("unsupported-region", "region around the offset loop cannot be split");
  }

  const output = createFaceOutput(mesh);
  const count = face.loop.vertexIds.length;
  const outerIndices = outerPolygon
    .map((point) => unprojectFromStudioPlanarFrame(face.frame, point))
    .map((point) => output.addVertex(point));
  const boundaryIds = boundary.value.vertexIds;
  const combined = [...boundaryIds, ...outerIndices];
  const combinedPolygon = [...boundaryPolygon, ...outerPolygon];
  const pieces = mergeStudioPlanarPolygons(
    combinedPolygon,
    annulus.triangles,
    (loop) => findRenderableStartCorner(loop.map((index) => output.positions[combined[index]!]!)) >= 0,
  );
  const faceCreases = edgeCreases(mesh, face.loop);
  const ringLoops = face.loop.vertexIds.map((vertex, edge) => {
    const next = (edge + 1) % count;
    return {
      loop: [vertex, outerIndices[edge]!, outerIndices[next]!, face.loop.vertexIds[next]!],
      creases: [0, 0, 0, faceCreases[edge] ?? 0],
    };
  });

  const droppableVertices = new Set<number>();
  for (const id of region) {
    if (id === face.loop.id) continue;
    for (const vertex of loopById.get(id)!.vertexIds) droppableVertices.add(vertex);
  }
  // 나머지 영역 조각은 영역에서 가장 앞선(ID가 작은) 이웃 면의 재질·부드러움을 이어받는다.
  const restSourceId = [...region].filter((id) => id !== face.loop.id).sort((left, right) => left - right)[0]!;
  const restSource = loopById.get(restSourceId)!;
  const ringIds: number[] = [];
  let removedArea = 0;
  let createdArea = 0;
  for (const loop of context.loops) {
    if (loop.id === face.loop.id) {
      output.keepFace(loop);
      for (const ring of ringLoops) {
        const id = output.addFace(ring.loop, loop, ring.creases);
        if (id === null) {
          return failStudioFaceModeling("unrenderable-result", "ring face cannot be triangulated");
        }
        ringIds.push(id);
        createdArea += polygonAreaOf(ring.loop.map((index) => output.positions[index]!));
      }
      for (const piece of pieces) {
        const indices = piece.map((index) => combined[index]!);
        const creases = piece.map((index, position) => {
          const nextIndex = piece[(position + 1) % piece.length]!;
          if (index >= boundaryIds.length || nextIndex >= boundaryIds.length) return 0;
          return boundary.value.creaseByEdge.get(`${boundaryIds[index]}|${boundaryIds[nextIndex]}`) ?? 0;
        });
        if (output.addFace(indices, restSource, creases) === null) {
          return failStudioFaceModeling("unrenderable-result", "region piece cannot be triangulated");
        }
        createdArea += polygonAreaOf(indices.map((index) => output.positions[index]!));
      }
      continue;
    }
    if (region.has(loop.id)) {
      output.faceRemap.set(loop.id, null);
      removedArea += polygonAreaOf(studioFaceCornerPositions(mesh, loop.vertexIds));
      continue;
    }
    output.keepFace(loop);
  }

  // 사라진 면에만 쓰이던 정점(영역 안쪽 정점)은 떠돌이 정점이 되지 않도록 함께 지운다.
  const used = new Set<number>();
  for (const spec of output.specs) for (const index of spec.loop) used.add(index);
  const keepVertex = output.positions.map((_, index) => used.has(index) || !droppableVertices.has(index));
  const remapIndex = new Map<number, number>();
  const positions: StudioMeshVec3[] = [];
  const vertexCreases: number[] = [];
  output.positions.forEach((position, index) => {
    if (!keepVertex[index]) return;
    remapIndex.set(index, positions.length);
    positions.push(position);
    vertexCreases.push(output.vertexCreases[index] ?? 0);
  });
  const compacted: FaceOutput = {
    ...output,
    positions,
    vertexCreases,
    specs: output.specs.map((spec) => ({ ...spec, loop: spec.loop.map((index) => remapIndex.get(index)!) })),
  };
  return finishOutput(context, compacted, "offset", ringIds, {
    removed: removedArea,
    created: createdArea,
  });
}

/**
 * 한 면의 둘레를 `distance`(양수)만큼 안쪽 또는 바깥쪽으로 오프셋해 새 면 고리를 만든다.
 * 안쪽은 면 하나(안쪽 면 + 고리)로 쪼개고, 바깥쪽은 같은 평면 이웃 영역을 다시 나눠 고리를 만든다.
 * 선택은 새 고리 면들로 옮긴다.
 */
export function offsetStudioEditableMeshFace(
  mesh: StudioEditableMesh,
  faceId: number,
  distance: number,
  direction: StudioOffsetDirection,
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  if (direction === "inward") return insetFaces(mesh, [faceId], distance, "offset");
  if (direction !== "outward") return failStudioFaceModeling("invalid-parameter", "unknown offset direction");
  const invalid = validateStudioFaceModelingDistance(distance);
  if (invalid) return invalid;
  const context = createContext(mesh);
  if (!context.ok) return context;
  const selected = selectedLoops(context.value, [faceId]);
  if (!selected.ok) return selected;
  const face = prepareConvexFace(context.value, selected.value[0]!);
  if (!face.ok) return face;
  return offsetFaceOutward(context.value, face.value, distance);
}

/** 오프셋이 허용하는 최대 거리 범위를 미리 알려 준다(화면의 핸들 범위와 안내에 쓴다). */
export function studioEditableMeshOffsetRange(
  mesh: StudioEditableMesh,
  faceId: number,
  direction: StudioOffsetDirection,
): StudioFaceModelingResult<{ readonly maxDistance: number }> {
  const context = createContext(mesh);
  if (!context.ok) return context;
  const selected = selectedLoops(context.value, [faceId]);
  if (!selected.ok) return selected;
  const face = prepareConvexFace(context.value, selected.value[0]!);
  if (!face.ok) return face;
  if (direction === "inward") {
    const limit = maxInwardOffsetDistance(face.value.polygon, context.value.minFeature);
    return okStudioFaceModeling({
      maxDistance: Number.isFinite(limit) ? limit : STUDIO_FACE_MODELING_LIMITS.maxDistance,
    });
  }
  const region = collectCoplanarRegion(context.value, face.value);
  if (!region.ok) return region;
  if (region.value.size === 1) {
    return failStudioFaceModeling("no-coplanar-region", "no coplanar neighbour faces", { elementIds: [faceId] });
  }
  if (mitreLengthRatio(face.value.polygon) > MAX_MITRE_RATIO) {
    return failStudioFaceModeling("degenerate-input", "a sharp corner would extend the outward offset too far", {
      elementIds: [faceId],
    });
  }
  const boundary = traceRegionBoundary(context.value, region.value);
  if (!boundary.ok) return boundary;
  const boundaryPolygon = studioFaceCornerPositions(mesh, boundary.value.vertexIds)
    .map((point) => projectToStudioPlanarFrame(face.value.frame, point));
  const shape = describeStudioPlanarPolygon(boundaryPolygon);
  if (!shape.convex) return failStudioFaceModeling("unsupported-region", "coplanar region outline is not convex");
  return okStudioFaceModeling({
    maxDistance: maxOutwardOffsetWithin(face.value.polygon, boundaryPolygon, context.value.minFeature),
  });
}

export interface StudioFaceDrawingGuide {
  readonly frame: StudioPlanarFrame;
  /** 면 좌표계(가로 u, 세로 v)의 반시계 윤곽. */
  readonly outline: readonly StudioPlanarPoint[];
  /** 윤곽 꼭짓점의 정점 ID. */
  readonly vertexIds: readonly number[];
  /** 이보다 가까운 점은 겹친 것으로 본다. */
  readonly minFeature: number;
}

/** 면 그리기 화면이 면 윤곽을 그리고 점을 받을 좌표계를 만든다. 그릴 수 없는 면이면 이유를 돌려준다. */
export function describeStudioEditableMeshFaceForDrawing(
  mesh: StudioEditableMesh,
  faceId: number,
): StudioFaceModelingResult<StudioFaceDrawingGuide> {
  const context = createContext(mesh);
  if (!context.ok) return context;
  const selected = selectedLoops(context.value, [faceId]);
  if (!selected.ok) return selected;
  const face = prepareConvexFace(context.value, selected.value[0]!);
  if (!face.ok) return face;
  return okStudioFaceModeling({
    frame: face.value.frame,
    outline: face.value.polygon,
    vertexIds: face.value.loop.vertexIds,
    minFeature: context.value.minFeature,
  });
}

/**
 * 면 안쪽에 점들로 닫힌 볼록 다각형을 그려 면을 나눈다. 점은 `describeStudioEditableMeshFaceForDrawing`이
 * 알려 주는 면 좌표계(가로 u, 세로 v, 단위는 메시 단위)로 받는다.
 *
 * 규칙: 점 3개 이상, 서로 겹치지 않고, 자기 교차하지 않고, 볼록하며 일직선 점이 없어야 한다. 모든 점이
 * 면 경계에서 `minFeature` 이상 떨어진 면 안쪽이어야 한다(경계에 닿거나 밖으로 나가면 거부).
 * 시계·반시계 입력 순서는 모두 받는다.
 */
export function drawStudioEditableMeshFacePolygon(
  mesh: StudioEditableMesh,
  faceId: number,
  points: readonly StudioPlanarPoint[],
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  const context = createContext(mesh);
  if (!context.ok) return context;
  const selected = selectedLoops(context.value, [faceId]);
  if (!selected.ok) return selected;
  const face = prepareConvexFace(context.value, selected.value[0]!);
  if (!face.ok) return face;
  const { minFeature } = context.value;

  if (points.length < 3) return failStudioFaceModeling("degenerate-input", "a shape needs at least three points");
  if (points.length > STUDIO_FACE_MODELING_LIMITS.maxDrawPoints) {
    return failStudioFaceModeling("budget-exceeded", "too many points");
  }
  if (points.some((point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    return failStudioFaceModeling("invalid-parameter", "points must be finite numbers");
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]!;
    if (Math.hypot(next[0] - points[index]![0], next[1] - points[index]![1]) < minFeature) {
      return failStudioFaceModeling("degenerate-input", "two neighbouring points coincide", {
        elementIds: [index, (index + 1) % points.length],
      });
    }
  }
  // 자기 교차·되접힘은 시계/반시계와 무관하게 입력 순서 그대로 판정한다(나비넥타이는 면적이 0이 되기도 한다).
  const raw = describeStudioPlanarPolygon(points);
  if (!raw.simple || raw.spikeCorners.length > 0) {
    const contact = raw.selfContact;
    const elementIds = contact
      ? [...new Set([contact[0], (contact[0] + 1) % points.length, contact[1], (contact[1] + 1) % points.length])]
      : raw.spikeCorners;
    return failStudioFaceModeling("self-intersection", "the drawn outline crosses or touches itself", {
      elementIds,
    });
  }
  if (Math.abs(raw.signedArea) < minFeature * minFeature) {
    return failStudioFaceModeling("degenerate-input", "the drawn shape has no area");
  }
  const counterClockwise = raw.signedArea > 0;
  const drawn = counterClockwise ? [...points] : [...points].reverse();
  const toOriginalIndex = (index: number) => (counterClockwise ? index : points.length - 1 - index);
  const shape = counterClockwise ? raw : describeStudioPlanarPolygon(drawn);
  if (shape.collinearCorners.length > 0) {
    return failStudioFaceModeling("degenerate-input", "three points lie on one line", {
      elementIds: shape.collinearCorners.map(toOriginalIndex).sort((left, right) => left - right),
    });
  }
  if (!shape.convex) {
    return failStudioFaceModeling("non-convex", "the drawn shape must be convex");
  }
  const outside = drawn
    .map((point, index) => ({ index, margin: convexPolygonInsetMargin(face.value.polygon, point) }))
    .filter(({ margin }) => !(margin >= minFeature));
  if (outside.length > 0) {
    return failStudioFaceModeling("out-of-face", "points must lie inside the face, away from its border", {
      elementIds: outside.map(({ index }) => toOriginalIndex(index)).sort((left, right) => left - right),
    });
  }

  const annulus = triangulateConvexAnnulus(face.value.polygon, drawn);
  if (!annulus) {
    return failStudioFaceModeling("self-intersection", "the face around the drawn shape cannot be split");
  }
  const output = createFaceOutput(mesh);
  const loop = face.value.loop;
  const outerCount = loop.vertexIds.length;
  const drawnIndices = drawn
    .map((point) => unprojectFromStudioPlanarFrame(face.value.frame, point))
    .map((point) => output.addVertex(point));
  const combined = [...loop.vertexIds, ...drawnIndices];
  const combinedPolygon = [...face.value.polygon, ...drawn];
  const pieces = mergeStudioPlanarPolygons(
    combinedPolygon,
    annulus.triangles,
    (candidate) => findRenderableStartCorner(
      candidate.map((index) => output.positions[combined[index]!]!),
    ) >= 0,
  );
  const faceCreases = edgeCreases(mesh, loop);
  let created = 0;
  for (const source of context.value.loops) {
    if (source.id !== loop.id) {
      output.keepFace(source);
      continue;
    }
    const innerId = output.addFace(drawnIndices, loop);
    if (innerId === null) {
      return failStudioFaceModeling("unrenderable-result", "the drawn face cannot be triangulated");
    }
    created += polygonAreaOf(drawnIndices.map((index) => output.positions[index]!));
    output.faceRemap.set(loop.id, innerId);
    for (const piece of pieces) {
      const indices = piece.map((index) => combined[index]!);
      const creases = piece.map((index, position) => {
        const nextIndex = piece[(position + 1) % piece.length]!;
        const consecutive = index < outerCount && nextIndex === (index + 1) % outerCount;
        return consecutive ? faceCreases[index] ?? 0 : 0;
      });
      if (output.addFace(indices, loop, creases) === null) {
        return failStudioFaceModeling("unrenderable-result", "a piece around the drawn shape cannot be triangulated");
      }
      created += polygonAreaOf(indices.map((index) => output.positions[index]!));
    }
  }
  const innerFaceId = output.faceRemap.get(loop.id);
  return finishOutput(context.value, output, "draw", innerFaceId === undefined || innerFaceId === null ? [] : [innerFaceId], {
    removed: face.value.frame.area,
    created,
  });
}
