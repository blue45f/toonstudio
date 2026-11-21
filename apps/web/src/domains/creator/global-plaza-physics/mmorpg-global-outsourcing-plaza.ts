/**
 * MMORPG 대규모 군중형 글로벌 외주 · 프리랜서 모집 광장 엔진.
 *
 * - 60fps 공간 해시 & 3단계 LOD 컬링, 하이브리드 실시간/비동기 대기 풀 필터
 * - 동남아(베트남·태국·인도네시아·필리핀)·일본·미국 시차 겹침(KST 기준) 계산기
 * - 6종 통화(KRW·USD·VND·THB·IDR·JPY) 투명 단가 & 3단계 마일스톤 에스크로 환산기
 * - 1:1 단가 협상 -> 1클릭 퀘스트 발행 -> 분업 OS Cut-Slice 계약 인계 페이로드 생성
 */

import {
  CURRENCY_META,
  GLOBAL_TIMEZONE_REGIONS,
  PLAZA_CURRENCY_CODES,
  PLAZA_FX_RATES_PER_KRW,
  PLAZA_GUILD_ZONES,
  formatPlazaCurrency,
  type CrowdLodLevel,
  type FreelancerRoleKey,
  type GlobalRegionTimezoneId,
  type HybridCrowdFilterMode,
  type OutsourcingQuestPost,
  type PlazaCurrencyCode,
  type PlazaFreelancerAvatar,
  type PlazaGuildZoneId,
  type PortfolioVerificationTier,
} from "./global-plaza-crowd-catalog";
import type { PlazaLanguageCode } from "./realtime-meeting-voice-chat-engine";
import type { Vec2 } from "./vspace-physics-interactions-engine";

export {
  GLOBAL_TIMEZONE_REGIONS,
  PLAZA_CURRENCY_CODES,
  PLAZA_FX_RATES_PER_KRW,
  PLAZA_GUILD_ZONES,
  createGlobalPlazaCrowd,
  createInitialOutsourcingQuests,
  formatPlazaCurrency,
  type CrowdLodLevel,
  type CrowdPresenceKind,
  type FreelancerRoleKey,
  type GlobalRegionTimezoneId,
  type GlobalTimezoneRegion,
  type HybridCrowdFilterMode,
  type OutsourcingQuestPost,
  type OutsourcingTrustGuardrail,
  type PlazaCurrencyCode,
  type PlazaFreelancerAvatar,
  type PlazaGuildZone,
  type PlazaGuildZoneId,
  type PortfolioVerificationTier,
} from "./global-plaza-crowd-catalog";

export interface CrowdSpatialHashGrid {
  readonly cellSize: number;
  readonly cells: ReadonlyMap<string, readonly PlazaFreelancerAvatar[]>;
  readonly totalCount: number;
}

export interface VisibleCrowdAvatarItem {
  readonly avatar: PlazaFreelancerAvatar;
  readonly distanceToFocus: number;
  readonly lod: CrowdLodLevel;
}

export interface PlazaFreelancerFilterCriteria {
  readonly guildZoneId?: PlazaGuildZoneId | "all";
  readonly timezoneId?: GlobalRegionTimezoneId | "all";
  readonly language?: PlazaLanguageCode | "all";
  readonly presenceMode?: HybridCrowdFilterMode;
  readonly maxRateKrw?: number;
  readonly onlyImmediate?: boolean;
  readonly searchQuery?: string;
}

export interface KstOverlapResult {
  readonly partnerTimezoneId: GlobalRegionTimezoneId;
  readonly countryNameKo: string;
  readonly offsetFromKstHours: number;
  readonly offsetLabelKo: string;
  readonly overlapHours: number;
  readonly overlapSlotsKst: readonly number[];
  readonly overlapSummaryKo: string;
  readonly syncQuality: "prime" | "good" | "async-handoff";
}

export interface EscrowMilestoneStage {
  readonly stageKey: "kickoff-deposit" | "ad-mid-review" | "final-delivery";
  readonly labelKo: string;
  readonly ratioPct: number;
  readonly amountKrw: number;
  readonly amountLocal: number;
  readonly formattedLocal: string;
}

export interface CutRateEscrowBreakdown {
  readonly ratePerCutKrw: number;
  readonly cutCount: number;
  readonly grossKrw: number;
  readonly escrowFeeRate: number;
  readonly escrowFeeKrw: number;
  readonly totalDepositKrw: number;
  readonly netPayoutKrw: number;
  readonly targetCurrency: PlazaCurrencyCode;
  readonly ratePerCutLocal: number;
  readonly netPayoutLocal: number;
  readonly formattedPerCutLocal: string;
  readonly formattedNetPayoutLocal: string;
  readonly allCurrencies: Readonly<
    Record<
      PlazaCurrencyCode,
      {
        readonly perCut: number;
        readonly netTotal: number;
        readonly formattedPerCut: string;
        readonly formattedNetTotal: string;
      }
    >
  >;
  readonly milestones: readonly EscrowMilestoneStage[];
  readonly rateNoticeKo: string;
}

export interface RateNegotiationResult {
  readonly accepted: boolean;
  readonly verdict: "accepted" | "counter-offer";
  readonly agreedRatePerCutKrw: number;
  readonly counterRatePerCutKrw: number;
  readonly totalBudgetKrw: number;
  readonly replyKo: string;
  readonly replyPartnerLang: PlazaLanguageCode;
}

export interface DivisionOsCutSliceHandoffPayload {
  readonly schemaVersion: "toonstudio.cut-slice-handoff.v1";
  readonly projectId: string;
  readonly episodeId: string;
  readonly questId: string;
  readonly sliceId: string;
  readonly cutStart: number;
  readonly cutEnd: number;
  readonly cutCount: number;
  readonly divisionRoleFolder: "10_BG_3D" | "20_LINE" | "40_SHADE" | "60_LETTER";
  readonly contractorId: string;
  readonly contractorName: string;
  readonly contractorRegion: GlobalRegionTimezoneId;
  readonly contractorLang: PlazaLanguageCode;
  readonly portfolioTier: PortfolioVerificationTier;
  readonly onTimeDeliveryRatePct: number;
  readonly escrowTotalKrw: number;
  readonly escrowMilestones: readonly EscrowMilestoneStage[];
  readonly payoutCurrency: PlazaCurrencyCode;
  readonly payoutAmountLocal: number;
  readonly overlapHoursKst: number;
  readonly zeroLeakPolicy: {
    readonly scopedCutViewOnly: true;
    readonly forensicWatermarkRequired: true;
    readonly previewMaxWidthPx: number;
  };
  readonly createdAtIso: string;
}

/**
 * 서울(KST) 기준 동남아·글로벌 파트너와의 실시간 겹치는 근무 시간(Overlap Hours) 계산.
 */
export function computeKstWorkOverlap(
  studioStartKst: number,
  studioEndKst: number,
  partnerTimezoneId: GlobalRegionTimezoneId,
  partnerLocalStart = 9,
  partnerLocalEnd = 18,
): KstOverlapResult {
  const region = GLOBAL_TIMEZONE_REGIONS[partnerTimezoneId];
  const studioSlots = new Set<number>();
  const partnerSlotsKst = new Set<number>();

  const normHour = (hour: number): number => ((Math.floor(hour) % 24) + 24) % 24;

  const fillRange = (start: number, end: number, target: Set<number>): void => {
    const span = (((end - start) % 24) + 24) % 24;
    const count = span === 0 ? 24 : span;
    for (let offset = 0; offset < count; offset += 1) {
      target.add(normHour(start + offset));
    }
  };

  fillRange(studioStartKst, studioEndKst, studioSlots);
  fillRange(
    partnerLocalStart - region.offsetFromKstHours,
    partnerLocalEnd - region.offsetFromKstHours,
    partnerSlotsKst,
  );

  const overlapSlotsKst = [...studioSlots]
    .filter((hour) => partnerSlotsKst.has(hour))
    .sort((a, b) => a - b);

  const overlapHours = overlapSlotsKst.length;
  const offsetLabelKo =
    region.offsetFromKstHours === 0
      ? "KST 동일 (0시간)"
      : `KST 대비 ${region.offsetFromKstHours > 0 ? "+" : ""}${region.offsetFromKstHours}시간`;

  const syncQuality: KstOverlapResult["syncQuality"] =
    overlapHours >= 6 ? "prime" : overlapHours >= 3 ? "good" : "async-handoff";

  const overlapSummaryKo =
    overlapHours === 0
      ? "실시간 겹침 0시간 · 비동기 야간 바통터치 권장"
      : `${overlapHours}시간 동시 협업 가능 (${String(overlapSlotsKst[0]).padStart(2, "0")}:00~${String((overlapSlotsKst[overlapSlotsKst.length - 1] ?? 0) + 1).padStart(2, "0")}:00 KST)`;

  return {
    partnerTimezoneId,
    countryNameKo: region.countryNameKo,
    offsetFromKstHours: region.offsetFromKstHours,
    offsetLabelKo,
    overlapHours,
    overlapSlotsKst,
    overlapSummaryKo,
    syncQuality,
  };
}

/**
 * 6종 통화(KRW·USD·VND·THB·IDR·JPY) 컷당 단가 + 3단계 마일스톤 에스크로 환산기.
 */
export function convertCutRateAndEscrow(input: {
  readonly ratePerCutKrw: number;
  readonly cutCount: number;
  readonly targetCurrency: PlazaCurrencyCode;
  readonly escrowFeeRate?: number;
}): CutRateEscrowBreakdown {
  const safeRate = Math.max(1000, Math.round(input.ratePerCutKrw));
  const safeCuts = Math.max(1, Math.round(input.cutCount));
  const escrowFeeRate = Math.max(0, Math.min(0.15, input.escrowFeeRate ?? 0.03));

  const grossKrw = safeRate * safeCuts;
  const escrowFeeKrw = Math.round(grossKrw * escrowFeeRate);
  const totalDepositKrw = grossKrw + escrowFeeKrw;
  const netPayoutKrw = grossKrw;

  const allCurrencies = {} as Record<
    PlazaCurrencyCode,
    {
      readonly perCut: number;
      readonly netTotal: number;
      readonly formattedPerCut: string;
      readonly formattedNetTotal: string;
    }
  >;

  for (const code of PLAZA_CURRENCY_CODES) {
    const fx = PLAZA_FX_RATES_PER_KRW[code];
    const decimals = CURRENCY_META[code].decimals;
    const perCut =
      decimals === 0 ? Math.round(safeRate * fx) : Number((safeRate * fx).toFixed(decimals));
    const netTotal =
      decimals === 0 ? Math.round(netPayoutKrw * fx) : Number((netPayoutKrw * fx).toFixed(decimals));
    allCurrencies[code] = {
      perCut,
      netTotal,
      formattedPerCut: formatPlazaCurrency(perCut, code),
      formattedNetTotal: formatPlazaCurrency(netTotal, code),
    };
  }

  const targetFx = PLAZA_FX_RATES_PER_KRW[input.targetCurrency];
  const stageSpecs: ReadonlyArray<{
    readonly stageKey: EscrowMilestoneStage["stageKey"];
    readonly labelKo: string;
    readonly ratioPct: number;
  }> = [
    { stageKey: "kickoff-deposit", labelKo: "1단계 착수 예치 (시안 확인)", ratioPct: 30 },
    { stageKey: "ad-mid-review", labelKo: "2단계 AD 중간 검수 통과", ratioPct: 40 },
    { stageKey: "final-delivery", labelKo: "3단계 최종 납품 정산", ratioPct: 30 },
  ];

  const milestones: readonly EscrowMilestoneStage[] = stageSpecs.map((spec) => {
    const amountKrw = Math.round((netPayoutKrw * spec.ratioPct) / 100);
    const amountLocal = amountKrw * targetFx;
    return {
      stageKey: spec.stageKey,
      labelKo: spec.labelKo,
      ratioPct: spec.ratioPct,
      amountKrw,
      amountLocal:
        CURRENCY_META[input.targetCurrency].decimals === 0
          ? Math.round(amountLocal)
          : Number(amountLocal.toFixed(2)),
      formattedLocal: formatPlazaCurrency(amountLocal, input.targetCurrency),
    };
  });

  const targetEntry = allCurrencies[input.targetCurrency];
  return {
    ratePerCutKrw: safeRate,
    cutCount: safeCuts,
    grossKrw,
    escrowFeeRate,
    escrowFeeKrw,
    totalDepositKrw,
    netPayoutKrw,
    targetCurrency: input.targetCurrency,
    ratePerCutLocal: targetEntry.perCut,
    netPayoutLocal: targetEntry.netTotal,
    formattedPerCutLocal: targetEntry.formattedPerCut,
    formattedNetPayoutLocal: targetEntry.formattedNetTotal,
    allCurrencies,
    milestones,
    rateNoticeKo:
      "기준 환율 참고표 기준 추정치이며 실제 에스크로 출금은 정산 시점 고시환율을 적용합니다.",
  };
}

export function buildCrowdSpatialHash(
  avatars: readonly PlazaFreelancerAvatar[],
  cellSize = 120,
): CrowdSpatialHashGrid {
  const safeCellSize = Math.max(40, cellSize);
  const buckets = new Map<string, PlazaFreelancerAvatar[]>();

  for (const avatar of avatars) {
    const key = `${Math.floor(avatar.x / safeCellSize)}:${Math.floor(avatar.y / safeCellSize)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(avatar);
    else buckets.set(key, [avatar]);
  }

  return { cellSize: safeCellSize, cells: buckets, totalCount: avatars.length };
}

export function queryVisibleCrowdWithLod(
  grid: CrowdSpatialHashGrid,
  viewport: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number },
  cameraFocus: Vec2,
  options: { readonly fullBubbleRadius?: number; readonly compactBadgeRadius?: number } = {},
): readonly VisibleCrowdAvatarItem[] {
  const fullRadius = options.fullBubbleRadius ?? 135;
  const compactRadius = options.compactBadgeRadius ?? 285;
  const minCx = Math.floor(viewport.minX / grid.cellSize);
  const maxCx = Math.floor(viewport.maxX / grid.cellSize);
  const minCy = Math.floor(viewport.minY / grid.cellSize);
  const maxCy = Math.floor(viewport.maxY / grid.cellSize);

  const visible: VisibleCrowdAvatarItem[] = [];

  for (let cx = minCx; cx <= maxCx; cx += 1) {
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      const cellItems = grid.cells.get(`${cx}:${cy}`);
      if (!cellItems) continue;
      for (const avatar of cellItems) {
        if (
          avatar.x < viewport.minX ||
          avatar.x > viewport.maxX ||
          avatar.y < viewport.minY ||
          avatar.y > viewport.maxY
        ) {
          continue;
        }
        const dist = Math.hypot(avatar.x - cameraFocus.x, avatar.y - cameraFocus.y);
        const lod: CrowdLodLevel =
          dist <= fullRadius
            ? "full-bubble"
            : dist <= compactRadius
              ? "compact-badge"
              : "dot-cluster";
        visible.push({ avatar, distanceToFocus: Number(dist.toFixed(1)), lod });
      }
    }
  }

  visible.sort((a, b) => a.distanceToFocus - b.distanceToFocus);
  return visible;
}

export function filterPlazaFreelancers(
  avatars: readonly PlazaFreelancerAvatar[],
  criteria: PlazaFreelancerFilterCriteria,
): readonly PlazaFreelancerAvatar[] {
  const query = criteria.searchQuery?.trim().toLowerCase() ?? "";
  return avatars.filter((item) => {
    if (criteria.guildZoneId && criteria.guildZoneId !== "all" && item.guildZoneId !== criteria.guildZoneId) {
      return false;
    }
    if (criteria.timezoneId && criteria.timezoneId !== "all" && item.timezoneId !== criteria.timezoneId) {
      return false;
    }
    if (criteria.language && criteria.language !== "all" && !item.languages.includes(criteria.language)) {
      return false;
    }
    if (criteria.presenceMode === "live-only" && item.presenceKind !== "live-online") return false;
    if (criteria.presenceMode === "async-verified-pool" && item.presenceKind !== "async-standby") return false;
    if (criteria.onlyImmediate && item.availabilityStatus !== "immediate") return false;
    if (typeof criteria.maxRateKrw === "number" && item.ratePerCutKrw > criteria.maxRateKrw) return false;
    if (query) {
      const hay = `${item.displayName} ${item.handle} ${item.roleKo} ${item.countryNameKo} ${item.trust.portfolioBadgeKo}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function summarizeHybridCrowdPresence(avatars: readonly PlazaFreelancerAvatar[]): {
  readonly total: number;
  readonly liveOnlineCount: number;
  readonly asyncStandbyCount: number;
  readonly immediateCount: number;
  readonly seaPartnerCount: number;
} {
  let liveOnlineCount = 0;
  let asyncStandbyCount = 0;
  let immediateCount = 0;
  let seaPartnerCount = 0;

  for (const item of avatars) {
    if (item.presenceKind === "live-online") liveOnlineCount += 1;
    else asyncStandbyCount += 1;
    if (item.availabilityStatus === "immediate") immediateCount += 1;
    if (
      item.countryCode === "VN" ||
      item.countryCode === "TH" ||
      item.countryCode === "ID" ||
      item.countryCode === "PH"
    ) {
      seaPartnerCount += 1;
    }
  }

  return { total: avatars.length, liveOnlineCount, asyncStandbyCount, immediateCount, seaPartnerCount };
}

export function negotiateFreelancerRate(
  freelancer: PlazaFreelancerAvatar,
  proposedRateKrw: number,
  cutCount: number,
): RateNegotiationResult {
  const safeProposal = Math.max(1000, Math.round(proposedRateKrw));
  const safeCuts = Math.max(1, Math.round(cutCount));
  const minAcceptable = Math.round(freelancer.ratePerCutKrw * 0.9);

  if (safeProposal >= minAcceptable) {
    return {
      accepted: true,
      verdict: "accepted",
      agreedRatePerCutKrw: safeProposal,
      counterRatePerCutKrw: safeProposal,
      totalBudgetKrw: safeProposal * safeCuts,
      replyKo: `${freelancer.displayName}님이 컷당 ${formatPlazaCurrency(safeProposal, "KRW")} × ${safeCuts}컷 조건(3단계 에스크로)을 수락했습니다.`,
      replyPartnerLang: freelancer.primaryLang,
    };
  }

  const counterRatePerCutKrw = Math.round((freelancer.ratePerCutKrw + minAcceptable) / 2 / 500) * 500;
  return {
    accepted: false,
    verdict: "counter-offer",
    agreedRatePerCutKrw: counterRatePerCutKrw,
    counterRatePerCutKrw,
    totalBudgetKrw: counterRatePerCutKrw * safeCuts,
    replyKo: `${freelancer.displayName}님이 컷당 ${formatPlazaCurrency(counterRatePerCutKrw, "KRW")} 절충안을 제안했습니다 (납기 준수율 ${freelancer.trust.onTimeDeliveryRatePct}%).`,
    replyPartnerLang: freelancer.primaryLang,
  };
}

export function publishOutsourcingQuest(input: {
  readonly titleKo: string;
  readonly guildZoneId: PlazaGuildZoneId;
  readonly roleKey: FreelancerRoleKey;
  readonly episodeId: string;
  readonly cutRangeStart: number;
  readonly cutRangeEnd: number;
  readonly budgetPerCutKrw: number;
  readonly targetCurrency: PlazaCurrencyCode;
  readonly targetLanguages: readonly PlazaLanguageCode[];
  readonly existingCount: number;
  readonly nowIso: string;
}): OutsourcingQuestPost {
  const start = Math.max(1, Math.round(input.cutRangeStart));
  const end = Math.max(start, Math.round(input.cutRangeEnd));
  return {
    questId: `quest-${input.episodeId}-${String(input.existingCount + 1).padStart(2, "0")}`,
    titleKo: input.titleKo.trim() || `${input.episodeId} ${start}~${end}컷 글로벌 외주 모집`,
    guildZoneId: input.guildZoneId,
    roleKey: input.roleKey,
    episodeId: input.episodeId,
    cutRangeStart: start,
    cutRangeEnd: end,
    cutCount: end - start + 1,
    budgetPerCutKrw: Math.max(1000, Math.round(input.budgetPerCutKrw)),
    targetCurrency: input.targetCurrency,
    targetLanguages: input.targetLanguages.length > 0 ? input.targetLanguages : ["ko", "en"],
    status: "recruiting",
    dispatchMode: "live-plaza-and-async-board",
    matchedFreelancerId: null,
    applicantIds: [],
    trustGuardrailSummaryKo: "포트폴리오 검증 필수 · 30/40/30 에스크로 · 부분 컷 워터마크 열람",
    createdAtIso: input.nowIso,
  };
}

export function createDivisionOsCutSliceHandoff(input: {
  readonly projectId: string;
  readonly quest: OutsourcingQuestPost;
  readonly freelancer: PlazaFreelancerAvatar;
  readonly agreedRatePerCutKrw?: number;
  readonly nowIso: string;
}): DivisionOsCutSliceHandoffPayload {
  const zone =
    PLAZA_GUILD_ZONES.find((item) => item.id === input.quest.guildZoneId) ?? PLAZA_GUILD_ZONES[0]!;
  const rateKrw = input.agreedRatePerCutKrw ?? input.quest.budgetPerCutKrw;
  const escrow = convertCutRateAndEscrow({
    ratePerCutKrw: rateKrw,
    cutCount: input.quest.cutCount,
    targetCurrency: input.quest.targetCurrency,
  });
  const overlap = computeKstWorkOverlap(
    9,
    18,
    input.freelancer.timezoneId,
    input.freelancer.workHoursLocal.startHour,
    input.freelancer.workHoursLocal.endHour,
  );

  return {
    schemaVersion: "toonstudio.cut-slice-handoff.v1",
    projectId: input.projectId,
    episodeId: input.quest.episodeId,
    questId: input.quest.questId,
    sliceId: `${input.quest.episodeId}-slice-${input.quest.cutRangeStart}-${input.quest.cutRangeEnd}`,
    cutStart: input.quest.cutRangeStart,
    cutEnd: input.quest.cutRangeEnd,
    cutCount: input.quest.cutCount,
    divisionRoleFolder: zone.divisionRoleFolder,
    contractorId: input.freelancer.id,
    contractorName: input.freelancer.displayName,
    contractorRegion: input.freelancer.timezoneId,
    contractorLang: input.freelancer.primaryLang,
    portfolioTier: input.freelancer.trust.portfolioTier,
    onTimeDeliveryRatePct: input.freelancer.trust.onTimeDeliveryRatePct,
    escrowTotalKrw: escrow.totalDepositKrw,
    escrowMilestones: escrow.milestones,
    payoutCurrency: input.quest.targetCurrency,
    payoutAmountLocal: escrow.netPayoutLocal,
    overlapHoursKst: overlap.overlapHours,
    zeroLeakPolicy: {
      scopedCutViewOnly: true,
      forensicWatermarkRequired: true,
      previewMaxWidthPx: input.freelancer.trust.previewMaxWidthPx,
    },
    createdAtIso: input.nowIso,
  };
}
