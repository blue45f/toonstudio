import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorService } from "./creator.service";

import type { CreatorDraftCollaborationRepository } from "./creator-draft-collaboration.repository";
import type { CreatorCollaborationRepository } from "./creator-collaboration.repository";
import type { StudioWorkAssetService } from "./studio-work-asset.service";

const server = vi.hoisted(() => ({
  createWork: vi.fn(),
  updateWork: vi.fn(),
  deleteWork: vi.fn(),
  toggleLike: vi.fn(),
  addComment: vi.fn(),
  listCreatorWorkReleases: vi.fn(),
  createSeries: vi.fn(),
}));

vi.mock("../../server/creator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/creator")>();
  return { ...actual, ...server };
});

const SQL_TEXT = 'insert into "creator_work" ("id","userId","title") values ($1,$2,$3)';
const SECRET_PARAM = "비공개 작품 제목 secret-param";

function driverFailure(): Error {
  return new DrizzleQueryError(SQL_TEXT, ["work-1", "user-1", SECRET_PARAM], Object.assign(
    new Error('duplicate key value violates unique constraint "creator_work_pkey"'),
    { code: "23505", severity: "ERROR", routine: "_bt_check_unique" },
  ));
}

function connectionFailure(): Error {
  return Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" });
}

function service(): CreatorService {
  return new CreatorService(
    {} as unknown as CreatorCollaborationRepository,
    {} as unknown as CreatorDraftCollaborationRepository,
    { deleteGeneratedObjectsForWork: vi.fn().mockResolvedValue(undefined) } as unknown as StudioWorkAssetService,
  );
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the operation to reject");
}

// HTTP 응답 본문이 될 수 있는 값만 직렬화해 SQL·바인딩 값·호스트가 새는지 검사한다.
function clientVisibleText(error: unknown): string {
  if (error instanceof HttpException) {
    return JSON.stringify({ message: error.message, response: error.getResponse() });
  }
  // HttpException 이 아니면 전역 필터가 본문 없이 5xx 로 정화한다.
  return "";
}

beforeEach(() => {
  for (const mock of Object.values(server)) mock.mockReset();
});

describe("CreatorService 오류 메시지 노출 경계", () => {
  it("작품 저장이 DB 오류로 실패해도 SQL 본문과 바인딩 값을 400 응답에 담지 않는다", async () => {
    server.createWork.mockRejectedValue(driverFailure());
    const error = await rejection(service().createWork("user-1", { title: "x" } as never));
    const visible = clientVisibleText(error);
    expect(visible).not.toContain("Failed query");
    expect(visible).not.toContain("insert into");
    expect(visible).not.toContain(SECRET_PARAM);
    expect(error).not.toBeInstanceOf(BadRequestException);
  });

  it("좋아요·댓글·시리즈·삭제·수정의 DB 오류도 같은 경계로 막힌다", async () => {
    server.toggleLike.mockRejectedValue(driverFailure());
    server.addComment.mockRejectedValue(driverFailure());
    server.createSeries.mockRejectedValue(driverFailure());
    server.deleteWork.mockRejectedValue(driverFailure());
    server.updateWork.mockRejectedValue(driverFailure());
    const target = service();
    const failures = await Promise.all([
      rejection(target.toggleLike("user-1", "work-1")),
      rejection(target.addComment("comment-db-failure-user", "work-1", { text: "안녕하세요" })),
      rejection(target.createSeries("user-1", { title: "x" } as never)),
      rejection(target.deleteWork("user-1", "work-1", false)),
      rejection(target.updateWork("user-1", "work-1", { title: "x" } as never)),
    ]);
    for (const failure of failures) {
      expect(clientVisibleText(failure)).not.toContain("Failed query");
      expect(clientVisibleText(failure)).not.toContain(SECRET_PARAM);
      expect(failure).not.toBeInstanceOf(BadRequestException);
    }
  });

  it("조회 실패(404 경로)도 DB 오류 메시지를 NotFound 응답에 담지 않는다", async () => {
    server.listCreatorWorkReleases.mockRejectedValue(driverFailure());
    const error = await rejection(service().listWorkReleases("work-1"));
    expect(clientVisibleText(error)).not.toContain("Failed query");
    expect(error).not.toBeInstanceOf(NotFoundException);
  });

  it("DB 연결 오류는 400 으로 위장하지 않고 원래 예외로 올려 전역 필터가 503 으로 바꾸게 한다", async () => {
    const original = connectionFailure();
    server.toggleLike.mockRejectedValue(original);
    const error = await rejection(service().toggleLike("user-1", "work-1"));
    expect(error).toBe(original);
  });

  it("도메인 검증 오류의 한글 메시지는 이전과 같이 400 으로 전달된다", async () => {
    server.createWork.mockRejectedValue(new Error("제목을 입력해 주세요."));
    server.toggleLike.mockRejectedValue(new Error("작품을 찾을 수 없습니다."));
    const target = service();
    const created = await rejection(target.createWork("user-1", { title: "" } as never));
    expect(created).toBeInstanceOf(BadRequestException);
    expect((created as BadRequestException).message).toBe("제목을 입력해 주세요.");
    const liked = await rejection(target.toggleLike("user-1", "missing"));
    expect(liked).toBeInstanceOf(BadRequestException);
    expect((liked as BadRequestException).message).toBe("작품을 찾을 수 없습니다.");
  });

  it("조회 도메인 오류는 기존처럼 404 로 전달된다", async () => {
    server.listCreatorWorkReleases.mockRejectedValue(new Error("작품 릴리스를 찾을 수 없습니다."));
    const error = await rejection(service().listWorkReleases("missing"));
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe("작품 릴리스를 찾을 수 없습니다.");
  });
});
