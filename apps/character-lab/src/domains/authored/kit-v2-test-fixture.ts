/**
 * 테스트 전용: 합성 키트 v2 `kit.json`을 이 영역(A-1) 시험에 맞게 넓힌다. 제품 코드는 이 파일을 import하지 않는다.
 *
 * 출발점은 core fixture `testing/kit-v2-fixtures.ts`의 `kitManifestV2Json()`이다(core 소유라 수정하지 않는다). 도메인의 시험 아닌 파일은
 * `testing/`을 import할 수 없으므로(architecture.test.ts) 시험이 그 JSON을 넘기고, 이 파일은 JSON만 고친다(복사·확장).
 *
 * `richKitV2Json`이 더하는 것(여성 베이스):
 * - hair/soft-bob: 형태 키 8개(계약 상한) — LOD0·LOD1에만 morph, volume은 +만, tail은 −만(반쪽 범위). UV1 헤어 흐름은 core fixture 그대로.
 * - top/tee: 포인트 채널 메시(`TS_Top_tee_Accent`, top-accent, 패턴 UV1). 트림 메시는 core fixture처럼 UV1이 없다.
 * - 층: core fixture의 shirt → inner·blazer → outer·slacks → legwear에 hoodie → outer를 더한다(아우터 후보 2종).
 * - 강체 헤어 부속 여러 개: ribbon(core, 앵커 hair) + cap(헤어 부속, 앵커 head-top, 형태 crown·brim) + earrings(강체 액세서리 + 포인트 채널, 앵커 ear-l).
 *   glasses는 스킨 소품으로 남긴다(추가 소품 인스턴스로 쓸 수 없는 경우).
 * 남성 베이스는 core fixture 그대로다(필수 파츠 irises만 — 강체 소품이 없어 앵커를 쓸 수 없는 경우, 머리 영역 마스크 없음).
 * 끝으로 슬롯 능력 선언을 규칙 판정(`deriveKitCapabilities`)으로 다시 채우고 v2 파서로 검증한다(`finalizeKitV2`).
 */
import { KIT_BASE_IDS, KIT_MORPH_COVERAGE, parseKitManifestV2 } from "../../contracts";
import { fnv1a64Hex } from "../../shared/hash";

import { deriveKitCapabilities } from "./kit-capability";

import type { KitManifestV2, PartRole } from "../../contracts";

export type Json = Record<string, unknown>;

/** 형태 키 하나의 morph 방향 */
export interface ShapeSpec {
  readonly name: string;
  readonly plus?: boolean;
  readonly minus?: boolean;
}

/** soft-bob에 넣는 형태 키 8개(계약 상한 `KIT_V2_BUDGET.maxShapesPerVariant`) */
export const RICH_HAIR_SHAPES: readonly ShapeSpec[] = [
  { name: "length", plus: true, minus: true },
  { name: "volume", plus: true },
  { name: "bangs", plus: true, minus: true },
  { name: "sideLength", plus: true, minus: true },
  { name: "curl", plus: true, minus: true },
  { name: "wave", plus: true, minus: true },
  { name: "tail", minus: true },
  { name: "fit", plus: true, minus: true },
];

function asJson(value: unknown, what: string): Json {
  if (typeof value !== "object" || value === null) throw new Error(`테스트 설정 오류: ${what}가 객체가 아닙니다.`);
  return value as Json;
}

export function partOf(json: Json, id: string): Json {
  const part = (json.parts as Json[]).find((candidate) => candidate.id === id);
  if (part === undefined) throw new Error(`테스트 설정 오류: 파츠 ${id}가 없습니다.`);
  return part;
}

export function variantOf(json: Json, id: string, baseId = "female"): Json {
  return asJson(asJson(partOf(json, id).variants, `${id}.variants`)[baseId], `${id}.variants.${baseId}`);
}

export function baseOf(json: Json, baseId = "female"): Json {
  return asJson(asJson(json.bases, "bases")[baseId], `bases.${baseId}`);
}

export function materialsOf(json: Json): Record<string, Json> {
  return json.materials as Record<string, Json>;
}

/** 스킨 메시(역할의 필수 morph 전부) */
export function skinnedMesh(node: string, role: PartRole, material: string, extra: Json = {}): Json {
  return { node, role, material, triangles: 100, vertices: 60, skinned: true, morphs: [...KIT_MORPH_COVERAGE[role]], ...extra };
}

/** 강체 메시(필수 morph 면제) */
export function rigidMesh(node: string, role: PartRole, material: string, extra: Json = {}): Json {
  return { node, role, material, triangles: 80, vertices: 50, skinned: false, morphs: [], ...extra };
}

export function shapeMorphs(shapes: readonly ShapeSpec[]): string[] {
  return shapes.flatMap((shape) => [...(shape.plus === true ? [`shape:${shape.name}:+`] : []), ...(shape.minus === true ? [`shape:${shape.name}:-`] : [])]);
}

/** 변형에 형태 키를 선언하고 메시에 morph를 단다. `lods`를 주면 그 LOD 메시에만 단다(헤어). */
export function setShapes(variant: Json, shapes: readonly ShapeSpec[], lods?: readonly number[]): void {
  variant.shapes = shapes.map((shape) => shape.name);
  variant.meshes = (variant.meshes as Json[]).map((mesh) => {
    const base = (mesh.morphs as string[]).filter((name) => !name.startsWith("shape:"));
    const applies = lods === undefined || lods.includes(mesh.lod as number);
    return { ...mesh, morphs: applies ? [...base, ...shapeMorphs(shapes)] : base };
  });
}

/** 키트 파일 항목(sha는 경로에서 결정적으로 만든다 — 같은 경로면 같은 값) */
export function fileJson(path: string, bytes = 90_000): Json {
  return { path, bytes, sha256: fnv1a64Hex(path).padStart(64, "0") };
}

/** 층 변형을 더한다(층 메시 = 층 역할·층 채널 재질) */
export function addLayerVariant(json: Json, id: string, layer: string, mesh: Json, hides: readonly string[] = [], baseId = "female"): void {
  const part = partOf(json, id);
  const name = id.slice(id.indexOf("/") + 1);
  const layered = asJson(part.layerVariants ?? {}, `${id}.layerVariants`);
  const forBase = asJson(layered[baseId] ?? {}, `${id}.layerVariants.${baseId}`);
  forBase[layer] = { file: fileJson(`parts/${baseId}/${layer}/${name}.glb`), meshes: [mesh], hides: [...hides], shapes: [] };
  layered[baseId] = forBase;
  part.layerVariants = layered;
}

/** 액세서리 변형을 강체 소품으로 바꾼다 */
export function makeRigidAccessory(json: Json, id: string, meshes: readonly Json[], anchor: string, baseId = "female"): void {
  const variant = variantOf(json, id, baseId);
  variant.meshes = [...meshes];
  variant.anchor = anchor;
}

function recolor(role: PartRole, channel: string, doubleSided = false): Json {
  return { role, channel, tint: { mode: "recolor" }, doubleSided };
}

/** core v2 fixture JSON을 이 영역 시험용으로 넓힌다(머리말 참조). 입력을 고치지 않고 사본을 돌려준다. */
export function richKitV2Json(coreJson: Json): Json {
  const json = structuredClone(coreJson);
  const materials = materialsOf(json);
  materials.ts_top_tee_accent = recolor("top", "top-accent");
  materials.ts_outer_hoodie = recolor("outer", "outer");
  materials.ts_hairaccessory_cap = recolor("hair-accessory", "hair-accessory");
  materials.ts_accessory_earrings_accent = recolor("accessory", "accessory-accent");

  setShapes(variantOf(json, "hair/soft-bob"), RICH_HAIR_SHAPES, [0, 1]);
  const tee = variantOf(json, "top/tee");
  tee.meshes = [...(tee.meshes as Json[]), skinnedMesh("TS_Top_tee_Accent", "top", "ts_top_tee_accent", { uv1: { purpose: "pattern", cmPerUnit: 60 } })];
  addLayerVariant(json, "top/hoodie", "outer", skinnedMesh("TS_Outer_hoodie", "outer", "ts_outer_hoodie"), ["torso", "upperArm.L", "upperArm.R"]);

  const capShapes: readonly ShapeSpec[] = [
    { name: "crown", plus: true, minus: true },
    { name: "brim", plus: true },
  ];
  makeRigidAccessory(json, "accessory/cap", [rigidMesh("TS_HairAccessory_cap", "hair-accessory", "ts_hairaccessory_cap", { morphs: shapeMorphs(capShapes) })], "head-top");
  variantOf(json, "accessory/cap").shapes = capShapes.map((shape) => shape.name);
  makeRigidAccessory(
    json,
    "accessory/earrings",
    [rigidMesh("TS_Accessory_earrings", "accessory", "ts_accessory_earrings"), rigidMesh("TS_Accessory_earrings_Accent", "accessory", "ts_accessory_earrings_accent")],
    "ear-l",
  );
  return json;
}

/**
 * 슬롯 능력 선언을 규칙 판정으로 다시 채우고 v2 파서로 검증한다. 유효하지 않으면 던진다(테스트 설정 오류).
 * 베이스를 빼거나 더한 시험을 위해 먼저 선언 키를 `bases`에 맞춘다(스키마는 선언 내용이 아니라 베이스와의 짝만 검사한다).
 */
export function finalizeKitV2(json: Json): { readonly json: Json; readonly manifest: KitManifestV2 } {
  const bases = asJson(json.bases, "bases");
  const previous = asJson(json.slotCapabilities ?? {}, "slotCapabilities");
  const placeholder = Object.values(previous)[0];
  const synced: Json = {};
  for (const baseId of KIT_BASE_IDS) if (bases[baseId] !== undefined) synced[baseId] = previous[baseId] ?? placeholder;
  const first = parseKitManifestV2({ ...json, slotCapabilities: synced });
  if (!first.ok) throw new Error(`합성 v2 kit.json이 유효하지 않습니다: ${first.failure.reasonKo}`);
  const declared: Json = {};
  for (const baseId of KIT_BASE_IDS) {
    if (first.manifest.bases[baseId] !== undefined) declared[baseId] = JSON.parse(JSON.stringify(deriveKitCapabilities(first.manifest, baseId))) as unknown;
  }
  const finalJson = { ...json, slotCapabilities: declared };
  const parsed = parseKitManifestV2(finalJson);
  if (!parsed.ok) throw new Error(`합성 v2 kit.json이 유효하지 않습니다: ${parsed.failure.reasonKo}`);
  return { json: finalJson, manifest: parsed.manifest };
}
