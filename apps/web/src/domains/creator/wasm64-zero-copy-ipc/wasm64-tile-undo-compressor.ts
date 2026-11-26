/**
 * 256×256 RGBA8(262,144B) 캔버스 타일 전용 무손실 XOR-Delta + PackBits/확장 제로런 압축기 및 Undo/Redo 히스토리.
 *
 * - 브러시 전후 타일의 XOR 델타(`before ^ after`)를 단일 패스로 인코딩해 중간 256KB 임시 버퍼를
 *   할당하지 않으며, 미변경 구간은 3바이트 확장 제로런(최대 65,664B)으로 축약한다.
 * - XOR 대칭성으로 단일 패킷이 Undo·Redo 모두 0-diff 무손실 복원을 지원하고,
 *   복원 시 0 런은 메모리를 건드리지 않고 건너뛴다. 고엔트로피 타일은 `raw-xor` 폴백(+16B 상한)으로 보호한다.
 */

export const WASM64_TILE_DIM = 256;
export const WASM64_TILE_CHANNELS = 4;
export const WASM64_TILE_BYTE_LENGTH = WASM64_TILE_DIM * WASM64_TILE_DIM * WASM64_TILE_CHANNELS;
export const WASM64_UNDO_MAGIC = 0x54535855; // "TSXU"
export const WASM64_UNDO_HEADER_BYTES = 16;

const MODE_PACKBITS_XOR = 1;
const MODE_RAW_XOR = 2;
const EXTENDED_ZERO_TOKEN = 0x80;
const EXTENDED_ZERO_MIN_RUN = 129;
const EXTENDED_ZERO_MAX_RUN = 65_664;
const PACKBITS_MAX_RUN = 128;

export interface Wasm64CompressedTileDelta {
  readonly rawByteLength: number;
  readonly compressedByteLength: number;
  readonly mode: "packbits-xor" | "raw-xor";
  readonly ramSavingsPercent: number;
  readonly compressionRatio: number;
  readonly checksum: number;
  readonly payload: Uint8Array;
}

export interface Wasm64TileUndoEntry {
  readonly id: number;
  readonly tileKey: string;
  readonly strokeId: number;
  readonly rawByteLength: number;
  readonly compressedByteLength: number;
  readonly mode: "packbits-xor" | "raw-xor";
  readonly checksum: number;
  readonly payload: Uint8Array;
}

export interface Wasm64TileUndoHistoryOptions {
  readonly maxEntries?: number;
  readonly maxCompressedBytes?: number;
  readonly expectedTileBytes?: number;
}

export interface Wasm64TileUndoStats {
  readonly entryCount: number;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly totalRawBytes: number;
  readonly totalCompressedBytes: number;
  readonly savedBytes: number;
  readonly ramSavingsPercent: number;
  readonly compressionRatio: number;
  readonly evictedEntryCount: number;
}

function fnv1a32(bytes: Uint8Array, start: number, end: number): number {
  let hash = 0x811c9dc5;
  for (let i = start; i < end; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function readAndValidateHeader(payload: Uint8Array): { readonly rawByteLength: number; readonly modeCode: number } {
  if (payload.byteLength < WASM64_UNDO_HEADER_BYTES) {
    throw new RangeError(`Compressed tile delta truncated (${payload.byteLength}B)`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, WASM64_UNDO_HEADER_BYTES);
  const magic = view.getUint32(0, true);
  if (magic !== WASM64_UNDO_MAGIC) throw new RangeError(`Invalid tile delta magic: 0x${magic.toString(16)}`);
  const rawByteLength = view.getUint32(4, true);
  const modeCode = view.getUint32(8, true);
  const checksum = view.getUint32(12, true);
  if (modeCode !== MODE_PACKBITS_XOR && modeCode !== MODE_RAW_XOR) {
    throw new RangeError(`Unsupported tile delta mode: ${modeCode}`);
  }
  const actual = fnv1a32(payload, WASM64_UNDO_HEADER_BYTES, payload.byteLength);
  if (actual !== checksum) {
    throw new Error(`Compressed tile delta checksum mismatch (0x${checksum.toString(16)} != 0x${actual.toString(16)})`);
  }
  return { rawByteLength, modeCode };
}

/** `before`와 `after` 타일의 XOR 델타를 무손실 PackBits + 확장 제로런으로 압축한다. */
export function compressTileXorDelta(before: Uint8Array, after: Uint8Array): Wasm64CompressedTileDelta {
  const rawLen = before.byteLength;
  if (rawLen !== after.byteLength) {
    throw new RangeError(`Tile buffer lengths must match (${rawLen}B != ${after.byteLength}B)`);
  }

  const rawLimit = WASM64_UNDO_HEADER_BYTES + rawLen;
  const scratch = new Uint8Array(rawLimit + Math.ceil(rawLen / 128) + 16);
  let outPos = WASM64_UNDO_HEADER_BYTES;
  let aborted = false;

  for (let i = 0; i < rawLen; ) {
    if (outPos >= rawLimit) { aborted = true; break; }
    const first = before[i] ^ after[i];
    if (first === 0) {
      let run = 1;
      const limit = Math.min(rawLen - i, EXTENDED_ZERO_MAX_RUN);
      while (run < limit && (before[i + run] ^ after[i + run]) === 0) run += 1;
      if (run >= EXTENDED_ZERO_MIN_RUN) {
        const enc = run - EXTENDED_ZERO_MIN_RUN;
        scratch[outPos] = EXTENDED_ZERO_TOKEN;
        scratch[outPos + 1] = enc & 0xff;
        scratch[outPos + 2] = (enc >>> 8) & 0xff;
        outPos += 3; i += run; continue;
      }
      if (run >= 2) {
        scratch[outPos] = (257 - run) & 0xff; scratch[outPos + 1] = 0;
        outPos += 2; i += run; continue;
      }
    } else {
      let run = 1;
      const limit = Math.min(rawLen - i, PACKBITS_MAX_RUN);
      while (run < limit && (before[i + run] ^ after[i + run]) === first) run += 1;
      if (run >= 2) {
        scratch[outPos] = (257 - run) & 0xff; scratch[outPos + 1] = first;
        outPos += 2; i += run; continue;
      }
    }

    const litStart = i;
    let litLen = 1;
    i += 1;
    while (i < rawLen && litLen < PACKBITS_MAX_RUN) {
      const cur = before[i] ^ after[i];
      if (
        i + 2 < rawLen &&
        cur === (before[i + 1] ^ after[i + 1]) &&
        cur === (before[i + 2] ^ after[i + 2])
      ) break;
      litLen += 1; i += 1;
    }
    scratch[outPos] = litLen - 1;
    outPos += 1;
    for (let k = 0; k < litLen; k += 1) scratch[outPos + k] = before[litStart + k] ^ after[litStart + k];
    outPos += litLen;
  }

  let payload: Uint8Array;
  let mode: "packbits-xor" | "raw-xor";
  let modeCode: number;
  if (aborted || outPos >= rawLimit) {
    payload = new Uint8Array(rawLimit);
    for (let k = 0; k < rawLen; k += 1) payload[WASM64_UNDO_HEADER_BYTES + k] = before[k] ^ after[k];
    mode = "raw-xor"; modeCode = MODE_RAW_XOR;
  } else {
    payload = scratch.slice(0, outPos);
    mode = "packbits-xor"; modeCode = MODE_PACKBITS_XOR;
  }

  const checksum = fnv1a32(payload, WASM64_UNDO_HEADER_BYTES, payload.byteLength);
  const view = new DataView(payload.buffer, payload.byteOffset, WASM64_UNDO_HEADER_BYTES);
  view.setUint32(0, WASM64_UNDO_MAGIC, true);
  view.setUint32(4, rawLen >>> 0, true);
  view.setUint32(8, modeCode >>> 0, true);
  view.setUint32(12, checksum >>> 0, true);

  const compressedByteLength = payload.byteLength;
  return {
    rawByteLength: rawLen,
    compressedByteLength,
    mode,
    ramSavingsPercent: rawLen > 0 ? ((rawLen - compressedByteLength) / rawLen) * 100 : 0,
    compressionRatio: compressedByteLength > 0 ? rawLen / compressedByteLength : 1,
    checksum,
    payload,
  };
}

/** 압축된 XOR 델타를 타일 버퍼에 제자리 적용한다(0 런은 메모리 미접근 건너뜀). */
export function applyTileXorDeltaInPlace(tileBuffer: Uint8Array, payload: Uint8Array): Uint8Array {
  const { rawByteLength, modeCode } = readAndValidateHeader(payload);
  if (tileBuffer.byteLength !== rawByteLength) {
    throw new RangeError(`Target tile length (${tileBuffer.byteLength}B) != ${rawByteLength}B`);
  }
  if (modeCode === MODE_RAW_XOR) {
    if (payload.byteLength !== WASM64_UNDO_HEADER_BYTES + rawByteLength) {
      throw new Error("Corrupt raw-xor tile delta length");
    }
    for (let i = 0; i < rawByteLength; i += 1) tileBuffer[i] ^= payload[WASM64_UNDO_HEADER_BYTES + i];
    return tileBuffer;
  }

  let pos = WASM64_UNDO_HEADER_BYTES;
  let outPos = 0;
  const end = payload.byteLength;
  while (pos < end) {
    const h = payload[pos];
    pos += 1;
    if (h <= 0x7f) {
      const count = h + 1;
      if (pos + count > end || outPos + count > rawByteLength) throw new Error("Corrupt PackBits literal run");
      for (let k = 0; k < count; k += 1) tileBuffer[outPos + k] ^= payload[pos + k];
      pos += count; outPos += count;
    } else if (h === EXTENDED_ZERO_TOKEN) {
      if (pos + 2 > end) throw new Error("Truncated extended zero-run token");
      const count = (payload[pos] | (payload[pos + 1] << 8)) + EXTENDED_ZERO_MIN_RUN;
      pos += 2;
      if (outPos + count > rawByteLength) throw new Error("Extended zero-run exceeds tile bounds");
      outPos += count;
    } else {
      const count = 257 - h;
      if (pos >= end || outPos + count > rawByteLength) throw new Error("Corrupt PackBits repeat run");
      const val = payload[pos];
      pos += 1;
      if (val !== 0) {
        for (let k = 0; k < count; k += 1) tileBuffer[outPos + k] ^= val;
      }
      outPos += count;
    }
  }
  if (outPos !== rawByteLength) throw new Error(`Decoded length mismatch (${outPos}B != ${rawByteLength}B)`);
  return tileBuffer;
}

/** 압축된 XOR 델타를 원본 델타 바이트 배열로 무손실 복원한다. */
export function decompressTileXorDelta(payload: Uint8Array, outDelta?: Uint8Array): Uint8Array {
  const { rawByteLength } = readAndValidateHeader(payload);
  const target = outDelta ?? new Uint8Array(rawByteLength);
  if (target.byteLength !== rawByteLength) throw new RangeError(`outDelta length != ${rawByteLength}B`);
  if (outDelta) target.fill(0);
  return applyTileXorDeltaInPlace(target, payload);
}

export type Wasm64TileBufferResolver = Uint8Array | ((tileKey: string) => Uint8Array);

/** 유계(Bounded) 256×256 RGBA8 타일 Undo/Redo 압축 히스토리 스택. */
export class Wasm64TileUndoHistory {
  readonly maxEntries: number;
  readonly maxCompressedBytes: number;
  readonly expectedTileBytes: number;

  private readonly undoStack: Wasm64TileUndoEntry[] = [];
  private readonly redoStack: Wasm64TileUndoEntry[] = [];
  private nextEntryId = 1;
  private totalRawBytes = 0;
  private totalCompressedBytes = 0;
  private evictedEntryCount = 0;

  constructor(options: Wasm64TileUndoHistoryOptions = {}) {
    this.maxEntries = options.maxEntries ?? 128;
    this.maxCompressedBytes = options.maxCompressedBytes ?? 32 * 1024 * 1024;
    this.expectedTileBytes = options.expectedTileBytes ?? WASM64_TILE_BYTE_LENGTH;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries <= 0) {
      throw new RangeError(`maxEntries must be > 0 (got ${this.maxEntries})`);
    }
    if (!Number.isSafeInteger(this.maxCompressedBytes) || this.maxCompressedBytes <= 0) {
      throw new RangeError(`maxCompressedBytes must be > 0 (got ${this.maxCompressedBytes})`);
    }
  }

  recordStrokeDelta(
    tileKey: string, before: Uint8Array, after: Uint8Array, strokeId = 0,
  ): Wasm64TileUndoEntry {
    if (this.expectedTileBytes > 0 && before.byteLength !== this.expectedTileBytes) {
      throw new RangeError(`Tile byteLength (${before.byteLength}B) != ${this.expectedTileBytes}B`);
    }
    const c = compressTileXorDelta(before, after);
    this.clearRedoStack();
    const entry: Wasm64TileUndoEntry = {
      id: this.nextEntryId, tileKey, strokeId,
      rawByteLength: c.rawByteLength, compressedByteLength: c.compressedByteLength,
      mode: c.mode, checksum: c.checksum, payload: c.payload,
    };
    this.nextEntryId += 1;
    this.undoStack.push(entry);
    this.totalRawBytes += entry.rawByteLength;
    this.totalCompressedBytes += entry.compressedByteLength;
    this.enforceBudget();
    return entry;
  }

  undo(target: Wasm64TileBufferResolver): Wasm64TileUndoEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    applyTileXorDeltaInPlace(typeof target === "function" ? target(entry.tileKey) : target, entry.payload);
    this.redoStack.push(entry);
    return entry;
  }

  redo(target: Wasm64TileBufferResolver): Wasm64TileUndoEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    applyTileXorDeltaInPlace(typeof target === "function" ? target(entry.tileKey) : target, entry.payload);
    this.undoStack.push(entry);
    return entry;
  }

  clear(): void {
    this.undoStack.length = 0; this.redoStack.length = 0;
    this.totalRawBytes = 0; this.totalCompressedBytes = 0;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoDepth(): number { return this.undoStack.length; }
  get redoDepth(): number { return this.redoStack.length; }

  getMemoryStats(): Wasm64TileUndoStats {
    const savedBytes = this.totalRawBytes - this.totalCompressedBytes;
    return {
      entryCount: this.undoStack.length + this.redoStack.length,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      totalRawBytes: this.totalRawBytes,
      totalCompressedBytes: this.totalCompressedBytes,
      savedBytes,
      ramSavingsPercent: this.totalRawBytes > 0 ? (savedBytes / this.totalRawBytes) * 100 : 0,
      compressionRatio: this.totalCompressedBytes > 0 ? this.totalRawBytes / this.totalCompressedBytes : 1,
      evictedEntryCount: this.evictedEntryCount,
    };
  }

  private clearRedoStack(): void {
    while (this.redoStack.length > 0) {
      const removed = this.redoStack.pop();
      if (removed) {
        this.totalRawBytes -= removed.rawByteLength;
        this.totalCompressedBytes -= removed.compressedByteLength;
      }
    }
  }

  private enforceBudget(): void {
    while (
      this.undoStack.length > 1 &&
      (this.undoStack.length > this.maxEntries || this.totalCompressedBytes > this.maxCompressedBytes)
    ) {
      const oldest = this.undoStack.shift();
      if (oldest) {
        this.totalRawBytes -= oldest.rawByteLength;
        this.totalCompressedBytes -= oldest.compressedByteLength;
        this.evictedEntryCount += 1;
      }
    }
  }
}
