import { Columns2, Compass, FlipHorizontal2, Lock, Minus, Plus, Sparkles, Unlock } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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
  readonly canvasFlipH?: boolean;
  readonly symmetryType?: string;
  readonly changeStudioSymmetryType?: (next: StudioDrawingErgonomicsSymmetryType) => void;
  readonly toggleCanvasFlipX?: () => void;
  readonly proDrawPrefs?: { readonly sizeLocked?: boolean };
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
      aria-label={bt("빠른 작업 동선과 브러시 보조", "Quick workflow and brush ergonomics")}
      data-studio-quick-ergonomics="true"
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
          <span>{bt("콘티·컷", "Storyboard")}</span>
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
          <span>{bt("3D 배경", "3D stage")}</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stage-pill"
          disabled={blocked}
          aria-pressed={s.tool === "draw" && s.drawMode !== "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "pen")}
        >
          <span>{bt("작화", "Ink")}</span>
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
          <span>{bt("브러시·채색", "Brushes")}</span>
        </button>
        <button
          type="button"
          className="studio-drawing-stage-pill"
          aria-pressed={s.exportMenuOpen}
          onClick={() => s.setExportMenuOpen(true)}
        >
          <span>{bt("출고", "Publish")}</span>
        </button>
      </div>

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
