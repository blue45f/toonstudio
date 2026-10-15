/**
 * Studio 3D SketchUp-Style Inference & Measurement Engine — 호환 어댑터.
 *
 * 후보 선택·호버 기준점 정렬·격자 스냅의 계산은 단일 추론 파이프라인
 * (`bg3d/studio-bg3d-inference-engine.ts`)이 하고, 이 클래스는 기존 공개 API(월드 거리 허용오차,
 * `InferenceType` 이름, 한국어 라벨, `guideRay`)를 그대로 지키기 위한 매핑만 남긴다.
 * 선분 최근접점·중간점 같은 기하 보조는 파이프라인의 수학 모듈을 쓴다.
 * 3D 치수/각도 측정과 경계 상자 계산은 이 파일 고유 기능이다.
 *
 * 변경 이력: 호버 기준점 정렬의 "가장 먼저 맞은 축" 선택 대신 파이프라인의 "가장 가까운 정렬선" 규칙을 쓴다.
 */

import { resolveStudioBg3dAdhocInference } from "../bg3d/studio-bg3d-inference-adhoc";
import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
  studioBg3dInferenceAxisVector,
} from "../bg3d/studio-bg3d-inference-kinds";
import { closestPointOnLine, closestPointOnSegment, distance, midpoint } from "../bg3d/studio-bg3d-inference-math";

import type { StudioBg3dInferenceAxis } from "../bg3d/studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "../bg3d/studio-bg3d-inference-math";

export type InferenceType =
  | "endpoint"
  | "midpoint"
  | "center"
  | "edge-nearest"
  | "face-centroid"
  | "intersection"
  | "axis-x"
  | "axis-y"
  | "axis-z"
  | "parallel"
  | "perpendicular"
  | "tangent"
  | "angle-snap"
  | "grid";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface LineSegment3D {
  id: string;
  start: Point3D;
  end: Point3D;
  label?: string;
}

export interface InferenceCandidate {
  point: Point3D;
  type: InferenceType;
  label: string;
  sourceId?: string;
  axisDirection?: [number, number, number];
}

export interface InferenceSnapResult {
  snappedPoint: Point3D;
  type: InferenceType;
  label: string;
  distance: number;
  guideRay?: {
    origin: Point3D;
    direction: Point3D;
    colorHex: string;
  };
}

export interface MeasurementResult {
  distance: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  pitchDeg: number; // 수직 각도
  yawDeg: number;   // 수평 각도
  formattedMetric: string;
  formattedImperial: string;
}

export interface BoundingBox3DResult {
  min: Point3D;
  max: Point3D;
  center: Point3D;
  width: number;  // X축 크기
  height: number; // Y축 크기
  depth: number;  // Z축 크기
  volume: number; // m³
}

/** 허용오차(월드 m)를 화면 px 임계값으로 바꿀 때 쓰는 기준 px. 허용오차 = 이 px × px당 월드 길이. */
const TOLERANCE_PX = 10;

const AXIS_LABELS: Readonly<Record<StudioBg3dInferenceAxis, string>> = Object.freeze({
  x: "X축 정렬 (Red Axis)",
  y: "Y축 정렬 (Green Axis)",
  z: "Z축 정렬 (Blue Axis)",
});

const AXIS_TYPES: Readonly<Record<StudioBg3dInferenceAxis, InferenceType>> = Object.freeze({
  x: "axis-x",
  y: "axis-y",
  z: "axis-z",
});

function toVec(point: Point3D): StudioBg3dInferenceVec3 {
  return [point.x, point.y, point.z];
}

function toPoint(vector: StudioBg3dInferenceVec3): Point3D {
  return { x: vector[0], y: vector[1], z: vector[2] };
}

export class Studio3DInferenceEngine {
  private snapTolerance: number;
  private activeAxisLock: "x" | "y" | "z" | "none" = "none";
  private hoveredReferencePoints: Point3D[] = [];
  private maxHoveredRefs = 4;

  constructor(snapTolerance = 0.15) {
    this.snapTolerance = snapTolerance;
  }

  public setSnapTolerance(tolerance: number): void {
    this.snapTolerance = Math.max(0.01, Math.min(2.0, tolerance));
  }

  public setAxisLock(axis: "x" | "y" | "z" | "none"): void {
    this.activeAxisLock = axis;
  }

  public getAxisLock(): "x" | "y" | "z" | "none" {
    return this.activeAxisLock;
  }

  /**
   * 임시 추론 기준점(Hover Reference Point)을 등록합니다.
   */
  public registerHoverReference(point: Point3D): void {
    const isDuplicate = this.hoveredReferencePoints.some(
      (p) => distance(toVec(p), toVec(point)) < 0.05,
    );
    if (!isDuplicate) {
      this.hoveredReferencePoints.push({ ...point });
      if (this.hoveredReferencePoints.length > this.maxHoveredRefs) {
        this.hoveredReferencePoints.shift();
      }
    }
  }

  public clearHoverReferences(): void {
    this.hoveredReferencePoints = [];
  }

  /**
   * 커서 위치에서 가장 적합한 스냅 포인트를 판별합니다.
   * 우선순위는 후보 점 > 호버 기준점 정렬 > 격자이며, 모두 단일 추론 파이프라인이 고른다.
   */
  public findBestSnap(
    cursor: Point3D,
    candidates: InferenceCandidate[],
    gridSize = 0.5,
  ): InferenceSnapResult | null {
    let effectiveCursor = toVec(cursor);

    // 축 잠금: 마지막 호버 기준점을 지나는 축선 위로 커서를 투영한다 (축 방향 성분만 남긴다).
    const lastReference = this.hoveredReferencePoints[this.hoveredReferencePoints.length - 1];
    if (this.activeAxisLock !== "none" && lastReference) {
      effectiveCursor = closestPointOnLine(
        effectiveCursor,
        toVec(lastReference),
        studioBg3dInferenceAxisVector(this.activeAxisLock),
      ).point;
    }

    const outcome = resolveStudioBg3dAdhocInference({
      // 후보의 종류(type)는 호출자가 붙인 이름일 뿐이라 파이프라인에는 모두 끝점으로 넘기고, 결과에서 되돌린다.
      points: candidates.map((candidate, index) => ({
        id: `candidate-${index}`,
        point: toVec(candidate.point),
        label: candidate.label,
        kind: "endpoint" as const,
      })),
      cursorPoint: effectiveCursor,
      worldPerPixel: this.snapTolerance / TOLERANCE_PX,
      hoverReferences: this.hoveredReferencePoints.map(toVec),
      grid: gridSize > 0 ? { step: gridSize } : null,
      thresholds: { pointPx: TOLERANCE_PX, edgePx: TOLERANCE_PX, alignPx: TOLERANCE_PX },
      enabledKinds: new Set(["endpoint", "from-point", "grid"]),
    });
    if (!outcome.ok) return null;
    const { result } = outcome;
    const snappedDistance = distance(effectiveCursor, result.point);

    if (result.kind === "endpoint") {
      const index = Number(result.sourceIds[0]?.replace("candidate-", ""));
      const candidate = candidates[index];
      if (!candidate) return null;
      return {
        snappedPoint: { ...candidate.point },
        type: candidate.type,
        label: candidate.label,
        distance: snappedDistance,
        guideRay: this.resolveGuideRay(candidate.type, candidate.point),
      };
    }
    if (result.kind === "from-point" && result.axis && result.alignmentOrigin) {
      const axis = result.axis;
      const direction = studioBg3dInferenceAxisVector(axis);
      return {
        snappedPoint: toPoint(result.point),
        type: AXIS_TYPES[axis],
        label: AXIS_LABELS[axis],
        distance: snappedDistance,
        guideRay: {
          origin: toPoint(result.alignmentOrigin),
          direction: toPoint(direction),
          colorHex: STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].hex,
        },
      };
    }
    if (result.kind === "grid") {
      return {
        snappedPoint: toPoint(result.point),
        type: "grid",
        label: `격자 (${gridSize}m)`,
        distance: snappedDistance,
      };
    }
    return null;
  }

  /**
   * 두 점 사이의 중간점(Midpoint) 계산
   */
  public computeMidpoint(p1: Point3D, p2: Point3D): Point3D {
    return toPoint(midpoint(toVec(p1), toVec(p2)));
  }

  /**
   * 선분 위의 가장 가까운 점(Nearest Point on Edge) 계산
   */
  public computeNearestPointOnSegment(point: Point3D, segment: LineSegment3D): Point3D {
    return toPoint(closestPointOnSegment(toVec(point), toVec(segment.start), toVec(segment.end)).point);
  }

  /**
   * 두 3D 점 사이의 정밀 치수(Distance & Dimension) 측정
   */
  public measureDistance(p1: Point3D, p2: Point3D): MeasurementResult {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const distance = Math.hypot(dx, dy, dz);

    const pitchRad = Math.asin(distance > 0 ? dy / distance : 0);
    const yawRad = Math.atan2(dx, dz);

    const pitchDeg = Math.round(((pitchRad * 180) / Math.PI) * 10) / 10;
    const yawDeg = Math.round(((yawRad * 180) / Math.PI) * 10) / 10;

    const meters = Math.round(distance * 1000) / 1000;
    const feet = Math.round(distance * 3.28084 * 100) / 100;
    const inches = Math.round(distance * 39.3701 * 10) / 10;

    return {
      distance,
      deltaX: Math.round(dx * 1000) / 1000,
      deltaY: Math.round(dy * 1000) / 1000,
      deltaZ: Math.round(dz * 1000) / 1000,
      pitchDeg,
      yawDeg,
      formattedMetric: `${meters}m (${Math.round(meters * 100)}cm)`,
      formattedImperial: `${feet}' (${inches}")`,
    };
  }

  /**
   * 세 점을 이용한 각도(Protractor Angle) 측정
   */
  public measureAngle(vertex: Point3D, p1: Point3D, p2: Point3D): number {
    const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y, z: p1.z - vertex.z };
    const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y, z: p2.z - vertex.z };

    const len1 = Math.hypot(v1.x, v1.y, v1.z);
    const len2 = Math.hypot(v2.x, v2.y, v2.z);
    if (len1 === 0 || len2 === 0) return 0;

    const dot = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (len1 * len2);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angleRad = Math.acos(clampedDot);

    return Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
  }

  /**
   * 3D 정점군에서 Bounding Box 및 부피(Volume) 계산
   */
  public calculateBoundingBox(points: readonly Point3D[]): BoundingBox3DResult {
    if (points.length === 0) {
      const zero: Point3D = { x: 0, y: 0, z: 0 };
      return { min: zero, max: zero, center: zero, width: 0, height: 0, depth: 0, volume: 0 };
    }

    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
      width: Math.round(width * 1000) / 1000,
      height: Math.round(height * 1000) / 1000,
      depth: Math.round(depth * 1000) / 1000,
      volume: Math.round(width * height * depth * 1000) / 1000,
    };
  }

  private resolveGuideRay(type: InferenceType, point: Point3D): { origin: Point3D; direction: Point3D; colorHex: string } | undefined {
    switch (type) {
      case "axis-x":
      case "axis-y":
      case "axis-z": {
        const axis = type.slice(-1) as StudioBg3dInferenceAxis;
        return {
          origin: point,
          direction: toPoint(studioBg3dInferenceAxisVector(axis)),
          colorHex: STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].hex,
        };
      }
      case "endpoint":
      case "midpoint":
      case "center":
        return { origin: point, direction: { x: 0, y: 1, z: 0 }, colorHex: STUDIO_BG3D_INFERENCE_KIND_STYLE[type].hex };
      default:
        return undefined;
    }
  }
}
