import { describe, expect, it } from "vitest";

import { mapScheduleRowsToEpisodeProgress } from "./studio-ai-rhythm-mapping";

describe("studio-ai-rhythm-mapping", () => {
  it("유효한 행만 리듬 입력으로 바꾸고 나머지는 버린다", () => {
    const result = mapScheduleRowsToEpisodeProgress([
      {
        episodeId: "e1",
        title: "1화",
        status: "draft",
        dueAt: 100,
        donePanels: 2,
        totalPanels: 5,
      },
      {
        episodeId: "",
        title: "무제",
        status: "draft",
        dueAt: null,
        donePanels: 0,
        totalPanels: 0,
      },
      {
        episodeId: "e2",
        title: "2화",
        status: "unknown",
        dueAt: null,
        donePanels: 0,
        totalPanels: 0,
      },
    ]);
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]?.episodeId).toBe("e1");
    expect(result.dropped).toBe(2);
  });
});
