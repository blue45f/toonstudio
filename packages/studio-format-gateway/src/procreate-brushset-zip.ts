/**
 * Bounded synchronous ZIP32 extractor backed by `zlib-inflate.ts` (zero external
 * dependencies; raw-DEFLATE via RFC 1950 header wrapper + CRC-32 authentication).
 */

import { inflateZlib } from "./zlib-inflate";

export const PROCREATE_ZIP_LIMITS = Object.freeze({
  maxArchiveBytes: 128_000_000,
  maxEntries: 2_048,
  maxEntryUncompressedBytes: 32_000_000,
  maxTotalUncompressedBytes: 192_000_000,
  maxCompressionRatio: 100,
});

export type ProcreateZipErrorCode =
  | "aborted"
  | "source-too-large"
  | "zip-invalid"
  | "zip-unsupported"
  | "zip-crc-mismatch";

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CENTRAL_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let b = 0; b < 8; b += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffff_ffff;
  for (const byte of bytes) c = (c >>> 8) ^ (CRC32_TABLE[(c ^ byte) & 0xff] ?? 0);
  return (c ^ 0xffff_ffff) >>> 0;
}

function inflateRawDeflate(compressed: Uint8Array, expectedBytes: number): Uint8Array {
  const wrapped = new Uint8Array(compressed.byteLength + 6);
  wrapped[0] = 0x78;
  wrapped[1] = 0x01;
  wrapped.set(compressed, 2);
  return inflateZlib(wrapped, {
    maxOutputBytes: Math.max(expectedBytes, 1),
    expectedBytes,
    skipChecksum: true,
    maxBlocks: 65_536,
  }).output.slice();
}

function normalizeSafeEntryPath(rawPath: string): string | null {
  const normalized = rawPath.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  const parts = normalized.split("/");
  if (parts.some((segment) => segment === "..")) return null;
  if (parts[0] === "__MACOSX" || parts.some((segment) => segment.startsWith("._"))) return null;
  return normalized;
}

export function extractProcreateZipEntries(
  bytes: Uint8Array,
  fail: (message: string, code: ProcreateZipErrorCode, cause?: unknown) => never,
  signal?: AbortSignal,
): Map<string, Uint8Array> {
  if (signal?.aborted) fail("import aborted", "aborted");
  if (bytes.byteLength < 22) fail("file shorter than ZIP EOCD record", "zip-invalid");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  let eocdOffset = -1;
  for (let pos = bytes.byteLength - 22; pos >= searchStart; pos -= 1) {
    if (view.getUint32(pos, true) !== ZIP_EOCD_SIG) continue;
    const commentLen = view.getUint16(pos + 20, true);
    if (pos + 22 + commentLen === bytes.byteLength) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset < 0) fail("not a valid ZIP archive (EOCD not found)", "zip-invalid");

  if (view.getUint16(eocdOffset + 4, true) !== 0 || view.getUint16(eocdOffset + 6, true) !== 0) {
    fail("multi-disk ZIP archives are unsupported", "zip-unsupported");
  }
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount > PROCREATE_ZIP_LIMITS.maxEntries) {
    fail(`ZIP entry count ${entryCount} exceeds limit`, "source-too-large");
  }
  if (cdOffset + cdSize > eocdOffset) {
    fail("ZIP central directory out of bounds", "zip-invalid");
  }

  const files = new Map<string, Uint8Array>();
  let totalUncompressed = 0;
  let cursor = cdOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (signal?.aborted) fail("import aborted", "aborted");
    if (cursor + 46 > cdOffset + cdSize) fail("ZIP central directory entry truncated", "zip-invalid");
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL_SIG) {
      fail("invalid ZIP central directory signature", "zip-invalid");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    cursor = nameStart + nameLen + extraLen + commentLen;
    if (cursor > cdOffset + cdSize) fail("ZIP central entry variable fields out of bounds", "zip-invalid");
    if ((flags & 0x0001) !== 0) fail("encrypted ZIP entries are unsupported", "zip-unsupported");

    const rawName = UTF8_DECODER.decode(bytes.subarray(nameStart, nameStart + nameLen));
    if (rawName.endsWith("/")) continue;
    const safePath = normalizeSafeEntryPath(rawName);
    if (!safePath) continue;
    if (uncompressedSize > PROCREATE_ZIP_LIMITS.maxEntryUncompressedBytes) {
      fail(`ZIP entry ${safePath} exceeds size limit`, "source-too-large");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > PROCREATE_ZIP_LIMITS.maxTotalUncompressedBytes) {
      fail("ZIP archive total uncompressed size exceeds limit", "source-too-large");
    }
    if (
      method === 8 &&
      compressedSize > 0 &&
      uncompressedSize / compressedSize > PROCREATE_ZIP_LIMITS.maxCompressionRatio
    ) {
      fail(`ZIP entry ${safePath} exceeds safe compression ratio`, "source-too-large");
    }
    if (localHeaderOffset + 30 > cdOffset || view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_SIG) {
      fail(`invalid local header for ${safePath}`, "zip-invalid");
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > cdOffset) fail(`ZIP entry ${safePath} payload exceeds archive`, "zip-invalid");

    const payload = bytes.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (method === 0) {
      data = payload.slice();
    } else if (method === 8) {
      try {
        data = inflateRawDeflate(payload, uncompressedSize);
      } catch (cause) {
        fail(`failed to inflate ${safePath}`, "zip-invalid", cause);
      }
    } else {
      fail(`unsupported ZIP compression method ${method}`, "zip-unsupported");
    }
    if (data.byteLength !== uncompressedSize || crc32(data) !== expectedCrc) {
      fail(`CRC-32 mismatch on ${safePath}`, "zip-crc-mismatch");
    }
    files.set(safePath, data);
  }
  return files;
}
