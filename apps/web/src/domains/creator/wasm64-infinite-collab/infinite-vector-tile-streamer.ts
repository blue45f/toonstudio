/**
 * 무한 캔버스 쿼드트리/공간해시 LOD(0..4) 스트리머 및 OPFS 16GiB+ 가상 타일 상주 관리자.
 *
 * - 뷰포트 `(x, y, zoom, viewportW, viewportH)`와 이동 속도를 분석해 LOD `0..4` 가시 타일 집합과
 *   진행 방향 비대칭 예측 프리페치 링을 계산한다.
 * - `OpfsStreamingTileMmap`과 직접 연동해 8K×120K 초대형 웹툰 원고 및 음수 좌표 무한 영역을
 *   16 GiB+ 가상 오프셋으로 주소 지정하고, GPU/CPU 엄격한 LRU 상주 상한으로 OOM을 방지한다.
 * - 타일별 벡터 정점 밀도와 LOD 임계값에 따라 `vector-full` → `vector-simplified`(RDP) →
 *   `raster-tile-fallback` 하이브리드 렌더링 전략을 자동 전환한다.
 */

import {
  DEFAULT_TILE_DIM,
  InMemorySyncAccessHandle,
  OpfsStreamingTileMmap,
  RGBA8_BYTES_PER_PIXEL,
  computeFnv1a32,
  type OpfsStreamingTileMmapOptions,
  type TileCoord,
  type TileMmapStats,
} from "../wasm64-webgpu-compute/opfs-streaming-tile-mmap";
import type { HeapZeroGcObjectPool } from "./heap-zero-gc-object-pool";

export const INFINITE_MIN_LOD = 0 as const;
export const INFINITE_MAX_LOD = 4 as const;
export const DEFAULT_GPU_RESIDENT_TILES = 32;
export const DEFAULT_CPU_RESIDENT_TILES = 64;
export const DEFAULT_MAX_RESIDENT_BYTES = 24 * 1024 * 1024;
export const DEFAULT_PREFETCH_LOOKAHEAD_MS = 250;
export const DEFAULT_MAX_PREFETCH_LEAD_TILES = 4;
export const DEFAULT_VECTOR_TO_RASTER_VERTEX_THRESHOLD = 4096;
export const DEFAULT_RASTER_FALLBACK_MIN_LOD = 3 as const;
export const DEFAULT_RASTER_FALLBACK_ZOOM_THRESHOLD = 0.22;

const BIG_GIB = BigInt(1024) * BigInt(1024) * BigInt(1024);
const DEFAULT_VIRTUAL_LAYER_STRIDE = BigInt(4) * BIG_GIB;
const QUADTREE_MAX_DEPTH = 6;
const QUADTREE_SPLIT_THRESHOLD = 8;
const SECTOR_WORLD_SPAN = 4096;

export type InfiniteLodLevel = 0 | 1 | 2 | 3 | 4;
export type TileRenderStrategy = "vector-full" | "vector-simplified" | "raster-tile-fallback";
export type TileResidencyTier = "gpu" | "cpu" | "opfs-only";

export interface InfiniteViewportState {
  readonly x: number; readonly y: number; readonly zoom: number;
  readonly viewportW: number; readonly viewportH: number;
  readonly velocityX?: number; readonly velocityY?: number; readonly timestampMs?: number;
}
export interface InfiniteTileId {
  readonly layerId: number; readonly lod: InfiniteLodLevel; readonly tileX: number; readonly tileY: number;
}
export interface WorldRect {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
}
export interface InfiniteVectorEntity extends WorldRect {
  readonly id: string; readonly layerId: number; readonly points: Float32Array;
  readonly pointStride?: number; readonly strokeWidth: number; readonly styleHash?: number;
}
export interface SimplifiedVectorEntity {
  readonly entityId: string; readonly rawVertexCount: number; readonly simplifiedVertexCount: number;
  readonly points: Float32Array;
}
export interface StreamedTileDescriptor {
  readonly key: string; readonly id: InfiniteTileId; readonly worldBounds: WorldRect;
  readonly residency: TileResidencyTier; readonly strategy: TileRenderStrategy;
  readonly isPrefetch: boolean; readonly priorityScore: number;
  readonly rawVectorVertices: number; readonly simplifiedVectorVertices: number;
  readonly simplifiedEntities: readonly SimplifiedVectorEntity[];
  readonly hasRasterPixels: boolean; readonly virtualByteOffset: bigint;
}
export interface InfiniteStreamerTelemetry {
  readonly activeLod: InfiniteLodLevel; readonly visibleTileCount: number; readonly prefetchTileCount: number;
  readonly gpuResidentCount: number; readonly cpuResidentCount: number;
  readonly residentBytes: number; readonly peakResidentBytes: number; readonly maxResidentBytes: number;
  readonly evictionCount: number; readonly opfsSpillCount: number; readonly opfsReloadCount: number;
  readonly vectorFullTiles: number; readonly vectorSimplifiedTiles: number; readonly rasterFallbackTiles: number;
  readonly totalRawVerticesEvaluated: number; readonly totalSimplifiedVerticesEmitted: number;
  readonly highestVirtualByteOffset: bigint; readonly opfsStats: TileMmapStats;
}
export interface ViewportStreamPlan {
  readonly lod: InfiniteLodLevel; readonly zoom: number; readonly velocityX: number; readonly velocityY: number;
  readonly visibleBounds: WorldRect;
  readonly visibleTiles: readonly StreamedTileDescriptor[];
  readonly prefetchTiles: readonly StreamedTileDescriptor[];
  readonly evictedKeys: readonly string[];
  readonly telemetry: InfiniteStreamerTelemetry;
}
export interface InfiniteVectorTileStreamerOptions {
  readonly tileDim?: number; readonly maxGpuResidentTiles?: number; readonly maxCpuResidentTiles?: number;
  readonly maxResidentBytes?: number; readonly prefetchBaseRing?: number; readonly prefetchLookaheadMs?: number;
  readonly maxPrefetchLeadTiles?: number; readonly lodHysteresis?: number; readonly baseScreenErrorPx?: number;
  readonly vectorToRasterVertexThreshold?: number; readonly rasterFallbackMinLod?: InfiniteLodLevel;
  readonly rasterFallbackZoomThreshold?: number; readonly mmap?: OpfsStreamingTileMmap;
  readonly mmapOptions?: OpfsStreamingTileMmapOptions; readonly objectPool?: HeapZeroGcObjectPool;
}

interface ResidentTileRecord {
  readonly key: string; readonly id: InfiniteTileId; readonly packedCoord: TileCoord;
  tier: "gpu" | "cpu"; pixels: Uint8Array; dirty: boolean; persisted: boolean;
  checksum: number; lastAccessTick: number;
}
interface QuadNode {
  readonly bounds: WorldRect; readonly depth: number;
  readonly entities: InfiniteVectorEntity[]; children: [QuadNode, QuadNode, QuadNode, QuadNode] | null;
}

const rectsOverlap = (a: WorldRect, b: WorldRect): boolean =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

export function zigzagEncodeInt(value: number): number {
  const n = Math.trunc(value);
  return n >= 0 ? n * 2 : (-n) * 2 - 1;
}
export function zigzagDecodeInt(encoded: number): number {
  const n = Math.trunc(encoded);
  return (n & 1) === 0 ? n / 2 : -((n + 1) / 2);
}
export function encodeInfiniteTileCoord(id: InfiniteTileId): TileCoord {
  return { layerId: Math.max(0, Math.trunc(id.layerId)) * 8 + id.lod, tileX: zigzagEncodeInt(id.tileX), tileY: zigzagEncodeInt(id.tileY) };
}
export function decodeInfiniteTileCoord(coord: TileCoord): InfiniteTileId {
  const lod = (coord.layerId & 7) as InfiniteLodLevel;
  return {
    layerId: coord.layerId >>> 3,
    lod: lod > INFINITE_MAX_LOD ? INFINITE_MAX_LOD : lod,
    tileX: zigzagDecodeInt(coord.tileX),
    tileY: zigzagDecodeInt(coord.tileY),
  };
}
export function formatInfiniteTileKey(id: InfiniteTileId): string {
  return `L${id.layerId}:Z${id.lod}:${id.tileX}:${id.tileY}`;
}

/** 현재 줌 배율과 히스테리시스로부터 이산 LOD `0..4`를 계산한다. */
export function computeLodForZoom(zoom: number, previousLod?: InfiniteLodLevel, hysteresis = 0.08): InfiniteLodLevel {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const thresholds: readonly number[] = [0.75, 0.375, 0.1875, 0.09375];
  let rawLod: InfiniteLodLevel = 4;
  if (safeZoom >= thresholds[0]!) rawLod = 0;
  else if (safeZoom >= thresholds[1]!) rawLod = 1;
  else if (safeZoom >= thresholds[2]!) rawLod = 2;
  else if (safeZoom >= thresholds[3]!) rawLod = 3;
  if (previousLod === undefined || previousLod === rawLod || hysteresis <= 0) return rawLod;
  const h = Math.min(0.25, hysteresis);
  if (rawLod > previousLod) {
    const boundary = thresholds[previousLod];
    if (boundary !== undefined && safeZoom > boundary * (1 - h)) return previousLod;
  } else {
    const boundary = thresholds[previousLod - 1];
    if (boundary !== undefined && safeZoom < boundary * (1 + h)) return previousLod;
  }
  return rawLod;
}

/** 반복형 Ramer-Douglas-Peucker 단순화(`[x, y]` 평탄 출력). */
export function simplifyPolylineRdp(points: Float32Array, tolerance: number, stride = 2): Float32Array {
  const safeStride = Math.max(2, Math.trunc(stride));
  const vertexCount = Math.floor(points.length / safeStride);
  if (vertexCount <= 2 || !Number.isFinite(tolerance) || tolerance <= 0) {
    if (safeStride === 2) return points.slice(0, vertexCount * 2);
    const copy = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertexCount; i += 1) {
      copy[i * 2] = points[i * safeStride]!;
      copy[i * 2 + 1] = points[i * safeStride + 1]!;
    }
    return copy;
  }

  const tolSq = tolerance * tolerance;
  const keep = new Uint8Array(vertexCount);
  keep[0] = 1; keep[vertexCount - 1] = 1;
  const stackStart = [0];
  const stackEnd = [vertexCount - 1];

  while (stackStart.length > 0) {
    const startIdx = stackStart.pop()!;
    const endIdx = stackEnd.pop()!;
    if (endIdx - startIdx <= 1) continue;
    const ax = points[startIdx * safeStride]!;
    const ay = points[startIdx * safeStride + 1]!;
    const dx = points[endIdx * safeStride]! - ax;
    const dy = points[endIdx * safeStride + 1]! - ay;
    const lenSq = dx * dx + dy * dy;

    let maxDistSq = -1;
    let splitIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const px = points[i * safeStride]!;
      const py = points[i * safeStride + 1]!;
      const t = lenSq <= 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const vx = px - (ax + t * dx);
      const vy = py - (ay + t * dy);
      const distSq = vx * vx + vy * vy;
      if (distSq > maxDistSq) { maxDistSq = distSq; splitIdx = i; }
    }
    if (splitIdx > 0 && maxDistSq > tolSq) {
      keep[splitIdx] = 1;
      stackStart.push(startIdx, splitIdx);
      stackEnd.push(splitIdx, endIdx);
    }
  }

  let keptCount = 0;
  for (let i = 0; i < vertexCount; i += 1) keptCount += keep[i]!;
  const out = new Float32Array(keptCount * 2);
  let w = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    if (keep[i] === 1) { out[w] = points[i * safeStride]!; out[w + 1] = points[i * safeStride + 1]!; w += 2; }
  }
  return out;
}

/** 무한 공간 섹터 해시 + 섹터 내부 쿼드트리 하이브리드 공간 색인. */
export class InfiniteVectorQuadtreeIndex {
  private readonly sectors = new Map<string, QuadNode>();
  private readonly entitiesById = new Map<string, { entity: InfiniteVectorEntity; sectorKeys: string[] }>();

  get entityCount(): number { return this.entitiesById.size; }
  get sectorCount(): number { return this.sectors.size; }

  insert(entity: InfiniteVectorEntity): void {
    if (this.entitiesById.has(entity.id)) this.remove(entity.id);
    const minSx = Math.floor(entity.minX / SECTOR_WORLD_SPAN);
    const maxSx = Math.floor(entity.maxX / SECTOR_WORLD_SPAN);
    const minSy = Math.floor(entity.minY / SECTOR_WORLD_SPAN);
    const maxSy = Math.floor(entity.maxY / SECTOR_WORLD_SPAN);
    const sectorKeys: string[] = [];
    for (let sy = minSy; sy <= maxSy; sy += 1) {
      for (let sx = minSx; sx <= maxSx; sx += 1) {
        const key = `${entity.layerId}:${sx}:${sy}`;
        let root = this.sectors.get(key);
        if (!root) {
          root = {
            bounds: { minX: sx * SECTOR_WORLD_SPAN, minY: sy * SECTOR_WORLD_SPAN, maxX: (sx + 1) * SECTOR_WORLD_SPAN, maxY: (sy + 1) * SECTOR_WORLD_SPAN },
            depth: 0, entities: [], children: null,
          };
          this.sectors.set(key, root);
        }
        this.insertIntoNode(root, entity);
        sectorKeys.push(key);
      }
    }
    this.entitiesById.set(entity.id, { entity, sectorKeys });
  }

  remove(entityId: string): boolean {
    const rec = this.entitiesById.get(entityId);
    if (!rec) return false;
    for (const key of rec.sectorKeys) {
      const root = this.sectors.get(key);
      if (root) this.removeFromNode(root, entityId);
    }
    this.entitiesById.delete(entityId);
    return true;
  }

  query(bounds: WorldRect, layerId?: number): InfiniteVectorEntity[] {
    const seen = new Set<string>();
    const results: InfiniteVectorEntity[] = [];
    if (layerId !== undefined) {
      const minSx = Math.floor(bounds.minX / SECTOR_WORLD_SPAN);
      const maxSx = Math.floor(bounds.maxX / SECTOR_WORLD_SPAN);
      const minSy = Math.floor(bounds.minY / SECTOR_WORLD_SPAN);
      const maxSy = Math.floor(bounds.maxY / SECTOR_WORLD_SPAN);
      for (let sy = minSy; sy <= maxSy; sy += 1) {
        for (let sx = minSx; sx <= maxSx; sx += 1) {
          const root = this.sectors.get(`${layerId}:${sx}:${sy}`);
          if (root) this.queryNode(root, bounds, seen, results);
        }
      }
      return results;
    }
    for (const root of this.sectors.values()) {
      if (rectsOverlap(root.bounds, bounds)) this.queryNode(root, bounds, seen, results);
    }
    return results;
  }

  private insertIntoNode(node: QuadNode, entity: InfiniteVectorEntity): void {
    if (!rectsOverlap(node.bounds, entity)) return;
    if (node.children === null) {
      node.entities.push(entity);
      if (node.entities.length > QUADTREE_SPLIT_THRESHOLD && node.depth < QUADTREE_MAX_DEPTH) this.subdivideNode(node);
      return;
    }
    for (let i = 0; i < 4; i += 1) if (rectsOverlap(node.children[i]!.bounds, entity)) this.insertIntoNode(node.children[i]!, entity);
  }

  private subdivideNode(node: QuadNode): void {
    const midX = (node.bounds.minX + node.bounds.maxX) * 0.5;
    const midY = (node.bounds.minY + node.bounds.maxY) * 0.5;
    const d = node.depth + 1;
    const c: [QuadNode, QuadNode, QuadNode, QuadNode] = [
      { bounds: { minX: node.bounds.minX, minY: node.bounds.minY, maxX: midX, maxY: midY }, depth: d, entities: [], children: null },
      { bounds: { minX: midX, minY: node.bounds.minY, maxX: node.bounds.maxX, maxY: midY }, depth: d, entities: [], children: null },
      { bounds: { minX: node.bounds.minX, minY: midY, maxX: midX, maxY: node.bounds.maxY }, depth: d, entities: [], children: null },
      { bounds: { minX: midX, minY: midY, maxX: node.bounds.maxX, maxY: node.bounds.maxY }, depth: d, entities: [], children: null },
    ];
    node.children = c;
    for (const item of node.entities.splice(0, node.entities.length)) {
      for (let i = 0; i < 4; i += 1) if (rectsOverlap(c[i]!.bounds, item)) this.insertIntoNode(c[i]!, item);
    }
  }

  private removeFromNode(node: QuadNode, entityId: string): void {
    for (let i = node.entities.length - 1; i >= 0; i -= 1) if (node.entities[i]?.id === entityId) node.entities.splice(i, 1);
    if (node.children) for (let i = 0; i < 4; i += 1) this.removeFromNode(node.children[i]!, entityId);
  }

  private queryNode(node: QuadNode, bounds: WorldRect, seen: Set<string>, out: InfiniteVectorEntity[]): void {
    if (!rectsOverlap(node.bounds, bounds)) return;
    for (const e of node.entities) {
      if (!seen.has(e.id) && rectsOverlap(e, bounds)) { seen.add(e.id); out.push(e); }
    }
    if (node.children) for (let i = 0; i < 4; i += 1) this.queryNode(node.children[i]!, bounds, seen, out);
  }
}

export class InfiniteVectorTileStreamer {
  readonly tileDim: number;
  readonly tileByteLength: number;
  readonly maxGpuResidentTiles: number;
  readonly maxCpuResidentTiles: number;
  readonly maxResidentBytes: number;
  readonly mmap: OpfsStreamingTileMmap;
  readonly vectorIndex = new InfiniteVectorQuadtreeIndex();

  private readonly ownsMmap: boolean;
  private readonly objectPool: HeapZeroGcObjectPool | null;
  private readonly prefetchBaseRing: number;
  private readonly prefetchLookaheadMs: number;
  private readonly maxPrefetchLeadTiles: number;
  private readonly lodHysteresis: number;
  private readonly baseScreenErrorPx: number;
  private readonly vectorToRasterVertexThreshold: number;
  private readonly rasterFallbackMinLod: InfiniteLodLevel;
  private readonly rasterFallbackZoomThreshold: number;
  private readonly gpuResident = new Map<string, ResidentTileRecord>();
  private readonly cpuResident = new Map<string, ResidentTileRecord>();
  private readonly recycledTiles: Uint8Array[] = [];

  private activeLod: InfiniteLodLevel = 0;
  private accessTick = 0;
  private lastViewport: InfiniteViewportState | null = null;
  private smoothedVx = 0;
  private smoothedVy = 0;
  private peakResidentBytes = 0;
  private evictionCount = 0;
  private opfsSpillCount = 0;
  private opfsReloadCount = 0;
  private highestVirtualByteOffset = BigInt(0);

  constructor(options: InfiniteVectorTileStreamerOptions = {}) {
    this.tileDim = options.tileDim ?? DEFAULT_TILE_DIM;
    this.tileByteLength = this.tileDim * this.tileDim * RGBA8_BYTES_PER_PIXEL;
    this.maxGpuResidentTiles = Math.max(1, options.maxGpuResidentTiles ?? DEFAULT_GPU_RESIDENT_TILES);
    this.maxCpuResidentTiles = Math.max(1, options.maxCpuResidentTiles ?? DEFAULT_CPU_RESIDENT_TILES);
    this.maxResidentBytes = Math.max(this.tileByteLength * 2, options.maxResidentBytes ?? DEFAULT_MAX_RESIDENT_BYTES);
    this.prefetchBaseRing = Math.max(0, options.prefetchBaseRing ?? 1);
    this.prefetchLookaheadMs = Math.max(0, options.prefetchLookaheadMs ?? DEFAULT_PREFETCH_LOOKAHEAD_MS);
    this.maxPrefetchLeadTiles = Math.max(0, options.maxPrefetchLeadTiles ?? DEFAULT_MAX_PREFETCH_LEAD_TILES);
    this.lodHysteresis = options.lodHysteresis ?? 0.08;
    this.baseScreenErrorPx = options.baseScreenErrorPx ?? 0.75;
    this.vectorToRasterVertexThreshold = options.vectorToRasterVertexThreshold ?? DEFAULT_VECTOR_TO_RASTER_VERTEX_THRESHOLD;
    this.rasterFallbackMinLod = options.rasterFallbackMinLod ?? DEFAULT_RASTER_FALLBACK_MIN_LOD;
    this.rasterFallbackZoomThreshold = options.rasterFallbackZoomThreshold ?? DEFAULT_RASTER_FALLBACK_ZOOM_THRESHOLD;
    this.objectPool = options.objectPool ?? null;

    if (options.mmap) {
      this.mmap = options.mmap;
      this.ownsMmap = false;
    } else {
      this.mmap = new OpfsStreamingTileMmap(new InMemorySyncAccessHandle(), {
        tileDim: this.tileDim, maxResidentTiles: Math.min(32, this.maxCpuResidentTiles),
        directoryCapacity: 4096, enableCompression: true, virtualTilesPerRow: 1024,
        virtualLayerStrideBytes: DEFAULT_VIRTUAL_LAYER_STRIDE, ...options.mmapOptions,
      });
      this.ownsMmap = true;
    }
  }

  registerVectorEntity(entity: InfiniteVectorEntity): void { this.vectorIndex.insert(entity); }
  unregisterVectorEntity(entityId: string): boolean { return this.vectorIndex.remove(entityId); }
  getResidentBytes(): number { return (this.gpuResident.size + this.cpuResident.size) * this.tileByteLength; }

  writeRasterTile(id: InfiniteTileId, pixels: Uint8Array, pinToGpu = true): bigint {
    if (pixels.byteLength !== this.tileByteLength) throw new RangeError(`Expected ${this.tileByteLength}B tile pixels, got ${pixels.byteLength}B`);
    const key = formatInfiniteTileKey(id);
    const packedCoord = encodeInfiniteTileCoord(id);
    const vOffset = this.mmap.computeVirtualTileOffset(packedCoord);
    if (vOffset > this.highestVirtualByteOffset) this.highestVirtualByteOffset = vOffset;
    const checksum = computeFnv1a32(pixels);

    let rec = this.gpuResident.get(key) ?? this.cpuResident.get(key);
    if (rec) {
      rec.pixels.set(pixels); rec.dirty = true; rec.checksum = checksum;
      this.touchRecord(rec, pinToGpu ? "gpu" : rec.tier);
    } else {
      const buf = this.allocateTileBuffer();
      buf.set(pixels);
      rec = { key, id, packedCoord, tier: pinToGpu ? "gpu" : "cpu", pixels: buf, dirty: true, persisted: false, checksum, lastAccessTick: ++this.accessTick };
      if (pinToGpu) this.gpuResident.set(key, rec); else this.cpuResident.set(key, rec);
    }
    this.enforceResidencyCaps(new Set<string>([key]));
    return vOffset;
  }

  readRasterTile(id: InfiniteTileId, promoteToGpu = false): Uint8Array | null {
    const key = formatInfiniteTileKey(id);
    const existing = this.gpuResident.get(key) ?? this.cpuResident.get(key);
    if (existing) { this.touchRecord(existing, promoteToGpu ? "gpu" : existing.tier); return existing.pixels; }
    const packedCoord = encodeInfiniteTileCoord(id);
    const fromOpfs = this.mmap.readTile(packedCoord);
    if (!fromOpfs) return null;
    this.opfsReloadCount += 1;
    const buf = this.allocateTileBuffer();
    buf.set(fromOpfs);
    const rec: ResidentTileRecord = {
      key, id, packedCoord, tier: promoteToGpu ? "gpu" : "cpu", pixels: buf,
      dirty: false, persisted: true, checksum: computeFnv1a32(buf), lastAccessTick: ++this.accessTick,
    };
    if (promoteToGpu) this.gpuResident.set(key, rec); else this.cpuResident.set(key, rec);
    const vOffset = this.mmap.computeVirtualTileOffset(packedCoord);
    if (vOffset > this.highestVirtualByteOffset) this.highestVirtualByteOffset = vOffset;
    this.enforceResidencyCaps(new Set<string>([key]));
    return rec.pixels;
  }

  streamViewport(viewport: InfiniteViewportState, layerIds: readonly number[] = [0]): ViewportStreamPlan {
    const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
    const { vx, vy } = this.updateVelocity(viewport);
    const lod = computeLodForZoom(zoom, this.lastViewport ? this.activeLod : undefined, this.lodHysteresis);
    this.activeLod = lod;

    const worldTileSpan = this.tileDim * (1 << lod);
    const visibleWorldW = Math.max(1, viewport.viewportW) / zoom;
    const visibleWorldH = Math.max(1, viewport.viewportH) / zoom;
    const visibleBounds: WorldRect = { minX: viewport.x, minY: viewport.y, maxX: viewport.x + visibleWorldW, maxY: viewport.y + visibleWorldH };

    const visMinTx = Math.floor(visibleBounds.minX / worldTileSpan);
    const visMaxTx = Math.floor((visibleBounds.maxX - 1e-6) / worldTileSpan);
    const visMinTy = Math.floor(visibleBounds.minY / worldTileSpan);
    const visMaxTy = Math.floor((visibleBounds.maxY - 1e-6) / worldTileSpan);

    const leadSec = this.prefetchLookaheadMs / 1000;
    const leadX = Math.max(-this.maxPrefetchLeadTiles, Math.min(this.maxPrefetchLeadTiles, Math.round((vx * leadSec) / worldTileSpan)));
    const leadY = Math.max(-this.maxPrefetchLeadTiles, Math.min(this.maxPrefetchLeadTiles, Math.round((vy * leadSec) / worldTileSpan)));
    const prefMinTx = visMinTx - this.prefetchBaseRing + Math.min(0, leadX);
    const prefMaxTx = visMaxTx + this.prefetchBaseRing + Math.max(0, leadX);
    const prefMinTy = visMinTy - this.prefetchBaseRing + Math.min(0, leadY);
    const prefMaxTy = visMaxTy + this.prefetchBaseRing + Math.max(0, leadY);
    const predCenterX = viewport.x + visibleWorldW * 0.5 + vx * leadSec * 0.5;
    const predCenterY = viewport.y + visibleWorldH * 0.5 + vy * leadSec * 0.5;

    const pinnedKeys = new Set<string>();
    const visibleTiles: StreamedTileDescriptor[] = [];
    const prefetchCandidates: { id: InfiniteTileId; distSq: number }[] = [];
    let vectorFullTiles = 0, vectorSimplifiedTiles = 0, rasterFallbackTiles = 0;
    let totalRawVertices = 0, totalSimplifiedVertices = 0;

    for (const layerId of layerIds) {
      for (let ty = visMinTy; ty <= visMaxTy; ty += 1) {
        for (let tx = visMinTx; tx <= visMaxTx; tx += 1) {
          const id: InfiniteTileId = { layerId, lod, tileX: tx, tileY: ty };
          pinnedKeys.add(formatInfiniteTileKey(id));
          const desc = this.buildTileDescriptor(id, worldTileSpan, zoom, false, 0);
          if (desc.strategy === "vector-full") vectorFullTiles += 1;
          else if (desc.strategy === "vector-simplified") vectorSimplifiedTiles += 1;
          else rasterFallbackTiles += 1;
          totalRawVertices += desc.rawVectorVertices;
          totalSimplifiedVertices += desc.simplifiedVectorVertices;
          visibleTiles.push(desc);
        }
      }
      for (let ty = prefMinTy; ty <= prefMaxTy; ty += 1) {
        for (let tx = prefMinTx; tx <= prefMaxTx; tx += 1) {
          if (tx >= visMinTx && tx <= visMaxTx && ty >= visMinTy && ty <= visMaxTy) continue;
          const dx = (tx + 0.5) * worldTileSpan - predCenterX;
          const dy = (ty + 0.5) * worldTileSpan - predCenterY;
          prefetchCandidates.push({ id: { layerId, lod, tileX: tx, tileY: ty }, distSq: dx * dx + dy * dy });
        }
      }
    }

    prefetchCandidates.sort((a, b) => a.distSq - b.distSq);
    const maxPrefetchWarm = Math.max(0, this.maxCpuResidentTiles - visibleTiles.length);
    const prefetchTiles: StreamedTileDescriptor[] = [];
    for (let i = 0; i < prefetchCandidates.length; i += 1) {
      const cand = prefetchCandidates[i]!;
      const shouldWarm = i < maxPrefetchWarm;
      const desc = this.buildTileDescriptor(cand.id, worldTileSpan, zoom, true, cand.distSq, shouldWarm);
      if (shouldWarm && desc.hasRasterPixels) pinnedKeys.add(desc.key);
      prefetchTiles.push(desc);
    }

    const evictedKeys = this.enforceResidencyCaps(pinnedKeys);
    this.lastViewport = viewport;

    return {
      lod, zoom, velocityX: vx, velocityY: vy, visibleBounds, visibleTiles, prefetchTiles, evictedKeys,
      telemetry: {
        activeLod: lod, visibleTileCount: visibleTiles.length, prefetchTileCount: prefetchTiles.length,
        gpuResidentCount: this.gpuResident.size, cpuResidentCount: this.cpuResident.size,
        residentBytes: this.getResidentBytes(), peakResidentBytes: this.peakResidentBytes,
        maxResidentBytes: this.maxResidentBytes, evictionCount: this.evictionCount,
        opfsSpillCount: this.opfsSpillCount, opfsReloadCount: this.opfsReloadCount,
        vectorFullTiles, vectorSimplifiedTiles, rasterFallbackTiles,
        totalRawVerticesEvaluated: totalRawVertices, totalSimplifiedVerticesEmitted: totalSimplifiedVertices,
        highestVirtualByteOffset: this.highestVirtualByteOffset, opfsStats: this.mmap.getStats(),
      },
    };
  }

  flushAllDirtyToOpfs(): number {
    let spilled = 0;
    for (const rec of this.gpuResident.values()) if (rec.dirty) { this.spillRecordToOpfs(rec); spilled += 1; }
    for (const rec of this.cpuResident.values()) if (rec.dirty) { this.spillRecordToOpfs(rec); spilled += 1; }
    this.mmap.flushDirtyTiles();
    return spilled;
  }

  dispose(): void {
    this.flushAllDirtyToOpfs();
    for (const rec of this.gpuResident.values()) this.releaseTileBuffer(rec.pixels);
    for (const rec of this.cpuResident.values()) this.releaseTileBuffer(rec.pixels);
    this.gpuResident.clear(); this.cpuResident.clear(); this.recycledTiles.length = 0;
    if (this.ownsMmap) this.mmap.close();
  }

  private buildTileDescriptor(
    id: InfiniteTileId, worldTileSpan: number, zoom: number, isPrefetch: boolean, priorityScore: number, warmFromOpfs = true,
  ): StreamedTileDescriptor {
    const key = formatInfiniteTileKey(id);
    const packedCoord = encodeInfiniteTileCoord(id);
    const virtualByteOffset = this.mmap.computeVirtualTileOffset(packedCoord);
    if (virtualByteOffset > this.highestVirtualByteOffset) this.highestVirtualByteOffset = virtualByteOffset;
    const worldBounds: WorldRect = {
      minX: id.tileX * worldTileSpan, minY: id.tileY * worldTileSpan,
      maxX: (id.tileX + 1) * worldTileSpan, maxY: (id.tileY + 1) * worldTileSpan,
    };

    let residency: TileResidencyTier = "opfs-only";
    let hasRasterPixels = false;
    const existing = this.gpuResident.get(key) ?? this.cpuResident.get(key);
    if (existing) {
      this.touchRecord(existing, isPrefetch ? existing.tier : "gpu");
      residency = existing.tier; hasRasterPixels = true;
    } else if (warmFromOpfs && this.mmap.hasTile(packedCoord) && this.readRasterTile(id, !isPrefetch)) {
      residency = isPrefetch ? "cpu" : "gpu"; hasRasterPixels = true;
    }

    const entities = this.vectorIndex.query(worldBounds, id.layerId);
    let rawVectorVertices = 0;
    for (const e of entities) rawVectorVertices += Math.floor(e.points.length / Math.max(2, e.pointStride ?? 2));

    let strategy: TileRenderStrategy;
    const simplifiedEntities: SimplifiedVectorEntity[] = [];
    let simplifiedVectorVertices = 0;
    if (
      rawVectorVertices === 0 || id.lod >= this.rasterFallbackMinLod ||
      zoom <= this.rasterFallbackZoomThreshold || rawVectorVertices > this.vectorToRasterVertexThreshold
    ) {
      strategy = "raster-tile-fallback";
    } else {
      strategy = id.lod === 0 && zoom >= 0.9 ? "vector-full" : "vector-simplified";
      const tol = strategy === "vector-full" ? 0 : (this.baseScreenErrorPx / Math.max(zoom, 0.01)) * (1 << id.lod);
      for (const e of entities) {
        const stride = Math.max(2, e.pointStride ?? 2);
        const pts = simplifyPolylineRdp(e.points, tol, stride);
        const vc = pts.length >>> 1;
        simplifiedVectorVertices += vc;
        simplifiedEntities.push({ entityId: e.id, rawVertexCount: Math.floor(e.points.length / stride), simplifiedVertexCount: vc, points: pts });
      }
    }

    return {
      key, id, worldBounds, residency, strategy, isPrefetch, priorityScore,
      rawVectorVertices, simplifiedVectorVertices, simplifiedEntities, hasRasterPixels, virtualByteOffset,
    };
  }

  private updateVelocity(viewport: InfiniteViewportState): { readonly vx: number; readonly vy: number } {
    if (viewport.velocityX !== undefined || viewport.velocityY !== undefined) {
      this.smoothedVx = Number.isFinite(viewport.velocityX) ? (viewport.velocityX ?? 0) : 0;
      this.smoothedVy = Number.isFinite(viewport.velocityY) ? (viewport.velocityY ?? 0) : 0;
      return { vx: this.smoothedVx, vy: this.smoothedVy };
    }
    if (!this.lastViewport) { this.smoothedVx = 0; this.smoothedVy = 0; return { vx: 0, vy: 0 }; }
    const dtMs = Math.max(1, (viewport.timestampMs ?? 16) - (this.lastViewport.timestampMs ?? 0));
    this.smoothedVx = this.smoothedVx * 0.4 + ((viewport.x - this.lastViewport.x) / dtMs) * 600;
    this.smoothedVy = this.smoothedVy * 0.4 + ((viewport.y - this.lastViewport.y) / dtMs) * 600;
    return { vx: this.smoothedVx, vy: this.smoothedVy };
  }

  private touchRecord(rec: ResidentTileRecord, targetTier: "gpu" | "cpu"): void {
    rec.lastAccessTick = ++this.accessTick;
    if (rec.tier === "gpu") this.gpuResident.delete(rec.key); else this.cpuResident.delete(rec.key);
    rec.tier = targetTier;
    if (targetTier === "gpu") this.gpuResident.set(rec.key, rec); else this.cpuResident.set(rec.key, rec);
  }

  private enforceResidencyCaps(pinnedKeys: ReadonlySet<string>): string[] {
    const evictedKeys: string[] = [];
    while (this.gpuResident.size > this.maxGpuResidentTiles) {
      const victim = this.pickLruVictim(this.gpuResident, pinnedKeys);
      if (!victim) break;
      this.gpuResident.delete(victim.key); victim.tier = "cpu"; this.cpuResident.set(victim.key, victim);
    }
    while (this.cpuResident.size > this.maxCpuResidentTiles || this.getResidentBytes() > this.maxResidentBytes) {
      const victim =
        this.pickLruVictim(this.cpuResident, pinnedKeys) ??
        (this.getResidentBytes() > this.maxResidentBytes ? this.pickLruVictim(this.gpuResident, pinnedKeys) : null);
      if (!victim) break;
      if (victim.tier === "gpu") this.gpuResident.delete(victim.key); else this.cpuResident.delete(victim.key);
      if (victim.dirty || !victim.persisted) this.spillRecordToOpfs(victim);
      this.releaseTileBuffer(victim.pixels);
      this.evictionCount += 1;
      evictedKeys.push(victim.key);
    }
    const bytes = this.getResidentBytes();
    if (bytes > this.peakResidentBytes) this.peakResidentBytes = bytes;
    return evictedKeys;
  }

  private pickLruVictim(map: Map<string, ResidentTileRecord>, pinnedKeys: ReadonlySet<string>): ResidentTileRecord | null {
    for (const rec of map.values()) if (!pinnedKeys.has(rec.key)) return rec;
    return map.values().next().value ?? null;
  }
  private spillRecordToOpfs(rec: ResidentTileRecord): void {
    this.mmap.writeTile(rec.packedCoord, rec.pixels); rec.dirty = false; rec.persisted = true; this.opfsSpillCount += 1;
  }
  private allocateTileBuffer(): Uint8Array {
    return this.objectPool ? this.objectPool.acquireTileScratch(this.tileByteLength, "streamer:tile") : (this.recycledTiles.pop() ?? new Uint8Array(this.tileByteLength));
  }
  private releaseTileBuffer(buf: Uint8Array): void {
    if (this.objectPool) { this.objectPool.release(buf); return; }
    if (this.recycledTiles.length < 8) this.recycledTiles.push(buf);
  }
}

export function createInfiniteVectorTileStreamer(options?: InfiniteVectorTileStreamerOptions): InfiniteVectorTileStreamer {
  return new InfiniteVectorTileStreamer(options);
}
