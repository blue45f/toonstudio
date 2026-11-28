/**
 * Wave 124 — 주곡률 방향장 기반 RK2 유선 적분 만화 손그림 크로스해칭 솔버.
 *
 * - 2차 룽게-쿠타(RK2) 양방향 유선 적분 + 실루엣 경계 이분 탐색 엄격 클리핑
 * - 동일 계층 공간 해시 점유 격자로 암부 밀도 집중 및 중간톤 여백 균형 유지
 * - 결정론적 시드 기반 재현성 보장
 */

import {
  auditCrossHatchingMetrics,
  computeTaperWidthPx,
  getHatchStyleProfile,
  HATCH_STYLE_PROFILES,
  type CrossHatchingAuditMetrics,
  type CrossHatchingSpec,
  type CurvatureCrossHatchingResult,
  type HatchLayerSpec,
  type HatchLayerTier,
  type HatchStroke,
  type HatchStrokePoint,
  type HatchStyleProfile,
  type ToneZoneDensityMetrics,
} from "./hatch-style-profiles-and-audit";
import {
  ALL_HATCH_STYLES,
  ALL_SURFACE_PRESETS,
  clampFinite,
  createSeededRng,
  createSurfaceFieldEvaluator,
  DEFAULT_LIGHT_DIRECTION,
  extractSilhouetteOutline,
  normalizeVec2,
  rotateVec2,
  sampleCurvatureDirectionArrows,
  type CurvatureDirectionArrow,
  type CustomNormalFieldInput,
  type HatchStyleId,
  type SurfaceFieldEvaluator,
  type SurfacePresetId,
  type SurfaceSample,
  type Vec2,
  type Vec3,
} from "./surface-curvature-fields";

export {
  ALL_HATCH_STYLES,
  ALL_SURFACE_PRESETS,
  auditCrossHatchingMetrics,
  clampFinite,
  computeTaperWidthPx,
  createSeededRng,
  createSurfaceFieldEvaluator,
  DEFAULT_LIGHT_DIRECTION,
  extractSilhouetteOutline,
  getHatchStyleProfile,
  HATCH_STYLE_PROFILES,
  normalizeVec2,
  rotateVec2,
  sampleCurvatureDirectionArrows,
  type CrossHatchingAuditMetrics,
  type CrossHatchingSpec,
  type CurvatureCrossHatchingResult,
  type CurvatureDirectionArrow,
  type CustomNormalFieldInput,
  type HatchLayerSpec,
  type HatchLayerTier,
  type HatchStroke,
  type HatchStrokePoint,
  type HatchStyleId,
  type HatchStyleProfile,
  type SurfaceFieldEvaluator,
  type SurfacePresetId,
  type SurfaceSample,
  type ToneZoneDensityMetrics,
  type Vec2,
  type Vec3,
};

/**
 * 동일 계층 스트로크 간 최소 간격을 유지하기 위한 공간 해시 점유 격자.
 */
class LayerOccupancyGrid {
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: Map<number, Vec2[]>;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = Math.max(2, cellSize);
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    this.buckets = new Map<number, Vec2[]>();
  }

  private bucketKey(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  public isTooClose(x: number, y: number, minDistance: number): boolean {
    const minDistSq = minDistance * minDistance;
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const span = Math.max(1, Math.ceil(minDistance / this.cellSize));

    for (let dy = -span; dy <= span; dy += 1) {
      const ny = cy + dy;
      if (ny < 0 || ny >= this.rows) continue;
      for (let dx = -span; dx <= span; dx += 1) {
        const nx = cx + dx;
        if (nx < 0 || nx >= this.cols) continue;
        const list = this.buckets.get(this.bucketKey(nx, ny));
        if (!list) continue;
        for (let i = 0; i < list.length; i += 1) {
          const pt = list[i];
          const ddx = pt.x - x;
          const ddy = pt.y - y;
          if (ddx * ddx + ddy * ddy < minDistSq) return true;
        }
      }
    }
    return false;
  }

  public insertPoints(points: readonly Vec2[]): void {
    for (let i = 0; i < points.length; i += 1) {
      const pt = points[i];
      const cx = Math.max(0, Math.min(this.cols - 1, Math.floor(pt.x / this.cellSize)));
      const cy = Math.max(0, Math.min(this.rows - 1, Math.floor(pt.y / this.cellSize)));
      const key = this.bucketKey(cx, cy);
      let list = this.buckets.get(key);
      if (!list) {
        list = [];
        this.buckets.set(key, list);
      }
      list.push(pt);
    }
  }
}

function sampleLayerTangent(
  evaluator: SurfaceFieldEvaluator,
  x: number,
  y: number,
  angleRad: number,
  prevDir: Vec2 | null,
): { readonly sample: SurfaceSample; readonly dir: Vec2 } {
  const s = evaluator.sample(x, y);
  const rotated = angleRad === 0 ? s.principalTangent1 : rotateVec2(s.principalTangent1, angleRad);
  let dir = normalizeVec2(rotated.x, rotated.y, 1, 0);
  if (prevDir && dir.x * prevDir.x + dir.y * prevDir.y < 0) {
    dir = { x: -dir.x, y: -dir.y };
  }
  return { sample: s, dir };
}

function computeLocalSpacing(
  layer: HatchLayerSpec,
  luminance: number,
  densityScale: number,
  isNoirSingleLayer: boolean,
): number {
  const safeThreshold = Math.max(0.05, layer.activationLuminance);
  const lumaRatio = clampFinite(luminance / safeThreshold, 0, 1, 0.5);
  const toneFactor = isNoirSingleLayer
    ? 0.44 + 1.24 * lumaRatio
    : 0.56 + 0.96 * lumaRatio;
  return Math.max(2.2, (layer.baseSpacingPx * toneFactor) / densityScale);
}

interface RawTracePoint {
  readonly x: number;
  readonly y: number;
  readonly luminance: number;
}

/**
 * 시작점 p0에서 한쪽 부호(+1 또는 -1)로 2차 룽게-쿠타(RK2) 유선 적분을 수행한다.
 * 실루엣 외부로 벗어나거나 하이라이트 영역에 진입하면 이분 탐색으로 경계 직전에 엄격 클리핑한다.
 */
function traceRk2HalfStreamline(
  evaluator: SurfaceFieldEvaluator,
  occupancy: LayerOccupancyGrid,
  start: RawTracePoint,
  initialDir: Vec2,
  angleRad: number,
  stepSizePx: number,
  maxSteps: number,
  layer: HatchLayerSpec,
  densityScale: number,
  isNoirSingleLayer: boolean,
): readonly RawTracePoint[] {
  const points: RawTracePoint[] = [];
  let curr = start;
  let prevDir = initialDir;

  for (let step = 0; step < maxSteps; step += 1) {
    const k1 = sampleLayerTangent(evaluator, curr.x, curr.y, angleRad, prevDir).dir;
    const midX = curr.x + 0.5 * stepSizePx * k1.x;
    const midY = curr.y + 0.5 * stepSizePx * k1.y;
    const k2 = evaluator.isPointInsideMask(midX, midY)
      ? sampleLayerTangent(evaluator, midX, midY, angleRad, k1).dir
      : k1;

    const nextX = curr.x + stepSizePx * k2.x;
    const nextY = curr.y + stepSizePx * k2.y;
    const nextSample = evaluator.sample(nextX, nextY);
    const canContinue =
      nextSample.insideMask &&
      nextSample.luminance <= layer.stopLuminance &&
      nextSample.luminance < 0.8;

    if (!canContinue) {
      let lo = 0;
      let hi = 1;
      let clipped: RawTracePoint | null = null;
      for (let iter = 0; iter < 5; iter += 1) {
        const midT = (lo + hi) * 0.5;
        const cx = curr.x + (nextX - curr.x) * midT;
        const cy = curr.y + (nextY - curr.y) * midT;
        const cs = evaluator.sample(cx, cy);
        if (cs.insideMask && cs.luminance <= layer.stopLuminance && cs.luminance < 0.8) {
          lo = midT;
          clipped = { x: cx, y: cy, luminance: cs.luminance };
        } else {
          hi = midT;
        }
      }
      if (clipped && Math.hypot(clipped.x - curr.x, clipped.y - curr.y) >= 0.45) {
        points.push(clipped);
      }
      break;
    }

    const localSpacing = computeLocalSpacing(
      layer,
      nextSample.luminance,
      densityScale,
      isNoirSingleLayer,
    );
    if (occupancy.isTooClose(nextX, nextY, localSpacing * 0.66)) {
      break;
    }

    const nextPt: RawTracePoint = { x: nextX, y: nextY, luminance: nextSample.luminance };
    points.push(nextPt);
    curr = nextPt;
    prevDir = k2;
  }

  return points;
}

interface CandidateSeed {
  readonly x: number;
  readonly y: number;
  readonly luminance: number;
  readonly tieBreaker: number;
}

function generateLayerStrokes(
  evaluator: SurfaceFieldEvaluator,
  profile: HatchStyleProfile,
  layer: HatchLayerSpec,
  densityScale: number,
  strokeWidthScale: number,
  rng: () => number,
  idStartIndex: number,
): readonly HatchStroke[] {
  if (!layer.enabled || evaluator.width <= 0 || evaluator.height <= 0) return [];

  const isNoirSingleLayer = profile.id === "noir-parallel-engraving";
  const angleRad = (layer.angleOffsetDeg * Math.PI) / 180;
  const candidateStep = Math.max(2.8, (layer.baseSpacingPx / densityScale) * 0.44);
  const candidates: CandidateSeed[] = [];

  for (let gy = candidateStep * 0.5; gy < evaluator.height; gy += candidateStep) {
    for (let gx = candidateStep * 0.5; gx < evaluator.width; gx += candidateStep) {
      const jx = gx + (rng() - 0.5) * candidateStep * 0.58;
      const jy = gy + (rng() - 0.5) * candidateStep * 0.58;
      const s = evaluator.sample(jx, jy);
      if (!s.insideMask) continue;
      if (s.luminance > layer.activationLuminance || s.luminance >= 0.8) continue;
      candidates.push({ x: jx, y: jy, luminance: s.luminance, tieBreaker: rng() });
    }
  }

  // 가장 어두운 암부 시드부터 배치해 암부 밀도 집중과 중간톤 여백을 자연스럽게 분리한다.
  candidates.sort((a, b) => {
    const lumaDiff = a.luminance - b.luminance;
    if (Math.abs(lumaDiff) > 1e-6) return lumaDiff;
    return a.tieBreaker - b.tieBreaker;
  });

  const occupancy = new LayerOccupancyGrid(
    evaluator.width,
    evaluator.height,
    Math.max(4, layer.baseSpacingPx / densityScale),
  );
  const strokes: HatchStroke[] = [];
  let strokeSeq = idStartIndex;

  for (let i = 0; i < candidates.length; i += 1) {
    const seed = candidates[i];
    const localSpacing = computeLocalSpacing(
      layer,
      seed.luminance,
      densityScale,
      isNoirSingleLayer,
    );
    if (occupancy.isTooClose(seed.x, seed.y, localSpacing * 0.88)) continue;

    const initial = sampleLayerTangent(evaluator, seed.x, seed.y, angleRad, null);
    const startPt: RawTracePoint = { x: seed.x, y: seed.y, luminance: seed.luminance };
    const forward = traceRk2HalfStreamline(
      evaluator,
      occupancy,
      startPt,
      initial.dir,
      angleRad,
      profile.stepSizePx,
      layer.maxHalfSteps,
      layer,
      densityScale,
      isNoirSingleLayer,
    );
    const backward = traceRk2HalfStreamline(
      evaluator,
      occupancy,
      startPt,
      { x: -initial.dir.x, y: -initial.dir.y },
      angleRad,
      profile.stepSizePx,
      layer.maxHalfSteps,
      layer,
      densityScale,
      isNoirSingleLayer,
    );

    const combined: RawTracePoint[] = [];
    for (let b = backward.length - 1; b >= 0; b -= 1) combined.push(backward[b]);
    combined.push(startPt);
    for (let f = 0; f < forward.length; f += 1) combined.push(forward[f]);
    if (combined.length < 3) continue;

    const cumulativeLengths: number[] = [0];
    let totalLen = 0;
    let lumaSum = combined[0].luminance;
    for (let k = 1; k < combined.length; k += 1) {
      totalLen += Math.hypot(
        combined[k].x - combined[k - 1].x,
        combined[k].y - combined[k - 1].y,
      );
      cumulativeLengths.push(totalLen);
      lumaSum += combined[k].luminance;
    }
    if (totalLen < profile.minStrokeLengthPx) continue;

    const meanLuminance = lumaSum / combined.length;
    const peakWidthPx =
      layer.baseWidthPx * strokeWidthScale * (1 + profile.shadowWeightBoost * (1 - meanLuminance));

    const strokePoints: HatchStrokePoint[] = [];
    for (let k = 0; k < combined.length; k += 1) {
      const arcT = totalLen > 1e-6 ? cumulativeLengths[k] / totalLen : 0.5;
      const widthPx = computeTaperWidthPx(
        arcT,
        peakWidthPx,
        profile.tipWidthRatio,
        profile.taperExponent,
      );
      strokePoints.push({
        x: combined[k].x,
        y: combined[k].y,
        widthPx,
        arcT,
        luminance: combined[k].luminance,
      });
    }

    const midIndex = Math.floor(strokePoints.length / 2);
    strokes.push({
      id: `hatch-t${layer.tier}-${strokeSeq}`,
      layer: layer.tier,
      angleOffsetDeg: layer.angleOffsetDeg,
      points: strokePoints,
      arcLengthPx: totalLen,
      startWidthPx: strokePoints[0].widthPx,
      centerWidthPx: strokePoints[midIndex].widthPx,
      endWidthPx: strokePoints[strokePoints.length - 1].widthPx,
      meanLuminance,
    });
    strokeSeq += 1;
    occupancy.insertPoints(combined);
  }

  return strokes;
}

/**
 * 주곡률 방향장 기반 RK2 손그림 크로스해칭 스트로크와 톤 밀도 감사 결과를 생성한다.
 */
export function generateCurvatureAlignedCrossHatching(
  spec: CrossHatchingSpec = {},
): CurvatureCrossHatchingResult {
  const styleId: HatchStyleId = spec.styleId ?? "g-pen-classic-cross";
  const profile = getHatchStyleProfile(styleId);
  const seed = Math.trunc(clampFinite(spec.seed ?? 12401, -2147483647, 2147483647, 12401));
  const densityScale = clampFinite(spec.densityScale ?? 1.0, 0.4, 2.0, 1.0);
  const strokeWidthScale = clampFinite(spec.strokeWidthScale ?? 1.0, 0.5, 2.0, 1.0);

  const evaluator = createSurfaceFieldEvaluator({
    surfacePreset: spec.surfacePreset,
    customField: spec.customField,
    width: spec.width,
    height: spec.height,
    lightDirection: spec.lightDirection,
  });

  const rng = createSeededRng(seed);
  const allStrokes: HatchStroke[] = [];
  let nextStrokeId = 1;

  for (let i = 0; i < profile.layers.length; i += 1) {
    const layerStrokes = generateLayerStrokes(
      evaluator,
      profile,
      profile.layers[i],
      densityScale,
      strokeWidthScale,
      rng,
      nextStrokeId,
    );
    for (let s = 0; s < layerStrokes.length; s += 1) {
      allStrokes.push(layerStrokes[s]);
    }
    nextStrokeId += layerStrokes.length;
  }

  const metrics = auditCrossHatchingMetrics(evaluator, allStrokes);
  const directionArrows = sampleCurvatureDirectionArrows(evaluator, 11, 11);
  const silhouetteOutline = extractSilhouetteOutline(evaluator, metrics.maskCentroid, 64);

  return {
    surfacePreset: evaluator.preset,
    styleId,
    width: evaluator.width,
    height: evaluator.height,
    lightDirection: evaluator.lightDirection,
    seed,
    styleProfile: profile,
    strokes: allStrokes,
    directionArrows,
    silhouetteOutline,
    metrics,
  };
}
