import { describe, expect, it } from "vitest";

import {
  auditSeriesTimelineCanon,
  buildCharacterLifecycleTrace,
  canonicalizeCanonLedgerJson,
  civilDateToEpochDay,
  classifySeasonCalendarCompatibility,
  computeExactAgeYears,
  daysInGregorianMonth,
  escapeTimelineXml,
  inferExpectedSeasonForMonth,
  isGregorianLeapYear,
  parseWorldDateIso,
  renderSeriesTimelineCanonSvg,
  sha256CanonLedgerHex,
  summarizeSeriesTimelineCanonKo,
  type CharacterCanonSpec,
  type EpisodeTimelineEvent,
  type ForeshadowThreadSpec,
  type SeriesTimelineCanonAuditResult,
  type SeriesTimelineCanonInput,
} from "./index";

const CHAR_DOYUN: CharacterCanonSpec = {
  characterId: "char-doyun", nameKo: "서도윤", birthYear: 2000, birthMonth: 5, birthDay: 15,
  initialLocationId: "seoul-gangnam", roleKo: "주인공",
};
const CHAR_HAEIN: CharacterCanonSpec = {
  characterId: "char-haein", nameKo: "윤해인", birthYear: 2000, birthMonth: 2, birthDay: 29,
  initialLocationId: "busan-haeundae", roleKo: "수사 파트너",
};
const CHAR_MENTOR: CharacterCanonSpec = {
  characterId: "char-mentor", nameKo: "한태산", birthYear: 1972, birthMonth: 11, birthDay: 3,
  initialLocationId: "seoul-jongno", roleKo: "스승",
};

function mkEvent(
  eventId: string, episodeNumber: number, worldDateIso: string,
  extra: Partial<EpisodeTimelineEvent> = {},
): EpisodeTimelineEvent {
  return {
    eventId, episodeNumber, sceneIndex: 1, worldDateIso,
    locationId: "seoul-gangnam", presentCharacterIds: ["char-doyun"], ...extra,
  };
}

function mkThread(
  threadId: string, titleKo: string, setupEventId: string, setupEpisode: number,
  payoffEventIds: readonly string[], extra: Partial<ForeshadowThreadSpec> = {},
): ForeshadowThreadSpec {
  return {
    threadId, titleKo, setupEventId, setupEpisode, payoffEventIds, importance: "main-arc", ...extra,
  };
}

function makeCleanSeriesInput(
  overrides: Partial<SeriesTimelineCanonInput> = {},
): SeriesTimelineCanonInput {
  return {
    seriesId: "series-chronicle-01",
    seriesTitleKo: "시간선 수사록",
    currentEpisodeNumber: 12,
    characters: [CHAR_DOYUN, CHAR_HAEIN, CHAR_MENTOR],
    events: [
      mkEvent("ev-ep01-s1", 1, "2025-05-14", {
        titleKo: "서울 봄 사건 발단", hemisphere: "north", depictedSeason: "spring",
        depictedAges: { "char-doyun": 24 }, presentCharacterIds: ["char-doyun", "char-mentor"],
        causesEventIds: ["ev-ep10-s1"],
      }),
      mkEvent("ev-ep10-s1", 10, "2025-05-15", {
        titleKo: "생일 당일 단서 확보", hemisphere: "north", depictedSeason: "spring",
        depictedAges: { "char-doyun": 25 },
      }),
    ],
    foreshadowThreads: [
      mkThread("fs-watch", "깨진 회중시계 각인", "ev-ep01-s1", 1, ["ev-ep10-s1"], {
        targetPayoffDeadlineEpisode: 20,
      }),
    ],
    ...overrides,
  };
}

function auditEvents(
  events: readonly EpisodeTimelineEvent[],
  overrides: Partial<SeriesTimelineCanonInput> = {},
): SeriesTimelineCanonAuditResult {
  return auditSeriesTimelineCanon(makeCleanSeriesInput({ events, foreshadowThreads: [], ...overrides }));
}

describe("Wave 139 — 윤년·생일 전후 만 나이 및 반구별 달력 계절 정합성", () => {
  it("일반 생일 하루 전·당일·하루 뒤 만 나이를 오차 없이 계산한다", () => {
    expect(computeExactAgeYears(CHAR_DOYUN, "2025-05-14")).toBe(24);
    expect(computeExactAgeYears(CHAR_DOYUN, "2025-05-15")).toBe(25);
    expect(computeExactAgeYears(CHAR_DOYUN, "2025-05-16")).toBe(25);
  });

  it("윤년 2월 29일 출생자의 평년(2월 28일 vs 3월 1일)과 윤년(2월 28일 vs 2월 29일) 만 나이를 정확히 계산한다", () => {
    expect(computeExactAgeYears(CHAR_HAEIN, "2023-02-28")).toBe(22);
    expect(computeExactAgeYears(CHAR_HAEIN, "2023-03-01")).toBe(23);
    expect(computeExactAgeYears(CHAR_HAEIN, "2024-02-28")).toBe(23);
    expect(computeExactAgeYears(CHAR_HAEIN, "2024-02-29")).toBe(24);
  });

  it("400년 윤년·100년 평년 규칙과 출생 전 음수 만 나이를 검증한다", () => {
    expect(isGregorianLeapYear(2000)).toBe(true);
    expect(isGregorianLeapYear(1900)).toBe(false);
    expect(isGregorianLeapYear(2024)).toBe(true);
    expect(daysInGregorianMonth(2024, 2)).toBe(29);
    expect(daysInGregorianMonth(2025, 2)).toBe(28);
    expect(civilDateToEpochDay(1970, 1, 1)).toBe(0);
    expect(civilDateToEpochDay(2024, 3, 1) - civilDateToEpochDay(2024, 2, 29)).toBe(1);
    expect(computeExactAgeYears(CHAR_DOYUN, "1999-05-15")).toBe(-1);
  });

  it("존재하지 않는 달력 날짜와 형식 오류를 거부하고 감사기에서 invalid-world-date 차단으로 잡는다", () => {
    expect(parseWorldDateIso("2023-02-29")).toBeNull();
    expect(parseWorldDateIso("2024-04-31")).toBeNull();
    expect(parseWorldDateIso("2024/05/01")).toBeNull();
    expect(() => computeExactAgeYears(CHAR_DOYUN, "2023-02-29")).toThrow();

    const audit = auditEvents([mkEvent("ev-bad-date", 3, "2025-02-29")]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["invalid-world-date"]).toBe(1);
  });

  it("북반구 12개월 기상 계절 매핑이 정확하다", () => {
    expect(inferExpectedSeasonForMonth(1, "north")).toBe("winter");
    expect(inferExpectedSeasonForMonth(4, "north")).toBe("spring");
    expect(inferExpectedSeasonForMonth(7, "north")).toBe("summer");
    expect(inferExpectedSeasonForMonth(10, "north")).toBe("autumn");
    expect(inferExpectedSeasonForMonth(12, "north")).toBe("winter");
  });

  it("남반구 12개월 반전 계절 매핑이 정확하다", () => {
    expect(inferExpectedSeasonForMonth(1, "south")).toBe("summer");
    expect(inferExpectedSeasonForMonth(4, "south")).toBe("autumn");
    expect(inferExpectedSeasonForMonth(7, "south")).toBe("winter");
    expect(inferExpectedSeasonForMonth(10, "south")).toBe("spring");
  });

  it("북반구 1월 여름·벚꽃(봄) 및 7월 겨울 묘사를 season-calendar-contradiction 차단으로 적발한다", () => {
    expect(classifySeasonCalendarCompatibility(1, "north", "summer").kind).toBe("opposite-season");
    expect(classifySeasonCalendarCompatibility(1, "north", "spring").kind).toBe(
      "peak-month-season-mismatch",
    );
    const audit = auditEvents([
      mkEvent("ev-jan-summer", 15, "2026-01-15", { hemisphere: "north", depictedSeason: "summer" }),
      mkEvent("ev-jan-cherry", 16, "2026-01-20", { hemisphere: "north", depictedSeason: "spring" }),
      mkEvent("ev-jul-winter", 17, "2026-07-10", { hemisphere: "north", depictedSeason: "winter" }),
    ]);
    expect(audit.issueCountsByCode["season-calendar-contradiction"]).toBe(3);
    expect(audit.blockerCount).toBe(3);
  });

  it("남반구 시드니 1월 여름·7월 겨울은 통과하고, 7월 여름 묘사는 모순으로 차단한다", () => {
    const cleanSouth = auditEvents(
      [
        mkEvent("ev-syd-jan", 20, "2026-01-10", { locationId: "sydney-cbd", depictedSeason: "summer" }),
        mkEvent("ev-syd-jul", 21, "2026-07-18", { locationId: "sydney-cbd", depictedSeason: "winter" }),
      ],
      { locations: [{ locationId: "sydney-cbd", nameKo: "시드니 도심", hemisphere: "south" }] },
    );
    expect(cleanSouth.verdict).toBe("clean");

    const badSouth = auditEvents([
      mkEvent("ev-syd-bad", 22, "2026-07-18", {
        locationId: "sydney-cbd",
        hemisphere: "south",
        depictedSeason: "summer",
      }),
    ]);
    expect(badSouth.verdict).toBe("blocked");
    expect(badSouth.issueCountsByCode["season-calendar-contradiction"]).toBe(1);
  });
});

describe("Wave 139 — 캐릭터 나이 오기 및 생사·회상·부활 상태 머신", () => {
  it("본편 씬 대사/자막 표기 나이와 만 나이가 다르면 character-age-mismatch를 차단한다", () => {
    const audit = auditEvents([
      mkEvent("ev-age-bug", 5, "2025-05-14", { sceneIndex: 2, depictedAges: { "char-doyun": 25 } }),
    ]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["character-age-mismatch"]).toBe(1);
    expect(audit.issues[0].subCode).toBe("age-value-diff");
  });

  it("회상 씬에서도 회상 시점 날짜 기준 만 나이를 정확히 대조한다", () => {
    const okFb = auditEvents([
      mkEvent("ev-fb-ok", 30, "2012-03-01", {
        isFlashback: true,
        locationId: "busan-haeundae",
        depictedAges: { "char-haein": 12 },
        presentCharacterIds: ["char-haein"],
      }),
    ]);
    expect(okFb.verdict).toBe("clean");

    const badFb = auditEvents([
      mkEvent("ev-fb-bad", 30, "2011-02-28", {
        sceneIndex: 2,
        isFlashback: true,
        locationId: "busan-haeundae",
        depictedAges: { "char-haein": 11 },
        presentCharacterIds: ["char-haein"],
      }),
    ]);
    expect(badFb.verdict).toBe("blocked");
    expect(badFb.issueCountsByCode["character-age-mismatch"]).toBe(1);
  });

  it("출생 이전 날짜의 비꿈 씬 생존 등장을 pre-birth-appearance로 차단한다", () => {
    const audit = auditEvents([mkEvent("ev-prebirth", 40, "1998-08-01", { isFlashback: true })]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issues[0].code).toBe("character-age-mismatch");
    expect(audit.issues[0].subCode).toBe("pre-birth-appearance");
  });

  it("사망 이후 정식 부활 없이 비회상 씬에 재등장하면 deceased-character-non-flashback 차단으로 적발한다", () => {
    const audit = auditEvents([
      mkEvent("ev-death", 50, "2026-06-10", {
        sceneIndex: 4,
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
        stateTransitions: [{ characterId: "char-mentor", kind: "death" }],
      }),
      mkEvent("ev-ghost", 62, "2026-07-01", { presentCharacterIds: ["char-mentor", "char-doyun"] }),
    ]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["deceased-character-non-flashback"]).toBe(1);
    expect(audit.issues[0].relatedEventIds).toEqual(["ev-death", "ev-ghost"]);
  });

  it("사망 후 회상 씬(과거 시점 및 회상 플래그 씬) 재등장은 정상 허용한다", () => {
    const audit = auditEvents([
      mkEvent("ev-death", 50, "2026-06-10", {
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
        stateTransitions: [{ characterId: "char-mentor", kind: "death" }],
      }),
      mkEvent("ev-fb-past", 63, "2018-04-02", {
        isFlashback: true,
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
      }),
      mkEvent("ev-fb-after", 64, "2026-06-15", {
        isFlashback: true,
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
      }),
    ]);
    expect(audit.verdict).toBe("clean");
    expect(audit.issueCountsByCode["deceased-character-non-flashback"]).toBe(0);
  });

  it("사망 후 꿈·대체세계(isDreamOrAlternate) 씬 재등장은 정상 허용한다", () => {
    const audit = auditEvents([
      mkEvent("ev-death", 50, "2026-06-10", {
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
        stateTransitions: [{ characterId: "char-mentor", kind: "death" }],
      }),
      mkEvent("ev-dream", 55, "2026-08-01", {
        isDreamOrAlternate: true,
        presentCharacterIds: ["char-mentor"],
      }),
    ]);
    expect(audit.verdict).toBe("clean");
  });

  it("사망 후 정식 부활(revival-canonical)을 거치면 이후 비회상 씬 재등장을 정상 통과시킨다", () => {
    const audit = auditEvents([
      mkEvent("ev-death", 50, "2026-06-10", {
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
        stateTransitions: [{ characterId: "char-mentor", kind: "death" }],
      }),
      mkEvent("ev-revive", 70, "2026-09-01", {
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
        stateTransitions: [{ characterId: "char-mentor", kind: "revival-canonical" }],
      }),
      mkEvent("ev-after-revive", 75, "2026-09-12", {
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
      }),
    ]);
    expect(audit.verdict).toBe("clean");
    const mentorTrace = audit.characterTraces.find((t) => t.characterId === "char-mentor");
    expect(mentorTrace?.finalLifeStatus).toBe("alive");
    expect(mentorTrace?.revivalEventIds).toEqual(["ev-revive"]);
  });

  it("회상 씬에서 밝혀진 과거 사망 사건도 정사 상태에 반영돼 현시점 비회상 등장을 차단하고 영구 부상·기억 상실을 기록한다", () => {
    const audit = auditEvents([
      mkEvent("ev-present-illegal", 12, "2026-05-01", {
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor", "char-doyun"],
        stateTransitions: [
          { characterId: "char-doyun", kind: "injury-permanent", noteKo: "왼손 흉터" },
          { characterId: "char-doyun", kind: "memory-loss" },
        ],
      }),
      mkEvent("ev-fb-death-reveal", 45, "2021-10-05", {
        isFlashback: true,
        locationId: "seoul-jongno",
        presentCharacterIds: ["char-mentor"],
        stateTransitions: [{ characterId: "char-mentor", kind: "death" }],
      }),
    ]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["deceased-character-non-flashback"]).toBe(1);
    const doyunTrace = audit.characterTraces.find((t) => t.characterId === "char-doyun");
    expect(doyunTrace?.permanentInjuryNotesKo).toEqual(["12화: 왼손 흉터"]);
    expect(doyunTrace?.memoryLossEventIds).toEqual(["ev-present-illegal"]);
  });
});

describe("Wave 139 — 인과 연대기 역전 및 순환 그래프(Tarjan SCC)", () => {
  it("회상 과거 사건이 본편 현재 사건을 유발하는 정상 인과 체인은 통과한다", () => {
    const audit = auditEvents([
      mkEvent("ev-cause-past", 35, "2019-03-10", { isFlashback: true, causesEventIds: ["ev-mid"] }),
      mkEvent("ev-mid", 5, "2025-05-10", { causesEventIds: ["ev-final"] }),
      mkEvent("ev-final", 40, "2025-05-20"),
    ]);
    expect(audit.verdict).toBe("clean");
    expect(audit.issueCountsByCode["causal-chronology-inversion"]).toBe(0);
  });

  it("결과 이벤트의 세계관 날짜가 원인보다 이르면 causal-chronology-inversion 차단으로 적발한다", () => {
    const audit = auditEvents([
      mkEvent("ev-cause-late", 12, "2026-04-20", { causesEventIds: ["ev-effect-early"] }),
      mkEvent("ev-effect-early", 13, "2026-04-10"),
    ]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["causal-chronology-inversion"]).toBe(1);
    expect(audit.issues[0].subCode).toBe("effect-before-cause-date");
  });

  it("동일 날짜 3-노드 인과 순환(A → B → C → A)을 Tarjan SCC로 차단한다", () => {
    const audit = auditEvents([
      mkEvent("ev-a", 10, "2026-05-01", { sceneIndex: 1, causesEventIds: ["ev-b"] }),
      mkEvent("ev-b", 10, "2026-05-01", { sceneIndex: 2, causesEventIds: ["ev-c"] }),
      mkEvent("ev-c", 10, "2026-05-01", { sceneIndex: 3, causesEventIds: ["ev-a"] }),
    ]);
    expect(audit.verdict).toBe("blocked");
    const cycleIssue = audit.issues.find((iss) => iss.subCode === "causal-cycle");
    expect(cycleIssue?.code).toBe("causal-chronology-inversion");
    expect(cycleIssue?.relatedEventIds).toEqual(["ev-a", "ev-b", "ev-c"]);
  });

  it("자기 자신을 유발하는 인과 루프(A → A)를 causal-cycle로 차단한다", () => {
    const audit = auditEvents([mkEvent("ev-self", 8, "2026-03-10", { causesEventIds: ["ev-self"] })]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issues[0].code).toBe("causal-chronology-inversion");
    expect(audit.issues[0].subCode).toBe("causal-cycle");
  });

  it("미등록 causesEventIds 대상 참조 시 unknown-reference 경고를 생성한다", () => {
    const audit = auditEvents([mkEvent("ev-orphan", 9, "2026-03-11", { causesEventIds: ["ev-missing"] })]);
    expect(audit.verdict).toBe("needs-review");
    expect(audit.issueCountsByCode["unknown-reference"]).toBe(1);
  });
});

describe("Wave 139 — 동시 원거리 텔레포트 및 물리적 이동 일수 검증", () => {
  it("같은 날 이동 기록 없이 서로 다른 지역에 동시 등장하면 simultaneous-location-teleport로 차단한다", () => {
    const audit = auditEvents([
      mkEvent("ev-seoul", 20, "2026-04-01", { sceneIndex: 1, locationId: "seoul-gangnam" }),
      mkEvent("ev-london", 20, "2026-04-01", { sceneIndex: 2, locationId: "london-westminster" }),
    ]);
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["simultaneous-location-teleport"]).toBe(1);
    expect(audit.issues[0].subCode).toBe("same-day-different-location");
  });

  it("transitLinks 최소 이동 일수(5일)에 못 미치는 2일 차 이동은 travel 표기가 있어도 차단한다", () => {
    const audit = auditEvents(
      [
        mkEvent("ev-cap", 30, "2026-05-01", {
          locationId: "empire-capital",
          stateTransitions: [
            { characterId: "char-doyun", kind: "travel", targetLocationId: "north-fortress" },
          ],
        }),
        mkEvent("ev-fort", 31, "2026-05-03", { locationId: "north-fortress" }),
      ],
      { transitLinks: [{ fromLocationId: "empire-capital", toLocationId: "north-fortress", minTransitDays: 5 }] },
    );
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["simultaneous-location-teleport"]).toBe(1);
    expect(audit.issues[0].subCode).toBe("transit-days-insufficient");
  });

  it("transitLinks 최소 이동 일수(5일)를 충족하면 정상 통과한다", () => {
    const audit = auditEvents(
      [
        mkEvent("ev-cap", 30, "2026-05-01", { locationId: "empire-capital" }),
        mkEvent("ev-fort", 32, "2026-05-06", { locationId: "north-fortress" }),
      ],
      { transitLinks: [{ fromLocationId: "empire-capital", toLocationId: "north-fortress", minTransitDays: 5 }] },
    );
    expect(audit.verdict).toBe("clean");
  });

  it("같은 regionCluster 내 당일 이동은 허용하고 서로 다른 regionCluster 당일 이동은 차단한다", () => {
    const locations = [
      { locationId: "seoul-gangnam", nameKo: "강남", regionCluster: "kr-seoul" },
      { locationId: "seoul-jongno", nameKo: "종로", regionCluster: "kr-seoul" },
      { locationId: "paris-louvre", nameKo: "파리", regionCluster: "fr-paris" },
    ];
    const sameCluster = auditEvents(
      [
        mkEvent("ev-gn", 5, "2026-05-10", { sceneIndex: 1, locationId: "seoul-gangnam" }),
        mkEvent("ev-jn", 5, "2026-05-10", { sceneIndex: 2, locationId: "seoul-jongno" }),
      ],
      { locations },
    );
    expect(sameCluster.verdict).toBe("clean");

    const crossCluster = auditEvents(
      [
        mkEvent("ev-gn2", 6, "2026-05-11", { sceneIndex: 1, locationId: "seoul-gangnam" }),
        mkEvent("ev-par", 6, "2026-05-11", { sceneIndex: 2, locationId: "paris-louvre" }),
      ],
      { locations },
    );
    expect(crossCluster.verdict).toBe("blocked");
    expect(crossCluster.issueCountsByCode["simultaneous-location-teleport"]).toBe(1);
  });

  it("꿈·대체세계 씬은 원거리 텔레포트 검사에서 오탐하지 않는다", () => {
    const audit = auditEvents([
      mkEvent("ev-real", 12, "2026-05-10", { sceneIndex: 1, locationId: "seoul-gangnam" }),
      mkEvent("ev-dream-mars", 12, "2026-05-10", {
        sceneIndex: 2,
        isDreamOrAlternate: true,
        locationId: "mars-crater",
      }),
    ]);
    expect(audit.verdict).toBe("clean");
  });
});

describe("Wave 139 — 복선 회수(Chekhov's Gun) 원장 및 선행 회수 탐지", () => {
  it("마감 화차 내 회수된 main-arc 복선은 통과하고 회수 화차 간격(spanEpisodes)을 산출한다", () => {
    const audit = auditSeriesTimelineCanon(makeCleanSeriesInput());
    expect(audit.verdict).toBe("clean");
    expect(audit.foreshadowSummary.paidOffCount).toBe(1);
    expect(audit.foreshadowSummary.payoffRateRatio).toBe(1);
    expect(audit.foreshadowSummary.entries[0].spanEpisodes).toBe(9);
  });

  it("마감 화차를 넘긴 미회수 main-arc 복선을 unpaid-foreshadow-chekhov-gun 차단으로 적발한다", () => {
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        currentEpisodeNumber: 110,
        foreshadowThreads: [
          mkThread("fs-missed", "지하실 봉인 열쇠의 행방", "ev-ep01-s1", 1, [], {
            targetPayoffDeadlineEpisode: 100,
          }),
        ],
      }),
    );
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["unpaid-foreshadow-chekhov-gun"]).toBe(1);
    expect(audit.issues[0].severity).toBe("blocker");
    expect(audit.foreshadowSummary.overdueUnpaidCount).toBe(1);
    expect(audit.foreshadowSummary.payoffRateRatio).toBe(0);
  });

  it("마감 화차 초과 미회수 복선의 심각도를 subplot(warning)·easter-egg(info)로 차등 분류한다", () => {
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        currentEpisodeNumber: 90,
        foreshadowThreads: [
          mkThread("fs-sub", "조연의 옛 약혼 반지", "ev-ep01-s1", 1, [], {
            importance: "subplot",
            targetPayoffDeadlineEpisode: 50,
          }),
          mkThread("fs-egg", "카페 칠판 속 전작 카메오", "ev-ep01-s1", 1, [], {
            importance: "easter-egg",
            targetPayoffDeadlineEpisode: 50,
          }),
        ],
      }),
    );
    expect(audit.verdict).toBe("needs-review");
    expect(audit.blockerCount).toBe(0);
    expect(audit.warningCount).toBe(1);
    expect(audit.infoCount).toBe(1);
  });

  it("속편 보류(intentionallyOpenForSequel) 복선은 정상 통과하고 회수율 모수에서 제외한다", () => {
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        currentEpisodeNumber: 200,
        seriesCompleted: true,
        foreshadowThreads: [
          mkThread("fs-paid", "깨진 회중시계 각인", "ev-ep01-s1", 1, ["ev-ep10-s1"], {
            targetPayoffDeadlineEpisode: 20,
          }),
          mkThread("fs-sequel", "시즌2 흑막 조직 문양", "ev-ep10-s1", 10, [], {
            targetPayoffDeadlineEpisode: 100,
            intentionallyOpenForSequel: true,
          }),
        ],
      }),
    );
    expect(audit.verdict).toBe("clean");
    expect(audit.foreshadowSummary.intentionallyOpenSequelCount).toBe(1);
    expect(audit.foreshadowSummary.payoffRateRatio).toBe(1);
    expect(audit.foreshadowSummary.remainingThreads.map((t) => t.threadId)).toEqual(["fs-sequel"]);
  });

  it("회수 이벤트 날짜가 설치 이벤트 날짜보다 과거이면 payoff-before-setup 차단으로 적발한다", () => {
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        foreshadowThreads: [mkThread("fs-reverse", "역전된 암호 쪽지", "ev-ep10-s1", 10, ["ev-ep01-s1"])],
      }),
    );
    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["payoff-before-setup"]).toBe(1);
    expect(audit.foreshadowSummary.invalidChronologyCount).toBe(1);
  });

  it("작품 완결(seriesCompleted) 상태에서 마감 미지정 미회수 main-arc 복선을 차단한다", () => {
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        currentEpisodeNumber: 150,
        seriesCompleted: true,
        foreshadowThreads: [mkThread("fs-end-open", "최종 보스의 진짜 이름", "ev-ep01-s1", 1, [])],
      }),
    );
    expect(audit.verdict).toBe("blocked");
    expect(audit.issues[0].code).toBe("unpaid-foreshadow-chekhov-gun");
    expect(audit.issues[0].subCode).toBe("series-completed-unpaid");
  });
});

describe("Wave 139 — 생애 궤적·SHA-256 결정론·순수 OKLCH SVG·한국어 PD 보고서", () => {
  it("buildCharacterLifecycleTrace가 장기 연재 캐릭터의 생애 포인트·회상·사망/부활을 정확히 집계한다", () => {
    const trace = buildCharacterLifecycleTrace(CHAR_DOYUN, [
      mkEvent("e-200", 200, "2028-06-01", {
        depictedAges: { "char-doyun": 28 },
        stateTransitions: [{ characterId: "char-doyun", kind: "revival-canonical" }],
      }),
      mkEvent("e-120", 120, "2027-01-10", {
        sceneIndex: 3,
        stateTransitions: [{ characterId: "char-doyun", kind: "death" }],
      }),
      mkEvent("e-150-fb", 150, "2010-05-15", { isFlashback: true }),
    ]);
    expect(trace.totalAppearances).toBe(3);
    expect(trace.flashbackAppearances).toBe(1);
    expect(trace.firstAppearanceEpisode).toBe(120);
    expect(trace.lastAppearanceEpisode).toBe(200);
    expect(trace.finalLifeStatus).toBe("alive");
    expect(trace.points.map((p) => p.eventId)).toEqual(["e-150-fb", "e-120", "e-200"]);
    expect(trace.points[0].exactAgeYears).toBe(10);
    expect(trace.points[1].lifeStatusAfter).toBe("deceased");
    expect(trace.points[2].lifeStatusAfter).toBe("alive");
  });

  it("FIPS 180-4 SHA-256 표준 벡터가 일치하고 입력 배열 순서를 뒤섞어도 원장 해시가 완전히 동일하다", () => {
    expect(sha256CanonLedgerHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256CanonLedgerHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(canonicalizeCanonLedgerJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');

    const forward = auditSeriesTimelineCanon(makeCleanSeriesInput());
    const shuffled = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        characters: [CHAR_MENTOR, CHAR_HAEIN, CHAR_DOYUN],
        events: makeCleanSeriesInput().events.slice().reverse(),
      }),
    );
    expect(forward.canonLedgerSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(forward.canonLedgerSha256Hex).toBe(shuffled.canonLedgerSha256Hex);
  });

  it("renderSeriesTimelineCanonSvg 라이트·다크 테마가 순수 oklch() 색상만 쓰고 NaN/Infinity가 0건이다", () => {
    const base = makeCleanSeriesInput();
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        currentEpisodeNumber: 80,
        events: [
          ...base.events,
          mkEvent("ev-fb-30", 30, "2020-04-10", {
            isFlashback: true,
            presentCharacterIds: ["char-doyun", "char-mentor"],
          }),
          mkEvent("ev-winter-bug", 75, "2026-01-15", { hemisphere: "north", depictedSeason: "summer" }),
        ],
        foreshadowThreads: [
          ...base.foreshadowThreads,
          mkThread("fs-overdue", "미회수 금고 비밀번호", "ev-ep01-s1", 1, [], {
            targetPayoffDeadlineEpisode: 60,
          }),
        ],
      }),
    );

    const rawHexPattern = /#[0-9a-f]{3,8}\b/i;
    const rawFuncPattern = /\b(?:rgb|rgba|hsl|hsla)\s*\(/i;
    for (const theme of ["light", "dark"] as const) {
      const svg = renderSeriesTimelineCanonSvg(audit, { theme });
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).toContain('stroke-dasharray="4 3"');
      expect(svg).toContain("data-foreshadow-arc=");
      expect(svg).toContain("data-warning-pin=");
      expect(rawHexPattern.test(svg)).toBe(false);
      expect(rawFuncPattern.test(svg)).toBe(false);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    }
  });

  it("XSS 페이로드가 포함된 작품명·캐릭터명·복선명을 SVG 출력에서 완전히 XML 이스케이프한다", () => {
    const xss = `<script>alert("xss")</script>&'`;
    expect(escapeTimelineXml(xss)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&apos;",
    );
    const audit = auditSeriesTimelineCanon(
      makeCleanSeriesInput({
        seriesTitleKo: `작품 ${xss}`,
        characters: [{ ...CHAR_DOYUN, nameKo: `도윤 ${xss}` }],
        foreshadowThreads: [mkThread("fs-xss", `복선 ${xss}`, "ev-ep01-s1", 1, ["ev-ep10-s1"])],
      }),
    );
    const svg = renderSeriesTimelineCanonSvg(audit, { title: `제목 ${xss}` });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("summarizeSeriesTimelineCanonKo가 3단계 판정과 자연스러운 한국어 스토리 PD 보고서를 생성한다", () => {
    const cleanReport = summarizeSeriesTimelineCanonKo(
      auditSeriesTimelineCanon(makeCleanSeriesInput()),
    );
    expect(cleanReport.verdict).toBe("clean");
    expect(cleanReport.verdictLabelKo).toBe("검수 통과");
    expect(cleanReport.fullTextKo).toContain("정본 원장 SHA-256:");
    expect(cleanReport.fullTextKo).not.toMatch(/하는 것을 가능하게|직관적인 경험을 제공|원활한 워크플로우/);

    const blockedReport = summarizeSeriesTimelineCanonKo(
      auditSeriesTimelineCanon(
        makeCleanSeriesInput({
          currentEpisodeNumber: 120,
          foreshadowThreads: [
            mkThread("fs-block", "핵심 범인 정체", "ev-ep01-s1", 1, [], {
              targetPayoffDeadlineEpisode: 100,
            }),
          ],
        }),
      ),
    );
    expect(blockedReport.verdict).toBe("blocked");
    expect(blockedReport.verdictLabelKo).toBe("연재 차단");
    expect(blockedReport.actionChecklistKo[0]).toContain("[차단]");
  });

  it("180화 규모 장편 복합 시나리오에서 6대 설정 붕괴를 한 번에 누락 없이 탐지한다", () => {
    const audit = auditSeriesTimelineCanon({
      seriesId: "series-epic-180",
      seriesTitleKo: "백팔십 화의 연대기",
      currentEpisodeNumber: 180,
      characters: [CHAR_DOYUN, CHAR_HAEIN, CHAR_MENTOR],
      events: [
        mkEvent("ep001", 1, "2024-02-28", {
          hemisphere: "north",
          depictedSeason: "winter",
          depictedAges: { "char-haein": 24 },
          presentCharacterIds: ["char-haein", "char-mentor"],
          stateTransitions: [{ characterId: "char-mentor", kind: "death" }],
          causesEventIds: ["ep050"],
        }),
        mkEvent("ep050", 50, "2024-01-15", { hemisphere: "north", depictedSeason: "summer" }),
        mkEvent("ep120-a", 120, "2026-05-20", { presentCharacterIds: ["char-doyun", "char-mentor"] }),
        mkEvent("ep120-b", 120, "2026-05-20", { sceneIndex: 2, locationId: "newyork-manhattan" }),
      ],
      foreshadowThreads: [
        mkThread("fs-overdue-main", "왕가의 잃어버린 인장", "ep001", 1, [], {
          targetPayoffDeadlineEpisode: 150,
        }),
        mkThread("fs-reverse-payoff", "예언서 찢긴 페이지", "ep120-a", 120, ["ep050"]),
      ],
    });

    expect(audit.verdict).toBe("blocked");
    expect(audit.issueCountsByCode["character-age-mismatch"]).toBe(1);
    expect(audit.issueCountsByCode["deceased-character-non-flashback"]).toBe(1);
    expect(audit.issueCountsByCode["season-calendar-contradiction"]).toBe(1);
    expect(audit.issueCountsByCode["causal-chronology-inversion"]).toBe(1);
    expect(audit.issueCountsByCode["simultaneous-location-teleport"]).toBe(1);
    expect(audit.issueCountsByCode["unpaid-foreshadow-chekhov-gun"]).toBe(1);
    expect(audit.issueCountsByCode["payoff-before-setup"]).toBe(1);
  });
});
