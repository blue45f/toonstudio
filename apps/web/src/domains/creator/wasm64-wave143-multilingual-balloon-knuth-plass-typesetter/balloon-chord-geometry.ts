/**
 * Wave 143 — 말풍선 4종 기하 현 너비(Chord Width), 옵션 정규화 및 마름모 실루엣 점수 평가기.
 */

import type {
  BalloonFitOptions,
  BalloonGeometrySpec,
  BalloonLayoutResult,
  BalloonTypesetAlgorithm,
  BalloonTypesetOptions,
  ResolvedBalloonFitOptions,
  ResolvedBalloonGeometrySpec,
  ResolvedBalloonTypesetOptions,
  SupportedTypesetLocale,
  TypesetLineLayout,
} from "./balloon-typeset-types";
import {
  auditKinsokuAndWidowViolations,
  countSpeakableChars,
  getLocaleKinsokuRuleSet,
  measureLineWidthPx,
} from "./multilingual-kinsoku-metrics";

export const DEFAULT_FONT_SIZE_PX = 18;
export const DEFAULT_MIN_FONT_SIZE_PX = 11;
export const DEFAULT_MAX_FONT_SIZE_PX = 24;
export const DEFAULT_FONT_STEP_PX = 0.5;
export const DEFAULT_TARGET_DIAMOND_FILL_RATIO = 0.88;
export const DEFAULT_SAFE_PADDING_PX = 16;
export const DEFAULT_CORNER_RADIUS_PX = 16;
export const DEFAULT_SPIKE_DEPTH_RATIO = 0.14;
export const DEFAULT_CLOUD_LOBE_DEPTH_RATIO = 0.1;

export function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 말풍선 기하 입력을 유한 범위로 정규화한다. */
export function resolveBalloonGeometry(spec: BalloonGeometrySpec): ResolvedBalloonGeometrySpec {
  const widthPx = clampNumber(spec.widthPx, 48, 2400, 260);
  const heightPx = clampNumber(spec.heightPx, 40, 2400, 180);
  const maxSafePad = Math.max(4, Math.min(widthPx, heightPx) * 0.35);
  const safePaddingPx = clampNumber(
    spec.safePaddingPx ?? DEFAULT_SAFE_PADDING_PX,
    0,
    maxSafePad,
    Math.min(DEFAULT_SAFE_PADDING_PX, maxSafePad),
  );
  const cornerRadiusPx = clampNumber(
    spec.cornerRadiusPx ?? DEFAULT_CORNER_RADIUS_PX,
    0,
    Math.min(widthPx, heightPx) * 0.45,
    DEFAULT_CORNER_RADIUS_PX,
  );
  const spikeDepthRatio = clampNumber(
    spec.spikeDepthRatio ?? DEFAULT_SPIKE_DEPTH_RATIO,
    0.04,
    0.32,
    DEFAULT_SPIKE_DEPTH_RATIO,
  );
  const cloudLobeDepthRatio = clampNumber(
    spec.cloudLobeDepthRatio ?? DEFAULT_CLOUD_LOBE_DEPTH_RATIO,
    0.04,
    0.26,
    DEFAULT_CLOUD_LOBE_DEPTH_RATIO,
  );

  const rawRx = Math.max(8, widthPx / 2 - safePaddingPx);
  const rawRy = Math.max(8, heightPx / 2 - safePaddingPx);

  let effectiveRx = rawRx;
  let effectiveRy = rawRy;
  if (spec.kind === "shout-jagged-ellipse") {
    effectiveRx = Math.max(8, rawRx * (1 - spikeDepthRatio));
    effectiveRy = Math.max(8, rawRy * (1 - spikeDepthRatio));
  } else if (spec.kind === "cloud-thought") {
    effectiveRx = Math.max(8, rawRx * (1 - cloudLobeDepthRatio));
    effectiveRy = Math.max(8, rawRy * (1 - cloudLobeDepthRatio));
  }

  const verticalSafetyFactor = spec.kind === "rounded-rect-narration" ? 0.96 : 0.9;
  const availableTextHeightPx = round2(2 * effectiveRy * verticalSafetyFactor);

  return {
    kind: spec.kind,
    widthPx: round2(widthPx),
    heightPx: round2(heightPx),
    safePaddingPx: round2(safePaddingPx),
    cornerRadiusPx: round2(cornerRadiusPx),
    spikeDepthRatio: round2(spikeDepthRatio),
    cloudLobeDepthRatio: round2(cloudLobeDepthRatio),
    effectiveRx: round2(effectiveRx),
    effectiveRy: round2(effectiveRy),
    availableTextHeightPx,
  };
}

/**
 * 말풍선 중심 기준 수직 위치 `yOffsetPx`에서의 안전 내부 현 너비 `w(y)`를 계산한다.
 */
export function computeBalloonChordWidthPx(
  geometryInput: BalloonGeometrySpec | ResolvedBalloonGeometrySpec,
  yOffsetPx: number,
): number {
  const geom = "effectiveRx" in geometryInput ? geometryInput : resolveBalloonGeometry(geometryInput);
  if (!Number.isFinite(yOffsetPx)) return 0;

  const absY = Math.abs(yOffsetPx);
  const rx = geom.effectiveRx;
  const ry = geom.effectiveRy;
  if (absY >= ry) return 0;

  if (geom.kind === "rounded-rect-narration") {
    const r = Math.min(geom.cornerRadiusPx, rx * 0.45, ry * 0.45);
    const straightHalfH = Math.max(0, ry - r);
    if (absY <= straightHalfH) return round2(2 * rx);
    const dy = absY - straightHalfH;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    return round2(2 * (rx - r + dx));
  }

  const ratio = absY / ry;
  return round2(2 * rx * Math.sqrt(Math.max(0, 1 - ratio * ratio)));
}

export function resolveBalloonTypesetOptions(
  locale: SupportedTypesetLocale,
  options?: BalloonTypesetOptions,
): ResolvedBalloonTypesetOptions {
  const rule = getLocaleKinsokuRuleSet(locale);
  return {
    fontSizePx: clampNumber(options?.fontSizePx ?? DEFAULT_FONT_SIZE_PX, 7, 96, DEFAULT_FONT_SIZE_PX),
    lineHeightRatio: clampNumber(
      options?.lineHeightRatio ?? rule.defaultLineHeightRatio,
      1.05,
      2.2,
      rule.defaultLineHeightRatio,
    ),
    letterSpacingEm: clampNumber(options?.letterSpacingEm ?? 0, -0.15, 0.5, 0),
    targetDiamondFillRatio: clampNumber(
      options?.targetDiamondFillRatio ?? DEFAULT_TARGET_DIAMOND_FILL_RATIO,
      0.55,
      0.98,
      DEFAULT_TARGET_DIAMOND_FILL_RATIO,
    ),
    allowWordHyphenation: options?.allowWordHyphenation ?? true,
    allowKoreanSyllableSplit: options?.allowKoreanSyllableSplit ?? true,
  };
}

export function resolveBalloonFitOptions(
  locale: SupportedTypesetLocale,
  options?: BalloonFitOptions,
): ResolvedBalloonFitOptions {
  const rule = getLocaleKinsokuRuleSet(locale);
  const minFont = clampNumber(options?.minFontSizePx ?? DEFAULT_MIN_FONT_SIZE_PX, 7, 72, DEFAULT_MIN_FONT_SIZE_PX);
  const maxFontRaw = clampNumber(options?.maxFontSizePx ?? DEFAULT_MAX_FONT_SIZE_PX, 8, 96, DEFAULT_MAX_FONT_SIZE_PX);
  const maxFont = Math.max(minFont, maxFontRaw);
  const preferredFont = clampNumber(
    options?.preferredFontSizePx ?? Math.min(maxFont, Math.max(minFont, DEFAULT_FONT_SIZE_PX)),
    minFont,
    maxFont,
    Math.min(maxFont, Math.max(minFont, DEFAULT_FONT_SIZE_PX)),
  );
  const fontStepPx = clampNumber(options?.fontStepPx ?? DEFAULT_FONT_STEP_PX, 0.25, 4, DEFAULT_FONT_STEP_PX);
  const minLH = clampNumber(
    options?.minLineHeightRatio ?? Math.max(1.16, rule.defaultLineHeightRatio - 0.14),
    1.05,
    1.8,
    1.2,
  );
  const maxLH = Math.max(
    minLH,
    clampNumber(
      options?.maxLineHeightRatio ?? rule.defaultLineHeightRatio + 0.06,
      1.15,
      2.0,
      rule.defaultLineHeightRatio + 0.06,
    ),
  );

  return {
    minFontSizePx: round2(minFont),
    maxFontSizePx: round2(maxFont),
    preferredFontSizePx: round2(preferredFont),
    fontStepPx: round2(fontStepPx),
    minLineHeightRatio: round2(minLH),
    maxLineHeightRatio: round2(maxLH),
    letterSpacingEm: clampNumber(options?.letterSpacingEm ?? 0, -0.15, 0.5, 0),
    targetDiamondFillRatio: clampNumber(
      options?.targetDiamondFillRatio ?? DEFAULT_TARGET_DIAMOND_FILL_RATIO,
      0.55,
      0.98,
      DEFAULT_TARGET_DIAMOND_FILL_RATIO,
    ),
    allowWordHyphenation: options?.allowWordHyphenation ?? true,
    allowKoreanSyllableSplit: options?.allowKoreanSyllableSplit ?? true,
  };
}

export function computeLineTargetWidths(
  geom: ResolvedBalloonGeometrySpec,
  lineCount: number,
  lineHeightPx: number,
  totalContentWidthPx: number,
  targetDiamondFillRatio: number,
): { readonly yOffsets: number[]; readonly chordWidths: number[]; readonly targetWidths: number[] } {
  const yOffsets: number[] = [];
  const chordWidths: number[] = [];
  let maxChord = 0;

  for (let k = 0; k < lineCount; k += 1) {
    const y = round2((k - (lineCount - 1) / 2) * lineHeightPx);
    const chord = computeBalloonChordWidthPx(geom, y);
    yOffsets.push(y);
    chordWidths.push(chord);
    if (chord > maxChord) maxChord = chord;
  }

  const isCurved = geom.kind !== "rounded-rect-narration";
  const rawProfile: number[] = [];
  let rawProfileSum = 0;

  for (let k = 0; k < lineCount; k += 1) {
    const chord = chordWidths[k] ?? 0;
    const posNorm = lineCount <= 1 ? 0 : Math.abs(k - (lineCount - 1) / 2) / ((lineCount - 1) / 2);
    const diamondTaper = isCurved && lineCount >= 3 ? 1 - 0.2 * posNorm * posNorm : 1;
    const weight = chord * diamondTaper;
    rawProfile.push(weight);
    rawProfileSum += weight;
  }

  const targetWidths: number[] = [];
  const scale = clampNumber(totalContentWidthPx / Math.max(1, rawProfileSum), 0.52, targetDiamondFillRatio, 0.8);
  for (let k = 0; k < lineCount; k += 1) {
    const chord = chordWidths[k] ?? 0;
    const profile = rawProfile[k] ?? 0;
    targetWidths.push(maxChord <= 0 ? 0 : round2(Math.max(0, Math.min(chord * targetDiamondFillRatio, profile * scale))));
  }

  return { yOffsets, chordWidths, targetWidths };
}

function computeSymmetryAndDiamondScore(
  lines: readonly TypesetLineLayout[],
  geom: ResolvedBalloonGeometrySpec,
  audit: BalloonLayoutResult["audit"],
): { readonly symmetryScore: number; readonly diamondFitScore: number; readonly averageFillRatio: number } {
  if (lines.length === 0) {
    return { symmetryScore: 100, diamondFitScore: 100, averageFillRatio: 0 };
  }

  let maxWidth = 0;
  let sumFill = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (line.widthPx > maxWidth) maxWidth = line.widthPx;
    sumFill += line.fillRatio;
  }
  const averageFillRatio = round2(sumFill / lines.length);

  let symmetryScore = 100;
  if (lines.length >= 2 && maxWidth > 0) {
    const half = Math.floor(lines.length / 2);
    let mirrorDiffSum = 0;
    for (let k = 0; k < half; k += 1) {
      const topW = lines[k]?.widthPx ?? 0;
      const botW = lines[lines.length - 1 - k]?.widthPx ?? 0;
      mirrorDiffSum += Math.abs(topW - botW) / maxWidth;
    }
    let score = Math.max(0, 100 * (1 - (half > 0 ? mirrorDiffSum / half : 0) * 1.45));

    if (geom.kind !== "rounded-rect-narration" && lines.length >= 3) {
      let middlePeak = 0;
      for (let k = 1; k < lines.length - 1; k += 1) {
        const w = lines[k]?.widthPx ?? 0;
        if (w > middlePeak) middlePeak = w;
      }
      const edgeMax = Math.max(lines[0]?.widthPx ?? 0, lines[lines.length - 1]?.widthPx ?? 0);
      if (edgeMax > middlePeak) {
        score -= ((edgeMax - middlePeak) / maxWidth) * 55;
      }
    }
    symmetryScore = round2(clampNumber(score, 0, 100, 0));
  }

  let dotWA = 0;
  let dotAA = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const refW = line.targetDiamondWidthPx > 0 ? line.targetDiamondWidthPx : line.availableChordWidthPx;
    dotWA += line.widthPx * refW;
    dotAA += refW * refW;
  }
  const optScale = dotAA > 0 ? clampNumber(dotWA / dotAA, 0.55, 1.05, 0.85) : 1;
  let sqErrSum = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const refW = Math.max(1, line.targetDiamondWidthPx > 0 ? line.targetDiamondWidthPx : line.availableChordWidthPx);
    const relErr = (line.widthPx - optScale * refW) / refW;
    sqErrSum += relErr * relErr;
  }
  const shapeScore = clampNumber(100 * (1 - Math.sqrt(sqErrSum / lines.length) * 1.9), 0, 100, 0);
  const densityScore = clampNumber(100 - Math.abs(averageFillRatio - 0.78) * 70, 0, 100, 60);

  let diamondFitScore = 0.52 * shapeScore + 0.36 * symmetryScore + 0.12 * densityScore;
  diamondFitScore -= audit.horizontalOverflowCount * 24 + Math.min(24, audit.maxOverflowPx * 0.45);
  diamondFitScore -= audit.verticalOverflowCount * 28;
  diamondFitScore -= (audit.lineStartKinsokuCount + audit.lineEndKinsokuCount) * 18;
  diamondFitScore -= audit.widowCount * 20;

  return {
    symmetryScore,
    diamondFitScore: round2(clampNumber(diamondFitScore, 0, 100, 0)),
    averageFillRatio,
  };
}

export function finalizeLayout(
  algorithm: BalloonTypesetAlgorithm,
  locale: SupportedTypesetLocale,
  geom: ResolvedBalloonGeometrySpec,
  fontSizePx: number,
  lineHeightRatio: number,
  rawLines: readonly { readonly text: string; readonly tokenCount: number }[],
  letterSpacingEm: number,
  targetDiamondFillRatio: number,
  dpTotalCost: number,
): BalloonLayoutResult {
  const lineHeightPx = round2(fontSizePx * lineHeightRatio);
  const lineCount = rawLines.length;
  let contentSum = 0;
  const measuredWidths: number[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const w = measureLineWidthPx(rawLines[i]?.text ?? "", fontSizePx, locale, letterSpacingEm);
    measuredWidths.push(w);
    contentSum += w;
  }

  const { yOffsets, chordWidths, targetWidths } = computeLineTargetWidths(
    geom,
    lineCount,
    lineHeightPx,
    contentSum,
    targetDiamondFillRatio,
  );

  const lines: TypesetLineLayout[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const raw = rawLines[i];
    if (!raw) continue;
    const widthPx = round2(measuredWidths[i] ?? 0);
    const chord = round2(chordWidths[i] ?? 0);
    const target = round2(targetWidths[i] ?? 0);
    const overflowPx = round2(Math.max(0, widthPx - chord));
    const fillRatio = chord > 0 ? round2(widthPx / chord) : widthPx > 0 ? 9.99 : 0;
    lines.push({
      lineIndex: i,
      text: raw.text,
      widthPx,
      availableChordWidthPx: chord,
      targetDiamondWidthPx: target,
      yOffsetPx: round2(yOffsets[i] ?? 0),
      fillRatio,
      overflowPx,
      tokenCount: raw.tokenCount,
      speakableCharCount: countSpeakableChars(raw.text),
    });
  }

  const totalTextHeightPx = round2(lineCount * lineHeightPx);
  const audit = auditKinsokuAndWidowViolations(lines, locale, geom.availableTextHeightPx, lineHeightPx);
  const { symmetryScore, diamondFitScore, averageFillRatio } = computeSymmetryAndDiamondScore(lines, geom, audit);

  return {
    algorithm,
    locale,
    geometry: geom,
    fontSizePx: round2(fontSizePx),
    lineHeightRatio: round2(lineHeightRatio),
    lineHeightPx,
    totalTextHeightPx,
    availableTextHeightPx: geom.availableTextHeightPx,
    lines,
    diamondFitScore,
    symmetryScore,
    averageFillRatio,
    dpTotalCost: round2(dpTotalCost),
    audit,
  };
}
