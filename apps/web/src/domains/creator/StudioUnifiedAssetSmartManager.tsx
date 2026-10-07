import { Bookmark, Check, Star } from "lucide-react";
import { useState } from "react";

import {
  deriveStudioUnifiedAssetFacet,
  getStudioUnifiedAssetFlag,
  getStudioUnifiedAssetRating,
  STUDIO_UNIFIED_ASSET_BULK_ADJUSTMENT_PRESETS,
  STUDIO_UNIFIED_ASSET_CURATION_PRESETS,
  STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS,
  STUDIO_UNIFIED_ASSET_FLAG_LABELS,
  STUDIO_UNIFIED_ASSET_FORMAT_LABELS,
  STUDIO_UNIFIED_ASSET_RIGHTS_LABELS,
  type StudioUnifiedAssetCurationPresetId,
  type StudioUnifiedAssetFlag,
  type StudioUnifiedAssetLibraryState,
  type StudioUnifiedAssetRating,
} from "./studio-unified-asset-intelligence";
import { SMART_LIBRARY_FOCUS } from "./studio-unified-asset-smart-library-chrome";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

import { cn } from "@/shared/lib/utils";

const RATING_STEPS: readonly StudioUnifiedAssetRating[] = [1, 2, 3, 4, 5];
const FLAG_STEPS: readonly StudioUnifiedAssetFlag[] = ["pick", "hold", "reject"];

export interface StudioUnifiedAssetSmartManagerProps {
  readonly open: boolean;
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly state: StudioUnifiedAssetLibraryState;
  readonly relatedAnchor: StudioUnifiedAssetItem | null;
  readonly related: readonly StudioUnifiedAssetItem[];
  readonly onToggleOpen: () => void;
  readonly onToggleFavorite: (id: string) => void;
  readonly onToggleTray: (id: string) => void;
  readonly onSetRating: (id: string, rating: StudioUnifiedAssetRating | 0) => void;
  readonly onSetFlag: (id: string, flag: StudioUnifiedAssetFlag | null) => void;
  readonly onApplyCurationPreset: (
    ids: readonly string[],
    presetId: StudioUnifiedAssetCurationPresetId,
  ) => void;
  readonly onUseItem: (item: StudioUnifiedAssetItem) => void;
}

export function StudioUnifiedAssetSmartManager({
  open,
  items,
  state,
  relatedAnchor,
  related,
  onToggleOpen,
  onToggleFavorite,
  onToggleTray,
  onSetRating,
  onSetFlag,
  onApplyCurationPreset,
  onUseItem,
}: StudioUnifiedAssetSmartManagerProps) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const visibleSelectedIds = selectedIds.filter((id) =>
    items.some((item) => item.id === id),
  );

  function toggleSelected(id: string): void {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="즐겨찾기 · 프로젝트 트레이 관리"
        className={cn(
          "mt-1.5 flex min-h-11 w-full items-center justify-between rounded-lg border border-line bg-card px-2.5 text-[0.62rem] font-bold text-fg-2 hover:bg-raised",
          SMART_LIBRARY_FOCUS,
        )}
      >
        <span>즐겨찾기 · 프로젝트 트레이 관리</span>
        <span className="text-[0.54rem] text-fg-3">상위 {items.length}개</span>
      </button>

      {open ? (
        <>
          <div
            className="mt-1.5 flex flex-wrap items-center gap-1"
            aria-label="일괄 선별"
          >
            <span className="text-[0.55rem] font-bold text-fg-2">
              {visibleSelectedIds.length}개 선택
            </span>
            {STUDIO_UNIFIED_ASSET_CURATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={visibleSelectedIds.length === 0}
                onClick={() => onApplyCurationPreset(visibleSelectedIds, preset.id)}
                className={cn(
                  "min-h-9 rounded-lg border border-line bg-card px-2 text-[0.55rem] font-semibold text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
                  SMART_LIBRARY_FOCUS,
                )}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              disabled={visibleSelectedIds.length === 0}
              onClick={() => setSelectedIds([])}
              className={cn(
                "min-h-9 rounded-lg border border-line bg-card px-2 text-[0.55rem] font-semibold text-fg-3 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
                SMART_LIBRARY_FOCUS,
              )}
            >
              선택 해제
            </button>
          </div>
          <p className="mt-1 text-[0.52rem] leading-relaxed text-fg-3">
            {STUDIO_UNIFIED_ASSET_BULK_ADJUSTMENT_PRESETS.length === 0
              ? "이미지 조정 프리셋 일괄 적용은 아직 지원하지 않아요. 조정은 에셋을 삽입한 뒤 에디터에서 적용해 주세요."
              : "이미지 조정 프리셋은 선택한 에셋에 한 번에 적용됩니다."}
          </p>
          <div className="mt-1.5 max-h-64 space-y-1 overflow-y-auto pr-1" aria-label="스마트 에셋 관리 목록">
            {items.map((item) => {
              const facet = deriveStudioUnifiedAssetFacet(item);
              const favorite = state.favorites.includes(item.id);
              const inTray = state.tray.includes(item.id);
              const rating = getStudioUnifiedAssetRating(state, item.id);
              const flag = getStudioUnifiedAssetFlag(state, item.id);
              const selected = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-line bg-panel px-2 py-1"
                >
                  <div className="grid min-h-12 grid-cols-[2rem_1fr_2.75rem_2.75rem] items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={`${item.title} 일괄 선택`}
                      className="size-4 justify-self-center accent-[var(--accent)]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[0.6rem] font-bold text-fg">{item.title}</p>
                      <p className="truncate text-[0.5rem] text-fg-3">
                        {STUDIO_UNIFIED_ASSET_FORMAT_LABELS[facet.format]} · {STUDIO_UNIFIED_ASSET_RIGHTS_LABELS[facet.rights]} · {STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS[facet.editability]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(item.id)}
                      aria-pressed={favorite}
                      aria-label={`${item.title} 즐겨찾기 ${favorite ? "제거" : "추가"}`}
                      className={cn(
                        "grid min-h-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent",
                        SMART_LIBRARY_FOCUS,
                        favorite && "bg-accent-soft text-accent",
                      )}
                    >
                      <Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTray(item.id)}
                      aria-pressed={inTray}
                      aria-label={`${item.title} 프로젝트 트레이 ${inTray ? "제거" : "추가"}`}
                      className={cn(
                        "grid min-h-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent",
                        SMART_LIBRARY_FOCUS,
                        inTray && "bg-accent-soft text-accent",
                      )}
                    >
                      {inTray ? <Check size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pb-1 pl-8">
                    <span className="inline-flex" role="group" aria-label={`${item.title} 별점`}>
                      {RATING_STEPS.map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => onSetRating(item.id, rating === step ? 0 : step)}
                          aria-pressed={rating >= step}
                          aria-label={`${item.title} 별점 ${step}점`}
                          className={cn(
                            "grid min-h-9 min-w-9 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-accent pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                            SMART_LIBRARY_FOCUS,
                            rating >= step && "text-accent",
                          )}
                        >
                          <Star size={13} fill={rating >= step ? "currentColor" : "none"} aria-hidden />
                        </button>
                      ))}
                    </span>
                    <span className="inline-flex gap-1" role="group" aria-label={`${item.title} 선별 플래그`}>
                      {FLAG_STEPS.map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => onSetFlag(item.id, flag === step ? null : step)}
                          aria-pressed={flag === step}
                          aria-label={`${item.title} 플래그 ${STUDIO_UNIFIED_ASSET_FLAG_LABELS[step]}`}
                          className={cn(
                            "min-h-9 rounded-lg border px-1.5 text-[0.52rem] font-semibold pointer-coarse:min-h-11",
                            SMART_LIBRARY_FOCUS,
                            flag === step
                              ? "border-accent bg-accent-soft text-accent"
                              : "border-line bg-card text-fg-3 hover:bg-raised",
                          )}
                        >
                          {STUDIO_UNIFIED_ASSET_FLAG_LABELS[step]}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {relatedAnchor && related.length > 0 ? (
        <div className="mt-1.5 rounded-lg border border-accent/25 bg-card p-2" aria-label={`${relatedAnchor.title} 연관 에셋`}>
          <p className="text-[0.56rem] font-bold text-accent">방금 사용한 에셋과 잘 맞는 항목</p>
          <div className="mt-1 flex gap-1 overflow-x-auto pb-1">
            {related.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onUseItem(item)}
                className={cn(
                  "min-h-10 max-w-36 shrink-0 truncate rounded-lg border border-line bg-panel px-2 text-[0.56rem] font-semibold text-fg-2 hover:border-accent/50 hover:text-accent pointer-coarse:min-h-11",
                  SMART_LIBRARY_FOCUS,
                )}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
