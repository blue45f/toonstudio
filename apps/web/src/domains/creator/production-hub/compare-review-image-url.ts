/**
 * 비교 검수 리비전 렌더 URL 실연결 (잔여 배선 ②).
 *
 * 서버에는 이미 리뷰 프리뷰 발급 경로가 있다:
 *   GET /studio-project-graph/reviews/:reviewId/previews
 *     ?projectId&workId&artifactId&revisionId&rootGraphHash
 * 검수(review)에 고정된 리비전의 blob들을 짧은 수명(30초)의 서명 URL로 돌려준다.
 * 웹 클라이언트에는 이 경로를 부르는 함수가 없었고, 비교 뷰어의
 * resolveCompareImageUrl은 그래서 항상 플레이스홀더로 떨어졌다.
 *
 * 이 모듈은 순수 계획·해석만 소유한다:
 *  - 어떤 (아티팩트, 리비전)에 프리뷰를 요청할지 계획한다(검수가 있는 리비전만,
 *    head 우선, 상한 적용 — 서명 URL은 비싸고 짧게 살아남는다).
 *  - 응답을 동기 해석기 (processId, revisionId) => url 로 바꾼다.
 * 실제 fetch는 studio-project-graph-client.getStudioReviewPreviews가 맡고,
 * 페이지(ProductionEpisodeRoomPage)가 계획→fetch→해석기 조립을 배선한다.
 *
 * 프리뷰가 없거나(레거시 blob은 v2 위치 참조가 없어 서버가 unavailable을 준다)
 * 요청이 실패하면 해석기는 null을 돌려주고, 뷰어는 기존 플레이스홀더 아트
 * 관습으로 표시한다 — 비교 자체(외부 이미지·핀)는 URL이 없어도 동작한다.
 */

import type { ProductionManuscriptProcess } from "./production-manuscript-model";

/** 프리뷰 요청 한 건. subject는 서버 계약(StudioReviewPreviewSubject)과 같은 형태다. */
export interface ComparePreviewRequest {
  readonly projectId: string;
  readonly workId: string;
  readonly artifactId: string;
  readonly reviewId: string;
  readonly revisionId: string;
  readonly rootGraphHash: string;
}

/** 해석기 맵의 키. buildProcessCompareItems의 processId가 아티팩트 id와 같다는 전제를 쓴다. */
export function compareImageUrlKey(artifactId: string, revisionId: string): string {
  return `${artifactId}::${revisionId}`;
}

/** 기본 상한: 룸 한 번 열 때 서명 URL을 발급할 리비전 수. head·최신 검수 우선으로 채운다. */
export const COMPARE_PREVIEW_REQUEST_LIMIT = 12;

/**
 * 공정 목록에서 프리뷰 요청 계획을 만든다.
 * - 검수(review)가 고정된 리비전만 대상이다(서버 계약이 reviewId를 요구한다).
 *   한 리비전에 검수가 여럿이면 가장 최근에 갱신된 검수를 쓴다(process.reviews는 최신순 정렬).
 * - 순서는 head 리비전 → 나머지 리비전(최신순)이며, 공정 순서는 입력 순서를 유지한다.
 */
export function buildComparePreviewRequests(
  processes: readonly ProductionManuscriptProcess[],
  subject: { readonly projectId: string; readonly workId: string },
  limit: number = COMPARE_PREVIEW_REQUEST_LIMIT,
): ComparePreviewRequest[] {
  const requests: ComparePreviewRequest[] = [];
  const seen = new Set<string>();
  const pushFor = (process: ProductionManuscriptProcess, revisionId: string) => {
    if (requests.length >= limit) return;
    const key = compareImageUrlKey(process.artifact.id, revisionId);
    if (seen.has(key)) return;
    const revision = process.revisions.find((entry) => entry.id === revisionId);
    if (!revision) return;
    const review = process.reviews.find((entry) => entry.revisionId === revisionId);
    if (!review) return;
    seen.add(key);
    requests.push({
      projectId: subject.projectId,
      workId: subject.workId,
      artifactId: process.artifact.id,
      reviewId: review.id,
      revisionId,
      rootGraphHash: revision.rootGraphHash,
    });
  };
  for (const process of processes) {
    if (process.headRevision) pushFor(process, process.headRevision.id);
  }
  for (const process of processes) {
    for (const revision of process.revisions) pushFor(process, revision.id);
  }
  return requests;
}

/** 프리뷰 응답 한 건에서 대표 이미지(가장 작은 ordinal)를 고른다. */
export interface ComparePreviewReadLike {
  readonly ordinal: number;
  readonly url: string;
}

export interface ComparePreviewResultLike {
  readonly artifactId: string;
  readonly revisionId: string;
  readonly previews: readonly ComparePreviewReadLike[];
}

/**
 * 프리뷰 결과들을 해석기 맵으로 합친다. 빈 결과·URL 없는 항목은 넣지 않는다
 * (맵에 없으면 해석기가 null을 돌려 플레이스홀더로 떨어진다).
 */
export function buildCompareImageUrlMap(
  results: readonly ComparePreviewResultLike[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const result of results) {
    const first = [...result.previews].sort((a, b) => a.ordinal - b.ordinal)[0];
    if (!first?.url) continue;
    map.set(compareImageUrlKey(result.artifactId, result.revisionId), first.url);
  }
  return map;
}

/** buildProcessCompareItems·buildCompareSeedPoolFromProcesses가 받는 동기 해석기를 만든다. */
export function resolveCompareImageUrlFromMap(
  map: ReadonlyMap<string, string>,
): (processId: string, revisionId: string) => string | null {
  return (processId, revisionId) => map.get(compareImageUrlKey(processId, revisionId)) ?? null;
}
