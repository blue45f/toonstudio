import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Compass, Layers, Magnet, Star, X } from "lucide-react";

import {
  DEFAULT_QUICK_FAVORITE_IDS,
  PIE_DIRECTION_OFFSETS,
  getRadialPieMenuSpec,
  resolveRadialPieDirection,
  type PieDirection8,
  type RadialPieActionItem,
  type RadialPieMenuId,
} from "./studio-3d-radial-pie-favorites";

import { cn } from "@/shared/lib/utils";

export interface Studio3dRadialPieMenuProps {
  readonly open: boolean;
  readonly menuId: RadialPieMenuId;
  /** 뷰포트 기준 파이 중심 좌표(px). */
  readonly origin?: { readonly x: number; readonly y: number };
  readonly favoriteIds?: readonly string[];
  readonly radiusPx?: number;
  readonly className?: string;
  readonly onSelectAction: (item: RadialPieActionItem) => void;
  readonly onToggleFavorite?: (actionId: string) => void;
  readonly onClose: () => void;
}

function MenuHeaderIcon({ menuId }: { readonly menuId: RadialPieMenuId }) {
  if (menuId === "mode") return <Compass className="size-4" aria-hidden="true" />;
  if (menuId === "shading") return <Layers className="size-4" aria-hidden="true" />;
  if (menuId === "snap") return <Magnet className="size-4" aria-hidden="true" />;
  return <Star className="size-4" aria-hidden="true" />;
}

/**
 * Blender 스타일 8방위 파이 메뉴(`Tab`/`Z`/`Shift+S`) & 퀵 즐겨찾기(`Q`) UI.
 * - OKLCH 시맨틱 토큰 전용(raw hex/rgb 미사용)
 * - 전 슬라이스 44px 이상 터치 타깃(`min-h-11 min-w-11`)
 * - `prefers-reduced-motion` 준수 (`motion-reduce:transition-none`)
 */
export function Studio3dRadialPieMenu({
  open,
  menuId,
  origin = { x: 240, y: 240 },
  favoriteIds = DEFAULT_QUICK_FAVORITE_IDS,
  radiusPx = 112,
  className,
  onSelectAction,
  onToggleFavorite,
  onClose,
}: Studio3dRadialPieMenuProps) {
  const [hoveredDirection, setHoveredDirection] = useState<PieDirection8 | null>(null);
  const spec = useMemo(() => getRadialPieMenuSpec(menuId, favoriteIds), [menuId, favoriteIds]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const itemByDirection = useMemo(() => {
    const map = new Map<PieDirection8, RadialPieActionItem>();
    for (const item of spec.items) {
      map.set(item.direction, item);
    }
    return map;
  }, [spec.items]);

  if (!open) return null;

  const activeItem = hoveredDirection ? itemByDirection.get(hoveredDirection) ?? null : null;
  const diameter = radiusPx * 2 + 120;
  const center = diameter / 2;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const dir = resolveRadialPieDirection(center, center, localX, localY, 20);
    setHoveredDirection(dir);
  };

  const handlePointerUp = () => {
    if (activeItem) {
      onSelectAction(activeItem);
      onClose();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const digit = Number.parseInt(event.key, 10);
    if (Number.isInteger(digit) && digit >= 1 && digit <= spec.items.length) {
      event.preventDefault();
      onSelectAction(spec.items[digit - 1]);
      onClose();
    }
  };

  const activeOffset = hoveredDirection ? PIE_DIRECTION_OFFSETS[hoveredDirection] : null;

  return (
    <div
      role="menu"
      tabIndex={0}
      aria-label={`${spec.titleKo} 파이 메뉴 (${spec.triggerShortcutLabel})`}
      data-testid="studio-3d-radial-pie-menu"
      data-pie-menu-id={menuId}
      style={{
        width: `${diameter}px`,
        height: `${diameter}px`,
        left: `${origin.x}px`,
        top: `${origin.y}px`,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={cn(
        "fixed z-40 -translate-x-1/2 -translate-y-1/2 select-none focus-visible:outline-none",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radiusPx}
          className="fill-panel/60 stroke-line-strong"
          strokeWidth={1.25}
          strokeDasharray="4 4"
        />
        <circle
          cx={center}
          cy={center}
          r={22}
          className="fill-card stroke-line"
          strokeWidth={1.25}
        />
        {activeOffset ? (
          <line
            x1={center}
            y1={center}
            x2={center + activeOffset.unitX * (radiusPx - 14)}
            y2={center + activeOffset.unitY * (radiusPx - 14)}
            className="stroke-accent transition-opacity duration-100 motion-reduce:transition-none"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ) : null}
      </svg>

      <button
        type="button"
        aria-label="파이 메뉴 닫기"
        onClick={onClose}
        style={{ left: `${center}px`, top: `${center}px` }}
        className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-card text-fg-2 shadow-sm transition-colors duration-100 hover:border-accent hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div
        style={{ left: `${center}px`, top: `${center + 34}px` }}
        className="pointer-events-none absolute -translate-x-1/2 rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs font-semibold text-fg-2"
      >
        <span className="inline-flex items-center gap-1">
          <MenuHeaderIcon menuId={menuId} />
          <span>{spec.titleKo}</span>
        </span>
      </div>

      {spec.items.map((item) => {
        const offset = PIE_DIRECTION_OFFSETS[item.direction];
        const x = center + offset.unitX * radiusPx;
        const y = center + offset.unitY * radiusPx;
        const isActive = hoveredDirection === item.direction;
        const isFavorited = favoriteSet.has(item.id);

        return (
          <div
            key={item.id}
            style={{ left: `${x}px`, top: `${y}px` }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
          >
            <button
              type="button"
              role="menuitem"
              data-pie-direction={item.direction}
              onMouseEnter={() => setHoveredDirection(item.direction)}
              onFocus={() => setHoveredDirection(item.direction)}
              onClick={() => {
                onSelectAction(item);
                onClose();
              }}
              className={cn(
                "flex min-h-11 min-w-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium shadow-sm transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none",
                isActive
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg hover:border-accent/60 hover:bg-raised",
              )}
            >
              {item.shortcutLabel ? (
                <kbd
                  className={cn(
                    "rounded border px-1 py-0.5 text-xs tabular-nums",
                    isActive
                      ? "border-on-accent/40 bg-on-accent/15 text-on-accent"
                      : "border-line bg-panel text-fg-3",
                  )}
                >
                  {item.shortcutLabel}
                </kbd>
              ) : null}
              <span className="whitespace-nowrap">{item.labelKo}</span>
            </button>

            {onToggleFavorite ? (
              <button
                type="button"
                aria-label={`${item.labelKo} 퀵 즐겨찾기 ${isFavorited ? "해제" : "추가"}`}
                aria-pressed={isFavorited}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(item.id);
                }}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl border transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none",
                  isFavorited
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-panel text-fg-3 hover:text-fg",
                )}
              >
                <Star className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}

      <p role="status" className="sr-only">
        {activeItem ? `${activeItem.labelKo}: ${activeItem.hintKo}` : `${spec.titleKo} 방향 선택 대기`}
      </p>
    </div>
  );
}
