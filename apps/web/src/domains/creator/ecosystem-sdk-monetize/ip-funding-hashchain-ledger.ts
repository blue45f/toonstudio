/**
 * IP 크라우드펀딩(단행본·굿즈·스핀오프) 정산 · 지분 합계 100% 불변식 · 가스비 ₩0 SHA-256 해시체인 계약 원장.
 */

import { GENESIS_PREVIOUS_HASH, canonicalJson, sha256Hex } from "./deterministic-sha256";

export type IpFundingKind = "print-edition" | "merch-goods" | "spinoff-episode";
export type StakeholderRole =
  | "lead-author"
  | "story-writer"
  | "line-artist"
  | "colorist"
  | "studio"
  | "assistant";

export interface CrowdfundingRewardTier {
  readonly id: string;
  readonly title: string;
  readonly priceKrw: number;
  readonly backerCount: number;
  readonly unitFulfillmentCostKrw: number;
  readonly limitQuantity?: number;
}

export interface CrowdfundingCampaignInput {
  readonly campaignId: string;
  readonly title: string;
  readonly ipKind: IpFundingKind;
  readonly goalAmountKrw: number;
  readonly rewardTiers: readonly CrowdfundingRewardTier[];
  readonly platformFeeRate?: number;
  readonly paymentFeeRate?: number;
}

export interface CrowdfundingTierBreakdown {
  readonly id: string;
  readonly title: string;
  readonly backerCount: number;
  readonly tierRevenueKrw: number;
  readonly tierFulfillmentCostKrw: number;
  readonly soldOut: boolean;
  readonly overLimit: boolean;
}

export interface CrowdfundingEvaluationResult {
  readonly campaignId: string;
  readonly title: string;
  readonly ipKind: IpFundingKind;
  readonly goalAmountKrw: number;
  readonly totalRaisedKrw: number;
  readonly totalBackers: number;
  readonly achievementRatePercent: number;
  readonly isFunded: boolean;
  readonly platformFeeKrw: number;
  readonly paymentFeeKrw: number;
  readonly fulfillmentCostKrw: number;
  readonly netDistributableKrw: number;
  readonly deficitWarningKo: string | null;
  readonly tierBreakdown: readonly CrowdfundingTierBreakdown[];
}

export function evaluateCrowdfundingCampaign(input: CrowdfundingCampaignInput): CrowdfundingEvaluationResult {
  const goalAmountKrw = Math.max(1, Math.floor(input.goalAmountKrw));
  const platformFeeRate = input.platformFeeRate ?? 0.05;
  const paymentFeeRate = input.paymentFeeRate ?? 0.032;

  let totalRaisedKrw = 0;
  let totalBackers = 0;
  let fulfillmentCostKrw = 0;

  const tierBreakdown: CrowdfundingTierBreakdown[] = input.rewardTiers.map((tier) => {
    const backers = Math.max(0, Math.floor(tier.backerCount));
    const price = Math.max(0, Math.floor(tier.priceKrw));
    const unitCost = Math.max(0, Math.floor(tier.unitFulfillmentCostKrw));
    const tierRevenueKrw = backers * price;
    const tierFulfillmentCostKrw = backers * unitCost;
    totalRaisedKrw += tierRevenueKrw;
    totalBackers += backers;
    fulfillmentCostKrw += tierFulfillmentCostKrw;
    const soldOut = tier.limitQuantity !== undefined && backers >= tier.limitQuantity;
    const overLimit = tier.limitQuantity !== undefined && backers > tier.limitQuantity;
    return {
      id: tier.id,
      title: tier.title,
      backerCount: backers,
      tierRevenueKrw,
      tierFulfillmentCostKrw,
      soldOut,
      overLimit,
    };
  });

  const platformFeeKrw = Math.round(totalRaisedKrw * platformFeeRate);
  const paymentFeeKrw = Math.round(totalRaisedKrw * paymentFeeRate);
  const netDistributableKrw = totalRaisedKrw - platformFeeKrw - paymentFeeKrw - fulfillmentCostKrw;
  const achievementRatePercent = Math.round((totalRaisedKrw / goalAmountKrw) * 1000) / 10;
  const isFunded = totalRaisedKrw >= goalAmountKrw;
  const deficitWarningKo =
    netDistributableKrw < 0
      ? `제작·배송 원가와 수수료가 모금액을 ${Math.abs(netDistributableKrw).toLocaleString("ko-KR")}원 초과했습니다. 리워드 단가를 조정하세요.`
      : null;

  return {
    campaignId: input.campaignId,
    title: input.title,
    ipKind: input.ipKind,
    goalAmountKrw,
    totalRaisedKrw,
    totalBackers,
    achievementRatePercent,
    isFunded,
    platformFeeKrw,
    paymentFeeKrw,
    fulfillmentCostKrw,
    netDistributableKrw,
    deficitWarningKo,
    tierBreakdown,
  };
}

export interface CopyrightStakeholder {
  readonly partyId: string;
  readonly name: string;
  readonly role: StakeholderRole;
  readonly sharePercent: number;
}

export interface StakeholderPayout {
  readonly partyId: string;
  readonly name: string;
  readonly role: StakeholderRole;
  readonly sharePercent: number;
  readonly shareBps: number;
  readonly payoutKrw: number;
}

export interface CopyrightSplitValidationResult {
  readonly valid: boolean;
  readonly totalSharePercent: number;
  readonly totalShareBps: number;
  readonly deltaPercent: number;
  readonly errors: readonly string[];
  readonly payouts: readonly StakeholderPayout[];
  readonly totalPayoutKrw: number;
}

const TOTAL_REQUIRED_BPS = 10000;

/** 참여 작가·스태프·스튜디오 지분 합계 100.00%(10,000 bps) 불변식 검증 및 ₩1 오차 없는 해밀턴 배분. */
export function validateCopyrightSplitAndDistribute(
  stakeholders: readonly CopyrightStakeholder[],
  netDistributableKrw: number,
): CopyrightSplitValidationResult {
  const errors: string[] = [];
  if (stakeholders.length === 0) {
    errors.push("최소 1명 이상의 저작권·수익 분배 참여자가 필요합니다.");
  }

  const seenIds = new Set<string>();
  const normalized = stakeholders.map((party) => {
    const bps = Number.isFinite(party.sharePercent) ? Math.round(party.sharePercent * 100) : -1;
    if (!party.partyId.trim() || !party.name.trim()) {
      errors.push("모든 참여자의 ID와 이름을 입력해야 합니다.");
    }
    if (seenIds.has(party.partyId)) {
      errors.push(`중복된 참여자 ID(${party.partyId})가 있습니다.`);
    }
    seenIds.add(party.partyId);
    if (bps <= 0) {
      errors.push(`${party.name || party.partyId}의 지분율은 0%보다 커야 합니다.`);
    }
    return { party, bps };
  });

  const totalShareBps = normalized.reduce((sum, item) => sum + Math.max(0, item.bps), 0);
  const totalSharePercent = Math.round(totalShareBps) / 100;
  const deltaPercent = Math.round(totalShareBps - TOTAL_REQUIRED_BPS) / 100;

  if (totalShareBps !== TOTAL_REQUIRED_BPS) {
    errors.push(
      `지분 합계가 ${totalSharePercent.toFixed(2)}%입니다. 계약 원장은 정확히 100.00%(차이 ${deltaPercent > 0 ? `+${deltaPercent.toFixed(2)}` : deltaPercent.toFixed(2)}%)일 때만 서명할 수 있습니다.`,
    );
  }

  if (errors.length > 0) {
    return {
      valid: false,
      totalSharePercent,
      totalShareBps,
      deltaPercent,
      errors,
      payouts: [],
      totalPayoutKrw: 0,
    };
  }

  const distributable = Math.max(0, Math.floor(netDistributableKrw));
  const rawAllocations = normalized.map((item, idx) => {
    const exact = (distributable * item.bps) / TOTAL_REQUIRED_BPS;
    const floorVal = Math.floor(exact);
    return {
      index: idx,
      party: item.party,
      bps: item.bps,
      floorVal,
      remainder: exact - floorVal,
    };
  });

  let leftover = distributable - rawAllocations.reduce((sum, item) => sum + item.floorVal, 0);
  const byRemainder = [...rawAllocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const bonusByIndex = new Map<number, number>();
  for (const item of byRemainder) {
    if (leftover <= 0) break;
    bonusByIndex.set(item.index, 1);
    leftover -= 1;
  }

  const payouts: StakeholderPayout[] = rawAllocations.map((item) => ({
    partyId: item.party.partyId,
    name: item.party.name,
    role: item.party.role,
    sharePercent: item.bps / 100,
    shareBps: item.bps,
    payoutKrw: item.floorVal + (bonusByIndex.get(item.index) ?? 0),
  }));

  const totalPayoutKrw = payouts.reduce((sum, item) => sum + item.payoutKrw, 0);
  return {
    valid: true,
    totalSharePercent: 100,
    totalShareBps: TOTAL_REQUIRED_BPS,
    deltaPercent: 0,
    errors: [],
    payouts,
    totalPayoutKrw,
  };
}

export type ContractLedgerEventType =
  | "genesis-rights-registration"
  | "funding-milestone-lock"
  | "split-amendment"
  | "payout-settlement";

export interface ContractLedgerBlock {
  readonly index: number;
  readonly timestampIso: string;
  readonly eventType: ContractLedgerEventType;
  readonly summary: string;
  readonly campaignId: string;
  readonly netDistributableKrw: number;
  readonly stakeholders: readonly CopyrightStakeholder[];
  readonly signerIds: readonly string[];
  readonly previousHash: string;
  readonly payloadHash: string;
  readonly blockHash: string;
  readonly gasFeeKrw: 0;
}

export interface ContractChainVerificationResult {
  readonly valid: boolean;
  readonly blockCount: number;
  readonly totalGasFeeKrw: number;
  readonly headHash: string;
  readonly tamperedBlockIndex: number | null;
  readonly issues: readonly string[];
}

function computeContractPayloadHash(fields: {
  readonly campaignId: string;
  readonly eventType: ContractLedgerEventType;
  readonly summary: string;
  readonly netDistributableKrw: number;
  readonly stakeholders: readonly CopyrightStakeholder[];
  readonly signerIds: readonly string[];
}): string {
  return sha256Hex(
    canonicalJson({
      campaignId: fields.campaignId,
      eventType: fields.eventType,
      summary: fields.summary,
      netDistributableKrw: Math.floor(fields.netDistributableKrw),
      stakeholders: fields.stakeholders.map((party) => ({
        partyId: party.partyId,
        name: party.name,
        role: party.role,
        shareBps: Math.round(party.sharePercent * 100),
      })),
      signerIds: [...fields.signerIds].sort(),
    }),
  );
}

function computeContractBlockHash(block: {
  readonly index: number;
  readonly timestampIso: string;
  readonly previousHash: string;
  readonly payloadHash: string;
  readonly gasFeeKrw: number;
}): string {
  return sha256Hex(
    canonicalJson({
      index: block.index,
      timestampIso: block.timestampIso,
      previousHash: block.previousHash,
      payloadHash: block.payloadHash,
      gasFeeKrw: block.gasFeeKrw,
    }),
  );
}

export function createContractLedgerGenesis(input: {
  readonly campaignId: string;
  readonly summary: string;
  readonly timestampIso: string;
  readonly netDistributableKrw: number;
  readonly stakeholders: readonly CopyrightStakeholder[];
  readonly signerIds: readonly string[];
}): { readonly ok: true; readonly chain: readonly ContractLedgerBlock[] } | { readonly ok: false; readonly errors: readonly string[] } {
  const split = validateCopyrightSplitAndDistribute(input.stakeholders, input.netDistributableKrw);
  if (!split.valid) {
    return { ok: false, errors: split.errors };
  }
  if (input.signerIds.length === 0) {
    return { ok: false, errors: ["최소 1명 이상의 서명자가 필요합니다."] };
  }

  const eventType: ContractLedgerEventType = "genesis-rights-registration";
  const payloadHash = computeContractPayloadHash({
    campaignId: input.campaignId,
    eventType,
    summary: input.summary,
    netDistributableKrw: input.netDistributableKrw,
    stakeholders: input.stakeholders,
    signerIds: input.signerIds,
  });
  const blockHash = computeContractBlockHash({
    index: 0,
    timestampIso: input.timestampIso,
    previousHash: GENESIS_PREVIOUS_HASH,
    payloadHash,
    gasFeeKrw: 0,
  });

  const genesis: ContractLedgerBlock = {
    index: 0,
    timestampIso: input.timestampIso,
    eventType,
    summary: input.summary,
    campaignId: input.campaignId,
    netDistributableKrw: Math.floor(input.netDistributableKrw),
    stakeholders: input.stakeholders.map((party) => ({ ...party })),
    signerIds: [...input.signerIds],
    previousHash: GENESIS_PREVIOUS_HASH,
    payloadHash,
    blockHash,
    gasFeeKrw: 0,
  };
  return { ok: true, chain: [genesis] };
}

export function appendContractLedgerBlock(
  chain: readonly ContractLedgerBlock[],
  input: {
    readonly eventType: Exclude<ContractLedgerEventType, "genesis-rights-registration">;
    readonly summary: string;
    readonly timestampIso: string;
    readonly netDistributableKrw: number;
    readonly stakeholders: readonly CopyrightStakeholder[];
    readonly signerIds: readonly string[];
  },
): { readonly ok: true; readonly chain: readonly ContractLedgerBlock[] } | { readonly ok: false; readonly errors: readonly string[] } {
  const currentCheck = verifyContractHashChain(chain);
  if (!currentCheck.valid || chain.length === 0) {
    return {
      ok: false,
      errors: currentCheck.issues.length > 0 ? currentCheck.issues : ["유효한 제네시스 계약 원장이 필요합니다."],
    };
  }
  const split = validateCopyrightSplitAndDistribute(input.stakeholders, input.netDistributableKrw);
  if (!split.valid) {
    return { ok: false, errors: split.errors };
  }
  if (input.signerIds.length === 0) {
    return { ok: false, errors: ["계약 블록 추가에는 최소 1명의 서명자가 필요합니다."] };
  }

  const head = chain[chain.length - 1];
  const nextIndex = head.index + 1;
  const payloadHash = computeContractPayloadHash({
    campaignId: head.campaignId,
    eventType: input.eventType,
    summary: input.summary,
    netDistributableKrw: input.netDistributableKrw,
    stakeholders: input.stakeholders,
    signerIds: input.signerIds,
  });
  const blockHash = computeContractBlockHash({
    index: nextIndex,
    timestampIso: input.timestampIso,
    previousHash: head.blockHash,
    payloadHash,
    gasFeeKrw: 0,
  });

  const nextBlock: ContractLedgerBlock = {
    index: nextIndex,
    timestampIso: input.timestampIso,
    eventType: input.eventType,
    summary: input.summary,
    campaignId: head.campaignId,
    netDistributableKrw: Math.floor(input.netDistributableKrw),
    stakeholders: input.stakeholders.map((party) => ({ ...party })),
    signerIds: [...input.signerIds],
    previousHash: head.blockHash,
    payloadHash,
    blockHash,
    gasFeeKrw: 0,
  };
  return { ok: true, chain: [...chain, nextBlock] };
}

/** 가스비 ₩0 SHA-256 해시체인 계약 원장의 무결성·연결성·지분 100% 불변식을 전수 검증한다. */
export function verifyContractHashChain(chain: readonly ContractLedgerBlock[]): ContractChainVerificationResult {
  if (chain.length === 0) {
    return {
      valid: false,
      blockCount: 0,
      totalGasFeeKrw: 0,
      headHash: GENESIS_PREVIOUS_HASH,
      tamperedBlockIndex: 0,
      issues: ["계약 원장이 비어 있습니다."],
    };
  }

  const issues: string[] = [];
  let tamperedBlockIndex: number | null = null;
  let totalGasFeeKrw = 0;

  for (let i = 0; i < chain.length; i += 1) {
    const block = chain[i];
    totalGasFeeKrw += block.gasFeeKrw;
    const recordTamper = (message: string) => {
      if (tamperedBlockIndex === null) tamperedBlockIndex = i;
      issues.push(`블록 #${i}: ${message}`);
    };

    if (block.index !== i) {
      recordTamper(`인덱스 불일치(기대 ${i}, 실제 ${block.index}).`);
    }
    if (block.gasFeeKrw !== 0) {
      recordTamper(`가스비 ₩0 정책 위반(${block.gasFeeKrw}원).`);
    }

    const expectedPrevHash = i === 0 ? GENESIS_PREVIOUS_HASH : chain[i - 1].blockHash;
    if (block.previousHash !== expectedPrevHash) {
      recordTamper("이전 블록 해시 연결이 끊어졌습니다.");
    }

    const split = validateCopyrightSplitAndDistribute(block.stakeholders, block.netDistributableKrw);
    if (!split.valid) {
      recordTamper(`지분 100% 불변식 위반(${split.totalSharePercent.toFixed(2)}%).`);
    }

    const expectedPayloadHash = computeContractPayloadHash({
      campaignId: block.campaignId,
      eventType: block.eventType,
      summary: block.summary,
      netDistributableKrw: block.netDistributableKrw,
      stakeholders: block.stakeholders,
      signerIds: block.signerIds,
    });
    if (block.payloadHash !== expectedPayloadHash) {
      recordTamper("계약 페이로드가 서명 이후 변조되었습니다(payloadHash 불일치).");
    }

    const expectedBlockHash = computeContractBlockHash({
      index: block.index,
      timestampIso: block.timestampIso,
      previousHash: block.previousHash,
      payloadHash: block.payloadHash,
      gasFeeKrw: block.gasFeeKrw,
    });
    if (block.blockHash !== expectedBlockHash) {
      recordTamper("블록 헤더 해시가 위변조되었습니다(blockHash 불일치).");
    }
  }

  return {
    valid: issues.length === 0,
    blockCount: chain.length,
    totalGasFeeKrw,
    headHash: chain[chain.length - 1]?.blockHash ?? GENESIS_PREVIOUS_HASH,
    tamperedBlockIndex,
    issues,
  };
}

export const SAMPLE_CROWDFUNDING_CAMPAIGN: CrowdfundingCampaignInput = Object.freeze({
  campaignId: "ip-fund-moonlight-vol1",
  title: "월광 서사시 단행본 1~3권 양장 한정판 + 스핀오프 북클릿",
  ipKind: "print-edition",
  goalAmountKrw: 20_000_000,
  platformFeeRate: 0.05,
  paymentFeeRate: 0.032,
  rewardTiers: [
    {
      id: "tier-vol1-3",
      title: "단행본 1~3권 양장 세트",
      priceKrw: 48_000,
      backerCount: 320,
      unitFulfillmentCostKrw: 14_500,
      limitQuantity: 500,
    },
    {
      id: "tier-goods-box",
      title: "한정 굿즈 아크릴·설정집 박스",
      priceKrw: 89_000,
      backerCount: 150,
      unitFulfillmentCostKrw: 27_000,
      limitQuantity: 250,
    },
    {
      id: "tier-spinoff-collector",
      title: "스핀오프 외전 + 친필 사인 컬렉터 에디션",
      priceKrw: 150_000,
      backerCount: 40,
      unitFulfillmentCostKrw: 42_000,
      limitQuantity: 50,
    },
  ],
});

export const SAMPLE_COPYRIGHT_STAKEHOLDERS: readonly CopyrightStakeholder[] = Object.freeze([
  { partyId: "party-lead", name: "서윤아 (메인 작가)", role: "lead-author", sharePercent: 50 },
  { partyId: "party-story", name: "한도윤 (스토리 각색)", role: "story-writer", sharePercent: 20 },
  { partyId: "party-assist", name: "이하린 (선화·채색 어시스트)", role: "line-artist", sharePercent: 15 },
  { partyId: "party-studio", name: "아틀리에 제작 스튜디오", role: "studio", sharePercent: 15 },
]);
