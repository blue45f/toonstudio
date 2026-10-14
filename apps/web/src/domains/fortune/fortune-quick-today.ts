import { seededRandom } from "@toonstudio/core/fortune";

import { drawFortuneTodayCards, type FortuneTodayCard } from "./fortune-today-cards";

// 캐릭터 없이 바로 보는 "오늘의 운세" 1단계 결과 — 진입 장벽 완화 (discover D-11).
//
// 기존 캐릭터 운세(CharacterFortunePage)는 캐릭터를 고르기 전에는 어떤 결과도
// 보여 주지 않았다. 이 모듈은 날짜(KST, YYYY-MM-DD) 하나만으로 결정적으로
// 산출되는 "모두의 오늘 기운"을 만든다: 캐릭터 id도, 생년월일도 시드에 섞지
// 않으므로 로그인·입력·선택 없이 페이지 진입만으로 첫 결과에 도달할 수 있다.
// 개인화(사주 오행·캐릭터 해석)는 2단계인 캐릭터 운세가 담당하고, 이 결과는
// 그 앞단의 공통 결과임을 컴포넌트 문구로 명시한다.
//
// 점수·행운 풀(컬러·방위·시간대·숫자)은 코어 엔진 drawTodayFortune의
// 비개인화(anon) 분기와 같은 어휘·범위를 쓴다 — 1단계와 2단계가 같은 언어로
// 이어지게 하기 위해서다. 시드만 다르다(날짜 단독 vs 날짜+캐릭터+생년월일).

/** 비개인화 분기와 같은 행운 컬러 풀 (@toonstudio/core drawTodayFortune anon 분기). */
export const QUICK_TODAY_COLORS: readonly string[] = [
  "금색", "보라색", "청록색", "검은색", "붉은색", "은색", "주황색", "푸른색",
];

/** 비개인화 분기와 같은 행운 방위 풀. */
export const QUICK_TODAY_DIRECTIONS: readonly string[] = [
  "동쪽", "서쪽", "남쪽", "북쪽", "남동쪽", "북동쪽", "남서쪽", "북서쪽",
];

/** 비개인화 분기와 같은 행운 시간대 풀. */
export const QUICK_TODAY_TIME_SLOTS: readonly string[] = [
  "오전 07시 ~ 09시", "오전 10시 ~ 12시", "오후 01시 ~ 03시",
  "오후 04시 ~ 06시", "오후 07시 ~ 09시", "오후 10시 ~ 12시",
];

export interface QuickTodayFortune {
  /** KST 기준 날짜 (YYYY-MM-DD) — 이 결과의 유일한 입력. */
  readonly date: string;
  /** 오늘의 운세 지수 60~100 (코어 비개인화 분기와 같은 범위). */
  readonly score: number;
  /** 점수 구간 헤드라인 — 캐릭터 운세 오늘 결과와 같은 문구를 쓴다. */
  readonly headline: string;
  readonly color: string;
  readonly direction: string;
  readonly time: string;
  /** 행운의 숫자 0~9. */
  readonly luckyNumber: number;
  /** 오늘의 카드 1장 (날짜 시드 드로우의 첫 장). 카탈로그가 비면 null. */
  readonly card: FortuneTodayCard | null;
}

/** 점수 구간 헤드라인 — FortunePage 오늘 결과 디스플레이의 문구와 동일하게 유지한다. */
export function quickTodayHeadline(score: number): string {
  if (score >= 90) return "★ 최고의 하루 ★";
  if (score >= 80) return "☆ 맑음 & 평온 ☆";
  return "무난하고 조심스러운 하루";
}

/**
 * 날짜만으로 1단계 오늘의 운세를 산출한다.
 * 같은 날짜면 방문자·새로고침·캐릭터 선택 여부와 무관하게 항상 같은 결과다.
 * 날짜 형식이 YYYY-MM-DD가 아니면 던진다 (fortune-today-cards와 같은 계약).
 */
export function buildQuickTodayFortune(date: string): QuickTodayFortune {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("오늘의 운세는 YYYY-MM-DD 날짜로만 볼 수 있어요.");
  }
  // 시드에 캐릭터·생년월일을 섞지 않는 것이 이 모듈의 계약이다.
  const rng = seededRandom(`toonstudio-fortune-quick-today-v1:${date}`);
  // 난수 소비 순서는 코어 비개인화 분기(점수 → 컬러 → 방위 → 시간대 → 숫자)와 같다.
  const score = Math.floor(rng() * 41) + 60;
  const color = QUICK_TODAY_COLORS[Math.floor(rng() * QUICK_TODAY_COLORS.length)];
  const direction = QUICK_TODAY_DIRECTIONS[Math.floor(rng() * QUICK_TODAY_DIRECTIONS.length)];
  const time = QUICK_TODAY_TIME_SLOTS[Math.floor(rng() * QUICK_TODAY_TIME_SLOTS.length)];
  const luckyNumber = Math.floor(rng() * 10);
  const card = drawFortuneTodayCards(date, 1)[0] ?? null;
  return {
    date,
    score,
    headline: quickTodayHeadline(score),
    color,
    direction,
    time,
    luckyNumber,
    card,
  };
}

// 보관함 저장·공유에 쓸 수 있는 평문 요약 (fortuneTodayCardsText와 같은 형식 결).
export function quickTodayFortuneText(quick: QuickTodayFortune): string {
  const lines = [
    `오늘의 운세 · ${quick.date}`,
    `${quick.score}점 — ${quick.headline}`,
    `행운의 컬러 ${quick.color} · 행운의 방향 ${quick.direction} · 행운의 시간대 ${quick.time} · 행운의 숫자 ${quick.luckyNumber}`,
  ];
  if (quick.card) {
    lines.push(`오늘의 카드 ${quick.card.name}(${quick.card.nameEn}) — ${quick.card.keywords.join(" · ")}`);
  }
  return lines.join("\n");
}
