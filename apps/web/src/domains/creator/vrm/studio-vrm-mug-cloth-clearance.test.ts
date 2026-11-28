import { readFileSync } from "node:fs";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { BufferGeometry, Euler, Float32BufferAttribute, MathUtils, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";
import { expect, it } from "vitest";

import { pickNaturalIdlePose } from "../studio-pose-presets";
import { createStudioVrmGripContactPasses } from "./StudioVrmGripContactRefine";
import { resolveStudioVrmHeldPropContacts } from "./studio-vrm-held-prop-contacts";
import { createIdleGripBodyClearance, idleGripClearanceItems } from "./studio-vrm-idle-grip-body-clearance";
import { applyFingerRotations, applyPoseToVrm, correctVrmHangingHandPalmTwist, stripFingerBones } from "./studio-vrm-poser-utils";
import { retargetStudioVrmPresetTorso } from "./studio-vrm-preset-torso";
import { createAutoGripFingerOverrides, inspectAutoGripReadiness, measureVrmPropRigMetrics, resolvePropAttachment } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

async function load(file: string, loader = new GLTFLoader()) {
  return loader.parseAsync(Uint8Array.from(readFileSync(file)).buffer, "");
}

function meshGeometry(mesh: Mesh, world: Matrix4) {
  const positions: number[] = [], vertex = new Vector3();
  for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(world);
    positions.push(vertex.x, vertex.y, vertex.z);
  }
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
  if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
  return geometry;
}

it("알리시아의 실제 치맛단과 컵 교선을 제거하고 두 손의 주 소품·사용자 보조점·원고를 유지한다", async () => {
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await load("apps/web/public/vrm/AliciaSolid.vrm", loader), vrm: VRM = gltf.userData.vrm;
  VRMUtils.combineSkeletons(gltf.scene);
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  const cup = (await load("apps/web/public/assets/3d/everyday_mug.glb")).scene;
  const cupBody = cup.getObjectByName("Mug_CeramicBody"), skirt = vrm.scene.getObjectByName("cloth");
  const mug = createPropInstance("mug", "right-mug"), book = createPropInstance("book", "left-book"), def = propDefById("mug");
  const hand = vrm.humanoid.getNormalizedBoneNode("rightHand"), opposite = vrm.humanoid.getNormalizedBoneNode("leftHand");
  if (!(cupBody instanceof Mesh) || !(skirt instanceof SkinnedMesh) || !mug?.rig || !book?.rig?.secondary || !def || !hand || !opposite) {
    throw new Error("원본 머그·치마·손 장착점이 없습니다.");
  }
  const metrics = measureVrmPropRigMetrics(vrm), pose = pickNaturalIdlePose("alicia"), items = [mug, book];
  const manuscript = JSON.stringify(items);
  const effect = resolveStudioVrmHeldPropContacts(items, metrics);
  expect(effect[1]?.rig?.secondary?.enabled).toBe(false);
  expect(resolveStudioVrmHeldPropContacts([book], metrics)[0]?.rig?.secondary?.enabled).toBe(true);
  const customBook = { ...book, rig: { ...book.rig, secondary: { ...book.rig.secondary, influence: 0.37 } } };
  expect(resolveStudioVrmHeldPropContacts([mug, customBook], metrics)[1]).toBe(customBook);
  const manualMug = { ...mug, rig: { ...mug.rig, mode: "custom" as const, autoFingerPose: false } };
  expect(idleGripClearanceItems([manualMug, book], metrics, pose.id)).toEqual([book]);
  expect(createAutoGripFingerOverrides([manualMug, book], propDefById, metrics).rightIndexProximal).toBeUndefined();
  expect(inspectAutoGripReadiness(mug, items, propDefById, metrics).kind).toBe("ready");
  const fingers = createAutoGripFingerOverrides(items, propDefById, metrics);
  expect(fingers.rightIndexProximal).toEqual(createAutoGripFingerOverrides([mug], propDefById, metrics).rightIndexProximal);
  expect(fingers.leftMiddleProximal).toEqual(createAutoGripFingerOverrides([book], propDefById, metrics).leftMiddleProximal);
  expect(idleGripClearanceItems(items, metrics, pose.id)).toEqual(items);
  const hat = createPropInstance("beret", "headwear");
  if (!hat) throw new Error("베레모 장착점이 없습니다.");
  expect(idleGripClearanceItems([hat, ...items], metrics, pose.id)).toEqual(items);
  expect(createAutoGripFingerOverrides([hat, ...items], propDefById, metrics)).toEqual(fingers);
  for (const other of ["walk", "custom-manuscript", undefined]) expect(idleGripClearanceItems(items, metrics, other)).toEqual([]);
  expect(idleGripClearanceItems([{ ...mug, rig: { ...mug.rig, anchorId: "primary" } }], metrics, pose.id)).toEqual([]);
  expect(createIdleGripBodyClearance(vrm, mug, metrics, cup, ["rightLowerArm"])).toBeNull();
  applyPoseToVrm(vrm, retargetStudioVrmPresetTorso(vrm, stripFingerBones(pose.bones)), pose.yOffset ?? 0, undefined, { skipPalmCorrect: true });
  applyFingerRotations(vrm, fingers); correctVrmHangingHandPalmTwist(vrm);
  vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true); cup.updateMatrixWorld(true);
  const fit = resolvePropAttachment(def, mug, metrics);
  const local = new Quaternion().setFromEuler(new Euler(...fit.rotationDeg.map(MathUtils.degToRad)));
  // 독립적으로 실제 치맛단의 스키닝 후 삼각형과 컵 몸통의 원본 인덱스를 월드 좌표에서 비교한다.
  const garment = new MeshBVH(meshGeometry(skirt, skirt.matrixWorld));
  function bodyHitsCloth() {
    const rotation = hand!.getWorldQuaternion(new Quaternion()).multiply(local);
    const origin = hand!.localToWorld(new Vector3(...fit.socketPosition))
      .sub(new Vector3(...fit.anchor.position).multiplyScalar(fit.scale).applyQuaternion(rotation));
    const world = new Matrix4().compose(origin, rotation, new Vector3().setScalar(fit.scale)).multiply(cupBody!.matrixWorld);
    return garment.intersectsGeometry((cupBody as Mesh).geometry, world);
  }
  const original = hand.getWorldPosition(new Vector3()), rotation = hand.getWorldQuaternion(new Quaternion());
  const otherWrist = opposite.getWorldPosition(new Vector3());
  const pass = createIdleGripBodyClearance(vrm, mug, metrics, cup, []);
  if (!pass) throw new Error("기본 머그 보정을 만들 수 없습니다.");
  expect(bodyHitsCloth()).toBe(true);
  expect(pass.runUntil(-Infinity)).toBe(false);
  expect(pass.release()).toBe(false);
  let slices = 0;
  while (!pass.runUntil(performance.now() + 1)) {
    expect(hand.getWorldPosition(new Vector3()).distanceTo(original)).toBeLessThan(1e-8);
    slices++;
  }
  expect(slices).toBeGreaterThan(0);
  expect(pass.runUntil(-Infinity)).toBe(true);
  expect(bodyHitsCloth()).toBe(false);
  const shifted = hand.getWorldPosition(new Vector3());
  expect(shifted.distanceTo(original)).toBeGreaterThan(0.001);
  expect(hand.getWorldQuaternion(new Quaternion()).angleTo(rotation)).toBeLessThan(1e-6);
  expect(opposite.getWorldPosition(new Vector3()).distanceTo(otherWrist)).toBeLessThan(1e-8);
  createStudioVrmGripContactPasses(vrm, items, metrics, []).forEach(contact => contact.run());
  pass.run();
  expect(hand.getWorldPosition(new Vector3()).distanceTo(shifted)).toBeLessThan(1e-8);
  expect(pass.release()).toBe(true);
  expect(hand.getWorldPosition(new Vector3()).distanceTo(original)).toBeLessThan(1e-8);
  expect(JSON.stringify(items)).toBe(manuscript);
}, 120_000);
