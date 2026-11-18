/**
 * 곡선 스플라인 말풍선 외곽선 및 다관절 꼬리 지연 드로어 (`StudioBubbleShapePanel` 내부 마운트).
 */
import {
  authorBalloonFromCurveControlPoints,
  buildMultiJointBalloonTail,
  type BalloonPoint2D,
  type MultiJointTailKind,
  type MultiJointTailPlan,
} from "./studio-balloon-pen-and-tails";

import type { ReactElement } from "react";

export interface StudioBalloonPenAndTailsDrawerProps {
  readonly disabled: boolean;
  readonly onConvert: () => void;
  readonly onApplyCurveBalloonPoints?: (points: readonly number[]) => void;
  readonly onApplyMultiJointTail?: (plan: MultiJointTailPlan) => void;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * 상위 편집기에서 별도 꼬리 전용 콜백(`onApplyMultiJointTail`)이 생략된 경우에도
 * 기본 둥근 말풍선 몸통과 다관절 꼬리/생각 방울 외곽선을 단일 폐곡선(`customShapePoints`)으로
 * 용접해 3종 꼬리 버튼이 항상 동작하도록 보장한다.
 */
function mergeBalloonBodyWithTailPlan(plan: MultiJointTailPlan): number[] {
  const vertices: BalloonPoint2D[] = [
    { x: 24, y: 0 },
    { x: 156, y: 0 },
    { x: 174, y: 10 },
    { x: 180, y: 28 },
    { x: 180, y: 92 },
    { x: 174, y: 110 },
    { x: 156, y: 120 },
  ];

  if (plan.polygonVertices.length >= 3) {
    for (let i = plan.polygonVertices.length - 1; i >= 0; i -= 1) {
      vertices.push(plan.polygonVertices[i]!);
    }
  } else if (plan.thoughtDots.length > 0) {
    for (let i = 0; i < plan.thoughtDots.length; i += 1) {
      const dot = plan.thoughtDots[i]!;
      vertices.push({ x: dot.cx + dot.rx, y: dot.cy });
    }
    const lastDot = plan.thoughtDots[plan.thoughtDots.length - 1]!;
    vertices.push({ x: lastDot.cx, y: lastDot.cy + lastDot.ry });
    for (let i = plan.thoughtDots.length - 1; i >= 0; i -= 1) {
      const dot = plan.thoughtDots[i]!;
      vertices.push({ x: dot.cx - dot.rx, y: dot.cy });
    }
  }

  vertices.push(
    { x: 24, y: 120 },
    { x: 6, y: 110 },
    { x: 0, y: 92 },
    { x: 0, y: 28 },
    { x: 6, y: 10 },
  );

  let minX = Infinity;
  let minY = Infinity;
  for (const pt of vertices) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
  }

  const out: number[] = [];
  for (const pt of vertices) {
    out.push(round2(pt.x - minX), round2(pt.y - minY));
  }
  return out;
}

export function StudioBalloonPenAndTailsDrawer({
  disabled,
  onConvert,
  onApplyCurveBalloonPoints,
  onApplyMultiJointTail,
}: StudioBalloonPenAndTailsDrawerProps): ReactElement {
  return (
    <details className="rounded-lg border border-line/60 bg-panel/50 p-1.5 [word-break:keep-all]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-2 py-1 text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised/70">
        <span>곡선 스플라인·다관절 꼬리</span>
      </summary>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 px-1 pb-1">
        <button
          type="button"
          disabled={disabled}
          title="제어점 기반 매끄러운 스플라인 외곽선을 생성합니다."
          onClick={() => {
            const authored = authorBalloonFromCurveControlPoints([
              { x: 24, y: 8 },
              { x: 156, y: 8 },
              { x: 180, y: 64 },
              { x: 156, y: 120 },
              { x: 24, y: 120 },
              { x: 0, y: 64 },
            ]);
            if (authored && onApplyCurveBalloonPoints) {
              onApplyCurveBalloonPoints(authored.customShapePoints);
            } else {
              onConvert();
            }
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:border-accent/45 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          스플라인 곡선 윤곽
        </button>
        {(
          [
            { kind: "speech" as MultiJointTailKind, label: "다관절 대사 꼬리" },
            { kind: "lightning" as MultiJointTailKind, label: "전파·번개 꼬리" },
            { kind: "thought" as MultiJointTailKind, label: "생각 방울 체인" },
          ] as const
        ).map((item) => (
          <button
            key={item.kind}
            type="button"
            disabled={disabled}
            title={`${item.label} 외곽선을 생성해 적용합니다.`}
            onClick={() => {
              const plan = buildMultiJointBalloonTail({
                kind: item.kind,
                root: { x: 90, y: 120 },
                joints: [
                  { x: 78, y: 148 },
                  { x: 102, y: 172 },
                ],
                tip: { x: 84, y: 204 },
              });
              if (onApplyMultiJointTail) {
                onApplyMultiJointTail(plan);
                return;
              }
              const merged = mergeBalloonBodyWithTailPlan(plan);
              if (onApplyCurveBalloonPoints && merged.length >= 6) {
                onApplyCurveBalloonPoints(merged);
              } else {
                onConvert();
              }
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:border-accent/45 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
