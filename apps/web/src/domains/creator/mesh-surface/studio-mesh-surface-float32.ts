/** 원본 삼각형이 실제 Float32 위치에서 새로 접히거나 방향을 잃는지 검사한다. */
import type { StudioEditableVertex, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

import { surfaceIssue, surfacePass, surfaceStop, type StudioMeshSurfaceResult } from "./studio-mesh-surface-contracts";

type Vec = readonly [number, number, number];
function edge(a: Vec, b: Vec): Vec { return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }
function normal(a: Vec, b: Vec, c: Vec): Vec | null {
  const u = edge(a, b), v = edge(a, c), su = Math.max(...u.map(Math.abs)), sv = Math.max(...v.map(Math.abs));
  if (!Number.isFinite(su) || !Number.isFinite(sv) || su === 0 || sv === 0) return null;
  // 원본의 큰 좌표에서도 cross의 overflow가 판정을 바꾸지 않도록 양수 스케일만 제거한다.
  const x = u[0] / su, y = u[1] / su, z = u[2] / su, p = v[0] / sv, q = v[1] / sv, r = v[2] / sv;
  const cross: Vec = [y * r - z * q, z * p - x * r, x * q - y * p], length = Math.hypot(...cross);
  return Number.isFinite(length) && length > 0 ? [cross[0] / length, cross[1] / length, cross[2] / length] : null;
}
function values(position: StudioMeshVec3): Vec { return [position.x, position.y, position.z]; }

export function validateStudioMeshSurfaceFloat32Triangles(
  triangles: readonly (readonly [number, number, number])[],
  vertexById: ReadonlyMap<number, StudioEditableVertex>,
  faceId?: number,
): StudioMeshSurfaceResult<null> {
  for (const ids of triangles) {
    const vertices = ids.map((id) => vertexById.get(id)); const a = vertices[0], b = vertices[1], c = vertices[2];
    if (!a || !b || !c) return surfaceStop(surfaceIssue("error", "invalid-input", "표면 삼각형의 원본 정점이 없습니다."));
    const source: readonly [Vec, Vec, Vec] = [values(a.position), values(b.position), values(c.position)];
    if (source.some((point) => point.some((value) => !Number.isFinite(value)))) return surfaceStop(surfaceIssue("error", "position-non-finite", "표면 원본 정점이 유한하지 않습니다."));
    const sourceNormal = normal(source[0], source[1], source[2]);
    if (!sourceNormal) return surfaceStop(surfaceIssue("error", "face-zero-area", "표면 원본 삼각형 자체가 퇴화하여 면 방향을 확인할 수 없습니다."));
    const target = source.map(([x, y, z]): Vec => [Math.fround(x), Math.fround(y), Math.fround(z)]);
    // 기존 GLB overflow 진단의 코드·문구·ID 필드 유무를 그대로 보존한다.
    if (target.some((point) => point.some((value) => !Number.isFinite(value)))) return surfaceStop(surfaceIssue("error", "position-float32-overflow", "A source position cannot be represented as float32"));
    const first = target[0], second = target[1], third = target[2]; if (!first || !second || !third) return surfaceStop(surfaceIssue("error", "invalid-input", "Float32 삼각형이 없습니다."));
    const targetNormal = normal(first, second, third);
    const collapsedEdge = target.some((point, index) => {
      const next = target[(index + 1) % 3]; return next !== undefined && point.every((value, axis) => value === next[axis]);
    });
    const dot = targetNormal ? sourceNormal[0] * targetNormal[0] + sourceNormal[1] * targetNormal[1] + sourceNormal[2] * targetNormal[2] : 0;
    if (collapsedEdge || !targetNormal || dot <= 0) return surfaceStop(surfaceIssue("error", "position-float32-collapse",
      "원본 표면의 모서리·면적 또는 면 방향이 Float32 변환에서 새로 소실되어 작업을 취소했습니다.",
      { vertexIds: ids, ...(faceId === undefined ? {} : { faceIds: [faceId] }) }));
  }
  return surfacePass(null);
}
