import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 단계 인계 배선 계약 (A1) — 인계 카드는 모델만으로 부족하고, 각 단계 시작
 * 화면이 EpisodeStageHandoffSection을 실제로 마운트해야 앞 단계 산출이
 * 다음 단계에 자동 인용된다. 마운트 지점과 대상 단계를 고정한다.
 */
const HUB = "apps/web/src/domains/creator/production-hub";

function read(name: string): string {
  return readFileSync(`${HUB}/${name}`, "utf8");
}

describe("stage handoff surface wiring", () => {
  it("wrapper derives its inputs from the aggregate source, not per-surface copies", () => {
    const wrapper = read("EpisodeStageHandoffSection.tsx");
    expect(wrapper).toContain("episodeStageHandoffSource(aggregate, episodeId)");
    expect(wrapper).toContain("<StageHandoffCard");
    expect(wrapper).toContain("projectId={aggregate.projectId}");
  });

  it.each([
    ["ProductionEpisodeReviewRoom.tsx", "review"],
    ["ProductionReviewWorkspace.tsx", "review"],
    ["ProductionManuscriptWorkspace.tsx", "art"],
    ["ProductionHubPage.tsx", "storyboard"],
    ["ProductionEpisodeOperationsWorkspace.tsx", "operate"],
  ])("%s mounts the handoff section for stage %s", (file, stage) => {
    const source = read(file);
    expect(source).toContain("EpisodeStageHandoffSection");
    expect(source).toContain(`targetStage="${stage}"`);
  });

  it("episode-scoped mounts only render with a real episode context", () => {
    expect(read("ProductionManuscriptWorkspace.tsx")).toContain("{episodeId ? (");
    expect(read("ProductionHubPage.tsx")).toContain("{boardEpisode ? (");
    expect(read("ProductionEpisodeOperationsWorkspace.tsx")).toContain("{nextRelease ? (");
  });

  it("card offers the pull / start-fresh choice and the empty-state guidance", () => {
    const card = read("StageHandoffCard.tsx");
    expect(card).toContain("이 인용으로 시작하기");
    expect(card).toContain("인용 없이 새로 쓰기");
    expect(card).toContain("아직 앞 단계 산출이 없어요");
    expect(card).toContain("scenePlans");
  });
});
