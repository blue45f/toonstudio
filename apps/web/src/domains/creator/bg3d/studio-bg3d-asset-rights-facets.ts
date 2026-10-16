/**
 * 3D 소재의 권리 패싯 — 라이선스 종류·상업 사용·AI 생성·AI 학습 표기로 소재를 거르는 순수 질의.
 *
 * `queryStudioBg3dAssetMetadata` 가 검색·형식·태그 같은 기본 패싯과 정규화·중복 제거를 맡고, 이 모듈은
 * 그 결과에 권리 패싯만 덧붙이는 후속 질의(`queryStudioBg3dAssetRights`)를 둔다.
 *
 * 원칙
 * - 모르는 값은 "미확인"이라는 하나의 값으로 다룬다. 미확인이 허용으로 읽히는 길은 없다.
 * - 한 패싯 안의 값은 OR, 서로 다른 패싯은 AND 다. 비어 있는 패싯은 걸러 내지 않는다(목록이 사라지지 않는다).
 * - 알 수 없는 패싯 값은 부분 적용하지 않고 빈 결과로 닫는다(메타데이터 질의와 같은 규칙).
 * - 이 판정은 소재 기록에 적힌 권리 표기를 걸러 보는 도구이며 법률 자문이 아니다.
 */

import { queryStudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";

import type {
  StudioBg3dAssetMetadata,
  StudioBg3dAssetQuery,
  StudioBg3dAssetRightsReceipt,
  StudioBg3dAssetRightsStatus,
} from "./studio-bg3d-asset-metadata";

export const STUDIO_BG3D_RIGHTS_LICENSE_VALUES = ["owned", "licensed", "public-domain", "unknown"] as const;
export const STUDIO_BG3D_RIGHTS_COMMERCIAL_VALUES = ["allowed", "prohibited", "unknown"] as const;
export const STUDIO_BG3D_RIGHTS_AI_GENERATED_VALUES = ["yes", "no", "unknown"] as const;
export const STUDIO_BG3D_RIGHTS_AI_TRAINING_VALUES = ["allowed", "prohibited", "unknown"] as const;

export type StudioBg3dRightsCommercialState = (typeof STUDIO_BG3D_RIGHTS_COMMERCIAL_VALUES)[number];
export type StudioBg3dRightsAiGeneratedState = (typeof STUDIO_BG3D_RIGHTS_AI_GENERATED_VALUES)[number];
export type StudioBg3dRightsAiTrainingState = (typeof STUDIO_BG3D_RIGHTS_AI_TRAINING_VALUES)[number];

/** 한 소재의 권리 상태. 모든 칸이 값을 가지며 모르는 칸은 "unknown" 이다. */
export interface StudioBg3dAssetRightsState {
  readonly license: StudioBg3dAssetRightsStatus;
  readonly commercial: StudioBg3dRightsCommercialState;
  readonly aiGenerated: StudioBg3dRightsAiGeneratedState;
  readonly aiTraining: StudioBg3dRightsAiTrainingState;
}

/** 권리 패싯. 배열은 OR, 패싯끼리는 AND. 배열이 없거나 비어 있으면 그 패싯은 적용하지 않는다. */
export interface StudioBg3dAssetRightsFacets {
  readonly license?: readonly StudioBg3dAssetRightsStatus[];
  readonly commercial?: readonly StudioBg3dRightsCommercialState[];
  readonly aiGenerated?: readonly StudioBg3dRightsAiGeneratedState[];
  readonly aiTraining?: readonly StudioBg3dRightsAiTrainingState[];
}

export interface StudioBg3dAssetRightsQuery extends StudioBg3dAssetQuery {
  readonly rights?: StudioBg3dAssetRightsFacets;
}

export const UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE: StudioBg3dAssetRightsState = Object.freeze({
  license: "unknown",
  commercial: "unknown",
  aiGenerated: "unknown",
  aiTraining: "unknown",
});

const EMPTY_RESULT = Object.freeze([]) as readonly StudioBg3dAssetMetadata[];

const FACET_KEYS = ["license", "commercial", "aiGenerated", "aiTraining"] as const;
const FACET_VALUES: Readonly<Record<(typeof FACET_KEYS)[number], readonly string[]>> = Object.freeze({
  license: STUDIO_BG3D_RIGHTS_LICENSE_VALUES,
  commercial: STUDIO_BG3D_RIGHTS_COMMERCIAL_VALUES,
  aiGenerated: STUDIO_BG3D_RIGHTS_AI_GENERATED_VALUES,
  aiTraining: STUDIO_BG3D_RIGHTS_AI_TRAINING_VALUES,
});

/** 영수증을 패싯이 읽는 상태로 바꾼다. 권리 상태가 미확인이면 상업 사용도 미확인이다(false 를 금지로 읽지 않는다). */
export function readStudioBg3dAssetRightsState(rights: StudioBg3dAssetRightsReceipt): StudioBg3dAssetRightsState {
  const known = rights.status !== "unknown";
  return Object.freeze({
    license: rights.status,
    commercial: !known ? "unknown" : rights.commercialUse ? "allowed" : "prohibited",
    aiGenerated: rights.aiGenerated ?? "unknown",
    aiTraining: rights.aiTraining ?? "unknown",
  });
}

/**
 * 패싯 입력을 정규화한다. 알 수 없는 키·값은 null(질의 전체를 빈 결과로 닫음), 중복은 합치고 정해진 순서로 정렬하며
 * 빈 배열은 "적용 안 함"으로 보아 키를 뺀다.
 */
export function normalizeStudioBg3dAssetRightsFacets(value: unknown): StudioBg3dAssetRightsFacets | null {
  if (value === undefined) return Object.freeze({});
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !(FACET_KEYS as readonly string[]).includes(key))) return null;

  const normalized: Record<string, readonly string[]> = {};
  for (const key of FACET_KEYS) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) return null;
    const allowed = FACET_VALUES[key];
    if (raw.some((item) => typeof item !== "string" || !allowed.includes(item))) return null;
    const chosen = allowed.filter((item) => raw.includes(item));
    if (chosen.length > 0) normalized[key] = Object.freeze(chosen);
  }
  return Object.freeze(normalized) as StudioBg3dAssetRightsFacets;
}

/** 걸러 내는 패싯이 하나라도 켜져 있는가. 꺼져 있으면 모든 소재가 통과한다. */
export function hasActiveStudioBg3dAssetRightsFacets(facets: StudioBg3dAssetRightsFacets | undefined): boolean {
  return FACET_KEYS.some((key) => (facets?.[key]?.length ?? 0) > 0);
}

function facetAdmits(chosen: readonly string[] | undefined, value: string): boolean {
  return !chosen || chosen.length === 0 || chosen.includes(value);
}

export function matchesStudioBg3dAssetRightsFacets(
  state: StudioBg3dAssetRightsState,
  facets: StudioBg3dAssetRightsFacets | undefined,
): boolean {
  if (!facets) return true;
  return facetAdmits(facets.license, state.license)
    && facetAdmits(facets.commercial, state.commercial)
    && facetAdmits(facets.aiGenerated, state.aiGenerated)
    && facetAdmits(facets.aiTraining, state.aiTraining);
}

/**
 * 모든 칸이 미확인인 소재(기록이 없거나 해시가 없어 질의에 넣을 수 없는 소재)가 이 패싯을 통과하는가.
 * 켜진 패싯마다 "미확인" 값이 선택돼 있어야 통과한다.
 */
export function studioBg3dAssetRightsFacetsAdmitUnknown(facets: StudioBg3dAssetRightsFacets | undefined): boolean {
  return matchesStudioBg3dAssetRightsFacets(UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE, facets);
}

/**
 * 메타데이터 질의 + 권리 패싯. 기본 질의(검색·형식·태그·정렬)는 `queryStudioBg3dAssetMetadata` 가 처리하고,
 * 그 결과를 권리 패싯으로 한 번 더 거른다. 입력이 올바르지 않으면 빈 결과다.
 */
export function queryStudioBg3dAssetRights(
  values: readonly unknown[],
  query: StudioBg3dAssetRightsQuery | undefined = undefined,
): readonly StudioBg3dAssetMetadata[] {
  if (query !== undefined && (typeof query !== "object" || query === null || Array.isArray(query))) {
    return EMPTY_RESULT;
  }
  const rights = normalizeStudioBg3dAssetRightsFacets(query?.rights);
  if (!rights) return EMPTY_RESULT;
  const base = queryStudioBg3dAssetMetadata(values, {
    search: query?.search,
    facets: query?.facets,
    sort: query?.sort,
  });
  return Object.freeze(
    base.filter((record) => matchesStudioBg3dAssetRightsFacets(readStudioBg3dAssetRightsState(record.rights), rights)),
  );
}
