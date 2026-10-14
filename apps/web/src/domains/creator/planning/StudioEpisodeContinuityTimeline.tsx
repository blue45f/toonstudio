/**
 * 회차 간 연속성 타임라인 표면 (REPORT R-4).
 *
 * - 한 줄 타임라인: 열 = 회차(번호순). 기록된 회차는 이야기 일차 구간과 장소,
 *   시간대 라벨을 보여주고, 미기록 회차는 점선 빈칸 + "미기록"으로 정직하게
 *   비워 둔다 — 앞 회차 값으로 채우지 않는다 (판정: 미기록 회차는 빈칸으로 표시).
 * - 아래 후보 목록: 역행·겹침·동시간 다른 장소·태그 자체 모순을 "후보"로만
 *   올린다. 플래시백·병행 시점일 수 있어 확정 문구를 쓰지 않는다.
 * - 데이터는 전부 props 다. 태그 저장·수집은 호스트(기획 표면) 몫이고,
 *   이 표면은 검사 결과를 읽기 좋게 펼치는 것만 맡는다.
 */
import { useMemo } from "react";
import type { StudioStoryLocation } from "../studio-story-bible";
import {
  buildEpisodeContinuityTimeline,
  continuityTimelineSummaryLine,
  timelineDayLabel,
  type ContinuityEpisodeRef,
  type EpisodeTimePlaceTag,
} from "./studio-episode-continuity-timeline";

export interface StudioEpisodeContinuityTimelineProps {
  readonly episodes: readonly ContinuityEpisodeRef[];
  readonly tags: readonly EpisodeTimePlaceTag[];
  readonly locations: readonly StudioStoryLocation[];
  /** 회차 칸/후보의 회차 링크. 없으면 링크를 만들지 않는다. */
  readonly onOpenEpisode?: (episodeId: string) => void;
}

const CANDIDATE_LABEL: Readonly<Record<string, string>> = {
  "time-regression": "시간 역행 후보",
  "time-overlap": "시간 겹침 후보",
  "parallel-place": "같은 시간·다른 장소",
  "invalid-range": "태그 확인 필요",
};

export function StudioEpisodeContinuityTimeline({
  episodes,
  tags,
  locations,
  onOpenEpisode,
}: StudioEpisodeContinuityTimelineProps) {
  const timeline = useMemo(
    () => buildEpisodeContinuityTimeline(episodes, tags, locations),
    [episodes, tags, locations],
  );

  if (episodes.length === 0) {
    return (
      <section aria-label="회차 연속성 타임라인">
        <h2>시간 흐름이 이어지나요</h2>
        <p>회차가 있어야 시간·장소 태그를 타임라인으로 검사할 수 있어요.</p>
      </section>
    );
  }

  const flaggedEpisodeIds = new Set(timeline.candidates.flatMap((item) => [...item.episodeIds]));

  return (
    <section aria-label="회차 연속성 타임라인">
      <h2>시간 흐름이 이어지나요</h2>
      <p>{continuityTimelineSummaryLine(timeline)}</p>

      <ol
        aria-label="회차 타임라인"
        style={{ display: "flex", gap: 8, overflowX: "auto", listStyle: "none", padding: 0 }}
      >
        {timeline.entries.map((entry) => {
          const dayLabel = timelineDayLabel(entry);
          const flagged = flaggedEpisodeIds.has(entry.episodeId);
          const body = entry.recorded ? (
            <>
              <strong>{dayLabel}</strong>
              {entry.timeLabel ? <span>{` · ${entry.timeLabel}`}</span> : null}
              <span>
                {entry.locationNames.length > 0 ? entry.locationNames.join(", ") : "장소 미기록"}
              </span>
              {flagged ? <span>확인할 후보가 있어요</span> : null}
            </>
          ) : (
            <>
              <strong>미기록</strong>
              <span>시간 태그가 없어 빈칸으로 뒀어요.</span>
            </>
          );
          return (
            <li
              key={entry.episodeId}
              data-recorded={entry.recorded ? "true" : "false"}
              style={{
                minWidth: 132,
                border: entry.recorded ? "1px solid" : "1px dashed",
                opacity: entry.recorded ? 1 : 0.75,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span>{`${entry.episodeNumber}화 · ${entry.title}`}</span>
              {body}
              {onOpenEpisode ? (
                <button type="button" onClick={() => onOpenEpisode(entry.episodeId)}>
                  회차 열기
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {timeline.candidates.length > 0 ? (
        <div>
          <h3>확인할 후보</h3>
          <p>후보일 뿐이에요. 회상·병행 장면처럼 의도한 구성일 수 있으니, 맞는지 작가가 확인해 주세요.</p>
          <ul>
            {timeline.candidates.map((item) => (
              <li key={item.id}>
                <strong>{CANDIDATE_LABEL[item.code] ?? item.code}</strong>
                <span>{` — ${item.messageKo}`}</span>
                {onOpenEpisode && item.episodeIds[0] ? (
                  <button type="button" onClick={() => onOpenEpisode(item.episodeIds[0] as string)}>
                    해당 회차 열기
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>기록된 회차 사이에서는 역행·겹침 후보가 없어요.</p>
      )}

      {timeline.ignoredLocationRefCount > 0 || timeline.ignoredTagCount > 0 ? (
        <p>
          {`바이블에 없는 장소를 가리킨 태그 ${timeline.ignoredLocationRefCount}건`}
          {timeline.ignoredTagCount > 0 ? `, 없는 회차의 태그 ${timeline.ignoredTagCount}건` : ""}
          은 뺐어요.
        </p>
      ) : null}
    </section>
  );
}
