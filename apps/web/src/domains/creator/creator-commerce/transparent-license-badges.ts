/**
 * 크리에이터 마켓 에셋 카드용 3줄 투명 라이선스 배지(`상업 연재 / 어시 공유 / 단행본`),
 * 사용 범위 경계 검증, 및 MONETIZATION.md 투명 랭킹·스폰서 슬롯 격리 계약.
 */

import {
  canonicalJsonStringify,
  computeSha256Hex,
} from "../creator-trust/creator-trust-sha256";

export const TRIAL_STAMP_LICENSE_SCHEMA_VERSION = "toonstudio.trial-stamp-license.v1" as const;
export const SPONSORED_BADGE_LABEL_KO = "AD·스폰서" as const;

export type LicenseBadgeAxis =
  | "commercial-serialization"
  | "assistant-sharing"
  | "print-volume";

export type LicenseGrantStatus = "allowed" | "conditional" | "prohibited";

export interface LicenseAxisSpec {
  readonly axis: LicenseBadgeAxis;
  readonly status: LicenseGrantStatus;
  /** 조건부 허용·제한 시 한국어 핵심 조건(예: "어시스턴트 최대 3인", "단행본 1만 부 이하"). */
  readonly conditionKo?: string;
  /** 허용 좌석/공유 인원 상한(어시 공유 등). */
  readonly maxSeats?: number;
  /** 저작자 표기 의무 여부. */
  readonly attributionRequired?: boolean;
}

export interface AssetLicenseRightsInput {
  readonly commercialSerialization: Omit<LicenseAxisSpec, "axis">;
  readonly assistantSharing: Omit<LicenseAxisSpec, "axis">;
  readonly printVolume: Omit<LicenseAxisSpec, "axis">;
  /** 에셋 단독 재판매·재배포 금지 여부(기본 true). */
  readonly resaleProhibited?: boolean;
  /** 생성형 AI 학습 데이터 사용 금지 여부(기본 true). */
  readonly aiTrainingProhibited?: boolean;
  readonly licenseVersion?: string;
}

export interface TransparentLicenseBadgeItem {
  readonly axis: LicenseBadgeAxis;
  readonly axisLabelKo: "상업 연재" | "어시 공유" | "단행본";
  readonly status: LicenseGrantStatus;
  readonly statusLabelKo: "허용" | "조건부 허용" | "불가";
  /** 에셋 카드 3줄 배지에 그대로 출력하는 한국어 평문 라벨. */
  readonly badgeTextKo: string;
  readonly detailKo: string;
  readonly maxSeats: number | null;
  readonly attributionRequired: boolean;
}

export interface TransparentLicenseThreeLineSummary {
  readonly schemaVersion: typeof TRIAL_STAMP_LICENSE_SCHEMA_VERSION;
  /** 항상 [상업 연재, 어시 공유, 단행본] 3축 순서를 고정한다. */
  readonly badges: readonly [
    TransparentLicenseBadgeItem,
    TransparentLicenseBadgeItem,
    TransparentLicenseBadgeItem,
  ];
  readonly linesKo: readonly [string, string, string];
  readonly accessibleSummaryKo: string;
  readonly commercialSerializationReady: boolean;
  readonly assistantSharingAllowed: boolean;
  readonly printVolumeAllowed: boolean;
  readonly resaleProhibited: boolean;
  readonly aiTrainingProhibited: boolean;
  readonly licenseVersion: string;
  readonly rightsDigestSha256: string;
}

export interface LicenseUsageCheckInput {
  readonly commercialSerialization?: boolean;
  readonly assistantSeatCount?: number;
  readonly printVolume?: boolean;
  readonly attributionIncluded?: boolean;
}

export interface LicenseUsageCheckResult {
  readonly eligible: boolean;
  readonly blockedAxes: readonly LicenseBadgeAxis[];
  readonly warningsKo: readonly string[];
  readonly summaryKo: string;
}

export const STANDARD_MARKET_LICENSE_PRESETS: Readonly<
  Record<"solo-commercial" | "team-studio" | "editorial-preview-only", AssetLicenseRightsInput>
> = Object.freeze({
  "solo-commercial": Object.freeze({
    commercialSerialization: Object.freeze({
      status: "allowed" as const,
      attributionRequired: false,
    }),
    assistantSharing: Object.freeze({
      status: "prohibited" as const,
      conditionKo: "구매 작가 1인 전용",
    }),
    printVolume: Object.freeze({
      status: "conditional" as const,
      conditionKo: "단행본 1만 부 이하 · 초과 시 확장권 필요",
    }),
    resaleProhibited: true,
    aiTrainingProhibited: true,
    licenseVersion: "TS-MKT-1.0",
  }),
  "team-studio": Object.freeze({
    commercialSerialization: Object.freeze({
      status: "allowed" as const,
      attributionRequired: false,
    }),
    assistantSharing: Object.freeze({
      status: "conditional" as const,
      maxSeats: 5,
      conditionKo: "동일 작품 팀 어시스턴트 최대 5인",
    }),
    printVolume: Object.freeze({
      status: "allowed" as const,
      conditionKo: "국내·해외 단행본·굿즈 인쇄 포함",
    }),
    resaleProhibited: true,
    aiTrainingProhibited: true,
    licenseVersion: "TS-MKT-TEAM-1.0",
  }),
  "editorial-preview-only": Object.freeze({
    commercialSerialization: Object.freeze({
      status: "prohibited" as const,
      conditionKo: "비상업 습작·투고 시안 전용",
    }),
    assistantSharing: Object.freeze({
      status: "prohibited" as const,
      conditionKo: "외부 공유 불가",
    }),
    printVolume: Object.freeze({
      status: "prohibited" as const,
      conditionKo: "인쇄 출판 불가",
    }),
    resaleProhibited: true,
    aiTrainingProhibited: true,
    licenseVersion: "TS-MKT-NONCOMM-1.0",
  }),
});

export type MarketplaceListingPlacement = "organic-ranking" | "sponsored-slot";

export interface MarketplaceListingCardInput {
  readonly assetId: string;
  readonly title: string;
  readonly placement: MarketplaceListingPlacement;
  /** `organic-ranking` 전용 순위(1 이상 정수). `sponsored-slot`은 반드시 null/미지정이어야 한다. */
  readonly organicRank?: number | null;
  readonly sponsorCampaignId?: string | null;
  readonly licenseRights: AssetLicenseRightsInput;
}

export interface MarketplaceCardDisclosure {
  readonly assetId: string;
  readonly title: string;
  readonly placement: MarketplaceListingPlacement;
  readonly organicRank: number | null;
  readonly sponsorCampaignId: string | null;
  readonly sponsorBadgeLabelKo: typeof SPONSORED_BADGE_LABEL_KO | null;
  readonly rankingContaminationBlocked: true;
  readonly licenseSummary: TransparentLicenseThreeLineSummary;
}

export interface PartitionedMarketplaceListings {
  readonly organicRankedCards: readonly MarketplaceCardDisclosure[];
  readonly isolatedSponsoredSlots: readonly MarketplaceCardDisclosure[];
  readonly rankingIntegrityVerified: true;
}

const AXIS_LABELS_KO: Readonly<Record<LicenseBadgeAxis, "상업 연재" | "어시 공유" | "단행본">> =
  Object.freeze({
    "commercial-serialization": "상업 연재",
    "assistant-sharing": "어시 공유",
    "print-volume": "단행본",
  });

const STATUS_LABELS_KO: Readonly<Record<LicenseGrantStatus, "허용" | "조건부 허용" | "불가">> =
  Object.freeze({
    allowed: "허용",
    conditional: "조건부 허용",
    prohibited: "불가",
  });

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RangeError(`${fieldName} 값은 비어 있을 수 없습니다.`);
  }
  return trimmed;
}

function buildBadgeItem(
  axis: LicenseBadgeAxis,
  spec: Omit<LicenseAxisSpec, "axis">,
): TransparentLicenseBadgeItem {
  const axisLabelKo = AXIS_LABELS_KO[axis];
  const statusLabelKo = STATUS_LABELS_KO[spec.status];
  const maxSeats =
    spec.maxSeats !== undefined && Number.isSafeInteger(spec.maxSeats) && spec.maxSeats > 0
      ? spec.maxSeats
      : null;
  if (spec.maxSeats !== undefined && maxSeats === null) {
    throw new RangeError(`${axis}의 maxSeats는 1 이상의 정수여야 합니다.`);
  }
  const attributionRequired = Boolean(spec.attributionRequired);
  const condition = spec.conditionKo?.trim() ?? "";

  const qualifiers: string[] = [];
  if (condition) {
    qualifiers.push(condition);
  } else if (maxSeats !== null && axis === "assistant-sharing") {
    qualifiers.push(`최대 ${maxSeats}인`);
  }
  if (attributionRequired && spec.status !== "prohibited") {
    qualifiers.push("출처 표기 필수");
  }

  const qualifierSuffix = qualifiers.length > 0 ? ` (${qualifiers.join(" · ")})` : "";
  const badgeTextKo = `${axisLabelKo}: ${statusLabelKo}${qualifierSuffix}`;
  const detailKo =
    spec.status === "allowed"
      ? `${axisLabelKo} 용도로 즉시 사용 가능합니다.${qualifierSuffix}`
      : spec.status === "conditional"
        ? `${axisLabelKo}은 지정 조건 충족 시 사용 가능합니다.${qualifierSuffix}`
        : `${axisLabelKo} 용도로는 사용할 수 없습니다.${qualifierSuffix}`;

  return Object.freeze({
    axis,
    axisLabelKo,
    status: spec.status,
    statusLabelKo,
    badgeTextKo,
    detailKo,
    maxSeats,
    attributionRequired,
  });
}

/**
 * 모든 마켓 에셋 카드에 공통 노출하는 3줄 투명 라이선스 배지(`상업 연재 / 어시 공유 / 단행본`)를 생성한다.
 */
export function buildTransparentLicenseSummary(
  input: AssetLicenseRightsInput,
): TransparentLicenseThreeLineSummary {
  const commercialBadge = buildBadgeItem("commercial-serialization", input.commercialSerialization);
  const assistantBadge = buildBadgeItem("assistant-sharing", input.assistantSharing);
  const printBadge = buildBadgeItem("print-volume", input.printVolume);

  const badges = Object.freeze([commercialBadge, assistantBadge, printBadge] as const);
  const linesKo = Object.freeze([
    commercialBadge.badgeTextKo,
    assistantBadge.badgeTextKo,
    printBadge.badgeTextKo,
  ] as const);

  const resaleProhibited = input.resaleProhibited !== false;
  const aiTrainingProhibited = input.aiTrainingProhibited !== false;
  const licenseVersion = input.licenseVersion?.trim() || "TS-MKT-1.0";

  const rightsDigestSha256 = computeSha256Hex(
    canonicalJsonStringify({
      schemaVersion: TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
      licenseVersion,
      resaleProhibited,
      aiTrainingProhibited,
      badges: badges.map((badge) => ({
        axis: badge.axis,
        status: badge.status,
        maxSeats: badge.maxSeats,
        attributionRequired: badge.attributionRequired,
        badgeTextKo: badge.badgeTextKo,
      })),
    }),
  );

  return Object.freeze({
    schemaVersion: TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
    badges,
    linesKo,
    accessibleSummaryKo: linesKo.join(" / "),
    commercialSerializationReady: commercialBadge.status !== "prohibited",
    assistantSharingAllowed: assistantBadge.status !== "prohibited",
    printVolumeAllowed: printBadge.status !== "prohibited",
    resaleProhibited,
    aiTrainingProhibited,
    licenseVersion,
    rightsDigestSha256,
  });
}

/** 실제 제작·납품 조건이 에셋의 3축 라이선스 경계 안에 있는지 판정한다. */
export function checkLicenseUsageEligibility(
  summary: TransparentLicenseThreeLineSummary,
  usage: LicenseUsageCheckInput,
): LicenseUsageCheckResult {
  const blockedAxes: LicenseBadgeAxis[] = [];
  const warningsKo: string[] = [];
  const [commercialBadge, assistantBadge, printBadge] = summary.badges;

  if (usage.commercialSerialization) {
    if (commercialBadge.status === "prohibited") {
      blockedAxes.push("commercial-serialization");
      warningsKo.push("상업 연재가 금지된 라이선스입니다.");
    } else if (commercialBadge.attributionRequired && usage.attributionIncluded === false) {
      blockedAxes.push("commercial-serialization");
      warningsKo.push("상업 연재 시 저작자 출처 표기가 필수입니다.");
    }
  }

  const seats = usage.assistantSeatCount ?? 0;
  if (!Number.isSafeInteger(seats) || seats < 0) {
    throw new RangeError("assistantSeatCount는 0 이상의 정수여야 합니다.");
  }
  if (seats > 0) {
    if (assistantBadge.status === "prohibited") {
      blockedAxes.push("assistant-sharing");
      warningsKo.push("어시스턴트 공유가 허용되지 않는 1인 라이선스입니다.");
    } else if (assistantBadge.maxSeats !== null && seats > assistantBadge.maxSeats) {
      blockedAxes.push("assistant-sharing");
      warningsKo.push(
        `어시 공유 허용 인원(${assistantBadge.maxSeats}인)을 초과했습니다(요청 ${seats}인).`,
      );
    }
  }

  if (usage.printVolume) {
    if (printBadge.status === "prohibited") {
      blockedAxes.push("print-volume");
      warningsKo.push("단행본·인쇄 출판이 금지된 라이선스입니다.");
    } else if (printBadge.attributionRequired && usage.attributionIncluded === false) {
      blockedAxes.push("print-volume");
      warningsKo.push("단행본 출판 시 저작자 출처 표기가 필수입니다.");
    }
  }

  const eligible = blockedAxes.length === 0;
  return Object.freeze({
    eligible,
    blockedAxes: Object.freeze(blockedAxes),
    warningsKo: Object.freeze(warningsKo),
    summaryKo: eligible
      ? "요청한 연재·어시 공유·단행본 사용 범위가 라이선스 조건에 부합합니다."
      : `라이선스 경계 초과(${blockedAxes.length}건): ${warningsKo.join(" ")}`,
  });
}

/**
 * MONETIZATION.md 투명 랭킹·스폰서 분리 원칙을 강제하는 에셋 카드 고지 정보를 생성한다.
 * 스폰서 슬롯은 유기적 랭킹 순위를 가질 수 없으며 반드시 `"AD·스폰서"` 배지로 격리된다.
 */
export function createMarketplaceCardDisclosure(
  input: MarketplaceListingCardInput,
): MarketplaceCardDisclosure {
  const assetId = requireNonEmpty(input.assetId, "assetId");
  const title = requireNonEmpty(input.title, "title");
  const licenseSummary = buildTransparentLicenseSummary(input.licenseRights);

  if (input.placement === "sponsored-slot") {
    if (input.organicRank !== undefined && input.organicRank !== null) {
      throw new RangeError(
        "스폰서 슬롯에는 유기적 랭킹 순위(organicRank)를 부여할 수 없습니다(MONETIZATION.md 랭킹 격리 원칙).",
      );
    }
    const sponsorCampaignId = requireNonEmpty(input.sponsorCampaignId ?? "", "sponsorCampaignId");
    return Object.freeze({
      assetId,
      title,
      placement: "sponsored-slot",
      organicRank: null,
      sponsorCampaignId,
      sponsorBadgeLabelKo: SPONSORED_BADGE_LABEL_KO,
      rankingContaminationBlocked: true,
      licenseSummary,
    });
  }

  if (input.sponsorCampaignId) {
    throw new RangeError(
      "유기적 랭킹 카드에는 스폰서 캠페인 ID를 결합할 수 없습니다(스폰서 슬롯으로 분리 필요).",
    );
  }
  if (
    input.organicRank === undefined ||
    input.organicRank === null ||
    !Number.isSafeInteger(input.organicRank) ||
    input.organicRank < 1
  ) {
    throw new RangeError("organic-ranking 카드는 1 이상의 정수 organicRank가 필요합니다.");
  }

  return Object.freeze({
    assetId,
    title,
    placement: "organic-ranking",
    organicRank: input.organicRank,
    sponsorCampaignId: null,
    sponsorBadgeLabelKo: null,
    rankingContaminationBlocked: true,
    licenseSummary,
  });
}

/** 유기적 랭킹 목록과 스폰서 슬롯을 절대 혼합하지 않고 격리 분할한다. */
export function partitionMarketplaceListings(
  inputs: readonly MarketplaceListingCardInput[],
): PartitionedMarketplaceListings {
  const organic: MarketplaceCardDisclosure[] = [];
  const sponsored: MarketplaceCardDisclosure[] = [];
  const seenRanks = new Set<number>();

  for (const input of inputs) {
    const card = createMarketplaceCardDisclosure(input);
    if (card.placement === "sponsored-slot") {
      sponsored.push(card);
    } else {
      if (card.organicRank !== null && seenRanks.has(card.organicRank)) {
        throw new RangeError(`중복된 유기적 랭킹 순위(${card.organicRank})는 허용되지 않습니다.`);
      }
      if (card.organicRank !== null) seenRanks.add(card.organicRank);
      organic.push(card);
    }
  }

  organic.sort((left, right) => (left.organicRank ?? 0) - (right.organicRank ?? 0));

  return Object.freeze({
    organicRankedCards: Object.freeze(organic),
    isolatedSponsoredSlots: Object.freeze(sponsored),
    rankingIntegrityVerified: true,
  });
}
