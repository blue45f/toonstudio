/**
 * 나노픽셀 프랙탈 초고해상도 타일 업스케일러 (Rebelle 7/8 Pro NanoPixel 2 클린룸 구현).
 *
 * - 2x ~ 4x(최대 8192x8192) 타일 단위 스트리밍 업스케일로 브라우저 메모리 폭발 방지
 * - 타일 순서/크기에 무관하게 경계 이음새가 0인 소스 헤일로 패딩 타일 플래너
 * - 정규화 월드 좌표 기반 무한 해상도 해석적 종이 하이트맵(fBm + 섬유 방향성)
 * - 에지 방향성(Gradient-Guided) Lanczos-3 보간 + 미세 안료 과립(Micro-Granulation) 재합성
 */

export const NANOPIXEL_UPSCALER_SCHEMA_VERSION = 1 as const;
export const NANOPIXEL_MAX_OUTPUT_EDGE = 8192 as const;
export const NANOPIXEL_DEFAULT_TILE_SIZE = 256 as const;
export const NANOPIXEL_LANCZOS_A = 3 as const;

export type NanopixelScaleFactor = 2 | 3 | 4;

export interface AnalyticPaperHeightRecipe {
  readonly seed: number;
  /** 저주파 종이 기복 주파수(캔버스 폭당 주기). */
  readonly baseFrequency: number;
  /** 프랙탈 옥타브 수(2..8). */
  readonly octaves: number;
  /** 옥타브 주파수 증가율. */
  readonly lacunarity: number;
  /** 옥타브 진폭 감쇠율. */
  readonly gain: number;
  /** 섬유 방향 각도(라디안). */
  readonly fiberAngleRad: number;
  /** 섬유 이방성 강도(0..1). */
  readonly fiberStrength: number;
}

export const DEFAULT_ANALYTIC_PAPER_RECIPE: Readonly<AnalyticPaperHeightRecipe> = Object.freeze({
  seed: 202611,
  baseFrequency: 18,
  octaves: 5,
  lacunarity: 2.05,
  gain: 0.52,
  fiberAngleRad: 0.42,
  fiberStrength: 0.28,
});

export interface NanopixelUpscaleOptions {
  /** 정수 업스케일 배율(2 | 3 | 4). */
  readonly scale: NanopixelScaleFactor;
  /** 출력 타일 변 길이(픽셀, 기본 256). */
  readonly tileSize?: number;
  /** 에지 방향성 선명화 강도(0..1). */
  readonly edgeSharpenStrength?: number;
  /** 해석적 종이 하이트맵 릴리프 합성 강도(0..1). */
  readonly paperReliefStrength?: number;
  /** 미세 안료 과립 프랙탈 디테일 강도(0..1). */
  readonly granulationStrength?: number;
  /** 종이 하이트맵 레시피. */
  readonly paperRecipe?: Partial<AnalyticPaperHeightRecipe>;
  /** 취소 신호. */
  readonly signal?: AbortSignal;
}

export interface NanopixelTileDescriptor {
  readonly tileIndex: number;
  readonly tileCol: number;
  readonly tileRow: number;
  /** 최종 출력 이미지 기준 타일 원점 및 크기. */
  readonly outX: number;
  readonly outY: number;
  readonly outWidth: number;
  readonly outHeight: number;
  /** Lanczos-3 + 그래디언트 필터가 참조할 소스 패치 범위(클램프됨). */
  readonly srcMinX: number;
  readonly srcMinY: number;
  readonly srcMaxX: number;
  readonly srcMaxY: number;
}

export interface NanopixelTileOutput {
  readonly tile: NanopixelTileDescriptor;
  readonly rgba: Uint8ClampedArray;
}

export interface NanopixelUpscaleResult {
  readonly width: number;
  readonly height: number;
  readonly scale: NanopixelScaleFactor;
  readonly tileCount: number;
  readonly rgba: Uint8ClampedArray;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

/** 결정적 2D 정수 격자 해시 -> [0, 1]. */
function hash2d01(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 2D 스무스 값 노이즈 [0, 1]. */
function valueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2d01(ix, iy, seed);
  const b = hash2d01(ix + 1, iy, seed);
  const c = hash2d01(ix, iy + 1, seed);
  const d = hash2d01(ix + 1, iy + 1, seed);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

export function normalizeAnalyticPaperRecipe(
  partial?: Partial<AnalyticPaperHeightRecipe>,
): AnalyticPaperHeightRecipe {
  const d = DEFAULT_ANALYTIC_PAPER_RECIPE;
  return {
    seed: typeof partial?.seed === "number" && Number.isFinite(partial.seed) ? Math.floor(partial.seed) : d.seed,
    baseFrequency: clamp(partial?.baseFrequency ?? d.baseFrequency, 1, 256),
    octaves: Math.floor(clamp(partial?.octaves ?? d.octaves, 2, 8)),
    lacunarity: clamp(partial?.lacunarity ?? d.lacunarity, 1.2, 4.0),
    gain: clamp(partial?.gain ?? d.gain, 0.1, 0.85),
    fiberAngleRad: partial?.fiberAngleRad ?? d.fiberAngleRad,
    fiberStrength: clamp(partial?.fiberStrength ?? d.fiberStrength, 0, 1),
  };
}

/**
 * 정규화 월드 좌표 (u, v) in [0, 1] 에서 무한 해상도 해석적 종이 하이트맵 [0, 1]을 평가한다.
 * 배율(1x, 2x, 4x)이 올라가도 거시적 요철은 유지되고 고주파 옥타브가 미세 종이결을 보강한다.
 */
export function evaluateAnalyticPaperHeight(
  normX: number,
  normY: number,
  recipe: AnalyticPaperHeightRecipe,
  extraFineOctaves = 0,
): number {
  const totalOctaves = Math.min(10, recipe.octaves + Math.max(0, Math.floor(extraFineOctaves)));
  let freq = recipe.baseFrequency;
  let amp = 1.0;
  let ampSum = 0;
  let acc = 0;

  for (let oct = 0; oct < totalOctaves; oct += 1) {
    const n = valueNoise2d(normX * freq, normY * freq, recipe.seed + oct * 997);
    acc += n * amp;
    ampSum += amp;
    freq *= recipe.lacunarity;
    amp *= recipe.gain;
  }

  let height = ampSum > 0 ? acc / ampSum : 0.5;

  if (recipe.fiberStrength > 0) {
    const c = Math.cos(recipe.fiberAngleRad);
    const s = Math.sin(recipe.fiberAngleRad);
    const rx = normX * c - normY * s;
    const ry = normX * s + normY * c;
    // 섬유 방향을 따라 길게 늘어진 이방성 노이즈
    const fiber = valueNoise2d(rx * recipe.baseFrequency * 1.4, ry * recipe.baseFrequency * 7.5, recipe.seed ^ 0x2c1b3c);
    height = height * (1 - recipe.fiberStrength) + fiber * recipe.fiberStrength;
  }

  return clamp(height, 0, 1);
}

/** 출력 해상도와 메모리 제한에 맞춰 헤일로 포함 타일 계획을 수립한다. */
export function planNanopixelTiles(
  sourceWidth: number,
  sourceHeight: number,
  scale: NanopixelScaleFactor,
  tileSize: number = NANOPIXEL_DEFAULT_TILE_SIZE,
): readonly NanopixelTileDescriptor[] {
  const sw = Math.floor(sourceWidth);
  const sh = Math.floor(sourceHeight);
  if (sw < 1 || sh < 1) {
    throw new Error("원본 이미지 크기는 최소 1x1 이상이어야 합니다.");
  }
  if (scale !== 2 && scale !== 3 && scale !== 4) {
    throw new Error("나노픽셀 업스케일 배율은 2, 3, 4 중 하나여야 합니다.");
  }

  const outW = sw * scale;
  const outH = sh * scale;
  if (outW > NANOPIXEL_MAX_OUTPUT_EDGE || outH > NANOPIXEL_MAX_OUTPUT_EDGE) {
    throw new Error(`출력 해상도(${outW}x${outH})가 최대 한계(${NANOPIXEL_MAX_OUTPUT_EDGE})를 초과했습니다.`);
  }

  const safeTile = Math.max(8, Math.floor(tileSize));
  const cols = Math.ceil(outW / safeTile);
  const rows = Math.ceil(outH / safeTile);
  const srcHalo = NANOPIXEL_LANCZOS_A + 2;
  const tiles: NanopixelTileDescriptor[] = [];

  let tileIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    const outY = row * safeTile;
    const outHeight = Math.min(safeTile, outH - outY);
    const srcMinY = Math.max(0, Math.floor(outY / scale) - srcHalo);
    const srcMaxY = Math.min(sh - 1, Math.ceil((outY + outHeight) / scale) + srcHalo);

    for (let col = 0; col < cols; col += 1) {
      const outX = col * safeTile;
      const outWidth = Math.min(safeTile, outW - outX);
      const srcMinX = Math.max(0, Math.floor(outX / scale) - srcHalo);
      const srcMaxX = Math.min(sw - 1, Math.ceil((outX + outWidth) / scale) + srcHalo);

      tiles.push({
        tileIndex,
        tileCol: col,
        tileRow: row,
        outX,
        outY,
        outWidth,
        outHeight,
        srcMinX,
        srcMinY,
        srcMaxX,
        srcMaxY,
      });
      tileIndex += 1;
    }
  }

  return tiles;
}

function sinc(x: number): number {
  if (Math.abs(x) < 1e-8) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczos3Weight(x: number): number {
  const ax = Math.abs(x);
  if (ax >= NANOPIXEL_LANCZOS_A) return 0;
  return sinc(ax) * sinc(ax / NANOPIXEL_LANCZOS_A);
}

function sampleSourceLuma(rgba: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  const cx = clamp(x, 0, w - 1);
  const cy = clamp(y, 0, h - 1);
  const idx = (cy * w + cx) * 4;
  return (0.299 * rgba[idx]! + 0.587 * rgba[idx + 1]! + 0.114 * rgba[idx + 2]!) / 255;
}

/**
 * 단일 타일에 대해 에지 방향성 Lanczos-3 보간 + 해석적 종이 하이트맵 미세 과립 합성을 수행한다.
 * 좌표 계산을 전역 출력 좌표(outX + lx, outY + ly)로만 수행하므로 타일 분할 경계 이음새가 0이다.
 */
export function upscaleTileNanopixel(
  sourceRgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  tile: NanopixelTileDescriptor,
  options: NanopixelUpscaleOptions,
): NanopixelTileOutput {
  const expectedBytes = sourceWidth * sourceHeight * 4;
  if (sourceRgba.length < expectedBytes) {
    throw new Error("원본 RGBA 버퍼 길이가 이미지 해상도와 일치하지 않습니다.");
  }

  const scale = options.scale;
  const fullOutW = sourceWidth * scale;
  const fullOutH = sourceHeight * scale;
  const sharpen = clamp(options.edgeSharpenStrength ?? 0.35, 0, 1);
  const reliefStrength = clamp(options.paperReliefStrength ?? 0.25, 0, 1);
  const granStrength = clamp(options.granulationStrength ?? 0.3, 0, 1);
  const paperRecipe = normalizeAnalyticPaperRecipe(options.paperRecipe);
  const extraOctaves = scale === 4 ? 2 : 1;

  const outRgba = new Uint8ClampedArray(tile.outWidth * tile.outHeight * 4);
  const wxBuf = new Float64Array(NANOPIXEL_LANCZOS_A * 2);
  const wyBuf = new Float64Array(NANOPIXEL_LANCZOS_A * 2);

  for (let ly = 0; ly < tile.outHeight; ly += 1) {
    const gy = tile.outY + ly;
    const srcYf = (gy + 0.5) / scale - 0.5;
    const baseY = Math.floor(srcYf);

    let wySum = 0;
    for (let ky = 0; ky < NANOPIXEL_LANCZOS_A * 2; ky += 1) {
      const sy = baseY - (NANOPIXEL_LANCZOS_A - 1) + ky;
      const w = lanczos3Weight(srcYf - sy);
      wyBuf[ky] = w;
      wySum += w;
    }

    for (let lx = 0; lx < tile.outWidth; lx += 1) {
      const gx = tile.outX + lx;
      const srcXf = (gx + 0.5) / scale - 0.5;
      const baseX = Math.floor(srcXf);

      let wxSum = 0;
      for (let kx = 0; kx < NANOPIXEL_LANCZOS_A * 2; kx += 1) {
        const sx = baseX - (NANOPIXEL_LANCZOS_A - 1) + kx;
        const w = lanczos3Weight(srcXf - sx);
        wxBuf[kx] = w;
        wxSum += w;
      }

      // 1) Lanczos-3 보간 + 국소 최소/최대(디링잉 클램프용)
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;
      let rMin = 255;
      let rMax = 0;
      let gMin = 255;
      let gMax = 0;
      let bMin = 255;
      let bMax = 0;

      const invWeightSum = Math.abs(wxSum * wySum) > 1e-9 ? 1 / (wxSum * wySum) : 1;

      for (let ky = 0; ky < NANOPIXEL_LANCZOS_A * 2; ky += 1) {
        const sy = clamp(baseY - (NANOPIXEL_LANCZOS_A - 1) + ky, 0, sourceHeight - 1);
        const wy = wyBuf[ky]!;
        const isInnerY = ky >= NANOPIXEL_LANCZOS_A - 1 && ky <= NANOPIXEL_LANCZOS_A;
        for (let kx = 0; kx < NANOPIXEL_LANCZOS_A * 2; kx += 1) {
          const sx = clamp(baseX - (NANOPIXEL_LANCZOS_A - 1) + kx, 0, sourceWidth - 1);
          const w = wxBuf[kx]! * wy * invWeightSum;
          const sIdx = (sy * sourceWidth + sx) * 4;
          const sr = sourceRgba[sIdx]!;
          const sg = sourceRgba[sIdx + 1]!;
          const sb = sourceRgba[sIdx + 2]!;
          const sa = sourceRgba[sIdx + 3]!;
          rAcc += sr * w;
          gAcc += sg * w;
          bAcc += sb * w;
          aAcc += sa * w;
          if (isInnerY && kx >= NANOPIXEL_LANCZOS_A - 1 && kx <= NANOPIXEL_LANCZOS_A) {
            if (sr < rMin) rMin = sr;
            if (sr > rMax) rMax = sr;
            if (sg < gMin) gMin = sg;
            if (sg > gMax) gMax = sg;
            if (sb < bMin) bMin = sb;
            if (sb > bMax) bMax = sb;
          }
        }
      }

      // 링잉(halo) 방지를 위한 인접 2x2 범위 소프트 클램프
      let r = clamp(rAcc, rMin, rMax);
      let g = clamp(gAcc, gMin, gMax);
      let b = clamp(bAcc, bMin, bMax);
      const a = clamp(aAcc, 0, 255);

      // 2) 에지 방향성(Sobel) 선명화: 고대비 선화 경계만 선택적 강화
      if (sharpen > 0 && a > 4) {
        const cx = clamp(Math.round(srcXf), 0, sourceWidth - 1);
        const cy = clamp(Math.round(srcYf), 0, sourceHeight - 1);
        const lL = sampleSourceLuma(sourceRgba, sourceWidth, sourceHeight, cx - 1, cy);
        const lR = sampleSourceLuma(sourceRgba, sourceWidth, sourceHeight, cx + 1, cy);
        const lT = sampleSourceLuma(sourceRgba, sourceWidth, sourceHeight, cx, cy - 1);
        const lB = sampleSourceLuma(sourceRgba, sourceWidth, sourceHeight, cx, cy + 1);
        const lC = sampleSourceLuma(sourceRgba, sourceWidth, sourceHeight, cx, cy);
        const gradMag = Math.hypot(lR - lL, lB - lT);
        const laplacian = lC - 0.25 * (lL + lR + lT + lB);
        const edgeBoost = laplacian * Math.min(1, gradMag * 2.5) * sharpen * 95;
        r = clamp(r + edgeBoost, 0, 255);
        g = clamp(g + edgeBoost, 0, 255);
        b = clamp(b + edgeBoost, 0, 255);
      }

      // 3) 해석적 종이 하이트맵 + 미세 안료 과립 프랙탈 재합성
      if ((reliefStrength > 0 || granStrength > 0) && a > 4) {
        const normX = (gx + 0.5) / fullOutW;
        const normY = (gy + 0.5) / fullOutH;
        const paperH = evaluateAnalyticPaperHeight(normX, normY, paperRecipe, extraOctaves);
        const alphaWeight = a / 255;

        // 종이 골(paperH < 0.5)에 안료가 더 짙게 고이는 과립 특성 반영
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const midtoneMask = 1 - Math.abs(luma * 2 - 1);
        const centeredRelief = (paperH - 0.5) * 2; // [-1, 1]
        const reliefDelta = centeredRelief * reliefStrength * 18 * alphaWeight;
        const granDelta =
          centeredRelief * granStrength * (0.35 + 0.65 * chroma) * (0.3 + 0.7 * midtoneMask) * 24 * alphaWeight;

        const totalDelta = reliefDelta + granDelta;
        r = clamp(r + totalDelta, 0, 255);
        g = clamp(g + totalDelta, 0, 255);
        b = clamp(b + totalDelta, 0, 255);
      }

      const oIdx = (ly * tile.outWidth + lx) * 4;
      outRgba[oIdx] = clampByte(r);
      outRgba[oIdx + 1] = clampByte(g);
      outRgba[oIdx + 2] = clampByte(b);
      outRgba[oIdx + 3] = clampByte(a);
    }
  }

  return { tile, rgba: outRgba };
}

/**
 * 전체 이미지를 타일 단위로 나노픽셀 업스케일하고 최종 버퍼로 조립한다.
 * onTileComplete 콜백으로 스트리밍 진행률·타일 단위 내보내기를 지원한다.
 */
export function upscaleImageNanopixel(
  sourceRgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  options: NanopixelUpscaleOptions,
  onTileComplete?: (output: NanopixelTileOutput, completedTiles: number, totalTiles: number) => void,
): NanopixelUpscaleResult {
  const tiles = planNanopixelTiles(sourceWidth, sourceHeight, options.scale, options.tileSize);
  const outW = sourceWidth * options.scale;
  const outH = sourceHeight * options.scale;
  const fullRgba = new Uint8ClampedArray(outW * outH * 4);

  for (let i = 0; i < tiles.length; i += 1) {
    if (options.signal?.aborted) {
      throw new Error("나노픽셀 업스케일 작업이 취소되었습니다.");
    }
    const tile = tiles[i]!;
    const tileOut = upscaleTileNanopixel(sourceRgba, sourceWidth, sourceHeight, tile, options);

    // 타일 버퍼를 최종 출력 이미지의 정확 위치로 복사
    for (let row = 0; row < tile.outHeight; row += 1) {
      const srcOffset = row * tile.outWidth * 4;
      const dstOffset = ((tile.outY + row) * outW + tile.outX) * 4;
      fullRgba.set(tileOut.rgba.subarray(srcOffset, srcOffset + tile.outWidth * 4), dstOffset);
    }
    onTileComplete?.(tileOut, i + 1, tiles.length);
  }

  return {
    width: outW,
    height: outH,
    scale: options.scale,
    tileCount: tiles.length,
    rgba: fullRgba,
  };
}
