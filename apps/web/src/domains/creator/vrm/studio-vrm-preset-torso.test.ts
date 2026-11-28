import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { createStudioVrmPoseApplyPlan } from "./studio-vrm-pose-apply";
import { bakeStudioVrmRuntimePose } from "./studio-vrm-pose-bake";
import { applyPoserVisualState, POSE_PRESETS, stripFingerBones } from "./studio-vrm-poser-utils";
import { retargetStudioVrmPresetTorso } from "./studio-vrm-preset-torso";

beforeAll(() => { vi.stubGlobal("self", globalThis); });
afterAll(() => { vi.unstubAllGlobals(); });

it.each(["sample.vrm", "Sendagaya_Shino.vrm"])("%s의 인사와 낙담이 캐릭터 정면으로 숙여지고 편집 좌표로 복원된다", async (filename) => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: "pose-fixture-textures", loadTexture: async () => new THREE.Texture() }));
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const bytes = readFileSync(join(process.cwd(), "apps/web/public/vrm", filename));
  const gltf = await loader.parseAsync(Uint8Array.from(bytes).buffer, "");
  const vrm: VRM = gltf.userData.vrm;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  const hips = vrm.humanoid.getRawBoneNode("hips");
  const head = vrm.humanoid.getRawBoneNode("head");
  if (!head || !hips) throw new Error("골반과 머리 관절이 필요합니다");
  const baseYaw = vrm.scene.rotation.y;
  for (const turntable of [0, Math.PI / 3]) {
    vrm.scene.rotation.y = baseYaw + turntable;
    const forward = new THREE.Vector3(0, 0, vrm.meta.metaVersion === "0" ? -1 : 1).applyQuaternion(vrm.scene.quaternion);
    const readPitch = () => {
      const trunk = head.getWorldPosition(new THREE.Vector3()).sub(hips.getWorldPosition(new THREE.Vector3()));
      return THREE.MathUtils.radToDeg(Math.atan2(trunk.dot(forward), trunk.y));
    };
    for (const [id, minPitch] of [["bow", 35], ["despair", 7]] as const) {
      const preset = POSE_PRESETS.find((item) => item.id === id);
      if (!preset) throw new Error(`${id} 프리셋이 없습니다`);
      const plan = createStudioVrmPoseApplyPlan({
        currentBones: { upperChest: { rotation: [0, 0.15, 0] } }, currentFingerEdits: {},
        incomingBones: stripFingerBones(preset.bones), lockedBones: ["upperChest"],
        isBoneAvailable: (bone) => Boolean(vrm.humanoid.getNormalizedBoneNode(bone)),
      });
      const controls = retargetStudioVrmPresetTorso(vrm, plan.bones, plan.appliedBodyBones);
      expect(controls.upperChest).toEqual({ rotation: [0, 0.15, 0] });
      applyPoserVisualState(vrm, { bones: controls, yOffset: preset.yOffset });
      const pitch = readPitch();
      expect(pitch).toBeGreaterThan(minPitch);
      const baked = bakeStudioVrmRuntimePose(vrm, ["hips", "spine", "chest", "upperChest", "neck", "head"]);
      if (!baked) throw new Error("편집 좌표를 기록하지 못했습니다");
      applyPoserVisualState(vrm, { bones: {} });
      applyPoserVisualState(vrm, baked);
      expect(readPitch()).toBeCloseTo(pitch, 5);
    }
  }
  VRMUtils.deepDispose(vrm.scene);
});
