/**
 * Studio Fill Leftover — CSP `덜 칠한 부분 채우기(Fill leftover, var 477)` 및
 * `덜 칠한 부분 칠하기 펜(Leftover pen, var 149)` 순수 픽셀 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 올가미 또는 브러시 마스크 내부에서 어두운 선화(ink)를 침범하지 않고 면적이 `maxGapAreaPx`
 * 이하인 미채색 틈새 섬(uncolored gap island)만 분리한 뒤, 주변 평탄 채색 픽셀들을 다중 소스
 * BFS(이산 측지 보로노이, Discrete Geodesic Voronoi)로 전파하여 인접 색으로 자연스럽게 메운다.
 */

export interface LeftoverRgbaImageLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface LeftoverPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface FillLeftoverOptions {
  /** 메울 미채색 섬의 최대 픽셀 면적(px²). 기본 64. */
  readonly maxGapAreaPx?: number;
  /** 선화(ink)로 판정할 최대 BT.709 명도(0..255). 기본 72. */
  readonly inkMaxLuminance?: number;
  /** 선화(ink)로 판정할 최소 불투명도(0..255). 기본 120. */
  readonly inkMinAlpha?: number;
  /** 미채색(투명)으로 판정할 최대 알파(0..255). 기본 32. */
  readonly uncoloredMaxAlpha?: number;
  /** 불투명 흰 종이색 픽셀도 미채색 틈새로 취급할지 여부. 기본 true. */
  readonly treatPaperWhiteAsUncolored?: boolean;
  /** 흰 종이로 간주할 최소 BT.709 명도(0..255). 기본 246. */
  readonly paperMinLuminance?: number;
  /** 별도 선화 참조 이미지(지정 시 선화 장벽을 이 이미지에서도 함께 읽는다). */
  readonly referenceLineImage?: LeftoverRgbaImageLike;
  /** 캔버스 가장자리에 맞닿은 미채색 섬도 채울지 여부. 기본 false(배경 오채색 방지). */
  readonly allowCanvasEdgeIslands?: boolean;
}

export interface FillLeftoverRequest extends FillLeftoverOptions {
  readonly target: LeftoverRgbaImageLike;
  /** 작업 허용 영역 마스크(길이 width*height, >0 이면 활성). 생략 시 캔버스 전체. */
  readonly regionMask?: Uint8Array;
}

export interface FillLeftoverResult {
  readonly imageData: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  };
  readonly filledMask: Uint8Array;
  readonly filledIslandCount: number;
  readonly filledPixelCount: number;
}

function bt709Luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  const iv = Math.round(v);
  return iv < lo ? lo : iv > hi ? hi : iv;
}

/**
 * 다각형(올가미) 정점 목록을 스캔라인 홀짝 규칙으로 `Uint8Array` 마스크(0 | 255)에 래스터화한다.
 */
export function rasterizeLassoRegionMask(
  width: number,
  height: number,
  polygon: readonly LeftoverPoint2D[],
): Uint8Array {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const mask = new Uint8Array(w * h);
  if (w === 0 || h === 0 || polygon.length < 3) return mask;

  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i]!;
      const pj = polygon[j]!;
      if ((pi.y > py) !== (pj.y > py)) {
        const xHit = pj.x + ((py - pj.y) * (pi.x - pj.x)) / (pi.y - pj.y);
        xs.push(xHit);
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const startX = clampInt(Math.ceil(xs[k]! - 0.5), 0, w);
      const endX = clampInt(Math.ceil(xs[k + 1]! - 0.5), 0, w);
      const rowOffset = y * w;
      for (let x = startX; x < endX; x++) {
        mask[rowOffset + x] = 255;
      }
    }
  }
  return mask;
}

/**
 * 브러시 경로(`Leftover pen`)를 캡슐 거리 판정으로 `Uint8Array` 마스크(0 | 255)에 래스터화한다.
 */
export function rasterizeBrushStrokeMask(
  width: number,
  height: number,
  strokePoints: readonly LeftoverPoint2D[],
  radiusPx: number,
): Uint8Array {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const mask = new Uint8Array(w * h);
  const r = Math.max(0.5, Number.isFinite(radiusPx) ? radiusPx : 8);
  if (w === 0 || h === 0 || strokePoints.length === 0) return mask;

  const rSq = r * r;
  const stampSegment = (ax: number, ay: number, bx: number, by: number): void => {
    const minX = clampInt(Math.floor(Math.min(ax, bx) - r), 0, w - 1);
    const maxX = clampInt(Math.ceil(Math.max(ax, bx) + r), 0, w - 1);
    const minY = clampInt(Math.floor(Math.min(ay, by) - r), 0, h - 1);
    const maxY = clampInt(Math.ceil(Math.max(ay, by) + r), 0, h - 1);
    const vx = bx - ax;
    const vy = by - ay;
    const lenSq = vx * vx + vy * vy;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const t = lenSq > 1e-9
          ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq))
          : 0;
        const dx = px - (ax + vx * t);
        const dy = py - (ay + vy * t);
        if (dx * dx + dy * dy <= rSq) {
          mask[y * w + x] = 255;
        }
      }
    }
  };

  if (strokePoints.length === 1) {
    const p = strokePoints[0]!;
    stampSegment(p.x, p.y, p.x, p.y);
    return mask;
  }
  for (let i = 0; i < strokePoints.length - 1; i++) {
    const a = strokePoints[i]!;
    const b = strokePoints[i + 1]!;
    stampSegment(a.x, a.y, b.x, b.y);
  }
  return mask;
}

/**
 * 마스크 내부의 작은 미채색 틈새 섬들을 다중 소스 BFS(이산 보로노이)로 메운다.
 * 어두운 선화 픽셀은 절대 침범하거나 건너뛰지 않는다.
 */
export function fillLeftoverGaps(request: FillLeftoverRequest): FillLeftoverResult {
  const { target } = request;
  const w = Math.max(0, Math.floor(target.width));
  const h = Math.max(0, Math.floor(target.height));
  const total = w * h;
  const outData = new Uint8ClampedArray(target.data);
  const filledMask = new Uint8Array(total);
  if (w === 0 || h === 0 || target.data.length < total * 4) {
    return {
      imageData: { data: outData, width: w, height: h },
      filledMask,
      filledIslandCount: 0,
      filledPixelCount: 0,
    };
  }

  const maxGapAreaPx = Math.max(1, Math.floor(request.maxGapAreaPx ?? 64));
  const inkMaxLuminance = request.inkMaxLuminance ?? 72;
  const inkMinAlpha = request.inkMinAlpha ?? 120;
  const uncoloredMaxAlpha = request.uncoloredMaxAlpha ?? 32;
  const treatPaperWhite = request.treatPaperWhiteAsUncolored ?? true;
  const paperMinLuminance = request.paperMinLuminance ?? 246;
  const allowEdge = request.allowCanvasEdgeIslands ?? false;
  const refImg =
    request.referenceLineImage &&
    request.referenceLineImage.width === w &&
    request.referenceLineImage.height === h
      ? request.referenceLineImage
      : null;
  const regionMask = request.regionMask && request.regionMask.length === total ? request.regionMask : null;

  // 픽셀 상태: 0 = 외부/비대상, 1 = 선화 장벽(ink), 2 = 평탄 채색(seed 후보), 3 = 미채색 후보
  const kind = new Uint8Array(total);
  for (let idx = 0; idx < total; idx++) {
    const off = idx * 4;
    const r = target.data[off]!;
    const g = target.data[off + 1]!;
    const b = target.data[off + 2]!;
    const a = target.data[off + 3]!;

    let isInk = a >= inkMinAlpha && bt709Luminance(r, g, b) <= inkMaxLuminance;
    if (!isInk && refImg) {
      const ra = refImg.data[off + 3]!;
      if (ra >= inkMinAlpha) {
        const rLum = bt709Luminance(refImg.data[off]!, refImg.data[off + 1]!, refImg.data[off + 2]!);
        if (rLum <= inkMaxLuminance) isInk = true;
      }
    }

    if (isInk) {
      kind[idx] = 1;
      continue;
    }

    const lum = bt709Luminance(r, g, b);
    const isUncolored =
      a <= uncoloredMaxAlpha || (treatPaperWhite && a >= 200 && lum >= paperMinLuminance);
    if (isUncolored) {
      kind[idx] = !regionMask || regionMask[idx]! > 0 ? 3 : 0;
    } else {
      kind[idx] = 2;
    }
  }

  // 1단계: 미채색 후보(3)의 4-연결 성분을 추출하고 면적이 maxGapAreaPx 이하인 유효 섬만 남긴다.
  const visited = new Uint8Array(total);
  const eligibleGap = new Uint8Array(total);
  const compBuf = new Int32Array(total);
  let filledIslandCount = 0;

  const dirsX = [1, -1, 0, 0] as const;
  const dirsY = [0, 0, 1, -1] as const;

  for (let start = 0; start < total; start++) {
    if (kind[start] !== 3 || visited[start]) continue;
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    compBuf[tail++] = start;
    let touchesEdge = false;
    let touchesOutsideMask = false;

    while (head < tail) {
      const curr = compBuf[head++]!;
      const cx = curr % w;
      const cy = (curr - cx) / w;
      if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) {
        touchesEdge = true;
      }
      for (let d = 0; d < 4; d++) {
        const nx = cx + dirsX[d]!;
        const ny = cy + dirsY[d]!;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (kind[nIdx] === 0) touchesOutsideMask = true;
        if (kind[nIdx] === 3 && !visited[nIdx]) {
          visited[nIdx] = 1;
          compBuf[tail++] = nIdx;
        }
      }
    }

    if (tail <= maxGapAreaPx && (!touchesEdge || allowEdge) && !touchesOutsideMask) {
      let hasAdjacentColor = false;
      for (let i = 0; i < tail; i++) {
        const pxIdx = compBuf[i]!;
        const cx = pxIdx % w;
        const cy = (pxIdx - cx) / w;
        for (let d = 0; d < 4; d++) {
          const nx = cx + dirsX[d]!;
          const ny = cy + dirsY[d]!;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && kind[ny * w + nx] === 2) {
            hasAdjacentColor = true;
            break;
          }
        }
        if (hasAdjacentColor) break;
      }
      if (hasAdjacentColor) {
        filledIslandCount++;
        for (let i = 0; i < tail; i++) {
          eligibleGap[compBuf[i]!] = 1;
        }
      }
    }
  }

  if (filledIslandCount === 0) {
    return {
      imageData: { data: outData, width: w, height: h },
      filledMask,
      filledIslandCount: 0,
      filledPixelCount: 0,
    };
  }

  // 2단계: 유효 틈새 섬에 인접한 모든 평탄 채색 픽셀(2)을 시드로 다중 소스 BFS(이산 보로노이) 실행
  const bfsQueue = new Int32Array(total);
  const seedOrigin = new Int32Array(total).fill(-1);
  let qHead = 0;
  let qTail = 0;

  for (let idx = 0; idx < total; idx++) {
    if (!eligibleGap[idx]) continue;
    const cx = idx % w;
    const cy = (idx - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirsX[d]!;
      const ny = cy + dirsY[d]!;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (kind[nIdx] === 2) {
        seedOrigin[idx] = nIdx;
        bfsQueue[qTail++] = idx;
        break;
      }
    }
  }

  let filledPixelCount = 0;
  while (qHead < qTail) {
    const curr = bfsQueue[qHead++]!;
    const src = seedOrigin[curr]!;
    const srcOff = src * 4;
    const dstOff = curr * 4;
    outData[dstOff] = target.data[srcOff]!;
    outData[dstOff + 1] = target.data[srcOff + 1]!;
    outData[dstOff + 2] = target.data[srcOff + 2]!;
    outData[dstOff + 3] = target.data[srcOff + 3]!;
    filledMask[curr] = 255;
    filledPixelCount++;

    const cx = curr % w;
    const cy = (curr - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirsX[d]!;
      const ny = cy + dirsY[d]!;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      // kind === 1(선화)은 eligibleGap 이 절대 1이 될 수 없으므로 선화를 결코 넘지 못한다.
      if (eligibleGap[nIdx] && seedOrigin[nIdx] === -1) {
        seedOrigin[nIdx] = src;
        bfsQueue[qTail++] = nIdx;
      }
    }
  }

  return {
    imageData: { data: outData, width: w, height: h },
    filledMask,
    filledIslandCount,
    filledPixelCount,
  };
}

/**
 * 올가미 둘러싸기 기반 `덜 칠한 부분 채우기(var 477)` 편의 함수.
 */
export function applyLassoFillLeftover(
  target: LeftoverRgbaImageLike,
  polygon: readonly LeftoverPoint2D[],
  options?: FillLeftoverOptions,
): FillLeftoverResult {
  const regionMask = rasterizeLassoRegionMask(target.width, target.height, polygon);
  return fillLeftoverGaps({ ...options, target, regionMask });
}

/**
 * 브러시 문지르기 기반 `덜 칠한 부분 칠하기 펜(var 149)` 편의 함수.
 */
export function applyLeftoverPenStroke(
  target: LeftoverRgbaImageLike,
  strokePoints: readonly LeftoverPoint2D[],
  brushRadiusPx: number,
  options?: FillLeftoverOptions,
): FillLeftoverResult {
  const regionMask = rasterizeBrushStrokeMask(target.width, target.height, strokePoints, brushRadiusPx);
  return fillLeftoverGaps({ ...options, target, regionMask });
}
