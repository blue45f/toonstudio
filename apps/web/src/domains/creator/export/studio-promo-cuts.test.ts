import { describe, expect, it } from "vitest";

import { PROMO_DOCUMENT_CUTS_MAX, PROMO_DOCUMENT_DIALOGUES_MAX, PROMO_DOCUMENT_DIALOGUE_TEXT_MAX } from "../promo/promo-handoff-contract";
import {
  exceedsStudioPromoCutLimit,
  listStudioPromoCuts,
  planStudioPromoCutCrop,
  STUDIO_PROMO_CUT_MAX_EDGE,
  STUDIO_PROMO_CUT_MIN_SIZE,
} from "./studio-promo-cuts";

import type { DialogueElementLike, DialoguePageLike } from "../lettering/studio-dialogue-batch";

const frame = (id: string, x: number, y: number, width: number, height: number, extra: Partial<DialogueElementLike> = {}): DialogueElementLike => ({ id, type: "frame", x, y, width, height, ...extra });
const bubble = (id: string, text: string, x: number, y: number, extra: Partial<DialogueElementLike> = {}): DialogueElementLike => ({ id, type: "bubble", text, x, y, width: 60, height: 30, ...extra });
const page = (id: string, elements: DialogueElementLike[], groups: DialoguePageLike["groups"] = []): DialoguePageLike => ({ id, elements, groups });

/** 위 두 칸(왼·오른쪽) + 아래 한 칸. 배열 순서는 일부러 읽기 순서와 다르게 둔다. */
function comicPage(id = "p1"): DialoguePageLike {
  return page(id, [
    frame("f-bottom", 20, 340, 680, 300),
    frame("f-right", 370, 20, 330, 300),
    frame("f-left", 20, 20, 330, 300),
    bubble("b-bottom", "집에 가자", 100, 400),
    bubble("b-right", "어디로?", 420, 60),
    bubble("b-left", "어서 와", 60, 60),
  ]);
}

describe("컷 나열", () => {
  it("컷을 위→아래, 왼→오른 읽기 순서로 나열하고 말풍선을 컷별로 묶는다", () => {
    const listing = listStudioPromoCuts([comicPage()], [0]);
    expect(listing.frames.map((value) => value.frameId)).toEqual(["f-left", "f-right", "f-bottom"]);
    expect(listing.frames.map((value) => value.dialogues.map((dialogue) => dialogue.text))).toEqual([["어서 와"], ["어디로?"], ["집에 가자"]]);
    expect(listing).toMatchObject({ dialogueCount: 3, outsideDialogueCount: 0, clippedDialogueCount: 0, skippedFrameCount: 0, pagesWithoutFrames: [] });
    expect(listing.frames[0]).toMatchObject({ pageId: "p1", pageIndex: 0, x: 20, y: 20, width: 330, height: 300 });
  });

  it("한 컷 안 말풍선은 읽기 순서(명시 order → 위치)로 나열한다", () => {
    const listing = listStudioPromoCuts([page("p1", [
      frame("f", 0, 0, 700, 600),
      bubble("late", "나중", 300, 300),
      bubble("early", "먼저", 100, 50),
      bubble("ordered", "지정", 500, 500, { order: 0 }),
    ])], [0]);
    expect(listing.frames[0]?.dialogues.map((dialogue) => dialogue.id)).toEqual(["ordered", "early", "late"]);
  });

  it("선택한 페이지만 문서 순서로 나열하고 중복·범위 밖 순번은 무시한다", () => {
    const pages = [comicPage("p1"), comicPage("p2"), comicPage("p3")];
    const listing = listStudioPromoCuts(pages, [2, 0, 2, 9, -1, 1.5]);
    expect([...new Set(listing.frames.map((value) => value.pageId))]).toEqual(["p1", "p3"]);
    expect(listing.frames.map((value) => value.pageIndex)).toEqual([0, 0, 0, 2, 2, 2]);
    expect(listStudioPromoCuts(pages, [])).toMatchObject({ frames: [], dialogueCount: 0 });
  });

  it("숨기거나 너무 작은 프레임은 컷이 아니고, 그 안의 말풍선은 바깥 컷이나 컷 밖으로 센다", () => {
    const listing = listStudioPromoCuts([page("p1", [
      frame("outer", 0, 0, 700, 600),
      frame("hidden", 10, 10, 300, 300, { hidden: true }),
      frame("grouped", 340, 10, 300, 300, { groupId: "g" }),
      frame("tiny", 20, 400, STUDIO_PROMO_CUT_MIN_SIZE - 1, 200),
      frame("broken", 20, 500, Number.NaN, 200),
      bubble("in-hidden", "숨긴 프레임 안", 50, 50),
      bubble("in-tiny", "작은 프레임 안", 22, 420),
    ], [{ id: "g", name: "그룹", hidden: true }])], [0]);
    expect(listing.frames.map((value) => value.frameId)).toEqual(["outer"]);
    expect(listing.skippedFrameCount).toBe(4);
    // 숨긴 프레임 안의 말풍선은 이제 가장 가까운 바깥 컷 "outer"에 속한다.
    expect(listing.frames[0]?.dialogues.map((dialogue) => dialogue.id)).toEqual(["in-hidden", "in-tiny"]);
  });

  it("숨긴 말풍선과 빈 말풍선은 자막 후보에서 뺀다", () => {
    const groups = [{ id: "g", name: "숨김 그룹", hidden: true }];
    const listing = listStudioPromoCuts([page("p1", [
      frame("f", 0, 0, 700, 600),
      bubble("shown", "보이는 말", 40, 40),
      bubble("hidden", "숨긴 말", 40, 100, { hidden: true }),
      bubble("grouped", "그룹 숨김", 40, 160, { groupId: "g" }),
      bubble("blank", "   \n ", 40, 220),
      { id: "caption", type: "text", text: "자막 텍스트", x: 40, y: 280 },
      { id: "photo", type: "image", x: 40, y: 340, width: 80, height: 80 },
    ], groups)], [0]);
    expect(listing.frames[0]?.dialogues).toEqual([{ id: "shown", text: "보이는 말" }, { id: "caption", text: "자막 텍스트" }]);
    expect(listing.dialogueCount).toBe(2);
  });

  it("어느 컷에도 없는 말풍선은 컷 밖으로 세고 자막 후보에 넣지 않는다", () => {
    const listing = listStudioPromoCuts([page("p1", [
      frame("f", 20, 20, 300, 300),
      bubble("in", "컷 안", 40, 40),
      bubble("gutter", "여백", 600, 700),
    ]), page("p2", [bubble("lonely", "프레임 없는 페이지", 10, 10)])], [0, 1]);
    expect(listing.frames).toHaveLength(1);
    expect(listing.frames[0]?.dialogues.map((dialogue) => dialogue.id)).toEqual(["in"]);
    expect(listing.outsideDialogueCount).toBe(2);
    expect(listing.pagesWithoutFrames).toEqual([1]);
  });

  it("말풍선이 명시한 프레임(frameId)을 위치보다 먼저 따른다", () => {
    const listing = listStudioPromoCuts([page("p1", [
      frame("a", 0, 0, 300, 300),
      frame("b", 400, 0, 300, 300),
      bubble("pinned", "b 컷의 말", 40, 40, { frameId: "b" }),
    ])], [0]);
    expect(listing.frames.map((value) => value.dialogues.length)).toEqual([0, 1]);
  });

  it("겹치거나 안에 든 프레임은 더 구체적인(작은) 프레임이 말풍선을 갖는다", () => {
    const listing = listStudioPromoCuts([page("p1", [
      frame("big", 0, 0, 700, 600),
      frame("inset", 100, 100, 200, 200),
      bubble("inside-inset", "안쪽", 150, 150),
      bubble("only-big", "바깥쪽", 500, 400),
    ])], [0]);
    const byId = new Map(listing.frames.map((value) => [value.frameId, value.dialogues.map((dialogue) => dialogue.id)] as const));
    expect(byId.get("inset")).toEqual(["inside-inset"]);
    expect(byId.get("big")).toEqual(["only-big"]);
  });

  it("한 컷의 말풍선이 상한을 넘으면 앞에서부터 담고 나머지를 센다", () => {
    const many = Array.from({ length: PROMO_DOCUMENT_DIALOGUES_MAX + 5 }, (_, index) => bubble(`b${index}`, `대사 ${index}`, 10, 10 + index));
    const listing = listStudioPromoCuts([page("p1", [frame("f", 0, 0, 700, 900), ...many])], [0]);
    expect(listing.frames[0]?.dialogues).toHaveLength(PROMO_DOCUMENT_DIALOGUES_MAX);
    expect(listing.frames[0]?.dialogues[0]?.id).toBe("b0");
    expect(listing.clippedDialogueCount).toBe(5);
    expect(listing.dialogueCount).toBe(PROMO_DOCUMENT_DIALOGUES_MAX);
  });

  it("너무 긴 말풍선 글은 묶음 검증과 같은 UTF-16 길이로 자르고 이모지를 쪼개지 않는다", () => {
    const listOne = (text: string) => listStudioPromoCuts([page("p1", [frame("f", 0, 0, 700, 600), bubble("b", text, 10, 10)])], [0]).frames[0]?.dialogues[0]?.text ?? "";
    expect(listOne("😀".repeat(1_010))).toBe("😀".repeat(PROMO_DOCUMENT_DIALOGUE_TEXT_MAX / 2));
    // 1999번째 글자가 서로게이트 쌍의 앞쪽 절반이면 쌍째로 뺀다.
    expect(listOne(`a${"😀".repeat(1_500)}`)).toBe(`a${"😀".repeat(999)}`);
    expect(listOne("가".repeat(PROMO_DOCUMENT_DIALOGUE_TEXT_MAX + 1))).toHaveLength(PROMO_DOCUMENT_DIALOGUE_TEXT_MAX);
    expect(listOne("가".repeat(PROMO_DOCUMENT_DIALOGUE_TEXT_MAX))).toHaveLength(PROMO_DOCUMENT_DIALOGUE_TEXT_MAX);
  });

  it("입력 페이지를 바꾸지 않는다", () => {
    const pages = [comicPage()];
    const before = JSON.stringify(pages);
    listStudioPromoCuts(pages, [0]);
    expect(JSON.stringify(pages)).toBe(before);
  });

  it("한 묶음의 컷 수 상한을 알려 준다", () => {
    const frames = Array.from({ length: PROMO_DOCUMENT_CUTS_MAX + 1 }, (_, index) => frame(`f${index}`, 0, index * 100, 700, 90));
    expect(exceedsStudioPromoCutLimit(listStudioPromoCuts([page("p1", frames)], [0]))).toBe(true);
    expect(exceedsStudioPromoCutLimit(listStudioPromoCuts([page("p1", frames.slice(0, PROMO_DOCUMENT_CUTS_MAX))], [0]))).toBe(false);
  });
});

describe("캡처에서 잘라 낼 영역", () => {
  const target = { x: 20, y: 20, width: 330, height: 300 };

  it("캡처 폭 ÷ 문서 폭을 배율로 영역을 정수 픽셀로 바꾼다", () => {
    expect(planStudioPromoCutCrop(target, { width: 1440, height: 2000 }, 720)).toEqual({ sx: 40, sy: 40, sw: 660, sh: 600, width: 660, height: 600 });
    expect(planStudioPromoCutCrop(target, { width: 720, height: 1000 }, 720)).toEqual({ sx: 20, sy: 20, sw: 330, sh: 300, width: 330, height: 300 });
  });

  it("소수 좌표는 컷의 가장자리가 잘리지 않게 바깥쪽으로 올림한다", () => {
    const crop = planStudioPromoCutCrop({ x: 10.2, y: 5.9, width: 10, height: 10 }, { width: 720, height: 1000 }, 720);
    expect(crop).toMatchObject({ sx: 10, sy: 5, sw: 11, sh: 11 });
  });

  it("긴 변이 상한을 넘으면 비율을 지켜 줄인다", () => {
    const crop = planStudioPromoCutCrop({ x: 0, y: 0, width: 720, height: 500 }, { width: 2880, height: 4000 }, 720);
    expect(crop).toMatchObject({ sx: 0, sy: 0, sw: 2880, sh: 2000, width: STUDIO_PROMO_CUT_MAX_EDGE, height: 1422 });
    expect(planStudioPromoCutCrop({ x: 0, y: 0, width: 100, height: 100 }, { width: 720, height: 1000 }, 720, 50)).toMatchObject({ width: 50, height: 50 });
  });

  it("캡처 밖으로 나간 부분은 잘라 내고, 완전히 밖이거나 너무 작으면 null이다", () => {
    expect(planStudioPromoCutCrop({ x: -50, y: -50, width: 150, height: 150 }, { width: 720, height: 1000 }, 720)).toMatchObject({ sx: 0, sy: 0, sw: 100, sh: 100 });
    expect(planStudioPromoCutCrop({ x: 700, y: 0, width: 200, height: 200 }, { width: 720, height: 1000 }, 720)).toMatchObject({ sx: 700, sw: 20 });
    expect(planStudioPromoCutCrop({ x: 800, y: 0, width: 200, height: 200 }, { width: 720, height: 1000 }, 720)).toBeNull();
    expect(planStudioPromoCutCrop({ x: 0, y: 2000, width: 200, height: 200 }, { width: 720, height: 1000 }, 720)).toBeNull();
    expect(planStudioPromoCutCrop({ x: 0, y: 0, width: 4, height: 200 }, { width: 720, height: 1000 }, 720)).toBeNull();
  });

  it("잘못된 크기 값은 null이다", () => {
    expect(planStudioPromoCutCrop(target, { width: 720, height: 1000 }, 0)).toBeNull();
    expect(planStudioPromoCutCrop(target, { width: 720, height: 1000 }, Number.NaN)).toBeNull();
    expect(planStudioPromoCutCrop(target, { width: 0, height: 1000 }, 720)).toBeNull();
    expect(planStudioPromoCutCrop(target, { width: 720, height: 0 }, 720)).toBeNull();
    expect(planStudioPromoCutCrop(target, { width: 720, height: 1000 }, 720, 0)).toBeNull();
  });
});
