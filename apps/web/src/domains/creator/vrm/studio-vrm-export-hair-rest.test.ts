import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { AVATAR_FORGE_PRESETS } from "./studio-vrm-avatar-forge";
import { createStudioVrmGenerateRecipe, exportStudioVrmFromGenerateRecipe } from "./studio-vrm-generate-recipe";

import type { VRM } from "@pixiv/three-vrm";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

// GLTFLoader의 브라우저 전역 조회만 제공하는 Node용 경계다. 렌더러나 물리는 대체하지 않는다.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });

async function load(bytes: Uint8Array<ArrayBuffer>): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(bytes.slice().buffer, "", resolve, reject));
  return gltf.userData.vrm as VRM;
}

type GravityMode = "authored" | "zero";
type ColliderMode = "authored" | "removed" | "oversized";

async function settledHair(bytes: Uint8Array<ArrayBuffer>, gravity: GravityMode, colliders: ColliderMode) {
  const vrm = await load(bytes);
  const joints = [...(vrm.springBoneManager?.joints ?? [])];
  const head = vrm.humanoid?.getNormalizedBoneNode("head");
  if (!head) throw new Error("생성한 VRM의 머리 본이 없습니다.");
  vrm.scene.updateMatrixWorld(true);
  const skull = head.getWorldPosition(new Vector3());
  const rest = joints.map((joint) => joint.bone.getWorldPosition(new Vector3()));
  const lengths = joints.map((joint) => joint.child
    ? joint.child.getWorldPosition(new Vector3()).distanceTo(joint.bone.getWorldPosition(new Vector3())) : 0);
  const authoredGravity = joints.map((joint) => joint.settings.gravityPower);
  expect(authoredGravity.every(Number.isFinite)).toBe(true);
  if (joints.length > 0) expect(authoredGravity.some((power) => power > 0)).toBe(true);
  for (const joint of joints) {
    // 비교군에서 바꾸는 것은 이 두 독립 조건뿐이다. 시간·스프링 강성·저항·hitRadius는 같다.
    expect(joint.colliderGroups.map((group) => group.name)).toEqual(["Torso", "Skull"]);
    if (gravity === "zero") joint.settings.gravityPower = 0;
    if (colliders === "removed") joint.colliderGroups = [];
  }
  if (colliders === "oversized") {
    for (const collider of vrm.springBoneManager?.colliders ?? []) {
      if (!("radius" in collider.shape) || typeof collider.shape.radius !== "number") {
        throw new Error("음성 대조에 필요한 구/캡슐 콜라이더가 없습니다.");
      }
      collider.shape.radius += 0.05;
    }
  }
  const tuning = joints.map((joint) => ({ ...joint.settings, gravityDir: joint.settings.gravityDir.toArray() }));
  let penultimate = rest;
  for (let step = 0; step < 200; step += 1) {
    if (step === 199) penultimate = joints.map((joint) => joint.bone.getWorldPosition(new Vector3()));
    vrm.update(1 / 60);
  }
  vrm.scene.updateMatrixWorld(true);
  const positions = joints.map((joint, index) => {
    const point = joint.bone.getWorldPosition(new Vector3());
    expect([...point.toArray(), ...joint.bone.quaternion.toArray()].every(Number.isFinite)).toBe(true);
    expect(joint.bone.quaternion.length()).toBeCloseTo(1, 6);
    if (joint.child) {
      expect(point.distanceTo(joint.child.getWorldPosition(new Vector3()))).toBeCloseTo(lengths[index], 6);
    }
    return point;
  });
  return { names: joints.map((joint) => joint.bone.name), positions, rest, skull, tuning,
    lastStep: Math.max(0, ...positions.map((point, index) => point.distanceTo(penultimate[index]))) };
}

function outwardDifference(withCollider: Awaited<ReturnType<typeof settledHair>>, withoutCollider: Awaited<ReturnType<typeof settledHair>>) {
  expect(withCollider.names).toEqual(withoutCollider.names);
  expect(withCollider.rest).toEqual(withoutCollider.rest);
  expect(withCollider.tuning).toEqual(withoutCollider.tuning);
  let maximum = 0;
  let worst = "";
  withCollider.positions.forEach((point, index) => {
    const direction = withCollider.rest[index].clone().sub(withCollider.skull).normalize();
    const outward = point.clone().sub(withoutCollider.positions[index]).dot(direction);
    if (outward > maximum) { maximum = outward; worst = withCollider.names[index]; }
  });
  return { maximum, worst };
}

describe("생성 VRM의 중력 처짐과 잘못된 collider 밀어냄 분리", () => {
  it.each(AVATAR_FORGE_PRESETS.flatMap(({ id }) => (["authored", "zero"] as const).map((gravity) => ({ id, gravity }))))(
    "$id · $gravity 중력에서 collider가 정지 헤어를 12mm 이상 밀지 않는다",
    async ({ id, gravity }) => {
      const bytes = exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId: id }));
      const active = await settledHair(bytes, gravity, "authored");
      const control = await settledHair(bytes, gravity, "removed");
      // 꺾인 포니테일은 중력만으로 XZ 방향도 이동한다. 같은 중력 평형을 빼야 collider만 비교된다.
      const { maximum, worst } = outwardDifference(active, control);
      expect(maximum, `${id}: ${worst} collider의 추가 밀어냄`).toBeLessThan(0.012);
      // 200번째 프레임에도 발산·진동하지 않는지 물리 길이 보존과 함께 확인한다(0.1mm 이하).
      expect(active.lastStep, `${id}: collider 사용 시 정지 평형`).toBeLessThan(0.0001);
      expect(control.lastStep, `${id}: collider 제거 시 정지 평형`).toBeLessThan(0.0001);
    }, 60_000,
  );

  it("같은 비교도 정지 헤어를 삼키는 과대 collider는 실제로 검출한다", async () => {
    const bytes = exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId: "action-pony" }));
    const active = await settledHair(bytes, "authored", "oversized");
    const control = await settledHair(bytes, "authored", "removed");
    expect(outwardDifference(active, control).maximum).toBeGreaterThan(0.012);
  });
});
