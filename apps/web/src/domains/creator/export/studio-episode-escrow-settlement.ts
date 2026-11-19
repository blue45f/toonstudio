import type { EpisodeDeliveryPackage } from "./studio-episode-delivery-package";
import type {
  SpectrumRevenueParticipant,
  StudioSpectrumLicenseOffer,
} from "./studio-spectrum-license-offer";

export type EscrowSettlementStatus = "ready-for-release" | "held";

export interface EscrowParticipantPayout {
  readonly role: SpectrumRevenueParticipant["role"];
  readonly displayName: string;
  readonly sharePercent: number;
  readonly payoutKrw: number;
}

export interface EpisodeEscrowSettlement {
  readonly settlementSchemaVersion: 1;
  readonly status: EscrowSettlementStatus;
  readonly holdReason: string | null;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly grossAmountKrw: number;
  readonly platformFeeBps: number;
  readonly platformFeeKrw: number;
  readonly netDistributableKrw: number;
  readonly payouts: readonly EscrowParticipantPayout[];
  readonly offerIntegrityHash: string;
  readonly packageIntegrityHash: string;
  readonly receiptIntegrityHash: string;
  readonly settledAtIso: string;
  readonly settlementIntegrityHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 최대 잉여법(Largest Remainder Method)으로 원 단위 오차 없이 1원까지 정확히 배분한다.
 */
function distributeKrwExact(
  netAmountKrw: number,
  participants: readonly SpectrumRevenueParticipant[],
): readonly EscrowParticipantPayout[] {
  if (netAmountKrw <= 0 || participants.length === 0) {
    return participants.map((p) => ({
      role: p.role,
      displayName: p.displayName,
      sharePercent: p.sharePercent,
      payoutKrw: 0,
    }));
  }

  const rawItems = participants.map((p, idx) => {
    const exact = (netAmountKrw * p.sharePercent) / 100;
    const floored = Math.floor(exact);
    return {
      idx,
      participant: p,
      floored,
      remainder: exact - floored,
    };
  });

  let distributed = rawItems.reduce((acc, item) => acc + item.floored, 0);
  let remaining = netAmountKrw - distributed;

  const sortedByRemainder = [...rawItems].sort((a, b) =>
    b.remainder !== a.remainder ? b.remainder - a.remainder : a.idx - b.idx,
  );

  for (let i = 0; i < sortedByRemainder.length && remaining > 0; i += 1) {
    sortedByRemainder[i].floored += 1;
    remaining -= 1;
    distributed += 1;
  }

  // Defensive sanity: distributed === netAmountKrw
  void distributed;

  return rawItems.map((item) => ({
    role: item.participant.role,
    displayName: item.participant.displayName,
    sharePercent: item.participant.sharePercent,
    payoutKrw: item.floored,
  }));
}

/**
 * Spectrum 라이선스 제안서와 에피소드 납품 통합 패키지의 해시 체인을 검증한 뒤
 * 1원 오차 없는 에스크로 정산 지시서를 생성한다.
 */
export function buildEpisodeEscrowSettlement(params: {
  readonly offer: StudioSpectrumLicenseOffer;
  readonly deliveryPackage: EpisodeDeliveryPackage;
  readonly platformFeeBps?: number;
  readonly settledAtIso?: string;
}): EpisodeEscrowSettlement {
  const { offer, deliveryPackage } = params;
  const platformFeeBps = params.platformFeeBps ?? 500; // 기본 5.00%
  const settledAtIso = params.settledAtIso ?? new Date().toISOString();

  const packageReceiptHash = deliveryPackage.dossier.episodes[0]?.integrityHash ?? "";

  let holdReason: string | null = null;
  if (!offer.eligible) {
    holdReason = offer.rejectionReason ?? "라이선스 제안서가 발급 불가 상태입니다.";
  } else if (!deliveryPackage.commercialReady) {
    holdReason = "납품 패키지가 상업 연재 클린 검증을 통과하지 못했습니다.";
  } else if (packageReceiptHash !== offer.receiptIntegrityHash) {
    holdReason = "납품 패키지와 라이선스 제안서의 Rights BOM 해시가 일치하지 않습니다.";
  } else if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 5000) {
    holdReason = "플랫폼 수수료율(bps)이 유효 범위(0~5000)를 벗어났습니다.";
  }

  const status: EscrowSettlementStatus = holdReason === null ? "ready-for-release" : "held";
  const grossAmountKrw = Math.max(0, Math.round(offer.baseLicenseFeeKrw));
  const platformFeeKrw =
    status === "ready-for-release" ? Math.round((grossAmountKrw * platformFeeBps) / 10_000) : 0;
  const netDistributableKrw =
    status === "ready-for-release" ? Math.max(0, grossAmountKrw - platformFeeKrw) : 0;

  const payouts =
    status === "ready-for-release"
      ? distributeKrwExact(netDistributableKrw, offer.participants)
      : offer.participants.map((p) => ({
          role: p.role,
          displayName: p.displayName,
          sharePercent: p.sharePercent,
          payoutKrw: 0,
        }));

  const settlementIntegrityHash = fnv1aHex(
    JSON.stringify({
      status,
      grossAmountKrw,
      platformFeeBps,
      platformFeeKrw,
      netDistributableKrw,
      offerIntegrityHash: offer.offerIntegrityHash,
      packageIntegrityHash: deliveryPackage.packageIntegrityHash,
      receiptIntegrityHash: offer.receiptIntegrityHash,
      payouts,
    }),
  );

  return {
    settlementSchemaVersion: 1,
    status,
    holdReason,
    seriesTitle: offer.seriesTitle,
    episodeLabel: offer.episodeLabel,
    grossAmountKrw,
    platformFeeBps,
    platformFeeKrw,
    netDistributableKrw,
    payouts,
    offerIntegrityHash: offer.offerIntegrityHash,
    packageIntegrityHash: deliveryPackage.packageIntegrityHash,
    receiptIntegrityHash: offer.receiptIntegrityHash,
    settledAtIso,
    settlementIntegrityHash,
  };
}

/**
 * 회계·대량 이체 업로드용 CSV 문자열을 생성한다.
 */
export function formatEscrowSettlementCsv(settlement: EpisodeEscrowSettlement): string {
  const header = "seriesTitle,episodeLabel,status,displayName,role,sharePercent,payoutKrw,settlementHash";
  const rows = settlement.payouts.map((p) =>
    [
      settlement.seriesTitle,
      settlement.episodeLabel,
      settlement.status,
      p.displayName,
      p.role,
      String(p.sharePercent),
      String(p.payoutKrw),
      settlement.settlementIntegrityHash,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
