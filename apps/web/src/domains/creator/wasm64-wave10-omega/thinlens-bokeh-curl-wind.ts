/**
 * 얇은 렌즈(Thin-Lens) 조리개·아나모픽 보케 카메라 시뮬레이터 및
 * 무발산(∇ · v = 0) 2D/3D 컬 노이즈(Curl-Noise) 바람장 조각기.
 *
 * - 외부 서버 호출 0회(₩0), 모든 연산을 클라이언트 단일 패스 결정론 수식으로 수행한다.
 * - `CoC = |S2 - S1| / S2 * (f^2 / (N * (S1 - f)))` 물리 착란원 공식으로 깊이별 블러 반경을
 *   정밀 계산하고, 다각형 조리개 날·2x 아나모픽 타원 커널과 전경 번짐 차단(Foreground Bleed Guard)을 결합한다.
 * - C^3 연속 7차 스무스스텝 격자 퍼텐셜과 아티스트 가이드 스트로크 쌍극자 퍼텐셜의 해석적 회전(∇ × ψ)을
 *   구해, 망토·리본·장발 가닥이 압축이나 뭉침 없이 비압축성 유체 흐름을 따라 자연스럽게 흩날리게 한다.
 */

export const FULL_FRAME_SENSOR_WIDTH_MM = 36;
export const FULL_FRAME_SENSOR_HEIGHT_MM = 24;
export const DEFAULT_ACCEPTABLE_COC_MM = 0.03;
export const DEFAULT_MAX_COC_RADIUS_PX = 24;
export const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

export type ThinLensPresetId = "prime-35mm-f1.4" | "portrait-85mm-f1.2" | "anamorphic-50mm-2x-t2";
export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];

export interface ThinLensCameraConfig {
  readonly presetId?: ThinLensPresetId | "custom"; readonly labelKo: string;
  readonly focalLengthMm: number; readonly fStop: number; readonly focusDistanceM: number;
  readonly sensorWidthMm?: number; readonly sensorHeightMm?: number;
  readonly anamorphicSqueeze?: number; readonly apertureBladeCount?: number;
  readonly bladeCurvature?: number; readonly bladeRotationRad?: number; readonly opticalRimBoost?: number;
}

export interface DepthSampleCoCResult {
  readonly sampleDepthM: number; readonly focusDistanceM: number;
  readonly cocMm: number; readonly signedCocMm: number;
  readonly cocDiameterPx: number; readonly cocRadiusPx: number;
  readonly cocRadiusXPx: number; readonly cocRadiusYPx: number;
  readonly depthZone: "foreground" | "in-focus" | "background";
  readonly hyperfocalDistanceM: number; readonly dofNearM: number; readonly dofFarM: number;
}

export interface BokehKernelTap {
  readonly offsetX: number; readonly offsetY: number; readonly weight: number;
}

export interface BokehGatherOptions {
  readonly width: number; readonly height: number;
  readonly rgbaLinear: Float32Array; readonly depthMeters: Float32Array;
  readonly camera: ThinLensCameraConfig;
  readonly kernelSampleCount?: number; readonly maxCocRadiusPx?: number;
  readonly foregroundDepthGuardM?: number; readonly specularHighlightGain?: number;
}

export interface BokehGatherResult {
  readonly width: number; readonly height: number;
  readonly outputRgbaLinear: Float32Array; readonly perPixelCocRadiusPx: Float32Array;
  readonly kernelTaps: readonly BokehKernelTap[];
  readonly maxObservedCocRadiusPx: number; readonly foregroundBleedRejectedTaps: number;
  readonly serverCostKrw: 0;
}

export interface WindGuideStroke2D {
  readonly id: string; readonly points: readonly Vec2Tuple[];
  readonly strength: number; readonly falloffRadius: number;
}

export interface WindGuideStroke3D {
  readonly id: string; readonly points: readonly Vec3Tuple[];
  readonly strength: number; readonly falloffRadius: number;
}

export interface CurlWindFieldConfig {
  readonly seed?: number; readonly baseFrequency?: number; readonly octaves?: number;
  readonly lacunarity?: number; readonly gain?: number;
  readonly amplitude?: number; readonly timeScale?: number;
}

export interface DivergenceAuditSummary {
  readonly sampleCount: number; readonly maxAbsDivergence: number;
  readonly meanAbsDivergence: number; readonly meanSpeed: number; readonly isDivergenceFree: boolean;
}

export interface AerodynamicStrandConfig {
  readonly restPoints: readonly Vec3Tuple[]; readonly windConfig: CurlWindFieldConfig;
  readonly guideStrokes3D?: readonly WindGuideStroke3D[];
  readonly dtSeconds?: number; readonly stepCount?: number; readonly dragCoefficient?: number;
  readonly gravity?: Vec3Tuple; readonly constraintIterations?: number;
  readonly velocityDamping?: number; readonly startTimeSeconds?: number;
}

export interface AerodynamicStrandResult {
  readonly positions: readonly Vec3Tuple[]; readonly velocities: readonly Vec3Tuple[];
  readonly restSegmentLengths: readonly number[];
  readonly maxLengthErrorRatio: number; readonly tipDisplacement: number;
  readonly kineticEnergy: number; readonly serverCostKrw: 0;
}

/** 대표 시네마·단렌즈 프리셋 카탈로그. */
export const THIN_LENS_CAMERA_PRESETS: Readonly<Record<ThinLensPresetId, ThinLensCameraConfig>> =
  Object.freeze({
    "prime-35mm-f1.4": Object.freeze({
      presetId: "prime-35mm-f1.4", labelKo: "35mm f/1.4 광각 단렌즈",
      focalLengthMm: 35, fStop: 1.4, focusDistanceM: 1.8,
      sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM, sensorHeightMm: FULL_FRAME_SENSOR_HEIGHT_MM,
      anamorphicSqueeze: 1.0, apertureBladeCount: 9, bladeCurvature: 0.35, bladeRotationRad: 0.18, opticalRimBoost: 0.15,
    }),
    "portrait-85mm-f1.2": Object.freeze({
      presetId: "portrait-85mm-f1.2", labelKo: "85mm f/1.2 인물 단렌즈",
      focalLengthMm: 85, fStop: 1.2, focusDistanceM: 2.2,
      sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM, sensorHeightMm: FULL_FRAME_SENSOR_HEIGHT_MM,
      anamorphicSqueeze: 1.0, apertureBladeCount: 8, bladeCurvature: 0.6, bladeRotationRad: 0.12, opticalRimBoost: 0.22,
    }),
    "anamorphic-50mm-2x-t2": Object.freeze({
      presetId: "anamorphic-50mm-2x-t2", labelKo: "50mm 2x 아나모픽 시네마",
      focalLengthMm: 50, fStop: 2.0, focusDistanceM: 2.5,
      sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM, sensorHeightMm: FULL_FRAME_SENSOR_HEIGHT_MM,
      anamorphicSqueeze: 2.0, apertureBladeCount: 0, bladeCurvature: 1.0, bladeRotationRad: 0, opticalRimBoost: 0.28,
    }),
  });

/** WebGPU 얇은 렌즈 + 아나모픽 전경 번짐 차단 게더 셰이더 스니펫. */
export const WGSL_THIN_LENS_BOKEH_GATHER = /* wgsl */ `
struct ThinLensUniforms {
  focal_mm: f32, f_stop: f32, focus_mm: f32, sensor_width_mm: f32,
  anamorphic_squeeze: f32, max_coc_radius_px: f32, depth_guard_mm: f32, tap_count: u32,
};
fn thin_lens_coc_mm(sample_mm: f32, u: ThinLensUniforms) -> f32 {
  let s1 = max(u.focus_mm, u.focal_mm + 1.0);
  let s2 = max(sample_mm, 1.0);
  return (abs(s2 - s1) / s2) * ((u.focal_mm * u.focal_mm) / max(u.f_stop * (s1 - u.focal_mm), 1e-4));
}
`;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * 얇은 렌즈 방정식 `CoC = |S2 - S1| / S2 * (f^2 / (N * (S1 - f)))`으로
 * 깊이 샘플 S2의 센서 착란원(mm)과 뷰포트 픽셀 반경·피사계 심도 범위를 계산한다.
 */
export function computeThinLensCoC(
  sampleDepthM: number,
  camera: ThinLensCameraConfig,
  viewportWidthPx = 1920,
  maxCocRadiusPx = DEFAULT_MAX_COC_RADIUS_PX,
  acceptableCocMm = DEFAULT_ACCEPTABLE_COC_MM,
): DepthSampleCoCResult {
  const fMm = Math.max(1e-3, camera.focalLengthMm);
  const fStop = Math.max(0.5, camera.fStop);
  const sensorWidthMm = Math.max(1, camera.sensorWidthMm ?? FULL_FRAME_SENSOR_WIDTH_MM);
  const squeeze = Math.max(0.25, camera.anamorphicSqueeze ?? 1.0);
  const s1Mm = Math.max(fMm + 1, camera.focusDistanceM * 1000);
  const s2Mm = Math.max(1, sampleDepthM * 1000);

  const deltaMm = s2Mm - s1Mm;
  const apertureFactorMm = (fMm * fMm) / (fStop * (s1Mm - fMm));
  const cocMm = (Math.abs(deltaMm) / s2Mm) * apertureFactorMm;
  const signedCocMm = (deltaMm / s2Mm) * apertureFactorMm;
  const cocDiameterPx = (cocMm / sensorWidthMm) * Math.max(1, viewportWidthPx);
  const cocRadiusPx = Math.min(Math.max(0, maxCocRadiusPx), 0.5 * cocDiameterPx);

  const hyperfocalMm = fMm + (fMm * fMm) / (fStop * Math.max(1e-4, acceptableCocMm));
  const dofNearMm = (hyperfocalMm * s1Mm) / (hyperfocalMm + (s1Mm - fMm));
  const dofFarMm =
    s1Mm >= hyperfocalMm ? Number.POSITIVE_INFINITY : (hyperfocalMm * s1Mm) / (hyperfocalMm - (s1Mm - fMm));
  const depthZone = cocRadiusPx < 0.25 ? "in-focus" : deltaMm < 0 ? "foreground" : "background";

  return {
    sampleDepthM: s2Mm / 1000, focusDistanceM: s1Mm / 1000, cocMm, signedCocMm,
    cocDiameterPx, cocRadiusPx, cocRadiusXPx: cocRadiusPx / squeeze, cocRadiusYPx: cocRadiusPx,
    depthZone, hyperfocalDistanceM: hyperfocalMm / 1000, dofNearM: dofNearMm / 1000,
    dofFarM: Number.isFinite(dofFarMm) ? dofFarMm / 1000 : Number.POSITIVE_INFINITY,
  };
}

/** 주어진 방향각 θ에서 정다각형 조리개 날의 정규화 반경 경계 [cos(π/K), 1]을 구한다. */
export function evaluateAperturePolygonRadius(
  angleRad: number,
  bladeCount: number,
  bladeCurvature = 0.35,
  bladeRotationRad = 0,
): number {
  const roundedBlades = Math.floor(bladeCount);
  if (roundedBlades < 3) return 1.0;
  const sectorAngle = (2 * Math.PI) / roundedBlades;
  const halfSector = 0.5 * sectorAngle;
  let shifted = (angleRad - bladeRotationRad) % sectorAngle;
  if (shifted < 0) shifted += sectorAngle;
  const flatPolyRadius = Math.cos(halfSector) / Math.max(1e-6, Math.cos(shifted - halfSector));
  const curvature = clamp(bladeCurvature, 0, 1);
  return flatPolyRadius * (1 - curvature) + curvature;
}

/** 골든 앵글 나선 분포로 다각형 조리개 및 2x 아나모픽 타원 보케 커널 탭을 생성한다. */
export function generateBokehKernelSamples(
  camera: ThinLensCameraConfig,
  sampleCount = 48,
): readonly BokehKernelTap[] {
  const count = clamp(Math.floor(sampleCount), 1, 256);
  if (count === 1) return Object.freeze([{ offsetX: 0, offsetY: 0, weight: 1 }]);

  const squeeze = Math.max(0.25, camera.anamorphicSqueeze ?? 1.0);
  const blades = camera.apertureBladeCount ?? 0;
  const curvature = camera.bladeCurvature ?? 0.35;
  const rotation = camera.bladeRotationRad ?? 0;
  const rimBoost = clamp(camera.opticalRimBoost ?? 0, 0, 2);

  const rawTaps: Array<{ offsetX: number; offsetY: number; weight: number }> = [];
  let weightSum = 0;
  for (let i = 0; i < count; i += 1) {
    const unitR = i === 0 ? 0 : Math.sqrt((i + 0.5) / count);
    const theta = i * GOLDEN_ANGLE_RAD;
    const radial = unitR * evaluateAperturePolygonRadius(theta, blades, curvature, rotation);
    const weight = 1 + rimBoost * unitR * unitR;
    rawTaps.push({ offsetX: (Math.cos(theta) * radial) / squeeze, offsetY: Math.sin(theta) * radial, weight });
    weightSum += weight;
  }

  const invWeight = weightSum > 0 ? 1 / weightSum : 1 / count;
  return Object.freeze(
    rawTaps.map((t) => Object.freeze({ offsetX: t.offsetX, offsetY: t.offsetY, weight: t.weight * invWeight })),
  );
}

/**
 * 깊이 버퍼와 선형 RGBA 이미지에 얇은 렌즈 보케 게더 및 전경 번짐 차단 패스를 수행한다.
 * 초점면 근처의 선명한 전경 피사체가 흐린 배경 픽셀의 커널에 섞여 고스트가 번지는 현상을 차단한다.
 */
export function renderThinLensBokehPass(options: BokehGatherOptions): BokehGatherResult {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const pixelCount = width * height;
  if (options.rgbaLinear.length < pixelCount * 4) throw new RangeError("선형 RGBA 버퍼 길이가 해상도보다 작습니다.");
  if (options.depthMeters.length < pixelCount) throw new RangeError("깊이 버퍼 길이가 해상도보다 작습니다.");

  const maxCocRadiusPx = Math.max(0, options.maxCocRadiusPx ?? DEFAULT_MAX_COC_RADIUS_PX);
  const depthGuardM = Math.max(1e-4, options.foregroundDepthGuardM ?? 0.08);
  const highlightGain = clamp(options.specularHighlightGain ?? 1.0, 0, 4);
  const kernelTaps = generateBokehKernelSamples(options.camera, options.kernelSampleCount ?? 48);

  const perPixelCocRadiusPx = new Float32Array(pixelCount);
  const signedCocMmArray = new Float32Array(pixelCount);
  let maxObservedCocRadiusPx = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const coc = computeThinLensCoC(options.depthMeters[i]!, options.camera, width, maxCocRadiusPx);
    perPixelCocRadiusPx[i] = coc.cocRadiusPx;
    signedCocMmArray[i] = coc.signedCocMm;
    if (coc.cocRadiusPx > maxObservedCocRadiusPx) maxObservedCocRadiusPx = coc.cocRadiusPx;
  }

  const tileSize = 8;
  const tileCols = Math.ceil(width / tileSize);
  const tileRows = Math.ceil(height / tileSize);
  const tileMaxFgCoc = new Float32Array(tileCols * tileRows);

  for (let y = 0; y < height; y += 1) {
    const tr = Math.floor(y / tileSize);
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (signedCocMmArray[idx]! < 0) {
        const tIdx = tr * tileCols + Math.floor(x / tileSize);
        if (perPixelCocRadiusPx[idx]! > tileMaxFgCoc[tIdx]!) tileMaxFgCoc[tIdx] = perPixelCocRadiusPx[idx]!;
      }
    }
  }

  const outputRgbaLinear = new Float32Array(pixelCount * 4);
  let foregroundBleedRejectedTaps = 0;

  for (let y = 0; y < height; y += 1) {
    const tr = Math.floor(y / tileSize);
    for (let x = 0; x < width; x += 1) {
      const centerIdx = y * width + x;
      const centerDepth = options.depthMeters[centerIdx]!;
      const centerCoc = perPixelCocRadiusPx[centerIdx]!;
      const tc = Math.floor(x / tileSize);

      let localMaxFgCoc = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const nr = clamp(tr + dy, 0, tileRows - 1);
        for (let dx = -1; dx <= 1; dx += 1) {
          const candidate = tileMaxFgCoc[nr * tileCols + clamp(tc + dx, 0, tileCols - 1)]!;
          if (candidate > localMaxFgCoc) localMaxFgCoc = candidate;
        }
      }

      const gatherRadius = Math.max(centerCoc, localMaxFgCoc);
      const baseOff = centerIdx * 4;
      if (gatherRadius < 0.35) {
        outputRgbaLinear.set(options.rgbaLinear.subarray(baseOff, baseOff + 4), baseOff);
        continue;
      }

      let accumR = 0;
      let accumG = 0;
      let accumB = 0;
      let accumA = 0;
      let accumWeight = 0;

      for (let t = 0; t < kernelTaps.length; t += 1) {
        const tap = kernelTaps[t]!;
        const sampleX = clamp(Math.round(x + tap.offsetX * gatherRadius), 0, width - 1);
        const sampleY = clamp(Math.round(y + tap.offsetY * gatherRadius), 0, height - 1);
        const sampleIdx = sampleY * width + sampleX;
        const sampleDepth = options.depthMeters[sampleIdx]!;
        const sampleCoc = perPixelCocRadiusPx[sampleIdx]!;
        const tapDist = Math.hypot(tap.offsetX * gatherRadius, tap.offsetY * gatherRadius);

        let depthWeight = 1.0;
        if (sampleDepth < centerDepth - depthGuardM) {
          if (sampleCoc + 0.35 < tapDist || sampleCoc < 0.5) {
            const softRatio = sampleCoc < 0.5 ? 0 : clamp(sampleCoc / Math.max(tapDist, 1e-4), 0, 1);
            if (softRatio < 0.05) {
              foregroundBleedRejectedTaps += 1;
              continue;
            }
            depthWeight = softRatio;
          }
        } else if (centerCoc < 0.5 && sampleIdx !== centerIdx) {
          continue;
        }

        const sOff = sampleIdx * 4;
        const r = options.rgbaLinear[sOff]!;
        const g = options.rgbaLinear[sOff + 1]!;
        const b = options.rgbaLinear[sOff + 2]!;
        const a = options.rgbaLinear[sOff + 3]!;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const highlight = 1 + highlightGain * Math.max(0, luma - 0.75) * (sampleCoc / Math.max(1, maxCocRadiusPx));
        const w = tap.weight * depthWeight * highlight;
        accumR += r * w;
        accumG += g * w;
        accumB += b * w;
        accumA += a * w;
        accumWeight += w;
      }

      if (accumWeight > 1e-6) {
        const inv = 1 / accumWeight;
        outputRgbaLinear[baseOff] = accumR * inv;
        outputRgbaLinear[baseOff + 1] = accumG * inv;
        outputRgbaLinear[baseOff + 2] = accumB * inv;
        outputRgbaLinear[baseOff + 3] = accumA * inv;
      } else {
        outputRgbaLinear.set(options.rgbaLinear.subarray(baseOff, baseOff + 4), baseOff);
      }
    }
  }

  return {
    width, height, outputRgbaLinear, perPixelCocRadiusPx, kernelTaps,
    maxObservedCocRadiusPx, foregroundBleedRejectedTaps, serverCostKrw: 0,
  };
}

// ---------------------------------------------------------------------------
// 무발산(∇ · v = 0) 2D/3D 컬 노이즈 + 가이드 스트로크 바람장 조각기
// ---------------------------------------------------------------------------

function septicSmooth(u: number): number {
  const u2 = u * u;
  return u2 * u2 * (35 - 84 * u + 70 * u2 - 20 * u2 * u);
}

function septicSmoothDeriv(u: number): number {
  const om = 1 - u;
  return 140 * u * u * u * om * om * om;
}

function hashLattice3D(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647) ^ Math.imul(seed, 1597334677);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483647.5 - 1.0;
}

function sampleSepticPotential2DWithGrad(x: number, y: number, seed: number): { dx: number; dy: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = septicSmooth(fx);
  const sy = septicSmooth(fy);
  const v00 = hashLattice3D(ix, iy, 0, seed);
  const v10 = hashLattice3D(ix + 1, iy, 0, seed);
  const v01 = hashLattice3D(ix, iy + 1, 0, seed);
  const v11 = hashLattice3D(ix + 1, iy + 1, 0, seed);
  const k3 = v00 - v10 - v01 + v11;
  return { dx: (v10 - v00 + k3 * sy) * septicSmoothDeriv(fx), dy: (v01 - v00 + k3 * sx) * septicSmoothDeriv(fy) };
}

function sampleSepticPotential3DWithGrad(
  x: number, y: number, z: number, seed: number,
): { dx: number; dy: number; dz: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = septicSmooth(fx);
  const sy = septicSmooth(fy);
  const szVal = septicSmooth(fz);
  const dsx = septicSmoothDeriv(fx);
  const dsy = septicSmoothDeriv(fy);
  const dsz = septicSmoothDeriv(fz);

  const c000 = hashLattice3D(ix, iy, iz, seed);
  const c100 = hashLattice3D(ix + 1, iy, iz, seed);
  const c010 = hashLattice3D(ix, iy + 1, iz, seed);
  const c110 = hashLattice3D(ix + 1, iy + 1, iz, seed);
  const c001 = hashLattice3D(ix, iy, iz + 1, seed);
  const c101 = hashLattice3D(ix + 1, iy, iz + 1, seed);
  const c011 = hashLattice3D(ix, iy + 1, iz + 1, seed);
  const c111 = hashLattice3D(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = c000 + (c100 - c000) * sx;
  const nx10 = c010 + (c110 - c010) * sx;
  const nx01 = c001 + (c101 - c001) * sx;
  const nx11 = c011 + (c111 - c011) * sx;
  const nxy0 = nx00 + (nx10 - nx00) * sy;
  const nxy1 = nx01 + (nx11 - nx01) * sy;
  const dnxy0Dx = ((c100 - c000) + (c110 - c010 - (c100 - c000)) * sy) * dsx;
  const dnxy1Dx = ((c101 - c001) + (c111 - c011 - (c101 - c001)) * sy) * dsx;

  return {
    dx: dnxy0Dx + (dnxy1Dx - dnxy0Dx) * szVal,
    dy: (nx10 - nx00 + (nx11 - nx01 - (nx10 - nx00)) * szVal) * dsy,
    dz: (nxy1 - nxy0) * dsz,
  };
}

function evalFbmPotential2DGrad(
  x: number, y: number, timeSeconds: number, config: CurlWindFieldConfig,
): { dPsiDx: number; dPsiDy: number } {
  const seed = config.seed ?? 1337;
  const octaves = clamp(Math.floor(config.octaves ?? 4), 1, 6);
  const lacunarity = Math.max(1.1, config.lacunarity ?? 2.0);
  const gain = clamp(config.gain ?? 0.5, 0.05, 0.95);
  const tShift = timeSeconds * (config.timeScale ?? 0.6);
  let freq = Math.max(1e-5, config.baseFrequency ?? 0.015);
  let amp = config.amplitude ?? 1.0;
  let dPsiDx = 0;
  let dPsiDy = 0;
  for (let oct = 0; oct < octaves; oct += 1) {
    const s = sampleSepticPotential2DWithGrad(
      x * freq + tShift * (0.73 + 0.19 * oct), y * freq + tShift * (-0.51 + 0.13 * oct), seed + oct * 7919,
    );
    dPsiDx += amp * s.dx;
    dPsiDy += amp * s.dy;
    freq *= lacunarity;
    amp *= gain;
  }
  return { dPsiDx, dPsiDy };
}

function evalFbmPotential3DGrad(
  x: number, y: number, z: number, timeSeconds: number, config: CurlWindFieldConfig, channelOffset: number,
): { dx: number; dy: number; dz: number } {
  const seed = (config.seed ?? 1337) + channelOffset * 104729;
  const octaves = clamp(Math.floor(config.octaves ?? 4), 1, 6);
  const lacunarity = Math.max(1.1, config.lacunarity ?? 2.0);
  const gain = clamp(config.gain ?? 0.5, 0.05, 0.95);
  const tShift = timeSeconds * (config.timeScale ?? 0.6);
  let freq = Math.max(1e-5, config.baseFrequency ?? 0.08);
  let amp = config.amplitude ?? 1.0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  for (let oct = 0; oct < octaves; oct += 1) {
    const shift = tShift * (0.61 + 0.17 * oct);
    const s = sampleSepticPotential3DWithGrad(x * freq + shift, y * freq - 0.7 * shift, z * freq + 0.43 * shift, seed + oct * 6151);
    dx += amp * s.dx;
    dy += amp * s.dy;
    dz += amp * s.dz;
    freq *= lacunarity;
    amp *= gain;
  }
  return { dx, dy, dz };
}

/** 2D 유선함수 `ψ = ψ_fbm + ψ_guide`의 해석적 회전 `v = (∂ψ/∂y, -∂ψ/∂x)`을 구한다 (`∇ · v = 0`). */
export function sampleCurlWind2D(
  x: number, y: number, timeSeconds: number, config: CurlWindFieldConfig, guideStrokes: readonly WindGuideStroke2D[] = [],
): Vec2Tuple {
  const { dPsiDx: noiseDx, dPsiDy: noiseDy } = evalFbmPotential2DGrad(x, y, timeSeconds, config);
  let totalDPsiDx = noiseDx;
  let totalDPsiDy = noiseDy;

  for (let s = 0; s < guideStrokes.length; s += 1) {
    const stroke = guideStrokes[s]!;
    if (stroke.points.length < 2) continue;
    const radius = Math.max(1e-3, stroke.falloffRadius);
    const invR2 = 1 / (radius * radius);
    const segScale = stroke.strength / (stroke.points.length - 1);

    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const p0 = stroke.points[i]!;
      const p1 = stroke.points[i + 1]!;
      const segDx = p1[0] - p0[0];
      const segDy = p1[1] - p0[1];
      const segLen = Math.hypot(segDx, segDy);
      if (segLen < 1e-6) continue;
      const tx = segDx / segLen;
      const ty = segDy / segLen;
      const rx = x - 0.5 * (p0[0] + p1[0]);
      const ry = y - 0.5 * (p0[1] + p1[1]);
      const r2 = rx * rx + ry * ry;
      if (r2 > 18 * radius * radius) continue;

      const env = segScale * Math.exp(-0.5 * r2 * invR2);
      const linearTerm = tx * ry - ty * rx;
      totalDPsiDx += env * (-ty - linearTerm * rx * invR2);
      totalDPsiDy += env * (tx - linearTerm * ry * invR2);
    }
  }
  return [totalDPsiDy, -totalDPsiDx];
}

/** 3D 벡터 퍼텐셜 `Ψ = Ψ_fbm + Ψ_guide`의 해석적 회전 `v = ∇ × Ψ`을 구한다 (`∇ · v = 0`). */
export function sampleCurlWind3D(
  x: number, y: number, z: number, timeSeconds: number, config: CurlWindFieldConfig, guideStrokes: readonly WindGuideStroke3D[] = [],
): Vec3Tuple {
  const gPsiX = evalFbmPotential3DGrad(x, y, z, timeSeconds, config, 1);
  const gPsiY = evalFbmPotential3DGrad(x, y, z, timeSeconds, config, 2);
  const gPsiZ = evalFbmPotential3DGrad(x, y, z, timeSeconds, config, 3);
  let vx = gPsiZ.dy - gPsiY.dz;
  let vy = gPsiX.dz - gPsiZ.dx;
  let vz = gPsiY.dx - gPsiX.dy;

  for (let s = 0; s < guideStrokes.length; s += 1) {
    const stroke = guideStrokes[s]!;
    if (stroke.points.length < 2) continue;
    const radius = Math.max(1e-3, stroke.falloffRadius);
    const invR2 = 1 / (radius * radius);
    const segStrength = stroke.strength / (stroke.points.length - 1);

    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const p0 = stroke.points[i]!;
      const p1 = stroke.points[i + 1]!;
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const dz = p1[2] - p0[2];
      const segLen = Math.hypot(dx, dy, dz);
      if (segLen < 1e-6) continue;
      const tx = dx / segLen;
      const ty = dy / segLen;
      const tz = dz / segLen;
      const rx = x - 0.5 * (p0[0] + p1[0]);
      const ry = y - 0.5 * (p0[1] + p1[1]);
      const rz = z - 0.5 * (p0[2] + p1[2]);
      const r2 = rx * rx + ry * ry + rz * rz;
      if (r2 > 18 * radius * radius) continue;

      const halfEnv = 0.5 * segStrength * Math.exp(-0.5 * r2 * invR2);
      const ax = ty * rz - tz * ry;
      const ay = tz * rx - tx * rz;
      const az = tx * ry - ty * rx;
      vx += halfEnv * (2 * tx + (ay * rz - az * ry) * invR2);
      vy += halfEnv * (2 * ty + (az * rx - ax * rz) * invR2);
      vz += halfEnv * (2 * tz + (ax * ry - ay * rx) * invR2);
    }
  }
  return [vx, vy, vz];
}

/** 2D 바람장 격자에서 중앙 차분 수치 발산 `∂vx/∂x + ∂vy/∂y`를 실측 검증한다. */
export function auditCurlWindDivergence2D(
  points: readonly Vec2Tuple[], timeSeconds: number, config: CurlWindFieldConfig,
  guideStrokes: readonly WindGuideStroke2D[] = [], stepH = 1e-4, tolerance = 1e-5,
): DivergenceAuditSummary {
  if (points.length === 0) {
    return { sampleCount: 0, maxAbsDivergence: 0, meanAbsDivergence: 0, meanSpeed: 0, isDivergenceFree: true };
  }
  const h = Math.max(1e-6, stepH);
  const inv2H = 0.5 / h;
  let maxAbs = 0;
  let sumAbs = 0;
  let sumSpeed = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [px, py] = points[i]!;
    const center = sampleCurlWind2D(px, py, timeSeconds, config, guideStrokes);
    const xp = sampleCurlWind2D(px + h, py, timeSeconds, config, guideStrokes);
    const xm = sampleCurlWind2D(px - h, py, timeSeconds, config, guideStrokes);
    const yp = sampleCurlWind2D(px, py + h, timeSeconds, config, guideStrokes);
    const ym = sampleCurlWind2D(px, py - h, timeSeconds, config, guideStrokes);
    const absDiv = Math.abs((xp[0] - xm[0] + yp[1] - ym[1]) * inv2H);
    if (absDiv > maxAbs) maxAbs = absDiv;
    sumAbs += absDiv;
    sumSpeed += Math.hypot(center[0], center[1]);
  }
  return {
    sampleCount: points.length, maxAbsDivergence: maxAbs,
    meanAbsDivergence: sumAbs / points.length, meanSpeed: sumSpeed / points.length,
    isDivergenceFree: maxAbs <= tolerance,
  };
}

/** 3D 바람장 좌표들에서 중앙 차분 수치 발산 `∂vx/∂x + ∂vy/∂y + ∂vz/∂z`를 실측 검증한다. */
export function auditCurlWindDivergence3D(
  points: readonly Vec3Tuple[], timeSeconds: number, config: CurlWindFieldConfig,
  guideStrokes: readonly WindGuideStroke3D[] = [], stepH = 1e-4, tolerance = 1e-5,
): DivergenceAuditSummary {
  if (points.length === 0) {
    return { sampleCount: 0, maxAbsDivergence: 0, meanAbsDivergence: 0, meanSpeed: 0, isDivergenceFree: true };
  }
  const h = Math.max(1e-6, stepH);
  const inv2H = 0.5 / h;
  let maxAbs = 0;
  let sumAbs = 0;
  let sumSpeed = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [px, py, pz] = points[i]!;
    const center = sampleCurlWind3D(px, py, pz, timeSeconds, config, guideStrokes);
    const xp = sampleCurlWind3D(px + h, py, pz, timeSeconds, config, guideStrokes);
    const xm = sampleCurlWind3D(px - h, py, pz, timeSeconds, config, guideStrokes);
    const yp = sampleCurlWind3D(px, py + h, pz, timeSeconds, config, guideStrokes);
    const ym = sampleCurlWind3D(px, py - h, pz, timeSeconds, config, guideStrokes);
    const zp = sampleCurlWind3D(px, py, pz + h, timeSeconds, config, guideStrokes);
    const zm = sampleCurlWind3D(px, py, pz - h, timeSeconds, config, guideStrokes);
    const absDiv = Math.abs((xp[0] - xm[0] + yp[1] - ym[1] + zp[2] - zm[2]) * inv2H);
    if (absDiv > maxAbs) maxAbs = absDiv;
    sumAbs += absDiv;
    sumSpeed += Math.hypot(center[0], center[1], center[2]);
  }
  return {
    sampleCount: points.length, maxAbsDivergence: maxAbs,
    meanAbsDivergence: sumAbs / points.length, meanSpeed: sumSpeed / points.length,
    isDivergenceFree: maxAbs <= tolerance,
  };
}

/** 무발산 컬 바람장과 거리 제약 투영으로 망토·리본·장발 가닥을 전진 적분한다. */
export function simulateAerodynamicStrand(strandConfig: AerodynamicStrandConfig): AerodynamicStrandResult {
  const count = strandConfig.restPoints.length;
  if (count < 2) throw new RangeError("가닥 시뮬레이션에는 최소 2개의 정점이 필요합니다.");

  const dt = Math.max(1e-4, strandConfig.dtSeconds ?? 1 / 60);
  const stepCount = clamp(Math.floor(strandConfig.stepCount ?? 12), 1, 600);
  const drag = Math.max(0, strandConfig.dragCoefficient ?? 2.4);
  const gravity = strandConfig.gravity ?? [0, -2.5, 0];
  const iterations = clamp(Math.floor(strandConfig.constraintIterations ?? 4), 1, 24);
  const damping = clamp(strandConfig.velocityDamping ?? 0.96, 0, 1);
  const guides = strandConfig.guideStrokes3D ?? [];

  const posX = new Float64Array(count);
  const posY = new Float64Array(count);
  const posZ = new Float64Array(count);
  const velX = new Float64Array(count);
  const velY = new Float64Array(count);
  const velZ = new Float64Array(count);
  const restLengths = new Float64Array(count - 1);

  for (let i = 0; i < count; i += 1) {
    const pt = strandConfig.restPoints[i]!;
    posX[i] = pt[0];
    posY[i] = pt[1];
    posZ[i] = pt[2];
    if (i > 0) {
      const prev = strandConfig.restPoints[i - 1]!;
      restLengths[i - 1] = Math.max(1e-5, Math.hypot(pt[0] - prev[0], pt[1] - prev[1], pt[2] - prev[2]));
    }
  }

  const root = strandConfig.restPoints[0]!;
  const prevX = new Float64Array(count);
  const prevY = new Float64Array(count);
  const prevZ = new Float64Array(count);
  let currentTime = strandConfig.startTimeSeconds ?? 0;

  for (let step = 0; step < stepCount; step += 1) {
    prevX.set(posX);
    prevY.set(posY);
    prevZ.set(posZ);
    for (let i = 1; i < count; i += 1) {
      const wind = sampleCurlWind3D(posX[i]!, posY[i]!, posZ[i]!, currentTime, strandConfig.windConfig, guides);
      posX[i] = posX[i]! + (velX[i]! + (gravity[0] + drag * (wind[0] - velX[i]!)) * dt) * damping * dt;
      posY[i] = posY[i]! + (velY[i]! + (gravity[1] + drag * (wind[1] - velY[i]!)) * dt) * damping * dt;
      posZ[i] = posZ[i]! + (velZ[i]! + (gravity[2] + drag * (wind[2] - velZ[i]!)) * dt) * damping * dt;
    }

    for (let iter = 0; iter < iterations; iter += 1) {
      posX[0] = root[0];
      posY[0] = root[1];
      posZ[0] = root[2];
      for (let i = 0; i < count - 1; i += 1) {
        const dx = posX[i + 1]! - posX[i]!;
        const dy = posY[i + 1]! - posY[i]!;
        const dz = posZ[i + 1]! - posZ[i]!;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-9) continue;
        const diff = (dist - restLengths[i]!) / dist;
        if (i === 0) {
          posX[1] = posX[1]! - dx * diff;
          posY[1] = posY[1]! - dy * diff;
          posZ[1] = posZ[1]! - dz * diff;
        } else {
          const half = 0.5 * diff;
          posX[i] = posX[i]! + dx * half;
          posY[i] = posY[i]! + dy * half;
          posZ[i] = posZ[i]! + dz * half;
          posX[i + 1] = posX[i + 1]! - dx * half;
          posY[i + 1] = posY[i + 1]! - dy * half;
          posZ[i + 1] = posZ[i + 1]! - dz * half;
        }
      }
    }

    const invDt = 1 / dt;
    for (let i = 1; i < count; i += 1) {
      velX[i] = (posX[i]! - prevX[i]!) * invDt;
      velY[i] = (posY[i]! - prevY[i]!) * invDt;
      velZ[i] = (posZ[i]! - prevZ[i]!) * invDt;
    }
    currentTime += dt;
  }

  const positions: Vec3Tuple[] = [];
  const velocities: Vec3Tuple[] = [];
  let kineticEnergy = 0;
  let maxLengthErrorRatio = 0;
  for (let i = 0; i < count; i += 1) {
    positions.push([posX[i]!, posY[i]!, posZ[i]!]);
    velocities.push([velX[i]!, velY[i]!, velZ[i]!]);
    kineticEnergy += 0.5 * (velX[i]! * velX[i]! + velY[i]! * velY[i]! + velZ[i]! * velZ[i]!);
    if (i > 0) {
      const segLen = Math.hypot(posX[i]! - posX[i - 1]!, posY[i]! - posY[i - 1]!, posZ[i]! - posZ[i - 1]!);
      const errRatio = Math.abs(segLen - restLengths[i - 1]!) / restLengths[i - 1]!;
      if (errRatio > maxLengthErrorRatio) maxLengthErrorRatio = errRatio;
    }
  }

  const initialTip = strandConfig.restPoints[count - 1]!;
  return {
    positions: Object.freeze(positions),
    velocities: Object.freeze(velocities),
    restSegmentLengths: Object.freeze(Array.from(restLengths)),
    maxLengthErrorRatio,
    tipDisplacement: Math.hypot(posX[count - 1]! - initialTip[0], posY[count - 1]! - initialTip[1], posZ[count - 1]! - initialTip[2]),
    kineticEnergy,
    serverCostKrw: 0,
  };
}
