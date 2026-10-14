import { describe, expect, it } from "vitest";

import {
  addMoodboardCard,
  createMoodboard,
  type Moodboard,
} from "./studio-moodboard";
import {
  applyCharacterProfileDraftFromMoodboard,
  applyEpisodePlanDraftFromMoodboard,
  cardsFromPastedText,
  classifyCollectedUrl,
  collectPastedTextIntoBoard,
  deriveCharacterProfileDraftFromMoodboard,
  deriveEpisodePlanDraftFromMoodboard,
  extractUrlsFromPastedText,
  type EpisodePlanDraftFromMoodboard,
} from "./studio-moodboard-web-collect";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";

function idGen(prefix = "gen") {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function sampleBoard(): Moodboard {
  let board = createMoodboard({ id: "b1", title: "무드", projectId: "p1" });
  board = addMoodboardCard(board, "b1-col-0", {
    id: "img1",
    kind: "image",
    ref: "https://cdn.example.com/alley-night.png",
    text: "밤 골목",
  });
  board = addMoodboardCard(board, "b1-col-0", {
    id: "link1",
    kind: "link",
    ref: "https://example.com/ref-article",
    text: "참고 기사",
  });
  board = addMoodboardCard(board, "b1-col-1", {
    id: "note1",
    kind: "note",
    text: "주인공이 처음으로 거짓말을 들킨다. 골목에서 뛰쳐나간다.",
  });
  board = addMoodboardCard(board, "b1-col-2", {
    id: "todo1",
    kind: "todo",
    text: "동생을 지키겠다는 약속을 지킨다",
    done: false,
  });
  return board;
}

describe("웹 수집 — 붙여넣기에서 URL 뽑기·분류", () => {
  it("URL만 뽑고 중복과 끝 구두점을 정리한다", () => {
    expect(
      extractUrlsFromPastedText(
        "이거 봐 https://example.com/a, 그리고 (https://example.com/a) 또 https://example.com/b.",
      ),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(extractUrlsFromPastedText("URL 없는 메모")).toEqual([]);
    expect(extractUrlsFromPastedText("javascript:alert(1) ftp://x.example/f")).toEqual([]);
  });

  it("이미지 확장자는 이미지로, 나머지는 링크로 분류한다 (쿼리·대문자 무시)", () => {
    expect(classifyCollectedUrl("https://cdn.example.com/x.PNG?w=800")).toBe("image");
    expect(classifyCollectedUrl("https://cdn.example.com/x.webp")).toBe("image");
    expect(classifyCollectedUrl("https://example.com/page?img=a.png")).toBe("link");
    expect(classifyCollectedUrl("https://example.com/article")).toBe("link");
  });

  it("마크다운 이미지 붙여넣기도 이미지 카드가 된다", () => {
    const cards = cardsFromPastedText("![골목](https://cdn.example.com/night-alley.jpg)", idGen("c"));
    expect(cards).toEqual([
      { id: "c-1", kind: "image", ref: "https://cdn.example.com/night-alley.jpg", text: "night alley" },
    ]);
  });
});

describe("웹 수집 — 보드에 붙이기", () => {
  it("링크 붙여넣기 1번으로 첫 열에 카드가 생긴다", () => {
    const board = createMoodboard({ id: "b1", title: "무드", projectId: "p1" });
    const result = collectPastedTextIntoBoard(
      board,
      "b1-col-0",
      "https://cdn.example.com/rain.jpg",
      idGen("w"),
    );
    expect(result.addedCardIds).toEqual(["w-1"]);
    expect(result.board.columns[0]?.cardIds).toEqual(["w-1"]);
    expect(result.board.cards["w-1"]).toEqual({
      id: "w-1",
      kind: "image",
      ref: "https://cdn.example.com/rain.jpg",
      text: "rain",
    });
  });

  it("여러 URL은 한 번에 여러 장이 되고, 이미 있는 URL은 건너뛴다", () => {
    const board = sampleBoard();
    const result = collectPastedTextIntoBoard(
      board,
      "b1-col-0",
      "https://example.com/ref-article https://new.example.com/story",
      idGen("w"),
    );
    expect(result.foundUrlCount).toBe(2);
    expect(result.addedCardIds).toHaveLength(1);
    expect(result.skippedUrls).toEqual(["https://example.com/ref-article"]);
    expect(result.board.cards[result.addedCardIds[0]!]?.kind).toBe("link");
  });

  it("URL이 없거나 열이 없으면 보드를 바꾸지 않는다", () => {
    const board = sampleBoard();
    const noUrl = collectPastedTextIntoBoard(board, "b1-col-0", "그냥 메모", idGen());
    expect(noUrl.board).toBe(board);
    expect(noUrl.foundUrlCount).toBe(0);
    const noColumn = collectPastedTextIntoBoard(board, "nope", "https://a.example/x", idGen());
    expect(noColumn.board).toBe(board);
    expect(noColumn.skippedUrls).toEqual(["https://a.example/x"]);
  });
});

describe("기획 인계 — 회차 플랜", () => {
  it("선택한 카드를 보드 순서로 시놉시스에 잇고 출처 카드가 함께 남는다", () => {
    const draft = deriveEpisodePlanDraftFromMoodboard(
      sampleBoard(),
      ["todo1", "note1", "img1", "ghost"],
      "ep-1",
    );
    expect(draft.episodeId).toBe("ep-1");
    // 입력 순서가 아니라 보드 순서(열→열 안)다.
    expect(draft.sourceCardIds).toEqual(["img1", "note1", "todo1"]);
    expect(draft.synopsis).toContain("이미지 참고: 밤 골목 (https://cdn.example.com/alley-night.png)");
    expect(draft.synopsis).toContain("주인공이 처음으로 거짓말을 들킨다");
    expect(draft.sourceCards[0]).toMatchObject({ cardId: "img1", kind: "image" });
  });

  it("목표는 첫 메모/할 일의 첫 문장이고, 그런 카드가 없으면 비워 둔다", () => {
    const board = sampleBoard();
    expect(deriveEpisodePlanDraftFromMoodboard(board, ["note1"]).goal).toBe(
      "주인공이 처음으로 거짓말을 들킨다.",
    );
    expect(deriveEpisodePlanDraftFromMoodboard(board, ["img1", "link1"]).goal).toBe("");
    expect(deriveEpisodePlanDraftFromMoodboard(board, []).synopsis).toBe("");
  });

  it("병합은 빈 칸만 채우고 이미 쓴 문장은 덮지 않는다", () => {
    const draft: EpisodePlanDraftFromMoodboard = {
      episodeId: "ep-1",
      goal: "새 목표",
      synopsis: "새 줄거리",
      sourceCards: [],
      sourceCardIds: [],
    };
    const base = {
      episodeId: "ep-1",
      goal: "",
      synopsis: "이미 쓴 줄거리",
    } as unknown as EpisodePlanWithSynopsis;
    const merged = applyEpisodePlanDraftFromMoodboard(base, draft);
    expect(merged.goal).toBe("새 목표");
    expect(merged.synopsis).toBe("이미 쓴 줄거리");
  });
});

describe("기획 인계 — 캐릭터 시트", () => {
  it("이미지는 외형, 메모·링크는 배경, 할 일은 목표로 갈리고 출처가 남는다", () => {
    const draft = deriveCharacterProfileDraftFromMoodboard(
      sampleBoard(),
      ["img1", "link1", "note1", "todo1"],
      "char-1",
    );
    expect(draft.appearanceNotes).toContain("밤 골목");
    expect(draft.background).toContain("참고 기사 (https://example.com/ref-article)");
    expect(draft.background).toContain("거짓말을 들킨다");
    expect(draft.motivation).toBe("동생을 지키겠다는 약속을 지킨다");
    expect(draft.sourceCardIds).toEqual(["img1", "link1", "note1", "todo1"]);
  });

  it("병합은 기존 시트를 덮지 않고 출처 줄을 덧붙이며 중복은 막는다", () => {
    const draft = deriveCharacterProfileDraftFromMoodboard(sampleBoard(), ["note1"], "char-1");
    const created = applyCharacterProfileDraftFromMoodboard(null, draft);
    expect(created.characterId).toBe("char-1");
    expect(created.background).toContain("거짓말을 들킨다");
    const again = applyCharacterProfileDraftFromMoodboard(created, draft);
    expect(again.background).toBe(created.background);
  });
});
