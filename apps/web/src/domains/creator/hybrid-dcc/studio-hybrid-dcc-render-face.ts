import {
  validateStudioHybridDccFanPolygon,
  type StudioHybridDccPolygonPoint3,
} from "./studio-hybrid-dcc-polygon-validation";

/** 내보내기의 정본 loop 시작점만 정렬하며 source의 face.he는 변경하지 않는다. */
export function canonicalStudioHybridDccFaceLoop(
  vertexIds: readonly number[],
  halfEdgeIds: readonly number[],
): { readonly vertexIds: readonly number[]; readonly halfEdgeIds: readonly number[] } {
  let start = 0;
  for (let index = 1; index < vertexIds.length; index += 1) {
    const current = vertexIds[index];
    const best = vertexIds[start];
    const currentEdge = halfEdgeIds[index];
    const bestEdge = halfEdgeIds[start];
    if (current !== undefined && best !== undefined && (current < best
      || (current === best && currentEdge !== undefined && bestEdge !== undefined && currentEdge < bestEdge))) start = index;
  }
  return {
    vertexIds: [...vertexIds.slice(start), ...vertexIds.slice(0, start)],
    halfEdgeIds: [...halfEdgeIds.slice(start), ...halfEdgeIds.slice(0, start)],
  };
}

/** Viewport의 source.he 순서 fan과 같은 비평면 quad 파생 삼각형을 만든다. */
export function triangulateStudioHybridDccRenderQuad(
  vertexIds: readonly number[],
  points: readonly StudioHybridDccPolygonPoint3[],
  faceId: number,
): readonly (readonly [number, number, number])[] {
  const [a, b, c, d] = vertexIds;
  if (vertexIds.length !== 4 || points.length !== 4 || new Set(vertexIds).size !== 4
    || !vertexIds.every((id) => Number.isSafeInteger(id) && id >= 0)
    || a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error(`면 ${faceId}는 검증된 quad 파생 경로가 필요합니다.`);
  }
  validateStudioHybridDccFanPolygon(points, faceId);
  return [[a, b, c], [a, c, d]];
}
