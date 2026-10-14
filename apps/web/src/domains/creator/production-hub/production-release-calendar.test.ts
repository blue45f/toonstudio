import { describe, expect, it } from "vitest";

import {
  calendarDaysUntil,
  planReleaseDeadlines,
  upcomingMonthlyReleaseDates,
  upcomingWeeklyReleaseDates,
} from "./production-release-calendar";

/** 로컬 시각 기준 날짜 생성 — 실행 시간대와 무관하게 달력 날짜를 고정한다. */
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function hm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

describe("연재 일정 달력 (date-fns 신규 코드)", () => {
  describe("주간 연재 게시일", () => {
    it("월말을 넘어 다음 달로 이어진다 (수 1/28 기준, 금요 연재)", () => {
      const dates = upcomingWeeklyReleaseDates({
        anchor: local(2026, 1, 28, 15, 0),
        weekday: 5,
        count: 3,
      });
      expect(dates.map(ymd)).toEqual(["2026-01-30", "2026-02-06", "2026-02-13"]);
    });

    it("anchor가 연재 요일 당일이면 시각과 무관하게 그날이 첫 게시일이다", () => {
      const dates = upcomingWeeklyReleaseDates({
        anchor: local(2026, 1, 30, 23, 59),
        weekday: 5,
        count: 2,
      });
      expect(dates.map(ymd)).toEqual(["2026-01-30", "2026-02-06"]);
      expect(dates.map(hm)).toEqual(["23:59", "23:59"]);
    });

    it("anchor가 연재 요일 다음 날이면 다음 주 게시일부터 시작한다", () => {
      const dates = upcomingWeeklyReleaseDates({
        anchor: local(2026, 1, 31, 9, 0),
        weekday: 5,
        count: 1,
      });
      expect(dates.map(ymd)).toEqual(["2026-02-06"]);
    });

    it("격주 연재는 2주 간격으로 건너뛴다", () => {
      const dates = upcomingWeeklyReleaseDates({
        anchor: local(2026, 1, 28),
        weekday: 5,
        count: 3,
        intervalWeeks: 2,
      });
      expect(dates.map(ymd)).toEqual(["2026-01-30", "2026-02-13", "2026-02-27"]);
    });

    it("count가 0이면 빈 배열이다", () => {
      expect(upcomingWeeklyReleaseDates({ anchor: local(2026, 1, 28), weekday: 5, count: 0 }))
        .toEqual([]);
    });
  });

  describe("월간 연재 게시일 — 월말 경계", () => {
    it("31일 연재는 2월에 28일로 당겨지고 3월에 31일로 돌아온다 (2026, 평년)", () => {
      const dates = upcomingMonthlyReleaseDates({
        start: local(2026, 1, 15, 18, 0),
        dayOfMonth: 31,
        count: 4,
      });
      expect(dates.map(ymd)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
      expect(dates.map(hm)).toEqual(["18:00", "18:00", "18:00", "18:00"]);
    });

    it("윤년 2월은 29일로 당겨진다 (2024)", () => {
      const dates = upcomingMonthlyReleaseDates({
        start: local(2024, 1, 15),
        dayOfMonth: 31,
        count: 3,
      });
      expect(dates.map(ymd)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
    });

    it("30일 연재도 2월에는 월말(28일)로 당겨진다", () => {
      const dates = upcomingMonthlyReleaseDates({
        start: local(2026, 1, 20),
        dayOfMonth: 30,
        count: 2,
      });
      expect(dates.map(ymd)).toEqual(["2026-01-30", "2026-02-28"]);
    });

    it("시작일이 그 달 게시일보다 늦으면 다음 달부터 시작한다", () => {
      const dates = upcomingMonthlyReleaseDates({
        start: local(2026, 2, 1),
        dayOfMonth: 31,
        count: 2,
      });
      expect(dates.map(ymd)).toEqual(["2026-02-28", "2026-03-31"]);
    });

    it("시작일이 게시 당일이면 그날이 포함된다", () => {
      const dates = upcomingMonthlyReleaseDates({
        start: local(2026, 1, 31, 23, 30),
        dayOfMonth: 31,
        count: 1,
      });
      expect(dates.map(ymd)).toEqual(["2026-01-31"]);
    });
  });

  describe("게시일 기준 마감 역산", () => {
    it("공정별 마감이 게시 시각을 보존하며 역산되고 마감순으로 정렬된다", () => {
      const deadlines = planReleaseDeadlines(local(2026, 10, 21, 18, 0), [
        { processKey: "publication", daysBeforeRelease: 0 },
        { processKey: "story", daysBeforeRelease: 14 },
        { processKey: "line-art", daysBeforeRelease: 7 },
      ]);
      expect(deadlines.map((deadline) => deadline.processKey))
        .toEqual(["story", "line-art", "publication"]);
      expect(deadlines.map((deadline) => ymd(deadline.dueAt)))
        .toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);
      expect(deadlines.map((deadline) => hm(deadline.dueAt)))
        .toEqual(["18:00", "18:00", "18:00"]);
    });

    it("월말 경계를 거슬러 역산한다 (3/2 게시, 2일 전 마감 → 2/28)", () => {
      const [deadline] = planReleaseDeadlines(local(2026, 3, 2, 18, 0), [
        { processKey: "lettering", daysBeforeRelease: 2 },
      ]);
      expect(ymd(deadline!.dueAt)).toBe("2026-02-28");
      expect(hm(deadline!.dueAt)).toBe("18:00");
    });

    it("윤년 2월 말로 역산한다 (2024/3/1 게시, 1일 전 → 2/29)", () => {
      const [deadline] = planReleaseDeadlines(local(2024, 3, 1, 18, 0), [
        { processKey: "joint-proof", daysBeforeRelease: 1 },
      ]);
      expect(ymd(deadline!.dueAt)).toBe("2024-02-29");
    });

    it("연말 경계를 거슬러 역산한다 (1/1 게시, 1일 전 → 전년도 12/31)", () => {
      const [deadline] = planReleaseDeadlines(local(2027, 1, 1, 18, 0), [
        { processKey: "joint-proof", daysBeforeRelease: 1 },
      ]);
      expect(ymd(deadline!.dueAt)).toBe("2026-12-31");
    });

    it("서머타임 시작 경계에서도 마감 시각(시:분)이 밀리지 않는다", () => {
      // 미국 시간대에서는 2026-03-08 새벽에 시계가 1시간 앞당겨진다.
      // 전이 당일 12:00에서 1일을 ms 단위로 빼면 11:00으로 밀리지만(실측 확인),
      // 달력 감산은 12:00을 보존한다. DST가 없는 시간대에서도 같은 단언이
      // 성립한다(로컬 생성자 사용).
      const [deadline] = planReleaseDeadlines(local(2026, 3, 8, 12, 0), [
        { processKey: "color", daysBeforeRelease: 1 },
      ]);
      expect(ymd(deadline!.dueAt)).toBe("2026-03-07");
      expect(hm(deadline!.dueAt)).toBe("12:00");
    });
  });

  describe("D-day — 시간대(자정) 경계", () => {
    it("자정을 넘으면 1시간 뒤라도 1일이다", () => {
      expect(calendarDaysUntil(local(2026, 10, 15, 0, 30), local(2026, 10, 14, 23, 30))).toBe(1);
    });

    it("47시간 뒤라도 자정을 한 번만 넘으면 1일이다 (ms/DAY_MS 올림은 2일로 센다)", () => {
      expect(calendarDaysUntil(local(2026, 10, 15, 23, 30), local(2026, 10, 14, 0, 30))).toBe(1);
    });

    it("같은 달력 날짜면 0, 지난 날짜면 음수다", () => {
      expect(calendarDaysUntil(local(2026, 10, 14, 23, 59), local(2026, 10, 14, 0, 1))).toBe(0);
      expect(calendarDaysUntil(local(2026, 10, 13, 12, 0), local(2026, 10, 14, 12, 0))).toBe(-1);
    });

    it("월말 경계를 넘어도 달력 날짜 차이 그대로다 (1/31 23:00 → 2/1 01:00 = 1일)", () => {
      expect(calendarDaysUntil(local(2026, 2, 1, 1, 0), local(2026, 1, 31, 23, 0))).toBe(1);
    });
  });
});
