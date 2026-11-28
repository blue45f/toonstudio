/**
 * 어시스턴트 기여도·Rights BOM 원고료 및 수익 지분 정산 감사 원장 (Wave 79).
 *
 * - 투기성 코인/토큰이 아닌 순수 회계 감사 목적의 SHA-256 해시 체인 + 이진 머클 트리 원장
 * - 국내 웹툰 제작 현장 3대 정산 모델 결정론적 계산:
 *   1. `per-cut-rate`: 컷당 단가 × 승인 컷 수 × 복잡도 가중치 + 긴급/배경 가산
 *   2. `milestone-fixed`: 회차 공정별 정액 원고료 + 긴급 가산
 *   3. `hybrid-revenue-share`: 기본 원고료 + 수익 지분율(합계 <= 100% 엄격 검증,
 *      최대 잔여법 원 단위 보정 `roundingRemainderKrw`로 총액 1원 오차도 없이 정합)
 * - Rights BOM 출고·정산 전 컴플라이언스 게이트: `editorial-only`·`unverified` 에셋 포함 시
 *   `commercialClearancePassed: false` 및 차단 사유를 명시해 정산·출고 보류 판단 지원
 */

import {
  canonicalSerialize,
  constantTimeEqualHex,
  hmacSha256Hex,
  sha256Hex,
} from "./scoped-slice-crypto-checkout";

// ---------------------------------------------------------------------------
// 1. 기여도·Rights BOM·정산 정책 타입 계약
// ---------------------------------------------------------------------------

export type AssistantSettlementRole = "background" | "lineart" | "colorist" | "letterer" | "post-fx";

export type RightsBomLicenseTier = "commercial-cleared" | "editorial-only" | "unverified";

export type RightsBomAssetCategory =
  | "brush-preset" | "3d-background" | "font" | "texture" | "tone-pattern" | "sfx-pack";

export interface RightsBomAssetAttachment {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetCategory: RightsBomAssetCategory;
  readonly licenseTier: RightsBomLicenseTier;
  readonly sourceSha256: string;
  readonly licenseReference?: string;
}

export interface AssistantContributionInput {
  readonly checkInId: string;
  readonly episodeId: string;
  readonly assistantId: string;
  readonly assistantDisplayName?: string;
  readonly role: AssistantSettlementRole;
  readonly cutIds: readonly string[];
  readonly strokeCount: number;
  readonly editedPixelAreaPx: number;
  readonly activeWorkMinutes: number;
  readonly complexityMultiplier?: number;
  readonly urgentBonusKrw?: number;
  readonly rightsBomAssets: readonly RightsBomAssetAttachment[];
  readonly checkInDigestHex?: string;
  readonly recordedAtIso: string;
}

export interface NormalizedAssistantContribution
  extends Omit<
    AssistantContributionInput,
    "assistantDisplayName" | "complexityMultiplier" | "urgentBonusKrw" | "checkInDigestHex"
  > {
  readonly assistantDisplayName: string;
  readonly complexityMultiplier: number;
  readonly urgentBonusKrw: number;
  readonly checkInDigestHex: string | null;
}

export interface SettlementLedgerEntry {
  readonly sequence: number; readonly entryId: string; readonly previousHashHex: string;
  readonly payload: NormalizedAssistantContribution; readonly entryHashHex: string; readonly studioMacHex: string | null;
}
export interface SettlementLedgerSnapshot {
  readonly schemaVersion: "wave79-settlement-ledger/v1";
  readonly ledgerId: string; readonly episodeId: string; readonly projectId: string;
  readonly genesisHashHex: string; readonly merkleRootHex: string; readonly entryCount: number;
  readonly entries: readonly SettlementLedgerEntry[]; readonly snapshotMacHex: string | null;
}
export interface SettlementLedgerVerificationResult {
  readonly valid: boolean; readonly checkedEntryCount: number;
  readonly computedMerkleRootHex: string; readonly expectedMerkleRootHex: string; readonly violations: readonly string[];
}

export type SettlementPolicyErrorCode =
  | "INVALID_CONTRIBUTION_INPUT"
  | "LEDGER_INTEGRITY_FAILED"
  | "REVENUE_SHARE_SUM_EXCEEDS_100"
  | "INVALID_SETTLEMENT_POLICY";

export class SettlementPolicyError extends Error {
  public readonly code: SettlementPolicyErrorCode;

  public constructor(code: SettlementPolicyErrorCode, message: string) {
    super(message);
    this.name = "SettlementPolicyError";
    this.code = code;
  }
}

export interface PerCutRateSettlementPolicy {
  readonly model: "per-cut-rate";
  readonly defaultRatePerCutKrw: number;
  readonly rateByRoleKrw?: Partial<Record<AssistantSettlementRole, number>>;
  readonly rateByAssistantKrw?: Readonly<Record<string, number>>;
  readonly rushMultiplier?: number;
  readonly backgroundComplexityBonusRate?: number;
  readonly approvedCutIds?: readonly string[];
}

export interface MilestoneFixedSettlementPolicy {
  readonly model: "milestone-fixed";
  readonly defaultFixedFeeKrw?: number;
  readonly fixedFeeByRoleKrw?: Partial<Record<AssistantSettlementRole, number>>;
  readonly fixedFeeByAssistantKrw?: Readonly<Record<string, number>>;
}

export interface HybridRevenueShareSettlementPolicy {
  readonly model: "hybrid-revenue-share";
  readonly distributableRevenuePoolKrw: number;
  readonly baseFeeByAssistantKrw?: Readonly<Record<string, number>>;
  readonly revenueSharePercentByAssistant: Readonly<Record<string, number>>;
  readonly authorRetainedSharePercent?: number;
  readonly remainderRecipientId?: string;
}

export type EpisodeSettlementPolicy =
  | PerCutRateSettlementPolicy
  | MilestoneFixedSettlementPolicy
  | HybridRevenueShareSettlementPolicy;

export interface RightsBomBlockerRecord {
  readonly entryId: string;
  readonly checkInId: string;
  readonly assistantId: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly assetCategory: RightsBomAssetCategory;
  readonly licenseTier: Exclude<RightsBomLicenseTier, "commercial-cleared">;
  readonly sourceSha256: string;
  readonly reason: string;
}

export interface RightsBomComplianceGateReport {
  readonly commercialClearancePassed: boolean;
  readonly totalAssetCount: number;
  readonly clearedAssetCount: number;
  readonly editorialOnlyCount: number;
  readonly unverifiedCount: number;
  readonly blockers: readonly RightsBomBlockerRecord[];
}

export interface AssistantSettlementLineItem {
  readonly assistantId: string;
  readonly assistantDisplayName: string;
  readonly roles: readonly AssistantSettlementRole[];
  readonly checkInCount: number;
  readonly approvedCutCount: number;
  readonly totalStrokeCount: number;
  readonly totalEditedPixelAreaPx: number;
  readonly totalActiveWorkMinutes: number;
  readonly basePayoutKrw: number;
  readonly complexityAndUrgentBonusKrw: number;
  readonly revenueSharePercent: number;
  readonly revenueShareKrw: number;
  readonly roundingAdjustmentKrw: number;
  readonly grossPayoutKrw: number;
  readonly rightsClearancePassed: boolean;
  readonly blockedAssetIds: readonly string[];
}

export interface EpisodeSettlementStatement {
  readonly schemaVersion: "wave79-settlement-statement/v1";
  readonly ledgerId: string;
  readonly episodeId: string;
  readonly projectId: string;
  readonly model: EpisodeSettlementPolicy["model"];
  readonly calculatedAtIso: string;
  readonly merkleRootHex: string;
  readonly ledgerIntegrityVerified: boolean;
  readonly entryCount: number;
  readonly lineItems: readonly AssistantSettlementLineItem[];
  readonly totalAssistantBasePayoutKrw: number;
  readonly totalAssistantBonusKrw: number;
  readonly totalAssistantRevenueShareKrw: number;
  readonly totalAssistantGrossPayoutKrw: number;
  readonly distributableRevenuePoolKrw: number;
  readonly totalAssistantSharePercent: number;
  readonly authorRetainedSharePercent: number;
  readonly authorRetainedKrw: number;
  readonly roundingRemainderKrw: number;
  readonly rightsBomGate: RightsBomComplianceGateReport;
}

export interface CalculateSettlementOptions {
  readonly calculatedAtIso: string;
  readonly studioSecret?: string;
  readonly requireVerifiedLedger?: boolean;
}

export interface AssistantSettlementAuditLedgerOptions {
  readonly ledgerId: string;
  readonly episodeId: string;
  readonly projectId: string;
  readonly studioSecret?: string;
}

// ---------------------------------------------------------------------------
// 2. 해시 체인·이진 머클 루트 및 정규화 헬퍼
// ---------------------------------------------------------------------------

function computeGenesisHash(ledgerId: string, episodeId: string): string {
  return sha256Hex(`wave79-settlement-genesis:v1:${ledgerId}:${episodeId}`);
}

function computeEntryHash(
  sequence: number, entryId: string, previousHashHex: string, payload: NormalizedAssistantContribution,
): string {
  return sha256Hex(`wave79-settlement-entry:v1:${canonicalSerialize({ sequence, entryId, previousHashHex, payload })}`);
}

function computeEntryMac(studioSecret: string, entryHashHex: string): string {
  return hmacSha256Hex(studioSecret, `wave79-settlement-entry-mac:v1:${entryHashHex}`);
}

function computeSnapshotMac(
  studioSecret: string, ledgerId: string, episodeId: string, merkleRootHex: string, entryCount: number,
): string {
  return hmacSha256Hex(studioSecret, `wave79-settlement-snapshot-mac:v1:${ledgerId}:${episodeId}:${merkleRootHex}:${entryCount}`);
}

/** 도메인 분리 이진 머클 루트를 계산한다. */
export function computeSettlementMerkleRoot(entryHashes: readonly string[]): string {
  if (entryHashes.length === 0) return sha256Hex("wave79-settlement-empty-merkle:v1");
  let level = entryHashes.map((hash) => sha256Hex(`wave79-leaf:v1:${hash}`));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] ?? "";
      next.push(sha256Hex(`wave79-branch:v1:${left}:${level[i + 1] ?? left}`));
    }
    level = next;
  }
  return level[0] ?? sha256Hex("wave79-settlement-empty-merkle:v1");
}

function assertNonNegativeInteger(value: number, fieldName: string, code: SettlementPolicyErrorCode): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SettlementPolicyError(code, `${fieldName} 값은 0 이상의 정수여야 합니다(입력: ${String(value)}).`);
  }
  return value;
}

function normalizeContributionInput(
  input: AssistantContributionInput, expectedEpisodeId: string,
): NormalizedAssistantContribution {
  if (!input.checkInId.trim() || !input.assistantId.trim()) {
    throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", "checkInId와 assistantId는 비어 있을 수 없습니다.");
  }
  if (input.episodeId !== expectedEpisodeId) {
    throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", `회차 불일치: 원장(${expectedEpisodeId})과 체크인(${input.episodeId})이 다릅니다.`);
  }
  const cutIds = Array.from(new Set(input.cutIds.map((id) => id.trim()).filter(Boolean))).sort();
  if (cutIds.length === 0) {
    throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", "기여 컷(cutIds)이 최소 1개 이상 필요합니다.");
  }

  const strokeCount = assertNonNegativeInteger(input.strokeCount, "strokeCount", "INVALID_CONTRIBUTION_INPUT");
  const editedPixelAreaPx = assertNonNegativeInteger(input.editedPixelAreaPx, "editedPixelAreaPx", "INVALID_CONTRIBUTION_INPUT");
  const activeWorkMinutes = assertNonNegativeInteger(input.activeWorkMinutes, "activeWorkMinutes", "INVALID_CONTRIBUTION_INPUT");
  const urgentBonusKrw = assertNonNegativeInteger(input.urgentBonusKrw ?? 0, "urgentBonusKrw", "INVALID_CONTRIBUTION_INPUT");
  const complexityMultiplier = input.complexityMultiplier ?? 1;
  if (!Number.isFinite(complexityMultiplier) || complexityMultiplier <= 0 || complexityMultiplier > 5) {
    throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", `complexityMultiplier는 0 초과 5 이하여야 합니다(입력: ${String(complexityMultiplier)}).`);
  }

  const rightsBomAssets: RightsBomAssetAttachment[] = input.rightsBomAssets.map((asset) => {
    if (!asset.assetId.trim() || !asset.assetName.trim()) {
      throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", "Rights BOM 에셋 ID와 이름이 필요합니다.");
    }
    if (!/^[0-9a-f]{64}$/i.test(asset.sourceSha256)) {
      throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", `에셋(${asset.assetId})의 sourceSha256은 64자리 16진수 해시여야 합니다.`);
    }
    return {
      assetId: asset.assetId.trim(), assetName: asset.assetName.trim(),
      assetCategory: asset.assetCategory, licenseTier: asset.licenseTier,
      sourceSha256: asset.sourceSha256.toLowerCase(),
      ...(asset.licenseReference !== undefined ? { licenseReference: asset.licenseReference } : {}),
    };
  });

  return {
    checkInId: input.checkInId.trim(), episodeId: input.episodeId,
    assistantId: input.assistantId.trim(),
    assistantDisplayName: (input.assistantDisplayName ?? input.assistantId).trim(),
    role: input.role, cutIds, strokeCount, editedPixelAreaPx, activeWorkMinutes,
    complexityMultiplier, urgentBonusKrw, rightsBomAssets,
    checkInDigestHex: input.checkInDigestHex ?? null, recordedAtIso: input.recordedAtIso,
  };
}

function cloneEntry(entry: SettlementLedgerEntry): SettlementLedgerEntry {
  return {
    ...entry,
    payload: {
      ...entry.payload,
      cutIds: [...entry.payload.cutIds],
      rightsBomAssets: entry.payload.rightsBomAssets.map((asset) => ({ ...asset })),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. 변조 탐지 가능 머클 감사 원장 클래스 및 검증기
// ---------------------------------------------------------------------------

/** 어시스턴트 체크인 기여도와 Rights BOM 라이선스를 SHA-256 해시 체인·이진 머클 트리로 누적 기록하는 원장. */
export class AssistantSettlementAuditLedger {
  public readonly ledgerId: string;
  public readonly episodeId: string;
  public readonly projectId: string;
  public readonly genesisHashHex: string;

  private readonly studioSecret: string | undefined;
  private readonly entries: SettlementLedgerEntry[] = [];

  public constructor(options: AssistantSettlementAuditLedgerOptions) {
    if (!options.ledgerId.trim() || !options.episodeId.trim() || !options.projectId.trim()) {
      throw new SettlementPolicyError("INVALID_CONTRIBUTION_INPUT", "ledgerId, episodeId, projectId는 비어 있을 수 없습니다.");
    }
    this.ledgerId = options.ledgerId.trim();
    this.episodeId = options.episodeId.trim();
    this.projectId = options.projectId.trim();
    this.studioSecret = options.studioSecret;
    this.genesisHashHex = computeGenesisHash(this.ledgerId, this.episodeId);
  }

  /** 검수 완료된 어시스턴트 체크인 기여 내역을 원장 끝에 암호화 체인으로 추가한다. */
  public appendContribution(input: AssistantContributionInput): SettlementLedgerEntry {
    const normalized = normalizeContributionInput(input, this.episodeId);
    const sequence = this.entries.length;
    const previousHashHex =
      sequence === 0 ? this.genesisHashHex : (this.entries[sequence - 1]?.entryHashHex ?? this.genesisHashHex);
    const entryId = `${this.ledgerId}-seq-${String(sequence).padStart(4, "0")}`;
    const entryHashHex = computeEntryHash(sequence, entryId, previousHashHex, normalized);
    const studioMacHex = this.studioSecret !== undefined ? computeEntryMac(this.studioSecret, entryHashHex) : null;

    const entry: SettlementLedgerEntry = { sequence, entryId, previousHashHex, payload: normalized, entryHashHex, studioMacHex };
    this.entries.push(entry);
    return cloneEntry(entry);
  }

  /** 원장에 기록된 항목 사본을 순서대로 반환한다. */
  public getEntries(): readonly SettlementLedgerEntry[] {
    return this.entries.map(cloneEntry);
  }

  /** 현재 원장의 이진 머클 루트(64자리 소문자 16진수)를 반환한다. */
  public getMerkleRootHex(): string {
    return computeSettlementMerkleRoot(this.entries.map((entry) => entry.entryHashHex));
  }

  /** 외부 감사·정산서 생성용 직렬화 가능 스냅샷을 생성한다. */
  public exportSnapshot(): SettlementLedgerSnapshot {
    const merkleRootHex = this.getMerkleRootHex();
    const snapshotMacHex =
      this.studioSecret !== undefined
        ? computeSnapshotMac(this.studioSecret, this.ledgerId, this.episodeId, merkleRootHex, this.entries.length)
        : null;
    return {
      schemaVersion: "wave79-settlement-ledger/v1",
      ledgerId: this.ledgerId, episodeId: this.episodeId, projectId: this.projectId,
      genesisHashHex: this.genesisHashHex, merkleRootHex,
      entryCount: this.entries.length, entries: this.getEntries(), snapshotMacHex,
    };
  }
}

/**
 * 정산 원장 스냅샷의 해시 체인·이진 머클 루트·스튜디오 HMAC을 전수 검증한다.
 * 과거 항목의 컷 수·보너스·에셋 라이선스가 1바이트라도 바뀌면 `valid: false`를 반환한다.
 */
export function verifySettlementLedgerIntegrity(
  snapshot: SettlementLedgerSnapshot,
  options?: { readonly studioSecret?: string },
): SettlementLedgerVerificationResult {
  const violations: string[] = [];
  const expectedGenesis = computeGenesisHash(snapshot.ledgerId, snapshot.episodeId);
  if (!constantTimeEqualHex(expectedGenesis, snapshot.genesisHashHex)) {
    violations.push("원장 제네시스 해시가 ledgerId·episodeId와 일치하지 않습니다.");
  }
  if (snapshot.entryCount !== snapshot.entries.length) {
    violations.push(`기록 건수 불일치(선언 ${snapshot.entryCount}건 vs 실제 ${snapshot.entries.length}건).`);
  }

  let expectedPrev = expectedGenesis;
  const verifiedHashes: string[] = [];
  for (let i = 0; i < snapshot.entries.length; i += 1) {
    const entry = snapshot.entries[i];
    if (entry === undefined) continue;
    if (entry.sequence !== i) violations.push(`항목 ${entry.entryId}의 순번(${entry.sequence})이 예상 순번(${i})과 다릅니다.`);
    if (!constantTimeEqualHex(entry.previousHashHex, expectedPrev)) {
      violations.push(`항목 ${entry.entryId}의 이전 체인 해시 연결이 끊겼습니다.`);
    }
    const recomputedHash = computeEntryHash(entry.sequence, entry.entryId, entry.previousHashHex, entry.payload);
    if (!constantTimeEqualHex(recomputedHash, entry.entryHashHex)) {
      violations.push(`항목 ${entry.entryId}의 콘텐츠 해시가 불일치해 변조가 감지되었습니다.`);
    }
    if (options?.studioSecret !== undefined) {
      const expectedMac = computeEntryMac(options.studioSecret, recomputedHash);
      if (entry.studioMacHex === null || !constantTimeEqualHex(expectedMac, entry.studioMacHex)) {
        violations.push(`항목 ${entry.entryId}의 스튜디오 HMAC 서명이 유효하지 않습니다.`);
      }
    }
    verifiedHashes.push(recomputedHash);
    expectedPrev = entry.entryHashHex;
  }

  const computedMerkleRootHex = computeSettlementMerkleRoot(verifiedHashes);
  if (!constantTimeEqualHex(computedMerkleRootHex, snapshot.merkleRootHex)) {
    violations.push("계산된 이진 머클 루트가 스냅샷의 머클 루트와 일치하지 않습니다.");
  }
  if (options?.studioSecret !== undefined) {
    const expectedSnapMac = computeSnapshotMac(
      options.studioSecret, snapshot.ledgerId, snapshot.episodeId, computedMerkleRootHex, snapshot.entries.length,
    );
    if (snapshot.snapshotMacHex === null || !constantTimeEqualHex(expectedSnapMac, snapshot.snapshotMacHex)) {
      violations.push("스냅샷 최상위 스튜디오 HMAC 서명이 일치하지 않습니다.");
    }
  }

  return {
    valid: violations.length === 0,
    checkedEntryCount: snapshot.entries.length,
    computedMerkleRootHex, expectedMerkleRootHex: snapshot.merkleRootHex, violations,
  };
}

// ---------------------------------------------------------------------------
// 4. Rights BOM 컴플라이언스 게이트 및 3대 정산 모델 계산기
// ---------------------------------------------------------------------------

/** 원장에 기록된 모든 Rights BOM 첨부 에셋의 상업 출고·정산 가능 여부를 판정한다. */
export function evaluateRightsBomComplianceGate(
  entries: readonly SettlementLedgerEntry[],
): RightsBomComplianceGateReport {
  let totalAssetCount = 0; let clearedAssetCount = 0;
  let editorialOnlyCount = 0; let unverifiedCount = 0;
  const blockers: RightsBomBlockerRecord[] = [];

  for (const entry of entries) {
    for (const asset of entry.payload.rightsBomAssets) {
      totalAssetCount += 1;
      if (asset.licenseTier === "commercial-cleared") {
        clearedAssetCount += 1;
        continue;
      }
      const isEditorial = asset.licenseTier === "editorial-only";
      if (isEditorial) editorialOnlyCount += 1;
      else unverifiedCount += 1;
      blockers.push({
        entryId: entry.entryId, checkInId: entry.payload.checkInId, assistantId: entry.payload.assistantId,
        assetId: asset.assetId, assetName: asset.assetName, assetCategory: asset.assetCategory,
        licenseTier: asset.licenseTier, sourceSha256: asset.sourceSha256,
        reason: isEditorial
          ? "비상업·편집 전용(editorial-only) 라이선스 에셋으로 상업 출고 전 교체가 필요합니다."
          : "라이선스 미검증(unverified) 에셋으로 Rights BOM 증빙 확인 전 정산·출고가 보류됩니다.",
      });
    }
  }
  return {
    commercialClearancePassed: blockers.length === 0,
    totalAssetCount, clearedAssetCount, editorialOnlyCount, unverifiedCount, blockers,
  };
}

interface AssistantAccumulator {
  readonly assistantId: string;
  displayName: string;
  readonly roles: Set<AssistantSettlementRole>;
  checkInCount: number;
  readonly cutRolePairs: Map<string, { readonly role: AssistantSettlementRole; maxComplexity: number }>;
  totalStrokeCount: number;
  totalEditedPixelAreaPx: number;
  totalActiveWorkMinutes: number;
  urgentBonusKrw: number;
  readonly blockedAssetIds: Set<string>;
}

function makeEmptyAccumulator(assistantId: string, displayName: string): AssistantAccumulator {
  return {
    assistantId, displayName, roles: new Set(), checkInCount: 0, cutRolePairs: new Map(),
    totalStrokeCount: 0, totalEditedPixelAreaPx: 0, totalActiveWorkMinutes: 0, urgentBonusKrw: 0, blockedAssetIds: new Set(),
  };
}

function allocateHamiltonKrw(
  poolKrw: number,
  participants: readonly { readonly id: string; readonly sharePercent: number }[],
  targetTotalKrw: number,
  remainderRecipientId?: string,
): { readonly allocatedById: Readonly<Record<string, number>>; readonly adjustmentById: Readonly<Record<string, number>>; readonly remainderDistributedKrw: number } {
  const remainders: { readonly id: string; readonly frac: number }[] = [];
  const allocatedById: Record<string, number> = {};
  const adjustmentById: Record<string, number> = {};
  let floorSum = 0;

  for (const participant of participants) {
    const exact = (poolKrw * participant.sharePercent) / 100;
    const floored = Math.floor(exact);
    allocatedById[participant.id] = floored;
    adjustmentById[participant.id] = 0;
    floorSum += floored;
    remainders.push({ id: participant.id, frac: exact - floored });
  }

  const remainderDistributedKrw = targetTotalKrw - floorSum;
  if (remainderDistributedKrw > 0 && participants.length > 0) {
    if (remainderRecipientId !== undefined && allocatedById[remainderRecipientId] !== undefined) {
      allocatedById[remainderRecipientId] = (allocatedById[remainderRecipientId] ?? 0) + remainderDistributedKrw;
      adjustmentById[remainderRecipientId] = remainderDistributedKrw;
    } else {
      remainders.sort((a, b) => (Math.abs(b.frac - a.frac) > 1e-12 ? b.frac - a.frac : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (let i = 0; i < remainderDistributedKrw; i += 1) {
        const target = remainders[i % remainders.length];
        if (target !== undefined) {
          allocatedById[target.id] = (allocatedById[target.id] ?? 0) + 1;
          adjustmentById[target.id] = (adjustmentById[target.id] ?? 0) + 1;
        }
      }
    }
  }
  return { allocatedById, adjustmentById, remainderDistributedKrw };
}

function buildLineItem(
  acc: AssistantAccumulator, basePayoutKrw: number, bonusKrw: number,
  revenueSharePercent: number, revenueShareKrw: number, roundingAdjustmentKrw: number,
): AssistantSettlementLineItem {
  return {
    assistantId: acc.assistantId, assistantDisplayName: acc.displayName,
    roles: Array.from(acc.roles).sort(), checkInCount: acc.checkInCount, approvedCutCount: acc.cutRolePairs.size,
    totalStrokeCount: acc.totalStrokeCount, totalEditedPixelAreaPx: acc.totalEditedPixelAreaPx,
    totalActiveWorkMinutes: acc.totalActiveWorkMinutes,
    basePayoutKrw, complexityAndUrgentBonusKrw: bonusKrw,
    revenueSharePercent, revenueShareKrw, roundingAdjustmentKrw,
    grossPayoutKrw: basePayoutKrw + bonusKrw + revenueShareKrw,
    rightsClearancePassed: acc.blockedAssetIds.size === 0,
    blockedAssetIds: Array.from(acc.blockedAssetIds).sort(),
  };
}

/**
 * 검증된 정산 감사 원장 스냅샷과 정산 정책을 입력받아 회차별 어시스턴트 원고료·지분 정산 내역을
 * 1원 오차 없이 결정론적으로 계산한다.
 */
export function calculateEpisodeSettlementStatement(
  snapshot: SettlementLedgerSnapshot,
  policy: EpisodeSettlementPolicy,
  options: CalculateSettlementOptions,
): EpisodeSettlementStatement {
  const integrity = verifySettlementLedgerIntegrity(snapshot, { studioSecret: options.studioSecret });
  if ((options.requireVerifiedLedger ?? true) && !integrity.valid) {
    throw new SettlementPolicyError("LEDGER_INTEGRITY_FAILED", `원장 무결성 검증 실패로 정산서를 생성할 수 없습니다: ${integrity.violations.join(" / ")}`);
  }

  const rightsBomGate = evaluateRightsBomComplianceGate(snapshot.entries);
  const approvedCutFilter = policy.model === "per-cut-rate" && policy.approvedCutIds !== undefined ? new Set<string>(policy.approvedCutIds) : null;
  const accumulators = new Map<string, AssistantAccumulator>();

  for (const entry of snapshot.entries) {
    const p = entry.payload;
    const acc = accumulators.get(p.assistantId) ?? makeEmptyAccumulator(p.assistantId, p.assistantDisplayName);
    accumulators.set(p.assistantId, acc);
    acc.displayName = p.assistantDisplayName;
    acc.roles.add(p.role);
    acc.checkInCount += 1;
    acc.totalStrokeCount += p.strokeCount;
    acc.totalEditedPixelAreaPx += p.editedPixelAreaPx;
    acc.totalActiveWorkMinutes += p.activeWorkMinutes;
    acc.urgentBonusKrw += p.urgentBonusKrw;

    for (const cutId of p.cutIds) {
      if (approvedCutFilter !== null && !approvedCutFilter.has(cutId)) continue;
      const pairKey = `${cutId}::${p.role}`;
      const existing = acc.cutRolePairs.get(pairKey);
      if (existing === undefined) acc.cutRolePairs.set(pairKey, { role: p.role, maxComplexity: p.complexityMultiplier });
      else if (p.complexityMultiplier > existing.maxComplexity) existing.maxComplexity = p.complexityMultiplier;
    }
    for (const asset of p.rightsBomAssets) {
      if (asset.licenseTier !== "commercial-cleared") acc.blockedAssetIds.add(asset.assetId);
    }
  }

  if (policy.model === "hybrid-revenue-share") {
    for (const assistantId of Object.keys(policy.revenueSharePercentByAssistant)) {
      if (!accumulators.has(assistantId)) accumulators.set(assistantId, makeEmptyAccumulator(assistantId, assistantId));
    }
  }

  const sortedIds = Array.from(accumulators.keys()).sort();
  const lineItems: AssistantSettlementLineItem[] = [];
  let totalAssistantBasePayoutKrw = 0; let totalAssistantBonusKrw = 0;
  let totalAssistantRevenueShareKrw = 0; let totalAssistantGrossPayoutKrw = 0;
  let distributableRevenuePoolKrw = 0; let totalAssistantSharePercent = 0;
  let authorRetainedSharePercent = 100; let authorRetainedKrw = 0; let roundingRemainderKrw = 0;

  if (policy.model === "per-cut-rate") {
    const defaultRate = assertNonNegativeInteger(policy.defaultRatePerCutKrw, "defaultRatePerCutKrw", "INVALID_SETTLEMENT_POLICY");
    const rushMultiplier = policy.rushMultiplier ?? 1;
    const bgBonusRate = policy.backgroundComplexityBonusRate ?? 0;
    if (!Number.isFinite(rushMultiplier) || rushMultiplier <= 0 || !Number.isFinite(bgBonusRate) || bgBonusRate < 0) {
      throw new SettlementPolicyError("INVALID_SETTLEMENT_POLICY", "rushMultiplier(>0)와 backgroundComplexityBonusRate(>=0)가 유효해야 합니다.");
    }
    for (const assistantId of sortedIds) {
      const acc = accumulators.get(assistantId);
      if (acc === undefined) continue;
      let baseKrw = 0; let complexityBonusKrw = 0;
      for (const pair of acc.cutRolePairs.values()) {
        const unitRate = assertNonNegativeInteger(
          policy.rateByAssistantKrw?.[assistantId] ?? policy.rateByRoleKrw?.[pair.role] ?? defaultRate,
          `컷당 단가(${assistantId})`, "INVALID_SETTLEMENT_POLICY",
        );
        const effectiveMult = pair.maxComplexity * rushMultiplier + (pair.role === "background" ? bgBonusRate : 0);
        baseKrw += unitRate;
        complexityBonusKrw += Math.round(unitRate * effectiveMult) - unitRate;
      }
      const item = buildLineItem(acc, baseKrw, complexityBonusKrw + acc.urgentBonusKrw, 0, 0, 0);
      totalAssistantBasePayoutKrw += item.basePayoutKrw;
      totalAssistantBonusKrw += item.complexityAndUrgentBonusKrw;
      totalAssistantGrossPayoutKrw += item.grossPayoutKrw;
      lineItems.push(item);
    }
  } else if (policy.model === "milestone-fixed") {
    const defaultFixed = assertNonNegativeInteger(policy.defaultFixedFeeKrw ?? 0, "defaultFixedFeeKrw", "INVALID_SETTLEMENT_POLICY");
    for (const assistantId of sortedIds) {
      const acc = accumulators.get(assistantId);
      if (acc === undefined) continue;
      const roleFeeSum = Array.from(acc.roles).sort().reduce(
        (sum, role) => sum + assertNonNegativeInteger(policy.fixedFeeByRoleKrw?.[role] ?? 0, `역할 정액(${role})`, "INVALID_SETTLEMENT_POLICY"),
        0,
      );
      const explicitFee = policy.fixedFeeByAssistantKrw?.[assistantId];
      const baseKrw = explicitFee !== undefined
        ? assertNonNegativeInteger(explicitFee, `어시스턴트 정액(${assistantId})`, "INVALID_SETTLEMENT_POLICY")
        : roleFeeSum > 0 ? roleFeeSum : defaultFixed;
      const item = buildLineItem(acc, baseKrw, acc.urgentBonusKrw, 0, 0, 0);
      totalAssistantBasePayoutKrw += item.basePayoutKrw;
      totalAssistantBonusKrw += item.complexityAndUrgentBonusKrw;
      totalAssistantGrossPayoutKrw += item.grossPayoutKrw;
      lineItems.push(item);
    }
  } else {
    distributableRevenuePoolKrw = assertNonNegativeInteger(policy.distributableRevenuePoolKrw, "distributableRevenuePoolKrw", "INVALID_SETTLEMENT_POLICY");
    let assistantShareSum = 0;
    const participants: { readonly id: string; readonly sharePercent: number }[] = [];
    for (const assistantId of sortedIds) {
      const share = policy.revenueSharePercentByAssistant[assistantId] ?? 0;
      if (!Number.isFinite(share) || share < 0) {
        throw new SettlementPolicyError("INVALID_SETTLEMENT_POLICY", `어시스턴트(${assistantId}) 수익 지분율은 0 이상이어야 합니다.`);
      }
      assistantShareSum += share;
      participants.push({ id: assistantId, sharePercent: share });
    }
    if (assistantShareSum > 100 + 1e-9) {
      throw new SettlementPolicyError("REVENUE_SHARE_SUM_EXCEEDS_100", `어시스턴트 수익 지분 합계(${assistantShareSum.toFixed(4)}%)가 100%를 초과했습니다.`);
    }
    const explicitAuthorShare = policy.authorRetainedSharePercent;
    if (explicitAuthorShare !== undefined) {
      if (!Number.isFinite(explicitAuthorShare) || explicitAuthorShare < 0) {
        throw new SettlementPolicyError("INVALID_SETTLEMENT_POLICY", "작가 보유 지분율은 0 이상이어야 합니다.");
      }
      if (assistantShareSum + explicitAuthorShare > 100 + 1e-9) {
        throw new SettlementPolicyError("REVENUE_SHARE_SUM_EXCEEDS_100", `어시스턴트(${assistantShareSum.toFixed(4)}%)와 작가(${explicitAuthorShare.toFixed(4)}%) 지분 합계가 100%를 초과했습니다.`);
      }
      authorRetainedSharePercent = explicitAuthorShare;
    } else {
      authorRetainedSharePercent = Math.max(0, 100 - assistantShareSum);
    }

    totalAssistantSharePercent = assistantShareSum;
    const AUTHOR_SLOT_ID = "__author_retained__";
    const totalDeclared = assistantShareSum + authorRetainedSharePercent;
    const targetAllocatedKrw = Math.abs(totalDeclared - 100) <= 1e-9
      ? distributableRevenuePoolKrw
      : Math.round((distributableRevenuePoolKrw * totalDeclared) / 100);
    const allParticipants = authorRetainedSharePercent > 0
      ? [...participants, { id: AUTHOR_SLOT_ID, sharePercent: authorRetainedSharePercent }]
      : participants;

    const allocation = allocateHamiltonKrw(distributableRevenuePoolKrw, allParticipants, targetAllocatedKrw, policy.remainderRecipientId);
    roundingRemainderKrw = allocation.remainderDistributedKrw;
    authorRetainedKrw = authorRetainedSharePercent > 0 ? (allocation.allocatedById[AUTHOR_SLOT_ID] ?? 0) : 0;

    for (const assistantId of sortedIds) {
      const acc = accumulators.get(assistantId);
      if (acc === undefined) continue;
      const baseKrw = assertNonNegativeInteger(policy.baseFeeByAssistantKrw?.[assistantId] ?? 0, `기본 원고료(${assistantId})`, "INVALID_SETTLEMENT_POLICY");
      const sharePercent = policy.revenueSharePercentByAssistant[assistantId] ?? 0;
      const item = buildLineItem(acc, baseKrw, acc.urgentBonusKrw, sharePercent, allocation.allocatedById[assistantId] ?? 0, allocation.adjustmentById[assistantId] ?? 0);
      totalAssistantBasePayoutKrw += item.basePayoutKrw;
      totalAssistantBonusKrw += item.complexityAndUrgentBonusKrw;
      totalAssistantRevenueShareKrw += item.revenueShareKrw;
      totalAssistantGrossPayoutKrw += item.grossPayoutKrw;
      lineItems.push(item);
    }
  }

  return {
    schemaVersion: "wave79-settlement-statement/v1",
    ledgerId: snapshot.ledgerId, episodeId: snapshot.episodeId, projectId: snapshot.projectId,
    model: policy.model, calculatedAtIso: options.calculatedAtIso,
    merkleRootHex: snapshot.merkleRootHex, ledgerIntegrityVerified: integrity.valid, entryCount: snapshot.entryCount,
    lineItems, totalAssistantBasePayoutKrw, totalAssistantBonusKrw, totalAssistantRevenueShareKrw,
    totalAssistantGrossPayoutKrw, distributableRevenuePoolKrw, totalAssistantSharePercent,
    authorRetainedSharePercent, authorRetainedKrw, roundingRemainderKrw, rightsBomGate,
  };
}
