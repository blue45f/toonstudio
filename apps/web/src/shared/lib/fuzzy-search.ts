/**
 * 퍼지 검색 공용 엔진 — fuse.js(Apache-2.0, krisk/Fuse) 단일 진입점.
 *
 * 배경: 검색이 전부 부분일치라 한 글자만 틀려도 "결과 없음"이 됐다. 특히
 * 한국어 오타는 모음·받침만 틀리는 경우가 많아, es-hangul 초성 전처리
 * (`hangul.ts`)와 결합하면 오타 상당수가 이미 정확 매칭으로 흡수된다 —
 * 이 엔진은 그 위에 fuse.js Bitap 퍼지를 얹어 자소 단위 오타까지 찾는다.
 *
 * 매칭 순서(결정적):
 *  1. 정확 패스 — 필드별 `matchesHangulText`(부분일치·초성)와 공백 제거
 *     부분일치("로맨스 판타지" → "로맨스판타지")를 원래 순서로 앞에 둔다.
 *     기존 표면의 결과 순서·계약은 이 패스가 그대로 보존한다.
 *  2. 퍼지 패스 — 정확 패스에 못 든 항목만 fuse.js로 랭킹해 점수 오름차순
 *     (동점은 원래 순서)으로 뒤에 붙인다.
 *
 * 오탐 방지(실측으로 고정한 값):
 *  - 임계·상한 모두 0.4. 상한을 넘긴 점수는 버린다 — 가중 키를 쓰면
 *    fuse.js가 임계보다 큰 점수도 돌려주는 경우가 있어 상한을 따로 둔다.
 *  - 퍼지 대상은 원문과 공백 제거문 두 뷰뿐이다. 초성 문자열은 자소
 *    알파벳이 작아(초성 19자) 퍼지를 걸면 무관한 결과가 대량으로 붙어,
 *    초성은 정확 패스에서만 쓴다.
 *  - 공백 제거 후 2자 미만인 질의는 퍼지를 하지 않는다(1자 오타는
 *    판별 자체가 불가능하고, 2자 질의의 초성 변경 오타도 마찬가지라
 *    정확·초성 패스까지가 이 엔진의 보장 범위다).
 *
 * 번들 규칙: fuse.js는 이 모듈에서만 import 한다. 이 모듈의 사용자는
 * 전부 검색 표면 전용 청크다 — 통합 검색 프로바이더(팔레트에서는 동적
 * import), 대사 도구(스튜디오 청크), /search 패널. 진입 청크(앱 셸·
 * command-palette-search 같은 동기 필터 모듈)는 이 모듈을 import 하면
 * 안 된다. 팔레트 본체는 동적 import로만 이 모듈을 읽는다.
 */
import Fuse from "fuse.js";

import { matchesHangulText } from "./hangul";

/** fuse.js 임계값 — 이보다 나쁜 매칭은 후보로도 올리지 않는다. */
export const FUZZY_SEARCH_THRESHOLD = 0.4;

/** 채택 상한 — 임계를 통과해도 이 점수를 넘으면 오탐으로 보고 버린다. */
export const FUZZY_SEARCH_MAX_SCORE = 0.4;

/** 퍼지 패스를 돌리는 최소 질의 길이(공백 제거 기준). */
export const FUZZY_SEARCH_MIN_QUERY_LENGTH = 2;

export interface FuzzyRanked<T> {
  readonly item: T;
  /** 0이 완벽. 정확 패스는 항상 0. */
  readonly score: number;
  /** 정확 패스(부분일치·초성·공백 무시 부분일치)로 든 항목이면 true. */
  readonly exact: boolean;
}

export interface FuzzyRankOptions {
  /** 랭킹 뒤에 남길 최대 개수(정확+퍼지 합산). 기본 무제한. */
  readonly limit?: number;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, "");
}

interface FuzzyRow {
  readonly index: number;
  readonly text: string;
  readonly compact: string;
}

/**
 * 항목들을 질의로 랭킹한다. `textsOf`는 항목의 검색 대상 필드들
 * (제목·요약·키워드 등)을 돌려준다 — 필드 경계를 지켜야 fuse.js 점수가
 * 필드 하나의 문자열 기준으로 계산돼, 긴 합성 문자열에서 생기는
 * 점수 희석·오탐을 막을 수 있다.
 *
 * 빈 질의는 전 항목을 원래 순서·정확으로 돌려준다(기존 "빈 질의=전체"
 * 계약과 동일). 입력 배열은 변형하지 않는다.
 */
export function fuzzyRankByTexts<T>(
  items: readonly T[],
  query: string,
  textsOf: (item: T) => readonly string[],
  options: FuzzyRankOptions = {},
): FuzzyRanked<T>[] {
  const q = query.trim();
  if (!q) return items.map((item) => ({ item, score: 0, exact: true }));

  const qCompact = compactText(q.toLowerCase());
  const rows: FuzzyRow[] = [];
  const exactIndexes = new Set<number>();
  const ranked: FuzzyRanked<T>[] = [];

  items.forEach((item, index) => {
    const fields = textsOf(item);
    const exact =
      fields.some((field) => matchesHangulText(field, q)) ||
      (qCompact.length >= FUZZY_SEARCH_MIN_QUERY_LENGTH &&
        fields.some((field) => compactText(field.toLowerCase()).includes(qCompact)));
    if (exact) {
      exactIndexes.add(index);
      ranked.push({ item, score: 0, exact: true });
    }
    for (const field of fields) {
      const text = field.toLowerCase();
      rows.push({ index, text, compact: compactText(text) });
    }
  });

  if (qCompact.length >= FUZZY_SEARCH_MIN_QUERY_LENGTH && exactIndexes.size < items.length) {
    const bestByIndex = new Map<number, number>();
    const views: readonly { readonly key: "text" | "compact"; readonly pattern: string }[] = [
      { key: "text", pattern: q.toLowerCase() },
      { key: "compact", pattern: qCompact },
    ];
    for (const view of views) {
      if (view.pattern.length < FUZZY_SEARCH_MIN_QUERY_LENGTH) continue;
      const fuse = new Fuse(rows, {
        keys: [view.key],
        includeScore: true,
        ignoreLocation: true,
        threshold: FUZZY_SEARCH_THRESHOLD,
        minMatchCharLength: FUZZY_SEARCH_MIN_QUERY_LENGTH,
        shouldSort: false,
      });
      for (const result of fuse.search(view.pattern)) {
        const row = result.item;
        if (exactIndexes.has(row.index)) continue;
        const score = result.score ?? 1;
        if (score > FUZZY_SEARCH_MAX_SCORE) continue;
        const previous = bestByIndex.get(row.index);
        if (previous === undefined || score < previous) bestByIndex.set(row.index, score);
      }
    }
    const fuzzy = [...bestByIndex.entries()]
      .map(([index, score]) => ({ item: items[index]!, score, exact: false, index }))
      .sort((left, right) => left.score - right.score || left.index - right.index);
    for (const entry of fuzzy) ranked.push({ item: entry.item, score: entry.score, exact: false });
  }

  return options.limit === undefined ? ranked : ranked.slice(0, Math.max(0, options.limit));
}

/** 랭킹 메타 없이 항목만 필요한 표면용 — 순서는 `fuzzyRankByTexts`와 같다. */
export function fuzzyFilterByTexts<T>(
  items: readonly T[],
  query: string,
  textsOf: (item: T) => readonly string[],
  options: FuzzyRankOptions = {},
): T[] {
  return fuzzyRankByTexts(items, query, textsOf, options).map((ranked) => ranked.item);
}
