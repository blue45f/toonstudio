import {
  MANUAL_ARTICLES_IN_ORDER,
  manualArticleHref,
  searchManual,
} from "@/domains/creator/manual/studio-manual-search";
import { LESSONS, TERMS } from "@/domains/learn/learning-content";
import { matchesSearch } from "@/domains/learn/learning-model";
import { helpSearchTokens, rankRelatedScreens } from "@/domains/legal/help-search";
import { SITEMAP_DIRECTORY_ENTRIES } from "@/domains/legal/site-directory-data";
import { fuzzyRankByTexts } from "@/shared/lib/fuzzy-search";

import {
  assetsLinkSection,
  buildUnifiedSearchResult,
  emptyUnifiedSection,
  unifiedCoursesMoreHref,
  unifiedHelpMoreHref,
  type UnifiedSearchResult,
  type UnifiedSearchSection,
} from "./unified-search";

/**
 * 통합 검색의 로컬 프로바이더 — 기존 검색 모듈을 그대로 재사용한다.
 *
 * - 강좌: /learn의 `matchesSearch`(제목·요약·용어 이름) — LearningHome과 같은 필드 구성.
 * - 도움말: /help의 `helpSearchTokens`로 문제형 문장을 낱말로 풀고, 그 낱말을
 *   매뉴얼 검색 `searchManual`에 넘긴다(S2-9에서 세운 어휘 정렬 계약과 동일).
 *   즉 도움말 검색 결과에는 매뉴얼 본문 문서가 편입된다.
 * - 페이지: /help 관련 화면과 같은 `rankRelatedScreens`(사이트 디렉터리 랭킹).
 * - 소재: 로컬 색인이 없어 링크 전용 섹션(전용 표면에서 서버 검색).
 *
 * 이 모듈은 강좌·매뉴얼·사이트맵 데이터를 끌어오므로 가볍지 않다. 셸(커맨드
 * 팔레트)처럼 진입 청크에 있는 표면은 정적 import 대신 동적 import로 읽고,
 * /search·/help처럼 지연 로드되는 표면은 정적 import해도 된다.
 *
 * 퍼지(fuse.js) 적용 방식: 각 유형 모두 "기존 정확 매칭이 먼저, 퍼지가
 * 그 뒤"다. 정확 패스는 기존 검색 모듈(matchesSearch·searchManual·
 * rankRelatedScreens)을 그대로 써서 기존 순서·계약을 보존하고, 정확
 * 결과에 못 든 후보만 공용 퍼지 엔진(`fuzzyRankByTexts`)으로 랭킹해
 * 붙인다 — 한 글자 오타("스튜지오")로 강좌·매뉴얼·페이지가 비는 일이
 * 없어진다. fuse.js 본체는 퍼지 엔진 모듈에만 있고 이 프로바이더와
 * 함께 검색 표면 전용 청크로 분리된다.
 */

export const UNIFIED_COURSES_LIMIT = 4;
export const UNIFIED_HELP_LIMIT = 4;
export const UNIFIED_PAGES_LIMIT = 6;

/** 강좌 한 건의 검색 필드 — /learn(LearningHome)과 같은 구성(제목·요약·용어 이름). */
function courseSearchTexts(lesson: (typeof LESSONS)[number]): readonly string[] {
  return [
    lesson.title,
    lesson.summary,
    ...lesson.terms.map((termId) => TERMS.find((term) => term.id === termId)?.name ?? termId),
  ];
}

/** 강좌 섹션 — 정확은 /learn 강좌 검색(matchesSearch), 나머지는 퍼지로 잇는다. */
export function searchUnifiedCourses(query: string, limit: number = UNIFIED_COURSES_LIMIT): UnifiedSearchSection {
  const trimmed = query.trim();
  if (!trimmed) return emptyUnifiedSection("courses");
  const exact = LESSONS.filter((lesson) => matchesSearch(trimmed, courseSearchTexts(lesson)));
  const exactIds = new Set(exact.map((lesson) => lesson.id));
  const fuzzy = fuzzyRankByTexts(
    LESSONS.filter((lesson) => !exactIds.has(lesson.id)),
    trimmed,
    courseSearchTexts,
  ).map((ranked) => ranked.item);
  const matched = [...exact, ...fuzzy];
  return {
    kind: "courses",
    items: matched.slice(0, limit).map((lesson) => ({
      kind: "courses",
      id: lesson.id,
      title: lesson.title,
      description: lesson.summary,
      href: `/learn/lessons/${encodeURIComponent(lesson.id)}`,
    })),
    total: matched.length,
    moreHref: unifiedCoursesMoreHref(trimmed),
  };
}

/**
 * 도움말 섹션 — 매뉴얼 본문 검색(searchManual) 결과.
 * 도움말 토큰(조사 제거·문제 표현 제외)을 매뉴얼 검색에 그대로 넘겨
 * "저장이 안 돼요" 같은 문제형 문장도 매뉴얼 문서에 닿게 한다.
 */
export function searchUnifiedHelp(query: string, limit: number = UNIFIED_HELP_LIMIT): UnifiedSearchSection {
  const tokens = helpSearchTokens(query);
  if (tokens.length === 0) return emptyUnifiedSection("help");
  const exact = searchManual(tokens.join(" "));
  const exactIds = new Set(exact.map((article) => article.id));
  // 퍼지 패스 — 정확 결과에 못 든 문서를 제목·요약·키워드로 랭킹한다.
  // 문제형 문장("저장이 안 돼요")은 토큰을 이은 문자열로 찾는다(정확 패스와 같은 입력).
  const fuzzy = fuzzyRankByTexts(
    MANUAL_ARTICLES_IN_ORDER.filter((article) => !exactIds.has(article.id)),
    tokens.join(" "),
    (article) => [article.title, article.summary, article.keywords.join(" ")],
  ).map((ranked) => ranked.item);
  const matched = [...exact, ...fuzzy];
  return {
    kind: "help",
    items: matched.slice(0, limit).map((article) => ({
      kind: "help",
      id: article.id,
      title: article.title,
      description: article.summary,
      href: manualArticleHref(article.id),
    })),
    total: matched.length,
    moreHref: unifiedHelpMoreHref(),
  };
}

/** 페이지 섹션 — 정확은 사이트 디렉터리 랭킹(rankRelatedScreens), 나머지는 퍼지로 잇는다. */
export function searchUnifiedPages(query: string, limit: number = UNIFIED_PAGES_LIMIT): UnifiedSearchSection {
  const tokens = helpSearchTokens(query);
  if (tokens.length === 0) return emptyUnifiedSection("pages");
  const exact = rankRelatedScreens(SITEMAP_DIRECTORY_ENTRIES, tokens, new Set(), limit);
  const exactHrefs = new Set(exact.map((entry) => entry.href));
  const fuzzy = fuzzyRankByTexts(
    SITEMAP_DIRECTORY_ENTRIES.filter((entry) => !exactHrefs.has(entry.href)),
    tokens.join(" "),
    (entry) => [entry.label.ko, entry.label.en, entry.description.ko],
  ).map((ranked) => ranked.item);
  const entries = [...exact, ...fuzzy].slice(0, limit);
  return {
    kind: "pages",
    items: entries.map((entry) => ({
      kind: "pages",
      id: entry.href,
      title: entry.label.ko,
      description: entry.description.ko,
      href: entry.href,
    })),
    total: exact.length + fuzzy.length,
  };
}

/** 도움말 표면 전용 묶음 — 매뉴얼(도움말 섹션)과 강좌를 함께 돌려준다. */
export function searchUnifiedHelpSections(query: string): {
  readonly manual: UnifiedSearchSection;
  readonly courses: UnifiedSearchSection;
} {
  return { manual: searchUnifiedHelp(query), courses: searchUnifiedCourses(query) };
}

/**
 * 로컬에서 답할 수 있는 통합 검색 전체(강좌·도움말·페이지 + 소재 링크).
 * 작품·소재 아이템은 서버 검색이라 호출자가 worksSectionFromTitles /
 * assetsSectionFromResources로 만들어 buildUnifiedSearchResult에 합친다.
 */
export function searchUnifiedLocal(query: string): UnifiedSearchResult {
  return buildUnifiedSearchResult(query, [
    assetsLinkSection(query),
    searchUnifiedCourses(query),
    searchUnifiedHelp(query),
    searchUnifiedPages(query),
  ]);
}
