import { validateStudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

const cache = new WeakMap<StudioEditableMesh, Float32Array>();

/** 원본 face.he fan의 코너 순서를 유지해 화면 hit.faceIndex와 UV가 같은 삼각형을 가리킨다. */
export function deriveStudioHybridDccTriangleCornerUvs(mesh: StudioEditableMesh): Float32Array | undefined {
  if (!mesh.uvLayer) return undefined;
  const previous = cache.get(mesh);
  if (previous) return previous;
  const invalid = validateStudioMeshUvLayer(mesh);
  if (invalid) throw new Error(invalid);
  const values: number[] = [];
  for (const face of mesh.faces) {
    const loop: number[] = [];
    let id = face.he;
    do {
      loop.push(id);
      const edge = mesh.halfEdges[id];
      if (!edge || loop.length > mesh.halfEdges.length) throw new Error("UV 원본 면의 순환을 확인할 수 없습니다.");
      id = edge.next;
    } while (id !== face.he);
    for (let index = 1; index + 1 < loop.length; index += 1) {
      for (const cornerId of [loop[0], loop[index], loop[index + 1]]) {
        const corner = cornerId === undefined ? undefined : mesh.uvLayer.corners[cornerId];
        if (!corner) throw new Error("UV 삼각형의 원본 코너를 확인할 수 없습니다.");
        values.push(corner.u, corner.v);
      }
    }
  }
  const result = Float32Array.from(values);
  cache.set(mesh, result);
  return result;
}
