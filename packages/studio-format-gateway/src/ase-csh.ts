/**
 * Adobe Swatch Exchange (`.ase`) 및 Adobe Custom Shapes (`.csh`) 바이너리 코덱
 *
 * REA 정적 역공학(`ev_1389c786e149edcb794d7345acc24456164a5b89c20bc5cac89540e43f7f60ff`,
 * `ag-psd/dist/ase.js`, `ag-psd/dist/csh.js`, `ag-psd/dist/additionalInfo.js`)에서 확인된
 * Adobe 바이너리 사양을 브라우저/서버 겸용 순수 TypedArray/DataView 코덱으로 클린룸 구현한다.
 *
 * 1. `.ase` (Adobe Swatch Exchange):
 *    - 시그니처 `'ASEF'`, 버전 `1.0` (`u16=1, u16=0`), `blocksCount(u32)`
 *    - 블록 타입 `0x0001`(색상 항목), `0xC001`(그룹 시작), `0xC002`(그룹 종료)
 *    - 색상 모드 `'RGB '`, `'CMYK'`, `'Gray'`, `'LAB '` 및 색상 유형 `global(0)` / `spot(1)` / `normal(2)`
 *    - 양방향 무손실 `importAse` / `exportAse` 및 즉시 팔레트 연동용 sRGB `#rrggbb` 변환 제공
 *
 * 2. `.csh` (Adobe Custom Shapes):
 *    - 시그니처 `'cush'`, 버전 `2` (`u32=2`), `count(u32)`
 *    - UTF-16BE 이름 + 4바이트 정렬 패딩 + shapeVersion `1` (`u32=1`) + `size(u32)` + Pascal ID 문자열
 *    - 바운딩 박스 `y1, x1, y2, x2` (`u32`) + 26바이트 포토샵 벡터 마스크 패스 레코드(`type 0..8`, 8.24 고정소수점)
 *    - 양방향 `importCsh` / `exportCsh` 및 SVG `<path d="...">` 변환(`cshShapeToSvgPath`) 제공
 */

import { stripTrailingNuls, utf16UnitsToString } from "./nul-text";

export type AseSwatchType = "global" | "spot" | "normal";

export interface AseRgbColor {
  readonly mode: "RGB";
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly type: AseSwatchType;
}

export interface AseCmykColor {
  readonly mode: "CMYK";
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly type: AseSwatchType;
}

export interface AseGrayColor {
  readonly mode: "Gray";
  readonly k: number;
  readonly type: AseSwatchType;
}

export interface AseLabColor {
  readonly mode: "LAB";
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly type: AseSwatchType;
}

export type AseColorValue =
  | AseRgbColor
  | AseCmykColor
  | AseGrayColor
  | AseLabColor;

export interface AseSwatchEntry {
  readonly name: string;
  readonly color: AseColorValue;
  /** 스튜디오 컬러 팔레트에 즉시 바인딩할 수 있는 정규화 sRGB `#rrggbb` */
  readonly rgbHex: string;
  readonly groupName?: string;
}

export interface AseSwatchGroup {
  readonly name: string;
  readonly colors: readonly AseSwatchEntry[];
}

export interface AseImportResult {
  readonly versionMajor: 1;
  readonly versionMinor: 0;
  readonly colors: readonly AseSwatchEntry[];
  readonly groups: readonly AseSwatchGroup[];
  readonly warnings: readonly string[];
}

export class AseParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "truncated"
      | "invalid-signature"
      | "unsupported-version"
      | "invalid-block-type"
      | "invalid-color-mode",
  ) {
    super(message);
    this.name = "AseParseError";
  }
}

const ASE_SWATCH_TYPES: readonly AseSwatchType[] = ["global", "spot", "normal"];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function toHexByte(value01: number): string {
  const byte = Math.round(clamp01(value01) * 255);
  return byte.toString(16).padStart(2, "0");
}

/**
 * `.ase` 색상 모델(`RGB`, `CMYK`, `Gray`, `LAB`)을 sRGB `#rrggbb` 문자열로 결정론적 변환한다.
 */
export function aseColorToRgbHex(color: AseColorValue): string {
  switch (color.mode) {
    case "RGB":
      return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`;
    case "CMYK": {
      const c = clamp01(color.c);
      const m = clamp01(color.m);
      const y = clamp01(color.y);
      const k = clamp01(color.k);
      const r = (1 - c) * (1 - k);
      const g = (1 - m) * (1 - k);
      const b = (1 - y) * (1 - k);
      return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
    }
    case "Gray": {
      // Adobe ASE Gray는 0=검정..1=흰색 또는 톤 값으로 기록되므로 클램프 후 동일 채널에 투영한다.
      const v = clamp01(1 - color.k);
      return `#${toHexByte(v)}${toHexByte(v)}${toHexByte(v)}`;
    }
    case "LAB": {
      // CIE L*a*b* (D50/D65 근사, L: 0..1 또는 0..100) -> XYZ -> sRGB 변환
      const rawL = Number.isFinite(color.l) ? color.l : 0;
      const L = rawL <= 1.0001 ? clamp01(rawL) * 100 : Math.min(100, Math.max(0, rawL));
      const a = Number.isFinite(color.a) ? Math.min(128, Math.max(-128, color.a)) : 0;
      const b = Number.isFinite(color.b) ? Math.min(128, Math.max(-128, color.b)) : 0;
      const fy = (L + 16) / 116;
      const fx = a / 500 + fy;
      const fz = fy - b / 200;
      const cubeOrLinear = (t: number): number => {
        const t3 = t * t * t;
        return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
      };
      const x = 0.95047 * cubeOrLinear(fx);
      const y = 1.0 * cubeOrLinear(fy);
      const z = 1.08883 * cubeOrLinear(fz);
      const linR = x * 3.2406 + y * -1.5372 + z * -0.4986;
      const linG = x * -0.9689 + y * 1.8758 + z * 0.0415;
      const linB = x * 0.0557 + y * -0.204 + z * 1.057;
      const toSrgb = (c: number): number => {
        const cl = clamp01(c);
        return cl <= 0.0031308 ? 12.92 * cl : 1.055 * cl ** (1 / 2.4) - 0.055;
      };
      return `#${toHexByte(toSrgb(linR))}${toHexByte(toSrgb(linG))}${toHexByte(toSrgb(linB))}`;
    }
  }
}

function readAscii4(view: DataView, offset: number): string {
  if (offset + 4 > view.byteLength) {
    throw new AseParseError("unexpected EOF while reading 4-byte signature", "truncated");
  }
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readUtf16BeStringWithLength(
  view: DataView,
  offset: number,
  unitCount: number,
  errorFactory: (msg: string) => Error,
): { text: string; nextOffset: number } {
  const byteLength = unitCount * 2;
  if (offset + byteLength > view.byteLength) {
    throw errorFactory("UTF-16 string exceeds available bytes");
  }
  const units: number[] = [];
  for (let i = 0; i < unitCount; i += 1) {
    units.push(view.getUint16(offset + i * 2, false));
  }
  return {
    text: stripTrailingNuls(utf16UnitsToString(units)),
    nextOffset: offset + byteLength,
  };
}

/**
 * Adobe Swatch Exchange (`.ase`) 바이너리를 파싱한다.
 */
export function importAse(bytes: Uint8Array): AseImportResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) {
    throw new AseParseError("file shorter than the 12-byte ASE header", "truncated");
  }
  const signature = readAscii4(view, 0);
  if (signature !== "ASEF") {
    throw new AseParseError(`invalid ASE signature: ${signature}`, "invalid-signature");
  }
  const versionMajor = view.getUint16(4, false);
  const versionMinor = view.getUint16(6, false);
  if (versionMajor !== 1 || versionMinor !== 0) {
    throw new AseParseError(
      `unsupported ASE version ${versionMajor}.${versionMinor}`,
      "unsupported-version",
    );
  }
  const blocksCount = view.getUint32(8, false);
  if (blocksCount > 100_000) {
    throw new AseParseError(`ASE block count ${blocksCount} exceeds safety ceiling`, "truncated");
  }

  let offset = 12;
  const allColors: AseSwatchEntry[] = [];
  const groups: Array<{ name: string; colors: AseSwatchEntry[] }> = [];
  const warnings: string[] = [];
  let activeGroup: { name: string; colors: AseSwatchEntry[] } | null = null;

  for (let blockIndex = 0; blockIndex < blocksCount; blockIndex += 1) {
    if (offset + 6 > bytes.byteLength) {
      throw new AseParseError(`block ${blockIndex}: header exceeds file length`, "truncated");
    }
    const blockType = view.getUint16(offset, false);
    const blockLength = view.getUint32(offset + 2, false);
    offset += 6;
    const blockEnd = offset + blockLength;
    if (blockEnd > bytes.byteLength) {
      throw new AseParseError(`block ${blockIndex}: body exceeds file length`, "truncated");
    }

    if (blockType === 0x0001) {
      if (offset + 2 > blockEnd) {
        throw new AseParseError(`block ${blockIndex}: missing name length`, "truncated");
      }
      const nameLength = view.getUint16(offset, false);
      const parsedName = readUtf16BeStringWithLength(
        view,
        offset + 2,
        nameLength,
        (msg) => new AseParseError(msg, "truncated"),
      );
      let cursor = parsedName.nextOffset;
      if (cursor + 4 > blockEnd) {
        throw new AseParseError(`block ${blockIndex}: missing color mode signature`, "truncated");
      }
      const colorMode = readAscii4(view, cursor);
      cursor += 4;

      let color: AseColorValue;
      switch (colorMode) {
        case "RGB ": {
          if (cursor + 14 > blockEnd) {
            throw new AseParseError(`block ${blockIndex}: truncated RGB payload`, "truncated");
          }
          const r = view.getFloat32(cursor, false);
          const g = view.getFloat32(cursor + 4, false);
          const b = view.getFloat32(cursor + 8, false);
          const rawType = view.getUint16(cursor + 12, false);
          const type = ASE_SWATCH_TYPES[rawType] ?? "normal";
          if (ASE_SWATCH_TYPES[rawType] === undefined) {
            warnings.push(`block ${blockIndex}: unknown swatch type ${rawType}, defaulted to normal`);
          }
          color = { mode: "RGB", r, g, b, type };
          break;
        }
        case "CMYK": {
          if (cursor + 18 > blockEnd) {
            throw new AseParseError(`block ${blockIndex}: truncated CMYK payload`, "truncated");
          }
          const c = view.getFloat32(cursor, false);
          const m = view.getFloat32(cursor + 4, false);
          const y = view.getFloat32(cursor + 8, false);
          const k = view.getFloat32(cursor + 12, false);
          const rawType = view.getUint16(cursor + 16, false);
          const type = ASE_SWATCH_TYPES[rawType] ?? "normal";
          color = { mode: "CMYK", c, m, y, k, type };
          break;
        }
        case "Gray": {
          if (cursor + 6 > blockEnd) {
            throw new AseParseError(`block ${blockIndex}: truncated Gray payload`, "truncated");
          }
          const k = view.getFloat32(cursor, false);
          const rawType = view.getUint16(cursor + 4, false);
          const type = ASE_SWATCH_TYPES[rawType] ?? "normal";
          color = { mode: "Gray", k, type };
          break;
        }
        case "LAB ": {
          if (cursor + 14 > blockEnd) {
            throw new AseParseError(`block ${blockIndex}: truncated LAB payload`, "truncated");
          }
          const l = view.getFloat32(cursor, false);
          const a = view.getFloat32(cursor + 4, false);
          const b = view.getFloat32(cursor + 8, false);
          const rawType = view.getUint16(cursor + 12, false);
          const type = ASE_SWATCH_TYPES[rawType] ?? "normal";
          color = { mode: "LAB", l, a, b, type };
          break;
        }
        default:
          throw new AseParseError(
            `block ${blockIndex}: invalid ASE color mode '${colorMode}'`,
            "invalid-color-mode",
          );
      }

      const entry: AseSwatchEntry = {
        name: parsedName.text,
        color,
        rgbHex: aseColorToRgbHex(color),
        ...(activeGroup ? { groupName: activeGroup.name } : {}),
      };
      allColors.push(entry);
      if (activeGroup) {
        activeGroup.colors.push(entry);
      }
    } else if (blockType === 0xc001) {
      if (offset + 2 > blockEnd) {
        throw new AseParseError(`block ${blockIndex}: missing group name length`, "truncated");
      }
      const nameLength = view.getUint16(offset, false);
      const parsedName = readUtf16BeStringWithLength(
        view,
        offset + 2,
        nameLength,
        (msg) => new AseParseError(msg, "truncated"),
      );
      activeGroup = { name: parsedName.text, colors: [] };
      groups.push(activeGroup);
    } else if (blockType === 0xc002) {
      activeGroup = null;
    } else {
      throw new AseParseError(
        `block ${blockIndex}: unrecognized ASE block type 0x${blockType.toString(16)}`,
        "invalid-block-type",
      );
    }

    offset = blockEnd;
  }

  return {
    versionMajor: 1,
    versionMinor: 0,
    colors: allColors,
    groups: groups.map((group) => ({ name: group.name, colors: group.colors })),
    warnings,
  };
}

function encodeUtf16BeNullTerminated(text: string): Uint8Array {
  const clean = stripTrailingNuls(text);
  const unitCount = clean.length + 1;
  const out = new Uint8Array(2 + unitCount * 2);
  const view = new DataView(out.buffer);
  view.setUint16(0, unitCount, false);
  for (let i = 0; i < clean.length; i += 1) {
    view.setUint16(2 + i * 2, clean.charCodeAt(i), false);
  }
  view.setUint16(2 + clean.length * 2, 0, false);
  return out;
}

function serializeAseColorBlock(entry: {
  readonly name: string;
  readonly color: AseColorValue;
}): Uint8Array {
  const nameBytes = encodeUtf16BeNullTerminated(entry.name);
  const channelCount =
    entry.color.mode === "CMYK" ? 4 : entry.color.mode === "Gray" ? 1 : 3;
  const payloadLength = nameBytes.byteLength + 4 + channelCount * 4 + 2;
  const block = new Uint8Array(6 + payloadLength);
  const view = new DataView(block.buffer);
  view.setUint16(0, 0x0001, false);
  view.setUint32(2, payloadLength, false);
  block.set(nameBytes, 6);
  let cursor = 6 + nameBytes.byteLength;
  const modeTag =
    entry.color.mode === "RGB"
      ? "RGB "
      : entry.color.mode === "LAB"
        ? "LAB "
        : entry.color.mode;
  for (let i = 0; i < 4; i += 1) {
    view.setUint8(cursor + i, modeTag.charCodeAt(i));
  }
  cursor += 4;
  if (entry.color.mode === "RGB") {
    view.setFloat32(cursor, entry.color.r, false);
    view.setFloat32(cursor + 4, entry.color.g, false);
    view.setFloat32(cursor + 8, entry.color.b, false);
    cursor += 12;
  } else if (entry.color.mode === "CMYK") {
    view.setFloat32(cursor, entry.color.c, false);
    view.setFloat32(cursor + 4, entry.color.m, false);
    view.setFloat32(cursor + 8, entry.color.y, false);
    view.setFloat32(cursor + 12, entry.color.k, false);
    cursor += 16;
  } else if (entry.color.mode === "Gray") {
    view.setFloat32(cursor, entry.color.k, false);
    cursor += 4;
  } else {
    view.setFloat32(cursor, entry.color.l, false);
    view.setFloat32(cursor + 4, entry.color.a, false);
    view.setFloat32(cursor + 8, entry.color.b, false);
    cursor += 12;
  }
  const typeIndex = Math.max(0, ASE_SWATCH_TYPES.indexOf(entry.color.type));
  view.setUint16(cursor, typeIndex, false);
  return block;
}

/**
 * 스와치 및 그룹 목록을 Adobe Swatch Exchange (`.ase`) 바이너리로 직렬화한다.
 */
export function exportAse(input: {
  readonly colors?: ReadonlyArray<{ readonly name: string; readonly color: AseColorValue }>;
  readonly groups?: ReadonlyArray<{
    readonly name: string;
    readonly colors: ReadonlyArray<{ readonly name: string; readonly color: AseColorValue }>;
  }>;
}): Uint8Array {
  const blocks: Uint8Array[] = [];

  for (const group of input.groups ?? []) {
    const nameBytes = encodeUtf16BeNullTerminated(group.name);
    const startBlock = new Uint8Array(6 + nameBytes.byteLength);
    const startView = new DataView(startBlock.buffer);
    startView.setUint16(0, 0xc001, false);
    startView.setUint32(2, nameBytes.byteLength, false);
    startBlock.set(nameBytes, 6);
    blocks.push(startBlock);

    for (const entry of group.colors) {
      blocks.push(serializeAseColorBlock(entry));
    }

    const endBlock = new Uint8Array(6);
    const endView = new DataView(endBlock.buffer);
    endView.setUint16(0, 0xc002, false);
    endView.setUint32(2, 0, false);
    blocks.push(endBlock);
  }

  for (const entry of input.colors ?? []) {
    blocks.push(serializeAseColorBlock(entry));
  }

  const totalBlockBytes = blocks.reduce((acc, b) => acc + b.byteLength, 0);
  const out = new Uint8Array(12 + totalBlockBytes);
  const view = new DataView(out.buffer);
  out[0] = "A".charCodeAt(0);
  out[1] = "S".charCodeAt(0);
  out[2] = "E".charCodeAt(0);
  out[3] = "F".charCodeAt(0);
  view.setUint16(4, 1, false);
  view.setUint16(6, 0, false);
  view.setUint32(8, blocks.length, false);

  let offset = 12;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.byteLength;
  }
  return out;
}

export * from "./csh-codec";

