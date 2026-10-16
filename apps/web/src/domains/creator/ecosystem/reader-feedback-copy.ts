/**
 * 독자 피드백 화면 공용 표시 문구(한국어/영어 쌍)와 공용 Tailwind 클래스.
 *
 * 화면은 `useBilingual("ReaderFeedback")`가 돌려주는 `bt(ko, en)`로 쌍을 현재 언어로 바꾼다.
 * 감정 이름처럼 데이터에 붙은 문구는 이 파일에 모아 폼과 요약이 같은 말을 쓰게 한다.
 */
import type { RatingLevel, ReaderEmotionId } from "./reader-feedback-schema";

export interface BilingualLabel {
  readonly ko: string;
  readonly en: string;
}

export const FUN_LEVEL_LABELS: Readonly<Record<RatingLevel, BilingualLabel>> = {
  1: { ko: "별로였어요", en: "Not fun" },
  2: { ko: "괜찮았어요", en: "It was okay" },
  3: { ko: "재밌었어요", en: "Fun" },
};

export const UNDERSTANDING_LEVEL_LABELS: Readonly<Record<RatingLevel, BilingualLabel>> = {
  1: { ko: "헷갈렸어요", en: "Confusing" },
  2: { ko: "대체로 이해했어요", en: "Mostly clear" },
  3: { ko: "한눈에 이해했어요", en: "Instantly clear" },
};

export const EMOTION_LABELS: Readonly<Record<ReaderEmotionId, BilingualLabel>> = {
  excited: { ko: "설렘", en: "Fluttering" },
  funny: { ko: "웃김", en: "Funny" },
  touched: { ko: "감동", en: "Touching" },
  satisfied: { ko: "통쾌함", en: "Satisfying" },
  surprised: { ko: "놀람", en: "Surprising" },
  tense: { ko: "긴장", en: "Tense" },
  sad: { ko: "슬픔", en: "Sad" },
  angry: { ko: "분노", en: "Infuriating" },
  confused: { ko: "혼란", en: "Confusing" },
  bored: { ko: "지루함", en: "Boring" },
};

/** 폼과 요약이 함께 쓰는 입력·버튼 클래스. 색은 모두 의미 토큰이다. */
export const RF_CONTROL = "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
export const RF_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
export const RF_PRIMARY = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-bold text-on-accent hover:bg-accent-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
