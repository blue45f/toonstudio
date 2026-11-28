import fs from "node:fs";
import path from "node:path";

import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { POSER_FINGER_BONES, pickNaturalIdlePose } from "../studio-pose-presets";
import { applyCharacterPoseRuntimeV3, captureCharacterPoseRuntimeV3 } from "../character-platform/pose-v3/character-pose-runtime-adapter";
import { planCharacterPoseAuthoringInput } from "../character-platform/runtime/character-pose-authoring-input";
import { createStudioVrmVirtualFingertipProbe, sampleStudioVrmVirtualFingertip } from "./studio-vrm-virtual-fingertip";
import { fitStudioVrmHandPresetEdits } from "./studio-vrm-hand-preset-contact";
import { createStudioVrmHandPose } from "./studio-vrm-hand-poses";

import {
  applyFingerRotations,
  applyPoseToVrm,
  estimateVrmPalmNormal,
  invalidateVrmFingerCurlPolarityCache,
  stripFingerBones,
  type FingerRotationMap,
  type PoseBoneMap,
  type Vec3,
} from "./studio-vrm-poser-utils";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

// AvatarSample_A/B/C.vrm, fem_vroid.vrm and masc_vroid.vrm were removed from the repo
// for rights reasons (the VRoid preset/sample terms are not CC0 and prohibit bundled
// redistribution — see apps/web/public/vrm/LICENSES.md). The Sendagaya/Sakurada/Darkness
// VRoid beta samples below are the license-cleared CC0 replacements from the same sample
// family; Jimmy (100Avatars, CC0) covers the male-rig slot and was verified to carry the
// full 30 finger bones this suite reads.
const CORE = [
  { id: "sample-vrm", name: "루미", file: "apps/web/public/vrm/sample.vrm" },
  { id: "sendagaya-shino", name: "시노", file: "apps/web/public/vrm/Sendagaya_Shino.vrm" },
  { id: "sendagaya-shibu", name: "시온", file: "apps/web/public/vrm/Sendagaya_Shibu.vrm" },
  { id: "sakurada-fumiriya", name: "후미", file: "apps/web/public/vrm/Sakurada_Fumiriya.vrm" },
  { id: "darkness-shibu", name: "카게", file: "apps/web/public/vrm/Darkness_Shibu.vrm" },
  { id: "jimmy", name: "지미", file: "apps/web/public/vrm/Jimmy.vrm" },
  { id: "alicia", name: "아리시아", file: "apps/web/public/vrm/AliciaSolid.vrm" },
  { id: "jennifer", name: "제니퍼", file: "apps/web/public/vrm/Jennifer.vrm" },
] as const;

function extractFingers(bones: PoseBoneMap): FingerRotationMap {
  const fingers: FingerRotationMap = {};
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = bones[boneName]?.rotation as Vec3 | undefined;
    if (!rotation) continue;
    fingers[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return fingers;
}

async function load(file: string) {
  const buf = fs.readFileSync(path.resolve(file)).buffer;
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{ userData: { vrm: import("@pixiv/three-vrm").VRM } }>(
    (resolve, reject) => loader.parse(buf, "", resolve as never, reject),
  );
  const vrm = gltf.userData.vrm;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  return vrm;
}

function tipPalmDot(vrm: import("@pixiv/three-vrm").VRM, side: "left" | "right") {
  const h = vrm.humanoid!;
  const hand = h.getNormalizedBoneNode(`${side}Hand`)!;
  const tip = h.getNormalizedBoneNode(`${side}MiddleDistal`) ?? h.getNormalizedBoneNode(`${side}MiddleProximal`)!;
  const palm = estimateVrmPalmNormal(vrm, side)!;
  return tip.getWorldPosition(new THREE.Vector3())
    .sub(hand.getWorldPosition(new THREE.Vector3()))
    .normalize()
    .dot(palm);
}

describe("VRM finger curl polarity", () => {
  it("VRM 작업실에서 고른 OK·핀치·하트의 손끝 접촉을 원본·다른 손·잠긴 마디를 보존하며 저장한다", async () => {
    for (const character of [CORE[0], CORE[1]]) {
      const source = await load(character.file);
      const previous = captureCharacterPoseRuntimeV3({ source, poseId: "before", generationId: 0, includeFingers: true });
      for (const side of ["left", "right"] as const) {
        applyCharacterPoseRuntimeV3(source, previous);
        const node = (name: Parameters<typeof source.humanoid.getNormalizedBoneNode>[0]) => {
          const result = source.humanoid.getNormalizedBoneNode(name);
          if (!result) throw new Error(`손가락 뼈가 없습니다. ${name}`);
          return result;
        };
        const size = node(`${side}Hand`).getWorldPosition(new THREE.Vector3())
          .distanceTo(node(`${side}MiddleProximal`).getWorldPosition(new THREE.Vector3()));
        const index = createStudioVrmVirtualFingertipProbe({ distal: node(`${side}IndexDistal`), previousJoint: node(`${side}IndexIntermediate`), handSize: size });
        const thumb = createStudioVrmVirtualFingertipProbe({ distal: node(`${side}ThumbDistal`), previousJoint: node(`${side}ThumbProximal`), handSize: size, lengthRatio: 0.82 });
        if (!thumb || !index) throw new Error("손끝 위치를 계산할 수 없습니다.");
        for (const gesture of ["okSign", "pinch", "fingerHeart"] as const) {
          applyCharacterPoseRuntimeV3(source, previous);
          const edits = { source, previous, kind: "manual" as const, bones: {}, fingers: createStudioVrmHandPose(side, gesture) };
          const before = planCharacterPoseAuthoringInput(edits);
          const after = planCharacterPoseAuthoringInput({ ...edits, handPreset: gesture });
          const other = side === "left" ? "rightIndexDistal" : "leftIndexDistal";
          expect(after.bones[other]).toEqual(previous.bones[other]);
          const locked = [`${side}ThumbDistal`];
          expect(planCharacterPoseAuthoringInput({ ...edits, lockedBones: locked, handPreset: gesture }))
            .toEqual(planCharacterPoseAuthoringInput({ ...edits, lockedBones: locked }));
          expect(node(`${side}ThumbDistal`).quaternion.toArray()).toEqual(previous.bones[`${side}ThumbDistal`]);
          const indexPad = { ...index, localTip: new THREE.Vector3(...index.localTip).multiplyScalar(gesture === "fingerHeart" ? 0.28 : 0.87).toArray() };
          const gap = () => {
            const a = sampleStudioVrmVirtualFingertip(indexPad, new THREE.Vector3());
            const b = sampleStudioVrmVirtualFingertip(thumb, new THREE.Vector3());
            if (!a || !b) throw new Error("손끝 패드를 읽을 수 없습니다.");
            return a.distanceTo(b);
          };
          applyCharacterPoseRuntimeV3(source, before);
          const originalGap = gap();
          applyCharacterPoseRuntimeV3(source, after);
          expect(gap(), `${character.name}/${side}/${gesture}`).toBeLessThan(originalGap);
          const documentGap = gap();
          expect(Math.abs(documentGap / size - 0.06)).toBeLessThan(0.05);
          applyCharacterPoseRuntimeV3(source, previous);
          const standalone = fitStudioVrmHandPresetEdits(source, side, gesture, edits.fingers);
          expect(node(`${side}ThumbDistal`).quaternion.toArray()).toEqual(previous.bones[`${side}ThumbDistal`]);
          applyFingerRotations(source, standalone);
          expect(gap()).toBeCloseTo(documentGap, 4);
        }
      }
    }
  }, 60_000);

  it("중지를 편집하지 않아도 첫 검지 굽힘이 전체 손 보정과 같은 방향을 유지한다", async () => {
    for (const character of CORE) {
      const vrm = await load(character.file);
      const pose = pickNaturalIdlePose(character.id);
      for (const side of ["left", "right"] as const) {
        for (const sign of [-1, 1]) {
          applyPoseToVrm(vrm, stripFingerBones(pose.bones as PoseBoneMap), pose.yOffset ?? 0);
          const key = `${side}IndexProximal` as const;
          const patch: FingerRotationMap = { [key]: [0, 0, sign * 0.6] };
          invalidateVrmFingerCurlPolarityCache(vrm);
          applyFingerRotations(vrm, patch);
          const cold = readFingerEuler(vrm, key);
          invalidateVrmFingerCurlPolarityCache(vrm);
          applyFingerRotations(vrm, { ...patch, [`${side}MiddleProximal`]: [0, 0, sign * 0.6] });
          const calibrated = readFingerEuler(vrm, key);
          expect(eulerDistance(cold, calibrated), `${character.name}/${side}/${sign} 첫 단독 편집 방향`).toBeLessThan(1e-6);
          // 저장된 편집값을 다시 읽고 축 캐시가 없는 상태에서도 같은 결과여야 한다.
          const restored: FingerRotationMap = JSON.parse(JSON.stringify(patch));
          for (let edit = 0; edit < 5; edit += 1) {
            invalidateVrmFingerCurlPolarityCache(vrm);
            applyPoseToVrm(vrm, stripFingerBones(pose.bones as PoseBoneMap), pose.yOffset ?? 0);
            applyFingerRotations(vrm, restored);
            expect(eulerDistance(readFingerEuler(vrm, key), calibrated)).toBeLessThan(1e-6);
          }
        }
      }
    }
  }, 180_000);

  it("curls middle fingertips into the palm for core humanoids (including Lumi axis flip)", async () => {
    const failures: string[] = [];
    for (const character of CORE) {
      const vrm = await load(character.file);
      const pose = pickNaturalIdlePose(character.id);
      const bones = stripFingerBones(pose.bones as PoseBoneMap);
      const fingers = extractFingers(pose.bones as PoseBoneMap);
      applyPoseToVrm(vrm, bones, pose.yOffset ?? 0);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);
      const beforeL = tipPalmDot(vrm, "left");
      const beforeR = tipPalmDot(vrm, "right");
      applyFingerRotations(vrm, fingers);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);
      const afterL = tipPalmDot(vrm, "left");
      const afterR = tipPalmDot(vrm, "right");
      // estimateVrmPalmNormal points out of the palm (+palmNormal). Curling fingers into the
      // palm moves fingertips toward +palmNormal (increasing tip·palm), avoiding hyperextension.
      if (afterL - beforeL < 0.05) {
        failures.push(`${character.name}/L curl wrong way Δ=${(afterL - beforeL).toFixed(3)}`);
      }
      if (afterR - beforeR < 0.05) {
        failures.push(`${character.name}/R curl wrong way Δ=${(afterR - beforeR).toFixed(3)}`);
      }
      // Switching to opposite-sign hand presets (e.g. left fist uses -Z) without cache reset
      // must still curl fingers into the palm instead of reusing the +Z polarity multiplier.
      applyFingerRotations(vrm, {
        ...createStudioVrmHandPose("left", "fist"),
        ...createStudioVrmHandPose("right", "fist"),
      });
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);
      const fistL = tipPalmDot(vrm, "left");
      const fistR = tipPalmDot(vrm, "right");
      if (fistL - beforeL < 0.2) {
        failures.push(`${character.name}/L fist curl poisoned Δ=${(fistL - beforeL).toFixed(3)}`);
      }
      if (fistR - beforeR < 0.2) {
        failures.push(`${character.name}/R fist curl poisoned Δ=${(fistR - beforeR).toFixed(3)}`);
      }
      // Palm still medial after curl
      const palmL = estimateVrmPalmNormal(vrm, "left");
      const palmR = estimateVrmPalmNormal(vrm, "right");
      if (!palmL || palmL.x > -0.15) failures.push(`${character.name}/L palm not medial`);
      if (!palmR || palmR.x < 0.15) failures.push(`${character.name}/R palm not medial`);
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  }, 180_000);

  it("keeps the untouched hand's finger pose when only one side is overridden", async () => {
    for (const character of CORE) {
      const vrm = await load(character.file);
      const pose = pickNaturalIdlePose(character.id);
      const bones = stripFingerBones(pose.bones as PoseBoneMap);
      const fingers = extractFingers(pose.bones as PoseBoneMap);
      applyPoseToVrm(vrm, bones, pose.yOffset ?? 0);
      applyFingerRotations(vrm, fingers);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);

      const leftBefore = readFingerEuler(vrm, "leftIndexProximal");
      const rightFist: FingerRotationMap = { rightIndexProximal: [0, 0, 1.4] };
      applyFingerRotations(vrm, rightFist);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);

      const leftAfter = readFingerEuler(vrm, "leftIndexProximal");
      expect(
        eulerDistance(leftAfter, leftBefore),
        `${character.name} 왼손가락이 반대손 오버라이드에 초기화됨`,
      ).toBeLessThan(1e-4);
      invalidateVrmFingerCurlPolarityCache(vrm);
    }
  }, 180_000);

  it("caches polarity so repeated applies do not flip between curl and hyperextension", async () => {
    for (const character of CORE) {
      const vrm = await load(character.file);
      const pose = pickNaturalIdlePose(character.id);
      const bones = stripFingerBones(pose.bones as PoseBoneMap);
      const fingers = extractFingers(pose.bones as PoseBoneMap);
      applyPoseToVrm(vrm, bones, pose.yOffset ?? 0);

      applyFingerRotations(vrm, fingers);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);
      const first = readFingerEuler(vrm, "rightIndexProximal");
      for (let i = 0; i < 3; i += 1) {
        applyPoseToVrm(vrm, bones, pose.yOffset ?? 0);
        applyFingerRotations(vrm, fingers);
        vrm.humanoid?.update();
        vrm.scene.updateMatrixWorld(true);
        const again = readFingerEuler(vrm, "rightIndexProximal");
        expect(
          eulerDistance(again, first),
          `${character.name} 반복 적용 시 손가락 극성이 뒤집힘`,
        ).toBeLessThan(1e-6);
      }
      invalidateVrmFingerCurlPolarityCache(vrm);
    }
  }, 180_000);
});

function readFingerEuler(
  vrm: import("@pixiv/three-vrm").VRM,
  boneName: Parameters<NonNullable<import("@pixiv/three-vrm").VRM["humanoid"]>["getNormalizedBoneNode"]>[0],
): [number, number, number] {
  const node = vrm.humanoid!.getNormalizedBoneNode(boneName)!;
  return [node.rotation.x, node.rotation.y, node.rotation.z];
}

function eulerDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
