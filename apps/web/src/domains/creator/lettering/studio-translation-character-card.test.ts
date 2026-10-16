import { describe, expect, it } from "vitest";

import {
  addManualStudioTranslationCard,
  patchStudioTranslationCard,
  pruneStudioTranslationSpeakers,
  removeStudioTranslationCard,
  setStudioTranslationSpeaker,
  summarizeStudioTranslationSpeakers,
} from "./studio-translation-character-card-edit";
import {
  EMPTY_STUDIO_TRANSLATION_CARD_SET,
  STUDIO_TRANSLATION_CARD_LIMITS,
  boundedStudioTranslationCardText,
  deriveStudioTranslationEffectiveCards,
  isStudioTranslationCardLocaleTag,
  parseStudioTranslationCharacterCardSet,
  studioTranslationCardLocaleApplies,
  studioTranslationRegisterTier,
  studioTranslationSpeakerOf,
  type StudioTranslationCharacterCardSet,
} from "./studio-translation-character-card";

import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";

const bible: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "yuna", name: "유나", aliases: ["Yuna"], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "minho", name: "민호", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "hana", name: "ハナ", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};

const narrative: StudioStoryBibleNarrative = {
  profiles: [
    {
      characterId: "yuna",
      personality: "",
      speechStyle: "  존댓말, 끝을   흐린다  ",
      background: "",
      motivation: "",
      signatureLines: [],
      appearanceNotes: "",
    },
    {
      characterId: "minho",
      personality: "",
      speechStyle: "",
      background: "",
      motivation: "",
      signatureLines: [],
      appearanceNotes: "",
    },
  ],
  relations: [
    { id: "r1", fromCharacterId: "yuna", toCharacterId: "minho", kind: "mentor", label: "선후배", note: "" },
    { id: "r2", fromCharacterId: "yuna", toCharacterId: "hana", kind: "friend", label: "", note: "" },
    // 같은 청자로의 중복 관계는 한 번만 힌트가 된다.
    { id: "r3", fromCharacterId: "yuna", toCharacterId: "minho", kind: "other", label: "동료", note: "" },
  ],
};

function validSet(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    cards: [
      {
        characterId: "yuna",
        origin: "story-bible",
        name: "유나",
        speechNote: "상냥하게",
        register: "polite",
        addressTerms: [
          {
            listenerId: "minho",
            sourceTerm: "선배",
            targetTerm: "Senpai",
            locale: "en",
            register: "formal",
            avoidTerms: ["Sunbae", "Senior"],
          },
        ],
        fixedTerms: [{ source: "나만 믿어", target: "Leave it to me", locale: "en" }],
        bannedTerms: [{ term: "dude", locale: "en" }],
      },
    ],
    speakers: { b1: { speakerId: "yuna", listenerId: "minho" } },
    ...over,
  };
}

describe("parseStudioTranslationCharacterCardSet — 버전형·역호환 파싱", () => {
  it("유효한 v1 페이로드를 읽고 반환값을 freeze 한다", () => {
    const parsed = parseStudioTranslationCharacterCardSet(validSet());
    expect(parsed).not.toBeNull();
    expect(parsed?.schemaVersion).toBe(1);
    expect(parsed?.cards[0]?.addressTerms[0]).toMatchObject({
      listenerId: "minho",
      targetTerm: "Senpai",
      register: "formal",
      avoidTerms: ["Sunbae", "Senior"],
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.cards)).toBe(true);
    expect(Object.isFrozen(parsed?.cards[0]?.addressTerms)).toBe(true);
  });

  it("선택 필드(speakers·cards)가 없는 v1 페이로드도 빈 값으로 읽는다(역호환)", () => {
    expect(parseStudioTranslationCharacterCardSet({ schemaVersion: 1 })).toEqual({
      schemaVersion: 1,
      cards: [],
      speakers: {},
    });
  });

  it("알 수 없는 버전·버전 없음·객체가 아닌 값은 해석하지 않는다", () => {
    expect(parseStudioTranslationCharacterCardSet({ schemaVersion: 2, cards: [] })).toBeNull();
    expect(parseStudioTranslationCharacterCardSet({ cards: [] })).toBeNull();
    expect(parseStudioTranslationCharacterCardSet("v1")).toBeNull();
    expect(parseStudioTranslationCharacterCardSet(null)).toBeNull();
    expect(parseStudioTranslationCharacterCardSet([])).toBeNull();
  });

  it("형식이 틀린 카드는 그 항목만 버리고, 같은 characterId 는 먼저 나온 것만 남긴다", () => {
    const parsed = parseStudioTranslationCharacterCardSet({
      schemaVersion: 1,
      cards: [
        { characterId: "a", origin: "manual", name: "첫째" },
        { characterId: "a", origin: "manual", name: "중복" },
        { characterId: "", origin: "manual", name: "빈 id" },
        { characterId: "b", origin: "unknown", name: "모르는 출처" },
        { characterId: "c\\x", origin: "manual", name: "역슬래시" },
        "문자열",
        { characterId: "d", origin: "story-bible" },
      ],
    });
    expect(parsed?.cards.map((card) => card.characterId)).toEqual(["a", "d"]);
    expect(parsed?.cards[0]?.name).toBe("첫째");
  });

  it("알 수 없는 필드는 무시하고(미래 필드 호환) 알려진 필드만 남긴다", () => {
    const parsed = parseStudioTranslationCharacterCardSet(
      validSet({ futureFlag: true, cards: [{ ...(validSet().cards as object[])[0], mood: "angry" }] }),
    );
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain("futureFlag");
    expect(JSON.stringify(parsed)).not.toContain("angry");
  });

  it("목록·글자 수 상한을 적용한다", () => {
    const limits = STUDIO_TRANSLATION_CARD_LIMITS;
    const rows = Array.from({ length: limits.addressTerms + 5 }, (_, index) => ({
      listenerId: `l${index}`,
      targetTerm: "x".repeat(limits.termChars + 40),
      avoidTerms: Array.from({ length: limits.avoidTerms + 4 }, (_, i) => `v${i}`),
    }));
    const parsed = parseStudioTranslationCharacterCardSet({
      schemaVersion: 1,
      cards: [{ characterId: "a", origin: "manual", name: "n".repeat(100), speechNote: "가".repeat(900), addressTerms: rows }],
    });
    const card = parsed?.cards[0];
    expect(card?.addressTerms).toHaveLength(limits.addressTerms);
    expect(Array.from(card?.addressTerms[0]?.targetTerm ?? "")).toHaveLength(limits.termChars);
    expect(card?.addressTerms[0]?.avoidTerms).toHaveLength(limits.avoidTerms);
    expect(Array.from(card?.name ?? "")).toHaveLength(limits.nameChars);
    expect(Array.from(card?.speechNote ?? "")).toHaveLength(limits.noteChars);
  });

  it("보이지 않는 제어·방향 문자를 지운다 — 한 줄 필드의 줄바꿈은 공백이 되고, 말투 메모의 줄바꿈은 남는다", () => {
    const hidden = "A\u200bs\u202ee\u0007n\u2066pai";
    expect(boundedStudioTranslationCardText(hidden, 40)).toBe("Asenpai");
    expect(boundedStudioTranslationCardText("줄\n바꿈\t탭", 40)).toBe("줄 바꿈 탭");
    expect(boundedStudioTranslationCardText("줄\r\n바꿈", 40, { multiline: true })).toBe("줄\n바꿈");
  });

  it("유니코드 태그 블록·변이 선택자·소프트 하이픈·한글 채움 문자 같은 은닉 문자를 모두 지우고 보이는 글자는 남긴다", () => {
    // 태그 문자(U+E0000–E007F)로 인코딩한 "IGNORE" — 화면에는 아무것도 보이지 않지만 모델은 읽을 수 있다.
    const tagged = String.fromCodePoint(...Array.from("IGNORE", (letter) => 0xe0000 + letter.charCodeAt(0)));
    expect(boundedStudioTranslationCardText(`ok${tagged}`, 40)).toBe("ok");
    const invisibles: readonly string[] = [
      "­", // 소프트 하이픈
      "͏", // 결합 문자 접합자
      "؜", // 아랍 문자 표식
      "ᅟ", // 한글 초성 채움
      "ᅠ", // 한글 중성 채움
      "᠎", // 몽골 모음 구분자
      "⁤", // 보이지 않는 덧셈
      "ㅤ", // 한글 채움
      "ﾠ", // 반각 한글 채움
      "️", // 변이 선택자 16
      "\u{e0100}", // 변이 선택자 보충(17)
      "\u{e01ef}", // 변이 선택자 보충(256)
      "‍", // 제로폭 접합자
    ];
    for (const hidden of invisibles) {
      expect(boundedStudioTranslationCardText(`a${hidden}b`, 40)).toBe("ab");
    }
    expect(boundedStudioTranslationCardText("선배 先輩 Senpai 😀", 40)).toBe("선배 先輩 Senpai 😀");
  });

  it("화자 지정: 잘못된 항목은 버리고, 청자가 잘못되면 청자만 비우며, __proto__ 키가 프로토타입을 건드리지 않는다", () => {
    const raw = JSON.parse(
      '{"schemaVersion":1,"speakers":{"b1":{"speakerId":"yuna","listenerId":"minho"},"b2":{"speakerId":""},"b3":"x","b4":{"speakerId":"yuna","listenerId":""},"__proto__":{"speakerId":"yuna"}}}',
    ) as unknown;
    const parsed = parseStudioTranslationCharacterCardSet(raw);
    expect(parsed?.speakers.b1).toEqual({ speakerId: "yuna", listenerId: "minho" });
    expect(parsed?.speakers.b2).toBeUndefined();
    expect(parsed?.speakers.b3).toBeUndefined();
    expect(parsed?.speakers.b4).toEqual({ speakerId: "yuna", listenerId: null });
    expect(Object.getPrototypeOf(parsed?.speakers)).toBe(Object.prototype);
    expect(studioTranslationSpeakerOf(parsed?.speakers ?? {}, "constructor")).toBeNull();
    expect(({} as Record<string, unknown>).speakerId).toBeUndefined();
  });
});

describe("studioTranslationCardLocaleApplies — 언어 서브태그 접두 일치", () => {
  it("빈 규칙 언어는 모든 번역 언어에 적용된다", () => {
    expect(studioTranslationCardLocaleApplies("", "en")).toBe(true);
    expect(studioTranslationCardLocaleApplies("  ", "ja-JP")).toBe(true);
  });

  it("'en' 규칙은 en-US·en-GB 에 적용되고, 'en-US' 규칙은 'en' 에 적용되지 않는다", () => {
    expect(studioTranslationCardLocaleApplies("en", "en-US")).toBe(true);
    expect(studioTranslationCardLocaleApplies("EN", "en_gb")).toBe(true);
    expect(studioTranslationCardLocaleApplies("en-US", "en")).toBe(false);
    expect(studioTranslationCardLocaleApplies("en-US", "en-GB")).toBe(false);
  });

  it("번체·간체는 서로 다른 언어로 취급하고, 접두가 단어 중간에서 맞는 경우(en vs end)는 적용하지 않는다", () => {
    expect(studioTranslationCardLocaleApplies("zh-Hans", "zh-Hant")).toBe(false);
    expect(studioTranslationCardLocaleApplies("zh", "zh-Hant")).toBe(true);
    expect(studioTranslationCardLocaleApplies("en", "end")).toBe(false);
  });

  it("언어 코드 형식 검사는 빈 값(모든 언어)을 허용하고 한글 이름은 거절한다", () => {
    expect(isStudioTranslationCardLocaleTag("")).toBe(true);
    expect(isStudioTranslationCardLocaleTag("ja")).toBe(true);
    expect(isStudioTranslationCardLocaleTag("zh-Hans")).toBe(true);
    expect(isStudioTranslationCardLocaleTag("영어")).toBe(false);
    // 밑줄 표기는 적용 판정과 같게 읽는다 — 적용되는 규칙을 '어떤 언어에도 적용되지 않는다'고 경고하지 않는다.
    expect(isStudioTranslationCardLocaleTag("en_US")).toBe(true);
    expect(studioTranslationCardLocaleApplies("en_US", "en-US")).toBe(true);
  });
});

describe("deriveStudioTranslationEffectiveCards — 시트(읽기 전용) + 번역용 오버라이드", () => {
  it("시트의 말투 서술을 정리해 가져오고, 그 밖의 값은 비워 둔 채 '미입력'으로 표시한다", () => {
    const cards = deriveStudioTranslationEffectiveCards({
      bible,
      narrative,
      set: EMPTY_STUDIO_TRANSLATION_CARD_SET,
    });
    expect(cards.map((card) => card.characterId)).toEqual(["yuna", "minho", "hana"]);
    const yuna = cards[0];
    expect(yuna?.speechNote).toBe("존댓말, 끝을 흐린다");
    expect(yuna?.speechNoteSource).toBe("sheet");
    expect(yuna?.register).toBeNull();
    expect(yuna?.addressTerms).toEqual([]);
    expect(yuna?.filled).toEqual({
      speechNote: true,
      register: false,
      addressTerms: false,
      fixedTerms: false,
      bannedTerms: false,
    });
    // 시트가 비어 있으면 말투도 "미입력" — 지어내지 않는다.
    expect(cards[1]?.speechNote).toBe("");
    expect(cards[1]?.speechNoteSource).toBe("empty");
    expect(cards[1]?.filled.speechNote).toBe(false);
    // 시트에 프로필 레코드 자체가 없는 인물도 같다.
    expect(cards[2]?.speechNoteSource).toBe("empty");
  });

  it("번역용 오버라이드가 시트 말투를 덮고, 비우면 시트로 돌아간다 — 시트 원본은 그대로다", () => {
    const set = parseStudioTranslationCharacterCardSet(validSet());
    if (!set) throw new Error("fixture");
    const overridden = deriveStudioTranslationEffectiveCards({ bible, narrative, set })[0];
    expect(overridden?.speechNote).toBe("상냥하게");
    expect(overridden?.speechNoteSource).toBe("override");
    expect(overridden?.sheetSpeechNote).toBe("존댓말, 끝을 흐린다");
    expect(overridden?.register).toBe("polite");
    const cleared = patchStudioTranslationCard(set, "yuna", { speechNote: null });
    expect(deriveStudioTranslationEffectiveCards({ bible, narrative, set: cleared })[0]?.speechNoteSource).toBe("sheet");
    // 입력 시트 객체는 변하지 않았다.
    expect(narrative.profiles[0]?.speechStyle).toBe("  존댓말, 끝을   흐린다  ");
  });

  it("시트 관계는 호칭이 아니라 힌트로만 쓰이고, 같은 청자의 중복 관계는 한 번만 나온다", () => {
    const yuna = deriveStudioTranslationEffectiveCards({ bible, narrative, set: EMPTY_STUDIO_TRANSLATION_CARD_SET })[0];
    expect(yuna?.sheetRelations).toEqual([
      { listenerId: "minho", listenerName: "민호", label: "선후배" },
      { listenerId: "hana", listenerName: "ハナ", label: "friend" },
    ]);
    expect(yuna?.addressTerms).toEqual([]);
  });

  it("순서는 바이블 → 직접 추가 → 시트에서 사라진 카드이고, 바이블이 없으면 저장된 카드만 보인다", () => {
    let set = addManualStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, { id: "manual-1", name: "Emma" });
    set = patchStudioTranslationCard(set, "ghost", { name: "사라진 인물", speechNote: "x" });
    const withBible = deriveStudioTranslationEffectiveCards({ bible, narrative, set });
    expect(withBible.map((card) => [card.characterId, card.origin])).toEqual([
      ["yuna", "story-bible"],
      ["minho", "story-bible"],
      ["hana", "story-bible"],
      ["manual-1", "manual"],
      ["ghost", "orphan"],
    ]);
    expect(withBible.at(-1)?.name).toBe("사라진 인물");

    const noBible = deriveStudioTranslationEffectiveCards({ bible: null, narrative: null, set });
    expect(noBible.map((card) => card.characterId)).toEqual(["manual-1", "ghost"]);
    expect(noBible[0]?.sheetSpeechNote).toBe("");
  });
});

describe("편집 연산 — 순수·참조 보존", () => {
  it("처음 편집할 때 시트 인물의 오버라이드를 만들고, 값 없는 편집은 카드를 만들지 않는다", () => {
    const untouched = patchStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, "yuna", {});
    expect(untouched).toBe(EMPTY_STUDIO_TRANSLATION_CARD_SET);

    const edited = patchStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, "yuna", {
      name: "유나",
      register: "polite",
    });
    expect(edited.cards).toHaveLength(1);
    expect(edited.cards[0]).toMatchObject({ characterId: "yuna", origin: "story-bible", name: "유나", register: "polite" });
    expect(EMPTY_STUDIO_TRANSLATION_CARD_SET.cards).toHaveLength(0);
  });

  it("시트 카드가 모든 값을 비우면 저장소에서 지우지만, 직접 추가한 카드는 남긴다", () => {
    let set = patchStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, "yuna", { register: "casual" });
    set = patchStudioTranslationCard(set, "yuna", { register: null });
    expect(set.cards).toEqual([]);

    let manual = addManualStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, { id: "m1", name: "Emma" });
    manual = patchStudioTranslationCard(manual, "m1", { register: null });
    expect(manual.cards).toHaveLength(1);
  });

  it("직접 추가: 빈 이름·중복 id·상한 초과는 거절하고 같은 참조를 돌려준다", () => {
    const base = addManualStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, { id: "m1", name: "  Emma  " });
    expect(base.cards[0]?.name).toBe("Emma");
    expect(addManualStudioTranslationCard(base, { id: "m2", name: "   " })).toBe(base);
    expect(addManualStudioTranslationCard(base, { id: "m1", name: "Other" })).toBe(base);
    let full: StudioTranslationCharacterCardSet = EMPTY_STUDIO_TRANSLATION_CARD_SET;
    for (let index = 0; index < STUDIO_TRANSLATION_CARD_LIMITS.cards; index += 1) {
      full = addManualStudioTranslationCard(full, { id: `m${index}`, name: `N${index}` });
    }
    expect(addManualStudioTranslationCard(full, { id: "extra", name: "Extra" })).toBe(full);
  });

  it("카드를 지우면 그 인물을 화자로 지정한 대사는 풀리고, 청자로 지정한 대사는 청자만 비워진다", () => {
    let set = addManualStudioTranslationCard(EMPTY_STUDIO_TRANSLATION_CARD_SET, { id: "m1", name: "Emma" });
    set = setStudioTranslationSpeaker(set, "b1", { speakerId: "m1", listenerId: "yuna" });
    set = setStudioTranslationSpeaker(set, "b2", { speakerId: "yuna", listenerId: "m1" });
    set = setStudioTranslationSpeaker(set, "b3", { speakerId: "yuna", listenerId: null });
    const removed = removeStudioTranslationCard(set, "m1");
    expect(removed.cards).toEqual([]);
    expect(removed.speakers).toEqual({
      b2: { speakerId: "yuna", listenerId: null },
      b3: { speakerId: "yuna", listenerId: null },
    });
    expect(removeStudioTranslationCard(removed, "nobody")).toBe(removed);
  });

  it("화자 지정: 지정·변경·해제를 하고, 청자가 화자와 같으면 비우며, 변화가 없으면 같은 참조를 돌려준다", () => {
    const a = setStudioTranslationSpeaker(EMPTY_STUDIO_TRANSLATION_CARD_SET, "b1", { speakerId: "yuna", listenerId: "yuna" });
    expect(a.speakers.b1).toEqual({ speakerId: "yuna", listenerId: null });
    expect(setStudioTranslationSpeaker(a, "b1", { speakerId: "yuna", listenerId: null })).toBe(a);
    const b = setStudioTranslationSpeaker(a, "b1", { speakerId: "yuna", listenerId: "minho" });
    expect(b.speakers.b1).toEqual({ speakerId: "yuna", listenerId: "minho" });
    const c = setStudioTranslationSpeaker(b, "b1", { speakerId: null, listenerId: null });
    expect(c.speakers).toEqual({});
    expect(setStudioTranslationSpeaker(c, "b1", { speakerId: null, listenerId: null })).toBe(c);
  });

  it("지금 문서에 없는 대사의 지정만 정리하고, 정리할 게 없으면 같은 참조를 돌려준다", () => {
    let set = setStudioTranslationSpeaker(EMPTY_STUDIO_TRANSLATION_CARD_SET, "live", { speakerId: "yuna", listenerId: null });
    set = setStudioTranslationSpeaker(set, "dead", { speakerId: "yuna", listenerId: null });
    const pruned = pruneStudioTranslationSpeakers(set, new Set(["live"]));
    expect(Object.keys(pruned.speakers)).toEqual(["live"]);
    expect(pruneStudioTranslationSpeakers(pruned, new Set(["live"]))).toBe(pruned);
  });

  it("화자 지정 현황을 센다", () => {
    let set = setStudioTranslationSpeaker(EMPTY_STUDIO_TRANSLATION_CARD_SET, "b1", { speakerId: "yuna", listenerId: "minho" });
    set = setStudioTranslationSpeaker(set, "b2", { speakerId: "minho", listenerId: null });
    expect(summarizeStudioTranslationSpeakers(set, ["b1", "b2", "b3"])).toEqual({ total: 3, assigned: 2, withListener: 1 });
  });

  it("존대 단계 층위: 격식·존대는 존대, 반말·평서는 비존대", () => {
    expect(studioTranslationRegisterTier("formal")).toBe("honorific");
    expect(studioTranslationRegisterTier("polite")).toBe("honorific");
    expect(studioTranslationRegisterTier("casual")).toBe("non-honorific");
    expect(studioTranslationRegisterTier("plain")).toBe("non-honorific");
  });
});
