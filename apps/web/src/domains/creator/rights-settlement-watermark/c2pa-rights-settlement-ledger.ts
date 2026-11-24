/**
 * C2PA v2.1 원본 권리·자동 정산 로컬 원장 오케스트레이션 엔진.
 *
 * - 현재 구현(Local Verified Ledger): FIPS 180-4 SHA-256 해시 체인 로컬 원장,
 *   C2PA v2.1 매니페스트(Anti-AI 학습 거부 · Rights BOM 요약), 6직무 10,000 bps 엄격 검증,
 *   2차 창작 로열티 분배, 한국 원천징수 3.3% / 사업자 부가세 10% 자동 정산, 스마트 계약 호환 JSON-LD 스키마.
 * - 외부 연동 경계: 공인 X.509 C2PA CA 서명 및 퍼블릭 블록체인 온체인 브로드캐스트는
 *   로컬에서 실행하지 않으며 외부 어댑터 연동용 스키마 계약으로 명시 구분한다.
 */

// === 1. FIPS 180-4 SHA-256 & 정규화 JSON (동기 · 결정론적 · 무의존) ===

const SHA256_K: readonly number[] = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr32 = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

/** UTF-8 문자열의 FIPS 180-4 SHA-256 64자리 소문자 16진 다이제스트를 계산한다. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLen);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  const bitLen = bytes.length * 8;
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const st: [number, number, number, number, number, number, number, number] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      w[i] =
        ((w[i - 16] ?? 0) +
          (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) +
          (w[i - 7] ?? 0) +
          (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = st;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) + ((e & f) ^ (~e & g)) + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const t2 = ((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    st[0] = (st[0] + a) >>> 0; st[1] = (st[1] + b) >>> 0; st[2] = (st[2] + c) >>> 0; st[3] = (st[3] + d) >>> 0;
    st[4] = (st[4] + e) >>> 0; st[5] = (st[5] + f) >>> 0; st[6] = (st[6] + g) >>> 0; st[7] = (st[7] + h) >>> 0;
  }
  return st.map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** 객체 키를 재귀적으로 사전순 정렬한 결정론적 JSON 문자열을 생성한다. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const entries = Object.keys(rec)
    .sort()
    .filter((k) => rec[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(rec[k])}`);
  return `{${entries.join(",")}}`;
}

// === 2. 도메인 상수 · 타입 (10,000 bps · 2차 창작 · 한국 세금 · C2PA v2.1) ===

export const TOTAL_SHARE_BPS = 10_000 as const;
export const GENESIS_PREV_HASH = "0".repeat(64);
export const DEFAULT_LEDGER_TIMESTAMP_ISO = "2026-11-24T00:00:00Z";
export const C2PA_SPEC_VERSION = "2.1" as const;

export const CONTRIBUTOR_ROLES = [
  "original-story", "art-lead", "lineart", "coloring", "background", "lettering",
] as const;
export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number];

export interface ContributorRoleMeta {
  readonly role: ContributorRole; readonly labelKo: string; readonly labelEn: string;
}

export const CONTRIBUTOR_ROLE_CATALOG: Readonly<Record<ContributorRole, ContributorRoleMeta>> = Object.freeze({
  "original-story": { role: "original-story", labelKo: "원작", labelEn: "Original Story" },
  "art-lead": { role: "art-lead", labelKo: "작화", labelEn: "Art Lead" },
  lineart: { role: "lineart", labelKo: "선화", labelEn: "Lineart" },
  coloring: { role: "coloring", labelKo: "채색", labelEn: "Coloring" },
  background: { role: "background", labelKo: "배경", labelEn: "Background" },
  lettering: { role: "lettering", labelKo: "식자", labelEn: "Lettering" },
});

export type KoreanTaxClassification = "freelancer-withholding-3.3" | "business-vat-10";
export type BusinessVatMode = "exclusive-add-10" | "inclusive-extract-10";
export type DerivativeWorkCategory =
  | "merchandise-goods" | "drama-animation-adaptation" | "translation-localization" | "game-interactive" | "print-collectible";

export interface ContributorEquityEntry {
  readonly contributorId: string; readonly displayName: string; readonly role: ContributorRole;
  readonly shareBps: number; readonly taxClassification: KoreanTaxClassification;
  readonly externalPayoutRef?: string | null;
}

export interface SplitValidationIssue {
  readonly code: "EMPTY_CONTRIBUTORS" | "DUPLICATE_CONTRIBUTOR_ID" | "INVALID_NAME_OR_ID" | "INVALID_ROLE" | "INVALID_SHARE_BPS" | "TOTAL_BPS_MISMATCH";
  readonly contributorId?: string; readonly messageKo: string; readonly messageEn: string;
}

export interface ContributorSplitValidationResult {
  readonly valid: boolean; readonly totalBps: number; readonly expectedBps: typeof TOTAL_SHARE_BPS;
  readonly deltaBps: number; readonly roleCoverage: readonly ContributorRole[]; readonly issues: readonly SplitValidationIssue[];
}

export interface DerivativeRoyaltyRule {
  readonly category: DerivativeWorkCategory; readonly labelKo: string; readonly labelEn: string;
  readonly upstreamOriginalRoyaltyBps: number; readonly derivativeCreatorShareBps: number;
  readonly platformDistributionFeeBps: number; readonly requireOriginalCredit: boolean; readonly allowAiDerivative: boolean;
}

export interface ContributorTaxSettlementLine {
  readonly contributorId: string; readonly displayName: string; readonly role: ContributorRole;
  readonly shareBps: number; readonly sharePercentText: string; readonly taxClassification: KoreanTaxClassification;
  readonly allocatedGrossKrw: number; readonly supplyAmountKrw: number;
  readonly incomeTaxKrw: number; readonly localIncomeTaxKrw: number; readonly withholdingTaxTotalKrw: number;
  readonly vatKrw: number; readonly taxDirection: "deducted-withholding" | "added-vat" | "included-vat";
  readonly netPayoutKrw: number;
}

export interface KoreanSettlementStatement {
  readonly statementId: string; readonly settlementKind: "primary-episode" | "derivative-royalty";
  readonly workId: string; readonly periodLabel: string; readonly currency: "KRW"; readonly vatMode: BusinessVatMode;
  readonly grossRevenueKrw: number; readonly totalAllocatedGrossKrw: number;
  readonly totalWithholdingTaxKrw: number; readonly totalVatAddedKrw: number; readonly totalVatIncludedKrw: number;
  readonly totalNetPayoutKrw: number; readonly lines: readonly ContributorTaxSettlementLine[]; readonly statementSha256: string;
}

export interface DerivativeRoyaltySettlementResult {
  readonly rule: DerivativeRoyaltyRule; readonly derivativeGrossRevenueKrw: number;
  readonly upstreamOriginalPoolKrw: number; readonly derivativeCreatorPoolKrw: number; readonly platformFeePoolKrw: number;
  readonly upstreamTeamStatement: KoreanSettlementStatement;
}

export interface SettlementCapabilityBoundary {
  readonly executionMode: "local-verified-hash-chain";
  readonly onChainBroadcastExecuted: false;
  readonly x509CaSigned: false;
  readonly implementedLocallyKo: readonly string[];
  readonly implementedLocallyEn: readonly string[];
  readonly externalAdapterOptions: readonly {
    readonly adapterId: "evm-erc2981-royalty-splitter" | "kaia-krw-escrow-webhook" | "c2pa-x509-tsa-signer";
    readonly labelKo: string; readonly labelEn: string;
    readonly status: "schema-ready-not-connected"; readonly requiresExternalSigner: true;
  }[];
}

export interface SmartContractCompatibleJsonLd {
  readonly "@context": readonly ["https://schema.org", "https://toonstudio.cloud/ns/rights-settlement/v1"];
  readonly "@type": "RightsRoyaltySplitContractSchema"; readonly schemaVersion: "1.0.0";
  readonly deploymentStatus: "offchain-local-schema-only"; readonly onChainBroadcastExecuted: false;
  readonly workId: string; readonly episodeTitle: string; readonly bpsDenominator: typeof TOTAL_SHARE_BPS;
  readonly payees: readonly {
    readonly contributorId: string; readonly displayName: string; readonly role: ContributorRole;
    readonly shareBps: number; readonly taxClassification: KoreanTaxClassification; readonly externalPayoutRef: string | null;
  }[];
  readonly derivativeRoyaltyRules: readonly DerivativeRoyaltyRule[];
  readonly c2paManifestSha256: string; readonly schemaSha256: string;
}

export interface C2paRightsSettlementManifest {
  readonly "@context": readonly [
    "https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html",
    "https://schema.org",
    "https://toonstudio.cloud/ns/rights-settlement/v1",
  ];
  readonly "@type": "c2pa:Manifest"; readonly specVersion: typeof C2PA_SPEC_VERSION;
  readonly claimGenerator: string; readonly instanceId: string; readonly workId: string;
  readonly episodeTitle: string; readonly createdAtIso: string;
  readonly capabilityBoundary: SettlementCapabilityBoundary;
  readonly assertions: {
    readonly actions: {
      readonly label: "c2pa.actions";
      readonly data: {
        readonly actions: readonly {
          readonly action: "c2pa.created" | "toonstudio.rights.split.locked";
          readonly softwareAgent: string; readonly when: string;
          readonly parameters: Readonly<Record<string, string | number | boolean>>;
        }[];
      };
    };
    readonly trainingMining: {
      readonly label: "c2pa.training-mining";
      readonly data: {
        readonly entries: {
          readonly "c2pa.ai_training": { readonly use: "notAllowed" | "constrained" | "allowed" };
          readonly "c2pa.ai_generative_training": { readonly use: "notAllowed" | "constrained" | "allowed" };
          readonly "c2pa.data_mining": { readonly use: "notAllowed" | "constrained" | "allowed" };
        };
      };
    };
    readonly creativeWork: {
      readonly label: "stds.schema-org.CreativeWork";
      readonly data: {
        readonly "@context": "https://schema.org"; readonly "@type": "CreativeWork";
        readonly identifier: string; readonly name: string; readonly dateCreated: string;
        readonly author: readonly { readonly "@type": "Person"; readonly identifier: string; readonly name: string; readonly jobTitle: ContributorRole }[];
      };
    };
    readonly rightsSettlement: {
      readonly label: "toonstudio.rights-settlement.v1";
      readonly data: {
        readonly totalShareBps: number; readonly contributorCount: number; readonly splitDigestSha256: string;
        readonly rightsBomDigestSha256: string; readonly derivativeRuleCount: number; readonly aiTrainingOptOutEnforced: boolean;
      };
    };
  };
  readonly claimSha256: string; readonly manifestSha256: string;
}

export type LedgerEventType = "genesis-manifest" | "settlement-payout" | "derivative-royalty" | "split-amendment" | "watermark-seal";

export interface RightsSettlementLedgerBlock {
  readonly index: number; readonly timestampIso: string; readonly eventType: LedgerEventType;
  readonly prevHash: string; readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadSha256: string; readonly blockHash: string;
}

export interface RightsSettlementLedger {
  readonly ledgerId: string; readonly workId: string; readonly episodeTitle: string; readonly createdAtIso: string;
  readonly capabilityBoundary: SettlementCapabilityBoundary;
  readonly activeContributors: readonly ContributorEquityEntry[];
  readonly derivativeRules: readonly DerivativeRoyaltyRule[];
  readonly manifest: C2paRightsSettlementManifest;
  readonly smartContractJsonLd: SmartContractCompatibleJsonLd;
  readonly blocks: readonly RightsSettlementLedgerBlock[];
}

export type LedgerVerificationIssueCode =
  | "EMPTY_LEDGER" | "GENESIS_PREV_HASH_INVALID" | "INDEX_SEQUENCE_INVALID" | "PREV_HASH_LINK_BROKEN"
  | "PAYLOAD_HASH_MISMATCH" | "BLOCK_HASH_MISMATCH" | "MANIFEST_CLAIM_HASH_MISMATCH"
  | "MANIFEST_SEAL_HASH_MISMATCH" | "CONTRACT_SCHEMA_HASH_MISMATCH" | "SPLIT_BPS_NOT_10000" | "DERIVATIVE_RULE_BPS_INVALID";

export interface LedgerVerificationIssue {
  readonly code: LedgerVerificationIssueCode; readonly blockIndex?: number; readonly messageKo: string; readonly messageEn: string;
}

export interface RightsSettlementLedgerVerification {
  readonly valid: boolean; readonly intactHashChain: boolean; readonly manifestIntact: boolean;
  readonly splitsValid10000Bps: boolean; readonly checkedBlocks: number;
  readonly tamperedBlockIndices: readonly number[]; readonly headHash: string; readonly issues: readonly LedgerVerificationIssue[];
}

export interface CreateRightsSettlementLedgerInput {
  readonly workId: string; readonly episodeTitle: string; readonly contributors: readonly ContributorEquityEntry[];
  readonly derivativeRules?: readonly DerivativeRoyaltyRule[]; readonly rightsBomDigestSha256?: string;
  readonly aiTrainingPolicy?: "notAllowed" | "constrained" | "allowed"; readonly createdAtIso?: string; readonly softwareAgent?: string;
}

// === 3. 기본 카탈로그 (2차 창작 규칙 · 로컬 vs 외부 경계) ===

export const DEFAULT_DERIVATIVE_ROYALTY_RULES: readonly DerivativeRoyaltyRule[] = Object.freeze([
  Object.freeze({ category: "merchandise-goods", labelKo: "굿즈·머천다이즈", labelEn: "Merchandise & Goods", upstreamOriginalRoyaltyBps: 1_500, derivativeCreatorShareBps: 6_500, platformDistributionFeeBps: 2_000, requireOriginalCredit: true, allowAiDerivative: false }),
  Object.freeze({ category: "drama-animation-adaptation", labelKo: "영상화·애니메이션·드라마", labelEn: "Drama & Animation Adaptation", upstreamOriginalRoyaltyBps: 1_200, derivativeCreatorShareBps: 7_300, platformDistributionFeeBps: 1_500, requireOriginalCredit: true, allowAiDerivative: false }),
  Object.freeze({ category: "translation-localization", labelKo: "해외 번역·로컬라이징", labelEn: "Translation & Localization", upstreamOriginalRoyaltyBps: 5_500, derivativeCreatorShareBps: 2_500, platformDistributionFeeBps: 2_000, requireOriginalCredit: true, allowAiDerivative: false }),
  Object.freeze({ category: "game-interactive", labelKo: "게임·인터랙티브 IP", labelEn: "Game & Interactive IP", upstreamOriginalRoyaltyBps: 1_000, derivativeCreatorShareBps: 7_000, platformDistributionFeeBps: 2_000, requireOriginalCredit: true, allowAiDerivative: false }),
  Object.freeze({ category: "print-collectible", labelKo: "단행본·인쇄 출판", labelEn: "Print & Collectible Edition", upstreamOriginalRoyaltyBps: 1_800, derivativeCreatorShareBps: 6_200, platformDistributionFeeBps: 2_000, requireOriginalCredit: true, allowAiDerivative: false }),
]);

export const LOCAL_SETTLEMENT_CAPABILITY_BOUNDARY: SettlementCapabilityBoundary = Object.freeze({
  executionMode: "local-verified-hash-chain",
  onChainBroadcastExecuted: false,
  x509CaSigned: false,
  implementedLocallyKo: Object.freeze([
    "C2PA v2.1 매니페스트(Anti-AI 학습 거부·Rights BOM 다이제스트) 로컬 생성 및 해시 검증",
    "SHA-256 append-only 해시 체인 원장 및 블록 변조 감지",
    "6개 직무 10,000 bps 엄격 검증 · 2차 창작 로열티 · 한국 원천징수 3.3% / 사업자 부가세 10% 자동 정산",
    "외부 스마트 계약(ERC-2981) 호환 JSON-LD 스키마 직렬화",
  ]),
  implementedLocallyEn: Object.freeze([
    "Local C2PA v2.1 manifest (Anti-AI training opt-out & Rights BOM digest) build and hash verification",
    "Append-only SHA-256 hash chain ledger with block tamper detection",
    "Strict 10,000 bps 6-role equity validation, derivative royalties, and KR 3.3% / 10% tax settlement",
    "Smart-contract-compatible (ERC-2981) JSON-LD schema export",
  ]),
  externalAdapterOptions: Object.freeze([
    Object.freeze({ adapterId: "evm-erc2981-royalty-splitter", labelKo: "EVM ERC-2981 로열티 분배 컨트랙트 어댑터 (외부 연동 옵션 · 현재 미연결)", labelEn: "EVM ERC-2981 Royalty Splitter Adapter (External Optional · Not Connected)", status: "schema-ready-not-connected", requiresExternalSigner: true }),
    Object.freeze({ adapterId: "kaia-krw-escrow-webhook", labelKo: "정산 대행/에스크로 API 웹훅 어댑터 (외부 연동 옵션 · 현재 미연결)", labelEn: "KRW Settlement Escrow Webhook Adapter (External Optional · Not Connected)", status: "schema-ready-not-connected", requiresExternalSigner: true }),
    Object.freeze({ adapterId: "c2pa-x509-tsa-signer", labelKo: "공인 X.509 C2PA CA + 타임스탬프 기관(TSA) 서명기 (외부 연동 옵션 · 현재 미연결)", labelEn: "Public X.509 C2PA CA & TSA Signer (External Optional · Not Connected)", status: "schema-ready-not-connected", requiresExternalSigner: true }),
  ]),
});

// === 4. 지분(10,000 bps) · 2차 창작 규칙 검증 & 한국 세무 자동 정산 ===

/** 다직무 기여자 지분 합계가 정확히 10,000 bps(100.00%)인지 엄격하게 검증한다. */
export function validateContributorSplits(contributors: readonly ContributorEquityEntry[]): ContributorSplitValidationResult {
  const issues: SplitValidationIssue[] = [];
  if (contributors.length === 0) {
    issues.push({ code: "EMPTY_CONTRIBUTORS", messageKo: "최소 1명 이상의 기여자 지분이 필요합니다.", messageEn: "At least one contributor split is required." });
    return { valid: false, totalBps: 0, expectedBps: TOTAL_SHARE_BPS, deltaBps: -TOTAL_SHARE_BPS, roleCoverage: [], issues };
  }
  const seenIds = new Set<string>();
  const roles = new Set<ContributorRole>();
  let totalBps = 0;

  for (const entry of contributors) {
    const id = entry.contributorId.trim();
    const name = entry.displayName.trim();
    if (!id || !name) {
      issues.push({ code: "INVALID_NAME_OR_ID", contributorId: entry.contributorId, messageKo: "기여자 ID와 이름은 비어 있을 수 없습니다.", messageEn: "Contributor ID and display name must be non-empty." });
    } else if (seenIds.has(id)) {
      issues.push({ code: "DUPLICATE_CONTRIBUTOR_ID", contributorId: id, messageKo: `중복된 기여자 ID(${id})가 있습니다.`, messageEn: `Duplicate contributor ID (${id}) detected.` });
    } else {
      seenIds.add(id);
    }
    if (!(CONTRIBUTOR_ROLES as readonly string[]).includes(entry.role)) {
      issues.push({ code: "INVALID_ROLE", contributorId: id || entry.contributorId, messageKo: `지원하지 않는 직무(${String(entry.role)})입니다.`, messageEn: `Unsupported contributor role (${String(entry.role)}).` });
    } else {
      roles.add(entry.role);
    }
    if (!Number.isInteger(entry.shareBps) || entry.shareBps <= 0 || entry.shareBps > TOTAL_SHARE_BPS) {
      issues.push({ code: "INVALID_SHARE_BPS", contributorId: id || entry.contributorId, messageKo: `지분(${String(entry.shareBps)} bps)은 1~10,000 사이의 정수여야 합니다.`, messageEn: `Share (${String(entry.shareBps)} bps) must be an integer between 1 and 10,000.` });
    } else {
      totalBps += entry.shareBps;
    }
  }

  const deltaBps = totalBps - TOTAL_SHARE_BPS;
  if (deltaBps !== 0) {
    const dirKo = deltaBps > 0 ? `+${deltaBps} bps 초과` : `${Math.abs(deltaBps)} bps 부족`;
    const dirEn = deltaBps > 0 ? `over by +${deltaBps} bps` : `short by ${Math.abs(deltaBps)} bps`;
    issues.push({
      code: "TOTAL_BPS_MISMATCH",
      messageKo: `전체 지분 합계가 ${totalBps.toLocaleString("ko-KR")} bps입니다. 정확히 10,000 bps(100.00%)여야 합니다 (${dirKo}).`,
      messageEn: `Total equity is ${totalBps.toLocaleString("en-US")} bps; it must equal exactly 10,000 bps (${dirEn}).`,
    });
  }
  return { valid: issues.length === 0, totalBps, expectedBps: TOTAL_SHARE_BPS, deltaBps, roleCoverage: [...roles], issues };
}

/** 2차 창작 로열티 분배 규칙 3요소 합계가 정확히 10,000 bps인지 검증한다. */
export function validateDerivativeRoyaltyRule(rule: DerivativeRoyaltyRule): { readonly valid: boolean; readonly totalBps: number; readonly deltaBps: number } {
  const parts = [rule.upstreamOriginalRoyaltyBps, rule.derivativeCreatorShareBps, rule.platformDistributionFeeBps];
  const integersOk = parts.every((v) => Number.isInteger(v) && v >= 0 && v <= TOTAL_SHARE_BPS);
  const totalBps = parts.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  return { valid: integersOk && totalBps === TOTAL_SHARE_BPS, totalBps, deltaBps: totalBps - TOTAL_SHARE_BPS };
}

/** 최대 잔여법(Hamilton)으로 원 단위 배분 합계가 총 매출액과 1원 오차 없이 일치하도록 계산한다. */
function allocateIntegerKrwByBps(grossKrw: number, weights: readonly { readonly id: string; readonly bps: number }[]): readonly number[] {
  const safeGross = Math.max(0, Math.round(Number.isFinite(grossKrw) ? grossKrw : 0));
  const raw = weights.map((item, idx) => {
    const num = safeGross * item.bps;
    return { idx, id: item.id, bps: item.bps, floorVal: Math.floor(num / TOTAL_SHARE_BPS), rem: num % TOTAL_SHARE_BPS };
  });
  let remaining = safeGross - raw.reduce((s, r) => s + r.floorVal, 0);
  const order = [...raw].sort((a, b) => (b.rem !== a.rem ? b.rem - a.rem : b.bps !== a.bps ? b.bps - a.bps : a.id.localeCompare(b.id)));
  const out = raw.map((r) => r.floorVal);
  for (let i = 0; i < order.length && remaining > 0; i += 1) {
    const t = order[i];
    if (t) { out[t.idx] = (out[t.idx] ?? 0) + 1; remaining -= 1; }
  }
  return out;
}

/** 프리랜서 원천징수 3.3%(소득세 3.0% + 지방소득세 0.3%) / 사업자 부가세 10% 정산 명세서를 계산한다. */
export function calculateKoreanTaxSettlement(params: {
  readonly workId: string; readonly periodLabel: string; readonly grossRevenueKrw: number;
  readonly contributors: readonly ContributorEquityEntry[];
  readonly settlementKind?: "primary-episode" | "derivative-royalty"; readonly vatMode?: BusinessVatMode;
}): KoreanSettlementStatement {
  const validation = validateContributorSplits(params.contributors);
  if (!validation.valid) throw new Error(`정산 차단: ${validation.issues[0]?.messageKo ?? "지분 합계가 10,000 bps와 일치하지 않습니다."}`);
  if (!Number.isFinite(params.grossRevenueKrw) || params.grossRevenueKrw < 0) throw new Error("정산 차단: 총 매출액은 0 이상의 유한한 숫자여야 합니다.");

  const grossRevenueKrw = Math.round(params.grossRevenueKrw);
  const vatMode: BusinessVatMode = params.vatMode ?? "exclusive-add-10";
  const settlementKind = params.settlementKind ?? "primary-episode";
  const allocated = allocateIntegerKrwByBps(grossRevenueKrw, params.contributors.map((c) => ({ id: c.contributorId, bps: c.shareBps })));

  let totalAllocatedGrossKrw = 0;
  let totalWithholdingTaxKrw = 0;
  let totalVatAddedKrw = 0;
  let totalVatIncludedKrw = 0;
  let totalNetPayoutKrw = 0;

  const lines: ContributorTaxSettlementLine[] = params.contributors.map((c, idx) => {
    const allocatedGrossKrw = allocated[idx] ?? 0;
    totalAllocatedGrossKrw += allocatedGrossKrw;
    const base = {
      contributorId: c.contributorId, displayName: c.displayName, role: c.role,
      shareBps: c.shareBps, sharePercentText: `${(c.shareBps / 100).toFixed(2)}%`,
      taxClassification: c.taxClassification, allocatedGrossKrw,
    };

    if (c.taxClassification === "freelancer-withholding-3.3") {
      const incomeTaxKrw = Math.floor((allocatedGrossKrw * 300) / TOTAL_SHARE_BPS);
      const localIncomeTaxKrw = Math.floor(incomeTaxKrw / 10);
      const withholdingTaxTotalKrw = incomeTaxKrw + localIncomeTaxKrw;
      const netPayoutKrw = allocatedGrossKrw - withholdingTaxTotalKrw;
      totalWithholdingTaxKrw += withholdingTaxTotalKrw;
      totalNetPayoutKrw += netPayoutKrw;
      return { ...base, supplyAmountKrw: allocatedGrossKrw, incomeTaxKrw, localIncomeTaxKrw, withholdingTaxTotalKrw, vatKrw: 0, taxDirection: "deducted-withholding", netPayoutKrw };
    }
    if (vatMode === "inclusive-extract-10") {
      const supplyAmountKrw = Math.round(allocatedGrossKrw / 1.1);
      const vatKrw = allocatedGrossKrw - supplyAmountKrw;
      totalVatIncludedKrw += vatKrw;
      totalNetPayoutKrw += allocatedGrossKrw;
      return { ...base, supplyAmountKrw, incomeTaxKrw: 0, localIncomeTaxKrw: 0, withholdingTaxTotalKrw: 0, vatKrw, taxDirection: "included-vat", netPayoutKrw: allocatedGrossKrw };
    }
    const vatKrw = Math.floor((allocatedGrossKrw * 1_000) / TOTAL_SHARE_BPS);
    const netPayoutKrw = allocatedGrossKrw + vatKrw;
    totalVatAddedKrw += vatKrw;
    totalNetPayoutKrw += netPayoutKrw;
    return { ...base, supplyAmountKrw: allocatedGrossKrw, incomeTaxKrw: 0, localIncomeTaxKrw: 0, withholdingTaxTotalKrw: 0, vatKrw, taxDirection: "added-vat", netPayoutKrw };
  });

  const core = {
    settlementKind, workId: params.workId.trim(), periodLabel: params.periodLabel.trim(), currency: "KRW" as const,
    vatMode, grossRevenueKrw, totalAllocatedGrossKrw, totalWithholdingTaxKrw, totalVatAddedKrw, totalVatIncludedKrw, totalNetPayoutKrw, lines,
  };
  const statementSha256 = sha256Hex(canonicalizeJson(core));
  return { statementId: `stmt-${statementSha256.slice(0, 12)}`, ...core, statementSha256 };
}

/** 2차 창작 매출을 원본 팀 로열티 / 2차 제작자 / 플랫폼 수수료로 분배하고 원본 팀 몫을 직무별 정산한다. */
export function calculateDerivativeRoyaltySettlement(params: {
  readonly workId: string; readonly periodLabel: string; readonly derivativeGrossRevenueKrw: number;
  readonly rule: DerivativeRoyaltyRule; readonly contributors: readonly ContributorEquityEntry[]; readonly vatMode?: BusinessVatMode;
}): DerivativeRoyaltySettlementResult {
  const ruleCheck = validateDerivativeRoyaltyRule(params.rule);
  if (!ruleCheck.valid) throw new Error(`2차 창작 분배 규칙 오류: 합계가 ${ruleCheck.totalBps} bps입니다 (10,000 bps 필수).`);
  const safeGross = Math.max(0, Math.round(Number.isFinite(params.derivativeGrossRevenueKrw) ? params.derivativeGrossRevenueKrw : 0));
  const [upstreamOriginalPoolKrw = 0, derivativeCreatorPoolKrw = 0, platformFeePoolKrw = 0] = allocateIntegerKrwByBps(safeGross, [
    { id: "01-upstream", bps: params.rule.upstreamOriginalRoyaltyBps },
    { id: "02-derivative", bps: params.rule.derivativeCreatorShareBps },
    { id: "03-platform", bps: params.rule.platformDistributionFeeBps },
  ]);
  const upstreamTeamStatement = calculateKoreanTaxSettlement({
    workId: params.workId, periodLabel: `${params.periodLabel} · ${params.rule.labelKo}`,
    grossRevenueKrw: upstreamOriginalPoolKrw, contributors: params.contributors, settlementKind: "derivative-royalty", vatMode: params.vatMode,
  });
  return { rule: params.rule, derivativeGrossRevenueKrw: safeGross, upstreamOriginalPoolKrw, derivativeCreatorPoolKrw, platformFeePoolKrw, upstreamTeamStatement };
}

// === 5. C2PA v2.1 매니페스트 · JSON-LD 스키마 · SHA-256 해시 체인 원장 ===

function computeManifestClaimDigest(m: Omit<C2paRightsSettlementManifest, "claimSha256" | "manifestSha256">): string {
  return sha256Hex(canonicalizeJson({
    specVersion: m.specVersion, claimGenerator: m.claimGenerator, instanceId: m.instanceId,
    workId: m.workId, episodeTitle: m.episodeTitle, createdAtIso: m.createdAtIso,
    capabilityBoundary: m.capabilityBoundary, assertions: m.assertions,
  }));
}

function createLedgerBlock(params: {
  readonly index: number; readonly timestampIso: string; readonly eventType: LedgerEventType;
  readonly prevHash: string; readonly payload: Readonly<Record<string, unknown>>;
}): RightsSettlementLedgerBlock {
  const payloadSha256 = sha256Hex(canonicalizeJson(params.payload));
  const blockHash = sha256Hex(canonicalizeJson({
    index: params.index, timestampIso: params.timestampIso, eventType: params.eventType, prevHash: params.prevHash, payloadSha256,
  }));
  return { ...params, payloadSha256, blockHash };
}

/** C2PA v2.1 매니페스트 + SHA-256 제네시스 블록 + 스마트 계약 호환 JSON-LD 로컬 원장을 생성한다. */
export function createRightsSettlementLedger(input: CreateRightsSettlementLedgerInput): RightsSettlementLedger {
  const splitCheck = validateContributorSplits(input.contributors);
  if (!splitCheck.valid) throw new Error(`원장 생성 차단: ${splitCheck.issues[0]?.messageKo ?? "지분 10,000 bps 검증 실패"}`);
  const derivativeRules = input.derivativeRules ?? DEFAULT_DERIVATIVE_ROYALTY_RULES;
  for (const rule of derivativeRules) {
    const check = validateDerivativeRoyaltyRule(rule);
    if (!check.valid) throw new Error(`원장 생성 차단: 2차 창작 규칙(${rule.category}) 합계가 ${check.totalBps} bps입니다.`);
  }

  const createdAtIso = input.createdAtIso ?? DEFAULT_LEDGER_TIMESTAMP_ISO;
  const claimGenerator = input.softwareAgent ?? "ToonStudio/2.6 C2PA-2.1-RightsSettlement";
  const aiPolicy = input.aiTrainingPolicy ?? "notAllowed";
  const workId = input.workId.trim();
  const episodeTitle = input.episodeTitle.trim();
  const splitDigestSha256 = sha256Hex(canonicalizeJson(input.contributors));
  const rightsBomDigestSha256 = input.rightsBomDigestSha256 ?? sha256Hex(`empty-bom|${workId}`);
  const instanceId = `urn:uuid:${sha256Hex(`${workId}|${createdAtIso}|${splitDigestSha256}`).slice(0, 32)}`;

  const manifestBase: Omit<C2paRightsSettlementManifest, "claimSha256" | "manifestSha256"> = {
    "@context": [
      "https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html",
      "https://schema.org",
      "https://toonstudio.cloud/ns/rights-settlement/v1",
    ],
    "@type": "c2pa:Manifest", specVersion: C2PA_SPEC_VERSION, claimGenerator, instanceId, workId, episodeTitle, createdAtIso,
    capabilityBoundary: LOCAL_SETTLEMENT_CAPABILITY_BOUNDARY,
    assertions: {
      actions: {
        label: "c2pa.actions",
        data: {
          actions: [
            { action: "c2pa.created", softwareAgent: claimGenerator, when: createdAtIso, parameters: { workId, contributorCount: input.contributors.length } },
            { action: "toonstudio.rights.split.locked", softwareAgent: claimGenerator, when: createdAtIso, parameters: { totalShareBps: TOTAL_SHARE_BPS, splitDigestSha256 } },
          ],
        },
      },
      trainingMining: {
        label: "c2pa.training-mining",
        data: { entries: { "c2pa.ai_training": { use: aiPolicy }, "c2pa.ai_generative_training": { use: aiPolicy }, "c2pa.data_mining": { use: aiPolicy } } },
      },
      creativeWork: {
        label: "stds.schema-org.CreativeWork",
        data: {
          "@context": "https://schema.org", "@type": "CreativeWork", identifier: workId, name: episodeTitle, dateCreated: createdAtIso,
          author: input.contributors.map((e) => ({ "@type": "Person" as const, identifier: e.contributorId, name: e.displayName, jobTitle: e.role })),
        },
      },
      rightsSettlement: {
        label: "toonstudio.rights-settlement.v1",
        data: { totalShareBps: TOTAL_SHARE_BPS, contributorCount: input.contributors.length, splitDigestSha256, rightsBomDigestSha256, derivativeRuleCount: derivativeRules.length, aiTrainingOptOutEnforced: aiPolicy === "notAllowed" },
      },
    },
  };

  const claimSha256 = computeManifestClaimDigest(manifestBase);
  const manifestSha256 = sha256Hex(canonicalizeJson({ claimSha256, instanceId, workId }));
  const manifest: C2paRightsSettlementManifest = { ...manifestBase, claimSha256, manifestSha256 };

  const schemaBase = {
    "@context": ["https://schema.org", "https://toonstudio.cloud/ns/rights-settlement/v1"] as const,
    "@type": "RightsRoyaltySplitContractSchema" as const, schemaVersion: "1.0.0" as const,
    deploymentStatus: "offchain-local-schema-only" as const, onChainBroadcastExecuted: false as const,
    workId, episodeTitle, bpsDenominator: TOTAL_SHARE_BPS,
    payees: input.contributors.map((e) => ({
      contributorId: e.contributorId, displayName: e.displayName, role: e.role,
      shareBps: e.shareBps, taxClassification: e.taxClassification, externalPayoutRef: e.externalPayoutRef ?? null,
    })),
    derivativeRoyaltyRules: [...derivativeRules], c2paManifestSha256: manifestSha256,
  };
  const smartContractJsonLd: SmartContractCompatibleJsonLd = { ...schemaBase, schemaSha256: sha256Hex(canonicalizeJson(schemaBase)) };

  const genesisBlock = createLedgerBlock({
    index: 0, timestampIso: createdAtIso, eventType: "genesis-manifest", prevHash: GENESIS_PREV_HASH,
    payload: { workId, manifestSha256, claimSha256, contractSchemaSha256: smartContractJsonLd.schemaSha256, splitDigestSha256, totalShareBps: TOTAL_SHARE_BPS },
  });

  return {
    ledgerId: `ledger-${genesisBlock.blockHash.slice(0, 12)}`, workId, episodeTitle, createdAtIso,
    capabilityBoundary: LOCAL_SETTLEMENT_CAPABILITY_BOUNDARY, activeContributors: [...input.contributors],
    derivativeRules: [...derivativeRules], manifest, smartContractJsonLd, blocks: [genesisBlock],
  };
}

/** 로컬 해시 체인 원장에 신규 이벤트 블록(정산·2차 로열티·워터마크 봉인 등)을 비파괴 추가한다. */
export function appendLedgerBlock(
  ledger: RightsSettlementLedger,
  params: { readonly eventType: Exclude<LedgerEventType, "genesis-manifest">; readonly timestampIso: string; readonly payload: Readonly<Record<string, unknown>> },
): RightsSettlementLedger {
  const prevBlock = ledger.blocks[ledger.blocks.length - 1];
  const nextBlock = createLedgerBlock({
    index: ledger.blocks.length, timestampIso: params.timestampIso, eventType: params.eventType,
    prevHash: prevBlock ? prevBlock.blockHash : GENESIS_PREV_HASH, payload: params.payload,
  });
  return { ...ledger, blocks: [...ledger.blocks, nextBlock] };
}

/** 원장의 SHA-256 해시 체인·C2PA v2.1 매니페스트·JSON-LD 스키마·10,000 bps 불변식을 전수 검증한다. */
export function verifyRightsSettlementLedger(ledger: RightsSettlementLedger): RightsSettlementLedgerVerification {
  const issues: LedgerVerificationIssue[] = [];
  const tamperedSet = new Set<number>();
  if (ledger.blocks.length === 0) {
    issues.push({ code: "EMPTY_LEDGER", messageKo: "원장에 기록된 블록이 없습니다.", messageEn: "Ledger contains zero blocks." });
  }
  let intactHashChain = ledger.blocks.length > 0;

  for (let i = 0; i < ledger.blocks.length; i += 1) {
    const block = ledger.blocks[i];
    if (!block) continue;
    if (block.index !== i) {
      intactHashChain = false; tamperedSet.add(i);
      issues.push({ code: "INDEX_SEQUENCE_INVALID", blockIndex: i, messageKo: `블록 #${i}의 인덱스(${block.index}) 순서가 불일치합니다.`, messageEn: `Block #${i} index (${block.index}) is out of sequence.` });
    }
    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : (ledger.blocks[i - 1]?.blockHash ?? "");
    if (block.prevHash !== expectedPrev) {
      intactHashChain = false; tamperedSet.add(i);
      issues.push({
        code: i === 0 ? "GENESIS_PREV_HASH_INVALID" : "PREV_HASH_LINK_BROKEN", blockIndex: i,
        messageKo: i === 0 ? "제네시스 블록(#0) 이전 해시가 0-해시와 다릅니다." : `블록 #${i}의 이전 해시(prevHash) 연결이 끊어졌습니다.`,
        messageEn: i === 0 ? "Genesis block (#0) prevHash is invalid." : `Block #${i} prevHash link is broken.`,
      });
    }
    if (sha256Hex(canonicalizeJson(block.payload)) !== block.payloadSha256) {
      intactHashChain = false; tamperedSet.add(i);
      issues.push({ code: "PAYLOAD_HASH_MISMATCH", blockIndex: i, messageKo: `블록 #${i}(${block.eventType}) 페이로드가 변조되었습니다.`, messageEn: `Block #${i} (${block.eventType}) payload digest mismatch.` });
    }
    const recomputedBlockHash = sha256Hex(canonicalizeJson({
      index: block.index, timestampIso: block.timestampIso, eventType: block.eventType, prevHash: block.prevHash, payloadSha256: block.payloadSha256,
    }));
    if (recomputedBlockHash !== block.blockHash) {
      intactHashChain = false; tamperedSet.add(i);
      issues.push({ code: "BLOCK_HASH_MISMATCH", blockIndex: i, messageKo: `블록 #${i} 봉인 해시(blockHash)가 불일치합니다.`, messageEn: `Block #${i} sealed blockHash mismatch.` });
    }
  }

  let manifestIntact = true;
  if (computeManifestClaimDigest(ledger.manifest) !== ledger.manifest.claimSha256) {
    manifestIntact = false;
    issues.push({ code: "MANIFEST_CLAIM_HASH_MISMATCH", messageKo: "C2PA v2.1 클레임 다이제스트(claimSha256)가 변조되었습니다.", messageEn: "C2PA v2.1 claimSha256 digest mismatch." });
  }
  if (sha256Hex(canonicalizeJson({ claimSha256: ledger.manifest.claimSha256, instanceId: ledger.manifest.instanceId, workId: ledger.manifest.workId })) !== ledger.manifest.manifestSha256) {
    manifestIntact = false;
    issues.push({ code: "MANIFEST_SEAL_HASH_MISMATCH", messageKo: "C2PA v2.1 최종 매니페스트 해시(manifestSha256)가 불일치합니다.", messageEn: "C2PA v2.1 final manifestSha256 mismatch." });
  }
  const { schemaSha256, ...schemaBody } = ledger.smartContractJsonLd;
  if (sha256Hex(canonicalizeJson(schemaBody)) !== schemaSha256) {
    manifestIntact = false;
    issues.push({ code: "CONTRACT_SCHEMA_HASH_MISMATCH", messageKo: "스마트 계약 호환 JSON-LD 스키마 해시가 변조되었습니다.", messageEn: "Smart-contract JSON-LD schema hash mismatch." });
  }

  const splitCheck = validateContributorSplits(ledger.activeContributors);
  if (!splitCheck.valid) {
    issues.push({ code: "SPLIT_BPS_NOT_10000", messageKo: `활성 기여자 지분 합계(${splitCheck.totalBps} bps)가 10,000 bps 규약을 위반했습니다.`, messageEn: `Active split total (${splitCheck.totalBps} bps) violates 10,000 bps.` });
  }
  for (const rule of ledger.derivativeRules) {
    const c = validateDerivativeRoyaltyRule(rule);
    if (!c.valid) {
      issues.push({ code: "DERIVATIVE_RULE_BPS_INVALID", messageKo: `2차 창작 규칙(${rule.labelKo}) 합계(${c.totalBps} bps)가 10,000 bps가 아닙니다.`, messageEn: `Derivative rule (${rule.labelEn}) total (${c.totalBps} bps) is not 10,000 bps.` });
    }
  }

  const headBlock = ledger.blocks[ledger.blocks.length - 1];
  return {
    valid: issues.length === 0, intactHashChain, manifestIntact, splitsValid10000Bps: splitCheck.valid,
    checkedBlocks: ledger.blocks.length, tamperedBlockIndices: [...tamperedSet].sort((a, b) => a - b),
    headHash: headBlock ? headBlock.blockHash : GENESIS_PREV_HASH, issues,
  };
}

/** 감사·시뮬레이션 전용: 지정 블록의 페이로드를 비파괴로 변조한 복제 원장을 반환한다. */
export function simulateLedgerBlockTamper(ledger: RightsSettlementLedger, targetBlockIndex: number, tamperNote = "UNAUTHORIZED_PAYOUT_MODIFICATION"): RightsSettlementLedger {
  const safeIndex = Math.max(0, Math.min(ledger.blocks.length - 1, Math.trunc(targetBlockIndex)));
  return {
    ...ledger,
    blocks: ledger.blocks.map((block, idx) => (idx === safeIndex ? { ...block, payload: { ...block.payload, tamperedFlag: tamperNote } } : block)),
  };
}

/** 기본 6직무(원작·작화·선화·채색·배경·식자 = 정확히 10,000 bps) 정산 원장 픽스처를 생성한다. */
export function createDefaultRightsSettlementFixture(): {
  readonly workId: string; readonly episodeTitle: string;
  readonly contributors: readonly ContributorEquityEntry[];
  readonly derivativeRules: readonly DerivativeRoyaltyRule[];
  readonly defaultPrimaryGrossKrw: number; readonly defaultDerivativeGrossKrw: number;
} {
  return {
    workId: "ts-ep042",
    episodeTitle: "은월의 기록 42화 — 옥상 대치",
    contributors: [
      { contributorId: "crt-story-01", displayName: "한지우 (원작)", role: "original-story", shareBps: 2_500, taxClassification: "freelancer-withholding-3.3", externalPayoutRef: null },
      { contributorId: "crt-art-02", displayName: "강서연 (작화)", role: "art-lead", shareBps: 2_500, taxClassification: "freelancer-withholding-3.3", externalPayoutRef: null },
      { contributorId: "crt-line-03", displayName: "윤하린 (선화)", role: "lineart", shareBps: 1_500, taxClassification: "freelancer-withholding-3.3", externalPayoutRef: null },
      { contributorId: "crt-color-04", displayName: "박도현 (채색)", role: "coloring", shareBps: 1_500, taxClassification: "freelancer-withholding-3.3", externalPayoutRef: null },
      { contributorId: "crt-bg-05", displayName: "스튜디오 모노3D (배경)", role: "background", shareBps: 1_200, taxClassification: "business-vat-10", externalPayoutRef: null },
      { contributorId: "crt-letter-06", displayName: "글꼴공방 라벨 (식자)", role: "lettering", shareBps: 800, taxClassification: "business-vat-10", externalPayoutRef: null },
    ],
    derivativeRules: DEFAULT_DERIVATIVE_ROYALTY_RULES,
    defaultPrimaryGrossKrw: 12_000_000,
    defaultDerivativeGrossKrw: 40_000_000,
  };
}
