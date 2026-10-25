/**
 * Clip Studio Paint `.cls` (`SLCC` Color Set) 바이너리 포맷 파서 및 인코더.
 *
 * REA 정적·바이너리 분석 대상:
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ColorSet/MixColorSet.cls` (13개 색 섞기 기본 스와치)
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ColorSet/korean/001Start.cls` ("시작 컬러 세트", 48슬롯)
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ColorSet/korean/002.cls` ("추가 컬러 세트", 128슬롯)
 *
 * 바이너리 레이아웃 (`SLCC` v1.0):
 * - Offset `0..3`: Magic `"SLCC"` (`0x53 0x4c 0x43 0x43`)
 * - Offset `4..5`: `u16le` version (`0x0100` = 256)
 * - Offset `6..9`: `u32le` `headerByteLen`
 * - Offset `10 .. 10 + headerByteLen`:
 *   - `u16le` `asciiNameByteLen` + ASCII bytes
 *   - `u32le` reserved (`0`)
 *   - `u16le` `utf8NameByteLen` + UTF-8 bytes (로컬라이즈 세트명)
 * - Offset `p = 10 + headerByteLen`:
 *   - `u32le` `channels` (`4`, RGBA)
 *   - `u32le` `swatchCount`
 *   - `u32le` `payloadByteLen`
 * - Offset `p + 12` 이후 `swatchCount`개 레코드:
 *   - `u32le` `recordByteLen` (이름 없음: `8`, 이름 있음: `10 + utf16ByteLen`)
 *   - `u8 r, g, b, a`
 *   - `u32le` `hasName` (`0` 또는 `1`)
 *   - `hasName !== 0`일 때 `u16le utf16ByteLen` + UTF-16LE 문자열 바이트
 */

export const CSP_CLS_MAGIC = "SLCC";
export const CSP_CLS_VERSION_V1 = 0x0100;

export interface CspClsSwatch {
  readonly index: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly hex: string;
  readonly hex8: string;
  readonly isTransparentSlot: boolean;
  readonly name?: string;
}

export interface CspClsColorSetDocument {
  readonly format: "csp-cls";
  readonly version: number;
  readonly asciiName: string;
  readonly localizedName: string;
  readonly channels: number;
  readonly swatches: readonly CspClsSwatch[];
}

export interface CspClsSwatchInput {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
  readonly name?: string;
}

export interface CspClsColorSetInput {
  readonly asciiName: string;
  readonly localizedName?: string;
  readonly swatches: readonly CspClsSwatchInput[];
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}

function byteToHex(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

export function formatCspSwatchHex(r: number, g: number, b: number): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

export function formatCspSwatchHex8(
  r: number,
  g: number,
  b: number,
  a: number,
): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}${byteToHex(a)}`;
}

function decodeUtf16Le(bytes: Uint8Array): string {
  const codeUnits: number[] = [];
  for (let i = 0; i + 1 < bytes.byteLength; i += 2) {
    const unit = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8);
    if (unit === 0) break;
    codeUnits.push(unit);
  }
  return String.fromCharCode(...codeUnits);
}

function encodeUtf16Le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >>> 8) & 0xff;
  }
  return out;
}

/**
 * Clip Studio `.cls` (`SLCC`) 바이너리 바이트 배열을 파싱합니다.
 */
export function parseCspClsColorSet(
  bytes: Uint8Array,
): CspClsColorSetDocument {
  if (bytes.byteLength < 22) {
    throw new Error(
      `Invalid CSP .cls file: byteLength ${bytes.byteLength} is smaller than minimum header (22 bytes).`,
    );
  }

  const magic = String.fromCharCode(
    bytes[0] ?? 0,
    bytes[1] ?? 0,
    bytes[2] ?? 0,
    bytes[3] ?? 0,
  );
  if (magic !== CSP_CLS_MAGIC) {
    throw new Error(
      `Invalid CSP .cls magic: expected "${CSP_CLS_MAGIC}", received "${magic}".`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  const headerByteLen = view.getUint32(6, true);
  const headerEnd = 10 + headerByteLen;

  if (headerEnd + 12 > bytes.byteLength) {
    throw new Error(
      `Corrupted CSP .cls header: headerByteLen=${headerByteLen} exceeds file length=${bytes.byteLength}.`,
    );
  }

  const utf8Decoder = new TextDecoder("utf-8");
  let headerCursor = 10;
  let asciiName = "";
  let localizedName = "";

  if (headerCursor + 2 <= headerEnd) {
    const asciiLen = view.getUint16(headerCursor, true);
    headerCursor += 2;
    if (headerCursor + asciiLen <= headerEnd) {
      asciiName = utf8Decoder.decode(
        bytes.subarray(headerCursor, headerCursor + asciiLen),
      );
      headerCursor += asciiLen;
    }
  }

  // 4바이트 예약 필드 스킵
  if (headerCursor + 4 <= headerEnd) {
    headerCursor += 4;
  }

  if (headerCursor + 2 <= headerEnd) {
    const utf8Len = view.getUint16(headerCursor, true);
    headerCursor += 2;
    if (headerCursor + utf8Len <= headerEnd) {
      localizedName = utf8Decoder.decode(
        bytes.subarray(headerCursor, headerCursor + utf8Len),
      );
    }
  }

  if (!localizedName) {
    localizedName = asciiName || "Untitled Color Set";
  }
  if (!asciiName) {
    asciiName = localizedName;
  }

  const channels = view.getUint32(headerEnd, true);
  const swatchCount = view.getUint32(headerEnd + 4, true);
  let cursor = headerEnd + 12;

  const swatches: CspClsSwatch[] = [];
  for (let index = 0; index < swatchCount; index += 1) {
    if (cursor + 12 > bytes.byteLength) {
      break;
    }
    const recordByteLen = view.getUint32(cursor, true);
    const recordStart = cursor + 4;
    const recordEnd = Math.min(bytes.byteLength, recordStart + recordByteLen);
    if (recordByteLen < 8 || recordStart + 8 > bytes.byteLength) {
      break;
    }

    const r = bytes[recordStart] ?? 0;
    const g = bytes[recordStart + 1] ?? 0;
    const b = bytes[recordStart + 2] ?? 0;
    const a = bytes[recordStart + 3] ?? 0;
    const hasName = view.getUint32(recordStart + 4, true);

    let name: string | undefined;
    if (hasName !== 0 && recordStart + 10 <= recordEnd) {
      const utf16ByteLen = view.getUint16(recordStart + 8, true);
      const strStart = recordStart + 10;
      const strEnd = Math.min(recordEnd, strStart + utf16ByteLen);
      const decoded = decodeUtf16Le(bytes.subarray(strStart, strEnd));
      if (decoded.length > 0) {
        name = decoded;
      }
    }

    swatches.push({
      index,
      r,
      g,
      b,
      a,
      hex: formatCspSwatchHex(r, g, b),
      hex8: formatCspSwatchHex8(r, g, b, a),
      isTransparentSlot: a === 0,
      ...(name !== undefined ? { name } : {}),
    });

    cursor = recordStart + recordByteLen;
  }

  return {
    format: "csp-cls",
    version,
    asciiName,
    localizedName,
    channels,
    swatches,
  };
}

/**
 * 컬러 세트 데이터를 Clip Studio `.cls` (`SLCC` v1.0) 바이너리 포맷으로 인코딩합니다.
 */
export function encodeCspClsColorSet(input: CspClsColorSetInput): Uint8Array {
  const utf8Encoder = new TextEncoder();
  const asciiName = input.asciiName.trim() || "ColorSet";
  const localizedName = (input.localizedName ?? asciiName).trim() || asciiName;

  const asciiBytes = utf8Encoder.encode(asciiName);
  const utf8Bytes = utf8Encoder.encode(localizedName);
  const headerByteLen = 2 + asciiBytes.byteLength + 4 + 2 + utf8Bytes.byteLength;

  const encodedRecords: Uint8Array[] = [];
  let payloadByteLen = 0;

  for (const item of input.swatches) {
    const r = clampByte(item.r);
    const g = clampByte(item.g);
    const b = clampByte(item.b);
    const a = clampByte(item.a ?? 255);
    const trimmedName = item.name?.trim() ?? "";

    if (trimmedName.length > 0) {
      const nameUtf16 = encodeUtf16Le(trimmedName);
      const recordByteLen = 10 + nameUtf16.byteLength;
      const record = new Uint8Array(4 + recordByteLen);
      const rv = new DataView(record.buffer);
      rv.setUint32(0, recordByteLen, true);
      record[4] = r;
      record[5] = g;
      record[6] = b;
      record[7] = a;
      rv.setUint32(8, 1, true);
      rv.setUint16(12, nameUtf16.byteLength, true);
      record.set(nameUtf16, 14);
      encodedRecords.push(record);
      payloadByteLen += record.byteLength;
    } else {
      const record = new Uint8Array(12);
      const rv = new DataView(record.buffer);
      rv.setUint32(0, 8, true);
      record[4] = r;
      record[5] = g;
      record[6] = b;
      record[7] = a;
      rv.setUint32(8, 0, true);
      encodedRecords.push(record);
      payloadByteLen += record.byteLength;
    }
  }

  const totalByteLen = 10 + headerByteLen + 12 + payloadByteLen;
  const output = new Uint8Array(totalByteLen);
  const view = new DataView(output.buffer);

  output[0] = 0x53; // 'S'
  output[1] = 0x4c; // 'L'
  output[2] = 0x43; // 'C'
  output[3] = 0x43; // 'C'
  view.setUint16(4, CSP_CLS_VERSION_V1, true);
  view.setUint32(6, headerByteLen, true);

  let cursor = 10;
  view.setUint16(cursor, asciiBytes.byteLength, true);
  cursor += 2;
  output.set(asciiBytes, cursor);
  cursor += asciiBytes.byteLength;

  view.setUint32(cursor, 0, true);
  cursor += 4;

  view.setUint16(cursor, utf8Bytes.byteLength, true);
  cursor += 2;
  output.set(utf8Bytes, cursor);
  cursor += utf8Bytes.byteLength;

  view.setUint32(cursor, 4, true);
  view.setUint32(cursor + 4, encodedRecords.length, true);
  view.setUint32(cursor + 8, payloadByteLen, true);
  cursor += 12;

  for (const record of encodedRecords) {
    output.set(record, cursor);
    cursor += record.byteLength;
  }

  return output;
}

/**
 * REA로 추출한 Clip Studio `MixColorSet.cls` (색 섞기 팔레트 상단 13개 기본 스와치).
 */
export const CSP_MIX_COLOR_SET_SWATCHES: readonly CspClsSwatch[] = [
  { index: 0, r: 255, g: 40, b: 60, a: 255, hex: "#ff283c", hex8: "#ff283cff", isTransparentSlot: false, name: " 크림슨 레드" },
  { index: 1, r: 255, g: 156, b: 53, a: 255, hex: "#ff9c35", hex8: "#ff9c35ff", isTransparentSlot: false, name: "오렌지 옐로" },
  { index: 2, r: 255, g: 247, b: 82, a: 255, hex: "#fff752", hex8: "#fff752ff", isTransparentSlot: false, name: "레몬 옐로" },
  { index: 3, r: 85, g: 231, b: 78, a: 255, hex: "#55e74e", hex8: "#55e74eff", isTransparentSlot: false, name: "에메랄드 그린" },
  { index: 4, r: 0, g: 97, b: 114, a: 255, hex: "#006172", hex8: "#006172ff", isTransparentSlot: false, name: "딥 틸" },
  { index: 5, r: 42, g: 116, b: 255, a: 255, hex: "#2a74ff", hex8: "#2a74ffff", isTransparentSlot: false, name: "코발트 블루" },
  { index: 6, r: 35, g: 216, b: 255, a: 255, hex: "#23d8ff", hex8: "#23d8ffff", isTransparentSlot: false, name: "스카이 시안" },
  { index: 7, r: 140, g: 52, b: 255, a: 255, hex: "#8c34ff", hex8: "#8c34ffff", isTransparentSlot: false, name: "바이올렛" },
  { index: 8, r: 255, g: 120, b: 170, a: 255, hex: "#ff78aa", hex8: "#ff78aaff", isTransparentSlot: false, name: "로즈 핑크" },
  { index: 9, r: 131, g: 81, b: 23, a: 255, hex: "#835117", hex8: "#835117ff", isTransparentSlot: false, name: "번트 엄버" },
  { index: 10, r: 255, g: 204, b: 194, a: 255, hex: "#ffccc2", hex8: "#ffccc2ff", isTransparentSlot: false, name: "피치 스킨" },
  { index: 11, r: 255, g: 255, b: 255, a: 255, hex: "#ffffff", hex8: "#ffffffff", isTransparentSlot: false, name: "흰색" },
  { index: 12, r: 0, g: 0, b: 0, a: 255, hex: "#000000", hex8: "#000000ff", isTransparentSlot: false, name: "검정색" },
] as const;

export interface CspColorSetPresetSummary {
  readonly id: string;
  readonly asciiName: string;
  readonly localizedNameKo: string;
  readonly totalSlotCount: number;
  readonly keySwatches: readonly CspClsSwatchInput[];
}

/**
 * REA로 검증된 Clip Studio 기본 컬러 세트(`001Start.cls`, `002.cls`, `MixColorSet.cls`) 프리셋 카탈로그.
 */
export const CSP_START_COLOR_SET_PRESETS: readonly CspColorSetPresetSummary[] = [
  {
    id: "csp-001-start",
    asciiName: "001Start",
    localizedNameKo: "시작 컬러 세트",
    totalSlotCount: 48,
    keySwatches: [
      { r: 0, g: 0, b: 0, a: 0, name: "투명색" },
      { r: 0, g: 0, b: 0, a: 255, name: "검정색" },
      { r: 63, g: 63, b: 63, a: 255, name: "25% 회색" },
      { r: 127, g: 127, b: 127, a: 255, name: "50% 회색" },
      { r: 191, g: 191, b: 191, a: 255, name: "75% 회색" },
      { r: 255, g: 255, b: 255, a: 255, name: "흰색" },
      { r: 255, g: 0, b: 0, a: 255, name: "빨간색" },
      { r: 0, g: 255, b: 0, a: 255, name: "녹색" },
      { r: 0, g: 0, b: 255, a: 255, name: "파란색" },
      { r: 255, g: 255, b: 0, a: 255, name: "노란색" },
      { r: 0, g: 255, b: 255, a: 255, name: "시안" },
      { r: 255, g: 0, b: 255, a: 255, name: "마젠타" },
    ],
  },
  {
    id: "csp-002-additional",
    asciiName: "002",
    localizedNameKo: "추가 컬러 세트",
    totalSlotCount: 128,
    keySwatches: [
      { r: 0, g: 0, b: 0, a: 255, name: "검정색" },
      { r: 255, g: 255, b: 255, a: 255, name: "흰색" },
      { r: 230, g: 0, b: 18, a: 255, name: "스칼렛" },
      { r: 243, g: 152, b: 0, a: 255, name: "크롬 옐로" },
      { r: 0, g: 153, b: 68, a: 255, name: "비리디안" },
      { r: 0, g: 104, b: 183, a: 255, name: "울트라마린" },
    ],
  },
  {
    id: "csp-mix-color-set",
    asciiName: "MixColorSet",
    localizedNameKo: "색 섞기 기본 컬러 세트",
    totalSlotCount: 13,
    keySwatches: CSP_MIX_COLOR_SET_SWATCHES.map((s) => ({
      r: s.r,
      g: s.g,
      b: s.b,
      a: s.a,
      ...(s.name !== undefined ? { name: s.name.trim() } : {}),
    })),
  },
] as const;
