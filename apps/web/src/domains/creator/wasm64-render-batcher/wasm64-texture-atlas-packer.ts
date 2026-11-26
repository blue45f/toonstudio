/**
 * Skyline Bottom-Left (+ Waste-Map) 2D 동적 텍스처 아틀라스 패커.
 *
 * - 브러시 스탬프, 한글 글리프 런, SFX 텍스처를 단일 GPU 텍스처 아틀라스(기본 2048×2048)에
 *   패킹하며, 이중선형(bilinear) UV 번짐 방지를 위해 최소 1px 거터(padding >= 1)를 강제한다.
 * - O(1) LRU 추적(`touch`), 공간 부족 시 LRU 퇴거 + 트랜잭션 재패킹(`evictLru`/`repack`),
 *   부분 GPU `writeTexture` 업로드를 위한 더티 영역 수집(`consumeDirtyRects`)을 제공한다.
 */

export const DEFAULT_ATLAS_WIDTH = 2048;
export const DEFAULT_ATLAS_HEIGHT = 2048;
export const MIN_ATLAS_PADDING = 1;

export interface AtlasRect {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}

export interface AtlasAllocation extends AtlasRect {
  readonly key: string;
  readonly u0: number; readonly v0: number; readonly u1: number; readonly v1: number;
  readonly generation: number; readonly lastTouchedTick: number; readonly reused: boolean;
}

export interface AtlasDirtyBatch {
  readonly rects: readonly AtlasRect[];
  readonly union: AtlasRect | null;
  readonly totalDirtyPixels: number;
  readonly generation: number;
}

export interface AtlasEvictionResult {
  readonly evictedKeys: readonly string[];
  readonly reclaimedArea: number;
  readonly reclaimedPackedArea: number;
  readonly repackedCount: number;
  readonly generation: number;
}

export interface AtlasOccupancyTelemetry {
  readonly atlasWidth: number; readonly atlasHeight: number; readonly padding: number;
  readonly entryCount: number; readonly usedContentPixels: number; readonly usedPackedPixels: number;
  readonly totalAtlasPixels: number; readonly occupancyRatio: number; readonly occupancyPct: number;
  readonly packedOccupancyRatio: number; readonly packedOccupancyPct: number;
  readonly skylineNodeCount: number; readonly wasteRectCount: number;
  readonly evictionCount: number; readonly repackCount: number;
  readonly hitCount: number; readonly missCount: number; readonly generation: number;
}

export interface Wasm64TextureAtlasPackerOptions {
  readonly atlasWidth?: number; readonly atlasHeight?: number;
  readonly padding?: number; readonly autoEvict?: boolean;
}

interface SkylineNode { x: number; y: number; width: number; }
interface MutableRect { x: number; y: number; width: number; height: number; }
interface MutableEntry {
  key: string; x: number; y: number; width: number; height: number;
  u0: number; v0: number; u1: number; v1: number; generation: number; lastTouchedTick: number;
}

export function computeDirtyRectUnion(rects: readonly AtlasRect[]): AtlasRect | null {
  if (rects.length === 0) return null;
  let minX = rects[0].x;
  let minY = rects[0].y;
  let maxX = rects[0].x + rects[0].width;
  let maxY = rects[0].y + rects[0].height;
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export class Wasm64TextureAtlasPacker {
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly padding: number;
  private readonly autoEvict: boolean;
  private skyline: SkylineNode[] = [];
  private wasteRects: MutableRect[] = [];
  private readonly entries = new Map<string, MutableEntry>();
  private readonly dirtyKeys = new Set<string>();
  private tick = 0;
  private generation = 1;
  private usedContentPixels = 0;
  private usedPackedPixels = 0;
  private evictionCount = 0;
  private repackCount = 0;
  private hitCount = 0;
  private missCount = 0;

  constructor(options: Wasm64TextureAtlasPackerOptions = {}) {
    const width = options.atlasWidth ?? DEFAULT_ATLAS_WIDTH;
    const height = options.atlasHeight ?? DEFAULT_ATLAS_HEIGHT;
    const padding = options.padding ?? MIN_ATLAS_PADDING;
    if (!Number.isSafeInteger(width) || width < 4 || !Number.isSafeInteger(height) || height < 4) {
      throw new RangeError(`아틀라스 크기는 4 이상의 정수여야 합니다: ${width}x${height}`);
    }
    if (!Number.isSafeInteger(padding) || padding < MIN_ATLAS_PADDING) {
      throw new RangeError(`padding은 UV 번짐 방지를 위해 ${MIN_ATLAS_PADDING}px 이상이어야 합니다: ${padding}`);
    }
    if (width <= padding * 2 || height <= padding * 2) {
      throw new RangeError(`아틀라스 크기가 패딩(${padding}px) 대비 너무 작습니다.`);
    }
    this.atlasWidth = width;
    this.atlasHeight = height;
    this.padding = padding;
    this.autoEvict = options.autoEvict ?? true;
    this.initSkyline();
  }

  get size(): number { return this.entries.size; }
  get currentGeneration(): number { return this.generation; }
  has(key: string): boolean { return this.entries.has(key); }
  get(key: string): AtlasAllocation | undefined {
    const entry = this.entries.get(key);
    return entry ? this.toAllocation(entry, false) : undefined;
  }
  listAllocations(): readonly AtlasAllocation[] {
    return Array.from(this.entries.values(), (entry) => this.toAllocation(entry, false));
  }
  reset(): void {
    this.entries.clear();
    this.dirtyKeys.clear();
    this.usedContentPixels = 0;
    this.usedPackedPixels = 0;
    this.generation++;
    this.initSkyline();
  }
  touch(key: string): AtlasAllocation | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    entry.lastTouchedTick = ++this.tick;
    this.entries.set(key, entry);
    return this.toAllocation(entry, true);
  }

  allocate(key: string, width: number, height: number): AtlasAllocation | null {
    if (!key) throw new RangeError("아틀라스 키는 빈 문자열일 수 없습니다.");
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
      throw new RangeError(`사각형 크기는 양의 정수여야 합니다: ${width}x${height}`);
    }
    if (width + this.padding * 2 > this.atlasWidth || height + this.padding * 2 > this.atlasHeight) {
      return null;
    }

    const existing = this.entries.get(key);
    if (existing) {
      if (existing.width === width && existing.height === height) {
        this.hitCount++;
        return this.touch(key);
      }
      this.removeEntryStats(existing);
      this.entries.delete(key);
      this.dirtyKeys.delete(key);
      this.repackInternal();
    }

    this.missCount++;
    const cellW = width + this.padding;
    const cellH = height + this.padding;
    let placed = this.tryPlace(cellW, cellH);

    if (!placed && this.entries.size > 0) {
      this.repackInternal();
      placed = this.tryPlace(cellW, cellH);
    }
    if (!placed && this.autoEvict) {
      const targetArea = width * height;
      while (!placed && this.entries.size > 0) {
        this.evictLru(targetArea);
        placed = this.tryPlace(cellW, cellH);
      }
    }
    if (!placed) return null;

    const entry: MutableEntry = {
      key, x: 0, y: 0, width, height, u0: 0, v0: 0, u1: 0, v1: 0,
      generation: this.generation, lastTouchedTick: ++this.tick,
    };
    this.applyEntryCoords(entry, placed.x, placed.y);
    this.entries.set(key, entry);
    this.usedContentPixels += width * height;
    this.usedPackedPixels += cellW * cellH;
    this.dirtyKeys.add(key);
    return this.toAllocation(entry, false);
  }

  /** LRU 순서로 항목을 퇴거하여 최소 `neededArea` 이상 확보한 뒤 생존 항목을 재패킹한다. */
  evictLru(neededArea: number): AtlasEvictionResult {
    if (!Number.isFinite(neededArea) || neededArea <= 0 || this.entries.size === 0) {
      return { evictedKeys: [], reclaimedArea: 0, reclaimedPackedArea: 0, repackedCount: 0, generation: this.generation };
    }
    const evictedKeys: string[] = [];
    let reclaimedArea = 0;
    let reclaimedPackedArea = 0;
    for (const [key, entry] of this.entries) {
      this.entries.delete(key);
      this.dirtyKeys.delete(key);
      this.removeEntryStats(entry);
      evictedKeys.push(key);
      reclaimedArea += entry.width * entry.height;
      reclaimedPackedArea += (entry.width + this.padding) * (entry.height + this.padding);
      this.evictionCount++;
      if (reclaimedArea >= neededArea) break;
    }
    return { evictedKeys, reclaimedArea, reclaimedPackedArea, repackedCount: this.repackInternal(), generation: this.generation };
  }

  repack(): number { return this.repackInternal(); }

  consumeDirtyRects(): AtlasDirtyBatch {
    const rects: AtlasRect[] = [];
    let totalDirtyPixels = 0;
    for (const key of this.dirtyKeys) {
      const e = this.entries.get(key);
      if (!e) continue;
      rects.push({ x: e.x, y: e.y, width: e.width, height: e.height });
      totalDirtyPixels += e.width * e.height;
    }
    this.dirtyKeys.clear();
    return { rects, union: computeDirtyRectUnion(rects), totalDirtyPixels, generation: this.generation };
  }

  getTelemetry(): AtlasOccupancyTelemetry {
    const total = this.atlasWidth * this.atlasHeight;
    const occupancyRatio = this.usedContentPixels / total;
    const packedOccupancyRatio = this.usedPackedPixels / total;
    return {
      atlasWidth: this.atlasWidth, atlasHeight: this.atlasHeight, padding: this.padding,
      entryCount: this.entries.size, usedContentPixels: this.usedContentPixels,
      usedPackedPixels: this.usedPackedPixels, totalAtlasPixels: total,
      occupancyRatio, occupancyPct: occupancyRatio * 100,
      packedOccupancyRatio, packedOccupancyPct: packedOccupancyRatio * 100,
      skylineNodeCount: this.skyline.length, wasteRectCount: this.wasteRects.length,
      evictionCount: this.evictionCount, repackCount: this.repackCount,
      hitCount: this.hitCount, missCount: this.missCount, generation: this.generation,
    };
  }

  private initSkyline(): void {
    this.skyline = [{ x: this.padding, y: this.padding, width: this.atlasWidth - this.padding }];
    this.wasteRects = [];
  }

  private applyEntryCoords(entry: MutableEntry, x: number, y: number): void {
    entry.x = x; entry.y = y;
    entry.u0 = x / this.atlasWidth; entry.v0 = y / this.atlasHeight;
    entry.u1 = (x + entry.width) / this.atlasWidth; entry.v1 = (y + entry.height) / this.atlasHeight;
  }

  private removeEntryStats(entry: MutableEntry): void {
    this.usedContentPixels -= entry.width * entry.height;
    this.usedPackedPixels -= (entry.width + this.padding) * (entry.height + this.padding);
  }

  /** 트랜잭션 재패킹: 높이/면적 순으로 재배치하고 실패 시 직전 레이아웃을 무손실 복구한다. */
  private repackInternal(): number {
    const survivors = Array.from(this.entries.values());
    const prevSkyline = this.skyline.map((n) => ({ ...n }));
    const prevWaste = this.wasteRects.map((r) => ({ ...r }));
    const comparators: readonly ((a: MutableEntry, b: MutableEntry) => number)[] = [
      (a, b) => b.height - a.height || b.width - a.width,
      (a, b) => b.width * b.height - a.width * a.height || Math.max(b.width, b.height) - Math.max(a.width, a.height),
    ];
    for (const cmp of comparators) {
      this.initSkyline();
      const nextCoords: { entry: MutableEntry; x: number; y: number }[] = [];
      let ok = true;
      for (const entry of [...survivors].sort(cmp)) {
        const placed = this.tryPlace(entry.width + this.padding, entry.height + this.padding);
        if (!placed) { ok = false; break; }
        nextCoords.push({ entry, x: placed.x, y: placed.y });
      }
      if (!ok) continue;
      this.generation++;
      this.repackCount++;
      let movedCount = 0;
      for (const { entry, x, y } of nextCoords) {
        if (entry.x !== x || entry.y !== y) {
          this.applyEntryCoords(entry, x, y);
          this.dirtyKeys.add(entry.key);
          movedCount++;
        }
        entry.generation = this.generation;
      }
      return movedCount;
    }
    this.skyline = prevSkyline;
    this.wasteRects = prevWaste;
    return 0;
  }

  private tryPlace(cellW: number, cellH: number): { x: number; y: number } | null {
    const fromWaste = this.tryPlaceInWaste(cellW, cellH);
    if (fromWaste) return fromWaste;
    let bestIdx = -1;
    let bestX = 0;
    let bestY = Number.POSITIVE_INFINITY;
    let bestTop = Number.POSITIVE_INFINITY;
    let bestWidth = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.skyline.length; i++) {
      const node = this.skyline[i];
      if (node.x + cellW > this.atlasWidth) break;
      const fitY = this.computeSkylineY(i, cellW, cellH);
      if (fitY < 0) continue;
      const top = fitY + cellH;
      if (top < bestTop || (top === bestTop && (node.width < bestWidth || (node.width === bestWidth && node.x < bestX)))) {
        bestIdx = i; bestX = node.x; bestY = fitY; bestTop = top; bestWidth = node.width;
      }
    }
    if (bestIdx < 0) return null;
    this.insertSkylineLevel(bestIdx, bestX, bestY, cellW, cellH);
    return { x: bestX, y: bestY };
  }

  private tryPlaceInWaste(cellW: number, cellH: number): { x: number; y: number } | null {
    let bestIdx = -1;
    let bestWaste = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.wasteRects.length; i++) {
      const r = this.wasteRects[i];
      if (r.width >= cellW && r.height >= cellH) {
        const waste = r.width * r.height - cellW * cellH;
        if (waste < bestWaste) { bestWaste = waste; bestIdx = i; }
      }
    }
    if (bestIdx < 0) return null;
    const target = this.wasteRects[bestIdx];
    const { x, y } = target;
    const remW = target.width - cellW;
    const remH = target.height - cellH;
    this.wasteRects.splice(bestIdx, 1);
    // 짧은 축 분할(Guillotine Shorter Axis Split)로 잔여 포켓을 겹침 없이 재활용한다.
    const splitHoriz = remW < remH;
    if (remW > 0) this.wasteRects.push({ x: x + cellW, y, width: remW, height: splitHoriz ? cellH : target.height });
    if (remH > 0) this.wasteRects.push({ x, y: y + cellH, width: splitHoriz ? target.width : cellW, height: remH });
    return { x, y };
  }

  private computeSkylineY(startIdx: number, cellW: number, cellH: number): number {
    if (this.skyline[startIdx].x + cellW > this.atlasWidth) return -1;
    let widthLeft = cellW;
    let maxY = this.skyline[startIdx].y;
    for (let i = startIdx; widthLeft > 0; i++) {
      if (i >= this.skyline.length) return -1;
      const seg = this.skyline[i];
      if (seg.y > maxY) maxY = seg.y;
      if (maxY + cellH > this.atlasHeight) return -1;
      widthLeft -= seg.width;
    }
    return maxY;
  }

  private insertSkylineLevel(idx: number, x: number, y: number, cellW: number, cellH: number): void {
    const endX = x + cellW;
    for (let i = idx; i < this.skyline.length; i++) {
      const seg = this.skyline[i];
      if (seg.x >= endX) break;
      const overlapStart = Math.max(x, seg.x);
      const overlapEnd = Math.min(endX, seg.x + seg.width);
      if (overlapEnd > overlapStart && seg.y < y) {
        this.wasteRects.push({ x: overlapStart, y: seg.y, width: overlapEnd - overlapStart, height: y - seg.y });
      }
    }

    this.skyline.splice(idx, 0, { x, y: y + cellH, width: cellW });
    for (let i = idx + 1; i < this.skyline.length; i++) {
      const prevEnd = this.skyline[i - 1].x + this.skyline[i - 1].width;
      const cur = this.skyline[i];
      if (cur.x < prevEnd) {
        const shrink = prevEnd - cur.x;
        cur.x += shrink;
        cur.width -= shrink;
        if (cur.width <= 0) { this.skyline.splice(i, 1); i--; }
        else break;
      } else break;
    }

    for (let i = 0; i < this.skyline.length - 1; i++) {
      if (this.skyline[i].y === this.skyline[i + 1].y) {
        this.skyline[i].width += this.skyline[i + 1].width;
        this.skyline.splice(i + 1, 1);
        i--;
      }
    }
  }

  private toAllocation(e: MutableEntry, reused: boolean): AtlasAllocation {
    return {
      key: e.key, x: e.x, y: e.y, width: e.width, height: e.height,
      u0: e.u0, v0: e.v0, u1: e.u1, v1: e.v1,
      generation: e.generation, lastTouchedTick: e.lastTouchedTick, reused,
    };
  }
}
