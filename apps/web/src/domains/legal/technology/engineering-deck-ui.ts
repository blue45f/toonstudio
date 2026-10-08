import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 발표 페이지(EngineeringDeckPage)와 거기서 갈라져 나온 파일(조작 막대·발표 화면 계층·워크숍 모듈)이 함께 쓰는 값.
 * 문자열이 파일 사이로 옮겨져도 번역 키(범위 + 문장)가 바뀌지 않도록 번역 범위를 한 곳에 둔다.
 */
export const DECK_PAGE_I18N_SCOPE = "EngineeringDeckPage";
export const deckPageBi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale(DECK_PAGE_I18N_SCOPE, ko, en);

export const CONTROL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45";

/** 도감 부록 카드를 열었다가 원래 발표 위치로 돌아가는 동작. */
export interface DeckReturnPoint {
  readonly label: string;
  readonly onReturn: () => void;
}
