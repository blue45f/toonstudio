import { describe, expect, it } from "vitest";

import {
  compareStudioTranslationRegister,
  detectStudioTranslationRegister,
  studioRegisterLanguageOf,
  type StudioRegisterDetection,
} from "./studio-translation-register";

function detect(text: string, locale: string): StudioRegisterDetection {
  const result = detectStudioTranslationRegister(text, locale);
  if (result === null) throw new Error(`unsupported locale in fixture: ${locale}`);
  return result;
}

describe("studioRegisterLanguageOf", () => {
  it("한국어·일본어만 지원하고, 지역 서브태그·밑줄 표기·대소문자를 가리지 않는다", () => {
    expect(studioRegisterLanguageOf("ko")).toBe("ko");
    expect(studioRegisterLanguageOf("ko-KR")).toBe("ko");
    expect(studioRegisterLanguageOf("JA_jp")).toBe("ja");
    expect(studioRegisterLanguageOf("en-US")).toBeNull();
    expect(studioRegisterLanguageOf("zh-Hans")).toBeNull();
    expect(studioRegisterLanguageOf("")).toBeNull();
    expect(studioRegisterLanguageOf("source")).toBeNull();
  });

  it("미지원 언어는 '존대 일치'가 아니라 판정 자체를 하지 않는다(null)", () => {
    expect(detectStudioTranslationRegister("Sir, yes sir.", "en")).toBeNull();
    expect(detectStudioTranslationRegister("好的。", "zh-Hans")).toBeNull();
  });
});

describe("detectStudioTranslationRegister — 한국어 번역", () => {
  it("해요체는 존대(보통)로 읽는다", () => {
    expect(detect("알겠어요. 고마워요.", "ko")).toMatchObject({
      tier: "honorific",
      level: "polite",
      classifiedSentences: 2,
      totalSentences: 2,
    });
  });

  it("합쇼체는 존대(격식)로 읽는다", () => {
    expect(detect("감사합니다. 알겠습니다.", "ko")).toMatchObject({ tier: "honorific", level: "formal" });
  });

  it("해체·해라체는 반말 쪽(비존대)으로 읽고 세부 결은 판정하지 않는다", () => {
    expect(detect("알았어. 가자!", "ko")).toMatchObject({ tier: "non-honorific", level: null });
    expect(detect("그건 아니다.", "ko")).toMatchObject({ tier: "non-honorific", level: null });
  });

  it("기본 어미 표가 놓치는 합쇼체 의문형(…ㅂ니까)을 존대(격식)로 보완하되, 이유 연결 어미 '…니까'는 건드리지 않는다", () => {
    expect(detect("지금 가십니까?", "ko")).toMatchObject({ tier: "honorific", level: "formal" });
    expect(detect("무엇을 합니까?", "ko")).toMatchObject({ tier: "honorific", level: "formal" });
    // 받침 ㅂ 이 없는 "하니까"는 합쇼체가 아니다.
    expect(detect("내가 할 테니까.", "ko")).toMatchObject({ tier: "non-honorific" });
  });

  it("문장이 섞이면 다수결이고, 동수면 단정하지 않는다", () => {
    expect(detect("알겠어요. 고마워요. 알았어.", "ko").tier).toBe("honorific");
    expect(detect("알겠어요. 알았어.", "ko")).toMatchObject({ tier: null, level: null, classifiedSentences: 2 });
  });

  it("대답말 '네'·'예'는 어미가 아니라 분류하지 않는다 — 감탄 종결 '예쁘네'는 그대로 읽는다", () => {
    expect(detect("네.", "ko")).toMatchObject({ tier: null, classifiedSentences: 0, totalSentences: 1 });
    expect(detect("아, 네!", "ko")).toMatchObject({ tier: null, classifiedSentences: 0 });
    expect(detect("예.", "ko")).toMatchObject({ tier: null, classifiedSentences: 0 });
    expect(detect("정말 예쁘네.", "ko")).toMatchObject({ tier: "non-honorific", classifiedSentences: 1 });
    // 대답말만 있는 대사는 존대 인물에게 불일치를 만들지 않는다.
    expect(compareStudioTranslationRegister("polite", detect("네.", "ko"))).toBeNull();
  });

  it("어미로 읽을 수 없는 문장은 분류하지 않고 센다", () => {
    expect(detect("민호 선배", "ko")).toMatchObject({ tier: null, classifiedSentences: 0, totalSentences: 1 });
    expect(detect("", "ko")).toMatchObject({ tier: null, classifiedSentences: 0, totalSentences: 0 });
  });
});

describe("detectStudioTranslationRegister — 일본어 번역", () => {
  it("です・ます는 존대(보통), ございます 류는 존대(격식)로 읽는다", () => {
    expect(detect("よろしくお願いします。", "ja")).toMatchObject({ tier: "honorific", level: "polite" });
    expect(detect("ありがとうございます。", "ja")).toMatchObject({ tier: "honorific", level: "formal" });
    expect(detect("いらっしゃいませ。", "ja-JP")).toMatchObject({ tier: "honorific", level: "formal" });
  });

  it("문말 조사(よ・ね・か)를 벗겨 어미를 본다 — 'ですよね'는 존대, 'だよね'는 비존대", () => {
    expect(detect("そうですよね。", "ja")).toMatchObject({ tier: "honorific" });
    expect(detect("そうなんですか？", "ja")).toMatchObject({ tier: "honorific" });
    expect(detect("そうだよね。", "ja")).toMatchObject({ tier: "non-honorific" });
    expect(detect("行こうぜ！", "ja")).toMatchObject({ tier: "non-honorific" });
  });

  it("한자·감탄사로 끝나는 문장은 읽지 않는다", () => {
    expect(detect("先輩！", "ja")).toMatchObject({ tier: null, classifiedSentences: 0 });
  });
});

describe("compareStudioTranslationRegister", () => {
  it("존대 ↔ 반말이 어긋나면 'tier', 존대 안에서 격식이 어긋나면 'level' 이다", () => {
    expect(compareStudioTranslationRegister("polite", detect("알았어.", "ko"))).toBe("tier");
    expect(compareStudioTranslationRegister("casual", detect("알겠어요.", "ko"))).toBe("tier");
    expect(compareStudioTranslationRegister("formal", detect("알겠어요.", "ko"))).toBe("level");
    expect(compareStudioTranslationRegister("polite", detect("알겠습니다.", "ko"))).toBe("level");
  });

  it("맞으면 null 이고, 반말 안의 결(해체/해라체)은 비교하지 않으며, 판정 불가면 null 이다", () => {
    expect(compareStudioTranslationRegister("polite", detect("알겠어요.", "ko"))).toBeNull();
    expect(compareStudioTranslationRegister("plain", detect("알았어.", "ko"))).toBeNull();
    expect(compareStudioTranslationRegister("casual", detect("그건 아니다.", "ko"))).toBeNull();
    expect(compareStudioTranslationRegister("polite", detect("민호 선배", "ko"))).toBeNull();
  });
});
