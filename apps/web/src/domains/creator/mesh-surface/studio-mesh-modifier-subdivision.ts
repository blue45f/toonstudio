/** 기존 삼각 midpoint 4분할의 parent-child 순서를 속성과 함께 유지한다. */
import type { StudioModifierTriangleSurface } from "./studio-mesh-modifier-surface";
import type { deriveStudioModifierSurfaceInput } from "./studio-mesh-modifier-surface-input";
import type { StudioModifierUv } from "../mesh-uv/studio-mesh-modifier-uv";

type Input = ReturnType<typeof deriveStudioModifierSurfaceInput>;

export function countStudioModifierSubdivisionVertices(input: Input): number {
  const edges = new Set<string>();
  for (let write = 0; write < input.indices.length; write += 3) for (let corner = 0; corner < 3; corner += 1) {
    const a = input.indices[write + corner], b = input.indices[write + (corner + 1) % 3];
    if (a === undefined || b === undefined) throw new Error("세분화의 원본 삼각형이 없습니다.");
    edges.add(`${Math.min(a, b)}|${Math.max(a, b)}`);
  }
  return input.positions.length / 3 + edges.size;
}

function children(parent: StudioModifierTriangleSurface): readonly StudioModifierTriangleSurface[] {
  const [a, b, c] = parent.corners;
  const corner = (vertexCrease: number, edgeCrease: number) => ({ vertexCrease, edgeCrease });
  const face = (...corners: StudioModifierTriangleSurface["corners"]): StudioModifierTriangleSurface => ({ materialSlot: parent.materialSlot, smooth: parent.smooth, corners });
  // a/ab/ca, ab/b/bc, ca/bc/c, ab/bc/ca. midpoint는 새 정점이며 내부 변도 새 변이다.
  return [
    face(corner(a.vertexCrease, a.edgeCrease), corner(0, 0), corner(0, c.edgeCrease)),
    face(corner(0, a.edgeCrease), corner(b.vertexCrease, b.edgeCrease), corner(0, 0)),
    face(corner(0, 0), corner(0, b.edgeCrease), corner(c.vertexCrease, c.edgeCrease)),
    face(corner(0, 0), corner(0, 0), corner(0, 0)),
  ];
}

export function subdivideStudioModifierSurface(input: Input, smooth: boolean) {
  if (input.indices.length % 3 !== 0 || input.surfaces.length * 3 !== input.indices.length
    || (input.uvs !== undefined && input.uvs.length !== input.indices.length)) throw new Error("세분화의 parent 코너 대응 수가 다릅니다.");
  const edgeMid = new Map<string, number>();
  const positions: number[] = [...input.positions], indices: number[] = [];
  const surfaces: StudioModifierTriangleSurface[] = [], uvs: StudioModifierUv[] | undefined = input.uvs ? [] : undefined;
  const midOf = (a: number, b: number) => {
    const key = `${Math.min(a, b)}|${Math.max(a, b)}`, previous = edgeMid.get(key);
    if (previous !== undefined) return previous;
    const index = positions.length / 3;
    for (let axis = 0; axis < 3; axis += 1) positions.push(((input.positions[a * 3 + axis] ?? NaN) + (input.positions[b * 3 + axis] ?? NaN)) / 2);
    edgeMid.set(key, index); return index;
  };
  for (let write = 0; write < input.indices.length; write += 3) {
    const a = input.indices[write], b = input.indices[write + 1], c = input.indices[write + 2], parent = input.surfaces[write / 3];
    if (a === undefined || b === undefined || c === undefined || !parent) throw new Error("세분화의 parent 삼각형이 없습니다.");
    const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); surfaces.push(...children(parent));
    if (uvs && input.uvs) {
      const ua = input.uvs[write], ub = input.uvs[write + 1], uc = input.uvs[write + 2];
      if (!ua || !ub || !uc) throw new Error("세분화의 원본 UV 코너가 없습니다.");
      const midpoint = (left: StudioModifierUv, right: StudioModifierUv) => ({ u: Math.fround((left.u + right.u) / 2), v: Math.fround((left.v + right.v) / 2) });
      const uab = midpoint(ua, ub), ubc = midpoint(ub, uc), uca = midpoint(uc, ua);
      uvs.push(ua, uab, uca, uab, ub, ubc, uca, ubc, uc, uab, ubc, uca);
    }
  }
  // 기존 이웃 평균의 방문·합산 순서를 유지한다. crease로 위치를 계산하는 알고리즘은 아니다.
  if (smooth) {
    const vertexCount = input.positions.length / 3, accum = new Float64Array(vertexCount * 3), degree = new Uint32Array(vertexCount);
    for (let write = 0; write < input.indices.length; write += 3) for (let corner = 0; corner < 3; corner += 1) {
      const a = input.indices[write + corner], b = input.indices[write + (corner + 1) % 3];
      if (a === undefined || b === undefined) throw new Error("세분화의 이웃 정점이 없습니다.");
      for (let axis = 0; axis < 3; axis += 1) accum[a * 3 + axis] = (accum[a * 3 + axis] ?? 0) + (input.positions[b * 3 + axis] ?? NaN);
      degree[a] = (degree[a] ?? 0) + 1;
    }
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const count = degree[vertex]; if (!count) continue;
      for (let axis = 0; axis < 3; axis += 1) positions[vertex * 3 + axis] = (input.positions[vertex * 3 + axis] ?? NaN) * .5 + ((accum[vertex * 3 + axis] ?? NaN) / count) * .5;
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), surfaces, uvs };
}
