import { describe, expect, it } from "vitest";

import type { StudioCharacterContinuityState, StudioStoryCharacter } from "../studio-story-bible";
import type {
  CharacterAppearanceRecord,
  CoverageEpisodeRef,
} from "./studio-character-coverage";
import {
  appearanceEpisodeLine,
  buildCharacterAppearanceLookup,
  sceneAppearancesFromContinuityStates,
  type AppearanceSceneRef,
  type CharacterSceneAppearanceRecord,
} from "./studio-character-appearance-lookup";

const HERO: StudioStoryCharacter = {
  id: "hero",
  name: "해나",
  aliases: [],
  defaultCostumeId: "school",
  defaultAppearanceId: null,
};
const FRIEND: StudioStoryCharacter = {
  id: "friend",
  name: "민서",
  aliases: [],
  defaultCostumeId: "casual",
  defaultAppearanceId: null,
};

const EPISODES: readonly CoverageEpisodeRef[] = [
  { episodeId: "ep1", episodeNumber: 1, title: "시작" },
  { episodeId: "ep2", episodeNumber: 2, title: "전학" },
  { episodeId: "ep3", episodeNumber: 3, title: "축제" },
  { episodeId: "ep5", episodeNumber: 5, title: "대결" },
];

// 회차 단위 기록 (커버리지 맵과 공유). hero: ep1·ep2·ep5, friend: ep1.
const EPISODE_RECORDS: readonly CharacterAppearanceRecord[] = [
  { episodeId: "ep1", characterId: "hero", costumeId: "school", appearanceId: null, expression: "미소", cutCount: 10 },
  { episodeId: "ep2", characterId: "hero", costumeId: "school", appearanceId: null, expression: "당황", cutCount: 8 },
  { episodeId: "ep5", characterId: "hero", costumeId: "gym", appearanceId: null, expression: "분노", cutCount: 12 },
  { episodeId: "ep1", characterId: "friend", costumeId: "casual", appearanceId: null, expression: "미소", cutCount: 4 },
  // 모르는 회차를 가리키는 hero 기록 — 버려지되 ignoredRecordCount 로 드러나야 한다.
  { episodeId: "ep99", characterId: "hero", costumeId: null, appearanceId: null, expression: null, cutCount: 1 },
];

// 씬 단위 기록. hero 는 ep1 에 씬 2개, ep5 에 씬 1개. ep2 는 씬 기록 없음.
const SCENE_RECORDS: readonly CharacterSceneAppearanceRecord[] = [
  { episodeId: "ep1", characterId: "hero", sceneId: "s2", costumeId: "school", appearanceId: null, expression: "미소", cutCount: 4 },
  { episodeId: "ep1", characterId: "hero", sceneId: "s1", costumeId: "school", appearanceId: null, expression: "당황", cutCount: 6 },
  { episodeId: "ep5", characterId: "hero", sceneId: "s9", costumeId: "gym", appearanceId: null, expression: "분노", cutCount: 12 },
  // 다른 캐릭터의 씬 기록 — hero 역조회에 섞이지도, ignored 로 세지도 않는다.
  { episodeId: "ep1", characterId: "friend", sceneId: "s1", costumeId: "casual", appearanceId: null, expression: "미소", cutCount: 3 },
  // 모르는 회차의 hero 씬 기록.
  { episodeId: "ep77", characterId: "hero", sceneId: "sx", costumeId: null, appearanceId: null, expression: null, cutCount: 1 },
];

const SCENE_REFS: readonly AppearanceSceneRef[] = [
  { sceneId: "s1", episodeId: "ep1", title: "교실 아침", sequence: 1 },
  { sceneId: "s2", episodeId: "ep1", title: "복도", sequence: 2 },
  // s9 는 제목·순서 미상.
];

describe("buildCharacterAppearanceLookup", () => {
  const lookup = buildCharacterAppearanceLookup(HERO, EPISODES, EPISODE_RECORDS, SCENE_RECORDS, SCENE_REFS);

  it("등장 회차는 최근 회차부터, 등장하지 않은 회차는 목록에 없다", () => {
    expect(lookup.episodes.map((entry) => entry.episodeNumber)).toEqual([5, 2, 1]);
    expect(lookup.totalEpisodes).toBe(3);
    expect(lookup.totalScenes).toBe(3);
  });

  it("컷 수는 이중계상하지 않는다 — 씬 기록이 있으면 씬 합, 없으면 회차 기록", () => {
    const ep1 = lookup.episodes.find((entry) => entry.episodeId === "ep1")!;
    const ep2 = lookup.episodes.find((entry) => entry.episodeId === "ep2")!;
    // ep1: 회차 기록은 10컷이지만 씬 합 6+4=10 — 우연히 같으므로 ep5 로도 확인.
    expect(ep1.cutSource).toBe("scenes");
    expect(ep1.cutCount).toBe(10);
    expect(ep2.cutSource).toBe("episode-record");
    expect(ep2.cutCount).toBe(8);
    expect(lookup.totalCuts).toBe(10 + 8 + 12);
  });

  it("씬 단위 기록이 없는 회차는 sceneDetail none 으로 구분하고 씬을 지어내지 않는다", () => {
    const ep2 = lookup.episodes.find((entry) => entry.episodeId === "ep2")!;
    expect(ep2.sceneDetail).toBe("none");
    expect(ep2.scenes).toEqual([]);
    expect(lookup.episodesWithSceneDetail).toBe(2);
  });

  it("씬은 순서 오름차순으로 정렬되고 제목·순서 메타가 붙는다", () => {
    const ep1 = lookup.episodes.find((entry) => entry.episodeId === "ep1")!;
    expect(ep1.scenes.map((scene) => scene.sceneId)).toEqual(["s1", "s2"]);
    expect(ep1.scenes[0]).toMatchObject({ title: "교실 아침", sequence: 1 });
  });

  it("메타가 없는 씬은 제목·순서가 null 그대로다 (지어내지 않음)", () => {
    const ep5 = lookup.episodes.find((entry) => entry.episodeId === "ep5")!;
    expect(ep5.scenes[0]).toMatchObject({ sceneId: "s9", title: null, sequence: null });
  });

  it("회차의 마지막 모습은 마지막 씬의 값, 씬이 없으면 회차 기록의 값", () => {
    const ep1 = lookup.episodes.find((entry) => entry.episodeId === "ep1")!;
    // 입력 순서로는 s2 가 먼저지만 순서(sequence) 기준 마지막 씬은 s2(2번) — 표정은 s2 의 "미소".
    expect(ep1.expression).toBe("미소");
    const ep2 = lookup.episodes.find((entry) => entry.episodeId === "ep2")!;
    expect(ep2.expression).toBe("당황");
    expect(ep2.costumeId).toBe("school");
  });

  it("모르는 회차 기록은 버리되 세어서 드러내고, 남의 기록은 세지 않는다", () => {
    // hero 기준 ignored: ep99 회차 기록 1건 + ep77 씬 기록 1건 = 2건.
    expect(lookup.ignoredRecordCount).toBe(2);
  });

  it("등장 기록이 전혀 없는 캐릭터는 빈 목록", () => {
    const empty = buildCharacterAppearanceLookup(FRIEND, EPISODES, [], [], []);
    expect(empty.totalEpisodes).toBe(0);
    expect(empty.episodes).toEqual([]);
    // friend 의 기록만으로 만든 역조회는 hero 기록을 무시한다.
    const friend = buildCharacterAppearanceLookup(FRIEND, EPISODES, EPISODE_RECORDS, SCENE_RECORDS, SCENE_REFS);
    expect(friend.episodes.map((entry) => entry.episodeId)).toEqual(["ep1"]);
    expect(friend.ignoredRecordCount).toBe(0);
  });

  it("같은 회차×씬 중복 기록은 컷 합산 + 마지막 기록의 모습", () => {
    const dup = buildCharacterAppearanceLookup(HERO, EPISODES, [], [
      { episodeId: "ep3", characterId: "hero", sceneId: "s1", costumeId: "a", appearanceId: null, expression: "미소", cutCount: 2 },
      { episodeId: "ep3", characterId: "hero", sceneId: "s1", costumeId: "b", appearanceId: null, expression: "분노", cutCount: 3 },
    ]);
    const ep3 = dup.episodes[0]!;
    expect(ep3.scenes).toHaveLength(1);
    expect(ep3.scenes[0]).toMatchObject({ cutCount: 5, costumeId: "b", expression: "분노" });
    // 씬만으로 등장한 회차도 목록에 오른다 (회차 단위 기록이 없어도).
    expect(ep3.episodeNumber).toBe(3);
    expect(ep3.cutSource).toBe("scenes");
  });
});

describe("appearanceEpisodeLine", () => {
  it("씬 수·의상 라벨·표정·컷을 한 줄로", () => {
    const lookup = buildCharacterAppearanceLookup(HERO, EPISODES, EPISODE_RECORDS, SCENE_RECORDS, SCENE_REFS);
    const ep1 = lookup.episodes.find((entry) => entry.episodeId === "ep1")!;
    expect(appearanceEpisodeLine(ep1, { costumeLabels: { school: "교복" } })).toBe(
      "1화 「시작」 · 씬 2개 · 의상 교복 · 대표 표정 미소 · 10컷",
    );
  });

  it("씬 기록이 없는 회차는 씬 수를 말하지 않고, 기록 없는 의상은 그렇게 말한다", () => {
    const lookup = buildCharacterAppearanceLookup(HERO, EPISODES, [
      { episodeId: "ep3", characterId: "hero", costumeId: null, appearanceId: null, expression: null, cutCount: 0 },
    ], []);
    expect(appearanceEpisodeLine(lookup.episodes[0]!)).toBe(
      "3화 「축제」 · 의상 기록 없음 · 표정 기록 없음",
    );
  });
});

describe("sceneAppearancesFromContinuityStates", () => {
  const states: readonly StudioCharacterContinuityState[] = [
    { sceneId: "s1", sequence: 1, characterId: "hero", costumeId: "school", appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
    { sceneId: "sX", sequence: 2, characterId: "hero", costumeId: "gym", appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
  ];

  it("장면→회차 매핑으로 접고, 매핑 없는 장면은 skipped 로 센다", () => {
    const { records, skipped } = sceneAppearancesFromContinuityStates(states, { s1: "ep1" });
    expect(skipped).toBe(1);
    expect(records).toHaveLength(1);
    // 컷 수·표정은 연속성 상태에 없으므로 미상(0/null)으로 둔다.
    expect(records[0]).toMatchObject({
      episodeId: "ep1",
      characterId: "hero",
      sceneId: "s1",
      costumeId: "school",
      expression: null,
      cutCount: 0,
    });
  });

  it("어댑터 산출물만으로 역조회가 씬 목록을 만든다", () => {
    const { records } = sceneAppearancesFromContinuityStates(states, { s1: "ep1", sX: "ep1" });
    const lookup = buildCharacterAppearanceLookup(HERO, EPISODES, [], records, SCENE_REFS);
    expect(lookup.episodes).toHaveLength(1);
    expect(lookup.episodes[0]!.scenes.map((scene) => scene.sceneId)).toEqual(["s1", "sX"]);
  });
});
