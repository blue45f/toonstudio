import { readFileSync } from "node:fs";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { DoubleSide, Euler, MathUtils, Mesh, Quaternion, Raycaster, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { pickNaturalIdlePose } from "../studio-pose-presets";
import { idleGripClearanceItems, createIdleGripBodyClearance } from "./studio-vrm-idle-grip-body-clearance";
import { applyFingerRotations, applyPoseToVrm, correctVrmHangingHandPalmTwist, stripFingerBones } from "./studio-vrm-poser-utils";
import { retargetStudioVrmPresetTorso } from "./studio-vrm-preset-torso";
import { createAutoGripFingerOverrides, measureVrmPropRigMetrics, resolvePropAttachment } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";

import type { Object3D } from "three";
import type { ResolvedPropAttachment } from "./studio-vrm-prop-rig";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

async function asset(file: string, loader = new GLTFLoader()) {
  return loader.parseAsync(Uint8Array.from(readFileSync(file)).buffer, "");
}

/** 원본 책 부품 양면에 독립적으로 광선을 쏴, 책 내부에 있는 원본 허벅지 정점을 센다. */
function legVerticesInsideBook(vrm: VRM, book: Object3D, fit: ResolvedPropAttachment) {
  const hand = vrm.humanoid.getNormalizedBoneNode("leftHand");
  if (!hand) throw new Error("왼손 뼈가 없습니다.");
  const anchor = hand.localToWorld(new Vector3(...fit.socketPosition));
  const inverse = hand.getWorldQuaternion(new Quaternion()).multiply(
    new Quaternion().setFromEuler(new Euler(...fit.rotationDeg.map(MathUtils.degToRad))),
  ).invert();
  const offset = new Vector3(...fit.anchor.position);
  const ray = new Raycaster(new Vector3(), new Vector3(0.13, 0.21, 0.968).normalize());
  const parts: Mesh[] = [];
  book.traverseVisible(node => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => { material.side = DoubleSide; });
    parts.push(node);
  });
  const legs = [vrm.humanoid.getRawBoneNode("leftUpperLeg"), vrm.humanoid.getRawBoneNode("rightUpperLeg")];
  let inside = 0;
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverseVisible(node => {
    if (!(node instanceof SkinnedMesh)) return;
    const indices = node.geometry.getAttribute("skinIndex"), weights = node.geometry.getAttribute("skinWeight");
    const membership = node.skeleton.bones.map(bone => legs.includes(bone));
    if (!indices || !weights || !membership.some(Boolean)) return;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      let weight = 0;
      for (let i = 0; i < 4; i++) if (membership[indices.getComponent(vertex, i)]) weight += weights.getComponent(vertex, i);
      if (weight < 0.5) continue;
      const local = node.localToWorld(node.getVertexPosition(vertex, ray.ray.origin))
        .sub(anchor).applyQuaternion(inverse).divideScalar(fit.scale).add(offset);
      if (Math.abs(local.x) > 0.09 || Math.abs(local.y) > 0.12 || Math.abs(local.z) > 0.028) continue;
      if (parts.some(mesh => {
        const hits = ray.intersectObject(mesh, false);
        return hits.filter((hit, i) => !i || Math.abs(hit.distance - hits[i - 1]!.distance) > 1e-7).length % 2 === 1;
      })) inside++;
    }
  });
  return inside;
}

describe("자연 대기 자세의 책과 허벅지", () => {
  it.each([
    ["ts-vrm-hero-v1-chibi-mascot", "toonstudio-hero-v1/chibi-mascot.vrm", true],
    ["sample-vrm", "sample.vrm", false],
  ] as const)("%s의 실제 겹침만 해소하고 장착을 해제하면 원래 팔로 돌아간다", async (id, file, overlaps) => {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await asset(`apps/web/public/vrm/${file}`, loader);
    const vrm: VRM = gltf.userData.vrm;
    if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
    const book = (await asset("apps/web/public/assets/3d/everyday_book.glb")).scene;
    book.updateMatrixWorld(true);
    const metrics = measureVrmPropRigMetrics(vrm);
    const pose = pickNaturalIdlePose(id);
    applyPoseToVrm(vrm, retargetStudioVrmPresetTorso(vrm, stripFingerBones(pose.bones)), pose.yOffset ?? 0, undefined, { skipPalmCorrect: true });
    const item = createPropInstance("book", "book-clearance-test");
    const def = propDefById("book");
    if (!item?.rig || !def) throw new Error("기본 책 장착점이 없습니다.");
    applyFingerRotations(vrm, createAutoGripFingerOverrides([item], propDefById, metrics));
    correctVrmHangingHandPalmTwist(vrm);
    const fit = resolvePropAttachment(def, item, metrics);
    const original = () => (["leftUpperArm", "leftLowerArm", "leftHand"] as const)
      .flatMap(name => vrm.humanoid.getNormalizedBoneNode(name)?.quaternion.toArray() ?? []);
    const input = original();

    expect(idleGripClearanceItems([item], metrics, pose.id)).toEqual([item]);
    for (const otherPose of ["manual-pose", "walk", undefined]) expect(idleGripClearanceItems([item], metrics, otherPose)).toEqual([]);
    expect(idleGripClearanceItems([{ ...item, rig: { ...item.rig, mode: "custom" } }], metrics, pose.id)).toEqual([]);
    expect(idleGripClearanceItems([{ ...item, rig: { ...item.rig, anchorId: "primary" } }], metrics, pose.id)).toEqual([]);
    const mug = createPropInstance("mug", "mug-clearance-test");
    if (!mug) throw new Error("머그 장착점이 없습니다.");
    expect(idleGripClearanceItems([mug, item], metrics, pose.id)).toEqual([mug, item]);
    expect(createIdleGripBodyClearance(vrm, item, metrics, book, ["leftLowerArm"])).toBeNull();
    const pass = createIdleGripBodyClearance(vrm, item, metrics, book, []);
    if (!pass) throw new Error("책 대기 자세 보정을 준비하지 못했습니다.");
    expect(legVerticesInsideBook(vrm, book, fit) > 0).toBe(overlaps);
    pass.run();
    expect(legVerticesInsideBook(vrm, book, fit)).toBe(0);
    const cleared = original();
    expect(cleared.some((component, i) => Math.abs(component - input[i]!) > 1e-5)).toBe(overlaps);
    pass.run();
    expect(original()).toEqual(cleared);
    expect(pass.release()).toBe(overlaps);
    expect(original()).toEqual(input);
    if (overlaps) {
      pass.run();
      const arm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
      if (!arm) throw new Error("왼팔 뼈가 없습니다.");
      arm.rotateX(0.06);
      const authored = original();
      expect(pass.release()).toBe(false);
      expect(original()).toEqual(authored);
    }
  }, 120_000);
});
