/**
 * 키트 계획(v1·v2) 공통 조각(순수): 입력 타입, 사전 점검(키트 id·버전·베이스·선언 능력 대조), 슬롯 파츠 선택, 라이선스 문구.
 * `kit-plan.ts`(디스패치·v1 조립)와 `kit-plan-v2.ts`(v2 조립)가 같이 쓴다 — 두 버전의 실패 코드·문구·순서가 같아야 하기 때문이다.
 * v1 문구는 2026-10-08 KT-02 그대로다(`kit-plan.test.ts`의 v1 digest 골든이 항등을 고정한다).
 */
import { KIT_BASE_IDS, KIT_V2_SCHEMA_ID, failVisible, isPresetId, presetSlot } from "../../contracts";

import { compareKitCapabilities, deriveKitCapabilities } from "./kit-capability";

import type { AccessoryInstance, KitBaseId, KitManifest, KitManifestV2, KitPartSlot, KitPlan, LabFailure, PresetId, SlotCapabilityMap, SlotKind, Wardrobe } from "../../contracts";

/** 계획기가 받는 manifest(v1 또는 v2). `parseAnyKitManifest`·키트 로드 흐름이 만든 값이다. */
export type AnyKitManifest = KitManifest | KitManifestV2;

export function isKitManifestV2(manifest: AnyKitManifest): manifest is KitManifestV2 {
  return manifest.schema === KIT_V2_SCHEMA_ID;
}

/** 레시피 소스 중 키트 종류(필요한 필드만) */
export interface KitPlanSource {
  readonly kitId: string;
  readonly kitVersion: number;
  readonly baseId: KitBaseId;
}

/** 계획에 필요한 레시피 슬롯 선택(`recipe.slots`의 부분집합이면 된다) */
export type KitPlanSlots = Readonly<Partial<Record<SlotKind, string | null>>>;

/**
 * 계획에 필요한 옷장(레시피 v3 `wardrobe`의 지오메트리 부분: 층 프리셋과 추가 소품의 인스턴스 id·프리셋). `recipe.wardrobe`를 그대로 넘겨도 된다.
 * 소품의 앵커·오프셋은 적용 시점 값(`ApplyPlan.accessories`)이라 계획이 읽지 않는다 — 앵커를 바꿔도 파일을 다시 받지 않는다.
 */
export type KitPlanWardrobe = Readonly<Pick<Wardrobe, "inner" | "outer" | "legwear">> & {
  readonly accessories: ReadonlyArray<Pick<AccessoryInstance, "id" | "presetId">>;
};

export interface KitPlanOptions {
  /** 파일 url의 기준 경로. 기본은 `KIT_ASSET_ROOT` */
  readonly rootUrl?: string;
  /** 헤어 LOD 선호(기본 0, 썸네일 임시 리그는 1) */
  readonly preferredHairLod?: number;
  readonly now?: number;
  /**
   * 레시피 v3 옷장. v2 manifest에서만 층·추가 소품 파일을 계획에 더한다. v1 manifest는 층 변형·강체 소품이 없어 계획이 그대로다
   * (입힌 층·소품의 미지원 사유는 커스터마이즈 능력 `kitV1CustomCapabilities`가 낸다).
   */
  readonly wardrobe?: KitPlanWardrobe;
}

export type KitPlanResult = { readonly ok: true; readonly plan: KitPlan } | { readonly ok: false; readonly failure: LabFailure };

export function licenseNoteOf(manifest: Pick<KitManifest, "provenance">): string {
  const licenses = [...new Set(manifest.provenance.sources.map((source) => source.license))];
  return `${manifest.provenance.summaryKo} (라이선스: ${licenses.join(", ")})`;
}

export type KitPlanCheck = { readonly ok: true; readonly capabilities: SlotCapabilityMap } | { readonly ok: false; readonly failure: LabFailure };

/** v1·v2 공통 사전 점검: 키트 id·버전 → 베이스 존재 → 규칙 판정 능력과 선언(`slotCapabilities`) 대조. 성공하면 규칙 판정 능력. */
export function checkKitPlanPreconditions(manifest: AnyKitManifest, source: KitPlanSource, now?: number): KitPlanCheck {
  const fail = (code: string, reasonKo: string): KitPlanCheck => ({ ok: false, failure: failVisible(code, reasonKo, undefined, now) });
  if (source.kitId !== manifest.kitId) {
    return fail("kit-version-mismatch", `레시피의 키트 id(${source.kitId})가 불러온 키트(${manifest.kitId})와 다릅니다.`);
  }
  if (source.kitVersion !== manifest.kitVersion) {
    return fail("kit-version-mismatch", `레시피의 키트 버전(${source.kitVersion})이 불러온 키트 버전(${manifest.kitVersion})과 다릅니다. 레시피를 고치거나 다른 소스를 고르세요.`);
  }
  if (manifest.bases[source.baseId] === undefined) {
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
  return { ok: true, capabilities };
}

/** 파츠 선택에 필요한 모양(v1 `KitPart`·v2 `KitV2Part` 공통) */
export interface KitSelectablePart {
  readonly id: string;
  readonly variants: { readonly female?: unknown; readonly male?: unknown };
  readonly unavailable: { readonly female?: string; readonly male?: string };
}

export type KitPartSelection<P> = { readonly ok: true; readonly part: P; readonly presetId: PresetId } | { readonly ok: false; readonly reasonKo: string };

/** 선택한 슬롯 파츠 하나를 찾는다. 못 찾으면 사유(한글)와 함께 실패(다른 프리셋으로 바꾸지 않는다). */
export function selectKitPart<P extends KitSelectablePart>(parts: readonly P[], baseId: KitBaseId, slot: KitPartSlot, presetId: string): KitPartSelection<P> {
  if (!isPresetId(presetId) || presetSlot(presetId) !== slot) {
    return { ok: false, reasonKo: `슬롯 ${slot}에 맞지 않는 프리셋 id입니다: ${presetId}` };
  }
  const part = parts.find((candidate) => candidate.id === presetId);
  if (part === undefined) return { ok: false, reasonKo: `키트에 프리셋 ${presetId} 파츠가 없습니다.` };
  if (part.variants[baseId] === undefined) {
    const declared = part.unavailable[baseId];
    return { ok: false, reasonKo: `프리셋 ${presetId}은(는) ${baseId} 베이스용 변형이 없습니다${declared === undefined ? "." : `: ${declared}`}` };
  }
  return { ok: true, part, presetId };
}

/** 목록을 최대 `max`개까지 보이고 나머지는 "외 n개"로 줄인다(사유 문구용) */
export function listFew(items: readonly string[], max = 4): string {
  return items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} 외 ${items.length - max}개`;
}

/** 정수에 세 자리 쉼표(로캘·ICU와 무관하게 결정적) */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}
