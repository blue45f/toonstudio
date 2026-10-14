import { describe, expect, it } from "vitest";

import {
  episodeHookDesign,
  episodeHookQcExtras,
  episodeStoryCard,
  synopsisHints,
  type EpisodePlanWithSynopsis,
} from "./studio-episode-synopsis";

function plan(overrides: Partial<EpisodePlanWithSynopsis> = {}): EpisodePlanWithSynopsis {
  return {
    id: "plan-episode-1",
    projectId: "project-1",
    seasonId: "season-1",
    episodeId: "episode-1",
    episodeNumber: 1,
    revision: 1,
    status: "draft",
    title: "상자",
    logline: "배달 상자가 울기 시작한다",
    openingHook: "울리는 상자",
    coreConflict: "열 것인가 말 것인가",
    turningPoints: ["상자가 운다"],
    cliffhanger: "상자 뚜껑이 스스로 열린다",
    synopsis: "주인공이 울리는 상자를 받는다.",
    characterRefs: [],
    locationRefs: [],
    targetCutCount: 40,
    targetScrollHeightPx: 20000,
    dialogueDensity: "medium",
    difficulty: 2,
    riskIds: [],
    narrativeRevisionRef: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("다음 화 훅 설계 칸 (P-5)", () => {
  it("hookDesign이 없으면 두 칸 다 빈 것으로 판정한다", () => {
    const view = episodeHookDesign(plan());
    expect(view.complete).toBe(false);
    expect(view.missing).toEqual(["lastSceneQuestion", "nextOpening"]);
    expect(view.design).toEqual({ lastSceneQuestion: "", nextOpening: "" });
  });

  it("공백만 있으면 빈 칸으로 판정한다", () => {
    const view = episodeHookDesign(plan({ hookDesign: { lastSceneQuestion: "  ", nextOpening: "다음 장면" } }));
    expect(view.missing).toEqual(["lastSceneQuestion"]);
    expect(view.design.nextOpening).toBe("다음 장면");
  });

  it("두 칸이 채워지면 complete이고 앞뒤 공백이 정리된다", () => {
    const view = episodeHookDesign(
      plan({ hookDesign: { lastSceneQuestion: " 소리는 무엇일까? ", nextOpening: " 상자가 열린다 " } }),
    );
    expect(view.complete).toBe(true);
    expect(view.design).toEqual({ lastSceneQuestion: "소리는 무엇일까?", nextOpening: "상자가 열린다" });
  });

  it("카드는 훅 필요 여부와 남기는 질문 줄을 함께 돌려준다", () => {
    const empty = episodeStoryCard(plan());
    expect(empty.needsHookDesign).toBe(true);
    expect(empty.hookQuestionLine).toBe("");
    const filled = episodeStoryCard(
      plan({ hookDesign: { lastSceneQuestion: "소리는 무엇일까?", nextOpening: "상자가 열린다" } }),
    );
    expect(filled.needsHookDesign).toBe(false);
    expect(filled.hookQuestionLine).toBe("소리는 무엇일까?");
  });

  it("힌트는 빈 훅 칸의 이름을 알려 주고, 채워지면 사라진다", () => {
    const hints = synopsisHints(plan({ hookDesign: { lastSceneQuestion: "질문", nextOpening: "" } }));
    const hookHint = hints.find((hint) => hint.includes("훅 설계"));
    expect(hookHint).toContain("다음 화 첫 장면");
    expect(hookHint).not.toContain("마지막 장면의 질문");
    const filledHints = synopsisHints(
      plan({ hookDesign: { lastSceneQuestion: "질문", nextOpening: "첫 장면" } }),
    );
    expect(filledHints.some((hint) => hint.includes("훅 설계"))).toBe(false);
  });

  it("QC 브리지는 QC extras와 같은 모양으로 정리된 설계 값을 돌려준다", () => {
    const extras = episodeHookQcExtras(
      plan({ hookDesign: { lastSceneQuestion: " 질문 ", nextOpening: " 첫 장면 " } }),
    );
    expect(extras).toEqual({ nextEpisodeHook: { lastSceneQuestion: "질문", nextOpening: "첫 장면" } });
    // hookDesign이 없는 계획도 빈 값으로 브리지된다 — QC는 이를 warning으로 표시한다.
    expect(episodeHookQcExtras(plan()).nextEpisodeHook).toEqual({ lastSceneQuestion: "", nextOpening: "" });
  });
});
