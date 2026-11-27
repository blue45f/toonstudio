import { Bone, BufferGeometry, Euler, Float32BufferAttribute, Group, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createMicrophoneThumbContactPass } from "./studio-vrm-microphone-thumb-contact";
import { DEFAULT_VRM_PROP_RIG_METRICS, resolvePropAttachment } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";

import type { ResolvedPropAttachment } from "./studio-vrm-prop-rig";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

function fixture(withSkin = true) {
  const scene = new Group();
  const wrist = new Bone(), root = new Bone(), proximal = new Bone(), distal = new Bone();
  scene.add(wrist);
  wrist.add(root); root.add(proximal); proximal.add(distal);
  root.position.set(-0.032, 0, 0.002);
  proximal.position.x = 0.026;
  distal.position.x = 0.029;
  const nodes: Partial<Record<VRMHumanBoneName, Bone>> = {
    rightHand: wrist, rightThumbMetacarpal: root, rightThumbProximal: proximal, rightThumbDistal: distal,
  };
  const positions: number[] = [], weights: number[] = [], indices: number[] = [];
  scene.updateMatrixWorld(true);
  for (const [i, bone] of [proximal, distal].entries()) {
    for (const t of [0, 0.5, 1]) {
      for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        const p = bone.localToWorld(new Vector3(t * (i ? 0.018 : 0.029), 0.006 * Math.cos(angle), 0.006 * Math.sin(angle)));
        positions.push(p.x, p.y, p.z);
        indices.push(i + 2, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  scene.add(mesh);
  mesh.bind(new Skeleton([wrist, root, proximal, distal]));
  mesh.visible = withSkin;

  const humanoid = { getNormalizedBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
    getRawBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null, update() {} };
  const vrm = { scene, humanoid } as unknown as VRM;
  const microphone = propDefById("mic");
  const instance = createPropInstance("mic", "thumb-contact");
  if (!microphone || !instance) throw new Error("Missing microphone fixture");
  const resolved = resolvePropAttachment(microphone, instance, DEFAULT_VRM_PROP_RIG_METRICS);
  const fit: ResolvedPropAttachment = {
    ...resolved,
    anchor: { ...resolved.anchor, position: [0, -0.025, 0] },
    socketPosition: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    scale: 1,
  };
  function measure() {
    scene.updateMatrixWorld(true);
    let deepest = 0, gap = Infinity;
    for (let i = 0; i < positions.length / 3; i++) {
      const point = wrist.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, new Vector3())));
      const signed = Math.hypot(point.x, point.z) - 0.012;
      deepest = Math.max(deepest, -signed);
      gap = Math.min(gap, Math.abs(signed));
    }
    return { deepest, gap };
  }
  const pose = () => [root, proximal, distal].flatMap(node => node.quaternion.toArray());
  return { wrist, root, proximal, distal, nodes, fit, vrm, pose, measure };
}

describe("마이크 자동 그립의 엄지 접촉", () => {
  it("손잡이를 가로지른 중간 마디를 빼내고 끝마디를 손잡이 표면에 둔다", () => {
    const f = fixture();
    const original = f.pose();
    const pass = createMicrophoneThumbContactPass(f.vrm, "right", f.fit, 0.08, [])!;
    expect(f.measure().deepest).toBeGreaterThan(0.005);
    pass.run();
    expect(f.measure().deepest).toBeLessThan(0.002);
    expect(f.measure().gap).toBeLessThan(0.003);
    const fitted = f.pose();
    f.wrist.rotation.copy(new Euler(0, 0, Math.PI / 4));
    pass.run();
    expect(f.pose()).toEqual(fitted);
    expect(pass.release()).toBe(true);
    expect(f.pose()).toEqual(original);
  });

  it("모델·잠금·기존 앵커의 저작 권한을 지킨다", () => {
    const f = fixture(false);
    expect(createMicrophoneThumbContactPass(f.vrm, "right", f.fit, 0.08, ["rightThumbDistal"])).toBeNull();
    expect(createMicrophoneThumbContactPass(f.vrm, "right", f.fit, 0.08, ["rightHand"])).toBeNull();
    const old = { ...f.fit, anchor: { ...f.fit.anchor, id: "primary" } };
    expect(createMicrophoneThumbContactPass(f.vrm, "right", old, 0.08, [])).toBeNull();
    const pass = createMicrophoneThumbContactPass(f.vrm, "right", f.fit, 0.08, [])!;
    pass.run();
    f.proximal.rotation.y += 0.04;
    const authored = f.pose();
    expect(pass.release()).toBe(false);
    expect(f.pose()).toEqual(authored);
    delete f.nodes.rightThumbDistal;
    expect(createMicrophoneThumbContactPass(f.vrm, "right", f.fit, 0.08, [])).toBeNull();
  });
});
