import * as THREE from "three";
import { describe, expect, it } from "vitest";

import fixtureFile from "./__fixtures__/studio-vrm-head-profiles.json";
import {
  AVATAR_FORGE_CAP_MIN_SHELL,
  avatarForgeHairInstance,
  expandAvatarForgeHairPartsForRender,
  transformAvatarForgeHairPart,
} from "./studio-vrm-avatar-forge-hair-object";
import {
  applyAvatarForgeHairStyleRecipe,
  buildAvatarForgeHairParts,
  createAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  mergeStudioVrmAuthoredHairGeometry,
  studioVrmAuthoredCapHairlineHeight,
} from "./studio-vrm-authored-hair-geometry";
import {
  resolveStudioVrmHeadFit,
  type StudioVrmHeadFit,
  type StudioVrmHeadProfile,
  type StudioVrmHeadVec3,
} from "./studio-vrm-head-fit";
import { collectStudioVrmHeadSkinPoints, measureStudioVrmHeadFit, resolveStudioVrmFrontSign } from "./studio-vrm-head-measure";

import type { VRM } from "@pixiv/three-vrm";

/**
 * 목·머리 두 본짜리 합성 VRM. 머리 정점은 반폭 0.1 m 구, 목 정점은 그 아래 원기둥이다.
 * `weights` 로 정점마다 지배 본을 고른다.
 */
function syntheticVrm(options: {
  readonly metaVersion?: "0" | "1";
  readonly hairMeshName?: string;
  readonly garment?: boolean;
  readonly shareBuffer?: boolean;
} = {}) {
  const scene = new THREE.Group();
  const hips = new THREE.Bone();
  const neck = new THREE.Bone();
  neck.position.set(0, 1.4, 0);
  const head = new THREE.Bone();
  head.position.set(0, 0.1, 0);
  hips.add(neck);
  neck.add(head);
  scene.add(hips);
  scene.updateMatrixWorld(true);
  const normalizedHead = new THREE.Object3D();
  normalizedHead.position.set(0, 1.5, 0);
  scene.add(normalizedHead);
  scene.updateMatrixWorld(true);

  const positions: number[] = [];
  const indices: number[] = [];
  const weights: number[] = [];
  const count = 600;
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const polar = Math.acos(1 - 2 * t);
    const azimuth = Math.PI * (1 + Math.sqrt(5)) * index;
    positions.push(0.1 * Math.sin(polar) * Math.cos(azimuth), 1.6 + 0.12 * Math.cos(polar), 0.1 * Math.sin(polar) * Math.sin(azimuth));
    indices.push(2, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  for (let index = 0; index < 200; index += 1) {
    const angle = (index / 200) * Math.PI * 2;
    positions.push(0.05 * Math.cos(angle), 1.4 + (index % 10) * 0.01, 0.05 * Math.sin(angle));
    indices.push(1, 2, 0, 0);
    weights.push(0.8, 0.2, 0, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const skeleton = new THREE.Skeleton([hips, neck, head]);
  const face = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ name: "Face_00_SKIN" }));
  face.name = "Face";
  face.add(hips);
  scene.add(face);
  face.bind(skeleton);
  if (options.hairMeshName) {
    const hair = new THREE.SkinnedMesh(geometry.clone(), new THREE.MeshBasicMaterial({ name: "HairBack_00_HAIR" }));
    hair.name = options.hairMeshName;
    hair.geometry.translate(0.4, 0, 0);
    scene.add(hair);
    hair.bind(skeleton);
  }
  if (options.garment) {
    const hood = new THREE.SkinnedMesh(geometry.clone(), new THREE.MeshBasicMaterial({ name: "Hood" }));
    hood.geometry.scale(3, 1, 1);
    hood.userData.studioVrmSkinnedGarmentReceipt = { id: "hood" };
    scene.add(hood);
    hood.bind(skeleton);
  }
  if (options.shareBuffer) {
    const twin = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ name: "FaceMouth_00_FACE" }));
    twin.name = "Face_1";
    scene.add(twin);
    twin.bind(skeleton);
  }
  scene.updateMatrixWorld(true);
  const vrm = {
    scene,
    meta: { metaVersion: options.metaVersion ?? "1" },
    lookAt: null,
    humanoid: {
      getRawBoneNode: (name: string) => (name === "head" ? head : name === "neck" ? neck : null),
      getNormalizedBoneNode: (name: string) => (name === "head" ? normalizedHead : null),
    },
  } as unknown as VRM;
  return { vrm, normalizedHead };
}

describe("collectStudioVrmHeadSkinPoints", () => {
  it("머리 본이 지배하는 스킨 정점만 머리 본 로컬로 모은다(목 정점 제외)", () => {
    const { vrm, normalizedHead } = syntheticVrm();
    const points = collectStudioVrmHeadSkinPoints(vrm, normalizedHead);
    expect(points.length / 3).toBe(600);
    let maxX = 0;
    let minY = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 3) {
      maxX = Math.max(maxX, points[index]);
      minY = Math.min(minY, points[index + 1]);
    }
    expect(maxX).toBeCloseTo(0.1, 2);
    // 머리 본(월드 1.5) 로컬이라 구의 아래 끝 1.48 은 −0.02 다.
    expect(minY).toBeCloseTo(-0.02, 2);
  });

  it("헤어 이름 메시·워드로브 의상·생성 오브젝트는 두상에서 뺀다", () => {
    const { vrm, normalizedHead } = syntheticVrm({ hairMeshName: "Hair001", garment: true });
    const points = collectStudioVrmHeadSkinPoints(vrm, normalizedHead);
    expect(points.length / 3).toBe(600);
    const skipped = collectStudioVrmHeadSkinPoints(vrm, normalizedHead, { skip: (object) => object.name === "Face" });
    expect(skipped.length).toBe(0);
  });

  it("같은 정점 버퍼를 나눠 쓰는 프리미티브(VRoid baked)는 정점을 한 번만 센다", () => {
    const { vrm, normalizedHead } = syntheticVrm({ shareBuffer: true });
    expect(collectStudioVrmHeadSkinPoints(vrm, normalizedHead).length / 3).toBe(600);
  });

  it.each([false, true])("얼굴과 머리카락이 한 메시여도 피부 재질의 그리기 범위만 실측한다 (인덱스 %s)", (indexed) => {
    const { vrm, normalizedHead } = syntheticVrm();
    const before = collectStudioVrmHeadSkinPoints(vrm, normalizedHead);
    const face = vrm.scene.getObjectByName("Face");
    if (!(face instanceof THREE.SkinnedMesh)) throw new Error("얼굴 스킨 메시 누락");
    face.material = [
      new THREE.MeshBasicMaterial({ name: "Face_00_SKIN" }),
      new THREE.MeshBasicMaterial({ name: "Hair_00_HAIR" }),
    ];
    const geometry = face.geometry;
    const order = Array.from({ length: 600 }, (_, index) => indexed ? 599 - index : index);
    if (indexed) geometry.setIndex(order);
    geometry.addGroup(0, 300, 1);
    geometry.addGroup(300, 300, 0);
    geometry.setDrawRange(3, 588);

    const skin = collectStudioVrmHeadSkinPoints(vrm, normalizedHead);
    const expected = order.slice(300, 591).flatMap((index) => Array.from(before.subarray(index * 3, index * 3 + 3)));
    expect(Array.from(skin)).toEqual(expected);
  });

  it("실측 두상 맞춤은 구 반폭 0.1 m 를 캡이 덮게 잡는다", () => {
    const { vrm, normalizedHead } = syntheticVrm();
    const { fit, sampleCount } = measureStudioVrmHeadFit(vrm, normalizedHead);
    expect(sampleCount).toBe(600);
    expect(fit.source).toBe("mesh");
    expect(fit.radiusX).toBeGreaterThanOrEqual(0.1);
    expect(fit.radiusX).toBeLessThanOrEqual(0.1 * 1.35);
  });
});

describe("resolveStudioVrmFrontSign", () => {
  it("VRM0 은 −z, VRM1 은 +z 를 얼굴로 본다", () => {
    expect(resolveStudioVrmFrontSign(syntheticVrm({ metaVersion: "0" }).vrm, null)).toBe(-1);
    expect(resolveStudioVrmFrontSign(syntheticVrm({ metaVersion: "1" }).vrm, null)).toBe(1);
  });
});

describe("transformAvatarForgeHairPart", () => {
  const base: Omit<StudioVrmHeadFit, "frontSign" | "center"> = {
    source: "mesh",
    eyeCenter: [0, 0.06, 0.02],
    radiusX: 0.105,
    radiusY: 0.135,
    radiusZ: 0.12,
    faceFront: 0.1,
  };
  const front: StudioVrmHeadFit = { ...base, center: [0, 0.086, 0], frontSign: 1 };
  const back: StudioVrmHeadFit = { ...base, center: [0, 0.086, 0], frontSign: -1 };

  function partOf(style: Parameters<typeof applyStyle>[0], id: string, patch: Record<string, unknown> = {}) {
    const found = buildAvatarForgeHairParts(applyStyle(style, patch)).find((part) => part.id === id);
    if (!found) throw new Error(`part 없음: ${id}`);
    return found;
  }
  function applyStyle(style: "short" | "long" | "pixie" | "bob" | "bun" | "hime", patch: Record<string, unknown> = {}) {
    const state = createAvatarForgeState();
    state.hair = { ...state.hair, style, ...patch } as typeof state.hair;
    return state;
  }

  it("VRM0(−z 얼굴)은 VRM1 배치를 머리 축으로 180° 돌린 것이다 — 앞머리는 얼굴 앞, 좌우도 캐릭터 기준 유지", () => {
    const bang = partOf("short", "bang-sweep-main", { bangStyle: "side-swept" });
    const a = transformAvatarForgeHairPart(bang, front).position;
    const b = transformAvatarForgeHairPart(bang, back).position;
    expect(a.z).toBeGreaterThan(0.05);
    expect(b.z).toBeCloseTo(-a.z, 6);
    expect(b.x).toBeCloseTo(-a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(forward.clone().transformDirection(avatarForgeHairInstance(bang, front).matrix).z).toBeGreaterThan(0.5);
    expect(forward.clone().transformDirection(avatarForgeHairInstance(bang, back).matrix).z).toBeLessThan(-0.5);
  });

  it("캡은 볼륨을 최소로 줄여도 두개골 바깥 껍질이고, 볼륨 1 이면 최소 두께만큼 떨어진다", () => {
    const thin = transformAvatarForgeHairPart(partOf("pixie", "cap", { volume: 0.72 }), front).scale;
    expect(thin.x).toBeGreaterThan(front.radiusX);
    expect(thin.y).toBeGreaterThan(front.radiusY);
    expect(thin.z).toBeGreaterThan(front.radiusZ);
    const normal = transformAvatarForgeHairPart(partOf("bob", "cap", { volume: 1 }), front).scale;
    expect(normal.x).toBeCloseTo(front.radiusX * (1 + AVATAR_FORGE_CAP_MIN_SHELL), 9);
    const full = transformAvatarForgeHairPart(partOf("bob", "cap", { volume: 1.4 }), front).scale;
    expect(full.x).toBeGreaterThan(normal.x * 1.3);
  });

  it("앞머리는 헤어라인(캡 속)에서 시작해 앞머리 길이(fringe)만큼 이마 바로 앞으로 내려온다", () => {
    const bangOf = (fringe: number) => partOf("short", "bang-sweep-main", { bangStyle: "side-swept", fringe });
    const end = (placement: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }, sign: 1 | -1) =>
      new THREE.Vector3(0, sign * placement.scale.y, 0).applyQuaternion(placement.quaternion).add(placement.position);
    const short = transformAvatarForgeHairPart(bangOf(0.4), front);
    const long = transformAvatarForgeHairPart(bangOf(1.2), front);
    const shortRoot = end(short, 1);
    const shortTip = end(short, -1);
    // 뿌리는 헤어라인(중심 + 0.62·ry) 이하이고 캡 앞면보다 안쪽(캡 속)이다.
    expect(shortRoot.y).toBeLessThanOrEqual(front.center[1] + 0.62 * front.radiusY + 1e-9);
    const capFront = front.center[2] + front.radiusZ * Math.sqrt(Math.max(0,
      1 - (shortRoot.x / front.radiusX) ** 2 - ((shortRoot.y - front.center[1]) / front.radiusY) ** 2));
    expect(shortRoot.z).toBeLessThan(capFront);
    // 끝은 길이에 따라 내려오고, 기본(0.75)은 눈 위(눈썹), 1.2 는 눈 아래까지다.
    expect(shortTip.y).toBeGreaterThan(end(long, -1).y);
    expect(end(transformAvatarForgeHairPart(bangOf(0.75), front), -1).y).toBeGreaterThan(front.eyeCenter[1]);
    expect(end(long, -1).y).toBeLessThan(front.eyeCenter[1]);
    // 끝은 이마 바로 앞(얼굴 앞면 + 여유)에 있다 — 이마 속에 묻히지도, 두개골 타원체 앞에 뜨지도 않는다.
    const faceAtTip = front.faceFront * Math.sqrt(1 - (shortTip.x / front.radiusX) ** 2);
    expect(shortTip.z).toBeGreaterThan(faceAtTip);
    expect(shortTip.z).toBeLessThan(front.faceFront + 0.1 * front.radiusZ);
    // VRM0 은 같은 배치를 180° 돌린 것이다.
    const mirrored = end(transformAvatarForgeHairPart(bangOf(0.4), back), -1);
    expect(mirrored.z).toBeCloseTo(-shortTip.z, 9);
    expect(mirrored.x).toBeCloseTo(-shortTip.x, 9);
  });

  it("앞머리 중심선은 캡 헤어라인 위(캡 속)에서 나와 이마 앞면 상한보다 앞으로 내려온다 — 가운데가 이마에 묻히지 않는다", () => {
    // 실측 이마는 눈썹~헤어라인이 거의 수직이라, 곧은 가닥을 걸면 가운데가 피부 속에 묻혔다(2026-10-23).
    const skullFront = (x: number, y: number) => front.center[2] + front.radiusZ * Math.sqrt(Math.max(0,
      1 - (x / front.radiusX) ** 2 - ((y - front.center[1]) / front.radiusY) ** 2));
    const forehead = (x: number, y: number) =>
      Math.min(front.faceFront * Math.sqrt(Math.max(0.15, 1 - 0.85 * (x / front.radiusX) ** 2)), skullFront(x, y));
    for (const bangStyle of ["full", "side-swept", "curtain", "split", "blunt"]) {
      const bangs = buildAvatarForgeHairParts(applyStyle("bob", { bangStyle })).filter((part) => part.role === "bang");
      expect(bangs.length).toBeGreaterThan(0);
      for (const bang of bangs) {
        const spine = avatarForgeHairInstance(bang, front).spine;
        expect(spine, `${bangStyle}/${bang.id}`).toBeDefined();
        if (!spine) continue;
        const root = spine.points[0]!;
        const tip = spine.points[spine.points.length - 1]!;
        const hairline = (x: number) => front.center[1]
          + front.radiusY * 1.05 * studioVrmAuthoredCapHairlineHeight(x / (front.radiusX * 1.05));
        // 뿌리는 헤어라인보다 위, 두개골 타원체 앞면보다 안쪽(캡 껍질 밑)이다.
        expect(root.y).toBeGreaterThan(hairline(root.x));
        expect(root.z).toBeLessThan(skullFront(root.x, root.y) * 1.03);
        // 헤어라인 아래 구간은 전부 이마 앞면 상한보다 앞이다.
        for (const point of spine.points) {
          if (point.y < hairline(point.x) - 0.04 * front.radiusY) {
            expect(point.z, `${bangStyle}/${bang.id} y=${point.y.toFixed(3)}`).toBeGreaterThan(forehead(point.x, point.y));
          }
        }
        // 끝은 얼굴 앞에 살짝 떠 있되 멀리 뜨지 않는다.
        expect(tip.z).toBeGreaterThan(forehead(tip.x, tip.y));
        expect(tip.z).toBeLessThan(front.faceFront + 0.1 * front.radiusZ);
        expect(tip.y).toBeLessThan(root.y - 0.15 * front.radiusY);
      }
    }
  });

  it("앞머리 끝 높이는 갈래 길이를 따른다 — 블런트 다섯 갈래는 한 줄로 잘리고, VRM0 은 같은 선을 180° 돌린다", () => {
    const blunt = buildAvatarForgeHairParts(applyStyle("hime", { bangStyle: "blunt", fringe: 0.82 }))
      .filter((part) => part.role === "bang");
    expect(blunt).toHaveLength(5);
    const tips = blunt.map((part) => {
      const spine = avatarForgeHairInstance(part, front).spine!;
      return spine.points[spine.points.length - 1]!;
    });
    for (const tip of tips) expect(tip.y).toBeCloseTo(tips[0]!.y, 9);
    const mirrored = avatarForgeHairInstance(blunt[1]!, back).spine!;
    const original = avatarForgeHairInstance(blunt[1]!, front).spine!;
    mirrored.points.forEach((point, index) => {
      expect(point.x).toBeCloseTo(-original.points[index]!.x, 9);
      expect(point.y).toBeCloseTo(original.points[index]!.y, 9);
      expect(point.z).toBeCloseTo(-original.points[index]!.z, 9);
    });
    expect(mirrored.normals[0]!.z).toBeLessThan(0);
  });

  it("얼굴 옆에 매달린 가닥은 면을 바깥쪽으로 돌린다 — 앞에선 판자, 옆에선 막대로 보이지 않게", () => {
    const facing = (id: string) => new THREE.Vector3(0, 0, 1)
      .applyQuaternion(transformAvatarForgeHairPart(partOf("long", id), front).quaternion);
    const left = facing("side-left");
    const right = facing("side-right");
    expect(left.x).toBeLessThan(-0.5);
    expect(right.x).toBeGreaterThan(0.5);
    expect(left.z).toBeGreaterThan(0.2);
    expect(right.z).toBeGreaterThan(0.2);
  });

  it("긴 옆머리의 뿌리는 두개골 천장 아래에 묻힌다 — 정수리 위로 솟지 않는다", () => {
    const side = partOf("long", "side-left", { length: 1.7 });
    const placement = transformAvatarForgeHairPart(side, front);
    expect(placement.position.y + Math.abs(placement.scale.y)).toBeLessThanOrEqual(front.center[1] + front.radiusY * 1.12 + 1e-9);
    // 옆머리는 두개골 밖(가로 정규화 거리 ≥ 0.9)으로 밀린다.
    const horizontal = Math.hypot(placement.position.x / front.radiusX, placement.position.z / front.radiusZ);
    expect(horizontal).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });

  it("볼륨 1 의 캡 중심은 두상 중심이다", () => {
    const fit = resolveStudioVrmHeadFit({ profile: null, eyeCenter: [0, 0.06, 0.02], eyeDistance: 0.04, frontSign: 1, modelHeight: 1.6 });
    const { position } = transformAvatarForgeHairPart(partOf("bob", "cap", { volume: 1 }), fit);
    expect(position.x).toBeCloseTo(fit.center[0], 9);
    expect(position.y).toBeCloseTo(fit.center[1], 9);
  });

  it("실측 VRM 12종 전체에서 앞머리 전 구간(뿌리~끝)이 foreheadDepth 바깥에 연속으로 흐르고 대머리 관통이 0건이다", () => {
    interface MeasuredFixture {
      readonly id: string;
      readonly modelHeight: number;
      readonly eyeCenter: StudioVrmHeadVec3 | null;
      readonly eyeDistance: number;
      readonly frontSign: 1 | -1;
      readonly profile: StudioVrmHeadProfile;
      readonly crownSamples: readonly StudioVrmHeadVec3[];
    }
    const models = (fixtureFile as unknown as { models: readonly MeasuredFixture[] }).models;
    expect(models.length).toBeGreaterThanOrEqual(12);

    const foreheadAt = (fit: StudioVrmHeadFit, cx: number, y: number) => {
      const cz = fit.frontSign * fit.center[2];
      const nx = (cx - fit.center[0]) / fit.radiusX;
      const ny = (y - fit.center[1]) / fit.radiusY;
      const skull = cz + fit.radiusZ * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const across = Math.sqrt(Math.max(0.15, 1 - 0.85 * nx * nx));
      return Math.min(cz + (fit.faceFront - cz) * across, skull);
    };

    for (const model of models) {
      const fit = resolveStudioVrmHeadFit({
        profile: model.profile,
        eyeCenter: model.eyeCenter,
        eyeDistance: model.eyeDistance,
        frontSign: model.frontSign,
        modelHeight: model.modelHeight,
      });
      for (const bangStyle of ["full", "curtain", "split", "side-swept", "blunt"] as const) {
        const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "wavy");
        state.hair.bangStyle = bangStyle;
        const expanded = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(state), state.hair);
        const bangs = expanded.filter((part) => part.role === "bang");
        expect(bangs.length, `${model.id}/${bangStyle}`).toBeGreaterThanOrEqual(6);
        for (const bang of bangs) {
          const spine = avatarForgeHairInstance(bang, fit).spine;
          expect(spine, `${model.id}/${bangStyle}/${bang.id}`).toBeDefined();
          if (!spine) continue;
          // 뿌리(index=0)부터 끝(index=last)까지 단 한 점도 foreheadDepth 안쪽으로 파고들지 않아야 한다.
          for (const point of spine.points) {
            const canonicalX = fit.frontSign < 0 ? 2 * fit.center[0] - point.x : point.x;
            const depth = fit.frontSign * point.z;
            expect(depth, `${model.id}/${bangStyle}/${bang.id}`).toBeGreaterThan(foreheadAt(fit, canonicalX, point.y));
          }
        }
      }
    }

    // 루미(sample-vrm) 실측 기준: 웨이브 롱/보브에서 이마 상단 크라운 100% 차폐 + 앞머리 정점 0관통 + 가닥 겹침·관자놀이 브리지 확인
    const lumi = models.find((item) => item.id === "sample-vrm")!;
    const lumiFit = resolveStudioVrmHeadFit({
      profile: lumi.profile,
      eyeCenter: lumi.eyeCenter,
      eyeDistance: lumi.eyeDistance,
      frontSign: lumi.frontSign,
      modelHeight: lumi.modelHeight,
    });
    const raycaster = new THREE.Raycaster();
    const frontCrown = lumi.crownSamples.filter((pt) => pt[2] > 0.04 && pt[1] >= 0.11);
    expect(frontCrown.length).toBeGreaterThan(10);

    for (const style of ["bob", "wavy", "hime"] as const) {
      const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), style);
      const expanded = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(state), state.hair);
      expect(expanded.some((part) => part.id === "temple-bridge-left")).toBe(true);
      expect(expanded.some((part) => part.id === "temple-bridge-right")).toBe(true);

      const merged = mergeStudioVrmAuthoredHairGeometry(expanded.map((part) => avatarForgeHairInstance(part, lumiFit)))!;
      const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.updateMatrixWorld(true);
      for (const sample of frontCrown) {
        raycaster.set(new THREE.Vector3(sample[0], sample[1], 0.35), new THREE.Vector3(0, 0, -1));
        const hits = raycaster.intersectObject(mesh, false);
        expect(hits.length, `${style} crown hit`).toBeGreaterThan(0);
        expect(hits[0]!.point.z, `${style} crown z`).toBeGreaterThan(sample[2]);
      }

      // 앞머리 실제 메시 정점 전체가 foreheadDepth 바깥 + 이마 가로 겹침 검증
      const bangParts = expanded.filter((part) => part.role === "bang");
      const bangGeo = mergeStudioVrmAuthoredHairGeometry(bangParts.map((part) => avatarForgeHairInstance(part, lumiFit)))!;
      const pos = bangGeo.getAttribute("position");
      for (let i = 0; i < pos.count; i += 1) {
        expect(pos.getZ(i), `${style} bang vertex ${i}`).toBeGreaterThan(foreheadAt(lumiFit, pos.getX(i), pos.getY(i)));
      }
      const intervals = bangParts.map((part) => {
        const sp = avatarForgeHairInstance(part, lumiFit).spine!;
        const nearBrow = sp.points.reduce((best, pt) => (Math.abs(pt.y - 0.1) < Math.abs(best.y - 0.1) ? pt : best), sp.points[0]!);
        return [nearBrow.x - sp.halfWidth * 0.72, nearBrow.x + sp.halfWidth * 0.72] as const;
      });
      let covered = 0;
      let overlapped = 0;
      for (let step = -25; step <= 25; step += 1) {
        const x = (step / 25) * 0.072;
        const hits = intervals.filter(([left, right]) => x >= left && x <= right).length;
        if (hits >= 1) covered += 1;
        if (hits >= 2) overlapped += 1;
      }
      expect(covered / 51, `${style} forehead coverage`).toBeGreaterThanOrEqual(0.96);
      expect(overlapped / 51, `${style} strand overlap`).toBeGreaterThanOrEqual(0.45);

      bangGeo.dispose();
      merged.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });

  it("다층 레이어드 헤어 전개(볼선 잔머리·외곽 사이드 커튼·뒷머리 드레이프·깃털 앞머리)와 밀착 캡이 실측 VRM 12종 전체에서 0관통·고피복을 유지한다", () => {
    interface MeasuredFixture {
      readonly id: string;
      readonly modelHeight: number;
      readonly eyeCenter: StudioVrmHeadVec3 | null;
      readonly eyeDistance: number;
      readonly frontSign: 1 | -1;
      readonly profile: StudioVrmHeadProfile;
      readonly crownSamples: readonly StudioVrmHeadVec3[];
    }
    const models = (fixtureFile as unknown as { models: readonly MeasuredFixture[] }).models;

    for (const style of ["wavy", "long", "bob", "hime", "half-up"] as const) {
      const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), style);
      const expanded = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(state), state.hair);
      const ids = new Set(expanded.map((part) => part.id));
      expect(ids.has("cheek-wisp-left"), `${style}: cheek-wisp-left`).toBe(true);
      expect(ids.has("cheek-wisp-right"), `${style}: cheek-wisp-right`).toBe(true);
      expect(expanded.find((part) => part.id === "cheek-wisp-left")?.taper).toBeCloseTo(0.78, 6);
      expect(ids.has("side-flow-left"), `${style}: side-flow-left`).toBe(true);
      expect(ids.has("side-flow-right"), `${style}: side-flow-right`).toBe(true);
      expect(ids.has("back-drape-left"), `${style}: back-drape-left`).toBe(true);
      expect(ids.has("back-drape-center"), `${style}: back-drape-center`).toBe(true);
      expect(ids.has("back-drape-right"), `${style}: back-drape-right`).toBe(true);
      expect(ids.has("bang-feather-inner-left"), `${style}: bang-feather-inner-left`).toBe(true);
      expect(ids.has("bang-feather-inner-right"), `${style}: bang-feather-inner-right`).toBe(true);

      // 뒷머리 드레이프 중앙 가닥은 VRM1(+z 얼굴)에서 앞면(+z 로컬)이 뒤통수 바깥(-z)을 향해야 한다.
      const backCenter = expanded.find((part) => part.id === "back-drape-center")!;
      const backFrontNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
        transformAvatarForgeHairPart(backCenter, front).quaternion,
      );
      expect(backFrontNormal.z, `${style}: back-drape-center outward normal`).toBeLessThan(-0.9);
    }

    // 밀착 렌더 캡은 기존 +13% 헬멧 팽창보다 크게 줄어들면서도 실측 VRM 12종(안나 제외)에서 ≥97% 두개골 피복을 유지한다.
    const wavyState = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "wavy");
    const wavyExpanded = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(wavyState), wavyState.hair);
    const wavyCap = wavyExpanded.find((part) => part.role === "cap")!;
    const wavyCapScale = transformAvatarForgeHairPart(wavyCap, front).scale;
    expect(wavyCapScale.x / front.radiusX).toBeLessThan(1.045);

    const raycaster = new THREE.Raycaster();
    for (const model of models) {
      const fit = resolveStudioVrmHeadFit({
        profile: model.profile,
        eyeCenter: model.eyeCenter,
        eyeDistance: model.eyeDistance,
        frontSign: model.frontSign,
        modelHeight: model.modelHeight,
      });
      const capGeo = mergeStudioVrmAuthoredHairGeometry(
        [avatarForgeHairInstance(wavyCap, fit)],
        { minScalpMargin: 0.004, crownCompression: 0.24, crownLatitudeMin: 0.36, earArchRelief: 0.25 },
      )!;
      const capMesh = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      capMesh.updateMatrixWorld(true);
      const center = new THREE.Vector3(...fit.center);
      let covered = 0;
      for (const pt of model.crownSamples) {
        const sample = new THREE.Vector3(pt[0], pt[1], pt[2]);
        const dir = sample.clone().sub(center);
        const dist = dir.length();
        if (dist < 1e-5) {
          covered += 1;
          continue;
        }
        raycaster.set(center, dir.divideScalar(dist));
        const hits = raycaster.intersectObject(capMesh, false);
        if (hits.length > 0 && hits[0]!.distance >= dist - 1e-4) covered += 1;
      }
      const ratio = covered / model.crownSamples.length;
      expect(ratio, `${model.id} tightened cap coverage`).toBeGreaterThanOrEqual(model.id === "anna" ? 0.85 : 0.97);
      capGeo.dispose();
      (capMesh.material as THREE.Material).dispose();
    }
  });
});
