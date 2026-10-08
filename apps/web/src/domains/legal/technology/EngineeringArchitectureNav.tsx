import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { cx } from "@/shared/lib/cx";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitectureNav", ko, en);

export interface ArchitectureNavItem {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  /** 같은 묶음의 구간은 같은 값. 묶음이 바뀌는 곳에 구분선을 그린다. */
  readonly groupId: string;
}

/** 화면 위쪽 20~40% 띠에 걸친 첫 구간을 현재 위치로 본다. 구간 사이 빈 곳에서는 직전 값을 유지한다. */
function useActiveSection(ids: readonly string[]): string | null {
  const key = ids.join("|");
  const [active, setActive] = useState<string | null>(() => ids[0] ?? null);
  useEffect(() => {
    const list = key.split("|").filter(Boolean);
    if (typeof IntersectionObserver === "undefined" || list.length === 0) return undefined;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = list.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const id of list) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function setAllDisclosures(bodyId: string, open: boolean): void {
  document.getElementById(bodyId)?.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]").forEach((element) => {
    element.open = open;
  });
}

const BUTTON_CLASS =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 본문 위에 붙어 따라오는 구간 이동 띠. 번호만 보이는 알약을 누르면 그 구간으로 가고,
 * 지금 읽는 구간은 제목까지 펼쳐 보인다. 가로 폭을 본문에 다 쓰려고 왼쪽 목차 대신 이 띠를 쓴다.
 * 오른쪽 버튼은 구간 안의 접힌 상세를 한꺼번에 펼치거나 접는다(`details[data-eng-disclosure]`).
 */
export function ArchitectureSectionStrip({ items, bodyId }: { readonly items: readonly ArchitectureNavItem[]; readonly bodyId: string }) {
  useBilingualI18nRevision();
  const active = useActiveSection(items.map((item) => item.id));
  const listRef = useRef<HTMLOListElement>(null);

  // 지금 구간의 알약이 가로 스크롤 안에 보이도록 맞춘다(세로 스크롤은 건드리지 않는다).
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    const offset = current.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    list.scrollLeft = Math.max(0, offset - (list.clientWidth - current.offsetWidth) / 2);
  }, [active]);

  return (
    <nav
      aria-label={bi("구간 이동", "Move between sections")}
      className="sticky top-[calc(var(--site-header-height,4rem)+0.5rem)] z-30 rounded-2xl border border-line/70 bg-panel/95 shadow-sm backdrop-blur-xl print:hidden"
    >
      <div className="flex items-center gap-2 p-1.5">
        <ol ref={listRef} className="flex min-w-0 flex-1 snap-x items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
          {items.map((item, index) => {
            const current = item.id === active;
            const startsGroup = index > 0 && items[index - 1]?.groupId !== item.groupId;
            return (
              <Fragment key={item.id}>
                {startsGroup ? <li aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line-strong" /> : null}
                <li className="shrink-0 snap-start">
                  <a
                    href={`#${item.id}`}
                    aria-current={current ? "location" : undefined}
                    aria-label={`${item.number}. ${item.title}`}
                    title={item.title}
                    className={cx(
                      "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      current ? "border-accent/45 bg-card text-fg shadow-sm" : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        "grid size-6 shrink-0 place-items-center rounded-full font-display text-xs font-black tabular-nums",
                        current ? "bg-accent text-on-accent" : "bg-accent-soft text-accent",
                      )}
                    >
                      {item.number}
                    </span>
                    {current ? <span aria-hidden="true" className="whitespace-nowrap pr-0.5">{item.title}</span> : null}
                  </a>
                </li>
              </Fragment>
            );
          })}
        </ol>
        <div className="flex shrink-0 gap-1.5 border-l border-line/70 pl-2">
          <button type="button" className={BUTTON_CLASS} aria-label={bi("모두 펼치기", "Expand all")} onClick={() => setAllDisclosures(bodyId, true)}>
            <ChevronsUpDown size={15} aria-hidden="true" />
            <span className="hidden lg:inline">{bi("모두 펼치기", "Expand all")}</span>
          </button>
          <button type="button" className={BUTTON_CLASS} aria-label={bi("모두 접기", "Collapse all")} onClick={() => setAllDisclosures(bodyId, false)}>
            <ChevronsDownUp size={15} aria-hidden="true" />
            <span className="hidden lg:inline">{bi("모두 접기", "Collapse all")}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
