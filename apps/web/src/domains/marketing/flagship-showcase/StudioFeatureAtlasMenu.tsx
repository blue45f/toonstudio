import { ArrowRight, Compass, RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

import {
  ALL_ATLAS_FEATURES,
  FEATURE_ATLAS_DOMAINS,
  filterAtlasDomains,
  type AtlasDomainId,
  type BilingualText,
} from "./flagship-showcase-data";
import "./feature-atlas-menu.css";

export interface StudioFeatureAtlasMenuProps {
  readonly variant?: "nav" | "page" | "compact";
  readonly locale?: "ko" | "en";
}

function pickText(text: BilingualText, lang: "ko" | "en"): string {
  return lang === "en" ? text.en : text.ko;
}

/**
 * 상단 네비게이션(`CreatorHomeNavigation`) · `/features` · 홈 쇼케이스에서
 * 1클릭으로 열리는 6대 영역 × 24개 핵심 기능 아틀라스(Feature Atlas) 메뉴 드로어.
 *
 * Escape 닫기 시 호출 버튼으로 초점을 복원하며, 검색·영역 필터·원클릭 딥링크를 제공한다.
 */
export function StudioFeatureAtlasMenu({
  variant = "page",
  locale,
}: StudioFeatureAtlasMenuProps) {
  const storeLang = useI18n((state) => state.lang);
  const lang: "ko" | "en" = locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeDomain, setActiveDomain] = useState<AtlasDomainId | "all">("all");

  const dialogId = useId();
  const titleId = useId();
  const searchId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, closeAndRestoreFocus]);

  const filteredGroups = useMemo(
    () => filterAtlasDomains(query, activeDomain),
    [query, activeDomain],
  );

  const matchedCount = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.items.length, 0),
    [filteredGroups],
  );

  const triggerLabel = lang === "en"
    ? (variant === "nav" ? "Feature Atlas (24)" : "Open Feature Atlas")
    : (variant === "nav" ? "핵심 기능 아틀라스 · 24" : "핵심 기능 아틀라스 열기");

  const totalCount = ALL_ATLAS_FEATURES.length;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="feature-atlas-trigger"
        data-variant={variant}
        className={`fsh-atlas-trigger ${variant === "nav" ? "fsh-atlas-trigger--nav" : ""} [word-break:keep-all]`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Compass size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="fsh-tabular">{triggerLabel}</span>
      </button>

      {open ? (
        <div className="fsh-atlas-backdrop" data-testid="feature-atlas-backdrop">
          <button
            type="button"
            className="fsh-atlas-scrim"
            tabIndex={-1}
            aria-label={lang === "en" ? "Dismiss Feature Atlas" : "기능 아틀라스 배경 닫기"}
            onClick={closeAndRestoreFocus}
          />
          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="feature-atlas-dialog"
            className="fsh-atlas-drawer [word-break:keep-all]"
          >
            <div className="fsh-atlas-head">
              <div>
                <h2 id={titleId}>
                  {lang === "en"
                    ? "ToonStudio Core Feature Atlas"
                    : "ToonStudio 핵심 기능 아틀라스"}
                </h2>
                <p className="mt-1 text-xs text-fg-3 fsh-tabular">
                  {lang === "en"
                    ? `6 flagship domains · ${matchedCount} of ${totalCount} core capabilities`
                    : `6대 핵심 영역 · 전체 ${totalCount}개 중 ${matchedCount}개 표시`}
                </p>
              </div>
              <button
                type="button"
                data-testid="feature-atlas-close"
                className="fsh-btn"
                aria-label={lang === "en" ? "Close Feature Atlas" : "기능 아틀라스 닫기"}
                onClick={closeAndRestoreFocus}
              >
                <X size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{lang === "en" ? "Close" : "닫기"}</span>
              </button>
            </div>

            <div className="fsh-atlas-controls">
              <div className="relative">
                <label htmlFor={searchId} className="sr-only">
                  {lang === "en" ? "Search core features" : "핵심 기능 검색"}
                </label>
                <input
                  ref={searchInputRef}
                  id={searchId}
                  type="search"
                  data-testid="feature-atlas-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    lang === "en"
                      ? "Search 6B pencil, Kubelka-Munk, WebGPU, 15-joint hand, BYOT, OTIO..."
                      : "6B 연필, 쿠벨카-문크, WebGPU, 15관절 손, BYOT, OTIO 검색..."
                  }
                  className="fsh-atlas-search"
                />
              </div>

              <div
                className="fsh-pill-group"
                role="group"
                aria-label={lang === "en" ? "Filter by feature domain" : "기능 영역 필터"}
              >
                <button
                  type="button"
                  className="fsh-pill fsh-tabular"
                  aria-pressed={activeDomain === "all"}
                  onClick={() => setActiveDomain("all")}
                >
                  {lang === "en" ? `All (${totalCount})` : `전체 (${totalCount})`}
                </button>
                {FEATURE_ATLAS_DOMAINS.map((domain) => (
                  <button
                    key={domain.id}
                    type="button"
                    className="fsh-pill"
                    aria-pressed={activeDomain === domain.id}
                    onClick={() => setActiveDomain(domain.id)}
                  >
                    <span className="fsh-tabular">{domain.code}</span>
                    <span>{pickText(domain.title, lang)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="fsh-atlas-body">
              {filteredGroups.length === 0 ? (
                <div className="fsh-subcard" data-testid="feature-atlas-empty">
                  <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Search size={16} aria-hidden="true" />
                    <span>
                      {lang === "en"
                        ? "No matching core features found."
                        : "조건에 맞는 핵심 기능을 찾지 못했습니다."}
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="fsh-btn"
                      onClick={() => {
                        setQuery("");
                        setActiveDomain("all");
                        searchInputRef.current?.focus();
                      }}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      <span>{lang === "en" ? "Reset filter" : "검색 초기화"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                filteredGroups.map(({ domain, items }) => (
                  <section
                    key={domain.id}
                    className="fsh-atlas-group"
                    aria-labelledby={`atlas-domain-${domain.id}`}
                  >
                    <div className="fsh-atlas-group-head">
                      <h3 id={`atlas-domain-${domain.id}`}>
                        <span className="mr-1.5 text-accent fsh-tabular">{domain.code}</span>
                        {pickText(domain.title, lang)}
                      </h3>
                      <span className="text-xs text-fg-3">{pickText(domain.summary, lang)}</span>
                    </div>
                    <ul className="fsh-atlas-grid">
                      {items.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            className="fsh-atlas-item"
                            onClick={() => setOpen(false)}
                          >
                            <span>
                              <strong>{pickText(item.title, lang)}</strong>
                              <small>{pickText(item.summary, lang)}</small>
                            </span>
                            <ArrowRight size={15} strokeWidth={1.7} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
