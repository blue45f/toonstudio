import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import {
  Bone, BufferGeometry, Float32BufferAttribute, Group, MeshBasicMaterial,
  Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { measureStudioVrmHeadSurface, studioVrmHeadwearSurfaceSocket } from "./studio-vrm-head-surface";
import { measureVrmPropRigMetrics, resolvePropAttachment, sanitizeVrmPropRigMetrics, scaleVrmPropRigMetrics } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;
const fixtures = new Map<string, Promise<VRM>>();
function fixture(name: string): Promise<VRM> {
  const existing = fixtures.get(name);
  if (existing) return existing;
  const pending = (async () => {
    const bytes = readFileSync(join(process.cwd(), "apps/web/public/vrm", name));
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
    const vrm = gltf.userData.vrm as VRM;
    if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    return vrm;
  })();
  fixtures.set(name, pending);
  return pending;
}

/**
 * AvatarSample_B.vrm 은 권리 사유(VRoidPreset 약관은 CC0 아님)로 저장소에서 제거됐다 — apps/web/public/vrm/LICENSES.md.
 * B 는 "눈 본이 있고 머리카락이 정수리 위로 솟은" VRM0 모델 하나로 두 분기를 함께 덮고 있었다.
 * 저장소의 CC0 모델 중에는 그 두 성질을 함께 가진 것이 없어 성질별로 나눠 대체한다(분기마다 커버리지는 그대로다).
 * - sample.vrm(VRM1)·Sendagaya_Shibu.vrm(VRM0, VRoid 베타 CC0): 눈 본이 있어 실제 눈 높이 경로를 덮는다.
 * - Anna.vrm(VRM0, 100Avatars R3 CC0): 눈 본이 없어 눈 높이 유도 경로를, 머리카락이 정수리보다 높이 솟아
 *   hairClearanceRequired 분기를 덮는다.
 */
const FIXTURES = [
  { filename: "sample.vrm", eyeBones: true, hairClearance: false },
  { filename: "Sendagaya_Shibu.vrm", eyeBones: true, hairClearance: false },
  { filename: "Anna.vrm", eyeBones: false, hairClearance: true },
] as const;

for (const { filename, eyeBones, hairClearance } of FIXTURES) {
  describe(`surface-derived wearable fit: ${filename}`, () => {
    it("measures the skull surface instead of the neck-to-head pivot gap", async () => {
      const vrm = await fixture(filename);
      const surface = measureStudioVrmHeadSurface(vrm)!;
      expect(surface).not.toBeNull();
      expect(surface.head).toBeGreaterThan(0.18);
      expect(surface.head).toBeLessThan(0.27);
      expect(surface.eyeDistance).toBeGreaterThan(0.06);
      expect(surface.eyeDistance).toBeLessThan(0.10);
      expect(["derived", "measured"]).toContain(surface.eyeDistanceSource);
      expect(Boolean(surface.faceSocket.hairClearanceRequired)).toBe(hairClearance);
      expect(surface.faceSocket.surfaceCrownHeight).toBeGreaterThan(0.18);
      expect(surface.faceSocket.surfaceCrownHeight).toBeLessThan(0.28);
      expect(measureVrmPropRigMetrics(vrm).head).toBeCloseTo(surface.head, 5);
    });

    it("places eyewear at the actual eye height and on the visible front in VRM0 and VRM1", async () => {
      const vrm = await fixture(filename);
      const metrics = measureVrmPropRigMetrics(vrm);
      const head = vrm.humanoid.getNormalizedBoneNode("head")!;
      const eyes = ["leftEye", "rightEye"] as const;
      const eyeNodes = eyes.flatMap((name) => {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        return node ? [node] : [];
      });
      // 픽스처의 성질을 명시해, 모델이 바뀌어도 조용히 다른 경로를 타며 통과하지 않게 한다.
      expect(eyeNodes.length === eyes.length).toBe(eyeBones);
      if (eyeBones) {
        const eyeY = eyeNodes.map((node) => head.worldToLocal(node.getWorldPosition(new Vector3())).y);
        expect(metrics.faceSocket.position[1]).toBeCloseTo(eyeY.reduce((sum, y) => sum + y, 0) / eyeY.length, 5);
      } else {
        // 눈 본이 없으면 정수리 높이에서 눈 높이를 유도한다 — 목 피벗이 아니라 얼굴 한가운데쯤이어야 한다.
        const crown = metrics.faceSocket.surfaceCrownHeight ?? 0;
        expect(crown).toBeGreaterThan(0.18);
        expect(metrics.faceSocket.position[1]).toBeGreaterThan(crown * 0.45);
        expect(metrics.faceSocket.position[1]).toBeLessThan(crown * 0.65);
      }
      const world = head.localToWorld(new Vector3(...metrics.faceSocket.position));
      expect(world.z - head.getWorldPosition(new Vector3()).z).toBeGreaterThan(0.05);
      const expectedYaw = vrm.meta.metaVersion === "0" ? Math.PI : 0;
      const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), expectedYaw);
      expect(new Quaternion(...metrics.faceSocket.rotationQuaternion).angleTo(expected)).toBeLessThan(0.00001);
      const item = createPropInstance("sunglasses", "head-surface-test")!;
      const attached = resolvePropAttachment(propDefById("sunglasses")!, item, metrics);
      expect(attached.socketPosition).toEqual(metrics.faceSocket.position);
      expect(attached.scale).toBeGreaterThan(1);
    });

    it("uses reviewed crown contacts, preserves local sockets under body scaling and respects explicit bones", async () => {
      const metrics = measureVrmPropRigMetrics(await fixture(filename));
      const crown = metrics.faceSocket.surfaceCrownHeight!;
      for (const id of [
        "cap",
        "beret",
        "beanie",
        "headphones",
        "earmuffs",
        "elfEars",
        "ribbon",
        "hairpin",
        "crown",
        "surgicalCap",
        "headband",
        "flowerCrown",
        "catEars",
        "horns",
        "halo",
        "blender_tactical_helmet",
        "blender_wizard_hat",
      ]) {
        const socket = studioVrmHeadwearSurfaceSocket(id, "head", metrics.faceSocket)!;
        expect(socket).not.toBeNull();
        expect(socket.position[1]).toBeGreaterThan(0.04);
        expect(socket.position[1]).toBeLessThan(crown + 0.02);
        const instance = createPropInstance(id, `surface-${id}`)!;
        expect(resolvePropAttachment(propDefById(id)!, instance, metrics).socketPosition).toEqual(socket.position);
        expect(studioVrmHeadwearSurfaceSocket(id, "neck", metrics.faceSocket)).toBeNull();
        expect(studioVrmHeadwearSurfaceSocket(id, "rightHand", metrics.faceSocket)).toBeNull();
      }
      const scaled = scaleVrmPropRigMetrics(metrics, { height: 1.3, width: 1.1 });
      expect(scaled.faceSocket).toEqual(metrics.faceSocket);
      expect(scaled.head).toBeCloseTo(metrics.head * 1.1, 5);
      expect(scaled.eyeDistance).toBeCloseTo(metrics.eyeDistance * 1.1, 5);
    });

    it("does not rewrite legacy placement or apply a new headwear socket in manual mode", async () => {
      const metrics = measureVrmPropRigMetrics(await fixture(filename));
      const definition = propDefById("cap")!;
      const item = createPropInstance("cap", "saved-cap")!;
      item.position = [0.02, 0.13, 0.03];
      item.rotationDeg = [10, 20, 30];
      delete item.rig;
      const attached = resolvePropAttachment(definition, item, metrics);
      expect(attached.position).toEqual(item.position);
      expect(attached.rotationDeg).toEqual(item.rotationDeg);
      expect(attached.usesSmartRig).toBe(false);
      const manual = createPropInstance("cap", "manual-cap")!;
      manual.rig = { ...manual.rig!, mode: "custom" };
      expect(resolvePropAttachment(definition, manual, metrics).socketPosition).toEqual(definition.defaultPosition);
    });
  });
}

describe("앞머리가 있는 통합 메시의 안경 피팅", () => {
  it("앞머리를 길게 돌출해도 안경 접촉 깊이는 얼굴 표면을 따른다", () => {
    const scene = new Group();
    const head = new Bone();
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    for (const depth of [0.07, 0.15]) {
      for (let row = 0; row < 18; row++) {
        for (let column = 0; column < 24; column++) {
          positions.push((column / 23 - 0.5) * 0.18, 0.01 + row / 17 * 0.2, depth);
        }
      }
    }
    const count = positions.length / 3;
    const faceCount = count / 2;
    const weights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex++) weights[vertex * 4] = 1;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    geometry.addGroup(0, faceCount, 0);
    geometry.addGroup(faceCount, faceCount, 1);
    const skin = new MeshBasicMaterial();
    const bangs = new MeshBasicMaterial();
    skin.name = "Face";
    bangs.name = "Hair";
    const mesh = new SkinnedMesh(geometry, [skin, bangs]);
    scene.add(head, mesh);
    mesh.bind(new Skeleton([head]));
    const bone = (name: string) => name === "head" ? head : null;
    const vrm = { scene, humanoid: { getRawBoneNode: bone, getNormalizedBoneNode: bone } } as unknown as VRM;

    const metrics = measureVrmPropRigMetrics(vrm);
    expect(metrics.faceSocket.surfaceMeasured).toBe(true);
    expect(metrics.faceSocket.position[2]).toBeCloseTo(0.074, 5);
    const glasses = createPropInstance("glasses", "glasses-with-bangs")!;
    const equipped = resolvePropAttachment(propDefById("glasses")!, glasses, metrics);
    expect(equipped.socketPosition[2]).toBeCloseTo(0.068, 5);
  });
});

describe("surface fitting fallback", () => {
  it("keeps partial rigs and old metrics on the existing fallback path", () => {
    const partial = { scene: new Group(), humanoid: { getNormalizedBoneNode: () => null } } as unknown as VRM;
    expect(measureStudioVrmHeadSurface(partial)).toBeNull();
    const metrics = sanitizeVrmPropRigMetrics(null);
    expect(metrics.faceSocket.surfaceMeasured).toBeUndefined();
    expect(studioVrmHeadwearSurfaceSocket("cap", "head", metrics.faceSocket)).toBeNull();
    expect(studioVrmHeadwearSurfaceSocket("unknown", "head", metrics.faceSocket)).toBeNull();
  });
});

describe("reviewed hanging-handle orientation", () => {
  it("keeps the medical bag below its handle without moving the serialized contact", () => {
    const primary = propDefById("medicalBag")!.anchors.find((anchor) => anchor.role === "primary")!;
    expect(primary.position).toEqual([0, 0.155, 0]);
    expect(primary.forward).toEqual([0, -1, 0]);
    expect(primary.up).toEqual([0, 0, 1]);
  });
});

describe("베레모·비니의 원본 헤어 맞춤과 안경의 콧대 접촉", () => {
  it("원래 머리 둘레에 닿는 높이에서 베레모 기울기와 비니 크기를 유지한다", async () => {
    const metrics = measureVrmPropRigMetrics(await fixture("sample.vrm"));
    const crown = metrics.faceSocket.surfaceCrownHeight!;
    const beretSocket = studioVrmHeadwearSurfaceSocket("beret", "head", metrics.faceSocket)!;
    expect(beretSocket.position[0]).toBeLessThan(-0.015);
    expect(beretSocket.position[2]).toBeLessThan(-0.01);
    expect(Math.abs(beretSocket.rotationDeg[2])).toBeCloseTo(14, 1);

    const beretInstance = createPropInstance("beret", "beret-curve-fit")!;
    const attached = resolvePropAttachment(propDefById("beret")!, beretInstance, metrics);
    expect(attached.socketPosition).toEqual(beretSocket.position);
    expect(Math.abs(attached.rotationDeg[2])).toBeCloseTo(14, 1);
    expect(attached.scale).toBeLessThan(1.06);
    const legacy = { ...metrics.faceSocket, beretRimLift: undefined, beanieRimLift: undefined, beanieRimDepth: undefined };
    for (const [id, fraction] of [["beret", 0.74], ["beanie", 0.70]] as const) {
      const seated = studioVrmHeadwearSurfaceSocket(id, "head", metrics.faceSocket)!;
      const original = studioVrmHeadwearSurfaceSocket(id, "head", legacy)!;
      expect(original.position[1]).toBeCloseTo(crown * fraction, 5);
      const lift = seated.position[1] - original.position[1];
      expect(lift).toBeGreaterThan(0.012);
      expect(lift).toBeLessThanOrEqual(id === "beanie" ? 0.027 : 0.025);
      if (id === "beanie") {
        expect(seated.position[2]).toBeLessThan(-0.003);
        expect(seated.position[2]).toBeGreaterThan(-0.01);
      }
      const item = createPropInstance(id)!;
      const definition = propDefById(id)!;
      const previousMetrics = { ...metrics, faceSocket: legacy };
      expect(resolvePropAttachment(definition, item, metrics).scale).toBe(resolvePropAttachment(definition, item, previousMetrics).scale);
      item.rig = { ...item.rig!, mode: "custom" };
      expect(resolvePropAttachment(definition, item, metrics)).toEqual(resolvePropAttachment(definition, item, previousMetrics));
    }
    for (const id of ["cap", "glasses", "headphones"]) {
      expect(studioVrmHeadwearSurfaceSocket(id, "head", metrics.faceSocket)?.position)
        .toEqual(studioVrmHeadwearSurfaceSocket(id, "head", legacy)?.position);
    }
    expect(sanitizeVrmPropRigMetrics(metrics).faceSocket).toEqual(metrics.faceSocket);
    const invalid = { ...metrics, faceSocket: { ...metrics.faceSocket, beretRimLift: -0.02, beanieRimLift: 1.5 } };
    expect(sanitizeVrmPropRigMetrics(invalid).faceSocket).toMatchObject({ surfaceCrownHeight: crown });
    expect(sanitizeVrmPropRigMetrics(invalid).faceSocket.beretRimLift).toBeUndefined();
    expect(sanitizeVrmPropRigMetrics(invalid).faceSocket.beanieRimLift).toBeUndefined();
  });

  it("안경은 콧대 표면 접촉으로 6mm 밀착되고 eyeDistance 기반 광학 스케일·전경각을 적용한다", async () => {
    const metrics = measureVrmPropRigMetrics(await fixture("sample.vrm"));
    const glassesSocket = studioVrmHeadwearSurfaceSocket("glasses", "head", metrics.faceSocket)!;
    expect(glassesSocket.position[2]).toBeCloseTo(metrics.faceSocket.position[2] - 0.006, 5);
    expect(glassesSocket.position[1]).toBeLessThan(metrics.faceSocket.position[1]);

    const glassesInstance = createPropInstance("glasses", "glasses-bridge-fit")!;
    const attached = resolvePropAttachment(propDefById("glasses")!, glassesInstance, metrics);
    expect(attached.socketPosition).toEqual(glassesSocket.position);
    expect(attached.rotationDeg[0]).toBeCloseTo(4, 1);
    expect(attached.scale).toBeGreaterThan(0.95);
    expect(attached.scale).toBeLessThan(1.08);
  });
});
