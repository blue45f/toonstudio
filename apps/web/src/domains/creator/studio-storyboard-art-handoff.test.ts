import { describe, expect, it } from "vitest";

import {
  bindBeatsToEpisode,
  deriveStoryBeatsFromEpisodePlan,
  deriveStoryboardArtHandoff,
  planStudioStoryboard,
  planStudioStoryboardForEpisode,
  storyboardArtStartHref,
  type StudioStoryBeat,
} from "./studio-storyboard-planner";

const ep12Setup: StudioStoryBeat = {
  id: "beat-1",
  sceneId: "scene-1",
  order: 0,
  kind: "setup",
  summary: "학교 전경",
  dialogue: "",
  characterIds: [],
  locationId: "school",
  episodeId: "ep-12",
};
const ep12Dialogue: StudioStoryBeat = {
  id: "beat-2",
  sceneId: "scene-1",
  order: 1,
  kind: "dialogue",
  summary: "주인공이 친구를 부른다",
  dialogue: "민서야!",
  characterIds: ["hero", "friend"],
  locationId: "school",
  episodeId: "ep-12",
};
const legacyBeat: StudioStoryBeat = {
  id: "beat-legacy",
  sceneId: "scene-1",
  order: 0,
  kind: "setup",
  summary: "회차 연결 전의 비트",
  dialogue: "",
  characterIds: [],
  locationId: null,
};

describe("흐름 F-3 콘티→작화 샷 인계 — 회차 연결", () => {
  it("비트 episodeId 가 샷과 계획에 그대로 승계된다", () => {
    const plan = planStudioStoryboard([ep12Setup, ep12Dialogue]);
    expect(plan.episodeId).toBe("ep-12");
    expect(plan.status).toBe("ready");
    expect(plan.shots.map((shot) => shot.episodeId)).toEqual(["ep-12", "ep-12"]);
  });

  it("회차 연결이 없는 기존 비트는 계획 episodeId 가 null 이고 경고도 없다", () => {
    const plan = planStudioStoryboard([legacyBeat]);
    expect(plan.episodeId).toBeNull();
    expect(plan.shots[0]?.episodeId).toBeNull();
    expect(plan.warnings).toEqual([]);
    expect(plan.status).toBe("ready");
  });

  it("서로 다른 회차가 섞이면 계획 episodeId 는 null, episode-mixed 경고와 review 가 된다", () => {
    const other: StudioStoryBeat = { ...ep12Dialogue, id: "beat-9", episodeId: "ep-13" };
    const plan = planStudioStoryboard([ep12Setup, other]);
    expect(plan.episodeId).toBeNull();
    expect(plan.status).toBe("review");
    expect(plan.warnings).toEqual(["episode-mixed:ep-12,ep-13"]);
  });

  it("빈 문자열 episodeId 는 연결 없음이 아니라 오류다", () => {
    expect(() =>
      planStudioStoryboard([{ ...legacyBeat, episodeId: "  " }]),
    ).toThrow("valid episodeId");
  });

  it("F-1 시딩 비트는 태어날 때부터 회차를 지니고, 그 계획도 같은 회차다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan({
      episodeId: "ep-12",
      openingHook: "주인공이 거짓말을 들킨 채로 아침을 맞는다",
      turningPoints: ["친구가 증거 사진을 보여준다"],
      cliffhanger: "쪽지 뒤에 적힌 이름은 주인공의 이름이었다",
      characterRefs: ["hero"],
      locationRefs: ["classroom"],
      targetCutCount: 30,
    });
    expect(draft.beats.every((beat) => beat.episodeId === "ep-12")).toBe(true);
    expect(planStudioStoryboard(draft.beats).episodeId).toBe("ep-12");
  });
});

describe("bindBeatsToEpisode / planStudioStoryboardForEpisode", () => {
  it("기존 비트에 회차를 각인하고, 이미 같은 회차인 비트는 그대로 둔다", () => {
    const bound = bindBeatsToEpisode([legacyBeat, ep12Setup], "ep-12");
    expect(bound[0]?.episodeId).toBe("ep-12");
    expect(bound[1]).toBe(ep12Setup);
    expect(legacyBeat.episodeId).toBeUndefined();
  });

  it("다른 회차 비트가 섞이면 덮지 않고 throw 한다", () => {
    expect(() => bindBeatsToEpisode([ep12Setup], "ep-13")).toThrow(
      "belongs to episode ep-12, not ep-13",
    );
    expect(() => bindBeatsToEpisode([legacyBeat], " ")).toThrow("episodeId");
  });

  it("회차별 계획은 그 회차 비트만으로 만들어지고, 없으면 throw 한다", () => {
    const other: StudioStoryBeat = { ...ep12Dialogue, id: "beat-9", order: 0, episodeId: "ep-13" };
    const plan = planStudioStoryboardForEpisode([ep12Setup, ep12Dialogue, other, legacyBeat], "ep-12");
    expect(plan.episodeId).toBe("ep-12");
    expect(plan.shots.map((shot) => shot.beatId)).toEqual(["beat-1", "beat-2"]);
    expect(() => planStudioStoryboardForEpisode([other], "ep-12")).toThrow("at least one story beat");
  });
});

describe("deriveStoryboardArtHandoff / storyboardArtStartHref", () => {
  it("계획의 샷 규격과 비트의 내용을 결합한 작화 목록을 만든다", () => {
    const plan = planStudioStoryboard([ep12Setup, ep12Dialogue]);
    const handoff = deriveStoryboardArtHandoff(plan, [ep12Setup, ep12Dialogue]);
    expect(handoff.episodeId).toBe("ep-12");
    expect(handoff.status).toBe("ready");
    expect(handoff.estimatedCanvasHeightPx).toBe(plan.estimatedCanvasHeightPx);
    expect(handoff.shots).toMatchObject([
      {
        shotId: "shot:beat-1",
        beatId: "beat-1",
        episodeId: "ep-12",
        order: 0,
        summary: "학교 전경",
        shotSize: "wide",
        camera: "eye-level establishing",
        composition: "single focal subject",
        estimatedHeightPx: 680,
      },
      {
        shotId: "shot:beat-2",
        beatId: "beat-2",
        summary: "주인공이 친구를 부른다",
        dialogue: "민서야!",
        characterIds: ["hero", "friend"],
        locationId: "school",
        shotSize: "medium",
        camera: "shot-reverse-shot",
        composition: "multi-character readable staging",
      },
    ]);
  });

  it("회차에 묶이지 않은 계획·빠진 비트·다른 회차 비트는 인계를 거부한다", () => {
    const unboundPlan = planStudioStoryboard([legacyBeat]);
    expect(() => deriveStoryboardArtHandoff(unboundPlan, [legacyBeat])).toThrow(
      "bound to a single episode",
    );
    const plan = planStudioStoryboard([ep12Setup, ep12Dialogue]);
    expect(() => deriveStoryboardArtHandoff(plan, [ep12Setup])).toThrow(
      "missing the story beat for shot shot:beat-2",
    );
    expect(() =>
      deriveStoryboardArtHandoff(plan, [
        ep12Setup,
        { ...ep12Dialogue, episodeId: "ep-13" },
      ]),
    ).toThrow("belongs to episode ep-13, not ep-12");
  });

  it("작화 시작 링크는 회차와 계획 요약을 싣고, 회차가 어긋난 계획은 거부한다", () => {
    const plan = planStudioStoryboard([ep12Setup, ep12Dialogue]);
    expect(storyboardArtStartHref("ep-12")).toBe(
      "/studio/new?start=art&episode=ep-12",
    );
    expect(storyboardArtStartHref("ep-12", plan)).toBe(
      `/studio/new?start=art&episode=ep-12&shots=2&height=${plan.estimatedCanvasHeightPx}`,
    );
    expect(() => storyboardArtStartHref("ep-13", plan)).toThrow("same episode");
    expect(() => storyboardArtStartHref(" ")).toThrow("episodeId");
  });
});
