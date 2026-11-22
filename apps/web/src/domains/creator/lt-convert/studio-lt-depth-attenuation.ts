/**
 * Z-Depth 깊이 감쇠 LT 선화 커널(근경 1.8px · 중경 1.1px · 원경 0.5px),
 * 알파 컷아웃(유리·철망) 노멀 패스 보호 마스크 분리,
 * 그리고 6패스(선화·음영·원색·깊이·노멀·마스크) 자동 그룹화 & 시차(Parallax) 바인딩 계약.
 *
 * - `#031–#032`: 카메라 Z-Depth 정규화 및 2종 프리셋(`인물 집중` / `건축 강조`) 기반
 *   서브픽셀 거리장 선 굵기 감쇠 커널(단면 잉크 질량: 근경 1.8px · 중경 1.1px · 원경 0.5px).
 * - `#033–#034`: 6패스(선화·음영·원색·깊이·노멀·마스크) 레이어 자동 그룹화 및
 *   깊이 대역별 동기화 시차(Parallax) 바인딩 계약.
 * - `#035`: 알파 컷아웃(Alpha-Test) 유리/철망 머티리얼에서 발생하는 노멀 패스 선화 깨짐을
 *   막기 위한 알파 임계치 마스크 패스 분리 및 경계 윤곽선 직접 추출.
 */

export type LtDepthAttenuationPresetId = "character-focus" | "architecture-emphasis";

export type LtDepthBandId = "foreground" | "midground" | "background";

export interface LtDepthAttenuationPreset {
  readonly id: LtDepthAttenuationPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly nearLineWidthPx: number;
  readonly midLineWidthPx: number;
  readonly farLineWidthPx: number;
  /** 근경→중경(0~0.5) 감쇠 지수 (>1이면 근경 굵기를 더 오래 유지). */
  readonly nearCurvePower: number;
  /** 중경→원경(0.5~1) 감쇠 지수 (>1이면 중경 건축 선 굵기를 더 깊게 유지). */
  readonly farCurvePower: number;
  readonly nearBandMaxZ: number;
  readonly farBandMinZ: number;
  readonly normalCreaseThresholdDeg: number;
  readonly depthSilhouetteThreshold: number;
  readonly parallaxFactors: Readonly<Record<LtDepthBandId, number>>;
}

export const LT_DEPTH_STANDARD_WIDTHS_PX = Object.freeze({
  nearPx: 1.8,
  midPx: 1.1,
  farPx: 0.5,
} as const);

export const LT_DEPTH_ATTENUATION_PRESETS: Readonly<
  Record<LtDepthAttenuationPresetId, LtDepthAttenuationPreset>
> = Object.freeze({
  "character-focus": Object.freeze({
    id: "character-focus",
    labelKo: "인물 집중",
    descriptionKo: "근경 인물(1.8px)을 또렷하게 유지하고 원경 배경(0.5px)을 빠르게 얇혀 시선을 모읍니다.",
    nearLineWidthPx: LT_DEPTH_STANDARD_WIDTHS_PX.nearPx,
    midLineWidthPx: LT_DEPTH_STANDARD_WIDTHS_PX.midPx,
    farLineWidthPx: LT_DEPTH_STANDARD_WIDTHS_PX.farPx,
    nearCurvePower: 1.35,
    farCurvePower: 0.78,
    nearBandMaxZ: 0.33,
    farBandMinZ: 0.68,
    normalCreaseThresholdDeg: 36,
    depthSilhouetteThreshold: 0.045,
    parallaxFactors: Object.freeze({
      foreground: 1.35,
      midground: 1.0,
      background: 0.55,
    }),
  }),
  "architecture-emphasis": Object.freeze({
    id: "architecture-emphasis",
    labelKo: "건축 강조",
    descriptionKo: "중경 건축 구조선(1.1px)과 노멀 크리즈를 깊게 유지하면서 원경(0.5px) 투시감을 정리합니다.",
    nearLineWidthPx: LT_DEPTH_STANDARD_WIDTHS_PX.nearPx,
    midLineWidthPx: LT_DEPTH_STANDARD_WIDTHS_PX.midPx,
    farLineWidthPx: LT_DEPTH_STANDARD_WIDTHS_PX.farPx,
    nearCurvePower: 0.85,
    farCurvePower: 1.45,
    nearBandMaxZ: 0.25,
    farBandMinZ: 0.78,
    normalCreaseThresholdDeg: 22,
    depthSilhouetteThreshold: 0.035,
    parallaxFactors: Object.freeze({
      foreground: 1.22,
      midground: 1.0,
      background: 0.68,
    }),
  }),
});

export const LT_DEPTH_PRESET_LIST: readonly LtDepthAttenuationPreset[] = Object.freeze([
  LT_DEPTH_ATTENUATION_PRESETS["character-focus"],
  LT_DEPTH_ATTENUATION_PRESETS["architecture-emphasis"],
]);

export const LT_ALPHA_CUTOUT_THRESHOLD_RANGE = Object.freeze({
  min: 0.05,
  max: 0.95,
  defaultThreshold: 0.5,
} as const);

export interface AlphaCutoutMaskSeparationOptions {
  /** 알파 컷아웃(Alpha-Test) 임계값 (0.05 ~ 0.95, 기본 0.5). */
  readonly alphaThreshold?: number;
  /**
   * 픽셀별 알파 컷아웃 머티리얼 플래그(1=유리·철망 Alpha-Test 머티리얼, 0=일반 불투명).
   * 미지정 시 알파 0~255 전환 경계를 자동 탐지한다.
   */
  readonly materialMask?: Uint8Array;
  /** 선택적 월드/뷰 노멀 버퍼(RGBA8, width*height*4). */
  readonly normalBuffer?: Uint8Array | Uint8ClampedArray;
  /** 노멀 패스 엣지 각도 임계값(도). */
  readonly normalAngleThresholdDeg?: number;
}

export interface AlphaCutoutMaskSeparationResult {
  readonly width: number;
  readonly height: number;
  readonly alphaThreshold: number;
  /** 이진 알파 컷아웃 마스크 (255=불투명 고체, 0=컷아웃 투명 구멍). */
  readonly alphaMask: Uint8Array;
  /** 유리·철망 알파 컷아웃 머티리얼 영역 마스크 (1=컷아웃 대상, 0=일반). */
  readonly cutoutRegionMask: Uint8Array;
  /** 노멀 패스 선화 추출을 차단해야 하는 픽셀 마스크 (1=노멀 엣지 억제). */
  readonly normalPassProtectionMask: Uint8Array;
  /** 알파 임계치 마스크 경계에서 직접 추출한 깔끔한 윤곽선(0/1). */
  readonly cutoutContourEdges: Uint8Array;
  /** 알파 컷아웃 마스크 패스 출력용 RGBA8 버퍼(width*height*4). */
  readonly maskRgba: Uint8ClampedArray<ArrayBuffer>;
  /** 노멀 패스에서 억제된 깨진 가짜 선화 픽셀 수. */
  readonly suppressedNormalArtifactCount: number;
  readonly cutoutSolidPixelCount: number;
  readonly cutoutTransparentPixelCount: number;
  readonly cutoutContourEdgeCount: number;
}

export interface DepthAttenuatedLineKernelInput {
  readonly baseEdgeMask: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly depthBuffer?: Float32Array | Uint8Array;
  readonly normalBuffer?: Uint8Array | Uint8ClampedArray;
  readonly sourceRgba?: ArrayLike<number>;
  readonly presetId?: LtDepthAttenuationPresetId;
  readonly alphaCutout?: AlphaCutoutMaskSeparationResult | null;
}

export interface LtDepthAttenuationReport {
  readonly presetId: LtDepthAttenuationPresetId;
  readonly presetLabelKo: string;
  readonly targetWidthsPx: {
    readonly near: number;
    readonly mid: number;
    readonly far: number;
  };
  readonly bandEdgeCounts: Readonly<Record<LtDepthBandId, number>>;
  readonly meanEffectiveWidthPxByBand: Readonly<Record<LtDepthBandId, number>>;
  readonly alphaCutoutSeparated: boolean;
  readonly alphaCutoutThreshold: number;
  readonly suppressedNormalArtifactCount: number;
  readonly cutoutContourEdgeCount: number;
}

export interface DepthAttenuatedLineKernelResult {
  /** 알파 채널에 서브픽셀 깊이 감쇠 선화가 기록된 RGBA8 버퍼. */
  readonly lineRgba: Uint8ClampedArray<ArrayBuffer>;
  /** 합성된 최종 엣지 중심 마스크(0/1). */
  readonly combinedEdgeMask: Uint8Array;
  /** 픽셀별 계산된 목표 선 굵기(px). */
  readonly widthMapPx: Float32Array;
  readonly report: LtDepthAttenuationReport;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeLtDepthPresetId(presetId?: string | null): LtDepthAttenuationPresetId {
  return presetId === "architecture-emphasis" ? "architecture-emphasis" : "character-focus";
}

export function normalizeAlphaCutoutThreshold(threshold?: number): number {
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return LT_ALPHA_CUTOUT_THRESHOLD_RANGE.defaultThreshold;
  }
  return round3(clamp(threshold, LT_ALPHA_CUTOUT_THRESHOLD_RANGE.min, LT_ALPHA_CUTOUT_THRESHOLD_RANGE.max));
}

/**
 * 원시 깊이 값(Float 0..1, Uint8 0..255, 또는 카메라 미터 거리)을 정규화 Z-Depth(0=근경, 1=원경)로 변환한다.
 */
export function normalizeCameraDepthValue(
  rawDepth: number,
  options?: { readonly isUint8?: boolean; readonly nearMeters?: number; readonly farMeters?: number },
): number {
  if (!Number.isFinite(rawDepth)) return 0.5;
  if (
    typeof options?.nearMeters === "number"
    && typeof options?.farMeters === "number"
    && options.farMeters > options.nearMeters
  ) {
    return clamp((rawDepth - options.nearMeters) / (options.farMeters - options.nearMeters), 0, 1);
  }
  if (options?.isUint8) {
    return clamp(rawDepth / 255, 0, 1);
  }
  return clamp(rawDepth, 0, 1);
}

/**
 * 카메라 정규화 깊이(`zNorm ∈ [0, 1]`)에서 목표 LT 선 굵기(px)를 계산한다.
 * - `z = 0.0` (근경) → 정확히 `1.8px`
 * - `z = 0.5` (중경) → 정확히 `1.1px`
 * - `z = 1.0` (원경) → 정확히 `0.5px`
 */
export function computeDepthAttenuatedLineWidthPx(
  zNormInput: number,
  presetId: LtDepthAttenuationPresetId = "character-focus",
): number {
  const preset = LT_DEPTH_ATTENUATION_PRESETS[normalizeLtDepthPresetId(presetId)];
  const z = clamp(zNormInput, 0, 1);
  if (z <= 0.5) {
    const u = z / 0.5;
    const curved = u ** preset.nearCurvePower;
    return round3(preset.nearLineWidthPx + (preset.midLineWidthPx - preset.nearLineWidthPx) * curved);
  }
  const v = (z - 0.5) / 0.5;
  const curved = v ** preset.farCurvePower;
  return round3(preset.midLineWidthPx + (preset.farLineWidthPx - preset.midLineWidthPx) * curved);
}

export function classifyLtDepthBand(
  zNormInput: number,
  presetId: LtDepthAttenuationPresetId = "character-focus",
): LtDepthBandId {
  const preset = LT_DEPTH_ATTENUATION_PRESETS[normalizeLtDepthPresetId(presetId)];
  const z = clamp(zNormInput, 0, 1);
  if (z <= preset.nearBandMaxZ) return "foreground";
  if (z >= preset.farBandMinZ) return "background";
  return "midground";
}

function readNormalVector(
  buffer: Uint8Array | Uint8ClampedArray,
  pixelIndex: number,
): readonly [number, number, number] {
  const offset = pixelIndex * 4;
  const nx = ((buffer[offset] ?? 128) / 255) * 2 - 1;
  const ny = ((buffer[offset + 1] ?? 128) / 255) * 2 - 1;
  const nz = ((buffer[offset + 2] ?? 255) / 255) * 2 - 1;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-5) return [0, 0, 1];
  return [nx / len, ny / len, nz / len];
}

function isNormalCreaseAt(
  normalBuffer: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  cosThreshold: number,
): boolean {
  const centerIdx = y * width + x;
  const [cx, cy, cz] = readNormalVector(normalBuffer, centerIdx);
  const neighbors: readonly (readonly [number, number])[] = [
    [Math.min(width - 1, x + 1), y],
    [x, Math.min(height - 1, y + 1)],
  ];
  for (const [nx, ny] of neighbors) {
    if (nx === x && ny === y) continue;
    const [ox, oy, oz] = readNormalVector(normalBuffer, ny * width + nx);
    const dot = cx * ox + cy * oy + cz * oz;
    if (dot < cosThreshold) return true;
  }
  return false;
}

/**
 * `#035` 알파 컷아웃(Alpha-Test) 유리/철망 머티리얼의 노멀 패스 선화 깨짐을 막기 위해
 * 알파 임계치 마스크 패스를 분리하고, 컷아웃 영역에서는 노멀 엣지를 억제하는 대신
 * 분리된 알파 마스크 경계에서 깔끔한 윤곽선을 직접 추출한다.
 */
export function separateAlphaCutoutMaskPass(
  sourceRgba: ArrayLike<number>,
  width: number,
  height: number,
  options: AlphaCutoutMaskSeparationOptions = {},
): AlphaCutoutMaskSeparationResult {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const pixels = w * h;
  const alphaThreshold = normalizeAlphaCutoutThreshold(options.alphaThreshold);
  const alphaThreshold255 = alphaThreshold * 255;

  const alphaMask = new Uint8Array(pixels);
  const cutoutRegionMask = new Uint8Array(pixels);
  const normalPassProtectionMask = new Uint8Array(pixels);
  const cutoutContourEdges = new Uint8Array(pixels);
  const maskRgba = new Uint8ClampedArray(pixels * 4);

  const explicitMaterial = options.materialMask && options.materialMask.length >= pixels
    ? options.materialMask
    : null;

  let cutoutSolidPixelCount = 0;
  let cutoutTransparentPixelCount = 0;

  for (let i = 0; i < pixels; i += 1) {
    const aRaw = sourceRgba[i * 4 + 3] ?? 255;
    const aClamped = Number.isFinite(aRaw) ? clamp(aRaw, 0, 255) : 0;
    const isSolid = aClamped >= alphaThreshold255;
    alphaMask[i] = isSolid ? 255 : 0;

    if (explicitMaterial) {
      if ((explicitMaterial[i] ?? 0) > 0) {
        cutoutRegionMask[i] = 1;
      }
    } else if (aClamped < 250) {
      cutoutRegionMask[i] = 1;
    }
  }

  // 자동 탐지 시 컷아웃 구멍에 인접한 1px 고체 픽셀(철망/유리 프레임 테두리)도 컷아웃 보호 영역에 포함
  if (!explicitMaterial) {
    const expanded = new Uint8Array(cutoutRegionMask);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        if (cutoutRegionMask[idx] === 1) continue;
        const left = x > 0 ? cutoutRegionMask[idx - 1] : 0;
        const right = x < w - 1 ? cutoutRegionMask[idx + 1] : 0;
        const up = y > 0 ? cutoutRegionMask[idx - w] : 0;
        const down = y < h - 1 ? cutoutRegionMask[idx + w] : 0;
        if (left === 1 || right === 1 || up === 1 || down === 1) {
          expanded[idx] = 1;
        }
      }
    }
    cutoutRegionMask.set(expanded);
  }

  const normalBuffer = options.normalBuffer && options.normalBuffer.length >= pixels * 4
    ? options.normalBuffer
    : null;
  const normalAngleDeg = clamp(options.normalAngleThresholdDeg ?? 32, 5, 85);
  const cosThreshold = Math.cos((normalAngleDeg * Math.PI) / 180);

  let suppressedNormalArtifactCount = 0;
  let cutoutContourEdgeCount = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      const isCutout = cutoutRegionMask[idx] === 1;
      const isSolid = alphaMask[idx] === 255;

      if (isCutout) {
        normalPassProtectionMask[idx] = 1;
        if (isSolid) {
          cutoutSolidPixelCount += 1;
        } else {
          cutoutTransparentPixelCount += 1;
        }
        if (normalBuffer && isNormalCreaseAt(normalBuffer, w, h, x, y, cosThreshold)) {
          suppressedNormalArtifactCount += 1;
        }

        // 알파 임계치 마스크의 고체 측 경계(철망 선·유리창 프레임)를 깔끔한 윤곽선으로 추출
        if (isSolid) {
          const touchesVoid =
            (x > 0 && alphaMask[idx - 1] === 0)
            || (x < w - 1 && alphaMask[idx + 1] === 0)
            || (y > 0 && alphaMask[idx - w] === 0)
            || (y < h - 1 && alphaMask[idx + w] === 0);
          if (touchesVoid) {
            cutoutContourEdges[idx] = 1;
            cutoutContourEdgeCount += 1;
          }
        }
      } else if (!isSolid) {
        normalPassProtectionMask[idx] = 1;
      }

      const o = idx * 4;
      const maskVal = alphaMask[idx] ?? 0;
      maskRgba[o] = maskVal;
      maskRgba[o + 1] = maskVal;
      maskRgba[o + 2] = maskVal;
      maskRgba[o + 3] = 255;
    }
  }

  return {
    width: w,
    height: h,
    alphaThreshold,
    alphaMask,
    cutoutRegionMask,
    normalPassProtectionMask,
    cutoutContourEdges,
    maskRgba,
    suppressedNormalArtifactCount,
    cutoutSolidPixelCount,
    cutoutTransparentPixelCount,
    cutoutContourEdgeCount,
  };
}

/**
 * Z-Depth 깊이 감쇠 커널을 실행해 근경 1.8px · 중경 1.1px · 원경 0.5px 서브픽셀 선화 버퍼를 생성한다.
 * 알파 컷아웃 마스크 분리가 전달되면 컷아웃 영역의 노멀 크리즈 깨짐을 차단하고 깔끔한 알파 경계선을 합성한다.
 */
export function renderDepthAttenuatedLineBuffer(
  input: DepthAttenuatedLineKernelInput,
): DepthAttenuatedLineKernelResult {
  const { width, height, baseEdgeMask } = input;
  const pixels = width * height;
  const presetId = normalizeLtDepthPresetId(input.presetId);
  const preset = LT_DEPTH_ATTENUATION_PRESETS[presetId];
  const alphaCutout = input.alphaCutout ?? null;

  const isUint8Depth = input.depthBuffer instanceof Uint8Array;
  const hasDepth = input.depthBuffer !== undefined && input.depthBuffer.length >= pixels;
  const depthNorm = new Float32Array(pixels);
  const widthMapPx = new Float32Array(pixels);

  for (let i = 0; i < pixels; i += 1) {
    const z = hasDepth
      ? normalizeCameraDepthValue(input.depthBuffer![i] ?? 0.5, { isUint8: isUint8Depth })
      : 0.5;
    depthNorm[i] = z;
    widthMapPx[i] = computeDepthAttenuatedLineWidthPx(z, presetId);
  }

  const combinedEdgeMask = new Uint8Array(pixels);
  const hasNormal = input.normalBuffer !== undefined && input.normalBuffer.length >= pixels * 4;
  const cosNormalThreshold = Math.cos((preset.normalCreaseThresholdDeg * Math.PI) / 180);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const isProtectedCutout = alphaCutout !== null && alphaCutout.normalPassProtectionMask[idx] === 1;
      const isCutoutVoid = alphaCutout !== null && alphaCutout.alphaMask[idx] === 0;

      if (isCutoutVoid) {
        combinedEdgeMask[idx] = 0;
        continue;
      }

      if (alphaCutout !== null && alphaCutout.cutoutContourEdges[idx] === 1) {
        combinedEdgeMask[idx] = 1;
        continue;
      }

      let isEdge = (baseEdgeMask[idx] ?? 0) === 1 && !isProtectedCutout;

      // 불투명 비-컷아웃 영역에서만 노멀 크리즈 엣지 결합
      if (!isEdge && hasNormal && !isProtectedCutout) {
        if (isNormalCreaseAt(input.normalBuffer!, width, height, x, y, cosNormalThreshold)) {
          isEdge = true;
        }
      }

      // 깊이 불연속 실루엣 결합 (알파 컷아웃 구멍과 무관한 고체 경계)
      if (!isEdge && hasDepth && !isProtectedCutout) {
        const zc = depthNorm[idx] ?? 0.5;
        const zr = x < width - 1 ? (depthNorm[idx + 1] ?? zc) : zc;
        const zd = y < height - 1 ? (depthNorm[idx + width] ?? zc) : zc;
        if (
          Math.abs(zc - zr) >= preset.depthSilhouetteThreshold
          || Math.abs(zc - zd) >= preset.depthSilhouetteThreshold
        ) {
          isEdge = true;
        }
      }

      combinedEdgeMask[idx] = isEdge ? 1 : 0;
    }
  }

  // 서브픽셀 거리장 기반 깊이 감쇠 선화 래스터화 (검색 반경 2px)
  const lineRgba = new Uint8ClampedArray(pixels * 4);
  const bandEdgeCounts: Record<LtDepthBandId, number> = {
    foreground: 0,
    midground: 0,
    background: 0,
  };
  const bandAlphaMass: Record<LtDepthBandId, number> = {
    foreground: 0,
    midground: 0,
    background: 0,
  };

  for (let i = 0; i < pixels; i += 1) {
    if (combinedEdgeMask[i] === 1) {
      const band = classifyLtDepthBand(depthNorm[i] ?? 0.5, presetId);
      bandEdgeCounts[band] += 1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - 2);
    const y1 = Math.min(height - 1, y + 2);
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (alphaCutout !== null && alphaCutout.alphaMask[idx] === 0 && combinedEdgeMask[idx] === 0) {
        // 컷아웃 투명 구멍 안으로 선이 번지지 않도록 경계 1px 바깥까지만 허용하되 완전 투명 소스는 보존
        const rawA = input.sourceRgba ? (input.sourceRgba[idx * 4 + 3] ?? 255) : 255;
        if (rawA === 0) continue;
      }

      let bestCov = 0;
      let bestBand: LtDepthBandId = classifyLtDepthBand(depthNorm[idx] ?? 0.5, presetId);
      const x0 = Math.max(0, x - 2);
      const x1 = Math.min(width - 1, x + 2);

      for (let ny = y0; ny <= y1; ny += 1) {
        const dy = ny - y;
        const rowOffset = ny * width;
        for (let nx = x0; nx <= x1; nx += 1) {
          const nIdx = rowOffset + nx;
          if (combinedEdgeMask[nIdx] !== 1) continue;
          const dx = nx - x;
          const dist = Math.hypot(dx, dy);
          const targetWidth = widthMapPx[nIdx] ?? 1.1;
          let cov: number;
          if (targetWidth >= 1.0) {
            cov = clamp(targetWidth * 0.5 - dist + 0.5, 0, 1);
          } else {
            cov = dist === 0 ? clamp(targetWidth, 0, 1) : 0;
          }
          if (cov > bestCov) {
            bestCov = cov;
            bestBand = classifyLtDepthBand(depthNorm[nIdx] ?? 0.5, presetId);
          }
        }
      }

      if (bestCov > 0) {
        const sourceAlphaScale = input.sourceRgba
          ? clamp((input.sourceRgba[idx * 4 + 3] ?? 255) / 255, 0, 1)
          : 1;
        const effectiveCov = alphaCutout !== null && alphaCutout.cutoutContourEdges[idx] === 1
          ? bestCov
          : bestCov * (alphaCutout !== null ? (alphaCutout.alphaMask[idx] === 255 ? 1 : sourceAlphaScale) : sourceAlphaScale);
        if (effectiveCov > 0) {
          lineRgba[idx * 4 + 3] = Math.round(clamp(effectiveCov, 0, 1) * 255);
          bandAlphaMass[bestBand] += effectiveCov;
        }
      }
    }
  }

  const meanEffectiveWidthPxByBand: Record<LtDepthBandId, number> = {
    foreground: bandEdgeCounts.foreground > 0 ? round3(bandAlphaMass.foreground / bandEdgeCounts.foreground) : 0,
    midground: bandEdgeCounts.midground > 0 ? round3(bandAlphaMass.midground / bandEdgeCounts.midground) : 0,
    background: bandEdgeCounts.background > 0 ? round3(bandAlphaMass.background / bandEdgeCounts.background) : 0,
  };

  return {
    lineRgba,
    combinedEdgeMask,
    widthMapPx,
    report: {
      presetId,
      presetLabelKo: preset.labelKo,
      targetWidthsPx: {
        near: preset.nearLineWidthPx,
        mid: preset.midLineWidthPx,
        far: preset.farLineWidthPx,
      },
      bandEdgeCounts,
      meanEffectiveWidthPxByBand,
      alphaCutoutSeparated: alphaCutout !== null,
      alphaCutoutThreshold: alphaCutout?.alphaThreshold ?? LT_ALPHA_CUTOUT_THRESHOLD_RANGE.defaultThreshold,
      suppressedNormalArtifactCount: alphaCutout?.suppressedNormalArtifactCount ?? 0,
      cutoutContourEdgeCount: alphaCutout?.cutoutContourEdgeCount ?? 0,
    },
  };
}
