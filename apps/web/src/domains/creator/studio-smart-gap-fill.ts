/**
 * Studio 스마트 갭 클로징(Gap-Closing) 채색 버킷 모듈.
 *
 * 펜 선이 미세하게 뚫려있어(터진 선) 페인트 페인트가 패널 외부로 새어나가는 현상을 방지하기 위해,
 * 지정된 갭 반경(gapRadius px) 내의 열린 윤곽선 구멍을 미리 가상 밀폐(Seal)한 후 칠 구역을 추출한다.
 */

export interface StudioSmartGapFillOptions {
  /** 윤곽선 세기 판단 임계값 (0–255). 기본값 32. */
  readonly lineThreshold?: number;
  /** 갭 클로징 최대 반경(px). 1–16. 기본값 4. */
  readonly gapRadius?: number;
  /** 허용 색상 오차(0–255). 기본값 16. */
  readonly colorTolerance?: number;
  /** 윤곽선 아래 안쪽으로 확장(양수 1..8) 또는 안쪽으로 축소(음수 -8..-1). 기본값 1. */
  readonly expandPx?: number;
  /** 대각선(45°/135°) 방향 터진 선 갭도 함께 밀폐할지 여부. 기본값 true. */
  readonly enableDiagonalGapSeal?: boolean;
  /**
   * 채워진 영역 내부에 고립된 미세 미채색 구멍(안 칠해진 잔여 점/먼지 구멍)의 최대 자동 흡수 면적(px).
   * 0 이면 비활성화(기본값 0). 양수(예: 1..32)면 캔버스 외곽과 닿지 않고 채색 영역에 둘러싸인
   * 비선화 미세 구멍을 자동으로 채색 마스크에 편입한다(CSP "안 칠해진 부분 칠하기" 대응).
   */
  readonly fillIsolatedPinholesMaxArea?: number;
  /**
   * 영역 확장(expandPx > 0) 시 선화 중심 장벽(isBoundary)을 넘어 반대편 영역으로 번지는 것을
   * 차단할지 여부. 기본값 false(기존 동작 호환).
   */
  readonly stopAtLineBarrier?: boolean;
}

export interface StudioSmartGapFillResult {
  /** 칠해진 마스크 픽셀 배열 (width × height, 0 또는 255). */
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** 메우기 성공한 갭 구멍 개수. */
  readonly sealedGapCount: number;
  /** 채워진 총 픽셀 수. */
  readonly filledPixelCount: number;
  /** 자동 흡수된 내부 미세 구멍(Pinhole) 픽셀 수. */
  readonly absorbedPinholeCount: number;
}

const ORTHOGONAL_GAP_RAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
];

const ALL_EIGHT_WAY_GAP_RAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const CARDINAL_NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function countActiveMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 255) count += 1;
  }
  return count;
}

/**
 * 채색 마스크를 radiusPx 만큼 팽창(양수) 또는 침식(음수)한다.
 * stopAtLineBarrier 가 켜져 있으면 선화 픽셀(isBoundary=1)은 1px 안티에일리어싱 가장자리까지만
 * 진입하고 그 너머로는 확장하지 않아 얇은 선 너머로 색이 번지는 현상을 막는다.
 */
export function dilateOrErodeSmartFillMask(
  mask: Uint8Array,
  width: number,
  height: number,
  expandPx: number,
  isBoundary?: Uint8Array,
  stopAtLineBarrier = false,
): Uint8Array {
  const steps = Math.round(Math.max(-8, Math.min(8, Number.isFinite(expandPx) ? expandPx : 0)));
  if (steps === 0 || width <= 0 || height <= 0) return new Uint8Array(mask);

  let current = new Uint8Array(mask);
  if (steps > 0) {
    for (let step = 0; step < steps; step += 1) {
      const next = new Uint8Array(current);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (current[idx] !== 255) continue;
          // stopAtLineBarrier가 켜진 경우 이미 선화 장벽 위에 올라탄 픽셀에서는 더 이상 바깥으로 확장하지 않는다.
          if (stopAtLineBarrier && isBoundary && isBoundary[idx] === 1) continue;
          for (let ey = -1; ey <= 1; ey += 1) {
            for (let ex = -1; ex <= 1; ex += 1) {
              const px = x + ex;
              const py = y + ey;
              if (px >= 0 && px < width && py >= 0 && py < height) {
                next[py * width + px] = 255;
              }
            }
          }
        }
      }
      current = next;
    }
    return current;
  }

  const shrinkSteps = -steps;
  for (let step = 0; step < shrinkSteps; step += 1) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (current[idx] !== 255) continue;
        // 캔버스 가장자리이거나 8이웃 중 하나라도 0이면 침식된다.
        let keep = x > 0 && x < width - 1 && y > 0 && y < height - 1;
        if (keep) {
          for (let ey = -1; ey <= 1 && keep; ey += 1) {
            for (let ex = -1; ex <= 1; ex += 1) {
              if (current[(y + ey) * width + (x + ex)] !== 255) {
                keep = false;
                break;
              }
            }
          }
        }
        if (!keep) next[idx] = 0;
      }
    }
    current = next;
  }
  return current;
}

/**
 * 2D RGBA 픽셀 버퍼에서 (startX, startY) 좌표 기준 갭 클로징 페인트 마스크를 생성한다.
 */
export function computeStudioSmartGapFillMask(
  pixelData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  options: StudioSmartGapFillOptions = {},
): StudioSmartGapFillResult {
  const lineThreshold = options.lineThreshold ?? 32;
  const gapRadius = Math.max(1, Math.min(16, options.gapRadius ?? 4));
  const colorTolerance = Math.max(0, Math.min(255, options.colorTolerance ?? 16));
  const expandPx = Math.round(Math.max(-8, Math.min(8, options.expandPx ?? 1)));
  const enableDiagonalGapSeal = options.enableDiagonalGapSeal ?? true;
  const maxPinholeArea = Math.max(
    0,
    Math.min(512, Math.floor(options.fillIsolatedPinholesMaxArea ?? 0)),
  );
  const stopAtLineBarrier = options.stopAtLineBarrier ?? false;

  const totalPixels = width * height;
  const isBoundary = new Uint8Array(totalPixels);

  // 1단계: 선화(Boundary) 픽셀 식별 (알파가 높거나 어두운 픽셀)
  for (let i = 0; i < totalPixels; i += 1) {
    const idx = i * 4;
    const r = pixelData[idx] ?? 0;
    const g = pixelData[idx + 1] ?? 0;
    const b = pixelData[idx + 2] ?? 0;
    const a = pixelData[idx + 3] ?? 0;

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (a > 128 && brightness < 255 - lineThreshold) {
      isBoundary[i] = 1;
    }
  }

  // 2단계: 터진 선 갭(Gap) 감지 및 가상 브릿지 연결 (Sealing — 직교 + 선택적 대각선)
  let sealedGapCount = 0;
  const sealedBoundaries = new Uint8Array(isBoundary);
  const gapRays = enableDiagonalGapSeal ? ALL_EIGHT_WAY_GAP_RAYS : ORTHOGONAL_GAP_RAYS;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (isBoundary[idx] === 1) continue;

      let isBridge = false;
      for (const [dx, dy] of gapRays) {
        let posDist = 0;
        let negDist = 0;

        for (let r = 1; r <= gapRadius; r += 1) {
          const px1 = x + dx * r;
          const py1 = y + dy * r;
          const px2 = x - dx * r;
          const py2 = y - dy * r;

          if (posDist === 0 && px1 >= 0 && px1 < width && py1 >= 0 && py1 < height) {
            if (isBoundary[py1 * width + px1] === 1) posDist = r;
          }
          if (negDist === 0 && px2 >= 0 && px2 < width && py2 >= 0 && py2 < height) {
            if (isBoundary[py2 * width + px2] === 1) negDist = r;
          }
        }

        if (posDist > 0 && negDist > 0 && posDist + negDist <= gapRadius + 1) {
          if (dx !== 0 && dy !== 0) {
            const px1 = x + dx * posDist;
            const py1 = y + dy * posDist;
            const px2 = x - dx * negDist;
            const py2 = y - dy * negDist;
            // 직사각형 90° 모서리 안쪽 대각선(가로벽과 세로벽이 만나는 코너)을 갭으로 오인해
            // 모서리 내부를 가로막지 않도록, 직교 코너 정점이 이미 선화이면 브릿지에서 제외한다.
            if (isBoundary[py1 * width + px2] === 1 || isBoundary[py2 * width + px1] === 1) {
              continue;
            }
          }
          isBridge = true;
          break;
        }
      }

      if (isBridge) {
        sealedBoundaries[idx] = 1;
        sealedGapCount += 1;
      }
    }
  }

  // 3단계: BFS Flood Fill 탐색
  const mask = new Uint8Array(totalPixels);
  const targetIdx = Math.floor(startY) * width + Math.floor(startX);
  if (targetIdx < 0 || targetIdx >= totalPixels || sealedBoundaries[targetIdx] === 1) {
    return {
      mask,
      width,
      height,
      sealedGapCount,
      filledPixelCount: 0,
      absorbedPinholeCount: 0,
    };
  }

  const startR = pixelData[targetIdx * 4] ?? 0;
  const startG = pixelData[targetIdx * 4 + 1] ?? 0;
  const startB = pixelData[targetIdx * 4 + 2] ?? 0;
  const startA = pixelData[targetIdx * 4 + 3] ?? 0;

  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  queue[tail] = targetIdx;
  tail += 1;
  mask[targetIdx] = 255;
  let filledPixelCount = 1;

  while (head < tail) {
    const current = queue[head]!;
    head += 1;
    const cx = current % width;
    const cy = Math.floor(current / width);

    for (const [dx, dy] of CARDINAL_NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (mask[nIdx] === 0 && sealedBoundaries[nIdx] === 0) {
          const pr = pixelData[nIdx * 4] ?? 0;
          const pg = pixelData[nIdx * 4 + 1] ?? 0;
          const pb = pixelData[nIdx * 4 + 2] ?? 0;
          const pa = pixelData[nIdx * 4 + 3] ?? 0;

          const diff =
            Math.abs(pr - startR) +
            Math.abs(pg - startG) +
            Math.abs(pb - startB) +
            Math.abs(pa - startA);

          if (diff <= colorTolerance * 4) {
            mask[nIdx] = 255;
            queue[tail] = nIdx;
            tail += 1;
            filledPixelCount += 1;
          }
        }
      }
    }
  }

  // 3.5단계: 내부 고립 미세 구멍(Pinhole) 자동 흡수 (CSP "안 칠해진 부분 칠하기")
  let absorbedPinholeCount = 0;
  if (maxPinholeArea > 0 && filledPixelCount > 0) {
    const visitedUnfilled = new Uint8Array(totalPixels);
    const islandIndices: number[] = [];

    for (let startPos = 0; startPos < totalPixels; startPos += 1) {
      if (mask[startPos] === 255 || isBoundary[startPos] === 1 || visitedUnfilled[startPos] === 1) {
        continue;
      }
      islandIndices.length = 0;
      let iHead = 0;
      let touchesCanvasBorder = false;
      let touchesFilledMask = false;

      visitedUnfilled[startPos] = 1;
      islandIndices.push(startPos);

      while (iHead < islandIndices.length) {
        const cur = islandIndices[iHead]!;
        iHead += 1;
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) {
          touchesCanvasBorder = true;
        }
        for (const [dx, dy] of CARDINAL_NEIGHBORS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] === 255) {
            touchesFilledMask = true;
            continue;
          }
          if (isBoundary[nIdx] === 1 || visitedUnfilled[nIdx] === 1) continue;
          visitedUnfilled[nIdx] = 1;
          islandIndices.push(nIdx);
        }
      }

      if (!touchesCanvasBorder && touchesFilledMask && islandIndices.length <= maxPinholeArea) {
        for (const idx of islandIndices) {
          mask[idx] = 255;
        }
        absorbedPinholeCount += islandIndices.length;
        filledPixelCount += islandIndices.length;
      }
    }
  }

  // 4단계: Expand / Shrink (양방향 영역 확장·축소 및 선화 장벽 보호)
  if (expandPx !== 0 && filledPixelCount > 0) {
    const adjustedMask = dilateOrErodeSmartFillMask(
      mask,
      width,
      height,
      expandPx,
      isBoundary,
      stopAtLineBarrier,
    );
    return {
      mask: adjustedMask,
      width,
      height,
      sealedGapCount,
      filledPixelCount: expandPx < 0 ? countActiveMaskPixels(adjustedMask) : filledPixelCount,
      absorbedPinholeCount,
    };
  }

  return { mask, width, height, sealedGapCount, filledPixelCount, absorbedPinholeCount };
}
