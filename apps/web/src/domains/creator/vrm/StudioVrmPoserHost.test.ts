import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { findPoseById } from "./studio-vrm-poser-helpers";
import { readStudioVrmPoserShaperSurface, type StudioVrmPoserHost } from "./StudioVrmPoserHost";
import { useStudioVrmPoserIk } from "./useStudioVrmPoserIk";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

function createTestHostVrm(metaVersion: "0" | "1" = "0") {
  const scene = new THREE.Group();
  const bones: Partial<Record<VRMHumanBoneName, THREE.Object3D>> = {};
  const add = (name: VRMHumanBoneName, parent: THREE.Object3D, pos: [number, number, number]) => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(...pos);
    parent.add(node);
    bones[name] = node;
    return node;
  };
  const hips = add("hips", scene, [0, 0.95, 0]);
  const spine = add("spine", hips, [0, 0.14, 0]);
  const chest = add("chest", spine, [0, 0.18, 0]);
  const neck = add("neck", chest, [0, 0.22, 0]);
  const head = add("head", neck, [0, 0.1, 0]);
  add("leftEye", head, [0.03, 0.04, 0.06]);
  add("rightEye", head, [-0.03, 0.04, 0.06]);
  const ls = add("leftShoulder", chest, [0.07, 0.1, 0]);
  const lua = add("leftUpperArm", ls, [0.12, 0, 0]);
  const lla = add("leftLowerArm", lua, [0.27, 0, 0]);
  add("leftHand", lla, [0.25, 0, 0]);
  const rs = add("rightShoulder", chest, [-0.07, 0.1, 0]);
  const rua = add("rightUpperArm", rs, [-0.12, 0, 0]);
  const rla = add("rightLowerArm", rua, [-0.27, 0, 0]);
  add("rightHand", rla, [-0.25, 0, 0]);
  const lul = add("leftUpperLeg", hips, [0.09, -0.05, 0]);
  const lll = add("leftLowerLeg", lul, [0, -0.42, 0]);
  add("leftFoot", lll, [0, -0.42, 0]);
  const rul = add("rightUpperLeg", hips, [-0.09, -0.05, 0]);
  const rll = add("rightLowerLeg", rul, [0, -0.42, 0]);
  add("rightFoot", rll, [0, -0.42, 0]);
  scene.updateMatrixWorld(true);

  const vrm = {
    meta: { metaVersion },
    scene,
    lookAt: { yaw: 0, pitch: 0, faceFront: new THREE.Vector3(0, 0, metaVersion === "0" ? -1 : 1) },
    humanoid: {
      resetNormalizedPose: () => {
        Object.values(bones).forEach((b) => {
          b.rotation.set(0, 0, 0);
          b.quaternion.identity();
        });
        scene.position.set(0, 0, 0);
        scene.updateMatrixWorld(true);
      },
      getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name] ?? null,
      update: () => scene.updateMatrixWorld(true),
    },
    update: () => scene.updateMatrixWorld(true),
  } as unknown as VRM;
  return { vrm, bones };
}

describe("readStudioVrmPoserShaperSurface", () => {
  it("exposes typed shaper methods and drops non-functions", () => {
    const applyHandPosePreset = vi.fn();
    const host = {
      applyHandPosePreset,
      handlePoseSelect: "nope",
      setBodyRotation: (n: number) => n,
      unrelated: 1,
    } as unknown as StudioVrmPoserHost;

    const surface = readStudioVrmPoserShaperSurface(host);
    expect(surface.applyHandPosePreset).toBeTypeOf("function");
    expect(surface.handlePoseSelect).toBeUndefined();
    expect(surface.setBodyRotation?.(0.5)).toBe(0.5);
    surface.applyHandPosePreset?.("left", "fist");
    expect(applyHandPosePreset).toHaveBeenCalledWith("left", "fist");
  });

  it("wires action silhouette presets, LookAt pin, garment 2mm guard, and VRM forward axis through useStudioVrmPoserIk", () => {
    const { vrm } = createTestHostVrm("0");
    const setActivePoseId = vi.fn();
    const setCustomBones = vi.fn();
    const setFingerEdits = vi.fn();
    const setCustomYOffset = vi.fn();
    const setJointHandleStatus = vi.fn();
    const host = {
      vrmRef: { current: vrm },
      captureRef: { current: { scene: null } },
      webcamActive: false,
      idleAnimation: false,
      isCapturing: false,
      setActivePoseId,
      setCustomBones,
      setFingerEdits,
      setCustomYOffset,
      setJointHandleStatus,
    } as unknown as StudioVrmPoserHost;

    useStudioVrmPoserIk(host);
    const surface = readStudioVrmPoserShaperSurface(host);

    // #030 VRM 0.x 전방축 판정 및 정규화
    const beforeForward = surface.resolveActiveVrmForwardAxis?.();
    expect(beforeForward?.needsFlipForFrontCamera).toBe(true);
    const normalized = surface.normalizeActiveVrmForwardAxis?.();
    expect(normalized?.didNormalize).toBe(true);
    expect(surface.resolveActiveVrmForwardAxis?.().facesFrontCamera).toBe(true);

    // #026 액션 실루엣 12종 조회 및 원클릭 적용 + 단일 LookAt 핀
    expect(findPoseById("action-punch")?.label).toBe("주먹");
    expect(
      surface.applyActionSilhouettePreset?.("action-guard", {
        enabled: true,
        targetWorld: [0.4, 1.5, 2.0],
      }),
    ).toBe(true);
    expect(setActivePoseId).toHaveBeenCalledWith("action-guard");

    const gaze = surface.applyLookAtPin?.({ enabled: true, targetWorld: [-0.5, 1.7, 2.0] });
    expect(gaze?.enabled).toBe(true);
    expect(gaze?.yawRad).toBeLessThan(0);

    // #029 의상-신체 캡슐 관통 경고 + 2mm Push-Out
    const clippedGarment = new Float32Array([0, 1.1, 0.05]);
    const guardResult = surface.guardGarmentCapsuleClipping?.(clippedGarment, "blazer");
    expect(guardResult?.hasClipping).toBe(true);
    expect(guardResult?.appliedPushOutOffsetM).toBe(0.002);
    expect(guardResult?.remainingPenetrationCount).toBe(0);
    expect(guardResult?.warnings.length).toBeGreaterThan(0);
  });
});
