import { describe, expect, it } from "vitest";
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter } from "../studio-story-bible";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  MAIN_PLOTLINE_ID,
  STRUCTURE_TEMPLATES,
  applyStructureTemplate,
  applyTimelineToEpisodePlans,
  buildPlotlineTimeline,
  defaultPlotlineTracks,
  derivePlotlineCardsFromPlans,
  mergeTemplateCards,
  movePlotlineCard,
  type PlotlineCard,
} from "./studio-plotline-timeline";

const CHARACTERS: readonly StudioStoryCharacter[] = [
  { id: "char-mina", name: "미나", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  { id: "char-jun", name: "준", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
];

function makeSeason(episodeCount: number): SeasonPlan {
  return {
    id: "season-plan-1",
    projectId: "project-1",
    seasonId: "season-1",
    revision: 1,
    status: "draft",
    title: "시즌 1",
    goal: "미나가 비밀을 지킨다",
    plotArc: [],
    characterArcRefs: [],
    episodeOrder: Array.from({ length: episodeCount }, (_, i) => `ep-${i + 1}`),
    targetEpisodeCount: episodeCount,
    releaseStartsAt: null,
    releaseCadenceDays: null,
    budgetCapMinor: null,
    currency: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-14T00:00:00.000Z",
  };
}

function makePlan(episodeNumber: number, overrides: Partial<EpisodePlanWithSynopsis> = {}): EpisodePlanWithSynopsis {
  return {
    id: `plan-${episodeNumber}`,
    projectId: "project-1",
    seasonId: "season-1",
    episodeId: `ep-${episodeNumber}`,
    episodeNumber,
    revision: 1,
    status: "draft",
    title: `${episodeNumber}화 제목`,
    logline: `${episodeNumber}화 한 줄`,
    openingHook: "",
    coreConflict: "",
    turningPoints: [],
    cliffhanger: "",
    characterRefs: [],
    locationRefs: [],
    targetCutCount: 40,
    targetScrollHeightPx: 12000,
    dialogueDensity: "medium",
    difficulty: 2,
    riskIds: [],
    narrativeRevisionRef: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    ...overrides,
  };
}

function card(id: string, episodeId: string, order: number, overrides: Partial<PlotlineCard> = {}): PlotlineCard {
  return {
    id,
    plotlineId: MAIN_PLOTLINE_ID,
    episodeId,
    title: id,
    summary: "",
    characterIds: [],
    locationId: null,
    order,
    templateBeatKey: null,
    ...overrides,
  };
}

describe("구조 템플릿 프리필", () => {
  it("3막 템플릿 적용만으로 전 비트가 회차에 비례 배분되어 골격이 완성된다", () => {
    const plans = Array.from({ length: 10 }, (_, i) => makePlan(i + 1));
    const cards = applyStructureTemplate({
      templateId: "three-act",
      plotlineId: MAIN_PLOTLINE_ID,
      episodeIds: plans.map((plan) => plan.episodeId),
    });
    const template = STRUCTURE_TEMPLATES.find((entry) => entry.id === "three-act");
    expect(cards).toHaveLength(template?.beats.length ?? 0);
    expect(cards.map((entry) => entry.templateBeatKey)).toEqual(template?.beats.map((b) => b.key));
    // position 비례: 첫 비트는 1화, 마지막 비트는 10화, 순서는 단조 증가
    expect(cards[0]?.episodeId).toBe("ep-1");
    expect(cards[cards.length - 1]?.episodeId).toBe("ep-10");
    const indices = cards.map((entry) => Number(entry.episodeId.replace("ep-", "")));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    // 안내 문장이 summary에 미리 채워진다
    expect(cards.every((entry) => entry.summary.length > 0)).toBe(true);
  });

  it("영웅 여정·Save the Cat 템플릿도 전 비트가 채워지고 회차가 없으면 빈 배열이다", () => {
    for (const templateId of ["hero-journey", "save-the-cat"]) {
      const cards = applyStructureTemplate({
        templateId,
        plotlineId: MAIN_PLOTLINE_ID,
        episodeIds: ["ep-1", "ep-2", "ep-3"],
      });
      const template = STRUCTURE_TEMPLATES.find((entry) => entry.id === templateId);
      expect(cards).toHaveLength(template?.beats.length ?? 0);
    }
    expect(
      applyStructureTemplate({ templateId: "three-act", plotlineId: MAIN_PLOTLINE_ID, episodeIds: [] }),
    ).toEqual([]);
    expect(
      applyStructureTemplate({ templateId: "없는템플릿", plotlineId: MAIN_PLOTLINE_ID, episodeIds: ["ep-1"] }),
    ).toEqual([]);
  });

  it("재적용해도 mergeTemplateCards가 중복 카드를 만들지 않는다", () => {
    const episodeIds = ["ep-1", "ep-2", "ep-3", "ep-4"];
    const first = applyStructureTemplate({ templateId: "three-act", plotlineId: MAIN_PLOTLINE_ID, episodeIds });
    const merged = mergeTemplateCards(first, applyStructureTemplate({ templateId: "three-act", plotlineId: MAIN_PLOTLINE_ID, episodeIds }));
    expect(merged).toHaveLength(first.length);
  });
});

describe("타임라인 도출·이동·플랜 반영", () => {
  it("행=플롯라인, 열=회차(episodeOrder 순)로 카드가 놓인다", () => {
    const season = makeSeason(3);
    const plans = [makePlan(1), makePlan(2), makePlan(3)];
    const tracks = defaultPlotlineTracks(CHARACTERS);
    const timeline = buildPlotlineTimeline({
      season,
      plans,
      tracks,
      cards: [card("c1", "ep-2", 0), card("c2", "ep-1", 0, { plotlineId: "plotline-char:char-mina" })],
    });
    expect(timeline.episodes.map((episode) => episode.episodeId)).toEqual(["ep-1", "ep-2", "ep-3"]);
    expect(timeline.rows.map((row) => row.track.kind)).toEqual(["main", "character-arc", "character-arc"]);
    expect(timeline.rows[0]?.cells[1]?.cards.map((entry) => entry.id)).toEqual(["c1"]);
    expect(timeline.rows[1]?.cells[0]?.cards.map((entry) => entry.id)).toEqual(["c2"]);
  });

  it("카드 이동이 셀 순서를 다시 매기고 회차 플랜 turningPoints에 반영된다", () => {
    const plans = [makePlan(1, { turningPoints: ["A", "B"] }), makePlan(2, { turningPoints: ["C"] })];
    const cards = derivePlotlineCardsFromPlans(plans);
    const moved = movePlotlineCard(cards, "plan:ep-1:0", "ep-2", 1);
    const reflected = applyTimelineToEpisodePlans(plans, moved, ["ep-1", "ep-2"]);
    expect(reflected[0]?.turningPoints).toEqual(["B"]);
    expect(reflected[1]?.turningPoints).toEqual(["C", "A"]);
    // 범위 밖 회차는 건드리지 않는다
    const plans3 = [...plans, makePlan(3, { turningPoints: ["Z"] })];
    const reflected3 = applyTimelineToEpisodePlans(plans3, moved, ["ep-1", "ep-2"]);
    expect(reflected3[2]?.turningPoints).toEqual(["Z"]);
  });

  it("같은 셀 안 재배열도 order가 0부터 연속으로 재정렬된다", () => {
    const cards = [card("a", "ep-1", 0), card("b", "ep-1", 1), card("c", "ep-1", 2)];
    const moved = movePlotlineCard(cards, "c", "ep-1", 0);
    const sorted = [...moved].sort((x, y) => x.order - y.order).map((entry) => entry.id);
    expect(sorted).toEqual(["c", "a", "b"]);
    expect(moved.map((entry) => entry.order).sort()).toEqual([0, 1, 2]);
  });
});

describe("캐릭터·장소 필터", () => {
  it("캐릭터 필터는 그 캐릭터 카드와 아크 트랙만 남기고, 장소 필터는 장소 카드만 남긴다", () => {
    const season = makeSeason(2);
    const plans = [makePlan(1), makePlan(2)];
    const tracks = defaultPlotlineTracks(CHARACTERS);
    const cards: readonly PlotlineCard[] = [
      card("m1", "ep-1", 0, { characterIds: ["char-mina"], locationId: "loc-school" }),
      card("m2", "ep-1", 1, { characterIds: ["char-jun"], locationId: "loc-home" }),
      card("a1", "ep-2", 0, { plotlineId: "plotline-char:char-jun" }),
    ];
    const byCharacter = buildPlotlineTimeline({ season, plans, tracks, cards, characterFilterId: "char-mina" });
    expect(byCharacter.rows.map((row) => row.track.id)).toEqual([MAIN_PLOTLINE_ID]);
    expect(byCharacter.totalCards).toBe(1);

    const byLocation = buildPlotlineTimeline({ season, plans, tracks, cards, locationFilterId: "loc-home" });
    expect(byLocation.totalCards).toBe(1);
    expect(byLocation.rows[0]?.cells[0]?.cards.map((entry) => entry.id)).toEqual(["m2"]);

    const unfiltered = buildPlotlineTimeline({ season, plans, tracks, cards });
    expect(unfiltered.rows).toHaveLength(3);
    expect(unfiltered.totalCards).toBe(3);
  });
});
