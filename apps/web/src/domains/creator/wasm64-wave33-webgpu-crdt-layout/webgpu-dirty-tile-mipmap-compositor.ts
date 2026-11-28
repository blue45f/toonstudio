/**
 * Wave-33: 결정론적 WebGPU 64x64 더티 타일 병합·프리멀티플라이드 블렌드·밉맵 전파 합성 스케줄러.
 *
 * 60/120Hz 스타일러스 스트로크 입력 중 전체 고해상도 캔버스를 매 프레임 재합성하지 않고,
 * 실제 변경된 64x64 타일만 비트셋으로 추적한 뒤 인접 타일 직사각형 병합(Adjacent Dirty-Tile Coalescing),
 * W3C 표준 웹툰 블렌드 수학 커널, 밉맵 피라미드(Level 0 -> Level N) 전파, 그리고 프레임 예산 초과 시
 * 뷰포트 초점 우선순위(Foveated Viewport Priority) 분할 스케줄링을 수행한다.
 */

export const WEBGPU_TILE_SIZE_PX = 64;

/** RGBA16Float 64x64 타일 1장의 기본 임시 VRAM 예산(64 * 64 * 8 = 32,768B). */
export const DEFAULT_BYTES_PER_TILE = WEBGPU_TILE_SIZE_PX * WEBGPU_TILE_SIZE_PX * 8;

export const WEBGPU_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "color-dodge",
  "linear-burn",
] as const;

export type WebGpuBlendMode = (typeof WEBGPU_BLEND_MODES)[number];

/** 0..1 정규화 RGBA 4채널 튜플. */
export type RgbaColorTuple = readonly [r: number, g: number, b: number, a: number];

export interface CanvasPixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DirtyTileCoord {
  readonly tileX: number;
  readonly tileY: number;
}

export interface TileCoalescingOptions {
  /** 단일 WebGPU 디스패치로 묶을 최대 가로 타일 수(기본 8 = 512px). */
  readonly maxMergedWidthTiles?: number;
  /** 단일 WebGPU 디스패치로 묶을 최대 세로 타일 수(기본 8 = 512px). */
  readonly maxMergedHeightTiles?: number;
}

export interface CoalescedTileDispatchRect {
  readonly tileX: number;
  readonly tileY: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly pixelRect: CanvasPixelRect;
  /** workgroup_size(8, 8, 1) 기준 디스패치 그룹 크기. */
  readonly workgroupCountX: number;
  readonly workgroupCountY: number;
}

export interface MipLevelDimensions {
  readonly level: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly tilesX: number;
  readonly tilesY: number;
}

export interface MipDirtyPyramidLevel {
  readonly level: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dirtyTiles: ReadonlyArray<DirtyTileCoord>;
}

export interface FoveatedViewportSpec {
  readonly viewportRectPx: CanvasPixelRect;
  /** 시선 또는 펜촉 초점 월드 좌표(생략 시 뷰포트 중심). */
  readonly focusX?: number;
  readonly focusY?: number;
}

export interface WebGpuCompositorBudget {
  readonly maxTilesPerFrame: number;
  readonly maxDispatchCountPerFrame: number;
  readonly maxTransientVramBytesPerFrame: number;
  readonly bytesPerTile?: number;
}

export interface DirtyTileFrameSchedule {
  readonly frameIndex: number;
  readonly scheduledTiles: ReadonlyArray<DirtyTileCoord>;
  readonly coalescedDispatches: ReadonlyArray<CoalescedTileDispatchRect>;
  readonly mipDirtyPyramid: ReadonlyArray<MipDirtyPyramidLevel>;
  readonly deferredTileCount: number;
  readonly consumedVramBytes: number;
  readonly inViewportScheduledCount: number;
}

export interface PremultipliedLayerTileInput {
  readonly layerId: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: WebGpuBlendMode;
  /** 길이 tileWidth * tileHeight * 4 프리멀티플라이드 RGBA 버퍼. */
  readonly premultipliedRgba: Float32Array;
}

export interface WebGpuCompositorConfig {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /** 기아 현상 방지를 위해 대기 프레임당 부여할 거리 감산 가중치. */
  readonly agingBoostPerFrame?: number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function sanitizePositiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

/** W3C Compositing Level 1 명세에 따른 단일 색 채널(0..1) 분리형 블렌드 커널. */
export function evaluateSeparableBlendChannel(
  backdropChannel: number,
  sourceChannel: number,
  mode: WebGpuBlendMode,
): number {
  const cb = clampUnit(backdropChannel);
  const cs = clampUnit(sourceChannel);
  switch (mode) {
    case "normal":
      return cs;
    case "multiply":
      return cb * cs;
    case "screen":
      return cb + cs - cb * cs;
    case "overlay":
      return cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case "color-dodge":
      if (cb <= 0) return 0;
      return cs >= 1 ? 1 : Math.min(1, cb / (1 - cs));
    case "linear-burn":
      return Math.max(0, cb + cs - 1);
  }
}

/** 직선 알파(Straight Alpha) RGBA 튜플을 프리멀티플라이드 알파 튜플로 변환한다. */
export function straightToPremultipliedRgba(rgba: RgbaColorTuple): RgbaColorTuple {
  const a = clampUnit(rgba[3]);
  if (a === 0) return [0, 0, 0, 0];
  return [clampUnit(rgba[0]) * a, clampUnit(rgba[1]) * a, clampUnit(rgba[2]) * a, a];
}

/** 프리멀티플라이드 알파 RGBA 튜플을 직선 알파 튜플로 역변환한다. */
export function premultipliedToStraightRgba(premul: RgbaColorTuple): RgbaColorTuple {
  const a = clampUnit(premul[3]);
  if (a <= 1e-12) return [0, 0, 0, 0];
  return [clampUnit(premul[0] / a), clampUnit(premul[1] / a), clampUnit(premul[2] / a), a];
}

function blendPremultipliedChannel(
  cbPremul: number,
  ab: number,
  csPremul: number,
  as: number,
  mode: WebGpuBlendMode,
): number {
  if (as <= 0) return cbPremul;
  if (ab <= 0) return csPremul;
  const invAb = 1 - ab;
  const invAs = 1 - as;

  switch (mode) {
    case "normal":
      return csPremul + invAs * cbPremul;
    case "multiply":
      return invAb * csPremul + invAs * cbPremul + cbPremul * csPremul;
    case "screen":
      return csPremul + cbPremul - cbPremul * csPremul;
    case "overlay": {
      const mixed =
        2 * cbPremul <= ab
          ? 2 * cbPremul * csPremul
          : ab * as - 2 * (ab - cbPremul) * (as - csPremul);
      return invAb * csPremul + invAs * cbPremul + mixed;
    }
    case "color-dodge": {
      let dodge = 0;
      if (cbPremul > 0) {
        dodge =
          csPremul >= as ? ab * as : Math.min(ab * as, (cbPremul * as * as) / (as - csPremul));
      }
      return invAb * csPremul + invAs * cbPremul + dodge;
    }
    case "linear-burn":
      return invAb * csPremul + invAs * cbPremul + Math.max(0, as * cbPremul + ab * csPremul - ab * as);
  }
}

/** 프리멀티플라이드 알파 공간에서 Porter-Duff source-over + 웹툰 블렌드 모드를 합성한다. */
export function blendPremultipliedRgba(
  backdropPremul: RgbaColorTuple,
  sourcePremul: RgbaColorTuple,
  mode: WebGpuBlendMode,
  opacity = 1,
): RgbaColorTuple {
  const op = clampUnit(opacity);
  const ab = clampUnit(backdropPremul[3]);
  const cbR = Math.min(ab, clampUnit(backdropPremul[0]));
  const cbG = Math.min(ab, clampUnit(backdropPremul[1]));
  const cbB = Math.min(ab, clampUnit(backdropPremul[2]));

  const rawAs = clampUnit(sourcePremul[3]);
  const as = rawAs * op;
  if (as <= 0) return [cbR, cbG, cbB, ab];

  const csR = Math.min(rawAs, clampUnit(sourcePremul[0])) * op;
  const csG = Math.min(rawAs, clampUnit(sourcePremul[1])) * op;
  const csB = Math.min(rawAs, clampUnit(sourcePremul[2])) * op;

  const outA = clampUnit(as + ab * (1 - as));
  return [
    Math.min(outA, clampUnit(blendPremultipliedChannel(cbR, ab, csR, as, mode))),
    Math.min(outA, clampUnit(blendPremultipliedChannel(cbG, ab, csG, as, mode))),
    Math.min(outA, clampUnit(blendPremultipliedChannel(cbB, ab, csB, as, mode))),
    outA,
  ];
}

/** 직선 알파 공간에서 두 RGBA 색상을 W3C Porter-Duff source-over + 블렌드 모드로 합성한다. */
export function blendStraightRgba(
  backdropStraight: RgbaColorTuple,
  sourceStraight: RgbaColorTuple,
  mode: WebGpuBlendMode,
  opacity = 1,
): RgbaColorTuple {
  const ab = clampUnit(backdropStraight[3]);
  const as = clampUnit(sourceStraight[3]) * clampUnit(opacity);
  if (as <= 0) {
    return ab <= 0
      ? [0, 0, 0, 0]
      : [clampUnit(backdropStraight[0]), clampUnit(backdropStraight[1]), clampUnit(backdropStraight[2]), ab];
  }
  const outA = clampUnit(as + ab * (1 - as));
  if (outA <= 1e-12) return [0, 0, 0, 0];

  const invAb = 1 - ab;
  const invAs = 1 - as;
  const channels: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const cb = clampUnit(backdropStraight[c] ?? 0);
    const cs = clampUnit(sourceStraight[c] ?? 0);
    const blended = evaluateSeparableBlendChannel(cb, cs, mode);
    channels[c] = clampUnit((invAb * as * cs + invAs * ab * cb + ab * as * blended) / outA);
  }
  return [channels[0], channels[1], channels[2], outA];
}

/** 단일 타일 영역에 대해 바닥부터 최상단 레이어까지 프리멀티플라이드 스택을 합성한다. */
export function compositeTileLayerStackPremultiplied(
  layersBottomToTop: ReadonlyArray<PremultipliedLayerTileInput>,
  tileWidthPx = WEBGPU_TILE_SIZE_PX,
  tileHeightPx = WEBGPU_TILE_SIZE_PX,
  backdropPremul: RgbaColorTuple = [0, 0, 0, 0],
): Float32Array {
  const safeW = sanitizePositiveInt(tileWidthPx, WEBGPU_TILE_SIZE_PX);
  const safeH = sanitizePositiveInt(tileHeightPx, WEBGPU_TILE_SIZE_PX);
  const pixelCount = safeW * safeH;
  const out = new Float32Array(pixelCount * 4);

  const baseA = clampUnit(backdropPremul[3]);
  const baseR = Math.min(baseA, clampUnit(backdropPremul[0]));
  const baseG = Math.min(baseA, clampUnit(backdropPremul[1]));
  const baseB = Math.min(baseA, clampUnit(backdropPremul[2]));

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    out[off] = baseR;
    out[off + 1] = baseG;
    out[off + 2] = baseB;
    out[off + 3] = baseA;
  }

  for (const layer of layersBottomToTop) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const src = layer.premultipliedRgba;
    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4;
      const srcA = src[off + 3] ?? 0;
      if (srcA <= 0) continue;
      const merged = blendPremultipliedRgba(
        [out[off] ?? 0, out[off + 1] ?? 0, out[off + 2] ?? 0, out[off + 3] ?? 0],
        [src[off] ?? 0, src[off + 1] ?? 0, src[off + 2] ?? 0, srcA],
        layer.blendMode,
        layer.opacity,
      );
      out[off] = merged[0];
      out[off + 1] = merged[1];
      out[off + 2] = merged[2];
      out[off + 3] = merged[3];
    }
  }
  return out;
}

/** 투명 경계 선화의 검은 번짐(Dark Halo)을 막는 프리멀티플라이드 2x2 박스 필터 다운샘플러. */
export function downsamplePremultipliedMip2x2(
  srcPremulRgba: Float32Array,
  srcWidthPx: number,
  srcHeightPx: number,
): { readonly widthPx: number; readonly heightPx: number; readonly data: Float32Array } {
  const safeSrcW = sanitizePositiveInt(srcWidthPx, 1);
  const safeSrcH = sanitizePositiveInt(srcHeightPx, 1);
  const dstW = Math.max(1, safeSrcW >>> 1);
  const dstH = Math.max(1, safeSrcH >>> 1);
  const dst = new Float32Array(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy += 1) {
    const sy0 = Math.min(safeSrcH - 1, dy * 2);
    const sy1 = Math.min(safeSrcH - 1, dy * 2 + 1);
    for (let dx = 0; dx < dstW; dx += 1) {
      const sx0 = Math.min(safeSrcW - 1, dx * 2);
      const sx1 = Math.min(safeSrcW - 1, dx * 2 + 1);
      const offsets = [
        (sy0 * safeSrcW + sx0) * 4,
        (sy0 * safeSrcW + sx1) * 4,
        (sy1 * safeSrcW + sx0) * 4,
        (sy1 * safeSrcW + sx1) * 4,
      ];
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      for (const idx of offsets) {
        sumR += srcPremulRgba[idx] ?? 0;
        sumG += srcPremulRgba[idx + 1] ?? 0;
        sumB += srcPremulRgba[idx + 2] ?? 0;
        sumA += srcPremulRgba[idx + 3] ?? 0;
      }
      const outIdx = (dy * dstW + dx) * 4;
      dst[outIdx] = sumR * 0.25;
      dst[outIdx + 1] = sumG * 0.25;
      dst[outIdx + 2] = sumB * 0.25;
      dst[outIdx + 3] = sumA * 0.25;
    }
  }
  return { widthPx: dstW, heightPx: dstH, data: dst };
}

/** 캔버스 해상도에 대한 전체 WebGPU 밉맵 체인(Level 0 .. Level N, 최소 1x1) 차원을 계산한다. */
export function computeMipPyramidDimensions(
  canvasWidthPx: number,
  canvasHeightPx: number,
): ReadonlyArray<MipLevelDimensions> {
  let widthPx = sanitizePositiveInt(canvasWidthPx, 1);
  let heightPx = sanitizePositiveInt(canvasHeightPx, 1);
  const levels: MipLevelDimensions[] = [];
  let level = 0;
  for (;;) {
    levels.push({
      level,
      widthPx,
      heightPx,
      tilesX: Math.ceil(widthPx / WEBGPU_TILE_SIZE_PX),
      tilesY: Math.ceil(heightPx / WEBGPU_TILE_SIZE_PX),
    });
    if (widthPx === 1 && heightPx === 1) break;
    widthPx = Math.max(1, widthPx >>> 1);
    heightPx = Math.max(1, heightPx >>> 1);
    level += 1;
  }
  return levels;
}

/** Level 0 더티 타일 집합을 Level 0 -> Level N 밉맵 피라미드 전역으로 중복 없이 전파한다. */
export function propagateDirtyTilesToMipPyramid(
  level0DirtyTiles: ReadonlyArray<DirtyTileCoord>,
  canvasWidthPx: number,
  canvasHeightPx: number,
): ReadonlyArray<MipDirtyPyramidLevel> {
  const dimensions = computeMipPyramidDimensions(canvasWidthPx, canvasHeightPx);
  if (level0DirtyTiles.length === 0) {
    return dimensions.map((d) => ({ level: d.level, widthPx: d.widthPx, heightPx: d.heightPx, dirtyTiles: [] }));
  }
  const level0Dim = dimensions[0];
  if (!level0Dim) return [];

  const dedupedLevel0 = new Map<number, DirtyTileCoord>();
  for (const tile of level0DirtyTiles) {
    if (tile.tileX >= 0 && tile.tileY >= 0 && tile.tileX < level0Dim.tilesX && tile.tileY < level0Dim.tilesY) {
      dedupedLevel0.set(tile.tileY * level0Dim.tilesX + tile.tileX, { tileX: tile.tileX, tileY: tile.tileY });
    }
  }

  let currentTiles = [...dedupedLevel0.values()].sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX);
  const pyramid: MipDirtyPyramidLevel[] = [];

  for (let idx = 0; idx < dimensions.length; idx += 1) {
    const dim = dimensions[idx];
    if (!dim) continue;
    pyramid.push({ level: dim.level, widthPx: dim.widthPx, heightPx: dim.heightPx, dirtyTiles: currentTiles });
    const nextDim = dimensions[idx + 1];
    if (!nextDim) break;

    const parentMap = new Map<number, DirtyTileCoord>();
    for (const tile of currentTiles) {
      const parentX = Math.min(nextDim.tilesX - 1, tile.tileX >>> 1);
      const parentY = Math.min(nextDim.tilesY - 1, tile.tileY >>> 1);
      const parentKey = parentY * nextDim.tilesX + parentX;
      if (!parentMap.has(parentKey)) parentMap.set(parentKey, { tileX: parentX, tileY: parentY });
    }
    currentTiles = [...parentMap.values()].sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX);
  }
  return pyramid;
}

/** 인접 64x64 더티 타일을 가로·세로 2D 병합하여 최소 개수의 WebGPU 디스패치 직사각형으로 압축한다. */
export function coalesceDirtyTilesIntoDispatchRects(
  dirtyTiles: ReadonlyArray<DirtyTileCoord>,
  canvasWidthPx: number,
  canvasHeightPx: number,
  options?: TileCoalescingOptions,
): ReadonlyArray<CoalescedTileDispatchRect> {
  if (dirtyTiles.length === 0) return [];
  const safeCanvasW = sanitizePositiveInt(canvasWidthPx, WEBGPU_TILE_SIZE_PX);
  const safeCanvasH = sanitizePositiveInt(canvasHeightPx, WEBGPU_TILE_SIZE_PX);
  const maxTilesX = Math.ceil(safeCanvasW / WEBGPU_TILE_SIZE_PX);
  const maxTilesY = Math.ceil(safeCanvasH / WEBGPU_TILE_SIZE_PX);
  const maxMergeW = sanitizePositiveInt(options?.maxMergedWidthTiles ?? 8, 8);
  const maxMergeH = sanitizePositiveInt(options?.maxMergedHeightTiles ?? 8, 8);

  const uniqueByKey = new Map<number, DirtyTileCoord>();
  for (const tile of dirtyTiles) {
    if (tile.tileX >= 0 && tile.tileY >= 0 && tile.tileX < maxTilesX && tile.tileY < maxTilesY) {
      uniqueByKey.set(tile.tileY * maxTilesX + tile.tileX, { tileX: tile.tileX, tileY: tile.tileY });
    }
  }
  const sorted = [...uniqueByKey.values()].sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX);
  if (sorted.length === 0) return [];

  interface RowSpan {
    tileX: number;
    tileY: number;
    tileWidth: number;
    tileHeight: number;
  }

  const rowSpansByY = new Map<number, RowSpan[]>();
  let idx = 0;
  while (idx < sorted.length) {
    const first = sorted[idx];
    if (!first) break;
    const rowY = first.tileY;
    let spanStart = first.tileX;
    let spanWidth = 1;
    idx += 1;

    while (idx < sorted.length) {
      const next = sorted[idx];
      if (!next || next.tileY !== rowY) break;
      if (next.tileX === spanStart + spanWidth && spanWidth < maxMergeW) {
        spanWidth += 1;
      } else {
        const list = rowSpansByY.get(rowY) ?? [];
        list.push({ tileX: spanStart, tileY: rowY, tileWidth: spanWidth, tileHeight: 1 });
        rowSpansByY.set(rowY, list);
        spanStart = next.tileX;
        spanWidth = 1;
      }
      idx += 1;
    }
    const list = rowSpansByY.get(rowY) ?? [];
    list.push({ tileX: spanStart, tileY: rowY, tileWidth: spanWidth, tileHeight: 1 });
    rowSpansByY.set(rowY, list);
  }

  const activeBySig = new Map<string, RowSpan>();
  const finalized: RowSpan[] = [];
  for (const rowY of [...rowSpansByY.keys()].sort((a, b) => a - b)) {
    const nextActive = new Map<string, RowSpan>();
    for (const span of rowSpansByY.get(rowY) ?? []) {
      const sig = `${span.tileX}:${span.tileWidth}`;
      const prev = activeBySig.get(sig);
      if (prev && prev.tileY + prev.tileHeight === rowY && prev.tileHeight < maxMergeH) {
        prev.tileHeight += 1;
        nextActive.set(sig, prev);
        activeBySig.delete(sig);
      } else {
        nextActive.set(sig, { ...span });
      }
    }
    for (const leftover of activeBySig.values()) finalized.push(leftover);
    activeBySig.clear();
    for (const [sig, active] of nextActive.entries()) activeBySig.set(sig, active);
  }
  for (const leftover of activeBySig.values()) finalized.push(leftover);

  finalized.sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX);
  return finalized.map((rect) => {
    const pxX = rect.tileX * WEBGPU_TILE_SIZE_PX;
    const pxY = rect.tileY * WEBGPU_TILE_SIZE_PX;
    const pxWidth = Math.max(1, Math.min(safeCanvasW, (rect.tileX + rect.tileWidth) * WEBGPU_TILE_SIZE_PX) - pxX);
    const pxHeight = Math.max(1, Math.min(safeCanvasH, (rect.tileY + rect.tileHeight) * WEBGPU_TILE_SIZE_PX) - pxY);
    return {
      tileX: rect.tileX,
      tileY: rect.tileY,
      tileWidth: rect.tileWidth,
      tileHeight: rect.tileHeight,
      pixelRect: { x: pxX, y: pxY, width: pxWidth, height: pxHeight },
      workgroupCountX: Math.ceil(pxWidth / 8),
      workgroupCountY: Math.ceil(pxHeight / 8),
    };
  });
}

function pointToSegmentDistSq(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-12) return (px - x0) * (px - x0) + (py - y0) * (py - y0);
  const t = clampUnit(((px - x0) * vx + (py - y0) * vy) / lenSq);
  const dx = px - (x0 + t * vx);
  const dy = py - (y0 + t * vy);
  return dx * dx + dy * dy;
}

/** 60/120Hz 스타일러스 입력을 위한 비트셋 기반 결정론적 WebGPU 더티 타일 합성 스케줄러. */
export class WebGpuDirtyTileMipmapCompositor {
  public readonly canvasWidthPx: number;
  public readonly canvasHeightPx: number;
  public readonly tilesX: number;
  public readonly tilesY: number;

  private readonly dirtyWords: Uint32Array;
  private readonly dirtyAges: Uint16Array;
  private readonly agingBoostPerFrame: number;
  private dirtyCount = 0;
  private frameCounter = 0;

  public constructor(config: WebGpuCompositorConfig) {
    this.canvasWidthPx = sanitizePositiveInt(config.canvasWidthPx, WEBGPU_TILE_SIZE_PX);
    this.canvasHeightPx = sanitizePositiveInt(config.canvasHeightPx, WEBGPU_TILE_SIZE_PX);
    this.tilesX = Math.ceil(this.canvasWidthPx / WEBGPU_TILE_SIZE_PX);
    this.tilesY = Math.ceil(this.canvasHeightPx / WEBGPU_TILE_SIZE_PX);
    const totalTiles = this.tilesX * this.tilesY;
    this.dirtyWords = new Uint32Array(Math.ceil(totalTiles / 32));
    this.dirtyAges = new Uint16Array(totalTiles);
    this.agingBoostPerFrame = Math.max(0, config.agingBoostPerFrame ?? 96);
  }

  public get pendingDirtyTileCount(): number {
    return this.dirtyCount;
  }

  public isTileDirty(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= this.tilesX || tileY >= this.tilesY) return false;
    const bitIndex = tileY * this.tilesX + tileX;
    return ((this.dirtyWords[bitIndex >>> 5] ?? 0) & (1 << (bitIndex & 31))) !== 0;
  }

  public markDirtyTile(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= this.tilesX || tileY >= this.tilesY) return false;
    const bitIndex = tileY * this.tilesX + tileX;
    const wordIdx = bitIndex >>> 5;
    const mask = 1 << (bitIndex & 31);
    const prevWord = this.dirtyWords[wordIdx] ?? 0;
    if ((prevWord & mask) !== 0) return false;
    this.dirtyWords[wordIdx] = prevWord | mask;
    this.dirtyAges[bitIndex] = 0;
    this.dirtyCount += 1;
    return true;
  }

  /** 픽셀 단위 사각형 영역과 교차하는 모든 64x64 타일을 더티 상태로 표시한다. */
  public markDirtyPixelRect(rect: CanvasPixelRect): number {
    if (rect.width <= 0 || rect.height <= 0) return 0;
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(this.canvasWidthPx, Math.ceil(rect.x + rect.width));
    const y1 = Math.min(this.canvasHeightPx, Math.ceil(rect.y + rect.height));
    if (x1 <= x0 || y1 <= y0) return 0;

    const minTx = Math.floor(x0 / WEBGPU_TILE_SIZE_PX);
    const maxTx = Math.min(this.tilesX - 1, Math.floor((x1 - 1) / WEBGPU_TILE_SIZE_PX));
    const minTy = Math.floor(y0 / WEBGPU_TILE_SIZE_PX);
    const maxTy = Math.min(this.tilesY - 1, Math.floor((y1 - 1) / WEBGPU_TILE_SIZE_PX));

    let newlyMarked = 0;
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        if (this.markDirtyTile(tx, ty)) newlyMarked += 1;
      }
    }
    return newlyMarked;
  }

  /** 스타일러스 연속 샘플 캡슐(Swept Circle)과 실제 교차하는 64x64 타일만 정밀 마킹한다. */
  public markDirtyStylusCapsule(x0: number, y0: number, x1: number, y1: number, radiusPx: number): number {
    const safeRadius = Math.max(0.5, Number.isFinite(radiusPx) ? radiusPx : 1);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - safeRadius));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - safeRadius));
    const maxX = Math.min(this.canvasWidthPx, Math.ceil(Math.max(x0, x1) + safeRadius));
    const maxY = Math.min(this.canvasHeightPx, Math.ceil(Math.max(y0, y1) + safeRadius));
    if (maxX <= minX || maxY <= minY) return 0;

    const minTx = Math.floor(minX / WEBGPU_TILE_SIZE_PX);
    const maxTx = Math.min(this.tilesX - 1, Math.floor((maxX - 1) / WEBGPU_TILE_SIZE_PX));
    const minTy = Math.floor(minY / WEBGPU_TILE_SIZE_PX);
    const maxTy = Math.min(this.tilesY - 1, Math.floor((maxY - 1) / WEBGPU_TILE_SIZE_PX));
    const limitSq = (safeRadius + Math.SQRT1_2 * WEBGPU_TILE_SIZE_PX) ** 2;

    let newlyMarked = 0;
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      const cy = (ty + 0.5) * WEBGPU_TILE_SIZE_PX;
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const cx = (tx + 0.5) * WEBGPU_TILE_SIZE_PX;
        if (pointToSegmentDistSq(cx, cy, x0, y0, x1, y1) <= limitSq && this.markDirtyTile(tx, ty)) {
          newlyMarked += 1;
        }
      }
    }
    return newlyMarked;
  }

  /** 프레임 예산 내에서 뷰포트 초점 우선순위(Foveated Priority)로 더티 타일을 분할 스케줄링한다. */
  public scheduleFrameComposition(
    viewport: FoveatedViewportSpec,
    budget: WebGpuCompositorBudget,
    coalescingOptions?: TileCoalescingOptions,
  ): DirtyTileFrameSchedule {
    this.frameCounter += 1;
    if (this.dirtyCount === 0) {
      return {
        frameIndex: this.frameCounter,
        scheduledTiles: [],
        coalescedDispatches: [],
        mipDirtyPyramid: propagateDirtyTilesToMipPyramid([], this.canvasWidthPx, this.canvasHeightPx),
        deferredTileCount: 0,
        consumedVramBytes: 0,
        inViewportScheduledCount: 0,
      };
    }

    const bytesPerTile = sanitizePositiveInt(budget.bytesPerTile ?? DEFAULT_BYTES_PER_TILE, DEFAULT_BYTES_PER_TILE);
    const maxByVram = Math.max(1, Math.floor(budget.maxTransientVramBytesPerFrame / bytesPerTile));
    const tileCap = Math.min(sanitizePositiveInt(budget.maxTilesPerFrame, 1), maxByVram);
    const maxDispatches = sanitizePositiveInt(budget.maxDispatchCountPerFrame, 1);

    const vp = viewport.viewportRectPx;
    const vpRight = vp.x + Math.max(0, vp.width);
    const vpBottom = vp.y + Math.max(0, vp.height);
    const focusX = viewport.focusX ?? vp.x + Math.max(0, vp.width) * 0.5;
    const focusY = viewport.focusY ?? vp.y + Math.max(0, vp.height) * 0.5;

    interface CandidateTile {
      readonly bitIndex: number;
      readonly tileX: number;
      readonly tileY: number;
      readonly inViewport: boolean;
      readonly priorityScore: number;
    }

    const candidates: CandidateTile[] = [];
    for (let wordIdx = 0; wordIdx < this.dirtyWords.length; wordIdx += 1) {
      let bits = this.dirtyWords[wordIdx] ?? 0;
      while (bits !== 0) {
        const tz = 31 - Math.clz32(bits & -bits);
        const bitIndex = (wordIdx << 5) + tz;
        bits &= bits - 1;

        const tileY = Math.floor(bitIndex / this.tilesX);
        const tileX = bitIndex - tileY * this.tilesX;
        const px0 = tileX * WEBGPU_TILE_SIZE_PX;
        const py0 = tileY * WEBGPU_TILE_SIZE_PX;
        const inViewport =
          px0 + WEBGPU_TILE_SIZE_PX > vp.x && px0 < vpRight && py0 + WEBGPU_TILE_SIZE_PX > vp.y && py0 < vpBottom;
        const distPx = Math.hypot(px0 + WEBGPU_TILE_SIZE_PX * 0.5 - focusX, py0 + WEBGPU_TILE_SIZE_PX * 0.5 - focusY);
        const priorityScore =
          (inViewport ? 0 : 1_000_000) + distPx - (this.dirtyAges[bitIndex] ?? 0) * this.agingBoostPerFrame;
        candidates.push({ bitIndex, tileX, tileY, inViewport, priorityScore });
      }
    }

    candidates.sort((a, b) => a.priorityScore - b.priorityScore || a.tileY - b.tileY || a.tileX - b.tileX);

    let chosenSlice = candidates.slice(0, Math.min(candidates.length, tileCap));
    let coalesced = coalesceDirtyTilesIntoDispatchRects(
      chosenSlice,
      this.canvasWidthPx,
      this.canvasHeightPx,
      coalescingOptions,
    );
    while (coalesced.length > maxDispatches && chosenSlice.length > 1) {
      chosenSlice = chosenSlice.slice(0, Math.max(1, chosenSlice.length - (coalesced.length - maxDispatches)));
      coalesced = coalesceDirtyTilesIntoDispatchRects(
        chosenSlice,
        this.canvasWidthPx,
        this.canvasHeightPx,
        coalescingOptions,
      );
    }

    const scheduledBitSet = new Set<number>();
    let inViewportScheduledCount = 0;
    for (const item of chosenSlice) {
      scheduledBitSet.add(item.bitIndex);
      if (item.inViewport) inViewportScheduledCount += 1;
      const wIdx = item.bitIndex >>> 5;
      this.dirtyWords[wIdx] = (this.dirtyWords[wIdx] ?? 0) & ~(1 << (item.bitIndex & 31));
      this.dirtyAges[item.bitIndex] = 0;
      this.dirtyCount -= 1;
    }
    for (const item of candidates) {
      if (!scheduledBitSet.has(item.bitIndex)) {
        this.dirtyAges[item.bitIndex] = Math.min(65535, (this.dirtyAges[item.bitIndex] ?? 0) + 1);
      }
    }

    const scheduledTiles: DirtyTileCoord[] = chosenSlice
      .map((c) => ({ tileX: c.tileX, tileY: c.tileY }))
      .sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX);

    return {
      frameIndex: this.frameCounter,
      scheduledTiles,
      coalescedDispatches: coalesced,
      mipDirtyPyramid: propagateDirtyTilesToMipPyramid(scheduledTiles, this.canvasWidthPx, this.canvasHeightPx),
      deferredTileCount: this.dirtyCount,
      consumedVramBytes: scheduledTiles.length * bytesPerTile,
      inViewportScheduledCount,
    };
  }
}
