import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function readerChoiceClass(active: boolean): string {
  return active
    ? "inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! max-w-full items-center justify-center rounded-full border border-accent bg-accent-soft px-3.5 py-2 text-left text-xs font-bold leading-snug text-accent shadow-2xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-center"
    : "inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! max-w-full items-center justify-center rounded-full border border-line-strong/70 bg-card/85 px-3.5 py-2 text-left text-xs font-semibold leading-snug text-fg-2 transition-colors hover:border-accent/60 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-center";
}

export function stepRovingChip<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  order: readonly T[],
  current: T,
  onSelect: (next: T) => void,
  refs: Record<T, HTMLButtonElement | null>,
): void {
  const currentIndex = order.indexOf(current);
  let nextId: T | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextId = order[(currentIndex + 1) % order.length] ?? order[0];
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextId = order[(currentIndex - 1 + order.length) % order.length] ?? order[0];
  } else if (event.key === "Home") {
    nextId = order[0];
  } else if (event.key === "End") {
    nextId = order[order.length - 1] ?? order[0];
  }
  if (nextId) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(nextId);
    refs[nextId]?.focus();
  }
}
