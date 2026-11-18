/**
 * Studio Vector Surgery & Bezier Pen Interactive Section
 *
 * CSP `베지어 곡선 펜(vars 31~33, 607)`, `선 수정(Correct line, vars 175~489)` 7종,
 * `교차점까지 벡터 지우기(EraseVectorCross)`를 실제 벡터 `DrawEl` 목록 위에서 즉시 실행하고
 * SVG 미리보기와 `onStrokesChange`로 반영하는 한국어 인터랙티브 섹션.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 */
import { useState } from "react";

import { eraseVectorStrokeUpToIntersection } from "../brush/studio-eraser-advanced-plan";
import {
  buildDrawElFromBezierPen,
  createInitialBezierPenState,
  reduceStudioBezierPen,
  type BezierPenMode,
} from "../drawing/studio-bezier-pen";
import {
  adjustVectorStrokeWidth,
  connectDrawElStrokes,
  effectiveStrokePointWidthsPx,
  pinchDrawElStroke,
  redrawVectorStrokeSegment,
  redrawVectorStrokeWidth,
  splitVectorStrokeAtParameter,
  toggleVectorCornerSmooth,
} from "./studio-drawel-vector-correction";

import type { DrawEl } from "../studio-element-model";
import type { ReactElement } from "react";

export interface StudioVectorSurgeryInteractiveSectionProps {
  readonly strokes?: readonly DrawEl[];
  readonly onStrokesChange?: (next: DrawEl[]) => void;
  readonly disabled?: boolean;
}

function createInitialSampleStrokes(): DrawEl[] {
  return [
    {
      id: "vec-sample-1",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "gpen",
      points: [14, 42, 60, 18, 110, 42, 158, 28],
      pressures: [0.45, 0.6, 0.55, 0.45],
      stroke: "#1f2937",
      strokeWidth: 3,
    },
    {
      id: "vec-sample-2",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "gpen",
      points: [164, 30, 196, 44, 226, 22],
      pressures: [0.5, 0.65, 0.5],
      stroke: "#1f2937",
      strokeWidth: 3,
    },
    {
      id: "vec-cross-bar",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "gpen",
      points: [85, 6, 85, 58],
      pressures: [0.5, 0.5],
      stroke: "#4b5563",
      strokeWidth: 2.5,
    },
  ];
}

function toSvgPolylinePoints(points: readonly number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push(`${points[i]!.toFixed(1)},${points[i + 1]!.toFixed(1)}`);
  }
  return pairs.join(" ");
}

const ACTION_BTN_CLASS =
  "flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-2 py-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised hover:text-fg disabled:opacity-45 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function StudioVectorSurgeryInteractiveSection({
  strokes: controlledStrokes,
  onStrokesChange,
  disabled = false,
}: StudioVectorSurgeryInteractiveSectionProps): ReactElement {
  const [localStrokes, setLocalStrokes] = useState<DrawEl[]>(createInitialSampleStrokes);
  const [bezierMode, setBezierMode] = useState<BezierPenMode>("cubic-bezier");
  const [lastActionLabel, setLastActionLabel] = useState<string>("기본 샘플 획 준비됨");

  const activeStrokes: readonly DrawEl[] = controlledStrokes ?? localStrokes;
  const primary = activeStrokes[0] ?? null;

  const commitStrokes = (next: DrawEl[], actionLabel: string): void => {
    if (controlledStrokes === undefined) {
      setLocalStrokes(next);
    }
    setLastActionLabel(actionLabel);
    onStrokesChange?.(next);
  };

  const handleAddBezierCurve = (): void => {
    let pen = createInitialBezierPenState(bezierMode);
    pen = reduceStudioBezierPen(pen, { type: "click", x: 18, y: 50 });
    pen = reduceStudioBezierPen(pen, { type: "drag", x: 42, y: 12 });
    pen = reduceStudioBezierPen(pen, { type: "click", x: 120, y: 16 });
    pen = reduceStudioBezierPen(pen, { type: "altDrag", x: 148, y: 52 });
    pen = reduceStudioBezierPen(pen, { type: "click", x: 218, y: 36 });
    pen = reduceStudioBezierPen(pen, { type: "commitOpen" });
    const built = buildDrawElFromBezierPen(pen, {
      id: `bezier-${activeStrokes.length + 1}`,
      stroke: "#0f766e",
      strokeWidth: 3,
      flattenTolerancePx: 0.6,
    });
    if (built) {
      commitStrokes([...activeStrokes, built], "베지어 곡선 추가됨");
    }
  };

  const handlePinch = (): void => {
    if (!primary) return;
    const midIdx = Math.floor(primary.points.length / 4) * 2;
    const fx = primary.points[midIdx] ?? 60;
    const fy = primary.points[midIdx + 1] ?? 24;
    const next0 = pinchDrawElStroke(primary, {
      from: { x: fx, y: fy },
      to: { x: fx, y: Math.max(8, fy - 10) },
      pinchLevel: 6,
      fixEnds: "both",
    });
    commitStrokes([next0, ...activeStrokes.slice(1)], "벡터선 집기 적용됨");
  };

  const handleConnect = (): void => {
    if (activeStrokes.length < 2) return;
    const connected = connectDrawElStrokes(activeStrokes[0]!, activeStrokes[1]!, { maxGapPx: 48 });
    if (connected) {
      commitStrokes([connected, ...activeStrokes.slice(2)], "인접 벡터선 연결됨");
    }
  };

  const handleRedrawSegment = (): void => {
    if (!primary) return;
    const redrawn = redrawVectorStrokeSegment(
      primary,
      { points: [40, 26, 84, 10, 126, 30], pressures: [0.5, 0.85, 0.5] },
      { maxSnapDistPx: 64 },
    );
    commitStrokes([redrawn, ...activeStrokes.slice(1)], "구간 다시 그리기 적용됨");
  };

  const handleRedrawWidth = (): void => {
    if (!primary) return;
    const widthUpdated = redrawVectorStrokeWidth(
      primary,
      { points: [30, 25, 85, 25, 140, 25], pressures: [0.85, 0.95, 0.85] },
      { maxSnapDistPx: 64, featherPx: 8 },
    );
    commitStrokes([widthUpdated, ...activeStrokes.slice(1)], "선폭 다시 그리기 적용됨");
  };

  const handleAdjustWidth = (): void => {
    if (!primary) return;
    const thicker = adjustVectorStrokeWidth(primary, {
      mode: "add",
      amount: 1.2,
      atLeastOnePixel: true,
    });
    commitStrokes([thicker, ...activeStrokes.slice(1)], "선폭 굵게 보정됨");
  };

  const handleSplit = (): void => {
    if (!primary) return;
    const split = splitVectorStrokeAtParameter(primary, 0.5);
    if (split) {
      commitStrokes([split[0], split[1], ...activeStrokes.slice(1)], "중앙 지점 분할됨");
    }
  };

  const handleCornerToggle = (): void => {
    if (!primary || primary.points.length < 6) return;
    const toggled = toggleVectorCornerSmooth(primary, 1, { mode: "auto" });
    commitStrokes([toggled, ...activeStrokes.slice(1)], "모서리 곡률 전환됨");
  };

  const handleCrossErase = (): void => {
    if (!primary) return;
    const n = Math.floor(primary.points.length / 2);
    const mid = Math.floor(n / 2);
    const ex = primary.points[mid * 2] ?? 85;
    const ey = primary.points[mid * 2 + 1] ?? 30;
    const erased = eraseVectorStrokeUpToIntersection(primary, activeStrokes, {
      x: ex,
      y: ey,
      radius: 28,
    });
    if (erased.hit) {
      commitStrokes([...erased.remainingStrokes, ...activeStrokes.slice(1)], "교차점 구간 삭제됨");
    }
  };

  const totalVertices = activeStrokes.reduce((sum, s) => sum + Math.floor(s.points.length / 2), 0);
  const sampleWidthPx = primary ? (effectiveStrokePointWidthsPx(primary)[0] ?? primary.strokeWidth) : 0;

  return (
    <div className="mt-2 space-y-2 border-t border-line/50 pt-2 text-xs [word-break:keep-all]">
      <div className="rounded-lg border border-line bg-canvas/85 p-2">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-fg-3">
          <span>{lastActionLabel}</span>
          <span className="tabular-nums">
            획 {activeStrokes.length}개 · 정점 {totalVertices}점 · 폭 {sampleWidthPx.toFixed(1)}px
          </span>
        </div>
        <svg
          viewBox="0 0 240 64"
          role="img"
          aria-label="벡터선 수술 및 베지어 곡선 실시간 미리보기"
          className="h-14 w-full rounded border border-line/60 bg-card"
        >
          {activeStrokes.map((st) => (
            <polyline
              key={st.id}
              fill="none"
              stroke={st.stroke}
              strokeWidth={Math.min(8, Math.max(1, st.strokeWidth))}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={toSvgPolylinePoints(st.points)}
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="studio-bezier-pen-mode-select">
          곡선 작성 방식
        </label>
        <select
          id="studio-bezier-pen-mode-select"
          aria-label="곡선 작성 방식"
          disabled={disabled}
          value={bezierMode}
          onChange={(e) => setBezierMode(e.target.value as BezierPenMode)}
          className="min-h-11 flex-1 rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45"
        >
          <option value="cubic-bezier">3차 곡선 펜</option>
          <option value="continuous-curve">연속 스플라인 곡선</option>
          <option value="polyline">직선 꺾은선</option>
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={handleAddBezierCurve}
          className={ACTION_BTN_CLASS}
        >
          곡선 획 추가
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="벡터선 수술 실행 도구">
        <button type="button" disabled={disabled || !primary} onClick={handlePinch} className={ACTION_BTN_CLASS}>
          벡터선 집기
        </button>
        <button
          type="button"
          disabled={disabled || activeStrokes.length < 2}
          onClick={handleConnect}
          className={ACTION_BTN_CLASS}
        >
          벡터선 연결
        </button>
        <button type="button" disabled={disabled || !primary} onClick={handleRedrawSegment} className={ACTION_BTN_CLASS}>
          일부 다시 그리기
        </button>
        <button type="button" disabled={disabled || !primary} onClick={handleRedrawWidth} className={ACTION_BTN_CLASS}>
          선폭 다시 그리기
        </button>
        <button type="button" disabled={disabled || !primary} onClick={handleAdjustWidth} className={ACTION_BTN_CLASS}>
          선폭 굵게 수정
        </button>
        <button type="button" disabled={disabled || !primary} onClick={handleSplit} className={ACTION_BTN_CLASS}>
          절반 지점 분할
        </button>
        <button type="button" disabled={disabled || !primary} onClick={handleCornerToggle} className={ACTION_BTN_CLASS}>
          모서리 곡률 전환
        </button>
        <button type="button" disabled={disabled || !primary} onClick={handleCrossErase} className={ACTION_BTN_CLASS}>
          교차점까지 삭제
        </button>
      </div>
    </div>
  );
}
