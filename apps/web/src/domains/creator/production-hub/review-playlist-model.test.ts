import { describe, expect, it } from "vitest";

import {
  buildReviewPlaylist,
  mergeSavedVerdicts,
  parseReviewPlaylist,
  priorityQueue,
  resumeIndex,
  reviewProgress,
  serializeReviewPlaylist,
  setReviewVerdict,
  verdictGateValue,
} from "./review-playlist-model";

function samplePlaylist() {
  return buildReviewPlaylist({
    id: "today:project-1:2026-10-14",
    title: "오늘의 검수",
    items: [
      { id: "episode:ep-2", episodeId: "ep-2", episodeLabel: "2화 · 비", versionLabel: "기획 1판", openPinCount: 3 },
      { id: "episode:ep-1", episodeId: "ep-1", episodeLabel: "1화 · 시작", versionLabel: "기획 2판", openPinCount: 0 },
      { id: "episode:ep-3", episodeId: "ep-3", episodeLabel: "3화 · 반전", versionLabel: "기획 1판", openPinCount: 5 },
    ],
  });
}

describe("review-playlist-model", () => {
  it("조립하면 회차 라벨 순으로 정렬되고 전부 미판정으로 시작한다", () => {
    const playlist = samplePlaylist();
    expect(playlist.items.map((item) => item.episodeId)).toEqual(["ep-1", "ep-2", "ep-3"]);
    expect(playlist.items.every((item) => item.verdict === "pending")).toBe(true);
    expect(resumeIndex(playlist)).toBe(0);
  });

  it("판정하면 진행률이 맞고 원본은 바뀌지 않는다", () => {
    const playlist = samplePlaylist();
    const decided = setReviewVerdict(
      setReviewVerdict(playlist, "episode:ep-1", "approved"),
      "episode:ep-2",
      "changes-requested",
      "3컷 다시",
    );
    const progress = reviewProgress(decided);
    expect(progress).toMatchObject({ total: 3, decided: 2, approved: 1, changesRequested: 1, pending: 1 });
    expect(progress.ratio).toBeCloseTo(2 / 3);
    expect(progress.remainingOpenPins).toBe(5);
    expect(playlist.items.every((item) => item.verdict === "pending")).toBe(true);
    expect(decided.items.find((item) => item.id === "episode:ep-2")?.verdictNote).toBe("3컷 다시");
  });

  it("직렬화 왕복 후 첫 미판정 항목부터 재개된다", () => {
    const decided = setReviewVerdict(
      setReviewVerdict(samplePlaylist(), "episode:ep-1", "approved"),
      "episode:ep-2",
      "skipped",
    );
    const restored = parseReviewPlaylist(serializeReviewPlaylist(decided));
    expect(restored).not.toBeNull();
    expect(resumeIndex(restored!)).toBe(2);
    expect(restored!.items.map((item) => item.verdict)).toEqual(["approved", "skipped", "pending"]);
  });

  it("전부 판정하면 재개 지점이 없고 진행률은 1이다", () => {
    let playlist = samplePlaylist();
    for (const item of playlist.items) playlist = setReviewVerdict(playlist, item.id, "approved");
    expect(resumeIndex(playlist)).toBe(-1);
    expect(reviewProgress(playlist).ratio).toBe(1);
  });

  it("깨진 저장값은 null로 거르고, 날짜가 다른 세션은 판정을 되살리지 않는다", () => {
    expect(parseReviewPlaylist(null)).toBeNull();
    expect(parseReviewPlaylist("{broken")).toBeNull();
    expect(parseReviewPlaylist(JSON.stringify({ version: 2, id: "x", title: "t", items: [] }))).toBeNull();
    const decided = setReviewVerdict(samplePlaylist(), "episode:ep-1", "approved");
    const nextDay = buildReviewPlaylist({
      id: "today:project-1:2026-10-15",
      title: "오늘의 검수",
      items: samplePlaylist().items.map(({ verdict: _verdict, ...rest }) => rest),
    });
    expect(mergeSavedVerdicts(nextDay, decided).items.every((item) => item.verdict === "pending")).toBe(true);
  });

  it("같은 날 새 조립본에 판정을 되살리고 사라진 항목은 버린다", () => {
    const decided = setReviewVerdict(samplePlaylist(), "episode:ep-1", "approved");
    const rebuilt = buildReviewPlaylist({
      id: "today:project-1:2026-10-14",
      title: "오늘의 검수",
      items: [
        { id: "episode:ep-1", episodeId: "ep-1", episodeLabel: "1화 · 시작", versionLabel: "기획 3판", openPinCount: 1 },
        { id: "episode:ep-4", episodeId: "ep-4", episodeLabel: "4화 · 새 회차", versionLabel: "기획 1판", openPinCount: 0 },
      ],
    });
    const merged = mergeSavedVerdicts(rebuilt, decided);
    expect(merged.items.find((item) => item.id === "episode:ep-1")?.verdict).toBe("approved");
    expect(merged.items.find((item) => item.id === "episode:ep-1")?.versionLabel).toBe("기획 3판");
    expect(merged.items.find((item) => item.id === "episode:ep-4")?.verdict).toBe("pending");
    expect(resumeIndex(merged)).toBe(1);
  });

  it("우선순위 큐는 미판정 중 열린 항목이 많은 순이고, 게이트 매핑은 건너뜀을 제외한다", () => {
    const playlist = setReviewVerdict(samplePlaylist(), "episode:ep-3", "approved");
    expect(priorityQueue(playlist).map((item) => item.episodeId)).toEqual(["ep-2", "ep-1"]);
    expect(verdictGateValue("approved")).toBe("approve");
    expect(verdictGateValue("changes-requested")).toBe("request-changes");
    expect(verdictGateValue("skipped")).toBeNull();
  });
});
