/**
 * 모바일·저사양 GPU 최적화 3D Gaussian Splatting(3DGS) LOD · 공분산 압축 · 깊이 버킷 정렬 엔진.
 *
 * - 카메라 프러스텀(좌/우/상/하/근/원 평면) 3-sigma 보수적 컬링
 * - 시점 거리 및 투영 스크린 반경(px) 기반 LOD 등급 분배 및 GPU 예산(`maxActiveSplats`) 엄격 제어
 * - 대칭 3×3 공분산 행렬(상삼각 6성분)의 IEEE-754 16-bit Half-Float 압축/복원(VRAM 50% 절감)
 * - 16-bit 로그 깊이 키 양자화 + O(N) 2-pass 8-bit 기수 정렬(Radix Sort)
 */

export const MOBILE_GAUSSIAN_SPLAT_LOD_VERSION = 1 as const;

export type MobileGpuTier = "low-end-mobile" | "mid-mobile" | "tablet-desktop";

export type SplatVec3 = readonly [number, number, number];
export type SplatQuat = readonly [number, number, number, number]; // [x, y, z, w]
export type CovarianceUpper6 = readonly [number, number, number, number, number, number];

export interface GaussianSplatLodBudget {
  readonly tier: MobileGpuTier;
  readonly maxActiveSplats: number;
  readonly minScreenRadiusPx: number;
  readonly maxScreenRadiusPx: number;
  readonly nearClipM: number;
  readonly farClipM: number;
  readonly depthBucketCount: number;
  readonly opacityThreshold: number;
}

export const DEFAULT_SPLAT_LOD_BUDGETS: Readonly<Record<MobileGpuTier, GaussianSplatLodBudget>> =
  Object.freeze({
    "low-end-mobile": Object.freeze({
      tier: "low-end-mobile",
      maxActiveSplats: 35_000,
      minScreenRadiusPx: 1.5,
      maxScreenRadiusPx: 256,
      nearClipM: 0.1,
      farClipM: 45,
      depthBucketCount: 65_536,
      opacityThreshold: 0.02,
    }),
    "mid-mobile": Object.freeze({
      tier: "mid-mobile",
      maxActiveSplats: 100_000,
      minScreenRadiusPx: 1.0,
      maxScreenRadiusPx: 384,
      nearClipM: 0.1,
      farClipM: 80,
      depthBucketCount: 65_536,
      opacityThreshold: 0.015,
    }),
    "tablet-desktop": Object.freeze({
      tier: "tablet-desktop",
      maxActiveSplats: 300_000,
      minScreenRadiusPx: 0.5,
      maxScreenRadiusPx: 512,
      nearClipM: 0.05,
      farClipM: 150,
      depthBucketCount: 65_536,
      opacityThreshold: 0.01,
    }),
  });

export interface GaussianSplatPrimitive {
  readonly id: string;
  readonly position: SplatVec3;
  readonly scale: SplatVec3;
  readonly rotationQuat: SplatQuat;
  readonly opacity: number;
  readonly colorRgb: SplatVec3;
}

export interface SplatCameraState {
  readonly position: SplatVec3;
  readonly forward: SplatVec3;
  readonly up: SplatVec3;
  readonly fovYRad: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
}

export type SplatLodLevel = 0 | 1 | 2;

export interface EvaluatedGaussianSplat {
  readonly id: string;
  readonly position: SplatVec3;
  readonly colorRgb: SplatVec3;
  readonly opacity: number;
  readonly viewDepthM: number;
  readonly screenRadiusPx: number;
  readonly lodLevel: SplatLodLevel;
  readonly importanceScore: number;
  readonly depthKey: number;
  readonly covarianceUpper6: CovarianceUpper6;
}

export interface PackedMobileSplatBuffer {
  readonly count: number;
  readonly positionsF32: Float32Array;
  readonly covarianceF16: Uint16Array;
  readonly colorOpacityU8: Uint8Array;
  readonly depthKeysU16: Uint16Array;
  readonly uncompressedBytes: number;
  readonly packedBytes: number;
  readonly compressionRatio: number;
}

export interface GaussianSplatLodFrameResult {
  readonly version: typeof MOBILE_GAUSSIAN_SPLAT_LOD_VERSION;
  readonly budget: GaussianSplatLodBudget;
  readonly totalInputCount: number;
  readonly culledByOpacityCount: number;
  readonly culledByFrustumCount: number;
  readonly culledByScreenRadiusCount: number;
  readonly trimmedByBudgetCount: number;
  readonly activeSplats: readonly EvaluatedGaussianSplat[];
  readonly packedBuffer: PackedMobileSplatBuffer;
  readonly lodDistribution: Readonly<{ lod0: number; lod1: number; lod2: number }>;
}

const f32Scratch = new Float32Array(1);
const u32Scratch = new Uint32Array(f32Scratch.buffer);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function dot3(a: SplatVec3, b: SplatVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: SplatVec3, b: SplatVec3): SplatVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: SplatVec3, fallback: SplatVec3): SplatVec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len < 1e-8) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * IEEE-754 binary32 값을 16-bit binary16(Half-Float) 비트 패턴(0..65535)으로 변환한다.
 * Round-to-nearest-even 규칙과 subnormal·무한대·NaN을 모두 처리한다.
 */
export function encodeFloat16(value: number): number {
  f32Scratch[0] = value;
  const bits = u32Scratch[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x007fffff;

  if (exponent === 0xff) {
    // Infinity or NaN
    if (mantissa === 0) return sign | 0x7c00;
    return sign | 0x7c00 | Math.max(1, mantissa >>> 13);
  }

  const halfExp = exponent - 127 + 15;
  if (halfExp >= 31) {
    return sign | 0x7c00; // Overflow -> ±Infinity
  }

  if (halfExp <= 0) {
    if (halfExp < -10) return sign; // Underflow -> ±0
    const shiftedMantissa = mantissa | 0x00800000;
    const shift = 14 - halfExp;
    const halfMantissa = shiftedMantissa >>> shift;
    const roundBit = (shiftedMantissa >>> (shift - 1)) & 1;
    const stickyMask = (1 << (shift - 1)) - 1;
    const sticky = (shiftedMantissa & stickyMask) !== 0 ? 1 : 0;
    const rounded = halfMantissa + (roundBit & (sticky | (halfMantissa & 1)));
    return sign | rounded;
  }

  const halfMantissa = mantissa >>> 13;
  const roundBit = (mantissa >>> 12) & 1;
  const sticky = (mantissa & 0xfff) !== 0 ? 1 : 0;
  const rounded = ((halfExp << 10) | halfMantissa) + (roundBit & (sticky | (halfMantissa & 1)));
  return sign | rounded;
}

/** IEEE-754 16-bit Half-Float 비트 패턴을 JS number(float64)로 복원한다. */
export function decodeFloat16(bits: number): number {
  const h = bits & 0xffff;
  const sign = (h & 0x8000) !== 0 ? -1 : 1;
  const exponent = (h >>> 10) & 0x1f;
  const mantissa = h & 0x03ff;

  if (exponent === 0) {
    if (mantissa === 0) return sign === -1 ? -0 : 0;
    return sign * Math.pow(2, -14) * (mantissa / 1024);
  }
  if (exponent === 31) {
    return mantissa === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

/**
 * 스케일과 회전 쿼터니언으로부터 3D 가우시안 공분산 행렬 `Σ = R · S · S^T · R^T`의
 * 상삼각 6성분 `[c00, c01, c02, c11, c12, c22]`를 계산한다.
 */
export function computeGaussianCovarianceUpper6(
  scale: SplatVec3,
  rotationQuat: SplatQuat,
): CovarianceUpper6 {
  const qLen = Math.hypot(rotationQuat[0], rotationQuat[1], rotationQuat[2], rotationQuat[3]);
  const [qx, qy, qz, qw] = qLen > 1e-8
    ? [rotationQuat[0] / qLen, rotationQuat[1] / qLen, rotationQuat[2] / qLen, rotationQuat[3] / qLen]
    : [0, 0, 0, 1];

  const sx = Math.max(1e-5, Number.isFinite(scale[0]) ? Math.abs(scale[0]) : 1e-5);
  const sy = Math.max(1e-5, Number.isFinite(scale[1]) ? Math.abs(scale[1]) : 1e-5);
  const sz = Math.max(1e-5, Number.isFinite(scale[2]) ? Math.abs(scale[2]) : 1e-5);

  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;

  // M = R * S
  const m00 = (1 - 2 * (yy + zz)) * sx;
  const m01 = (2 * (xy - wz)) * sy;
  const m02 = (2 * (xz + wy)) * sz;

  const m10 = (2 * (xy + wz)) * sx;
  const m11 = (1 - 2 * (xx + zz)) * sy;
  const m12 = (2 * (yz - wx)) * sz;

  const m20 = (2 * (xz - wy)) * sx;
  const m21 = (2 * (yz + wx)) * sy;
  const m22 = (1 - 2 * (xx + yy)) * sz;

  // Σ = M * M^T
  const c00 = m00 * m00 + m01 * m01 + m02 * m02;
  const c01 = m00 * m10 + m01 * m11 + m02 * m12;
  const c02 = m00 * m20 + m01 * m21 + m02 * m22;
  const c11 = m10 * m10 + m11 * m11 + m12 * m12;
  const c12 = m10 * m20 + m11 * m21 + m12 * m22;
  const c22 = m20 * m20 + m21 * m21 + m22 * m22;

  return Object.freeze([c00, c01, c02, c11, c12, c22] as const);
}

/** 3D 공분산 상삼각 6성분을 16-bit Half-Float `Uint16Array(6)`로 패킹한다. */
export function packCovariance3DToHalf(cov6: CovarianceUpper6): Uint16Array {
  const out = new Uint16Array(6);
  for (let i = 0; i < 6; i += 1) {
    out[i] = encodeFloat16(cov6[i]);
  }
  return out;
}

/** 16-bit Half-Float로 패킹된 공분산 6성분을 복원한다. */
export function unpackCovariance3DFromHalf(
  packed: Uint16Array,
  offset = 0,
): CovarianceUpper6 {
  return Object.freeze([
    decodeFloat16(packed[offset] ?? 0),
    decodeFloat16(packed[offset + 1] ?? 0),
    decodeFloat16(packed[offset + 2] ?? 0),
    decodeFloat16(packed[offset + 3] ?? 0),
    decodeFloat16(packed[offset + 4] ?? 0),
    decodeFloat16(packed[offset + 5] ?? 0),
  ] as const);
}

/**
 * 뷰 공간 깊이(m)를 근거리 정밀도가 높은 로그 분포 16-bit 기수 정렬 키(`[0, bucketCount - 1]`)로 양자화한다.
 */
export function quantizeDepthToRadixKey(
  depthM: number,
  nearM: number,
  farM: number,
  bucketCount = 65_536,
): number {
  const safeNear = Math.max(1e-4, nearM);
  const safeFar = Math.max(safeNear + 1e-3, farM);
  const safeBuckets = Math.max(2, Math.min(65_536, Math.floor(bucketCount)));
  const clampedDepth = clamp(depthM, safeNear, safeFar);

  const normalized = Math.log(clampedDepth / safeNear) / Math.log(safeFar / safeNear);
  return Math.min(safeBuckets - 1, Math.max(0, Math.round(normalized * (safeBuckets - 1))));
}

/**
 * 16-bit 깊이 키 기반 O(N) 2-pass 8-bit 기수 정렬(Radix Sort).
 * 기본값 `"back-to-front"`는 알파 블렌딩용 원거리→근거리 순서를 보장한다.
 */
export function sortSplatsByDepthBuckets(
  splats: readonly EvaluatedGaussianSplat[],
  order: "back-to-front" | "front-to-back" = "back-to-front",
): readonly EvaluatedGaussianSplat[] {
  const count = splats.length;
  if (count <= 1) return Object.freeze([...splats]);

  const indices = new Uint32Array(count);
  const temp = new Uint32Array(count);
  const keys = new Uint16Array(count);

  for (let i = 0; i < count; i += 1) {
    indices[i] = i;
    const rawKey = splats[i].depthKey & 0xffff;
    keys[i] = order === "back-to-front" ? 0xffff - rawKey : rawKey;
  }

  const histogram = new Uint32Array(256);

  // Pass 1: 하위 8비트(LSB)
  histogram.fill(0);
  for (let i = 0; i < count; i += 1) {
    histogram[keys[indices[i]] & 0xff] += 1;
  }
  let offset = 0;
  for (let b = 0; b < 256; b += 1) {
    const c = histogram[b];
    histogram[b] = offset;
    offset += c;
  }
  for (let i = 0; i < count; i += 1) {
    const idx = indices[i];
    const bucket = keys[idx] & 0xff;
    temp[histogram[bucket]] = idx;
    histogram[bucket] += 1;
  }

  // Pass 2: 상위 8비트(MSB)
  histogram.fill(0);
  for (let i = 0; i < count; i += 1) {
    histogram[(keys[temp[i]] >>> 8) & 0xff] += 1;
  }
  offset = 0;
  for (let b = 0; b < 256; b += 1) {
    const c = histogram[b];
    histogram[b] = offset;
    offset += c;
  }
  for (let i = 0; i < count; i += 1) {
    const idx = temp[i];
    const bucket = (keys[idx] >>> 8) & 0xff;
    indices[histogram[bucket]] = idx;
    histogram[bucket] += 1;
  }

  const sorted = new Array<EvaluatedGaussianSplat>(count);
  for (let i = 0; i < count; i += 1) {
    sorted[i] = splats[indices[i]];
  }
  return Object.freeze(sorted);
}

/**
 * 선택된 스플랫 목록을 모바일 GPU 업로드용 압축 버퍼로 패킹한다.
 * 위치(12B) + Half-Float 공분산 6성분(12B) + RGBA8(4B) + 깊이키(2B) = 30B/splat.
 * 비압축 float32(위치12B + 공분산24B + RGBA16B + 깊이4B = 56B/splat) 대비 약 46% 메모리 절감.
 */
export function packSplatGpuBuffer(
  splats: readonly EvaluatedGaussianSplat[],
): PackedMobileSplatBuffer {
  const count = splats.length;
  const positionsF32 = new Float32Array(count * 3);
  const covarianceF16 = new Uint16Array(count * 6);
  const colorOpacityU8 = new Uint8Array(count * 4);
  const depthKeysU16 = new Uint16Array(count);

  for (let i = 0; i < count; i += 1) {
    const splat = splats[i];
    const pOffset = i * 3;
    positionsF32[pOffset] = splat.position[0];
    positionsF32[pOffset + 1] = splat.position[1];
    positionsF32[pOffset + 2] = splat.position[2];

    const cOffset = i * 6;
    for (let k = 0; k < 6; k += 1) {
      covarianceF16[cOffset + k] = encodeFloat16(splat.covarianceUpper6[k]);
    }

    const rgbaOffset = i * 4;
    colorOpacityU8[rgbaOffset] = Math.round(clamp(splat.colorRgb[0], 0, 1) * 255);
    colorOpacityU8[rgbaOffset + 1] = Math.round(clamp(splat.colorRgb[1], 0, 1) * 255);
    colorOpacityU8[rgbaOffset + 2] = Math.round(clamp(splat.colorRgb[2], 0, 1) * 255);
    colorOpacityU8[rgbaOffset + 3] = Math.round(clamp(splat.opacity, 0, 1) * 255);

    depthKeysU16[i] = splat.depthKey & 0xffff;
  }

  const uncompressedBytes = count * 56;
  const packedBytes =
    positionsF32.byteLength +
    covarianceF16.byteLength +
    colorOpacityU8.byteLength +
    depthKeysU16.byteLength;
  const compressionRatio = uncompressedBytes > 0 ? packedBytes / uncompressedBytes : 1;

  return Object.freeze({
    count,
    positionsF32,
    covarianceF16,
    colorOpacityU8,
    depthKeysU16,
    uncompressedBytes,
    packedBytes,
    compressionRatio,
  });
}

/**
 * 3D Gaussian Splat 프레임 전체에 프러스텀 컬링·스크린 반경 LOD·예산 절단·깊이 버킷 정렬·GPU 압축 패킹을 수행한다.
 */
export function evaluateMobileGaussianSplatLodFrame(input: {
  readonly splats: readonly GaussianSplatPrimitive[];
  readonly camera: SplatCameraState;
  readonly budget?: Partial<GaussianSplatLodBudget> & { readonly tier?: MobileGpuTier };
  readonly sortOrder?: "back-to-front" | "front-to-back";
}): GaussianSplatLodFrameResult {
  const baseBudget = DEFAULT_SPLAT_LOD_BUDGETS[input.budget?.tier ?? "mid-mobile"];
  const budget: GaussianSplatLodBudget = Object.freeze({
    ...baseBudget,
    ...input.budget,
    tier: input.budget?.tier ?? baseBudget.tier,
    maxActiveSplats: Math.max(1, Math.floor(input.budget?.maxActiveSplats ?? baseBudget.maxActiveSplats)),
  });

  const forward = normalize3(input.camera.forward, [0, 0, -1]);
  const rawRight = cross3(forward, normalize3(input.camera.up, [0, 1, 0]));
  const right = normalize3(rawRight, [1, 0, 0]);
  const trueUp = normalize3(cross3(right, forward), [0, 1, 0]);

  const viewportW = Math.max(1, input.camera.viewportWidthPx);
  const viewportH = Math.max(1, input.camera.viewportHeightPx);
  const aspect = viewportW / viewportH;
  const halfFovY = clamp(input.camera.fovYRad, 0.2, Math.PI * 0.85) * 0.5;
  const tanHalfY = Math.tan(halfFovY);
  const tanHalfX = tanHalfY * aspect;
  const cosHalfY = Math.cos(halfFovY);
  const cosHalfX = 1 / Math.hypot(1, tanHalfX);
  const focalPx = viewportH / (2 * tanHalfY);

  let culledByOpacityCount = 0;
  let culledByFrustumCount = 0;
  let culledByScreenRadiusCount = 0;
  const candidates: EvaluatedGaussianSplat[] = [];

  for (const splat of input.splats) {
    const opacity = clamp(splat.opacity, 0, 1);
    if (opacity < budget.opacityThreshold) {
      culledByOpacityCount += 1;
      continue;
    }

    const dx = splat.position[0] - input.camera.position[0];
    const dy = splat.position[1] - input.camera.position[1];
    const dz = splat.position[2] - input.camera.position[2];
    const delta: SplatVec3 = [dx, dy, dz];

    const camZ = dot3(delta, forward);
    const maxScale = Math.max(
      Math.abs(splat.scale[0]),
      Math.abs(splat.scale[1]),
      Math.abs(splat.scale[2]),
      1e-5,
    );
    const boundRadius3Sigma = maxScale * 3.0;

    if (camZ + boundRadius3Sigma < budget.nearClipM || camZ - boundRadius3Sigma > budget.farClipM) {
      culledByFrustumCount += 1;
      continue;
    }

    const camX = dot3(delta, right);
    const camY = dot3(delta, trueUp);
    const effectiveZ = Math.max(camZ, budget.nearClipM);

    const limitX = effectiveZ * tanHalfX + boundRadius3Sigma / Math.max(0.1, cosHalfX);
    const limitY = effectiveZ * tanHalfY + boundRadius3Sigma / Math.max(0.1, cosHalfY);
    if (Math.abs(camX) > limitX || Math.abs(camY) > limitY) {
      culledByFrustumCount += 1;
      continue;
    }

    const screenRadiusPx = clamp((maxScale * focalPx) / effectiveZ, 0, budget.maxScreenRadiusPx);
    if (screenRadiusPx < budget.minScreenRadiusPx) {
      culledByScreenRadiusCount += 1;
      continue;
    }

    const lodLevel: SplatLodLevel =
      screenRadiusPx >= 12 ? 0 : screenRadiusPx >= 4 ? 1 : 2;
    const importanceScore = (screenRadiusPx * opacity) / (1 + effectiveZ * 0.1);
    const depthKey = quantizeDepthToRadixKey(
      effectiveZ,
      budget.nearClipM,
      budget.farClipM,
      budget.depthBucketCount,
    );

    candidates.push(
      Object.freeze({
        id: splat.id,
        position: splat.position,
        colorRgb: splat.colorRgb,
        opacity,
        viewDepthM: effectiveZ,
        screenRadiusPx,
        lodLevel,
        importanceScore,
        depthKey,
        covarianceUpper6: computeGaussianCovarianceUpper6(splat.scale, splat.rotationQuat),
      }),
    );
  }

  let trimmedByBudgetCount = 0;
  let selected = candidates;
  if (candidates.length > budget.maxActiveSplats) {
    trimmedByBudgetCount = candidates.length - budget.maxActiveSplats;
    selected = [...candidates]
      .sort((a, b) => {
        if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .slice(0, budget.maxActiveSplats);
  }

  const activeSplats = sortSplatsByDepthBuckets(selected, input.sortOrder ?? "back-to-front");
  const packedBuffer = packSplatGpuBuffer(activeSplats);

  let lod0 = 0;
  let lod1 = 0;
  let lod2 = 0;
  for (const s of activeSplats) {
    if (s.lodLevel === 0) lod0 += 1;
    else if (s.lodLevel === 1) lod1 += 1;
    else lod2 += 1;
  }

  return Object.freeze({
    version: MOBILE_GAUSSIAN_SPLAT_LOD_VERSION,
    budget,
    totalInputCount: input.splats.length,
    culledByOpacityCount,
    culledByFrustumCount,
    culledByScreenRadiusCount,
    trimmedByBudgetCount,
    activeSplats,
    packedBuffer,
    lodDistribution: Object.freeze({ lod0, lod1, lod2 }),
  });
}
