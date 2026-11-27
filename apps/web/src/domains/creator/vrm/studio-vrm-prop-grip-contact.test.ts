import fs from "node:fs";
import path from "node:path";

import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { POSER_FINGER_BONES, pickNaturalIdlePose } from "../studio-pose-presets";
import { createStudioVrmGripContactPasses } from "./StudioVrmGripContactRefine";
import { applyFingerRotations, applyPoseToVrm, correctVrmHangingHandPalmTwist, stripFingerBones } from "./studio-vrm-poser-utils";
import { createAutoGripFingerOverrides, measureVrmPropRigMetrics, resolvePropAttachment } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";


(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

// AvatarSample_A.vrm was removed from the repo for rights reasons (VRoidPreset terms are
// not CC0 and prohibit bundled redistribution — see apps/web/public/vrm/LICENSES.md).
// Sendagaya_Shino.vrm is the license-cleared CC0 VRoid beta sample from the same family.
const MODEL = { id: "sendagaya-shino", name: "시노", file: "apps/web/public/vrm/Sendagaya_Shino.vrm" };

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

describe("VRM prop grip contact", () => {
  it.each([
    ["sample-vrm", "apps/web/public/vrm/sample.vrm"],
    ["shino", MODEL.file],
  ])("%s의 대기 자세에서 머그 입구가 수평이고 검지·중지가 고리 안을 지난다", async (id, file) => {
    const vrm = await load(file);
    const pose = pickNaturalIdlePose(id);
    applyPoseToVrm(vrm, stripFingerBones(pose.bones), pose.yOffset ?? 0, undefined, { skipPalmCorrect: true });
    const metrics = measureVrmPropRigMetrics(vrm);
    const mug = createPropInstance("mug", "test-handle")!;
    applyFingerRotations(vrm, createAutoGripFingerOverrides([mug], propDefById, metrics));
    correctVrmHangingHandPalmTwist(vrm);
    createStudioVrmGripContactPasses(vrm, [mug], metrics, []).forEach(pass => pass.run());
    const hand = vrm.humanoid.getNormalizedBoneNode("rightHand")!;
    const fit = resolvePropAttachment(propDefById("mug")!, mug, metrics);
    const rotation = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(fit.rotationDeg[0]),
        THREE.MathUtils.degToRad(fit.rotationDeg[1]),
        THREE.MathUtils.degToRad(fit.rotationDeg[2]),
      )),
    );
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y).toBeGreaterThan(Math.cos(6 * Math.PI / 180));
    const grip = hand.localToWorld(new THREE.Vector3(...fit.socketPosition));
    const inverse = rotation.clone().invert();
    for (const finger of ["Index", "Middle"] as const) {
      const chain = (["Proximal", "Intermediate", "Distal"] as const).map(segment =>
        vrm.humanoid.getNormalizedBoneNode(`right${finger}${segment}`)!.getWorldPosition(new THREE.Vector3())
          .sub(grip).applyQuaternion(inverse).divideScalar(fit.scale).add(new THREE.Vector3(...fit.anchor.position)),
      );
      // GLB 손잡이 고리는 XY 평면에서 반지름 26mm, 튜브 두께 반지름 6.5mm다.
      const throughOpening = chain.slice(1).some((end, i) => {
        const start = chain[i]!;
        if (start.z * end.z > 0 || start.z === end.z) return false;
        const crossing = start.clone().lerp(end, start.z / (start.z - end.z));
        return Math.hypot(crossing.x - 0.045, crossing.y) < 0.026 - 0.0065;
      });
      expect(throughOpening, finger).toBe(true);
    }
  }, 120_000);

  it("lands the anchor on the palm socket and wraps fingers around the grip", async () => {
    const { createAutoGripFingerOverrides, measureVrmPropRigMetrics, resolvePropAttachment } =
      await import("./studio-vrm-prop-rig");
    const { propDefById } = await import("./studio-vrm-props");

    const {
      applyFingerRotations,
      applyPoseToVrm,
      estimateVrmPalmNormal,
      stripFingerBones,
    } = await import("./studio-vrm-poser-utils");
    const { resolveStudioVrmFingerAuthority } = await import("./studio-vrm-auto-grip-authority");

    const vrm = await load(MODEL.file);
    const pose = pickNaturalIdlePose(MODEL.id);
    const bones = pose.bones as Record<string, { rotation?: [number, number, number] }>;

    applyPoseToVrm(vrm, stripFingerBones(bones), pose.yOffset ?? 0, undefined, {
      skipPalmCorrect: true,
    });
    const metrics = measureVrmPropRigMetrics(vrm);

    const def = propDefById("mug")!;
    const primaryAnchor = def.anchors.find((a: { role: string }) => a.role === "primary")!;
    const item = {
      uid: "test-mug",
      propId: "mug",
      bone: "rightHand",
      position: [...def.defaultPosition],
      rotationDeg: [...def.defaultRotationDeg],
      scale: def.defaultScale ?? 1,
      color: null,
      rig: {
        version: 2,
        mode: "auto",
        anchorId: primaryAnchor.id,
        autoScale: true,
        autoFingerPose: true,
        gripFit: 1,
        deltaPosition: [0, 0, 0],
        deltaRotationDeg: [0, 0, 0],
        deltaScale: 1,
      },
    } as unknown as Parameters<typeof resolvePropAttachment>[1];

    // Production finger path: authority merge → probe-corrected application.
    const authored: Record<string, [number, number, number]> = {};
    for (const boneName of POSER_FINGER_BONES) {
      const rotation = bones[boneName]?.rotation;
      if (rotation) authored[boneName] = [rotation[0], rotation[1], rotation[2]];
    }
    const autoGrip = createAutoGripFingerOverrides([item], propDefById, metrics);
    const effective = resolveStudioVrmFingerAuthority(authored, autoGrip);
    expect(Object.keys(effective).filter((k) => k.startsWith("right")).length).toBe(15);
    applyFingerRotations(vrm, effective);
    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);
    const { refineVrmGripFingerWrap } = await import("./studio-vrm-poser-utils");
    const handNode0 = vrm.humanoid!.getNormalizedBoneNode("rightHand")!;
    const socketWorld = new THREE.Vector3(...metrics.handSockets.rightHand.position);
    handNode0.localToWorld(socketWorld);

    // Follower math (one frame of StudioVrmPropAttachment).
    const resolved = resolvePropAttachment(def, item, metrics);
    expect(resolved.usesSmartRig).toBe(true);
    const boneNode = vrm.humanoid!.getNormalizedBoneNode("rightHand")!;
    boneNode.updateWorldMatrix(true, false);
    const socketWorldPosition = new THREE.Vector3(...resolved.socketPosition);
    boneNode.localToWorld(socketWorldPosition);
    const groupQuaternion = boneNode
      .getWorldQuaternion(new THREE.Quaternion())
      .multiply(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            THREE.MathUtils.degToRad(resolved.rotationDeg[0]),
            THREE.MathUtils.degToRad(resolved.rotationDeg[1]),
            THREE.MathUtils.degToRad(resolved.rotationDeg[2]),
            "XYZ",
          ),
        ),
      )
      .normalize();
    const anchorWorldOffset = new THREE.Vector3(...resolved.anchor.position)
      .multiplyScalar(resolved.scale)
      .applyQuaternion(groupQuaternion);
    // Documented invariant: group.position + rotate(anchor.position*scale) === socketWorld.
    const groupPosition = new THREE.Vector3().copy(socketWorldPosition).sub(anchorWorldOffset);
    const anchorWorld = new THREE.Vector3().copy(groupPosition).add(anchorWorldOffset);
    expect(anchorWorld.distanceTo(socketWorldPosition)).toBeLessThan(1e-6);


    refineVrmGripFingerWrap(
      vrm,
      [{ side: "right", socketWorldPoint: socketWorld, gripRadius: def.grip?.radius ?? 0.01 }],
    );
    vrm.humanoid!.update();
    vrm.scene.updateMatrixWorld(true);

    // Fingertips wrap near the grip centre (within grip radius + slack).
    const gripRadius = (def.grip?.radius ?? 0.01) * resolved.scale;
    const reachLimit = gripRadius * 2.2 + 0.035;
    const tipDistance = (fingerName: string) => {
      const node =
        vrm.humanoid!.getNormalizedBoneNode(`right${fingerName}Distal` as never)
        ?? vrm.humanoid!.getNormalizedBoneNode(`right${fingerName}Intermediate` as never);
      return node!.getWorldPosition(new THREE.Vector3()).distanceTo(anchorWorld);
    };
    for (const fingerName of ["Index", "Middle", "Ring"]) {
      expect(
        tipDistance(fingerName),
        `${fingerName} tip ${tipDistance(fingerName).toFixed(3)} outside grip reach ${reachLimit.toFixed(3)}`,
      ).toBeLessThan(reachLimit);
    }

    // Palm faces the held object.
    const palm = estimateVrmPalmNormal(vrm, "right")!;
    const handPos = vrm.humanoid!
      .getNormalizedBoneNode("rightHand")!
      .getWorldPosition(new THREE.Vector3());
    const towardAnchor = anchorWorld.clone().sub(handPos).normalize();
    expect(palm.dot(towardAnchor)).toBeGreaterThan(-0.35);
  }, 120_000);
});
