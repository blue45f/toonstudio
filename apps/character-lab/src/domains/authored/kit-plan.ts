/**
 * 키트 런타임 계획(KitPlan) 생성(순수). docs/authored-kit-spec.md 4.1·6절.
 *
 * 입력은 검증을 통과한 `KitManifest`와 레시피(소스 `kind: "kit"` + 슬롯 선택)이다. 출력은 베이스 + 선택 파츠의 파일(url·sha·bytes)·메시 선언·
 * 숨김 영역·morph 합집합·관절 오프셋·능력 맵을 담은 `KitPlan`이다. 렌더 엔진은 이 계획만 보고 GLB를 받아 조립한다.
 *
 * 무음 대체 금지: 선택한 프리셋의 변형이 없으면 다른 프리셋으로 바꾸지 않고 `kit-part-missing` LabFailure를 돌려준다.
 */
import { KIT_ASSET_ROOT, KIT_BASE_IDS, KIT_MORPH_NAMES, KIT_PART_SLOTS, failVisible, isPresetId, presetSlot } from "../../contracts";

import { compareKitCapabilities, deriveKitCapabilities } from "./kit-capability";
import { selectHairLod } from "./mesh-role-mapping";
import { joinPackageUrl } from "./package-plan";

import type {
  KitBaseId,
  KitManifest,
  KitMaterial,
  KitPart,
  KitPartPlan,
  KitPartSlot,
  KitPlan,
  LabFailure,
  SlotKind,
} from "../../contracts";

/** 레시피 소스 중 키트 종류(필요한 필드만) */
export interface KitPlanSource {
  readonly kitId: string;
  readonly kitVersion: number;
  readonly baseId: KitBaseId;
}

/** 계획에 필요한 레시피 슬롯 선택(`recipe.slots`의 부분집합이면 된다) */
export type KitPlanSlots = Readonly<Partial<Record<SlotKind, string | null>>>;

export interface KitPlanOptions {
  /** 파일 url의 기준 경로. 기본은 `KIT_ASSET_ROOT` */
  readonly rootUrl?: string;
  /** 헤어 LOD 선호(기본 0, 썸네일 임시 리그는 1) */
  readonly preferredHairLod?: number;
  readonly now?: number;
}

export type KitPlanResult = { readonly ok: true; readonly plan: KitPlan } | { readonly ok: false; readonly failure: LabFailure };

function licenseNoteOf(manifest: KitManifest): string {
  const licenses = [...new Set(manifest.provenance.sources.map((source) => source.license))];
  return `${manifest.provenance.summaryKo} (라이선스: ${licenses.join(", ")})`;
}

function partPlanOf(part: KitPart, baseId: KitBaseId, rootUrl: string): KitPartPlan | null {
  const variant = part.variants[baseId];
  if (variant === undefined) return null;
  return {
    id: part.id,
    kind: "part",
    slot: part.slot,
    url: joinPackageUrl(rootUrl, variant.file.path),
    sha256: variant.file.sha256,
    bytes: variant.file.bytes,
    meshes: variant.meshes,
    hides: variant.hides,
  };
}

/** 선택한 파츠 하나를 찾는다. 못 찾으면 사유(한글)와 함께 실패. */
function selectPart(
  manifest: KitManifest,
  baseId: KitBaseId,
  slot: KitPartSlot,
  presetId: string,
): { readonly ok: true; readonly part: KitPart } | { readonly ok: false; readonly reasonKo: string } {
  if (!isPresetId(presetId) || presetSlot(presetId) !== slot) {
    return { ok: false, reasonKo: `슬롯 ${slot}에 맞지 않는 프리셋 id입니다: ${presetId}` };
  }
  const part = manifest.parts.find((candidate) => candidate.id === presetId);
  if (part === undefined) return { ok: false, reasonKo: `키트에 프리셋 ${presetId} 파츠가 없습니다.` };
  if (part.variants[baseId] === undefined) {
    const declared = part.unavailable[baseId];
    return { ok: false, reasonKo: `프리셋 ${presetId}은(는) ${baseId} 베이스용 변형이 없습니다${declared === undefined ? "." : `: ${declared}`}` };
  }
  return { ok: true, part };
}

/** 계획 상세 버전: 성공이면 plan, 실패면 LabFailure(한글 사유) */
export function buildKitPlanDetailed(manifest: KitManifest, source: KitPlanSource, slots: KitPlanSlots, options: KitPlanOptions = {}): KitPlanResult {
  const now = options.now;
  const fail = (code: string, reasonKo: string, detail?: unknown): KitPlanResult => ({ ok: false, failure: failVisible(code, reasonKo, detail, now) });

  if (source.kitId !== manifest.kitId) {
    return fail("kit-version-mismatch", `레시피의 키트 id(${source.kitId})가 불러온 키트(${manifest.kitId})와 다릅니다.`);
  }
  if (source.kitVersion !== manifest.kitVersion) {
    return fail("kit-version-mismatch", `레시피의 키트 버전(${source.kitVersion})이 불러온 키트 버전(${manifest.kitVersion})과 다릅니다. 레시피를 고치거나 다른 소스를 고르세요.`);
  }
  const base = manifest.bases[source.baseId];
  if (base === undefined) {
    const have = KIT_BASE_IDS.filter((id) => manifest.bases[id] !== undefined);
    return fail("kit-base-missing", `키트에 ${source.baseId} 베이스가 없습니다(제공: ${have.join(", ") || "없음"}).`);
  }

  const capabilities = deriveKitCapabilities(manifest, source.baseId);
  const declared = manifest.slotCapabilities[source.baseId];
  if (declared !== undefined) {
    const differences = compareKitCapabilities(capabilities, declared);
    if (differences.length > 0) {
      return fail(
        "kit-capabilities-mismatch",
        `키트가 선언한 슬롯 능력이 규칙 판정과 다릅니다(${source.baseId}): ${differences
          .slice(0, 3)
          .map((difference) => difference.reasonKo)
          .join(" ")}`,
      );
    }
  }

  const rootUrl = options.rootUrl ?? KIT_ASSET_ROOT;
  const parts: KitPartPlan[] = [
    {
      id: `base/${source.baseId}`,
      kind: "base",
      slot: null,
      url: joinPackageUrl(rootUrl, base.file.path),
      sha256: base.file.sha256,
      bytes: base.file.bytes,
      meshes: base.meshes,
      hides: [],
    },
  ];
  for (const slot of KIT_PART_SLOTS) {
    const presetId = slots[slot];
    if (presetId === null || presetId === undefined) continue;
    const selected = selectPart(manifest, source.baseId, slot, presetId);
    if (!selected.ok) return fail("kit-part-missing", `${selected.reasonKo} (슬롯 ${slot}, 베이스 ${source.baseId})`);
    const partPlan = partPlanOf(selected.part, source.baseId, rootUrl);
    if (partPlan === null) return fail("kit-part-missing", `프리셋 ${presetId}의 ${source.baseId} 변형을 만들지 못했습니다.`);
    parts.push(partPlan);
  }

  const morphs = new Set<string>();
  const materialNames = new Set<string>();
  for (const part of parts) {
    for (const mesh of part.meshes) {
      for (const name of mesh.morphs) morphs.add(name);
      if (mesh.material !== undefined) materialNames.add(mesh.material);
      for (const name of mesh.primitiveMaterials ?? []) materialNames.add(name);
    }
  }
  const materials: Record<string, KitMaterial> = {};
  for (const [name, material] of Object.entries(manifest.materials)) if (materialNames.has(name)) materials[name] = material;

  const preferredLod = options.preferredHairLod ?? 0;
  const hairPart = parts.find((part) => part.slot === "hair");
  const hairLod = selectHairLod(hairPart?.meshes.map((mesh) => mesh.node) ?? [], preferredLod);

  const plan: KitPlan = {
    kitId: manifest.kitId,
    kitVersion: manifest.kitVersion,
    baseId: source.baseId,
    skeleton: manifest.skeleton,
    parts,
    morphNames: KIT_MORPH_NAMES.filter((name) => morphs.has(name)),
    jointOffsets: manifest.jointOffsets,
    bodyRegions: base.bodyRegions,
    capabilities,
    hairLodPolicy: { preferredLod: hairLod.chosen ?? preferredLod },
    licenseNote: licenseNoteOf(manifest),
    materials,
  };
  return { ok: true, plan };
}

/** 스펙 공개 API: 계획 또는 LabFailure */
export function buildKitPlan(manifest: KitManifest, source: KitPlanSource, slots: KitPlanSlots, options?: KitPlanOptions): KitPlan | LabFailure {
  const result = buildKitPlanDetailed(manifest, source, slots, options);
  return result.ok ? result.plan : result.failure;
}
