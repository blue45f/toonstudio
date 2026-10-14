import { describe, expect, it } from "vitest";

import { addStudioCommentThread, resolveStudioCommentThread } from "../studio-comments";
import { comparePinToCommentAnchor } from "./manuscript-pin-feedback-model";
import { createProductionDemoProject, PRODUCTION_DEMO_ANCHOR_AT } from "./production-demo";
import {
  countOpenComparePins,
  countOpenPins,
  countOpenUrgentComparePins,
  countOpenUrgentPins,
  countUnreadPins,
  createEpisodeSampleCompareItems,
  createEpisodeSampleComments,
  deriveEpisodeApprovalGate,
  EPISODE_SAMPLE_PAGE,
  episodeRoomAssigneeOptions,
  resolveEpisodeApprover,
  urgentComparePinPoolItemIds,
} from "./production-episode-room-model";

const NOW = new Date(PRODUCTION_DEMO_ANCHOR_AT);

describe("episode room sample comments", () => {
  it("builds valid Studio comment threads with one required fix, one open note and one resolved note", () => {
    const aggregate = createProductionDemoProject();
    const document = createEpisodeSampleComments(aggregate, NOW);
    expect(document.threads).toHaveLength(3);
    expect(countOpenUrgentPins(document, EPISODE_SAMPLE_PAGE.pageId)).toBe(1);
    expect(countOpenPins(document, EPISODE_SAMPLE_PAGE.pageId)).toBe(2);
    // 필수 수정 핀에는 그리기 주석이 붙어 있고, 외부인 기준으로는 세 핀 모두, 스토리 작가 기준으로는 남이 쓴 빗줄기 핀만 미읽음이다.
    const urgent = document.threads.find((thread) => thread.body.startsWith("[긴급]"));
    expect(urgent?.drawing?.strokes).toHaveLength(1);
    expect(countUnreadPins(document, EPISODE_SAMPLE_PAGE.pageId, "viewer-outside")).toBe(3);
    expect(countUnreadPins(document, EPISODE_SAMPLE_PAGE.pageId, urgent?.author.id ?? null)).toBe(1);
    expect(countUnreadPins(document, EPISODE_SAMPLE_PAGE.pageId, null)).toBe(0);
    // 작성자는 샘플 참여자 이름을 그대로 쓴다.
    expect(document.threads.map((thread) => thread.author.displayName)).toContain("강민서");
  });

  it("assigns the required fix to a real sample participant chosen from the assignee options", () => {
    const aggregate = createProductionDemoProject();
    const document = createEpisodeSampleComments(aggregate, NOW);
    const urgent = document.threads.find((thread) => thread.body.startsWith("[긴급]"));
    const options = episodeRoomAssigneeOptions(aggregate, (ko) => ko);
    expect(urgent?.assignee?.id).toBeTruthy();
    expect(options.some((option) => option.id === urgent?.assignee?.id && option.displayName === urgent?.assignee?.displayName)).toBe(true);
    // 선택지는 활성 참여 배정만, 역할 이름표와 함께 보여 준다.
    const active = aggregate.assignments.filter((assignment) => assignment.status === "active");
    expect(options.map((option) => option.id)).toEqual(active.map((assignment) => assignment.id));
    expect(options.every((option) => option.detail && !option.detail.includes("-"))).toBe(true);
  });

  it("unlocks the gate when the required fix is resolved", () => {
    const aggregate = createProductionDemoProject();
    const document = createEpisodeSampleComments(aggregate, NOW);
    const urgent = document.threads.find((thread) => thread.body.startsWith("[긴급]"));
    expect(urgent).toBeTruthy();
    if (!urgent) return;
    const resolved = resolveStudioCommentThread(document, urgent.id, null, new Date(NOW.getTime() + 1000));
    expect(countOpenUrgentPins(resolved, EPISODE_SAMPLE_PAGE.pageId)).toBe(0);
  });
});

describe("episode approval gate", () => {
  it("summarizes each required lane of the episode policy", () => {
    const gate = deriveEpisodeApprovalGate(createProductionDemoProject(), "episode-12");
    expect(gate.lanes.map((lane) => lane.lane)).toEqual(["narrative", "visual-direction", "production"]);
    expect(gate.lanes.find((lane) => lane.lane === "narrative")?.approved).toBe(true);
    expect(gate.lanes.find((lane) => lane.lane === "visual-direction")?.approved).toBe(false);
    expect(gate.approved).toBe(false);
  });

  it("returns an empty gate for an episode without a policy", () => {
    expect(deriveEpisodeApprovalGate(createProductionDemoProject(), "episode-13")).toEqual({ policyId: null, lanes: [], approved: false, blockingLaneCount: 0 });
  });

  it("acts as the selected role in the sample but never on behalf of someone else in real projects", () => {
    const aggregate = createProductionDemoProject();
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: true, roleLens: "art", viewerAssignmentId: null }))
      .toMatchObject({ assignmentId: "assignment-art", lane: "visual-direction" });
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: false, roleLens: "art", viewerAssignmentId: null })).toBeNull();
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: false, roleLens: "producer", viewerAssignmentId: "assignment-story" }))
      .toMatchObject({ assignmentId: "assignment-story", lane: "narrative" });
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: false, roleLens: "producer", viewerAssignmentId: "assignment-rights" })).toBeNull();
  });
});

describe("episode sample compare", () => {
  it("offers storyboard, two line-art versions and color for side-by-side and slider compare", () => {
    const items = createEpisodeSampleCompareItems(NOW, { storyboard: "콘티", lineArt: "선화·명암", color: "채색" });
    expect(items.map((item) => `${item.processLabel} ${item.revisionLabel}`)).toEqual(["콘티 v1", "선화·명암 v1", "선화·명암 v2", "채색 v1"]);
    expect(items.every((item) => item.imageUrl?.startsWith("/brand/illustrated-20260928/"))).toBe(true);
  });
});

describe("episode room compare-image pin gate (비교 검수 3단계)", () => {
  it("locks the gate for an urgent pin on a compare image and unlocks when it resolves", () => {
    const aggregate = createProductionDemoProject();
    const base = createEpisodeSampleComments(aggregate, NOW);
    const withComparePin = addStudioCommentThread(base, {
      id: "comment_sample-compare-urgent",
      anchor: comparePinToCommentAnchor({ x: 0.42, y: 0.58 }, "pool-external-draft", "pool-revision-color"),
      author: { id: "assignment-art", displayName: "그림 작가" },
      body: "[긴급] 시안과 비교하면 배경 채도가 너무 셉니다.",
    }, NOW);
    // 원고 페이지 핀 집계는 비교 핀을 세지 않고, 비교 집계는 소스 쌍을 유지한다.
    expect(countOpenUrgentPins(withComparePin, EPISODE_SAMPLE_PAGE.pageId)).toBe(1);
    expect(countOpenUrgentComparePins(withComparePin)).toBe(1);
    expect(countOpenComparePins(withComparePin)).toBe(1);
    expect(urgentComparePinPoolItemIds(withComparePin)).toEqual(["pool-external-draft"]);
    const thread = withComparePin.threads.find((candidate) => candidate.id === "comment_sample-compare-urgent");
    expect(thread?.anchor).toEqual({
      type: "compare-image",
      poolItemId: "pool-external-draft",
      x: 0.42,
      y: 0.58,
      pairedPoolItemId: "pool-revision-color",
    });
    const resolved = resolveStudioCommentThread(withComparePin, "comment_sample-compare-urgent", null, new Date(NOW.getTime() + 1000));
    expect(countOpenUrgentComparePins(resolved)).toBe(0);
    expect(countOpenComparePins(resolved)).toBe(0);
  });
});
