import { materialMarketParams, planMaterialIntent } from "@toonstudio/core/material-intent-plan";

import type {
  MaterialIntentConflict,
  MaterialMarketKind,
  MaterialMarketParams,
} from "@toonstudio/core/material-intent-plan";

/**
 * 문장으로 마켓 찾기 — 계획기가 읽은 마켓 조건을 기존 `/market/browse` URL 필터로 바꾸는 순수 변환.
 * 새 API 는 없다. 반영은 사용자가 "이 조건으로 찾기"를 눌렀을 때 URL 필터(q·kind·license·tag)를 바꾸는 것이 전부다.
 */

/** 문장에서 읽어 낸 마켓 조건의 종류. 배열 순서가 화면 표시 순서다. */
export type MarketSentenceFacet = "kind" | "tag" | "license" | "q";

export const MARKET_SENTENCE_FACETS: readonly MarketSentenceFacet[] = Object.freeze(["kind", "tag", "license", "q"]);

/** 마켓 종류의 영문 표기. 한글 표기는 `marketKindMeta(kind).label` 을 그대로 쓴다. */
export const MARKET_SENTENCE_KIND_LABEL_EN: Readonly<Record<MaterialMarketKind, string>> = Object.freeze({
  template: "Templates",
  asset: "2D assets",
  "3d-asset": "3D assets",
  "3d-preset": "3D presets",
  brush: "Brushes",
  palette: "Palettes",
  filter: "Filters and effects",
});

export interface MarketSentenceReading {
  /** 계획기가 읽은 마켓 URL 필터. 읽지 못한 값은 키가 없다. */
  readonly filters: MaterialMarketParams;
  /** 종류·라이선스 단서가 서로 어긋나 하나만 골랐다는 안내(그 밖의 충돌은 마켓과 무관하다). */
  readonly conflicts: readonly MaterialIntentConflict[];
  /** 80자를 넘어 뒤를 잘랐는지 */
  readonly truncated: boolean;
}

export function readMarketSentence(sentence: string): MarketSentenceReading {
  const plan = planMaterialIntent(sentence);
  return {
    filters: materialMarketParams(plan.market),
    conflicts: plan.conflicts.filter((conflict) => conflict.axis === "market-kind" || conflict.axis === "license"),
    truncated: plan.truncated,
  };
}

/** 읽은 조건 중 사용자가 빼지 않은 것. 표시 순서를 따른다. */
export function marketSentenceFacets(
  filters: MaterialMarketParams,
  removed: ReadonlySet<MarketSentenceFacet>,
): readonly MarketSentenceFacet[] {
  return MARKET_SENTENCE_FACETS.filter((facet) => filters[facet] !== undefined && !removed.has(facet));
}

/**
 * 읽은 조건을 URL 필터 변경분으로 바꾼다. 문장은 "새 검색 의도"이므로 q·kind·license·tag 를 통째로 바꾼다
 * (읽지 못했거나 사용자가 뺀 조건은 지운다). 배급자·보기 방식 같은 다른 필터는 건드리지 않는다.
 * 관련도순 정렬은 검색어가 있어야만 유효하므로 검색어가 없으면 기본 정렬로 되돌린다.
 */
export function marketSentenceUrlPatch(
  filters: MaterialMarketParams,
  removed: ReadonlySet<MarketSentenceFacet>,
): Readonly<Record<string, string | null>> {
  const keep = new Set(marketSentenceFacets(filters, removed));
  const q = keep.has("q") ? filters.q ?? null : null;
  return {
    q,
    kind: keep.has("kind") ? filters.kind ?? null : null,
    license: keep.has("license") ? filters.license ?? null : null,
    tag: keep.has("tag") ? filters.tag ?? null : null,
    ...(q ? {} : { sort: null }),
  };
}
