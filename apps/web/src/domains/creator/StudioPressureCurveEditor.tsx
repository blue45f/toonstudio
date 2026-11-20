import { Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS,
  addStudioPressureCurvePoint,
  moveStudioPressureCurvePoint,
  normalizeStudioPressureCurvePoints,
  removeStudioPressureCurvePoint,
  studioPressureCurvePreset,
  studioPressureCurveToProfile,
  type StudioPressureCurvePoint as SplineControlPoint,
  type StudioPressureCurvePresetId as SplinePresetId,
} from "./brush/studio-pressure-curve-editor";
import {
  DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  studioStylusPressureProfileMap,
} from "./brush/studio-stylus-pressure-profile";
import {
  getStudioStylusPressureProfileSnapshot,
  setStudioStylusPressureProfile,
  subscribeStudioStylusPressureProfile,
} from "./brush/studio-stylus-pressure-profile-store";
import {
  PRESSURE_CURVE_PRESETS,
  evaluateEffectivePressure,
  evaluatePressureCurve,
  type PressureCurvePresetId,
} from "./drawing/studio-pressure-curve-and-colordrop";
import {
  BRUSH_PRESSURE_CURVE_PRESETS,
  pressureCurvePresetId,
  pressureCurveValueForPreset,
  type BrushPressureCurvePresetId,
} from "./studio-brush";
import { StudioPressureCurveGlyph } from "./studio-creative-visuals";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import {
  studioPressureCurveExponentForPoint,
  studioPressureCurveHandlePoint,
  studioPressureCurveMap,
  studioPressureCurvePathD,
  studioPressureCurveSliderMeta,
} from "./studio-pressure-curve-graph";

import { cn } from "@/shared/lib/utils";

const CHART_W = 160;
const CHART_H = 88;

export type StudioPressureAttributeId = "global" | "size" | "opacity" | "flow" | "smudge";

const ATTRIBUTE_TABS: readonly {
  readonly id: StudioPressureAttributeId;
  readonly label: string;
}[] = [
  { id: "global", label: "전역" },
  { id: "size", label: "크기" },
  { id: "opacity", label: "불투명도" },
  { id: "flow", label: "유량" },
  { id: "smudge", label: "번짐" },
] as const;

const SPLINE_PRESET_BUTTONS: readonly {
  readonly id: SplinePresetId;
  readonly label: string;
}[] = [
  { id: "s-curve", label: "S-커브" },
  { id: "inking", label: "웹툰 잉킹" },
] as const;

const BEZIER_OVERRIDE_BUTTONS: readonly {
  readonly id: PressureCurvePresetId;
  readonly label: string;
}[] = [
  { id: "linear", label: "선형" },
  { id: "soft-ink", label: "부드러운 잉크" },
  { id: "firm-gpen", label: "단단한 G펜" },
  { id: "expressive-brush", label: "강약 붓" },
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pressurePercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function splineCurvePathD(points: readonly SplineControlPoint[], samples = 36): string {
  const profile = studioPressureCurveToProfile(points);
  const parts: string[] = [];
  for (let index = 0; index < samples; index += 1) {
    const x = index / (samples - 1);
    const y = studioStylusPressureProfileMap(x, profile);
    const sx = x * CHART_W;
    const sy = (1 - y) * CHART_H;
    parts.push(`${index === 0 ? "M" : "L"}${sx.toFixed(2)} ${sy.toFixed(2)}`);
  }
  return parts.join(" ");
}

function bezierEffectivePathD(
  globalPreset: PressureCurvePresetId,
  overridePreset: PressureCurvePresetId | null,
  samples = 32,
): string {
  const globalCurve = PRESSURE_CURVE_PRESETS[globalPreset];
  const overrideCurve = overridePreset ? PRESSURE_CURVE_PRESETS[overridePreset] : null;
  const parts: string[] = [];
  for (let index = 0; index < samples; index += 1) {
    const x = index / (samples - 1);
    const y = evaluateEffectivePressure(x, globalCurve, overrideCurve);
    const sx = x * CHART_W;
    const sy = (1 - y) * CHART_H;
    parts.push(`${index === 0 ? "M" : "L"}${sx.toFixed(2)} ${sy.toFixed(2)}`);
  }
  return parts.join(" ");
}

function splinePointsFromBezierPreset(presetId: PressureCurvePresetId): readonly SplineControlPoint[] {
  const curve = PRESSURE_CURVE_PRESETS[presetId];
  return normalizeStudioPressureCurvePoints([
    { input: 0, output: 0 },
    { input: 0.25, output: evaluatePressureCurve(0.25, curve) },
    { input: 0.5, output: evaluatePressureCurve(0.5, curve) },
    { input: 0.75, output: evaluatePressureCurve(0.75, curve) },
    { input: 1, output: 1 },
  ]);
}

export interface StudioPressureCurveEditorProps {
  readonly pressureCurve: number;
  readonly onPressureCurveChange: (value: number) => void;
  readonly density: "compact" | "touch";
  readonly onAttributeCurvesChange?: (
    attribute: StudioPressureAttributeId,
    points: readonly SplineControlPoint[],
  ) => void;
}

export function StudioPressureCurveEditor({
  pressureCurve,
  onPressureCurveChange,
  density,
  onAttributeCurvesChange,
}: StudioPressureCurveEditorProps): ReactElement {
  const stylusProfile = useSyncExternalStore(
    subscribeStudioStylusPressureProfile,
    getStudioStylusPressureProfileSnapshot,
    () => DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  );
  const [activeAttr, setActiveAttr] = useState<StudioPressureAttributeId>("global");
  const [attributeCurves, setAttributeCurves] = useState<
    Partial<Record<StudioPressureAttributeId, readonly SplineControlPoint[]>>
  >({});
  const [selectedSplineIndex, setSelectedSplineIndex] = useState<number | null>(null);
  const [bezierOverrideId, setBezierOverrideId] = useState<PressureCurvePresetId | null>(null);

  const curveId = pressureCurvePresetId(pressureCurve);
  const scalarPathD = studioPressureCurvePathD(pressureCurve, CHART_W, CHART_H, 28);
  const slider = studioPressureCurveSliderMeta(pressureCurve);
  const handle = studioPressureCurveHandlePoint(pressureCurve);
  const handleOutputMinimum = studioPressureCurveMap(handle.x, slider.max);
  const handleOutputMaximum = studioPressureCurveMap(handle.x, slider.min);
  const touch = density === "touch";

  const curvePointerIdRef = useRef<number | null>(null);
  const splinePointerIdRef = useRef<number | null>(null);
  const splineDragIndexRef = useRef<number | null>(null);

  const activePoints = useMemo<readonly SplineControlPoint[]>(() => {
    if (activeAttr === "global") {
      return normalizeStudioPressureCurvePoints(stylusProfile.points);
    }
    return attributeCurves[activeAttr] ?? studioPressureCurvePreset("linear");
  }, [activeAttr, attributeCurves, stylusProfile.points]);

  const interiorCount = Math.max(0, activePoints.length - 2);
  const useSplineRender = interiorCount > 0;
  const activePathD = useMemo(
    () => (useSplineRender ? splineCurvePathD(activePoints) : scalarPathD),
    [activePoints, scalarPathD, useSplineRender],
  );
  const bezierGuidePathD = useMemo(
    () => (bezierOverrideId ? bezierEffectivePathD("linear", bezierOverrideId) : null),
    [bezierOverrideId],
  );

  const commitAttributePoints = (
    attribute: StudioPressureAttributeId,
    nextPoints: readonly SplineControlPoint[],
  ): void => {
    const normalized = normalizeStudioPressureCurvePoints(nextPoints);
    if (attribute === "global") {
      setStudioStylusPressureProfile(
        studioPressureCurveToProfile(normalized, {
          deadZone: stylusProfile.deadZone,
          saturation: stylusProfile.saturation,
        }),
      );
    } else {
      setAttributeCurves((prev) => ({ ...prev, [attribute]: normalized }));
    }
    onAttributeCurvesChange?.(attribute, normalized);
  };

  const setCurveFromPointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!(rect.height > 0)) return;
    const output = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    onPressureCurveChange(studioPressureCurveExponentForPoint(handle.x, output));
  };

  const onCurvePointerDown = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    event.stopPropagation();
    curvePointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Embedded webviews can expose pointer capture methods that still throw.
    }
    setCurveFromPointer(event);
  };

  const onCurvePointerMove = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    setCurveFromPointer(event);
  };

  const finishCurvePointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    setCurveFromPointer(event);
    curvePointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const cancelCurvePointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    curvePointerIdRef.current = null;
  };

  const onCurveKeyDown = (event: KeyboardEvent<SVGCircleElement>): void => {
    let nextExponent: number | null = null;
    // The direct handle represents output, not gamma: Up/Right increases visible output and
    // therefore lowers the exponent. Home/End retain standard slider min/max semantics.
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextExponent = slider.value + slider.step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextExponent = slider.value - slider.step;
    } else if (event.key === "Home") {
      nextExponent = slider.max;
    } else if (event.key === "End") {
      nextExponent = slider.min;
    }
    if (nextExponent === null) return;
    event.preventDefault();
    onPressureCurveChange(clamp(nextExponent, slider.min, slider.max));
  };

  const handleSvgDoubleClick = (event: ReactMouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const input = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const output = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const result = addStudioPressureCurvePoint(activePoints, input, output);
    if (!result.applied) return;
    commitAttributePoints(activeAttr, result.points);
    const closest = result.points.reduce(
      (best, pt, idx) =>
        Math.abs(pt.input - input) < Math.abs(result.points[best]!.input - input) ? idx : best,
      1,
    );
    setSelectedSplineIndex(closest);
  };

  const handleAddInteriorPoint = (): void => {
    if (interiorCount >= STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS) return;
    // Pick midpoint of the widest horizontal gap between consecutive control points.
    let bestGap = 0;
    let bestInput = 0.5;
    let bestOutput = studioPressureCurveMap(0.5, pressureCurve);
    for (let index = 0; index < activePoints.length - 1; index += 1) {
      const left = activePoints[index]!;
      const right = activePoints[index + 1]!;
      const gap = right.input - left.input;
      if (gap > bestGap) {
        bestGap = gap;
        bestInput = (left.input + right.input) * 0.5;
        bestOutput = (left.output + right.output) * 0.5;
      }
    }
    const result = addStudioPressureCurvePoint(activePoints, bestInput, bestOutput);
    if (!result.applied) return;
    commitAttributePoints(activeAttr, result.points);
    const inserted = result.points.findIndex((pt) => Math.abs(pt.input - bestInput) < 0.002);
    setSelectedSplineIndex(inserted > 0 && inserted < result.points.length - 1 ? inserted : 1);
  };

  const handleRemoveSelectedPoint = (): void => {
    if (selectedSplineIndex === null) return;
    const result = removeStudioPressureCurvePoint(activePoints, selectedSplineIndex);
    if (!result.applied) return;
    commitAttributePoints(activeAttr, result.points);
    setSelectedSplineIndex(null);
  };

  const moveSplineFromPointer = (
    pointIndex: number,
    clientX: number,
    clientY: number,
    svg: SVGSVGElement,
  ): void => {
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const input = clamp((clientX - rect.left) / rect.width, 0, 1);
    const output = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    const moved = moveStudioPressureCurvePoint(activePoints, pointIndex, input, output);
    if (moved.applied) commitAttributePoints(activeAttr, moved.points);
  };

  const onSplinePointPointerDown = (
    event: ReactPointerEvent<SVGCircleElement>,
    pointIndex: number,
  ): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    event.stopPropagation();
    splinePointerIdRef.current = event.pointerId;
    splineDragIndexRef.current = pointIndex;
    setSelectedSplineIndex(pointIndex);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom / webview fallback
    }
    const svg = event.currentTarget.ownerSVGElement;
    if (svg) moveSplineFromPointer(pointIndex, event.clientX, event.clientY, svg);
  };

  const onSplinePointPointerMove = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (splinePointerIdRef.current !== event.pointerId) return;
    const idx = splineDragIndexRef.current;
    const svg = event.currentTarget.ownerSVGElement;
    if (idx === null || !svg) return;
    event.preventDefault();
    moveSplineFromPointer(idx, event.clientX, event.clientY, svg);
  };

  const finishSplinePointPointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (splinePointerIdRef.current !== event.pointerId) return;
    splinePointerIdRef.current = null;
    splineDragIndexRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const onSplinePointKeyDown = (
    event: KeyboardEvent<SVGCircleElement>,
    pointIndex: number,
  ): void => {
    const point = activePoints[pointIndex];
    if (!point) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const removed = removeStudioPressureCurvePoint(activePoints, pointIndex);
      if (removed.applied) {
        commitAttributePoints(activeAttr, removed.points);
        setSelectedSplineIndex(null);
      }
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.02;
    let nextInput = point.input;
    let nextOutput = point.output;
    if (event.key === "ArrowLeft") nextInput -= step;
    else if (event.key === "ArrowRight") nextInput += step;
    else if (event.key === "ArrowUp") nextOutput += step;
    else if (event.key === "ArrowDown") nextOutput -= step;
    else return;
    event.preventDefault();
    setSelectedSplineIndex(pointIndex);
    const moved = moveStudioPressureCurvePoint(activePoints, pointIndex, nextInput, nextOutput);
    if (moved.applied) commitAttributePoints(activeAttr, moved.points);
  };

  const applySplinePreset = (presetId: SplinePresetId): void => {
    const points = studioPressureCurvePreset(presetId);
    commitAttributePoints(activeAttr, points);
    setSelectedSplineIndex(null);
    const mid = studioStylusPressureProfileMap(0.5, studioPressureCurveToProfile(points));
    if (activeAttr === "global") {
      onPressureCurveChange(studioPressureCurveExponentForPoint(0.5, mid));
    }
  };

  const applyBezierPreset = (presetId: PressureCurvePresetId): void => {
    setBezierOverrideId(presetId === "linear" ? null : presetId);
    const points = splinePointsFromBezierPreset(presetId);
    commitAttributePoints(activeAttr, points);
    setSelectedSplineIndex(null);
    if (activeAttr === "global") {
      const mid = evaluatePressureCurve(0.5, PRESSURE_CURVE_PRESETS[presetId]);
      onPressureCurveChange(studioPressureCurveExponentForPoint(0.5, mid));
    }
  };

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-fg-2">필압 반응 곡선 (6점 단조 스플라인)</p>
        <span className="tabular-nums text-xs font-semibold text-fg-3">
          γ {slider.value.toFixed(2)} · 점 {interiorCount}/{STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS}
        </span>
      </div>

      {/* 속성별 필압 탭 (전역 · 크기 · 불투명도 · 유량 · 번짐) */}
      <div
        role="tablist"
        aria-label="필압 곡선 적용 속성"
        className="mb-2 grid grid-cols-5 gap-1 rounded-lg border border-line/70 bg-panel p-1"
      >
        {ATTRIBUTE_TABS.map((tab) => {
          const active = activeAttr === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-pressure-attribute-tab={tab.id}
              onClick={() => {
                setActiveAttr(tab.id);
                setSelectedSplineIndex(null);
              }}
              className={cn(
                "min-h-11 rounded-md px-1 text-xs font-semibold transition-colors",
                STUDIO_FOCUS_RING,
                active
                  ? "bg-accent-soft text-accent"
                  : "text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <svg
        aria-label="필압 곡선 직접 편집"
        width="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="mb-2 block h-auto max-h-32 w-full touch-none rounded-lg border border-line/60 bg-canvas/70"
        data-studio-pressure-curve-chart="true"
        data-studio-pressure-attribute={activeAttr}
        onDoubleClick={handleSvgDoubleClick}
      >
        <path
          d={`M0 ${CHART_H} H${CHART_W} M0 0 V${CHART_H}`}
          fill="none"
          stroke="var(--color-line)"
          strokeOpacity={0.75}
          strokeWidth={1}
        />
        <path
          d={`M0 ${CHART_H / 2} H${CHART_W} M${CHART_W / 2} 0 V${CHART_H}`}
          fill="none"
          stroke="var(--color-line)"
          strokeOpacity={0.45}
          strokeWidth={0.75}
          strokeDasharray="3 3"
        />
        <path
          d={`M0 ${CHART_H} L${CHART_W} 0`}
          fill="none"
          stroke="var(--color-fg-3)"
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        {bezierGuidePathD ? (
          <path
            d={bezierGuidePathD}
            fill="none"
            stroke="var(--color-cool)"
            strokeOpacity={0.65}
            strokeWidth={1.3}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        ) : null}
        <path
          d={activePathD}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={handle.x * CHART_W}
          y1={CHART_H}
          x2={handle.x * CHART_W}
          y2={(1 - handle.y) * CHART_H}
          stroke="var(--color-accent)"
          strokeOpacity={0.35}
          strokeWidth={0.8}
          strokeDasharray="2 2"
          pointerEvents="none"
        />
        {/* 기존 스칼라 감마 직접 조작 핸들 (하위 호환 계약 유지) */}
        <circle
          cx={handle.x * CHART_W}
          cy={(1 - handle.y) * CHART_H}
          r={touch ? 18 : 14}
          fill="transparent"
          stroke="transparent"
          role="slider"
          tabIndex={0}
          aria-label="필압 곡선 제어점"
          aria-orientation="vertical"
          aria-valuemin={Math.round(handleOutputMinimum * 100)}
          aria-valuemax={Math.round(handleOutputMaximum * 100)}
          aria-valuenow={Math.round(handle.y * 100)}
          aria-valuetext={`중간 필압 출력 ${pressurePercent(handle.y)} · 감마 ${slider.value.toFixed(2)}`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
          data-studio-pressure-curve-handle="true"
          className="cursor-ns-resize outline-none focus-visible:stroke-2 focus-visible:stroke-accent"
          onPointerDown={onCurvePointerDown}
          onPointerMove={onCurvePointerMove}
          onPointerUp={finishCurvePointer}
          onPointerCancel={cancelCurvePointer}
          onKeyDown={onCurveKeyDown}
        />
        <circle
          cx={handle.x * CHART_W}
          cy={(1 - handle.y) * CHART_H}
          r={4.5}
          fill="var(--color-accent)"
          stroke="var(--color-card)"
          strokeWidth={1.5}
          pointerEvents="none"
          aria-hidden="true"
        />
        {/* 6점 단조 스플라인 내부 제어점 핸들 */}
        {activePoints.slice(1, -1).map((point, offset) => {
          const pointIndex = offset + 1;
          const selected = selectedSplineIndex === pointIndex;
          const cx = point.input * CHART_W;
          const cy = (1 - point.output) * CHART_H;
          return (
            <g key={`spline-${pointIndex}`}>
              <circle
                cx={cx}
                cy={cy}
                r={touch ? 14 : 11}
                fill="transparent"
                stroke="transparent"
                role="slider"
                tabIndex={0}
                aria-label={`스플라인 제어점 ${pointIndex}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(point.output * 100)}
                aria-valuetext={`입력 ${pressurePercent(point.input)}, 출력 ${pressurePercent(point.output)}`}
                data-studio-spline-point-index={pointIndex}
                className="cursor-grab outline-none focus-visible:stroke-2 focus-visible:stroke-accent"
                onFocus={() => setSelectedSplineIndex(pointIndex)}
                onPointerDown={(event) => onSplinePointPointerDown(event, pointIndex)}
                onPointerMove={onSplinePointPointerMove}
                onPointerUp={finishSplinePointPointer}
                onPointerCancel={finishSplinePointPointer}
                onKeyDown={(event) => onSplinePointKeyDown(event, pointIndex)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={selected ? 5 : 3.8}
                fill={selected ? "var(--color-accent)" : "var(--color-card)"}
                stroke="var(--color-accent)"
                strokeWidth={selected ? 2 : 1.5}
                pointerEvents="none"
                aria-hidden="true"
              />
            </g>
          );
        })}
      </svg>

      <p className="mb-2 text-xs leading-relaxed text-fg-3">
        제어점을 위아래로 끌거나 그래프를 더블클릭해 최대 6개 점을 추가합니다. Delete 키로 선택한 점을 지울 수 있습니다.
      </p>

      {/* 멀티포인트 스플라인 제어 액션 바 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="studio-pressure-add-point"
          aria-label="스플라인 제어점 추가"
          disabled={interiorCount >= STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS}
          onClick={handleAddInteriorPoint}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45",
            STUDIO_FOCUS_RING,
          )}
        >
          <Plus size={13} aria-hidden />
          점 추가
        </button>
        <button
          type="button"
          data-testid="studio-pressure-remove-point"
          aria-label="선택한 스플라인 제어점 삭제"
          disabled={selectedSplineIndex === null}
          onClick={handleRemoveSelectedPoint}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45",
            STUDIO_FOCUS_RING,
          )}
        >
          <Trash2 size={13} aria-hidden />
          점 삭제
        </button>
        <button
          type="button"
          data-testid="studio-pressure-reset-curve"
          aria-label="현재 속성 곡선 초기화"
          onClick={() => {
            commitAttributePoints(activeAttr, studioPressureCurvePreset("linear"));
            setSelectedSplineIndex(null);
            setBezierOverrideId(null);
            if (activeAttr === "global") onPressureCurveChange(1);
          }}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised",
            STUDIO_FOCUS_RING,
          )}
        >
          <RotateCcw size={13} aria-hidden />
          초기화
        </button>
      </div>

      {/* 기존 3종 필압 프리셋 (soft / linear / firm) */}
      <div className="mb-2 flex items-center gap-1" role="group" aria-label="필압 프리셋">
        {BRUSH_PRESSURE_CURVE_PRESETS.map((preset) => {
          const active = curveId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={active}
              onClick={() => {
                onPressureCurveChange(
                  pressureCurveValueForPreset(preset.id as BrushPressureCurvePresetId),
                );
                if (preset.id === "soft" || preset.id === "linear" || preset.id === "firm") {
                  commitAttributePoints(activeAttr, studioPressureCurvePreset(preset.id));
                }
              }}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-bold transition-colors",
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line/70 bg-canvas/40 text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              <StudioPressureCurveGlyph curve={preset.id} />
              <span className="hidden sm:inline">{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* 단조 스플라인 & 베지어 웹툰 프리셋 */}
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="스플라인 및 웹툰 필압 프리셋">
        {SPLINE_PRESET_BUTTONS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-spline-preset={preset.id}
            onClick={() => applySplinePreset(preset.id)}
            className={cn(
              "min-h-11 flex-1 rounded-lg border border-line bg-card/60 px-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            {preset.label}
          </button>
        ))}
        {BEZIER_OVERRIDE_BUTTONS.map((preset) => {
          const active = bezierOverrideId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-bezier-preset={preset.id}
              aria-pressed={active}
              onClick={() => applyBezierPreset(preset.id)}
              className={cn(
                "min-h-11 flex-1 rounded-lg border px-2 text-xs font-semibold transition-colors",
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card/60 text-fg-2 hover:border-accent/45 hover:bg-raised",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <label className="flex min-h-11 items-center gap-2 text-fg-3">
        <span className="sr-only">필압 지수 연속 조절</span>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={slider.value}
          onChange={(event) => onPressureCurveChange(Number(event.target.value))}
          aria-valuetext={`감마 ${slider.value.toFixed(2)}`}
          aria-label="필압 반응 강도"
          className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
        />
      </label>
    </>
  );
}
