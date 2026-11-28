/**
 * Wave 146 — 원시 다항식 `0x11d` 기반 순수 GF(256) 유한체 산술 및 이중 패리티(P+Q) 자가 치유 코덱.
 *
 * - 원시 다항식 `x^8 + x^4 + x^3 + x^2 + 1` (`0x11d`)의 생성원 `g = 2` 로그/지수 테이블로
 *   유한체 사칙연산(`gf256Add`, `gf256Mul`, `gf256Div`, `gf256Inv`, `gf256GeneratorPow`)을 제공한다.
 * - K개 가변 길이 데이터 샤드에 대해 P(XOR) + Q(2^i 가중합) 이중 패리티를 생성하고,
 *   최대 2개 샤드 동시 소실·비트 로트 변조까지 SHA-256 검증을 거쳐 100% 비트 일치 복구한다.
 * - 3개 이상 동시 손실 시 fail-closed(`unrecoverable-exceeds-parity-budget`)로 즉시 차단한다.
 */

import { sha256VaultBytesHex } from "./fastcdc-rolling-chunker";

export const GF256_PRIMITIVE_POLYNOMIAL = 0x11d;
export const MAX_DUAL_PARITY_DATA_SHARDS = 254;

function buildGf256Tables(): { readonly exp: Uint8Array; readonly log: Uint8Array } {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if ((value & 0x100) !== 0) {
      value ^= GF256_PRIMITIVE_POLYNOMIAL;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    exp[i] = exp[i - 255] ?? 0;
  }
  return { exp, log };
}

const GF256_TABLES = buildGf256Tables();
const GF256_EXP = GF256_TABLES.exp;
const GF256_LOG = GF256_TABLES.log;

/** GF(256) 덧셈(및 뺄셈): 특성 2 유한체이므로 비트 XOR과 동일하다. */
export function gf256Add(a: number, b: number): number {
  return (a ^ b) & 0xff;
}

/** GF(256) 곱셈 (`0x11d` 로그/지수 테이블 기반). */
export function gf256Mul(a: number, b: number): number {
  const x = a & 0xff;
  const y = b & 0xff;
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[(GF256_LOG[x] ?? 0) + (GF256_LOG[y] ?? 0)] ?? 0;
}

/** GF(256) 곱셈 역원(`a^-1`). `a === 0`이면 RangeError를 던진다. */
export function gf256Inv(a: number): number {
  const x = a & 0xff;
  if (x === 0) {
    throw new RangeError("GF(256)에서 0의 곱셈 역원은 존재하지 않습니다.");
  }
  return GF256_EXP[255 - (GF256_LOG[x] ?? 0)] ?? 1;
}

/** GF(256) 나눗셈(`a / b`). `b === 0`이면 RangeError를 던진다. */
export function gf256Div(a: number, b: number): number {
  const x = a & 0xff;
  const y = b & 0xff;
  if (y === 0) {
    throw new RangeError("GF(256)에서 0으로 나눌 수 없습니다.");
  }
  if (x === 0) return 0;
  const diff = (GF256_LOG[x] ?? 0) - (GF256_LOG[y] ?? 0) + 255;
  return GF256_EXP[diff] ?? 0;
}

/** GF(256) 생성원 `2^i` 값을 반환한다. */
export function gf256GeneratorPow(exponent: number): number {
  const normalized = ((exponent % 255) + 255) % 255;
  return GF256_EXP[normalized] ?? 1;
}

export interface DualParityStripe {
  readonly stripeId: string;
  readonly dataShardCount: number;
  readonly shardSizeBytes: number;
  readonly dataShardOriginalLengths: readonly number[];
  readonly dataShardSha256Hex: readonly string[];
  readonly parityP: Uint8Array;
  readonly parityQ: Uint8Array;
  readonly parityPSha256Hex: string;
  readonly parityQSha256Hex: string;
}

export type DualParityHealStatus =
  | "healthy"
  | "healed"
  | "unrecoverable-exceeds-parity-budget"
  | "unrecoverable-hash-mismatch";

export interface DualParityHealResult {
  readonly stripeId: string;
  readonly status: DualParityHealStatus;
  readonly recoverable: boolean;
  readonly faultCount: number;
  readonly detectedFaultLabels: readonly string[];
  readonly healedShardLabels: readonly string[];
  readonly dataShards: readonly (Uint8Array | null)[];
  readonly parityP: Uint8Array | null;
  readonly parityQ: Uint8Array | null;
}

export type DualParityStripeMeta = Pick<
  DualParityStripe,
  | "stripeId"
  | "dataShardCount"
  | "shardSizeBytes"
  | "dataShardOriginalLengths"
  | "dataShardSha256Hex"
  | "parityPSha256Hex"
  | "parityQSha256Hex"
>;

function zeroPadShard(bytes: Uint8Array, shardSizeBytes: number): Uint8Array {
  const padded = new Uint8Array(shardSizeBytes);
  padded.set(bytes, 0);
  return padded;
}

function computeParityPQ(
  paddedDataShards: readonly Uint8Array[],
  shardSizeBytes: number,
): { readonly parityP: Uint8Array; readonly parityQ: Uint8Array } {
  const parityP = new Uint8Array(shardSizeBytes);
  const parityQ = new Uint8Array(shardSizeBytes);

  for (let i = 0; i < paddedDataShards.length; i += 1) {
    const shard = paddedDataShards[i];
    if (!shard) continue;
    const weight = gf256GeneratorPow(i);
    for (let b = 0; b < shardSizeBytes; b += 1) {
      const val = shard[b] ?? 0;
      parityP[b] = (parityP[b] ?? 0) ^ val;
      parityQ[b] = (parityQ[b] ?? 0) ^ gf256Mul(weight, val);
    }
  }

  return { parityP, parityQ };
}

/** K개 데이터 샤드에 대해 GF(256) 이중 패리티(P + Q) 스트라이프를 생성한다. */
export function encodeDualParityStripe(
  dataShards: readonly Uint8Array[],
  stripeId: string = "stripe-0",
): DualParityStripe {
  const k = dataShards.length;
  if (k < 1 || k > MAX_DUAL_PARITY_DATA_SHARDS) {
    throw new RangeError(
      `이중 패리티 스트라이프 데이터 샤드 수는 1~${MAX_DUAL_PARITY_DATA_SHARDS}개여야 합니다(입력: ${k}).`,
    );
  }

  let shardSizeBytes = 1;
  const originalLengths: number[] = [];
  const dataHashes: string[] = [];
  for (let i = 0; i < k; i += 1) {
    const shard = dataShards[i];
    if (!shard) {
      throw new RangeError(`데이터 샤드[${i}]가 비어 있습니다.`);
    }
    originalLengths.push(shard.length);
    dataHashes.push(sha256VaultBytesHex(shard));
    if (shard.length > shardSizeBytes) {
      shardSizeBytes = shard.length;
    }
  }

  const paddedShards: Uint8Array[] = [];
  for (let i = 0; i < k; i += 1) {
    paddedShards.push(zeroPadShard(dataShards[i] ?? new Uint8Array(0), shardSizeBytes));
  }

  const { parityP, parityQ } = computeParityPQ(paddedShards, shardSizeBytes);

  return {
    stripeId,
    dataShardCount: k,
    shardSizeBytes,
    dataShardOriginalLengths: originalLengths,
    dataShardSha256Hex: dataHashes,
    parityP,
    parityQ,
    parityPSha256Hex: sha256VaultBytesHex(parityP),
    parityQSha256Hex: sha256VaultBytesHex(parityQ),
  };
}

function recoverSingleMissingDataShard(
  k: number,
  shardSize: number,
  missingIndex: number,
  paddedWorking: readonly (Uint8Array | null)[],
  pHealthy: boolean,
  candidateParityP: Uint8Array | null | undefined,
  candidateParityQ: Uint8Array | null | undefined,
): Uint8Array {
  const recoveredPadded = new Uint8Array(shardSize);
  if (pHealthy && candidateParityP) {
    for (let b = 0; b < shardSize; b += 1) {
      let acc = candidateParityP[b] ?? 0;
      for (let i = 0; i < k; i += 1) {
        if (i === missingIndex) continue;
        acc ^= paddedWorking[i]?.[b] ?? 0;
      }
      recoveredPadded[b] = acc;
    }
    return recoveredPadded;
  }

  const invGx = gf256Inv(gf256GeneratorPow(missingIndex));
  const qBuf = candidateParityQ ?? new Uint8Array(shardSize);
  for (let b = 0; b < shardSize; b += 1) {
    let partialQ = 0;
    for (let i = 0; i < k; i += 1) {
      if (i === missingIndex) continue;
      partialQ ^= gf256Mul(gf256GeneratorPow(i), paddedWorking[i]?.[b] ?? 0);
    }
    recoveredPadded[b] = gf256Mul(invGx, (qBuf[b] ?? 0) ^ partialQ);
  }
  return recoveredPadded;
}

function recoverTwoMissingDataShards(
  k: number,
  shardSize: number,
  x: number,
  y: number,
  paddedWorking: readonly (Uint8Array | null)[],
  candidateParityP: Uint8Array,
  candidateParityQ: Uint8Array,
): { readonly shardX: Uint8Array; readonly shardY: Uint8Array } {
  const gx = gf256GeneratorPow(x);
  const gy = gf256GeneratorPow(y);
  const invDelta = gf256Inv(gf256Add(gx, gy));
  const coeffA = gf256Mul(invDelta, gx);
  const coeffB = invDelta;

  const shardX = new Uint8Array(shardSize);
  const shardY = new Uint8Array(shardSize);
  for (let b = 0; b < shardSize; b += 1) {
    let partialP = 0;
    let partialQ = 0;
    for (let i = 0; i < k; i += 1) {
      if (i === x || i === y) continue;
      const val = paddedWorking[i]?.[b] ?? 0;
      partialP ^= val;
      partialQ ^= gf256Mul(gf256GeneratorPow(i), val);
    }
    const sp = (candidateParityP[b] ?? 0) ^ partialP;
    const sq = (candidateParityQ[b] ?? 0) ^ partialQ;
    const dy = gf256Mul(coeffA, sp) ^ gf256Mul(coeffB, sq);
    shardX[b] = sp ^ dy;
    shardY[b] = dy;
  }
  return { shardX, shardY };
}

function buildFailResult(
  stripeId: string,
  status: DualParityHealStatus,
  faultCount: number,
  detectedFaultLabels: readonly string[],
  verifiedData: readonly (Uint8Array | null)[],
  parityP: Uint8Array | null,
  parityQ: Uint8Array | null,
): DualParityHealResult {
  return {
    stripeId,
    status,
    recoverable: false,
    faultCount,
    detectedFaultLabels,
    healedShardLabels: [],
    dataShards: verifiedData,
    parityP,
    parityQ,
  };
}

/**
 * SHA-256 무결성 검증으로 손상·누락 샤드를 식별하고, 최대 2개 동시 손실까지
 * GF(256) P+Q 이중 패리티 방정식으로 원본 바이트를 100% 비트 일치 복구한다.
 */
export function decodeAndHealDualParityStripe(
  stripeMeta: DualParityStripeMeta,
  candidateDataShards: readonly (Uint8Array | null | undefined)[],
  candidateParityP: Uint8Array | null | undefined,
  candidateParityQ: Uint8Array | null | undefined,
): DualParityHealResult {
  const k = stripeMeta.dataShardCount;
  const shardSize = stripeMeta.shardSizeBytes;
  const verifiedData: (Uint8Array | null)[] = new Array<Uint8Array | null>(k).fill(null);
  const missingDataIndices: number[] = [];
  const detectedFaultLabels: string[] = [];

  for (let i = 0; i < k; i += 1) {
    const candidate = candidateDataShards[i];
    const expectedLen = stripeMeta.dataShardOriginalLengths[i] ?? 0;
    const expectedHash = stripeMeta.dataShardSha256Hex[i] ?? "";
    if (
      candidate !== null &&
      candidate !== undefined &&
      candidate.length === expectedLen &&
      sha256VaultBytesHex(candidate) === expectedHash
    ) {
      verifiedData[i] = candidate.slice();
    } else {
      missingDataIndices.push(i);
      detectedFaultLabels.push(`data[${i}]`);
    }
  }

  const pHealthy =
    candidateParityP !== null &&
    candidateParityP !== undefined &&
    candidateParityP.length === shardSize &&
    sha256VaultBytesHex(candidateParityP) === stripeMeta.parityPSha256Hex;
  if (!pHealthy) detectedFaultLabels.push("parity-P");

  const qHealthy =
    candidateParityQ !== null &&
    candidateParityQ !== undefined &&
    candidateParityQ.length === shardSize &&
    sha256VaultBytesHex(candidateParityQ) === stripeMeta.parityQSha256Hex;
  if (!qHealthy) detectedFaultLabels.push("parity-Q");

  const safeP = pHealthy && candidateParityP ? candidateParityP.slice() : null;
  const safeQ = qHealthy && candidateParityQ ? candidateParityQ.slice() : null;
  const faultCount = detectedFaultLabels.length;

  if (faultCount === 0) {
    return {
      stripeId: stripeMeta.stripeId,
      status: "healthy",
      recoverable: true,
      faultCount: 0,
      detectedFaultLabels: [],
      healedShardLabels: [],
      dataShards: verifiedData,
      parityP: safeP,
      parityQ: safeQ,
    };
  }

  if (faultCount > 2) {
    return buildFailResult(
      stripeMeta.stripeId,
      "unrecoverable-exceeds-parity-budget",
      faultCount,
      detectedFaultLabels,
      verifiedData,
      safeP,
      safeQ,
    );
  }

  const paddedWorking: (Uint8Array | null)[] = new Array<Uint8Array | null>(k).fill(null);
  for (let i = 0; i < k; i += 1) {
    const valid = verifiedData[i];
    if (valid !== null && valid !== undefined) {
      paddedWorking[i] = zeroPadShard(valid, shardSize);
    }
  }

  const healedLabels: string[] = [];

  if (missingDataIndices.length === 1) {
    const x = missingDataIndices[0] ?? 0;
    const recoveredPadded = recoverSingleMissingDataShard(
      k,
      shardSize,
      x,
      paddedWorking,
      pHealthy,
      safeP,
      safeQ,
    );
    const trimmed = recoveredPadded.slice(0, stripeMeta.dataShardOriginalLengths[x] ?? 0);
    if (sha256VaultBytesHex(trimmed) !== (stripeMeta.dataShardSha256Hex[x] ?? "")) {
      return buildFailResult(
        stripeMeta.stripeId,
        "unrecoverable-hash-mismatch",
        faultCount,
        detectedFaultLabels,
        verifiedData,
        safeP,
        safeQ,
      );
    }
    verifiedData[x] = trimmed;
    paddedWorking[x] = zeroPadShard(trimmed, shardSize);
    healedLabels.push(`data[${x}]`);
  } else if (missingDataIndices.length === 2 && safeP && safeQ) {
    const x = missingDataIndices[0] ?? 0;
    const y = missingDataIndices[1] ?? 1;
    const { shardX, shardY } = recoverTwoMissingDataShards(
      k,
      shardSize,
      x,
      y,
      paddedWorking,
      safeP,
      safeQ,
    );
    const trimmedX = shardX.slice(0, stripeMeta.dataShardOriginalLengths[x] ?? 0);
    const trimmedY = shardY.slice(0, stripeMeta.dataShardOriginalLengths[y] ?? 0);
    if (
      sha256VaultBytesHex(trimmedX) !== (stripeMeta.dataShardSha256Hex[x] ?? "") ||
      sha256VaultBytesHex(trimmedY) !== (stripeMeta.dataShardSha256Hex[y] ?? "")
    ) {
      return buildFailResult(
        stripeMeta.stripeId,
        "unrecoverable-hash-mismatch",
        faultCount,
        detectedFaultLabels,
        verifiedData,
        safeP,
        safeQ,
      );
    }
    verifiedData[x] = trimmedX;
    verifiedData[y] = trimmedY;
    paddedWorking[x] = zeroPadShard(trimmedX, shardSize);
    paddedWorking[y] = zeroPadShard(trimmedY, shardSize);
    healedLabels.push(`data[${x}]`, `data[${y}]`);
  }

  let finalP: Uint8Array | null = safeP;
  let finalQ: Uint8Array | null = safeQ;
  if (!pHealthy || !qHealthy) {
    const completePadded: Uint8Array[] = [];
    for (let i = 0; i < k; i += 1) {
      completePadded.push(paddedWorking[i] ?? new Uint8Array(shardSize));
    }
    const rebuilt = computeParityPQ(completePadded, shardSize);
    if (!pHealthy) {
      if (sha256VaultBytesHex(rebuilt.parityP) !== stripeMeta.parityPSha256Hex) {
        return buildFailResult(
          stripeMeta.stripeId,
          "unrecoverable-hash-mismatch",
          faultCount,
          detectedFaultLabels,
          verifiedData,
          null,
          finalQ,
        );
      }
      finalP = rebuilt.parityP;
      healedLabels.push("parity-P");
    }
    if (!qHealthy) {
      if (sha256VaultBytesHex(rebuilt.parityQ) !== stripeMeta.parityQSha256Hex) {
        return buildFailResult(
          stripeMeta.stripeId,
          "unrecoverable-hash-mismatch",
          faultCount,
          detectedFaultLabels,
          verifiedData,
          finalP,
          null,
        );
      }
      finalQ = rebuilt.parityQ;
      healedLabels.push("parity-Q");
    }
  }

  return {
    stripeId: stripeMeta.stripeId,
    status: "healed",
    recoverable: true,
    faultCount,
    detectedFaultLabels,
    healedShardLabels: healedLabels,
    dataShards: verifiedData,
    parityP: finalP,
    parityQ: finalQ,
  };
}
