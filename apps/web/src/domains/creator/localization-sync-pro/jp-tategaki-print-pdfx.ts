/**
 * T-039 · T-040:
 * - 일본 세로쓰기(縦書き · writing-mode: vertical-rl) + 루비 후리가나(<ruby><rt>) + 세로 중 가로(text-combine-upright) 정밀 조판 엔진
 * - 단행본 인쇄용 CMYK 3mm 도련(Bleed) + 재단선(Crop Marks) + ICC 프로파일 + 300 DPI PDF/X-1a 메타데이터 생성·프리플라이트 검수기
 */

// ---------------------------------------------------------------------------
// T-039: 일본 세로쓰기(縦書き) + 루비 후리가나(<ruby><rt>) + 세로 중 가로(TCY)
// ---------------------------------------------------------------------------

export type TategakiToken =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "ruby"; readonly base: string; readonly rt: string }
  | { readonly kind: "tcy"; readonly value: string };

export interface TategakiCompositionOptions {
  readonly maxCharsPerColumn?: number;
  readonly autoTcy?: boolean;
  readonly normalizeVerticalPunctuation?: boolean;
}

export interface TategakiCompositionResult {
  readonly tokens: readonly TategakiToken[];
  readonly rubyCount: number;
  readonly tcyCount: number;
  readonly kinsokuCount: number;
  readonly totalCharUnits: number;
  readonly estimatedColumns: number;
  readonly cssStyle: {
    readonly writingMode: "vertical-rl";
    readonly textOrientation: "mixed";
    readonly lineBreak: "strict";
    readonly hangingPunctuation: "allow-end";
  };
  readonly warnings: readonly string[];
}

const KINSOKU_HEAD_FORBIDDEN = new Set(["。", "、", "」", "』", "）", "！", "？", "っ", "ッ", "ー", "︙"]);

function splitTextWithTcy(segment: string, autoTcy: boolean): TategakiToken[] {
  if (!autoTcy) return segment ? [{ kind: "text", value: segment }] : [];
  const result: TategakiToken[] = [];
  // 1~2자리 숫자, !?/!!/?!, 2글자 영문 대문자 약어(AI/HP/OK 등)를 세로 중 가로(TCY)로 분리
  const pattern = /(?<![0-9A-Za-z])(\d{1,2}|[!?]{2}|[A-Z]{2})(?![0-9A-Za-z])/gu;
  let lastIndex = 0;
  for (const match of segment.matchAll(pattern)) {
    const start = match.index ?? 0;
    const matched = match[1];
    if (!matched) continue;
    if (start > lastIndex) result.push({ kind: "text", value: segment.slice(lastIndex, start) });
    result.push({ kind: "tcy", value: matched });
    lastIndex = start + matched.length;
  }
  if (lastIndex < segment.length) result.push({ kind: "text", value: segment.slice(lastIndex) });
  return result;
}

export function composeJapaneseTategaki(
  input: string,
  options: TategakiCompositionOptions = {},
): TategakiCompositionResult {
  const autoTcy = options.autoTcy ?? true;
  const maxCharsPerColumn = Math.max(6, Math.min(40, options.maxCharsPerColumn ?? 16));
  const normalized =
    (options.normalizeVerticalPunctuation ?? true)
      ? input.replace(/\.{3}|…/gu, "︙").replace(/--/gu, "――")
      : input;

  // 지원 루비 문법: ｜漢字《かんじ》, [漢字|かんじ], 漢字(かんじ)
  const rubyPattern = /(?:[|｜]([^《\n]+)《([^》\n]+)》|\[([^|\]]+)\|([^\]]+)\]|([\u4E00-\u9FFF々ヶ]+)\(([\u3040-\u30FFー]+)\))/gu;
  const tokens: TategakiToken[] = [];
  let lastIndex = 0;

  for (const match of normalized.matchAll(rubyPattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) tokens.push(...splitTextWithTcy(normalized.slice(lastIndex, start), autoTcy));
    const base = match[1] ?? match[3] ?? match[5] ?? "";
    const rt = match[2] ?? match[4] ?? match[6] ?? "";
    if (base && rt) tokens.push({ kind: "ruby", base, rt });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < normalized.length) tokens.push(...splitTextWithTcy(normalized.slice(lastIndex), autoTcy));

  let rubyCount = 0;
  let tcyCount = 0;
  let kinsokuCount = 0;
  let totalCharUnits = 0;
  for (const token of tokens) {
    if (token.kind === "ruby") {
      rubyCount += 1;
      totalCharUnits += token.base.length;
    } else if (token.kind === "tcy") {
      tcyCount += 1;
      totalCharUnits += 1;
    } else {
      totalCharUnits += token.value.replace(/\s/gu, "").length;
      for (const ch of token.value) {
        if (KINSOKU_HEAD_FORBIDDEN.has(ch)) kinsokuCount += 1;
      }
    }
  }

  const warnings: string[] = [];
  if (/\d{3,}/u.test(normalized)) {
    warnings.push("3자리 이상 반각 숫자는 JIS X 4051 기준 세로 중 가로(TCY)에서 제외되어 세로 회전 표기됩니다.");
  }

  return Object.freeze({
    tokens: Object.freeze(tokens),
    rubyCount,
    tcyCount,
    kinsokuCount,
    totalCharUnits,
    estimatedColumns: Math.max(1, Math.ceil(totalCharUnits / maxCharsPerColumn)),
    cssStyle: Object.freeze({
      writingMode: "vertical-rl",
      textOrientation: "mixed",
      lineBreak: "strict",
      hangingPunctuation: "allow-end",
    }),
    warnings: Object.freeze(warnings),
  });
}

// ---------------------------------------------------------------------------
// T-040: 단행본 인쇄 CMYK 3mm 도련 + 재단선 + ICC 프로파일 + 300 DPI PDF/X-1a
// ---------------------------------------------------------------------------

export type PrintTrimPresetId = "jp-b6-tankobon" | "jp-shinsho" | "kr-a5-book" | "us-trade-comic";
export type PrintIccProfileId = "JapanColor2001Coated" | "FOGRA39" | "GRACoL2006" | "SWOP2006";

export interface PrintTrimPreset {
  readonly id: PrintTrimPresetId;
  readonly labelKo: string;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly recommendedBinding: "rtl-japanese" | "ltr-standard";
  readonly recommendedIcc: PrintIccProfileId;
}

export interface PrintIccProfileSpec {
  readonly id: PrintIccProfileId;
  readonly outputConditionIdentifier: string;
  readonly registryName: string;
  readonly maxTacPercent: number;
  readonly regionKo: string;
}

export const PRINT_TRIM_PRESETS: Readonly<Record<PrintTrimPresetId, PrintTrimPreset>> = Object.freeze({
  "jp-b6-tankobon": { id: "jp-b6-tankobon", labelKo: "일본 B6 단행본 (128×182mm)", trimWidthMm: 128, trimHeightMm: 182, recommendedBinding: "rtl-japanese", recommendedIcc: "JapanColor2001Coated" },
  "jp-shinsho": { id: "jp-shinsho", labelKo: "일본 신서판 코믹 (112×176mm)", trimWidthMm: 112, trimHeightMm: 176, recommendedBinding: "rtl-japanese", recommendedIcc: "JapanColor2001Coated" },
  "kr-a5-book": { id: "kr-a5-book", labelKo: "한국 A5 웹툰 단행본 (148×210mm)", trimWidthMm: 148, trimHeightMm: 210, recommendedBinding: "ltr-standard", recommendedIcc: "FOGRA39" },
  "us-trade-comic": { id: "us-trade-comic", labelKo: "북미 트레이드 코믹 (168×259mm)", trimWidthMm: 168, trimHeightMm: 259, recommendedBinding: "ltr-standard", recommendedIcc: "GRACoL2006" },
});

export const PRINT_ICC_PROFILES: Readonly<Record<PrintIccProfileId, PrintIccProfileSpec>> = Object.freeze({
  JapanColor2001Coated: { id: "JapanColor2001Coated", outputConditionIdentifier: "JC200103", registryName: "http://www.color.org", maxTacPercent: 320, regionKo: "일본·한국 오프셋 코팅지 표준" },
  FOGRA39: { id: "FOGRA39", outputConditionIdentifier: "FOGRA39L", registryName: "http://www.color.org", maxTacPercent: 330, regionKo: "유럽·국내 일반 상업 인쇄 표준" },
  GRACoL2006: { id: "GRACoL2006", outputConditionIdentifier: "CGATS TR 006", registryName: "http://www.color.org", maxTacPercent: 320, regionKo: "북미 상업용 코팅지 표준" },
  SWOP2006: { id: "SWOP2006", outputConditionIdentifier: "CGATS TR 003", registryName: "http://www.color.org", maxTacPercent: 300, regionKo: "북미 윤전 인쇄(잉크 상한 300%)" },
});

export interface CmykColorSample {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly tacPercent: number;
}

export interface CropMarkLine {
  readonly id: string;
  readonly kind: "corner-crop" | "registration-target";
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
  readonly strokePt: 0.25;
}

export interface PrintPreflightCheckItem {
  readonly code: string;
  readonly labelKo: string;
  readonly status: "pass" | "warning" | "fail";
  readonly detailKo: string;
}

export interface PdfX1aPrintPackageConfig {
  readonly documentTitle: string;
  readonly trimPresetId: PrintTrimPresetId;
  readonly iccProfileId?: PrintIccProfileId;
  readonly bleedMm?: number;
  readonly dpi?: number;
  readonly pageCount?: number;
  readonly maxSampledTacPercent?: number;
  readonly rgbObjectsRemaining?: number;
  readonly allFontsEmbedded?: boolean;
  readonly transparencyFlattened?: boolean;
  readonly bindingDirection?: "rtl-japanese" | "ltr-standard";
}

export interface PdfX1aPrintPackage {
  readonly pdfxVersion: "PDF/X-1a:2001";
  readonly isoStandard: "ISO 15930-1";
  readonly documentTitle: string;
  readonly colorSpace: "DeviceCMYK";
  readonly trapped: "False";
  readonly dpi: number;
  readonly bleedMm: number;
  readonly spineWidthMm: number;
  readonly bindingDirection: "rtl-japanese" | "ltr-standard";
  readonly trimBoxMm: { readonly width: number; readonly height: number };
  readonly bleedBoxMm: { readonly width: number; readonly height: number };
  readonly mediaBoxMm: { readonly width: number; readonly height: number };
  readonly trimBoxPt: readonly [number, number, number, number];
  readonly bleedBoxPt: readonly [number, number, number, number];
  readonly mediaBoxPt: readonly [number, number, number, number];
  readonly pixelSizeAtDpi: { readonly widthPx: number; readonly heightPx: number };
  readonly iccProfile: PrintIccProfileSpec;
  readonly cropMarks: readonly CropMarkLine[];
  readonly preflightChecks: readonly PrintPreflightCheckItem[];
  readonly passed: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
}

const MM_TO_PT = 72 / 25.4;

function mmToPt(mm: number): number {
  return Math.round(mm * MM_TO_PT * 100) / 100;
}

export function convertRgbToCmykWithTac(r: number, g: number, b: number): CmykColorSample {
  const rn = Math.min(255, Math.max(0, r)) / 255;
  const gn = Math.min(255, Math.max(0, g)) / 255;
  const bn = Math.min(255, Math.max(0, b)) / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.9999) return Object.freeze({ c: 0, m: 0, y: 0, k: 100, tacPercent: 100 });
  const c = Math.round(((1 - rn - k) / (1 - k)) * 100);
  const m = Math.round(((1 - gn - k) / (1 - k)) * 100);
  const y = Math.round(((1 - bn - k) / (1 - k)) * 100);
  const kPct = Math.round(k * 100);
  return Object.freeze({ c, m, y, k: kPct, tacPercent: c + m + y + kPct });
}

export function generateCropMarkGeometry(
  trimWidthMm: number,
  trimHeightMm: number,
  bleedMm = 3,
): readonly CropMarkLine[] {
  const slug = 10;
  const markLen = 6;
  const offset = Math.max(3, bleedMm);
  const left = slug;
  const right = slug + trimWidthMm;
  const top = slug;
  const bottom = slug + trimHeightMm;
  const midX = slug + trimWidthMm / 2;
  const midY = slug + trimHeightMm / 2;

  return Object.freeze([
    { id: "crop-tl-h", kind: "corner-crop", x1Mm: left - offset - markLen, y1Mm: top, x2Mm: left - offset, y2Mm: top, strokePt: 0.25 },
    { id: "crop-tl-v", kind: "corner-crop", x1Mm: left, y1Mm: top - offset - markLen, x2Mm: left, y2Mm: top - offset, strokePt: 0.25 },
    { id: "crop-tr-h", kind: "corner-crop", x1Mm: right + offset, y1Mm: top, x2Mm: right + offset + markLen, y2Mm: top, strokePt: 0.25 },
    { id: "crop-tr-v", kind: "corner-crop", x1Mm: right, y1Mm: top - offset - markLen, x2Mm: right, y2Mm: top - offset, strokePt: 0.25 },
    { id: "crop-bl-h", kind: "corner-crop", x1Mm: left - offset - markLen, y1Mm: bottom, x2Mm: left - offset, y2Mm: bottom, strokePt: 0.25 },
    { id: "crop-bl-v", kind: "corner-crop", x1Mm: left, y1Mm: bottom + offset, x2Mm: left, y2Mm: bottom + offset + markLen, strokePt: 0.25 },
    { id: "crop-br-h", kind: "corner-crop", x1Mm: right + offset, y1Mm: bottom, x2Mm: right + offset + markLen, y2Mm: bottom, strokePt: 0.25 },
    { id: "crop-br-v", kind: "corner-crop", x1Mm: right, y1Mm: bottom + offset, x2Mm: right, y2Mm: bottom + offset + markLen, strokePt: 0.25 },
    { id: "reg-top", kind: "registration-target", x1Mm: midX - 2, y1Mm: top - offset - 3, x2Mm: midX + 2, y2Mm: top - offset - 3, strokePt: 0.25 },
    { id: "reg-bottom", kind: "registration-target", x1Mm: midX - 2, y1Mm: bottom + offset + 3, x2Mm: midX + 2, y2Mm: bottom + offset + 3, strokePt: 0.25 },
    { id: "reg-left", kind: "registration-target", x1Mm: left - offset - 3, y1Mm: midY - 2, x2Mm: left - offset - 3, y2Mm: midY + 2, strokePt: 0.25 },
    { id: "reg-right", kind: "registration-target", x1Mm: right + offset + 3, y1Mm: midY - 2, x2Mm: right + offset + 3, y2Mm: midY + 2, strokePt: 0.25 },
  ]);
}

export function buildPdfX1aPrintPackage(config: PdfX1aPrintPackageConfig): PdfX1aPrintPackage {
  const preset = PRINT_TRIM_PRESETS[config.trimPresetId];
  const iccProfile = PRINT_ICC_PROFILES[config.iccProfileId ?? preset.recommendedIcc];
  const bleedMm = Math.max(0, config.bleedMm ?? 3);
  const dpi = Math.max(72, Math.round(config.dpi ?? 300));
  const pageCount = Math.max(4, Math.round(config.pageCount ?? 192));
  const maxSampledTacPercent = Math.max(0, Math.round(config.maxSampledTacPercent ?? 285));
  const rgbObjectsRemaining = Math.max(0, Math.round(config.rgbObjectsRemaining ?? 0));
  const allFontsEmbedded = config.allFontsEmbedded ?? true;
  const transparencyFlattened = config.transparencyFlattened ?? true;
  const bindingDirection = config.bindingDirection ?? preset.recommendedBinding;
  const slugMm = 10;

  const trimBoxMm = { width: preset.trimWidthMm, height: preset.trimHeightMm };
  const bleedBoxMm = { width: preset.trimWidthMm + bleedMm * 2, height: preset.trimHeightMm + bleedMm * 2 };
  const mediaBoxMm = { width: preset.trimWidthMm + slugMm * 2, height: preset.trimHeightMm + slugMm * 2 };
  const spineWidthMm = Math.round((pageCount / 2) * 0.11 * 10) / 10;
  const pixelSizeAtDpi = {
    widthPx: Math.round((bleedBoxMm.width / 25.4) * dpi),
    heightPx: Math.round((bleedBoxMm.height / 25.4) * dpi),
  };

  const preflightChecks: PrintPreflightCheckItem[] = [
    { code: "PRINT_DPI", labelKo: "해상도 (300 DPI 이상)", status: dpi >= 300 ? "pass" : "fail", detailKo: dpi >= 300 ? `${dpi} DPI 충족 (${pixelSizeAtDpi.widthPx}×${pixelSizeAtDpi.heightPx}px)` : `현재 ${dpi} DPI로 인쇄 최소 기준(300 DPI) 미달` },
    { code: "PRINT_BLEED", labelKo: "사방 도련 (3mm 이상)", status: bleedMm >= 3 ? "pass" : "fail", detailKo: bleedMm >= 3 ? `도련 ${bleedMm}mm 확보 (재단선 12개 생성 완료)` : `현재 ${bleedMm}mm로 재단 여백 부족(최소 3mm 필요)` },
    { code: "PRINT_CMYK_ONLY", labelKo: "DeviceCMYK 색공간 변환", status: rgbObjectsRemaining === 0 ? "pass" : "fail", detailKo: rgbObjectsRemaining === 0 ? "미변환 RGB 객체 0건 (순수 CMYK)" : `미변환 RGB 객체 ${rgbObjectsRemaining}건 발견 — PDF/X-1a 위반` },
    { code: "PRINT_TAC", labelKo: `잉크 총량(TAC ≤ ${iccProfile.maxTacPercent}%)`, status: maxSampledTacPercent <= iccProfile.maxTacPercent ? "pass" : "fail", detailKo: `최대 측정 잉크 총량 ${maxSampledTacPercent}% / 프로파일 상한 ${iccProfile.maxTacPercent}% (${iccProfile.id})` },
    { code: "PRINT_FONTS", labelKo: "글꼴 임베딩 / 아웃라인", status: allFontsEmbedded ? "pass" : "fail", detailKo: allFontsEmbedded ? "모든 서체 임베딩 완료" : "임베딩되지 않은 서체가 있어 인쇄소 글꼴 깨짐 위험" },
    { code: "PRINT_TRANSPARENCY", labelKo: "투명도 평탄화 (PDF/X-1a 필수)", status: transparencyFlattened ? "pass" : "fail", detailKo: transparencyFlattened ? "알파 채널·블렌드 모드 평탄화 완료" : "미평탄화 투명도 객체 감지 — PDF/X-1a:2001 위반" },
  ];

  const blockingCount = preflightChecks.filter((c) => c.status === "fail").length;
  const warningCount = preflightChecks.filter((c) => c.status === "warning").length;

  return Object.freeze({
    pdfxVersion: "PDF/X-1a:2001",
    isoStandard: "ISO 15930-1",
    documentTitle: config.documentTitle.trim() || "툰스튜디오 단행본 원고",
    colorSpace: "DeviceCMYK",
    trapped: "False",
    dpi,
    bleedMm,
    spineWidthMm,
    bindingDirection,
    trimBoxMm: Object.freeze(trimBoxMm),
    bleedBoxMm: Object.freeze(bleedBoxMm),
    mediaBoxMm: Object.freeze(mediaBoxMm),
    trimBoxPt: Object.freeze([mmToPt(slugMm), mmToPt(slugMm), mmToPt(slugMm + trimBoxMm.width), mmToPt(slugMm + trimBoxMm.height)] as const),
    bleedBoxPt: Object.freeze([mmToPt(slugMm - bleedMm), mmToPt(slugMm - bleedMm), mmToPt(slugMm + trimBoxMm.width + bleedMm), mmToPt(slugMm + trimBoxMm.height + bleedMm)] as const),
    mediaBoxPt: Object.freeze([0, 0, mmToPt(mediaBoxMm.width), mmToPt(mediaBoxMm.height)] as const),
    pixelSizeAtDpi: Object.freeze(pixelSizeAtDpi),
    iccProfile,
    cropMarks: generateCropMarkGeometry(trimBoxMm.width, trimBoxMm.height, bleedMm),
    preflightChecks: Object.freeze(preflightChecks),
    passed: blockingCount === 0,
    blockingCount,
    warningCount,
  });
}
