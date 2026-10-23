/**
 * 키트 런타임 계획(KitPlan) 생성(순수). docs/authored-kit-spec.md 4.1·6절, 키트 v2는 부록 C·설계 §3.3.
 *
 * 입력은 검증을 통과한 manifest(v1 `KitManifest` 또는 v2 `KitManifestV2`)와 레시피(소스 `kind: "kit"` + 슬롯 선택, v2는 + 옷장 층·추가 소품)다.
 * - v1: 베이스 + 선택 파츠의 파일(url·sha·bytes)·메시 선언·숨김 영역·morph 합집합·관절 오프셋·능력 맵을 담은 `KitPlan`이다.
 *   2026-10-08 KT-02 결과와 항등이다(`kit-plan.test.ts`가 수정 전 코드로 만든 digest 골든으로 고정한다). 옷장 옵션은 읽지 않는다.
 * - v2: 같은 계약 필드 + `custom`(층·추가 소품 파일, 형태 키·범위, 채널, 앵커, UV1, 커스터마이즈 능력) — `kit-plan-v2.ts`.
 * 렌더 엔진은 이 계획만 보고 GLB를 받아 조립한다.
 *
 * 무음 대체 금지: 선택한 프리셋의 변형이 없으면 다른 프리셋으로 바꾸지 않고 `kit-part-missing` LabFailure를 돌려준다.
 */
import { KIT_ASSET_ROOT, KIT_MORPH_NAMES, KIT_PART_SLOTS, failVisible } from "../../contracts";

import { checkKitPlanPreconditions, isKitManifestV2, licenseNoteOf, selectKitPart } from "./kit-plan-common";
import { buildKitPlanV2Detailed } from "./kit-plan-v2";
import { selectHairLod } from "./mesh-role-mapping";
import { joinPackageUrl } from "./package-plan";

import type { AnyKitManifest, KitPlanOptions, KitPlanResult, KitPlanSlots, KitPlanSource } from "./kit-plan-common";
import type { KitBaseId, KitManifest, KitMaterial, KitPart, KitPartPlan, KitPlan, LabFailure } from "../../contracts";

export { isKitManifestV2 } from "./kit-plan-common";
export type { AnyKitManifest, KitPlanOptions, KitPlanResult, KitPlanSlots, KitPlanSource, KitPlanWardrobe } from "./kit-plan-common";

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

/** v1 manifest 계획(KT-02 그대로) */
function buildKitPlanV1Detailed(manifest: KitManifest, source: KitPlanSource, slots: KitPlanSlots, options: KitPlanOptions): KitPlanResult {
  const now = options.now;
  const fail = (code: string, reasonKo: string, detail?: unknown): KitPlanResult => ({ ok: false, failure: failVisible(code, reasonKo, detail, now) });

  const check = checkKitPlanPreconditions(manifest, source, now);
  if (!check.ok) return { ok: false, failure: check.failure };
  const base = manifest.bases[source.baseId];
  // 사전 점검이 베이스 존재를 이미 확인했다(여기서는 타입을 좁힐 뿐이다).
  if (base === undefined) return fail("kit-base-missing", `키트에 ${source.baseId} 베이스가 없습니다.`);

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
    const selected = selectKitPart(manifest.parts, source.baseId, slot, presetId);
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
    capabilities: check.capabilities,
    hairLodPolicy: { preferredLod: hairLod.chosen ?? preferredLod },
    licenseNote: licenseNoteOf(manifest),
    materials,
  };
  return { ok: true, plan };
}

/** 계획 상세 버전: 성공이면 plan(v2 manifest면 `KitPlanV2`), 실패면 LabFailure(한글 사유). manifest의 `schema`로 v1·v2 조립을 고른다. */
export function buildKitPlanDetailed(manifest: AnyKitManifest, source: KitPlanSource, slots: KitPlanSlots, options: KitPlanOptions = {}): KitPlanResult {
  return isKitManifestV2(manifest) ? buildKitPlanV2Detailed(manifest, source, slots, options) : buildKitPlanV1Detailed(manifest, source, slots, options);
}

/** 스펙 공개 API: 계획 또는 LabFailure */
export function buildKitPlan(manifest: AnyKitManifest, source: KitPlanSource, slots: KitPlanSlots, options?: KitPlanOptions): KitPlan | LabFailure {
  const result = buildKitPlanDetailed(manifest, source, slots, options);
  return result.ok ? result.plan : result.failure;
}
