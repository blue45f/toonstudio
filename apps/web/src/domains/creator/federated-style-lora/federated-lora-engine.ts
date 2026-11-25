/**
 * 온디바이스 차등 프라이버시(DP-SGD) 화풍 LoRA 학습 · FedAvg 다중 기기 안전 병합 엔진 (Wave 41A).
 * - 순수 TypeScript Float32Array 저랭크 어댑터(ΔW = (alpha / r) · A · B, rank r = 4 | 8 | 16)
 * - 원본 원고 픽셀 0-byte raw egress 보증(픽셀은 로컬 메모리에서만 특징 추출 후 폐기)
 * - L2 그래디언트 클리핑 + 결정론적 가우시안 노이즈 + Rényi DP(RDP) 누적 예산(epsilon, delta) 회계
 * - FedAvg 샘플 가중 다중 기기 델타 병합 + SHA-256/노름 비잔틴 방어 검증
 */

import { computeSha256Hex, computeSha256HexFromText } from "./semantic-resource-streamer";

export type LoraRank = 4 | 8 | 16;
export type StylePresetId = "ink-sharp-action" | "pastel-romance-wash" | "noir-crosshatch";

export interface LoraAdapterWeights {
  readonly adapterId: string;
  readonly inDim: number;
  readonly outDim: number;
  readonly rank: LoraRank;
  readonly alpha: number;
  readonly matrixA: Float32Array;
  readonly matrixB: Float32Array;
  readonly parameterCount: number;
}

export interface DpPrivacyConfig {
  readonly clipNormC: number;
  readonly noiseMultiplier: number;
  readonly delta: number;
  readonly samplingRate: number;
  readonly budgetLimitEpsilon: number;
  readonly learningRate: number;
  readonly enforceBudgetCap: boolean;
}

export interface OnDeviceStyleSample {
  readonly sampleId: string;
  readonly presetId: StylePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly strokeBatchCount: number;
  readonly sourcePixelBytes: number;
  readonly features: Float32Array;
  readonly targetModulation: Float32Array;
}

export interface LoraTrainingStepRecord {
  readonly stepIndex: number;
  readonly sampleId: string;
  readonly lossBefore: number;
  readonly lossAfter: number;
  readonly preClipGradNorm: number;
  readonly postClipGradNorm: number;
  readonly wasClipped: boolean;
  readonly noiseL2Norm: number;
  readonly effectiveDeltaWNorm: number;
  readonly epsilonCumulative: number;
  readonly delta: number;
  readonly rawPixelBytesTransmitted: 0;
  readonly blockedByBudget: boolean;
}

export interface FederatedLoraSession {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly seed: number;
  readonly baseAdapter: LoraAdapterWeights;
  readonly currentAdapter: LoraAdapterWeights;
  readonly privacyConfig: DpPrivacyConfig;
  readonly stepCount: number;
  readonly totalSamplesProcessed: number;
  readonly rdpAccountantTotals: readonly number[];
  readonly epsilonSpent: number;
  readonly budgetUtilizationPct: number;
  readonly budgetExhausted: boolean;
  readonly rawPixelBytesProcessedLocally: number;
  readonly rawPixelBytesTransmitted: 0;
  readonly stepHistory: readonly LoraTrainingStepRecord[];
}

export interface ZeroRawEgressAudit {
  readonly rawPixelBytesTransmitted: 0;
  readonly deltaPayloadBytes: number;
  readonly containsRawPixels: false;
  readonly privacyGuarantee: "dp-sgd-gradient-only";
}

export interface FederatedLoraDeltaPacket {
  readonly packetId: string;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly baseAdapterId: string;
  readonly inDim: number;
  readonly outDim: number;
  readonly rank: LoraRank;
  readonly alpha: number;
  readonly sampleCount: number;
  readonly stepsCompleted: number;
  readonly epsilonSpent: number;
  readonly delta: number;
  readonly clipNormC: number;
  readonly noiseMultiplier: number;
  readonly deltaA: Float32Array;
  readonly deltaB: Float32Array;
  readonly deltaL2Norm: number;
  readonly checksumSha256: string;
  readonly egressAudit: ZeroRawEgressAudit;
}

export interface ZeroRawEgressVerification {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

export interface RejectedDeltaPacketRecord {
  readonly packetId: string;
  readonly deviceId: string;
  readonly reasons: readonly string[];
}

export interface DeviceContributionWeight {
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly sampleCount: number;
  readonly weightRatio: number;
  readonly epsilonSpent: number;
}

export interface FedAvgAggregationResult {
  readonly ok: boolean;
  readonly mergedAdapter: LoraAdapterWeights;
  readonly effectiveDeltaWNorm: number;
  readonly acceptedCount: number;
  readonly rejectedPackets: readonly RejectedDeltaPacketRecord[];
  readonly contributions: readonly DeviceContributionWeight[];
  readonly totalSamplesMerged: number;
  readonly rawPixelBytesTransmitted: 0;
  readonly roundDigestSha256: string;
}

export interface FederatedLoraTelemetry {
  readonly rank: LoraRank;
  readonly parameterCount: number;
  readonly stepCount: number;
  readonly epsilonSpent: number;
  readonly budgetLimitEpsilon: number;
  readonly budgetUtilizationPct: number;
  readonly budgetExhausted: boolean;
  readonly latestLoss: number | null;
  readonly effectiveDeltaWNorm: number;
  readonly clippedStepRatioPct: number;
  readonly rawPixelBytesTransmitted: 0;
}

export const LORA_VALID_RANKS: readonly LoraRank[] = [4, 8, 16];
export const DEFAULT_LORA_IN_DIM = 16;
export const DEFAULT_LORA_OUT_DIM = 16;
export const RDP_ORDERS: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];

export const DEFAULT_DP_PRIVACY_CONFIG: DpPrivacyConfig = {
  clipNormC: 1.0,
  noiseMultiplier: 1.1,
  delta: 1e-5,
  samplingRate: 0.25,
  budgetLimitEpsilon: 8.0,
  learningRate: 0.14,
  enforceBudgetCap: true,
};

function createDeterministicRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleDeterministicNormal(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * rng());
}

function hashStringToUint32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function logAddExp(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return !Number.isFinite(hi) || !Number.isFinite(lo) ? hi : hi + Math.log1p(Math.exp(lo - hi));
}

/** 단일 DP-SGD 스텝의 차수별 Rényi DP(RDP) 증가량을 계산한다. */
export function computeStepRdpIncrement(orderAlpha: number, noiseMultiplier: number, samplingRate: number): number {
  const sigma = Math.max(0.05, noiseMultiplier);
  const q = Math.min(1, Math.max(1e-4, samplingRate));
  const fullGaussianRdp = orderAlpha / (2 * sigma * sigma);
  if (q >= 0.9999) return fullGaussianRdp;
  const logTerm = logAddExp(Math.log(1 - q), Math.log(q) + (orderAlpha - 1) * fullGaussianRdp);
  return Math.max(0, logTerm / (orderAlpha - 1));
}

/** 누적 RDP 벡터에서 주어진 delta에 대한 최소 epsilon을 계산한다. */
export function convertRdpToEpsilon(rdpTotals: readonly number[], delta: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  const logInvDelta = Math.log(1 / Math.min(0.1, Math.max(1e-12, delta)));
  let bestEpsilon = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RDP_ORDERS.length; i += 1) {
    const candidate = (rdpTotals[i] ?? 0) + logInvDelta / ((RDP_ORDERS[i] ?? 2) - 1);
    if (candidate < bestEpsilon) bestEpsilon = candidate;
  }
  return Number.isFinite(bestEpsilon) ? Number(Math.max(0, bestEpsilon).toFixed(4)) : 0;
}

export function computeFloat32L2Norm(arr: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i] ?? 0;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq);
}

/** 저랭크 어댑터(ΔW = (alpha / r) · A · B)를 결정론적으로 초기화한다(B=0으로 초기 ΔW=0). */
export function createLoraAdapterWeights(options?: {
  readonly adapterId?: string;
  readonly rank?: LoraRank;
  readonly inDim?: number;
  readonly outDim?: number;
  readonly alpha?: number;
  readonly seed?: number;
}): LoraAdapterWeights {
  const rank: LoraRank = options?.rank ?? 8;
  const inDim = Math.max(4, options?.inDim ?? DEFAULT_LORA_IN_DIM);
  const outDim = Math.max(4, options?.outDim ?? DEFAULT_LORA_OUT_DIM);
  const alpha = options?.alpha ?? rank * 2;
  const seed = options?.seed ?? 4101;
  const rng = createDeterministicRng(seed ^ (rank * 0x9e3779b9));
  const stdA = 1 / Math.sqrt(inDim);
  const matrixA = new Float32Array(outDim * rank);
  const matrixB = new Float32Array(rank * inDim);
  for (let i = 0; i < matrixA.length; i += 1) matrixA[i] = sampleDeterministicNormal(rng) * stdA;

  return {
    adapterId: options?.adapterId ?? `lora-style-r${rank}-v1`,
    inDim,
    outDim,
    rank,
    alpha,
    matrixA,
    matrixB,
    parameterCount: matrixA.length + matrixB.length,
  };
}

/** 유효 저랭크 변화 행렬 ΔW = (alpha / r) · (A · B)와 프로베니우스 노름을 계산한다. */
export function computeEffectiveDeltaW(adapter: LoraAdapterWeights): { readonly deltaW: Float32Array; readonly frobeniusNorm: number } {
  const { inDim, outDim, rank, alpha, matrixA, matrixB } = adapter;
  const scale = alpha / rank;
  const deltaW = new Float32Array(outDim * inDim);
  for (let row = 0; row < outDim; row += 1) {
    for (let col = 0; col < inDim; col += 1) {
      let acc = 0;
      for (let r = 0; r < rank; r += 1) acc += (matrixA[row * rank + r] ?? 0) * (matrixB[r * inDim + col] ?? 0);
      deltaW[row * inDim + col] = acc * scale;
    }
  }
  return { deltaW, frobeniusNorm: computeFloat32L2Norm(deltaW) };
}

/** 어댑터 순전파 y = base(x) + (alpha / r) · A · (B · x)를 계산한다. */
export function forwardLoraAdapter(adapter: LoraAdapterWeights, inputFeatures: Float32Array): Float32Array {
  const { inDim, outDim, rank, alpha, matrixA, matrixB } = adapter;
  const scale = alpha / rank;
  const hidden = new Float32Array(rank);
  for (let r = 0; r < rank; r += 1) {
    let acc = 0;
    for (let j = 0; j < inDim; j += 1) acc += (matrixB[r * inDim + j] ?? 0) * (inputFeatures[j] ?? 0);
    hidden[r] = acc;
  }
  const output = new Float32Array(outDim);
  for (let i = 0; i < outDim; i += 1) {
    let deltaAcc = 0;
    for (let r = 0; r < rank; r += 1) deltaAcc += (matrixA[i * rank + r] ?? 0) * (hidden[r] ?? 0);
    output[i] = (inputFeatures[i % inDim] ?? 0) + scale * deltaAcc;
  }
  return output;
}

/** 원본 RGBA 원고 패치에서 온디바이스 화풍 특징 벡터만 추출한다(원본 픽셀 미보관·미전송). */
export function extractOnDeviceStyleSample(
  pixelRgba: Uint8ClampedArray,
  width: number,
  height: number,
  meta: { readonly sampleId: string; readonly presetId: StylePresetId; readonly labelKo: string; readonly labelEn: string; readonly strokeBatchCount?: number },
): OnDeviceStyleSample {
  const safeW = Math.max(2, Math.floor(width));
  const safeH = Math.max(2, Math.floor(height));
  const totalPixels = safeW * safeH;
  const luma = new Float32Array(totalPixels);
  let ink = 0; let mid = 0; let high = 0; let sumR = 0; let sumG = 0; let sumB = 0;

  for (let idx = 0; idx < totalPixels; idx += 1) {
    const p = idx * 4;
    const r = (pixelRgba[p] ?? 255) / 255;
    const g = (pixelRgba[p + 1] ?? 255) / 255;
    const b = (pixelRgba[p + 2] ?? 255) / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[idx] = y; sumR += r; sumG += g; sumB += b;
    if (y < 0.28) ink += 1; else if (y < 0.72) mid += 1; else high += 1;
  }

  let gxE = 0; let gyE = 0; let dpE = 0; let dnE = 0;
  for (let y = 1; y < safeH - 1; y += 1) {
    for (let x = 1; x < safeW - 1; x += 1) {
      const c = y * safeW + x;
      gxE += Math.abs((luma[c + 1] ?? 0) - (luma[c - 1] ?? 0));
      gyE += Math.abs((luma[c + safeW] ?? 0) - (luma[c - safeW] ?? 0));
      dpE += Math.abs((luma[c + safeW + 1] ?? 0) - (luma[c - safeW - 1] ?? 0));
      dnE += Math.abs((luma[c + safeW - 1] ?? 0) - (luma[c - safeW + 1] ?? 0));
    }
  }

  const inner = Math.max(1, (safeW - 2) * (safeH - 2));
  const inv = 1 / Math.max(1, totalPixels);
  const features = new Float32Array([
    ink * inv, mid * inv, high * inv, sumR * inv, sumG * inv, sumB * inv,
    gxE / inner, gyE / inner, dpE / inner, dnE / inner,
    Math.abs(gxE - gyE) / inner, Math.abs(dpE - dnE) / inner,
    Math.min(1, (ink + mid * 0.5) * inv), Math.abs(sumR - sumB) * inv, Math.abs(sumG - sumB) * inv,
    Math.min(1, (gxE + gyE + dpE + dnE) / (inner * 2)),
  ]);

  const targetModulation = new Float32Array(DEFAULT_LORA_OUT_DIM);
  const presetBias = meta.presetId === "ink-sharp-action" ? 0.45 : meta.presetId === "pastel-romance-wash" ? -0.35 : 0.25;
  for (let i = 0; i < DEFAULT_LORA_OUT_DIM; i += 1) {
    targetModulation[i] = (features[i] ?? 0) + presetBias * 0.4 + Math.sin((i + 1) * 0.7 + presetBias * 2.1) * 0.32;
  }

  return {
    sampleId: meta.sampleId,
    presetId: meta.presetId,
    labelKo: meta.labelKo,
    labelEn: meta.labelEn,
    strokeBatchCount: Math.max(1, meta.strokeBatchCount ?? 8),
    sourcePixelBytes: pixelRgba.byteLength,
    features,
    targetModulation,
  };
}

/** 절차적 로컬 RGBA 원고 패치에서 기본 3종 웹툰 화풍 학습 배치를 생성한다. */
export function createDefaultOnDeviceStyleSamples(): readonly OnDeviceStyleSample[] {
  const configs = [
    { id: "batch-ink-sharp-01", presetId: "ink-sharp-action" as const, labelKo: "액션 먹선 강약 · 속도선 배치", labelEn: "Action Ink Weight & Speedline Batch", seed: 1011, stripeMod: 3 },
    { id: "batch-pastel-wash-02", presetId: "pastel-romance-wash" as const, labelKo: "로맨스 수채 그라데이션 · 연필선 배치", labelEn: "Romance Pastel Wash & Pencil Batch", seed: 2027, stripeMod: 5 },
    { id: "batch-noir-hatch-03", presetId: "noir-crosshatch" as const, labelKo: "느와르 크로스해칭 · 고대비 명암 배치", labelEn: "Noir Crosshatch High-Contrast Batch", seed: 3049, stripeMod: 2 },
  ];

  return configs.map((cfg) => {
    const pixels = new Uint8ClampedArray(32 * 32 * 4);
    const rng = createDeterministicRng(cfg.seed);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const p = (y * 32 + x) * 4;
        const jitter = Math.floor(rng() * 30);
        const shade = (x + y * cfg.stripeMod) % 7 === 0 ? Math.max(0, 20 + jitter) : Math.min(255, (cfg.presetId === "pastel-romance-wash" ? 210 : 175) + jitter);
        pixels[p] = cfg.presetId === "pastel-romance-wash" ? Math.min(255, shade + 14) : shade;
        pixels[p + 1] = shade;
        pixels[p + 2] = cfg.presetId === "noir-crosshatch" ? Math.max(0, shade - 12) : shade;
        pixels[p + 3] = 255;
      }
    }
    return extractOnDeviceStyleSample(pixels, 32, 32, {
      sampleId: cfg.id,
      presetId: cfg.presetId,
      labelKo: cfg.labelKo,
      labelEn: cfg.labelEn,
      strokeBatchCount: 8,
    });
  });
}

/** 온디바이스 차등 프라이버시 LoRA 학습 세션을 생성한다. */
export function createFederatedLoraSession(options?: {
  readonly sessionId?: string;
  readonly deviceId?: string;
  readonly rank?: LoraRank;
  readonly seed?: number;
  readonly privacyConfig?: Partial<DpPrivacyConfig>;
}): FederatedLoraSession {
  const rank: LoraRank = options?.rank ?? 8;
  const seed = options?.seed ?? 4101;
  const baseAdapter = createLoraAdapterWeights({ rank, seed });
  const currentAdapter: LoraAdapterWeights = {
    ...baseAdapter,
    matrixA: new Float32Array(baseAdapter.matrixA),
    matrixB: new Float32Array(baseAdapter.matrixB),
  };

  return {
    sessionId: options?.sessionId ?? `fl-session-r${rank}-${seed}`,
    deviceId: options?.deviceId ?? "device-studio-primary",
    seed,
    baseAdapter,
    currentAdapter,
    privacyConfig: { ...DEFAULT_DP_PRIVACY_CONFIG, ...options?.privacyConfig },
    stepCount: 0,
    totalSamplesProcessed: 0,
    rdpAccountantTotals: RDP_ORDERS.map(() => 0),
    epsilonSpent: 0,
    budgetUtilizationPct: 0,
    budgetExhausted: false,
    rawPixelBytesProcessedLocally: 0,
    rawPixelBytesTransmitted: 0,
    stepHistory: [],
  };
}

function computeMseLoss(pred: Float32Array, target: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pred.length; i += 1) {
    const diff = (pred[i] ?? 0) - (target[i] ?? 0);
    sum += diff * diff;
  }
  return 0.5 * (sum / Math.max(1, pred.length));
}

/** 온디바이스 DP-SGD LoRA 1스텝: 역전파 → L2 클리핑 → 결정론 가우시안 노이즈 → RDP 예산 회계. */
export function runOnDeviceLoraStep(
  session: FederatedLoraSession,
  sample: OnDeviceStyleSample,
): { readonly session: FederatedLoraSession; readonly record: LoraTrainingStepRecord } {
  const { currentAdapter, privacyConfig } = session;
  const { inDim, outDim, rank, alpha, matrixA, matrixB } = currentAdapter;
  const scale = alpha / rank;

  if (privacyConfig.enforceBudgetCap && session.budgetExhausted) {
    const lossNow = Number(computeMseLoss(forwardLoraAdapter(currentAdapter, sample.features), sample.targetModulation).toFixed(6));
    return {
      session,
      record: {
        stepIndex: session.stepCount,
        sampleId: sample.sampleId,
        lossBefore: lossNow,
        lossAfter: lossNow,
        preClipGradNorm: 0,
        postClipGradNorm: 0,
        wasClipped: false,
        noiseL2Norm: 0,
        effectiveDeltaWNorm: Number(computeEffectiveDeltaW(currentAdapter).frobeniusNorm.toFixed(6)),
        epsilonCumulative: session.epsilonSpent,
        delta: privacyConfig.delta,
        rawPixelBytesTransmitted: 0,
        blockedByBudget: true,
      },
    };
  }

  const hidden = new Float32Array(rank);
  for (let r = 0; r < rank; r += 1) {
    let acc = 0;
    for (let j = 0; j < inDim; j += 1) acc += (matrixB[r * inDim + j] ?? 0) * (sample.features[j] ?? 0);
    hidden[r] = acc;
  }

  const predBefore = new Float32Array(outDim);
  const errGrad = new Float32Array(outDim);
  for (let i = 0; i < outDim; i += 1) {
    let deltaAcc = 0;
    for (let r = 0; r < rank; r += 1) deltaAcc += (matrixA[i * rank + r] ?? 0) * (hidden[r] ?? 0);
    const yHat = (sample.features[i % inDim] ?? 0) + scale * deltaAcc;
    predBefore[i] = yHat;
    errGrad[i] = (yHat - (sample.targetModulation[i] ?? 0)) / outDim;
  }
  const lossBefore = computeMseLoss(predBefore, sample.targetModulation);

  const gradA = new Float32Array(matrixA.length);
  const gradB = new Float32Array(matrixB.length);
  const gradHidden = new Float32Array(rank);
  for (let i = 0; i < outDim; i += 1) {
    const e = errGrad[i] ?? 0;
    for (let r = 0; r < rank; r += 1) {
      gradA[i * rank + r] = scale * e * (hidden[r] ?? 0);
      gradHidden[r] = (gradHidden[r] ?? 0) + scale * (matrixA[i * rank + r] ?? 0) * e;
    }
  }
  for (let r = 0; r < rank; r += 1) {
    const gh = gradHidden[r] ?? 0;
    for (let j = 0; j < inDim; j += 1) gradB[r * inDim + j] = gh * (sample.features[j] ?? 0);
  }

  const preClipGradNorm = Math.sqrt(computeFloat32L2Norm(gradA) ** 2 + computeFloat32L2Norm(gradB) ** 2);
  const clipC = Math.max(0.05, privacyConfig.clipNormC);
  const wasClipped = preClipGradNorm > clipC;
  const clipFactor = wasClipped ? clipC / preClipGradNorm : 1.0;
  for (let i = 0; i < gradA.length; i += 1) gradA[i] = (gradA[i] ?? 0) * clipFactor;
  for (let i = 0; i < gradB.length; i += 1) gradB[i] = (gradB[i] ?? 0) * clipFactor;
  const postClipGradNorm = Math.sqrt(computeFloat32L2Norm(gradA) ** 2 + computeFloat32L2Norm(gradB) ** 2);

  const nextStepIndex = session.stepCount + 1;
  const noiseSeed = (session.seed ^ Math.imul(nextStepIndex, 0x9e3779b1) ^ hashStringToUint32(`${session.deviceId}:${sample.sampleId}`)) >>> 0;
  const noiseRng = createDeterministicRng(noiseSeed);
  const noiseStd = (Math.max(0, privacyConfig.noiseMultiplier) * clipC) / Math.max(1, sample.strokeBatchCount);

  let noiseSqSum = 0;
  const nextA = new Float32Array(matrixA.length);
  const nextB = new Float32Array(matrixB.length);
  const lr = privacyConfig.learningRate;
  for (let i = 0; i < matrixA.length; i += 1) {
    const n = sampleDeterministicNormal(noiseRng) * noiseStd;
    noiseSqSum += n * n;
    nextA[i] = (matrixA[i] ?? 0) - lr * ((gradA[i] ?? 0) + n);
  }
  for (let i = 0; i < matrixB.length; i += 1) {
    const n = sampleDeterministicNormal(noiseRng) * noiseStd;
    noiseSqSum += n * n;
    nextB[i] = (matrixB[i] ?? 0) - lr * ((gradB[i] ?? 0) + n);
  }

  const nextAdapter: LoraAdapterWeights = { ...currentAdapter, matrixA: nextA, matrixB: nextB };
  const lossAfter = computeMseLoss(forwardLoraAdapter(nextAdapter, sample.features), sample.targetModulation);
  const effectiveDeltaWNorm = computeEffectiveDeltaW(nextAdapter).frobeniusNorm;
  const nextRdpTotals = RDP_ORDERS.map(
    (alphaOrder, idx) =>
      (session.rdpAccountantTotals[idx] ?? 0) +
      computeStepRdpIncrement(alphaOrder, privacyConfig.noiseMultiplier, privacyConfig.samplingRate),
  );
  const epsilonSpent = convertRdpToEpsilon(nextRdpTotals, privacyConfig.delta, nextStepIndex);
  const budgetLimit = Math.max(0.1, privacyConfig.budgetLimitEpsilon);
  const budgetUtilizationPct = Number(Math.min(100, (epsilonSpent / budgetLimit) * 100).toFixed(1));
  const budgetExhausted = epsilonSpent >= budgetLimit;

  const record: LoraTrainingStepRecord = {
    stepIndex: nextStepIndex,
    sampleId: sample.sampleId,
    lossBefore: Number(lossBefore.toFixed(6)),
    lossAfter: Number(lossAfter.toFixed(6)),
    preClipGradNorm: Number(preClipGradNorm.toFixed(6)),
    postClipGradNorm: Number(postClipGradNorm.toFixed(6)),
    wasClipped,
    noiseL2Norm: Number(Math.sqrt(noiseSqSum).toFixed(6)),
    effectiveDeltaWNorm: Number(effectiveDeltaWNorm.toFixed(6)),
    epsilonCumulative: epsilonSpent,
    delta: privacyConfig.delta,
    rawPixelBytesTransmitted: 0,
    blockedByBudget: false,
  };

  return {
    record,
    session: {
      ...session,
      currentAdapter: nextAdapter,
      stepCount: nextStepIndex,
      totalSamplesProcessed: session.totalSamplesProcessed + sample.strokeBatchCount,
      rdpAccountantTotals: nextRdpTotals,
      epsilonSpent,
      budgetUtilizationPct,
      budgetExhausted,
      rawPixelBytesProcessedLocally: session.rawPixelBytesProcessedLocally + sample.sourcePixelBytes,
      rawPixelBytesTransmitted: 0,
      stepHistory: [...session.stepHistory, record],
    },
  };
}

function computeDeltaPacketChecksum(
  baseAdapterId: string,
  deviceId: string,
  rank: LoraRank,
  sampleCount: number,
  deltaA: Float32Array,
  deltaB: Float32Array,
): string {
  const headerDigest = computeSha256HexFromText(`${baseAdapterId}|${deviceId}|r${rank}|n${sampleCount}|${deltaA.length}|${deltaB.length}`);
  const byteView = new Uint8Array((deltaA.length + deltaB.length) * 4 + 32);
  for (let i = 0; i < 32; i += 1) byteView[i] = Number.parseInt(headerDigest.slice(i * 2, i * 2 + 2), 16) & 0xff;
  const view = new DataView(byteView.buffer, 32);
  let offset = 0;
  for (let i = 0; i < deltaA.length; i += 1) { view.setFloat32(offset, deltaA[i] ?? 0, true); offset += 4; }
  for (let i = 0; i < deltaB.length; i += 1) { view.setFloat32(offset, deltaB[i] ?? 0, true); offset += 4; }
  return computeSha256Hex(byteView);
}

/** 온디바이스 세션에서 원본 픽셀 0바이트·델타 전용 연합학습 패킷을 추출한다. */
export function exportFederatedLoraDelta(session: FederatedLoraSession, deviceLabel = "메인 작업실 데스크톱"): FederatedLoraDeltaPacket {
  const { baseAdapter, currentAdapter, privacyConfig } = session;
  const deltaA = new Float32Array(currentAdapter.matrixA.length);
  const deltaB = new Float32Array(currentAdapter.matrixB.length);
  for (let i = 0; i < deltaA.length; i += 1) deltaA[i] = (currentAdapter.matrixA[i] ?? 0) - (baseAdapter.matrixA[i] ?? 0);
  for (let i = 0; i < deltaB.length; i += 1) deltaB[i] = (currentAdapter.matrixB[i] ?? 0) - (baseAdapter.matrixB[i] ?? 0);

  const sampleCount = Math.max(1, session.totalSamplesProcessed);
  const checksumSha256 = computeDeltaPacketChecksum(baseAdapter.adapterId, session.deviceId, currentAdapter.rank, sampleCount, deltaA, deltaB);
  return {
    packetId: `pkt-${session.deviceId}-s${session.stepCount}-${checksumSha256.slice(0, 8)}`,
    deviceId: session.deviceId,
    deviceLabel,
    baseAdapterId: baseAdapter.adapterId,
    inDim: currentAdapter.inDim,
    outDim: currentAdapter.outDim,
    rank: currentAdapter.rank,
    alpha: currentAdapter.alpha,
    sampleCount,
    stepsCompleted: session.stepCount,
    epsilonSpent: session.epsilonSpent,
    delta: privacyConfig.delta,
    clipNormC: privacyConfig.clipNormC,
    noiseMultiplier: privacyConfig.noiseMultiplier,
    deltaA,
    deltaB,
    deltaL2Norm: Number(Math.sqrt(computeFloat32L2Norm(deltaA) ** 2 + computeFloat32L2Norm(deltaB) ** 2).toFixed(6)),
    checksumSha256,
    egressAudit: {
      rawPixelBytesTransmitted: 0,
      deltaPayloadBytes: (deltaA.length + deltaB.length) * 4,
      containsRawPixels: false,
      privacyGuarantee: "dp-sgd-gradient-only",
    },
  };
}

const FORBIDDEN_RAW_PIXEL_KEYS: readonly string[] = ["pixels", "pixelRgba", "imageData", "rawCanvas", "rawManuscript"];

/** 연합 델타 패킷이 0-byte raw pixel egress 및 SHA-256 무결성 규칙을 만족하는지 검증한다. */
export function verifyZeroRawEgress(packet: FederatedLoraDeltaPacket): ZeroRawEgressVerification {
  const reasons: string[] = [];
  if (packet.egressAudit.rawPixelBytesTransmitted !== 0) reasons.push("raw-pixel-bytes-nonzero");
  if (packet.egressAudit.containsRawPixels !== false) reasons.push("contains-raw-pixels-flag");

  const rawRecord = packet as unknown as Readonly<Record<string, unknown>>;
  for (const key of FORBIDDEN_RAW_PIXEL_KEYS) {
    if (key in rawRecord && rawRecord[key] !== undefined) reasons.push(`forbidden-key:${key}`);
  }
  if (packet.deltaA.length !== packet.outDim * packet.rank || packet.deltaB.length !== packet.rank * packet.inDim) {
    reasons.push("dimension-length-mismatch");
  }
  if (packet.egressAudit.deltaPayloadBytes !== (packet.deltaA.length + packet.deltaB.length) * 4) {
    reasons.push("delta-payload-bytes-mismatch");
  }
  if (packet.deltaA.some((v) => !Number.isFinite(v))) reasons.push("non-finite-deltaA");
  if (packet.deltaB.some((v) => !Number.isFinite(v))) reasons.push("non-finite-deltaB");

  const recomputed = computeDeltaPacketChecksum(
    packet.baseAdapterId, packet.deviceId, packet.rank, packet.sampleCount, packet.deltaA, packet.deltaB,
  );
  if (recomputed !== packet.checksumSha256) reasons.push("checksum-sha256-mismatch");
  return { valid: reasons.length === 0, reasons };
}

/** FedAvg 다중 기기 안전한 델타 병합(랭크·무결성·노름 비잔틴 방어 및 샘플 수 가중 평균). */
export function aggregateFederatedLoraDeltas(
  baseAdapter: LoraAdapterWeights,
  packets: readonly FederatedLoraDeltaPacket[],
  options?: { readonly maxAllowedDeltaNorm?: number },
): FedAvgAggregationResult {
  const maxNorm = options?.maxAllowedDeltaNorm ?? 25.0;
  const accepted: FederatedLoraDeltaPacket[] = [];
  const rejectedPackets: RejectedDeltaPacketRecord[] = [];

  for (const packet of packets) {
    const reasons: string[] = [];
    if (packet.rank !== baseAdapter.rank || packet.inDim !== baseAdapter.inDim || packet.outDim !== baseAdapter.outDim) {
      reasons.push("adapter-shape-mismatch");
    }
    if (packet.sampleCount <= 0 || !Number.isFinite(packet.sampleCount)) reasons.push("invalid-sample-count");
    const egressCheck = verifyZeroRawEgress(packet);
    if (!egressCheck.valid) reasons.push(...egressCheck.reasons);
    const computedNorm = Math.sqrt(computeFloat32L2Norm(packet.deltaA) ** 2 + computeFloat32L2Norm(packet.deltaB) ** 2);
    if (!Number.isFinite(computedNorm) || computedNorm > maxNorm) reasons.push("delta-norm-exceeds-guard");

    if (reasons.length > 0) rejectedPackets.push({ packetId: packet.packetId, deviceId: packet.deviceId, reasons });
    else accepted.push(packet);
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      mergedAdapter: { ...baseAdapter, matrixA: new Float32Array(baseAdapter.matrixA), matrixB: new Float32Array(baseAdapter.matrixB) },
      effectiveDeltaWNorm: Number(computeEffectiveDeltaW(baseAdapter).frobeniusNorm.toFixed(6)),
      acceptedCount: 0,
      rejectedPackets,
      contributions: [],
      totalSamplesMerged: 0,
      rawPixelBytesTransmitted: 0,
      roundDigestSha256: computeSha256HexFromText(`fedavg-empty|${baseAdapter.adapterId}`),
    };
  }

  const totalSamplesMerged = accepted.reduce((sum, pkt) => sum + pkt.sampleCount, 0);
  const aggDeltaA = new Float32Array(baseAdapter.matrixA.length);
  const aggDeltaB = new Float32Array(baseAdapter.matrixB.length);
  const contributions: DeviceContributionWeight[] = accepted.map((pkt) => {
    const weightRatio = pkt.sampleCount / totalSamplesMerged;
    for (let i = 0; i < aggDeltaA.length; i += 1) aggDeltaA[i] = (aggDeltaA[i] ?? 0) + weightRatio * (pkt.deltaA[i] ?? 0);
    for (let i = 0; i < aggDeltaB.length; i += 1) aggDeltaB[i] = (aggDeltaB[i] ?? 0) + weightRatio * (pkt.deltaB[i] ?? 0);
    return { deviceId: pkt.deviceId, deviceLabel: pkt.deviceLabel, sampleCount: pkt.sampleCount, weightRatio: Number(weightRatio.toFixed(4)), epsilonSpent: pkt.epsilonSpent };
  });

  const mergedA = new Float32Array(baseAdapter.matrixA.length);
  const mergedB = new Float32Array(baseAdapter.matrixB.length);
  for (let i = 0; i < mergedA.length; i += 1) mergedA[i] = (baseAdapter.matrixA[i] ?? 0) + (aggDeltaA[i] ?? 0);
  for (let i = 0; i < mergedB.length; i += 1) mergedB[i] = (baseAdapter.matrixB[i] ?? 0) + (aggDeltaB[i] ?? 0);

  const mergedAdapter: LoraAdapterWeights = { ...baseAdapter, matrixA: mergedA, matrixB: mergedB };
  return {
    ok: true,
    mergedAdapter,
    effectiveDeltaWNorm: Number(computeEffectiveDeltaW(mergedAdapter).frobeniusNorm.toFixed(6)),
    acceptedCount: accepted.length,
    rejectedPackets,
    contributions,
    totalSamplesMerged,
    rawPixelBytesTransmitted: 0,
    roundDigestSha256: computeDeltaPacketChecksum(
      baseAdapter.adapterId, accepted.map((p) => p.deviceId).join("+"), baseAdapter.rank, totalSamplesMerged, aggDeltaA, aggDeltaB,
    ),
  };
}

/** 동일 창작자의 보조 기기에서 생성된 온디바이스 DP-LoRA 델타 패킷을 결정론적으로 생성한다. */
export function createPeerDeviceLoraPackets(
  baseSession: FederatedLoraSession,
  samples: readonly OnDeviceStyleSample[],
): readonly FederatedLoraDeltaPacket[] {
  const peerSpecs = [
    { deviceId: "device-tablet-pro", deviceLabel: "보조 태블릿 드로잉 패드", steps: 2, seedOffset: 77, sampleIdx: 1 },
    { deviceId: "device-mobile-sketch", deviceLabel: "이동형 스케치 노트북", steps: 3, seedOffset: 149, sampleIdx: 2 },
  ] as const;

  const packets: FederatedLoraDeltaPacket[] = [];
  for (const spec of peerSpecs) {
    let peerSession: FederatedLoraSession = {
      ...createFederatedLoraSession({ deviceId: spec.deviceId, rank: baseSession.baseAdapter.rank, seed: baseSession.seed + spec.seedOffset, privacyConfig: baseSession.privacyConfig }),
      baseAdapter: baseSession.baseAdapter,
      currentAdapter: { ...baseSession.baseAdapter, matrixA: new Float32Array(baseSession.baseAdapter.matrixA), matrixB: new Float32Array(baseSession.baseAdapter.matrixB) },
    };
    const chosenSample = samples[spec.sampleIdx % Math.max(1, samples.length)] ?? samples[0];
    if (!chosenSample) continue;
    for (let s = 0; s < spec.steps; s += 1) peerSession = runOnDeviceLoraStep(peerSession, chosenSample).session;
    packets.push(exportFederatedLoraDelta(peerSession, spec.deviceLabel));
  }
  return packets;
}

/** 온디바이스 연합 LoRA 세션의 핵심 텔레메트리를 계산한다. */
export function computeFederatedLoraTelemetry(session: FederatedLoraSession): FederatedLoraTelemetry {
  const latest = session.stepHistory[session.stepHistory.length - 1];
  const clippedCount = session.stepHistory.filter((item) => item.wasClipped).length;
  return {
    rank: session.currentAdapter.rank,
    parameterCount: session.currentAdapter.parameterCount,
    stepCount: session.stepCount,
    epsilonSpent: session.epsilonSpent,
    budgetLimitEpsilon: session.privacyConfig.budgetLimitEpsilon,
    budgetUtilizationPct: session.budgetUtilizationPct,
    budgetExhausted: session.budgetExhausted,
    latestLoss: latest ? latest.lossAfter : null,
    effectiveDeltaWNorm: Number(computeEffectiveDeltaW(session.currentAdapter).frobeniusNorm.toFixed(6)),
    clippedStepRatioPct: session.stepHistory.length === 0 ? 0 : Number(((clippedCount / session.stepHistory.length) * 100).toFixed(1)),
    rawPixelBytesTransmitted: 0,
  };
}
