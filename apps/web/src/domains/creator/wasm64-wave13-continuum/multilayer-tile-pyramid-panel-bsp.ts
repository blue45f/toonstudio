/**
 * 다중 레이어 조기 차폐(Occlusion-Culling) 밉 피라미드 타일 합성기 및
 * 파라메트릭 BSP 만화 컷 칸새·도련(3mm)·안전 여백(5mm) 비파괴 리플로우 통합 모듈.
 */

export {
  PRINT_PAGE_DIMENSIONS_MM,
  clipConvexPolygonByHalfPlane,
  computeConvexPolygonDistanceMm,
  computePolygonAreaMm2,
  computePolygonBoundsMm,
  computePolygonCentroidMm,
  reflowComicLayoutBetweenFormats,
  solvePanelBspPageLayout,
  type BalloonAnchorSpec,
  type ComicLayoutTargetFormat,
  type PanelBspLeafNode,
  type PanelBspNode,
  type PanelBspSplitNode,
  type Point2D,
  type PrintPageGeometrySpec,
  type PrintPagePresetKind,
  type RectMm,
  type ReflowedComicLayoutResult,
  type ReflowedWebtoonStripPanel,
  type ResolvedBalloonPlacement,
  type SolvedPrintPageLayout,
  type SolvedPrintPanel,
} from "./comic-panel-bsp-reflow";

export const COMPOSITOR_TILE_SIZE = 256;

export type RgbaTuple = readonly [number, number, number, number];
export type TileOpacityBound = "fullyOpaque" | "fullyTransparent" | "mixed";
export type LayerBlendMode = "normal" | "multiply" | "screen";
export type MipScaleLabel = "1/2" | "1/4" | "1/8";

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CompositorLayerSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: LayerBlendMode;
}

export interface TileOpacityInspection {
  readonly bound: TileOpacityBound;
  readonly minAlpha: number;
  readonly maxAlpha: number;
}

export interface TileCompositeFlushTelemetry {
  readonly dirtyRectCount: number;
  readonly recompositedBaseTiles: number;
  readonly totalBaseTiles: number;
  readonly occludedUnderLayerTiles: number;
  readonly culledTransparentTiles: number;
  readonly blendedLayerTileReads: number;
  readonly fastOpaqueTileCopies: number;
  readonly updatedMipTilesByLevel: Readonly<Record<MipScaleLabel, number>>;
  readonly updatedMipPixelsByLevel: Readonly<Record<MipScaleLabel, number>>;
}

interface InternalLayerTile {
  readonly rgba: Uint8ClampedArray;
  opacityBound: TileOpacityBound;
  minAlpha: number;
  maxAlpha: number;
}

interface InternalLayerState {
  readonly id: string;
  readonly labelKo: string;
  visible: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  readonly tiles: Map<number, InternalLayerTile>;
}

interface MipLevelBuffer {
  readonly label: MipScaleLabel;
  readonly divisor: number;
  readonly width: number;
  readonly height: number;
  readonly tileCols: number;
  readonly tileRows: number;
  readonly tiles: Map<number, Uint8ClampedArray>;
}

/** 타일 유효 영역의 알파 채널 최솟값·최댓값을 스캔해 불투명 경계를 분류한다. */
export function classifyTileOpacityBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  validWidth: number,
  validHeight: number,
  tileStride = COMPOSITOR_TILE_SIZE,
): TileOpacityInspection {
  if (validWidth <= 0 || validHeight <= 0) {
    return { bound: "fullyTransparent", minAlpha: 0, maxAlpha: 0 };
  }
  let minAlpha = 255;
  let maxAlpha = 0;
  for (let row = 0; row < validHeight; row += 1) {
    const rowBase = row * tileStride * 4;
    for (let col = 0; col < validWidth; col += 1) {
      const a = rgba[rowBase + col * 4 + 3];
      if (a < minAlpha) minAlpha = a;
      if (a > maxAlpha) maxAlpha = a;
      if (minAlpha === 0 && maxAlpha === 255) {
        return { bound: "mixed", minAlpha: 0, maxAlpha: 255 };
      }
    }
  }
  if (maxAlpha === 0) return { bound: "fullyTransparent", minAlpha: 0, maxAlpha: 0 };
  if (minAlpha === 255) return { bound: "fullyOpaque", minAlpha: 255, maxAlpha: 255 };
  return { bound: "mixed", minAlpha, maxAlpha };
}

function clampRect(rect: PixelRect, maxW: number, maxH: number): PixelRect | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(maxW, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(maxH, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function applyBlendChannel(backdropUnit: number, srcUnit: number, mode: LayerBlendMode): number {
  if (mode === "multiply") return backdropUnit * srcUnit;
  if (mode === "screen") return backdropUnit + srcUnit - backdropUnit * srcUnit;
  return srcUnit;
}

/** 256×256 희소 타일 분할 + 전방→후방 조기 차폐 + 더티 영역 증분 1/2·1/4·1/8 밉 합성기. */
export class MultiLayerTilePyramidCompositor {
  public readonly width: number;
  public readonly height: number;
  public readonly tileSize: number;
  public readonly tileCols: number;
  public readonly tileRows: number;

  private readonly layers: InternalLayerState[] = [];
  private readonly layerById = new Map<string, InternalLayerState>();
  private readonly baseCompositeTiles = new Map<number, Uint8ClampedArray>();
  private readonly mipLevels: readonly MipLevelBuffer[];
  private pendingDirtyRects: PixelRect[] = [];

  public constructor(width: number, height: number, tileSize = COMPOSITOR_TILE_SIZE) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.tileSize = Math.max(16, Math.floor(tileSize));
    this.tileCols = Math.ceil(this.width / this.tileSize);
    this.tileRows = Math.ceil(this.height / this.tileSize);

    const specs: readonly { readonly label: MipScaleLabel; readonly divisor: number }[] = [
      { label: "1/2", divisor: 2 },
      { label: "1/4", divisor: 4 },
      { label: "1/8", divisor: 8 },
    ];
    this.mipLevels = specs.map(({ label, divisor }) => {
      const mw = Math.max(1, Math.ceil(this.width / divisor));
      const mh = Math.max(1, Math.ceil(this.height / divisor));
      return {
        label,
        divisor,
        width: mw,
        height: mh,
        tileCols: Math.ceil(mw / this.tileSize),
        tileRows: Math.ceil(mh / this.tileSize),
        tiles: new Map<number, Uint8ClampedArray>(),
      };
    });
  }

  /** 하위(배경)부터 상위(전경) 순서로 레이어를 추가한다. */
  public addLayer(spec: CompositorLayerSpec): void {
    if (this.layerById.has(spec.id)) {
      throw new Error(`이미 존재하는 레이어 식별자입니다: ${spec.id}`);
    }
    const state: InternalLayerState = {
      id: spec.id,
      labelKo: spec.labelKo,
      visible: spec.visible ?? true,
      opacity: Math.min(1, Math.max(0, spec.opacity ?? 1)),
      blendMode: spec.blendMode ?? "normal",
      tiles: new Map<number, InternalLayerTile>(),
    };
    this.layers.push(state);
    this.layerById.set(spec.id, state);
  }

  public setLayerProps(
    layerId: string,
    patch: Partial<Pick<CompositorLayerSpec, "visible" | "opacity" | "blendMode">>,
  ): void {
    const layer = this.layerById.get(layerId);
    if (!layer) return;
    if (patch.visible !== undefined) layer.visible = patch.visible;
    if (patch.opacity !== undefined) layer.opacity = Math.min(1, Math.max(0, patch.opacity));
    if (patch.blendMode !== undefined) layer.blendMode = patch.blendMode;

    for (const key of layer.tiles.keys()) {
      const tx = key % this.tileCols;
      const ty = Math.floor(key / this.tileCols);
      const clipped = clampRect(
        { x: tx * this.tileSize, y: ty * this.tileSize, width: this.tileSize, height: this.tileSize },
        this.width,
        this.height,
      );
      if (clipped) this.pendingDirtyRects.push(clipped);
    }
  }

  public getLayerTileOpacityBound(layerId: string, tx: number, ty: number): TileOpacityBound {
    const layer = this.layerById.get(layerId);
    if (!layer || tx < 0 || ty < 0 || tx >= this.tileCols || ty >= this.tileRows) {
      return "fullyTransparent";
    }
    return layer.tiles.get(ty * this.tileCols + tx)?.opacityBound ?? "fullyTransparent";
  }

  /** 지정한 레이어의 직사각형 영역을 단색 RGBA 값으로 채우고 더티 영역을 기록한다. */
  public paintSolidRect(layerId: string, rect: PixelRect, rgba: RgbaTuple): void {
    const layer = this.layerById.get(layerId);
    const clipped = clampRect(rect, this.width, this.height);
    if (!layer || !clipped) return;

    const tx0 = Math.floor(clipped.x / this.tileSize);
    const ty0 = Math.floor(clipped.y / this.tileSize);
    const tx1 = Math.floor((clipped.x + clipped.width - 1) / this.tileSize);
    const ty1 = Math.floor((clipped.y + clipped.height - 1) / this.tileSize);

    for (let ty = ty0; ty <= ty1; ty += 1) {
      const tileOriginY = ty * this.tileSize;
      const validH = Math.min(this.tileSize, this.height - tileOriginY);
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const tileOriginX = tx * this.tileSize;
        const validW = Math.min(this.tileSize, this.width - tileOriginX);
        const key = ty * this.tileCols + tx;

        let tile = layer.tiles.get(key);
        if (!tile) {
          if (rgba[3] === 0) continue;
          tile = {
            rgba: new Uint8ClampedArray(this.tileSize * this.tileSize * 4),
            opacityBound: "fullyTransparent",
            minAlpha: 0,
            maxAlpha: 0,
          };
          layer.tiles.set(key, tile);
        }

        const ix0 = Math.max(clipped.x, tileOriginX) - tileOriginX;
        const iy0 = Math.max(clipped.y, tileOriginY) - tileOriginY;
        const ix1 = Math.min(clipped.x + clipped.width, tileOriginX + validW) - tileOriginX;
        const iy1 = Math.min(clipped.y + clipped.height, tileOriginY + validH) - tileOriginY;

        for (let py = iy0; py < iy1; py += 1) {
          const rowOffset = py * this.tileSize * 4;
          for (let px = ix0; px < ix1; px += 1) {
            const idx = rowOffset + px * 4;
            tile.rgba[idx] = rgba[0];
            tile.rgba[idx + 1] = rgba[1];
            tile.rgba[idx + 2] = rgba[2];
            tile.rgba[idx + 3] = rgba[3];
          }
        }

        const stats = classifyTileOpacityBounds(tile.rgba, validW, validH, this.tileSize);
        if (stats.bound === "fullyTransparent") {
          layer.tiles.delete(key);
        } else {
          tile.opacityBound = stats.bound;
          tile.minAlpha = stats.minAlpha;
          tile.maxAlpha = stats.maxAlpha;
        }
      }
    }

    this.pendingDirtyRects.push(clipped);
  }

  /** 누적된 더티 영역에 대해서만 전방→후방 조기 차폐 합성 및 1/2·1/4·1/8 밉 갱신을 수행한다. */
  public flushDirtyPyramid(): TileCompositeFlushTelemetry {
    const dirtyRects = this.pendingDirtyRects;
    this.pendingDirtyRects = [];
    const emptyMipCounts: Record<MipScaleLabel, number> = { "1/2": 0, "1/4": 0, "1/8": 0 };

    if (dirtyRects.length === 0) {
      return {
        dirtyRectCount: 0,
        recompositedBaseTiles: 0,
        totalBaseTiles: this.tileCols * this.tileRows,
        occludedUnderLayerTiles: 0,
        culledTransparentTiles: 0,
        blendedLayerTileReads: 0,
        fastOpaqueTileCopies: 0,
        updatedMipTilesByLevel: { ...emptyMipCounts },
        updatedMipPixelsByLevel: { ...emptyMipCounts },
      };
    }

    const dirtyBaseTileKeys = new Set<number>();
    for (const rect of dirtyRects) {
      const tx0 = Math.floor(rect.x / this.tileSize);
      const ty0 = Math.floor(rect.y / this.tileSize);
      const tx1 = Math.floor((rect.x + rect.width - 1) / this.tileSize);
      const ty1 = Math.floor((rect.y + rect.height - 1) / this.tileSize);
      for (let ty = ty0; ty <= ty1; ty += 1) {
        for (let tx = tx0; tx <= tx1; tx += 1) {
          dirtyBaseTileKeys.add(ty * this.tileCols + tx);
        }
      }
    }

    let occludedUnderLayerTiles = 0;
    let culledTransparentTiles = 0;
    let blendedLayerTileReads = 0;
    let fastOpaqueTileCopies = 0;

    for (const key of dirtyBaseTileKeys) {
      const tx = key % this.tileCols;
      const ty = Math.floor(key / this.tileCols);
      const validW = Math.min(this.tileSize, this.width - tx * this.tileSize);
      const validH = Math.min(this.tileSize, this.height - ty * this.tileSize);

      const chain: { readonly layer: InternalLayerState; readonly tile: InternalLayerTile }[] = [];
      let allNormalMode = true;

      for (let i = this.layers.length - 1; i >= 0; i -= 1) {
        const layer = this.layers[i];
        if (!layer.visible || layer.opacity <= 0) {
          culledTransparentTiles += 1;
          continue;
        }
        const tile = layer.tiles.get(key);
        if (!tile || tile.opacityBound === "fullyTransparent") {
          culledTransparentTiles += 1;
          continue;
        }
        chain.push({ layer, tile });
        if (layer.blendMode !== "normal") allNormalMode = false;

        if (layer.blendMode === "normal" && layer.opacity >= 1 && tile.opacityBound === "fullyOpaque") {
          for (let under = i - 1; under >= 0; under -= 1) {
            const uLayer = this.layers[under];
            if (uLayer.visible && uLayer.opacity > 0 && uLayer.tiles.has(key)) {
              occludedUnderLayerTiles += 1;
            }
          }
          break;
        }
      }

      if (chain.length === 0) {
        this.baseCompositeTiles.delete(key);
        continue;
      }

      let outBuf = this.baseCompositeTiles.get(key);
      if (!outBuf) {
        outBuf = new Uint8ClampedArray(this.tileSize * this.tileSize * 4);
        this.baseCompositeTiles.set(key, outBuf);
      }

      if (chain.length === 1 && chain[0].layer.blendMode === "normal" && chain[0].layer.opacity >= 1) {
        outBuf.set(chain[0].tile.rgba);
        blendedLayerTileReads += 1;
        fastOpaqueTileCopies += 1;
        continue;
      }

      blendedLayerTileReads += chain.length;
      if (allNormalMode) {
        this.compositeTileFrontToBackUnder(outBuf, chain, validW, validH);
      } else {
        this.compositeTileStopperToTop(outBuf, chain, validW, validH);
      }
    }

    const updatedMipTilesByLevel: Record<MipScaleLabel, number> = { "1/2": 0, "1/4": 0, "1/8": 0 };
    const updatedMipPixelsByLevel: Record<MipScaleLabel, number> = { "1/2": 0, "1/4": 0, "1/8": 0 };

    let parentWidth = this.width;
    let parentHeight = this.height;
    let parentTiles = this.baseCompositeTiles;
    let parentTileCols = this.tileCols;
    let currentRects = dirtyRects;

    for (const mip of this.mipLevels) {
      const touchedMipTiles = new Set<number>();
      const nextRects: PixelRect[] = [];

      for (const pRect of currentRects) {
        const mx0 = Math.floor(pRect.x / 2);
        const my0 = Math.floor(pRect.y / 2);
        const mx1 = Math.min(mip.width, Math.ceil((pRect.x + pRect.width) / 2));
        const my1 = Math.min(mip.height, Math.ceil((pRect.y + pRect.height) / 2));
        if (mx1 <= mx0 || my1 <= my0) continue;

        nextRects.push({ x: mx0, y: my0, width: mx1 - mx0, height: my1 - my0 });
        updatedMipPixelsByLevel[mip.label] += (mx1 - mx0) * (my1 - my0);

        for (let my = my0; my < my1; my += 1) {
          const mty = Math.floor(my / this.tileSize);
          const localMy = my - mty * this.tileSize;
          for (let mx = mx0; mx < mx1; mx += 1) {
            const mtx = Math.floor(mx / this.tileSize);
            const localMx = mx - mtx * this.tileSize;
            const mipKey = mty * mip.tileCols + mtx;
            touchedMipTiles.add(mipKey);

            const rgba = this.downsample2x2Premultiplied(
              parentTiles,
              parentTileCols,
              parentWidth,
              parentHeight,
              mx * 2,
              my * 2,
            );
            let mipBuf = mip.tiles.get(mipKey);
            if (!mipBuf) {
              if (rgba[3] === 0) continue;
              mipBuf = new Uint8ClampedArray(this.tileSize * this.tileSize * 4);
              mip.tiles.set(mipKey, mipBuf);
            }
            const dstIdx = (localMy * this.tileSize + localMx) * 4;
            mipBuf[dstIdx] = rgba[0];
            mipBuf[dstIdx + 1] = rgba[1];
            mipBuf[dstIdx + 2] = rgba[2];
            mipBuf[dstIdx + 3] = rgba[3];
          }
        }
      }

      updatedMipTilesByLevel[mip.label] = touchedMipTiles.size;
      parentWidth = mip.width;
      parentHeight = mip.height;
      parentTiles = mip.tiles;
      parentTileCols = mip.tileCols;
      currentRects = nextRects;
    }

    return {
      dirtyRectCount: dirtyRects.length,
      recompositedBaseTiles: dirtyBaseTileKeys.size,
      totalBaseTiles: this.tileCols * this.tileRows,
      occludedUnderLayerTiles,
      culledTransparentTiles,
      blendedLayerTileReads,
      fastOpaqueTileCopies,
      updatedMipTilesByLevel,
      updatedMipPixelsByLevel,
    };
  }

  public sampleCompositePixel(x: number, y: number): RgbaTuple {
    return this.readTileMapPixel(this.baseCompositeTiles, this.tileCols, this.width, this.height, x, y);
  }

  public sampleMipPixel(level: MipScaleLabel, x: number, y: number): RgbaTuple {
    const mip = this.mipLevels.find((item) => item.label === level);
    if (!mip) return [0, 0, 0, 0];
    return this.readTileMapPixel(mip.tiles, mip.tileCols, mip.width, mip.height, x, y);
  }

  private readTileMapPixel(
    tiles: ReadonlyMap<number, Uint8ClampedArray>,
    tileCols: number,
    maxW: number,
    maxH: number,
    x: number,
    y: number,
  ): RgbaTuple {
    if (x < 0 || y < 0 || x >= maxW || y >= maxH) return [0, 0, 0, 0];
    const tx = Math.floor(x / this.tileSize);
    const ty = Math.floor(y / this.tileSize);
    const buf = tiles.get(ty * tileCols + tx);
    if (!buf) return [0, 0, 0, 0];
    const idx = ((y - ty * this.tileSize) * this.tileSize + (x - tx * this.tileSize)) * 4;
    return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
  }

  private compositeTileFrontToBackUnder(
    outBuf: Uint8ClampedArray,
    chain: readonly { readonly layer: InternalLayerState; readonly tile: InternalLayerTile }[],
    validW: number,
    validH: number,
  ): void {
    for (let py = 0; py < validH; py += 1) {
      const rowBase = py * this.tileSize * 4;
      for (let px = 0; px < validW; px += 1) {
        const idx = rowBase + px * 4;
        let rAcc = 0;
        let gAcc = 0;
        let bAcc = 0;
        let aAcc = 0;
        for (const { layer, tile } of chain) {
          const srcA = (tile.rgba[idx + 3] / 255) * layer.opacity;
          if (srcA <= 0) continue;
          const weight = (1 - aAcc) * srcA;
          rAcc += weight * (tile.rgba[idx] / 255);
          gAcc += weight * (tile.rgba[idx + 1] / 255);
          bAcc += weight * (tile.rgba[idx + 2] / 255);
          aAcc += weight;
          if (aAcc >= 0.9999) {
            aAcc = 1;
            break;
          }
        }
        if (aAcc <= 1e-6) {
          outBuf.fill(0, idx, idx + 4);
        } else {
          outBuf[idx] = Math.round((rAcc / aAcc) * 255);
          outBuf[idx + 1] = Math.round((gAcc / aAcc) * 255);
          outBuf[idx + 2] = Math.round((bAcc / aAcc) * 255);
          outBuf[idx + 3] = Math.round(aAcc * 255);
        }
      }
    }
  }

  private compositeTileStopperToTop(
    outBuf: Uint8ClampedArray,
    chain: readonly { readonly layer: InternalLayerState; readonly tile: InternalLayerTile }[],
    validW: number,
    validH: number,
  ): void {
    for (let py = 0; py < validH; py += 1) {
      const rowBase = py * this.tileSize * 4;
      for (let px = 0; px < validW; px += 1) {
        const idx = rowBase + px * 4;
        let rPremul = 0;
        let gPremul = 0;
        let bPremul = 0;
        let aOut = 0;
        for (let k = chain.length - 1; k >= 0; k -= 1) {
          const { layer, tile } = chain[k];
          const as = (tile.rgba[idx + 3] / 255) * layer.opacity;
          if (as <= 0) continue;
          const csR = tile.rgba[idx] / 255;
          const csG = tile.rgba[idx + 1] / 255;
          const csB = tile.rgba[idx + 2] / 255;
          const cbR = aOut > 1e-6 ? rPremul / aOut : 0;
          const cbG = aOut > 1e-6 ? gPremul / aOut : 0;
          const cbB = aOut > 1e-6 ? bPremul / aOut : 0;
          const br = applyBlendChannel(cbR, csR, layer.blendMode);
          const bg = applyBlendChannel(cbG, csG, layer.blendMode);
          const bb = applyBlendChannel(cbB, csB, layer.blendMode);
          rPremul = as * ((1 - aOut) * csR + aOut * br) + (1 - as) * rPremul;
          gPremul = as * ((1 - aOut) * csG + aOut * bg) + (1 - as) * gPremul;
          bPremul = as * ((1 - aOut) * csB + aOut * bb) + (1 - as) * bPremul;
          aOut = as + aOut * (1 - as);
        }
        if (aOut <= 1e-6) {
          outBuf.fill(0, idx, idx + 4);
        } else {
          outBuf[idx] = Math.round((rPremul / aOut) * 255);
          outBuf[idx + 1] = Math.round((gPremul / aOut) * 255);
          outBuf[idx + 2] = Math.round((bPremul / aOut) * 255);
          outBuf[idx + 3] = Math.round(aOut * 255);
        }
      }
    }
  }

  private downsample2x2Premultiplied(
    srcTiles: ReadonlyMap<number, Uint8ClampedArray>,
    srcTileCols: number,
    srcW: number,
    srcH: number,
    srcX0: number,
    srcY0: number,
  ): RgbaTuple {
    let rPremul = 0;
    let gPremul = 0;
    let bPremul = 0;
    let aSum = 0;
    let samples = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      const sy = srcY0 + dy;
      if (sy >= srcH) continue;
      for (let dx = 0; dx < 2; dx += 1) {
        const sx = srcX0 + dx;
        if (sx >= srcW) continue;
        samples += 1;
        const [r, g, b, a] = this.readTileMapPixel(srcTiles, srcTileCols, srcW, srcH, sx, sy);
        const alphaUnit = a / 255;
        rPremul += r * alphaUnit;
        gPremul += g * alphaUnit;
        bPremul += b * alphaUnit;
        aSum += a;
      }
    }
    if (samples === 0 || aSum <= 0) return [0, 0, 0, 0];
    const totalAlphaUnit = aSum / 255;
    return [
      Math.round(rPremul / totalAlphaUnit),
      Math.round(gPremul / totalAlphaUnit),
      Math.round(bPremul / totalAlphaUnit),
      Math.round(aSum / samples),
    ];
  }
}
