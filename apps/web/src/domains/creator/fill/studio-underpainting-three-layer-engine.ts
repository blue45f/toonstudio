/**
 * 디지털 언더페인팅 3층 자동채색 순수 엔진 (Plotr 패리티 + 장편 타일링 초과).
 *
 * 핵심 불변식:
 * 1. 원본 선화(Multiply) 비파괴 잠금: 입력 버퍼를 절대 변형하지 않고 최상단
 *    `blendMode: "multiply", locked: true` 레이어로 보존한다.
 * 2. A~F 캐릭터 레터 마킹 + 첫 컷 팔레트 전파: 선화로 닫힌 영역에 A~F 마킹의
 *    캐릭터 팔레트를 할당하고, 시트 없이 같은 레터를 쓴 후속 컷에는 첫 컷 팔레트를 전파한다.
 * 3. 3층 클리핑 분리: 원본 선화 하단에 `기본색(normal)` -> `음영(multiply, clipping)`
 *    -> `하이라이트(screen, clipping)` 3층을 독립 RGBA 버퍼로 분리한다.
 * 4. 장편 세로 컷(H/W > 2.0) 256px 오버랩 페더링 타일링: Plotr가 층 분리를 포기하는
 *    세로 2배 초과 컷을 256px 코사인 페더링 오버랩 타일로 분할 처리·병합해 이음매 없이 완성한다.
 */

export type UnderpaintingCharacterLabel = "A" | "B" | "C" | "D" | "E" | "F";

export const UNDERPAINTING_CHARACTER_LABELS: readonly UnderpaintingCharacterLabel[] =
  Object.freeze(["A", "B", "C", "D", "E", "F"]);

export type UnderpaintingOutputMode =
  | "flattened"
  | "flat_base"
  | "base_shadow"
  | "base_shadow_highlight";

export type UnderpaintingShadingLevel = "flat" | "cel_1" | "cel_2" | "cel_highlight";

export type UnderpaintingBlendMode = "normal" | "multiply" | "screen";

export type UnderpaintingLayerRole = "lineart" | "base" | "shadow" | "highlight" | "flattened";

export type RgbColor = readonly [r: number, g: number, b: number];

export interface UnderpaintingImageLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface UnderpaintingCharacterPalette {
  readonly label: UnderpaintingCharacterLabel;
  readonly name: string;
  readonly baseRgb: RgbColor;
  readonly shadowRgb: RgbColor;
  readonly highlightRgb: RgbColor;
}

export interface UnderpaintingMarkingStroke {
  readonly cutId: string;
  readonly label: UnderpaintingCharacterLabel;
  /** 정규화 좌표 [0..1, 0..1]. */
  readonly normalizedXY: readonly [number, number];
}

export interface UnderpaintingColorJob {
  readonly cutId: string;
  readonly lineartLayerId: string;
  readonly instructionText?: string;
  readonly characterPalettes: Partial<
    Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>
  >;
  readonly markingStrokes: readonly UnderpaintingMarkingStroke[];
  readonly outputMode: UnderpaintingOutputMode;
  readonly shadingLevel: UnderpaintingShadingLevel;
  readonly propagateFromFirstCut: boolean;
  /** 선화 판정 명도 임계값(0..255). 기본 185. */
  readonly inkLuminanceThreshold?: number;
  /** 광원 방향 [dx, dy]. 기본 [-0.65, -0.76] (좌상단 광원). */
  readonly lightDirection?: readonly [number, number];
  /** 음영 레이어 불투명도 (0.35..0.65 권장). 기본 0.48. */
  readonly shadowOpacity?: number;
  /** 하이라이트 레이어 불투명도 (0.4..0.8 권장). 기본 0.58. */
  readonly highlightOpacity?: number;
  /** 장편 세로 컷 오버랩 픽셀 수. 기본 256. */
  readonly tileOverlapPx?: number;
}

export interface UnderpaintingOutputLayer {
  readonly id: string;
  readonly role: UnderpaintingLayerRole;
  readonly label: string;
  readonly blendMode: UnderpaintingBlendMode;
  readonly opacity: number;
  readonly locked: boolean;
  readonly clipping: boolean;
  readonly imageData: UnderpaintingImageLike;
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

export interface UnderpaintingRunResult {
  readonly cutId: string;
  readonly sourceLineartLayerId: string;
  readonly outputMode: UnderpaintingOutputMode;
  readonly tilePlan: UnderpaintingTilePlan;
  readonly resolvedPalettes: Readonly<
    Partial<Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>>
  >;
  /** 상단(원본 선화 Multiply 잠금) -> 하단(하이라이트/음영/기본색) 순서의 레이어 스택. */
  readonly layers: readonly UnderpaintingOutputLayer[];
  readonly paintedPixelCount: number;
  readonly shadowPixelCount: number;
  readonly highlightPixelCount: number;
}

/** 세로 비율 H/W > 2.0 초과 시 오버랩 타일링이 자동 활성화된다. */
export const UNDERPAINTING_TALL_ASPECT_THRESHOLD = 2.0;
/** 장편 컷 타일 경계 페더링 기본 오버랩(px). */
export const UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX = 256;

export const DEFAULT_CHARACTER_PALETTES: Readonly<
  Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>
> = Object.freeze({
  A: { label: "A", name: "인물 A", baseRgb: [232, 188, 168], shadowRgb: [164, 122, 134], highlightRgb: [255, 240, 224] },
  B: { label: "B", name: "인물 B", baseRgb: [132, 168, 214], shadowRgb: [82, 104, 152], highlightRgb: [224, 242, 255] },
  C: { label: "C", name: "인물 C", baseRgb: [152, 196, 158], shadowRgb: [94, 134, 114], highlightRgb: [234, 252, 232] },
  D: { label: "D", name: "인물 D", baseRgb: [226, 198, 132], shadowRgb: [164, 132, 92], highlightRgb: [255, 246, 214] },
  E: { label: "E", name: "인물 E", baseRgb: [194, 152, 210], shadowRgb: [128, 94, 154], highlightRgb: [244, 228, 255] },
  F: { label: "F", name: "인물 F", baseRgb: [144, 194, 198], shadowRgb: [86, 126, 140], highlightRgb: [228, 250, 252] },
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paperLuminance(data: Uint8ClampedArray, pixelIndex: number): number {
  const off = pixelIndex * 4;
  const r = data[off] ?? 255;
  const g = data[off + 1] ?? 255;
  const b = data[off + 2] ?? 255;
  const a = (data[off + 3] ?? 255) / 255;
  const rec709 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - a * (255 - rec709);
}

/**
 * 원본 선화 레이어를 비파괴 Multiply 잠금 레이어로 감싼다.
 * 원본 RGBA 배열을 복사하므로 이후 어떤 단계에서도 원본 버퍼가 변형되지 않는다.
 */
export function lockLineartLayerMultiply(
  lineartLayerId: string,
  source: UnderpaintingImageLike,
): UnderpaintingOutputLayer {
  return {
    id: `${lineartLayerId}-multiply-lock`,
    role: "lineart",
    label: "원본 선화 (잠금)",
    blendMode: "multiply",
    opacity: 1,
    locked: true,
    clipping: false,
    imageData: {
      width: source.width,
      height: source.height,
      data: new Uint8ClampedArray(source.data),
    },
  };
}

/**
 * 첫 컷의 A~F 캐릭터 팔레트를 후속 컷에 전파한다.
 * 시트가 없는 후속 컷이라도 같은 레터(A~F) 마킹이 있으면 첫 컷에서 확정된 색을 계승한다.
 */
export function propagateCharacterPalettesFromFirstCut(
  firstCutPalettes: Partial<Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>>,
  targetJob: Pick<UnderpaintingColorJob, "characterPalettes" | "markingStrokes" | "propagateFromFirstCut">,
): Partial<Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>> {
  const resolved: Partial<Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>> = {
    ...targetJob.characterPalettes,
  };
  if (targetJob.propagateFromFirstCut) {
    for (const label of UNDERPAINTING_CHARACTER_LABELS) {
      if (!resolved[label] && firstCutPalettes[label]) {
        resolved[label] = firstCutPalettes[label];
      }
    }
  }
  for (const stroke of targetJob.markingStrokes) {
    if (!resolved[stroke.label]) {
      resolved[stroke.label] = DEFAULT_CHARACTER_PALETTES[stroke.label];
    }
  }
  return resolved;
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

  const maxTileHeight = Math.max(
    4,
    Math.floor(safeW * UNDERPAINTING_TALL_ASPECT_THRESHOLD),
  );
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
      // 마지막 잔여 조각이 오버랩보다 작으면 직전 타일 시작을 당겨 자연스럽게 끝을 맞춘다.
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

function cropVerticalTile(
  source: UnderpaintingImageLike,
  tile: UnderpaintingVerticalTile,
): UnderpaintingImageLike {
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
  tileImages: readonly UnderpaintingImageLike[],
): UnderpaintingImageLike {
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

interface TileUnderpaintingBuffers {
  readonly base: UnderpaintingImageLike;
  readonly shadow: UnderpaintingImageLike;
  readonly highlight: UnderpaintingImageLike;
}

function paintSingleTileThreeLayers(
  tileImage: UnderpaintingImageLike,
  tile: UnderpaintingVerticalTile,
  fullHeight: number,
  palettes: Partial<Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>>,
  strokes: readonly UnderpaintingMarkingStroke[],
  options: {
    readonly inkThreshold: number;
    readonly shadingLevel: UnderpaintingShadingLevel;
    readonly lightDirX: number;
    readonly lightDirY: number;
  },
): TileUnderpaintingBuffers {
  const { width, height } = tileImage;
  const total = width * height;
  const barrier = new Uint8Array(total);

  for (let i = 0; i < total; i += 1) {
    if (paperLuminance(tileImage.data, i) <= options.inkThreshold) {
      barrier[i] = 1;
    }
  }

  // 연결 요소 라벨링 (4-연결, 선화 장벽 기준)
  const regionMap = new Int32Array(total).fill(-1);
  const regionMinX: number[] = [];
  const regionMaxX: number[] = [];
  const regionMinY: number[] = [];
  const regionMaxY: number[] = [];
  const queue = new Int32Array(total);
  let nextRegionId = 0;

  for (let start = 0; start < total; start += 1) {
    if (barrier[start] === 1 || regionMap[start] !== -1) continue;
    const regionId = nextRegionId;
    nextRegionId += 1;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    regionMap[start] = regionId;

    let minX = start % width;
    let maxX = minX;
    let minY = (start - minX) / width;
    let maxY = minY;

    while (head < tail) {
      const idx = queue[head] ?? 0;
      head += 1;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const nextIdx of neighbors) {
        if (nextIdx >= 0 && barrier[nextIdx] === 0 && regionMap[nextIdx] === -1) {
          regionMap[nextIdx] = regionId;
          queue[tail] = nextIdx;
          tail += 1;
        }
      }
    }

    regionMinX.push(minX);
    regionMaxX.push(maxX);
    regionMinY.push(minY);
    regionMaxY.push(maxY);
  }

  // A~F 마킹을 영역에 배정(타일 범위 안의 스트로크 우선, 없으면 가장 가까운 스트로크 상속)
  const regionPalette = new Array<UnderpaintingCharacterPalette | null>(nextRegionId).fill(null);

  for (const stroke of strokes) {
    const palette = palettes[stroke.label] ?? DEFAULT_CHARACTER_PALETTES[stroke.label];
    const gx = clamp(Math.round(stroke.normalizedXY[0] * (width - 1)), 0, width - 1);
    const gy = clamp(Math.round(stroke.normalizedXY[1] * (fullHeight - 1)), 0, fullHeight - 1);
    if (gy < tile.yStart || gy >= tile.yEnd) continue;
    const localY = gy - tile.yStart;
    const regionId = regionMap[localY * width + gx] ?? -1;
    if (regionId >= 0) {
      regionPalette[regionId] = palette;
    }
  }

  // 타일 분할로 마킹이 다른 타일에 걸친 연속 영역은 가장 가까운 A~F 마킹의 팔레트를 상속해
  // 경계에서 색이 끊기지 않게 한다.
  if (strokes.length > 0) {
    for (let regionId = 0; regionId < nextRegionId; regionId += 1) {
      if (regionPalette[regionId]) continue;
      const cx = ((regionMinX[regionId] ?? 0) + (regionMaxX[regionId] ?? 0)) * 0.5;
      const cy = tile.yStart + ((regionMinY[regionId] ?? 0) + (regionMaxY[regionId] ?? 0)) * 0.5;
      // 캔버스 외곽(배경 여백) 영역은 마킹이 닿지 않았으면 비워둔다.
      const touchesCanvasEdge =
        (regionMinX[regionId] ?? 0) === 0 &&
        (regionMaxX[regionId] ?? 0) === width - 1;
      if (touchesCanvasEdge && tile.yStart === 0 && (regionMinY[regionId] ?? 0) === 0) {
        continue;
      }
      let bestDistSq = Number.POSITIVE_INFINITY;
      let bestLabel: UnderpaintingCharacterLabel | null = null;
      for (const stroke of strokes) {
        const sx = stroke.normalizedXY[0] * (width - 1);
        const sy = stroke.normalizedXY[1] * (fullHeight - 1);
        const dx = cx - sx;
        const dy = cy - sy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestLabel = stroke.label;
        }
      }
      if (bestLabel) {
        regionPalette[regionId] = palettes[bestLabel] ?? DEFAULT_CHARACTER_PALETTES[bestLabel];
      }
    }
  }

  const baseData = new Uint8ClampedArray(total * 4);
  const shadowData = new Uint8ClampedArray(total * 4);
  const highlightData = new Uint8ClampedArray(total * 4);

  const includeShadow = options.shadingLevel !== "flat";
  const includeHighlight =
    options.shadingLevel === "cel_2" || options.shadingLevel === "cel_highlight";
  const shadowThreshold = options.shadingLevel === "cel_2" ? 0.12 : 0.22;
  const highlightThreshold = options.shadingLevel === "cel_highlight" ? 0.42 : 0.56;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const regionId = regionMap[idx] ?? -1;
      if (regionId < 0) continue;
      const palette = regionPalette[regionId];
      if (!palette) continue;

      const off = idx * 4;
      baseData[off] = palette.baseRgb[0];
      baseData[off + 1] = palette.baseRgb[1];
      baseData[off + 2] = palette.baseRgb[2];
      baseData[off + 3] = 255;

      const spanX = Math.max(1, (regionMaxX[regionId] ?? x) - (regionMinX[regionId] ?? x));
      const spanY = Math.max(1, (regionMaxY[regionId] ?? y) - (regionMinY[regionId] ?? y));
      const nx = ((x - (regionMinX[regionId] ?? x)) / spanX) * 2 - 1;
      const ny = ((y - (regionMinY[regionId] ?? y)) / spanY) * 2 - 1;
      const lightProjection = nx * options.lightDirX + ny * options.lightDirY;

      if (includeShadow && lightProjection < -shadowThreshold) {
        const depth = clamp((-lightProjection - shadowThreshold) / (1 - shadowThreshold), 0.35, 1);
        shadowData[off] = palette.shadowRgb[0];
        shadowData[off + 1] = palette.shadowRgb[1];
        shadowData[off + 2] = palette.shadowRgb[2];
        shadowData[off + 3] = Math.round(depth * 255);
      }

      if (includeHighlight && lightProjection > highlightThreshold) {
        const rim = clamp((lightProjection - highlightThreshold) / (1 - highlightThreshold), 0.35, 1);
        highlightData[off] = palette.highlightRgb[0];
        highlightData[off + 1] = palette.highlightRgb[1];
        highlightData[off + 2] = palette.highlightRgb[2];
        highlightData[off + 3] = Math.round(rim * 255);
      }
    }
  }

  return {
    base: { width, height, data: baseData },
    shadow: { width, height, data: shadowData },
    highlight: { width, height, data: highlightData },
  };
}

function blendChannel(
  mode: UnderpaintingBlendMode,
  dst: number,
  src: number,
): number {
  if (mode === "multiply") return (dst * src) / 255;
  if (mode === "screen") return 255 - ((255 - dst) * (255 - src)) / 255;
  return src;
}

/**
 * 레이어 스택(아래층 -> 위층)을 Normal / Multiply / Screen + Clipping 규칙으로 합성한다.
 */
export function compositeUnderpaintingLayers(
  width: number,
  height: number,
  layersTopToBottom: readonly UnderpaintingOutputLayer[],
): UnderpaintingImageLike {
  const total = width * height;
  const out = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    out[off] = 255;
    out[off + 1] = 255;
    out[off + 2] = 255;
    out[off + 3] = 255;
  }

  const bottomToTop = [...layersTopToBottom].reverse();
  let clipBaseAlpha: Uint8ClampedArray | null = null;

  for (const layer of bottomToTop) {
    const srcData = layer.imageData.data;
    const layerOpacity = clamp(layer.opacity, 0, 1);
    if (!layer.clipping) {
      clipBaseAlpha = srcData;
    }

    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      let alpha = ((srcData[off + 3] ?? 0) / 255) * layerOpacity;
      if (layer.clipping && clipBaseAlpha) {
        alpha *= (clipBaseAlpha[off + 3] ?? 0) / 255;
      }
      if (alpha <= 0) continue;

      for (let channel = 0; channel < 3; channel += 1) {
        const dst = out[off + channel] ?? 255;
        const src = srcData[off + channel] ?? 255;
        const blended = blendChannel(layer.blendMode, dst, src);
        out[off + channel] = clamp(Math.round(dst * (1 - alpha) + blended * alpha), 0, 255);
      }
    }
  }

  return { width, height, data: out };
}

function countOpaquePixels(image: UnderpaintingImageLike): number {
  let count = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    if ((image.data[i] ?? 0) > 0) count += 1;
  }
  return count;
}

/**
 * 디지털 언더페인팅 3층 자동채색을 실행한다.
 * - 원본 선화는 Multiply 잠금 레이어로 무손상 보존
 * - H/W > 2.0 장편 컷은 256px 오버랩 페더링 타일링으로 분할 처리 후 병합
 * - `base(Normal)` / `shadow(Multiply, clipping)` / `highlight(Screen, clipping)` 생성
 */
export function runThreeLayerUnderpainting(
  lineart: UnderpaintingImageLike,
  job: UnderpaintingColorJob,
  firstCutPalettes: Partial<
    Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>
  > = {},
): UnderpaintingRunResult {
  const lockedLineart = lockLineartLayerMultiply(job.lineartLayerId, lineart);
  const resolvedPalettes = propagateCharacterPalettesFromFirstCut(firstCutPalettes, job);
  const tilePlan = planVerticalOverlapTiles(
    lineart.width,
    lineart.height,
    job.tileOverlapPx ?? UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX,
  );

  const rawDirX = job.lightDirection?.[0] ?? -0.65;
  const rawDirY = job.lightDirection?.[1] ?? -0.76;
  const dirLen = Math.hypot(rawDirX, rawDirY) || 1;
  const lightDirX = rawDirX / dirLen;
  const lightDirY = rawDirY / dirLen;
  const inkThreshold = clamp(job.inkLuminanceThreshold ?? 185, 16, 245);

  const cutStrokes = job.markingStrokes.filter(
    (stroke) => stroke.cutId === job.cutId || stroke.cutId === "*",
  );
  const activeStrokes = cutStrokes.length > 0 ? cutStrokes : job.markingStrokes;

  const baseTiles: UnderpaintingImageLike[] = [];
  const shadowTiles: UnderpaintingImageLike[] = [];
  const highlightTiles: UnderpaintingImageLike[] = [];

  for (const tile of tilePlan.tiles) {
    const cropped = tilePlan.usedTiling ? cropVerticalTile(lineart, tile) : lineart;
    const painted = paintSingleTileThreeLayers(
      cropped,
      tile,
      lineart.height,
      resolvedPalettes,
      activeStrokes,
      {
        inkThreshold,
        shadingLevel: job.shadingLevel,
        lightDirX,
        lightDirY,
      },
    );
    baseTiles.push(painted.base);
    shadowTiles.push(painted.shadow);
    highlightTiles.push(painted.highlight);
  }

  const baseImage = tilePlan.usedTiling
    ? mergeFeatheredVerticalTiles(lineart.width, lineart.height, tilePlan, baseTiles)
    : baseTiles[0]!;
  const shadowImage = tilePlan.usedTiling
    ? mergeFeatheredVerticalTiles(lineart.width, lineart.height, tilePlan, shadowTiles)
    : shadowTiles[0]!;
  const highlightImage = tilePlan.usedTiling
    ? mergeFeatheredVerticalTiles(lineart.width, lineart.height, tilePlan, highlightTiles)
    : highlightTiles[0]!;

  const shadowOpacity = clamp(job.shadowOpacity ?? 0.48, 0.35, 0.65);
  const highlightOpacity = clamp(job.highlightOpacity ?? 0.58, 0.4, 0.8);

  const baseLayer: UnderpaintingOutputLayer = {
    id: `${job.cutId}-underpaint-base`,
    role: "base",
    label: "기본색",
    blendMode: "normal",
    opacity: 1,
    locked: false,
    clipping: false,
    imageData: baseImage,
  };
  const shadowLayer: UnderpaintingOutputLayer = {
    id: `${job.cutId}-underpaint-shadow`,
    role: "shadow",
    label: "음영",
    blendMode: "multiply",
    opacity: shadowOpacity,
    locked: false,
    clipping: true,
    imageData: shadowImage,
  };
  const highlightLayer: UnderpaintingOutputLayer = {
    id: `${job.cutId}-underpaint-highlight`,
    role: "highlight",
    label: "하이라이트",
    blendMode: "screen",
    opacity: highlightOpacity,
    locked: false,
    clipping: true,
    imageData: highlightImage,
  };

  let layers: UnderpaintingOutputLayer[];
  if (job.outputMode === "flat_base") {
    layers = [lockedLineart, baseLayer];
  } else if (job.outputMode === "base_shadow") {
    layers = [lockedLineart, shadowLayer, baseLayer];
  } else if (job.outputMode === "base_shadow_highlight") {
    layers = [lockedLineart, highlightLayer, shadowLayer, baseLayer];
  } else {
    const flattened = compositeUnderpaintingLayers(lineart.width, lineart.height, [
      lockedLineart,
      highlightLayer,
      shadowLayer,
      baseLayer,
    ]);
    layers = [
      lockedLineart,
      {
        id: `${job.cutId}-underpaint-flattened`,
        role: "flattened",
        label: "합쳐진 채색",
        blendMode: "normal",
        opacity: 1,
        locked: false,
        clipping: false,
        imageData: flattened,
      },
    ];
  }

  return {
    cutId: job.cutId,
    sourceLineartLayerId: job.lineartLayerId,
    outputMode: job.outputMode,
    tilePlan,
    resolvedPalettes,
    layers,
    paintedPixelCount: countOpaquePixels(baseImage),
    shadowPixelCount: countOpaquePixels(shadowImage),
    highlightPixelCount: countOpaquePixels(highlightImage),
  };
}
