/**
 * Dependency-free Apple Property List (`bplist00` binary & XML plist) and
 * `NSKeyedArchiver` object-graph decoder.
 *
 * Used by the Procreate `.brushset` importer to decode `brushset.plist` and
 * per-brush `Brush.archive` files with strict cycle, object-count, and depth bounds.
 */

import { parseSafeXml, type SafeXmlElement } from "./format-common";

export type PlistValue =
  | null
  | boolean
  | number
  | string
  | Date
  | Uint8Array
  | PlistUid
  | PlistValue[]
  | { [key: string]: PlistValue };

export interface PlistUid {
  readonly $uid: number;
}

export function isPlistUid(value: unknown): value is PlistUid {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof Date) &&
    typeof (value as { $uid?: unknown }).$uid === "number"
  );
}

export class PlistParseError extends Error {
  constructor(
    message: string,
    readonly code: "invalid-format" | "truncated" | "limit-exceeded" | "corrupt",
  ) {
    super(message);
    this.name = "PlistParseError";
  }
}

export const PLIST_LIMITS = Object.freeze({
  maxObjects: 65_536,
  maxDepth: 64,
  maxBytes: 32 * 1024 * 1024,
});

const BPLIST_MAGIC = "bplist00";
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1, 0, 0, 0);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const LATIN1_DECODER = new TextDecoder("latin1");

export function isBinaryPlist(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  for (let i = 0; i < BPLIST_MAGIC.length; i += 1) {
    if (bytes[i] !== BPLIST_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function readBigEndianUint(bytes: Uint8Array, offset: number, length: number): number {
  if (offset < 0 || offset + length > bytes.byteLength) {
    throw new PlistParseError("binary plist integer out of bounds", "truncated");
  }
  let value = 0;
  for (let i = 0; i < length; i += 1) {
    value = value * 256 + (bytes[offset + i] ?? 0);
  }
  return value;
}

function readBigEndianInt(bytes: Uint8Array, offset: number, length: number): number {
  if (length === 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const big = view.getBigInt64(0, false);
    return Number(big);
  }
  return readBigEndianUint(bytes, offset, length);
}

function decodeUtf16Be(bytes: Uint8Array, offset: number, charCount: number): string {
  const byteLength = charCount * 2;
  if (offset + byteLength > bytes.byteLength) {
    throw new PlistParseError("binary plist UTF-16 string truncated", "truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, byteLength);
  let out = "";
  const chunk = 4096;
  for (let i = 0; i < charCount; i += chunk) {
    const end = Math.min(charCount, i + chunk);
    const units: number[] = [];
    for (let u = i; u < end; u += 1) {
      units.push(view.getUint16(u * 2, false));
    }
    out += String.fromCharCode(...units);
  }
  return out;
}

/** Parses an Apple `bplist00` binary property list. */
export function parseBinaryPlist(bytes: Uint8Array): PlistValue {
  if (bytes.byteLength > PLIST_LIMITS.maxBytes) {
    throw new PlistParseError("binary plist exceeds safety limit", "limit-exceeded");
  }
  if (bytes.byteLength < 40 || !isBinaryPlist(bytes)) {
    throw new PlistParseError("invalid bplist00 header or trailer", "invalid-format");
  }
  const trailerOffset = bytes.byteLength - 32;
  const offsetIntSize = bytes[trailerOffset + 6] ?? 0;
  const objectRefSize = bytes[trailerOffset + 7] ?? 0;
  if (![1, 2, 4, 8].includes(offsetIntSize) || ![1, 2, 4, 8].includes(objectRefSize)) {
    throw new PlistParseError("invalid bplist00 integer size in trailer", "corrupt");
  }
  const numObjects = readBigEndianUint(bytes, trailerOffset + 8, 8);
  const topObject = readBigEndianUint(bytes, trailerOffset + 16, 8);
  const offsetTableOffset = readBigEndianUint(bytes, trailerOffset + 24, 8);

  if (numObjects < 1 || numObjects > PLIST_LIMITS.maxObjects) {
    throw new PlistParseError(`bplist00 object count ${numObjects} out of range`, "limit-exceeded");
  }
  if (topObject >= numObjects) {
    throw new PlistParseError("bplist00 topObject index out of range", "corrupt");
  }
  const offsetTableEnd = offsetTableOffset + numObjects * offsetIntSize;
  if (offsetTableOffset < 8 || offsetTableEnd > trailerOffset) {
    throw new PlistParseError("bplist00 offset table out of bounds", "corrupt");
  }

  const offsets = new Uint32Array(numObjects);
  for (let i = 0; i < numObjects; i += 1) {
    const off = readBigEndianUint(bytes, offsetTableOffset + i * offsetIntSize, offsetIntSize);
    if (off < 8 || off >= offsetTableOffset) {
      throw new PlistParseError(`bplist00 object ${i} offset out of bounds`, "corrupt");
    }
    offsets[i] = off;
  }

  const cache = new Map<number, PlistValue>();
  const visiting = new Set<number>();

  function readLength(lowNibble: number, pos: number): { length: number; nextPos: number } {
    if (lowNibble !== 0x0f) return { length: lowNibble, nextPos: pos };
    if (pos >= offsetTableOffset) {
      throw new PlistParseError("bplist00 extended length truncated", "truncated");
    }
    const intMarker = bytes[pos] ?? 0;
    if ((intMarker & 0xf0) !== 0x10) {
      throw new PlistParseError("bplist00 extended length is not an integer", "corrupt");
    }
    const intBytes = 1 << (intMarker & 0x0f);
    if (intBytes > 8 || pos + 1 + intBytes > offsetTableOffset) {
      throw new PlistParseError("bplist00 extended length integer invalid", "corrupt");
    }
    return {
      length: readBigEndianUint(bytes, pos + 1, intBytes),
      nextPos: pos + 1 + intBytes,
    };
  }

  function decodeObject(objIndex: number, depth: number): PlistValue {
    if (depth > PLIST_LIMITS.maxDepth) {
      throw new PlistParseError("bplist00 exceeds max nesting depth", "limit-exceeded");
    }
    if (objIndex < 0 || objIndex >= numObjects) {
      throw new PlistParseError(`bplist00 object reference ${objIndex} out of range`, "corrupt");
    }
    if (cache.has(objIndex)) return cache.get(objIndex)!;
    if (visiting.has(objIndex)) {
      throw new PlistParseError(`bplist00 cyclic reference at object ${objIndex}`, "corrupt");
    }
    visiting.add(objIndex);
    try {
      const start = offsets[objIndex]!;
      const marker = bytes[start] ?? 0;
      const type = marker >> 4;
      const info = marker & 0x0f;
      let result: PlistValue;

      if (type === 0x0) {
        if (info === 0x0) result = null;
        else if (info === 0x8) result = false;
        else if (info === 0x9) result = true;
        else if (info === 0xf) result = null;
        else throw new PlistParseError(`unknown bplist00 primitive 0x${marker.toString(16)}`, "corrupt");
      } else if (type === 0x1) {
        const byteCount = 1 << info;
        if (byteCount > 16 || start + 1 + byteCount > offsetTableOffset) {
          throw new PlistParseError("bplist00 integer truncated", "truncated");
        }
        result = byteCount <= 8
          ? readBigEndianInt(bytes, start + 1, byteCount)
          : readBigEndianInt(bytes, start + 1 + (byteCount - 8), 8);
      } else if (type === 0x2) {
        const byteCount = 1 << info;
        if (start + 1 + byteCount > offsetTableOffset) {
          throw new PlistParseError("bplist00 float truncated", "truncated");
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset + start + 1, byteCount);
        if (byteCount === 4) result = view.getFloat32(0, false);
        else if (byteCount === 8) result = view.getFloat64(0, false);
        else throw new PlistParseError(`unsupported bplist00 real size ${byteCount}`, "corrupt");
      } else if (type === 0x3) {
        if (start + 9 > offsetTableOffset) {
          throw new PlistParseError("bplist00 date truncated", "truncated");
        }
        const seconds = new DataView(bytes.buffer, bytes.byteOffset + start + 1, 8).getFloat64(0, false);
        result = new Date(APPLE_EPOCH_MS + seconds * 1000);
      } else if (type === 0x4) {
        const { length, nextPos } = readLength(info, start + 1);
        if (nextPos + length > offsetTableOffset) {
          throw new PlistParseError("bplist00 data truncated", "truncated");
        }
        result = bytes.slice(nextPos, nextPos + length);
      } else if (type === 0x5) {
        const { length, nextPos } = readLength(info, start + 1);
        if (nextPos + length > offsetTableOffset) {
          throw new PlistParseError("bplist00 ASCII string truncated", "truncated");
        }
        result = LATIN1_DECODER.decode(bytes.subarray(nextPos, nextPos + length));
      } else if (type === 0x6) {
        const { length, nextPos } = readLength(info, start + 1);
        result = decodeUtf16Be(bytes, nextPos, length);
      } else if (type === 0x8) {
        const byteCount = info + 1;
        if (byteCount > 8 || start + 1 + byteCount > offsetTableOffset) {
          throw new PlistParseError("bplist00 UID truncated", "truncated");
        }
        result = { $uid: readBigEndianUint(bytes, start + 1, byteCount) };
      } else if (type === 0xa || type === 0xc) {
        const { length, nextPos } = readLength(info, start + 1);
        if (length > PLIST_LIMITS.maxObjects || nextPos + length * objectRefSize > offsetTableOffset) {
          throw new PlistParseError("bplist00 array truncated", "truncated");
        }
        const items: PlistValue[] = [];
        for (let i = 0; i < length; i += 1) {
          const ref = readBigEndianUint(bytes, nextPos + i * objectRefSize, objectRefSize);
          items.push(decodeObject(ref, depth + 1));
        }
        result = items;
      } else if (type === 0xd) {
        const { length, nextPos } = readLength(info, start + 1);
        const totalRefBytes = length * 2 * objectRefSize;
        if (length > PLIST_LIMITS.maxObjects || nextPos + totalRefBytes > offsetTableOffset) {
          throw new PlistParseError("bplist00 dict truncated", "truncated");
        }
        const dict: { [key: string]: PlistValue } = Object.create(null) as { [key: string]: PlistValue };
        const valStart = nextPos + length * objectRefSize;
        for (let i = 0; i < length; i += 1) {
          const keyRef = readBigEndianUint(bytes, nextPos + i * objectRefSize, objectRefSize);
          const valRef = readBigEndianUint(bytes, valStart + i * objectRefSize, objectRefSize);
          const key = decodeObject(keyRef, depth + 1);
          if (typeof key !== "string") {
            throw new PlistParseError("bplist00 dict key is not a string", "corrupt");
          }
          if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
          dict[key] = decodeObject(valRef, depth + 1);
        }
        result = dict;
      } else {
        throw new PlistParseError(`unsupported bplist00 object type 0x${type.toString(16)}`, "corrupt");
      }

      cache.set(objIndex, result);
      return result;
    } finally {
      visiting.delete(objIndex);
    }
  }

  return decodeObject(topObject, 0);
}

function base64ToBytes(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/\s+/gu, "");
  if (cleaned.length === 0) return new Uint8Array();
  const binary = globalThis.atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i) & 0xff;
  }
  return out;
}

function parseXmlPlistNode(element: SafeXmlElement, depth: number): PlistValue {
  if (depth > PLIST_LIMITS.maxDepth) {
    throw new PlistParseError("XML plist exceeds max nesting depth", "limit-exceeded");
  }
  switch (element.name) {
    case "string":
      return element.text;
    case "integer":
    case "real": {
      const value = Number(element.text.trim());
      return Number.isFinite(value) ? value : 0;
    }
    case "true":
      return true;
    case "false":
      return false;
    case "date":
      return new Date(element.text.trim());
    case "data":
      return base64ToBytes(element.text);
    case "array":
      return element.children.map((child) => parseXmlPlistNode(child, depth + 1));
    case "dict": {
      const dict: { [key: string]: PlistValue } = Object.create(null) as { [key: string]: PlistValue };
      const children = element.children;
      for (let i = 0; i + 1 < children.length; i += 2) {
        const keyNode = children[i];
        const valNode = children[i + 1];
        if (!keyNode || !valNode || keyNode.name !== "key") continue;
        const key = keyNode.text;
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        dict[key] = parseXmlPlistNode(valNode, depth + 1);
      }
      return dict;
    }
    default:
      return null;
  }
}

/** Parses an XML plist safely (rejects DTD entity declarations, allows standard Apple plist DOCTYPE). */
export function parseXmlPlist(text: string): PlistValue {
  if (/<!ENTITY/iu.test(text)) {
    throw new PlistParseError("XML plist ENTITY declarations are forbidden", "corrupt");
  }
  const withoutDoctype = text.replace(/<!DOCTYPE\s+plist\b[^>]*>/iu, "");
  let root: SafeXmlElement;
  try {
    root = parseSafeXml(withoutDoctype);
  } catch (cause) {
    throw new PlistParseError(
      cause instanceof Error ? cause.message : "malformed XML plist",
      "corrupt",
    );
  }
  if (root.name !== "plist" || root.children.length === 0) {
    throw new PlistParseError("XML document is not a valid <plist>", "invalid-format");
  }
  return parseXmlPlistNode(root.children[0]!, 0);
}

/** Auto-detects and parses either a `bplist00` binary plist or an XML plist. */
export function parsePlist(bytes: Uint8Array): PlistValue {
  if (isBinaryPlist(bytes)) return parseBinaryPlist(bytes);
  const text = UTF8_DECODER.decode(bytes);
  if (!text.includes("<plist")) {
    throw new PlistParseError("unrecognized plist format (neither bplist00 nor XML)", "invalid-format");
  }
  return parseXmlPlist(text);
}

function asPlainDict(value: PlistValue | undefined): { [key: string]: PlistValue } | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof Date) &&
    !isPlistUid(value)
  ) {
    return value as { [key: string]: PlistValue };
  }
  return null;
}

/**
 * Resolves an Apple `NSKeyedArchiver` object graph (`$archiver`, `$top`, `$objects`)
 * into a plain nested JS value tree with cycle protection.
 */
export function resolveNsKeyedArchive(plist: PlistValue): PlistValue {
  const root = asPlainDict(plist);
  if (!root) return plist;
  const objects = root.$objects;
  const top = asPlainDict(root.$top);
  if (!Array.isArray(objects) || !top) return plist;
  const objectList: readonly PlistValue[] = objects;

  const rootRef = top.root ?? Object.values(top)[0];
  if (rootRef === undefined) return plist;

  const visiting = new Set<number>();

  function resolveValue(value: PlistValue, depth: number): PlistValue {
    if (depth > PLIST_LIMITS.maxDepth) return null;
    if (value === "$null") return null;
    if (isPlistUid(value)) return resolveUid(value.$uid, depth + 1);
    if (Array.isArray(value)) return value.map((item) => resolveValue(item, depth + 1));
    const dict = asPlainDict(value);
    if (!dict) return value;

    // NSDictionary / NSMutableDictionary
    if (Array.isArray(dict["NS.keys"]) && Array.isArray(dict["NS.objects"])) {
      const keys = dict["NS.keys"] as PlistValue[];
      const vals = dict["NS.objects"] as PlistValue[];
      const out: { [key: string]: PlistValue } = Object.create(null) as { [key: string]: PlistValue };
      const count = Math.min(keys.length, vals.length);
      for (let i = 0; i < count; i += 1) {
        const k = resolveValue(keys[i]!, depth + 1);
        if (typeof k !== "string" || k === "__proto__" || k === "constructor" || k === "prototype") continue;
        out[k] = resolveValue(vals[i]!, depth + 1);
      }
      return out;
    }
    // NSArray / NSMutableArray / NSSet
    if (Array.isArray(dict["NS.objects"]) && !("NS.keys" in dict)) {
      return (dict["NS.objects"] as PlistValue[]).map((item) => resolveValue(item, depth + 1));
    }
    // NSMutableString / NSString wrapper
    if (typeof dict["NS.string"] === "string") return dict["NS.string"];
    // NSData wrapper
    if (dict["NS.data"] instanceof Uint8Array) return dict["NS.data"];

    const resolved: { [key: string]: PlistValue } = Object.create(null) as { [key: string]: PlistValue };
    for (const [k, v] of Object.entries(dict)) {
      if (k === "$class" || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      resolved[k] = resolveValue(v, depth + 1);
    }
    return resolved;
  }

  function resolveUid(uid: number, depth: number): PlistValue {
    if (uid <= 0 || uid >= objectList.length) return null;
    if (visiting.has(uid)) return null;
    visiting.add(uid);
    try {
      return resolveValue(objectList[uid]!, depth);
    } finally {
      visiting.delete(uid);
    }
  }

  return resolveValue(rootRef, 0);
}
