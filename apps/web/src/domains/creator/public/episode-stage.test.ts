import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { describe, expect, it, vi } from "vitest";

import { episodeStageForEpisode, representativeEpisodeStage } from "./episode-stage";

// 회차 지정 합성의 관심사는 "선택 + QC 경유 + 도출"의 배선이다. QC 판정 자체는
// production-episode-qc의 테스트가 고정하므로 여기서는 빈 체크리스트로 대체한다.
vi.mock("../production-hub/production-episode-qc", () => ({
  deriveEpisodeQcChecklist: () => ({ items: [] }),
}));

const ORDER = ["plan", "storyboard", "art", "lettering", "review", "publish", "operate"] as const;

describe("representativeEpisodeStage public composition (S2-5)", () => {
  it("returns no selection and all-unknown states when the project has no episodes", () => {
    const aggregate = { episodes: [], episodePlans: [] } as unknown as ProductionProjectAggregate;
    const result = representativeEpisodeStage(aggregate);
    expect(result.selection).toBeNull();
    expect(result.states).toHaveLength(7);
    expect(result.states.every((state) => state.status === "unknown")).toBe(true);
    // 단계 순서·이름은 허브 개요와 같은 7단계 정본을 그대로 따른다.
    expect(result.states.map((state) => state.id)).toEqual([...ORDER]);
  });
});

describe("episodeStageForEpisode public composition (S2-5 editor header)", () => {
  it("returns null for an episode the aggregate does not have instead of substituting another episode", () => {
    const aggregate = { episodes: [], episodePlans: [] } as unknown as ProductionProjectAggregate;
    expect(episodeStageForEpisode(aggregate, "ep-missing")).toBeNull();
  });

  it("derives the requested episode (not the representative one) with its plan number", () => {
    const episode = {
      episodeId: "ep-7",
      state: "final-art-production",
      storyLockApproved: true,
      thumbnailLockApproved: true,
      jointProofApproved: false,
      integratedRevisionRef: null,
      visualRevisionRef: null,
    };
    const aggregate = {
      episodes: [episode],
      episodePlans: [{ episodeId: "ep-7", episodeNumber: 7, title: "일곱 번째" }],
    } as unknown as ProductionProjectAggregate;
    const result = episodeStageForEpisode(aggregate, "ep-7");
    expect(result?.selection.episode.episodeId).toBe("ep-7");
    expect(result?.selection.episodeNumber).toBe(7);
    expect(result?.states.map((state) => state.id)).toEqual([...ORDER]);
    // 협업 상태 final-art-production은 허브 개요와 같은 규칙으로 작화가 current다.
    expect(result?.states.find((state) => state.id === "art")?.status).toBe("current");
  });
});
