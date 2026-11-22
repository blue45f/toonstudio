/**
 * 서버 전송 0건(100% 온디바이스) 작화 습관·스트로크 패턴 분석기.
 *
 * - 필압 분포, 선 떨림(jitter index), 주력 브러시·색온도 편향, 세션 마감 페이스를
 *   브라우저 메모리 안에서만 계산하고 외부 네트워크 요청·텔레메트리를 일절 수행하지 않는다.
 * - 선 떨림 지수가 증가할수록 권장 손떨림 보정 강도·윈도우 반경이 단조 증가한다.
 */

export type StrokeBrushCategory =
  | "pen"
  | "pencil"
  | "watercolor"
  | "marker"
  | "airbrush"
  | "eraser"
  | "other";

export interface OnDeviceStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly tMs?: number;
}

export interface OnDeviceStrokeSample {
  readonly strokeId: string;
  readonly brushId: string;
  readonly brushCategory?: StrokeBrushCategory;
  readonly colorHex?: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly cutId?: string;
  readonly points: readonly OnDeviceStrokePoint[];
}

export interface OnDeviceDrawingSessionInput {
  readonly sessionId?: string;
  readonly strokes: readonly OnDeviceStrokeSample[];
  readonly nowMs?: number;
  readonly sessionDeadlineMs?: number;
  readonly targetCutCount?: number;
  readonly completedCutCount?: number;
}

export interface OnDevicePrivacyGuarantee {
  readonly networkRequestsSent: 0;
  readonly storageScope: "on-device-memory-only";
  readonly telemetryExported: false;
  readonly piiCollected: false;
}

export interface StrokePressureBandHistogram {
  readonly veryLight: number;
  readonly light: number;
  readonly medium: number;
  readonly firm: number;
  readonly heavy: number;
}

export interface StrokePressureProfile {
  readonly sampleCount: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  readonly stdDev: number;
  readonly dynamicRange: number;
  readonly touchStyle: "feather-touch" | "balanced" | "heavy-handed";
  readonly recommendedPressureGamma: number;
  readonly bands: StrokePressureBandHistogram;
}

export interface StrokeJitterProfile {
  readonly evaluatedPointTriplets: number;
  readonly jitterIndex: number;
  readonly signReversalRate: number;
  readonly meanChordDeviationRatio: number;
  readonly stabilityTier: "steady" | "moderate-tremor" | "high-tremor";
  readonly recommendedStabilizationLevel: number;
  readonly recommendedStabilizationWindowPx: number;
  readonly recommendedPredictionStrength: number;
}

export interface BrushUsageSummaryEntry {
  readonly brushId: string;
  readonly strokeCount: number;
  readonly usageRatio: number;
}

export interface ColorTemperatureProfile {
  readonly chromaticStrokeCount: number;
  readonly neutralStrokeCount: number;
  readonly warmRatio: number;
  readonly neutralRatio: number;
  readonly coolRatio: number;
  readonly averageKelvinEstimate: number;
  readonly temperatureBias: "warm" | "balanced" | "cool" | "neutral";
}

export interface BrushAndColorHabitProfile {
  readonly primaryBrushId: string | null;
  readonly primaryBrushShare: number;
  readonly topBrushes: readonly BrushUsageSummaryEntry[];
  readonly colorTemperature: ColorTemperatureProfile;
}

export type DeadlinePaceStatus = "comfortable" | "on-track" | "tight" | "at-risk";

export interface SessionDeadlinePaceProfile {
  readonly totalStrokes: number;
  readonly activeDrawingMinutes: number;
  readonly sessionSpanMinutes: number;
  readonly strokesPerMinute: number;
  readonly averagePauseBetweenStrokesMs: number;
  readonly estimatedCutsPerHour: number | null;
  readonly remainingCuts: number | null;
  readonly remainingHoursToDeadline: number | null;
  readonly requiredCutsPerHour: number | null;
  readonly paceStatus: DeadlinePaceStatus;
  readonly recommendedWorkBlockMinutes: number;
  readonly recommendedBreakMinutes: number;
}

export interface OnDeviceStrokeHabitReport {
  readonly schema: "toonstudio.ondevice-stroke-habit-report/1";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly privacyGuarantee: OnDevicePrivacyGuarantee;
  readonly pressureProfile: StrokePressureProfile;
  readonly jitterProfile: StrokeJitterProfile;
  readonly brushAndColorProfile: BrushAndColorHabitProfile;
  readonly paceProfile: SessionDeadlinePaceProfile;
  readonly workRhythmSuggestionsKo: readonly string[];
}

export interface StudioDrawElementLike {
  readonly id: string;
  readonly type: string;
  readonly mode?: string;
  readonly brush?: string;
  readonly stroke?: string;
  readonly points?: readonly number[];
  readonly pressures?: readonly number[];
  readonly sampleTimeOffsets?: readonly number[];
}

export interface StudioDrawPageLike {
  readonly id: string;
  readonly elements: readonly StudioDrawElementLike[];
}

const PRIVACY_GUARANTEE: OnDevicePrivacyGuarantee = Object.freeze({
  networkRequestsSent: 0,
  storageScope: "on-device-memory-only",
  telemetryExported: false,
  piiCollected: false,
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function analyzePressureProfile(
  strokes: readonly OnDeviceStrokeSample[],
): StrokePressureProfile {
  const pressures: number[] = [];
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (typeof point.pressure === "number" && Number.isFinite(point.pressure)) {
        pressures.push(clamp(point.pressure, 0, 1));
      } else {
        pressures.push(0.5);
      }
    }
  }

  if (pressures.length === 0) {
    return {
      sampleCount: 0,
      min: 0,
      max: 0,
      mean: 0.5,
      median: 0.5,
      p10: 0.5,
      p90: 0.5,
      stdDev: 0,
      dynamicRange: 0,
      touchStyle: "balanced",
      recommendedPressureGamma: 1,
      bands: { veryLight: 0, light: 0, medium: 0, firm: 0, heavy: 0 },
    };
  }

  const sorted = [...pressures].sort((a, b) => a - b);
  let sum = 0;
  let veryLight = 0;
  let light = 0;
  let medium = 0;
  let firm = 0;
  let heavy = 0;

  for (const p of sorted) {
    sum += p;
    if (p < 0.2) veryLight += 1;
    else if (p < 0.4) light += 1;
    else if (p < 0.6) medium += 1;
    else if (p < 0.8) firm += 1;
    else heavy += 1;
  }

  const mean = sum / sorted.length;
  let varianceSum = 0;
  for (const p of sorted) {
    const diff = p - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / sorted.length);
  const p10 = quantile(sorted, 0.1);
  const median = quantile(sorted, 0.5);
  const p90 = quantile(sorted, 0.9);
  const dynamicRange = Math.max(0, p90 - p10);

  let touchStyle: StrokePressureProfile["touchStyle"] = "balanced";
  let recommendedPressureGamma = 1.0;
  if (mean < 0.36) {
    touchStyle = "feather-touch";
    recommendedPressureGamma = roundTo(clamp(0.7 + mean * 0.45, 0.68, 0.88), 2);
  } else if (mean > 0.66) {
    touchStyle = "heavy-handed";
    recommendedPressureGamma = roundTo(clamp(1.12 + (mean - 0.66) * 0.9, 1.12, 1.42), 2);
  }

  return {
    sampleCount: sorted.length,
    min: roundTo(sorted[0], 3),
    max: roundTo(sorted[sorted.length - 1], 3),
    mean: roundTo(mean, 3),
    median: roundTo(median, 3),
    p10: roundTo(p10, 3),
    p90: roundTo(p90, 3),
    stdDev: roundTo(stdDev, 3),
    dynamicRange: roundTo(dynamicRange, 3),
    touchStyle,
    recommendedPressureGamma,
    bands: { veryLight, light, medium, firm, heavy },
  };
}

function analyzeJitterProfile(
  strokes: readonly OnDeviceStrokeSample[],
): StrokeJitterProfile {
  let evaluatedPointTriplets = 0;
  let deviationRatioSum = 0;
  let reversalEnergySum = 0;
  let reversalPairCount = 0;
  let reversalCount = 0;

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 3) continue;

    let prevSignedRatio: number | null = null;

    for (let i = 1; i < pts.length - 1; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const chordX = c.x - a.x;
      const chordY = c.y - a.y;
      const chordLen = Math.hypot(chordX, chordY);
      if (chordLen < 1e-4) continue;

      // 현(a→c) 기준 중점(b)의 부호 있는 수직 편차 비율(단조성 보장 무차원량)
      const cross = (b.x - a.x) * chordY - (b.y - a.y) * chordX;
      const signedDist = cross / chordLen;
      const signedRatio = signedDist / chordLen;
      const absRatio = Math.abs(signedRatio);

      evaluatedPointTriplets += 1;
      deviationRatioSum += absRatio;

      if (prevSignedRatio !== null) {
        reversalPairCount += 1;
        if (signedRatio * prevSignedRatio < -1e-8) {
          reversalCount += 1;
          reversalEnergySum += 0.5 * (absRatio + Math.abs(prevSignedRatio));
        }
      }
      prevSignedRatio = signedRatio;
    }
  }

  if (evaluatedPointTriplets === 0) {
    return {
      evaluatedPointTriplets: 0,
      jitterIndex: 0,
      signReversalRate: 0,
      meanChordDeviationRatio: 0,
      stabilityTier: "steady",
      recommendedStabilizationLevel: 10,
      recommendedStabilizationWindowPx: 1.5,
      recommendedPredictionStrength: 0.35,
    };
  }

  const meanChordDeviationRatio = deviationRatioSum / evaluatedPointTriplets;
  const meanReversalEnergy =
    reversalPairCount > 0 ? reversalEnergySum / reversalPairCount : 0;
  const signReversalRate =
    reversalPairCount > 0 ? reversalCount / reversalPairCount : 0;

  // 진동 편차와 부호 반전 에너지를 합산해 포화 단조 변환(0~100)을 적용한다.
  const rawTremorScore = meanChordDeviationRatio * 1.45 + meanReversalEnergy * 1.15;
  const jitterIndex = roundTo(100 * (1 - Math.exp(-rawTremorScore * 2.1)), 2);

  const stabilityTier: StrokeJitterProfile["stabilityTier"] =
    jitterIndex < 18
      ? "steady"
      : jitterIndex < 48
        ? "moderate-tremor"
        : "high-tremor";

  const recommendedStabilizationLevel = Math.min(
    100,
    Math.round(8 + jitterIndex * 0.88),
  );
  const recommendedStabilizationWindowPx = roundTo(
    1.5 + (jitterIndex / 100) * 18.5,
    1,
  );
  const recommendedPredictionStrength = roundTo(
    clamp(0.35 - (jitterIndex / 100) * 0.25, 0.08, 0.35),
    2,
  );

  return {
    evaluatedPointTriplets,
    jitterIndex,
    signReversalRate: roundTo(signReversalRate, 3),
    meanChordDeviationRatio: roundTo(meanChordDeviationRatio, 4),
    stabilityTier,
    recommendedStabilizationLevel,
    recommendedStabilizationWindowPx,
    recommendedPredictionStrength,
  };
}

function parseHexRgb(hex: string | undefined): readonly [number, number, number] | null {
  if (!hex) return null;
  const trimmed = hex.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{3}$/u.test(trimmed)) {
    return [
      Number.parseInt(trimmed[0] + trimmed[0], 16),
      Number.parseInt(trimmed[1] + trimmed[1], 16),
      Number.parseInt(trimmed[2] + trimmed[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/u.test(trimmed)) {
    return [
      Number.parseInt(trimmed.slice(0, 2), 16),
      Number.parseInt(trimmed.slice(2, 4), 16),
      Number.parseInt(trimmed.slice(4, 6), 16),
    ];
  }
  return null;
}

function analyzeBrushAndColor(
  strokes: readonly OnDeviceStrokeSample[],
): BrushAndColorHabitProfile {
  const brushCounts = new Map<string, number>();
  let warmCount = 0;
  let coolCount = 0;
  let neutralCount = 0;
  let kelvinSum = 0;
  let chromaticCount = 0;

  for (const stroke of strokes) {
    const brushId = stroke.brushId.trim() || "unknown-brush";
    brushCounts.set(brushId, (brushCounts.get(brushId) ?? 0) + 1);

    const rgb = parseHexRgb(stroke.colorHex);
    if (!rgb) {
      neutralCount += 1;
      continue;
    }
    const [r, g, b] = rgb;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 18) {
      neutralCount += 1;
      continue;
    }

    chromaticCount += 1;
    const warmthScore = (r - b) / 255;
    const kelvin = clamp(6500 - warmthScore * 3200, 2800, 9500);
    kelvinSum += kelvin;
    if (warmthScore > 0.08) {
      warmCount += 1;
    } else if (warmthScore < -0.08) {
      coolCount += 1;
    } else {
      neutralCount += 1;
    }
  }

  const total = Math.max(1, strokes.length);
  const rankedBrushes: BrushUsageSummaryEntry[] = [...brushCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([brushId, strokeCount]) => ({
      brushId,
      strokeCount,
      usageRatio: roundTo(strokeCount / total, 3),
    }));

  const warmRatio = strokes.length > 0 ? roundTo(warmCount / strokes.length, 3) : 0;
  const coolRatio = strokes.length > 0 ? roundTo(coolCount / strokes.length, 3) : 0;
  const neutralRatio = strokes.length > 0 ? roundTo(neutralCount / strokes.length, 3) : 1;
  const averageKelvinEstimate =
    chromaticCount > 0 ? Math.round(kelvinSum / chromaticCount) : 6500;

  let temperatureBias: ColorTemperatureProfile["temperatureBias"] = "balanced";
  if (chromaticCount === 0 || neutralRatio >= 0.78) {
    temperatureBias = "neutral";
  } else if (warmRatio > coolRatio + 0.12) {
    temperatureBias = "warm";
  } else if (coolRatio > warmRatio + 0.12) {
    temperatureBias = "cool";
  }

  return {
    primaryBrushId: rankedBrushes[0]?.brushId ?? null,
    primaryBrushShare: rankedBrushes[0]?.usageRatio ?? 0,
    topBrushes: Object.freeze(rankedBrushes),
    colorTemperature: {
      chromaticStrokeCount: chromaticCount,
      neutralStrokeCount: neutralCount,
      warmRatio,
      neutralRatio,
      coolRatio,
      averageKelvinEstimate,
      temperatureBias,
    },
  };
}

function analyzeSessionPace(
  input: OnDeviceDrawingSessionInput,
): SessionDeadlinePaceProfile {
  const strokes = [...input.strokes].sort((a, b) => a.startedAtMs - b.startedAtMs);
  if (strokes.length === 0) {
    return {
      totalStrokes: 0,
      activeDrawingMinutes: 0,
      sessionSpanMinutes: 0,
      strokesPerMinute: 0,
      averagePauseBetweenStrokesMs: 0,
      estimatedCutsPerHour: null,
      remainingCuts:
        typeof input.targetCutCount === "number"
          ? Math.max(0, input.targetCutCount - (input.completedCutCount ?? 0))
          : null,
      remainingHoursToDeadline: null,
      requiredCutsPerHour: null,
      paceStatus: "on-track",
      recommendedWorkBlockMinutes: 45,
      recommendedBreakMinutes: 10,
    };
  }

  let activeMs = 0;
  let pauseSumMs = 0;
  let pauseCount = 0;
  const touchedCuts = new Set<string>();

  for (let i = 0; i < strokes.length; i += 1) {
    const stroke = strokes[i];
    const duration = Math.max(20, stroke.endedAtMs - stroke.startedAtMs);
    activeMs += duration;
    if (stroke.cutId) touchedCuts.add(stroke.cutId);
    if (i > 0) {
      const gap = Math.max(0, stroke.startedAtMs - strokes[i - 1].endedAtMs);
      if (gap <= 15 * 60_000) {
        pauseSumMs += gap;
        pauseCount += 1;
      }
    }
  }

  const firstStart = strokes[0].startedAtMs;
  const lastEnd = strokes.reduce(
    (maxEnd, stroke) => Math.max(maxEnd, stroke.endedAtMs),
    firstStart,
  );
  const nowMs = input.nowMs ?? lastEnd;
  const effectiveEnd = Math.max(lastEnd, nowMs);
  const spanMs = Math.max(60_000, effectiveEnd - firstStart);
  const activeDrawingMinutes = roundTo(activeMs / 60_000, 2);
  const sessionSpanMinutes = roundTo(spanMs / 60_000, 2);
  const strokesPerMinute = roundTo(strokes.length / sessionSpanMinutes, 2);
  const averagePauseBetweenStrokesMs =
    pauseCount > 0 ? Math.round(pauseSumMs / pauseCount) : 0;

  const completedCuts = input.completedCutCount ?? touchedCuts.size;
  const estimatedCutsPerHour =
    completedCuts > 0
      ? roundTo(completedCuts / Math.max(1 / 60, sessionSpanMinutes / 60), 2)
      : null;

  const remainingCuts =
    typeof input.targetCutCount === "number"
      ? Math.max(0, input.targetCutCount - completedCuts)
      : null;
  const remainingHoursToDeadline =
    typeof input.sessionDeadlineMs === "number"
      ? roundTo(Math.max(0, (input.sessionDeadlineMs - nowMs) / 3_600_000), 2)
      : null;
  const requiredCutsPerHour =
    remainingCuts !== null && remainingHoursToDeadline !== null
      ? remainingHoursToDeadline > 0
        ? roundTo(remainingCuts / remainingHoursToDeadline, 2)
        : remainingCuts > 0
          ? Number.POSITIVE_INFINITY
          : 0
      : null;

  let paceStatus: DeadlinePaceStatus = "on-track";
  if (requiredCutsPerHour !== null && estimatedCutsPerHour !== null) {
    if (requiredCutsPerHour === 0 || estimatedCutsPerHour >= requiredCutsPerHour * 1.25) {
      paceStatus = "comfortable";
    } else if (estimatedCutsPerHour >= requiredCutsPerHour * 0.95) {
      paceStatus = "on-track";
    } else if (estimatedCutsPerHour >= requiredCutsPerHour * 0.65) {
      paceStatus = "tight";
    } else {
      paceStatus = "at-risk";
    }
  } else if (requiredCutsPerHour === Number.POSITIVE_INFINITY) {
    paceStatus = "at-risk";
  }

  const recommendedWorkBlockMinutes =
    paceStatus === "at-risk" || paceStatus === "tight" ? 35 : 50;
  const recommendedBreakMinutes =
    strokesPerMinute > 40 ? 12 : paceStatus === "at-risk" ? 7 : 10;

  return {
    totalStrokes: strokes.length,
    activeDrawingMinutes,
    sessionSpanMinutes,
    strokesPerMinute,
    averagePauseBetweenStrokesMs,
    estimatedCutsPerHour,
    remainingCuts,
    remainingHoursToDeadline,
    requiredCutsPerHour:
      requiredCutsPerHour === Number.POSITIVE_INFINITY ? null : requiredCutsPerHour,
    paceStatus,
    recommendedWorkBlockMinutes,
    recommendedBreakMinutes,
  };
}

function buildWorkRhythmSuggestionsKo(params: {
  readonly pressure: StrokePressureProfile;
  readonly jitter: StrokeJitterProfile;
  readonly brushAndColor: BrushAndColorHabitProfile;
  readonly pace: SessionDeadlinePaceProfile;
}): readonly string[] {
  const tips: string[] = [];

  if (params.jitter.stabilityTier === "high-tremor") {
    tips.push(
      `선 떨림 지수가 ${params.jitter.jitterIndex}로 높아 손떨림 보정 강도 ${params.jitter.recommendedStabilizationLevel}% · 스무딩 윈도우 ${params.jitter.recommendedStabilizationWindowPx}px 적용을 권장합니다.`,
    );
  } else if (params.jitter.stabilityTier === "moderate-tremor") {
    tips.push(
      `세밀한 선 작업 구간에서 보정 강도 ${params.jitter.recommendedStabilizationLevel}% · 윈도우 ${params.jitter.recommendedStabilizationWindowPx}px로 설정하면 곡선이 안정됩니다.`,
    );
  } else {
    tips.push(
      `선이 매우 안정적입니다(떨림 지수 ${params.jitter.jitterIndex}). 보정 강도 ${params.jitter.recommendedStabilizationLevel}%의 낮은 지연 설정을 유지하세요.`,
    );
  }

  if (params.pressure.touchStyle === "feather-touch") {
    tips.push(
      `평균 필압(${params.pressure.mean})이 가벼운 편입니다. 필압 감마를 ${params.pressure.recommendedPressureGamma}로 낮추면 손목 부담 없이 강약이 선명해집니다.`,
    );
  } else if (params.pressure.touchStyle === "heavy-handed") {
    tips.push(
      `평균 필압(${params.pressure.mean})이 강합니다. 필압 감마 ${params.pressure.recommendedPressureGamma}로 여유 구간을 넓혀 굵기 포화를 줄이세요.`,
    );
  }

  if (params.brushAndColor.colorTemperature.temperatureBias === "warm") {
    tips.push(
      `난색 비중(${Math.round(params.brushAndColor.colorTemperature.warmRatio * 100)}%, 약 ${params.brushAndColor.colorTemperature.averageKelvinEstimate}K)이 높습니다. 그림자 레이어에 보색 계열 한색 포인트를 섞으면 명암 대비가 또렷해집니다.`,
    );
  } else if (params.brushAndColor.colorTemperature.temperatureBias === "cool") {
    tips.push(
      `한색 비중(${Math.round(params.brushAndColor.colorTemperature.coolRatio * 100)}%, 약 ${params.brushAndColor.colorTemperature.averageKelvinEstimate}K)이 높습니다. 인물 하이라이트에 따뜻한 피부톤 보조광을 두면 시선 집중도가 올라갑니다.`,
    );
  }

  if (params.pace.paceStatus === "at-risk" || params.pace.paceStatus === "tight") {
    tips.push(
      `마감 페이스가 빠듯합니다(${params.pace.recommendedWorkBlockMinutes}분 집중 작화 + ${params.pace.recommendedBreakMinutes}분 손목 스트레칭). 배경·밑색은 로컬 자동 보조로 단축하고 주요 인물 컷에 집중하세요.`,
    );
  } else {
    tips.push(
      `현재 작업 페이스가 안정적입니다(${params.pace.recommendedWorkBlockMinutes}분 작화 · ${params.pace.recommendedBreakMinutes}분 휴식 리듬 유지 권장).`,
    );
  }

  return Object.freeze(tips);
}

/**
 * 100% 온디바이스(네트워크 요청 0건) 작화 습관·스트로크 패턴 분석 리포트를 생성한다.
 */
export function analyzeOnDeviceStrokeHabits(
  input: OnDeviceDrawingSessionInput,
): OnDeviceStrokeHabitReport {
  const pressureProfile = analyzePressureProfile(input.strokes);
  const jitterProfile = analyzeJitterProfile(input.strokes);
  const brushAndColorProfile = analyzeBrushAndColor(input.strokes);
  const paceProfile = analyzeSessionPace(input);
  const workRhythmSuggestionsKo = buildWorkRhythmSuggestionsKo({
    pressure: pressureProfile,
    jitter: jitterProfile,
    brushAndColor: brushAndColorProfile,
    pace: paceProfile,
  });

  return {
    schema: "toonstudio.ondevice-stroke-habit-report/1",
    schemaVersion: 1,
    sessionId: input.sessionId?.trim() || "local-ondevice-session",
    privacyGuarantee: PRIVACY_GUARANTEE,
    pressureProfile,
    jitterProfile,
    brushAndColorProfile,
    paceProfile,
    workRhythmSuggestionsKo,
  };
}

/**
 * 스튜디오 페이지의 `draw` 요소들로부터 온디바이스 스트로크 샘플 배열을 추출한다.
 */
export function extractStrokeSamplesFromPages(
  pages: readonly StudioDrawPageLike[],
  baseTimestampMs = 1_760_000_000_000,
): readonly OnDeviceStrokeSample[] {
  const samples: OnDeviceStrokeSample[] = [];
  let cursorMs = baseTimestampMs;

  for (const page of pages) {
    for (const element of page.elements) {
      if (element.type !== "draw" || !element.points || element.points.length < 4) {
        continue;
      }
      const pointCount = Math.floor(element.points.length / 2);
      const points: OnDeviceStrokePoint[] = [];
      let strokeSpanMs = 0;

      for (let i = 0; i < pointCount; i += 1) {
        const x = element.points[i * 2];
        const y = element.points[i * 2 + 1];
        const pressure = element.pressures?.[i];
        const offsetMs = element.sampleTimeOffsets?.[i] ?? i * 16;
        if (offsetMs > strokeSpanMs) strokeSpanMs = offsetMs;
        points.push({
          x,
          y,
          ...(typeof pressure === "number" ? { pressure } : {}),
          tMs: cursorMs + offsetMs,
        });
      }

      const startedAtMs = cursorMs;
      const endedAtMs = cursorMs + Math.max(80, strokeSpanMs);
      cursorMs = endedAtMs + 450;

      samples.push({
        strokeId: element.id,
        brushId: element.brush?.trim() || (element.mode === "eraser" ? "eraser" : "g-pen"),
        brushCategory: element.mode === "eraser" ? "eraser" : "pen",
        colorHex: element.stroke,
        startedAtMs,
        endedAtMs,
        cutId: page.id,
        points,
      });
    }
  }

  return samples;
}
