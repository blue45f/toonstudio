/**
 * Perfect Freehand(MIT) 기반 캘리그라피 리본 & 안료 농담 내재화 모듈.
 * `../stroke/perfect-freehand`의 아웃라인 기하 수식에 날카로운 모서리 보존(sharp corner gate)과
 * Kubelka-Munk(K/S) 안료 중심-가장자리 농도 구배(잉크 고임·테두리 번짐)를 결합한다.
 *
 * 원본 코드는 참조하지 않으며 개념·수식만 재구현한다(license-policy.md 4.5절).
 * 모든 수치 결과는 Math.fround로 f32 결정성을 유지한다.
 */

import { SumiError } from "../core/errors";
import {
  getOutlinePoints,
  getStrokePoints,
  perfectFreehand,
  type FreehandOptions,
  type FreehandPoint,
  type OutlinePoint,
} from "../stroke/perfect-freehand/index";

import { kmMixRgb } from "./kubelka-munk";

export { getOutlinePoints, getStrokePoints, perfectFreehand };
export type { FreehandOptions, FreehandPoint, OutlinePoint };

export type Rgb3 = readonly [number, number, number];

export interface FreehandPigmentOptions extends Partial<FreehandOptions> {
  /** 급격한 방향 전환을 모서리로 판정하는 임계 각도(라디안, 기본 π/3 ≈ 60°). */
  readonly cornerAngleThresholdRad?: number;
  /** 리본 가장자리의 안료 희석·번짐 비율 [0, 1]. */
  readonly edgePigmentBlend?: number;
}

export interface FreehandPigmentSlice {
  readonly center: OutlinePoint;
  readonly left: OutlinePoint;
  readonly right: OutlinePoint;
  readonly halfWidth: number;
  readonly turningAngleRad: number;
  readonly isSharpCorner: boolean;
  readonly coreColor: Rgb3;
  readonly edgeColor: Rgb3;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function turningAngleAt(points: readonly FreehandPoint[], index: number): number {
  if (index <= 0 || index >= points.length - 1) return 0;
  const prev = points[index - 1];
  const cur = points[index];
  const next = points[index + 1];
  const v1x = cur.x - prev.x;
  const v1y = cur.y - prev.y;
  const v2x = next.x - cur.x;
  const v2y = next.y - cur.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-5 || len2 < 1e-5) return 0;
  const cosTheta = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
  return Math.fround(Math.acos(cosTheta));
}

/**
 * 입력 획 시퀀스로부터 압력·속도 테이퍼 리본 단면과 K/S 안료 중심·가장자리 색을 계산한다.
 */
export function evaluateFreehandPigmentRibbon(
  points: readonly FreehandPoint[],
  coreColor: Rgb3,
  substrateOrEdgeColor: Rgb3 = [1, 1, 1],
  options: FreehandPigmentOptions = {},
): FreehandPigmentSlice[] {
  const size = options.size ?? 8;
  if (!Number.isFinite(size) || size <= 0) {
    throw new SumiError("pf-invalid-options", "size는 0 초과 유한값이어야 한다", { size });
  }
  const edgeBlend = clamp01(options.edgePigmentBlend ?? 0.35);
  const cornerThreshold = options.cornerAngleThresholdRad ?? Math.PI / 3;

  const fullOptions: FreehandOptions = {
    size,
    thinning: clamp01(options.thinning ?? 0.45),
    smoothing: clamp01(options.smoothing ?? 0.3),
    simulatePressure: options.simulatePressure ?? true,
    easing: options.easing ?? "ease-in-out",
    taper: options.taper ?? true,
  };

  const strokePoints = getStrokePoints(points, fullOptions);
  if (strokePoints.length === 0) return [];

  const outline = getOutlinePoints(strokePoints, fullOptions);
  const n = strokePoints.length;
  const slices: FreehandPigmentSlice[] = [];

  for (let i = 0; i < n; i += 1) {
    const pt = strokePoints[i];
    const leftPt = outline[i] ?? { x: pt.x, y: pt.y };
    const rightPt = outline[outline.length - 1 - i] ?? { x: pt.x, y: pt.y };
    const halfWidth = Math.fround(Math.hypot(leftPt.x - pt.x, leftPt.y - pt.y));
    const turningAngleRad = turningAngleAt(strokePoints, i);
    const isSharpCorner = turningAngleRad >= cornerThreshold;

    // 필압이 낮거나 모서리가 아닌 고속 구간일수록 가장자리 안료 희석이 커진다.
    const pressure = clamp01(pt.pressure);
    const localEdgeRatio = clamp01(edgeBlend * (1 - 0.4 * pressure) * (isSharpCorner ? 0.5 : 1));
    const [er, eg, eb] = kmMixRgb(
      [coreColor[0], coreColor[1], coreColor[2]],
      [substrateOrEdgeColor[0], substrateOrEdgeColor[1], substrateOrEdgeColor[2]],
      localEdgeRatio,
    );

    slices.push({
      center: { x: Math.fround(pt.x), y: Math.fround(pt.y) },
      left: { x: Math.fround(leftPt.x), y: Math.fround(leftPt.y) },
      right: { x: Math.fround(rightPt.x), y: Math.fround(rightPt.y) },
      halfWidth,
      turningAngleRad,
      isSharpCorner,
      coreColor: [
        Math.fround(coreColor[0]),
        Math.fround(coreColor[1]),
        Math.fround(coreColor[2]),
      ],
      edgeColor: [Math.fround(er), Math.fround(eg), Math.fround(eb)],
    });
  }

  return slices;
}
