/**
 * 키트 커스터마이즈 능력 판정(레시피 v3, 2026-10-23 A-1). 계약 `CustomCapabilities`(engine.ts)를 만든다.
 *
 * - 키트 v1: 채널·형태 키·층·앵커·UV1·머리 높이가 없다 → `NO_CUSTOM_CAPABILITIES` + 키트 v1 사유(`kitV1CustomCapabilities`).
 * - 키트 v2: 계획이 올린 파일(`KitPlanFile`)과 키트가 그 베이스에 제공하는 것(`deriveKitV2Offers`)으로 판정한다(`kitPlanCustomCapabilities`).
 *   그래서 능력은 **지금 올린 파츠 기준**이다(같은 키트라도 다른 헤어를 고르면 형태 키가 바뀐다) — 엔진은 소스를 올릴 때마다 이 값을 보고한다.
 * - 층·추가 소품 프리셋 판정(어느 프리셋을 어느 층에 입을 수 있는지)은 UI용 `deriveKitWardrobeCapabilities`다(15슬롯 능력과 같은 모양).
 *
 * 사유 키는 `customReasonKey`, 넣는 순서는 계약 순서다: 채널(`CHANNEL_KEYS`) → 형태(`PART_SCOPES`, 소품 인스턴스 번호순) → 층(`WARDROBE_LAYERS`)
 * → 앵커(`ACCESSORY_ANCHORS`) → patternUv → hairFlow → proportion. 사유 문구는 한글이며 베이스는 "여성·남성 베이스"로 적는다.
 * 미지원 항목은 사유만 낸다 — 다른 채널·파츠·앵커로 바꾸지 않는다.
 */
import {
  ACCESSORY_ANCHORS,
  ACCESSORY_ANCHOR_LABELS_KO,
  CHANNEL_LABELS_KO,
  DERIVED_CHANNEL_KEYS,
  NO_CUSTOM_CAPABILITIES,
  PART_SCOPES,
  REGION_CHANNEL_KEYS,
  SLOT_LABELS_KO,
  SLOT_PRESET_IDS,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  WARDROBE_LAYER_SLOT,
  customReasonKey,
  isAccessoryInstanceId,
  isPresetId,
} from "../../contracts";

import { KIT_BASE_LABELS_KO, scopeLabelKo, shapeDisplayKo } from "./custom-labels";
import { isKitManifestV2, listFew } from "./kit-plan-common";
import { allHavePatternUv, channelsOfMeshes, meshChannels, rigidMeshNames, sortChannels } from "./kit-v2-mesh-info";

import type { AnyKitManifest, KitPlanWardrobe } from "./kit-plan-common";
import type { KitPlanBase, KitPlanFile, KitPlanShape, KitPlanSkip } from "./kit-plan-v2-types";
import type { AccessoryAnchor, AccessoryInstanceId, ChannelKey, CustomCapabilities, KitBaseId, KitManifestV2, KitV2Material, PartScope, PresetId, SlotCapability, WardrobeLayer } from "../../contracts";

// ---------------------------------------------------------------- 공통 표기

/** 소품 인스턴스 id(acc-<n>)를 번호순으로(형식이 아닌 값은 버린다 — 계획기가 사유와 함께 건너뛴 입력) */
function instanceOrder(ids: Iterable<string>): AccessoryInstanceId[] {
  return [...new Set(ids)].filter(isAccessoryInstanceId).sort((a, b) => Number.parseInt(a.slice(4), 10) - Number.parseInt(b.slice(4), 10));
}

/** 의상 본체 파일(상의·하의·신발 슬롯 파츠와 층): 계약 `patternUv` 불리언을 판정하는 범위. 소품의 무늬는 `patternChannels`로만 판정한다. */
function isGarmentBodyFile(file: KitPlanFile): boolean {
  return file.kind === "layer" || (file.kind === "part" && (file.slot === "top" || file.slot === "bottom" || file.slot === "shoes"));
}

/** 계획 파일의 한글 표기: `베이스`, `<범위·슬롯 라벨>(<프리셋 id>)` */
export function kitFileLabelKo(file: KitPlanFile): string {
  if (file.kind === "base") return "베이스";
  const label = file.scope !== null ? scopeLabelKo(file.scope) : file.slot !== null ? SLOT_LABELS_KO[file.slot] : "파츠";
  return file.presetId === null ? label : `${label}(${file.presetId})`;
}

// ---------------------------------------------------------------- 키트 v1

/** 키트 v1 manifest의 커스터마이즈 능력: 지원 항목 없음 + 키트 v1 사유(계약 순서) */
export function kitV1CustomCapabilities(): CustomCapabilities {
  const reasons: Record<string, string> = {};
  for (const key of DERIVED_CHANNEL_KEYS) {
    const label = CHANNEL_LABELS_KO[key];
    reasons[customReasonKey("channel", key)] = (REGION_CHANNEL_KEYS as readonly string[]).includes(key)
      ? `키트 v1 베이스에는 머리 영역 마스크가 없어 ${label} 채널을 따로 칠할 수 없습니다.`
      : key === "sclera"
        ? "키트 v1 안구는 고정색이라 흰자위 채널을 칠할 수 없습니다."
        : `키트 v1 manifest는 재질 채널을 나누지 않아 ${label} 채널을 따로 칠할 수 없습니다.`;
  }
  for (const scope of PART_SCOPES) reasons[customReasonKey("shape", scope)] = `키트 v1 manifest에는 형태 키가 없어 ${scopeLabelKo(scope)} 파츠 형태를 바꿀 수 없습니다.`;
  for (const layer of WARDROBE_LAYERS) reasons[customReasonKey("layer", layer)] = `키트 v1 manifest에는 층 변형이 없어 ${WARDROBE_LAYER_LABELS_KO[layer]} 층을 입힐 수 없습니다.`;
  for (const anchor of ACCESSORY_ANCHORS) reasons[customReasonKey("anchor", anchor)] = `키트 v1 manifest에는 앵커·강체 소품이 없어 ${ACCESSORY_ANCHOR_LABELS_KO[anchor]} 앵커에 소품을 붙일 수 없습니다.`;
  reasons[customReasonKey("patternUv")] = "키트 v1 manifest에는 패턴용 UV1 선언이 없어 무늬를 그릴 수 없습니다.";
  reasons[customReasonKey("hairFlow")] = "키트 v1 헤어에는 흐름용 UV1 선언이 없어 끝 색·포인트를 그릴 수 없습니다.";
  reasons[customReasonKey("proportion")] = "키트 v1 manifest에는 머리 높이(headHeightM)가 없어 비례 목표를 근사할 수 없습니다.";
  return { ...NO_CUSTOM_CAPABILITIES, reasonsKo: reasons };
}

// ---------------------------------------------------------------- 키트 v2: 베이스가 제공하는 것(레시피와 무관)

export interface KitV2Offers {
  readonly baseId: KitBaseId;
  /** 층별로 입을 수 있는 프리셋(그 베이스의 층 변형이 있는 것, 어휘 순서) */
  readonly layerPresets: Readonly<Record<WardrobeLayer, readonly PresetId[]>>;
  /** 추가 소품(앵커)으로 붙일 수 있는 프리셋: 그 베이스 변형의 모든 메시가 강체 */
  readonly anchorablePresets: readonly PresetId[];
  /** 채널 → 그 채널 재질을 가진 파츠(베이스는 `베이스`, 층 변형은 `<프리셋>(<층>)`) */
  readonly channelSources: Readonly<Partial<Record<ChannelKey, readonly string[]>>>;
}

/** 키트 v2가 한 베이스에 제공하는 층 변형·강체 소품·채널(레시피와 무관, 사유 문구와 UI 판정의 근거) */
export function deriveKitV2Offers(manifest: KitManifestV2, baseId: KitBaseId): KitV2Offers {
  const layerPresets: Record<WardrobeLayer, PresetId[]> = { inner: [], outer: [], legwear: [] };
  const anchorablePresets: PresetId[] = [];
  const sources = new Map<ChannelKey, string[]>();
  const addSources = (label: string, channels: readonly ChannelKey[]): void => {
    for (const channel of channels) sources.set(channel, [...(sources.get(channel) ?? []), label]);
  };
  const base = manifest.bases[baseId];
  if (base !== undefined) {
    addSources("베이스", channelsOfMeshes(base.meshes, manifest.materials));
    addSources("베이스", REGION_CHANNEL_KEYS.filter((key) => base.headRegionMask?.channels[key] !== undefined));
  }
  for (const part of manifest.parts) {
    const id = part.id;
    // 파츠 id는 v2 스키마가 프리셋 어휘로 검증한다(형식이 아니면 검증을 건너뛴 입력이라 판정에서 뺀다).
    if (!isPresetId(id)) continue;
    const variant = part.variants[baseId];
    if (variant !== undefined) {
      addSources(id, channelsOfMeshes(variant.meshes, manifest.materials));
      if (part.slot === "accessory" && rigidMeshNames(variant.meshes).length === variant.meshes.length) anchorablePresets.push(id);
    }
    for (const layer of WARDROBE_LAYERS) {
      const layered = part.layerVariants?.[baseId]?.[layer];
      if (layered === undefined) continue;
      layerPresets[layer].push(id);
      addSources(`${id}(${WARDROBE_LAYER_LABELS_KO[layer]})`, channelsOfMeshes(layered.meshes, manifest.materials));
    }
  }
  const channelSources: Partial<Record<ChannelKey, readonly string[]>> = {};
  for (const channel of sortChannels(sources.keys())) channelSources[channel] = sources.get(channel) ?? [];
  return { baseId, layerPresets, anchorablePresets, channelSources };
}

// ---------------------------------------------------------------- 층·추가 소품 프리셋 판정(UI)

export interface KitWardrobeCapabilities {
  /** 층별 프리셋 판정: 어휘(그 층의 바탕 슬롯) 대비 층 변형 수, 미제공 프리셋마다 한글 사유 */
  readonly layers: Readonly<Record<WardrobeLayer, SlotCapability>>;
  /** 추가 소품(앵커에 붙이는 인스턴스)으로 쓸 수 있는 액세서리 프리셋 판정 */
  readonly extraAccessories: SlotCapability;
}

function presetJudgement(total: number, missing: Readonly<Record<string, string>>, noneReason: string): SlotCapability {
  const missingIds = Object.keys(missing);
  if (missingIds.length === 0) return { status: "available" };
  if (missingIds.length === total) return { status: "unavailable", reasonKo: noneReason };
  const names = missingIds.map((id) => id.slice(id.indexOf("/") + 1));
  return { status: "partial", reasonKo: `제공 ${total - missingIds.length}/${total}종, 미제공: ${names.join(", ")}`, unavailablePresets: missing };
}

/**
 * 한 베이스에서 층(inner·outer·legwear)과 추가 소품에 쓸 수 있는 프리셋을 판정한다(15슬롯 능력과 같은 모양 — 카드에 사유를 보이고 바꿔치기하지 않는다).
 * v1 manifest는 층·강체 소품이 없어 모두 unavailable이다. 베이스가 없으면 그 사유로 모두 unavailable이다.
 */
export function deriveKitWardrobeCapabilities(manifest: AnyKitManifest, baseId: KitBaseId): KitWardrobeCapabilities {
  const baseLabel = KIT_BASE_LABELS_KO[baseId];
  if (!isKitManifestV2(manifest)) {
    const layers = Object.fromEntries(
      WARDROBE_LAYERS.map((layer) => [layer, { status: "unavailable", reasonKo: `키트 v1 manifest에는 층 변형이 없어 ${WARDROBE_LAYER_LABELS_KO[layer]} 층을 입힐 수 없습니다.` }]),
    ) as Record<WardrobeLayer, SlotCapability>;
    return { layers, extraAccessories: { status: "unavailable", reasonKo: "키트 v1 manifest에는 앵커·강체 소품이 없어 추가 소품을 붙일 수 없습니다." } };
  }
  const base = manifest.bases[baseId];
  if (base === undefined) {
    const missing: SlotCapability = { status: "unavailable", reasonKo: `키트에 ${baseLabel} 베이스가 없습니다.` };
    return { layers: { inner: missing, outer: missing, legwear: missing }, extraAccessories: missing };
  }
  const partsById = new Map(manifest.parts.map((part) => [part.id, part]));
  const layers = {} as Record<WardrobeLayer, SlotCapability>;
  for (const layer of WARDROBE_LAYERS) {
    const slot = WARDROBE_LAYER_SLOT[layer];
    const layerLabel = WARDROBE_LAYER_LABELS_KO[layer];
    const missing: Record<string, string> = {};
    for (const name of SLOT_PRESET_IDS[slot]) {
      const id = `${slot}/${name}`;
      const part = partsById.get(id);
      if (part?.layerVariants?.[baseId]?.[layer] !== undefined) continue;
      missing[id] = part === undefined ? `키트에 ${id} 파츠가 없습니다.` : `${id}은(는) ${baseLabel} 베이스용 ${layerLabel} 층 변형이 없습니다.`;
    }
    layers[layer] = presetJudgement(SLOT_PRESET_IDS[slot].length, missing, `이 키트의 ${baseLabel} 베이스에는 ${layerLabel} 층으로 입을 수 있는 ${SLOT_LABELS_KO[slot]}가 없습니다.`);
  }
  const accessoryMissing: Record<string, string> = {};
  for (const name of SLOT_PRESET_IDS.accessory) {
    const id = `accessory/${name}`;
    const part = partsById.get(id);
    const variant = part?.variants[baseId];
    if (variant === undefined) accessoryMissing[id] = part?.unavailable[baseId] ?? `키트가 ${baseLabel} 베이스용 ${id} 파츠를 제공하지 않습니다.`;
    else if (rigidMeshNames(variant.meshes).length !== variant.meshes.length) accessoryMissing[id] = `${id}은(는) 몸에 스킨된 소품이라 앵커에 따로 붙일 수 없습니다(액세서리 슬롯에만 입힐 수 있습니다).`;
  }
  const anchorCount = ACCESSORY_ANCHORS.filter((anchor) => base.anchors[anchor] !== undefined).length;
  const extraAccessories =
    anchorCount === 0
      ? { status: "unavailable" as const, reasonKo: `키트 ${baseLabel} 베이스에 앵커가 없어 추가 소품을 붙일 수 없습니다.` }
      : presetJudgement(SLOT_PRESET_IDS.accessory.length, accessoryMissing, `이 키트의 ${baseLabel} 베이스에는 앵커에 붙일 수 있는 강체 소품이 없습니다.`);
  return { layers, extraAccessories };
}

// ---------------------------------------------------------------- 키트 v2: 계획(올린 파일) 기준 능력

export interface KitPlanCapabilityInput {
  readonly offers: KitV2Offers;
  readonly base: KitPlanBase;
  readonly files: readonly KitPlanFile[];
  /** 계획 파일이 쓰는 v2 재질(메시별 채널) */
  readonly materials: Readonly<Record<string, KitV2Material>>;
  /** 레시피가 입힌 층·추가 소품(입히지 않은 층은 키트 제공 여부로 판정한다) */
  readonly wardrobe: KitPlanWardrobe | undefined;
  readonly skipped: readonly KitPlanSkip[];
  /** 헤어의 고른 LOD(없으면 null) */
  readonly hairLod: number | null;
}

export interface KitPlanCapabilityResult {
  readonly capabilities: CustomCapabilities;
  readonly patternChannels: readonly ChannelKey[];
  /** 범위별 형태 키(이름·라벨·값 범위, `capabilities.shapes`와 같은 키·순서) */
  readonly shapes: Readonly<Partial<Record<PartScope, readonly KitPlanShape[]>>>;
}

function channelReasons(input: KitPlanCapabilityInput, channels: ReadonlySet<ChannelKey>, reasons: Record<string, string>): void {
  const baseLabel = KIT_BASE_LABELS_KO[input.offers.baseId];
  for (const key of DERIVED_CHANNEL_KEYS) {
    if (channels.has(key)) continue;
    const label = CHANNEL_LABELS_KO[key];
    let reason: string;
    if ((REGION_CHANNEL_KEYS as readonly string[]).includes(key)) {
      reason =
        input.base.headRegionMask === null
          ? `키트 ${baseLabel} 베이스에 머리 영역 마스크가 없어 ${label} 채널을 따로 칠할 수 없습니다.`
          : `키트 ${baseLabel} 베이스의 머리 영역 마스크에 ${label} 채널이 없습니다.`;
    } else {
      const sources = input.offers.channelSources[key] ?? [];
      reason =
        sources.length > 0
          ? `지금 고른 파츠에는 ${label} 채널 재질이 없습니다(이 채널이 있는 파츠: ${listFew(sources)}).`
          : `키트의 ${baseLabel} 베이스 파츠에는 ${label} 채널 재질이 없습니다.`;
    }
    reasons[customReasonKey("channel", key)] = reason;
  }
}

function shapeReason(file: KitPlanFile | undefined, scope: PartScope, input: KitPlanCapabilityInput): string {
  const label = scopeLabelKo(scope);
  if (file === undefined) {
    const skip = input.skipped.find((entry) => entry.key === scope);
    return skip === undefined ? `${label} 파츠를 입지 않아 형태 키를 줄 곳이 없습니다.` : `${label}(${skip.presetId}) 파츠를 올리지 못해 형태 키를 줄 곳이 없습니다.`;
  }
  const hairLod = input.hairLod;
  const target = kitFileLabelKo(file);
  if (file.shapes.length > 0) return `지금 고른 ${target}에는 이 형태 키가 없습니다(있는 형태 키: ${file.shapes.map((shape) => shapeDisplayKo(shape.name)).join(", ")}).`;
  if (file.slot === "hair" && hairLod !== null && file.meshes.some((mesh) => mesh.morphs.some((name) => name.startsWith("shape:")))) {
    return `지금 고른 ${target}의 LOD${hairLod}에는 형태 키가 없습니다.`;
  }
  return `지금 고른 ${target}에는 형태 키가 없습니다.`;
}

function layerReason(input: KitPlanCapabilityInput, layer: WardrobeLayer, loaded: boolean): string | null {
  if (loaded) return null;
  const requested = input.wardrobe?.[layer] ?? null;
  if (requested !== null) return input.skipped.find((skip) => skip.kind === "layer" && skip.key === layer)?.reasonKo ?? `${WARDROBE_LAYER_LABELS_KO[layer]} 층(${requested})을 올리지 못했습니다.`;
  if (input.offers.layerPresets[layer].length > 0) return null;
  return `이 키트의 ${KIT_BASE_LABELS_KO[input.offers.baseId]} 베이스에는 ${WARDROBE_LAYER_LABELS_KO[layer]} 층으로 입을 수 있는 ${SLOT_LABELS_KO[WARDROBE_LAYER_SLOT[layer]]}가 없습니다.`;
}

/** 채널마다 그 채널을 칠하는 모든 메시에 패턴용 UV1이 있는지(칠하는 메시가 있는 채널만, 계약 순서) */
export function patternChannelsOf(files: readonly KitPlanFile[], materials: Readonly<Record<string, KitV2Material>>): ChannelKey[] {
  const covered = new Map<ChannelKey, boolean>();
  for (const file of files) {
    for (const mesh of file.meshes) {
      const pattern = mesh.uv1?.purpose === "pattern";
      for (const channel of meshChannels(mesh, materials)) covered.set(channel, (covered.get(channel) ?? true) && pattern);
    }
  }
  return sortChannels([...covered.entries()].filter(([, ok]) => ok).map(([channel]) => channel));
}

/** 계획(올린 파일) 기준 커스터마이즈 능력. 채널·형태·층·앵커·UV1은 지금 올린 파츠의 사실이고, 비례는 v2 베이스의 머리 높이로 본 균일 배율 근사(partial)다. */
export function kitPlanCustomCapabilities(input: KitPlanCapabilityInput): KitPlanCapabilityResult {
  const { files, offers, base } = input;
  const baseLabel = KIT_BASE_LABELS_KO[offers.baseId];
  const reasons: Record<string, string> = {};

  const channels = sortChannels(files.flatMap((file) => file.channels));
  channelReasons(input, new Set(channels), reasons);

  // 형태: 범위별로 올린 파일의 실제 형태 키(고정 범위는 계약 순서, 소품 인스턴스는 번호순)
  const byScope = new Map<PartScope, KitPlanFile>();
  for (const file of files) if (file.scope !== null) byScope.set(file.scope, file);
  const shapes: Partial<Record<PartScope, readonly string[]>> = {};
  const shapeDetails: Partial<Record<PartScope, readonly KitPlanShape[]>> = {};
  const instanceScopes = instanceOrder([...(input.wardrobe?.accessories ?? []).map((instance) => instance.id), ...files.flatMap((file) => (file.instanceId === null ? [] : [file.instanceId]))]);
  for (const scope of [...PART_SCOPES, ...instanceScopes]) {
    const file = byScope.get(scope);
    if (file !== undefined && file.shapes.length > 0) {
      shapes[scope] = file.shapes.map((shape) => shape.name);
      shapeDetails[scope] = file.shapes;
    }
    reasons[customReasonKey("shape", scope)] = shapeReason(file, scope, input);
  }

  const layers: WardrobeLayer[] = [];
  for (const layer of WARDROBE_LAYERS) {
    const loaded = files.some((file) => file.kind === "layer" && file.layer === layer);
    const reason = layerReason(input, layer, loaded);
    if (reason === null) layers.push(layer);
    else reasons[customReasonKey("layer", layer)] = reason;
  }

  const anchors: AccessoryAnchor[] = [];
  for (const anchor of ACCESSORY_ANCHORS) {
    if (offers.anchorablePresets.length === 0) reasons[customReasonKey("anchor", anchor)] = `이 키트의 ${baseLabel} 베이스에는 앵커에 붙일 수 있는 강체 소품이 없습니다.`;
    else if (base.anchors[anchor] === undefined) reasons[customReasonKey("anchor", anchor)] = `키트 ${baseLabel} 베이스에 ${ACCESSORY_ANCHOR_LABELS_KO[anchor]} 앵커가 없습니다.`;
    else anchors.push(anchor);
  }

  const garments = files.filter(isGarmentBodyFile);
  const lacking = garments.filter((file) => !allHavePatternUv(file.meshes)).map(kitFileLabelKo);
  const patternUv = garments.length > 0 && lacking.length === 0;
  if (garments.length === 0) reasons[customReasonKey("patternUv")] = "무늬를 그릴 의상(상의·하의·층·신발)을 입지 않았습니다.";
  else if (!patternUv) reasons[customReasonKey("patternUv")] = `패턴용 UV1이 없는 의상이 있어 무늬를 그릴 수 없습니다: ${listFew(lacking)}.`;

  const hair = files.find((file) => file.kind === "part" && file.slot === "hair");
  const hairFlow = hair?.hairFlowUv ?? false;
  if (hair === undefined) reasons[customReasonKey("hairFlow")] = "헤어를 고르지 않아 헤어 색 흐름을 그릴 곳이 없습니다.";
  else if (!hairFlow) {
    const lod = input.hairLod === null ? "" : `의 LOD${input.hairLod}`;
    reasons[customReasonKey("hairFlow")] = `지금 고른 ${kitFileLabelKo(hair)}${lod}에는 흐름용 UV1이 없어 끝 색·포인트를 그릴 수 없습니다.`;
  }

  reasons[customReasonKey("proportion")] = `키트는 본 균일 배율로 비례 목표를 근사합니다(${baseLabel} 베이스 두신 ${base.headsTall.toFixed(2)}).`;

  return {
    capabilities: { channels, shapes, layers, anchors, patternUv, hairFlow, proportion: "partial", reasonsKo: reasons },
    patternChannels: patternChannelsOf(files, input.materials),
    shapes: shapeDetails,
  };
}
