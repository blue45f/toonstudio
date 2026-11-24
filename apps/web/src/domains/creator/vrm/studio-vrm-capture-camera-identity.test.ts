import { expect, it } from "vitest";

import { pauseStudioVrmCaptureOrbit } from "./StudioVrmPoserTypes";
import { studioVrmCaptureCameraIdentity } from "./studio-vrm-poser-helpers";
import type { StudioVrmCameraSettings } from "./studio-vrm-scene-document";

it("궤도 수치 잔차만 있는 두 프레임은 같은 캡처로 인정하고 실제 구도·렌즈 변경은 구별한다", () => {
  const camera: StudioVrmCameraSettings = {
    projection: "perspective",
    position: [0.016181385601902937, 4.33979430014875, -0.005974872418014947],
    target: [0.016184937836283497, 0.782492808552386, -0.005974682615992585],
    up: [0, 1, 0], fovDegrees: 30, near: 0.017786507457990725, far: 20,
  };
  const original = studioVrmCaptureCameraIdentity(camera);
  expect(studioVrmCaptureCameraIdentity({
    ...camera, position: [0.016181385602875457, camera.position[1], -0.005974872436215215],
  })).toBe(original);
  expect(studioVrmCaptureCameraIdentity({ ...camera, position: [0.02, camera.position[1], camera.position[2]] })).not.toBe(original);
  expect(studioVrmCaptureCameraIdentity({ ...camera, fovDegrees: 31 })).not.toBe(original);
  expect(studioVrmCaptureCameraIdentity(null)).toBeNull();
});

it("캡처 전에 켜져 있던 궤도만 재개하고 이전 캡처 종료로 새 잠금을 풀지 않는다", () => {
  const controls = { enabled: true };
  const resume = pauseStudioVrmCaptureOrbit(controls);
  expect(controls.enabled).toBe(false);
  resume();
  expect(controls.enabled).toBe(true);
  controls.enabled = false;
  resume();
  pauseStudioVrmCaptureOrbit(controls)();
  expect(controls.enabled).toBe(false);
});
