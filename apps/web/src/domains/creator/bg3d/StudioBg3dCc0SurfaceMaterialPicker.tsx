import { useState } from "react";

import {
  STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG,
  STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATEGORIES,
  STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS,
  buildStudioBg3dCc0SurfaceMaterialOverride,
  listStudioBg3dCc0SurfaceMaterialsByCategory,
  resolveStudioBg3dSurfaceMaterialRoomKit,
  type StudioBg3dCc0SurfaceMaterialCategory,
  type StudioBg3dCc0SurfaceMaterialEntry,
} from "./studio-bg3d-cc0-surface-material-catalog";
import { studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";

export interface StudioBg3dCc0SurfaceMaterialPickerProps {
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onSelectMaterial: (
    entry: StudioBg3dCc0SurfaceMaterialEntry,
    override: StudioBg3dMaterialOverride,
  ) => void;
}

export function StudioBg3dCc0SurfaceMaterialPicker({
  disabled = false,
  defaultExpanded = false,
  onSelectMaterial,
}: StudioBg3dCc0SurfaceMaterialPickerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [category, setCategory] = useState<StudioBg3dCc0SurfaceMaterialCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleMaterials = listStudioBg3dCc0SurfaceMaterialsByCategory(category);

  const handleApplyMaterial = (entry: StudioBg3dCc0SurfaceMaterialEntry) => {
    const override = buildStudioBg3dCc0SurfaceMaterialOverride(entry.id);
    if (!override) return;
    setSelectedId(entry.id);
    onSelectMaterial(entry, override);
  };

  return (
    <div
      data-testid="bg3d-cc0-surface-material-picker"
      className="rounded-xl border border-line bg-card/60 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[0.68rem] font-bold text-fg">
            CC0 2K PBR 표면 재질 카탈로그 ({STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.length}종)
          </p>
          <p className="text-[0.6rem] text-fg-3">
            Poly Haven 80 · ambientCG 2 · 2K 노멀/거칠기/AO/변위 320맵 연동
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={expanded}
          data-testid="bg3d-cc0-surface-material-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:opacity-45"
        >
          {expanded ? "재질 카탈로그 접기" : `2K 표면 재질 ${STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.length}종 열기`}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2.5 space-y-2.5 border-t border-line/70 pt-2.5">
          {/* 6 Architectural Room Surface Kits */}
          <div>
            <p className="mb-1 text-[0.6rem] font-semibold text-fg-3">
              공간별 추천 바닥·벽·포인트 재질 세트 (6종)
            </p>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="공간별 표면 재질 세트">
              {STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS.map((kit) => {
                const resolved = resolveStudioBg3dSurfaceMaterialRoomKit(kit.id);
                if (!resolved) return null;
                return (
                  <button
                    key={kit.id}
                    type="button"
                    disabled={disabled}
                    data-testid={`bg3d-cc0-room-kit-${kit.id}`}
                    title={kit.descriptionKo}
                    onClick={() => handleApplyMaterial(resolved.floor)}
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-panel p-1.5 text-left text-[0.62rem] transition-colors hover:border-accent/50 hover:bg-raised disabled:opacity-45"
                  >
                    <span className="flex w-full items-center justify-between gap-1 font-bold text-fg">
                      <span className="truncate">{kit.labelKo}</span>
                      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
                        {[resolved.floor, resolved.wall, resolved.accent].map((part) => (
                          <span
                            key={part.id}
                            className="size-2.5 rounded-full border border-line/60"
                            style={{ backgroundColor: part.tintHex }}
                          />
                        ))}
                      </span>
                    </span>
                    <span className="truncate text-[0.56rem] text-fg-3">
                      {resolved.floor.labelKo} · {resolved.wall.labelKo}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap gap-1" role="group" aria-label="CC0 표면 재질 분류">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={category === null}
              data-testid="bg3d-cc0-surface-cat-all"
              onClick={() => setCategory(null)}
              className={cx(
                "rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold transition-colors",
                category === null
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              전체 ({STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.length})
            </button>
            {STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATEGORIES.map((cat) => {
              const count = listStudioBg3dCc0SurfaceMaterialsByCategory(cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={category === cat.id}
                  data-testid={`bg3d-cc0-surface-cat-${cat.id}`}
                  onClick={() => setCategory(cat.id)}
                  className={cx(
                    "rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold transition-colors",
                    category === cat.id
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
                  )}
                >
                  {cat.labelKo} ({count})
                </button>
              );
            })}
          </div>

          {/* 82 Material Grid */}
          <div
            className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1"
            role="group"
            aria-label="CC0 2K PBR 표면 재질 목록"
          >
            {visibleMaterials.map((entry) => {
              const isSelected = selectedId === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  data-testid={`bg3d-cc0-surface-item-${entry.id}`}
                  onClick={() => handleApplyMaterial(entry)}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors disabled:opacity-45",
                    isSelected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <img
                    src={entry.previewUrl}
                    alt={entry.labelKo}
                    loading="lazy"
                    className="size-9 shrink-0 rounded border border-line/60 object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.62rem] font-bold">
                      {entry.labelKo}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[0.55rem] text-fg-3">
                      <span>{entry.pbrMaps ? "2K PBR 4맵" : "2K 컬러"}</span>
                      <span>·</span>
                      <span>R {entry.roughness}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
