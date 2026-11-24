/**
 * Wave 38B — 태블릿 플로팅 듀얼 휠 · 모바일 엄지 호(Thumb-Arc) 도크 ·
 * 엣지 스크럽 · 2.5× 오프셋 정밀 루페 인터랙티브 뷰.
 *
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 44×44px 터치 타깃 · 명시적 label htmlFor 연결).
 */

import {
  Crosshair,
  Eraser,
  Hand,
  Lasso,
  Layers,
  Minus,
  PenTool,
  Pipette,
  Plus,
  RotateCcw,
  RotateCw,
  Undo2,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  adjustTabletLeftWheel,
  adjustTabletRightWheel,
  computeMobileThumbArcDock,
  solveMobileEdgeScrub,
  solvePrecisionLoupePlacement,
  toggleMobileHandedness,
  type Handedness,
  type MobileEdgeScrubResult,
  type MobileThumbActionId,
  type Point2D,
  type TabletDualWheelState,
  type TabletLeftDialMode,
  type TabletRightDialMode,
} from "./orbital-wheel-engine";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_CONTROL = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised break-keep ${FOCUS_RING}`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none break-keep ${FOCUS_RING}`;

const MOBILE_DOCK_ICONS: Readonly<Record<MobileThumbActionId, LucideIcon>> = {
  brush: PenTool,
  eraser: Eraser,
  eyedropper: Pipette,
  lasso: Lasso,
  undo: Undo2,
  layers: Layers,
};

const MOBILE_LOGICAL_VIEWPORT = { width: 390, height: 680 } as const;

const LOUPE_SPOT_PRESETS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly point: Point2D;
}[] = [
  { id: "center", labelKo: "중앙 선화", point: { x: 196, y: 310 } },
  { id: "top-left", labelKo: "좌상단 끝", point: { x: 26, y: 34 } },
  { id: "top-right", labelKo: "우상단 끝", point: { x: 364, y: 34 } },
  { id: "bottom-right", labelKo: "우하단 끝", point: { x: 356, y: 540 } },
];

export interface StudioTabletDualWheelViewProps {
  readonly flippedHorizontal: boolean;
  readonly tabletState: TabletDualWheelState;
  readonly onTabletStateChange: (next: TabletDualWheelState) => void;
}

export function StudioTabletDualWheelView({
  flippedHorizontal,
  tabletState,
  onTabletStateChange,
}: StudioTabletDualWheelViewProps): ReactElement {
  const leftModes: readonly { readonly id: TabletLeftDialMode; readonly labelKo: string }[] = [
    { id: "brush-size", labelKo: "굵기" },
    { id: "opacity", labelKo: "불투명도" },
    { id: "layer-switch", labelKo: "레이어" },
  ];
  const rightModes: readonly { readonly id: TabletRightDialMode; readonly labelKo: string }[] = [
    { id: "rotation", labelKo: "회전" },
    { id: "zoom", labelKo: "줌" },
    { id: "undo-scrub", labelKo: "기록" },
  ];
  const activeLayerLabel = tabletState.layerNames[tabletState.activeLayerIndex] ?? "인물 선화";

  return (
    <div data-testid="stage-tablet-dual-wheel" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.15fr_1fr]">
        {/* 왼손 플로팅 휠 */}
        <div className="flex flex-col justify-between gap-3 rounded-xl bg-panel p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">왼손 휠</span>
            <span className="text-xs text-fg-2 tabular-nums">
              {tabletState.leftMode === "brush-size"
                ? `${tabletState.brushSizePx}px`
                : tabletState.leftMode === "opacity"
                  ? `${tabletState.opacityPct}%`
                  : activeLayerLabel}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="왼손 휠 제어 대상">
            {leftModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                data-testid={`tablet-left-mode-${mode.id}`}
                aria-pressed={tabletState.leftMode === mode.id}
                onClick={() => onTabletStateChange({ ...tabletState, leftMode: mode.id })}
                className={tabletState.leftMode === mode.id ? BTN_CHIP_ACTIVE : BTN_CONTROL}
              >
                {mode.labelKo}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              data-testid="tablet-left-dec"
              aria-label="왼손 휠 값 줄이기"
              onClick={() => onTabletStateChange(adjustTabletLeftWheel(tabletState, -1))}
              className={BTN_CONTROL}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="text-center">
              <div className="text-sm font-semibold text-fg tabular-nums">
                {tabletState.leftMode === "brush-size"
                  ? `${tabletState.brushSizePx}px`
                  : tabletState.leftMode === "opacity"
                    ? `${tabletState.opacityPct}%`
                    : `${tabletState.activeLayerIndex + 1} / ${tabletState.layerNames.length}`}
              </div>
              <div className="text-xs text-fg-3 break-keep">{activeLayerLabel}</div>
            </div>
            <button
              type="button"
              data-testid="tablet-left-inc"
              aria-label="왼손 휠 값 늘리기"
              onClick={() => onTabletStateChange(adjustTabletLeftWheel(tabletState, 1))}
              className={BTN_CONTROL}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 중앙 태블릿 캔버스 프리뷰 */}
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-canvas p-4">
          <svg viewBox="0 0 180 140" className="h-32 w-44" aria-hidden="true">
            <g
              transform={`translate(90 70) rotate(${tabletState.canvasRotationDeg}) scale(${flippedHorizontal ? -1 : 1} 1) translate(-90 -70)`}
            >
              <rect
                x="26"
                y="18"
                width="128"
                height="104"
                rx="8"
                fill="var(--color-card)"
                stroke="var(--color-line-strong)"
                strokeWidth="1.5"
              />
              <circle
                cx="90"
                cy="68"
                r={Math.min(34, Math.max(6, tabletState.brushSizePx * 0.42))}
                fill="var(--color-accent-soft)"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                fillOpacity={tabletState.opacityPct / 100}
              />
              <line
                x1="44"
                y1="36"
                x2="134"
                y2="36"
                stroke="var(--color-line)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>
          </svg>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-fg-2 tabular-nums">
            <span>각도 {tabletState.canvasRotationDeg}°</span>
            <span>배율 {tabletState.zoomPct}%</span>
            <span>굵기 {tabletState.brushSizePx}px</span>
          </div>
        </div>

        {/* 오른손 플로팅 휠 */}
        <div className="flex flex-col justify-between gap-3 rounded-xl bg-panel p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">오른손 휠</span>
            <span className="text-xs text-fg-2 tabular-nums">
              {tabletState.rightMode === "rotation"
                ? `${tabletState.canvasRotationDeg}°`
                : tabletState.rightMode === "zoom"
                  ? `${tabletState.zoomPct}%`
                  : `${tabletState.undoCursor}/${tabletState.undoMax}`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="오른손 휠 제어 대상">
            {rightModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                data-testid={`tablet-right-mode-${mode.id}`}
                aria-pressed={tabletState.rightMode === mode.id}
                onClick={() => onTabletStateChange({ ...tabletState, rightMode: mode.id })}
                className={tabletState.rightMode === mode.id ? BTN_CHIP_ACTIVE : BTN_CONTROL}
              >
                {mode.labelKo}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              data-testid="tablet-right-dec"
              aria-label="오른손 휠 반시계 방향"
              onClick={() => onTabletStateChange(adjustTabletRightWheel(tabletState, -1))}
              className={BTN_CONTROL}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="tablet-right-reset"
              onClick={() =>
                onTabletStateChange({
                  ...tabletState,
                  canvasRotationDeg: 0,
                  rotationSnappedCardinalDeg: 0,
                  zoomPct: 100,
                  lastFeedbackKo: "캔버스 회전 0° · 배율 100%로 맞췄어요",
                })
              }
              className={BTN_CONTROL}
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>정렬</span>
            </button>
            <button
              type="button"
              data-testid="tablet-right-inc"
              aria-label="오른손 휠 시계 방향"
              onClick={() => onTabletStateChange(adjustTabletRightWheel(tabletState, 1))}
              className={BTN_CONTROL}
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <p data-testid="tablet-dual-wheel-feedback" className="text-xs text-fg-2 break-keep">
        {tabletState.lastFeedbackKo}
      </p>
    </div>
  );
}

export interface StudioMobileThumbDockViewProps {
  readonly onMobileAction: (actionId: MobileThumbActionId, labelKo: string) => void;
}

export function StudioMobileThumbDockView({
  onMobileAction,
}: StudioMobileThumbDockViewProps): ReactElement {
  const brushSliderId = useId();
  const opacitySliderId = useId();

  const [mobileHandedness, setMobileHandedness] = useState<Handedness>("right");
  const [activeMobileTool, setActiveMobileTool] = useState<MobileThumbActionId>("brush");
  const [loupeTouchPoint, setLoupeTouchPoint] = useState<Point2D>({ x: 196, y: 310 });
  const [mobileBrushSize, setMobileBrushSize] = useState(18);
  const [mobileOpacity, setMobileOpacity] = useState(85);
  const [lastEdgeScrub, setLastEdgeScrub] = useState<MobileEdgeScrubResult>(() =>
    solveMobileEdgeScrub({
      edge: "left",
      startX: 12,
      startY: 360,
      currentY: 332,
      viewport: MOBILE_LOGICAL_VIEWPORT,
      handedness: "right",
      startValue: 18,
    }),
  );

  const mobileDockLayout = useMemo(
    () => computeMobileThumbArcDock(MOBILE_LOGICAL_VIEWPORT, mobileHandedness),
    [mobileHandedness],
  );

  const loupePlacement = useMemo(
    () =>
      solvePrecisionLoupePlacement({
        touchPoint: loupeTouchPoint,
        viewport: MOBILE_LOGICAL_VIEWPORT,
        handedness: mobileHandedness,
        magnification: 2.5,
      }),
    [loupeTouchPoint, mobileHandedness],
  );

  const handleEdgeScrubChange = (side: "left" | "right", nextPct: number) => {
    const isBrushEdge =
      (mobileHandedness === "right" && side === "left") ||
      (mobileHandedness === "left" && side === "right");
    const minVal = isBrushEdge ? 1 : 5;
    const maxVal = isBrushEdge ? 120 : 100;
    const currentValue = isBrushEdge ? mobileBrushSize : mobileOpacity;
    const startNorm = (currentValue - minVal) / (maxVal - minVal);
    const targetNorm = nextPct / 100;
    const scrubSpanPx = MOBILE_LOGICAL_VIEWPORT.height * 0.45;
    const startY = 360;
    const currentY = startY - (targetNorm - startNorm) * scrubSpanPx;

    const result = solveMobileEdgeScrub({
      edge: side,
      startX: side === "left" ? 10 : MOBILE_LOGICAL_VIEWPORT.width - 10,
      startY,
      currentY,
      viewport: MOBILE_LOGICAL_VIEWPORT,
      handedness: mobileHandedness,
      startValue: currentValue,
      previousDetentIndex: Math.round(startNorm * 20),
    });

    setLastEdgeScrub(result);
    if (result.target === "brush-size") {
      setMobileBrushSize(result.value);
    } else {
      setMobileOpacity(result.value);
    }
  };

  const brushPct = Math.round(((mobileBrushSize - 1) / 119) * 100);
  const opacityPctNorm = Math.round(((mobileOpacity - 5) / 95) * 100);
  const hapticLabel =
    lastEdgeScrub.hapticPatternMs.length > 0 ? `${lastEdgeScrub.hapticPatternMs.join(" · ")}ms` : "대기";

  return (
    <div data-testid="stage-mobile-thumb-dock" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-testid="mobile-handedness-toggle"
          onClick={() => setMobileHandedness((prev) => toggleMobileHandedness(prev))}
          className={BTN_CHIP_ACTIVE}
        >
          <Hand className="h-4 w-4" aria-hidden="true" />
          <span>
            {mobileHandedness === "right"
              ? "오른손 엄지 도크 (1탭 반전)"
              : "왼손 엄지 도크 (1탭 반전)"}
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2 tabular-nums">
          <span
            data-testid="mobile-loupe-clearance"
            className="rounded-md bg-good/15 px-2.5 py-1 font-medium text-good"
          >
            2.5× 루페 여유 {Math.max(0, loupePlacement.fingerClearancePx)}px
          </span>
          <span data-testid="mobile-edge-haptic" className="rounded-md bg-raised px-2.5 py-1 text-fg">
            햅틱 {hapticLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-xl bg-canvas p-3">
          <svg
            viewBox={`0 0 ${MOBILE_LOGICAL_VIEWPORT.width} ${MOBILE_LOGICAL_VIEWPORT.height}`}
            data-testid="mobile-ergonomics-svg"
            className="mx-auto h-72 w-full max-w-[230px]"
            aria-hidden="true"
          >
            <rect
              x="4"
              y="4"
              width={MOBILE_LOGICAL_VIEWPORT.width - 8}
              height={MOBILE_LOGICAL_VIEWPORT.height - 8}
              rx="28"
              fill="var(--color-panel)"
              stroke="var(--color-line-strong)"
              strokeWidth="2"
            />
            <rect x="12" y="140" width="10" height="260" rx="5" fill="var(--color-raised)" />
            <rect
              x="12"
              y={140 + (260 * (100 - brushPct)) / 100}
              width="10"
              height={(260 * brushPct) / 100}
              rx="5"
              fill="var(--color-accent)"
            />
            <rect
              x={MOBILE_LOGICAL_VIEWPORT.width - 22}
              y="140"
              width="10"
              height="260"
              rx="5"
              fill="var(--color-raised)"
            />
            <rect
              x={MOBILE_LOGICAL_VIEWPORT.width - 22}
              y={140 + (260 * (100 - opacityPctNorm)) / 100}
              width="10"
              height={(260 * opacityPctNorm) / 100}
              rx="5"
              fill="var(--color-cool)"
            />

            <line
              x1={loupePlacement.touchPoint.x}
              y1={loupePlacement.touchPoint.y}
              x2={loupePlacement.loupeCenter.x}
              y2={loupePlacement.loupeCenter.y}
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <circle
              cx={loupePlacement.touchPoint.x}
              cy={loupePlacement.touchPoint.y}
              r="26"
              fill="var(--color-raised)"
              stroke="var(--color-line-strong)"
              strokeWidth="2"
              fillOpacity="0.65"
            />
            <circle
              cx={loupePlacement.touchPoint.x}
              cy={loupePlacement.touchPoint.y}
              r="4"
              fill="var(--color-accent)"
            />
            <circle
              cx={loupePlacement.loupeCenter.x}
              cy={loupePlacement.loupeCenter.y}
              r={loupePlacement.loupeRadiusPx}
              fill="var(--color-card)"
              stroke="var(--color-accent)"
              strokeWidth="3"
            />
            <line
              x1={loupePlacement.loupeCenter.x - 16}
              y1={loupePlacement.loupeCenter.y}
              x2={loupePlacement.loupeCenter.x + 16}
              y2={loupePlacement.loupeCenter.y}
              stroke="var(--color-accent)"
              strokeWidth="1.5"
            />
            <line
              x1={loupePlacement.loupeCenter.x}
              y1={loupePlacement.loupeCenter.y - 16}
              x2={loupePlacement.loupeCenter.x}
              y2={loupePlacement.loupeCenter.y + 16}
              stroke="var(--color-accent)"
              strokeWidth="1.5"
            />

            <circle
              cx={mobileDockLayout.pivot.x}
              cy={mobileDockLayout.pivot.y}
              r={mobileDockLayout.arcRadiusPx}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
            {mobileDockLayout.buttons.map((btn) => (
              <circle
                key={btn.id}
                cx={btn.x}
                cy={btn.y}
                r="24"
                fill={activeMobileTool === btn.id ? "var(--color-accent)" : "var(--color-card)"}
                stroke={
                  activeMobileTool === btn.id ? "var(--color-accent)" : "var(--color-line-strong)"
                }
                strokeWidth="2"
              />
            ))}
          </svg>
        </div>

        <div className="flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Crosshair className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>2.5× 오프셋 루페 위치 테스트</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {LOUPE_SPOT_PRESETS.map((spot) => (
                <button
                  key={spot.id}
                  type="button"
                  data-testid={`loupe-spot-${spot.id}`}
                  onClick={() => setLoupeTouchPoint(spot.point)}
                  className={
                    loupeTouchPoint.x === spot.point.x && loupeTouchPoint.y === spot.point.y
                      ? BTN_CHIP_ACTIVE
                      : BTN_CONTROL
                  }
                >
                  {spot.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-line/60 pt-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-fg-2">
                <label htmlFor={brushSliderId}>가장자리 스크럽 · 브러시 굵기</label>
                <span data-testid="mobile-edge-brush-value" className="font-semibold text-fg tabular-nums">
                  {mobileBrushSize}px
                </span>
              </div>
              <input
                id={brushSliderId}
                type="range"
                data-testid="mobile-edge-brush-slider"
                min={0}
                max={100}
                value={brushPct}
                onChange={(e) =>
                  handleEdgeScrubChange(
                    mobileHandedness === "right" ? "left" : "right",
                    Number(e.target.value),
                  )
                }
                className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
              />
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-fg-2">
                <label htmlFor={opacitySliderId}>가장자리 스크럽 · 불투명도</label>
                <span data-testid="mobile-edge-opacity-value" className="font-semibold text-fg tabular-nums">
                  {mobileOpacity}%
                </span>
              </div>
              <input
                id={opacitySliderId}
                type="range"
                data-testid="mobile-edge-opacity-slider"
                min={0}
                max={100}
                value={opacityPctNorm}
                onChange={(e) =>
                  handleEdgeScrubChange(
                    mobileHandedness === "right" ? "right" : "left",
                    Number(e.target.value),
                  )
                }
                className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 border-t border-line/60 pt-3">
            {mobileDockLayout.buttons.map((btn) => {
              const Icon = MOBILE_DOCK_ICONS[btn.id];
              const isSelected = activeMobileTool === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  data-testid={`mobile-thumb-btn-${btn.id}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setActiveMobileTool(btn.id);
                    onMobileAction(btn.id, btn.labelKo);
                  }}
                  className={isSelected ? BTN_CHIP_ACTIVE : BTN_CONTROL}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{btn.labelKo}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
