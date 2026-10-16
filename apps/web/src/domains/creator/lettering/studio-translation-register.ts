/**
 * Studio Translation Register — 번역문의 존대/반말 층위를 문장 어미로 판정하는 순수 휴리스틱.
 *
 * 왜 휴리스틱이고, 무엇을 약속하는가
 * -------------------------------
 * 인물 카드는 "이 인물은 이 상대에게 존댓말을 쓴다"를 적게 한다. QA 가 그 약속을 번역문과 대조하려면
 * 번역문이 존댓말인지 반말인지 읽어야 하는데, 이 모듈은 형태소 분석기 없이 **문장 끝 접미 일치**만으로
 * 읽는다. 그래서 다음을 지킨다.
 *  · 판정할 수 없으면 판정하지 않는다(`tier: null`). 모르는 어미를 존댓말/반말로 찍지 않는다.
 *  · 지원하는 언어만 읽는다 — 한국어(`ko`)와 일본어(`ja`). 영어·중국어 등에는 문법적 존대 표지가 없거나
 *    어미로 읽을 수 없어 `null`(미지원)을 돌려준다. 미지원을 "존대 일치"로 오해하지 않게 호출부가 구분한다.
 *  · 층위는 거칠게 둘(존대 / 반말)만 확정한다. 반말 안의 결(해체·해라체)은 어미만으로 믿을 수 없어
 *    `level` 을 비워 두고, 존대 안의 격식(합쇼체·해요체)만 갈린 경우에 한해 `level` 을 채운다.
 *  · 문장이 섞여 있으면 **다수결**이고 동수면 판정하지 않는다(말투가 일부러 바뀌는 대사를 단정하지 않는다).
 *
 * 한국어 분류표는 새로 만들지 않는다 — `studio-dialogue-voice` 의 종결 어미 분류(`extractSentenceEnding`)를
 * 그대로 쓰고, 접미만으로는 틀리는 곳만 이 모듈이 보완한다: "…ㅂ니까" 합쇼체 의문형과 "아니다" 같은 해라체는
 * 앞 음절의 받침으로, 대답말 "네"·"예"(존대 표지이지 감탄 종결 "~네"가 아니다)는 분류에서 뺀다.
 *
 * 순수·결정적. DOM/React 의존이 없다.
 */

import { extractSentenceEnding, splitDialogueSentences } from "./studio-dialogue-voice";
import { studioTranslationRegisterTier } from "./studio-translation-character-card";

import type {
  StudioTranslationRegister,
  StudioTranslationRegisterTier,
} from "./studio-translation-character-card";

export type StudioRegisterLanguage = "ko" | "ja";

/** 로케일("ko-KR", "ja", "ja_JP" …)이 존대 판정을 지원하는 언어인가. */
export function studioRegisterLanguageOf(locale: string): StudioRegisterLanguage | null {
  const language = locale.trim().replace(/_/gu, "-").toLowerCase().split("-")[0];
  return language === "ko" || language === "ja" ? language : null;
}

export interface StudioRegisterDetection {
  readonly language: StudioRegisterLanguage;
  /** 분류된 문장의 다수 층위. 분류된 문장이 없거나 동수면 null. */
  readonly tier: StudioTranslationRegisterTier | null;
  /** 존대 층위에서 격식(formal)과 보통(polite)이 갈린 경우에만 채운다. 그 밖에는 null. */
  readonly level: Extract<StudioTranslationRegister, "formal" | "polite"> | null;
  readonly classifiedSentences: number;
  readonly totalSentences: number;
}

// ── 한국어 ───────────────────────────────────────────────────────────────────

const KOREAN_TRAILING_NOISE = /[\s.!?…~"'“”‘’」』)）]+$/u;
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const BIEUP_FINAL = 17;

/** 받침이 ㅂ 인 한글 음절인가("합"·"갑"·"입"). */
function hasBieupFinal(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code >= HANGUL_BASE && code <= HANGUL_LAST && (code - HANGUL_BASE) % 28 === BIEUP_FINAL;
}

/**
 * 대답말로 쓰인 "네"·"예"(그렇습니다)와 그 반복·늘임("네네"·"예예"·"네에") — 어미가 아니라 말이라 표의 감탄 종결
 * "~네"(예쁘네)와 구분한다. 어절 전체가 이 모양일 때만 대답말이다("예쁘네" 는 어절이 더 길어 걸리지 않는다).
 */
const KOREAN_ANSWER_WORD = /^[네예]+에*$/u;

function classifyKoreanSentence(sentence: string): StudioTranslationRegister | null {
  const cleaned = sentence.replace(KOREAN_TRAILING_NOISE, "");
  // "네."·"아, 네." 처럼 마지막 어절이 대답말 그 자체면 분류하지 않는다. 표를 그대로 쓰면 존대 표지인 대답을
  // 해라체("~네")로 읽어 존대 인물의 대사를 반말로 오탐한다.
  const lastToken = cleaned.split(/[\s,，、]+/u).at(-1);
  if (lastToken !== undefined && KOREAN_ANSWER_WORD.test(lastToken)) return null;
  const beforeEnding = Array.from(cleaned).at(-3);
  // 기본 표(`extractSentenceEnding`)는 어미를 접미로만 읽어 두 곳을 틀린다. 앞 음절의 받침으로 가려 보완한다.
  //  · "…ㅂ니까/…습니까"(합쇼체 의문형)를 "까"(평서)로 읽는다 → 받침 ㅂ 뒤의 "니까"는 격식 존대다.
  //    ("하니까/이니까"처럼 이유를 잇는 어미는 받침 ㅂ 이 없어 여기에 걸리지 않는다.)
  //  · "아니다"를 "니다"(합쇼체)로 읽는다 → 받침 ㅂ 없는 "니다"는 합쇼체가 아니라 해라체 서술이다.
  if (beforeEnding !== undefined) {
    if (cleaned.endsWith("니까") && hasBieupFinal(beforeEnding)) return "formal";
    if (cleaned.endsWith("니다") && !hasBieupFinal(beforeEnding)) return "plain";
  }
  const { politeness } = extractSentenceEnding(sentence);
  return politeness === "unknown" ? null : politeness;
}

// ── 일본어 ───────────────────────────────────────────────────────────────────

const JAPANESE_TRAILING_NOISE = /[\s。.！!？?…‥~〜～♪ー」』)）]+$/u;
/** 문말 조사 — 벗기고 나서 어미를 본다("ですよね" → "です", "だよね" → "だ"). */
const JAPANESE_FINAL_PARTICLES = new Set(["よ", "ね", "な", "わ", "ぞ", "ぜ", "さ", "か", "の"]);
const JAPANESE_FORMAL_ENDINGS = [
  "でございました",
  "でございます",
  "ございました",
  "ございます",
  "いらっしゃいませ",
  "いらっしゃいます",
  "申し上げます",
  "いたします",
  "おります",
  "くださいませ",
];
const JAPANESE_POLITE_ENDINGS = [
  "ませんでした",
  "でしょう",
  "ましょう",
  "ました",
  "ません",
  "でした",
  "ください",
  "なさい",
  "です",
  "ます",
];
/** 존대 표지가 없는 종지 형태(기본형 어미·과거 た·だ·ない 등). 한자·감탄사로 끝나는 문장은 여기에 걸리지 않는다. */
const JAPANESE_PLAIN_ENDING = /(?:である|だった|なかった|ない|[だたるうくぐすつぬぶむいぜぞ])$/u;

/**
 * 대답말·정형 인사 — 문말 모양이 반말 어미를 닮았지만(はい 의 い, どうぞ 의 ぞ) 존대/반말을 가르는 말이 아니다.
 * 절 전체가 정확히 이 말일 때만 분류하지 않는다("はい、わかりました" 처럼 뒤에 서술이 이어지면 뒤 절의 어미를 읽는다).
 * 목록은 일부러 짧게 둔다 — 확실한 말만 빼고, 나머지는 어미 표가 읽는다.
 */
const JAPANESE_NEUTRAL_CLAUSES = new Set([
  "はい",
  "ええ",
  "いいえ",
  "いえ",
  "どうぞ",
  "どうも",
  "いらっしゃい",
  "いってらっしゃい",
]);
/** 접두 お·ご 가 붙은 "…なく" 정형 인사("ご心配なく"·"ご遠慮なく"·"お構いなく") — 높임 정형구라 어미로 읽지 않는다. */
const JAPANESE_HONORIFIC_SET_PHRASE = /^[おご][^\s、,，。]{1,12}なく$/u;
const JAPANESE_CLAUSE_SEPARATOR = /[、,，]/u;

function isJapaneseNeutralClause(trimmed: string): boolean {
  const lastClause = trimmed.split(JAPANESE_CLAUSE_SEPARATOR).at(-1)?.trim() ?? "";
  return JAPANESE_NEUTRAL_CLAUSES.has(lastClause) || JAPANESE_HONORIFIC_SET_PHRASE.test(lastClause);
}

function stripJapaneseFinalParticles(sentence: string): string {
  let current = sentence;
  for (let guard = 0; guard < 3; guard += 1) {
    const last = Array.from(current).at(-1);
    if (last === undefined || !JAPANESE_FINAL_PARTICLES.has(last)) break;
    current = current.slice(0, current.length - last.length);
  }
  return current;
}

function classifyJapaneseSentence(sentence: string): StudioTranslationRegister | null {
  const trimmed = sentence.replace(JAPANESE_TRAILING_NOISE, "");
  // 문말 조사를 벗기기 전에 본다 — "どうぞ" 의 ぞ 가 조사로 벗겨지면 "どう" 가 되어 반말 어미(う)로 읽힌다.
  if (isJapaneseNeutralClause(trimmed)) return null;
  const stripped = stripJapaneseFinalParticles(trimmed);
  if (stripped === "") return null;
  if (JAPANESE_FORMAL_ENDINGS.some((ending) => stripped.endsWith(ending))) return "formal";
  if (JAPANESE_POLITE_ENDINGS.some((ending) => stripped.endsWith(ending))) return "polite";
  // 일본어의 비존대는 "반말(해체)"과 "평서·하대"를 어미로 가를 수 없다 — 반말 쪽으로 읽되 층위만 쓴다.
  return JAPANESE_PLAIN_ENDING.test(stripped) ? "casual" : null;
}

function splitJapaneseSentences(text: string): string[] {
  return (text.match(/[^。！？!?…\n]+[。！？!?…]*/gu) ?? [])
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

/**
 * 번역문의 존대/반말 층위를 읽는다. 미지원 언어는 `null` — "존대 일치"가 아니라 "판정 안 함"이다.
 * 빈 문자열은 지원 언어라도 분류된 문장이 0 이라 `tier: null` 이다.
 */
export function detectStudioTranslationRegister(
  text: string,
  locale: string,
): StudioRegisterDetection | null {
  const language = studioRegisterLanguageOf(locale);
  if (language === null) return null;
  const sentences =
    language === "ko" ? splitDialogueSentences(text) : splitJapaneseSentences(text);
  const classify = language === "ko" ? classifyKoreanSentence : classifyJapaneseSentence;

  let formal = 0;
  let polite = 0;
  let nonHonorific = 0;
  for (const sentence of sentences) {
    const level = classify(sentence);
    if (level === null) continue;
    if (level === "formal") formal += 1;
    else if (level === "polite") polite += 1;
    else nonHonorific += 1;
  }
  const honorific = formal + polite;
  const classified = honorific + nonHonorific;
  const tier: StudioTranslationRegisterTier | null =
    honorific === nonHonorific ? null : honorific > nonHonorific ? "honorific" : "non-honorific";
  const level =
    tier === "honorific" && formal !== polite ? (formal > polite ? "formal" : "polite") : null;
  return Object.freeze({
    language,
    tier,
    level,
    classifiedSentences: classified,
    totalSentences: sentences.length,
  });
}

/** 기대 단계와 판정이 어긋나는 정도. 어긋나지 않거나 판정 불가면 null. */
export function compareStudioTranslationRegister(
  expected: StudioTranslationRegister,
  detection: StudioRegisterDetection,
): "tier" | "level" | null {
  if (detection.tier === null) return null;
  if (studioTranslationRegisterTier(expected) !== detection.tier) return "tier";
  if (detection.tier === "honorific" && detection.level !== null && detection.level !== expected) {
    return "level";
  }
  return null;
}
