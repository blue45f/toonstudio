import { Maximize2, Minimize2, PanelLeft, PanelRight, SlidersHorizontal } from "lucide-react";
import { useEffect } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";
import type { StudioDrawingHandedness } from "./studio-drawing-ergonomics-presets";

export interface StudioDrawingWorkflowStagePillsProps {
  readonly activePanel: StudioDrawingClarityPanel | null | undefined;
  readonly onOpenPanel?: (panel: StudioDrawingClarityPanel, trigger: HTMLElement) => void;
  readonly blocked: boolean;
  readonly blockedReason?: string;
  readonly blockedReasonId: string;
  readonly drawingLineActive: boolean;
  readonly onActivatePen: () => void;
  readonly bg3dOpen: boolean;
  readonly onToggleBg3d: () => void;
  readonly exportMenuOpen: boolean;
  readonly onOpenExportMenu: () => void;
}

/** 웹툰 제작 5단계(① 콘티·컷 ~ ⑤ 마감·출고) 바로가기 필 그룹. */
export function StudioDrawingWorkflowStagePills({
  activePanel,
  onOpenPanel,
  blocked,
  blockedReason,
  blockedReasonId,
  drawingLineActive,
  onActivatePen,
  bg3dOpen,
  onToggleBg3d,
  exportMenuOpen,
  onOpenExportMenu,
}: StudioDrawingWorkflowStagePillsProps) {
  const bt = useBilingual("studio.drawingClarity");

  return (
    <div
      className="studio-drawing-stage-pills"
      role="group"
      data-studio-aux-control="true"
      aria-label={bt("웹툰 제작 5단계 바로가기", "5-stage webtoon workflow shortcuts")}
    >
      <button
        type="button"
        className="studio-drawing-stage-pill"
        aria-pressed={activePanel === "pages"}
        onClick={(event) => onOpenPanel?.("pages", event.currentTarget)}
      >
        <span>{bt("① 콘티·컷", "1. Storyboard")}</span>
      </button>
      <button
        type="button"
        className="studio-drawing-stage-pill"
        disabled={blocked}
        aria-pressed={drawingLineActive}
        aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
        data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
        title={blocked && blockedReason ? blockedReason : undefined}
        onClick={onActivatePen}
      >
        <span>{bt("② 선화·펜터치", "2. Line & Ink")}</span>
      </button>
      <button
        type="button"
        className="studio-drawing-stage-pill"
        aria-pressed={activePanel === "brush"}
        onClick={(event) => onOpenPanel?.("brush", event.currentTarget)}
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
        aria-pressed={bg3dOpen}
        onClick={onToggleBg3d}
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
        aria-pressed={exportMenuOpen}
        onClick={onOpenExportMenu}
      >
        <span>{bt("⑤ 마감·출고", "5. Publish")}</span>
      </button>
    </div>
  );
}

export interface StudioDrawingInputHudStripProps {
  readonly activeAuxCount: number;
  readonly auxCollapsed: boolean;
  readonly onToggleAuxCollapsed: () => void;
  readonly zenFocus: boolean;
  readonly onToggleZenFocus: () => void;
  readonly handedness: StudioDrawingHandedness;
  readonly onToggleHandedness: () => void;
  readonly tool: string;
  readonly blocked: boolean;
}

/**
 * 데스크톱 멀티 입력(마우스·펜·왼손잡이) · 보조 도구 접이식 카운터 · Zen 캔버스 집중 토글.
 * 그리기 중(#studio-canvas-workspace pointerdown)에는 passive 리스너로
 * `#studio-app-shell[data-studio-stroke-active="true"]`를 자동 동기화해 플로팅 바를 부드럽게 후퇴시킨다.
 */
export function StudioDrawingInputHudStrip({
  activeAuxCount,
  auxCollapsed,
  onToggleAuxCollapsed,
  zenFocus,
  onToggleZenFocus,
  handedness,
  onToggleHandedness,
  tool,
  blocked,
}: StudioDrawingInputHudStripProps) {
  const bt = useBilingual("studio.drawingClarity");

  // 그리기 중 Breathing Auto-Recede: 캔버스 포인터 드래그 동안만 data-studio-stroke-active="true" 동기화
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const shell = document.getElementById("studio-app-shell");
    if (!shell) return;

    const clearStrokeActive = () => {
      shell.removeAttribute("data-studio-stroke-active");
    };

    if (blocked || tool !== "draw") {
      clearStrokeActive();
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("#studio-canvas-workspace, [data-studio-canvas-viewport]")) return;
      if (target.closest("button, input, select, textarea, [role='toolbar'], [role='menu'], [role='dialog']")) {
        return;
      }
      shell.setAttribute("data-studio-stroke-active", "true");
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", clearStrokeActive, { passive: true });
    window.addEventListener("pointercancel", clearStrokeActive, { passive: true });
    window.addEventListener("blur", clearStrokeActive, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", clearStrokeActive);
      window.removeEventListener("pointercancel", clearStrokeActive);
      window.removeEventListener("blur", clearStrokeActive);
      clearStrokeActive();
    };
  }, [blocked, tool]);

  // Zen 집중 모드 활성 시 Escape로 즉시 일반 드로잉 크롬 복귀
  useEffect(() => {
    if (!zenFocus || typeof window === "undefined") return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      onToggleZenFocus();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onToggleZenFocus, zenFocus]);

  const isLeftHanded = handedness === "left";

  return (
    <div
      className="studio-drawing-input-hud-strip"
      role="group"
      aria-label={bt("집중 모드 및 입력 레이아웃", "Focus mode and input layout")}
      data-studio-input-hud-strip="true"
    >
      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        aria-expanded={!auxCollapsed}
        data-studio-aux-tools-toggle="true"
        data-studio-aux-active-count={activeAuxCount}
        onClick={onToggleAuxCollapsed}
        aria-label={
          auxCollapsed
            ? bt(`보조 도구 펼치기 · 활성 ${activeAuxCount}개`, `Expand auxiliary tools · ${activeAuxCount} active`)
            : bt(`보조 도구 접기 · 활성 ${activeAuxCount}개`, `Collapse auxiliary tools · ${activeAuxCount} active`)
        }
        title={bt(
          `보조 도구(필압·스냅·반전·대칭·원근·가이드) 접기/펼치기 · 현재 활성 ${activeAuxCount}개`,
          `Toggle auxiliary drawing tools · ${activeAuxCount} active`,
        )}
      >
        <SlidersHorizontal size={14} aria-hidden />
        <span>{bt("보조", "Aux")}</span>
        <span className="studio-drawing-aux-badge" data-studio-aux-count-badge="true" aria-hidden="true">
          {activeAuxCount}
        </span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip studio-drawing-zen-chip"
        aria-pressed={zenFocus}
        data-studio-zen-focus-toggle="true"
        onClick={onToggleZenFocus}
        aria-label={
          zenFocus
            ? bt("Zen 캔버스 집중 모드 해제", "Exit Zen canvas focus mode")
            : bt("Zen 캔버스 집중 모드 켜기", "Enter Zen canvas focus mode")
        }
        title={
          zenFocus
            ? bt("Zen 집중 모드 해제 (Esc)", "Exit Zen focus mode (Esc)")
            : bt("Zen 캔버스 최대화 집중 모드 전환", "Maximize canvas in Zen focus mode")
        }
      >
        {zenFocus ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
        <span>Zen</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip"
        aria-pressed={isLeftHanded}
        data-studio-handedness-toggle="true"
        data-studio-handedness={handedness}
        onClick={onToggleHandedness}
        aria-label={
          isLeftHanded
            ? bt("왼손잡이 우측 레일 켜짐 · 오른손잡이 좌측 레일로 전환", "Left-handed right rail active · Switch to right-handed")
            : bt("오른손잡이 좌측 레일 · 왼손잡이 우측 레일로 전환", "Right-handed left rail · Switch to left-handed mirror")
        }
        title={
          isLeftHanded
            ? bt("왼손잡이 미러(우측 도구 레일) 사용 중 · 클릭해 오른손잡이로 전환", "Left-handed mirror active · Click for right-handed")
            : bt("오른손잡이 배치(좌측 도구 레일) · 클릭해 왼손잡이 미러로 전환", "Right-handed layout · Click for left-handed mirror")
        }
      >
        {isLeftHanded ? <PanelRight size={14} aria-hidden /> : <PanelLeft size={14} aria-hidden />}
        <span>{isLeftHanded ? bt("왼손", "Left") : bt("오른손", "Right")}</span>
      </button>
    </div>
  );
}
