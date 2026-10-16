import { describe, expect, it } from "vitest";

import {
  orderSubmissionDocuments,
  readEpisodeNumberFromTitle,
  type SubmissionDocumentSeed,
} from "./submission-package-document-order";

function seed(id: string, title: string, createdAt: string): SubmissionDocumentSeed {
  return { id, title, width: 690, height: 4_000, pageCount: 1, createdAt };
}

function summary(documents: readonly SubmissionDocumentSeed[]): Array<readonly [number, string]> {
  return orderSubmissionDocuments(documents).map((entry): readonly [number, string] => [entry.number, entry.document.id]);
}

describe("제목 앞의 회차 숫자 읽기", () => {
  it.each([
    ["EP01 원고", 1],
    ["ep.3", 3],
    ["Ep 12 최종", 12],
    ["Episode 5", 5],
    ["1화 비 오는 날", 1],
    ["03화", 3],
    ["제3화 시간 상인", 3],
    ["12회", 12],
    ["3회차 원고", 3],
    ["  7 화 ", 7],
    ["１０화 마지막 손님", 10],
    ["EP０２", 2],
  ])("%s → %i", (title, expected) => {
    expect(readEpisodeNumberFromTitle(title)).toBe(expected);
  });

  it.each([
    "프롤로그",
    "새 웹툰",
    "첫 손님",
    "2024 여름 특집",
    "시즌2 1화",
    "원고 3화",
    "0화",
    "EP0",
    "EP",
    "Episode",
    "12345화",
    "EP12345",
    "",
    "   ",
  ])("회차 숫자로 읽지 않는다: %j", (title) => {
    expect(readEpisodeNumberFromTitle(title)).toBeNull();
  });
});

describe("문서를 회차 순서로 놓고 번호 붙이기", () => {
  it("문서가 없으면 빈 목록이다", () => {
    expect(orderSubmissionDocuments([])).toEqual([]);
  });

  it("최근에 연 순(내림차순)으로 들어와도 만든 순서(오래된 것이 앞)대로 1화부터 번호를 붙인다", () => {
    expect(
      summary([
        seed("doc-3", "세 번째 손님", "2026-10-15T09:02:00.000Z"),
        seed("doc-2", "두 번째 손님", "2026-10-15T09:01:00.000Z"),
        seed("doc-1", "첫 손님", "2026-10-15T09:00:00.000Z"),
      ]),
    ).toEqual([
      [1, "doc-1"],
      [2, "doc-2"],
      [3, "doc-3"],
    ]);
  });

  it("모든 제목에 서로 다른 회차 숫자가 있으면 만든 순서와 달라도 그 숫자가 번호이고 숫자 순으로 놓는다", () => {
    expect(
      summary([
        seed("a", "3화 시간 상인", "2026-10-15T09:00:00.000Z"),
        seed("b", "1화 편의점의 밤", "2026-10-15T09:01:00.000Z"),
        seed("c", "2화 도깨비 손님", "2026-10-15T09:02:00.000Z"),
      ]),
    ).toEqual([
      [1, "b"],
      [2, "c"],
      [3, "a"],
    ]);
  });

  it("제목의 숫자가 건너뛰어도 그대로 쓴다(번호를 새로 매기지 않는다)", () => {
    expect(
      summary([
        seed("a", "EP07 원고", "2026-10-15T09:00:00.000Z"),
        seed("b", "EP05 원고", "2026-10-15T09:01:00.000Z"),
      ]),
    ).toEqual([
      [5, "b"],
      [7, "a"],
    ]);
  });

  it("일부 제목만 숫자를 가졌으면 제목에서 읽지 않고 만든 순서로 번호를 붙인다", () => {
    expect(
      summary([
        seed("a", "프롤로그", "2026-10-15T09:00:00.000Z"),
        seed("b", "1화 편의점의 밤", "2026-10-15T09:01:00.000Z"),
        seed("c", "2화 도깨비 손님", "2026-10-15T09:02:00.000Z"),
      ]),
    ).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("제목의 숫자가 겹치면 어느 쪽이 맞는지 알 수 없으니 만든 순서로 번호를 붙인다", () => {
    expect(
      summary([
        seed("a", "2화 초안", "2026-10-15T09:00:00.000Z"),
        seed("b", "2화 최종", "2026-10-15T09:01:00.000Z"),
        seed("c", "3화", "2026-10-15T09:02:00.000Z"),
      ]),
    ).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("만든 시각이 같으면(가져온 프로젝트) 제목의 숫자 크기 순으로 놓는다 — 10 이 2 앞에 오지 않는다", () => {
    const at = "2026-10-15T09:00:00.000Z";
    expect(
      summary([
        seed("a", "컷 10", at),
        seed("b", "컷 2", at),
        seed("c", "컷 1", at),
      ]),
    ).toEqual([
      [1, "c"],
      [2, "b"],
      [3, "a"],
    ]);
  });

  it("만든 시각과 제목이 모두 같으면 받은 순서를 지킨다", () => {
    const at = "2026-10-15T09:00:00.000Z";
    expect(summary([seed("first", "같은 이름", at), seed("second", "같은 이름", at)])).toEqual([
      [1, "first"],
      [2, "second"],
    ]);
  });

  it("만든 시각을 읽지 못하는 문서는 가장 나중에 만든 것으로 본다", () => {
    expect(
      summary([
        seed("broken", "시각 없음", "아님"),
        seed("late", "나중", "2026-10-15T09:02:00.000Z"),
        seed("early", "먼저", "2026-10-15T09:00:00.000Z"),
      ]),
    ).toEqual([
      [1, "early"],
      [2, "late"],
      [3, "broken"],
    ]);
  });

  it("받은 배열과 문서 객체를 바꾸지 않는다", () => {
    const documents = [seed("b", "둘", "2026-10-15T09:01:00.000Z"), seed("a", "하나", "2026-10-15T09:00:00.000Z")];
    const before = JSON.stringify(documents);
    orderSubmissionDocuments(documents);
    expect(JSON.stringify(documents)).toBe(before);
    expect(documents.map((document) => document.id)).toEqual(["b", "a"]);
  });
});
