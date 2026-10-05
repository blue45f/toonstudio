/**
 * 작가 공지 모델 테스트 — 검증·독자 목록 필터·상태 전환 제안 검증.
 */

import { describe, expect, it } from "vitest";

import {
  buildStatusTransitionNoticeDraft,
  listPublishedNoticesForAuthor,
  listPublishedNoticesForWork,
  validateAuthorNoticeDraft,
} from "./author-notice-model";
import type { AuthorNotice } from "./author-notice-types";

const AUTHOR = "김밤하늘";

function notice(partial: Partial<AuthorNotice>): AuthorNotice {
  return {
    id: "notice-1",
    ownerId: "account-a",
    authorName: AUTHOR,
    scope: { kind: "author" },
    kind: "general",
    title: "공지",
    body: "본문",
    status: "published",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    publishedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("validateAuthorNoticeDraft", () => {
  it("제목이 비면 empty-title이다", () => {
    expect(validateAuthorNoticeDraft({ title: "  ", body: "본문" })).toEqual({
      ok: false,
      reason: "empty-title",
    });
  });

  it("본문이 비면 empty-body이다", () => {
    expect(validateAuthorNoticeDraft({ title: "제목", body: "\n" })).toEqual({
      ok: false,
      reason: "empty-body",
    });
  });

  it("제목과 본문이 있으면 통과한다", () => {
    expect(validateAuthorNoticeDraft({ title: "제목", body: "본문" })).toEqual({ ok: true });
  });
});

describe("독자 목록 필터", () => {
  const notices: readonly AuthorNotice[] = [
    notice({ id: "author-notice", title: "작가 전체 공지", publishedAt: "2026-10-03T00:00:00.000Z" }),
    notice({
      id: "work-a-notice",
      title: "작품 A 공지",
      scope: { kind: "work", workId: "series-a", workTitle: "작품 A" },
      publishedAt: "2026-10-02T00:00:00.000Z",
    }),
    notice({
      id: "work-b-notice",
      title: "작품 B 공지",
      scope: { kind: "work", workId: "series-b", workTitle: "작품 B" },
      publishedAt: "2026-10-04T00:00:00.000Z",
    }),
    notice({ id: "draft", title: "초안", status: "draft", publishedAt: null }),
    notice({ id: "other-author", title: "남의 공지", authorName: "다른작가" }),
  ];

  it("작가 목록은 게시된 것만 최신순으로 돌려준다", () => {
    const result = listPublishedNoticesForAuthor(notices, AUTHOR);
    expect(result.map((item) => item.id)).toEqual(["work-b-notice", "author-notice", "work-a-notice"]);
  });

  it("작품 목록은 작가 전체 공지와 해당 작품 공지만 돌려준다", () => {
    const result = listPublishedNoticesForWork(notices, AUTHOR, "작품 A");
    expect(result.map((item) => item.id)).toEqual(["author-notice", "work-a-notice"]);
  });

  it("다른 작가의 작품 목록은 비어 있다", () => {
    expect(listPublishedNoticesForWork(notices, "없는작가", "작품 A")).toEqual([]);
  });
});

describe("buildStatusTransitionNoticeDraft", () => {
  it("연재 중 → 휴재는 휴재 안내 초안을 제안한다", () => {
    const seed = buildStatusTransitionNoticeDraft({
      authorName: AUTHOR,
      workTitle: "달빛 기사",
      from: "ongoing",
      to: "hiatus",
    });
    expect(seed?.kind).toBe("hiatus");
    expect(seed?.title).toContain("달빛 기사");
    expect(seed?.body).toContain(AUTHOR);
  });

  it("휴재 → 연재 중은 재개 안내 초안을 제안한다", () => {
    const seed = buildStatusTransitionNoticeDraft({
      authorName: AUTHOR,
      workTitle: "달빛 기사",
      from: "hiatus",
      to: "ongoing",
    });
    expect(seed?.kind).toBe("resume");
  });

  it("완결 전이와 상태 유지에는 제안하지 않는다", () => {
    expect(
      buildStatusTransitionNoticeDraft({
        authorName: AUTHOR,
        workTitle: "달빛 기사",
        from: "ongoing",
        to: "completed",
      }),
    ).toBeNull();
    expect(
      buildStatusTransitionNoticeDraft({
        authorName: AUTHOR,
        workTitle: "달빛 기사",
        from: "ongoing",
        to: "ongoing",
      }),
    ).toBeNull();
  });
});
