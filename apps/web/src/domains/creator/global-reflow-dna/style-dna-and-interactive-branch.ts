/**
 * 작품 전용 스타일 DNA 락(Style DNA Guard) &
 * 선택지 분기형 인터랙티브 웹툰 그래프 검증 · XSS-safe 단일 HTML5 번들 출고 엔진.
 * OKLCH 토큰 전용 · 순수 메모리 연산 · 외부 런타임 의존성 0건.
 */

// === 1. 작품 전용 스타일 DNA 락 (Style DNA Guard) ===

export interface OklchColorSample { readonly l: number; readonly c: number; readonly h: number; }
export interface BalloonStyleSample {
  readonly fontFamily: string; readonly letterSpacingEm: number; readonly outlineWidthPx: number; readonly fontSizePt?: number;
}
export interface StyleDnaCutSample {
  readonly cutId: string; readonly strokeWidthsPx: readonly number[];
  readonly shadowOklchSamples: readonly OklchColorSample[];
  readonly lightShadowContrastDeltaL: number; readonly shadowAreaRatio: number;
  readonly balloons: readonly BalloonStyleSample[];
}
export interface StyleDnaTolerances {
  readonly lineMeanDriftMaxPct: number; readonly lineStdDriftMaxPct: number;
  readonly shadowHueDriftMaxDeg: number; readonly shadowLightnessDriftMax: number;
  readonly shadowChromaDriftMax: number; readonly contrastDeltaLDriftMax: number;
  readonly letterSpacingDriftMaxEm: number; readonly balloonOutlineDriftMaxPx: number;
}
export const DEFAULT_STYLE_DNA_TOLERANCES: StyleDnaTolerances = {
  lineMeanDriftMaxPct: 16, lineStdDriftMaxPct: 32, shadowHueDriftMaxDeg: 18,
  shadowLightnessDriftMax: 0.08, shadowChromaDriftMax: 0.035, contrastDeltaLDriftMax: 0.09,
  letterSpacingDriftMaxEm: 0.03, balloonOutlineDriftMaxPx: 0.45,
};

export type ShadowTemperatureTone = "cool" | "neutral" | "warm";
export type StyleDnaCategory = "line-weight" | "shadow-oklch" | "balloon-typography";
export type StyleDnaSeverity = "info" | "warn" | "critical";
export type StyleDnaGrade = "locked-pass" | "needs-polish" | "rejected-drift";

export interface WorkStyleDnaProfile {
  readonly workId: string; readonly workTitle: string; readonly referenceEpisodeLabel: string;
  readonly dnaFingerprint: string; readonly referenceCutCount: number;
  readonly line: { readonly meanPx: number; readonly stdDevPx: number; readonly p10Px: number; readonly p90Px: number; readonly sampleCount: number; };
  readonly shadow: {
    readonly meanLightness: number; readonly meanChroma: number; readonly meanHueDeg: number;
    readonly hueSpreadDeg: number; readonly temperatureTone: ShadowTemperatureTone;
    readonly meanContrastDeltaL: number; readonly meanShadowAreaRatio: number; readonly sampleCount: number;
  };
  readonly balloon: {
    readonly primaryFontFamily: string; readonly allowedFontFamilies: readonly string[];
    readonly meanLetterSpacingEm: number; readonly stdLetterSpacingEm: number;
    readonly meanOutlineWidthPx: number; readonly stdOutlineWidthPx: number; readonly sampleCount: number;
  };
  readonly tolerances: StyleDnaTolerances;
}
export interface StyleDnaDeviation {
  readonly category: StyleDnaCategory; readonly metric: string; readonly severity: StyleDnaSeverity;
  readonly expectedLabel: string; readonly actualLabel: string; readonly deltaValue: number;
  readonly messageKo: string; readonly messageEn: string;
}
export interface StyleDnaAutoCorrectionParams {
  readonly strokeScaleMultiplier: number; readonly strokePressureCurveGamma: number;
  readonly shadowHueShiftDeg: number; readonly shadowLightnessOffset: number; readonly shadowChromaOffset: number;
  readonly contrastGainMultiplier: number; readonly targetBalloonFontFamily: string;
  readonly balloonLetterSpacingOffsetEm: number; readonly balloonOutlineWidthTargetPx: number;
}
export interface StyleDnaAuditReport {
  readonly workId: string; readonly cutId: string; readonly consistencyScore: number;
  readonly grade: StyleDnaGrade; readonly passed: boolean;
  readonly subscores: { readonly lineWeight: number; readonly shadowOklch: number; readonly balloonTypography: number; };
  readonly measured: {
    readonly lineMeanPx: number; readonly lineStdDevPx: number;
    readonly shadowLightness: number; readonly shadowChroma: number; readonly shadowHueDeg: number;
    readonly contrastDeltaL: number; readonly dominantFontFamily: string;
    readonly letterSpacingEm: number; readonly outlineWidthPx: number;
  };
  readonly deviations: readonly StyleDnaDeviation[];
  readonly autoCorrectionParams: StyleDnaAutoCorrectionParams;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const roundTo = (value: number, digits = 3): number => Math.round(value * 10 ** digits) / 10 ** digits;

function meanAndStd(values: readonly number[]): { readonly mean: number; readonly stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(Math.max(0, variance)) };
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted.length === 0 ? 0 : (sorted[clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1)] ?? 0);
}

const normalizeHueDeg = (deg: number): number => ((deg % 360) + 360) % 360;
const signedHueDeltaDeg = (fromDeg: number, toDeg: number): number => ((toDeg - fromDeg + 540) % 360) - 180;

function circularMeanHue(huesDeg: readonly number[]): { readonly meanDeg: number; readonly spreadDeg: number } {
  if (huesDeg.length === 0) return { meanDeg: 0, spreadDeg: 0 };
  let sumSin = 0; let sumCos = 0;
  for (const h of huesDeg) {
    const rad = (normalizeHueDeg(h) * Math.PI) / 180;
    sumSin += Math.sin(rad); sumCos += Math.cos(rad);
  }
  const n = huesDeg.length;
  const meanDeg = normalizeHueDeg((Math.atan2(sumSin / n, sumCos / n) * 180) / Math.PI);
  const resultant = clamp(Math.hypot(sumSin / n, sumCos / n), 0, 1);
  const spreadDeg = resultant > 0.999999 ? 0 : Math.min(180, Math.sqrt(-2 * Math.log(Math.max(1e-6, resultant))) * (180 / Math.PI));
  return { meanDeg, spreadDeg };
}

function classifyShadowTemperature(chroma: number, hueDeg: number): ShadowTemperatureTone {
  if (chroma < 0.025) return "neutral";
  const h = normalizeHueDeg(hueDeg);
  if (h >= 175 && h <= 305) return "cool";
  return h <= 95 || h >= 325 ? "warm" : "neutral";
}

function computeDnaFingerprint(seed: string): string {
  let hashA = 2166136261; let hashB = 33554467;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA = Math.imul(hashA ^ code, 16777619);
    hashB = Math.imul(hashB ^ (code + i), 2654435761);
  }
  return `dna-v1-${(hashA >>> 0).toString(36).padStart(7, "0")}-${(hashB >>> 0).toString(36).padStart(7, "0")}`;
}

function pickDominantFont(balloons: readonly BalloonStyleSample[]): { readonly primary: string; readonly allowed: readonly string[] } {
  if (balloons.length === 0) return { primary: "Pretendard", allowed: ["Pretendard"] };
  const counts = new Map<string, number>();
  for (const b of balloons) {
    const key = b.fontFamily.trim() || "Pretendard";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { primary: ranked[0]?.[0] ?? "Pretendard", allowed: ranked.map(([font]) => font) };
}

/** 대표 화 컷 샘플에서 작품 전용 스타일 DNA(선 굵기·그림자 OKLCH 색온도/명암·말풍선 서체/자간/윤곽선)를 추출한다. */
export function extractWorkStyleDna(
  workId: string,
  workTitle: string,
  referenceSamples: readonly StyleDnaCutSample[],
  options: { readonly referenceEpisodeLabel?: string; readonly tolerances?: Partial<StyleDnaTolerances> } = {},
): WorkStyleDnaProfile {
  const tolerances: StyleDnaTolerances = { ...DEFAULT_STYLE_DNA_TOLERANCES, ...(options.tolerances ?? {}) };
  const strokes = referenceSamples.flatMap((s) => s.strokeWidthsPx).filter((v) => Number.isFinite(v) && v > 0);
  const sortedStrokes = [...strokes].sort((a, b) => a - b);
  const strokeStats = meanAndStd(strokes);

  const shadows = referenceSamples.flatMap((s) => s.shadowOklchSamples);
  const lightnessStats = meanAndStd(shadows.map((s) => clamp(s.l, 0, 1)));
  const chromaStats = meanAndStd(shadows.map((s) => clamp(s.c, 0, 0.4)));
  const hueStats = circularMeanHue(shadows.map((s) => s.h));
  const contrastStats = meanAndStd(referenceSamples.map((s) => clamp(s.lightShadowContrastDeltaL, 0, 1)));
  const areaStats = meanAndStd(referenceSamples.map((s) => clamp(s.shadowAreaRatio, 0, 1)));

  const balloons = referenceSamples.flatMap((s) => s.balloons);
  const fontPick = pickDominantFont(balloons);
  const trackingStats = meanAndStd(balloons.map((b) => b.letterSpacingEm));
  const outlineStats = meanAndStd(balloons.map((b) => Math.max(0, b.outlineWidthPx)));

  const dnaFingerprint = computeDnaFingerprint([
    workId, roundTo(strokeStats.mean, 3), roundTo(strokeStats.stdDev, 3),
    roundTo(lightnessStats.mean, 4), roundTo(chromaStats.mean, 4), roundTo(hueStats.meanDeg, 2),
    fontPick.primary, roundTo(trackingStats.mean, 4), roundTo(outlineStats.mean, 3),
  ].join("|"));

  return {
    workId, workTitle, referenceEpisodeLabel: options.referenceEpisodeLabel ?? "EP.01 대표 화",
    dnaFingerprint, referenceCutCount: referenceSamples.length,
    line: {
      meanPx: roundTo(strokeStats.mean, 3), stdDevPx: roundTo(strokeStats.stdDev, 3),
      p10Px: roundTo(percentile(sortedStrokes, 0.1), 3), p90Px: roundTo(percentile(sortedStrokes, 0.9), 3),
      sampleCount: strokes.length,
    },
    shadow: {
      meanLightness: roundTo(lightnessStats.mean, 4), meanChroma: roundTo(chromaStats.mean, 4),
      meanHueDeg: roundTo(hueStats.meanDeg, 2), hueSpreadDeg: roundTo(hueStats.spreadDeg, 2),
      temperatureTone: classifyShadowTemperature(chromaStats.mean, hueStats.meanDeg),
      meanContrastDeltaL: roundTo(contrastStats.mean, 4), meanShadowAreaRatio: roundTo(areaStats.mean, 4),
      sampleCount: shadows.length,
    },
    balloon: {
      primaryFontFamily: fontPick.primary, allowedFontFamilies: fontPick.allowed,
      meanLetterSpacingEm: roundTo(trackingStats.mean, 4), stdLetterSpacingEm: roundTo(trackingStats.stdDev, 4),
      meanOutlineWidthPx: roundTo(outlineStats.mean, 3), stdOutlineWidthPx: roundTo(outlineStats.stdDev, 3),
      sampleCount: balloons.length,
    },
    tolerances,
  };
}

/** 어시스턴트가 제출한 컷을 작품 스타일 DNA와 대조해 0..100 통일성 점수·이탈 항목·자동 보정 파라미터를 산출한다. */
export function auditCutAgainstStyleDna(dna: WorkStyleDnaProfile, cut: StyleDnaCutSample): StyleDnaAuditReport {
  const tol = dna.tolerances;
  const deviations: StyleDnaDeviation[] = [];

  // 1) 선 굵기 분포 평가 (35점)
  const cutStroke = meanAndStd(cut.strokeWidthsPx.filter((v) => Number.isFinite(v) && v > 0));
  const lineMeanDriftPct = dna.line.meanPx > 1e-4 ? (Math.abs(cutStroke.mean - dna.line.meanPx) / dna.line.meanPx) * 100 : 0;
  const lineStdDriftPct = dna.line.stdDevPx > 1e-4 ? (Math.abs(cutStroke.stdDev - dna.line.stdDevPx) / dna.line.stdDevPx) * 100 : 0;
  let lineScore = 35;
  if (lineMeanDriftPct > tol.lineMeanDriftMaxPct) {
    lineScore -= Math.min(24, 9 + ((lineMeanDriftPct - tol.lineMeanDriftMaxPct) / tol.lineMeanDriftMaxPct) * 12);
    deviations.push({
      category: "line-weight", metric: "strokeMeanPx",
      severity: lineMeanDriftPct > tol.lineMeanDriftMaxPct * 1.8 ? "critical" : "warn",
      expectedLabel: `${dna.line.meanPx.toFixed(2)}px (±${tol.lineMeanDriftMaxPct}%)`, actualLabel: `${cutStroke.mean.toFixed(2)}px`,
      deltaValue: roundTo(cutStroke.mean - dna.line.meanPx, 3),
      messageKo: `평균 선 굵기가 기준 대비 ${lineMeanDriftPct.toFixed(1)}% 이탈했습니다.`,
      messageEn: `Mean stroke weight drifted ${lineMeanDriftPct.toFixed(1)}% from work DNA.`,
    });
  } else {
    lineScore -= (lineMeanDriftPct / Math.max(1, tol.lineMeanDriftMaxPct)) * 3;
  }
  if (lineStdDriftPct > tol.lineStdDriftMaxPct) {
    lineScore -= Math.min(11, 4 + ((lineStdDriftPct - tol.lineStdDriftMaxPct) / tol.lineStdDriftMaxPct) * 6);
    deviations.push({
      category: "line-weight", metric: "strokeStdDevPx", severity: "warn",
      expectedLabel: `σ ${dna.line.stdDevPx.toFixed(2)}px`, actualLabel: `σ ${cutStroke.stdDev.toFixed(2)}px`,
      deltaValue: roundTo(cutStroke.stdDev - dna.line.stdDevPx, 3),
      messageKo: `필압 강약 편차가 기준과 ${lineStdDriftPct.toFixed(1)}% 다릅니다.`,
      messageEn: `Stroke pressure variance drifted ${lineStdDriftPct.toFixed(1)}%.`,
    });
  }
  lineScore = clamp(lineScore, 0, 35);

  // 2) 그림자 OKLCH 색온도·명암 평가 (35점)
  const cutL = meanAndStd(cut.shadowOklchSamples.map((s) => clamp(s.l, 0, 1))).mean;
  const cutC = meanAndStd(cut.shadowOklchSamples.map((s) => clamp(s.c, 0, 0.4))).mean;
  const cutHue = circularMeanHue(cut.shadowOklchSamples.map((s) => s.h)).meanDeg;
  const hueShiftNeeded = signedHueDeltaDeg(cutHue, dna.shadow.meanHueDeg);
  const absHueDelta = Math.abs(hueShiftNeeded);
  const lightnessDelta = cutL - dna.shadow.meanLightness;
  const chromaDelta = cutC - dna.shadow.meanChroma;
  const contrastDelta = cut.lightShadowContrastDeltaL - dna.shadow.meanContrastDeltaL;

  let shadowScore = 35;
  if (absHueDelta > tol.shadowHueDriftMaxDeg) {
    shadowScore -= Math.min(16, 6 + ((absHueDelta - tol.shadowHueDriftMaxDeg) / tol.shadowHueDriftMaxDeg) * 7);
    deviations.push({
      category: "shadow-oklch", metric: "shadowHueDeg",
      severity: absHueDelta > tol.shadowHueDriftMaxDeg * 2 ? "critical" : "warn",
      expectedLabel: `OKLCH H ${dna.shadow.meanHueDeg.toFixed(1)}° (${dna.shadow.temperatureTone})`,
      actualLabel: `OKLCH H ${cutHue.toFixed(1)}° (${classifyShadowTemperature(cutC, cutHue)})`,
      deltaValue: roundTo(hueShiftNeeded, 2),
      messageKo: `그림자 색온도(OKLCH H)가 기준 대비 ${absHueDelta.toFixed(1)}° 벗어났습니다.`,
      messageEn: `Shadow OKLCH hue shifted ${absHueDelta.toFixed(1)}° from DNA.`,
    });
  } else {
    shadowScore -= (absHueDelta / Math.max(1, tol.shadowHueDriftMaxDeg)) * 2.5;
  }
  if (Math.abs(lightnessDelta) > tol.shadowLightnessDriftMax) {
    shadowScore -= Math.min(9, 4 + ((Math.abs(lightnessDelta) - tol.shadowLightnessDriftMax) / tol.shadowLightnessDriftMax) * 4);
    deviations.push({
      category: "shadow-oklch", metric: "shadowLightness", severity: "warn",
      expectedLabel: `L ${dna.shadow.meanLightness.toFixed(3)}`, actualLabel: `L ${cutL.toFixed(3)}`,
      deltaValue: roundTo(-lightnessDelta, 4),
      messageKo: "그림자 명도(OKLCH L)가 기준 범위 밖입니다.",
      messageEn: "Shadow lightness (OKLCH L) is outside DNA tolerance.",
    });
  }
  if (Math.abs(chromaDelta) > tol.shadowChromaDriftMax) {
    shadowScore -= Math.min(5, 3 + (Math.abs(chromaDelta) / tol.shadowChromaDriftMax) * 2);
    deviations.push({
      category: "shadow-oklch", metric: "shadowChroma", severity: "info",
      expectedLabel: `C ${dna.shadow.meanChroma.toFixed(3)}`, actualLabel: `C ${cutC.toFixed(3)}`,
      deltaValue: roundTo(-chromaDelta, 4),
      messageKo: "그림자 채도(OKLCH C)가 기준과 차이납니다.",
      messageEn: "Shadow chroma (OKLCH C) differs from DNA.",
    });
  }
  if (Math.abs(contrastDelta) > tol.contrastDeltaLDriftMax) {
    shadowScore -= Math.min(10, 4 + ((Math.abs(contrastDelta) - tol.contrastDeltaLDriftMax) / tol.contrastDeltaLDriftMax) * 5);
    deviations.push({
      category: "shadow-oklch", metric: "lightShadowContrastDeltaL",
      severity: Math.abs(contrastDelta) > tol.contrastDeltaLDriftMax * 1.8 ? "critical" : "warn",
      expectedLabel: `ΔL ${dna.shadow.meanContrastDeltaL.toFixed(3)}`, actualLabel: `ΔL ${cut.lightShadowContrastDeltaL.toFixed(3)}`,
      deltaValue: roundTo(-contrastDelta, 4),
      messageKo: "명암 대비(ΔL)가 대표 화 DNA와 차이납니다.",
      messageEn: "Light-to-shadow contrast (ΔL) drifted from DNA.",
    });
  }
  shadowScore = clamp(shadowScore, 0, 35);

  // 3) 말풍선 폰트·자간·윤곽선 굵기 평가 (30점)
  const cutFont = pickDominantFont(cut.balloons).primary;
  const cutTracking = meanAndStd(cut.balloons.map((b) => b.letterSpacingEm)).mean;
  const cutOutline = meanAndStd(cut.balloons.map((b) => Math.max(0, b.outlineWidthPx))).mean;
  let balloonScore = 30;
  if (cut.balloons.length > 0 && !dna.balloon.allowedFontFamilies.some((f) => f.toLowerCase() === cutFont.toLowerCase())) {
    balloonScore -= 15;
    deviations.push({
      category: "balloon-typography", metric: "fontFamily", severity: "critical",
      expectedLabel: dna.balloon.primaryFontFamily, actualLabel: cutFont, deltaValue: 1,
      messageKo: `말풍선 폰트(${cutFont})가 잠금 폰트(${dna.balloon.primaryFontFamily})와 불일치합니다.`,
      messageEn: `Balloon font (${cutFont}) does not match locked font (${dna.balloon.primaryFontFamily}).`,
    });
  }
  const trackingDelta = cutTracking - dna.balloon.meanLetterSpacingEm;
  if (cut.balloons.length > 0 && Math.abs(trackingDelta) > tol.letterSpacingDriftMaxEm) {
    balloonScore -= Math.min(8, 3.5 + ((Math.abs(trackingDelta) - tol.letterSpacingDriftMaxEm) / tol.letterSpacingDriftMaxEm) * 3.5);
    deviations.push({
      category: "balloon-typography", metric: "letterSpacingEm", severity: "warn",
      expectedLabel: `${dna.balloon.meanLetterSpacingEm.toFixed(3)}em`, actualLabel: `${cutTracking.toFixed(3)}em`,
      deltaValue: roundTo(-trackingDelta, 4),
      messageKo: `말풍선 자간이 기준(${dna.balloon.meanLetterSpacingEm.toFixed(3)}em)에서 이탈했습니다.`,
      messageEn: `Balloon letter-spacing drifted from DNA (${dna.balloon.meanLetterSpacingEm.toFixed(3)}em).`,
    });
  }
  const outlineDelta = cutOutline - dna.balloon.meanOutlineWidthPx;
  if (cut.balloons.length > 0 && Math.abs(outlineDelta) > tol.balloonOutlineDriftMaxPx) {
    balloonScore -= Math.min(7, 3 + ((Math.abs(outlineDelta) - tol.balloonOutlineDriftMaxPx) / tol.balloonOutlineDriftMaxPx) * 3.5);
    deviations.push({
      category: "balloon-typography", metric: "outlineWidthPx", severity: "warn",
      expectedLabel: `${dna.balloon.meanOutlineWidthPx.toFixed(2)}px`, actualLabel: `${cutOutline.toFixed(2)}px`,
      deltaValue: roundTo(-outlineDelta, 3),
      messageKo: `말풍선 외곽선 굵기가 기준(${dna.balloon.meanOutlineWidthPx.toFixed(2)}px)과 다릅니다.`,
      messageEn: `Balloon outline width drifted from DNA (${dna.balloon.meanOutlineWidthPx.toFixed(2)}px).`,
    });
  }
  balloonScore = clamp(balloonScore, 0, 30);

  const consistencyScore = roundTo(clamp(lineScore + shadowScore + balloonScore, 0, 100), 1);
  const criticalCount = deviations.filter((d) => d.severity === "critical").length;
  const grade: StyleDnaGrade =
    consistencyScore >= 85 && criticalCount === 0 ? "locked-pass" : consistencyScore >= 65 ? "needs-polish" : "rejected-drift";

  return {
    workId: dna.workId, cutId: cut.cutId, consistencyScore, grade, passed: grade === "locked-pass",
    subscores: { lineWeight: roundTo(lineScore, 1), shadowOklch: roundTo(shadowScore, 1), balloonTypography: roundTo(balloonScore, 1) },
    measured: {
      lineMeanPx: roundTo(cutStroke.mean, 3), lineStdDevPx: roundTo(cutStroke.stdDev, 3),
      shadowLightness: roundTo(cutL, 4), shadowChroma: roundTo(cutC, 4), shadowHueDeg: roundTo(cutHue, 2),
      contrastDeltaL: roundTo(cut.lightShadowContrastDeltaL, 4),
      dominantFontFamily: cutFont, letterSpacingEm: roundTo(cutTracking, 4), outlineWidthPx: roundTo(cutOutline, 3),
    },
    deviations,
    autoCorrectionParams: {
      strokeScaleMultiplier: cutStroke.mean > 1e-4 ? roundTo(dna.line.meanPx / cutStroke.mean, 3) : 1,
      strokePressureCurveGamma: cutStroke.stdDev > 1e-4 ? roundTo(clamp(dna.line.stdDevPx / cutStroke.stdDev, 0.5, 2.2), 3) : 1,
      shadowHueShiftDeg: roundTo(hueShiftNeeded, 2),
      shadowLightnessOffset: roundTo(dna.shadow.meanLightness - cutL, 4),
      shadowChromaOffset: roundTo(dna.shadow.meanChroma - cutC, 4),
      contrastGainMultiplier: cut.lightShadowContrastDeltaL > 1e-4 ? roundTo(clamp(dna.shadow.meanContrastDeltaL / cut.lightShadowContrastDeltaL, 0.5, 2.2), 3) : 1,
      targetBalloonFontFamily: dna.balloon.primaryFontFamily,
      balloonLetterSpacingOffsetEm: roundTo(dna.balloon.meanLetterSpacingEm - cutTracking, 4),
      balloonOutlineWidthTargetPx: dna.balloon.meanOutlineWidthPx,
    },
  };
}

// === 2. 선택지 분기형 인터랙티브 웹툰 그래프 검증 & XSS-safe 단일 HTML5 번들 출고 ===

export interface InteractiveChoiceEdge {
  readonly id: string; readonly label: string; readonly targetNodeId: string; readonly conditionTag?: string;
}
export interface InteractiveStoryNode {
  readonly id: string; readonly title: string; readonly cutImageUrl?: string; readonly caption: string;
  readonly dialogueSpeaker?: string; readonly dialogueText?: string;
  readonly isEnding?: boolean; readonly endingTag?: string; readonly choices: readonly InteractiveChoiceEdge[];
}
export interface InteractiveStoryGraph {
  readonly workId: string; readonly title: string; readonly author: string;
  readonly locale?: "ko" | "en"; readonly startNodeId: string; readonly nodes: readonly InteractiveStoryNode[];
}
export type InteractiveGraphIssueCode =
  | "DUPLICATE_NODE_ID" | "MISSING_START_NODE" | "BROKEN_TARGET_EDGE"
  | "UNREACHABLE_NODE" | "DEAD_END_NODE" | "CYCLE_DETECTED" | "UNSAFE_MEDIA_URL" | "NO_ENDING_NODE";

export interface InteractiveGraphIssue {
  readonly code: InteractiveGraphIssueCode; readonly severity: "error" | "warning";
  readonly nodeId?: string; readonly edgeId?: string; readonly messageKo: string; readonly messageEn: string;
}
export interface InteractiveStoryValidationReport {
  readonly valid: boolean; readonly nodeCount: number; readonly edgeCount: number;
  readonly reachableNodeIds: readonly string[]; readonly unreachableNodeIds: readonly string[];
  readonly deadEndNodeIds: readonly string[]; readonly endingNodeIds: readonly string[];
  readonly cycles: readonly (readonly string[])[]; readonly brokenEdgeIds: readonly string[];
  readonly unsafeUrlNodeIds: readonly string[]; readonly maxDepth: number;
  readonly issues: readonly InteractiveGraphIssue[];
}
export interface InteractiveWebtoonBundleResult {
  readonly filename: string; readonly html: string; readonly byteLength: number;
  readonly validation: InteractiveStoryValidationReport;
  readonly sanitizedUnsafeUrlCount: number; readonly xssSafeVerified: boolean;
}

export function sanitizeMediaUrl(rawUrl?: string): { readonly safeUrl: string; readonly rejected: boolean } {
  if (!rawUrl || !rawUrl.trim()) return { safeUrl: "", rejected: false };
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed) || /^(\/|\.\/|\.\.\/)[a-zA-Z0-9._~/@%-]+$/.test(trimmed)) {
    return { safeUrl: trimmed, rejected: false };
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) {
    return { safeUrl: trimmed, rejected: false };
  }
  return { safeUrl: "", rejected: true };
}

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function escapeJsonForScriptTag(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** 선택지 분기 그래프의 도달 불가 노드·데드엔드·순환·깨진 링크·위험 URL을 전수 검사한다. */
export function validateInteractiveStoryGraph(graph: InteractiveStoryGraph): InteractiveStoryValidationReport {
  const issues: InteractiveGraphIssue[] = [];
  const nodeMap = new Map<string, InteractiveStoryNode>();
  const brokenEdgeIds: string[] = [];
  const unsafeUrlNodeIds: string[] = [];

  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE_ID", severity: "error", nodeId: node.id, messageKo: `중복 노드 ID(${node.id})가 존재합니다.`, messageEn: `Duplicate node ID (${node.id}) detected.` });
    } else {
      nodeMap.set(node.id, node);
    }
    if (node.cutImageUrl && sanitizeMediaUrl(node.cutImageUrl).rejected) {
      unsafeUrlNodeIds.push(node.id);
      issues.push({ code: "UNSAFE_MEDIA_URL", severity: "error", nodeId: node.id, messageKo: `노드(${node.id})에 안전하지 않은 이미지 URL이 포함되었습니다.`, messageEn: `Unsafe image URL in node (${node.id}).` });
    }
  }

  let edgeCount = 0;
  for (const node of graph.nodes) {
    for (const edge of node.choices) {
      edgeCount += 1;
      if (!nodeMap.has(edge.targetNodeId)) {
        brokenEdgeIds.push(edge.id);
        issues.push({ code: "BROKEN_TARGET_EDGE", severity: "error", nodeId: node.id, edgeId: edge.id, messageKo: `선택지(${edge.id})가 없는 노드(${edge.targetNodeId})를 가리킵니다.`, messageEn: `Choice (${edge.id}) points to missing node (${edge.targetNodeId}).` });
      }
    }
  }

  const reachableSet = new Set<string>();
  const depthMap = new Map<string, number>();
  if (!nodeMap.has(graph.startNodeId)) {
    issues.push({ code: "MISSING_START_NODE", severity: "error", nodeId: graph.startNodeId, messageKo: `시작 노드(${graph.startNodeId})를 찾을 수 없습니다.`, messageEn: `Start node (${graph.startNodeId}) not found.` });
  } else {
    const queue = [graph.startNodeId];
    reachableSet.add(graph.startNodeId);
    depthMap.set(graph.startNodeId, 0);
    while (queue.length > 0) {
      const currentId = queue.shift();
      const current = currentId ? nodeMap.get(currentId) : undefined;
      if (!currentId || !current) continue;
      const depth = depthMap.get(currentId) ?? 0;
      for (const edge of current.choices) {
        if (nodeMap.has(edge.targetNodeId) && !reachableSet.has(edge.targetNodeId)) {
          reachableSet.add(edge.targetNodeId);
          depthMap.set(edge.targetNodeId, depth + 1);
          queue.push(edge.targetNodeId);
        }
      }
    }
  }

  const unreachableNodeIds = graph.nodes.filter((n) => !reachableSet.has(n.id)).map((n) => n.id);
  for (const nodeId of unreachableNodeIds) {
    issues.push({ code: "UNREACHABLE_NODE", severity: "error", nodeId, messageKo: `노드(${nodeId})는 시작점에서 도달 불가합니다.`, messageEn: `Node (${nodeId}) is unreachable from start.` });
  }

  const endingNodeIds = graph.nodes.filter((n) => n.isEnding && reachableSet.has(n.id)).map((n) => n.id);
  if (endingNodeIds.length === 0 && reachableSet.size > 0) {
    issues.push({ code: "NO_ENDING_NODE", severity: "error", messageKo: "도달 가능한 엔딩 노드가 없습니다.", messageEn: "No reachable ending node exists." });
  }

  const reverseAdj = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const edge of node.choices) {
      if (!nodeMap.has(edge.targetNodeId)) continue;
      const list = reverseAdj.get(edge.targetNodeId) ?? [];
      list.push(node.id);
      reverseAdj.set(edge.targetNodeId, list);
    }
  }
  const canReachEnding = new Set<string>(endingNodeIds);
  const revQueue = [...endingNodeIds];
  while (revQueue.length > 0) {
    const cur = revQueue.shift();
    if (!cur) continue;
    for (const parent of reverseAdj.get(cur) ?? []) {
      if (!canReachEnding.has(parent)) { canReachEnding.add(parent); revQueue.push(parent); }
    }
  }

  const deadEndNodeIds: string[] = [];
  for (const node of graph.nodes) {
    if (!reachableSet.has(node.id) || node.isEnding) continue;
    const validOutgoing = node.choices.filter((e) => nodeMap.has(e.targetNodeId));
    if (validOutgoing.length === 0 || (endingNodeIds.length > 0 && !canReachEnding.has(node.id))) {
      deadEndNodeIds.push(node.id);
      issues.push({
        code: "DEAD_END_NODE", severity: "error", nodeId: node.id,
        messageKo: `노드(${node.id})는 엔딩으로 이어지지 않는 데드엔드입니다.`,
        messageEn: `Node (${node.id}) is a dead end with no path to an ending.`,
      });
    }
  }

  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();
  const dfs = (nodeId: string): void => {
    color.set(nodeId, 1); stack.push(nodeId);
    for (const edge of nodeMap.get(nodeId)?.choices ?? []) {
      const nextId = edge.targetNodeId;
      if (!nodeMap.has(nextId)) continue;
      const nextColor = color.get(nextId) ?? 0;
      if (nextColor === 1) {
        const idx = stack.indexOf(nextId);
        if (idx >= 0) {
          const cyclePath = [...stack.slice(idx), nextId];
          const key = cyclePath.join("->");
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key); cycles.push(cyclePath);
            const trapped = cyclePath.every((id) => !canReachEnding.has(id));
            issues.push({
              code: "CYCLE_DETECTED", severity: trapped ? "error" : "warning", nodeId: nextId,
              messageKo: `순환 경로(${cyclePath.join(" → ")})가 감지되었습니다.`,
              messageEn: `Cycle detected (${cyclePath.join(" -> ")}).`,
            });
          }
        }
      } else if (nextColor === 0) {
        dfs(nextId);
      }
    }
    stack.pop(); color.set(nodeId, 2);
  };
  for (const node of graph.nodes) { if ((color.get(node.id) ?? 0) === 0) dfs(node.id); }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    nodeCount: graph.nodes.length, edgeCount,
    reachableNodeIds: [...reachableSet], unreachableNodeIds, deadEndNodeIds, endingNodeIds,
    cycles, brokenEdgeIds, unsafeUrlNodeIds,
    maxDepth: [...depthMap.values()].reduce((m, d) => Math.max(m, d), 0),
    issues,
  };
}

/** XSS 이스케이프 및 안전 DOM API(textContent 전용)가 적용된 독립 단일 HTML5 인터랙티브 웹툰 플레이어 번들을 생성한다. */
export function buildInteractiveWebtoonHtmlBundle(graph: InteractiveStoryGraph): InteractiveWebtoonBundleResult {
  const validation = validateInteractiveStoryGraph(graph);
  let sanitizedUnsafeUrlCount = 0;
  const sanitizedNodes = graph.nodes.map((node) => {
    const media = sanitizeMediaUrl(node.cutImageUrl);
    if (media.rejected) sanitizedUnsafeUrlCount += 1;
    return {
      id: node.id, title: node.title, cutImageUrl: media.safeUrl, caption: node.caption,
      dialogueSpeaker: node.dialogueSpeaker ?? "", dialogueText: node.dialogueText ?? "",
      isEnding: Boolean(node.isEnding), endingTag: node.endingTag ?? "",
      choices: node.choices.map((c) => ({ id: c.id, label: c.label, targetNodeId: c.targetNodeId, conditionTag: c.conditionTag ?? "" })),
    };
  });

  const escapedTitle = escapeHtmlText(graph.title);
  const escapedAuthor = escapeHtmlText(graph.author);
  const safeJsonPayload = escapeJsonForScriptTag({
    workId: graph.workId, title: graph.title, author: graph.author,
    locale: graph.locale ?? "ko", startNodeId: graph.startNodeId, nodes: sanitizedNodes,
  });
  const slug = graph.workId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "interactive-webtoon";

  const html = [
    "<!doctype html>",
    `<html lang="${graph.locale === "en" ? "en" : "ko"}">`,
    "<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'\">",
    `<title>${escapedTitle}</title><style>`,
    ":root{color-scheme:light dark;--bg:oklch(0.97 0.008 85);--card:oklch(0.99 0.004 85);--fg:oklch(0.22 0.015 65);--muted:oklch(0.48 0.014 65);--line:oklch(0.86 0.012 80);--accent:oklch(0.52 0.14 250);--on-accent:oklch(0.99 0.004 85);}",
    "*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);word-break:keep-all;}",
    ".ts-shell{max-width:680px;margin:0 auto;padding:20px 16px 48px;}.ts-head{border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px;}",
    ".ts-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:12px;}",
    ".ts-art{width:100%;max-height:420px;object-fit:cover;border-radius:12px;border:1px solid var(--line);display:none;}",
    ".ts-balloon{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--bg);}.ts-speaker{font-size:12px;font-weight:700;color:var(--accent);margin-bottom:4px;}",
    ".ts-choices{display:flex;flex-direction:column;gap:8px;}.ts-btn{min-height:44px;padding:10px 14px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:var(--on-accent);font-weight:600;cursor:pointer;text-align:left;}",
    ".ts-btn-ghost{background:transparent;color:var(--fg);border-color:var(--line);}.ts-foot{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);}",
    "</style></head><body><main class=\"ts-shell\">",
    `<header class="ts-head"><h1>${escapedTitle}</h1><p>${escapedAuthor}</p></header>`,
    "<section class=\"ts-card\" data-role=\"stage\"><h2 data-role=\"node-title\"></h2><img data-role=\"node-img\" class=\"ts-art\" alt=\"\">",
    "<p data-role=\"node-caption\"></p><div data-role=\"balloon\" class=\"ts-balloon\"><div data-role=\"speaker\" class=\"ts-speaker\"></div><div data-role=\"dialogue\"></div></div>",
    "<div data-role=\"choices\" class=\"ts-choices\"></div><div class=\"ts-foot\"><span data-role=\"progress\"></span><button type=\"button\" class=\"ts-btn ts-btn-ghost\" data-role=\"restart\"></button></div></section></main>",
    `<script type="application/json" data-role="story-data">${safeJsonPayload}</script>`,
    "<script>(function(){var raw=document.querySelector('[data-role=\"story-data\"]');if(!raw)return;var data=JSON.parse(raw.textContent||'{}');var byId={};(data.nodes||[]).forEach(function(n){byId[n.id]=n;});",
    "var history=[data.startNodeId],q=function(r){return document.querySelector('[data-role=\"'+r+'\"]');},isEn=data.locale==='en';",
    "q('restart').textContent=isEn?'Restart':'처음으로';",
    "function render(){var node=byId[history[history.length-1]];if(!node)return;q('node-title').textContent=node.title||'';q('node-caption').textContent=node.caption||'';",
    "var img=q('node-img');if(node.cutImageUrl){img.src=node.cutImageUrl;img.alt=node.title||'';img.style.display='block';}else{img.removeAttribute('src');img.style.display='none';}",
    "var bln=q('balloon');if(node.dialogueText){bln.style.display='block';q('speaker').textContent=node.dialogueSpeaker||'';q('dialogue').textContent=node.dialogueText;}else{bln.style.display='none';}",
    "var box=q('choices');while(box.firstChild){box.removeChild(box.firstChild);}",
    "(node.choices||[]).forEach(function(ch){var b=document.createElement('button');b.type='button';b.className='ts-btn';b.textContent=ch.label;b.addEventListener('click',function(){if(byId[ch.targetNodeId]){history.push(ch.targetNodeId);render();}});box.appendChild(b);});",
    "if(node.isEnding){var p=document.createElement('p');p.textContent=(isEn?'Ending: ':'엔딩: ')+(node.endingTag||node.title);box.appendChild(p);}",
    "q('progress').textContent=(isEn?'Steps: ':'진행 장면: ')+history.length;}",
    "q('restart').addEventListener('click',function(){history=[data.startNodeId];render();});render();})();</script>",
    "</body></html>",
  ].join("\n");

  const byteLength = new TextEncoder().encode(html).length;
  const xssSafeVerified =
    !html.includes("innerHTML") && !html.includes("document.write") && !html.includes("javascript:") && (html.match(/<script\b/gi)?.length ?? 0) === 2;
  return { filename: `${slug}-interactive.html`, html, byteLength, validation, sanitizedUnsafeUrlCount, xssSafeVerified };
}

// === 데모 픽스처 ===

export function createDemoStyleDnaSamples(): readonly StyleDnaCutSample[] {
  return [
    {
      cutId: "ep01-cut-01", strokeWidthsPx: [1.7, 1.85, 2.0, 2.15, 2.25, 1.9],
      shadowOklchSamples: [{ l: 0.34, c: 0.065, h: 252 }, { l: 0.36, c: 0.06, h: 248 }, { l: 0.32, c: 0.07, h: 256 }],
      lightShadowContrastDeltaL: 0.42, shadowAreaRatio: 0.31,
      balloons: [
        { fontFamily: "KoPubDotum", letterSpacingEm: -0.02, outlineWidthPx: 2.0, fontSizePt: 9.5 },
        { fontFamily: "KoPubDotum", letterSpacingEm: -0.015, outlineWidthPx: 2.1, fontSizePt: 9.5 },
      ],
    },
    {
      cutId: "ep01-cut-02", strokeWidthsPx: [1.8, 1.95, 2.05, 2.2, 2.1, 1.85],
      shadowOklchSamples: [{ l: 0.35, c: 0.062, h: 250 }, { l: 0.33, c: 0.068, h: 254 }],
      lightShadowContrastDeltaL: 0.44, shadowAreaRatio: 0.29,
      balloons: [{ fontFamily: "KoPubDotum", letterSpacingEm: -0.02, outlineWidthPx: 1.95, fontSizePt: 9.5 }],
    },
  ];
}

export function createDemoAssistantCuts(): { readonly aligned: StyleDnaCutSample; readonly drifted: StyleDnaCutSample } {
  return {
    aligned: {
      cutId: "asst-cut-04-ok", strokeWidthsPx: [1.75, 1.9, 2.02, 2.18, 2.08, 1.92],
      shadowOklchSamples: [{ l: 0.345, c: 0.064, h: 251 }, { l: 0.352, c: 0.061, h: 249 }],
      lightShadowContrastDeltaL: 0.43, shadowAreaRatio: 0.3,
      balloons: [{ fontFamily: "KoPubDotum", letterSpacingEm: -0.018, outlineWidthPx: 2.05, fontSizePt: 9.5 }],
    },
    drifted: {
      cutId: "asst-cut-05-drift", strokeWidthsPx: [3.1, 3.4, 3.6, 2.9, 3.8, 3.2],
      shadowOklchSamples: [{ l: 0.52, c: 0.14, h: 42 }, { l: 0.55, c: 0.13, h: 38 }],
      lightShadowContrastDeltaL: 0.21, shadowAreaRatio: 0.15,
      balloons: [{ fontFamily: "ComicMarker", letterSpacingEm: 0.07, outlineWidthPx: 3.6, fontSizePt: 11 }],
    },
  };
}

export function createDemoInteractiveStoryGraph(variant: "clean" | "defective" = "clean"): InteractiveStoryGraph {
  const baseNodes: InteractiveStoryNode[] = [
    { id: "scene-start", title: "자정의 시계탑 문 앞", caption: "비에 젖은 청동 문 너머로 톱니바퀴 소리가 들려온다.", dialogueSpeaker: "서연", dialogueText: "열쇠를 쓸까, 아니면 옥상 환기구로 돌아갈까?", choices: [{ id: "ch-key", label: "청동 열쇠로 정문을 연다", targetNodeId: "scene-hall" }, { id: "ch-vent", label: "옥상 환기구로 잠입한다", targetNodeId: "scene-roof" }] },
    { id: "scene-hall", title: "멈춘 진자의 홀", caption: "거대한 시계 추 아래 기록 보관함이 빛나고 있다.", dialogueSpeaker: "민수", dialogueText: "시간이 10초 남았어. 기록만 챙겨 빠져나가자!", choices: [{ id: "ch-archive", label: "원본 기록을 들고 탈출한다", targetNodeId: "ending-truth" }, { id: "ch-clock", label: "시계 태엽을 역회전시킨다", targetNodeId: "ending-reset" }] },
    { id: "scene-roof", title: "폭우 속 첨탑 난간", caption: "번개가 첨탑 끝 피뢰침을 스치며 숨겨진 다리가 드러난다.", dialogueSpeaker: "서연", dialogueText: "저 다리 끝이 바로 시계실 상부야!", choices: [{ id: "ch-bridge", label: "시계실 상부로 뛰어내린다", targetNodeId: "scene-hall" }] },
    { id: "ending-truth", title: "진실의 새벽", caption: "기록 보관함이 열리며 도시의 잃어버린 하루가 복원된다.", dialogueSpeaker: "내레이션", dialogueText: "해가 떠오르며 멈췄던 종소리가 다시 울렸다.", isEnding: true, endingTag: "TRUE ENDING · 기록 복원", choices: [] },
    { id: "ending-reset", title: "되감긴 자정", caption: "태엽이 반대로 돌며 두 사람은 1시간 전 옥상으로 돌아간다.", dialogueSpeaker: "서연", dialogueText: "이번엔 실수 없이 바꿀 수 있어.", isEnding: true, endingTag: "LOOP ENDING · 두 번째 기회", choices: [] },
  ];
  if (variant === "clean") {
    return { workId: "moonlit-clocktower", title: "자정의 시계탑: 분기 외전", author: "ToonStudio Original", locale: "ko", startNodeId: "scene-start", nodes: baseNodes };
  }
  return {
    workId: "moonlit-clocktower-audit", title: "자정의 시계탑 (결함 진단 샘플)", author: "ToonStudio QA", locale: "ko", startNodeId: "scene-start",
    nodes: [
      ...baseNodes.slice(0, 2),
      { id: "scene-roof", title: "끊긴 환기구 (데드엔드)", caption: "선택지 없이 막힌 미완성 분기입니다.", choices: [] },
      { id: "scene-loop-a", title: "무한 복도 A", caption: "서로 순환하는 고립 분기 A", choices: [{ id: "ch-loop-ab", label: "복도 B로", targetNodeId: "scene-loop-b" }] },
      { id: "scene-loop-b", title: "무한 복도 B", caption: "서로 순환하는 고립 분기 B", choices: [{ id: "ch-loop-ba", label: "복도 A로", targetNodeId: "scene-loop-a" }] },
      ...baseNodes.slice(3),
    ],
  };
}
