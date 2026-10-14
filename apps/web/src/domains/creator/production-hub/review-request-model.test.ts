import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  buildCompareReviewPath,
  buildReviewRequestTask,
  createReviewRequestDraft,
  deriveReviewRequestEpisodes,
  deriveReviewRequestReviewers,
  reviewInboxItemHref,
  validateReviewRequestDraft,
  type ReviewRequestDraft,
} from "./review-request-model";

const localize = (ko: string) => ko;

const aggregate = {
  projectId: "project-1",
  episodes: [
    { episodeId: "ep-1", state: "in-production" },
    { episodeId: "ep-2", state: "published" },
    { episodeId: "ep-3", state: "in-production" },
  ],
  episodePlans: [
    { episodeId: "ep-1", episodeNumber: 12, title: "밤의 우편", revision: 2 },
    { episodeId: "ep-1", episodeNumber: 12, title: "옛 제목", revision: 1 },
  ],
  reviewPolicies: [
    {
      scope: { kind: "episode", id: "ep-1" },
      lanes: [
        { lane: "narrative", eligibleAssignmentIds: ["a-story"] },
        { lane: "visual-direction", eligibleAssignmentIds: ["a-art", "a-story"] },
      ],
    },
    { scope: { kind: "episode", id: "ep-2" }, lanes: [] },
  ],
  assignments: [
    { id: "a-story", partyId: "p-story", status: "active" },
    { id: "a-art", partyId: "p-art", status: "active" },
    { id: "a-idle", partyId: "p-idle", status: "inactive" },
  ],
  parties: [
    { id: "p-story", publicDisplayName: "스토리 작가" },
    { id: "p-art", publicDisplayName: "그림 작가" },
    { id: "p-idle", publicDisplayName: "휴면 참여자" },
  ],
} as unknown as ProductionProjectAggregate;

const NOW = new Date(2026, 9, 14, 10, 0, 0); // 2026-10-14 로컬

describe("review-request-model", () => {
  it("대상 회차는 정책이 있고 게시되지 않은 회차만, 최신 기획 제목으로 나온다", () => {
    const episodes = deriveReviewRequestEpisodes(aggregate);
    expect(episodes.map((entry) => entry.episodeId)).toEqual(["ep-1"]);
    expect(episodes[0]?.label.ko).toBe("12화 · 밤의 우편");
  });

  it("검수자 후보는 회차 정책에서 자격이 있는 활성 참여자만, 항목과 함께 나온다", () => {
    const reviewers = deriveReviewRequestReviewers(aggregate, "ep-1");
    expect(reviewers.map((entry) => entry.assignmentId)).toEqual(["a-story", "a-art"]);
    expect(reviewers[0]?.lanes).toEqual(["narrative", "visual-direction"]);
    expect(reviewers[1]?.displayName).toBe("그림 작가");
    expect(deriveReviewRequestReviewers(aggregate, "ep-3")).toEqual([]);
  });

  it("기본 초안은 마감 +3일과 기본 체크포인트를 가진다", () => {
    const draft = createReviewRequestDraft("ep-1", NOW);
    expect(draft.dueDate).toBe("2026-10-17");
    expect(draft.checkpointIds).toEqual(["story-flow", "art-consistency"]);
  });

  it("검증은 비어 있는 대상·검수자·항목·과거 마감·체크포인트 없음을 각각 막는다", () => {
    const empty: ReviewRequestDraft = { episodeId: "", reviewerAssignmentId: "", lane: "", dueDate: "", checkpointIds: [], note: "" };
    expect(validateReviewRequestDraft(empty, NOW)).toEqual([
      "episode-required",
      "reviewer-required",
      "lane-required",
      "due-required",
      "checkpoint-required",
    ]);
    const past: ReviewRequestDraft = { episodeId: "ep-1", reviewerAssignmentId: "a-art", lane: "visual-direction", dueDate: "2026-10-13", checkpointIds: ["art-consistency"], note: "" };
    expect(validateReviewRequestDraft(past, NOW)).toEqual(["due-past"]);
    const valid: ReviewRequestDraft = { ...past, dueDate: "2026-10-14" };
    expect(validateReviewRequestDraft(valid, NOW)).toEqual([]);
  });

  it("전송 작업은 internal-review 상태와 검수자·체크포인트·마감을 그대로 싣는다", () => {
    const draft: ReviewRequestDraft = {
      episodeId: "ep-1",
      reviewerAssignmentId: "a-art",
      lane: "visual-direction",
      dueDate: "2026-10-17",
      checkpointIds: ["art-consistency", "rights-credit"],
      note: "  봉투 문양만 봐 주세요. ",
    };
    const task = buildReviewRequestTask(aggregate, draft, { id: "review-request-1", localize });
    expect(task.status).toBe("internal-review");
    expect(task.assignmentIds).toEqual(["a-art"]);
    expect(task.reviewerAssignmentIds).toEqual(["a-art"]);
    expect(task.scope).toEqual({ kind: "episode", id: "ep-1", ancestors: [{ kind: "project", id: "project-1" }] });
    expect(task.completionCriteria).toEqual(["그림·캐릭터 일관성", "권리·크레딧 표기"]);
    expect(task.title).toContain("12화 · 밤의 우편");
    expect(task.title).toContain("시각 연출");
    expect(new Date(task.dueAt ?? "").getDate()).toBe(17);
    expect(task.briefBlocks).toEqual([{ id: "review-request-1-note", kind: "paragraph", text: "봉투 문양만 봐 주세요." }]);
  });

  it("받은 검수함의 검수 항목은 비교 검수로, 나머지는 기존 보드 작업으로 간다", () => {
    expect(buildCompareReviewPath("project 1", "ep/1")).toBe("/production/projects/project%201/episodes/ep%2F1?roomView=compare");
    expect(reviewInboxItemHref({ bucket: "review", projectId: "project-1", taskId: "t-1", episodeId: "ep-1" }))
      .toBe("/production/projects/project-1/episodes/ep-1?roomView=compare");
    expect(reviewInboxItemHref({ bucket: "review", projectId: "project-1", taskId: "t-1", episodeId: null }))
      .toBe("/production/projects/project-1/production?task=t-1");
    expect(reviewInboxItemHref({ bucket: "inProgress", projectId: "project-1", taskId: "t-2", episodeId: "ep-1" }))
      .toBe("/production/projects/project-1/production?task=t-2");
  });
});
