/**
 * 클린룸 틈새 닫기 채우기(Close & Fill) + 듀얼 브러시 팁 마스크 합성 통합 모듈.
 *
 * 1. 형태학적 닫힘(Morphological Closing, gap radius 1..12px):
 *    - 축 정렬 2D 분리형 박스 닫힘 + 45°/135° 대각선 분리형 닫힘을 O(W·H) 누적합으로 수행해
 *      수평·수직·대각선 열린 선화 틈을 자동 봉합한다.
 *    - 위상 기반 내부 코너 복원으로 90° 모서리 뭉개짐을 방지한다.
 * 2. 안티앨리어싱 팽창 채우기(1..2px AA Dilation Fill):
 *    - 선화 중심 장벽 너머로 번지지 않도록 보호하며 1~2px 확장하고 투명 선화(dst-over)와
 *      불투명 백지 선화(multiply) 모두에서 흰 테두리(white halo) 없이 합성한다.
 * 3. 듀얼 브러시 팁 마스크 합성 (`studio-dual-brush-tip-composite.ts` 재수출):
 *    - `multiply` / `subtract` / `darken` / `overlay` 4종 모드를 제공한다.
 */

export {
  DUAL_BRUSH_TIP_COMPOSITE_MODES,
  blendDualBrushTipCoverage,
  compositeDualBrushTipMasks,
  generateProceduralGrainTipMask,
  generateRadialBrushTipMask,
  type BrushTipMaskBuffer,
  type DualBrushTipCompositeMode,
  type DualBrushTipCompositeOptions,
  type DualBrushTipCompositeResult,
} from "./studio-dual-brush-tip-composite";

export const GAP_CLOSING_MIN_RADIUS_PX = 1;
export const GAP_CLOSING_MAX_RADIUS_PX = 12;
export const AA_DILATION_MIN_PX = 0;
export const AA_DILATION_MAX_PX = 2;

export type RgbaTuple = readonly [number, number, number, number];

export interface GapClosingFillOptions {
  /** 형태학적 닫힘 반경(px). 1..12로 클램프(0은 닫힘 비활성). 기본값 4. */
  readonly gapRadiusPx?: number;
  /** 선화 판별 임계 강도(0..1). 기본값 0.35. */
  readonly lineBarrierThreshold?: number;
  /** 시작점 기준 색상 허용 오차(0..255 채널별 평균 기준). 기본값 18. */
  readonly colorTolerance?: number;
  /** 안티앨리어싱 팽창 채우기 픽셀 수(0..2). 기본값 1. */
  readonly aaExpandPx?: number;
  /** 대각선(45°/135°) 형태학적 닫힘 병행 여부. 기본값 true. */
  readonly enableDiagonalClosing?: boolean;
  /** 팽창 시 선화 중심 장벽 보호 임계 강도(0..1). 기본값 0.75. */
  readonly solidInkStopThreshold?: number;
}

export interface GapClosingFillResult {
  readonly width: number;
  readonly height: number;
  /** 최종 채색 커버리지 마스크 (0..255). */
  readonly fillMask: Uint8Array;
  /** 선화 아래로 안티앨리어싱 합성된 RGBA 버퍼. */
  readonly compositedRgba: Uint8ClampedArray;
  /** 형태학적 닫힘으로 실제 외부 누수를 막은 틈새 봉합 픽셀 수. */
  readonly sealedGapPixelCount: number;
  /** 순수 플러드 필로 채워진 내부 픽셀 수. */
  readonly coreFilledPixelCount: number;
  /** 1~2px AA 팽창으로 추가 커버된 가장자리 픽셀 수. */
  readonly aaExpandedPixelCount: number;
  /** 최종 활성 채색 픽셀 수. */
  readonly totalFilledPixelCount: number;
  /** 실제 적용된 닫힘 반경(px). */
  readonly appliedGapRadiusPx: number;
  /** 실제 적용된 AA 팽창 반경(px). */
  readonly appliedAaExpandPx: number;
}

const CARDINAL_4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * RGBA 픽셀 버퍼에서 투명 선화·백지 선화를 통합하는 연속 선화 강도(0..1)를 계산한다.
 * `inkStrength = (alpha / 255) * (1 - luminance / 255)`
 */
export function extractLineartInkStrength(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const total = Math.max(0, width * height);
  const strength = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    const r = rgba[off] ?? 0;
    const g = rgba[off + 1] ?? 0;
    const b = rgba[off + 2] ?? 0;
    const a = rgba[off + 3] ?? 0;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    strength[i] = (a / 255) * (1 - lum);
  }
  return strength;
}

function boxMorph1DHorizontal(
  src: Uint8Array,
  dst: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: "dilate" | "erode",
  prefix: Int32Array,
): void {
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    prefix[0] = 0;
    for (let x = 0; x < width; x += 1) {
      prefix[x + 1] = prefix[x]! + (src[rowOff + x]! > 0 ? 1 : 0);
    }
    for (let x = 0; x < width; x += 1) {
      const lo = x - radius < 0 ? 0 : x - radius;
      const hi = x + radius >= width ? width - 1 : x + radius;
      const sum = prefix[hi + 1]! - prefix[lo]!;
      dst[rowOff + x] =
        mode === "dilate" ? (sum > 0 ? 1 : 0) : sum === hi - lo + 1 ? 1 : 0;
    }
  }
}

function boxMorph1DVertical(
  src: Uint8Array,
  dst: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: "dilate" | "erode",
  prefix: Int32Array,
): void {
  for (let x = 0; x < width; x += 1) {
    prefix[0] = 0;
    for (let y = 0; y < height; y += 1) {
      prefix[y + 1] = prefix[y]! + (src[y * width + x]! > 0 ? 1 : 0);
    }
    for (let y = 0; y < height; y += 1) {
      const lo = y - radius < 0 ? 0 : y - radius;
      const hi = y + radius >= height ? height - 1 : y + radius;
      const sum = prefix[hi + 1]! - prefix[lo]!;
      dst[y * width + x] =
        mode === "dilate" ? (sum > 0 ? 1 : 0) : sum === hi - lo + 1 ? 1 : 0;
    }
  }
}

function diagMorph1D(
  src: Uint8Array,
  dst: Uint8Array,
  width: number,
  height: number,
  radius: number,
  dy: 1 | -1,
  mode: "dilate" | "erode",
  prefix: Int32Array,
  coords: Int32Array,
): void {
  const processLine = (startX: number, startY: number): void => {
    let len = 0;
    let cx = startX;
    let cy = startY;
    prefix[0] = 0;
    while (cx >= 0 && cx < width && cy >= 0 && cy < height) {
      const idx = cy * width + cx;
      coords[len] = idx;
      prefix[len + 1] = prefix[len]! + (src[idx]! > 0 ? 1 : 0);
      len += 1;
      cx += 1;
      cy += dy;
    }
    for (let i = 0; i < len; i += 1) {
      const lo = i - radius < 0 ? 0 : i - radius;
      const hi = i + radius >= len ? len - 1 : i + radius;
      const sum = prefix[hi + 1]! - prefix[lo]!;
      dst[coords[i]!] =
        mode === "dilate" ? (sum > 0 ? 1 : 0) : sum === hi - lo + 1 ? 1 : 0;
    }
  };

  if (dy === 1) {
    for (let x = 0; x < width; x += 1) processLine(x, 0);
    for (let y = 1; y < height; y += 1) processLine(0, y);
  } else {
    for (let y = 0; y < height; y += 1) processLine(0, y);
    for (let x = 1; x < width; x += 1) processLine(x, height - 1);
  }
}

/**
 * 2진 마스크(0/1)에 반경 radiusPx(1..12) 형태학적 닫힘(Dilate → Erode)을 적용한다.
 * 축 정렬 2D 박스 닫힘과 선택적 45°/135° 대각선 닫힘을 결합해 전방향 틈새를 O(W·H)에 봉합한다.
 */
export function morphologicalCloseBinaryMask(
  binaryMask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
  enableDiagonalClosing = true,
): Uint8Array {
  const total = width * height;
  if (total <= 0) return new Uint8Array(0);
  const r = Math.round(clamp(radiusPx, GAP_CLOSING_MIN_RADIUS_PX, GAP_CLOSING_MAX_RADIUS_PX));

  const maxDim = Math.max(width, height) + 2;
  const prefix = new Int32Array(maxDim);
  const bufA = new Uint8Array(total);
  const bufB = new Uint8Array(total);

  boxMorph1DHorizontal(binaryMask, bufA, width, height, r, "dilate", prefix);
  boxMorph1DVertical(bufA, bufB, width, height, r, "dilate", prefix);
  boxMorph1DHorizontal(bufB, bufA, width, height, r, "erode", prefix);
  const boxClosed = new Uint8Array(total);
  boxMorph1DVertical(bufA, boxClosed, width, height, r, "erode", prefix);

  if (!enableDiagonalClosing) {
    for (let i = 0; i < total; i += 1) {
      if (binaryMask[i]! > 0) boxClosed[i] = 1;
    }
    return boxClosed;
  }

  const coords = new Int32Array(maxDim);
  const diagClosed = new Uint8Array(total);
  diagMorph1D(binaryMask, bufA, width, height, r, 1, "dilate", prefix, coords);
  diagMorph1D(bufA, bufB, width, height, r, -1, "dilate", prefix, coords);
  diagMorph1D(bufB, bufA, width, height, r, 1, "erode", prefix, coords);
  diagMorph1D(bufA, diagClosed, width, height, r, -1, "erode", prefix, coords);

  const combined = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    combined[i] = binaryMask[i]! > 0 || boxClosed[i]! > 0 || diagClosed[i]! > 0 ? 1 : 0;
  }
  return combined;
}

function recoverInteriorCornerBevels(
  origBarrier: Uint8Array,
  sealedBarrier: Uint8Array,
  floodMask: Uint8Array,
  width: number,
  height: number,
): { readonly recoveredCount: number; readonly sealedBridgeCount: number } {
  const total = width * height;
  const visited = new Uint8Array(total);
  const comp: number[] = [];
  let recoveredCount = 0;
  let sealedBridgeCount = 0;

  for (let start = 0; start < total; start += 1) {
    if (sealedBarrier[start] !== 1 || origBarrier[start] === 1 || visited[start] === 1) continue;
    comp.length = 0;
    visited[start] = 1;
    comp.push(start);
    let head = 0;
    let touchesInterior = false;
    let touchesExterior = false;

    while (head < comp.length) {
      const cur = comp[head]!;
      head += 1;
      const cx = cur % width;
      const cy = Math.floor(cur / width);

      for (const [dx, dy] of CARDINAL_4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (floodMask[nIdx] === 1) touchesInterior = true;
        else if (sealedBarrier[nIdx] === 0) touchesExterior = true;
        else if (origBarrier[nIdx] === 0 && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          comp.push(nIdx);
        }
      }
    }

    if (touchesInterior && !touchesExterior) {
      for (const idx of comp) floodMask[idx] = 1;
      recoveredCount += comp.length;
    } else if (touchesInterior && touchesExterior) {
      sealedBridgeCount += comp.length;
    }
  }
  return { recoveredCount, sealedBridgeCount };
}

/**
 * 틈새 닫기 채우기(Close & Fill) + 1~2px 안티앨리어싱 팽창 채우기(흰 테두리 0)를 실행한다.
 */
export function runGapClosingFloodFill(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  fillColor: RgbaTuple,
  options: GapClosingFillOptions = {},
): GapClosingFillResult {
  const total = Math.max(0, width * height);
  const compositedRgba = new Uint8ClampedArray(rgba);
  const emptyMask = new Uint8Array(total);
  const rawGap = options.gapRadiusPx ?? 4;
  const appliedGapRadiusPx =
    rawGap <= 0
      ? 0
      : Math.round(clamp(rawGap, GAP_CLOSING_MIN_RADIUS_PX, GAP_CLOSING_MAX_RADIUS_PX));
  const appliedAaExpandPx = Math.round(
    clamp(options.aaExpandPx ?? 1, AA_DILATION_MIN_PX, AA_DILATION_MAX_PX),
  );
  const barrierThreshold = clamp(options.lineBarrierThreshold ?? 0.35, 0.05, 0.95);
  const colorTolerance = clamp(options.colorTolerance ?? 18, 0, 255);
  const enableDiagonalClosing = options.enableDiagonalClosing ?? true;
  const solidInkStopThreshold = clamp(options.solidInkStopThreshold ?? 0.75, 0.4, 0.99);

  const emptyResult = (): GapClosingFillResult => ({
    width,
    height,
    fillMask: emptyMask,
    compositedRgba,
    sealedGapPixelCount: 0,
    coreFilledPixelCount: 0,
    aaExpandedPixelCount: 0,
    totalFilledPixelCount: 0,
    appliedGapRadiusPx,
    appliedAaExpandPx,
  });

  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (width <= 0 || height <= 0 || sx < 0 || sx >= width || sy < 0 || sy >= height) {
    return emptyResult();
  }

  const inkStrength = extractLineartInkStrength(rgba, width, height);
  const origBarrier = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (inkStrength[i]! >= barrierThreshold) origBarrier[i] = 1;
  }

  const seedIdx = sy * width + sx;
  if (origBarrier[seedIdx] === 1) return emptyResult();

  const sealedBarrier =
    appliedGapRadiusPx > 0
      ? morphologicalCloseBinaryMask(
          origBarrier,
          width,
          height,
          appliedGapRadiusPx,
          enableDiagonalClosing,
        )
      : new Uint8Array(origBarrier);
  if (sealedBarrier[seedIdx] === 1) return emptyResult();

  // BFS 플러드 필
  const floodMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const seedOff = seedIdx * 4;
  const sr = rgba[seedOff] ?? 0;
  const sg = rgba[seedOff + 1] ?? 0;
  const sb = rgba[seedOff + 2] ?? 0;
  const sa = rgba[seedOff + 3] ?? 0;
  const maxL1Diff = colorTolerance * 4;

  floodMask[seedIdx] = 1;
  queue[tail] = seedIdx;
  tail += 1;
  let coreFilledPixelCount = 1;

  while (head < tail) {
    const cur = queue[head]!;
    head += 1;
    const cx = cur % width;
    const cy = Math.floor(cur / width);

    for (const [dx, dy] of CARDINAL_4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (floodMask[nIdx] === 1 || sealedBarrier[nIdx] === 1) continue;
      const off = nIdx * 4;
      const diff =
        Math.abs((rgba[off] ?? 0) - sr)
        + Math.abs((rgba[off + 1] ?? 0) - sg)
        + Math.abs((rgba[off + 2] ?? 0) - sb)
        + Math.abs((rgba[off + 3] ?? 0) - sa);
      if (diff <= maxL1Diff) {
        floodMask[nIdx] = 1;
        queue[tail] = nIdx;
        tail += 1;
        coreFilledPixelCount += 1;
      }
    }
  }

  const cornerStats = recoverInteriorCornerBevels(
    origBarrier,
    sealedBarrier,
    floodMask,
    width,
    height,
  );
  coreFilledPixelCount += cornerStats.recoveredCount;

  // 1~2px 안티앨리어싱 팽창 채우기 (외부 청정 배경 및 선화 코어 너머 번짐 차단)
  const exteriorClear = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (floodMask[i] === 0 && sealedBarrier[i] === 0 && inkStrength[i]! < 0.04) {
      exteriorClear[i] = 1;
    }
  }

  let expanded = new Uint8Array(floodMask);
  let aaExpandedPixelCount = 0;
  for (let step = 0; step < appliedAaExpandPx; step += 1) {
    const next = new Uint8Array(expanded);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (expanded[idx] !== 1 || inkStrength[idx]! >= solidInkStopThreshold) continue;
        for (let ey = -1; ey <= 1; ey += 1) {
          const ny = y + ey;
          if (ny < 0 || ny >= height) continue;
          for (let ex = -1; ex <= 1; ex += 1) {
            if (ex === 0 && ey === 0) continue;
            const nx = x + ex;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (next[nIdx] === 1 || exteriorClear[nIdx] === 1) continue;
            if (sealedBarrier[nIdx] === 1 && origBarrier[nIdx] === 0) continue;
            next[nIdx] = 1;
            aaExpandedPixelCount += 1;
          }
        }
      }
    }
    expanded = next;
  }

  // 선화 아래 합성 (투명 선화: dst-over / 백지 선화: 채널 곱셈 multiply)
  const fillMask = new Uint8Array(total);
  const fr = Math.round(clamp(fillColor[0], 0, 255));
  const fg = Math.round(clamp(fillColor[1], 0, 255));
  const fb = Math.round(clamp(fillColor[2], 0, 255));
  const fa = Math.round(clamp(fillColor[3], 0, 255));
  const fillAlpha01 = fa / 255;
  let totalFilledPixelCount = 0;

  for (let i = 0; i < total; i += 1) {
    if (expanded[i] !== 1) continue;
    fillMask[i] = fa;
    totalFilledPixelCount += 1;

    const off = i * 4;
    const srcR = rgba[off] ?? 0;
    const srcG = rgba[off + 1] ?? 0;
    const srcB = rgba[off + 2] ?? 0;
    const srcA = rgba[off + 3] ?? 0;

    if (srcA < 255) {
      const sa01 = srcA / 255;
      const outA = sa01 + fillAlpha01 * (1 - sa01);
      if (outA > 1e-6) {
        compositedRgba[off] = Math.round((srcR * sa01 + fr * fillAlpha01 * (1 - sa01)) / outA);
        compositedRgba[off + 1] = Math.round((srcG * sa01 + fg * fillAlpha01 * (1 - sa01)) / outA);
        compositedRgba[off + 2] = Math.round((srcB * sa01 + fb * fillAlpha01 * (1 - sa01)) / outA);
        compositedRgba[off + 3] = Math.round(outA * 255);
      }
    } else {
      const mulR = (srcR * fr) / 255;
      const mulG = (srcG * fg) / 255;
      const mulB = (srcB * fb) / 255;
      compositedRgba[off] = Math.round(srcR + (mulR - srcR) * fillAlpha01);
      compositedRgba[off + 1] = Math.round(srcG + (mulG - srcG) * fillAlpha01);
      compositedRgba[off + 2] = Math.round(srcB + (mulB - srcB) * fillAlpha01);
      compositedRgba[off + 3] = 255;
    }
  }

  return {
    width,
    height,
    fillMask,
    compositedRgba,
    sealedGapPixelCount: cornerStats.sealedBridgeCount,
    coreFilledPixelCount,
    aaExpandedPixelCount,
    totalFilledPixelCount,
    appliedGapRadiusPx,
    appliedAaExpandPx,
  };
}
