import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import {
  headerNavigationChildren,
  type HeaderPrimaryNavigationItem,
  type HeaderSectionId,
} from "./site-header-navigation";
import { siteNavigationText } from "./site-navigation";
import {
  accentToneBadgeClasses,
  resolvePageRoleJourney,
} from "./workspace/page-role-journey-map";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";

/** One top-level header destination, with an optional hover/focus panel.
 * The panel opens on pointer hover and on keyboard focus-within, and open
 * state is mirrored in React state so the trigger exposes `aria-expanded`,
 * Escape closes the panel and returns focus to the trigger, matching the
 * mobile menu's pattern. It is `visibility: hidden` while closed so its
 * links stay out of the tab order.
 *
 * 1차 표시는 글자 링크만 둔다. 현재 위치는 잉크 밑줄(헤더 공용 표시)이 맡고, 아이콘과
 * 설명은 패널 안에서만 보인다. 묶음이 둘 이상이면 제목이 있는 2단 패널로 그린다. */
export function HeaderPrimaryNavigationEntry({
  item,
  locale,
  currentSection,
  isActive,
}: {
  readonly item: HeaderPrimaryNavigationItem;
  readonly locale: string;
  readonly currentSection: HeaderSectionId | null;
  readonly isActive: (href: string, exact?: boolean) => boolean;
}) {
  // 구역이 하나로 정해지므로 최상위 강조도 항상 한 곳뿐이다. 하위 항목은 그 구역 안에서만 표시한다.
  const highlighted = currentSection === item.id;
  const children = headerNavigationChildren(item);
  const hasPanel = children.length > 0;
  const activeChild = highlighted ? children.find((child) => isActive(child.href, child.exact)) : undefined;
  const label = siteNavigationText(item.label, locale);
  const isKo = locale.toLowerCase().startsWith("ko");
  const itemRole = resolvePageRoleJourney(item.href);
  const [open, setOpen] = useState(false);
  const submenuId = useId();
  // Escape로 닫은 직후에는 트리거로 돌아온 포커스가 패널을 다시 열지 않게 한다.
  const escapeClosedRef = useRef(false);
  const entryRef = useRef<HTMLDivElement>(null);
  const groups = item.groups ?? [];
  const wide = groups.length > 1;

  // Escape 닫기는 래퍼 div의 키보드 핸들러가 아니라 window 리스너로 처리한다.
  // 이벤트 대상이 이 항목(트리거·패널) 안일 때만 닫고 트리거로 포커스를 되돌린다.
  useEffect(() => {
    if (!open || !hasPanel) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const entry = entryRef.current;
      if (!entry || !(event.target instanceof Node) || !entry.contains(event.target)) return;
      event.stopPropagation();
      escapeClosedRef.current = true;
      setOpen(false);
      entry.querySelector<HTMLElement>("[data-navigation-entry]")?.focus();
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [open, hasPanel]);

  const link = (
    <Link
      href={item.href}
      aria-current={highlighted ? (isActive(item.href, true) ? "page" : "true") : undefined}
      aria-haspopup={hasPanel ? "true" : undefined}
      aria-expanded={hasPanel ? open : undefined}
      aria-controls={hasPanel ? submenuId : undefined}
      title={`${isKo ? itemRole.stageBadgeKo : itemRole.stageBadgeEn} · ${siteNavigationText(item.description, locale)}`}
      data-navigation-entry={item.id}
      data-journey-stage={itemRole.stageNumber}
      data-accent-tone={itemRole.accentTone}
      className="site-header__primary-link group"
      onKeyDown={hasPanel ? (event) => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        escapeClosedRef.current = false;
        setOpen(true);
        entryRef.current?.querySelector<HTMLElement>("ul a")?.focus();
      } : undefined}
    >
      <span>{label}</span>
      {hasPanel ? (
        <ChevronDown size={13} aria-hidden="true" className="site-header__chevron" data-open={open || undefined} />
      ) : null}
    </Link>
  );

  if (!hasPanel) return link;

  let childIndex = 0;
  return (
    <div
      ref={entryRef}
      className="group relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-app-tooltip-layer="true"]')) return;
        escapeClosedRef.current = false;
        setOpen(false);
      }}
      onFocus={() => { if (!escapeClosedRef.current) setOpen(true); }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        escapeClosedRef.current = false;
        setOpen(false);
      }}
    >
      {link}
      <div
        data-app-tooltip-exclude="true"
        className="site-header__panel"
        data-open={open || undefined}
        data-wide={wide || undefined}
      >
        <div id={submenuId} className="site-header__panel-body">
          {groups.map((group) => (
            <section key={group.id} className="site-header__panel-group" aria-label={wide ? undefined : label}>
              {wide ? <p className="site-header__panel-heading">{siteNavigationText(group.label, locale)}</p> : null}
              <ul aria-label={wide ? siteNavigationText(group.label, locale) : label}>
                {group.children.map((child) => {
                  const childActive = activeChild?.id === child.id;
                  const ChildIcon = child.icon;
                  const childRole = resolvePageRoleJourney(child.href);
                  const index = childIndex++;
                  return (
                    <li key={child.id} style={{ "--ink-i": index } as CSSProperties}>
                      <Link
                        href={child.href}
                        aria-current={childActive ? "page" : undefined}
                        data-journey-stage={childRole.stageNumber}
                        data-accent-tone={childRole.accentTone}
                        className={cx("site-header__panel-link", childActive && "is-current")}
                      >
                        <span className="site-header__panel-icon" aria-hidden="true">
                          <ChildIcon size={16} strokeWidth={1.5} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="site-header__panel-label">{siteNavigationText(child.label, locale)}</span>
                            <span
                              aria-hidden="true"
                              className={cx(
                                "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                                accentToneBadgeClasses(childRole.accentTone),
                              )}
                            >
                              {isKo ? childRole.stageBadgeKo : childRole.stageBadgeEn}
                            </span>
                          </span>
                          <span className="site-header__panel-description">{siteNavigationText(child.description, locale)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
