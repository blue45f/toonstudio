import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../studio-story-bible";
import {
  characterSheetCitation,
  characterSheetCitations,
  type StudioStoryBibleNarrative,
} from "./studio-character-profile";

const bible: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "hero", name: "민서", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "friend", name: "지훈", aliases: ["훈"], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "newcomer", name: "새 인물", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};

const narrative: StudioStoryBibleNarrative = {
  profiles: [
    {
      characterId: "hero",
      personality: "겁이 많지만 책임감 하나로 버틴다.",
      speechStyle: "  존댓말, 말이 짧고 끝에 '요'를 붙인다  ",
      background: "",
      motivation: "동생을 지키는 것",
      signatureLines: [" 제가 할게요. ", "", "  ", "기다려요, 금방 와요."],
      appearanceNotes: " 후드를 자주 뒤집어쓴다 ",
    },
    {
      characterId: "friend",
      personality: "",
      speechStyle: "",
      background: "",
      motivation: "",
      signatureLines: [],
      appearanceNotes: "",
    },
  ],
  relations: [],
};

describe("characterSheetCitation", () => {
  it("인용 필드를 정리해 돌려준다 — 말투·대표 대사(빈 줄 제외)·외형 메모", () => {
    const citation = characterSheetCitation(bible, narrative, "hero");
    expect(citation).toMatchObject({
      characterId: "hero",
      characterName: "민서",
      speechStyle: "존댓말, 말이 짧고 끝에 '요'를 붙인다",
      signatureLines: ["제가 할게요.", "기다려요, 금방 와요."],
      appearanceNotes: "후드를 자주 뒤집어쓴다",
      hasCitation: true,
    });
  });

  it("모르는 캐릭터는 지어내지 않고 null", () => {
    expect(characterSheetCitation(bible, narrative, "ghost")).toBeNull();
  });

  it("시트가 없거나 비어 있으면 hasCitation=false 로 정직하게 표시한다", () => {
    expect(characterSheetCitation(bible, narrative, "newcomer")).toMatchObject({
      characterName: "새 인물",
      speechStyle: "",
      signatureLines: [],
      appearanceNotes: "",
      hasCitation: false,
    });
    expect(characterSheetCitation(bible, narrative, "friend")?.hasCitation).toBe(false);
  });
});

describe("characterSheetCitations", () => {
  it("입력 순서를 지키고 중복·모르는 id를 뺀다", () => {
    const citations = characterSheetCitations(bible, narrative, ["friend", "hero", "friend", "ghost", "hero"]);
    expect(citations.map((c) => c.characterId)).toEqual(["friend", "hero"]);
  });

  it("빈 입력은 빈 목록", () => {
    expect(characterSheetCitations(bible, narrative, [])).toEqual([]);
  });
});
