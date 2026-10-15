import { describe, expect, it } from "vitest";

import { EMPTY_STORY_BIBLE_NARRATIVE, type StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";

import { buildSubmissionCharacterSheets, countFilledSheetFields, hasSheetContent } from "./submission-package-story";
import { sheetOf } from "./submission-package.test-fixture";

const bible: StudioStoryBible = {
  projectId: "p1",
  characters: [
    { id: "c1", name: "  한도깨  ", aliases: ["도깨비", "  ", "첫 손님"], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "c2", name: "주인공", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "c3", name: "엑스트라", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};

const narrative: StudioStoryBibleNarrative = {
  profiles: [
    {
      characterId: "c1",
      personality: " 겁이 많다. ",
      speechStyle: "~하오 체",
      background: "오래된 우물에서 왔다.",
      motivation: "집으로 돌아가기",
      signatureLines: ["길을 알려 주시오.", "", "고맙소.", "또 오겠소.", "네 번째 대사"],
      appearanceNotes: "뿔이 하나 부러졌다.",
    },
  ],
  relations: [
    { id: "r1", fromCharacterId: "c1", toCharacterId: "c2", kind: "friend", label: " 단골 ", note: "" },
    { id: "r2", fromCharacterId: "c2", toCharacterId: "c1", kind: "mentor", label: "", note: "길 안내" },
    { id: "r3", fromCharacterId: "c2", toCharacterId: "c3", kind: "colleague", label: "동료", note: "" },
  ],
};

describe("스토리 바이블 → 투고 캐릭터 시트", () => {
  const sheets = buildSubmissionCharacterSheets(bible, narrative);

  it("연속성 캐릭터마다 시트 하나를 만들고 이름·별칭을 정리한다", () => {
    expect(sheets.map((sheet) => sheet.id)).toEqual(["c1", "c2", "c3"]);
    expect(sheets[0]).toMatchObject({ name: "한도깨", aliases: ["도깨비", "첫 손님"] });
  });

  it("서술 시트의 칸을 가져오고 대표 대사는 빈 줄을 빼 3개로 제한한다", () => {
    expect(sheets[0]).toMatchObject({
      personality: "겁이 많다.",
      speechStyle: "~하오 체",
      background: "오래된 우물에서 왔다.",
      motivation: "집으로 돌아가기",
      appearanceNotes: "뿔이 하나 부러졌다.",
      signatureLines: ["길을 알려 주시오.", "고맙소.", "또 오겠소."],
    });
  });

  it("서술 시트가 없는 캐릭터는 빈 칸으로 만든다", () => {
    expect(sheets[2]).toMatchObject({ name: "엑스트라", personality: "", signatureLines: [], speechStyle: "", background: "", motivation: "" });
    expect(hasSheetContent(sheets[2] ?? sheetOf("x", { personality: "" }))).toBe(false);
  });

  it("관계는 나가는 것과 들어오는 것을 방향과 함께 상대 이름으로 옮긴다", () => {
    expect(sheets[0]?.relations).toEqual([
      { withName: "주인공", direction: "outgoing", kind: "friend", label: "단골", note: "" },
      { withName: "주인공", direction: "incoming", kind: "mentor", label: "", note: "길 안내" },
    ]);
    expect(sheets[1]?.relations).toHaveLength(3);
    expect(sheets[2]?.relations).toEqual([{ withName: "주인공", direction: "incoming", kind: "colleague", label: "동료", note: "" }]);
  });

  it("바이블에 없는 캐릭터를 가리키는 관계는 id 로 대신한다", () => {
    const ghost: StudioStoryBibleNarrative = {
      profiles: [],
      relations: [{ id: "r9", fromCharacterId: "c1", toCharacterId: "gone", kind: "other", label: "", note: "" }],
    };
    expect(buildSubmissionCharacterSheets(bible, ghost)[0]?.relations[0]).toMatchObject({ withName: "gone" });
  });

  it("빈 서술 묶음도 처리하고 원본 바이블을 바꾸지 않는다", () => {
    const frozenBible = JSON.stringify(bible);
    const empty = buildSubmissionCharacterSheets(bible, EMPTY_STORY_BIBLE_NARRATIVE);
    expect(empty).toHaveLength(3);
    expect(empty.every((sheet) => !hasSheetContent(sheet))).toBe(true);
    expect(JSON.stringify(bible)).toBe(frozenBible);
  });
});

describe("시트 채움 정도", () => {
  it("채워진 칸을 센다(대표 대사는 한 칸)", () => {
    expect(countFilledSheetFields(sheetOf("a", { personality: "", speechStyle: "", background: "", motivation: "", appearanceNotes: "", signatureLines: [] }))).toBe(0);
    expect(countFilledSheetFields(sheetOf("b", { speechStyle: "x", signatureLines: ["대사", "대사2"] }))).toBe(3);
  });

  it("공백뿐인 칸은 채워진 것으로 세지 않는다", () => {
    expect(hasSheetContent(sheetOf("c", { personality: "  \n ", signatureLines: [" "] }))).toBe(false);
    expect(hasSheetContent(sheetOf("d", { personality: "", appearanceNotes: "붉은 머리" }))).toBe(true);
  });
});
