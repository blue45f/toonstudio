import { describe, expect, it } from "vitest";

import type {
  EpisodeCollaboration,
  ProductionProjectAggregate,
  ProductionTask,
} from "@toonstudio/core/production";

import {
  computeCadenceOccurrences,
  normalizePublishScheduleCadence,
} from "../publish/studio-publish-schedule-model";
import {
  calendarDaysUntil,
  planReleaseDeadlines,
  upcomingWeeklyReleaseDates,
} from "./production-release-calendar";
import { buildStageDeadlinePlan } from "./production-stage-deadline-plan";

/**
 * 세 일정 모델 수렴 판정 고정 테스트 (2026-10-22 실측 대조, rem-item2-calendar).
 *
 * 대상: production-release-calendar(RC) ↔ studio-publish-schedule-model의
 * 케이던스(PS) ↔ production-stage-deadline-plan(SDP).
 *
 * 판정 요약 — 겉보기 중복이지만 의미가 갈리는 지점이 있어 함수 재배선은
 * 하지 않았다. 이 파일은 그 판정의 근거를 실행 가능한 단언으로 고정한다:
 * - 일치 구간: DST 전이가 없는 창에서의 마감 역산, 단일 요일·매주 케이던스.
 * - 차이 고정: 게시일 포함 경계(RC 포함 vs PS 엄격히 이후), 격주 패리티
 *   (RC는 anchor 주 기준, PS는 격주 개념 없음), 복수 요일 표현력(PS만),
 *   D-day(RC 달력일 1 vs SDP ceil 2), 역산 산술(RC 달력 감산·시각 보존 vs
 *   SDP ms 정확 감산 — 파이프라인 dueAt 정합 유지가 목적).
 * 어느 한쪽을 다른 쪽으로 교체하면 아래 차이 고정 단언 중 하나가 깨진다.
 */

/** 로컬 시각 기준 날짜 생성 — 실행 시간대와 무관하게 달력 날짜를 고정한다. */
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function episode(partial: Partial<EpisodeCollaboration> = {}): EpisodeCollaboration {
  return {
    episodeId: "ep-5",
    state: "final-art-production",
    plannedReleaseAt: null,
    storyLockApproved: false,
    thumbnailLockApproved: false,
    jointProofApproved: false,
    creditPreflightPassed: false,
    publicationPreflightPassed: false,
    ...partial,
  } as EpisodeCollaboration;
}

function aggregateWithRelease(plannedReleaseAt: string): ProductionProjectAggregate {
  return {
    projectId: "project-1",
    tasks: [] as readonly ProductionTask[],
    episodes: [episode({ plannedReleaseAt })],
  } as unknown as ProductionProjectAggregate;
}

describe("일정 모델 수렴 — 일치 구간 (교체해도 같은 결과가 되는 범위)", () => {
  it("마감 역산: DST 전이가 없는 1월 창에서는 RC 달력 감산과 SDP 권장 마감이 같은 시각이다", () => {
    const releaseAt = local(2026, 1, 21, 18, 0);
    const [storyDeadline] = planReleaseDeadlines(releaseAt, [
      { processKey: "story", daysBeforeRelease: 14 },
    ]);
    const plan = buildStageDeadlinePlan(
      aggregateWithRelease(releaseAt.toISOString()),
      "ep-5",
      local(2026, 1, 7, 18, 0),
    );
    const story = plan!.stages.find((stage) => stage.processKey === "story")!;
    expect(story.recommendedDueAt).toBe(storyDeadline!.dueAt.toISOString());
  });

  it("주간 케이던스: 단일 요일·매주에서는 RC 주간 게시일과 PS 발생 시각의 날짜가 같다", () => {
    const rcDates = upcomingWeeklyReleaseDates({
      anchor: local(2026, 1, 28, 18, 0),
      weekday: 4,
      count: 3,
    }).map(ymd);
    const cadence = normalizePublishScheduleCadence({
      timesPerWeek: 1,
      weekdays: [4],
      timeOfDay: "18:00",
      timeZone: LOCAL_TIME_ZONE,
    });
    expect(cadence).not.toBeNull();
    const psDates = computeCadenceOccurrences(
      cadence!,
      local(2026, 1, 27, 0, 0),
      3,
    ).map((iso) => ymd(new Date(iso)));
    expect(psDates).toEqual(rcDates);
    expect(rcDates).toEqual(["2026-01-29", "2026-02-05", "2026-02-12"]);
  });
});

describe("일정 모델 수렴 — 차이 고정 (교체하면 깨지는 의미)", () => {
  it("포함 경계: RC는 anchor 당일을 포함하고 PS는 기준 시각과 같은 발생을 제외한다", () => {
    const anchor = local(2026, 1, 30, 23, 59); // 금요일
    const rcFirst = upcomingWeeklyReleaseDates({ anchor, weekday: 5, count: 1 });
    expect(ymd(rcFirst[0]!)).toBe("2026-01-30");

    const cadence = normalizePublishScheduleCadence({
      timesPerWeek: 1,
      weekdays: [5],
      timeOfDay: "23:59",
      timeZone: LOCAL_TIME_ZONE,
    });
    const psFirst = computeCadenceOccurrences(cadence!, anchor, 1);
    expect(ymd(new Date(psFirst[0]!))).toBe("2026-02-06");
  });

  it("격주 패리티: RC 격주는 anchor가 속한 주를 기준으로 건너뛰고 PS에는 격주가 없다", () => {
    // anchor(토)가 연재 요일(금) 다음 날이면 RC는 이번 주 금요일에서 2주를 더한다.
    const rcDates = upcomingWeeklyReleaseDates({
      anchor: local(2026, 1, 31, 9, 0),
      weekday: 5,
      count: 2,
      intervalWeeks: 2,
    }).map(ymd);
    expect(rcDates).toEqual(["2026-02-13", "2026-02-27"]);

    // PS는 매주 발생만 만들므로 첫 발생부터 RC와 갈린다(격주 필터로도 패리티가 안 맞는다).
    const cadence = normalizePublishScheduleCadence({
      timesPerWeek: 1,
      weekdays: [5],
      timeOfDay: "09:00",
      timeZone: LOCAL_TIME_ZONE,
    });
    const psFirst = computeCadenceOccurrences(cadence!, local(2026, 1, 31, 9, 0), 1);
    expect(ymd(new Date(psFirst[0]!))).toBe("2026-02-06");
  });

  it("복수 요일: PS는 주 2회(월·목)를 한 패턴으로 표현하지만 RC는 단일 요일만 받는다", () => {
    const cadence = normalizePublishScheduleCadence({
      timesPerWeek: 2,
      weekdays: [1, 4],
      timeOfDay: "18:00",
      timeZone: LOCAL_TIME_ZONE,
    });
    const psDates = computeCadenceOccurrences(
      cadence!,
      local(2026, 1, 28, 0, 0),
      3,
    ).map((iso) => ymd(new Date(iso)));
    expect(psDates).toEqual(["2026-01-29", "2026-02-02", "2026-02-05"]);

    const rcDates = upcomingWeeklyReleaseDates({
      anchor: local(2026, 1, 28, 18, 0),
      weekday: 4,
      count: 3,
    }).map(ymd);
    expect(rcDates).toEqual(["2026-01-29", "2026-02-05", "2026-02-12"]);
  });

  it("D-day: 자정을 한 번 넘긴 47시간 뒤는 RC 달력일로 1일, SDP ceil로는 2일이다", () => {
    const now = local(2026, 10, 14, 0, 30);
    const target = local(2026, 10, 15, 23, 30);
    expect(calendarDaysUntil(target, now)).toBe(1);

    const plan = buildStageDeadlinePlan(
      aggregateWithRelease(target.toISOString()),
      "ep-5",
      now,
    );
    expect(plan!.daysUntilRelease).toBe(2);
  });

  it("역산 산술: SDP 권장 마감은 게시 시각에서 ms 단위로 정확히 빼고, RC는 로컬 시각을 보존한다", () => {
    const releaseAt = local(2026, 3, 8, 12, 0);
    const plan = buildStageDeadlinePlan(
      aggregateWithRelease(releaseAt.toISOString()),
      "ep-5",
      local(2026, 2, 20, 12, 0),
    );
    const story = plan!.stages.find((stage) => stage.processKey === "story")!;
    // SDP: releaseMs − 14 * 86_400_000 과 정확히 같다(파이프라인 dueAt와 같은 산술).
    expect(story.recommendedDueAt).toBe(
      new Date(releaseAt.getTime() - 14 * 86_400_000).toISOString(),
    );

    // RC: 같은 입력でも 마감의 로컬 시각(12:00)이 보존된다 — DST 시간대에서는
    // 두 결과가 1시간 갈린다(production-release-calendar.test.ts의 DST 케이스).
    const [rcStory] = planReleaseDeadlines(releaseAt, [
      { processKey: "story", daysBeforeRelease: 14 },
    ]);
    expect(rcStory!.dueAt.getHours()).toBe(12);
    expect(rcStory!.dueAt.getMinutes()).toBe(0);
  });
});
