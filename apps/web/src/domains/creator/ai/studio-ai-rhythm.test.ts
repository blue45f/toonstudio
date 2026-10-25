import { describe, expect, it } from "vitest";

import {
  episodePanelProgress,
  summarizeEpisodeRhythm,
} from "./studio-ai-rhythm";

const DAY = 24 * 60 * 60 * 1000;

describe("studio-ai-rhythm", () => {
  it("패널 진행률과 요약 개수를 계산한다", () => {
    const now = 1_000_000 * DAY;
    const summary = summarizeEpisodeRhythm(
      [
        { episodeId: "e1", title: "1화", status: "done", dueAt: null, donePanels: 10, totalPanels: 10 },
        { episodeId: "e2", title: "2화", status: "review", dueAt: now + DAY, donePanels: 8, totalPanels: 10 },
        { episodeId: "e3", title: "3화", status: "draft", dueAt: now - DAY, donePanels: 2, totalPanels: 10 },
      ],
      now,
    );
    expect(summary.total).toBe(3);
    expect(summary.done).toBe(1);
    expect(summary.inReview).toBe(1);
    expect(summary.overallProgress).toBeCloseTo(1 / 3);
    expect(summary.overdue.map((episode) => episode.episodeId)).toEqual(["e3"]);
    expect(summary.dueSoon.map((episode) => episode.episodeId)).toEqual(["e2"]);
    expect(summary.nextActions).toEqual([
      { episodeId: "e3", kind: "overdue" },
      { episodeId: "e2", kind: "due-soon" },
      { episodeId: "e2", kind: "review" },
    ]);
    expect(episodePanelProgress({ episodeId: "e2", title: "2화", status: "review", dueAt: null, donePanels: 8, totalPanels: 10 })).toBe(0.8);
  });

  it("빈 목록은 0으로 요약한다", () => {
    const summary = summarizeEpisodeRhythm([], 0);
    expect(summary.total).toBe(0);
    expect(summary.overallProgress).toBe(0);
    expect(summary.nextActions).toEqual([]);
  });
});
