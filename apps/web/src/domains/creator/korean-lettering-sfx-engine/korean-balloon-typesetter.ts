/**
 * 한국어 웹툰 현장용 어절 단위(`word-break: keep-all`) 광학 말풍선 자동 조판 ·
 * 일본어/고전 세로쓰기(`vertical-rl`) · 독자 가독 시간 산출 엔진 (Wave 41B).
 *
 * - 5종 말풍선(`oval`·`burst`·`whisper`·`thought`·`caption`) 내접 폭 곡선(`sqrt(1 - y^2)`) 기반 다이아몬드 균형 조판
 * - 동적 계획법(DP) + 후처리 재균형으로 외톨이 1글자 행(orphan/widow) 자동 방지
 * - 세로쓰기(`vertical-rl`) 우→좌 열 배치, 세로 문장부호 치환, 세로중가로(`!?`/`!!`) 계산
 * - 100% 온디바이스 결정론 연산 (브라우저 스토리지 및 비결정 난수 미사용)
 */

export type BalloonShapeId = "oval" | "burst" | "whisper" | "thought" | "caption";
export type BalloonWritingMode = "horizontal-tb" | "vertical-rl";
export type ReadingDensityGrade = "crisp" | "balanced" | "dense" | "overcrowded";

export interface BalloonShapeSpec {
  readonly id: BalloonShapeId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly innerPaddingRatio: number; readonly opticalCenterOffsetRatio: number;
  readonly defaultFontScale: number; readonly readingSpeedMultiplier: number;
  readonly curvedProfile: boolean; readonly dashedOutline: boolean;
  readonly hasTail: boolean; readonly hasThoughtDots: boolean;
}

export interface BalloonTypesetOptions {
  readonly shape?: BalloonShapeId; readonly writingMode?: BalloonWritingMode;
  readonly balloonWidthPx?: number; readonly balloonHeightPx?: number;
  readonly fontSizePx?: number; readonly lineHeightRatio?: number;
  readonly letterSpacingEm?: number; readonly preventOrphans?: boolean;
  readonly tailSide?: "left" | "right" | "none";
}

export interface TypesetBalloonLine {
  readonly index: number; readonly text: string; readonly eojeols: readonly string[];
  readonly glyphCount: number; readonly opticalWidthEm: number; readonly maxAllowedWidthEm: number;
  readonly inscribedWidthFactor: number; readonly normalizedY: number; readonly fillRatio: number;
  readonly xPx: number; readonly yPx: number; readonly isOrphan: boolean;
}

export interface VerticalGlyphPlacement {
  readonly index: number; readonly sourceChar: string; readonly displayChar: string;
  readonly xPx: number; readonly yPx: number; readonly rotateDeg: number; readonly tateChuYoko: boolean;
}

export interface VerticalBalloonColumn {
  readonly columnIndex: number; readonly text: string; readonly glyphCount: number;
  readonly normalizedX: number; readonly inscribedHeightFactor: number;
  readonly xPx: number; readonly topYPx: number; readonly columnHeightPx: number;
  readonly glyphs: readonly VerticalGlyphPlacement[];
}

export interface InscribedCurveGuide {
  readonly normalizedAxis: number; readonly factor: number;
  readonly x1Px: number; readonly y1Px: number; readonly x2Px: number; readonly y2Px: number;
}

export interface ThoughtBubbleDot { readonly cx: number; readonly cy: number; readonly r: number; }

export interface BalloonReadingTimeReport {
  readonly readingTimeSec: number; readonly recommendedCutHoldSec: number;
  readonly charsPerSecond: number; readonly visibleGlyphCount: number;
  readonly eojeolCount: number; readonly densityGrade: ReadingDensityGrade;
}

export interface KoreanBalloonTypesetResult {
  readonly text: string; readonly shape: BalloonShapeId; readonly shapeSpec: BalloonShapeSpec;
  readonly writingMode: BalloonWritingMode; readonly cssWordBreak: "keep-all";
  readonly balloonWidthPx: number; readonly balloonHeightPx: number;
  readonly fontSizePx: number; readonly lineHeightPx: number;
  readonly innerPaddingRatio: number; readonly opticalCenterOffsetRatio: number;
  readonly opticalCenterXPx: number; readonly opticalCenterYPx: number;
  readonly lines: readonly TypesetBalloonLine[]; readonly verticalColumns: readonly VerticalBalloonColumn[];
  readonly diamondBalanceScore: number; readonly orphanLineCount: number;
  readonly orphanGuardApplied: boolean; readonly eojeolPreserved: boolean; readonly maxOverflowRatio: number;
  readonly readingTime: BalloonReadingTimeReport;
  readonly balloonOutlinePath: string; readonly tailPath: string;
  readonly thoughtDots: readonly ThoughtBubbleDot[]; readonly inscribedCurveGuides: readonly InscribedCurveGuide[];
}

export interface BalloonDialoguePreset {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly shape: BalloonShapeId; readonly writingMode: BalloonWritingMode;
  readonly text: string; readonly balloonWidthPx: number; readonly fontSizePx: number;
}

export const BALLOON_SHAPE_IDS: readonly BalloonShapeId[] = ["oval", "burst", "whisper", "thought", "caption"];

export const BALLOON_SHAPE_SPECS: Readonly<Record<BalloonShapeId, BalloonShapeSpec>> = {
  oval: {
    id: "oval", labelKo: "타원형 대사", labelEn: "Oval Dialogue",
    summaryKo: "표준 타원 내접 곡선(sqrt(1-y²))으로 중앙 행을 넓히고 상하 여백을 조율합니다.",
    summaryEn: "Classic ellipse curve sqrt(1-y²) widens middle lines for balanced dialogue.",
    innerPaddingRatio: 0.2, opticalCenterOffsetRatio: -0.03, defaultFontScale: 1,
    readingSpeedMultiplier: 1, curvedProfile: true, dashedOutline: false, hasTail: true, hasThoughtDots: false,
  },
  burst: {
    id: "burst", labelKo: "폭발형 외침", labelEn: "Burst Shout",
    summaryKo: "톱니 안쪽 안전 영역을 확보하고 중앙 타격 행에 시선을 집중시킵니다.",
    summaryEn: "Clears inner spike valleys and concentrates mass on the central punch line.",
    innerPaddingRatio: 0.24, opticalCenterOffsetRatio: -0.025, defaultFontScale: 1.08,
    readingSpeedMultiplier: 0.88, curvedProfile: true, dashedOutline: false, hasTail: true, hasThoughtDots: false,
  },
  whisper: {
    id: "whisper", labelKo: "속삭임 점선", labelEn: "Whisper Dashed",
    summaryKo: "점선 테두리와 넉넉한 내곽 여백으로 작고 은밀한 호흡을 표현합니다.",
    summaryEn: "Dashed contour with generous inner breathing room for hushed dialogue.",
    innerPaddingRatio: 0.22, opticalCenterOffsetRatio: -0.03, defaultFontScale: 0.88,
    readingSpeedMultiplier: 1.14, curvedProfile: true, dashedOutline: true, hasTail: true, hasThoughtDots: false,
  },
  thought: {
    id: "thought", labelKo: "독백 구름", labelEn: "Thought Cloud",
    summaryKo: "구름 굴곡 안쪽에 둥글게 수렴하는 내접 폭 곡선과 꼬리 방울을 배치합니다.",
    summaryEn: "Softly tapers lines inside scalloped cloud curves with trailing thought dots.",
    innerPaddingRatio: 0.23, opticalCenterOffsetRatio: -0.03, defaultFontScale: 0.94,
    readingSpeedMultiplier: 1.16, curvedProfile: true, dashedOutline: false, hasTail: false, hasThoughtDots: true,
  },
  caption: {
    id: "caption", labelKo: "사각 나레이션", labelEn: "Caption Box",
    summaryKo: "직사각형 해설 박스에 균일한 행폭과 절제된 상하 광학 여백을 유지합니다.",
    summaryEn: "Uniform line measure inside a crisp narration box with subtle optical framing.",
    innerPaddingRatio: 0.16, opticalCenterOffsetRatio: -0.015, defaultFontScale: 0.96,
    readingSpeedMultiplier: 1.08, curvedProfile: false, dashedOutline: false, hasTail: false, hasThoughtDots: false,
  },
};

export const DEFAULT_BALLOON_PRESETS: readonly BalloonDialoguePreset[] = [
  { id: "oval-rooftop", labelKo: "타원 · 감정 대사", labelEn: "Oval · Drama", shape: "oval", writingMode: "horizontal-tb", balloonWidthPx: 264, fontSizePx: 16, text: "비 그치기 전에 옥상에서 꼭 끝내야 해, 이번엔 절대 물러서지 않을 거야." },
  { id: "burst-climax", labelKo: "폭발 · 클라이맥스", labelEn: "Burst · Climax", shape: "burst", writingMode: "horizontal-tb", balloonWidthPx: 276, fontSizePx: 17, text: "지금이야! 방어막이 갈라진 틈으로 한 번에 돌파해!" },
  { id: "whisper-secret", labelKo: "속삭임 · 비밀", labelEn: "Whisper · Secret", shape: "whisper", writingMode: "horizontal-tb", balloonWidthPx: 256, fontSizePx: 15, text: "아무도 듣지 못하게 조용히 말해… 열쇠는 이미 바뀌었어." },
  { id: "thought-monologue", labelKo: "독백 · 심리", labelEn: "Thought · Inner", shape: "thought", writingMode: "horizontal-tb", balloonWidthPx: 270, fontSizePx: 15, text: "이상하다. 어제까지 분명히 이 골목 끝에는 가로등이 켜져 있었는데…" },
  { id: "caption-narration", labelKo: "사각 · 나레이션", labelEn: "Caption · Narration", shape: "caption", writingMode: "horizontal-tb", balloonWidthPx: 280, fontSizePx: 15, text: "그날 새벽 서울역 플랫폼에 내린 첫 비는 오래된 약속을 다시 깨웠다." },
  { id: "vertical-classic", labelKo: "세로쓰기 · 고전/일어", labelEn: "Vertical-RL · Classic", shape: "oval", writingMode: "vertical-rl", balloonWidthPx: 210, fontSizePx: 16, text: "「그 검을 뽑는 순간… 모든 인연이 바뀐다!!」" },
];

const VERTICAL_PUNCTUATION_MAP: Readonly<Record<string, string>> = {
  "…": "︙", "—": "︱", "–": "︲", "-": "︱", "~": "⌇", "〜": "⌇",
  "(": "︵", ")": "︶", "「": "﹁", "」": "﹂", "『": "﹃", "』": "﹄",
  "【": "︻", "】": "︼", "[": "﹇", "]": "﹈",
};
const TATE_CHU_YOKO_PAIRS = new Set(["!!", "!?", "?!", "??"]);
const CLOSING_PUNCTUATION_RE = /^[.,!?…~”’"'」』】)\]]+$/u;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFullWidthCodePoint(code: number): boolean {
  return (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0x3000 && code <= 0x303f)
  );
}

/** 개별 문자의 광학 폭(em 단위)을 계산한다. */
export function measureOpticalCharWidthEm(ch: string): number {
  if (ch === " " || ch === "\t") return 0.34;
  if (ch === "…" || ch === "—") return 0.92;
  if (ch === "." || ch === "," || ch === "!" || ch === "?" || ch === ":" || ch === ";" || ch === "'" || ch === "\"") {
    return 0.38;
  }
  const code = ch.codePointAt(0) ?? 0;
  if (isFullWidthCodePoint(code)) return 1.0;
  if (code >= 0x41 && code <= 0x5a) return 0.64;
  if (code >= 0x30 && code <= 0x39) return 0.58;
  return 0.54;
}

/** 문자열의 광학 폭(em)을 자간까지 반영해 계산한다. */
export function measureOpticalTextWidthEm(text: string, letterSpacingEm = 0.02): number {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  let width = 0;
  for (let i = 0; i < chars.length; i += 1) {
    width += measureOpticalCharWidthEm(chars[i] ?? "");
    if (i < chars.length - 1) width += letterSpacingEm;
  }
  return round2(width);
}

/** 공백을 제외한 가시 글자 수를 반환한다. */
export function countVisibleGlyphs(text: string): number {
  let count = 0;
  for (const ch of Array.from(text)) {
    if (!/\s/u.test(ch)) count += 1;
  }
  return count;
}

/** 말풍선 도형별 내접 폭 곡선 `sqrt(1 - y^2)` 계수를 계산한다(중심 0, 양끝 ±1). */
export function evaluateInscribedWidthFactor(shape: BalloonShapeId, normalizedAxis: number): number {
  const axis = clamp(normalizedAxis, -0.94, 0.94);
  const y2 = axis * axis;
  const circleCore = Math.sqrt(Math.max(0.08, 1 - y2));

  switch (shape) {
    case "oval":
      return round2(circleCore);
    case "burst":
      return round2(clamp(circleCore * (0.92 - 0.14 * y2), 0.28, 0.96));
    case "whisper":
      return round2(clamp(Math.sqrt(Math.max(0.12, 1 - (axis * 0.92) ** 2)) * 0.96, 0.32, 0.96));
    case "thought":
      return round2(clamp(Math.sqrt(Math.max(0.1, 1 - (axis * 0.95) ** 2)) * 0.93, 0.3, 0.93));
    case "caption":
      return round2(clamp(1 - 0.04 * y2, 0.94, 1));
  }
}

interface ParagraphTokens {
  readonly eojeols: readonly string[];
  readonly emergencySplitUsed: boolean;
}

/** 한국어 어절(`word-break: keep-all`)을 분리하고 금칙 문장부호를 직전 어절에 결합한다. */
export function tokenizeKoreanEojeol(text: string, maxEmergencyTokenEm = 18): readonly ParagraphTokens[] {
  const normalized = text.replaceAll("\r\n", "\n").trim();
  if (!normalized) return [];

  return normalized
    .split("\n")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((paragraph) => {
      const merged: string[] = [];
      for (const part of paragraph.split(/\s+/u).filter(Boolean)) {
        if (CLOSING_PUNCTUATION_RE.test(part) && merged.length > 0) {
          const lastIdx = merged.length - 1;
          merged[lastIdx] = `${merged[lastIdx] ?? ""}${part}`;
        } else {
          merged.push(part);
        }
      }

      let emergencySplitUsed = false;
      const finalTokens: string[] = [];
      for (const token of merged) {
        if (measureOpticalTextWidthEm(token) <= maxEmergencyTokenEm) {
          finalTokens.push(token);
          continue;
        }
        emergencySplitUsed = true;
        let buffer = "";
        for (const ch of Array.from(token)) {
          const next = `${buffer}${ch}`;
          if (buffer.length > 0 && measureOpticalTextWidthEm(next) > maxEmergencyTokenEm * 0.85) {
            finalTokens.push(buffer);
            buffer = ch;
          } else {
            buffer = next;
          }
        }
        if (buffer) finalTokens.push(buffer);
      }

      return { eojeols: finalTokens, emergencySplitUsed };
    });
}

function isOrphanLineText(text: string): boolean {
  const stripped = text.replace(/[\s.,!?…~”’"'」』】()[\]]/gu, "");
  return countVisibleGlyphs(text) <= 1 || stripped.length <= 1;
}

interface CandidateLinePartition {
  readonly groups: readonly (readonly string[])[];
  readonly cost: number;
}

function solveDiamondPartitionForLineCount(
  eojeols: readonly string[],
  lineCount: number,
  shape: BalloonShapeId,
  centerSafeWidthEm: number,
  letterSpacingEm: number,
  preventOrphans: boolean,
): CandidateLinePartition | null {
  const n = eojeols.length;
  if (lineCount < 1 || lineCount > n) return null;

  const curved = BALLOON_SHAPE_SPECS[shape].curvedProfile;
  const verticalSpan = lineCount === 1 ? 0 : lineCount === 2 ? 0.48 : 0.78;
  const curveFactors: number[] = [];
  const maxAllowedByLine: number[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    const normalizedY = lineCount === 1 ? 0 : ((i + 0.5) / lineCount - 0.5) * 2 * verticalSpan;
    const factor = evaluateInscribedWidthFactor(shape, normalizedY);
    curveFactors.push(factor);
    maxAllowedByLine.push(Math.max(3.2, centerSafeWidthEm * factor));
  }

  const totalTextEm = measureOpticalTextWidthEm(eojeols.join(" "), letterSpacingEm);
  const sumFactors = curveFactors.reduce((acc, f) => acc + f, 0) || 1;
  const targetWidthByLine = curveFactors.map((factor, idx) =>
    Math.min(maxAllowedByLine[idx] ?? centerSafeWidthEm, Math.max(2.6, (totalTextEm / sumFactors) * factor)),
  );

  const spanWidth: number[][] = Array.from({ length: n }, () => Array<number>(n + 1).fill(0));
  const spanOrphan: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n + 1).fill(false));
  for (let start = 0; start < n; start += 1) {
    let acc = "";
    for (let end = start + 1; end <= n; end += 1) {
      const token = eojeols[end - 1] ?? "";
      acc = start === end - 1 ? token : `${acc} ${token}`;
      const rowW = spanWidth[start];
      const rowO = spanOrphan[start];
      if (rowW) rowW[end] = measureOpticalTextWidthEm(acc, letterSpacingEm);
      if (rowO) rowO[end] = isOrphanLineText(acc);
    }
  }

  const INF = 1e12;
  const dp: number[][] = Array.from({ length: lineCount + 1 }, () => Array<number>(n + 1).fill(INF));
  const prevIdx: number[][] = Array.from({ length: lineCount + 1 }, () => Array<number>(n + 1).fill(-1));
  const row0 = dp[0];
  if (row0) row0[0] = 0;

  for (let line = 1; line <= lineCount; line += 1) {
    const maxSafe = maxAllowedByLine[line - 1] ?? centerSafeWidthEm;
    const target = targetWidthByLine[line - 1] ?? maxSafe * 0.85;
    const isEdgeLine = lineCount >= 2 && (line === 1 || line === lineCount);
    const prevRow = dp[line - 1];
    const currRow = dp[line];
    const currPrev = prevIdx[line];
    if (!prevRow || !currRow || !currPrev) continue;

    for (let end = line; end <= n - (lineCount - line); end += 1) {
      let bestCost = INF;
      let bestStart = -1;
      for (let start = line - 1; start < end; start += 1) {
        const baseCost = prevRow[start] ?? INF;
        if (baseCost >= INF * 0.5) continue;
        const lineW = spanWidth[start]?.[end] ?? 0;
        const orphan = spanOrphan[start]?.[end] ?? false;
        const diff = lineW - target;
        let stepCost = diff * diff * 2.2;
        if (lineW > maxSafe) {
          const overflow = lineW - maxSafe;
          stepCost += 28 + overflow * overflow * 45;
        }
        if (preventOrphans && lineCount >= 2 && orphan) {
          stepCost += isEdgeLine ? 650 : 280;
        }
        if (baseCost + stepCost < bestCost) {
          bestCost = baseCost + stepCost;
          bestStart = start;
        }
      }
      currRow[end] = bestCost;
      currPrev[end] = bestStart;
    }
  }

  const finalCost = dp[lineCount]?.[n] ?? INF;
  if (finalCost >= INF * 0.5) return null;

  const groups: (readonly string[])[] = [];
  let cursor = n;
  for (let line = lineCount; line >= 1; line -= 1) {
    const start = prevIdx[line]?.[cursor] ?? 0;
    groups.unshift(eojeols.slice(start, cursor));
    cursor = start;
  }

  let shapeBonusCost = 0;
  const lineWidths = groups.map((g) => measureOpticalTextWidthEm(g.join(" "), letterSpacingEm));
  if (curved && lineCount >= 3) {
    const centerW = lineWidths[Math.floor(lineCount / 2)] ?? 0;
    const topW = lineWidths[0] ?? 0;
    const bottomW = lineWidths[lineCount - 1] ?? 0;
    if (topW > centerW) shapeBonusCost += (topW - centerW) ** 2 * 18;
    if (bottomW > centerW) shapeBonusCost += (bottomW - centerW) ** 2 * 18;
    shapeBonusCost += (topW - bottomW) ** 2 * 1.4;
  }

  return { groups, cost: finalCost + shapeBonusCost };
}

function rebalanceOrphanGroups(
  rawGroups: readonly (readonly string[])[],
  centerSafeWidthEm: number,
  letterSpacingEm: number,
): { readonly groups: readonly (readonly string[])[]; readonly applied: boolean } {
  const groups = rawGroups.map((g) => [...g]);
  let applied = false;
  if (groups.length < 2) return { groups, applied };

  const last = groups[groups.length - 1];
  const prev = groups[groups.length - 2];
  if (last && prev && isOrphanLineText(last.join(" "))) {
    if (prev.length >= 2) {
      const moved = prev.pop();
      if (moved) {
        last.unshift(moved);
        applied = true;
      }
    } else if (measureOpticalTextWidthEm([...prev, ...last].join(" "), letterSpacingEm) <= centerSafeWidthEm * 1.15) {
      prev.push(...last);
      groups.pop();
      applied = true;
    }
  }

  if (groups.length >= 2) {
    const first = groups[0];
    const second = groups[1];
    if (first && second && isOrphanLineText(first.join(" "))) {
      if (second.length >= 2) {
        const moved = second.shift();
        if (moved) {
          first.push(moved);
          applied = true;
        }
      } else if (measureOpticalTextWidthEm([...first, ...second].join(" "), letterSpacingEm) <= centerSafeWidthEm * 1.15) {
        first.push(...second);
        groups.splice(1, 1);
        applied = true;
      }
    }
  }

  return { groups, applied };
}

/** 독자 가독 시간(초)을 한국어·일본어·영어 혼합 스크립트와 말풍선 감정 속도로 계산한다. */
export function estimateBalloonReadingTimeSec(text: string, shape: BalloonShapeId = "oval"): BalloonReadingTimeReport {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      readingTimeSec: 0, recommendedCutHoldSec: 0, charsPerSecond: 0,
      visibleGlyphCount: 0, eojeolCount: 0, densityGrade: "crisp",
    };
  }

  let baseSec = 0.35;
  let visibleGlyphCount = 0;
  for (const ch of Array.from(trimmed)) {
    if (/\s/u.test(ch)) continue;
    visibleGlyphCount += 1;
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "…") baseSec += 0.2;
    else if (ch === "." || ch === "?" || ch === "!") baseSec += 0.12;
    else if (ch === "," || ch === "、") baseSec += 0.08;
    else if (code >= 0xac00 && code <= 0xd7a3) baseSec += 1 / 5.2;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)) baseSec += 1 / 4.5;
    else baseSec += 1 / 14.5;
  }

  const readingTimeSec = round2(Math.max(0.45, baseSec * BALLOON_SHAPE_SPECS[shape].readingSpeedMultiplier));
  const recommendedCutHoldSec = round2(readingTimeSec + 0.45);
  const charsPerSecond = readingTimeSec > 0 ? round2(visibleGlyphCount / readingTimeSec) : 0;
  const eojeolCount = trimmed.split(/\s+/u).filter(Boolean).length;
  const densityGrade: ReadingDensityGrade =
    readingTimeSec > 5.8 ? "overcrowded" : readingTimeSec > 4.0 ? "dense" : readingTimeSec > 2.2 ? "balanced" : "crisp";

  return { readingTimeSec, recommendedCutHoldSec, charsPerSecond, visibleGlyphCount, eojeolCount, densityGrade };
}

/** 5종 말풍선 SVG 벡터 외곽선 경로와 꼬리/구름 방울을 생성한다. */
export function buildBalloonSvgGeometry(
  shape: BalloonShapeId,
  widthPx: number,
  heightPx: number,
  tailSide: "left" | "right" | "none" = "left",
): { readonly outlinePath: string; readonly tailPath: string; readonly thoughtDots: readonly ThoughtBubbleDot[] } {
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const rx = Math.max(24, widthPx / 2 - 10);
  const ry = Math.max(20, heightPx / 2 - 16);
  const dir = tailSide === "right" ? 1 : -1;

  if (shape === "caption") {
    const x = 10;
    const y = 12;
    const w = Math.max(40, widthPx - 20);
    const h = Math.max(36, heightPx - 24);
    const r = 6;
    const outlinePath = `M ${round2(x + r)} ${round2(y)} H ${round2(x + w - r)} Q ${round2(x + w)} ${round2(y)} ${round2(x + w)} ${round2(y + r)} V ${round2(y + h - r)} Q ${round2(x + w)} ${round2(y + h)} ${round2(x + w - r)} ${round2(y + h)} H ${round2(x + r)} Q ${round2(x)} ${round2(y + h)} ${round2(x)} ${round2(y + h - r)} V ${round2(y + r)} Q ${round2(x)} ${round2(y)} ${round2(x + r)} ${round2(y)} Z`;
    return { outlinePath, tailPath: "", thoughtDots: [] };
  }

  if (shape === "burst") {
    const spikes = 16;
    const points: string[] = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const boost = i % 2 === 0 ? 1.03 : 0.84;
      points.push(`${i === 0 ? "M" : "L"} ${round2(cx + Math.cos(angle) * rx * boost)} ${round2(cy + Math.sin(angle) * ry * boost)}`);
    }
    const tailPath =
      tailSide === "none"
        ? ""
        : `M ${round2(cx + dir * rx * 0.24)} ${round2(cy + ry * 0.78)} L ${round2(cx + dir * rx * 0.44)} ${round2(heightPx - 2)} L ${round2(cx + dir * rx * 0.08)} ${round2(cy + ry * 0.82)} Z`;
    return { outlinePath: `${points.join(" ")} Z`, tailPath, thoughtDots: [] };
  }

  if (shape === "thought") {
    const bumps = 12;
    const segs: string[] = [];
    for (let i = 0; i < bumps; i += 1) {
      const a0 = (i / bumps) * Math.PI * 2;
      const a1 = ((i + 1) / bumps) * Math.PI * 2;
      const aMid = (a0 + a1) / 2;
      if (i === 0) segs.push(`M ${round2(cx + Math.cos(a0) * rx * 0.92)} ${round2(cy + Math.sin(a0) * ry * 0.92)}`);
      segs.push(`Q ${round2(cx + Math.cos(aMid) * rx * 1.1)} ${round2(cy + Math.sin(aMid) * ry * 1.1)} ${round2(cx + Math.cos(a1) * rx * 0.92)} ${round2(cy + Math.sin(a1) * ry * 0.92)}`);
    }
    const thoughtDots: ThoughtBubbleDot[] =
      tailSide === "none"
        ? []
        : [
            { cx: round2(cx + dir * rx * 0.28), cy: round2(cy + ry * 0.96), r: 6.5 },
            { cx: round2(cx + dir * rx * 0.39), cy: round2(cy + ry * 1.07), r: 4.5 },
            { cx: round2(cx + dir * rx * 0.48), cy: round2(cy + ry * 1.15), r: 3.0 },
          ];
    return { outlinePath: `${segs.join(" ")} Z`, tailPath: "", thoughtDots };
  }

  const outlinePath = `M ${round2(cx - rx)} ${round2(cy)} A ${round2(rx)} ${round2(ry)} 0 1 0 ${round2(cx + rx)} ${round2(cy)} A ${round2(rx)} ${round2(ry)} 0 1 0 ${round2(cx - rx)} ${round2(cy)} Z`;
  const tailPath =
    tailSide === "none"
      ? ""
      : `M ${round2(cx + dir * rx * 0.16)} ${round2(cy + ry * 0.9)} Q ${round2(cx + dir * rx * 0.28)} ${round2(heightPx - 3)} ${round2(cx + dir * rx * 0.4)} ${round2(heightPx - 2)} Q ${round2(cx + dir * rx * 0.2)} ${round2(cy + ry * 0.96)} ${round2(cx + dir * rx * 0.04)} ${round2(cy + ry * 0.94)} Z`;
  return { outlinePath, tailPath, thoughtDots: [] };
}

interface VerticalToken {
  readonly source: string;
  readonly display: string;
  readonly rotateDeg: number;
  readonly tateChuYoko: boolean;
}

function buildVerticalTokens(text: string): readonly VerticalToken[] {
  const chars = Array.from(text.replaceAll("\r\n", "\n"));
  const tokens: VerticalToken[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] ?? "";
    if (ch === "\n") continue;
    const pair = `${ch}${chars[i + 1] ?? ""}`;
    if (TATE_CHU_YOKO_PAIRS.has(pair)) {
      tokens.push({ source: pair, display: pair, rotateDeg: 0, tateChuYoko: true });
      i += 1;
      continue;
    }
    const mapped = VERTICAL_PUNCTUATION_MAP[ch];
    if (mapped) {
      tokens.push({ source: ch, display: mapped, rotateDeg: 0, tateChuYoko: false });
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    tokens.push({ source: ch, display: ch, rotateDeg: code >= 0x30 && code <= 0x7a ? 90 : 0, tateChuYoko: false });
  }
  return tokens;
}

function layoutVerticalColumns(
  text: string,
  shape: BalloonShapeId,
  balloonWidthPx: number,
  balloonHeightPx: number,
  fontSizePx: number,
  lineHeightPx: number,
  opticalCenterXPx: number,
  opticalCenterYPx: number,
): readonly VerticalBalloonColumn[] {
  const spec = BALLOON_SHAPE_SPECS[shape];
  const tokens = buildVerticalTokens(text.trim());
  if (tokens.length === 0) return [];

  const innerHeightPx = Math.max(fontSizePx * 3, balloonHeightPx * (1 - spec.innerPaddingRatio * 2));
  const glyphStepPx = Math.max(fontSizePx * 1.06, 12);
  const maxGlyphsAtCenter = Math.max(3, Math.floor(innerHeightPx / glyphStepPx));
  const estimatedCols = Math.max(1, Math.min(8, Math.ceil(tokens.length / Math.max(2, maxGlyphsAtCenter * 0.82))));
  const xSpan = estimatedCols === 1 ? 0 : estimatedCols === 2 ? 0.45 : 0.72;

  const colFactors = Array.from({ length: estimatedCols }, (_, c) =>
    evaluateInscribedWidthFactor(shape, estimatedCols === 1 ? 0 : (0.5 - (c + 0.5) / estimatedCols) * 2 * xSpan),
  );
  const factorSum = colFactors.reduce((acc, f) => acc + f, 0) || 1;

  const colBuckets: VerticalToken[][] = [];
  let cursor = 0;
  for (let c = 0; c < estimatedCols; c += 1) {
    const remainingCols = estimatedCols - c;
    const remainingTokens = tokens.length - cursor;
    if (remainingTokens <= 0) break;
    if (remainingCols === 1) {
      colBuckets.push(tokens.slice(cursor));
      cursor = tokens.length;
    } else {
      const share = Math.max(2, Math.round((tokens.length * (colFactors[c] ?? 1)) / factorSum));
      const take = Math.min(remainingTokens - (remainingCols - 1), Math.max(1, share));
      colBuckets.push(tokens.slice(cursor, cursor + take));
      cursor += take;
    }
  }

  const colCount = colBuckets.length;
  const colPitchPx = Math.min(lineHeightPx * 1.05, (balloonWidthPx * (1 - spec.innerPaddingRatio * 1.6)) / Math.max(1, colCount));
  const totalBlockW = (colCount - 1) * colPitchPx;

  return colBuckets.map((bucket, colIdx) => {
    const normalizedX = colCount === 1 ? 0 : (0.5 - (colIdx + 0.5) / colCount) * 2 * xSpan;
    const xPx = round2(opticalCenterXPx + totalBlockW / 2 - colIdx * colPitchPx);
    const columnHeightPx = round2(bucket.length * glyphStepPx);
    const topYPx = round2(opticalCenterYPx - columnHeightPx / 2 + glyphStepPx * 0.5);
    return {
      columnIndex: colIdx,
      text: bucket.map((t) => t.source).join(""),
      glyphCount: bucket.length,
      normalizedX: round2(normalizedX),
      inscribedHeightFactor: evaluateInscribedWidthFactor(shape, normalizedX),
      xPx,
      topYPx,
      columnHeightPx,
      glyphs: bucket.map((tok, gIdx) => ({
        index: gIdx, sourceChar: tok.source, displayChar: tok.display,
        xPx, yPx: round2(topYPx + gIdx * glyphStepPx), rotateDeg: tok.rotateDeg, tateChuYoko: tok.tateChuYoko,
      })),
    };
  });
}

function computeDiamondBalanceScore(
  lines: readonly TypesetBalloonLine[],
  curvedProfile: boolean,
  maxOverflowRatio: number,
  orphanLineCount: number,
): number {
  if (lines.length === 0) return 100;
  const avgDeviation =
    lines.reduce((acc, line) => acc + Math.abs(Math.min(1.2, line.fillRatio) - 0.82), 0) / lines.length;
  let penalty = avgDeviation * 42 + maxOverflowRatio * 55 + orphanLineCount * 22;
  if (curvedProfile && lines.length >= 3) {
    const centerLine = lines[Math.floor(lines.length / 2)];
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    if (centerLine && firstLine && firstLine.opticalWidthEm > centerLine.opticalWidthEm + 0.4) penalty += 14;
    if (centerLine && lastLine && lastLine.opticalWidthEm > centerLine.opticalWidthEm + 0.4) penalty += 14;
  }
  return Math.round(clamp(100 - penalty, 18, 100));
}

/** 한국어 어절 단위(`word-break: keep-all`) 광학 말풍선 자동 조판 및 세로쓰기 레이아웃을 계산한다. */
export function typesetKoreanBalloon(
  text: string,
  options?: BalloonTypesetOptions,
): KoreanBalloonTypesetResult {
  const shape: BalloonShapeId = options?.shape ?? "oval";
  const writingMode: BalloonWritingMode = options?.writingMode ?? "horizontal-tb";
  const shapeSpec = BALLOON_SHAPE_SPECS[shape];
  const fontSizePx = round2(clamp(options?.fontSizePx ?? 16, 10, 36) * shapeSpec.defaultFontScale);
  const lineHeightPx = round2(fontSizePx * clamp(options?.lineHeightRatio ?? 1.44, 1.15, 2.0));
  const letterSpacingEm = options?.letterSpacingEm ?? 0.02;
  const preventOrphans = options?.preventOrphans ?? true;
  const tailSide = options?.tailSide ?? (shapeSpec.hasTail || shapeSpec.hasThoughtDots ? "left" : "none");

  const balloonWidthPx = round2(clamp(options?.balloonWidthPx ?? 264, 140, 520));
  const centerSafeWidthPx = Math.max(fontSizePx * 4, balloonWidthPx * (1 - shapeSpec.innerPaddingRatio * 2));
  const centerSafeWidthEm = centerSafeWidthPx / fontSizePx;

  const paragraphBlocks = tokenizeKoreanEojeol(text, Math.max(6, centerSafeWidthEm * 1.15));
  const eojeolPreserved = paragraphBlocks.every((block) => !block.emergencySplitUsed);

  const chosenGroups: (readonly string[])[] = [];
  let orphanGuardApplied = false;

  for (const block of paragraphBlocks) {
    const eojeols = block.eojeols;
    const totalEm = measureOpticalTextWidthEm(eojeols.join(" "), letterSpacingEm);
    const minLines = Math.min(eojeols.length, Math.max(1, Math.ceil(totalEm / Math.max(3, centerSafeWidthEm * 0.96))));
    const maxLines = Math.min(eojeols.length, Math.max(minLines + 3, 7));

    let bestPartition: CandidateLinePartition | null = null;
    for (let k = minLines; k <= maxLines; k += 1) {
      const candidate = solveDiamondPartitionForLineCount(
        eojeols, k, shape, centerSafeWidthEm, letterSpacingEm, preventOrphans,
      );
      if (!candidate) continue;
      const scoredCost = candidate.cost + (k - minLines) * 1.4;
      if (!bestPartition || scoredCost < bestPartition.cost) {
        bestPartition = { groups: candidate.groups, cost: scoredCost };
      }
    }

    const rawGroups = bestPartition ? bestPartition.groups : [eojeols];
    if (preventOrphans) {
      const rebalanced = rebalanceOrphanGroups(rawGroups, centerSafeWidthEm, letterSpacingEm);
      if (rebalanced.applied) orphanGuardApplied = true;
      chosenGroups.push(...rebalanced.groups);
    } else {
      chosenGroups.push(...rawGroups);
    }
  }

  const lineCount = chosenGroups.length;
  const computedHeight =
    writingMode === "vertical-rl"
      ? Math.max(210, Math.round(balloonWidthPx * 1.18))
      : Math.max(132, Math.round((Math.max(1, lineCount) * lineHeightPx) / (1 - shapeSpec.innerPaddingRatio * 2) + 28));
  const balloonHeightPx = round2(clamp(options?.balloonHeightPx ?? computedHeight, 120, 560));
  const opticalCenterXPx = round2(balloonWidthPx / 2);
  const opticalCenterYPx = round2(balloonHeightPx * (0.5 + shapeSpec.opticalCenterOffsetRatio));

  const verticalSpan = lineCount <= 1 ? 0 : lineCount === 2 ? 0.48 : 0.78;
  const startYPx = opticalCenterYPx - (Math.max(0, lineCount - 1) * lineHeightPx) / 2;

  const lines: TypesetBalloonLine[] = chosenGroups.map((eojeols, idx) => {
    const lineText = eojeols.join(" ");
    const normalizedY = lineCount <= 1 ? 0 : ((idx + 0.5) / lineCount - 0.5) * 2 * verticalSpan;
    const inscribedWidthFactor = evaluateInscribedWidthFactor(shape, normalizedY);
    const maxAllowedWidthEm = round2(Math.max(3.2, centerSafeWidthEm * inscribedWidthFactor));
    const opticalWidthEm = measureOpticalTextWidthEm(lineText, letterSpacingEm);
    return {
      index: idx, text: lineText, eojeols, glyphCount: countVisibleGlyphs(lineText),
      opticalWidthEm, maxAllowedWidthEm, inscribedWidthFactor, normalizedY: round2(normalizedY),
      fillRatio: maxAllowedWidthEm > 0 ? round2(opticalWidthEm / maxAllowedWidthEm) : 0,
      xPx: opticalCenterXPx, yPx: round2(startYPx + idx * lineHeightPx),
      isOrphan: lineCount >= 2 && isOrphanLineText(lineText),
    };
  });

  const orphanLineCount = lines.filter((line) => line.isOrphan).length;
  const maxOverflowRatio =
    lines.length > 0 ? round2(Math.max(0, ...lines.map((line) => Math.max(0, line.fillRatio - 1)))) : 0;
  const diamondBalanceScore = computeDiamondBalanceScore(lines, shapeSpec.curvedProfile, maxOverflowRatio, orphanLineCount);

  const verticalColumns =
    writingMode === "vertical-rl"
      ? layoutVerticalColumns(text, shape, balloonWidthPx, balloonHeightPx, fontSizePx, lineHeightPx, opticalCenterXPx, opticalCenterYPx)
      : [];

  const { outlinePath, tailPath, thoughtDots } = buildBalloonSvgGeometry(shape, balloonWidthPx, balloonHeightPx, tailSide);
  const inscribedCurveGuides: InscribedCurveGuide[] = [-0.72, -0.36, 0, 0.36, 0.72].map((norm) => {
    const factor = evaluateInscribedWidthFactor(shape, norm);
    if (writingMode === "vertical-rl") {
      const gx = round2(opticalCenterXPx + norm * (balloonWidthPx * (0.5 - shapeSpec.innerPaddingRatio)));
      const halfH = balloonHeightPx * (0.5 - shapeSpec.innerPaddingRatio) * factor;
      return { normalizedAxis: norm, factor, x1Px: gx, y1Px: round2(opticalCenterYPx - halfH), x2Px: gx, y2Px: round2(opticalCenterYPx + halfH) };
    }
    const gy = round2(opticalCenterYPx + norm * (balloonHeightPx * (0.5 - shapeSpec.innerPaddingRatio)));
    const halfW = (centerSafeWidthPx / 2) * factor;
    return { normalizedAxis: norm, factor, x1Px: round2(opticalCenterXPx - halfW), y1Px: gy, x2Px: round2(opticalCenterXPx + halfW), y2Px: gy };
  });

  return {
    text, shape, shapeSpec, writingMode, cssWordBreak: "keep-all",
    balloonWidthPx, balloonHeightPx, fontSizePx, lineHeightPx,
    innerPaddingRatio: shapeSpec.innerPaddingRatio,
    opticalCenterOffsetRatio: shapeSpec.opticalCenterOffsetRatio,
    opticalCenterXPx, opticalCenterYPx, lines, verticalColumns,
    diamondBalanceScore, orphanLineCount, orphanGuardApplied, eojeolPreserved, maxOverflowRatio,
    readingTime: estimateBalloonReadingTimeSec(text, shape),
    balloonOutlinePath: outlinePath, tailPath, thoughtDots, inscribedCurveGuides,
  };
}
