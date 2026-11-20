/**
 * CSP EX 애니메이션 라이트테이블 · 2D 카메라 뷰파인더 라이브 캔버스 투영 오버레이.
 *
 * `studio-light-table.ts`의 전역/셀 참조 스택과 `studio-anim-camera-2d.ts`의
 * 카메라 프레이밍 사각형·이동 궤적(`locus`)·프레임 눈금을 메인 캔버스 좌표계 위에
 * 실시간 비파괴 투영한다. `isExporting: true` 시 모든 가이드와 라이트테이블 시트를 자동 숨겨
 * 최종 출력물 오염을 원천 차단한다. `React.lazy` 동적 임포트용 독립 모듈이다.
 */

import { Camera, Eye, EyeOff, Grid2X2, Layers, Route } from "lucide-react";
import { useMemo } from "react";

import {
  computeCamera2DFramingRect,
  evaluateCamera2DAtFrame,
  generateCamera2DLocus,
  type StudioAnimCamera2DFolder,
} from "./studio-anim-camera-2d";
import {
  resolveActiveLightTableStack,
  type LightTableSourceKind,
  type StudioLightTableState,
} from "./studio-light-table";

import { cn } from "@/shared/lib/utils";

import type { ReactElement } from "react";

export interface AnimCanvasViewportBounds {
  readonly width: number;
  readonly height: number;
  /** 문서(px) → 화면(px) 배율. */
  readonly zoomScale?: number;
}

export interface StudioAnimCanvasOverlayProps {
  readonly viewport: AnimCanvasViewportBounds;
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly activeCelId: string | null;
  readonly lightTable: StudioLightTableState;
  readonly camera?: StudioAnimCamera2DFolder | null;
  /** true이면 내보내기 출력물 오염 방지를 위해 오버레이 전체를 숨긴다. */
  readonly isExporting?: boolean;
  /** 액션 안전 영역(90%)·타이틀 안전 영역(80%) 표시 여부. */
  readonly showSafeZones?: boolean;
  /** 소스 셀/레이어 ID에 대응하는 미리보기 이미지 URL 리졸버. */
  readonly resolveSourceImageUrl?: (
    sourceId: string,
    sourceKind: LightTableSourceKind,
  ) => string | null;
  readonly onToggleLightTable?: (nextEnabled: boolean) => void;
  readonly onToggleCameraLocus?: (nextShowLocus: boolean) => void;
  readonly onToggleSafeZones?: (nextShowSafeZones: boolean) => void;
  readonly onSelectFrame?: (frame: number) => void;
  readonly className?: string;
}

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const HUD_BUTTON_CLASS = cn(
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold [word-break:keep-all] enabled:active:scale-[0.98]",
  TRANSITION_CLASS,
);

function formatCornersPath(
  corners: readonly { readonly x: number; readonly y: number }[],
  scale: number,
): string {
  if (corners.length === 0) return "";
  return (
    corners
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${(pt.x * scale).toFixed(1)} ${(pt.y * scale).toFixed(1)}`)
      .join(" ") + " Z"
  );
}

function insetCorners(
  center: { readonly x: number; readonly y: number },
  corners: readonly { readonly x: number; readonly y: number }[],
  ratio: number,
): readonly { readonly x: number; readonly y: number }[] {
  return corners.map((pt) => ({
    x: center.x + (pt.x - center.x) * ratio,
    y: center.y + (pt.y - center.y) * ratio,
  }));
}

export function StudioAnimCanvasOverlay({
  viewport,
  currentFrame,
  totalFrames,
  activeCelId,
  lightTable,
  camera = null,
  isExporting = false,
  showSafeZones = true,
  resolveSourceImageUrl,
  onToggleLightTable,
  onToggleCameraLocus,
  onToggleSafeZones,
  onSelectFrame,
  className,
}: StudioAnimCanvasOverlayProps): ReactElement | null {
  const scale = Number.isFinite(viewport.zoomScale) && (viewport.zoomScale ?? 1) > 0.01
    ? (viewport.zoomScale ?? 1)
    : 1;
  const docWidth = Math.max(1, viewport.width);
  const docHeight = Math.max(1, viewport.height);
  const viewWidth = docWidth * scale;
  const viewHeight = docHeight * scale;

  const lightTableStack = useMemo(
    () =>
      resolveActiveLightTableStack(lightTable, {
        activeCelId,
        isExporting,
        pivot: { x: docWidth * 0.5, y: docHeight * 0.5 },
      }),
    [activeCelId, docHeight, docWidth, isExporting, lightTable],
  );

  const cameraEvaluation = useMemo(
    () => (camera && !isExporting ? evaluateCamera2DAtFrame(camera, currentFrame) : null),
    [camera, currentFrame, isExporting],
  );

  const cameraFraming = useMemo(
    () => (camera && !isExporting ? computeCamera2DFramingRect(camera, currentFrame) : null),
    [camera, currentFrame, isExporting],
  );

  const cameraLocus = useMemo(() => {
    if (!camera || !camera.showLocus || isExporting) return null;
    const endFrame = Math.max(0, Math.floor(totalFrames) - 1);
    return generateCamera2DLocus(camera, {
      startFrame: 0,
      endFrame,
      subStepsPerFrame: 4,
      tickHalfLengthPx: 6,
    });
  }, [camera, isExporting, totalFrames]);

  if (isExporting) {
    return null;
  }

  const outerMaskPath = cameraFraming
    ? `M 0 0 L ${viewWidth.toFixed(1)} 0 L ${viewWidth.toFixed(1)} ${viewHeight.toFixed(1)} L 0 ${viewHeight.toFixed(1)} Z ${formatCornersPath(cameraFraming.corners, scale)}`
    : "";

  const actionSafePath = cameraFraming
    ? formatCornersPath(insetCorners(cameraFraming.center, cameraFraming.corners, 0.9), scale)
    : "";
  const titleSafePath = cameraFraming
    ? formatCornersPath(insetCorners(cameraFraming.center, cameraFraming.corners, 0.8), scale)
    : "";

  const locusPoints = cameraLocus
    ? cameraLocus.polyline
        .map((pt) => `${(pt.x * scale).toFixed(1)},${(pt.y * scale).toFixed(1)}`)
        .join(" ")
    : "";

  return (
    <div
      data-testid="studio-anim-canvas-overlay"
      role="region"
      aria-label="애니메이션 라이트테이블 및 2D 카메라 캔버스 오버레이"
      style={{ width: `${viewWidth}px`, height: `${viewHeight}px` }}
      className={cn(
        "pointer-events-none relative overflow-hidden select-none [word-break:keep-all]",
        className,
      )}
    >
      {/* 1. 라이트테이블 참조 셀 라이브 투영 계층 */}
      <div
        data-testid="anim-light-table-projection"
        className="pointer-events-none absolute inset-0"
      >
        {lightTableStack.map((item) => {
          const [a, b, c, d, tx, ty] = item.matrix;
          const scaledMatrix = `matrix(${a}, ${b}, ${c}, ${d}, ${tx * scale}, ${ty * scale})`;
          const imageUrl = resolveSourceImageUrl?.(item.entry.sourceId, item.entry.sourceKind) ?? null;
          return (
            <div
              key={`${item.scope}-${item.entry.id}`}
              data-light-table-entry={item.entry.id}
              data-light-table-scope={item.scope}
              data-tint-mode={item.entry.tintMode}
              style={{
                opacity: item.effectiveOpacity,
                transform: scaledMatrix,
                transformOrigin: "0 0",
              }}
              className={cn(
                "absolute inset-0",
                item.entry.tintMode === "colorize" && "mix-blend-multiply",
              )}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`라이트테이블 참조 ${item.entry.sourceId}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-start justify-start border border-dashed border-cool/70 bg-cool/10 p-2">
                  <span className="rounded bg-panel/85 px-2 py-0.5 text-xs font-medium text-cool">
                    {item.scope === "cel" ? "셀 참조" : "전역 참조"} · {item.entry.sourceId}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. 2D 카메라 뷰파인더 · 안전 영역 · 이동 궤적 SVG */}
      {camera && cameraFraming ? (
        <svg
          data-testid="anim-camera-2d-viewfinder"
          width={viewWidth}
          height={viewHeight}
          className="pointer-events-none absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          {/* 뷰파인더 외곽 어두운 마스크 */}
          <path
            d={outerMaskPath}
            fillRule="evenodd"
            className="fill-panel/45"
          />

          {/* 카메라 2D 프레이밍 외곽선 */}
          <path
            data-testid="anim-camera-frame-path"
            d={formatCornersPath(cameraFraming.corners, scale)}
            className="fill-none stroke-accent"
            strokeWidth={2}
          />

          {/* 액션 안전 영역(90%) & 타이틀 안전 영역(80%) */}
          {showSafeZones ? (
            <>
              <path
                data-testid="anim-camera-action-safe"
                d={actionSafePath}
                className="fill-none stroke-cool/80"
                strokeDasharray="6 4"
                strokeWidth={1.25}
              />
              <path
                data-testid="anim-camera-title-safe"
                d={titleSafePath}
                className="fill-none stroke-warn/75"
                strokeDasharray="3 4"
                strokeWidth={1}
              />
            </>
          ) : null}

          {/* 카메라 중심 십자선 */}
          <line
            x1={cameraFraming.center.x * scale - 10}
            y1={cameraFraming.center.y * scale}
            x2={cameraFraming.center.x * scale + 10}
            y2={cameraFraming.center.y * scale}
            className="stroke-accent"
            strokeWidth={1.5}
          />
          <line
            x1={cameraFraming.center.x * scale}
            y1={cameraFraming.center.y * scale - 10}
            x2={cameraFraming.center.x * scale}
            y2={cameraFraming.center.y * scale + 10}
            className="stroke-accent"
            strokeWidth={1.5}
          />

          {/* 카메라 이동 궤적(Locus) 및 정수 프레임 눈금 */}
          {cameraLocus && locusPoints ? (
            <g data-testid="anim-camera-locus-group">
              <polyline
                points={locusPoints}
                className="fill-none stroke-good"
                strokeWidth={1.75}
              />
              {cameraLocus.frameTicks.map((tick) => (
                <line
                  key={`tick-${tick.frame}`}
                  x1={tick.p1.x * scale}
                  y1={tick.p1.y * scale}
                  x2={tick.p2.x * scale}
                  y2={tick.p2.y * scale}
                  className={tick.isKeyframe ? "stroke-accent" : "stroke-good/80"}
                  strokeWidth={tick.isKeyframe ? 2.5 : 1.25}
                />
              ))}
            </g>
          ) : null}
        </svg>
      ) : null}

      {/* 3. 키프레임 점프 버튼(인터랙티브) */}
      {cameraLocus && onSelectFrame
        ? cameraLocus.frameTicks
            .filter((tick) => tick.isKeyframe)
            .map((tick) => (
              <button
                key={`kf-btn-${tick.frame}`}
                type="button"
                aria-label={`카메라 키프레임 ${tick.frame + 1}프레임으로 이동`}
                onClick={() => onSelectFrame(tick.frame)}
                style={{
                  left: `${tick.x * scale}px`,
                  top: `${tick.y * scale}px`,
                }}
                className={cn(
                  "pointer-events-auto absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent",
                  TRANSITION_CLASS,
                )}
              >
                <span
                  className={cn(
                    "block h-3 w-3 rotate-45 border-2",
                    tick.frame === currentFrame
                      ? "border-on-accent bg-accent"
                      : "border-accent bg-card",
                  )}
                />
              </button>
            ))
        : null}

      {/* 4. 좌상단 컴팩트 상태·토글 HUD (Calm 3~4 컨트롤 예산) */}
      <div className="pointer-events-auto absolute top-2 left-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-panel/92 p-1.5 shadow-xs">
        <button
          type="button"
          aria-pressed={lightTable.enabled}
          onClick={() => onToggleLightTable?.(!lightTable.enabled)}
          className={cn(
            HUD_BUTTON_CLASS,
            lightTable.enabled
              ? "border-accent bg-accent-soft/60 text-fg"
              : "border-line bg-card text-fg-2 hover:bg-raised",
          )}
        >
          {lightTable.enabled ? (
            <Eye size={14} aria-hidden />
          ) : (
            <EyeOff size={14} aria-hidden />
          )}
          <Layers size={14} aria-hidden />
          <span className="tabular-nums">라이트테이블 ({lightTableStack.length})</span>
        </button>

        {camera ? (
          <>
            <button
              type="button"
              aria-pressed={camera.showLocus}
              onClick={() => onToggleCameraLocus?.(!camera.showLocus)}
              className={cn(
                HUD_BUTTON_CLASS,
                camera.showLocus
                  ? "border-good/60 bg-good/15 text-good"
                  : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              <Route size={14} aria-hidden />
              <span>카메라 궤적</span>
            </button>

            <button
              type="button"
              aria-pressed={showSafeZones}
              onClick={() => onToggleSafeZones?.(!showSafeZones)}
              className={cn(
                HUD_BUTTON_CLASS,
                showSafeZones
                  ? "border-cool/60 bg-cool/15 text-cool"
                  : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              <Grid2X2 size={14} aria-hidden />
              <span>안전 영역</span>
            </button>

            {cameraEvaluation ? (
              <span
                data-testid="anim-camera-readout"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-xs font-medium text-fg-2 tabular-nums"
              >
                <Camera size={14} aria-hidden />
                <span>
                  {camera.name} · {Math.round(cameraEvaluation.zoom * 100)}% ·{" "}
                  {Math.round(cameraEvaluation.rotationDeg)}°
                </span>
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default StudioAnimCanvasOverlay;
