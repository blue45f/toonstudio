import { describe, expect, it } from "vitest";

import type { StudioStoryLocation } from "../studio-story-bible";
import {
  buildEpisodeContinuityTimeline,
  continuityTimelineSummaryLine,
  timelineDayLabel,
  type ContinuityEpisodeRef,
  type EpisodeTimePlaceTag,
} from "./studio-episode-continuity-timeline";

const LOCATIONS: readonly StudioStoryLocation[] = [
  { id: "school", name: "학교" },
  { id: "home", name: "집" },
  { id: "station", name: "역" },
];

const EPISODES: readonly ContinuityEpisodeRef[] = [
  { episodeId: "ep1", episodeNumber: 1, title: "시작" },
  { episodeId: "ep2", episodeNumber: 2, title: "전학" },
  // ep3 은 태그가 없다 → 미기록 빈칸이어야 한다.
  { episodeId: "ep3", episodeNumber: 3, title: "축제 준비" },
  { episodeId: "ep4", episodeNumber: 4, title: "축제" },
  { episodeId: "ep5", episodeNumber: 5, title: "뒷풀이" },
];

function tag(
  episodeId: string,
  storyDayStart: number | null,
  storyDayEnd: number | null,
  locationIds: readonly string[] = [],
  timeLabel: string | null = null,
): EpisodeTimePlaceTag {
  return { episodeId, storyDayStart, storyDayEnd, locationIds, timeLabel };
}

describe("buildEpisodeContinuityTimeline", () => {
  it("회차를 번호순으로 정렬하고 미기록 회차는 빈칸으로 정직하게 둔다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      [...EPISODES].reverse(),
      [tag("ep1", 1, 1, ["school"]), tag("ep2", 2, 3, ["school", "home"])],
      LOCATIONS,
    );
    expect(timeline.entries.map((entry) => entry.episodeNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(timeline.recordedCount).toBe(2);
    expect(timeline.unrecordedCount).toBe(3);
    const ep3 = timeline.entries.find((entry) => entry.episodeId === "ep3");
    expect(ep3?.recorded).toBe(false);
    expect(ep3?.storyDayStart).toBeNull();
    expect(timelineDayLabel(ep3!)).toBeNull();
    expect(continuityTimelineSummaryLine(timeline)).toContain("3화는 미기록이라 빈칸으로 뒀어요");
    expect(timeline.candidates).toEqual([]);
  });

  it("시작만 있는 태그는 그날 하루로 보고, 끝만 있는 태그는 미기록으로 둔다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 4, null), tag("ep2", null, 5)],
      LOCATIONS,
    );
    const ep1 = timeline.entries.find((entry) => entry.episodeId === "ep1");
    expect(ep1?.recorded).toBe(true);
    expect(timelineDayLabel(ep1!)).toBe("4일차");
    expect(timeline.entries.find((entry) => entry.episodeId === "ep2")?.recorded).toBe(false);
  });

  it("다음 회차 시작이 앞 회차 시작보다 이르면 역행 후보를 올린다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 5, 5), tag("ep2", 3, 3)],
      LOCATIONS,
    );
    expect(timeline.candidates.map((item) => item.code)).toEqual(["time-regression"]);
    expect(timeline.candidates[0]?.messageKo).toContain("회상 장면인지 확인해 주세요");
  });

  it("구간이 겹치면 겹침 후보를, 경계가 맞닿으면 후보를 올리지 않는다", () => {
    const overlap = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 1, 3), tag("ep2", 2, 4)],
      LOCATIONS,
    );
    expect(overlap.candidates.map((item) => item.code)).toEqual(["time-overlap"]);
    const touching = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 1, 2), tag("ep2", 2, 3)],
      LOCATIONS,
    );
    expect(touching.candidates).toEqual([]);
  });

  it("겹치는 시간에 장소가 전혀 겹치지 않으면 동시간·다른 장소 후보를 함께 올린다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 1, 2, ["school"]), tag("ep2", 1, 2, ["station"])],
      LOCATIONS,
    );
    expect(timeline.candidates.map((item) => item.code)).toEqual(["time-overlap", "parallel-place"]);
    expect(timeline.candidates[1]?.messageKo).toContain("학교");
    expect(timeline.candidates[1]?.messageKo).toContain("역");
  });

  it("미기록 회차를 사이에 두고도 기록된 회차끼리 비교하되 그 사실을 숨기지 않는다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep2", 4, 4), tag("ep4", 2, 2)],
      LOCATIONS,
    );
    expect(timeline.candidates.map((item) => item.code)).toEqual(["time-regression"]);
    expect(timeline.candidates[0]?.episodeNumbers).toEqual([2, 4]);
    expect(timeline.candidates[0]?.messageKo).toContain("앞선 기록 회차 2화");
  });

  it("끝이 시작보다 이른 태그는 invalid-range 로 태그 자체를 지적하고 구간 비교에서 제외한다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 3, 1), tag("ep2", 2, 2)],
      LOCATIONS,
    );
    expect(timeline.candidates.map((item) => item.code)).toEqual(["invalid-range"]);
    expect(timeline.candidates[0]?.episodeIds).toEqual(["ep1"]);
  });

  it("모르는 장소·회차 참조는 버리되 개수를 드러낸다", () => {
    const timeline = buildEpisodeContinuityTimeline(
      EPISODES,
      [tag("ep1", 1, 1, ["school", "moon"]), tag("ep99", 1, 1, ["school"])],
      LOCATIONS,
    );
    const ep1 = timeline.entries.find((entry) => entry.episodeId === "ep1");
    expect(ep1?.locationIds).toEqual(["school"]);
    expect(ep1?.locationNames).toEqual(["학교"]);
    expect(timeline.ignoredLocationRefCount).toBe(1);
    expect(timeline.ignoredTagCount).toBe(1);
  });

  it("태그가 전혀 없으면 전부 미기록인 타임라인과 후보 0건을 반환한다", () => {
    const timeline = buildEpisodeContinuityTimeline(EPISODES, [], LOCATIONS);
    expect(timeline.recordedCount).toBe(0);
    expect(timeline.unrecordedCount).toBe(5);
    expect(timeline.candidates).toEqual([]);
    expect(continuityTimelineSummaryLine(timeline)).toContain("역행·겹침 후보는 없어요");
  });

  it("후보 id 는 결정적이라 같은 입력에서 중복이 생기지 않는다", () => {
    const tags = [tag("ep1", 1, 3), tag("ep2", 2, 4)];
    const first = buildEpisodeContinuityTimeline(EPISODES, tags, LOCATIONS);
    const second = buildEpisodeContinuityTimeline(EPISODES, tags, LOCATIONS);
    expect(first.candidates.map((item) => item.id)).toEqual(
      second.candidates.map((item) => item.id),
    );
    expect(new Set(first.candidates.map((item) => item.id)).size).toBe(first.candidates.length);
  });
});
