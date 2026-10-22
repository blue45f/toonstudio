/**
 * 분기형 컷툰 실험 화면의 공용 클래스 — 기존 의미 토큰(canvas·panel·card·raised·line·fg·accent·good·warn·bad)만 쓴다.
 * 색을 직접 쓰지 않으므로 테마(라이트/다크/고대비)가 바뀌어도 그대로 따라가고, 모든 단추·입력은 44px 이상의 대상을 가진다.
 */
import { cn } from "@/shared/lib/utils";

export const BC_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** 큰 구획 하나를 담는 표면. 중첩 카드를 만들지 않도록 안쪽 구획은 border 만 쓴다. */
export const BC_SURFACE = "rounded-2xl border border-line bg-card p-4 sm:p-5";
export const BC_SUBSURFACE = "rounded-xl border border-line bg-panel/55 p-3";

export const BC_LABEL = "block text-xs font-bold text-fg-2";
export const BC_HINT = "text-xs leading-5 text-fg-3";
export const BC_HEADING = "text-base font-black text-fg sm:text-lg";

export const BC_INPUT = cn(
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-45",
  BC_FOCUS_RING,
);

export const BC_TEXTAREA = cn(
  "min-h-20 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm leading-6 text-fg disabled:cursor-not-allowed disabled:opacity-45",
  BC_FOCUS_RING,
);

/** 작은 보조 단추(아이콘 포함). */
export const BC_SMALL_BUTTON = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none",
  BC_FOCUS_RING,
);

/** 주요 행동 단추(강조 면). */
export const BC_PRIMARY_BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent transition-colors duration-150 hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none",
  BC_FOCUS_RING,
);

/** 독자가 누르는 선택지 단추. 한 칸에 라벨이 길어도 줄바꿈되고, 높이는 44px 이상이다. */
export const BC_CHOICE_BUTTON = cn(
  "min-h-12 w-full rounded-xl border border-accent/45 bg-accent-soft px-4 py-3 text-left text-sm font-bold leading-6 text-fg transition-colors duration-150 hover:border-accent motion-reduce:transition-none [overflow-wrap:anywhere]",
  BC_FOCUS_RING,
);

/** 되돌릴 수 없는 행동 단추. */
export const BC_DANGER_BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-bad/50 bg-bad/10 px-4 text-sm font-bold text-bad transition-colors duration-150 hover:bg-bad/20 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none",
  BC_FOCUS_RING,
);

export type BcTone = "info" | "good" | "warn" | "bad";

export const BC_TONE_CLASS: Readonly<Record<BcTone, string>> = Object.freeze({
  info: "border-accent/30 bg-accent-soft/55 text-fg-2",
  good: "border-good/30 bg-good/10 text-fg-2",
  warn: "border-warn/35 bg-warn/10 text-fg-2",
  bad: "border-bad/35 bg-bad/10 text-fg-2",
});

/** 장면 종류 배지. 색만으로 전달하지 않도록 글자를 함께 둔다. */
export const BC_KIND_BADGE: Readonly<Record<"start" | "scene" | "ending", string>> = Object.freeze({
  start: "border-accent/50 bg-accent-soft text-fg",
  scene: "border-line bg-raised text-fg-2",
  ending: "border-good/50 bg-good/10 text-fg",
});

export const BC_SKELETON = "rounded-lg bg-raised motion-safe:animate-pulse";
