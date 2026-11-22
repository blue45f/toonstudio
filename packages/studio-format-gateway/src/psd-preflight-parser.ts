/**
 * @file psd-preflight-parser.ts
 * @description 픽셀 채널을 디코드하지 않고 PSD/PSB 바이너리의 헤더·레이어 레코드·추가 블록
 * (`luni`, `lsct`, `TySh`, `SoLd`, `lmfx`, `fxrp`)만 1초 미만 고속 스캔하는 경량 프리플라이트 파서.
 */

import { decodePsdPascalLayerName, type DecodeLegacyLayerNameOptions } from "./legacy-layer-name-decoder";

export interface PsdPreflightParsedEffect {
  readonly type: string;
  readonly name: string;
  readonly isSmartFilter: boolean;
  readonly enabled: boolean;
}

export interface PsdPreflightParsedLayer {
  readonly id: string;
  readonly name: string;
  /** `luni` 유니코드 이름이 없는 구버전 레이어일 때만 원시 Pascal 바이트를 보존한다. */
  readonly rawNameBytes?: Uint8Array;
  readonly hasUnicodeName: boolean;
  readonly parentId: string | null;
  readonly depth: number;
  readonly kind:
    | "raster"
    | "folder"
    | "text"
    | "smart-object"
    | "adjustment"
    | "shape";
  readonly blendMode: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly clipToBelow: boolean;
  readonly hasLayerMask: boolean;
  readonly hasVectorMask: boolean;
  readonly adjustmentType?: string;
  readonly effects: readonly PsdPreflightParsedEffect[];
}

export interface PsdPreflightParsedDocument {
  readonly sourceFileName: string;
  readonly sourceFormat: "psd" | "psb";
  readonly sourceBytesLength: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly bitDepth: 8 | 16 | 32;
  readonly colorMode: "rgb" | "cmyk" | "grayscale" | "lab" | "indexed";
  /** 시각적 레이어 패널 순서(위쪽 레이어가 먼저). */
  readonly layers: readonly PsdPreflightParsedLayer[];
  readonly warnings: readonly string[];
}

const PSD_BLEND_MODE_MAP: Readonly<Record<string, string>> = Object.freeze({
  "pass": "pass-through",
  "norm": "normal",
  "diss": "dissolve",
  "dark": "darken",
  "mul ": "multiply",
  "idiv": "color-burn",
  "lbrn": "linear-burn",
  "dkCl": "darker-color",
  "lite": "lighten",
  "scrn": "screen",
  "div ": "color-dodge",
  "lddg": "add",
  "lgCl": "lighter-color",
  "over": "overlay",
  "sLit": "soft-light",
  "hLit": "hard-light",
  "vLit": "vivid-light",
  "lLit": "linear-light",
  "pLit": "pin-light",
  "hMix": "hard-mix",
  "diff": "difference",
  "smud": "exclusion",
  "fsub": "subtract",
  "fdiv": "divide",
  "hue ": "hue",
  "sat ": "saturation",
  "colr": "color",
  "lum ": "luminosity",
});

const PSD_ADJUSTMENT_TAGS: Readonly<Record<string, string>> = Object.freeze({
  levl: "levels",
  curv: "curves",
  expA: "exposure",
  vibA: "vibrance",
  "hue ": "hue-saturation",
  hue2: "hue-saturation",
  blnc: "color-balance",
  blwh: "black-and-white",
  phfl: "photo-filter",
  mixr: "channel-mixer",
  clrL: "color-lookup-3dlut",
  nvrt: "invert",
  post: "posterize",
  thrs: "threshold",
  grdm: "gradient-map",
  selc: "selective-color",
  brit: "brightness-contrast",
});

const PSB_8BYTE_LENGTH_KEYS = new Set([
  "LMsk", "Lr16", "Lr32", "Layr", "Mt16", "Mt32", "Mtrn", "Alph", "FMsk", "lnk2", "FEid", "FXid", "PxSD",
]);

function readFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function readUint64Safe(view: DataView, offset: number): number {
  const high = view.getUint32(offset, false);
  const low = view.getUint32(offset + 4, false);
  return high * 0x1_0000_0000 + low;
}

function mapPsdColorMode(raw: number): "rgb" | "cmyk" | "grayscale" | "lab" | "indexed" {
  switch (raw) {
    case 1: return "grayscale";
    case 2: return "indexed";
    case 4: return "cmyk";
    case 9: return "lab";
    default: return "rgb";
  }
}

function mapPsdBitDepth(raw: number): 8 | 16 | 32 {
  if (raw === 16) return 16;
  if (raw === 32) return 32;
  return 8;
}

interface RawPsdLayerRecord {
  readonly pascalBytes: Uint8Array;
  readonly unicodeName: string | null;
  readonly blendMode: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly clipToBelow: boolean;
  readonly hasLayerMask: boolean;
  readonly hasVectorMask: boolean;
  readonly sectionDividerType: number | null;
  readonly sectionBlendMode: string | null;
  readonly isText: boolean;
  readonly isSmartObject: boolean;
  readonly isShape: boolean;
  readonly adjustmentType?: string;
  readonly effects: readonly PsdPreflightParsedEffect[];
}

function readUnicodeLuni(view: DataView, offset: number, length: number): string | null {
  if (length < 4 || offset + 4 > view.byteLength) return null;
  const charCount = view.getUint32(offset, false);
  const availableChars = Math.min(charCount, Math.floor((length - 4) / 2));
  let text = "";
  for (let i = 0; i < availableChars; i += 1) {
    const code = view.getUint16(offset + 4 + i * 2, false);
    if (code !== 0) text += String.fromCharCode(code);
  }
  return text.length > 0 ? text : null;
}

/**
 * PSD/PSB 바이너리에서 픽셀 압축 해제를 건너뛰고 구조 메타데이터만 빠르게 추출한다.
 */
export function parsePsdStructureForPreflight(
  bytes: Uint8Array,
  sourceFileName: string,
  options: DecodeLegacyLayerNameOptions & { readonly maxLayers?: number } = {},
): PsdPreflightParsedDocument {
  if (bytes.byteLength < 26) {
    throw new Error(`유효하지 않은 PSD 헤더 길이입니다 (${bytes.byteLength} bytes).`);
  }
  const signature = readFourCc(bytes, 0);
  if (signature !== "8BPS") {
    throw new Error(`PSD 시그니처(8BPS)가 일치하지 않습니다: ${signature}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, false);
  if (version !== 1 && version !== 2) {
    throw new Error(`지원하지 않는 PSD/PSB 버전입니다: ${version}`);
  }
  const isPsb = version === 2;
  const canvasHeight = view.getUint32(14, false);
  const canvasWidth = view.getUint32(18, false);
  const bitDepth = mapPsdBitDepth(view.getUint16(22, false));
  const colorMode = mapPsdColorMode(view.getUint16(24, false));

  const warnings: string[] = [];
  const maxLayers = options.maxLayers ?? 10_000;

  let cursor = 26;
  // 1. Color Mode Data 섹션 건너뛰기
  if (cursor + 4 > bytes.byteLength) {
    return {
      sourceFileName,
      sourceFormat: isPsb ? "psb" : "psd",
      sourceBytesLength: bytes.byteLength,
      canvasWidth,
      canvasHeight,
      bitDepth,
      colorMode,
      layers: [],
      warnings: ["Color Mode Data 섹션이 잘렸습니다."],
    };
  }
  const colorModeLen = view.getUint32(cursor, false);
  cursor += 4 + colorModeLen;

  // 2. Image Resources 섹션 건너뛰기
  if (cursor + 4 > bytes.byteLength) {
    return {
      sourceFileName,
      sourceFormat: isPsb ? "psb" : "psd",
      sourceBytesLength: bytes.byteLength,
      canvasWidth,
      canvasHeight,
      bitDepth,
      colorMode,
      layers: [],
      warnings: ["Image Resources 섹션이 잘렸습니다."],
    };
  }
  const imageResourcesLen = view.getUint32(cursor, false);
  cursor += 4 + imageResourcesLen;

  // 3. Layer and Mask Information 섹션
  const sectionLenFieldBytes = isPsb ? 8 : 4;
  if (cursor + sectionLenFieldBytes > bytes.byteLength) {
    return {
      sourceFileName,
      sourceFormat: isPsb ? "psb" : "psd",
      sourceBytesLength: bytes.byteLength,
      canvasWidth,
      canvasHeight,
      bitDepth,
      colorMode,
      layers: [],
      warnings,
    };
  }
  const layerMaskSectionLen = isPsb
    ? readUint64Safe(view, cursor)
    : view.getUint32(cursor, false);
  cursor += sectionLenFieldBytes;
  if (layerMaskSectionLen === 0 || cursor + sectionLenFieldBytes > bytes.byteLength) {
    return {
      sourceFileName,
      sourceFormat: isPsb ? "psb" : "psd",
      sourceBytesLength: bytes.byteLength,
      canvasWidth,
      canvasHeight,
      bitDepth,
      colorMode,
      layers: [],
      warnings,
    };
  }

  const layerSectionEnd = Math.min(bytes.byteLength, cursor + layerMaskSectionLen);
  const layerInfoLen = isPsb
    ? readUint64Safe(view, cursor)
    : view.getUint32(cursor, false);
  cursor += sectionLenFieldBytes;
  const layerInfoEnd = Math.min(layerSectionEnd, cursor + layerInfoLen);

  if (cursor + 2 > layerInfoEnd) {
    return {
      sourceFileName,
      sourceFormat: isPsb ? "psb" : "psd",
      sourceBytesLength: bytes.byteLength,
      canvasWidth,
      canvasHeight,
      bitDepth,
      colorMode,
      layers: [],
      warnings,
    };
  }

  const rawLayerCount = view.getInt16(cursor, false);
  cursor += 2;
  const layerCount = Math.min(Math.abs(rawLayerCount), maxLayers);
  if (Math.abs(rawLayerCount) > maxLayers) {
    warnings.push(`레이어 수(${Math.abs(rawLayerCount)})가 프리플라이트 상한(${maxLayers})을 초과해 일부만 검사했습니다.`);
  }

  const rawRecords: RawPsdLayerRecord[] = [];
  const channelEntrySize = isPsb ? 10 : 6;

  for (let index = 0; index < layerCount; index += 1) {
    // rect(16) + channelsCount(2)
    if (cursor + 18 > layerInfoEnd) {
      warnings.push(`레이어 #${index} 레코드 경계가 조기 종료되었습니다.`);
      break;
    }
    cursor += 16;
    const channelCount = view.getUint16(cursor, false);
    cursor += 2 + channelCount * channelEntrySize;

    // 8BIM(4) + blend(4) + opacity(1) + clipping(1) + flags(1) + filler(1) + extraLen(4)
    if (cursor + 16 > layerInfoEnd) {
      warnings.push(`레이어 #${index} 메타데이터 헤더가 잘렸습니다.`);
      break;
    }
    const blendSig = readFourCc(bytes, cursor);
    if (blendSig !== "8BIM") {
      warnings.push(`레이어 #${index} 블렌드 시그니처 불일치(${blendSig})`);
      break;
    }
    const blendRaw = readFourCc(bytes, cursor + 4);
    const opacityByte = bytes[cursor + 8] ?? 255;
    const clippingByte = bytes[cursor + 9] ?? 0;
    const flagsByte = bytes[cursor + 10] ?? 0;
    const extraLen = view.getUint32(cursor + 12, false);
    cursor += 16;

    const extraEnd = Math.min(layerInfoEnd, cursor + extraLen);
    let extraCursor = cursor;

    // Layer mask data
    let hasLayerMask = false;
    if (extraCursor + 4 <= extraEnd) {
      const maskLen = view.getUint32(extraCursor, false);
      hasLayerMask = maskLen > 0;
      extraCursor += 4 + maskLen;
    }

    // Layer blending ranges
    if (extraCursor + 4 <= extraEnd) {
      const rangesLen = view.getUint32(extraCursor, false);
      extraCursor += 4 + rangesLen;
    }

    // Pascal layer name (padded to multiple of 4 bytes)
    let pascalBytes: Uint8Array = new Uint8Array(0);
    if (extraCursor < extraEnd) {
      const nameLen = bytes[extraCursor] ?? 0;
      const nameStart = extraCursor + 1;
      const nameEnd = Math.min(extraEnd, nameStart + nameLen);
      pascalBytes = bytes.slice(nameStart, nameEnd);
      const paddedLen = Math.ceil((1 + nameLen) / 4) * 4;
      extraCursor += paddedLen;
    }

    // Additional Layer Information tagged blocks
    let unicodeName: string | null = null;
    let sectionDividerType: number | null = null;
    let sectionBlendMode: string | null = null;
    let hasVectorMask = false;
    let isText = false;
    let isSmartObject = false;
    let isShape = false;
    let adjustmentType: string | undefined;
    const effects: PsdPreflightParsedEffect[] = [];

    while (extraCursor + 12 <= extraEnd) {
      const tagSig = readFourCc(bytes, extraCursor);
      if (tagSig !== "8BIM" && tagSig !== "8B64") break;
      const key = readFourCc(bytes, extraCursor + 4);
      const use8Byte = isPsb && PSB_8BYTE_LENGTH_KEYS.has(key);
      const lenFieldSize = use8Byte ? 8 : 4;
      if (extraCursor + 8 + lenFieldSize > extraEnd) break;
      const blockLen = use8Byte
        ? readUint64Safe(view, extraCursor + 8)
        : view.getUint32(extraCursor + 8, false);
      const dataStart = extraCursor + 8 + lenFieldSize;
      const dataEnd = Math.min(extraEnd, dataStart + blockLen);

      if (key === "luni") {
        unicodeName = readUnicodeLuni(view, dataStart, dataEnd - dataStart);
      } else if ((key === "lsct" || key === "lsdk") && dataStart + 4 <= dataEnd) {
        sectionDividerType = view.getUint32(dataStart, false);
        if (dataStart + 12 <= dataEnd && readFourCc(bytes, dataStart + 4) === "8BIM") {
          const secBlendRaw = readFourCc(bytes, dataStart + 8);
          sectionBlendMode = PSD_BLEND_MODE_MAP[secBlendRaw] ?? secBlendRaw.trim();
        }
      } else if (key === "TySh" || key === "tySh") {
        isText = true;
      } else if (key === "SoLd" || key === "SoLE" || key === "PlLd") {
        isSmartObject = true;
      } else if (key === "vmsk" || key === "vsms") {
        hasVectorMask = true;
      } else if (key === "vscg" || key === "vstk" || key === "vogk") {
        isShape = true;
      } else if (key === "lmfx" || key === "lfx2" || key === "lrFX") {
        effects.push({
          type: "layer-effects-bundle",
          name: "Photoshop 레이어 스타일",
          isSmartFilter: false,
          enabled: true,
        });
      } else if (key === "fxrp" || key === "feid" || key === "FXid" || key === "FMsk") {
        effects.push({
          type: "smart-filter-custom",
          name: `스마트 필터 (${key})`,
          isSmartFilter: true,
          enabled: true,
        });
      } else if (Object.hasOwn(PSD_ADJUSTMENT_TAGS, key)) {
        adjustmentType = PSD_ADJUSTMENT_TAGS[key];
      }

      const paddedBlockLen = blockLen + (blockLen % 2);
      extraCursor = dataStart + paddedBlockLen;
      if (extraCursor <= dataStart && paddedBlockLen === 0) {
        extraCursor = dataStart;
      }
    }

    rawRecords.push({
      pascalBytes,
      unicodeName,
      blendMode: sectionBlendMode ?? PSD_BLEND_MODE_MAP[blendRaw] ?? blendRaw.trim(),
      opacity: Number((opacityByte / 255).toFixed(4)),
      visible: (flagsByte & 0x02) === 0,
      clipToBelow: clippingByte === 1,
      hasLayerMask,
      hasVectorMask,
      sectionDividerType,
      sectionBlendMode,
      isText,
      isSmartObject,
      isShape,
      adjustmentType,
      effects,
    });

    cursor = extraEnd;
  }

  // PSD 레코드는 아래→위 순서이므로 역순(위→아래)으로 순회해 폴더 트리를 복원한다.
  const folderStack: string[] = [];
  const layers: PsdPreflightParsedLayer[] = [];

  for (let reverseIndex = rawRecords.length - 1; reverseIndex >= 0; reverseIndex -= 1) {
    const record = rawRecords[reverseIndex]!;
    if (record.sectionDividerType === 3) {
      folderStack.pop();
      continue;
    }

    const decodedName = decodePsdPascalLayerName(
      record.pascalBytes,
      record.unicodeName,
      options,
    );
    const layerId = `psd-layer-${layers.length + 1}`;
    const parentId = folderStack.length > 0 ? folderStack[folderStack.length - 1]! : null;
    const depth = folderStack.length;

    const isFolder = record.sectionDividerType === 1 || record.sectionDividerType === 2;
    const kind: PsdPreflightParsedLayer["kind"] = isFolder
      ? "folder"
      : record.isSmartObject
        ? "smart-object"
        : record.isText
          ? "text"
          : record.adjustmentType !== undefined
            ? "adjustment"
            : record.isShape
              ? "shape"
              : "raster";

    const hasUnicodeName =
      record.unicodeName !== null
      && record.unicodeName.length > 0
      && !record.unicodeName.includes("\ufffd");

    layers.push({
      id: layerId,
      name: decodedName.text || `Layer ${layers.length + 1}`,
      rawNameBytes: hasUnicodeName ? undefined : record.pascalBytes,
      hasUnicodeName,
      parentId,
      depth,
      kind,
      blendMode: record.blendMode,
      opacity: record.opacity,
      visible: record.visible,
      clipToBelow: record.clipToBelow,
      hasLayerMask: record.hasLayerMask,
      hasVectorMask: record.hasVectorMask,
      adjustmentType: record.adjustmentType,
      effects: record.effects,
    });

    if (isFolder) {
      folderStack.push(layerId);
    }
  }

  return {
    sourceFileName,
    sourceFormat: isPsb ? "psb" : "psd",
    sourceBytesLength: bytes.byteLength,
    canvasWidth,
    canvasHeight,
    bitDepth,
    colorMode,
    layers,
    warnings,
  };
}
