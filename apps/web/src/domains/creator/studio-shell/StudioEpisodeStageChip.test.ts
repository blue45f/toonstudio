import { describe, expect, it } from "vitest";

import type { EpisodeStageStepView } from "@/shared/components/episode-stage-stepper";

import { episodeStageChipCurrent } from "./studio-episode-stage-chip-current";

function step(id: string, status: EpisodeStageStepView["status"]): EpisodeStageStepView {
  return { id, label: { ko: id, en: id }, status };
}

describe("StudioEpisodeStageChip current-stage contract (S2-5)", () => {
  it("shows exactly the shared stepper's current stage", () => {
    const states = [step("plan", "done"), step("art", "current"), step("publish", "todo")];
    expect(episodeStageChipCurrent(states)?.id).toBe("art");
  });

  it("hides the chip when no stage is current (published or paused episodes)", () => {
    expect(episodeStageChipCurrent([step("publish", "done"), step("operate", "todo")])).toBeNull();
    expect(
      episodeStageChipCurrent([step("plan", "unknown"), step("art", "unknown")]),
    ).toBeNull();
  });

  it("hides the chip without evidence instead of inventing a stage", () => {
    expect(episodeStageChipCurrent(null)).toBeNull();
    expect(episodeStageChipCurrent(undefined)).toBeNull();
    expect(episodeStageChipCurrent([])).toBeNull();
  });
});
