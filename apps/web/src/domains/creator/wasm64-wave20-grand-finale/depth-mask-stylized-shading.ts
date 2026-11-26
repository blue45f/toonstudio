/**
 * Wasm64 Wave 20 Grand Finale — 깊이 유도 경계 보존 소프트 매트 추출기 & 실시간 아트디렉션 스타일 셰이더 커널.
 *
 * 1. 깊이 유도 전경·중경·배경 소프트 매트 추출기(Depth-Guided Soft-Matte Extractor):
 *    저해상도이거나 경계가 흐릿한 깊이 맵(Coarse Depth)을 고해상도 원고 선화·채색 가이드 이미지에 맞춰
 *    O(N) 적분 영상 가이드 필터(Guided Filter)와 결합 양방향 필터(Joint Bilateral Filter)로 정제한다.
 *    원고 외곽선에 칼같이 밀착된 전경·중경·배경 3분할 소프트 알파 매트(`합 = 1.0`)를 추출한다.
 * 2. 실시간 아트디렉션 스타일 셰이더 커널(Stylized Art-Direction Shader Kernel):
 *    양자화 셀 음영 밴드(Quantized Cel Bands) + 휘도 연동 다단 크로스해칭(Luminance Crosshatch) +
 *    과슈 포스터 에지 림 하이라이트(Gouache Poster-Edge Rim Accent)를 단일 패스로 합성한다.
 *
 * 외부 서버 호출 없이 로컬 메모리에서 결정론적으로 실행한다(₩0).
 */

import type { Vec3 } from "./disocclusion-inpaint-3dsfx-handgrasp";

export interface DepthGuidedSoftMatteOptions {
  /** 전경/중경 경계 깊이(0=근경, 1=원경, 기본값 0.35) */
  readonly foregroundCutoff?: number;
  /** 중경/배경 경계 깊이(기본값 0.70) */
  readonly backgroundCutoff?: number;
  /** 전이 구간 부드러움 폭(기본값 0.08) */
  readonly softTransitionWidth?: number;
  /** 가이드 필터 창 반경(px, 기본값 4) */
  readonly guidedRadiusPx?: number;
  /** 가이드 필터 정규화 상수 ε(기본값 5e-4) */
  readonly guidedEpsilon?: number;
  /** 결합 양방향 정밀 밀착 반경(px, 기본값 3) */
  readonly jointBilateralRadiusPx?: number;
  /** RGB 색상 거리 표준편차(0..1, 기본값 0.075) */
  readonly colorSigma?: number;
}

export interface DepthGuidedSoftMatteInput {
  readonly width: number;
  readonly height: number;
  readonly guideRgba: Uint8Array | Uint8ClampedArray;
  readonly coarseDepth: Float32Array;
  readonly coarseWidth?: number;
  readonly coarseHeight?: number;
  readonly options?: DepthGuidedSoftMatteOptions;
}

export interface DepthGuidedSoftMatteResult {
  readonly width: number;
  readonly height: number;
  readonly upsampledCoarseDepth: Float32Array;
  readonly refinedDepth: Float32Array;
  readonly foregroundMatte: Float32Array;
  readonly midgroundMatte: Float32Array;
  readonly backgroundMatte: Float32Array;
  readonly coarseEdgeJumpMean: number;
  readonly refinedEdgeJumpMean: number;
  readonly edgeSnapImprovementRatio: number;
  readonly partitionMaxResidual: number;
  readonly serverCostKrw: 0;
}

export interface StylizedArtDirectionShaderInput {
  readonly width: number;
  readonly height: number;
  readonly albedoRgba: Uint8Array | Uint8ClampedArray;
  readonly depthMap?: Float32Array;
  /** 픽셀당 정규화 3D 법선 [nx, ny, nz] 배열(미지정 시 깊이·휘도 기복에서 자동 추정) */
  readonly normalMap?: Float32Array;
  readonly lightDirection?: Vec3;
  readonly viewDirection?: Vec3;
  /** 셀 음영 단계 수(2..6, 기본값 3) */
  readonly celBandCount?: number;
  /** 셀 경계 안티앨리어싱 폭(0..0.2, 기본값 0.03) */
  readonly celSoftness?: number;
  /** 암부 색조 틴트 RGB [0..255] */
  readonly shadowTintRgb?: readonly [number, number, number];
  /** 크로스해칭 선 밀도 강도(0..1, 기본값 0.72) */
  readonly crosshatchDensity?: number;
  /** 크로스해칭 격자 간격(px, 기본값 5) */
  readonly crosshatchPitchPx?: number;
  /** 과슈 안료 포스터화 계조 단계(2..12, 기본값 5) */
  readonly gouachePosterLevels?: number;
  /** 과슈 포스터 윤곽 잉크 강조 강도(0..1, 기본값 0.65) */
  readonly posterEdgeInkStrength?: number;
  /** 림 하이라이트 색상 RGB [0..255] */
  readonly rimAccentRgb?: readonly [number, number, number];
  /** 림 프레넬 거듭제곱 지수(기본값 2.4) */
  readonly rimPower?: number;
  /** 림 하이라이트 합성 강도(0..1, 기본값 0.8) */
  readonly rimStrength?: number;
}

export interface StylizedArtDirectionShaderStats {
  readonly distinctCelBandsUsed: number;
  readonly crosshatchedPixelCount: number;
  readonly rimHighlightedPixelCount: number;
  readonly posterEdgePixelCount: number;
  readonly serverCostKrw: 0;
}

export interface StylizedArtDirectionShaderResult {
  readonly width: number;
  readonly height: number;
  readonly stylizedRgba: Uint8ClampedArray;
  readonly celBandMap: Uint8Array;
  readonly crosshatchCoverage: Float32Array;
  readonly rimAccentMask: Float32Array;
  readonly stats: StylizedArtDirectionShaderStats;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0 + 1e-8) return x >= edge0 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeVec3(v: Vec3, fallback: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : fallback;
}

function upsampleBilinearDepth(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  if (srcW === dstW && srcH === dstH) {
    const copy = new Float32Array(dstW * dstH);
    for (let i = 0; i < copy.length; i++) copy[i] = clamp(src[i] ?? 0, 0, 1);
    return copy;
  }
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const gy = ((y + 0.5) / dstH) * srcH - 0.5;
    const y0 = clamp(Math.floor(gy), 0, srcH - 1);
    const y1 = clamp(y0 + 1, 0, srcH - 1);
    const ty = clamp(gy - y0, 0, 1);

    for (let x = 0; x < dstW; x++) {
      const gx = ((x + 0.5) / dstW) * srcW - 0.5;
      const x0 = clamp(Math.floor(gx), 0, srcW - 1);
      const x1 = clamp(x0 + 1, 0, srcW - 1);
      const tx = clamp(gx - x0, 0, 1);

      const d00 = src[y0 * srcW + x0] ?? 0;
      const d10 = src[y0 * srcW + x1] ?? 0;
      const d01 = src[y1 * srcW + x0] ?? 0;
      const d11 = src[y1 * srcW + x1] ?? 0;
      const top = d00 * (1 - tx) + d10 * tx;
      const bot = d01 * (1 - tx) + d11 * tx;
      out[y * dstW + x] = clamp(top * (1 - ty) + bot * ty, 0, 1);
    }
  }
  return out;
}

/** 적분 영상(Summed-Area Table)을 이용한 O(N) 박스 평균 필터. */
function boxMeanFilter2D(src: Float64Array, width: number, height: number, radius: number): Float64Array {
  const stride = width + 1;
  const sat = new Float64Array((height + 1) * stride);

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    const srcRow = (y - 1) * width;
    const satRow = y * stride;
    const prevSatRow = (y - 1) * stride;
    for (let x = 1; x <= width; x++) {
      rowSum += src[srcRow + x - 1]!;
      sat[satRow + x] = sat[prevSatRow + x]! + rowSum;
    }
  }

  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    const r0 = y0 * stride;
    const r1 = (y1 + 1) * stride;
    const spanY = y1 - y0 + 1;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const count = (x1 - x0 + 1) * spanY;
      const sum = sat[r1 + x1 + 1]! - sat[r0 + x1 + 1]! - sat[r1 + x0]! + sat[r0 + x0]!;
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

function measureGuideEdgeDepthJump(
  guideRgba: Uint8Array | Uint8ClampedArray,
  depth: Float32Array,
  width: number,
  height: number,
): number {
  let jumpSum = 0;
  let edgeCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x + 1 < width; x++) {
      const idx = y * width + x;
      const next = idx + 1;
      const o0 = idx * 4;
      const o1 = next * 4;
      const colorDiff = (
        Math.abs(guideRgba[o0]! - guideRgba[o1]!)
        + Math.abs(guideRgba[o0 + 1]! - guideRgba[o1 + 1]!)
        + Math.abs(guideRgba[o0 + 2]! - guideRgba[o1 + 2]!)
      ) / (3 * 255);
      if (colorDiff >= 0.18) {
        jumpSum += Math.abs(depth[next]! - depth[idx]!);
        edgeCount++;
      }
    }
  }
  for (let y = 0; y + 1 < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const down = idx + width;
      const o0 = idx * 4;
      const o1 = down * 4;
      const colorDiff = (
        Math.abs(guideRgba[o0]! - guideRgba[o1]!)
        + Math.abs(guideRgba[o0 + 1]! - guideRgba[o1 + 1]!)
        + Math.abs(guideRgba[o0 + 2]! - guideRgba[o1 + 2]!)
      ) / (3 * 255);
      if (colorDiff >= 0.18) {
        jumpSum += Math.abs(depth[down]! - depth[idx]!);
        edgeCount++;
      }
    }
  }
  return edgeCount > 0 ? jumpSum / edgeCount : 0;
}

/**
 * 저해상도/흐릿한 깊이 버퍼를 고해상도 원고 선화·채색 경계에 밀착시키고
 * 전경·중경·배경 합이 정확히 1.0인 소프트 알파 매트 3종을 추출한다.
 */
export function extractDepthGuidedSoftMattes(
  input: DepthGuidedSoftMatteInput,
): DepthGuidedSoftMatteResult {
  const { width, height, guideRgba, coarseDepth, options } = input;
  if (width <= 0 || height <= 0) {
    throw new RangeError("원고 해상도는 가로·세로 1px 이상이어야 합니다.");
  }
  const total = width * height;
  if (guideRgba.length < total * 4) {
    throw new RangeError("가이드 RGBA 버퍼 크기가 해상도보다 작습니다.");
  }

  const cW = input.coarseWidth ?? width;
  const cH = input.coarseHeight ?? height;
  if (coarseDepth.length < cW * cH) {
    throw new RangeError("입력 coarseDepth 버퍼 길이가 지정된 저해상도 격자보다 작습니다.");
  }

  const fgCut = clamp(options?.foregroundCutoff ?? 0.35, 0.05, 0.9);
  const bgCut = clamp(options?.backgroundCutoff ?? 0.7, fgCut + 0.05, 0.98);
  const halfTrans = clamp((options?.softTransitionWidth ?? 0.08) * 0.5, 0.005, 0.25);
  const gRadius = Math.max(1, Math.min(16, Math.round(options?.guidedRadiusPx ?? 4)));
  const gEps = Math.max(1e-6, options?.guidedEpsilon ?? 5e-4);
  const jbRadius = Math.max(1, Math.min(8, Math.round(options?.jointBilateralRadiusPx ?? 3)));
  const colorSigma = Math.max(0.01, options?.colorSigma ?? 0.075);

  const upsampledCoarseDepth = upsampleBilinearDepth(coarseDepth, cW, cH, width, height);

  // 1단계: O(N) 적분 영상 기반 가이드 필터(He et al.)
  const guideI = new Float64Array(total);
  const depthP = new Float64Array(total);
  const guideII = new Float64Array(total);
  const prodIP = new Float64Array(total);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = guideRgba[o]! / 255;
    const g = guideRgba[o + 1]! / 255;
    const b = guideRgba[o + 2]! / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const p = upsampledCoarseDepth[i]!;
    guideI[i] = luma;
    depthP[i] = p;
    guideII[i] = luma * luma;
    prodIP[i] = luma * p;
  }

  const meanI = boxMeanFilter2D(guideI, width, height, gRadius);
  const meanP = boxMeanFilter2D(depthP, width, height, gRadius);
  const meanII = boxMeanFilter2D(guideII, width, height, gRadius);
  const meanIP = boxMeanFilter2D(prodIP, width, height, gRadius);

  const coeffA = new Float64Array(total);
  const coeffB = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const mI = meanI[i]!;
    const mP = meanP[i]!;
    const varI = Math.max(0, meanII[i]! - mI * mI);
    const covIP = meanIP[i]! - mI * mP;
    const a = covIP / (varI + gEps);
    coeffA[i] = a;
    coeffB[i] = mP - a * mI;
  }

  const meanA = boxMeanFilter2D(coeffA, width, height, gRadius);
  const meanB = boxMeanFilter2D(coeffB, width, height, gRadius);
  const guidedOut = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    guidedOut[i] = clamp(meanA[i]! * guideI[i]! + meanB[i]!, 0, 1);
  }

  // 2단계: 3채널 RGB 결합 양방향 필터(Joint Bilateral Edge-Snap)로 선화·색면 경계 정밀 밀착
  const refinedDepth = new Float32Array(total);
  const inv2ColorVar = 1 / (2 * colorSigma * colorSigma);
  const spatialSigma = Math.max(1, jbRadius * 0.85);
  const inv2SpatialVar = 1 / (2 * spatialSigma * spatialSigma);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const po = idx * 4;
      const pr = guideRgba[po]! / 255;
      const pg = guideRgba[po + 1]! / 255;
      const pb = guideRgba[po + 2]! / 255;

      let wSum = 0;
      let dSum = 0;
      for (let dy = -jbRadius; dy <= jbRadius; dy++) {
        const qy = y + dy;
        if (qy < 0 || qy >= height) continue;
        for (let dx = -jbRadius; dx <= jbRadius; dx++) {
          const qx = x + dx;
          if (qx < 0 || qx >= width) continue;
          const qIdx = qy * width + qx;
          const qo = qIdx * 4;
          const dr = pr - guideRgba[qo]! / 255;
          const dg = pg - guideRgba[qo + 1]! / 255;
          const db = pb - guideRgba[qo + 2]! / 255;
          const colorDistSq = (dr * dr + dg * dg + db * db) / 3;
          const spatialDistSq = dx * dx + dy * dy;
          const w = Math.exp(-colorDistSq * inv2ColorVar - spatialDistSq * inv2SpatialVar);
          wSum += w;
          dSum += w * guidedOut[qIdx]!;
        }
      }
      refinedDepth[idx] = wSum > 0 ? clamp(dSum / wSum, 0, 1) : guidedOut[idx]!;
    }
  }

  // 3단계: 단위 분할(Partition of Unity) 전경·중경·배경 소프트 매트 분리
  const foregroundMatte = new Float32Array(total);
  const midgroundMatte = new Float32Array(total);
  const backgroundMatte = new Float32Array(total);
  let partitionMaxResidual = 0;

  for (let i = 0; i < total; i++) {
    const d = refinedDepth[i]!;
    const fg = 1 - smoothstep(fgCut - halfTrans, fgCut + halfTrans, d);
    const bg = smoothstep(bgCut - halfTrans, bgCut + halfTrans, d);
    const mg = Math.max(0, 1 - fg - bg);
    const norm = fg + mg + bg;
    const fNorm = norm > 1e-8 ? fg / norm : 0;
    const mNorm = norm > 1e-8 ? mg / norm : 1;
    const bNorm = norm > 1e-8 ? bg / norm : 0;
    foregroundMatte[i] = fNorm;
    midgroundMatte[i] = mNorm;
    backgroundMatte[i] = bNorm;
    const residual = Math.abs(fNorm + mNorm + bNorm - 1);
    if (residual > partitionMaxResidual) partitionMaxResidual = residual;
  }

  const coarseEdgeJumpMean = measureGuideEdgeDepthJump(guideRgba, upsampledCoarseDepth, width, height);
  const refinedEdgeJumpMean = measureGuideEdgeDepthJump(guideRgba, refinedDepth, width, height);
  const edgeSnapImprovementRatio = coarseEdgeJumpMean > 1e-6
    ? refinedEdgeJumpMean / coarseEdgeJumpMean
    : 1;

  return {
    width,
    height,
    upsampledCoarseDepth,
    refinedDepth,
    foregroundMatte,
    midgroundMatte,
    backgroundMatte,
    coarseEdgeJumpMean,
    refinedEdgeJumpMean,
    edgeSnapImprovementRatio,
    partitionMaxResidual,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 실시간 아트디렉션 스타일 셰이더 커널(셀 음영 + 휘도 크로스해칭 + 과슈 포스터 에지 림)
// ============================================================================

function samplePseudoNormal(
  x: number,
  y: number,
  width: number,
  height: number,
  lumaBuf: Float32Array,
  depthMap: Float32Array | undefined,
): Vec3 {
  const xm = Math.max(0, x - 1);
  const xp = Math.min(width - 1, x + 1);
  const ym = Math.max(0, y - 1);
  const yp = Math.min(height - 1, y + 1);

  const lGradX = (lumaBuf[y * width + xp]! - lumaBuf[y * width + xm]!) * 1.4;
  const lGradY = (lumaBuf[yp * width + x]! - lumaBuf[ym * width + x]!) * 1.4;
  let dGradX = 0;
  let dGradY = 0;
  if (depthMap && depthMap.length >= width * height) {
    dGradX = (depthMap[y * width + xp]! - depthMap[y * width + xm]!) * 3.2;
    dGradY = (depthMap[yp * width + x]! - depthMap[ym * width + x]!) * 3.2;
  }
  return normalizeVec3(
    { x: -(lGradX + dGradX), y: -(lGradY + dGradY), z: 1 },
    { x: 0, y: 0, z: 1 },
  );
}

function proceduralCrosshatchStroke(
  x: number,
  y: number,
  effectiveTone: number,
  pitchPx: number,
  density: number,
): number {
  if (density <= 1e-4 || effectiveTone >= 0.62) return 0;

  const invSqrt2 = Math.SQRT1_2;
  const u1 = (x + y) * invSqrt2;
  const u2 = (x - y) * invSqrt2;
  const phaseDist = (coord: number, period: number): number => {
    const f = ((coord % period) + period) % period;
    return Math.abs(f - period * 0.5) / (period * 0.5);
  };

  let ink = 0;
  // 1차 사선 해칭(+45도): 중간 암부(tone < 0.62)
  if (effectiveTone < 0.62) {
    const darkness1 = clamp((0.62 - effectiveTone) / 0.45, 0, 1);
    const halfWidth1 = 0.14 + 0.34 * darkness1 * density;
    const d1 = phaseDist(u1, pitchPx);
    ink = Math.max(ink, 1 - smoothstep(halfWidth1 * 0.7, halfWidth1 + 0.08, d1));
  }
  // 2차 교차 해칭(-45도): 깊은 암부(tone < 0.38)
  if (effectiveTone < 0.38) {
    const darkness2 = clamp((0.38 - effectiveTone) / 0.30, 0, 1);
    const halfWidth2 = 0.16 + 0.36 * darkness2 * density;
    const d2 = phaseDist(u2, pitchPx);
    ink = Math.max(ink, 1 - smoothstep(halfWidth2 * 0.7, halfWidth2 + 0.08, d2));
  }
  // 3차 수평 코어 해칭: 최암부(tone < 0.20)
  if (effectiveTone < 0.20) {
    const darkness3 = clamp((0.20 - effectiveTone) / 0.20, 0, 1);
    const halfWidth3 = 0.18 + 0.32 * darkness3 * density;
    const d3 = phaseDist(y, Math.max(2, pitchPx * 0.85));
    ink = Math.max(ink, 1 - smoothstep(halfWidth3 * 0.7, halfWidth3 + 0.08, d3));
  }
  return clamp(ink * density, 0, 1);
}

/**
 * 양자화 셀 밴드 + 휘도 연동 크로스해칭 + 과슈 포스터 에지 림 하이라이트를 합성한다.
 */
export function renderStylizedArtDirectionShader(
  input: StylizedArtDirectionShaderInput,
): StylizedArtDirectionShaderResult {
  const { width, height, albedoRgba, depthMap, normalMap } = input;
  if (width <= 0 || height <= 0) {
    throw new RangeError("셰이더 커널 입력 해상도는 1px 이상이어야 합니다.");
  }
  const total = width * height;
  if (albedoRgba.length < total * 4) {
    throw new RangeError("알베도 RGBA 버퍼 길이가 해상도와 일치하지 않습니다.");
  }

  const lightDir = normalizeVec3(input.lightDirection ?? { x: -0.45, y: -0.55, z: 0.70 }, { x: 0, y: 0, z: 1 });
  const viewDir = normalizeVec3(input.viewDirection ?? { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 });
  const celBands = Math.max(2, Math.min(8, Math.round(input.celBandCount ?? 3)));
  const celSoftness = clamp(input.celSoftness ?? 0.03, 0, 0.2);
  const shadowTint = input.shadowTintRgb ?? [46, 52, 92];
  const hatchDensity = clamp(input.crosshatchDensity ?? 0.72, 0, 1);
  const hatchPitch = Math.max(2, input.crosshatchPitchPx ?? 5);
  const posterLevels = Math.max(2, Math.min(16, Math.round(input.gouachePosterLevels ?? 5)));
  const posterEdgeStrength = clamp(input.posterEdgeInkStrength ?? 0.65, 0, 1);
  const rimRgb = input.rimAccentRgb ?? [255, 232, 168];
  const rimPower = Math.max(0.5, input.rimPower ?? 2.4);
  const rimStrength = clamp(input.rimStrength ?? 0.8, 0, 1);

  const lumaBuf = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    lumaBuf[i] = (0.2126 * albedoRgba[o]! + 0.7152 * albedoRgba[o + 1]! + 0.0722 * albedoRgba[o + 2]!) / 255;
  }

  const stylizedRgba = new Uint8ClampedArray(total * 4);
  const celBandMap = new Uint8Array(total);
  const crosshatchCoverage = new Float32Array(total);
  const rimAccentMask = new Float32Array(total);
  const usedBands = new Set<number>();

  let crosshatchedPixelCount = 0;
  let rimHighlightedPixelCount = 0;
  let posterEdgePixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const o = idx * 4;
      const alpha = albedoRgba[o + 3]!;
      if (alpha === 0) continue;

      const baseR = albedoRgba[o]! / 255;
      const baseG = albedoRgba[o + 1]! / 255;
      const baseB = albedoRgba[o + 2]! / 255;
      const baseLuma = lumaBuf[idx]!;

      let nrm: Vec3;
      if (normalMap && normalMap.length >= total * 3) {
        nrm = normalizeVec3(
          { x: normalMap[idx * 3]!, y: normalMap[idx * 3 + 1]!, z: normalMap[idx * 3 + 2]! },
          { x: 0, y: 0, z: 1 },
        );
      } else {
        nrm = samplePseudoNormal(x, y, width, height, lumaBuf, depthMap);
      }

      // 1. 양자화 셀 밴드(Half-Lambert + 원고 명암 결합)
      const halfLambert = 0.5 * (nrm.x * lightDir.x + nrm.y * lightDir.y + nrm.z * lightDir.z + 1);
      const rawTone = clamp(0.62 * halfLambert + 0.38 * baseLuma, 0, 1);
      const scaledBand = rawTone * celBands;
      const bandIdx = Math.min(celBands - 1, Math.floor(scaledBand));
      const bandFrac = scaledBand - bandIdx;
      const smoothStepUp = bandIdx < celBands - 1 && celSoftness > 0
        ? smoothstep(1 - celSoftness, 1, bandFrac)
        : 0;
      const celFactor = (bandIdx + smoothStepUp) / Math.max(1, celBands - 1);

      celBandMap[idx] = bandIdx;
      usedBands.add(bandIdx);

      // 과슈 포스터 계조 양자화(불투명 매트 안료 질감)
      const posterize = (ch: number): number => Math.round(ch * (posterLevels - 1)) / (posterLevels - 1);
      const gouacheR = posterize(baseR);
      const gouacheG = posterize(baseG);
      const gouacheB = posterize(baseB);

      const shadowMix = 1 - celFactor;
      const litScale = 0.48 + 0.52 * celFactor;
      let outR = gouacheR * litScale * (1 - 0.38 * shadowMix) + (shadowTint[0] / 255) * 0.38 * shadowMix;
      let outG = gouacheG * litScale * (1 - 0.38 * shadowMix) + (shadowTint[1] / 255) * 0.38 * shadowMix;
      let outB = gouacheB * litScale * (1 - 0.38 * shadowMix) + (shadowTint[2] / 255) * 0.38 * shadowMix;

      // 2. 휘도 연동 다단 크로스해칭
      const effectiveLuma = clamp(0.55 * celFactor + 0.45 * baseLuma, 0, 1);
      const hatch = proceduralCrosshatchStroke(x, y, effectiveLuma, hatchPitch, hatchDensity);
      crosshatchCoverage[idx] = hatch;
      if (hatch > 0.08) crosshatchedPixelCount++;

      const inkR = (shadowTint[0] / 255) * 0.35;
      const inkG = (shadowTint[1] / 255) * 0.35;
      const inkB = (shadowTint[2] / 255) * 0.42;
      outR = outR * (1 - hatch * 0.78) + inkR * (hatch * 0.78);
      outG = outG * (1 - hatch * 0.78) + inkG * (hatch * 0.78);
      outB = outB * (1 - hatch * 0.78) + inkB * (hatch * 0.78);

      // 3. 과슈 포스터 에지 검출 + 실루엣 림 하이라이트(Rim Accent)
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(height - 1, y + 1);
      const sobelLuma = Math.hypot(
        lumaBuf[y * width + xp]! - lumaBuf[y * width + xm]!,
        lumaBuf[yp * width + x]! - lumaBuf[ym * width + x]!,
      );
      const depthJump = depthMap && depthMap.length >= total
        ? Math.hypot(
          depthMap[y * width + xp]! - depthMap[y * width + xm]!,
          depthMap[yp * width + x]! - depthMap[ym * width + x]!,
        )
        : 0;

      const posterEdge = smoothstep(0.18, 0.42, sobelLuma + depthJump * 1.4) * posterEdgeStrength;
      if (posterEdge > 0.2) posterEdgePixelCount++;

      // 과슈 포스터 경계선 잉크 밀도 보강
      outR *= 1 - posterEdge * 0.42;
      outG *= 1 - posterEdge * 0.42;
      outB *= 1 - posterEdge * 0.38;

      const ndotv = clamp(nrm.x * viewDir.x + nrm.y * viewDir.y + nrm.z * viewDir.z, 0, 1);
      const fresnel = Math.pow(1 - ndotv, rimPower);
      const silhouetteBoost = smoothstep(0.08, 0.28, depthJump + sobelLuma * 0.55);
      const rimQuantized = smoothstep(0.32, 0.52, Math.max(fresnel, silhouetteBoost * 0.85)) * rimStrength;
      rimAccentMask[idx] = rimQuantized;
      if (rimQuantized > 0.15) rimHighlightedPixelCount++;

      // 스크린 혼합으로 과슈 림 하이라이트 적층
      const rimR = (rimRgb[0] / 255) * rimQuantized;
      const rimG = (rimRgb[1] / 255) * rimQuantized;
      const rimB = (rimRgb[2] / 255) * rimQuantized;
      outR = 1 - (1 - clamp(outR, 0, 1)) * (1 - rimR);
      outG = 1 - (1 - clamp(outG, 0, 1)) * (1 - rimG);
      outB = 1 - (1 - clamp(outB, 0, 1)) * (1 - rimB);

      stylizedRgba[o] = Math.round(clamp(outR, 0, 1) * 255);
      stylizedRgba[o + 1] = Math.round(clamp(outG, 0, 1) * 255);
      stylizedRgba[o + 2] = Math.round(clamp(outB, 0, 1) * 255);
      stylizedRgba[o + 3] = alpha;
    }
  }

  return {
    width,
    height,
    stylizedRgba,
    celBandMap,
    crosshatchCoverage,
    rimAccentMask,
    stats: {
      distinctCelBandsUsed: usedBands.size,
      crosshatchedPixelCount,
      rimHighlightedPixelCount,
      posterEdgePixelCount,
      serverCostKrw: 0,
    },
  };
}
