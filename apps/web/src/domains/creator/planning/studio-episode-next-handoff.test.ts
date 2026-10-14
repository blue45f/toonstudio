import { describe, expect, it } from "vitest";
import type { EpisodePlan, SeasonPlan } from "@toonstudio/core/production";
import {
  applyNextEpisodeOpeningDraft,
  deriveNextEpisodeHandoff,
  deriveNextEpisodeOpeningDraft,
  findPreviousEpisodePlan,
  type EpisodePlanWithSynopsis,
  type PreviousEpisodePlanLike,
} from "./studio-episode-synopsis";

function plan(overrides: Partial<EpisodePlan> & { episodeId: string; episodeNumber: number }): EpisodePlanWithSynopsis {
  return {
    id: `plan-${overrides.episodeId}`,
    projectId: "project-1",
    seasonId: "season-1",
    revision: 1,
    status: "draft",
    title: `${overrides.episodeNumber}화`,
    logline: "",
    openingHook: "",
    coreConflict: "",
    turningPoints: [],
    cliffhanger: "",
    characterRefs: [],
    locationRefs: [],
    targetCutCount: 60,
    targetScrollHeightPx: 0,
    dialogueDensity: "medium",
    difficulty: 2,
    riskIds: [],
    narrativeRevisionRef: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    ...overrides,
  } as EpisodePlanWithSynopsis;
}

function season(episodeOrder: readonly string[]): SeasonPlan {
  return {
    id: "season-plan-1",
    projectId: "project-1",
    seasonId: "season-1",
    revision: 1,
    status: "draft",
    title: "시즌 1",
    goal: "",
    plotArc: [],
    characterArcRefs: [],
    episodeOrder,
    targetEpisodeCount: episodeOrder.length,
    releaseStartsAt: null,
    releaseCadenceDays: null,
    budgetCapMinor: null,
    currency: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-14T00:00:00.000Z",
  } as SeasonPlan;
}

const ep1 = plan({ episodeId: "ep-1", episodeNumber: 1, cliffhanger: "  문 너머에서 주인공의 이름이 불린다  " });
const ep2 = plan({ episodeId: "ep-2", episodeNumber: 2 });
const ep5 = plan({ episodeId: "ep-5", episodeNumber: 5, cliffhanger: "열쇠가 스스로 돌아간다" });
const ep9 = plan({ episodeId: "ep-9", episodeNumber: 9 });

describe("deriveNextEpisodeOpeningDraft", () => {
  it("이전 회차 cliffhanger를 공백만 정리해 openingHook 초안으로 그대로 인용한다", () => {
    const draft = deriveNextEpisodeOpeningDraft(ep1);
    expect(draft?.sourceField).toBe("cliffhanger");
    expect(draft?.openingHookDraft).toBe("문 너머에서 주인공의 이름이 불린다");
    expect(draft?.cliffhangerText).toBe("문 너머에서 주인공의 이름이 불린다");
    expect(draft?.hasSeed).toBe(true);
    expect(draft?.warnings).toEqual([]);
  });

  it("훅 설계 nextOpening이 있으면 cliffhanger보다 우선 인용한다", () => {
    const withHook: PreviousEpisodePlanLike = {
      ...ep1,
      hookDesign: { lastSceneQuestion: "문 너머에는 누가 있을까?", nextOpening: "문이 열리며 낯선 손님이 들어선다" },
    };
    const draft = deriveNextEpisodeOpeningDraft(withHook);
    expect(draft?.sourceField).toBe("nextOpening");
    expect(draft?.openingHookDraft).toBe("문이 열리며 낯선 손님이 들어선다");
    expect(draft?.cliffhangerText).toBe("문 너머에서 주인공의 이름이 불린다");
  });

  it("이전 회차가 없으면 null, 마무리 훅이 비면 hasSeed=false와 경고를 돌려준다", () => {
    expect(deriveNextEpisodeOpeningDraft(null)).toBeNull();
    expect(deriveNextEpisodeOpeningDraft(undefined)).toBeNull();
    const empty = deriveNextEpisodeOpeningDraft(ep2);
    expect(empty?.hasSeed).toBe(false);
    expect(empty?.openingHookDraft).toBe("");
    expect(empty?.warnings).toEqual(["previous-cliffhanger-missing"]);
  });
});

describe("findPreviousEpisodePlan / deriveNextEpisodeHandoff", () => {
  it("episodeOrder의 바로 앞 회차를 이전 회차로 삼는다 (회차 번호 간격과 무관)", () => {
    const s = season(["ep-1", "ep-5", "ep-9"]);
    expect(findPreviousEpisodePlan(s, [ep1, ep5, ep9], ep9)?.episodeId).toBe("ep-5");
    const handoff = deriveNextEpisodeHandoff(s, [ep1, ep5, ep9], ep9);
    expect(handoff.draft?.previousEpisodeNumber).toBe(5);
    expect(handoff.autoFillOpeningHook).toBe("열쇠가 스스로 돌아간다");
  });

  it("순서표에 없으면 episodeNumber가 가장 큰 하위 회차로 폴백한다", () => {
    expect(findPreviousEpisodePlan(null, [ep1, ep5, ep9], ep9)?.episodeId).toBe("ep-5");
    expect(findPreviousEpisodePlan(season([]), [ep1, ep5, ep9], ep5)?.episodeId).toBe("ep-1");
  });

  it("첫 회차는 이전 회차가 없어 자동 채움이 비고 경고가 남는다", () => {
    const handoff = deriveNextEpisodeHandoff(season(["ep-1", "ep-5"]), [ep1, ep5], ep1);
    expect(handoff.draft).toBeNull();
    expect(handoff.autoFillOpeningHook).toBe("");
    expect(handoff.warnings).toEqual(["previous-episode-missing"]);
  });

  it("대상 openingHook이 이미 차 있으면 자동 채우지 않는다", () => {
    const filled = plan({ episodeId: "ep-2", episodeNumber: 2, openingHook: "이미 쓴 오프닝" });
    const handoff = deriveNextEpisodeHandoff(null, [ep1, filled], filled);
    expect(handoff.targetHasOpeningHook).toBe(true);
    expect(handoff.autoFillOpeningHook).toBe("");
    expect(handoff.draft?.hasSeed).toBe(true);
  });
});

describe("applyNextEpisodeOpeningDraft", () => {
  it("빈 openingHook에만 초안을 채우고 원본은 바꾸지 않는다", () => {
    const draft = deriveNextEpisodeOpeningDraft(ep1);
    const applied = applyNextEpisodeOpeningDraft(ep2, draft);
    expect(applied.applied).toBe(true);
    expect(applied.plan.openingHook).toBe("문 너머에서 주인공의 이름이 불린다");
    expect(ep2.openingHook).toBe("");
    const kept = plan({ episodeId: "ep-2", episodeNumber: 2, openingHook: "기존 오프닝" });
    const skipped = applyNextEpisodeOpeningDraft(kept, draft);
    expect(skipped.applied).toBe(false);
    expect(skipped.plan.openingHook).toBe("기존 오프닝");
  });
});
