import { fuzzyRankByTexts } from "@/shared/lib/fuzzy-search";
import { matchesHangulText } from "@/shared/lib/hangul";

import {
  assetsSectionFromResources,
  emptyUnifiedSection,
  unifiedAssetsMoreHref,
  type UnifiedSearchSection,
} from "./unified-search";
import { UNIFIED_ASSETS_INDEX } from "./unified-search-assets-index";

/**
 * 통합 검색 소재 섹션 — 로컬 경량 색인 검색 + 서버 결과 병합 (A6, 2026-10-22)
 *
 * 이전까지 소재 섹션은 "로컬 색인이 없어 링크 전용"이었다: 통합 검색
 * 결과에서 소재만 아이템 없이 "마켓에서 찾기" 링크로 끝나, 통합 검색의
 * 약속(한 입력으로 전 유형 도달)이 반쪽이었다.
 *
 * 색인: `unified-search-assets-index.ts` — 소재 전용 표면(/market/browse)이
 * 서버 결과와 병합하는 로컬 정본(스타터 레코드)에서 제목·태그·종류만 뽑은
 * 경량 사본(143건·약 17KB). 이 모듈과 함께 검색 표면 전용 청크로 분리되며,
 * 셸 청크에는 들어가지 않는다(프로바이더와 같은 동적 import 경계).
 *
 * 매칭 규칙(다른 로컬 섹션과 동일): 정확 패스(제목·태그·종류에 부분일치·
 * 초성 매칭)가 색인 원래 순서로 먼저, 정확에 못 든 후보만 퍼지 패스가
 * 뒤에 붙는다.
 *
 * 서버 결과와의 병합 규칙 — `mergeUnifiedAssetSections`가 단일 정본이다:
 *  1. 같은 id는 한 번만 나온다. 서버 레코드가 우선한다(가격·평점·소유 등
 *     최신 상태는 서버가 정본이고, 로컬 색인은 찾기 전용 사본이다).
 *  2. 순서는 서버 결과 먼저(서버 랭킹 유지), 그 뒤에 로컬 전용 결과.
 *  3. total은 중복을 제거한 합집합 건수다 — 서버 total(서버 전체 건수)과
 *     로컬 total을 그냥 더하면 스타터 레코드 중복분만큼 부풀려진다.
 *     서버 total이 로컬과 겹치는 스타터분을 포함하는지는 서버 계약이
 *     보장하지 않으므로, total은 "확인된 합집합 하한"으로 계산한다:
 *     max(서버 total, 서버 표시 건수 + 로컬 전용 건수, 합집합 표시 건수).
 *  4. moreHref는 어느 쪽이 이겨도 같은 전용 표면(/market/browse?q=)이다.
 *  5. 서버 검색이 실패·미실행이면 로컬 섹션만으로 답한다 — 소재 섹션이
 *     다시 링크 전용으로 퇴행하지 않는다.
 */

export const UNIFIED_ASSETS_LIMIT = 4;

export interface UnifiedAssetIndexEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly tags: readonly string[];
}

/** 색인 튜플을 검색용 항목으로 편다. 태그 문자열은 여기서만 해석한다. */
export const UNIFIED_ASSET_ENTRIES: readonly UnifiedAssetIndexEntry[] = UNIFIED_ASSETS_INDEX.map(
  ([id, title, kind, tagsJoined]) => ({
    id,
    title,
    kind,
    tags: tagsJoined ? tagsJoined.split("|") : [],
  }),
);

function assetSearchTexts(entry: UnifiedAssetIndexEntry): readonly string[] {
  return [entry.title, entry.kind, ...entry.tags];
}

/** 소재 항목의 표시 설명 — 종류와 대표 태그를 함께 보여 무엇을 찾았는지 알게 한다. */
function assetDescription(entry: UnifiedAssetIndexEntry): string {
  const tags = entry.tags.filter((tag) => tag !== "CC0" && !tag.startsWith("QA-"));
  return tags.length > 0 ? `${entry.kind} · ${tags.slice(0, 3).join(" · ")}` : entry.kind;
}

/**
 * 로컬 색인 소재 섹션. 빈 질의는 빈 섹션(집계층 조립에서 버려진다).
 * 질의가 있으면 최소한 moreHref(전용 표면 링크)를 실어, 색인에 없어도
 * 서버 전용 검색으로 이어지게 한다 — 이전 링크 전용 동작의 상위집합이다.
 */
export function searchUnifiedAssets(
  query: string,
  limit: number = UNIFIED_ASSETS_LIMIT,
): UnifiedSearchSection {
  const trimmed = query.trim();
  if (!trimmed) return emptyUnifiedSection("assets");
  const exact = UNIFIED_ASSET_ENTRIES.filter((entry) =>
    assetSearchTexts(entry).some((text) => matchesHangulText(text, trimmed)),
  );
  const exactIds = new Set(exact.map((entry) => entry.id));
  const fuzzy = fuzzyRankByTexts(
    UNIFIED_ASSET_ENTRIES.filter((entry) => !exactIds.has(entry.id)),
    trimmed,
    assetSearchTexts,
  ).map((ranked) => ranked.item);
  const matched = [...exact, ...fuzzy];
  return {
    kind: "assets",
    items: matched.slice(0, limit).map((entry) => ({
      kind: "assets" as const,
      id: entry.id,
      title: entry.title,
      description: assetDescription(entry),
      href: `/market/resource/${encodeURIComponent(entry.id)}`,
    })),
    total: matched.length,
    moreHref: unifiedAssetsMoreHref(trimmed),
  };
}

/**
 * 서버 소재 섹션(assetsSectionFromResources 결과)과 로컬 색인 섹션을
 * 위 병합 규칙으로 합친다. 어느 한쪽이 없으면 있는 쪽을 그대로 돌려준다.
 * limit은 합친 뒤 표시 상한이다(서버 우선이라 서버 결과가 앞자리를 차지한다).
 */
export function mergeUnifiedAssetSections(
  server: UnifiedSearchSection | null | undefined,
  local: UnifiedSearchSection | null | undefined,
  limit: number = UNIFIED_ASSETS_LIMIT,
): UnifiedSearchSection {
  if (!server && !local) return emptyUnifiedSection("assets");
  if (!server) return local!;
  if (!local) return server;
  const serverIds = new Set(server.items.map((item) => item.id));
  const localOnlyItems = local.items.filter((item) => !serverIds.has(item.id));
  const items = [...server.items, ...localOnlyItems].slice(0, limit);
  // 로컬 total에는 서버와 겹치는 스타터분이 섞여 있을 수 있어, 겹침을
  // 표시분 기준으로 제거한 하한을 구한다(규칙 3).
  const localOnlyTotal = Math.max(0, local.total - (local.items.length - localOnlyItems.length));
  const total = Math.max(server.total, server.items.length + localOnlyTotal, items.length);
  return {
    kind: "assets",
    items,
    total,
    moreHref: server.moreHref ?? local.moreHref,
  };
}

/** 서버 레코드 목록을 직접 받아 병합까지 한 번에 — 팔레트 등 서버를 부르는 표면용. */
export function mergedAssetsSectionFromServerRecords(
  records: Parameters<typeof assetsSectionFromResources>[0],
  query: string,
  serverTotal: number,
  limit: number = UNIFIED_ASSETS_LIMIT,
): UnifiedSearchSection {
  const server = assetsSectionFromResources(records, query, limit, serverTotal);
  // 로컬 풀은 표시 상한보다 넓게 잡는다 — 서버 결과와 겹치는 로컬 항목이
  // 앞자리를 차지해도, 겹치지 않는 로컬 결과가 상한 밖으로 밀려 사라지지 않게.
  return mergeUnifiedAssetSections(server, searchUnifiedAssets(query, limit * 2), limit);
}
