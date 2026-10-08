/**
 * 창작 갤러리 링크의 단일 출처.
 *
 * - 갤러리 전체(허브·챌린지·홍보영상·작품·시리즈 상세)는 정식 경로 `/showcase/*`를 쓴다.
 * - 옛 `/create/*` 상세 주소는 라우터가 `/showcase/*`로 리다이렉트하는 호환 전용이며,
 *   새 링크는 만들지 않는다. 리더 포커스도 `/showcase/work/…?view=reader`가 정식 형태다.
 * 문자열을 화면마다 조립하지 않고 이 헬퍼를 거쳐, 인코딩 누락과 레거시 경로 혼용을 막는다.
 */
import type { WorkSort } from "@/platform/creator-client";
import type {
  CreatorCommunityContentGroup,
  CreatorCommunityProvenance,
} from "@/shared/lib/creator-community-publication-contract";

export const SHOWCASE_HOME_PATH = "/showcase";
export const SHOWCASE_CHALLENGES_PATH = "/showcase/challenges";
export const SHOWCASE_PROMO_PATH = "/showcase/promo";
export const SHOWCASE_REVIEWS_PATH = "/showcase/reviews";

export type ShowcaseGalleryTab = "works" | "series" | "following" | "saved";

export interface ShowcaseGalleryQuery {
  readonly tab?: ShowcaseGalleryTab;
  readonly sort?: WorkSort;
  readonly tag?: string;
  readonly content?: CreatorCommunityContentGroup;
  readonly provenance?: CreatorCommunityProvenance;
  readonly portfolio?: boolean;
}

/** 갤러리 기본값(전체 작품·최신·전체 유형)은 URL에 남기지 않아 공유 링크를 짧게 유지한다. */
export function showcaseGalleryHref(query: ShowcaseGalleryQuery = {}): string {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== "works") params.set("tab", query.tab);
  if (query.sort && query.sort !== "recent") params.set("sort", query.sort);
  const tag = query.tag?.trim();
  if (tag) params.set("tag", tag);
  if (query.content && query.content !== "all") params.set("content", query.content);
  if (query.provenance) params.set("provenance", query.provenance);
  if (query.portfolio) params.set("portfolio", "1");
  const search = params.toString();
  return search ? `${SHOWCASE_HOME_PATH}?${search}` : SHOWCASE_HOME_PATH;
}

export function showcaseChallengeHref(slug: string): string {
  return `${SHOWCASE_CHALLENGES_PATH}?c=${encodeURIComponent(slug)}`;
}

export function creatorWorkHref(workId: string): string {
  return `/showcase/work/${encodeURIComponent(workId)}`;
}

export function creatorSeriesHref(seriesId: string): string {
  return `/showcase/series/${encodeURIComponent(seriesId)}`;
}

export function creatorProfileHref(userId: string): string {
  return `/u/${encodeURIComponent(userId)}`;
}
