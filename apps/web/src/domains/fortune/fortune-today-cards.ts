import { fortuneMajorArcanaCatalog, fortuneTarotCatalog, seededRandom } from "@toonstudio/core/fortune";

// 착지 히어로의 "오늘의 카드" — KST 날짜를 시드로 메이저 아르카나에서 뽑는
// 결정적 드로우. 같은 날짜면 방문자·새로고침과 무관하게 같은 4장이 나오고,
// 개인 입력(생년월일 등)은 시드에 섞지 않는다.
export interface FortuneTodayCard {
  readonly id: number;
  readonly name: string;
  readonly nameEn: string;
  readonly keywords: readonly string[];
  /** 카드 카탈로그의 정방향 편집 문구 — 카드 아래 한 줄 소개로 쓴다. */
  readonly line: string;
}

export const FORTUNE_TODAY_CARD_COUNT = 4;

export function drawFortuneTodayCards(date: string, count = FORTUNE_TODAY_CARD_COUNT): FortuneTodayCard[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("오늘의 카드는 YYYY-MM-DD 날짜로만 뽑을 수 있어요.");
  }
  const size = Math.min(Math.max(Math.trunc(count), 0), 22);
  const lines = new Map(fortuneTarotCatalog().map((card) => [card.id, card.uprightText]));
  const deck = fortuneMajorArcanaCatalog();
  const random = seededRandom(`toonstudio-fortune-today-cards-v1:${date}`);
  // Fisher–Yates: 전체를 섞은 뒤 앞에서 자르면 중복 없는 결정적 순서가 된다.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, size).map((card) => ({
    id: card.id,
    name: card.name,
    nameEn: card.nameEn,
    keywords: card.keywords,
    line: lines.get(card.id) ?? "",
  }));
}

// 보관함 저장·공유에 공용으로 쓰는 평문 요약.
export function fortuneTodayCardsText(date: string, cards: readonly FortuneTodayCard[]): string {
  return [
    `오늘의 카드 · ${date}`,
    ...cards.map((card) => `${card.name}(${card.nameEn}) — ${card.keywords.join(" · ")}`),
  ].join("\n");
}
