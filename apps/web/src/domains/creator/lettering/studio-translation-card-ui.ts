/**
 * 번역 인물 카드 편집 UI가 공유하는 클래스 토큰과 작은 헬퍼(React 컴포넌트 아님).
 *
 * 색은 의미 토큰(`line`·`card`·`fg`·`accent`·`warn`)만 쓴다 — raw 색상값은 DESIGN.md 가 금지한다.
 * 터치 환경(`pointer-coarse`)에서는 컨트롤 높이를 44px 로 올린다.
 */

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { cx } from "@/shared/lib/cx";

export const CARD_INPUT_CLASS = cx(
  "min-h-9 w-full rounded-lg border border-line bg-card px-2 py-1 text-[0.7rem] text-fg outline-none",
  "transition-colors placeholder:text-fg-3 focus-visible:border-accent/60",
  STUDIO_FOCUS_RING,
  "pointer-coarse:min-h-11",
);

export const CARD_LABEL_CLASS = "block text-[0.62rem] font-medium text-fg-2";

export const CARD_SMALL_BUTTON_CLASS = cx(
  "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2",
  "text-[0.64rem] font-semibold text-fg-2 transition-colors hover:bg-raised",
  STUDIO_FOCUS_RING,
  "disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
);

/** "미입력" 표지 — 색만으로 말하지 않고 글자로 말한다. */
export const CARD_MISSING_BADGE_CLASS =
  "rounded-full border border-warn/35 bg-warn/10 px-1.5 py-0.5 text-[0.58rem] font-bold leading-none text-warn";

/** 쉼표·줄바꿈으로 구분한 입력을 표기 목록으로 바꾼다(빈 항목 제거). */
export function splitCardTermList(raw: string): string[] {
  return raw
    .split(/[,\n，、]/u)
    .map((term) => term.trim())
    .filter((term) => term !== "");
}

/** 직접 추가하는 인물 카드의 id. 호출부(이벤트 핸들러)에서만 부른다 — 렌더 중 호출 금지. */
export function createManualCardId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `manual-${random}`;
}
