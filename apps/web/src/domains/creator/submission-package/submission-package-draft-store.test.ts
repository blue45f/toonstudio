import { describe, expect, it } from "vitest";

import {
  EMPTY_SUBMISSION_DRAFT_TEXT,
  parseSubmissionDraftText,
  readSubmissionDraftText,
  serializeSubmissionDraftText,
  submissionDraftStorageKey,
  writeSubmissionDraftText,
  type SubmissionDraftStorage,
  type SubmissionDraftText,
} from "./submission-package-draft-store";

const sample: SubmissionDraftText = {
  title: "달빛 아래 편의점",
  authorName: "밤토끼",
  logline: "한 줄 소개",
  synopsis: "줄거리\n둘째 줄",
  targetWidth: "kakao",
  includeCoverPdf: false,
  coverLocale: "en",
  episodes: [
    { id: "e1", number: 1, title: "1화", note: "시작" },
    { id: "e2", number: 2, title: "2화", note: "" },
  ],
  characterOverrides: { c1: true, c2: false },
};

function memoryStorage(initial: Record<string, string> = {}): SubmissionDraftStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("투고 패키지 글 저장", () => {
  it("저장한 글을 그대로 되읽는다", () => {
    expect(parseSubmissionDraftText(serializeSubmissionDraftText(sample))).toEqual(sample);
  });

  it("프로젝트마다 다른 키를 쓰고 id 를 인코딩한다", () => {
    expect(submissionDraftStorageKey("a/b c")).toBe("toonstudio:submission-package:v1:a%2Fb%20c");
    expect(submissionDraftStorageKey("p1")).not.toBe(submissionDraftStorageKey("p2"));
  });

  it("깨진 JSON·다른 버전·객체가 아닌 값은 저장된 글이 없는 것으로 본다", () => {
    expect(parseSubmissionDraftText(null)).toBeNull();
    expect(parseSubmissionDraftText("{깨짐")).toBeNull();
    expect(parseSubmissionDraftText("[]")).toBeNull();
    expect(parseSubmissionDraftText('"문자열"')).toBeNull();
    expect(parseSubmissionDraftText(JSON.stringify({ version: 2, title: "x" }))).toBeNull();
  });

  it("알 수 없는 값은 기본값으로 바꾸고 잘못된 회차·선택은 버린다", () => {
    const raw = JSON.stringify({
      version: 1,
      title: 12,
      targetWidth: "lezhin",
      coverLocale: "fr",
      includeCoverPdf: "yes",
      episodes: [
        { id: "ok", number: 3, title: "3화", note: "n" },
        { id: "", number: 1 },
        { id: "negative", number: -1 },
        { id: "float", number: 1.5 },
        { id: "blank-number", number: 0, title: "번호 비움" },
        { id: "ok", number: 4 },
        "문자열",
        null,
      ],
      characterOverrides: { good: true, bad: "yes", "": true },
    });
    expect(parseSubmissionDraftText(raw)).toEqual({
      ...EMPTY_SUBMISSION_DRAFT_TEXT,
      // 번호를 비워 둔 채 저장된 회차(0)는 남겨 다시 열었을 때도 잘못된 번호로 보이게 한다.
      episodes: [
        { id: "ok", number: 3, title: "3화", note: "n" },
        { id: "blank-number", number: 0, title: "번호 비움", note: "" },
      ],
      characterOverrides: { good: true },
    });
  });

  it("너무 긴 글은 잘라서 읽고 회차 수도 상한을 지킨다", () => {
    const raw = JSON.stringify({
      version: 1,
      title: "가".repeat(10_000),
      synopsis: "나".repeat(50_000),
      episodes: Array.from({ length: 300 }, (_, index) => ({ id: `e${index}`, number: index + 1 })),
    });
    const parsed = parseSubmissionDraftText(raw);
    expect(parsed?.title).toHaveLength(500);
    expect(parsed?.synopsis).toHaveLength(20_000);
    expect(parsed?.episodes).toHaveLength(100);
  });

  it("읽기·쓰기는 저장소 오류를 삼키고 결과로 알린다", () => {
    const storage = memoryStorage();
    expect(readSubmissionDraftText(storage, "p1")).toBeNull();
    expect(writeSubmissionDraftText(storage, "p1", sample)).toBe(true);
    expect(readSubmissionDraftText(storage, "p1")).toEqual(sample);
    expect(readSubmissionDraftText(storage, "p2")).toBeNull();

    const blocked: SubmissionDraftStorage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readSubmissionDraftText(blocked, "p1")).toBeNull();
    expect(writeSubmissionDraftText(blocked, "p1", sample)).toBe(false);
  });

  it("고른 이미지 파일은 저장 대상이 아니다", () => {
    const serialized = serializeSubmissionDraftText(sample);
    expect(serialized).not.toContain("blob");
    expect(serialized).not.toContain("pages");
  });
});
