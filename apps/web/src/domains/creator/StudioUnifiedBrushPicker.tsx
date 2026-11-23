/**
 * Mobile built-in preset shelf.
 *
 * The searchable catalog itself is owned once by StudioPage. Keeping this
 * component presentational prevents a hidden desktop inspector and the mobile
 * sheet from opening competing dialogs or maintaining divergent favorites.
 */
import { Bookmark } from "lucide-react";


import { StudioBrushTray } from "./brush/StudioBrushTray";
import { StudioVibrantToolArtwork } from "./canvas-chrome/StudioVibrantToolArtwork";
import {
  STUDIO_VIBRANT_BRUSH_FAMILY_CHIPS,
  resolveVibrantSpriteForBrush,
} from "./canvas-chrome/studio-vibrant-sprite-catalog";
import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";
import { StudioActiveBrushSummary } from "./StudioActiveBrushSummary";

import type { StudioBrushStampTuning } from "./brush/studio-brush-library";
import type { StudioStabilizerMode } from "./brush/studio-stroke-stabilizer";
import type { StudioBrushTrayItem } from "./studio-creative-ux";
import type { StudioProDrawPrefs } from "./studio-pro-draw-prefs";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioUnifiedBrushPickerProps {
  activeBrushId: string;
  activeCatalogBrushId?: string;
  activeCatalogBrushName?: string;
  brushOpacity: number;
  brushCatalogItems?: readonly StudioBrushTrayItem[];
  catalogOpen?: boolean;
  color: string;
  proDrawPrefs: StudioProDrawPrefs;
  stampTuning?: StudioBrushStampTuning | null;
  stabilizer: number;
  stabilizerMode: StudioStabilizerMode;
  strokeWidth: number;
  tipAngle: number;
  tipRoundness: number;
  onStampTuningChange?: (tuning: StudioBrushStampTuning) => void;
  onSelectBrush: (preset: BrushPreset) => void;
  onSelectBrushId?: (brushId: string) => void;
  onToggleCatalog: (trigger: HTMLButtonElement) => void;
  onToggleFavoriteBrush: (brushId: string) => void;
}

const STAMP_TUNING_CONTROLS = [
  { key: "flow", label: "흐름" },
  { key: "hardness", label: "경도" },
  { key: "minSize", label: "최소 굵기" },
] as const;

/**
 * A short, thumb-reachable mobile projection of StudioPage's single built-in
 * catalog session. User-authored brushes remain in the separate My Brushes UI.
 */
export function StudioUnifiedBrushPicker({
  activeBrushId,
  activeCatalogBrushId,
  activeCatalogBrushName,
  brushOpacity,
  brushCatalogItems,
  catalogOpen = false,
  color,
  proDrawPrefs,
  stampTuning,
  stabilizer,
  stabilizerMode,
  strokeWidth,
  tipAngle,
  tipRoundness,
  onStampTuningChange,
  onSelectBrush,
  onSelectBrushId,
  onToggleCatalog,
  onToggleFavoriteBrush,
}: StudioUnifiedBrushPickerProps): ReactElement {
  const catalogBrushId = activeCatalogBrushId ?? activeBrushId;
  const activePreset = BRUSH_PRESETS.find((preset) => preset.id === catalogBrushId);
  const catalogItem = brushCatalogItems?.find((item) => item.id === catalogBrushId);
  const activeName = activeCatalogBrushName
    ?? catalogItem?.name
    ?? activePreset?.name
    ?? catalogBrushId;
  const activeFavorite = proDrawPrefs.favoriteBrushIds.includes(catalogBrushId);
  const activeVibrant = resolveVibrantSpriteForBrush(catalogBrushId);
  const selectBrushId = (brushId: string) => {
    if (onSelectBrushId) {
      onSelectBrushId(brushId);
      return;
    }
    const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId);
    if (preset) onSelectBrush(preset);
  };
  return (
    <section
      aria-label="기본 프리셋"
      data-studio-unified-brush-picker="mobile"
      data-vibrant-brush-sprite={activeVibrant.spriteId}
      data-vibrant-accent={activeVibrant.accent}
      className="studio-vibrant-surface studio-vibrant-keep-all studio-vibrant-tabular relative space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <StudioVibrantToolArtwork
            spriteId={activeVibrant.spriteId}
            accent={activeVibrant.accent}
            size={20}
            active
          />
          <p className="text-xs font-bold text-fg-2 [word-break:keep-all]">기본 프리셋</p>
        </div>
        <p className="text-xs text-fg-3 [word-break:keep-all]">앱 제공 · 내 브러시와 별도</p>
      </div>
      <StudioActiveBrushSummary
        brushId={catalogBrushId}
        brushName={activeName}
        brushCatalogItems={brushCatalogItems}
        color={color}
        opacity={brushOpacity}
        stabilizer={stabilizer}
        stabilizerMode={stabilizerMode}
        strokeWidth={strokeWidth}
        tipAngle={tipAngle}
        tipRoundness={tipRoundness}
        trailing={(
          <button
            type="button"
            onClick={() => onToggleFavoriteBrush(catalogBrushId)}
            aria-label={activeFavorite ? `${activeName} 즐겨찾기 해제` : `${activeName} 즐겨찾기`}
            aria-pressed={activeFavorite}
            data-vibrant-accent={activeVibrant.accent}
            data-vibrant-active={activeFavorite ? "true" : "false"}
            title={activeFavorite ? "현재 브러시 즐겨찾기 해제" : "현재 브러시 즐겨찾기"}
            className={cn(
              "studio-vibrant-touch-target studio-vibrant-ink-bloom studio-vibrant-press grid size-11 shrink-0 place-items-center rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
              activeFavorite
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line/70 text-fg-3 hover:bg-raised hover:text-fg"
            )}
          >
            <Bookmark size={14} fill={activeFavorite ? "currentColor" : "none"} aria-hidden />
          </button>
        )}
      />

      <div
        role="group"
        aria-label="컬러 브러시 패밀리 빠른 전환"
        data-studio-vibrant-brush-medallions="true"
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STUDIO_VIBRANT_BRUSH_FAMILY_CHIPS.map((chip) => {
          const isFamilyActive = activeVibrant.spriteId === chip.spriteId;
          return (
            <button
              key={chip.spriteId}
              type="button"
              onClick={() => selectBrushId(chip.brushId)}
              aria-label={`${chip.labelKo} 브러시 선택`}
              aria-pressed={isFamilyActive}
              data-vibrant-brush-chip={chip.brushId}
              data-vibrant-accent={chip.accent}
              data-vibrant-active={isFamilyActive ? "true" : "false"}
              className={cn(
                "studio-vibrant-touch-target studio-vibrant-ink-bloom studio-vibrant-press inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-xs font-semibold [word-break:keep-all] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
                isFamilyActive
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line/70 bg-card text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <StudioVibrantToolArtwork
                spriteId={chip.spriteId}
                accent={chip.accent}
                size={22}
                active={isFamilyActive}
              />
              <span>{chip.labelKo}</span>
            </button>
          );
        })}
      </div>

      <StudioBrushTray
        activeBrushId={catalogBrushId}
        brushCatalogItems={brushCatalogItems}
        favoriteBrushIds={proDrawPrefs.favoriteBrushIds}
        recentBrushIds={proDrawPrefs.recentBrushIds}
        libraryOpen={catalogOpen}
        onOpenLibrary={onToggleCatalog}
        onSelect={(item) => selectBrushId(item.id)}
        aria-label="기본 프리셋 빠른 선택 — 즐겨찾기, 최근 사용, 추천"
        className="w-full"
      />

      {stampTuning && onStampTuningChange ? (
        <div
          role="group"
          aria-label="스탬프 브러시 세부 조절"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-line/70 bg-card/55 p-2"
        >
          {STAMP_TUNING_CONTROLS.map((control) => (
            <label key={control.key} className="min-w-0 text-xs font-semibold text-fg-3 [word-break:keep-all]">
              <span className="mb-1 flex items-center justify-between gap-1">
                <span>{control.label}</span>
                <span className="tabular-nums text-fg-2">
                  {Math.round(stampTuning[control.key] * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(stampTuning[control.key] * 100)}
                onChange={(event) => onStampTuningChange({
                  ...stampTuning,
                  [control.key]: Number(event.target.value) / 100,
                })}
                aria-label={`스탬프 ${control.label}`}
                className="h-11 w-full cursor-pointer accent-accent"
              />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}
