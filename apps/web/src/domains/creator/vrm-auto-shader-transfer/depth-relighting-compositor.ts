/**
 * 2D 캔버스 합성용 실시간 3단 깊이 분리(전경·캐릭터·배경 Z-슬라이스) + 3점 조명 리라이팅 맵 생성기.
 *
 * - 픽셀별 정규화 깊이 버퍼([0..1])를 전경(Foreground)·캐릭터(Character)·배경(Background) 3단 레이어로
 *   부드러운 smoothstep 경계(단위 분할 합 = 1.0)로 분리한다.
 * - MToon 1.0 셀 경계(shadingToonyFactor / shadingShiftFactor)와 프레넬 림 공식으로
 *   주광(Key)·보조광(Fill)·림라이트(Rim) 3점 조명 리라이팅 맵을 실시간 생성한다.
 */

import {
  clamp,
  roundTo,
  srgbToRelativeLuminance,
  type Rgb01,
} from "./color-science-oklch";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type DepthSliceLayerId = "foreground" | "character" | "background";

export interface DepthSliceVisibility {
  readonly foreground: boolean;
  readonly character: boolean;
  readonly background: boolean;
}

export interface DepthSliceConfig {
  /** 전경/캐릭터 분할 경계 깊이 [0.05..0.85] (작을수록 카메라에 가까움) */
  readonly nearCutZ: number;
  /** 캐릭터/배경 분할 경계 깊이 [0.15..0.95] */
  readonly farCutZ: number;
  /** 경계 안티앨리어싱 페더 반폭 [0..0.12] */
  readonly featherDepth: number;
  readonly visibility: DepthSliceVisibility;
}

export interface ThreePointRelightingConfig {
  readonly keyIntensity: number;
  readonly fillIntensity: number;
  readonly rimIntensity: number;
  readonly keyLightDirection: Vec3;
  readonly referenceLightDirection?: Vec3;
  readonly keyColor: Rgb01;
  readonly fillColor: Rgb01;
  readonly rimColor: Rgb01;
  readonly shadingToonyFactor: number;
  readonly shadingShiftFactor: number;
  readonly rimFresnelPower: number;
  readonly rimLift: number;
  readonly ambientFloor?: number;
}

export interface DepthSceneFrameInput {
  readonly width: number;
  readonly height: number;
  readonly depthBuffer: Float32Array;
  readonly normalBuffer: Float32Array;
  readonly albedoRgba: Uint8ClampedArray;
}

export interface DepthLayerSliceOutput {
  readonly layerId: DepthSliceLayerId;
  readonly visible: boolean;
  readonly zRange: readonly [number, number];
  readonly mask: Float32Array;
  readonly rgba: Uint8ClampedArray;
  readonly coveredPixels: number;
  readonly coverageRatio: number;
  readonly meanDepth: number;
}

export interface ThreePointRelightingMetrics {
  readonly keyFillContrastRatio: number;
  readonly rimCoverageRatio: number;
  readonly meanRelitLuminance: number;
  readonly lightDirectionAlignmentCosine: number;
  readonly celStepSharpness: number;
}

export interface ThreePointRelightingMapOutput {
  readonly width: number;
  readonly height: number;
  readonly keyLightDirection: Vec3;
  readonly fillLightDirection: Vec3;
  readonly rimLightDirection: Vec3;
  readonly keyIrradianceRgba: Uint8ClampedArray;
  readonly rimFresnelRgba: Uint8ClampedArray;
  readonly combinedRelitRgba: Uint8ClampedArray;
  readonly metrics: ThreePointRelightingMetrics;
}

export interface DepthAndRelightingCompositeResult {
  readonly width: number;
  readonly height: number;
  readonly totalPixels: number;
  readonly sliceConfig: DepthSliceConfig;
  readonly layers: Readonly<Record<DepthSliceLayerId, DepthLayerSliceOutput>>;
  readonly activeLayerCount: number;
  readonly activeCoverageRatio: number;
  readonly partitionErrorMax: number;
  readonly relighting: ThreePointRelightingMapOutput;
}

export const DEFAULT_DEPTH_SLICE_CONFIG: DepthSliceConfig = Object.freeze({
  nearCutZ: 0.36,
  farCutZ: 0.68,
  featherDepth: 0.03,
  visibility: Object.freeze({
    foreground: true,
    character: true,
    background: true,
  }),
});

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function normalizeVec3(vec: Vec3): Vec3 {
  const len = Math.hypot(vec.x, vec.y, vec.z);
  if (!Number.isFinite(len) || len < 1e-8) {
    return { x: 0.45, y: 0.68, z: 0.58 };
  }
  return {
    x: vec.x / len,
    y: vec.y / len,
    z: vec.z / len,
  };
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function anglesToDirectionVec3(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = azimuthDeg * DEG_TO_RAD;
  const el = clamp(elevationDeg, -85, 85) * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return normalizeVec3({
    x: Math.sin(az) * cosEl,
    y: Math.sin(el),
    z: Math.cos(az) * cosEl,
  });
}

export function directionVec3ToAngles(vec: Vec3): { readonly azimuthDeg: number; readonly elevationDeg: number } {
  const unit = normalizeVec3(vec);
  return {
    azimuthDeg: roundTo(Math.atan2(unit.x, unit.z) * RAD_TO_DEG, 1),
    elevationDeg: roundTo(Math.asin(clamp(unit.y, -1, 1)) * RAD_TO_DEG, 1),
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0 + 1e-7) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function linearstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0 + 1e-6) return x >= edge0 ? 1 : 0;
  return clamp((x - edge0) / (edge1 - edge0), 0, 1);
}

function toByte(v: number): number {
  return Math.round(clamp(v, 0, 1) * 255);
}

function sanitizeSliceConfig(input?: Partial<DepthSliceConfig>): DepthSliceConfig {
  const rawNear = clamp(input?.nearCutZ ?? DEFAULT_DEPTH_SLICE_CONFIG.nearCutZ, 0.08, 0.82);
  const rawFar = clamp(input?.farCutZ ?? DEFAULT_DEPTH_SLICE_CONFIG.farCutZ, rawNear + 0.08, 0.94);
  const maxFeather = Math.min(0.12, (rawFar - rawNear) * 0.45);
  const featherDepth = clamp(input?.featherDepth ?? DEFAULT_DEPTH_SLICE_CONFIG.featherDepth, 0, maxFeather);
  return {
    nearCutZ: roundTo(rawNear, 3),
    farCutZ: roundTo(rawFar, 3),
    featherDepth: roundTo(featherDepth, 3),
    visibility: {
      foreground: input?.visibility?.foreground ?? true,
      character: input?.visibility?.character ?? true,
      background: input?.visibility?.background ?? true,
    },
  };
}

/**
 * 결정적 3단 깊이(전경 소품·캐릭터 두상/상반신·스튜디오 배경) + 해석적 법선·알베도 합성 프레임을 생성한다.
 */
export function synthesizeVrmPortraitDepthScene(options?: {
  readonly width?: number;
  readonly height?: number;
  readonly skinRgb?: Rgb01;
  readonly hairRgb?: Rgb01;
  readonly outfitRgb?: Rgb01;
  readonly backdropRgb?: Rgb01;
  readonly foregroundPropRgb?: Rgb01;
}): DepthSceneFrameInput {
  const width = Math.max(8, Math.floor(options?.width ?? 48));
  const height = Math.max(8, Math.floor(options?.height ?? 48));
  const total = width * height;

  const skin = options?.skinRgb ?? { r: 0.93, g: 0.81, b: 0.74 };
  const hair = options?.hairRgb ?? { r: 0.34, g: 0.33, b: 0.52 };
  const outfit = options?.outfitRgb ?? { r: 0.88, g: 0.84, b: 0.78 };
  const backdrop = options?.backdropRgb ?? { r: 0.74, g: 0.78, b: 0.84 };
  const prop = options?.foregroundPropRgb ?? { r: 0.62, g: 0.45, b: 0.52 };

  const depthBuffer = new Float32Array(total);
  const normalBuffer = new Float32Array(total * 3);
  const albedoRgba = new Uint8ClampedArray(total * 4);

  for (let y = 0; y < height; y += 1) {
    const ny = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const nx = (x + 0.5) / width;
      const idx = y * width + x;

      // 기본값: 배경 레이어 (z: 0.78..0.92)
      let depth = 0.8 + 0.12 * ny;
      let normX = (nx - 0.5) * 0.16;
      let normY = (0.5 - ny) * 0.14;
      let normZ = 0.97;
      let color: Rgb01 = {
        r: clamp(backdrop.r * (1.03 - ny * 0.12), 0, 1),
        g: clamp(backdrop.g * (1.03 - ny * 0.12), 0, 1),
        b: clamp(backdrop.b * (1.04 - ny * 0.1), 0, 1),
      };

      // 캐릭터 상반신(어깨/의상 타원, z: 0.46..0.60)
      const torsoDx = (nx - 0.5) / 0.29;
      const torsoDy = (ny - 0.82) / 0.28;
      const torsoR2 = torsoDx * torsoDx + torsoDy * torsoDy;
      if (torsoR2 <= 1) {
        const zDome = Math.sqrt(Math.max(0, 1 - torsoR2));
        depth = 0.59 - zDome * 0.11;
        normX = torsoDx * 0.75;
        normY = -torsoDy * 0.35;
        normZ = Math.max(0.25, zDome);
        color = outfit;
      }

      // 캐릭터 두상(피부 구체, z: 0.41..0.55)
      const headDx = (nx - 0.5) / 0.18;
      const headDy = (ny - 0.42) / 0.21;
      const headR2 = headDx * headDx + headDy * headDy;
      if (headR2 <= 1) {
        const zDome = Math.sqrt(Math.max(0, 1 - headR2));
        depth = 0.54 - zDome * 0.12;
        normX = headDx;
        normY = -headDy * 0.85;
        normZ = Math.max(0.2, zDome);
        color = skin;
      }

      // 캐릭터 헤어 크라운(상단 반구, z: 0.39..0.52)
      const hairDx = (nx - 0.5) / 0.21;
      const hairDy = (ny - 0.34) / 0.18;
      const hairR2 = hairDx * hairDx + hairDy * hairDy;
      if (hairR2 <= 1 && ny <= 0.46) {
        const zDome = Math.sqrt(Math.max(0, 1 - hairR2));
        const hairDepth = 0.51 - zDome * 0.11;
        if (hairDepth < depth) {
          depth = hairDepth;
          normX = hairDx * 0.9;
          normY = -hairDy * 0.95;
          normZ = Math.max(0.2, zDome);
          color = hair;
        }
      }

      // 전경 오브젝트(우측 하단 포그라운드 소품/손 프레임 + 좌측 상단 전경 잎/프레임, z: 0.18..0.29)
      const fg1Dx = (nx - 0.8) / 0.17;
      const fg1Dy = (ny - 0.78) / 0.18;
      const fg1R2 = fg1Dx * fg1Dx + fg1Dy * fg1Dy;
      if (fg1R2 <= 1) {
        const zDome = Math.sqrt(Math.max(0, 1 - fg1R2));
        depth = 0.29 - zDome * 0.1;
        normX = fg1Dx * 0.85;
        normY = -fg1Dy * 0.7;
        normZ = Math.max(0.22, zDome);
        color = prop;
      }

      const fg2Dx = (nx - 0.16) / 0.13;
      const fg2Dy = (ny - 0.18) / 0.14;
      const fg2R2 = fg2Dx * fg2Dx + fg2Dy * fg2Dy;
      if (fg2R2 <= 1) {
        const zDome = Math.sqrt(Math.max(0, 1 - fg2R2));
        depth = 0.27 - zDome * 0.09;
        normX = fg2Dx * 0.8;
        normY = -fg2Dy * 0.8;
        normZ = Math.max(0.25, zDome);
        color = prop;
      }

      const unitN = normalizeVec3({ x: normX, y: normY, z: normZ });
      depthBuffer[idx] = clamp(depth, 0, 1);
      normalBuffer[idx * 3] = unitN.x;
      normalBuffer[idx * 3 + 1] = unitN.y;
      normalBuffer[idx * 3 + 2] = unitN.z;

      const off = idx * 4;
      albedoRgba[off] = toByte(color.r);
      albedoRgba[off + 1] = toByte(color.g);
      albedoRgba[off + 2] = toByte(color.b);
      albedoRgba[off + 3] = 255;
    }
  }

  return { width, height, depthBuffer, normalBuffer, albedoRgba };
}

/**
 * 2D 캔버스 합성용 3단 Z-슬라이스 깊이 분리와 3점 조명 리라이팅 맵을 동시 산출한다.
 */
export function generateDepthSlicesAndRelightingMap(
  scene: DepthSceneFrameInput,
  relightingConfig: ThreePointRelightingConfig,
  sliceInput?: Partial<DepthSliceConfig>,
): DepthAndRelightingCompositeResult {
  const totalPixels = scene.width * scene.height;
  if (
    scene.width <= 0 ||
    scene.height <= 0 ||
    scene.depthBuffer.length < totalPixels ||
    scene.normalBuffer.length < totalPixels * 3 ||
    scene.albedoRgba.length < totalPixels * 4
  ) {
    throw new Error("DepthSceneFrameInput buffers do not match width × height dimensions.");
  }

  const sliceConfig = sanitizeSliceConfig(sliceInput);
  const keyDir = normalizeVec3(relightingConfig.keyLightDirection);
  const fillDir = normalizeVec3({
    x: -keyDir.x * 0.78,
    y: clamp(0.32 + keyDir.y * 0.22, -0.5, 0.85),
    z: Math.max(0.35, keyDir.z * 0.65),
  });
  const rimDir = normalizeVec3({
    x: -keyDir.x * 0.55,
    y: 0.58,
    z: -0.72,
  });

  const fgMask = new Float32Array(totalPixels);
  const charMask = new Float32Array(totalPixels);
  const bgMask = new Float32Array(totalPixels);

  const fgRgba = new Uint8ClampedArray(totalPixels * 4);
  const charRgba = new Uint8ClampedArray(totalPixels * 4);
  const bgRgba = new Uint8ClampedArray(totalPixels * 4);

  const keyIrradianceRgba = new Uint8ClampedArray(totalPixels * 4);
  const rimFresnelRgba = new Uint8ClampedArray(totalPixels * 4);
  const combinedRelitRgba = new Uint8ClampedArray(totalPixels * 4);

  const keyI = clamp(relightingConfig.keyIntensity, 0, 2);
  const fillI = clamp(relightingConfig.fillIntensity, 0, 1.5);
  const rimI = clamp(relightingConfig.rimIntensity, 0, 2);
  const toony = clamp(relightingConfig.shadingToonyFactor, 0, 1);
  const shift = clamp(relightingConfig.shadingShiftFactor, -1, 1);
  const rimPower = clamp(relightingConfig.rimFresnelPower, 0.5, 10);
  const rimLift = clamp(relightingConfig.rimLift, 0, 1);
  const ambientFloor = clamp(relightingConfig.ambientFloor ?? 0.18, 0.05, 0.6);
  const bandHalf = 1 - toony;

  let fgCovered = 0;
  let charCovered = 0;
  let bgCovered = 0;
  let fgWeightSum = 0;
  let charWeightSum = 0;
  let bgWeightSum = 0;
  let fgDepthSum = 0;
  let charDepthSum = 0;
  let bgDepthSum = 0;
  let partitionErrorMax = 0;

  let activeCoverageSum = 0;
  let litIrrSum = 0;
  let litIrrCount = 0;
  let shadowIrrSum = 0;
  let shadowIrrCount = 0;
  let rimActivePixels = 0;
  let visiblePixelCount = 0;
  let relitLumaSum = 0;

  for (let i = 0; i < totalPixels; i += 1) {
    const z = clamp(scene.depthBuffer[i] ?? 1, 0, 1);
    const wFg = 1 - smoothstep(sliceConfig.nearCutZ - sliceConfig.featherDepth, sliceConfig.nearCutZ + sliceConfig.featherDepth, z);
    const wBg = smoothstep(sliceConfig.farCutZ - sliceConfig.featherDepth, sliceConfig.farCutZ + sliceConfig.featherDepth, z);
    const wChar = clamp(1 - wFg - wBg, 0, 1);

    const err = Math.abs(wFg + wChar + wBg - 1);
    if (err > partitionErrorMax) partitionErrorMax = err;

    fgMask[i] = wFg;
    charMask[i] = wChar;
    bgMask[i] = wBg;

    if (wFg >= 0.5) fgCovered += 1;
    if (wChar >= 0.5) charCovered += 1;
    if (wBg >= 0.5) bgCovered += 1;

    fgWeightSum += wFg;
    charWeightSum += wChar;
    bgWeightSum += wBg;
    fgDepthSum += wFg * z;
    charDepthSum += wChar * z;
    bgDepthSum += wBg * z;

    const off4 = i * 4;
    const baseR = (scene.albedoRgba[off4] ?? 0) / 255;
    const baseG = (scene.albedoRgba[off4 + 1] ?? 0) / 255;
    const baseB = (scene.albedoRgba[off4 + 2] ?? 0) / 255;
    const baseA = (scene.albedoRgba[off4 + 3] ?? 255) / 255;

    // 3점 조명 리라이팅 계산 (뷰 공간 법선)
    const nOff = i * 3;
    const normal = normalizeVec3({
      x: scene.normalBuffer[nOff] ?? 0,
      y: scene.normalBuffer[nOff + 1] ?? 0,
      z: scene.normalBuffer[nOff + 2] ?? 1,
    });

    const ndotlKey = dotVec3(normal, keyDir);
    const celStep = linearstep(shift - bandHalf, shift + bandHalf, ndotlKey);
    const fillWrap = clamp(dotVec3(normal, fillDir) * 0.5 + 0.5, 0, 1);

    // 주광 + 보조광(그림자 색온도 틴트) 합성
    const irrR = ambientFloor + celStep * keyI * relightingConfig.keyColor.r + (1 - celStep * 0.65) * fillWrap * fillI * relightingConfig.fillColor.r;
    const irrG = ambientFloor + celStep * keyI * relightingConfig.keyColor.g + (1 - celStep * 0.65) * fillWrap * fillI * relightingConfig.fillColor.g;
    const irrB = ambientFloor + celStep * keyI * relightingConfig.keyColor.b + (1 - celStep * 0.65) * fillWrap * fillI * relightingConfig.fillColor.b;

    // 프레넬 림라이트 (뷰 벡터 V = (0,0,1))
    const ndotv = clamp(normal.z, 0, 1);
    const fresnelBase = clamp(1 - ndotv + rimLift, 0, 1) ** rimPower;
    const rimBackMask = 0.35 + 0.65 * clamp(dotVec3(normal, rimDir) * 0.5 + 0.5, 0, 1);
    const rimWeight = clamp(fresnelBase * rimBackMask * rimI, 0, 1);

    const rimR = rimWeight * relightingConfig.rimColor.r;
    const rimG = rimWeight * relightingConfig.rimColor.g;
    const rimB = rimWeight * relightingConfig.rimColor.b;

    const relitR = clamp(baseR * irrR + rimR * 0.55, 0, 1);
    const relitG = clamp(baseG * irrG + rimG * 0.55, 0, 1);
    const relitB = clamp(baseB * irrB + rimB * 0.55, 0, 1);

    const relitByteR = toByte(relitR);
    const relitByteG = toByte(relitG);
    const relitByteB = toByte(relitB);

    fgRgba[off4] = relitByteR;
    fgRgba[off4 + 1] = relitByteG;
    fgRgba[off4 + 2] = relitByteB;
    fgRgba[off4 + 3] = toByte(baseA * wFg);

    charRgba[off4] = relitByteR;
    charRgba[off4 + 1] = relitByteG;
    charRgba[off4 + 2] = relitByteB;
    charRgba[off4 + 3] = toByte(baseA * wChar);

    bgRgba[off4] = relitByteR;
    bgRgba[off4 + 1] = relitByteG;
    bgRgba[off4 + 2] = relitByteB;
    bgRgba[off4 + 3] = toByte(baseA * wBg);

    keyIrradianceRgba[off4] = toByte(irrR * 0.65);
    keyIrradianceRgba[off4 + 1] = toByte(irrG * 0.65);
    keyIrradianceRgba[off4 + 2] = toByte(irrB * 0.65);
    keyIrradianceRgba[off4 + 3] = toByte(baseA);

    rimFresnelRgba[off4] = toByte(rimR);
    rimFresnelRgba[off4 + 1] = toByte(rimG);
    rimFresnelRgba[off4 + 2] = toByte(rimB);
    rimFresnelRgba[off4 + 3] = toByte(rimWeight);

    const activeWeight = clamp(
      (sliceConfig.visibility.foreground ? wFg : 0) +
        (sliceConfig.visibility.character ? wChar : 0) +
        (sliceConfig.visibility.background ? wBg : 0),
      0,
      1,
    );
    activeCoverageSum += activeWeight;

    combinedRelitRgba[off4] = relitByteR;
    combinedRelitRgba[off4 + 1] = relitByteG;
    combinedRelitRgba[off4 + 2] = relitByteB;
    combinedRelitRgba[off4 + 3] = toByte(baseA * activeWeight);

    if (activeWeight >= 0.25) {
      visiblePixelCount += 1;
      const irrLuma = srgbToRelativeLuminance({
        r: clamp(irrR * 0.65, 0, 1),
        g: clamp(irrG * 0.65, 0, 1),
        b: clamp(irrB * 0.65, 0, 1),
      });
      if (celStep >= 0.5) {
        litIrrSum += irrLuma;
        litIrrCount += 1;
      } else {
        shadowIrrSum += irrLuma;
        shadowIrrCount += 1;
      }
      if (rimWeight >= 0.12) rimActivePixels += 1;
      relitLumaSum += srgbToRelativeLuminance({ r: relitR, g: relitG, b: relitB });
    }
  }

  const litMean = litIrrCount > 0 ? litIrrSum / litIrrCount : 0.65;
  const shadowMean = shadowIrrCount > 0 ? Math.max(0.03, shadowIrrSum / shadowIrrCount) : 0.25;
  const refDir = relightingConfig.referenceLightDirection
    ? normalizeVec3(relightingConfig.referenceLightDirection)
    : keyDir;

  const activeLayerCount =
    (sliceConfig.visibility.foreground ? 1 : 0) +
    (sliceConfig.visibility.character ? 1 : 0) +
    (sliceConfig.visibility.background ? 1 : 0);

  return {
    width: scene.width,
    height: scene.height,
    totalPixels,
    sliceConfig,
    layers: {
      foreground: {
        layerId: "foreground",
        visible: sliceConfig.visibility.foreground,
        zRange: [0, sliceConfig.nearCutZ],
        mask: fgMask,
        rgba: fgRgba,
        coveredPixels: fgCovered,
        coverageRatio: roundTo(fgWeightSum / totalPixels, 4),
        meanDepth: fgWeightSum > 1e-6 ? roundTo(fgDepthSum / fgWeightSum, 4) : 0,
      },
      character: {
        layerId: "character",
        visible: sliceConfig.visibility.character,
        zRange: [sliceConfig.nearCutZ, sliceConfig.farCutZ],
        mask: charMask,
        rgba: charRgba,
        coveredPixels: charCovered,
        coverageRatio: roundTo(charWeightSum / totalPixels, 4),
        meanDepth: charWeightSum > 1e-6 ? roundTo(charDepthSum / charWeightSum, 4) : 0,
      },
      background: {
        layerId: "background",
        visible: sliceConfig.visibility.background,
        zRange: [sliceConfig.farCutZ, 1],
        mask: bgMask,
        rgba: bgRgba,
        coveredPixels: bgCovered,
        coverageRatio: roundTo(bgWeightSum / totalPixels, 4),
        meanDepth: bgWeightSum > 1e-6 ? roundTo(bgDepthSum / bgWeightSum, 4) : 0,
      },
    },
    activeLayerCount,
    activeCoverageRatio: roundTo(activeCoverageSum / totalPixels, 4),
    partitionErrorMax,
    relighting: {
      width: scene.width,
      height: scene.height,
      keyLightDirection: keyDir,
      fillLightDirection: fillDir,
      rimLightDirection: rimDir,
      keyIrradianceRgba,
      rimFresnelRgba,
      combinedRelitRgba,
      metrics: {
        keyFillContrastRatio: roundTo(litMean / shadowMean, 2),
        rimCoverageRatio: visiblePixelCount > 0 ? roundTo(rimActivePixels / visiblePixelCount, 4) : 0,
        meanRelitLuminance: visiblePixelCount > 0 ? roundTo(relitLumaSum / visiblePixelCount, 4) : 0,
        lightDirectionAlignmentCosine: roundTo(clamp(dotVec3(keyDir, refDir), -1, 1), 4),
        celStepSharpness: roundTo(toony, 3),
      },
    },
  };
}
