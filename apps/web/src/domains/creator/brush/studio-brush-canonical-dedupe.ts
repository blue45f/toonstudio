/**
 * 드로잉 툴 브러시 통합 정본(canonical) 중복 제거 및 단축 라벨 충돌 해소 계층.
 *
 * - Classic 카탈로그(코어 + 프로 팩, 비검역 246종)와 V6 재료 카탈로그(158종)가
 *   합쳐진 아티스트 라이브러리(404종)에서 중복 ID·동일 12슬롯 중복·교차 카탈로그
 *   중복·단축 라벨(`shortName`) 충돌을 단일 규칙으로 관리한다.
 * - 기존 저장 문서, 즐겨찾기, 최근 목록, 링크의 레거시/별칭 ID는 100% 정본 fallback으로
 *   복원·재생되며 카탈로그 UI 노출에서만 중복 노출을 차단한다.
 */
import {
  BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP,
  BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES,
  resolveCanonicalBrushStudioV6RecipeId,
} from "../brush-lab/brush-studio-v6-recipe-dedupe";

import {
  isStudioV6BrushCatalogId,
  studioV6BrushCatalogId,
  studioV6RecipeIdFromCatalogId,
} from "./studio-brush-v6-id";

import type { StudioBrushCatalogItem } from "./studio-brush-catalog-core";

export interface StudioBrushCatalogAliasEntry {
  readonly aliasId: string;
  readonly canonicalId: string;
  readonly scope: "v6-exact-slot" | "cross-catalog-duplicate";
  readonly reason: string;
}

/**
 * 아티스트 라이브러리에서 중복 노출되던 브러시를 단일 정본 ID로 통합하는 매핑표.
 * - 품질 검증 대표(`STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS`)가 존재하는 경우 대표를 정본으로 유지한다.
 * - V6 12슬롯 완전 중복 2건은 V6 정본 레시피로 통합한다.
 */
export const STUDIO_BRUSH_CATALOG_ALIAS_ENTRIES: readonly StudioBrushCatalogAliasEntry[] =
  Object.freeze([
    ...BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES.map((entry) =>
      Object.freeze({
        aliasId: studioV6BrushCatalogId(entry.aliasId),
        canonicalId: studioV6BrushCatalogId(entry.canonicalId),
        scope: "v6-exact-slot" as const,
        reason: entry.reason,
      }),
    ),
    Object.freeze({
      aliasId: "v6:zipper-teeth",
      canonicalId: "material-zipper-teeth",
      scope: "cross-catalog-duplicate" as const,
      reason:
        "품질 검증 대표 material-zipper-teeth(엇갈린 지퍼 이빨)와 동일 의상 장식 기능을 "
        + "중복 노출 — 기본 라이브러리에서는 대표 1종만 노출하고 V6 레시피 ID는 별칭으로 유지.",
    }),
    Object.freeze({
      aliasId: "v6:hatching-crosshatch",
      canonicalId: "web-cross-hatch-pen",
      scope: "cross-catalog-duplicate" as const,
      reason:
        "품질 검증 대표·서브툴 팔레트 대표 web-cross-hatch-pen(교차 해칭 펜)과 교차 해칭 기능 중복.",
    }),
    Object.freeze({
      aliasId: "cross-hatch",
      canonicalId: "web-cross-hatch-pen",
      scope: "cross-catalog-duplicate" as const,
      reason:
        "확장 카탈로그 cross-hatch(교차 해칭)가 품질 검증 대표 web-cross-hatch-pen과 동일 기능 중복.",
    }),
    Object.freeze({
      aliasId: "oil--knife-edge",
      canonicalId: "palette-knife-edge",
      scope: "cross-catalog-duplicate" as const,
      reason:
        "확장 카탈로그 oil--knife-edge(유화 · 팔레트 나이프)가 품질 검증 대표 palette-knife-edge와 동일 기능 중복.",
    }),
  ]);

export const STUDIO_BRUSH_CATALOG_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      STUDIO_BRUSH_CATALOG_ALIAS_ENTRIES.map((entry) => [
        entry.aliasId,
        entry.canonicalId,
      ]),
    ),
  );

/**
 * 상용 허용 프로필(`permissive-only`)에서 차단되는 구형 `v6:mixbox-*` 브러시를
 * 대응하는 상용 안전 정본(`v6:km7-*`·`v6:*`)으로 안내하는 대체 매핑.
 */
export const STUDIO_BRUSH_CATALOG_COMMERCIAL_REPLACEMENT_MAP: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP).map(([legacyId, replacementId]) => [
        studioV6BrushCatalogId(legacyId),
        studioV6BrushCatalogId(replacementId),
      ]),
    ),
  );

/**
 * 카탈로그 단축 라벨(`shortName`) 충돌(공백 정규화 기준 8개 그룹 · 27종)을 0건으로 해소하는 고유 단축명 표.
 * 기존 `name.slice(0, 4)` 절단으로 인해 `"수묵 ·"`(7종), `"수채 ·"`(4종), `"유화 ·"`(4종),
 * `"붓 ·"`(3종), `"파스텔"`(3종), `"MyPa"`(2종), `"G펜"`(2종), `"크레용"`(2종)이 동일 표기되던 문제를 교정한다.
 */
export const STUDIO_BRUSH_DISTINCT_SHORT_NAME_BY_ID: Readonly<Record<string, string>> =
  Object.freeze({
    "g-pen-flex": "탄력G펜",
    "crayon--klecks-stamp": "크레용스탬",
    "chalk--klecks-stamp": "초크스탬",
    "watercolor--granular": "과립번짐",
    "watercolor--edge-bloom": "엣지블룸",
    "watercolor--curtis-bake": "백런수채",
    "watercolor--granulating-bake": "입자침전",
    "ink-wash--sumi-core": "농묵코어",
    "ink-wash--fiber-feather": "생지번짐",
    "ink-wash--chroma-halo": "크로마후광",
    "ink-wash--bleed-halo": "맑은번짐",
    "ink-wash--living-bake": "정착건조",
    "ink-wash--moxi-bake": "먹번짐",
    "ink-wash--dry-brush": "수묵갈필",
    "oil--flat-ribbon": "플랫리본",
    "oil--impasto-ribbon": "임파스토",
    "oil--knife-edge": "유화나이프",
    "brush--bristle-physics": "물리강모",
    "pastel-highlighter": "파스형광",
    "pastel--soft-stamp": "소프스탬",
    "brush--dry-rake": "드라이갈퀴",
    "brush--impasto-relief": "릴리프붓",
    "brush--bristle-depletion": "강모고갈",
    "mypaint-cc0--ink-blot": "잉크블롯",
    "mypaint-cc0--watercolor-fringe": "수채프린지",
  });

/**
 * 브러시 ID와 이름에서 충돌 없는 읽기 쉬운 단축 라벨을 생성한다.
 */
export function studioBrushDistinctShortName(
  id: string,
  name: string,
  fallbackShortName: string,
): string {
  const override = STUDIO_BRUSH_DISTINCT_SHORT_NAME_BY_ID[id];
  if (override) return override;
  const trimmed = fallbackShortName.trim();
  if (trimmed.length >= 2 && !trimmed.endsWith("·")) return fallbackShortName;
  const variant = name.includes("·") ? name.split("·").slice(1).join(" ").trim() : name.trim();
  const compact = variant.replace(/\s+/gu, "");
  return compact.slice(0, 6) || fallbackShortName;
}

/**
 * 별칭/레거시 카탈로그 ID를 정본 카탈로그 ID로 해석한다.
 */
export function resolveCanonicalStudioBrushCatalogId(catalogId: string): string {
  const direct = STUDIO_BRUSH_CATALOG_ALIAS_TO_CANONICAL[catalogId];
  if (direct) return direct;
  if (isStudioV6BrushCatalogId(catalogId)) {
    const recipeId = studioV6RecipeIdFromCatalogId(catalogId);
    if (recipeId) {
      const canonicalRecipeId = resolveCanonicalBrushStudioV6RecipeId(recipeId);
      if (canonicalRecipeId !== recipeId) {
        return studioV6BrushCatalogId(canonicalRecipeId);
      }
    }
  }
  return catalogId;
}

/**
 * 카탈로그 ID가 정본으로 흡수된 중복 별칭인지 판별한다.
 */
export function isStudioBrushCatalogDuplicateAliasId(catalogId: string): boolean {
  return Object.prototype.hasOwnProperty.call(STUDIO_BRUSH_CATALOG_ALIAS_TO_CANONICAL, catalogId);
}

/**
 * 상용 허용 프로필에서 대체 정본이 존재하는 구형 `v6:mixbox-*` ID인지 조회한다.
 */
export function resolveStudioBrushCatalogCommercialReplacementId(catalogId: string): string | null {
  return STUDIO_BRUSH_CATALOG_COMMERCIAL_REPLACEMENT_MAP[catalogId] ?? null;
}

/**
 * 카탈로그 목록에서 중복 별칭 및 동일 ID를 제거한 정본 노출 목록을 반환한다.
 */
export function dedupeStudioBrushCatalogItems<
  T extends Pick<StudioBrushCatalogItem, "id">,
>(
  items: readonly T[],
  options: { readonly excludeCommercialSuperseded?: boolean } = {},
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (isStudioBrushCatalogDuplicateAliasId(item.id)) continue;
    if (
      options.excludeCommercialSuperseded
      && resolveStudioBrushCatalogCommercialReplacementId(item.id) !== null
    ) {
      continue;
    }
    const canonicalId = resolveCanonicalStudioBrushCatalogId(item.id);
    if (seen.has(canonicalId)) continue;
    seen.add(canonicalId);
    result.push(item);
  }
  return result;
}

export interface StudioBrushShortNameCollision {
  readonly shortName: string;
  readonly ids: readonly string[];
}

/**
 * 카탈로그 목록에서 단축 라벨(`shortName`)이 충돌하는 항목을 감사한다.
 */
export function auditStudioBrushShortNameCollisions(
  items: readonly Pick<StudioBrushCatalogItem, "id" | "shortName">[],
): readonly StudioBrushShortNameCollision[] {
  const byShortName = new Map<string, string[]>();
  for (const item of items) {
    const key = item.shortName.trim();
    const bucket = byShortName.get(key) ?? [];
    bucket.push(item.id);
    byShortName.set(key, bucket);
  }
  const collisions: StudioBrushShortNameCollision[] = [];
  for (const [shortName, ids] of byShortName) {
    if (ids.length > 1) {
      collisions.push(Object.freeze({ shortName, ids: Object.freeze(ids) }));
    }
  }
  return Object.freeze(collisions);
}
