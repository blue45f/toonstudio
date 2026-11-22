/**
 * WebGPU 256×256px Dirty-Tile Pyramid 기하·VRAM 프로필·1px Overlap Apron 봉합 수학.
 *
 * - 캔버스 0°/90°/180°/270° 회전 및 좌우/상하 반전 모든 조합(16종)에서
 *   내부 타일 경계에 1px Overlap Apron을 유지하고 외곽 경계는 0px로 클램프한다.
 * - 표시 공간 쿼드 네 꼭짓점(TL/TR/BR/BL)과 원본 타일 텍스처 UV를 동일 변환으로
 *   유도해 회전·반전 시 1px 솔기(seam)나 텍셀 번짐이 발생하지 않도록 보장한다.
 */

import {
  WEBGPU_VRAM_DEFAULT_BUDGET_BYTES,
  type WebGpuVramPressureTier,
} from "./webgpu-memory-failsafe-guard";

export const WEBGPU_DIRTY_TILE_SIZE_PX = 256 as const;
export const WEBGPU_DIRTY_TILE_APRON_PX = 1 as const;
export const WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8 = 4 as const;
export const WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA16F = 8 as const;
export const WEBGPU_DIRTY_TILE_DEFAULT_MAX_MIP_LEVELS = 5 as const;
export const WEBGPU_DIRTY_TILE_MIN_RESIDENT_TILES = 16 as const;
export const WEBGPU_DIRTY_TILE_DEFAULT_VRAM_SHARE = 0.45 as const;
export const WEBGPU_DIRTY_TILE_DEFAULT_IDLE_EVICT_MS = 15_000 as const;

export interface DirtyTileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DirtyTileCanvasDimensions {
  readonly width: number;
  readonly height: number;
}

export type DirtyTileRotationDegrees = 0 | 90 | 180 | 270;

export interface DirtyTileCanvasTransform {
  /** 캔버스 시계 방향 회전 각도(0°, 90°, 180°, 270°). */
  readonly rotationDegrees: DirtyTileRotationDegrees;
  /** 좌우 반전 여부(회전 전 캔버스 기준). */
  readonly flipX?: boolean;
  /** 상하 반전 여부(회전 전 캔버스 기준). */
  readonly flipY?: boolean;
}

export interface DirtyTileCoordinate {
  readonly layerId: string;
  /** 피라미드 mip 레벨(0 = 1:1, 1 = 1/2, 2 = 1/4 ...). */
  readonly mipLevel: number;
  readonly col: number;
  readonly row: number;
}

export interface DirtyTileApronInsets {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface DirtyTileUvPoint {
  readonly u: number;
  readonly v: number;
}

export interface DirtyTileUvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface DirtyTileSampleClampUv {
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
}

export interface DirtyTileUvCorners {
  readonly topLeft: DirtyTileUvPoint;
  readonly topRight: DirtyTileUvPoint;
  readonly bottomRight: DirtyTileUvPoint;
  readonly bottomLeft: DirtyTileUvPoint;
}

export interface ComputeTileApronBoundsInput {
  readonly col: number;
  readonly row: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tileSizePx?: number;
  readonly apronPx?: number;
  readonly mipLevel?: number;
  readonly transform?: DirtyTileCanvasTransform;
}

export interface TileApronBounds {
  readonly col: number;
  readonly row: number;
  readonly mipLevel: number;
  readonly mipScale: number;
  readonly mipWidth: number;
  readonly mipHeight: number;
  readonly apronPx: number;
  readonly isEmpty: boolean;
  /** mip 픽셀 좌표계에서 타일 본체 영역(인접 타일과 겹침 없음). */
  readonly coreRect: DirtyTileRect;
  /** mip 픽셀 좌표계에서 1px Overlap Apron 포함 영역(경계 클램프 완료). */
  readonly apronRect: DirtyTileRect;
  /** 원본(mip 0) 캔버스 좌표계로 투영된 타일 본체 영역. */
  readonly canvasCoreRect: DirtyTileRect;
  /** 원본 mip 좌표계 기준 각 변의 실제 apron 폭(외곽은 0, 내부 솔기는 apronPx). */
  readonly insets: DirtyTileApronInsets;
  /** apron 텍스처 내부에서 본체(core)를 샘플링하는 정규화 UV 범위. */
  readonly uvRect: DirtyTileUvRect;
  /** 바이리니어 샘플링 시 타일 경계 밖으로 새지 않도록 제한하는 안전 UV 클램프. */
  readonly sampleClampUv: DirtyTileSampleClampUv;
  /** 회전·반전 적용 후 표시 공간 캔버스 크기. */
  readonly transformedCanvasWidth: number;
  readonly transformedCanvasHeight: number;
  /** 회전·반전 적용 후 표시 공간 본체 영역. */
  readonly transformedCoreRect: DirtyTileRect;
  /** 회전·반전 적용 후 표시 공간 apron 포함 영역. */
  readonly transformedApronRect: DirtyTileRect;
  /** 회전·반전 적용 후 표시 공간 각 변의 apron 폭. */
  readonly transformedInsets: DirtyTileApronInsets;
  /** 회전·반전 적용 후 표시 쿼드 네 꼭짓점(TL/TR/BR/BL)에 매핑되는 원본 타일 UV. */
  readonly uvCorners: DirtyTileUvCorners;
}

export interface VramResidentTileProfileInput {
  readonly budgetBytes: number;
  readonly tier?: WebGpuVramPressureTier;
  readonly vramTilePoolShare?: number;
  readonly tileSizePx?: number;
  readonly apronPx?: number;
  readonly bytesPerPixel?: number;
  readonly minResidentTiles?: number;
  readonly explicitMaxResidentTiles?: number;
}

export function sanitizePositiveInt(value: number | undefined, fallback: number, min = 1): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

export function sanitizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function clampRectToBounds(
  rect: DirtyTileRect,
  maxWidth: number,
  maxHeight: number,
): DirtyTileRect {
  const safeX = Number.isFinite(rect.x) ? rect.x : 0;
  const safeY = Number.isFinite(rect.y) ? rect.y : 0;
  const safeW = Number.isFinite(rect.width) ? Math.max(0, rect.width) : 0;
  const safeH = Number.isFinite(rect.height) ? Math.max(0, rect.height) : 0;

  const minX = Math.max(0, Math.min(maxWidth, Math.floor(safeX)));
  const minY = Math.max(0, Math.min(maxHeight, Math.floor(safeY)));
  const maxX = Math.max(minX, Math.min(maxWidth, Math.ceil(safeX + safeW)));
  const maxY = Math.max(minY, Math.min(maxHeight, Math.ceil(safeY + safeH)));
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

export function intersectRects(a: DirtyTileRect, b: DirtyTileRect): DirtyTileRect | null {
  const minX = Math.max(a.x, b.x);
  const minY = Math.max(a.y, b.y);
  const maxX = Math.min(a.x + a.width, b.x + b.width);
  const maxY = Math.min(a.y + a.height, b.y + b.height);
  if (maxX <= minX || maxY <= minY) return null;
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

export function unionRects(a: DirtyTileRect | null, b: DirtyTileRect): DirtyTileRect {
  if (a === null) return b;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

export function distanceToViewportCenter(tileRect: DirtyTileRect, viewport: DirtyTileRect): number {
  const tx = tileRect.x + tileRect.width * 0.5;
  const ty = tileRect.y + tileRect.height * 0.5;
  const vx = viewport.x + viewport.width * 0.5;
  const vy = viewport.y + viewport.height * 0.5;
  return Math.hypot(tx - vx, ty - vy);
}

/** 타일 좌표를 결정론 문자열 키로 직렬화한다. */
export function formatDirtyTileKey(coord: DirtyTileCoordinate): string {
  return `${coord.layerId}@m${coord.mipLevel}:${coord.col},${coord.row}`;
}

/** 주입된 OPFS 스왑 어댑터용 결정론 상대 경로를 생성한다(경로 이탈 문자 제거). */
export function buildOpfsTilePath(coord: DirtyTileCoordinate, revision: number): string {
  const safeLayer =
    coord.layerId.replace(/[^a-zA-Z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "layer";
  return `tiles/${safeLayer}/m${coord.mipLevel}/${coord.col}_${coord.row}_r${revision}.tile`;
}

/** VRAM 예산과 압박 티어를 바탕으로 상주 가능한 최대 타일 개수를 계산한다. */
export function computeMaxResidentTilesFromVramProfile(input: VramResidentTileProfileInput): number {
  const budgetBytes = sanitizePositiveInt(input.budgetBytes, WEBGPU_VRAM_DEFAULT_BUDGET_BYTES, 1024);
  const tileSizePx = sanitizePositiveInt(input.tileSizePx, WEBGPU_DIRTY_TILE_SIZE_PX);
  const apronPx = sanitizeNonNegativeInt(input.apronPx, WEBGPU_DIRTY_TILE_APRON_PX);
  const bytesPerPixel = sanitizePositiveInt(
    input.bytesPerPixel,
    WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8,
  );
  const shareRaw = input.vramTilePoolShare ?? WEBGPU_DIRTY_TILE_DEFAULT_VRAM_SHARE;
  const share = Number.isFinite(shareRaw) ? Math.min(0.9, Math.max(0.05, shareRaw)) : 0.45;
  const minTiles = sanitizePositiveInt(input.minResidentTiles, WEBGPU_DIRTY_TILE_MIN_RESIDENT_TILES, 1);

  const sideWithApron = tileSizePx + apronPx * 2;
  const nominalTileBytes = sideWithApron * sideWithApron * bytesPerPixel;
  const baseCapacity = Math.max(minTiles, Math.floor((budgetBytes * share) / nominalTileBytes));
  const cappedBase =
    input.explicitMaxResidentTiles !== undefined && Number.isFinite(input.explicitMaxResidentTiles)
      ? Math.max(1, Math.min(baseCapacity, Math.floor(input.explicitMaxResidentTiles)))
      : baseCapacity;

  const tierMultiplier =
    input.tier === "critical-fallback"
      ? 0.25
      : input.tier === "warning-scale-down"
        ? 0.5
        : input.tier === "soft-evict"
          ? 0.75
          : 1.0;

  return Math.max(1, Math.floor(cappedBase * tierMultiplier));
}

function normalizeRotation(rotationDegrees: number | undefined): DirtyTileRotationDegrees {
  if (rotationDegrees === 90 || rotationDegrees === 180 || rotationDegrees === 270) {
    return rotationDegrees;
  }
  return 0;
}

function transformPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: DirtyTileRotationDegrees,
  flipX: boolean,
  flipY: boolean,
): readonly [number, number] {
  const fx = flipX ? width - x : x;
  const fy = flipY ? height - y : y;
  switch (rotation) {
    case 90:
      return [height - fy, fx];
    case 180:
      return [width - fx, height - fy];
    case 270:
      return [fy, width - fx];
    default:
      return [fx, fy];
  }
}

function transformRect(
  rect: DirtyTileRect,
  width: number,
  height: number,
  rotation: DirtyTileRotationDegrees,
  flipX: boolean,
  flipY: boolean,
): DirtyTileRect {
  if (rect.width <= 0 || rect.height <= 0) {
    return Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
  }
  const [x1, y1] = transformPoint(rect.x, rect.y, width, height, rotation, flipX, flipY);
  const [x2, y2] = transformPoint(
    rect.x + rect.width,
    rect.y + rect.height,
    width,
    height,
    rotation,
    flipX,
    flipY,
  );
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  return Object.freeze({
    x: minX,
    y: minY,
    width: Math.max(x1, x2) - minX,
    height: Math.max(y1, y2) - minY,
  });
}

/**
 * 1px Overlap Apron 타일 경계와 0°/90°/180°/270° 회전·좌우/상하 반전 UV 매핑을 계산한다.
 */
export function computeTileApronBounds(input: ComputeTileApronBoundsInput): TileApronBounds {
  const canvasWidth = sanitizePositiveInt(input.canvasWidth, WEBGPU_DIRTY_TILE_SIZE_PX);
  const canvasHeight = sanitizePositiveInt(input.canvasHeight, WEBGPU_DIRTY_TILE_SIZE_PX);
  const tileSizePx = sanitizePositiveInt(input.tileSizePx, WEBGPU_DIRTY_TILE_SIZE_PX);
  const apronPx = sanitizeNonNegativeInt(input.apronPx, WEBGPU_DIRTY_TILE_APRON_PX);
  const mipLevel = sanitizeNonNegativeInt(input.mipLevel, 0);
  const mipScale = 2 ** mipLevel;
  const mipWidth = Math.max(1, Math.ceil(canvasWidth / mipScale));
  const mipHeight = Math.max(1, Math.ceil(canvasHeight / mipScale));

  const rotation = normalizeRotation(input.transform?.rotationDegrees);
  const flipX = input.transform?.flipX === true;
  const flipY = input.transform?.flipY === true;
  const swappedAxes = rotation === 90 || rotation === 270;
  const transformedCanvasWidth = swappedAxes ? mipHeight : mipWidth;
  const transformedCanvasHeight = swappedAxes ? mipWidth : mipHeight;

  const col = Math.floor(Number.isFinite(input.col) ? input.col : -1);
  const row = Math.floor(Number.isFinite(input.row) ? input.row : -1);
  const coreX = col * tileSizePx;
  const coreY = row * tileSizePx;

  if (col < 0 || row < 0 || coreX >= mipWidth || coreY >= mipHeight) {
    const zeroRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
    const zeroInsets = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });
    const zeroPoint = Object.freeze({ u: 0, v: 0 });
    return Object.freeze({
      col,
      row,
      mipLevel,
      mipScale,
      mipWidth,
      mipHeight,
      apronPx,
      isEmpty: true,
      coreRect: zeroRect,
      apronRect: zeroRect,
      canvasCoreRect: zeroRect,
      insets: zeroInsets,
      uvRect: Object.freeze({ u0: 0, v0: 0, u1: 0, v1: 0 }),
      sampleClampUv: Object.freeze({ minU: 0, minV: 0, maxU: 0, maxV: 0 }),
      transformedCanvasWidth,
      transformedCanvasHeight,
      transformedCoreRect: zeroRect,
      transformedApronRect: zeroRect,
      transformedInsets: zeroInsets,
      uvCorners: Object.freeze({
        topLeft: zeroPoint,
        topRight: zeroPoint,
        bottomRight: zeroPoint,
        bottomLeft: zeroPoint,
      }),
    });
  }

  const coreWidth = Math.min(tileSizePx, mipWidth - coreX);
  const coreHeight = Math.min(tileSizePx, mipHeight - coreY);
  const coreRect: DirtyTileRect = Object.freeze({
    x: coreX,
    y: coreY,
    width: coreWidth,
    height: coreHeight,
  });

  const apronMinX = Math.max(0, coreX - apronPx);
  const apronMinY = Math.max(0, coreY - apronPx);
  const apronMaxX = Math.min(mipWidth, coreX + coreWidth + apronPx);
  const apronMaxY = Math.min(mipHeight, coreY + coreHeight + apronPx);
  const apronWidth = apronMaxX - apronMinX;
  const apronHeight = apronMaxY - apronMinY;
  const apronRect: DirtyTileRect = Object.freeze({
    x: apronMinX,
    y: apronMinY,
    width: apronWidth,
    height: apronHeight,
  });

  const padLeft = coreX - apronMinX;
  const padTop = coreY - apronMinY;
  const padRight = apronMaxX - (coreX + coreWidth);
  const padBottom = apronMaxY - (coreY + coreHeight);

  const canvasCoreX = coreX * mipScale;
  const canvasCoreY = coreY * mipScale;
  const canvasCoreRect: DirtyTileRect = Object.freeze({
    x: canvasCoreX,
    y: canvasCoreY,
    width: Math.min(canvasWidth - canvasCoreX, coreWidth * mipScale),
    height: Math.min(canvasHeight - canvasCoreY, coreHeight * mipScale),
  });

  const texW = Math.max(1, apronWidth);
  const texH = Math.max(1, apronHeight);
  const u0 = padLeft / texW;
  const v0 = padTop / texH;
  const u1 = (padLeft + coreWidth) / texW;
  const v1 = (padTop + coreHeight) / texH;

  const rawMinU = (padLeft > 0 ? padLeft - 0.5 : 0.5) / texW;
  const rawMaxU = (padLeft + coreWidth + (padRight > 0 ? 0.5 : -0.5)) / texW;
  const rawMinV = (padTop > 0 ? padTop - 0.5 : 0.5) / texH;
  const rawMaxV = (padTop + coreHeight + (padBottom > 0 ? 0.5 : -0.5)) / texH;

  const transformedCoreRect = transformRect(coreRect, mipWidth, mipHeight, rotation, flipX, flipY);
  const transformedApronRect = transformRect(apronRect, mipWidth, mipHeight, rotation, flipX, flipY);
  const transformedInsets: DirtyTileApronInsets = Object.freeze({
    left: transformedCoreRect.x - transformedApronRect.x,
    top: transformedCoreRect.y - transformedApronRect.y,
    right:
      transformedApronRect.x +
      transformedApronRect.width -
      (transformedCoreRect.x + transformedCoreRect.width),
    bottom:
      transformedApronRect.y +
      transformedApronRect.height -
      (transformedCoreRect.y + transformedCoreRect.height),
  });

  const canonicalCorners = [
    { x: coreX, y: coreY, uv: Object.freeze({ u: u0, v: v0 }) },
    { x: coreX + coreWidth, y: coreY, uv: Object.freeze({ u: u1, v: v0 }) },
    { x: coreX + coreWidth, y: coreY + coreHeight, uv: Object.freeze({ u: u1, v: v1 }) },
    { x: coreX, y: coreY + coreHeight, uv: Object.freeze({ u: u0, v: v1 }) },
  ] as const;

  const fallbackUv = Object.freeze({ u: u0, v: v0 });
  let topLeft: DirtyTileUvPoint = fallbackUv;
  let topRight: DirtyTileUvPoint = fallbackUv;
  let bottomRight: DirtyTileUvPoint = fallbackUv;
  let bottomLeft: DirtyTileUvPoint = fallbackUv;
  const tRight = transformedCoreRect.x + transformedCoreRect.width;
  const tBottom = transformedCoreRect.y + transformedCoreRect.height;

  for (const corner of canonicalCorners) {
    const [tx, ty] = transformPoint(corner.x, corner.y, mipWidth, mipHeight, rotation, flipX, flipY);
    if (tx === transformedCoreRect.x && ty === transformedCoreRect.y) topLeft = corner.uv;
    else if (tx === tRight && ty === transformedCoreRect.y) topRight = corner.uv;
    else if (tx === tRight && ty === tBottom) bottomRight = corner.uv;
    else if (tx === transformedCoreRect.x && ty === tBottom) bottomLeft = corner.uv;
  }

  return Object.freeze({
    col,
    row,
    mipLevel,
    mipScale,
    mipWidth,
    mipHeight,
    apronPx,
    isEmpty: false,
    coreRect,
    apronRect,
    canvasCoreRect,
    insets: Object.freeze({ left: padLeft, top: padTop, right: padRight, bottom: padBottom }),
    uvRect: Object.freeze({ u0, v0, u1, v1 }),
    sampleClampUv: Object.freeze({
      minU: Math.min(rawMinU, rawMaxU),
      minV: Math.min(rawMinV, rawMaxV),
      maxU: Math.max(rawMinU, rawMaxU),
      maxV: Math.max(rawMinV, rawMaxV),
    }),
    transformedCanvasWidth,
    transformedCanvasHeight,
    transformedCoreRect,
    transformedApronRect,
    transformedInsets,
    uvCorners: Object.freeze({ topLeft, topRight, bottomRight, bottomLeft }),
  });
}
