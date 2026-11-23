/**
 * 작가별 10초 시필 기반 필압·기울기·손떨림 개인 캘리브레이션 및 펜촉 마모 시뮬레이터.
 * 입력된 원시 스타일러스 스트로크 샘플로부터:
 * - 최적 3차 베지어 필압 커브([x1, y1, x2, y2]) & 데드존 산출
 * - 고주파 손떨림 RMS 편차 측정 -> One-Euro Filter(minCutoff, beta) 자동 추천
 * - 딥펜/연필/붓 펜촉 마모 및 잉크 소진 감쇠 곡선 산출
 */

export interface StylusCalibrationSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs: number;
}

export type HandPressureArchetype = "feather-light" | "balanced" | "heavy-press";

export interface PersonalStylusCalibrationProfile {
  readonly archetype: HandPressureArchetype;
  readonly archetypeLabelKo: string;
  readonly archetypeLabelEn: string;
  readonly sampleCount: number;
  readonly p10Pressure: number;
  readonly p50Pressure: number;
  readonly p90Pressure: number;
  readonly deadzoneMin: number;
  readonly cubicBezierCurve: readonly [number, number, number, number];
  readonly tremorRmsPx: number;
  readonly recommendedOneEuro: {
    readonly minCutoff: number;
    readonly beta: number;
    readonly stabilizerStrengthPct: number;
  };
  readonly averageTiltDeg: number;
}

export interface NibWearSimulationState {
  readonly cumulativeStrokeMeters: number;
  readonly nibSharpness: number; // 1.0 새 펜촉 -> 0.35 마모
  readonly inkLoadRemaining: number; // 1.0 가득 -> 0.0 갈필
  readonly recommendedDryBrushScratch: number; // 0..1
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(p * (sorted.length - 1), 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * 3차 베지어 필압 커브 평가 (t in [0, 1]) -> 정규화된 보정 필압 [0, 1].
 */
export function evaluatePressureCurve(
  rawPressure: number,
  curve: readonly [number, number, number, number],
  deadzoneMin = 0.02,
): number {
  const clamped = clamp(rawPressure, 0, 1);
  if (clamped <= deadzoneMin) return 0;
  const t = (clamped - deadzoneMin) / Math.max(0.01, 1 - deadzoneMin);
  const [, y1, , y2] = curve;
  const inv = 1 - t;
  const y = 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
  return Number(clamp(y, 0, 1).toFixed(4));
}

/**
 * 작가의 10초 시필 샘플에서 개인 필압 커브와 손떨림 보정 계수를 계산한다.
 */
export function calibratePersonalStylusProfile(
  samples: readonly StylusCalibrationSample[],
): PersonalStylusCalibrationProfile {
  const valid = samples.filter(
    (s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.pressure),
  );

  if (valid.length < 3) {
    return {
      archetype: "balanced",
      archetypeLabelKo: "표준 밸런스 필압",
      archetypeLabelEn: "Balanced Touch",
      sampleCount: valid.length,
      p10Pressure: 0.15,
      p50Pressure: 0.5,
      p90Pressure: 0.85,
      deadzoneMin: 0.02,
      cubicBezierCurve: [0.25, 0.25, 0.75, 0.75],
      tremorRmsPx: 0.4,
      recommendedOneEuro: { minCutoff: 1.4, beta: 0.06, stabilizerStrengthPct: 32 },
      averageTiltDeg: 25,
    };
  }

  const pressures = valid.map((s) => clamp(s.pressure, 0, 1)).sort((a, b) => a - b);
  const p10 = Number(percentile(pressures, 0.1).toFixed(3));
  const p50 = Number(percentile(pressures, 0.5).toFixed(3));
  const p90 = Number(percentile(pressures, 0.9).toFixed(3));

  let archetype: HandPressureArchetype = "balanced";
  let archetypeLabelKo = "표준 밸런스 필압";
  let archetypeLabelEn = "Balanced Touch";
  let curve: readonly [number, number, number, number] = [0.25, 0.25, 0.75, 0.75];

  if (p50 < 0.36 || p90 < 0.68) {
    archetype = "feather-light";
    archetypeLabelKo = "가벼운 터치 (고감도 부스트)";
    archetypeLabelEn = "Feather-Light Touch (High-Gain Boost)";
    // Concave upward curve lifts soft pressure cleanly
    curve = [0.18, 0.48, 0.52, 0.92];
  } else if (p50 > 0.64 || p10 > 0.35) {
    archetype = "heavy-press";
    archetypeLabelKo = "강한 필압 (고하중 정밀 제어)";
    archetypeLabelEn = "Heavy Press (High-Headroom Control)";
    // Convex downward curve prevents early clipping at 1.0
    curve = [0.46, 0.12, 0.82, 0.56];
  }

  // Measure high-frequency tremor via perpendicular deviation of midpoint from chord (i-1 -> i+1)
  let sumSqDev = 0;
  let devCount = 0;
  for (let i = 1; i < valid.length - 1; i++) {
    const a = valid[i - 1]!;
    const b = valid[i]!;
    const c = valid[i + 1]!;
    const mx = (a.x + c.x) * 0.5;
    const my = (a.y + c.y) * 0.5;
    const dx = b.x - mx;
    const dy = b.y - my;
    sumSqDev += dx * dx + dy * dy;
    devCount++;
  }
  const tremorRmsPx = Number(Math.sqrt(devCount > 0 ? sumSqDev / devCount : 0).toFixed(3));

  // Higher tremor -> lower minCutoff & higher stabilizer percentage
  const stabilizerStrengthPct = Math.round(clamp(18 + tremorRmsPx * 22, 15, 88));
  const minCutoff = Number(clamp(2.2 - tremorRmsPx * 0.45, 0.45, 2.2).toFixed(2));
  const beta = Number(clamp(0.09 - tremorRmsPx * 0.018, 0.015, 0.1).toFixed(3));

  let tiltSum = 0;
  let tiltCount = 0;
  for (const s of valid) {
    if (Number.isFinite(s.tiltX) || Number.isFinite(s.tiltY)) {
      const tx = s.tiltX ?? 0;
      const ty = s.tiltY ?? 0;
      tiltSum += Math.hypot(tx, ty);
      tiltCount++;
    }
  }
  const averageTiltDeg = Number((tiltCount > 0 ? tiltSum / tiltCount : 25).toFixed(1));

  return {
    archetype,
    archetypeLabelKo,
    archetypeLabelEn,
    sampleCount: valid.length,
    p10Pressure: p10,
    p50Pressure: p50,
    p90Pressure: p90,
    deadzoneMin: Number(clamp(p10 * 0.2, 0.01, 0.08).toFixed(3)),
    cubicBezierCurve: curve,
    tremorRmsPx,
    recommendedOneEuro: {
      minCutoff,
      beta,
      stabilizerStrengthPct,
    },
    averageTiltDeg,
  };
}

/**
 * 딥펜·먹붓·흑연 연필의 누적 스트로크 길이에 따른 펜촉 마모 및 잉크 소진(갈필) 상태를 계산한다.
 */
export function simulateNibWearAndInkDepletion(
  cumulativeStrokeMeters: number,
  strokeSinceDipMeters: number,
  media: "dip-pen" | "oriental-brush" | "graphite-pencil",
): NibWearSimulationState {
  const safeCum = Math.max(0, Number.isFinite(cumulativeStrokeMeters) ? cumulativeStrokeMeters : 0);
  const safeDip = Math.max(0, Number.isFinite(strokeSinceDipMeters) ? strokeSinceDipMeters : 0);

  const wearHalfLifeMeters = media === "graphite-pencil" ? 18 : media === "dip-pen" ? 120 : 80;
  const inkCapacityMeters = media === "oriental-brush" ? 1.8 : media === "dip-pen" ? 2.4 : 12;

  const nibSharpness = Number(
    clamp(0.35 + 0.65 * Math.exp(-safeCum / wearHalfLifeMeters), 0.35, 1).toFixed(3),
  );
  const inkLoadRemaining = Number(
    clamp(Math.exp(-safeDip / inkCapacityMeters), 0, 1).toFixed(3),
  );
  const recommendedDryBrushScratch = Number(
    clamp((1 - inkLoadRemaining) * (media === "oriental-brush" ? 0.95 : 0.65), 0, 1).toFixed(3),
  );

  return {
    cumulativeStrokeMeters: safeCum,
    nibSharpness,
    inkLoadRemaining,
    recommendedDryBrushScratch,
  };
}
