import {
  ArrowDownToLine,
  Check,
  FlipHorizontal2,
  Layers,
  Lock,
  Maximize2,
  PaintBucket,
  Pipette,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type PointerEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  assignQuickMenuSlot,
  DEFAULT_QUICK_MENU_SLOTS,
  QUICK_MENU_ACTION_LABELS_KO,
  resolveQuickMenuSlotFromDrag,
  type QuickMenuActionId,
  type QuickMenuSlot,
} from "../drawing/studio-quickmenu-and-quickshape";
import {
  ALL_QUICK_MENU_ACTION_IDS,
  saveQuickMenuSlots,
} from "../drawing/studio-quickmenu-preferences";

export interface StudioRadialQuickWheelProps {
  readonly open: boolean;
  readonly anchor?: { readonly x: number; readonly y: number } | null;
  readonly slots?: readonly QuickMenuSlot[];
  readonly onSelectAction: (actionId: QuickMenuActionId, slot: QuickMenuSlot) => void;
  readonly onSlotsChange?: (nextSlots: readonly QuickMenuSlot[]) => void;
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
 * 184×184px 동심원 6섹터 방사형 퀵 휠 (T2 QuickMenu).
 * Q키·우클릭 홀드 드래그(24px 데드존)·숫자 1~6·방향키·Esc 실행과 6슬롯 커스텀 편집·저장을 지원한다.
 */
export function StudioRadialQuickWheel({
  open,
  anchor,
  slots,
  onSelectAction,
  onSlotsChange,
  onClose,
}: StudioRadialQuickWheelProps) {
  const bt = useBilingual("StudioRadialQuickWheel");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [flickOrigin, setFlickOrigin] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [editingSlots, setEditingSlots] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<QuickMenuSlot["index"]>(0);
  const [uncontrolledSlots, setUncontrolledSlots] = useState<readonly QuickMenuSlot[]>(
    () => slots ?? DEFAULT_QUICK_MENU_SLOTS,
  );

  const effectiveSlots = (slots ?? uncontrolledSlots).slice(0, 6);
  const clamped = clampAnchor(anchor);

  useEffect(() => {
    if (!open) {
      setActiveIndex(null);
      setFlickOrigin(null);
      setEditingSlots(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editingSlots) {
          setEditingSlots(false);
          return;
        }
        onClose();
        return;
      }
      if (editingSlots) return;
      if (/^[1-6]$/u.test(event.key)) {
        const idx = Number(event.key) - 1;
        const picked = effectiveSlots[idx];
        if (picked) {
          event.preventDefault();
          onSelectAction(picked.actionId, picked);
          onClose();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % effectiveSlots.length));
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) =>
          prev === null ? effectiveSlots.length - 1 : (prev - 1 + effectiveSlots.length) % effectiveSlots.length,
        );
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && activeIndex !== null) {
        const picked = effectiveSlots[activeIndex];
        if (picked) {
          event.preventDefault();
          onSelectAction(picked.actionId, picked);
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, editingSlots, effectiveSlots, onClose, onSelectAction, open]);

  if (!open) return null;

  const activeSlot = activeIndex !== null ? effectiveSlots[activeIndex] ?? null : null;
  const editingSlot = effectiveSlots[editingSlotIndex] ?? effectiveSlots[0]!;

  const commitSlotUpdate = (nextSlots: readonly QuickMenuSlot[]) => {
    setUncontrolledSlots(nextSlots);
    saveQuickMenuSlots(nextSlots);
    onSlotsChange?.(nextSlots);
  };

  const handleAssignSlotAction = (actionId: QuickMenuActionId) => {
    const nextSlots = assignQuickMenuSlot(effectiveSlots, editingSlotIndex, actionId);
    commitSlotUpdate(nextSlots);
  };

  const handleWheelPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (editingSlots) return;
    if (event.target instanceof Element && event.target.closest("[data-studio-radial-edit-panel]")) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setFlickOrigin({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const handleWheelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (editingSlots) return;
    const origin = flickOrigin ?? clamped;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const resolved = resolveQuickMenuSlotFromDrag(effectiveSlots, dx, dy, DEADZONE_PX);
    setActiveIndex(resolved ? resolved.index : null);
  };

  const handleWheelPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (editingSlots || !flickOrigin) return;
    const dx = event.clientX - flickOrigin.x;
    const dy = event.clientY - flickOrigin.y;
    const resolved = resolveQuickMenuSlotFromDrag(effectiveSlots, dx, dy, DEADZONE_PX);
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
        data-editing-slots={editingSlots ? "true" : "false"}
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
          {effectiveSlots.map((slot, index) => {
            const highlighted = editingSlots
              ? editingSlotIndex === index
              : activeIndex === index;
            return (
              <path
                key={`${slot.index}-${slot.actionId}`}
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

        {effectiveSlots.map((slot, index) => {
          const Icon = ACTION_ICONS[slot.actionId];
          const pos = polarSectorPosition(index);
          const highlighted = editingSlots
            ? editingSlotIndex === index
            : activeIndex === index;
          return (
            <button
              key={`${slot.index}-${slot.actionId}`}
              type="button"
              role="menuitem"
              data-studio-radial-slot={slot.actionId}
              data-slot-index={slot.index}
              aria-label={`${index + 1}. ${slot.labelKo}`}
              title={`${slot.labelKo} (${index + 1})`}
              onMouseEnter={() => {
                if (!editingSlots) setActiveIndex(index);
              }}
              onFocus={() => {
                if (!editingSlots) setActiveIndex(index);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (editingSlots) {
                  setEditingSlotIndex(slot.index);
                  return;
                }
                onSelectAction(slot.actionId, slot);
                onClose();
              }}
              style={{
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                transitionDelay: `${index * 24}ms`,
              }}
              className={cn(
                "absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-fg transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.94] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:transform-none",
                highlighted
                  ? "scale-105 border-accent bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-2))] text-on-accent shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-accent)_26%,transparent)]"
                  : "border-transparent bg-transparent text-fg-2 hover:scale-105 hover:text-fg",
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

        <div className="absolute -bottom-11 left-1/2 flex w-max -translate-x-1/2 items-center gap-1.5">
          <div
            aria-live="polite"
            className="pointer-events-none max-w-48 rounded-lg border border-line-strong bg-panel/95 px-2.5 py-1 text-center text-xs font-semibold text-fg shadow-[var(--atelier-elevation-dock)] break-keep"
          >
            {editingSlots
              ? bt(
                  `슬롯 ${editingSlotIndex + 1} 편집 · ${editingSlot.labelKo}`,
                  `Edit slot ${editingSlotIndex + 1} · ${editingSlot.labelKo}`,
                )
              : activeSlot
                ? `${activeSlot.index + 1} · ${activeSlot.labelKo}`
                : bt("1~6 키 · 드래그로 실행 · Esc 닫기", "Press 1–6 or drag · Esc to close")}
          </div>
          <button
            type="button"
            data-studio-radial-edit-toggle="true"
            aria-pressed={editingSlots}
            aria-label={editingSlots ? bt("슬롯 편집 완료", "Done editing slots") : bt("슬롯 편집", "Customize slots")}
            onClick={(event) => {
              event.stopPropagation();
              setEditingSlots((prev) => !prev);
            }}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold shadow-[var(--atelier-elevation-dock)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              editingSlots
                ? "border-accent bg-accent text-on-accent"
                : "border-line-strong bg-panel/95 text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {editingSlots ? <Check size={13} aria-hidden="true" /> : <SlidersHorizontal size={13} aria-hidden="true" />}
            <span>{editingSlots ? bt("완료", "Done") : bt("슬롯 편집", "Customize")}</span>
          </button>
        </div>

        {editingSlots ? (
          <div
            role="region"
            aria-label={bt("빠른 메뉴 6슬롯 편집", "Customize 6 QuickMenu slots")}
            data-studio-radial-edit-panel="true"
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute left-1/2 top-[calc(100%+3.25rem)] z-20 w-72 -translate-x-1/2 rounded-2xl border border-line-strong bg-panel p-3 text-fg shadow-[var(--atelier-elevation-floating)] break-keep"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2">
              <span className="text-xs font-bold text-fg">
                {bt(`슬롯 ${editingSlotIndex + 1} 동작 선택`, `Assign slot ${editingSlotIndex + 1}`)}
              </span>
              <button
                type="button"
                data-studio-radial-reset-slots="true"
                onClick={() => commitSlotUpdate(DEFAULT_QUICK_MENU_SLOTS)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.7rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg"
              >
                <RotateCcw size={12} aria-hidden="true" />
                {bt("기본값", "Reset")}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5" role="group" aria-label={bt("할당할 동작 목록", "Available actions")}>
              {ALL_QUICK_MENU_ACTION_IDS.map((actionId) => {
                const Icon = ACTION_ICONS[actionId];
                const assigned = editingSlot.actionId === actionId;
                return (
                  <button
                    key={actionId}
                    type="button"
                    data-studio-radial-assign-action={actionId}
                    aria-pressed={assigned}
                    onClick={() => handleAssignSlotAction(actionId)}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 rounded-xl border px-2 text-left text-[0.72rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      assigned
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    <Icon size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{QUICK_MENU_ACTION_LABELS_KO[actionId]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
