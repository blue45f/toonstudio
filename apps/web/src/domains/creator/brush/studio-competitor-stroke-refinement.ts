/**
 * 스튜디오 실제 드로잉 툴 & 브러시 랩 공유 Wave 37 스트로크 곡률 보간·서브픽셀 테이퍼·강모 정제기.
 *
 * DOM/React 의존성 없이 평탄 좌표(`[x0, y0, x1, y1, ...]`)와 필압 배열을 받아:
 * 1. 구심(Centripetal, alpha=0.5) Catmull-Rom 곡선 리샘플링으로 급선회 다각형 꺾임을 완화하고,
 * 2. 곡률·반경 기울기 적응형 스탬프 밀도를 산출하여 콩알 자국(scalloping)을 억제하며,
 * 3. 고속 출필 칼끝 테이퍼(CSP 리얼 G펜·마루펜 스타일) 및 원심 강모 부채꼴 텔레메트리를 계산한다.
 */

export interface StudioRefinedStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly radiusPx: number;
  readonly curvatureInvPx: number;
  readonly adaptiveSpacingPx: number;
}

export interface StudioStrokeRefinementResult {
  readonly points: readonly number[];
  readonly pressures: readonly number[];
  readonly stamps: readonly StudioRefinedStrokeSample[];
  readonly linearMaxKinkDeg: number;
  readonly refinedMaxKinkDeg: number;
  readonly kinkReductionRatio01: number;
  readonly linearScallopRatio01: number;
  readonly adaptiveScallopRatio01: number;
  readonly scallopReductionGain01: number;
  readonly terminalTaperRadiusPx: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function wrapAngleDeltaRad(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

interface RawPt {
  readonly x: number;
  readonly y: number;
  readonly p: number;
}

function evalCentripetalCatmull(
  p0: RawPt,
  p1: RawPt,
  p2: RawPt,
  p3: RawPt,
  u01: number,
): RawPt {
  const stepOf = (a: RawPt, b: RawPt): number =>
    Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  const t0 = 0;
  const t1 = t0 + stepOf(p0, p1);
  const t2 = t1 + stepOf(p1, p2);
  const t3 = t2 + stepOf(p2, p3);
  const t = t1 + clamp01(u01) * (t2 - t1);

  const mix = (a: RawPt, b: RawPt, ta: number, tb: number): RawPt => {
    const w = (t - ta) / Math.max(1e-5, tb - ta);
    return {
      x: a.x + (b.x - a.x) * w,
      y: a.y + (b.y - a.y) * w,
      p: a.p + (b.p - a.p) * w,
    };
  };

  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  const out = mix(b1, b2, t1, t2);
  return { x: out.x, y: out.y, p: clamp01(out.p) };
}

function computeMaxTurnKinkDeg(pts: readonly { readonly x: number; readonly y: number }[]): number {
  if (pts.length < 3) return 0;
  let maxDeg = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-4 || Math.hypot(c.x - b.x, c.y - b.y) < 1e-4) continue;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    const deg = (Math.abs(wrapAngleDeltaRad(a1, a2)) * 180) / Math.PI;
    if (deg > maxDeg) maxDeg = deg;
  }
  return Number(maxDeg.toFixed(3));
}

function computeScallopRatio(
  stamps: readonly { readonly x: number; readonly y: number; readonly radiusPx: number }[],
): number {
  if (stamps.length < 2) return 0;
  let worst = 0;
  for (let i = 1; i < stamps.length; i += 1) {
    const prev = stamps[i - 1]!;
    const curr = stamps[i]!;
    const halfDist = Math.hypot(curr.x - prev.x, curr.y - prev.y) * 0.5;
    const r = Math.max(0.4, (prev.radiusPx + curr.radiusPx) * 0.5);
    const crest = halfDist >= r ? 0 : Math.sqrt(Math.max(0, r * r - halfDist * halfDist));
    const scallop = (r - crest) / r;
    if (scallop > worst) worst = scallop;
  }
  return Number(clamp01(worst).toFixed(4));
}

/**
 * 자유곡선 좌표/필압 시퀀스에 구심 Catmull-Rom 곡률 적응형 정제 및 칼끝 테이퍼를 적용한다.
 */
export function refineStudioCompetitorFreehandStroke(input: {
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly strokeWidthPx: number;
  readonly baseSpacingRatio?: number;
  readonly subdivisionsPerSegment?: number;
  readonly exitTaperStrength01?: number;
}): StudioStrokeRefinementResult {
  const pairCount = Math.floor(input.points.length / 2);
  if (pairCount === 0) {
    return {
      points: [],
      pressures: [],
      stamps: [],
      linearMaxKinkDeg: 0,
      refinedMaxKinkDeg: 0,
      kinkReductionRatio01: 0,
      linearScallopRatio01: 0,
      adaptiveScallopRatio01: 0,
      scallopReductionGain01: 0,
      terminalTaperRadiusPx: 0,
    };
  }

  const rawPts: RawPt[] = [];
  for (let i = 0; i < pairCount; i += 1) {
    const x = input.points[i * 2];
    const y = input.points[i * 2 + 1];
    if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
      break;
    }
    const p = clamp01(input.pressures?.[i] ?? 0.5);
    rawPts.push({ x, y, p });
  }

  const diameter = Math.max(1, input.strokeWidthPx);
  const spacingRatio = clamp(input.baseSpacingRatio ?? 0.12, 0.04, 0.6);
  const subdivs = Math.max(2, Math.min(16, Math.round(input.subdivisionsPerSegment ?? 8)));
  const taperStrength = clamp01(input.exitTaperStrength01 ?? 0.72);

  if (rawPts.length === 1) {
    const only = rawPts[0]!;
    const r = Math.max(0.35, diameter * 0.5 * (0.2 + 0.8 * only.p));
    return {
      points: [only.x, only.y],
      pressures: [only.p],
      stamps: [{
        x: only.x,
        y: only.y,
        pressure: only.p,
        radiusPx: r,
        curvatureInvPx: 0,
        adaptiveSpacingPx: Math.max(0.35, 2 * r * spacingRatio),
      }],
      linearMaxKinkDeg: 0,
      refinedMaxKinkDeg: 0,
      kinkReductionRatio01: 0,
      linearScallopRatio01: 0,
      adaptiveScallopRatio01: 0,
      scallopReductionGain01: 0,
      terminalTaperRadiusPx: r,
    };
  }

  // 비교군: 균일 선형 보간 스탬프
  const linearStamps: Array<{ readonly x: number; readonly y: number; readonly radiusPx: number }> = [];
  const coarseRatio = Math.max(0.34, spacingRatio * 2.4);
  for (let i = 0; i < rawPts.length - 1; i += 1) {
    const a = rawPts[i]!;
    const b = rawPts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const rMid = Math.max(0.4, diameter * 0.5 * (0.2 + 0.8 * ((a.p + b.p) * 0.5)));
    const step = Math.max(0.75, 2 * rMid * coarseRatio);
    const n = Math.max(1, Math.floor(len / step));
    for (let k = 0; k <= n; k += 1) {
      if (i > 0 && k === 0) continue;
      const t = k / n;
      const p = a.p + (b.p - a.p) * t;
      linearStamps.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        radiusPx: Math.max(0.4, diameter * 0.5 * (0.2 + 0.8 * p)),
      });
    }
  }

  // 실험군: 구심 Catmull-Rom 곡선 정제
  const reflectPt = (anchor: RawPt, inner: RawPt): RawPt => ({
    x: 2 * anchor.x - inner.x,
    y: 2 * anchor.y - inner.y,
    p: anchor.p,
  });
  const refinedCurve: RawPt[] = [];
  for (let i = 0; i < rawPts.length - 1; i += 1) {
    const p0 = i > 0 ? rawPts[i - 1]! : reflectPt(rawPts[0]!, rawPts[1]!);
    const p1 = rawPts[i]!;
    const p2 = rawPts[i + 1]!;
    const p3 = i + 2 < rawPts.length ? rawPts[i + 2]! : reflectPt(rawPts[rawPts.length - 1]!, rawPts[rawPts.length - 2]!);
    for (let s = 0; s <= subdivs; s += 1) {
      if (i > 0 && s === 0) continue;
      refinedCurve.push(evalCentripetalCatmull(p0, p1, p2, p3, s / subdivs));
    }
  }

  const outPoints: number[] = [];
  const outPressures: number[] = [];
  const totalCurvePts = refinedCurve.length;
  for (let i = 0; i < totalCurvePts; i += 1) {
    const pt = refinedCurve[i]!;
    const progress01 = totalCurvePts > 1 ? i / (totalCurvePts - 1) : 0;
    const tailFactor = progress01 > 0.82
      ? 1 - taperStrength * Math.pow((progress01 - 0.82) / 0.18, 1.5)
      : 1;
    outPoints.push(Number(pt.x.toFixed(3)), Number(pt.y.toFixed(3)));
    outPressures.push(Number(clamp01(pt.p * Math.max(0.08, tailFactor)).toFixed(4)));
  }

  const stamps: StudioRefinedStrokeSample[] = [];
  let phase = 0;
  for (let i = 0; i < totalCurvePts; i += 1) {
    const curr = refinedCurve[i]!;
    const pVal = outPressures[i] ?? curr.p;
    const r = Math.max(0.22, diameter * 0.5 * (0.14 + 0.86 * pVal));
    if (i === 0) {
      stamps.push({
        x: curr.x,
        y: curr.y,
        pressure: pVal,
        radiusPx: Number(r.toFixed(3)),
        curvatureInvPx: 0,
        adaptiveSpacingPx: Number(Math.max(0.35, 2 * r * spacingRatio).toFixed(3)),
      });
      continue;
    }
    const prev = refinedCurve[i - 1]!;
    const next = refinedCurve[Math.min(totalCurvePts - 1, i + 1)]!;
    const seg = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (seg <= 1e-5) continue;
    const prevP = outPressures[i - 1] ?? prev.p;
    const rPrev = Math.max(0.22, diameter * 0.5 * (0.14 + 0.86 * prevP));
    const rMean = (rPrev + r) * 0.5;
    const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    const halfChord = Math.max(0.25, Math.hypot(next.x - prev.x, next.y - prev.y) * 0.5);
    const kappa = i < totalCurvePts - 1 ? Math.abs(wrapAngleDeltaRad(a1, a2)) / halfChord : 0;
    const drSlope = Math.abs(r - rPrev) / Math.max(0.4, seg);
    const localStep = Math.max(
      0.3,
      Math.max(0.35, 2 * rMean * spacingRatio) / (1 + 2.5 * kappa * rMean + 0.85 * drSlope),
    );

    let distLeft = seg;
    let cursor = 0;
    while (phase + distLeft >= localStep && stamps.length < 8192) {
      const adv = localStep - phase;
      cursor += adv;
      distLeft -= adv;
      phase = 0;
      const ratio = clamp01(cursor / seg);
      const interpP = prevP + (pVal - prevP) * ratio;
      const interpR = rPrev + (r - rPrev) * ratio;
      stamps.push({
        x: Number((prev.x + (curr.x - prev.x) * ratio).toFixed(3)),
        y: Number((prev.y + (curr.y - prev.y) * ratio).toFixed(3)),
        pressure: Number(interpP.toFixed(4)),
        radiusPx: Number(interpR.toFixed(3)),
        curvatureInvPx: Number(kappa.toFixed(4)),
        adaptiveSpacingPx: Number(localStep.toFixed(3)),
      });
    }
    phase += distLeft;
  }

  const linearMaxKinkDeg = computeMaxTurnKinkDeg(rawPts);
  const refinedMaxKinkDeg = computeMaxTurnKinkDeg(refinedCurve);
  const kinkReductionRatio01 = linearMaxKinkDeg > 1e-3
    ? Number(clamp01(1 - refinedMaxKinkDeg / linearMaxKinkDeg).toFixed(4))
    : 0;
  const linearScallopRatio01 = computeScallopRatio(linearStamps);
  const adaptiveScallopRatio01 = computeScallopRatio(stamps);
  const scallopReductionGain01 = Number(
    Math.max(0, linearScallopRatio01 - adaptiveScallopRatio01).toFixed(4),
  );
  const terminalTaperRadiusPx = stamps.length > 0 ? stamps[stamps.length - 1]!.radiusPx : 0;

  return {
    points: outPoints,
    pressures: outPressures,
    stamps,
    linearMaxKinkDeg,
    refinedMaxKinkDeg,
    kinkReductionRatio01,
    linearScallopRatio01,
    adaptiveScallopRatio01,
    scallopReductionGain01,
    terminalTaperRadiusPx,
  };
}
