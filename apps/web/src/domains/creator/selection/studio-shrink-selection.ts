/**
 * Studio Shrink Selection — CSP `축소 선택(Shrink selection, var 151)` 및
 * `참조 레이어 틈 닫기 자동 선택(Reference-Layer Gap-Closing Auto Select, vars 22/23/459)` 순수 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 바깥 올가미 다각형 테두리에서 안쪽으로 배경/투명 픽셀을 따라 범람(inward flood)하여,
 * 끊어진 선화 틈(`closeGapRadius`)을 넘지 않고 닫힌 피사체 외곽에 밀착된 선택 마스크를 생성하며
 * 내부 구멍(interior holes)을 보존한다.
 */

export interface ShrinkRgbaImageLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface ShrinkPoint2D {
  readonly x: number;
  readonly y: number;
}

export type ShrinkTargetBackgroundMode =
  | "transparent"
  | "surrounding-color"
  | "transparent-or-surrounding";

export interface ShrinkSelectionOptions {
  /** 배경색 일치 허용 오차(0..255 채널 최대 편차). 기본 24. */
  readonly colorTolerance?: number;
  /** 투명으로 간주할 최대 알파(0..255). 기본 16. */
  readonly alphaThreshold?: number;
  /** 끊어진 선화 틈을 막을 모폴로지 클로징 반경(px, 0..16). 기본 2. */
  readonly closeGapRadius?: number;
  /** 바깥에서 잠식해 들어갈 배경 판정 방식. 기본 "transparent-or-surrounding". */
  readonly targetMode?: ShrinkTargetBackgroundMode;
  /** 내부 구멍 다각형 목록(이 영역에서도 피사체 안쪽 벽까지 범람해 구멍 윤곽을 밀착 보존). */
  readonly holePolygons?: readonly (readonly ShrinkPoint2D[])[];
  /** 도넛 형태 불투명 피사체 내부의 닫힌 투명 구멍을 자동으로 뚫어 보존할지 여부. 기본 false(선화 내부 보존). */
  readonly cutoutTransparentInteriorHoles?: boolean;
  /** `cutoutTransparentInteriorHoles` 사용 시 구멍으로 인정할 최소 면적(px²). 기본 9. */
  readonly minInteriorHoleAreaPx?: number;
}

export interface ShrinkSelectionMaskResult {
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly selectedPixelCount: number;
  readonly holeCount: number;
}

export interface ReferenceAutoSelectOptions {
  /** 시드 픽셀과의 색 허용 오차(0..255). 기본 32. */
  readonly colorTolerance?: number;
  /** 선화 틈 닫기 반경(px, 0..16). 기본 2. */
  readonly closeGapRadius?: number;
  /** 선택 완료 후 경계 확장량(px, 0..16). 기본 0. */
  readonly expandPx?: number;
  /** 불투명 선화 장벽으로 판정할 최소 알파(0..255). 기본 96. */
  readonly obstacleMinAlpha?: number;
  /** 다중 참조 레이어 합성 입력(선화+보조 참조 레이어). */
  readonly additionalReferenceImages?: readonly ShrinkRgbaImageLike[];
}

export interface ReferenceAutoSelectResult {
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly selectedPixelCount: number;
  readonly interiorHoleCount: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  const iv = Math.round(v);
  return iv < lo ? lo : iv > hi ? hi : iv;
}

function rasterizePolygon(
  width: number,
  height: number,
  polygon: readonly ShrinkPoint2D[],
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (width <= 0 || height <= 0 || polygon.length < 3) return mask;
  const xs: number[] = [];
  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!;
      const b = polygon[j]!;
      if ((a.y > py) !== (b.y > py)) {
        xs.push(b.x + ((py - b.y) * (a.x - b.x)) / (a.y - b.y));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = clampInt(Math.ceil(xs[k]! - 0.5), 0, width);
      const x1 = clampInt(Math.ceil(xs[k + 1]! - 0.5), 0, width);
      const row = y * width;
      for (let x = x0; x < x1; x++) mask[row + x] = 255;
    }
  }
  return mask;
}

/**
 * 전경 장애물 마스크(`obstacle > 0`)에 체비쇼프 반경 `r` 모폴로지 클로징(팽창 → 침식)을 적용해
 * 최대 `2 * r` 폭의 끊어진 선화 틈을 봉합한다. 패딩된 격자에서 수행해 캔버스 가장자리 왜곡을 막는다.
 */
function closeObstacleGaps(
  obstacle: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const r = Math.max(0, Math.min(16, Math.floor(radius)));
  if (r === 0) return obstacle.slice();

  const pw = width + 2 * r;
  const ph = height + 2 * r;
  const buf = new Uint8Array(pw * ph);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[(y + r) * pw + (x + r)] = obstacle[y * width + x]!;
    }
  }

  // r회 8-방향 팽창
  for (let step = 0; step < r; step++) {
    const prev = buf.slice();
    for (let y = 1; y < ph - 1; y++) {
      for (let x = 1; x < pw - 1; x++) {
        const idx = y * pw + x;
        if (prev[idx] > 0) continue;
        if (
          prev[idx - 1] > 0 ||
          prev[idx + 1] > 0 ||
          prev[idx - pw] > 0 ||
          prev[idx + pw] > 0 ||
          prev[idx - pw - 1] > 0 ||
          prev[idx - pw + 1] > 0 ||
          prev[idx + pw - 1] > 0 ||
          prev[idx + pw + 1] > 0
        ) {
          buf[idx] = 255;
        }
      }
    }
  }

  // r회 8-방향 침식
  for (let step = 0; step < r; step++) {
    const prev = buf.slice();
    for (let y = 1; y < ph - 1; y++) {
      for (let x = 1; x < pw - 1; x++) {
        const idx = y * pw + x;
        if (prev[idx] === 0) continue;
        if (
          prev[idx - 1] === 0 ||
          prev[idx + 1] === 0 ||
          prev[idx - pw] === 0 ||
          prev[idx + pw] === 0 ||
          prev[idx - pw - 1] === 0 ||
          prev[idx - pw + 1] === 0 ||
          prev[idx + pw - 1] === 0 ||
          prev[idx + pw + 1] === 0
        ) {
          buf[idx] = 0;
        }
      }
    }
  }

  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      out[idx] = obstacle[idx]! > 0 || buf[(y + r) * pw + (x + r)]! > 0 ? 255 : 0;
    }
  }
  return out;
}

function countInteriorHoles(mask: Uint8Array, width: number, height: number): number {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const dirsX = [1, -1, 0, 0] as const;
  const dirsY = [0, 0, 1, -1] as const;
  let holes = 0;

  for (let start = 0; start < total; start++) {
    if (mask[start]! > 0 || visited[start]) continue;
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    let touchesCanvasBorder = false;

    while (head < tail) {
      const curr = queue[head++]!;
      const cx = curr % width;
      const cy = (curr - cx) / width;
      if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) {
        touchesCanvasBorder = true;
      }
      for (let d = 0; d < 4; d++) {
        const nx = cx + dirsX[d]!;
        const ny = cy + dirsY[d]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (mask[nIdx] === 0 && !visited[nIdx]) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }
    if (!touchesCanvasBorder) holes++;
  }
  return holes;
}

/**
 * CSP `축소 선택(Shrink selection, var 151)`:
 * 올가미 외곽(및 선택적 내부 구멍 루프)에서 안쪽으로 배경 픽셀을 범람 제거해 피사체에 밀착된 선택을 구한다.
 */
export function computeShrinkSelectionMask(
  image: ShrinkRgbaImageLike,
  outerPolygon: readonly ShrinkPoint2D[],
  options?: ShrinkSelectionOptions,
): ShrinkSelectionMaskResult {
  const w = Math.max(0, Math.floor(image.width));
  const h = Math.max(0, Math.floor(image.height));
  const total = w * h;
  if (w === 0 || h === 0 || image.data.length < total * 4 || outerPolygon.length < 3) {
    return { mask: new Uint8Array(total), width: w, height: h, selectedPixelCount: 0, holeCount: 0 };
  }

  const colorTol = Math.max(0, Math.min(255, options?.colorTolerance ?? 24));
  const alphaThreshold = Math.max(0, Math.min(255, options?.alphaThreshold ?? 16));
  const closeGapRadius = Math.max(0, Math.min(16, Math.floor(options?.closeGapRadius ?? 2)));
  const targetMode = options?.targetMode ?? "transparent-or-surrounding";

  const lassoMask = rasterizePolygon(w, h, outerPolygon);
  const holeSeedsMask = new Uint8Array(total);
  for (const holePoly of options?.holePolygons ?? []) {
    const hm = rasterizePolygon(w, h, holePoly);
    for (let i = 0; i < total; i++) {
      if (hm[i]! > 0 && lassoMask[i]! > 0) {
        lassoMask[i] = 0;
        holeSeedsMask[i] = 255;
      }
    }
  }

  // 올가미 테두리 픽셀 추출 및 대표 배경색 샘플링
  const boundaryIndices: number[] = [];
  let bgSumR = 0;
  let bgSumG = 0;
  let bgSumB = 0;
  let bgOpaqueCount = 0;
  const dirsX = [1, -1, 0, 0] as const;
  const dirsY = [0, 0, 1, -1] as const;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (lassoMask[idx] === 0) continue;
      let onBorder = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      for (let d = 0; d < 4 && !onBorder; d++) {
        const nx = x + dirsX[d]!;
        const ny = y + dirsY[d]!;
        if (lassoMask[ny * w + nx] === 0) onBorder = true;
      }
      if (onBorder) {
        boundaryIndices.push(idx);
        const off = idx * 4;
        if (image.data[off + 3]! > alphaThreshold) {
          bgSumR += image.data[off]!;
          bgSumG += image.data[off + 1]!;
          bgSumB += image.data[off + 2]!;
          bgOpaqueCount++;
        }
      }
    }
  }

  const refBgR = bgOpaqueCount > 0 ? bgSumR / bgOpaqueCount : 255;
  const refBgG = bgOpaqueCount > 0 ? bgSumG / bgOpaqueCount : 255;
  const refBgB = bgOpaqueCount > 0 ? bgSumB / bgOpaqueCount : 255;

  const isBackgroundAt = (idx: number): boolean => {
    const off = idx * 4;
    const a = image.data[off + 3]!;
    const isTrans = a <= alphaThreshold;
    if (targetMode === "transparent") return isTrans;
    const matchesBgColor =
      bgOpaqueCount > 0 &&
      Math.max(
        Math.abs(image.data[off]! - refBgR),
        Math.abs(image.data[off + 1]! - refBgG),
        Math.abs(image.data[off + 2]! - refBgB),
      ) <= colorTol;
    if (targetMode === "surrounding-color") return isTrans || matchesBgColor;
    return isTrans || matchesBgColor;
  };

  const rawObstacle = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    rawObstacle[i] = isBackgroundAt(i) ? 0 : 255;
  }
  const closedObstacle = closeObstacleGaps(rawObstacle, w, h, closeGapRadius);

  // 올가미 외곽 테두리(및 내부 구멍 경계)의 배경 픽셀에서 안쪽으로 범람
  const floodedExterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (const bIdx of boundaryIndices) {
    if (closedObstacle[bIdx] === 0 && !floodedExterior[bIdx]) {
      floodedExterior[bIdx] = 255;
      queue[tail++] = bIdx;
    }
  }
  // holePolygons 바로 바깥 인접 배경 픽셀도 시드에 추가해 내부 구멍 윤곽까지 수축 밀착
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (holeSeedsMask[idx] === 0) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + dirsX[d]!;
        const ny = y + dirsY[d]!;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (lassoMask[nIdx] > 0 && closedObstacle[nIdx] === 0 && !floodedExterior[nIdx]) {
          floodedExterior[nIdx] = 255;
          queue[tail++] = nIdx;
        }
      }
    }
  }

  while (head < tail) {
    const curr = queue[head++]!;
    const cx = curr % w;
    const cy = (curr - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirsX[d]!;
      const ny = cy + dirsY[d]!;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (lassoMask[nIdx] > 0 && closedObstacle[nIdx] === 0 && !floodedExterior[nIdx]) {
        floodedExterior[nIdx] = 255;
        queue[tail++] = nIdx;
      }
    }
  }

  const outMask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (lassoMask[i]! > 0 && floodedExterior[i] === 0) {
      outMask[i] = 255;
    }
  }

  // 도넛형 채색 오브젝트 내부 투명 구멍 자동 절개 옵션
  if (options?.cutoutTransparentInteriorHoles) {
    const minArea = Math.max(1, Math.floor(options.minInteriorHoleAreaPx ?? 9));
    const seen = new Uint8Array(total);
    const comp = new Int32Array(total);
    for (let s = 0; s < total; s++) {
      if (outMask[s] === 0 || rawObstacle[s]! > 0 || seen[s]) continue;
      let cHead = 0;
      let cTail = 0;
      seen[s] = 1;
      comp[cTail++] = s;
      while (cHead < cTail) {
        const curr = comp[cHead++]!;
        const cx = curr % w;
        const cy = (curr - cx) / w;
        for (let d = 0; d < 4; d++) {
          const nx = cx + dirsX[d]!;
          const ny = cy + dirsY[d]!;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (outMask[nIdx]! > 0 && rawObstacle[nIdx] === 0 && !seen[nIdx]) {
            seen[nIdx] = 1;
            comp[cTail++] = nIdx;
          }
        }
      }
      if (cTail >= minArea) {
        for (let k = 0; k < cTail; k++) outMask[comp[k]!] = 0;
      }
    }
  }

  // closeGapRadius 팽창 브리지 픽셀 중 실제 전경이 아닌 바깥 잔여 브리지 정리
  for (let i = 0; i < total; i++) {
    if (outMask[i]! > 0 && rawObstacle[i] === 0 && closedObstacle[i]! > 0) {
      // 사방 중 외부 범람(floodedExterior)과 맞닿은 가교 픽셀은 선택 외곽에서 제외해 매끈한 윤곽 유지
      const cx = i % w;
      const cy = (i - cx) / w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + dirsX[d]!;
        const ny = cy + dirsY[d]!;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && floodedExterior[ny * w + nx]! > 0) {
          outMask[i] = 0;
          break;
        }
      }
    }
  }

  let selectedPixelCount = 0;
  for (let i = 0; i < total; i++) {
    if (outMask[i]! > 0) selectedPixelCount++;
  }
  const holeCount = countInteriorHoles(outMask, w, h);

  return {
    mask: outMask,
    width: w,
    height: h,
    selectedPixelCount,
    holeCount,
  };
}

/**
 * CSP `참조 레이어 전용 / 다중 참조 자동 선택(vars 22/23/459)`:
 * 시드 지점에서 출발해 `closeGapRadius`로 끊어진 선화 틈을 닫은 참조 경계 안쪽만 선택하며,
 * 선택 영역 내부의 닫힌 섬(내부 구멍)은 선택에서 제외해 보존한다.
 */
export function computeReferenceAutoSelectMask(
  referenceImage: ShrinkRgbaImageLike,
  seed: ShrinkPoint2D,
  options?: ReferenceAutoSelectOptions,
): ReferenceAutoSelectResult {
  const w = Math.max(0, Math.floor(referenceImage.width));
  const h = Math.max(0, Math.floor(referenceImage.height));
  const total = w * h;
  const sx = Math.floor(seed.x);
  const sy = Math.floor(seed.y);
  if (w === 0 || h === 0 || sx < 0 || sx >= w || sy < 0 || sy >= h || referenceImage.data.length < total * 4) {
    return { mask: new Uint8Array(total), width: w, height: h, selectedPixelCount: 0, interiorHoleCount: 0 };
  }

  const tol = Math.max(0, Math.min(255, options?.colorTolerance ?? 32));
  const closeGapRadius = Math.max(0, Math.min(16, Math.floor(options?.closeGapRadius ?? 2)));
  const expandPx = Math.max(0, Math.min(16, Math.floor(options?.expandPx ?? 0)));
  const obstacleMinAlpha = Math.max(1, Math.min(255, options?.obstacleMinAlpha ?? 96));

  const extraRefs = (options?.additionalReferenceImages ?? []).filter(
    (img) => img.width === w && img.height === h && img.data.length >= total * 4,
  );

  const seedIdx = sy * w + sx;
  const sOff = seedIdx * 4;
  const sr = referenceImage.data[sOff]!;
  const sg = referenceImage.data[sOff + 1]!;
  const sb = referenceImage.data[sOff + 2]!;
  const sa = referenceImage.data[sOff + 3]!;

  const obstacle = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const da = Math.abs(referenceImage.data[off + 3]! - sa);
    const dr = Math.abs(referenceImage.data[off]! - sr);
    const dg = Math.abs(referenceImage.data[off + 1]! - sg);
    const db = Math.abs(referenceImage.data[off + 2]! - sb);
    const diffPrimary = sa <= 16 && referenceImage.data[off + 3]! <= 16
      ? 0
      : Math.max(dr, dg, db, da);
    if (diffPrimary > tol) {
      obstacle[i] = 255;
      continue;
    }
    for (const extra of extraRefs) {
      if (extra.data[off + 3]! >= obstacleMinAlpha) {
        obstacle[i] = 255;
        break;
      }
    }
  }

  if (obstacle[seedIdx]! > 0) {
    return { mask: new Uint8Array(total), width: w, height: h, selectedPixelCount: 0, interiorHoleCount: 0 };
  }

  const closedObstacle = closeObstacleGaps(obstacle, w, h, closeGapRadius);
  // 갭 클로징으로 시드 자체가 막혔다면 원본 장애물 기준으로 폴백
  const activeBarrier = closedObstacle[seedIdx]! > 0 ? obstacle : closedObstacle;

  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  mask[seedIdx] = 255;
  queue[tail++] = seedIdx;

  const dirsX = [1, -1, 0, 0] as const;
  const dirsY = [0, 0, 1, -1] as const;
  while (head < tail) {
    const curr = queue[head++]!;
    const cx = curr % w;
    const cy = (curr - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirsX[d]!;
      const ny = cy + dirsY[d]!;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (mask[nIdx] === 0 && activeBarrier[nIdx] === 0) {
        mask[nIdx] = 255;
        queue[tail++] = nIdx;
      }
    }
  }

  // expandPx 확장 시 원본 장애물(선화 안티에일리어싱 가장자리)로만 제한적으로 넓히고 내부 구멍은 유지
  let finalMask: Uint8Array = mask;
  for (let step = 0; step < expandPx; step++) {
    const next = finalMask.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (finalMask[idx]! > 0) continue;
        for (let d = 0; d < 4; d++) {
          const nx = x + dirsX[d]!;
          const ny = y + dirsY[d]!;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && finalMask[ny * w + nx]! > 0) {
            next[idx] = 255;
            break;
          }
        }
      }
    }
    finalMask = next;
  }

  let selectedPixelCount = 0;
  for (let i = 0; i < total; i++) {
    if (finalMask[i]! > 0) selectedPixelCount++;
  }
  const interiorHoleCount = countInteriorHoles(finalMask, w, h);

  return {
    mask: finalMask,
    width: w,
    height: h,
    selectedPixelCount,
    interiorHoleCount,
  };
}

/**
 * 선택 도구 패널에서 현재 정규화(0..1) 올가미 경로와 선택한 배경 판정·선 틈 닫기 반경으로
 * `computeShrinkSelectionMask` 및 `computeReferenceAutoSelectMask`를 실제 실행해 진단 요약을 반환한다.
 */
export function evaluateShrinkAndReferenceSelectionSummary(options: {
  readonly normalizedOuterPoints?: readonly ShrinkPoint2D[];
  readonly targetMode: ShrinkTargetBackgroundMode;
  readonly closeGapRadius: number;
}): {
  readonly shrunkSelectedPx: number;
  readonly referenceSelectedPx: number;
  readonly preservedHoles: number;
} {
  const size = 20;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let t = 5; t <= 14; t++) {
    if (t !== 9) {
      const top = (5 * size + t) * 4;
      data[top] = 16; data[top + 1] = 16; data[top + 2] = 16; data[top + 3] = 255;
    }
    const bot = (14 * size + t) * 4;
    const lft = (t * size + 5) * 4;
    const rgt = (t * size + 14) * 4;
    data[bot] = 16; data[bot + 1] = 16; data[bot + 2] = 16; data[bot + 3] = 255;
    data[lft] = 16; data[lft + 1] = 16; data[lft + 2] = 16; data[lft + 3] = 255;
    data[rgt] = 16; data[rgt + 1] = 16; data[rgt + 2] = 16; data[rgt + 3] = 255;
  }
  const holeOff = (10 * size + 10) * 4;
  data[holeOff] = 16; data[holeOff + 1] = 16; data[holeOff + 2] = 16; data[holeOff + 3] = 255;

  const poly = options.normalizedOuterPoints && options.normalizedOuterPoints.length >= 3
    ? options.normalizedOuterPoints.map((p) => ({ x: p.x * size, y: p.y * size }))
    : [{ x: 1, y: 1 }, { x: 18, y: 1 }, { x: 18, y: 18 }, { x: 1, y: 18 }];
  const plate = { data, width: size, height: size };
  const shrunk = computeShrinkSelectionMask(plate, poly, {
    targetMode: options.targetMode,
    closeGapRadius: options.closeGapRadius,
  });
  const refAuto = computeReferenceAutoSelectMask(plate, { x: 8, y: 8 }, {
    closeGapRadius: options.closeGapRadius,
  });
  return {
    shrunkSelectedPx: shrunk.selectedPixelCount,
    referenceSelectedPx: refAuto.selectedPixelCount,
    preservedHoles: refAuto.interiorHoleCount,
  };
}
