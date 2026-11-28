/**
 * Wave 143 — 5개국어(한/일/영/불/스) 토크나이저, 오버사이즈 안전 분할 및 금칙·고아행 감사 엔진.
 */

import type {
  SupportedTypesetLocale,
  TypesetAuditLineInput,
  TypesetAuditResult,
  TypesetToken,
  TypesetViolation,
} from "./balloon-typeset-types";
import {
  FRENCH_HIGH_PUNCTUATION_SET,
  NBSP,
  SPANISH_OPENER_SET,
  countSpeakableChars,
  getLocaleKinsokuRuleSet,
  isLatinLetterOrDigitCode,
  isLineEndForbiddenChar,
  isLineStartForbiddenChar,
  isSpeakableGlyph,
  measureGlyphAdvanceEm,
  measureLineWidthPx,
  splitCodePoints,
} from "./locale-kinsoku-tables";

export {
  NBSP,
  countSpeakableChars,
  getLocaleKinsokuRuleSet,
  isLineEndForbiddenChar,
  isLineStartForbiddenChar,
  isSpeakableGlyph,
  measureGlyphAdvanceEm,
  measureLineWidthPx,
  splitCodePoints,
};

function makeToken(
  text: string,
  joinBefore: string,
  locale: SupportedTypesetLocale,
  isHardBreakAfter: boolean,
  hyphenatedPiece = false,
): TypesetToken {
  const speakable = countSpeakableChars(text);
  return {
    text,
    joinBefore,
    locale,
    isHardBreakAfter,
    speakableCharCount: speakable,
    isPunctuationOnly: speakable === 0,
    hyphenatedPiece,
  };
}

function isPurelySet(text: string, predicate: (ch: string) => boolean): boolean {
  const chars = splitCodePoints(text);
  if (chars.length === 0) return false;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (!ch || !predicate(ch)) return false;
  }
  return true;
}

function tokenizeJapaneseParagraph(paragraph: string): readonly TypesetToken[] {
  const chars = splitCodePoints(paragraph);
  const rawClusters: { text: string; joinBefore: string }[] = [];
  let pendingPrefix = "";
  let pendingSpace = "";

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (!ch) continue;
    if (ch === " " || ch === "\t") {
      pendingSpace = " ";
      continue;
    }
    if (isLineEndForbiddenChar(ch, "ja-JP")) {
      pendingPrefix += ch;
      continue;
    }
    if (isLineStartForbiddenChar(ch, "ja-JP")) {
      if (pendingPrefix.length > 0) {
        pendingPrefix += ch;
      } else if (rawClusters.length > 0) {
        const prev = rawClusters[rawClusters.length - 1];
        if (prev) prev.text += ch;
      } else {
        rawClusters.push({ text: ch, joinBefore: pendingSpace });
        pendingSpace = "";
      }
      continue;
    }

    const code = ch.charCodeAt(0);
    if (isLatinLetterOrDigitCode(code)) {
      let run = ch;
      while (i + 1 < chars.length) {
        const next = chars[i + 1];
        if (!next) break;
        const nextCode = next.charCodeAt(0);
        if (isLatinLetterOrDigitCode(nextCode) || next === "-" || next === "'") {
          run += next;
          i += 1;
        } else {
          break;
        }
      }
      rawClusters.push({ text: pendingPrefix + run, joinBefore: rawClusters.length === 0 ? "" : pendingSpace });
      pendingPrefix = "";
      pendingSpace = "";
      continue;
    }

    rawClusters.push({ text: pendingPrefix + ch, joinBefore: rawClusters.length === 0 ? "" : pendingSpace });
    pendingPrefix = "";
    pendingSpace = "";
  }

  if (pendingPrefix.length > 0) {
    if (rawClusters.length > 0) {
      const last = rawClusters[rawClusters.length - 1];
      if (last) last.text += pendingPrefix;
    } else {
      rawClusters.push({ text: pendingPrefix, joinBefore: "" });
    }
  }

  return rawClusters.map((item, idx) => makeToken(item.text, idx === 0 ? "" : item.joinBefore, "ja-JP", false));
}

function tokenizeSpaceDelimitedParagraph(
  paragraph: string,
  locale: SupportedTypesetLocale,
): readonly TypesetToken[] {
  const rawWords = paragraph.trim().split(/[ \t]+/).filter((part) => part.length > 0);
  if (rawWords.length === 0) return [];

  const normalizedWords: string[] = [];
  for (let i = 0; i < rawWords.length; i += 1) {
    const word = rawWords[i];
    if (!word) continue;
    if (locale === "fr-FR" && word.length > 1 && word.charAt(0) === "«" && word.charAt(1) !== NBSP) {
      normalizedWords.push(`«${NBSP}${word.slice(1)}`);
      continue;
    }
    normalizedWords.push(word);
  }

  const merged: string[] = [];
  let pendingOpener = "";
  let pendingOpenerGlue = "";

  for (let i = 0; i < normalizedWords.length; i += 1) {
    const word = normalizedWords[i];
    if (!word) continue;

    if (
      locale === "fr-FR" &&
      isPurelySet(word, (ch) => FRENCH_HIGH_PUNCTUATION_SET.has(ch) || isLineStartForbiddenChar(ch, locale))
    ) {
      if (merged.length > 0) {
        const lastIdx = merged.length - 1;
        const prev = merged[lastIdx] ?? "";
        const startsWithHigh = FRENCH_HIGH_PUNCTUATION_SET.has(word.charAt(0));
        merged[lastIdx] = startsWithHigh ? `${prev}${NBSP}${word}` : `${prev}${word}`;
      } else {
        merged.push(word);
      }
      continue;
    }

    if (locale === "fr-FR" && word === "«") {
      pendingOpener = `${pendingOpener}«`;
      pendingOpenerGlue = NBSP;
      continue;
    }

    if (locale === "es-ES" && isPurelySet(word, (ch) => SPANISH_OPENER_SET.has(ch) || isLineEndForbiddenChar(ch, locale))) {
      pendingOpener += word;
      pendingOpenerGlue = "";
      continue;
    }

    if (isPurelySet(word, (ch) => isLineEndForbiddenChar(ch, locale))) {
      pendingOpener += word;
      pendingOpenerGlue = "";
      continue;
    }

    if (isPurelySet(word, (ch) => isLineStartForbiddenChar(ch, locale))) {
      if (merged.length > 0) {
        const lastIdx = merged.length - 1;
        merged[lastIdx] = `${merged[lastIdx] ?? ""}${word}`;
      } else {
        merged.push(word);
      }
      continue;
    }

    let finalWord = pendingOpener.length > 0 ? `${pendingOpener}${pendingOpenerGlue}${word}` : word;
    pendingOpener = "";
    pendingOpenerGlue = "";

    if (locale === "fr-FR" && finalWord.length >= 2) {
      const lastChar = finalWord.charAt(finalWord.length - 1);
      const prevChar = finalWord.charAt(finalWord.length - 2);
      if (lastChar === "»" && prevChar !== NBSP) {
        finalWord = `${finalWord.slice(0, -1)}${NBSP}»`;
      }
    }

    merged.push(finalWord);
  }

  if (pendingOpener.length > 0) {
    if (merged.length > 0) {
      const lastIdx = merged.length - 1;
      merged[lastIdx] = `${merged[lastIdx] ?? ""}${pendingOpener}`;
    } else {
      merged.push(pendingOpener);
    }
  }

  return merged.map((piece, idx) => makeToken(piece, idx === 0 ? "" : " ", locale, false));
}

/** 대사 문자열을 로캘별 금칙·비분리 규칙이 반영된 원자 토큰 시퀀스로 분해한다. */
export function tokenizeDialogueForLocale(
  text: string,
  locale: SupportedTypesetLocale,
): readonly TypesetToken[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.length === 0) return [];

  const paragraphs = normalized.split("\n");
  const allTokens: TypesetToken[] = [];

  for (let p = 0; p < paragraphs.length; p += 1) {
    const para = (paragraphs[p] ?? "").trim();
    if (para.length === 0) continue;
    const paraTokens =
      locale === "ja-JP"
        ? tokenizeJapaneseParagraph(para)
        : tokenizeSpaceDelimitedParagraph(para, locale);

    for (let i = 0; i < paraTokens.length; i += 1) {
      const tok = paraTokens[i];
      if (!tok) continue;
      const isLastInPara = i === paraTokens.length - 1 && p < paragraphs.length - 1;
      allTokens.push(isLastInPara ? { ...tok, isHardBreakAfter: true } : tok);
    }
  }
  return allTokens;
}

function splitOversizedKoreanToken(token: TypesetToken): readonly TypesetToken[] | null {
  const chars = splitCodePoints(token.text);
  const clusters: string[] = [];
  let prefix = "";
  for (let c = 0; c < chars.length; c += 1) {
    const ch = chars[c];
    if (!ch) continue;
    if (isLineEndForbiddenChar(ch, "ko-KR")) {
      prefix += ch;
      continue;
    }
    if (isLineStartForbiddenChar(ch, "ko-KR")) {
      if (clusters.length > 0) {
        clusters[clusters.length - 1] = `${clusters[clusters.length - 1] ?? ""}${ch}`;
      } else {
        prefix += ch;
      }
      continue;
    }
    clusters.push(prefix + ch);
    prefix = "";
  }
  if (prefix.length > 0) {
    if (clusters.length > 0) {
      clusters[clusters.length - 1] = `${clusters[clusters.length - 1] ?? ""}${prefix}`;
    } else {
      clusters.push(prefix);
    }
  }
  if (clusters.length <= 1) return null;
  return clusters.map((piece, k) =>
    makeToken(
      piece,
      k === 0 ? token.joinBefore : "",
      "ko-KR",
      k === clusters.length - 1 ? token.isHardBreakAfter : false,
      false,
    ),
  );
}

function splitOversizedLatinToken(
  token: TypesetToken,
  maxLineWidthPx: number,
  fontSizePx: number,
  locale: SupportedTypesetLocale,
  letterSpacingEm: number,
): readonly TypesetToken[] | null {
  const chars = splitCodePoints(token.text);
  if (chars.length < 8 || token.speakableCharCount < 7) return null;

  const pieces: string[] = [];
  let cursor = 0;
  const hyphenWidth = measureLineWidthPx("-", fontSizePx, locale, letterSpacingEm);
  while (cursor < chars.length) {
    const remainingText = chars.slice(cursor).join("");
    if (measureLineWidthPx(remainingText, fontSizePx, locale, letterSpacingEm) <= maxLineWidthPx * 0.95) {
      pieces.push(remainingText);
      break;
    }
    let end = cursor + 3;
    let bestEnd = end;
    while (end < chars.length - 2) {
      const candidate = chars.slice(cursor, end).join("");
      const candidateW = measureLineWidthPx(candidate, fontSizePx, locale, letterSpacingEm) + hyphenWidth;
      if (candidateW > maxLineWidthPx * 0.92) break;
      bestEnd = end;
      end += 1;
    }
    const lastPieceChar = chars[bestEnd - 1] ?? "";
    const nextPieceChar = chars[bestEnd] ?? "";
    if (
      bestEnd <= cursor + 2 ||
      bestEnd >= chars.length - 2 ||
      isLineEndForbiddenChar(lastPieceChar, locale) ||
      isLineStartForbiddenChar(nextPieceChar, locale) ||
      lastPieceChar === NBSP ||
      nextPieceChar === NBSP
    ) {
      pieces.push(remainingText);
      break;
    }
    pieces.push(`${chars.slice(cursor, bestEnd).join("")}-`);
    cursor = bestEnd;
  }
  if (pieces.length <= 1) return null;
  return pieces.map((piece, k) =>
    makeToken(
      piece,
      k === 0 ? token.joinBefore : "",
      locale,
      k === pieces.length - 1 ? token.isHardBreakAfter : false,
      k < pieces.length - 1,
    ),
  );
}

/** 단일 토큰이 말풍선 최대 현 너비를 초과할 때만 안전하게 음절·하이픈 분할한다. */
export function expandOversizedTokens(
  tokens: readonly TypesetToken[],
  maxLineWidthPx: number,
  fontSizePx: number,
  locale: SupportedTypesetLocale,
  letterSpacingEm: number,
  allowWordHyphenation: boolean,
  allowKoreanSyllableSplit: boolean,
): readonly TypesetToken[] {
  if (tokens.length === 0 || maxLineWidthPx <= 0) return tokens;

  const result: TypesetToken[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const width = measureLineWidthPx(token.text, fontSizePx, locale, letterSpacingEm);
    if (width <= maxLineWidthPx * 0.96) {
      result.push(token);
      continue;
    }
    if (locale === "ko-KR" && allowKoreanSyllableSplit) {
      const pieces = splitOversizedKoreanToken(token);
      if (pieces) {
        for (let k = 0; k < pieces.length; k += 1) {
          const piece = pieces[k];
          if (piece) result.push(piece);
        }
        continue;
      }
    }
    if ((locale === "en-US" || locale === "fr-FR" || locale === "es-ES") && allowWordHyphenation) {
      const pieces = splitOversizedLatinToken(token, maxLineWidthPx, fontSizePx, locale, letterSpacingEm);
      if (pieces) {
        for (let k = 0; k < pieces.length; k += 1) {
          const piece = pieces[k];
          if (piece) result.push(piece);
        }
        continue;
      }
    }
    result.push(token);
  }
  return result;
}

function countSpaceWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/[ \t]+/).filter((part) => part.length > 0).length;
}

/**
 * 줄바꿈 완료된 행 목록에서 금칙문자 위반(행두·행말), 프랑스어 비분리 부호 분리,
 * 스페인어 여는 부호 고립, 말풍선 바깥 텍스트 돌출(수평·수직), 1글자·단어 고아 막줄을 감사한다.
 */
export function auditKinsokuAndWidowViolations(
  lines: readonly TypesetAuditLineInput[],
  locale: SupportedTypesetLocale,
  availableTextHeightPx?: number,
  lineHeightPx?: number,
): TypesetAuditResult {
  const violations: TypesetViolation[] = [];
  let lineStartKinsokuCount = 0;
  let lineEndKinsokuCount = 0;
  let horizontalOverflowCount = 0;
  let verticalOverflowCount = 0;
  let widowCount = 0;
  let maxOverflowPx = 0;

  let maxLineWidth = 0;
  let totalWords = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (line.widthPx > maxLineWidth) maxLineWidth = line.widthPx;
    totalWords += countSpaceWords(line.text);
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.text.trim();
    const chars = splitCodePoints(trimmed);
    const firstChar = chars[0] ?? "";
    const lastChar = chars[chars.length - 1] ?? "";

    if (firstChar.length > 0 && isLineStartForbiddenChar(firstChar, locale)) {
      if (locale === "fr-FR" && FRENCH_HIGH_PUNCTUATION_SET.has(firstChar)) {
        lineStartKinsokuCount += 1;
        violations.push({
          kind: "french-nbsp-split",
          lineIndex: line.lineIndex,
          textExcerpt: trimmed,
          detailKo: `프랑스어 비분리 부호('${firstChar}')가 행두로 분리됨`,
          excessPx: 0,
        });
      } else if (i > 0 || chars.length === 1) {
        lineStartKinsokuCount += 1;
        violations.push({
          kind: "line-start-kinsoku",
          lineIndex: line.lineIndex,
          textExcerpt: trimmed,
          detailKo: `행두금칙 문자('${firstChar}')가 줄 머리에 위치함`,
          excessPx: 0,
        });
      }
    }

    if (lastChar.length > 0 && isLineEndForbiddenChar(lastChar, locale)) {
      lineEndKinsokuCount += 1;
      if (locale === "es-ES" && SPANISH_OPENER_SET.has(lastChar)) {
        violations.push({
          kind: "spanish-opener-split",
          lineIndex: line.lineIndex,
          textExcerpt: trimmed,
          detailKo: `스페인어 여는 부호('${lastChar}')가 행말에 고립됨`,
          excessPx: 0,
        });
      } else if (locale === "fr-FR" && lastChar === "«") {
        violations.push({
          kind: "french-nbsp-split",
          lineIndex: line.lineIndex,
          textExcerpt: trimmed,
          detailKo: "프랑스어 여는 길메('«')가 다음 단어와 분리돼 행말에 고립됨",
          excessPx: 0,
        });
      } else {
        violations.push({
          kind: "line-end-kinsoku",
          lineIndex: line.lineIndex,
          textExcerpt: trimmed,
          detailKo: `행말금칙 문자('${lastChar}')가 줄 끝에 고립됨`,
          excessPx: 0,
        });
      }
    }

    const overflowPx = line.widthPx - line.availableChordWidthPx;
    if (overflowPx > 0.25) {
      horizontalOverflowCount += 1;
      if (overflowPx > maxOverflowPx) maxOverflowPx = overflowPx;
      violations.push({
        kind: "horizontal-overflow",
        lineIndex: line.lineIndex,
        textExcerpt: trimmed,
        detailKo: `말풍선 안전 현 너비를 ${overflowPx.toFixed(1)}px 초과함`,
        excessPx: Math.round(overflowPx * 100) / 100,
      });
    }
  }

  if (
    availableTextHeightPx !== undefined &&
    lineHeightPx !== undefined &&
    Number.isFinite(availableTextHeightPx) &&
    Number.isFinite(lineHeightPx) &&
    lines.length > 0
  ) {
    const verticalExcess = lines.length * lineHeightPx - availableTextHeightPx;
    if (verticalExcess > 0.25) {
      verticalOverflowCount = 1;
      if (verticalExcess > maxOverflowPx) maxOverflowPx = verticalExcess;
      violations.push({
        kind: "vertical-overflow",
        lineIndex: lines.length - 1,
        textExcerpt: lines[lines.length - 1]?.text ?? "",
        detailKo: `말풍선 안전 높이를 ${verticalExcess.toFixed(1)}px 초과함`,
        excessPx: Math.round(verticalExcess * 100) / 100,
      });
    }
  }

  if (lines.length >= 2) {
    const lastLine = lines[lines.length - 1];
    if (lastLine) {
      const speakable =
        lastLine.speakableCharCount !== undefined
          ? lastLine.speakableCharCount
          : countSpeakableChars(lastLine.text);
      const isCjk = locale === "ko-KR" || locale === "ja-JP";
      let isWidow = false;
      if (isCjk) {
        if (speakable <= 1) isWidow = true;
      } else {
        const lastWords = countSpaceWords(lastLine.text);
        if (
          speakable <= 1 ||
          (totalWords >= 4 &&
            lastWords <= 1 &&
            (speakable <= 4 || (maxLineWidth > 0 && lastLine.widthPx < maxLineWidth * 0.34)))
        ) {
          isWidow = true;
        }
      }
      if (isWidow) {
        widowCount = 1;
        violations.push({
          kind: "widow-last-line",
          lineIndex: lastLine.lineIndex,
          textExcerpt: lastLine.text.trim(),
          detailKo: `막줄 고아행(Widow) 발생: '${lastLine.text.trim()}'`,
          excessPx: 0,
        });
      }
    }
  }

  const overflowLineCount = horizontalOverflowCount + verticalOverflowCount;
  return {
    violations,
    lineStartKinsokuCount,
    lineEndKinsokuCount,
    overflowLineCount,
    horizontalOverflowCount,
    verticalOverflowCount,
    widowCount,
    totalViolationCount: violations.length,
    maxOverflowPx: Math.round(maxOverflowPx * 100) / 100,
    isClean: violations.length === 0,
  };
}
