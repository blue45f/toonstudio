/**
 * 문장 허브 공용 클래스. 색은 DESIGN.md 의 의미 토큰(canvas·panel·raised·line·fg·accent)만 쓴다.
 * 칩의 켜짐/꺼짐은 색만으로 구분하지 않는다: aria-pressed 와 함께 ✓/＋ 아이콘을 항상 곁들인다.
 */
const CHIP_BASE = "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const HUB_CHIP_ON = `${CHIP_BASE} border-accent bg-accent-soft text-fg`;
export const HUB_CHIP_OFF = `${CHIP_BASE} border-line bg-canvas text-fg-2 hover:bg-raised`;
export const HUB_CHIP_SUGGESTED = `${CHIP_BASE} border-dashed border-line bg-canvas text-fg-2 hover:bg-raised`;
export const HUB_CHIP_STATIC = "inline-flex min-h-8 max-w-full items-center rounded-full border border-line bg-canvas px-3 text-xs text-fg-2";

export const HUB_PRIMARY_BUTTON = "fx-press inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export const HUB_SKELETON = "animate-pulse rounded bg-raised motion-reduce:animate-none";
