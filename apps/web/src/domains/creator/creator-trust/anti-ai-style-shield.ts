/**
 * 100% 브라우저 로컬(₩0) 클린룸 AI 무단 학습 방어 워터마크(주파수 도메인 미세 섭동)
 * 및 C2PA 스타일 온디바이스 SHA-256 위변조 검증 매니페스트 엔진.
 *
 * - 외부 서버 업로드·클라우드 API 호출 0건(순수 브라우저/메모리 연산).
 * - 8×8 직교 2D DCT 대각 고주파 대역에 결정적 시드 기반 미세 섭동을 삽입하고,
 *   전 프리셋에서 인간 시각 품질 하한 PSNR ≥ 38 dB 불변식을 보장한다.
 */

import {
  canonicalJsonStringify,
  computeSha256Hex,
  type ByteSequence,
} from "./creator-trust-sha256";

export { canonicalJsonStringify, computeSha256Hex, type ByteSequence };

export type AntiAiShieldStrength = "subtle" | "balanced" | "strong";

export interface AntiAiShieldPresetSpec {
  readonly strength: AntiAiShieldStrength;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly dctAmplitude: number;
  readonly guaranteedMinPsnrDb: number;
  readonly targetPsnrRangeKo: string;
}

export const ANTI_AI_SHIELD_MIN_PSNR_DB = 38.0 as const;

export const ANTI_AI_SHIELD_PRESETS: Readonly<
  Record<AntiAiShieldStrength, AntiAiShieldPresetSpec>
> = Object.freeze({
  subtle: Object.freeze({
    strength: "subtle",
    labelKo: "은은한 보호",
    labelEn: "Subtle Shield",
    dctAmplitude: 1.6,
    guaranteedMinPsnrDb: 43.0,
    targetPsnrRangeKo: "PSNR ≥ 43 dB (초미세 시각 투명)",
  }),
  balanced: Object.freeze({
    strength: "balanced",
    labelKo: "표준 보호",
    labelEn: "Balanced Shield",
    dctAmplitude: 2.6,
    guaranteedMinPsnrDb: 40.0,
    targetPsnrRangeKo: "PSNR ≥ 40 dB (시각·방어 균형)",
  }),
  strong: Object.freeze({
    strength: "strong",
    labelKo: "강력한 스타일 방어",
    labelEn: "Strong Style Defense",
    dctAmplitude: 3.9,
    guaranteedMinPsnrDb: 38.0,
    targetPsnrRangeKo: "PSNR ≥ 38 dB (고주파 스타일 교란 최대)",
  }),
});

export interface RgbaImageSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface AntiAiStyleShieldOptions {
  readonly seed: string;
  readonly strength?: AntiAiShieldStrength;
  readonly workId?: string;
  readonly creatorId?: string;
  readonly minPsnrDb?: number;
}

export interface AntiAiStyleShieldMetrics {
  readonly psnrDb: number;
  readonly mse: number;
  readonly maxAbsChannelDelta: number;
  readonly highFrequencyPerturbationEnergy: number;
  readonly perturbedBlockCount: number;
  readonly effectiveAmplitude: number;
  readonly psnrGuardTriggered: boolean;
}

export interface AntiAiShieldDetectionResult {
  readonly detected: boolean;
  readonly normalizedCorrelation: number;
  readonly zScore: number;
  readonly evaluatedBlocks: number;
  readonly confidenceLabelKo: string;
}

export interface AntiAiStyleShieldResult {
  readonly protectedSurface: RgbaImageSurface;
  readonly strength: AntiAiShieldStrength;
  readonly seedFingerprintSha256: string;
  readonly originalContentSha256: string;
  readonly protectedContentSha256: string;
  readonly metrics: AntiAiStyleShieldMetrics;
  readonly detectionSelfCheck: AntiAiShieldDetectionResult;
}

export interface CreatorProvenanceRightsBomSummary {
  readonly totalAssets: number;
  readonly uniqueAssets: number;
  readonly clearedForCommercialUse: boolean;
  readonly prohibitedCount: number;
  readonly unknownCount: number;
  readonly rightsManifestDigestSha256: string;
}

export interface CreatorProvenanceAssertion {
  readonly label:
    | "c2pa.actions"
    | "cawg.training-mining"
    | "toonstudio.rights-bom.v1"
    | "toonstudio.anti-ai-shield.v1";
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface CreatorProvenanceManifest {
  readonly schema: "toonstudio.creator-provenance-manifest/1";
  readonly schemaVersion: 1;
  readonly standardReference: "C2PA-style-local-v1";
  readonly executionScope: "on-device-local-zero-cost";
  readonly manifestId: string;
  readonly issuedAtIso: string;
  readonly workId: string;
  readonly episodeLabel: string;
  readonly creator: { readonly displayName: string; readonly handle?: string; readonly role: string };
  readonly toolchain: {
    readonly software: "ToonStudio";
    readonly version: string;
    readonly renderingEngine: string;
    readonly aiTrainingPolicy: "prohibited-tdm-optout" | "permitted-with-license";
  };
  readonly rightsBomSummary: CreatorProvenanceRightsBomSummary;
  readonly styleShield: {
    readonly applied: boolean;
    readonly strength: AntiAiShieldStrength;
    readonly seedFingerprintSha256: string;
    readonly psnrDb: number;
    readonly highFrequencyPerturbationEnergy: number;
    readonly detectionCorrelation: number;
  };
  readonly contentSha256: string;
  readonly assertions: readonly CreatorProvenanceAssertion[];
  readonly localAttestationNoticeKo: string;
  readonly claimDigestSha256: string;
}

export interface BuildCreatorProvenanceManifestInput {
  readonly workId: string;
  readonly episodeLabel: string;
  readonly creatorDisplayName: string;
  readonly creatorHandle?: string;
  readonly creatorRole?: string;
  readonly softwareVersion?: string;
  readonly renderingEngine?: string;
  readonly aiTrainingAllowed?: boolean;
  readonly rightsBomSummary: CreatorProvenanceRightsBomSummary;
  readonly contentBytes: ByteSequence;
  readonly styleShieldResult?: AntiAiStyleShieldResult;
  readonly issuedAtIso?: string;
}

export type ProvenanceVerificationStatus =
  | "verified"
  | "manifest-tampered"
  | "content-tampered"
  | "invalid-schema";

export interface CreatorProvenanceVerificationResult {
  readonly valid: boolean;
  readonly status: ProvenanceVerificationStatus;
  readonly claimIntegrityValid: boolean;
  readonly contentHashMatched: boolean | null;
  readonly expectedClaimDigestSha256: string | null;
  readonly computedContentSha256: string | null;
  readonly summaryKo: string;
}

const BLOCK_SIZE = 8;

const DCT_BASIS: readonly Float64Array[] = Object.freeze(
  Array.from({ length: BLOCK_SIZE }, (_, u) => {
    const row = new Float64Array(BLOCK_SIZE);
    const alpha = u === 0 ? Math.SQRT1_2 / 2 : 0.5;
    for (let x = 0; x < BLOCK_SIZE; x += 1) {
      row[x] = alpha * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
    return row;
  }),
);

/** 인간 시각 대비 감도(CSF)가 낮은 대각 고주파 AC 좌표 30개(u >= 2, v >= 2, u+v <= 11). */
const HIGH_FREQ_BAND_COORDS: readonly (readonly [number, number])[] = (() => {
  const coords: (readonly [number, number])[] = [];
  for (let u = 2; u < BLOCK_SIZE; u += 1) {
    for (let v = 2; v < BLOCK_SIZE; v += 1) {
      if (u + v <= 11) coords.push(Object.freeze([u, v] as const));
    }
  }
  return Object.freeze(coords);
})();

function forwardDct8x8(spatial: Float64Array, coeffs: Float64Array): void {
  const temp = new Float64Array(64);
  for (let y = 0; y < BLOCK_SIZE; y += 1) {
    const rowOffset = y * BLOCK_SIZE;
    for (let v = 0; v < BLOCK_SIZE; v += 1) {
      const basisV = DCT_BASIS[v];
      let sum = 0;
      for (let x = 0; x < BLOCK_SIZE; x += 1) sum += spatial[rowOffset + x] * basisV[x];
      temp[rowOffset + v] = sum;
    }
  }
  for (let v = 0; v < BLOCK_SIZE; v += 1) {
    for (let u = 0; u < BLOCK_SIZE; u += 1) {
      const basisU = DCT_BASIS[u];
      let sum = 0;
      for (let y = 0; y < BLOCK_SIZE; y += 1) sum += basisU[y] * temp[y * BLOCK_SIZE + v];
      coeffs[u * BLOCK_SIZE + v] = sum;
    }
  }
}

function inverseDct8x8(coeffs: Float64Array, spatial: Float64Array): void {
  const temp = new Float64Array(64);
  for (let u = 0; u < BLOCK_SIZE; u += 1) {
    const rowOffset = u * BLOCK_SIZE;
    for (let x = 0; x < BLOCK_SIZE; x += 1) {
      let sum = 0;
      for (let v = 0; v < BLOCK_SIZE; v += 1) sum += coeffs[rowOffset + v] * DCT_BASIS[v][x];
      temp[rowOffset + x] = sum;
    }
  }
  for (let y = 0; y < BLOCK_SIZE; y += 1) {
    const rowOffset = y * BLOCK_SIZE;
    for (let x = 0; x < BLOCK_SIZE; x += 1) {
      let sum = 0;
      for (let u = 0; u < BLOCK_SIZE; u += 1) sum += DCT_BASIS[u][y] * temp[u * BLOCK_SIZE + x];
      spatial[rowOffset + x] = sum;
    }
  }
}

function createDeterministicPrng(seedHex: string): () => number {
  let state =
    (Number.parseInt(seedHex.slice(0, 8), 16) ^
      Number.parseInt(seedHex.slice(8, 16), 16) ^
      0x9e3779b9) >>>
    0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function deriveSeedFingerprintSha256(options: {
  readonly seed: string;
  readonly strength: AntiAiShieldStrength;
  readonly workId?: string;
  readonly creatorId?: string;
}): string {
  return computeSha256Hex(
    canonicalJsonStringify({
      creatorId: options.creatorId?.trim() || "local-creator",
      seed: options.seed.trim() || "toonstudio-default-seed",
      strength: options.strength,
      workId: options.workId?.trim() || "local-work",
    }),
  );
}

function validateSurface(surface: RgbaImageSurface): void {
  if (!Number.isInteger(surface.width) || surface.width <= 0) {
    throw new RangeError("RGBA 표면의 width는 양의 정수여야 합니다.");
  }
  if (!Number.isInteger(surface.height) || surface.height <= 0) {
    throw new RangeError("RGBA 표면의 height는 양의 정수여야 합니다.");
  }
  const expectedLength = surface.width * surface.height * 4;
  if (surface.data.length !== expectedLength) {
    throw new RangeError(
      `RGBA 버퍼 길이(${surface.data.length})가 width×height×4(${expectedLength})와 일치하지 않습니다.`,
    );
  }
}

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

/** 원본과 처리된 RGBA 버퍼 사이의 정확한 RGB MSE·PSNR(dB)·최대 채널 편차를 계산한다. */
export function computeRgbaPsnrDb(
  original: RgbaImageSurface,
  candidate: RgbaImageSurface,
): { readonly psnrDb: number; readonly mse: number; readonly maxAbsChannelDelta: number } {
  validateSurface(original);
  validateSurface(candidate);
  if (original.width !== candidate.width || original.height !== candidate.height) {
    throw new RangeError("PSNR 비교 대상의 해상도가 일치하지 않습니다.");
  }

  let squaredErrorSum = 0;
  let maxAbsChannelDelta = 0;
  const pixelCount = original.width * original.height;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const base = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const diff = Math.abs(candidate.data[base + channel] - original.data[base + channel]);
      if (diff > maxAbsChannelDelta) maxAbsChannelDelta = diff;
      squaredErrorSum += diff * diff;
    }
  }

  const mse = squaredErrorSum / (pixelCount * 3);
  const psnrDb = mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse);
  return {
    psnrDb: Number.isFinite(psnrDb) ? Number(psnrDb.toFixed(3)) : psnrDb,
    mse: Number(mse.toFixed(6)),
    maxAbsChannelDelta,
  };
}

function embedFrequencyPerturbation(
  surface: RgbaImageSurface,
  seedFingerprintSha256: string,
  amplitude: number,
): {
  readonly protectedData: Uint8ClampedArray;
  readonly highFrequencyPerturbationEnergy: number;
  readonly perturbedBlockCount: number;
} {
  const { width, height, data } = surface;
  const protectedData = new Uint8ClampedArray(data);
  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const nextRand = createDeterministicPrng(seedFingerprintSha256);

  if (blocksX === 0 || blocksY === 0) {
    let energy = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sign = nextRand() < 0.5 ? -1 : 1;
        const delta = sign * Math.min(1, Math.max(0.5, amplitude * 0.25));
        const idx = (y * width + x) * 4;
        for (let c = 0; c < 3; c += 1) protectedData[idx + c] = clampByte(data[idx + c] + delta);
        energy += delta * delta;
      }
    }
    return { protectedData, highFrequencyPerturbationEnergy: Number(energy.toFixed(3)), perturbedBlockCount: 1 };
  }

  const deltaCoeffs = new Float64Array(64);
  const spatialDelta = new Float64Array(64);
  let totalEnergy = 0;
  let perturbedBlockCount = 0;

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      deltaCoeffs.fill(0);
      for (const [u, v] of HIGH_FREQ_BAND_COORDS) {
        const sign = nextRand() < 0.5 ? -1 : 1;
        const coeffDelta = sign * amplitude * (0.85 + nextRand() * 0.3);
        deltaCoeffs[u * BLOCK_SIZE + v] = coeffDelta;
        totalEnergy += coeffDelta * coeffDelta;
      }
      inverseDct8x8(deltaCoeffs, spatialDelta);
      for (let y = 0; y < BLOCK_SIZE; y += 1) {
        const py = by * BLOCK_SIZE + y;
        for (let x = 0; x < BLOCK_SIZE; x += 1) {
          const idx = (py * width + bx * BLOCK_SIZE + x) * 4;
          const dY = spatialDelta[y * BLOCK_SIZE + x];
          protectedData[idx] = clampByte(data[idx] + dY);
          protectedData[idx + 1] = clampByte(data[idx + 1] + dY);
          protectedData[idx + 2] = clampByte(data[idx + 2] + dY);
        }
      }
      perturbedBlockCount += 1;
    }
  }

  return {
    protectedData,
    highFrequencyPerturbationEnergy: Number(totalEnergy.toFixed(3)),
    perturbedBlockCount,
  };
}

/** 후보 RGBA 이미지에 지정 시드·강도의 고주파 스타일 보호 워터마크가 삽입되어 있는지 블라인드 검출한다. */
export function detectAntiAiStyleShield(
  candidate: RgbaImageSurface,
  options: {
    readonly seed: string;
    readonly strength?: AntiAiShieldStrength;
    readonly workId?: string;
    readonly creatorId?: string;
  },
): AntiAiShieldDetectionResult {
  validateSurface(candidate);
  const strength: AntiAiShieldStrength = options.strength ?? "balanced";
  const seedFingerprintSha256 = deriveSeedFingerprintSha256({
    seed: options.seed,
    strength,
    workId: options.workId,
    creatorId: options.creatorId,
  });

  const { width, height, data } = candidate;
  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const nextRand = createDeterministicPrng(seedFingerprintSha256);

  if (blocksX === 0 || blocksY === 0) {
    return {
      detected: false,
      normalizedCorrelation: 0,
      zScore: 0,
      evaluatedBlocks: 0,
      confidenceLabelKo: "8×8 미만 초소형 이미지(주파수 블록 부족)",
    };
  }

  const lumaBlock = new Float64Array(64);
  const dctBlock = new Float64Array(64);
  let dotProduct = 0;
  let signalEnergy = 0;
  let patternEnergy = 0;
  let sampleCount = 0;

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      for (let y = 0; y < BLOCK_SIZE; y += 1) {
        const py = by * BLOCK_SIZE + y;
        for (let x = 0; x < BLOCK_SIZE; x += 1) {
          const idx = (py * width + bx * BLOCK_SIZE + x) * 4;
          lumaBlock[y * BLOCK_SIZE + x] =
            0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }
      forwardDct8x8(lumaBlock, dctBlock);
      for (const [u, v] of HIGH_FREQ_BAND_COORDS) {
        const patternValue = (nextRand() < 0.5 ? -1 : 1) * (0.85 + nextRand() * 0.3);
        const observed = dctBlock[u * BLOCK_SIZE + v];
        dotProduct += observed * patternValue;
        signalEnergy += observed * observed;
        patternEnergy += patternValue * patternValue;
        sampleCount += 1;
      }
    }
  }

  const denom = Math.sqrt(signalEnergy * patternEnergy);
  const normalizedCorrelation = denom > 1e-9 ? dotProduct / denom : 0;
  const zScore = normalizedCorrelation * Math.sqrt(sampleCount);
  const detected = normalizedCorrelation >= 0.25 && zScore >= 3.0;

  return {
    detected,
    normalizedCorrelation: Number(normalizedCorrelation.toFixed(4)),
    zScore: Number(zScore.toFixed(2)),
    evaluatedBlocks: blocksX * blocksY,
    confidenceLabelKo: detected
      ? "로컬 AI 방어 고주파 워터마크 확인됨"
      : "지정 시드의 고주파 워터마크 미검출",
  };
}

/** 100% 브라우저 로컬 주파수 도메인 미세 섭동 워터마크를 적용한다(전 프리셋 PSNR ≥ 38 dB 보장). */
export function applyAntiAiStyleShield(
  surface: RgbaImageSurface,
  options: AntiAiStyleShieldOptions,
): AntiAiStyleShieldResult {
  validateSurface(surface);
  const strength: AntiAiShieldStrength = options.strength ?? "balanced";
  const preset = ANTI_AI_SHIELD_PRESETS[strength];
  const requiredMinPsnrDb = Math.max(
    ANTI_AI_SHIELD_MIN_PSNR_DB,
    options.minPsnrDb ?? preset.guaranteedMinPsnrDb,
  );
  const seedFingerprintSha256 = deriveSeedFingerprintSha256({
    seed: options.seed,
    strength,
    workId: options.workId,
    creatorId: options.creatorId,
  });

  let effectiveAmplitude = preset.dctAmplitude;
  let embedded = embedFrequencyPerturbation(surface, seedFingerprintSha256, effectiveAmplitude);
  let psnrStats = computeRgbaPsnrDb(surface, {
    width: surface.width,
    height: surface.height,
    data: embedded.protectedData,
  });
  let psnrGuardTriggered = false;

  for (let attempt = 0; attempt < 4 && psnrStats.psnrDb < requiredMinPsnrDb; attempt += 1) {
    psnrGuardTriggered = true;
    const maxAllowedMse = (255 * 255) / 10 ** ((requiredMinPsnrDb + 0.3) / 10);
    const scale = psnrStats.mse > 0 ? Math.min(0.92, Math.sqrt(maxAllowedMse / psnrStats.mse)) : 0.85;
    effectiveAmplitude = Math.max(0.5, effectiveAmplitude * scale);
    embedded = embedFrequencyPerturbation(surface, seedFingerprintSha256, effectiveAmplitude);
    psnrStats = computeRgbaPsnrDb(surface, {
      width: surface.width,
      height: surface.height,
      data: embedded.protectedData,
    });
  }

  const protectedSurface: RgbaImageSurface = {
    width: surface.width,
    height: surface.height,
    data: embedded.protectedData,
  };
  const detectionSelfCheck = detectAntiAiStyleShield(protectedSurface, {
    seed: options.seed,
    strength,
    workId: options.workId,
    creatorId: options.creatorId,
  });

  return {
    protectedSurface,
    strength,
    seedFingerprintSha256,
    originalContentSha256: computeSha256Hex(surface.data),
    protectedContentSha256: computeSha256Hex(protectedSurface.data),
    metrics: {
      psnrDb: psnrStats.psnrDb,
      mse: psnrStats.mse,
      maxAbsChannelDelta: psnrStats.maxAbsChannelDelta,
      highFrequencyPerturbationEnergy: embedded.highFrequencyPerturbationEnergy,
      perturbedBlockCount: embedded.perturbedBlockCount,
      effectiveAmplitude: Number(effectiveAmplitude.toFixed(4)),
      psnrGuardTriggered,
    },
    detectionSelfCheck,
  };
}

const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const LOCAL_ATTESTATION_NOTICE_KO =
  "본 증명서는 브라우저 온디바이스(₩0)에서 계산된 SHA-256 콘텐츠 해시 및 Rights BOM 기록입니다. 공인 인증기관(CA)의 전자서명을 대체하지 않으며, 배포 전 원고 무결성과 AI 학습 거부 의사를 확인하는 용도로 사용됩니다.";

type ProvenanceClaimBody = Omit<CreatorProvenanceManifest, "claimDigestSha256">;

function computeClaimDigest(claimBody: ProvenanceClaimBody): string {
  return computeSha256Hex(canonicalJsonStringify(claimBody));
}

/** 작품 바이트 SHA-256·작가·도구·Rights BOM·AI 방어 워터마크를 봉인한 C2PA 스타일 매니페스트를 생성한다. */
export function buildCreatorProvenanceManifest(
  input: BuildCreatorProvenanceManifestInput,
): CreatorProvenanceManifest {
  const workId = input.workId.trim() || "local-work";
  const episodeLabel = input.episodeLabel.trim() || "EP01";
  const creatorHandle = input.creatorHandle?.trim();
  const contentSha256 = computeSha256Hex(input.contentBytes);
  const aiTrainingPolicy =
    input.aiTrainingAllowed === true
      ? ("permitted-with-license" as const)
      : ("prohibited-tdm-optout" as const);
  const shield = input.styleShieldResult;
  const shieldSummary = shield
    ? {
        applied: true,
        strength: shield.strength,
        seedFingerprintSha256: shield.seedFingerprintSha256,
        psnrDb: Number.isFinite(shield.metrics.psnrDb) ? shield.metrics.psnrDb : 999,
        highFrequencyPerturbationEnergy: shield.metrics.highFrequencyPerturbationEnergy,
        detectionCorrelation: shield.detectionSelfCheck.normalizedCorrelation,
      }
    : {
        applied: false,
        strength: "balanced" as const,
        seedFingerprintSha256: computeSha256Hex("unshielded"),
        psnrDb: 999,
        highFrequencyPerturbationEnergy: 0,
        detectionCorrelation: 0,
      };

  const assertions: readonly CreatorProvenanceAssertion[] = Object.freeze([
    Object.freeze({
      label: "c2pa.actions" as const,
      data: Object.freeze({
        action: "c2pa.created",
        softwareAgent: `ToonStudio/${input.softwareVersion?.trim() || "2.0"}`,
        digitalSourceType: "trainedAlgorithmicMedia:false",
      }),
    }),
    Object.freeze({
      label: "cawg.training-mining" as const,
      data: Object.freeze({
        doNotTrain: aiTrainingPolicy === "prohibited-tdm-optout",
        tdmReservation: aiTrainingPolicy === "prohibited-tdm-optout" ? 1 : 0,
      }),
    }),
    Object.freeze({
      label: "toonstudio.rights-bom.v1" as const,
      data: Object.freeze({ ...input.rightsBomSummary }),
    }),
    Object.freeze({
      label: "toonstudio.anti-ai-shield.v1" as const,
      data: Object.freeze({
        applied: shieldSummary.applied,
        strength: shieldSummary.strength,
        psnrDb: shieldSummary.psnrDb,
      }),
    }),
  ]);

  const claimBody: ProvenanceClaimBody = {
    schema: "toonstudio.creator-provenance-manifest/1",
    schemaVersion: 1,
    standardReference: "C2PA-style-local-v1",
    executionScope: "on-device-local-zero-cost",
    manifestId: `ts-prov-${computeSha256Hex(`${workId}:${episodeLabel}:${contentSha256}`).slice(0, 16)}`,
    issuedAtIso: input.issuedAtIso ?? "2026-11-22T00:00:00.000Z",
    workId,
    episodeLabel,
    creator: {
      displayName: input.creatorDisplayName.trim() || "ToonStudio 창작자",
      ...(creatorHandle ? { handle: creatorHandle } : {}),
      role: input.creatorRole?.trim() || "author",
    },
    toolchain: {
      software: "ToonStudio",
      version: input.softwareVersion?.trim() || "2.0.0",
      renderingEngine: input.renderingEngine?.trim() || "ToonStudio-Canvas-Local",
      aiTrainingPolicy,
    },
    rightsBomSummary: { ...input.rightsBomSummary },
    styleShield: shieldSummary,
    contentSha256,
    assertions,
    localAttestationNoticeKo: LOCAL_ATTESTATION_NOTICE_KO,
  };

  return { ...claimBody, claimDigestSha256: computeClaimDigest(claimBody) };
}

/** 온디바이스 증명서 매니페스트의 자체 서명 해시와 대상 원고 바이트의 SHA-256 일치 여부를 검증한다. */
export function verifyCreatorProvenanceManifest(
  manifest: unknown,
  contentBytes?: ByteSequence,
): CreatorProvenanceVerificationResult {
  const invalid = (summaryKo: string): CreatorProvenanceVerificationResult => ({
    valid: false,
    status: "invalid-schema",
    claimIntegrityValid: false,
    contentHashMatched: null,
    expectedClaimDigestSha256: null,
    computedContentSha256: null,
    summaryKo,
  });
  if (!manifest || typeof manifest !== "object") {
    return invalid("매니페스트가 유효한 객체 형식이 아닙니다.");
  }

  const candidate = manifest as Partial<CreatorProvenanceManifest>;
  if (
    candidate.schema !== "toonstudio.creator-provenance-manifest/1" ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.workId !== "string" ||
    typeof candidate.contentSha256 !== "string" ||
    !HEX_SHA256_PATTERN.test(candidate.contentSha256) ||
    typeof candidate.claimDigestSha256 !== "string" ||
    !HEX_SHA256_PATTERN.test(candidate.claimDigestSha256) ||
    !candidate.creator ||
    !candidate.toolchain ||
    !candidate.rightsBomSummary ||
    !candidate.styleShield ||
    !Array.isArray(candidate.assertions)
  ) {
    return invalid("필수 증명서 스키마 필드 또는 SHA-256 형식이 올바르지 않습니다.");
  }

  const { claimDigestSha256, ...claimBody } = candidate as CreatorProvenanceManifest;
  const expectedClaimDigestSha256 = computeClaimDigest(claimBody);
  const computedContentSha256 = contentBytes ? computeSha256Hex(contentBytes) : null;
  const contentHashMatched =
    computedContentSha256 !== null ? computedContentSha256 === candidate.contentSha256 : null;

  if (expectedClaimDigestSha256 !== claimDigestSha256) {
    return {
      valid: false,
      status: "manifest-tampered",
      claimIntegrityValid: false,
      contentHashMatched,
      expectedClaimDigestSha256,
      computedContentSha256,
      summaryKo: "증명서 메타데이터(작가·Rights BOM·AI 정책·해시)가 발급 이후 변조되었습니다.",
    };
  }
  if (contentHashMatched === false) {
    return {
      valid: false,
      status: "content-tampered",
      claimIntegrityValid: true,
      contentHashMatched: false,
      expectedClaimDigestSha256,
      computedContentSha256,
      summaryKo:
        "증명서는 유효하나 대상 이미지·원고 바이트의 SHA-256 해시가 일치하지 않습니다(원고 변조 감지).",
    };
  }
  return {
    valid: true,
    status: "verified",
    claimIntegrityValid: true,
    contentHashMatched,
    expectedClaimDigestSha256,
    computedContentSha256,
    summaryKo:
      contentHashMatched === true
        ? `온디바이스 SHA-256 원고 및 증명서 무결성 검증 통과 (${candidate.manifestId}).`
        : `온디바이스 증명서 메타데이터 무결성 검증 통과 (${candidate.manifestId}).`,
  };
}
