/**
 * 합성 키트 v2 fixture(`toonstudio.character-kit/2`, 레시피 v3 — 2026-10-23 CORE-1). 유효한 v2 `kit.json`(JSON 객체)을 만든다.
 *
 * v1 합성 `kit.json`(kit-fixtures.ts)을 v2 규칙으로 옮긴다: 재질 틴트 = recolor + 역할의 기본 채널(채널 없는 역할은 fixed),
 * 변형마다 `shapes`, 베이스 `headHeightM`·앵커 14곳, 예산 = `KIT_V2_BUDGET`. 그리고 v2에서만 쓰는 기능을 여성 베이스에 하나씩 넣는다:
 * 헤어 형태 키(soft-bob: length·volume, UV1 헤어 흐름), 채널 메시(top/tee 트림, UV1 패턴 밀도), 층 변형(shirt → inner,
 * blazer → outer, slacks → legwear), 강체 헤어 부속(accessory/ribbon, 앵커 hair), 머리 영역 마스크(입술·볼 홍조).
 * 시험 전용 합성 데이터이며 제품 코드는 이 파일을 import하지 않는다(후속 kit-loader-v2·키트 v2 계획기 시험의 출발점).
 */
import {
  ACCESSORY_ANCHORS,
  ACCESSORY_ANCHOR_BONES,
  KIT_BONE_MAP,
  KIT_MORPH_COVERAGE,
  KIT_V2_BUDGET,
  KIT_V2_SCHEMA_ID,
  PART_ROLE_CHANNELS,
  parseKitManifestV2,
} from "../contracts";

import { kitManifestJson } from "./kit-fixtures";

import type { KitFixtureOptions } from "./kit-fixtures";
import type { KitManifestV2, PartRole } from "../contracts";

type Json = Record<string, unknown>;

/** 베이스별 머리 높이(m). 두신 = heightM / headHeightM (여성 1.64/0.22 ≈ 7.45, 남성 1.69/0.225 ≈ 7.5) */
const HEAD_HEIGHT_M: Readonly<Record<string, number>> = { female: 0.22, male: 0.225 };

/** 휴머노이드 본 → 키트 joint(KIT_BONE_MAP의 역) */
const JOINT_OF_BONE: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(KIT_BONE_MAP).map(([joint, bone]) => [bone, joint]));

function anchors(): Json {
  return Object.fromEntries(ACCESSORY_ANCHORS.map((anchor) => [anchor, { joint: JOINT_OF_BONE[ACCESSORY_ANCHOR_BONES[anchor]], offsetM: [0, 0.02, 0] }]));
}

/** v1 재질 → v2: 칠할 채널이 있는 역할은 recolor + 역할의 기본 채널(안구는 sclera), 없는 역할은 fixed(v1 색 유지) */
function v2Material(material: Json): Json {
  const role = material.role as PartRole;
  const channel = PART_ROLE_CHANNELS[role][0];
  if (channel !== undefined) return { role, channel, tint: { mode: "recolor" }, doubleSided: material.doubleSided };
  const tint = material.tint as { readonly mode: string; readonly hex?: string };
  return { role, tint: { mode: "fixed", hex: tint.mode === "fixed" && tint.hex !== undefined ? tint.hex : "#f4f4f6" }, doubleSided: material.doubleSided };
}

function recolor(role: PartRole, channel: string, doubleSided = false): Json {
  return { role, channel, tint: { mode: "recolor" }, doubleSided };
}

/** 스키닝 메시(역할의 필수 morph를 모두 가진다) */
export function kitV2MeshJson(node: string, role: PartRole, material: string, extra: Json = {}): Json {
  return { node, role, material, triangles: 100, vertices: 60, skinned: true, morphs: [...KIT_MORPH_COVERAGE[role]], ...extra };
}

/** 합성 v2 `kit.json` JSON. v1 옵션(`omitFemale`·`male`·`malePresets`)을 그대로 받는다. 여성 변형이 빠진 프리셋의 v2 기능은 건너뛴다. */
export function kitManifestV2Json(options: KitFixtureOptions = {}): Json {
  const v1 = kitManifestJson(options);
  let seed = 0xc0de;
  const file = (path: string): Json => {
    seed += 1;
    return { path, bytes: 120_000 + seed, sha256: seed.toString(16).padStart(64, "0") };
  };

  const materials: Record<string, Json> = {};
  for (const [name, material] of Object.entries(v1.materials as Record<string, Json>)) materials[name] = v2Material(material);
  materials.ts_top_tee_trim = recolor("top", "top-trim");
  materials.ts_inner_shirt = recolor("inner", "inner");
  materials.ts_outer_blazer = recolor("outer", "outer");
  materials.ts_legwear_slacks = recolor("legwear", "legwear");
  materials.ts_hairaccessory_ribbon = recolor("hair-accessory", "hair-accessory", true);

  const bases: Record<string, Json> = {};
  for (const [baseId, base] of Object.entries(v1.bases as Record<string, Json>)) bases[baseId] = { ...base, headHeightM: HEAD_HEIGHT_M[baseId], anchors: anchors() };
  if (bases.female !== undefined) bases.female.headRegionMask = { file: file("bases/female-head-regions.png"), width: 256, height: 256, channels: { lip: "r", blush: "g" } };

  const parts = (v1.parts as Json[]).map((part): Json => {
    const variants: Record<string, Json> = {};
    for (const [baseId, variant] of Object.entries(part.variants as Record<string, Json>)) variants[baseId] = { ...variant, shapes: [] };
    return { ...part, variants };
  });
  const female = (id: string): Json | undefined => (parts.find((part) => part.id === id)?.variants as Record<string, Json> | undefined)?.female;
  const addLayer = (id: string, layer: string, mesh: Json, hides: readonly string[]): void => {
    const part = parts.find((candidate) => candidate.id === id);
    if (part === undefined || female(id) === undefined) return;
    const name = id.slice(id.indexOf("/") + 1);
    part.layerVariants = { female: { [layer]: { file: file(`parts/female/${layer}/${name}.glb`), meshes: [mesh], hides: [...hides], shapes: [] } } };
  };

  const softBob = female("hair/soft-bob");
  if (softBob !== undefined) {
    softBob.shapes = ["length", "volume"];
    softBob.meshes = (softBob.meshes as Json[]).map((mesh) => ({ ...mesh, morphs: [...(mesh.morphs as string[]), "shape:length:+", "shape:length:-", "shape:volume:+"], uv1: { purpose: "hair-flow" } }));
  }
  const tee = female("top/tee");
  if (tee !== undefined) {
    const [body] = tee.meshes as Json[];
    tee.meshes = [{ ...body, uv1: { purpose: "pattern", cmPerUnit: 60 } }, kitV2MeshJson("TS_Top_tee_Trim", "top", "ts_top_tee_trim")];
  }
  addLayer("top/shirt", "inner", kitV2MeshJson("TS_Inner_shirt", "inner", "ts_inner_shirt"), ["torso"]);
  addLayer("top/blazer", "outer", kitV2MeshJson("TS_Outer_blazer", "outer", "ts_outer_blazer"), ["torso", "upperArm.L", "upperArm.R"]);
  addLayer("bottom/slacks", "legwear", kitV2MeshJson("TS_Legwear_slacks", "legwear", "ts_legwear_slacks"), ["thigh.L", "thigh.R"]);
  const ribbon = female("accessory/ribbon");
  if (ribbon !== undefined) {
    ribbon.meshes = [{ node: "TS_HairAccessory_ribbon", role: "hair-accessory", material: "ts_hairaccessory_ribbon", triangles: 80, vertices: 50, skinned: false, morphs: [] }];
    ribbon.anchor = "hair";
  }

  return { ...v1, schema: KIT_V2_SCHEMA_ID, materials, bases, parts, budgets: JSON.parse(JSON.stringify(KIT_V2_BUDGET)) as unknown };
}

/** 파싱된 합성 v2 manifest. 유효하지 않으면 던진다(테스트 설정 오류). */
export function kitManifestV2Fixture(options: KitFixtureOptions = {}): KitManifestV2 {
  const parsed = parseKitManifestV2(kitManifestV2Json(options));
  if (!parsed.ok) throw new Error(`합성 v2 kit.json이 유효하지 않습니다: ${parsed.failure.reasonKo}`);
  return parsed.manifest;
}
