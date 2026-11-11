import {
  Box,
  GripVertical,
  Heart,
  Image as ImageIcon,
  Plus,
  Sparkles,
} from "lucide-react";

import { StudioUnifiedAssetPreviewSurface } from "../StudioUnifiedAssetPreviewSurface";
import { canDragStudioInsertHubEntry } from "../studio-insert-hub-drag";
import { assetWorkspaceText as bi } from "./studio-unified-asset-workspace-model";

import type { StudioInsertHubAssetEntry } from "../studio-insert-hub-model";
import type { StudioUnifiedAssetItem } from "../studio-unified-asset-catalog";
import type { StudioUnifiedAssetRichPreview } from "../studio-unified-asset-preview";
import type { AssetWorkspaceDensity } from "./studio-unified-asset-workspace-state";

export function StudioUnifiedAssetWorkspaceResults({
  results,
  previews,
  selectedId,
  density,
  favoriteIds,
  pendingId,
  reviewLocked,
  onPreview,
  onFavorite,
  onUse,
  onReset,
  onOpenAi,
}: {
  readonly results: readonly StudioInsertHubAssetEntry[];
  readonly previews: ReadonlyMap<string, StudioUnifiedAssetRichPreview>;
  readonly selectedId: string | null;
  readonly density: AssetWorkspaceDensity;
  readonly favoriteIds: readonly string[];
  readonly pendingId: string | null;
  readonly reviewLocked: boolean;
  readonly onPreview: (item: StudioUnifiedAssetItem) => void;
  readonly onFavorite: (id: string) => void;
  readonly onUse: (item: StudioUnifiedAssetItem) => void;
  readonly onReset: () => void;
  readonly onOpenAi: () => void;
}) {
  if (results.length === 0)
    return (
      <div className="grid min-h-52 place-items-center p-4 text-center">
        <div>
          <ImageIcon
            size={28}
            className="mx-auto text-fg-3"
            aria-hidden="true"
          />
          <h4 className="mt-3 text-sm font-bold text-fg">
            {bi(
              "조건에 맞는 에셋이 없습니다.",
              "No assets match these filters."
            )}
          </h4>
          <p className="mt-1 text-xs text-fg-3">
            {bi(
              "검색어나 분류를 바꿔보세요.",
              "Try another search or category."
            )}
          </p>
          <div className="studio-unified-assets__options mt-3 justify-center">
            <button type="button" onClick={onReset}>
              {bi("조건 넓히기", "Broaden search")}
            </button>
            <button type="button" onClick={onOpenAi}>
              <Sparkles size={14} aria-hidden="true" />
              {bi("AI 도구에서 만들기", "Create with AI tools")}
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div
      data-studio-asset-results-grid="true"
      data-density={density}
      className="studio-unified-assets__results"
    >
      {results.map((entry) => {
        const item = entry.item;
        const preview = previews.get(item.id);
        if (!preview) return null;
        const favorite = favoriteIds.includes(item.id);
        const draggable = !reviewLocked && canDragStudioInsertHubEntry(entry);
        return (
          <article
            key={item.id}
            data-studio-insert-entry={item.id}
            data-studio-unified-asset={item.id}
            data-selected={selectedId === item.id}
            className="studio-unified-assets__card"
          >
            <button
              type="button"
              data-studio-asset-preview={item.id}
              onClick={() => onPreview(item)}
              aria-pressed={selectedId === item.id}
              aria-label={`${item.title} ${bi(
                "상세 미리보기",
                "preview details"
              )}`}
              className="studio-unified-assets__preview"
            >
              <div className="studio-unified-assets__thumbnail">
                <StudioUnifiedAssetPreviewSurface
                  preview={preview}
                  mode="thumbnail"
                />
                {item.discoverability === "caution" ? (
                  <span className="studio-unified-assets__rights-badge">
                    {bi("권리 확인", "Review rights")}
                  </span>
                ) : null}
              </div>
              <div className="p-2">
                <h4 className="line-clamp-2 text-sm font-bold leading-5 text-fg">
                  {item.title}
                </h4>
                <p className="mt-1 text-xs text-fg-3">{item.categoryLabel}</p>
                {density === "visual" ? (
                  <p className="studio-unified-assets__card-description">
                    {item.description}
                  </p>
                ) : null}
              </div>
            </button>
            <div className="studio-unified-assets__card-actions">
              <button
                type="button"
                onClick={() => onFavorite(item.id)}
                aria-pressed={favorite}
                aria-label={`${item.title} ${
                  favorite
                    ? bi("즐겨찾기 해제", "remove favorite")
                    : bi("즐겨찾기 추가", "add favorite")
                }`}
                className="studio-unified-assets__icon-button"
              >
                <Heart
                  size={15}
                  fill={favorite ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                data-studio-insert-drag-handle="true"
                draggable={draggable}
                onClick={() => onPreview(item)}
                aria-label={`${item.title} ${bi(
                  "캔버스로 끌어 놓기",
                  "drag to canvas"
                )}`}
                title={
                  draggable
                    ? bi(
                        "캔버스의 원하는 위치로 끌어 놓기",
                        "Drag to the desired canvas position"
                      )
                    : bi("상세 미리보기 선택", "Preview details")
                }
                className="studio-unified-assets__drag"
              >
                <GripVertical size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={pendingId !== null || reviewLocked}
                onClick={() => onUse(item)}
                aria-label={`${item.title} ${item.useLabel}`}
                className="studio-unified-assets__insert"
              >
                {item.useMode === "open" ? (
                  <Box size={14} aria-hidden="true" />
                ) : (
                  <Plus size={14} aria-hidden="true" />
                )}
                <span>
                  {pendingId === item.id
                    ? bi("처리 중…", "Processing…")
                    : item.useLabel}
                </span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
