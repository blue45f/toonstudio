import { describe, expect, it } from "vitest";

import {
  deriveStoryBeatsFromEpisodePlan,
  planStudioStoryboard,
  type EpisodePlanBeatSeedSource,
} from "./studio-storyboard-planner";

/**
 * core EpisodePlan 의 시딩 관련 필드를 그대로 옮긴 픽스처.
 * EpisodePlan 전체 레코드(시딩과 무관한 필드 포함)도 구조적으로 그대로
 * 들어가는지는 fullPlan 테스트로 고정한다.
 */
const basePlan: EpisodePlanBeatSeedSource = {
  episodeId: "ep-12",
  openingHook: "주인공이 거짓말을 들킨 채로 아침을 맞는다",
  turningPoints: ["친구가 증거 사진을 보여준다", "주인공이 도망친다", "  ", "숨은 방에서 진짜 범인의 쪽지를 발견한다"],
  cliffhanger: "쪽지 뒤에 적힌 이름은 주인공의 이름이었다",
  characterRefs: ["hero", " friend ", "hero", ""],
  locationRefs: ["classroom", "hallway"],
  targetCutCount: 62,
};

describe("deriveStoryBeatsFromEpisodePlan (흐름 F-1 기획→콘티 비트 자동 시딩)", () => {
  it("오프닝 훅·핵심 사건·마무리 훅을 순서 있는 비트 초안으로 도출한다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan(basePlan);
    expect(draft.hasSeed).toBe(true);
    expect(draft.episodeId).toBe("ep-12");
    expect(draft.warnings).toEqual([]);
    // 빈 핵심 사건 1개는 비트가 되지 않고, 원래 순서는 유지된다.
    expect(draft.beats.map((beat) => [beat.kind, beat.summary])).toEqual([
      ["setup", "주인공이 거짓말을 들킨 채로 아침을 맞는다"],
      ["action", "친구가 증거 사진을 보여준다"],
      ["action", "주인공이 도망친다"],
      ["action", "숨은 방에서 진짜 범인의 쪽지를 발견한다"],
      ["reveal", "쪽지 뒤에 적힌 이름은 주인공의 이름이었다"],
    ]);
    expect(draft.beats.map((beat) => beat.order)).toEqual([0, 1, 2, 3, 4]);
    expect(draft.beats.map((beat) => beat.id)).toEqual([
      "plan-ep-12-b1",
      "plan-ep-12-b2",
      "plan-ep-12-b3",
      "plan-ep-12-b4",
      "plan-ep-12-b5",
    ]);
    // 출처: 빈 항목을 건너뛴 핵심 사건도 원래 인덱스를 유지한다.
    expect(draft.origins.map((origin) => [origin.field, origin.turningPointIndex])).toEqual([
      ["openingHook", null],
      ["turningPoint", 0],
      ["turningPoint", 1],
      ["turningPoint", 3],
      ["cliffhanger", null],
    ]);
  });

  it("characterRefs·locationRefs 를 비트에 인용하고 대사는 지어내지 않는다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan(basePlan);
    for (const beat of draft.beats) {
      expect(beat.characterIds).toEqual(["hero", "friend"]);
      expect(beat.locationId).toBe("classroom");
      expect(beat.sceneId).toBe("plan-scene-ep-12");
      expect(beat.dialogue).toBe("");
    }
  });

  it("목표 컷 수를 비트별 배분으로 반영하고 합이 목표와 정확히 같다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan(basePlan);
    expect(draft.targetCutCount).toBe(62);
    // 62 = 13+13+12+12+12 — 나머지는 앞 비트부터 1개씩.
    expect(draft.cutAllocations.map((allocation) => allocation.cutCount)).toEqual([13, 13, 12, 12, 12]);
    expect(
      draft.cutAllocations.reduce((sum, allocation) => sum + allocation.cutCount, 0),
    ).toBe(62);
    expect(draft.cutAllocations.map((allocation) => allocation.beatId)).toEqual(
      draft.beats.map((beat) => beat.id),
    );
  });

  it("도출 비트가 플래너를 경고 없이 통과한다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan(basePlan);
    const plan = planStudioStoryboard(draft.beats);
    expect(plan.status).toBe("ready");
    expect(plan.warnings).toEqual([]);
    expect(plan.shots).toHaveLength(5);
    expect(plan.shots.map((shot) => shot.shotSize)).toEqual([
      "wide",
      "wide",
      "wide",
      "wide",
      "extreme-close-up",
    ]);
  });

  it("기획이 비어 있으면 빈 초안 + plan-seed-empty 로 정직하게 알린다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan({
      episodeId: "ep-13",
      openingHook: "  ",
      turningPoints: [],
      cliffhanger: "",
      characterRefs: [],
      targetCutCount: 40,
    });
    expect(draft.hasSeed).toBe(false);
    expect(draft.beats).toEqual([]);
    expect(draft.cutAllocations).toEqual([]);
    expect(draft.warnings).toEqual(["plan-seed-empty"]);
    // 비트가 없으면 플래너에 넣지 않는 것이 계약이다(플래너는 빈 배열을 거부).
    expect(() => planStudioStoryboard(draft.beats)).toThrow("at least one");
  });

  it("빠진 필드와 목표 컷 문제는 warnings 로 드러낸다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan({
      episodeId: "ep-14",
      openingHook: "",
      turningPoints: ["사건 하나"],
      cliffhanger: "",
      characterRefs: [],
      targetCutCount: 0,
    });
    expect(draft.hasSeed).toBe(true);
    expect(draft.targetCutCount).toBeNull();
    expect(draft.cutAllocations).toEqual([]);
    expect(draft.warnings).toEqual([
      "opening-hook-missing",
      "cliffhanger-missing",
      "target-cut-count-missing",
    ]);
  });

  it("목표 컷이 비트 수보다 적으면 배분 합은 지키고 경고한다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan({ ...basePlan, targetCutCount: 3 });
    expect(draft.cutAllocations.map((allocation) => allocation.cutCount)).toEqual([1, 1, 1, 0, 0]);
    expect(draft.warnings).toContain("target-cut-count-below-beat-count");
  });

  it("옵션(idPrefix·sceneId·startOrder)을 반영하고 계약 위반은 throw 한다", () => {
    const draft = deriveStoryBeatsFromEpisodePlan(basePlan, {
      idPrefix: "seed42",
      sceneId: "scene-main",
      startOrder: 7,
    });
    expect(draft.beats[0]).toMatchObject({ id: "seed42-b1", sceneId: "scene-main", order: 7 });
    expect(draft.beats.map((beat) => beat.order)).toEqual([7, 8, 9, 10, 11]);
    // 기존 비트 뒤에 이어 붙여도 플래너 유일성 계약이 유지된다.
    const existing = [
      { id: "old-1", sceneId: "scene-main", order: 6, kind: "setup" as const, summary: "기존 비트", dialogue: "", characterIds: [], locationId: null },
    ];
    expect(() => planStudioStoryboard([...existing, ...draft.beats])).not.toThrow();

    expect(() => deriveStoryBeatsFromEpisodePlan({ ...basePlan, episodeId: " " })).toThrow("episodeId");
    expect(() => deriveStoryBeatsFromEpisodePlan(basePlan, { idPrefix: "bad prefix!" })).toThrow("idPrefix");
    expect(() => deriveStoryBeatsFromEpisodePlan(basePlan, { startOrder: -1 })).toThrow("startOrder");
    expect(() => deriveStoryBeatsFromEpisodePlan(basePlan, { sceneId: " " })).toThrow("sceneId");
  });

  it("core EpisodePlan 전체 레코드가 추가 변환 없이 그대로 들어간다", () => {
    // packages/core/src/production/types.ts 의 EpisodePlan 필드를 전부 옮긴 픽스처.
    // 시딩 입력이 구조적 타입이라 EpisodePlan 을 따로 매핑할 필요가 없음을 고정한다.
    const fullPlan = {
      id: "plan-12",
      projectId: "proj-1",
      seasonId: "season-1",
      episodeId: "ep-12",
      episodeNumber: 12,
      revision: 3,
      status: "approved" as const,
      title: "거짓말의 아침",
      logline: "거짓말이 들통난 주인공의 하루",
      openingHook: "주인공이 거짓말을 들킨 채로 아침을 맞는다",
      coreConflict: "진실을 말하면 친구를 잃는다",
      turningPoints: ["친구가 증거 사진을 보여준다"],
      cliffhanger: "쪽지 뒤에 적힌 이름은 주인공의 이름이었다",
      characterRefs: ["hero"],
      locationRefs: ["classroom"],
      targetCutCount: 30,
      targetScrollHeightPx: 24000,
      dialogueDensity: "medium" as const,
      difficulty: 3 as const,
      riskIds: [],
      narrativeRevisionRef: null,
      approvedByAssignmentIds: [],
      createdAt: "2026-10-14T00:00:00.000Z",
    };
    const draft = deriveStoryBeatsFromEpisodePlan(fullPlan);
    expect(draft.hasSeed).toBe(true);
    expect(draft.beats.map((beat) => beat.kind)).toEqual(["setup", "action", "reveal"]);
    expect(draft.cutAllocations.map((allocation) => allocation.cutCount)).toEqual([10, 10, 10]);
  });
});
