/**
 * Wave 64 — 2D 선화·실루엣 → 2.5D 법선·깊이 추정 및 인터랙티브 리라이팅,
 * 3D Gaussian Splatting(3DGS) 만화 배경 NPR 투영·선화 추출 커널.
 *
 * 오른손 뷰 좌표계: `+X` 우, `+Y` 상(`y_screen` 반대), `+Z` 카메라 방향(`nz >= 0`).
 */

export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];
export type RgbNormalized = readonly [number, number, number];
export type RgbByteTuple = readonly [number, number, number];
export type SurfaceInflationProfile = "spherical" | "pillowy" | "beveled";

export interface SketchNormalFieldInput {
  readonly width: number;
  readonly height: number;
  readonly silhouetteMask: Uint8Array | Float32Array;
  readonly lineArtMask?: Uint8Array | Float32Array;
  readonly inflationProfile?: SurfaceInflationProfile;
  readonly maxInflationRadiusPx?: number;
  readonly depthScale?: number;
  readonly creaseStrength?: number;
}

export interface SketchNormalDepthField {
  readonly width: number;
  readonly height: number;
  readonly normalXyzF32: Float32Array;
  readonly normalRgbU8: Uint8ClampedArray;
  readonly depthF32: Float32Array;
  readonly sdfF32: Float32Array;
  readonly coverageMask: Uint8Array;
  readonly maxInteriorRadiusPx: number;
  readonly silhouettePixelCount: number;
}

export interface VirtualLightOrb {
  readonly direction: Vec3Tuple;
  readonly color: RgbNormalized;
  readonly intensity: number;
  readonly ambientColor?: RgbNormalized;
  readonly ambientIntensity?: number;
  readonly shadowTint?: RgbNormalized;
  readonly celThreshold?: number;
  readonly celSoftness?: number;
  readonly rimStrength?: number;
  readonly rimPower?: number;
  readonly rimColor?: RgbNormalized;
  readonly specularStrength?: number;
  readonly specularShininess?: number;
}

export interface NeuralRelightInput {
  readonly field: SketchNormalDepthField;
  readonly albedoRgba: Uint8ClampedArray;
  readonly light: VirtualLightOrb;
  readonly secondaryLights?: readonly VirtualLightOrb[];
}

export interface NeuralRelightStats {
  readonly meanLitLuma: number;
  readonly leftHalfMeanLuma: number;
  readonly rightHalfMeanLuma: number;
  readonly topHalfMeanLuma: number;
  readonly bottomHalfMeanLuma: number;
  readonly litPixelRatio: number;
  readonly rimPixelCount: number;
}

export interface NeuralRelightResult {
  readonly width: number;
  readonly height: number;
  readonly litRgba: Uint8ClampedArray;
  readonly shadowMaskF32: Float32Array;
  readonly rimMaskF32: Float32Array;
  readonly specularMaskF32: Float32Array;
  readonly stats: NeuralRelightStats;
}

export interface GaussianSplat3D {
  readonly id: string;
  readonly position: Vec3Tuple;
  readonly scale: Vec3Tuple;
  readonly rotationQuat: QuatTuple;
  readonly opacity: number;
  readonly sh0Color: RgbNormalized;
  readonly semanticGroup?: string;
}

export interface GaussianSplatCamera {
  readonly position: Vec3Tuple;
  readonly target: Vec3Tuple;
  readonly up?: Vec3Tuple;
  readonly fovYDeg?: number;
  readonly near?: number;
  readonly far?: number;
  readonly width: number;
  readonly height: number;
}

export interface ComicNprExtractionOptions {
  readonly celToneLevels?: number;
  readonly depthEdgeThreshold?: number;
  readonly normalEdgeThreshold?: number;
  readonly inkColor?: RgbByteTuple;
  readonly backgroundColor?: RgbByteTuple;
  readonly lowPassFilterVar?: number;
}

export interface GaussianSplatComicNprInput {
  readonly splats: readonly GaussianSplat3D[];
  readonly camera: GaussianSplatCamera;
  readonly options?: ComicNprExtractionOptions;
}

export interface GaussianSplatComicNprStats {
  readonly coveredPixelCount: number;
  readonly lineArtPixelCount: number;
  readonly minDepth: number;
  readonly maxDepth: number;
  readonly rasterMs: number;
}

export interface GaussianSplatComicNprResult {
  readonly width: number;
  readonly height: number;
  readonly renderedSplatCount: number;
  readonly culledSplatCount: number;
  readonly sortedSplatIds: readonly string[];
  readonly depthBufferF32: Float32Array;
  readonly alphaBufferF32: Float32Array;
  readonly normalXyzF32: Float32Array;
  readonly lineArtMaskF32: Float32Array;
  readonly celToneRgba: Uint8ClampedArray;
  readonly compositeComicRgba: Uint8ClampedArray;
  readonly stats: GaussianSplatComicNprStats;
}

const SH_C0 = 0.28209479177387814;
const EDT_INF = 1e12;

function clamp(v: number, min: number, max: number): number { return v < min ? min : v > max ? max : v; }
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
}
function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function normalizeVec3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  return len <= 1e-8 ? [0, 0, 1] : [x / len, y / len, z / len];
}

function crossVec3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** 3DGS SH 0차 DC 계수를 선형 표시 RGB `[0, 1]`로 변환한다. */
export function evaluateSh0Color(dc: Vec3Tuple): [number, number, number] {
  return [clamp01(0.5 + SH_C0 * dc[0]), clamp01(0.5 + SH_C0 * dc[1]), clamp01(0.5 + SH_C0 * dc[2])];
}

function sampleMask(mask: Uint8Array | Float32Array, index: number): number {
  return mask instanceof Uint8Array ? mask[index] / 255 : clamp01(mask[index]);
}

function edt1d(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (k > 0 && s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
}

function computeInteriorEuclideanSdf(coverage: Uint8Array, width: number, height: number): Float32Array {
  const sqDist = new Float32Array(width * height);
  for (let i = 0; i < sqDist.length; i++) sqDist[i] = coverage[i] === 1 ? EDT_INF : 0;
  const maxDim = Math.max(width, height);
  const f = new Float32Array(maxDim);
  const d = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = sqDist[y * width + x];
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) sqDist[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = sqDist[row + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) sqDist[row + x] = Math.sqrt(Math.max(0, d[x]));
  }
  return sqDist;
}

/** 2D 실루엣·선화 마스크의 SDF 기울기와 팽창 프로파일로 2.5D 깊이맵 및 단위 법선장을 추정한다. */
export function estimateSketchNormalDepthField(input: SketchNormalFieldInput): SketchNormalDepthField {
  const { width, height, silhouetteMask, lineArtMask } = input;
  if (!Number.isInteger(width) || width < 4 || !Number.isInteger(height) || height < 4) {
    throw new RangeError("width와 height는 4 이상의 정수여야 합니다.");
  }
  const pixelCount = width * height;
  if (silhouetteMask.length !== pixelCount || (lineArtMask && lineArtMask.length !== pixelCount)) {
    throw new RangeError("마스크 버퍼 길이가 해상도와 일치하지 않습니다.");
  }

  const profile = input.inflationProfile ?? "spherical";
  const depthScale = clamp(input.depthScale ?? 1.0, 0.1, 4.0);
  const creaseStrength = clamp(input.creaseStrength ?? 0.22, 0, 1);

  const coverageMask = new Uint8Array(pixelCount);
  let silhouettePixelCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (sampleMask(silhouetteMask, i) >= 0.5) {
      coverageMask[i] = 1;
      silhouettePixelCount++;
    }
  }

  const sdfF32 = computeInteriorEuclideanSdf(coverageMask, width, height);
  let maxInteriorRadiusPx = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (coverageMask[i] === 1 && sdfF32[i] > maxInteriorRadiusPx) maxInteriorRadiusPx = sdfF32[i];
  }

  const effectiveRadius = Math.max(
    1,
    input.maxInflationRadiusPx ? Math.min(maxInteriorRadiusPx, input.maxInflationRadiusPx) : maxInteriorRadiusPx,
  );
  const denomR = Math.max(1, effectiveRadius - 0.5);
  const depthF32 = new Float32Array(pixelCount);
  const heightPx = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    if (coverageMask[i] === 0) continue;
    // 경계 픽셀 중심의 0.5px 서브픽셀 오프셋을 적용해 실루엣 가장자리 그레이징 법선을 정밀 복원
    const u = clamp01((sdfF32[i] - 0.5) / denomR);
    const hNorm =
      profile === "spherical"
        ? Math.sqrt(Math.max(0, u * (2 - u)))
        : profile === "pillowy"
          ? Math.sin(u * Math.PI * 0.5)
          : smoothstep(0, 0.42, u);
    depthF32[i] = hNorm;
    heightPx[i] = hNorm * effectiveRadius * depthScale;
  }

  if (lineArtMask && creaseStrength > 0) {
    const creaseDelta = new Float32Array(pixelCount);
    const maxCarve = Math.min(effectiveRadius * 0.35, 6);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (coverageMask[idx] === 0) continue;
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const w = kx === 0 && ky === 0 ? 4 : kx === 0 || ky === 0 ? 2 : 1;
            sum += sampleMask(lineArtMask, (y + ky) * width + (x + kx)) * w;
          }
        }
        if (sum > 0.16) creaseDelta[idx] = (sum / 16) * creaseStrength * maxCarve;
      }
    }
    const invMaxH = 1 / Math.max(1e-5, effectiveRadius * depthScale);
    for (let i = 0; i < pixelCount; i++) {
      if (coverageMask[i] === 0 || creaseDelta[i] === 0) continue;
      heightPx[i] = Math.max(0, heightPx[i] - creaseDelta[i]);
      depthF32[i] = clamp01(heightPx[i] * invMaxH);
    }
  }

  const normalXyzF32 = new Float32Array(pixelCount * 3);
  const normalRgbU8 = new Uint8ClampedArray(pixelCount * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const nOff = idx * 3;
      const cOff = idx * 4;
      if (coverageMask[idx] === 0) {
        normalXyzF32[nOff + 2] = 1;
        normalRgbU8[cOff] = 128;
        normalRgbU8[cOff + 1] = 128;
        normalRgbU8[cOff + 2] = 255;
        continue;
      }
      const xL = Math.max(0, x - 1);
      const xR = Math.min(width - 1, x + 1);
      const yU = Math.max(0, y - 1);
      const yD = Math.min(height - 1, y + 1);
      const dzDx = (heightPx[y * width + xR] - heightPx[y * width + xL]) / Math.max(1, xR - xL);
      const dzDy = (heightPx[yD * width + x] - heightPx[yU * width + x]) / Math.max(1, yD - yU);
      const [nx, ny, nz] = normalizeVec3(-dzDx, dzDy, 1.0);
      normalXyzF32[nOff] = nx;
      normalXyzF32[nOff + 1] = ny;
      normalXyzF32[nOff + 2] = Math.max(0, nz);
      normalRgbU8[cOff] = Math.round(clamp01(nx * 0.5 + 0.5) * 255);
      normalRgbU8[cOff + 1] = Math.round(clamp01(ny * 0.5 + 0.5) * 255);
      normalRgbU8[cOff + 2] = Math.round(clamp01(nz * 0.5 + 0.5) * 255);
      normalRgbU8[cOff + 3] = 255;
    }
  }

  return {
    width, height, normalXyzF32, normalRgbU8, depthF32, sdfF32,
    coverageMask, maxInteriorRadiusPx, silhouettePixelCount,
  };
}

/** 추정 법선맵과 가상 광원 구슬 위치에 따라 셀 명암·림라이트·반사 하이라이트를 실시간 재조명한다. */
export function relightCanvasFromNormalField(input: NeuralRelightInput): NeuralRelightResult {
  const { field, albedoRgba, light } = input;
  const { width, height, normalXyzF32, coverageMask } = field;
  const pixelCount = width * height;
  if (albedoRgba.length !== pixelCount * 4) {
    throw new RangeError("albedoRgba 버퍼 길이가 법선 필드 해상도와 일치하지 않습니다.");
  }

  const lights: readonly VirtualLightOrb[] = input.secondaryLights ? [light, ...input.secondaryLights] : [light];
  const [lx, ly, lz] = normalizeVec3(light.direction[0], light.direction[1], light.direction[2]);
  const [hx, hy, hz] = normalizeVec3(lx, ly, lz + 1);
  const ambientColor = light.ambientColor ?? [0.82, 0.85, 0.94];
  const ambientIntensity = clamp(light.ambientIntensity ?? 0.24, 0, 1.5);
  const shadowTint = light.shadowTint ?? [0.42, 0.46, 0.62];
  const celThreshold = clamp(light.celThreshold ?? 0.12, -0.8, 0.9);
  const celSoftness = clamp(light.celSoftness ?? 0.08, 0.01, 0.6);
  const rimStrength = clamp(light.rimStrength ?? 0.55, 0, 2.5);
  const rimPower = clamp(light.rimPower ?? 2.0, 0.5, 8);
  const rimColor = light.rimColor ?? light.color;
  const specStrength = clamp(light.specularStrength ?? 0.42, 0, 2.5);
  const specShininess = clamp(light.specularShininess ?? 28, 2, 128);
  const lightScale = Math.max(0, light.intensity);

  const litRgba = new Uint8ClampedArray(albedoRgba.length);
  const shadowMaskF32 = new Float32Array(pixelCount);
  const rimMaskF32 = new Float32Array(pixelCount);
  const specularMaskF32 = new Float32Array(pixelCount);

  const midX = width * 0.5;
  const midY = height * 0.5;
  let totalLuma = 0; let totalCount = 0;
  let leftLuma = 0; let leftCount = 0; let rightLuma = 0; let rightCount = 0;
  let topLuma = 0; let topCount = 0; let bottomLuma = 0; let bottomCount = 0;
  let litPixels = 0; let rimPixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cOff = idx * 4;
      if (coverageMask[idx] === 0) {
        litRgba[cOff] = albedoRgba[cOff];
        litRgba[cOff + 1] = albedoRgba[cOff + 1];
        litRgba[cOff + 2] = albedoRgba[cOff + 2];
        litRgba[cOff + 3] = albedoRgba[cOff + 3];
        continue;
      }

      const nOff = idx * 3;
      const nx = normalXyzF32[nOff];
      const ny = normalXyzF32[nOff + 1];
      const nz = normalXyzF32[nOff + 2];
      const baseR = albedoRgba[cOff] / 255;
      const baseG = albedoRgba[cOff + 1] / 255;
      const baseB = albedoRgba[cOff + 2] / 255;

      const celBand = smoothstep(celThreshold - celSoftness, celThreshold + celSoftness, nx * lx + ny * ly + nz * lz);
      shadowMaskF32[idx] = celBand;
      if (celBand >= 0.5) litPixels++;

      let outR = baseR * (ambientColor[0] * ambientIntensity + (shadowTint[0] * (1 - celBand) + light.color[0] * celBand) * lightScale);
      let outG = baseG * (ambientColor[1] * ambientIntensity + (shadowTint[1] * (1 - celBand) + light.color[1] * celBand) * lightScale);
      let outB = baseB * (ambientColor[2] * ambientIntensity + (shadowTint[2] * (1 - celBand) + light.color[2] * celBand) * lightScale);

      for (let li = 1; li < lights.length; li++) {
        const sec = lights[li];
        const [sx, sy, sz] = normalizeVec3(sec.direction[0], sec.direction[1], sec.direction[2]);
        const secBand = smoothstep(0.05, 0.25, Math.max(0, nx * sx + ny * sy + nz * sz)) * Math.max(0, sec.intensity) * 0.65;
        outR += baseR * sec.color[0] * secBand;
        outG += baseG * sec.color[1] * secBand;
        outB += baseB * sec.color[2] * secBand;
      }

      const fresnel = Math.pow(1 - clamp01(nz), rimPower);
      const sideAlign = clamp01(0.45 + 0.55 * (nx * lx + ny * ly) + 0.35 * Math.max(0, lz));
      const rim = clamp01(fresnel * sideAlign * rimStrength * lightScale);
      rimMaskF32[idx] = rim;
      if (rim >= 0.15) rimPixelCount++;

      const spec = clamp01(Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), specShininess) * specStrength * celBand);
      specularMaskF32[idx] = spec;

      outR = clamp01(outR + rimColor[0] * rim + light.color[0] * spec);
      outG = clamp01(outG + rimColor[1] * rim + light.color[1] * spec);
      outB = clamp01(outB + rimColor[2] * rim + light.color[2] * spec);

      litRgba[cOff] = Math.round(outR * 255);
      litRgba[cOff + 1] = Math.round(outG * 255);
      litRgba[cOff + 2] = Math.round(outB * 255);
      litRgba[cOff + 3] = albedoRgba[cOff + 3];

      const luma = 0.2126 * outR + 0.7152 * outG + 0.0722 * outB;
      totalLuma += luma;
      totalCount++;
      if (x < midX) { leftLuma += luma; leftCount++; } else { rightLuma += luma; rightCount++; }
      if (y < midY) { topLuma += luma; topCount++; } else { bottomLuma += luma; bottomCount++; }
    }
  }

  return {
    width, height, litRgba, shadowMaskF32, rimMaskF32, specularMaskF32,
    stats: {
      meanLitLuma: totalLuma / Math.max(1, totalCount),
      leftHalfMeanLuma: leftLuma / Math.max(1, leftCount),
      rightHalfMeanLuma: rightLuma / Math.max(1, rightCount),
      topHalfMeanLuma: topLuma / Math.max(1, topCount),
      bottomHalfMeanLuma: bottomLuma / Math.max(1, bottomCount),
      litPixelRatio: litPixels / Math.max(1, totalCount),
      rimPixelCount,
    },
  };
}

function quatToRot3(q: QuatTuple): Float64Array {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const [x, y, z, w] = [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  const [xx, yy, zz, xy, xz, yz, wx, wy, wz] = [x * x, y * y, z * z, x * y, x * z, y * z, w * x, w * y, w * z];
  return new Float64Array([
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ]);
}

function mulMat3(a: Float64Array, b: Float64Array, transposeB = false): Float64Array {
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = transposeB
        ? a[r * 3] * b[c * 3] + a[r * 3 + 1] * b[c * 3 + 1] + a[r * 3 + 2] * b[c * 3 + 2]
        : a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

interface ProjectedGaussian2D {
  readonly id: string;
  readonly semanticGroup: string;
  readonly depth: number;
  readonly u: number;
  readonly v: number;
  readonly invA: number;
  readonly invB: number;
  readonly invC: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly opacity: number;
  readonly colorR: number;
  readonly colorG: number;
  readonly colorB: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
}

/**
 * 3D Gaussian Splatting(3DGS) 타원체를 EWA 2D 공분산 투영으로 래스터화하고,
 * 볼륨·주표면(mode-surface) 깊이 및 법선 불연속을 결합해 웹툰 배경 선화 + 셀 톤을 추출한다.
 */
export function projectGaussianSplatsToComicNpr(input: GaussianSplatComicNprInput): GaussianSplatComicNprResult {
  const t0 = nowMs();
  const { splats, camera } = input;
  const { width, height } = camera;
  if (!Number.isInteger(width) || width < 4 || !Number.isInteger(height) || height < 4) {
    throw new RangeError("카메라 width와 height는 4 이상의 정수여야 합니다.");
  }

  const fovYDeg = clamp(camera.fovYDeg ?? 50, 10, 140);
  const near = Math.max(0.01, camera.near ?? 0.1);
  const far = Math.max(near + 0.1, camera.far ?? 200);
  const upVec = camera.up ?? [0, 1, 0];
  const opts = input.options ?? {};
  const celLevels = Math.max(2, Math.round(opts.celToneLevels ?? 4));
  const depthThresh = clamp(opts.depthEdgeThreshold ?? 0.14, 0.01, 2.0);
  const normalThresh = clamp(opts.normalEdgeThreshold ?? 0.36, 0.05, 1.8);
  const inkColor = opts.inkColor ?? [22, 24, 32];
  const bgColor = opts.backgroundColor ?? [246, 244, 238];
  const lowPassVar = Math.max(0.05, opts.lowPassFilterVar ?? 0.3);

  const [fwdX, fwdY, fwdZ] = normalizeVec3(
    camera.target[0] - camera.position[0],
    camera.target[1] - camera.position[1],
    camera.target[2] - camera.position[2],
  );
  const rawRight = crossVec3(fwdX, fwdY, fwdZ, upVec[0], upVec[1], upVec[2]);
  const [rightX, rightY, rightZ] = normalizeVec3(rawRight[0], rawRight[1], rawRight[2]);
  const [camUpX, camUpY, camUpZ] = crossVec3(rightX, rightY, rightZ, fwdX, fwdY, fwdZ);
  const viewRot = new Float64Array([rightX, rightY, rightZ, camUpX, camUpY, camUpZ, -fwdX, -fwdY, -fwdZ]);

  const focal = (height * 0.5) / Math.tan((fovYDeg * Math.PI) / 360);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const projected: ProjectedGaussian2D[] = [];
  let culledSplatCount = 0;

  for (let i = 0; i < splats.length; i++) {
    const s = splats[i];
    const opacity = clamp01(s.opacity);
    if (opacity <= 1e-4) { culledSplatCount++; continue; }

    const dx = s.position[0] - camera.position[0];
    const dy = s.position[1] - camera.position[1];
    const dz = s.position[2] - camera.position[2];
    const tx = viewRot[0] * dx + viewRot[1] * dy + viewRot[2] * dz;
    const ty = viewRot[3] * dx + viewRot[4] * dy + viewRot[5] * dz;
    const depth = -(viewRot[6] * dx + viewRot[7] * dy + viewRot[8] * dz);
    if (depth <= near || depth >= far) { culledSplatCount++; continue; }

    const u = cx + (focal * tx) / depth;
    const v = cy - (focal * ty) / depth;
    const rot3 = quatToRot3(s.rotationQuat);
    const sx = Math.max(1e-4, Math.abs(s.scale[0]));
    const sy = Math.max(1e-4, Math.abs(s.scale[1]));
    const sz = Math.max(1e-4, Math.abs(s.scale[2]));
    const rs = new Float64Array([
      rot3[0] * sx, rot3[1] * sy, rot3[2] * sz,
      rot3[3] * sx, rot3[4] * sy, rot3[5] * sz,
      rot3[6] * sx, rot3[7] * sy, rot3[8] * sz,
    ]);
    const wrs = mulMat3(viewRot, rs, false);
    const sigmaCam = mulMat3(wrs, wrs, true);

    const invD = 1 / depth;
    const j00 = focal * invD;
    const j02 = focal * tx * invD * invD;
    const j11 = -focal * invD;
    const j12 = -focal * ty * invD * invD;

    const covA = (j00 * sigmaCam[0] + j02 * sigmaCam[6]) * j00 + (j00 * sigmaCam[2] + j02 * sigmaCam[8]) * j02 + lowPassVar;
    const covB = (j00 * sigmaCam[1] + j02 * sigmaCam[7]) * j11 + (j00 * sigmaCam[2] + j02 * sigmaCam[8]) * j12;
    const covC = (j11 * sigmaCam[4] + j12 * sigmaCam[7]) * j11 + (j11 * sigmaCam[5] + j12 * sigmaCam[8]) * j12 + lowPassVar;
    const det = covA * covC - covB * covB;
    if (det <= 1e-8) { culledSplatCount++; continue; }

    const mid = 0.5 * (covA + covC);
    const radius = Math.min(Math.max(width, height), Math.ceil(3.0 * Math.sqrt(Math.max(0.1, mid + Math.sqrt(Math.max(0, mid * mid - det))))));
    const minX = Math.max(0, Math.floor(u - radius));
    const maxX = Math.min(width - 1, Math.ceil(u + radius));
    const minY = Math.max(0, Math.floor(v - radius));
    const maxY = Math.min(height - 1, Math.ceil(v + radius));
    if (minX > maxX || minY > maxY) { culledSplatCount++; continue; }

    const minAxis = sx <= sy && sx <= sz ? 0 : sy <= sz ? 1 : 2;
    const [lnx, lny, lnz] = [rot3[minAxis], rot3[3 + minAxis], rot3[6 + minAxis]];
    let camNx = viewRot[0] * lnx + viewRot[1] * lny + viewRot[2] * lnz;
    let camNy = viewRot[3] * lnx + viewRot[4] * lny + viewRot[5] * lnz;
    let camNz = viewRot[6] * lnx + viewRot[7] * lny + viewRot[8] * lnz;
    if (camNz < 0) { camNx = -camNx; camNy = -camNy; camNz = -camNz; }
    const [normalX, normalY, normalZ] = normalizeVec3(camNx, camNy, camNz);

    const invDet = 1 / det;
    projected.push({
      id: s.id, semanticGroup: s.semanticGroup ?? s.id, depth, u, v,
      invA: covC * invDet, invB: -covB * invDet, invC: covA * invDet,
      minX, maxX, minY, maxY, opacity,
      colorR: clamp01(s.sh0Color[0]), colorG: clamp01(s.sh0Color[1]), colorB: clamp01(s.sh0Color[2]),
      normalX, normalY, normalZ,
    });
  }

  projected.sort((a, b) => (a.depth !== b.depth ? a.depth - b.depth : a.id.localeCompare(b.id)));
  const sortedSplatIds = projected.map((p) => p.id);

  const pixelCount = width * height;
  const accumR = new Float32Array(pixelCount); const accumG = new Float32Array(pixelCount); const accumB = new Float32Array(pixelCount);
  const accumDepth = new Float32Array(pixelCount); const accumNx = new Float32Array(pixelCount);
  const accumNy = new Float32Array(pixelCount); const accumNz = new Float32Array(pixelCount);
  const transmittance = new Float32Array(pixelCount).fill(1);
  const dominantWeight = new Float32Array(pixelCount); const dominantDepth = new Float32Array(pixelCount);
  const dominantNormal = new Float32Array(pixelCount * 3);
  const dominantGroup = new Int32Array(pixelCount).fill(-1);
  const groupIds = new Map<string, number>();

  for (let si = 0; si < projected.length; si++) {
    const p = projected[si];
    let gIdx = groupIds.get(p.semanticGroup);
    if (gIdx === undefined) { gIdx = groupIds.size; groupIds.set(p.semanticGroup, gIdx); }

    for (let py = p.minY; py <= p.maxY; py++) {
      const dy = py + 0.5 - p.v;
      const row = py * width;
      for (let px = p.minX; px <= p.maxX; px++) {
        const idx = row + px;
        const t = transmittance[idx];
        if (t < 0.004) continue;
        const dx = px + 0.5 - p.u;
        const power = -0.5 * (p.invA * dx * dx + 2 * p.invB * dx * dy + p.invC * dy * dy);
        if (power < -9) continue;
        const alpha = Math.min(0.99, p.opacity * Math.exp(power));
        if (alpha < 1 / 255) continue;

        const w = t * alpha;
        accumR[idx] += w * p.colorR; accumG[idx] += w * p.colorG; accumB[idx] += w * p.colorB;
        accumDepth[idx] += w * p.depth;
        accumNx[idx] += w * p.normalX; accumNy[idx] += w * p.normalY; accumNz[idx] += w * p.normalZ;
        transmittance[idx] = t * (1 - alpha);

        if (w > dominantWeight[idx]) {
          dominantWeight[idx] = w; dominantDepth[idx] = p.depth; dominantGroup[idx] = gIdx;
          const nOff = idx * 3;
          dominantNormal[nOff] = p.normalX; dominantNormal[nOff + 1] = p.normalY; dominantNormal[nOff + 2] = p.normalZ;
        }
      }
    }
  }

  const depthBufferF32 = new Float32Array(pixelCount); const alphaBufferF32 = new Float32Array(pixelCount);
  const normalXyzF32 = new Float32Array(pixelCount * 3); const celToneRgba = new Uint8ClampedArray(pixelCount * 4);
  let coveredPixelCount = 0; let minDepth = Infinity; let maxDepth = 0;

  for (let i = 0; i < pixelCount; i++) {
    const alphaSum = clamp01(1 - transmittance[i]);
    alphaBufferF32[i] = alphaSum;
    const cOff = i * 4; const nOff = i * 3;
    if (alphaSum < 0.05) {
      normalXyzF32[nOff + 2] = 1;
      celToneRgba[cOff] = bgColor[0]; celToneRgba[cOff + 1] = bgColor[1]; celToneRgba[cOff + 2] = bgColor[2]; celToneRgba[cOff + 3] = 255;
      continue;
    }

    coveredPixelCount++;
    const expDepth = accumDepth[i] / alphaSum;
    depthBufferF32[i] = expDepth;
    if (expDepth < minDepth) minDepth = expDepth;
    if (expDepth > maxDepth) maxDepth = expDepth;
    const [nx, ny, nz] = normalizeVec3(accumNx[i], accumNy[i], accumNz[i]);
    normalXyzF32[nOff] = nx; normalXyzF32[nOff + 1] = ny; normalXyzF32[nOff + 2] = nz;

    const rawR = clamp01(accumR[i] + (1 - alphaSum) * (bgColor[0] / 255));
    const rawG = clamp01(accumG[i] + (1 - alphaSum) * (bgColor[1] / 255));
    const rawB = clamp01(accumB[i] + (1 - alphaSum) * (bgColor[2] / 255));
    const luma = Math.max(1e-4, 0.2126 * rawR + 0.7152 * rawG + 0.0722 * rawB);
    const scale = clamp((Math.round(luma * (celLevels - 1)) / (celLevels - 1)) / luma, 0.25, 1.6);
    celToneRgba[cOff] = Math.round(clamp01(rawR * scale) * 255);
    celToneRgba[cOff + 1] = Math.round(clamp01(rawG * scale) * 255);
    celToneRgba[cOff + 2] = Math.round(clamp01(rawB * scale) * 255);
    celToneRgba[cOff + 3] = 255;
  }

  const lineArtMaskF32 = new Float32Array(pixelCount);
  const compositeComicRgba = new Uint8ClampedArray(celToneRgba);
  let lineArtPixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const a0 = alphaBufferF32[idx]; const d0 = depthBufferF32[idx]; const domD0 = dominantDepth[idx];
      const n0 = idx * 3;
      let maxEdge = 0;

      const neighbors = [x + 1 < width ? idx + 1 : -1, y + 1 < height ? idx + width : -1];
      for (let ni = 0; ni < neighbors.length; ni++) {
        const nIdx = neighbors[ni];
        if (nIdx < 0) continue;
        const a1 = alphaBufferF32[nIdx];
        if ((a0 >= 0.35 && a1 < 0.05) || (a1 >= 0.35 && a0 < 0.05)) { maxEdge = 1.0; continue; }
        if (a0 < 0.05 || a1 < 0.05) continue;

        const volRel = Math.abs(d0 - depthBufferF32[nIdx]) / Math.max(0.05, Math.min(d0, depthBufferF32[nIdx]));
        const domRel = domD0 > 0 && dominantDepth[nIdx] > 0
          ? Math.abs(domD0 - dominantDepth[nIdx]) / Math.max(0.05, Math.min(domD0, dominantDepth[nIdx]))
          : 0;
        const relDepth = Math.max(volRel, domRel);
        if (relDepth > depthThresh) maxEdge = Math.max(maxEdge, clamp01((relDepth - depthThresh) / (depthThresh * 1.5) + 0.55));

        const n1 = nIdx * 3;
        const volJump = 1 - clamp(normalXyzF32[n0] * normalXyzF32[n1] + normalXyzF32[n0 + 1] * normalXyzF32[n1 + 1] + normalXyzF32[n0 + 2] * normalXyzF32[n1 + 2], -1, 1);
        const domJump = dominantWeight[idx] > 0 && dominantWeight[nIdx] > 0
          ? 1 - clamp(dominantNormal[n0] * dominantNormal[n1] + dominantNormal[n0 + 1] * dominantNormal[n1 + 1] + dominantNormal[n0 + 2] * dominantNormal[n1 + 2], -1, 1)
          : 0;
        const normalJump = Math.max(volJump, domJump);
        if (normalJump > normalThresh) maxEdge = Math.max(maxEdge, clamp01((normalJump - normalThresh) / (1 - normalThresh + 1e-4) + 0.5));
        if (dominantGroup[idx] !== -1 && dominantGroup[nIdx] !== -1 && dominantGroup[idx] !== dominantGroup[nIdx]) maxEdge = Math.max(maxEdge, 0.85);
      }

      if (maxEdge > 0.01) {
        lineArtMaskF32[idx] = maxEdge;
        if (maxEdge >= 0.45) lineArtPixelCount++;
        const cOff = idx * 4;
        compositeComicRgba[cOff] = Math.round(celToneRgba[cOff] * (1 - maxEdge) + inkColor[0] * maxEdge);
        compositeComicRgba[cOff + 1] = Math.round(celToneRgba[cOff + 1] * (1 - maxEdge) + inkColor[1] * maxEdge);
        compositeComicRgba[cOff + 2] = Math.round(celToneRgba[cOff + 2] * (1 - maxEdge) + inkColor[2] * maxEdge);
      }
    }
  }

  return {
    width, height,
    renderedSplatCount: projected.length,
    culledSplatCount,
    sortedSplatIds,
    depthBufferF32, alphaBufferF32, normalXyzF32, lineArtMaskF32,
    celToneRgba, compositeComicRgba,
    stats: {
      coveredPixelCount, lineArtPixelCount,
      minDepth: coveredPixelCount > 0 ? minDepth : 0,
      maxDepth: coveredPixelCount > 0 ? maxDepth : 0,
      rasterMs: Math.max(0, nowMs() - t0),
    },
  };
}
