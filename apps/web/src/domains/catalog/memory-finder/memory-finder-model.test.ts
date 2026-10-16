import { describe, expect, it } from "vitest";

import {
  MEMORY_MAX_SCENE_TOKENS,
  MEMORY_RESULT_LIMIT,
  buildMemorySearchQuery,
  countMemoryLevels,
  explainMemoryMatch,
  memoryCluesProblem,
  rankMemoryMatches,
  sceneTokenInfo,
  sceneTokens,
  summarizeMemoryOutcome,
  usableSynopsis,
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
    releaseYear: 2022,
    ...overrides,
  } as unknown as Title;
}

function clues(overrides: Partial<MemoryClues> = {}): MemoryClues {
  return { titleKnowledge: "unknown", titleText: "", scene: "비 오는 날 우산을 같이 쓰는 장면", ...overrides };
}

describe("sceneTokens", () => {
  it("의미 없는 낱말·한 글자·숫자뿐인 말·자모뿐인 말을 거르고 중복을 하나로 합친다", () => {
    const tokens = sceneTokens("주인공이 우산 우산 쓰고 그 장면 2012 a 웹툰 학교 ㅠㅠ ㅋㅋㅋ");
    expect(tokens.map((token) => token.clue)).toEqual(["우산", "쓰고", "학교"]);
  });

  it("같이·쓰는 같은 흔한 말과 영어 기능어는 단서로 쓰지 않는다", () => {
    expect(sceneTokens("비 오는 날 우산을 같이 쓰는 장면").map((token) => token.clue)).toEqual(["우산을"]);
    expect(sceneTokens("the girl and the dragon").map((token) => token.clue)).toEqual(["girl", "dragon"]);
  });

  it("조사가 붙은 말은 조사를 뗀 형태도 함께 시도하고 겹조사도 뗀다", () => {
    expect(sceneTokens("학교에서")[0]).toEqual({ clue: "학교에서", stems: ["학교에서", "학교"] });
    expect(sceneTokens("학교에서는")[0]).toEqual({ clue: "학교에서는", stems: ["학교에서는", "학교"] });
  });

  it("명사+하다·되다 활용은 명사로 되돌린다", () => {
    expect(sceneTokens("복수하는")[0]?.stems).toEqual(["복수하는", "복수"]);
    expect(sceneTokens("회귀해서")[0]?.stems).toEqual(["회귀해서", "회귀"]);
  });

  it("같은 낱말의 조사 변형(우산을·우산이·우산)은 하나로 센다", () => {
    const tokens = sceneTokens("우산을 우산이 우산");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.clue).toBe("우산을");
  });

  it("조사나 어미가 붙은 불용어와 한 글자 낱말은 단서로 쓰지 않는다", () => {
    expect(sceneTokens("주인공이 비 눈 물 주인공은 웹소설인데").map((token) => token.clue)).toEqual([]);
  });

  it("조사를 떼면 두 글자가 안 되는 말은 그대로 둔다", () => {
    expect(sceneTokens("나가")[0]?.stems).toEqual(["나가"]);
  });

  it("낱말은 여덟 개까지만 쓰고 넘치면 알린다", () => {
    const many = "하나둘 셋넷 다섯여섯 일곱여덟 아홉열 가나다 라마바 사아자 차카타 파하";
    const info = sceneTokenInfo(many);
    expect(info.tokens).toHaveLength(MEMORY_MAX_SCENE_TOKENS);
    expect(info.truncated).toBe(true);
    expect(sceneTokenInfo("우산 소나기").truncated).toBe(false);
  });
});

describe("memoryCluesProblem", () => {
  it("장면이 비었거나 의미 있는 낱말이 없으면 이유를 말한다", () => {
    expect(memoryCluesProblem(clues({ scene: "   " }))).toBe("scene-empty");
    expect(memoryCluesProblem(clues({ scene: "그 장면 내용 이야기" }))).toBe("scene-no-keywords");
    expect(memoryCluesProblem(clues({ scene: "ㅠㅠ ㅋㅋ" }))).toBe("scene-no-keywords");
    expect(memoryCluesProblem(clues())).toBeNull();
  });
});

describe("buildMemorySearchQuery", () => {
  it("제목 조각과 장면 낱말(조사를 뗀 형태 포함)을 중복 없이 이어 붙인다", () => {
    const query = buildMemorySearchQuery(clues({ titleKnowledge: "partial", titleText: " 레벨업 ", scene: "학교에서 학교 괴물" }));
    expect(query).toBe("레벨업 학교에서 학교 괴물");
  });

  it("제목을 모른다고 했으면 제목 칸에 글자가 남아 있어도 쓰지 않는다", () => {
    expect(buildMemorySearchQuery(clues({ titleKnowledge: "unknown", titleText: "숨은제목", scene: "괴물 학교" }))).toBe("괴물 학교");
  });

  it("서버 질의 길이 한도 안에 둔다", () => {
    const long = Array.from({ length: 60 }, (_, index) => `단어${String.fromCharCode(0xac00 + index)}${index}`).join(" ");
    expect(buildMemorySearchQuery(clues({ scene: long })).length).toBeLessThanOrEqual(480);
  });
});

describe("usableSynopsis", () => {
  it("출처 표기뿐인 자동 문구는 비교에서 뺀다", () => {
    expect(usableSynopsis(work({ id: "a", title: "나 혼자만 레벨업", synopsis: "나 혼자만 레벨업 · 네이버 시리즈 인기 웹소설." }))).toBe("");
    expect(usableSynopsis(work({ id: "b", title: "도시", synopsis: "도시 · 교보문고 공개 카탈로그 수집작." }))).toBe("");
  });

  it("제목 머리말이 붙은 서술형은 머리말만 떼고 본문을 쓴다", () => {
    const text = "도시 · 골목 끝 작은 가게에서 매일 밤 낯선 손님이 찾아와 이상한 부탁을 하기 시작한다";
    expect(usableSynopsis(work({ id: "c", title: "도시", synopsis: text }))).toBe("골목 끝 작은 가게에서 매일 밤 낯선 손님이 찾아와 이상한 부탁을 하기 시작한다");
  });

  it("머리말이 없는 서술형과 빈 소개를 그대로 다룬다", () => {
    expect(usableSynopsis(work({ id: "d", title: "무관", synopsis: "교도소 독방에 수감된 지호가 싸운다" }))).toBe("교도소 독방에 수감된 지호가 싸운다");
    expect(usableSynopsis(work({ id: "e", title: "무관", synopsis: "" }))).toBe("");
  });
});

describe("explainMemoryMatch — 제목 조각", () => {
  it("제목 조각이 제목 낱말 안에 그대로 들어 있으면 확인된 일치다", () => {
    const match = explainMemoryMatch(work({ id: "a", title: "나 혼자만 레벨업" }), clues({ titleKnowledge: "partial", titleText: "레벨업" }));
    expect(match?.level).toBe("confirmed");
    expect(match?.reasons).toContainEqual({ field: "title", clue: "레벨업" });
  });

  it("띄어쓰기를 빼야만 맞는 조각은 네 글자부터 확인으로 치고 근거에 그 사실을 남긴다", () => {
    const match = explainMemoryMatch(work({ id: "b", title: "나 혼자만 레벨업" }), clues({ titleKnowledge: "partial", titleText: "혼자만레벨" }));
    expect(match?.level).toBe("confirmed");
    expect(match?.reasons).toContainEqual({ field: "titleSpaced", clue: "혼자만레벨" });
  });

  it("낱말 경계를 넘는 짧은 우연 일치는 확인이 아니라 추정이다(‘아이돌’ ↔ ‘아이 돌려보내기’)", () => {
    const match = explainMemoryMatch(work({ id: "c", title: "아이 돌려보내기" }), clues({ titleKnowledge: "partial", titleText: "아이돌", scene: "가수가 되는 이야기" }));
    expect(match?.level).toBe("probable");
    expect(match?.reasons[0]).toEqual({ field: "titleSpaced", clue: "아이돌" });
  });

  it("‘정확히 기억해요’ 는 같은 제목일 때만 확인하고 제목에 들어 있기만 하면 추정이다", () => {
    const equal = explainMemoryMatch(work({ id: "d", title: "나 혼자만 레벨업" }), clues({ titleKnowledge: "exact", titleText: "나혼자만 레벨업" }));
    expect(equal?.level).toBe("confirmed");
    const contains = explainMemoryMatch(work({ id: "e", title: "나 혼자만 레벨업 외전" }), clues({ titleKnowledge: "exact", titleText: "나 혼자만 레벨업" }));
    expect(contains?.level).toBe("probable");
  });

  it("별칭에서만 맞아도 확인된 일치이고 근거는 별칭이다", () => {
    const match = explainMemoryMatch(
      work({ id: "f", title: "전지적 독자 시점", altTitles: ["Omniscient Reader"] }),
      clues({ titleKnowledge: "exact", titleText: "omniscient reader" }),
    );
    expect(match?.level).toBe("confirmed");
    expect(match?.reasons[0]).toEqual({ field: "altTitle", clue: "omniscient reader" });
  });

  it("두 글자가 안 되는 제목 조각은 근거로 쓰지 않는다", () => {
    expect(explainMemoryMatch(work({ id: "g", title: "가나다" }), clues({ titleKnowledge: "partial", titleText: "가", scene: "다른말" }))).toBeNull();
  });
});

describe("explainMemoryMatch — 장면 낱말", () => {
  it("서로 다른 낱말이 둘 이상 제목·태그·소개에서 겹치면 추정이고 근거마다 어느 칸인지 말한다", () => {
    const match = explainMemoryMatch(
      work({ id: "a", title: "첫사랑 일기", tags: ["우산"], synopsis: "갑작스러운 소나기가 내리던 날 시작되는 이야기" }),
      clues({ scene: "우산 소나기" }),
    );
    expect(match?.level).toBe("probable");
    expect(match?.reasons).toEqual([
      { field: "tag", clue: "우산" },
      { field: "synopsis", clue: "소나기" },
    ]);
  });

  it("낱말 하나만 겹치면 어느 칸이든(제목이어도) 약한 후보다", () => {
    const inSynopsis = explainMemoryMatch(work({ id: "b", title: "도시 이야기", synopsis: "골목 끝의 작은 가게" }), clues({ scene: "가게 주인" }));
    expect(inSynopsis?.level).toBe("weak");
    const inTitle = explainMemoryMatch(work({ id: "c", title: "우산 없는 애" }), clues({ scene: "고래 우산 등대 시계탑" }));
    expect(inTitle?.level).toBe("weak");
    expect(inTitle?.reasons).toEqual([{ field: "title", clue: "우산" }]);
  });

  it("같은 낱말의 조사 변형은 단서 둘이 아니라 하나다(‘우산을 우산이’)", () => {
    const match = explainMemoryMatch(work({ id: "d", title: "무관", synopsis: "이 이야기에는 우산 하나가 나온다 그리고 끝난다" }), clues({ scene: "우산을 우산이" }));
    expect(match?.level).toBe("weak");
    expect(match?.reasons).toEqual([{ field: "synopsis", clue: "우산" }]);
  });

  it("조사를 떼고 맞았으면 칩에는 실제로 맞은 형태를 보인다", () => {
    const match = explainMemoryMatch(work({ id: "e", title: "하늘 연못에 너를 피워내다" }), clues({ scene: "하늘을" }));
    expect(match?.reasons).toEqual([{ field: "title", clue: "하늘" }]);
  });

  it("낱말 경계를 넘어 우연히 이어 붙는 일치는 근거가 아니다(‘학교’ ↔ ‘입학 교실’)", () => {
    expect(explainMemoryMatch(work({ id: "f", title: "입학 교실의 비밀" }), clues({ scene: "학교" }))).toBeNull();
  });

  it("영문 낱말은 낱말 시작에서만 맞춘다", () => {
    expect(explainMemoryMatch(work({ id: "g", title: "Party Night" }), clues({ scene: "art" }))).toBeNull();
    const match = explainMemoryMatch(work({ id: "h", title: "Dragons of Winter" }), clues({ scene: "dragon" }));
    expect(match?.reasons).toEqual([{ field: "title", clue: "dragon" }]);
  });

  it("같은 낱말의 앞부분과 전체가 따로 맞으면 더 긴 쪽 하나만 쓴다(‘마법’·‘마법사’)", () => {
    const match = explainMemoryMatch(work({ id: "i", title: "마법사 학교" }), clues({ scene: "마법 마법사" }));
    expect(match?.level).toBe("weak");
    expect(match?.reasons).toEqual([{ field: "title", clue: "마법사" }]);
  });

  it("장르만 겹친 작품은 근거가 아니고, 작가 이름만 겹치면 약한 후보다", () => {
    expect(explainMemoryMatch(work({ id: "j", title: "무관", genres: ["판타지"] }), clues({ scene: "판타지" }))).toBeNull();
    const byAuthor = explainMemoryMatch(work({ id: "k", title: "다른 제목", author: "김하늘" }), clues({ scene: "하늘" }));
    expect(byAuthor?.level).toBe("weak");
    expect(byAuthor?.reasons).toEqual([{ field: "author", clue: "하늘" }]);
  });

  it("장르는 근거를 거들 뿐 ‘서로 다른 낱말 둘’로 세지 않는다", () => {
    const match = explainMemoryMatch(work({ id: "l", title: "무관", genres: ["판타지"], tags: ["회귀"] }), clues({ scene: "회귀 판타지" }));
    expect(match?.level).toBe("weak");
    expect(match?.reasons.map((reason) => reason.field)).toEqual(["tag", "genre"]);
  });

  it("출처 표기뿐인 자동 소개의 낱말(네이버·인기·시리즈)은 근거가 아니다", () => {
    const boilerplate = work({ id: "m", title: "무관한 웹소설", synopsis: "무관한 웹소설 · 네이버 시리즈 인기 웹소설." });
    expect(explainMemoryMatch(boilerplate, clues({ scene: "네이버에서 인기 많은 시리즈" }))).toBeNull();
  });

  it("아무 단서도 맞지 않으면 null 이다", () => {
    expect(explainMemoryMatch(work({ id: "n", title: "무관" }), clues({ scene: "우산" }))).toBeNull();
  });
});

describe("rankMemoryMatches / summarizeMemoryOutcome / countMemoryLevels", () => {
  const items: Title[] = [
    work({ id: "weak", title: "약함", synopsis: "우산이 하나 놓여 있는 이야기가 시작되는 날 아침" }),
    work({ id: "probable", title: "추정", tags: ["우산", "소나기"] }),
    work({ id: "confirmed", title: "우산 아래서" }),
    work({ id: "none", title: "무관" }),
  ];
  const asked = clues({ titleKnowledge: "partial", titleText: "우산아래", scene: "우산 소나기" });

  it("확신 단계 → 점수 순으로 정렬하고 근거 없는 작품은 뺀다", () => {
    const matches = rankMemoryMatches(items, asked);
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

  it("전체 단계는 가장 확실한 후보를 따르고 편수는 단계별로 센다", () => {
    const all = rankMemoryMatches(items, asked);
    expect(summarizeMemoryOutcome(all)).toBe("confirmed");
    expect(summarizeMemoryOutcome(all.filter((match) => match.level !== "confirmed"))).toBe("probable");
    expect(summarizeMemoryOutcome(all.filter((match) => match.level === "weak"))).toBe("weak");
    expect(summarizeMemoryOutcome([])).toBe("none");
    expect(countMemoryLevels(all)).toEqual({ confirmed: 1, probable: 1, weak: 1 });
  });

  it("흔한 말만 겹치는 현실적인 설명은 추정으로 부풀지 않는다", () => {
    const common = [
      work({ id: "x1", title: "자꾸 침대 같이 쓰는 사이" }),
      work({ id: "x2", title: "비 오는 날의 우산 없는 애" }),
    ];
    const matches = rankMemoryMatches(common, clues());
    expect(matches.map((match) => `${match.title.id}:${match.level}`)).toEqual(["x2:weak"]);
  });
});
