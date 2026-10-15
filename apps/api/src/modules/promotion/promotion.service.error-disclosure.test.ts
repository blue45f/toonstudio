import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionService } from "./promotion.service";

const comments = vi.hoisted(() => ({
  addPromotionComment: vi.fn(),
  updatePromotionComment: vi.fn(),
  deletePromotionComment: vi.fn(),
  togglePromotionCommentLike: vi.fn(),
  listPromotionComments: vi.fn(),
}));

vi.mock("./promotion-comments", () => comments);

const SQL_TEXT = 'insert into "promotion_comment" ("id","body") values ($1,$2)';
const SECRET_PARAM = "비공개 댓글 본문 secret-param";

function driverFailure(): Error {
  return new DrizzleQueryError(SQL_TEXT, ["comment-1", SECRET_PARAM], undefined);
}

function service(): PromotionService {
  const instance = new PromotionService();
  vi.spyOn(instance, "accessible").mockResolvedValue({
    post: { hidden: false, archived: false },
    canModerate: false,
  } as never);
  return instance;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the operation to reject");
}

beforeEach(() => {
  for (const mock of Object.values(comments)) mock.mockReset();
});

describe("PromotionService 댓글 오류 메시지 노출 경계", () => {
  it("DB 오류는 SQL 본문과 바인딩 값을 4xx 응답에 담지 않는다", async () => {
    comments.addPromotionComment.mockRejectedValue(driverFailure());
    comments.updatePromotionComment.mockRejectedValue(driverFailure());
    comments.deletePromotionComment.mockRejectedValue(driverFailure());
    comments.togglePromotionCommentLike.mockRejectedValue(driverFailure());
    const target = service();
    const failures = await Promise.all([
      rejection(target.comment("post-1", "user-1", { text: "x" } as never)),
      rejection(target.updateComment("post-1", "comment-1", "user-1", { text: "x" } as never)),
      rejection(target.deleteComment("post-1", "comment-1", "user-1")),
      rejection(target.toggleCommentLike("post-1", "comment-1", "user-1")),
    ]);
    for (const failure of failures) {
      expect(failure).not.toBeInstanceOf(BadRequestException);
      expect(failure).not.toBeInstanceOf(ForbiddenException);
      expect(String((failure as Error).message)).toContain("Failed query");
    }
  });

  it("도메인 검증 오류는 이전과 같은 4xx 와 한글 메시지로 전달된다", async () => {
    comments.addPromotionComment.mockRejectedValue(new Error("댓글 내용을 입력해 주세요."));
    comments.deletePromotionComment.mockRejectedValue(new Error("본인 댓글만 삭제할 수 있어요."));
    const target = service();
    const added = await rejection(target.comment("post-1", "user-1", { text: "" } as never));
    expect(added).toBeInstanceOf(BadRequestException);
    expect((added as BadRequestException).message).toBe("댓글 내용을 입력해 주세요.");
    const removed = await rejection(target.deleteComment("post-1", "comment-1", "user-1"));
    expect(removed).toBeInstanceOf(ForbiddenException);
    expect((removed as ForbiddenException).message).toBe("본인 댓글만 삭제할 수 있어요.");
  });
});
