import { describe, expect, it } from "vitest";

import {
  EPISODE_STAGE_STATUSES,
  EPISODE_STAGE_STATUS_TEXT,
  type EpisodeStageStatus,
} from "./episode-stage-status";

describe("EpisodeStageStepper shared contract (S2-4)", () => {
  it("fixes the status vocabulary to exactly four words", () => {
    expect(EPISODE_STAGE_STATUSES).toEqual(["done", "current", "todo", "unknown"]);
    const words: Record<EpisodeStageStatus, string> = {
      done: EPISODE_STAGE_STATUS_TEXT.done.ko,
      current: EPISODE_STAGE_STATUS_TEXT.current.ko,
      todo: EPISODE_STAGE_STATUS_TEXT.todo.ko,
      unknown: EPISODE_STAGE_STATUS_TEXT.unknown.ko,
    };
    expect(words).toEqual({
      done: "끝남",
      current: "지금 여기",
      todo: "남음",
      unknown: "확인 불가",
    });
  });

  it("covers every status with bilingual text and no extras", () => {
    expect(Object.keys(EPISODE_STAGE_STATUS_TEXT).sort()).toEqual(
      [...EPISODE_STAGE_STATUSES].sort(),
    );
    for (const status of EPISODE_STAGE_STATUSES) {
      expect(EPISODE_STAGE_STATUS_TEXT[status].en.length).toBeGreaterThan(0);
    }
  });
});
