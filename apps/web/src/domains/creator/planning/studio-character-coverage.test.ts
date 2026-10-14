import { describe, expect, it } from "vitest";

import type { StudioCharacterContinuityState, StudioStoryCharacter } from "../studio-story-bible";
import {
  appearancesFromContinuityStates,
  buildCharacterCoverage,
  coverageGapAlerts,
  lastAppearanceBefore,
  lastAppearanceSummaryLine,
  type CharacterAppearanceRecord,
  type CoverageEpisodeRef,
} from "./studio-character-coverage";

const CHARACTERS: readonly StudioStoryCharacter[] = [
  { id: "hero", name: "해나", aliases: [], defaultCostumeId: "school", defaultAppearanceId: null },
  { id: "friend", name: "민서", aliases: [], defaultCostumeId: "casual", defaultAppearanceId: null },
  { id: "rival", name: "태오", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
];

const EPISODES: readonly CoverageEpisodeRef[] = [
  { episodeId: "ep1", episodeNumber: 1, title: "시작" },
  { episodeId: "ep2", episodeNumber: 2, title: "전학" },
  { episodeId: "ep3", episodeNumber: 3, title: "축제" },
  // ep4 는 어떤 캐릭터 기록도 없다 → 미기록(unknown) 열이어야 한다.
  { episodeId: "ep4", episodeNumber: 4, title: "방과후" },
  { episodeId: "ep5", episodeNumber: 5, title: "대결" },
];

const APPEARANCES: readonly CharacterAppearanceRecord[] = [
  { episodeId: "ep1", characterId: "hero", costumeId: "school", appearanceId: null, expression: "미소", cutCount: 10 },
  { episodeId: "ep2", characterId: "hero", costumeId: "school", appearanceId: null, expression: "당황", cutCount: 8 },
  { episodeId: "ep5", characterId: "hero", costumeId: "gym", appearanceId: null, expression: "분노", cutCount: 12 },
  { episodeId: "ep1", characterId: "friend", costumeId: "casual", appearanceId: null, expression: "미소", cutCount: 4 },
  { episodeId: "ep2", characterId: "friend", costumeId: null, appearanceId: null, expression: null, cutCount: 3 },
  // 모르는 캐릭터/회차 — 버려지되 ignoredRecordCount 로 드러나야 한다.
  { episodeId: "ep1", characterId: "ghost", costumeId: null, appearanceId: null, expression: null, cutCount: 1 },
  { episodeId: "ep99", characterId: "hero", costumeId: null, appearanceId: null, expression: null, cutCount: 1 },
];

describe("buildCharacterCoverage", () => {
  const coverage = buildCharacterCoverage(CHARACTERS, EPISODES, APPEARANCES);
  const hero = coverage.rows.find((row) => row.characterId === "hero")!;
  const friend = coverage.rows.find((row) => row.characterId === "friend")!;
  const rival = coverage.rows.find((row) => row.characterId === "rival")!;

  it("집계: 등장 회차·컷 합계·첫/마지막 회차", () => {
    expect(hero.appearedEpisodeCount).toBe(3);
    expect(hero.totalCuts).toBe(30);
    expect(hero.firstEpisodeNumber).toBe(1);
    expect(hero.lastEpisodeNumber).toBe(5);
    expect(friend.appearedEpisodeCount).toBe(2);
  });

  it("미기록 회차는 absent 가 아니라 unknown 이다", () => {
    // 이 픽스처에서 기록이 있는 회차는 ep1·ep2·ep5 뿐이다.
    expect(coverage.episodes.find((e) => e.episodeId === "ep4")?.hasAnyRecord).toBe(false);
    expect(coverage.episodes.find((e) => e.episodeId === "ep3")?.hasAnyRecord).toBe(false);
    expect(hero.cells.find((c) => c.episodeId === "ep4")?.state).toBe("unknown");
    expect(hero.cells.find((c) => c.episodeId === "ep3")?.state).toBe("unknown");
    // 기록이 있는 회차에서 안 나온 것은 absent.
    expect(friend.cells.find((c) => c.episodeId === "ep5")?.state).toBe("absent");
    expect(rival.cells.find((c) => c.episodeId === "ep1")?.state).toBe("absent");
  });

  it("모르는 id 기록은 버려지고 개수가 드러난다", () => {
    expect(coverage.ignoredRecordCount).toBe(2);
  });

  it("마지막 등장 요약: 기록된 의상·표정만, 기본 의상으로 채우지 않는다", () => {
    expect(hero.lastAppearance?.episodeNumber).toBe(5);
    expect(hero.lastAppearance?.costumeId).toBe("gym");
    expect(hero.lastAppearance?.expression).toBe("분노");
    expect(hero.lastAppearance?.episodesAgo).toBe(0);
    // friend 의 ep2 기록은 의상이 null → 요약도 null 유지 (기본 casual 로 위조 금지).
    expect(friend.lastAppearance?.episodeNumber).toBe(2);
    expect(friend.lastAppearance?.costumeId).toBeNull();
    expect(friend.lastAppearance?.episodesAgo).toBe(1);
  });

  it("공백 계산: currentGap 은 미기록 회차를 세지 않는다", () => {
    // friend 마지막 등장 ep2, 이후 기록 있는 회차는 ep5 뿐 = 1회차 (ep3·ep4 미기록 제외).
    expect(friend.currentGap).toBe(1);
    expect(friend.lastAppearance?.episodesAgo).toBe(1);
    expect(hero.currentGap).toBe(0);
    expect(hero.longestGap).toBe(0); // 기록 있는 회차에서는 빠진 적이 없다
    expect(rival.neverAppeared).toBe(true);
    expect(rival.currentGap).toBeNull();
    expect(rival.lastAppearance).toBeNull();
  });

  it("빈도: 의상·표정 많은 순, null 은 세지 않는다", () => {
    expect(hero.costumeFrequency[0]).toEqual({ label: "school", count: 2 });
    expect(hero.expressionFrequency.map((e) => e.label)).toContain("미소");
    expect(friend.costumeFrequency).toEqual([{ label: "casual", count: 1 }]);
  });

  it("같은 회차 중복 기록: 컷 합산, 의상·표정은 마지막 기록", () => {
    const dup = buildCharacterCoverage(CHARACTERS, EPISODES, [
      { episodeId: "ep1", characterId: "hero", costumeId: "school", appearanceId: null, expression: "미소", cutCount: 3 },
      { episodeId: "ep1", characterId: "hero", costumeId: "party", appearanceId: null, expression: "웃음", cutCount: 2 },
    ]);
    const cell = dup.rows[0]?.cells.find((c) => c.episodeId === "ep1");
    expect(cell?.cutCount).toBe(5);
    expect(cell?.costumeId).toBe("party");
    expect(cell?.expression).toBe("웃음");
  });

  it("기록이 전혀 없으면 latestRecordedEpisodeNumber 는 null 이다", () => {
    const empty = buildCharacterCoverage(CHARACTERS, EPISODES, []);
    expect(empty.latestRecordedEpisodeNumber).toBeNull();
    expect(empty.rows.every((row) => row.neverAppeared)).toBe(true);
    expect(empty.rows[0]?.cells.every((cell) => cell.state === "unknown")).toBe(true);
  });
});

describe("lastAppearanceBefore (재등장 판정)", () => {
  const coverage = buildCharacterCoverage(CHARACTERS, EPISODES, APPEARANCES);

  it("기준 회차 전의 마지막 등장과 간격을 준다", () => {
    const before = lastAppearanceBefore(coverage, "hero", 5);
    expect(before?.episodeNumber).toBe(2);
    expect(before?.costumeId).toBe("school");
    expect(before?.gapEpisodes).toBe(3);
  });

  it("기준 회차 자체 등장은 세지 않고, 이전 등장이 없으면 null", () => {
    expect(lastAppearanceBefore(coverage, "hero", 1)).toBeNull();
    expect(lastAppearanceBefore(coverage, "rival", 5)).toBeNull();
    expect(lastAppearanceBefore(coverage, "nobody", 5)).toBeNull();
  });

  it("요약 한 줄: 회차·제목·의상 라벨·표정·컷·몇 회차 전", () => {
    const before = lastAppearanceBefore(coverage, "hero", 5)!;
    const line = lastAppearanceSummaryLine(before, { costumeLabels: { school: "교복" } });
    expect(line).toContain("2화");
    expect(line).toContain("전학");
    expect(line).toContain("의상 교복");
    expect(line).toContain("대표 표정 당황");
    expect(line).toContain("8컷");
    expect(line).toContain("3회차 전");
  });

  it("의상 기록이 없으면 '의상 기록 없음'으로 정직하게 말한다", () => {
    const summary = buildCharacterCoverage(CHARACTERS, EPISODES, APPEARANCES)
      .rows.find((row) => row.characterId === "friend")!.lastAppearance!;
    expect(lastAppearanceSummaryLine(summary)).toContain("의상 기록 없음");
    expect(lastAppearanceSummaryLine(summary)).toContain("표정 기록 없음");
  });
});

describe("coverageGapAlerts", () => {
  it("임계값 이상 공백과 미등장을 분리한다", () => {
    const episodes: CoverageEpisodeRef[] = Array.from({ length: 8 }, (_, i) => ({
      episodeId: `e${i + 1}`,
      episodeNumber: i + 1,
      title: `${i + 1}화`,
    }));
    const appearances: CharacterAppearanceRecord[] = [
      { episodeId: "e1", characterId: "hero", costumeId: "school", appearanceId: null, expression: null, cutCount: 5 },
      ...episodes.map((ep) => ({
        episodeId: ep.episodeId,
        characterId: "friend",
        costumeId: "casual",
        appearanceId: null,
        expression: null,
        cutCount: 1,
      })),
    ];
    const coverage = buildCharacterCoverage(CHARACTERS, episodes, appearances);
    const alerts = coverageGapAlerts(coverage, 5);
    expect(alerts.longAbsent.map((row) => row.characterId)).toEqual(["hero"]);
    expect(alerts.neverAppeared.map((row) => row.characterId)).toEqual(["rival"]);
  });
});

describe("appearancesFromContinuityStates", () => {
  const states: readonly StudioCharacterContinuityState[] = [
    { sceneId: "s1", sequence: 1, characterId: "hero", costumeId: "school", appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
    { sceneId: "s2", sequence: 2, characterId: "hero", costumeId: "gym", appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
    { sceneId: "sX", sequence: 3, characterId: "hero", costumeId: "gym", appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
  ];

  it("장면을 회차로 접고, 의상은 마지막 sequence, 매핑 없는 장면은 skipped", () => {
    const { records, skipped } = appearancesFromContinuityStates(states, { s1: "ep1", s2: "ep1" });
    expect(skipped).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]?.cutCount).toBe(2);
    expect(records[0]?.costumeId).toBe("gym");
    expect(records[0]?.expression).toBeNull();
  });
});
