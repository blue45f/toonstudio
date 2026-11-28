/**
 * Wave 93 — 비잔틴 내성 연합 화풍 집계기, 메인 작가 앵커 드리프트 가드,
 * FIPS 180-4 SHA-256 해시 체인 감사 원장 (`federated-studio-aggregator-and-drift-guard.ts`).
 *
 * - 순수 동기 ES2017 FIPS 180-4 SHA-256 및 정규 직렬화 (외부 암호 라이브러리 무의존)
 * - 3종 집계기(`weighted-fedavg`, `coordinate-trimmed-mean`, `coordinate-median`)
 * - 역할별 권한 가중치(`lead-artist` > `color-assistant` / `line-assistant`)와
 *   MAD 강건 Z-score 이상치 자동 탐지·거부/감쇠
 * - 메인 작가 고정 앵커 드리프트 가드(코사인 거리·최대 축 드리프트·OKLCH 그림자 색차)
 *   기준 초과 시 자동 롤백(`ROLLED_BACK_DRIFT_GUARD`)
 * - 어시스턴트 화풍 정합도(0..100) 및 상위 3개 이탈 축 한국어 조율 힌트 산출
 */

import {
  STYLE_ADAPTER_AXES,
  STYLE_ADAPTER_AXIS_SPECS,
  STYLE_ADAPTER_DIMENSION,
  addStyleVectors,
  assertFiniteStyleVector,
  clampStyleVectorToBounds,
  computeL2Norm,
  createZeroStyleDeltaVector,
  scaleStyleVector,
  tupleToVector,
  validateZeroRawArtworkPayload,
  type FederatedStyleDeltaEnvelope,
  type StudioParticipantRole,
  type StyleAdapterAxisKey,
  type StyleAdapterVector,
} from "./local-style-delta-extractor";

// ---------------------------------------------------------------------------
// 1. 순수 동기 ES2017 FIPS 180-4 SHA-256 및 정규 직렬화
// ---------------------------------------------------------------------------

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_INIT: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function encodeUtf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

export function sha256FederatedHex(input: string): string {
  const message = encodeUtf8Bytes(input);
  const bitLenHigh = Math.floor((message.length * 8) / 0x100000000) >>> 0;
  const bitLenLow = (message.length * 8) >>> 0;
  const paddedLen = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHigh, false);
  view.setUint32(paddedLen - 4, bitLenLow, false);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = SHA256_INIT;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function canonicalSerializeFederated(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("정규 직렬화 대상에 유한하지 않은 숫자가 포함되었습니다.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerializeFederated(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const pairs = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSerializeFederated(record[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

export function computeFederatedGenesisHashHex(studioId: string): string {
  return sha256FederatedHex(`wave93-federated-genesis:${studioId.trim()}`);
}

// ---------------------------------------------------------------------------
// 2. 집계 정책·드리프트·감사 원장 타입 계약
// ---------------------------------------------------------------------------

export type FederatedAggregatorKind =
  | "weighted-fedavg"
  | "coordinate-trimmed-mean"
  | "coordinate-median";

export type OutlierHandlingMode = "reject" | "downweight";

export type FederatedRoundDecision =
  | "APPLIED"
  | "ROLLED_BACK_DRIFT_GUARD"
  | "ROLLED_BACK_NO_VALID_DELTAS";

export type ParticipantRejectionReason =
  | "RAW_ARTWORK_VIOLATION"
  | "INVALID_VECTOR"
  | "NORM_VIOLATION"
  | "STATISTICAL_OUTLIER";

export interface LeadArtistDriftGuardPolicy {
  readonly maxCosineDistance: number;
  readonly maxAxisDrift: number;
  readonly maxOklchShadowDrift: number;
}

export interface FederatedAggregationPolicy {
  readonly studioId: string;
  readonly roundIndex: number;
  readonly aggregator: FederatedAggregatorKind;
  readonly roleWeights?: Partial<Record<StudioParticipantRole, number>>;
  readonly maxAcceptedL2Norm: number;
  readonly outlierZScoreThreshold: number;
  readonly outlierHandling?: OutlierHandlingMode;
  readonly trimFraction?: number;
  readonly stepLearningRate?: number;
  readonly leadArtistAnchor: StyleAdapterVector;
  readonly driftGuard: LeadArtistDriftGuardPolicy;
  readonly previousChainHashHex?: string;
  readonly recordedAtIso?: string;
}

export interface ParticipantDeltaAuditRecord {
  readonly participantId: string;
  readonly role: StudioParticipantRole;
  readonly rawRoleWeight: number;
  readonly effectiveWeight: number;
  readonly l2Norm: number;
  readonly robustZScore: number;
  readonly status: "accepted" | "downweighted" | "rejected";
  readonly rejectionReason: ParticipantRejectionReason | null;
}

export interface LeadArtistDriftMetrics {
  readonly cosineDistance: number;
  readonly maxAxisDrift: number;
  readonly maxAxisDriftKey: StyleAdapterAxisKey;
  readonly oklchShadowDriftEstimate: number;
  readonly anchorAlignmentScore: number;
  readonly exceededChecks: readonly ("cosineDistance" | "maxAxisDrift" | "oklchShadowDrift")[];
}

export interface FederatedRoundAuditEntry {
  readonly schemaVersion: "wave93-federated-audit-entry/v1";
  readonly roundIndex: number;
  readonly studioId: string;
  readonly recordedAtIso: string;
  readonly previousHashHex: string;
  readonly aggregator: FederatedAggregatorKind;
  readonly decision: FederatedRoundDecision;
  readonly acceptedParticipantIds: readonly string[];
  readonly rejectedParticipantIds: readonly string[];
  readonly baseAdapterHashHex: string;
  readonly nextAdapterHashHex: string;
  readonly driftMetrics: LeadArtistDriftMetrics;
  readonly rawArtworkUploaded: false;
  readonly entryHashHex: string;
}

export interface FederatedStyleRoundResult {
  readonly studioId: string;
  readonly roundIndex: number;
  readonly aggregator: FederatedAggregatorKind;
  readonly decision: FederatedRoundDecision;
  readonly rolledBack: boolean;
  readonly previousAdapter: StyleAdapterVector;
  readonly candidateAdapter: StyleAdapterVector;
  readonly nextAdapter: StyleAdapterVector;
  readonly aggregatedDelta: StyleAdapterVector;
  readonly participantAudits: readonly ParticipantDeltaAuditRecord[];
  readonly acceptedCount: number;
  readonly downweightedCount: number;
  readonly rejectedOutlierCount: number;
  readonly driftMetrics: LeadArtistDriftMetrics;
  readonly appliedAlignmentScore: number;
  readonly auditEntry: FederatedRoundAuditEntry;
  readonly rawArtworkUploaded: false;
}

export interface FederatedAuditChainVerificationResult {
  readonly valid: boolean;
  readonly checkedEntryCount: number;
  readonly failedRoundIndex: number | null;
  readonly violations: readonly string[];
}

export interface DivergingStyleAxisAdvice {
  readonly axis: StyleAdapterAxisKey;
  readonly labelKo: string;
  readonly assistantValue: number;
  readonly teamValue: number;
  readonly signedDeltaToTeam: number;
  readonly normalizedDrift: number;
  readonly tuningHintKo: string;
}

export interface AssistantStyleAlignmentReport {
  readonly alignmentScore: number;
  readonly rmsNormalizedDivergence: number;
  readonly maxNormalizedDivergence: number;
  readonly topDivergingAxes: readonly DivergingStyleAxisAdvice[];
}

const DEFAULT_ROLE_WEIGHTS: Readonly<Record<StudioParticipantRole, number>> = {
  "lead-artist": 2.0,
  "color-assistant": 1.0,
  "line-assistant": 1.0,
};

// ---------------------------------------------------------------------------
// 3. 수학 헬퍼: 정규화 좌표·중앙값·OKLCH 그림자 색차
// ---------------------------------------------------------------------------

function normalizeStyleToUnitSpace(vector: StyleAdapterVector): readonly number[] {
  return STYLE_ADAPTER_AXES.map((axis) => {
    const spec = STYLE_ADAPTER_AXIS_SPECS[axis];
    return (vector[axis] - spec.min) / spec.scaleSpan;
  });
}

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeWeightedMedian(
  pairs: readonly { readonly value: number; readonly weight: number }[],
): number {
  if (pairs.length === 0) return 0;
  const sorted = [...pairs].sort((a, b) => a.value - b.value);
  let totalWeight = 0;
  for (const pair of sorted) totalWeight += pair.weight;
  if (totalWeight <= 0) return computeMedian(sorted.map((p) => p.value));
  const half = totalWeight / 2;
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i].weight;
    if (cumulative > half) return sorted[i].value;
    if (Math.abs(cumulative - half) <= 1e-12 && i + 1 < sorted.length) {
      return (sorted[i].value + sorted[i + 1].value) / 2;
    }
  }
  return sorted[sorted.length - 1].value;
}

function computeNormalizedCosineDistance(
  candidate: StyleAdapterVector,
  anchor: StyleAdapterVector,
): number {
  const a = normalizeStyleToUnitSpace(candidate);
  const b = normalizeStyleToUnitSpace(anchor);
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < STYLE_ADAPTER_DIMENSION; i += 1) {
    const av = a[i] + 0.25;
    const bv = b[i] + 0.25;
    dot += av * bv; normA += av * av; normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 1e-12) return 0;
  return Math.max(0, 1 - Math.max(-1, Math.min(1, dot / denom)));
}

function styleShadowToOkLab(vector: StyleAdapterVector): readonly [number, number, number] {
  const L = Math.max(0.05, Math.min(0.85, 0.22 + 0.45 * vector.inkBlackFloor - 0.14 * vector.ambientOcclusionBias));
  const C = Math.max(0.01, Math.min(0.32, 0.05 + 0.18 * vector.shadowChromaGain));
  const hueRad =
    ((240 + vector.shadowHueShiftDeg + 28 * (vector.colorTempKelvinNorm - 0.5) - 20 * (vector.skinSubsurfaceWarmth - 0.5)) *
      Math.PI) / 180;
  return [L, C * Math.cos(hueRad), C * Math.sin(hueRad)];
}

export function computeLeadArtistDriftMetrics(
  candidate: StyleAdapterVector,
  anchor: StyleAdapterVector,
  guardPolicy: LeadArtistDriftGuardPolicy,
): LeadArtistDriftMetrics {
  assertFiniteStyleVector(candidate, "candidate");
  assertFiniteStyleVector(anchor, "anchor");

  const cosineDistance = computeNormalizedCosineDistance(candidate, anchor);
  let maxAxisDrift = 0;
  let maxAxisDriftKey: StyleAdapterAxisKey = STYLE_ADAPTER_AXES[0];
  let sumSqNormDiff = 0;

  for (const axis of STYLE_ADAPTER_AXES) {
    const normDiff = Math.abs(candidate[axis] - anchor[axis]) / STYLE_ADAPTER_AXIS_SPECS[axis].scaleSpan;
    sumSqNormDiff += normDiff * normDiff;
    if (normDiff > maxAxisDrift) {
      maxAxisDrift = normDiff;
      maxAxisDriftKey = axis;
    }
  }

  const [l1, a1, b1] = styleShadowToOkLab(candidate);
  const [l2, a2, b2] = styleShadowToOkLab(anchor);
  const oklchShadowDriftEstimate = Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
  const anchorAlignmentScore = Number(
    Math.max(0, Math.min(100, 100 * (1 - Math.sqrt(sumSqNormDiff / STYLE_ADAPTER_DIMENSION)))).toFixed(2),
  );

  const exceededChecks: ("cosineDistance" | "maxAxisDrift" | "oklchShadowDrift")[] = [];
  if (cosineDistance > guardPolicy.maxCosineDistance) exceededChecks.push("cosineDistance");
  if (maxAxisDrift > guardPolicy.maxAxisDrift) exceededChecks.push("maxAxisDrift");
  if (oklchShadowDriftEstimate > guardPolicy.maxOklchShadowDrift) exceededChecks.push("oklchShadowDrift");

  return {
    cosineDistance, maxAxisDrift, maxAxisDriftKey,
    oklchShadowDriftEstimate, anchorAlignmentScore, exceededChecks,
  };
}

// ---------------------------------------------------------------------------
// 4. 감사 원장 해시 체인 검증
// ---------------------------------------------------------------------------

function buildAuditEntryHash(entry: Omit<FederatedRoundAuditEntry, "entryHashHex">): string {
  return sha256FederatedHex(canonicalSerializeFederated(entry));
}

export function verifyFederatedAuditChain(
  entries: readonly FederatedRoundAuditEntry[],
  studioId: string,
  expectedGenesisHashHex?: string,
): FederatedAuditChainVerificationResult {
  const violations: string[] = [];
  let failedRoundIndex: number | null = null;
  let expectedPrev = expectedGenesisHashHex ?? computeFederatedGenesisHashHex(studioId);

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const fail = (msg: string): void => {
      if (failedRoundIndex === null) failedRoundIndex = entry.roundIndex;
      violations.push(msg);
    };
    if (entry.studioId !== studioId) fail(`라운드 ${entry.roundIndex}: studioId 불일치(${entry.studioId}).`);
    if (entry.rawArtworkUploaded !== false) fail(`라운드 ${entry.roundIndex}: rawArtworkUploaded 계약 위반.`);
    if (i > 0 && entry.roundIndex <= entries[i - 1].roundIndex) fail(`라운드 ${entry.roundIndex}: 라운드 번호 단조 증가 위반.`);
    if (entry.previousHashHex !== expectedPrev) fail(`라운드 ${entry.roundIndex}: previousHashHex 체인 단절 감지.`);

    const { entryHashHex, ...unsignedBody } = entry;
    if (entryHashHex !== buildAuditEntryHash(unsignedBody)) {
      fail(`라운드 ${entry.roundIndex}: entryHashHex SHA-256 무결성 위변조 감지.`);
    }
    expectedPrev = entryHashHex;
  }
  return { valid: violations.length === 0, checkedEntryCount: entries.length, failedRoundIndex, violations };
}

// ---------------------------------------------------------------------------
// 5. 비잔틴 내성 연합 집계 및 드리프트 가드 실행
// ---------------------------------------------------------------------------

interface ValidatedSubmission {
  readonly envelope: FederatedStyleDeltaEnvelope;
  readonly l2Norm: number;
  readonly rawRoleWeight: number;
}

function aggregateByStrategy(
  aggregator: FederatedAggregatorKind,
  participants: readonly { readonly delta: StyleAdapterVector; readonly weight: number }[],
  trimFraction: number,
): StyleAdapterVector {
  if (participants.length === 0) return createZeroStyleDeltaVector();

  const values = STYLE_ADAPTER_AXES.map((axis) => {
    if (aggregator === "coordinate-median") {
      return computeWeightedMedian(participants.map((p) => ({ value: p.delta[axis], weight: p.weight })));
    }
    if (aggregator === "coordinate-trimmed-mean") {
      const sorted = participants
        .map((p) => ({ value: p.delta[axis], weight: p.weight }))
        .sort((a, b) => a.value - b.value);
      const n = sorted.length;
      const frac = Math.max(0, Math.min(0.45, trimFraction));
      const requestedTrim = frac > 0 && n >= 3 ? Math.max(1, Math.floor(n * frac)) : 0;
      const trimEach = Math.min(Math.floor((n - 1) / 2), requestedTrim);
      const kept = sorted.slice(trimEach, n - trimEach);
      let wSum = 0; let vSum = 0;
      for (const item of kept) { wSum += item.weight; vSum += item.value * item.weight; }
      return wSum > 0 ? vSum / wSum : 0;
    }
    let wSum = 0; let vSum = 0;
    for (const p of participants) { wSum += p.weight; vSum += p.delta[axis] * p.weight; }
    return wSum > 0 ? vSum / wSum : 0;
  });
  return tupleToVector(values);
}

export function aggregateFederatedStyleRound(
  baseAdapter: StyleAdapterVector,
  submittedDeltas: readonly FederatedStyleDeltaEnvelope[],
  policy: FederatedAggregationPolicy,
): FederatedStyleRoundResult {
  assertFiniteStyleVector(baseAdapter, "baseAdapter");
  assertFiniteStyleVector(policy.leadArtistAnchor, "leadArtistAnchor");

  const outlierHandling = policy.outlierHandling ?? "reject";
  const trimFraction = policy.trimFraction ?? 0.2;
  const stepLearningRate = Math.max(0.05, Math.min(1.0, policy.stepLearningRate ?? 1.0));
  const previousHashHex = policy.previousChainHashHex ?? computeFederatedGenesisHashHex(policy.studioId);
  const recordedAtIso = policy.recordedAtIso ?? "2026-11-28T00:00:00.000Z";
  const roleWeights: Readonly<Record<StudioParticipantRole, number>> = {
    "lead-artist": policy.roleWeights?.["lead-artist"] ?? DEFAULT_ROLE_WEIGHTS["lead-artist"],
    "color-assistant": policy.roleWeights?.["color-assistant"] ?? DEFAULT_ROLE_WEIGHTS["color-assistant"],
    "line-assistant": policy.roleWeights?.["line-assistant"] ?? DEFAULT_ROLE_WEIGHTS["line-assistant"],
  };

  const preAudits: ParticipantDeltaAuditRecord[] = [];
  const structurallyValid: ValidatedSubmission[] = [];

  for (const envelope of submittedDeltas) {
    const rawRoleWeight = roleWeights[envelope.role] ?? 1.0;
    if (!validateZeroRawArtworkPayload(envelope).safe) {
      preAudits.push({
        participantId: envelope.participantId, role: envelope.role, rawRoleWeight,
        effectiveWeight: 0, l2Norm: 0, robustZScore: Number.POSITIVE_INFINITY,
        status: "rejected", rejectionReason: "RAW_ARTWORK_VIOLATION",
      });
      continue;
    }
    const allFinite = STYLE_ADAPTER_AXES.every(
      (axis) => typeof envelope.deltaVector[axis] === "number" && Number.isFinite(envelope.deltaVector[axis]),
    );
    if (!allFinite) {
      preAudits.push({
        participantId: envelope.participantId, role: envelope.role, rawRoleWeight,
        effectiveWeight: 0, l2Norm: 0, robustZScore: Number.POSITIVE_INFINITY,
        status: "rejected", rejectionReason: "INVALID_VECTOR",
      });
      continue;
    }
    const l2Norm = computeL2Norm(envelope.deltaVector);
    if (l2Norm > policy.maxAcceptedL2Norm) {
      preAudits.push({
        participantId: envelope.participantId, role: envelope.role, rawRoleWeight,
        effectiveWeight: 0, l2Norm, robustZScore: l2Norm / Math.max(policy.maxAcceptedL2Norm, 1e-6),
        status: "rejected", rejectionReason: "NORM_VIOLATION",
      });
      continue;
    }
    structurallyValid.push({ envelope, l2Norm, rawRoleWeight });
  }

  const coordMedian = tupleToVector(
    STYLE_ADAPTER_AXES.map((axis) => computeMedian(structurallyValid.map((s) => s.envelope.deltaVector[axis]))),
  );
  const distances = structurallyValid.map((s) => {
    let sumSq = 0;
    for (const axis of STYLE_ADAPTER_AXES) {
      const d = s.envelope.deltaVector[axis] - coordMedian[axis];
      sumSq += d * d;
    }
    return Math.sqrt(sumSq);
  });
  const medianDist = computeMedian(distances);
  const madDist = computeMedian(distances.map((d) => Math.abs(d - medianDist)));
  const robustScale = Math.max(1.4826 * madDist, 1e-4);

  const participantAudits: ParticipantDeltaAuditRecord[] = [...preAudits];
  const active: { readonly delta: StyleAdapterVector; readonly weight: number }[] = [];

  for (let i = 0; i < structurallyValid.length; i += 1) {
    const item = structurallyValid[i];
    const robustZScore = structurallyValid.length >= 3 ? Math.max(0, (distances[i] - medianDist) / robustScale) : 0;
    const isOutlier = robustZScore > policy.outlierZScoreThreshold;

    if (isOutlier && outlierHandling === "reject") {
      participantAudits.push({
        participantId: item.envelope.participantId, role: item.envelope.role,
        rawRoleWeight: item.rawRoleWeight, effectiveWeight: 0, l2Norm: item.l2Norm,
        robustZScore, status: "rejected", rejectionReason: "STATISTICAL_OUTLIER",
      });
      continue;
    }
    const effectiveWeight =
      isOutlier && outlierHandling === "downweight"
        ? item.rawRoleWeight / (1 + robustZScore * robustZScore)
        : item.rawRoleWeight;
    participantAudits.push({
      participantId: item.envelope.participantId, role: item.envelope.role,
      rawRoleWeight: item.rawRoleWeight, effectiveWeight, l2Norm: item.l2Norm,
      robustZScore, status: isOutlier ? "downweighted" : "accepted", rejectionReason: null,
    });
    active.push({ delta: item.envelope.deltaVector, weight: effectiveWeight });
  }

  const aggregatedDelta = aggregateByStrategy(policy.aggregator, active, trimFraction);
  const candidateAdapter =
    active.length > 0
      ? clampStyleVectorToBounds(addStyleVectors(baseAdapter, scaleStyleVector(aggregatedDelta, stepLearningRate)))
      : baseAdapter;

  const driftMetrics = computeLeadArtistDriftMetrics(candidateAdapter, policy.leadArtistAnchor, policy.driftGuard);
  const decision: FederatedRoundDecision =
    active.length === 0
      ? "ROLLED_BACK_NO_VALID_DELTAS"
      : driftMetrics.exceededChecks.length > 0
        ? "ROLLED_BACK_DRIFT_GUARD"
        : "APPLIED";
  const rolledBack = decision !== "APPLIED";
  const nextAdapter = rolledBack ? baseAdapter : candidateAdapter;
  const appliedAlignmentScore = computeAssistantStyleAlignment(nextAdapter, policy.leadArtistAnchor).alignmentScore;

  const acceptedParticipantIds = participantAudits
    .filter((a) => a.status !== "rejected")
    .map((a) => a.participantId);
  const rejectedParticipantIds = participantAudits
    .filter((a) => a.status === "rejected")
    .map((a) => a.participantId);

  const unsignedEntry: Omit<FederatedRoundAuditEntry, "entryHashHex"> = {
    schemaVersion: "wave93-federated-audit-entry/v1",
    roundIndex: policy.roundIndex,
    studioId: policy.studioId,
    recordedAtIso,
    previousHashHex,
    aggregator: policy.aggregator,
    decision,
    acceptedParticipantIds,
    rejectedParticipantIds,
    baseAdapterHashHex: sha256FederatedHex(canonicalSerializeFederated(baseAdapter)),
    nextAdapterHashHex: sha256FederatedHex(canonicalSerializeFederated(nextAdapter)),
    driftMetrics,
    rawArtworkUploaded: false,
  };
  const auditEntry: FederatedRoundAuditEntry = { ...unsignedEntry, entryHashHex: buildAuditEntryHash(unsignedEntry) };

  return {
    studioId: policy.studioId, roundIndex: policy.roundIndex, aggregator: policy.aggregator,
    decision, rolledBack, previousAdapter: baseAdapter, candidateAdapter, nextAdapter, aggregatedDelta,
    participantAudits,
    acceptedCount: participantAudits.filter((a) => a.status === "accepted").length,
    downweightedCount: participantAudits.filter((a) => a.status === "downweighted").length,
    rejectedOutlierCount: rejectedParticipantIds.length,
    driftMetrics, appliedAlignmentScore, auditEntry, rawArtworkUploaded: false,
  };
}

// ---------------------------------------------------------------------------
// 6. 어시스턴트 화풍 정합도 및 상위 3개 이탈 축 한국어 조율 힌트
// ---------------------------------------------------------------------------

export function computeAssistantStyleAlignment(
  assistantVector: StyleAdapterVector,
  teamAdapter: StyleAdapterVector,
): AssistantStyleAlignmentReport {
  assertFiniteStyleVector(assistantVector, "assistantVector");
  assertFiniteStyleVector(teamAdapter, "teamAdapter");

  const perAxis = STYLE_ADAPTER_AXES.map((axis) => {
    const spec = STYLE_ADAPTER_AXIS_SPECS[axis];
    const assistantValue = assistantVector[axis];
    const teamValue = teamAdapter[axis];
    const signedDeltaToTeam = teamValue - assistantValue;
    const normalizedDrift = Math.abs(signedDeltaToTeam) / spec.scaleSpan;
    const tuningHintKo =
      normalizedDrift < 1e-6
        ? `${spec.labelKo} 항목은 팀 기준과 일치합니다.`
        : `${spec.labelKo} 차이 ${Math.abs(signedDeltaToTeam).toFixed(2)}${spec.unitLabel}: ${
            signedDeltaToTeam >= 0 ? spec.increaseActionKo : spec.decreaseActionKo
          }`;
    return { axis, labelKo: spec.labelKo, assistantValue, teamValue, signedDeltaToTeam, normalizedDrift, tuningHintKo };
  });

  let sumSq = 0;
  let maxNormalizedDivergence = 0;
  for (const item of perAxis) {
    sumSq += item.normalizedDrift * item.normalizedDrift;
    if (item.normalizedDrift > maxNormalizedDivergence) maxNormalizedDivergence = item.normalizedDrift;
  }
  const rmsNormalizedDivergence = Math.sqrt(sumSq / STYLE_ADAPTER_DIMENSION);
  const alignmentScore = Number(Math.max(0, Math.min(100, 100 * (1 - rmsNormalizedDivergence))).toFixed(2));
  const topDivergingAxes = [...perAxis]
    .sort((a, b) => (b.normalizedDrift !== a.normalizedDrift ? b.normalizedDrift - a.normalizedDrift : a.axis.localeCompare(b.axis)))
    .slice(0, 3);

  return { alignmentScore, rmsNormalizedDivergence, maxNormalizedDivergence, topDivergingAxes };
}
