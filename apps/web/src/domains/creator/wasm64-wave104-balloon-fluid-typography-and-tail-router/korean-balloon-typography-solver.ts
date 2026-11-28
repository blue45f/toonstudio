/**
 * Wave 104 — 만화 말풍선 한국어 균형 조판·어절 보존·타원/다이아몬드 줄바꿈 솔버.
 *
 * - 한글·CJK 전각(1.0em), 영문·숫자 반각(0.58em), 공백·문장부호(0.35em) 결정적 폭 추정
 * - 한국어 어절(keep-all) 단위 보존 동적 계획법(DP) 균형 줄바꿈 및 외톨이 줄 제거
 * - 5종 말풍선 형태별 타원·다이아몬드 실루엣 최적화, 외곽 크기 산출, 모바일 360px 가독성 검수
 */

import { clamp, round2 } from "./balloon-geometry-primitives";

export type BalloonShapeKind =
  | "oval-dialogue"
  | "rounded-narration"
  | "scream-burst"
  | "whisper-dashed"
  | "thought-cloud";

export type BalloonSilhouetteProfile = "diamond-ellipse" | "balanced-rect" | "single-line";

export interface GlyphWidthProfile {
  readonly hangulCjkEm: number;
  readonly latinDigitEm: number;
  readonly spacePunctEm: number;
  readonly trackingEm: number;
}

export interface TextWidthOptions {
  readonly profile?: Partial<GlyphWidthProfile>;
}

export interface KoreanBalloonTypographyInput {
  readonly text: string;
  readonly shape: BalloonShapeKind;
  readonly fontSizePx: number;
  readonly maxLineWidthPx?: number;
  readonly lineHeightRatio?: number;
  readonly referenceCanvasWidthPx?: number;
  readonly mobileViewportWidthPx?: number;
  readonly minMobileFontPx?: number;
  readonly glyphProfile?: Partial<GlyphWidthProfile>;
}

export interface BalloonWrappedLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly tokens: readonly string[];
  readonly widthPx: number;
  readonly coreCharCount: number;
  readonly isOrphan: boolean;
  readonly targetWidthPx: number;
  readonly centerYOffsetPx: number;
}

export interface MobileLegibilityAudit {
  readonly referenceCanvasWidthPx: number;
  readonly mobileViewportWidthPx: number;
  readonly effectiveMobileFontPx: number;
  readonly minMobileFontPx: number;
  readonly meetsMobileLegibility: boolean;
  readonly recommendedMinFontSizePx: number;
}

export interface KoreanBalloonTypographyResult {
  readonly shape: BalloonShapeKind;
  readonly sourceText: string;
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly lines: readonly BalloonWrappedLine[];
  readonly textBlockWidthPx: number;
  readonly textBlockHeightPx: number;
  readonly balloonWidthPx: number;
  readonly balloonHeightPx: number;
  readonly innerPaddingX: number;
  readonly innerPaddingY: number;
  readonly aspectRatio: number;
  readonly orphanLineCount: number;
  readonly forcedHardBreakCount: number;
  readonly wordIntegrityPreserved: boolean;
  readonly silhouetteProfile: BalloonSilhouetteProfile;
  readonly diamondBalanceScore: number;
  readonly ragVarianceRatio: number;
  readonly mobileLegibility: MobileLegibilityAudit;
}

interface ShapeTypographySpec {
  readonly isElliptical: boolean;
  readonly padXRatio: number;
  readonly padYRatio: number;
  readonly outerMarginXRatio: number;
  readonly outerMarginYRatio: number;
  readonly idealAspectRatio: number;
  readonly idealCharsPerLineEm: number;
  readonly minWidthRatio: number;
  readonly minHeightRatio: number;
  readonly ellipseVerticalFill: number;
  readonly diamondTaperStrength: number;
}

interface TokenMeasure {
  readonly text: string;
  readonly widthPx: number;
  readonly coreCharCount: number;
}

interface LineLayoutCandidate {
  readonly lineRanges: ReadonlyArray<{ readonly start: number; readonly end: number }>;
  readonly lineWidths: readonly number[];
  readonly targetWidths: readonly number[];
  readonly dpCost: number;
  readonly orphanCount: number;
}

export const DEFAULT_GLYPH_WIDTH_PROFILE: GlyphWidthProfile = {
  hangulCjkEm: 1.0,
  latinDigitEm: 0.58,
  spacePunctEm: 0.35,
  trackingEm: 0,
};

export const DEFAULT_MOBILE_VIEWPORT_WIDTH_PX = 360;
export const DEFAULT_MIN_MOBILE_FONT_PX = 11.5;
export const DEFAULT_REFERENCE_CANVAS_WIDTH_PX = 800;

const SHAPE_SPECS: Readonly<Record<BalloonShapeKind, ShapeTypographySpec>> = {
  "oval-dialogue": {
    isElliptical: true, padXRatio: 0.9, padYRatio: 0.72, outerMarginXRatio: 0.2, outerMarginYRatio: 0.18,
    idealAspectRatio: 1.55, idealCharsPerLineEm: 9.5, minWidthRatio: 4.0, minHeightRatio: 2.5, ellipseVerticalFill: 0.73, diamondTaperStrength: 0.68,
  },
  "rounded-narration": {
    isElliptical: false, padXRatio: 0.95, padYRatio: 0.75, outerMarginXRatio: 0.1, outerMarginYRatio: 0.1,
    idealAspectRatio: 1.85, idealCharsPerLineEm: 13.0, minWidthRatio: 4.2, minHeightRatio: 2.3, ellipseVerticalFill: 1.0, diamondTaperStrength: 0,
  },
  "scream-burst": {
    isElliptical: true, padXRatio: 1.0, padYRatio: 0.8, outerMarginXRatio: 0.85, outerMarginYRatio: 0.78,
    idealAspectRatio: 1.38, idealCharsPerLineEm: 8.5, minWidthRatio: 4.8, minHeightRatio: 3.2, ellipseVerticalFill: 0.7, diamondTaperStrength: 0.7,
  },
  "whisper-dashed": {
    isElliptical: true, padXRatio: 0.88, padYRatio: 0.7, outerMarginXRatio: 0.22, outerMarginYRatio: 0.2,
    idealAspectRatio: 1.5, idealCharsPerLineEm: 9.5, minWidthRatio: 4.0, minHeightRatio: 2.5, ellipseVerticalFill: 0.74, diamondTaperStrength: 0.62,
  },
  "thought-cloud": {
    isElliptical: true, padXRatio: 0.95, padYRatio: 0.76, outerMarginXRatio: 0.62, outerMarginYRatio: 0.56,
    idealAspectRatio: 1.48, idealCharsPerLineEm: 9.0, minWidthRatio: 4.6, minHeightRatio: 3.1, ellipseVerticalFill: 0.72, diamondTaperStrength: 0.68,
  },
};

const PUNCTUATION_CHAR_SET = new Set<string>(
  Array.from(" \t\u00A0.,!?;:'\"()[]{}-_~/\\|·•…–—‘’“”「」『』〈〉《》、。！？，．：；"),
);

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveGlyphProfile(override?: Partial<GlyphWidthProfile>): GlyphWidthProfile {
  return {
    hangulCjkEm: positiveOr(override?.hangulCjkEm, DEFAULT_GLYPH_WIDTH_PROFILE.hangulCjkEm),
    latinDigitEm: positiveOr(override?.latinDigitEm, DEFAULT_GLYPH_WIDTH_PROFILE.latinDigitEm),
    spacePunctEm: positiveOr(override?.spacePunctEm, DEFAULT_GLYPH_WIDTH_PROFILE.spacePunctEm),
    trackingEm: override?.trackingEm !== undefined && Number.isFinite(override.trackingEm) ? override.trackingEm : DEFAULT_GLYPH_WIDTH_PROFILE.trackingEm,
  };
}

function isHangulOrCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xd7b0 && cp <= 0xd7ff) || (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0xff01 && cp <= 0xff60)
  );
}

function isSpaceOrPunctuationChar(ch: string): boolean {
  return PUNCTUATION_CHAR_SET.has(ch) || /\s/.test(ch);
}

/**
 * 단일 글자(코드 포인트)의 만화 식자 폭(px)을 결정적으로 계산한다.
 * - 한글·CJK 전각: 1.0em / 영문·숫자: 0.58em / 공백·문장부호: 0.35em
 */
export function measureKoreanComicCharWidthPx(
  ch: string,
  fontSizePx: number,
  options?: TextWidthOptions,
): number {
  const safeFont = positiveOr(fontSizePx, 16);
  if (ch.length === 0) return 0;
  const profile = resolveGlyphProfile(options?.profile);
  if (isSpaceOrPunctuationChar(ch)) return safeFont * profile.spacePunctEm;
  const cp = ch.codePointAt(0) ?? 0;
  return safeFont * (isHangulOrCjkCodePoint(cp) ? profile.hangulCjkEm : profile.latinDigitEm);
}

/**
 * 한국어·영문·숫자·문장부호 혼용 문자열의 총 가로 폭(px)을 결정적으로 측정한다.
 */
export function measureKoreanComicTextWidthPx(
  text: string,
  fontSizePx: number,
  options?: TextWidthOptions,
): number {
  const safeFont = positiveOr(fontSizePx, 16);
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  const profile = resolveGlyphProfile(options?.profile);
  let total = 0;
  for (let i = 0; i < chars.length; i += 1) {
    total += measureKoreanComicCharWidthPx(chars[i], safeFont, { profile });
    if (i > 0 && profile.trackingEm !== 0) total += safeFont * profile.trackingEm;
  }
  return round2(Math.max(0, total));
}

function countCoreChars(text: string): number {
  const chars = Array.from(text);
  let core = 0;
  for (let i = 0; i < chars.length; i += 1) {
    if (!isSpaceOrPunctuationChar(chars[i])) core += 1;
  }
  return core;
}

function isLineOrphan(lineText: string, totalLines: number, lineIndex: number): boolean {
  if (totalLines < 2 || lineIndex !== totalLines - 1) return false;
  const trimmed = lineText.trim();
  if (trimmed.length === 0) return false;
  const coreChars = countCoreChars(trimmed);
  return coreChars === 0 ? Array.from(trimmed).length <= 1 : coreChars <= 1;
}

function splitOversizedToken(
  token: string,
  maxLineWidthPx: number,
  fontSizePx: number,
  profile: GlyphWidthProfile,
): TokenMeasure[] {
  const chars = Array.from(token);
  const chunks: TokenMeasure[] = [];
  let current = "";
  let currentWidth = 0;
  const trackingPx = fontSizePx * profile.trackingEm;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const chWidth = measureKoreanComicCharWidthPx(ch, fontSizePx, { profile });
    const nextWidth = current.length === 0 ? chWidth : currentWidth + trackingPx + chWidth;
    if (current.length > 0 && nextWidth > maxLineWidthPx) {
      chunks.push({ text: current, widthPx: round2(currentWidth), coreCharCount: countCoreChars(current) });
      current = ch;
      currentWidth = chWidth;
    } else {
      current += ch;
      currentWidth = nextWidth;
    }
  }
  if (current.length > 0) {
    chunks.push({ text: current, widthPx: round2(currentWidth), coreCharCount: countCoreChars(current) });
  }
  return chunks;
}

function tokenizeKoreanEojeol(
  sourceText: string,
  maxLineWidthPx: number,
  fontSizePx: number,
  profile: GlyphWidthProfile,
): { readonly tokens: readonly TokenMeasure[]; readonly forcedHardBreakCount: number } {
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return { tokens: [], forcedHardBreakCount: 0 };

  const rawTokens = normalized.split(/\s+/).filter((piece) => piece.length > 0);
  const tokens: TokenMeasure[] = [];
  let forcedHardBreakCount = 0;

  for (let i = 0; i < rawTokens.length; i += 1) {
    const raw = rawTokens[i];
    const widthPx = measureKoreanComicTextWidthPx(raw, fontSizePx, { profile });
    if (widthPx > maxLineWidthPx && Array.from(raw).length > 1) {
      const splitChunks = splitOversizedToken(raw, maxLineWidthPx, fontSizePx, profile);
      forcedHardBreakCount += Math.max(0, splitChunks.length - 1);
      tokens.push(...splitChunks);
    } else {
      tokens.push({ text: raw, widthPx, coreCharCount: countCoreChars(raw) });
    }
  }
  return { tokens, forcedHardBreakCount };
}

function buildPrefixWidths(tokens: readonly TokenMeasure[], spaceWidthPx: number): readonly number[] {
  const prefix: number[] = new Array<number>(tokens.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    prefix[i + 1] = prefix[i] + (i > 0 ? spaceWidthPx : 0) + tokens[i].widthPx;
  }
  return prefix;
}

function rangeWidthPx(prefix: readonly number[], spaceW: number, start: number, end: number): number {
  if (end <= start) return 0;
  return prefix[end] - prefix[start] - (start > 0 ? spaceW : 0);
}

function rangeCoreChars(tokens: readonly TokenMeasure[], start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i += 1) total += tokens[i].coreCharCount;
  return total;
}

function computeTargetWidths(
  lineCount: number,
  totalTokenWidth: number,
  tokenCount: number,
  spaceWidthPx: number,
  maxLineWidthPx: number,
  spec: ShapeTypographySpec,
): readonly number[] {
  const netWidth = Math.max(1, totalTokenWidth + Math.max(0, tokenCount - lineCount) * spaceWidthPx);
  if (lineCount <= 1) return [Math.min(maxLineWidthPx, netWidth)];

  const weights: number[] = [];
  let weightSum = 0;
  for (let r = 0; r < lineCount; r += 1) {
    let w = 1;
    if (spec.isElliptical && lineCount >= 3) {
      const u = (r - (lineCount - 1) / 2) / ((lineCount - 1) / 2);
      const t = spec.diamondTaperStrength * u;
      w = Math.sqrt(Math.max(0.2, 1 - t * t));
    }
    weights.push(w);
    weightSum += w;
  }
  return weights.map((w) => Math.min(maxLineWidthPx, (netWidth * w) / weightSum));
}

function solveBalancedWrapForLineCount(
  tokens: readonly TokenMeasure[],
  prefix: readonly number[],
  spaceWidthPx: number,
  maxLineWidthPx: number,
  lineCount: number,
  spec: ShapeTypographySpec,
): LineLayoutCandidate | null {
  const n = tokens.length;
  if (lineCount < 1 || lineCount > n) return null;

  const totalTokenWidth = tokens.reduce((acc, item) => acc + item.widthPx, 0);
  const targetWidths = computeTargetWidths(lineCount, totalTokenWidth, n, spaceWidthPx, maxLineWidthPx, spec);
  const refWidth = Math.max(1, maxLineWidthPx);
  const inf = 1e15;

  const dp: number[][] = Array.from({ length: lineCount + 1 }, () => new Array<number>(n + 1).fill(inf));
  const prevIdx: number[][] = Array.from({ length: lineCount + 1 }, () => new Array<number>(n + 1).fill(-1));
  dp[0][0] = 0;

  for (let r = 0; r < lineCount; r += 1) {
    const target = targetWidths[r];
    const maxEnd = n - (lineCount - 1 - r);
    for (let end = r + 1; end <= maxEnd; end += 1) {
      let bestCost = inf;
      let bestStart = -1;
      for (let start = r; start < end; start += 1) {
        const prevCost = dp[r][start];
        if (prevCost >= inf * 0.5) continue;

        const width = rangeWidthPx(prefix, spaceWidthPx, start, end);
        const allowSingleOverflow = end - start === 1 && tokens[start].widthPx > maxLineWidthPx;
        if (!allowSingleOverflow && width > maxLineWidthPx + 0.01) continue;

        const diffRatio = (width - target) / refWidth;
        let linePenalty = diffRatio * diffRatio * 120;

        if (spec.isElliptical && lineCount >= 3) {
          const isEdge = r === 0 || r === lineCount - 1;
          if (isEdge && width > target * 1.12) {
            const excess = (width - target * 1.12) / refWidth;
            linePenalty += excess * excess * 420;
          }
          if (!isEdge && width < target * 0.92) {
            const deficit = (target * 0.92 - width) / refWidth;
            linePenalty += deficit * deficit * 480;
          }
        }

        const coreChars = rangeCoreChars(tokens, start, end);
        const singlePunct = coreChars === 0 && end - start === 1 && Array.from(tokens[start].text).length <= 1;
        if (lineCount >= 2 && r === lineCount - 1 && (coreChars <= 1 || singlePunct)) {
          linePenalty += 50_000;
        } else if (lineCount >= 2 && r === 0 && coreChars <= 1) {
          linePenalty += 650;
        }

        if (r > 0 && prevIdx[r][start] >= 0) {
          const prevW = rangeWidthPx(prefix, spaceWidthPx, prevIdx[r][start], start);
          if (spec.isElliptical && lineCount >= 3) {
            const mid = (lineCount - 1) / 2;
            if (r <= mid && width < prevW) {
              const drop = (prevW - width) / refWidth;
              linePenalty += 60 + drop * drop * 520;
            } else if (r > mid && width > prevW) {
              const bulge = (width - prevW) / refWidth;
              linePenalty += 60 + bulge * bulge * 520;
            }
          } else {
            const stepRatio = Math.abs(width - prevW) / refWidth;
            linePenalty += stepRatio * stepRatio * 40;
          }
        }

        if (prevCost + linePenalty < bestCost) {
          bestCost = prevCost + linePenalty;
          bestStart = start;
        }
      }
      dp[r + 1][end] = bestCost;
      prevIdx[r + 1][end] = bestStart;
    }
  }

  if (dp[lineCount][n] >= inf * 0.5) return null;

  const lineRanges: Array<{ readonly start: number; readonly end: number }> = new Array(lineCount);
  let cursor = n;
  for (let r = lineCount; r >= 1; r -= 1) {
    const start = prevIdx[r][cursor];
    if (start < 0) return null;
    lineRanges[r - 1] = { start, end: cursor };
    cursor = start;
  }

  const lineWidths = lineRanges.map((rg) => round2(rangeWidthPx(prefix, spaceWidthPx, rg.start, rg.end)));
  let orphanCount = 0;
  for (let r = 0; r < lineCount; r += 1) {
    const lineStr = tokens.slice(lineRanges[r].start, lineRanges[r].end).map((t) => t.text).join(" ");
    if (isLineOrphan(lineStr, lineCount, r)) orphanCount += 1;
  }

  return {
    lineRanges,
    lineWidths,
    targetWidths: targetWidths.map((w) => round2(w)),
    dpCost: dp[lineCount][n],
    orphanCount,
  };
}

function computeEnclosingBalloonMetrics(
  lineWidths: readonly number[],
  lineHeightPx: number,
  fontSizePx: number,
  spec: ShapeTypographySpec,
) {
  const padX = round2(fontSizePx * spec.padXRatio);
  const padY = round2(fontSizePx * spec.padYRatio);
  const outerMarginX = round2(fontSizePx * spec.outerMarginXRatio);
  const outerMarginY = round2(fontSizePx * spec.outerMarginYRatio);
  const minW = fontSizePx * spec.minWidthRatio;
  const minH = fontSizePx * spec.minHeightRatio;

  if (lineWidths.length === 0) {
    return {
      textBlockWidthPx: 0,
      textBlockHeightPx: 0,
      balloonWidthPx: round2(minW + outerMarginX * 2),
      balloonHeightPx: round2(minH + outerMarginY * 2),
      innerPaddingX: padX,
      innerPaddingY: padY,
      centerYOffsets: [] as readonly number[],
    };
  }

  const maxLineW = Math.max(...lineWidths);
  const textBlockHeight = lineWidths.length * lineHeightPx;
  const centerYOffsets = lineWidths.map((_, idx) => round2((idx - (lineWidths.length - 1) / 2) * lineHeightPx));

  if (!spec.isElliptical) {
    return {
      textBlockWidthPx: round2(maxLineW),
      textBlockHeightPx: round2(textBlockHeight),
      balloonWidthPx: round2(Math.max(minW, maxLineW + padX * 2) + outerMarginX * 2),
      balloonHeightPx: round2(Math.max(minH, textBlockHeight + padY * 2) + outerMarginY * 2),
      innerPaddingX: padX,
      innerPaddingY: padY,
      centerYOffsets,
    };
  }

  const semiB = Math.max(minH * 0.5, textBlockHeight * 0.5 + padY, textBlockHeight / (2 * spec.ellipseVerticalFill));
  let requiredSemiA = Math.max(minW * 0.5, maxLineW * 0.5 + padX);
  for (let i = 0; i < lineWidths.length; i += 1) {
    const halfW = lineWidths[i] * 0.5 + padX * 0.72;
    const worstY = Math.min(
      semiB * 0.9,
      Math.max(Math.abs(centerYOffsets[i] - lineHeightPx * 0.42), Math.abs(centerYOffsets[i] + lineHeightPx * 0.42)),
    );
    const cosFactor = Math.sqrt(Math.max(0.18, 1 - (worstY / semiB) * (worstY / semiB)));
    requiredSemiA = Math.max(requiredSemiA, halfW / cosFactor);
  }

  return {
    textBlockWidthPx: round2(maxLineW),
    textBlockHeightPx: round2(textBlockHeight),
    balloonWidthPx: round2(requiredSemiA * 2 + outerMarginX * 2),
    balloonHeightPx: round2(semiB * 2 + outerMarginY * 2),
    innerPaddingX: padX,
    innerPaddingY: padY,
    centerYOffsets,
  };
}

function computeDiamondBalanceScore(
  lineWidths: readonly number[],
  targetWidths: readonly number[],
  spec: ShapeTypographySpec,
): number {
  if (lineWidths.length <= 1) return 1;
  const maxW = Math.max(1, ...lineWidths);
  let relErrorSum = 0;
  for (let i = 0; i < lineWidths.length; i += 1) {
    relErrorSum += Math.abs(lineWidths[i] - targetWidths[i]) / maxW;
  }
  let score = clamp(1 - (relErrorSum / lineWidths.length) * 1.15, 0, 1);
  if (spec.isElliptical && lineWidths.length >= 3) {
    const centerW = lineWidths[Math.floor(lineWidths.length / 2)];
    const edgeMax = Math.max(lineWidths[0], lineWidths[lineWidths.length - 1]);
    score = centerW >= edgeMax
      ? clamp(score + 0.12, 0, 1)
      : clamp(score - ((edgeMax - centerW) / maxW) * 0.75, 0, 1);
  }
  return round2(score);
}

function computeRagVarianceRatio(lineWidths: readonly number[]): number {
  if (lineWidths.length <= 1) return 0;
  const mean = lineWidths.reduce((sum, w) => sum + w, 0) / lineWidths.length;
  if (mean <= 0) return 0;
  const variance = lineWidths.reduce((acc, w) => acc + (w - mean) * (w - mean), 0) / lineWidths.length;
  return round2(clamp(Math.sqrt(variance) / mean, 0, 1));
}

function auditMobileLegibility(
  fontSizePx: number,
  referenceCanvasWidthPx: number,
  mobileViewportWidthPx: number,
  minMobileFontPx: number,
): MobileLegibilityAudit {
  const safeCanvas = positiveOr(referenceCanvasWidthPx, DEFAULT_REFERENCE_CANVAS_WIDTH_PX);
  const safeMobile = positiveOr(mobileViewportWidthPx, DEFAULT_MOBILE_VIEWPORT_WIDTH_PX);
  const safeMin = positiveOr(minMobileFontPx, DEFAULT_MIN_MOBILE_FONT_PX);
  const effective = round2((fontSizePx * safeMobile) / safeCanvas);
  const recommended = Math.ceil(((safeMin * safeCanvas) / safeMobile) * 2) / 2;
  return {
    referenceCanvasWidthPx: round2(safeCanvas),
    mobileViewportWidthPx: round2(safeMobile),
    effectiveMobileFontPx: effective,
    minMobileFontPx: round2(safeMin),
    meetsMobileLegibility: effective + 1e-6 >= safeMin,
    recommendedMinFontSizePx: round2(recommended),
  };
}

/**
 * 한국어 만화 말풍선 균형 조판 솔버.
 *
 * - 한국어 어절(keep-all)을 보존하며 동적 계획법으로 최적 줄 수와 줄바꿈 지점을 탐색한다.
 * - 타원·구름·외침 말풍선은 가운데 줄이 넓고 위·아래 줄이 좁아지는 다이아몬드 실루엣을 우선한다.
 * - 마지막 줄 외톨이 글자(1자 이하)를 제거하고, 360px 모바일 가독성 검수 결과를 함께 반환한다.
 */
export function solveKoreanBalloonTypography(
  input: KoreanBalloonTypographyInput,
): KoreanBalloonTypographyResult {
  const safeFont = positiveOr(input.fontSizePx, 16);
  const lineHeightRatio =
    input.lineHeightRatio !== undefined && Number.isFinite(input.lineHeightRatio) && input.lineHeightRatio >= 1.05
      ? input.lineHeightRatio
      : 1.38;
  const lineHeightPx = round2(safeFont * lineHeightRatio);
  const spec = SHAPE_SPECS[input.shape];
  const profile = resolveGlyphProfile(input.glyphProfile);
  const spaceWidthPx = measureKoreanComicCharWidthPx(" ", safeFont, { profile });
  const maxLineWidthPx = Math.max(
    safeFont * 1.1,
    positiveOr(input.maxLineWidthPx, safeFont * spec.idealCharsPerLineEm * 1.35),
  );

  const mobileLegibility = auditMobileLegibility(
    safeFont,
    input.referenceCanvasWidthPx ?? DEFAULT_REFERENCE_CANVAS_WIDTH_PX,
    input.mobileViewportWidthPx ?? DEFAULT_MOBILE_VIEWPORT_WIDTH_PX,
    input.minMobileFontPx ?? DEFAULT_MIN_MOBILE_FONT_PX,
  );

  const { tokens, forcedHardBreakCount } = tokenizeKoreanEojeol(input.text, maxLineWidthPx, safeFont, profile);

  if (tokens.length === 0) {
    const m = computeEnclosingBalloonMetrics([], lineHeightPx, safeFont, spec);
    return {
      shape: input.shape, sourceText: input.text, fontSizePx: round2(safeFont), lineHeightPx,
      lines: [], textBlockWidthPx: 0, textBlockHeightPx: 0,
      balloonWidthPx: m.balloonWidthPx, balloonHeightPx: m.balloonHeightPx,
      innerPaddingX: m.innerPaddingX, innerPaddingY: m.innerPaddingY,
      aspectRatio: round2(m.balloonWidthPx / Math.max(1, m.balloonHeightPx)),
      orphanLineCount: 0, forcedHardBreakCount: 0, wordIntegrityPreserved: true,
      silhouetteProfile: "single-line", diamondBalanceScore: 1, ragVarianceRatio: 0, mobileLegibility,
    };
  }

  const prefix = buildPrefixWidths(tokens, spaceWidthPx);
  const totalSingleLineWidth = rangeWidthPx(prefix, spaceWidthPx, 0, tokens.length);
  const minFeasibleLines = Math.max(1, Math.ceil(totalSingleLineWidth / maxLineWidthPx));
  const maxCandidateLines = Math.min(tokens.length, Math.max(minFeasibleLines + 3, 8));

  let bestCandidate: LineLayoutCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let lineCount = 1; lineCount <= maxCandidateLines; lineCount += 1) {
    const candidate = solveBalancedWrapForLineCount(tokens, prefix, spaceWidthPx, maxLineWidthPx, lineCount, spec);
    if (candidate === null) continue;

    const metrics = computeEnclosingBalloonMetrics(candidate.lineWidths, lineHeightPx, safeFont, spec);
    const aspectError = Math.log(metrics.balloonWidthPx / Math.max(1, metrics.balloonHeightPx) / spec.idealAspectRatio);
    const shortSingleBonus = lineCount === 1 && totalSingleLineWidth <= safeFont * 6.8 ? -45 : 0;

    let diamondBonus = 0;
    if (spec.isElliptical && lineCount >= 3) {
      const centerW = candidate.lineWidths[Math.floor(lineCount / 2)];
      diamondBonus = centerW >= candidate.lineWidths[0] && centerW >= candidate.lineWidths[lineCount - 1] ? -32 : 110;
    }

    const totalScore = candidate.orphanCount * 60_000 + candidate.dpCost + aspectError * aspectError * 95 + shortSingleBonus + diamondBonus;
    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestCandidate = candidate;
    }
  }

  const finalCandidate: LineLayoutCandidate = bestCandidate ?? {
    lineRanges: tokens.map((_, idx) => ({ start: idx, end: idx + 1 })),
    lineWidths: tokens.map((t) => t.widthPx),
    targetWidths: tokens.map((t) => t.widthPx),
    dpCost: 0,
    orphanCount: isLineOrphan(tokens[tokens.length - 1].text, tokens.length, tokens.length - 1) ? 1 : 0,
  };

  const finalMetrics = computeEnclosingBalloonMetrics(finalCandidate.lineWidths, lineHeightPx, safeFont, spec);
  const lines: BalloonWrappedLine[] = finalCandidate.lineRanges.map((rg, lineIndex) => {
    const lineTokens = tokens.slice(rg.start, rg.end).map((t) => t.text);
    const text = lineTokens.join(" ");
    return {
      lineIndex,
      text,
      tokens: lineTokens,
      widthPx: finalCandidate.lineWidths[lineIndex],
      coreCharCount: countCoreChars(text),
      isOrphan: isLineOrphan(text, finalCandidate.lineRanges.length, lineIndex),
      targetWidthPx: finalCandidate.targetWidths[lineIndex],
      centerYOffsetPx: finalMetrics.centerYOffsets[lineIndex],
    };
  });

  return {
    shape: input.shape, sourceText: input.text, fontSizePx: round2(safeFont), lineHeightPx, lines,
    textBlockWidthPx: finalMetrics.textBlockWidthPx, textBlockHeightPx: finalMetrics.textBlockHeightPx,
    balloonWidthPx: finalMetrics.balloonWidthPx, balloonHeightPx: finalMetrics.balloonHeightPx,
    innerPaddingX: finalMetrics.innerPaddingX, innerPaddingY: finalMetrics.innerPaddingY,
    aspectRatio: round2(finalMetrics.balloonWidthPx / Math.max(1, finalMetrics.balloonHeightPx)),
    orphanLineCount: lines.filter((line) => line.isOrphan).length,
    forcedHardBreakCount, wordIntegrityPreserved: forcedHardBreakCount === 0,
    silhouetteProfile: lines.length <= 1 ? "single-line" : spec.isElliptical ? "diamond-ellipse" : "balanced-rect",
    diamondBalanceScore: computeDiamondBalanceScore(finalCandidate.lineWidths, finalCandidate.targetWidths, spec),
    ragVarianceRatio: computeRagVarianceRatio(finalCandidate.lineWidths),
    mobileLegibility,
  };
}
