/**
 * 외부 SKP/GLB 4K~8K 텍스처 기기별 VRAM 프로필 로컬 다운샘플러.
 *
 * - 기기 프로필별 상한: `mobile` 1024px / `desktop` 2048px / `workstation` 4096px.
 * - 종횡비와 2의 거듭제곱(PoT) 경계를 지키며 로컬에서 다운샘플링 계획과
 *   실제 RGBA8 픽셀 박스필터 리사이징(정수 비율 고속 경로 + 임의 비율 면적 가중 박스필터,
 *   노멀맵 단위 벡터 재정규화 포함)을 ₩0 순수 로컬로 수행한다.
 * - 모든 결과에 원본 SKP/GLB 출처·재질·채널·원본 해상도·해시·권리 태그 메타를 불변 보존한다.
 * - 브라우저 키-값 저장소를 일절 호출하지 않고 순수 인메모리 변환만 수행한다.
 */

export type Bg3dTextureDeviceProfileId = "mobile" | "desktop" | "workstation";

export type Bg3dExternalTextureFormat =
  | "skp"
  | "glb"
  | "gltf"
  | "png"
  | "jpeg"
  | "webp";

export type Bg3dTextureChannelKind =
  | "baseColor"
  | "normal"
  | "roughness"
  | "metallicRoughness"
  | "emissive"
  | "occlusion"
  | "lineMask";

export type Bg3dPowerOfTwoBoundaryMode =
  | "longest-edge-boundary"
  | "both-edges";

export interface Bg3dTextureDeviceProfile {
  readonly id: Bg3dTextureDeviceProfileId;
  readonly labelKo: string;
  readonly maxTextureEdgePx: number;
  readonly vramBudgetMb: number;
  readonly preserveMipmaps: boolean;
}

export const BG3D_TEXTURE_MIN_EDGE_PX = 1;
export const BG3D_TEXTURE_MAX_SUPPORTED_EDGE_PX = 16_384;

export const BG3D_TEXTURE_DEVICE_PROFILES: Readonly<
  Record<Bg3dTextureDeviceProfileId, Bg3dTextureDeviceProfile>
> = Object.freeze({
  mobile: Object.freeze({
    id: "mobile",
    labelKo: "모바일 · 태블릿",
    maxTextureEdgePx: 1024,
    vramBudgetMb: 256,
    preserveMipmaps: true,
  }),
  desktop: Object.freeze({
    id: "desktop",
    labelKo: "데스크톱 표준",
    maxTextureEdgePx: 2048,
    vramBudgetMb: 1024,
    preserveMipmaps: true,
  }),
  workstation: Object.freeze({
    id: "workstation",
    labelKo: "워크스테이션 · 고사양",
    maxTextureEdgePx: 4096,
    vramBudgetMb: 4096,
    preserveMipmaps: true,
  }),
});

export interface Bg3dTextureDeviceSignals {
  readonly coarsePointer?: boolean;
  readonly viewportWidthPx?: number | null;
  readonly deviceMemoryGb?: number | null;
  readonly maxTextureSizeGpu?: number | null;
  readonly hardwareConcurrency?: number | null;
}

export interface Bg3dTextureSourceMetadata {
  readonly textureId: string;
  readonly sourceFormat: Bg3dExternalTextureFormat;
  readonly sourceFileName: string;
  readonly materialName: string;
  readonly channel: Bg3dTextureChannelKind;
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly colorSpace: "srgb" | "linear";
  readonly sourceUri?: string | null;
  readonly contentSha256?: string | null;
  readonly rightsTag?: string | null;
}

export interface Bg3dTextureDownsamplePlanOptions {
  readonly powerOfTwoMode?: Bg3dPowerOfTwoBoundaryMode;
  readonly includeMipmaps?: boolean;
  readonly bytesPerPixel?: number;
}

export interface Bg3dComputedTextureDimensions {
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly effectiveMaxEdgePx: number;
  readonly scaleFactor: number;
  readonly needsDownsample: boolean;
  readonly isTargetPowerOfTwo: boolean;
  readonly isLongestEdgePowerOfTwo: boolean;
  readonly aspectRatioDelta: number;
}

export interface Bg3dTextureDownsamplePlan {
  readonly profileId: Bg3dTextureDeviceProfileId;
  readonly profile: Bg3dTextureDeviceProfile;
  readonly sourceMeta: Bg3dTextureSourceMetadata;
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly effectiveMaxEdgePx: number;
  readonly scaleFactor: number;
  readonly needsDownsample: boolean;
  readonly isTargetPowerOfTwo: boolean;
  readonly isLongestEdgePowerOfTwo: boolean;
  readonly aspectRatioDelta: number;
  readonly originalVramBytes: number;
  readonly targetVramBytes: number;
  readonly savedVramBytes: number;
  readonly vramSavingsRatio: number;
  readonly vramSavingsPercent: number;
}

export interface Bg3dTextureBatchDownsamplePlan {
  readonly profileId: Bg3dTextureDeviceProfileId;
  readonly profile: Bg3dTextureDeviceProfile;
  readonly plans: readonly Bg3dTextureDownsamplePlan[];
  readonly totalOriginalVramBytes: number;
  readonly totalTargetVramBytes: number;
  readonly totalSavedVramBytes: number;
  readonly overallVramSavingsRatio: number;
  readonly overallVramSavingsPercent: number;
  readonly downsampledCount: number;
  readonly unchangedCount: number;
  readonly withinVramBudget: boolean;
}

export interface RgbaBoxFilterInput {
  readonly pixels: Uint8ClampedArray | Uint8Array;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly renormalizeNormals?: boolean;
}

export interface DownsampleBg3dTextureInput {
  readonly sourceMeta: Bg3dTextureSourceMetadata;
  readonly pixels: Uint8ClampedArray | Uint8Array;
  readonly profileId: Bg3dTextureDeviceProfileId;
  readonly options?: Bg3dTextureDownsamplePlanOptions;
}

export interface Bg3dDownsampledTextureResult {
  readonly plan: Bg3dTextureDownsamplePlan;
  readonly sourceMeta: Bg3dTextureSourceMetadata;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly downsampledFromOriginal: boolean;
}

function assertValidEdge(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    value < BG3D_TEXTURE_MIN_EDGE_PX ||
    value > BG3D_TEXTURE_MAX_SUPPORTED_EDGE_PX
  ) {
    throw new Error(
      `${label}는 ${BG3D_TEXTURE_MIN_EDGE_PX}~${BG3D_TEXTURE_MAX_SUPPORTED_EDGE_PX} 사이의 정수여야 합니다.`,
    );
  }
  return value;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 양의 정수가 2의 거듭제곱인지 판별한다. */
export function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && (value & (value - 1)) === 0;
}

/** 주어진 값 이하에서 가장 큰 2의 거듭제곱 정수를 반환한다. */
export function floorPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  let power = 1;
  const floored = Math.floor(value);
  while (power * 2 <= floored) {
    power *= 2;
  }
  return power;
}

/** 주어진 값에 가장 가까운 2의 거듭제곱 정수를 상한 내에서 반환한다. */
export function nearestPowerOfTwo(value: number, maxEdgePx: number): number {
  const cap = floorPowerOfTwo(maxEdgePx);
  if (!Number.isFinite(value) || value <= 1) return 1;
  const low = Math.min(cap, floorPowerOfTwo(value));
  const high = Math.min(cap, low * 2);
  return value - low <= high - value ? low : high;
}

/** 기기 신호(포인터·뷰포트·RAM·GPU 최대 텍스처 크기)로 VRAM 프로필을 추론한다. */
export function detectBg3dTextureDeviceProfile(
  signals: Bg3dTextureDeviceSignals,
): Bg3dTextureDeviceProfileId {
  const narrowViewport =
    isFinitePositive(signals.viewportWidthPx) && signals.viewportWidthPx <= 820;
  const lowMemory =
    isFinitePositive(signals.deviceMemoryGb) && signals.deviceMemoryGb <= 4;
  const constrainedGpu =
    isFinitePositive(signals.maxTextureSizeGpu) &&
    signals.maxTextureSizeGpu <= 2048;

  if (signals.coarsePointer || narrowViewport || lowMemory || constrainedGpu) {
    return "mobile";
  }

  const highMemory =
    isFinitePositive(signals.deviceMemoryGb) && signals.deviceMemoryGb >= 16;
  const highGpu =
    isFinitePositive(signals.maxTextureSizeGpu) &&
    signals.maxTextureSizeGpu >= 8192;
  const manyCores =
    isFinitePositive(signals.hardwareConcurrency) &&
    signals.hardwareConcurrency >= 12;

  if (highMemory && (highGpu || manyCores)) {
    return "workstation";
  }

  return "desktop";
}

/**
 * 텍스처의 GPU VRAM 점유 바이트(RGBA8 기본 + 선택적 밉맵 체인)를 정확히 계산한다.
 */
export function estimateTextureVramBytes(
  width: number,
  height: number,
  options: {
    readonly includeMipmaps?: boolean;
    readonly bytesPerPixel?: number;
  } = {},
): number {
  const safeW = assertValidEdge(width, "텍스처 너비");
  const safeH = assertValidEdge(height, "텍스처 높이");
  const bytesPerPixel = options.bytesPerPixel ?? 4;
  if (!Number.isSafeInteger(bytesPerPixel) || bytesPerPixel < 1 || bytesPerPixel > 16) {
    throw new Error("픽셀당 바이트 수는 1~16 사이의 정수여야 합니다.");
  }

  if (options.includeMipmaps === false) {
    return safeW * safeH * bytesPerPixel;
  }

  let total = 0;
  let mipW = safeW;
  let mipH = safeH;
  while (true) {
    total += mipW * mipH * bytesPerPixel;
    if (mipW === 1 && mipH === 1) break;
    mipW = Math.max(1, Math.floor(mipW / 2));
    mipH = Math.max(1, Math.floor(mipH / 2));
  }
  return total;
}

/**
 * 기기 상한(2의 거듭제곱 경계)에 맞춰 업스케일 없이 목표 텍스처 크기를 계산한다.
 * - 원본 양변이 2의 거듭제곱(예: 4096×4096, 8192×4096)이면 양변 모두 2의 거듭제곱과
 *   원본 종횡비를 오차 0으로 동시 보존한다.
 * - 비정방 NPOT(예: SKP 4000×3000)는 기본 `"longest-edge-boundary"` 모드에서 긴 변을
 *   정확한 2의 거듭제곱 상한(1024/2048/4096)에 맞추고 짧은 변을 비례 축소해 종횡비를 지킨다.
 */
export function computeDownsampledTextureDimensions(
  originalWidth: number,
  originalHeight: number,
  maxEdgePx: number,
  options: { readonly powerOfTwoMode?: Bg3dPowerOfTwoBoundaryMode } = {},
): Bg3dComputedTextureDimensions {
  const srcW = assertValidEdge(originalWidth, "원본 텍스처 너비");
  const srcH = assertValidEdge(originalHeight, "원본 텍스처 높이");
  const effectiveMaxEdgePx = floorPowerOfTwo(
    assertValidEdge(maxEdgePx, "최대 텍스처 변 길이"),
  );
  const mode = options.powerOfTwoMode ?? "longest-edge-boundary";

  const longest = Math.max(srcW, srcH);
  const originalAspect = srcW / srcH;

  if (longest <= effectiveMaxEdgePx) {
    return Object.freeze({
      targetWidth: srcW,
      targetHeight: srcH,
      effectiveMaxEdgePx,
      scaleFactor: 1,
      needsDownsample: false,
      isTargetPowerOfTwo: isPowerOfTwo(srcW) && isPowerOfTwo(srcH),
      isLongestEdgePowerOfTwo: isPowerOfTwo(longest),
      aspectRatioDelta: 0,
    });
  }

  const ratio = effectiveMaxEdgePx / longest;
  let targetWidth: number;
  let targetHeight: number;

  if (srcW >= srcH) {
    targetWidth = effectiveMaxEdgePx;
    const rawHeight = Math.max(1, Math.round(srcH * ratio));
    targetHeight =
      mode === "both-edges"
        ? nearestPowerOfTwo(rawHeight, effectiveMaxEdgePx)
        : rawHeight;
  } else {
    targetHeight = effectiveMaxEdgePx;
    const rawWidth = Math.max(1, Math.round(srcW * ratio));
    targetWidth =
      mode === "both-edges"
        ? nearestPowerOfTwo(rawWidth, effectiveMaxEdgePx)
        : rawWidth;
  }

  const targetAspect = targetWidth / targetHeight;
  const aspectRatioDelta =
    Math.round((Math.abs(targetAspect - originalAspect) / originalAspect) * 1e6) /
    1e6;

  return Object.freeze({
    targetWidth,
    targetHeight,
    effectiveMaxEdgePx,
    scaleFactor: Math.round(ratio * 1e6) / 1e6,
    needsDownsample: targetWidth < srcW || targetHeight < srcH,
    isTargetPowerOfTwo: isPowerOfTwo(targetWidth) && isPowerOfTwo(targetHeight),
    isLongestEdgePowerOfTwo: isPowerOfTwo(Math.max(targetWidth, targetHeight)),
    aspectRatioDelta,
  });
}

function freezeSourceMetadata(
  meta: Bg3dTextureSourceMetadata,
): Bg3dTextureSourceMetadata {
  const textureId = meta.textureId.trim();
  const sourceFileName = meta.sourceFileName.trim();
  const materialName = meta.materialName.trim();
  if (!textureId) throw new Error("텍스처 ID가 비어 있습니다.");
  if (!sourceFileName) throw new Error("원본 파일명이 비어 있습니다.");
  if (!materialName) throw new Error("재질 이름이 비어 있습니다.");

  return Object.freeze({
    textureId,
    sourceFormat: meta.sourceFormat,
    sourceFileName,
    materialName,
    channel: meta.channel,
    originalWidth: assertValidEdge(meta.originalWidth, "원본 텍스처 너비"),
    originalHeight: assertValidEdge(meta.originalHeight, "원본 텍스처 높이"),
    colorSpace: meta.colorSpace,
    sourceUri: meta.sourceUri ?? null,
    contentSha256: meta.contentSha256 ?? null,
    rightsTag: meta.rightsTag ?? null,
  });
}

/** 단건 외부 텍스처의 기기별 다운샘플링 계획과 VRAM 절감률을 계산한다. */
export function planBg3dTextureDownsample(
  sourceMeta: Bg3dTextureSourceMetadata,
  profileId: Bg3dTextureDeviceProfileId,
  options: Bg3dTextureDownsamplePlanOptions = {},
): Bg3dTextureDownsamplePlan {
  const profile = BG3D_TEXTURE_DEVICE_PROFILES[profileId];
  const frozenMeta = freezeSourceMetadata(sourceMeta);
  const dims = computeDownsampledTextureDimensions(
    frozenMeta.originalWidth,
    frozenMeta.originalHeight,
    profile.maxTextureEdgePx,
    { powerOfTwoMode: options.powerOfTwoMode },
  );

  const includeMipmaps = options.includeMipmaps ?? profile.preserveMipmaps;
  const bytesPerPixel = options.bytesPerPixel ?? 4;
  const originalVramBytes = estimateTextureVramBytes(
    frozenMeta.originalWidth,
    frozenMeta.originalHeight,
    { includeMipmaps, bytesPerPixel },
  );
  const targetVramBytes = estimateTextureVramBytes(
    dims.targetWidth,
    dims.targetHeight,
    { includeMipmaps, bytesPerPixel },
  );
  const savedVramBytes = Math.max(0, originalVramBytes - targetVramBytes);
  const vramSavingsRatio =
    originalVramBytes > 0 ? savedVramBytes / originalVramBytes : 0;
  const vramSavingsPercent = Math.round(vramSavingsRatio * 10_000) / 100;

  return Object.freeze({
    profileId,
    profile,
    sourceMeta: frozenMeta,
    originalWidth: frozenMeta.originalWidth,
    originalHeight: frozenMeta.originalHeight,
    targetWidth: dims.targetWidth,
    targetHeight: dims.targetHeight,
    effectiveMaxEdgePx: dims.effectiveMaxEdgePx,
    scaleFactor: dims.scaleFactor,
    needsDownsample: dims.needsDownsample,
    isTargetPowerOfTwo: dims.isTargetPowerOfTwo,
    isLongestEdgePowerOfTwo: dims.isLongestEdgePowerOfTwo,
    aspectRatioDelta: dims.aspectRatioDelta,
    originalVramBytes,
    targetVramBytes,
    savedVramBytes,
    vramSavingsRatio,
    vramSavingsPercent,
  });
}

/** 여러 SKP/GLB 텍스처 묶음의 기기별 다운샘플링 계획과 총 VRAM 절감률을 산출한다. */
export function planBg3dTextureBatchDownsample(
  sources: readonly Bg3dTextureSourceMetadata[],
  profileId: Bg3dTextureDeviceProfileId,
  options: Bg3dTextureDownsamplePlanOptions = {},
): Bg3dTextureBatchDownsamplePlan {
  const profile = BG3D_TEXTURE_DEVICE_PROFILES[profileId];
  const plans = sources.map((source) =>
    planBg3dTextureDownsample(source, profileId, options),
  );

  let totalOriginalVramBytes = 0;
  let totalTargetVramBytes = 0;
  let downsampledCount = 0;
  let unchangedCount = 0;

  for (const plan of plans) {
    totalOriginalVramBytes += plan.originalVramBytes;
    totalTargetVramBytes += plan.targetVramBytes;
    if (plan.needsDownsample) {
      downsampledCount += 1;
    } else {
      unchangedCount += 1;
    }
  }

  const totalSavedVramBytes = Math.max(
    0,
    totalOriginalVramBytes - totalTargetVramBytes,
  );
  const overallVramSavingsRatio =
    totalOriginalVramBytes > 0
      ? totalSavedVramBytes / totalOriginalVramBytes
      : 0;
  const overallVramSavingsPercent =
    Math.round(overallVramSavingsRatio * 10_000) / 100;
  const budgetBytes = profile.vramBudgetMb * 1024 * 1024;

  return Object.freeze({
    profileId,
    profile,
    plans: Object.freeze(plans),
    totalOriginalVramBytes,
    totalTargetVramBytes,
    totalSavedVramBytes,
    overallVramSavingsRatio,
    overallVramSavingsPercent,
    downsampledCount,
    unchangedCount,
    withinVramBudget: totalTargetVramBytes <= budgetBytes,
  });
}

function writeBoxFilteredPixel(
  dst: Uint8ClampedArray,
  dstOffset: number,
  rAvg: number,
  gAvg: number,
  bAvg: number,
  aAvg: number,
  renormalizeNormals: boolean,
): void {
  if (!renormalizeNormals) {
    dst[dstOffset] = Math.round(rAvg);
    dst[dstOffset + 1] = Math.round(gAvg);
    dst[dstOffset + 2] = Math.round(bAvg);
    dst[dstOffset + 3] = Math.round(aAvg);
    return;
  }

  const nx = (rAvg / 255) * 2 - 1;
  const ny = (gAvg / 255) * 2 - 1;
  const nz = (bAvg / 255) * 2 - 1;
  const length = Math.hypot(nx, ny, nz);
  if (length > 1e-5) {
    dst[dstOffset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
    dst[dstOffset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
    dst[dstOffset + 2] = Math.round(((nz / length) * 0.5 + 0.5) * 255);
  } else {
    dst[dstOffset] = 128;
    dst[dstOffset + 1] = 128;
    dst[dstOffset + 2] = 255;
  }
  dst[dstOffset + 3] = Math.round(aAvg);
}

/**
 * 실제 RGBA8 픽셀 버퍼를 면적 평균 박스필터(box filter)로 축소한다.
 * - 정수 배율(2×·4×·8×)은 할당 없는 정수 블록 합산 고속 경로를 사용한다.
 * - 비정수 배율(예: NPOT 4000×3000 → 2048×1536)은 정확한 겹침 면적 가중 적분을 수행한다.
 */
export function downsampleRgbaBoxFilter(
  input: RgbaBoxFilterInput,
): Uint8ClampedArray {
  const srcW = assertValidEdge(input.sourceWidth, "원본 픽셀 너비");
  const srcH = assertValidEdge(input.sourceHeight, "원본 픽셀 높이");
  const dstW = assertValidEdge(input.targetWidth, "목표 픽셀 너비");
  const dstH = assertValidEdge(input.targetHeight, "목표 픽셀 높이");

  if (dstW > srcW || dstH > srcH) {
    throw new Error("박스필터 다운샘플러는 원본보다 큰 해상도로 업스케일할 수 없습니다.");
  }

  const expectedBytes = srcW * srcH * 4;
  if (input.pixels.length !== expectedBytes) {
    throw new Error(
      `RGBA 픽셀 버퍼 길이가 일치하지 않습니다 (기대: ${expectedBytes}, 실제: ${input.pixels.length}).`,
    );
  }

  if (dstW === srcW && dstH === srcH) {
    return new Uint8ClampedArray(input.pixels);
  }

  const src = input.pixels;
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const renormalizeNormals = input.renormalizeNormals === true;

  if (srcW % dstW === 0 && srcH % dstH === 0) {
    const blockW = srcW / dstW;
    const blockH = srcH / dstH;
    const invArea = 1 / (blockW * blockH);

    for (let dy = 0; dy < dstH; dy += 1) {
      const syStart = dy * blockH;
      const syEnd = syStart + blockH;
      const dstRowOffset = dy * dstW * 4;

      for (let dx = 0; dx < dstW; dx += 1) {
        const sxStart = dx * blockW;
        const sxEnd = sxStart + blockW;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;

        for (let sy = syStart; sy < syEnd; sy += 1) {
          let srcIdx = (sy * srcW + sxStart) * 4;
          for (let sx = sxStart; sx < sxEnd; sx += 1) {
            rSum += src[srcIdx] ?? 0;
            gSum += src[srcIdx + 1] ?? 0;
            bSum += src[srcIdx + 2] ?? 0;
            aSum += src[srcIdx + 3] ?? 0;
            srcIdx += 4;
          }
        }

        writeBoxFilteredPixel(
          dst,
          dstRowOffset + dx * 4,
          rSum * invArea,
          gSum * invArea,
          bSum * invArea,
          aSum * invArea,
          renormalizeNormals,
        );
      }
    }

    return dst;
  }

  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy += 1) {
    const y0 = dy * scaleY;
    const y1 = Math.min(srcH, (dy + 1) * scaleY);
    const syMin = Math.floor(y0);
    const syMax = Math.min(srcH - 1, Math.ceil(y1) - 1);
    const dstRowOffset = dy * dstW * 4;

    for (let dx = 0; dx < dstW; dx += 1) {
      const x0 = dx * scaleX;
      const x1 = Math.min(srcW, (dx + 1) * scaleX);
      const sxMin = Math.floor(x0);
      const sxMax = Math.min(srcW - 1, Math.ceil(x1) - 1);

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let weightSum = 0;

      for (let sy = syMin; sy <= syMax; sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        const rowBase = sy * srcW;

        for (let sx = sxMin; sx <= sxMax; sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const srcIdx = (rowBase + sx) * 4;
          rSum += (src[srcIdx] ?? 0) * weight;
          gSum += (src[srcIdx + 1] ?? 0) * weight;
          bSum += (src[srcIdx + 2] ?? 0) * weight;
          aSum += (src[srcIdx + 3] ?? 0) * weight;
          weightSum += weight;
        }
      }

      const invWeight = weightSum > 0 ? 1 / weightSum : 0;
      writeBoxFilteredPixel(
        dst,
        dstRowOffset + dx * 4,
        rSum * invWeight,
        gSum * invWeight,
        bSum * invWeight,
        aSum * invWeight,
        renormalizeNormals,
      );
    }
  }

  return dst;
}

/**
 * 외부 SKP/GLB 텍스처 픽셀 버퍼를 기기 VRAM 프로필에 맞춰 로컬 다운샘플링하고
 * 원본 출처 메타데이터와 절감량 계획을 함께 반환한다.
 */
export function downsampleBg3dTexture(
  input: DownsampleBg3dTextureInput,
): Bg3dDownsampledTextureResult {
  const plan = planBg3dTextureDownsample(
    input.sourceMeta,
    input.profileId,
    input.options,
  );
  const expectedLength = plan.originalWidth * plan.originalHeight * 4;
  if (input.pixels.length !== expectedLength) {
    throw new Error(
      `입력 텍스처 픽셀 길이가 원본 메타데이터 해상도와 다릅니다 (기대: ${expectedLength}, 실제: ${input.pixels.length}).`,
    );
  }

  const pixels = plan.needsDownsample
    ? downsampleRgbaBoxFilter({
        pixels: input.pixels,
        sourceWidth: plan.originalWidth,
        sourceHeight: plan.originalHeight,
        targetWidth: plan.targetWidth,
        targetHeight: plan.targetHeight,
        renormalizeNormals: plan.sourceMeta.channel === "normal",
      })
    : new Uint8ClampedArray(input.pixels);

  return Object.freeze({
    plan,
    sourceMeta: plan.sourceMeta,
    width: plan.targetWidth,
    height: plan.targetHeight,
    pixels,
    downsampledFromOriginal: plan.needsDownsample,
  });
}
