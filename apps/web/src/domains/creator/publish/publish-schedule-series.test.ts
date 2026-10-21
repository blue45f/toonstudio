import { describe, expect, it } from "vitest";

import type { SeriesDetail, WorkSummary } from "@/platform/creator-client";

import { publishScheduleEpisodeOptions } from "./publish-schedule-series";

function work(partial: Partial<WorkSummary> & { readonly id: string }): WorkSummary {
  return {
    title: partial.id,
    description: "줄거리 요약",
    cover: "https://example.invalid/cover.png",
    tags: [],
    format: "upload",
    pagesCount: 24,
    titleId: null,
    status: "draft",
    author: { id: "author-1", name: "작가", avatar: "" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    episodeNo: null,
    ...partial,
  };
}

function series(episodeList: readonly WorkSummary[]): SeriesDetail {
  return {
    id: "series-1",
    title: "연재작",
    description: "",
    cover: "",
    tags: [],
    status: "ongoing",
    showcaseEnabled: false,
    author: { id: "author-1", name: "작가", avatar: "" },
    episodes: episodeList.length,
    views: 0,
    likes: 0,
    latestEpisodeAt: null,
    isOwner: true,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    episodeList: [...episodeList],
  };
}

describe("publishScheduleEpisodeOptions (예약 발행 회차 어댑터)", () => {
  it("게시된 회차는 제외하고 회차 번호 순으로 정렬한다", () => {
    const options = publishScheduleEpisodeOptions(series([
      work({ id: "ep-3", episodeNo: 3, title: "3화" }),
      work({ id: "ep-1", episodeNo: 1, title: "1화", status: "published" }),
      work({ id: "ep-2", episodeNo: 2, title: "2화" }),
    ]));
    expect(options.map((option) => option.id)).toEqual(["ep-2", "ep-3"]);
    expect(options.map((option) => option.episodeNumber)).toEqual([2, 3]);
  });

  it("서버 필드를 선택지 필드로 옮기고 빈 설명은 시놉시스로 쓰지 않는다", () => {
    const [option] = publishScheduleEpisodeOptions(series([
      work({ id: "ep-9", episodeNo: 9, description: "  ", cover: "", pagesCount: undefined }),
    ]));
    expect(option).toMatchObject({
      id: "ep-9",
      episodeNumber: 9,
      synopsis: null,
      pageCount: 0,
      ready: false,
      hasThumbnail: false,
    });
  });

  it("페이지가 있는 초안 회차는 준비된 것으로, 표지가 있으면 썸네일이 있는 것으로 본다", () => {
    const [option] = publishScheduleEpisodeOptions(series([
      work({ id: "ep-4", episodeNo: 4, pagesCount: 12 }),
    ]));
    expect(option?.ready).toBe(true);
    expect(option?.hasThumbnail).toBe(true);
    expect(option?.synopsis).toBe("줄거리 요약");
  });

  it("회차 번호가 없으면 서버 순서를 유지하고 위치 기반 번호를 붙인다", () => {
    const options = publishScheduleEpisodeOptions(series([
      work({ id: "ep-b", createdAt: "2026-10-02T00:00:00.000Z" }),
      work({ id: "ep-a", createdAt: "2026-10-01T00:00:00.000Z" }),
    ]));
    expect(options.map((option) => option.id)).toEqual(["ep-a", "ep-b"]);
    expect(options.map((option) => option.episodeNumber)).toEqual([1, 2]);
  });

  it("회차가 없으면 빈 목록을 돌려준다 (섹션 빈 상태가 이를 표시한다)", () => {
    expect(publishScheduleEpisodeOptions(series([]))).toEqual([]);
  });
});
