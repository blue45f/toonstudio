import { describe, expect, it } from "vitest";
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter } from "../studio-story-bible";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  buildSeasonBeatBoard,
  seasonBeatBoardHints,
  type SeasonBeatAssignment,
} from "./studio-season-beat-board";

const CHARACTERS: readonly StudioStoryCharacter[] = [
  { id: "char-mina", name: "미나", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  { id: "char-jun", name: "준", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
];

function makeSeason(overrides: Partial<SeasonPlan> = {}): SeasonPlan {
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
    episodeOrder: ["ep-1", "ep-2", "ep-3", "ep-4", "ep-5"],
    targetEpisodeCount: 5,
    releaseStartsAt: null,
    releaseCadenceDays: null,
    budgetCapMinor: null,
    currency: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    ...overrides,
  };
}

function makePlan(
  episodeNumber: number,
  overrides: Partial<EpisodePlanWithSynopsis> = {},
): EpisodePlanWithSynopsis {
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

function beat(id: string, characterIds: readonly string[], summary: string): StudioStoryBeat {
  return {
    id,
    sceneId: `scene-${id}`,
    order: 0,
    kind: "action",
    summary,
    dialogue: "",
    characterIds,
    locationId: null,
  };
}

describe("season beat board (P-2)", () => {
  it("draws a rows=episodes, columns=characters matrix in season episode order", () => {
    const plans = [makePlan(2), makePlan(1)];
    const board = buildSeasonBeatBoard({
      season: makeSeason({ episodeOrder: ["ep-1", "ep-2"] }),
      plans,
      characters: CHARACTERS,
    });
    expect(board.rows.map((row) => row.episodeNumber)).toEqual([1, 2]);
    expect(board.columns.map((column) => column.characterId)).toEqual(["char-mina", "char-jun"]);
    expect(board.rows[0]?.cells).toHaveLength(2);
    expect(board.hasStory).toBe(true);
  });

  it("puts characterArcRefs columns first", () => {
    const board = buildSeasonBeatBoard({
      season: makeSeason({ episodeOrder: ["ep-1"], characterArcRefs: ["char-jun"] }),
      plans: [makePlan(1)],
      characters: CHARACTERS,
    });
    expect(board.columns.map((column) => column.characterId)).toEqual(["char-jun", "char-mina"]);
  });

  it("derives cells with assignment > storyboard > plan priority", () => {
    const assignments: readonly SeasonBeatAssignment[] = [
      { episodeId: "ep-1", characterId: "char-mina", beat: "편지를 숨긴다" },
    ];
    const board = buildSeasonBeatBoard({
      season: makeSeason({ episodeOrder: ["ep-1"] }),
      plans: [makePlan(1, { characterRefs: ["char-mina", "char-jun"] })],
      characters: CHARACTERS,
      assignments,
      beatsByEpisodeId: { "ep-1": [beat("b1", ["char-mina"], "달려간다")] },
    });
    const mina = board.rows[0]?.cells[0];
    const jun = board.rows[0]?.cells[1];
    // 배정 + 콘티 비트가 합쳐지고 출처는 배정이 우선한다.
    expect(mina?.text).toBe("편지를 숨긴다 · 달려간다");
    expect(mina?.beatCount).toBe(2);
    expect(mina?.source).toBe("assignment");
    // characterRefs 만 있으면 등장 표시로 축소된다.
    expect(jun?.present).toBe(true);
    expect(jun?.text).toBe("등장");
    expect(jun?.source).toBe("plan");
  });

  it("marks a 3+ episode absence as a gap run and flags its cells", () => {
    const plans = [1, 2, 3, 4, 5].map((n) =>
      makePlan(n, { characterRefs: n === 1 || n === 5 ? ["char-mina", "char-jun"] : ["char-jun"] }),
    );
    const board = buildSeasonBeatBoard({
      season: makeSeason(),
      plans,
      characters: CHARACTERS,
    });
    const mina = board.columns[0];
    expect(mina?.gapRuns).toEqual([{ fromEpisodeNumber: 2, toEpisodeNumber: 4, length: 3 }]);
    expect(mina?.longestGap).toBe(3);
    expect(mina?.trailingGap).toBe(0);
    expect(board.longGapCharacterIds).toEqual(["char-mina"]);
    // 공백 구간 셀만 inLongGap 이다 (2·3·4화).
    expect(board.rows.map((row) => row.cells[0]?.inLongGap)).toEqual([false, true, true, true, false]);
    expect(seasonBeatBoardHints(board)).toContain("미나: 2화부터 4화까지 3회 연속 나오지 않아요.");
  });

  it("does not flag absences shorter than the gap threshold", () => {
    const plans = [1, 2, 3].map((n) =>
      makePlan(n, { characterRefs: n === 2 ? ["char-jun"] : ["char-mina", "char-jun"] }),
    );
    const board = buildSeasonBeatBoard({
      season: makeSeason({ episodeOrder: ["ep-1", "ep-2", "ep-3"] }),
      plans,
      characters: CHARACTERS,
    });
    expect(board.columns[0]?.gapRuns).toEqual([]);
    expect(board.columns[0]?.longestGap).toBe(1);
    expect(board.longGapCharacterIds).toEqual([]);
  });

  it("flags crowded episodes and bare episodes per row", () => {
    const crowdedBeats = [1, 2, 3, 4, 5, 6].map((n) => beat(`b${n}`, ["char-mina"], `비트 ${n}`));
    const board = buildSeasonBeatBoard({
      season: makeSeason({ episodeOrder: ["ep-1", "ep-2"] }),
      plans: [makePlan(1), makePlan(2)],
      characters: CHARACTERS,
      beatsByEpisodeId: { "ep-1": crowdedBeats },
    });
    expect(board.rows[0]?.crowded).toBe(true);
    expect(board.rows[0]?.totalBeats).toBe(6);
    expect(board.crowdedEpisodeNumbers).toEqual([1]);
    expect(board.rows[1]?.bare).toBe(true);
    const hints = seasonBeatBoardHints(board);
    expect(hints.some((hint) => hint.includes("1화: 비트 6개가 몰려 있어요"))).toBe(true);
    expect(hints).toContain("2화: 아직 배정된 비트가 없어요.");
  });

  it("reports hasStory=false when no plan carries any story text", () => {
    const board = buildSeasonBeatBoard({
      season: makeSeason({ episodeOrder: ["ep-1"] }),
      plans: [makePlan(1, { logline: "", synopsis: "", goal: "" })],
      characters: CHARACTERS,
    });
    expect(board.hasStory).toBe(false);
  });
});
