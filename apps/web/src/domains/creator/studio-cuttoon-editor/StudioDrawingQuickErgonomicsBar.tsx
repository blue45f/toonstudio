import { studioEraserDisplayName } from "../brush/studio-eraser-presets";
import {
  PRESSURE_CURVE_PRESETS,
  type PressureCurveControlPoints,
  type PressureCurvePresetId,
} from "../drawing/studio-pressure-curve-and-colordrop";
import {
  DEFAULT_QUICK_MENU_SLOTS,
  type QuickMenuActionId,
  type QuickMenuSlot,
} from "../drawing/studio-quickmenu-and-quickshape";
import { Columns2, Compass, FlipHorizontal2, Gauge, Lock, Magnet, Minus, Plus, Shapes, SlidersHorizontal, Unlock } from "lucide-react";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { normalizeHexColor } from "../studio-color-utils";
import { cycleStudioStabilizerStrength } from "../studio-pro-draw-prefs";
import { drawingCommandShortcut, type DrawingCommandSettings } from "./studio-drawing-command-shortcut";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import type { StudioContextMiniDockMode } from "./StudioContextMiniDock";
import type { StudioShortcutHudCue } from "./StudioVisualShortcutHud";

const LazyStudioRadialQuickWheel = lazyRetry(
  () => import("./StudioRadialQuickWheel").then((module) => ({ default: module.StudioRadialQuickWheel })),
  "StudioRadialQuickWheel",
);
const LazyStudioContextMiniDock = lazyRetry(
  () => import("./StudioContextMiniDock").then((module) => ({ default: module.StudioContextMiniDock })),
  "StudioContextMiniDock",
);
const LazyStudioVisualShortcutHud = lazyRetry(
  () => import("./StudioVisualShortcutHud").then((module) => ({ default: module.StudioVisualShortcutHud })),
  "StudioVisualShortcutHud",
);

export type StudioDrawingErgonomicsSymmetryType =
  | "none"
  | "vertical"
  | "horizontal"
  | "radial"
  | "kaleidoscope"
  | "silk";

export type StudioDrawingErgonomicsSession = Pick<
  StudioCuttoonEditorViewSession,
  | "activeSurfaceReviewLocked"
  | "pageEditLocked"
  | "canvasInteractionBlocked"
  | "scopedCanvasDrawingAvailable"
  | "tool"
  | "drawMode"
  | "activatePrimaryCanvasTool"
  | "strokeWidth"
  | "setStrokeWidth"
  | "stabilizer"
  | "setStabilizer"
  | "showWebtoonGuides"
  | "setShowWebtoonGuides"
  | "effScale"
  | "setZoom"
  | "zoomLocked"
  | "viewTransformSuppressed"
  | "bg3dOpen"
  | "exportMenuOpen"
  | "setExportMenuOpen"
> & {
  readonly studioLeftToolRailHandlers: Pick<StudioCuttoonEditorViewSession["studioLeftToolRailHandlers"], "toggleBg3dEditor">;
  readonly appSettings?: DrawingCommandSettings;
  readonly brush?: string;
  readonly activeCatalogBrush?: {
    readonly id: string;
    readonly name: string;
  };
  readonly brushOpacity?: number;
  readonly brushCatalogSession?: {
    readonly placement: string;
  } | null;
  readonly color?: string;
  readonly setColor?: (hex: string) => void;
  readonly canvasFlipH?: boolean;
  readonly symmetryType?: string;
  readonly changeStudioSymmetryType?: (next: StudioDrawingErgonomicsSymmetryType) => void;
  readonly perspectiveRulerActive?: boolean;
  readonly setPerspectiveRulerActive?: (
    action: boolean | ((current: boolean) => boolean),
  ) => void;
  readonly vanishingPoints?: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly toggleCanvasFlipX?: () => void;
  readonly proDrawPrefs?: { readonly sizeLocked?: boolean };
  readonly studioBrushCatalogHandlers?: {
    readonly toggle?: (
      placement: "desktop-dock" | "mobile-sheet",
      trigger: HTMLButtonElement,
    ) => void;
  };
  readonly studioOptionsBarsHandlers?: {
    readonly toggleSizeLock?: () => void;
    readonly flipCanvasHorizontal?: () => void;
    readonly openBrushStudio?: (trigger?: HTMLElement | null) => void;
  };
  readonly studioToolBeltContentHandlers?: { readonly setActualPixelView?: () => void };
  readonly pressureCurvePreset?: PressureCurvePresetId;
  readonly onChangePressureCurvePreset?: (
    next: PressureCurvePresetId,
    curve: PressureCurveControlPoints,
  ) => void;
  readonly quickShapeSnapEnabled?: boolean;
  readonly onToggleQuickShapeSnap?: (next: boolean) => void;
  readonly quickMenuSlots?: readonly QuickMenuSlot[];
};

const SYMMETRY_CYCLE_ORDER: readonly StudioDrawingErgonomicsSymmetryType[] = [
  "none",
  "vertical",
  "horizontal",
  "radial",
  "kaleidoscope",
  "silk",
];

const PRESSURE_PRESET_CYCLE_ORDER: readonly PressureCurvePresetId[] = [
  "linear",
  "soft-ink",
  "firm-gpen",
  "expressive-brush",
];

function resolveNextPressurePreset(current: PressureCurvePresetId): PressureCurvePresetId {
  const index = PRESSURE_PRESET_CYCLE_ORDER.indexOf(current);
  if (index < 0) return "soft-ink";
  return PRESSURE_PRESET_CYCLE_ORDER[(index + 1) % PRESSURE_PRESET_CYCLE_ORDER.length] ?? "linear";
}

function formatPressurePresetLabel(
  preset: PressureCurvePresetId,
  bt: (ko: string, en: string) => string,
): string {
  if (preset === "soft-ink") return bt("필압 부드러움", "Pressure soft");
  if (preset === "firm-gpen") return bt("필압 단단한 G펜", "Pressure firm G-Pen");
  if (preset === "expressive-brush") return bt("필압 강약 강조", "Pressure expressive");
  return bt("필압 표준", "Pressure linear");
}

function resolveNextSymmetryMode(current: string | undefined): StudioDrawingErgonomicsSymmetryType {
  if (!current || current === "off" || current === "none") {
    return "vertical";
  }
  const index = SYMMETRY_CYCLE_ORDER.indexOf(current as StudioDrawingErgonomicsSymmetryType);
  if (index < 0) {
    return "none";
  }
  return SYMMETRY_CYCLE_ORDER[(index + 1) % SYMMETRY_CYCLE_ORDER.length] ?? "none";
}

function stepBrushWidth(current: number, direction: -1 | 1): number {
  const rounded = Math.max(1, Math.round(Number.isFinite(current) ? current : 4));
  const delta = rounded >= 24 ? 6 : rounded >= 10 ? 3 : rounded >= 4 ? 2 : 1;
  return Math.max(1, Math.min(200, rounded + direction * delta));
}

function formatStabilizerLabel(
  value: number,
  bt: (ko: string, en: string) => string,
): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (safe <= 0) return bt("보정 꺼짐", "Stabilizer off");
  if (safe === 1) return bt("보정 약함", "Stabilizer low");
  if (safe === 2) return bt("보정 표준", "Stabilizer std");
  return bt("보정 강함", "Stabilizer high");
}

/** 현재 브러시와 두께를 먼저 배치하고 제작 단계 바로가기는 같은 줄 끝에 둔다. */
export function StudioDrawingQuickErgonomicsBar({
  session: s,
}: {
  readonly session: StudioDrawingErgonomicsSession;
}) {
  const clarity = useStudioDrawingClarity();
  const bt = useBilingual("studio.drawingClarity");
  const [localPressurePreset, setLocalPressurePreset] = useState<PressureCurvePresetId>("linear");
  const [localQuickShapeEnabled, setLocalQuickShapeEnabled] = useState<boolean>(true);
  const [quickWheelOpen, setQuickWheelOpen] = useState(false);
  const [quickWheelAnchor, setQuickWheelAnchor] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [miniDockOpen, setMiniDockOpen] = useState(false);
  const [shortcutCue, setShortcutCue] = useState<StudioShortcutHudCue | null>(null);
  const quickWheelTriggerRef = useRef<HTMLButtonElement>(null);
  const miniDockTriggerRef = useRef<HTMLButtonElement>(null);
  const activePressurePreset = s.pressureCurvePreset ?? localPressurePreset;
  const activePressureCurve = PRESSURE_CURVE_PRESETS[activePressurePreset];
  const pressurePresetLabel = formatPressurePresetLabel(activePressurePreset, bt);
  const activeQuickShapeEnabled = s.quickShapeSnapEnabled ?? localQuickShapeEnabled;
  const activeQuickMenuSlots = s.quickMenuSlots ?? DEFAULT_QUICK_MENU_SLOTS;
  const activeQuickMenuCount = activeQuickMenuSlots.length;
  const pushCue = useCallback((keycap: string, label: string, value?: string) => {
    setShortcutCue({ id: Date.now() + Math.random(), keycap, label, value });
  }, []);
  const blocked =
    s.activeSurfaceReviewLocked ||
    s.pageEditLocked ||
    (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  const blockedReason = s.activeSurfaceReviewLocked
    ? bt("검수 잠금 상태에서는 그리기 옵션을 바꿀 수 없습니다", "Drawing options are locked during review")
    : s.pageEditLocked
      ? bt("현재 페이지 편집이 잠겨 있어 옵션을 바꿀 수 없습니다", "Page editing is locked")
      : s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true
        ? bt("현재 편집 권한이 잠겨 있어 그리기 옵션을 바꿀 수 없습니다", "Drawing options are currently locked")
        : undefined;
  const sizeLocked = Boolean(s.proDrawPrefs?.sizeLocked);
  const zoomPercent = Math.max(1, Math.round((Number.isFinite(s.effScale) ? s.effScale : 1) * 100));
  const zoomDisabled = Boolean(s.zoomLocked || s.viewTransformSuppressed);
  const zoomDisabledReason = s.zoomLocked
    ? bt("캔버스 배율이 잠겨 있습니다", "Canvas zoom is locked")
    : s.viewTransformSuppressed
      ? bt("현재 보기 변환이 일시 제한되어 있습니다", "View transform is temporarily unavailable")
      : undefined;
  const activeDrawMode =
    s.tool !== "draw"
      ? "inactive"
      : s.drawMode === "eraser"
        ? "eraser"
        : s.drawMode === "shape"
          ? "shape"
          : s.drawMode === "pixel"
            ? "pixel"
            : "pen";
  const roundedWidth = Math.max(1, Math.round(Number.isFinite(s.strokeWidth) ? s.strokeWidth : 4));
  const opacityPercent = Math.max(
    1,
    Math.min(100, Math.round((Number.isFinite(s.brushOpacity) ? (s.brushOpacity ?? 1) : 1) * 100)),
  );
  const activeBrushName =
    studioEraserDisplayName(s.activeCatalogBrush?.id, s.activeCatalogBrush?.name?.trim(), bt) ||
    (activeDrawMode === "eraser" ? bt("지우개", "Eraser") : bt("G펜", "G-Pen"));
  const brushCatalogOpen = s.brushCatalogSession?.placement === "desktop-dock";
  const normalizedColor = normalizeHexColor(s.color ?? "#111111") ?? "#111111";
  const decrease = drawingCommandShortcut(s.appSettings, "brush-smaller", bt("브러시 크기 줄이기", "Decrease brush size"));
  const increase = drawingCommandShortcut(s.appSettings, "brush-larger", bt("브러시 크기 키우기", "Increase brush size"));
  const widthReadoutId = useId();
  const optionsLiveSummaryId = useId();
  const blockedReasonId = useId();
  const minWidthReasonId = useId();
  const maxWidthReasonId = useId();
  const zoomReasonId = useId();
  const minWidthDisabled = blocked || s.strokeWidth <= 1;
  const maxWidthDisabled = blocked || s.strokeWidth >= 200;
  const minWidthReason = blocked ? blockedReason : s.strokeWidth <= 1 ? bt("최소 브러시 두께(1px)입니다", "Minimum brush size (1px) reached") : undefined;
  const maxWidthReason = blocked ? blockedReason : s.strokeWidth >= 200 ? bt("최대 브러시 두께(200px)입니다", "Maximum brush size (200px) reached") : undefined;
  const stabilizerSafe = Math.max(0, Math.min(3, Math.round(Number.isFinite(s.stabilizer) ? s.stabilizer : 0)));
  const stabilizerLabel = formatStabilizerLabel(s.stabilizer, bt);
  const optionsLiveSummary = `${bt("현재 도구", "Current tool")} ${activeBrushName}, ${bt("두께", "Size")} ${roundedWidth}px, ${bt("불투명도", "Opacity")} ${opacityPercent}%, ${stabilizerLabel}, ${bt("배율", "Zoom")} ${zoomPercent}%`;

  const resetZoomToActualPixel = useCallback(() => {
    if (zoomDisabled) return;
    pushCue("0", bt("배율 맞춤", "Reset zoom"), "100%");
    if (s.studioToolBeltContentHandlers?.setActualPixelView) {
      s.studioToolBeltContentHandlers.setActualPixelView();
      return;
    }
    s.setZoom(1);
  }, [bt, pushCue, s, zoomDisabled]);

  const handleQuickWheelAction = useCallback(
    (actionId: QuickMenuActionId, labelKo: string) => {
      pushCue("Q", labelKo);
      if (actionId === "flip-canvas-h") {
        if (s.studioOptionsBarsHandlers?.flipCanvasHorizontal) s.studioOptionsBarsHandlers.flipCanvasHorizontal();
        else s.toggleCanvasFlipX?.();
      } else if (actionId === "fit-canvas") {
        resetZoomToActualPixel();
      } else if (actionId === "toggle-alpha-lock" || actionId === "toggle-clipping-mask") {
        const trigger = quickWheelTriggerRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : document.body);
        clarity?.open("layers", trigger);
      } else if (actionId === "colordrop-fill") {
        s.activatePrimaryCanvasTool("draw", "pen");
      }
    },
    [clarity, pushCue, resetZoomToActualPixel, s],
  );

  useEffect(() => {
    const handleGlobalQuickWheelKey = (event: KeyboardEvent) => {
      if (blocked || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "q" && event.key !== "Q") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      event.preventDefault();
      setQuickWheelAnchor(null);
      setQuickWheelOpen((open) => !open);
    };
    window.addEventListener("keydown", handleGlobalQuickWheelKey);
    return () => window.removeEventListener("keydown", handleGlobalQuickWheelKey);
  }, [blocked]);

  const miniDockMode: StudioContextMiniDockMode = s.bg3dOpen ? "bg3d" : activeDrawMode === "eraser" ? "eraser" : s.tool === "select" ? "select" : "pen";

  return (
    <div
      className="studio-drawing-ergonomics-bar"
      role="toolbar"
      aria-label={bt(
        "그리기 옵션 · 빠른 작업 동선과 브러시 보조",
        "Drawing options · Quick workflow and brush ergonomics",
      )}
      data-studio-quick-ergonomics="true"
      data-studio-draw-options="true"
      data-studio-active-draw-mode={activeDrawMode}
    >
      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        disabled={blocked}
        aria-expanded={brushCatalogOpen}
        aria-haspopup="dialog"
        aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
        data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
        aria-label={
          activeDrawMode === "eraser"
            ? `${bt("현재 도구", "Current tool")} ${activeBrushName}, ${roundedWidth}px, ${bt("지우기 강도", "Erase opacity")} ${opacityPercent}%, ${bt("지우개 선택 열기", "Open eraser picker")}`
            : `${bt("현재 도구", "Current tool")} ${activeBrushName}, ${roundedWidth}px, ${bt("불투명도", "Opacity")} ${opacityPercent}%, ${bt("브러시 선택 열기", "Open brush picker")}`
        }
        data-studio-brush-active-pill="true"
        data-studio-active-tool-summary={activeDrawMode === "eraser" ? "eraser" : "pen"}
        data-studio-core-draw-control="brush"
        onClick={(event) => {
          if (s.tool !== "draw") {
            s.activatePrimaryCanvasTool("draw", "pen");
          }
          if (s.studioBrushCatalogHandlers?.toggle) {
            s.studioBrushCatalogHandlers.toggle("desktop-dock", event.currentTarget);
            return;
          }
          clarity?.open("brush", event.currentTarget);
        }}
        title={blocked && blockedReason ? blockedReason : bt("클릭해 브러시·지우개 프리셋 선택 창 열기", "Open brush and eraser preset catalog")}
      >
        <span
          aria-hidden="true"
          className="studio-drawing-ergonomics-dot"
          style={{
            backgroundColor: activeDrawMode === "eraser" ? "var(--color-fg-3)" : normalizedColor,
            opacity: opacityPercent / 100,
          }}
        />
        <span className="studio-drawing-brush-label">{bt("브러시", "Brushes")}</span><span>{activeBrushName}</span>
        <StudioToolArtwork tool={activeDrawMode === "eraser" ? "eraser" : "brush"} className="studio-brush-picker-art" />
      </button>

      <div
        className="studio-drawing-stepper"
        role="group"
        aria-label={bt("브러시 두께 빠른 조절", "Quick brush size control")}
      >
        <button
          type="button"
          className="studio-drawing-stepper-btn"
          disabled={minWidthDisabled}
          onClick={() => s.setStrokeWidth((current) => stepBrushWidth(current, -1))}
          aria-label={bt("브러시 크기 줄이기", "Decrease brush size")}
          aria-describedby={minWidthDisabled && minWidthReason ? (blocked ? blockedReasonId : minWidthReasonId) : widthReadoutId}
          data-studio-disabled-reason={minWidthDisabled ? minWidthReason : undefined}
          title={minWidthDisabled && minWidthReason ? `${decrease.title} — ${minWidthReason}` : decrease.title}
          aria-keyshortcuts={decrease["aria-keyshortcuts"]}
        >
          <Minus size={15} aria-hidden />
        </button>
        <button
          id={widthReadoutId}
          type="button"
          className="studio-drawing-stepper-readout"
          onClick={(event) => clarity?.open("brush", event.currentTarget)}
          aria-label={`${bt("현재 브러시 두께", "Current brush size")} ${roundedWidth}px`}
          aria-expanded={clarity?.panel === "brush"}
          title={bt("클릭해 펜·브러시 세부 설정 열기", "Open detailed brush settings")}
        >
          <span>{bt("두께", "Size")} {roundedWidth}px</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stepper-btn"
          disabled={maxWidthDisabled}
          onClick={() => s.setStrokeWidth((current) => stepBrushWidth(current, 1))}
          aria-label={bt("브러시 크기 키우기", "Increase brush size")}
          aria-describedby={maxWidthDisabled && maxWidthReason ? (blocked ? blockedReasonId : maxWidthReasonId) : widthReadoutId}
          data-studio-disabled-reason={maxWidthDisabled ? maxWidthReason : undefined}
          title={maxWidthDisabled && maxWidthReason ? `${increase.title} — ${maxWidthReason}` : increase.title}
          aria-keyshortcuts={increase["aria-keyshortcuts"]}
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>

      {s.setColor ? (
        <input
          type="color"
          className="studio-drawing-ergonomics-color"
          aria-label={bt("주 색 선택", "Select primary color")}
          aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
          data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
          title={blocked && blockedReason ? blockedReason : bt("주 색 빠르게 바꾸기", "Quickly change primary stroke color")}
          disabled={blocked}
          value={normalizedColor}
          onChange={(event) => s.setColor?.(event.currentTarget.value)}
        />
      ) : null}

      <div className="studio-drawing-stabilizer-group" role="group" aria-label={bt("손떨림 보정 강도 조절", "Stroke stabilizer control")}>
        <button
          type="button"
          className="studio-drawing-ergonomics-chip"
          disabled={blocked}
          aria-pressed={s.stabilizer > 0}
          aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
          data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
          onClick={() => s.setStabilizer((current) => cycleStudioStabilizerStrength(current))}
          title={blocked && blockedReason ? blockedReason : bt("클릭할 때마다 손떨림 보정 강도(꺼짐 → 약함 → 표준 → 강함)를 순환합니다", "Cycle stroke stabilizer strength")}
        >
          <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden />
          <span>{stabilizerLabel}</span>
        </button>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          disabled={blocked}
          aria-label={bt("손떨림 보정 슬라이더", "Stabilizer strength slider")}
          aria-valuetext={stabilizerLabel}
          aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
          title={blocked && blockedReason ? blockedReason : undefined}
          value={stabilizerSafe}
          onChange={(event) => s.setStabilizer(Number(event.currentTarget.value))}
          className="studio-drawing-stabilizer-slider"
        />
      </div>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        disabled={blocked}
        aria-pressed={activePressurePreset !== "linear"}
        aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
        data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
        data-studio-pressure-preset={activePressurePreset}
        data-studio-pressure-curve={`${activePressureCurve.x1},${activePressureCurve.y1},${activePressureCurve.x2},${activePressureCurve.y2}`}
        onClick={() => {
          const next = resolveNextPressurePreset(activePressurePreset);
          setLocalPressurePreset(next);
          s.onChangePressureCurvePreset?.(next, PRESSURE_CURVE_PRESETS[next]);
        }}
        title={blocked && blockedReason ? blockedReason : bt(
          "클릭할 때마다 필압 베지어 곡선 프리셋(표준 → 부드러움 → 단단한 G펜 → 강약 강조)을 전환합니다",
          "Cycle cubic Bezier pen pressure curve presets",
        )}
      >
        <Gauge size={15} aria-hidden />
        <span>{pressurePresetLabel}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        disabled={blocked}
        aria-pressed={activeQuickShapeEnabled}
        aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
        data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
        data-studio-quickshape-snap={activeQuickShapeEnabled ? "true" : "false"}
        data-studio-quickmenu-slot-count={activeQuickMenuCount}
        onClick={() => {
          const next = !activeQuickShapeEnabled;
          setLocalQuickShapeEnabled(next);
          s.onToggleQuickShapeSnap?.(next);
        }}
        title={blocked && blockedReason ? blockedReason : bt(
          `그린 뒤 0.4초 멈추면 직선·사각형·타원으로 자동 스냅합니다 (빠른 메뉴 ${activeQuickMenuCount}슬롯 준비됨)`,
          `Hold 0.4s after drawing to snap clean shapes (${activeQuickMenuCount} QuickMenu slots ready)`,
        )}
      >
        <Shapes size={15} aria-hidden />
        <span>{bt("도형 스냅", "QuickShape")}</span>
      </button>

      {s.studioOptionsBarsHandlers?.toggleSizeLock ? (
        <button
          type="button"
          className="studio-drawing-ergonomics-chip"
          aria-pressed={sizeLocked}
          onClick={() => s.studioOptionsBarsHandlers?.toggleSizeLock?.()}
          title={bt("브러시를 바꿔도 현재 두께를 유지합니다", "Keep current brush size when switching brushes")}
        >
          {sizeLocked ? <Lock size={15} aria-hidden /> : <Unlock size={15} aria-hidden />}
          <span>{bt("크기 고정", "Lock size")}</span>
        </button>
      ) : null}

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        aria-pressed={Boolean(s.canvasFlipH)}
        onClick={() => {
          if (s.studioOptionsBarsHandlers?.flipCanvasHorizontal) {
            s.studioOptionsBarsHandlers.flipCanvasHorizontal();
            return;
          }
          s.toggleCanvasFlipX?.();
        }}
        title={bt("데생 균형 점검용 캔버스 좌우 반전 보기 · H", "Toggle horizontal canvas flip view · H")}
      >
        <FlipHorizontal2 size={15} aria-hidden />
        <span>{bt("좌우 반전", "Flip view")}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        aria-pressed={
          typeof s.symmetryType === "string" &&
          s.symmetryType !== "off" &&
          s.symmetryType !== "none"
        }
        onClick={() => {
          s.changeStudioSymmetryType?.(resolveNextSymmetryMode(s.symmetryType));
        }}
        title={bt(
          "클릭할 때마다 대칭 자 모드(꺼짐 → 수직 → 수평 → 방사 → 만화경 → 실크)를 순환합니다",
          "Cycle symmetry drawing guide mode",
        )}
      >
        <Columns2 size={15} aria-hidden />
        <span>{bt("대칭", "Symmetry")}</span>
      </button>

      {s.setPerspectiveRulerActive ? (
        <button
          type="button"
          className="studio-drawing-ergonomics-chip"
          disabled={blocked}
          aria-pressed={Boolean(s.perspectiveRulerActive)}
          aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
          data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
          data-studio-perspective-snap-quick-toggle="true"
          onClick={() => s.setPerspectiveRulerActive?.((active) => !active)}
          title={blocked && blockedReason ? blockedReason : bt(
            "원근 자 스냅 켜기/끄기 · 소실점 방사선에 펜·직선을 자동 정렬합니다",
            "Toggle perspective ruler snap",
          )}
        >
          <Magnet size={15} aria-hidden />
          <span>
            {s.perspectiveRulerActive
              ? `${bt("원근 스냅", "Perspective snap")} ${(s.vanishingPoints?.length ?? 0) > 0 ? `${s.vanishingPoints?.length}점` : bt("켜짐", "On")}`
              : bt("원근 스냅 꺼짐", "Perspective snap off")}
          </span>
        </button>
      ) : null}

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        onClick={(event) => s.studioOptionsBarsHandlers?.openBrushStudio?.(event.currentTarget)}
        title={bt("서브픽셀 테이퍼·습식 안료 브러시 랩 열기", "Open Brush Lab studio")}
      >
        <img
          src="/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp"
          alt=""
          width={18}
          height={18}
          aria-hidden="true"
          className="size-[18px] shrink-0 rounded-[5px] object-cover"
        />
        <span>{bt("브러시 랩", "Brush Lab")}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        aria-pressed={s.showWebtoonGuides}
        onClick={() => s.setShowWebtoonGuides((visible) => !visible)}
        title={bt("모바일 독자 가독 폭(690·720px)과 세이프 영역 가이드를 캔버스에 표시합니다", "Toggle mobile reader safe-width guides (690/720px)")}
      >
        <Compass size={15} aria-hidden />
        <span>{bt("모바일 폭 가이드", "Mobile width guide")}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip studio-drawing-ergonomics-chip--zoom"
        disabled={zoomDisabled}
        aria-pressed={zoomPercent === 100}
        aria-describedby={zoomDisabled && zoomDisabledReason ? zoomReasonId : undefined}
        data-studio-disabled-reason={zoomDisabled && zoomDisabledReason ? zoomDisabledReason : undefined}
        onClick={resetZoomToActualPixel}
        aria-label={`${bt("캔버스 배율", "Canvas zoom")} ${zoomPercent}% · ${bt("100% 실제 크기로 맞추기", "Reset to 100%")}`}
        title={zoomDisabled && zoomDisabledReason ? zoomDisabledReason : bt("클릭해 100% 실제 픽셀 배율로 즉시 복귀", "Reset canvas zoom to 100%")}
      >
        <span>{zoomPercent}%</span>
      </button>
      <div
        className="studio-drawing-stage-pills"
        role="group"
        aria-label={bt("웹툰 제작 5단계 바로가기", "5-stage webtoon workflow shortcuts")}
      >
        <button
          type="button"
          className="studio-drawing-stage-pill"
          aria-pressed={clarity?.panel === "pages"}
          onClick={(event) => clarity?.open("pages", event.currentTarget)}
        >
          <span>{bt("① 콘티·컷", "1. Storyboard")}</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stage-pill"
          disabled={blocked}
          aria-pressed={s.tool === "draw" && s.drawMode !== "eraser"}
          aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
          data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
          title={blocked && blockedReason ? blockedReason : undefined}
          onClick={() => s.activatePrimaryCanvasTool("draw", "pen")}
        >
          <span>{bt("② 선화·펜터치", "2. Line & Ink")}</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stage-pill"
          aria-pressed={clarity?.panel === "brush"}
          onClick={(event) => clarity?.open("brush", event.currentTarget)}
        >
          <img
            src="/brand/luminous-atelier-20261114/icon-studio-layers-color.webp"
            alt=""
            width={18}
            height={18}
            aria-hidden="true"
          />
          <span>{bt("③ 채색·톤", "3. Color & Tone")}</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stage-pill studio-drawing-stage-pill--3d"
          aria-pressed={s.bg3dOpen}
          onClick={() => s.studioLeftToolRailHandlers.toggleBg3dEditor()}
        >
          <img
            src="/brand/luminous-atelier-20261114/icon-studio-3d-pose.webp"
            alt=""
            width={18}
            height={18}
            aria-hidden="true"
          />
          <span>{bt("④ 3D 배경", "4. 3D Stage")}</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stage-pill"
          aria-pressed={s.exportMenuOpen}
          onClick={() => s.setExportMenuOpen(true)}
        >
          <span>{bt("⑤ 마감·출고", "5. Publish")}</span>
        </button>
      </div>

      <button
        ref={quickWheelTriggerRef}
        type="button"
        className="studio-drawing-ergonomics-chip"
        disabled={blocked}
        aria-pressed={quickWheelOpen}
        aria-keyshortcuts="Q"
        data-studio-quick-wheel-trigger="true"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setQuickWheelAnchor({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom + 112) });
          setQuickWheelOpen((open) => !open);
        }}
        title={bt("방사형 퀵 휠 열기 (Q)", "Open radial quick wheel (Q)")}
      >
        <Compass size={15} aria-hidden />
        <span>{bt("퀵 휠", "Wheel")}</span>
      </button>

      <button
        ref={miniDockTriggerRef}
        type="button"
        className="studio-drawing-ergonomics-chip"
        disabled={blocked}
        aria-pressed={miniDockOpen}
        data-studio-mini-dock-toggle="true"
        onClick={() => setMiniDockOpen((open) => !open)}
        title={bt("상황 인식 스크러버 미니 독 열기/닫기", "Toggle context-aware scrubber mini dock")}
      >
        <SlidersHorizontal size={15} aria-hidden />
        <span>{bt("미니 독", "Mini dock")}</span>
      </button>

      {miniDockOpen ? (
        <Suspense fallback={null}>
          <div className="fixed bottom-16 left-1/2 z-[35] -translate-x-1/2">
            <LazyStudioContextMiniDock
              mode={miniDockMode}
              strokeWidth={roundedWidth}
              onStrokeWidthChange={(next) => {
                s.setStrokeWidth(next);
                pushCue("[ ]", bt("브러시 두께", "Brush size"), `${next}px`);
              }}
              opacityPercent={opacityPercent}
              stabilizer={stabilizerSafe}
              onCycleStabilizer={() => {
                s.setStabilizer((current) => {
                  const next = cycleStudioStabilizerStrength(current);
                  pushCue("S", bt("손떨림 보정", "Stabilizer"), formatStabilizerLabel(next, bt));
                  return next;
                });
              }}
              color={normalizedColor}
              symmetryActive={
                typeof s.symmetryType === "string" &&
                s.symmetryType !== "off" &&
                s.symmetryType !== "none"
              }
              onToggleSymmetry={() => {
                const next = resolveNextSymmetryMode(s.symmetryType);
                s.changeStudioSymmetryType?.(next);
                pushCue("M", bt("대칭 자", "Symmetry"), next);
              }}
              flipActive={Boolean(s.canvasFlipH)}
              onToggleFlip={() => {
                if (s.studioOptionsBarsHandlers?.flipCanvasHorizontal) {
                  s.studioOptionsBarsHandlers.flipCanvasHorizontal();
                } else {
                  s.toggleCanvasFlipX?.();
                }
                pushCue("H", bt("좌우 반전", "Flip view"));
              }}
              disabled={blocked}
              onOpenQuickWheel={() => {
                setQuickWheelAnchor(null);
                setQuickWheelOpen(true);
              }}
              onReturnToPen={() => s.activatePrimaryCanvasTool("draw", "pen")}
              onOpenLayers={() => clarity?.open("layers", miniDockTriggerRef.current ?? document.body)}
              onToggleBg3d={() => s.studioLeftToolRailHandlers.toggleBg3dEditor()}
            />
          </div>
        </Suspense>
      ) : null}

      {quickWheelOpen ? (
        <Suspense fallback={null}>
          <LazyStudioRadialQuickWheel
            open={quickWheelOpen}
            anchor={quickWheelAnchor}
            slots={activeQuickMenuSlots}
            onSelectAction={(actionId, slot) => handleQuickWheelAction(actionId, slot.labelKo)}
            onClose={() => setQuickWheelOpen(false)}
          />
        </Suspense>
      ) : null}

      {shortcutCue ? (
        <Suspense fallback={null}>
          <LazyStudioVisualShortcutHud cue={shortcutCue} />
        </Suspense>
      ) : null}

      {blocked && blockedReason ? <span id={blockedReasonId} className="sr-only">{blockedReason}</span> : null}
      {!blocked && s.strokeWidth <= 1 && minWidthReason ? <span id={minWidthReasonId} className="sr-only">{minWidthReason}</span> : null}
      {!blocked && s.strokeWidth >= 200 && maxWidthReason ? <span id={maxWidthReasonId} className="sr-only">{maxWidthReason}</span> : null}
      {zoomDisabled && zoomDisabledReason ? <span id={zoomReasonId} className="sr-only">{zoomDisabledReason}</span> : null}
      <span
        id={optionsLiveSummaryId}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-studio-options-live-summary="true"
      >
        {optionsLiveSummary}
      </span>
    </div>
  );
}
