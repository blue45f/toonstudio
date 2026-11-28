/**
 * Wave 110 — 말풍선 내부 타원/사각형/폭발형 현(chord) 폭 계산 및
 * 스크립트별 줄바꿈(라틴·아랍어 단어 보존, 한·일 금칙 처리) 피팅 탐색 엔진.
 */

import {
  KINSOKU_LINE_END_FORBIDDEN,
  KINSOKU_LINE_START_FORBIDDEN,
  measureTextWidthPx,
  type BalloonInteriorShape,
  type LocaleTypographyProfile,
} from "./localization-locale-profiles-and-crypto";

export interface BalloonWrapAttempt {
  readonly fits: boolean;
  readonly lines: readonly string[];
  readonly maxLineWidthPx: number;
}

export interface BalloonCandidateFit {
  readonly fontSizePx: number;
  readonly trackingEm: number;
  readonly lines: readonly string[];
  readonly maxLineWidthPx: number;
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function computeChordWidthsForLineCount(
  lineCount: number,
  lineHeightPx: number,
  innerWidthPx: number,
  innerHeightPx: number,
  shape: BalloonInteriorShape,
): readonly number[] | null {
  const effectiveW = innerWidthPx * (shape === "burst" ? 0.84 : 0.94);
  const effectiveH = innerHeightPx * (shape === "burst" ? 0.84 : 0.92);
  if (lineCount * lineHeightPx > effectiveH + 0.01) return null;

  const halfH = effectiveH * 0.5;
  const widths: number[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const centerY = (i + 0.5 - lineCount * 0.5) * lineHeightPx;
    const yNorm = Math.min(0.99, (Math.abs(centerY) + lineHeightPx * 0.34) / Math.max(1, halfH));
    if (shape === "rounded-rect") {
      widths.push(effectiveW * (yNorm > 0.86 ? 0.9 : 1.0));
    } else if (shape === "burst") {
      widths.push(effectiveW * Math.sqrt(Math.max(0.14, 1 - yNorm * yNorm * 0.85)));
    } else {
      widths.push(effectiveW * Math.sqrt(Math.max(0.08, 1 - yNorm * yNorm)));
    }
  }
  return widths;
}

function tokenizeLatinOrArabicParagraph(paragraph: string): readonly string[] {
  const trimmed = paragraph.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return [];
  const rawWords = trimmed.split(" ");
  const tokens: string[] = [];
  for (let i = 0; i < rawWords.length; i += 1) {
    const w = rawWords[i];
    if (w.indexOf("-") > 0 && w.indexOf("-") < w.length - 1) {
      const parts = w.split("-");
      for (let h = 0; h < parts.length; h += 1) {
        const piece = h < parts.length - 1 ? `${parts[h]}-` : parts[h];
        if (piece.length > 0) tokens.push(piece);
      }
    } else if (w.length > 0) {
      tokens.push(w);
    }
  }
  return tokens;
}

function wrapWordPreservingParagraph(
  paragraph: string,
  lineWidths: readonly number[],
  startLineIdx: number,
  fontSizePx: number,
  trackingEm: number,
  profile: LocaleTypographyProfile,
): { readonly ok: boolean; readonly lines: readonly string[]; readonly maxWidth: number } {
  const tokens = tokenizeLatinOrArabicParagraph(paragraph);
  if (tokens.length === 0) return { ok: true, lines: [""], maxWidth: 0 };
  const lines: string[] = [];
  let lineIdx = startLineIdx;
  let current = "";
  let maxWidth = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (lineIdx >= lineWidths.length) return { ok: false, lines, maxWidth };
    const joiner = current.length === 0 ? "" : current.endsWith("-") ? "" : " ";
    const candidate = `${current}${joiner}${token}`;
    const candidateW = measureTextWidthPx(candidate, fontSizePx, trackingEm, profile);
    if (candidateW <= lineWidths[lineIdx] + 0.01) {
      current = candidate;
      if (candidateW > maxWidth) maxWidth = candidateW;
      continue;
    }
    if (current.length === 0) return { ok: false, lines, maxWidth };
    lines.push(current);
    lineIdx += 1;
    if (lineIdx >= lineWidths.length) return { ok: false, lines, maxWidth };
    const tokenW = measureTextWidthPx(token, fontSizePx, trackingEm, profile);
    if (tokenW > lineWidths[lineIdx] + 0.01) return { ok: false, lines, maxWidth };
    current = token;
    if (tokenW > maxWidth) maxWidth = tokenW;
  }
  if (current.length > 0) lines.push(current);
  return { ok: true, lines, maxWidth };
}

function wrapCjkKinsokuParagraph(
  paragraph: string,
  lineWidths: readonly number[],
  startLineIdx: number,
  fontSizePx: number,
  trackingEm: number,
  profile: LocaleTypographyProfile,
): { readonly ok: boolean; readonly lines: readonly string[]; readonly maxWidth: number } {
  const cleaned = paragraph.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return { ok: true, lines: [""], maxWidth: 0 };
  const lines: string[] = [];
  let lineIdx = startLineIdx;
  let cursor = 0;
  let maxWidth = 0;

  while (cursor < cleaned.length) {
    if (lineIdx >= lineWidths.length) return { ok: false, lines, maxWidth };
    const maxLineW = lineWidths[lineIdx];
    let end = cursor;
    let lastValidEnd = cursor;
    while (end < cleaned.length) {
      const w = measureTextWidthPx(cleaned.slice(cursor, end + 1), fontSizePx, trackingEm, profile);
      if (w <= maxLineW + 0.01) {
        end += 1;
        lastValidEnd = end;
      } else {
        break;
      }
    }
    if (lastValidEnd === cursor) return { ok: false, lines, maxWidth };

    let breakAt = lastValidEnd;
    if (breakAt < cleaned.length) {
      if (KINSOKU_LINE_START_FORBIDDEN.indexOf(cleaned.charAt(breakAt)) >= 0) {
        const pulledW = measureTextWidthPx(
          cleaned.slice(cursor, breakAt + 1),
          fontSizePx,
          trackingEm,
          profile,
        );
        if (pulledW <= maxLineW * 1.04) breakAt += 1;
        else if (breakAt - 1 > cursor) breakAt -= 1;
      }
      while (
        breakAt > cursor + 1 &&
        KINSOKU_LINE_END_FORBIDDEN.indexOf(cleaned.charAt(breakAt - 1)) >= 0
      ) {
        breakAt -= 1;
      }
    }

    const lineText = cleaned.slice(cursor, breakAt).trim();
    const finalW = measureTextWidthPx(lineText, fontSizePx, trackingEm, profile);
    if (finalW > maxWidth) maxWidth = finalW;
    lines.push(lineText);
    cursor = breakAt;
    while (cursor < cleaned.length && cleaned.charAt(cursor) === " ") cursor += 1;
    lineIdx += 1;
  }
  return { ok: true, lines, maxWidth };
}

/** 주어진 폰트 크기·자간으로 말풍선 내부 경계에 텍스트가 수납되는지 시뮬레이션한다. */
export function tryLayoutInsideBalloon(
  text: string,
  fontSizePx: number,
  trackingEm: number,
  innerWidthPx: number,
  innerHeightPx: number,
  shape: BalloonInteriorShape,
  profile: LocaleTypographyProfile,
): BalloonWrapAttempt {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return { fits: true, lines: [], maxLineWidthPx: 0 };

  const paragraphs = normalized.split("\n");
  const lineHeightPx = fontSizePx * profile.lineHeightRatio;
  const effectiveH = innerHeightPx * (shape === "burst" ? 0.84 : 0.92);
  const maxLines = Math.max(0, Math.floor((effectiveH + 0.01) / Math.max(1, lineHeightPx)));
  if (maxLines < paragraphs.length) return { fits: false, lines: [], maxLineWidthPx: 0 };

  const isCjk = profile.scriptFamily === "hangul" || profile.scriptFamily === "cjk-kana";
  for (let cand = paragraphs.length; cand <= maxLines; cand += 1) {
    const chords = computeChordWidthsForLineCount(cand, lineHeightPx, innerWidthPx, innerHeightPx, shape);
    if (!chords) continue;
    const collected: string[] = [];
    let ok = true;
    let maxW = 0;
    for (let p = 0; p < paragraphs.length; p += 1) {
      const res = isCjk
        ? wrapCjkKinsokuParagraph(paragraphs[p], chords, collected.length, fontSizePx, trackingEm, profile)
        : wrapWordPreservingParagraph(paragraphs[p], chords, collected.length, fontSizePx, trackingEm, profile);
      if (!res.ok) {
        ok = false;
        break;
      }
      for (let li = 0; li < res.lines.length; li += 1) collected.push(res.lines[li]);
      if (res.maxWidth > maxW) maxW = res.maxWidth;
    }
    if (ok && collected.length <= cand) return { fits: true, lines: collected, maxLineWidthPx: maxW };
  }
  return { fits: false, lines: [], maxLineWidthPx: 0 };
}

/** 허용 폰트 크기 범위와 자간 범위 내에서 가장 읽기 좋은 수납 조합을 탐색한다. */
export function findBestFitInBalloonBox(
  text: string,
  nominalPx: number,
  minPx: number,
  widthPx: number,
  heightPx: number,
  shape: BalloonInteriorShape,
  profile: LocaleTypographyProfile,
): BalloonCandidateFit | null {
  const fonts: number[] = [];
  const step = nominalPx - minPx > 12 ? 1 : 0.5;
  for (let cur = nominalPx; cur > minPx + 0.01; cur -= step) fonts.push(roundTo(cur, 2));
  const minRounded = roundTo(minPx, 2);
  if (fonts.length === 0 || fonts[fonts.length - 1] !== minRounded) fonts.push(minRounded);
  const trackings = profile.minTrackingEm >= 0 ? [0] : [0, -0.01, -0.02, -0.03, -0.04];

  for (let fi = 0; fi < fonts.length; fi += 1) {
    for (let ti = 0; ti < trackings.length; ti += 1) {
      const attempt = tryLayoutInsideBalloon(
        text,
        fonts[fi],
        trackings[ti],
        widthPx,
        heightPx,
        shape,
        profile,
      );
      if (attempt.fits) {
        return {
          fontSizePx: fonts[fi],
          trackingEm: trackings[ti],
          lines: attempt.lines,
          maxLineWidthPx: attempt.maxLineWidthPx,
        };
      }
    }
  }
  return null;
}

/** 가독 하한에서 말풍선 안에 들어가는 번역문 최대 글자 수를 이분 탐색으로 산출한다. */
export function computeRecommendedMaxCharsForBalloon(
  text: string,
  minReadableFontPx: number,
  innerWidthPx: number,
  innerHeightPx: number,
  shape: BalloonInteriorShape,
  profile: LocaleTypographyProfile,
): number {
  const trimmed = text.trim();
  const actualLen = trimmed.length;
  if (actualLen <= 1) return 1;

  const targetTrack = profile.minTrackingEm * 0.5;
  let low = 1;
  let high = actualLen - 1;
  let best = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sample = trimmed.slice(0, mid).trim();
    if (sample.length === 0) {
      low = mid + 1;
      continue;
    }
    if (
      tryLayoutInsideBalloon(
        sample,
        minReadableFontPx,
        targetTrack,
        innerWidthPx,
        innerHeightPx,
        shape,
        profile,
      ).fits
    ) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, Math.min(actualLen - 1, best));
}

export function hasMultiClauseBreakOpportunity(text: string): boolean {
  const trimmed = text.trim();
  for (let i = 0; i < trimmed.length - 1; i += 1) {
    if (".!?。！？;\n".indexOf(trimmed.charAt(i)) >= 0) return true;
  }
  return false;
}
