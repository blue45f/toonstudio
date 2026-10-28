import { describe, expect, it } from "vitest";
import { reviewAnchorSchema, type ReviewPenStroke } from "@toonstudio/studio-project-model";

import { mapStudioReviewComment, sameStudioReviewCommentMutation,
  type StudioReviewExistingCommentRow } from "./studio-review-comment-store";

const anchor = reviewAnchorSchema.parse({ artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" }, kind: "artifact" });
const strokes: readonly ReviewPenStroke[] = [{ id: "stroke", points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], color: "#e5484d", width: 3 }];
const input = { id: "comment", anchor, body: "저장된 첨삭", severity: "note" as const, assigneeIds: ["reviewer", "owner"] };
const current: StudioReviewExistingCommentRow = { reviewId: "review", authorUserId: "author", body: input.body,
  severity: input.severity, anchor, strokes: [], createdAt: new Date("2026-10-29T00:00:00Z"), dueAtMatches: true,
  assigneeIds: ["owner", "reviewer"] };

describe("펜 댓글 저장 정본과 재실행", () => {
  it("획이 없는 기존 요청과 빈 배열 재시도를 같은 작성자의 같은 요청으로 처리한다", () => {
    expect(sameStudioReviewCommentMutation(current, "author", "review", input, anchor, [])).toBe(true);
    expect(sameStudioReviewCommentMutation(current, "author", "review", { ...input, strokes: [] }, anchor, [])).toBe(true);
  });
  it("같은 획만 재실행하고 다른 작성자·획·검수·본문·기한은 충돌로 구분한다", () => {
    const saved = { ...current, strokes };
    expect(sameStudioReviewCommentMutation(saved, "author", "review", { ...input, strokes }, anchor, strokes)).toBe(true);
    expect(sameStudioReviewCommentMutation(saved, "another-author", "review", input, anchor, strokes)).toBe(false);
    expect(sameStudioReviewCommentMutation(saved, "author", "another-review", input, anchor, strokes)).toBe(false);
    expect(sameStudioReviewCommentMutation(saved, "author", "review", { ...input, body: "다른 본문" }, anchor, strokes)).toBe(false);
    expect(sameStudioReviewCommentMutation({ ...saved, dueAtMatches: false }, "author", "review", input, anchor, strokes)).toBe(false);
    const different = [{ ...strokes[0]!, color: "#000000" }];
    expect(sameStudioReviewCommentMutation(saved, "author", "review", input, anchor, different)).toBe(false);
    expect(sameStudioReviewCommentMutation(saved, "author", "review", input, anchor, [])).toBe(false);
  });
  it("실제 DB row의 획과 작성자를 재조회 DTO로 보존한다", () => {
    const record = mapStudioReviewComment({ ...current, id: input.id, strokes, status: "open", dueAt: null,
      resolutionRevisionId: null, resolvedBy: null, updatedAt: current.createdAt });
    expect(record).toMatchObject({ authorUserId: "author", strokes, createdAt: "2026-10-29T00:00:00.000Z", dueAt: null });
    expect(Object.isFrozen(record.strokes)).toBe(true);
    expect(() => mapStudioReviewComment({ ...record, strokes: [{ ...strokes[0], unexpected: true }],
      createdAt: current.createdAt, updatedAt: current.createdAt, dueAt: null })).toThrow();
  });
});
