import {
  ArrowDownToLine,
  FlipHorizontal2,
  Layers,
  Lock,
  Maximize2,
  PaintBucket,
  Pipette,
  Redo2,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type PointerEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_QUICK_MENU_SLOTS,
  resolveQuickMenuSlotFromDrag,
  type QuickMenuActionId,
  type QuickMenuSlot,
} from "../drawing/studio-quickmenu-and-quickshape";

export interface StudioRadialQuickWheelProps {
  readonly open: boolean;
  readonly anchor?: { readonly x: number; readonly y: number } | null;
  readonly slots?: readonly QuickMenuSlot[];
  readonly onSelectAction: (actionId: QuickMenuActionId, slot: QuickMenuSlot) => void;
  readonly onClose: () => void;
}

const ACTION_ICONS: Readonly<Record<QuickMenuActionId, LucideIcon>> = {
  undo: Undo2,
  redo: Redo2,
  "flip-canvas-h": FlipHorizontal2,
  "toggle-alpha-lock": Lock,
  "toggle-clipping-mask": Layers,
  "colordrop-fill": PaintBucket,
  "fit-canvas": Maximize2,
  eyedropper: Pipette,
  "merge-down": ArrowDownToLine,
  "clear-layer": Trash2,
};

const WHEEL_SIZE = 184;
const WHEEL_CENTER = WHEEL_SIZE / 2;
const SECTOR_RADIUS = 64;
const DEADZONE_PX = 24;

function polarSectorPosition(index: number): { readonly left: number; readonly top: number } {
  const angleRad = ((index * 60 - 90) * Math.PI) / 180;
  return {
    left: Math.round(WHEEL_CENTER + Math.cos(angleRad) * SECTOR_RADIUS),
    top: Math.round(WHEEL_CENTER + Math.sin(angleRad) * SECTOR_RADIUS),
  };
}

function clampAnchor(anchor: { readonly x: number; readonly y: number } | null | undefined): {
  readonly x: number;
  readonly y: number;
} {
  const vw = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 800;
  const fallbackX = Math.round(vw / 2);
  const fallbackY = Math.round(vh / 2);
  const rawX = anchor && Number.isFinite(anchor.x) ? anchor.x : fallbackX;
  const rawY = anchor && Number.isFinite(anchor.y) ? anchor.y : fallbackY;
  const margin = WHEEL_CENTER + 16;
  return {
    x: Math.max(margin, Math.min(vw - margin, rawX)),
    y: Math.max(margin, Math.min(vh - margin, rawY)),
  };
}

function sectorWedgePath(index: number): string {
  const startDeg = index * 60 - 120;
  const endDeg = startDeg + 60;
  const rInner = DEADZONE_PX + 2;
  const rOuter = WHEEL_CENTER - 4;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = WHEEL_CENTER + rOuter * Math.cos(toRad(startDeg));
  const y1 = WHEEL_CENTER + rOuter * Math.sin(toRad(startDeg));
  const x2 = WHEEL_CENTER + rOuter * Math.cos(toRad(endDeg));
  const y2 = WHEEL_CENTER + rOuter * Math.sin(toRad(endDeg));
  const x3 = WHEEL_CENTER + rInner * Math.cos(toRad(endDeg));
  const y3 = WHEEL_CENTER + rInner * Math.sin(toRad(endDeg));
  const x4 = WHEEL_CENTER + rInner * Math.cos(toRad(startDeg));
  const y4 = WHEEL_CENTER + rInner * Math.sin(toRad(startDeg));
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOuter} ${rOuter} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${rInner} ${rInner} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
}

/**
 * 184×184px 동심원 6섹터 방사형 퀵 휠.
 * Q키·우클릭 홀드 드래그(24px 데드존)·숫자 1~6·방향키·Esc로 0.3초 안에 핵심 캔버스 동작을 실행한다.
 */
export function StudioRadialQuickWheel({
  open,
  anchor,
  slots = DEFAULT_QUICK_MENU_SLOTS,
  onSelectAction,
  onClose,
}: StudioRadialQuickWheelProps) {
  const bt = useBilingual("StudioRadialQuickWheel");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [flickOrigin, setFlickOrigin] = useState<{ readonly x: number; readonly y: number } | null>(null);

  const visibleSlots = slots.slice(0, 6);
  const clamped = clampAnchor(anchor);

  useEffect(() => {
    if (!open) {
      setActiveIndex(null);
      setFlickOrigin(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (/^[1-6]$/u.test(event.key)) {
        const idx = Number(event.key) - 1;
        const picked = visibleSlots[idx];
        if (picked) {
          event.preventDefault();
          onSelectAction(picked.actionId, picked);
          onClose();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % visibleSlots.length));
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) =>
          prev === null ? visibleSlots.length - 1 : (prev - 1 + visibleSlots.length) % visibleSlots.length,
        );
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && activeIndex !== null) {
        const picked = visibleSlots[activeIndex];
        if (picked) {
          event.preventDefault();
          onSelectAction(picked.actionId, picked);
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, onClose, onSelectAction, open, visibleSlots]);

  if (!open) return null;

  const activeSlot = activeIndex !== null ? visibleSlots[activeIndex] ?? null : null;

  const handleWheelPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setFlickOrigin({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const handleWheelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = flickOrigin ?? clamped;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const resolved = resolveQuickMenuSlotFromDrag(visibleSlots, dx, dy, DEADZONE_PX);
    setActiveIndex(resolved ? resolved.index : null);
  };

  const handleWheelPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!flickOrigin) return;
    const dx = event.clientX - flickOrigin.x;
    const dy = event.clientY - flickOrigin.y;
    const resolved = resolveQuickMenuSlotFromDrag(visibleSlots, dx, dy, DEADZONE_PX);
    setFlickOrigin(null);
    if (resolved) {
      onSelectAction(resolved.actionId, resolved);
      onClose();
    }
  };

  return (
    <div
      data-studio-radial-quick-wheel-backdrop="true"
      className="fixed inset-0 z-[95]"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={bt("방사형 휠 배경 닫기", "Dismiss radial quick wheel")}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-transparent"
      />
      <div
        role="menu"
        aria-label={bt("빠른 도구 방사형 휠", "Radial quick tool wheel")}
        data-studio-radial-quick-wheel="true"
        data-active-slot={activeSlot ? activeSlot.actionId : ""}
        onPointerDown={handleWheelPointerDown}
        onPointerMove={handleWheelPointerMove}
        onPointerUp={handleWheelPointerUp}
        style={{
          left: `${clamped.x}px`,
          top: `${clamped.y}px`,
          width: `${WHEEL_SIZE}px`,
          height: `${WHEEL_SIZE}px`,
        }}
        className="fixed -translate-x-1/2 -translate-y-1/2 select-none rounded-full border border-line-strong bg-panel/95 shadow-[var(--atelier-elevation-floating)] transition-opacity duration-150 motion-reduce:transition-none"
      >
        <svg
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          {visibleSlots.map((slot, index) => {
            const highlighted = activeIndex === index;
            return (
              <path
                key={slot.actionId}
                d={sectorWedgePath(index)}
                className={cn(
                  "stroke-line transition-colors duration-100 motion-reduce:transition-none",
                  highlighted ? "fill-accent-soft stroke-accent" : "fill-transparent",
                )}
                strokeWidth={highlighted ? 1.5 : 1}
              />
            );
          })}
          <circle
            cx={WHEEL_CENTER}
            cy={WHEEL_CENTER}
            r={DEADZONE_PX}
            className="fill-card stroke-line-strong"
            strokeWidth={1}
          />
        </svg>

        {visibleSlots.map((slot, index) => {
          const Icon = ACTION_ICONS[slot.actionId];
          const pos = polarSectorPosition(index);
          const highlighted = activeIndex === index;
          return (
            <button
              key={`${slot.index}-${slot.actionId}`}
              type="button"
              role="menuitem"
              data-studio-radial-slot={slot.actionId}
              data-slot-index={slot.index}
              aria-label={`${index + 1}. ${slot.labelKo}`}
              title={`${slot.labelKo} (${index + 1})`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={(event) => {
                event.stopPropagation();
                onSelectAction(slot.actionId, slot);
                onClose();
              }}
              style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
              className={cn(
                "absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-fg transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
                highlighted
                  ? "border-accent bg-accent text-on-accent"
                  : "border-transparent bg-transparent text-fg-2 hover:text-fg",
              )}
            >
              <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
              <span className="sr-only">{slot.labelKo}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-label={bt("방사형 휠 닫기", "Close radial wheel")}
          onClick={onClose}
          className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-fg-3 transition-colors duration-100 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>

        <div
          aria-live="polite"
          className="pointer-events-none absolute -bottom-9 left-1/2 w-max max-w-48 -translate-x-1/2 rounded-lg border border-line-strong bg-panel/95 px-2.5 py-1 text-center text-xs font-semibold text-fg shadow-[var(--atelier-elevation-dock)]"
        >
          {activeSlot
            ? `${activeSlot.index + 1} · ${activeSlot.labelKo}`
            : bt("1~6 키 · 드래그로 실행 · Esc 닫기", "Press 1–6 or drag · Esc to close")}
        </div>
      </div>
    </div>
  );
}
