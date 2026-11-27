/**
 * Wave 67 내부 무결성·저널 커널:
 * - FIPS 180-4 순수 동기 SHA-256
 * - 타일/레이어 메타데이터/매니페스트 해시 생성
 * - 해시 체인 OPFS 획 저널 서명·검증 및 결정론적 타일 재래스터화
 */

export type CanvasLayerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export interface CanvasLayerMetadata {
  readonly layerId: string;
  readonly name: string;
  readonly opacity: number;
  readonly blendMode: CanvasLayerBlendMode;
  readonly visible: boolean;
  readonly zIndex: number;
}

export interface CanvasTileRecord {
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileSize: number;
  readonly pixels: Uint8Array;
}

export interface TileManifestEntry {
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly expectedSha256: string;
  readonly byteLength: number;
  readonly lastJournalSeq: number;
}

export interface LayerManifestEntry {
  readonly layerId: string;
  readonly expectedMetadataSha256: string;
}

export interface TileIntegrityManifest {
  readonly schemaVersion: 1;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tileSize: number;
  readonly headJournalSeq: number;
  readonly layers: readonly LayerManifestEntry[];
  readonly tiles: readonly TileManifestEntry[];
  readonly manifestSha256: string;
}

export interface JournalStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
}

export interface JournalFillRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type OpfsJournalOpKind = "stroke" | "fill-rect" | "clear-layer";

export interface UnsignedOpfsJournalEntry {
  readonly seq: number;
  readonly entryId: string;
  readonly layerId: string;
  readonly op: OpfsJournalOpKind;
  readonly colorRgba: readonly [number, number, number, number];
  readonly points?: readonly JournalStrokePoint[];
  readonly rect?: JournalFillRect;
}

export interface OpfsStrokeJournalEntry extends UnsignedOpfsJournalEntry {
  readonly prevEntrySha256: string;
  readonly entrySha256: string;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const GENESIS_JOURNAL_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

function encodeUtf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(input);
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(bytes);
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * 외부 의존성과 비동기 WebCrypto 대기 없이 동작하는 순수 동기 FIPS 180-4 SHA-256 해시 함수.
 */
export function computeSyncSha256Hex(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const len = bytes.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;

  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}

export function computeTilePayloadDigest(pixels: Uint8Array): string {
  return computeSyncSha256Hex(pixels);
}

export function computeLayerMetadataDigest(meta: CanvasLayerMetadata): string {
  const canonical = JSON.stringify({
    layerId: meta.layerId,
    name: meta.name,
    opacity: Math.round(meta.opacity * 10000) / 10000,
    blendMode: meta.blendMode,
    visible: meta.visible,
    zIndex: meta.zIndex,
  });
  return computeSyncSha256Hex(`layer-meta-v1:${canonical}`);
}

export function computeManifestSelfDigest(
  canvasWidth: number,
  canvasHeight: number,
  tileSize: number,
  headJournalSeq: number,
  layers: readonly LayerManifestEntry[],
  tiles: readonly TileManifestEntry[],
): string {
  const sortedLayers = [...layers]
    .sort((a, b) => a.layerId.localeCompare(b.layerId))
    .map((l) => `${l.layerId}:${l.expectedMetadataSha256}`)
    .join("|");
  const sortedTiles = [...tiles]
    .sort((a, b) => a.tileId.localeCompare(b.tileId))
    .map((t) => `${t.tileId}:${t.expectedSha256}:${t.byteLength}:${t.lastJournalSeq}`)
    .join("|");
  return computeSyncSha256Hex(
    `manifest-v1:${canvasWidth}x${canvasHeight}:${tileSize}:${headJournalSeq}#L:${sortedLayers}#T:${sortedTiles}`,
  );
}

export function createTileIntegrityManifest(params: {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tileSize: number;
  readonly headJournalSeq: number;
  readonly layers: readonly CanvasLayerMetadata[];
  readonly tiles: readonly CanvasTileRecord[];
}): TileIntegrityManifest {
  const layerEntries: LayerManifestEntry[] = params.layers.map((layer) => ({
    layerId: layer.layerId,
    expectedMetadataSha256: computeLayerMetadataDigest(layer),
  }));
  const tileEntries: TileManifestEntry[] = params.tiles.map((tile) => ({
    tileId: tile.tileId,
    layerId: tile.layerId,
    tileX: tile.tileX,
    tileY: tile.tileY,
    expectedSha256: computeTilePayloadDigest(tile.pixels),
    byteLength: tile.pixels.byteLength,
    lastJournalSeq: params.headJournalSeq,
  }));
  return {
    schemaVersion: 1,
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    tileSize: params.tileSize,
    headJournalSeq: params.headJournalSeq,
    layers: layerEntries,
    tiles: tileEntries,
    manifestSha256: computeManifestSelfDigest(
      params.canvasWidth,
      params.canvasHeight,
      params.tileSize,
      params.headJournalSeq,
      layerEntries,
      tileEntries,
    ),
  };
}

function computeJournalEntryHash(entry: UnsignedOpfsJournalEntry, prevEntrySha256: string): string {
  const canonical = JSON.stringify({
    seq: entry.seq,
    entryId: entry.entryId,
    layerId: entry.layerId,
    op: entry.op,
    colorRgba: entry.colorRgba,
    points: entry.points ?? null,
    rect: entry.rect ?? null,
    prev: prevEntrySha256,
  });
  return computeSyncSha256Hex(`opfs-journal-v1:${canonical}`);
}

export function createSignedStrokeJournal(entries: readonly UnsignedOpfsJournalEntry[]): OpfsStrokeJournalEntry[] {
  const signed: OpfsStrokeJournalEntry[] = [];
  let prev = GENESIS_JOURNAL_HASH;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const hash = computeJournalEntryHash(e, prev);
    signed.push({ ...e, prevEntrySha256: prev, entrySha256: hash });
    prev = hash;
  }
  return signed;
}

export function verifyJournalChainIntegrity(
  journal: readonly OpfsStrokeJournalEntry[] | undefined,
  requiredUpToSeq: number,
): boolean {
  if (!journal || journal.length === 0) return requiredUpToSeq === 0;
  let prev = GENESIS_JOURNAL_HASH;
  let expectedSeq = 1;
  for (let i = 0; i < journal.length; i += 1) {
    const entry = journal[i];
    if (entry.seq !== expectedSeq || entry.prevEntrySha256 !== prev) return false;
    if (computeJournalEntryHash(entry, prev) !== entry.entrySha256) return false;
    prev = entry.entrySha256;
    expectedSeq += 1;
  }
  return journal[journal.length - 1].seq >= requiredUpToSeq;
}

function blendPixelOver(
  pixels: Uint8Array,
  idx: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number,
): void {
  if (sa <= 0) return;
  if (sa >= 255) {
    pixels[idx] = sr;
    pixels[idx + 1] = sg;
    pixels[idx + 2] = sb;
    pixels[idx + 3] = 255;
    return;
  }
  const srcA = sa / 255;
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 1e-6) return;
  pixels[idx] = Math.min(255, Math.max(0, Math.round((sr * srcA + pixels[idx] * dstA * (1 - srcA)) / outA)));
  pixels[idx + 1] = Math.min(255, Math.max(0, Math.round((sg * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA)));
  pixels[idx + 2] = Math.min(255, Math.max(0, Math.round((sb * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA)));
  pixels[idx + 3] = Math.min(255, Math.max(0, Math.round(outA * 255)));
}

function stampCircleOnTile(
  pixels: Uint8Array,
  originX: number,
  originY: number,
  tileSize: number,
  cx: number,
  cy: number,
  radius: number,
  color: readonly [number, number, number, number],
): void {
  const r = Math.max(0.5, radius);
  const rSq = r * r;
  const minX = Math.max(0, Math.floor(cx - r - originX));
  const maxX = Math.min(tileSize - 1, Math.ceil(cx + r - originX));
  const minY = Math.max(0, Math.floor(cy - r - originY));
  const maxY = Math.min(tileSize - 1, Math.ceil(cy + r - originY));
  if (minX > maxX || minY > maxY) return;

  for (let ly = minY; ly <= maxY; ly += 1) {
    const dy = originY + ly + 0.5 - cy;
    for (let lx = minX; lx <= maxX; lx += 1) {
      const dx = originX + lx + 0.5 - cx;
      if (dx * dx + dy * dy <= rSq) {
        blendPixelOver(pixels, (ly * tileSize + lx) * 4, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

/**
 * OPFS 획 저널 항목 시퀀스를 특정 타일 좌표에 결정론적으로 재실행해 RGBA 버퍼를 생성한다.
 */
export function rasterizeJournalEntriesToTile(
  entries: readonly UnsignedOpfsJournalEntry[],
  layerId: string,
  tileX: number,
  tileY: number,
  tileSize: number,
  upToSeq: number,
): { pixels: Uint8Array; appliedOps: number } {
  const pixels = new Uint8Array(tileSize * tileSize * 4);
  const originX = tileX * tileSize;
  const originY = tileY * tileSize;
  let appliedOps = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.seq > upToSeq || entry.layerId !== layerId) continue;
    appliedOps += 1;

    if (entry.op === "clear-layer") {
      pixels.fill(0);
    } else if (entry.op === "fill-rect" && entry.rect) {
      const rx0 = Math.max(0, Math.floor(entry.rect.x - originX));
      const ry0 = Math.max(0, Math.floor(entry.rect.y - originY));
      const rx1 = Math.min(tileSize, Math.ceil(entry.rect.x + entry.rect.width - originX));
      const ry1 = Math.min(tileSize, Math.ceil(entry.rect.y + entry.rect.height - originY));
      for (let ly = ry0; ly < ry1; ly += 1) {
        for (let lx = rx0; lx < rx1; lx += 1) {
          blendPixelOver(
            pixels,
            (ly * tileSize + lx) * 4,
            entry.colorRgba[0],
            entry.colorRgba[1],
            entry.colorRgba[2],
            entry.colorRgba[3],
          );
        }
      }
    } else if (entry.op === "stroke" && entry.points && entry.points.length > 0) {
      const pts = entry.points;
      if (pts.length === 1) {
        stampCircleOnTile(pixels, originX, originY, tileSize, pts[0].x, pts[0].y, pts[0].radiusPx, entry.colorRgba);
      } else {
        for (let p = 1; p < pts.length; p += 1) {
          const a = pts[p - 1];
          const b = pts[p];
          const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
          for (let s = 0; s <= steps; s += 1) {
            const t = s / steps;
            stampCircleOnTile(
              pixels,
              originX,
              originY,
              tileSize,
              a.x + (b.x - a.x) * t,
              a.y + (b.y - a.y) * t,
              a.radiusPx + (b.radiusPx - a.radiusPx) * t,
              entry.colorRgba,
            );
          }
        }
      }
    }
  }
  return { pixels, appliedOps };
}
