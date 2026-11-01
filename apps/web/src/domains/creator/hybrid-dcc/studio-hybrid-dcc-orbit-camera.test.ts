import { OrthographicCamera, PerspectiveCamera } from "three";
import { OrbitControls } from "three-stdlib";
import { describe, expect, it } from "vitest";

import { preserveStudioHybridDccIdleOrbitCamera } from "./studio-hybrid-dcc-orbit-camera";

function pose(camera: PerspectiveCamera, controls: OrbitControls) {
  return [camera.position.toArray(), camera.quaternion.toArray(), camera.matrix.toArray(),
    camera.matrixWorld.toArray(), camera.matrixWorldInverse.toArray(), controls.target.toArray()];
}
function fixture() {
  const camera = new PerspectiveCamera(42, 1.5, 0.001, 10000);
  camera.position.set(1.9042918017738137, 2.143269521812661, 2.5428717918853883);
  const controls = new OrbitControls(camera);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.update(); camera.updateMatrixWorld();
  return { camera, controls };
}
describe("공간 모델러 idle Orbit 카메라", () => {
  it("change가 없는 반복 갱신과 후속 표시 프레임의 pose를 exact 보존한다", () => {
    const { camera, controls } = fixture();
    const restore = preserveStudioHybridDccIdleOrbitCamera(controls), before = pose(camera, controls);
    let changes = 0; controls.addEventListener("change", () => { changes++; });
    for (let index = 0; index < 500; index++) { controls.update(); camera.updateMatrixWorld(); }
    expect(changes).toBe(0); expect(pose(camera, controls)).toEqual(before);
    restore(); controls.dispose();
  });
  it("실제 Orbit 이동의 change와 damping 결과는 원래 controls와 동일하다", () => {
    const actual = fixture(), expected = fixture();
    const restore = preserveStudioHybridDccIdleOrbitCamera(actual.controls);
    let changes = 0; actual.controls.addEventListener("change", () => { changes++; });
    actual.controls.setAzimuthalAngle(0.2); expected.controls.setAzimuthalAngle(0.2);
    for (let index = 0; index < 12; index++) {
      actual.controls.update(); expected.controls.update();
      actual.camera.updateMatrixWorld(); expected.camera.updateMatrixWorld();
      expect(pose(actual.camera, actual.controls)).toEqual(pose(expected.camera, expected.controls));
    }
    expect(changes).toBeGreaterThan(0);
    restore(); actual.controls.dispose(); expected.controls.dispose();
  });
  it("change 기준 아래여도 반올림 오차보다 큰 실제 입력은 보존한다", () => {
    const actual = fixture(), expected = fixture(), before = actual.camera.position.clone();
    const restore = preserveStudioHybridDccIdleOrbitCamera(actual.controls);
    let changes = 0; actual.controls.addEventListener("change", () => { changes++; });
    const angle = actual.controls.getAzimuthalAngle() + 0.00001;
    actual.controls.setAzimuthalAngle(angle); expected.controls.setAzimuthalAngle(angle);
    actual.camera.updateMatrixWorld(); expected.camera.updateMatrixWorld();
    expect(changes).toBe(0); expect(actual.camera.position.distanceTo(before)).toBeGreaterThan(0.000001);
    expect(pose(actual.camera, actual.controls)).toEqual(pose(expected.camera, expected.controls));
    restore(); actual.controls.dispose(); expected.controls.dispose();
  });
  it("외부의 명시적 pose 변경은 유지하고 정리하면 원래 update로 복구한다", () => {
    const { camera, controls } = fixture(), original = controls.update;
    const restore = preserveStudioHybridDccIdleOrbitCamera(controls);
    camera.position.set(3, 4, 5); controls.target.set(0.3, 0.2, 0.1);
    controls.update(); camera.updateMatrixWorld();
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(5);
    expect(controls.target.toArray()).toEqual([0.3, 0.2, 0.1]);
    restore(); expect(controls.update).toBe(original); controls.dispose();
  });
  it("직교 카메라의 실제 줌과 projection 갱신도 원래 controls와 동일하다", () => {
    const actual = new OrthographicCamera(-2, 2, 2, -2, 0.001, 10000), expected = actual.clone();
    actual.position.set(3, 4, 5); expected.position.copy(actual.position);
    const controls = new OrbitControls(actual), original = new OrbitControls(expected);
    const restore = preserveStudioHybridDccIdleOrbitCamera(controls);
    controls.dollyIn(0.9); original.dollyIn(0.9); controls.update(); original.update();
    expect(actual.zoom).toBe(expected.zoom); expect(actual.zoom).not.toBe(1);
    expect(actual.projectionMatrix.toArray()).toEqual(expected.projectionMatrix.toArray());
    expect(actual.position.toArray()).toEqual(expected.position.toArray());
    restore(); controls.dispose(); original.dispose();
  });
});
