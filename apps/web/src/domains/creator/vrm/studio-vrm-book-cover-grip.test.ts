import { readFileSync } from "node:fs";

import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler, MathUtils, Mesh, Quaternion, Ray, SkinnedMesh, Triangle, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { pickNaturalIdlePose } from "../studio-pose-presets";
import { createStudioVrmGripContactPasses } from "./StudioVrmGripContactRefine";
import { applyFingerRotations, applyPoseToVrm, correctVrmHangingHandPalmTwist, stripFingerBones } from "./studio-vrm-poser-utils";
import { createAutoGripFingerOverrides, measureVrmPropRigMetrics, resolvePropAttachment } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

async function loadAsset(file: string, loader: GLTFLoader) {
  const bytes = readFileSync(file);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

async function bookSurfaces() {
  const book = await loadAsset("apps/web/public/assets/3d/everyday_book.glb", new GLTFLoader());
  book.scene.updateMatrixWorld(true);
  const parts: Triangle[][] = [];
  book.scene.traverseVisible(mesh => {
    if (!(mesh instanceof Mesh) || !/^Book_(BackCover|FrontCover|Spine|PageBlock|LeftGripEdge)$/.test(mesh.name)) return;
    const positions = mesh.geometry.getAttribute("position");
    const indices = mesh.geometry.index;
    const vertex = (i: number) => new Vector3().fromBufferAttribute(positions, indices?.getX(i) ?? i).applyMatrix4(mesh.matrixWorld);
    const triangles: Triangle[] = [];
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      triangles.push(new Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
    }
    parts.push(triangles);
  });
  expect(parts).toHaveLength(5);
  return parts;
}

function drawnFingerVertices(vrm: VRM, side: "left" | "right", digit: "Thumb" | "Index" | "Middle") {
  const segments = digit === "Thumb" ? ["Metacarpal", "Proximal", "Distal"] as const : ["Proximal", "Intermediate", "Distal"] as const;
  const bones = segments.map(segment => vrm.humanoid.getRawBoneNode(`${side}${digit}${segment}` as VRMHumanBoneName));
  const points: Vector3[] = [];
  vrm.scene.traverseVisible(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const membership = mesh.skeleton.bones.map(bone => bones.includes(bone));
    if (!membership.some(Boolean)) return;
    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const drawOrder = mesh.geometry.index;
    const count = drawOrder?.count ?? indices.count;
    const geometry = mesh.geometry as import("three").BufferGeometry;
    const material = mesh.material;
    const groups = Array.isArray(material)
      ? geometry.groups.filter(group => material[group.materialIndex ?? 0]?.visible)
      : material.visible ? [{ start: 0, count }] : [];
    const seen = new Set<number>();
    for (const group of groups) {
      const start = Math.max(group.start, mesh.geometry.drawRange.start);
      const end = Math.min(count, group.start + group.count, mesh.geometry.drawRange.start + mesh.geometry.drawRange.count);
      for (let j = start; j < end; j++) {
        const i = drawOrder?.getX(j) ?? j;
        if (seen.has(i)) continue;
        seen.add(i);
        let weight = 0;
        for (let k = 0; k < 4; k++) {
          if (membership[indices.getComponent(i, k)]) weight += weights.getComponent(i, k);
        }
        if (weight >= 0.5) points.push(mesh.localToWorld(mesh.getVertexPosition(i, new Vector3())));
      }
    }
  });
  return points;
}

function measureContact(points: Vector3[], parts: Triangle[][]) {
  const ray = new Ray(new Vector3(), new Vector3(0.13, 0.21, 0.968).normalize());
  const hit = new Vector3();
  let gap = Infinity, deepest = 0;
  for (const point of points) {
    ray.origin.copy(point);
    for (const part of parts) {
      const crossings: number[] = [];
      let nearest = Infinity;
      for (const triangle of part) {
        nearest = Math.min(nearest, triangle.closestPointToPoint(point, hit).distanceTo(point));
        if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) {
          const distance = ray.origin.distanceTo(hit);
          if (!crossings.some(other => Math.abs(other - distance) < 1e-7)) crossings.push(distance);
        }
      }
      gap = Math.min(gap, nearest);
      if (crossings.length % 2 === 1) deepest = Math.max(deepest, nearest);
    }
  }
  return { gap, deepest };
}

describe("원본 양장본과 스키닝된 손가락의 접촉", () => {
  it.each([
    ["sample-vrm", "sample.vrm", "left"],
    ["ts-vrm-hero-v1-chibi-mascot", "toonstudio-hero-v1/chibi-mascot.vrm", "right"],
  ] as const)("%s %s %s의 엄지와 검지·중지가 책 겉면에 닿는다", async (id, file, side) => {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await loadAsset(`apps/web/public/vrm/${file}`, loader);
    const vrm: VRM = gltf.userData.vrm;
    if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
    const metrics = measureVrmPropRigMetrics(vrm);
    const pose = pickNaturalIdlePose(id);
    applyPoseToVrm(vrm, stripFingerBones(pose.bones), pose.yOffset ?? 0, undefined, { skipPalmCorrect: true });
    const book = createPropInstance("book", "book-cover");
    const def = propDefById("book");
    if (!book?.rig?.secondary || !def) throw new Error("책의 양손 장착점이 없습니다.");
    const item = { ...book, bone: `${side}Hand` as const, rig: {
      ...book.rig, secondary: { ...book.rig.secondary, bone: side === "left" ? "rightHand" as const : "leftHand" as const },
    } };
    applyFingerRotations(vrm, createAutoGripFingerOverrides([item], propDefById, metrics));
    correctVrmHangingHandPalmTwist(vrm);
    const passes = createStudioVrmGripContactPasses(vrm, [item], metrics, []);
    expect(passes).toHaveLength(5);
    expect(createStudioVrmGripContactPasses(vrm, [item], metrics, [`${side}IndexDistal`])).toHaveLength(4);
    expect(createStudioVrmGripContactPasses(vrm, [{ ...item, rig: { ...item.rig, mode: "custom" } }], metrics, [])).toHaveLength(0);
    passes.forEach(pass => pass.run());
    vrm.humanoid.update();
    vrm.scene.updateMatrixWorld(true);
    const fit = resolvePropAttachment(def, item, metrics);
    const hand = vrm.humanoid.getNormalizedBoneNode(item.bone);
    if (!hand) throw new Error("주 손 뼈가 없습니다.");
    const grip = hand.localToWorld(new Vector3(...fit.socketPosition));
    const localRotation = new Quaternion().setFromEuler(new Euler(...fit.rotationDeg.map(MathUtils.degToRad)));
    const inverse = hand.getWorldQuaternion(new Quaternion()).multiply(localRotation).invert();
    const origin = new Vector3(...fit.anchor.position);
    const parts = await bookSurfaces();
    for (const digit of ["Thumb", "Index", "Middle"] as const) {
      const points = drawnFingerVertices(vrm, side, digit);
      expect(points.length).toBeGreaterThan(10);
      points.forEach(p => p.sub(grip).applyQuaternion(inverse).divideScalar(fit.scale).add(origin));
      const { deepest, gap } = measureContact(points, parts);
      expect(deepest, `${digit} 내부 깊이`).toBeLessThan(0.002);
      expect(gap, `${digit} 겉면 거리`).toBeLessThan(0.003);
    }
  }, 120_000);
});
