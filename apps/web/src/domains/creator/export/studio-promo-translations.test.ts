import { describe, expect, it } from "vitest";

import { PROMO_TRANSLATION_DRAFTS_MAX, PROMO_TRANSLATION_ROWS_MAX, PROMO_TRANSLATION_TEXT_MAX } from "../promo/promo-handoff-contract";
import { listStudioPromoCuts } from "./studio-promo-cuts";
import {
  exceedsStudioPromoTranslationLimit,
  listStudioPromoTranslations,
  studioPromoTranslationDraftId,
} from "./studio-promo-translations";

import type { DialogueElementLike } from "../lettering/studio-dialogue-batch";
import type { DialogueReviewPageLike } from "../lettering/studio-dialogue-review";

const bubble = (id: string, text: string, y: number, extra: Partial<DialogueElementLike> = {}): DialogueElementLike => ({ id, type: "bubble", text, x: 20, y, width: 60, height: 30, ...extra });

function page(id: string, elements: DialogueElementLike[], extra: Partial<DialogueReviewPageLike> = {}): DialogueReviewPageLike {
  return { id, elements, ...extra };
}

describe("번역 초안 나열", () => {
  const pages = [
    page("p1", [bubble("b1", "어서 와", 10), bubble("b2", "오랜만이야", 60), bubble("b3", "번역 없음", 110)], {
      dialogueI18n: { b1: { source: "어서 와", en: "Welcome.", ja: "ようこそ" }, b2: { source: "오랜만이야", en: "Long time no see." } },
      dialogueReview: { b1: { en: "approved", ja: "needs-edit" }, b2: { en: "needs-edit" } },
    }),
    page("p2", [bubble("b4", "또 만나", 10)], { dialogueI18n: { b4: { source: "또 만나", en: "See you." } }, dialogueReview: { b4: { en: "approved" } } }),
  ];

  it("보이는 모든 대사를 원문 행으로, 번역이 있는 대사를 로케일별 초안으로 읽기 순서대로 나열한다", () => {
    const listing = listStudioPromoTranslations(pages, [0, 1]);
    expect(listing.rows).toEqual([
      { pageId: "p1", elementId: "b1", source: "어서 와" },
      { pageId: "p1", elementId: "b2", source: "오랜만이야" },
      { pageId: "p1", elementId: "b3", source: "번역 없음" },
      { pageId: "p2", elementId: "b4", source: "또 만나" },
    ]);
    expect(listing.entries.map((entry) => `${entry.elementId}/${entry.locale}/${entry.approved}`)).toEqual([
      "b1/en/true", "b1/ja/false", "b2/en/false", "b4/en/true",
    ]);
    expect(listing.entries[0]).toEqual({ pageId: "p1", elementId: "b1", source: "어서 와", locale: "en", text: "Welcome.", approved: true });
  });

  it("승인은 검수에서 승인한 번역만이고 수정 필요·미검수는 승인 전 초안이다", () => {
    const listing = listStudioPromoTranslations([page("p", [bubble("a", "가", 10), bubble("b", "나", 60), bubble("c", "다", 110)], {
      dialogueI18n: { a: { source: "가", en: "A" }, b: { source: "나", en: "B" }, c: { source: "다", en: "C" } },
      dialogueReview: { a: { en: "approved" }, b: { en: "needs-edit" } },
    })], [0]);
    expect(listing.entries.map((entry) => entry.approved)).toEqual([true, false, false]);
  });

  it("로케일별 번역 수와 승인 수를 코드 순서로 센다", () => {
    expect(listStudioPromoTranslations(pages, [0, 1]).locales).toEqual([
      { code: "en", total: 3, approved: 2 },
      { code: "ja", total: 1, approved: 0 },
    ]);
  });

  it("선택한 페이지 범위만 나열한다", () => {
    const listing = listStudioPromoTranslations(pages, [1]);
    expect(listing.rows.map((row) => row.elementId)).toEqual(["b4"]);
    expect(listing.entries).toHaveLength(1);
    expect(listStudioPromoTranslations(pages, [])).toMatchObject({ rows: [], entries: [], locales: [] });
    expect(listStudioPromoTranslations(pages, [5, -1])).toMatchObject({ rows: [], entries: [] });
  });

  it("초안의 원문은 번역 시점의 스냅샷이고, 스냅샷이 없으면 지금 텍스트다", () => {
    const listing = listStudioPromoTranslations([page("p", [bubble("a", "고친 원문", 10), bubble("b", "스냅샷 없음", 60)], {
      dialogueI18n: { a: { source: "처음 원문", en: "First" }, b: { en: "No snapshot" } },
    })], [0]);
    expect(listing.entries.map((entry) => entry.source)).toEqual(["처음 원문", "스냅샷 없음"]);
  });

  it("행의 원문은 지금 원문이라, 번역 뒤에 원문을 고치면 초안의 스냅샷과 달라져 오래됨 판정이 가능하다", () => {
    const listing = listStudioPromoTranslations([page("p", [bubble("a", "고친 원문", 10), bubble("b", "그대로", 60)], {
      dialogueI18n: { a: { source: "처음 원문", en: "First" }, b: { source: "그대로", en: "Same" } },
    })], [0]);
    expect(listing.rows.map((row) => row.source)).toEqual(["고친 원문", "그대로"]);
    expect(listing.entries.map((entry) => [entry.source, entry.text])).toEqual([["처음 원문", "First"], ["그대로", "Same"]]);
    // 고친 대사만 행과 초안의 원문이 다르다.
    const mismatched = listing.entries.filter((entry) => listing.rows.find((row) => row.elementId === entry.elementId)?.source !== entry.source);
    expect(mismatched.map((entry) => entry.elementId)).toEqual(["a"]);
  });

  it("캔버스가 번역 언어를 보여 주고 있으면 행의 원문은 스냅샷이다(el.text는 번역문이라 현재 원문이 아니다)", () => {
    const listing = listStudioPromoTranslations([page("p", [bubble("a", "Welcome.", 10)], {
      dialogueI18n: { a: { source: "어서 와", en: "Welcome." } },
    })], [0]);
    expect(listing.rows.map((row) => row.source)).toEqual(["어서 와"]);
    expect(listing.entries.map((entry) => entry.source)).toEqual(["어서 와"]);
    expect(listing.translatedVisibleCount).toBe(1);
  });

  it("숨긴 대사와 빈 대사는 행에도 초안에도 넣지 않는다", () => {
    const listing = listStudioPromoTranslations([page("p", [
      bubble("shown", "보임", 10),
      bubble("hidden", "숨김", 60, { hidden: true }),
      bubble("blank", "  ", 110),
    ], { dialogueI18n: { shown: { source: "보임", en: "Shown" }, hidden: { source: "숨김", en: "Hidden" }, blank: { source: "", en: "Blank" } } })], [0]);
    expect(listing.rows.map((row) => row.elementId)).toEqual(["shown"]);
    expect(listing.entries.map((entry) => entry.elementId)).toEqual(["shown"]);
  });

  it("숨긴 프레임이 있어도 컷 나열과 같은 요소 집합으로 읽기 순서를 계산한다", () => {
    const frame = (id: string, x: number, y: number, width: number, height: number, extra: Partial<DialogueElementLike> = {}): DialogueElementLike => ({ id, type: "frame", x, y, width, height, ...extra });
    const bubbleAt = (id: string, text: string, x: number, y: number): DialogueElementLike => ({ ...bubble(id, text, y), x });
    const elements = [
      frame("A", 0, 0, 340, 300), frame("H", 360, 0, 340, 300, { hidden: true }), frame("B", 0, 320, 700, 300),
      bubbleAt("a1", "첫 컷", 50, 50), bubbleAt("h1", "숨긴 프레임 안", 400, 50), bubbleAt("b1", "아래 컷", 50, 400),
    ];
    const hiddenAware = listStudioPromoTranslations([page("p", elements)], [0]);
    // 숨긴 프레임이 보이는 프레임처럼 순서를 가르면 [a1, h1, b1]이 되어 컷 나열의 [a1, b1, (컷 밖)h1]과 어긋난다.
    expect(hiddenAware.rows.map((row) => row.elementId)).toEqual(["a1", "b1", "h1"]);
    expect(listStudioPromoCuts([page("p", elements)], [0]).frames.map((cut) => cut.dialogues.map((dialogue) => dialogue.id))).toEqual([["a1"], ["b1"]]);
  });

  it("빈 번역문은 번역이 아니다", () => {
    const listing = listStudioPromoTranslations([page("p", [bubble("a", "가", 10)], { dialogueI18n: { a: { source: "가", en: "  ", ja: "あ" } } })], [0]);
    expect(listing.entries.map((entry) => entry.locale)).toEqual(["ja"]);
  });

  it("경로에 쓸 수 없는 로케일 코드는 빼고 알린다", () => {
    const listing = listStudioPromoTranslations([page("p", [bubble("a", "가", 10)], {
      dialogueI18n: { a: { source: "가", en: "A", 한국어: "가", EN: "upper", "../x": "path", "zh-Hans": "甲" } },
    })], [0]);
    expect(listing.entries.map((entry) => entry.locale)).toEqual(["en", "zh-Hans"]);
    expect(listing.skippedLocales).toEqual(["../x", "EN", "한국어"].sort((left, right) => left.localeCompare(right)));
  });

  it("지금 캔버스에 번역 언어로 보이는 대사를 센다", () => {
    const listing = listStudioPromoTranslations([page("p", [
      bubble("shows-en", "Welcome.", 10),
      bubble("shows-source", "오랜만이야", 60),
      bubble("edited", "내가 고친 말", 110),
    ], {
      dialogueI18n: {
        "shows-en": { source: "어서 와", en: "Welcome." },
        "shows-source": { source: "오랜만이야", en: "Long time no see." },
        edited: { source: "고치기 전", en: "Before" },
      },
    })], [0]);
    expect(listing.translatedVisibleCount).toBe(1);
  });

  it("ID나 글자 수 상한을 넘는 행과 번역은 빼고 센다", () => {
    const longId = "x".repeat(201);
    const longPageId = "q".repeat(150);
    const longElementId = "e".repeat(60);
    const listing = listStudioPromoTranslations([page("p", [
      bubble("ok", "정상", 10),
      bubble(longId, "ID가 너무 김", 60),
      bubble("long-source", "가".repeat(PROMO_TRANSLATION_TEXT_MAX + 1), 110),
      bubble("long-translation", "번역이 너무 긺", 160),
    ], {
      dialogueI18n: {
        ok: { source: "정상", en: "OK" },
        [longId]: { source: "ID가 너무 김", en: "x" },
        "long-translation": { source: "번역이 너무 긺", en: "a".repeat(PROMO_TRANSLATION_TEXT_MAX + 1) },
      },
    }), page(longPageId, [bubble(longElementId, "초안 ID가 200자를 넘음", 10)], {
      // 페이지 ID와 대사 ID는 각각 200자 이하지만 "페이지:대사:로케일"로 이으면 200자를 넘는다.
      dialogueI18n: { [longElementId]: { source: "초안 ID가 200자를 넘음", en: "x" } },
    })], [0, 1]);
    expect(listing.rows.map((row) => row.elementId)).toEqual(["ok", "long-translation", longElementId]);
    expect(listing.entries.map((entry) => entry.elementId)).toEqual(["ok"]);
    // 긴 ID 대사(행·초안 모두), 긴 원문 대사(행), 긴 번역문(초안), 긴 초안 ID(초안)
    expect(listing.oversizedCount).toBe(4);
    expect(studioPromoTranslationDraftId("p", "e", "en")).toBe("p:e:en");
    expect(studioPromoTranslationDraftId(longPageId, longElementId, "en").length).toBeGreaterThan(200);
  });

  it("입력 페이지를 바꾸지 않는다", () => {
    const before = JSON.stringify(pages);
    listStudioPromoTranslations(pages, [0, 1]);
    expect(JSON.stringify(pages)).toBe(before);
  });

  it("한 파일에 담을 수 있는 초안·행 수를 넘었는지 알려 준다", () => {
    const entry = { pageId: "p", elementId: "e", source: "s", locale: "en", text: "t", approved: true };
    const row = { pageId: "p", elementId: "e", source: "s" };
    expect(exceedsStudioPromoTranslationLimit({ rows: [row], entries: Array.from({ length: PROMO_TRANSLATION_DRAFTS_MAX }, () => entry) })).toBe(false);
    expect(exceedsStudioPromoTranslationLimit({ rows: [row], entries: Array.from({ length: PROMO_TRANSLATION_DRAFTS_MAX + 1 }, () => entry) })).toBe(true);
    expect(exceedsStudioPromoTranslationLimit({ rows: Array.from({ length: PROMO_TRANSLATION_ROWS_MAX + 1 }, () => row), entries: [] })).toBe(true);
  });
});
