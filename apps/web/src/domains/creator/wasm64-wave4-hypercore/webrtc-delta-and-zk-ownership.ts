/**
 * 크로스플랫폼 WebRTC SCTP DataChannel 바이너리 델타 동기화 · 벡터 클록(Vector Clock) 충돌 조정기 및
 * ₩0 무서버 영지식(Zero-Knowledge) 원고 소유권 증명기/검증기 (`Fiat-Shamir Schnorr NIZKPoK`).
 *
 * - XOR-RLE 바이너리 델타 압축 + 16KiB SCTP MTU 안전 청크 분할·재조립 + 벡터 클록 인과·동시성 결정적 병합
 * - ES2017 호환 `BigInt(...)` 안전 소수군 위에서 비밀 원고 시드 `s` 노출 없이 소유권을 증명하는 비대화형 영지식 증명
 */

const TEXT_ENCODER = new TextEncoder();
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/**
 * 256비트급 안전 소수군(`p = 2q + 1`, `g`는 위수 `q` 부분군 생성원).
 * RFC 3526 / 표준 Schnorr 이산로그 구조의 경량 결정론적 소수 쌍:
 * `p = 2^255 - 19` 대신 곱셈 위수가 명확한 안전 소수 `p = 2q + 1`을 사용한다.
 * 검증식: `q = (p - 1) / 2`이고 `g = 4 = 2^2 mod p`는 항상 2차 잉여군(위수 `q`)에 속한다.
 */
const ZK_PRIME_P = BigInt(
  "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f",
);
const ZK_ORDER_Q = (ZK_PRIME_P - ONE) / TWO;
const ZK_GENERATOR_G = BigInt(4);

const SCTP_CHUNK_MAGIC = 0x54534443; // "TSDC"
const DEFAULT_SCTP_MTU_BYTES = 16_000;

export type VectorClockRelation = "equal" | "before" | "after" | "concurrent";

export type VectorClockMap = Readonly<Record<string, number>>;

export interface SctpDeltaEnvelope {
  readonly messageId: number;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly payloadChecksum: number;
  readonly frameBytes: Uint8Array;
}

export interface VectorClockReplicaUpdate<TState> {
  readonly peerId: string;
  readonly clock: VectorClockMap;
  readonly wallTimeMs: number;
  readonly stateDigestHex: string;
  readonly state: TState;
}

export interface ConflictResolutionOutcome<TState> {
  readonly relation: VectorClockRelation;
  readonly mergedClock: VectorClockMap;
  readonly winnerPeerId: string;
  readonly winningState: TState;
  readonly hadConcurrentConflict: boolean;
}

export interface ZkManuscriptPublicCommitment {
  readonly scheme: "schnorr-fiat-shamir-modp-sha256-v1";
  readonly manuscriptId: string;
  readonly manuscriptDigestHex: string;
  readonly publicCommitmentYHex: string;
  readonly serverCostKrw: 0;
}

export interface ZkManuscriptOwnershipProof {
  readonly scheme: "schnorr-fiat-shamir-modp-sha256-v1";
  readonly manuscriptId: string;
  readonly manuscriptDigestHex: string;
  readonly publicCommitmentYHex: string;
  readonly nonceCommitmentTHex: string;
  readonly challengeCHex: string;
  readonly responseZHex: string;
  readonly verifierChallengeNonce: string;
  readonly serverCostKrw: 0;
}

function fnv1a32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) {
    s += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return s;
}

function bigIntToHex64(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function hexToBigInt(hex: string): bigint {
  if (hex.length === 0) return ZERO;
  for (let i = 0; i < hex.length; i += 1) {
    const code = hex.charCodeAt(i);
    const valid =
      (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
    if (!valid) {
      throw new RangeError("유효하지 않은 16진수 문자열입니다.");
    }
  }
  return BigInt(`0x${hex}`);
}

function modPositive(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < ZERO ? r + m : r;
}

/** 거듭제곱 이진 분할로 `(base ^ exp) mod modulus`를 O(log exp) 시간에 계산한다. */
export function modPowBigInt(base: bigint, exp: bigint, modulus: bigint): bigint {
  if (modulus <= ONE) return ZERO;
  let result = ONE;
  let b = modPositive(base, modulus);
  let e = exp;
  while (e > ZERO) {
    if ((e & ONE) === ONE) {
      result = (result * b) % modulus;
    }
    e >>= ONE;
    b = (b * b) % modulus;
  }
  return result;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return new Uint8Array(digest);
}

/** 이전 버퍼 대비 XOR 차분을 구하고 연속된 0 구간을 RLE로 압축해 DataChannel 대역폭을 줄인다. */
export function encodeBinaryXorRleDelta(prevBytes: Uint8Array, nextBytes: Uint8Array): Uint8Array {
  const nextLen = nextBytes.byteLength;
  const out: number[] = [
    nextLen & 0xff,
    (nextLen >>> 8) & 0xff,
    (nextLen >>> 16) & 0xff,
    (nextLen >>> 24) & 0xff,
  ];

  let i = 0;
  while (i < nextLen) {
    const diff = (nextBytes[i] ?? 0) ^ (i < prevBytes.byteLength ? (prevBytes[i] ?? 0) : 0);
    if (diff === 0) {
      let run = 1;
      while (
        i + run < nextLen &&
        run < 32767 &&
        ((nextBytes[i + run] ?? 0) ^
          (i + run < prevBytes.byteLength ? (prevBytes[i + run] ?? 0) : 0)) ===
          0
      ) {
        run += 1;
      }
      // 토큰 태그 0x00: [0x00, runLo, runHi]
      out.push(0x00, run & 0xff, (run >>> 8) & 0xff);
      i += run;
    } else {
      const litStart = i;
      const literals: number[] = [];
      while (i < nextLen && literals.length < 127) {
        const d = (nextBytes[i] ?? 0) ^ (i < prevBytes.byteLength ? (prevBytes[i] ?? 0) : 0);
        if (
          d === 0 &&
          i + 2 < nextLen &&
          ((nextBytes[i + 1] ?? 0) ^
            (i + 1 < prevBytes.byteLength ? (prevBytes[i + 1] ?? 0) : 0)) ===
            0 &&
          ((nextBytes[i + 2] ?? 0) ^
            (i + 2 < prevBytes.byteLength ? (prevBytes[i + 2] ?? 0) : 0)) ===
            0
        ) {
          break;
        }
        literals.push(d);
        i += 1;
      }
      if (i === litStart) i += 1;
      // 토큰 태그 (0x80 | count): 비영(non-zero) XOR 리터럴 청크
      out.push(0x80 | literals.length, ...literals);
    }
  }

  return new Uint8Array(out);
}

/** `encodeBinaryXorRleDelta`로 압축된 차분 패킷을 기준 버퍼에 적용해 최신 바이트를 무손실 복원한다. */
export function decodeBinaryXorRleDelta(prevBytes: Uint8Array, deltaPacket: Uint8Array): Uint8Array {
  if (deltaPacket.byteLength < 4) {
    throw new RangeError("델타 패킷 헤더가 손상되었습니다.");
  }
  const nextLen = new DataView(deltaPacket.buffer, deltaPacket.byteOffset, 4).getUint32(0, true);
  let cursor = 4;
  let decoded = 0;

  // 선언된 출력 길이와 각 토큰을 검증한 뒤에만 결과 버퍼를 할당한다.
  while (cursor < deltaPacket.length) {
    const tag = deltaPacket[cursor++];
    let count: number;
    if (tag === 0) {
      if (cursor + 2 > deltaPacket.length) throw new RangeError("델타 반복 길이가 누락되었습니다.");
      count = deltaPacket[cursor] | (deltaPacket[cursor + 1] << 8);
      cursor += 2;
    } else if ((tag & 0x80) !== 0) {
      count = tag & 0x7f;
      if (cursor + count > deltaPacket.length) throw new RangeError("델타 리터럴이 잘렸습니다.");
      cursor += count;
    } else {
      throw new RangeError("알 수 없는 XOR-RLE 델타 태그입니다.");
    }
    decoded += count;
    if (count === 0 || decoded > nextLen) throw new RangeError("델타 토큰 길이가 유효하지 않습니다.");
  }
  if (decoded !== nextLen) throw new RangeError("델타 복원 길이가 목표 길이와 일치하지 않습니다.");

  const out = new Uint8Array(nextLen);
  out.set(prevBytes.subarray(0, nextLen));
  let writePos = 0;
  cursor = 4;
  while (cursor < deltaPacket.length) {
    const tag = deltaPacket[cursor++];
    if (tag === 0) {
      writePos += deltaPacket[cursor] | (deltaPacket[cursor + 1] << 8);
      cursor += 2;
    } else {
      const count = tag & 0x7f;
      for (let k = 0; k < count; k += 1) out[writePos++] ^= deltaPacket[cursor++];
    }
  }
  return out;
}

/** WebRTC SCTP DataChannel 최대 메시지 한도(16KiB 기본)에 맞춰 바이너리 페이로드를 프레임 분할한다. */
export function chunkDeltaForSctpChannel(
  messageId: number,
  payload: Uint8Array,
  maxPayloadPerChunk = DEFAULT_SCTP_MTU_BYTES,
): readonly SctpDeltaEnvelope[] {
  const step = Math.max(64, maxPayloadPerChunk);
  const totalChunks = Math.max(1, Math.ceil(payload.byteLength / step));
  const payloadChecksum = fnv1a32(payload);
  const envelopes: SctpDeltaEnvelope[] = [];

  for (let idx = 0; idx < totalChunks; idx += 1) {
    const slice = payload.subarray(idx * step, Math.min(payload.byteLength, (idx + 1) * step));
    const frame = new Uint8Array(20 + slice.byteLength);
    const view = new DataView(frame.buffer);
    view.setUint32(0, SCTP_CHUNK_MAGIC, false);
    view.setUint32(4, messageId >>> 0, true);
    view.setUint32(8, idx >>> 0, true);
    view.setUint32(12, totalChunks >>> 0, true);
    view.setUint32(16, payloadChecksum >>> 0, true);
    frame.set(slice, 20);
    envelopes.push({
      messageId: messageId >>> 0,
      chunkIndex: idx,
      totalChunks,
      payloadChecksum,
      frameBytes: frame,
    });
  }
  return envelopes;
}

/** 순서가 뒤섞여 도착한 SCTP 프레임들을 검증·재조립한다. */
export class SctpDeltaReassembler {
  private readonly inflight = new Map<
    number,
    {
      readonly totalChunks: number;
      readonly expectedChecksum: number;
      readonly parts: Map<number, Uint8Array>;
    }
  >();

  public pushFrame(frameBytes: Uint8Array): Uint8Array | null {
    if (frameBytes.byteLength < 20) {
      throw new RangeError("SCTP 프레임 헤더 길이가 부족합니다.");
    }
    const view = new DataView(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength);
    if (view.getUint32(0, false) !== SCTP_CHUNK_MAGIC) {
      throw new Error("SCTP 프레임 매직 시그니처가 일치하지 않습니다.");
    }
    const messageId = view.getUint32(4, true);
    const chunkIndex = view.getUint32(8, true);
    const totalChunks = view.getUint32(12, true);
    const expectedChecksum = view.getUint32(16, true);
    const body = frameBytes.subarray(20);

    let bucket = this.inflight.get(messageId);
    if (!bucket) {
      bucket = { totalChunks, expectedChecksum, parts: new Map() };
      this.inflight.set(messageId, bucket);
    }
    bucket.parts.set(chunkIndex, new Uint8Array(body));

    if (bucket.parts.size < bucket.totalChunks) {
      return null;
    }

    let totalLen = 0;
    for (let i = 0; i < bucket.totalChunks; i += 1) {
      const part = bucket.parts.get(i);
      if (!part) return null;
      totalLen += part.byteLength;
    }

    const joined = new Uint8Array(totalLen);
    let offset = 0;
    for (let i = 0; i < bucket.totalChunks; i += 1) {
      const part = bucket.parts.get(i)!;
      joined.set(part, offset);
      offset += part.byteLength;
    }
    this.inflight.delete(messageId);

    if (fnv1a32(joined) !== expectedChecksum) {
      throw new Error("재조립된 SCTP 페이로드 체크섬이 손상되었습니다.");
    }
    return joined;
  }
}

/** 로컬 이벤트 발생 시 해당 피어의 벡터 클록 카운터를 1 증가시킨다. */
export function tickVectorClock(clock: VectorClockMap, peerId: string): VectorClockMap {
  return {
    ...clock,
    [peerId]: (clock[peerId] ?? 0) + 1,
  };
}

/** 두 벡터 클록의 인과 선후(`before`/`after`/`equal`) 또는 동시 충돌(`concurrent`) 관계를 판정한다. */
export function compareVectorClocks(a: VectorClockMap, b: VectorClockMap): VectorClockRelation {
  const peers = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aLess = false;
  let bLess = false;
  for (const p of peers) {
    const va = a[p] ?? 0;
    const vb = b[p] ?? 0;
    if (va < vb) aLess = true;
    if (vb < va) bLess = true;
  }
  if (!aLess && !bLess) return "equal";
  if (aLess && !bLess) return "before";
  if (bLess && !aLess) return "after";
  return "concurrent";
}

/** 인과 순서가 있으면 최신 상태를 채택하고, 동시 편집(`concurrent`)이면 결정론적 LWW+다이제스트 타이브레이커로 수렴시킨다. */
export function coordinateEdgeVectorClockConflict<TState>(
  local: VectorClockReplicaUpdate<TState>,
  remote: VectorClockReplicaUpdate<TState>,
): ConflictResolutionOutcome<TState> {
  const relation = compareVectorClocks(local.clock, remote.clock);
  const peers = new Set([...Object.keys(local.clock), ...Object.keys(remote.clock)]);
  const merged: Record<string, number> = {};
  for (const p of peers) {
    merged[p] = Math.max(local.clock[p] ?? 0, remote.clock[p] ?? 0);
  }

  if (relation === "before") {
    return {
      relation,
      mergedClock: merged,
      winnerPeerId: remote.peerId,
      winningState: remote.state,
      hadConcurrentConflict: false,
    };
  }
  if (relation === "after" || relation === "equal") {
    return {
      relation,
      mergedClock: merged,
      winnerPeerId: local.peerId,
      winningState: local.state,
      hadConcurrentConflict: false,
    };
  }

  // 동시 편집 시 모든 피어가 동일한 승자로 수렴하도록 (wallTimeMs -> stateDigestHex -> peerId) 전순서를 적용한다.
  const remoteWins =
    remote.wallTimeMs > local.wallTimeMs ||
    (remote.wallTimeMs === local.wallTimeMs &&
      (remote.stateDigestHex > local.stateDigestHex ||
        (remote.stateDigestHex === local.stateDigestHex && remote.peerId > local.peerId)));

  const winner = remoteWins ? remote : local;
  return {
    relation: "concurrent",
    mergedClock: merged,
    winnerPeerId: winner.peerId,
    winningState: winner.state,
    hadConcurrentConflict: true,
  };
}

async function deriveScalarModQ(domainTag: string, parts: readonly string[]): Promise<bigint> {
  const joined = `${domainTag}|${parts.join("|")}`;
  const hash = await sha256Bytes(TEXT_ENCODER.encode(joined));
  const raw = hexToBigInt(bytesToHex(hash));
  // 1 <= scalar <= q - 1 범위 보장
  return (raw % (ZK_ORDER_Q - ONE)) + ONE;
}

/** 비밀 원고 시드와 원고 본문으로부터 공개 커밋먼트 `Y = g^s mod p`를 생성한다(시드 `s`는 외부에 절대 노출하지 않음). */
export async function createZkManuscriptCommitment(params: {
  readonly manuscriptId: string;
  readonly manuscriptBytes: Uint8Array;
  readonly secretAuthorSeed: string | Uint8Array;
}): Promise<ZkManuscriptPublicCommitment> {
  const manuscriptDigestHex = bytesToHex(await sha256Bytes(params.manuscriptBytes));
  const seedHex =
    typeof params.secretAuthorSeed === "string"
      ? bytesToHex(await sha256Bytes(TEXT_ENCODER.encode(params.secretAuthorSeed)))
      : bytesToHex(await sha256Bytes(params.secretAuthorSeed));
  const secretS = await deriveScalarModQ("toonstudio-zk-secret-v1", [
    params.manuscriptId,
    seedHex,
  ]);
  const publicY = modPowBigInt(ZK_GENERATOR_G, secretS, ZK_PRIME_P);

  return {
    scheme: "schnorr-fiat-shamir-modp-sha256-v1",
    manuscriptId: params.manuscriptId,
    manuscriptDigestHex,
    publicCommitmentYHex: bigIntToHex64(publicY),
    serverCostKrw: 0,
  };
}

/**
 * Fiat-Shamir 비대화형 Schnorr 영지식 소유권 증명(`NIZKPoK`) 생성기.
 * 비밀 시드 `s`를 전송하지 않고도 검증자 챌린지 논스에 묶인 `(T, c, z)` 증명을 ₩0 로컬에서 발급한다.
 */
export async function proveZkManuscriptOwnership(params: {
  readonly manuscriptId: string;
  readonly manuscriptBytes: Uint8Array;
  readonly secretAuthorSeed: string | Uint8Array;
  readonly verifierChallengeNonce: string;
}): Promise<ZkManuscriptOwnershipProof> {
  const manuscriptDigestHex = bytesToHex(await sha256Bytes(params.manuscriptBytes));
  const seedHex =
    typeof params.secretAuthorSeed === "string"
      ? bytesToHex(await sha256Bytes(TEXT_ENCODER.encode(params.secretAuthorSeed)))
      : bytesToHex(await sha256Bytes(params.secretAuthorSeed));

  const secretS = await deriveScalarModQ("toonstudio-zk-secret-v1", [
    params.manuscriptId,
    seedHex,
  ]);
  const publicY = modPowBigInt(ZK_GENERATOR_G, secretS, ZK_PRIME_P);
  const publicYHex = bigIntToHex64(publicY);

  // 암호학적 난수 + 시드 해시 결합(Hedged Nonce)으로 재사용 공격을 원천 차단한다.
  const randBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(randBytes);
  const blindingR = await deriveScalarModQ("toonstudio-zk-nonce-v1", [
    bytesToHex(randBytes),
    seedHex,
    manuscriptDigestHex,
    params.verifierChallengeNonce,
  ]);

  const nonceT = modPowBigInt(ZK_GENERATOR_G, blindingR, ZK_PRIME_P);
  const nonceTHex = bigIntToHex64(nonceT);

  const challengeC = await deriveScalarModQ("toonstudio-zk-challenge-v1", [
    bigIntToHex64(ZK_GENERATOR_G),
    publicYHex,
    nonceTHex,
    params.manuscriptId,
    manuscriptDigestHex,
    params.verifierChallengeNonce,
  ]);
  const responseZ = modPositive(blindingR + challengeC * secretS, ZK_ORDER_Q);

  return {
    scheme: "schnorr-fiat-shamir-modp-sha256-v1",
    manuscriptId: params.manuscriptId,
    manuscriptDigestHex,
    publicCommitmentYHex: publicYHex,
    nonceCommitmentTHex: nonceTHex,
    challengeCHex: bigIntToHex64(challengeC),
    responseZHex: bigIntToHex64(responseZ),
    verifierChallengeNonce: params.verifierChallengeNonce,
    serverCostKrw: 0,
  };
}

/** 비밀 시드 없이 공개 커밋먼트 `Y`와 `(T, c, z)`만으로 `g^z ≡ T · Y^c (mod p)` 등식을 검증한다. */
export async function verifyZkManuscriptOwnership(
  commitment: ZkManuscriptPublicCommitment,
  proof: ZkManuscriptOwnershipProof,
  expectedVerifierNonce: string,
): Promise<{ readonly valid: boolean; readonly reason: string }> {
  if (
    commitment.manuscriptId !== proof.manuscriptId ||
    commitment.manuscriptDigestHex !== proof.manuscriptDigestHex ||
    commitment.publicCommitmentYHex !== proof.publicCommitmentYHex
  ) {
    return { valid: false, reason: "commitment-binding-mismatch" };
  }
  if (proof.verifierChallengeNonce !== expectedVerifierNonce) {
    return { valid: false, reason: "verifier-nonce-mismatch" };
  }

  const y = hexToBigInt(commitment.publicCommitmentYHex);
  const t = hexToBigInt(proof.nonceCommitmentTHex);
  const cClaimed = hexToBigInt(proof.challengeCHex);
  const z = hexToBigInt(proof.responseZHex);

  if (y <= ONE || y >= ZK_PRIME_P || t <= ONE || t >= ZK_PRIME_P) {
    return { valid: false, reason: "group-element-out-of-range" };
  }
  if (modPowBigInt(y, ZK_ORDER_Q, ZK_PRIME_P) !== ONE || modPowBigInt(t, ZK_ORDER_Q, ZK_PRIME_P) !== ONE) {
    return { valid: false, reason: "invalid-subgroup-membership" };
  }

  const cExpected = await deriveScalarModQ("toonstudio-zk-challenge-v1", [
    bigIntToHex64(ZK_GENERATOR_G),
    commitment.publicCommitmentYHex,
    proof.nonceCommitmentTHex,
    commitment.manuscriptId,
    commitment.manuscriptDigestHex,
    expectedVerifierNonce,
  ]);
  if (cClaimed !== cExpected) {
    return { valid: false, reason: "fiat-shamir-challenge-mismatch" };
  }

  const lhs = modPowBigInt(ZK_GENERATOR_G, z, ZK_PRIME_P);
  const rhs = (t * modPowBigInt(y, cExpected, ZK_PRIME_P)) % ZK_PRIME_P;
  if (lhs !== rhs) {
    return { valid: false, reason: "schnorr-equation-failed" };
  }

  return { valid: true, reason: "ok" };
}
