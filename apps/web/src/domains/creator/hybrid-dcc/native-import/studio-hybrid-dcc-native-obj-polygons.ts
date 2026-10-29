/** OBJ의 원본 corner 색인을 유지하는 검증·삼각화. collinear UV 코너를 삭제하지 않는다. */
import { validateStudioHybridDccFanPolygon, type StudioHybridDccPolygonPoint3 } from "../studio-hybrid-dcc-polygon-validation";

export interface StudioNativeObjPolygonBudget { spend(amount?: number): void }
type Point2 = readonly [number, number];
function cross(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function onSegment(a: Point2, b: Point2, p: Point2, epsilon: number): boolean {
  return Math.abs(cross(a, b, p)) <= epsilon && p[0] >= Math.min(a[0], b[0]) - epsilon
    && p[0] <= Math.max(a[0], b[0]) + epsilon && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon;
}
function intersects(a: Point2, b: Point2, c: Point2, d: Point2, epsilon: number): boolean {
  const x = cross(a, b, c); const y = cross(a, b, d); const z = cross(c, d, a); const w = cross(c, d, b);
  return (x * y < 0 && z * w < 0) || onSegment(a, b, c, epsilon) || onSegment(a, b, d, epsilon)
    || onSegment(c, d, a, epsilon) || onSegment(c, d, b, epsilon);
}

/** 결과 배열은 원본 face의 corner 색인이다. 원본 다각형을 그대로 둘 수 있으면 한 loop다. */
export function studioNativeObjPolygonLoops(points: readonly StudioHybridDccPolygonPoint3[], budget: StudioNativeObjPolygonBudget): readonly (readonly number[])[] {
  if (points.length < 3 || points.length > 4096) throw new Error("OBJ 면은 3개 이상 4096개 이하의 코너여야 합니다.");
  budget.spend(points.length * points.length);
  try {
    validateStudioHybridDccFanPolygon(points, 0);
    validateStudioHybridDccFanPolygon(points.map(([x, y, z]) => [Math.fround(x), Math.fround(y), Math.fround(z)]), 0);
    return [points.map((_, index) => index)];
  } catch {
    // 안전한 source polygon이 아니면 평면·단순성을 검증한 ear clipping만 허용한다.
  }
  const anchor = points[0]!;
  let nx = 0; let ny = 0; let nz = 0; let span = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!; const b = points[(index + 1) % points.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    span = Math.max(span, Math.abs(a[0] - anchor[0]), Math.abs(a[1] - anchor[1]), Math.abs(a[2] - anchor[2]));
  }
  const length = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(length) || length <= 1e-10) throw new Error("OBJ 면의 면적이 0이거나 방향을 정할 수 없습니다.");
  const normal = [nx / length, ny / length, nz / length] as const;
  if (points.some((point) => Math.abs((point[0] - anchor[0]) * normal[0] + (point[1] - anchor[1]) * normal[1] + (point[2] - anchor[2]) * normal[2]) > Math.max(1e-7, span * 1e-5))) {
    throw new Error("이 OBJ 비평면 다각형은 검증된 편집 삼각화로 표현할 수 없습니다.");
  }
  const axis = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
  const projected: readonly Point2[] = points.map(([x, y, z]) => axis === 0 ? [y, z] : axis === 1 ? [x, z] : [x, y]);
  const epsilon = Math.max(1e-10, span * span * 1e-10);
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = projected[index]!; const b = projected[(index + 1) % projected.length]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-12) throw new Error("OBJ 면에 길이 0인 모서리가 있습니다.");
    twiceArea += a[0] * b[1] - b[0] * a[1];
    for (let other = index + 1; other < projected.length; other += 1) {
      budget.spend(); const next = (other + 1) % projected.length;
      if (other === (index + 1) % projected.length || next === index) continue;
      if (intersects(a, b, projected[other]!, projected[next]!, epsilon)) throw new Error("OBJ 면이 자기 교차하여 가져올 수 없습니다.");
    }
  }
  if (Math.abs(twiceArea) <= epsilon) throw new Error("OBJ 면의 투영 면적이 0입니다.");
  const winding = Math.sign(twiceArea);
  const remaining = points.map((_, index) => index);
  const triangles: Array<readonly [number, number, number]> = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      budget.spend();
      const a = remaining[(cursor + remaining.length - 1) % remaining.length]!;
      const b = remaining[cursor]!; const c = remaining[(cursor + 1) % remaining.length]!;
      if (cross(projected[a]!, projected[b]!, projected[c]!) * winding <= epsilon) continue;
      let contains = false;
      for (const id of remaining) {
        budget.spend(); if (id === a || id === b || id === c) continue;
        const p = projected[id]!;
        if (cross(projected[a]!, projected[b]!, p) * winding >= -epsilon
          && cross(projected[b]!, projected[c]!, p) * winding >= -epsilon
          && cross(projected[c]!, projected[a]!, p) * winding >= -epsilon) { contains = true; break; }
      }
      if (!contains) { triangles.push([a, b, c]); remaining.splice(cursor, 1); clipped = true; break; }
    }
    if (!clipped) throw new Error("OBJ 면의 모든 코너를 보존하는 삼각화를 찾지 못했습니다.");
  }
  const [a, b, c] = remaining;
  if (a === undefined || b === undefined || c === undefined || cross(projected[a]!, projected[b]!, projected[c]!) * winding <= epsilon) throw new Error("OBJ 삼각화의 마지막 면이 퇴화합니다.");
  triangles.push([a, b, c]);
  const used = new Set(triangles.flat());
  if (used.size !== points.length) throw new Error("OBJ 삼각화에서 원본 코너가 누락됐습니다.");
  let area = 0;
  for (const triangle of triangles) {
    budget.spend(9); validateStudioHybridDccFanPolygon(triangle.map((id) => points[id]!), 0);
    validateStudioHybridDccFanPolygon(triangle.map((id) => { const p = points[id]!; return [Math.fround(p[0]), Math.fround(p[1]), Math.fround(p[2])]; }), 0);
    area += cross(projected[triangle[0]]!, projected[triangle[1]]!, projected[triangle[2]]!);
  }
  if (Math.abs(area - twiceArea) > Math.max(Math.abs(twiceArea) * 1e-8, epsilon * points.length)) throw new Error("OBJ 삼각화가 원본 면적을 보존하지 못했습니다.");
  return triangles;
}
