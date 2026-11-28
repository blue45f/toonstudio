/**
 * Wave-35: 곡률 보존형 벡터·윤곽 선화 업스케일러 및 펜촉 테이퍼 재잉킹 커널
 * (`vector-curvature-lineart-upscaler`).
 *
 * - 만화 펜선의 의도적 예각·직각 모서리(옷깃, 머리카락 끝, 말풍선 꼬리)와 완만한 곡선(볼선, 눈매)을
 *   꺾임 각도 임계값(`sharpCornerMinTurnDeg`)으로 정확히 분리한다.
 * - 연속 곡선 구간은 Barry-Goldman 구심성(`alpha = 0.5`) Catmull-Rom 스플라인으로 보간하여
 *   불균일 디지타이저 간격에서도 첨점(cusp)·자가교차 없이 2x·4x 고해상도로 확장한다.
 * - 필압·선폭 테이퍼는 Fritsch-Carlson 단조 3차 Hermite 보간으로 재잉킹해 번짐과 언더슈트를 막는다.
 */

export const DEFAULT_SHARP_CORNER_MIN_TURN_DEG = 45 as const;
export const DEFAULT_CENTRIPETAL_ALPHA = 0.5 as const;
export const DEFAULT_MITER_LIMIT = 4.0 as const;
export const DEFAULT_BASE_STROKE_WIDTH_PX = 1.5 as const;

export type StrokeWidthScaleMode = "proportional" | "optical-crisp";

export interface InkPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface InkStrokeSample {
  readonly x: number;
  readonly y: number;
  /** 스타일러스 필압 (`0..1`, 생략 시 `1`) */
  readonly pressure?: number;
  /** 원본 1x 기준 선폭 (`px`, 생략 시 `1.5`) */
  readonly widthPx?: number;
}

export interface InkStrokePolyline {
  readonly strokeId: string;
  readonly points: readonly InkStrokeSample[];
  readonly closed?: boolean;
  readonly preserveNibTaper?: boolean;
}

export interface CornerDetectionOptions {
  /** 직진 대비 꺾임 각도 임계값(도, 기본값 `45`) */
  readonly sharpCornerMinTurnDeg?: number;
  readonly minSegmentLengthPx?: number;
  readonly closed?: boolean;
  readonly miterLimit?: number;
}

export interface DetectedInkCorner {
  readonly pointIndex: number;
  readonly point: InkPoint2D;
  /** 직진 벡터 대비 꺾임 각도 (`0..180`도, 클수록 예리한 모서리) */
  readonly turnAngleDeg: number;
  /** 두 선분이 이루는 내각 (`180 - turnAngleDeg`, 작을수록 뾰족한 가시각) */
  readonly interiorAngleDeg: number;
  readonly miterRatio: number;
}

export interface CentripetalEvalSample {
  readonly x: number;
  readonly y: number;
  readonly unitTangent: InkPoint2D;
  readonly tangentAngleRad: number;
  readonly pressure: number;
  readonly widthPx: number;
}

export interface LineartUpscaleOptions {
  readonly scaleFactor?: number;
  readonly subdivisionsPerSpan?: number;
  readonly sharpCornerMinTurnDeg?: number;
  readonly centripetalAlpha?: number;
  readonly strokeWidthScaleMode?: StrokeWidthScaleMode;
  readonly nibTaperGamma?: number;
}

export interface UpscaledInkSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly widthPx: number;
  readonly tangentAngleRad: number;
  readonly isSharpCorner: boolean;
}

export interface UpscaledInkStroke {
  readonly strokeId: string;
  readonly closed: boolean;
  readonly points: readonly UpscaledInkSample[];
  readonly preservedCorners: readonly DetectedInkCorner[];
  readonly arcLengthPx: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
}

export interface UpscaledLineartReport {
  readonly scaleFactor: number;
  readonly strokes: readonly UpscaledInkStroke[];
  readonly totalInputPoints: number;
  readonly totalOutputPoints: number;
  readonly totalPreservedSharpCorners: number;
  readonly maxCornerDriftPx: number;
}

interface NormalizedSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly widthPx: number;
  readonly originalIndex: number;
}

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeSample(sample: InkStrokeSample, originalIndex: number): NormalizedSample {
  const pressure = clamp(sample.pressure ?? 1, 0, 1);
  const rawWidth = sample.widthPx ?? DEFAULT_BASE_STROKE_WIDTH_PX * Math.max(0.08, pressure);
  return {
    x: Number.isFinite(sample.x) ? sample.x : 0,
    y: Number.isFinite(sample.y) ? sample.y : 0,
    pressure,
    widthPx: Math.max(0.02, Number.isFinite(rawWidth) ? rawWidth : DEFAULT_BASE_STROKE_WIDTH_PX),
    originalIndex,
  };
}

function deduplicateSamples(
  points: readonly InkStrokeSample[],
  minSegmentLengthPx: number,
  closed: boolean,
): NormalizedSample[] {
  const cleaned: NormalizedSample[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const raw = points[i];
    if (!raw) continue;
    const norm = normalizeSample(raw, i);
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(norm.x - prev.x, norm.y - prev.y) >= minSegmentLengthPx) {
      cleaned.push(norm);
    }
  }
  if (closed && cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < minSegmentLengthPx) {
      cleaned.pop();
    }
  }
  return cleaned;
}

function evaluateMonotoneScalar4(v0: number, v1: number, v2: number, v3: number, u: number): number {
  const s = clamp(u, 0, 1);
  if (s === 0) return v1;
  if (s === 1) return v2;

  const d0 = v1 - v0;
  const d1 = v2 - v1;
  const d2 = v3 - v2;
  let m1 = d0 * d1 <= 0 ? 0 : 0.5 * (d0 + d1);
  let m2 = d1 * d2 <= 0 ? 0 : 0.5 * (d1 + d2);

  if (Math.abs(d1) < EPSILON) {
    m1 = 0;
    m2 = 0;
  } else {
    const a = m1 / d1;
    const b = m2 / d1;
    const normSq = a * a + b * b;
    if (normSq > 9) {
      const tau = 3 / Math.sqrt(normSq);
      m1 = tau * a * d1;
      m2 = tau * b * d1;
    }
  }

  const s2 = s * s;
  const s3 = s2 * s;
  const val = (2 * s3 - 3 * s2 + 1) * v1 + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * v2 + (s3 - s2) * m2;
  return clamp(val, Math.min(v1, v2), Math.max(v1, v2));
}

/**
 * Barry-Goldman 피라미드 공식으로 구심성(`alpha = 0.5`) Catmull-Rom 곡선 상의 점, 단위 접선,
 * 단조 필압·선폭을 평가한다. `t = 0`에서 정확히 `p1`, `t = 1`에서 정확히 `p2`를 반환한다.
 */
export function evaluateCatmullRomCentripetal(
  p0: InkStrokeSample,
  p1: InkStrokeSample,
  p2: InkStrokeSample,
  p3: InkStrokeSample,
  t: number,
  alpha: number = DEFAULT_CENTRIPETAL_ALPHA,
): CentripetalEvalSample {
  const s0 = normalizeSample(p0, 0);
  const s1 = normalizeSample(p1, 1);
  const s2 = normalizeSample(p2, 2);
  const s3 = normalizeSample(p3, 3);
  const u = clamp(t, 0, 1);
  const safeAlpha = clamp(alpha, 0, 1);

  const knotStep = (a: NormalizedSample, b: NormalizedSample): number =>
    Math.max(EPSILON, Math.pow(Math.max(EPSILON, Math.hypot(b.x - a.x, b.y - a.y)), safeAlpha));

  const t0 = 0;
  const t1 = t0 + knotStep(s0, s1);
  const t2 = t1 + knotStep(s1, s2);
  const t3 = t2 + knotStep(s2, s3);

  const evalPos = (tau: number): InkPoint2D => {
    const a1x = ((t1 - tau) / (t1 - t0)) * s0.x + ((tau - t0) / (t1 - t0)) * s1.x;
    const a1y = ((t1 - tau) / (t1 - t0)) * s0.y + ((tau - t0) / (t1 - t0)) * s1.y;
    const a2x = ((t2 - tau) / (t2 - t1)) * s1.x + ((tau - t1) / (t2 - t1)) * s2.x;
    const a2y = ((t2 - tau) / (t2 - t1)) * s1.y + ((tau - t1) / (t2 - t1)) * s2.y;
    const a3x = ((t3 - tau) / (t3 - t2)) * s2.x + ((tau - t2) / (t3 - t2)) * s3.x;
    const a3y = ((t3 - tau) / (t3 - t2)) * s2.y + ((tau - t2) / (t3 - t2)) * s3.y;
    const b1x = ((t2 - tau) / (t2 - t0)) * a1x + ((tau - t0) / (t2 - t0)) * a2x;
    const b1y = ((t2 - tau) / (t2 - t0)) * a1y + ((tau - t0) / (t2 - t0)) * a2y;
    const b2x = ((t3 - tau) / (t3 - t1)) * a2x + ((tau - t1) / (t3 - t1)) * a3x;
    const b2y = ((t3 - tau) / (t3 - t1)) * a2y + ((tau - t1) / (t3 - t1)) * a3y;
    return {
      x: ((t2 - tau) / (t2 - t1)) * b1x + ((tau - t1) / (t2 - t1)) * b2x,
      y: ((t2 - tau) / (t2 - t1)) * b1y + ((tau - t1) / (t2 - t1)) * b2y,
    };
  };

  const tau = t1 + u * (t2 - t1);
  const pos = u === 0 ? { x: s1.x, y: s1.y } : u === 1 ? { x: s2.x, y: s2.y } : evalPos(tau);
  const deltaTau = Math.max(1e-5, (t2 - t1) * 1e-3);
  const pMinus = evalPos(Math.max(t1, tau - deltaTau));
  const pPlus = evalPos(Math.min(t2, tau + deltaTau));

  let dx = pPlus.x - pMinus.x;
  let dy = pPlus.y - pMinus.y;
  let norm = Math.hypot(dx, dy);
  if (norm < EPSILON) {
    dx = s2.x - s1.x;
    dy = s2.y - s1.y;
    norm = Math.hypot(dx, dy);
  }
  const unitTangent: InkPoint2D = norm >= EPSILON ? { x: dx / norm, y: dy / norm } : { x: 1, y: 0 };

  return {
    x: pos.x,
    y: pos.y,
    unitTangent,
    tangentAngleRad: Math.atan2(unitTangent.y, unitTangent.x),
    pressure: clamp(evaluateMonotoneScalar4(s0.pressure, s1.pressure, s2.pressure, s3.pressure, u), 0, 1),
    widthPx: Math.max(0.02, evaluateMonotoneScalar4(s0.widthPx, s1.widthPx, s2.widthPx, s3.widthPx, u)),
  };
}

/**
 * 폴리라인에서 의도적인 만화 펜선 뾰족 모서리(옷깃, 머리카락 끝, 집중선 꺾임)를 검출한다.
 */
export function detectSharpInkCorners(
  points: readonly InkStrokeSample[],
  options: CornerDetectionOptions = {},
): readonly DetectedInkCorner[] {
  const minTurnDeg = clamp(options.sharpCornerMinTurnDeg ?? DEFAULT_SHARP_CORNER_MIN_TURN_DEG, 5, 179);
  const minSegLen = Math.max(1e-6, options.minSegmentLengthPx ?? 1e-4);
  const closed = options.closed ?? false;
  const miterLimit = Math.max(1, options.miterLimit ?? DEFAULT_MITER_LIMIT);
  const cleaned = deduplicateSamples(points, minSegLen, closed);
  const n = cleaned.length;
  if (n < 3) return [];

  const corners: DetectedInkCorner[] = [];
  const startIdx = closed ? 0 : 1;
  const endIdx = closed ? n - 1 : n - 2;

  for (let i = startIdx; i <= endIdx; i += 1) {
    const prev = cleaned[(i - 1 + n) % n];
    const curr = cleaned[i];
    const next = cleaned[(i + 1) % n];
    if (!prev || !curr || !next) continue;

    const inX = curr.x - prev.x;
    const inY = curr.y - prev.y;
    const outX = next.x - curr.x;
    const outY = next.y - curr.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (inLen < minSegLen || outLen < minSegLen) continue;

    const dot = clamp((inX * outX + inY * outY) / (inLen * outLen), -1, 1);
    const turnAngleDeg = (Math.acos(dot) * 180) / Math.PI;
    if (turnAngleDeg + 1e-9 < minTurnDeg) continue;

    const interiorAngleDeg = 180 - turnAngleDeg;
    const halfInteriorRad = ((interiorAngleDeg * Math.PI) / 180) * 0.5;
    corners.push({
      pointIndex: curr.originalIndex,
      point: { x: curr.x, y: curr.y },
      turnAngleDeg,
      interiorAngleDeg,
      miterRatio: Math.min(miterLimit, 1 / Math.max(1e-3, Math.sin(halfInteriorRad))),
    });
  }
  return corners;
}

function reflectEndpoint(anchor: NormalizedSample, interior: NormalizedSample): NormalizedSample {
  return {
    x: 2 * anchor.x - interior.x,
    y: 2 * anchor.y - interior.y,
    pressure: clamp(2 * anchor.pressure - interior.pressure, 0, 1),
    widthPx: Math.max(0.02, 2 * anchor.widthPx - interior.widthPx),
    originalIndex: anchor.originalIndex,
  };
}

function resolveSpanSteps(p1: NormalizedSample, p2: NormalizedSample, scaleFactor: number, explicit?: number): number {
  if (explicit !== undefined) return Math.max(1, Math.round(explicit));
  const chordPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return Math.max(2, Math.min(32, Math.ceil(Math.max(2, chordPx * 0.25) * scaleFactor)));
}

function upscaleOpenSmoothChain(
  chain: readonly NormalizedSample[],
  scaleFactor: number,
  widthScale: number,
  alpha: number,
  explicitSubdivisions: number | undefined,
  cornerOriginalIndices: ReadonlySet<number>,
): UpscaledInkSample[] {
  const first = chain[0];
  if (!first) return [];
  if (chain.length === 1) {
    return [
      {
        x: first.x * scaleFactor,
        y: first.y * scaleFactor,
        pressure: first.pressure,
        widthPx: first.widthPx * widthScale,
        tangentAngleRad: 0,
        isSharpCorner: cornerOriginalIndices.has(first.originalIndex),
      },
    ];
  }

  const out: UpscaledInkSample[] = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const p1 = chain[i];
    const p2 = chain[i + 1];
    if (!p1 || !p2) continue;
    const p0 = i > 0 ? (chain[i - 1] ?? reflectEndpoint(p1, p2)) : reflectEndpoint(p1, p2);
    const p3 = i + 2 < chain.length ? (chain[i + 2] ?? reflectEndpoint(p2, p1)) : reflectEndpoint(p2, p1);
    const steps = resolveSpanSteps(p1, p2, scaleFactor, explicitSubdivisions);

    for (let step = i === 0 ? 0 : 1; step <= steps; step += 1) {
      const sample = evaluateCatmullRomCentripetal(p0, p1, p2, p3, step / steps, alpha);
      const isCorner =
        (step === 0 && cornerOriginalIndices.has(p1.originalIndex)) ||
        (step === steps && cornerOriginalIndices.has(p2.originalIndex));
      out.push({
        x: sample.x * scaleFactor,
        y: sample.y * scaleFactor,
        pressure: sample.pressure,
        widthPx: sample.widthPx * widthScale,
        tangentAngleRad: sample.tangentAngleRad,
        isSharpCorner: isCorner,
      });
    }
  }
  return out;
}

function upscaleSplitSequence(
  sequence: readonly NormalizedSample[],
  splitIndices: readonly number[],
  scaleFactor: number,
  widthScale: number,
  alpha: number,
  explicitSubdivisions: number | undefined,
  cornerOrigSet: ReadonlySet<number>,
): UpscaledInkSample[] {
  const acc: UpscaledInkSample[] = [];
  for (let s = 0; s < splitIndices.length - 1; s += 1) {
    const fromIdx = splitIndices[s] ?? 0;
    const toIdx = splitIndices[s + 1] ?? sequence.length - 1;
    if (toIdx <= fromIdx) continue;
    const subUpscaled = upscaleOpenSmoothChain(
      sequence.slice(fromIdx, toIdx + 1),
      scaleFactor,
      widthScale,
      alpha,
      explicitSubdivisions,
      cornerOrigSet,
    );
    acc.push(...(acc.length > 0 ? subUpscaled.slice(1) : subUpscaled));
  }
  return acc;
}

/**
 * 다중 선화 폴리라인을 곡률·뾰족 모서리·펜촉 테이퍼를 보존하며 목표 고배율(2x·4x 등)로 업스케일한다.
 */
export function upscaleLineartPolylines(
  polylines: readonly InkStrokePolyline[],
  options: LineartUpscaleOptions = {},
): UpscaledLineartReport {
  const scaleFactor = clamp(options.scaleFactor ?? 2, 0.25, 16);
  const alpha = clamp(options.centripetalAlpha ?? DEFAULT_CENTRIPETAL_ALPHA, 0, 1);
  const mode = options.strokeWidthScaleMode ?? "proportional";
  const widthScale = mode === "proportional" ? scaleFactor : scaleFactor * Math.pow(scaleFactor, -0.06);
  const taperGamma = clamp(options.nibTaperGamma ?? 1, 0.5, 2);
  const sharpTurnDeg = options.sharpCornerMinTurnDeg ?? DEFAULT_SHARP_CORNER_MIN_TURN_DEG;

  const strokes: UpscaledInkStroke[] = [];
  let totalInputPoints = 0;
  let totalOutputPoints = 0;
  let totalPreservedSharpCorners = 0;
  let maxCornerDriftPx = 0;

  for (const stroke of polylines) {
    const closed = stroke.closed ?? false;
    totalInputPoints += stroke.points.length;
    const cleaned = deduplicateSamples(stroke.points, 1e-4, closed);
    const detectedCorners = detectSharpInkCorners(stroke.points, { sharpCornerMinTurnDeg: sharpTurnDeg, closed });
    const cornerOrigSet = new Set<number>(detectedCorners.map((c) => c.pointIndex));
    const cleanedCorners = cleaned
      .map((item, idx) => (cornerOrigSet.has(item.originalIndex) ? idx : -1))
      .filter((idx) => idx >= 0);

    let upscaledPoints: UpscaledInkSample[] = [];
    if (cleaned.length <= 2) {
      upscaledPoints = upscaleOpenSmoothChain(cleaned, scaleFactor, widthScale, alpha, options.subdivisionsPerSpan, cornerOrigSet);
    } else if (!closed) {
      upscaledPoints = upscaleSplitSequence(
        cleaned,
        [0, ...cleanedCorners, cleaned.length - 1],
        scaleFactor,
        widthScale,
        alpha,
        options.subdivisionsPerSpan,
        cornerOrigSet,
      );
    } else if (cleanedCorners.length === 0) {
      const n = cleaned.length;
      for (let i = 0; i < n; i += 1) {
        const p0 = cleaned[(i - 1 + n) % n];
        const p1 = cleaned[i];
        const p2 = cleaned[(i + 1) % n];
        const p3 = cleaned[(i + 2) % n];
        if (!p0 || !p1 || !p2 || !p3) continue;
        const steps = resolveSpanSteps(p1, p2, scaleFactor, options.subdivisionsPerSpan);
        for (let step = 0; step < steps; step += 1) {
          const s = evaluateCatmullRomCentripetal(p0, p1, p2, p3, step / steps, alpha);
          upscaledPoints.push({
            x: s.x * scaleFactor,
            y: s.y * scaleFactor,
            pressure: s.pressure,
            widthPx: s.widthPx * widthScale,
            tangentAngleRad: s.tangentAngleRad,
            isSharpCorner: false,
          });
        }
      }
    } else {
      const firstCornerIdx = cleanedCorners[0] ?? 0;
      const rotated: NormalizedSample[] = [];
      for (let k = 0; k <= cleaned.length; k += 1) {
        const sample = cleaned[(firstCornerIdx + k) % cleaned.length];
        if (sample) rotated.push(sample);
      }
      const rotSplits = [0];
      for (let r = 1; r < rotated.length - 1; r += 1) {
        const sample = rotated[r];
        if (sample && cornerOrigSet.has(sample.originalIndex)) rotSplits.push(r);
      }
      rotSplits.push(rotated.length - 1);
      upscaledPoints = upscaleSplitSequence(rotated, rotSplits, scaleFactor, widthScale, alpha, options.subdivisionsPerSpan, cornerOrigSet);
      if (upscaledPoints.length > 1) upscaledPoints.pop();
    }

    if ((stroke.preserveNibTaper ?? true) && !closed && taperGamma !== 1 && upscaledPoints.length > 0) {
      upscaledPoints = upscaledPoints.map((pt) => {
        const shaped = Math.pow(pt.pressure, taperGamma);
        const ratio = pt.pressure > EPSILON ? shaped / pt.pressure : 1;
        return { ...pt, pressure: shaped, widthPx: Math.max(0.02, pt.widthPx * ratio) };
      });
    }

    for (const corner of detectedCorners) {
      let bestDist = Number.POSITIVE_INFINITY;
      for (const upPt of upscaledPoints) {
        if (!upPt.isSharpCorner) continue;
        bestDist = Math.min(bestDist, Math.hypot(upPt.x - corner.point.x * scaleFactor, upPt.y - corner.point.y * scaleFactor));
      }
      if (Number.isFinite(bestDist) && bestDist > maxCornerDriftPx) maxCornerDriftPx = bestDist;
    }

    let arcLengthPx = 0;
    let minWidthPx = upscaledPoints.length > 0 ? Number.POSITIVE_INFINITY : 0;
    let maxWidthPx = 0;
    for (let i = 0; i < upscaledPoints.length; i += 1) {
      const curr = upscaledPoints[i];
      if (!curr) continue;
      minWidthPx = Math.min(minWidthPx, curr.widthPx);
      maxWidthPx = Math.max(maxWidthPx, curr.widthPx);
      const prev = i > 0 ? upscaledPoints[i - 1] : undefined;
      if (prev) arcLengthPx += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }
    if (closed && upscaledPoints.length > 1) {
      const firstPt = upscaledPoints[0];
      const lastPt = upscaledPoints[upscaledPoints.length - 1];
      if (firstPt && lastPt) arcLengthPx += Math.hypot(firstPt.x - lastPt.x, firstPt.y - lastPt.y);
    }

    const scaledCorners = detectedCorners.map((c) => ({
      ...c,
      point: { x: c.point.x * scaleFactor, y: c.point.y * scaleFactor },
    }));
    strokes.push({ strokeId: stroke.strokeId, closed, points: upscaledPoints, preservedCorners: scaledCorners, arcLengthPx, minWidthPx, maxWidthPx });
    totalOutputPoints += upscaledPoints.length;
    totalPreservedSharpCorners += scaledCorners.length;
  }

  return { scaleFactor, strokes, totalInputPoints, totalOutputPoints, totalPreservedSharpCorners, maxCornerDriftPx };
}
