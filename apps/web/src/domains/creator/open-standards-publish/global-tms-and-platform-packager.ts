/**
 * 글로벌 다국어 번역 TMS(Google Sheets CSV · Crowdin/Lokalise XLIFF 2.0) 양방향 브리지
 * 및 7대 웹툰·출판 플랫폼(네이버·카카오·레진·WEBTOON Canvas·Piccoma·Tapas·PDF/X-4)
 * 원클릭 출고 패키저 & 규격 사전 판정기.
 */

import {
  canonicalizeJson,
  sha256Hex,
  verifyC2paManifestIntegrity,
  type C2paIntegrityVerificationResult,
  type C2paProvenanceManifest,
  type ColorSpaceProfileId,
} from "./c2pa-provenance-and-standards";

// === 1. TMS 다국어 대사 시트 (Google Sheets CSV / Crowdin · Lokalise XLIFF 2.0) ===

export type TmsLocaleCode = "ko" | "en" | "ja" | "th" | "id";
export type TmsExportFormat = "google-sheets-csv" | "crowdin-xliff-2.0" | "lokalise-xliff-2.0";
export type BalloonWritingMode = "horizontal-tb" | "vertical-rl";

export interface ScriptBalloonUnit {
  readonly unitId: string; readonly cutIndex: number; readonly speaker: string;
  readonly kind: "dialogue" | "narration" | "sfx" | "whisper"; readonly sourceText: string;
  readonly boxWidthPx: number; readonly boxHeightPx: number; readonly paddingPx: number;
  readonly fontSizePx: number; readonly lineHeightRatio: number;
  readonly writingMode?: BalloonWritingMode; readonly maxLines?: number; readonly contextNote?: string;
}
export interface TmsExportOptions {
  readonly workId: string; readonly sourceLocale: TmsLocaleCode; readonly targetLocale: TmsLocaleCode;
  readonly format: TmsExportFormat; readonly units: readonly ScriptBalloonUnit[];
  readonly existingTranslations?: Readonly<Record<string, string>>;
}
export interface TmsExportPackage {
  readonly format: TmsExportFormat; readonly sourceLocale: TmsLocaleCode; readonly targetLocale: TmsLocaleCode;
  readonly filename: string; readonly mimeType: "text/csv;charset=utf-8" | "application/xliff+xml;charset=utf-8";
  readonly unitCount: number; readonly payload: string; readonly payloadSha256: string;
}
export interface TmsBalloonFitItem {
  readonly unitId: string; readonly cutIndex: number; readonly speaker: string;
  readonly translatedText: string; readonly writingMode: BalloonWritingMode;
  readonly status: "fit" | "tight-autoshrink" | "overflow-blocked" | "missing"; readonly safeToInsert: boolean;
  readonly originalFontSizePx: number; readonly appliedFontSizePx: number; readonly recommendedFontSizePx: number;
  readonly estimatedLinesOrColumns: number; readonly capacityLinesOrColumns: number; readonly overflowRatio: number;
  readonly reasonKo: string; readonly reasonEn: string;
}
export interface TmsImportFitOptions { readonly allowAutoShrink?: boolean; readonly minReadableFontSizePx?: number; }
export interface TmsImportFitReport {
  readonly format: TmsExportFormat; readonly targetLocale: TmsLocaleCode; readonly totalUnits: number;
  readonly fitCount: number; readonly autoShrunkCount: number; readonly overflowBlockedCount: number; readonly missingCount: number;
  readonly unmatchedIds: readonly string[]; readonly allSafe: boolean; readonly items: readonly TmsBalloonFitItem[];
  readonly appliedTranslations: Readonly<Record<string, { readonly text: string; readonly fontSizePx: number; readonly writingMode: BalloonWritingMode }>>;
}

const escapeCsvField = (raw: string): string =>
  /[",\r\n]/.test(raw) ? `"${raw.replaceAll("\"", "\"\"")}"` : raw;

const escapeXmlText = (raw: string): string =>
  raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");

const unescapeXmlText = (raw: string): string =>
  raw.replaceAll("&quot;", "\"").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

function resolveEffectiveWritingMode(unit: ScriptBalloonUnit, targetLocale: TmsLocaleCode): BalloonWritingMode {
  if (unit.writingMode) return unit.writingMode;
  if (targetLocale === "ja" && unit.kind !== "sfx") return "vertical-rl";
  return "horizontal-tb";
}

/** 말풍선·SFX 대사를 Google Sheets CSV 또는 Crowdin/Lokalise XLIFF 2.0 포맷으로 추출한다. */
export function exportScriptToTmsPackage(options: TmsExportOptions): TmsExportPackage {
  const safeWork = options.workId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "episode";
  const translations = options.existingTranslations ?? {};

  if (options.format === "google-sheets-csv") {
    const header = [
      "unit_id", "cut_index", "kind", "speaker", "writing_mode",
      "box_w_px", "box_h_px", "font_px", `source_${options.sourceLocale}`, `target_${options.targetLocale}`, "context_note",
    ].join(",");
    const rows = options.units.map((u) => {
      const mode = resolveEffectiveWritingMode(u, options.targetLocale);
      return [
        u.unitId, String(u.cutIndex), u.kind, u.speaker, mode,
        String(Math.round(u.boxWidthPx)), String(Math.round(u.boxHeightPx)), String(u.fontSizePx),
        u.sourceText, translations[u.unitId] ?? "", u.contextNote ?? "",
      ].map(escapeCsvField).join(",");
    });
    const payload = [header, ...rows].join("\n");
    return {
      format: options.format, sourceLocale: options.sourceLocale, targetLocale: options.targetLocale,
      filename: `${safeWork}_${options.sourceLocale}-to-${options.targetLocale}_sheets.csv`,
      mimeType: "text/csv;charset=utf-8", unitCount: options.units.length,
      payload, payloadSha256: sha256Hex(payload),
    };
  }

  const vendorTag = options.format === "crowdin-xliff-2.0" ? "crowdin" : "lokalise";
  const unitBlocks = options.units.map((u) => {
    const mode = resolveEffectiveWritingMode(u, options.targetLocale);
    const trg = translations[u.unitId] ?? "";
    const meta = `cut=${u.cutIndex};kind=${u.kind};speaker=${u.speaker};mode=${mode};box=${Math.round(u.boxWidthPx)}x${Math.round(u.boxHeightPx)};font=${u.fontSizePx}px`;
    const noteLine = u.contextNote ? `\n        <note category="context">${escapeXmlText(u.contextNote)}</note>` : "";
    return [
      `    <unit id="${escapeXmlText(u.unitId)}" name="${escapeXmlText(`${u.speaker}#${u.cutIndex}`)}">`,
      "      <notes>",
      `        <note category="balloon-geometry">${escapeXmlText(meta)}</note>${noteLine}`,
      "      </notes>",
      "      <segment>",
      `        <source>${escapeXmlText(u.sourceText)}</source>`,
      `        <target>${escapeXmlText(trg)}</target>`,
      "      </segment>",
      "    </unit>",
    ].join("\n");
  });

  const payload = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="${options.sourceLocale}" trgLang="${options.targetLocale}">`,
    `  <file id="${escapeXmlText(safeWork)}" original="${escapeXmlText(`${safeWork}.${vendorTag}.script`)}">`,
    ...unitBlocks,
    "  </file>",
    "</xliff>",
  ].join("\n");

  return {
    format: options.format, sourceLocale: options.sourceLocale, targetLocale: options.targetLocale,
    filename: `${safeWork}_${options.targetLocale}_${vendorTag}.xlf`,
    mimeType: "application/xliff+xml;charset=utf-8", unitCount: options.units.length,
    payload, payloadSha256: sha256Hex(payload),
  };
}

function parseRfc4180Csv(payload: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = payload.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field); rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function parseTmsPayload(payload: string, format: TmsExportFormat): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (format === "google-sheets-csv") {
    const rows = parseRfc4180Csv(payload);
    const header = rows[0] ?? [];
    const idCol = Math.max(0, header.findIndex((h) => h.trim().toLowerCase() === "unit_id"));
    let trgCol = header.findIndex((h) => h.trim().toLowerCase().startsWith("target"));
    if (trgCol < 0) trgCol = Math.max(1, header.length - 1);
    for (let i = 1; i < rows.length; i += 1) {
      const cells = rows[i];
      const uid = cells?.[idCol]?.trim();
      if (uid) map.set(uid, cells?.[trgCol] ?? "");
    }
    return map;
  }

  const unitRegex = /<unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/unit>/g;
  let match = unitRegex.exec(payload);
  while (match !== null) {
    const uid = unescapeXmlText(match[1] ?? "");
    const body = match[2] ?? "";
    const trgMatch = /<target\b[^>]*>([\s\S]*?)<\/target>/.exec(body);
    if (uid) map.set(uid, unescapeXmlText(trgMatch?.[1] ?? ""));
    match = unitRegex.exec(payload);
  }
  return map;
}

const isThaiCombiningMark = (code: number): boolean =>
  code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);

const isWideCjkChar = (code: number): boolean =>
  (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3000 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xff01 && code <= 0xff60);

function measureCharAdvanceRatio(ch: string, locale: TmsLocaleCode, vertical: boolean): number {
  const code = ch.charCodeAt(0);
  if (isThaiCombiningMark(code)) return 0;
  if (vertical) return isWideCjkChar(code) ? 1.0 : 0.62;
  if (isWideCjkChar(code)) return 0.98;
  if (ch === " ") return 0.34;
  if (locale === "th") return 0.58;
  return /[MW@#%&]/.test(ch) ? 0.78 : /[iljtI1.,;:'!]/.test(ch) ? 0.34 : 0.56;
}

function measureStringWidthPx(text: string, fontSizePx: number, locale: TmsLocaleCode, vertical: boolean): number {
  let sum = 0;
  for (const ch of text) sum += measureCharAdvanceRatio(ch, locale, vertical) * fontSizePx;
  return sum;
}

function evaluateBalloonFitAtFont(
  text: string,
  unit: ScriptBalloonUnit,
  locale: TmsLocaleCode,
  writingMode: BalloonWritingMode,
  fontSizePx: number,
): { readonly fits: boolean; readonly count: number; readonly capacity: number; readonly overflowRatio: number } {
  const innerW = Math.max(16, unit.boxWidthPx - unit.paddingPx * 2);
  const innerH = Math.max(16, unit.boxHeightPx - unit.paddingPx * 2);
  const hasThaiMarks = locale === "th" || /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(text);
  const effectiveLineHeight = Math.max(unit.lineHeightRatio, hasThaiMarks ? 1.32 : 1.15);
  const stridePx = fontSizePx * effectiveLineHeight;
  const paragraphs = text.split("\n");

  if (writingMode === "vertical-rl") {
    let columns = 0;
    for (const para of paragraphs) {
      if (para.length === 0) { columns += 1; continue; }
      let colH = 0;
      columns += 1;
      for (const ch of para) {
        const adv = measureCharAdvanceRatio(ch, locale, true) * fontSizePx;
        if (colH > 0 && colH + adv > innerH) { columns += 1; colH = adv; }
        else colH += adv;
      }
    }
    const maxCap = Math.min(unit.maxLines ?? 999, Math.max(1, Math.floor(innerW / stridePx)));
    const usedW = columns * stridePx;
    const ratio = Number((usedW / innerW).toFixed(3));
    return { fits: usedW <= innerW && columns <= maxCap, count: columns, capacity: maxCap, overflowRatio: ratio };
  }

  let lines = 0;
  const wordWrapLocale = locale === "en" || locale === "id";
  for (const para of paragraphs) {
    if (para.length === 0) { lines += 1; continue; }
    if (wordWrapLocale) {
      const words = para.trim().split(/\s+/);
      let lineW = 0;
      lines += 1;
      const spaceW = measureCharAdvanceRatio(" ", locale, false) * fontSizePx;
      for (const word of words) {
        const wordW = measureStringWidthPx(word, fontSizePx, locale, false);
        if (wordW > innerW) {
          if (lineW > 0) { lines += 1; }
          const extraLines = Math.ceil(wordW / innerW);
          lines += Math.max(0, extraLines - 1);
          lineW = wordW % innerW || innerW;
        } else if (lineW > 0 && lineW + spaceW + wordW > innerW) {
          lines += 1; lineW = wordW;
        } else {
          lineW = lineW > 0 ? lineW + spaceW + wordW : wordW;
        }
      }
    } else {
      let lineW = 0;
      lines += 1;
      for (const ch of para) {
        const adv = measureCharAdvanceRatio(ch, locale, false) * fontSizePx;
        if (lineW > 0 && lineW + adv > innerW) { lines += 1; lineW = adv; }
        else lineW += adv;
      }
    }
  }
  const maxCap = Math.min(unit.maxLines ?? 999, Math.max(1, Math.floor(innerH / stridePx)));
  const usedH = lines * stridePx;
  const ratio = Number((usedH / innerH).toFixed(3));
  return { fits: usedH <= innerH && lines <= maxCap, count: lines, capacity: maxCap, overflowRatio: ratio };
}

/** 다국어 TMS 번역본(CSV/XLIFF 2.0)을 회수해 말풍선 폭·높이·JA 세로쓰기·폰트 오버플로 검사 후 안전 역삽입한다. */
export function importTmsTranslationsWithFitCheck(
  units: readonly ScriptBalloonUnit[],
  payload: string,
  format: TmsExportFormat,
  targetLocale: TmsLocaleCode,
  options: TmsImportFitOptions = {},
): TmsImportFitReport {
  const allowAutoShrink = options.allowAutoShrink ?? true;
  const minReadableFont = Math.max(8, options.minReadableFontSizePx ?? 10);
  const parsed = parseTmsPayload(payload, format);
  const knownIds = new Set(units.map((u) => u.unitId));
  const unmatchedIds = [...parsed.keys()].filter((id) => !knownIds.has(id));

  const items: TmsBalloonFitItem[] = [];
  const appliedTranslations: Record<string, { readonly text: string; readonly fontSizePx: number; readonly writingMode: BalloonWritingMode }> = {};
  let fitCount = 0; let autoShrunkCount = 0; let overflowBlockedCount = 0; let missingCount = 0;

  for (const unit of units) {
    const writingMode = resolveEffectiveWritingMode(unit, targetLocale);
    const translated = (parsed.get(unit.unitId) ?? "").trim();
    if (translated.length === 0) {
      missingCount += 1;
      items.push({
        unitId: unit.unitId, cutIndex: unit.cutIndex, speaker: unit.speaker, translatedText: "", writingMode,
        status: "missing", safeToInsert: false, originalFontSizePx: unit.fontSizePx, appliedFontSizePx: unit.fontSizePx,
        recommendedFontSizePx: unit.fontSizePx, estimatedLinesOrColumns: 0, capacityLinesOrColumns: 1, overflowRatio: 0,
        reasonKo: "번역 문구가 비어 있어 역삽입을 건너뛰었습니다.", reasonEn: "Empty translation skipped.",
      });
      continue;
    }

    const baseEval = evaluateBalloonFitAtFont(translated, unit, targetLocale, writingMode, unit.fontSizePx);
    if (baseEval.fits) {
      fitCount += 1;
      appliedTranslations[unit.unitId] = { text: translated, fontSizePx: unit.fontSizePx, writingMode };
      items.push({
        unitId: unit.unitId, cutIndex: unit.cutIndex, speaker: unit.speaker, translatedText: translated, writingMode,
        status: "fit", safeToInsert: true, originalFontSizePx: unit.fontSizePx, appliedFontSizePx: unit.fontSizePx,
        recommendedFontSizePx: unit.fontSizePx, estimatedLinesOrColumns: baseEval.count,
        capacityLinesOrColumns: baseEval.capacity, overflowRatio: baseEval.overflowRatio,
        reasonKo: writingMode === "vertical-rl" ? `세로쓰기 ${baseEval.count}/${baseEval.capacity}열 안전 적합` : `${baseEval.count}/${baseEval.capacity}줄 말풍선 안전 적합`,
        reasonEn: writingMode === "vertical-rl" ? `Fits vertical-rl (${baseEval.count}/${baseEval.capacity} cols)` : `Fits balloon (${baseEval.count}/${baseEval.capacity} lines)`,
      });
      continue;
    }

    let fittedSize: number | null = null;
    for (let candidate = unit.fontSizePx - 1; candidate >= minReadableFont; candidate -= 1) {
      if (evaluateBalloonFitAtFont(translated, unit, targetLocale, writingMode, candidate).fits) {
        fittedSize = candidate;
        break;
      }
    }

    if (fittedSize !== null) {
      autoShrunkCount += 1;
      const safe = allowAutoShrink;
      if (safe) appliedTranslations[unit.unitId] = { text: translated, fontSizePx: fittedSize, writingMode };
      items.push({
        unitId: unit.unitId, cutIndex: unit.cutIndex, speaker: unit.speaker, translatedText: translated, writingMode,
        status: "tight-autoshrink", safeToInsert: safe, originalFontSizePx: unit.fontSizePx,
        appliedFontSizePx: safe ? fittedSize : unit.fontSizePx, recommendedFontSizePx: fittedSize,
        estimatedLinesOrColumns: baseEval.count, capacityLinesOrColumns: baseEval.capacity, overflowRatio: baseEval.overflowRatio,
        reasonKo: `폰트 ${unit.fontSizePx}px→${fittedSize}px 축소로 안전 수용(${(baseEval.overflowRatio * 100).toFixed(0)}%)`,
        reasonEn: `Fits safely after shrinking ${unit.fontSizePx}px→${fittedSize}px (${(baseEval.overflowRatio * 100).toFixed(0)}%)`,
      });
    } else {
      overflowBlockedCount += 1;
      items.push({
        unitId: unit.unitId, cutIndex: unit.cutIndex, speaker: unit.speaker, translatedText: translated, writingMode,
        status: "overflow-blocked", safeToInsert: false, originalFontSizePx: unit.fontSizePx,
        appliedFontSizePx: unit.fontSizePx, recommendedFontSizePx: minReadableFont,
        estimatedLinesOrColumns: baseEval.count, capacityLinesOrColumns: baseEval.capacity, overflowRatio: baseEval.overflowRatio,
        reasonKo: `최소 가독 크기(${minReadableFont}px)에서도 말풍선 초과(${(baseEval.overflowRatio * 100).toFixed(0)}%) · 역삽입 차단`,
        reasonEn: `Overflows balloon even at ${minReadableFont}px (${(baseEval.overflowRatio * 100).toFixed(0)}%) · blocked`,
      });
    }
  }

  return {
    format, targetLocale, totalUnits: units.length, fitCount, autoShrunkCount, overflowBlockedCount, missingCount,
    unmatchedIds, allSafe: overflowBlockedCount === 0 && missingCount === 0, items, appliedTranslations,
  };
}

// === 2. 글로벌 7대 웹툰·출판 플랫폼 원클릭 출고 패키저 ===

export type PublishPlatformId =
  | "naver-webtoon" | "kakao-page" | "lezhin-comics" | "webtoon-canvas" | "piccoma-jp" | "tapas" | "print-pdf-x4";
export type SubmissionImageFormat = "jpeg" | "png" | "gif" | "pdf-x4";
export type PiccomaOrientation = "vertical-smartoon" | "horizontal-spread";

export interface PlatformSpecRule {
  readonly id: PublishPlatformId; readonly labelKo: string; readonly labelEn: string;
  readonly allowedWidthsPx: readonly number[];
  readonly horizontalWidthRangePx?: readonly [number, number]; readonly horizontalHeightRangePx?: readonly [number, number];
  readonly allowedFormats: readonly SubmissionImageFormat[];
  readonly maxSliceHeightPx: number; readonly preferredSliceHeightPx: number;
  readonly maxFileBytes: number; readonly maxTotalBytes: number; readonly maxSliceCount: number;
  readonly requiredColorSpace: ColorSpaceProfileId;
  readonly minDpi?: number; readonly minBleedMm?: number; readonly maxTacPercent?: number;
  readonly requiresGlobalRights: boolean; readonly requiresPrintRights: boolean;
  readonly specSummaryKo: string; readonly specSummaryEn: string;
}

const MIB = 1024 * 1024;

export const PLATFORM_SPEC_CATALOG: Readonly<Record<PublishPlatformId, PlatformSpecRule>> = {
  "naver-webtoon": {
    id: "naver-webtoon", labelKo: "네이버 웹툰", labelEn: "Naver Webtoon",
    allowedWidthsPx: [690, 800], allowedFormats: ["jpeg", "png"],
    maxSliceHeightPx: 20000, preferredSliceHeightPx: 1280, maxFileBytes: 20 * MIB, maxTotalBytes: 100 * MIB, maxSliceCount: 100,
    requiredColorSpace: "sRGB", requiresGlobalRights: false, requiresPrintRights: false,
    specSummaryKo: "가로 690/800px · JPG/PNG · 컷당 20MB 이하 · sRGB", specSummaryEn: "690/800px wide · JPG/PNG · <=20MB/cut · sRGB",
  },
  "kakao-page": {
    id: "kakao-page", labelKo: "카카오페이지", labelEn: "KakaoPage",
    allowedWidthsPx: [720], allowedFormats: ["jpeg", "png"],
    maxSliceHeightPx: 1600, preferredSliceHeightPx: 1280, maxFileBytes: 10 * MIB, maxTotalBytes: 80 * MIB, maxSliceCount: 120,
    requiredColorSpace: "sRGB", requiresGlobalRights: false, requiresPrintRights: false,
    specSummaryKo: "가로 720px · 세이프 슬라이스 <=1600px · 10MB 이하", specSummaryEn: "720px wide · Safe slice <=1600px · <=10MB",
  },
  "lezhin-comics": {
    id: "lezhin-comics", labelKo: "레진코믹스", labelEn: "Lezhin Comics",
    allowedWidthsPx: [1280], allowedFormats: ["jpeg", "png"],
    maxSliceHeightPx: 10000, preferredSliceHeightPx: 1600, maxFileBytes: 15 * MIB, maxTotalBytes: 120 * MIB, maxSliceCount: 100,
    requiredColorSpace: "sRGB", requiresGlobalRights: false, requiresPrintRights: false,
    specSummaryKo: "가로 1280px 고해상도 · JPG/PNG · 15MB 이하", specSummaryEn: "1280px HD · JPG/PNG · <=15MB/cut",
  },
  "webtoon-canvas": {
    id: "webtoon-canvas", labelKo: "WEBTOON Canvas", labelEn: "WEBTOON Canvas",
    allowedWidthsPx: [800], allowedFormats: ["jpeg", "png"],
    maxSliceHeightPx: 1280, preferredSliceHeightPx: 1280, maxFileBytes: 2 * MIB, maxTotalBytes: 20 * MIB, maxSliceCount: 100,
    requiredColorSpace: "sRGB", requiresGlobalRights: true, requiresPrintRights: false,
    specSummaryKo: "800×1280px 타일 슬라이스 · 컷당 2MB / 총 20MB · 글로벌 권리", specSummaryEn: "800×1280px tiles · <=2MB/tile, 20MB total · Global rights",
  },
  "piccoma-jp": {
    id: "piccoma-jp", labelKo: "Piccoma (JP)", labelEn: "Piccoma (JP)",
    allowedWidthsPx: [720, 800], horizontalWidthRangePx: [1120, 1600], horizontalHeightRangePx: [1600, 2260],
    allowedFormats: ["jpeg", "png"], maxSliceHeightPx: 2000, preferredSliceHeightPx: 1280,
    maxFileBytes: 5 * MIB, maxTotalBytes: 60 * MIB, maxSliceCount: 120,
    requiredColorSpace: "sRGB", requiresGlobalRights: true, requiresPrintRights: false,
    specSummaryKo: "JP 세로(720/800px) 또는 가로(1120–1600px RTL) · 글로벌 권리", specSummaryEn: "JP vertical (720/800px) or horizontal RTL (1120–1600px)",
  },
  tapas: {
    id: "tapas", labelKo: "Tapas", labelEn: "Tapas",
    allowedWidthsPx: [940], allowedFormats: ["jpeg", "png", "gif"],
    maxSliceHeightPx: 4000, preferredSliceHeightPx: 1600, maxFileBytes: 2 * MIB, maxTotalBytes: 40 * MIB, maxSliceCount: 40,
    requiredColorSpace: "sRGB", requiresGlobalRights: true, requiresPrintRights: false,
    specSummaryKo: "가로 940px · 40장/회 · 파일당 2MB 이하 · 글로벌 권리", specSummaryEn: "940px wide · <=40 files · <=2MB/file · Global rights",
  },
  "print-pdf-x4": {
    id: "print-pdf-x4", labelKo: "인쇄 단행본 PDF/X-4", labelEn: "Print Book PDF/X-4",
    allowedWidthsPx: [], allowedFormats: ["pdf-x4"],
    maxSliceHeightPx: 20000, preferredSliceHeightPx: 3508, maxFileBytes: 200 * MIB, maxTotalBytes: 800 * MIB, maxSliceCount: 400,
    requiredColorSpace: "CMYK-FOGRA39", minDpi: 300, minBleedMm: 3, maxTacPercent: 300,
    requiresGlobalRights: false, requiresPrintRights: true,
    specSummaryKo: "300DPI · CMYK-FOGRA39 · 도련 3mm · TAC<=300% · 폰트 임베드", specSummaryEn: "300DPI · CMYK-FOGRA39 · 3mm bleed · TAC<=300% · Fonts embedded",
  },
};

export const PLATFORM_SPEC_LIST: readonly PlatformSpecRule[] = [
  PLATFORM_SPEC_CATALOG["naver-webtoon"],
  PLATFORM_SPEC_CATALOG["kakao-page"],
  PLATFORM_SPEC_CATALOG["lezhin-comics"],
  PLATFORM_SPEC_CATALOG["webtoon-canvas"],
  PLATFORM_SPEC_CATALOG["piccoma-jp"],
  PLATFORM_SPEC_CATALOG.tapas,
  PLATFORM_SPEC_CATALOG["print-pdf-x4"],
];

export interface PlatformMasterCutInput {
  readonly cutId: string; readonly cutIndex: number; readonly widthPx: number; readonly heightPx: number;
  readonly format: SubmissionImageFormat; readonly byteSize: number; readonly colorSpace: ColorSpaceProfileId;
  readonly dpi?: number; readonly bleedMm?: number; readonly tacPercent?: number; readonly fontsEmbedded?: boolean;
}
export interface PlatformSubmissionInput {
  readonly platform: PublishPlatformId; readonly episodeCode: string; readonly cuts: readonly PlatformMasterCutInput[];
  readonly c2paManifest: C2paProvenanceManifest; readonly autoSlice?: boolean;
  readonly piccomaOrientation?: PiccomaOrientation; readonly requireAntiAi?: boolean;
}
export interface PlatformViolation {
  readonly code:
    | "EMPTY_CUTS" | "WIDTH_MISMATCH" | "HEIGHT_EXCEEDED" | "FORMAT_UNSUPPORTED"
    | "FILE_SIZE_EXCEEDED" | "TOTAL_SIZE_EXCEEDED" | "SLICE_COUNT_EXCEEDED"
    | "COLOR_SPACE_MISMATCH" | "DPI_TOO_LOW" | "BLEED_INSUFFICIENT"
    | "TAC_LIMIT_EXCEEDED" | "FONTS_NOT_EMBEDDED"
    | "C2PA_INTEGRITY_FAILED" | "C2PA_ANTI_AI_MISSING" | "RIGHTS_BOM_BLOCKED";
  readonly cutId?: string; readonly messageKo: string; readonly messageEn: string;
}
export interface PlatformSubmissionSlice {
  readonly filename: string; readonly sourceCutId: string; readonly sliceIndex: number;
  readonly widthPx: number; readonly heightPx: number; readonly format: SubmissionImageFormat;
  readonly estimatedBytes: number; readonly sliceSha256: string;
}
export interface PlatformSubmissionPackage {
  readonly platform: PublishPlatformId; readonly episodeCode: string;
  readonly readingDirection: "vertical-scroll" | "rtl-page" | "print-book";
  readonly readyForSubmission: boolean; readonly violationCount: number; readonly violations: readonly PlatformViolation[];
  readonly slices: readonly PlatformSubmissionSlice[]; readonly totalBytes: number;
  readonly c2paVerification: C2paIntegrityVerificationResult;
  readonly attachedCredentials: {
    readonly c2paManifestFilename: string; readonly c2paManifestSha256: string; readonly antiAiDeclared: boolean;
    readonly rightsBomFilename: string; readonly rightsAssetCount: number; readonly rightsClearedForPlatform: boolean;
  };
  readonly packageSha256: string;
}

/** 7대 웹툰·출판 플랫폼 규격 사전 판정, 안전 타일 슬라이싱, C2PA·Rights BOM 자동 동봉 패키지를 생성한다. */
export function buildPlatformSubmissionPackage(input: PlatformSubmissionInput): PlatformSubmissionPackage {
  const spec = PLATFORM_SPEC_CATALOG[input.platform];
  const autoSlice = input.autoSlice ?? true;
  const piccomaMode: PiccomaOrientation = input.piccomaOrientation ?? "vertical-smartoon";
  const safeCode = input.episodeCode.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "ep001";
  const violations: PlatformViolation[] = [];
  const addV = (code: PlatformViolation["code"], messageKo: string, messageEn: string, cutId?: string): void => {
    violations.push({ code, messageKo, messageEn, ...(cutId ? { cutId } : {}) });
  };

  if (input.cuts.length === 0) {
    addV("EMPTY_CUTS", "출고할 컷/페이지가 0건입니다.", "At least one cut/page is required for submission.");
  }

  const c2paVerification = verifyC2paManifestIntegrity(input.c2paManifest);
  if (!c2paVerification.valid) {
    addV("C2PA_INTEGRITY_FAILED", "C2PA 크립토그래픽 프로비넌스 무결성 검증에 실패했습니다.", "C2PA cryptographic provenance integrity check failed.");
  }
  if ((input.requireAntiAi ?? true) && !c2paVerification.antiAiDeclared) {
    addV("C2PA_ANTI_AI_MISSING", "Anti-AI(c2pa.training-mining: notAllowed) 선언이 누락되었습니다.", "Anti-AI c2pa.training-mining=notAllowed declaration is missing.");
  }
  if (!c2paVerification.rightsClearForCommercial) {
    addV("RIGHTS_BOM_BLOCKED", "Rights BOM에 상업적 이용 불가 에셋이 포함되어 출고가 차단되었습니다.", "Rights BOM contains non-commercial assets blocking submission.");
  }
  if (spec.requiresGlobalRights && !c2paVerification.rightsClearForGlobal) {
    addV("RIGHTS_BOM_BLOCKED", `${spec.labelKo} 출고에 필요한 글로벌 배포 권리가 미충족된 에셋이 있습니다.`, `Rights BOM lacks global distribution rights required by ${spec.labelEn}.`);
  }
  if (spec.requiresPrintRights && !c2paVerification.rightsClearForPrint) {
    addV("RIGHTS_BOM_BLOCKED", "단행본 PDF/X-4 인쇄 권리가 미충족된 에셋이 포함되어 있습니다.", "Rights BOM contains assets without print publication rights.");
  }

  const slices: PlatformSubmissionSlice[] = [];
  const isPiccomaHorizontal = input.platform === "piccoma-jp" && piccomaMode === "horizontal-spread";
  const isPrint = input.platform === "print-pdf-x4";
  const readingDirection: PlatformSubmissionPackage["readingDirection"] =
    isPrint ? "print-book" : isPiccomaHorizontal ? "rtl-page" : "vertical-scroll";
  const effectiveMaxFileBytes = isPiccomaHorizontal ? 10 * MIB : spec.maxFileBytes;
  const effectiveMaxTotalBytes = isPiccomaHorizontal ? 120 * MIB : spec.maxTotalBytes;

  for (const cut of input.cuts) {
    if (!spec.allowedFormats.includes(cut.format)) {
      addV("FORMAT_UNSUPPORTED", `${cut.cutId}: 허용 포맷(${spec.allowedFormats.join("/")})이 아닙니다(현재 ${cut.format}).`, `${cut.cutId}: format ${cut.format} not in ${spec.allowedFormats.join("/")}.`, cut.cutId);
    }
    if (cut.colorSpace !== spec.requiredColorSpace) {
      addV("COLOR_SPACE_MISMATCH", `${cut.cutId}: ${spec.requiredColorSpace} 색공간이 필요합니다(현재 ${cut.colorSpace}).`, `${cut.cutId}: requires ${spec.requiredColorSpace} color space (got ${cut.colorSpace}).`, cut.cutId);
    }

    if (isPrint) {
      if ((cut.dpi ?? 72) < (spec.minDpi ?? 300)) {
        addV("DPI_TOO_LOW", `${cut.cutId}: 인쇄 해상도 300DPI 이상이 필요합니다(현재 ${cut.dpi ?? 72}DPI).`, `${cut.cutId}: print requires >=300 DPI (got ${cut.dpi ?? 72}).`, cut.cutId);
      }
      if ((cut.bleedMm ?? 0) < (spec.minBleedMm ?? 3)) {
        addV("BLEED_INSUFFICIENT", `${cut.cutId}: 사방 도련(Bleed) 3mm 이상이 필요합니다(현재 ${cut.bleedMm ?? 0}mm).`, `${cut.cutId}: requires >=3mm bleed (got ${cut.bleedMm ?? 0}mm).`, cut.cutId);
      }
      if ((cut.tacPercent ?? 260) > (spec.maxTacPercent ?? 300)) {
        addV("TAC_LIMIT_EXCEEDED", `${cut.cutId}: CMYK 잉크 총량(TAC) 300% 이하 기준을 초과했습니다(${cut.tacPercent}%).`, `${cut.cutId}: CMYK TAC ${cut.tacPercent}% exceeds 300% limit.`, cut.cutId);
      }
      if (cut.fontsEmbedded !== true) {
        addV("FONTS_NOT_EMBEDDED", `${cut.cutId}: PDF/X-4 폰트 전체 임베드 확인이 필요합니다.`, `${cut.cutId}: PDF/X-4 requires embedded fonts.`, cut.cutId);
      }
    } else if (isPiccomaHorizontal) {
      const [minW, maxW] = spec.horizontalWidthRangePx ?? [1120, 1600];
      const [minH, maxH] = spec.horizontalHeightRangePx ?? [1600, 2260];
      if (cut.widthPx < minW || cut.widthPx > maxW) {
        addV("WIDTH_MISMATCH", `${cut.cutId}: Piccoma 가로 규격(${minW}–${maxW}px)을 벗어났습니다(${cut.widthPx}px).`, `${cut.cutId}: Piccoma horizontal width must be ${minW}-${maxW}px (got ${cut.widthPx}px).`, cut.cutId);
      }
      if (cut.heightPx < minH || cut.heightPx > maxH) {
        addV("HEIGHT_EXCEEDED", `${cut.cutId}: Piccoma 가로 높이 규격(${minH}–${maxH}px)을 벗어났습니다(${cut.heightPx}px).`, `${cut.cutId}: Piccoma horizontal height must be ${minH}-${maxH}px (got ${cut.heightPx}px).`, cut.cutId);
      }
    } else if (!spec.allowedWidthsPx.includes(cut.widthPx)) {
      addV("WIDTH_MISMATCH", `${cut.cutId}: 가로 폭 ${spec.allowedWidthsPx.join("/")}px 규격 불일치(현재 ${cut.widthPx}px).`, `${cut.cutId}: expected width ${spec.allowedWidthsPx.join("/")}px (got ${cut.widthPx}px).`, cut.cutId);
    }

    const canAutoSlice = !isPrint && !isPiccomaHorizontal && autoSlice && cut.heightPx > spec.maxSliceHeightPx;
    if (!canAutoSlice && !isPiccomaHorizontal && cut.heightPx > spec.maxSliceHeightPx) {
      addV("HEIGHT_EXCEEDED", `${cut.cutId}: 세로 높이 ${spec.maxSliceHeightPx}px 상한 초과(현재 ${cut.heightPx}px · 자동 슬라이스 꺼짐).`, `${cut.cutId}: height ${cut.heightPx}px exceeds ${spec.maxSliceHeightPx}px (autoSlice disabled).`, cut.cutId);
    }

    const sliceCount = canAutoSlice ? Math.ceil(cut.heightPx / spec.preferredSliceHeightPx) : 1;
    const ext = cut.format === "pdf-x4" ? "pdf" : cut.format === "jpeg" ? "jpg" : cut.format;
    for (let s = 0; s < sliceCount; s += 1) {
      const remainingH = cut.heightPx - s * spec.preferredSliceHeightPx;
      const sliceH = canAutoSlice ? Math.min(spec.preferredSliceHeightPx, remainingH) : cut.heightPx;
      const estBytes = Math.max(1, Math.round(cut.byteSize * (sliceH / Math.max(1, cut.heightPx))));
      if (estBytes > effectiveMaxFileBytes) {
        addV("FILE_SIZE_EXCEEDED", `${cut.cutId}#${s + 1}: 파일 크기 ${(estBytes / MIB).toFixed(2)}MB가 상한(${(effectiveMaxFileBytes / MIB).toFixed(0)}MB)을 초과했습니다.`, `${cut.cutId}#${s + 1}: slice size ${(estBytes / MIB).toFixed(2)}MB exceeds ${(effectiveMaxFileBytes / MIB).toFixed(0)}MB cap.`, cut.cutId);
      }
      const seq = String(slices.length + 1).padStart(3, "0");
      const filename = `${safeCode}_${input.platform}_${seq}.${ext}`;
      slices.push({
        filename, sourceCutId: cut.cutId, sliceIndex: s + 1,
        widthPx: cut.widthPx, heightPx: sliceH, format: cut.format, estimatedBytes: estBytes,
        sliceSha256: sha256Hex(`${filename}|${cut.widthPx}x${sliceH}|${estBytes}|${input.c2paManifest.manifestSha256}`),
      });
    }
  }

  const totalBytes = slices.reduce((acc, s) => acc + s.estimatedBytes, 0);
  if (totalBytes > effectiveMaxTotalBytes) {
    addV("TOTAL_SIZE_EXCEEDED", `회차 전체 용량 ${(totalBytes / MIB).toFixed(2)}MB가 상한(${(effectiveMaxTotalBytes / MIB).toFixed(0)}MB)을 초과했습니다.`, `Total episode size ${(totalBytes / MIB).toFixed(2)}MB exceeds ${(effectiveMaxTotalBytes / MIB).toFixed(0)}MB cap.`);
  }
  if (slices.length > spec.maxSliceCount) {
    addV("SLICE_COUNT_EXCEEDED", `총 슬라이스 ${slices.length}장이 상한(${spec.maxSliceCount}장)을 초과했습니다.`, `Total slice count ${slices.length} exceeds ${spec.maxSliceCount} limit.`);
  }

  const rightsClearedForPlatform =
    c2paVerification.rightsClearForCommercial &&
    (!spec.requiresGlobalRights || c2paVerification.rightsClearForGlobal) &&
    (!spec.requiresPrintRights || c2paVerification.rightsClearForPrint);

  const attachedCredentials = {
    c2paManifestFilename: `${safeCode}.c2pa.manifest.json`,
    c2paManifestSha256: input.c2paManifest.manifestSha256,
    antiAiDeclared: c2paVerification.antiAiDeclared,
    rightsBomFilename: `${safeCode}.rights-bom.json`,
    rightsAssetCount: input.c2paManifest.ingredients.length,
    rightsClearedForPlatform,
  };

  const packageSha256 = sha256Hex(canonicalizeJson({
    platform: input.platform, episodeCode: safeCode, readingDirection, slices, attachedCredentials, violationCodes: violations.map((v) => v.code),
  }));

  return {
    platform: input.platform, episodeCode: input.episodeCode, readingDirection,
    readyForSubmission: violations.length === 0, violationCount: violations.length, violations,
    slices, totalBytes, c2paVerification, attachedCredentials, packageSha256,
  };
}

// === 3. 데모 픽스처 (무-props 패널 및 테스트용) ===

export function createDemoScriptUnits(): readonly ScriptBalloonUnit[] {
  return [
    { unitId: "dlg-001", cutIndex: 1, speaker: "서연", kind: "dialogue", sourceText: "새벽 다섯 시, 을지로 옥상에 안개가 내려앉았다.", boxWidthPx: 196, boxHeightPx: 120, paddingPx: 14, fontSizePx: 15, lineHeightRatio: 1.35, contextNote: "Opening monologue" },
    { unitId: "dlg-002", cutIndex: 2, speaker: "진우", kind: "dialogue", sourceText: "원본 레이어 해시까지 확인했어. 지금 출고하자.", boxWidthPx: 172, boxHeightPx: 112, paddingPx: 14, fontSizePx: 15, lineHeightRatio: 1.35, contextNote: "Urgent reply" },
    { unitId: "sfx-003", cutIndex: 3, speaker: "SFX", kind: "sfx", sourceText: "철컥—!", boxWidthPx: 120, boxHeightPx: 64, paddingPx: 8, fontSizePx: 18, lineHeightRatio: 1.2, writingMode: "horizontal-tb", contextNote: "Shutter click" },
  ];
}

export function createDemoTranslationsForLocale(locale: TmsLocaleCode, triggerOverflow = false): Readonly<Record<string, string>> {
  if (triggerOverflow) {
    return {
      "dlg-001": locale === "ja"
        ? "午前五時、乙支路の屋上に深い朝霧が静かに降りてきて、街のネオンと印刷所の機械音が遠くから何度も反響しながら長い一日が始まろうとしているのだ。すべての商業ライセンスと国際標準プロビナンス証明書と印刷用カラープロファイルを最終確認してから出稿しないと、海外プラットフォームの自動検収を通過できない。"
        : "At five in the morning over Euljiro rooftop, thick silver fog drifts across every printing alley while we double-check every single commercial license, international OpenColorIO profile, C2PA provenance hash chain, and global webtoon tile specification before dawn breaks across Seoul and Tokyo studios!",
      "dlg-002": locale === "ja" ? "ハッシュ確認済み、今すぐ入稿しよう。" : "Hashes verified. Let's publish now.",
      "sfx-003": locale === "ja" ? "カチャッ!" : "CLACK!",
    };
  }
  const presets: Record<TmsLocaleCode, Readonly<Record<string, string>>> = {
    ko: { "dlg-001": "새벽 다섯 시, 을지로 옥상에 안개가 내려앉았다.", "dlg-002": "원본 레이어 해시 확인 끝. 지금 출고하자.", "sfx-003": "철컥—!" },
    en: { "dlg-001": "5 AM. Mist settles over the Euljiro rooftop.", "dlg-002": "Layer hashes verified. Ship it now.", "sfx-003": "CLACK!" },
    ja: { "dlg-001": "午前五時、乙支路の屋上に霧が降りた。", "dlg-002": "ハッシュ確認済み。今すぐ出稿しよう。", "sfx-003": "カチャッ!" },
    th: { "dlg-001": "ตีห้า หมอกลงบนดาดฟ้าอึลจิโร", "dlg-002": "ตรวจแฮชแล้ว ส่งงานเลย", "sfx-003": "แกร๊ก!" },
    id: { "dlg-001": "Pukul 5 pagi, kabut turun di atap Euljiro.", "dlg-002": "Hash terverifikasi. Terbitkan sekarang.", "sfx-003": "KLIK!" },
  };
  return presets[locale];
}

export function createDemoPlatformCuts(
  platform: PublishPlatformId,
  piccomaOrientation: PiccomaOrientation = "vertical-smartoon",
): readonly PlatformMasterCutInput[] {
  if (platform === "print-pdf-x4") {
    return [
      { cutId: "page-001", cutIndex: 1, widthPx: 2480, heightPx: 3508, format: "pdf-x4", byteSize: 12 * MIB, colorSpace: "CMYK-FOGRA39", dpi: 300, bleedMm: 3, tacPercent: 278, fontsEmbedded: true },
      { cutId: "page-002", cutIndex: 2, widthPx: 2480, heightPx: 3508, format: "pdf-x4", byteSize: 11 * MIB, colorSpace: "CMYK-FOGRA39", dpi: 300, bleedMm: 3, tacPercent: 284, fontsEmbedded: true },
    ];
  }
  if (platform === "piccoma-jp" && piccomaOrientation === "horizontal-spread") {
    return [
      { cutId: "jp-p01", cutIndex: 1, widthPx: 1400, heightPx: 2000, format: "jpeg", byteSize: 2.1 * MIB, colorSpace: "sRGB" },
      { cutId: "jp-p02", cutIndex: 2, widthPx: 1400, heightPx: 2000, format: "jpeg", byteSize: 1.9 * MIB, colorSpace: "sRGB" },
    ];
  }
  const widthMap: Record<Exclude<PublishPlatformId, "print-pdf-x4">, number> = {
    "naver-webtoon": 800, "kakao-page": 720, "lezhin-comics": 1280, "webtoon-canvas": 800, "piccoma-jp": 800, tapas: 940,
  };
  const w = widthMap[platform];
  return [
    { cutId: "cut-001", cutIndex: 1, widthPx: w, heightPx: 2560, format: "jpeg", byteSize: 1.2 * MIB, colorSpace: "sRGB" },
    { cutId: "cut-002", cutIndex: 2, widthPx: w, heightPx: 3840, format: "png", byteSize: 1.8 * MIB, colorSpace: "sRGB" },
  ];
}
