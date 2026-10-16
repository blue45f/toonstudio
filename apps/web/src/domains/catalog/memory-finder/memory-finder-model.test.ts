import { describe, expect, it } from "vitest";

import {
  MEMORY_RESULT_LIMIT,
  buildMemorySearchQuery,
  explainMemoryMatch,
  memoryCluesProblem,
  rankMemoryMatches,
  sceneTokens,
  summarizeMemoryOutcome,
  type MemoryClues,
} from "./memory-finder-model";

import type { Title } from "@/shared/lib/types";

function work(overrides: Partial<Title> & { id: string; title: string }): Title {
  return {
    slug: overrides.id,
    type: "webtoon",
    author: "작가",
    genres: [],
    tags: [],
    synopsis: "",
    releaseYear: 2014,
    ...overrides,
  } as unknown as Title;
}

function clues(overrides: Partial<MemoryClues> = {}): MemoryClues {
  return { titleKnowledge: "unknown", titleText: "", scene: "비 오는 날 우산을 같이 쓰는 장면", era: "any", ...overrides };
}

describe("sceneTokens", () => {
  it("의미 없는 낱말·한 글자·숫자뿐인 말을 거르고 중복을 하나로 합친다", () => {
    const tokens = sceneTokens("주인공이 우산 우산 쓰고 그 장면 2012 a 웹툰 학교");
    expect(tokens.map((token) => token.clue)).toEqual(["우산", "쓰고", "학교"]);
  });

  it("조사가 붙은 말은 조사를 뗀 형태도 함께 시도한다", () => {
    const [token] = sceneTokens("학교에서");
    expect(token).toEqual({ clue: "학교에서", stems: ["학교에서", "학교"] });
  });

  it("조사가 붙은 불용어와 한 글자 낱말은 단서로 쓰지 않는다", () => {
    expect(sceneTokens("주인공이 비 눈 물 주인공은").map((token) => token.clue)).toEqual([]);
  });

  it("조사를 떼면 두 글자가 안 되는 말은 그대로 둔다", () => {
    const [token] = sceneTokens("나가");
    expect(token?.stems).toEqual(["나가"]);
  });

  it("낱말은 여덟 개까지만 쓴다", () => {
    const tokens = sceneTokens("하나둘 셋넷 다섯여섯 일곱여덟 아홉열 가나다 라마바 사아자 차카타 파하");
    expect(tokens).toHaveLength(8);
  });
});

describe("memoryCluesProblem", () => {
  it("장면이 비었거나 의미 있는 낱말이 없으면 이유를 말한다", () => {
    expect(memoryCluesProblem(clues({ scene: "   " }))).toBe("scene-empty");
    expect(memoryCluesProblem(clues({ scene: "그 장면 내용 이야기" }))).toBe("scene-no-keywords");
    expect(memoryCluesProblem(clues())).toBeNull();
  });
});

describe("buildMemorySearchQuery", () => {
  it("제목 조각과 장면 낱말(조사를 뗀 형태 포함)을 중복 없이 이어 붙인다", () => {
    const query = buildMemorySearchQuery(
      clues({ titleKnowledge: "partial", titleText: " 레벨업 ", scene: "학교에서 학교 괴물" }),
    );
    expect(query).toBe("레벨업 학교에서 학교 괴물");
  });

  it("제목을 모른다고 했으면 제목 칸에 글자가 남아 있어도 쓰지 않는다", () => {
    expect(buildMemorySearchQuery(clues({ titleKnowledge: "unknown", titleText: "숨은제목", scene: "괴물 학교" }))).toBe(
      "괴물 학교",
    );
  });

  it("서버 질의 길이 한도 안에 둔다", () => {
    const long = Array.from({ length: 60 }, (_, index) => `단어${String.fromCharCode(0xac00 + index)}${index}`).join(" ");
    expect(buildMemorySearchQuery(clues({ scene: long })).length).toBeLessThanOrEqual(480);
  });
});

describe("explainMemoryMatch", () => {
  it("제목 조각이 제목에 들어 있으면 확인된 일치다", () => {
    const match = explainMemoryMatch(
      work({ id: "a", title: "나 혼자만 레벨업" }),
      clues({ titleKnowledge: "partial", titleText: "혼자만레벨" }),
    );
    expect(match?.level).toBe("confirmed");
    expect(match?.reasons).toContainEqual({ field: "title", clue: "혼자만레벨" });
  });

  it("별칭에서만 맞아도 확인된 일치이고 근거는 별칭이다", () => {
    const match = explainMemoryMatch(
      work({ id: "b", title: "전지적 독자 시점", altTitles: ["Omniscient Reader"] }),
      clues({ titleKnowledge: "exact", titleText: "omniscient reader" }),
    );
    expect(match?.level).toBe("confirmed");
    expect(match?.reasons[0]).toEqual({ field: "altTitle", clue: "omniscient reader" });
  });

  it("장면 낱말이 둘 이상 겹치면 추정(probable)이고 근거마다 어느 칸인지 말한다", () => {
    const match = explainMemoryMatch(
      work({ id: "c", title: "첫사랑 일기", tags: ["우산"], synopsis: "갑작스러운 소나기가 내리던 날 시작되는 이야기" }),
      clues({ scene: "우산 소나기" }),
    );
    expect(match?.level).toBe("probable");
    expect(match?.reasons).toEqual([
      { field: "tag", clue: "우산" },
      { field: "synopsis", clue: "소나기" },
    ]);
  });

  it("낱말 하나가 소개에서만 맞으면 약한 후보다", () => {
    const match = explainMemoryMatch(work({ id: "d", title: "도시 이야기", synopsis: "골목 끝의 작은 가게" }), clues({ scene: "가게 주인" }));
    expect(match?.level).toBe("weak");
    expect(match?.reasons).toEqual([{ field: "synopsis", clue: "가게" }]);
  });

  it("낱말 하나라도 제목·작가에서 맞으면 약한 후보로 두지 않고 추정으로 올린다", () => {
    const byAuthor = explainMemoryMatch(work({ id: "e", title: "다른 제목", author: "김하늘" }), clues({ scene: "하늘" }));
    expect(byAuthor?.level).toBe("probable");
    expect(byAuthor?.reasons[0]?.field).toBe("author");
  });

  it("아무 단서도 맞지 않으면 null 이고 시기만 맞는 것은 근거가 못 된다", () => {
    expect(explainMemoryMatch(work({ id: "f", title: "무관", releaseYear: 2013 }), clues({ era: "2011-2015", scene: "우산" }))).toBeNull();
  });

  it("시기는 근거가 이미 있을 때만 거든다(필터가 아니다)", () => {
    const inRange = explainMemoryMatch(work({ id: "g", title: "우산", releaseYear: 2012 }), clues({ era: "2011-2015", scene: "우산" }));
    const outOfRange = explainMemoryMatch(work({ id: "h", title: "우산", releaseYear: 2020 }), clues({ era: "2011-2015", scene: "우산" }));
    expect(inRange?.reasons.map((reason) => reason.field)).toContain("year");
    expect(outOfRange?.reasons.map((reason) => reason.field)).not.toContain("year");
    expect(outOfRange).not.toBeNull();
  });

  it("두 글자가 안 되는 제목 조각은 확인의 근거로 쓰지 않는다", () => {
    const match = explainMemoryMatch(work({ id: "i", title: "가나다" }), clues({ titleKnowledge: "partial", titleText: "가", scene: "다른말" }));
    expect(match).toBeNull();
  });
});

describe("rankMemoryMatches / summarizeMemoryOutcome", () => {
  const items: Title[] = [
    work({ id: "weak", title: "약함", synopsis: "우산" }),
    work({ id: "probable", title: "추정", tags: ["우산", "소나기"] }),
    work({ id: "confirmed", title: "우산 아래서" }),
    work({ id: "none", title: "무관" }),
  ];

  it("확신 단계 → 점수 순으로 정렬하고 근거 없는 작품은 뺀다", () => {
    const matches = rankMemoryMatches(items, clues({ titleKnowledge: "partial", titleText: "우산아래", scene: "우산 소나기" }));
    expect(matches.map((match) => `${match.title.id}:${match.level}`)).toEqual([
      "confirmed:confirmed",
      "probable:probable",
      "weak:weak",
    ]);
  });

  it("결과는 한도까지만 돌려준다", () => {
    const many = Array.from({ length: 30 }, (_, index) => work({ id: `t${index}`, title: `우산 ${index}` }));
    expect(rankMemoryMatches(many, clues({ scene: "우산" }))).toHaveLength(MEMORY_RESULT_LIMIT);
    expect(rankMemoryMatches(many, clues({ scene: "우산" }), 3)).toHaveLength(3);
  });

  it("전체 단계는 가장 확실한 후보를 따른다", () => {
    const all = rankMemoryMatches(items, clues({ titleKnowledge: "partial", titleText: "우산아래", scene: "우산 소나기" }));
    expect(summarizeMemoryOutcome(all)).toBe("confirmed");
    expect(summarizeMemoryOutcome(all.filter((match) => match.level !== "confirmed"))).toBe("probable");
    expect(summarizeMemoryOutcome(all.filter((match) => match.level === "weak"))).toBe("weak");
    expect(summarizeMemoryOutcome([])).toBe("none");
  });
});
