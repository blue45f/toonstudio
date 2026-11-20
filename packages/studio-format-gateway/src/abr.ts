// ABR v1/v2 + v6/7/9/10 8BIM gate; full v6+ decode loads lazily via importAbrV6.

import { stripTrailingNuls, utf16UnitsToString } from "./nul-text";

import type { AbrV6DescriptorBrush, AbrV6ErrorCode, AbrV6SampledTip } from "./abr-v6";

export interface AbrComputedBrush {
  kind: "computed";
  name: string;
  diameterPx: number;
  roundness: number;
  angleDeg: number;
  spacingPct: number;
}

export interface AbrUnknownBrush {
  kind: "unknown";
  typeCode: number;
  byteLength: number;
}

export type AbrBrush = AbrComputedBrush | AbrV6DescriptorBrush | AbrUnknownBrush;

export interface AbrImportResult {
  version: number;
  subversion?: number;
  brushes: AbrBrush[];
  samples?: readonly AbrV6SampledTip[];
  sectionKeys?: readonly string[];
  warnings: string[];
}

export class AbrParseError extends Error {
  constructor(message: string, readonly code: AbrV6ErrorCode) {
    super(message);
    this.name = "AbrParseError";
  }
}

const V6_VERSIONS = new Set([6, 7, 9, 10]);

function tag4(bytes: Uint8Array, o: number): string {
  return String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
}

function scanV6Sections(bytes: Uint8Array, view: DataView, version: number): AbrImportResult {
  const subversion = view.getUint16(2, false);
  if (subversion !== 1 && subversion !== 2) {
    throw new AbrParseError(`unsupported ABR v${version}.${subversion}`, "unsupported-version");
  }
  const sectionKeys: string[] = [];
  let o = 4;
  while (o < bytes.byteLength) {
    if (o + 12 > bytes.byteLength) throw new AbrParseError(`ABR v${version} header truncated`, "truncated");
    if (tag4(bytes, o) !== "8BIM") throw new AbrParseError(`expected 8BIM at ${o}`, "corrupt");
    const key = tag4(bytes, o + 4);
    const size = view.getUint32(o + 8, false);
    o += 12;
    if (o + size > bytes.byteLength) throw new AbrParseError(`ABR v${version} ${key} truncated`, "truncated");
    sectionKeys.push(key);
    o += size;
    const pad = size & 3;
    if (pad !== 0 && o + (4 - pad) <= bytes.byteLength) o += 4 - pad;
  }
  return { version, subversion, brushes: [], sectionKeys, warnings: [] };
}

export async function importAbrV6(bytes: Uint8Array): Promise<AbrImportResult> {
  const { parseAbrV6Container } = await import("./abr-v6");
  const parsed = parseAbrV6Container(bytes, (msg, code) => {
    throw new AbrParseError(msg, code);
  });
  return { ...parsed, brushes: [...parsed.brushes], warnings: [...parsed.warnings] };
}

export function importAbr(bytes: Uint8Array): AbrImportResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 4) throw new AbrParseError("short ABR header", "truncated");
  const version = view.getUint16(0, false);
  if (version >= 6) {
    if (!V6_VERSIONS.has(version) || bytes.byteLength === 4) {
      throw new AbrParseError(`ABR v${version} requires 8BIM container`, "unsupported-version");
    }
    return scanV6Sections(bytes, view, version);
  }
  if (version !== 1 && version !== 2) throw new AbrParseError(`bad ABR v${version}`, "corrupt");
  const count = view.getUint16(2, false);
  const brushes: AbrBrush[] = [];
  const warnings: string[] = [];
  let o = 4;
  for (let i = 0; i < count; i += 1) {
    if (o + 6 > bytes.byteLength) throw new AbrParseError(`brush ${i}: truncated header`, "truncated");
    const typeCode = view.getUint16(o, false);
    const size = view.getUint32(o + 2, false);
    o += 6;
    if (o + size > bytes.byteLength) throw new AbrParseError(`brush ${i}: truncated body`, "truncated");
    if (typeCode === 1) {
      let c = o + 4;
      const spacingPct = view.getUint16(c, false);
      c += 2;
      let name = `computed-${i}`;
      if (version === 2) {
        const len = view.getUint32(c, false);
        c += 4;
        const units: number[] = [];
        for (let u = 0; u < len; u += 1) { units.push(view.getUint16(c, false)); c += 2; }
        name = stripTrailingNuls(utf16UnitsToString(units)) || name;
      }
      brushes.push({
        kind: "computed",
        name,
        angleDeg: view.getInt16(c, false),
        roundness: view.getInt16(c + 2, false),
        diameterPx: view.getUint16(c + 4, false),
        spacingPct,
      });
    } else {
      brushes.push({ kind: "unknown", typeCode, byteLength: size });
      warnings.push(`brush ${i}: type ${typeCode} retained as raw payload`);
    }
    o += size;
  }
  return { version, brushes, warnings };
}
