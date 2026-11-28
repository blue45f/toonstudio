/**
 * 제로유출 암호화 머클-DAG CRDT 협업 원장 및 크리에이터 화풍 모델 금고 (Wave 70).
 *
 * - 외부 암호 라이브러리 무의존 순수 동기 FIPS 180-4 SHA-256 + RFC 2104 HMAC-SHA256 기반
 * - Lamport/Vector Clock 인과 정렬 결정론적 머클-DAG CRDT 병합(교환·결합·멱등성 100% 보장)
 * - 1바이트 체인/페이로드 변조 즉시 거부(fail-closed)
 * - 작가 증류 가중치를 기간·회차·디바이스 한정 서명 리스 토큰으로 봉인하고 무단 추출을 차단
 */

import {
  evaluateDistilledStudentLayer,
  type DecompositionMode,
  type DistillationDomain,
  type DistillationVerificationMetrics,
  type DistilledStudentLayer,
  type QuantizationBitWidth,
  type QuantizedMatrixBlock,
  type StudentInferenceResult,
} from "./realtime-weight-distiller";
import {
  bytesToHex,
  canonicalSerialize,
  constantTimeEqualHex,
  hexToBytes,
  hmacSha256Hex,
  sha256Bytes,
  sha256CtrXor,
  sha256Hex,
  utf8Decode,
  utf8Encode,
} from "./sync-sha256-crypto";

export { canonicalSerialize, constantTimeEqualHex, hmacSha256Hex, sha256Bytes, sha256Hex };

// ---------------------------------------------------------------------------
// 1. 암호화 머클-DAG CRDT 무손실 협업 동기화 원장
// ---------------------------------------------------------------------------

export type CrdtAssetOperationKind =
  | "stroke-append"
  | "layer-property-set"
  | "layer-order-move"
  | "palette-swatch-put"
  | "asset-checkpoint"
  | "tombstone-delete";

export interface CrdtAssetOperation {
  readonly kind: CrdtAssetOperationKind;
  readonly targetId: string;
  readonly field: string;
  readonly value: string | number | boolean | null;
}

export interface MerkleCrdtNode {
  readonly nodeId: string;
  readonly authorId: string;
  readonly lamportClock: number;
  readonly vectorClock: Readonly<Record<string, number>>;
  readonly parentIds: readonly string[];
  readonly operation: CrdtAssetOperation;
  readonly payloadHash: string;
  readonly createdAtIso: string;
  readonly macSignature: string | null;
}

export interface MerkleMergeResult {
  readonly accepted: boolean;
  readonly addedNodeIds: readonly string[];
  readonly duplicateNodeIds: readonly string[];
  readonly rejectedNodeId: string | null;
  readonly reason: string | null;
  readonly merkleRoot: string;
  readonly heads: readonly string[];
}

export interface ChainIntegrityAudit {
  readonly valid: boolean;
  readonly checkedNodeCount: number;
  readonly merkleRoot: string;
  readonly violations: readonly string[];
}

export interface MaterializedAssetState {
  readonly propertiesByTarget: Readonly<Record<string, Readonly<Record<string, string | number | boolean | null>>>>;
  readonly strokesByTarget: Readonly<Record<string, readonly string[]>>;
  readonly deletedTargets: readonly string[];
  readonly appliedNodeCount: number;
  readonly merkleRoot: string;
}

function computeNodeContentHash(nodeWithoutId: Omit<MerkleCrdtNode, "nodeId" | "macSignature">): string {
  return sha256Hex(`merkle-crdt-node:v1:${canonicalSerialize(nodeWithoutId)}`);
}

function computeBinaryMerkleRoot(sortedLeaves: readonly string[]): string {
  if (sortedLeaves.length === 0) return sha256Hex("merkle-empty-ledger:v1");
  let level = sortedLeaves.map((leaf) => sha256Hex(`leaf:${leaf}`));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] ?? "";
      next.push(sha256Hex(`branch:${left}:${level[i + 1] ?? left}`));
    }
    level = next;
  }
  return level[0] ?? sha256Hex("merkle-empty-ledger:v1");
}

function compareNodesDeterministically(a: MerkleCrdtNode, b: MerkleCrdtNode): number {
  if (a.lamportClock !== b.lamportClock) return a.lamportClock - b.lamportClock;
  if (a.authorId !== b.authorId) return a.authorId < b.authorId ? -1 : 1;
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

function vectorClockDominates(
  child: Readonly<Record<string, number>>,
  parent: Readonly<Record<string, number>>,
): boolean {
  for (const peer of Object.keys(parent)) {
    if ((child[peer] ?? 0) < (parent[peer] ?? 0)) return false;
  }
  return true;
}

function verifySingleNodeIntegrity(node: MerkleCrdtNode, workspaceHmacKey: string | null): string | null {
  if (!node.authorId || node.authorId.trim().length === 0) return "authorId가 비어 있습니다.";
  if (!Number.isInteger(node.lamportClock) || node.lamportClock <= 0) {
    return `유효하지 않은 lamportClock(${node.lamportClock})입니다.`;
  }
  const expectedPayloadHash = sha256Hex(canonicalSerialize(node.operation));
  if (!constantTimeEqualHex(node.payloadHash, expectedPayloadHash)) {
    return `페이로드 해시 불일치(변조 감지): nodeId=${node.nodeId}`;
  }
  const expectedNodeId = computeNodeContentHash({
    authorId: node.authorId,
    lamportClock: node.lamportClock,
    vectorClock: node.vectorClock,
    parentIds: node.parentIds,
    operation: node.operation,
    payloadHash: node.payloadHash,
    createdAtIso: node.createdAtIso,
  });
  if (!constantTimeEqualHex(node.nodeId, expectedNodeId)) {
    return `노드 콘텐츠 해시 불일치(1바이트 이상 변조 감지): nodeId=${node.nodeId}`;
  }
  const sortedParents = [...node.parentIds].sort();
  for (let i = 0; i < node.parentIds.length; i += 1) {
    if (node.parentIds[i] !== sortedParents[i]) return `parentIds 정렬 위반: nodeId=${node.nodeId}`;
    if (node.parentIds[i] === node.nodeId) return `자기 부모 순환 참조: nodeId=${node.nodeId}`;
    if (i > 0 && node.parentIds[i] === node.parentIds[i - 1]) return `중복 parentId 감지: nodeId=${node.nodeId}`;
  }
  if (workspaceHmacKey !== null) {
    if (!node.macSignature) return `워크스페이스 HMAC 서명 누락: nodeId=${node.nodeId}`;
    if (!constantTimeEqualHex(node.macSignature, hmacSha256Hex(workspaceHmacKey, node.nodeId))) {
      return `워크스페이스 HMAC 서명 검증 실패: nodeId=${node.nodeId}`;
    }
  }
  return null;
}

/** 오프라인 분기·재동기화를 지원하는 결정론적 머클-DAG CRDT 협업 에셋 원장. */
export class MerkleCrdtAssetLedger {
  private readonly peerId: string;
  private readonly workspaceHmacKey: string | null;
  private readonly nodesById = new Map<string, MerkleCrdtNode>();
  private lamportClock = 0;
  private readonly vectorClock = new Map<string, number>();

  public constructor(peerId: string, workspaceHmacKey: string | null = null) {
    if (!peerId || peerId.trim().length === 0) throw new Error("peerId는 비어 있을 수 없습니다.");
    this.peerId = peerId;
    this.workspaceHmacKey = workspaceHmacKey;
  }

  public getPeerId(): string { return this.peerId; }
  public getLamportClock(): number { return this.lamportClock; }
  public getNodeCount(): number { return this.nodesById.size; }

  public getVectorClock(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const key of Array.from(this.vectorClock.keys()).sort()) out[key] = this.vectorClock.get(key) ?? 0;
    return out;
  }

  public getHeads(): readonly string[] {
    const referenced = new Set<string>();
    this.nodesById.forEach((node) => { for (const pid of node.parentIds) referenced.add(pid); });
    const heads: string[] = [];
    this.nodesById.forEach((_node, id) => { if (!referenced.has(id)) heads.push(id); });
    return heads.sort();
  }

  public getMerkleRoot(): string {
    const treeRoot = computeBinaryMerkleRoot(Array.from(this.nodesById.keys()).sort());
    return sha256Hex(`merkle-root:v1:${treeRoot}:${this.getHeads().join(",")}`);
  }

  /** 로컬 창작 편집 연산을 현재 프론티어 헤드에 연결해 새 머클 노드로 커밋한다. */
  public commitLocalOperation(
    operation: CrdtAssetOperation,
    createdAtIso = "2026-11-28T00:00:00.000Z",
  ): MerkleCrdtNode {
    const nextLamport = this.lamportClock + 1;
    const nextPeerTick = (this.vectorClock.get(this.peerId) ?? 0) + 1;
    const rawVector: Record<string, number> = {};
    this.vectorClock.forEach((val, key) => { rawVector[key] = val; });
    rawVector[this.peerId] = nextPeerTick;
    const sortedVector: Record<string, number> = {};
    for (const k of Object.keys(rawVector).sort()) sortedVector[k] = rawVector[k] ?? 0;

    const body = {
      authorId: this.peerId,
      lamportClock: nextLamport,
      vectorClock: sortedVector,
      parentIds: [...this.getHeads()],
      operation,
      payloadHash: sha256Hex(canonicalSerialize(operation)),
      createdAtIso,
    };
    const nodeId = computeNodeContentHash(body);
    const macSignature = this.workspaceHmacKey !== null ? hmacSha256Hex(this.workspaceHmacKey, nodeId) : null;
    const node: MerkleCrdtNode = { ...body, nodeId, macSignature };
    this.nodesById.set(node.nodeId, node);
    this.lamportClock = nextLamport;
    this.vectorClock.set(this.peerId, nextPeerTick);
    return node;
  }

  public exportNodes(): readonly MerkleCrdtNode[] {
    return this.getOrderedNodes();
  }

  public exportDeltaForKnownIds(knownNodeIds: ReadonlySet<string>): readonly MerkleCrdtNode[] {
    return this.getOrderedNodes().filter((node) => !knownNodeIds.has(node.nodeId));
  }

  /** 원격 머클 노드를 fail-closed 검증 후 원자적으로 병합한다(1바이트 변조 시 전체 거부). */
  public mergeNodes(incomingNodes: readonly MerkleCrdtNode[]): MerkleMergeResult {
    const fail = (rejectedNodeId: string, reason: string): MerkleMergeResult => ({
      accepted: false, addedNodeIds: [], duplicateNodeIds: [], rejectedNodeId, reason,
      merkleRoot: this.getMerkleRoot(), heads: this.getHeads(),
    });

    const candidateMap = new Map<string, MerkleCrdtNode>(this.nodesById);
    const toAdd: MerkleCrdtNode[] = [];
    const duplicateNodeIds: string[] = [];

    for (const node of incomingNodes) {
      const violation = verifySingleNodeIntegrity(node, this.workspaceHmacKey);
      if (violation !== null) return fail(node.nodeId, violation);
      if (candidateMap.has(node.nodeId)) {
        duplicateNodeIds.push(node.nodeId);
        continue;
      }
      candidateMap.set(node.nodeId, node);
      toAdd.push(node);
    }

    for (const node of toAdd) {
      for (const pid of node.parentIds) {
        const parent = candidateMap.get(pid);
        if (!parent) return fail(node.nodeId, `누락된 부모 노드를 참조합니다: parentId=${pid}`);
        if (parent.lamportClock >= node.lamportClock) {
          return fail(node.nodeId, `Lamport 인과 순서 위반: parent(${parent.lamportClock}) >= child(${node.lamportClock})`);
        }
        if (!vectorClockDominates(node.vectorClock, parent.vectorClock)) {
          return fail(node.nodeId, `Vector Clock 인과 지배 위반: nodeId=${node.nodeId}`);
        }
      }
    }

    const addedNodeIds: string[] = [];
    for (const node of toAdd) {
      this.nodesById.set(node.nodeId, node);
      addedNodeIds.push(node.nodeId);
      if (node.lamportClock > this.lamportClock) this.lamportClock = node.lamportClock;
      for (const peer of Object.keys(node.vectorClock)) {
        const incomingTick = node.vectorClock[peer] ?? 0;
        if (incomingTick > (this.vectorClock.get(peer) ?? 0)) this.vectorClock.set(peer, incomingTick);
      }
    }

    return {
      accepted: true, addedNodeIds, duplicateNodeIds, rejectedNodeId: null, reason: null,
      merkleRoot: this.getMerkleRoot(), heads: this.getHeads(),
    };
  }

  /** DAG 전체를 인과 위상 순서 + 결정론적 타이브레이커(lamport, author, nodeId)로 정렬한다. */
  public getOrderedNodes(): readonly MerkleCrdtNode[] {
    const inDegree = new Map<string, number>();
    const children = new Map<string, string[]>();
    this.nodesById.forEach((node, id) => {
      inDegree.set(id, node.parentIds.length);
      for (const pid of node.parentIds) {
        const list = children.get(pid);
        if (list) list.push(id);
        else children.set(pid, [id]);
      }
    });

    const ready: MerkleCrdtNode[] = [];
    this.nodesById.forEach((node, id) => { if ((inDegree.get(id) ?? 0) === 0) ready.push(node); });
    ready.sort(compareNodesDeterministically);

    const ordered: MerkleCrdtNode[] = [];
    while (ready.length > 0) {
      const current = ready.shift();
      if (!current) break;
      ordered.push(current);
      let inserted = false;
      for (const cid of children.get(current.nodeId) ?? []) {
        const remaining = (inDegree.get(cid) ?? 1) - 1;
        inDegree.set(cid, remaining);
        if (remaining === 0) {
          const childNode = this.nodesById.get(cid);
          if (childNode) { ready.push(childNode); inserted = true; }
        }
      }
      if (inserted) ready.sort(compareNodesDeterministically);
    }
    return ordered;
  }

  /** 원장의 모든 노드를 결정론적으로 재생해 무손실 협업 문서 상태를 구체화한다. */
  public materializeState(): MaterializedAssetState {
    const ordered = this.getOrderedNodes();
    const props = new Map<string, Record<string, string | number | boolean | null>>();
    const strokes = new Map<string, string[]>();
    const deleted = new Set<string>();

    for (const node of ordered) {
      const { kind, targetId, field, value } = node.operation;
      if (kind === "tombstone-delete") { deleted.add(targetId); continue; }
      deleted.delete(targetId);
      if (kind === "stroke-append") {
        const list = strokes.get(targetId) ?? [];
        list.push(`${node.nodeId.slice(0, 12)}:${String(value ?? "")}`);
        strokes.set(targetId, list);
      } else {
        const targetProps = props.get(targetId) ?? {};
        targetProps[field] = value;
        props.set(targetId, targetProps);
      }
    }

    const propertiesByTarget: Record<string, Readonly<Record<string, string | number | boolean | null>>> = {};
    for (const key of Array.from(props.keys()).sort()) {
      const raw = props.get(key) ?? {};
      const sortedFields: Record<string, string | number | boolean | null> = {};
      for (const f of Object.keys(raw).sort()) sortedFields[f] = raw[f] ?? null;
      propertiesByTarget[key] = sortedFields;
    }
    const strokesByTarget: Record<string, readonly string[]> = {};
    for (const key of Array.from(strokes.keys()).sort()) strokesByTarget[key] = strokes.get(key) ?? [];

    return {
      propertiesByTarget,
      strokesByTarget,
      deletedTargets: Array.from(deleted).sort(),
      appliedNodeCount: ordered.length,
      merkleRoot: this.getMerkleRoot(),
    };
  }

  public verifyChainIntegrity(): ChainIntegrityAudit {
    const violations: string[] = [];
    this.nodesById.forEach((node) => {
      const singleErr = verifySingleNodeIntegrity(node, this.workspaceHmacKey);
      if (singleErr) violations.push(singleErr);
      for (const pid of node.parentIds) {
        const parent = this.nodesById.get(pid);
        if (!parent) violations.push(`누락된 부모 노드: ${node.nodeId} -> ${pid}`);
        else if (parent.lamportClock >= node.lamportClock) violations.push(`Lamport 역전 감지: ${pid} -> ${node.nodeId}`);
      }
    });
    if (this.getOrderedNodes().length !== this.nodesById.size) violations.push("DAG 순환 참조가 감지되었습니다.");
    return { valid: violations.length === 0, checkedNodeCount: this.nodesById.size, merkleRoot: this.getMerkleRoot(), violations };
  }
}

// ---------------------------------------------------------------------------
// 2. 제로유출 크리에이터 화풍 모델 금고 (Zero-Leak Creator Model Vault)
// ---------------------------------------------------------------------------

export type VaultRequestedAction =
  | "on-device-inference"
  | "export-raw-weights"
  | "extract-checkpoint"
  | "retrain-scrape";

export type VaultDenialCode =
  | "INVALID_SIGNATURE"
  | "BUNDLE_TAMPERED"
  | "VAULT_ID_MISMATCH"
  | "LEASE_NOT_YET_VALID"
  | "LEASE_EXPIRED"
  | "EPISODE_SCOPE_DENIED"
  | "DEVICE_SCOPE_DENIED"
  | "RAW_EXTRACTION_FORBIDDEN"
  | "LEASE_REVOKED"
  | "SESSION_QUOTA_EXCEEDED"
  | "INVALID_TIMESTAMP";

export interface CreatorStyleVaultPolicy {
  readonly vaultId: string;
  readonly creatorId: string;
  readonly allowedEpisodeIds: readonly string[];
  readonly allowedDeviceFingerprints: readonly string[];
  readonly notBeforeEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly maxInferenceSessions: number;
  readonly allowRawWeightExport: false;
}

export interface VaultLeaseGrant {
  readonly leaseId: string;
  readonly vaultId: string;
  readonly bundleDigest: string;
  readonly granteeId: string;
  readonly episodeId: string;
  readonly deviceFingerprint: string;
  readonly issuedAtEpochMs: number;
  readonly notBeforeEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly allowedAction: "on-device-inference";
  readonly rawExportPermitted: false;
  readonly signatureHex: string;
}

export interface SealedCreatorStyleVaultBundle {
  readonly schemaVersion: "wave70.creator-model-vault.v1";
  readonly vaultId: string;
  readonly creatorId: string;
  readonly layerId: string;
  readonly domain: DistillationDomain;
  readonly policy: CreatorStyleVaultPolicy;
  readonly nonceHex: string;
  readonly weightsDigest: string;
  readonly ciphertextHex: string;
  readonly bundleMacHex: string;
  readonly bundleDigest: string;
}

export interface SealVaultParams {
  readonly studentLayer: DistilledStudentLayer;
  readonly policy: CreatorStyleVaultPolicy;
  readonly vaultMasterSecret: string;
  readonly initialLeaseGrantee?: {
    readonly leaseId: string;
    readonly granteeId: string;
    readonly episodeId: string;
    readonly deviceFingerprint: string;
    readonly issuedAtEpochMs: number;
    readonly expiresAtEpochMs?: number;
  };
}

export interface SealVaultResult {
  readonly bundle: SealedCreatorStyleVaultBundle;
  readonly leaseGrant: VaultLeaseGrant | null;
}

export interface VerifyVaultLeaseParams {
  readonly bundle: SealedCreatorStyleVaultBundle;
  readonly lease: VaultLeaseGrant;
  readonly vaultMasterSecret: string;
  readonly requestedAction: VaultRequestedAction;
  readonly requestedEpisodeId: string;
  readonly requestedDeviceFingerprint: string;
  readonly nowEpochMs: number;
  readonly usedInferenceSessions?: number;
  readonly revokedLeaseIds?: readonly string[];
}

export interface VaultLeaseVerificationResult {
  readonly allowed: boolean;
  readonly denialCode: VaultDenialCode | null;
  readonly reasonKo: string;
  readonly remainingValidMs: number;
}

export interface ScopedVaultInferenceRunner {
  readonly vaultId: string;
  readonly leaseId: string;
  readonly rawWeightsAccessible: false;
  readonly runInference: (input: Float32Array) => StudentInferenceResult;
}

interface SerializedQuantizedBlock {
  readonly rows: number;
  readonly cols: number;
  readonly bits: QuantizationBitWidth;
  readonly dataHex: string;
  readonly channelScales: readonly number[];
}

interface SerializedDistilledPayload {
  readonly layerId: string;
  readonly domain: DistillationDomain;
  readonly inputDim: number;
  readonly outputDim: number;
  readonly quantizationBits: QuantizationBitWidth;
  readonly decompositionMode: DecompositionMode;
  readonly rank: number;
  readonly singularValues: readonly number[];
  readonly leftFactor: SerializedQuantizedBlock | null;
  readonly rightFactor: SerializedQuantizedBlock | null;
  readonly directWeights: SerializedQuantizedBlock | null;
  readonly bias: readonly number[];
  readonly metrics: DistillationVerificationMetrics;
}

function serializeQuantizedBlock(block: QuantizedMatrixBlock | null): SerializedQuantizedBlock | null {
  if (!block) return null;
  const rawBytes = new Uint8Array(block.data.buffer, block.data.byteOffset, block.data.byteLength);
  return { rows: block.rows, cols: block.cols, bits: block.bits, dataHex: bytesToHex(rawBytes), channelScales: Array.from(block.channelScales) };
}

function deserializeQuantizedBlock(raw: SerializedQuantizedBlock | null): QuantizedMatrixBlock | null {
  if (!raw) return null;
  const bytes = hexToBytes(raw.dataHex);
  if (!bytes) throw new Error("손상된 양자화 가중치 버퍼입니다.");
  const data = raw.bits === 4 ? bytes : new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { rows: raw.rows, cols: raw.cols, bits: raw.bits, data, channelScales: Float32Array.from(raw.channelScales) };
}

function deriveVaultSubkeys(masterSecret: string, vaultId: string, nonceHex: string): { encKey: Uint8Array; macKeyHex: string } {
  return {
    encKey: sha256Bytes(`wave70:vault-enc:${masterSecret}:${vaultId}:${nonceHex}`),
    macKeyHex: sha256Hex(`wave70:vault-mac:${masterSecret}:${vaultId}:${nonceHex}`),
  };
}

function extractBundleHeader(b: SealedCreatorStyleVaultBundle): Omit<SealedCreatorStyleVaultBundle, "bundleMacHex" | "bundleDigest"> {
  return {
    schemaVersion: b.schemaVersion, vaultId: b.vaultId, creatorId: b.creatorId,
    layerId: b.layerId, domain: b.domain, policy: b.policy,
    nonceHex: b.nonceHex, weightsDigest: b.weightsDigest, ciphertextHex: b.ciphertextHex,
  };
}

function computeBundleMacInput(header: Omit<SealedCreatorStyleVaultBundle, "bundleMacHex" | "bundleDigest">): string {
  return `wave70-vault-bundle:v1:${canonicalSerialize(header)}`;
}

function computeLeaseSigningInput(lease: Omit<VaultLeaseGrant, "signatureHex">): string {
  return `wave70-vault-lease:v1:${canonicalSerialize(lease)}`;
}

/** 기간·회차·디바이스 범위 한정 서명 리스 토큰을 발급한다. */
export function issueVaultLeaseGrant(params: {
  readonly bundle: SealedCreatorStyleVaultBundle;
  readonly vaultMasterSecret: string;
  readonly leaseId: string;
  readonly granteeId: string;
  readonly episodeId: string;
  readonly deviceFingerprint: string;
  readonly issuedAtEpochMs: number;
  readonly notBeforeEpochMs?: number;
  readonly expiresAtEpochMs: number;
}): VaultLeaseGrant {
  const { bundle, vaultMasterSecret } = params;
  if (!vaultMasterSecret || vaultMasterSecret.length < 16) throw new Error("vaultMasterSecret은 최소 16자 이상이어야 합니다.");
  if (!bundle.policy.allowedEpisodeIds.includes(params.episodeId)) {
    throw new Error(`허용되지 않은 회차(${params.episodeId})에는 리스 토큰을 발급할 수 없습니다.`);
  }
  if (!bundle.policy.allowedDeviceFingerprints.includes(params.deviceFingerprint)) {
    throw new Error("허용되지 않은 디바이스 지문에는 리스 토큰을 발급할 수 없습니다.");
  }
  const notBeforeEpochMs = Math.max(bundle.policy.notBeforeEpochMs, params.notBeforeEpochMs ?? params.issuedAtEpochMs);
  const expiresAtEpochMs = Math.min(bundle.policy.expiresAtEpochMs, params.expiresAtEpochMs);
  if (expiresAtEpochMs <= notBeforeEpochMs) throw new Error("리스 만료 시각은 시작 시각보다 이후여야 합니다.");

  const unsignedLease: Omit<VaultLeaseGrant, "signatureHex"> = {
    leaseId: params.leaseId, vaultId: bundle.vaultId, bundleDigest: bundle.bundleDigest,
    granteeId: params.granteeId, episodeId: params.episodeId, deviceFingerprint: params.deviceFingerprint,
    issuedAtEpochMs: params.issuedAtEpochMs, notBeforeEpochMs, expiresAtEpochMs,
    allowedAction: "on-device-inference", rawExportPermitted: false,
  };
  return { ...unsignedLease, signatureHex: hmacSha256Hex(vaultMasterSecret, computeLeaseSigningInput(unsignedLease)) };
}

/** 작가의 증류 화풍·브러시 가중치를 암호화 금고 번들로 봉인한다. */
export function sealCreatorStyleVaultBundle(params: SealVaultParams): SealVaultResult {
  const { studentLayer, policy, vaultMasterSecret } = params;
  if (!vaultMasterSecret || vaultMasterSecret.length < 16) throw new Error("vaultMasterSecret은 최소 16자 이상이어야 합니다.");
  if (policy.allowRawWeightExport !== false) throw new Error("제로유출 정책상 allowRawWeightExport는 반드시 false여야 합니다.");
  if (policy.allowedEpisodeIds.length === 0 || policy.allowedDeviceFingerprints.length === 0) {
    throw new Error("허용 회차와 허용 디바이스 목록은 각각 1개 이상이어야 합니다.");
  }
  if (policy.expiresAtEpochMs <= policy.notBeforeEpochMs || policy.maxInferenceSessions <= 0) {
    throw new Error("금고 정책의 유효 기간 또는 세션 한도가 올바르지 않습니다.");
  }

  const payload: SerializedDistilledPayload = {
    layerId: studentLayer.layerId, domain: studentLayer.domain,
    inputDim: studentLayer.inputDim, outputDim: studentLayer.outputDim,
    quantizationBits: studentLayer.quantizationBits, decompositionMode: studentLayer.decompositionMode,
    rank: studentLayer.rank, singularValues: Array.from(studentLayer.singularValues),
    leftFactor: serializeQuantizedBlock(studentLayer.leftFactor),
    rightFactor: serializeQuantizedBlock(studentLayer.rightFactor),
    directWeights: serializeQuantizedBlock(studentLayer.directWeights),
    bias: Array.from(studentLayer.bias), metrics: studentLayer.metrics,
  };
  const plaintextJson = canonicalSerialize(payload);
  const weightsDigest = sha256Hex(plaintextJson);
  const nonceHex = sha256Hex(`wave70-nonce:${policy.vaultId}:${policy.creatorId}:${weightsDigest}:${policy.notBeforeEpochMs}`).slice(0, 32);
  const { encKey, macKeyHex } = deriveVaultSubkeys(vaultMasterSecret, policy.vaultId, nonceHex);
  const ciphertextHex = bytesToHex(sha256CtrXor(encKey, nonceHex, utf8Encode(plaintextJson)));

  const header: Omit<SealedCreatorStyleVaultBundle, "bundleMacHex" | "bundleDigest"> = {
    schemaVersion: "wave70.creator-model-vault.v1", vaultId: policy.vaultId, creatorId: policy.creatorId,
    layerId: studentLayer.layerId, domain: studentLayer.domain, policy, nonceHex, weightsDigest, ciphertextHex,
  };
  const macInput = computeBundleMacInput(header);
  const bundleMacHex = hmacSha256Hex(macKeyHex, macInput);
  const bundleDigest = sha256Hex(`${macInput}:${bundleMacHex}`);
  const bundle: SealedCreatorStyleVaultBundle = { ...header, bundleMacHex, bundleDigest };

  const leaseGrant = params.initialLeaseGrantee
    ? issueVaultLeaseGrant({
        bundle, vaultMasterSecret,
        leaseId: params.initialLeaseGrantee.leaseId,
        granteeId: params.initialLeaseGrantee.granteeId,
        episodeId: params.initialLeaseGrantee.episodeId,
        deviceFingerprint: params.initialLeaseGrantee.deviceFingerprint,
        issuedAtEpochMs: params.initialLeaseGrantee.issuedAtEpochMs,
        expiresAtEpochMs: params.initialLeaseGrantee.expiresAtEpochMs ?? policy.expiresAtEpochMs,
      })
    : null;
  return { bundle, leaseGrant };
}

/** 서명 리스 토큰과 암호화 금고 번들을 fail-closed 검증한다. */
export function verifyVaultLeaseGrant(params: VerifyVaultLeaseParams): VaultLeaseVerificationResult {
  const deny = (denialCode: VaultDenialCode, reasonKo: string): VaultLeaseVerificationResult => ({
    allowed: false, denialCode, reasonKo, remainingValidMs: 0,
  });
  const { bundle, lease, vaultMasterSecret, nowEpochMs } = params;
  if (!Number.isFinite(nowEpochMs) || nowEpochMs < 0) return deny("INVALID_TIMESTAMP", "검증 기준 시각이 유한하지 않습니다.");
  if (params.requestedAction !== "on-device-inference" || lease.rawExportPermitted !== false) {
    return deny("RAW_EXTRACTION_FORBIDDEN", "제로유출 정책에 따라 원시 가중치 추출·재학습 접근이 차단되었습니다.");
  }

  const { macKeyHex } = deriveVaultSubkeys(vaultMasterSecret, bundle.vaultId, bundle.nonceHex);
  const macInput = computeBundleMacInput(extractBundleHeader(bundle));
  const expectedMac = hmacSha256Hex(macKeyHex, macInput);
  const expectedDigest = sha256Hex(`${macInput}:${expectedMac}`);
  if (!constantTimeEqualHex(bundle.bundleMacHex, expectedMac) || !constantTimeEqualHex(bundle.bundleDigest, expectedDigest)) {
    return deny("BUNDLE_TAMPERED", "금고 번들 무결성 MAC 검증에 실패했습니다.");
  }

  const unsignedLease: Omit<VaultLeaseGrant, "signatureHex"> = {
    leaseId: lease.leaseId, vaultId: lease.vaultId, bundleDigest: lease.bundleDigest,
    granteeId: lease.granteeId, episodeId: lease.episodeId, deviceFingerprint: lease.deviceFingerprint,
    issuedAtEpochMs: lease.issuedAtEpochMs, notBeforeEpochMs: lease.notBeforeEpochMs,
    expiresAtEpochMs: lease.expiresAtEpochMs, allowedAction: lease.allowedAction, rawExportPermitted: lease.rawExportPermitted,
  };
  if (!constantTimeEqualHex(lease.signatureHex, hmacSha256Hex(vaultMasterSecret, computeLeaseSigningInput(unsignedLease)))) {
    return deny("INVALID_SIGNATURE", "리스 토큰 서명이 유효하지 않습니다.");
  }
  if (lease.vaultId !== bundle.vaultId || !constantTimeEqualHex(lease.bundleDigest, bundle.bundleDigest)) {
    return deny("VAULT_ID_MISMATCH", "리스 토큰이 대상 모델 금고 번들과 일치하지 않습니다.");
  }
  if (params.revokedLeaseIds && params.revokedLeaseIds.includes(lease.leaseId)) {
    return deny("LEASE_REVOKED", "이미 폐기된 리스 토큰입니다.");
  }

  const effectiveNotBefore = Math.max(bundle.policy.notBeforeEpochMs, lease.notBeforeEpochMs);
  const effectiveExpiresAt = Math.min(bundle.policy.expiresAtEpochMs, lease.expiresAtEpochMs);
  if (nowEpochMs < effectiveNotBefore) return deny("LEASE_NOT_YET_VALID", "리스 사용 가능 시작 시각 이전입니다.");
  if (nowEpochMs >= effectiveExpiresAt) return deny("LEASE_EXPIRED", "리스 유효 기간이 만료되었습니다.");
  if (params.requestedEpisodeId !== lease.episodeId || !bundle.policy.allowedEpisodeIds.includes(params.requestedEpisodeId)) {
    return deny("EPISODE_SCOPE_DENIED", "허가되지 않은 회차 범위에서의 접근이 차단되었습니다.");
  }
  if (params.requestedDeviceFingerprint !== lease.deviceFingerprint || !bundle.policy.allowedDeviceFingerprints.includes(params.requestedDeviceFingerprint)) {
    return deny("DEVICE_SCOPE_DENIED", "허가되지 않은 디바이스에서의 접근이 차단되었습니다.");
  }
  if ((params.usedInferenceSessions ?? 0) >= bundle.policy.maxInferenceSessions) {
    return deny("SESSION_QUOTA_EXCEEDED", "허용된 온디바이스 추론 세션 횟수를 초과했습니다.");
  }
  return { allowed: true, denialCode: null, reasonKo: "서명 리스 검증이 완료되었습니다.", remainingValidMs: effectiveExpiresAt - nowEpochMs };
}

/** 검증된 리스 범위 안에서만 메모리 내 추론 클로저를 생성한다(원시 가중치 비노출). */
export function createScopedVaultInferenceRunner(
  params: VerifyVaultLeaseParams,
):
  | { readonly ok: true; readonly runner: ScopedVaultInferenceRunner; readonly verification: VaultLeaseVerificationResult }
  | { readonly ok: false; readonly runner: null; readonly verification: VaultLeaseVerificationResult } {
  const verification = verifyVaultLeaseGrant(params);
  if (!verification.allowed) return { ok: false, runner: null, verification };

  const { bundle, lease, vaultMasterSecret } = params;
  const cipherBytes = hexToBytes(bundle.ciphertextHex);
  if (!cipherBytes) {
    return { ok: false, runner: null, verification: { allowed: false, denialCode: "BUNDLE_TAMPERED", reasonKo: "암호문 형식이 손상되었습니다.", remainingValidMs: 0 } };
  }
  const { encKey } = deriveVaultSubkeys(vaultMasterSecret, bundle.vaultId, bundle.nonceHex);
  const plaintextJson = utf8Decode(sha256CtrXor(encKey, bundle.nonceHex, cipherBytes));
  if (!constantTimeEqualHex(sha256Hex(plaintextJson), bundle.weightsDigest)) {
    return { ok: false, runner: null, verification: { allowed: false, denialCode: "BUNDLE_TAMPERED", reasonKo: "복호화 가중치 다이제스트 불일치", remainingValidMs: 0 } };
  }

  const parsed = JSON.parse(plaintextJson) as SerializedDistilledPayload;
  const ephemeralStudent: DistilledStudentLayer = {
    schemaVersion: "wave70.distilled-layer.v1",
    layerId: parsed.layerId, domain: parsed.domain,
    inputDim: parsed.inputDim, outputDim: parsed.outputDim,
    quantizationBits: parsed.quantizationBits, decompositionMode: parsed.decompositionMode,
    rank: parsed.rank, singularValues: Float32Array.from(parsed.singularValues),
    leftFactor: deserializeQuantizedBlock(parsed.leftFactor),
    rightFactor: deserializeQuantizedBlock(parsed.rightFactor),
    directWeights: deserializeQuantizedBlock(parsed.directWeights),
    bias: Float32Array.from(parsed.bias), metrics: parsed.metrics,
  };
  return {
    ok: true,
    verification,
    runner: {
      vaultId: bundle.vaultId,
      leaseId: lease.leaseId,
      rawWeightsAccessible: false,
      runInference: (input: Float32Array): StudentInferenceResult => evaluateDistilledStudentLayer(ephemeralStudent, input),
    },
  };
}
