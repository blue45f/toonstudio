/**
 * Wave 143 — 단순 탐욕적 줄바꿈 기준선 및 2D 마름모꼴 Knuth-Plass 동적 계획법(DP) 솔버.
 */

import {
  computeBalloonChordWidthPx,
  computeLineTargetWidths,
  finalizeLayout,
  resolveBalloonGeometry,
  resolveBalloonTypesetOptions,
  round2,
} from "./balloon-chord-geometry";
import type {
  BalloonGeometrySpec,
  BalloonLayoutResult,
  BalloonTypesetOptions,
  ResolvedBalloonGeometrySpec,
  SupportedTypesetLocale,
  TypesetToken,
} from "./balloon-typeset-types";
import {
  expandOversizedTokens,
  isLineEndForbiddenChar,
  isLineStartForbiddenChar,
  measureGlyphAdvanceEm,
  measureLineWidthPx,
  splitCodePoints,
  tokenizeDialogueForLocale,
} from "./multilingual-kinsoku-metrics";

interface PrefixTokenMetrics {
  readonly prefixRawEm: Float64Array;
  readonly prefixJoinEm: Float64Array;
  readonly prefixCharCount: Int32Array;
  readonly prefixJoinCharCount: Int32Array;
  readonly prefixSpeakable: Int32Array;
  readonly prefixHardBreaks: Int32Array;
}

function buildPrefixMetrics(
  tokens: readonly TypesetToken[],
  locale: SupportedTypesetLocale,
): PrefixTokenMetrics {
  const n = tokens.length;
  const prefixRawEm = new Float64Array(n + 1);
  const prefixJoinEm = new Float64Array(n + 1);
  const prefixCharCount = new Int32Array(n + 1);
  const prefixJoinCharCount = new Int32Array(n + 1);
  const prefixSpeakable = new Int32Array(n + 1);
  const prefixHardBreaks = new Int32Array(n + 1);

  for (let i = 0; i < n; i += 1) {
    const tok = tokens[i];
    if (!tok) continue;
    const textChars = splitCodePoints(tok.text);
    let rawEm = 0;
    for (let c = 0; c < textChars.length; c += 1) {
      rawEm += measureGlyphAdvanceEm(textChars[c] ?? "", locale);
    }
    const joinChars = splitCodePoints(tok.joinBefore);
    let joinEm = 0;
    for (let c = 0; c < joinChars.length; c += 1) {
      joinEm += measureGlyphAdvanceEm(joinChars[c] ?? "", locale);
    }

    prefixRawEm[i + 1] = (prefixRawEm[i] ?? 0) + rawEm;
    prefixJoinEm[i + 1] = (prefixJoinEm[i] ?? 0) + joinEm;
    prefixCharCount[i + 1] = (prefixCharCount[i] ?? 0) + textChars.length;
    prefixJoinCharCount[i + 1] = (prefixJoinCharCount[i] ?? 0) + joinChars.length;
    prefixSpeakable[i + 1] = (prefixSpeakable[i] ?? 0) + tok.speakableCharCount;
    prefixHardBreaks[i + 1] = (prefixHardBreaks[i] ?? 0) + (tok.isHardBreakAfter ? 1 : 0);
  }

  return {
    prefixRawEm,
    prefixJoinEm,
    prefixCharCount,
    prefixJoinCharCount,
    prefixSpeakable,
    prefixHardBreaks,
  };
}

function measureTokenRangeWidthPx(
  metrics: PrefixTokenMetrics,
  start: number,
  end: number,
  fontSizePx: number,
  letterSpacingEm: number,
): number {
  if (end <= start) return 0;
  const rawEm = (metrics.prefixRawEm[end] ?? 0) - (metrics.prefixRawEm[start] ?? 0);
  const joinEm = (metrics.prefixJoinEm[end] ?? 0) - (metrics.prefixJoinEm[start + 1] ?? 0);
  const totalChars =
    (metrics.prefixCharCount[end] ?? 0) -
    (metrics.prefixCharCount[start] ?? 0) +
    ((metrics.prefixJoinCharCount[end] ?? 0) - (metrics.prefixJoinCharCount[start + 1] ?? 0));
  const spacingEm = totalChars > 1 ? (totalChars - 1) * letterSpacingEm : 0;
  const px = Math.max(0, (rawEm + joinEm + spacingEm) * fontSizePx);
  return Math.round(px * 1000) / 1000;
}

function hasInternalHardBreak(metrics: PrefixTokenMetrics, start: number, end: number): boolean {
  if (end - start <= 1) return false;
  return (metrics.prefixHardBreaks[end - 1] ?? 0) - (metrics.prefixHardBreaks[start] ?? 0) > 0;
}

function joinTokenRange(tokens: readonly TypesetToken[], start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i += 1) {
    const tok = tokens[i];
    if (!tok) continue;
    if (i > start) out += tok.joinBefore;
    out += tok.text;
  }
  return out;
}

/**
 * 단순 탐욕적(Greedy) 기준선 식자.
 * 일반 그래픽 툴의 사각 텍스트 박스처럼 금칙 결합이나 마름모 DP 없이 앞줄부터 최대 폭까지 채운다.
 */
export function layoutBalloonGreedyBaseline(
  text: string,
  locale: SupportedTypesetLocale,
  geometrySpec: BalloonGeometrySpec,
  options?: BalloonTypesetOptions,
): BalloonLayoutResult {
  const geom = resolveBalloonGeometry(geometrySpec);
  const resolved = resolveBalloonTypesetOptions(locale, options);
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  if (normalized.length === 0) {
    return finalizeLayout(
      "greedy-baseline",
      locale,
      geom,
      resolved.fontSizePx,
      resolved.lineHeightRatio,
      [],
      resolved.letterSpacingEm,
      resolved.targetDiamondFillRatio,
      0,
    );
  }

  const boxWidthPx =
    geom.kind === "rounded-rect-narration" ? geom.effectiveRx * 2 : geom.effectiveRx * 2 * 0.92;
  const paragraphs = normalized.split("\n");
  const rawLines: { text: string; tokenCount: number }[] = [];

  for (let p = 0; p < paragraphs.length; p += 1) {
    const para = (paragraphs[p] ?? "").trim();
    if (para.length === 0) continue;
    const rawUnits =
      locale === "ja-JP"
        ? splitCodePoints(para)
        : para.split(/[ \t]+/).filter((part) => part.length > 0);
    const separator = locale === "ja-JP" ? "" : " ";

    let current = "";
    let count = 0;
    for (let i = 0; i < rawUnits.length; i += 1) {
      const unit = rawUnits[i];
      if (!unit) continue;
      const candidate = current.length === 0 ? unit : `${current}${separator}${unit}`;
      const width = measureLineWidthPx(candidate, resolved.fontSizePx, locale, resolved.letterSpacingEm);
      if (current.length > 0 && width > boxWidthPx) {
        rawLines.push({ text: current, tokenCount: count });
        current = unit;
        count = 1;
      } else {
        current = candidate;
        count += 1;
      }
    }
    if (current.length > 0) {
      rawLines.push({ text: current, tokenCount: count });
    }
  }

  return finalizeLayout(
    "greedy-baseline",
    locale,
    geom,
    resolved.fontSizePx,
    resolved.lineHeightRatio,
    rawLines,
    resolved.letterSpacingEm,
    resolved.targetDiamondFillRatio,
    0,
  );
}

interface CandidateLineBreakSolution {
  readonly lineCount: number;
  readonly breaks: readonly [number, number][];
  readonly totalCost: number;
}

function solveFixedLineCountDp(
  tokens: readonly TypesetToken[],
  metrics: PrefixTokenMetrics,
  locale: SupportedTypesetLocale,
  geom: ResolvedBalloonGeometrySpec,
  lineCount: number,
  fontSizePx: number,
  lineHeightPx: number,
  letterSpacingEm: number,
  targetDiamondFillRatio: number,
): CandidateLineBreakSolution | null {
  const n = tokens.length;
  if (lineCount < 1 || lineCount > n) return null;

  const totalLinearWidth = measureTokenRangeWidthPx(metrics, 0, n, fontSizePx, letterSpacingEm);
  const spaceEm = locale === "ja-JP" ? 0 : 0.28 * fontSizePx;
  const effectiveContentWidth = Math.max(1, totalLinearWidth - Math.max(0, lineCount - 1) * spaceEm);
  const { chordWidths, targetWidths } = computeLineTargetWidths(
    geom,
    lineCount,
    lineHeightPx,
    effectiveContentWidth,
    targetDiamondFillRatio,
  );

  const INF = 1e15;
  const dp: Float64Array[] = [];
  const prevIdx: Int32Array[] = [];
  for (let k = 0; k <= lineCount; k += 1) {
    dp.push(new Float64Array(n + 1).fill(INF));
    prevIdx.push(new Int32Array(n + 1).fill(-1));
  }
  const dp0 = dp[0];
  if (dp0) dp0[0] = 0;

  const isCjk = locale === "ko-KR" || locale === "ja-JP";

  for (let k = 1; k <= lineCount; k += 1) {
    const prevRow = dp[k - 1];
    const currRow = dp[k];
    const currPrev = prevIdx[k];
    if (!prevRow || !currRow || !currPrev) continue;

    const lineIdx = k - 1;
    const avail = chordWidths[lineIdx] ?? 0;
    const target = targetWidths[lineIdx] ?? 0;
    const isLastLine = k === lineCount;
    const minEnd = k;
    const maxEnd = isLastLine ? n : n - (lineCount - k);

    for (let end = minEnd; end <= maxEnd; end += 1) {
      const startMin = k === 1 ? 0 : k - 1;
      let bestCost = INF;
      let bestStart = -1;

      for (let start = startMin; start <= end - 1; start += 1) {
        const priorCost = prevRow[start] ?? INF;
        if (priorCost >= INF * 0.5 || hasInternalHardBreak(metrics, start, end)) continue;

        const width = measureTokenRangeWidthPx(metrics, start, end, fontSizePx, letterSpacingEm);
        let cost = 0;

        if (width > avail + 0.25) {
          const excess = width - avail;
          cost += 220000 + excess * 4200 + excess * excess * 95;
        }

        const relErr = Math.abs(width - target) / Math.max(12, avail);
        cost += relErr * relErr * 1600 + relErr * relErr * relErr * 650;

        const speakable = (metrics.prefixSpeakable[end] ?? 0) - (metrics.prefixSpeakable[start] ?? 0);
        const tokCount = end - start;
        if (isLastLine && lineCount >= 2) {
          if (isCjk && speakable <= 1) {
            cost += 75000;
          } else if (!isCjk && (speakable <= 1 || (n >= 4 && tokCount <= 1 && speakable <= 4))) {
            cost += 65000;
          } else if (!isCjk && n >= 4 && tokCount <= 1 && avail > 0 && width < avail * 0.32) {
            cost += 42000;
          }
        }
        if (lineCount >= 2 && avail > 0 && width < avail * 0.24) {
          cost += (0.24 - width / avail) * 14000;
        }

        const firstCh = splitCodePoints(tokens[start]?.text ?? "")[0] ?? "";
        const lastChars = splitCodePoints(tokens[end - 1]?.text ?? "");
        const lastCh = lastChars[lastChars.length - 1] ?? "";
        if (lineIdx > 0 && firstCh.length > 0 && isLineStartForbiddenChar(firstCh, locale)) {
          cost += 90000;
        }
        if (lastCh.length > 0 && isLineEndForbiddenChar(lastCh, locale)) {
          cost += 90000;
        }
        if (tokens[end - 1]?.hyphenatedPiece) {
          cost += 180;
        }

        const total = priorCost + cost;
        if (total < bestCost) {
          bestCost = total;
          bestStart = start;
        }
      }

      if (bestStart >= 0) {
        currRow[end] = bestCost;
        currPrev[end] = bestStart;
      }
    }
  }

  const finalCost = dp[lineCount]?.[n] ?? INF;
  if (finalCost >= INF * 0.5) return null;

  const breaks: [number, number][] = [];
  let cursor = n;
  for (let k = lineCount; k >= 1; k -= 1) {
    const start = prevIdx[k]?.[cursor] ?? -1;
    if (start < 0) return null;
    breaks.push([start, cursor]);
    cursor = start;
  }
  breaks.reverse();

  const totalHeight = lineCount * lineHeightPx;
  const verticalPenalty =
    totalHeight > geom.availableTextHeightPx + 0.25
      ? 450000 + (totalHeight - geom.availableTextHeightPx) * 5000
      : 0;

  return { lineCount, breaks, totalCost: finalCost + verticalPenalty };
}

/**
 * 마름모꼴 Knuth-Plass 동적 계획법(DP) 말풍선 식자 솔버.
 */
export function typesetBalloonDiamondOptimal(
  text: string,
  locale: SupportedTypesetLocale,
  geometrySpec: BalloonGeometrySpec,
  options?: BalloonTypesetOptions,
): BalloonLayoutResult {
  const geom = resolveBalloonGeometry(geometrySpec);
  const resolved = resolveBalloonTypesetOptions(locale, options);
  const baseTokens = tokenizeDialogueForLocale(text, locale);

  if (baseTokens.length === 0) {
    return finalizeLayout(
      "diamond-knuth-plass",
      locale,
      geom,
      resolved.fontSizePx,
      resolved.lineHeightRatio,
      [],
      resolved.letterSpacingEm,
      resolved.targetDiamondFillRatio,
      0,
    );
  }

  const maxChordPx = computeBalloonChordWidthPx(geom, 0);
  const tokens = expandOversizedTokens(
    baseTokens,
    maxChordPx,
    resolved.fontSizePx,
    locale,
    resolved.letterSpacingEm,
    resolved.allowWordHyphenation,
    resolved.allowKoreanSyllableSplit,
  );
  const metrics = buildPrefixMetrics(tokens, locale);
  const lineHeightPx = round2(resolved.fontSizePx * resolved.lineHeightRatio);

  const hardBreakCount = metrics.prefixHardBreaks[tokens.length] ?? 0;
  const minLines = Math.max(1, hardBreakCount + 1);
  const maxHeightLines = Math.max(1, Math.floor(geom.availableTextHeightPx / Math.max(1, lineHeightPx)));
  const maxLines = Math.min(tokens.length, Math.max(minLines, Math.min(14, maxHeightLines + 3)));

  let bestLayout: BalloonLayoutResult | null = null;
  let bestRankScore = Number.POSITIVE_INFINITY;

  for (let lineCount = minLines; lineCount <= maxLines; lineCount += 1) {
    const solution = solveFixedLineCountDp(
      tokens,
      metrics,
      locale,
      geom,
      lineCount,
      resolved.fontSizePx,
      lineHeightPx,
      resolved.letterSpacingEm,
      resolved.targetDiamondFillRatio,
    );
    if (!solution) continue;

    const rawLines = solution.breaks.map((span) => ({
      text: joinTokenRange(tokens, span[0], span[1]),
      tokenCount: span[1] - span[0],
    }));

    const layout = finalizeLayout(
      "diamond-knuth-plass",
      locale,
      geom,
      resolved.fontSizePx,
      resolved.lineHeightRatio,
      rawLines,
      resolved.letterSpacingEm,
      resolved.targetDiamondFillRatio,
      solution.totalCost,
    );

    const defectPenalty =
      layout.audit.verticalOverflowCount * 1000000 +
      layout.audit.horizontalOverflowCount * 500000 +
      layout.audit.maxOverflowPx * 4000 +
      (layout.audit.lineStartKinsokuCount + layout.audit.lineEndKinsokuCount) * 200000 +
      layout.audit.widowCount * 120000;
    const shapeObjective = (100 - layout.diamondFitScore) * 18 + (100 - layout.symmetryScore) * 8;
    const sparsePenalty = layout.averageFillRatio < 0.45 ? (0.45 - layout.averageFillRatio) * 600 : 0;
    const rankScore = defectPenalty + shapeObjective + sparsePenalty + solution.totalCost * 0.002;

    if (rankScore < bestRankScore) {
      bestRankScore = rankScore;
      bestLayout = layout;
    }
  }

  if (bestLayout) return bestLayout;

  return finalizeLayout(
    "diamond-knuth-plass",
    locale,
    geom,
    resolved.fontSizePx,
    resolved.lineHeightRatio,
    [{ text: joinTokenRange(tokens, 0, tokens.length), tokenCount: tokens.length }],
    resolved.letterSpacingEm,
    resolved.targetDiamondFillRatio,
    0,
  );
}
