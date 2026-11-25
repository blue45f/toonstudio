/**
 * Wave 58C — 인간 작화 과정 영지식 머클 원장(Process-Proof Human Ink Ledger) & C2PA 하이브리드 저작권 방패 엔진.
 *
 * - 결정론적 FNV-1a 64-bit(이중 32비트 무부호 워드, BigInt 미사용) 해시 체인 + 이진 머클 트리
 * - 원본 PSD·픽셀 유출 0% 영지식 요약 증명(인간 작화 비율, 절차적 CC0 비율, 외부 미검증 스캔 건수)
 * - O(log N) 머클 포함 증명(Inclusion Proof) 및 임의 리프 1바이트 변조 100% 적발 검증기
 * - Rights-BOM 오염 차단 Fail-Closed 게이트 & C2PA Content Credentials 호환 JSON(로컬 미리보기 범위 정직 표기)
 */

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
  readonly status: "pass-clean" | "pass-hybrid-verified" | "blocked-contaminated" | "blocked-empty";
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
  const filtered = speeds.filter((v) => Number.isFinite(v) && v >= 0);
  if (filtered.length < 2) return 0;
  const mean = filtered.reduce((acc, v) => acc + v, 0) / filtered.length;
  if (mean <= 0.0001) return 0;
  const sumSq = filtered.reduce((acc, v) => acc + Math.pow((v - mean) / mean, 2), 0);
  return roundTo(clampNumber(sumSq / filtered.length, 0, 4), 4);
}

/** 원본 픽셀을 노출하지 않고 변경 타일 좌표·태그만으로 64-bit 타일 델타 해시를 생성한다. */
export const computeTileDeltaHashHex = (layerId: string, tileCoords: readonly number[], strokeSalt: string): string =>
  fnv1a64Hex(`tile-delta:v1|${layerId}|${tileCoords.map((n) => (Number.isFinite(n) ? Math.round(n) : 0)).join(",")}|${strokeSalt}`);

/** 단일 작화 이벤트를 모든 핵심 필드가 포함된 정규 문자열로 직렬화한다. */
export function serializeEventCanonical(event: HumanInkLedgerEvent): string {
  return [
    event.eventId, String(event.sequenceIndex), event.kind, event.licenseClass, event.layerId, event.toolLabel,
    String(Math.trunc(event.timestampMs)), String(Math.trunc(event.deltaTimeMs)),
    roundTo(event.pressureEntropyBits, 4).toFixed(4), roundTo(event.velocityVariance, 4).toFixed(4),
    String(Math.max(0, Math.trunc(event.strokePointCount))), event.tileDeltaHashHex.toLowerCase(),
    event.assetRefId ?? "", event.sourceNoteKo, event.sourceNoteEn,
  ].join("|");
}

export const computeEventDigestHex = (event: HumanInkLedgerEvent): string => fnv1a64Hex(`leaf-payload:v1|${serializeEventCanonical(event)}`);
export const computeLeafHashHex = (leafIndex: number, event: HumanInkLedgerEvent): string => fnv1a64Hex(`merkle-leaf:v1|${leafIndex}|${computeEventDigestHex(event)}`);
export const computeParentHashHex = (leftHex: string, rightHex: string): string => fnv1a64Hex(`merkle-node:v1|${leftHex.toLowerCase()}|${rightHex.toLowerCase()}`);
export const computeChainStepHashHex = (prevHex: string, leafIndex: number, leafHex: string): string => fnv1a64Hex(`chain-step:v1|${prevHex.toLowerCase()}|${leafIndex}|${leafHex.toLowerCase()}`);

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
  const expectedRootHex = (options?.expectedMerkleRootHex ?? proof.merkleRootHex).toLowerCase();
  const expectedDepth = proof.leafCount <= 1 ? 0 : Math.ceil(Math.log2(proof.leafCount));
  if (proof.leafIndex < 0 || proof.siblings.length !== expectedDepth) {
    return { valid: false, leafIndex: proof.leafIndex, eventId: proof.eventId, leafHashMatchesEvent: false, computedRootHex: "", expectedRootHex, proofDepth: proof.siblings.length, reasonCode: "invalid-proof-shape" };
  }
  let leafHashMatchesEvent = true;
  let runningHash = proof.leafHashHex.toLowerCase();
  if (options?.candidateEvent) {
    const recomputedLeaf = computeLeafHashHex(proof.leafIndex, options.candidateEvent);
    leafHashMatchesEvent = recomputedLeaf === proof.leafHashHex.toLowerCase();
    runningHash = recomputedLeaf;
  }
  for (let i = 0; i < proof.siblings.length; i += 1) {
    const step = proof.siblings[i];
    runningHash = step.position === "left" ? computeParentHashHex(step.siblingHashHex, runningHash) : computeParentHashHex(runningHash, step.siblingHashHex);
  }
  const matchesExpected = runningHash === expectedRootHex;
  const proofRootMatches = proof.merkleRootHex.toLowerCase() === expectedRootHex;
  const reasonCode: MerkleInclusionVerificationResult["reasonCode"] = !leafHashMatchesEvent ? "leaf-hash-mismatch" : !proofRootMatches ? "proof-root-mismatch" : !matchesExpected ? "root-mismatch" : "verified";
  return { valid: leafHashMatchesEvent && matchesExpected && proofRootMatches, leafIndex: proof.leafIndex, eventId: proof.eventId, leafHashMatchesEvent, computedRootHex: runningHash, expectedRootHex, proofDepth: proof.siblings.length, reasonCode };
}

/** Rights-BOM 오염 차단 Fail-Closed 게이트를 평가한다. */
export function evaluateRightsBomContaminationGate(events: readonly HumanInkLedgerEvent[]): RightsBomContaminationGateResult {
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
      redistributionPolicyKo: "최소 1개 이상의 검증된 인간 작화 또는 CC0 절차적 이벤트가 필요합니다.",
      redistributionPolicyEn: "At least one verified human-ink or CC0 procedural event is required.",
      remediationStepsKo: ["캔버스에서 인간 펜 스트로크를 기록한 뒤 원장을 다시 생성하세요."],
      remediationStepsEn: ["Record at least one human pen stroke and rebuild the ledger."],
    };
  }
  if (contaminatedIndices.length > 0) {
    return {
      status: "blocked-contaminated", exportAllowed: false, failClosedTriggered: true,
      contaminatedEventCount: contaminatedIndices.length, contaminatedEventIds, contaminatedIndices, mismatchedLicenseIndices, licenseBreakdown: breakdown,
      gateReasonKo: `출처 미검증 외부 원시 스캔 오염 ${contaminatedIndices.length}건이 감지되어 Fail-Closed 게이트가 출고를 차단했습니다.`,
      gateReasonEn: `Fail-Closed gate blocked export: detected ${contaminatedIndices.length} unverified external raw scan event(s).`,
      redistributionPolicyKo: "external-unverified-raw-scan 소스는 상업 연재·재배포가 금지됩니다. 해당 레이어를 제거하거나 절차적 CC0·직접 작화로 교체해야 출고가 열립니다.",
      redistributionPolicyEn: "external-unverified-raw-scan sources are barred from commercial redistribution. Remove or replace them with clean procedural CC0 or original human ink.",
      remediationStepsKo: [`오염 이벤트(${contaminatedEventIds.join(", ")})가 연결된 레이어를 분리·삭제하세요.`, "대체 배경·질감은 Rights-BOM 클린 절차적 CC0 합성기 또는 작가 본인 BYOT 3D 렌더로 재생성하세요.", "교체 후 머클 원장을 재봉인하고 Rights-BOM 통과 상태를 확인하세요."],
      remediationStepsEn: [`Remove or isolate layer(s) tied to contaminated event(s): ${contaminatedEventIds.join(", ")}.`, "Replace with clean procedural CC0 assets or verified personal BYOT 3D renders.", "Rebuild the Merkle ledger and verify Rights-BOM clearance before export."],
    };
  }
  const isHybrid = breakdown["clean-procedural-cc0"] > 0 || breakdown["byot-personal-render"] > 0;
  return {
    status: isHybrid ? "pass-hybrid-verified" : "pass-clean", exportAllowed: true, failClosedTriggered: false,
    contaminatedEventCount: 0, contaminatedEventIds: [], contaminatedIndices: [], mismatchedLicenseIndices: [], licenseBreakdown: breakdown,
    gateReasonKo: isHybrid ? "인간 작화 원본과 검증된 절차적 CC0·작가 본인 BYOT 렌더만 포함되어 상업 출고가 승인되었습니다." : "100% 인간 작화 원본 이벤트로 구성되어 Rights-BOM 오염 없이 상업 출고가 승인되었습니다.",
    gateReasonEn: isHybrid ? "Export approved: ledger contains only original human ink, clean procedural CC0, and verified personal BYOT renders." : "Export approved: 100% original human-ink events with zero Rights-BOM contamination.",
    redistributionPolicyKo: isHybrid ? "외부 미검증 스캔 오염 0건. Rights-BOM 라이선스 경계가 확인되어 상업 웹툰 연재·출고에 사용할 수 있습니다." : "외부 자산 의존성 0건. 작가 직접 작화 원고로 상업 연재·출판·C2PA 증명 첨부가 가능합니다.",
    redistributionPolicyEn: isHybrid ? "Zero external scan contamination. Rights-BOM boundaries cleared for commercial webtoon delivery." : "Zero external asset dependencies. Cleared for commercial publication with process-proof attestation.",
    remediationStepsKo: [], remediationStepsEn: [],
  };
}

function computeSummaryProof(events: readonly HumanInkLedgerEvent[], merkleRootHex: string, chainTipHex: string): HumanInkSummaryProof {
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
  const rawScore = humanInkStrokeRatioPercent * 0.55 + clampNumber(meanPressureEntropyBits / 3.2, 0, 1) * 28 + clampNumber(meanVelocityVariance / 0.45, 0, 1) * 17 - unverifiedExternalScanCount * 35;
  const summaryCommitmentHex = fnv1a64Hex([
    "summary-proof:v1", String(total), String(humanStrokeCount), String(proceduralCc0Count), String(bg3dPlacementCount),
    String(nonDestructiveFilterCount), String(unverifiedExternalScanCount), meanPressureEntropyBits.toFixed(3), meanVelocityVariance.toFixed(3), merkleRootHex, chainTipHex,
  ].join("|"));
  return {
    zeroPixelExposure: true, rawPsdIncluded: false, rawPixelBytesExposed: 0,
    totalEventCount: total, humanStrokeCount, proceduralCc0Count, bg3dPlacementCount, nonDestructiveFilterCount, unverifiedExternalScanCount,
    humanInkStrokeRatioPercent, proceduralCc0AssetRatioPercent: pct(proceduralCc0Count), bg3dPlacementRatioPercent: pct(bg3dPlacementCount),
    nonDestructiveFilterRatioPercent: pct(nonDestructiveFilterCount), unverifiedExternalRatioPercent: pct(unverifiedExternalScanCount),
    meanPressureEntropyBits, meanVelocityVariance, humanAuthorshipScore: total === 0 ? 0 : Math.round(clampNumber(rawScore, 0, 100)), summaryCommitmentHex,
  };
}

/** 작화 이벤트 시퀀스로부터 FNV-1a 64-bit 해시 체인 + 이진 머클 트리 + O(log N) 포함 증명 원장을 구축한다. */
export function buildHumanInkMerkleLedger(events: readonly HumanInkLedgerEvent[], options?: BuildHumanInkLedgerOptions): HumanInkMerkleLedger {
  const normalizedEvents = events.map((ev) => ({ ...ev }));
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
    workId: options?.workId ?? "WORK-W58C-CUSTOM", scenarioId: options?.scenarioId ?? "custom",
    episodeTitleKo: options?.episodeTitleKo ?? "스튜디오 커스텀 원고", episodeTitleEn: options?.episodeTitleEn ?? "Studio Custom Manuscript",
    recordedAtIso: options?.recordedAtIso ?? "2026-11-25T12:00:00.000Z", pageCount: Math.max(1, Math.trunc(options?.pageCount ?? 1)),
    events: normalizedEvents, eventDigests, leafHashes, chainHashes, chainTipHex, treeLevels, treeDepth, merkleRootHex,
    inclusionProofs: normalizedEvents.map((_, idx) => extractInclusionProof(idx, normalizedEvents, treeLevels, merkleRootHex)),
    summaryProof: computeSummaryProof(normalizedEvents, merkleRootHex, chainTipHex),
    rightsBomGate: evaluateRightsBomContaminationGate(normalizedEvents),
  };
}

/** 봉인된 원장과 후보 이벤트 목록을 대조해 1바이트 변조 여부·머클 루트 불일치·정확한 변조 리프 인덱스를 적발한다. */
export function verifyHumanInkLedger(committedLedger: HumanInkMerkleLedger, candidateEvents?: readonly HumanInkLedgerEvent[]): LedgerVerificationReport {
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
  const summaryCommitmentMatches = computeSummaryProof(inspectedEvents, recomputedMerkleRootHex, recomputedChainTip).summaryCommitmentHex === committedLedger.summaryProof.summaryCommitmentHex;
  const valid = lengthMatches && merkleRootMatches && chainTipMatches && summaryCommitmentMatches && tamperedLeafIndices.length === 0;
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

/** C2PA Content Credentials 호환 하이브리드 매니페스트 JSON을 생성한다(원본 픽셀·PSD 0바이트 노출). */
export function exportC2paHumanInkManifestJson(ledger: HumanInkMerkleLedger, verification?: LedgerVerificationReport, selectedLeafIndex = 0): string {
  const report = verification ?? verifyHumanInkLedger(ledger);
  const clampedLeaf = ledger.inclusionProofs.length === 0 ? 0 : clampNumber(Math.trunc(selectedLeafIndex), 0, ledger.inclusionProofs.length - 1);
  return JSON.stringify({
    schemaVersion: "toonstudio.c2pa-human-ink-manifest.v1",
    c2paSpecReference: "C2PA 2.1 Content Credentials Compatible Preview",
    claimGenerator: "ToonStudio Human Ink Provenance Ledger",
    cryptographicScope: CRYPTOGRAPHIC_SCOPE_PREVIEW,
    signingStatus: {
      hardwareX509Signed: false, tsaTimestamped: false,
      disclosureKo: "로컬 결정론적 FNV-1a 64-bit 머클 해시 미리보기입니다. 법적 공증 효력을 위한 하드웨어 X.509 서명 서버(KMS/TSA) 연동 전 단계임을 명시합니다.",
      disclosureEn: "Local deterministic FNV-1a 64-bit Merkle preview prior to hardware X.509 KMS/TSA signing server integration.",
    },
    manuscript: { workId: ledger.workId, scenarioId: ledger.scenarioId, episodeTitleKo: ledger.episodeTitleKo, episodeTitleEn: ledger.episodeTitleEn, recordedAtIso: ledger.recordedAtIso, pageCount: ledger.pageCount },
    assertions: {
      "c2pa.actions": {
        actions: ledger.events.map((ev) => ({
          action: C2PA_ACTION_MAP[ev.kind], when: new Date(ev.timestampMs).toISOString(),
          softwareAgent: `ToonStudio (${ev.toolLabel})`, digitalSourceType: C2PA_SOURCE_MAP[ev.kind],
          parameters: { eventId: ev.eventId, layerId: ev.layerId, licenseClass: ev.licenseClass, pressureEntropyBits: roundTo(ev.pressureEntropyBits, 4), velocityVariance: roundTo(ev.velocityVariance, 4), tileDeltaHashHex: ev.tileDeltaHashHex },
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
}

const STROKE_TOOLS: readonly { readonly label: string; readonly layerId: string; readonly noteKo: string; readonly noteEn: string }[] = [
  { label: "G-Pen 0.8mm", layerId: "L-INK-MAIN", noteKo: "인물 외곽 주선 직접 작화", noteEn: "Direct G-Pen character lineart" },
  { label: "Maru Pen 0.35mm", layerId: "L-INK-DETAIL", noteKo: "눈동자·속눈썹 세필 묘사", noteEn: "Fine Maru pen eye detail ink" },
  { label: "Fude Ink Brush", layerId: "L-INK-HAIR", noteKo: "머리카락 먹칠 강약 필압선", noteEn: "Variable-pressure hair ink brush" },
  { label: "Dry Ink Hatch", layerId: "L-SHADE-INK", noteKo: "의상 주름 수동 크로스해칭", noteEn: "Manual cloth fold cross-hatching" },
];

/** 기존 이벤트 목록 뒤에 결정론적 인간 펜 스트로크 이벤트를 1건 추가한다. */
export function createNextHumanPenStrokeEvent(existingEvents: readonly HumanInkLedgerEvent[]): HumanInkLedgerEvent {
  const nextIndex = existingEvents.length;
  const prev = existingEvents[existingEvents.length - 1];
  const preset = STROKE_TOOLS[nextIndex % STROKE_TOOLS.length];
  const deltaTimeMs = 1350 + ((nextIndex * 437) % 1850);
  const pressureSamples = Array.from({ length: 18 }, (_, k) => clampNumber(0.14 + (((k * 37 + nextIndex * 19) % 81) / 100), 0.05, 0.96));
  const speedSamples = Array.from({ length: 14 }, (_, k) => 95 + ((k * 53 + nextIndex * 29) % 240));
  return {
    eventId: `EVT-INK-${String(nextIndex + 1).padStart(3, "0")}`, sequenceIndex: nextIndex,
    kind: "human-pen-stroke", licenseClass: "human-ink-original", layerId: preset.layerId, toolLabel: preset.label,
    timestampMs: prev ? prev.timestampMs + deltaTimeMs : BASE_EPOCH_MS, deltaTimeMs,
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
    id: "pure-human-ink", workId: "WORK-EP42-PURE-INK", nameKo: "100% 인간 작화 원고", nameEn: "100% Human-Ink Manuscript",
    episodeTitleKo: "제42화 · 빗속의 묵선 (전컷 직접 작화)", episodeTitleEn: "Ep. 42 · Ink Lines in the Rain (Pure Hand-Drawn)",
    summaryKo: "외부 자산 없이 작가 펜 스트로크 8건만으로 구성된 완전 인간 작화 원고입니다.",
    summaryEn: "Eight direct stylus strokes with zero external assets and full Rights-BOM clearance.",
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
    id: "hybrid-human-cc0-3d", workId: "WORK-EP43-HYBRID-CC0", nameKo: "인간 작화 + CC0·3D 하이브리드", nameEn: "Human Ink + CC0 & 3D Hybrid",
    episodeTitleKo: "제43화 · 고딕 성당 회랑 (클린 하이브리드)", episodeTitleEn: "Ep. 43 · Gothic Cloister (Clean Hybrid)",
    summaryKo: "인간 작화 5건과 절차적 CC0 아치 1건, 작가 본인 BYOT 3D 배경 1건, 비파괴 톤 보정 1건으로 오염 0건 출고를 검증합니다.",
    summaryEn: "Five human strokes combined with clean procedural CC0, personal BYOT 3D background, and non-destructive filter.",
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
    summaryKo: "재배포 금지 외부 미검증 원시 스캔 1건이 섞인 원고에서 Rights-BOM 게이트가 출고를 즉시 차단하는지 점검합니다.",
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

export const getHumanInkScenario = (scenarioId: HumanInkScenarioId): HumanInkScenarioSpec =>
  HUMAN_INK_SCENARIOS.find((item) => item.id === scenarioId) ?? HUMAN_INK_SCENARIOS[0];

/** 3종 기본 시나리오 중 하나로부터 즉시 머클 원장을 생성한다. */
export function buildScenarioHumanInkLedger(scenarioId: HumanInkScenarioId): HumanInkMerkleLedger {
  const sc = getHumanInkScenario(scenarioId);
  return buildHumanInkMerkleLedger(sc.events, {
    workId: sc.workId, scenarioId: sc.id, episodeTitleKo: sc.episodeTitleKo,
    episodeTitleEn: sc.episodeTitleEn, recordedAtIso: sc.recordedAtIso, pageCount: sc.pageCount,
  });
}
