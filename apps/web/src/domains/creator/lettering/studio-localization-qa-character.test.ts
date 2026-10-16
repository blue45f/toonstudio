import { describe, expect, it } from "vitest";

import {
  checkStudioTranslationCharacterRules,
  type StudioCharacterQaCue,
  type StudioCharacterQaResult,
} from "./studio-localization-qa-character";
import {
  deriveStudioTranslationEffectiveCards,
  parseStudioTranslationCharacterCardSet,
  type StudioTranslationEffectiveCard,
  type StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";
import { studioTranslationTextContains } from "./studio-translation-term-match";

/** 카드 기록들로부터 효과 카드를 만든다(바이블 없이 — 직접 추가 카드만 보인다). */
function cardsFrom(records: readonly Record<string, unknown>[]): readonly StudioTranslationEffectiveCard[] {
  const set = parseStudioTranslationCharacterCardSet({ schemaVersion: 1, cards: records });
  if (set === null) throw new Error("fixture");
  return deriveStudioTranslationEffectiveCards({ bible: null, narrative: null, set });
}

function manual(characterId: string, name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { characterId, origin: "manual", name, ...over };
}

function cue(id: string, text: string, sourceText?: string, pageIndex = 0): StudioCharacterQaCue {
  return { id, pageIndex, text, ...(sourceText === undefined ? {} : { sourceText }) };
}

function speakers(
  entries: Readonly<Record<string, readonly [string, string | null]>>,
): Readonly<Record<string, StudioTranslationSpeakerAssignment>> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, [speakerId, listenerId]]) => [id, { speakerId, listenerId }]),
  );
}

function run(input: {
  cues: readonly StudioCharacterQaCue[];
  cards: readonly StudioTranslationEffectiveCard[];
  speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>>;
  targetLocale?: string;
}): StudioCharacterQaResult {
  return checkStudioTranslationCharacterRules({ targetLocale: "en", ...input });
}

const YUNA = manual("yuna", "유나", {
  register: "polite",
  addressTerms: [
    { listenerId: "minho", sourceTerm: "선배", targetTerm: "Senpai", locale: "en", register: null, avoidTerms: ["Sunbae", "Senior"] },
  ],
  fixedTerms: [{ source: "나만 믿어", target: "Leave it to me", locale: "en" }],
  bannedTerms: [{ term: "dude", locale: "en" }],
});
const MINHO = manual("minho", "민호");

describe("호칭 일관성 (Terminology)", () => {
  it("카드가 피하라고 적은 변형을 쓰면 Terminology 경고를 싣는다 — 서브타입은 지어내지 않는다", () => {
    const result = run({
      cues: [cue("c1", "Thanks, Sunbae!", "고마워요, 선배!", 1)],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"] }),
    });
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0];
    expect(error).toMatchObject({ dimension: "terminology", severity: "minor", cueId: "c1", page: 2 });
    expect(error?.subtype).toBeUndefined();
    expect(error?.evidence).toMatchObject({
      ruleId: "character/address-variant",
      expected: "Senpai",
      actual: "Sunbae",
      listenerName: "민호",
    });
    expect(error?.note).toContain("Senpai");
  });

  it("카드 호칭을 지키면 오류가 없고, 규칙을 실제로 대 본 큐로 센다", () => {
    const result = run({
      cues: [cue("c1", "Thanks, Senpai!", "고마워요, 선배!")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"] }),
    });
    expect(result.errors).toEqual([]);
    expect(result.status).toBe("ran");
    expect(result.ruleCheckedCueCount).toBe(1);
  });

  it("카드 호칭만 적힌 행(피할 표기도 원문 호칭도 없음)은 오류를 낼 수 없으므로 '대 본 큐'로 세지 않는다", () => {
    const yuna = manual("yuna", "유나", {
      addressTerms: [{ listenerId: "minho", sourceTerm: "", targetTerm: "Senpai", locale: "", register: null, avoidTerms: [] }],
    });
    const result = run({
      cues: [cue("c1", "Thanks a lot!", "정말 고마워요!")],
      cards: cardsFrom([yuna, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"] }),
    });
    expect(result.errors).toEqual([]);
    expect(result.attributedCueCount).toBe(1);
    expect(result.ruleCheckedCueCount).toBe(0);
  });

  it("원문을 모르더라도 피할 표기가 있으면 변형 검사는 돌아 '대 본 큐'로 센다", () => {
    const result = run({
      cues: [cue("c1", "Thanks, Sunbae!")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"] }),
    });
    expect(result.errors.map((e) => e.evidence?.ruleId)).toEqual(["character/address-variant"]);
    expect(result.ruleCheckedCueCount).toBe(1);
  });

  it("원문에 호칭이 있는데 번역에 카드 호칭도 변형도 없으면 '누락' 경고를 싣는다", () => {
    const result = run({
      cues: [cue("c1", "Thank you so much!", "정말 고마워요, 선배!")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"] }),
    });
    expect(result.errors.map((e) => e.evidence?.ruleId)).toEqual(["character/address-missing"]);
  });

  it("원문에 그 호칭이 없으면(대명사 생략 등) 호칭 누락으로 단정하지 않는다", () => {
    const result = run({
      cues: [cue("c1", "Thank you so much!", "정말 고마워요!")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"] }),
    });
    expect(result.errors).toEqual([]);
  });

  it("같은 화자→청자에서 카드 호칭을 쓴 대사를 근거 대사로 싣고, 근거가 뒤에 나와도 찾는다", () => {
    const result = run({
      cues: [
        cue("c1", "Thanks, Sunbae!", "고마워요, 선배!"),
        cue("c2", "See you, Senpai.", "내일 봐요, 선배."),
        cue("c3", "Right, Sunbae.", "맞아요, 선배."),
      ],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"], c2: ["yuna", "minho"], c3: ["yuna", "minho"] }),
    });
    expect(result.errors.map((e) => [e.cueId, e.evidence?.referenceCueId])).toEqual([
      ["c1", "c2"],
      ["c3", "c2"],
    ]);
  });

  it("청자가 지정되지 않은 대사에는 호칭 규칙을 적용하지 않는다", () => {
    const result = run({
      cues: [cue("c1", "Thanks, Sunbae!", "고마워요, 선배!")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", null] }),
    });
    expect(result.errors.filter((e) => String(e.evidence?.ruleId).startsWith("character/address"))).toEqual([]);
  });

  it("대상 언어가 다르면 규칙이 적용되지 않고, 일본어 번역에서는 가나 표기 변형을 잡는다", () => {
    const yuna = manual("yuna", "유나", {
      addressTerms: [
        { listenerId: "minho", sourceTerm: "선배", targetTerm: "先輩", locale: "ja", register: null, avoidTerms: ["センパイ"] },
      ],
    });
    const cards = cardsFrom([yuna, MINHO]);
    const cues = [cue("c1", "センパイ、ありがとうございます。", "선배, 고마워요.")];
    const map = speakers({ c1: ["yuna", "minho"] });

    expect(run({ cues, cards, speakers: map, targetLocale: "en" }).errors).toEqual([]);
    const ja = run({ cues, cards, speakers: map, targetLocale: "ja-JP" });
    expect(ja.errors.map((e) => e.evidence?.ruleId)).toEqual(["character/address-variant"]);
    expect(ja.errors[0]?.evidence?.actual).toBe("センパイ");
  });

  it("라틴 표기는 단어 경계를 본다 — 'Sun' 변형 규칙이 'Sunday'에 걸리지 않는다", () => {
    const yuna = manual("yuna", "유나", {
      addressTerms: [
        { listenerId: "minho", sourceTerm: "", targetTerm: "Senpai", locale: "", register: null, avoidTerms: ["Sun"] },
      ],
    });
    const run1 = run({
      cues: [cue("c1", "See you on Sunday.", "일요일에 봐요."), cue("c2", "Thanks, Sun-bae!", "고마워요.")],
      cards: cardsFrom([yuna, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"], c2: ["yuna", "minho"] }),
    });
    expect(run1.errors.map((e) => e.cueId)).toEqual(["c2"]);
  });
});

describe("고정어·금지어 (Terminology)", () => {
  it("원문에 고정어가 있는데 번역이 지정한 표현이 아니면 major 오류를 싣는다", () => {
    const result = run({
      cues: [cue("c1", "Trust me!", "나만 믿어!")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", null] }),
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ dimension: "terminology", severity: "major" });
    expect(result.errors[0]?.evidence).toMatchObject({ ruleId: "character/fixed-term", expected: "Leave it to me" });
  });

  it("고정어를 지켰거나 원문에 그 표현이 없으면 오류가 없다", () => {
    const base = { cards: cardsFrom([YUNA, MINHO]), speakers: speakers({ c1: ["yuna", null] }) };
    expect(run({ ...base, cues: [cue("c1", "Leave it to me!", "나만 믿어!")] }).errors).toEqual([]);
    expect(run({ ...base, cues: [cue("c1", "Okay.", "알겠어.")] }).errors).toEqual([]);
  });

  it("원문을 모르면 고정어 검사는 돌지 않고 '대 본 큐'에도 세지 않는다", () => {
    const result = run({
      cues: [cue("c1", "Trust me!")],
      cards: cardsFrom([manual("yuna", "유나", { fixedTerms: [{ source: "나만 믿어", target: "Leave it to me", locale: "" }] })]),
      speakers: speakers({ c1: ["yuna", null] }),
    });
    expect(result.errors).toEqual([]);
    expect(result.ruleCheckedCueCount).toBe(0);
    expect(result.attributedCueCount).toBe(1);
    // 못 돈 사정도 센다 — "고정어 위반 0건"이 통과로 읽히지 않게.
    expect(result.sourceMissingCueCount).toBe(1);
  });

  it("원문이 없어도 금지어·존대 규칙뿐이면 건너뛴 것이 없으므로 원문 부재로 세지 않는다", () => {
    const result = run({
      cues: [cue("c1", "Whatever, dude.")],
      cards: cardsFrom([manual("yuna", "유나", { bannedTerms: [{ term: "dude", locale: "" }] })]),
      speakers: speakers({ c1: ["yuna", null] }),
    });
    expect(result.errors).toHaveLength(1);
    expect(result.sourceMissingCueCount).toBe(0);
  });

  it("원문 호칭이 적힌 호칭 행도 원문이 없으면 건너뛰고 센다 — 대상 언어가 다른 고정어는 세지 않는다", () => {
    const card = manual("yuna", "유나", {
      addressTerms: [{ listenerId: "minho", sourceTerm: "선배", targetTerm: "Senpai", locale: "en", register: null, avoidTerms: [] }],
      fixedTerms: [{ source: "나만 믿어", target: "任せて", locale: "ja" }],
    });
    const result = run({
      cues: [cue("c1", "Thanks, Senpai."), cue("c2", "Thanks.", "고마워.")],
      cards: cardsFrom([card, MINHO]),
      speakers: speakers({ c1: ["yuna", "minho"], c2: ["yuna", "minho"] }),
    });
    expect(result.sourceMissingCueCount).toBe(1);
    // 일본어 고정어는 en 번역에 적용되지 않아 c2(원문 있음)도 c1(원문 없음)도 고정어 때문에 세지 않는다.
    const noAddress = run({
      cues: [cue("c1", "Thanks.")],
      cards: cardsFrom([manual("yuna", "유나", { fixedTerms: [{ source: "나만 믿어", target: "任せて", locale: "ja" }] })]),
      speakers: speakers({ c1: ["yuna", null] }),
    });
    expect(noAddress.sourceMissingCueCount).toBe(0);
  });

  it("금지어는 대소문자·전각 표기를 가리지 않고 잡는다", () => {
    const base = { cards: cardsFrom([YUNA, MINHO]), speakers: speakers({ c1: ["yuna", null] }) };
    const upper = run({ ...base, cues: [cue("c1", "Whatever, DUDE.")] });
    const fullwidth = run({ ...base, cues: [cue("c1", "Whatever, ｄｕｄｅ.")] });
    expect(upper.errors[0]?.evidence).toMatchObject({ ruleId: "character/banned-term", actual: "dude" });
    expect(fullwidth.errors).toHaveLength(1);
    expect(upper.errors[0]).toMatchObject({ dimension: "terminology", severity: "major" });
  });

  it("금지어도 단어 경계를 본다('dude'는 'dudeness'에 걸리지 않는다) — 다른 언어 번역에는 적용되지 않는다", () => {
    const base = { cards: cardsFrom([YUNA, MINHO]), speakers: speakers({ c1: ["yuna", null] }) };
    expect(run({ ...base, cues: [cue("c1", "A dudeness of spirit.")] }).errors).toEqual([]);
    expect(run({ ...base, cues: [cue("c1", "dude")], targetLocale: "ja" }).errors).toEqual([]);
  });
});

describe("존대 단계 불일치 (Style)", () => {
  const cards = cardsFrom([manual("yuna", "유나", { register: "polite" }), MINHO]);
  const map = speakers({ c1: ["yuna", "minho"] });

  it("존댓말 인물의 한국어 번역이 반말이면 Style major 오류를 싣는다", () => {
    const result = run({ cues: [cue("c1", "알았어. 갈게.")], cards, speakers: map, targetLocale: "ko" });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ dimension: "style", severity: "major", cueId: "c1" });
    expect(result.errors[0]?.evidence).toMatchObject({ ruleId: "character/register", actual: "반말" });
    expect(result.registerCheckedCueCount).toBe(1);
  });

  it("존대 안에서 격식이 어긋나면 minor 이고, 맞으면 오류가 없다", () => {
    const formal = run({ cues: [cue("c1", "알겠습니다.")], cards, speakers: map, targetLocale: "ko" });
    expect(formal.errors[0]).toMatchObject({ dimension: "style", severity: "minor" });
    const ok = run({ cues: [cue("c1", "알겠어요.")], cards, speakers: map, targetLocale: "ko" });
    expect(ok.errors).toEqual([]);
  });

  it("일본어 번역도 판정한다 — 존댓말 인물이 'ぞ' 말투를 쓰면 어긋난다", () => {
    const bad = run({ cues: [cue("c1", "行くぞ！")], cards, speakers: map, targetLocale: "ja" });
    expect(bad.errors[0]?.evidence).toMatchObject({ ruleId: "character/register" });
    expect(run({ cues: [cue("c1", "行きます。")], cards, speakers: map, targetLocale: "ja" }).errors).toEqual([]);
  });

  it("대답말·정형 인사는 존댓말 인물에게 불일치를 만들지 않는다 — 일본어 'はい。'·'どうぞ。'와 한국어 '네네.'", () => {
    for (const text of ["はい。", "どうぞ。", "はい、どうぞ。", "ご心配なく。"]) {
      const result = run({ cues: [cue("c1", text)], cards, speakers: map, targetLocale: "ja" });
      expect(result.errors).toEqual([]);
      expect(result.registerCheckedCueCount).toBe(0);
      expect(result.registerUnclassifiedCueCount).toBe(1);
    }
    const korean = run({ cues: [cue("c1", "네네.")], cards, speakers: map, targetLocale: "ko" });
    expect(korean.errors).toEqual([]);
    expect(korean.registerCheckedCueCount).toBe(0);
  });

  it("영어처럼 판정하지 않는 언어는 오류를 만들지 않고, 판정하지 않았다고 알린다", () => {
    const result = run({ cues: [cue("c1", "Gotta go. See ya.")], cards, speakers: map, targetLocale: "en" });
    expect(result.errors).toEqual([]);
    expect(result.registerUnsupportedLocale).toBe(true);
    expect(result.registerCheckedCueCount).toBe(0);
  });

  it("어미로 층위를 읽지 못한 큐는 판정하지 않고 따로 센다", () => {
    const result = run({ cues: [cue("c1", "민호 선배")], cards, speakers: map, targetLocale: "ko" });
    expect(result.errors).toEqual([]);
    expect(result.registerUnclassifiedCueCount).toBe(1);
    expect(result.registerCheckedCueCount).toBe(0);
  });

  it("청자별 단계가 인물 기본 단계보다 우선한다 — 후배에게는 반말인 인물", () => {
    const yuna = manual("yuna", "유나", {
      register: "polite",
      addressTerms: [{ listenerId: "minho", sourceTerm: "", targetTerm: "", locale: "", register: "casual", avoidTerms: [] }],
    });
    const result = run({
      cues: [cue("c1", "알았어. 가자.")],
      cards: cardsFrom([yuna, MINHO]),
      speakers: map,
      targetLocale: "ko",
    });
    expect(result.errors).toEqual([]);
    expect(result.registerCheckedCueCount).toBe(1);
  });

  it("같은 화자→청자에서 기대 단계로 옮겨진 대사를 근거 대사로 싣는다", () => {
    const result = run({
      cues: [cue("c1", "알았어."), cue("c2", "알겠어요.")],
      cards,
      speakers: speakers({ c1: ["yuna", "minho"], c2: ["yuna", "minho"] }),
      targetLocale: "ko",
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.evidence?.referenceCueId).toBe("c2");
  });
});

describe("화자 귀속·적용 범위의 정직성", () => {
  it("화자가 지정되지 않은 대사는 어떤 인물 규칙도 받지 않고, 지정/미지정 수를 센다", () => {
    const result = run({
      cues: [cue("c1", "Whatever, dude."), cue("c2", "Hey dude."), cue("c3", "Dude.")],
      cards: cardsFrom([YUNA, MINHO]),
      speakers: speakers({ c1: ["yuna", null] }),
    });
    expect(result.errors.map((e) => e.cueId)).toEqual(["c1"]);
    expect(result.attributedCueCount).toBe(1);
    expect(result.unattributedCueCount).toBe(2);
  });

  it("화자는 지정됐지만 그 인물의 카드가 없으면 규칙 없이 지나가고, 카드 수에도 세지 않는다", () => {
    const result = run({
      cues: [cue("c1", "Hey dude.")],
      cards: cardsFrom([YUNA]),
      speakers: speakers({ c1: ["ghost", null] }),
    });
    expect(result.errors).toEqual([]);
    expect(result.attributedCueCount).toBe(1);
    expect(result.ruleCheckedCueCount).toBe(0);
  });

  it("원문 로케일을 검사 중이면 인물 규칙 전체를 건너뛴다", () => {
    const result = run({
      cues: [cue("c1", "Hey dude.")],
      cards: cardsFrom([YUNA]),
      speakers: speakers({ c1: ["yuna", null] }),
      targetLocale: "source",
    });
    expect(result.status).toBe("source-locale");
    expect(result.errors).toEqual([]);
  });

  it("규칙이 하나도 적히지 않은 카드뿐이면 '꺼짐' 이다(오류 0건을 통과로 읽지 않게)", () => {
    const result = run({
      cues: [cue("c1", "Hey dude.")],
      cards: cardsFrom([MINHO]),
      speakers: speakers({ c1: ["minho", null] }),
    });
    expect(result.status).toBe("off");
    expect(result.cardCount).toBe(0);
  });

  it("심각도는 정책값이라 호출부가 갈아 끼울 수 있다", () => {
    const result = checkStudioTranslationCharacterRules({
      cues: [cue("c1", "Hey dude.")],
      cards: cardsFrom([YUNA]),
      speakers: speakers({ c1: ["yuna", null] }),
      targetLocale: "en",
      severity: { bannedTerm: "critical" },
    });
    expect(result.errors[0]?.severity).toBe("critical");
  });

  it("오류 id 는 서로 다르고 입력 객체는 변형하지 않는다", () => {
    const cues = [cue("c1", "Sunbae, dude.", "선배")];
    const cards = cardsFrom([YUNA, MINHO]);
    const map = speakers({ c1: ["yuna", "minho"] });
    const before = JSON.stringify({ cues, cards, map });
    const result = run({ cues, cards, speakers: map });
    expect(new Set(result.errors.map((e) => e.id)).size).toBe(result.errors.length);
    expect(result.errors.length).toBeGreaterThan(1);
    expect(JSON.stringify({ cues, cards, map })).toBe(before);
  });
});

describe("studioTranslationTextContains — 단어 경계 인식 부분 문자열", () => {
  it("라틴은 경계를 보고 한글·가나·한자는 조사가 붙어도 일치로 본다", () => {
    expect(studioTranslationTextContains("Hey, Sun!", "sun")).toBe(true);
    expect(studioTranslationTextContains("Sunday", "sun")).toBe(false);
    expect(studioTranslationTextContains("선배를 만났다", "선배")).toBe(true);
    expect(studioTranslationTextContains("先輩が来た", "先輩")).toBe(true);
    expect(studioTranslationTextContains("anything", "")).toBe(false);
  });

  it("영어 복수형·소유형과 하이픈 표기는 같은 말로 보되, 다른 단어에는 걸리지 않는다", () => {
    expect(studioTranslationTextContains("The Demon Kings gather.", "Demon King")).toBe(true);
    expect(studioTranslationTextContains("The Demon-King's castle", "Demon King")).toBe(true);
    expect(studioTranslationTextContains("Thanks, Senpais!", "Senpai")).toBe(true);
    expect(studioTranslationTextContains("the kings' hall", "king")).toBe(true);
    expect(studioTranslationTextContains("the Demon King", "demon-king")).toBe(true);
    // 하이픈은 경계라 접두 일치는 예전처럼 걸리고, 이어 붙은 다른 단어는 걸리지 않는다.
    expect(studioTranslationTextContains("Sun-bae", "Sun")).toBe(true);
    expect(studioTranslationTextContains("Sunsets are red", "sun")).toBe(false);
    expect(studioTranslationTextContains("Sunbae", "Sun")).toBe(false);
    // 3글자 미만은 굴절을 허용하지 않는다 — "us" 가 "uses" 에 걸리지 않게.
    expect(studioTranslationTextContains("He uses it", "us")).toBe(false);
  });

  it("한글은 형태소 분석을 하지 않아 짧은 표기가 다른 단어 속에서도 일치한다 — 편집기가 이 한계를 밝힌다", () => {
    expect(studioTranslationTextContains("시야가 흐려졌다", "야")).toBe(true);
  });
});
