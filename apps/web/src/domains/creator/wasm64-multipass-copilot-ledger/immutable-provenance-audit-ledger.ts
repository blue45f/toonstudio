/**
 * 무수수료(₩0 · Zero-Gas) 추가 전용(Append-Only) 암호화 레이어·라이선스 감사 원장.
 *
 * - 제네시스 블록 + 이전 블록 해시 연결(`prevHash`) + 이벤트 SHA-256 머클 루트 +
 *   브라우저/Node WebCrypto ECDSA P-256 / Ed25519 블록 서명으로 구성된 로컬 해시 체인이다.
 * - 퍼블릭 블록체인 가스비·외부 서버 없이 글로벌 출판·C2PA·공모전 감사용 증빙 번들을
 *   즉시 생성하며, 단 1바이트의 레이어·폰트·3D 에셋·AI 보조 기록 위변조도
 *   정확한 블록 번호와 필드 단위로 특정한다.
 */

export const PROVENANCE_LEDGER_SCHEMA_VERSION = "toonstudio.provenance-ledger.v1" as const;
export const GENESIS_PREV_HASH = "0".repeat(64);

const UTF8_ENCODER = new TextEncoder();
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LEAF_DOMAIN_PREFIX = "toonstudio:ledger:leaf:v1:";
const NODE_DOMAIN_PREFIX = "toonstudio:ledger:node:v1:";
const EMPTY_MERKLE_SEED = "toonstudio:ledger:empty:v1";
const BLOCK_DOMAIN_PREFIX = "toonstudio:ledger:block:v1:";

export type LedgerSigningAlgorithm = "ECDSA-P256" | "Ed25519";
export type ProvenanceAuditEventKind =
  | "layer-create" | "layer-edit" | "layer-merge" | "font-license"
  | "asset-3d-license" | "brush-asset" | "ai-assist" | "export-checkpoint";
export type TamperFieldKind =
  | "blockIndex" | "ledgerId" | "genesisPrevHash" | "prevHash"
  | "eventCount" | "eventPayload" | "merkleRootHex" | "blockHash" | "signature";

export interface AiAssistDisclosure {
  readonly tool: string; readonly scope: string; readonly humanContributionRatio: number;
}

export interface ProvenanceAuditEvent {
  readonly eventId: string; readonly eventKind: ProvenanceAuditEventKind;
  readonly workId: string; readonly episodeId: string; readonly actorId: string;
  readonly recordedAtIso: string; readonly subjectId: string; readonly subjectLabel: string;
  readonly contentSha256Hex: string;
  readonly licenseCode?: string; readonly commercialAllowed?: boolean;
  readonly aiAssistDisclosure?: AiAssistDisclosure;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface LedgerKeyPair {
  readonly algorithm: LedgerSigningAlgorithm;
  readonly privateKey: CryptoKey; readonly publicKey: CryptoKey; readonly publicKeyJwk: JsonWebKey;
}

export interface LedgerBlockHeader {
  readonly schemaVersion: typeof PROVENANCE_LEDGER_SCHEMA_VERSION;
  readonly ledgerId: string; readonly workId: string; readonly creatorId: string;
  readonly blockIndex: number; readonly prevHash: string; readonly timestampIso: string;
  readonly merkleRootHex: string; readonly eventCount: number;
  readonly signingAlgorithm: LedgerSigningAlgorithm; readonly publicKeyJwk: JsonWebKey;
  readonly feeModel: "zero-fee-local-hash-chain";
}

export interface SignedLedgerBlock {
  readonly header: LedgerBlockHeader;
  readonly events: readonly ProvenanceAuditEvent[];
  readonly leafHashes: readonly string[];
  readonly blockHash: string; readonly signatureBase64Url: string;
}

export interface MerkleProofSibling {
  readonly position: "left" | "right"; readonly hashHex: string;
}

export interface MerkleInclusionProof {
  readonly schemaVersion: typeof PROVENANCE_LEDGER_SCHEMA_VERSION;
  readonly ledgerId: string; readonly blockIndex: number;
  readonly blockHeader: LedgerBlockHeader; readonly blockHash: string;
  readonly blockSignatureBase64Url: string;
  readonly eventId: string; readonly leafIndex: number; readonly leafHash: string;
  readonly merkleRootHex: string; readonly siblings: readonly MerkleProofSibling[];
}

export interface MerkleInclusionVerificationResult {
  readonly valid: boolean; readonly leafHashMatches: boolean;
  readonly merkleRootMatches: boolean; readonly blockHashMatches: boolean;
  readonly signatureValid: boolean;
  readonly computedLeafHash: string; readonly computedRootHex: string;
  readonly failureReasons: readonly string[];
}

export interface LedgerTamperFinding {
  readonly blockIndex: number; readonly field: TamperFieldKind;
  readonly eventId?: string; readonly leafIndex?: number;
  readonly expected?: string; readonly actual?: string; readonly message: string;
}

export interface LedgerIntegrityReport {
  readonly valid: boolean; readonly totalBlocks: number;
  readonly totalEvents: number; readonly verifiedBlocks: number;
  readonly tamperedBlockIndices: readonly number[];
  readonly findings: readonly LedgerTamperFinding[];
  readonly verificationLatencyMs: number;
  readonly networkFeeKrw: 0; readonly gasUsed: 0;
}

export interface ProvenanceAuditExportBundle {
  readonly schemaVersion: typeof PROVENANCE_LEDGER_SCHEMA_VERSION;
  readonly ledgerMode: "zero-fee-local-cryptographic-hash-chain";
  readonly ledgerId: string; readonly workId: string; readonly creatorId: string;
  readonly exportedAtIso: string; readonly totalBlocks: number; readonly totalEvents: number;
  readonly commercialExportClear: boolean; readonly nonCommercialAssetIds: readonly string[];
  readonly aiAssistEventCount: number; readonly averageHumanContributionRatio: number;
  readonly eventKindCounts: Readonly<Record<string, number>>;
  readonly networkFeeKrw: 0; readonly gasUsed: 0;
  readonly blocks: readonly SignedLedgerBlock[];
}

export interface CreateProvenanceLedgerOptions {
  readonly ledgerId: string; readonly workId: string; readonly creatorId: string;
  readonly keyPair?: LedgerKeyPair; readonly preferredAlgorithm?: LedgerSigningAlgorithm;
  readonly createdAtIso?: string; readonly subtle?: SubtleCrypto;
}

export interface AppendBlockOptions {
  readonly timestampIso?: string;
}

export interface ComputedMerkleTree {
  readonly merkleRootHex: string; readonly leafHashes: readonly string[];
  readonly levels: readonly (readonly string[])[];
}

function resolveSubtleCrypto(subtle?: SubtleCrypto): SubtleCrypto {
  if (subtle) return subtle;
  if (typeof crypto !== "undefined" && crypto.subtle) return crypto.subtle;
  throw new Error("현재 실행 환경에서 WebCrypto SubtleCrypto를 사용할 수 없습니다.");
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  const parts: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    const hex = bytes[i].toString(16);
    parts[i] = hex.length === 1 ? `0${hex}` : hex;
  }
  return parts.join("");
}

export function encodeLedgerBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const triple = (b0 << 16) | ((has1 ? bytes[i + 1] : 0) << 8) | (has2 ? bytes[i + 2] : 0);
    out += BASE64URL_ALPHABET[(triple >> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triple >> 12) & 0x3f];
    if (has1) out += BASE64URL_ALPHABET[(triple >> 6) & 0x3f];
    if (has2) out += BASE64URL_ALPHABET[triple & 0x3f];
  }
  return out;
}

export function decodeLedgerBase64Url(encoded: string): Uint8Array {
  const clean = encoded.replace(/=+$/g, "");
  if (clean.length % 4 === 1) throw new Error("유효하지 않은 Base64URL 서명 길이입니다.");
  const outputLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outputLen);
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64URL_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64URL_ALPHABET.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? BASE64URL_ALPHABET.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < clean.length ? BASE64URL_ALPHABET.indexOf(clean[i + 3]) : 0;
    if (c0 < 0 || c1 < 0 || (i + 2 < clean.length && c2 < 0) || (i + 3 < clean.length && c3 < 0)) {
      throw new Error("유효하지 않은 Base64URL 문자가 포함되었습니다.");
    }
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outputLen) { out[outIdx] = (triple >> 16) & 0xff; outIdx += 1; }
    if (outIdx < outputLen) { out[outIdx] = (triple >> 8) & 0xff; outIdx += 1; }
    if (outIdx < outputLen) { out[outIdx] = triple & 0xff; outIdx += 1; }
  }
  return out;
}

/**
 * 객체 키 순서를 재귀 정렬해 어떤 환경에서도 동일한 바이트열을 만드는 정규 JSON 문자열을 반환한다.
 */
export function canonicalizeLedgerJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => (entry === undefined ? "null" : canonicalizeLedgerJson(entry))).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const pairs: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const prop = record[key];
    if (prop !== undefined) pairs.push(`${JSON.stringify(key)}:${canonicalizeLedgerJson(prop)}`);
  }
  return `{${pairs.join(",")}}`;
}

export async function sha256HexBytes(bytes: Uint8Array, subtle?: SubtleCrypto): Promise<string> {
  const digest = await resolveSubtleCrypto(subtle).digest("SHA-256", toExactArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256HexText(text: string, subtle?: SubtleCrypto): Promise<string> {
  return sha256HexBytes(UTF8_ENCODER.encode(text), subtle);
}

export async function generateLedgerKeyPair(
  preferredAlgorithm: LedgerSigningAlgorithm = "ECDSA-P256",
  subtle?: SubtleCrypto,
): Promise<LedgerKeyPair> {
  const cryptoSubtle = resolveSubtleCrypto(subtle);
  if (preferredAlgorithm === "Ed25519") {
    try {
      const edPair = (await cryptoSubtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
      const publicKeyJwk = await cryptoSubtle.exportKey("jwk", edPair.publicKey);
      return { algorithm: "Ed25519", privateKey: edPair.privateKey, publicKey: edPair.publicKey, publicKeyJwk };
    } catch {
      // 런타임이 Ed25519를 지원하지 않으면 표준 ECDSA P-256으로 안전 폴백한다.
    }
  }
  const ecPair = (await cryptoSubtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicKeyJwk = await cryptoSubtle.exportKey("jwk", ecPair.publicKey);
  return { algorithm: "ECDSA-P256", privateKey: ecPair.privateKey, publicKey: ecPair.publicKey, publicKeyJwk };
}

async function signDigestText(text: string, keyPair: LedgerKeyPair, subtle?: SubtleCrypto): Promise<string> {
  const alg = keyPair.algorithm === "Ed25519" ? ({ name: "Ed25519" } as const) : ({ name: "ECDSA", hash: "SHA-256" } as const);
  const rawSig = await resolveSubtleCrypto(subtle).sign(alg, keyPair.privateKey, toExactArrayBuffer(UTF8_ENCODER.encode(text)));
  return encodeLedgerBase64Url(new Uint8Array(rawSig));
}

async function verifyDigestSignature(
  text: string,
  signatureBase64Url: string,
  signingAlgorithm: LedgerSigningAlgorithm,
  publicKeyJwk: JsonWebKey,
  subtle?: SubtleCrypto,
): Promise<boolean> {
  let sigBytes: Uint8Array;
  try {
    sigBytes = decodeLedgerBase64Url(signatureBase64Url);
  } catch {
    return false;
  }
  try {
    const cryptoSubtle = resolveSubtleCrypto(subtle);
    const importAlg =
      signingAlgorithm === "Ed25519" ? ({ name: "Ed25519" } as const) : ({ name: "ECDSA", namedCurve: "P-256" } as const);
    const verifyAlg =
      signingAlgorithm === "Ed25519" ? ({ name: "Ed25519" } as const) : ({ name: "ECDSA", hash: "SHA-256" } as const);
    const publicKey = await cryptoSubtle.importKey("jwk", publicKeyJwk, importAlg, false, ["verify"]);
    return await cryptoSubtle.verify(
      verifyAlg, publicKey, toExactArrayBuffer(sigBytes), toExactArrayBuffer(UTF8_ENCODER.encode(text)),
    );
  } catch {
    return false;
  }
}

export async function hashLedgerEventLeaf(event: ProvenanceAuditEvent, subtle?: SubtleCrypto): Promise<string> {
  return sha256HexText(`${LEAF_DOMAIN_PREFIX}${canonicalizeLedgerJson(event)}`, subtle);
}

async function hashMerkleInternalNode(leftHex: string, rightHex: string, subtle?: SubtleCrypto): Promise<string> {
  return sha256HexText(`${NODE_DOMAIN_PREFIX}${leftHex}:${rightHex}`, subtle);
}

export async function buildEventMerkleTree(
  events: readonly ProvenanceAuditEvent[],
  subtle?: SubtleCrypto,
): Promise<ComputedMerkleTree> {
  if (events.length === 0) {
    const emptyRoot = await sha256HexText(EMPTY_MERKLE_SEED, subtle);
    return { merkleRootHex: emptyRoot, leafHashes: [], levels: [[emptyRoot]] };
  }
  const leafHashes: string[] = [];
  for (const ev of events) leafHashes.push(await hashLedgerEventLeaf(ev, subtle));

  const levels: string[][] = [leafHashes];
  let currentLevel = leafHashes;
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(await hashMerkleInternalNode(left, right, subtle));
    }
    levels.push(nextLevel);
    currentLevel = nextLevel;
  }
  return { merkleRootHex: currentLevel[0], leafHashes, levels };
}

async function computeBlockHeaderHash(header: LedgerBlockHeader, subtle?: SubtleCrypto): Promise<string> {
  return sha256HexText(`${BLOCK_DOMAIN_PREFIX}${canonicalizeLedgerJson(header)}`, subtle);
}

/**
 * 단일 이벤트의 머클 포함 증명(Merkle Inclusion Proof)과 소속 블록 서명을 독립 검증한다.
 */
export async function verifyEventInclusionProof(
  event: ProvenanceAuditEvent,
  proof: MerkleInclusionProof,
  subtle?: SubtleCrypto,
): Promise<MerkleInclusionVerificationResult> {
  const failureReasons: string[] = [];
  const computedLeafHash = await hashLedgerEventLeaf(event, subtle);
  const leafHashMatches = computedLeafHash === proof.leafHash;
  if (!leafHashMatches) failureReasons.push(`이벤트(${event.eventId}) 리프 해시가 증명값과 일치하지 않습니다.`);

  let currentHash = computedLeafHash;
  for (const sibling of proof.siblings) {
    currentHash =
      sibling.position === "left"
        ? await hashMerkleInternalNode(sibling.hashHex, currentHash, subtle)
        : await hashMerkleInternalNode(currentHash, sibling.hashHex, subtle);
  }

  const merkleRootMatches =
    currentHash === proof.merkleRootHex && proof.merkleRootHex === proof.blockHeader.merkleRootHex;
  if (!merkleRootMatches) failureReasons.push("머클 경로 재계산 루트가 블록 헤더 merkleRootHex와 다릅니다.");

  const blockHashMatches = (await computeBlockHeaderHash(proof.blockHeader, subtle)) === proof.blockHash;
  if (!blockHashMatches) failureReasons.push("블록 헤더 해시가 proof.blockHash와 다릅니다.");

  const signatureValid = await verifyDigestSignature(
    proof.blockHash, proof.blockSignatureBase64Url,
    proof.blockHeader.signingAlgorithm, proof.blockHeader.publicKeyJwk, subtle,
  );
  if (!signatureValid) failureReasons.push("블록 WebCrypto 서명 검증에 실패했습니다.");

  return {
    valid: leafHashMatches && merkleRootMatches && blockHashMatches && signatureValid,
    leafHashMatches, merkleRootMatches, blockHashMatches, signatureValid,
    computedLeafHash, computedRootHex: currentHash, failureReasons,
  };
}

/**
 * 외부 제출된 블록 체인 배열의 전체 무결성을 검증하고 단 1바이트 변조도 블록·필드 단위로 특정한다.
 */
export async function verifyLedgerChain(
  blocks: readonly SignedLedgerBlock[],
  subtle?: SubtleCrypto,
): Promise<LedgerIntegrityReport> {
  const startMs = performance.now();
  const findings: LedgerTamperFinding[] = [];
  const tamperedSet = new Set<number>();
  let totalEvents = 0;

  if (blocks.length === 0) {
    return {
      valid: false, totalBlocks: 0, totalEvents: 0, verifiedBlocks: 0, tamperedBlockIndices: [],
      findings: [{ blockIndex: 0, field: "genesisPrevHash", message: "원장에 제네시스 블록이 존재하지 않습니다." }],
      verificationLatencyMs: Number((performance.now() - startMs).toFixed(3)),
      networkFeeKrw: 0, gasUsed: 0,
    };
  }

  const expectedLedgerId = blocks[0].header.ledgerId;
  const recordFinding = (f: LedgerTamperFinding): void => {
    findings.push(f);
    tamperedSet.add(f.blockIndex);
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const header = block.header;
    totalEvents += block.events.length;

    if (header.blockIndex !== i) {
      recordFinding({
        blockIndex: i, field: "blockIndex", expected: String(i), actual: String(header.blockIndex),
        message: `블록 #${i}의 header.blockIndex(${header.blockIndex})가 순서와 불일치합니다.`,
      });
    }
    if (header.ledgerId !== expectedLedgerId) {
      recordFinding({
        blockIndex: i, field: "ledgerId", expected: expectedLedgerId, actual: header.ledgerId,
        message: `블록 #${i}의 ledgerId가 제네시스 원장 ID와 다릅니다.`,
      });
    }
    if (i === 0 && header.prevHash !== GENESIS_PREV_HASH) {
      recordFinding({
        blockIndex: 0, field: "genesisPrevHash", expected: GENESIS_PREV_HASH, actual: header.prevHash,
        message: "제네시스 블록의 prevHash가 0x00... 기준값과 다릅니다.",
      });
    } else if (i > 0 && header.prevHash !== blocks[i - 1].blockHash) {
      recordFinding({
        blockIndex: i, field: "prevHash", expected: blocks[i - 1].blockHash, actual: header.prevHash,
        message: `블록 #${i}의 prevHash가 직전 블록 #${i - 1}의 blockHash와 단절되었습니다.`,
      });
    }
    if (header.eventCount !== block.events.length) {
      recordFinding({
        blockIndex: i, field: "eventCount", expected: String(block.events.length), actual: String(header.eventCount),
        message: `블록 #${i}의 eventCount(${header.eventCount})와 실제 이벤트 수(${block.events.length})가 다릅니다.`,
      });
    }

    const tree = await buildEventMerkleTree(block.events, subtle);
    for (let k = 0; k < block.events.length; k += 1) {
      if (block.leafHashes[k] !== tree.leafHashes[k]) {
        recordFinding({
          blockIndex: i, field: "eventPayload", eventId: block.events[k].eventId, leafIndex: k,
          expected: block.leafHashes[k], actual: tree.leafHashes[k],
          message: `블록 #${i} 이벤트(${block.events[k].eventId}, leaf #${k}) 페이로드가 위변조되었습니다.`,
        });
      }
    }
    if (tree.merkleRootHex !== header.merkleRootHex) {
      recordFinding({
        blockIndex: i, field: "merkleRootHex", expected: header.merkleRootHex, actual: tree.merkleRootHex,
        message: `블록 #${i}의 머클 루트가 이벤트 재계산 값과 불일치합니다.`,
      });
    }
    const computedBlockHash = await computeBlockHeaderHash(header, subtle);
    if (computedBlockHash !== block.blockHash) {
      recordFinding({
        blockIndex: i, field: "blockHash", expected: block.blockHash, actual: computedBlockHash,
        message: `블록 #${i}의 헤더 해시가 저장된 blockHash와 다릅니다.`,
      });
    }
    const sigOk = await verifyDigestSignature(
      block.blockHash, block.signatureBase64Url, header.signingAlgorithm, header.publicKeyJwk, subtle,
    );
    if (!sigOk) {
      recordFinding({
        blockIndex: i, field: "signature",
        message: `블록 #${i}의 ${header.signingAlgorithm} 암호화 서명이 유효하지 않습니다.`,
      });
    }
  }

  const tamperedBlockIndices = Array.from(tamperedSet).sort((a, b) => a - b);
  return {
    valid: findings.length === 0,
    totalBlocks: blocks.length,
    totalEvents,
    verifiedBlocks: blocks.length - tamperedBlockIndices.length,
    tamperedBlockIndices,
    findings,
    verificationLatencyMs: Number((performance.now() - startMs).toFixed(3)),
    networkFeeKrw: 0,
    gasUsed: 0,
  };
}

export class ImmutableProvenanceLedger {
  private readonly ledgerId: string;
  private readonly workId: string;
  private readonly creatorId: string;
  private readonly keyPair: LedgerKeyPair;
  private readonly subtle?: SubtleCrypto;
  private readonly blocks: SignedLedgerBlock[] = [];
  private readonly seenEventIds = new Set<string>();

  private constructor(
    ledgerId: string, workId: string, creatorId: string,
    keyPair: LedgerKeyPair, genesisBlock: SignedLedgerBlock, subtle?: SubtleCrypto,
  ) {
    this.ledgerId = ledgerId;
    this.workId = workId;
    this.creatorId = creatorId;
    this.keyPair = keyPair;
    this.subtle = subtle;
    this.blocks.push(genesisBlock);
  }

  static async create(options: CreateProvenanceLedgerOptions): Promise<ImmutableProvenanceLedger> {
    const keyPair =
      options.keyPair ?? (await generateLedgerKeyPair(options.preferredAlgorithm ?? "ECDSA-P256", options.subtle));
    const emptyTree = await buildEventMerkleTree([], options.subtle);
    const genesisHeader: LedgerBlockHeader = {
      schemaVersion: PROVENANCE_LEDGER_SCHEMA_VERSION,
      ledgerId: options.ledgerId, workId: options.workId, creatorId: options.creatorId,
      blockIndex: 0, prevHash: GENESIS_PREV_HASH,
      timestampIso: options.createdAtIso ?? new Date().toISOString(),
      merkleRootHex: emptyTree.merkleRootHex, eventCount: 0,
      signingAlgorithm: keyPair.algorithm, publicKeyJwk: keyPair.publicKeyJwk,
      feeModel: "zero-fee-local-hash-chain",
    };
    const blockHash = await computeBlockHeaderHash(genesisHeader, options.subtle);
    const signatureBase64Url = await signDigestText(blockHash, keyPair, options.subtle);
    return new ImmutableProvenanceLedger(
      options.ledgerId, options.workId, options.creatorId, keyPair,
      { header: genesisHeader, events: [], leafHashes: [], blockHash, signatureBase64Url },
      options.subtle,
    );
  }

  getSigningAlgorithm(): LedgerSigningAlgorithm { return this.keyPair.algorithm; }
  getBlocks(): readonly SignedLedgerBlock[] { return [...this.blocks]; }
  getLatestBlock(): SignedLedgerBlock { return this.blocks[this.blocks.length - 1]; }

  async appendBlock(
    events: readonly ProvenanceAuditEvent[],
    options: AppendBlockOptions = {},
  ): Promise<SignedLedgerBlock> {
    if (events.length === 0) throw new Error("최소 1개 이상의 감사 이벤트가 필요합니다.");
    const batchIds = new Set<string>();
    for (const ev of events) {
      if (this.seenEventIds.has(ev.eventId) || batchIds.has(ev.eventId)) {
        throw new Error(`중복된 감사 이벤트 ID입니다: ${ev.eventId}`);
      }
      batchIds.add(ev.eventId);
    }

    const tree = await buildEventMerkleTree(events, this.subtle);
    const header: LedgerBlockHeader = {
      schemaVersion: PROVENANCE_LEDGER_SCHEMA_VERSION,
      ledgerId: this.ledgerId, workId: this.workId, creatorId: this.creatorId,
      blockIndex: this.blocks.length, prevHash: this.getLatestBlock().blockHash,
      timestampIso: options.timestampIso ?? new Date().toISOString(),
      merkleRootHex: tree.merkleRootHex, eventCount: events.length,
      signingAlgorithm: this.keyPair.algorithm, publicKeyJwk: this.keyPair.publicKeyJwk,
      feeModel: "zero-fee-local-hash-chain",
    };
    const blockHash = await computeBlockHeaderHash(header, this.subtle);
    const signatureBase64Url = await signDigestText(blockHash, this.keyPair, this.subtle);
    const signedBlock: SignedLedgerBlock = {
      header, events: [...events], leafHashes: [...tree.leafHashes], blockHash, signatureBase64Url,
    };
    this.blocks.push(signedBlock);
    batchIds.forEach((id) => this.seenEventIds.add(id));
    return signedBlock;
  }

  async generateEventInclusionProof(blockIndex: number, eventId: string): Promise<MerkleInclusionProof> {
    const block = this.blocks[blockIndex];
    if (!block) throw new Error(`존재하지 않는 블록 인덱스입니다: ${blockIndex}`);
    const leafIndex = block.events.findIndex((e) => e.eventId === eventId);
    if (leafIndex < 0) throw new Error(`블록 #${blockIndex}에서 이벤트(${eventId})를 찾을 수 없습니다.`);

    const tree = await buildEventMerkleTree(block.events, this.subtle);
    const siblings: MerkleProofSibling[] = [];
    let idx = leafIndex;
    for (let levelIdx = 0; levelIdx < tree.levels.length - 1; levelIdx += 1) {
      const level = tree.levels[levelIdx];
      const isRight = idx % 2 === 1;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      siblings.push({
        position: isRight ? "left" : "right",
        hashHex: sibIdx < level.length ? level[sibIdx] : level[idx],
      });
      idx = Math.floor(idx / 2);
    }

    return {
      schemaVersion: PROVENANCE_LEDGER_SCHEMA_VERSION,
      ledgerId: this.ledgerId, blockIndex, blockHeader: block.header,
      blockHash: block.blockHash, blockSignatureBase64Url: block.signatureBase64Url,
      eventId, leafIndex, leafHash: tree.leafHashes[leafIndex],
      merkleRootHex: tree.merkleRootHex, siblings,
    };
  }

  async verifyLedgerIntegrity(): Promise<LedgerIntegrityReport> {
    return verifyLedgerChain(this.blocks, this.subtle);
  }

  exportAuditBundle(exportedAtIso?: string): ProvenanceAuditExportBundle {
    const nonCommercialAssetIds: string[] = [];
    const eventKindCounts: Record<string, number> = {};
    let totalEvents = 0;
    let aiAssistEventCount = 0;
    let humanRatioSum = 0;

    for (const block of this.blocks) {
      for (const ev of block.events) {
        totalEvents += 1;
        eventKindCounts[ev.eventKind] = (eventKindCounts[ev.eventKind] ?? 0) + 1;
        if (ev.commercialAllowed === false) nonCommercialAssetIds.push(ev.subjectId);
        if (ev.eventKind === "ai-assist" && ev.aiAssistDisclosure) {
          aiAssistEventCount += 1;
          humanRatioSum += ev.aiAssistDisclosure.humanContributionRatio;
        }
      }
    }

    return {
      schemaVersion: PROVENANCE_LEDGER_SCHEMA_VERSION,
      ledgerMode: "zero-fee-local-cryptographic-hash-chain",
      ledgerId: this.ledgerId, workId: this.workId, creatorId: this.creatorId,
      exportedAtIso: exportedAtIso ?? new Date().toISOString(),
      totalBlocks: this.blocks.length, totalEvents,
      commercialExportClear: nonCommercialAssetIds.length === 0,
      nonCommercialAssetIds,
      aiAssistEventCount,
      averageHumanContributionRatio: aiAssistEventCount > 0 ? Number((humanRatioSum / aiAssistEventCount).toFixed(4)) : 1,
      eventKindCounts,
      networkFeeKrw: 0, gasUsed: 0,
      blocks: this.getBlocks(),
    };
  }
}
