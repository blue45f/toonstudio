/**
 * 제로 의존성 표준 ZIP (PKWARE APPNOTE 6.3.x) 바이너리 인코더·디코더.
 * - IEEE 802.3 CRC-32 검증
 * - Local File Header (0x04034b50), Central Directory (0x02014b50), EOCD (0x06054b50)
 * - UTF-8 파일명 플래그 (0x0800) 완전 지원
 * - Store(0) 동기 읽기/쓰기 및 Deflate(8) 비동기 읽기(DecompressionStream) 지원
 */

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FILENAME_FLAG = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const VERSION_20 = 20;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8");

export interface ZipArchiveEntryInput {
  readonly path: string;
  readonly data: Uint8Array | string;
  readonly lastModified?: Date;
}

export interface ZipArchiveEntry {
  readonly path: string;
  readonly data: Uint8Array;
  readonly crc32: number;
  readonly compressionMethod: number;
  readonly uncompressedSize: number;
  readonly compressedSize: number;
}

export interface ReadZipOptions {
  readonly verifyCrc?: boolean;
}

interface ParsedCentralRecord {
  readonly path: string;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly flags: number;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

export function encodeUtf8(text: string): Uint8Array {
  return TEXT_ENCODER.encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return TEXT_DECODER.decode(bytes);
}

export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const idx = (crc ^ data[i]) & 0xff;
    crc = (CRC32_TABLE[idx] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(rawPath: string): string {
  const normalized = rawPath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.length === 0) {
    throw new Error("ZIP 엔트리 경로는 비어 있을 수 없습니다.");
  }
  if (normalized.includes("../") || normalized === "..") {
    throw new Error(`안전하지 않은 ZIP 엔트리 경로입니다: ${rawPath}`);
  }
  return normalized;
}

function encodeDosDateTime(date: Date): { readonly dosTime: number; readonly dosDate: number } {
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

const DEFAULT_ARCHIVE_DATE = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

/**
 * 표준 ZIP 바이너리 아카이브(Store 방식, UTF-8 파일명, IEEE CRC-32)를 생성한다.
 */
export function buildZipArchive(entries: readonly ZipArchiveEntryInput[]): Uint8Array {
  if (entries.length > 0xffff) {
    throw new Error("단일 ZIP 아카이브는 65,535개 이하의 엔트리만 지원합니다.");
  }

  interface PreparedEntry {
    readonly pathBytes: Uint8Array;
    readonly dataBytes: Uint8Array;
    readonly crc32: number;
    readonly dosTime: number;
    readonly dosDate: number;
    readonly localOffset: number;
  }

  const seenPaths = new Set<string>();
  const prepared: PreparedEntry[] = [];
  let localSectionBytes = 0;
  let centralSectionBytes = 0;

  for (const entry of entries) {
    const cleanPath = normalizeZipPath(entry.path);
    if (seenPaths.has(cleanPath)) {
      throw new Error(`중복된 ZIP 엔트리 경로입니다: ${cleanPath}`);
    }
    seenPaths.add(cleanPath);

    const pathBytes = encodeUtf8(cleanPath);
    const dataBytes = typeof entry.data === "string" ? encodeUtf8(entry.data) : entry.data;
    const crc32 = computeCrc32(dataBytes);
    const { dosTime, dosDate } = encodeDosDateTime(entry.lastModified ?? DEFAULT_ARCHIVE_DATE);

    prepared.push({
      pathBytes,
      dataBytes,
      crc32,
      dosTime,
      dosDate,
      localOffset: localSectionBytes,
    });

    localSectionBytes += 30 + pathBytes.length + dataBytes.length;
    centralSectionBytes += 46 + pathBytes.length;
  }

  const eocdBytes = 22;
  const totalBytes = localSectionBytes + centralSectionBytes + eocdBytes;
  const output = new Uint8Array(totalBytes);
  const view = new DataView(output.buffer);

  let offset = 0;

  // 1. Local File Header + Payload
  for (const item of prepared) {
    view.setUint32(offset, LOCAL_FILE_HEADER_SIG, true);
    view.setUint16(offset + 4, VERSION_20, true);
    view.setUint16(offset + 6, UTF8_FILENAME_FLAG, true);
    view.setUint16(offset + 8, METHOD_STORE, true);
    view.setUint16(offset + 10, item.dosTime, true);
    view.setUint16(offset + 12, item.dosDate, true);
    view.setUint32(offset + 14, item.crc32, true);
    view.setUint32(offset + 18, item.dataBytes.length, true);
    view.setUint32(offset + 22, item.dataBytes.length, true);
    view.setUint16(offset + 26, item.pathBytes.length, true);
    view.setUint16(offset + 28, 0, true);
    offset += 30;

    output.set(item.pathBytes, offset);
    offset += item.pathBytes.length;

    output.set(item.dataBytes, offset);
    offset += item.dataBytes.length;
  }

  const centralDirStart = offset;

  // 2. Central Directory File Headers
  for (const item of prepared) {
    view.setUint32(offset, CENTRAL_DIR_HEADER_SIG, true);
    view.setUint16(offset + 4, VERSION_20, true);
    view.setUint16(offset + 6, VERSION_20, true);
    view.setUint16(offset + 8, UTF8_FILENAME_FLAG, true);
    view.setUint16(offset + 10, METHOD_STORE, true);
    view.setUint16(offset + 12, item.dosTime, true);
    view.setUint16(offset + 14, item.dosDate, true);
    view.setUint32(offset + 16, item.crc32, true);
    view.setUint32(offset + 20, item.dataBytes.length, true);
    view.setUint32(offset + 24, item.dataBytes.length, true);
    view.setUint16(offset + 28, item.pathBytes.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, item.localOffset, true);
    offset += 46;

    output.set(item.pathBytes, offset);
    offset += item.pathBytes.length;
  }

  // 3. End of Central Directory Record (EOCD)
  view.setUint32(offset, EOCD_SIG, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralSectionBytes, true);
  view.setUint32(offset + 16, centralDirStart, true);
  view.setUint16(offset + 20, 0, true);

  return output;
}

function findEocdOffset(bytes: Uint8Array, view: DataView): number {
  if (bytes.length < 22) {
    throw new Error("유효한 ZIP 파일이 아닙니다: 길이가 22바이트 미만입니다.");
  }
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let pos = bytes.length - 22; pos >= minOffset; pos -= 1) {
    if (view.getUint32(pos, true) === EOCD_SIG) {
      const commentLength = view.getUint16(pos + 20, true);
      if (pos + 22 + commentLength === bytes.length) {
        return pos;
      }
    }
  }
  throw new Error("ZIP EOCD(0x06054b50) 시그니처를 찾을 수 없습니다.");
}

function parseCentralDirectory(bytes: Uint8Array, view: DataView): readonly ParsedCentralRecord[] {
  const eocdOffset = findEocdOffset(bytes, view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (centralDirOffset + centralDirSize > bytes.length) {
    throw new Error("ZIP Central Directory 범위가 파일 크기를 초과합니다.");
  }

  const records: ParsedCentralRecord[] = [];
  let cursor = centralDirOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > bytes.length) {
      throw new Error("ZIP Central Directory 엔트리가 손상되었습니다.");
    }
    const sig = view.getUint32(cursor, true);
    if (sig !== CENTRAL_DIR_HEADER_SIG) {
      throw new Error(`예상치 못한 Central Directory 시그니처입니다: 0x${sig.toString(16)}`);
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd + extraLen + commentLen > bytes.length) {
      throw new Error("ZIP 파일명 메타데이터가 파일 범위를 초과합니다.");
    }
    const path = decodeUtf8(bytes.subarray(nameStart, nameEnd));
    records.push({
      path,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      flags,
    });
    cursor = nameEnd + extraLen + commentLen;
  }

  return records;
}

function extractRawPayload(
  bytes: Uint8Array,
  view: DataView,
  record: ParsedCentralRecord,
): Uint8Array {
  const lh = record.localHeaderOffset;
  if (lh + 30 > bytes.length) {
    throw new Error(`ZIP Local File Header 범위 초과: ${record.path}`);
  }
  const sig = view.getUint32(lh, true);
  if (sig !== LOCAL_FILE_HEADER_SIG) {
    throw new Error(`ZIP Local File Header 시그니처 오류(${record.path}): 0x${sig.toString(16)}`);
  }
  const localNameLen = view.getUint16(lh + 26, true);
  const localExtraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + record.compressedSize;
  if (dataEnd > bytes.length) {
    throw new Error(`ZIP 엔트리 데이터 범위 초과: ${record.path}`);
  }
  return bytes.slice(dataStart, dataEnd);
}

function assertValidCrc(path: string, data: Uint8Array, expectedCrc: number): void {
  const actual = computeCrc32(data);
  if (actual !== expectedCrc) {
    throw new Error(
      `ZIP CRC-32 불일치(${path}): expected=0x${expectedCrc.toString(16)}, actual=0x${actual.toString(16)}`,
    );
  }
}

/**
 * Store(무압축) 방식 ZIP 아카이브를 동기적으로 파싱하고 CRC-32를 검증한다.
 */
export function readZipArchive(
  bytes: Uint8Array,
  options: ReadZipOptions = {},
): readonly ZipArchiveEntry[] {
  const verifyCrc = options.verifyCrc ?? true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = parseCentralDirectory(bytes, view);
  const entries: ZipArchiveEntry[] = [];

  for (const record of records) {
    if (record.compressionMethod !== METHOD_STORE) {
      throw new Error(
        `동기 readZipArchive는 Store(0) 엔트리만 지원합니다(${record.path}, method=${record.compressionMethod}). Deflate 압축 .pptx는 readZipArchiveAsync를 사용하세요.`,
      );
    }
    const payload = extractRawPayload(bytes, view, record);
    if (verifyCrc) {
      assertValidCrc(record.path, payload, record.crc32);
    }
    entries.push({
      path: record.path,
      data: payload,
      crc32: record.crc32,
      compressionMethod: record.compressionMethod,
      uncompressedSize: record.uncompressedSize,
      compressedSize: record.compressedSize,
    });
  }

  return entries;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("이 런타임은 Deflate 해제용 DecompressionStream을 지원하지 않습니다.");
  }
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const payloadCopy = new Uint8Array(compressed.byteLength);
  payloadCopy.set(compressed);
  await writer.write(payloadCopy);
  await writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    totalLength += next.value.byteLength;
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/**
 * Store(0) 및 Deflate(8) ZIP 아카이브를 비동기적으로 해제하고 CRC-32를 검증한다.
 * Microsoft PowerPoint / Keynote / LibreOffice가 저장한 압축 `.pptx` 파일 가져오기에 사용한다.
 */
export async function readZipArchiveAsync(
  bytes: Uint8Array,
  options: ReadZipOptions = {},
): Promise<readonly ZipArchiveEntry[]> {
  const verifyCrc = options.verifyCrc ?? true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = parseCentralDirectory(bytes, view);
  const entries: ZipArchiveEntry[] = [];

  for (const record of records) {
    const rawPayload = extractRawPayload(bytes, view, record);
    let data: Uint8Array;
    if (record.compressionMethod === METHOD_STORE) {
      data = rawPayload;
    } else if (record.compressionMethod === METHOD_DEFLATE) {
      data = await inflateRawBytes(rawPayload);
    } else {
      throw new Error(
        `지원하지 않는 ZIP 압축 방식입니다(${record.path}, method=${record.compressionMethod}).`,
      );
    }
    if (verifyCrc) {
      assertValidCrc(record.path, data, record.crc32);
    }
    entries.push({
      path: record.path,
      data,
      crc32: record.crc32,
      compressionMethod: record.compressionMethod,
      uncompressedSize: record.uncompressedSize,
      compressedSize: record.compressedSize,
    });
  }

  return entries;
}
