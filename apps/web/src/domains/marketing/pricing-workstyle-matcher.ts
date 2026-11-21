/**
 * 요금제 3초 작업 스타일 맞춤 등급 진단기 — 순수 정책 모델.
 *
 * - 모든 수치와 기능 지원 여부는 `MEMBERSHIP_PLAN_POLICIES` 정본에서만 읽는다.
 * - 추정 요금·가짜 할인·결제 동선을 만들지 않으며, 베타 무료 정책을 그대로 반영한다.
 */

import {
  MEMBERSHIP_ECONOMY_POLICY,
  MEMBERSHIP_PLAN_IDS,
  MEMBERSHIP_PLAN_POLICIES,
  MEMBERSHIP_PLAN_RANK,
  type MembershipPlanId,
} from "@toonstudio/core/membership-wallet";

export type PricingWorkstyleId =
  | "solo-starter"
  | "steady-serial"
  | "pro-market"
  | "studio-team";

export type PricingWorkstyleTone = "good" | "cool" | "accent" | "accent-2";

export type PricingUpgradeReason = "none" | "collaborators" | "market-hires" | "both";

export interface PricingWorkstylePreset {
  readonly id: PricingWorkstyleId;
  readonly basePlanId: MembershipPlanId;
  readonly tone: PricingWorkstyleTone;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly defaultCollaborators: number;
  readonly defaultNeedsMarketOrHiRes: boolean;
}

export interface PricingWorkstyleInput {
  readonly workstyle: PricingWorkstyleId;
  readonly collaborators: number;
  readonly needsMarketOrHiRes: boolean;
}

export interface PricingPolicyMetrics {
  readonly storageBytes: number;
  readonly storageLabel: string;
  readonly aiMonthlyTokens: number;
  readonly creditMonthlyIncluded: number;
  readonly collaborationMembers: number;
  readonly marketSell: boolean;
  readonly highResolutionExport: boolean;
}

export interface PricingWorkstyleMatch {
  readonly planId: MembershipPlanId;
  readonly planLabel: string;
  readonly tone: PricingWorkstyleTone;
  readonly workstyle: PricingWorkstyleId;
  readonly collaborators: number;
  readonly needsMarketOrHiRes: boolean;
  readonly upgradedBy: PricingUpgradeReason;
  readonly reasonKo: string;
  readonly reasonEn: string;
  readonly metrics: PricingPolicyMetrics;
  readonly ctaHref: "/studio/new" | "/membership";
  readonly ctaLabelKo: string;
  readonly ctaLabelEn: string;
  readonly paymentsEnabled: boolean;
}

export const MIN_COLLABORATORS = 1;
export const MAX_COLLABORATORS = 10;

const GB = 1_000_000_000;
const MB = 1_000_000;

export const PRICING_WORKSTYLE_PRESETS: readonly PricingWorkstylePreset[] = [
  {
    id: "solo-starter",
    basePlanId: "free",
    tone: "good",
    labelKo: "혼자 입문",
    labelEn: "Solo starter",
    summaryKo: "기본 창작·커뮤니티·개인 연습",
    summaryEn: "Core drawing, community & personal practice",
    defaultCollaborators: 1,
    defaultNeedsMarketOrHiRes: false,
  },
  {
    id: "steady-serial",
    basePlanId: "creator",
    tone: "cool",
    labelKo: "꾸준한 개인 연재",
    labelEn: "Steady solo serial",
    summaryKo: "정기 공개·100GB 저장·고해상도",
    summaryEn: "Regular publishing, 100GB storage & hi-res",
    defaultCollaborators: 2,
    defaultNeedsMarketOrHiRes: true,
  },
  {
    id: "pro-market",
    basePlanId: "pro",
    tone: "accent",
    labelKo: "고해상도·마켓 판매",
    labelEn: "Hi-res & market selling",
    summaryKo: "500GB 대용량·마켓 대량 배포",
    summaryEn: "500GB volume & high-volume market selling",
    defaultCollaborators: 4,
    defaultNeedsMarketOrHiRes: true,
  },
  {
    id: "studio-team",
    basePlanId: "team",
    tone: "accent-2",
    labelKo: "다인 스튜디오 팀",
    labelEn: "Studio team",
    summaryKo: "1,000GB·대규모 팀 장기 제작",
    summaryEn: "1,000GB & studio-scale long-term teamwork",
    defaultCollaborators: 10,
    defaultNeedsMarketOrHiRes: true,
  },
] as const;

const PLAN_TONE_MAP: Readonly<Record<MembershipPlanId, PricingWorkstyleTone>> = {
  free: "good",
  creator: "cool",
  pro: "accent",
  team: "accent-2",
};

export function clampCollaborators(value: number): number {
  if (!Number.isFinite(value)) return MIN_COLLABORATORS;
  return Math.min(MAX_COLLABORATORS, Math.max(MIN_COLLABORATORS, Math.round(value)));
}

export function resolveWorkstylePreset(id: PricingWorkstyleId): PricingWorkstylePreset {
  return PRICING_WORKSTYLE_PRESETS.find((item) => item.id === id) ?? PRICING_WORKSTYLE_PRESETS[0];
}

export function getDefaultInputForWorkstyle(workstyle: PricingWorkstyleId): PricingWorkstyleInput {
  const preset = resolveWorkstylePreset(workstyle);
  return {
    workstyle: preset.id,
    collaborators: preset.defaultCollaborators,
    needsMarketOrHiRes: preset.defaultNeedsMarketOrHiRes,
  };
}

export function formatPolicyStorage(bytes: number): string {
  if (bytes >= GB) {
    return `${new Intl.NumberFormat("ko-KR").format(Math.round(bytes / GB))}GB`;
  }
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(bytes / MB))}MB`;
}

export function formatPolicyNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function extractPolicyMetrics(planId: MembershipPlanId): PricingPolicyMetrics {
  const entitlements = MEMBERSHIP_PLAN_POLICIES[planId].entitlements;
  const storageBytes = Number(entitlements["storage.bytes"]);
  return {
    storageBytes,
    storageLabel: formatPolicyStorage(storageBytes),
    aiMonthlyTokens: Number(entitlements["ai.monthlyTokens"]),
    creditMonthlyIncluded: Number(entitlements["credit.monthlyIncluded"]),
    collaborationMembers: Number(entitlements["collaboration.members"]),
    marketSell: Boolean(entitlements["market.sell"]),
    highResolutionExport: Boolean(entitlements["export.highResolution"]),
  };
}

function findLowestPlanMatching(
  predicate: (planId: MembershipPlanId) => boolean,
): MembershipPlanId {
  for (const planId of MEMBERSHIP_PLAN_IDS) {
    if (predicate(planId)) return planId;
  }
  return "team";
}

function higherPlan(a: MembershipPlanId, b: MembershipPlanId): MembershipPlanId {
  return MEMBERSHIP_PLAN_RANK[b] > MEMBERSHIP_PLAN_RANK[a] ? b : a;
}

/**
 * 사용자의 작업 형태·협업 인원·마켓 판매/고해상도 필요 여부에 따라
 * `MEMBERSHIP_PLAN_POLICIES` 실측 한도를 기준으로 가장 알맞은 등급을 계산한다.
 */
export function matchMembershipPlanByWorkstyle(
  rawInput: PricingWorkstyleInput,
): PricingWorkstyleMatch {
  const preset = resolveWorkstylePreset(rawInput.workstyle);
  const collaborators = clampCollaborators(rawInput.collaborators);
  const needsMarketOrHiRes = Boolean(rawInput.needsMarketOrHiRes);

  let selectedPlanId: MembershipPlanId = preset.basePlanId;
  let bumpedByMarketHiRes = false;
  let bumpedByCollaborators = false;

  if (needsMarketOrHiRes) {
    const currentMetrics = extractPolicyMetrics(selectedPlanId);
    if (!currentMetrics.marketSell || !currentMetrics.highResolutionExport) {
      const marketTier = findLowestPlanMatching((id) => {
        const m = extractPolicyMetrics(id);
        return m.marketSell && m.highResolutionExport;
      });
      const promoted = higherPlan(selectedPlanId, marketTier);
      if (promoted !== selectedPlanId) {
        selectedPlanId = promoted;
        bumpedByMarketHiRes = true;
      }
    }
  }

  const afterMarketMetrics = extractPolicyMetrics(selectedPlanId);
  if (collaborators > afterMarketMetrics.collaborationMembers) {
    const collabTier = findLowestPlanMatching(
      (id) => extractPolicyMetrics(id).collaborationMembers >= collaborators,
    );
    const promoted = higherPlan(selectedPlanId, collabTier);
    if (promoted !== selectedPlanId) {
      selectedPlanId = promoted;
      bumpedByCollaborators = true;
    }
  }

  const upgradedBy: PricingUpgradeReason =
    bumpedByMarketHiRes && bumpedByCollaborators
      ? "both"
      : bumpedByCollaborators
        ? "collaborators"
        : bumpedByMarketHiRes
          ? "market-hires"
          : "none";

  const policy = MEMBERSHIP_PLAN_POLICIES[selectedPlanId];
  const metrics = extractPolicyMetrics(selectedPlanId);
  const baseMetrics = extractPolicyMetrics(preset.basePlanId);
  const baseLabel = MEMBERSHIP_PLAN_POLICIES[preset.basePlanId].label;

  let reasonKo: string;
  let reasonEn: string;

  if (upgradedBy === "both") {
    reasonKo = `협업 ${collaborators}명과 마켓 판매·고해상도 내보내기를 모두 만족하는 최소 등급이 ${policy.label}입니다 (${baseLabel} 한도 ${baseMetrics.collaborationMembers}명 초과).`;
    reasonEn = `${policy.label} is the lowest tier covering ${collaborators} collaborators plus market selling and high-res export (${baseLabel} caps at ${baseMetrics.collaborationMembers}).`;
  } else if (upgradedBy === "collaborators") {
    reasonKo = `협업 인원 ${collaborators}명은 ${baseLabel} 한도(${baseMetrics.collaborationMembers}명)를 넘어, 최대 ${formatPolicyNumber(metrics.collaborationMembers)}명까지 지원하는 ${policy.label}가 알맞아요.`;
    reasonEn = `${collaborators} collaborators exceeds the ${baseLabel} limit (${baseMetrics.collaborationMembers}), so ${policy.label} (up to ${formatPolicyNumber(metrics.collaborationMembers)}) fits best.`;
  } else if (upgradedBy === "market-hires") {
    reasonKo = `마켓 판매와 고해상도 내보내기는 ${policy.label} 등급부터 지원해요 (저장공간 ${metrics.storageLabel}, 월 크레딧 ${formatPolicyNumber(metrics.creditMonthlyIncluded)}).`;
    reasonEn = `Market selling and high-resolution export unlock starting on ${policy.label} (${metrics.storageLabel} storage, ${formatPolicyNumber(metrics.creditMonthlyIncluded)} monthly credits).`;
  } else if (selectedPlanId === "free") {
    reasonKo = `저장공간 ${metrics.storageLabel}·협업 최대 ${metrics.collaborationMembers}명·월 크레딧 ${formatPolicyNumber(metrics.creditMonthlyIncluded)}로 가볍게 개인 작업을 시작하기에 충분해요.`;
    reasonEn = `${metrics.storageLabel} storage, up to ${metrics.collaborationMembers} collaborators, and ${formatPolicyNumber(metrics.creditMonthlyIncluded)} monthly credits are plenty to start solo.`;
  } else if (selectedPlanId === "creator") {
    reasonKo = `저장공간 ${metrics.storageLabel}·AI 월 토큰 ${formatPolicyNumber(metrics.aiMonthlyTokens)}·마켓 판매와 고해상도 내보내기를 함께 써서 꾸준한 개인 연재에 딱 맞아요.`;
    reasonEn = `${metrics.storageLabel} storage, ${formatPolicyNumber(metrics.aiMonthlyTokens)} monthly AI tokens, market selling, and high-res export fit steady solo serialization.`;
  } else if (selectedPlanId === "pro") {
    reasonKo = `저장공간 ${metrics.storageLabel}·AI 월 토큰 ${formatPolicyNumber(metrics.aiMonthlyTokens)}·협업 최대 ${metrics.collaborationMembers}명으로 대용량 배포와 마켓 운영을 여유롭게 소화해요.`;
    reasonEn = `${metrics.storageLabel} storage, ${formatPolicyNumber(metrics.aiMonthlyTokens)} monthly AI tokens, and up to ${metrics.collaborationMembers} collaborators handle heavy publishing and market ops.`;
  } else {
    reasonKo = `저장공간 ${metrics.storageLabel}·AI 월 토큰 ${formatPolicyNumber(metrics.aiMonthlyTokens)}·협업 최대 ${metrics.collaborationMembers}명으로 다인 스튜디오 장기 제작에 알맞아요.`;
    reasonEn = `${metrics.storageLabel} storage, ${formatPolicyNumber(metrics.aiMonthlyTokens)} monthly AI tokens, and up to ${metrics.collaborationMembers} collaborators support studio-scale teams.`;
  }

  const isFree = selectedPlanId === "free";

  return {
    planId: selectedPlanId,
    planLabel: policy.label,
    tone: PLAN_TONE_MAP[selectedPlanId],
    workstyle: preset.id,
    collaborators,
    needsMarketOrHiRes,
    upgradedBy,
    reasonKo,
    reasonEn,
    metrics,
    ctaHref: isFree ? "/studio/new" : "/membership",
    ctaLabelKo: isFree ? "무료로 바로 시작하기" : `${policy.label} 정책·열림 조건 보기`,
    ctaLabelEn: isFree ? "Start free now" : `See ${policy.label} policy & eligibility`,
    paymentsEnabled: MEMBERSHIP_ECONOMY_POLICY.paymentsEnabled,
  };
}
