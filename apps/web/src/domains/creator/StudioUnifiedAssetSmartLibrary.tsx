import { useEffect, useMemo, useState, type ReactNode } from "react";

import { StudioUnifiedAssetSmartFilters } from "./StudioUnifiedAssetSmartFilters";
import {
  StudioUnifiedAssetShelfNav,
  StudioUnifiedAssetSmartLibraryHeader,
} from "./studio-unified-asset-smart-library-chrome";
import { StudioUnifiedAssetSmartManager } from "./StudioUnifiedAssetSmartManager";
import { projectStudioUnifiedAssetLibrary } from "./studio-unified-asset-library-projection";
import {
  applyStudioUnifiedAssetCurationPreset,
  createStudioUnifiedAssetLibraryState,
  discoverStudioUnifiedAssets,
  findRelatedStudioUnifiedAssets,
  parseStudioUnifiedAssetLibraryState,
  recordStudioUnifiedAssetUse,
  serializeStudioUnifiedAssetLibraryState,
  setStudioUnifiedAssetFlag,
  setStudioUnifiedAssetRating,
  STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY,
  toggleStudioUnifiedAssetFavorite,
  toggleStudioUnifiedAssetTray,
  type StudioUnifiedAssetEditabilityFilter,
  type StudioUnifiedAssetFlag,
  type StudioUnifiedAssetFlagFilter,
  type StudioUnifiedAssetFormat,
  type StudioUnifiedAssetLibraryState,
  type StudioUnifiedAssetLibraryView,
  type StudioUnifiedAssetRating,
  type StudioUnifiedAssetRightsFilter,
  type StudioUnifiedAssetSort,
} from "./studio-unified-asset-intelligence";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export interface StudioUnifiedAssetSmartLibraryRenderProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
  ) => boolean | void | Promise<boolean | void>;
}

export interface StudioUnifiedAssetSmartLibraryProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
  ) => boolean | void | Promise<boolean | void>;
  readonly children: (
    props: StudioUnifiedAssetSmartLibraryRenderProps,
  ) => ReactNode;
  readonly defaultCollapsed?: boolean;
}

function loadLibraryState(): StudioUnifiedAssetLibraryState {
  if (typeof window === "undefined") {
    return createStudioUnifiedAssetLibraryState();
  }
  try {
    return parseStudioUnifiedAssetLibraryState(
      window.localStorage.getItem(STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY),
    );
  } catch {
    return createStudioUnifiedAssetLibraryState();
  }
}

export function StudioUnifiedAssetSmartLibrary({
  items,
  onUseItem,
  children,
  defaultCollapsed = false,
}: StudioUnifiedAssetSmartLibraryProps) {
  const [libraryState, setLibraryState] = useState(
    createStudioUnifiedAssetLibraryState,
  );
  const [ready, setReady] = useState(false);
  const [persistence, setPersistence] = useState<"persistent" | "memory">(
    "persistent",
  );
  const [libraryView, setLibraryView] =
    useState<StudioUnifiedAssetLibraryView>("all");
  const [format, setFormat] = useState<StudioUnifiedAssetFormat>("all");
  const [rights, setRights] = useState<StudioUnifiedAssetRightsFilter>("all");
  const [editability, setEditability] =
    useState<StudioUnifiedAssetEditabilityFilter>("all");
  const [sort, setSort] = useState<StudioUnifiedAssetSort>("recommended");
  const [minRating, setMinRating] = useState(0);
  const [flagFilter, setFlagFilter] = useState<StudioUnifiedAssetFlagFilter>("all");
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [managerOpen, setManagerOpen] = useState(false);
  const [lastUsedId, setLastUsedId] = useState<string | null>(null);

  useEffect(() => {
    setLibraryState(loadLibraryState());
    setReady(true);
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null
        || event.key === STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY
      ) {
        setLibraryState(loadLibraryState());
        setPersistence("persistent");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY,
        serializeStudioUnifiedAssetLibraryState(libraryState),
      );
      setPersistence("persistent");
    } catch {
      setPersistence("memory");
    }
  }, [libraryState, ready]);

  const availableIds = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items],
  );
  const visibleItems = useMemo(
    () => projectStudioUnifiedAssetLibrary(items, {
      libraryView,
      format,
      rights,
      editability,
      sort,
      minRating,
      flagFilter,
      libraryState,
    }),
    [editability, flagFilter, format, items, libraryState, libraryView, minRating, rights, sort],
  );
  const managerItems = useMemo(
    () => discoverStudioUnifiedAssets(items, {
      format,
      rights,
      editability,
      sort,
      minRating,
      flagFilter,
      limit: 12,
      libraryState,
    }),
    [editability, flagFilter, format, items, libraryState, minRating, rights, sort],
  );
  const lastUsed = useMemo(
    () => items.find((item) => item.id === lastUsedId) ?? null,
    [items, lastUsedId],
  );
  const related = useMemo(
    () => lastUsed ? findRelatedStudioUnifiedAssets(items, lastUsed, 4) : [],
    [items, lastUsed],
  );
  const activeFilterCount = [
    format !== "all",
    rights !== "all",
    editability !== "all",
    sort !== "recommended",
    minRating > 0,
    flagFilter !== "all",
  ].filter(Boolean).length;

  async function handleUseItem(
    item: StudioUnifiedAssetItem,
  ): Promise<boolean | void> {
    const result = await onUseItem(item);
    if (result === false) return false;
    setLibraryState((current) =>
      recordStudioUnifiedAssetUse(current, item.id),
    );
    setLastUsedId(item.id);
    return result;
  }

  function resetFilters(): void {
    setLibraryView("all");
    setFormat("all");
    setRights("all");
    setEditability("all");
    setSort("recommended");
    setMinRating(0);
    setFlagFilter("all");
  }

  return (
    <div className="space-y-3" data-studio-smart-asset-library="true">
      <section
        aria-label="스마트 에셋 라이브러리"
        className="rounded-xl border border-accent/25 bg-accent-soft/20 p-2.5"
      >
        <StudioUnifiedAssetSmartLibraryHeader
          visibleCount={visibleItems.length}
          totalCount={items.length}
          persistence={persistence}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        />
        <StudioUnifiedAssetShelfNav
          selected={libraryView}
          state={libraryState}
          availableIds={availableIds}
          totalCount={items.length}
          onSelect={setLibraryView}
        />
        {expanded ? (
          <>
            <StudioUnifiedAssetSmartFilters
              format={format}
              rights={rights}
              editability={editability}
              sort={sort}
              minRating={minRating}
              flagFilter={flagFilter}
              activeCount={activeFilterCount}
              onFormatChange={setFormat}
              onRightsChange={setRights}
              onEditabilityChange={setEditability}
              onSortChange={setSort}
              onMinRatingChange={setMinRating}
              onFlagFilterChange={setFlagFilter}
              onReset={resetFilters}
            />
            <StudioUnifiedAssetSmartManager
              open={managerOpen}
              items={managerItems}
              state={libraryState}
              relatedAnchor={lastUsed}
              related={related}
              onToggleOpen={() => setManagerOpen((current) => !current)}
              onToggleFavorite={(id) =>
                setLibraryState((current) =>
                  toggleStudioUnifiedAssetFavorite(current, id),
                )
              }
              onToggleTray={(id) =>
                setLibraryState((current) =>
                  toggleStudioUnifiedAssetTray(current, id),
                )
              }
              onSetRating={(id, rating: StudioUnifiedAssetRating | 0) =>
                setLibraryState((current) =>
                  setStudioUnifiedAssetRating(current, id, rating),
                )
              }
              onSetFlag={(id, flag: StudioUnifiedAssetFlag | null) =>
                setLibraryState((current) =>
                  setStudioUnifiedAssetFlag(current, id, flag),
                )
              }
              onApplyCurationPreset={(ids, presetId) =>
                setLibraryState((current) =>
                  applyStudioUnifiedAssetCurationPreset(current, ids, presetId),
                )
              }
              onUseItem={(item) => void handleUseItem(item)}
            />
          </>
        ) : null}
      </section>
      {children({ items: visibleItems, onUseItem: handleUseItem })}
    </div>
  );
}
