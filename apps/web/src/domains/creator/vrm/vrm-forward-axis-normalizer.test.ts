import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STUDIO_VRM_BASE_ROTATION_Y_KEY } from "./studio-vrm-asset-runtime";
import { CAMERA_PRESETS, type CameraPreset } from "./studio-vrm-poser-catalogs";
import {
  VRM_CANONICAL_WORLD_FORWARD,
  VRM_SPEC_FORWARD_AXES,
  normalizeCameraPresetForVrmForward,
  normalizeVrmSceneForwardAxis,
  parseVrmMetaVersion,
  resolveVrmForwardAxis,
  resolveVrmForwardAxisFromVrm,
  resolveVrmSpecForwardAxis,
  type VrmForwardAxisSourceLike,
} from "./vrm-forward-axis-normalizer";

function createSyntheticVrm(options: {
  metaVersion?: string;
  faceFront?: [number, number, number];
  sceneRotationY?: number;
  baseRotationY?: number;
  eyeLocalZ?: number;
}): VrmForwardAxisSourceLike {
  const scene = new THREE.Group();
  scene.rotation.y = options.sceneRotationY ?? 0;
  if (options.baseRotationY !== undefined) {
    scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY] = options.baseRotationY;
  }
  const head = new THREE.Object3D();
  head.position.set(0, 1.5, 0);
  scene.add(head);
  const leftEye = new THREE.Object3D();
  const rightEye = new THREE.Object3D();
  if (options.eyeLocalZ !== undefined) {
    leftEye.position.set(0.03, 0.04, options.eyeLocalZ);
    rightEye.position.set(-0.03, 0.04, options.eyeLocalZ);
    head.add(leftEye, rightEye);
  }
  scene.updateMatrixWorld(true);

  return {
    meta: options.metaVersion !== undefined ? { metaVersion: options.metaVersion } : undefined,
    lookAt: options.faceFront
      ? { faceFront: new THREE.Vector3(...options.faceFront) }
      : undefined,
    scene,
    humanoid: {
      getNormalizedBoneNode: (name) => {
        if (name === "head") return head;
        if (name === "leftEye" && options.eyeLocalZ !== undefined) return leftEye;
        if (name === "rightEye" && options.eyeLocalZ !== undefined) return rightEye;
        return null;
      },
    },
  };
}

const FRONT_PRESET: CameraPreset = CAMERA_PRESETS.find((p) => p.id === "front")!;
const THREE_QUARTER_PRESET: CameraPreset = CAMERA_PRESETS.find((p) => p.id === "threeQuarter")!;
const BACK_PRESET: CameraPreset = CAMERA_PRESETS.find((p) => p.id === "back")!;

describe("vrm-forward-axis-normalizer (#030)", () => {
  it("parses VRM 0.x and VRM 1.0 meta versions accurately", () => {
    expect(parseVrmMetaVersion("0")).toBe("0.x");
    expect(parseVrmMetaVersion("0.0")).toBe("0.x");
    expect(parseVrmMetaVersion("vrm0")).toBe("0.x");
    expect(parseVrmMetaVersion(0)).toBe("0.x");
    expect(parseVrmMetaVersion("1")).toBe("1.0");
    expect(parseVrmMetaVersion("1.0")).toBe("1.0");
    expect(parseVrmMetaVersion("vrm1")).toBe("1.0");
    expect(parseVrmMetaVersion(1)).toBe("1.0");
    expect(parseVrmMetaVersion("2.0")).toBe("unknown");
    expect(parseVrmMetaVersion(undefined)).toBe("unknown");

    expect(VRM_SPEC_FORWARD_AXES["0.x"].specForward).toEqual([0, 0, 1]);
    expect(VRM_SPEC_FORWARD_AXES["1.0"].specForward).toEqual([0, 0, -1]);
    expect(resolveVrmSpecForwardAxis("0").defaultBaseRotationY).toBeCloseTo(Math.PI, 6);
    expect(resolveVrmSpecForwardAxis("1").defaultBaseRotationY).toBe(0);
  });

  it("flips front camera preset for unrotated VRM 0.x so it faces the character instead of back of head", () => {
    const rawVrm0 = createSyntheticVrm({ metaVersion: "0", sceneRotationY: 0 });
    const resolved = resolveVrmForwardAxisFromVrm(rawVrm0);

    expect(resolved.metaVersion).toBe("0.x");
    expect(resolved.localForward).toEqual([0, 0, -1]);
    expect(resolved.worldForward).toEqual([0, 0, -1]);
    expect(resolved.facesFrontCamera).toBe(false);
    expect(resolved.needsFlipForFrontCamera).toBe(true);
    expect(Math.abs(resolved.cameraYawCorrectionRad)).toBeCloseTo(Math.PI, 6);

    const normalizedFront = normalizeCameraPresetForVrmForward(FRONT_PRESET, rawVrm0);
    expect(normalizedFront.position[2]).toBeCloseTo(-FRONT_PRESET.position[2], 6);
    expect(normalizedFront.position[1]).toBeCloseTo(FRONT_PRESET.position[1], 6);
    expect(normalizedFront.target).toEqual(FRONT_PRESET.target);

    const normalizedQuarter = normalizeCameraPresetForVrmForward(THREE_QUARTER_PRESET, rawVrm0);
    expect(normalizedQuarter.position[0]).toBeCloseTo(-THREE_QUARTER_PRESET.position[0], 6);
    expect(normalizedQuarter.position[2]).toBeCloseTo(-THREE_QUARTER_PRESET.position[2], 6);

    const normalizedBack = normalizeCameraPresetForVrmForward(BACK_PRESET, rawVrm0);
    expect(normalizedBack.position[2]).toBeCloseTo(-BACK_PRESET.position[2], 6);
  });

  it("does NOT double-flip VRM 0.x that already underwent VRMUtils.rotateVRM0 (scene.rotation.y = PI)", () => {
    const rotatedVrm0 = createSyntheticVrm({
      metaVersion: "0",
      faceFront: [0, 0, -1],
      sceneRotationY: Math.PI,
      baseRotationY: Math.PI,
    });
    const resolved = resolveVrmForwardAxisFromVrm(rotatedVrm0);

    expect(resolved.worldForward).toEqual(VRM_CANONICAL_WORLD_FORWARD);
    expect(resolved.facesFrontCamera).toBe(true);
    expect(resolved.needsFlipForFrontCamera).toBe(false);

    const normalizedFront = normalizeCameraPresetForVrmForward(FRONT_PRESET, rotatedVrm0);
    expect(normalizedFront).toBe(FRONT_PRESET);
  });

  it("keeps standard VRM 1.0 (+Z faceFront) aligned and auto-fixes inverted (-Z faceFront) VRM 1.0", () => {
    const standardVrm1 = createSyntheticVrm({
      metaVersion: "1",
      faceFront: [0, 0, 1],
      sceneRotationY: 0,
    });
    expect(resolveVrmForwardAxisFromVrm(standardVrm1).needsFlipForFrontCamera).toBe(false);
    expect(normalizeCameraPresetForVrmForward(FRONT_PRESET, standardVrm1)).toBe(FRONT_PRESET);

    const invertedVrm1 = createSyntheticVrm({
      metaVersion: "1",
      faceFront: [0, 0, -1],
      sceneRotationY: 0,
    });
    const invResolved = resolveVrmForwardAxisFromVrm(invertedVrm1);
    expect(invResolved.source).toBe("lookAt-faceFront");
    expect(invResolved.needsFlipForFrontCamera).toBe(true);
    const fixedFront = normalizeCameraPresetForVrmForward(FRONT_PRESET, invertedVrm1);
    expect(fixedFront.position[2]).toBeCloseTo(-FRONT_PRESET.position[2], 6);
  });

  it("falls back to eye-vs-head landmark offset when metaVersion and lookAt are missing", () => {
    const unknownBackward = createSyntheticVrm({ eyeLocalZ: -0.07 });
    const resolved = resolveVrmForwardAxisFromVrm(unknownBackward);
    expect(resolved.source).toBe("eye-landmark");
    expect(resolved.worldForward).toEqual([0, 0, -1]);
    expect(resolved.needsFlipForFrontCamera).toBe(true);
  });

  it("respects recorded baseRotationY so user bodyRotation does not fight manual turntable inspection", () => {
    const vrm1TurnedByUser = createSyntheticVrm({
      metaVersion: "1",
      faceFront: [0, 0, 1],
      baseRotationY: 0,
      sceneRotationY: Math.PI, // user intentionally turned character 180deg
    });
    const baseResolved = resolveVrmForwardAxisFromVrm(vrm1TurnedByUser);
    expect(baseResolved.needsFlipForFrontCamera).toBe(false);

    const fullYawResolved = resolveVrmForwardAxisFromVrm(vrm1TurnedByUser, {
      ignoreUserBodyRotation: false,
    });
    expect(fullYawResolved.needsFlipForFrontCamera).toBe(true);
  });

  it("normalizes VRM scene root rotation idempotently without double-rotating", () => {
    const rawVrm0 = createSyntheticVrm({ metaVersion: "0", sceneRotationY: 0 });
    const first = normalizeVrmSceneForwardAxis(rawVrm0);
    expect(first.didNormalize).toBe(true);
    expect(first.nextRotationY).toBeCloseTo(Math.PI, 6);
    expect(rawVrm0.scene!.userData![STUDIO_VRM_BASE_ROTATION_Y_KEY]).toBeCloseTo(Math.PI, 6);
    expect(first.resolution.worldForward).toEqual([0, 0, 1]);

    const second = normalizeVrmSceneForwardAxis(rawVrm0);
    expect(second.didNormalize).toBe(false);
    expect(second.nextRotationY).toBeCloseTo(Math.PI, 6);
  });

  it("handles direct pure input resolution cleanly", () => {
    const res = resolveVrmForwardAxis({ metaVersion: "0.0", sceneRotationY: 0 });
    expect(res.recommendedBaseRotationY).toBeCloseTo(Math.PI, 6);
    expect(res.needsFlipForFrontCamera).toBe(true);
  });
});
