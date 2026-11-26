/**
 * 깊이(`depth`)·표면 법선 상향성(`N_y`)·상부 지붕 처마/우산 기둥 차폐 기반
 * 날씨(비·눈·진눈깨비) 및 젖은 표면 반사·프레넬 윤기 합성기.
 *
 * - 외부 서버 비용 ₩0, 순수 타이프드 배열 기반 픽셀 셰이딩 합성기.
 * - 지붕 처마(`roof-eave`), 우산(`umbrella`), 상부 캐노피 높이 맵, 2.5D 깊이 기둥 차폐를 결합해
 *   하늘에 열린 표면에만 물막 암화(Ångström 효과)·프레넬 하이라이트·빗방울 왕관 파문·적설을 입히고
 *   처마·우산 아래 차폐 구역은 원본 건조 픽셀을 그대로 보존한다.
 */

export interface WeatherVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type WeatherPrecipitationMode = "rain" | "snow" | "sleet" | "wet-only";

export type OverheadRoofEaveOccluder = {
  readonly kind: "roof-eave";
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** 처마 밑면 높이 `Y` (`worldY < bottomY`일 때 처마 아래 차폐 기둥에 들어간다). */
  readonly bottomY: number;
  /** 처마 가장자리 반그림자 폭(기본값 `0.08`). */
  readonly penumbraWidth?: number;
};

export type OverheadUmbrellaOccluder = {
  readonly kind: "umbrella";
  readonly id: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly radius: number;
  /** 우산 천 하단 테두리 높이 `Y`. */
  readonly rimY: number;
  readonly penumbraWidth?: number;
};

export type OverheadWeatherOccluder = OverheadRoofEaveOccluder | OverheadUmbrellaOccluder;

export interface RgbTriplet {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface DepthOccludedWeatherInput {
  readonly width: number;
  readonly height: number;
  /** 원본 sRGB 이미지 버퍼 (`width * height * 4`). */
  readonly baseRgba: Uint8ClampedArray | Uint8Array;
  /** 카메라 깊이 버퍼 (`width * height`, 양수 깊이). */
  readonly depthBuffer: Float32Array;
  /** 월드 공간 표면 법선 버퍼 (`width * height * 3`, `[Nx, Ny, Nz]`, `+Y`가 하늘 방향). */
  readonly normalBuffer: Float32Array;
  /** 선택적 픽셀별 월드 좌표 버퍼 (`width * height * 3`, `[X, Y, Z]`). 미지정 시 화면·깊이에서 복원한다. */
  readonly worldPositionBuffer?: Float32Array;
  /** 선택적 픽셀별 기본 표면 거칠기(`0..1`, 기본값 `0.68`). */
  readonly roughnessBuffer?: Float32Array;
  /** 선택적 상부 캐노피 최저 높이 맵(`width * height`). `worldY < canopyY`이면 차폐로 판정한다. */
  readonly overheadCanopyHeightBuffer?: Float32Array;
  /** 지붕 처마·우산 등 해석적 상부 차폐 도형 목록. */
  readonly occluders?: readonly OverheadWeatherOccluder[];
  /** 2.5D 깊이 슬라이스 내 화면 상단 오버행 기둥 스캔 활성화 여부(기본값 `false`). */
  readonly enableScreenColumnOcclusion?: boolean;
  /** 화면 기둥 차폐 시 같은 깊이 층으로 볼 최대 깊이 허용차(기본값 `0.25`). */
  readonly screenColumnDepthTolerance?: number;
  readonly mode: WeatherPrecipitationMode;
  /** 전체 습윤/강수 강도(`0..1`, 기본값 `0.85`). */
  readonly intensity?: number;
  /** 다공성 표면(돌·나무·아스팔트·면) 젖음 암화 계수(`0..0.78`, 기본값 `0.42`). */
  readonly porosityDarkening?: number;
  /** 바람에 기울어진 낙하 수평 성분(`dx/dy`, `dz/dy`, 기본값 `0`). */
  readonly windTiltX?: number;
  readonly windTiltZ?: number;
  /** 적설이 유지되는 최소 법선 상향성 `N_y`(기본값 `0.62`). */
  readonly snowMinNormalY?: number;
  /** 빗방울 왕관 튀김이 생기는 최소 법선 상향성 `N_y`(기본값 `0.55`). */
  readonly splashMinNormalY?: number;
  readonly viewDirection?: WeatherVec3;
  readonly lightDirection?: WeatherVec3;
  readonly specularTintRgb?: RgbTriplet;
  readonly snowAlbedoRgb?: RgbTriplet;
  readonly seed?: number;
  readonly reconstructedSpanX?: number;
  readonly reconstructedSpanY?: number;
}

export interface WeatherCompositionStats {
  readonly totalPixels: number;
  readonly skyExposedPixelCount: number;
  readonly occludedDryPixelCount: number;
  readonly rainSplashPixelCount: number;
  readonly snowCoveredPixelCount: number;
  readonly meanSkyExposedRoughness: number;
  readonly meanOccludedRoughness: number;
  readonly serverCostKrw: 0;
}

export interface DepthOccludedWeatherResult {
  readonly width: number;
  readonly height: number;
  readonly compositedRgba: Uint8ClampedArray;
  readonly skyExposureMap: Float32Array;
  readonly wetnessMap: Float32Array;
  readonly snowMask: Float32Array;
  readonly effectiveRoughnessMap: Float32Array;
  readonly stats: WeatherCompositionStats;
}

const EPS = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0 + EPS) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeVec3(v: WeatherVec3): WeatherVec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= EPS) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function srgbByteToLinear(byte: number): number {
  const s = clamp(byte / 255, 0, 1);
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgbByte(linear: number): number {
  const c = clamp(linear, 0, 1);
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(clamp(s * 255, 0, 255));
}

function hashGrid2D(ix: number, iz: number, seed: number): number {
  let h =
    Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function evaluateAnalyticOccluderVisibility(
  worldX: number,
  worldY: number,
  worldZ: number,
  windTiltX: number,
  windTiltZ: number,
  occluders: readonly OverheadWeatherOccluder[],
): number {
  let visibility = 1;
  for (let i = 0; i < occluders.length; i += 1) {
    const occ = occluders[i];
    if (!occ) continue;

    if (occ.kind === "roof-eave") {
      if (worldY >= occ.bottomY - 1e-4) continue;
      const dy = occ.bottomY - worldY;
      const hitX = worldX + windTiltX * dy;
      const hitZ = worldZ + windTiltZ * dy;
      const penumbra = Math.max(1e-4, occ.penumbraWidth ?? 0.08);
      const signedInsideX = Math.min(hitX - occ.minX, occ.maxX - hitX);
      const signedInsideZ = Math.min(hitZ - occ.minZ, occ.maxZ - hitZ);
      const minEdgeMargin = Math.min(signedInsideX, signedInsideZ);
      if (minEdgeMargin > -penumbra) {
        const sheltered = smoothstep(-penumbra, penumbra, minEdgeMargin);
        visibility *= 1 - sheltered;
      }
    } else {
      if (worldY >= occ.rimY - 1e-4) continue;
      const dy = occ.rimY - worldY;
      const hitX = worldX + windTiltX * dy;
      const hitZ = worldZ + windTiltZ * dy;
      const radialDist = Math.hypot(hitX - occ.centerX, hitZ - occ.centerZ);
      const penumbra = Math.max(1e-4, occ.penumbraWidth ?? 0.06);
      const marginInside = occ.radius - radialDist;
      if (marginInside > -penumbra) {
        const sheltered = smoothstep(-penumbra, penumbra, marginInside);
        visibility *= 1 - sheltered;
      }
    }
    if (visibility <= 1e-5) return 0;
  }
  return clamp(visibility, 0, 1);
}

function evaluateSplashRingIntensity(worldX: number, worldZ: number, seed: number): number {
  const cellScale = 6.5;
  const sx = worldX * cellScale;
  const sz = worldZ * cellScale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;

  const cellRand = hashGrid2D(ix, iz, seed);
  if (cellRand < 0.56) return 0;

  const cx = 0.22 + 0.56 * hashGrid2D(ix + 17, iz - 31, seed);
  const cz = 0.22 + 0.56 * hashGrid2D(ix - 43, iz + 19, seed);
  const phase = hashGrid2D(ix + 71, iz + 89, seed);
  const ringRadius = 0.08 + 0.28 * phase;
  const dist = Math.hypot(fx - cx, fz - cz);
  const ringBand = Math.max(0, 1 - Math.abs(dist - ringRadius) / 0.045);
  const crownCore = dist < 0.045 * (1 - phase) ? 0.85 : 0;
  return clamp(ringBand * (1 - 0.55 * phase) + crownCore, 0, 1);
}

/**
 * 깊이·표면 법선(`N_y`)·상부 지붕 처마/우산 기둥 차폐를 결합해 하늘 노출 표면에만
 * 빗방울 튀김·적설·젖은 거칠기 감소(암화·프레넬 하이라이트)를 합성한다.
 */
export function composeDepthOccludedWeatherWetness(
  input: DepthOccludedWeatherInput,
): DepthOccludedWeatherResult {
  const { width, height } = input;
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError(`유효한 정수 해상도가 필요합니다: ${width}x${height}`);
  }
  const pixelCount = width * height;
  if (input.baseRgba.length < pixelCount * 4) {
    throw new RangeError("baseRgba 버퍼 길이가 해상도보다 작습니다.");
  }
  if (input.depthBuffer.length < pixelCount) {
    throw new RangeError("depthBuffer 길이가 해상도보다 작습니다.");
  }
  if (input.normalBuffer.length < pixelCount * 3) {
    throw new RangeError("normalBuffer 길이가 해상도보다 작습니다.");
  }

  const intensity = clamp(input.intensity ?? 0.85, 0, 1);
  const porosityDarkening = clamp(input.porosityDarkening ?? 0.42, 0, 0.78);
  const windTiltX = input.windTiltX ?? 0;
  const windTiltZ = input.windTiltZ ?? 0;
  const snowMinNormalY = clamp(input.snowMinNormalY ?? 0.62, 0.05, 0.98);
  const splashMinNormalY = clamp(input.splashMinNormalY ?? 0.55, 0.05, 0.98);
  const seed = input.seed ?? 20261127;
  const spanX = input.reconstructedSpanX ?? 10;
  const spanY = input.reconstructedSpanY ?? 10;
  const occluders = input.occluders ?? [];
  const enableScreenColumn = input.enableScreenColumnOcclusion ?? false;
  const columnDepthTol = Math.max(1e-4, input.screenColumnDepthTolerance ?? 0.25);

  const viewDir = normalizeVec3(input.viewDirection ?? { x: 0, y: 0.38, z: 0.925 });
  const lightDir = normalizeVec3(input.lightDirection ?? { x: -0.28, y: 0.82, z: 0.5 });
  const halfDir = normalizeVec3({
    x: viewDir.x + lightDir.x,
    y: viewDir.y + lightDir.y,
    z: viewDir.z + lightDir.z,
  });

  const specTint = input.specularTintRgb ?? { r: 224, g: 238, b: 255 };
  const specTintLinR = srgbByteToLinear(specTint.r);
  const specTintLinG = srgbByteToLinear(specTint.g);
  const specTintLinB = srgbByteToLinear(specTint.b);

  const snowTint = input.snowAlbedoRgb ?? { r: 244, g: 248, b: 255 };
  const snowLinR = srgbByteToLinear(snowTint.r);
  const snowLinG = srgbByteToLinear(snowTint.g);
  const snowLinB = srgbByteToLinear(snowTint.b);

  const compositedRgba = new Uint8ClampedArray(pixelCount * 4);
  const skyExposureMap = new Float32Array(pixelCount);
  const wetnessMap = new Float32Array(pixelCount);
  const snowMask = new Float32Array(pixelCount);
  const effectiveRoughnessMap = new Float32Array(pixelCount);

  let skyExposedPixelCount = 0;
  let occludedDryPixelCount = 0;
  let rainSplashPixelCount = 0;
  let snowCoveredPixelCount = 0;
  let sumExposedRoughness = 0;
  let sumOccludedRoughness = 0;

  const hasWetPass =
    input.mode === "rain" || input.mode === "wet-only" || input.mode === "sleet";
  const hasSplashPass = input.mode === "rain" || input.mode === "sleet";
  const hasSnowPass = input.mode === "snow" || input.mode === "sleet";

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const idx = py * width + px;
      const rgbaIdx = idx * 4;
      const nIdx = idx * 3;

      const baseR = input.baseRgba[rgbaIdx] ?? 0;
      const baseG = input.baseRgba[rgbaIdx + 1] ?? 0;
      const baseB = input.baseRgba[rgbaIdx + 2] ?? 0;
      const baseA = input.baseRgba[rgbaIdx + 3] ?? 255;

      const depth = input.depthBuffer[idx] ?? 0;
      const baseRoughness = clamp(input.roughnessBuffer?.[idx] ?? 0.68, 0.04, 1);

      const normal = normalizeVec3({
        x: input.normalBuffer[nIdx] ?? 0,
        y: input.normalBuffer[nIdx + 1] ?? 1,
        z: input.normalBuffer[nIdx + 2] ?? 0,
      });

      const hasWorldBuf =
        input.worldPositionBuffer !== undefined
        && input.worldPositionBuffer.length >= pixelCount * 3;
      const worldX = hasWorldBuf
        ? (input.worldPositionBuffer?.[nIdx] ?? 0)
        : ((px + 0.5) / width - 0.5) * spanX;
      const worldY = hasWorldBuf
        ? (input.worldPositionBuffer?.[nIdx + 1] ?? 0)
        : (0.5 - (py + 0.5) / height) * spanY;
      const worldZ = hasWorldBuf ? (input.worldPositionBuffer?.[nIdx + 2] ?? depth) : depth;

      let skyExposure =
        baseA === 0 || !Number.isFinite(depth) || depth <= 0
          ? 0
          : evaluateAnalyticOccluderVisibility(
              worldX,
              worldY,
              worldZ,
              windTiltX,
              windTiltZ,
              occluders,
            );

      if (skyExposure > 0 && input.overheadCanopyHeightBuffer) {
        const canopyY = input.overheadCanopyHeightBuffer[idx];
        if (canopyY !== undefined && Number.isFinite(canopyY) && worldY < canopyY - 1e-4) {
          skyExposure = 0;
        }
      }

      if (skyExposure > 0 && enableScreenColumn && py > 0) {
        for (let scanY = py - 1; scanY >= 0; scanY -= 1) {
          const upperIdx = scanY * width + px;
          if ((input.baseRgba[upperIdx * 4 + 3] ?? 0) === 0) continue;
          const upperDepth = input.depthBuffer[upperIdx] ?? 0;
          const upperNy = input.normalBuffer[upperIdx * 3 + 1] ?? 0;
          if (Math.abs(upperDepth - depth) <= columnDepthTol && upperNy < -0.15) {
            skyExposure = 0;
            break;
          }
        }
      }

      skyExposureMap[idx] = skyExposure;

      if (skyExposure <= 1e-4 || intensity <= 1e-4) {
        occludedDryPixelCount += 1;
        sumOccludedRoughness += baseRoughness;
        wetnessMap[idx] = 0;
        snowMask[idx] = 0;
        effectiveRoughnessMap[idx] = baseRoughness;
        compositedRgba[rgbaIdx] = baseR;
        compositedRgba[rgbaIdx + 1] = baseG;
        compositedRgba[rgbaIdx + 2] = baseB;
        compositedRgba[rgbaIdx + 3] = baseA;
        continue;
      }

      skyExposedPixelCount += 1;
      const upwardness = clamp(normal.y, 0, 1);
      const windFacing = clamp(-(normal.x * windTiltX + normal.z * windTiltZ), 0, 1);
      const surfaceCatch =
        normal.y < -0.25 ? 0 : clamp(0.22 + 0.78 * upwardness + 0.35 * windFacing, 0, 1);

      let linR = srgbByteToLinear(baseR);
      let linG = srgbByteToLinear(baseG);
      let linB = srgbByteToLinear(baseB);
      let wetness = 0;
      let effRoughness = baseRoughness;

      if (hasWetPass && surfaceCatch > 0) {
        wetness = clamp(skyExposure * intensity * surfaceCatch, 0, 1);
        const waterFilmRoughness = lerp(0.14, 0.045, upwardness);
        effRoughness = lerp(baseRoughness, Math.min(baseRoughness, waterFilmRoughness), wetness);

        const darkenFactor = 1 - porosityDarkening * wetness * (0.45 + 0.55 * baseRoughness);
        linR *= darkenFactor;
        linG *= darkenFactor;
        linB *= darkenFactor;

        const nDotV = clamp(
          normal.x * viewDir.x + normal.y * viewDir.y + normal.z * viewDir.z,
          0,
          1,
        );
        const nDotL = clamp(
          normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z,
          0,
          1,
        );
        const nDotH = clamp(
          normal.x * halfDir.x + normal.y * halfDir.y + normal.z * halfDir.z,
          0,
          1,
        );
        const fresnelSchlick = 0.0204 + (1 - 0.0204) * Math.pow(1 - nDotV, 5);
        const shininess = lerp(16, 180, 1 - effRoughness);
        const specLobe =
          nDotL > 0 ? Math.pow(nDotH, shininess) * (shininess * 0.035) * nDotL : 0;
        const skySheen = wetness * (fresnelSchlick * 0.55 + specLobe * 0.65);

        linR = clamp(linR + specTintLinR * skySheen, 0, 1);
        linG = clamp(linG + specTintLinG * skySheen, 0, 1);
        linB = clamp(linB + specTintLinB * skySheen, 0, 1);
      }

      if (hasSplashPass && skyExposure > 0.35 && normal.y >= splashMinNormalY) {
        const splashSlopeWeight = smoothstep(splashMinNormalY, 0.92, normal.y);
        const splashStrength =
          evaluateSplashRingIntensity(worldX, worldZ, seed)
          * splashSlopeWeight
          * skyExposure
          * intensity;
        if (splashStrength > 0.08) {
          rainSplashPixelCount += 1;
          linR = clamp(linR + specTintLinR * splashStrength * 0.58, 0, 1);
          linG = clamp(linG + specTintLinG * splashStrength * 0.58, 0, 1);
          linB = clamp(linB + specTintLinB * splashStrength * 0.62, 0, 1);
        }
      }

      let snowWeight = 0;
      if (hasSnowPass && normal.y >= snowMinNormalY) {
        const reposeFactor = smoothstep(
          snowMinNormalY,
          Math.min(0.99, snowMinNormalY + 0.24),
          normal.y,
        );
        const microDrift = 0.86 + 0.14 * hashGrid2D(px, py, seed ^ 0x5a17);
        snowWeight = clamp(
          skyExposure * intensity * reposeFactor * microDrift * (input.mode === "sleet" ? 0.65 : 1),
          0,
          1,
        );
        if (snowWeight > 0.05) {
          snowCoveredPixelCount += 1;
          const nDotL = clamp(
            normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z,
            0.25,
            1,
          );
          linR = lerp(linR, snowLinR * (0.72 + 0.28 * nDotL), snowWeight);
          linG = lerp(linG, snowLinG * (0.75 + 0.25 * nDotL), snowWeight);
          linB = lerp(linB, snowLinB * (0.82 + 0.18 * nDotL), snowWeight);
          effRoughness = lerp(effRoughness, 0.76, snowWeight);
        }
      }

      wetnessMap[idx] = wetness;
      snowMask[idx] = snowWeight;
      effectiveRoughnessMap[idx] = effRoughness;
      sumExposedRoughness += effRoughness;

      compositedRgba[rgbaIdx] = linearToSrgbByte(linR);
      compositedRgba[rgbaIdx + 1] = linearToSrgbByte(linG);
      compositedRgba[rgbaIdx + 2] = linearToSrgbByte(linB);
      compositedRgba[rgbaIdx + 3] = baseA;
    }
  }

  return {
    width,
    height,
    compositedRgba,
    skyExposureMap,
    wetnessMap,
    snowMask,
    effectiveRoughnessMap,
    stats: {
      totalPixels: pixelCount,
      skyExposedPixelCount,
      occludedDryPixelCount,
      rainSplashPixelCount,
      snowCoveredPixelCount,
      meanSkyExposedRoughness:
        skyExposedPixelCount > 0 ? sumExposedRoughness / skyExposedPixelCount : 0,
      meanOccludedRoughness:
        occludedDryPixelCount > 0 ? sumOccludedRoughness / occludedDryPixelCount : 0,
      serverCostKrw: 0,
    },
  };
}
