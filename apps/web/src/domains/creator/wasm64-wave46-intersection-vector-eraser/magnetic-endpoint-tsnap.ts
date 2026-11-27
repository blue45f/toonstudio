/**
 * Wave-46: 미용접 열린 끝점의 인접 선분 T-스냅 보조 커널.
 *
 * 끝점-끝점 자석 용접 이후에도 열려 남은 끝점을 진행 방향 광선 연장(ray-extension) 또는
 * 각도 가드 기반 최단 투영(closest-point)으로 인접 선분에 밀착시킨다.
 */

import { PolylineSpatialIntersectionIndex } from "./polyline-spatial-intersection-index";
import {
  angleBetweenUnitVectorsDeg,
  distancePointToSegment,
  estimateStrokeOutwardTangent,
  normalizeVector,
  raySegmentIntersection,
  type VectorPoint2D,
} from "./vector-polyline-geometry";

export type TSnapMode = "ray-extension" | "closest-point";

export interface MagneticTSnapRecord {
  readonly strokeId: string;
  readonly end: "start" | "end";
  readonly targetStrokeId: string;
  readonly targetSegmentIndex: number;
  readonly targetT: number;
  readonly snapMode: TSnapMode;
  readonly originalPoint: VectorPoint2D;
  readonly snappedPoint: VectorPoint2D;
  readonly snapDistancePx: number;
}

export interface MutableWeldedStroke {
  readonly id: string;
  readonly points: VectorPoint2D[];
  readonly pressures: number[];
  readonly baseWidthPx?: number;
  readonly closed: boolean;
}

export interface ResidualTSnapConfig {
  readonly tSnapRadiusPx: number;
  readonly tangentSamplePx: number;
  readonly maxTSnapAngleDeg: number;
  readonly minTSnapSine: number;
  readonly cellSizePx: number;
}

export function applyResidualEndpointTSnaps(
  mergedStrokes: readonly MutableWeldedStroke[],
  config: ResidualTSnapConfig,
): readonly MagneticTSnapRecord[] {
  const { tSnapRadiusPx, tangentSamplePx, maxTSnapAngleDeg, minTSnapSine, cellSizePx } = config;
  const tSnaps: MagneticTSnapRecord[] = [];
  if (tSnapRadiusPx <= 0 || mergedStrokes.length < 2) return tSnaps;

  const spatialIndex = new PolylineSpatialIntersectionIndex(mergedStrokes, { cellSizePx, snapTolerancePx: 0 });
  for (const stroke of mergedStrokes) {
    if (stroke.closed || stroke.points.length < 2) continue;
    for (const side of ["start", "end"] as const) {
      const origin = side === "start" ? stroke.points[0] : stroke.points[stroke.points.length - 1];
      const pressure =
        side === "start" ? (stroke.pressures[0] ?? 0.5) : (stroke.pressures[stroke.pressures.length - 1] ?? 0.5);
      if (!origin) continue;
      const outward = estimateStrokeOutwardTangent(stroke.points, side, tangentSamplePx);
      const nearby = spatialIndex.querySegmentsNearPoint(origin, tSnapRadiusPx);

      let best: MagneticTSnapRecord | null = null;
      for (const seg of nearby) {
        if (seg.strokeId === stroke.id) continue;
        const segDir = normalizeVector(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
        if (Math.abs(outward.x * segDir.y - outward.y * segDir.x) < minTSnapSine) continue;

        const rayHit = raySegmentIntersection(origin, outward, seg.a, seg.b);
        if (rayHit !== null && rayHit.rayDist <= tSnapRadiusPx) {
          if (best === null || rayHit.rayDist < best.snapDistancePx) {
            best = {
              strokeId: stroke.id,
              end: side,
              targetStrokeId: seg.strokeId,
              targetSegmentIndex: seg.segmentIndex,
              targetT: rayHit.segT,
              snapMode: "ray-extension",
              originalPoint: { x: origin.x, y: origin.y },
              snappedPoint: rayHit.point,
              snapDistancePx: rayHit.rayDist,
            };
          }
          continue;
        }

        const proj = distancePointToSegment(origin.x, origin.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
        if (proj.distance <= tSnapRadiusPx && proj.distance > 1e-6) {
          const toSnap = normalizeVector(proj.closestX - origin.x, proj.closestY - origin.y);
          if (
            angleBetweenUnitVectorsDeg(outward, toSnap) <= maxTSnapAngleDeg &&
            (best === null || proj.distance < best.snapDistancePx)
          ) {
            best = {
              strokeId: stroke.id,
              end: side,
              targetStrokeId: seg.strokeId,
              targetSegmentIndex: seg.segmentIndex,
              targetT: proj.t,
              snapMode: "closest-point",
              originalPoint: { x: origin.x, y: origin.y },
              snappedPoint: { x: proj.closestX, y: proj.closestY },
              snapDistancePx: proj.distance,
            };
          }
        }
      }

      if (best !== null && best.snapDistancePx > 1e-6) {
        if (side === "start") {
          stroke.points.unshift(best.snappedPoint);
          stroke.pressures.unshift(pressure);
        } else {
          stroke.points.push(best.snappedPoint);
          stroke.pressures.push(pressure);
        }
        tSnaps.push(best);
      }
    }
  }
  return tSnaps;
}
