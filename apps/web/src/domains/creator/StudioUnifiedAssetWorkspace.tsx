import { Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { StudioUnifiedAssetWorkspaceDetail } from "./asset-workspace/StudioUnifiedAssetWorkspaceDetail";
import { StudioUnifiedAssetWorkspaceFilters } from "./asset-workspace/StudioUnifiedAssetWorkspaceFilters";
import { StudioUnifiedAssetWorkspaceResults } from "./asset-workspace/StudioUnifiedAssetWorkspaceResults";
import { frozenStatus4Text } from "./studio-frozen4-status-i18n";
import {
  buildStudioInsertHubEntries,
  loadStudioInsertHubPreferences,
  reconcileStudioInsertHubPreferences,
  recordStudioInsertRecent,
  saveStudioInsertHubPreferences,
  selectStudioInsertHubEntries,
  setStudioInsertPlacementMode,
  STUDIO_INSERT_ACTIONS,
  toggleStudioInsertFavorite,
  type StudioInsertActionId,
  type StudioInsertHubAssetEntry,
  type StudioInsertHubPreferences,
  type StudioInsertPlacementMode,
} from "./studio-insert-hub-model";
import { resolveStudioUnifiedAssetRichPreview } from "./studio-unified-asset-preview";
import {
  ASSET_WORKSPACE_FACETS,
  assetWorkspaceText as bi,
  matchesAssetWorkspaceFacet,
} from "./asset-workspace/studio-unified-asset-workspace-model";
import {
  useAssetWorkspaceSession,
  type AssetWorkspaceFacet,
  type AssetWorkspaceState,
  type AssetWorkspaceView,
} from "./asset-workspace/studio-unified-asset-workspace-state";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

import { useT } from "@/shared/lib/i18n";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import "./asset-workspace/studio-unified-asset-workspace.css";

const QUICK_ACTION_IDS: ReadonlySet<StudioInsertActionId> = new Set([
  "text",
  "bubble",
  "upload",
  "template",
  "background3d",
  "ai",
]);

export interface StudioUnifiedAssetWorkspaceProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly legacyContent: ReactNode;
  readonly initialView?: AssetWorkspaceView;
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
    placementMode?: StudioInsertPlacementMode
  ) => boolean | void | Promise<boolean | void>;
  readonly onUseAction?: (
    actionId: StudioInsertActionId
  ) => boolean | void | Promise<boolean | void>;
  readonly onUploadImage?: (
    event: ChangeEvent<HTMLInputElement>
  ) => Promise<void> | void;
  readonly onOpenAi: (prompt: string) => void;
  readonly selectionPlacementAvailable?: boolean;
  readonly reviewLocked?: boolean;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function successMessage(item: StudioUnifiedAssetItem): string {
  if (item.useMode === "open")
    return frozenStatus4Text(
      "studio.frozenStatus4.assets.successOpened",
      { title: item.title },
      "{title} 편집 도구를 열었습니다."
    );
  if (item.useMode === "apply")
    return frozenStatus4Text(
      "studio.frozenStatus4.assets.successApplied",
      { title: item.title },
      "{title} 장면을 배치했습니다."
    );
  return frozenStatus4Text(
    "studio.frozenStatus4.assets.successInserted",
    { title: item.title },
    "{title}을(를) 캔버스에 삽입했습니다."
  );
}

function afterRender(callback: () => void): void {
  if (typeof window.requestAnimationFrame === "function")
    window.requestAnimationFrame(callback);
  else queueMicrotask(callback);
}

export function StudioUnifiedAssetWorkspace({
  items,
  legacyContent,
  initialView = "discover",
  onUseItem,
  onUseAction,
  onUploadImage,
  onOpenAi,
  selectionPlacementAvailable = false,
  reviewLocked = false,
}: StudioUnifiedAssetWorkspaceProps) {
  useBilingualI18nRevision();
  const t = useT();
  const searchId = useId();
  const workspaceRef = useRef<HTMLElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const { session, state } = useAssetWorkspaceSession();
  const initialPreferences = useMemo(
    () => loadStudioInsertHubPreferences(browserStorage()),
    []
  );
  const preferences = state.preferences ?? initialPreferences;
  const view = state.view ?? initialView;
  const { query, facet, collection, density, pendingId, status } = state;
  const allEntries = useMemo(() => buildStudioInsertHubEntries(items), [items]);
  const assetEntries = useMemo(
    () =>
      allEntries.filter(
        (entry): entry is StudioInsertHubAssetEntry => entry.kind === "asset"
      ),
    [allEntries]
  );
  const activeFacet =
    ASSET_WORKSPACE_FACETS.find((entry) => entry.id === facet) ??
    ASSET_WORKSPACE_FACETS[0];
  const category = activeFacet?.category ?? "all";
  const facetLabel = activeFacet
    ? bi(activeFacet.ko, activeFacet.en)
    : bi("전체", "All");
  const facetCounts = useMemo(() => {
    const next: Record<AssetWorkspaceFacet, number> = {
      all: 0,
      background: 0,
      "scene-template": 0,
      story: 0,
      character: 0,
      prop: 0,
      "3d": 0,
      mine: 0,
    };
    for (const candidate of ASSET_WORKSPACE_FACETS)
      next[candidate.id] = assetEntries.filter((entry) =>
        matchesAssetWorkspaceFacet(entry.item, candidate.id)
      ).length;
    return next;
  }, [assetEntries]);
  const previewById = useMemo(
    () =>
      new Map(
        items.map(
          (item) =>
            [item.id, resolveStudioUnifiedAssetRichPreview(item)] as const
        )
      ),
    [items]
  );
  const results = useMemo(
    () =>
      selectStudioInsertHubEntries(assetEntries, {
        query,
        category,
        collection,
        preferences,
        limit: 180,
      })
        .filter(
          (entry): entry is StudioInsertHubAssetEntry => entry.kind === "asset"
        )
        .filter((entry) => matchesAssetWorkspaceFacet(entry.item, facet)),
    [assetEntries, category, collection, facet, preferences, query]
  );
  const selected =
    (results.find((entry) => entry.id === state.selectedId) ?? results[0])
      ?.item ?? null;
  const selectedId = selected?.id ?? null;
  const selectedPreview = selectedId
    ? previewById.get(selectedId) ?? null
    : null;
  const selectedAcknowledged =
    selected?.discoverability !== "caution" ||
    state.acknowledgedCautionId === selectedId;
  const availableIdsKey = useMemo(
    () =>
      assetEntries
        .map((entry) => entry.id)
        .sort()
        .join("\u0000"),
    [assetEntries]
  );

  useEffect(() => {
    const availableIds = new Set(assetEntries.map((entry) => entry.id));
    const current =
      session.getSnapshot().preferences ??
      loadStudioInsertHubPreferences(browserStorage());
    const next = saveStudioInsertHubPreferences(
      browserStorage(),
      reconcileStudioInsertHubPreferences(current, availableIds)
    );
    session.update((snapshot) => ({ ...snapshot, preferences: next }));
  }, [assetEntries, availableIdsKey, session]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  function patch(next: Partial<AssetWorkspaceState>): void {
    session.update((current) => ({ ...current, ...next }));
  }
  function commitPreferences(next: StudioInsertHubPreferences): void {
    patch({
      preferences: saveStudioInsertHubPreferences(browserStorage(), next),
    });
  }
  function currentPreferences(): StudioInsertHubPreferences {
    return session.getSnapshot().preferences ?? preferences;
  }
  function resetDiscovery(): void {
    patch({
      query: "",
      facet: "all",
      collection: "all",
      selectedId: null,
      detailOpen: false,
      acknowledgedCautionId: null,
      status: null,
    });
  }
  function changeQuery(value: string): void {
    patch({
      query: value.slice(0, 120),
      selectedId: null,
      detailOpen: false,
      acknowledgedCautionId: null,
      status: null,
    });
  }
  function previewItem(item: StudioUnifiedAssetItem): void {
    patch({
      selectedId: item.id,
      detailOpen: true,
      status: null,
      acknowledgedCautionId:
        selectedId === item.id
          ? session.getSnapshot().acknowledgedCautionId
          : null,
    });
    afterRender(() => detailHeadingRef.current?.focus());
  }
  function returnToResults(): void {
    patch({ detailOpen: false });
    afterRender(() => {
      const cards =
        workspaceRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-studio-asset-preview]"
        ) ?? [];
      const card = [...cards].find(
        (candidate) => candidate.dataset.studioAssetPreview === selectedId
      );
      (card ?? resultsHeadingRef.current)?.focus();
    });
  }
  function showResults(): void {
    patch({ filtersOpen: false, detailOpen: false });
    afterRender(() => resultsHeadingRef.current?.focus());
  }

  async function handleUseItem(item: StudioUnifiedAssetItem): Promise<void> {
    if (reviewLocked) {
      patch({
        status: {
          tone: "error",
          message: frozenStatus4Text(
            "studio.frozenStatus4.assets.addLocked",
            "검토 잠금을 해제한 뒤 에셋을 추가해 주세요."
          ),
        },
      });
      return;
    }
    if (session.getSnapshot().pendingId !== null) return;
    if (
      item.discoverability === "caution" &&
      session.getSnapshot().acknowledgedCautionId !== item.id
    ) {
      previewItem(item);
      patch({
        status: {
          tone: "error",
          message: frozenStatus4Text(
            "studio.frozenStatus4.assets.cautionRights",
            "권리와 출처 확인이 필요한 에셋입니다. 상세 패널에서 확인 후 사용해 주세요."
          ),
        },
      });
      return;
    }
    if (!session.claimPending(item.id)) return;
    try {
      const used = await onUseItem(item, currentPreferences().placementMode);
      if (used === false)
        throw new Error(
          frozenStatus4Text(
            "studio.frozenStatus4.assets.cannotUseAsset",
            "현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다."
          )
        );
      commitPreferences(
        recordStudioInsertRecent(currentPreferences(), item.id)
      );
      patch({ status: { tone: "success", message: successMessage(item) } });
    } catch (caught: unknown) {
      patch({
        status: {
          tone: "error",
          message:
            caught instanceof Error
              ? caught.message
              : frozenStatus4Text(
                  "studio.frozenStatus4.assets.useFailed",
                  "에셋을 사용하지 못했습니다. 캔버스 상태를 확인해 주세요."
                ),
        },
      });
    } finally {
      session.update((current) =>
        current.pendingId === item.id
          ? { ...current, pendingId: null }
          : current
      );
    }
  }

  async function handleQuickAction(
    actionId: StudioInsertActionId
  ): Promise<void> {
    if (
      !onUseAction ||
      reviewLocked ||
      session.getSnapshot().pendingId !== null
    )
      return;
    if (actionId === "upload") {
      uploadInputRef.current?.click();
      return;
    }
    const pendingKey = `action:${actionId}`;
    if (!session.claimPending(pendingKey)) return;
    try {
      const used = await onUseAction(actionId);
      if (used === false)
        throw new Error(
          frozenStatus4Text(
            "studio.frozenStatus4.assets.cannotOpenTool",
            "현재 상태에서는 이 도구를 열 수 없습니다."
          )
        );
    } catch (caught: unknown) {
      patch({
        status: {
          tone: "error",
          message:
            caught instanceof Error
              ? caught.message
              : frozenStatus4Text(
                  "studio.frozenStatus4.assets.openToolFailed",
                  "도구를 열지 못했습니다."
                ),
        },
      });
    } finally {
      session.update((current) =>
        current.pendingId === pendingKey
          ? { ...current, pendingId: null }
          : current
      );
    }
  }

  const quickActions = onUseAction
    ? STUDIO_INSERT_ACTIONS.filter((action) =>
        QUICK_ACTION_IDS.has(action.actionId)
      )
    : [];
  return (
    <section
      ref={workspaceRef}
      aria-label={bi("통합 에셋 작업 공간", "Unified asset workspace")}
      data-studio-unified-asset-workspace="true"
      data-studio-asset-workspace-layout="results-first"
      className="studio-unified-assets"
    >
      <div className="studio-unified-assets__tabs">
        <button
          type="button"
          onClick={() => patch({ view: "discover" })}
          aria-pressed={view === "discover"}
        >
          {bi("통합 탐색", "Browse assets")}
        </button>
        <button
          type="button"
          onClick={() => patch({ view: "library" })}
          aria-pressed={view === "library"}
        >
          {bi("보관함 · 마켓", "Library & market")}
        </button>
      </div>
      {view === "library" ? (
        <div className="max-h-[min(78dvh,52rem)] overflow-y-auto">
          {legacyContent}
        </div>
      ) : (
        <div>
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              {bi("에셋 통합 검색", "Search all assets")}
            </label>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder={bi(
                "장면이나 필요한 소재를 검색하세요",
                "Search for a scene or asset"
              )}
              className="min-h-12 w-full rounded-lg border border-line bg-card pl-10 pr-12 text-base text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
            {query ? (
              <button
                type="button"
                onClick={() => changeQuery("")}
                aria-label={bi("통합 에셋 검색어 지우기", "Clear asset search")}
                className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-fg-3"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <StudioUnifiedAssetWorkspaceFilters
            state={state}
            facetCounts={facetCounts}
            resultCount={results.length}
            quickActions={quickActions}
            reviewLocked={reviewLocked}
            onOpenChange={(open) => {
              if (session.getSnapshot().filtersOpen !== open)
                patch({ filtersOpen: open });
            }}
            onFacetChange={(next) =>
              patch({
                facet: next,
                selectedId: null,
                acknowledgedCautionId: null,
                status: null,
                detailOpen: false,
              })
            }
            onCollectionChange={(next) =>
              patch({
                collection: next,
                selectedId: null,
                acknowledgedCautionId: null,
                status: null,
                detailOpen: false,
              })
            }
            onDensityChange={(next) => patch({ density: next })}
            onQueryChange={changeQuery}
            onQuickAction={(action) => void handleQuickAction(action)}
            onShowResults={showResults}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label={t("studio.assetMenu.uploadAria", "이미지 소재 업로드")}
            onChange={(event) => {
              if (reviewLocked)
                patch({
                  status: {
                    tone: "error",
                    message: frozenStatus4Text(
                      "studio.frozenStatus4.assets.importLocked",
                      "검토 잠금을 해제한 뒤 이미지를 가져와 주세요."
                    ),
                  },
                });
              else if (onUploadImage)
                void Promise.resolve(onUploadImage(event)).catch(
                  (caught: unknown) =>
                    patch({
                      status: {
                        tone: "error",
                        message:
                          caught instanceof Error
                            ? caught.message
                            : frozenStatus4Text(
                                "studio.frozenStatus4.assets.importFailed",
                                "이미지를 가져오지 못했습니다."
                              ),
                      },
                    })
                );
              event.currentTarget.value = "";
            }}
          />
          <div data-studio-asset-workspace-grid="true">
            <div
              data-studio-asset-results-panel="true"
              data-detail-open={state.detailOpen}
              className="min-w-0"
            >
              <div className="flex min-h-11 items-center justify-between gap-2">
                <h3
                  ref={resultsHeadingRef}
                  tabIndex={-1}
                  className="text-xs font-semibold text-fg-2 outline-none"
                  aria-live="polite"
                >
                  {query.trim()
                    ? bi(
                        `검색 결과 ${results.length}개`,
                        `${results.length} results`
                      )
                    : `${facetLabel} ${results.length}${bi("개", " assets")}`}
                </h3>
                {query || facet !== "all" || collection !== "all" ? (
                  <button
                    type="button"
                    onClick={resetDiscovery}
                    className="min-h-11 px-2 text-xs text-fg-3 underline"
                  >
                    {bi("초기화", "Reset")}
                  </button>
                ) : null}
              </div>
              <StudioUnifiedAssetWorkspaceResults
                results={results}
                previews={previewById}
                selectedId={selectedId}
                density={density}
                favoriteIds={preferences.favoriteIds}
                pendingId={pendingId}
                reviewLocked={reviewLocked}
                onPreview={previewItem}
                onFavorite={(id) =>
                  commitPreferences(
                    toggleStudioInsertFavorite(currentPreferences(), id)
                  )
                }
                onUse={(item) => void handleUseItem(item)}
                onReset={resetDiscovery}
                onOpenAi={() => onOpenAi(query.trim())}
              />
            </div>
            <aside
              data-studio-asset-detail-pane="true"
              data-studio-asset-detail-expanded={state.detailOpen}
            >
              {selected && selectedPreview ? (
                <StudioUnifiedAssetWorkspaceDetail
                  item={selected}
                  preview={selectedPreview}
                  headingRef={detailHeadingRef}
                  favorite={preferences.favoriteIds.includes(selected.id)}
                  acknowledged={selectedAcknowledged}
                  placementMode={preferences.placementMode}
                  selectionPlacementAvailable={selectionPlacementAvailable}
                  pendingId={pendingId}
                  reviewLocked={reviewLocked}
                  onBack={returnToResults}
                  onFavorite={() =>
                    commitPreferences(
                      toggleStudioInsertFavorite(
                        currentPreferences(),
                        selected.id
                      )
                    )
                  }
                  onAcknowledge={(checked) =>
                    patch({
                      acknowledgedCautionId: checked ? selected.id : null,
                    })
                  }
                  onPlacementChange={(mode) =>
                    commitPreferences(
                      setStudioInsertPlacementMode(currentPreferences(), mode)
                    )
                  }
                  onUse={() => void handleUseItem(selected)}
                />
              ) : (
                <p className="py-3 text-xs text-fg-3">
                  {bi(
                    "에셋을 선택하면 실제 미리보기와 적용 옵션이 표시됩니다.",
                    "Select an asset to preview it and choose how to apply it."
                  )}
                </p>
              )}
            </aside>
          </div>
          {status ? (
            <p
              role={status.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              className={cn(
                "mt-3 rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
                status.tone === "error"
                  ? "border-bad/35 bg-bad/10 text-bad"
                  : "border-good/35 bg-good/10 text-good"
              )}
            >
              {status.message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
