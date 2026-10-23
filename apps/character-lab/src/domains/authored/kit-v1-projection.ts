/**
 * 키트 v2 → v1 모양 투영(순수, 2026-10-23 A-1). 두 곳에서 쓴다.
 *
 * 1. v2 계획의 계약 필드(`KitPlan.parts[].meshes`·`KitPlan.materials`): 채널을 모르는 엔진(현 render kit-loader)은 이 v1 모양만 읽는다.
 *    재질은 채널의 계열 기본 키(`CHANNEL_FAMILY`)로 칠하고(계약 `MeshPartData.colorKey`와 같은 규칙 — v2 그림), 공막처럼 계열 키가 없는 채널은
 *    상속 표의 고정색으로 둔다. 강체·형태·UV1 정보는 v1 모양에 자리가 없어 `custom.files`(원본 v2 메시)에만 있다.
 * 2. v1 형식만 아는 소비자(PackagePanel·ParamPanel이 쓰는 키트 등록소 `ensure`·`peek`)를 위한 manifest 보기(`kitManifestV1View`).
 *    출처·슬롯 파츠 표·베이스 키·슬롯 능력 판정에 쓰는 값은 원본과 같다(슬롯 능력은 같은 결과 — 시험이 확인). 층 변형·형태 이름·앵커·UV1·채널은
 *    담지 않으며, schema 필드는 v1 형식 표기라 다시 검증할 수 있는 v1 kit.json이 아니다. v2 원본은 등록소 `ensureAny`·`peekAny`로 읽는다.
 */
import { CHANNEL_FAMILY, CHANNEL_RULES, KIT_BUDGET, KIT_SCHEMA_ID, isMorphTargetName, isPresetId } from "../../contracts";

import type { ChannelKey, KitBase, KitManifest, KitManifestV2, KitMaterial, KitMesh, KitPart, KitPartVariant, KitV2Base, KitV2Material, KitV2Mesh, KitV2Part, KitV2PartVariant } from "../../contracts";

/** 계열 기본 키가 없는 채널(공막)의 v1 고정색. 상속 표가 고정색이 아니면 계약 불변식 위반이다. */
function fixedChannelHex(channel: ChannelKey): string {
  const rule = CHANNEL_RULES[channel];
  if (rule.kind !== "fixed") throw new Error(`채널 ${channel}은 계열 기본 키도 고정색도 없습니다(계약 CHANNEL_FAMILY·CHANNEL_RULES 불변식 위반).`);
  return rule.hex;
}

/** v2 재질 → v1 재질(채널 → 계열 기본 키) */
export function toV1Material(material: KitV2Material): KitMaterial {
  const { role, doubleSided } = material;
  if (material.tint.mode === "fixed") return { role, tint: { mode: "fixed", hex: material.tint.hex }, doubleSided };
  const channel = material.channel;
  // recolor 재질의 채널은 v2 스키마(materialIssues)가 보장한다 — 없으면 검증을 건너뛴 입력이다.
  if (channel === undefined) throw new Error(`재질(역할 ${role})이 recolor인데 채널이 없습니다(키트 v2 스키마 검증을 거치지 않은 입력).`);
  const family = CHANNEL_FAMILY[channel];
  return family === null ? { role, tint: { mode: "fixed", hex: fixedChannelHex(channel) }, doubleSided } : { role, tint: { mode: "recolor", colorKey: family }, doubleSided };
}

/**
 * v2 메시 → v1 메시: UV1 메타를 빼고, morph는 v1 어휘(param·facs)만 남긴다(형태 morph `shape:*`는 v1 어휘 밖 — 범위별 적용은 `custom.files`).
 * 강체 표시는 v1에 자리가 없어 스킨 선언(`skinned: true`)만 옮긴다.
 */
export function toV1Mesh(mesh: KitV2Mesh): KitMesh {
  const { skinned, uv1: _uv1, morphs, ...rest } = mesh;
  const v1 = { ...rest, morphs: morphs.filter(isMorphTargetName) };
  return skinned === true ? { ...v1, skinned: true } : v1;
}

function toV1Variant(variant: KitV2PartVariant): KitPartVariant {
  return { file: variant.file, meshes: variant.meshes.map(toV1Mesh), hides: variant.hides };
}

function toV1Part(part: KitV2Part): KitPart {
  // 파츠 id는 v2 스키마가 프리셋 어휘(`SLOT_PRESET_IDS`)로 검증한다 — 아니면 검증을 건너뛴 입력이다.
  if (!isPresetId(part.id)) throw new Error(`키트 v2 파츠 id가 프리셋 id가 아닙니다: ${part.id}(스키마 검증을 거치지 않은 입력).`);
  const variants: { female?: KitPartVariant; male?: KitPartVariant } = {};
  if (part.variants.female !== undefined) variants.female = toV1Variant(part.variants.female);
  if (part.variants.male !== undefined) variants.male = toV1Variant(part.variants.male);
  return { id: part.id, slot: part.slot, variants, unavailable: part.unavailable };
}

function toV1Base(base: KitV2Base): KitBase {
  return { file: base.file, heightM: base.heightM, boundsM: base.boundsM, meshes: base.meshes.map(toV1Mesh), bodyRegions: base.bodyRegions };
}

/** v2 재질 맵 → v1 재질 맵(이름 순서 유지) */
export function toV1Materials(materials: Readonly<Record<string, KitV2Material>>): Record<string, KitMaterial> {
  const result: Record<string, KitMaterial> = {};
  for (const [name, material] of Object.entries(materials)) result[name] = toV1Material(material);
  return result;
}

/** v1 형식만 아는 소비자용 manifest 보기(위 머리말 2) */
export function kitManifestV1View(manifest: KitManifestV2): KitManifest {
  const bases: { female?: KitBase; male?: KitBase } = {};
  if (manifest.bases.female !== undefined) bases.female = toV1Base(manifest.bases.female);
  if (manifest.bases.male !== undefined) bases.male = toV1Base(manifest.bases.male);
  return {
    schema: KIT_SCHEMA_ID,
    kitId: manifest.kitId,
    kitVersion: manifest.kitVersion,
    displayName: manifest.displayName,
    generatedAt: manifest.generatedAt,
    generator: manifest.generator,
    coordinateSystem: manifest.coordinateSystem,
    provenance: manifest.provenance,
    skeleton: manifest.skeleton,
    materials: toV1Materials(manifest.materials),
    jointOffsets: manifest.jointOffsets,
    bases,
    parts: manifest.parts.map(toV1Part),
    defaults: manifest.defaults,
    slotCapabilities: manifest.slotCapabilities,
    physics: manifest.physics,
    budgets: KIT_BUDGET,
  };
}
