/**
 * 작가 공지 스토어 테스트 — 게스트 가드·CRUD·게시 전이·소유권·상태 전환 연결 검증.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createStatusTransitionNoticeDraft,
  useAuthorNoticeStore,
} from "./author-notice-store";

const AUTHOR = "김밤하늘";
const OWNER = "account-a";

beforeEach(() => {
  window.localStorage.clear();
  useAuthorNoticeStore.getState().resetForTests();
});

describe("author notice store 작성 가드", () => {
  it("게스트(계정 없음)는 공지를 만들 수 없다", () => {
    const created = useAuthorNoticeStore.getState().createNotice(
      AUTHOR,
      { scope: { kind: "author" }, kind: "general", title: "제목", body: "본문" },
      null,
    );
    expect(created).toBeNull();
    expect(useAuthorNoticeStore.getState().notices).toHaveLength(0);
  });

  it("로그인 작가는 초안을 만들 수 있고 소유자는 본인 계정이다", () => {
    const created = useAuthorNoticeStore.getState().createNotice(
      AUTHOR,
      {
        scope: { kind: "work", workId: "series-1", workTitle: "달빛 기사" },
        kind: "schedule",
        title: "업로드 요일 변경",
        body: "수요일로 옮깁니다.",
      },
      OWNER,
    );
    expect(created).toMatchObject({
      ownerId: OWNER,
      authorName: AUTHOR,
      kind: "schedule",
      status: "draft",
      publishedAt: null,
    });
    expect(created?.scope).toEqual({ kind: "work", workId: "series-1", workTitle: "달빛 기사" });
  });
});

describe("author notice store 수정·삭제·게시", () => {
  function seedDraft() {
    const created = useAuthorNoticeStore.getState().createNotice(
      AUTHOR,
      { scope: { kind: "author" }, kind: "general", title: "제목", body: "본문" },
      OWNER,
    );
    if (!created) throw new Error("초안 생성 실패는 테스트 전제 위반이다");
    return created;
  }

  it("본인만 수정할 수 있다", () => {
    const draft = seedDraft();
    const state = useAuthorNoticeStore.getState();
    expect(state.updateNotice(draft.id, { title: "남이 바꿈" }, "account-b")).toBeNull();
    expect(state.updateNotice(draft.id, { title: "남이 바꿈" }, null)).toBeNull();
    expect(state.updateNotice(draft.id, { title: "내가 바꿈" }, OWNER)?.title).toBe("내가 바꿈");
  });

  it("게시하면 publishedAt이 찍히고, 게시 취소해도 마지막 게시 시각은 남는다", () => {
    const draft = seedDraft();
    const state = useAuthorNoticeStore.getState();
    expect(state.setNoticeStatus(draft.id, "published", "account-b")).toBe(false);
    expect(state.setNoticeStatus(draft.id, "published", OWNER)).toBe(true);
    const published = useAuthorNoticeStore.getState().notices[0];
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    expect(state.setNoticeStatus(draft.id, "draft", OWNER)).toBe(true);
    const unpublished = useAuthorNoticeStore.getState().notices[0];
    expect(unpublished.status).toBe("draft");
    expect(unpublished.publishedAt).toBe(published.publishedAt);
  });

  it("빈 제목 공지는 게시할 수 없다", () => {
    const draft = useAuthorNoticeStore.getState().createNotice(
      AUTHOR,
      { scope: { kind: "author" }, kind: "general", title: " ", body: "본문" },
      OWNER,
    );
    if (!draft) throw new Error("초안 생성 실패는 테스트 전제 위반이다");
    expect(useAuthorNoticeStore.getState().setNoticeStatus(draft.id, "published", OWNER)).toBe(false);
    expect(useAuthorNoticeStore.getState().notices[0].status).toBe("draft");
  });

  it("본인만 삭제할 수 있다", () => {
    const draft = seedDraft();
    const state = useAuthorNoticeStore.getState();
    expect(state.deleteNotice(draft.id, "account-b")).toBe(false);
    expect(state.deleteNotice(draft.id, OWNER)).toBe(true);
    expect(useAuthorNoticeStore.getState().notices).toHaveLength(0);
  });
});

describe("상태 전환 공지 초안 연결", () => {
  it("휴재로 바꾸면 작품 범위 휴재 초안이 생긴다", () => {
    const created = createStatusTransitionNoticeDraft({
      actorId: OWNER,
      authorName: AUTHOR,
      workId: "series-1",
      workTitle: "달빛 기사",
      from: "ongoing",
      to: "hiatus",
    });
    expect(created).toMatchObject({ kind: "hiatus", status: "draft", ownerId: OWNER });
    expect(created?.scope).toEqual({ kind: "work", workId: "series-1", workTitle: "달빛 기사" });
    expect(useAuthorNoticeStore.getState().notices).toHaveLength(1);
  });

  it("계정이 없거나 제안 대상이 아닌 전이면 만들지 않는다", () => {
    const state = useAuthorNoticeStore.getState();
    expect(
      createStatusTransitionNoticeDraft({
        actorId: null,
        authorName: AUTHOR,
        workId: "series-1",
        workTitle: "달빛 기사",
        from: "ongoing",
        to: "hiatus",
      }),
    ).toBeNull();
    expect(
      createStatusTransitionNoticeDraft({
        actorId: OWNER,
        authorName: AUTHOR,
        workId: "series-1",
        workTitle: "달빛 기사",
        from: "ongoing",
        to: "completed",
      }),
    ).toBeNull();
    expect(state.notices).toHaveLength(0);
  });
});
