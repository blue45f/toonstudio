/**
 * 커서(점 또는 레이)를 "화면 px 기준 거리 측정기"로 감싸는 순수 모듈.
 *
 * 엔진은 후보까지의 거리를 항상 화면 px로 비교한다. 점 커서는 한 깊이의 px 크기를 쓰고, 레이 커서는
 * 후보의 깊이마다 px 크기가 달라지는 원근(또는 직교) 투영을 반영한다. 이렇게 한곳에 가두면 엔진의
 * 나머지 로직은 커서 종류를 신경 쓰지 않는다.
 */

import { STUDIO_BG3D_INFERENCE_BUDGET, STUDIO_BG3D_INFERENCE_UP_AXIS } from "./studio-bg3d-inference-kinds";
import {
  STUDIO_BG3D_INFERENCE_MAX_WORLD_COORDINATE,
  addScaled,
  closestPointOnSegment,
  closestPointsBetweenSegments,
  distance,
  dot,
  isFiniteVec3,
  isWithinWorldBounds,
  normalize,
  sub,
} from "./studio-bg3d-inference-math";

import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceCursor } from "./studio-bg3d-inference-types";

type V3 = StudioBg3dInferenceVec3;

const UP_INDEX = STUDIO_BG3D_INFERENCE_UP_AXIS === "x" ? 0 : STUDIO_BG3D_INFERENCE_UP_AXIS === "y" ? 1 : 2;
/** 무한 직선을 긴 선분으로 다룰 때의 반길이(m). */
const LINE_HALF_LENGTH = STUDIO_BG3D_INFERENCE_MAX_WORLD_COORDINATE * 2;
const NEAR_DEPTH = 0.05;
const HIT_MARGIN = 0.5;

export interface StudioBg3dInferenceProbeClosest {
  /** 대상(선분·직선) 위의 최근접점. */
  readonly point: V3;
  /** 커서까지 월드 거리. */
  readonly distance: number;
  /** 선분 매개변수(직선은 의미 없음). */
  readonly t: number;
  /** 커서 쪽 최근접점. */
  readonly cursorPoint: V3;
}

export interface StudioBg3dInferenceProbe {
  readonly mode: "point" | "ray";
  /** 커서 아래의 대표 3D 점(표면 교점·바닥 교점·점 커서). 없으면 null. */
  readonly anchor: V3 | null;
  readonly anchorKind: "point" | "surface" | "ground" | null;
  /** 앵커의 깊이 — 이보다 뒤에 있는 특징은 가려진 것으로 본다. 점 모드·앵커 없음은 null. */
  readonly occlusionDepth: number | null;
  readonly querySegment: { readonly a: V3; readonly b: V3 };
  readonly ray: { readonly origin: V3; readonly direction: V3 } | null;
  distanceToPoint(point: V3): number;
  depthOf(point: V3): number;
  worldPerPixelAt(point: V3): number;
  closestOnSegment(a: V3, b: V3): StudioBg3dInferenceProbeClosest;
  closestOnLine(origin: V3, direction: V3): StudioBg3dInferenceProbeClosest;
}

export type StudioBg3dInferenceProbeResult =
  | { readonly ok: true; readonly probe: StudioBg3dInferenceProbe }
  | { readonly ok: false; readonly reason: "invalid-cursor" | "invalid-scale" };

function createPointProbe(point: V3, worldPerPixel: number): StudioBg3dInferenceProbe {
  return {
    mode: "point",
    anchor: point,
    anchorKind: "point",
    occlusionDepth: null,
    querySegment: { a: point, b: point },
    ray: null,
    distanceToPoint: (other) => distance(point, other),
    depthOf: () => 0,
    worldPerPixelAt: () => worldPerPixel,
    closestOnSegment(a, b) {
      const closest = closestPointOnSegment(point, a, b);
      return {
        point: closest.point,
        distance: distance(point, closest.point),
        t: closest.t,
        cursorPoint: point,
      };
    },
    closestOnLine(origin, direction) {
      const t = dot(sub(point, origin), direction);
      const projected = addScaled(origin, direction, t);
      return { point: projected, distance: distance(point, projected), t, cursorPoint: point };
    },
  };
}

function createRayProbe(
  cursor: Extract<StudioBg3dInferenceCursor, { kind: "ray" }>,
  direction: V3,
): StudioBg3dInferenceProbe {
  const origin = cursor.origin;
  const depthOfPoint = (point: V3): number => dot(sub(point, origin), direction);

  let anchor: V3 | null = null;
  let anchorKind: "surface" | "ground" | null = null;
  let anchorDepth: number | null = null;
  const hit = cursor.surfaceHit;
  if (hit && isFiniteVec3(hit.point) && isWithinWorldBounds(hit.point)) {
    const depth = depthOfPoint(hit.point);
    if (depth > 0) {
      anchor = hit.point;
      anchorKind = "surface";
      anchorDepth = depth;
    }
  }
  const groundY = cursor.groundY;
  if (typeof groundY === "number" && Number.isFinite(groundY)) {
    const slope = direction[UP_INDEX] ?? 0;
    if (Math.abs(slope) > 1e-9) {
      const t = (groundY - (origin[UP_INDEX] ?? 0)) / slope;
      if (t > 0 && t < STUDIO_BG3D_INFERENCE_BUDGET.maxRayDistance && (anchorDepth === null || t < anchorDepth)) {
        const groundPoint = addScaled(origin, direction, t);
        if (isWithinWorldBounds(groundPoint)) {
          anchor = groundPoint;
          anchorKind = "ground";
          anchorDepth = t;
        }
      }
    }
  }

  const reach = Math.min(
    STUDIO_BG3D_INFERENCE_BUDGET.maxRayDistance,
    (anchorDepth ?? STUDIO_BG3D_INFERENCE_BUDGET.maxRayDistance) + HIT_MARGIN,
  );
  const end = addScaled(origin, direction, reach);
  const longLine = (lineOrigin: V3, lineDirection: V3): { a: V3; b: V3 } => ({
    a: addScaled(lineOrigin, lineDirection, -LINE_HALF_LENGTH),
    b: addScaled(lineOrigin, lineDirection, LINE_HALF_LENGTH),
  });

  return {
    mode: "ray",
    anchor,
    anchorKind,
    occlusionDepth: anchorDepth,
    querySegment: { a: origin, b: end },
    ray: { origin, direction },
    distanceToPoint(point) {
      const depth = depthOfPoint(point);
      if (depth <= 0) return distance(origin, point);
      return distance(addScaled(origin, direction, depth), point);
    },
    depthOf: depthOfPoint,
    worldPerPixelAt(point) {
      if (cursor.projection.type === "orthographic") return cursor.projection.worldPerPixel;
      return Math.max(NEAR_DEPTH, depthOfPoint(point)) * cursor.projection.radiansPerPixel;
    },
    closestOnSegment(a, b) {
      const closest = closestPointsBetweenSegments(origin, end, a, b);
      return {
        point: closest.pointB,
        distance: closest.distance,
        t: closest.t,
        cursorPoint: closest.pointA,
      };
    },
    closestOnLine(lineOrigin, lineDirection) {
      const line = longLine(lineOrigin, lineDirection);
      const closest = closestPointsBetweenSegments(origin, end, line.a, line.b);
      return {
        point: closest.pointB,
        distance: closest.distance,
        t: closest.t,
        cursorPoint: closest.pointA,
      };
    },
  };
}

export function createStudioBg3dInferenceProbe(
  cursor: StudioBg3dInferenceCursor,
): StudioBg3dInferenceProbeResult {
  if (cursor.kind === "point") {
    if (!isFiniteVec3(cursor.point) || !isWithinWorldBounds(cursor.point)) {
      return { ok: false, reason: "invalid-cursor" };
    }
    if (!Number.isFinite(cursor.worldPerPixel) || cursor.worldPerPixel <= 0) {
      return { ok: false, reason: "invalid-scale" };
    }
    return { ok: true, probe: createPointProbe(cursor.point, cursor.worldPerPixel) };
  }
  if (!isFiniteVec3(cursor.origin) || !isFiniteVec3(cursor.direction) || !isWithinWorldBounds(cursor.origin)) {
    return { ok: false, reason: "invalid-cursor" };
  }
  const direction = normalize(cursor.direction);
  if (!direction) return { ok: false, reason: "invalid-cursor" };
  const projection = cursor.projection;
  const scale = projection.type === "perspective" ? projection.radiansPerPixel : projection.worldPerPixel;
  if (!Number.isFinite(scale) || scale <= 0) return { ok: false, reason: "invalid-scale" };
  return { ok: true, probe: createRayProbe(cursor, direction) };
}
