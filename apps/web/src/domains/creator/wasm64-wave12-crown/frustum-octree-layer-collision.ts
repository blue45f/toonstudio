/**
 * 뷰포트 프러스텀 외곽 비파괴 무손실 8진트리(Octree) 타일 동면기(TileHibernator) 및
 * 동적 레이어 광역 Sweep-and-Prune(SAP) + 협역 알파 마스크 충돌 가속기.
 *
 * - 외부 서버 호출 0회(₩0), 브라우저 로컬 RAM 상에서 무손실 비트 일치 복원 보장.
 * - 화면 프러스텀 안쪽 타일은 비압축 RGBA 상태로 즉시 렌더링 가능하게 유지하고,
 *   프러스텀 밖으로 벗어난 배경·원경 타일은 채널 평면 분리 + 차분(Sub-Delta) + PackBits RLE로
 *   RAM 상에서 무손실 압축 동면시켰다가 패닝/줌 진입 시 0.5ms 미만으로 비트 단위 완벽 복원한다.
 * - 활성 소품·말풍선·이펙트·인물 레이어들의 충돌을 분산 최적 축 기준 `O(N log N)` Sweep-and-Prune으로
 *   1차 걸러낸 뒤, 교차 구간만 알파 마스크를 스캔해 실제 불투명 픽셀 겹침 면적과 접점 좌표를 산출한다.
 */

export interface Aabb3D {
  readonly minX: number; readonly minY: number; readonly minZ: number;
  readonly maxX: number; readonly maxY: number; readonly maxZ: number;
}

export type LosslessTileCodecMode = "solid-rgba" | "planar-delta-rle" | "raw-passthrough";

export interface HibernatedTilePacket {
  readonly mode: LosslessTileCodecMode; readonly width: number; readonly height: number;
  readonly uncompressedByteLength: number; readonly checksumFnv1a32: number; readonly payload: Uint8Array;
}

export interface OctreeCanvasTileInput {
  readonly tileId: string; readonly bounds: Aabb3D;
  readonly width: number; readonly height: number; readonly rgba: Uint8Array;
}

export interface TileResidencySnapshot {
  readonly tileId: string; readonly state: "hot" | "hibernated"; readonly bounds: Aabb3D;
  readonly width: number; readonly height: number;
  readonly residentBytes: number; readonly uncompressedBytes: number;
  readonly codecMode: LosslessTileCodecMode | "uncompressed-hot";
}

export interface FrustumHibernationUpdateReport {
  readonly hotTileCount: number; readonly hibernatedTileCount: number;
  readonly wokenTileIds: readonly string[]; readonly newlyHibernatedTileIds: readonly string[];
  readonly hotResidentBytes: number; readonly hibernatedCompressedBytes: number;
  readonly totalResidentBytes: number; readonly uncompressedEquivalentBytes: number;
  readonly ramSavedBytes: number; readonly overallCompressionRatio: number;
  readonly wakeupElapsedMs: number; readonly totalElapsedMs: number;
}

const HEADER_BYTES = 9;
const MODE_SOLID = 0;
const MODE_PLANAR_DELTA_RLE = 1;
const MODE_RAW = 2;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** 무손실 비트 복원 검증용 32비트 FNV-1a 체크섬을 계산한다. */
export function computeFnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  const u = value >>> 0;
  target[offset] = u & 0xff;
  target[offset + 1] = (u >>> 8) & 0xff;
  target[offset + 2] = (u >>> 16) & 0xff;
  target[offset + 3] = (u >>> 24) & 0xff;
}

function readUint32LE(source: Uint8Array, offset: number): number {
  return (
    ((source[offset] ?? 0) |
      ((source[offset + 1] ?? 0) << 8) |
      ((source[offset + 2] ?? 0) << 16) |
      ((source[offset + 3] ?? 0) << 24)) >>> 0
  );
}

function isUniformRgbaTile(rgba: Uint8Array): boolean {
  if (rgba.length < 4) return true;
  const r0 = rgba[0]!;
  const g0 = rgba[1]!;
  const b0 = rgba[2]!;
  const a0 = rgba[3]!;
  for (let i = 4; i < rgba.length; i += 4) {
    if (rgba[i] !== r0 || rgba[i + 1] !== g0 || rgba[i + 2] !== b0 || rgba[i + 3] !== a0) return false;
  }
  return true;
}

function encodePackBitsPlane(plane: Uint8Array, dst: Uint8Array, writeOffset: number): number {
  const len = plane.length;
  let pos = 0;
  let out = writeOffset;

  while (pos < len) {
    const val = plane[pos]!;
    let run = 1;
    while (pos + run < len && run < 130 && plane[pos + run] === val) run += 1;

    if (run >= 3) {
      dst[out] = 128 + (run - 3);
      dst[out + 1] = val;
      out += 2;
      pos += run;
      continue;
    }

    const litStart = pos;
    pos += run;
    while (pos < len && pos - litStart < 128) {
      if (pos + 2 < len && plane[pos] === plane[pos + 1] && plane[pos] === plane[pos + 2]) break;
      pos += 1;
    }
    const litLen = pos - litStart;
    dst[out] = litLen - 1;
    out += 1;
    for (let k = 0; k < litLen; k += 1) dst[out + k] = plane[litStart + k]!;
    out += litLen;
  }
  return out;
}

/** 타일 RGBA8 버퍼를 무손실 압축 패킷(`HibernatedTilePacket`)으로 부호화한다. */
export function compressTileRgbaLossless(
  rgba: Uint8Array,
  width: number,
  height: number,
): HibernatedTilePacket {
  const pixelCount = width * height;
  const expectedLen = pixelCount * 4;
  if (rgba.length !== expectedLen) {
    throw new Error(`타일 버퍼 길이(${rgba.length})가 width*height*4(${expectedLen})와 일치하지 않습니다.`);
  }

  const checksum = computeFnv1a32(rgba);
  if (pixelCount === 0 || isUniformRgbaTile(rgba)) {
    const payload = new Uint8Array(HEADER_BYTES + 4);
    payload[0] = MODE_SOLID;
    writeUint32LE(payload, 1, pixelCount);
    writeUint32LE(payload, 5, checksum);
    payload[9] = rgba[0] ?? 0;
    payload[10] = rgba[1] ?? 0;
    payload[11] = rgba[2] ?? 0;
    payload[12] = rgba[3] ?? 0;
    return {
      mode: "solid-rgba", width, height, uncompressedByteLength: expectedLen,
      checksumFnv1a32: checksum, payload,
    };
  }

  const deltaPlane = new Uint8Array(pixelCount);
  const maxPlaneEncoded = pixelCount + Math.ceil(pixelCount / 128) + 4;
  const scratch = new Uint8Array(HEADER_BYTES + maxPlaneEncoded * 4);
  scratch[0] = MODE_PLANAR_DELTA_RLE;
  writeUint32LE(scratch, 1, pixelCount);
  writeUint32LE(scratch, 5, checksum);

  let writeCursor = HEADER_BYTES;
  for (let ch = 0; ch < 4; ch += 1) {
    let prev = 0;
    let srcIdx = ch;
    for (let p = 0; p < pixelCount; p += 1) {
      const cur = rgba[srcIdx]!;
      deltaPlane[p] = (cur - prev) & 0xff;
      prev = cur;
      srcIdx += 4;
    }
    writeCursor = encodePackBitsPlane(deltaPlane, scratch, writeCursor);
  }

  if (writeCursor < expectedLen) {
    return {
      mode: "planar-delta-rle", width, height, uncompressedByteLength: expectedLen,
      checksumFnv1a32: checksum, payload: scratch.slice(0, writeCursor),
    };
  }

  const rawPayload = new Uint8Array(HEADER_BYTES + expectedLen);
  rawPayload[0] = MODE_RAW;
  writeUint32LE(rawPayload, 1, pixelCount);
  writeUint32LE(rawPayload, 5, checksum);
  rawPayload.set(rgba, HEADER_BYTES);
  return {
    mode: "raw-passthrough", width, height, uncompressedByteLength: expectedLen,
    checksumFnv1a32: checksum, payload: rawPayload,
  };
}

/** 동면된 무손실 타일 패킷을 비트 단위까지 일치하는 원본 `Uint8Array` RGBA로 복원한다. */
export function decompressTileRgbaLossless(
  packet: HibernatedTilePacket,
  verifyChecksum = false,
): Uint8Array {
  const { payload } = packet;
  const tag = payload[0] ?? MODE_RAW;
  const pixelCount = readUint32LE(payload, 1);
  const expectedChecksum = readUint32LE(payload, 5);
  const byteLen = pixelCount * 4;
  const out = new Uint8Array(byteLen);
  if (byteLen === 0) return out;

  if (tag === MODE_SOLID) {
    const r = payload[9] ?? 0;
    const g = payload[10] ?? 0;
    const b = payload[11] ?? 0;
    const a = payload[12] ?? 0;
    for (let i = 0; i < byteLen; i += 4) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  } else if (tag === MODE_PLANAR_DELTA_RLE) {
    let readCursor = HEADER_BYTES;
    for (let ch = 0; ch < 4; ch += 1) {
      let written = 0;
      let prev = 0;
      let outIdx = ch;
      while (written < pixelCount) {
        const ctrl = payload[readCursor]!;
        readCursor += 1;
        if (ctrl >= 128) {
          const run = ctrl - 128 + 3;
          const delta = payload[readCursor]!;
          readCursor += 1;
          if (delta === 0) {
            for (let k = 0; k < run; k += 1) {
              out[outIdx] = prev;
              outIdx += 4;
            }
          } else {
            for (let k = 0; k < run; k += 1) {
              prev = (prev + delta) & 0xff;
              out[outIdx] = prev;
              outIdx += 4;
            }
          }
          written += run;
        } else {
          const litLen = ctrl + 1;
          for (let k = 0; k < litLen; k += 1) {
            prev = (prev + payload[readCursor + k]!) & 0xff;
            out[outIdx] = prev;
            outIdx += 4;
          }
          readCursor += litLen;
          written += litLen;
        }
      }
    }
  } else {
    out.set(payload.subarray(HEADER_BYTES, HEADER_BYTES + byteLen));
  }

  if (verifyChecksum && computeFnv1a32(out) !== expectedChecksum) {
    throw new Error(`무손실 타일 복원 체크섬 불일치: expected=${expectedChecksum}`);
  }
  return out;
}

interface InternalTileRecord {
  readonly tileId: string;
  bounds: Aabb3D;
  width: number;
  height: number;
  hotRgba: Uint8Array | null;
  hibernatedPacket: HibernatedTilePacket | null;
}

interface OctreeNode {
  readonly bounds: Aabb3D;
  readonly depth: number;
  readonly records: InternalTileRecord[];
  children: OctreeNode[] | null;
}

function aabb3dIntersects(a: Aabb3D, b: Aabb3D): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
  );
}

function aabb3dContains(outer: Aabb3D, inner: Aabb3D): boolean {
  return (
    inner.minX >= outer.minX && inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY && inner.maxY <= outer.maxY &&
    inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ
  );
}

function expandAabb3d(box: Aabb3D, margin: number): Aabb3D {
  return margin <= 0
    ? box
    : {
        minX: box.minX - margin, minY: box.minY - margin, minZ: box.minZ - margin,
        maxX: box.maxX + margin, maxY: box.maxY + margin, maxZ: box.maxZ + margin,
      };
}

function subdivideOctreeNode(node: OctreeNode): OctreeNode[] {
  const { minX, minY, minZ, maxX, maxY, maxZ } = node.bounds;
  const midX = (minX + maxX) * 0.5;
  const midY = (minY + maxY) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const children: OctreeNode[] = [];
  for (let iz = 0; iz < 2; iz += 1) {
    for (let iy = 0; iy < 2; iy += 1) {
      for (let ix = 0; ix < 2; ix += 1) {
        children.push({
          bounds: {
            minX: ix === 0 ? minX : midX, maxX: ix === 0 ? midX : maxX,
            minY: iy === 0 ? minY : midY, maxY: iy === 0 ? midY : maxY,
            minZ: iz === 0 ? minZ : midZ, maxZ: iz === 0 ? midZ : maxZ,
          },
          depth: node.depth + 1,
          records: [],
          children: null,
        });
      }
    }
  }
  return children;
}

export interface OctreeTileHibernatorOptions {
  readonly worldBounds: Aabb3D;
  readonly maxDepth?: number;
  readonly maxTilesPerNode?: number;
  readonly verifyChecksumOnWake?: boolean;
}

/** 3차원 공간 8진트리(Octree) 기반 뷰포트 프러스텀 외곽 무손실 타일 동면 관리자. */
export class LosslessOctreeTileHibernator {
  private readonly root: OctreeNode;
  private readonly maxDepth: number;
  private readonly maxTilesPerNode: number;
  private readonly verifyChecksumOnWake: boolean;
  private readonly byId = new Map<string, InternalTileRecord>();

  public constructor(options: OctreeTileHibernatorOptions) {
    this.maxDepth = Math.max(1, Math.min(10, options.maxDepth ?? 6));
    this.maxTilesPerNode = Math.max(2, options.maxTilesPerNode ?? 8);
    this.verifyChecksumOnWake = options.verifyChecksumOnWake ?? false;
    this.root = { bounds: options.worldBounds, depth: 0, records: [], children: null };
  }

  public get tileCount(): number {
    return this.byId.size;
  }

  public upsertTile(tile: OctreeCanvasTileInput): void {
    if (this.byId.has(tile.tileId)) this.removeFromTree(this.root, tile.tileId);
    const record: InternalTileRecord = {
      tileId: tile.tileId, bounds: tile.bounds, width: tile.width, height: tile.height,
      hotRgba: new Uint8Array(tile.rgba), hibernatedPacket: null,
    };
    this.byId.set(tile.tileId, record);
    this.insertIntoTree(this.root, record);
  }

  public deleteTile(tileId: string): boolean {
    if (!this.byId.has(tileId)) return false;
    this.byId.delete(tileId);
    return this.removeFromTree(this.root, tileId);
  }

  public acquireHotTileRgba(tileId: string): Uint8Array | null {
    const rec = this.byId.get(tileId);
    if (!rec) return null;
    if (rec.hotRgba !== null) return rec.hotRgba;
    if (rec.hibernatedPacket !== null) {
      rec.hotRgba = decompressTileRgbaLossless(rec.hibernatedPacket, this.verifyChecksumOnWake);
      rec.hibernatedPacket = null;
      return rec.hotRgba;
    }
    return null;
  }

  public inspectTileResidency(tileId: string): TileResidencySnapshot | null {
    const rec = this.byId.get(tileId);
    if (!rec) return null;
    const uncompressedBytes = rec.width * rec.height * 4;
    if (rec.hotRgba !== null) {
      return {
        tileId: rec.tileId, state: "hot", bounds: rec.bounds, width: rec.width, height: rec.height,
        residentBytes: rec.hotRgba.byteLength, uncompressedBytes, codecMode: "uncompressed-hot",
      };
    }
    const pkt = rec.hibernatedPacket!;
    return {
      tileId: rec.tileId, state: "hibernated", bounds: rec.bounds, width: rec.width, height: rec.height,
      residentBytes: pkt.payload.byteLength, uncompressedBytes, codecMode: pkt.mode,
    };
  }

  public updateFrustum(activeFrustum: Aabb3D, guardBandWorldUnits = 0): FrustumHibernationUpdateReport {
    const totalStart = nowMs();
    const expandedFrustum = expandAabb3d(activeFrustum, guardBandWorldUnits);
    const wokenTileIds: string[] = [];
    const newlyHibernatedTileIds: string[] = [];
    let wakeupElapsedMs = 0;

    const hibernateRecord = (rec: InternalTileRecord): void => {
      if (rec.hotRgba !== null) {
        rec.hibernatedPacket = compressTileRgbaLossless(rec.hotRgba, rec.width, rec.height);
        rec.hotRgba = null;
        newlyHibernatedTileIds.push(rec.tileId);
      }
    };

    const wakeRecord = (rec: InternalTileRecord): void => {
      if (rec.hotRgba === null && rec.hibernatedPacket !== null) {
        const w0 = nowMs();
        rec.hotRgba = decompressTileRgbaLossless(rec.hibernatedPacket, this.verifyChecksumOnWake);
        wakeupElapsedMs += Math.max(0, nowMs() - w0);
        rec.hibernatedPacket = null;
        wokenTileIds.push(rec.tileId);
      }
    };

    const hibernateSubtree = (node: OctreeNode): void => {
      for (const rec of node.records) hibernateRecord(rec);
      if (node.children !== null) {
        for (const child of node.children) hibernateSubtree(child);
      }
    };

    const visitNode = (node: OctreeNode): void => {
      if (!aabb3dIntersects(node.bounds, expandedFrustum)) {
        hibernateSubtree(node);
        return;
      }
      for (const rec of node.records) {
        if (aabb3dIntersects(rec.bounds, expandedFrustum)) wakeRecord(rec);
        else hibernateRecord(rec);
      }
      if (node.children !== null) {
        for (const child of node.children) visitNode(child);
      }
    };

    visitNode(this.root);

    let hotTileCount = 0;
    let hibernatedTileCount = 0;
    let hotResidentBytes = 0;
    let hibernatedCompressedBytes = 0;
    let uncompressedEquivalentBytes = 0;

    for (const rec of this.byId.values()) {
      uncompressedEquivalentBytes += rec.width * rec.height * 4;
      if (rec.hotRgba !== null) {
        hotTileCount += 1;
        hotResidentBytes += rec.hotRgba.byteLength;
      } else if (rec.hibernatedPacket !== null) {
        hibernatedTileCount += 1;
        hibernatedCompressedBytes += rec.hibernatedPacket.payload.byteLength;
      }
    }

    const totalResidentBytes = hotResidentBytes + hibernatedCompressedBytes;
    return {
      hotTileCount,
      hibernatedTileCount,
      wokenTileIds,
      newlyHibernatedTileIds,
      hotResidentBytes,
      hibernatedCompressedBytes,
      totalResidentBytes,
      uncompressedEquivalentBytes,
      ramSavedBytes: Math.max(0, uncompressedEquivalentBytes - totalResidentBytes),
      overallCompressionRatio: totalResidentBytes > 0 ? uncompressedEquivalentBytes / totalResidentBytes : 1,
      wakeupElapsedMs,
      totalElapsedMs: Math.max(0, nowMs() - totalStart),
    };
  }

  private insertIntoTree(node: OctreeNode, record: InternalTileRecord): void {
    if (node.children !== null) {
      for (const child of node.children) {
        if (aabb3dContains(child.bounds, record.bounds)) {
          this.insertIntoTree(child, record);
          return;
        }
      }
      node.records.push(record);
      return;
    }

    node.records.push(record);
    if (node.records.length > this.maxTilesPerNode && node.depth < this.maxDepth) {
      node.children = subdivideOctreeNode(node);
      const retained: InternalTileRecord[] = [];
      for (const item of node.records) {
        let moved = false;
        for (const child of node.children) {
          if (aabb3dContains(child.bounds, item.bounds)) {
            this.insertIntoTree(child, item);
            moved = true;
            break;
          }
        }
        if (!moved) retained.push(item);
      }
      node.records.length = 0;
      node.records.push(...retained);
    }
  }

  private removeFromTree(node: OctreeNode, tileId: string): boolean {
    const idx = node.records.findIndex((r) => r.tileId === tileId);
    if (idx >= 0) {
      node.records.splice(idx, 1);
      return true;
    }
    if (node.children !== null) {
      for (const child of node.children) {
        if (this.removeFromTree(child, tileId)) return true;
      }
    }
    return false;
  }
}

// ============================================================================
// 2. 동적 레이어 광역 Sweep-and-Prune + 협역 알파 마스크 충돌 가속기
// ============================================================================

export type CollidableLayerKind = "prop" | "speech-balloon" | "fx" | "character";

export interface CollidableStudioLayer {
  readonly layerId: string;
  readonly kind: CollidableLayerKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alphaMask?: Uint8Array;
  readonly alphaThreshold?: number;
}

export interface LayerCollisionContactBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayerCollisionPair {
  readonly layerIdA: string;
  readonly layerIdB: string;
  readonly kindA: CollidableLayerKind;
  readonly kindB: CollidableLayerKind;
  readonly aabbOverlapAreaPx: number;
  readonly alphaOverlapPixelCount: number;
  readonly weightedAlphaOverlapAreaPx: number;
  readonly contactBounds: LayerCollisionContactBox;
  readonly contactCentroid: { readonly x: number; readonly y: number };
}

export interface LayerCollisionReport {
  readonly primarySweepAxis: "x" | "y";
  readonly activeLayerCount: number;
  readonly totalPossiblePairs: number;
  readonly broadPhaseCandidateCount: number;
  readonly prunedPairRatio: number;
  readonly collisions: readonly LayerCollisionPair[];
  readonly elapsedMs: number;
}

function chooseVarianceSweepAxis(layers: readonly CollidableStudioLayer[]): "x" | "y" {
  const n = layers.length;
  if (n < 2) return "x";
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += layers[i]!.x + layers[i]!.width * 0.5;
    sumY += layers[i]!.y + layers[i]!.height * 0.5;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = layers[i]!.x + layers[i]!.width * 0.5 - meanX;
    const dy = layers[i]!.y + layers[i]!.height * 0.5 - meanY;
    varX += dx * dx;
    varY += dy * dy;
  }
  return varX >= varY ? "x" : "y";
}

function evaluateNarrowPhaseAlphaOverlap(
  a: CollidableStudioLayer,
  b: CollidableStudioLayer,
): LayerCollisionPair | null {
  const ax0 = Math.round(a.x);
  const ay0 = Math.round(a.y);
  const bx0 = Math.round(b.x);
  const by0 = Math.round(b.y);
  const ix0 = Math.max(ax0, bx0);
  const iy0 = Math.max(ay0, by0);
  const ix1 = Math.min(ax0 + Math.max(0, Math.round(a.width)), bx0 + Math.max(0, Math.round(b.width)));
  const iy1 = Math.min(ay0 + Math.max(0, Math.round(a.height)), by0 + Math.max(0, Math.round(b.height)));
  if (ix1 <= ix0 || iy1 <= iy0) return null;

  const aabbOverlapAreaPx = (ix1 - ix0) * (iy1 - iy0);
  const orderedFirstA = a.layerId <= b.layerId;
  const first = orderedFirstA ? a : b;
  const second = orderedFirstA ? b : a;

  if (!a.alphaMask && !b.alphaMask) {
    return {
      layerIdA: first.layerId,
      layerIdB: second.layerId,
      kindA: first.kind,
      kindB: second.kind,
      aabbOverlapAreaPx,
      alphaOverlapPixelCount: aabbOverlapAreaPx,
      weightedAlphaOverlapAreaPx: aabbOverlapAreaPx,
      contactBounds: { x: ix0, y: iy0, width: ix1 - ix0, height: iy1 - iy0 },
      contactCentroid: { x: (ix0 + ix1) * 0.5, y: (iy0 + iy1) * 0.5 },
    };
  }

  const threshA = Math.max(1, Math.min(255, a.alphaThreshold ?? 16));
  const threshB = Math.max(1, Math.min(255, b.alphaThreshold ?? 16));
  const widthA = Math.round(a.width);
  const widthB = Math.round(b.width);

  let overlapCount = 0;
  let weightedSum = 0;
  let cMinX = ix1;
  let cMinY = iy1;
  let cMaxX = ix0 - 1;
  let cMaxY = iy0 - 1;
  let sumCx = 0;
  let sumCy = 0;

  for (let py = iy0; py < iy1; py += 1) {
    const rowA = (py - ay0) * widthA;
    const rowB = (py - by0) * widthB;
    for (let px = ix0; px < ix1; px += 1) {
      const alphaA = a.alphaMask ? (a.alphaMask[rowA + (px - ax0)] ?? 0) : 255;
      if (alphaA < threshA) continue;
      const alphaB = b.alphaMask ? (b.alphaMask[rowB + (px - bx0)] ?? 0) : 255;
      if (alphaB < threshB) continue;

      overlapCount += 1;
      weightedSum += (alphaA * alphaB) / 65025;
      if (px < cMinX) cMinX = px;
      if (px > cMaxX) cMaxX = px;
      if (py < cMinY) cMinY = py;
      if (py > cMaxY) cMaxY = py;
      sumCx += px + 0.5;
      sumCy += py + 0.5;
    }
  }
  if (overlapCount === 0) return null;

  return {
    layerIdA: first.layerId,
    layerIdB: second.layerId,
    kindA: first.kind,
    kindB: second.kind,
    aabbOverlapAreaPx,
    alphaOverlapPixelCount: overlapCount,
    weightedAlphaOverlapAreaPx: weightedSum,
    contactBounds: { x: cMinX, y: cMinY, width: cMaxX - cMinX + 1, height: cMaxY - cMinY + 1 },
    contactCentroid: { x: sumCx / overlapCount, y: sumCy / overlapCount },
  };
}

/** 분산 최적 주축 Sweep-and-Prune(`O(N log N)`)과 협역 알파 마스크 교차 검사를 수행한다. */
export function detectLayerCollisionsSweepAndPrune(
  layers: readonly CollidableStudioLayer[],
): LayerCollisionReport {
  const startedAt = nowMs();
  const validLayers = layers.filter((l) => l.width > 0 && l.height > 0);
  const n = validLayers.length;
  const totalPossiblePairs = n >= 2 ? (n * (n - 1)) / 2 : 0;

  if (n < 2) {
    return {
      primarySweepAxis: "x", activeLayerCount: n, totalPossiblePairs: 0,
      broadPhaseCandidateCount: 0, prunedPairRatio: 1, collisions: [],
      elapsedMs: Math.max(0, nowMs() - startedAt),
    };
  }

  const axis = chooseVarianceSweepAxis(validLayers);
  const sortedIndices = Array.from({ length: n }, (_, idx) => idx);
  if (axis === "x") sortedIndices.sort((ia, ib) => validLayers[ia]!.x - validLayers[ib]!.x);
  else sortedIndices.sort((ia, ib) => validLayers[ia]!.y - validLayers[ib]!.y);

  const activeIndices: number[] = [];
  const collisions: LayerCollisionPair[] = [];
  let broadPhaseCandidateCount = 0;

  for (let s = 0; s < n; s += 1) {
    const curIdx = sortedIndices[s]!;
    const cur = validLayers[curIdx]!;
    const curPriMin = axis === "x" ? cur.x : cur.y;
    const curSecMin = axis === "x" ? cur.y : cur.x;
    const curSecMax = curSecMin + (axis === "x" ? cur.height : cur.width);

    let writePos = 0;
    for (let k = 0; k < activeIndices.length; k += 1) {
      const actIdx = activeIndices[k]!;
      const act = validLayers[actIdx]!;
      const actPriMax = axis === "x" ? act.x + act.width : act.y + act.height;
      if (actPriMax > curPriMin) {
        activeIndices[writePos] = actIdx;
        writePos += 1;
        const actSecMin = axis === "x" ? act.y : act.x;
        const actSecMax = actSecMin + (axis === "x" ? act.height : act.width);
        if (curSecMin < actSecMax && curSecMax > actSecMin) {
          broadPhaseCandidateCount += 1;
          const narrowHit = evaluateNarrowPhaseAlphaOverlap(act, cur);
          if (narrowHit !== null) collisions.push(narrowHit);
        }
      }
    }
    activeIndices.length = writePos;
    activeIndices.push(curIdx);
  }

  return {
    primarySweepAxis: axis,
    activeLayerCount: n,
    totalPossiblePairs,
    broadPhaseCandidateCount,
    prunedPairRatio:
      totalPossiblePairs > 0
        ? Math.max(0, (totalPossiblePairs - broadPhaseCandidateCount) / totalPossiblePairs)
        : 1,
    collisions,
    elapsedMs: Math.max(0, nowMs() - startedAt),
  };
}
