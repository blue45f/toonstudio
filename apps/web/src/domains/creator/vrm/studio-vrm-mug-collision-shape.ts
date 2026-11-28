import { Box3, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Triangle, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import type { Object3D } from "three";
import type { GripMeshSolid } from "./studio-vrm-grip-body-surface";

/** 손잡이 구멍과 컵 테두리를 채우지 않고, 실제 GLB의 삼각형과 옷감 사이에서만 간섭을 판정한다. */
export function* mugCollisionSolid(root: Object3D): Generator<void, GripMeshSolid[]> {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), solids: GripMeshSolid[] = [], parts: Mesh[] = [];
  const point = new Vector3();
  root.traverseVisible(node => { if (node instanceof Mesh) parts.push(node); });
  for (const node of parts) {
    yield;
    const positions: number[] = [];
    const geometry: BufferGeometry = node.geometry;
    const vertices = geometry.getAttribute("position");
    if (!vertices) continue;
    const transform = new Matrix4().multiplyMatrices(inverse, node.matrixWorld);
    for (let i = 0; i < vertices.count; i++) {
      if (i % 256 === 0) yield;
      point.fromBufferAttribute(vertices, i).applyMatrix4(transform);
      positions.push(point.x, point.y, point.z);
    }
    const local = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
    if (geometry.index) local.setIndex(geometry.index.clone());
    yield;
    const tree = new MeshBVH(local);
    const candidate = new Triangle(), region = new Box3();
    solids.push({
      bounds: tree.getBoundingBox(new Box3()),
      intersects(triangle, offset) {
        candidate.copy(triangle);
        candidate.a.sub(offset); candidate.b.sub(offset); candidate.c.sub(offset);
        region.makeEmpty().expandByPoint(candidate.a).expandByPoint(candidate.b).expandByPoint(candidate.c);
        return tree.shapecast({
          intersectsBounds: box => region.intersectsBox(box),
          intersectsTriangle: face => face.intersectsTriangle(candidate),
        });
      },
    });
  }
  return solids;
}
