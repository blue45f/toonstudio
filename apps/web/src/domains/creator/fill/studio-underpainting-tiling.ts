/**
 * 장편 세로 웹툰 컷(H/W > 2.0)용 256px 코사인(Hann) 오버랩 페더링 타일 분할·병합 모듈.
 */

export interface UnderpaintingTileImageLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface UnderpaintingVerticalTile {
  readonly index: number;
  readonly yStart: number;
  readonly yEnd: number;
  readonly height: number;
  readonly topOverlapPx: number;
  readonly bottomOverlapPx: number;
}

export interface UnderpaintingTilePlan {
  readonly usedTiling: boolean;
  readonly aspectRatio: number;
  readonly overlapPx: number;
  readonly tiles: readonly UnderpaintingVerticalTile[];
}

/** 세로 비율 H/W > 2.0 초과 시 오버랩 타일링이 자동 활성화된다. */
export const UNDERPAINTING_TALL_ASPECT_THRESHOLD = 2.0;
/** 장편 컷 타일 경계 페더링 기본 오버랩(px). */
export const UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX = 256;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 세로 비율(H/W > 2.0) 장편 컷에 대해 오버랩 페더링 타일 분할 계획을 생성한다.
 * 기본 오버랩은 256px이며, 타일 높이가 매우 작은 경우에만 안전 상한(floor(tileHeight/2) - 1)으로 클램프한다.
 */
export function planVerticalOverlapTiles(
  width: number,
  height: number,
  requestedOverlapPx: number = UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX,
): UnderpaintingTilePlan {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const aspectRatio = safeH / safeW;

  if (aspectRatio <= UNDERPAINTING_TALL_ASPECT_THRESHOLD) {
    return {
      usedTiling: false,
      aspectRatio,
      overlapPx: 0,
      tiles: [
        {
          index: 0,
          yStart: 0,
          yEnd: safeH,
          height: safeH,
          topOverlapPx: 0,
          bottomOverlapPx: 0,
        },
      ],
    };
  }

  const maxTileHeight = Math.max(4, Math.floor(safeW * UNDERPAINTING_TALL_ASPECT_THRESHOLD));
  const maxSafeOverlap = Math.max(1, Math.floor(maxTileHeight / 2) - 1);
  const overlapPx = clamp(Math.floor(requestedOverlapPx), 1, maxSafeOverlap);
  const stride = Math.max(1, maxTileHeight - overlapPx);

  const tiles: UnderpaintingVerticalTile[] = [];
  let yStart = 0;
  let index = 0;

  while (yStart < safeH) {
    const yEnd = Math.min(safeH, yStart + maxTileHeight);
    const isFirst = index === 0;
    const isLast = yEnd >= safeH;
    const prevTile = tiles[tiles.length - 1];
    const topOverlapPx = !isFirst && prevTile ? Math.max(0, prevTile.yEnd - yStart) : 0;

    tiles.push({
      index,
      yStart,
      yEnd,
      height: yEnd - yStart,
      topOverlapPx,
      bottomOverlapPx: 0,
    });

    if (prevTile && topOverlapPx > 0) {
      tiles[tiles.length - 2] = {
        ...prevTile,
        bottomOverlapPx: topOverlapPx,
      };
    }

    if (isLast) break;
    yStart += stride;
    if (safeH - yStart <= overlapPx && yStart > 0) {
      yStart = Math.max(0, safeH - maxTileHeight);
      if (yStart <= (tiles[tiles.length - 1]?.yStart ?? -1)) break;
    }
    index += 1;
  }

  return {
    usedTiling: true,
    aspectRatio,
    overlapPx,
    tiles,
  };
}

export function cropVerticalTile(
  source: UnderpaintingTileImageLike,
  tile: UnderpaintingVerticalTile,
): UnderpaintingTileImageLike {
  const rowBytes = source.width * 4;
  const startByte = tile.yStart * rowBytes;
  const endByte = tile.yEnd * rowBytes;
  return {
    width: source.width,
    height: tile.height,
    data: new Uint8ClampedArray(source.data.subarray(startByte, endByte)),
  };
}

/**
 * 코사인(Hann) 페더링 가중치로 오버랩 세로 타일들을 이음매 없이 단일 RGBA 버퍼로 병합한다.
 */
export function mergeFeatheredVerticalTiles(
  width: number,
  height: number,
  tilePlan: UnderpaintingTilePlan,
  tileImages: readonly UnderpaintingTileImageLike[],
): UnderpaintingTileImageLike {
  const totalPixels = width * height;
  const accumR = new Float32Array(totalPixels);
  const accumG = new Float32Array(totalPixels);
  const accumB = new Float32Array(totalPixels);
  const accumA = new Float32Array(totalPixels);
  const accumW = new Float32Array(totalPixels);

  for (let tileIndex = 0; tileIndex < tilePlan.tiles.length; tileIndex += 1) {
    const tile = tilePlan.tiles[tileIndex];
    const image = tileImages[tileIndex];
    if (!tile || !image) continue;

    for (let localY = 0; localY < tile.height; localY += 1) {
      let weight = 1;
      if (tile.topOverlapPx > 0 && localY < tile.topOverlapPx) {
        const t = (localY + 0.5) / tile.topOverlapPx;
        weight *= 0.5 - 0.5 * Math.cos(Math.PI * t);
      }
      if (tile.bottomOverlapPx > 0 && localY >= tile.height - tile.bottomOverlapPx) {
        const distFromBottom = tile.height - 1 - localY;
        const t = (distFromBottom + 0.5) / tile.bottomOverlapPx;
        weight *= 0.5 - 0.5 * Math.cos(Math.PI * t);
      }

      const globalY = tile.yStart + localY;
      for (let x = 0; x < width; x += 1) {
        const localIdx = (localY * width + x) * 4;
        const globalPixel = globalY * width + x;
        const alpha = (image.data[localIdx + 3] ?? 0) / 255;
        accumR[globalPixel] = (accumR[globalPixel] ?? 0) + (image.data[localIdx] ?? 0) * alpha * weight;
        accumG[globalPixel] =
          (accumG[globalPixel] ?? 0) + (image.data[localIdx + 1] ?? 0) * alpha * weight;
        accumB[globalPixel] =
          (accumB[globalPixel] ?? 0) + (image.data[localIdx + 2] ?? 0) * alpha * weight;
        accumA[globalPixel] = (accumA[globalPixel] ?? 0) + alpha * weight;
        accumW[globalPixel] = (accumW[globalPixel] ?? 0) + weight;
      }
    }
  }

  const out = new Uint8ClampedArray(totalPixels * 4);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const w = accumW[pixel] ?? 0;
    if (w <= 1e-6) continue;
    const alpha = clamp((accumA[pixel] ?? 0) / w, 0, 1);
    if (alpha <= 1e-4) continue;
    const off = pixel * 4;
    const premulNorm = accumA[pixel] ?? 1;
    out[off] = clamp(Math.round((accumR[pixel] ?? 0) / premulNorm), 0, 255);
    out[off + 1] = clamp(Math.round((accumG[pixel] ?? 0) / premulNorm), 0, 255);
    out[off + 2] = clamp(Math.round((accumB[pixel] ?? 0) / premulNorm), 0, 255);
    out[off + 3] = clamp(Math.round(alpha * 255), 0, 255);
  }

  return { width, height, data: out };
}
