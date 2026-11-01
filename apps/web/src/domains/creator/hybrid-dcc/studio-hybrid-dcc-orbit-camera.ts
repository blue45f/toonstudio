import { Matrix4, Quaternion, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";

const roundoffOnly = (a: number, b: number) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
const vectorRoundoffOnly = (a: Vector3, b: Vector3) => roundoffOnly(a.x, b.x) && roundoffOnly(a.y, b.y) && roundoffOnly(a.z, b.z);
const matrixRoundoffOnly = (a: Matrix4, b: Matrix4) => a.elements.every((value, index) => {
  const before = b.elements[index]; return before !== undefined && roundoffOnly(value, before);
});

/** change 없는 갱신 중 부동소수점 재계산 오차만 접고 실제 작은 이동은 보존한다. */
export function preserveStudioHybridDccIdleOrbitCamera(controls: OrbitControls): () => void {
  const update = controls.update, camera = controls.object;
  const position = new Vector3(), quaternion = new Quaternion(), target = new Vector3();
  const matrix = new Matrix4(), world = new Matrix4(), inverse = new Matrix4(), projection = new Matrix4();
  let changed = false;
  const onChange = () => { changed = true; };
  controls.addEventListener("change", onChange);
  const stableUpdate: typeof update = () => {
    position.copy(camera.position); quaternion.copy(camera.quaternion); target.copy(controls.target);
    matrix.copy(camera.matrix); world.copy(camera.matrixWorld); inverse.copy(camera.matrixWorldInverse);
    projection.copy(camera.projectionMatrix);
    const needsUpdate = camera.matrixWorldNeedsUpdate, zoom = camera.zoom;
    changed = false;
    const result = update.call(controls);
    if (!changed && zoom === camera.zoom && projection.equals(camera.projectionMatrix)
      && vectorRoundoffOnly(camera.position, position) && vectorRoundoffOnly(controls.target, target)
      && roundoffOnly(camera.quaternion.x, quaternion.x) && roundoffOnly(camera.quaternion.y, quaternion.y)
      && roundoffOnly(camera.quaternion.z, quaternion.z) && roundoffOnly(camera.quaternion.w, quaternion.w)
      && matrixRoundoffOnly(camera.matrix, matrix) && matrixRoundoffOnly(camera.matrixWorld, world)
      && matrixRoundoffOnly(camera.matrixWorldInverse, inverse)) {
      camera.position.copy(position); camera.quaternion.copy(quaternion); controls.target.copy(target);
      camera.matrix.copy(matrix); camera.matrixWorld.copy(world); camera.matrixWorldInverse.copy(inverse);
      camera.matrixWorldNeedsUpdate = needsUpdate;
    }
    return result;
  };
  controls.update = stableUpdate;
  return () => {
    controls.removeEventListener("change", onChange);
    if (controls.update === stableUpdate) controls.update = update;
  };
}
