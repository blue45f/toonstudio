/**
 * 소재 라이브러리 패널과 그 하위 조각이 함께 쓰는 클래스 조합.
 * 권리 필터 칩·카드 컨트롤·배치 방식 버튼은 모든 화면 폭에서 탭 대상 44px(min-h-11)를 지킨다(데스크톱에서도 줄이지 않는다).
 */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const CHIP_BASE = `inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2.5 text-[0.68rem] font-bold transition-colors ${FOCUS_RING}`;
export const CHIP_ON = "border-accent/55 bg-accent-soft text-accent";
export const CHIP_OFF = "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg";

export const CARD_ACTION_BUTTON =
  `inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-1.5 text-[0.64rem] font-bold text-fg-2 transition-colors hover:bg-raised hover:text-accent ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-45`;

/** 고지·안내 문단의 크기: 12px 이상. 색은 따로 붙인다(같은 색 계열 유틸리티를 두 개 겹쳐 쓰지 않는다). */
export const NOTICE_SIZE = "text-xs leading-relaxed";
/** 고지·안내 문단: 12px 이상이고, 가장 옅은 본문색(fg-3)이 아니라 한 단계 진한 fg-2 를 쓴다. */
export const NOTICE_TEXT = `${NOTICE_SIZE} text-fg-2`;

/** 값을 확인하지 못했다는 표시색. 선택된 칩의 강조색(accent)과 겹치지 않도록 경고 색 토큰을 쓴다. */
export const UNCONFIRMED_TEXT = "text-warn";
