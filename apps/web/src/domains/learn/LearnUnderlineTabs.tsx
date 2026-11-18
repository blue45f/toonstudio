import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  prefersReducedMotion,
  siteTabId,
  siteTabPanelId,
} from "@/domains/legal/public/site-tabs";
import { cn } from "@/shared/lib/utils";

export interface LearnUnderlineTabItem<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  /** 라벨 옆에 조용한 tabular-nums 숫자로 붙는 보조 집계(예: 12, 36). */
  readonly count?: ReactNode;
}

export interface LearnUnderlineTabsProps<T extends string> {
  readonly tabs: readonly LearnUnderlineTabItem<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly label: string;
  readonly idPrefix: string;
  readonly className?: string;
}

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * 학습 도메인 언더라인 탭 바.
 * 알약·테두리 상자 대신 1px 기준선과 미끄러지는 잉크 밑줄 하나로 현재 구간을 표시한다.
 */
export function LearnUnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  className,
}: LearnUnderlineTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const syncInkIndicator = () => {
    const list = listRef.current;
    if (!list) return;
    const activeIndex = tabs.findIndex((tab) => tab.id === value);
    const buttons = list.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const activeButton = buttons[activeIndex];
    const listWidth = list.scrollWidth || list.clientWidth;
    if (!activeButton || listWidth <= 0) {
      delete list.dataset.inkReady;
      return;
    }
    const left = activeButton.offsetLeft;
    const scale = Math.max(activeButton.offsetWidth / listWidth, 0.02);
    list.style.setProperty("--ink-tab-w-base", `${listWidth}px`);
    list.style.setProperty("--ink-tab-x", `${left}px`);
    list.style.setProperty("--ink-tab-scale", scale.toFixed(5));
    list.dataset.inkReady = "true";
  };

  useLayoutEffect(() => {
    syncInkIndicator();
  });

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncInkIndicator();
    });
    observer.observe(list);
    for (const btn of list.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      observer.observe(btn);
    }
    return () => observer.disconnect();
  });

  const select = (next: T, moveFocus: boolean) => {
    onChange(next);
    const list = listRef.current;
    if (!list) return;
    if (moveFocus) {
      const index = tabs.findIndex((tab) => tab.id === next);
      const target = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
      target?.focus();
      target?.scrollIntoView?.({
        block: "nearest",
        inline: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
    if (
      list.getBoundingClientRect().top < 0 &&
      typeof list.scrollIntoView === "function"
    ) {
      list.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!NAVIGATION_KEYS.has(event.key) || tabs.length === 0) return;
    event.preventDefault();
    const last = tabs.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next) select(next.id, true);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn("learn-underline-tabs scroll-mt-24", className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            id={siteTabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={siteTabPanelId(idPrefix, tab.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => select(tab.id, false)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="learn-underline-tab"
          >
            <span className="learn-underline-tab__label">{tab.label}</span>
            {tab.count != null ? (
              <span className="learn-underline-tab__count">
                {" "}
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
      <span aria-hidden="true" className="learn-underline-tabs__ink" />
    </div>
  );
}
