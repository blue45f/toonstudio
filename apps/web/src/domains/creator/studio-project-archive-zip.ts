/**
 * Studio project archive — deterministic ZIP32/store reader extracted from
 * studio-project-archive.ts.
 *
 * Reads only the subset our own archive writer emits: local/central headers,
 * stored entries, CRC-32 verification. Package errors, limits, and the text
 * codecs stay in studio-project-archive.ts and are consumed through its
 * exported surface.
 */
import type { StudioPackageArchiveSource } from "./studio-package-archive";
import {
  SAFE_ARCHIVE_PATH_PATTERN,
  fail,
  fatalTextDecoder,
  textEncoder,
} from "./studio-project-archive";
import type {
  StudioProjectArchiveLimits,
} from "./studio-project-archive";

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_CENTRAL_HEADER_BYTES = 46;
const ZIP_EOCD_BYTES = 22;

export interface ZipReader {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  slice(offset: number, length: number, mimeType: string): Blob;
}

export interface ParsedZipEntry {
  path: string;
  crc32: number;
  compressedBytes: number;
  uncompressedBytes: number;
  dataOffset: number;
  localHeaderOffset: number;
}

function uint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) value = (value >>> 8) ^ (crc32Table[(value ^ byte) & 0xff] ?? 0);
  return (value ^ 0xffff_ffff) >>> 0;
}

export function createZipReader(source: StudioPackageArchiveSource, limits: StudioProjectArchiveLimits): ZipReader {
  if (source instanceof Blob) {
    if (source.size <= 0 || source.size > limits.maxArchiveBytes) {
      fail("ARCHIVE_SIZE_LIMIT", "archiveTooLarge");
    }
    return {
      size: source.size,
      async read(offset, length) {
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > source.size) {
          fail("ARCHIVE_INVALID", "zipRangeInvalid");
        }
        const bytes = new Uint8Array(await source.slice(offset, offset + length).arrayBuffer());
        if (bytes.byteLength !== length) fail("ARCHIVE_INVALID", "zipReadIncomplete");
        return bytes;
      },
      slice(offset, length, mimeType) {
        return source.slice(offset, offset + length, mimeType);
      },
    };
  }
  if (!(source instanceof Uint8Array) && !(source instanceof ArrayBuffer)) {
    fail("ARCHIVE_INVALID", "unsupportedArchiveBytes");
  }
  const bytes = source instanceof Uint8Array
    ? source.slice()
    : new Uint8Array(source.slice(0));
  if (bytes.byteLength <= 0 || bytes.byteLength > limits.maxArchiveBytes) {
    fail("ARCHIVE_SIZE_LIMIT", "archiveTooLarge");
  }
  return {
    size: bytes.byteLength,
    async read(offset, length) {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
        fail("ARCHIVE_INVALID", "zipRangeInvalid");
      }
      return bytes.slice(offset, offset + length);
    },
    slice(offset, length, mimeType) {
      const copy = bytes.slice(offset, offset + length);
      return new Blob([copy.buffer as ArrayBuffer], { type: mimeType });
    },
  };
}

function validateImportedPath(value: string, limits: StudioProjectArchiveLimits): string {
  if (
    value.length === 0
    || value !== value.normalize("NFKC")
    || !SAFE_ARCHIVE_PATH_PATTERN.test(value)
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
    || textEncoder.encode(value).byteLength > limits.maxPathBytes
  ) {
    fail("PATH_INVALID", "zipUnsafePath", { path: value });
  }
  const segments = value.split("/");
  if (segments.some((segment) =>
    !segment
    || segment === "."
    || segment === ".."
    || segment.trim() !== segment
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
  )) {
    fail("PATH_INVALID", "zipPathTraversal", { path: value });
  }
  return value;
}

export async function parseZipEntries(reader: ZipReader, limits: StudioProjectArchiveLimits): Promise<ParsedZipEntry[]> {
  if (reader.size < ZIP_EOCD_BYTES) fail("ARCHIVE_INVALID", "zipEndRecordMissing");
  const eocdOffset = reader.size - ZIP_EOCD_BYTES;
  const eocd = await reader.read(eocdOffset, ZIP_EOCD_BYTES);
  if (uint32(eocd, 0) !== ZIP_EOCD_SIGNATURE || uint16(eocd, 20) !== 0) {
    fail("ARCHIVE_INVALID", "zipTrailingData");
  }
  if (uint16(eocd, 4) !== 0 || uint16(eocd, 6) !== 0) {
    fail("ARCHIVE_INVALID", "zipSplitUnsupported");
  }
  const entryCount = uint16(eocd, 10);
  if (entryCount !== uint16(eocd, 8) || entryCount < 2 || entryCount > limits.maxAttachments + 2) {
    fail("ZIP_ENTRY_COUNT_LIMIT", "entryCountExceeded");
  }
  const centralBytes = uint32(eocd, 12);
  const centralOffset = uint32(eocd, 16);
  if (centralOffset + centralBytes !== eocdOffset || centralBytes > entryCount * (ZIP_CENTRAL_HEADER_BYTES + limits.maxPathBytes)) {
    fail("ARCHIVE_INVALID", "zipCentralRangeInvalid");
  }
  const central = await reader.read(centralOffset, centralBytes);
  const entries: ParsedZipEntry[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let totalUncompressed = 0;
  const maxZipEntryBytes = Math.max(
    limits.maxAttachmentBytes,
    limits.maxProjectBytes,
    limits.maxManifestBytes
  );
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + ZIP_CENTRAL_HEADER_BYTES > central.length || uint32(central, cursor) !== ZIP_CENTRAL_SIGNATURE) {
      fail("ARCHIVE_INVALID", "zipCentralEntryCorrupt");
    }
    const flags = uint16(central, cursor + 8);
    const method = uint16(central, cursor + 10);
    const expectedCrc = uint32(central, cursor + 16);
    const compressedBytes = uint32(central, cursor + 20);
    const uncompressedBytes = uint32(central, cursor + 24);
    const nameBytes = uint16(central, cursor + 28);
    const extraBytes = uint16(central, cursor + 30);
    const commentBytes = uint16(central, cursor + 32);
    const localHeaderOffset = uint32(central, cursor + 42);
    const next = cursor + ZIP_CENTRAL_HEADER_BYTES + nameBytes + extraBytes + commentBytes;
    if (next > central.length || flags !== ZIP_UTF8_FLAG || extraBytes !== 0 || commentBytes !== 0) {
      fail("ARCHIVE_INVALID", "zipFlagsUnsupported");
    }
    if (method !== ZIP_STORE_METHOD) {
      if (uncompressedBytes > Math.max(compressedBytes * 10, maxZipEntryBytes)) {
        fail("ZIP_BOMB", "entryRatioBlocked");
      }
      fail("ZIP_COMPRESSION_UNSUPPORTED", "compressedEntryUnsupported");
    }
    if (compressedBytes !== uncompressedBytes || uncompressedBytes > maxZipEntryBytes) {
      fail("ZIP_BOMB", "entryDeclarationUnsafe");
    }
    totalUncompressed += uncompressedBytes;
    if (totalUncompressed > limits.maxArchiveBytes) {
      fail("ZIP_BOMB", "totalDecompressedTooLarge");
    }
    let path: string;
    try {
      path = fatalTextDecoder.decode(central.subarray(cursor + ZIP_CENTRAL_HEADER_BYTES, cursor + ZIP_CENTRAL_HEADER_BYTES + nameBytes));
    } catch {
      fail("PATH_INVALID", "zipNameNotUtf8");
    }
    path = validateImportedPath(path, limits);
    const comparisonKey = path.toLowerCase();
    if (seen.has(comparisonKey)) fail("DUPLICATE_PATH", "zipDuplicatePath", { path });
    seen.add(comparisonKey);

    const localHeader = await reader.read(localHeaderOffset, ZIP_LOCAL_HEADER_BYTES + nameBytes);
    if (
      uint32(localHeader, 0) !== ZIP_LOCAL_SIGNATURE
      || uint16(localHeader, 6) !== flags
      || uint16(localHeader, 8) !== method
      || uint32(localHeader, 14) !== expectedCrc
      || uint32(localHeader, 18) !== compressedBytes
      || uint32(localHeader, 22) !== uncompressedBytes
      || uint16(localHeader, 26) !== nameBytes
      || uint16(localHeader, 28) !== 0
    ) {
      fail("ARCHIVE_INVALID", "zipLocalCentralMismatch", { path });
    }
    let localName: string;
    try {
      localName = fatalTextDecoder.decode(localHeader.subarray(ZIP_LOCAL_HEADER_BYTES));
    } catch {
      fail("PATH_INVALID", "zipLocalNameNotUtf8", { path });
    }
    if (localName !== path) fail("ARCHIVE_INVALID", "zipLocalNameMismatch", { path });
    entries.push({
      path,
      crc32: expectedCrc,
      compressedBytes,
      uncompressedBytes,
      dataOffset: localHeaderOffset + ZIP_LOCAL_HEADER_BYTES + nameBytes,
      localHeaderOffset,
    });
    cursor = next;
  }
  if (cursor !== central.length) fail("ARCHIVE_INVALID", "zipCentralTrailingData");
  const localOrder = [...entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  let expectedOffset = 0;
  for (const entry of localOrder) {
    if (entry.localHeaderOffset !== expectedOffset || entry.dataOffset + entry.compressedBytes > centralOffset) {
      fail("ARCHIVE_INVALID", "zipLocalHiddenData", { path: entry.path });
    }
    expectedOffset = entry.dataOffset + entry.compressedBytes;
  }
  if (expectedOffset !== centralOffset) fail("ARCHIVE_INVALID", "zipLocalCentralGap");
  return entries;
}

export async function readVerifiedEntry(reader: ZipReader, entry: ParsedZipEntry): Promise<Uint8Array> {
  const bytes = await reader.read(entry.dataOffset, entry.uncompressedBytes);
  if (crc32(bytes) !== entry.crc32) {
    fail("CRC_MISMATCH", "zipEntryCrcFailed", { path: entry.path });
  }
  return bytes;
}