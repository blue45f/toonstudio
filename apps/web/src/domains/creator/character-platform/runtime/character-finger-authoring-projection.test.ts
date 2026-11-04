import fs from "node:fs";

import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { Quaternion } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioVrmHandPose } from "../../vrm/studio-vrm-hand-poses";
import { applyFingerRotations } from "../../vrm/studio-vrm-poser-utils";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { createAuthoringPoseVrm } from "./__fixtures__/character-authoring-vrm";
import { projectCharacterFingerAuthoringEdits } from "./character-finger-authoring-projection";

import type { VRM } from "@pixiv/three-vrm";

const capture = (source: VRM) => captureCharacterPoseRuntimeV3({ source, poseId: "finger:test", generationId: 0, includeFingers: true });
afterEach(() => vi.unstubAllGlobals());

describe("V3 손가락과 호환 저장값의 축 변환", () => {
  it("손가락이 없는 이전 V3는 기존 저작값을 그대로 보존한다", () => {
    const source = createAuthoringPoseVrm();
    const fallback = { leftIndexProximal: [0, 0, -0.2] as const };
    expect(projectCharacterFingerAuthoringEdits(source, { ...capture(source), bones: {} }, fallback)).toBe(fallback);
  });
  it("기본 8개 모델의 손 축과 엄지 내전을 이중 보정 없이 왕복한다", async () => {
    vi.stubGlobal("self", globalThis);
    for (const file of ["sample", "Sendagaya_Shino", "Sendagaya_Shibu", "Sakurada_Fumiriya", "Darkness_Shibu", "Jimmy", "AliciaSolid", "Jennifer"]) {
      const bytes = fs.readFileSync(`apps/web/public/vrm/${file}.vrm`);
      const loader = new GLTFLoader(); loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.parseAsync(Uint8Array.from(bytes).buffer, "");
      const source: VRM = gltf.userData.vrm;
      if (source.meta.metaVersion === "0") VRMUtils.rotateVRM0(source);
      applyFingerRotations(source, { ...createStudioVrmHandPose("left", "fist"), ...createStudioVrmHandPose("right", "fist") });
      const pose = capture(source);
      const projected = projectCharacterFingerAuthoringEdits(source, pose, {});
      expect(capture(source)).toEqual(pose);
      applyFingerRotations(source, projected);
      const restored = capture(source);
      for (const name of Object.keys(projected)) {
        const before = pose.bones[name]; const after = restored.bones[name];
        if (!before || !after) throw new Error(`${file}/${name}: 손가락 회전 누락`);
        expect(new Quaternion(...before).angleTo(new Quaternion(...after)), `${file}/${name}`).toBeLessThan(1e-6);
      }
    }
  }, 180_000);
});
