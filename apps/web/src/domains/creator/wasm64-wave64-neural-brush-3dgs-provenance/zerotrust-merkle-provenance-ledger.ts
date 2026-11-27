/**
 * Wave 64 — 제로트러스트 멀티테넌트 격리 정책 감사기 및
 * 순수 동기 SHA-256 머클 트리 기반 암호화 자산·저작권 이력 증명 원장(Rights BOM Provenance Ledger).
 *
 * - 외부 라이브러리·WebCrypto 무의존 순수 JS/TS 동기 FIPS 180-4 SHA-256 구현.
 * - RFC 6962 도메인 분리 해싱(리프 `0x00`, 내부 노드 `0x01`) + 상수 시간 다이제스트 비교.
 * - 기본 거부(Default-Deny), 테넌트·KMS 키 스코프 일치, 스토리지 경로 탈출 차단,
 *   세션 만료·하드웨어 증명·서명 위임 토큰 검증을 집행한다.
 */

export type ProvenanceAssetKind =
  | "manuscript"
  | "brush-preset"
  | "asset-3d"
  | "font-license"
  | "local-compute-attestation"
  | "audio-sfx";

export type AssetLicenseTier =
  | "commercial-cleared"
  | "editorial-only"
  | "cc-by-4.0"
  | "proprietary-owned"
  | "unverified";

export interface ProvenanceAssetEntry {
  readonly entryId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly episodeId: string;
  readonly assetKind: ProvenanceAssetKind;
  readonly assetName: string;
  readonly contentSha256: string;
  readonly licenseTier: AssetLicenseTier;
  readonly licenseGrantId: string;
  readonly issuerId: string;
  readonly recordedAtIso: string;
  readonly localComputeProofHash?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface BuildProvenanceLedgerInput {
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly entries: readonly ProvenanceAssetEntry[];
  readonly requireCommercialClearance?: boolean;
  readonly strictSingleTenant?: boolean;
}

export interface ProvenanceRightsClearanceReport {
  readonly clearedForCommercialExport: boolean;
  readonly blockedEntryIds: readonly string[];
  readonly blockedReasons: Readonly<Record<string, string>>;
}

export interface AssetProvenanceMerkleLedger {
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly algorithm: "SHA-256-RFC6962-DOMAIN-SEPARATED";
  readonly merkleRootHex: string;
  readonly leafCount: number;
  readonly treeDepth: number;
  readonly entries: readonly ProvenanceAssetEntry[];
  readonly canonicalLeafPayloads: readonly string[];
  readonly leafHashesHex: readonly string[];
  readonly levelsHex: readonly (readonly string[])[];
  readonly rightsClearance: ProvenanceRightsClearanceReport;
}

export type MerkleSiblingPosition = "left" | "right";

export interface MerkleProofStep {
  readonly position: MerkleSiblingPosition;
  readonly siblingHashHex: string;
}

export interface MerkleInclusionProof {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly canonicalLeafPayload: string;
  readonly leafHashHex: string;
  readonly merkleRootHex: string;
  readonly steps: readonly MerkleProofStep[];
}

export interface MerkleVerificationResult {
  readonly valid: boolean;
  readonly computedRootHex: string;
  readonly expectedRootHex: string;
  readonly reason: string;
  readonly verificationMs: number;
}

export type TenantCapability = "read" | "write" | "export-bom" | "verify-proof" | "delegate";

export interface CrossTenantDelegationToken {
  readonly delegationId: string;
  readonly sourceTenantId: string;
  readonly targetTenantId: string;
  readonly allowedCapabilities: readonly TenantCapability[];
  readonly expiresAtMs: number;
  readonly attestationSha256: string;
}

export interface TenantAccessRequest {
  readonly requestId: string;
  readonly actorId: string;
  readonly actorTenantId: string;
  readonly actorKeyScopeId: string;
  readonly grantedCapabilities: readonly TenantCapability[];
  readonly action: TenantCapability;
  readonly resourceTenantId: string;
  readonly resourceWorkspaceId: string;
  readonly resourceKeyScopeId: string;
  readonly storageNamespace: string;
  readonly sessionExpiresAtMs: number;
  readonly hardwareAttested?: boolean;
  readonly delegation?: CrossTenantDelegationToken;
}

export interface MultiTenantPolicyConfig {
  readonly nowMs: number;
  readonly denyByDefault?: boolean;
  readonly requireKeyScopeMatch?: boolean;
  readonly requireHardwareAttestation?: boolean;
  readonly allowVerifiedDelegation?: boolean;
  readonly delegationSigningSalt?: string;
}

export interface MultiTenantIsolationAuditInput {
  readonly policy: MultiTenantPolicyConfig;
  readonly requests: readonly TenantAccessRequest[];
  readonly ledger?: AssetProvenanceMerkleLedger;
}

export type IsolationViolationCode =
  | "CROSS_TENANT_ACCESS_DENIED"
  | "KEY_SCOPE_MISMATCH"
  | "STORAGE_NAMESPACE_ESCAPE"
  | "SESSION_EXPIRED"
  | "MISSING_CAPABILITY"
  | "UNATTESTED_DEVICE"
  | "INVALID_DELEGATION_TOKEN"
  | "LEDGER_TENANT_CONTAMINATION";

export interface TenantIsolationViolation {
  readonly requestId: string;
  readonly code: IsolationViolationCode;
  readonly detail: string;
}

export interface TenantAccessDecision {
  readonly requestId: string;
  readonly allowed: boolean;
  readonly delegated: boolean;
  readonly violations: readonly TenantIsolationViolation[];
}

export interface MultiTenantIsolationAuditResult {
  readonly compliant: boolean;
  readonly totalChecked: number;
  readonly allowedCount: number;
  readonly deniedCount: number;
  readonly decisions: readonly TenantAccessDecision[];
  readonly violations: readonly TenantIsolationViolation[];
  readonly auditDigestSha256: string;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const HEX_CHARS = "0123456789abcdef";
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;
const LEAF_DOMAIN_PREFIX = 0x00;
const NODE_DOMAIN_PREFIX = 0x01;
const EMPTY_LEDGER_DOMAIN = "TOONSTUDIO:MERKLE:EMPTY:V1";

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** 런타임 무의존 순수 JS UTF-8 인코더 (서로게이트 페어 지원). */
export function utf8ToBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += HEX_CHARS[(b >>> 4) & 0x0f] + HEX_CHARS[b & 0x0f];
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new RangeError("유효하지 않은 16진수 문자열입니다.");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 상수 시간 문자열 비교(타이밍 부채널 완화). */
export function constantTimeHexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** 순수 JS/TS 동기 FIPS 180-4 SHA-256 해시 계산 (`Uint8Array` 32바이트 반환). */
export function sha256Bytes(input: Uint8Array | string): Uint8Array {
  const data = typeof input === "string" ? utf8ToBytes(input) : input;
  const msgLen = data.length;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data, 0);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(msgLen / 0x20000000), false);
  view.setUint32(paddedLen - 4, (msgLen << 3) >>> 0, false);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = SHA256_INIT;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, hs[i], false);
  return out;
}

/** 순수 JS/TS 동기 SHA-256 64자리 소문자 16진수 다이제스트 반환. */
export function sha256Hex(input: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(input));
}

/** 객체 키 순서를 재귀 사전순 정규화한 결정론적 JSON 직렬화. */
export function canonicalizeJsonValue(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean" || t === "number" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalizeJsonValue(v)).join(",")}]`;
  if (t === "object") {
    const rec = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJsonValue(rec[k])}`).join(",")}}`;
  }
  return "null";
}

function hashMerkleLeaf(canonicalPayload: string): Uint8Array {
  const bytes = utf8ToBytes(canonicalPayload);
  const framed = new Uint8Array(1 + bytes.length);
  framed[0] = LEAF_DOMAIN_PREFIX;
  framed.set(bytes, 1);
  return sha256Bytes(framed);
}

function hashMerkleInternalNode(left: Uint8Array, right: Uint8Array): Uint8Array {
  const framed = new Uint8Array(1 + left.length + right.length);
  framed[0] = NODE_DOMAIN_PREFIX;
  framed.set(left, 1);
  framed.set(right, 1 + left.length);
  return sha256Bytes(framed);
}

function validateProvenanceEntry(entry: ProvenanceAssetEntry, expectedTenantId: string, strictSingleTenant: boolean): void {
  if (!entry.entryId.trim() || !entry.tenantId.trim()) {
    throw new RangeError("entryId와 tenantId는 비어 있을 수 없습니다.");
  }
  if (strictSingleTenant && entry.tenantId !== expectedTenantId) {
    throw new Error(`단일 테넌트 원장(${expectedTenantId})에 타 테넌트(${entry.tenantId}) 항목(${entry.entryId})이 혼입되었습니다.`);
  }
  if (!SHA256_HEX_REGEX.test(entry.contentSha256)) {
    throw new RangeError(`항목(${entry.entryId})의 contentSha256은 64자리 소문자 16진수여야 합니다.`);
  }
  if (entry.localComputeProofHash !== undefined && !SHA256_HEX_REGEX.test(entry.localComputeProofHash)) {
    throw new RangeError(`항목(${entry.entryId})의 localComputeProofHash 형식이 유효하지 않습니다.`);
  }
}

/** 작가 원고·브러시·3D 에셋·폰트·로컬 연산 증명을 도메인 분리 SHA-256 머클 루트로 봉인한다. */
export function buildAssetProvenanceMerkleLedger(input: BuildProvenanceLedgerInput): AssetProvenanceMerkleLedger {
  const { ledgerId, tenantId, workspaceId, entries } = input;
  if (!ledgerId.trim() || !tenantId.trim() || !workspaceId.trim()) {
    throw new RangeError("ledgerId, tenantId, workspaceId는 비어 있을 수 없습니다.");
  }
  const strictSingleTenant = input.strictSingleTenant ?? true;
  const requireClearance = input.requireCommercialClearance ?? true;

  const seenIds = new Set<string>();
  const blockedEntryIds: string[] = [];
  const blockedReasons: Record<string, string> = {};
  const canonicalLeafPayloads: string[] = [];
  const leafByteNodes: Uint8Array[] = [];
  const leafHashesHex: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (seenIds.has(entry.entryId)) {
      throw new RangeError(`중복된 entryId(${entry.entryId})는 원장에 봉인할 수 없습니다.`);
    }
    seenIds.add(entry.entryId);
    validateProvenanceEntry(entry, tenantId, strictSingleTenant);

    if (requireClearance && (entry.licenseTier === "unverified" || entry.licenseTier === "editorial-only")) {
      blockedEntryIds.push(entry.entryId);
      blockedReasons[entry.entryId] =
        entry.licenseTier === "unverified"
          ? "미검증 라이선스(unverified)는 익스포트 전 해소가 필요합니다."
          : "비상업용(editorial-only) 에셋은 상업 익스포트가 차단됩니다.";
    }

    const payload = canonicalizeJsonValue(entry);
    const leafHash = hashMerkleLeaf(payload);
    canonicalLeafPayloads.push(payload);
    leafByteNodes.push(leafHash);
    leafHashesHex.push(bytesToHex(leafHash));
  }

  const rightsClearance: ProvenanceRightsClearanceReport = {
    clearedForCommercialExport: blockedEntryIds.length === 0,
    blockedEntryIds,
    blockedReasons,
  };

  if (leafByteNodes.length === 0) {
    const emptyRoot = sha256Hex(EMPTY_LEDGER_DOMAIN);
    return {
      ledgerId, tenantId, workspaceId,
      algorithm: "SHA-256-RFC6962-DOMAIN-SEPARATED",
      merkleRootHex: emptyRoot, leafCount: 0, treeDepth: 0,
      entries: [], canonicalLeafPayloads: [], leafHashesHex: [], levelsHex: [[emptyRoot]],
      rightsClearance,
    };
  }

  const levelsHex: string[][] = [leafHashesHex.slice()];
  let currentLevel = leafByteNodes;
  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    const nextHex: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      const parent = hashMerkleInternalNode(left, right);
      nextLevel.push(parent);
      nextHex.push(bytesToHex(parent));
    }
    levelsHex.push(nextHex);
    currentLevel = nextLevel;
  }

  return {
    ledgerId, tenantId, workspaceId,
    algorithm: "SHA-256-RFC6962-DOMAIN-SEPARATED",
    merkleRootHex: levelsHex[levelsHex.length - 1][0],
    leafCount: entries.length,
    treeDepth: levelsHex.length - 1,
    entries: entries.slice(),
    canonicalLeafPayloads,
    leafHashesHex,
    levelsHex,
    rightsClearance,
  };
}

/** 원장 내 특정 `entryId`의 `O(log N)` 머클 포함 증명(Inclusion Proof)을 생성한다. */
export function generateMerkleInclusionProof(ledger: AssetProvenanceMerkleLedger, entryId: string): MerkleInclusionProof {
  const leafIndex = ledger.entries.findIndex((entry) => entry.entryId === entryId);
  if (leafIndex < 0) {
    throw new RangeError(`원장(${ledger.ledgerId})에서 entryId(${entryId})를 찾을 수 없습니다.`);
  }

  const steps: MerkleProofStep[] = [];
  let cursor = leafIndex;
  for (let levelIdx = 0; levelIdx < ledger.levelsHex.length - 1; levelIdx++) {
    const level = ledger.levelsHex[levelIdx];
    if ((cursor & 1) === 1) {
      steps.push({ position: "left", siblingHashHex: level[cursor - 1] });
    } else {
      steps.push({ position: "right", siblingHashHex: level[cursor + 1 < level.length ? cursor + 1 : cursor] });
    }
    cursor = cursor >>> 1;
  }

  return {
    ledgerId: ledger.ledgerId,
    entryId,
    leafIndex,
    leafCount: ledger.leafCount,
    canonicalLeafPayload: ledger.canonicalLeafPayloads[leafIndex],
    leafHashHex: ledger.leafHashesHex[leafIndex],
    merkleRootHex: ledger.merkleRootHex,
    steps,
  };
}

/** 머클 포함 증명을 1ms 이내 동기 검증하며 1바이트 변조도 즉시 적발한다. */
export function verifyMerkleInclusionProof(
  proof: MerkleInclusionProof,
  expectedEntryOrPayload?: ProvenanceAssetEntry | string,
): MerkleVerificationResult {
  const t0 = nowMs();
  if (!SHA256_HEX_REGEX.test(proof.merkleRootHex) || !SHA256_HEX_REGEX.test(proof.leafHashHex)) {
    return {
      valid: false, computedRootHex: "", expectedRootHex: proof.merkleRootHex,
      reason: "루트 또는 리프 해시 형식이 유효한 SHA-256 16진수가 아닙니다.",
      verificationMs: Math.max(0, nowMs() - t0),
    };
  }

  const payload =
    expectedEntryOrPayload === undefined
      ? proof.canonicalLeafPayload
      : typeof expectedEntryOrPayload === "string"
        ? expectedEntryOrPayload
        : canonicalizeJsonValue(expectedEntryOrPayload);

  const recomputedLeafBytes = hashMerkleLeaf(payload);
  const recomputedLeafHex = bytesToHex(recomputedLeafBytes);
  if (!constantTimeHexEquals(recomputedLeafHex, proof.leafHashHex)) {
    return {
      valid: false, computedRootHex: recomputedLeafHex, expectedRootHex: proof.merkleRootHex,
      reason: "리프 페이로드 해시 불일치(페이로드 변조 감지).",
      verificationMs: Math.max(0, nowMs() - t0),
    };
  }

  let accBytes = recomputedLeafBytes;
  for (let i = 0; i < proof.steps.length; i++) {
    const step = proof.steps[i];
    if (!SHA256_HEX_REGEX.test(step.siblingHashHex)) {
      return {
        valid: false, computedRootHex: bytesToHex(accBytes), expectedRootHex: proof.merkleRootHex,
        reason: `증명 경로 ${i}단계 형제 해시 형식이 유효하지 않습니다.`,
        verificationMs: Math.max(0, nowMs() - t0),
      };
    }
    const siblingBytes = hexToBytes(step.siblingHashHex);
    accBytes = step.position === "left"
      ? hashMerkleInternalNode(siblingBytes, accBytes)
      : hashMerkleInternalNode(accBytes, siblingBytes);
  }

  const computedRootHex = bytesToHex(accBytes);
  const valid = constantTimeHexEquals(computedRootHex, proof.merkleRootHex);
  return {
    valid, computedRootHex, expectedRootHex: proof.merkleRootHex,
    reason: valid ? "머클 포함 증명이 루트 해시와 일치합니다." : "재계산 루트가 기대 루트와 불일치합니다(변조 감지).",
    verificationMs: Math.max(0, nowMs() - t0),
  };
}

/** 교차 테넌트 비상 위임 토큰의 결정론적 SHA-256 서명 다이제스트를 계산한다. */
export function computeDelegationAttestationSha256(
  delegation: Omit<CrossTenantDelegationToken, "attestationSha256">,
  signingSalt: string,
): string {
  const canonical = canonicalizeJsonValue({
    delegationId: delegation.delegationId,
    sourceTenantId: delegation.sourceTenantId,
    targetTenantId: delegation.targetTenantId,
    allowedCapabilities: [...delegation.allowedCapabilities].sort(),
    expiresAtMs: delegation.expiresAtMs,
    signingSalt,
  });
  return sha256Hex(`TOONSTUDIO:DELEGATION:V1:${canonical}`);
}

function isStorageNamespaceConfined(namespace: string, tenantId: string): boolean {
  if (!namespace || namespace.includes("\0")) return false;
  const lowered = namespace.toLowerCase();
  if (namespace.includes("..") || lowered.includes("%2e") || namespace.includes("\\")) return false;
  const prefix = `tenant/${tenantId}/`;
  return namespace.startsWith(prefix) && namespace.length > prefix.length;
}

/** 제로트러스트 멀티테넌트 격리 정책 감사기. */
export function auditMultiTenantIsolationPolicy(input: MultiTenantIsolationAuditInput): MultiTenantIsolationAuditResult {
  const { policy, requests, ledger } = input;
  const denyByDefault = policy.denyByDefault ?? true;
  const requireKeyScopeMatch = policy.requireKeyScopeMatch ?? true;
  const requireHardwareAttestation = policy.requireHardwareAttestation ?? false;
  const allowVerifiedDelegation = policy.allowVerifiedDelegation ?? false;
  const delegationSigningSalt = policy.delegationSigningSalt ?? "";

  const decisions: TenantAccessDecision[] = [];
  const allViolations: TenantIsolationViolation[] = [];
  let allowedCount = 0;
  let deniedCount = 0;

  if (ledger) {
    for (const entry of ledger.entries) {
      if (entry.tenantId !== ledger.tenantId) {
        allViolations.push({
          requestId: `ledger:${ledger.ledgerId}`,
          code: "LEDGER_TENANT_CONTAMINATION",
          detail: `원장(${ledger.tenantId})에 타 테넌트(${entry.tenantId}) 항목(${entry.entryId})이 존재합니다.`,
        });
      }
    }
  }

  for (const req of requests) {
    const reqViolations: TenantIsolationViolation[] = [];
    let delegated = false;

    if (req.sessionExpiresAtMs <= policy.nowMs) {
      reqViolations.push({ requestId: req.requestId, code: "SESSION_EXPIRED", detail: "세션이 만료되었습니다." });
    }
    if (requireHardwareAttestation && req.hardwareAttested !== true) {
      reqViolations.push({ requestId: req.requestId, code: "UNATTESTED_DEVICE", detail: "하드웨어 신뢰 증명이 누락되었습니다." });
    }
    if (!isStorageNamespaceConfined(req.storageNamespace, req.resourceTenantId)) {
      reqViolations.push({
        requestId: req.requestId,
        code: "STORAGE_NAMESPACE_ESCAPE",
        detail: `스토리지 경로(${req.storageNamespace})가 테넌트 경계를 벗어났습니다.`,
      });
    }

    if (req.actorTenantId !== req.resourceTenantId) {
      if (allowVerifiedDelegation && req.delegation && delegationSigningSalt.length > 0) {
        const d = req.delegation;
        const expected = computeDelegationAttestationSha256(
          {
            delegationId: d.delegationId, sourceTenantId: d.sourceTenantId, targetTenantId: d.targetTenantId,
            allowedCapabilities: d.allowedCapabilities, expiresAtMs: d.expiresAtMs,
          },
          delegationSigningSalt,
        );
        const ok =
          d.sourceTenantId === req.actorTenantId &&
          d.targetTenantId === req.resourceTenantId &&
          d.expiresAtMs > policy.nowMs &&
          d.allowedCapabilities.includes(req.action) &&
          constantTimeHexEquals(d.attestationSha256, expected);
        if (ok) {
          delegated = true;
        } else {
          reqViolations.push({ requestId: req.requestId, code: "INVALID_DELEGATION_TOKEN", detail: "교차 테넌트 위임 토큰 검증 실패." });
        }
      } else {
        reqViolations.push({
          requestId: req.requestId,
          code: "CROSS_TENANT_ACCESS_DENIED",
          detail: `테넌트(${req.actorTenantId})의 타 테넌트(${req.resourceTenantId}) 접근이 차단되었습니다.`,
        });
      }
    }

    if (requireKeyScopeMatch && !delegated && req.actorKeyScopeId !== req.resourceKeyScopeId) {
      reqViolations.push({ requestId: req.requestId, code: "KEY_SCOPE_MISMATCH", detail: "KMS 키 스코프 불일치." });
    }
    if (denyByDefault && !req.grantedCapabilities.includes(req.action)) {
      reqViolations.push({ requestId: req.requestId, code: "MISSING_CAPABILITY", detail: `권한(${req.action}) 누락.` });
    }

    const allowed = reqViolations.length === 0;
    if (allowed) {
      allowedCount++;
    } else {
      deniedCount++;
      allViolations.push(...reqViolations);
    }
    decisions.push({ requestId: req.requestId, allowed, delegated, violations: reqViolations });
  }

  const compliant = allViolations.length === 0;
  return {
    compliant,
    totalChecked: requests.length,
    allowedCount,
    deniedCount,
    decisions,
    violations: allViolations,
    auditDigestSha256: sha256Hex(
      canonicalizeJsonValue({ nowMs: policy.nowMs, compliant, allowedCount, deniedCount, violations: allViolations }),
    ),
  };
}
