import {
  DEFAULT_QUICK_MENU_SLOTS,
  QUICK_MENU_ACTION_LABELS_KO,
  resolveQuickMenuSlotFromDrag,
  type QuickMenuActionId,
  type QuickMenuSlot,
} from "../drawing/studio-quickmenu-and-quickshape";
import type { PressureCurvePresetId } from "../drawing/studio-pressure-curve-and-colordrop";
import type { StudioPressureCurvePreset } from "./studio-live-stroke-foley-bridge";

export type StudioDrawingErgonomicsSymmetryType =
  | "none"
  | "vertical"
  | "horizontal"
  | "radial"
  | "kaleidoscope"
  | "silk";

export type StudioDrawingHandedness = "right" | "left";

export type StudioJewelQuickCategory =
  | "history"
  | "transform"
  | "layer"
  | "color"
  | "view";

export interface StudioRadialQuickWheelSlot {
  readonly index: number;
  readonly actionId: QuickMenuActionId;
  readonly labelKo: string;
}

export const SYMMETRY_CYCLE_ORDER: readonly StudioDrawingErgonomicsSymmetryType[] = [
  "none",
  "vertical",
  "horizontal",
  "radial",
  "kaleidoscope",
  "silk",
];

export const PRESSURE_PRESET_CYCLE_ORDER: readonly PressureCurvePresetId[] = [
  "linear",
  "soft-ink",
  "firm-gpen",
  "expressive-brush",
];

/** 8방향 주얼 방사형 퀵 휠 기본 슬롯(기존 6슬롯 + 스포이드·다시 실행 확장). */
export const DEFAULT_JEWEL_8_WHEEL_SLOTS: readonly StudioRadialQuickWheelSlot[] = Object.freeze([
  ...DEFAULT_QUICK_MENU_SLOTS,
  { index: 6, actionId: "eyedropper", labelKo: QUICK_MENU_ACTION_LABELS_KO.eyedropper },
  { index: 7, actionId: "redo", labelKo: QUICK_MENU_ACTION_LABELS_KO.redo },
]);

const QUICK_ACTION_JEWEL_CATEGORY_MAP: Readonly<Record<QuickMenuActionId, StudioJewelQuickCategory>> = {
  undo: "history",
  redo: "history",
  "flip-canvas-h": "transform",
  "toggle-alpha-lock": "layer",
  "toggle-clipping-mask": "layer",
  "merge-down": "layer",
  "clear-layer": "layer",
  "colordrop-fill": "color",
  eyedropper: "color",
  "fit-canvas": "view",
};

export function resolveJewelCategoryForQuickAction(
  actionId: QuickMenuActionId,
): StudioJewelQuickCategory {
  return QUICK_ACTION_JEWEL_CATEGORY_MAP[actionId] ?? "view";
}

/** 6슬롯 구성을 손실 없이 8슬롯 주얼 방사형 휠로 확장한다. */
export function expandSlotsToJewelEight(
  slots: readonly StudioRadialQuickWheelSlot[],
): readonly StudioRadialQuickWheelSlot[] {
  if (slots.length >= 8) {
    return slots.slice(0, 8).map((slot, index) => ({ ...slot, index }));
  }
  const normalized = slots.map((slot, index) => ({ ...slot, index }));
  const usedActions = new Set<QuickMenuActionId>(normalized.map((slot) => slot.actionId));
  const fallbackPool: readonly QuickMenuActionId[] = [
    "eyedropper",
    "redo",
    "merge-down",
    "clear-layer",
    "undo",
    "flip-canvas-h",
    "colordrop-fill",
    "fit-canvas",
  ];
  for (const actionId of fallbackPool) {
    if (normalized.length >= 8) break;
    if (usedActions.has(actionId)) continue;
    usedActions.add(actionId);
    normalized.push({
      index: normalized.length,
      actionId,
      labelKo: QUICK_MENU_ACTION_LABELS_KO[actionId],
    });
  }
  return Object.freeze(normalized);
}

/** 6슬롯 또는 8슬롯 휠의 중심 기준 드래그 벡터(dx, dy)에서 대상 슬롯을 판정한다. */
export function resolveRadialWheelSlotFromDrag(
  slots: readonly StudioRadialQuickWheelSlot[],
  dx: number,
  dy: number,
  deadzonePx = 24,
): StudioRadialQuickWheelSlot | null {
  if (slots.length === 6) {
    return resolveQuickMenuSlotFromDrag(slots as readonly QuickMenuSlot[], dx, dy, deadzonePx);
  }
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < deadzonePx || slots.length === 0) {
    return null;
  }
  const stepDeg = 360 / slots.length;
  const rawDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const normalizedDeg = (rawDeg + 360) % 360;
  const sector = Math.floor(((normalizedDeg + stepDeg / 2) % 360) / stepDeg) % slots.length;
  return slots[sector] ?? null;
}

export function resolveNextPressurePreset(current: PressureCurvePresetId): PressureCurvePresetId {
  const index = PRESSURE_PRESET_CYCLE_ORDER.indexOf(current);
  if (index < 0) return "soft-ink";
  return PRESSURE_PRESET_CYCLE_ORDER[(index + 1) % PRESSURE_PRESET_CYCLE_ORDER.length] ?? "linear";
}

/** 베지어 필압 곡선 프리셋을 라이브 Foley·포인터 감마 필압 프리셋(standard/soft/firm)으로 매핑한다. */
export function mapPressurePresetToFoleyCurve(
  preset: PressureCurvePresetId | "soft" | "hard" | "s-curve",
): StudioPressureCurvePreset {
  if (preset === "soft-ink" || preset === "soft") return "soft";
  if (
    preset === "firm-gpen" ||
    preset === "expressive-brush" ||
    preset === "hard" ||
    preset === "s-curve"
  ) {
    return "firm";
  }
  return "standard";
}

export function formatPressurePresetLabel(
  preset: PressureCurvePresetId,
  bt: (ko: string, en: string) => string,
): string {
  if (preset === "soft-ink") return bt("필압 부드러움", "Pressure soft");
  if (preset === "firm-gpen") return bt("필압 단단한 G펜", "Pressure firm G-Pen");
  if (preset === "expressive-brush") return bt("필압 강약 강조", "Pressure expressive");
  return bt("필압 표준", "Pressure linear");
}

export function resolveNextSymmetryMode(current: string | undefined): StudioDrawingErgonomicsSymmetryType {
  if (!current || current === "off" || current === "none") {
    return "vertical";
  }
  const index = SYMMETRY_CYCLE_ORDER.indexOf(current as StudioDrawingErgonomicsSymmetryType);
  if (index < 0) {
    return "none";
  }
  return SYMMETRY_CYCLE_ORDER[(index + 1) % SYMMETRY_CYCLE_ORDER.length] ?? "none";
}

export function stepBrushWidth(current: number, direction: -1 | 1): number {
  const rounded = Math.max(1, Math.round(Number.isFinite(current) ? current : 4));
  const delta = rounded >= 24 ? 6 : rounded >= 10 ? 3 : rounded >= 4 ? 2 : 1;
  return Math.max(1, Math.min(200, rounded + direction * delta));
}

/** 마우스 휠 스크롤(위로 올리면 증가, 아래로 내리면 감소)로 브러시 두께를 즉시 조절한다. */
export function stepBrushWidthFromWheel(
  current: number,
  deltaY: number,
  shiftKey = false,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return Math.max(1, Math.min(200, Math.round(Number.isFinite(current) ? current : 4)));
  }
  const direction: -1 | 1 = deltaY < 0 ? 1 : -1;
  const firstStep = stepBrushWidth(current, direction);
  return shiftKey ? stepBrushWidth(firstStep, direction) : firstStep;
}

export function formatStabilizerLabel(
  value: number,
  bt: (ko: string, en: string) => string,
): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (safe <= 0) return bt("보정 꺼짐", "Stabilizer off");
  if (safe === 1) return bt("보정 약함", "Stabilizer low");
  if (safe === 2) return bt("보정 표준", "Stabilizer std");
  return bt("보정 강함", "Stabilizer high");
}

export interface StudioAuxiliaryToolsCountInput {
  readonly stabilizer: number;
  readonly pressurePreset: PressureCurvePresetId;
  readonly quickShapeEnabled: boolean;
  readonly sizeLocked: boolean;
  readonly canvasFlipH: boolean;
  readonly symmetryType?: string;
  readonly perspectiveRulerActive?: boolean;
  readonly showWebtoonGuides: boolean;
}

/** 현재 켜진 드로잉 보조 도구 수를 집계한다. */
export function countActiveAuxiliaryTools(input: StudioAuxiliaryToolsCountInput): number {
  const symmetryActive =
    typeof input.symmetryType === "string" &&
    input.symmetryType !== "off" &&
    input.symmetryType !== "none";
  return (
    (input.stabilizer > 0 ? 1 : 0) +
    (input.pressurePreset !== "linear" ? 1 : 0) +
    (input.quickShapeEnabled ? 1 : 0) +
    (input.sizeLocked ? 1 : 0) +
    (input.canvasFlipH ? 1 : 0) +
    (symmetryActive ? 1 : 0) +
    (input.perspectiveRulerActive ? 1 : 0) +
    (input.showWebtoonGuides ? 1 : 0)
  );
}

export function toggleDrawingHandedness(
  current: StudioDrawingHandedness,
): StudioDrawingHandedness {
  return current === "left" ? "right" : "left";
}

function resolveStudioAppShell(shell?: HTMLElement | null): HTMLElement | null {
  if (shell) return shell;
  if (typeof document === "undefined") return null;
  return document.getElementById("studio-app-shell");
}

export function readStudioShellHandedness(shell?: HTMLElement | null): StudioDrawingHandedness {
  const target = resolveStudioAppShell(shell);
  const attr = target?.getAttribute("data-studio-handedness");
  return attr === "left" || attr === "left-handed" ? "left" : "right";
}

export function syncStudioShellHandedness(
  handedness: StudioDrawingHandedness,
  shell?: HTMLElement | null,
): void {
  const target = resolveStudioAppShell(shell);
  if (!target) return;
  target.setAttribute("data-studio-handedness", handedness);
}

export function syncStudioShellZenFocus(
  zenActive: boolean,
  shell?: HTMLElement | null,
): void {
  const target = resolveStudioAppShell(shell);
  if (!target) return;
  if (zenActive) {
    target.setAttribute("data-studio-zen-focus", "true");
  } else {
    target.removeAttribute("data-studio-zen-focus");
  }
}
