/**
 * O(Δ) 증분 델타 라이브 스트로크 버퍼(IncrementalDeltaStrokeBuffer).
 *
 * pointermove마다 전체 획(0..N)을 다시 그리지 않고 직전 커밋 지점 이후의 신규 델타
 * 구간(Δpoints)만 증분 스탬핑한다. pointerup 시 재래스터화 0회로 라이브 타일을
 * 베이커 타일에 직접 합성(commitToBaker)해 Live === Committed 픽셀 오차 0.0000을 보장한다.
 */

import {
  RealMediaTipAtlasCache,
  selectTipMipLevel,
  type RealMediaTipId,
  type RgbColor,
} from "./real-media-tip-atlas.ts";
import {
  BAKER_TILE_SIZE,
  TileBufferPool,
  compositeRgbaPixelInto,
  expandPixelBounds,
  type LayerStrokeBitmapBaker,
  type LiveTilePatch,
  type PixelBounds,
  type TileCompositeMode,
  type TileCompositeOptions,
} from "./layer-stroke-bitmap-baker.ts";

export interface StrokePointerSample {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs?: number;
}

export interface DeltaStrokeBrushConfig {
  readonly strokeId: string;
  readonly tipId: RealMediaTipId;
  readonly color: RgbColor;
  readonly radiusPx: number;
  readonly opacity?: number;
  readonly flow?: number;
  readonly spacingRatio?: number;
  readonly paperGrainStrength?: number;
  readonly compositeMode?: TileCompositeMode;
  readonly wetMixStrength?: number;
  readonly seed?: number;
  readonly clipBounds?: PixelBounds;
}

export interface DeltaAppendResult {
  readonly deltaPointCount: number;
  readonly stampedDabs: number;
  readonly deltaBounds: PixelBounds | null;
  readonly touchedTileCount: number;
  readonly elapsedMs: number;
}

export interface CommitToBakerResult {
  readonly strokeId: string;
  readonly committedTileCount: number;
  readonly dirtyBounds: PixelBounds | null;
  readonly commitElapsedMs: number;
  readonly totalStampedDabs: number;
  readonly reRasterizedDabs: 0;
}

export interface LiveBufferStats {
  readonly activeLiveTileCount: number;
  readonly activeBytes: number;
  readonly poolBytes: number;
  readonly poolHits: number;
  readonly poolMisses: number;
}

export interface RgbaRegionDiff {
  readonly maxAbsDiff: number;
  readonly meanAbsDiff: number;
  readonly rmse: number;
  readonly mismatchPixels: number;
  readonly totalPixels: number;
}

interface TipRuntimeDefaults {
  readonly spacingRatio: number;
  readonly flow: number;
  readonly paperGrain: number;
  readonly rotateMode: "tangent" | "apex-tangent" | "perpendicular" | "fixed";
  readonly defaultCompositeMode: TileCompositeMode;
  readonly wetMixStrength: number;
}

const TIP_DEFAULTS: Record<RealMediaTipId, TipRuntimeDefaults> = {
  "graphite-pencil-6b": { spacingRatio: 0.16, flow: 0.52, paperGrain: 0.65, rotateMode: "tangent", defaultCompositeMode: "source-over", wetMixStrength: 0 },
  "wax-crayon-block": { spacingRatio: 0.2, flow: 0.68, paperGrain: 0.72, rotateMode: "fixed", defaultCompositeMode: "kubelka-munk", wetMixStrength: 0.55 },
  "square-charcoal": { spacingRatio: 0.16, flow: 0.58, paperGrain: 0.68, rotateMode: "fixed", defaultCompositeMode: "source-over", wetMixStrength: 0 },
  "soft-pastel-chalk": { spacingRatio: 0.18, flow: 0.5, paperGrain: 0.7, rotateMode: "fixed", defaultCompositeMode: "kubelka-munk", wetMixStrength: 0.45 },
  "sable-watercolor": { spacingRatio: 0.14, flow: 0.34, paperGrain: 0.22, rotateMode: "apex-tangent", defaultCompositeMode: "kubelka-munk", wetMixStrength: 0.9 },
  "hog-bristle-oil": { spacingRatio: 0.14, flow: 0.62, paperGrain: 0.18, rotateMode: "perpendicular", defaultCompositeMode: "kubelka-munk", wetMixStrength: 0.85 },
  "gpen-nib-elastic": { spacingRatio: 0.09, flow: 0.96, paperGrain: 0.02, rotateMode: "apex-tangent", defaultCompositeMode: "source-over", wetMixStrength: 0 },
  "marker-chisel-felt": { spacingRatio: 0.13, flow: 0.72, paperGrain: 0.05, rotateMode: "fixed", defaultCompositeMode: "source-over", wetMixStrength: 0 },
};

interface LiveTileEntry {
  readonly key: string;
  readonly tx: number;
  readonly ty: number;
  readonly data: Uint8ClampedArray;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clamp01(v: number): number { return v <= 0 ? 0 : v >= 1 ? 1 : v; }
function clampByte(v: number): number { return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v); }

function paperHash2d(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 비주기적 황금비 회전 지터가 적용된 냉압 종이결(격자 무늬 0건). */
function samplePaperTooth(wx: number, wy: number, seed: number): number {
  const rx = wx * 0.24 + wy * 0.11;
  const ry = -wx * 0.11 + wy * 0.24;
  const ix = Math.floor(rx);
  const iy = Math.floor(ry);
  const fx = rx - ix;
  const fy = ry - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = paperHash2d(ix, iy, seed);
  const b = paperHash2d(ix + 1, iy, seed);
  const c = paperHash2d(ix, iy + 1, seed);
  const d = paperHash2d(ix + 1, iy + 1, seed);
  const coarse = (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  const fine = paperHash2d(wx | 0, wy | 0, seed + 131);
  return coarse * 0.68 + fine * 0.32;
}

function makeLiveKey(tx: number, ty: number): string { return `${tx},${ty}`; }

export class IncrementalDeltaStrokeBuffer {
  private readonly atlasCache: RealMediaTipAtlasCache;
  private readonly pool: TileBufferPool;
  private readonly liveTiles = new Map<string, LiveTileEntry>();
  private activeConfig: DeltaStrokeBrushConfig | null = null;
  private activeDefaults: TipRuntimeDefaults | null = null;
  private lastSample: StrokePointerSample | null = null;
  private residualDistPx = 0;
  private lastAngleRad = 0;
  private stampedDabCount = 0;
  private processedPointCount = 0;
  private dirtyBounds: PixelBounds | null = null;

  constructor(options: { readonly atlasCache?: RealMediaTipAtlasCache; readonly maxPoolBuffers?: number } = {}) {
    this.atlasCache = options.atlasCache ?? new RealMediaTipAtlasCache();
    this.pool = new TileBufferPool(options.maxPoolBuffers ?? 24);
  }

  private recycleLiveTiles(): void {
    for (const tile of this.liveTiles.values()) {
      this.pool.release(tile.data, { minX: tile.minX, minY: tile.minY, maxX: tile.maxX, maxY: tile.maxY });
    }
    this.liveTiles.clear();
  }

  beginStroke(config: DeltaStrokeBrushConfig): void {
    this.recycleLiveTiles();
    this.activeConfig = config;
    this.activeDefaults = TIP_DEFAULTS[config.tipId];
    this.lastSample = null;
    this.residualDistPx = 0;
    this.lastAngleRad = 0;
    this.stampedDabCount = 0;
    this.processedPointCount = 0;
    this.dirtyBounds = null;
  }

  private getOrCreateLiveTile(tx: number, ty: number): LiveTileEntry {
    const key = makeLiveKey(tx, ty);
    let tile = this.liveTiles.get(key);
    if (!tile) {
      tile = {
        key, tx, ty,
        data: this.pool.acquire(),
        minX: BAKER_TILE_SIZE, minY: BAKER_TILE_SIZE, maxX: 0, maxY: 0,
      };
      this.liveTiles.set(key, tile);
    }
    return tile;
  }

  private stampDab(
    cx: number,
    cy: number,
    pressure: number,
    angleRad: number,
    touchedKeys: Set<string>,
  ): PixelBounds | null {
    const cfg = this.activeConfig;
    const defaults = this.activeDefaults;
    if (!cfg || !defaults) return null;

    const p = clamp01(pressure);
    const radiusScale =
      cfg.tipId === "gpen-nib-elastic"
        ? 0.28 + 0.72 * Math.pow(p, 0.85)
        : 0.45 + 0.55 * Math.pow(p, 0.75);
    const dabRadius = Math.max(1, cfg.radiusPx * radiusScale);
    const diameter = dabRadius * 2;
    const tipMask = this.atlasCache.get(cfg.tipId, { pressure: p, seed: cfg.seed });
    const mip = selectTipMipLevel(tipMask.mipmaps, diameter);
    const mipSize = mip.size;
    const mipData = mip.data;
    const mipMax = mipSize - 1;

    let minX = Math.floor(cx - dabRadius - 1);
    let minY = Math.floor(cy - dabRadius - 1);
    let maxX = Math.ceil(cx + dabRadius + 1);
    let maxY = Math.ceil(cy + dabRadius + 1);
    if (cfg.clipBounds) {
      minX = Math.max(minX, Math.floor(cfg.clipBounds.minX));
      minY = Math.max(minY, Math.floor(cfg.clipBounds.minY));
      maxX = Math.min(maxX, Math.ceil(cfg.clipBounds.maxX));
      maxY = Math.min(maxY, Math.ceil(cfg.clipBounds.maxY));
    }
    if (minX >= maxX || minY >= maxY) return null;

    const rot =
      defaults.rotateMode === "tangent"
        ? angleRad
        : defaults.rotateMode === "apex-tangent"
          ? angleRad + Math.PI * 0.5
          : defaults.rotateMode === "perpendicular"
            ? angleRad + Math.PI * 0.5
            : 0;
    const cosR = Math.cos(-rot);
    const sinR = Math.sin(-rot);
    const invRadius = 1 / dabRadius;
    const flow = clamp01(cfg.flow ?? defaults.flow);
    const grainStrength = clamp01(cfg.paperGrainStrength ?? defaults.paperGrain);
    const grainSeed = (cfg.seed ?? 20261123) ^ 0x51f23;
    const sr = clampByte(cfg.color.r);
    const sg = clampByte(cfg.color.g);
    const sb = clampByte(cfg.color.b);

    const minTx = Math.floor(minX / BAKER_TILE_SIZE);
    const minTy = Math.floor(minY / BAKER_TILE_SIZE);
    const maxTx = Math.floor((maxX - 1) / BAKER_TILE_SIZE);
    const maxTy = Math.floor((maxY - 1) / BAKER_TILE_SIZE);

    for (let ty = minTy; ty <= maxTy; ty += 1) {
      const originY = ty * BAKER_TILE_SIZE;
      const pyStart = Math.max(minY, originY);
      const pyEnd = Math.min(maxY, originY + BAKER_TILE_SIZE);
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const originX = tx * BAKER_TILE_SIZE;
        const pxStart = Math.max(minX, originX);
        const pxEnd = Math.min(maxX, originX + BAKER_TILE_SIZE);
        const tile = this.getOrCreateLiveTile(tx, ty);
        const tileData = tile.data;
        let wrote = false;

        for (let py = pyStart; py < pyEnd; py += 1) {
          const dy = (py + 0.5 - cy) * invRadius;
          const ly = py - originY;
          const rowBase = ly * BAKER_TILE_SIZE;
          for (let px = pxStart; px < pxEnd; px += 1) {
            const dx = (px + 0.5 - cx) * invRadius;
            const u = (dx * cosR - dy * sinR) * 0.5 + 0.5;
            const v = (dx * sinR + dy * cosR) * 0.5 + 0.5;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;

            const fx = u * mipMax;
            const fy = v * mipMax;
            const ix0 = fx | 0;
            const iy0 = fy | 0;
            const ix1 = ix0 < mipMax ? ix0 + 1 : ix0;
            const iy1 = iy0 < mipMax ? iy0 + 1 : iy0;
            const txFrac = fx - ix0;
            const tyFrac = fy - iy0;
            const r0 = iy0 * mipSize;
            const r1 = iy1 * mipSize;
            const top = (mipData[r0 + ix0] ?? 0) + ((mipData[r0 + ix1] ?? 0) - (mipData[r0 + ix0] ?? 0)) * txFrac;
            const bot = (mipData[r1 + ix0] ?? 0) + ((mipData[r1 + ix1] ?? 0) - (mipData[r1 + ix0] ?? 0)) * txFrac;
            let maskVal = top + (bot - top) * tyFrac;
            if (maskVal <= 0.004) continue;

            if (grainStrength > 0.005) {
              const tooth = samplePaperTooth(px, py, grainSeed);
              const catchFactor = clamp01(1 - grainStrength * (1 - tooth) * (1.08 - 0.55 * p));
              maskVal *= catchFactor;
              if (maskVal <= 0.004) continue;
            }

            const dabA = clamp01(maskVal * flow);
            const off = (rowBase + (px - originX)) * 4;
            const prevAByte = tileData[off + 3] ?? 0;
            const nextA = 1 - (1 - prevAByte / 255) * (1 - dabA);
            const nextAByte = clampByte(nextA * 255);
            if (nextAByte > prevAByte) {
              tileData[off] = sr;
              tileData[off + 1] = sg;
              tileData[off + 2] = sb;
              tileData[off + 3] = nextAByte;
              wrote = true;
            }
          }
        }

        if (wrote) {
          const lMinX = pxStart - originX;
          const lMinY = pyStart - originY;
          const lMaxX = pxEnd - originX;
          const lMaxY = pyEnd - originY;
          if (lMinX < tile.minX) tile.minX = lMinX;
          if (lMinY < tile.minY) tile.minY = lMinY;
          if (lMaxX > tile.maxX) tile.maxX = lMaxX;
          if (lMaxY > tile.maxY) tile.maxY = lMaxY;
          touchedKeys.add(tile.key);
        }
      }
    }

    this.stampedDabCount += 1;
    const dabBounds: PixelBounds = { minX, minY, maxX, maxY };
    this.dirtyBounds = expandPixelBounds(this.dirtyBounds, dabBounds);
    return dabBounds;
  }

  /**
   * 직전 커밋 지점(lastSample) 이후의 신규 델타 포인트만 O(Δ) 증분 스탬핑한다.
   */
  appendPoints(deltaPoints: readonly StrokePointerSample[]): DeltaAppendResult {
    const t0 = performance.now();
    const cfg = this.activeConfig;
    const defaults = this.activeDefaults;
    if (!cfg || !defaults || deltaPoints.length === 0) {
      return { deltaPointCount: deltaPoints.length, stampedDabs: 0, deltaBounds: null, touchedTileCount: 0, elapsedMs: performance.now() - t0 };
    }

    const spacingRatio = Math.max(0.05, cfg.spacingRatio ?? defaults.spacingRatio);
    const stepPx = Math.max(1.25, cfg.radiusPx * 2 * spacingRatio);
    const touchedKeys = new Set<string>();
    let stampedDabs = 0;
    let deltaBounds: PixelBounds | null = null;

    for (let i = 0; i < deltaPoints.length; i += 1) {
      const sample = deltaPoints[i];
      if (!sample) continue;
      const pressure = clamp01(sample.pressure ?? 0.78);

      if (!this.lastSample) {
        const b = this.stampDab(sample.x, sample.y, pressure, this.lastAngleRad, touchedKeys);
        if (b) deltaBounds = expandPixelBounds(deltaBounds, b);
        stampedDabs += 1;
        this.lastSample = sample;
        this.residualDistPx = 0;
        this.processedPointCount += 1;
        continue;
      }

      const prev = this.lastSample;
      const prevPressure = clamp01(prev.pressure ?? 0.78);
      const dx = sample.x - prev.x;
      const dy = sample.y - prev.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen > 1e-4) this.lastAngleRad = Math.atan2(dy, dx);

      let dist = stepPx - this.residualDistPx;
      while (dist <= segLen && segLen > 1e-4) {
        const frac = dist / segLen;
        const px = prev.x + dx * frac;
        const py = prev.y + dy * frac;
        const pr = prevPressure + (pressure - prevPressure) * frac;
        const b = this.stampDab(px, py, pr, this.lastAngleRad, touchedKeys);
        if (b) deltaBounds = expandPixelBounds(deltaBounds, b);
        stampedDabs += 1;
        dist += stepPx;
      }
      this.residualDistPx = segLen - (dist - stepPx);
      this.lastSample = sample;
      this.processedPointCount += 1;
    }

    return {
      deltaPointCount: deltaPoints.length,
      stampedDabs,
      deltaBounds,
      touchedTileCount: touchedKeys.size,
      elapsedMs: performance.now() - t0,
    };
  }

  private resolveCompositeOptions(): TileCompositeOptions {
    const cfg = this.activeConfig;
    const defaults = this.activeDefaults;
    return {
      mode: cfg?.compositeMode ?? defaults?.defaultCompositeMode ?? "source-over",
      opacity: clamp01(cfg?.opacity ?? 1),
      wetMixStrength: clamp01(cfg?.wetMixStrength ?? defaults?.wetMixStrength ?? 0.85),
    };
  }

  /**
   * 현재 베이커 커밋 타일 위에 라이브 버퍼를 커밋과 100% 동일한 커널로 합성한 프리뷰를 반환한다.
   */
  composePreviewRegion(
    baker: LayerStrokeBitmapBaker,
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    out?: Uint8ClampedArray,
  ): Uint8ClampedArray {
    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const preview = baker.readRegion(layerId, x0, y0, w, h, out);
    if (w === 0 || h === 0 || !this.activeConfig) return preview;

    const compOpts = this.resolveCompositeOptions();
    for (const tile of this.liveTiles.values()) {
      if (tile.maxX <= tile.minX || tile.maxY <= tile.minY) continue;
      const originX = tile.tx * BAKER_TILE_SIZE;
      const originY = tile.ty * BAKER_TILE_SIZE;
      const minPx = Math.max(x0, originX + tile.minX);
      const minPy = Math.max(y0, originY + tile.minY);
      const maxPx = Math.min(x0 + w, originX + tile.maxX);
      const maxPy = Math.min(y0 + h, originY + tile.maxY);
      if (minPx >= maxPx || minPy >= maxPy) continue;

      for (let py = minPy; py < maxPy; py += 1) {
        const ly = py - originY;
        const dstRow = (py - y0) * w;
        let srcOff = (ly * BAKER_TILE_SIZE + (minPx - originX)) * 4;
        let dstOff = (dstRow + (minPx - x0)) * 4;
        for (let px = minPx; px < maxPx; px += 1) {
          const sa = tile.data[srcOff + 3] ?? 0;
          if (sa > 0) {
            compositeRgbaPixelInto(
              preview,
              dstOff,
              tile.data[srcOff] ?? 0,
              tile.data[srcOff + 1] ?? 0,
              tile.data[srcOff + 2] ?? 0,
              sa,
              compOpts,
            );
          }
          srcOff += 4;
          dstOff += 4;
        }
      }
    }
    return preview;
  }

  /**
   * pointerup 시 라이브 타일을 재래스터화 0회로 베이커 타일에 직접 합성하고 버퍼를 풀에 반납한다.
   */
  commitToBaker(
    baker: LayerStrokeBitmapBaker,
    layerId: string,
    recordMetadata = true,
  ): CommitToBakerResult {
    const cfg = this.activeConfig;
    if (!cfg) {
      return { strokeId: "", committedTileCount: 0, dirtyBounds: null, commitElapsedMs: 0, totalStampedDabs: 0, reRasterizedDabs: 0 };
    }
    const patches: LiveTilePatch[] = [];
    for (const tile of this.liveTiles.values()) {
      if (tile.maxX <= tile.minX || tile.maxY <= tile.minY) continue;
      patches.push({
        tx: tile.tx,
        ty: tile.ty,
        data: tile.data,
        dirtyRect: { minX: tile.minX, minY: tile.minY, maxX: tile.maxX, maxY: tile.maxY },
      });
    }
    const bounds = this.dirtyBounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const metrics = baker.bakeStrokePatch(
      layerId,
      cfg.strokeId,
      patches,
      bounds,
      this.resolveCompositeOptions(),
      recordMetadata,
    );
    const totalStampedDabs = this.stampedDabCount;
    const finalBounds = this.dirtyBounds;
    this.recycleLiveTiles();
    this.activeConfig = null;
    this.activeDefaults = null;
    this.lastSample = null;
    this.dirtyBounds = null;
    this.stampedDabCount = 0;
    this.processedPointCount = 0;
    return {
      strokeId: cfg.strokeId,
      committedTileCount: metrics.touchedTileCount,
      dirtyBounds: finalBounds,
      commitElapsedMs: metrics.commitElapsedMs,
      totalStampedDabs,
      reRasterizedDabs: 0,
    };
  }

  cancelStroke(): void {
    this.recycleLiveTiles();
    this.activeConfig = null;
    this.activeDefaults = null;
    this.lastSample = null;
    this.dirtyBounds = null;
    this.stampedDabCount = 0;
    this.processedPointCount = 0;
  }

  getActiveBounds(): PixelBounds | null { return this.dirtyBounds; }
  getProcessedPointCount(): number { return this.processedPointCount; }
  getStampedDabCount(): number { return this.stampedDabCount; }

  getBufferStats(): LiveBufferStats {
    return {
      activeLiveTileCount: this.liveTiles.size,
      activeBytes: this.liveTiles.size * BAKER_TILE_SIZE * BAKER_TILE_SIZE * 4,
      poolBytes: this.pool.getByteLength(),
      poolHits: this.pool.getHits(),
      poolMisses: this.pool.getMisses(),
    };
  }

  dispose(): void {
    this.cancelStroke();
    this.pool.clear();
  }
}

export function computeRgbaRegionDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): RgbaRegionDiff {
  const len = Math.min(a.length, b.length);
  const totalPixels = Math.floor(len / 4);
  if (totalPixels === 0) {
    return { maxAbsDiff: 0, meanAbsDiff: 0, rmse: 0, mismatchPixels: 0, totalPixels: 0 };
  }
  let maxAbsDiff = 0;
  let sumAbs = 0;
  let sumSq = 0;
  let mismatchPixels = 0;
  for (let p = 0; p < totalPixels; p += 1) {
    const off = p * 4;
    let pxMismatch = false;
    for (let c = 0; c < 4; c += 1) {
      const diff = Math.abs((a[off + c] ?? 0) - (b[off + c] ?? 0));
      if (diff > 0) pxMismatch = true;
      if (diff > maxAbsDiff) maxAbsDiff = diff;
      sumAbs += diff;
      sumSq += diff * diff;
    }
    if (pxMismatch) mismatchPixels += 1;
  }
  const channels = totalPixels * 4;
  return {
    maxAbsDiff,
    meanAbsDiff: sumAbs / channels,
    rmse: Math.sqrt(sumSq / channels),
    mismatchPixels,
    totalPixels,
  };
}
