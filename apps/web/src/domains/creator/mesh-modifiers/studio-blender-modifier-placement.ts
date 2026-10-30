import type { StudioEditableMesh, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import type { StudioMeshArrayModifier } from "./studio-mesh-modifier-types";

/** Array 직전 메시의 로컬 크기를 사용한다. 오브젝트 변환은 렌더/장면 권위가 적용한다. */
export function studioBlenderArrayStep(mesh: StudioEditableMesh, modifier: StudioMeshArrayModifier): StudioMeshVec3 {
  const step = modifier.useConstantOffset === false ? { x: 0, y: 0, z: 0 } : { ...modifier.offset };
  if (!modifier.useRelativeOffset || modifier.mode !== "linear" || mesh.vertices.length === 0) return step;
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { position } of mesh.vertices) {
    for (const axis of ["x", "y", "z"] as const) {
      minimum[axis] = Math.min(minimum[axis], position[axis]);
      maximum[axis] = Math.max(maximum[axis], position[axis]);
    }
  }
  const relative = modifier.relativeOffset ?? { x: 1, y: 0, z: 0 };
  return { x: step.x + (maximum.x - minimum.x) * relative.x,
    y: step.y + (maximum.y - minimum.y) * relative.y,
    z: step.z + (maximum.z - minimum.z) * relative.z };
}

/** Blender 5.2 실측: 부호 있는 중심 이동과 절대 두께를 분리해 면 방향을 보존한다. */
export function studioBlenderSolidifyDistances(distance: number, offset: number): readonly [number, number] {
  const center = distance * offset / 2;
  const half = Math.abs(distance) / 2;
  return [center + half, center - half];
}
