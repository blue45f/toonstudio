import {
  STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES,
  STUDIO_HYBRID_DCC_MAX_POLYGON_PAIR_WORK_PER_ASSET,
  validateStudioHybridDccFanPolygon,
  type StudioHybridDccPolygonPoint3,
} from "./studio-hybrid-dcc-polygon-validation";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

/** 표시 가능했던 면을 사라지게 하는 좌표 편집만 막고 기존 미지원 면은 다시 판정하지 않는다. */
export function validateStudioHybridDccComponentRenderAdmission(
  source: StudioEditableMesh,
  result: StudioEditableMesh,
): void {
  if (source.faces !== result.faces || source.halfEdges !== result.halfEdges
    || source.vertices.length !== result.vertices.length) {
    throw new Error("요소 변형의 원본 면·모서리 연결이 바뀌었습니다.");
  }
  let pairWork = 0;
  const validate = (points: readonly StudioHybridDccPolygonPoint3[], faceId: number): string | null => {
    pairWork += points.length * points.length;
    if (pairWork > STUDIO_HYBRID_DCC_MAX_POLYGON_PAIR_WORK_PER_ASSET) {
      throw new Error("요소 변형의 다각형 교차 검사 예산을 초과했습니다. 선택 범위를 나누어 적용하세요.");
    }
    try { validateStudioHybridDccFanPolygon(points, faceId); return null; }
    catch (error) { return error instanceof Error ? error.message : "면의 표시 조건을 확인하지 못했습니다."; }
  };

  for (const face of source.faces) {
    const original: StudioHybridDccPolygonPoint3[] = [];
    const transformed: StudioHybridDccPolygonPoint3[] = [];
    let changed = false;
    let current = face.he;
    do {
      const edge = source.halfEdges[current];
      const origin = edge ? source.halfEdges[edge.prev]?.vertex : undefined;
      const before = origin === undefined ? undefined : source.vertices[origin]?.position;
      const after = origin === undefined ? undefined : result.vertices[origin]?.position;
      if (!edge || !before || !after) throw new Error(`면 ${face.id}의 변형 전후 정점을 확인하지 못했습니다.`);
      original.push([before.x, before.y, before.z]);
      transformed.push([after.x, after.y, after.z]);
      changed ||= before.x !== after.x || before.y !== after.y || before.z !== after.z;
      current = edge.next;
      // 위상은 불변이므로 원본도 이미 같은 viewport cap을 초과한 면이다.
      if (original.length > STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES) break;
    } while (current !== face.he);
    if (!changed || original.length > STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES) continue;
    const error = validate(transformed, face.id);
    if (error && validate(original, face.id) === null) {
      throw new Error(`면 ${face.id}가 변형 후 화면에 표시될 수 없습니다. ${error}`);
    }
  }
}
