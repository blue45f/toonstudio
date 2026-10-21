// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PublishSchedulePanel } from "./PublishSchedulePanel";
import type { PublishScheduleEpisodeOption } from "./PublishScheduleDialog";
import { publishScheduleStore } from "./publish-schedule-store";

const EPISODES: readonly PublishScheduleEpisodeOption[] = [
  {
    id: "ep-1",
    episodeNumber: 1,
    title: "프롤로그",
    synopsis: "시작",
    pageCount: 24,
    ready: true,
    hasThumbnail: true,
  },
];

beforeEach(() => {
  publishScheduleStore.resetForTests();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  publishScheduleStore.resetForTests();
  window.localStorage.clear();
});

function futureDateKey(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("PublishSchedulePanel", () => {
  it("예약이 없으면 빈 상태를 표시한다", () => {
    render(<PublishSchedulePanel seriesId="series-1" seriesTitle="연재작" episodes={EPISODES} />);
    expect(screen.getByText("다가오는 예약")).toBeTruthy();
    expect(screen.getByText("예약된 발행이 없어요.")).toBeTruthy();
  });

  it("스토어에 저장된 예약을 다가오는 예약 목록에 표시한다 (충돌 검사·상태를 거친 실제 저장 경로)", () => {
    const created = publishScheduleStore.createReservation({
      seriesId: "series-1",
      episodeId: "ep-1",
      episodeTitle: "1화 프롤로그",
      date: futureDateKey(3),
      time: "18:00",
      timeZone: "Asia/Seoul",
    });
    expect(created.ok).toBe(true);

    render(<PublishSchedulePanel seriesId="series-1" seriesTitle="연재작" episodes={EPISODES} />);
    // 캘린더 셀과 다가오는 예약 목록 양쪽에 제목이 뜰 수 있어 복수 매치를 허용한다.
    expect(screen.getAllByText("1화 프롤로그").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("예약됨").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("예약된 발행이 없어요.")).toBeNull();
  });

  it("다른 시리즈의 예약은 이 시리즈 패널에 섞이지 않는다", () => {
    const created = publishScheduleStore.createReservation({
      seriesId: "series-other",
      episodeId: "ep-1",
      episodeTitle: "1화 프롤로그",
      date: futureDateKey(3),
      time: "18:00",
      timeZone: "Asia/Seoul",
    });
    expect(created.ok).toBe(true);

    render(<PublishSchedulePanel seriesId="series-1" episodes={EPISODES} />);
    expect(screen.getByText("예약된 발행이 없어요.")).toBeTruthy();
  });
});
