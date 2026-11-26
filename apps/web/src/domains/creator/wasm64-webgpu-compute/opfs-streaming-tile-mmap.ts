/**
 * 4GB+ 초대형 웹툰 원고용 OPFS `FileSystemSyncAccessHandle` 호환 가상 타일 메모리 매퍼(`OpfsStreamingTileMmap`).
 * - 64B 고정 헤더(`"TSM6"`) + 희소 타일 디렉터리(40B/슬롯) + 256×256 RGBA8(또는 델타-RLE) 페이지 슬롯
 * - `BigInt` 64비트 오프셋 주소 지정(4 GiB 초과 무손실 지원) + 타일별 FNV-1a 32비트 체크섬 검증
 * - 상한 고정 LRU 상주 캐시(기본 64타일 = 16 MiB RAM 상한) + 제로 카피 버퍼 재사용 퇴거·더티 쓰기백
 */

export const TILE_MMAP_MAGIC = "TSM6" as const;
export const TILE_MMAP_VERSION = 1 as const;
export const TILE_MMAP_HEADER_BYTES = 64 as const;
export const TILE_DIR_ENTRY_BYTES = 40 as const;
export const DEFAULT_TILE_DIM = 256 as const;
export const RGBA8_BYTES_PER_PIXEL = 4 as const;
export const DEFAULT_MAX_RESIDENT_TILES = 64 as const;
export const DEFAULT_DIRECTORY_CAPACITY = 1024 as const;
export const TILE_ENCODING_RAW = 0 as const;
export const TILE_ENCODING_DELTA_RLE = 1 as const;

const BIG_ZERO = BigInt(0);
const BIG_32 = BigInt(32);
const BIG_MASK32 = BigInt(0xffffffff);
const SPARSE_BLOCK_BYTES = 65536;
const BIG_SPARSE_BLOCK = BigInt(SPARSE_BLOCK_BYTES);

export interface SyncAccessHandleReadWriteOptions { readonly at?: number | bigint; }
export interface SyncAccessHandleLike {
  read(buffer: ArrayBufferView, options?: SyncAccessHandleReadWriteOptions): number;
  write(buffer: ArrayBufferView, options?: SyncAccessHandleReadWriteOptions): number;
  flush(): void;
  getSize(): number;
  truncate(newSize: number): void;
  close(): void;
}
export interface TileCoord { readonly layerId: number; readonly tileX: number; readonly tileY: number; }
export interface TileMmapHeader {
  readonly magic: string; readonly version: number; readonly tileDim: number; readonly bytesPerPixel: number;
  readonly pageCount: number; readonly directoryCapacity: number; readonly directoryByteOffset: bigint;
  readonly dataRegionByteOffset: bigint; readonly nextSlotByteOffset: bigint; readonly virtualDocumentBytes: bigint;
  readonly flags: number; readonly checksum: number;
}
export interface TileDirectoryEntry {
  readonly slotIndex: number; readonly layerId: number; readonly tileX: number; readonly tileY: number;
  encoding: number; byteOffset: bigint; storedByteLength: number; readonly uncompressedByteLength: number;
  fnv1aChecksum: number; generation: number;
}
export interface OpfsStreamingTileMmapOptions {
  readonly tileDim?: number; readonly maxResidentTiles?: number; readonly directoryCapacity?: number;
  readonly dataRegionBaseOffset?: bigint; readonly enableCompression?: boolean;
  readonly virtualTilesPerRow?: number; readonly virtualLayerStrideBytes?: bigint;
}
export interface TileMmapStats {
  readonly residentCount: number; readonly maxResidentTiles: number; readonly residentBytes: number;
  readonly maxResidentBytes: number; readonly allocatedPageCount: number; readonly cacheHits: number;
  readonly cacheMisses: number; readonly evictionCount: number; readonly dirtyFlushCount: number;
  readonly recycledBufferCount: number; readonly virtualDocumentBytes: bigint; readonly highestByteOffset: bigint;
}

export class TileChecksumMismatchError extends Error {
  public readonly tileKey: string;
  public readonly expectedChecksum: number;
  public readonly actualChecksum: number;
  constructor(tileKey: string, expectedChecksum: number, actualChecksum: number) {
    super(`FNV-1a mismatch for '${tileKey}': expected 0x${expectedChecksum.toString(16)}, got 0x${actualChecksum.toString(16)}`);
    this.name = "TileChecksumMismatchError";
    this.tileKey = tileKey; this.expectedChecksum = expectedChecksum; this.actualChecksum = actualChecksum;
  }
}

export function computeFnv1a32(bytes: Uint8Array, byteOffset = 0, byteLength = bytes.byteLength - byteOffset): number {
  let hash = 0x811c9dc5;
  for (let i = byteOffset, end = byteOffset + byteLength; i < end; i += 1) {
    hash = Math.imul(hash ^ bytes[i], 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
export function formatTileKey(coord: TileCoord): string { return `${coord.layerId}:${coord.tileX}:${coord.tileY}`; }

function readUint64LE(v: DataView, off: number): bigint {
  return (BigInt(v.getUint32(off + 4, true)) << BIG_32) | BigInt(v.getUint32(off, true));
}
function writeUint64LE(v: DataView, off: number, value: bigint): void {
  const safe = value < BIG_ZERO ? BIG_ZERO : value;
  v.setUint32(off, Number(safe & BIG_MASK32), true);
  v.setUint32(off + 4, Number((safe >> BIG_32) & BIG_MASK32), true);
}

function encodeTileDeltaRle(raw: Uint8Array): Uint8Array {
  const words = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >>> 2);
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < words.length; ) {
    const delta = (words[i] ^ prev) >>> 0;
    prev = words[i];
    let run = 1;
    while (run < 255 && i + run < words.length && ((words[i + run] ^ prev) >>> 0) === delta) { prev = words[i + run]; run += 1; }
    out.push(run, delta & 0xff, (delta >>> 8) & 0xff, (delta >>> 16) & 0xff, (delta >>> 24) & 0xff);
    if (out.length >= raw.byteLength) return raw;
    i += run;
  }
  return Uint8Array.from(out);
}
function decodeTileDeltaRle(encoded: Uint8Array, target: Uint8Array): void {
  const words = new Uint32Array(target.buffer, target.byteOffset, target.byteLength >>> 2);
  let prev = 0;
  for (let i = 0, w = 0; i + 4 < encoded.byteLength && w < words.length; i += 5) {
    const delta = (encoded[i + 1] | (encoded[i + 2] << 8) | (encoded[i + 3] << 16) | (encoded[i + 4] << 24)) >>> 0;
    for (let r = 0, run = encoded[i]; r < run && w < words.length; r += 1) { prev = (prev ^ delta) >>> 0; words[w] = prev; w += 1; }
  }
}

interface SparseBackingStore { readonly blocks: Map<bigint, Uint8Array>; size: bigint; }

export class InMemorySyncAccessHandle implements SyncAccessHandleLike {
  private readonly store: SparseBackingStore;
  private closed = false;
  public readOps = 0;
  public writeOps = 0;
  public flushOps = 0;

  constructor(existingStore?: SparseBackingStore) {
    this.store = existingStore ?? { blocks: new Map<bigint, Uint8Array>(), size: BIG_ZERO };
  }
  public reopen(): InMemorySyncAccessHandle { return new InMemorySyncAccessHandle(this.store); }
  public isClosed(): boolean { return this.closed; }
  public getLogicalByteSize(): bigint { return this.store.size; }
  public getAllocatedBlockCount(): number { return this.store.blocks.size; }
  public corruptByteAt(offset: bigint, xorMask = 0xff): void {
    const block = this.store.blocks.get(offset / BIG_SPARSE_BLOCK);
    if (!block) throw new RangeError(`No allocated sparse block at offset ${offset.toString()}`);
    block[Number(offset % BIG_SPARSE_BLOCK)] ^= xorMask & 0xff;
  }
  public read(buffer: ArrayBufferView, options?: SyncAccessHandleReadWriteOptions): number {
    this.ensureOpen(); this.readOps += 1;
    const dst = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const start = options?.at !== undefined ? BigInt(options.at) : BIG_ZERO;
    if (start >= this.store.size || dst.byteLength === 0) return 0;
    const avail = this.store.size - start;
    const total = avail < BigInt(dst.byteLength) ? Number(avail) : dst.byteLength;
    this.transferBlocks(dst, start, total, false);
    return total;
  }
  public write(buffer: ArrayBufferView, options?: SyncAccessHandleReadWriteOptions): number {
    this.ensureOpen(); this.writeOps += 1;
    const src = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const start = options?.at !== undefined ? BigInt(options.at) : BIG_ZERO;
    this.transferBlocks(src, start, src.byteLength, true);
    const end = start + BigInt(src.byteLength);
    if (end > this.store.size) this.store.size = end;
    return src.byteLength;
  }
  public flush(): void { this.ensureOpen(); this.flushOps += 1; }
  public getSize(): number { this.ensureOpen(); return Number(this.store.size); }
  public truncate(newSize: number): void {
    this.ensureOpen();
    this.store.size = BigInt(Math.max(0, Math.floor(newSize)));
    const keep = (this.store.size + BIG_SPARSE_BLOCK - BigInt(1)) / BIG_SPARSE_BLOCK;
    for (const bIdx of this.store.blocks.keys()) if (bIdx >= keep) this.store.blocks.delete(bIdx);
  }
  public close(): void { this.closed = true; }
  private transferBlocks(bytes: Uint8Array, start: bigint, length: number, isWrite: boolean): void {
    for (let rem = length, off = 0, cur = start; rem > 0; ) {
      const bIdx = cur / BIG_SPARSE_BLOCK;
      const bOff = Number(cur % BIG_SPARSE_BLOCK);
      const chunk = Math.min(rem, SPARSE_BLOCK_BYTES - bOff);
      let blk = this.store.blocks.get(bIdx);
      if (isWrite) {
        if (!blk) { blk = new Uint8Array(SPARSE_BLOCK_BYTES); this.store.blocks.set(bIdx, blk); }
        blk.set(bytes.subarray(off, off + chunk), bOff);
      } else if (blk) bytes.set(blk.subarray(bOff, bOff + chunk), off);
      else bytes.fill(0, off, off + chunk);
      cur += BigInt(chunk); off += chunk; rem -= chunk;
    }
  }
  private ensureOpen(): void { if (this.closed) throw new Error("SyncAccessHandle is closed"); }
}

interface ResidentTilePage { readonly key: string; readonly coord: TileCoord; readonly pixels: Uint8Array; dirty: boolean; }

export class OpfsStreamingTileMmap {
  private readonly handle: SyncAccessHandleLike;
  private readonly tileDim: number;
  private readonly tileByteLength: number;
  private readonly maxResidentTiles: number;
  private readonly directoryCapacity: number;
  private readonly enableCompression: boolean;
  private readonly virtualTilesPerRow: bigint;
  private readonly virtualLayerStrideBytes: bigint;
  private readonly directoryByteOffset = BigInt(TILE_MMAP_HEADER_BYTES);
  private dataRegionByteOffset: bigint;
  private nextSlotByteOffset: bigint;
  private virtualDocumentBytes: bigint;
  private closed = false;
  private readonly directory = new Map<string, TileDirectoryEntry>();
  private readonly residentPages = new Map<string, ResidentTilePage>();
  private readonly recycledBuffers: Uint8Array[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private evictionCount = 0;
  private dirtyFlushCount = 0;

  constructor(handle: SyncAccessHandleLike, options: OpfsStreamingTileMmapOptions = {}) {
    this.handle = handle;
    this.tileDim = options.tileDim ?? DEFAULT_TILE_DIM;
    this.tileByteLength = this.tileDim * this.tileDim * RGBA8_BYTES_PER_PIXEL;
    this.maxResidentTiles = Math.max(1, options.maxResidentTiles ?? DEFAULT_MAX_RESIDENT_TILES);
    this.directoryCapacity = Math.max(1, options.directoryCapacity ?? DEFAULT_DIRECTORY_CAPACITY);
    this.enableCompression = options.enableCompression ?? false;
    this.virtualTilesPerRow = BigInt(Math.max(1, options.virtualTilesPerRow ?? 256));
    this.virtualLayerStrideBytes = options.virtualLayerStrideBytes ?? BigInt(256 * 256) * BigInt(this.tileByteLength);
    const minDataOff = this.directoryByteOffset + BigInt(this.directoryCapacity * TILE_DIR_ENTRY_BYTES);
    const reqBase = options.dataRegionBaseOffset ?? minDataOff;
    this.dataRegionByteOffset = reqBase > minDataOff ? reqBase : minDataOff;
    this.nextSlotByteOffset = this.dataRegionByteOffset;
    this.virtualDocumentBytes = this.dataRegionByteOffset;
    if (this.handle.getSize() >= TILE_MMAP_HEADER_BYTES) this.loadExistingFile();
    else { this.writeHeader(); this.handle.flush(); }
  }

  public computeVirtualTileOffset(coord: TileCoord): bigint {
    const layerOff = BigInt(Math.max(0, coord.layerId)) * this.virtualLayerStrideBytes;
    const idx = BigInt(Math.max(0, coord.tileY)) * this.virtualTilesPerRow + BigInt(Math.max(0, coord.tileX));
    return this.dataRegionByteOffset + layerOff + idx * BigInt(this.tileByteLength);
  }
  public getHeader(): TileMmapHeader { return this.encodeHeaderBytes().header; }
  public getDirectoryEntry(coord: TileCoord): TileDirectoryEntry | undefined { return this.directory.get(formatTileKey(coord)); }
  public hasTile(coord: TileCoord): boolean { const k = formatTileKey(coord); return this.residentPages.has(k) || this.directory.has(k); }

  public writeTile(coord: TileCoord, pixels: Uint8Array): void {
    this.ensureOpen();
    if (pixels.byteLength !== this.tileByteLength) throw new RangeError(`Expected ${this.tileByteLength} bytes, got ${pixels.byteLength}`);
    const key = formatTileKey(coord);
    const existing = this.residentPages.get(key);
    if (existing) { existing.pixels.set(pixels); existing.dirty = true; this.touchLru(key, existing); }
    else {
      this.evictIfNeeded();
      const buffer = this.recycledBuffers.pop() ?? new Uint8Array(this.tileByteLength);
      buffer.set(pixels);
      this.residentPages.set(key, { key, coord, pixels: buffer, dirty: true });
    }
    const virtualEnd = this.computeVirtualTileOffset(coord) + BigInt(this.tileByteLength);
    if (virtualEnd > this.virtualDocumentBytes) this.virtualDocumentBytes = virtualEnd;
  }

  public readTile(coord: TileCoord): Uint8Array | null {
    this.ensureOpen();
    const key = formatTileKey(coord);
    const resident = this.residentPages.get(key);
    if (resident) { this.cacheHits += 1; this.touchLru(key, resident); return resident.pixels; }
    const entry = this.directory.get(key);
    if (!entry) return null;
    this.cacheMisses += 1;
    this.evictIfNeeded();
    const target = this.recycledBuffers.pop() ?? new Uint8Array(this.tileByteLength);
    if (entry.encoding === TILE_ENCODING_RAW) {
      if (this.handle.read(target, { at: entry.byteOffset }) !== entry.uncompressedByteLength) throw new Error(`Short read on raw tile '${key}'`);
    } else {
      const comp = new Uint8Array(entry.storedByteLength);
      if (this.handle.read(comp, { at: entry.byteOffset }) !== entry.storedByteLength) throw new Error(`Short read on compressed tile '${key}'`);
      decodeTileDeltaRle(comp, target);
    }
    const actual = computeFnv1a32(target);
    if (actual !== entry.fnv1aChecksum) { this.recycledBuffers.push(target); throw new TileChecksumMismatchError(key, entry.fnv1aChecksum, actual); }
    this.residentPages.set(key, { key, coord, pixels: target, dirty: false });
    return target;
  }

  public *streamReadTiles(coords: Iterable<TileCoord>): Generator<{ readonly coord: TileCoord; readonly pixels: Uint8Array }> {
    for (const coord of coords) { const pixels = this.readTile(coord); if (pixels !== null) yield { coord, pixels }; }
  }
  public flushDirtyTiles(): number {
    this.ensureOpen();
    let flushed = 0;
    for (const page of this.residentPages.values()) if (page.dirty) { this.persistResidentPage(page); flushed += 1; }
    this.writeHeader(); this.handle.flush();
    return flushed;
  }
  public close(): void {
    if (this.closed) return;
    this.flushDirtyTiles(); this.residentPages.clear(); this.recycledBuffers.length = 0; this.closed = true; this.handle.close();
  }
  public getStats(): TileMmapStats {
    return {
      residentCount: this.residentPages.size, maxResidentTiles: this.maxResidentTiles,
      residentBytes: this.residentPages.size * this.tileByteLength, maxResidentBytes: this.maxResidentTiles * this.tileByteLength,
      allocatedPageCount: this.directory.size, cacheHits: this.cacheHits, cacheMisses: this.cacheMisses,
      evictionCount: this.evictionCount, dirtyFlushCount: this.dirtyFlushCount,
      recycledBufferCount: this.recycledBuffers.length, virtualDocumentBytes: this.virtualDocumentBytes, highestByteOffset: this.nextSlotByteOffset,
    };
  }

  private touchLru(key: string, page: ResidentTilePage): void { this.residentPages.delete(key); this.residentPages.set(key, page); }
  private evictIfNeeded(): void {
    while (this.residentPages.size >= this.maxResidentTiles) {
      const oldestKey = this.residentPages.keys().next().value;
      if (oldestKey === undefined) break;
      const victim = this.residentPages.get(oldestKey);
      this.residentPages.delete(oldestKey);
      if (!victim) continue;
      if (victim.dirty) this.persistResidentPage(victim);
      this.evictionCount += 1;
      if (this.recycledBuffers.length < 4) this.recycledBuffers.push(victim.pixels);
    }
  }
  private persistResidentPage(page: ResidentTilePage): void {
    const checksum = computeFnv1a32(page.pixels);
    let payload: Uint8Array = page.pixels;
    let encoding: number = TILE_ENCODING_RAW;
    if (this.enableCompression) {
      const comp = encodeTileDeltaRle(page.pixels);
      if (comp.byteLength < page.pixels.byteLength) { payload = comp; encoding = TILE_ENCODING_DELTA_RLE; }
    }
    let entry = this.directory.get(page.key);
    if (!entry) {
      if (this.directory.size >= this.directoryCapacity) throw new Error(`Sparse tile directory capacity (${this.directoryCapacity}) exceeded`);
      entry = {
        slotIndex: this.directory.size, layerId: page.coord.layerId, tileX: page.coord.tileX, tileY: page.coord.tileY,
        encoding, byteOffset: this.nextSlotByteOffset, storedByteLength: payload.byteLength,
        uncompressedByteLength: this.tileByteLength, fnv1aChecksum: checksum, generation: 1,
      };
      this.nextSlotByteOffset += BigInt(payload.byteLength); this.directory.set(page.key, entry);
    } else {
      if (payload.byteLength > entry.storedByteLength) { entry.byteOffset = this.nextSlotByteOffset; this.nextSlotByteOffset += BigInt(payload.byteLength); }
      entry.encoding = encoding; entry.storedByteLength = payload.byteLength; entry.fnv1aChecksum = checksum; entry.generation += 1;
    }
    this.handle.write(payload, { at: entry.byteOffset });
    this.writeDirectoryEntry(entry);
    if (this.nextSlotByteOffset > this.virtualDocumentBytes) this.virtualDocumentBytes = this.nextSlotByteOffset;
    page.dirty = false; this.dirtyFlushCount += 1;
  }
  private encodeHeaderBytes(): { readonly bytes: Uint8Array; readonly header: TileMmapHeader } {
    const bytes = new Uint8Array(TILE_MMAP_HEADER_BYTES);
    const v = new DataView(bytes.buffer);
    bytes.set([0x54, 0x53, 0x4d, 0x36], 0);
    const flags = this.enableCompression ? 1 : 0;
    v.setUint32(4, TILE_MMAP_VERSION, true); v.setUint32(8, this.tileDim, true); v.setUint32(12, RGBA8_BYTES_PER_PIXEL, true);
    v.setUint32(16, this.directory.size, true); v.setUint32(20, this.directoryCapacity, true);
    writeUint64LE(v, 24, this.directoryByteOffset); writeUint64LE(v, 32, this.dataRegionByteOffset);
    writeUint64LE(v, 40, this.nextSlotByteOffset); writeUint64LE(v, 48, this.virtualDocumentBytes); v.setUint32(56, flags, true);
    const checksum = computeFnv1a32(bytes, 0, 60);
    v.setUint32(60, checksum, true);
    return {
      bytes,
      header: {
        magic: TILE_MMAP_MAGIC, version: TILE_MMAP_VERSION, tileDim: this.tileDim, bytesPerPixel: RGBA8_BYTES_PER_PIXEL,
        pageCount: this.directory.size, directoryCapacity: this.directoryCapacity, directoryByteOffset: this.directoryByteOffset,
        dataRegionByteOffset: this.dataRegionByteOffset, nextSlotByteOffset: this.nextSlotByteOffset,
        virtualDocumentBytes: this.virtualDocumentBytes, flags, checksum,
      },
    };
  }
  private writeHeader(): void { this.handle.write(this.encodeHeaderBytes().bytes, { at: BIG_ZERO }); }
  private writeDirectoryEntry(entry: TileDirectoryEntry): void {
    const buf = new Uint8Array(TILE_DIR_ENTRY_BYTES);
    const v = new DataView(buf.buffer);
    v.setInt32(0, entry.layerId, true); v.setInt32(4, entry.tileX, true); v.setInt32(8, entry.tileY, true);
    v.setUint32(12, entry.encoding, true); writeUint64LE(v, 16, entry.byteOffset);
    v.setUint32(24, entry.storedByteLength, true); v.setUint32(28, entry.uncompressedByteLength, true);
    v.setUint32(32, entry.fnv1aChecksum, true); v.setUint32(36, entry.generation, true);
    this.handle.write(buf, { at: this.directoryByteOffset + BigInt(entry.slotIndex * TILE_DIR_ENTRY_BYTES) });
  }
  private loadExistingFile(): void {
    const hdr = new Uint8Array(TILE_MMAP_HEADER_BYTES);
    this.handle.read(hdr, { at: BIG_ZERO });
    const magic = String.fromCharCode(hdr[0], hdr[1], hdr[2], hdr[3]);
    if (magic !== TILE_MMAP_MAGIC) throw new Error(`Invalid TSM6 tile mmap magic: '${magic}'`);
    const v = new DataView(hdr.buffer);
    const stored = v.getUint32(60, true), actual = computeFnv1a32(hdr, 0, 60);
    if (stored !== actual) throw new TileChecksumMismatchError("__header__", stored, actual);
    if (v.getUint32(4, true) !== TILE_MMAP_VERSION) throw new Error(`Unsupported TSM6 version: ${v.getUint32(4, true)}`);
    if (v.getUint32(8, true) !== this.tileDim) throw new Error(`Tile dimension mismatch: file=${v.getUint32(8, true)}, expected=${this.tileDim}`);
    const pageCount = v.getUint32(16, true);
    this.dataRegionByteOffset = readUint64LE(v, 32); this.nextSlotByteOffset = readUint64LE(v, 40); this.virtualDocumentBytes = readUint64LE(v, 48);
    if (pageCount === 0) return;
    const dirBuf = new Uint8Array(pageCount * TILE_DIR_ENTRY_BYTES);
    this.handle.read(dirBuf, { at: this.directoryByteOffset });
    const dv = new DataView(dirBuf.buffer);
    for (let i = 0; i < pageCount; i += 1) {
      const b = i * TILE_DIR_ENTRY_BYTES;
      const entry: TileDirectoryEntry = {
        slotIndex: i, layerId: dv.getInt32(b, true), tileX: dv.getInt32(b + 4, true), tileY: dv.getInt32(b + 8, true),
        encoding: dv.getUint32(b + 12, true), byteOffset: readUint64LE(dv, b + 16),
        storedByteLength: dv.getUint32(b + 24, true), uncompressedByteLength: dv.getUint32(b + 28, true),
        fnv1aChecksum: dv.getUint32(b + 32, true), generation: dv.getUint32(b + 36, true),
      };
      this.directory.set(formatTileKey(entry), entry);
    }
  }
  private ensureOpen(): void { if (this.closed) throw new Error("OpfsStreamingTileMmap is closed"); }
}
