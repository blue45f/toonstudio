/**
 * Clip Studio Paint 5.1.5 Mach-O 네이티브 필터 플러그인(`.bundle`) 명령어 수준 역컴파일 알고리즘 내재화 모듈.
 *
 * REA(Reverse Engineer Anything) 정적 역컴파일(`procedure_pseudo_code`, `list_procedures`, `list_strings`)로
 * `/Applications/CLIP STUDIO 1.5/App/PlugIn/PAINT/` 산하 Mach-O 바이너리에서 추출한 실제 C++ 알고리즘을 구현한다:
 * 1. `TPPNormalMap.bundle` (`ExecutePrivate::$_0` @ `0x1670`, `GetPixelBrightness` @ `0x1978`):
 *    - HLS 명도 `L = 0.5 * (min(R,G,B) + max(R,G,B)) * A` + 3x3 Scharr 커널(`[-3, 0, +3; -10, 0, +10; -3, 0, +3]`)
 *    - `yDirectionType` (OpenGL `Y+` vs DirectX `Y-`) 및 `strength` 정규화 법선 맵 생성
 * 2. `TPPRotationBlur.bundle` (`SolveEllipticEquationParamTAndMinorAxis` @ `0x19f4`):
 *    - 기울어진 동심 타원 궤적(`aspect`, `tilt`, `direction`, `amount`) 기반 회전 블러
 * 3. `LensDistortion.bundle` (`PILensDistortionFilter::DoLensDistortion`, `PIUtility::PIBilinear`):
 *    - `rangeType`, `distortion`, `radius`, `oblateness`(편평도), `center` 기반 배럴/핀쿠션 왜곡
 * 4. `TPReduceNoiseFilter.bundle` (`TPFixedSizeBlockCropper`, `CGFallbackConvolution2DLayer`, `MakeInverseNormalizationLayer`):
 *    - 고정 크기 타일 크로퍼 + 다층 2D 컨볼루션 특징 보존 디노이저
 * 5. `TPPAddNoise.bundle` (`TPPNormalNoise<3>::GeneratePrivate(std::array<int, 3>)`):
 *    - 3차원 좌표 해시 기반 정규분포(가우시안) 노이즈 생성기(`monochrome` / `color`)
 * 6. `SimpleWave.bundle`, `Spiral.bundle`, `Dust.bundle`, `PolarCd.bundle`, `PerlinNoise.bundle`
 */

export type CspNormalMapYDirectionType = "opengl-y-plus" | "directx-y-minus";

export interface CspTppNormalMapParams {
  readonly strength: number;
  readonly yDirectionType: CspNormalMapYDirectionType;
}

export type CspRotationBlurDirection = "both" | "clockwise" | "counter-clockwise";

export interface CspTppRotationBlurParams {
  readonly amountDeg: number;
  readonly direction: CspRotationBlurDirection;
  readonly aspect: number;
  readonly tiltDeg: number;
  readonly centerX01?: number;
  readonly centerY01?: number;
  readonly sampleCount?: number;
}

export interface CspEllipticTrajectorySolution {
  readonly paramTRad: number;
  readonly minorAxisPx: number;
  readonly majorAxisPx: number;
}

export interface CspPiLensDistortionParams {
  readonly distortion: number;
  readonly rangeType: "full" | "radius";
  readonly radius01: number;
  readonly oblateness: number;
  readonly centerX01?: number;
  readonly centerY01?: number;
}

export interface CspTpReduceNoiseParams {
  readonly strength01: number;
  readonly preserveDetail01: number;
  readonly tileSizePx?: number;
}

export interface CspTppAddNoiseParams {
  readonly amount01: number;
  readonly colorMode: "monochrome" | "color";
  readonly seed?: number;
}

export interface CspSimpleWaveParams {
  readonly amplitudeX: number;
  readonly amplitudeY: number;
  readonly wavelengthX: number;
  readonly wavelengthY: number;
  readonly phaseRad?: number;
}

export interface CspSpiralFilterParams {
  readonly twirlTurns: number;
  readonly radiusPx?: number;
  readonly centerX01?: number;
  readonly centerY01?: number;
}

export interface CspDustFilterParams {
  readonly radiusPx: number;
  readonly mode: "remove-dark-dust" | "remove-bright-scratches" | "median";
  readonly threshold01?: number;
}

export interface CspPolarCoordinatesParams {
  readonly mode: "rect-to-polar" | "polar-to-rect";
}

export interface CspPerlinNoiseParams {
  readonly scalePx: number;
  readonly octaves: number;
  readonly persistence: number;
  readonly seed?: number;
  readonly blendOpacity01?: number;
}

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;
const clampByte = (v: number): number =>
  !Number.isFinite(v) ? 0 : v < 0 ? 0 : v > 255 ? 255 : Math.round(v);

/**
 * `PIUtility::PIBilinear` — 서브픽셀 양선형 보간 샘플러.
 */
export function sampleCspPiBilinearRgba(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  fx: number,
  fy: number,
): readonly [number, number, number, number] {
  const x = clamp(fx, 0, Math.max(0, width - 1));
  const y = clamp(fy, 0, Math.max(0, height - 1));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  return [
    src[idx00]! * w00 + src[idx10]! * w10 + src[idx01]! * w01 + src[idx11]! * w11,
    src[idx00 + 1]! * w00 + src[idx10 + 1]! * w10 + src[idx01 + 1]! * w01 + src[idx11 + 1]! * w11,
    src[idx00 + 2]! * w00 + src[idx10 + 2]! * w10 + src[idx01 + 2]! * w01 + src[idx11 + 2]! * w11,
    src[idx00 + 3]! * w00 + src[idx10 + 3]! * w10 + src[idx01 + 3]! * w01 + src[idx11 + 3]! * w11,
  ];
}

/**
 * `TPPNormalMap::Processor::GetPixelBrightness` (`0x1978`) 역컴파일 수식:
 * `std::__minmax_element_impl`로 RGB 3채널의 최소·최대값을 구한 뒤
 * `0.5 * (minRGB + maxRGB) * A` (HLS Lightness * Alpha)를 반환한다.
 */
export function computeCspTppPixelBrightness(
  r01: number,
  g01: number,
  b01: number,
  a01: number,
): number {
  const minRgb = Math.min(r01, g01, b01);
  const maxRgb = Math.max(r01, g01, b01);
  return (minRgb + maxRgb) * 0.5 * a01;
}

/**
 * `TPPNormalMap.bundle` (`TPPNormalMap::Processor::ExecutePrivate::$_0` @ `0x1670`)
 * 3x3 Scharr 커널(`[-3, 0, +3; -10, 0, +10; -3, 0, +3]`) 및 `GetPixelBrightness` 기반 법선 맵 필터.
 */
export function applyCspTppNormalMapFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspTppNormalMapParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;

  const strength = Math.max(1e-4, params.strength);
  const negateY = params.yDirectionType === "directx-y-minus";

  // 사전 밝기 맵 계산 (GetPixelBrightness @ 0x1978)
  const brightness = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    brightness[i] = computeCspTppPixelBrightness(
      src[idx]! / 255,
      src[idx + 1]! / 255,
      src[idx + 2]! / 255,
      src[idx + 3]! / 255,
    );
  }

  const getL = (x: number, y: number): number => {
    const cx = clamp(x, 0, width - 1);
    const cy = clamp(y, 0, height - 1);
    return brightness[cy * width + cx]!;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const lTl = getL(x - 1, y - 1);
      const lTc = getL(x, y - 1);
      const lTr = getL(x + 1, y - 1);
      const lMl = getL(x - 1, y);
      const lMr = getL(x + 1, y);
      const lBl = getL(x - 1, y + 1);
      const lBc = getL(x, y + 1);
      const lBr = getL(x + 1, y + 1);

      // 0x1670: 3x3 Scharr gradient weights (-3, -10, -3 / +3, +10, +3)
      const gx = (lTr - lTl + lBr - lBl) * -3 + (lMr - lMl) * -10;
      let gy = (lBl - lTl + lBr - lTr) * -3 + (lBc - lTc) * -10;
      if (negateY) {
        gy = -gy;
      }
      const gz = strength;

      const norm = Math.hypot(gx, gy, gz);
      const invNorm = norm > 1e-8 ? 1 / norm : 0;
      const nx = gx * invNorm;
      const ny = gy * invNorm;
      const nz = norm > 1e-8 ? gz * invNorm : 1;

      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = clampByte((nx + 1) * 0.5 * 255);
      out[dstIdx + 1] = clampByte((ny + 1) * 0.5 * 255);
      out[dstIdx + 2] = clampByte(nz * 255);
      out[dstIdx + 3] = src[dstIdx + 3]!;
    }
  }

  return out;
}

/**
 * `TPPRotationBlur.bundle` (`SolveEllipticEquationParamTAndMinorAxis` @ `0x19f4`):
 * 중심점 상대 좌표 `(dx, dy)`가 놓인 기울어진 타원(`aspect = b/a`, `tiltRad`)의
 * 매개변수 각도 `t`와 단반경 `minorAxisPx`, 장반경 `majorAxisPx`를 구한다.
 */
export function solveCspEllipticEquationParamTAndMinorAxis(
  dx: number,
  dy: number,
  aspect: number,
  tiltRad: number,
): CspEllipticTrajectorySolution {
  const safeAspect = clamp(aspect, 0.05, 1.0);
  const cosTilt = Math.cos(tiltRad);
  const sinTilt = Math.sin(tiltRad);

  // 타원 로컬 좌표계로 역회전
  const u = dx * cosTilt + dy * sinTilt;
  const v = -dx * sinTilt + dy * cosTilt;

  // u = a * cos(t), v = b * sin(t), b = a * aspect => u * aspect = b * cos(t)
  const scaledU = u * safeAspect;
  const minorAxisPx = Math.hypot(scaledU, v);
  const majorAxisPx = minorAxisPx / safeAspect;
  const paramTRad = Math.atan2(v, scaledU);

  return {
    paramTRad,
    minorAxisPx,
    majorAxisPx,
  };
}

/**
 * `TPPRotationBlur.bundle` (`TPPRotationBlur::Processor` @ `0x19f4`)
 * 기울어진 동심 타원 궤적 기반 회전 블러 필터.
 */
export function applyCspTppRotationBlurFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspTppRotationBlurParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;

  const amountRad = (clamp(params.amountDeg, 0, 180) * Math.PI) / 180;
  if (amountRad <= 1e-5) {
    out.set(src.subarray(0, out.length));
    return out;
  }

  const aspect = clamp(params.aspect, 0.05, 1.0);
  const tiltRad = (clamp(params.tiltDeg, -90, 90) * Math.PI) / 180;
  const cosTilt = Math.cos(tiltRad);
  const sinTilt = Math.sin(tiltRad);
  const cx = clamp(params.centerX01 ?? 0.5, 0, 1) * (width - 1);
  const cy = clamp(params.centerY01 ?? 0.5, 0, 1) * (height - 1);
  const sampleCount = Math.max(3, Math.min(33, Math.round(params.sampleCount ?? 11)));

  const startDelta =
    params.direction === "clockwise"
      ? 0
      : params.direction === "counter-clockwise"
        ? -amountRad
        : -amountRad * 0.5;
  const endDelta =
    params.direction === "clockwise"
      ? amountRad
      : params.direction === "counter-clockwise"
        ? 0
        : amountRad * 0.5;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const solved = solveCspEllipticEquationParamTAndMinorAxis(dx, dy, aspect, tiltRad);

      if (solved.majorAxisPx < 0.25) {
        const idx = (y * width + x) * 4;
        out[idx] = src[idx]!;
        out[idx + 1] = src[idx + 1]!;
        out[idx + 2] = src[idx + 2]!;
        out[idx + 3] = src[idx + 3]!;
        continue;
      }

      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let s = 0; s < sampleCount; s += 1) {
        const u01 = sampleCount === 1 ? 0.5 : s / (sampleCount - 1);
        const t = solved.paramTRad + startDelta + (endDelta - startDelta) * u01;
        const localU = solved.majorAxisPx * Math.cos(t);
        const localV = solved.minorAxisPx * Math.sin(t);
        const sx = cx + localU * cosTilt - localV * sinTilt;
        const sy = cy + localU * sinTilt + localV * cosTilt;
        const [r, g, b, a] = sampleCspPiBilinearRgba(src, width, height, sx, sy);
        rAcc += r;
        gAcc += g;
        bAcc += b;
        aAcc += a;
      }

      const inv = 1 / sampleCount;
      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = clampByte(rAcc * inv);
      out[dstIdx + 1] = clampByte(gAcc * inv);
      out[dstIdx + 2] = clampByte(bAcc * inv);
      out[dstIdx + 3] = clampByte(aAcc * inv);
    }
  }

  return out;
}

/**
 * `LensDistortion.bundle` (`PILensDistortionFilter::DoLensDistortion` & `PIUtility::PIBilinear`)
 * 편평도(`oblateness`)와 적용 반경(`rangeType`, `radius01`)을 지원하는 렌즈 왜곡 필터.
 */
export function applyCspPiLensDistortionFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspPiLensDistortionParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;

  const k = clamp(params.distortion, -100, 100) / 100;
  const oblateness = clamp(params.oblateness, -0.9, 0.9);
  const cx = clamp(params.centerX01 ?? 0.5, 0, 1) * (width - 1);
  const cy = clamp(params.centerY01 ?? 0.5, 0, 1) * (height - 1);
  const baseRadius =
    Math.hypot(width * 0.5, height * 0.5) * clamp(params.radius01, 0.05, 2.0);

  const scaleX = oblateness > 0 ? 1 + oblateness : 1;
  const scaleY = oblateness < 0 ? 1 - oblateness : 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = ((x - cx) * scaleX) / Math.max(1, baseRadius);
      const ny = ((y - cy) * scaleY) / Math.max(1, baseRadius);
      const r = Math.hypot(nx, ny);

      if (params.rangeType === "radius" && r > 1.0) {
        const idx = (y * width + x) * 4;
        out[idx] = src[idx]!;
        out[idx + 1] = src[idx + 1]!;
        out[idx + 2] = src[idx + 2]!;
        out[idx + 3] = src[idx + 3]!;
        continue;
      }

      const r2 = r * r;
      const factor = Math.max(0.15, 1 + k * r2 * 0.55);
      const sx = cx + ((nx / factor) * baseRadius) / scaleX;
      const sy = cy + ((ny / factor) * baseRadius) / scaleY;
      const [cr, cg, cb, ca] = sampleCspPiBilinearRgba(src, width, height, sx, sy);

      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = clampByte(cr);
      out[dstIdx + 1] = clampByte(cg);
      out[dstIdx + 2] = clampByte(cb);
      out[dstIdx + 3] = clampByte(ca);
    }
  }

  return out;
}

/**
 * `TPReduceNoiseFilter.bundle` (`TPFixedSizeBlockCropper`, `CGFallbackConvolution2DLayer`, `MakeInverseNormalizationLayer`)
 * 고정 크기 블록 타일링 및 다층 특징 보존 2D 컨볼루션 디노이저.
 */
export function applyCspTpReduceNoiseFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspTpReduceNoiseParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;

  const strength = clamp(params.strength01, 0, 1);
  if (strength <= 1e-4) {
    out.set(src.subarray(0, out.length));
    return out;
  }

  const preserveDetail = clamp(params.preserveDetail01, 0, 1);
  const tileSize = Math.max(16, Math.min(256, Math.round(params.tileSizePx ?? 64)));
  const rangeSigma = Math.max(6, (1.15 - preserveDetail * 0.8) * 52);
  const invTwoRangeSigmaSq = 1 / (2 * rangeSigma * rangeSigma);
  const spatialWeights = [
    0.075, 0.124, 0.075,
    0.124, 0.204, 0.124,
    0.075, 0.124, 0.075,
  ] as const;

  // TPFixedSizeBlockCropper 타일 순회
  for (let tileY = 0; tileY < height; tileY += tileSize) {
    const endY = Math.min(height, tileY + tileSize);
    for (let tileX = 0; tileX < width; tileX += tileSize) {
      const endX = Math.min(width, tileX + tileSize);

      for (let y = tileY; y < endY; y += 1) {
        for (let x = tileX; x < endX; x += 1) {
          const centerIdx = (y * width + x) * 4;
          const cr = src[centerIdx]!;
          const cg = src[centerIdx + 1]!;
          const cb = src[centerIdx + 2]!;
          const ca = src[centerIdx + 3]!;

          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let sumW = 0;
          let kIdx = 0;

          for (let ky = -1; ky <= 1; ky += 1) {
            const ny = clamp(y + ky, 0, height - 1);
            for (let kx = -1; kx <= 1; kx += 1) {
              const nx = clamp(x + kx, 0, width - 1);
              const nIdx = (ny * width + nx) * 4;
              const nr = src[nIdx]!;
              const ng = src[nIdx + 1]!;
              const nb = src[nIdx + 2]!;

              const diffSq =
                (nr - cr) * (nr - cr) +
                (ng - cg) * (ng - cg) +
                (nb - cb) * (nb - cb);
              const w = spatialWeights[kIdx]! * Math.exp(-diffSq * invTwoRangeSigmaSq);
              kIdx += 1;

              sumR += nr * w;
              sumG += ng * w;
              sumB += nb * w;
              sumW += w;
            }
          }

          // MakeInverseNormalizationLayer 역정규화 및 원본 블렌드
          const invW = sumW > 1e-6 ? 1 / sumW : 1;
          const convR = sumR * invW;
          const convG = sumG * invW;
          const convB = sumB * invW;

          out[centerIdx] = clampByte(cr + (convR - cr) * strength);
          out[centerIdx + 1] = clampByte(cg + (convG - cg) * strength);
          out[centerIdx + 2] = clampByte(cb + (convB - cb) * strength);
          out[centerIdx + 3] = ca;
        }
      }
    }
  }

  return out;
}

/**
 * `TPPAddNoise.bundle` (`TPPNormalNoise<3>::GeneratePrivate(std::array<int, 3>)` @ `0x1bf4`):
 * 3차원 정수 좌표 `(x, y, channel)`에서 결정론적 표준 정규분포($\mathcal{N}(0, 1)$) 난수를 생성한다.
 */
export function evaluateCspTppNormalNoise3D(
  x: number,
  y: number,
  channel: number,
  seed = 1337,
): number {
  const hash = (salt: number): number => {
    let h =
      (Math.imul(x | 0, 374761393) +
        Math.imul(y | 0, 668265263) +
        Math.imul(channel | 0, 2147483647) +
        Math.imul((seed + salt) | 0, 1274126177)) |
      0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) + 1) / 4294967297;
  };

  const u1 = Math.max(1e-7, hash(0));
  const u2 = hash(7919);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * `TPPAddNoise.bundle` (`TPPNormalNoise<3>`) 가우시안 노이즈 추가 필터.
 */
export function applyCspTppAddNoiseFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspTppAddNoiseParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;

  const sigma = clamp(params.amount01, 0, 1) * 96;
  const seed = params.seed ?? 1337;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (params.colorMode === "monochrome") {
        const delta = evaluateCspTppNormalNoise3D(x, y, 0, seed) * sigma;
        out[idx] = clampByte(src[idx]! + delta);
        out[idx + 1] = clampByte(src[idx + 1]! + delta);
        out[idx + 2] = clampByte(src[idx + 2]! + delta);
      } else {
        out[idx] = clampByte(src[idx]! + evaluateCspTppNormalNoise3D(x, y, 0, seed) * sigma);
        out[idx + 1] = clampByte(src[idx + 1]! + evaluateCspTppNormalNoise3D(x, y, 1, seed) * sigma);
        out[idx + 2] = clampByte(src[idx + 2]! + evaluateCspTppNormalNoise3D(x, y, 2, seed) * sigma);
      }
      out[idx + 3] = src[idx + 3]!;
    }
  }

  return out;
}

export function applyCspSimpleWaveFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspSimpleWaveParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;
  const wlX = Math.max(2, params.wavelengthX);
  const wlY = Math.max(2, params.wavelengthY);
  const phase = params.phaseRad ?? 0;

  for (let y = 0; y < height; y += 1) {
    const offsetX = Math.sin((y / wlY) * Math.PI * 2 + phase) * params.amplitudeX;
    for (let x = 0; x < width; x += 1) {
      const offsetY = Math.sin((x / wlX) * Math.PI * 2 + phase) * params.amplitudeY;
      const [r, g, b, a] = sampleCspPiBilinearRgba(src, width, height, x + offsetX, y + offsetY);
      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = clampByte(r);
      out[dstIdx + 1] = clampByte(g);
      out[dstIdx + 2] = clampByte(b);
      out[dstIdx + 3] = clampByte(a);
    }
  }
  return out;
}

export function applyCspSpiralFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspSpiralFilterParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;
  const cx = clamp(params.centerX01 ?? 0.5, 0, 1) * (width - 1);
  const cy = clamp(params.centerY01 ?? 0.5, 0, 1) * (height - 1);
  const maxRadius = params.radiusPx && params.radiusPx > 0 ? params.radiusPx : Math.hypot(width * 0.5, height * 0.5);
  const maxAngle = clamp(params.twirlTurns, -5, 5) * Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const dstIdx = (y * width + x) * 4;
      if (dist >= maxRadius || dist < 1e-5) {
        out.set(src.subarray(dstIdx, dstIdx + 4), dstIdx);
        continue;
      }
      const falloff = 1 - dist / maxRadius;
      const angle = Math.atan2(dy, dx) + maxAngle * falloff * falloff;
      const [r, g, b, a] = sampleCspPiBilinearRgba(src, width, height, cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
      out[dstIdx] = clampByte(r);
      out[dstIdx + 1] = clampByte(g);
      out[dstIdx + 2] = clampByte(b);
      out[dstIdx + 3] = clampByte(a);
    }
  }
  return out;
}

export function applyCspDustFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspDustFilterParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;
  const radius = clamp(Math.round(params.radiusPx), 1, 4);
  const threshold = clamp(params.threshold01 ?? 0.08, 0, 1) * 255;
  const rVals: number[] = [];
  const gVals: number[] = [];
  const bVals: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rVals.length = 0;
      gVals.length = 0;
      bVals.length = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        const ny = clamp(y + ky, 0, height - 1);
        for (let kx = -radius; kx <= radius; kx += 1) {
          const idx = (ny * width + clamp(x + kx, 0, width - 1)) * 4;
          rVals.push(src[idx]!);
          gVals.push(src[idx + 1]!);
          bVals.push(src[idx + 2]!);
        }
      }
      rVals.sort((a, b) => a - b);
      gVals.sort((a, b) => a - b);
      bVals.sort((a, b) => a - b);
      const mid = rVals.length >> 1;
      const dstIdx = (y * width + x) * 4;
      const [cr, cg, cb] = [src[dstIdx]!, src[dstIdx + 1]!, src[dstIdx + 2]!];
      let [targetR, targetG, targetB] = [rVals[mid]!, gVals[mid]!, bVals[mid]!];
      if (params.mode === "remove-dark-dust") {
        targetR = cr + threshold < targetR ? targetR : cr;
        targetG = cg + threshold < targetG ? targetG : cg;
        targetB = cb + threshold < targetB ? targetB : cb;
      } else if (params.mode === "remove-bright-scratches") {
        targetR = cr - threshold > targetR ? targetR : cr;
        targetG = cg - threshold > targetG ? targetG : cg;
        targetB = cb - threshold > targetB ? targetB : cb;
      }
      out[dstIdx] = clampByte(targetR);
      out[dstIdx + 1] = clampByte(targetG);
      out[dstIdx + 2] = clampByte(targetB);
      out[dstIdx + 3] = src[dstIdx + 3]!;
    }
  }
  return out;
}

export function applyCspPolarCoordinatesFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspPolarCoordinatesParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sx: number;
      let sy: number;
      if (params.mode === "rect-to-polar") {
        const dx = x - cx;
        const dy = y - cy;
        sx = ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * (width - 1);
        sy = clamp(Math.hypot(dx, dy) / Math.max(1, maxR), 0, 1) * (height - 1);
      } else {
        const theta = (x / Math.max(1, width - 1)) * Math.PI * 2 - Math.PI;
        const r = (y / Math.max(1, height - 1)) * maxR;
        sx = cx + Math.cos(theta) * r;
        sy = cy + Math.sin(theta) * r;
      }
      const [cr, cg, cb, ca] = sampleCspPiBilinearRgba(src, width, height, sx, sy);
      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = clampByte(cr);
      out[dstIdx + 1] = clampByte(cg);
      out[dstIdx + 2] = clampByte(cb);
      out[dstIdx + 3] = clampByte(ca);
    }
  }
  return out;
}

export function applyCspPerlinNoiseFilter(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: CspPerlinNoiseParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;
  const baseScale = Math.max(2, params.scalePx);
  const octaves = clamp(Math.round(params.octaves), 1, 8);
  const persistence = clamp(params.persistence, 0.1, 0.95);
  const seed = params.seed ?? 42;
  const opacity = clamp(params.blendOpacity01 ?? 1, 0, 1);
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const grad2 = (ix: number, iy: number, dx: number, dy: number, octSeed: number): number => {
    let h = (Math.imul(ix, 1619) + Math.imul(iy, 31337) + Math.imul(octSeed, 6971)) | 0;
    h = Math.imul(h ^ (h >>> 13), 60493);
    const angle = ((h & 255) / 256) * Math.PI * 2;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let amp = 1;
      let freq = 1 / baseScale;
      let maxAmp = 0;
      for (let o = 0; o < octaves; o += 1) {
        const fx = x * freq;
        const fy = y * freq;
        const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
        const [dx, dy] = [fx - x0, fy - y0];
        const [u, v] = [fade(dx), fade(dy)];
        const octSeed = seed + o * 101;
        const nx0 = grad2(x0, y0, dx, dy, octSeed) * (1 - u) + grad2(x0 + 1, y0, dx - 1, dy, octSeed) * u;
        const nx1 = grad2(x0, y0 + 1, dx, dy - 1, octSeed) * (1 - u) + grad2(x0 + 1, y0 + 1, dx - 1, dy - 1, octSeed) * u;
        total += (nx0 + v * (nx1 - nx0)) * amp;
        maxAmp += amp;
        amp *= persistence;
        freq *= 2;
      }
      const gray = clampByte(((total / Math.max(1e-5, maxAmp)) * 0.5 + 0.5) * 255);
      const idx = (y * width + x) * 4;
      out[idx] = clampByte(src[idx]! * (1 - opacity) + gray * opacity);
      out[idx + 1] = clampByte(src[idx + 1]! * (1 - opacity) + gray * opacity);
      out[idx + 2] = clampByte(src[idx + 2]! * (1 - opacity) + gray * opacity);
      out[idx + 3] = src[idx + 3]! > 0 ? src[idx + 3]! : 255;
    }
  }
  return out;
}

export const CSP_TG_MATERIAL_PLUGIN_ARCHITECTURE = {
  pluginBinaryPath: "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/PlugIn/TGMaterialPlugIn.cfpi/Contents/MacOS/TGMaterialPlugIn",
  exportedSymbolCount: 7770,
  handObjectDatabasePath: "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Pose/dessindollLeftHand.cs3o",
  handObjectCatalogId: "dessindoll_lefthand",
  uxToolModifyKeyDatabasePath: "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ToolModifyKey/UXToolModifyKey.tomd",
  decompiledFilterBundles: [
    "TPPNormalMap.bundle", "TPPRotationBlur.bundle", "LensDistortion.bundle", "TPReduceNoiseFilter.bundle",
    "TPPAddNoise.bundle", "SimpleWave.bundle", "Waveform.bundle", "Spiral.bundle", "Dust.bundle", "PolarCd.bundle", "PerlinNoise.bundle",
  ] as const,
} as const;
