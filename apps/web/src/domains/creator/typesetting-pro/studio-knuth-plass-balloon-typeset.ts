/**
 * Studio Knuth-Plass Elliptical Balloon Typesetting Engine (100% 클린룸 순수 알고리즘).
 *
 * 출판 만화·InDesign 수준의 타원 말풍선 조판을 2차원 동적 계획법(Knuth-Plass badness 최소화)으로
 * 계산한다. DOM/Canvas/Konva에 전혀 의존하지 않으며, 텍스트 폭 측정은 주입 가능한 포트로 분리한다.
 *
 * 핵심 알고리즘:
 *  1. 타원 현(chord) 가용 폭: 각 줄의 중심 y좌표에서 `W(y) = 2 * rx * sqrt(1 - (y / ry)^2)`를 계산한다.
 *  2. 2D Knuth-Plass DP: 후보 줄 수 `L ∈ [P .. L_max]`마다 동심 타원 목표 폭과 실제 외곽 현 폭에
 *     대해 3차 badness(`100 * |r|^3`) + 인접 줄 피트니스 전환 비용 + 조판 패널티 합을 최소화한다.
 *  3. 한국어 `keep-all` 어절 무결성 + 단독 조사·어미·의존명사 행두 분리 방지 + 1음절/구두점
 *     고아줄(widow/orphan) 억제 + `studio-kinsoku-line-break` 행두·행말 금칙 연동.
 *  4. 문장부호 광학 커닝(약물 연속 압축·`!?` 밀착·라틴 광학 쌍) 및 행단 광학 돌출(Optical Margin).
 */

import {
  breakWordWithKinsoku,
  isKinsokuNoLineEnd,
  segmentGraphemes,
} from "../lettering/studio-kinsoku-line-break";

import {
  computeLineEdgeOpticalHang,
  computePunctuationOpticalKerning,
  countCoreSyllables,
  createDefaultBalloonTextMeasurer,
  DEFAULT_BALLOON_TEXT_MEASURER,
  isKoreanBoundLineEndToken,
  isKoreanBoundLineStartToken,
  isPurePunctuationToken,
  measureLineRawWidth,
  type BalloonTextWidthMeasurer,
  type OpticalKerningAdjustment,
} from "./studio-typesetting-optical-rules";

export {
  computePunctuationOpticalKerning,
  createDefaultBalloonTextMeasurer,
  isKoreanBoundLineEndToken,
  isKoreanBoundLineStartToken,
  type BalloonTextWidthMeasurer,
  type OpticalKerningAdjustment,
};

// ── 공개 타입 계약 ────────────────────────────────────────────────────────────

export interface EllipticalBalloonGeometry {
  /** 타원 가로 반지름(px). */
  readonly rx: number;
  /** 타원 세로 반지름(px). */
  readonly ry: number;
  /** 타원 좌우 내부 안전 여백(px). 미지정 시 `Math.max(8, rx * 0.08)` 적용. */
  readonly paddingX?: number;
  /** 타원 상하 내부 안전 여백(px). 미지정 시 `Math.max(6, ry * 0.08)` 적용. */
  readonly paddingY?: number;
}

export interface KnuthPlassBalloonOptions {
  /** 글자 크기(px). 기본 20. */
  readonly fontSize?: number;
  /** 행간 배수(`lineHeightPx = fontSize * lineHeight`). 기본 1.35. */
  readonly lineHeight?: number;
  /** 자간(px). 기본 0. */
  readonly letterSpacing?: number;
  /** 글꼴 패밀리(측정기 전달용). 기본 `"Pretendard, sans-serif"`. */
  readonly fontFamily?: string;
  /** 글꼴 스타일(측정기 전달용). 기본 `"bold"`. */
  readonly fontStyle?: string;
  /** 한글 시각 무게중심 수직 보정 비율(fontSize 대비). 기본 `-0.03`. */
  readonly opticalCenterOffsetRatio?: number;
  /** 문장부호 광학 커닝 활성화 여부. 기본 `true`. */
  readonly opticalKerning?: boolean;
  /** 행단 광학 여백 돌출(Optical Margin Hanging) 가중치(0..1). 기본 `0.85`. */
  readonly opticalMarginWeight?: number;
  /** 탐색할 최대 줄 수 상한. 미지정 시 타원 높이 기반으로 자동 계산. */
  readonly maxLines?: number;
  /** 텍스트 폭 측정기. 미지정 시 결정적 한글/CJK/라틴 근사 측정기 사용. */
  readonly measurer?: BalloonTextWidthMeasurer;
}

export interface KnuthPlassBalloonLine {
  readonly lineIndex: number;
  readonly text: string;
  /** 타원 중심(0, 0) 기준 줄 중심의 세로 좌표(px). */
  readonly yOffsetPx: number;
  /** 타원 바운딩 박스 좌상단 기준 줄 중심 Y(px). */
  readonly yPx: number;
  /** 타원 바운딩 박스 좌상단 기준 줄 시작 X(가운데 정렬 + 광학 보정). */
  readonly xPx: number;
  /** 해당 y좌표에서의 실제 타원 가용 현 폭 `2 * effRx * sqrt(1 - (y / effRy)^2)`(px). */
  readonly availableWidthPx: number;
  /** 광학 커닝 적용 전 원시 측정 폭(px). */
  readonly measuredWidthPx: number;
  /** 문장부호 광학 커닝 적용 후 시각 폭(px). */
  readonly opticalWidthPx: number;
  /** 광학 커닝 총 보정량(px, 음수면 밀착). */
  readonly kerningDeltaPx: number;
  /** 행두 광학 돌출량(px). */
  readonly opticalLeftHangPx: number;
  /** 행말 광학 돌출량(px). */
  readonly opticalRightHangPx: number;
  readonly kerningAdjustments: readonly OpticalKerningAdjustment[];
  /** 타원 가용 폭 대비 실효 점유 비율. */
  readonly fillRatio: number;
  /** Knuth-Plass 3차 badness (0..10000). */
  readonly badness: number;
  /** 이 줄에 부과된 총 demerit. */
  readonly demerits: number;
  readonly hasWidowOrOrphan: boolean;
  readonly hasParticleBreak: boolean;
  readonly overflowPx: number;
}

export interface KnuthPlassBalloonTypesetResult {
  readonly lines: readonly KnuthPlassBalloonLine[];
  readonly totalDemerits: number;
  /** 타원 다이아몬드 균형도(0..1, 높을수록 중앙이 넓고 상하가 대칭적으로 수렴). */
  readonly diamondBalanceScore: number;
  readonly widowOrOrphanCount: number;
  readonly particleBreakCount: number;
  readonly overflow: boolean;
  readonly verticalOverflow: boolean;
  readonly hardBreakOccurred: boolean;
  readonly cssWordBreak: "keep-all";
  readonly lineHeightPx: number;
  readonly totalBlockHeightPx: number;
  readonly ellipse: {
    readonly rx: number;
    readonly ry: number;
    readonly effectiveRx: number;
    readonly effectiveRy: number;
  };
}

// ── Knuth-Plass 비용 상수 ────────────────────────────────────────────────────

const KNUTH_LINE_PENALTY = 12;
const FITNESS_JUMP_DEMERIT = 320;
const WIDOW_STRICT_PENALTY = 6_500;
const WIDOW_SHORT_PENALTY = 2_800;
const WIDOW_PUNCT_ONLY_PENALTY = 9_500;
const ORPHAN_FIRST_LINE_PENALTY = 4_800;
const INTERIOR_SINGLE_SYLLABLE_PENALTY = 3_600;
const PARTICLE_LINE_START_PENALTY = 7_500;
const PREFIX_LINE_END_PENALTY = 1_900;
const KINSOKU_VIOLATION_PENALTY = 8_500;
const HORIZONTAL_OVERFLOW_BASE = 250_000;
const VERTICAL_OVERFLOW_BASE = 180_000;

/**
 * 타원 `(rx, ry)`에서 중심 기준 세로 오프셋 `yOffset` 위치의 실제 가용 현(chord) 폭을 계산한다.
 * 공식: `2 * rx * sqrt(1 - (yOffset / ry)^2)` (`|yOffset| >= ry`이면 `0`).
 */
export function computeEllipseChordWidth(rx: number, ry: number, yOffset: number): number {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(yOffset)) return 0;
  if (rx <= 0 || ry <= 0) return 0;
  const normalizedY = yOffset / ry;
  const radicand = 1 - normalizedY * normalizedY;
  if (radicand <= 0) return 0;
  return 2 * rx * Math.sqrt(radicand);
}

// ── 내부 토큰화 및 DP 솔버 ───────────────────────────────────────────────────

interface PreparedToken {
  readonly text: string;
  readonly paragraphIndex: number;
  /** 강제 분할된 동일 어절의 후속 조각이면 `true` — 같은 줄에 다시 합칠 때 공백을 넣지 않는다. */
  readonly gluedToPrev: boolean;
}

function joinTokensOnLine(tokens: readonly PreparedToken[], start: number, end: number): string {
  let out = tokens[start]!.text;
  for (let i = start + 1; i < end; i += 1) {
    const token = tokens[i]!;
    out += token.gluedToPrev ? token.text : ` ${token.text}`;
  }
  return out;
}

function prepareTokens(
  text: string,
  maxChordWidth: number,
  fontSize: number,
  letterSpacing: number,
  fontFamily: string,
  fontStyle: string,
  measurer: BalloonTextWidthMeasurer,
): { readonly tokens: readonly PreparedToken[]; readonly paragraphCount: number; readonly hardBreakOccurred: boolean } {
  const rawParagraphs = text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (rawParagraphs.length === 0) {
    return { tokens: [], paragraphCount: 0, hardBreakOccurred: false };
  }

  const tokens: PreparedToken[] = [];
  let hardBreakOccurred = false;
  const safeMaxChord = Math.max(fontSize, maxChordWidth);
  const measureSingle = (slice: string): number =>
    measureLineRawWidth(slice, fontSize, letterSpacing, fontFamily, fontStyle, measurer);

  rawParagraphs.forEach((paragraph, paragraphIndex) => {
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      if (measureSingle(word) > safeMaxChord) {
        const parts = breakWordWithKinsoku(word, safeMaxChord, measureSingle).filter(Boolean);
        if (parts.length > 1) hardBreakOccurred = true;
        parts.forEach((part, idx) => {
          tokens.push({ text: part, paragraphIndex, gluedToPrev: idx > 0 });
        });
      } else {
        tokens.push({ text: word, paragraphIndex, gluedToPrev: false });
      }
    }
  });

  return { tokens, paragraphCount: rawParagraphs.length, hardBreakOccurred };
}

interface SpanOpticalMetrics {
  readonly text: string;
  readonly measuredWidthPx: number;
  readonly opticalWidthPx: number;
  readonly kerningDeltaPx: number;
  readonly leftHangPx: number;
  readonly rightHangPx: number;
  readonly kerningAdjustments: readonly OpticalKerningAdjustment[];
  readonly effectiveWidthPx: number;
  readonly coreSyllables: number;
}

interface EvaluatedLineCandidate {
  readonly text: string;
  readonly measuredWidthPx: number;
  readonly opticalWidthPx: number;
  readonly kerningDeltaPx: number;
  readonly leftHangPx: number;
  readonly rightHangPx: number;
  readonly kerningAdjustments: readonly OpticalKerningAdjustment[];
  readonly effectiveWidthPx: number;
  readonly badness: number;
  readonly demerits: number;
  readonly fitnessClass: 0 | 1 | 2 | 3;
  readonly hasWidowOrOrphan: boolean;
  readonly hasParticleBreak: boolean;
  readonly overflowPx: number;
}

interface LineEvalContext {
  readonly tokens: readonly PreparedToken[];
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly fontFamily: string;
  readonly fontStyle: string;
  readonly opticalKerning: boolean;
  readonly opticalMarginWeight: number;
  readonly measurer: BalloonTextWidthMeasurer;
  readonly spanCache: Map<number, SpanOpticalMetrics>;
}

function getSpanMetrics(ctx: LineEvalContext, start: number, end: number): SpanOpticalMetrics {
  const key = start * (ctx.tokens.length + 1) + end;
  const cached = ctx.spanCache.get(key);
  if (cached) return cached;

  const lineText = joinTokensOnLine(ctx.tokens, start, end);
  const measuredWidthPx = measureLineRawWidth(
    lineText,
    ctx.fontSize,
    ctx.letterSpacing,
    ctx.fontFamily,
    ctx.fontStyle,
    ctx.measurer,
  );
  const kerning = ctx.opticalKerning
    ? computePunctuationOpticalKerning(lineText, ctx.fontSize)
    : { adjustments: Object.freeze([]), totalDeltaPx: 0 };
  const opticalWidthPx = Math.max(0, measuredWidthPx + kerning.totalDeltaPx);
  const hang = computeLineEdgeOpticalHang(lineText, ctx.fontSize, ctx.opticalMarginWeight);
  const effectiveWidthPx = Math.max(0, opticalWidthPx - (hang.leftHangPx + hang.rightHangPx));
  const metrics: SpanOpticalMetrics = {
    text: lineText,
    measuredWidthPx,
    opticalWidthPx,
    kerningDeltaPx: kerning.totalDeltaPx,
    leftHangPx: hang.leftHangPx,
    rightHangPx: hang.rightHangPx,
    kerningAdjustments: kerning.adjustments,
    effectiveWidthPx,
    coreSyllables: countCoreSyllables(lineText),
  };
  ctx.spanCache.set(key, metrics);
  return metrics;
}

function classifyFitness(ratio: number): 0 | 1 | 2 | 3 {
  if (ratio < -0.5) return 0;
  if (ratio <= 0.5) return 1;
  if (ratio <= 1.15) return 2;
  return 3;
}

function evaluateCandidateLine(
  ctx: LineEvalContext,
  start: number,
  end: number,
  lineIndex: number,
  totalLines: number,
  availableWidthPx: number,
  idealTargetWidthPx: number,
): EvaluatedLineCandidate {
  const { tokens, fontSize } = ctx;
  const span = getSpanMetrics(ctx, start, end);
  const effectiveWidthPx = span.effectiveWidthPx;

  const safeAvail = Math.max(1, availableWidthPx);
  const safeTarget = Math.max(1, Math.min(safeAvail, idealTargetWidthPx));
  const overflowPx = Math.max(0, effectiveWidthPx - safeAvail);

  let ratio: number;
  if (overflowPx > 0) {
    ratio = -(overflowPx / Math.max(fontSize * 0.5, 4));
  } else if (effectiveWidthPx <= safeTarget) {
    const stretch = Math.max(safeTarget * 0.3, fontSize * 1.4);
    ratio = (safeTarget - effectiveWidthPx) / stretch;
  } else {
    const slackToChord = Math.max(safeAvail - safeTarget, fontSize * 0.75);
    ratio = -0.7 * ((effectiveWidthPx - safeTarget) / slackToChord);
  }

  const badness = Math.min(10_000, Math.round(100 * Math.pow(Math.abs(ratio), 3) * 100) / 100);
  const fitnessClass = classifyFitness(ratio);

  let penalty = 0;
  let hasParticleBreak = false;
  let hasWidowOrOrphan = false;

  const firstToken = tokens[start]!;
  const lastToken = tokens[end - 1]!;
  const prevToken = start > 0 ? tokens[start - 1] : undefined;
  const nextToken = end < tokens.length ? tokens[end] : undefined;
  const isBreakAfterPrev = prevToken !== undefined && prevToken.paragraphIndex === firstToken.paragraphIndex;
  const isBreakBeforeNext = nextToken !== undefined && nextToken.paragraphIndex === lastToken.paragraphIndex;

  if (isBreakAfterPrev && isKoreanBoundLineStartToken(firstToken.text)) {
    penalty += isPurePunctuationToken(firstToken.text) ? KINSOKU_VIOLATION_PENALTY : PARTICLE_LINE_START_PENALTY;
    hasParticleBreak = true;
  }

  if (isBreakBeforeNext && isKoreanBoundLineEndToken(lastToken.text)) {
    const lastGraphemes = segmentGraphemes(lastToken.text);
    const isHardKinsoku = isKinsokuNoLineEnd(lastGraphemes[lastGraphemes.length - 1]);
    penalty += isHardKinsoku ? KINSOKU_VIOLATION_PENALTY : PREFIX_LINE_END_PENALTY;
  }

  if (totalLines >= 2) {
    const coreSyllables = span.coreSyllables;
    const isSingleToken = end - start === 1;
    if (lineIndex === totalLines - 1 && isBreakAfterPrev) {
      if (coreSyllables === 0) {
        penalty += WIDOW_PUNCT_ONLY_PENALTY;
        hasWidowOrOrphan = true;
      } else if (isSingleToken && coreSyllables <= 1) {
        penalty += WIDOW_STRICT_PENALTY;
        hasWidowOrOrphan = true;
      } else if (isSingleToken && coreSyllables <= 2 && effectiveWidthPx < safeTarget * 0.45) {
        penalty += WIDOW_SHORT_PENALTY;
        hasWidowOrOrphan = true;
      }
    } else if (lineIndex === 0 && isBreakBeforeNext) {
      if (coreSyllables === 0 || (isSingleToken && coreSyllables <= 1)) {
        penalty += ORPHAN_FIRST_LINE_PENALTY;
        hasWidowOrOrphan = true;
      }
    } else if (isSingleToken && coreSyllables <= 1 && (isBreakAfterPrev || isBreakBeforeNext)) {
      penalty += INTERIOR_SINGLE_SYLLABLE_PENALTY;
      hasWidowOrOrphan = true;
    }
  }

  const baseDemerit = Math.pow(KNUTH_LINE_PENALTY + badness, 2);
  const linguisticDemerit = penalty * 12;
  const overflowDemerit =
    overflowPx > 0
      ? HORIZONTAL_OVERFLOW_BASE + Math.pow(overflowPx / Math.max(1, fontSize * 0.25), 3) * 2_000
      : 0;

  return {
    text: span.text,
    measuredWidthPx: span.measuredWidthPx,
    opticalWidthPx: span.opticalWidthPx,
    kerningDeltaPx: span.kerningDeltaPx,
    leftHangPx: span.leftHangPx,
    rightHangPx: span.rightHangPx,
    kerningAdjustments: span.kerningAdjustments,
    effectiveWidthPx,
    badness,
    demerits: baseDemerit + linguisticDemerit + overflowDemerit,
    fitnessClass,
    hasWidowOrOrphan,
    hasParticleBreak,
    overflowPx,
  };
}

function buildIdealLineTargets(
  availableWidths: readonly number[],
  totalNaturalWidth: number,
  fontSize: number,
): readonly number[] {
  const count = availableWidths.length;
  if (count === 0) return [];
  const chordSum = availableWidths.reduce((acc, w) => acc + Math.max(0, w), 0);
  if (chordSum <= 0) return availableWidths.map(() => fontSize);

  const rawScale = totalNaturalWidth > 0 ? (totalNaturalWidth * 1.04) / chordSum : 1;
  const concentricScale = Math.max(0.42, Math.min(1.0, rawScale));

  return availableWidths.map((avail, k) => {
    if (count < 3) return Math.min(avail, avail * Math.max(0.75, concentricScale));
    const centerDist = Math.abs(k - (count - 1) / 2) / ((count - 1) / 2);
    const diamondWeight = 1.06 - 0.16 * centerDist * centerDist;
    return Math.min(avail, Math.max(fontSize * 1.5, avail * concentricScale * diamondWeight));
  });
}

function computeDiamondBalanceScore(lines: readonly KnuthPlassBalloonLine[], overflow: boolean): number {
  if (lines.length === 0) return 1;
  if (lines.length === 1) return overflow ? 0.25 : 1;

  const widths = lines.map((l) => l.opticalWidthPx);
  const avail = lines.map((l) => Math.max(1, l.availableWidthPx));
  const maxWidth = Math.max(1, ...widths);
  const maxAvail = Math.max(1, ...avail);

  let profileError = 0;
  for (let i = 0; i < lines.length; i += 1) {
    profileError += Math.abs(widths[i]! / maxWidth - avail[i]! / maxAvail);
  }
  const profileScore = Math.max(0, 1 - profileError / lines.length);

  const pairs = Math.floor(lines.length / 2);
  let symError = 0;
  for (let i = 0; i < pairs; i += 1) {
    symError += Math.abs(widths[i]! - widths[lines.length - 1 - i]!) / maxWidth;
  }
  const symmetryScore = pairs > 0 ? Math.max(0, 1 - symError / pairs) : 1;

  let centerBulgeScore = 1;
  if (lines.length >= 3) {
    const midIdx = Math.floor(lines.length / 2);
    const midWidth =
      lines.length % 2 === 1 ? widths[midIdx]! : (widths[midIdx - 1]! + widths[midIdx]!) / 2;
    const edgeAvg = (widths[0]! + widths[lines.length - 1]!) / 2;
    centerBulgeScore = midWidth >= edgeAvg ? 1 : Math.max(0, midWidth / Math.max(1, edgeAvg));
  }

  const raw = 0.45 * profileScore + 0.35 * symmetryScore + 0.2 * centerBulgeScore;
  return Number(Math.max(0, Math.min(1, raw * (overflow ? 0.5 : 1))).toFixed(4));
}

interface SolvedLineCountPlan {
  readonly candidates: readonly EvaluatedLineCandidate[];
  readonly yOffsets: readonly number[];
  readonly availableWidths: readonly number[];
  readonly totalDemerits: number;
  readonly horizontalOverflow: boolean;
  readonly verticalOverflow: boolean;
  readonly objectiveCost: number;
}

function solveFixedLineCount(
  ctx: LineEvalContext,
  lineCount: number,
  effRx: number,
  effRy: number,
  lineHeightPx: number,
  opticalCenterY: number,
  totalNaturalWidth: number,
): SolvedLineCountPlan | null {
  const { tokens, fontSize } = ctx;
  const n = tokens.length;
  if (lineCount < 1 || lineCount > n) return null;

  const yOffsets: number[] = [];
  const availableWidths: number[] = [];
  let verticalOverflow = false;

  for (let k = 0; k < lineCount; k += 1) {
    const yOffset = (k - (lineCount - 1) / 2) * lineHeightPx + opticalCenterY;
    yOffsets.push(yOffset);
    const chord = computeEllipseChordWidth(effRx, effRy, yOffset);
    if (chord < fontSize * 0.75 || Math.abs(yOffset) + fontSize * 0.35 > effRy) {
      verticalOverflow = true;
    }
    availableWidths.push(chord);
  }

  const idealTargets = buildIdealLineTargets(availableWidths, totalNaturalWidth, fontSize);
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][][] = Array.from({ length: lineCount + 1 }, () =>
    Array.from({ length: n + 1 }, () => [INF, INF, INF, INF]),
  );
  const backPrevToken: number[][][] = Array.from({ length: lineCount + 1 }, () =>
    Array.from({ length: n + 1 }, () => [-1, -1, -1, -1]),
  );
  const backPrevFitness: number[][][] = Array.from({ length: lineCount + 1 }, () =>
    Array.from({ length: n + 1 }, () => [-1, -1, -1, -1]),
  );
  const backCandidate: (EvaluatedLineCandidate | null)[][][] = Array.from({ length: lineCount + 1 }, () =>
    Array.from({ length: n + 1 }, () => [null, null, null, null]),
  );

  const sameParagraph = (start: number, end: number): boolean => {
    const para = tokens[start]!.paragraphIndex;
    for (let idx = start + 1; idx < end; idx += 1) {
      if (tokens[idx]!.paragraphIndex !== para) return false;
    }
    return true;
  };

  for (let k = 1; k <= lineCount; k += 1) {
    const lineIndex = k - 1;
    const minEnd = k;
    const maxEnd = n - (lineCount - k);

    for (let end = minEnd; end <= maxEnd; end += 1) {
      const startMin = k === 1 ? 0 : k - 1;
      const startMax = k === 1 ? 0 : end - 1;

      for (let start = startMin; start <= startMax; start += 1) {
        if (!sameParagraph(start, end)) continue;
        if (k > 1) {
          const prevRow = dp[k - 1]![start]!;
          if (prevRow[0] === INF && prevRow[1] === INF && prevRow[2] === INF && prevRow[3] === INF) continue;
        }

        const cand = evaluateCandidateLine(
          ctx,
          start,
          end,
          lineIndex,
          lineCount,
          availableWidths[lineIndex]!,
          idealTargets[lineIndex]!,
        );
        const fc = cand.fitnessClass;

        if (k === 1) {
          if (cand.demerits < dp[1]![end]![fc]!) {
            dp[1]![end]![fc] = cand.demerits;
            backPrevToken[1]![end]![fc] = 0;
            backPrevFitness[1]![end]![fc] = -1;
            backCandidate[1]![end]![fc] = cand;
          }
          continue;
        }

        const prevCosts = dp[k - 1]![start]!;
        for (let prevFc = 0; prevFc < 4; prevFc += 1) {
          const prevCost = prevCosts[prevFc]!;
          if (prevCost === INF) continue;
          const totalCost = prevCost + cand.demerits + (Math.abs(prevFc - fc) > 1 ? FITNESS_JUMP_DEMERIT : 0);
          if (totalCost < dp[k]![end]![fc]!) {
            dp[k]![end]![fc] = totalCost;
            backPrevToken[k]![end]![fc] = start;
            backPrevFitness[k]![end]![fc] = prevFc;
            backCandidate[k]![end]![fc] = cand;
          }
        }
      }
    }
  }

  let bestFc = -1;
  let bestCost = INF;
  for (let fc = 0; fc < 4; fc += 1) {
    if (dp[lineCount]![n]![fc]! < bestCost) {
      bestCost = dp[lineCount]![n]![fc]!;
      bestFc = fc;
    }
  }
  if (bestFc < 0 || !Number.isFinite(bestCost)) return null;

  const candidates: EvaluatedLineCandidate[] = new Array<EvaluatedLineCandidate>(lineCount);
  let curToken = n;
  let curFc = bestFc;
  for (let k = lineCount; k >= 1; k -= 1) {
    const cand = backCandidate[k]![curToken]![curFc];
    if (!cand) return null;
    candidates[k - 1] = cand;
    const prevToken = backPrevToken[k]![curToken]![curFc]!;
    const prevFc = backPrevFitness[k]![curToken]![curFc]!;
    curToken = prevToken;
    curFc = prevFc;
  }

  const horizontalOverflow = candidates.some((c) => c.overflowPx > 0);
  const blockHeight = lineCount * lineHeightPx;
  const maxOpticalLineW = Math.max(1, ...candidates.map((c) => c.opticalWidthPx));
  const targetAspect = effRx / Math.max(1, effRy);
  const blockAspect = maxOpticalLineW / Math.max(1, blockHeight);
  const aspectPenalty = Math.abs(Math.log(Math.max(0.1, blockAspect / Math.max(0.1, targetAspect)))) * 450;
  const verticalPenalty = verticalOverflow
    ? VERTICAL_OVERFLOW_BASE + Math.max(0, blockHeight - effRy * 2) * 2_000
    : 0;

  return {
    candidates,
    yOffsets,
    availableWidths,
    totalDemerits: bestCost,
    horizontalOverflow,
    verticalOverflow,
    objectiveCost: bestCost + aspectPenalty + verticalPenalty,
  };
}

// ── 공개 메인 엔트리포인트 ───────────────────────────────────────────────────

/**
 * Knuth-Plass 2D 동적 계획법으로 타원 말풍선 `(rx, ry)` 내부의 최적 다이아몬드 균형 조판을 계산한다.
 */
export function typesetKnuthPlassEllipticalBalloon(
  text: string,
  ellipse: EllipticalBalloonGeometry,
  options: KnuthPlassBalloonOptions = {},
): KnuthPlassBalloonTypesetResult {
  const rx = Number.isFinite(ellipse.rx) && ellipse.rx > 0 ? ellipse.rx : 100;
  const ry = Number.isFinite(ellipse.ry) && ellipse.ry > 0 ? ellipse.ry : 64;
  const paddingX =
    typeof ellipse.paddingX === "number" && Number.isFinite(ellipse.paddingX) && ellipse.paddingX >= 0
      ? ellipse.paddingX
      : Math.max(8, rx * 0.08);
  const paddingY =
    typeof ellipse.paddingY === "number" && Number.isFinite(ellipse.paddingY) && ellipse.paddingY >= 0
      ? ellipse.paddingY
      : Math.max(6, ry * 0.08);
  const effectiveRx = Math.max(4, rx - paddingX);
  const effectiveRy = Math.max(4, ry - paddingY);

  const fontSize =
    typeof options.fontSize === "number" && Number.isFinite(options.fontSize) && options.fontSize > 0
      ? options.fontSize
      : 20;
  const lineHeight =
    typeof options.lineHeight === "number" && Number.isFinite(options.lineHeight) && options.lineHeight > 0
      ? options.lineHeight
      : 1.35;
  const lineHeightPx = fontSize * lineHeight;
  const letterSpacing =
    typeof options.letterSpacing === "number" && Number.isFinite(options.letterSpacing)
      ? options.letterSpacing
      : 0;
  const fontFamily = options.fontFamily ?? "Pretendard, sans-serif";
  const fontStyle = options.fontStyle ?? "bold";
  const opticalCenterOffsetRatio =
    typeof options.opticalCenterOffsetRatio === "number" && Number.isFinite(options.opticalCenterOffsetRatio)
      ? options.opticalCenterOffsetRatio
      : -0.03;
  const opticalCenterY = opticalCenterOffsetRatio * fontSize;
  const opticalKerning = options.opticalKerning !== false;
  const opticalMarginWeight =
    typeof options.opticalMarginWeight === "number" && Number.isFinite(options.opticalMarginWeight)
      ? Math.max(0, Math.min(1, options.opticalMarginWeight))
      : 0.85;
  const measurer = options.measurer ?? DEFAULT_BALLOON_TEXT_MEASURER;

  const maxChordWidth = computeEllipseChordWidth(effectiveRx, effectiveRy, 0);
  const prepared = prepareTokens(
    typeof text === "string" ? text : "",
    maxChordWidth,
    fontSize,
    letterSpacing,
    fontFamily,
    fontStyle,
    measurer,
  );

  if (prepared.tokens.length === 0) {
    return Object.freeze({
      lines: Object.freeze([]),
      totalDemerits: 0,
      diamondBalanceScore: 1,
      widowOrOrphanCount: 0,
      particleBreakCount: 0,
      overflow: false,
      verticalOverflow: false,
      hardBreakOccurred: false,
      cssWordBreak: "keep-all" as const,
      lineHeightPx,
      totalBlockHeightPx: 0,
      ellipse: Object.freeze({ rx, ry, effectiveRx, effectiveRy }),
    });
  }

  const totalNaturalWidth = measureLineRawWidth(
    joinTokensOnLine(prepared.tokens, 0, prepared.tokens.length),
    fontSize,
    letterSpacing,
    fontFamily,
    fontStyle,
    measurer,
  );

  const fittingVerticalLines = Math.max(1, Math.floor((effectiveRy * 2) / lineHeightPx));
  const defaultMaxLines = Math.min(prepared.tokens.length, Math.max(prepared.paragraphCount, fittingVerticalLines + 2, 12));
  const maxLines =
    typeof options.maxLines === "number" && Number.isFinite(options.maxLines) && options.maxLines >= 1
      ? Math.min(prepared.tokens.length, Math.max(prepared.paragraphCount, Math.floor(options.maxLines)))
      : defaultMaxLines;

  const evalCtx: LineEvalContext = {
    tokens: prepared.tokens,
    fontSize,
    letterSpacing,
    fontFamily,
    fontStyle,
    opticalKerning,
    opticalMarginWeight,
    measurer,
    spanCache: new Map<number, SpanOpticalMetrics>(),
  };

  let bestPlan: SolvedLineCountPlan | null = null;
  for (let lineCount = prepared.paragraphCount; lineCount <= maxLines; lineCount += 1) {
    const plan = solveFixedLineCount(evalCtx, lineCount, effectiveRx, effectiveRy, lineHeightPx, opticalCenterY, totalNaturalWidth);
    if (plan && (!bestPlan || plan.objectiveCost < bestPlan.objectiveCost)) {
      bestPlan = plan;
    }
  }

  const chosen = bestPlan
    ?? solveFixedLineCount(evalCtx, prepared.paragraphCount, effectiveRx, effectiveRy, lineHeightPx, opticalCenterY, totalNaturalWidth)!;

  const lines: KnuthPlassBalloonLine[] = chosen.candidates.map((cand, index) => {
    const yOffsetPx = chosen.yOffsets[index]!;
    const availableWidthPx = chosen.availableWidths[index]!;
    const fillRatio = availableWidthPx > 0 ? cand.opticalWidthPx / availableWidthPx : 1;
    const xPx = rx - cand.opticalWidthPx / 2 + (cand.rightHangPx - cand.leftHangPx) * 0.5;
    return Object.freeze({
      lineIndex: index,
      text: cand.text,
      yOffsetPx: Number(yOffsetPx.toFixed(3)),
      yPx: Number((ry + yOffsetPx).toFixed(3)),
      xPx: Number(xPx.toFixed(3)),
      availableWidthPx: Number(availableWidthPx.toFixed(3)),
      measuredWidthPx: Number(cand.measuredWidthPx.toFixed(3)),
      opticalWidthPx: Number(cand.opticalWidthPx.toFixed(3)),
      kerningDeltaPx: Number(cand.kerningDeltaPx.toFixed(3)),
      opticalLeftHangPx: Number(cand.leftHangPx.toFixed(3)),
      opticalRightHangPx: Number(cand.rightHangPx.toFixed(3)),
      kerningAdjustments: cand.kerningAdjustments,
      fillRatio: Number(fillRatio.toFixed(4)),
      badness: cand.badness,
      demerits: Number(cand.demerits.toFixed(2)),
      hasWidowOrOrphan: cand.hasWidowOrOrphan,
      hasParticleBreak: cand.hasParticleBreak,
      overflowPx: Number(cand.overflowPx.toFixed(3)),
    });
  });

  const overflow = chosen.horizontalOverflow || chosen.verticalOverflow;
  return Object.freeze({
    lines: Object.freeze(lines),
    totalDemerits: Number(chosen.totalDemerits.toFixed(2)),
    diamondBalanceScore: computeDiamondBalanceScore(lines, overflow),
    widowOrOrphanCount: lines.filter((l) => l.hasWidowOrOrphan).length,
    particleBreakCount: lines.filter((l) => l.hasParticleBreak).length,
    overflow,
    verticalOverflow: chosen.verticalOverflow,
    hardBreakOccurred: prepared.hardBreakOccurred,
    cssWordBreak: "keep-all" as const,
    lineHeightPx,
    totalBlockHeightPx: Number((lines.length * lineHeightPx).toFixed(3)),
    ellipse: Object.freeze({ rx, ry, effectiveRx, effectiveRy }),
  });
}
