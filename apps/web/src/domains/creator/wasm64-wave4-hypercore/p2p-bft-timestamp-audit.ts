/**
 * P2P 비잔틴 결함 감내(`3f + 1` 정족수) 상태 다이제스트 검증기 및
 * ₩0 무수수료 WebCrypto(Ed25519 / ECDSA P-256) + SHA-256 해시체인 · 머클 에포크 타임스탬프 감사 원장.
 *
 * - 이중 투표(Equivocation) 및 변조된 피어 델타를 즉시 격리하고 `2f + 1` 정직 정족수 도달 시에만 상태 전이 확정
 * - 가스비가 드는 퍼블릭 블록체인 없이 WebCrypto 서명 + SHA-256 해시체인 + 머클 루트로 오프라인 영구 검증
 */

const TEXT_ENCODER = new TextEncoder();
const GENESIS_HASH_HEX = "0".repeat(64);

export type AuditSignatureAlgorithm = "Ed25519" | "ECDSA-P256-SHA256";

export interface BftPeerAttestation {
  readonly epoch: number;
  readonly sequence: number;
  readonly peerId: string;
  readonly parentDigestHex: string;
  readonly stateDeltaDigestHex: string;
  readonly deltaPayload?: Uint8Array;
  readonly timestampMs: number;
}

export interface BftEquivocationEvidence {
  readonly peerId: string;
  readonly epoch: number;
  readonly sequence: number;
  readonly firstDigestHex: string;
  readonly conflictingDigestHex: string;
  readonly detectedAtMs: number;
}

export interface BftValidationDecision {
  readonly status:
    | "quorum-committed"
    | "vote-recorded"
    | "rejected-equivocation"
    | "rejected-corrupted-delta"
    | "rejected-parent-mismatch"
    | "rejected-quarantined-peer"
    | "rejected-unknown-peer";
  readonly epoch: number;
  readonly sequence: number;
  readonly candidateDigestHex: string;
  readonly voteCount: number;
  readonly requiredQuorum: number;
  readonly equivocation?: BftEquivocationEvidence;
}

export interface BftValidatorMetrics {
  readonly totalPeers: number;
  readonly maxFaultyPeers: number;
  readonly requiredQuorum: number;
  readonly quarantinedPeers: readonly string[];
  readonly committedSequence: number;
  readonly headDigestHex: string;
  readonly equivocationsDetected: number;
  readonly corruptedDeltasRejected: number;
}

export interface CreatorAuditIdentity {
  readonly creatorId: string;
  readonly algorithm: AuditSignatureAlgorithm;
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
  readonly publicKeyJwk: JsonWebKey;
  readonly publicKeyThumbprintHex: string;
}

export interface TimestampAuditEntry {
  readonly index: number;
  readonly manuscriptId: string;
  readonly timestampIso: string;
  readonly prevEntryHashHex: string;
  readonly contentSha256Hex: string;
  readonly metadataSummary: string;
  readonly creatorId: string;
  readonly algorithm: AuditSignatureAlgorithm;
  readonly publicKeyThumbprintHex: string;
  readonly entryHashHex: string;
  readonly signatureHex: string;
  readonly gasFeeKrw: 0;
}

export interface MerkleSiblingStep {
  readonly position: "left" | "right";
  readonly hashHex: string;
}

export interface MerkleEpochBundle {
  readonly epochId: string;
  readonly sealedAtIso: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly entryCount: number;
  readonly merkleRootHex: string;
  readonly epochSignatureHex: string;
  readonly signerThumbprintHex: string;
  readonly algorithm: AuditSignatureAlgorithm;
  readonly gasFeeKrw: 0;
}

export interface OfflineTimestampProofReceipt {
  readonly entry: TimestampAuditEntry;
  readonly epochBundle: MerkleEpochBundle;
  readonly merklePath: readonly MerkleSiblingStep[];
  readonly signerPublicKeyJwk: JsonWebKey;
}

export interface OfflineVerificationResult {
  readonly valid: boolean;
  readonly reason:
    | "ok"
    | "entry-hash-mismatch"
    | "entry-signature-invalid"
    | "epoch-signature-invalid"
    | "merkle-root-mismatch"
    | "thumbprint-mismatch";
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) {
    throw new RangeError("16진수 문자열 길이는 짝수여야 합니다.");
  }
  const buf = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i += 1) {
    const hi = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(hi)) {
      throw new RangeError("유효하지 않은 16진수 문자가 포함되어 있습니다.");
    }
    out[i] = hi;
  }
  return out;
}

function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("이 런타임에서는 WebCrypto SubtleCrypto를 사용할 수 없습니다.");
  }
  return subtle;
}

/** 바이트 배열의 SHA-256 다이제스트(64자 소문자 hex)를 계산한다. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const raw = typeof data === "string" ? TEXT_ENCODER.encode(data) : data;
  const digest = await getSubtleCrypto().digest("SHA-256", toArrayBufferCopy(raw));
  return bytesToHex(new Uint8Array(digest));
}

async function hashPairHex(leftHex: string, rightHex: string): Promise<string> {
  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  const combined = new Uint8Array(1 + left.length + right.length);
  combined[0] = 0x01; // 내부 노드 도메인 분리 바이트 (리프 제2역상 공격 차단)
  combined.set(left, 1);
  combined.set(right, 1 + left.length);
  return sha256Hex(combined);
}

async function hashLeafHex(entryHashHex: string): Promise<string> {
  const raw = hexToBytes(entryHashHex);
  const prefixed = new Uint8Array(1 + raw.length);
  prefixed[0] = 0x00; // 리프 도메인 분리 바이트
  prefixed.set(raw, 1);
  return sha256Hex(prefixed);
}

function canonicalEntryPreimage(params: {
  readonly index: number;
  readonly manuscriptId: string;
  readonly timestampIso: string;
  readonly prevEntryHashHex: string;
  readonly contentSha256Hex: string;
  readonly metadataSummary: string;
  readonly creatorId: string;
  readonly publicKeyThumbprintHex: string;
}): string {
  return [
    "toonstudio-audit-v1",
    String(params.index),
    params.manuscriptId,
    params.timestampIso,
    params.prevEntryHashHex,
    params.contentSha256Hex,
    params.metadataSummary,
    params.creatorId,
    params.publicKeyThumbprintHex,
  ].join("|");
}

function canonicalEpochPreimage(
  epochId: string,
  sealedAtIso: string,
  startIndex: number,
  endIndex: number,
  merkleRootHex: string,
): string {
  return `toonstudio-epoch-v1|${epochId}|${sealedAtIso}|${startIndex}|${endIndex}|${merkleRootHex}`;
}

/** WebCrypto에서 Ed25519를 우선 생성하고 미지원 환경에서는 ECDSA P-256으로 자동 폴백한다. */
export async function generateCreatorAuditIdentity(
  creatorId: string,
  preferEd25519 = true,
): Promise<CreatorAuditIdentity> {
  const subtle = getSubtleCrypto();
  let algorithm: AuditSignatureAlgorithm = "ECDSA-P256-SHA256";
  let keyPair: CryptoKeyPair | null = null;

  if (preferEd25519) {
    try {
      const generated = (await subtle.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      if (generated?.privateKey && generated?.publicKey) {
        keyPair = generated;
        algorithm = "Ed25519";
      }
    } catch {
      keyPair = null;
    }
  }

  if (!keyPair) {
    keyPair = (await subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    algorithm = "ECDSA-P256-SHA256";
  }

  const publicKeyJwk = await subtle.exportKey("jwk", keyPair.publicKey);
  const canonicalJwk = JSON.stringify({
    crv: publicKeyJwk.crv ?? "",
    kty: publicKeyJwk.kty ?? "",
    x: publicKeyJwk.x ?? "",
    y: publicKeyJwk.y ?? "",
  });
  const publicKeyThumbprintHex = await sha256Hex(canonicalJwk);

  return {
    creatorId,
    algorithm,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyJwk,
    publicKeyThumbprintHex,
  };
}

async function signBytesHex(
  privateKey: CryptoKey,
  algorithm: AuditSignatureAlgorithm,
  message: string,
): Promise<string> {
  const subtle = getSubtleCrypto();
  const payload = toArrayBufferCopy(TEXT_ENCODER.encode(message));
  const sig =
    algorithm === "Ed25519"
      ? await subtle.sign({ name: "Ed25519" }, privateKey, payload)
      : await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, payload);
  return bytesToHex(new Uint8Array(sig));
}

async function importPublicKeyFromJwk(
  jwk: JsonWebKey,
  algorithm: AuditSignatureAlgorithm,
): Promise<{ readonly key: CryptoKey; readonly thumbprintHex: string }> {
  const subtle = getSubtleCrypto();
  const canonicalJwk = JSON.stringify({
    crv: jwk.crv ?? "",
    kty: jwk.kty ?? "",
    x: jwk.x ?? "",
    y: jwk.y ?? "",
  });
  const thumbprintHex = await sha256Hex(canonicalJwk);
  const key =
    algorithm === "Ed25519"
      ? await subtle.importKey("jwk", jwk, { name: "Ed25519" }, true, ["verify"])
      : await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  return { key, thumbprintHex };
}

async function verifyBytesHex(
  publicKey: CryptoKey,
  algorithm: AuditSignatureAlgorithm,
  message: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    const subtle = getSubtleCrypto();
    const payload = toArrayBufferCopy(TEXT_ENCODER.encode(message));
    const sigBytes = hexToBytes(signatureHex);
    return algorithm === "Ed25519"
      ? await subtle.verify({ name: "Ed25519" }, publicKey, sigBytes, payload)
      : await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sigBytes, payload);
  } catch {
    return false;
  }
}

/**
 * `N >= 3f + 1` 피어 집합에서 비잔틴 이중 투표(Equivocation)와 손상된 델타를 배제하고
 * `2f + 1` 정직 정족수 합의로만 상태 다이제스트를 전이시키는 검증기.
 */
export class P2pBftStateValidator {
  public readonly maxFaultyPeers: number;
  public readonly requiredQuorum: number;
  private readonly roster: ReadonlySet<string>;
  private readonly quarantined = new Set<string>();
  private readonly peerSlotVote = new Map<string, string>();
  private readonly tallyByDigest = new Map<string, Set<string>>();
  private readonly equivocations: BftEquivocationEvidence[] = [];

  private committedSequence = 0;
  private headDigestHex: string;
  private corruptedCount = 0;

  public constructor(options: {
    readonly peerIds: readonly string[];
    readonly maxFaultyPeers?: number;
    readonly genesisDigestHex?: string;
  }) {
    const uniquePeers = [...new Set(options.peerIds)];
    const f = Math.max(1, Math.round(options.maxFaultyPeers ?? Math.floor((uniquePeers.length - 1) / 3)));
    if (uniquePeers.length < 3 * f + 1) {
      throw new RangeError(
        `비잔틴 결함 ${f}기 감내에는 최소 ${3 * f + 1}명의 피어가 필요합니다(현재 ${uniquePeers.length}명).`,
      );
    }
    this.roster = new Set(uniquePeers);
    this.maxFaultyPeers = f;
    this.requiredQuorum = 2 * f + 1;
    this.headDigestHex = options.genesisDigestHex ?? GENESIS_HASH_HEX;
  }

  public async submitAttestation(attestation: BftPeerAttestation): Promise<BftValidationDecision> {
    if (!this.roster.has(attestation.peerId)) {
      return {
        status: "rejected-unknown-peer",
        epoch: attestation.epoch,
        sequence: attestation.sequence,
        candidateDigestHex: attestation.stateDeltaDigestHex,
        voteCount: 0,
        requiredQuorum: this.requiredQuorum,
      };
    }

    if (this.quarantined.has(attestation.peerId)) {
      return {
        status: "rejected-quarantined-peer",
        epoch: attestation.epoch,
        sequence: attestation.sequence,
        candidateDigestHex: attestation.stateDeltaDigestHex,
        voteCount: 0,
        requiredQuorum: this.requiredQuorum,
      };
    }

    if (
      attestation.sequence !== this.committedSequence + 1 ||
      attestation.parentDigestHex !== this.headDigestHex
    ) {
      return {
        status: "rejected-parent-mismatch",
        epoch: attestation.epoch,
        sequence: attestation.sequence,
        candidateDigestHex: attestation.stateDeltaDigestHex,
        voteCount: 0,
        requiredQuorum: this.requiredQuorum,
      };
    }

    if (attestation.deltaPayload) {
      const actualDigest = await sha256Hex(attestation.deltaPayload);
      if (actualDigest !== attestation.stateDeltaDigestHex) {
        this.corruptedCount += 1;
        this.quarantined.add(attestation.peerId);
        return {
          status: "rejected-corrupted-delta",
          epoch: attestation.epoch,
          sequence: attestation.sequence,
          candidateDigestHex: attestation.stateDeltaDigestHex,
          voteCount: 0,
          requiredQuorum: this.requiredQuorum,
        };
      }
    }

    const slotKey = `${attestation.epoch}:${attestation.sequence}:${attestation.peerId}`;
    const priorDigest = this.peerSlotVote.get(slotKey);
    if (priorDigest !== undefined && priorDigest !== attestation.stateDeltaDigestHex) {
      const evidence: BftEquivocationEvidence = {
        peerId: attestation.peerId,
        epoch: attestation.epoch,
        sequence: attestation.sequence,
        firstDigestHex: priorDigest,
        conflictingDigestHex: attestation.stateDeltaDigestHex,
        detectedAtMs: attestation.timestampMs,
      };
      this.equivocations.push(evidence);
      this.quarantined.add(attestation.peerId);
      // 기존에 찍었던 표도 무효화해 비잔틴 노드가 정족수에 기여하지 못하게 차단한다.
      const priorVoters = this.tallyByDigest.get(`${attestation.epoch}:${attestation.sequence}:${priorDigest}`);
      priorVoters?.delete(attestation.peerId);
      return {
        status: "rejected-equivocation",
        epoch: attestation.epoch,
        sequence: attestation.sequence,
        candidateDigestHex: attestation.stateDeltaDigestHex,
        voteCount: priorVoters?.size ?? 0,
        requiredQuorum: this.requiredQuorum,
        equivocation: evidence,
      };
    }

    this.peerSlotVote.set(slotKey, attestation.stateDeltaDigestHex);
    const tallyKey = `${attestation.epoch}:${attestation.sequence}:${attestation.stateDeltaDigestHex}`;
    let voters = this.tallyByDigest.get(tallyKey);
    if (!voters) {
      voters = new Set<string>();
      this.tallyByDigest.set(tallyKey, voters);
    }
    voters.add(attestation.peerId);

    if (voters.size >= this.requiredQuorum) {
      this.committedSequence = attestation.sequence;
      this.headDigestHex = attestation.stateDeltaDigestHex;
      return {
        status: "quorum-committed",
        epoch: attestation.epoch,
        sequence: attestation.sequence,
        candidateDigestHex: attestation.stateDeltaDigestHex,
        voteCount: voters.size,
        requiredQuorum: this.requiredQuorum,
      };
    }

    return {
      status: "vote-recorded",
      epoch: attestation.epoch,
      sequence: attestation.sequence,
      candidateDigestHex: attestation.stateDeltaDigestHex,
      voteCount: voters.size,
      requiredQuorum: this.requiredQuorum,
    };
  }

  public getEquivocations(): readonly BftEquivocationEvidence[] {
    return [...this.equivocations];
  }

  public getMetrics(): BftValidatorMetrics {
    return {
      totalPeers: this.roster.size,
      maxFaultyPeers: this.maxFaultyPeers,
      requiredQuorum: this.requiredQuorum,
      quarantinedPeers: [...this.quarantined].sort(),
      committedSequence: this.committedSequence,
      headDigestHex: this.headDigestHex,
      equivocationsDetected: this.equivocations.length,
      corruptedDeltasRejected: this.corruptedCount,
    };
  }
}

/**
 * 가스비 ₩0 WebCrypto 서명 + SHA-256 해시체인 + 머클 에포크 봉인 기반 창작 시점 감사 원장.
 */
export class ZeroFeeTimestampAuditLog {
  private readonly entries: TimestampAuditEntry[] = [];
  private readonly epochs: MerkleEpochBundle[] = [];

  public async appendRevision(params: {
    readonly identity: CreatorAuditIdentity;
    readonly manuscriptId: string;
    readonly contentBytes: Uint8Array;
    readonly metadataSummary: string;
    readonly timestampIso?: string;
  }): Promise<TimestampAuditEntry> {
    const index = this.entries.length;
    const prevEntryHashHex =
      index === 0 ? GENESIS_HASH_HEX : (this.entries[index - 1]?.entryHashHex ?? GENESIS_HASH_HEX);
    const timestampIso = params.timestampIso ?? "2026-11-26T18:00:00.000Z";
    const contentSha256Hex = await sha256Hex(params.contentBytes);
    const preimage = canonicalEntryPreimage({
      index,
      manuscriptId: params.manuscriptId,
      timestampIso,
      prevEntryHashHex,
      contentSha256Hex,
      metadataSummary: params.metadataSummary,
      creatorId: params.identity.creatorId,
      publicKeyThumbprintHex: params.identity.publicKeyThumbprintHex,
    });
    const entryHashHex = await sha256Hex(preimage);
    const signatureHex = await signBytesHex(
      params.identity.privateKey,
      params.identity.algorithm,
      entryHashHex,
    );

    const entry: TimestampAuditEntry = {
      index,
      manuscriptId: params.manuscriptId,
      timestampIso,
      prevEntryHashHex,
      contentSha256Hex,
      metadataSummary: params.metadataSummary,
      creatorId: params.identity.creatorId,
      algorithm: params.identity.algorithm,
      publicKeyThumbprintHex: params.identity.publicKeyThumbprintHex,
      entryHashHex,
      signatureHex,
      gasFeeKrw: 0,
    };
    this.entries.push(entry);
    return entry;
  }

  /** 해시체인 전 구간의 이전 해시 연결 무결성을 검증한다. */
  public async verifyHashChainIntegrity(): Promise<boolean> {
    for (let i = 0; i < this.entries.length; i += 1) {
      const item = this.entries[i];
      if (!item) return false;
      const expectedPrev = i === 0 ? GENESIS_HASH_HEX : (this.entries[i - 1]?.entryHashHex ?? "");
      if (item.prevEntryHashHex !== expectedPrev) return false;
      const preimage = canonicalEntryPreimage(item);
      if ((await sha256Hex(preimage)) !== item.entryHashHex) return false;
    }
    return true;
  }

  private async buildMerkleLayers(startIndex: number, endIndex: number): Promise<string[][]> {
    const slice = this.entries.slice(startIndex, endIndex + 1);
    const leaves: string[] = [];
    for (const entry of slice) {
      leaves.push(await hashLeafHex(entry.entryHashHex));
    }
    const layers: string[][] = [leaves];
    let current = leaves;
    while (current.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i] ?? GENESIS_HASH_HEX;
        const right = current[i + 1] ?? left;
        next.push(await hashPairHex(left, right));
      }
      layers.push(next);
      current = next;
    }
    return layers;
  }

  /** 누적된 감사 항목 구간을 머클 에포크 트리로 봉인하고 서명한다. */
  public async sealMerkleEpoch(params: {
    readonly epochId: string;
    readonly identity: CreatorAuditIdentity;
    readonly startIndex?: number;
    readonly endIndex?: number;
    readonly sealedAtIso?: string;
  }): Promise<MerkleEpochBundle> {
    if (this.entries.length === 0) {
      throw new Error("봉인할 감사 항목이 없습니다.");
    }
    const startIndex = params.startIndex ?? 0;
    const endIndex = params.endIndex ?? this.entries.length - 1;
    if (startIndex < 0 || endIndex >= this.entries.length || startIndex > endIndex) {
      throw new RangeError("에포크 인덱스 범위가 유효하지 않습니다.");
    }

    const layers = await this.buildMerkleLayers(startIndex, endIndex);
    const topLayer = layers[layers.length - 1];
    const merkleRootHex = topLayer?.[0] ?? GENESIS_HASH_HEX;
    const sealedAtIso = params.sealedAtIso ?? "2026-11-26T18:05:00.000Z";
    const epochMsg = canonicalEpochPreimage(
      params.epochId,
      sealedAtIso,
      startIndex,
      endIndex,
      merkleRootHex,
    );
    const epochSignatureHex = await signBytesHex(
      params.identity.privateKey,
      params.identity.algorithm,
      epochMsg,
    );

    const bundle: MerkleEpochBundle = {
      epochId: params.epochId,
      sealedAtIso,
      startIndex,
      endIndex,
      entryCount: endIndex - startIndex + 1,
      merkleRootHex,
      epochSignatureHex,
      signerThumbprintHex: params.identity.publicKeyThumbprintHex,
      algorithm: params.identity.algorithm,
      gasFeeKrw: 0,
    };
    this.epochs.push(bundle);
    return bundle;
  }

  /** 특정 항목에 대한 O(log N) 머클 포함 증명 영수증을 발급한다. */
  public async exportOfflineReceipt(
    entryIndex: number,
    epochBundle: MerkleEpochBundle,
    signerPublicKeyJwk: JsonWebKey,
  ): Promise<OfflineTimestampProofReceipt> {
    const entry = this.entries[entryIndex];
    if (!entry || entryIndex < epochBundle.startIndex || entryIndex > epochBundle.endIndex) {
      throw new RangeError("요청한 항목 인덱스가 에포크 범위에 속하지 않습니다.");
    }
    const layers = await this.buildMerkleLayers(epochBundle.startIndex, epochBundle.endIndex);
    const path: MerkleSiblingStep[] = [];
    let pos = entryIndex - epochBundle.startIndex;

    for (let level = 0; level < layers.length - 1; level += 1) {
      const layer = layers[level] ?? [];
      const isRightNode = pos % 2 === 1;
      const siblingIdx = isRightNode ? pos - 1 : pos + 1;
      const siblingHash = layer[siblingIdx] ?? layer[pos] ?? GENESIS_HASH_HEX;
      path.push({
        position: isRightNode ? "left" : "right",
        hashHex: siblingHash,
      });
      pos = Math.floor(pos / 2);
    }

    return {
      entry,
      epochBundle,
      merklePath: path,
      signerPublicKeyJwk,
    };
  }

  public getEntries(): readonly TimestampAuditEntry[] {
    return [...this.entries];
  }
}

/** 네트워크·서버·블록체인 없이 오프라인으로 타임스탬프 영수증의 서명·해시·머클 루트를 검증한다. */
export async function verifyAuditReceiptOffline(
  receipt: OfflineTimestampProofReceipt,
): Promise<OfflineVerificationResult> {
  const { entry, epochBundle, merklePath, signerPublicKeyJwk } = receipt;
  const imported = await importPublicKeyFromJwk(signerPublicKeyJwk, entry.algorithm);

  if (
    imported.thumbprintHex !== entry.publicKeyThumbprintHex ||
    imported.thumbprintHex !== epochBundle.signerThumbprintHex
  ) {
    return { valid: false, reason: "thumbprint-mismatch" };
  }

  const expectedEntryHash = await sha256Hex(canonicalEntryPreimage(entry));
  if (expectedEntryHash !== entry.entryHashHex) {
    return { valid: false, reason: "entry-hash-mismatch" };
  }

  const entrySigOk = await verifyBytesHex(
    imported.key,
    entry.algorithm,
    entry.entryHashHex,
    entry.signatureHex,
  );
  if (!entrySigOk) {
    return { valid: false, reason: "entry-signature-invalid" };
  }

  const epochMsg = canonicalEpochPreimage(
    epochBundle.epochId,
    epochBundle.sealedAtIso,
    epochBundle.startIndex,
    epochBundle.endIndex,
    epochBundle.merkleRootHex,
  );
  const epochSigOk = await verifyBytesHex(
    imported.key,
    epochBundle.algorithm,
    epochMsg,
    epochBundle.epochSignatureHex,
  );
  if (!epochSigOk) {
    return { valid: false, reason: "epoch-signature-invalid" };
  }

  let cursor = await hashLeafHex(entry.entryHashHex);
  for (const step of merklePath) {
    cursor =
      step.position === "left"
        ? await hashPairHex(step.hashHex, cursor)
        : await hashPairHex(cursor, step.hashHex);
  }
  if (cursor !== epochBundle.merkleRootHex) {
    return { valid: false, reason: "merkle-root-mismatch" };
  }

  return { valid: true, reason: "ok" };
}
