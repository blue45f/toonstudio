import type { StudioAiOptOutManifest } from "./studio-ai-optout-manifest";
import type { StudioWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

export type SpectrumLicenseTier =
  | "episode-serialization-only"
  | "secondary-ip-adaptation"
  | "verified-ai-optin-royalty";

export interface SpectrumRevenueParticipant {
  readonly role: "story" | "art" | "bg3d-assistant" | "agency";
  readonly displayName: string;
  readonly sharePercent: number;
}

export interface StudioSpectrumLicenseOffer {
  readonly offerSchemaVersion: 1;
  readonly eligible: boolean;
  readonly rejectionReason: string | null;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly tier: SpectrumLicenseTier;
  readonly tdmReservation: 0 | 1;
  readonly receiptIntegrityHash: string;
  readonly optOutManifestHash: string;
  readonly baseLicenseFeeKrw: number;
  readonly participants: readonly SpectrumRevenueParticipant[];
  readonly issuedAtIso: string;
  readonly offerIntegrityHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function validateRevenueParticipants(
  participants: readonly SpectrumRevenueParticipant[],
): { readonly valid: boolean; readonly totalPercent: number; readonly error: string | null } {
  if (participants.length === 0) {
    return { valid: false, totalPercent: 0, error: "수익 분배 참여자가 최소 1명 이상 필요합니다." };
  }
  let sum = 0;
  for (const p of participants) {
    if (!p.displayName.trim()) {
      return { valid: false, totalPercent: sum, error: "참여자 이름이 비어 있습니다." };
    }
    if (!Number.isFinite(p.sharePercent) || p.sharePercent <= 0 || p.sharePercent > 100) {
      return {
        valid: false,
        totalPercent: sum,
        error: `${p.displayName}의 분배율(${p.sharePercent}%)이 유효 범위(0~100%)를 벗어났습니다.`,
      };
    }
    sum += p.sharePercent;
  }
  if (Math.round(sum * 100) !== 10000) {
    return {
      valid: false,
      totalPercent: sum,
      error: `수익 분배율 합계가 100%가 아닙니다 (현재 ${sum}%).`,
    };
  }
  return { valid: true, totalPercent: 100, error: null };
}

/**
 * 상업 클린 증명서(Rights BOM)와 AI 옵트아웃 매니페스트를 결합해
 * Spectrum 창작자 수익 분배·2차 판권·Opt-In 라이선스 제안서를 생성한다.
 */
export function buildStudioSpectrumLicenseOffer(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly tier: SpectrumLicenseTier;
  readonly baseLicenseFeeKrw: number;
  readonly participants: readonly SpectrumRevenueParticipant[];
  readonly receipt: StudioWorkflowPackRightsReceipt;
  readonly optOutManifest: StudioAiOptOutManifest;
  readonly issuedAtIso?: string;
}): StudioSpectrumLicenseOffer {
  const issuedAtIso = params.issuedAtIso ?? new Date().toISOString();
  const splitCheck = validateRevenueParticipants(params.participants);

  let rejectionReason: string | null = null;
  if (!params.receipt.clearedForCommercialExport) {
    rejectionReason = `상업 연재 제한 라이선스(${params.receipt.blockedLicenses.join(", ")})가 포함되어 라이선스 계약을 발급할 수 없습니다.`;
  } else if (!splitCheck.valid) {
    rejectionReason = splitCheck.error;
  } else if (
    params.tier === "verified-ai-optin-royalty" &&
    params.optOutManifest.tdmReservation === 1
  ) {
    rejectionReason =
      "현재 AI 학습 금지(tdm-reservation: 1)가 활성화되어 있어 Opt-In 로열티 티어를 발급할 수 없습니다.";
  } else if (!Number.isFinite(params.baseLicenseFeeKrw) || params.baseLicenseFeeKrw < 0) {
    rejectionReason = "기준 라이선스 금액은 0원 이상이어야 합니다.";
  }

  const eligible = rejectionReason === null;
  const offerIntegrityHash = fnv1aHex(
    JSON.stringify({
      eligible,
      seriesTitle: params.seriesTitle,
      episodeLabel: params.episodeLabel,
      tier: params.tier,
      baseLicenseFeeKrw: params.baseLicenseFeeKrw,
      receiptIntegrityHash: params.receipt.integrityHash,
      optOutManifestHash: params.optOutManifest.manifestIntegrityHash,
      participants: params.participants,
    }),
  );

  return {
    offerSchemaVersion: 1,
    eligible,
    rejectionReason,
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    tier: params.tier,
    tdmReservation: params.optOutManifest.tdmReservation,
    receiptIntegrityHash: params.receipt.integrityHash,
    optOutManifestHash: params.optOutManifest.manifestIntegrityHash,
    baseLicenseFeeKrw: params.baseLicenseFeeKrw,
    participants: params.participants,
    issuedAtIso,
    offerIntegrityHash,
  };
}

/**
 * 계약 검토용 Spectrum 수익 분배·라이선스 제안 요약 Markdown을 생성한다.
 */
export function formatSpectrumLicenseOfferMarkdown(offer: StudioSpectrumLicenseOffer): string {
  const rows = offer.participants.map((p) => {
    const payout = Math.round((offer.baseLicenseFeeKrw * p.sharePercent) / 100);
    return `| ${p.displayName} | ${p.role} | ${p.sharePercent}% | ${payout.toLocaleString("ko-KR")}원 |`;
  });

  return [
    `# Spectrum 라이선스 및 수익 분배 제안서 — ${offer.seriesTitle} (${offer.episodeLabel})`,
    `- 발급 상태: ${offer.eligible ? "발급 가능 (PASS)" : `차단됨 (${offer.rejectionReason ?? "사유 미상"})`}`,
    `- 라이선스 티어: \`${offer.tier}\` (TDM Reservation: \`${offer.tdmReservation}\`)`,
    `- 기준 계약 금액: ${offer.baseLicenseFeeKrw.toLocaleString("ko-KR")}원`,
    `- 연결 해시: Rights BOM \`${offer.receiptIntegrityHash}\` · Opt-Out \`${offer.optOutManifestHash}\` · Offer \`${offer.offerIntegrityHash}\``,
    "",
    "## 참여자별 수익 분배표",
    "| 참여자 | 역할 | 지분율 | 예상 정산액 |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
