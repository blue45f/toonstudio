/**
 * 시리즈 상세(서버 응답)를 예약 발행 패널의 회차 선택지로 바꾸는 어댑터.
 *
 * 게시 명령 센터가 이미 쓰는 `getSeries` 응답(`SeriesDetail.episodeList`)을
 * 그대로 소비한다. 새 API를 만들지 않는다.
 *
 * 매핑 규칙 (근거가 없는 값을 지어내지 않는다):
 * - 이미 게시된 회차(status === "published")는 다시 예약할 대상이 아니라 제외한다.
 * - `episodeNo`가 없는 회차는 목록 순서(서버 정렬)를 유지한 채 뒤에 둔다.
 * - 시놉시스는 작품 설명(description)이 비어 있지 않을 때만 채운다.
 * - `ready`(발행 준비)는 WorkSummary에 대응 상태가 없어, 페이지가 실제로
 *   있는 초안 회차를 준비된 것으로 본다. 페이지 수가 0이면 체크리스트의
 *   페이지 항목과 함께 이 항목도 막혀 예약이 저장되지 않는다.
 * - 썸네일은 작품 표지(cover)가 있을 때만 있다고 본다.
 */
import type { SeriesDetail, WorkSummary } from "@/platform/creator-client";

import type { PublishScheduleEpisodeOption } from "./PublishScheduleDialog";

function episodeSortKey(work: WorkSummary, index: number): readonly [number, number, string, number] {
  return [
    work.episodeNo == null ? 1 : 0,
    work.episodeNo ?? 0,
    work.createdAt ?? "",
    index,
  ];
}

export function publishScheduleEpisodeOptions(
  series: SeriesDetail,
): readonly PublishScheduleEpisodeOption[] {
  return series.episodeList
    .map((work, index) => ({ work, index }))
    .filter(({ work }) => work.status !== "published")
    .sort((left, right) => {
      const a = episodeSortKey(left.work, left.index);
      const b = episodeSortKey(right.work, right.index);
      if (a[0] !== b[0]) return a[0] - b[0];
      if (a[1] !== b[1]) return a[1] - b[1];
      if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
      return a[3] - b[3];
    })
    .map(({ work }, position) => ({
      id: work.id,
      episodeNumber: work.episodeNo ?? position + 1,
      title: work.title,
      synopsis: work.description?.trim() ? work.description : null,
      pageCount: work.pagesCount ?? 0,
      ready: (work.pagesCount ?? 0) > 0,
      hasThumbnail: Boolean(work.cover),
    }));
}
