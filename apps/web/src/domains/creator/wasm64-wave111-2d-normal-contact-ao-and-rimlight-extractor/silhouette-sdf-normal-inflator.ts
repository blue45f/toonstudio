/**
 * Wave 111 — 2D 실루엣 팽창 법선장(Normal) 추출기:
 * Meijster O(W×H) 분리형 정확 유클리드 거리 변환(EDT)과
 * 3종 아티스트 베벨 프로파일(soft-organic / cel-bevel / chiseled-hard-surface)
 * 기반 3D 단위 법선장 팽창 엔진.
 */

/** 아티스트가 선택하는 2D 실루엣 팽창 베벨 프로파일. */
export type NormalInflationProfile =
  | "soft-organic"
  | "cel-bevel"
  | "chiseled-hard-surface";

/** Meijster 2D 내부 정확 유클리드 거리 변환 옵션. */
export interface InteriorEdtOptions {
  /**
   * 마스크 내부 판정 임계값.
   * 생략하면 마스크 최댓값이 1 이하일 때 `1`(이진 0/1 마스크),
   * 2 이상일 때 `128`(8비트 알파 마스크)을 자동 적용한다.
   */
  readonly alphaThreshold?: number;
  /**
   * 캔버스 외곽 프레임을 외부 경계로 간주할지 여부(기본값 `false`).
   * 마스크 전체가 내부 픽셀로만 채워진 경우에는 유한 거리 계산을 위해 자동 활성화한다.
   */
  readonly treatFrameBoundaryAsExterior?: boolean;
}

/** Meijster O(W×H) 정확 내부 유클리드 거리 변환 결과. */
export interface ExactMaskInteriorEdtResult {
  readonly width: number;
  readonly height: number;
  /** 이진화된 실루엣 마스크(내부 `1`, 외부 `0`). */
  readonly binaryMask: Uint8Array;
  /** 실제 적용된 알파 임계값. */
  readonly effectiveAlphaThreshold: number;
  /** 입력 마스크가 이진 0/1 형식인지 여부. */
  readonly isBinaryMaskInput: boolean;
  /** 각 픽셀에서 가장 가까운 외부 경계 픽셀까지의 정확 유클리드 거리(px). 외부는 `0`. */
  readonly distanceField: Float32Array;
  readonly interiorPixelCount: number;
  readonly exteriorPixelCount: number;
  readonly maxDistancePx: number;
}

/** 2D 실루엣 법선장 팽창 옵션. */
export interface NormalInflationOptions extends InteriorEdtOptions {
  /** 팽창 베벨 프로파일(기본값 `"soft-organic"`). */
  readonly profile?: NormalInflationProfile;
  /**
   * 베벨/팽창 반경(px).
   * 생략하면 `soft-organic`은 최대 거리, `cel-bevel`은 최대 거리의 65%,
   * `chiseled-hard-surface`는 최대 거리의 50%를 사용한다.
   */
  readonly bevelRadiusPx?: number;
  /** 높이 기울기 강도 배율(기본값 `1.0`, 유효 범위 `[0.1, 4.0]`). */
  readonly elevationStrength?: number;
  /**
   * 높이장 경계 보존 평활화 패스 수(기본값 `0`, 최대 `3`).
   * 대칭 3-탭 `[1, 2, 1]/4` 커널만 사용해 실루엣 대칭성을 유지한다.
   */
  readonly smoothPasses?: number;
}

/** 2D 실루엣 팽창 법선장 결과. */
export interface Inflated2dNormalField {
  readonly width: number;
  readonly height: number;
  readonly profile: NormalInflationProfile;
  readonly effectiveBevelRadiusPx: number;
  readonly elevationStrength: number;
  readonly effectiveAlphaThreshold: number;
  readonly isBinaryMaskInput: boolean;
  /** 원본 입력 마스크 참조 사본(알파 보존 합성용). */
  readonly sourceMask: Uint8Array;
  /** 이진 실루엣 마스크(내부 `1`, 외부 `0`). */
  readonly binaryMask: Uint8Array;
  /** 정확 유클리드 내부 거리장(px). */
  readonly distanceField: Float32Array;
  /** `[0, 1]` 범위 정규화 팽창 높이장(외부는 `0`). */
  readonly heightField: Float32Array;
  /**
   * 인터리브 단위 법선 버퍼(`width * height * 3`: `[nx, ny, nz, ...]`).
   * 화면 좌표계(`+X` 오른쪽, `+Y` 아래쪽, `+Z` 뷰어 방향) 기준이며,
   * 내부 픽셀은 `|n| === 1`, `nz >= 0`, 외부 픽셀은 `(0, 0, 1)`이다.
   */
  readonly normals: Float32Array;
  readonly interiorPixelCount: number;
  readonly exteriorPixelCount: number;
  readonly maxDistancePx: number;
  readonly maxNormalLengthError: number;
  readonly minInteriorNz: number;
}

function assertValidMaskDimensions(
  mask: Uint8Array,
  width: number,
  height: number,
  label: string,
): void {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error(`${label} 크기는 1 이상의 정수여야 합니다 (입력: ${width}x${height}).`);
  }
  const pixelCount = width * height;
  if (mask.length < pixelCount) {
    throw new Error(
      `${label} 버퍼 길이(${mask.length})가 픽셀 수(${pixelCount})보다 작습니다.`,
    );
  }
}

/**
 * 입력 이진/알파 마스크를 `0`/`1` 이진 마스크로 정규화한다.
 * `alphaThreshold`가 생략되면 최댓값 `<= 1` 마스크는 이진(임계 `1`),
 * 그 외는 8비트 알파(임계 `128`)로 판정한다.
 */
export function binarizeSilhouetteMask(
  mask: Uint8Array,
  width: number,
  height: number,
  alphaThreshold?: number,
): {
  readonly binaryMask: Uint8Array;
  readonly effectiveAlphaThreshold: number;
  readonly isBinaryMaskInput: boolean;
  readonly interiorPixelCount: number;
  readonly exteriorPixelCount: number;
} {
  assertValidMaskDimensions(mask, width, height, "실루엣 마스크");
  const pixelCount = width * height;

  let maxRaw = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const v = mask[i] ?? 0;
    if (v > maxRaw) maxRaw = v;
  }

  const isBinaryMaskInput = maxRaw <= 1;
  const effectiveAlphaThreshold =
    alphaThreshold !== undefined && Number.isFinite(alphaThreshold)
      ? Math.max(1, Math.min(255, Math.round(alphaThreshold)))
      : isBinaryMaskInput
        ? 1
        : 128;

  const binaryMask = new Uint8Array(pixelCount);
  let interiorPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const raw = mask[i] ?? 0;
    if (raw >= effectiveAlphaThreshold) {
      binaryMask[i] = 1;
      interiorPixelCount += 1;
    }
  }

  return {
    binaryMask,
    effectiveAlphaThreshold,
    isBinaryMaskInput,
    interiorPixelCount,
    exteriorPixelCount: pixelCount - interiorPixelCount,
  };
}

/**
 * Meijster(2000) 2-패스 분리형 정확 유클리드 거리 변환(EDT)을 O(W×H) 시간에 계산한다.
 *
 * 각 내부 픽셀 `(x, y)`에서 가장 가까운 외부 픽셀(`binaryMask === 0`)까지의
 * 정확한 유클리드 거리 `sqrt((x - x0)^2 + (y - y0)^2)`를 반환한다.
 * 외부 픽셀의 거리는 항상 `0`이다.
 */
export function computeExactMaskInteriorEdt(
  mask: Uint8Array,
  width: number,
  height: number,
  options?: InteriorEdtOptions,
): ExactMaskInteriorEdtResult {
  const {
    binaryMask,
    effectiveAlphaThreshold,
    isBinaryMaskInput,
    interiorPixelCount,
    exteriorPixelCount,
  } = binarizeSilhouetteMask(mask, width, height, options?.alphaThreshold);

  const pixelCount = width * height;
  const distanceField = new Float32Array(pixelCount);

  if (interiorPixelCount === 0) {
    return {
      width,
      height,
      binaryMask,
      effectiveAlphaThreshold,
      isBinaryMaskInput,
      distanceField,
      interiorPixelCount: 0,
      exteriorPixelCount: pixelCount,
      maxDistancePx: 0,
    };
  }

  // 전체 캔버스가 1로 채워진 경우 프레임 외곽을 외부 경계로 취급해 유한 거리를 보장한다.
  const borderAsExterior =
    options?.treatFrameBoundaryAsExterior === true || exteriorPixelCount === 0;

  // INF > W + H 이므로 INF^2 > W^2 + H^2가 항상 성립한다.
  const inf = width + height + 1;
  const g = new Int32Array(pixelCount);

  // 1단계: 열(Column) 방향 1D 맨해튼 거리 스캔
  for (let x = 0; x < width; x += 1) {
    g[x] = binaryMask[x] === 0 ? 0 : borderAsExterior ? 1 : inf;
    for (let y = 1; y < height; y += 1) {
      const idx = y * width + x;
      if (binaryMask[idx] === 0) {
        g[idx] = 0;
      } else {
        const prev = g[idx - width] ?? inf;
        g[idx] = prev >= inf ? inf : prev + 1;
      }
    }

    const lastIdx = (height - 1) * width + x;
    if (borderAsExterior && binaryMask[lastIdx] !== 0) {
      g[lastIdx] = Math.min(g[lastIdx] ?? inf, 1);
    }
    for (let y = height - 2; y >= 0; y -= 1) {
      const idx = y * width + x;
      const below = g[idx + width] ?? inf;
      if (below + 1 < (g[idx] ?? inf)) {
        g[idx] = below + 1;
      }
    }
  }

  // 2단계: 행(Row) 방향 Meijster 포물선 하한 포락선(Lower Envelope) 스캔
  // borderAsExterior가 켜져 있으면 가상 외곽 열 x=-1, x=width (g=0)를 함께 평가한다.
  const maxStackLen = width + 2;
  const s = new Int32Array(maxStackLen);
  const t = new Int32Array(maxStackLen);

  let maxDistancePx = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let q = -1;

    const evalG = (col: number): number => {
      if (col < 0 || col >= width) return 0;
      return g[rowOffset + col] ?? inf;
    };

    const evalParabola = (xPos: number, col: number): number => {
      const dx = xPos - col;
      const gy = evalG(col);
      return dx * dx + gy * gy;
    };

    // f_i(x) <= f_u(x)를 만족하는 최대 정수 x (i < u)
    const sep = (i: number, u: number): number => {
      const gi = evalG(i);
      const gu = evalG(u);
      const num = u * u - i * i + gu * gu - gi * gi;
      const den = 2 * (u - i);
      return Math.floor(num / den);
    };

    const uStart = borderAsExterior ? -1 : 0;
    const uEnd = borderAsExterior ? width : width - 1;

    for (let u = uStart; u <= uEnd; u += 1) {
      if (u >= 0 && u < width && (g[rowOffset + u] ?? inf) >= inf) {
        continue;
      }
      while (q >= 0 && evalParabola(t[q] ?? 0, s[q] ?? 0) > evalParabola(t[q] ?? 0, u)) {
        q -= 1;
      }
      if (q < 0) {
        q = 0;
        s[0] = u;
        t[0] = 0;
      } else {
        const w = 1 + sep(s[q] ?? 0, u);
        if (w < width) {
          q += 1;
          s[q] = u;
          t[q] = Math.max(0, w);
        }
      }
    }

    for (let x = width - 1; x >= 0; x -= 1) {
      const idx = rowOffset + x;
      if (binaryMask[idx] === 0) {
        distanceField[idx] = 0;
        continue;
      }
      while (q > 0 && x < (t[q] ?? 0)) {
        q -= 1;
      }
      const bestCol = s[q] ?? x;
      const distSq = evalParabola(x, bestCol);
      const dist = Math.sqrt(Math.max(0, distSq));
      distanceField[idx] = dist;
      if (dist > maxDistancePx) {
        maxDistancePx = dist;
      }
    }
  }

  return {
    width,
    height,
    binaryMask,
    effectiveAlphaThreshold,
    isBinaryMaskInput,
    distanceField,
    interiorPixelCount,
    exteriorPixelCount,
    maxDistancePx,
  };
}

/**
 * 정규화 거리 `u = clamp(d / R, 0, 1)`에 대한 베벨 프로파일 높이 `phi(u) in [0, 1]`를 평가한다.
 *
 * - `soft-organic`: 반구형 팽창 `sqrt(1 - (1 - u)^2)` (피부·머리카락·의복)
 * - `cel-bevel`: 경계에서 가파르게 꺾이고 중앙 평탄면으로 부드럽게 이어지는 챔퍼 `1 - (1 - u)^2`
 * - `chiseled-hard-surface`: 직선 경사면 후 평탄면으로 전환되는 하드 베벨 `u` (갑옷·칼날·건축)
 */
export function evaluateBevelProfileHeight(
  normalizedDistance: number,
  profile: NormalInflationProfile,
): number {
  const u = Math.max(0, Math.min(1, Number.isFinite(normalizedDistance) ? normalizedDistance : 0));
  if (u <= 0) return 0;
  if (u >= 1) return 1;

  if (profile === "soft-organic") {
    const oneMinusU = 1 - u;
    return Math.sqrt(Math.max(0, 1 - oneMinusU * oneMinusU));
  }
  if (profile === "cel-bevel") {
    const oneMinusU = 1 - u;
    return 1 - oneMinusU * oneMinusU;
  }
  return u;
}

function defaultBevelRadiusPx(
  maxDistancePx: number,
  profile: NormalInflationProfile,
): number {
  const safeMax = Math.max(1, maxDistancePx);
  if (profile === "soft-organic") {
    return safeMax;
  }
  if (profile === "cel-bevel") {
    return Math.max(2, safeMax * 0.65);
  }
  return Math.max(2, safeMax * 0.5);
}

/**
 * 대칭 `[1, 2, 1] / 4` 분리형 경계 보존 평활화를 수행한다.
 * 외부 픽셀은 항상 `0`으로 유지되므로 실루엣 대칭성과 경계 선명도가 보존된다.
 */
function applySymmetricMaskedHeightSmoothing(
  src: Float32Array,
  binaryMask: Uint8Array,
  width: number,
  height: number,
  passes: number,
): Float32Array {
  if (passes <= 0) return src;
  const pixelCount = width * height;
  let current = new Float32Array(src);
  const temp = new Float32Array(pixelCount);

  for (let p = 0; p < passes; p += 1) {
    // 가로 패스
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = rowOffset + x;
        if (binaryMask[idx] === 0) {
          temp[idx] = 0;
          continue;
        }
        const left = x > 0 ? (current[idx - 1] ?? 0) : 0;
        const center = current[idx] ?? 0;
        const right = x + 1 < width ? (current[idx + 1] ?? 0) : 0;
        temp[idx] = (left + 2 * center + right) * 0.25;
      }
    }
    // 세로 패스
    const next = new Float32Array(pixelCount);
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = rowOffset + x;
        if (binaryMask[idx] === 0) {
          next[idx] = 0;
          continue;
        }
        const up = y > 0 ? (temp[idx - width] ?? 0) : 0;
        const center = temp[idx] ?? 0;
        const down = y + 1 < height ? (temp[idx + width] ?? 0) : 0;
        next[idx] = (up + 2 * center + down) * 0.25;
      }
    }
    current = next;
  }

  return current;
}

/**
 * 2D 실루엣 마스크에서 Meijster 정확 EDT 높이장을 구축하고
 * 3×3 Sobel 기울기로 정규화된 3D 단위 표면 법선장 `(nx, ny, nz)`을 추출한다.
 *
 * 대칭 원형 마스크에서:
 * - 왼쪽 가장자리 `nx < 0`, 오른쪽 가장자리 `nx > 0`
 * - 위쪽 가장자리 `ny < 0`, 아래쪽 가장자리 `ny > 0`
 * - 중앙 픽셀 `(0, 0, 1)`
 * - 마스크 외곽 픽셀은 항상 중립 `(0, 0, 1)`
 */
export function computeInflated2dNormalField(
  mask: Uint8Array,
  width: number,
  height: number,
  options?: NormalInflationOptions,
): Inflated2dNormalField {
  const profile: NormalInflationProfile = options?.profile ?? "soft-organic";
  const elevationStrength = Math.max(
    0.1,
    Math.min(4.0, Number.isFinite(options?.elevationStrength) ? (options?.elevationStrength ?? 1.0) : 1.0),
  );
  const smoothPasses = Math.max(
    0,
    Math.min(3, Math.floor(Number.isFinite(options?.smoothPasses) ? (options?.smoothPasses ?? 0) : 0)),
  );

  const edt = computeExactMaskInteriorEdt(mask, width, height, options);
  const pixelCount = width * height;
  const sourceMask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    sourceMask[i] = mask[i] ?? 0;
  }

  const effectiveBevelRadiusPx =
    options?.bevelRadiusPx !== undefined &&
    Number.isFinite(options.bevelRadiusPx) &&
    options.bevelRadiusPx > 0
      ? Math.max(1, options.bevelRadiusPx)
      : defaultBevelRadiusPx(edt.maxDistancePx, profile);

  const heightField = new Float32Array(pixelCount);
  const metricHeight = new Float32Array(pixelCount);
  const heightAmplitude = effectiveBevelRadiusPx * elevationStrength;

  for (let i = 0; i < pixelCount; i += 1) {
    if (edt.binaryMask[i] === 0) {
      heightField[i] = 0;
      metricHeight[i] = 0;
      continue;
    }
    const dist = edt.distanceField[i] ?? 0;
    const phi = evaluateBevelProfileHeight(dist / effectiveBevelRadiusPx, profile);
    heightField[i] = phi;
    metricHeight[i] = phi * heightAmplitude;
  }

  const smoothedMetricHeight = applySymmetricMaskedHeightSmoothing(
    metricHeight,
    edt.binaryMask,
    width,
    height,
    smoothPasses,
  );

  const normals = new Float32Array(pixelCount * 3);
  let maxNormalLengthError = 0;
  let minInteriorNz = edt.interiorPixelCount > 0 ? 1 : 1;

  const sampleHeight = (sx: number, sy: number): number => {
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
      return 0;
    }
    return smoothedMetricHeight[sy * width + sx] ?? 0;
  };

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      const outIdx = idx * 3;
      if (edt.binaryMask[idx] === 0) {
        normals[outIdx] = 0;
        normals[outIdx + 1] = 0;
        normals[outIdx + 2] = 1;
        continue;
      }

      // 3×3 Sobel 중심 차분: 화면 좌표계(+X 우측, +Y 하단, +Z 전면) 기준 외향 법선 (-dh/dx, -dh/dy, 1)
      const tl = sampleHeight(x - 1, y - 1);
      const tc = sampleHeight(x, y - 1);
      const tr = sampleHeight(x + 1, y - 1);
      const ml = sampleHeight(x - 1, y);
      const mr = sampleHeight(x + 1, y);
      const bl = sampleHeight(x - 1, y + 1);
      const bc = sampleHeight(x, y + 1);
      const br = sampleHeight(x + 1, y + 1);

      const dhdx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * 0.125;
      const dhdy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * 0.125;

      const rawNx = -dhdx;
      const rawNy = -dhdy;
      const len = Math.sqrt(rawNx * rawNx + rawNy * rawNy + 1);
      const invLen = len > 0 && Number.isFinite(len) ? 1 / len : 1;

      const nx = rawNx * invLen;
      const ny = rawNy * invLen;
      const nz = Math.max(0, invLen);

      normals[outIdx] = Object.is(nx, -0) ? 0 : nx;
      normals[outIdx + 1] = Object.is(ny, -0) ? 0 : ny;
      normals[outIdx + 2] = nz;

      const storedNx = normals[outIdx] ?? 0;
      const storedNy = normals[outIdx + 1] ?? 0;
      const storedNz = normals[outIdx + 2] ?? 1;
      const lengthErr = Math.abs(
        Math.sqrt(storedNx * storedNx + storedNy * storedNy + storedNz * storedNz) - 1,
      );
      if (lengthErr > maxNormalLengthError) {
        maxNormalLengthError = lengthErr;
      }
      if (storedNz < minInteriorNz) {
        minInteriorNz = storedNz;
      }
    }
  }

  return {
    width,
    height,
    profile,
    effectiveBevelRadiusPx,
    elevationStrength,
    effectiveAlphaThreshold: edt.effectiveAlphaThreshold,
    isBinaryMaskInput: edt.isBinaryMaskInput,
    sourceMask,
    binaryMask: edt.binaryMask,
    distanceField: edt.distanceField,
    heightField,
    normals,
    interiorPixelCount: edt.interiorPixelCount,
    exteriorPixelCount: edt.exteriorPixelCount,
    maxDistancePx: edt.maxDistancePx,
    maxNormalLengthError,
    minInteriorNz,
  };
}

/**
 * 3D 단위 법선장을 표준 탄젠트 공간 8비트 RGBA 노멀맵으로 인코딩한다.
 * 마스크 외곽 픽셀은 완전히 투명한 `(0, 0, 0, 0)`으로 마스킹한다.
 */
export function encodeNormalFieldToRgba(normalField: Inflated2dNormalField): Uint8ClampedArray {
  const pixelCount = normalField.width * normalField.height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i += 1) {
    const out = i * 4;
    if (normalField.binaryMask[i] === 0) {
      rgba[out] = 0;
      rgba[out + 1] = 0;
      rgba[out + 2] = 0;
      rgba[out + 3] = 0;
      continue;
    }
    const nIdx = i * 3;
    const nx = normalField.normals[nIdx] ?? 0;
    const ny = normalField.normals[nIdx + 1] ?? 0;
    const nz = normalField.normals[nIdx + 2] ?? 1;
    const alpha = normalField.isBinaryMaskInput ? 255 : (normalField.sourceMask[i] ?? 255);

    rgba[out] = Math.round(Math.max(0, Math.min(255, (nx * 0.5 + 0.5) * 255)));
    rgba[out + 1] = Math.round(Math.max(0, Math.min(255, (ny * 0.5 + 0.5) * 255)));
    rgba[out + 2] = Math.round(Math.max(0, Math.min(255, (nz * 0.5 + 0.5) * 255)));
    rgba[out + 3] = alpha;
  }

  return rgba;
}
