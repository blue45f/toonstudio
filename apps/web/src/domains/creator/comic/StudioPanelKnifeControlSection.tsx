/**
 * 사선·다각형 컷 분할 나이프 컨트롤 섹션.
 *
 * 선택된 컷 프레임의 실제 다각형 윤곽 위에서 직선/사선 드래그 미리보기,
 * 15° 각도 맞춤, 거터 폭(24~96px) 조절, 요소 바인딩 재할당 요약을 제공하고
 * 분할 확정 시 상위 콜백(`onCommitKnifeSplit` / `onReplaceSplitFrames`)으로 반영한다.
 */
import { useRef, useState } from "react";

import { polygonFrameToSvgPath } from "../manga-toolkit/manga-frame";
import {
  PANEL_KNIFE_ANGLE_PRESETS_DEG,
  PANEL_KNIFE_GUTTER_PRESETS_PX,
  PANEL_KNIFE_MAX_GUTTER_PX,
  PANEL_KNIFE_MIN_GUTTER_PX,
  beginPanelKnifePointerSession,
  cancelPanelKnifePointerSession,
  clampPanelKnifeGutter,
  commitPanelKnifePointerSession,
  frameElToComicPanelPolygon,
  ownsPanelKnifePointer,
  planDiagonalAnglePanelSplit,
  updatePanelKnifePointerSession,
  type PanelKnifeCommitResult,
  type PanelKnifePoint,
  type PanelKnifePointerSession,
} from "./studio-panel-knife-pointer";

import type { El, FrameEl } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioPanelKnifeControlSectionProps {
  readonly frame: FrameEl;
  readonly panelGutter: number;
  readonly panelSplitRatio: number;
  readonly elements?: readonly El[];
  readonly groups?: readonly LayerGroup[];
  readonly onReplaceSplitFrames?: (frames: readonly [FrameEl, FrameEl]) => void;
  readonly onCommitKnifeSplit?: (result: PanelKnifeCommitResult) => void;
}

const INTERACTIVE_BUTTON_BASE =
  "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function formatAngleLabel(deg: number): string {
  if (deg === 0) return "수평 0°";
  return deg > 0 ? `+${deg}°` : `${deg}°`;
}

export function StudioPanelKnifeControlSection({
  frame,
  panelGutter,
  panelSplitRatio,
  elements = [],
  groups = [],
  onReplaceSplitFrames,
  onCommitKnifeSplit,
}: StudioPanelKnifeControlSectionProps): ReactElement {
  const [customGutterPx, setCustomGutterPx] = useState<number | null>(null);
  const [angleDeg, setAngleDeg] = useState(15);
  const [snap15Deg, setSnap15Deg] = useState(false);
  const [dragSession, setDragSession] = useState<PanelKnifePointerSession | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const gutterPx = customGutterPx ?? clampPanelKnifeGutter(panelGutter);
  const offsetRatio = Math.max(0.15, Math.min(0.85, panelSplitRatio / 100));
  const canApply = Boolean(onCommitKnifeSplit || onReplaceSplitFrames);

  // 선택 프레임이 바뀌면 이전 컷 기준 드래그 초안은 무시한다.
  const activeDragSession =
    dragSession && dragSession.targetFrame.id === frame.id ? dragSession : null;

  const anglePlan = planDiagonalAnglePanelSplit({
    targetFrame: frame,
    angleDeg,
    offsetRatio,
    gutterPx,
    elements,
    groups,
  });

  const activePreview = activeDragSession ? activeDragSession.preview : anglePlan.preview;

  const pad = Math.max(24, Math.round(Math.max(frame.width, frame.height) * 0.14));
  const vbX = frame.x - pad;
  const vbY = frame.y - pad;
  const vbW = Math.max(48, frame.width + pad * 2);
  const vbH = Math.max(48, frame.height + pad * 2);
  const strokeUnit = Math.max(1.5, Math.min(vbW, vbH) * 0.01);

  const basePolygon = frameElToComicPanelPolygon(frame);
  const baseOutlinePath = polygonFrameToSvgPath({
    id: frame.id,
    vertices: basePolygon.points,
    borderWidth: frame.strokeWidth ?? 2,
    gutter: gutterPx,
  });

  const pointerToFramePoint = (event: ReactPointerEvent<SVGSVGElement>): PanelKnifePoint => {
    const svg = svgRef.current ?? event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : vbW;
    const height = rect.height > 0 ? rect.height : vbH;
    const rx = (event.clientX - rect.left) / width;
    const ry = (event.clientY - rect.top) / height;
    return {
      x: Math.round((vbX + rx * vbW) * 100) / 100,
      y: Math.round((vbY + ry * vbH) * 100) / 100,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const point = pointerToFramePoint(event);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // 합성 포인터 이벤트 환경에서는 캡처 없이도 세션 포인터 ID로 판별한다.
    }
    const next = beginPanelKnifePointerSession({
      targetFrame: frame,
      start: point,
      pointerId: event.pointerId,
      gutterPx,
      snap15Deg,
      elements,
      groups,
    });
    setDragSession(next);
    setFeedback(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!activeDragSession || activeDragSession.phase !== "dragging") return;
    if (!ownsPanelKnifePointer(activeDragSession, event)) return;
    const point = pointerToFramePoint(event);
    setDragSession(
      updatePanelKnifePointerSession(activeDragSession, {
        point,
        shiftKey: event.shiftKey,
        gutterPx,
        elements,
        groups,
      }),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!activeDragSession || activeDragSession.phase !== "dragging") return;
    if (!ownsPanelKnifePointer(activeDragSession, event)) return;
    const point = pointerToFramePoint(event);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // 이미 해제된 포인터 캡처는 무시한다.
    }
    const updated = updatePanelKnifePointerSession(activeDragSession, {
      point,
      shiftKey: event.shiftKey,
      gutterPx,
      elements,
      groups,
    });
    // 드래그를 마친 칼선을 확정 대기 상태로 유지해 거터 미세 조정 후 바로 적용할 수 있게 한다.
    setDragSession({ ...updated, phase: "committed" });
    setFeedback(
      updated.preview.valid
        ? "칼선 미리보기가 준비되었습니다. 아래 버튼으로 컷을 나누세요."
        : updated.preview.statusMessage,
    );
  };

  const handlePointerCancel = (): void => {
    if (!activeDragSession) return;
    setDragSession(cancelPanelKnifePointerSession(activeDragSession));
    setFeedback("드래그 칼선을 취소했습니다.");
  };

  const handlePadKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (event.key === "Escape" && activeDragSession) {
      event.preventDefault();
      setDragSession(null);
      setFeedback("직접 그은 칼선을 초기화했습니다.");
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setDragSession(null);
      setAngleDeg((prev) => Math.max(-65, prev - 5));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setDragSession(null);
      setAngleDeg((prev) => Math.min(65, prev + 5));
    }
  };

  const handleGutterChange = (nextGutter: number): void => {
    const clamped = clampPanelKnifeGutter(nextGutter);
    setCustomGutterPx(clamped);
    if (activeDragSession) {
      const refreshed = updatePanelKnifePointerSession(
        { ...activeDragSession, phase: "dragging" },
        {
          point: activeDragSession.current,
          gutterPx: clamped,
          elements,
          groups,
        },
      );
      setDragSession({ ...refreshed, phase: activeDragSession.phase });
    }
  };

  const handleApplySplit = (): void => {
    if (!canApply) return;
    if (activeDragSession) {
      const outcome = commitPanelKnifePointerSession(activeDragSession, {
        gutterPx,
        elements,
        groups,
      });
      if (!outcome.ok) {
        setFeedback(outcome.message);
        return;
      }
      onCommitKnifeSplit?.(outcome.result);
      onReplaceSplitFrames?.(outcome.result.frames);
      setDragSession(null);
      setFeedback("사선 나이프로 컷을 2개로 나누었습니다.");
      return;
    }

    if (!anglePlan.ok) {
      setFeedback(anglePlan.message);
      return;
    }
    onCommitKnifeSplit?.(anglePlan.result);
    onReplaceSplitFrames?.(anglePlan.result.frames);
    setFeedback(`기울기 ${formatAngleLabel(angleDeg)}로 컷을 나누었습니다.`);
  };

  const handleReset = (): void => {
    setDragSession(null);
    setCustomGutterPx(null);
    setAngleDeg(15);
    setFeedback("기본 사선 설정으로 되돌렸습니다.");
  };

  const bladeLine = activePreview.cutSegment ?? [activePreview.start, activePreview.end];
  const hasVisibleBlade =
    Math.hypot(bladeLine[1].x - bladeLine[0].x, bladeLine[1].y - bladeLine[0].y) >= 1;

  return (
    <section
      aria-label="사선·다각형 컷 분할 나이프"
      className="space-y-3 rounded-xl border border-line/80 bg-card/60 p-2.5 [word-break:keep-all]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-fg [text-wrap:balance]">사선·다각형 컷 나이프</h4>
          <p className="mt-0.5 text-[0.7rem] text-fg-3">
            미리보기 영역을 가로질러 드래그하거나 각도를 고르세요
          </p>
        </div>
        <button
          type="button"
          aria-pressed={snap15Deg}
          onClick={() => setSnap15Deg((prev) => !prev)}
          className={cn(
            INTERACTIVE_BUTTON_BASE,
            "shrink-0",
            snap15Deg
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          15° 맞춤
        </button>
      </div>

      <div className="space-y-1.5">
        <svg
          ref={svgRef}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          role="application"
          tabIndex={0}
          aria-label="사선 컷 분할 미리보기 영역"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handlePadKeyDown}
          className="h-40 w-full cursor-crosshair touch-none rounded-lg border border-line bg-canvas outline-1 -outline-offset-1 outline-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <path
            d={baseOutlinePath}
            className="fill-panel/65 stroke-line"
            strokeWidth={strokeUnit}
            strokeLinejoin="round"
          />
          {activePreview.valid && activePreview.previewSvgPaths ? (
            <>
              <path
                d={activePreview.previewSvgPaths[0]}
                className="fill-accent/15 stroke-accent"
                strokeWidth={strokeUnit * 1.15}
                strokeLinejoin="round"
              />
              <path
                d={activePreview.previewSvgPaths[1]}
                className="fill-cool/15 stroke-cool"
                strokeWidth={strokeUnit * 1.15}
                strokeLinejoin="round"
              />
            </>
          ) : null}
          {hasVisibleBlade ? (
            <>
              <line
                x1={bladeLine[0].x}
                y1={bladeLine[0].y}
                x2={bladeLine[1].x}
                y2={bladeLine[1].y}
                className={activePreview.valid ? "stroke-accent" : "stroke-warn"}
                strokeWidth={strokeUnit * 1.35}
                strokeDasharray={`${strokeUnit * 4} ${strokeUnit * 2.5}`}
                strokeLinecap="round"
              />
              <circle
                cx={bladeLine[0].x}
                cy={bladeLine[0].y}
                r={strokeUnit * 2}
                className={activePreview.valid ? "fill-accent" : "fill-warn"}
              />
              <circle
                cx={bladeLine[1].x}
                cy={bladeLine[1].y}
                r={strokeUnit * 2}
                className={activePreview.valid ? "fill-accent" : "fill-warn"}
              />
            </>
          ) : null}
        </svg>

        <div
          role="status"
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[0.72rem] tabular-nums",
            activePreview.valid
              ? "border-accent/35 bg-accent-soft/45 text-fg"
              : "border-warn/45 bg-warn/10 text-warn",
          )}
        >
          <span className="min-w-0 truncate">{feedback ?? activePreview.statusMessage}</span>
          <span className="shrink-0 font-semibold text-fg-2">여백 {gutterPx}px</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-fg-2">
          <span>빠른 사선 각도</span>
          <span className="tabular-nums text-fg-3">
            {activeDragSession ? `드래그 ${Math.round(activePreview.angleDeg)}°` : formatAngleLabel(angleDeg)}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="사선 각도 빠른 선택">
          {PANEL_KNIFE_ANGLE_PRESETS_DEG.map((presetDeg) => {
            const isActive = !activeDragSession && angleDeg === presetDeg;
            return (
              <button
                key={presetDeg}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setDragSession(null);
                  setAngleDeg(presetDeg);
                  setFeedback(null);
                }}
                className={cn(
                  INTERACTIVE_BUTTON_BASE,
                  "min-w-11 px-1 text-center tabular-nums",
                  isActive
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {presetDeg > 0 ? `+${presetDeg}°` : `${presetDeg}°`}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs text-fg-2">
          <span>컷 여백 폭</span>
          <span className="tabular-nums text-fg-3">{gutterPx}px</span>
        </span>
        <input
          type="range"
          aria-label="나이프 컷 여백 폭"
          min={PANEL_KNIFE_MIN_GUTTER_PX}
          max={PANEL_KNIFE_MAX_GUTTER_PX}
          step={2}
          value={gutterPx}
          onChange={(event) => handleGutterChange(Number(event.target.value))}
          className="h-11 w-full cursor-pointer accent-accent"
        />
      </label>

      <div className="grid grid-cols-5 gap-1" role="group" aria-label="나이프 여백 프리셋">
        {PANEL_KNIFE_GUTTER_PRESETS_PX.map((presetPx) => {
          const isActive = gutterPx === presetPx;
          return (
            <button
              key={presetPx}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleGutterChange(presetPx)}
              className={cn(
                INTERACTIVE_BUTTON_BASE,
                "min-w-11 px-1 text-center tabular-nums",
                isActive
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              {presetPx}px
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 pt-0.5">
        <button
          type="button"
          disabled={!activePreview.valid || !canApply}
          onClick={handleApplySplit}
          className={cn(
            INTERACTIVE_BUTTON_BASE,
            "border-accent bg-accent text-on-accent hover:bg-accent/90",
          )}
        >
          이 선으로 컷 나누기
        </button>
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            INTERACTIVE_BUTTON_BASE,
            "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          초기화
        </button>
      </div>
    </section>
  );
}
