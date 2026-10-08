/**
 * 키트 로더(`render/babylon/kit-loader.ts`) — 합성 키트 GLB(`render/testing/kit-glb-fixture.ts`)를 NullEngine에 로드해 확인한다:
 * 하나의 스켈레톤에 재바인딩·역할 그룹핑·틴트·morph 전파·관절 오프셋·몸 가림·헤어 LOD·증분 교체·해제와 모든 `kit-*` 실패 경로.
 * 텍스처 디코드·셰이더 컴파일·GPU 렌더는 NullEngine이 검증하지 못한다(브라우저 미검증).
 * 실제 키트 에셋(Blender 산출물)은 안착한 뒤 `babylon-real-kit.test.ts`(KT-11)가 확인한다.
 */
import { afterEach, describe, expect, it } from "vitest";

import { KIT_BONE_MAP, KIT_END_BONES, KIT_HIDEABLE_REGION_IDS, KIT_REQUIRED_PRESETS, KIT_SKELETON_JOINTS, PART_ROLES, rolePartId } from "../contracts";
import { parseGlb } from "../testing/minimal-glb";

import { buildKitFixture, createKitHarness, fixtureUrl } from "./testing/kit-glb-fixture";

import type { KitPlan, LabFailure, PartRole, PresetId } from "../contracts";
import type { KitFixtureOptions, KitGlbSpec, KitHarness, KitRig } from "./testing/kit-glb-fixture";

const harnesses: KitHarness[] = [];

afterEach(() => {
  while (harnesses.length > 0) harnesses.pop()?.dispose();
});

async function setup(options: KitFixtureOptions = {}, harnessOptions: Parameters<typeof createKitHarness>[0] = {}) {
  const fixture = await buildKitFixture(options);
  const harness = await createKitHarness({ now: 5_000, ...harnessOptions });
  harnesses.push(harness);
  return { fixture, harness };
}

async function loaded(options: KitFixtureOptions = {}) {
  const { fixture, harness } = await setup(options);
  const handle = await harness.load(fixture);
  return { fixture, harness, handle, rig: handle.rig };
}

/** 로더가 던진 LabFailure(RigBindError.failure) */
async function failureOf(promise: Promise<unknown>): Promise<LabFailure> {
  try {
    await promise;
  } catch (error) {
    const failure = (error as { failure?: LabFailure }).failure;
    if (failure) return failure;
    throw error;
  }
  throw new Error("실패해야 하는 로드가 성공했습니다.");
}

interface SceneCounts {
  readonly meshes: number;
  readonly transformNodes: number;
  readonly skeletons: number;
  readonly materials: number;
  readonly morphManagers: number;
  /** 키트 파일이 만든 알베도 텍스처(공유 BRDF 텍스처는 엔진 소유라 제외) */
  readonly albedoTextures: number;
}

function sceneCounts(harness: KitHarness): SceneCounts {
  const { scene } = harness;
  return {
    meshes: scene.meshes.length,
    transformNodes: scene.transformNodes.length,
    skeletons: scene.skeletons.length,
    materials: scene.materials.length,
    morphManagers: scene.morphTargetManagers.length,
    albedoTextures: scene.textures.filter((texture) => texture.name.includes("Base Color")).length,
  };
}

const EMPTY_SCENE: SceneCounts = { meshes: 0, transformNodes: 0, skeletons: 0, materials: 0, morphManagers: 0, albedoTextures: 0 };

function partOf(rig: KitRig, role: PartRole) {
  const part = rig.parts.find((candidate) => candidate.role === role);
  if (!part) throw new Error(`역할 ${role} 파츠가 없습니다.`);
  return part;
}

function meshNames(rig: KitRig, role: PartRole): string[] {
  return partOf(rig, role).meshes.map((mesh) => mesh.name);
}

/** 본 노드를 옮기고 스킨 행렬을 갱신한다(포즈 변화 모사) */
function moveBone(rig: KitRig, name: string, delta: readonly [number, number, number]): void {
  const bone = rig.bones.get(name);
  if (!bone) throw new Error(`본이 없습니다: ${name}`);
  bone.node.position.set(bone.node.position.x + delta[0], bone.node.position.y + delta[1], bone.node.position.z + delta[2]);
  bone.node.computeWorldMatrix(true);
  rig.skeleton?.prepare(true);
}

/** 스킨이 적용된 정점 위치와 bind 위치의 차이(정점별 [dx,dy,dz]) */
function skinnedDeltas(rig: KitRig, meshName: string): number[][] {
  const mesh = rig.parts.flatMap((part) => part.meshes).find((candidate) => candidate.name === meshName);
  if (!mesh) throw new Error(`메시가 없습니다: ${meshName}`);
  const bind = Array.from(mesh.getVerticesData("position") ?? []);
  const posed = Array.from(mesh.getPositionData(true, false) ?? []);
  const out: number[][] = [];
  for (let v = 0; v < bind.length; v += 3) out.push([(posed[v] ?? 0) - (bind[v] ?? 0), (posed[v + 1] ?? 0) - (bind[v + 1] ?? 0), (posed[v + 2] ?? 0) - (bind[v + 2] ?? 0)]);
  return out;
}

function expectAllMoved(deltas: number[][], expected: readonly [number, number, number]): void {
  expect(deltas.length).toBeGreaterThan(0);
  for (const delta of deltas) for (let axis = 0; axis < 3; axis += 1) expect(delta[axis] ?? Number.NaN).toBeCloseTo(expected[axis] ?? 0, 5);
}

function replaceMesh(spec: KitGlbSpec, node: string, change: (mesh: KitGlbSpec["meshes"][number]) => KitGlbSpec["meshes"][number]): KitGlbSpec {
  return { ...spec, meshes: spec.meshes.map((mesh) => (mesh.node === node ? change(mesh) : mesh)) };
}

const REQUIRED: readonly PresetId[] = KIT_REQUIRED_PRESETS;

// ---------------------------------------------------------------- 기본 조립

describe("키트 로드: 기본 조립(베이스 + 필수 파츠 5개)", () => {
  it("역할로 묶인 리그 파츠를 만든다: id=역할, partId=rolePartId, 팔레트는 희소(없는 역할은 비어 있다)", async () => {
    const { rig, harness } = await loaded();
    expect(rig.kind).toBe("kit");
    expect(rig.poseConvention).toBe("model-space");
    expect(rig.parts.map((part) => part.role)).toEqual(["skin", "head", "eyeball", "iris", "eye-highlight", "brow", "lash", "teeth", "tongue", "hair", "top", "bottom", "shoes", "underwear"]);
    for (const part of rig.parts) {
      expect(part.id).toBe(part.role);
      expect(part.partId).toBe(rolePartId(part.role));
      expect(part.materialId).toBe(PART_ROLES.indexOf(part.role));
      expect(part.visible).toBe(true);
      expect(part.forceHidden).toBe(false);
      expect(part.outlineMeshes).toEqual([]);
      expect(rig.partById.get(part.partId)).toBe(part);
      expect(rig.partIdPalette[part.partId]?.role).toBe(part.role);
      for (const mesh of part.meshes) expect(mesh.metadata).toMatchObject({ partId: part.partId, role: part.role, outline: false, characterRig: true });
    }
    // 홍채 하이라이트(6)·속옷(16)은 있고 동공(5)·액세서리(15)는 선택 슬롯이 비어 팔레트에 없다
    expect(Object.keys(rig.partIdPalette).map(Number)).toEqual(rig.parts.map((part) => part.partId));
    expect(rig.partIdPalette[rolePartId("underwear")]?.role).toBe("underwear");
    expect(rig.partIdPalette[rolePartId("pupil")]).toBeUndefined();
    expect(rig.partIdPalette[rolePartId("accessory")]).toBeUndefined();
    expect(rig.chains).toEqual([]);
    expect(rig.colliders).toEqual([]);
    expect(rig.notes).toEqual([]);
    expect(harness.scene.useRightHandedSystem).toBe(true);
  });

  it("같은 역할의 메시(눈 좌우·눈썹 좌우·홍채 좌우)는 한 파츠이고 다중 프리미티브 TS_Mouth는 치아·혀 두 파츠다", async () => {
    const { rig } = await loaded();
    expect(meshNames(rig, "skin")).toEqual(["TS_Body"]);
    expect(meshNames(rig, "head")).toEqual(["TS_Head"]);
    expect(meshNames(rig, "eyeball")).toEqual(["TS_Eye_L", "TS_Eye_R"]);
    expect(meshNames(rig, "brow")).toEqual(["TS_Brow_L", "TS_Brow_R"]);
    expect(meshNames(rig, "lash")).toEqual(["TS_Lashes"]);
    expect(meshNames(rig, "teeth")).toEqual(["TS_Mouth_primitive0"]);
    expect(meshNames(rig, "tongue")).toEqual(["TS_Mouth_primitive1"]);
    expect(meshNames(rig, "underwear")).toEqual(["TS_Underwear"]);
    expect(meshNames(rig, "iris")).toEqual(["TS_Iris_L", "TS_Iris_R"]);
    expect(meshNames(rig, "eye-highlight")).toEqual(["TS_Highlight_L", "TS_Highlight_R"]);
    expect(meshNames(rig, "hair")).toEqual(["TS_AuthoredHair_soft-bob_LOD0"]);
    expect(meshNames(rig, "top")).toEqual(["TS_Top_tee"]);
    expect(meshNames(rig, "bottom")).toEqual(["TS_Bottom_jeans"]);
    expect(meshNames(rig, "shoes")).toEqual(["TS_Shoes_sneakers"]);
    // 같은 역할의 메시는 재질 인스턴스 하나를 공유한다
    const eye = partOf(rig, "eyeball");
    for (const mesh of eye.meshes) expect(mesh.material).toBe(eye.pbr);
  });

  it("모든 파츠 메시가 베이스 스켈레톤 하나에 스키닝되고 파츠 GLB의 스켈레톤·본 노드는 해제된다", async () => {
    const { rig, harness } = await loaded();
    const skeleton = rig.skeleton;
    expect(skeleton).not.toBeNull();
    for (const part of rig.parts) for (const mesh of part.meshes) expect(mesh.skeleton, mesh.name).toBe(skeleton);
    expect(harness.scene.skeletons).toHaveLength(1);
    // 6개 GLB가 각자 Armature와 68 joint 노드를 싣지만 장면에는 베이스의 것 하나만 남는다
    expect(harness.scene.transformNodes.filter((node) => node.name === "Armature")).toHaveLength(1);
    expect(harness.scene.transformNodes.filter((node) => node.name === "mixamorig:Hips")).toHaveLength(1);
    expect(harness.scene.transformNodes.filter((node) => node.name === "TS_Jaw")).toHaveLength(1);
    // 모든 파츠 메시는 리그 루트 아래에 있다
    for (const part of rig.parts) for (const mesh of part.meshes) expect(mesh.isDescendantOf(rig.root), mesh.name).toBe(true);
  });

  it("본 표: 68개, 휴머노이드 55(명시 boneMap — TS_Jaw·TS_Eye 포함), 끝 본 13개는 보조 본이다", async () => {
    const { rig } = await loaded();
    expect(rig.bones.size).toBe(68);
    expect([...rig.bones.keys()].sort()).toEqual([...KIT_SKELETON_JOINTS].sort());
    expect(rig.humanoid.size).toBe(Object.keys(KIT_BONE_MAP).length);
    expect(rig.humanoid.get("jaw")?.name).toBe("TS_Jaw");
    expect(rig.humanoid.get("leftEye")?.name).toBe("TS_Eye.L");
    expect(rig.humanoid.get("rightEye")?.name).toBe("TS_Eye.R");
    expect(rig.humanoid.get("upperChest")?.name).toBe("mixamorig:Spine2");
    expect(rig.humanoid.get("hips")?.parentName).toBeNull();
    expect(rig.humanoid.get("head")?.parentName).toBe("mixamorig:Neck");
    const auxiliary = [...rig.bones.values()].filter((bone) => bone.auxiliary).map((bone) => bone.name);
    expect(auxiliary.sort()).toEqual([...KIT_END_BONES].sort());
    expect(rig.bones.get("mixamorig:Head")?.restTranslation).toEqual([0, 0.08, 0]);
    expect(rig.skeleton?.useTextureToStoreBoneMatrices).toBe(true);
  });

  it("재질 틴트: 피부·머리는 recolor(skin 키), 안구·하이라이트·치아·혀·속옷은 fixed, 속눈썹은 눈썹 색 키를 쓴다", async () => {
    const { rig } = await loaded();
    expect(partOf(rig, "skin")).toMatchObject({ tint: { mode: "recolor" }, colorKey: "skin" });
    expect(partOf(rig, "head")).toMatchObject({ tint: { mode: "recolor" }, colorKey: "skin" });
    expect(partOf(rig, "lash")).toMatchObject({ tint: { mode: "recolor" }, colorKey: "brow" });
    expect(partOf(rig, "brow")).toMatchObject({ tint: { mode: "recolor" }, colorKey: "brow" });
    expect(partOf(rig, "iris")).toMatchObject({ tint: { mode: "recolor" }, colorKey: "iris" });
    expect(partOf(rig, "hair")).toMatchObject({ tint: { mode: "recolor" }, colorKey: "hair" });
    for (const role of ["top", "bottom", "shoes"] as const) expect(partOf(rig, role)).toMatchObject({ tint: { mode: "recolor" }, colorKey: role });
    for (const role of ["eyeball", "eye-highlight", "teeth", "tongue", "underwear"] as const) {
      const part = partOf(rig, role);
      expect(part.tint).toEqual({ mode: "fixed", hex: "#f2f2f4" });
      expect(part.colorHex).toBe("#f2f2f4");
      expect(part.colorKey).toBeUndefined();
    }
    // recolor 파츠의 초기 표시 색은 역할 기본 프리셋 색이다(레시피 색은 플랜 적용 때 곱해진다)
    expect(partOf(rig, "skin").colorHex).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it("알베도 텍스처가 있는 파츠는 hasAlbedoTexture=true이고 텍스처가 없는 파츠는 false다(레시피 틴트 적용 여부는 tint가 정한다)", async () => {
    const { rig } = await loaded();
    expect(partOf(rig, "skin").hasAlbedoTexture).toBe(true);
    expect(partOf(rig, "top").hasAlbedoTexture).toBe(true);
    expect(partOf(rig, "head").hasAlbedoTexture).toBe(false);
    expect(partOf(rig, "skin").tint.mode).toBe("recolor");
  });

  it("adaptMaterial은 역할 파츠마다 한 번, 첫 메시로 불린다", async () => {
    const { harness } = await loaded();
    const roles = harness.adapted.map((entry) => entry.role);
    expect(new Set(roles).size).toBe(roles.length);
    expect(harness.adapted.find((entry) => entry.role === "eyeball")?.mesh).toBe("TS_Eye_L");
    expect(harness.adapted.find((entry) => entry.role === "tongue")?.mesh).toBe("TS_Mouth_primitive1");
    expect(roles).toHaveLength(14);
  });

  it("파일을 최대 4개씩 병렬로 받는다(parallelism으로 조절)", async () => {
    for (const [limit, expectedMax] of [[undefined, 4], [2, 2], [1, 1]] as const) {
      const { fixture, harness } = await setup();
      let inflight = 0;
      let peak = 0;
      const handle = await harness.load(fixture, {
        ...(limit !== undefined ? { parallelism: limit } : {}),
        fetchBytes: async (url) => {
          inflight += 1;
          peak = Math.max(peak, inflight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inflight -= 1;
          return fixture.files.get(url) as Uint8Array;
        },
      });
      expect(peak, `parallelism=${String(limit)}`).toBe(Math.min(expectedMax, fixture.plan.parts.length));
      handle.dispose();
    }
  });

  it("플랜의 능력 맵·팔레트가 리그에 노출된다", async () => {
    const { rig, fixture } = await loaded();
    expect(rig.capabilities).toBe(fixture.plan.capabilities);
  });
});

// ---------------------------------------------------------------- morph·관절 오프셋·스킨 정합

describe("키트 morph 전파·관절 오프셋·포즈 정합", () => {
  it("같은 이름의 morph 타깃이 몸·속옷·의상·신발에 있으면 한 이름으로 모두 모인다(LOD는 선택 LOD만)", async () => {
    const { rig, fixture } = await loaded();
    const expectedCount = (name: string): number =>
      fixture.plan.parts.reduce(
        (sum, part) => sum + part.meshes.filter((mesh) => (mesh.lod === undefined || mesh.lod === 0) && (mesh.morphs as readonly string[]).includes(name)).reduce((inner, mesh) => inner + (mesh.primitiveRoles?.length ?? 1), 0),
        0,
      );
    for (const name of fixture.plan.morphNames) expect(rig.morphs.get(name)?.length, name).toBe(expectedCount(name));
    expect(rig.morphs.get("param:height:+")?.length).toBe(5); // 몸·속옷·상의·하의·신발
    expect(rig.morphs.get("param:headSize:+")?.length).toBeGreaterThan(8); // 머리·눈·입·속눈썹·눈썹·헤어·홍채·하이라이트
    expect(rig.morphs.get("facs:jawOpen")?.length).toBe(3); // 머리 + 입 프리미티브 2
    expect(rig.morphNames).toEqual(fixture.plan.morphNames);
    // 한 이름에 influence를 주면 모든 타깃이 따른다
    for (const target of rig.morphs.get("param:height:+") ?? []) target.influence = 0.5;
    expect(partOf(rig, "top").meshes[0]?.morphTargetManager?.getTarget(0).influence).toBe(0.5);
    expect(partOf(rig, "shoes").meshes[0]?.morphTargetManager?.getTarget(0).influence).toBe(0.5);
  });

  it("morph 타깃을 가진 모든 메시가 텍스처 저장 방식을 요청한다(머리는 타깃이 많아 텍스처 모드가 필수)", async () => {
    const { rig } = await loaded();
    for (const part of rig.parts) {
      for (const mesh of part.meshes) {
        expect(mesh.morphTargetManager?.numTargets ?? 0, mesh.name).toBeGreaterThan(0);
        expect(mesh.morphTargetManager?.useTextureToStoreTargets, mesh.name).toBe(true);
      }
    }
  });

  it("관절 오프셋 포트가 연결된다: 체형 morph 가중치만큼 본의 로컬 rest가 이동하고 0으로 돌리면 복원된다", async () => {
    const { rig } = await loaded();
    const offsets = rig.jointOffsets;
    expect(offsets).not.toBeNull();
    const head = rig.bones.get("mixamorig:Head");
    expect(head?.node.position.y).toBeCloseTo(0.08, 6);
    expect(offsets?.apply({ "param:height:+": 1 })).toBe(2);
    expect(head?.node.position.y).toBeCloseTo(0.11, 6);
    expect(offsets?.effectiveRestTranslation("mixamorig:Head")?.[1]).toBeCloseTo(0.11, 6);
    expect(rig.bones.get("mixamorig:Neck")?.node.position.y).toBeCloseTo(0.12, 6);
    expect(offsets?.apply({ "param:height:+": 0.5 })).toBe(2);
    expect(head?.node.position.y).toBeCloseTo(0.095, 6);
    expect(offsets?.apply({})).toBe(2);
    expect(head?.node.position.y).toBeCloseTo(0.08, 6);
    // 키트가 싣지 않은 morph 이름은 정점이 안 움직이므로 본도 움직이지 않는다
    expect(offsets?.apply({ "param:shoulderWidth:+": 1 })).toBe(0);
  });

  it("관절 오프셋을 적용해도 파츠 메시는 rest 자세에서 제자리다(역바인드가 새 rest로 다시 만들어진다)", async () => {
    const { rig } = await loaded();
    rig.skeleton?.prepare(true);
    expectAllMoved(skinnedDeltas(rig, "TS_AuthoredHair_soft-bob_LOD0"), [0, 0, 0]);
    rig.jointOffsets?.apply({ "param:height:+": 1, "param:legLength:+": 1 });
    rig.skeleton?.prepare(true);
    for (const name of ["TS_AuthoredHair_soft-bob_LOD0", "TS_Head", "TS_Top_tee", "TS_Body", "TS_Shoes_sneakers"]) expectAllMoved(skinnedDeltas(rig, name), [0, 0, 0]);
    // 옮겨진 관절을 기준으로 포즈가 걸린다: 머리 본을 더 올리면 헤어가 그만큼 따라간다
    moveBone(rig, "mixamorig:Head", [0, 0.5, 0]);
    expectAllMoved(skinnedDeltas(rig, "TS_AuthoredHair_soft-bob_LOD0"), [0, 0.5, 0]);
  });

  it("파츠 메시가 베이스 스켈레톤을 따라간다: 본(과 그 자손 본)에 가중치를 둔 메시만 본 이동만큼 움직인다", async () => {
    const { rig } = await loaded();
    const HEAD_ATTACHED = ["TS_Head", "TS_Lashes", "TS_Brow_L", "TS_Brow_R", "TS_AuthoredHair_soft-bob_LOD0"];
    const EYES_AND_MOUTH = ["TS_Eye_L", "TS_Eye_R", "TS_Iris_L", "TS_Iris_R", "TS_Highlight_L", "TS_Highlight_R", "TS_Mouth_primitive0", "TS_Mouth_primitive1"];
    const HIPS_WEIGHTED = ["TS_Body", "TS_Underwear", "TS_Bottom_jeans"];
    const ALL = [...HEAD_ATTACHED, ...EYES_AND_MOUTH, ...HIPS_WEIGHTED, "TS_Top_tee", "TS_Shoes_sneakers"];
    const cases: ReadonlyArray<{ readonly bone: string; readonly delta: readonly [number, number, number]; readonly moved: readonly string[] }> = [
      // 머리 본: 머리에 붙은 메시 + 자손 본(눈·턱)의 메시
      { bone: "mixamorig:Head", delta: [0, 0.5, 0], moved: [...HEAD_ATTACHED, ...EYES_AND_MOUTH] },
      // 가슴 본: 상의 + 머리 쪽 전부(머리는 가슴의 자손)
      { bone: "mixamorig:Spine1", delta: [0.25, 0, 0], moved: ["TS_Top_tee", ...HEAD_ATTACHED, ...EYES_AND_MOUTH] },
      // 골반 본: 전부(모든 본이 골반의 자손)
      { bone: "mixamorig:Hips", delta: [0, 0, 0.125], moved: ALL },
      { bone: "mixamorig:LeftFoot", delta: [0, 0, 0.0625], moved: ["TS_Shoes_sneakers"] },
      { bone: "TS_Eye.L", delta: [0, 0, 0.125], moved: ["TS_Eye_L", "TS_Iris_L", "TS_Highlight_L"] },
      { bone: "TS_Jaw", delta: [0, -0.0625, 0], moved: ["TS_Mouth_primitive0", "TS_Mouth_primitive1"] },
    ];
    for (const { bone, delta, moved } of cases) {
      moveBone(rig, bone, delta);
      for (const name of ALL) expectAllMoved(skinnedDeltas(rig, name), moved.includes(name) ? delta : [0, 0, 0]);
      moveBone(rig, bone, [-delta[0], -delta[1], -delta[2]]);
    }
  });
});

// ---------------------------------------------------------------- 몸 가림

describe("키트 몸 가림(TS_Body SubMesh)", () => {
  it("파츠가 선언한 영역의 합집합을 빼고 보이는 구간만 SubMesh로 남긴다", async () => {
    const { rig, handle } = await loaded();
    const body = partOf(rig, "skin").meshes[0];
    // 상의: torso·upperArm.L/R, 하의: pelvis·thigh.L/R, 신발: foot.L/R → 보이는 구간 neck / forearm.L~hand.R / calf.L~R
    expect(body?.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[0, 6], [30, 24], [66, 12]]);
    expect(body?.alwaysSelectAsActiveMesh).toBe(true);
    expect(body?.getTotalIndices()).toBe(KIT_HIDEABLE_REGION_IDS.length * 6);
    expect(KIT_HIDEABLE_REGION_IDS.indexOf("forearm.L") * 6).toBe(30);
    expect(handle.loadedPartIds()).toContain("top/tee");
  });

  it("가릴 파츠가 없으면 몸 전체가 하나의 SubMesh다", async () => {
    const { rig } = await loaded({ partIds: ["hair/soft-bob", "irises/round-large"] });
    const body = partOf(rig, "skin").meshes[0];
    expect(body?.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[0, 90]]);
    expect(body?.alwaysSelectAsActiveMesh).toBe(false);
  });

  it("영역 범위가 없으면 숨기지 못했다는 한글 안내를 notes에 남기고 몸을 그대로 둔다", async () => {
    const { fixture, harness } = await setup();
    const handle = await harness.load({ ...fixture, plan: { ...fixture.plan, bodyRegions: [] } });
    const body = partOf(handle.rig, "skin").meshes[0];
    expect(body?.subMeshes).toHaveLength(1);
    expect(handle.rig.notes.some((note) => note.includes("bodyRegions") && note.includes("숨기지 못했습니다"))).toBe(true);
  });

  it("영역 범위가 인덱스 버퍼를 분할하지 않으면 kit-region-range-invalid로 거부하고 장면을 비운다", async () => {
    const { fixture, harness } = await setup();
    const ranges = fixture.plan.bodyRegions.map((range, index) => (index === 2 ? { ...range, indexCount: range.indexCount - 3 } : range));
    const failure = await failureOf(harness.load({ ...fixture, plan: { ...fixture.plan, bodyRegions: ranges } }));
    expect(failure.code).toBe("kit-region-range-invalid");
    expect(failure.reasonKo).toContain("TS_Body");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });

  it("내보낸 GLB는 숨긴 영역의 삼각형을 뺀다(SubMesh 구간 = glTF 프리미티브) — 현재 influence는 weights로 나간다", async () => {
    const { rig, harness } = await loaded();
    const name = "param:height:+";
    const manager = partOf(rig, "skin").meshes[0]?.morphTargetManager;
    const index = Array.from({ length: manager?.numTargets ?? 0 }, (_unused, i) => manager?.getTarget(i).name).indexOf(name);
    expect(index).toBeGreaterThanOrEqual(0);
    for (const target of rig.morphs.get(name) ?? []) target.influence = 0.5;
    const glb = await harness.exportGlb(rig);
    const json = parseGlb(glb).json as {
      nodes: Array<{ name?: string; mesh?: number }>;
      meshes: Array<{ primitives: Array<{ indices: number }>; weights?: number[] }>;
      accessors: Array<{ count: number }>;
      skins?: Array<{ joints: number[] }>;
    };
    const bodyNode = json.nodes.find((node) => node.name === "TS_Body" && node.mesh !== undefined);
    const bodyMesh = bodyNode?.mesh === undefined ? undefined : json.meshes[bodyNode.mesh];
    const counts = (bodyMesh?.primitives ?? []).map((primitive) => json.accessors[primitive.indices]?.count);
    expect(counts).toEqual([6, 24, 12]);
    // 현재 influence(0.5)가 메시의 morph weights로 나간다
    expect(bodyMesh?.weights?.[index]).toBeCloseTo(0.5, 6);
    // 베이스 스켈레톤 하나만 내보낸다
    expect(json.skins).toHaveLength(1);
    expect(json.skins?.[0]?.joints).toHaveLength(68);
    expect(json.nodes.filter((node) => node.name === "mixamorig:Hips")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- 헤어 LOD

describe("키트 헤어 LOD", () => {
  it("preferredLod에 맞는 LOD 하나만 남기고 나머지 메시는 즉시 해제한다", async () => {
    for (const [preferred, expected] of [[0, 0], [1, 1], [2, 2], [9, 2]] as const) {
      const { rig, harness } = await loaded({ preferredLod: preferred });
      expect(meshNames(rig, "hair"), `preferred=${preferred}`).toEqual([`TS_AuthoredHair_soft-bob_LOD${expected}`]);
      const hairMeshes = harness.scene.meshes.filter((mesh) => mesh.name.startsWith("TS_AuthoredHair"));
      expect(hairMeshes.map((mesh) => mesh.name)).toEqual([`TS_AuthoredHair_soft-bob_LOD${expected}`]);
    }
  });

  it("선택 LOD가 없으면 가장 상세한 LOD를 쓴다(LOD0이 없는 헤어)", async () => {
    const { rig } = await loaded({ hairLods: [1, 2], preferredLod: 0 });
    expect(meshNames(rig, "hair")).toEqual(["TS_AuthoredHair_soft-bob_LOD1"]);
  });

  it("헤어 COLOR_0(회색 AO)은 정점 속성으로 남는다", async () => {
    const { rig } = await loaded();
    const colors = partOf(rig, "hair").meshes[0]?.getVerticesData("color");
    expect(colors?.length).toBe(6 * 3 * 4);
    expect(colors?.[0]).toBeCloseTo(0.9, 5);
    expect(colors?.[3]).toBe(1);
  });
});

// ---------------------------------------------------------------- 스켈레톤 재바인딩 변형

describe("키트 스켈레톤 재바인딩: GLB 구조 변형", () => {
  it("파츠의 skin.joints 순서가 베이스와 다르면(이름 집합은 같다) JOINTS 인덱스를 다시 매핑하고 notes에 남긴다", async () => {
    const { fixture, harness } = await setup({ tweaks: { "top/tee": (spec) => ({ ...spec, joints: [...spec.joints].reverse() }) } });
    const handle = await harness.load(fixture);
    const rig = handle.rig;
    expect(rig.notes.some((note) => note.includes("top/tee") && note.includes("순서"))).toBe(true);
    const top = partOf(rig, "top").meshes[0];
    // 상의 정점은 Spine1(베이스 인덱스 2)에 100% — 파츠 GLB에서는 인덱스 65였다
    const indices = top?.getVerticesData("matricesIndices");
    expect(indices?.[0]).toBe(KIT_SKELETON_JOINTS.indexOf("mixamorig:Spine1"));
    expect(top?.skeleton).toBe(rig.skeleton);
    moveBone(rig, "mixamorig:Spine1", [0.25, 0, 0]);
    expectAllMoved(skinnedDeltas(rig, "TS_Top_tee"), [0.25, 0, 0]);
    moveBone(rig, "mixamorig:Spine1", [-0.25, 0, 0]);
    moveBone(rig, "mixamorig:Head", [0, 0.5, 0]);
    expectAllMoved(skinnedDeltas(rig, "TS_Top_tee"), [0, 0, 0]);
  });

  it("베이스의 joint 순서가 manifest와 다르면 그대로 쓰고(이름·부모 동일) 같은 순서의 파츠는 재매핑하지 않는다", async () => {
    const reverse = (spec: KitGlbSpec): KitGlbSpec => ({ ...spec, joints: [...spec.joints].reverse() });
    const { fixture, harness } = await setup({ tweaks: { "base/female": reverse, "top/tee": reverse } });
    const handle = await harness.load(fixture);
    const notes = handle.rig.notes;
    expect(notes.some((note) => note.includes("manifest") && note.includes("순서"))).toBe(true);
    expect(notes.some((note) => note.includes("top/tee"))).toBe(false);
    moveBone(handle.rig, "mixamorig:Spine1", [0.25, 0, 0]);
    expectAllMoved(skinnedDeltas(handle.rig, "TS_Top_tee"), [0.25, 0, 0]);
  });

  it("메시 노드가 장면 루트에 있어도(Armature 자식이 아니어도) 로드되고 리그 루트로 옮겨진다", async () => {
    const { rig } = await loaded({ tweaks: { "top/tee": (spec) => ({ ...spec, meshParent: "scene" }), "base/female": (spec) => ({ ...spec, meshParent: "scene" }) } });
    for (const part of rig.parts) for (const mesh of part.meshes) expect(mesh.isDescendantOf(rig.root), mesh.name).toBe(true);
    expect(partOf(rig, "top").meshes[0]?.parent).toBe(rig.root);
  });

  it("다중 프리미티브 부모 노드(TS_Mouth)는 파츠 수명 동안 리그 아래에 남는다", async () => {
    const { rig } = await loaded();
    const mouth = partOf(rig, "teeth").meshes[0];
    expect(mouth?.parent?.name).toBe("TS_Mouth");
    expect(mouth?.isDescendantOf(rig.root)).toBe(true);
  });
});

// ---------------------------------------------------------------- 증분 교체

describe("키트 증분 교체(update)", () => {
  async function swapFixture(partIds: readonly PresetId[], options: KitFixtureOptions = {}) {
    return buildKitFixture({ partIds, ...options });
  }

  it("바뀐 파츠만 받아 합치고 빠진 파츠만 해제한다: 헤어 교체 + 신발 제거 + 액세서리 추가", async () => {
    const { harness, handle, rig } = await loaded();
    const baseUrl = fixtureUrl("female", "base/female");
    const next = await swapFixture(["hair/hime-cut", "top/tee", "bottom/jeans", "irises/round-large", "accessory/glasses"]);
    for (const [url, bytes] of next.files) harness.store.set(url, bytes);
    harness.requested.length = 0;
    const oldHair = partOf(rig, "hair");
    const oldShoes = partOf(rig, "shoes");
    const oldTop = partOf(rig, "top");
    const oldHairTargets = rig.morphs.get("param:headSize:+")?.length ?? 0;
    const beforeScene = sceneCounts(harness);

    expect(handle.compatible(next.plan)).toBe(true);
    const report = await handle.update(next.plan);
    expect([...report.addedPartIds].sort()).toEqual(["accessory/glasses", "hair/hime-cut"]);
    expect([...report.removedPartIds].sort()).toEqual(["hair/soft-bob", "shoes/sneakers"]);
    expect(report.needsPlanReapply).toBe(true);
    expect(report.addedRigParts.map((part) => part.role).sort()).toEqual(["accessory", "hair"]);
    expect(report.removedRigParts.map((part) => part.role).sort()).toEqual(["hair", "shoes"]);
    // 베이스·상의·하의·홍채는 다시 받지 않는다
    expect(harness.requested.sort()).toEqual([fixtureUrl("female", "accessory/glasses"), fixtureUrl("female", "hair/hime-cut")].sort());
    expect(harness.requested).not.toContain(baseUrl);

    // 리그는 같은 객체이고 컬렉션이 제자리에서 갱신된다
    expect(handle.rig).toBe(rig);
    expect(rig.parts.map((part) => part.role)).toEqual(["skin", "head", "eyeball", "iris", "eye-highlight", "brow", "lash", "teeth", "tongue", "hair", "top", "bottom", "accessory", "underwear"]);
    expect(partOf(rig, "top")).toBe(oldTop);
    expect(partOf(rig, "hair")).not.toBe(oldHair);
    expect(meshNames(rig, "hair")).toEqual(["TS_AuthoredHair_hime-cut_LOD0"]);
    expect(meshNames(rig, "accessory")).toEqual(["TS_Accessory_glasses"]);
    expect(rig.parts.some((part) => part.role === "shoes")).toBe(false);
    expect(rig.partById.get(rolePartId("shoes"))).toBeUndefined();
    expect(rig.partIdPalette[rolePartId("accessory")]?.role).toBe("accessory");
    expect(rig.partIdPalette[rolePartId("shoes")]).toBeUndefined();
    expect([...handle.loadedPartIds()].sort()).toEqual(["accessory/glasses", "base/female", "bottom/jeans", "hair/hime-cut", "irises/round-large", "top/tee"].sort());

    // 해제된 파츠의 자원은 장면에서 사라지고 새 파츠의 것만 남는다(누수 없음)
    expect(oldHair.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(oldShoes.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(rig.parts.flatMap((part) => part.meshes).every((mesh) => !mesh.isDisposed())).toBe(true);
    const afterScene = sceneCounts(harness);
    expect(afterScene.skeletons).toBe(1);
    expect(afterScene.meshes).toBe(beforeScene.meshes); // 헤어 1·신발 1 해제, 헤어 1·액세서리 1 추가
    expect(harness.scene.transformNodes.filter((node) => node.name === "Armature")).toHaveLength(1);
    expect(harness.scene.meshes.some((mesh) => mesh.name.includes("soft-bob") || mesh.name.includes("Shoes"))).toBe(false);

    // morph 등록: 해제된 타깃은 빠지고 새 타깃이 같은 이름에 모인다
    expect(rig.morphs.get("param:headSize:+")?.length).toBe(oldHairTargets + 1); // 헤어 교체(±0) + 액세서리 +1
    expect(rig.morphs.get("param:height:+")?.length).toBe(4); // 몸·속옷·상의·하의(신발 제거)
    for (const targets of rig.morphs.values()) for (const target of targets) expect(target.influence).toBe(0);
    expect(rig.morphNames).toEqual(next.plan.morphNames);

    // 몸 가림 재계산: 신발이 빠져 foot.L/R이 다시 보인다(남은 숨김은 torso·upperArm·pelvis·thigh)
    const body = partOf(rig, "skin").meshes[0];
    expect(body?.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[0, 6], [30, 24], [66, 24]]);
    expect([...(report.bodyMask?.hiddenRegions ?? [])].sort()).toEqual(["pelvis", "thigh.L", "thigh.R", "torso", "upperArm.L", "upperArm.R"]);
    // 새 헤어도 베이스 스켈레톤을 따라간다
    moveBone(rig, "mixamorig:Head", [0, 0.5, 0]);
    expectAllMoved(skinnedDeltas(rig, "TS_AuthoredHair_hime-cut_LOD0"), [0, 0.5, 0]);
  });

  it("같은 플랜이면 아무것도 받지 않고 리그도 바뀌지 않는다", async () => {
    const { fixture, harness, handle, rig } = await loaded();
    harness.requested.length = 0;
    const before = sceneCounts(harness);
    const parts = [...rig.parts];
    const report = await handle.update(fixture.plan);
    expect(report).toMatchObject({ addedPartIds: [], removedPartIds: [], needsPlanReapply: false });
    expect(harness.requested).toEqual([]);
    expect(sceneCounts(harness)).toEqual(before);
    expect(rig.parts).toHaveLength(parts.length);
    rig.parts.forEach((part, index) => expect(part).toBe(parts[index]));
  });

  it("파츠 파일이 바뀌면(SHA 다름) 같은 id여도 그 파츠만 교체한다", async () => {
    const { fixture, harness, handle, rig } = await loaded();
    const shifted = (spec: KitGlbSpec): KitGlbSpec => ({ ...spec, meshes: spec.meshes.map((mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, origin: [0.4, 0.8, 0.05] as const })) })) });
    const changed = await buildKitFixture({ tweaks: { "bottom/jeans": shifted } });
    for (const [url, bytes] of changed.files) harness.store.set(url, bytes);
    const oldBottom = partOf(rig, "bottom");
    const oldTop = partOf(rig, "top");
    const report = await handle.update(changed.plan);
    expect(report.addedPartIds).toEqual(["bottom/jeans"]);
    expect(report.removedPartIds).toEqual(["bottom/jeans"]);
    expect(partOf(rig, "bottom")).not.toBe(oldBottom);
    expect(partOf(rig, "top")).toBe(oldTop);
    expect(oldBottom.meshes[0]?.isDisposed()).toBe(true);
    const sha = (plan: KitPlan): string | undefined => plan.parts.find((part) => part.id === "bottom/jeans")?.sha256;
    expect(sha(fixture.plan)).not.toBe(sha(changed.plan));
  });

  it("헤어 LOD 정책이 바뀌면 헤어만 다시 연다", async () => {
    const { fixture, harness, handle, rig } = await loaded();
    harness.requested.length = 0;
    const report = await handle.update({ ...fixture.plan, hairLodPolicy: { preferredLod: 1 } });
    expect(report.addedPartIds).toEqual(["hair/soft-bob"]);
    expect(harness.requested).toEqual([fixtureUrl("female", "hair/soft-bob")]);
    expect(meshNames(rig, "hair")).toEqual(["TS_AuthoredHair_soft-bob_LOD1"]);
  });

  it("다른 베이스·키트 버전이면 compatible=false이고 update는 kit-version-mismatch로 거부하되 리그는 그대로다", async () => {
    const { fixture, handle, rig } = await loaded();
    const male = await buildKitFixture({ baseId: "male" });
    expect(handle.compatible(male.plan)).toBe(false);
    expect(handle.compatible({ ...fixture.plan, kitVersion: fixture.plan.kitVersion + 1 })).toBe(false);
    expect(handle.compatible({ ...fixture.plan, kitId: "other-kit" })).toBe(false);
    const failure = await failureOf(handle.update(male.plan));
    expect(failure.code).toBe("kit-version-mismatch");
    expect(failure.reasonKo).toContain("처음부터");
    expect(rig.parts.length).toBeGreaterThan(0);
    expect(handle.loadedPartIds()).toContain("hair/soft-bob");
  });

  it("교체 중 실패하면 반쯤 바뀐 리그를 남기지 않고 키트 전체를 해제한다", async () => {
    const { harness, handle, rig } = await loaded();
    const broken = await buildKitFixture({ partIds: ["hair/hime-cut", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"], tweaks: { "hair/hime-cut": (spec) => ({ ...spec, joints: spec.joints.filter((name) => name !== "mixamorig:HeadTop_End") }) } });
    for (const [url, bytes] of broken.files) harness.store.set(url, bytes);
    const failure = await failureOf(handle.update(broken.plan));
    expect(failure.code).toBe("kit-joint-mismatch");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
    expect(rig.parts).toEqual([]);
    expect(handle.loadedPartIds()).toEqual([]);
    expect((await failureOf(handle.update(broken.plan))).code).toBe("engine-disposed");
  });

  it("받기 실패(SHA 불일치)도 키트 전체를 해제한다", async () => {
    const { harness, handle } = await loaded();
    const next = await swapFixture(["hair/hime-cut", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    for (const [url, bytes] of next.files) harness.store.set(url, bytes);
    const tampered = { ...next.plan, parts: next.plan.parts.map((part) => (part.id === "hair/hime-cut" ? { ...part, sha256: "0".repeat(64) } : part)) };
    const failure = await failureOf(handle.update(tampered));
    expect(failure.code).toBe("kit-sha-mismatch");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });
});

// ---------------------------------------------------------------- 실패 경로

describe("키트 로드 실패 경로(fail-visible, 장면 정리)", () => {
  async function expectFailure(options: KitFixtureOptions, code: string, includes: string, mutatePlan: (plan: KitPlan) => KitPlan = (plan) => plan): Promise<LabFailure> {
    const { fixture, harness } = await setup(options);
    const failure = await failureOf(harness.load({ ...fixture, plan: mutatePlan(fixture.plan) }));
    expect(failure.code).toBe(code);
    expect(failure.reasonKo).toContain(includes);
    expect(failure.at).toBe(5_000);
    // 실패해도 만들던 노드·메시·재질·텍스처·스켈레톤이 장면에 남지 않는다
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
    return failure;
  }

  it("kit-file-fetch-failed: 파일을 못 받으면 URL을 사유에 담고 원인을 detail에 남긴다", async () => {
    const { fixture, harness } = await setup();
    const failure = await failureOf(
      harness.load(fixture, {
        fetchBytes: async (url) => {
          if (url.includes("shoes")) throw new Error("네트워크 끊김");
          return fixture.files.get(url) as Uint8Array;
        },
      }),
    );
    expect(failure.code).toBe("kit-file-fetch-failed");
    expect(failure.reasonKo).toContain("shoes/sneakers.glb");
    expect(failure.detail).toContain("네트워크 끊김");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });

  it("kit-bytes-mismatch / kit-sha-mismatch: 크기·해시가 플랜과 다르면 거부한다", async () => {
    await expectFailure({}, "kit-bytes-mismatch", "크기", (plan) => ({ ...plan, parts: plan.parts.map((part) => (part.id === "top/tee" ? { ...part, bytes: part.bytes + 1 } : part)) }));
    await expectFailure({}, "kit-sha-mismatch", "SHA-256", (plan) => ({ ...plan, parts: plan.parts.map((part) => (part.id === "top/tee" ? { ...part, sha256: "f".repeat(64) } : part)) }));
  });

  it("verifyIntegrity=false면 크기·해시를 대조하지 않는다", async () => {
    const { fixture, harness } = await setup({}, { verifyIntegrity: false });
    const bad = { ...fixture.plan, parts: fixture.plan.parts.map((part) => ({ ...part, bytes: 1, sha256: "a".repeat(64) })) };
    await expect(harness.load({ ...fixture, plan: bad })).resolves.toBeDefined();
  });

  it("kit-glb-load-failed: GLB가 아닌 바이트는 Babylon 로더 실패로 거부한다", async () => {
    const { fixture, harness } = await setup({}, { verifyIntegrity: false });
    harness.store.set(fixtureUrl("female", "top/tee"), new Uint8Array(64).fill(7));
    const failure = await failureOf(harness.load(fixture));
    expect(failure.code).toBe("kit-glb-load-failed");
    expect(failure.reasonKo).toContain("top/tee.glb");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });

  it("kit-glb-load-failed: 좌표계가 좌수인 장면에는 올리지 않는다", async () => {
    const { fixture, harness } = await setup({}, { rightHanded: false });
    const failure = await failureOf(harness.load(fixture));
    expect(failure.code).toBe("kit-glb-load-failed");
    expect(failure.reasonKo).toContain("우수 좌표계");
    expect(harness.requested).toEqual([]);
  });

  it("kit-unsupported-extension: 금지된 압축 확장과 알 수 없는 required 확장을 거부한다", async () => {
    await expectFailure({ tweaks: { "top/tee": (spec) => ({ ...spec, extensionsUsed: ["KHR_draco_mesh_compression"] }) } }, "kit-unsupported-extension", "KHR_draco_mesh_compression");
    await expectFailure({ tweaks: { "hair/soft-bob": (spec) => ({ ...spec, extensionsUsed: ["EXT_made_up"], extensionsRequired: ["EXT_made_up"] }) } }, "kit-unsupported-extension", "EXT_made_up");
  });

  it("kit-base-missing: 첫 항목이 베이스가 아닌 플랜", async () => {
    await expectFailure({}, "kit-base-missing", "베이스", (plan) => ({ ...plan, parts: plan.parts.slice(1) }));
  });

  describe("kit-joint-mismatch", () => {
    it("파츠에 joint가 빠졌다", async () => {
      const failure = await expectFailure({ tweaks: { "top/tee": (spec) => ({ ...spec, joints: spec.joints.filter((name) => name !== "mixamorig:HeadTop_End") }) } }, "kit-joint-mismatch", "mixamorig:HeadTop_End");
      expect(failure.reasonKo).toContain("파츠 top/tee");
    });

    it("파츠에 여분 joint가 있다", async () => {
      await expectFailure(
        { tweaks: { "bottom/jeans": (spec) => ({ ...spec, joints: [...spec.joints, "extra_joint"], parents: { ...spec.parents, extra_joint: "mixamorig:Hips" } }) } },
        "kit-joint-mismatch",
        "extra_joint",
      );
    });

    it("부모 관계가 다르다", async () => {
      await expectFailure({ tweaks: { "shoes/sneakers": (spec) => ({ ...spec, parents: { ...spec.parents, "mixamorig:LeftHand": "mixamorig:Spine" } }) } }, "kit-joint-mismatch", "mixamorig:LeftHand");
    });

    it("베이스가 manifest와 다르다", async () => {
      const failure = await expectFailure({ tweaks: { "base/female": (spec) => ({ ...spec, joints: spec.joints.filter((name) => name !== "TS_Jaw") }) } }, "kit-joint-mismatch", "TS_Jaw");
      expect(failure.reasonKo).toContain("키트 manifest");
    });

    it("어긋난 joint가 많으면 5개까지만 이름을 적고 나머지는 개수로 요약한다", async () => {
      const tips = ["Thumb", "Index", "Middle", "Ring", "Pinky"].flatMap((finger) => [`mixamorig:LeftHand${finger}4`, `mixamorig:RightHand${finger}4`]);
      const failure = await expectFailure({ tweaks: { "top/tee": (spec) => ({ ...spec, joints: spec.joints.filter((name) => !tips.includes(name)) }) } }, "kit-joint-mismatch", "없는 joint 10개");
      expect(failure.reasonKo).toContain("외 5개");
    });

    it("스킨(스켈레톤)이 없는 GLB는 kit-skin-invalid다", async () => {
      await expectFailure({ tweaks: { "top/tee": (spec) => ({ ...spec, noSkin: true }) } }, "kit-skin-invalid", "스켈레톤");
    });
  });

  describe("메시 선언 대조", () => {
    it("kit-mesh-undeclared: 플랜에 없는 메시", async () => {
      await expectFailure(
        { tweaks: { "top/tee": (spec) => ({ ...spec, meshes: [...spec.meshes, { node: "TS_Stray", primitives: [{ triangles: 1, joint: "mixamorig:Hips", material: "ts_top_tee" }], morphs: [] }] }) } },
        "kit-mesh-undeclared",
        "TS_Stray",
      );
    });

    it("kit-mesh-missing: 선언했는데 GLB에 없는 메시", async () => {
      await expectFailure({ tweaks: { "base/female": (spec) => ({ ...spec, meshes: spec.meshes.filter((mesh) => mesh.node !== "TS_Lashes") }) } }, "kit-mesh-missing", "TS_Lashes");
    });

    it("kit-mesh-missing: 다중 프리미티브 선언보다 프리미티브가 적다", async () => {
      await expectFailure({ tweaks: { "base/female": (spec) => replaceMesh(spec, "TS_Mouth", (mesh) => ({ ...mesh, primitives: mesh.primitives.slice(0, 1) })) } }, "kit-mesh-missing", "프리미티브");
    });

    it("kit-mesh-undeclared: 단일로 선언한 메시가 프리미티브 둘로 나뉜다", async () => {
      await expectFailure(
        { tweaks: { "top/tee": (spec) => replaceMesh(spec, "TS_Top_tee", (mesh) => ({ ...mesh, primitives: [...mesh.primitives, ...mesh.primitives] })) } },
        "kit-mesh-undeclared",
        "프리미티브",
      );
    });

    it("kit-outline-shell-forbidden: `_Outline` 셸 메시", async () => {
      await expectFailure(
        { tweaks: { "top/tee": (spec) => ({ ...spec, meshes: [...spec.meshes, { node: "TS_Top_tee_Outline", primitives: [{ triangles: 1, joint: "mixamorig:Hips", material: "ts_top_tee" }], morphs: [] }] }) } },
        "kit-outline-shell-forbidden",
        "_Outline",
      );
    });

    it("kit-morph-missing: 선언한 morph 타깃이 GLB에 없다", async () => {
      await expectFailure({ tweaks: { "base/female": (spec) => replaceMesh(spec, "TS_Head", (mesh) => ({ ...mesh, morphs: mesh.morphs.filter((name) => name !== "facs:jawOpen") })) } }, "kit-morph-missing", "facs:jawOpen");
    });

    it("kit-mesh-undeclared: GLB 재질 이름이 선언과 다르다", async () => {
      await expectFailure(
        { tweaks: { "top/tee": (spec) => replaceMesh(spec, "TS_Top_tee", (mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, material: "ts_other" })) })) } },
        "kit-mesh-undeclared",
        "ts_other",
      );
    });

    it("선언되지 않은 morph 타깃은 구동하지 않고 notes로 알린다(무음으로 등록하지 않는다)", async () => {
      const { fixture, harness } = await setup({ tweaks: { "base/female": (spec) => replaceMesh(spec, "TS_Head", (mesh) => ({ ...mesh, morphs: [...mesh.morphs, "ext:custom"] })) } });
      const handle = await harness.load(fixture);
      expect(handle.rig.morphs.has("ext:custom")).toBe(false);
      expect(handle.rig.morphNames).not.toContain("ext:custom");
      expect(handle.rig.notes.some((note) => note.includes("TS_Head") && note.includes("ext:custom") && note.includes("선언되지 않은"))).toBe(true);
    });

    it("kit-material-multiple: 한 역할에 재질이 둘 이상이다(눈 좌우가 다른 재질)", async () => {
      await expectFailure(
        { tweaks: { "base/female": (spec) => replaceMesh(spec, "TS_Eye_R", (mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, material: "ts_eye_r" })) })) } },
        "kit-material-multiple",
        "eyeball",
        (plan) => ({
          ...plan,
          parts: plan.parts.map((part) => (part.kind === "base" ? { ...part, meshes: part.meshes.map((mesh) => (mesh.node === "TS_Eye_R" ? { ...mesh, material: "ts_eye_r" } : mesh)) } : part)),
        }),
      );
    });

    it("역할이 두 파일에 중복되면(헤어 파츠 둘) 거부한다", async () => {
      await expectFailure({ partIds: [...REQUIRED, "hair/hime-cut"] }, "kit-mesh-undeclared", "중복");
    });

    it("kit-manifest-invalid: 메시 재질이 키트 재질 선언(materials)에 없다", async () => {
      await expectFailure({}, "kit-manifest-invalid", "ts_top_tee", (plan) => ({ ...plan, materials: Object.fromEntries(Object.entries(plan.materials).filter(([name]) => name !== "ts_top_tee")) }));
    });
  });

  describe("스킨·변환", () => {
    it("kit-skin-invalid: 스킨 없는 메시(같은 파일의 다른 메시는 스킨이 있다)", async () => {
      const failure = await expectFailure({ tweaks: { "base/female": (spec) => replaceMesh(spec, "TS_Lashes", (mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, skinned: false })) })) } }, "kit-skin-invalid", "스킨");
      expect(failure.reasonKo).toContain("TS_Lashes");
    });

    it("kit-skin-invalid: 정점당 영향 본이 4개를 넘는다", async () => {
      await expectFailure({ tweaks: { "bottom/jeans": (spec) => replaceMesh(spec, "TS_Bottom_jeans", (mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, extraInfluence: true })) })) } }, "kit-skin-invalid", "4개");
    });

    it("kit-skin-invalid: 가중치 합이 1이 아니다", async () => {
      await expectFailure({ tweaks: { "shoes/sneakers": (spec) => replaceMesh(spec, "TS_Shoes_sneakers", (mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, weightSum: 0.5 })) })) } }, "kit-skin-invalid", "가중치 합");
    });

    it("kit-transform-invalid: 스킨 메시 노드 변환이 항등이 아니다(Babylon은 이 변환을 무시하므로 GLB JSON에서 확인한다)", async () => {
      await expectFailure({ tweaks: { "top/tee": (spec) => replaceMesh(spec, "TS_Top_tee", (mesh) => ({ ...mesh, translation: [0.1, 0, 0] })) } }, "kit-transform-invalid", "TS_Top_tee");
    });

    it("kit-transform-invalid: Armature 스케일이 1이 아니다", async () => {
      await expectFailure({ tweaks: { "base/female": (spec) => ({ ...spec, armatureScale: 2 }) } }, "kit-transform-invalid", "Armature");
    });
  });
});

describe("엔진이 재질을 바꾸거나 던질 때", () => {
  it("adaptMaterial이 새 재질을 돌려주면 모든 메시에 그 재질이 걸리고 해제 때 함께 정리된다", async () => {
    const { fixture, harness } = await setup({}, { replaceMaterials: true });
    const handle = await harness.load(fixture);
    const hair = partOf(handle.rig, "hair");
    expect(hair.pbr.name).toBe("adapted:hair");
    for (const mesh of partOf(handle.rig, "eyeball").meshes) expect(mesh.material?.name).toBe("adapted:eyeball");
    handle.dispose();
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });

  it("adaptMaterial이 던지면 일반 오류를 그대로 전달하되 만들던 것을 모두 정리한다(엔진이 source-load-failed로 감싼다)", async () => {
    const { fixture, harness } = await setup();
    await expect(
      harness.load(fixture, {
        adaptMaterial: () => {
          throw new Error("재질 보강 실패");
        },
      }),
    ).rejects.toThrow("재질 보강 실패");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });
});

describe("받기 단계의 취소·중단", () => {
  it("파일 하나가 실패하면 아직 시작하지 않은 파일은 더 받지 않는다", async () => {
    const { fixture, harness } = await setup();
    const requested: string[] = [];
    const failure = await failureOf(
      harness.load(fixture, {
        parallelism: 1,
        fetchBytes: async (url) => {
          requested.push(url);
          throw new Error("연결 거부");
        },
      }),
    );
    expect(failure.code).toBe("kit-file-fetch-failed");
    expect(requested).toHaveLength(1);
  });

  it("교체를 기다리는 동안 리그가 해제되면 engine-disposed로 끝나고 아무것도 남지 않는다", async () => {
    const { harness, handle } = await loaded();
    const next = await buildKitFixture({ partIds: ["hair/hime-cut", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"] });
    for (const [url, bytes] of next.files) harness.store.set(url, bytes);
    const pending = handle.update(next.plan);
    handle.dispose();
    expect((await failureOf(pending)).code).toBe("engine-disposed");
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
  });
});

// ---------------------------------------------------------------- 해제

describe("키트 해제", () => {
  it("dispose는 노드·메시·재질·텍스처·morph 매니저·스켈레톤을 모두 정리하고 멱등이다", async () => {
    const { harness, handle, rig } = await loaded({ partIds: [...REQUIRED, "accessory/glasses"] });
    expect(sceneCounts(harness).meshes).toBeGreaterThan(15);
    const top = partOf(rig, "top");
    handle.dispose();
    expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
    expect(rig.parts).toEqual([]);
    expect(rig.partById.size).toBe(0);
    expect(rig.morphs.size).toBe(0);
    expect(rig.morphNames).toEqual([]);
    expect(rig.bones.size).toBe(0);
    expect(rig.skeleton).toBeNull();
    expect(rig.jointOffsets).toBeNull();
    expect(top.meshes[0]?.isDisposed()).toBe(true);
    expect(() => handle.dispose()).not.toThrow();
    expect(() => rig.dispose()).not.toThrow();
    expect(handle.loadedPartIds()).toEqual([]);
  });

  it("두 번째 로드는 첫 번째와 독립이다(같은 장면에 연달아 올리고 해제해도 누수가 없다)", async () => {
    const { fixture, harness } = await setup();
    for (let round = 0; round < 3; round += 1) {
      const handle = await harness.load(fixture);
      expect(sceneCounts(harness).skeletons).toBe(1);
      handle.dispose();
      expect(sceneCounts(harness)).toEqual(EMPTY_SCENE);
    }
  });
});

describe("합성 fixture 자체", () => {
  it("베이스·파츠 GLB가 플랜의 URL·크기·SHA와 맞는다", async () => {
    const fixture = await buildKitFixture();
    expect(fixture.plan.parts.map((part) => part.id)).toEqual(["base/female", ...KIT_REQUIRED_PRESETS]);
    for (const part of fixture.plan.parts) {
      const bytes = fixture.files.get(part.url);
      expect(bytes?.byteLength, part.id).toBe(part.bytes);
      expect(new TextDecoder().decode((bytes as Uint8Array).subarray(0, 4)), part.id).toBe("glTF");
    }
    const json = parseGlb(fixture.files.get(fixture.plan.parts[0]?.url ?? "") as Uint8Array).json as { skins: Array<{ joints: number[] }> };
    expect(json.skins[0]?.joints).toHaveLength(68);
  });
});
