import { ArrowLeft, Box, Heart, Plus } from "lucide-react";
import type { RefObject } from "react";

import { StudioUnifiedAssetPreviewSurface } from "../StudioUnifiedAssetPreviewSurface";
import type { StudioInsertPlacementMode } from "../studio-insert-hub-model";
import {
  assetWorkspaceDetailsForItem,
  assetWorkspacePlacementLabel,
  assetWorkspaceText as bi,
} from "./studio-unified-asset-workspace-model";

import type { StudioUnifiedAssetItem } from "../studio-unified-asset-catalog";
import type { StudioUnifiedAssetRichPreview } from "../studio-unified-asset-preview";

export function StudioUnifiedAssetWorkspaceDetail({
  item,
  preview,
  headingRef,
  favorite,
  acknowledged,
  placementMode,
  selectionPlacementAvailable,
  pendingId,
  reviewLocked,
  onBack,
  onFavorite,
  onAcknowledge,
  onPlacementChange,
  onUse,
}: {
  readonly item: StudioUnifiedAssetItem;
  readonly preview: StudioUnifiedAssetRichPreview;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly favorite: boolean;
  readonly acknowledged: boolean;
  readonly placementMode: StudioInsertPlacementMode;
  readonly selectionPlacementAvailable: boolean;
  readonly pendingId: string | null;
  readonly reviewLocked: boolean;
  readonly onBack: () => void;
  readonly onFavorite: () => void;
  readonly onAcknowledge: (acknowledged: boolean) => void;
  readonly onPlacementChange: (placement: StudioInsertPlacementMode) => void;
  readonly onUse: () => void;
}) {
  const requiresReview = item.discoverability === "caution";
  const facts = [
    ...new Set([...preview.facts, ...assetWorkspaceDetailsForItem(item)]),
  ];
  return (
    <div data-studio-asset-detail={item.id}>
      <button
        type="button"
        onClick={onBack}
        className="studio-unified-assets__back"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {bi("목록으로", "Back to results")}
      </button>
      <div className="studio-unified-assets__detail-preview">
        <StudioUnifiedAssetPreviewSurface
          preview={preview}
          mode={preview.kind === "three" ? "interactive" : "thumbnail"}
        />
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-fg-3">{item.categoryLabel}</p>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 text-base font-bold text-fg outline-none"
          >
            {item.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={favorite}
          aria-label={
            favorite
              ? bi("즐겨찾기 해제", "Remove favorite")
              : bi("즐겨찾기 추가", "Add favorite")
          }
          className="studio-unified-assets__icon-button"
        >
          <Heart
            size={16}
            fill={favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-3">
        {item.description}
      </p>
      <ul
        className="mt-3 space-y-1 text-xs text-fg-2"
        aria-label={bi("선택한 소재 정보", "Selected asset information")}
      >
        {facts.slice(0, 4).map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {facts.length > 4 ? (
        <details className="mt-2 text-xs text-fg-3">
          <summary className="flex min-h-11 cursor-pointer items-center">
            {bi("정보 더 보기", "More information")}
          </summary>
          <ul className="space-y-1">
            {facts.slice(4).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {item.source.kind === "local" ? (
        <fieldset className="mt-3 border-t border-line pt-2">
          <legend className="text-xs font-bold text-fg-2">
            {bi("삽입 위치", "Placement")}
          </legend>
          <div className="studio-unified-assets__options grid grid-cols-3">
            {(["auto", "page", "selection"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={mode === "selection" && !selectionPlacementAvailable}
                onClick={() => onPlacementChange(mode)}
                aria-pressed={placementMode === mode}
              >
                {assetWorkspacePlacementLabel(mode)}
              </button>
            ))}
          </div>
          {!selectionPlacementAvailable ? (
            <p className="mt-1 text-xs text-fg-3">
              {bi(
                "선택 영역에 넣으려면 캔버스에서 요소를 먼저 선택하세요.",
                "Select a canvas element to place an asset in its bounds."
              )}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      {requiresReview ? (
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-warn/35 bg-warn/10 p-3 text-xs leading-relaxed text-fg-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-current"
          />
          <span>
            <strong className="block text-warn">
              {bi("권리·출처 확인 필요", "Review rights and source")}
            </strong>
            {bi(
              "이 에셋의 사용 조건을 확인했으며 현재 작품에서 사용할 책임이 있음을 이해했습니다.",
              "I have reviewed the usage conditions and understand my responsibility for using this asset in this work."
            )}
          </span>
        </label>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-xs text-fg-3">
          {bi(
            "내장 또는 확인된 소재입니다. 작품에 맞는 사용 조건을 확인하세요.",
            "A built-in or reviewed asset. Check the usage conditions for your work."
          )}
        </p>
      )}
      <button
        type="button"
        disabled={
          pendingId !== null ||
          reviewLocked ||
          (requiresReview && !acknowledged)
        }
        onClick={onUse}
        className="studio-unified-assets__detail-insert"
      >
        {item.useMode === "open" ? (
          <Box size={16} aria-hidden="true" />
        ) : (
          <Plus size={16} aria-hidden="true" />
        )}
        {pendingId === item.id ? bi("처리 중…", "Processing…") : item.useLabel}
      </button>
      {reviewLocked ? (
        <p className="mt-2 text-xs text-warn">
          {bi(
            "검토 잠금을 해제한 뒤 추가할 수 있습니다.",
            "Unlock review before adding assets."
          )}
        </p>
      ) : null}
    </div>
  );
}
