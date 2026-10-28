/** flat/smooth 면을 원본 fan 코너 순서의 표시 법선으로 투영한다. */
import { validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

type Vec = readonly [number, number, number];
const cache = new WeakMap<StudioEditableMesh, Float32Array>();
function unit(value: Vec): Vec {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length) || length <= 1e-12) throw new Error("혼합 음영의 면 법선을 안정적으로 계산하지 못했습니다.");
  return [value[0] / length, value[1] / length, value[2] / length];
}
function faceNormal(points: readonly Vec[]): Vec {
  let x = 0; let y = 0; let z = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]; const b = points[(index + 1) % points.length];
    if (!a || !b) throw new Error("혼합 음영의 면 코너가 없습니다.");
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

/** UV seam에 위치를 나누기 전, 서로 맞닿은 smooth 면끼리만 원본 정점에서 묶는다. */
export function deriveStudioHybridDccSplitCornerNormals(mesh: StudioEditableMesh): Float32Array {
  const previous = cache.get(mesh); if (previous) return previous;
  const valid = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!valid.ok) throw new Error(valid.detail);
  if (mesh.vertices.some(({ crease }) => crease !== 0) || mesh.halfEdges.some(({ crease }) => crease !== 0)) {
    throw new Error("crease 음영은 별도 smoothing-island 계약이 필요합니다.");
  }
  const parent = Int32Array.from(mesh.halfEdges, ({ id }) => id);
  const rank = new Uint8Array(parent.length);
  const root = (id: number): number => {
    let found = id;
    while (parent[found] !== found) { const next = parent[found]; if (next === undefined) throw new Error("음영 코너 ID가 잘못됐습니다."); found = next; }
    while (id !== found) { const next = parent[id]; if (next === undefined) throw new Error("음영 연결이 잘못됐습니다."); parent[id] = found; id = next; }
    return found;
  };
  const join = (first: number, second: number) => {
    let a = root(first); let b = root(second); if (a === b) return;
    if ((rank[a] ?? 0) < (rank[b] ?? 0)) [a, b] = [b, a];
    parent[b] = a; if (rank[a] === rank[b]) rank[a] = (rank[a] ?? 0) + 1;
  };
  for (const edge of mesh.halfEdges) {
    const twin = edge.twin < 0 ? undefined : mesh.halfEdges[edge.twin];
    if (!twin || twin.id < edge.id || !mesh.faces[edge.face]?.smooth || !mesh.faces[twin.face]?.smooth) continue;
    join(edge.id, twin.next); join(edge.next, twin.id);
  }
  const loops: number[][] = [];
  const rawNormals: Vec[] = [];
  const pointsByFace: Vec[][] = [];
  let cornerCount = 0;
  for (const face of mesh.faces) {
    const ids: number[] = []; const points: Vec[] = [];
    let id = face.he;
    do {
      const edge = mesh.halfEdges[id]; const previousEdge = edge ? mesh.halfEdges[edge.prev] : undefined;
      const point = previousEdge ? mesh.vertices[previousEdge.vertex]?.position : undefined;
      if (!edge || !point || ids.length >= mesh.halfEdges.length) throw new Error("혼합 음영의 원본 코너 순환이 잘못됐습니다.");
      ids.push(id); points.push([point.x, point.y, point.z]); id = edge.next;
    } while (id !== face.he);
    const normal = faceNormal(points); unit(normal);
    loops.push(ids); rawNormals.push(normal); pointsByFace.push(points); cornerCount += (ids.length - 2) * 3;
  }
  const sums = new Map<number, [number, number, number]>();
  for (const face of mesh.faces) {
    if (!face.smooth) continue;
    const ids = loops[face.id]; const normal = rawNormals[face.id];
    if (!ids || !normal) throw new Error("혼합 음영의 원본 면이 없습니다.");
    for (const id of ids) {
      const key = root(id); const sum: [number, number, number] = sums.get(key) ?? [0, 0, 0];
      sum[0] += normal[0]; sum[1] += normal[1]; sum[2] += normal[2]; sums.set(key, sum);
    }
  }
  const smooth = new Map<number, Vec>(); for (const [id, sum] of sums) smooth.set(id, unit(sum));
  const normals = new Float32Array(cornerCount * 3); let write = 0;
  for (const face of mesh.faces) {
    const ids = loops[face.id]; const points = pointsByFace[face.id];
    if (!ids || !points) throw new Error("혼합 음영의 삼각형 원본이 없습니다.");
    for (let index = 1; index + 1 < ids.length; index += 1) {
      const indices = [0, index, index + 1];
      const triangle = indices.map((corner) => points[corner]);
      if (triangle.some((point) => !point)) throw new Error("혼합 음영의 삼각형 코너가 없습니다.");
      const a = triangle[0]; const b = triangle[1]; const c = triangle[2];
      if (!a || !b || !c) throw new Error("혼합 음영의 삼각형이 없습니다.");
      const flat = unit(faceNormal([a, b, c]));
      for (const corner of indices) {
        const id = ids[corner]; const normal = face.smooth && id !== undefined ? smooth.get(root(id)) : flat;
        if (!normal) throw new Error("혼합 음영의 smooth 코너 법선이 없습니다.");
        normals.set(normal, write); write += 3;
      }
    }
  }
  cache.set(mesh, normals); return normals;
}
