/**
 * render 테스트용 합성 키트 fixture(KT-03): 68 joint 스켈레톤을 가진 스킨 GLB 빌더 + 그 GLB들과 짝이 맞는 `KitPlan` 생성기.
 *
 * 실제 키트 에셋(KT-10/11)이 안착하기 전에 키트 로더(`render/babylon/kit-loader.ts`)의 계약을 NullEngine에서 확인하기 위한 것이다.
 * GLB는 메시마다 삼각형 몇 개뿐이지만 Blender 내보내기와 같은 구조를 따른다: `Armature` 노드 아래 joint 노드 68개, 스킨 1개(`skin.joints` 순서 가변),
 * 스킨 메시(JOINTS_0 UNSIGNED_BYTE·WEIGHTS_0 FLOAT), shape key 이름은 `mesh.extras.targetNames`, 다중 프리미티브(`TS_Mouth`), 헤어 LOD 이름.
 * 모든 값은 결정적이다(난수 없음). 이 파일은 순수 TS이며 Babylon을 정적으로 import하지 않는다 — 로더 호출 하네스는 맨 아래 `createKitHarness`가 동적 import로 만든다.
 *
 * `tweaks`로 GLB 내용만 바꾸고 플랜은 그대로 두면 "선언과 GLB가 어긋난" 실패 경로를 만들 수 있다.
 */
import {
  ALL_AVAILABLE_CAPABILITIES,
  KIT_ASSET_ROOT,
  KIT_BASE_MESH_SPECS,
  KIT_BONE_MAP,
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_ID,
  KIT_END_BONES,
  KIT_HIDEABLE_REGION_IDS,
  KIT_REQUIRED_PRESETS,
  KIT_ROLE_TINT_RULES,
  KIT_SKELETON_JOINTS,
  KIT_SKELETON_PARENTS,
} from "../../contracts";
import { sha256Hex } from "../../shared/hash";
import { GLB_CHUNK_BIN, GLB_CHUNK_JSON, GLB_MAGIC, GLB_VERSION } from "../../testing/minimal-glb";

import type { NullCapabilityOverrides } from "./null-engine-harness";
import type { KitBaseId, KitHideableRegionId, KitJointOffsets, KitMaterial, KitMesh, KitPartPlan, KitPartSlot, KitPlan, MorphTargetName, PartRole, PresetId } from "../../contracts";
import type { Scene } from "@babylonjs/core/scene.js";

// ---------------------------------------------------------------- 저수준 GLB 빌더

type Vec3 = readonly [number, number, number];

/** 프리미티브 하나(삼각형 `triangles`개, 삼각형마다 정점 3개 — 정점 공유 없음) */
export interface KitGlbPrimitiveSpec {
  readonly triangles: number;
  /** glTF 재질 이름(생략하면 재질 없음) */
  readonly material?: string;
  /** 가중치 100%를 받는 joint 이름 */
  readonly joint: string;
  /** 위치 구분용 시작점(미터) */
  readonly origin?: Vec3;
  /** false면 JOINTS/WEIGHTS를 쓰지 않는다(스킨 없는 메시 — `kit-skin-invalid` 시험) */
  readonly skinned?: boolean;
  /** true면 JOINTS_1/WEIGHTS_1을 더해 영향 5개 이상으로 만든다 */
  readonly extraInfluence?: boolean;
  /** 가중치 합(기본 1) — 1이 아니면 `kit-skin-invalid` 시험 */
  readonly weightSum?: number;
  /** baseColor 텍스처(1×1 PNG)를 임베드한다 */
  readonly textured?: boolean;
  /** `COLOR_0`(회색 AO) 값. 생략하면 속성 없음 */
  readonly vertexColor?: number;
}

export interface KitGlbMeshSpec {
  /** 노드·메시 이름. 프리미티브가 둘 이상이면 Babylon이 `<name>_primitive<i>`로 나눈다. */
  readonly node: string;
  readonly primitives: readonly KitGlbPrimitiveSpec[];
  /** shape key(=morph target) 이름. 프리미티브마다 같은 타깃이 붙는다. 델타는 이름 순번에 비례한 +Y 이동이다. */
  readonly morphs: readonly string[];
  /** 노드 평행이동(기본 0). 항등이 아니면 `kit-transform-invalid` 시험 */
  readonly translation?: Vec3;
}

export interface KitGlbSpec {
  /** `skin.joints` 순서(joint 이름) */
  readonly joints: readonly string[];
  /** joint → 부모 joint(null이면 Armature 직속). 여기에 없는 joint는 Armature 직속이다. */
  readonly parents: Readonly<Record<string, string | null>>;
  readonly meshes: readonly KitGlbMeshSpec[];
  /** 메시 노드의 부모: Blender 기본(Armature 자식) 또는 장면 루트 */
  readonly meshParent?: "armature" | "scene";
  readonly armatureName?: string;
  /** Armature 스케일(기본 1) — 항등이 아니면 `kit-transform-invalid` 시험 */
  readonly armatureScale?: number;
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
  /** true면 스킨 객체를 쓰지 않는다 */
  readonly noSkin?: boolean;
}

const ENCODER = new TextEncoder();

function pad4(length: number): number {
  return (length + 3) & ~3;
}

/** 키트 joint의 로컬 rest 평행이동(미터). 대략적인 T-포즈 휴머노이드(좌 +X, 얼굴 +Z). 회전은 모두 항등이다. */
export function kitJointLocalTranslation(name: string): Vec3 {
  const left = name.includes("Left") || name.endsWith(".L");
  const right = name.includes("Right") || name.endsWith(".R");
  const side = left ? 1 : right ? -1 : 0;
  const bare = name.replace(/^mixamorig:/u, "").replace(/^(?:Left|Right)/u, "");
  switch (bare) {
    case "Hips":
      return [0, 1, 0];
    case "Spine":
    case "Spine1":
    case "Spine2":
      return [0, 0.12, 0];
    case "Neck":
      return [0, 0.1, 0];
    case "Head":
      return [0, 0.08, 0];
    case "HeadTop_End":
      return [0, 0.2, 0];
    case "Shoulder":
      return [side * 0.05, 0.08, 0];
    case "Arm":
      return [side * 0.1, 0, 0];
    case "ForeArm":
      return [side * 0.28, 0, 0];
    case "Hand":
      return [side * 0.26, 0, 0];
    case "UpLeg":
      return [side * 0.08, -0.05, 0];
    case "Leg":
      return [0, -0.45, 0];
    case "Foot":
      return [0, -0.45, 0];
    case "ToeBase":
      return [0, -0.05, 0.1];
    case "Toe_End":
      return [0, 0, 0.05];
    default:
      break;
  }
  if (name === "TS_Jaw") return [0, -0.03, 0.05];
  if (name.startsWith("TS_Eye")) return [side * 0.03, 0.05, 0.08];
  if (/^Hand/u.test(bare)) return [side * 0.03, 0, 0];
  return [0, 0.01, 0];
}

/** Armature 기준 joint 월드 위치(회전이 모두 항등이라 로컬 평행이동의 합이다). */
function jointWorld(name: string, parents: Readonly<Record<string, string | null>>): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let cursor: string | null | undefined = name;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const t = kitJointLocalTranslation(cursor);
    x += t[0];
    y += t[1];
    z += t[2];
    cursor = parents[cursor];
  }
  return [x, y, z];
}

/** 1×1 PNG(알베도 텍스처 존재 여부 시험용) */
const TINY_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));

interface BinParts {
  readonly chunks: Uint8Array[];
  length: number;
}

function addView(bin: BinParts, views: Array<Record<string, number>>, data: Uint8Array, target?: number): number {
  const offset = pad4(bin.length);
  if (offset > bin.length) {
    bin.chunks.push(new Uint8Array(offset - bin.length));
    bin.length = offset;
  }
  bin.chunks.push(data);
  views.push({ buffer: 0, byteOffset: bin.length, byteLength: data.byteLength, ...(target !== undefined ? { target } : {}) });
  bin.length += data.byteLength;
  return views.length - 1;
}

/** 스킨 메시 키트 GLB를 만든다. */
export function buildKitGlb(spec: KitGlbSpec): Uint8Array {
  const bin: BinParts = { chunks: [], length: 0 };
  const views: Array<Record<string, number>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const accessor = (data: Uint8Array, componentType: number, count: number, type: string, target?: number, bounds?: { min: number[]; max: number[] }): number => {
    const view = addView(bin, views, data, target);
    accessors.push({ bufferView: view, componentType, count, type, ...(bounds ?? {}) });
    return accessors.length - 1;
  };
  const f32 = (values: number[]): Uint8Array => new Uint8Array(new Float32Array(values).buffer);
  const u32 = (values: number[]): Uint8Array => new Uint8Array(new Uint32Array(values).buffer);

  // 노드: [0] Armature, [1..J] joint(이름 사전 순이 아니라 `spec.joints` 순서), 이후 메시 노드
  const armatureName = spec.armatureName ?? "Armature";
  const jointNodeIndex = new Map<string, number>();
  spec.joints.forEach((name, index) => jointNodeIndex.set(name, index + 1));
  const nodes: Array<Record<string, unknown>> = [{ name: armatureName, children: [] as number[], ...(spec.armatureScale !== undefined && spec.armatureScale !== 1 ? { scale: [spec.armatureScale, spec.armatureScale, spec.armatureScale] } : {}) }];
  for (const name of spec.joints) nodes.push({ name, translation: [...kitJointLocalTranslation(name)] });
  const childrenOf = (index: number): number[] => {
    const node = nodes[index] as { children?: number[] };
    node.children = node.children ?? [];
    return node.children;
  };
  for (const name of spec.joints) {
    const parent = spec.parents[name] ?? null;
    const parentIndex = parent === null ? 0 : (jointNodeIndex.get(parent) ?? 0);
    childrenOf(parentIndex).push(jointNodeIndex.get(name) as number);
  }

  // 스킨: IBM = 월드 위치 평행이동의 역행렬(열 우선)
  let skin: Record<string, unknown> | null = null;
  if (!spec.noSkin && spec.joints.length > 0) {
    const matrices: number[] = [];
    for (const name of spec.joints) {
      const w = jointWorld(name, spec.parents);
      matrices.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1);
    }
    const ibm = accessor(f32(matrices), 5126, spec.joints.length, "MAT4");
    skin = { joints: spec.joints.map((name) => jointNodeIndex.get(name)), inverseBindMatrices: ibm };
  }

  const materialIndex = new Map<string, number>();
  const materials: Array<Record<string, unknown>> = [];
  const images: Array<Record<string, unknown>> = [];
  const textures: Array<Record<string, unknown>> = [];
  const ensureMaterial = (name: string, textured: boolean): number => {
    const key = `${name}|${textured ? "tex" : "flat"}`;
    const found = materialIndex.get(key);
    if (found !== undefined) return found;
    const pbr: Record<string, unknown> = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 };
    if (textured) {
      const view = addView(bin, views, TINY_PNG);
      images.push({ bufferView: view, mimeType: "image/png" });
      textures.push({ source: images.length - 1 });
      pbr.baseColorTexture = { index: textures.length - 1 };
    }
    materials.push({ name, pbrMetallicRoughness: pbr });
    materialIndex.set(key, materials.length - 1);
    return materials.length - 1;
  };

  const meshes: Array<Record<string, unknown>> = [];
  const meshNodeBase = nodes.length;
  spec.meshes.forEach((mesh, meshIdx) => {
    const primitives = mesh.primitives.map((primitive) => {
      const vertexCount = primitive.triangles * 3;
      const origin = primitive.origin ?? [0, 0, 0];
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let tri = 0; tri < primitive.triangles; tri += 1) {
        const bx = origin[0] + tri * 0.03;
        const corners: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.02, 0], [0, 0.02]];
        corners.forEach(([dx, dy], corner) => {
          positions.push(bx + dx, origin[1] + dy, origin[2]);
          normals.push(0, 0, 1);
          uvs.push((tri * 3 + corner) / Math.max(1, vertexCount), corner / 3);
          indices.push(tri * 3 + corner);
        });
      }
      const minMax = (values: number[]): { min: number[]; max: number[] } => {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < values.length; i += 3) {
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis] as number, values[i + axis] as number);
            max[axis] = Math.max(max[axis] as number, values[i + axis] as number);
          }
        }
        return { min, max };
      };
      const attributes: Record<string, number> = {
        POSITION: accessor(f32(positions), 5126, vertexCount, "VEC3", 34962, minMax(positions)),
        NORMAL: accessor(f32(normals), 5126, vertexCount, "VEC3", 34962),
        TEXCOORD_0: accessor(f32(uvs), 5126, vertexCount, "VEC2", 34962),
      };
      if (primitive.skinned !== false && skin) {
        const jointIndex = spec.joints.indexOf(primitive.joint);
        const joints: number[] = [];
        const weights: number[] = [];
        for (let v = 0; v < vertexCount; v += 1) {
          joints.push(Math.max(0, jointIndex), 0, 0, 0);
          weights.push(primitive.weightSum ?? 1, 0, 0, 0);
        }
        attributes.JOINTS_0 = accessor(new Uint8Array(joints), 5121, vertexCount, "VEC4", 34962);
        attributes.WEIGHTS_0 = accessor(f32(weights), 5126, vertexCount, "VEC4", 34962);
        if (primitive.extraInfluence === true) {
          const extraJoints: number[] = [];
          const extraWeights: number[] = [];
          for (let v = 0; v < vertexCount; v += 1) {
            extraJoints.push(0, 0, 0, 0);
            extraWeights.push(0.1, 0, 0, 0);
          }
          attributes.JOINTS_1 = accessor(new Uint8Array(extraJoints), 5121, vertexCount, "VEC4", 34962);
          attributes.WEIGHTS_1 = accessor(f32(extraWeights), 5126, vertexCount, "VEC4", 34962);
        }
      }
      if (primitive.vertexColor !== undefined) {
        const colors: number[] = [];
        for (let v = 0; v < vertexCount; v += 1) colors.push(primitive.vertexColor, primitive.vertexColor, primitive.vertexColor, 1);
        attributes.COLOR_0 = accessor(f32(colors), 5126, vertexCount, "VEC4", 34962);
      }
      const targets = mesh.morphs.map((_name, k) => {
        const delta: number[] = [];
        for (let v = 0; v < vertexCount; v += 1) delta.push(0, 0.01 * (k + 1), 0);
        return { POSITION: accessor(f32(delta), 5126, vertexCount, "VEC3", 34962, { min: [0, 0.01 * (k + 1), 0], max: [0, 0.01 * (k + 1), 0] }) };
      });
      const out: Record<string, unknown> = {
        attributes,
        indices: accessor(u32(indices), 5125, indices.length, "SCALAR", 34963),
        ...(primitive.material !== undefined ? { material: ensureMaterial(primitive.material, primitive.textured === true) } : {}),
        ...(targets.length > 0 ? { targets } : {}),
      };
      return out;
    });
    meshes.push({ name: mesh.node, primitives, ...(mesh.morphs.length > 0 ? { extras: { targetNames: [...mesh.morphs] } } : {}) });
    nodes.push({ name: mesh.node, mesh: meshIdx, ...(skin && mesh.primitives.some((p) => p.skinned !== false) ? { skin: 0 } : {}), ...(mesh.translation ? { translation: [...mesh.translation] } : {}) });
  });
  const meshNodes = spec.meshes.map((_mesh, index) => meshNodeBase + index);
  if ((spec.meshParent ?? "armature") === "armature") childrenOf(0).push(...meshNodes);

  const sceneRoots = (spec.meshParent ?? "armature") === "armature" ? [0] : [0, ...meshNodes];
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "toonstudio character-lab render kit-glb-fixture" },
    scene: 0,
    scenes: [{ nodes: sceneRoots }],
    nodes,
    meshes,
    ...(skin ? { skins: [skin] } : {}),
    ...(materials.length > 0 ? { materials } : {}),
    ...(images.length > 0 ? { images, textures } : {}),
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: pad4(bin.length) }],
    ...(spec.extensionsUsed ? { extensionsUsed: [...spec.extensionsUsed] } : {}),
    ...(spec.extensionsRequired ? { extensionsRequired: [...spec.extensionsRequired] } : {}),
  };

  const jsonBytes = ENCODER.encode(JSON.stringify(json));
  const jsonPadded = pad4(jsonBytes.length);
  const binPadded = pad4(bin.length);
  const total = 12 + 8 + jsonPadded + 8 + binPadded;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  for (let i = 20 + jsonBytes.length; i < 20 + jsonPadded; i += 1) out[i] = 0x20;
  const binOffset = 20 + jsonPadded;
  view.setUint32(binOffset, binPadded, true);
  view.setUint32(binOffset + 4, GLB_CHUNK_BIN, true);
  let cursor = binOffset + 8;
  for (const chunk of bin.chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------- 키트 카탈로그(합성)

/** 체형 morph 몇 개(몸·속옷·의상·신발이 가진다) */
export const FIXTURE_BODY_MORPHS: readonly MorphTargetName[] = ["param:height:+", "param:height:-", "param:legLength:+", "param:legLength:-", "param:waist:+"];
/** 머리에 붙는 체형 morph(헤어·액세서리·눈 …) */
export const FIXTURE_HEAD_ATTACHED_MORPHS: readonly MorphTargetName[] = ["param:headSize:+", "param:headSize:-"];
/** 머리 메시 morph */
export const FIXTURE_HEAD_MORPHS: readonly MorphTargetName[] = [...FIXTURE_HEAD_ATTACHED_MORPHS, "param:eyeSize:+", "param:eyeSize:-", "facs:jawOpen"];

/** 합성 키트의 관절 오프셋(체형 morph → 노드 이름 → 로컬 평행이동 가산, m) */
export const FIXTURE_JOINT_OFFSETS: KitJointOffsets = {
  "param:height:+": { "mixamorig:Neck": [0, 0.02, 0], "mixamorig:Head": [0, 0.03, 0] },
  "param:height:-": { "mixamorig:Neck": [0, -0.02, 0], "mixamorig:Head": [0, -0.03, 0] },
  "param:legLength:+": { "mixamorig:LeftLeg": [0, -0.04, 0], "mixamorig:RightLeg": [0, -0.04, 0] },
};

const FIXTURE_FIXED_HEX = "#f2f2f4";
/** 몸 영역마다 삼각형 2개(영역 인덱스 범위는 6씩) */
export const FIXTURE_TRIANGLES_PER_REGION = 2;

export interface KitFixturePartDefinition {
  /** 파츠는 프리셋 id, 베이스는 `base/<baseId>` */
  readonly id: string;
  /** 베이스는 null */
  readonly slot: KitPartSlot | null;
  readonly glb: KitGlbSpec;
  readonly meshes: readonly KitMesh[];
  readonly hides: readonly KitHideableRegionId[];
}

function declared(node: string, role: PartRole, material: string, primitive: KitGlbPrimitiveSpec, morphs: readonly MorphTargetName[], extra: Partial<KitMesh> = {}): { glb: KitGlbMeshSpec; plan: KitMesh } {
  return {
    glb: { node, primitives: [primitive], morphs },
    plan: { node, role, material, triangles: primitive.triangles, vertices: primitive.triangles * 3, skinned: true, morphs: [...morphs], ...extra },
  };
}

const IDENTITY_JOINTS: readonly string[] = KIT_SKELETON_JOINTS;
const HEAD = "mixamorig:Head";

function baseSpec(meshes: readonly KitGlbMeshSpec[], options: Pick<KitGlbSpec, "joints" | "meshParent"> = { joints: IDENTITY_JOINTS }): KitGlbSpec {
  return { joints: options.joints, parents: KIT_SKELETON_PARENTS, meshes, ...(options.meshParent ? { meshParent: options.meshParent } : {}) };
}

/** 베이스 GLB 정의: `KIT_BASE_MESH_SPECS`의 메시 9개 */
export function fixtureBase(baseId: KitBaseId): { readonly glb: KitGlbSpec; readonly meshes: readonly KitMesh[] } {
  const seed = baseId === "female" ? 0 : 0.5;
  const meshes: Array<{ glb: KitGlbMeshSpec; plan: KitMesh }> = [];
  const regionTriangles = KIT_HIDEABLE_REGION_IDS.length * FIXTURE_TRIANGLES_PER_REGION;
  for (const spec of KIT_BASE_MESH_SPECS) {
    switch (spec.node) {
      case "TS_Body":
        meshes.push(declared("TS_Body", "skin", "ts_skin_body", { triangles: regionTriangles, material: "ts_skin_body", joint: "mixamorig:Hips", origin: [seed, 0.5, 0], textured: true }, FIXTURE_BODY_MORPHS));
        break;
      case "TS_Head":
        meshes.push(declared("TS_Head", "head", "ts_skin_head", { triangles: 4, material: "ts_skin_head", joint: HEAD, origin: [seed, 1.6, 0.1] }, FIXTURE_HEAD_MORPHS));
        break;
      case "TS_Eye_L":
        meshes.push(declared("TS_Eye_L", "eyeball", "ts_eye", { triangles: 2, material: "ts_eye", joint: "TS_Eye.L", origin: [seed + 0.03, 1.65, 0.2] }, FIXTURE_HEAD_ATTACHED_MORPHS));
        break;
      case "TS_Eye_R":
        meshes.push(declared("TS_Eye_R", "eyeball", "ts_eye", { triangles: 2, material: "ts_eye", joint: "TS_Eye.R", origin: [seed - 0.03, 1.65, 0.2] }, FIXTURE_HEAD_ATTACHED_MORPHS));
        break;
      case "TS_Mouth": {
        const morphs: readonly MorphTargetName[] = ["param:headSize:+", "param:headSize:-", "facs:jawOpen"];
        const teeth: KitGlbPrimitiveSpec = { triangles: 2, material: "ts_teeth", joint: "TS_Jaw", origin: [seed, 1.55, 0.18] };
        const tongue: KitGlbPrimitiveSpec = { triangles: 1, material: "ts_tongue", joint: "TS_Jaw", origin: [seed, 1.54, 0.17] };
        meshes.push({
          glb: { node: "TS_Mouth", primitives: [teeth, tongue], morphs },
          plan: { node: "TS_Mouth", primitiveRoles: ["teeth", "tongue"], primitiveMaterials: ["ts_teeth", "ts_tongue"], triangles: 3, vertices: 9, skinned: true, morphs: [...morphs] },
        });
        break;
      }
      case "TS_Lashes":
        meshes.push(declared("TS_Lashes", "lash", "ts_lashes", { triangles: 2, material: "ts_lashes", joint: HEAD, origin: [seed, 1.68, 0.21] }, FIXTURE_HEAD_ATTACHED_MORPHS));
        break;
      case "TS_Brow_L":
        meshes.push(declared("TS_Brow_L", "brow", "ts_brow", { triangles: 1, material: "ts_brow", joint: HEAD, origin: [seed + 0.03, 1.7, 0.21] }, FIXTURE_HEAD_ATTACHED_MORPHS));
        break;
      case "TS_Brow_R":
        meshes.push(declared("TS_Brow_R", "brow", "ts_brow", { triangles: 1, material: "ts_brow", joint: HEAD, origin: [seed - 0.03, 1.7, 0.21] }, FIXTURE_HEAD_ATTACHED_MORPHS));
        break;
      case "TS_Underwear":
        meshes.push(declared("TS_Underwear", "underwear", "ts_underwear", { triangles: 3, material: "ts_underwear", joint: "mixamorig:Hips", origin: [seed, 0.95, 0.02] }, FIXTURE_BODY_MORPHS));
        break;
      default:
        break;
    }
  }
  return { glb: baseSpec(meshes.map((mesh) => mesh.glb)), meshes: meshes.map((mesh) => mesh.plan) };
}

function slotNode(slot: KitPartSlot, name: string): string {
  switch (slot) {
    case "top":
      return `TS_Top_${name}`;
    case "bottom":
      return `TS_Bottom_${name}`;
    case "shoes":
      return `TS_Shoes_${name}`;
    case "accessory":
      return `TS_Accessory_${name}`;
    default:
      return name;
  }
}

/** 파츠 정의(헤어는 LOD0~2, 상의·하의·신발은 몸 영역 숨김 선언, 홍채는 홍채+하이라이트 좌우) */
export function fixturePart(id: PresetId, options: { readonly hairLods?: readonly number[]; readonly seed?: number } = {}): KitFixturePartDefinition & { readonly slot: KitPartSlot } {
  const slash = id.indexOf("/");
  const slot = id.slice(0, slash) as KitPartSlot;
  const name = id.slice(slash + 1);
  const seed = options.seed ?? 0;
  const meshes: Array<{ glb: KitGlbMeshSpec; plan: KitMesh }> = [];
  let hides: KitHideableRegionId[] = [];
  switch (slot) {
    case "hair": {
      const lods = options.hairLods ?? [0, 1, 2];
      const triangles = [6, 4, 2];
      for (const lod of lods) {
        const node = `TS_AuthoredHair_${name}_LOD${lod}`;
        meshes.push(declared(node, "hair", `ts_hair_${name}`, { triangles: triangles[lod] ?? 2, material: `ts_hair_${name}`, joint: HEAD, origin: [seed, 1.75, 0.0], vertexColor: 0.9 }, FIXTURE_HEAD_ATTACHED_MORPHS, { lod }));
      }
      break;
    }
    case "top":
      meshes.push(declared(slotNode(slot, name), "top", `ts_top_${name}`, { triangles: 6, material: `ts_top_${name}`, joint: "mixamorig:Spine1", origin: [seed, 1.2, 0.05], textured: true }, FIXTURE_BODY_MORPHS));
      hides = ["torso", "upperArm.L", "upperArm.R"];
      break;
    case "bottom":
      meshes.push(declared(slotNode(slot, name), "bottom", `ts_bottom_${name}`, { triangles: 6, material: `ts_bottom_${name}`, joint: "mixamorig:Hips", origin: [seed, 0.8, 0.05] }, FIXTURE_BODY_MORPHS));
      hides = ["pelvis", "thigh.L", "thigh.R"];
      break;
    case "shoes":
      meshes.push(declared(slotNode(slot, name), "shoes", `ts_shoes_${name}`, { triangles: 4, material: `ts_shoes_${name}`, joint: "mixamorig:LeftFoot", origin: [seed, 0.05, 0.1] }, FIXTURE_BODY_MORPHS));
      hides = ["foot.L", "foot.R"];
      break;
    case "accessory":
      meshes.push(declared(slotNode(slot, name), "accessory", `ts_accessory_${name}`, { triangles: 2, material: `ts_accessory_${name}`, joint: HEAD, origin: [seed, 1.68, 0.22] }, FIXTURE_HEAD_ATTACHED_MORPHS));
      break;
    case "irises": {
      for (const [side, joint, dx] of [["L", "TS_Eye.L", 0.03], ["R", "TS_Eye.R", -0.03]] as const) {
        meshes.push(declared(`TS_Iris_${side}`, "iris", "ts_iris", { triangles: 2, material: "ts_iris", joint, origin: [dx, 1.65, 0.21] }, FIXTURE_HEAD_ATTACHED_MORPHS));
      }
      for (const [side, joint, dx] of [["L", "TS_Eye.L", 0.03], ["R", "TS_Eye.R", -0.03]] as const) {
        meshes.push(declared(`TS_Highlight_${side}`, "eye-highlight", "ts_highlight", { triangles: 1, material: "ts_highlight", joint, origin: [dx, 1.66, 0.215] }, FIXTURE_HEAD_ATTACHED_MORPHS));
      }
      break;
    }
    default:
      break;
  }
  return { id, slot, glb: baseSpec(meshes.map((mesh) => mesh.glb)), meshes: meshes.map((mesh) => mesh.plan), hides };
}

// ---------------------------------------------------------------- 플랜 생성

export type KitGlbTweak = (spec: KitGlbSpec) => KitGlbSpec;

export interface KitFixtureOptions {
  readonly baseId?: KitBaseId;
  /** 선택 파츠(기본: 필수 5개 `KIT_REQUIRED_PRESETS`) */
  readonly partIds?: readonly PresetId[];
  readonly preferredLod?: number;
  /** 헤어 GLB에 넣을 LOD 번호(기본 0·1·2) */
  readonly hairLods?: readonly number[];
  /**
   * 파일별 GLB 수정. 키는 베이스면 `base/<baseId>`, 파츠면 프리셋 id. 플랜은 수정 전 정의로 만들어지므로
   * "선언과 GLB가 어긋난" 상황을 만든다. 바이트·SHA는 수정 뒤 GLB로 계산한다.
   */
  readonly tweaks?: Readonly<Record<string, KitGlbTweak>>;
}

export interface KitFixture {
  readonly plan: KitPlan;
  /** url → GLB 바이트 */
  readonly files: Map<string, Uint8Array>;
  readonly definitions: ReadonlyMap<string, KitFixturePartDefinition>;
}

export function fixtureUrl(baseId: KitBaseId, id: PresetId | `base/${KitBaseId}`): string {
  return id.startsWith("base/") ? `${KIT_ASSET_ROOT}/bases/${baseId}.glb` : `${KIT_ASSET_ROOT}/parts/${baseId}/${id}.glb`;
}

function materialsFor(meshes: readonly KitMesh[]): Record<string, KitMaterial> {
  const out: Record<string, KitMaterial> = {};
  for (const mesh of meshes) {
    const roles = mesh.role !== undefined ? [mesh.role] : (mesh.primitiveRoles ?? []);
    const names = mesh.material !== undefined ? [mesh.material] : (mesh.primitiveMaterials ?? []);
    roles.forEach((role, index) => {
      const name = names[index];
      if (name === undefined) return;
      const rule = KIT_ROLE_TINT_RULES[role] ?? { mode: "recolor" as const, colorKey: "iris" as const };
      out[name] = { role, tint: rule.mode === "recolor" ? { mode: "recolor", colorKey: rule.colorKey } : { mode: "fixed", hex: FIXTURE_FIXED_HEX }, doubleSided: false };
    });
  }
  return out;
}

/** 합성 키트의 `KitPlan`과 GLB 파일들을 만든다(SHA-256은 수정 뒤 GLB 바이트로 계산). */
export async function buildKitFixture(options: KitFixtureOptions = {}): Promise<KitFixture> {
  const baseId = options.baseId ?? "female";
  const partIds = options.partIds ?? KIT_REQUIRED_PRESETS;
  const preferredLod = options.preferredLod ?? 0;
  const files = new Map<string, Uint8Array>();
  const definitions = new Map<string, KitFixturePartDefinition>();
  const planParts: KitPartPlan[] = [];
  const allMeshes: KitMesh[] = [];

  const base = fixtureBase(baseId);
  const baseKey = `base/${baseId}` as const;
  const finalize = async (key: string, id: string, kind: "base" | "part", slot: KitPartSlot | null, glb: KitGlbSpec, meshes: readonly KitMesh[], hides: readonly KitHideableRegionId[]): Promise<void> => {
    const tweak = options.tweaks?.[key];
    const bytes = buildKitGlb(tweak ? tweak(glb) : glb);
    const url = kind === "base" ? fixtureUrl(baseId, baseKey) : fixtureUrl(baseId, key as PresetId);
    files.set(url, bytes);
    planParts.push({ id, kind, slot, url, sha256: await sha256Hex(bytes), bytes: bytes.byteLength, meshes: [...meshes], hides: [...hides] });
    allMeshes.push(...meshes);
  };
  await finalize(baseKey, baseKey, "base", null, base.glb, base.meshes, []);
  definitions.set(baseKey, { id: baseKey, slot: null, glb: base.glb, meshes: base.meshes, hides: [] });
  for (const id of partIds) {
    const definition = fixturePart(id, { ...(options.hairLods ? { hairLods: options.hairLods } : {}), seed: 0 });
    definitions.set(id, definition);
    await finalize(id, id, "part", definition.slot, definition.glb, definition.meshes, definition.hides);
  }

  const morphNames: string[] = [];
  for (const mesh of allMeshes) for (const morph of mesh.morphs) if (!morphNames.includes(morph)) morphNames.push(morph);
  const bodyRegions = KIT_HIDEABLE_REGION_IDS.map((id, index) => ({ id, mesh: "TS_Body", indexStart: index * FIXTURE_TRIANGLES_PER_REGION * 3, indexCount: FIXTURE_TRIANGLES_PER_REGION * 3 }));

  const plan: KitPlan = {
    kitId: KIT_DEFAULT_ID,
    kitVersion: KIT_CURRENT_VERSION,
    baseId,
    skeleton: { root: "Armature", joints: [...KIT_SKELETON_JOINTS], parents: { ...KIT_SKELETON_PARENTS }, boneMap: { ...KIT_BONE_MAP }, endBones: [...KIT_END_BONES] },
    parts: planParts,
    morphNames,
    jointOffsets: FIXTURE_JOINT_OFFSETS,
    bodyRegions,
    capabilities: ALL_AVAILABLE_CAPABILITIES,
    hairLodPolicy: { preferredLod },
    licenseNote: "합성 테스트 키트(원본 도형, 라이선스 original)",
    materials: materialsFor(allMeshes),
  };
  return { plan, files, definitions };
}

// ---------------------------------------------------------------- NullEngine 하네스

/**
 * 키트 로더 시험 하네스. `render/babylon/**`는 테스트 파일이 직접 import할 수 없고(architecture.test.ts) `null-engine-harness`에는
 * 키트 로더가 아직 재노출되어 있지 않아, 이 fixture가 로더 모듈을 **동적 import**로 불러 테스트에 넘긴다(정적 import는 Node 모듈 규칙 위반).
 * `null-engine-harness`가 키트 로더를 재노출하면 이 우회는 걷어낼 수 있다.
 */
export type KitRigHandle = import("../babylon/kit-loader").KitRigHandle;
export type KitRig = import("../babylon/kit-loader").KitRig;
export type KitLoadDeps = import("../babylon/kit-loader").KitLoadDeps;

export interface KitHarnessOptions {
  readonly capabilities?: NullCapabilityOverrides;
  /** 결정적 시각(epoch ms) */
  readonly now?: number;
  /** 바이트 수·SHA-256 검증(기본 true) */
  readonly verifyIntegrity?: boolean;
  /** 장면 좌표계(기본 우수 — 엔진 장면과 같다) */
  readonly rightHanded?: boolean;
  /** 추가로 가로채는 fetch(생략하면 fixture 파일 저장소에서 읽는다) */
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** true면 `adaptMaterial`이 로더 재질 대신 새 PBRMaterial을 돌려준다(엔진이 재질을 교체하는 경로) */
  readonly replaceMaterials?: boolean;
}

export interface KitHarness {
  readonly scene: Scene;
  /** url → 바이트. 테스트가 바이트를 바꿔 손상 경로를 만든다. */
  readonly store: Map<string, Uint8Array>;
  /** `fetchBytes`가 받은 URL(호출 순서) */
  readonly requested: string[];
  /** `adaptMaterial`이 불린 (역할, 메시 이름) */
  readonly adapted: Array<{ readonly role: PartRole; readonly mesh: string }>;
  load(fixture: Pick<KitFixture, "plan" | "files">, overrides?: Partial<KitLoadDeps>): Promise<KitRigHandle>;
  /** 리그 루트 아래 노드를 GLB로 내보낸다(`render/babylon/glb-exporter`) */
  exportGlb(rig: KitRig): Promise<Uint8Array>;
  dispose(): void;
}

export async function createKitHarness(options: KitHarnessOptions = {}): Promise<KitHarness> {
  const { createBareNullScene } = await import("./null-engine-harness");
  const { loadKitRig } = await import("../babylon/kit-loader");
  const { exportRigGlb } = await import("../babylon/glb-exporter");
  const { PBRMaterial } = await import("@babylonjs/core/Materials/PBR/pbrMaterial.js");
  const bare = createBareNullScene(options.capabilities ?? {});
  bare.scene.useRightHandedSystem = options.rightHanded ?? true;
  const store = new Map<string, Uint8Array>();
  const requested: string[] = [];
  const adapted: Array<{ readonly role: PartRole; readonly mesh: string }> = [];
  return {
    scene: bare.scene,
    store,
    requested,
    adapted,
    async load(fixture, overrides = {}) {
      for (const [url, bytes] of fixture.files) if (!store.has(url)) store.set(url, bytes);
      return loadKitRig(fixture.plan, {
        scene: bare.scene,
        fetchBytes:
          options.fetchBytes ??
          (async (url) => {
            requested.push(url);
            const bytes = store.get(url);
            if (!bytes) throw new Error(`fixture에 없는 URL: ${url}`);
            return bytes;
          }),
        adaptMaterial: (role, mesh) => {
          adapted.push({ role, mesh: mesh.name });
          if (!(mesh.material instanceof PBRMaterial)) throw new Error(`PBRMaterial이 아닌 재질: ${mesh.name}`);
          return options.replaceMaterials === true ? new PBRMaterial(`adapted:${role}`, bare.scene) : mesh.material;
        },
        materials: { applyPreset: () => undefined, applyColor: () => undefined },
        ...(options.verifyIntegrity !== undefined ? { verifyIntegrity: options.verifyIntegrity } : {}),
        ...(options.now !== undefined ? { now: options.now } : {}),
        ...overrides,
      });
    },
    // KitRig는 CharacterRig에서 kind(`"kit"`)만 좁힌 구조다. 엔진 통합(KT-04)이 CharacterRig.kind를 넓히면 이 캐스트는 필요 없다.
    exportGlb: (rig) => exportRigGlb(bare.scene, rig as unknown as import("../babylon/character-rig").CharacterRig, "kit-fixture", options.now ?? 1_000),
    dispose: () => bare.dispose(),
  };
}
