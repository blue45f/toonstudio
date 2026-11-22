/**
 * 64-bit dHash 지각 저작권 핑거프린트 및 레퍼런스 과도 유사도 사전 경고 엔진 (₩0 브라우저 로컬).
 *
 * 원고 이미지를 9×8 면적 평균(area-averaging) 그레이스케일로 다운샘플링한 뒤
 * 인접 픽셀의 수평 밝기 기울기(64비트)로 지각 해시(dHash)를 생성한다.
 * 해밍 거리(0~64)와 8방향 이면체 대칭(0°/90°/180°/270° + 좌우 반전) 비교를 결합해
 * 회전·좌우 반전·노이즈·리사이즈 변형에도 원고 무단 복제 추적 및 레퍼런스 과도 유사도를 사전 경고한다.
 */

export type FingerprintOrientation =
  | "0deg"
  | "90deg"
  | "180deg"
  | "270deg"
  | "flip-h-0deg"
  | "flip-h-90deg"
  | "flip-h-180deg"
  | "flip-h-270deg";

export type SimilarityVerdict =
  | "critical-duplicate"
  | "high-similarity-warning"
  | "moderate-resemblance"
  | "distinct";

export interface PixelSurfaceInput {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
  /** 픽셀당 채널 수 (1=그레이스케일, 3=RGB, 4=RGBA). 기본 4. */
  readonly channels?: 1 | 3 | 4;
}

export interface DHash64 {
  /** 상위 32비트(부호 없는 정수, bit 0..31). */
  readonly hi: number;
  /** 하위 32비트(부호 없는 정수, bit 32..63). */
  readonly lo: number;
  /** 16자리 소문자 16진수 표현(64비트). */
  readonly hex: string;
  /** 64자리 이진 문자열 표현. */
  readonly bits: string;
}

export interface CopyrightFingerprint {
  readonly algorithm: "dhash-64-9x8-rec709";
  readonly canonical: DHash64;
  readonly orientations: Readonly<Record<FingerprintOrientation, DHash64>>;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly meanLuminance: number;
  readonly gradientDensity: number;
}

export interface SimilarityThresholdPolicy {
  /** 무단 복제·트레이싱 고위험 상한(포함). 기본 5. */
  readonly criticalDuplicateMaxDistance: number;
  /** 레퍼런스 과도 유사 사전 경고 상한(포함). 기본 12. */
  readonly highSimilarityWarningMaxDistance: number;
  /** 참고 수준 유사 상한(포함). 기본 18. */
  readonly moderateResemblanceMaxDistance: number;
}

export interface FingerprintComparisonOptions {
  /** 8방향(90° 회전·좌우 반전) 변형 검사 활성화 여부. 기본 true. */
  readonly checkOrientations?: boolean;
  readonly thresholds?: Partial<SimilarityThresholdPolicy>;
}

export interface FingerprintComparisonResult {
  readonly canonicalDistance: number;
  readonly bestDistance: number;
  readonly matchedOrientation: FingerprintOrientation;
  readonly similarityScore: number;
  readonly verdict: SimilarityVerdict;
  readonly warningRequired: boolean;
  readonly summaryKo: string;
}

export interface ReferenceFingerprintEntry {
  readonly id: string;
  readonly label: string;
  readonly sourceUrl?: string;
  readonly fingerprint: CopyrightFingerprint;
}

export interface ReferenceSimilarityMatch {
  readonly referenceId: string;
  readonly referenceLabel: string;
  readonly sourceUrl?: string;
  readonly comparison: FingerprintComparisonResult;
}

export interface ManuscriptSimilarityScanReport {
  readonly manuscriptHashHex: string;
  readonly scannedCount: number;
  readonly highestRiskVerdict: SimilarityVerdict;
  readonly warningCount: number;
  readonly matches: readonly ReferenceSimilarityMatch[];
  readonly zeroCloudCostKrw: 0;
}

export interface CopyrightTrackingRecordInput {
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly creatorHandle: string;
  readonly surface: PixelSurfaceInput;
  readonly capturedAtIso?: string;
}

export interface CopyrightTrackingRecord {
  readonly schema: "toonstudio.dhash-copyright-fingerprint/1";
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly creatorHandle: string;
  readonly capturedAtIso: string;
  readonly fingerprint: CopyrightFingerprint;
  readonly zeroCloudCostKrw: 0;
}

export const DHASH_GRID_WIDTH = 9;
export const DHASH_GRID_HEIGHT = 8;

export const DHASH_SIMILARITY_THRESHOLDS: SimilarityThresholdPolicy = {
  criticalDuplicateMaxDistance: 5,
  highSimilarityWarningMaxDistance: 12,
  moderateResemblanceMaxDistance: 18,
};

export const ALL_FINGERPRINT_ORIENTATIONS: readonly FingerprintOrientation[] = [
  "0deg",
  "90deg",
  "180deg",
  "270deg",
  "flip-h-0deg",
  "flip-h-90deg",
  "flip-h-180deg",
  "flip-h-270deg",
];

const HEX64_REGEX = /^[0-9a-f]{16}$/;

function validateSurface(surface: PixelSurfaceInput): 1 | 3 | 4 {
  const channels = surface.channels ?? 4;
  if (!Number.isSafeInteger(surface.width) || surface.width <= 0) {
    throw new RangeError(`유효하지 않은 이미지 너비입니다: ${surface.width}`);
  }
  if (!Number.isSafeInteger(surface.height) || surface.height <= 0) {
    throw new RangeError(`유효하지 않은 이미지 높이입니다: ${surface.height}`);
  }
  const requiredLength = surface.width * surface.height * channels;
  if (surface.data.length < requiredLength) {
    throw new RangeError(
      `픽셀 버퍼 길이(${surface.data.length})가 예상 크기(${requiredLength})보다 작습니다.`,
    );
  }
  return channels;
}

function sampleRec709Luminance(
  data: Uint8ClampedArray | Uint8Array,
  pixelIndex: number,
  channels: 1 | 3 | 4,
): number {
  const offset = pixelIndex * channels;
  if (channels === 1) {
    return data[offset] ?? 0;
  }
  const r = data[offset] ?? 0;
  const g = data[offset + 1] ?? 0;
  const b = data[offset + 2] ?? 0;
  const rgbLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (channels === 3) {
    return rgbLuma;
  }
  const alpha = (data[offset + 3] ?? 255) / 255;
  // 투명 픽셀은 웹툰 기본 흰 원고지(255) 위에 합성해 일관된 지문을 유지한다.
  return alpha * rgbLuma + (1 - alpha) * 255;
}

function orientedDimensions(
  width: number,
  height: number,
  orientation: FingerprintOrientation,
): { readonly outWidth: number; readonly outHeight: number } {
  if (
    orientation === "90deg"
    || orientation === "270deg"
    || orientation === "flip-h-90deg"
    || orientation === "flip-h-270deg"
  ) {
    return { outWidth: height, outHeight: width };
  }
  return { outWidth: width, outHeight: height };
}

function mapOrientedCoord(
  ox: number,
  oy: number,
  width: number,
  height: number,
  orientation: FingerprintOrientation,
): { readonly sx: number; readonly sy: number } {
  switch (orientation) {
    case "0deg":
      return { sx: ox, sy: oy };
    case "90deg":
      return { sx: oy, sy: height - 1 - ox };
    case "180deg":
      return { sx: width - 1 - ox, sy: height - 1 - oy };
    case "270deg":
      return { sx: width - 1 - oy, sy: ox };
    case "flip-h-0deg":
      return { sx: width - 1 - ox, sy: oy };
    case "flip-h-90deg":
      return { sx: oy, sy: ox };
    case "flip-h-180deg":
      return { sx: ox, sy: height - 1 - oy };
    case "flip-h-270deg":
      return { sx: width - 1 - oy, sy: height - 1 - ox };
  }
}

function downsampleTo9x8LuminanceGrid(
  surface: PixelSurfaceInput,
  channels: 1 | 3 | 4,
  orientation: FingerprintOrientation,
): Float64Array {
  const { width, height, data } = surface;
  const { outWidth, outHeight } = orientedDimensions(width, height, orientation);
  const grid = new Float64Array(DHASH_GRID_WIDTH * DHASH_GRID_HEIGHT);

  const scaleX = outWidth / DHASH_GRID_WIDTH;
  const scaleY = outHeight / DHASH_GRID_HEIGHT;

  for (let gy = 0; gy < DHASH_GRID_HEIGHT; gy += 1) {
    const yStart = gy * scaleY;
    const yEnd = (gy + 1) * scaleY;
    const oyMin = Math.floor(yStart);
    const oyMax = Math.min(outHeight - 1, Math.ceil(yEnd) - 1);

    for (let gx = 0; gx < DHASH_GRID_WIDTH; gx += 1) {
      const xStart = gx * scaleX;
      const xEnd = (gx + 1) * scaleX;
      const oxMin = Math.floor(xStart);
      const oxMax = Math.min(outWidth - 1, Math.ceil(xEnd) - 1);

      let weightedSum = 0;
      let weightTotal = 0;

      for (let oy = oyMin; oy <= oyMax; oy += 1) {
        const wy = Math.min(oy + 1, yEnd) - Math.max(oy, yStart);
        if (wy <= 0) continue;

        for (let ox = oxMin; ox <= oxMax; ox += 1) {
          const wx = Math.min(ox + 1, xEnd) - Math.max(ox, xStart);
          if (wx <= 0) continue;

          const { sx, sy } = mapOrientedCoord(ox, oy, width, height, orientation);
          const luma = sampleRec709Luminance(data, sy * width + sx, channels);
          const areaWeight = wx * wy;
          weightedSum += luma * areaWeight;
          weightTotal += areaWeight;
        }
      }

      grid[gy * DHASH_GRID_WIDTH + gx] = weightTotal > 0 ? weightedSum / weightTotal : 0;
    }
  }

  return grid;
}

function encodeDHashFrom9x8Grid(grid: Float64Array): DHash64 {
  let hi = 0;
  let lo = 0;

  for (let gy = 0; gy < DHASH_GRID_HEIGHT; gy += 1) {
    const rowOffset = gy * DHASH_GRID_WIDTH;
    for (let gx = 0; gx < 8; gx += 1) {
      const left = grid[rowOffset + gx] ?? 0;
      const right = grid[rowOffset + gx + 1] ?? 0;
      if (left > right) {
        const bitIndex = gy * 8 + gx;
        if (bitIndex < 32) {
          hi = (hi | (1 << (31 - bitIndex))) >>> 0;
        } else {
          lo = (lo | (1 << (63 - bitIndex))) >>> 0;
        }
      }
    }
  }

  return createDHash64FromWords(hi, lo);
}

export function createDHash64FromWords(hiWord: number, loWord: number): DHash64 {
  const hi = hiWord >>> 0;
  const lo = loWord >>> 0;
  return {
    hi,
    lo,
    hex: `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`,
    bits: `${hi.toString(2).padStart(32, "0")}${lo.toString(2).padStart(32, "0")}`,
  };
}

export function parseDHash64Hex(hexInput: string): DHash64 {
  const normalized = hexInput.trim().toLowerCase();
  if (!HEX64_REGEX.test(normalized)) {
    throw new RangeError(`유효한 16자리 64-bit dHash 16진수 문자열이 아닙니다: "${hexInput}"`);
  }
  const hi = Number.parseInt(normalized.slice(0, 8), 16) >>> 0;
  const lo = Number.parseInt(normalized.slice(8, 16), 16) >>> 0;
  return createDHash64FromWords(hi, lo);
}

function popcount32(word: number): number {
  let v = word >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/**
 * 두 64-bit dHash 간의 정확한 해밍 거리(0~64)를 반환한다.
 */
export function hammingDistance64(left: DHash64 | string, right: DHash64 | string): number {
  const a = typeof left === "string" ? parseDHash64Hex(left) : left;
  const b = typeof right === "string" ? parseDHash64Hex(right) : right;
  return popcount32((a.hi ^ b.hi) >>> 0) + popcount32((a.lo ^ b.lo) >>> 0);
}

/**
 * 해밍 거리(0~64)를 0~1 범위의 지각 유사도 점수로 변환한다.
 */
export function dHashSimilarityScore(distance: number): number {
  const clamped = Math.min(64, Math.max(0, distance));
  return (64 - clamped) / 64;
}

/**
 * 픽셀 버퍼에서 단일 정방향 64-bit dHash를 계산한다.
 */
export function computeDHash64(
  surface: PixelSurfaceInput,
  orientation: FingerprintOrientation = "0deg",
): DHash64 {
  const channels = validateSurface(surface);
  const grid = downsampleTo9x8LuminanceGrid(surface, channels, orientation);
  return encodeDHashFrom9x8Grid(grid);
}

/**
 * 90° 단위 회전 및 좌우 반전된 픽셀 버퍼를 생성한다(테스트 및 로컬 전처리용).
 */
export function transformPixelSurface(
  surface: PixelSurfaceInput,
  orientation: FingerprintOrientation,
): PixelSurfaceInput {
  const channels = validateSurface(surface);
  const { width, height, data } = surface;
  const { outWidth, outHeight } = orientedDimensions(width, height, orientation);
  const out = new Uint8ClampedArray(outWidth * outHeight * channels);

  for (let oy = 0; oy < outHeight; oy += 1) {
    for (let ox = 0; ox < outWidth; ox += 1) {
      const { sx, sy } = mapOrientedCoord(ox, oy, width, height, orientation);
      const srcOffset = (sy * width + sx) * channels;
      const dstOffset = (oy * outWidth + ox) * channels;
      for (let c = 0; c < channels; c += 1) {
        out[dstOffset + c] = data[srcOffset + c] ?? 0;
      }
    }
  }

  return { width: outWidth, height: outHeight, data: out, channels };
}

/**
 * 원고의 정방향 64-bit dHash와 8방향 이면체 변형(회전·좌우 반전) 지문을 일괄 생성한다.
 */
export function computeCopyrightFingerprint(surface: PixelSurfaceInput): CopyrightFingerprint {
  const channels = validateSurface(surface);
  const canonicalGrid = downsampleTo9x8LuminanceGrid(surface, channels, "0deg");
  const canonical = encodeDHashFrom9x8Grid(canonicalGrid);

  let lumaSum = 0;
  for (let i = 0; i < canonicalGrid.length; i += 1) {
    lumaSum += canonicalGrid[i] ?? 0;
  }
  const meanLuminance = lumaSum / canonicalGrid.length;
  const activeBits = popcount32(canonical.hi) + popcount32(canonical.lo);
  const gradientDensity = activeBits / 64;

  const orientations: Record<FingerprintOrientation, DHash64> = {
    "0deg": canonical,
    "90deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "90deg")),
    "180deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "180deg")),
    "270deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "270deg")),
    "flip-h-0deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "flip-h-0deg")),
    "flip-h-90deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "flip-h-90deg")),
    "flip-h-180deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "flip-h-180deg")),
    "flip-h-270deg": encodeDHashFrom9x8Grid(downsampleTo9x8LuminanceGrid(surface, channels, "flip-h-270deg")),
  };

  return {
    algorithm: "dhash-64-9x8-rec709",
    canonical,
    orientations,
    sourceWidth: surface.width,
    sourceHeight: surface.height,
    meanLuminance,
    gradientDensity,
  };
}

function classifyDistance(
  distance: number,
  policy: SimilarityThresholdPolicy,
): { readonly verdict: SimilarityVerdict; readonly warningRequired: boolean; readonly summaryKo: string } {
  if (distance <= policy.criticalDuplicateMaxDistance) {
    return {
      verdict: "critical-duplicate",
      warningRequired: true,
      summaryKo: `해밍 거리 ${distance}/64 — 무단 복제·트레이싱 고위험 구간입니다. 출고 전 원본 권리를 확인하세요.`,
    };
  }
  if (distance <= policy.highSimilarityWarningMaxDistance) {
    return {
      verdict: "high-similarity-warning",
      warningRequired: true,
      summaryKo: `해밍 거리 ${distance}/64 — 레퍼런스와 구도·명암이 과도하게 유사합니다. 리터칭·재배치를 권장합니다.`,
    };
  }
  if (distance <= policy.moderateResemblanceMaxDistance) {
    return {
      verdict: "moderate-resemblance",
      warningRequired: false,
      summaryKo: `해밍 거리 ${distance}/64 — 참고 수준 유사도입니다. 필요 시 참고 자료 출처를 기록하세요.`,
    };
  }
  return {
    verdict: "distinct",
    warningRequired: false,
    summaryKo: `해밍 거리 ${distance}/64 — 독자 구도로 판정되었습니다.`,
  };
}

/**
 * 두 저작권 핑거프린트를 비교해 최소 해밍 거리, 일치 방향(회전·반전), 경고 등급을 산출한다.
 */
export function compareCopyrightFingerprints(
  manuscript: CopyrightFingerprint,
  reference: CopyrightFingerprint,
  options: FingerprintComparisonOptions = {},
): FingerprintComparisonResult {
  const policy: SimilarityThresholdPolicy = {
    criticalDuplicateMaxDistance:
      options.thresholds?.criticalDuplicateMaxDistance
      ?? DHASH_SIMILARITY_THRESHOLDS.criticalDuplicateMaxDistance,
    highSimilarityWarningMaxDistance:
      options.thresholds?.highSimilarityWarningMaxDistance
      ?? DHASH_SIMILARITY_THRESHOLDS.highSimilarityWarningMaxDistance,
    moderateResemblanceMaxDistance:
      options.thresholds?.moderateResemblanceMaxDistance
      ?? DHASH_SIMILARITY_THRESHOLDS.moderateResemblanceMaxDistance,
  };

  const canonicalDistance = hammingDistance64(manuscript.canonical, reference.canonical);
  let bestDistance = canonicalDistance;
  let matchedOrientation: FingerprintOrientation = "0deg";

  if (options.checkOrientations !== false) {
    for (const orientation of ALL_FINGERPRINT_ORIENTATIONS) {
      const candidateHash = reference.orientations[orientation];
      const distance = hammingDistance64(manuscript.canonical, candidateHash);
      if (distance < bestDistance) {
        bestDistance = distance;
        matchedOrientation = orientation;
      }
    }
  }

  const classification = classifyDistance(bestDistance, policy);
  return {
    canonicalDistance,
    bestDistance,
    matchedOrientation,
    similarityScore: dHashSimilarityScore(bestDistance),
    verdict: classification.verdict,
    warningRequired: classification.warningRequired,
    summaryKo: classification.summaryKo,
  };
}

const VERDICT_SEVERITY: Readonly<Record<SimilarityVerdict, number>> = {
  "critical-duplicate": 3,
  "high-similarity-warning": 2,
  "moderate-resemblance": 1,
  distinct: 0,
};

/**
 * 현재 원고 지문을 로컬 레퍼런스 보관함과 일괄 대조해 과도 유사 경고를 우선 정렬해 반환한다.
 */
export function scanManuscriptAgainstReferences(
  manuscript: CopyrightFingerprint,
  references: readonly ReferenceFingerprintEntry[],
  options: FingerprintComparisonOptions = {},
): ManuscriptSimilarityScanReport {
  const matches: ReferenceSimilarityMatch[] = references.map((reference) => ({
    referenceId: reference.id,
    referenceLabel: reference.label,
    sourceUrl: reference.sourceUrl,
    comparison: compareCopyrightFingerprints(manuscript, reference.fingerprint, options),
  }));

  matches.sort((left, right) => {
    if (left.comparison.bestDistance !== right.comparison.bestDistance) {
      return left.comparison.bestDistance - right.comparison.bestDistance;
    }
    return left.referenceId.localeCompare(right.referenceId);
  });

  let highestRiskVerdict: SimilarityVerdict = "distinct";
  let warningCount = 0;

  for (const match of matches) {
    if (match.comparison.warningRequired) {
      warningCount += 1;
    }
    if (VERDICT_SEVERITY[match.comparison.verdict] > VERDICT_SEVERITY[highestRiskVerdict]) {
      highestRiskVerdict = match.comparison.verdict;
    }
  }

  return {
    manuscriptHashHex: manuscript.canonical.hex,
    scannedCount: references.length,
    highestRiskVerdict,
    warningCount,
    matches,
    zeroCloudCostKrw: 0,
  };
}

/**
 * 원고 무단 복제 추적을 위한 온디바이스 불변 핑거프린트 영수증 레코드를 생성한다.
 */
export function createCopyrightTrackingRecord(
  input: CopyrightTrackingRecordInput,
): CopyrightTrackingRecord {
  return {
    schema: "toonstudio.dhash-copyright-fingerprint/1",
    workId: input.workId.trim(),
    episodeId: input.episodeId.trim(),
    cutId: input.cutId.trim(),
    creatorHandle: input.creatorHandle.trim(),
    capturedAtIso: input.capturedAtIso ?? new Date().toISOString(),
    fingerprint: computeCopyrightFingerprint(input.surface),
    zeroCloudCostKrw: 0,
  };
}
