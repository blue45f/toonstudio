import { describe, expect, it } from "vitest";

import {
  createEmptyEpisode,
  initialSubmissionDraft,
  submissionDraftReducer,
  submissionDraftToText,
  type SubmissionDraftState,
} from "./submission-package-draft-state";
import { EMPTY_SUBMISSION_DRAFT_TEXT } from "./submission-package-draft-store";
import { readyPage } from "./submission-package.test-fixture";

const idFor = (index: number) => `new-${index}`;

function stateWith(overrides: Partial<SubmissionDraftState> = {}): SubmissionDraftState {
  return { ...initialSubmissionDraft({ saved: null, projectTitle: "내 작품", documents: [], idFor }), ...overrides };
}

describe("초기 초안", () => {
  it("저장된 글도 문서도 없으면 최소 회차(3화)만큼 빈 칸을 두고 제목은 프로젝트 이름이다", () => {
    const state = initialSubmissionDraft({ saved: null, projectTitle: "내 작품", documents: [], idFor });
    expect(state.title).toBe("내 작품");
    expect(state.episodes.map((episode) => [episode.id, episode.number])).toEqual([["new-0", 1], ["new-1", 2], ["new-2", 3]]);
    expect(state.episodes.every((episode) => episode.pages.length === 0 && episode.reading === 0)).toBe(true);
    expect(state.targetWidth).toBe("naver");
  });

  it("프로젝트의 웹툰 문서마다 회차 칸을 만들고 문서 기록을 곁들인다", () => {
    const state = initialSubmissionDraft({
      saved: null,
      projectTitle: "내 작품",
      documents: [
        { id: "d1", title: "1화 비 오는 날", width: 690, height: 8_000, pageCount: 3 },
        { id: "d2", title: "2화", width: null, height: null, pageCount: 1 },
      ],
      idFor,
    });
    expect(state.episodes[0]).toMatchObject({ id: "new-0", number: 1, title: "1화 비 오는 날", document: { id: "d1", width: 690, height: 8_000, pageCount: 3 } });
    expect(state.episodes[1]).toMatchObject({ number: 2, document: { id: "d2", width: null } });
  });

  it("문서가 최소 회차보다 적으면 모자란 만큼 빈 칸을 이어 두고, 많으면 문서 수 그대로 둔다", () => {
    const documents = [1, 2, 3, 4].map((number) => ({ id: `d${number}`, title: `${number}화`, width: 690, height: 4_000, pageCount: 1 }));
    const few = initialSubmissionDraft({ saved: null, projectTitle: "내 작품", documents: documents.slice(0, 2), idFor });
    expect(few.episodes.map((episode) => [episode.id, episode.number, episode.document?.id ?? null])).toEqual([
      ["new-0", 1, "d1"],
      ["new-1", 2, "d2"],
      ["new-2", 3, null],
    ]);
    const many = initialSubmissionDraft({ saved: null, projectTitle: "내 작품", documents, idFor });
    expect(many.episodes.map((episode) => episode.number)).toEqual([1, 2, 3, 4]);
  });

  it("저장된 글이 있으면 그것을 쓰고, 회차는 저장된 번호·제목·메모로 복원한다(이미지는 비어 있다)", () => {
    const state = initialSubmissionDraft({
      saved: {
        ...EMPTY_SUBMISSION_DRAFT_TEXT,
        title: "저장된 제목",
        logline: "한 줄",
        targetWidth: "kakao",
        episodes: [{ id: "s1", number: 4, title: "4화", note: "메모" }],
        characterOverrides: { c1: false },
      },
      projectTitle: "무시되는 이름",
      documents: [{ id: "d1", title: "문서", width: 1, height: 1, pageCount: 1 }],
      idFor,
    });
    expect(state).toMatchObject({ title: "저장된 제목", logline: "한 줄", targetWidth: "kakao", characterOverrides: { c1: false } });
    expect(state.episodes).toEqual([{ id: "s1", number: 4, title: "4화", note: "메모", pages: [], reading: 0, document: null }]);
  });
});

describe("초안 갱신", () => {
  it("글 칸·점검 기준·표지 옵션을 바꾼다", () => {
    let state = stateWith();
    state = submissionDraftReducer(state, { type: "set-field", field: "logline", value: "새 로그라인" });
    state = submissionDraftReducer(state, { type: "set-target", value: "any" });
    state = submissionDraftReducer(state, { type: "set-include-pdf", value: false });
    state = submissionDraftReducer(state, { type: "set-cover-locale", value: "en" });
    expect(state).toMatchObject({ logline: "새 로그라인", targetWidth: "any", includeCoverPdf: false, coverLocale: "en" });
  });

  it("같은 값으로 바꾸면 상태 객체를 그대로 돌려준다", () => {
    const state = stateWith({ title: "같은 제목" });
    expect(submissionDraftReducer(state, { type: "set-field", field: "title", value: "같은 제목" })).toBe(state);
  });

  it("회차를 더하면 가장 큰 번호 다음 번호를 받고, 같은 id 는 두 번 더하지 않는다", () => {
    let state = stateWith();
    state = submissionDraftReducer(state, { type: "add-episode", id: "x" });
    expect(state.episodes.at(-1)).toMatchObject({ id: "x", number: 4 });
    expect(submissionDraftReducer(state, { type: "add-episode", id: "x" })).toBe(state);
    state = submissionDraftReducer(state, { type: "update-episode", id: "x", patch: { number: 10 } });
    state = submissionDraftReducer(state, { type: "add-episode", id: "y" });
    expect(state.episodes.at(-1)?.number).toBe(11);
  });

  it("회차를 지우고 번호·제목·메모를 고친다", () => {
    let state = stateWith();
    state = submissionDraftReducer(state, { type: "update-episode", id: "new-0", patch: { title: "첫 화", note: "도입" } });
    expect(state.episodes[0]).toMatchObject({ title: "첫 화", note: "도입", number: 1 });
    state = submissionDraftReducer(state, { type: "remove-episode", id: "new-1" });
    expect(state.episodes.map((episode) => episode.id)).toEqual(["new-0", "new-2"]);
  });

  it("없는 회차에 대한 갱신은 무시한다", () => {
    const state = stateWith();
    expect(submissionDraftReducer(state, { type: "update-episode", id: "none", patch: { title: "x" } })).toBe(state);
    expect(submissionDraftReducer(state, { type: "add-pages", id: "none", pages: [readyPage({ id: "a" })] })).toBe(state);
  });

  it("이미지를 더하고 지우고 순서를 바꾼다", () => {
    let state = stateWith();
    const pages = [readyPage({ id: "a" }), readyPage({ id: "b" }), readyPage({ id: "c" })];
    state = submissionDraftReducer(state, { type: "add-pages", id: "new-0", pages });
    expect(state.episodes[0]?.pages.map((page) => page.id)).toEqual(["a", "b", "c"]);
    state = submissionDraftReducer(state, { type: "move-page", id: "new-0", pageId: "c", direction: -1 });
    expect(state.episodes[0]?.pages.map((page) => page.id)).toEqual(["a", "c", "b"]);
    state = submissionDraftReducer(state, { type: "move-page", id: "new-0", pageId: "a", direction: -1 });
    expect(state.episodes[0]?.pages.map((page) => page.id)).toEqual(["a", "c", "b"]);
    state = submissionDraftReducer(state, { type: "move-page", id: "new-0", pageId: "b", direction: 1 });
    expect(state.episodes[0]?.pages.map((page) => page.id)).toEqual(["a", "c", "b"]);
    state = submissionDraftReducer(state, { type: "remove-page", id: "new-0", pageId: "c" });
    expect(state.episodes[0]?.pages.map((page) => page.id)).toEqual(["a", "b"]);
  });

  it("읽는 중인 파일 수는 0 아래로 내려가지 않는다", () => {
    let state = stateWith();
    state = submissionDraftReducer(state, { type: "reading", id: "new-0", delta: 3 });
    expect(state.episodes[0]?.reading).toBe(3);
    state = submissionDraftReducer(state, { type: "reading", id: "new-0", delta: -5 });
    expect(state.episodes[0]?.reading).toBe(0);
  });

  it("캐릭터는 직접 켜고 끈 선택을 기록한다", () => {
    let state = stateWith();
    state = submissionDraftReducer(state, { type: "toggle-character", characterId: "c1", value: true });
    state = submissionDraftReducer(state, { type: "toggle-character", characterId: "c2", value: false });
    expect(state.characterOverrides).toEqual({ c1: true, c2: false });
  });
});

describe("저장할 글 뽑기", () => {
  it("이미지와 읽기 상태는 제외하고 글·번호·선택만 담는다", () => {
    let state = stateWith();
    state = submissionDraftReducer(state, { type: "add-pages", id: "new-0", pages: [readyPage({ id: "a" })] });
    const text = submissionDraftToText(state);
    expect(JSON.stringify(text)).not.toContain("pages");
    expect(text.episodes[0]).toEqual({ id: "new-0", number: 1, title: "", note: "" });
    expect(createEmptyEpisode("z", 7)).toMatchObject({ id: "z", number: 7, pages: [], reading: 0, document: null });
  });
});
