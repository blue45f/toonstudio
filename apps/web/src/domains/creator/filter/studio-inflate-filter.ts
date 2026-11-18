/**
 * CSP 입체 팽창 필터 (`Filter > Effect > Inflate` / `filteractioninflate`) 엔진.
 *
 * 처리 파이프라인:
 * 1) 알파 실루엣에 대한 2D 유클리드 거리 변환(EDT)
 * 2) 정규화된 반구형 돔(dome) 높이 맵 생성 및 `heightLimit` 상한 클램핑
 * 3) 다중 패스 분리형 박스/가우시안 스무딩으로 평탄 상판 경계 부드럽게 처리
 * 4) 중심 차분(central-difference) 표면 법선 벡터 추출
 * 5) Blinn-Phong 확산광(diffuse) + 정반사 하이라이트(specular) 셰이딩 (`lightX`, `lightY`, `shininess`, `strength`), 알파 무손실 보존
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import type { StudioImageDataLike } from "../studio-filters";

export interface InflateFilterOptions {
  /** 정규화 돔 최대 높이 상한 (0.05..1.0, 1보다 크면 100분율로 해석; 기본 0.75). */
  readonly heightLimit?: number;
  /** 높이 맵 분리형 가우시안/박스 스무딩 반경 (0..16px, 기본 2). */
  readonly smoothingRadius?: number;
  /** 화면 기준 광원 X 방향 (-1..1, 음수=왼쪽, 양수=오른쪽; 기본 -0.45). */
  readonly lightX?: number;
  /** 화면 기준 광원 Y 방향 (-1..1, 음수=위쪽, 양수=아래쪽; 기본 -0.55). */
  readonly lightY?: number;
  /** Blinn-Phong 정반사 지수 (1..256, 기본 36). */
  readonly shininess?: number;
  /** 셰이딩 혼합 강도 (0..1, 1보다 크면 100분율로 해석; 기본 0.75). */
  readonly strength?: number;
  /** 법선 기울기 배율 (0.2..8, 기본 2.6). */
  readonly reliefGain?: number;
}

export const DEFAULT_INFLATE_FILTER_OPTIONS: Required<InflateFilterOptions> =
  Object.freeze({
    heightLimit: 0.75,
    smoothingRadius: 2,
    lightX: -0.45,
    lightY: -0.55,
    shininess: 36,
    strength: 0.75,
    reliefGain: 2.6,
  });

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeUnitOrPercent(value: unknown, min: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const scaled = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(min, scaled));
}

export function normalizeInflateFilterOptions(
  raw?: InflateFilterOptions | null,
): Required<InflateFilterOptions> {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    heightLimit: normalizeUnitOrPercent(
      src.heightLimit,
      0.05,
      DEFAULT_INFLATE_FILTER_OPTIONS.heightLimit,
    ),
    smoothingRadius: Math.round(
      clampRange(src.smoothingRadius, 0, 16, DEFAULT_INFLATE_FILTER_OPTIONS.smoothingRadius),
    ),
    lightX: clampRange(src.lightX, -1, 1, DEFAULT_INFLATE_FILTER_OPTIONS.lightX),
    lightY: clampRange(src.lightY, -1, 1, DEFAULT_INFLATE_FILTER_OPTIONS.lightY),
    shininess: clampRange(src.shininess, 1, 256, DEFAULT_INFLATE_FILTER_OPTIONS.shininess),
    strength: normalizeUnitOrPercent(src.strength, 0, DEFAULT_INFLATE_FILTER_OPTIONS.strength),
    reliefGain: clampRange(src.reliefGain, 0.2, 8, DEFAULT_INFLATE_FILTER_OPTIONS.reliefGain),
  };
}

function edt1d(
  f: Float64Array,
  dt: Float64Array,
  n: number,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q += 1) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k -= 1;
      if (k < 0) {
        k = 0;
        break;
      }
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1]! < q) k += 1;
    const dx = q - v[k]!;
    dt[q] = dx * dx + f[v[k]!]!;
  }
}

/**
 * 알파 실루엣 내부 각 픽셀에서 투명 외부까지의 정확한 유클리드 거리를 계산한다.
 * 이미지 외곽 경계 바깥도 투명으로 취급해 전체 채움 사각형도 둥근 쿠션 돔을 형성하게 한다.
 */
export function computeAlphaSilhouetteDistance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const padW = width + 2;
  const padH = height + 2;
  const grid = new Float64Array(padW * padH);
  const INF = 1e12;

  for (let py = 0; py < padH; py += 1) {
    for (let px = 0; px < padW; px += 1) {
      if (px === 0 || px === padW - 1 || py === 0 || py === padH - 1) {
        grid[py * padW + px] = 0;
        continue;
      }
      const alpha = data[((py - 1) * width + (px - 1)) * 4 + 3]!;
      grid[py * padW + px] = alpha === 0 ? 0 : INF;
    }
  }

  const maxDim = Math.max(padW, padH);
  const f = new Float64Array(maxDim);
  const dt = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let y = 0; y < padH; y += 1) {
    const row = y * padW;
    for (let x = 0; x < padW; x += 1) f[x] = grid[row + x]!;
    edt1d(f, dt, padW, v, z);
    for (let x = 0; x < padW; x += 1) grid[row + x] = dt[x]!;
  }

  for (let x = 0; x < padW; x += 1) {
    for (let y = 0; y < padH; y += 1) f[y] = grid[y * padW + x]!;
    edt1d(f, dt, padH, v, z);
    for (let y = 0; y < padH; y += 1) grid[y * padW + x] = dt[y]!;
  }

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * width + x] = Math.sqrt(Math.max(0, grid[(y + 1) * padW + (x + 1)]!));
    }
  }
  return out;
}

function smoothHeightFieldGaussianApprox(
  field: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius <= 0 || width <= 1 || height <= 1) return field;
  const current = new Float32Array(field);
  const temp = new Float32Array(field.length);
  const next = new Float32Array(field.length);

  // 2패스 분리형 박스 블러(텐트/가우시안 근사)
  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(width - 1, x + radius);
        for (let sx = x0; sx <= x1; sx += 1) {
          sum += current[row + sx]!;
          count += 1;
        }
        temp[row + x] = sum / count;
      }
    }

    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let sum = 0;
        let count = 0;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(height - 1, y + radius);
        for (let sy = y0; sy <= y1; sy += 1) {
          sum += temp[sy * width + x]!;
          count += 1;
        }
        next[y * width + x] = sum / count;
      }
    }
    current.set(next);
  }
  return current;
}

/**
 * 알파 채널을 보존하면서 도형·텍스트·스티커 래스터에 풍선처럼 부푼 3D Blinn-Phong 입체감을 부여한다.
 */
export function applyInflateFilter(
  source: StudioImageDataLike,
  rawOptions?: InflateFilterOptions | null,
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width, height, data: out };
  }

  const opts = normalizeInflateFilterOptions(rawOptions);
  if (opts.strength <= 0) {
    return { width, height, data: out };
  }

  const distField = computeAlphaSilhouetteDistance(data, width, height);
  let maxDist = 0;
  for (let i = 0; i < distField.length; i += 1) {
    if (distField[i]! > maxDist) maxDist = distField[i]!;
  }
  if (maxDist <= 0) {
    return { width, height, data: out };
  }

  // 정규화 반구형 돔 높이: u = d / maxDist -> dome = sqrt(1 - (1 - u)^2), heightLimit 클램프
  const domeHeight = new Float32Array(width * height);
  for (let i = 0; i < distField.length; i += 1) {
    const d = distField[i]!;
    if (d <= 0) continue;
    const u = Math.min(1, d / maxDist);
    const inv = 1 - u;
    const sphereH = Math.sqrt(Math.max(0, 1 - inv * inv));
    domeHeight[i] = Math.min(opts.heightLimit, sphereH);
  }

  const smoothedH = smoothHeightFieldGaussianApprox(
    domeHeight,
    width,
    height,
    opts.smoothingRadius,
  );

  // 광원 단위 벡터 L 및 Blinn-Phong 반각 벡터 H = normalize(L + V), V = (0, 0, 1)
  const rawLz = Math.sqrt(Math.max(0.08, 1 - opts.lightX * opts.lightX - opts.lightY * opts.lightY));
  const lLen = Math.hypot(opts.lightX, opts.lightY, rawLz);
  const lx = opts.lightX / lLen;
  const ly = opts.lightY / lLen;
  const lz = rawLz / lLen;

  const hLen = Math.hypot(lx, ly, lz + 1);
  const hx = lx / hLen;
  const hy = ly / hLen;
  const hz = (lz + 1) / hLen;

  // 스무딩된 높이 기울기를 픽셀 스케일에 맞춰 보정한다.
  const slopeScale = opts.reliefGain * Math.max(1, maxDist * 0.35);

  for (let y = 0; y < height; y += 1) {
    const yPrev = Math.max(0, y - 1);
    const yNext = Math.min(height - 1, y + 1);
    const dySpan = Math.max(1, yNext - yPrev);

    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const alpha = data[off + 3]!;
      if (alpha === 0) continue;

      const xPrev = Math.max(0, x - 1);
      const xNext = Math.min(width - 1, x + 1);
      const dxSpan = Math.max(1, xNext - xPrev);

      const dzdx = ((smoothedH[y * width + xNext]! - smoothedH[y * width + xPrev]!) / dxSpan) * slopeScale;
      const dzdy = ((smoothedH[yNext * width + x]! - smoothedH[yPrev * width + x]!) / dySpan) * slopeScale;

      const nLen = Math.hypot(-dzdx, -dzdy, 1);
      const nx = -dzdx / nLen;
      const ny = -dzdy / nLen;
      const nz = 1 / nLen;

      const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const ndoth = Math.max(0, nx * hx + ny * hy + nz * hz);
      const specular = Math.pow(ndoth, opts.shininess);

      const shade = 0.38 + 0.74 * ndotl;
      const specHighlight = 255 * specular * 0.62;

      const litR = data[off]! * shade + specHighlight;
      const litG = data[off + 1]! * shade + specHighlight;
      const litB = data[off + 2]! * shade + specHighlight;

      out[off] = Math.round(data[off]! + (litR - data[off]!) * opts.strength);
      out[off + 1] = Math.round(data[off + 1]! + (litG - data[off + 1]!) * opts.strength);
      out[off + 2] = Math.round(data[off + 2]! + (litB - data[off + 2]!) * opts.strength);
      out[off + 3] = alpha;
    }
  }

  return { width, height, data: out };
}
