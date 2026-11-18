import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";

import { prefersReducedMotion, siteTabId, siteTabPanelId } from "@/domains/legal/public/site-tabs";

export interface LearnUnderlineTabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly count?: number | string;
}

interface LearnUnderlineTabsProps<T extends string> {
  readonly tabs: readonly LearnUnderlineTabItem<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly label: string;
  readonly idPrefix: string;
}

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/** 첫 측정 전에는 CSS 밑줄을 쓰고, 실제 탭 크기가 확인된 뒤에만 이동 표시를 켠다. */
function useTabInk(ref: RefObject<HTMLDivElement | null>, value: string, layoutKey: string): void {
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    let disposed = false;
    let frame = 0;

    const measure = () => {
      if (disposed) return;
      const active = list.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
      const listBox = list.getBoundingClientRect();
      const activeBox = active?.getBoundingClientRect();
      const baseWidth = list.clientWidth || listBox.width;
      if (!activeBox || activeBox.width <= 0 || baseWidth <= 0) {
        list.removeAttribute("data-ink-ready");
        return;
      }
      const left = activeBox.left - listBox.left + list.scrollLeft - list.clientLeft;
      list.style.setProperty("--ink-tab-w-base", `${baseWidth}px`);
      list.style.setProperty("--ink-tab-x", `${left}px`);
      list.style.setProperty("--ink-tab-scale", String(activeBox.width / baseWidth));
      list.setAttribute("data-ink-ready", "true");
    };
    const schedule = () => {
      if (disposed) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(list);
    list.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab) => observer?.observe(tab));
    window.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [ref, value, layoutKey]);
}

export function LearnUnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: LearnUnderlineTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const layoutKey = tabs.map((tab) => `${tab.id}:${tab.label}:${tab.count ?? ""}`).join("|");
  useTabInk(listRef, value, layoutKey);

  function select(next: T, moveFocus: boolean) {
    onChange(next);
    const list = listRef.current;
    if (!list) return;
    const index = tabs.findIndex((tab) => tab.id === next);
    const button = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
    if (moveFocus) button?.focus();
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const listBox = list.getBoundingClientRect();
    const buttonBox = button?.getBoundingClientRect();
    if (buttonBox && (buttonBox.left < listBox.left || buttonBox.right > listBox.right)) {
      button?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior });
    }
    if (listBox.top < 0) list.scrollIntoView?.({ block: "start", behavior });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!NAVIGATION_KEYS.has(event.key) || tabs.length === 0) return;
    event.preventDefault();
    const last = tabs.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next) select(next.id, true);
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} className="learn-underline-tabs scroll-mt-24">
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            id={siteTabId(idPrefix, tab.id)}
            role="tab"
            aria-label={tab.count == null ? tab.label : `${tab.label} ${tab.count}`}
            aria-selected={active}
            aria-controls={siteTabPanelId(idPrefix, tab.id)}
            tabIndex={active ? 0 : -1}
            className="learn-underline-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => select(tab.id, false)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {tab.count != null && <span className="learn-underline-tab__count">{tab.count}</span>}
          </button>
        );
      })}
      <span className="learn-underline-tabs__ink" aria-hidden="true" />
    </div>
  );
}
