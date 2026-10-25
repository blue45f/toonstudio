/**
 * studio-bg3d-sketchup-guides-sections-dimensions.ts
 *
 * SketchUp 정밀 작도·치수·지시선·단면 채움(Section Cut Poché) 엔진:
 * 1. 보조선(ConstructionLine — 무한 가이드라인 `±1e30` 센티넬 호환·유한 가이드 선분·각도기 Protractor 경사 가이드) 및 보조점(ConstructionPoint)
 * 2. 3D 치수선(Dimension — 보조선 Witness Lines, 치수 화살표 선분, `<>` 동적 측정값 치환)
 * 3. 3D 지시선 텍스트(Leader Text — 앵커 포인트, 꺾임 엘보, 화면 빌보드 라벨)
 * 4. 다중 단면 평면(SectionPlane — 임의 법선 `ax + by + cz + d = 0` 클리핑 + 삼각형 메시 교차 절단선 + 단면 채움 Section Fill 루프 계산)
 */

import type { StudioBg3dVec3 } from "./studio-bg3d-scene-document-types";

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function add3(a: StudioBg3dVec3, b: StudioBg3dVec3): StudioBg3dVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a: StudioBg3dVec3, b: StudioBg3dVec3): StudioBg3dVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(v: StudioBg3dVec3, s: number): StudioBg3dVec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dot3(a: StudioBg3dVec3, b: StudioBg3dVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: StudioBg3dVec3, b: StudioBg3dVec3): StudioBg3dVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: StudioBg3dVec3, fallback: StudioBg3dVec3 = [1, 0, 0]): StudioBg3dVec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len < 1e-9) return fallback;
  return [round6(v[0] / len), round6(v[1] / len), round6(v[2] / len)];
}

export interface StudioSketchUpConstructionLine {
  readonly id: string;
  readonly kind: "infinite" | "segment" | "protractor";
  readonly point: StudioBg3dVec3;
  readonly direction: StudioBg3dVec3;
  readonly start: StudioBg3dVec3 | null;
  readonly end: StudioBg3dVec3 | null;
  readonly angleDeg: number | null;
  readonly visible: boolean;
}

export interface StudioSketchUpConstructionPoint {
  readonly id: string;
  readonly position: StudioBg3dVec3;
  readonly label?: string;
  readonly visible: boolean;
}

/**
 * SketchUp 각도기(Protractor) 경사/각도 입력 파서:
 * - 각도: `"30"`, `"45deg"`, `"45°"` -> 45도
 * - 경사비(Rise:Run): `"3:12"`, `"6:12"` -> `atan2(rise, run)` 도
 */
export function parseSketchUpProtractorInput(raw: string): {
  readonly ok: boolean;
  readonly angleDeg: number;
  readonly formatted: string;
} {
  const trimmed = raw.trim();
  const slopeMatch = /^([+-]?\d+(?:\.\d+)?)\s*:\s*([+-]?\d+(?:\.\d+)?)$/u.exec(trimmed);
  if (slopeMatch) {
    const rise = Number(slopeMatch[1]);
    const run = Number(slopeMatch[2]);
    if (!Number.isFinite(rise) || !Number.isFinite(run) || Math.abs(run) < 1e-9) {
      return Object.freeze({ ok: false, angleDeg: 0, formatted: "" });
    }
    const deg = round6((Math.atan2(rise, run) * 180) / Math.PI);
    return Object.freeze({
      ok: true,
      angleDeg: deg,
      formatted: `${rise}:${run} (${deg.toFixed(1)}°)`,
    });
  }

  const degMatch = /^([+-]?\d+(?:\.\d+)?)\s*(?:deg|°|도)?$/iu.exec(trimmed);
  if (degMatch) {
    const deg = Number(degMatch[1]);
    if (!Number.isFinite(deg)) {
      return Object.freeze({ ok: false, angleDeg: 0, formatted: "" });
    }
    const normalized = round6(((deg % 360) + 360) % 360);
    return Object.freeze({
      ok: true,
      angleDeg: normalized,
      formatted: `${normalized.toFixed(1)}°`,
    });
  }

  return Object.freeze({ ok: false, angleDeg: 0, formatted: "" });
}

/**
 * 줄자(Tape Measure) 평행 오프셋 보조선 또는 각도기(Protractor) 회전 보조선을 생성한다.
 */
export function createSketchUpGuideLine(input: {
  readonly id: string;
  readonly basePoint: StudioBg3dVec3;
  readonly baseDirection: StudioBg3dVec3;
  readonly offsetDirection?: StudioBg3dVec3;
  readonly offsetDistanceMeters?: number;
  readonly rotateAngleDeg?: number;
  readonly rotateNormal?: StudioBg3dVec3;
  readonly finiteSegmentLengthMeters?: number;
}): StudioSketchUpConstructionLine {
  const dir = normalize3(input.baseDirection, [1, 0, 0]);
  const offsetDir = input.offsetDirection ? normalize3(input.offsetDirection, [0, 0, 1]) : [0, 0, 0] as StudioBg3dVec3;
  const offsetDist = input.offsetDistanceMeters ?? 0;

  const anchor: StudioBg3dVec3 = Object.freeze([
    round6(input.basePoint[0] + offsetDir[0] * offsetDist),
    round6(input.basePoint[1] + offsetDir[1] * offsetDist),
    round6(input.basePoint[2] + offsetDir[2] * offsetDist),
  ]);

  let finalDir = dir;
  let kind: StudioSketchUpConstructionLine["kind"] = "infinite";
  let angleDeg: number | null = null;

  if (typeof input.rotateAngleDeg === "number" && Number.isFinite(input.rotateAngleDeg)) {
    kind = "protractor";
    angleDeg = round6(input.rotateAngleDeg);
    const rad = (angleDeg * Math.PI) / 180;
    const axis = normalize3(input.rotateNormal ?? [0, 1, 0], [0, 1, 0]);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cross = cross3(axis, dir);
    const dot = dot3(axis, dir);
    finalDir = normalize3([
      dir[0] * cos + cross[0] * sin + axis[0] * dot * (1 - cos),
      dir[1] * cos + cross[1] * sin + axis[1] * dot * (1 - cos),
      dir[2] * cos + cross[2] * sin + axis[2] * dot * (1 - cos),
    ], dir);
  }

  if (typeof input.finiteSegmentLengthMeters === "number" && input.finiteSegmentLengthMeters > 0) {
    const len = input.finiteSegmentLengthMeters;
    const endPt: StudioBg3dVec3 = Object.freeze([
      round6(anchor[0] + finalDir[0] * len),
      round6(anchor[1] + finalDir[1] * len),
      round6(anchor[2] + finalDir[2] * len),
    ]);
    return Object.freeze({
      id: input.id,
      kind: "segment",
      point: anchor,
      direction: finalDir,
      start: anchor,
      end: endPt,
      angleDeg,
      visible: true,
    });
  }

  return Object.freeze({
    id: input.id,
    kind,
    point: anchor,
    direction: finalDir,
    start: null,
    end: null,
    angleDeg,
    visible: true,
  });
}

/**
 * 무한 보조선(`ConstructionLine`)을 뷰포트 AABB(`[-halfExtent, +halfExtent]^3`) 안의 선분으로 클리핑한다.
 */
export function clipConstructionLineToBounds(
  line: StudioSketchUpConstructionLine,
  halfExtentMeters = 50,
): { readonly start: StudioBg3dVec3; readonly end: StudioBg3dVec3 } | null {
  if (line.start && line.end) {
    return Object.freeze({ start: line.start, end: line.end });
  }
  const bound = Math.max(1, Math.abs(halfExtentMeters));
  let tMin = -bound * 2;
  let tMax = bound * 2;
  for (let axis = 0; axis < 3; axis += 1) {
    const p = line.point[axis]!;
    const d = line.direction[axis]!;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) > bound) return null;
    } else {
      const t1 = (-bound - p) / d;
      const t2 = (bound - p) / d;
      const near = Math.min(t1, t2);
      const far = Math.max(t1, t2);
      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);
      if (tMin > tMax) return null;
    }
  }
  const start = add3(line.point, scale3(line.direction, tMin));
  const end = add3(line.point, scale3(line.direction, tMax));
  return Object.freeze({
    start: Object.freeze([round6(start[0]), round6(start[1]), round6(start[2])] as const),
    end: Object.freeze([round6(end[0]), round6(end[1]), round6(end[2])] as const),
  });
}

export interface StudioSketchUpDimension3D {
  readonly id: string;
  readonly startPoint: StudioBg3dVec3;
  readonly endPoint: StudioBg3dVec3;
  readonly offsetVector: StudioBg3dVec3;
  readonly witnessStartA: StudioBg3dVec3;
  readonly witnessEndA: StudioBg3dVec3;
  readonly witnessStartB: StudioBg3dVec3;
  readonly witnessEndB: StudioBg3dVec3;
  readonly labelPosition: StudioBg3dVec3;
  readonly measuredMeters: number;
  readonly displayText: string;
  readonly hidden: boolean;
}

/**
 * SketchUp 3D 선형 치수선(`Dimension`) 생성기:
 * 시작점 `a`, 끝점 `b`, 오프셋 벡터 `offset`으로부터 보조선(witness lines)과 치수선,
 * 동적 텍스트(`<>` 치환 지원)를 계산한다.
 */
export function createSketchUpDimension3D(input: {
  readonly id: string;
  readonly startPoint: StudioBg3dVec3;
  readonly endPoint: StudioBg3dVec3;
  readonly offsetVector?: StudioBg3dVec3;
  readonly textTemplate?: string;
  readonly unit?: "m" | "cm" | "mm";
  readonly hidden?: boolean;
}): StudioSketchUpDimension3D {
  const {
    id,
    startPoint,
    endPoint,
    offsetVector = [0, 0.35, 0],
    textTemplate = "<>",
    unit = "m",
    hidden = false,
  } = input;

  const measuredMeters = round6(
    Math.hypot(
      endPoint[0] - startPoint[0],
      endPoint[1] - startPoint[1],
      endPoint[2] - startPoint[2],
    ),
  );

  const witnessEndA: StudioBg3dVec3 = Object.freeze([
    round6(startPoint[0] + offsetVector[0]),
    round6(startPoint[1] + offsetVector[1]),
    round6(startPoint[2] + offsetVector[2]),
  ]);
  const witnessEndB: StudioBg3dVec3 = Object.freeze([
    round6(endPoint[0] + offsetVector[0]),
    round6(endPoint[1] + offsetVector[1]),
    round6(endPoint[2] + offsetVector[2]),
  ]);
  const labelPosition: StudioBg3dVec3 = Object.freeze([
    round6((witnessEndA[0] + witnessEndB[0]) * 0.5),
    round6((witnessEndA[1] + witnessEndB[1]) * 0.5),
    round6((witnessEndA[2] + witnessEndB[2]) * 0.5),
  ]);

  const formattedMeasurement = unit === "mm"
    ? `${Math.round(measuredMeters * 1000)} mm`
    : unit === "cm"
      ? `${(measuredMeters * 100).toFixed(1)} cm`
      : `${measuredMeters.toFixed(2)} m`;

  const rawTemplate = textTemplate.trim();
  const displayText = rawTemplate.length === 0 || rawTemplate === "<>"
    ? formattedMeasurement
    : rawTemplate.replace(/<>/gu, formattedMeasurement);

  return Object.freeze({
    id,
    startPoint,
    endPoint,
    offsetVector,
    witnessStartA: startPoint,
    witnessEndA,
    witnessStartB: endPoint,
    witnessEndB,
    labelPosition,
    measuredMeters,
    displayText,
    hidden,
  });
}

export interface StudioSketchUpLeaderText3D {
  readonly id: string;
  readonly anchorPoint: StudioBg3dVec3;
  readonly elbowPoint: StudioBg3dVec3;
  readonly labelPoint: StudioBg3dVec3;
  readonly text: string;
  readonly hidden: boolean;
}

/**
 * SketchUp 지시선 텍스트(`TextEntity`) 생성기:
 * 앵커 점(`anchorPoint`)과 지시선 오프셋(`leaderOffset`)으로부터 꺾임선(elbow)과 텍스트 위치를 계산한다.
 */
export function createSketchUpLeaderText3D(input: {
  readonly id: string;
  readonly anchorPoint: StudioBg3dVec3;
  readonly leaderOffset?: StudioBg3dVec3;
  readonly text: string;
  readonly hidden?: boolean;
}): StudioSketchUpLeaderText3D {
  const offset = input.leaderOffset ?? [0.4, 0.5, 0];
  const elbowPoint: StudioBg3dVec3 = Object.freeze([
    round6(input.anchorPoint[0] + offset[0] * 0.75),
    round6(input.anchorPoint[1] + offset[1]),
    round6(input.anchorPoint[2] + offset[2] * 0.75),
  ]);
  const signX = offset[0] >= 0 ? 1 : -1;
  const labelPoint: StudioBg3dVec3 = Object.freeze([
    round6(elbowPoint[0] + signX * 0.2),
    elbowPoint[1],
    elbowPoint[2],
  ]);
  return Object.freeze({
    id: input.id,
    anchorPoint: input.anchorPoint,
    elbowPoint,
    labelPoint,
    text: input.text.trim() || "지시선 메모",
    hidden: input.hidden === true,
  });
}

export interface StudioSketchUpSectionPlane3D {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  /** 정규화된 법선 `(nx, ny, nz)` 및 평면 상수 `d` (`nx*x + ny*y + nz*z + d = 0`). */
  readonly plane: readonly [number, number, number, number];
  readonly active: boolean;
  readonly hidden: boolean;
  readonly fillColorHex: string;
  readonly lineColorHex: string;
  readonly lineWidthPx: number;
}

export interface StudioSketchUpSectionCutSegment {
  readonly start: StudioBg3dVec3;
  readonly end: StudioBg3dVec3;
}

export interface StudioSketchUpSectionCutResult {
  readonly planeId: string;
  readonly segments: readonly StudioSketchUpSectionCutSegment[];
  readonly closedLoopCount: number;
  readonly estimatedFillAreaSqMeters: number;
}

/**
 * 점 `p`가 단면 평면(`nx*x + ny*y + nz*z + d >= 0`)에 의해 유지되는지 판정한다.
 */
export function evaluateSketchUpSectionPlaneSignedDistance(
  plane: readonly [number, number, number, number],
  point: StudioBg3dVec3,
): number {
  return round6(plane[0] * point[0] + plane[1] * point[1] + plane[2] * point[2] + plane[3]);
}

/**
 * 삼각형 메시(`positions`, `indices`)와 활성 단면 평면(`SectionPlane`)의 교차 절단 선분(Section Cut Lines)과
 * 단면 채움(Section Cut Poché) 면적을 계산한다.
 */
export function intersectTrianglesWithSketchUpSectionPlane(
  sectionPlane: StudioSketchUpSectionPlane3D,
  positions: Float32Array,
  indices: Uint32Array,
): StudioSketchUpSectionCutResult {
  const [nx, ny, nz, d] = sectionPlane.plane;
  const segments: StudioSketchUpSectionCutSegment[] = [];
  const intersectionPoints: StudioBg3dVec3[] = [];

  const readVertex = (idx: number): StudioBg3dVec3 => [
    positions[idx * 3] ?? 0,
    positions[idx * 3 + 1] ?? 0,
    positions[idx * 3 + 2] ?? 0,
  ];

  const signedDist = (v: StudioBg3dVec3): number => nx * v[0] + ny * v[1] + nz * v[2] + d;

  const interpolateEdge = (
    p1: StudioBg3dVec3,
    d1: number,
    p2: StudioBg3dVec3,
    d2: number,
  ): StudioBg3dVec3 | null => {
    if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) return null;
    const denom = d1 - d2;
    if (Math.abs(denom) < 1e-9) return null;
    const t = d1 / denom;
    return Object.freeze([
      round6(p1[0] + (p2[0] - p1[0]) * t),
      round6(p1[1] + (p2[1] - p1[1]) * t),
      round6(p1[2] + (p2[2] - p1[2]) * t),
    ]);
  };

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const v0 = readVertex(indices[i]!);
    const v1 = readVertex(indices[i + 1]!);
    const v2 = readVertex(indices[i + 2]!);
    const s0 = signedDist(v0);
    const s1 = signedDist(v1);
    const s2 = signedDist(v2);

    const hits: StudioBg3dVec3[] = [];
    const e01 = interpolateEdge(v0, s0, v1, s1);
    const e12 = interpolateEdge(v1, s1, v2, s2);
    const e20 = interpolateEdge(v2, s2, v0, s0);
    if (e01) hits.push(e01);
    if (e12) hits.push(e12);
    if (e20) hits.push(e20);

    if (hits.length >= 2) {
      const a = hits[0]!;
      const b = hits[1]!;
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (segLen > 1e-6) {
        segments.push(Object.freeze({ start: a, end: b }));
        intersectionPoints.push(a, b);
      }
    }
  }

  // 교차 선분들의 무게중심을 기준으로 단면 채움(Poché) 추정 면적 계산
  let estimatedFillAreaSqMeters = 0;
  if (segments.length >= 3 && intersectionPoints.length >= 6) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const pt of intersectionPoints) {
      cx += pt[0];
      cy += pt[1];
      cz += pt[2];
    }
    cx /= intersectionPoints.length;
    cy /= intersectionPoints.length;
    cz /= intersectionPoints.length;
    const center: StudioBg3dVec3 = [cx, cy, cz];

    for (const seg of segments) {
      const u = sub3(seg.start, center);
      const v = sub3(seg.end, center);
      const cr = cross3(u, v);
      estimatedFillAreaSqMeters += 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
    }
  }

  return Object.freeze({
    planeId: sectionPlane.id,
    segments: Object.freeze(segments),
    closedLoopCount: segments.length >= 3 ? Math.max(1, Math.floor(segments.length / 4)) : 0,
    estimatedFillAreaSqMeters: round6(estimatedFillAreaSqMeters),
  });
}
