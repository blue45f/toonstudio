/**
 * 키트 v2 계획(순수, 레시피 v3 — 2026-10-23 A-1). docs/authored-kit-spec.md 부록 C, 설계 §3.3.
 *
 * 입력: 검증된 `KitManifestV2` + 키트 소스 + 슬롯 선택 + (선택) 옷장 층·추가 소품. 출력: 계약 `KitPlan` + `custom`(`kit-plan-v2-types.ts`).
 * - 계약 필드는 v1과 같은 규칙이다: 베이스 + 슬롯 파츠(같은 선택·같은 실패 문구), 메시·재질은 v1 투영(채널 → 계열 기본 키)이라 채널을 모르는 엔진도 읽는다.
 * - `custom.files`: 베이스·슬롯 파츠(계약 `parts`와 같은 순서·id)의 v2 원본 + 층(inner → outer → legwear) + 추가 소품(레시피 순서).
 *   파일마다 범위(형태 값·오프셋을 받는 곳)·그리는 메시의 형태 키와 값 범위·칠하는 채널·강체 메시·기본 앵커·UV1·그리는 삼각형 수를 싣는다.
 * - 예산: 그리는 삼각형 합 ≤ `KIT_V2_BUDGET.triangles.activeWorst`. 베이스 + 슬롯 파츠가 넘으면 `kit-budget-exceeded`로 실패하고,
 *   층·추가 소품은 순서대로 더하다 넘는 것부터 사유와 함께 뺀다(대체 없음).
 * - 층·추가 소품을 올리지 못하면 계획 전체를 실패시키지 않고 `custom.skipped`에 한글 사유를 남긴다(입힌 층의 사유는 능력 `layer:<층>`에도 실린다).
 *   슬롯 파츠는 v1처럼 `kit-part-missing`으로 실패한다(15슬롯 능력의 미제공 프리셋은 고를 수 없다).
 */
import {
  KIT_ASSET_ROOT,
  KIT_MORPH_NAMES,
  KIT_PART_SLOTS,
  KIT_V2_BUDGET,
  MAX_EXTRA_ACCESSORIES,
  REGION_CHANNEL_KEYS,
  SLOT_LABELS_KO,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  WARDROBE_LAYER_SLOT,
  failVisible,
  isAccessoryInstanceId,
  isLayerPreset,
  isPresetId,
  presetSlot,
} from "../../contracts";

import { KIT_BASE_LABELS_KO } from "./custom-labels";
import { deriveKitV2Offers, kitFileLabelKo, kitPlanCustomCapabilities } from "./kit-custom-capability";
import { checkKitPlanPreconditions, formatCount, licenseNoteOf, listFew, selectKitPart } from "./kit-plan-common";
import { toV1Material, toV1Mesh } from "./kit-v1-projection";
import { allHaveHairFlowUv, allHavePatternUv, channelsOfMeshes, meshMaterialNames, rigidMeshNames, shapesOfMeshes, sortChannels, sumTriangles } from "./kit-v2-mesh-info";
import { selectHairLod } from "./mesh-role-mapping";
import { joinPackageUrl } from "./package-plan";

import type { KitPlanOptions, KitPlanResult, KitPlanSlots, KitPlanSource } from "./kit-plan-common";
import type { KitPlanBase, KitPlanFile, KitPlanFileKind, KitPlanSkip, KitPlanV2 } from "./kit-plan-v2-types";
import type {
  AccessoryAnchor,
  AccessoryInstanceId,
  ChannelKey,
  KitHideableRegionId,
  KitManifestV2,
  KitMaterial,
  KitPartPlan,
  KitPartSlot,
  KitV2Base,
  KitV2Material,
  KitV2Mesh,
  KitV2Part,
  KitV2PartVariant,
  PartScope,
  PresetId,
  WardrobeLayer,
} from "../../contracts";

interface FileSpec {
  readonly id: string;
  readonly kind: KitPlanFileKind;
  readonly slot: KitPartSlot | null;
  readonly presetId: PresetId | null;
  readonly scope: PartScope | null;
  readonly layer: WardrobeLayer | null;
  readonly instanceId: AccessoryInstanceId | null;
  readonly file: { readonly path: string; readonly sha256: string; readonly bytes: number };
  readonly meshes: readonly KitV2Mesh[];
  readonly hides: readonly KitHideableRegionId[];
  readonly declaredShapes: readonly string[];
  readonly defaultAnchor: AccessoryAnchor | null;
  /** 헤어 슬롯 파츠만: 고른 LOD(그리는 메시 = 그 LOD 메시) */
  readonly lod: number | null;
  /** 베이스만: 머리 영역 마스크 채널 */
  readonly regionChannels?: readonly ChannelKey[];
}

interface PlanContext {
  readonly manifest: KitManifestV2;
  readonly rootUrl: string;
}

function buildFile(context: PlanContext, spec: FileSpec): KitPlanFile {
  const active = spec.lod === null ? spec.meshes : spec.meshes.filter((mesh) => mesh.lod === spec.lod);
  return {
    id: spec.id,
    kind: spec.kind,
    slot: spec.slot,
    presetId: spec.presetId,
    scope: spec.scope,
    layer: spec.layer,
    instanceId: spec.instanceId,
    url: joinPackageUrl(context.rootUrl, spec.file.path),
    sha256: spec.file.sha256,
    bytes: spec.file.bytes,
    meshes: spec.meshes,
    hides: spec.hides,
    shapes: shapesOfMeshes(spec.declaredShapes, active),
    channels: sortChannels([...channelsOfMeshes(spec.meshes, context.manifest.materials), ...(spec.regionChannels ?? [])]),
    rigidMeshes: rigidMeshNames(spec.meshes),
    defaultAnchor: spec.defaultAnchor,
    patternUv: allHavePatternUv(spec.meshes),
    hairFlowUv: allHaveHairFlowUv(active),
    activeTriangles: sumTriangles(active),
  };
}

function baseSpec(baseId: string, base: KitV2Base): FileSpec {
  return {
    id: `base/${baseId}`,
    kind: "base",
    slot: null,
    presetId: null,
    scope: null,
    layer: null,
    instanceId: null,
    file: base.file,
    meshes: base.meshes,
    hides: [],
    declaredShapes: [],
    defaultAnchor: null,
    lod: null,
    regionChannels: REGION_CHANNEL_KEYS.filter((key) => base.headRegionMask?.channels[key] !== undefined),
  };
}

function slotSpec(presetId: PresetId, part: KitV2Part, variant: KitV2PartVariant, hairLod: number | null): FileSpec {
  return {
    id: presetId,
    kind: "part",
    slot: part.slot,
    presetId,
    scope: part.slot === "irises" ? null : part.slot,
    layer: null,
    instanceId: null,
    file: variant.file,
    meshes: variant.meshes,
    hides: variant.hides,
    declaredShapes: variant.shapes,
    defaultAnchor: variant.anchor ?? null,
    lod: part.slot === "hair" ? hairLod : null,
  };
}

/** 계약 `KitPlan.parts` 항목(v1 모양) */
function contractPart(file: KitPlanFile): KitPartPlan {
  return {
    id: file.id,
    kind: file.kind === "base" ? "base" : "part",
    slot: file.slot,
    url: file.url,
    sha256: file.sha256,
    bytes: file.bytes,
    meshes: file.meshes.map(toV1Mesh),
    hides: file.hides,
  };
}

function materialsUsedBy(files: readonly KitPlanFile[], materials: Readonly<Record<string, KitV2Material>>): Record<string, KitV2Material> {
  const names = new Set(files.flatMap((file) => file.meshes.flatMap((mesh) => meshMaterialNames(mesh))));
  const used: Record<string, KitV2Material> = {};
  for (const [name, material] of Object.entries(materials)) if (names.has(name)) used[name] = material;
  return used;
}

interface Budget {
  readonly limit: number;
  total: number;
}

/** 예산 안이면 더하고 null, 넘으면 사유 */
function admit(budget: Budget, label: string, triangles: number): string | null {
  if (budget.total + triangles > budget.limit) {
    return `${label}을(를) 더하면 그리는 삼각형이 키트 예산 ${formatCount(budget.limit)}을 넘어(현재 ${formatCount(budget.total)} + ${formatCount(triangles)}) 올리지 않았습니다.`;
  }
  budget.total += triangles;
  return null;
}

type Picked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reasonKo: string };

function pickLayerVariant(context: PlanContext, baseId: KitPlanSource["baseId"], layer: WardrobeLayer, presetId: string, layerPresets: readonly PresetId[]): Picked<{ part: KitV2Part; variant: KitV2PartVariant }> {
  const slot = WARDROBE_LAYER_SLOT[layer];
  const layerLabel = WARDROBE_LAYER_LABELS_KO[layer];
  if (!isLayerPreset(layer, presetId)) return { ok: false, reasonKo: `${layerLabel} 층에는 ${SLOT_LABELS_KO[slot]} 프리셋만 입힐 수 있습니다: ${presetId}` };
  const part = context.manifest.parts.find((candidate) => candidate.id === presetId);
  if (part === undefined) return { ok: false, reasonKo: `키트에 ${presetId} 파츠가 없습니다.` };
  const variant = part.layerVariants?.[baseId]?.[layer];
  if (variant !== undefined) return { ok: true, value: { part, variant } };
  const baseLabel = KIT_BASE_LABELS_KO[baseId];
  const others = layerPresets.map((id) => id.slice(id.indexOf("/") + 1));
  const hint =
    others.length > 0 ? `${layerLabel} 층으로 입을 수 있는 ${SLOT_LABELS_KO[slot]}: ${listFew(others)}` : `이 키트의 ${baseLabel} 베이스에는 ${layerLabel} 층으로 입을 수 있는 ${SLOT_LABELS_KO[slot]}가 없습니다`;
  return { ok: false, reasonKo: `${presetId}은(는) ${baseLabel} 베이스용 ${layerLabel} 층 변형이 없습니다(${hint}).` };
}

function pickAccessoryVariant(context: PlanContext, baseId: KitPlanSource["baseId"], presetId: string): Picked<{ part: KitV2Part; variant: KitV2PartVariant }> {
  if (!isPresetId(presetId) || presetSlot(presetId) !== "accessory") return { ok: false, reasonKo: `추가 소품에는 액세서리 프리셋만 쓸 수 있습니다: ${presetId}` };
  const part = context.manifest.parts.find((candidate) => candidate.id === presetId);
  if (part === undefined) return { ok: false, reasonKo: `키트에 ${presetId} 파츠가 없습니다.` };
  const variant = part.variants[baseId];
  const baseLabel = KIT_BASE_LABELS_KO[baseId];
  if (variant === undefined) {
    const declared = part.unavailable[baseId];
    return { ok: false, reasonKo: `${presetId}은(는) ${baseLabel} 베이스용 변형이 없습니다${declared === undefined ? "." : `: ${declared}`}` };
  }
  if (rigidMeshNames(variant.meshes).length !== variant.meshes.length) {
    return { ok: false, reasonKo: `${presetId}은(는) 몸에 스킨된 소품이라 앵커에 따로 붙일 수 없습니다(액세서리 슬롯에만 입힐 수 있습니다).` };
  }
  return { ok: true, value: { part, variant } };
}

/** v2 계획 상세 버전: 성공이면 `KitPlanV2`, 실패면 LabFailure(한글 사유) */
export function buildKitPlanV2Detailed(manifest: KitManifestV2, source: KitPlanSource, slots: KitPlanSlots, options: KitPlanOptions = {}): KitPlanResult {
  const now = options.now;
  const fail = (code: string, reasonKo: string): KitPlanResult => ({ ok: false, failure: failVisible(code, reasonKo, undefined, now) });
  const check = checkKitPlanPreconditions(manifest, source, now);
  if (!check.ok) return { ok: false, failure: check.failure };
  const base = manifest.bases[source.baseId];
  // 사전 점검이 베이스 존재를 이미 확인했다(여기서는 타입을 좁힐 뿐이다).
  if (base === undefined) return fail("kit-base-missing", `키트에 ${source.baseId} 베이스가 없습니다.`);
  const context: PlanContext = { manifest, rootUrl: options.rootUrl ?? KIT_ASSET_ROOT };

  // 1) 슬롯 파츠: v1과 같은 선택·실패
  const chosen: Array<{ readonly presetId: PresetId; readonly part: KitV2Part; readonly variant: KitV2PartVariant }> = [];
  for (const slot of KIT_PART_SLOTS) {
    const presetId = slots[slot];
    if (presetId === null || presetId === undefined) continue;
    const selected = selectKitPart(manifest.parts, source.baseId, slot, presetId);
    if (!selected.ok) return fail("kit-part-missing", `${selected.reasonKo} (슬롯 ${slot}, 베이스 ${source.baseId})`);
    const variant = selected.part.variants[source.baseId];
    if (variant === undefined) return fail("kit-part-missing", `프리셋 ${presetId}의 ${source.baseId} 변형을 만들지 못했습니다.`);
    chosen.push({ presetId: selected.presetId, part: selected.part, variant });
  }
  const preferredLod = options.preferredHairLod ?? 0;
  const hair = chosen.find(({ part }) => part.slot === "hair");
  const hairLod = selectHairLod(hair?.variant.meshes.map((mesh) => mesh.node) ?? [], preferredLod).chosen;

  const files: KitPlanFile[] = [buildFile(context, baseSpec(source.baseId, base)), ...chosen.map(({ presetId, part, variant }) => buildFile(context, slotSpec(presetId, part, variant, hairLod)))];
  const budget: Budget = { limit: KIT_V2_BUDGET.triangles.activeWorst, total: 0 };
  for (const file of files) budget.total += file.activeTriangles;
  if (budget.total > budget.limit) {
    const detail = files.map((file) => `${kitFileLabelKo(file)} ${formatCount(file.activeTriangles)}`);
    return fail("kit-budget-exceeded", `베이스와 슬롯 파츠의 그리는 삼각형 합(${formatCount(budget.total)})이 키트 예산 ${formatCount(budget.limit)}을 넘습니다: ${detail.join(", ")}.`);
  }
  const contractFiles = files.length;

  // 2) 층·추가 소품: 못 올리면 사유만 남긴다
  const offers = deriveKitV2Offers(manifest, source.baseId);
  const skipped: KitPlanSkip[] = [];
  const wardrobe = options.wardrobe;
  for (const layer of WARDROBE_LAYERS) {
    const presetId = wardrobe?.[layer] ?? null;
    if (presetId === null) continue;
    const picked = pickLayerVariant(context, source.baseId, layer, presetId, offers.layerPresets[layer]);
    if (!picked.ok) {
      skipped.push({ kind: "layer", key: layer, presetId, reasonKo: picked.reasonKo });
      continue;
    }
    const file = buildFile(context, {
      id: `${layer}:${presetId}`,
      kind: "layer",
      slot: WARDROBE_LAYER_SLOT[layer],
      presetId,
      scope: layer,
      layer,
      instanceId: null,
      file: picked.value.variant.file,
      meshes: picked.value.variant.meshes,
      hides: picked.value.variant.hides,
      declaredShapes: picked.value.variant.shapes,
      defaultAnchor: null,
      lod: null,
    });
    const over = admit(budget, `${WARDROBE_LAYER_LABELS_KO[layer]} 층(${presetId})`, file.activeTriangles);
    if (over === null) files.push(file);
    else skipped.push({ kind: "layer", key: layer, presetId, reasonKo: over });
  }
  const seen = new Set<string>();
  (wardrobe?.accessories ?? []).forEach((instance, index) => {
    const skip = (reasonKo: string): void => {
      skipped.push({ kind: "accessory", key: instance.id, presetId: instance.presetId, reasonKo });
    };
    if (index >= MAX_EXTRA_ACCESSORIES) return skip(`추가 소품은 최대 ${MAX_EXTRA_ACCESSORIES}개입니다(액세서리 슬롯 1개를 더해 ${MAX_EXTRA_ACCESSORIES + 1}개).`);
    if (!isAccessoryInstanceId(instance.id)) return skip(`소품 인스턴스 id 형식(acc-<1~99>)이 아닙니다: ${String(instance.id)}`);
    if (seen.has(instance.id)) return skip(`소품 인스턴스 id가 중복되었습니다: ${instance.id}`);
    seen.add(instance.id);
    const picked = pickAccessoryVariant(context, source.baseId, instance.presetId);
    if (!picked.ok) return skip(picked.reasonKo);
    const file = buildFile(context, {
      id: `${instance.id}:${instance.presetId}`,
      kind: "accessory",
      slot: "accessory",
      presetId: instance.presetId,
      scope: instance.id,
      layer: null,
      instanceId: instance.id,
      file: picked.value.variant.file,
      meshes: picked.value.variant.meshes,
      hides: picked.value.variant.hides,
      declaredShapes: picked.value.variant.shapes,
      defaultAnchor: picked.value.variant.anchor ?? null,
      lod: null,
    });
    const over = admit(budget, `소품 ${instance.id}(${instance.presetId})`, file.activeTriangles);
    if (over === null) files.push(file);
    else skip(over);
  });

  // 3) 조립
  const mask = base.headRegionMask;
  const planBase: KitPlanBase = {
    heightM: base.heightM,
    headHeightM: base.headHeightM,
    headsTall: base.heightM / base.headHeightM,
    anchors: base.anchors,
    headRegionMask:
      mask === undefined
        ? null
        : { url: joinPackageUrl(context.rootUrl, mask.file.path), sha256: mask.file.sha256, bytes: mask.file.bytes, width: mask.width, height: mask.height, channels: mask.channels },
  };
  const customMaterials = materialsUsedBy(files, manifest.materials);
  const { capabilities, patternChannels, shapes } = kitPlanCustomCapabilities({ offers, base: planBase, files, materials: customMaterials, wardrobe, skipped, hairLod });
  const contractParts = files.slice(0, contractFiles).map(contractPart);
  const v1Materials: Record<string, KitMaterial> = {};
  for (const [name, material] of Object.entries(materialsUsedBy(files.slice(0, contractFiles), manifest.materials))) v1Materials[name] = toV1Material(material);
  const morphs = new Set(files.flatMap((file) => file.meshes.flatMap((mesh) => mesh.morphs)));

  const plan: KitPlanV2 = {
    kitId: manifest.kitId,
    kitVersion: manifest.kitVersion,
    baseId: source.baseId,
    skeleton: manifest.skeleton,
    parts: contractParts,
    morphNames: KIT_MORPH_NAMES.filter((name) => morphs.has(name)),
    jointOffsets: manifest.jointOffsets,
    bodyRegions: base.bodyRegions,
    capabilities: check.capabilities,
    hairLodPolicy: { preferredLod: hairLod ?? preferredLod },
    licenseNote: licenseNoteOf(manifest),
    materials: v1Materials,
    custom: {
      manifestVersion: 2,
      base: planBase,
      files,
      materials: customMaterials,
      shapes,
      capabilities,
      patternChannels,
      skipped,
      triangles: { active: budget.total, budget: budget.limit },
    },
  };
  return { ok: true, plan };
}
