import {
  ArrowRight,
  Box,
  Brush,
  CornerDownLeft,
  Layers,
  Music,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  GLOBAL_ASSET_CATALOG,
  GLOBAL_ASSET_QUICK_HUBS,
  filterGlobalAssetCatalog,
  isEditableEventTarget,
  type GlobalAssetCatalogEntry,
  type GlobalAssetCategory,
} from "./global-asset-search-index";
import "./global-asset-search-palette.css";

export interface GlobalAssetSearchPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelectAsset?: (asset: GlobalAssetCatalogEntry, targetHref: string) => void;
  readonly initialQuery?: string;
  readonly enableGlobalShortcut?: boolean;
  readonly onOpenRequest?: () => void;
}

const CATEGORY_TABS: readonly { readonly id: GlobalAssetCategory; readonly labelKo: string; readonly labelEn: string }[] =
  Object.freeze([
    { id: "all", labelKo: "전체", labelEn: "All" },
    { id: "3d-hero", labelKo: "3D 히어로", labelEn: "3D Heroes" },
    { id: "background", labelKo: "배경", labelEn: "Backgrounds" },
    { id: "brush", labelKo: "브러시", labelEn: "Brushes" },
    { id: "texture", labelKo: "텍스처", labelEn: "Textures" },
    { id: "pose", labelKo: "포즈", labelEn: "Poses" },
    { id: "sfx", labelKo: "효과음", labelEn: "SFX" },
  ]);

function CategoryGlyph({ category }: { readonly category: GlobalAssetCatalogEntry["category"] }) {
  switch (category) {
    case "3d-hero": return <Box size={15} strokeWidth={1.8} aria-hidden="true" />;
    case "background": return <Layers size={15} strokeWidth={1.8} aria-hidden="true" />;
    case "brush": return <Brush size={15} strokeWidth={1.8} aria-hidden="true" />;
    case "texture": return <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />;
    case "pose": return <UserRound size={15} strokeWidth={1.8} aria-hidden="true" />;
    case "sfx": return <Music size={15} strokeWidth={1.8} aria-hidden="true" />;
  }
}

/**
 * 어느 페이지에서든 ⌘K / Ctrl+K (또는 입력창 밖에서 `/`)로 여는
 * ToonStudio 전역 통합 소재 검색 커맨드 팔레트.
 */
export function GlobalAssetSearchPalette({
  open,
  onClose,
  onSelectAsset,
  initialQuery = "",
  enableGlobalShortcut = false,
  onOpenRequest,
}: GlobalAssetSearchPaletteProps) {
  const bt = useBilingual("GlobalAssetSearchPalette");
  const isKo = useI18n((state) => state.lang.toLowerCase().startsWith("ko"));
  const navigate = useNavigate();

  const dialogTitleId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<GlobalAssetCategory>("all");
  const [freeCommercialOnly, setFreeCommercialOnly] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(
    () => filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, { query, category, freeCommercialOnly }),
    [query, category, freeCommercialOnly],
  );
  const clampedActiveIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  const handleOpenDestination = useCallback(
    (asset: GlobalAssetCatalogEntry, targetHref: string) => {
      onSelectAsset?.(asset, targetHref);
      onClose();
      navigate(targetHref);
    },
    [navigate, onClose, onSelectAsset],
  );

  // 단독 마운트 단축키 지원 (⌘K / Ctrl+K / 입력창 밖 `/`) 및 열림 상태 Escape 닫기
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!enableGlobalShortcut || !onOpenRequest) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) onClose();
        else onOpenRequest();
        return;
      }
      if (!open && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableEventTarget(event.target)) {
        event.preventDefault();
        onOpenRequest();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableGlobalShortcut, onClose, onOpenRequest, open]);

  useEffect(() => {
    if (!open) return undefined;
    const rafId = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(rafId);
  }, [open]);

  if (!open) return null;

  const activeItem = clampedActiveIndex >= 0 ? results[clampedActiveIndex] : undefined;

  const handleNavigationKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      handleOpenDestination(activeItem, event.shiftKey ? activeItem.canvasHref : activeItem.href);
    }
  };

  return (
    <div className="ts-cmdk-backdrop" data-testid="global-asset-search-backdrop">
      <button
        type="button"
        tabIndex={-1}
        className="ts-cmdk-dismiss-layer"
        aria-label={bt("소재 검색 배경 클릭으로 닫기", "Dismiss asset search dialog")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        data-testid="global-asset-search-dialog"
        className="ts-cmdk-dialog"
      >
        <div className="ts-cmdk-ribbon" aria-hidden="true" />
        <h2 id={dialogTitleId} className="sr-only">
          {bt("ToonStudio 통합 소재 검색 커맨드 팔레트", "ToonStudio Unified Asset Search Command Palette")}
        </h2>

        <div className="ts-cmdk-header">
          <Search size={18} strokeWidth={2} className="ts-cmdk-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeItem ? `ts-cmdk-opt-${activeItem.id}` : undefined}
            aria-label={bt("소재 검색어 입력 (초성·한영 지원)", "Search assets by Korean, Choseong or English")}
            placeholder={bt(
              "3D 배경·로판·서울·무협·브러시·효과음 검색 (예: ㄹㅍ, ㅅㅇ, G펜, 3D)",
              "Search 3D scenes, Rofan, Seoul, Wuxia, brushes, SFX...",
            )}
            className="ts-cmdk-input"
            value={query}
            onKeyDown={handleNavigationKeyDown}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <button type="button" className="ts-cmdk-close" onClick={onClose} aria-label={bt("소재 검색 닫기", "Close asset search")}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className="ts-cmdk-filters">
          <div className="ts-cmdk-chip-row" role="group" aria-label={bt("소재 유형 필터", "Asset category filter")}>
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="ts-cmdk-chip"
                aria-pressed={category === tab.id}
                data-category-chip={tab.id}
                onClick={() => {
                  setCategory(tab.id);
                  setActiveIndex(0);
                }}
              >
                {isKo ? tab.labelKo : tab.labelEn}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ts-cmdk-chip"
            data-license-toggle="true"
            aria-pressed={freeCommercialOnly}
            onClick={() => {
              setFreeCommercialOnly((prev) => !prev);
              setActiveIndex(0);
            }}
          >
            <ShieldCheck size={15} strokeWidth={1.9} aria-hidden="true" />
            <span>{bt("상업 무료·CC0만", "Commercial Free / CC0 only")}</span>
          </button>
        </div>

        <nav className="ts-cmdk-hub-bar" aria-label={bt("소재 핵심 허브 바로 열기", "Quick open asset hubs")}>
          <span className="ts-cmdk-hub-label">{bt("바로 열기", "Quick jump")}:</span>
          {GLOBAL_ASSET_QUICK_HUBS.map((hub) => (
            <Link key={hub.id} href={hub.href} className="ts-cmdk-hub-link" onClick={onClose}>
              <span>{isKo ? hub.labelKo : hub.labelEn}</span>
              <ArrowRight size={13} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          ))}
        </nav>

        <div id={listboxId} role="listbox" aria-label={bt("검색된 소재 목록", "Matching assets")} className="ts-cmdk-results">
          {results.length === 0 ? (
            <div className="ts-cmdk-empty" role="status">
              <p>{bt("조건에 맞는 소재가 없습니다.", "No assets match this query.")}</p>
              <p>{bt("초성(ㄹㅍ·ㅅㅇ·ㅁㅎ)이나 영문 키워드로 다시 검색하거나 필터를 초기화해 보세요.", "Try another Korean/English keyword or reset filters.")}</p>
            </div>
          ) : (
            results.map((asset, index) => {
              const isActive = index === clampedActiveIndex;
              return (
                <div
                  key={asset.id}
                  id={`ts-cmdk-opt-${asset.id}`}
                  role="option"
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  data-active={isActive ? "true" : "false"}
                  data-asset-id={asset.id}
                  className="ts-cmdk-item"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleOpenDestination(asset, asset.href)}
                  onKeyDown={handleNavigationKeyDown}
                >
                  <div className="ts-cmdk-item-main">
                    <div className="ts-cmdk-item-title-row">
                      <CategoryGlyph category={asset.category} />
                      <span className="ts-cmdk-item-title">{isKo ? asset.titleKo : asset.titleEn}</span>
                      <span className="ts-cmdk-badge" data-tone="safe">
                        <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                        {isKo ? asset.licenseLabelKo : asset.licenseLabelEn}
                      </span>
                      <span className="ts-cmdk-badge" data-tone="genre">{asset.genre}</span>
                      <span className="ts-cmdk-badge" data-tone="format">{asset.formatLabel}</span>
                    </div>
                    <p className="ts-cmdk-item-sub">{isKo ? asset.subtitleKo : asset.subtitleEn}</p>
                  </div>

                  <div className="ts-cmdk-item-actions">
                    <button
                      type="button"
                      className="ts-cmdk-action-btn"
                      data-primary="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenDestination(asset, asset.canvasHref);
                      }}
                    >
                      <span>{bt("캔버스 열기", "Open canvas")}</span>
                      <CornerDownLeft size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="ts-cmdk-action-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenDestination(asset, asset.hubHref);
                      }}
                    >
                      <span>{bt("소재 허브", "Asset hub")}</span>
                      <ArrowRight size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <footer className="ts-cmdk-footer">
          <span role="status">{bt(`총 ${results.length}건 · 라이선스 검증 완료`, `${results.length} verified assets`)}</span>
          <span>
            <kbd className="ts-cmdk-kbd">↑↓</kbd> {bt("이동", "Move")} · <kbd className="ts-cmdk-kbd">Enter</kbd> {bt("열기", "Open")} ·{" "}
            <kbd className="ts-cmdk-kbd">Shift+Enter</kbd> {bt("캔버스 직행", "Canvas")} · <kbd className="ts-cmdk-kbd">Esc</kbd> {bt("닫기", "Close")}
          </span>
        </footer>
      </div>
    </div>
  );
}

export default GlobalAssetSearchPalette;
