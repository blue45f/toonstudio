/**
 * Wave 133 — Beer-Lambert 지수 대기 투과율·산란 안개 밴드 및
 * Liang-Barsky 선분-박스 교차 기반 얼굴·말풍선 무가림(0건) 우회·감사 모듈.
 */

import {
  DEPTH_LAYER_BOUNDS_METERS,
  clampFinite,
  formatOklchCss,
  type AtmosphericFogBand,
  type AtmosphericTransmittanceSample,
  type AtmosphericWeatherParticle,
  type KeepOutBoxInput,
  type KeepOutOcclusionAudit,
  type NormalizedKeepOutBox,
  type WeatherPresetSpec,
} from "./atmospheric-weather-types";

export interface DeterministicRng {
  nextUnit(): number;
  nextRange(min: number, max: number): number;
}

export interface ParticleSegment2D {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface RelocationKinematics {
  readonly radiusPx: number;
  readonly bokehBlurPx: number;
  readonly vxPxPerSec: number;
  readonly vyPxPerSec: number;
  readonly streakLengthPx: number;
}

const DEFAULT_TRANSMITTANCE_CURVE_DEPTHS: readonly number[] = [
  0.8, 1.5, 2.2, 3.0, 4.2, 6.0, 8.5, 11.5, 15.0, 20.0,
];

/**
 * Beer-Lambert 지수 대기 투과율 계산기.
 * `T(z) = exp(-extinctionBeta * max(0, z - focusStartM))` — 깊이가 멀어질수록 `(0, 1]` 범위에서
 * 단조 감소하며 원경 안개 혼합 비율 `fogBlend = 1 - T(z)`를 산출한다.
 */
export function computeAtmosphericTransmittance(
  depthMeters: number,
  extinctionBeta: number,
  focusStartMeters: number = DEPTH_LAYER_BOUNDS_METERS.midground.minMeters,
): AtmosphericTransmittanceSample {
  const safeDepth = clampFinite(depthMeters, 0, 500, 0);
  const safeBeta = clampFinite(extinctionBeta, 0, 10, 0.08);
  const safeFocusStart = clampFinite(focusStartMeters, 0, 200, 2.2);
  const effectiveDistanceMeters = Math.max(0, safeDepth - safeFocusStart);
  const opticalDepth = Math.min(700, safeBeta * effectiveDistanceMeters);
  const transmittance = Math.exp(-opticalDepth);
  const fogBlend = 1 - transmittance;

  return {
    depthMeters: safeDepth,
    effectiveDistanceMeters,
    extinctionBeta: safeBeta,
    focusStartMeters: safeFocusStart,
    transmittance,
    fogBlend,
  };
}

/** 깊이 표본 구간에 대한 Beer-Lambert 투과율 곡선을 산출한다. */
export function sampleTransmittanceCurve(
  extinctionBeta: number,
  focusStartMeters: number = DEPTH_LAYER_BOUNDS_METERS.midground.minMeters,
  depthsMeters: readonly number[] = DEFAULT_TRANSMITTANCE_CURVE_DEPTHS,
): readonly AtmosphericTransmittanceSample[] {
  const safeDepths = depthsMeters.length > 0 ? depthsMeters : DEFAULT_TRANSMITTANCE_CURVE_DEPTHS;
  const sorted = [...safeDepths]
    .map((d) => clampFinite(d, 0, 500, 0))
    .sort((a, b) => a - b);
  return sorted.map((depth) =>
    computeAtmosphericTransmittance(depth, extinctionBeta, focusStartMeters),
  );
}

/** 깊이별 Beer-Lambert 대기 안개 밴드 6단계(근→원경)를 생성한다. */
export function buildFogBands(
  preset: WeatherPresetSpec,
  extinctionBeta: number,
  focusStartMeters: number,
): readonly AtmosphericFogBand[] {
  const bandDepths = [2.4, 4.5, 7.5, 11.0, 15.0, 20.0];
  return bandDepths.map((depthMeters, bandIndex) => {
    const sample = computeAtmosphericTransmittance(depthMeters, extinctionBeta, focusStartMeters);
    const alpha = clampFinite(sample.fogBlend * 0.58, 0.04, 0.62, 0.2);
    return {
      bandIndex,
      depthMeters,
      transmittance: sample.transmittance,
      fogBlend: sample.fogBlend,
      hazeOklchCss: formatOklchCss(preset.fogOklch, alpha),
    };
  });
}

/** 투과율 곡선이 `(0, 1]` 범위 안에서 깊이에 따라 단조 감소하는지 검증한다. */
export function verifyMonotonicTransmittance(
  curve: readonly AtmosphericTransmittanceSample[],
  extinctionBeta: number,
  focusStartMeters: number,
): boolean {
  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1];
    const curr = curve[i];
    if (curr.transmittance <= 0 || curr.transmittance > 1) return false;
    if (curr.depthMeters > prev.depthMeters) {
      if (extinctionBeta > 0 && curr.depthMeters > focusStartMeters) {
        if (!(curr.transmittance < prev.transmittance)) return false;
      } else if (curr.transmittance > prev.transmittance + 1e-12) {
        return false;
      }
    }
  }
  return curve.length > 0 && curve[0].transmittance > 0 && curve[0].transmittance <= 1;
}

/**
 * Liang-Barsky 슬랩 알고리즘으로 선분 `(x1, y1)-(x2, y2)`와
 * 확장된 직사각형 AABB `[minX, maxX] × [minY, maxY]`의 교차 여부를 정확히 판정한다.
 */
export function doesSegmentIntersectExpandedBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: NormalizedKeepOutBox,
  extraExpandPx: number,
): boolean {
  const expand = Math.max(0, box.marginPx) + Math.max(0, extraExpandPx);
  const minX = box.x - expand;
  const maxX = box.x + box.width + expand;
  const minY = box.y - expand;
  const maxY = box.y + box.height + expand;

  if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) return true;
  if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) return true;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    clip(-dx, x1 - minX) &&
    clip(dx, maxX - x1) &&
    clip(-dy, y1 - minY) &&
    clip(dy, maxY - y1)
  ) {
    return t0 <= t1;
  }
  return false;
}

/** 입력 금지 박스 목록을 뷰포트 좌표계로 안전하게 정규화한다. */
export function normalizeKeepOutBoxes(
  rawBoxes: readonly KeepOutBoxInput[] | undefined,
  kind: "face" | "balloon",
  viewportWidthPx: number,
  viewportHeightPx: number,
  defaultPaddingPx: number,
): readonly NormalizedKeepOutBox[] {
  if (!rawBoxes || rawBoxes.length === 0) return [];
  const normalized: NormalizedKeepOutBox[] = [];
  for (let i = 0; i < rawBoxes.length; i += 1) {
    const raw = rawBoxes[i];
    if (!raw) continue;
    const rawX = clampFinite(raw.x, -viewportWidthPx, viewportWidthPx * 2, 0);
    const rawY = clampFinite(raw.y, -viewportHeightPx, viewportHeightPx * 2, 0);
    const rawW = clampFinite(raw.width, 0, viewportWidthPx * 2, 0);
    const rawH = clampFinite(raw.height, 0, viewportHeightPx * 2, 0);
    if (rawW <= 0 || rawH <= 0) continue;

    const x0 = clampFinite(rawX, 0, viewportWidthPx, 0);
    const y0 = clampFinite(rawY, 0, viewportHeightPx, 0);
    const x1 = clampFinite(rawX + rawW, 0, viewportWidthPx, viewportWidthPx);
    const y1 = clampFinite(rawY + rawH, 0, viewportHeightPx, viewportHeightPx);
    const width = x1 - x0;
    const height = y1 - y0;
    if (width <= 0.5 || height <= 0.5) continue;

    const marginPx = clampFinite(
      raw.marginPx !== undefined ? raw.marginPx : defaultPaddingPx,
      0,
      96,
      defaultPaddingPx,
    );
    const fallbackId = `${kind}-${i + 1}`;
    const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : fallbackId;
    const fallbackLabel = kind === "face" ? `얼굴 보호 ${i + 1}` : `말풍선 보호 ${i + 1}`;
    const labelKo =
      typeof raw.labelKo === "string" && raw.labelKo.trim().length > 0
        ? raw.labelKo.trim()
        : fallbackLabel;

    normalized.push({ id, kind, labelKo, x: x0, y: y0, width, height, marginPx });
  }
  return normalized;
}

/** 속도 벡터와 스트릭 길이를 이용해 파티클 선분의 양 끝점을 계산한다. */
export function buildSegmentEndpoints(
  x: number,
  y: number,
  vx: number,
  vy: number,
  streakLengthPx: number,
): ParticleSegment2D {
  const speed = Math.hypot(vx, vy);
  const ux = speed > 1e-4 ? vx / speed : 0;
  const uy = speed > 1e-4 ? vy / speed : 1;
  const halfLen = streakLengthPx * 0.5;
  return {
    x1: x - ux * halfLen,
    y1: y - uy * halfLen,
    x2: x + ux * halfLen,
    y2: y + uy * halfLen,
  };
}

/** 파티클 중심점 또는 빗줄기 선분과 충돌하는 첫 번째 보호 박스를 찾는다. */
export function findBlockingBox(
  x: number,
  y: number,
  seg: ParticleSegment2D,
  visualRadius: number,
  allBoxes: readonly NormalizedKeepOutBox[],
): NormalizedKeepOutBox | null {
  for (const box of allBoxes) {
    if (
      doesSegmentIntersectExpandedBox(seg.x1, seg.y1, seg.x2, seg.y2, box, visualRadius) ||
      doesSegmentIntersectExpandedBox(x, y, x, y, box, visualRadius)
    ) {
      return box;
    }
  }
  return null;
}

/** 보호 영역과 겹친 파티클을 외곽 여유 공간으로 결정론적 우회 재배치한다. */
export function tryRelocateOutsideKeepOut(
  originX: number,
  originY: number,
  blockingBox: NormalizedKeepOutBox,
  kinematics: RelocationKinematics,
  allBoxes: readonly NormalizedKeepOutBox[],
  viewportWidthPx: number,
  viewportHeightPx: number,
  rng: DeterministicRng,
): { readonly x: number; readonly y: number; readonly seg: ParticleSegment2D } | null {
  const visualRadius = kinematics.radiusPx + kinematics.bokehBlurPx * 0.25;
  const clearance = blockingBox.marginPx + visualRadius + kinematics.streakLengthPx * 0.55 + 4;

  const candidates: Array<readonly [number, number]> = [
    [blockingBox.x - clearance, originY],
    [blockingBox.x + blockingBox.width + clearance, originY],
    [originX, blockingBox.y - clearance],
    [originX, blockingBox.y + blockingBox.height + clearance],
    [blockingBox.x - clearance, blockingBox.y - clearance],
    [blockingBox.x + blockingBox.width + clearance, blockingBox.y - clearance],
    [blockingBox.x - clearance, blockingBox.y + blockingBox.height + clearance],
    [blockingBox.x + blockingBox.width + clearance, blockingBox.y + blockingBox.height + clearance],
  ];

  const marginEdge = Math.min(24, Math.min(viewportWidthPx, viewportHeightPx) * 0.08);
  for (let i = 0; i < 8; i += 1) {
    const cx = rng.nextRange(marginEdge, Math.max(marginEdge + 1, viewportWidthPx - marginEdge));
    const cy = rng.nextRange(marginEdge, Math.max(marginEdge + 1, viewportHeightPx - marginEdge));
    candidates.push([cx, cy]);
  }

  for (const [cx, cy] of candidates) {
    if (cx < 2 || cx > viewportWidthPx - 2 || cy < 2 || cy > viewportHeightPx - 2) {
      continue;
    }
    const seg = buildSegmentEndpoints(
      cx,
      cy,
      kinematics.vxPxPerSec,
      kinematics.vyPxPerSec,
      kinematics.streakLengthPx,
    );
    if (findBlockingBox(cx, cy, seg, visualRadius, allBoxes) === null) {
      return { x: cx, y: cy, seg };
    }
  }
  return null;
}

/**
 * 활성 파티클 배열과 얼굴·말풍선 보호 영역 간의 점·반지름·빗줄기 선분 침범 건수를 전수 감사한다.
 */
export function auditKeepOutOcclusions(
  particles: readonly AtmosphericWeatherParticle[],
  faceBoxes: readonly NormalizedKeepOutBox[],
  balloonBoxes: readonly NormalizedKeepOutBox[],
): KeepOutOcclusionAudit {
  let faceOcclusionCount = 0;
  let balloonOcclusionCount = 0;
  const collidingParticleIds: number[] = [];

  for (const particle of particles) {
    const visualRadius = particle.radiusPx + particle.bokehBlurPx * 0.25;
    const seg: ParticleSegment2D = {
      x1: particle.x1,
      y1: particle.y1,
      x2: particle.x2,
      y2: particle.y2,
    };
    const hitsFace = findBlockingBox(particle.x, particle.y, seg, visualRadius, faceBoxes) !== null;
    const hitsBalloon =
      findBlockingBox(particle.x, particle.y, seg, visualRadius, balloonBoxes) !== null;

    if (hitsFace) faceOcclusionCount += 1;
    if (hitsBalloon) balloonOcclusionCount += 1;
    if (hitsFace || hitsBalloon) {
      collidingParticleIds.push(particle.id);
    }
  }

  return {
    faceOcclusionCount,
    balloonOcclusionCount,
    heroFaceAndBalloonOcclusionCount: collidingParticleIds.length,
    collidingParticleIds,
  };
}
