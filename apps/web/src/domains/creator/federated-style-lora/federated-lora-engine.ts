/**
 * CPU 저랭크 MSE 업데이트·결정론 노이즈·가정 예산·FedAvg 수치 예제 (Wave 41A).
 * - 순수 TypeScript Float32Array 저랭크 어댑터(ΔW = (alpha / r) · A · B, rank r = 4 | 8 | 16)
 * - 원본은 읽기만 하며 패킷에 넣지 않는다. 네트워크 관찰·원격 학습·DP 보증·원고 적용은 없다.
 * - L2 그래디언트 클리핑 + 결정론적 가우시안 노이즈 + Rényi DP(RDP) 누적 예산(epsilon, delta) 회계
 * - FedAvg 샘플 가중 다중 기기 델타 병합 + SHA-256/노름 비잔틴 방어 검증
 */

import { computeEffectiveDeltaW, computeFloat32L2Norm, forwardLoraAdapter } from "./lora-math";
import { assertPrivacyConfig, assertTrainingInput, requireFinite, requireId, requireInteger } from "./lora-input-contract";
import { exportFederatedLoraDelta } from "./federated-lora-packets";

export { computeEffectiveDeltaW, computeFloat32L2Norm, forwardLoraAdapter } from "./lora-math";
export { aggregateFederatedLoraDeltas, exportFederatedLoraDelta, verifyZeroRawEgress } from "./federated-lora-packets";

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
  readonly privacyGuarantee: "unverified-deterministic-example";
  readonly privacyVerified: false;
}

export interface FederatedLoraDeltaPacket {
  readonly packetId: string;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly baseAdapterId: string;
  readonly baseFingerprintSha256: string;
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
  readonly verificationKind: "packet-shape-and-checksum-only";
  readonly privacyVerified: false;
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

/** 가정 RDP 비용을 계산한다. 결정론 예제이며 실제 프라이버시 회계를 검증한 것이 아니다. */
export function computeStepRdpIncrement(orderAlpha: number, noiseMultiplier: number, samplingRate: number): number {
  requireFinite(orderAlpha, "RDP 차수", 2, 64);
  requireFinite(noiseMultiplier, "노이즈 가정값", 0.05, 100);
  requireFinite(samplingRate, "샘플링 가정값", 1e-4, 1);
  const sigma = noiseMultiplier;
  const q = Math.min(1, Math.max(1e-4, samplingRate));
  const fullGaussianRdp = orderAlpha / (2 * sigma * sigma);
  if (q >= 0.9999) return fullGaussianRdp;
  const logTerm = logAddExp(Math.log(1 - q), Math.log(q) + (orderAlpha - 1) * fullGaussianRdp);
  return Math.max(0, logTerm / (orderAlpha - 1));
}

/** 누적 RDP 벡터에서 주어진 delta에 대한 최소 epsilon을 계산한다. */
export function convertRdpToEpsilon(rdpTotals: readonly number[], delta: number, stepCount: number): number {
  requireInteger(stepCount, "스텝", 0, 1000000);
  requireFinite(delta, "delta 가정값", 1e-12, 0.1);
  if (rdpTotals.length !== RDP_ORDERS.length || rdpTotals.some((value) => !Number.isFinite(value) || value < 0)) throw new RangeError("RDP 가정 벡터가 올바르지 않습니다.");
  if (stepCount === 0) return 0;
  const logInvDelta = Math.log(1 / Math.min(0.1, Math.max(1e-12, delta)));
  let bestEpsilon = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RDP_ORDERS.length; i += 1) {
    const candidate = (rdpTotals[i] ?? 0) + logInvDelta / ((RDP_ORDERS[i] ?? 2) - 1);
    if (candidate < bestEpsilon) bestEpsilon = candidate;
  }
  return Number.isFinite(bestEpsilon) ? Number(Math.max(0, bestEpsilon).toFixed(4)) : 0;
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
  if (!LORA_VALID_RANKS.includes(rank)) throw new RangeError("지원하지 않는 랭크입니다.");
  const inDim = options?.inDim ?? DEFAULT_LORA_IN_DIM;
  const outDim = options?.outDim ?? DEFAULT_LORA_OUT_DIM;
  requireInteger(inDim, "입력 차원", 1, 256);
  requireInteger(outDim, "출력 차원", 1, 256);
  const alpha = options?.alpha ?? rank * 2;
  const seed = options?.seed ?? 4101;
  requireInteger(seed, "시드", 0, 0xffffffff);
  requireFinite(alpha, "alpha", Number.MIN_VALUE, 256);
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

/** 원본 RGBA 원고 패치에서 온디바이스 화풍 특징 벡터만 추출한다(원본 픽셀 미보관·미전송). */
export function extractOnDeviceStyleSample(
  pixelRgba: Uint8ClampedArray,
  width: number,
  height: number,
  meta: { readonly sampleId: string; readonly presetId: StylePresetId; readonly labelKo: string; readonly labelEn: string; readonly strokeBatchCount?: number },
): OnDeviceStyleSample {
  requireInteger(width, "RGBA 너비", 1, 1024);
  requireInteger(height, "RGBA 높이", 1, 1024);
  if (pixelRgba.length !== width * height * 4) throw new RangeError("RGBA 길이가 해상도와 일치해야 합니다.");
  requireId(meta.sampleId);
  requireInteger(meta.strokeBatchCount ?? 8, "배치 수", 1, 1000000);
  const safeW = width;
  const safeH = height;
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

/** CPU 저랭크 MSE·고정 시드 노이즈 예제 세션을 생성한다. */
export function createFederatedLoraSession(options?: {
  readonly sessionId?: string;
  readonly deviceId?: string;
  readonly rank?: LoraRank;
  readonly seed?: number;
  readonly privacyConfig?: Partial<DpPrivacyConfig>;
}): FederatedLoraSession {
  const rank: LoraRank = options?.rank ?? 8;
  const seed = options?.seed ?? 4101;
  const privacyConfig: DpPrivacyConfig = { ...DEFAULT_DP_PRIVACY_CONFIG };
  for (const [key, value] of Object.entries(options?.privacyConfig ?? {})) {
    if (value !== undefined) Object.assign(privacyConfig, { [key]: value });
  }
  assertPrivacyConfig(privacyConfig);
  requireId(options?.sessionId ?? "example-session"); requireId(options?.deviceId ?? "example-device");
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
    privacyConfig,
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

/** 합성 특징 MSE 1스텝: 역전파 → 클리핑 → 고정 시드 노이즈 → 가정 예산. 실제 DP 보증은 없다. */
export function runOnDeviceLoraStep(
  session: FederatedLoraSession,
  sample: OnDeviceStyleSample,
): { readonly session: FederatedLoraSession; readonly record: LoraTrainingStepRecord } {
  assertTrainingInput(session, sample);
  const { currentAdapter, privacyConfig } = session;
  const { inDim, outDim, rank, alpha, matrixA, matrixB } = currentAdapter;
  const scale = alpha / rank;

  const nextRdpTotals = RDP_ORDERS.map(
    (alphaOrder, idx) =>
      (session.rdpAccountantTotals[idx] ?? 0) +
      computeStepRdpIncrement(alphaOrder, privacyConfig.noiseMultiplier, privacyConfig.samplingRate),
  );
  const epsilonSpent = convertRdpToEpsilon(nextRdpTotals, privacyConfig.delta, session.stepCount + 1);
  const budgetLimit = Math.max(0.1, privacyConfig.budgetLimitEpsilon);
  const budgetUtilizationPct = Number(Math.min(100, (epsilonSpent / budgetLimit) * 100).toFixed(1));
  const budgetExhausted = epsilonSpent >= budgetLimit;

  if (privacyConfig.enforceBudgetCap && (session.epsilonSpent >= budgetLimit || epsilonSpent > budgetLimit)) {
    const lossNow = Number(computeMseLoss(forwardLoraAdapter(currentAdapter, sample.features), sample.targetModulation).toFixed(6));
    return {
      session: session.budgetExhausted ? session : { ...session, budgetExhausted: true },
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

/** 보조 기기 역할의 합성 패킷을 이 CPU에서 만든다. 원격 연결·학습은 수행하지 않는다. */
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
