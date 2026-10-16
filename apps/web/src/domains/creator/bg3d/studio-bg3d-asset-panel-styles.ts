/** 소재 라이브러리 패널과 그 하위 조각이 함께 쓰는 클래스 조합. 탭 대상은 모바일 44px(min-h-11), 데스크톱 36px 이상이다. */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const CHIP_BASE = `inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2.5 text-[0.68rem] font-bold transition-colors ${FOCUS_RING} sm:min-h-9`;
export const CHIP_ON = "border-accent/55 bg-accent-soft text-accent";
export const CHIP_OFF = "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg";

export const CARD_ACTION_BUTTON =
  `inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-1.5 text-[0.64rem] font-bold text-fg-2 transition-colors hover:bg-raised hover:text-accent ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-8`;
