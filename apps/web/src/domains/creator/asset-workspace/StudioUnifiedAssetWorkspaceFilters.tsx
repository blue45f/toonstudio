import {
  Box,
  ChevronDown,
  Clock3,
  Filter,
  FolderOpen,
  Heart,
  LayoutGrid,
  LayoutList,
  MessageCircle,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";

import {
  ASSET_WORKSPACE_FACETS,
  assetWorkspaceCollectionLabel,
  assetWorkspaceText as bi,
} from "./studio-unified-asset-workspace-model";
import type {
  StudioInsertHubActionDefinition,
  StudioInsertActionId,
  StudioInsertHubCollection,
} from "../studio-insert-hub-model";

import type {
  AssetWorkspaceDensity,
  AssetWorkspaceFacet,
  AssetWorkspaceState,
} from "./studio-unified-asset-workspace-state";

const QUICK_QUERIES = ["학교", "로맨스", "밤", "효과", "소품", "3D"] as const;
const COLLECTIONS: readonly StudioInsertHubCollection[] = [
  "all",
  "favorites",
  "recent",
];

function actionIcon(actionId: StudioInsertActionId) {
  if (actionId === "text") return Type;
  if (actionId === "bubble") return MessageCircle;
  if (actionId === "upload") return Upload;
  if (actionId === "background3d") return Box;
  if (actionId === "ai") return Sparkles;
  return LayoutGrid;
}

export function StudioUnifiedAssetWorkspaceFilters({
  state,
  facetCounts,
  resultCount,
  quickActions,
  reviewLocked,
  onOpenChange,
  onFacetChange,
  onCollectionChange,
  onDensityChange,
  onQueryChange,
  onQuickAction,
  onShowResults,
}: {
  readonly state: AssetWorkspaceState;
  readonly facetCounts: Readonly<Record<AssetWorkspaceFacet, number>>;
  readonly resultCount: number;
  readonly quickActions: readonly StudioInsertHubActionDefinition[];
  readonly reviewLocked: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onFacetChange: (facet: AssetWorkspaceFacet) => void;
  readonly onCollectionChange: (collection: StudioInsertHubCollection) => void;
  readonly onDensityChange: (density: AssetWorkspaceDensity) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onQuickAction: (action: StudioInsertActionId) => void;
  readonly onShowResults: () => void;
}) {
  const facet = ASSET_WORKSPACE_FACETS.find((item) => item.id === state.facet);
  const summary = `${
    facet ? bi(facet.ko, facet.en) : bi("전체", "All")
  } · ${assetWorkspaceCollectionLabel(state.collection)}`;
  return (
    <details
      className="studio-unified-assets__filters"
      open={state.filtersOpen}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="studio-unified-assets__filter-summary">
        <Filter size={16} aria-hidden="true" />
        <span>{bi("필터·도구", "Filters & tools")}</span>
        <span className="studio-unified-assets__filter-current">{summary}</span>
        <ChevronDown
          size={16}
          className="studio-unified-assets__chevron"
          aria-hidden="true"
        />
      </summary>
      <div className="studio-unified-assets__filter-content">
        <fieldset>
          <legend>{bi("에셋 분류", "Asset category")}</legend>
          <div className="studio-unified-assets__options">
            {ASSET_WORKSPACE_FACETS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={state.facet === option.id}
                onClick={() => onFacetChange(option.id)}
              >
                {bi(option.ko, option.en)}{" "}
                <span className="tabular-nums text-fg-3">
                  {facetCounts[option.id]}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{bi("내 작업", "My activity")}</legend>
          <div className="studio-unified-assets__options">
            {COLLECTIONS.map((option) => {
              const Icon =
                option === "favorites"
                  ? Heart
                  : option === "recent"
                  ? Clock3
                  : FolderOpen;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={state.collection === option}
                  onClick={() => onCollectionChange(option)}
                >
                  <Icon size={14} aria-hidden="true" />
                  {assetWorkspaceCollectionLabel(option)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>{bi("카드 보기", "Card view")}</legend>
          <div className="studio-unified-assets__options">
            <button
              type="button"
              aria-pressed={state.density === "visual"}
              onClick={() => onDensityChange("visual")}
            >
              <LayoutGrid size={15} aria-hidden="true" />
              {bi("큰 그리드", "Large grid")}
            </button>
            <button
              type="button"
              aria-pressed={state.density === "compact"}
              onClick={() => onDensityChange("compact")}
            >
              <LayoutList size={15} aria-hidden="true" />
              {bi("작은 그리드", "Compact grid")}
            </button>
          </div>
        </fieldset>
        {quickActions.length > 0 ? (
          <fieldset>
            <legend>{bi("새로 추가", "Add new")}</legend>
            <div
              role="group"
              className="studio-unified-assets__options"
              aria-label={bi("빠른 삽입", "Quick insert")}
            >
              {quickActions.map((action) => {
                const Icon = actionIcon(action.actionId);
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onQuickAction(action.actionId)}
                    disabled={state.pendingId !== null || reviewLocked}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {action.title}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <fieldset>
          <legend>{bi("검색 제안", "Search ideas")}</legend>
          <div
            role="group"
            className="studio-unified-assets__options"
            aria-label={bi("빠른 에셋 검색", "Quick asset search")}
          >
            {QUICK_QUERIES.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => onQueryChange(query)}
              >
                {query}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          className="studio-unified-assets__show-results"
          onClick={onShowResults}
        >
          {bi(`결과 ${resultCount}개 보기`, `Show ${resultCount} results`)}
        </button>
      </div>
    </details>
  );
}
