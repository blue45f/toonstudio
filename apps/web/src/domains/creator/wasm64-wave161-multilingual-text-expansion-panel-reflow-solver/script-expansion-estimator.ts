/**
 * Wave 161 — 6개국어 문자 체계별 조판 프로파일 및 결정론적 말풍선 박스 확장 추정기.
 *
 * - 한국어(ko)·일본어(ja)·중국어 번체(zh-Hant): CJK 격자 줄바꿈 및 행두 문장부호 회피
 * - 영어(en)·인도네시아어(id): 단어 경계 줄바꿈 및 초장문 복합어 하이픈 분할
 * - 태국어(th): 결합 모음·성조 클러스터 분리 금지 및 >= 1.22x 수직 헤드룸 확보
 */

import {
  resolveReflowConstraints,
  type BalloonElementKind,
  type BalloonOverflowStatus,
  type LocaleTypographyProfile,
  type LocalizedBalloonEstimate,
  type ReflowSolverConstraints,
  type TextBlockSpec,
  type WebtoonLocalizationLocale,
} from "./multilingual-reflow-types";

/** 6개 웹툰 현지화 언어의 결정론적 조판 프로파일 테이블. */
export const LOCALE_TYPOGRAPHY_PROFILES: Readonly<
  Record<WebtoonLocalizationLocale, LocaleTypographyProfile>
> = {
  ko: {
    locale: "ko",
    displayNameKo: "한국어",
    nativeLabel: "한국어",
    wrappingMode: "cjk-grid",
    charExpansionFactor: 1.0,
    averageGlyphWidthEm: 0.94,
    baseLineHeightRatio: 1.34,
    diacriticHeadroomMultiplier: 1.0,
    minReadabilityFontPx: 13.5,
    horizontalPaddingScale: 1.0,
    verticalPaddingScale: 1.0,
    prefersVerticalWriting: false,
  },
  en: {
    locale: "en",
    displayNameKo: "영어",
    nativeLabel: "English",
    wrappingMode: "latin-word",
    charExpansionFactor: 1.32,
    averageGlyphWidthEm: 0.56,
    baseLineHeightRatio: 1.28,
    diacriticHeadroomMultiplier: 1.0,
    minReadabilityFontPx: 12.5,
    horizontalPaddingScale: 1.04,
    verticalPaddingScale: 1.0,
    prefersVerticalWriting: false,
  },
  ja: {
    locale: "ja",
    displayNameKo: "일본어",
    nativeLabel: "日本語",
    wrappingMode: "cjk-grid",
    charExpansionFactor: 1.08,
    averageGlyphWidthEm: 0.97,
    baseLineHeightRatio: 1.36,
    diacriticHeadroomMultiplier: 1.02,
    minReadabilityFontPx: 13.5,
    horizontalPaddingScale: 1.0,
    verticalPaddingScale: 1.02,
    prefersVerticalWriting: true,
  },
  "zh-Hant": {
    locale: "zh-Hant",
    displayNameKo: "중국어 번체",
    nativeLabel: "繁體中文",
    wrappingMode: "cjk-grid",
    charExpansionFactor: 0.78,
    averageGlyphWidthEm: 0.99,
    baseLineHeightRatio: 1.32,
    diacriticHeadroomMultiplier: 1.0,
    minReadabilityFontPx: 14.0,
    horizontalPaddingScale: 0.96,
    verticalPaddingScale: 0.98,
    prefersVerticalWriting: true,
  },
  th: {
    locale: "th",
    displayNameKo: "태국어",
    nativeLabel: "ภาษาไทย",
    wrappingMode: "thai-cluster",
    charExpansionFactor: 1.18,
    averageGlyphWidthEm: 0.64,
    baseLineHeightRatio: 1.34,
    diacriticHeadroomMultiplier: 1.26,
    minReadabilityFontPx: 14.5,
    horizontalPaddingScale: 1.04,
    verticalPaddingScale: 1.24,
    prefersVerticalWriting: false,
  },
  id: {
    locale: "id",
    displayNameKo: "인도네시아어",
    nativeLabel: "Bahasa Indonesia",
    wrappingMode: "latin-word",
    charExpansionFactor: 1.38,
    averageGlyphWidthEm: 0.57,
    baseLineHeightRatio: 1.28,
    diacriticHeadroomMultiplier: 1.0,
    minReadabilityFontPx: 12.5,
    horizontalPaddingScale: 1.05,
    verticalPaddingScale: 1.0,
    prefersVerticalWriting: false,
  },
};

const THAI_COMBINING_MARKS = new Set<number>([
  0x0e31, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e38, 0x0e39, 0x0e3a,
  0x0e47, 0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, 0x0e4d, 0x0e4e,
]);

const LINE_START_AVOID_PUNCT = new Set<string>([
  ".", ",", "!", "?", ":", ";", ")", "]", "。", "、", "」", "』", "】", "）", "！", "？", "…",
]);

const NARROW_LATIN_CHARS = new Set<string>([
  "i", "l", "I", "1", "j", "t", "f", "r", ".", ",", "!", ":", ";", "'", "|", "(", ")", "-",
]);

const WIDE_LATIN_CHARS = new Set<string>(["W", "M", "w", "m", "@", "%", "#"]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 태국어 결합 모음·성조 코드포인트 여부를 판정한다. */
export function isThaiCombiningMark(ch: string): boolean {
  return ch.length > 0 && THAI_COMBINING_MARKS.has(ch.charCodeAt(0));
}

function isCjkCodePoint(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

/** 로케일과 폰트 크기 기준 유효 행간(px)을 계산한다(태국어 성조 여유 포함). */
export function computeEffectiveLineHeightPx(
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): number {
  return round2(fontSizePx * profile.baseLineHeightRatio * profile.diacriticHeadroomMultiplier);
}

/** 단일 문자의 수평 전진 폭(px)을 계산한다. */
export function measureCharAdvancePx(
  ch: string,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): number {
  if (ch === " " || ch === "\t") return fontSizePx * 0.31;
  const code = ch.charCodeAt(0);
  if (THAI_COMBINING_MARKS.has(code)) return 0;
  if (isCjkCodePoint(code)) {
    return fontSizePx * (profile.wrappingMode === "cjk-grid" ? profile.averageGlyphWidthEm : 0.95);
  }
  if (code >= 0x0e00 && code <= 0x0e7f) return fontSizePx * 0.64;
  if (NARROW_LATIN_CHARS.has(ch)) return fontSizePx * 0.36;
  if (WIDE_LATIN_CHARS.has(ch)) return fontSizePx * 0.84;
  if (code >= 0x41 && code <= 0x5a) return fontSizePx * 0.68;
  if ((code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39)) return fontSizePx * 0.54;
  return fontSizePx * profile.averageGlyphWidthEm;
}

/** 문자열 한 줄의 수평 폭(px)을 측정한다. */
export function measureTextWidthPx(
  text: string,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): number {
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += measureCharAdvancePx(text[i] ?? "", fontSizePx, profile);
  }
  return round2(width);
}

/** 태국어 문자열을 결합 모음·성조가 분리되지 않는 그래핌 클러스터 배열로 분해한다. */
export function segmentThaiClusters(text: string): string[] {
  const clusters: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (isThaiCombiningMark(ch) && clusters.length > 0) {
      const prevIdx = clusters.length - 1;
      clusters[prevIdx] = `${clusters[prevIdx] ?? ""}${ch}`;
    } else {
      clusters.push(ch);
    }
  }
  return clusters;
}

function splitLongWordToFit(
  word: string,
  maxWidthPx: number,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): string[] {
  const pieces: string[] = [];
  const hyphenWidth = measureCharAdvancePx("-", fontSizePx, profile);
  let current = "";
  let currentWidth = 0;

  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i] ?? "";
    const chWidth = measureCharAdvancePx(ch, fontSizePx, profile);
    const reserveHyphen = i < word.length - 1 && current.length >= 2 ? hyphenWidth : 0;

    if (current.length > 0 && currentWidth + chWidth + reserveHyphen > maxWidthPx) {
      pieces.push(
        current.length >= 2 && currentWidth + hyphenWidth <= maxWidthPx ? `${current}-` : current,
      );
      current = ch;
      currentWidth = chWidth;
    } else {
      current += ch;
      currentWidth += chWidth;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

function wrapLatinParagraph(
  paragraph: string,
  maxWidthPx: number,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): string[] {
  const tokens = paragraph.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [""];

  const lines: string[] = [];
  const spaceWidth = measureCharAdvancePx(" ", fontSizePx, profile);
  let currentLine = "";
  let currentWidth = 0;

  for (const token of tokens) {
    const tokenWidth = measureTextWidthPx(token, fontSizePx, profile);
    if (tokenWidth > maxWidthPx) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = "";
        currentWidth = 0;
      }
      const chunks = splitLongWordToFit(token, maxWidthPx, fontSizePx, profile);
      for (let idx = 0; idx < chunks.length; idx += 1) {
        const chunk = chunks[idx] ?? "";
        if (idx < chunks.length - 1) {
          lines.push(chunk);
        } else {
          currentLine = chunk;
          currentWidth = measureTextWidthPx(chunk, fontSizePx, profile);
        }
      }
      continue;
    }
    if (currentLine.length === 0) {
      currentLine = token;
      currentWidth = tokenWidth;
    } else if (currentWidth + spaceWidth + tokenWidth <= maxWidthPx) {
      currentLine = `${currentLine} ${token}`;
      currentWidth += spaceWidth + tokenWidth;
    } else {
      lines.push(currentLine);
      currentLine = token;
      currentWidth = tokenWidth;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}

function wrapUnitSequence(
  units: readonly string[],
  maxWidthPx: number,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): string[] {
  if (units.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const unit of units) {
    const unitWidth = measureTextWidthPx(unit, fontSizePx, profile);
    if (current.length > 0 && currentWidth + unitWidth > maxWidthPx) {
      if (LINE_START_AVOID_PUNCT.has(unit) && currentWidth + unitWidth <= maxWidthPx + fontSizePx * 0.55) {
        lines.push(`${current}${unit}`);
        current = "";
        currentWidth = 0;
        continue;
      }
      lines.push(current.trimEnd());
      if (unit === " ") {
        current = "";
        currentWidth = 0;
      } else {
        current = unit;
        currentWidth = unitWidth;
      }
    } else {
      current += unit;
      currentWidth += unitWidth;
    }
  }
  if (current.length > 0) lines.push(current.trimEnd());
  return lines;
}

/** 로케일 문자 체계에 맞춰 문자열을 안전하게 줄바꿈한다. */
export function wrapLocalizedText(
  text: string,
  maxInnerWidthPx: number,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): readonly string[] {
  const safeWidth = Math.max(fontSizePx * 1.4, maxInnerWidthPx);
  const allLines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const trimmed = paragraph.trim();
    if (profile.wrappingMode === "latin-word") {
      allLines.push(...wrapLatinParagraph(trimmed, safeWidth, fontSizePx, profile));
    } else if (profile.wrappingMode === "thai-cluster") {
      allLines.push(...wrapUnitSequence(segmentThaiClusters(trimmed), safeWidth, fontSizePx, profile));
    } else {
      allLines.push(...wrapUnitSequence(trimmed.split(""), safeWidth, fontSizePx, profile));
    }
  }
  return allLines.length > 0 ? allLines : [""];
}

/** 말풍선·효과음 종류별 내부 패딩(px)을 계산한다. */
export function computeBalloonPaddingPx(
  kind: BalloonElementKind,
  fontSizePx: number,
  profile: LocaleTypographyProfile,
): { readonly padX: number; readonly padY: number } {
  const lineH = computeEffectiveLineHeightPx(fontSizePx, profile);
  const ratios: Readonly<Record<BalloonElementKind, readonly [number, number, number, number]>> = {
    speech: [12, 0.95, 10, 0.52],
    thought: [14, 1.15, 12, 0.62],
    narration: [10, 0.72, 8, 0.42],
    sfx: [6, 0.42, 6, 0.34],
    "background-sign": [8, 0.54, 6, 0.38],
  };
  const [minX, xRatio, minY, yRatio] = ratios[kind];
  return {
    padX: Math.round(Math.max(minX, fontSizePx * xRatio * profile.horizontalPaddingScale)),
    padY: Math.round(Math.max(minY, lineH * yRatio * profile.verticalPaddingScale)),
  };
}

function synthesizeProjectedText(baselineText: string, profile: LocaleTypographyProfile): string {
  const cleanLen = Math.max(1, baselineText.replace(/\s+/g, "").length);
  const targetChars = Math.max(2, Math.round(cleanLen * profile.charExpansionFactor));
  if (profile.wrappingMode === "latin-word") {
    const words = ["panel", "dialogue", "studio", "horizon", "resolve", "chapter", "moment"];
    const out: string[] = [];
    for (let len = 0, idx = 0; len < targetChars; idx += 1) {
      const w = words[idx % words.length] ?? "word";
      out.push(w);
      len += w.length + 1;
    }
    return out.join(" ");
  }
  if (profile.wrappingMode === "thai-cluster") {
    return "ก่า".repeat(Math.max(1, Math.ceil(targetChars / 2)));
  }
  const unit = profile.locale === "zh-Hant" ? "漢" : profile.locale === "ja" ? "あ" : "가";
  return unit.repeat(targetChars);
}

interface LayoutEvaluation {
  readonly fontPx: number;
  readonly effectiveLineHeightPx: number;
  readonly lines: readonly string[];
  readonly maxLineWidthPx: number;
  readonly requiredInnerHeightPx: number;
  readonly requiredOuterWidthPx: number;
  readonly requiredOuterHeightPx: number;
}

function evaluateBoxLayout(
  text: string,
  outerWidthPx: number,
  fontPx: number,
  kind: BalloonElementKind,
  profile: LocaleTypographyProfile,
): LayoutEvaluation {
  const { padX, padY } = computeBalloonPaddingPx(kind, fontPx, profile);
  const effectiveLineHeightPx = computeEffectiveLineHeightPx(fontPx, profile);
  const availableInnerWidth = Math.max(fontPx * 2, outerWidthPx - padX * 2);
  const lines = wrapLocalizedText(text, availableInnerWidth, fontPx, profile);
  let maxLineWidthPx = 0;
  for (const line of lines) {
    const w = measureTextWidthPx(line, fontPx, profile);
    if (w > maxLineWidthPx) maxLineWidthPx = w;
  }
  const requiredInnerHeightPx = round2(lines.length * effectiveLineHeightPx);
  return {
    fontPx: round2(fontPx),
    effectiveLineHeightPx,
    lines,
    maxLineWidthPx: round2(maxLineWidthPx),
    requiredInnerHeightPx,
    requiredOuterWidthPx: Math.ceil(maxLineWidthPx + padX * 2),
    requiredOuterHeightPx: Math.ceil(requiredInnerHeightPx + padY * 2),
  };
}

/** 추정기 선택적 컷 컨텍스트 옵션. */
export interface EstimateBalloonOptions {
  readonly panelWidthPx?: number;
  readonly panelBaselineHeightPx?: number;
  readonly constraints?: Partial<ReflowSolverConstraints>;
}

/**
 * 단일 말풍선·효과음 블록의 대상 로케일 레이아웃 크기·폰트·오버플로우 상태를 추정한다.
 *
 * 에스컬레이션: `fits` → `font-adjusted`(>= minReadabilityFontPx) → `balloon-expanded` → `panel-reflow-required`
 */
export function estimateLocalizedBalloonBox(
  block: TextBlockSpec,
  locale: WebtoonLocalizationLocale,
  options?: EstimateBalloonOptions,
): LocalizedBalloonEstimate {
  const profile = LOCALE_TYPOGRAPHY_PROFILES[locale];
  const constraints = resolveReflowConstraints(options?.constraints);
  const panelWidthPx = options?.panelWidthPx ?? Math.max(block.baselineRect.width * 2, 800);
  const panelBaselineHeightPx = options?.panelBaselineHeightPx;

  const explicitText = block.localizedTexts[locale];
  const usedSyntheticProjection =
    locale !== "ko" && (explicitText === undefined || explicitText.trim().length === 0);
  const resolvedText =
    locale === "ko"
      ? block.baselineText
      : usedSyntheticProjection
        ? synthesizeProjectedText(block.baselineText, profile)
        : (explicitText ?? block.baselineText);

  const baselineWidth = Math.max(36, Math.round(block.baselineRect.width));
  const baselineHeight = Math.max(28, Math.round(block.baselineRect.height));
  const startingFontPx = Math.max(block.baselineFontPx, profile.minReadabilityFontPx);
  const minAllowedFontPx = round2(
    Math.max(profile.minReadabilityFontPx, block.baselineFontPx * constraints.minFontScaleRatio),
  );
  const gentleFontFloorPx = round2(Math.max(minAllowedFontPx, startingFontPx * 0.91));

  const maxOuterWidthPx = Math.max(
    baselineWidth,
    Math.min(
      panelWidthPx - constraints.panelSafeMarginPx * 2,
      Math.round(baselineWidth * (block.maxWidthExpansionRatio ?? 1.36)),
    ),
  );
  const maxOuterHeightPx = Math.round(baselineHeight * (block.maxHeightExpansionRatio ?? 1.95));

  const baselineEval = evaluateBoxLayout(resolvedText, baselineWidth, startingFontPx, block.kind, profile);
  let chosenEval = baselineEval;
  let overflowStatus: BalloonOverflowStatus = "fits";
  let unresolvableOverflowPx = 0;

  const fitsBaseline =
    baselineEval.requiredOuterHeightPx <= baselineHeight &&
    baselineEval.requiredOuterWidthPx <= baselineWidth;

  if (!fitsBaseline) {
    let fontAdjustedFit: LayoutEvaluation | null = null;
    for (let f = startingFontPx - 0.5; f >= gentleFontFloorPx - 1e-6; f -= 0.5) {
      const candidateFont = Math.max(gentleFontFloorPx, round2(f));
      const candidateEval = evaluateBoxLayout(resolvedText, baselineWidth, candidateFont, block.kind, profile);
      if (
        candidateEval.requiredOuterHeightPx <= baselineHeight &&
        candidateEval.requiredOuterWidthPx <= baselineWidth
      ) {
        fontAdjustedFit = candidateEval;
        break;
      }
      if (candidateFont <= gentleFontFloorPx) break;
    }

    if (fontAdjustedFit !== null) {
      chosenEval = fontAdjustedFit;
      overflowStatus = "font-adjusted";
    } else {
      let expandedEval = evaluateBoxLayout(resolvedText, maxOuterWidthPx, startingFontPx, block.kind, profile);
      if (expandedEval.requiredOuterHeightPx > maxOuterHeightPx && startingFontPx > minAllowedFontPx) {
        expandedEval = evaluateBoxLayout(resolvedText, maxOuterWidthPx, minAllowedFontPx, block.kind, profile);
      }
      const snugOuterWidth = Math.min(
        maxOuterWidthPx,
        Math.max(baselineWidth, expandedEval.requiredOuterWidthPx),
      );
      chosenEval = evaluateBoxLayout(resolvedText, snugOuterWidth, expandedEval.fontPx, block.kind, profile);

      const exceedsBalloonHeightLimit = chosenEval.requiredOuterHeightPx > maxOuterHeightPx;
      const exceedsPanelHeadroom =
        panelBaselineHeightPx !== undefined &&
        block.baselineRect.y + chosenEval.requiredOuterHeightPx >
          panelBaselineHeightPx - constraints.panelSafeMarginPx;

      if (exceedsBalloonHeightLimit || exceedsPanelHeadroom) {
        overflowStatus = "panel-reflow-required";
        if (exceedsBalloonHeightLimit) {
          unresolvableOverflowPx = Math.max(0, chosenEval.requiredOuterHeightPx - maxOuterHeightPx);
        }
      } else {
        overflowStatus = "balloon-expanded";
      }
    }
  }

  const koProfile = LOCALE_TYPOGRAPHY_PROFILES.ko;
  const koRefEval = evaluateBoxLayout(
    block.baselineText,
    baselineWidth,
    Math.max(block.baselineFontPx, koProfile.minReadabilityFontPx),
    block.kind,
    koProfile,
  );
  const koArea = Math.max(1, koRefEval.requiredOuterWidthPx * koRefEval.requiredOuterHeightPx);
  const expansionRatio = round2((chosenEval.requiredOuterWidthPx * chosenEval.requiredOuterHeightPx) / koArea);

  return {
    blockId: block.blockId,
    kind: block.kind,
    locale,
    text: resolvedText,
    usedSyntheticProjection,
    baselineCharCount: block.baselineText.replace(/\s+/g, "").length,
    localizedCharCount: resolvedText.replace(/\s+/g, "").length,
    expansionRatio,
    baselineFontPx: block.baselineFontPx,
    resolvedFontPx: chosenEval.fontPx,
    effectiveLineHeightPx: chosenEval.effectiveLineHeightPx,
    wrappedLines: chosenEval.lines,
    lineCount: chosenEval.lines.length,
    requiredInnerWidthPx: chosenEval.maxLineWidthPx,
    requiredInnerHeightPx: chosenEval.requiredInnerHeightPx,
    requiredOuterWidthPx: chosenEval.requiredOuterWidthPx,
    requiredOuterHeightPx: chosenEval.requiredOuterHeightPx,
    baselineOuterWidthPx: baselineWidth,
    baselineOuterHeightPx: baselineHeight,
    widthDeltaPx: chosenEval.requiredOuterWidthPx - baselineWidth,
    heightDeltaPx: chosenEval.requiredOuterHeightPx - baselineHeight,
    overflowStatus,
    unresolvableOverflowPx,
  };
}
