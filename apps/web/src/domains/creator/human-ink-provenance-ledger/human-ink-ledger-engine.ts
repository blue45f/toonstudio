/**
 * Wave 58C — 자가 신고 작화 표본의 비암호학적 머클 체크섬·unsigned JSON 메모.
 *
 * - 결정론적 FNV-1a 64-bit(이중 32비트 무부호 워드, BigInt 미사용) 해시 체인 + 이진 머클 트리
 * - 표본 태그별 이벤트 개수 비율이며, 작화 면적·저작자·라이선스를 검증하지 않는다.
 * - 고정 표본의 O(log N) 포함 경로·원장 일관성 점검이며 악의적 재작성에 대한 인증은 아니다.
 * - 권리 정본·실제 캔버스·서명·C2PA 검증·저장은 연결하지 않으며 상업 출고는 허가하지 않는다.
 */

import { MAX_LEDGER_EVENTS, MAX_NOTE_TEXT_UNITS, MAX_TELEMETRY_SAMPLES, assertEvent, assertText, copyValidatedEvents, isValidProofShape, sameLedgerData, serializeLedgerMetadata } from "./human-ink-input-contract";

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;
export const MERKLE_SVG_WIDTH = 420;
export const MERKLE_SVG_HEIGHT = 248;
export const RATIO_GAUGE_SVG_WIDTH = 420;
export const RATIO_GAUGE_SVG_HEIGHT = 86;
export const GENESIS_CHAIN_HASH_HEX = "0000000000000000";
export const CRYPTOGRAPHIC_SCOPE_PREVIEW = "local-deterministic-merkle-fnv1a64-preview" as const;

const FNV64_OFFSET_HI = 0xcbf29ce4;
const FNV64_OFFSET_LO = 0x84222325;
const FNV64_PRIME_LO = 0x000001b3; // 435; 64-bit FNV prime = 2^40 + 435
const BASE_EPOCH_MS = 1795608000000; // 2026-11-25T12:00:00.000Z

export type HumanInkEventKind = "human-pen-stroke" | "procedural-cc0-asset" | "3d-bg-placement" | "non-destructive-filter" | "unverified-external-scan";
export type RightsBomLicenseClass = "human-ink-original" | "clean-procedural-cc0" | "byot-personal-render" | "external-unverified-raw-scan";
export type HumanInkScenarioId = "pure-human-ink" | "hybrid-human-cc0-3d" | "contaminated-external-scan";
export type TamperMutationMode = "pressure-1bit" | "timestamp-1ms" | "source-spoof" | "tile-hash-1byte";
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }

export interface HumanInkLedgerEvent {
  readonly eventId: string; readonly sequenceIndex: number; readonly kind: HumanInkEventKind;
  readonly licenseClass: RightsBomLicenseClass; readonly layerId: string; readonly toolLabel: string;
  readonly timestampMs: number; readonly deltaTimeMs: number;
  readonly pressureEntropyBits: number; readonly velocityVariance: number;
  readonly strokePointCount: number; readonly tileDeltaHashHex: string;
  readonly assetRefId?: string; readonly sourceNoteKo: string; readonly sourceNoteEn: string;
}

export interface HumanInkScenarioSpec {
  readonly id: HumanInkScenarioId; readonly workId: string; readonly nameKo: string; readonly nameEn: string;
  readonly episodeTitleKo: string; readonly episodeTitleEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly recordedAtIso: string; readonly pageCount: number; readonly events: readonly HumanInkLedgerEvent[];
}

export interface BuildHumanInkLedgerOptions {
  readonly workId?: string; readonly scenarioId?: HumanInkScenarioId | "custom";
  readonly episodeTitleKo?: string; readonly episodeTitleEn?: string;
  readonly recordedAtIso?: string; readonly pageCount?: number;
}

export interface MerkleProofStep {
  readonly level: number; readonly position: "left" | "right"; readonly siblingHashHex: string; readonly duplicated: boolean;
}

export interface MerkleInclusionProof {
  readonly leafIndex: number; readonly eventId: string; readonly leafHashHex: string;
  readonly merkleRootHex: string; readonly treeDepth: number; readonly leafCount: number;
  readonly siblings: readonly MerkleProofStep[];
}

export interface MerkleInclusionVerificationResult {
  readonly valid: boolean; readonly leafIndex: number; readonly eventId: string;
  readonly leafHashMatchesEvent: boolean; readonly computedRootHex: string;
  readonly expectedRootHex: string; readonly proofDepth: number;
  readonly reasonCode: "verified" | "leaf-hash-mismatch" | "root-mismatch" | "proof-root-mismatch" | "invalid-proof-shape";
}

export interface HumanInkSummaryProof {
  readonly zeroPixelExposure: true; readonly rawPsdIncluded: false; readonly rawPixelBytesExposed: 0;
  readonly totalEventCount: number; readonly humanStrokeCount: number; readonly proceduralCc0Count: number;
  readonly bg3dPlacementCount: number; readonly nonDestructiveFilterCount: number; readonly unverifiedExternalScanCount: number;
  readonly humanInkStrokeRatioPercent: number; readonly proceduralCc0AssetRatioPercent: number;
  readonly bg3dPlacementRatioPercent: number; readonly nonDestructiveFilterRatioPercent: number; readonly unverifiedExternalRatioPercent: number;
  readonly meanPressureEntropyBits: number; readonly meanVelocityVariance: number;
  readonly humanAuthorshipScore: number; readonly summaryCommitmentHex: string;
}

export interface RightsBomContaminationGateResult {
  readonly status: "blocked-unverified" | "pass-clean" | "pass-hybrid-verified" | "blocked-contaminated" | "blocked-empty";
  readonly exportAllowed: boolean; readonly failClosedTriggered: boolean;
  readonly contaminatedEventCount: number; readonly contaminatedEventIds: readonly string[];
  readonly contaminatedIndices: readonly number[]; readonly mismatchedLicenseIndices: readonly number[];
  readonly licenseBreakdown: Readonly<Record<RightsBomLicenseClass, number>>;
  readonly gateReasonKo: string; readonly gateReasonEn: string;
  readonly redistributionPolicyKo: string; readonly redistributionPolicyEn: string;
  readonly remediationStepsKo: readonly string[]; readonly remediationStepsEn: readonly string[];
}

export interface HumanInkMerkleLedger {
  readonly schemaVersion: "toonstudio.human-ink-merkle-ledger.v1"; readonly hashAlgorithm: "FNV-1a-64-dual-u32";
  readonly workId: string; readonly scenarioId: HumanInkScenarioId | "custom";
  readonly episodeTitleKo: string; readonly episodeTitleEn: string;
  readonly recordedAtIso: string; readonly pageCount: number;
  readonly events: readonly HumanInkLedgerEvent[]; readonly eventDigests: readonly string[];
  readonly leafHashes: readonly string[]; readonly chainHashes: readonly string[]; readonly chainTipHex: string;
  readonly treeLevels: readonly (readonly string[])[]; readonly treeDepth: number;
  readonly merkleRootHex: string; readonly inclusionProofs: readonly MerkleInclusionProof[];
  readonly summaryProof: HumanInkSummaryProof; readonly rightsBomGate: RightsBomContaminationGateResult;
}

export interface LedgerVerificationReport {
  readonly valid: boolean; readonly tampered: boolean;
  readonly merkleRootMatches: boolean; readonly chainTipMatches: boolean;
  readonly summaryCommitmentMatches: boolean; readonly lengthMatches: boolean;
  readonly committedMerkleRootHex: string; readonly recomputedMerkleRootHex: string;
  readonly committedChainTipHex: string; readonly recomputedChainTipHex: string;
  readonly tamperedLeafIndices: readonly number[]; readonly firstTamperedIndex: number | null;
  readonly firstTamperedEventId: string | null; readonly verifiedLeafCount: number;
  readonly detailKo: string; readonly detailEn: string;
}

export interface SingleByteTamperResult {
  readonly tamperedEvents: readonly HumanInkLedgerEvent[]; readonly targetIndex: number;
  readonly mode: TamperMutationMode; readonly mutatedField: string;
  readonly beforeValue: string; readonly afterValue: string;
  readonly mutationSummaryKo: string; readonly mutationSummaryEn: string;
}

const clampNumber = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const roundTo = (v: number, digits: number): number => Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits);
const normalizeHueDeg = (hueDeg: number): number => {
  if (!Number.isFinite(hueDeg)) return 210;
  const mod = hueDeg % 360;
  return mod < 0 ? mod + 360 : mod;
};

/** 보라/바이올렛 AI 슬롭 구간(270~320°) 여부를 판정한다. */
export const isVioletSlopHue = (hueDeg: number): boolean => {
  const n = normalizeHueDeg(hueDeg);
  return n >= VIOLET_SLOP_MIN_HUE && n <= VIOLET_SLOP_MAX_HUE;
};

/** 바이올렛 구간(270~320°)에 들어온 색조를 안전한 청록/코발트·주홍 측으로 보정한다. */
export const sanitizeNonVioletHue = (hueDeg: number): number => {
  const n = normalizeHueDeg(hueDeg);
  return isVioletSlopHue(n) ? (n < 295 ? 248 : 342) : roundTo(n, 1);
};

/** 원시 색(hex/rgb/hsl) 없이 탈-바이올렛 OKLCH CSS 색 문자열을 생성한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clampNumber(color.l, 0, 1), 3);
  const c = roundTo(clampNumber(color.c, 0, 0.37), 3);
  const h = sanitizeNonVioletHue(color.h);
  return typeof alpha === "number" && Number.isFinite(alpha)
    ? `oklch(${l} ${c} ${h} / ${clampNumber(alpha, 0, 1).toFixed(2)})`
    : `oklch(${l} ${c} ${h})`;
}

/** 문자열을 결정론적 UTF-8 바이트 배열로 인코딩한다. */
export function encodeUtf8Bytes(input: string): readonly number[] {
  assertText(input, MAX_NOTE_TEXT_UNITS);
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i += 1;
      } else cp = 0xfffd;
    } else if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp <= 0x7f) bytes.push(cp);
    else if (cp <= 0x7ff) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp <= 0xffff) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return bytes;
}

/** BigInt 없이 두 개의 32비트 무부호 워드(hi, lo)로 정확한 FNV-1a 64-bit 해시를 계산한다. */
export function fnv1a64Words(input: string): { readonly hi: number; readonly lo: number } {
  const bytes = encodeUtf8Bytes(input);
  let hi = FNV64_OFFSET_HI >>> 0;
  let lo = FNV64_OFFSET_LO >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    lo = (lo ^ bytes[i]) >>> 0;
    const p0 = (lo & 0xffff) * FNV64_PRIME_LO;
    const p1 = (lo >>> 16) * FNV64_PRIME_LO + (p0 >>> 16);
    const nextLo = (((p1 & 0xffff) << 16) | (p0 & 0xffff)) >>> 0;
    hi = ((Math.imul(hi, FNV64_PRIME_LO) >>> 0) + (p1 >>> 16) + ((lo << 8) >>> 0)) >>> 0;
    lo = nextLo;
  }
  return { hi, lo };
}

/** 결정론적 FNV-1a 64-bit 해시를 16자리 소문자 16진 문자열로 반환한다. */
export function fnv1a64Hex(input: string): string {
  const { hi, lo } = fnv1a64Words(input);
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

/** 스타일러스 필압 샘플([0, 1])의 16-bin 섀넌 엔트로피(최대 4.0 bits)를 산출한다. */
export function computePressureEntropyBits(samples: readonly number[]): number {
  if (!Array.isArray(samples) || samples.length > MAX_TELEMETRY_SAMPLES) throw new Error("Pressure sample limit exceeded");
  if (samples.length === 0) return 0;
  const counts = new Array<number>(16).fill(0);
  let validCount = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (!Number.isFinite(samples[i])) continue;
    const bin = Math.floor(clampNumber(samples[i], 0, 0.999999) * 16);
    counts[bin] = (counts[bin] ?? 0) + 1;
    validCount += 1;
  }
  if (validCount === 0) return 0;
  let entropy = 0;
  for (let b = 0; b < 16; b += 1) {
    const c = counts[b] ?? 0;
    if (c > 0) entropy -= (c / validCount) * Math.log2(c / validCount);
  }
  return roundTo(entropy, 4);
}

/** 스트로크 속도 샘플의 정규화 분산(손 떨림·가감속 변동 지수)을 산출한다. */
export function computeVelocityVariance(speeds: readonly number[]): number {
  if (!Array.isArray(speeds) || speeds.length > MAX_TELEMETRY_SAMPLES) throw new Error("Velocity sample limit exceeded");
  const filtered = speeds.filter((v) => Number.isFinite(v) && v >= 0);
  if (filtered.length < 2) return 0;
  const scale = Math.max(...filtered);
  if (scale === 0) return 0;
  const mean = filtered.reduce((acc, v) => acc + v / scale, 0) / filtered.length;
  if (mean * scale <= 0.0001) return 0;
  const sumSq = filtered.reduce((acc, v) => acc + Math.pow((v / scale - mean) / mean, 2), 0);
  return roundTo(clampNumber(sumSq / filtered.length, 0, 4), 4);
}

/** 원본 픽셀을 노출하지 않고 변경 타일 좌표·태그만으로 64-bit 타일 델타 해시를 생성한다. */
export function computeTileDeltaHashHex(layerId: string, tileCoords: readonly number[], strokeSalt: string): string {
  assertText(layerId, 256, true); assertText(strokeSalt, 4096);
  if (!Array.isArray(tileCoords) || tileCoords.length > MAX_TELEMETRY_SAMPLES) throw new Error("Tile coordinate limit exceeded");
  return fnv1a64Hex(JSON.stringify(["tile-delta:v2", layerId, tileCoords.map((n) => Number.isFinite(n) ? Math.round(n) : 0), strokeSalt]));
}

/** 구분자·반올림 충돌 없이 알려진 모든 필드의 원문을 고정 순서로 보존한다. */
export function serializeEventCanonical(event: HumanInkLedgerEvent): string {
  assertEvent(event);
  return JSON.stringify([
    event.eventId, event.sequenceIndex, event.kind, event.licenseClass, event.layerId, event.toolLabel,
    event.timestampMs, event.deltaTimeMs, event.pressureEntropyBits, event.velocityVariance,
    event.strokePointCount, event.tileDeltaHashHex, event.assetRefId ?? null, event.sourceNoteKo, event.sourceNoteEn,
  ]);
}

function assertLeafIndex(index: number): number {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_LEDGER_EVENTS) throw new Error("Invalid leaf index");
  return index;
}

export const computeEventDigestHex = (event: HumanInkLedgerEvent): string => fnv1a64Hex(`leaf-payload:v1|${serializeEventCanonical(event)}`);
export const computeLeafHashHex = (leafIndex: number, event: HumanInkLedgerEvent): string => fnv1a64Hex(`merkle-leaf:v1|${assertLeafIndex(leafIndex)}|${computeEventDigestHex(event)}`);
export const computeParentHashHex = (leftHex: string, rightHex: string): string => fnv1a64Hex(`merkle-node:v1|${leftHex.toLowerCase()}|${rightHex.toLowerCase()}`);
export const computeChainStepHashHex = (prevHex: string, leafIndex: number, leafHex: string): string => fnv1a64Hex(`chain-step:v1|${prevHex.toLowerCase()}|${assertLeafIndex(leafIndex)}|${leafHex.toLowerCase()}`);

function buildMerkleTreeLevels(leafHashes: readonly string[]): readonly (readonly string[])[] {
  if (leafHashes.length === 0) return [[fnv1a64Hex("merkle-empty:v1")]];
  const levels: string[][] = [[...leafHashes]];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(computeParentHashHex(cur[i], i + 1 < cur.length ? cur[i + 1] : cur[i]));
    }
    levels.push(next);
  }
  return levels;
}

function extractInclusionProof(
  leafIndex: number, events: readonly HumanInkLedgerEvent[], treeLevels: readonly (readonly string[])[], merkleRootHex: string,
): MerkleInclusionProof {
  const leafHashHex = treeLevels[0]?.[leafIndex] ?? fnv1a64Hex("merkle-empty:v1");
  const siblings: MerkleProofStep[] = [];
  let cursor = leafIndex;
  const depth = Math.max(0, treeLevels.length - 1);
  for (let level = 0; level < depth; level += 1) {
    const nodes = treeLevels[level] ?? [];
    if (cursor % 2 === 1) {
      siblings.push({ level, position: "left", siblingHashHex: nodes[cursor - 1] ?? leafHashHex, duplicated: false });
    } else {
      const hasRight = cursor + 1 < nodes.length;
      siblings.push({ level, position: "right", siblingHashHex: hasRight ? nodes[cursor + 1] : nodes[cursor], duplicated: !hasRight });
    }
    cursor = Math.floor(cursor / 2);
  }
  return { leafIndex, eventId: events[leafIndex]?.eventId ?? `leaf-${leafIndex}`, leafHashHex, merkleRootHex, treeDepth: depth, leafCount: events.length, siblings };
}

/** O(log N) 형제 해시 경로를 재연산해 개별 이벤트의 머클 포함 증명을 검증한다. */
export function verifyMerkleInclusionProof(
  proof: MerkleInclusionProof,
  options?: { readonly candidateEvent?: HumanInkLedgerEvent; readonly expectedMerkleRootHex?: string },
): MerkleInclusionVerificationResult {
  const root = options?.expectedMerkleRootHex ?? proof?.merkleRootHex;
  const expectedRootHex = typeof root === "string" ? root.toLowerCase() : "";
  if (!isValidProofShape(proof, expectedRootHex)) {
    return { valid: false, leafIndex: proof?.leafIndex ?? 0, eventId: proof?.eventId ?? "", leafHashMatchesEvent: false, computedRootHex: "", expectedRootHex, proofDepth: Array.isArray(proof?.siblings) ? proof.siblings.length : 0, reasonCode: "invalid-proof-shape" };
  }
  let leafHashMatchesEvent = true;
  let runningHash = proof.leafHashHex.toLowerCase();
  if (options?.candidateEvent) {
    let recomputedLeaf: string;
    try { recomputedLeaf = computeLeafHashHex(proof.leafIndex, options.candidateEvent); }
    catch { return { valid: false, leafIndex: proof.leafIndex, eventId: proof.eventId, leafHashMatchesEvent: false, computedRootHex: "", expectedRootHex, proofDepth: proof.siblings.length, reasonCode: "invalid-proof-shape" }; }
    leafHashMatchesEvent = recomputedLeaf === proof.leafHashHex.toLowerCase();
    runningHash = recomputedLeaf;
  }
  for (let i = 0; i < proof.siblings.length; i += 1) {
    const step = proof.siblings[i];
    if (step.duplicated && step.siblingHashHex.toLowerCase() !== runningHash) leafHashMatchesEvent = false;
    runningHash = step.position === "left" ? computeParentHashHex(step.siblingHashHex, runningHash) : computeParentHashHex(runningHash, step.siblingHashHex);
  }
  const matchesExpected = runningHash === expectedRootHex;
  const proofRootMatches = proof.merkleRootHex.toLowerCase() === expectedRootHex;
  const reasonCode: MerkleInclusionVerificationResult["reasonCode"] = !leafHashMatchesEvent ? "leaf-hash-mismatch" : !proofRootMatches ? "proof-root-mismatch" : !matchesExpected ? "root-mismatch" : "verified";
  return { valid: leafHashMatchesEvent && matchesExpected && proofRootMatches, leafIndex: proof.leafIndex, eventId: proof.eventId, leafHashMatchesEvent, computedRootHex: runningHash, expectedRootHex, proofDepth: proof.siblings.length, reasonCode };
}

/** Rights-BOM 오염 차단 Fail-Closed 게이트를 평가한다. */
export function evaluateRightsBomContaminationGate(events: readonly HumanInkLedgerEvent[]): RightsBomContaminationGateResult {
  copyValidatedEvents(events);
  const breakdown: Record<RightsBomLicenseClass, number> = { "human-ink-original": 0, "clean-procedural-cc0": 0, "byot-personal-render": 0, "external-unverified-raw-scan": 0 };
  const contaminatedIndices: number[] = [];
  const contaminatedEventIds: string[] = [];
  const mismatchedLicenseIndices: number[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    breakdown[ev.licenseClass] += 1;
    const isScanKind = ev.kind === "unverified-external-scan";
    const isScanLicense = ev.licenseClass === "external-unverified-raw-scan";
    if (isScanKind !== isScanLicense) mismatchedLicenseIndices.push(i);
    if (isScanKind || isScanLicense) {
      contaminatedIndices.push(i);
      contaminatedEventIds.push(ev.eventId);
    }
  }
  if (events.length === 0) {
    return {
      status: "blocked-empty", exportAllowed: false, failClosedTriggered: true,
      contaminatedEventCount: 0, contaminatedEventIds: [], contaminatedIndices: [], mismatchedLicenseIndices: [], licenseBreakdown: breakdown,
      gateReasonKo: "기록된 작화 과정 이벤트가 없어 Fail-Closed 정책으로 출고를 차단했습니다.",
      gateReasonEn: "Export blocked (Fail-Closed): no recorded provenance events exist in the ledger.",
      redistributionPolicyKo: "이벤트 추가는 표본 계산만 갱신합니다. 상업 출고에는 기존 Rights BOM 정본 검증이 필요합니다.",
      redistributionPolicyEn: "Adding events updates only this sample. Commercial delivery requires the existing authoritative Rights BOM check.",
      remediationStepsKo: ["표본 이벤트를 추가해 체크섬을 계산하세요. 실제 캔버스 기록은 연결하지 않습니다."],
      remediationStepsEn: ["Add a sample event to compute its checksum. Live canvas capture is not connected."],
    };
  }
  if (contaminatedIndices.length > 0) {
    return {
      status: "blocked-contaminated", exportAllowed: false, failClosedTriggered: true,
      contaminatedEventCount: contaminatedIndices.length, contaminatedEventIds, contaminatedIndices, mismatchedLicenseIndices, licenseBreakdown: breakdown,
      gateReasonKo: `자가 신고 태그에서 외부 미검증 스캔 ${contaminatedIndices.length}건을 찾았습니다. 이 예제는 상업 출고를 허가하지 않습니다.`,
      gateReasonEn: `Fail-Closed gate blocked export: detected ${contaminatedIndices.length} unverified external raw scan event(s).`,
      redistributionPolicyKo: "미검증 태그는 이용 권한을 확인할 수 없다는 뜻입니다. 태그나 레이어를 바꿔도 출고 승인이 생기지 않으며 기존 Rights BOM 정본 검증을 거쳐야 합니다.",
      redistributionPolicyEn: "Unverified tags do not establish usage rights. Changing tags or layers does not authorize delivery; the existing authoritative Rights BOM check remains required.",
      remediationStepsKo: [`오염 이벤트(${contaminatedEventIds.join(", ")})가 연결된 레이어를 분리·삭제하세요.`, "대체 소재의 이용 권한을 기존 Rights BOM 정본에서 확인하세요.", "이 표본의 체크섬 재계산은 권리 승인을 대신하지 않습니다."],
      remediationStepsEn: [`Remove or isolate layer(s) tied to contaminated event(s): ${contaminatedEventIds.join(", ")}.`, "Check replacement asset permissions in the existing authoritative Rights BOM.", "Recomputing this sample checksum does not grant rights clearance."],
    };
  }
  return {
    status: "blocked-unverified", exportAllowed: false, failClosedTriggered: true,
    contaminatedEventCount: 0, contaminatedEventIds: [], contaminatedIndices: [], mismatchedLicenseIndices: [], licenseBreakdown: breakdown,
    gateReasonKo: "자가 신고 태그에서 외부 스캔 표시는 없지만 저작자·라이선스는 확인하지 않았습니다. 상업 출고는 기존 Rights BOM 정본 검증이 필요합니다.",
    gateReasonEn: "No external-scan tag in this self-declared sample; authorship and licenses are unverified. Commercial delivery requires the existing authoritative Rights BOM check.",
    redistributionPolicyKo: "표본의 CC0·BYOT·직접 작화 태그는 이용 권한 증거가 아닙니다. 이 미리보기는 기존 권리 정본을 수정하거나 출고를 허가하지 않습니다.",
    redistributionPolicyEn: "CC0, BYOT, and human-ink labels are not license evidence. This preview neither changes authoritative rights records nor authorizes delivery.",
    remediationStepsKo: [], remediationStepsEn: [],
  };
}

function computeSummaryProof(events: readonly HumanInkLedgerEvent[], merkleRootHex: string, chainTipHex: string, metadata = ""): HumanInkSummaryProof {
  const total = events.length;
  let humanStrokeCount = 0; let proceduralCc0Count = 0; let bg3dPlacementCount = 0;
  let nonDestructiveFilterCount = 0; let unverifiedExternalScanCount = 0;
  let entropySum = 0; let velocityVarSum = 0;
  for (let i = 0; i < total; i += 1) {
    const ev = events[i];
    if (ev.kind === "human-pen-stroke") { humanStrokeCount += 1; entropySum += ev.pressureEntropyBits; velocityVarSum += ev.velocityVariance; }
    else if (ev.kind === "procedural-cc0-asset") proceduralCc0Count += 1;
    else if (ev.kind === "3d-bg-placement") bg3dPlacementCount += 1;
    else if (ev.kind === "non-destructive-filter") nonDestructiveFilterCount += 1;
    else unverifiedExternalScanCount += 1;
  }
  const pct = (c: number): number => (total === 0 ? 0 : roundTo((c / total) * 100, 1));
  const humanInkStrokeRatioPercent = pct(humanStrokeCount);
  const meanPressureEntropyBits = humanStrokeCount === 0 ? 0 : roundTo(entropySum / humanStrokeCount, 3);
  const meanVelocityVariance = humanStrokeCount === 0 ? 0 : roundTo(velocityVarSum / humanStrokeCount, 3);
  const summaryCommitmentHex = fnv1a64Hex(JSON.stringify([
    "summary-proof:v2", metadata, String(total), String(humanStrokeCount), String(proceduralCc0Count), String(bg3dPlacementCount),
    String(nonDestructiveFilterCount), String(unverifiedExternalScanCount), meanPressureEntropyBits.toFixed(3), meanVelocityVariance.toFixed(3), merkleRootHex, chainTipHex,
  ]));
  return {
    zeroPixelExposure: true, rawPsdIncluded: false, rawPixelBytesExposed: 0,
    totalEventCount: total, humanStrokeCount, proceduralCc0Count, bg3dPlacementCount, nonDestructiveFilterCount, unverifiedExternalScanCount,
    humanInkStrokeRatioPercent, proceduralCc0AssetRatioPercent: pct(proceduralCc0Count), bg3dPlacementRatioPercent: pct(bg3dPlacementCount),
    nonDestructiveFilterRatioPercent: pct(nonDestructiveFilterCount), unverifiedExternalRatioPercent: pct(unverifiedExternalScanCount),
    meanPressureEntropyBits, meanVelocityVariance, humanAuthorshipScore: 0, summaryCommitmentHex,
  };
}

/** 작화 이벤트 시퀀스로부터 FNV-1a 64-bit 해시 체인 + 이진 머클 트리 + O(log N) 포함 증명 원장을 구축한다. */
export function buildHumanInkMerkleLedger(events: readonly HumanInkLedgerEvent[], options?: BuildHumanInkLedgerOptions): HumanInkMerkleLedger {
  const normalizedEvents = copyValidatedEvents(events);
  if (options?.pageCount !== undefined && !Number.isFinite(options.pageCount)) throw new Error("Invalid page count");
  const metadata = {
    workId: options?.workId ?? "WORK-W58C-CUSTOM", scenarioId: options?.scenarioId ?? "custom",
    episodeTitleKo: options?.episodeTitleKo ?? "스튜디오 커스텀 원고", episodeTitleEn: options?.episodeTitleEn ?? "Studio Custom Manuscript",
    recordedAtIso: options?.recordedAtIso ?? "2026-11-25T12:00:00.000Z", pageCount: Math.max(1, Math.trunc(options?.pageCount ?? 1)),
  } as const;
  const metadataText = serializeLedgerMetadata(metadata);
  const eventDigests: string[] = []; const leafHashes: string[] = []; const chainHashes: string[] = [];
  let prevChain = GENESIS_CHAIN_HASH_HEX;
  for (let i = 0; i < normalizedEvents.length; i += 1) {
    const ev = normalizedEvents[i];
    const digest = computeEventDigestHex(ev);
    const leaf = computeLeafHashHex(i, ev);
    const chain = computeChainStepHashHex(prevChain, i, leaf);
    eventDigests.push(digest); leafHashes.push(leaf); chainHashes.push(chain); prevChain = chain;
  }
  const treeLevels = buildMerkleTreeLevels(leafHashes);
  const treeDepth = Math.max(0, treeLevels.length - 1);
  const merkleRootHex = treeLevels[treeLevels.length - 1]?.[0] ?? fnv1a64Hex("merkle-empty:v1");
  const chainTipHex = chainHashes.length > 0 ? chainHashes[chainHashes.length - 1] : GENESIS_CHAIN_HASH_HEX;
  return {
    schemaVersion: "toonstudio.human-ink-merkle-ledger.v1", hashAlgorithm: "FNV-1a-64-dual-u32",
    ...metadata,
    events: normalizedEvents, eventDigests, leafHashes, chainHashes, chainTipHex, treeLevels, treeDepth, merkleRootHex,
    inclusionProofs: normalizedEvents.map((_, idx) => extractInclusionProof(idx, normalizedEvents, treeLevels, merkleRootHex)),
    summaryProof: computeSummaryProof(normalizedEvents, merkleRootHex, chainTipHex, metadataText),
    rightsBomGate: evaluateRightsBomContaminationGate(normalizedEvents),
  };
}

function invalidLedgerReport(ledger: HumanInkMerkleLedger): LedgerVerificationReport {
  return {
    valid: false, tampered: true, merkleRootMatches: false, chainTipMatches: false, summaryCommitmentMatches: false, lengthMatches: false,
    committedMerkleRootHex: typeof ledger?.merkleRootHex === "string" ? ledger.merkleRootHex : "", recomputedMerkleRootHex: "",
    committedChainTipHex: typeof ledger?.chainTipHex === "string" ? ledger.chainTipHex : "", recomputedChainTipHex: "",
    tamperedLeafIndices: [], firstTamperedIndex: null, firstTamperedEventId: null, verifiedLeafCount: 0,
    detailKo: "원장 입력 계약 또는 리소스 한도를 벗어나 검증을 거부했습니다.", detailEn: "Ledger validation rejected invalid input or an exceeded resource limit.",
  };
}

/** 원장과 후보 이벤트의 체크섬·파생 메타데이터 일관성을 비교한다. 외부 서명자를 인증하지 않는다. */
export function verifyHumanInkLedger(committedLedger: HumanInkMerkleLedger, candidateEvents?: readonly HumanInkLedgerEvent[]): LedgerVerificationReport {
  let metadata: string;
  try {
    metadata = serializeLedgerMetadata(committedLedger);
    copyValidatedEvents(committedLedger.events); copyValidatedEvents(candidateEvents ?? committedLedger.events);
    if (!Array.isArray(committedLedger.leafHashes) || committedLedger.leafHashes.length > MAX_LEDGER_EVENTS) throw new Error("Invalid leaf count");
  }
  catch { return invalidLedgerReport(committedLedger); }
  const inspectedEvents = candidateEvents ?? committedLedger.events;
  const lengthMatches = inspectedEvents.length === committedLedger.leafHashes.length;
  const recomputedLeafHashes: string[] = []; const tamperedLeafIndices: number[] = [];
  let recomputedChainTip = GENESIS_CHAIN_HASH_HEX;
  for (let i = 0; i < inspectedEvents.length; i += 1) {
    const recomputedLeaf = computeLeafHashHex(i, inspectedEvents[i]);
    recomputedLeafHashes.push(recomputedLeaf);
    recomputedChainTip = computeChainStepHashHex(recomputedChainTip, i, recomputedLeaf);
    if (i >= committedLedger.leafHashes.length || recomputedLeaf !== committedLedger.leafHashes[i]) tamperedLeafIndices.push(i);
  }
  for (let missing = inspectedEvents.length; missing < committedLedger.leafHashes.length; missing += 1) tamperedLeafIndices.push(missing);

  const recomputedLevels = buildMerkleTreeLevels(recomputedLeafHashes);
  const recomputedMerkleRootHex = recomputedLevels[recomputedLevels.length - 1]?.[0] ?? fnv1a64Hex("merkle-empty:v1");
  const merkleRootMatches = recomputedMerkleRootHex === committedLedger.merkleRootHex;
  const chainTipMatches = recomputedChainTip === committedLedger.chainTipHex;
  const summaryCommitmentMatches = sameLedgerData(computeSummaryProof(inspectedEvents, recomputedMerkleRootHex, recomputedChainTip, metadata), committedLedger.summaryProof);
  const canonical = buildHumanInkMerkleLedger(committedLedger.events, committedLedger);
  const auxiliaryMatches = sameLedgerData(committedLedger.eventDigests, canonical.eventDigests) && sameLedgerData(committedLedger.chainHashes, canonical.chainHashes) && sameLedgerData(committedLedger.treeLevels, canonical.treeLevels) && sameLedgerData(committedLedger.inclusionProofs, canonical.inclusionProofs) && sameLedgerData(committedLedger.rightsBomGate, canonical.rightsBomGate) && committedLedger.treeDepth === canonical.treeDepth && committedLedger.schemaVersion === canonical.schemaVersion && committedLedger.hashAlgorithm === canonical.hashAlgorithm;
  const valid = auxiliaryMatches && lengthMatches && merkleRootMatches && chainTipMatches && summaryCommitmentMatches && tamperedLeafIndices.length === 0;
  const firstTamperedIndex = tamperedLeafIndices.length > 0 ? tamperedLeafIndices[0] : null;
  const firstTamperedEventId = firstTamperedIndex !== null ? (inspectedEvents[firstTamperedIndex]?.eventId ?? committedLedger.events[firstTamperedIndex]?.eventId ?? `leaf-${firstTamperedIndex}`) : null;

  return {
    valid, tampered: !valid, merkleRootMatches, chainTipMatches, summaryCommitmentMatches, lengthMatches,
    committedMerkleRootHex: committedLedger.merkleRootHex, recomputedMerkleRootHex,
    committedChainTipHex: committedLedger.chainTipHex, recomputedChainTipHex: recomputedChainTip,
    tamperedLeafIndices, firstTamperedIndex, firstTamperedEventId,
    verifiedLeafCount: Math.max(0, inspectedEvents.length - tamperedLeafIndices.length),
    detailKo: valid ? `리프 ${inspectedEvents.length}건과 머클 루트(${committedLedger.merkleRootHex})·해시 체인이 100% 일치합니다.` : firstTamperedIndex !== null ? `변조 적발: 리프 #${firstTamperedIndex}(${firstTamperedEventId})에서 해시 불일치가 발생해 머클 루트가 깨졌습니다.` : "원장 메타데이터 또는 요약 커밋 해시 불일치가 감지되었습니다.",
    detailEn: valid ? `Verified ${inspectedEvents.length} leaf events against Merkle root ${committedLedger.merkleRootHex} and sequential hash chain.` : firstTamperedIndex !== null ? `Tamper detected at leaf #${firstTamperedIndex} (${firstTamperedEventId}): Merkle root mismatch.` : "Ledger metadata or summary commitment mismatch detected.",
  };
}

/** 테스트·시연용으로 지정 리프의 필압·타임스탬프·출처·타일 해시 중 1단위를 불변 복사본에 변조 주입한다. */
export function injectSingleByteTamper(events: readonly HumanInkLedgerEvent[], targetIndex: number, mode: TamperMutationMode = "pressure-1bit"): SingleByteTamperResult {
  copyValidatedEvents(events);
  if (events.length === 0) {
    return { tamperedEvents: [], targetIndex: 0, mode, mutatedField: "none", beforeValue: "", afterValue: "", mutationSummaryKo: "변조할 이벤트가 없습니다.", mutationSummaryEn: "No event available to tamper." };
  }
  const safeIndex = clampNumber(Math.trunc(targetIndex), 0, events.length - 1);
  const original = events[safeIndex];
  let mutated: HumanInkLedgerEvent;
  let mutatedField: string; let beforeValue: string; let afterValue: string;

  if (mode === "pressure-1bit") {
    const nextP = original.pressureEntropyBits >= 3.999 ? roundTo(original.pressureEntropyBits - 0.0001, 4) : roundTo(original.pressureEntropyBits + 0.0001, 4);
    mutatedField = "pressureEntropyBits"; beforeValue = original.pressureEntropyBits.toFixed(4); afterValue = nextP.toFixed(4);
    mutated = { ...original, pressureEntropyBits: nextP };
  } else if (mode === "timestamp-1ms") {
    const nextTs = original.timestampMs + 1;
    mutatedField = "timestampMs"; beforeValue = `${original.timestampMs}ms`; afterValue = `${nextTs}ms`;
    mutated = { ...original, timestampMs: nextTs };
  } else if (mode === "source-spoof") {
    const nextLicense: RightsBomLicenseClass = original.licenseClass === "human-ink-original" ? "clean-procedural-cc0" : "human-ink-original";
    mutatedField = "licenseClass"; beforeValue = original.licenseClass; afterValue = nextLicense;
    mutated = { ...original, licenseClass: nextLicense };
  } else {
    const hex = original.tileDeltaHashHex.toLowerCase();
    const last = hex.charAt(hex.length - 1) || "0";
    const nextTileHash = `${hex.slice(0, -1)}${last === "f" ? "e" : ((parseInt(last, 16) + 1) & 0xf).toString(16)}`;
    mutatedField = "tileDeltaHashHex"; beforeValue = hex; afterValue = nextTileHash;
    mutated = { ...original, tileDeltaHashHex: nextTileHash };
  }
  return {
    tamperedEvents: events.map((ev, idx) => (idx === safeIndex ? mutated : ev)),
    targetIndex: safeIndex, mode, mutatedField, beforeValue, afterValue,
    mutationSummaryKo: `리프 #${safeIndex}(${original.eventId})의 ${mutatedField} 값을 ${beforeValue} → ${afterValue}로 1단위 변조했습니다.`,
    mutationSummaryEn: `Mutated leaf #${safeIndex} (${original.eventId}) ${mutatedField}: ${beforeValue} -> ${afterValue}.`,
  };
}

const C2PA_ACTION_MAP: Readonly<Record<HumanInkEventKind, string>> = {
  "human-pen-stroke": "c2pa.drawn", "procedural-cc0-asset": "c2pa.created", "3d-bg-placement": "c2pa.placed",
  "non-destructive-filter": "c2pa.filtered", "unverified-external-scan": "c2pa.opened",
};
const C2PA_SOURCE_MAP: Readonly<Record<HumanInkEventKind, string>> = {
  "human-pen-stroke": "http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt",
  "procedural-cc0-asset": "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
  "3d-bg-placement": "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
  "non-destructive-filter": "http://cv.iptc.org/newscodes/digitalsourcetype/minorHumanEdits",
  "unverified-external-scan": "urn:toonstudio:rights-bom:unverified-external-raw-scan",
};

/** 기존 API 이름을 유지한 unsigned 로컬 메모다. C2PA 매니페스트·서명·권리 승인을 생성하지 않는다. */
export function exportC2paHumanInkManifestJson(ledger: HumanInkMerkleLedger, verification?: LedgerVerificationReport, selectedLeafIndex = 0): string {
  const actualReport = verifyHumanInkLedger(ledger);
  if (!actualReport.valid) throw new Error("Cannot export an invalid ledger");
  if (verification && ([verification.valid, verification.tampered, verification.merkleRootMatches, verification.chainTipMatches, verification.summaryCommitmentMatches, verification.lengthMatches].some((value) => typeof value !== "boolean") || !Array.isArray(verification.tamperedLeafIndices) || verification.tamperedLeafIndices.length > MAX_LEDGER_EVENTS || verification.tamperedLeafIndices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= MAX_LEDGER_EVENTS))) throw new Error("Invalid verification report");
  const report = verification?.valid === false || verification?.tampered === true ? verification : actualReport;
  const clampedLeaf = ledger.inclusionProofs.length === 0 ? 0 : clampNumber(Math.trunc(selectedLeafIndex), 0, ledger.inclusionProofs.length - 1);
  const json = JSON.stringify({
    schemaVersion: "toonstudio.c2pa-human-ink-manifest.v1",
    c2paSpecReference: "Not a C2PA manifest; unsigned local JSON note",
    runtimeEvidence: { humanAuthorshipVerified: false, copyrightVerified: false, authorityRegistryChecked: false, c2paConformant: false, signed: false, zeroKnowledgeProof: false, canvasEventsCaptured: false, ledgerPersisted: false },
    claimGenerator: "ToonStudio Human Ink Provenance Ledger",
    cryptographicScope: CRYPTOGRAPHIC_SCOPE_PREVIEW,
    signingStatus: {
      hardwareX509Signed: false, tsaTimestamped: false,
      disclosureKo: "FNV-1a는 비암호학적 체크섬입니다. 서명·타임스탬프·C2PA 검증·저작자 인증·공증·권리 승인은 수행하지 않은 로컬 예제입니다.",
      disclosureEn: "FNV-1a is a non-cryptographic checksum. Local example without signatures, trusted timestamps, C2PA validation, author authentication, notarization, or rights clearance.",
    },
    manuscript: { workId: ledger.workId, scenarioId: ledger.scenarioId, episodeTitleKo: ledger.episodeTitleKo, episodeTitleEn: ledger.episodeTitleEn, recordedAtIso: ledger.recordedAtIso, pageCount: ledger.pageCount },
    assertions: {
      "c2pa.actions": {
        actions: ledger.events.map((ev) => ({
          action: C2PA_ACTION_MAP[ev.kind], when: new Date(ev.timestampMs).toISOString(),
          softwareAgent: `ToonStudio (${ev.toolLabel})`, digitalSourceType: C2PA_SOURCE_MAP[ev.kind],
          parameters: { eventId: ev.eventId, layerId: ev.layerId, licenseClass: ev.licenseClass, pressureEntropyBits: ev.pressureEntropyBits, velocityVariance: ev.velocityVariance, tileDeltaHashHex: ev.tileDeltaHashHex },
        })),
      },
      "toonstudio.human_ink_merkle_v1": {
        hashAlgorithm: ledger.hashAlgorithm, merkleRootHex: ledger.merkleRootHex, chainTipHex: ledger.chainTipHex,
        treeDepth: ledger.treeDepth, leafCount: ledger.events.length,
        zeroPixelExposure: ledger.summaryProof.zeroPixelExposure, rawPsdIncluded: ledger.summaryProof.rawPsdIncluded, rawPixelBytesExposed: ledger.summaryProof.rawPixelBytesExposed,
        summaryProof: ledger.summaryProof, selectedInclusionProof: ledger.inclusionProofs[clampedLeaf] ?? null,
        integrityVerification: { valid: report.valid, tampered: report.tampered, merkleRootMatches: report.merkleRootMatches, chainTipMatches: report.chainTipMatches, tamperedLeafIndices: report.tamperedLeafIndices },
      },
      "toonstudio.rights_bom_gate_v1": {
        status: ledger.rightsBomGate.status, exportAllowed: ledger.rightsBomGate.exportAllowed && report.valid,
        failClosedTriggered: ledger.rightsBomGate.failClosedTriggered || report.tampered,
        contaminatedEventCount: ledger.rightsBomGate.contaminatedEventCount, contaminatedEventIds: ledger.rightsBomGate.contaminatedEventIds,
        licenseBreakdown: ledger.rightsBomGate.licenseBreakdown,
        redistributionPolicyKo: ledger.rightsBomGate.redistributionPolicyKo, redistributionPolicyEn: ledger.rightsBomGate.redistributionPolicyEn,
      },
    },
  }, null, 2);
  assertText(json, MAX_NOTE_TEXT_UNITS);
  return json;
}

const STROKE_TOOLS: readonly { readonly label: string; readonly layerId: string; readonly noteKo: string; readonly noteEn: string }[] = [
  { label: "G-Pen 0.8mm", layerId: "L-INK-MAIN", noteKo: "인물 외곽 주선 직접 작화", noteEn: "Direct G-Pen character lineart" },
  { label: "Maru Pen 0.35mm", layerId: "L-INK-DETAIL", noteKo: "눈동자·속눈썹 세필 묘사", noteEn: "Fine Maru pen eye detail ink" },
  { label: "Fude Ink Brush", layerId: "L-INK-HAIR", noteKo: "머리카락 먹칠 강약 필압선", noteEn: "Variable-pressure hair ink brush" },
  { label: "Dry Ink Hatch", layerId: "L-SHADE-INK", noteKo: "의상 주름 수동 크로스해칭", noteEn: "Manual cloth fold cross-hatching" },
];

/** 기존 이벤트 목록 뒤에 결정론적 인간 펜 스트로크 이벤트를 1건 추가한다. */
export function createNextHumanPenStrokeEvent(existingEvents: readonly HumanInkLedgerEvent[]): HumanInkLedgerEvent {
  copyValidatedEvents(existingEvents);
  if (existingEvents.length >= MAX_LEDGER_EVENTS) throw new Error("Ledger event limit reached");
  const nextIndex = existingEvents.length;
  const prev = existingEvents[existingEvents.length - 1];
  const preset = STROKE_TOOLS[nextIndex % STROKE_TOOLS.length];
  const deltaTimeMs = 1350 + ((nextIndex * 437) % 1850);
  const timestampMs = prev ? prev.timestampMs + deltaTimeMs : BASE_EPOCH_MS;
  if (!Number.isSafeInteger(timestampMs) || timestampMs > 8_640_000_000_000_000) throw new Error("Next sample date exceeds range");
  const pressureSamples = Array.from({ length: 18 }, (_, k) => clampNumber(0.14 + (((k * 37 + nextIndex * 19) % 81) / 100), 0.05, 0.96));
  const speedSamples = Array.from({ length: 14 }, (_, k) => 95 + ((k * 53 + nextIndex * 29) % 240));
  const existingIds = new Set(existingEvents.map((event) => event.eventId));
  let suffix = nextIndex + 1;
  while (existingIds.has(`EVT-INK-${String(suffix).padStart(3, "0")}`)) suffix += 1;
  return {
    eventId: `EVT-INK-${String(suffix).padStart(3, "0")}`, sequenceIndex: nextIndex,
    kind: "human-pen-stroke", licenseClass: "human-ink-original", layerId: preset.layerId, toolLabel: preset.label,
    timestampMs, deltaTimeMs,
    pressureEntropyBits: computePressureEntropyBits(pressureSamples), velocityVariance: computeVelocityVariance(speedSamples),
    strokePointCount: 64 + ((nextIndex * 23) % 72),
    tileDeltaHashHex: computeTileDeltaHashHex(preset.layerId, [nextIndex % 6, (nextIndex * 2) % 8, 64, 64], `stroke-${nextIndex + 1}`),
    sourceNoteKo: preset.noteKo, sourceNoteEn: preset.noteEn,
  };
}

type SeedRow = readonly [string, HumanInkEventKind, RightsBomLicenseClass, string, string, number, number, number, number, readonly number[], string | undefined, string, string];
const buildSeedList = (rows: readonly SeedRow[], baseTs: number): readonly HumanInkLedgerEvent[] =>
  rows.map(([id, kind, licenseClass, layerId, toolLabel, deltaTimeMs, pressureEntropyBits, velocityVariance, strokePointCount, tiles, assetRefId, sourceNoteKo, sourceNoteEn], i) => ({
    eventId: id, sequenceIndex: i, kind, licenseClass, layerId, toolLabel,
    timestampMs: baseTs + i * 2400 + deltaTimeMs, deltaTimeMs, pressureEntropyBits, velocityVariance, strokePointCount,
    tileDeltaHashHex: computeTileDeltaHashHex(layerId, tiles, id), ...(assetRefId ? { assetRefId } : {}), sourceNoteKo, sourceNoteEn,
  }));

export const HUMAN_INK_SCENARIOS: readonly HumanInkScenarioSpec[] = [
  {
    id: "pure-human-ink", workId: "WORK-EP42-PURE-INK", nameKo: "인간 작화 태그 표본", nameEn: "Human-Tagged Sample",
    episodeTitleKo: "제42화 · 빗속의 묵선 (전컷 직접 작화)", episodeTitleEn: "Ep. 42 · Ink Lines in the Rain (Pure Hand-Drawn)",
    summaryKo: "인간 작화로 자가 신고한 고정 이벤트 8건의 예제입니다. 실제 작가·원고 기록은 아닙니다.",
    summaryEn: "Eight fixed human-tagged sample events; no actual author capture or Rights BOM clearance.",
    recordedAtIso: "2026-11-25T12:00:00.000Z", pageCount: 1,
    events: buildSeedList([
      ["PURE-001", "human-pen-stroke", "human-ink-original", "L-ROUGH", "2B Pencil", 820, 3.12, 0.44, 92, [0, 0, 128, 128], undefined, "1컷 인물 구도 연필 러프", "Panel 1 pencil rough gesture"],
      ["PURE-002", "human-pen-stroke", "human-ink-original", "L-INK-MAIN", "G-Pen 0.8mm", 1640, 3.48, 0.56, 118, [1, 0, 128, 128], undefined, "주인공 얼굴 윤곽 G펜 주선", "Lead character G-Pen contour"],
      ["PURE-003", "human-pen-stroke", "human-ink-original", "L-INK-EYE", "Maru Pen 0.35mm", 1210, 3.31, 0.39, 74, [1, 1, 64, 64], undefined, "눈동자·속눈썹 세필 강약 묘사", "Fine Maru pen eye expression"],
      ["PURE-004", "human-pen-stroke", "human-ink-original", "L-INK-HAIR", "Fude Ink Brush", 2150, 3.64, 0.67, 146, [2, 1, 128, 128], undefined, "젖은 머리카락 먹칠 필압 스트로크", "Wet hair ink brush sweep"],
      ["PURE-005", "human-pen-stroke", "human-ink-original", "L-INK-CLOTH", "G-Pen 0.6mm", 1890, 3.27, 0.48, 105, [2, 2, 128, 128], undefined, "코트 옷주름 직접 선화", "Direct coat fold lineart"],
      ["PURE-006", "human-pen-stroke", "human-ink-original", "L-HATCH", "Dry Ink Hatch", 1470, 2.96, 0.52, 88, [3, 2, 128, 64], undefined, "빗줄기·그림자 크로스해칭", "Manual rain & shadow hatching"],
      ["PURE-007", "human-pen-stroke", "human-ink-original", "L-SFX", "Calligraphy Brush", 1120, 3.55, 0.71, 63, [4, 1, 128, 128], undefined, "손글씨 효과음 직접 작화", "Hand-lettered SFX brush ink"],
      ["PURE-008", "human-pen-stroke", "human-ink-original", "L-FINISH", "White Opaque Pen", 960, 2.84, 0.41, 54, [1, 1, 64, 64], undefined, "빗방울 반사광 하이라이트 마감", "Hand-painted raindrop highlights"],
    ], BASE_EPOCH_MS),
  },
  {
    id: "hybrid-human-cc0-3d", workId: "WORK-EP43-HYBRID-CC0", nameKo: "인간·절차적·3D 태그 표본", nameEn: "Hybrid Self-Declared Tags",
    episodeTitleKo: "제43화 · 고딕 성당 회랑 (클린 하이브리드)", episodeTitleEn: "Ep. 43 · Gothic Cloister (Clean Hybrid)",
    summaryKo: "인간 작화 5건·절차적 자산 1건·3D 배경 1건·필터 1건의 자가 신고 태그 비율을 계산합니다. CC0·BYOT 이용 권한은 확인하지 않습니다.",
    summaryEn: "Fixed human, procedural, 3D, and filter tag samples; CC0 and BYOT permissions are unverified.",
    recordedAtIso: "2026-11-25T12:10:00.000Z", pageCount: 2,
    events: buildSeedList([
      ["HYB-001", "procedural-cc0-asset", "clean-procedural-cc0", "L-BG-ARCH", "Procedural Synth CC0", 410, 0, 0, 0, [0, 0, 256, 256], "BOM-CC0-GOTHIC-ARCH-48211", "절차적 CC0 고딕 창틀 아치 합성 배치", "Procedural CC0 gothic arch synthesis"],
      ["HYB-002", "3d-bg-placement", "byot-personal-render", "L-BG-3D", "Studio 3D Corridor LT", 980, 0, 0, 0, [0, 1, 256, 256], "BYOT-3D-CLOISTER-09", "작가 소유 BYOT 3D 복도 원근·LT 추출", "Personal BYOT 3D corridor LT render"],
      ["HYB-003", "human-pen-stroke", "human-ink-original", "L-INK-MAIN", "G-Pen 0.8mm", 1730, 3.42, 0.58, 124, [1, 1, 128, 128], undefined, "전경 인물 실루엣 직접 선화", "Foreground character G-Pen contour"],
      ["HYB-004", "human-pen-stroke", "human-ink-original", "L-INK-FACE", "Maru Pen 0.35mm", 1380, 3.19, 0.43, 86, [1, 1, 64, 64], undefined, "표정·시선 세필 펜터치", "Detailed facial ink penwork"],
      ["HYB-005", "human-pen-stroke", "human-ink-original", "L-INK-HAIR", "Fude Ink Brush", 1920, 3.57, 0.62, 132, [2, 1, 128, 128], undefined, "바람에 날리는 머리카락 먹칠", "Windblown hair ink sweep"],
      ["HYB-006", "human-pen-stroke", "human-ink-original", "L-INK-BG-OVER", "Dry Ink Hatch", 1510, 3.05, 0.49, 94, [2, 2, 128, 128], undefined, "3D 배경 위 수동 리터칭·석재 균열 가필", "Manual over-ink cracks over 3D BG"],
      ["HYB-007", "non-destructive-filter", "human-ink-original", "L-TONE-CURVE", "Non-Destructive Tone", 520, 0, 0, 0, [0, 0, 256, 256], undefined, "비파괴 역광 대비·명암 톤 커브 보정", "Non-destructive backlight tone curve"],
      ["HYB-008", "human-pen-stroke", "human-ink-original", "L-FINISH", "White Opaque Pen", 1090, 2.91, 0.38, 61, [1, 2, 64, 64], undefined, "스테인드글라스 림라이트 수동 가필", "Hand-drawn rim light highlights"],
    ], BASE_EPOCH_MS + 600000),
  },
  {
    id: "contaminated-external-scan", workId: "WORK-EP44-SCAN-BLOCK", nameKo: "외부 미검증 스캔 오염 차단", nameEn: "Unverified Scan Fail-Closed Test",
    episodeTitleKo: "제44화 · 오염 차단 테스트 (Fail-Closed)", episodeTitleEn: "Ep. 44 · Contamination Gate Test (Fail-Closed)",
    summaryKo: "외부 미검증 스캔 태그가 있는 고정 표본입니다. 실제 원고나 권리 정본의 출고 상태는 바꾸지 않습니다.",
    summaryEn: "Verifies Fail-Closed export blocking when an unverified external raw scan enters the layer stack.",
    recordedAtIso: "2026-11-25T12:20:00.000Z", pageCount: 1,
    events: buildSeedList([
      ["SCN-001", "human-pen-stroke", "human-ink-original", "L-ROUGH", "2B Pencil", 880, 3.08, 0.46, 84, [0, 0, 128, 128], undefined, "장면 레이아웃 연필 러프", "Scene layout pencil rough"],
      ["SCN-002", "procedural-cc0-asset", "clean-procedural-cc0", "L-BG-STONE", "Procedural Synth CC0", 420, 0, 0, 0, [0, 1, 256, 256], "BOM-CC0-STONE-TILE-11904", "절차적 CC0 석재 바닥 타일 배치", "Clean procedural CC0 stone tile"],
      ["SCN-003", "human-pen-stroke", "human-ink-original", "L-INK-MAIN", "G-Pen 0.8mm", 1620, 3.44, 0.55, 112, [1, 1, 128, 128], undefined, "주인공 전신 G펜 주선", "Full-body G-Pen character contour"],
      ["SCN-004", "unverified-external-scan", "external-unverified-raw-scan", "L-EXT-RAW-SCAN", "External Raw Import", 310, 0, 0, 0, [2, 0, 256, 256], "UNVERIFIED-EXT-SCAN-RAW-881", "출처 미검증 외부 스캔 원시 텍스처 유입(재배포 금지)", "Unverified external raw scan texture (redistribution barred)"],
      ["SCN-005", "human-pen-stroke", "human-ink-original", "L-INK-FACE", "Maru Pen 0.35mm", 1290, 3.22, 0.42, 79, [1, 1, 64, 64], undefined, "인물 표정 세필 마감", "Fine Maru pen face detail"],
      ["SCN-006", "human-pen-stroke", "human-ink-original", "L-INK-HAIR", "Fude Ink Brush", 1840, 3.51, 0.61, 128, [2, 1, 128, 128], undefined, "머리카락 먹칠 강약선", "Hair ink brushwork"],
      ["SCN-007", "non-destructive-filter", "human-ink-original", "L-TONE-CURVE", "Non-Destructive Tone", 490, 0, 0, 0, [0, 0, 256, 256], undefined, "비파괴 색조 대비 보정", "Non-destructive contrast curve"],
      ["SCN-008", "human-pen-stroke", "human-ink-original", "L-FINISH", "White Opaque Pen", 990, 2.89, 0.37, 58, [1, 2, 64, 64], undefined, "마감 하이라이트 스트로크", "Final highlight pen stroke"],
    ], BASE_EPOCH_MS + 1200000),
  },
];

export function getHumanInkScenario(scenarioId: HumanInkScenarioId): HumanInkScenarioSpec {
  return structuredClone(HUMAN_INK_SCENARIOS.find((item) => item.id === scenarioId) ?? HUMAN_INK_SCENARIOS[0]);
}

/** 3종 기본 시나리오 중 하나로부터 즉시 머클 원장을 생성한다. */
export function buildScenarioHumanInkLedger(scenarioId: HumanInkScenarioId): HumanInkMerkleLedger {
  const sc = getHumanInkScenario(scenarioId);
  return buildHumanInkMerkleLedger(sc.events, {
    workId: sc.workId, scenarioId: sc.id, episodeTitleKo: sc.episodeTitleKo,
    episodeTitleEn: sc.episodeTitleEn, recordedAtIso: sc.recordedAtIso, pageCount: sc.pageCount,
  });
}
