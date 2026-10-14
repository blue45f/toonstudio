import { useRef } from "react";

import {
  patchStudioAnimaticCameraKeyframe,
  type StudioAnimaticCameraEasing,
  type StudioAnimaticCameraKeyframe,
  type StudioAnimaticDocument,
  type StudioAnimaticSegment,
} from "../studio-animatic-timeline";
import {
  curvePointsForCameraKeyframe,
  easingCurveSamples,
  normalizeBezierPoints,
  segmentEasingForCameraKeyframe,
} from "./keyframe-curve-model";

const CONTROL = "min-h-11 min-w-11 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const FIELD = `${CONTROL} w-full`;

const PRESET_OPTIONS: readonly { value: Exclude<StudioAnimaticCameraEasing, "custom">; label: string }[] = [
  { value: "linear", label: "일정하게" },
  { value: "ease-in", label: "천천히 시작" },
  { value: "ease-out", label: "천천히 멈춤" },
  { value: "ease-in-out", label: "부드럽게 시작·멈춤" },
  { value: "ease-in-back", label: "뒤로 당겼다 시작" },
  { value: "ease-out-back", label: "지나쳐 멈춤" },
  { value: "hold", label: "멈춰 있다 점프" },
];

const VB_WIDTH = 232;
const VB_HEIGHT = 148;
const PAD = 10;
const PLOT_WIDTH = VB_WIDTH - PAD * 2;
const PLOT_HEIGHT = VB_HEIGHT - PAD * 2;
const Y_MIN = -0.5;
const Y_MAX = 1.5;

function toX(x: number): number {
  return PAD + x * PLOT_WIDTH;
}
function toY(y: number): number {
  return PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * PLOT_HEIGHT;
}

/**
 * 선택한 키프레임까지의 구간 곡선 편집기.
 * 곡선을 직접 그어(핸들 드래그·수치 입력) 가속·감속을 만들면 easing이 custom이 되고,
 * 제어점은 문서에 저장돼 재열기·미리보기·WebM 내보내기에서 같은 움직임으로 재생된다.
 * 프리셋 버튼을 누르면 곡선이 지워지고 프리셋으로 돌아간다.
 */
export function StudioAnimaticKeyframeCurveEditor({ document, segment, keyframe, disabled, onDocumentChange }: {
  document: StudioAnimaticDocument;
  segment: StudioAnimaticSegment;
  keyframe: StudioAnimaticCameraKeyframe;
  disabled: boolean;
  onDocumentChange: (document: StudioAnimaticDocument) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragHandle = useRef<1 | 2 | null>(null);
  const segmentEasing = segmentEasingForCameraKeyframe(keyframe.easing, keyframe.curve);
  const points = curvePointsForCameraKeyframe(keyframe.easing, keyframe.curve);
  const isStep = segmentEasing.kind === "step";
  const samples = easingCurveSamples(segmentEasing, 40);
  const path = samples.map((sample, index) => `${index === 0 ? "M" : "L"}${toX(sample.x).toFixed(1)},${toY(sample.y).toFixed(1)}`).join(" ");

  function commitCurve(next: readonly [number, number, number, number]) {
    onDocumentChange(patchStudioAnimaticCameraKeyframe(document, segment.id, keyframe.at, { curve: normalizeBezierPoints(next) }));
  }
  function pointsFromPointer(event: React.PointerEvent): { x: number; y: number } | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const vx = ((event.clientX - rect.left) / rect.width) * VB_WIDTH;
    const vy = ((event.clientY - rect.top) / rect.height) * VB_HEIGHT;
    return {
      x: Math.round(((vx - PAD) / PLOT_WIDTH) * 100) / 100,
      y: Math.round((Y_MAX - ((vy - PAD) / PLOT_HEIGHT) * (Y_MAX - Y_MIN)) * 100) / 100,
    };
  }
  function dragTo(event: React.PointerEvent) {
    const handle = dragHandle.current;
    if (handle === null || disabled || isStep) return;
    const pos = pointsFromPointer(event);
    if (!pos) return;
    const next: [number, number, number, number] = [points[0], points[1], points[2], points[3]];
    if (handle === 1) {
      next[0] = pos.x;
      next[1] = pos.y;
    } else {
      next[2] = pos.x;
      next[3] = pos.y;
    }
    commitCurve(next);
  }

  return (
    <div className="space-y-2" data-studio-animatic-curve-editor="true">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-fg-2">구간 곡선 · 이 키프레임까지의 가속·감속</p>
        {PRESET_OPTIONS.map((option) => (
          <button key={option.value} type="button" className={CONTROL} disabled={disabled} aria-pressed={keyframe.easing === option.value}
            onClick={() => onDocumentChange(patchStudioAnimaticCameraKeyframe(document, segment.id, keyframe.at, { easing: option.value }))}>
            {option.label}
          </button>
        ))}
        {keyframe.easing === "custom" ? <span className="rounded-lg border border-accent px-3 py-2 text-sm text-accent">직접 그린 곡선</span> : null}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`} className="w-full max-w-md rounded-lg border border-line bg-canvas" role="img"
        aria-label={`보간 곡선 그래프. 제어점 1: 진행 ${Math.round(points[0] * 100)}%, 세기 ${points[1].toFixed(2)}. 제어점 2: 진행 ${Math.round(points[2] * 100)}%, 세기 ${points[3].toFixed(2)}.`}>
        <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(0)} stroke="currentColor" strokeOpacity={0.15} />
        <line x1={toX(0)} y1={toY(1)} x2={toX(1)} y2={toY(1)} stroke="currentColor" strokeOpacity={0.15} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
        {!isStep ? (
          <>
            <line x1={toX(0)} y1={toY(0)} x2={toX(points[0])} y2={toY(points[1])} stroke="currentColor" strokeOpacity={0.4} />
            <line x1={toX(1)} y1={toY(1)} x2={toX(points[2])} y2={toY(points[3])} stroke="currentColor" strokeOpacity={0.4} />
            {([1, 2] as const).map((handle) => (
              <circle key={handle} cx={toX(handle === 1 ? points[0] : points[2])} cy={toY(handle === 1 ? points[1] : points[3])} r={7}
                className="cursor-grab fill-accent" aria-hidden
                onPointerDown={(event) => { dragHandle.current = handle; event.currentTarget.setPointerCapture(event.pointerId); }}
                onPointerMove={dragTo}
                onPointerUp={() => { dragHandle.current = null; }} />
            ))}
          </>
        ) : null}
      </svg>
      {isStep ? (
        <p className="text-xs text-fg-3">홀드는 곡선 대신 구간 끝에서 한 번에 점프해요. 프리셋을 바꾸면 곡선으로 편집할 수 있어요.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            [0, "제어점 1 진행 (%)", 0, 100],
            [1, "제어점 1 세기", -0.5, 1.5],
            [2, "제어점 2 진행 (%)", 0, 100],
            [3, "제어점 2 세기", -0.5, 1.5],
          ] as const).map(([index, label, min, max]) => (
            <label key={index} className="text-xs text-fg-2">{label}
              <input className={FIELD} type="number" min={min} max={max} step={index % 2 === 0 ? 1 : 0.05} disabled={disabled} aria-label={label}
                value={index % 2 === 0 ? Math.round(points[index] * 100) : points[index]}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  if (!Number.isFinite(raw)) return;
                  const next: [number, number, number, number] = [points[0], points[1], points[2], points[3]];
                  next[index] = index % 2 === 0 ? raw / 100 : raw;
                  commitCurve(next);
                }} />
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-3">원과 연결된 손잡이를 끌거나 숫자를 바꾸면 곡선이 바로 저장되고, 미리보기 움직임이 이 곡선과 같아집니다. 세기가 0보다 작거나 1보다 크면 살짝 되돌아가거나 지나치는 움직임이 됩니다.</p>
    </div>
  );
}
