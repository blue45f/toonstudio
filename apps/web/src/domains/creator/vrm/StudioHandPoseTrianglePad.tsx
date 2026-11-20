import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Lock, RotateCcw, Unlock } from "lucide-react";

import {
  HAND_FINGER_ORDER,
  HAND_TRIANGLE_VERTICES,
  evaluateHandTrianglePose,
  type HandFingerLockMap,
  type HandTriangleEvaluation,
  type HandTrianglePadPoint,
} from "../character-shaper/studio-webtoon-21-body-and-3part-hair";

import type {
  StudioVrmHandFinger,
  StudioVrmHandRotations,
  StudioVrmHandSide,
} from "./studio-vrm-hand-poses";

import { cn } from "@/shared/lib/utils";

const HAND_FINGER_LABELS_KO: Readonly<Record<StudioVrmHandFinger, string>> = Object.freeze({
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  little: "소지",
});

export interface StudioHandPoseTrianglePadProps {
  readonly side: StudioVrmHandSide;
  readonly point: HandTrianglePadPoint;
  readonly lockedFingers: HandFingerLockMap;
  readonly lockedBaselineRotations?: StudioVrmHandRotations;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChangeSide?: (side: StudioVrmHandSide) => void;
  readonly onChangePoint: (point: HandTrianglePadPoint, evaluation: HandTriangleEvaluation) => void;
  readonly onToggleFingerLock: (finger: StudioVrmHandFinger) => void;
}

/**
 * CSP 4영역 핸드 포즈 삼각형 패드 UI.
 * 펴기·쥐기·가리키기·집기 연속 보간과 5손가락 개별 잠금을 제공한다.
 */
export function StudioHandPoseTrianglePad({
  side,
  point,
  lockedFingers,
  lockedBaselineRotations,
  disabled = false,
  className,
  onChangeSide,
  onChangePoint,
  onToggleFingerLock,
}: StudioHandPoseTrianglePadProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const evaluation = useMemo(
    () => evaluateHandTrianglePose(point, side, lockedFingers, lockedBaselineRotations),
    [point, side, lockedFingers, lockedBaselineRotations],
  );

  const commitPoint = (raw: HandTrianglePadPoint) => {
    if (disabled) return;
    const nextEval = evaluateHandTrianglePose(raw, side, lockedFingers, lockedBaselineRotations);
    onChangePoint(nextEval.clampedPoint, nextEval);
  };

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !padRef.current) return;
    if (event.type === "pointermove" && (event.buttons & 1) === 0) return;
    const rect = padRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    commitPoint({ x: nx, y: ny });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 0.1 : 0.04;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitPoint({ x: evaluation.clampedPoint.x - step, y: evaluation.clampedPoint.y });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitPoint({ x: evaluation.clampedPoint.x + step, y: evaluation.clampedPoint.y });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      commitPoint({ x: evaluation.clampedPoint.x, y: evaluation.clampedPoint.y - step });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      commitPoint({ x: evaluation.clampedPoint.x, y: evaluation.clampedPoint.y + step });
    }
  };

  return (
    <section
      aria-label="4영역 손 포즈 삼각형 패드"
      data-testid="studio-hand-pose-triangle-pad"
      className={cn("rounded-xl border border-line bg-card p-3 text-fg", className)}
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-fg">손 포즈 삼각형 컨트롤러</h3>
          <p className="text-[0.6875rem] text-fg-3">
            펴기·쥐기·가리키기·집기 연속 보간 및 손가락 개별 잠금
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-label="손 포즈 중립으로 초기화"
          onClick={() => commitPoint(HAND_TRIANGLE_VERTICES.open)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          펴기
        </button>
      </header>

      {onChangeSide ? (
        <div role="group" aria-label="손 좌우 선택" className="mt-2 grid grid-cols-2 gap-1.5">
          {(["left", "right"] as const).map((handSide) => (
            <button
              key={handSide}
              type="button"
              disabled={disabled}
              aria-pressed={side === handSide}
              onClick={() => onChangeSide(handSide)}
              className={cn(
                "min-h-11 rounded-lg border text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                side === handSide
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              {handSide === "left" ? "왼손" : "오른손"}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={padRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="손 포즈 4영역 보간 패드"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(evaluation.weights.fist * 100)}
        aria-valuetext={`${evaluation.dominantPoseKo} (펴기 ${Math.round(evaluation.weights.open * 100)}%, 쥐기 ${Math.round(evaluation.weights.fist * 100)}%, 가리키기 ${Math.round(evaluation.weights.point * 100)}%, 집기 ${Math.round(evaluation.weights.pinch * 100)}%)`}
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
        onKeyDown={handleKeyDown}
        className="relative mt-2.5 aspect-[1.15/1] w-full cursor-crosshair select-none rounded-lg border border-line bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
          <polygon
            points="50,6 8,92 92,92"
            className="fill-card stroke-line-strong"
            strokeWidth={1.5}
          />
          <line x1={50} y1={6} x2={50} y2={63} className="stroke-line" strokeWidth={0.8} strokeDasharray="2 2" />
          <line x1={8} y1={92} x2={50} y2={63} className="stroke-line" strokeWidth={0.8} strokeDasharray="2 2" />
          <line x1={92} y1={92} x2={50} y2={63} className="stroke-line" strokeWidth={0.8} strokeDasharray="2 2" />
          <circle cx={50} cy={63} r={11} className="fill-accent/15 stroke-accent/60" strokeWidth={1} />
          <circle
            cx={evaluation.clampedPoint.x * 100}
            cy={evaluation.clampedPoint.y * 100}
            r={4.2}
            className="fill-accent stroke-on-accent"
            strokeWidth={1.6}
          />
        </svg>

        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            commitPoint(HAND_TRIANGLE_VERTICES.open);
          }}
          className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-card/90 px-1.5 py-0.5 text-xs font-semibold text-fg-2 hover:text-fg"
        >
          펴기
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            commitPoint(HAND_TRIANGLE_VERTICES.fist);
          }}
          className="absolute bottom-1 left-1 rounded bg-card/90 px-1.5 py-0.5 text-xs font-semibold text-fg-2 hover:text-fg"
        >
          쥐기
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            commitPoint(HAND_TRIANGLE_VERTICES.point);
          }}
          className="absolute bottom-1 right-1 rounded bg-card/90 px-1.5 py-0.5 text-xs font-semibold text-fg-2 hover:text-fg"
        >
          가리키기
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            commitPoint(HAND_TRIANGLE_VERTICES.pinch);
          }}
          className="absolute left-1/2 top-[63%] -translate-x-1/2 -translate-y-1/2 rounded bg-card/85 px-1.5 py-0.5 text-xs font-semibold text-fg"
        >
          집기
        </button>
      </div>

      <div className="mt-2.5">
        <p className="mb-1 text-[0.6875rem] font-semibold text-fg-2">개별 손가락 잠금</p>
        <div className="grid grid-cols-5 gap-1">
          {HAND_FINGER_ORDER.map((finger) => {
            const locked = lockedFingers[finger];
            return (
              <button
                key={finger}
                type="button"
                disabled={disabled}
                aria-pressed={locked}
                aria-label={`${HAND_FINGER_LABELS_KO[finger]} ${locked ? "잠금 해제" : "잠금"}`}
                onClick={() => onToggleFingerLock(finger)}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-[0.6875rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  locked
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised",
                )}
              >
                {locked ? <Lock className="size-3" aria-hidden="true" /> : <Unlock className="size-3" aria-hidden="true" />}
                <span>{HAND_FINGER_LABELS_KO[finger]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p role="status" className="mt-2 text-[0.6875rem] tabular-nums text-fg-3">
        우세 포즈: {evaluation.dominantPoseKo} · 펴기 {Math.round(evaluation.weights.open * 100)}% · 쥐기{" "}
        {Math.round(evaluation.weights.fist * 100)}% · 가리키기 {Math.round(evaluation.weights.point * 100)}% · 집기{" "}
        {Math.round(evaluation.weights.pinch * 100)}%
      </p>
    </section>
  );
}
