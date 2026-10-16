import { describe, expect, it, vi } from "vitest";

import {
  buildResponseForExport,
  buildResponseFromDraft,
  createEmptyDraft,
  exportedRefOf,
  reusableResponseId,
  type KnownFeedbackTarget,
  type ReaderFeedbackDraft,
} from "./reader-feedback-draft";
import { CONTACT_MASK } from "./reader-feedback-text";

const META = { id: "draft-1", createdAt: "2026-10-16T02:00:00.000Z" } as const;
const KNOWN: KnownFeedbackTarget = { kind: "package", id: "pkg-9", title: "새 연재작 1화", episode: null, cutCount: 12 };

function draft(overrides: Partial<ReaderFeedbackDraft> = {}): ReaderFeedbackDraft {
  return { ...createEmptyDraft(), ...overrides };
}

function failure(result: ReturnType<typeof buildResponseFromDraft>) {
  if (result.ok) throw new Error("실패해야 하는 초안이 통과했습니다.");
  return result.errors;
}

function success(result: ReturnType<typeof buildResponseFromDraft>) {
  if (!result.ok) throw new Error(`성공해야 하는 초안이 실패했습니다: ${JSON.stringify(result.errors)}`);
  return result.response;
}

describe("독자 폼 초안 → 응답", () => {
  it("아무것도 답하지 않은 초안은 내보낼 수 없다", () => {
    expect(failure(buildResponseFromDraft(draft({ title: "작품" }), null, META))).toEqual([{ field: "empty", code: "nothing-answered" }]);
    expect(failure(buildResponseFromDraft(draft({ comment: "  \n\t " }), KNOWN, META))).toEqual([{ field: "empty", code: "nothing-answered" }]);
  });

  it("대상을 모르면 작품 이름이 필요하고, 아는 대상이면 독자가 입력한 제목을 쓰지 않는다", () => {
    expect(failure(buildResponseFromDraft(draft({ fun: 2 }), null, META))).toEqual([{ field: "title", code: "required" }]);
    expect(success(buildResponseFromDraft(draft({ title: "  내 작품  ", fun: 2 }), null, META)).target)
      .toEqual({ kind: "manual", id: null, title: "내 작품", episode: null });
    expect(success(buildResponseFromDraft(draft({ title: "바꿔치기", fun: 2 }), KNOWN, META)).target)
      .toEqual({ kind: "package", id: "pkg-9", title: "새 연재작 1화", episode: null });
  });

  it("아는 대상이면 독자가 입력한 회차 칸과 무관하게 대상이 정한 회차를 쓴다", () => {
    const known = { ...KNOWN, episode: 5 };
    expect(success(buildResponseFromDraft(draft({ fun: 1, episode: "abc" }), known, META)).target.episode).toBe(5);
    expect(success(buildResponseFromDraft(draft({ fun: 1, episode: "9" }), KNOWN, META)).target.episode).toBeNull();
  });

  it("회차 번호는 비우거나 1~9999 정수여야 한다", () => {
    const run = (episode: string) => buildResponseFromDraft(draft({ title: "작품", fun: 1, episode }), null, META);
    expect(success(run("")).target.episode).toBeNull();
    expect(success(run(" 12 ")).target.episode).toBe(12);
    for (const bad of ["0", "10000", "abc", "1.5", "-3", "1e3", "０５"]) {
      const errors = failure(run(bad));
      expect(errors[0]?.field).toBe("episode");
    }
    expect(failure(run("0"))[0]?.code).toBe("out-of-range");
    expect(failure(run("abc"))[0]?.code).toBe("invalid-number");
  });

  it("중간에 멈췄다면 위치가 필요하다: 컷 번호는 전체 컷 수 안이어야 한다", () => {
    const run = (cut: string, known: KnownFeedbackTarget | null = KNOWN) =>
      buildResponseFromDraft(draft({ reading: "left", pointMode: "cut", cut }), known, META);
    expect(failure(run(""))[0]).toEqual({ field: "cut", code: "required" });
    expect(failure(run("x"))[0]).toEqual({ field: "cut", code: "invalid-number" });
    expect(failure(run("0"))[0]).toEqual({ field: "cut", code: "out-of-range" });
    expect(failure(run("13"))[0]).toEqual({ field: "cut", code: "out-of-range" });
    expect(success(run("12")).reading).toEqual({ status: "left", point: { mode: "cut", cut: 12, cutCount: 12 } });
    // 전체 컷 수를 모르면 상한(500)만 본다.
    const free = (cut: string) => buildResponseFromDraft(draft({ title: "작품", reading: "left", pointMode: "cut", cut }), null, META);
    expect(success(free("500")).reading).toEqual({ status: "left", point: { mode: "cut", cut: 500, cutCount: null } });
    expect(failure(free("501"))[0]).toEqual({ field: "cut", code: "out-of-range" });
  });

  it("스크롤 위치는 0~100 으로 맞춰 담고, 끝까지 읽음과 표시 안 함도 담는다", () => {
    const left = (scroll: number) => buildResponseFromDraft(draft({ reading: "left", pointMode: "scroll", scroll }), KNOWN, META);
    expect(success(left(35.4)).reading).toEqual({ status: "left", point: { mode: "scroll", percent: 35 } });
    expect(success(left(250)).reading).toEqual({ status: "left", point: { mode: "scroll", percent: 100 } });
    expect(success(left(-5)).reading).toEqual({ status: "left", point: { mode: "scroll", percent: 0 } });
    expect(success(buildResponseFromDraft(draft({ reading: "finished" }), KNOWN, META)).reading).toEqual({ status: "finished" });
    expect(success(buildResponseFromDraft(draft({ fun: 3 }), KNOWN, META)).reading).toEqual({ status: "unmarked" });
  });

  it("감정은 정해진 순서로 담고 닉네임을 비우면 null 이며 id·시각은 그대로 쓴다", () => {
    const response = success(buildResponseFromDraft(draft({ emotions: ["tense", "funny", "excited"], nickname: "  ", comment: "좋아요", spoiler: true }), KNOWN, META));
    expect(response.emotions).toEqual(["excited", "funny", "tense"]);
    expect(response.nickname).toBeNull();
    expect(response.spoiler).toBe(true);
    expect(response.id).toBe(META.id);
    expect(response.createdAt).toBe(META.createdAt);
  });

  it("의견과 닉네임의 연락처는 가려지거나 비워진다", () => {
    const response = success(buildResponseFromDraft(draft({ comment: "mail me: a.b@c.com", nickname: "010-1111-2222" }), KNOWN, META));
    expect(response.comment).toBe(`mail me: ${CONTACT_MASK}`);
    expect(response.nickname).toBeNull();
  });

  it("연락처만 적은 의견도 가려진 글이 남으므로 답한 것으로 본다", () => {
    expect(success(buildResponseFromDraft(draft({ comment: "a@b.co" }), KNOWN, META)).comment).toBe(CONTACT_MASK);
  });
});

describe("다시 내보낼 때 응답 id 를 잇는 규칙", () => {
  const NOW = "2026-10-16T03:00:00.000Z";
  const ids = () => {
    let count = 0;
    const createId = vi.fn(() => `new-${(count += 1)}`);
    return createId;
  };
  const manual = (overrides: Partial<ReaderFeedbackDraft> = {}) => draft({ title: "내 작품", episode: "1", fun: 2, ...overrides });

  it("처음 내보낼 때는 새 id 를 한 번 만든다", () => {
    const createId = ids();
    const result = buildResponseForExport(manual(), null, null, NOW, createId);
    expect(success(result).id).toBe("new-1");
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("같은 작품·회차로 다시 내보내면 앞선 id 를 잇고 새 id 를 만들지 않는다", () => {
    const createId = ids();
    const first = success(buildResponseForExport(manual(), null, null, NOW, createId));
    const again = success(buildResponseForExport(manual({ comment: "고친 의견" }), null, exportedRefOf(first), NOW, createId));
    expect(again.id).toBe(first.id);
    expect(createId).toHaveBeenCalledTimes(1);
    // 대소문자·띄어쓰기만 다른 이름은 같은 묶음이다.
    const respaced = success(buildResponseForExport(manual({ title: "  내   작품 " }), null, exportedRefOf(first), NOW, createId));
    expect(respaced.id).toBe(first.id);
  });

  it("작품 이름이나 회차가 바뀌면 새 id 를 쓰고, 회차를 비우는 것도 다른 묶음이다", () => {
    const createId = ids();
    const first = success(buildResponseForExport(manual(), null, null, NOW, createId));
    const previous = exportedRefOf(first);
    expect(success(buildResponseForExport(manual({ episode: "2" }), null, previous, NOW, createId)).id).toBe("new-2");
    expect(success(buildResponseForExport(manual({ episode: "" }), null, previous, NOW, createId)).id).toBe("new-3");
    expect(success(buildResponseForExport(manual({ title: "다른 작품" }), null, previous, NOW, createId)).id).toBe("new-4");
    expect(createId).toHaveBeenCalledTimes(4);
  });

  it("아는 대상은 묶음이 바뀔 수 없으므로 항상 앞선 id 를 잇는다", () => {
    const createId = ids();
    const first = success(buildResponseForExport(draft({ fun: 2 }), KNOWN, null, NOW, createId));
    const again = success(buildResponseForExport(draft({ fun: 3, title: "무시되는 입력", episode: "9" }), KNOWN, exportedRefOf(first), NOW, createId));
    expect(again.id).toBe(first.id);
  });

  it("만들지 못하는 초안은 오류만 돌려주고, 같은 묶음 여부는 스키마 정리 뒤의 대상으로 가른다", () => {
    const createId = ids();
    expect(failure(buildResponseForExport(draft({ title: "내 작품" }), null, null, NOW, createId))).toEqual([{ field: "empty", code: "nothing-answered" }]);
    const first = success(buildResponseForExport(manual(), null, null, NOW, createId));
    expect(reusableResponseId(exportedRefOf(first), first)).toBe(first.id);
    expect(reusableResponseId(null, first)).toBeNull();
    const other = success(buildResponseFromDraft(manual({ episode: "3" }), null, { id: "x", createdAt: NOW }));
    expect(reusableResponseId(exportedRefOf(first), other)).toBeNull();
  });
});
