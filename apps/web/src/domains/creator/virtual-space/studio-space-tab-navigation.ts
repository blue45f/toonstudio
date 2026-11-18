import type { KeyboardEvent } from "react";

export function navigateStudioSpaceTab(event: KeyboardEvent<HTMLButtonElement>) {
  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
  const current = tabs.indexOf(event.currentTarget);
  if (current < 0) return;
  let index: number;
  switch (event.key) {
    case "ArrowLeft": index = (current + tabs.length - 1) % tabs.length; break;
    case "ArrowRight": index = (current + 1) % tabs.length; break;
    case "Home": index = 0; break;
    case "End": index = tabs.length - 1; break;
    default: return;
  }
  event.preventDefault();
  tabs[index]?.focus();
  tabs[index]?.click();
}
