import { describe, expect, it } from "vitest";

import {
  computeStudioDialogueTranslateQaSnapshot,
  studioDialogueTranslateQaFingerprint,
  studioDialogueTranslateQaSections,
  type StudioDialogueTranslateQaInput,
} from "./studio-dialogue-translate-qa-snapshot";
import {
  deriveStudioTranslationEffectiveCards,
  parseStudioTranslationCharacterCardSet,
  type StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";

import type { BubbleTextMeasurer } from "./studio-bubble-text-fit";
import type { DialogueReviewPageLike } from "./studio-dialogue-review";

/** 결정적 측정기 — 글자 하나를 fontPx×0.6 폭으로 센다(캔버스 없이 넘침 판정을 재현한다). */
const measurer: BubbleTextMeasurer = { measureWidth: (text, fontPx) => text.length * fontPx * 0.6 };

const WIDE = { x: 0, y: 0, width: 600, height: 300, fontSize: 14 } as const;

function pagesOf(
  elements: readonly { id: string; text: string }[],
  dialogueI18n?: DialogueReviewPageLike["dialogueI18n"],
): readonly DialogueReviewPageLike[] {
  return [
    {
      id: "p1",
      elements: elements.map((element) => ({ ...element, type: "bubble", ...WIDE })),
      ...(dialogueI18n === undefined ? {} : { dialogueI18n }),
    },
  ];
}

const set = parseStudioTranslationCharacterCardSet({
  schemaVersion: 1,
  cards: [
    {
      characterId: "yuna",
      origin: "manual",
      name: "유나",
      fixedTerms: [{ source: "나만 믿어", target: "Leave it to me", locale: "" }],
      bannedTerms: [{ term: "dude", locale: "" }],
    },
  ],
});
if (set === null) throw new Error("fixture");
const cards = deriveStudioTranslationEffectiveCards({ bible: null, narrative: null, set });
const speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>> = {
  b1: { speakerId: "yuna", listenerId: null },
};

function input(over: Partial<StudioDialogueTranslateQaInput> = {}): StudioDialogueTranslateQaInput {
  return {
    pages: pagesOf([{ id: "b1", text: "나만 믿어!" }]),
    draft: new Map([["b1", "LEAVE IT TO ME!"]]),
    activeLocale: "source",
    locale: "en",
    theme: undefined,
    glossary: "",
    ...over,
  };
}

describe("studioDialogueTranslateQaFingerprint — 낡은 보고서 판정의 근거", () => {
  it("같은 입력이면 같은 지문이고, 초안 글자나 말풍선 상자가 바뀌면 달라진다", () => {
    const base = studioDialogueTranslateQaFingerprint(input());
    expect(studioDialogueTranslateQaFingerprint(input())).toBe(base);
    expect(
      studioDialogueTranslateQaFingerprint(input({ draft: new Map([["b1", "TRUST ME!"]]) })),
    ).not.toBe(base);
    const narrow = pagesOf([{ id: "b1", text: "나만 믿어!" }]).map((page) => ({
      ...page,
      elements: page.elements.map((element) => ({ ...element, width: 60 })),
    }));
    expect(studioDialogueTranslateQaFingerprint(input({ pages: narrow }))).not.toBe(base);
  });

  it("인물 카드·화자 지정의 지문(cardsSignature)이 바뀌면 달라진다 — 카드를 고친 뒤 낡은 점수를 믿지 않게", () => {
    const first = studioDialogueTranslateQaFingerprint(input({ cardsSignature: "cards-1" }));
    expect(studioDialogueTranslateQaFingerprint(input({ cardsSignature: "cards-1" }))).toBe(first);
    expect(studioDialogueTranslateQaFingerprint(input({ cardsSignature: "cards-2" }))).not.toBe(first);
    expect(studioDialogueTranslateQaFingerprint(input())).not.toBe(first);
  });

  it("검사 로케일과 용어집도 지문에 들어간다", () => {
    const base = studioDialogueTranslateQaFingerprint(input());
    expect(studioDialogueTranslateQaFingerprint(input({ locale: "ja" }))).not.toBe(base);
    expect(studioDialogueTranslateQaFingerprint(input({ glossary: "선배: Senpai" }))).not.toBe(base);
  });
});

describe("computeStudioDialogueTranslateQaSnapshot — 원문 확보 경로", () => {
  it("카드를 주지 않으면 인물 규칙은 꺼져 있다(기존 동작 그대로)", () => {
    const { report } = computeStudioDialogueTranslateQaSnapshot(input(), measurer);
    expect(report.character.status).toBe("off");
  });

  it("초안 검사 중 캔버스가 원문을 보여 주면 요소의 text 가 원문이라 고정어까지 대 본다", () => {
    const { report } = computeStudioDialogueTranslateQaSnapshot(
      input({ draft: new Map([["b1", "TRUST ME!"]]), cards, speakers }),
      measurer,
    );
    expect(report.character).toMatchObject({ status: "ran", sourceMissingCueCount: 0, ruleCheckedCueCount: 1 });
    expect(report.score.errors.map((error) => error.evidence?.ruleId)).toContain("character/fixed-term");
  });

  it("초안인데 다른 번역 로케일을 보고 있으면 원문을 알 수 없어 고정어 검사를 건너뛰고 그 수를 센다", () => {
    const { report } = computeStudioDialogueTranslateQaSnapshot(
      input({ activeLocale: "ja", draft: new Map([["b1", "TRUST ME!"]]), cards, speakers }),
      measurer,
    );
    expect(report.character).toMatchObject({ status: "ran", sourceMissingCueCount: 1 });
    expect(report.score.errors.map((error) => error.evidence?.ruleId)).not.toContain("character/fixed-term");
    // 원문이 필요 없는 금지어 규칙은 그대로 돈다.
    expect(report.character.ruleCheckedCueCount).toBe(1);
  });

  it("적용된 번역을 검사할 때는 dialogueI18n 의 원문 스냅샷이 원문이다", () => {
    const pages = pagesOf([{ id: "b1", text: "TRUST ME!" }], {
      b1: { source: "나만 믿어!", en: "TRUST ME!" },
    });
    const { report } = computeStudioDialogueTranslateQaSnapshot(
      input({ pages, draft: null, activeLocale: "en", locale: "en", cards, speakers }),
      measurer,
    );
    expect(report.character).toMatchObject({ sourceMissingCueCount: 0, ruleCheckedCueCount: 1 });
    expect(report.score.errors.map((error) => error.evidence?.ruleId)).toContain("character/fixed-term");
  });

  it("원문 자체를 검사하는 중에는 인물 규칙 전체를 건너뛴다", () => {
    const { report } = computeStudioDialogueTranslateQaSnapshot(
      input({ draft: null, activeLocale: "source", locale: "source", cards, speakers }),
      measurer,
    );
    expect(report.character.status).toBe("source-locale");
  });

  it("용어집 텍스트가 규칙으로 파싱돼 QA 의 용어집 검사(Terminology)에 들어간다", () => {
    const { report } = computeStudioDialogueTranslateQaSnapshot(
      input({ glossary: "선배: Senpai", pages: pagesOf([{ id: "b1", text: "고마워요, 선배" }]), draft: new Map([["b1", "THANK YOU, SENIOR"]]) }),
      measurer,
    );
    expect(report.glossaryCheckedCueCount).toBe(1);
    expect(report.score.errors.some((error) => error.dimension === "terminology")).toBe(true);
  });

  it("지문은 검사 당시 입력의 것이라 같은 입력의 지문과 일치한다", () => {
    const value = input({ cards, speakers, cardsSignature: "sig" });
    expect(computeStudioDialogueTranslateQaSnapshot(value, measurer).fingerprint).toBe(
      studioDialogueTranslateQaFingerprint(value),
    );
  });
});

describe("studioDialogueTranslateQaSections", () => {
  it("차원 묶음을 패널이 그리는 구역 모양으로 옮기고, 오류가 없으면 구역도 없다", () => {
    const clean = computeStudioDialogueTranslateQaSnapshot(input(), measurer).report;
    expect(studioDialogueTranslateQaSections(clean)).toEqual([]);

    const dirty = computeStudioDialogueTranslateQaSnapshot(
      input({ draft: new Map([["b1", "WHATEVER, DUDE."]]), cards, speakers }),
      measurer,
    ).report;
    const sections = studioDialogueTranslateQaSections(dirty);
    expect(sections.map((section) => section.dimension)).toContain("terminology");
    const terminology = sections.find((section) => section.dimension === "terminology");
    expect(terminology?.errorCount).toBe(terminology?.errors.length);
    expect(terminology?.errors[0]?.evidence?.ruleId).toBe("character/banned-term");
  });
});
