/**
 * Photoshop ABR v6/v7/v9/v10 (`8BIM` container) binary parser.
 *
 * Parses `samp` sampled brush tip bitmaps (8-bit raw/PackBits RLE & 16-bit raw
 * downconverted to R8, with high-resolution R8 MIP pyramid generation up to 1024px)
 * and `desc` Action Descriptor (`Objc`) presets covering Photopea/Photoshop parity:
 * `dualBrush`, `useTexture`, `useColorDynamics`, `Wtdg` (wetEdges),
 * `usePaintDynamics` (Transfer), `useScatter`, `useBrushPose`, and `toolOptions`.
 */

import { stripTrailingNuls, utf16UnitsToString } from "./nul-text";
import { buildR8TipPyramid, type R8TipPyramid } from "./png-alpha-decode";

export const ABR_V6_LIMITS = Object.freeze({
  maxSamples: 512,
  maxBrushes: 256,
  maxSampleEdge: 4096,
  maxSamplePixels: 16 * 1024 * 1024,
  maxTipMipSize: 1024,
  maxDescriptorDepth: 32,
  maxDescriptorItems: 4096,
});

export interface AbrV6SampledTip {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 8 | 16;
  readonly alpha: Uint8Array;
  readonly pyramid: R8TipPyramid;
}

export interface AbrV6DynamicsSpec {
  readonly control: string;
  readonly jitter: number;
  readonly minimum: number;
  readonly steps: number;
}

export interface AbrV6DescriptorBrush {
  readonly kind: "v6-descriptor";
  readonly name: string;
  readonly shapeType: "computed" | "sampled" | "dynamic" | "tips";
  readonly diameterPx: number;
  readonly hardness: number;
  readonly roundness: number;
  readonly angleDeg: number;
  readonly spacingPct: number;
  readonly sampledDataId: string | null;
  readonly wetEdges: boolean;
  readonly noise: boolean;
  readonly sizeDynamics?: AbrV6DynamicsSpec;
  readonly angleDynamics?: AbrV6DynamicsSpec;
  readonly roundnessDynamics?: AbrV6DynamicsSpec;
  readonly opacityDynamics?: AbrV6DynamicsSpec;
  readonly flowDynamics?: AbrV6DynamicsSpec;
  readonly wetnessDynamics?: AbrV6DynamicsSpec;
  readonly mixDynamics?: AbrV6DynamicsSpec;
  readonly scatter?: {
    readonly scatterDynamics?: AbrV6DynamicsSpec;
    readonly countDynamics?: AbrV6DynamicsSpec;
    readonly count: number;
    readonly bothAxes: boolean;
  };
  readonly texture?: {
    readonly id: string;
    readonly name: string;
    readonly depth: number;
    readonly depthMinimum: number;
    readonly scale: number;
    readonly brightness: number;
    readonly contrast: number;
    readonly invert: boolean;
    readonly blendMode: string;
    readonly textureEachTip: boolean;
    readonly depthDynamics?: AbrV6DynamicsSpec;
  };
  readonly dualBrush?: {
    readonly enabled: boolean;
    readonly flip: boolean;
    readonly blendMode: string;
    readonly diameterPx: number;
    readonly hardness: number;
    readonly roundness: number;
    readonly spacingPct: number;
    readonly sampledDataId: string | null;
    readonly useScatter: boolean;
    readonly count: number;
  };
  readonly colorDynamics?: {
    readonly foregroundBackground?: AbrV6DynamicsSpec;
    readonly hue: number;
    readonly saturation: number;
    readonly brightness: number;
    readonly purity: number;
    readonly perTip: boolean;
  };
  readonly brushPose?: {
    readonly overrideAngle: boolean;
    readonly overrideTiltX: boolean;
    readonly overrideTiltY: boolean;
    readonly overridePressure: boolean;
    readonly pressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly angle: number;
  };
  readonly toolOptions?: {
    readonly type: string;
    readonly opacity: number;
    readonly flow: number;
    readonly smooth: number;
    readonly smoothingValue: number;
    readonly wetness?: number;
    readonly mix?: number;
  };
}

export interface AbrV6ContainerResult {
  readonly version: number;
  readonly subversion: number;
  readonly samples: readonly AbrV6SampledTip[];
  readonly brushes: readonly AbrV6DescriptorBrush[];
  readonly sectionKeys: readonly string[];
  readonly warnings: readonly string[];
}

export type AbrV6ErrorCode = "truncated" | "unsupported-version" | "corrupt";

const DYNAMICS_CONTROLS = [
  "off",
  "fade",
  "pen pressure",
  "pen tilt",
  "stylus wheel",
  "initial direction",
  "direction",
  "initial rotation",
  "rotation",
] as const;

const BLEND_MODE_MAP: Readonly<Record<string, string>> = Object.freeze({
  Nrml: "normal",
  Mltp: "multiply",
  Scrn: "screen",
  Ovrl: "overlay",
  Drkn: "darken",
  Lghn: "lighten",
  CDdg: "color dodge",
  CBrn: "color burn",
  LnrB: "linear burn",
  Sbtr: "subtract",
  HrdM: "hard mix",
  linearHeight: "linear height",
  height: "height",
});

const ASCII_DECODER = new TextDecoder("latin1");

class Cursor {
  offset: number;
  readonly view: DataView;

  constructor(
    readonly bytes: Uint8Array,
    start: number,
    readonly end: number,
    private readonly fail: (message: string, code: AbrV6ErrorCode) => never,
  ) {
    this.offset = start;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  need(count: number): number {
    if (count < 0 || this.offset + count > this.end) {
      this.fail(`ABR v6 data truncated at offset ${this.offset} (needed ${count}B)`, "truncated");
    }
    const at = this.offset;
    this.offset += count;
    return at;
  }

  u8(): number { return this.view.getUint8(this.need(1)); }
  i8(): number { return this.view.getInt8(this.need(1)); }
  u16(): number { return this.view.getUint16(this.need(2), false); }
  i16(): number { return this.view.getInt16(this.need(2), false); }
  u32(): number { return this.view.getUint32(this.need(4), false); }
  i32(): number { return this.view.getInt32(this.need(4), false); }
  f64(): number { return this.view.getFloat64(this.need(8), false); }
  ascii(count: number): string {
    const at = this.need(count);
    return ASCII_DECODER.decode(this.bytes.subarray(at, at + count));
  }
  pascalString(): string {
    const len = this.u8();
    return this.ascii(len);
  }
  unicodeString(): string {
    const len = this.u32();
    if (len > 1_000_000) this.fail(`ABR descriptor string too long (${len})`, "corrupt");
    const units: number[] = [];
    for (let i = 0; i < len; i += 1) units.push(this.u16());
    return stripTrailingNuls(utf16UnitsToString(units));
  }
  psdKey(): string {
    const len = this.u32();
    return this.ascii(len === 0 ? 4 : len);
  }
  skip(count: number): void { this.need(count); }
}

function decodePackBitsRow(
  cursor: Cursor,
  packedLength: number,
  width: number,
  fail: (message: string, code: AbrV6ErrorCode) => never,
): Uint8Array {
  const row = new Uint8Array(width);
  let produced = 0;
  let consumed = 0;
  while (consumed < packedLength) {
    const header = cursor.i8();
    consumed += 1;
    if (header === -128) continue;
    if (header < 0) {
      const count = 1 - header;
      if (consumed >= packedLength || produced + count > width) {
        fail("ABR v6 RLE repeat run overflows scanline", "corrupt");
      }
      row.fill(cursor.u8(), produced, produced + count);
      consumed += 1;
      produced += count;
    } else {
      const count = header + 1;
      if (consumed + count > packedLength || produced + count > width) {
        fail("ABR v6 RLE literal run overflows scanline", "corrupt");
      }
      for (let i = 0; i < count; i += 1) row[produced++] = cursor.u8();
      consumed += count;
    }
  }
  if (produced !== width) {
    fail(`ABR v6 RLE scanline produced ${produced}B, expected ${width}B`, "corrupt");
  }
  return row;
}

type DescValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | { readonly unit: string; readonly value: number }
  | { readonly enumType: string; readonly value: string }
  | DescValue[]
  | { readonly [key: string]: DescValue };

function readDescriptorObject(
  cursor: Cursor,
  depth: number,
  fail: (message: string, code: AbrV6ErrorCode) => never,
): Record<string, DescValue> {
  if (depth > ABR_V6_LIMITS.maxDescriptorDepth) {
    fail("ABR descriptor exceeds max nesting depth", "corrupt");
  }
  cursor.unicodeString(); // className
  const classId = cursor.psdKey();
  const count = cursor.u32();
  if (count > ABR_V6_LIMITS.maxDescriptorItems) {
    fail(`ABR descriptor item count ${count} exceeds limit`, "corrupt");
  }
  const obj: Record<string, DescValue> = { _classID: classId };
  for (let i = 0; i < count; i += 1) {
    const key = cursor.psdKey();
    const value = readDescriptorItem(cursor, depth + 1, fail);
    if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      obj[key] = value;
    }
  }
  return obj;
}

function readDescriptorItem(
  cursor: Cursor,
  depth: number,
  fail: (message: string, code: AbrV6ErrorCode) => never,
): DescValue {
  const osType = cursor.ascii(4);
  switch (osType) {
    case "Objc":
    case "GlbO":
      return readDescriptorObject(cursor, depth, fail);
    case "VlLs": {
      const len = cursor.u32();
      if (len > ABR_V6_LIMITS.maxDescriptorItems) {
        fail(`ABR descriptor list length ${len} exceeds limit`, "corrupt");
      }
      const list: DescValue[] = [];
      for (let i = 0; i < len; i += 1) list.push(readDescriptorItem(cursor, depth + 1, fail));
      return list;
    }
    case "doub":
      return cursor.f64();
    case "UntF": {
      const unit = cursor.ascii(4);
      const value = cursor.f64();
      return { unit, value };
    }
    case "TEXT":
      return cursor.unicodeString();
    case "enum": {
      const enumType = cursor.psdKey();
      const value = cursor.psdKey();
      return { enumType, value };
    }
    case "long":
      return cursor.i32();
    case "comp": {
      const hi = cursor.i32();
      const lo = cursor.u32();
      return hi * 4294967296 + lo;
    }
    case "bool":
      return cursor.u8() !== 0;
    case "tdta": {
      const len = cursor.u32();
      const start = cursor.need(len);
      return cursor.bytes.slice(start, start + len);
    }
    case "type":
    case "GlbC": {
      cursor.unicodeString();
      return cursor.psdKey();
    }
    default:
      fail(`unsupported ABR descriptor OSType "${osType}"`, "corrupt");
  }
}

function asObj(value: DescValue | undefined): Record<string, DescValue> | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !("unit" in value) &&
    !("enumType" in value)
  ) {
    return value as Record<string, DescValue>;
  }
  return null;
}

function numVal(value: DescValue | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null && "value" in value && typeof value.value === "number") {
    return Number.isFinite(value.value) ? value.value : fallback;
  }
  return fallback;
}

function pctVal(value: DescValue | undefined, fallback = 0): number {
  if (typeof value === "object" && value !== null && "unit" in value && typeof value.value === "number") {
    return value.unit === "#Prc" ? value.value / 100 : value.value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1 ? value / 100 : value;
  }
  return fallback;
}

function strVal(value: DescValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function enumVal(value: DescValue | undefined, fallback = "normal"): string {
  if (typeof value === "object" && value !== null && "enumType" in value && typeof value.value === "string") {
    return BLEND_MODE_MAP[value.value] ?? value.value;
  }
  if (typeof value === "string") return BLEND_MODE_MAP[value] ?? value;
  return fallback;
}

function parseDynamicsDesc(raw: DescValue | undefined): AbrV6DynamicsSpec | undefined {
  const obj = asObj(raw);
  if (!obj) return undefined;
  const controlIdx = Math.trunc(numVal(obj.bVTy, 0));
  const control = DYNAMICS_CONTROLS[controlIdx] ?? "off";
  return {
    control,
    jitter: Math.min(1, Math.max(0, pctVal(obj.jitter, 0))),
    minimum: Math.min(1, Math.max(0, pctVal(obj["Mnm "], 0))),
    steps: Math.max(0, Math.trunc(numVal(obj.fStp, 0))),
  };
}

function parseBrushDescEntry(entry: Record<string, DescValue>, index: number): AbrV6DescriptorBrush {
  const name = strVal(entry["Nm  "]).trim() || `ABR v6 Brush ${index + 1}`;
  const shapeObj = asObj(entry.Brsh) ?? {};
  const classId = strVal(shapeObj._classID, "computedBrush");
  const shapeType: AbrV6DescriptorBrush["shapeType"] =
    classId === "sampledBrush"
      ? "sampled"
      : classId === "dBrush"
        ? "dynamic"
        : classId === "dTips"
          ? "tips"
          : "computed";
  const diameterPx = Math.max(1, numVal(shapeObj.Dmtr, 20));
  const hardness = Math.min(1, Math.max(0, pctVal(shapeObj.Hrdn, shapeType === "sampled" ? 1 : 0.8)));
  const roundness = Math.min(1, Math.max(0.01, pctVal(shapeObj.Rndn, 1)));
  const angleDeg = numVal(shapeObj.Angl, 0);
  const spacingRatio = pctVal(shapeObj.Spcn ?? entry.Spcn, 0.25);
  const spacingPct = Math.max(1, Math.round(spacingRatio * 1000) / 10);
  const sampledDataId = shapeType === "sampled" ? strVal(shapeObj.sampledData) || null : null;

  const useTipDynamics = entry.useTipDynamics === true;
  const useScatter = entry.useScatter === true;
  const useTexture = entry.useTexture === true && asObj(entry.Txtr) !== null;
  const dualObj = asObj(entry.dualBrush);
  const useDual = dualObj !== null && dualObj.useDualBrush === true;
  const useColor = entry.useColorDynamics === true;
  const useTransfer = entry.usePaintDynamics === true;
  const usePose = entry.useBrushPose === true;
  const toolObj = asObj(entry.toolOptions);

  const txtrObj = useTexture ? asObj(entry.Txtr)! : null;
  const dualShapeObj = useDual ? asObj(dualObj.Brsh) ?? {} : null;

  return {
    kind: "v6-descriptor",
    name,
    shapeType,
    diameterPx,
    hardness,
    roundness,
    angleDeg,
    spacingPct,
    sampledDataId,
    wetEdges: entry.Wtdg === true,
    noise: entry.Nose === true,
    ...(useTipDynamics
      ? {
          sizeDynamics: parseDynamicsDesc(entry.szVr),
          angleDynamics: parseDynamicsDesc(entry.angleDynamics),
          roundnessDynamics: parseDynamicsDesc(entry.roundnessDynamics),
        }
      : {}),
    ...(useTransfer
      ? {
          opacityDynamics: parseDynamicsDesc(entry.opVr),
          flowDynamics: parseDynamicsDesc(entry.prVr),
          wetnessDynamics: parseDynamicsDesc(entry.wtVr),
          mixDynamics: parseDynamicsDesc(entry.mxVr),
        }
      : {}),
    ...(useScatter
      ? {
          scatter: {
            scatterDynamics: parseDynamicsDesc(entry.scatterDynamics),
            countDynamics: parseDynamicsDesc(entry.countDynamics),
            count: Math.max(1, Math.round(numVal(entry["Cnt "], 1))),
            bothAxes: entry.bothAxes === true,
          },
        }
      : {}),
    ...(useTexture && txtrObj
      ? {
          texture: {
            id: strVal(txtrObj.Idnt),
            name: strVal(txtrObj["Nm  "]),
            depth: Math.min(1, Math.max(0, pctVal(entry.textureDepth, 1))),
            depthMinimum: Math.min(1, Math.max(0, pctVal(entry.minimumDepth, 0))),
            scale: Math.max(0.01, pctVal(entry.textureScale, 1)),
            brightness: numVal(entry.textureBrightness, 0),
            contrast: numVal(entry.textureContrast, 0),
            invert: entry.InvT === true,
            blendMode: enumVal(entry.textureBlendMode, "multiply"),
            textureEachTip: entry.TxtC === true,
            depthDynamics: parseDynamicsDesc(entry.textureDepthDynamics),
          },
        }
      : {}),
    ...(useDual && dualShapeObj
      ? {
          dualBrush: {
            enabled: true,
            flip: dualObj.Flip === true,
            blendMode: enumVal(dualObj.BlnM, "multiply"),
            diameterPx: Math.max(1, numVal(dualShapeObj.Dmtr, diameterPx)),
            hardness: Math.min(1, Math.max(0, pctVal(dualShapeObj.Hrdn, 0.8))),
            roundness: Math.min(1, Math.max(0.01, pctVal(dualShapeObj.Rndn, 1))),
            spacingPct: Math.max(1, Math.round(pctVal(dualObj.Spcn, 0.25) * 1000) / 10),
            sampledDataId: strVal(dualShapeObj.sampledData) || null,
            useScatter: dualObj.useScatter === true,
            count: Math.max(1, Math.round(numVal(dualObj["Cnt "], 1))),
          },
        }
      : {}),
    ...(useColor
      ? {
          colorDynamics: {
            foregroundBackground: parseDynamicsDesc(entry.clVr),
            hue: Math.min(1, Math.max(0, pctVal(entry["H   "], 0))),
            saturation: Math.min(1, Math.max(0, pctVal(entry.Strt, 0))),
            brightness: Math.min(1, Math.max(0, pctVal(entry.Brgh, 0))),
            purity: Math.min(1, Math.max(-1, pctVal(entry.purity, 0))),
            perTip: entry.colorDynamicsPerTip !== false,
          },
        }
      : {}),
    ...(usePose
      ? {
          brushPose: {
            overrideAngle: entry.overridePoseAngle === true,
            overrideTiltX: entry.overridePoseTiltX === true,
            overrideTiltY: entry.overridePoseTiltY === true,
            overridePressure: entry.overridePosePressure === true,
            pressure: Math.min(1, Math.max(0, pctVal(entry.brushPosePressure, 1))),
            tiltX: numVal(entry.brushPoseTiltX, 0),
            tiltY: numVal(entry.brushPoseTiltY, 0),
            angle: numVal(entry.brushPoseAngle, 0),
          },
        }
      : {}),
    ...(toolObj
      ? {
          toolOptions: {
            type: strVal(toolObj._classID, "brush"),
            opacity: Math.min(1, Math.max(0, pctVal(toolObj.Opct, 1))),
            flow: Math.min(1, Math.max(0, pctVal(toolObj.flow, 1))),
            smooth: numVal(toolObj.Smoo, 0),
            smoothingValue: numVal(toolObj.smoothingValue, 0),
            ...(toolObj.wetness !== undefined ? { wetness: pctVal(toolObj.wetness, 0) } : {}),
            ...(toolObj.mix !== undefined ? { mix: pctVal(toolObj.mix, 0) } : {}),
          },
        }
      : {}),
  };
}

/** Parses an ABR v6/7/9/10 `8BIM` container into decoded sampled tips and descriptor brushes. */
export function parseAbrV6Container(
  bytes: Uint8Array,
  fail: (message: string, code: AbrV6ErrorCode) => never,
): AbrV6ContainerResult {
  const cursor = new Cursor(bytes, 0, bytes.byteLength, fail);
  const version = cursor.u16();
  const subversion = cursor.u16();
  if (![6, 7, 9, 10].includes(version)) {
    fail(`unsupported ABR version ${version}`, "unsupported-version");
  }
  if (subversion !== 1 && subversion !== 2) {
    fail(`unsupported ABR v${version} subversion ${subversion}`, "unsupported-version");
  }
  if (bytes.byteLength < 16) {
    fail(`ABR version ${version}.${subversion} contains no 8BIM sections`, "unsupported-version");
  }

  const samples: AbrV6SampledTip[] = [];
  const brushes: AbrV6DescriptorBrush[] = [];
  const sectionKeys: string[] = [];
  const warnings: string[] = [];

  while (cursor.offset < bytes.byteLength) {
    if (cursor.offset + 12 > bytes.byteLength) {
      fail(`ABR v${version} 8BIM header truncated at offset ${cursor.offset}`, "truncated");
    }
    const sig = cursor.ascii(4);
    if (sig !== "8BIM") {
      fail(`expected 8BIM signature at offset ${cursor.offset - 4}, got "${sig}"`, "corrupt");
    }
    const key = cursor.ascii(4);
    const size = cursor.u32();
    const sectionEnd = cursor.offset + size;
    if (sectionEnd > bytes.byteLength) {
      fail(`ABR v${version} section "${key}" length ${size} exceeds file size`, "truncated");
    }
    sectionKeys.push(key);

    if (key === "samp") {
      const sampCursor = new Cursor(bytes, cursor.offset, sectionEnd, fail);
      while (sampCursor.offset < sectionEnd) {
        if (samples.length >= ABR_V6_LIMITS.maxSamples) {
          fail("ABR v6 sample count exceeds safety limit", "corrupt");
        }
        const rawLen = sampCursor.u32();
        const paddedLen = (rawLen + 3) & ~3;
        const recordEnd = sampCursor.offset + paddedLen;
        if (recordEnd > sectionEnd) {
          fail("ABR v6 sample record exceeds samp section", "truncated");
        }
        const rec = new Cursor(bytes, sampCursor.offset, recordEnd, fail);
        const id = rec.pascalString();
        rec.skip(subversion === 1 ? 10 : 264);
        const top = rec.i32();
        const left = rec.i32();
        const bottom = rec.i32();
        const right = rec.i32();
        const width = right - left;
        const height = bottom - top;
        if (
          width < 1 ||
          height < 1 ||
          width > ABR_V6_LIMITS.maxSampleEdge ||
          height > ABR_V6_LIMITS.maxSampleEdge ||
          width * height > ABR_V6_LIMITS.maxSamplePixels
        ) {
          fail(`ABR v6 sample "${id}" has invalid bounds ${width}x${height}`, "corrupt");
        }
        const depth = rec.u16();
        const compression = rec.u8();
        if (depth !== 8 && depth !== 16) {
          fail(`ABR v6 sample "${id}" has unsupported depth ${depth}`, "corrupt");
        }
        const alpha = new Uint8Array(width * height);
        if (depth === 8) {
          if (compression === 0) {
            const start = rec.need(alpha.byteLength);
            alpha.set(bytes.subarray(start, start + alpha.byteLength));
          } else if (compression === 1) {
            const lengths: number[] = [];
            for (let y = 0; y < height; y += 1) lengths.push(rec.u16());
            for (let y = 0; y < height; y += 1) {
              alpha.set(decodePackBitsRow(rec, lengths[y] ?? 0, width, fail), y * width);
            }
          } else {
            fail(`ABR v6 sample "${id}" has unsupported compression ${compression}`, "corrupt");
          }
        } else {
          if (compression === 0) {
            for (let i = 0; i < alpha.byteLength; i += 1) alpha[i] = rec.u16() >> 8;
          } else if (compression === 1) {
            const lengths: number[] = [];
            for (let y = 0; y < height; y += 1) lengths.push(rec.u16());
            for (let y = 0; y < height; y += 1) {
              const row16 = decodePackBitsRow(rec, lengths[y] ?? 0, width * 2, fail);
              for (let x = 0; x < width; x += 1) alpha[y * width + x] = row16[x * 2] ?? 0;
            }
          } else {
            fail(`ABR v6 sample "${id}" has unsupported 16-bit compression ${compression}`, "corrupt");
          }
        }
        const pyramid = buildR8TipPyramid(alpha, width, height, {
          minSize: 8,
          maxSize: ABR_V6_LIMITS.maxTipMipSize,
          documentMaxSize: 64,
        });
        samples.push({ id, width, height, bitDepth: depth, alpha, pyramid });
        sampCursor.offset = recordEnd;
      }
    } else if (key === "desc") {
      const descCursor = new Cursor(bytes, cursor.offset, sectionEnd, fail);
      descCursor.u32(); // descriptor version (usually 16)
      const rootDesc = readDescriptorObject(descCursor, 0, fail);
      const brushList = rootDesc.Brsh;
      if (Array.isArray(brushList)) {
        for (let i = 0; i < brushList.length && brushes.length < ABR_V6_LIMITS.maxBrushes; i += 1) {
          const entry = asObj(brushList[i]);
          if (entry) brushes.push(parseBrushDescEntry(entry, i));
        }
      }
    } else if (key === "patt" || key === "phry") {
      warnings.push(`ABR v${version} section "${key}" (${size}B) retained as inventory`);
    } else {
      warnings.push(`ABR v${version} unknown section "${key}" (${size}B) skipped`);
    }

    cursor.offset = sectionEnd;
    const pad = size % 4;
    if (pad !== 0 && cursor.offset + (4 - pad) <= bytes.byteLength) {
      cursor.offset += 4 - pad;
    }
  }

  return { version, subversion, samples, brushes, sectionKeys, warnings };
}
