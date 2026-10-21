// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSeries, type SeriesDetail, type WorkSummary } from "@/platform/creator-client";

import { PublishScheduleSeriesSection } from "./PublishScheduleSeriesSection";
import { publishScheduleStore } from "./publish-schedule-store";

vi.mock("@/platform/creator-client", () => ({
  getSeries: vi.fn(),
}));

const getSeriesMock = vi.mocked(getSeries);

function work(partial: Partial<WorkSummary> & { readonly id: string }): WorkSummary {
  return {
    title: partial.id,
    description: "줄거리",
    cover: "cover.png",
    tags: [],
    format: "upload",
    pagesCount: 20,
    titleId: null,
    status: "draft",
    author: { id: "author-1", name: "작가", avatar: "" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    episodeNo: 1,
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

beforeEach(() => {
  getSeriesMock.mockReset();
  publishScheduleStore.resetForTests();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  publishScheduleStore.resetForTests();
  window.localStorage.clear();
});

describe("PublishScheduleSeriesSection (게시 명령 센터 예약 발행 배선)", () => {
  it("seriesId가 없으면 아무것도 그리지 않고 API도 부르지 않는다", () => {
    const { container } = render(<PublishScheduleSeriesSection seriesId={null} />);
    expect(container.firstChild).toBeNull();
    expect(getSeriesMock).not.toHaveBeenCalled();
  });

  it("로딩 뒤 패널과 localStorage 고지를 함께 표시한다", async () => {
    getSeriesMock.mockResolvedValue(series([work({ id: "ep-1" })]));
    render(<PublishScheduleSeriesSection seriesId="series-1" />);
    expect(screen.getByText("예약할 회차를 불러오는 중…")).toBeTruthy();
    expect(await screen.findByText(/이 브라우저에만 저장됩니다\(localStorage\)/)).toBeTruthy();
    expect(await screen.findByText("다가오는 예약")).toBeTruthy();
    expect(screen.getByText("예약된 발행이 없어요.")).toBeTruthy();
  });

  it("불러오기에 실패하면 오류와 재시도를 표시하고, 재시도로 복구한다", async () => {
    getSeriesMock.mockRejectedValueOnce(new Error("network"));
    getSeriesMock.mockResolvedValue(series([work({ id: "ep-1" })]));
    render(<PublishScheduleSeriesSection seriesId="series-1" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByText("다시 불러오기"));
    expect(await screen.findByText("다가오는 예약")).toBeTruthy();
    expect(getSeriesMock).toHaveBeenCalledTimes(2);
  });

  it("게시된 회차뿐이면 패널 대신 빈 상태를 표시한다", async () => {
    getSeriesMock.mockResolvedValue(series([work({ id: "ep-1", status: "published" })]));
    render(<PublishScheduleSeriesSection seriesId="series-1" />);
    expect(await screen.findByText(/예약할 수 있는 회차가 없어요/)).toBeTruthy();
    expect(screen.queryByText("다가오는 예약")).toBeNull();
  });
});
