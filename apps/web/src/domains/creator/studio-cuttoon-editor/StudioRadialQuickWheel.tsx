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
import { useEffect, useState, type PointerEvent, type WheelEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  STUDIO_Z_LAYERS,
  resolveSafePopoverAnchor,
} from "../canvas-chrome/studio-hud-collision-guard";
import { resolveVibrantSpriteForQuickAction } from "../canvas-chrome/studio-vibrant-sprite-catalog";
import { StudioVibrantToolArtwork } from "../canvas-chrome/StudioVibrantToolArtwork";
import {
  assignQuickMenuSlot,
  DEFAULT_QUICK_MENU_SLOTS,
  QUICK_MENU_ACTION_LABELS_KO,
  type QuickMenuActionId,
  type QuickMenuSlot,
} from "../drawing/studio-quickmenu-and-quickshape";
import {
  ALL_QUICK_MENU_ACTION_IDS,
  saveQuickMenuSlots,
} from "../drawing/studio-quickmenu-preferences";
import {
  DEFAULT_JEWEL_8_WHEEL_SLOTS,
  expandSlotsToJewelEight,
  resolveJewelCategoryForQuickAction,
  resolveRadialWheelSlotFromDrag,
  type StudioRadialQuickWheelSlot,
} from "./studio-drawing-ergonomics-presets";

import "./StudioDrawingJewelChrome.css";

export interface StudioRadialQuickWheelProps {
  readonly open: boolean;
  readonly anchor?: { readonly x: number; readonly y: number } | null;
  readonly slots?: readonly StudioRadialQuickWheelSlot[];
  readonly slotCount?: 6 | 8;
  readonly activeToolLabel?: string;
  readonly strokeWidth?: number;
  readonly shortcutHint?: string;
  readonly onSelectAction: (actionId: QuickMenuActionId, slot: StudioRadialQuickWheelSlot) => void;
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

function polarSectorPosition(
  index: number,
  total: number,
  wheelCenter: number,
  sectorRadius: number,
): { readonly left: number; readonly top: number } {
  const stepDeg = 360 / Math.max(1, total);
  const angleRad = ((index * stepDeg - 90) * Math.PI) / 180;
  return {
    left: Math.round(wheelCenter + Math.cos(angleRad) * sectorRadius),
    top: Math.round(wheelCenter + Math.sin(angleRad) * sectorRadius),
  };
}

function clampAnchor(
  anchor: { readonly x: number; readonly y: number } | null | undefined,
  wheelSize: number,
): {
  readonly x: number;
  readonly y: number;
  readonly wheelScale: number;
  readonly zIndex: number;
} {
  const vw = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 800;
  // 220px 워치·320px 초소형 모바일에서도 휠·하단 상태바가 잘리지 않도록 반경을 안전하게 축소·클램프한다.
  const wheelScale = vw < 360 ? Math.max(0.76, (vw - 24) / (wheelSize + 24)) : 1;
  const effectiveSize = Math.ceil(wheelSize * wheelScale);
  const fallbackX = Math.round(vw / 2);
  const fallbackY = Math.round(vh / 2);
  const rawX = anchor && Number.isFinite(anchor.x) ? anchor.x : fallbackX;
  const rawY = anchor && Number.isFinite(anchor.y) ? anchor.y : fallbackY;
  const safe = resolveSafePopoverAnchor({
    triggerRect: { x: rawX, y: rawY, width: 1, height: 1 },
    popoverSize: { width: effectiveSize + 24, height: effectiveSize + 48 },
    viewport: { widthPx: vw, heightPx: vh },
    preferredSide: "center",
    zLayer: "radialQuickWheel",
  });
  return {
    x: Math.round(safe.left + safe.width / 2),
    y: Math.round(safe.top + safe.height / 2),
    wheelScale,
    zIndex: safe.zIndex,
  };
}

function sectorWedgePath(
  index: number,
  total: number,
  wheelCenter: number,
  deadzonePx: number,
): string {
  const stepDeg = 360 / Math.max(1, total);
  const startDeg = index * stepDeg - 90 - stepDeg / 2;
  const endDeg = startDeg + stepDeg;
  const rInner = deadzonePx + 2;
  const rOuter = wheelCenter - 4;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = wheelCenter + rOuter * Math.cos(toRad(startDeg));
  const y1 = wheelCenter + rOuter * Math.sin(toRad(startDeg));
  const x2 = wheelCenter + rOuter * Math.cos(toRad(endDeg));
  const y2 = wheelCenter + rOuter * Math.sin(toRad(endDeg));
  const x3 = wheelCenter + rInner * Math.cos(toRad(endDeg));
  const y3 = wheelCenter + rInner * Math.sin(toRad(endDeg));
  const x4 = wheelCenter + rInner * Math.cos(toRad(startDeg));
  const y4 = wheelCenter + rInner * Math.sin(toRad(startDeg));
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOuter} ${rOuter} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${rInner} ${rInner} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
}

/**
 * 동심원 6/8섹터 주얼 방사형 퀵 휠 (T2 QuickMenu + Wave 13 Jewel Upgrade).
 * Q키·우클릭 홀드 드래그·숫자 1~8·마우스 휠 슬롯 회전·방향키·Esc 실행과 커스텀 슬롯 편집을 지원한다.
 */
export function StudioRadialQuickWheel({
  open,
  anchor,
  slots,
  slotCount,
  activeToolLabel,
  strokeWidth,
  shortcutHint = "Q",
  onSelectAction,
  onSlotsChange,
  onClose,
}: StudioRadialQuickWheelProps) {
  const bt = useBilingual("StudioRadialQuickWheel");
  const isEightSlot = slotCount === 8 || (slots !== undefined && slots.length > 6);
  const wheelSize = isEightSlot ? 224 : 184;
  const wheelCenter = wheelSize / 2;
  const sectorRadius = isEightSlot ? 80 : 64;
  const deadzonePx = isEightSlot ? 34 : 24;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [flickOrigin, setFlickOrigin] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [editingSlots, setEditingSlots] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number>(0);
  const [bloomed, setBloomed] = useState(false);

  useEffect(() => {
    if (!open) {
      setBloomed(false);
      return;
    }
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => setBloomed(true))
        : globalThis.setTimeout(() => setBloomed(true), 0);
    return () => {
      if (typeof cancelAnimationFrame === "function" && typeof raf === "number") {
        cancelAnimationFrame(raf);
      }
    };
  }, [open]);

  const [uncontrolledSlots, setUncontrolledSlots] = useState<readonly StudioRadialQuickWheelSlot[]>(
    () => {
      if (slots) {
        return isEightSlot ? expandSlotsToJewelEight(slots) : slots.slice(0, 6);
      }
      return isEightSlot ? DEFAULT_JEWEL_8_WHEEL_SLOTS : DEFAULT_QUICK_MENU_SLOTS;
    },
  );

  const effectiveSlots: readonly StudioRadialQuickWheelSlot[] = slots
    ? isEightSlot
      ? expandSlotsToJewelEight(slots)
      : slots.slice(0, 6)
    : isEightSlot
      ? expandSlotsToJewelEight(uncontrolledSlots)
      : uncontrolledSlots.slice(0, 6);

  const totalSlots = effectiveSlots.length;
  const clamped = clampAnchor(anchor, wheelSize);
  const roundedStrokeWidth =
    typeof strokeWidth === "number" && Number.isFinite(strokeWidth)
      ? Math.max(1, Math.round(strokeWidth))
      : null;

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
      if (/^[1-8]$/u.test(event.key)) {
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
          prev === null
            ? effectiveSlots.length - 1
            : (prev - 1 + effectiveSlots.length) % effectiveSlots.length,
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

  const commitSlotUpdate = (nextSlots: readonly StudioRadialQuickWheelSlot[]) => {
    setUncontrolledSlots(nextSlots);
    const persistedSix = nextSlots.slice(0, 6).map((slot, index) => ({
      index: index as QuickMenuSlot["index"],
      actionId: slot.actionId,
      labelKo: slot.labelKo,
    }));
    saveQuickMenuSlots(persistedSix);
    onSlotsChange?.(persistedSix);
  };

  const handleAssignSlotAction = (actionId: QuickMenuActionId) => {
    if (editingSlotIndex < 6 && !isEightSlot) {
      const nextSlots = assignQuickMenuSlot(
        effectiveSlots as readonly QuickMenuSlot[],
        editingSlotIndex as QuickMenuSlot["index"],
        actionId,
      );
      commitSlotUpdate(nextSlots);
      return;
    }
    const nextSlots = effectiveSlots.map((slot, idx) =>
      idx === editingSlotIndex
        ? { index: idx, actionId, labelKo: QUICK_MENU_ACTION_LABELS_KO[actionId] }
        : slot,
    );
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
    const resolved = resolveRadialWheelSlotFromDrag(effectiveSlots, dx, dy, deadzonePx);
    setActiveIndex(resolved ? resolved.index : null);
  };

  const handleWheelPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (editingSlots || !flickOrigin) return;
    const dx = event.clientX - flickOrigin.x;
    const dy = event.clientY - flickOrigin.y;
    const resolved = resolveRadialWheelSlotFromDrag(effectiveSlots, dx, dy, deadzonePx);
    setFlickOrigin(null);
    if (resolved) {
      onSelectAction(resolved.actionId, resolved);
      onClose();
    }
  };

  const handleWheelRotate = (event: WheelEvent<HTMLDivElement>) => {
    if (editingSlots || event.deltaY === 0 || effectiveSlots.length === 0) return;
    event.preventDefault();
    const step = event.deltaY > 0 ? 1 : -1;
    setActiveIndex((prev) => {
      if (prev === null) {
        return step > 0 ? 0 : effectiveSlots.length - 1;
      }
      return (prev + step + effectiveSlots.length) % effectiveSlots.length;
    });
  };

  const centerToolText = activeToolLabel?.trim() || bt("펜", "Pen");
  const centerReadoutSummary =
    roundedStrokeWidth !== null
      ? `${centerToolText} · ${roundedStrokeWidth}px · ${shortcutHint}`
      : `${centerToolText} · ${shortcutHint}`;

  return (
    <div
      data-studio-radial-quick-wheel-backdrop="true"
      data-studio-z-layer={STUDIO_Z_LAYERS.radialQuickWheel}
      style={{ zIndex: clamped.zIndex }}
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
        data-studio-radial-slot-count={totalSlots}
        data-active-slot={activeSlot ? activeSlot.actionId : ""}
        data-editing-slots={editingSlots ? "true" : "false"}
        data-hud-collision-free="true"
        onPointerDown={handleWheelPointerDown}
        onPointerMove={handleWheelPointerMove}
        onPointerUp={handleWheelPointerUp}
        onWheel={handleWheelRotate}
        style={{
          left: `${clamped.x}px`,
          top: `${clamped.y}px`,
          width: `${wheelSize}px`,
          height: `${wheelSize}px`,
          transform: `translate(-50%, -50%) scale(${bloomed ? clamped.wheelScale : clamped.wheelScale * 0.9})`,
        }}
        className={cn(
          "studio-vibrant-surface studio-vibrant-keep-all fixed select-none rounded-full border border-line-strong bg-panel/95 shadow-[var(--atelier-elevation-floating)] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none",
          bloomed ? "opacity-100" : "opacity-0",
        )}
      >
        <svg
          width={wheelSize}
          height={wheelSize}
          viewBox={`0 0 ${wheelSize} ${wheelSize}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          {effectiveSlots.map((slot, index) => {
            const highlighted = editingSlots
              ? editingSlotIndex === index
              : activeIndex === index;
            const jewelCategory = resolveJewelCategoryForQuickAction(slot.actionId);
            return (
              <path
                key={`${slot.index}-${slot.actionId}`}
                d={sectorWedgePath(index, totalSlots, wheelCenter, deadzonePx)}
                data-jewel-category={jewelCategory}
                data-jewel-highlighted={highlighted ? "true" : "false"}
                className={cn(
                  "studio-jewel-wheel-wedge stroke-line transition-colors duration-100 motion-reduce:transition-none",
                  highlighted ? "fill-accent-soft stroke-accent" : "fill-transparent",
                )}
                strokeWidth={highlighted ? 1.5 : 1}
              />
            );
          })}
          <circle
            cx={wheelCenter}
            cy={wheelCenter}
            r={deadzonePx}
            className="fill-card stroke-line-strong"
            strokeWidth={1}
          />
        </svg>

        {effectiveSlots.map((slot, index) => {
          const Icon = ACTION_ICONS[slot.actionId];
          const sprite = resolveVibrantSpriteForQuickAction(slot.actionId);
          const jewelCategory = resolveJewelCategoryForQuickAction(slot.actionId);
          const pos = polarSectorPosition(index, totalSlots, wheelCenter, sectorRadius);
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
              data-jewel-category={jewelCategory}
              data-vibrant-accent={sprite.accent}
              data-vibrant-active={highlighted ? "true" : "false"}
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
                  setEditingSlotIndex(index);
                  return;
                }
                onSelectAction(slot.actionId, slot);
                onClose();
              }}
              style={{
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                transitionDelay: `${index * 20}ms`,
              }}
              className={cn(
                "studio-jewel-wheel-slot studio-vibrant-touch-target studio-vibrant-ink-bloom studio-vibrant-press absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-fg transition-[transform,opacity,background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.94] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:transform-none",
                !bloomed && "scale-75 opacity-0",
                bloomed && (highlighted
                  ? "scale-105 opacity-100 border-accent text-on-accent"
                  : "scale-100 opacity-100 border-transparent bg-transparent text-fg-2 hover:border-line-strong hover:bg-raised/70 hover:text-fg"),
              )}
            >
              <StudioVibrantToolArtwork
                spriteId={sprite.spriteId}
                accent={sprite.accent}
                size={22}
                active={highlighted}
                fallback={<Icon size={16} strokeWidth={1.7} aria-hidden="true" />}
              />
              <span className="sr-only">{slot.labelKo}</span>
            </button>
          );
        })}

        {/* 중앙 주얼 허브: 현재 활성 도구·굵기·단축키 힌트 및 44×44 닫기 */}
        <button
          type="button"
          data-studio-radial-center-hud="true"
          aria-label={bt("방사형 휠 닫기", "Close radial wheel")}
          title={`${centerReadoutSummary} · ${bt("클릭해 휠 닫기 (Esc)", "Click to close (Esc)")}`}
          onClick={onClose}
          className={cn(
            "studio-jewel-wheel-center-hud studio-vibrant-touch-target studio-vibrant-press absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center text-fg transition-colors duration-100 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none",
            isEightSlot ? "size-16 px-1" : "size-11",
          )}
        >
          {activeToolLabel || roundedStrokeWidth !== null ? (
            <>
              <span
                data-studio-radial-center-tool="true"
                className="max-w-full truncate text-xs font-semibold leading-tight text-fg"
              >
                {centerToolText}
              </span>
              <span
                data-studio-radial-center-meta="true"
                className="studio-vibrant-tabular max-w-full truncate text-xs leading-tight text-fg-2"
              >
                {roundedStrokeWidth !== null ? `${roundedStrokeWidth}px · ${shortcutHint}` : shortcutHint}
              </span>
            </>
          ) : (
            <>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">{centerReadoutSummary}</span>
            </>
          )}
        </button>

        <div className="absolute -bottom-12 left-1/2 flex max-w-[calc(100vw-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5">
          <div
            aria-live="polite"
            className="studio-vibrant-tabular pointer-events-none max-w-[min(14rem,calc(100vw-8.5rem))] truncate rounded-lg border border-line-strong bg-panel/95 px-2.5 py-1 text-center text-xs font-semibold tabular-nums text-fg shadow-[var(--atelier-elevation-dock)] break-keep"
          >
            {editingSlots
              ? bt(
                  `슬롯 ${editingSlotIndex + 1} 편집 · ${editingSlot.labelKo}`,
                  `Edit slot ${editingSlotIndex + 1} · ${editingSlot.labelKo}`,
                )
              : activeSlot
                ? `${activeSlot.index + 1} · ${activeSlot.labelKo}`
                : bt(
                    `1~${totalSlots} 키 · 휠 회전 · ${shortcutHint} · Esc`,
                    `1–${totalSlots} keys · Wheel · ${shortcutHint} · Esc`,
                  )}
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
              "studio-vibrant-touch-target studio-vibrant-press inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold shadow-[var(--atelier-elevation-dock)] transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:transform-none [word-break:keep-all]",
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
            aria-label={bt(`빠른 메뉴 ${totalSlots}슬롯 편집`, `Customize ${totalSlots} QuickMenu slots`)}
            data-studio-radial-edit-panel="true"
            onPointerDown={(event) => event.stopPropagation()}
            className="studio-vibrant-surface studio-vibrant-keep-all absolute left-1/2 top-[calc(100%+3.5rem)] z-20 w-[min(18rem,calc(100vw-16px))] -translate-x-1/2 rounded-2xl border border-line-strong bg-panel p-3 text-fg shadow-[var(--atelier-elevation-floating)] break-keep"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2">
              <span className="text-xs font-bold tabular-nums text-fg">
                {bt(`슬롯 ${editingSlotIndex + 1} 동작 선택`, `Assign slot ${editingSlotIndex + 1}`)}
              </span>
              <button
                type="button"
                data-studio-radial-reset-slots="true"
                onClick={() =>
                  commitSlotUpdate(isEightSlot ? DEFAULT_JEWEL_8_WHEEL_SLOTS : DEFAULT_QUICK_MENU_SLOTS)
                }
                className="studio-vibrant-touch-target studio-vibrant-press inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-[transform,background-color] duration-150 hover:bg-raised hover:text-fg active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none [word-break:keep-all]"
              >
                <RotateCcw size={12} aria-hidden="true" />
                {bt("기본값", "Reset")}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5" role="group" aria-label={bt("할당할 동작 목록", "Available actions")}>
              {ALL_QUICK_MENU_ACTION_IDS.map((actionId) => {
                const Icon = ACTION_ICONS[actionId];
                const sprite = resolveVibrantSpriteForQuickAction(actionId);
                const assigned = editingSlot.actionId === actionId;
                return (
                  <button
                    key={actionId}
                    type="button"
                    data-studio-radial-assign-action={actionId}
                    data-vibrant-accent={sprite.accent}
                    data-vibrant-active={assigned ? "true" : "false"}
                    aria-pressed={assigned}
                    onClick={() => handleAssignSlotAction(actionId)}
                    className={cn(
                      "studio-vibrant-touch-target studio-vibrant-ink-bloom studio-vibrant-press flex min-h-11 items-center gap-1.5 rounded-xl border px-2 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                      assigned
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    <StudioVibrantToolArtwork
                      spriteId={sprite.spriteId}
                      accent={sprite.accent}
                      size={18}
                      active={assigned}
                      fallback={<Icon size={13} className="shrink-0" aria-hidden="true" />}
                    />
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
