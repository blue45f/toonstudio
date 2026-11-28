/**
 * Wave 140 — 8K 멀티페이지 타일 피라미드(MIP 0..4) 정본 주소 체계 및 기하 유틸리티.
 *
 * - 초장편 세로 스크롤 웹툰(`1600×64000px`)과 60페이지 8K 원고를 256×256px 타일 피라미드로 통합 주소화한다.
 * - `TileKey` 직렬화/역직렬화, MIP별 격자 치수, 월드 바운딩 박스, 상위 저해상도 폴백 조상 체인을 제공한다.
 */

import { clampInt } from "./tile-streaming-sha256";

export type TileMipLevel = 0 | 1 | 2 | 3 | 4;

export type TilePriorityClass =
  | "visible-critical"
  | "coarse-mip-fallback"
  | "predictive-prefetch";

export type TileKeyId = string;

export interface TileKey {
  readonly pageIndex: number;
  readonly mipLevel: TileMipLevel;
  readonly tx: number;
  readonly ty: number;
}

export interface WorldRect2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CanvasPageGeometry {
  readonly pageIndex: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly worldOffsetX: number;
  readonly worldOffsetY: number;
}

export interface MultiPageCanvasSpec {
  readonly label: string;
  readonly tileSizePx: number;
  readonly bytesPerPixel: number;
  readonly maxMipLevel: TileMipLevel;
  readonly pages: readonly CanvasPageGeometry[];
  readonly totalWorldWidthPx: number;
  readonly totalWorldHeightPx: number;
}

export interface MipGridDimensions {
  readonly mipLevel: TileMipLevel;
  readonly mipScaleDivisor: number;
  readonly mipWidthPx: number;
  readonly mipHeightPx: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly totalTiles: number;
}

export const MIN_TILE_MIP_LEVEL: TileMipLevel = 0;
export const MAX_TILE_MIP_LEVEL: TileMipLevel = 4;
export const DEFAULT_TILE_SIZE_PX = 256;
export const DEFAULT_BYTES_PER_PIXEL = 4;

/** 임의 숫자를 유효한 MIP 레벨(0..4)로 안전하게 고정한다. */
export function clampTileMipLevel(
  level: number,
  maxMip: TileMipLevel = MAX_TILE_MIP_LEVEL,
): TileMipLevel {
  const boundedMax = clampInt(maxMip, MIN_TILE_MIP_LEVEL, MAX_TILE_MIP_LEVEL, MAX_TILE_MIP_LEVEL);
  const clamped = clampInt(level, MIN_TILE_MIP_LEVEL, boundedMax, 0);
  if (clamped <= 0) return 0;
  if (clamped === 1) return 1;
  if (clamped === 2) return 2;
  if (clamped === 3) return 3;
  return 4;
}

/** 타일 1장의 바이트 크기를 계산한다(기본 256×256×4 = 262,144B). */
export function computeTileByteSize(
  tileSizePx: number = DEFAULT_TILE_SIZE_PX,
  bytesPerPixel: number = DEFAULT_BYTES_PER_PIXEL,
): number {
  const safeSize = clampInt(tileSizePx, 32, 2048, DEFAULT_TILE_SIZE_PX);
  const safeBpp = clampInt(bytesPerPixel, 1, 16, DEFAULT_BYTES_PER_PIXEL);
  return safeSize * safeSize * safeBpp;
}

/** `TileKey`를 결정론적 정본 식별 문자열(`p{page}:m{mip}:x{tx}:y{ty}`)로 직렬화한다. */
export function encodeTileKey(key: TileKey): TileKeyId {
  const page = Math.max(0, Math.floor(key.pageIndex));
  const mip = clampTileMipLevel(key.mipLevel);
  const tx = Math.max(0, Math.floor(key.tx));
  const ty = Math.max(0, Math.floor(key.ty));
  return `p${String(page)}:m${String(mip)}:x${String(tx)}:y${String(ty)}`;
}

/** 직렬화된 타일 키 문자열을 `TileKey`로 복원한다. 유효하지 않으면 `null`을 반환한다. */
export function parseTileKey(keyId: string): TileKey | null {
  const match = /^p(\d+):m([0-4]):x(\d+):y(\d+)$/.exec(keyId.trim());
  if (!match) {
    return null;
  }
  return {
    pageIndex: Number(match[1]),
    mipLevel: clampTileMipLevel(Number(match[2])),
    tx: Number(match[3]),
    ty: Number(match[4]),
  };
}

/** 초장편 웹툰 8K 세로 캔버스(`1600×64000px`, 256px 타일, MIP 0..4) 기본 명세를 생성한다. */
export function createWebtoon8kVerticalSpec(options?: {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly tileSizePx?: number;
  readonly bytesPerPixel?: number;
  readonly label?: string;
}): MultiPageCanvasSpec {
  const widthPx = clampInt(options?.widthPx ?? 1600, 256, 32768, 1600);
  const heightPx = clampInt(options?.heightPx ?? 64000, 256, 262144, 64000);
  const tileSizePx = clampInt(options?.tileSizePx ?? DEFAULT_TILE_SIZE_PX, 64, 1024, DEFAULT_TILE_SIZE_PX);
  const bytesPerPixel = clampInt(options?.bytesPerPixel ?? DEFAULT_BYTES_PER_PIXEL, 1, 16, DEFAULT_BYTES_PER_PIXEL);
  const page: CanvasPageGeometry = {
    pageIndex: 0,
    widthPx,
    heightPx,
    worldOffsetX: 0,
    worldOffsetY: 0,
  };
  return {
    label: options?.label ?? `8K 세로 웹툰 원고 (${String(widthPx)}×${String(heightPx)}px)`,
    tileSizePx,
    bytesPerPixel,
    maxMipLevel: MAX_TILE_MIP_LEVEL,
    pages: [page],
    totalWorldWidthPx: widthPx,
    totalWorldHeightPx: heightPx,
  };
}

/** 다중 페이지(기본 60페이지) 8K 원고 캔버스 명세를 생성한다. */
export function createMultiPage8kManuscriptSpec(options?: {
  readonly pageCount?: number;
  readonly pageWidthPx?: number;
  readonly pageHeightPx?: number;
  readonly pageGapPx?: number;
  readonly tileSizePx?: number;
  readonly bytesPerPixel?: number;
  readonly label?: string;
}): MultiPageCanvasSpec {
  const pageCount = clampInt(options?.pageCount ?? 60, 1, 256, 60);
  const pageWidthPx = clampInt(options?.pageWidthPx ?? 4096, 256, 16384, 4096);
  const pageHeightPx = clampInt(options?.pageHeightPx ?? 5632, 256, 16384, 5632);
  const pageGapPx = clampInt(options?.pageGapPx ?? 64, 0, 1024, 64);
  const tileSizePx = clampInt(options?.tileSizePx ?? DEFAULT_TILE_SIZE_PX, 64, 1024, DEFAULT_TILE_SIZE_PX);
  const bytesPerPixel = clampInt(options?.bytesPerPixel ?? DEFAULT_BYTES_PER_PIXEL, 1, 16, DEFAULT_BYTES_PER_PIXEL);

  const pages: CanvasPageGeometry[] = [];
  let offsetY = 0;
  for (let i = 0; i < pageCount; i += 1) {
    pages.push({
      pageIndex: i,
      widthPx: pageWidthPx,
      heightPx: pageHeightPx,
      worldOffsetX: 0,
      worldOffsetY: offsetY,
    });
    offsetY += pageHeightPx + (i + 1 < pageCount ? pageGapPx : 0);
  }
  return {
    label:
      options?.label ??
      `${String(pageCount)}페이지 8K 원고 (${String(pageWidthPx)}×${String(pageHeightPx)}px/p)`,
    tileSizePx,
    bytesPerPixel,
    maxMipLevel: MAX_TILE_MIP_LEVEL,
    pages,
    totalWorldWidthPx: pageWidthPx,
    totalWorldHeightPx: offsetY,
  };
}

/** 특정 페이지와 MIP 레벨의 타일 격자 치수를 계산한다. */
export function computeMipGridDimensions(
  page: CanvasPageGeometry,
  mipLevel: TileMipLevel,
  tileSizePx: number = DEFAULT_TILE_SIZE_PX,
): MipGridDimensions {
  const mip = clampTileMipLevel(mipLevel);
  const safeTile = clampInt(tileSizePx, 32, 2048, DEFAULT_TILE_SIZE_PX);
  const mipScaleDivisor = 1 << mip;
  const mipWidthPx = Math.max(1, Math.ceil(page.widthPx / mipScaleDivisor));
  const mipHeightPx = Math.max(1, Math.ceil(page.heightPx / mipScaleDivisor));
  const tilesX = Math.max(1, Math.ceil(mipWidthPx / safeTile));
  const tilesY = Math.max(1, Math.ceil(mipHeightPx / safeTile));
  return {
    mipLevel: mip,
    mipScaleDivisor,
    mipWidthPx,
    mipHeightPx,
    tilesX,
    tilesY,
    totalTiles: tilesX * tilesY,
  };
}

/** 전체 캔버스 피라미드(MIP 0..maxMip)의 총 타일 개수와 비압축 용량(바이트)을 집계한다. */
export function computePyramidTotals(spec: MultiPageCanvasSpec): {
  readonly perMipTileCounts: readonly number[];
  readonly totalTiles: number;
  readonly mip0Bytes: number;
  readonly coarseTopMipBytes: number;
  readonly allMipsBytes: number;
} {
  const tileBytes = computeTileByteSize(spec.tileSizePx, spec.bytesPerPixel);
  const counts: number[] = [];
  for (let mip = 0; mip <= spec.maxMipLevel; mip += 1) {
    let mipSum = 0;
    const typedMip = clampTileMipLevel(mip, spec.maxMipLevel);
    for (let p = 0; p < spec.pages.length; p += 1) {
      mipSum += computeMipGridDimensions(spec.pages[p], typedMip, spec.tileSizePx).totalTiles;
    }
    counts.push(mipSum);
  }
  let totalTiles = 0;
  for (let i = 0; i < counts.length; i += 1) {
    totalTiles += counts[i];
  }
  const mip0Tiles = counts[0] ?? 0;
  const topMipTiles = counts[counts.length - 1] ?? 0;
  return {
    perMipTileCounts: counts,
    totalTiles,
    mip0Bytes: mip0Tiles * tileBytes,
    coarseTopMipBytes: topMipTiles * tileBytes,
    allMipsBytes: totalTiles * tileBytes,
  };
}

/** 단일 타일이 차지하는 월드 좌표 사각형(`WorldRect2D`)을 반환한다. */
export function getTileWorldBounds(
  spec: MultiPageCanvasSpec,
  key: TileKey,
): WorldRect2D {
  const page = spec.pages[key.pageIndex];
  if (!page) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const tileSpanWorld = spec.tileSizePx * (1 << clampTileMipLevel(key.mipLevel, spec.maxMipLevel));
  const localMinX = key.tx * tileSpanWorld;
  const localMinY = key.ty * tileSpanWorld;
  const localMaxX = Math.min(page.widthPx, localMinX + tileSpanWorld);
  const localMaxY = Math.min(page.heightPx, localMinY + tileSpanWorld);
  return {
    minX: page.worldOffsetX + localMinX,
    minY: page.worldOffsetY + localMinY,
    maxX: page.worldOffsetX + Math.max(localMinX, localMaxX),
    maxY: page.worldOffsetY + Math.max(localMinY, localMaxY),
  };
}

/** 주어진 타일의 상위 저해상도(Coarser) 부모 타일 키를 반환한다. 최상위 MIP이면 `null`. */
export function getParentTileKey(
  key: TileKey,
  maxMipLevel: TileMipLevel = MAX_TILE_MIP_LEVEL,
): TileKey | null {
  if (key.mipLevel >= maxMipLevel) {
    return null;
  }
  return {
    pageIndex: key.pageIndex,
    mipLevel: clampTileMipLevel(key.mipLevel + 1, maxMipLevel),
    tx: key.tx >> 1,
    ty: key.ty >> 1,
  };
}

/** 주어진 타일에서 최상위 MIP(`maxMipLevel`)까지의 저해상도 폴백 조상 체인을 가까운 순으로 반환한다. */
export function getCoarseFallbackChain(
  key: TileKey,
  maxMipLevel: TileMipLevel = MAX_TILE_MIP_LEVEL,
): readonly TileKey[] {
  const chain: TileKey[] = [];
  let cursor = getParentTileKey(key, maxMipLevel);
  while (cursor !== null) {
    chain.push(cursor);
    cursor = getParentTileKey(cursor, maxMipLevel);
  }
  return chain;
}
