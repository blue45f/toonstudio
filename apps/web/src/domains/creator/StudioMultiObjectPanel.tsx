/**
 * Studio 3D 다중 오브젝트 배치 패널(Multi-Object Placement Panel).
 *
 * 3D 씬에 배치된 소품 인스턴스를 리스트로 관리하며,
 * 룸 레이아웃 프리셋 적용, 바닥 스냅, 복제, 삭제, 개별 Transform 슬라이더를 제공한다.
 */

import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { Box, Copy, GripVertical, Layers, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  STUDIO_3D_PROP_CATEGORY_LABELS,
  STUDIO_BUNDLED_SCENE_PROP_CATALOG,
  STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG,
  STUDIO_POLYHAVEN_PBR_PROP_CATALOG,
  STUDIO_ROOM_LAYOUT_PRESETS,
  STUDIO_SCENE_PROP_LAYOUT_PRESETS,
  findStudio3DPropCatalogEntry,
  listStudio3DPropCatalogByCategory,
  type Studio3DObjectInstance,
  type Studio3DPropCatalogCategory,
} from "./studio-multi-object-layout";
import {
  StudioPanelChip,
  StudioSectionHeader,
  StudioSliderRow,
} from "./studio-panel-ui";

import type { ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";

type PropCatalogFilter =
  | "refined-v8"
  | "polyhaven-pbr"
  | "kenney-blockout"
  | "all"
  | Studio3DPropCatalogCategory;

const PROP_CATEGORY_FILTERS: readonly { readonly id: PropCatalogFilter; readonly label: string }[] = [
  { id: "refined-v8", label: "개선형 v8" },
  { id: "polyhaven-pbr", label: `Poly Haven PBR (${STUDIO_POLYHAVEN_PBR_PROP_CATALOG.length})` },
  { id: "kenney-blockout", label: `Kenney 블록아웃 (${STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG.length})` },
  { id: "all", label: `전체 (${STUDIO_BUNDLED_SCENE_PROP_CATALOG.length})` },
  ...(Object.entries(STUDIO_3D_PROP_CATEGORY_LABELS) as [Studio3DPropCatalogCategory, string][]).map(
    ([id, label]) => ({ id, label }),
  ),
];

export interface StudioMultiObjectPanelProps {
  /** 현재 배치된 3D 오브젝트 인스턴스 목록. */
  readonly objects: readonly Studio3DObjectInstance[];
  /** 오브젝트 배치 변경 콜백. */
  readonly onObjectsChange: (objects: readonly Studio3DObjectInstance[]) => void;
  /** 오브젝트 복제 콜백. */
  readonly onDuplicate: (id: string) => void;
  /** 오브젝트 삭제 콜백. */
  readonly onRemove: (id: string) => void;
  /** 바닥 스냅 콜백. */
  readonly onSnapToFloor: (id: string) => void;
  /** 룸 프리셋 적용 콜백. */
  readonly onApplyRoomPreset: (presetId: string) => void;
  /** 카탈로그 소품 개별 추가 콜백(선택). */
  readonly onAddCatalogProp?: (propId: string) => void;
}

export function StudioMultiObjectPanel({
  objects,
  onObjectsChange,
  onDuplicate,
  onRemove,
  onSnapToFloor,
  onApplyRoomPreset,
  onAddCatalogProp,
}: StudioMultiObjectPanelProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<PropCatalogFilter>("refined-v8");
  const visibleCatalog = listStudio3DPropCatalogByCategory(catalogFilter);

  const handleAddProp = (propId: string) => {
    if (onAddCatalogProp) {
      onAddCatalogProp(propId);
      return;
    }
    const entry = findStudio3DPropCatalogEntry(propId);
    if (!entry) return;
    const offset = ((objects.length % 5) - 2) * 0.25;
    const instance: Studio3DObjectInstance = {
      id: `obj_${entry.id}_${objects.length + 1}`,
      modelUrl: entry.modelUrl,
      name: entry.name,
      position: [
        Math.round((entry.defaultPosition[0] + offset) * 100) / 100,
        entry.defaultPosition[1],
        entry.defaultPosition[2],
      ],
      rotation: entry.defaultRotation,
      scale: entry.defaultScale,
      visible: true,
    };
    onObjectsChange([...objects, instance]);
  };

  const handleAxisChange = (objectId: string, axisIndex: 0 | 1 | 2, nextValue: number) => {
    onObjectsChange(
      objects.map((item) => {
        if (item.id !== objectId) return item;
        const nextPosition: [number, number, number] = [
          item.position[0],
          item.position[1],
          item.position[2],
        ];
        nextPosition[axisIndex] = Math.round(nextValue * 100) / 100;
        return { ...item, position: nextPosition };
      }),
    );
  };

  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="3D 소품 배치"
        description="룸 프리셋으로 일괄 배치하거나 개별 오브젝트를 관리하세요."
      />

      {/* 룸 레이아웃 프리셋 */}
      <div className="space-y-1">
        <span className="text-xs font-semibold text-fg-2">
          <Layers size={12} className="mr-1 inline-block align-[-2px]" aria-hidden />
          룸 레이아웃 프리셋
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="룸 레이아웃 프리셋">
          {STUDIO_ROOM_LAYOUT_PRESETS.map((preset) => (
            <StudioPanelChip
              key={preset.id}
              onClick={() => onApplyRoomPreset(preset.id)}
              title={preset.label}
            >
              {preset.label.split("(")[0]?.trim() ?? preset.label}
            </StudioPanelChip>
          ))}
        </div>
      </div>

      {/* 웹툰 테마 씬 프리셋 */}
      <div className="space-y-1">
        <span className="text-xs font-semibold text-fg-2">
          웹툰 테마 씬 프리셋 ({STUDIO_SCENE_PROP_LAYOUT_PRESETS.length})
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="웹툰 테마 씬 프리셋">
          {STUDIO_SCENE_PROP_LAYOUT_PRESETS.map((preset) => (
            <StudioPanelChip
              key={preset.id}
              onClick={() => onApplyRoomPreset(preset.id)}
              title={preset.label}
            >
              {preset.label.split("(")[0]?.trim() ?? preset.label}
            </StudioPanelChip>
          ))}
        </div>
      </div>

      {/* 번들 3D 소품·마네킹 카탈로그 */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-fg-2">
          3D 소품·마네킹 카탈로그 ({visibleCatalog.length})
        </span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="3D 소품 카테고리 필터">
          {PROP_CATEGORY_FILTERS.map((filterItem) => (
            <StudioPanelChip
              key={filterItem.id}
              active={catalogFilter === filterItem.id}
              onClick={() => setCatalogFilter(filterItem.id)}
            >
              {filterItem.label}
            </StudioPanelChip>
          ))}
        </div>
        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5" role="group" aria-label="개선형 3D 소품 카탈로그">
          {visibleCatalog.map((prop) => (
            <button
              key={prop.id}
              type="button"
              onClick={() => handleAddProp(prop.id)}
              title={prop.name}
              className="flex flex-col items-center gap-1 rounded-md border border-line/60 bg-card/50 p-1.5 text-[0.65rem] text-fg-2 transition-colors hover:border-accent/60 hover:bg-card"
            >
              {prop.thumbnailUrl ? (
                <img
                  src={prop.thumbnailUrl}
                  alt={prop.name}
                  loading="lazy"
                  decoding="async"
                  width={48}
                  height={48}
                  className="h-10 w-10 rounded object-contain"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded bg-panel/70 text-fg-3">
                  <Box size={16} aria-hidden />
                </span>
              )}
              <span className="w-full truncate text-center">
                {prop.name.replace(" (v8)", "").replace(" (Poly Haven)", "").replace(" (Kenney)", "")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 배치된 오브젝트 리스트 */}
      <div className="space-y-1">
        <span className="text-xs font-semibold text-fg-2">
          배치된 오브젝트 ({objects.length})
        </span>
        {objects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/70 bg-card/60 p-3 text-[0.7rem] leading-relaxed text-fg-3">
            {r3c07StatusText("studio.panelStatus.r3c07.multiObject.objectsEmpty", "배치된 3D 소품이 없습니다. 룸 프리셋을 적용하거나 모델을 추가하세요.")}
          </p>
        ) : (
          <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-line/50 bg-card/40 p-1">
            {objects.map((obj) => (
              <div
                key={obj.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId((prev) => (prev === obj.id ? null : obj.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId((prev) => (prev === obj.id ? null : obj.id));
                  }
                }}
                className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[0.72rem] transition-colors ${
                  selectedId === obj.id
                    ? "bg-accent/15 text-accent"
                    : "text-fg-2 hover:bg-card/80"
                }`}
              >
                <GripVertical size={11} className="shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{obj.name}</span>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSnapToFloor(obj.id);
                    }}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "!px-1" })}
                    title="바닥 스냅"
                  >
                    <RotateCcw size={11} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(obj.id);
                    }}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "!px-1" })}
                    title="복제"
                  >
                    <Copy size={11} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(obj.id);
                    }}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "!px-1 text-rose-400" })}
                    title="삭제"
                  >
                    <Trash2 size={11} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 선택된 오브젝트의 Transform 정보 */}
      {selectedId ? (() => {
        const obj = objects.find((o) => o.id === selectedId);
        if (!obj) return null;
        return (
          <div className="space-y-2 rounded-lg border border-line/50 bg-card/40 p-2">
            <span className="text-xs font-semibold text-fg-2">
              「{obj.name}」 Transform
            </span>
            <StudioSliderRow
              label="X"
              min={-10}
              max={10}
              step={0.1}
              value={Math.round(obj.position[0] * 10) / 10}
              onChange={(nextX) => handleAxisChange(obj.id, 0, nextX)}
              readout={obj.position[0].toFixed(1)}
            />
            <StudioSliderRow
              label="Y"
              min={-10}
              max={10}
              step={0.1}
              value={Math.round(obj.position[1] * 10) / 10}
              onChange={(nextY) => handleAxisChange(obj.id, 1, nextY)}
              readout={obj.position[1].toFixed(1)}
            />
            <StudioSliderRow
              label="Z"
              min={-10}
              max={10}
              step={0.1}
              value={Math.round(obj.position[2] * 10) / 10}
              onChange={(nextZ) => handleAxisChange(obj.id, 2, nextZ)}
              readout={obj.position[2].toFixed(1)}
            />
          </div>
        );
      })() : null}
    </div>
  );
}
