/**
 * Wave 104 — 장애물 우회 2차 베지어 곡선 말풍선 꼬리 및 생각 구름 방울 라우터.
 *
 * - 화자 입 좌표에서 mouthClearancePx 앞에서 깔끔하게 멈추는 곡선 꼬리 생성
 * - 타 말풍선, 타 캐릭터 얼굴 회피 영역, 기존 꼬리 경로를 피하는 후보 곡선 탐색
 * - 내레이션은 꼬리 생략(none), 생각 구름은 점진적 방울 꼬리(thought-bubbles) 생성
 */

import {
  clamp,
  ellipsePointAtAngle,
  pointDistance,
  pointInRect,
  polylineIntersectsRect,
  polylinesCross,
  rectCenter,
  round2,
  sampleQuadraticBezier,
  type Point2D,
  type Rect2D,
} from "./balloon-geometry-primitives";
import type { BalloonShapeKind } from "./korean-balloon-typography-solver";

export interface TailObstacle {
  readonly id: string;
  readonly kind: "balloon" | "face";
  readonly rect: Rect2D;
}

export interface RouteTailInput {
  readonly balloonId: string;
  readonly balloonRect: Rect2D;
  readonly shape: BalloonShapeKind;
  readonly speakerId: string;
  readonly speakerMouthPoint?: Point2D;
  readonly mouthClearancePx?: number;
  readonly panelBounds: Rect2D;
  readonly obstacles: readonly TailObstacle[];
  readonly existingTailCenterlines?: ReadonlyArray<readonly Point2D[]>;
}

export interface ThoughtBubbleDot {
  readonly cx: number;
  readonly cy: number;
  readonly radiusPx: number;
}

export type BalloonTailKind = "pointed-bezier" | "thought-bubbles" | "none";

export interface RoutedBalloonTail {
  readonly balloonId: string;
  readonly tailKind: BalloonTailKind;
  readonly anchorCenter: Point2D | null;
  readonly baseLeft: Point2D | null;
  readonly baseRight: Point2D | null;
  readonly controlCenter: Point2D | null;
  readonly controlLeft: Point2D | null;
  readonly controlRight: Point2D | null;
  readonly tipPoint: Point2D | null;
  readonly bendOffsetPx: number;
  readonly mouthClearancePx: number;
  readonly actualMouthDistancePx: number | null;
  readonly obstacleCrossings: number;
  readonly crossedObstacleIds: readonly string[];
  readonly centerlineSamples: readonly Point2D[];
  readonly thoughtBubbles: readonly ThoughtBubbleDot[];
}

function emptyTail(balloonId: string, mouthClearancePx: number): RoutedBalloonTail {
  return {
    balloonId,
    tailKind: "none",
    anchorCenter: null,
    baseLeft: null,
    baseRight: null,
    controlCenter: null,
    controlLeft: null,
    controlRight: null,
    tipPoint: null,
    bendOffsetPx: 0,
    mouthClearancePx: round2(mouthClearancePx),
    actualMouthDistancePx: null,
    obstacleCrossings: 0,
    crossedObstacleIds: [],
    centerlineSamples: [],
    thoughtBubbles: [],
  };
}

function computeAnchorBasePair(rect: Rect2D, shape: BalloonShapeKind, angle: number, halfSpanPx: number) {
  const scale = shape === "scream-burst" ? 0.84 : shape === "thought-cloud" ? 0.88 : 0.99;
  const rx = Math.max(8, rect.width * 0.5 * scale);
  const ry = Math.max(8, rect.height * 0.5 * scale);
  const deltaAngle = clamp(halfSpanPx / Math.max(12, Math.sqrt(rx * ry)), 0.08, 0.34);
  return {
    anchorCenter: ellipsePointAtAngle(rect, angle, scale),
    baseLeft: ellipsePointAtAngle(rect, angle - deltaAngle, scale),
    baseRight: ellipsePointAtAngle(rect, angle + deltaAngle, scale),
  };
}

/**
 * 장애물(타 말풍선 및 타 캐릭터 얼굴)을 우회하는 2차 베지어 말풍선 꼬리를 라우팅한다.
 * - `rounded-narration`은 꼬리를 생략(`none`), `thought-cloud`는 점진적 방울 꼬리(`thought-bubbles`) 생성.
 */
export function routeCurvedSpeechBalloonTail(input: RouteTailInput): RoutedBalloonTail {
  const mouthClearancePx =
    input.mouthClearancePx !== undefined && Number.isFinite(input.mouthClearancePx) && input.mouthClearancePx >= 2
      ? input.mouthClearancePx
      : 14;

  if (input.shape === "rounded-narration" || !input.speakerMouthPoint) {
    return emptyTail(input.balloonId, mouthClearancePx);
  }

  const mouth = input.speakerMouthPoint;
  const bCenter = rectCenter(input.balloonRect);
  const rx = Math.max(8, input.balloonRect.width * 0.5);
  const ry = Math.max(8, input.balloonRect.height * 0.5);
  const baseTheta = Math.atan2((mouth.y - bCenter.y) / ry, (mouth.x - bCenter.x) / rx);

  const anchorOffsets = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95];
  const bendRatios = [0, 0.16, -0.16, 0.34, -0.34, 0.55, -0.55, 0.8, -0.8, 1.1, -1.1, 1.45, -1.45];
  const tipAngleOffsets = [0, 0.32, -0.32];
  const existingLines = input.existingTailCenterlines ?? [];

  let bestScore = Number.POSITIVE_INFINITY;
  let bestResult: RoutedBalloonTail | null = null;

  for (let ai = 0; ai < anchorOffsets.length; ai += 1) {
    const halfBase = clamp(Math.min(input.balloonRect.width, input.balloonRect.height) * 0.11, 6, 12);
    const { anchorCenter, baseLeft, baseRight } = computeAnchorBasePair(
      input.balloonRect,
      input.shape,
      baseTheta + anchorOffsets[ai],
      halfBase,
    );

    for (let ti = 0; ti < tipAngleOffsets.length; ti += 1) {
      const tipAngleOffset = tipAngleOffsets[ti];
      const rawDist = pointDistance(anchorCenter, mouth);
      const effClearance = rawDist > mouthClearancePx + 4 ? mouthClearancePx : Math.max(4, rawDist * 0.45);
      const approachAngle = Math.atan2(anchorCenter.y - mouth.y, anchorCenter.x - mouth.x) + tipAngleOffset;
      const tipPoint: Point2D = {
        x: mouth.x + Math.cos(approachAngle) * effClearance,
        y: mouth.y + Math.sin(approachAngle) * effClearance,
      };

      const chordX = tipPoint.x - anchorCenter.x;
      const chordY = tipPoint.y - anchorCenter.y;
      const chordLen = Math.max(1, Math.hypot(chordX, chordY));
      const perpX = -chordY / chordLen;
      const perpY = chordX / chordLen;
      const midX = (anchorCenter.x + tipPoint.x) * 0.5;
      const midY = (anchorCenter.y + tipPoint.y) * 0.5;

      for (let bi = 0; bi < bendRatios.length; bi += 1) {
        const bendRatio = bendRatios[bi];
        const bendPx = bendRatio * Math.max(24, chordLen);
        const ctrlCenter: Point2D = { x: midX + perpX * bendPx, y: midY + perpY * bendPx };
        const ctrlLeft: Point2D = {
          x: ctrlCenter.x + (baseLeft.x - anchorCenter.x) * 0.44,
          y: ctrlCenter.y + (baseLeft.y - anchorCenter.y) * 0.44,
        };
        const ctrlRight: Point2D = {
          x: ctrlCenter.x + (baseRight.x - anchorCenter.x) * 0.44,
          y: ctrlCenter.y + (baseRight.y - anchorCenter.y) * 0.44,
        };

        const centerSamples = sampleQuadraticBezier(anchorCenter, ctrlCenter, tipPoint, 18);
        const leftSamples = sampleQuadraticBezier(baseLeft, ctrlLeft, tipPoint, 14);
        const rightSamples = sampleQuadraticBezier(baseRight, ctrlRight, tipPoint, 14);

        const crossedIds: string[] = [];
        for (let oi = 0; oi < input.obstacles.length; oi += 1) {
          const obs = input.obstacles[oi];
          if (
            polylineIntersectsRect(centerSamples, obs.rect) ||
            polylineIntersectsRect(leftSamples, obs.rect) ||
            polylineIntersectsRect(rightSamples, obs.rect)
          ) {
            crossedIds.push(obs.id);
          }
        }

        let outOfPanel = 0;
        for (let si = 0; si < centerSamples.length; si += 1) {
          if (!pointInRect(centerSamples[si], input.panelBounds, 1)) outOfPanel += 1;
        }
        let tailCrossCount = 0;
        for (let ei = 0; ei < existingLines.length; ei += 1) {
          if (polylinesCross(centerSamples, existingLines[ei])) tailCrossCount += 1;
        }

        const score =
          crossedIds.length * 1_000_000 +
          outOfPanel * 200_000 +
          tailCrossCount * 80_000 +
          Math.abs(tipAngleOffset) * 180 +
          Math.abs(anchorOffsets[ai]) * 120 +
          Math.abs(bendRatio) * 65 +
          chordLen * 0.15;

        if (score < bestScore) {
          bestScore = score;
          const isThought = input.shape === "thought-cloud";
          const bubbles: ThoughtBubbleDot[] = isThought
            ? [
                { t: 0.25, r: 7.2 },
                { t: 0.58, r: 5.0 },
                { t: 0.88, r: 3.3 },
              ].map(({ t, r }) => {
                const mt = 1 - t;
                return {
                  cx: round2(mt * mt * anchorCenter.x + 2 * mt * t * ctrlCenter.x + t * t * tipPoint.x),
                  cy: round2(mt * mt * anchorCenter.y + 2 * mt * t * ctrlCenter.y + t * t * tipPoint.y),
                  radiusPx: r,
                };
              })
            : [];

          bestResult = {
            balloonId: input.balloonId,
            tailKind: isThought ? "thought-bubbles" : "pointed-bezier",
            anchorCenter: { x: round2(anchorCenter.x), y: round2(anchorCenter.y) },
            baseLeft: { x: round2(baseLeft.x), y: round2(baseLeft.y) },
            baseRight: { x: round2(baseRight.x), y: round2(baseRight.y) },
            controlCenter: { x: round2(ctrlCenter.x), y: round2(ctrlCenter.y) },
            controlLeft: { x: round2(ctrlLeft.x), y: round2(ctrlLeft.y) },
            controlRight: { x: round2(ctrlRight.x), y: round2(ctrlRight.y) },
            tipPoint: { x: round2(tipPoint.x), y: round2(tipPoint.y) },
            bendOffsetPx: round2(bendPx),
            mouthClearancePx: round2(mouthClearancePx),
            actualMouthDistancePx: round2(pointDistance(tipPoint, mouth)),
            obstacleCrossings: crossedIds.length,
            crossedObstacleIds: crossedIds,
            centerlineSamples: centerSamples.map((pt) => ({ x: round2(pt.x), y: round2(pt.y) })),
            thoughtBubbles: bubbles,
          };
        }
      }
    }
  }

  return bestResult ?? emptyTail(input.balloonId, mouthClearancePx);
}
