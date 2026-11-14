import { Columns2, Compass, FlipHorizontal2, LayoutGrid, Lock, Magnet, Minus, Plus, Sparkles, Unlock } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { normalizeHexColor } from "../studio-color-utils";
import { cycleStudioStabilizerStrength } from "../studio-pro-draw-prefs";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

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
  | "setBg3dOpen"
  | "exportMenuOpen"
  | "setExportMenuOpen"
> & {
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
};

const SYMMETRY_CYCLE_ORDER: readonly StudioDrawingErgonomicsSymmetryType[] = [
  "none",
  "vertical",
  "horizontal",
  "radial",
  "kaleidoscope",
  "silk",
];

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

/**
 * 경쟁사 드로잉 툴(클립스튜디오·프로크리에이트·Kleki·Excalidraw·JS Paint) 핵심 인체공학 바:
 * 5단계 제작 동선 퀵필 + 브러시 두께 스테퍼 + 1클릭 손떨림 보정 순환 + 브러시 크기 고정 + 모바일 폭 가이드 + 100% 배율 복귀.
 */
export function StudioDrawingQuickErgonomicsBar({
  session: s,
}: {
  readonly session: StudioDrawingErgonomicsSession;
}) {
  const clarity = useStudioDrawingClarity();
  const bt = useBilingual("studio.drawingClarity");
  const blocked =
    s.activeSurfaceReviewLocked ||
    s.pageEditLocked ||
    (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  const sizeLocked = Boolean(s.proDrawPrefs?.sizeLocked);
  const zoomPercent = Math.max(1, Math.round((Number.isFinite(s.effScale) ? s.effScale : 1) * 100));
  const zoomDisabled = Boolean(s.zoomLocked || s.viewTransformSuppressed);
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
    s.activeCatalogBrush?.name?.trim() ||
    (activeDrawMode === "eraser" ? bt("지우개", "Eraser") : bt("G펜", "G-Pen"));
  const brushCatalogOpen = s.brushCatalogSession?.placement === "desktop-dock";
  const normalizedColor = normalizeHexColor(s.color ?? "#111111") ?? "#111111";

  const resetZoomToActualPixel = () => {
    if (zoomDisabled) return;
    if (s.studioToolBeltContentHandlers?.setActualPixelView) {
      s.studioToolBeltContentHandlers.setActualPixelView();
      return;
    }
    s.setZoom(1);
  };

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
          onClick={() => s.setBg3dOpen((open) => !open)}
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
        type="button"
        className="studio-drawing-ergonomics-chip"
        disabled={blocked}
        aria-expanded={brushCatalogOpen}
        aria-haspopup="dialog"
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
        title={bt("클릭해 브러시·지우개 프리셋 선택 창 열기", "Open brush and eraser preset catalog")}
      >
        <span
          aria-hidden="true"
          className="studio-drawing-ergonomics-dot"
          style={{
            backgroundColor: activeDrawMode === "eraser" ? "oklch(0.65 0.02 70)" : normalizedColor,
            opacity: opacityPercent / 100,
          }}
        />
        <span>{activeBrushName}</span>
        <LayoutGrid size={13} aria-hidden />
      </button>

      {s.setColor ? (
        <input
          type="color"
          className="studio-drawing-ergonomics-color"
          aria-label={bt("주 색 선택", "Select primary color")}
          title={bt("주 색 빠르게 바꾸기", "Quickly change primary stroke color")}
          disabled={blocked}
          value={normalizedColor}
          onChange={(event) => s.setColor?.(event.currentTarget.value)}
        />
      ) : null}

      <div
        className="studio-drawing-stepper"
        role="group"
        aria-label={bt("브러시 두께 빠른 조절", "Quick brush size control")}
      >
        <button
          type="button"
          className="studio-drawing-stepper-btn"
          disabled={blocked || s.strokeWidth <= 1}
          onClick={() => s.setStrokeWidth((current) => stepBrushWidth(current, -1))}
          aria-label={bt("브러시 크기 줄이기", "Decrease brush size")}
          title={bt("브러시 크기 줄이기 · [", "Decrease brush size · [")}
        >
          <Minus size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="studio-drawing-stepper-readout"
          onClick={(event) => clarity?.open("brush", event.currentTarget)}
          aria-label={`${bt("현재 브러시 두께", "Current brush size")} ${Math.max(1, Math.round(s.strokeWidth))}px`}
          title={bt("클릭해 펜·브러시 세부 설정 열기", "Open detailed brush settings")}
        >
          <span>{Math.max(1, Math.round(s.strokeWidth))}px</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stepper-btn"
          disabled={blocked || s.strokeWidth >= 200}
          onClick={() => s.setStrokeWidth((current) => stepBrushWidth(current, 1))}
          aria-label={bt("브러시 크기 키우기", "Increase brush size")}
          title={bt("브러시 크기 키우기 · ]", "Increase brush size · ]")}
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>

      <div className="studio-drawing-stabilizer-group" role="group" aria-label={bt("손떨림 보정 강도 조절", "Stroke stabilizer control")}>
        <button
          type="button"
          className="studio-drawing-ergonomics-chip"
          disabled={blocked}
          aria-pressed={s.stabilizer > 0}
          onClick={() => s.setStabilizer((current) => cycleStudioStabilizerStrength(current))}
          title={bt("클릭할 때마다 손떨림 보정 강도(꺼짐 → 약함 → 표준 → 강함)를 순환합니다", "Cycle stroke stabilizer strength")}
        >
          <Sparkles size={15} aria-hidden />
          <span>{formatStabilizerLabel(s.stabilizer, bt)}</span>
        </button>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          disabled={blocked}
          aria-label={bt("손떨림 보정 슬라이더", "Stabilizer strength slider")}
          value={Math.max(0, Math.min(3, Math.round(Number.isFinite(s.stabilizer) ? s.stabilizer : 0)))}
          onChange={(event) => s.setStabilizer(Number(event.currentTarget.value))}
          className="studio-drawing-stabilizer-slider"
        />
      </div>

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
          data-studio-perspective-snap-quick-toggle="true"
          onClick={() => s.setPerspectiveRulerActive?.((active) => !active)}
          title={bt(
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
        onClick={resetZoomToActualPixel}
        aria-label={`${bt("캔버스 배율", "Canvas zoom")} ${zoomPercent}% · ${bt("100% 실제 크기로 맞추기", "Reset to 100%")}`}
        title={bt("클릭해 100% 실제 픽셀 배율로 즉시 복귀", "Reset canvas zoom to 100%")}
      >
        <span>{zoomPercent}%</span>
      </button>
    </div>
  );
}
