/**
 * Wave 132 — 웹툰 불법 유출 추적·AI 무단 학습 방어 8×8 DCT 중주파 비가시 워터마크
 * 및 포렌식 보호 커널 핵심 타입·상수·오류 정의.
 */

export type ForensicWatermarkErrorCode =
  | "INVALID_DIMENSIONS"
  | "INVALID_PIXEL_BUFFER"
  | "NON_FINITE_PARAMETER"
  | "INVALID_STRENGTH"
  | "INVALID_PAYLOAD"
  | "INVALID_KEY"
  | "INVALID_SPEC"
  | "INVALID_DCT_BLOCK"
  | "INVALID_MANIFEST_INPUT";

export class ForensicWatermarkError extends Error {
  readonly code: ForensicWatermarkErrorCode;

  constructor(code: ForensicWatermarkErrorCode, message: string) {
    super(message);
    this.name = "ForensicWatermarkError";
    this.code = code;
  }
}

export type WatermarkPixelFormat = "luma-u8" | "rgba-u8";

export type BitValue = 0 | 1;

export interface WatermarkTileImage {
  readonly width: number;
  readonly height: number;
  readonly format: WatermarkPixelFormat;
  readonly data: Uint8Array;
}

export interface DctCoord {
  /** 수평 주파수 인덱스 (0..7) */
  readonly u: number;
  /** 수직 주파수 인덱스 (0..7) */
  readonly v: number;
}

export interface DctMidBandPair {
  readonly id: string;
  readonly index: number;
  readonly first: DctCoord;
  readonly second: DctCoord;
  readonly label: string;
  /** JPEG Q=75 기준 [first(v*8+u), second(v*8+u)] 양자화 스텝 */
  readonly jpegQ75Steps: readonly [number, number];
  /** strength=1.0 기준 최소 차분 마진 (Q75 양자화 반스텝 합 초과로 부호 보존) */
  readonly baseMargin: number;
  /** 호스트 반전 허용 시 계수당 최대 수정 폭(극단 잉크 경계는 자동 스킵해 PSNR 보호) */
  readonly maxPerCoeffDelta: number;
}

/**
 * 8×8 2D DCT-II 중주파 대칭 계수 쌍 (4쌍).
 * 각 쌍의 baseMargin은 (Q75_first + Q75_second) / 2 보다 커서
 * JPEG Q=75 양자화 후에도 계수 쌍 부호가 보존되며,
 * 기본 강도(strength=1.0)에서 화질 손실을 PSNR >= 40 dB 범위로 억제한다.
 */
export const MID_BAND_DCT_PAIRS: readonly DctMidBandPair[] = [
  {
    id: "mid-23-32",
    index: 0,
    first: { u: 2, v: 3 },
    second: { u: 3, v: 2 },
    label: "(2,3)↔(3,2)",
    jpegQ75Steps: [11, 12],
    baseMargin: 13.0,
    maxPerCoeffDelta: 13.5,
  },
  {
    id: "mid-14-41",
    index: 1,
    first: { u: 1, v: 4 },
    second: { u: 4, v: 1 },
    label: "(1,4)↔(4,1)",
    jpegQ75Steps: [11, 13],
    baseMargin: 13.5,
    maxPerCoeffDelta: 14.0,
  },
  {
    id: "mid-13-31",
    index: 2,
    first: { u: 1, v: 3 },
    second: { u: 3, v: 1 },
    label: "(1,3)↔(3,1)",
    jpegQ75Steps: [9, 10],
    baseMargin: 11.0,
    maxPerCoeffDelta: 11.5,
  },
  {
    id: "mid-03-30",
    index: 3,
    first: { u: 0, v: 3 },
    second: { u: 3, v: 0 },
    label: "(0,3)↔(3,0)",
    jpegQ75Steps: [7, 8],
    baseMargin: 9.0,
    maxPerCoeffDelta: 9.5,
  },
];

/** 8비트 균형 동기 프리앰블(크롭 위상 정렬 및 키 일치 검증용). */
export const SYNC_PREAMBLE_BITS: readonly BitValue[] = [1, 0, 1, 1, 0, 1, 0, 0];

export const FORENSIC_PAYLOAD_BIT_LENGTH = 16;
export const FORENSIC_CRC_BIT_LENGTH = 8;
export const FORENSIC_CODEWORD_BIT_LENGTH = 32;
export const MACRO_TILE_BLOCKS = 4;
export const DEFAULT_WATERMARK_STRENGTH = 1.0;

/** IJG 표준 JPEG Q=50 휘도 양자화 테이블 (행 우선 v*8 + u). */
export const JPEG_Q50_LUMA_TABLE: readonly number[] = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/** IJG 품질 계수(1..100)에 대응하는 8×8 휘도 양자화 테이블을 생성한다. */
export function buildJpegLumaQuantTable(quality: number): Uint16Array {
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new ForensicWatermarkError(
      "NON_FINITE_PARAMETER",
      `JPEG 품질 값은 1~100 사이의 유한한 숫자여야 합니다 (입력: ${String(quality)}).`,
    );
  }
  const q = Math.round(quality);
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  const out = new Uint16Array(64);
  for (let i = 0; i < 64; i += 1) {
    const scaled = Math.floor((JPEG_Q50_LUMA_TABLE[i] * scale + 50) / 100);
    out[i] = Math.max(1, Math.min(255, scaled));
  }
  return out;
}

export interface ForensicPayloadSpec {
  readonly creatorId: string;
  readonly episodeId: string;
  readonly recipientId: string;
  readonly payloadBits?: readonly BitValue[];
  readonly payloadCode?: number;
}

export interface EncodedForensicPayload {
  readonly creatorId: string;
  readonly episodeId: string;
  readonly recipientId: string;
  readonly payloadBits: readonly BitValue[];
  readonly payloadCode: number;
  readonly payloadHex: string;
  readonly crc8: number;
  readonly codewordBits: readonly BitValue[];
}

export interface WatermarkEmbedOptions {
  readonly secretKey: string;
  readonly payload: ForensicPayloadSpec;
  readonly strength?: number;
}

export interface WatermarkEmbedResult {
  readonly watermarkedTile: WatermarkTileImage;
  readonly encodedPayload: EncodedForensicPayload;
  readonly secretKeyFingerprintHex: string;
  readonly strength: number;
  readonly blocksX: number;
  readonly blocksY: number;
  readonly totalBlocks: number;
  readonly copiesPerBit: number;
  readonly psnrDb: number;
  readonly mse: number;
  readonly maxAbsChannelDelta: number;
  readonly nonFiniteChannelCount: number;
  readonly outOfRangeChannelCount: number;
  readonly averageDctAbsEnergy: readonly number[];
  readonly pairsUsed: readonly DctMidBandPair[];
}

export interface WatermarkDetectOptions {
  readonly secretKey: string;
  readonly expectedPayloadBits?: readonly BitValue[];
  readonly searchCropPhase?: boolean;
  readonly minNormalizedCorrelation?: number;
}

export interface WatermarkDetectResult {
  readonly detected: boolean;
  readonly recoveredPayloadBits: readonly BitValue[];
  readonly recoveredPayloadCode: number;
  readonly recoveredPayloadHex: string;
  readonly recoveredCrc8: number;
  readonly crcValid: boolean;
  readonly softCorrectedBitIndex: number | null;
  readonly syncMatchedBits: number;
  readonly syncTotalBits: number;
  readonly syncCorrelation: number;
  readonly payloadCoherence: number;
  readonly normalizedCorrelation: number;
  readonly bitErrorRate: number | null;
  readonly phaseShiftX: number;
  readonly phaseShiftY: number;
  readonly activeBlockCount: number;
  readonly totalBlockCount: number;
  readonly rejectionReason: string | null;
}

export type PiracyAttackKind =
  | "jpeg-quantization-q75"
  | "brightness-contrast-shift"
  | "additive-noise"
  | "border-crop-12pct";

export interface PiracyAttackResult {
  readonly kind: PiracyAttackKind;
  readonly labelKo: string;
  readonly attackedTile: WatermarkTileImage;
  readonly detection: WatermarkDetectResult;
  readonly bitErrorRate: number;
  readonly payloadExactMatch: boolean;
  readonly passed: boolean;
}

export interface PiracyAttackSuiteResult {
  readonly baselineDetection: WatermarkDetectResult;
  readonly attacks: readonly PiracyAttackResult[];
  readonly allAttacksPassed: boolean;
  readonly minCorrelationAcrossAttacks: number;
  readonly maxBitErrorRateAcrossAttacks: number;
}

export interface AntiScrapeRightsSpec {
  readonly workTitle: string;
  readonly creatorId: string;
  readonly episodeId: string;
  readonly recipientId: string;
  readonly rightsHolder: string;
  readonly issuedDate: string;
  readonly watermarkPayloadHex: string;
  readonly policyUrl?: string;
  readonly originalPixels?: Uint8Array;
  readonly watermarkedPixels?: Uint8Array;
  readonly additionalTags?: Readonly<Record<string, string>>;
}

export interface AntiScrapeRightsManifest {
  readonly schemaVersion: "toonstudio.anti-scrape.v1";
  readonly tdmReservation: 1;
  readonly c2paTrainingMining: {
    readonly label: "c2pa.training-mining";
    readonly summaryPolicy: "notAllowed";
    readonly entries: Readonly<Record<string, { readonly use: "notAllowed" }>>;
  };
  readonly httpHeaders: Readonly<Record<string, string>>;
  readonly pngMetadataChunks: readonly {
    readonly chunkType: "tEXt" | "iTXt";
    readonly keyword: string;
    readonly value: string;
  }[];
  readonly webpMetadata: {
    readonly chunkFourCC: "XMP ";
    readonly xmpPacket: string;
    readonly directives: {
      readonly tdmReservation: 1;
      readonly c2paTrainingMining: "notAllowed";
      readonly robotsAi: "noai, noimageai";
    };
  };
  readonly originalAssetSha256Hex: string;
  readonly watermarkedAssetSha256Hex: string;
  readonly canonicalManifestJson: string;
  readonly manifestSha256Hex: string;
}

export interface ForensicWgslBindingSpec {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
  readonly strideBytes: number;
}

export interface ForensicWatermarkWgslArtifact {
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly voteBufferStrideBytes: number;
  readonly workgroupSize: readonly [number, number, number];
  readonly bindings: readonly ForensicWgslBindingSpec[];
  readonly entryPoints: readonly string[];
}

export interface ForensicWatermarkWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly bindingCount: number;
}

export type ForensicShieldSvgTheme = "light" | "dark";

export interface ForensicShieldSvgOptions {
  readonly title?: string;
  readonly theme?: ForensicShieldSvgTheme;
  readonly width?: number;
  readonly height?: number;
  readonly manifest?: AntiScrapeRightsManifest;
}

export interface ForensicShieldReportKo {
  readonly verdictKo: "배포 승인" | "재검토 필요" | "차단";
  readonly passedAllGates: boolean;
  readonly headlineKo: string;
  readonly visualQualityLineKo: string;
  readonly attackResilienceLinesKo: readonly string[];
  readonly antiScrapePolicyLineKo: string;
  readonly actionChecklistKo: readonly string[];
  readonly fullTextKo: string;
}
