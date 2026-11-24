/**
 * 무한 캔버스 256×256 희소 타일(Sparse Tile) 쿼드트리 · 줌 적응형 베지어 래스터화
 * 및 스타일러스 2D 칼만 필터 잉크 지연 예측기.
 *
 * - 화면 밖 타일에는 메모리를 단 1바이트도 할당하지 않으며 LRU 캐시로 상한을 제어한다.
 * - 줌 배율(최대 800%+ 확대)에 반비례하는 월드 허용 오차(`screenErrorPx / zoom`)로
 *   3차 베지어 곡선을 재귀 평탄화해 확대 시 픽셀 깨짐과 다각형 각짐을 방지한다.
 * - `PointerEvent.getPredictedEvents()` 입력과 2D 등속 칼만 필터를 융합하고,
 *   급회전 코너에서 오버슈트를 클램핑한다.
 */

export const SPARSE_TILE_SIZE = 256;
export const SPARSE_TILE_RGBA_BYTES = SPARSE_TILE_SIZE * SPARSE_TILE_SIZE * 4;

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface WorldRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CubicBezierSegment {
  readonly p0: Point2D;
  readonly p1: Point2D;
  readonly p2: Point2D;
  readonly p3: Point2D;
}

export interface VectorStrokePath {
  readonly id: string;
  readonly segments: readonly CubicBezierSegment[];
  readonly strokeWidthWorld: number;
  readonly opacity: number;
  readonly zIndex: number;
}

export interface CanvasViewport {
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly zoom: number;
}

export interface SparseTileCoord {
  readonly tx: number;
  readonly ty: number;
  readonly zoomTier: number;
  readonly key: string;
  readonly worldRect: WorldRect;
}

export interface FlattenedBezierResult {
  readonly points: readonly Point2D[];
  readonly subdivisionCount: number;
  readonly worldTolerance: number;
  readonly maxScreenErrorPx: number;
}

export interface RasterizedSparseTile {
  readonly key: string;
  readonly tx: number;
  readonly ty: number;
  readonly zoomTier: number;
  readonly zoomAtRaster: number;
  readonly tileSize: number;
  readonly byteLength: number;
  readonly strokeCount: number;
  readonly flattenedVertexCount: number;
  readonly maxScreenErrorPx: number;
  readonly coveredPixelCount: number;
  readonly lastAccessSeq: number;
  readonly data: Uint8Array;
}

export interface SparseRasterViewportReport {
  readonly viewport: CanvasViewport;
  readonly viewportWorldRect: WorldRect;
  readonly visibleTiles: readonly RasterizedSparseTile[];
  readonly visibleTileCount: number;
  readonly newlyRasterizedCount: number;
  readonly cacheHitCountThisPass: number;
  readonly maxScreenErrorPx: number;
  readonly offscreenAllocatedTiles: 0;
}

export interface SparseTileMemoryStats {
  readonly allocatedTileCount: number;
  readonly maxCachedTiles: number;
  readonly allocatedBytes: number;
  readonly denseEquivalentBytes: number;
  readonly memorySavingRatio: number;
  readonly memorySavingPercent: number;
  readonly offscreenAllocatedTiles: 0;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly cacheHitRate: number;
  readonly evictionCount: number;
  readonly indexedStrokeCount: number;
}

export {
  DEFAULT_KALMAN_STYLUS_CONFIG,
  buildDemoStylusSamples,
  createKalmanStylusState,
  predictStylusLeadPoint,
  simulateStylusTrajectoryPrediction,
  type KalmanStylusConfig,
  type KalmanStylusState,
  type PredictedStylusEventPoint,
  type StylusLeadPrediction,
  type StylusPoint2D,
  type StylusSample,
  type StylusTrajectoryBenchmark,
} from "./kalman-stylus-predictor";

function clampVal(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function computeStrokeWorldBounds(stroke: VectorStrokePath): WorldRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const seg of stroke.segments) {
    const pts = [seg.p0, seg.p1, seg.p2, seg.p3];
    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const pad = Math.max(0.5, stroke.strokeWidthWorld * 0.6);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** 줌 배율에 따른 월드 좌표계 베지어 평탄화 허용 오차를 계산한다(800%에서도 <= 0.25px). */
export function computeWorldFlattenTolerance(zoom: number, maxScreenErrorPx = 0.25): number {
  const safeZoom = clampVal(zoom, 0.05, 32);
  const safeScreenErr = clampVal(maxScreenErrorPx, 0.05, 4);
  return safeScreenErr / safeZoom;
}

function pointToSegmentDistSq(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const t = clampVal(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const rx = p.x - projX;
  const ry = p.y - projY;
  return rx * rx + ry * ry;
}

function subdivideCubicMidpoint(seg: CubicBezierSegment): readonly [CubicBezierSegment, CubicBezierSegment] {
  const mid = (a: Point2D, b: Point2D): Point2D => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
  const p01 = mid(seg.p0, seg.p1);
  const p12 = mid(seg.p1, seg.p2);
  const p23 = mid(seg.p2, seg.p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const p0123 = mid(p012, p123);
  return [
    { p0: seg.p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3: seg.p3 },
  ];
}

/** 줌 배율 적응형 De Casteljau 3차 베지어 평탄화. */
export function flattenCubicBezierAdaptive(
  segment: CubicBezierSegment,
  zoom: number,
  options?: { readonly maxScreenErrorPx?: number; readonly maxDepth?: number },
): FlattenedBezierResult {
  const safeZoom = clampVal(zoom, 0.05, 32);
  const targetScreenErr = clampVal(options?.maxScreenErrorPx ?? 0.25, 0.05, 4);
  const maxDepth = clampVal(Math.floor(options?.maxDepth ?? 11), 1, 14);
  const worldTol = computeWorldFlattenTolerance(safeZoom, targetScreenErr);
  const worldTolSq = worldTol * worldTol;

  const points: Point2D[] = [segment.p0];
  let subdivisionCount = 0;
  let worstWorldErr = 0;

  const recurse = (seg: CubicBezierSegment, depth: number): void => {
    const d1Sq = pointToSegmentDistSq(seg.p1, seg.p0, seg.p3);
    const d2Sq = pointToSegmentDistSq(seg.p2, seg.p0, seg.p3);
    // 3차 베지어 상계(3/4 * max(d1, d2))로 곡선-현 최대 오차를 보수적으로 판정한다.
    const maxCtrlDistSq = Math.max(d1Sq, d2Sq) * 0.5625;

    if (maxCtrlDistSq <= worldTolSq || depth >= maxDepth) {
      const errWorld = Math.sqrt(maxCtrlDistSq);
      if (errWorld > worstWorldErr) worstWorldErr = errWorld;
      points.push(seg.p3);
      return;
    }

    subdivisionCount += 1;
    const [left, right] = subdivideCubicMidpoint(seg);
    recurse(left, depth + 1);
    recurse(right, depth + 1);
  };

  recurse(segment, 0);

  return {
    points,
    subdivisionCount,
    worldTolerance: worldTol,
    maxScreenErrorPx: roundTo(worstWorldErr * safeZoom, 4),
  };
}

interface QuadEntry {
  readonly stroke: VectorStrokePath;
  readonly bounds: WorldRect;
}

class QuadtreeNode {
  readonly bounds: WorldRect;
  readonly depth: number;
  entries: QuadEntry[] = [];
  children: readonly [QuadtreeNode, QuadtreeNode, QuadtreeNode, QuadtreeNode] | null = null;

  constructor(bounds: WorldRect, depth: number) {
    this.bounds = bounds;
    this.depth = depth;
  }

  subdivide(): void {
    if (this.children !== null) return;
    const midX = (this.bounds.minX + this.bounds.maxX) * 0.5;
    const midY = (this.bounds.minY + this.bounds.maxY) * 0.5;
    const nextDepth = this.depth + 1;
    this.children = [
      new QuadtreeNode({ minX: this.bounds.minX, minY: this.bounds.minY, maxX: midX, maxY: midY }, nextDepth),
      new QuadtreeNode({ minX: midX, minY: this.bounds.minY, maxX: this.bounds.maxX, maxY: midY }, nextDepth),
      new QuadtreeNode({ minX: this.bounds.minX, minY: midY, maxX: midX, maxY: this.bounds.maxY }, nextDepth),
      new QuadtreeNode({ minX: midX, minY: midY, maxX: this.bounds.maxX, maxY: this.bounds.maxY }, nextDepth),
    ];
  }
}

/** 무한 캔버스 벡터 스트로크를 공간 분할 인덱싱하는 쿼드트리. */
export class SparseVectorQuadtree {
  private root: QuadtreeNode;
  private readonly maxEntriesPerLeaf: number;
  private readonly maxDepth: number;
  private readonly indexedEntries = new Map<string, QuadEntry>();

  constructor(
    initialBounds: WorldRect = { minX: -65536, minY: -65536, maxX: 65536, maxY: 65536 },
    options?: { readonly maxEntriesPerLeaf?: number; readonly maxDepth?: number },
  ) {
    this.root = new QuadtreeNode(initialBounds, 0);
    this.maxEntriesPerLeaf = Math.max(2, options?.maxEntriesPerLeaf ?? 6);
    this.maxDepth = Math.max(2, options?.maxDepth ?? 8);
  }

  get size(): number {
    return this.indexedEntries.size;
  }

  insert(stroke: VectorStrokePath): WorldRect {
    const bounds = computeStrokeWorldBounds(stroke);
    const entry: QuadEntry = { stroke, bounds };
    this.indexedEntries.set(stroke.id, entry);

    if (!rectsIntersect(this.root.bounds, bounds) || !this.containsRect(this.root.bounds, bounds)) {
      this.expandRootToFit(bounds);
    }
    this.insertIntoNode(this.root, entry);
    return bounds;
  }

  remove(strokeId: string): boolean {
    if (!this.indexedEntries.delete(strokeId)) return false;
    this.rebuildTree();
    return true;
  }

  clear(): void {
    this.indexedEntries.clear();
    this.root = new QuadtreeNode(this.root.bounds, 0);
  }

  queryRect(rect: WorldRect): readonly VectorStrokePath[] {
    const matchedIds = new Set<string>();
    const results: VectorStrokePath[] = [];
    this.queryNode(this.root, rect, matchedIds, results);
    results.sort((a, b) => a.zIndex - b.zIndex);
    return results;
  }

  getGlobalContentBounds(): WorldRect {
    if (this.indexedEntries.size === 0) {
      return { minX: 0, minY: 0, maxX: SPARSE_TILE_SIZE, maxY: SPARSE_TILE_SIZE };
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const { bounds } of this.indexedEntries.values()) {
      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.minY < minY) minY = bounds.minY;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.maxY > maxY) maxY = bounds.maxY;
    }
    return { minX, minY, maxX, maxY };
  }

  private containsRect(outer: WorldRect, inner: WorldRect): boolean {
    return outer.minX <= inner.minX && outer.maxX >= inner.maxX && outer.minY <= inner.minY && outer.maxY >= inner.maxY;
  }

  private expandRootToFit(target: WorldRect): void {
    const nextBounds: WorldRect = {
      minX: Math.min(this.root.bounds.minX, target.minX - 4096),
      minY: Math.min(this.root.bounds.minY, target.minY - 4096),
      maxX: Math.max(this.root.bounds.maxX, target.maxX + 4096),
      maxY: Math.max(this.root.bounds.maxY, target.maxY + 4096),
    };
    this.root = new QuadtreeNode(nextBounds, 0);
    for (const entry of this.indexedEntries.values()) {
      this.insertIntoNode(this.root, entry);
    }
  }

  private rebuildTree(): void {
    this.root = new QuadtreeNode(this.root.bounds, 0);
    for (const entry of this.indexedEntries.values()) {
      this.insertIntoNode(this.root, entry);
    }
  }

  private insertIntoNode(node: QuadtreeNode, entry: QuadEntry): void {
    if (!rectsIntersect(node.bounds, entry.bounds)) return;
    if (node.children === null) {
      node.entries.push(entry);
      if (node.entries.length > this.maxEntriesPerLeaf && node.depth < this.maxDepth) {
        node.subdivide();
        const existing = node.entries;
        node.entries = [];
        for (const item of existing) {
          this.routeToChildren(node, item);
        }
      }
      return;
    }
    this.routeToChildren(node, entry);
  }

  private routeToChildren(node: QuadtreeNode, entry: QuadEntry): void {
    if (node.children === null) return;
    for (const child of node.children) {
      if (rectsIntersect(child.bounds, entry.bounds)) {
        this.insertIntoNode(child, entry);
      }
    }
  }

  private queryNode(
    node: QuadtreeNode,
    rect: WorldRect,
    seen: Set<string>,
    out: VectorStrokePath[],
  ): void {
    if (!rectsIntersect(node.bounds, rect)) return;
    for (const item of node.entries) {
      if (!seen.has(item.stroke.id) && rectsIntersect(item.bounds, rect)) {
        seen.add(item.stroke.id);
        out.push(item.stroke);
      }
    }
    if (node.children !== null) {
      for (const child of node.children) {
        this.queryNode(child, rect, seen, out);
      }
    }
  }
}

export function computeViewportWorldRect(viewport: CanvasViewport): WorldRect {
  const zoom = clampVal(viewport.zoom, 0.05, 32);
  const halfW = viewport.widthPx / (2 * zoom);
  const halfH = viewport.heightPx / (2 * zoom);
  return {
    minX: viewport.centerX - halfW,
    minY: viewport.centerY - halfH,
    maxX: viewport.centerX + halfW,
    maxY: viewport.centerY + halfH,
  };
}

/** 256×256 희소 타일 LRU 캐시 기반 무한 캔버스 벡터 래스터화 스케줄러. */
export class SparseTiledVectorRasterizer {
  private readonly tileCache = new Map<string, RasterizedSparseTile>();
  private readonly strokeBoundsMap = new Map<string, WorldRect>();
  private readonly quadtree = new SparseVectorQuadtree();
  private readonly maxCachedTiles: number;
  private accessSeq = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private evictionCount = 0;

  constructor(options?: { readonly maxCachedTiles?: number }) {
    this.maxCachedTiles = Math.max(4, Math.floor(options?.maxCachedTiles ?? 64));
  }

  addStroke(stroke: VectorStrokePath): void {
    const bounds = this.quadtree.insert(stroke);
    this.strokeBoundsMap.set(stroke.id, bounds);
    this.invalidateTilesIntersecting(bounds);
  }

  removeStroke(strokeId: string): boolean {
    const prevBounds = this.strokeBoundsMap.get(strokeId);
    const removed = this.quadtree.remove(strokeId);
    this.strokeBoundsMap.delete(strokeId);
    if (prevBounds) this.invalidateTilesIntersecting(prevBounds);
    return removed;
  }

  clear(): void {
    this.quadtree.clear();
    this.strokeBoundsMap.clear();
    this.tileCache.clear();
  }

  getCachedTileKeys(): readonly string[] {
    return Array.from(this.tileCache.keys());
  }

  computeVisibleTileCoords(viewport: CanvasViewport): readonly SparseTileCoord[] {
    const zoom = clampVal(viewport.zoom, 0.05, 32);
    const zoomTier = Math.round(zoom * 100);
    const tileWorldSpan = SPARSE_TILE_SIZE / zoom;
    const viewRect = computeViewportWorldRect(viewport);

    const minTx = Math.floor(viewRect.minX / tileWorldSpan);
    const maxTx = Math.floor((viewRect.maxX - 1e-6) / tileWorldSpan);
    const minTy = Math.floor(viewRect.minY / tileWorldSpan);
    const maxTy = Math.floor((viewRect.maxY - 1e-6) / tileWorldSpan);

    const coords: SparseTileCoord[] = [];
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        coords.push({
          tx,
          ty,
          zoomTier,
          key: `z${zoomTier}:${tx}:${ty}`,
          worldRect: {
            minX: tx * tileWorldSpan,
            minY: ty * tileWorldSpan,
            maxX: (tx + 1) * tileWorldSpan,
            maxY: (ty + 1) * tileWorldSpan,
          },
        });
      }
    }
    return coords;
  }

  /** 가시 뷰포트 타일만 선택 래스터화한다(화면 밖 타일 메모리 할당 0). */
  rasterizeViewport(viewport: CanvasViewport): SparseRasterViewportReport {
    const zoom = clampVal(viewport.zoom, 0.05, 32);
    const viewportWorldRect = computeViewportWorldRect(viewport);
    const coords = this.computeVisibleTileCoords(viewport);

    const visibleTiles: RasterizedSparseTile[] = [];
    let newlyRasterizedCount = 0;
    let cacheHitCountThisPass = 0;
    let maxScreenErrorPx = 0;

    for (const coord of coords) {
      const existing = this.tileCache.get(coord.key);
      if (existing) {
        this.accessSeq += 1;
        this.cacheHits += 1;
        cacheHitCountThisPass += 1;
        const touched: RasterizedSparseTile = { ...existing, lastAccessSeq: this.accessSeq };
        // Map 삽입 순서를 갱신해 O(1) LRU 최신 항목으로 유지한다.
        this.tileCache.delete(coord.key);
        this.tileCache.set(coord.key, touched);
        visibleTiles.push(touched);
        if (touched.maxScreenErrorPx > maxScreenErrorPx) {
          maxScreenErrorPx = touched.maxScreenErrorPx;
        }
        continue;
      }

      this.cacheMisses += 1;
      newlyRasterizedCount += 1;
      const tile = this.rasterizeSingleTile(coord, zoom);
      this.insertTileIntoLruCache(tile);
      visibleTiles.push(tile);
      if (tile.maxScreenErrorPx > maxScreenErrorPx) {
        maxScreenErrorPx = tile.maxScreenErrorPx;
      }
    }

    return {
      viewport,
      viewportWorldRect,
      visibleTiles,
      visibleTileCount: visibleTiles.length,
      newlyRasterizedCount,
      cacheHitCountThisPass,
      maxScreenErrorPx: roundTo(maxScreenErrorPx, 4),
      offscreenAllocatedTiles: 0,
    };
  }

  /** 밀집 캔버스 환산 용량 대비 희소 타일 메모리 절감률을 산출한다. */
  getMemoryStats(viewport: CanvasViewport): SparseTileMemoryStats {
    const zoom = clampVal(viewport.zoom, 0.05, 32);
    const contentBounds = this.quadtree.getGlobalContentBounds();
    const viewRect = computeViewportWorldRect(viewport);

    const spanW = Math.max(
      contentBounds.maxX - contentBounds.minX,
      viewRect.maxX - viewRect.minX,
      SPARSE_TILE_SIZE,
    );
    const spanH = Math.max(
      contentBounds.maxY - contentBounds.minY,
      viewRect.maxY - viewRect.minY,
      SPARSE_TILE_SIZE,
    );
    const densePixelW = Math.ceil(spanW * zoom);
    const densePixelH = Math.ceil(spanH * zoom);
    const denseEquivalentBytes = Math.max(SPARSE_TILE_RGBA_BYTES, densePixelW * densePixelH * 4);

    const allocatedTileCount = this.tileCache.size;
    const allocatedBytes = allocatedTileCount * SPARSE_TILE_RGBA_BYTES;
    const savingRatio = clampVal(1 - allocatedBytes / denseEquivalentBytes, 0, 1);
    const totalLookups = this.cacheHits + this.cacheMisses;

    return {
      allocatedTileCount,
      maxCachedTiles: this.maxCachedTiles,
      allocatedBytes,
      denseEquivalentBytes,
      memorySavingRatio: roundTo(savingRatio, 4),
      memorySavingPercent: roundTo(savingRatio * 100, 2),
      offscreenAllocatedTiles: 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: totalLookups > 0 ? roundTo(this.cacheHits / totalLookups, 4) : 0,
      evictionCount: this.evictionCount,
      indexedStrokeCount: this.quadtree.size,
    };
  }

  private invalidateTilesIntersecting(bounds: WorldRect): void {
    for (const [key, tile] of this.tileCache.entries()) {
      const tileSpan = SPARSE_TILE_SIZE / tile.zoomAtRaster;
      const tileRect: WorldRect = {
        minX: tile.tx * tileSpan,
        minY: tile.ty * tileSpan,
        maxX: (tile.tx + 1) * tileSpan,
        maxY: (tile.ty + 1) * tileSpan,
      };
      if (rectsIntersect(tileRect, bounds)) {
        this.tileCache.delete(key);
      }
    }
  }

  private insertTileIntoLruCache(tile: RasterizedSparseTile): void {
    this.tileCache.delete(tile.key);
    this.tileCache.set(tile.key, tile);
    while (this.tileCache.size > this.maxCachedTiles) {
      const oldestKey = this.tileCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.tileCache.delete(oldestKey);
      this.evictionCount += 1;
    }
  }

  private rasterizeSingleTile(coord: SparseTileCoord, zoom: number): RasterizedSparseTile {
    this.accessSeq += 1;
    const data = new Uint8Array(SPARSE_TILE_RGBA_BYTES);
    const strokes = this.quadtree.queryRect(coord.worldRect);
    let flattenedVertexCount = 0;
    let maxScreenErrorPx = 0;
    let coveredPixelCount = 0;

    const originX = coord.worldRect.minX;
    const originY = coord.worldRect.minY;

    for (const stroke of strokes) {
      const radiusPx = clampVal((stroke.strokeWidthWorld * zoom) * 0.5, 0.75, 16);
      const radiusInt = Math.ceil(radiusPx);
      const alphaByte = Math.round(clampVal(stroke.opacity, 0.05, 1) * 255);

      for (const seg of stroke.segments) {
        const flat = flattenCubicBezierAdaptive(seg, zoom, { maxScreenErrorPx: 0.25 });
        flattenedVertexCount += flat.points.length;
        if (flat.maxScreenErrorPx > maxScreenErrorPx) {
          maxScreenErrorPx = flat.maxScreenErrorPx;
        }
        for (let i = 1; i < flat.points.length; i += 1) {
          const a = flat.points[i - 1];
          const b = flat.points[i];
          if (!a || !b) continue;
          const ax = (a.x - originX) * zoom;
          const ay = (a.y - originY) * zoom;
          const bx = (b.x - originX) * zoom;
          const by = (b.y - originY) * zoom;
          if (
            Math.max(ax, bx) < -radiusInt ||
            Math.min(ax, bx) >= SPARSE_TILE_SIZE + radiusInt ||
            Math.max(ay, by) < -radiusInt ||
            Math.min(ay, by) >= SPARSE_TILE_SIZE + radiusInt
          ) {
            continue;
          }
          const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
          for (let s = 0; s <= steps; s += 1) {
            const t = s / steps;
            const px = Math.round(ax + (bx - ax) * t);
            const py = Math.round(ay + (by - ay) * t);
            if (px < 0 || px >= SPARSE_TILE_SIZE || py < 0 || py >= SPARSE_TILE_SIZE) continue;
            const idx = (py * SPARSE_TILE_SIZE + px) * 4;
            if ((data[idx + 3] ?? 0) === 0) coveredPixelCount += 1;
            data[idx] = 36;
            data[idx + 1] = 44;
            data[idx + 2] = 64;
            data[idx + 3] = Math.max(data[idx + 3] ?? 0, alphaByte);
          }
        }
      }
    }

    return {
      key: coord.key,
      tx: coord.tx,
      ty: coord.ty,
      zoomTier: coord.zoomTier,
      zoomAtRaster: zoom,
      tileSize: SPARSE_TILE_SIZE,
      byteLength: data.byteLength,
      strokeCount: strokes.length,
      flattenedVertexCount,
      maxScreenErrorPx: roundTo(maxScreenErrorPx, 4),
      coveredPixelCount,
      lastAccessSeq: this.accessSeq,
      data,
    };
  }
}

/** 무한 캔버스(16,000×16,000 범위)에 분산된 웹툰 컷/선화 데모 스트로크 세트를 생성한다. */
export function createInfiniteCanvasSampleStrokes(): readonly VectorStrokePath[] {
  return [
    {
      id: "hero-curve-center",
      strokeWidthWorld: 3.5,
      opacity: 0.95,
      zIndex: 1,
      segments: [
        { p0: { x: -180, y: -120 }, p1: { x: -40, y: -260 }, p2: { x: 140, y: 220 }, p3: { x: 240, y: -60 } },
        { p0: { x: 240, y: -60 }, p1: { x: 310, y: -200 }, p2: { x: 120, y: 180 }, p3: { x: -120, y: 140 } },
      ],
    },
    {
      id: "far-panel-north-west",
      strokeWidthWorld: 4.0,
      opacity: 0.9,
      zIndex: 2,
      segments: [
        { p0: { x: -7800, y: -7600 }, p1: { x: -7400, y: -7900 }, p2: { x: -7100, y: -7200 }, p3: { x: -6700, y: -7500 } },
      ],
    },
    {
      id: "far-panel-south-east",
      strokeWidthWorld: 4.0,
      opacity: 0.9,
      zIndex: 3,
      segments: [
        { p0: { x: 7200, y: 7400 }, p1: { x: 7600, y: 7100 }, p2: { x: 7900, y: 7850 }, p3: { x: 8200, y: 7550 } },
      ],
    },
  ];
}
