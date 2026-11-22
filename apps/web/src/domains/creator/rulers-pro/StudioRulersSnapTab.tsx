/**
 * 1·2·3·5점 어안 투시자 · N-축 대칭자 · 컷 내 등분 분할자 0ms 자석 펜 스냅 인터랙티브 탭.
 */
import { useRef, useState } from "react";

import {
  buildMagneticRulerOverlayGeometry,
  createMagneticRulerSnapSession,
  createPerspectivePresetConfig,
  snapPointerWithMagneticRuler,
  snapStrokeWithMagneticRuler,
  type DivisionRulerMode,
  type MagneticRulerEngineConfig,
  type MagneticRulerSnapSession,
  type PerspectiveMode,
  type PointerSnapInput,
  type SnapPoint2D,
  type SymmetryMirroredPoint,
  type SymmetryRulerMode,
} from "./studio-perspective-symmetry-ruler-snap";
import { StudioSliderRow, studioSegmentChipClass } from "../studio-panel-ui";

import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";

const PREVIEW_W = 360;
const PREVIEW_H = 240;

const PERSPECTIVE_MODE_OPTIONS: readonly { readonly id: "off" | PerspectiveMode; readonly label: string }[] = [
  { id: "off", label: "꺼짐" },
  { id: "1p", label: "1점" },
  { id: "2p", label: "2점" },
  { id: "3p", label: "3점" },
  { id: "5p-fisheye", label: "5점 어안" },
];

const SYMMETRY_MODE_OPTIONS: readonly { readonly id: SymmetryRulerMode; readonly label: string }[] = [
  { id: "off", label: "없음" },
  { id: "mirror", label: "거울" },
  { id: "quad", label: "4분할" },
  { id: "radial", label: "방사" },
  { id: "kaleidoscope", label: "만화경" },
];

const DIVISION_MODE_OPTIONS: readonly { readonly id: "off" | DivisionRulerMode; readonly label: string }[] = [
  { id: "off", label: "없음" },
  { id: "rule-of-thirds", label: "3분할" },
  { id: "golden-ratio", label: "황금비" },
  { id: "equal", label: "N등분" },
];

function polylineToSvgPath(points: readonly SnapPoint2D[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`)
    .join(" ");
}

export interface StudioRulersSnapTabProps {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly disabled?: boolean;
}

export function StudioRulersSnapTab({
  canvasWidth,
  canvasHeight,
  disabled = false,
}: StudioRulersSnapTabProps): ReactElement {
  const [perspectiveMode, setPerspectiveMode] = useState<"off" | PerspectiveMode>("5p-fisheye");
  const [symmetryMode, setSymmetryMode] = useState<SymmetryRulerMode>("kaleidoscope");
  const [symmetryAxes, setSymmetryAxes] = useState<number>(6);
  const [divisionMode, setDivisionMode] = useState<"off" | DivisionRulerMode>("golden-ratio");
  const [divisionCount, setDivisionCount] = useState<number>(4);

  const [previewRawStroke, setPreviewRawStroke] = useState<readonly SnapPoint2D[]>([]);
  const [previewMirroredStrokes, setPreviewMirroredStrokes] = useState<readonly (readonly SymmetryMirroredPoint[])[]>([]);
  const [snapTelemetry, setSnapTelemetry] = useState<{
    readonly axisId: string | null;
    readonly branchCount: number;
    readonly residualPx: number;
  }>({ axisId: null, branchCount: 1, residualPx: 0 });

  const dragSessionRef = useRef<MagneticRulerSnapSession | null>(null);
  const draggingRef = useRef<boolean>(false);
  const liveRawRef = useRef<SnapPoint2D[]>([]);
  const liveBranchesRef = useRef<SymmetryMirroredPoint[][]>([]);

  const rulerConfig: MagneticRulerEngineConfig = {
    perspective:
      perspectiveMode === "off"
        ? null
        : createPerspectivePresetConfig(perspectiveMode, { width: PREVIEW_W, height: PREVIEW_H }),
    symmetry:
      symmetryMode === "off"
        ? null
        : {
            enabled: true,
            mode: symmetryMode,
            centerX: PREVIEW_W / 2,
            centerY: PREVIEW_H / 2,
            axisAngleDeg: 90,
            axesCount: symmetryAxes,
            snapToAxisThresholdPx: 6,
          },
    division:
      divisionMode === "off"
        ? null
        : {
            enabled: true,
            mode: divisionMode,
            frame: { x: 16, y: 16, width: PREVIEW_W - 32, height: PREVIEW_H - 32 },
            columns: divisionCount,
            rows: divisionCount,
            snapThresholdPx: perspectiveMode === "off" ? 48 : 14,
          },
    priority: "nearest",
  };

  const overlayGeometry = buildMagneticRulerOverlayGeometry(rulerConfig, { width: PREVIEW_W, height: PREVIEW_H });

  const runDeterministicSampleStroke = (): void => {
    const sampleInputs: PointerSnapInput[] = [
      { x: 112, y: 158, pressure: 0.7 },
      { x: 146, y: 162, pressure: 0.85 },
      { x: 184, y: 156, pressure: 0.9 },
      { x: 224, y: 148, pressure: 0.8 },
      { x: 256, y: 136, pressure: 0.65 },
    ];
    const result = snapStrokeWithMagneticRuler(rulerConfig, sampleInputs);
    setPreviewRawStroke(sampleInputs.map((p) => ({ x: p.x, y: p.y })));
    setPreviewMirroredStrokes(result.mirroredStrokes);
    setSnapTelemetry({
      axisId: result.lockedAxisId,
      branchCount: result.mirroredStrokes.length,
      residualPx: result.maxResidualErrorPx,
    });
  };

  const pointerToSvgPoint = (event: ReactPointerEvent<SVGSVGElement>): SnapPoint2D => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = rect.width > 0 ? PREVIEW_W / rect.width : 1;
    const scaleY = rect.height > 0 ? PREVIEW_H / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (disabled) return;
    const pt = pointerToSvgPoint(event);
    const session = createMagneticRulerSnapSession(rulerConfig, { ...pt, pressure: event.pressure || 0.8 });
    const firstStep = snapPointerWithMagneticRuler(session, { ...pt, pressure: event.pressure || 0.8 });
    dragSessionRef.current = firstStep.session;
    draggingRef.current = true;
    liveRawRef.current = [pt];
    liveBranchesRef.current = firstStep.mirroredPoints.map((m) => [m]);
    setPreviewRawStroke([...liveRawRef.current]);
    setPreviewMirroredStrokes(liveBranchesRef.current.map((b) => [...b]));
    setSnapTelemetry({
      axisId: firstStep.axisId,
      branchCount: firstStep.mirroredPoints.length,
      residualPx: firstStep.distanceToGuidePx,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!draggingRef.current || !dragSessionRef.current) return;
    const pt = pointerToSvgPoint(event);
    const step = snapPointerWithMagneticRuler(dragSessionRef.current, { ...pt, pressure: event.pressure || 0.8 });
    dragSessionRef.current = step.session;
    liveRawRef.current.push(pt);
    step.mirroredPoints.forEach((m, idx) => {
      if (!liveBranchesRef.current[idx]) liveBranchesRef.current[idx] = [];
      liveBranchesRef.current[idx]!.push(m);
    });
    setPreviewRawStroke([...liveRawRef.current]);
    setPreviewMirroredStrokes(liveBranchesRef.current.map((b) => [...b]));
    setSnapTelemetry({
      axisId: step.axisId,
      branchCount: step.mirroredPoints.length,
      residualPx: step.distanceToGuidePx,
    });
  };

  const handlePointerUp = (): void => {
    draggingRef.current = false;
    dragSessionRef.current = null;
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-[0.65rem] font-semibold text-fg-3">원근 투시자 (1·2·3·5점 어안)</p>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="투시 모드">
          {PERSPECTIVE_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={perspectiveMode === opt.id}
              onClick={() => setPerspectiveMode(opt.id)}
              className={`${studioSegmentChipClass(perspectiveMode === opt.id)} min-h-9 justify-center px-1 text-[0.63rem] pointer-coarse:min-h-11`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[0.65rem] font-semibold text-fg-3">N-축 대칭자 (실시간 미러 포인트)</p>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="대칭 모드">
          {SYMMETRY_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={symmetryMode === opt.id}
              onClick={() => setSymmetryMode(opt.id)}
              className={`${studioSegmentChipClass(symmetryMode === opt.id)} min-h-9 justify-center px-1 text-[0.63rem] pointer-coarse:min-h-11`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {(symmetryMode === "radial" || symmetryMode === "kaleidoscope") ? (
          <StudioSliderRow
            label="대칭 축 수"
            min={2}
            max={12}
            step={1}
            value={symmetryAxes}
            disabled={disabled}
            onChange={setSymmetryAxes}
            formatReadout={(val) => `${Math.round(val)}축`}
          />
        ) : null}
      </div>

      <div className="space-y-1">
        <p className="text-[0.65rem] font-semibold text-fg-3">컷 내 등분 분할자</p>
        <div className="grid grid-cols-4 gap-1" role="group" aria-label="분할자 모드">
          {DIVISION_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={divisionMode === opt.id}
              onClick={() => setDivisionMode(opt.id)}
              className={`${studioSegmentChipClass(divisionMode === opt.id)} min-h-9 justify-center px-1 text-[0.63rem] pointer-coarse:min-h-11`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {divisionMode === "equal" ? (
          <StudioSliderRow
            label="등분 수"
            min={2}
            max={12}
            step={1}
            value={divisionCount}
            disabled={disabled}
            onChange={setDivisionCount}
            formatReadout={(val) => `${Math.round(val)}등분`}
          />
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
        role="img"
        aria-label="투시 대칭 분할 0ms 자석 스냅 미리보기"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-md border border-line bg-canvas text-fg"
      >
        {overlayGeometry.lines.map((line) => (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="currentColor"
            strokeOpacity={line.category === "symmetry" ? 0.45 : line.category === "division" ? 0.3 : 0.22}
            strokeWidth={line.category === "horizon" || line.category === "symmetry" ? 1.2 : 0.8}
            strokeDasharray={line.category === "division" ? "3 3" : undefined}
          />
        ))}
        {overlayGeometry.polylines.map((guide) => (
          <path
            key={guide.id}
            d={guide.svgPath}
            fill="none"
            stroke="currentColor"
            strokeOpacity={guide.category === "fisheye-rim" ? 0.42 : 0.22}
            strokeWidth={guide.category === "fisheye-rim" ? 1.2 : 0.8}
          />
        ))}
        {overlayGeometry.vanishingPoints.map((vp) => (
          <circle key={vp.id} cx={vp.x} cy={vp.y} r={3.5} className="fill-accent" />
        ))}
        {previewRawStroke.length >= 2 ? (
          <path
            d={polylineToSvgPath(previewRawStroke)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        ) : null}
        {previewMirroredStrokes.map((branch, idx) =>
          branch.length >= 2 ? (
            <path
              key={`branch-${idx}`}
              data-mirror-branch={idx}
              d={polylineToSvgPath(branch)}
              fill="none"
              stroke="currentColor"
              strokeWidth={idx === 0 ? 2.2 : 1.5}
              strokeOpacity={idx === 0 ? 0.96 : 0.72}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
      </svg>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={runDeterministicSampleStroke}
          className="min-h-9 rounded-md border border-line bg-card px-2.5 text-[0.66rem] font-semibold text-fg-2 transition-[background-color,border-color] duration-150 hover:bg-raised disabled:opacity-45 motion-reduce:transition-none pointer-coarse:min-h-11"
        >
          샘플 획 스냅 테스트
        </button>
        <span className="text-[0.63rem] tabular-nums text-fg-3">
          캔버스 {Math.round(canvasWidth)}×{Math.round(canvasHeight)} · 분기 {snapTelemetry.branchCount}개
          {snapTelemetry.axisId ? ` · 축 ${snapTelemetry.axisId}` : ""}
          {snapTelemetry.axisId ? ` · 오차 ${snapTelemetry.residualPx.toFixed(2)}px` : ""}
        </span>
      </div>
    </div>
  );
}
