import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import type { HeaderPrimaryNavigationItem, HeaderSectionId } from "./site-header-navigation";
import { siteNavigationText } from "./site-navigation";

import { cx } from "@/shared/lib/cx";
import Link from "@/shared/navigation/router-link";

/** 단일 지도 목적지와 현재 구역 판정을 표시하고 포인터·키보드 패널 동작을 소유한다. */
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
  const groups = item.groups ?? [{ id: item.id, label: item.label, children: item.children ?? [] }];
  const children = groups.flatMap((group) => group.children);
  const hasChildren = children.length > 0;
  const highlighted = currentSection === item.id;
  const activeChild = highlighted ? children.find((child) => isActive(child.href, child.exact)) : undefined;
  const label = siteNavigationText(item.label, locale);
  const [open, setOpen] = useState(false);
  const submenuId = useId();
  const entryRef = useRef<HTMLDivElement>(null);
  const escapeClosedRef = useRef(false);
  const focusFirstOnOpenRef = useRef(false);

  useEffect(() => {
    if (!open || !hasChildren) return;
    // 닫힌 패널에서 ArrowDown을 누른 경우 DOM이 열린 뒤 첫 링크로 이동한다.
    if (focusFirstOnOpenRef.current) {
      focusFirstOnOpenRef.current = false;
      entryRef.current?.querySelector<HTMLElement>("ul a")?.focus();
    }
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
  }, [open, hasChildren]);

  const link = (
    <Link
      href={item.href}
      aria-current={highlighted ? (isActive(item.href, true) ? "page" : "true") : undefined}
      aria-haspopup={hasChildren ? "true" : undefined}
      aria-expanded={hasChildren ? open : undefined}
      aria-controls={hasChildren ? submenuId : undefined}
      title={siteNavigationText(item.description, locale)}
      data-navigation-entry={item.id}
      className="site-header__primary-link group"
      onKeyDown={hasChildren ? (event) => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        escapeClosedRef.current = false;
        if (open) entryRef.current?.querySelector<HTMLElement>("ul a")?.focus();
        else {
          focusFirstOnOpenRef.current = true;
          setOpen(true);
        }
      } : undefined}
    >
      <span>{label}</span>
      {hasChildren ? (
        <ChevronDown size={13} aria-hidden="true" className="site-header__chevron" data-open={open || undefined} />
      ) : null}
    </Link>
  );

  if (!hasChildren) return link;

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
        id={submenuId}
        data-app-tooltip-exclude="true"
        className="site-header__panel"
        data-open={open || undefined}
        data-wide={groups.length > 1 || undefined}
      >
        <div className="site-header__panel-body">
          {groups.map((group) => (
            <div key={group.id} className="site-header__panel-group">
              {groups.length > 1 ? <p className="site-header__panel-heading">{siteNavigationText(group.label, locale)}</p> : null}
              <ul aria-label={siteNavigationText(group.label, locale)}>
                {group.children.map((child, index) => {
                  const childActive = activeChild?.id === child.id;
                  const ChildIcon = child.icon;
                  const style: CSSProperties & { "--ink-i": number } = { "--ink-i": index };
                  return (
                    <li key={child.id} style={style}>
                      <Link href={child.href} aria-current={childActive ? "page" : undefined} className={cx("site-header__panel-link", childActive && "is-current")}>
                        <span className="site-header__panel-icon"><ChildIcon size={16} strokeWidth={1.5} aria-hidden="true" /></span>
                        <span className="min-w-0">
                          <span className="site-header__panel-label">{siteNavigationText(child.label, locale)}</span>
                          <span className="site-header__panel-description">{siteNavigationText(child.description, locale)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
