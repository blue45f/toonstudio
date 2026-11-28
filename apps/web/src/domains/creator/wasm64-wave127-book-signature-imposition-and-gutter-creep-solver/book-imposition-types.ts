/**
 * Wave 127 — 웹툰 단행본 인쇄 대수 조판(Signature Imposition)·제책 크리프(Creep) 보정
 * 및 양면 스프레드 책등(Gutter) 안전 솔버 핵심 타입·프로파일·결정론적 SHA-256 모듈.
 *
 * - 순수 ES2017 strict TypeScript (`any`, `0n`, 정규식 `/s` 미사용).
 * - 외부 암호화/런타임 의존성 없는 순수 동기 FIPS 180-4 SHA-256 구현.
 */

export type BookBindingMethod =
  | "saddle-stitch"
  | "perfect-bound-pur"
  | "smyth-sewn-hardcover";

export type BookReadingDirection =
  | "ltr-korean-western"
  | "rtl-japanese-manga";

export type BookSignatureSizePages = 4 | 8 | 16;

export type BookPageSpineEdge = "left" | "right";

export type BookSheetSide = "front" | "back";

export type BookImportantBoxKind =
  | "character-face"
  | "dialogue-balloon"
  | "panel-border"
  | "caption-text"
  | "sfx-lettering";

export type BookPrintAuditFindingCode =
  | "spine-gutter-swallow-risk"
  | "outer-trim-safety-violation"
  | "insufficient-bleed"
  | "non-facing-spread-pairing";

export type BookPrintAuditSeverity = "blocker" | "warning";

export interface BookBindingProfile {
  readonly method: BookBindingMethod;
  readonly labelKo: string;
  readonly defaultSignatureSizePages: BookSignatureSizePages;
  readonly isSingleNestedGathering: boolean;
  readonly hasFlatSpine: boolean;
  readonly defaultCoverBoardThicknessMm: number;
  readonly defaultSpineHiddenZoneMm: number;
  readonly creepFoldMultiplier: number;
  readonly spineMillingAllowanceMm: number;
}

export interface BookPaperStockPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly gsm: number;
  readonly paperThicknessMm: number;
}

export interface BookImpositionSpec {
  readonly bookId?: string;
  readonly bookTitle?: string;
  readonly rawPageCount: number;
  readonly bindingMethod: BookBindingMethod;
  readonly readingDirection: BookReadingDirection;
  readonly signatureSizePages?: BookSignatureSizePages;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly paperThicknessMm: number;
  readonly coverBoardThicknessMm?: number;
  readonly bleedMm?: number;
  readonly safeMarginMm?: number;
  readonly spineHiddenZoneMm?: number;
  readonly applyCreepCompensation?: boolean;
}

export interface BookPageSlotPlacement {
  readonly pageNumber: number;
  readonly isBlankPadding: boolean;
  readonly signatureIndex: number;
  readonly sheetIndexInSignature: number;
  readonly sheetNestDepth: number;
  readonly side: BookSheetSide;
  readonly slotPosition: "left" | "right";
  readonly spineEdgeOnPage: BookPageSpineEdge;
  readonly rawCreepPushOutMm: number;
  readonly creepShiftTowardSpineMm: number;
  readonly horizontalPlateShiftMm: number;
}

export interface BookSheetSidePair {
  readonly side: BookSheetSide;
  readonly leftPage: number;
  readonly rightPage: number;
  readonly leftIsBlankPadding: boolean;
  readonly rightIsBlankPadding: boolean;
  readonly foldPairSum: number;
}

export interface BookImpositionSheet {
  readonly globalSheetIndex: number;
  readonly signatureIndex: number;
  readonly sheetIndexInSignature: number;
  readonly sheetNestDepth: number;
  readonly pressGridRow: number;
  readonly headRotationDeg: 0 | 180;
  readonly front: BookSheetSidePair;
  readonly back: BookSheetSidePair;
  readonly rawCreepPushOutMm: number;
  readonly creepShiftTowardSpineMm: number;
}

export interface BookSignatureUnit {
  readonly signatureIndex: number;
  readonly startPage: number;
  readonly endPage: number;
  readonly expectedFoldPairSum: number;
  readonly pageCount: number;
  readonly nestedSheetCount: number;
  readonly maxCreepCompensationMm: number;
  readonly sheets: readonly BookImpositionSheet[];
}

export interface BookSignatureImpositionPlan {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly bindingMethod: BookBindingMethod;
  readonly readingDirection: BookReadingDirection;
  readonly rawPageCount: number;
  readonly paddedPageCount: number;
  readonly blankPaddingPageCount: number;
  readonly blankPaddingPageNumbers: readonly number[];
  readonly signatureSizePages: BookSignatureSizePages;
  readonly signatureCount: number;
  readonly totalSheetCount: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly safeMarginMm: number;
  readonly spineHiddenZoneMm: number;
  readonly paperThicknessMm: number;
  readonly coverBoardThicknessMm: number;
  readonly textBlockThicknessMm: number;
  readonly spineWidthMm: number;
  readonly pressSheetSpreadWidthMm: number;
  readonly pressSheetHeightMm: number;
  readonly applyCreepCompensation: boolean;
  readonly maxCreepPushOutMm: number;
  readonly maxCreepShiftTowardSpineMm: number;
  readonly signatures: readonly BookSignatureUnit[];
  readonly pagePlacements: readonly BookPageSlotPlacement[];
  readonly impositionManifestSha256Hex: string;
}

export interface BookImportantBoxSpec {
  readonly id: string;
  readonly kind: BookImportantBoxKind;
  readonly label: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly allowGutterCrossing?: boolean;
  readonly isFullBleedEdge?: boolean;
}

export interface BookPageBleedEdgesMm {
  readonly topMm: number;
  readonly bottomMm: number;
  readonly outerMm: number;
  readonly innerMm?: number;
}

export interface BookPageContentSpec {
  readonly pageNumber: number;
  readonly hasFullBleedArt?: boolean;
  readonly bleedMm?: number;
  readonly bleedEdgesMm?: BookPageBleedEdgesMm;
  readonly importantBoxes: readonly BookImportantBoxSpec[];
}

export interface DoublePageSpreadSpec {
  readonly spreadId: string;
  readonly label?: string;
  readonly leftPageNumber: number;
  readonly rightPageNumber: number;
  readonly hasFullBleedArt?: boolean;
  readonly bleedMm?: number;
  readonly bleedEdgesMm?: BookPageBleedEdgesMm;
  readonly importantBoxes: readonly BookImportantBoxSpec[];
}

export interface BookPrintSafetyAuditInput {
  readonly pages?: readonly BookPageContentSpec[];
  readonly spreads?: readonly DoublePageSpreadSpec[];
  readonly minBleedMm?: number;
  readonly safeMarginMmOverride?: number;
  readonly spineHiddenZoneMmOverride?: number;
  readonly applyCreepCompensationOverride?: boolean;
}

export interface BookPrintSafetyFinding {
  readonly code: BookPrintAuditFindingCode;
  readonly severity: BookPrintAuditSeverity;
  readonly scope: "page" | "spread";
  readonly pageNumbers: readonly number[];
  readonly spreadId?: string;
  readonly boxId?: string;
  readonly boxKind?: BookImportantBoxKind;
  readonly boxLabel?: string;
  readonly measuredMm: number;
  readonly thresholdMm: number;
  readonly intrusionMm: number;
  readonly uncompensatedMeasuredMm?: number;
  readonly creepShiftAppliedMm?: number;
  readonly messageKo: string;
  readonly recommendationKo: string;
}

export interface BookAuditedBoxOverlay {
  readonly scope: "page" | "spread";
  readonly pageNumbers: readonly number[];
  readonly spreadId?: string;
  readonly boxId: string;
  readonly boxKind: BookImportantBoxKind;
  readonly boxLabel: string;
  readonly spreadXMm: number;
  readonly spreadYMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly status: "safe" | "warning" | "blocker";
  readonly primaryIssueCode?: BookPrintAuditFindingCode;
}

export interface BookPrintSafetyAuditReport {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly bindingMethod: BookBindingMethod;
  readonly readingDirection: BookReadingDirection;
  readonly releaseReady: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly spineGutterBlockerCount: number;
  readonly outerTrimViolationCount: number;
  readonly insufficientBleedBlockerCount: number;
  readonly nonFacingSpreadBlockerCount: number;
  readonly beforeCreepOuterTrimViolationCount: number;
  readonly afterCreepOuterTrimViolationCount: number;
  readonly outerTrimViolationsResolvedByCreepCount: number;
  readonly creepCompensationApplied: boolean;
  readonly auditedPageCount: number;
  readonly auditedSpreadCount: number;
  readonly auditedBoxCount: number;
  readonly minBleedMm: number;
  readonly safeMarginMm: number;
  readonly spineHiddenZoneMm: number;
  readonly findings: readonly BookPrintSafetyFinding[];
  readonly boxOverlays: readonly BookAuditedBoxOverlay[];
  readonly planManifestSha256Hex: string;
  readonly impositionManifestSha256Hex: string;
}

export const MIN_PRINT_BLEED_MM = 3.0;
export const DEFAULT_SAFE_MARGIN_MM = 10.0;
export const HARD_TRIM_CLIPPING_ZONE_MM = 3.0;
export const MAX_BOOK_RAW_PAGE_COUNT = 2048;

export const BOOK_BINDING_PROFILES: Readonly<Record<BookBindingMethod, BookBindingProfile>> = {
  "saddle-stitch": {
    method: "saddle-stitch",
    labelKo: "중철 제본 (Saddle Stitch)",
    defaultSignatureSizePages: 4,
    isSingleNestedGathering: true,
    hasFlatSpine: false,
    defaultCoverBoardThicknessMm: 0.0,
    defaultSpineHiddenZoneMm: 2.5,
    creepFoldMultiplier: 1.5,
    spineMillingAllowanceMm: 0.0,
  },
  "perfect-bound-pur": {
    method: "perfect-bound-pur",
    labelKo: "무선 PUR 제본 (Perfect Bound PUR)",
    defaultSignatureSizePages: 16,
    isSingleNestedGathering: false,
    hasFlatSpine: true,
    defaultCoverBoardThicknessMm: 0.6,
    defaultSpineHiddenZoneMm: 8.0,
    creepFoldMultiplier: 1.0,
    spineMillingAllowanceMm: 2.0,
  },
  "smyth-sewn-hardcover": {
    method: "smyth-sewn-hardcover",
    labelKo: "사철 양장 제본 (Smyth-Sewn Hardcover)",
    defaultSignatureSizePages: 16,
    isSingleNestedGathering: false,
    hasFlatSpine: true,
    defaultCoverBoardThicknessMm: 4.0,
    defaultSpineHiddenZoneMm: 3.0,
    creepFoldMultiplier: 1.15,
    spineMillingAllowanceMm: 0.0,
  },
};

export const BOOK_PAPER_STOCK_PRESETS: Readonly<Record<string, BookPaperStockPreset>> = {
  "cream-uncoated-100g": {
    id: "cream-uncoated-100g",
    labelKo: "미색 모조지 100g",
    gsm: 100,
    paperThicknessMm: 0.12,
  },
  "snow-white-120g": {
    id: "snow-white-120g",
    labelKo: "스노우화이트지 120g",
    gsm: 120,
    paperThicknessMm: 0.115,
  },
  "art-coated-150g": {
    id: "art-coated-150g",
    labelKo: "아트지 150g (풀컬러 단행본)",
    gsm: 150,
    paperThicknessMm: 0.14,
  },
  "bulky-comic-90g": {
    id: "bulky-comic-90g",
    labelKo: "만화 전용 벌크지 90g",
    gsm: 90,
    paperThicknessMm: 0.135,
  },
};

export class BookImpositionValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "BookImpositionValidationError";
    this.code = code;
  }
}

export function roundMm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isValidBindingMethod(value: unknown): value is BookBindingMethod {
  return (
    value === "saddle-stitch" ||
    value === "perfect-bound-pur" ||
    value === "smyth-sewn-hardcover"
  );
}

export function isValidReadingDirection(value: unknown): value is BookReadingDirection {
  return value === "ltr-korean-western" || value === "rtl-japanese-manga";
}

export function isValidSignatureSizePages(value: unknown): value is BookSignatureSizePages {
  return value === 4 || value === 8 || value === 16;
}

export function assertFinitePositive(value: number, field: string, maxValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maxValue) {
    throw new BookImpositionValidationError(
      `invalid-${field}`,
      `${field} 값은 0 초과 ${String(maxValue)} 이하의 유한수여야 합니다 (입력값: ${String(value)}).`,
    );
  }
  return value;
}

export function assertFiniteNonNegative(value: number, field: string, maxValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maxValue) {
    throw new BookImpositionValidationError(
      `invalid-${field}`,
      `${field} 값은 0 이상 ${String(maxValue)} 이하의 유한수여야 합니다 (입력값: ${String(value)}).`,
    );
  }
  return value;
}

export function assertPositiveInteger(value: number, field: string, maxValue: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maxValue
  ) {
    throw new BookImpositionValidationError(
      `invalid-${field}`,
      `${field} 값은 1 이상 ${String(maxValue)} 이하의 정수여야 합니다 (입력값: ${String(value)}).`,
    );
  }
  return value;
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 해시. */
export function sha256ImpositionHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const w16 = w[i - 16] ?? 0;
      const w7 = w[i - 7] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const kVal = SHA256_K[i] ?? 0;
      const wVal = w[i] ?? 0;
      const temp1 = (h + S1 + ch + kVal + wVal) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 키 순서와 무관한 결정론적 JSON 문자열을 만든다. */
export function canonicalizeImpositionJson(value: unknown): string {
  if (value === null) return "null";
  const valueType = typeof value;
  if (valueType === "boolean") return value ? "true" : "false";
  if (valueType === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    return Object.is(num, -0) ? "0" : JSON.stringify(num);
  }
  if (valueType === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const element: unknown = value[i];
      parts.push(element === undefined ? "null" : canonicalizeImpositionJson(element));
    }
    return `[${parts.join(",")}]`;
  }
  if (valueType === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key !== undefined && record[key] !== undefined) {
        parts.push(`${JSON.stringify(key)}:${canonicalizeImpositionJson(record[key])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}
