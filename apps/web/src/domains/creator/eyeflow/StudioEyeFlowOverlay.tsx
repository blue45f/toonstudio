/**
 * 비침습적 SVG 시선 동선(Eye-Flow) 및 말풍선 꼬리 얼굴/눈 가림 오버레이.
 *
 * - 토글(`visible`)이 꺼져 있으면 아무 노드도 마운트하지 않는다(`>= 82%` 캔버스 점유율 보호).
 * - 켜졌을 때는 `pointer-events-none` 얇은 SVG 레이어만 얹어 드로잉·선택·스크롤을 방해하지 않는다.
 * - 원시 색상 없이 시맨틱 디자인 토큰(`text-accent`, `text-warn`, `text-bad`, `text-good`,
 *   `text-panel`, `text-fg`)과 `currentColor`를 사용해 라이트/다크/고대비 테마에 자동 적응한다.
 * - 무한 애니메이션이나 과도한 모션을 쓰지 않으며 `prefers-reduced-motion`을 준수한다.
 */
import { useId, type ReactElement } from "react";

import type {
  EyeFlowAnalysisResult,
  EyeFlowSegment,
  TailOcclusionWarning,
} from "./studio-eyeflow-types";

import { cn } from "@/shared/lib/utils";

export interface StudioEyeFlowOverlayProps {
  readonly analysis: EyeFlowAnalysisResult;
  readonly visible: boolean;
  readonly className?: string;
  /** 접근성 라벨 접두어(페이지 이름 등). */
  readonly label?: string;
}

function segmentStrokeClass(segment: EyeFlowSegment): string {
  if (segment.severity === "critical") return "text-bad";
  if (segment.severity === "warning") return "text-warn";
  return "text-accent";
}

function occlusionToneClass(occlusion: TailOcclusionWarning): string {
  return occlusion.severity === "critical" ? "text-bad" : "text-warn";
}

function buildCurvedPath(fromX: number, fromY: number, toX: number, toY: number): string {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  // 미세한 곡률로 겹치는 직선 동선을 읽기 쉽게 분리한다.
  const bend = Math.min(28, dist * 0.08);
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = (fromX + toX) / 2 + nx * bend;
  const cy = (fromY + toY) / 2 + ny * bend;
  return `M ${fromX} ${fromY} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${toX} ${toY}`;
}

export function StudioEyeFlowOverlay({
  analysis,
  visible,
  className,
  label = "시선 동선 및 말풍선 꼬리 가림 오버레이",
}: StudioEyeFlowOverlayProps): ReactElement | null {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/gu, "");

  if (!visible) return null;
  if (
    analysis.nodes.length === 0 &&
    analysis.occlusions.length === 0 &&
    analysis.tailCrossings.length === 0
  ) {
    return null;
  }

  const arrowOkId = `eyeflow-arrow-ok-${uid}`;
  const arrowWarnId = `eyeflow-arrow-warn-${uid}`;
  const arrowBadId = `eyeflow-arrow-bad-${uid}`;

  const occludedBalloonIds = new Set(analysis.occlusions.map((item) => item.balloonId));
  const occludedFaceIds = new Set(analysis.occlusions.map((item) => item.faceId));
  const reversalTargetIds = new Set(analysis.reversals.map((item) => item.toBalloonId));

  const markerForSegment = (segment: EyeFlowSegment): string => {
    if (segment.severity === "critical") return `url(#${arrowBadId})`;
    if (segment.severity === "warning") return `url(#${arrowWarnId})`;
    return `url(#${arrowOkId})`;
  };

  return (
    <svg
      role="img"
      aria-label={`${label} — ${analysis.summaryKo}`}
      data-studio-eyeflow-overlay="true"
      data-eyeflow-direction={analysis.direction}
      data-eyeflow-pattern={analysis.detectedPattern}
      data-eyeflow-reversals={analysis.reversals.length}
      data-eyeflow-occlusions={analysis.occlusions.length}
      data-eyeflow-tail-crossings={analysis.tailCrossings.length}
      data-eyeflow-spoiler-risks={analysis.spoilerRisks.length}
      viewBox={`0 0 ${analysis.canvasWidth} ${analysis.canvasHeight}`}
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute inset-0 z-20 size-full select-none overflow-visible",
        className,
      )}
    >
      <defs>
        <marker
          id={arrowOkId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
          className="text-accent"
        >
          <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="currentColor" />
        </marker>
        <marker
          id={arrowWarnId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
          className="text-warn"
        >
          <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="currentColor" />
        </marker>
        <marker
          id={arrowBadId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
          className="text-bad"
        >
          <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="currentColor" />
        </marker>
      </defs>

      {/* 1) 캐릭터 얼굴·눈 보호 영역(가림이 감지된 얼굴은 강조 점선, 정상 얼굴은 얇은 기준선) */}
      {analysis.faces.map((face) => {
        const isOccluded = occludedFaceIds.has(face.id);
        return (
          <g
            key={`face-${face.id}`}
            data-eyeflow-face-id={face.id}
            data-eyeflow-face-occluded={isOccluded ? "true" : "false"}
            className={isOccluded ? "text-bad" : "text-fg-3"}
          >
            <rect
              x={face.faceBounds.x}
              y={face.faceBounds.y}
              width={face.faceBounds.width}
              height={face.faceBounds.height}
              rx={8}
              fill="currentColor"
              fillOpacity={isOccluded ? 0.1 : 0.03}
              stroke="currentColor"
              strokeWidth={isOccluded ? 2.5 : 1.5}
              strokeDasharray="6 4"
            />
            <rect
              x={face.resolvedEyeBounds.x}
              y={face.resolvedEyeBounds.y}
              width={face.resolvedEyeBounds.width}
              height={face.resolvedEyeBounds.height}
              rx={4}
              fill="currentColor"
              fillOpacity={isOccluded ? 0.18 : 0.06}
              stroke="currentColor"
              strokeWidth={isOccluded ? 2 : 1}
              strokeDasharray="3 3"
            />
          </g>
        );
      })}

      {/* 2) Z-패턴 시선 동선 화살표(정상=얇은 점선, 역주행=경고/위험 실선 + 역주행 뱃지) */}
      {analysis.segments.map((segment) => {
        const midX = (segment.from.x + segment.to.x) / 2;
        const midY = (segment.from.y + segment.to.y) / 2;
        const toneClass = segmentStrokeClass(segment);
        return (
          <g
            key={segment.id}
            data-eyeflow-segment-id={segment.id}
            data-eyeflow-reversal={segment.isReversal ? "true" : "false"}
            className={toneClass}
          >
            <path
              d={buildCurvedPath(segment.from.x, segment.from.y, segment.to.x, segment.to.y)}
              fill="none"
              stroke="currentColor"
              strokeWidth={segment.isReversal ? 4 : 2.5}
              strokeOpacity={segment.isReversal ? 0.92 : 0.72}
              strokeDasharray={segment.isReversal ? undefined : "8 6"}
              strokeLinecap="round"
              markerEnd={markerForSegment(segment)}
            />
            {segment.isReversal ? (
              <g transform={`translate(${midX.toFixed(1)}, ${midY.toFixed(1)})`}>
                <rect
                  x={-36}
                  y={-12}
                  width={72}
                  height={24}
                  rx={12}
                  className="fill-panel"
                  stroke="currentColor"
                  strokeWidth={2}
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="currentColor"
                  fontSize={12}
                  fontWeight={700}
                >
                  역주행
                </text>
              </g>
            ) : null}
          </g>
        );
      })}

      {/* 3) 말풍선 꼬리/본체 얼굴·눈 가림 경고 지점 및 권장 꼬리 보정 목표점 */}
      {analysis.occlusions.map((occlusion) => {
        const toneClass = occlusionToneClass(occlusion);
        const badgeLabel =
          occlusion.kind === "tail-crosses-eyes" || occlusion.kind === "body-covers-eyes"
            ? "눈 가림"
            : "얼굴 가림";
        return (
          <g
            key={occlusion.id}
            data-eyeflow-occlusion-id={occlusion.id}
            data-eyeflow-occlusion-kind={occlusion.kind}
            className={toneClass}
          >
            {occlusion.tailBase && occlusion.originalTailTip ? (
              <line
                x1={occlusion.tailBase.x}
                y1={occlusion.tailBase.y}
                x2={occlusion.originalTailTip.x}
                y2={occlusion.originalTailTip.y}
                stroke="currentColor"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeOpacity={0.9}
              />
            ) : null}

            {/* 교차 지점 경고 링 + X 마커 */}
            <circle
              cx={occlusion.intersectionPoint.x}
              cy={occlusion.intersectionPoint.y}
              r={11}
              className="fill-panel"
              stroke="currentColor"
              strokeWidth={2.5}
            />
            <path
              d={`M ${occlusion.intersectionPoint.x - 4} ${occlusion.intersectionPoint.y - 4} L ${occlusion.intersectionPoint.x + 4} ${occlusion.intersectionPoint.y + 4} M ${occlusion.intersectionPoint.x + 4} ${occlusion.intersectionPoint.y - 4} L ${occlusion.intersectionPoint.x - 4} ${occlusion.intersectionPoint.y + 4}`}
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
            />

            {/* 경고 뱃지 */}
            <g
              transform={`translate(${occlusion.intersectionPoint.x.toFixed(1)}, ${(occlusion.intersectionPoint.y - 24).toFixed(1)})`}
            >
              <rect
                x={-36}
                y={-11}
                width={72}
                height={22}
                rx={11}
                className="fill-panel"
                stroke="currentColor"
                strokeWidth={2}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                fontSize={12}
                fontWeight={700}
              >
                {badgeLabel}
              </text>
            </g>

            {/* 권장 꼬리 보정선 및 목표 링 */}
            {occlusion.tailBase && occlusion.recommendedTailTip ? (
              <g className="text-good" data-eyeflow-recommended-tip="true">
                <line
                  x1={occlusion.tailBase.x}
                  y1={occlusion.tailBase.y}
                  x2={occlusion.recommendedTailTip.x}
                  y2={occlusion.recommendedTailTip.y}
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
                <circle
                  cx={occlusion.recommendedTailTip.x}
                  cy={occlusion.recommendedTailTip.y}
                  r={7}
                  className="fill-panel"
                  stroke="currentColor"
                  strokeWidth={2.5}
                />
                <circle
                  cx={occlusion.recommendedTailTip.x}
                  cy={occlusion.recommendedTailTip.y}
                  r={2.5}
                  fill="currentColor"
                />
              </g>
            ) : null}
          </g>
        );
      })}

      {/* 3-b) 말풍선 꼬리 간 X-교차 경고 지점 */}
      {analysis.tailCrossings.map((crossing) => {
        const toneClass = crossing.severity === "critical" ? "text-bad" : "text-warn";
        return (
          <g
            key={crossing.id}
            data-eyeflow-crossing-id={crossing.id}
            className={toneClass}
          >
            <circle
              cx={crossing.intersectionPoint.x}
              cy={crossing.intersectionPoint.y}
              r={10}
              className="fill-panel"
              stroke="currentColor"
              strokeWidth={2.5}
            />
            <path
              d={`M ${crossing.intersectionPoint.x - 4} ${crossing.intersectionPoint.y - 4} L ${crossing.intersectionPoint.x + 4} ${crossing.intersectionPoint.y + 4} M ${crossing.intersectionPoint.x + 4} ${crossing.intersectionPoint.y - 4} L ${crossing.intersectionPoint.x - 4} ${crossing.intersectionPoint.y + 4}`}
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <g
              transform={`translate(${crossing.intersectionPoint.x.toFixed(1)}, ${(crossing.intersectionPoint.y - 22).toFixed(1)})`}
            >
              <rect
                x={-36}
                y={-11}
                width={72}
                height={22}
                rx={11}
                className="fill-panel"
                stroke="currentColor"
                strokeWidth={2}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                fontSize={12}
                fontWeight={700}
              >
                꼬리 교차
              </text>
            </g>
          </g>
        );
      })}

      {/* 4) 말풍선 읽기 순번 번호 배지 */}
      {analysis.nodes.map((node) => {
        const hasOcclusion = occludedBalloonIds.has(node.balloonId);
        const hasReversal = reversalTargetIds.has(node.balloonId);
        const badgeTone = hasOcclusion
          ? "text-bad"
          : hasReversal
            ? "text-warn"
            : "text-accent";
        return (
          <g
            key={`node-${node.balloonId}`}
            data-eyeflow-node-id={node.balloonId}
            data-eyeflow-sequence={node.sequenceNumber}
            transform={`translate(${node.center.x.toFixed(1)}, ${node.center.y.toFixed(1)})`}
            className={badgeTone}
          >
            <circle
              cx={0}
              cy={0}
              r={15}
              className="fill-panel"
              stroke="currentColor"
              strokeWidth={2.5}
            />
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              fontSize={13}
              fontWeight={700}
            >
              {node.sequenceNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
