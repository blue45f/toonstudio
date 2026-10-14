import { describe, expect, it } from "vitest";

import { fuzzyFilterByTexts, fuzzyRankByTexts } from "./fuzzy-search";

interface WorkLike {
  readonly title: string;
  readonly author: string;
}

const works: readonly WorkLike[] = [
  { title: "스튜디오 대시보드", author: "김작가" },
  { title: "로맨스판타지 신작", author: "이작가" },
  { title: "학원 액션 연대기", author: "박작가" },
  { title: "Studio Nights", author: "Jane" },
];

const workTexts = (work: WorkLike): readonly string[] => [work.title, work.author];

describe("fuzzy-search (fuse.js 공용 엔진)", () => {
  it("정확 부분일치는 원래 순서를 그대로 유지한다", () => {
    const ranked = fuzzyRankByTexts(works, "스튜디오", workTexts);
    expect(ranked.map((entry) => entry.item.title)).toEqual(["스튜디오 대시보드"]);
    expect(ranked[0]?.exact).toBe(true);
    expect(ranked[0]?.score).toBe(0);
  });

  it("초성 질의는 정확 패스로 잡는다 (es-hangul 전처리 결합)", () => {
    const ranked = fuzzyRankByTexts(works, "ㅅㅌㄷㅇ", workTexts);
    expect(ranked.map((entry) => entry.item.title)).toEqual(["스튜디오 대시보드"]);
    expect(ranked[0]?.exact).toBe(true);
  });

  it("공백을 넣거나 빼는 질의는 공백 무시 부분일치로 정확 처리한다", () => {
    expect(fuzzyRankByTexts(works, "로맨스 판타지", workTexts)[0]?.exact).toBe(true);
    expect(fuzzyRankByTexts(works, "학원액션", workTexts).map((entry) => entry.item.title)).toEqual([
      "학원 액션 연대기",
    ]);
  });

  it("한 글자 오타는 퍼지 패스로 찾고 exact=false 로 구분한다", () => {
    const korean = fuzzyRankByTexts(works, "스튜지오", workTexts);
    expect(korean.map((entry) => entry.item.title)).toEqual(["스튜디오 대시보드"]);
    expect(korean[0]?.exact).toBe(false);
    expect(korean[0]?.score).toBeGreaterThan(0);
    expect(korean[0]?.score).toBeLessThanOrEqual(0.4);

    const english = fuzzyRankByTexts(works, "studoi", workTexts);
    expect(english.map((entry) => entry.item.title)).toEqual(["Studio Nights"]);
    expect(english[0]?.exact).toBe(false);
  });

  it("모음·받침만 틀린 오타는 초성 동등으로 정확 패스에 흡수된다", () => {
    const ranked = fuzzyRankByTexts(works, "스튜디요", workTexts);
    expect(ranked.map((entry) => entry.item.title)).toEqual(["스튜디오 대시보드"]);
    expect(ranked[0]?.exact).toBe(true);
  });

  it("키워드 필드의 영문 오타도 찾는다 (팔레트 키워드 패턴)", () => {
    const commands = [
      { title: "효과음 토글", keywords: ["소리", "사운드", "sfx", "audio"] },
      { title: "G펜", keywords: ["브러시", "선화", "pen", "brush"] },
    ];
    const texts = (cmd: (typeof commands)[number]): readonly string[] => [cmd.title, ...cmd.keywords];
    expect(fuzzyFilterByTexts(commands, "bursh", texts).map((cmd) => cmd.title)).toEqual(["G펜"]);
    expect(fuzzyFilterByTexts(commands, "penn", texts).map((cmd) => cmd.title)).toEqual(["G펜"]);
    expect(fuzzyFilterByTexts(commands, "브러쉬", texts).map((cmd) => cmd.title)).toEqual(["G펜"]);
  });

  it("무관한 질의는 오탐 상한에 걸려 빈 결과가 된다", () => {
    expect(fuzzyRankByTexts(works, "없는작품", workTexts)).toEqual([]);
    const dialogueTexts = ["안녕? 민수야", "민수의 아침", "민수... 왜 저래", "다음 날 민수네 집", "MINSU!"];
    expect(fuzzyFilterByTexts(dialogueTexts, "없는대사", (text) => [text])).toEqual([]);
    expect(fuzzyFilterByTexts(dialogueTexts, "업는대사", (text) => [text])).toEqual([]);
  });

  it("정확 결과가 퍼지 결과보다 앞에 오고, 퍼지끼리는 점수순이다", () => {
    const pool = [
      { title: "스튜지오 라이프", author: "가" },
      { title: "스튜디오 대시보드", author: "나" },
    ];
    const ranked = fuzzyRankByTexts(pool, "스튜디오", workTexts);
    expect(ranked.map((entry) => entry.item.title)).toEqual(["스튜디오 대시보드", "스튜지오 라이프"]);
    expect(ranked.map((entry) => entry.exact)).toEqual([true, false]);
  });

  it("빈 질의는 전 항목을 원래 순서·정확으로 돌려준다", () => {
    const ranked = fuzzyRankByTexts(works, "   ", workTexts);
    expect(ranked.map((entry) => entry.item.title)).toEqual(works.map((work) => work.title));
    expect(ranked.every((entry) => entry.exact)).toBe(true);
  });

  it("limit 은 정확+퍼지 합산 상한으로 동작한다", () => {
    const pool = [
      { title: "민수 이야기", author: "가" },
      { title: "민수네 집", author: "나" },
      { title: "민수없다", author: "다" },
    ];
    expect(fuzzyRankByTexts(pool, "민수", workTexts, { limit: 2 })).toHaveLength(2);
    expect(fuzzyRankByTexts(pool, "민수", workTexts, { limit: 0 })).toEqual([]);
  });

  it("1자 질의와 초성이 바뀌는 2자 오타는 보장 범위 밖이라 퍼지하지 않는다", () => {
    // "집" 1자: 정확·초성 패스만으로 판정한다(퍼지 패스 미실행이 설계).
    const ranked = fuzzyRankByTexts([{ title: "우리 집 이야기", author: "가" }], "집", workTexts);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.exact).toBe(true);
    // "민주"→"민수": 2자 중 1자(초성까지) 변경은 Bitap 판별 한계 — 빈 결과.
    expect(fuzzyRankByTexts(works, "민주", workTexts)).toEqual([]);
  });
});
