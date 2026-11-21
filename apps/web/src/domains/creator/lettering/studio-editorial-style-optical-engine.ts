/**
 * Studio Editorial Style Sheets, Optical Margin Alignment, Multi-Master Graph & Print Preflight
 *
 * Adobe InDesign 수준의 편집 조판 엔진(계층형 문단·문자 스타일 시트, 광학 여백 정렬,
 * 다중 마스터 상속 + 로컬 해제, Primary Text Frame 스레딩, 도련·DPI·CMYK·폰트 Rights BOM 프리플라이트).
 */

import { normalizeMasterElement, type MasterElementLike } from "../studio-master-page";

import { isKinsokuNoLineEnd, isKinsokuNoLineStart, segmentGraphemes } from "./studio-kinsoku-line-break";

// ---------------------------------------------------------------------------
// 1. 계층형 문단 · 문자 스타일 시트 (Paragraph & Character Style Sheets)
// ---------------------------------------------------------------------------

export type EditorialTextAlign = "left" | "right" | "center" | "justify";
export type NormalizedRgbaTuple = readonly [number, number, number, number];

export interface CharacterStyleAttributes {
  readonly fontFamily?: string; readonly fontWeight?: number; readonly fontStyle?: "normal" | "italic";
  readonly fontSizePx?: number; readonly trackingEm?: number; readonly baselineShiftPx?: number;
  readonly fillRgba?: NormalizedRgbaTuple; readonly underline?: boolean; readonly allCaps?: boolean;
}

export interface CharacterStyleDefinition {
  readonly id: string; readonly name: string; readonly basedOnId?: string; readonly attributes: CharacterStyleAttributes;
}

export interface NestedStyleRule {
  readonly id: string; readonly characterStyleId: string; readonly mode: "delimiter" | "regex";
  readonly delimiter?: string; readonly includeDelimiter?: boolean;
  readonly pattern?: string; readonly flags?: string; readonly maxMatches?: number;
}

export interface ParagraphStyleAttributes {
  readonly fontFamily?: string; readonly fontWeight?: number; readonly fontStyle?: "normal" | "italic";
  readonly fontSizePx?: number; readonly lineHeightRatio?: number; readonly trackingEm?: number;
  readonly fillRgba?: NormalizedRgbaTuple; readonly align?: EditorialTextAlign;
  readonly spaceBeforePx?: number; readonly spaceAfterPx?: number; readonly firstLineIndentPx?: number;
  readonly leftIndentPx?: number; readonly rightIndentPx?: number; readonly opticalMarginEnabled?: boolean;
  readonly opticalMarginScale?: number; readonly ignoreOpticalMargin?: boolean; readonly kinsokuEnabled?: boolean;
}

export interface ParagraphStyleDefinition {
  readonly id: string; readonly name: string; readonly basedOnId?: string; readonly nextStyleId?: string;
  readonly attributes: ParagraphStyleAttributes; readonly nestedStyles?: readonly NestedStyleRule[];
}

export interface EditorialStyleSheet {
  readonly paragraphStyles: Readonly<Record<string, ParagraphStyleDefinition>>;
  readonly characterStyles: Readonly<Record<string, CharacterStyleDefinition>>;
}

export interface ResolvedParagraphStyle {
  readonly styleId: string; readonly fontFamily: string; readonly fontWeight: number; readonly fontStyle: "normal" | "italic";
  readonly fontSizePx: number; readonly lineHeightRatio: number; readonly trackingEm: number; readonly fillRgba: NormalizedRgbaTuple;
  readonly align: EditorialTextAlign; readonly spaceBeforePx: number; readonly spaceAfterPx: number; readonly firstLineIndentPx: number;
  readonly leftIndentPx: number; readonly rightIndentPx: number; readonly opticalMarginEnabled: boolean;
  readonly opticalMarginScale: number; readonly ignoreOpticalMargin: boolean; readonly kinsokuEnabled: boolean;
  readonly nestedStyles: readonly NestedStyleRule[];
}

export interface ResolvedCharacterStyle {
  readonly styleId: string; readonly fontFamily: string; readonly fontWeight: number; readonly fontStyle: "normal" | "italic";
  readonly fontSizePx: number; readonly trackingEm: number; readonly baselineShiftPx: number;
  readonly fillRgba: NormalizedRgbaTuple; readonly underline: boolean; readonly allCaps: boolean;
}

export interface StyleResolutionReport<TResolved> {
  readonly resolved: TResolved; readonly inheritanceChain: readonly string[]; readonly cycleDetected: boolean; readonly overriddenKeys: readonly string[];
}

export interface InlineCharacterOverrideRange {
  readonly start: number; readonly end: number; readonly characterStyleId?: string; readonly localOverrides?: CharacterStyleAttributes;
}

export interface StyledTextRun {
  readonly start: number; readonly end: number; readonly text: string; readonly characterStyleId?: string; readonly style: ResolvedCharacterStyle;
}

const DEFAULT_PARAGRAPH_STYLE: Omit<ResolvedParagraphStyle, "styleId" | "nestedStyles"> = {
  fontFamily: "Pretendard", fontWeight: 400, fontStyle: "normal", fontSizePx: 14, lineHeightRatio: 1.5,
  trackingEm: 0, fillRgba: [0.1, 0.1, 0.12, 1], align: "left", spaceBeforePx: 0, spaceAfterPx: 6,
  firstLineIndentPx: 0, leftIndentPx: 0, rightIndentPx: 0, opticalMarginEnabled: true, opticalMarginScale: 1,
  ignoreOpticalMargin: false, kinsokuEnabled: true,
};

function mergeDefined<T extends object>(base: T, patch: Partial<T> | undefined): { merged: T; changedKeys: string[] } {
  if (!patch) return { merged: base, changedKeys: [] };
  const next = { ...base } as Record<string, unknown>;
  const changedKeys: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      next[key] = value;
      changedKeys.push(key);
    }
  }
  return { merged: next as T, changedKeys };
}

function walkInheritanceChain<T extends { readonly id: string; readonly basedOnId?: string }>(
  map: Readonly<Record<string, T>>,
  startId: string | undefined,
): { chain: T[]; cycleDetected: boolean } {
  const visited = new Set<string>();
  const chain: T[] = [];
  let cursor = startId;
  let cycleDetected = false;
  while (cursor) {
    if (visited.has(cursor)) {
      cycleDetected = true;
      break;
    }
    const def = map[cursor];
    if (!def) break;
    visited.add(cursor);
    chain.push(def);
    cursor = def.basedOnId;
  }
  chain.reverse();
  return { chain, cycleDetected };
}

/** 문단 스타일의 부모 체인을 루트부터 해석하고 순환 상속을 차단한다. */
export function resolveParagraphStyle(
  sheet: EditorialStyleSheet,
  styleId: string,
  localOverrides?: ParagraphStyleAttributes,
): StyleResolutionReport<ResolvedParagraphStyle> {
  const { chain, cycleDetected } = walkInheritanceChain(sheet.paragraphStyles, styleId);
  let acc: Omit<ResolvedParagraphStyle, "styleId" | "nestedStyles"> = { ...DEFAULT_PARAGRAPH_STYLE };
  let nestedStyles: readonly NestedStyleRule[] = [];
  for (const def of chain) {
    acc = mergeDefined(acc, def.attributes).merged;
    if (def.nestedStyles) nestedStyles = def.nestedStyles;
  }
  const applied = mergeDefined(acc, localOverrides);
  return { resolved: { styleId, ...applied.merged, nestedStyles }, inheritanceChain: chain.map((d) => d.id), cycleDetected, overriddenKeys: applied.changedKeys };
}

/** 문자 스타일을 문단 기저 스타일 위에 부모 상속 + 로컬 오버라이드 순으로 해석한다. */
export function resolveCharacterStyle(
  sheet: EditorialStyleSheet,
  styleId: string | undefined,
  baseParagraph: ResolvedParagraphStyle,
  localOverrides?: CharacterStyleAttributes,
): StyleResolutionReport<ResolvedCharacterStyle> {
  const { chain, cycleDetected } = walkInheritanceChain(sheet.characterStyles, styleId);
  let acc: Omit<ResolvedCharacterStyle, "styleId"> = {
    fontFamily: baseParagraph.fontFamily, fontWeight: baseParagraph.fontWeight, fontStyle: baseParagraph.fontStyle,
    fontSizePx: baseParagraph.fontSizePx, trackingEm: baseParagraph.trackingEm, baselineShiftPx: 0,
    fillRgba: baseParagraph.fillRgba, underline: false, allCaps: false,
  };
  for (const def of chain) acc = mergeDefined(acc, def.attributes).merged;
  const applied = mergeDefined(acc, localOverrides);
  return { resolved: { styleId: styleId ?? "", ...applied.merged }, inheritanceChain: chain.map((d) => d.id), cycleDetected, overriddenKeys: applied.changedKeys };
}

/** Nested Styles(구분자/정규식)와 인라인 문자 오버라이드를 합성해 구간별 런 배열을 생성한다. */
export function resolveStyledTextRuns(
  text: string,
  sheet: EditorialStyleSheet,
  paragraphStyleId: string,
  inlineRanges: readonly InlineCharacterOverrideRange[] = [],
  paragraphOverrides?: ParagraphStyleAttributes,
): StyledTextRun[] {
  if (text.length === 0) return [];
  const paragraph = resolveParagraphStyle(sheet, paragraphStyleId, paragraphOverrides).resolved;
  const collected: InlineCharacterOverrideRange[] = [];

  for (const rule of paragraph.nestedStyles) {
    if (rule.mode === "delimiter" && rule.delimiter) {
      const idx = text.indexOf(rule.delimiter);
      if (idx >= 0) {
        const end = rule.includeDelimiter ? idx + rule.delimiter.length : idx;
        if (end > 0) collected.push({ start: 0, end, characterStyleId: rule.characterStyleId });
      }
    } else if (rule.mode === "regex" && rule.pattern) {
      const safeFlags = (rule.flags ?? "g").includes("g") ? rule.flags ?? "g" : `${rule.flags ?? ""}g`;
      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, safeFlags);
      } catch {
        continue;
      }
      const maxMatches = Math.min(rule.maxMatches ?? 64, 256);
      let count = 0;
      let match = regex.exec(text);
      while (match && count < maxMatches) {
        const matched = match[0] ?? "";
        if (matched.length === 0) regex.lastIndex += 1;
        else {
          collected.push({ start: match.index, end: match.index + matched.length, characterStyleId: rule.characterStyleId });
          count += 1;
        }
        match = regex.exec(text);
      }
    }
  }

  for (const r of inlineRanges) {
    const start = Math.max(0, Math.min(text.length, Math.floor(r.start)));
    const end = Math.max(start, Math.min(text.length, Math.floor(r.end)));
    if (end > start) collected.push({ start, end, characterStyleId: r.characterStyleId, localOverrides: r.localOverrides });
  }

  const boundaries = [...new Set<number>([0, text.length, ...collected.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
  const runs: StyledTextRun[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    let activeStyleId: string | undefined;
    let mergedOverrides: CharacterStyleAttributes = {};
    for (const r of collected) {
      if (r.start <= start && r.end >= end) {
        if (r.characterStyleId) activeStyleId = r.characterStyleId;
        if (r.localOverrides) mergedOverrides = mergeDefined(mergedOverrides, r.localOverrides).merged;
      }
    }
    const resolvedChar = resolveCharacterStyle(sheet, activeStyleId, paragraph, mergedOverrides).resolved;
    const rawSlice = text.slice(start, end);
    runs.push({ start, end, text: resolvedChar.allCaps ? rawSlice.toUpperCase() : rawSlice, characterStyleId: activeStyleId, style: resolvedChar });
  }
  return runs;
}

// ---------------------------------------------------------------------------
// 2. 광학 여백 정렬 (Optical Margin Alignment) + 금칙처리 줄바꿈
// ---------------------------------------------------------------------------

export const OPTICAL_MARGIN_LEADING_EM: Readonly<Record<string, number>> = Object.freeze({
  "“": 0.45, "‘": 0.38, "\"": 0.4, "'": 0.35, "「": 0.5, "『": 0.5, "〈": 0.45, "《": 0.48,
  "(": 0.3, "[": 0.28, A: 0.16, V: 0.16, W: 0.14, T: 0.16, Y: 0.16, J: 0.12,
});

export const OPTICAL_MARGIN_TRAILING_EM: Readonly<Record<string, number>> = Object.freeze({
  "”": 0.45, "’": 0.38, "\"": 0.4, "'": 0.35, "」": 0.5, "』": 0.5, "〉": 0.45, "》": 0.48,
  ")": 0.3, "]": 0.28, ".": 0.52, ",": 0.52, "。": 0.55, "、": 0.55, "-": 0.45, "—": 0.32,
  "–": 0.38, ":": 0.35, ";": 0.35, "!": 0.32, "?": 0.28, "…": 0.32, A: 0.16, V: 0.16, W: 0.14, T: 0.16, Y: 0.16, L: 0.14,
});

export interface OpticalMarginMetrics {
  readonly leadingHangPx: number; readonly trailingHangPx: number; readonly xOffsetPx: number;
  readonly leadingChar: string; readonly trailingChar: string;
}

export function computeOpticalMarginAdjustment(
  lineText: string,
  fontSizePx: number,
  options?: { readonly enabled?: boolean; readonly ignoreParagraph?: boolean; readonly scale?: number; readonly align?: EditorialTextAlign },
): OpticalMarginMetrics {
  const trimmed = lineText.trim();
  if (trimmed.length === 0 || options?.enabled === false || options?.ignoreParagraph === true) {
    return { leadingHangPx: 0, trailingHangPx: 0, xOffsetPx: 0, leadingChar: "", trailingChar: "" };
  }
  const graphemes = segmentGraphemes(trimmed);
  const leadingChar = graphemes[0] ?? "";
  const trailingChar = graphemes[graphemes.length - 1] ?? "";
  const scale = Math.max(0, Math.min(2, options?.scale ?? 1));
  const align = options?.align ?? "left";
  const leadingHangPx = align === "left" || align === "justify" ? (OPTICAL_MARGIN_LEADING_EM[leadingChar] ?? 0) * fontSizePx * scale : 0;
  const trailingHangPx = align === "right" || align === "justify" ? (OPTICAL_MARGIN_TRAILING_EM[trailingChar] ?? 0) * fontSizePx * scale : 0;
  return { leadingHangPx, trailingHangPx, xOffsetPx: align === "right" ? trailingHangPx : align === "center" ? 0 : -leadingHangPx, leadingChar, trailingChar };
}

export interface EditorialLayoutLine {
  readonly lineIndex: number; readonly text: string; readonly widthPx: number;
  readonly xOffsetPx: number; readonly yOffsetPx: number; readonly leadingHangPx: number; readonly trailingHangPx: number;
}

export interface EditorialParagraphLayoutResult {
  readonly lines: readonly EditorialLayoutLine[]; readonly totalHeightPx: number; readonly oversetText: string; readonly oversetCharCount: number;
}

function defaultMeasureTextWidth(text: string, fontSizePx: number, trackingEm: number): number {
  let width = 0;
  const graphemes = segmentGraphemes(text);
  for (const g of graphemes) {
    const cp = g.codePointAt(0) ?? 0;
    const isWide = (cp >= 0x1100 && cp <= 0xd7af) || (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xff00 && cp <= 0xffef);
    width += fontSizePx * (isWide ? 1 : g === " " ? 0.34 : 0.56);
  }
  return graphemes.length > 1 ? width + (graphemes.length - 1) * fontSizePx * trackingEm : width;
}

/** 금칙처리 + 광학 여백 돌출을 함께 적용해 문단 행 레이아웃과 오버셋(넘침)을 산출한다. */
export function layoutEditorialParagraph(
  text: string,
  boxWidthPx: number,
  style: ResolvedParagraphStyle,
  options?: { readonly maxHeightPx?: number; readonly measureWidth?: (slice: string) => number },
): EditorialParagraphLayoutResult {
  const measure = options?.measureWidth ?? ((s: string) => defaultMeasureTextWidth(s, style.fontSizePx, style.trackingEm));
  const innerWidth = Math.max(style.fontSizePx, boxWidthPx - style.leftIndentPx - style.rightIndentPx);
  const lineStepPx = style.fontSizePx * style.lineHeightRatio;
  const maxLines = options?.maxHeightPx !== undefined ? Math.max(0, Math.floor((options.maxHeightPx - style.spaceBeforePx) / lineStepPx)) : Number.POSITIVE_INFINITY;

  const rawLines: string[] = [];
  for (const para of text.split("\n")) {
    const graphemes = segmentGraphemes(para);
    if (graphemes.length === 0) {
      rawLines.push("");
      continue;
    }
    let cursor = 0;
    let isFirst = true;
    while (cursor < graphemes.length) {
      const availWidth = Math.max(style.fontSizePx, innerWidth - (isFirst ? style.firstLineIndentPx : 0));
      let end = cursor + 1;
      while (end < graphemes.length && measure(graphemes.slice(cursor, end + 1).join("")) <= availWidth) end += 1;
      if (style.kinsokuEnabled && end < graphemes.length && end - cursor > 1) {
        while (end - cursor > 1 && (isKinsokuNoLineStart(graphemes[end]) || isKinsokuNoLineEnd(graphemes[end - 1]))) end -= 1;
      }
      rawLines.push(graphemes.slice(cursor, end).join(""));
      cursor = end;
      isFirst = false;
    }
  }

  const fitted = rawLines.slice(0, maxLines);
  const oversetText = rawLines.slice(maxLines).join("\n");
  const lines: EditorialLayoutLine[] = fitted.map((lineText, idx) => {
    const optical = computeOpticalMarginAdjustment(lineText, style.fontSizePx, {
      enabled: style.opticalMarginEnabled, ignoreParagraph: style.ignoreOpticalMargin, scale: style.opticalMarginScale, align: style.align,
    });
    return {
      lineIndex: idx, text: lineText, widthPx: measure(lineText),
      xOffsetPx: style.leftIndentPx + (idx === 0 ? style.firstLineIndentPx : 0) + optical.xOffsetPx,
      yOffsetPx: style.spaceBeforePx + idx * lineStepPx, leadingHangPx: optical.leadingHangPx, trailingHangPx: optical.trailingHangPx,
    };
  });

  return { lines, totalHeightPx: style.spaceBeforePx + lines.length * lineStepPx + style.spaceAfterPx, oversetText, oversetCharCount: segmentGraphemes(oversetText).length };
}

// ---------------------------------------------------------------------------
// 3. 다중 마스터 페이지 상속 그래프 & Primary Text Frame 자동 스레딩
// ---------------------------------------------------------------------------

export interface EditorialMasterElement extends MasterElementLike {
  readonly kind: "text" | "image" | "frame" | "decoration";
  readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number;
  readonly primaryTextSlotId?: string; readonly label?: string;
}

export interface ParentPageNode {
  readonly id: string; readonly name: string; readonly basedOnParentId?: string; readonly elements: readonly EditorialMasterElement[];
}

export interface PageLocalMasterOverride {
  readonly elementId: string; readonly detached?: boolean; readonly hidden?: boolean; readonly patch?: Partial<Omit<EditorialMasterElement, "id">>;
}

export interface EditorialBleedSpec { readonly topMm: number; readonly rightMm: number; readonly bottomMm: number; readonly leftMm: number }
export interface PreflightTextFrame { readonly id: string; readonly text: string; readonly widthPx: number; readonly heightPx: number; readonly paragraphStyleId: string; readonly oversetCharCount?: number }
export interface PreflightImageAsset {
  readonly id: string; readonly assetName: string; readonly naturalWidthPx: number; readonly naturalHeightPx: number;
  readonly placedXMm: number; readonly placedYMm: number; readonly placedWidthMm: number; readonly placedHeightMm: number;
  readonly colorSpace: "cmyk" | "srgb" | "grayscale"; readonly intendedFullBleed?: boolean;
}
export interface PreflightFontUsage { readonly fontFamily: string; readonly licenseStatus: "verified-commercial" | "personal-only" | "missing"; readonly allowPdfEmbed: boolean }

export interface EditorialPageDocument {
  readonly id: string; readonly pageNumber: number; readonly widthMm: number; readonly heightMm: number; readonly bleed: EditorialBleedSpec;
  readonly parentPageId?: string; readonly hideMaster?: boolean; readonly localMasterOverrides?: readonly PageLocalMasterOverride[];
  readonly elements: readonly EditorialMasterElement[]; readonly textFrames?: readonly PreflightTextFrame[];
  readonly images?: readonly PreflightImageAsset[]; readonly fontsUsed?: readonly PreflightFontUsage[];
}

export interface ComposedParentPageResult {
  readonly elements: readonly EditorialMasterElement[]; readonly parentChain: readonly string[];
  readonly cycleDetected: boolean; readonly detachedElementIds: readonly string[];
}

/** 다중 마스터 상속(`Parent A -> Parent B`) + 페이지 로컬 해제/오버라이드를 합성한다. */
export function composePageWithParentGraph(
  parentPages: Readonly<Record<string, ParentPageNode>>,
  page: EditorialPageDocument,
): ComposedParentPageResult {
  if (page.hideMaster || !page.parentPageId) {
    return { elements: [...page.elements], parentChain: [], cycleDetected: false, detachedElementIds: [] };
  }
  const visited = new Set<string>();
  const chain: ParentPageNode[] = [];
  let cursor: string | undefined = page.parentPageId;
  let cycleDetected = false;
  while (cursor) {
    if (visited.has(cursor)) {
      cycleDetected = true;
      break;
    }
    const node: ParentPageNode | undefined = parentPages[cursor];
    if (!node) break;
    visited.add(cursor);
    chain.push(node);
    cursor = node.basedOnParentId;
  }
  chain.reverse();

  const overrideMap = new Map((page.localMasterOverrides ?? []).map((ov) => [ov.elementId, ov]));
  const inheritedById = new Map<string, EditorialMasterElement>();
  for (const parent of chain) {
    for (const rawEl of parent.elements) {
      if (!rawEl.hidden) inheritedById.set(rawEl.id, normalizeMasterElement(rawEl));
    }
  }

  const masterComposed: EditorialMasterElement[] = [];
  const detachedElementIds: string[] = [];
  for (const baseEl of inheritedById.values()) {
    const ov = overrideMap.get(baseEl.id);
    if (ov?.hidden) continue;
    if (ov?.detached || ov?.patch) {
      detachedElementIds.push(baseEl.id);
      masterComposed.push({ ...baseEl, ...(ov.patch ?? {}), locked: false, noClip: false });
    } else {
      masterComposed.push({ ...baseEl, locked: true, noClip: true });
    }
  }
  return { elements: [...masterComposed, ...page.elements], parentChain: chain.map((n) => n.id), cycleDetected, detachedElementIds };
}

export interface ThreadedPageTextSlice { readonly pageId: string; readonly frameId: string; readonly lines: readonly EditorialLayoutLine[]; readonly remainingOversetCharCount: number }

/** 연속된 페이지의 Primary Text Frame으로 긴 원고를 자동 스레딩 배치한다. */
export function threadPrimaryTextAcrossPages(
  storyText: string,
  frames: readonly { readonly pageId: string; readonly frameId: string; readonly widthPx: number; readonly heightPx: number }[],
  style: ResolvedParagraphStyle,
): { readonly slices: readonly ThreadedPageTextSlice[]; readonly finalOversetText: string } {
  const slices: ThreadedPageTextSlice[] = [];
  let remaining = storyText;
  for (const frame of frames) {
    if (remaining.length === 0) {
      slices.push({ pageId: frame.pageId, frameId: frame.frameId, lines: [], remainingOversetCharCount: 0 });
      continue;
    }
    const layout = layoutEditorialParagraph(remaining, frame.widthPx, style, { maxHeightPx: frame.heightPx });
    remaining = layout.oversetText;
    slices.push({ pageId: frame.pageId, frameId: frame.frameId, lines: layout.lines, remainingOversetCharCount: layout.oversetCharCount });
  }
  return { slices, finalOversetText: remaining };
}

// ---------------------------------------------------------------------------
// 4. 출판 프리플라이트 & 폰트 Rights BOM 감사 (Bleed / Overset / DPI / CMYK)
// ---------------------------------------------------------------------------

export type PreflightSeverity = "error" | "warning";
export type PreflightIssueCode =
  | "overset-text" | "insufficient-bleed" | "low-resolution-image" | "rgb-in-cmyk-print"
  | "font-license-missing" | "font-license-noncommercial" | "font-embedding-restricted" | "master-cycle-detected";

export interface EditorialPreflightIssue {
  readonly code: PreflightIssueCode; readonly severity: PreflightSeverity;
  readonly pageId: string; readonly pageNumber: number; readonly targetId: string; readonly messageKo: string;
}

export interface FontRightsAuditEntry {
  readonly fontFamily: string; readonly licenseStatus: "verified-commercial" | "personal-only" | "missing";
  readonly allowPdfEmbed: boolean; readonly pageNumbers: readonly number[]; readonly commercialPrintAllowed: boolean;
}

export interface EditorialPreflightOptions {
  readonly targetProfile?: "cmyk-print" | "digital-rgb"; readonly requiredBleedMm?: number;
  readonly minImageDpi?: number; readonly errorImageDpi?: number; readonly requireCommercialFontRights?: boolean;
}

export interface EditorialPreflightReport {
  readonly publishReady: boolean; readonly errorCount: number; readonly warningCount: number;
  readonly issues: readonly EditorialPreflightIssue[]; readonly fontRightsReport: readonly FontRightsAuditEntry[]; readonly checkedPageCount: number;
}

const MM_PER_INCH = 25.4;

export function runEditorialPublicationPreflight(
  pages: readonly EditorialPageDocument[],
  styleSheet: EditorialStyleSheet,
  parentPages: Readonly<Record<string, ParentPageNode>> = {},
  options: EditorialPreflightOptions = {},
): EditorialPreflightReport {
  const targetProfile = options.targetProfile ?? "cmyk-print";
  const requiredBleedMm = options.requiredBleedMm ?? 3;
  const minImageDpi = options.minImageDpi ?? 300;
  const errorImageDpi = options.errorImageDpi ?? 150;
  const requireCommercial = options.requireCommercialFontRights ?? true;
  const issues: EditorialPreflightIssue[] = [];
  const fontMap = new Map<string, { licenseStatus: "verified-commercial" | "personal-only" | "missing"; allowPdfEmbed: boolean; pages: Set<number> }>();

  const pushIssue = (page: EditorialPageDocument, code: PreflightIssueCode, severity: PreflightSeverity, targetId: string, messageKo: string): void => {
    issues.push({ code, severity, pageId: page.id, pageNumber: page.pageNumber, targetId, messageKo });
  };

  for (const page of pages) {
    if (composePageWithParentGraph(parentPages, page).cycleDetected) {
      pushIssue(page, "master-cycle-detected", "error", page.parentPageId ?? page.id, "마스터 페이지 상속 체인에 순환 참조가 감지되었습니다.");
    }
    const bleedShort = page.bleed.topMm < requiredBleedMm || page.bleed.rightMm < requiredBleedMm || page.bleed.bottomMm < requiredBleedMm || page.bleed.leftMm < requiredBleedMm;
    if (targetProfile === "cmyk-print" && bleedShort) {
      pushIssue(page, "insufficient-bleed", "error", page.id, `페이지 도련 설정이 최소 기준(${requiredBleedMm}mm)보다 작습니다.`);
    }
    for (const frame of page.textFrames ?? []) {
      const style = resolveParagraphStyle(styleSheet, frame.paragraphStyleId).resolved;
      const overset = frame.oversetCharCount ?? layoutEditorialParagraph(frame.text, frame.widthPx, style, { maxHeightPx: frame.heightPx }).oversetCharCount;
      if (overset > 0) pushIssue(page, "overset-text", "error", frame.id, `텍스트 프레임(${frame.id})에서 ${overset}자가 상자 밖으로 넘쳤습니다.`);
    }
    for (const img of page.images ?? []) {
      const effectiveDpi = Math.min(img.naturalWidthPx / Math.max(0.01, img.placedWidthMm / MM_PER_INCH), img.naturalHeightPx / Math.max(0.01, img.placedHeightMm / MM_PER_INCH));
      if (effectiveDpi < minImageDpi) {
        pushIssue(page, "low-resolution-image", effectiveDpi < errorImageDpi ? "error" : "warning", img.id, `이미지(${img.assetName}) 유효 해상도가 ${Math.round(effectiveDpi)}DPI로 기준(${minImageDpi}DPI) 미만입니다.`);
      }
      if (targetProfile === "cmyk-print" && img.colorSpace === "srgb") {
        pushIssue(page, "rgb-in-cmyk-print", "warning", img.id, `CMYK 인쇄 대상에 변환되지 않은 RGB 이미지(${img.assetName})가 포함되어 있습니다.`);
      }
      if (img.intendedFullBleed && targetProfile === "cmyk-print") {
        const covered = img.placedXMm <= -requiredBleedMm && img.placedYMm <= -requiredBleedMm && img.placedXMm + img.placedWidthMm >= page.widthMm + requiredBleedMm && img.placedYMm + img.placedHeightMm >= page.heightMm + requiredBleedMm;
        if (!covered) pushIssue(page, "insufficient-bleed", "error", img.id, `전면 배경 이미지(${img.assetName})가 ${requiredBleedMm}mm 재단 도련선 밖까지 확장되지 않았습니다.`);
      }
    }
    for (const font of page.fontsUsed ?? []) {
      const prev = fontMap.get(font.fontFamily);
      if (prev) {
        prev.pages.add(page.pageNumber);
        if (font.licenseStatus === "missing") prev.licenseStatus = "missing";
        else if (font.licenseStatus === "personal-only" && prev.licenseStatus === "verified-commercial") prev.licenseStatus = "personal-only";
        prev.allowPdfEmbed = prev.allowPdfEmbed && font.allowPdfEmbed;
      } else {
        fontMap.set(font.fontFamily, { licenseStatus: font.licenseStatus, allowPdfEmbed: font.allowPdfEmbed, pages: new Set([page.pageNumber]) });
      }
      if (font.licenseStatus === "missing") pushIssue(page, "font-license-missing", "error", font.fontFamily, `폰트(${font.fontFamily})의 라이선스 증빙이 누락되었습니다.`);
      else if (requireCommercial && font.licenseStatus === "personal-only") pushIssue(page, "font-license-noncommercial", "error", font.fontFamily, `폰트(${font.fontFamily})는 비상업 전용으로 상업 출판에 사용할 수 없습니다.`);
      if (!font.allowPdfEmbed) pushIssue(page, "font-embedding-restricted", "warning", font.fontFamily, `폰트(${font.fontFamily})는 PDF 임베딩이 제한되어 외곽선 변환이 필요합니다.`);
    }
  }

  const fontRightsReport: FontRightsAuditEntry[] = [...fontMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fontFamily, entry]) => ({
      fontFamily, licenseStatus: entry.licenseStatus, allowPdfEmbed: entry.allowPdfEmbed,
      pageNumbers: [...entry.pages].sort((a, b) => a - b), commercialPrintAllowed: entry.licenseStatus === "verified-commercial",
    }));

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return { publishReady: errorCount === 0, errorCount, warningCount: issues.length - errorCount, issues, fontRightsReport, checkedPageCount: pages.length };
}
