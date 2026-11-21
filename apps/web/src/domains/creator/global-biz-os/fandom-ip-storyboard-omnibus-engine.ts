/**
 * 팬덤 2차 창작 IP 공식 라이선스 · 투명 수익 쉐어 원장 엔진 및
 * 웹소설 → 동기화 스토리보드 디렉터 · 실시간 옴니버스 가상 스튜디오 프리셋 브리지.
 *
 * 100% 결정론적 · 무과금(₩0) 순수 엔진이며 모든 색상은 OKLCH 토큰으로만 표현한다.
 */

export type FandomLicenseTierId =
  | "non-commercial-fanart"
  | "approved-small-batch-goods"
  | "official-spinoff";

export interface FandomRevenueSplitShares {
  readonly originalAuthorPercent: number;
  readonly studioPercent: number;
  readonly derivativeCreatorPercent: number;
  readonly platformPercent: number;
}

export interface FandomLicenseTierSpec {
  readonly id: FandomLicenseTierId;
  readonly stageNumber: 1 | 2 | 3;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly summaryKo: string;
  readonly maxUnitsAllowed: number | null;
  readonly maxGrossRevenueKrw: number | null;
  readonly commercialAllowed: boolean;
  readonly defaultShares: FandomRevenueSplitShares;
  readonly rightsScopeKo: readonly string[];
}

export interface FandomSplitInvariantCheck {
  readonly valid: boolean;
  readonly totalPercent: number;
  readonly deltaPercent: number;
  readonly errorKo: string | null;
}

export interface FandomLedgerEntryInput {
  readonly workTitle: string;
  readonly derivativeProjectTitle: string;
  readonly derivativeCreatorName: string;
  readonly tierId: FandomLicenseTierId;
  readonly unitsSold: number;
  readonly grossSalesKrw: number;
  readonly productionCostDeductionKrw: number;
  readonly shares: FandomRevenueSplitShares;
  readonly recordedDate: string;
}

export type FandomLedgerEntryStatus =
  | "approved-active"
  | "approved-non-commercial"
  | "blocked-split-invariant"
  | "blocked-non-commercial-policy"
  | "requires-spinoff-upgrade";

export interface FandomLedgerPayoutBreakdown {
  readonly originalAuthorKrw: number;
  readonly studioKrw: number;
  readonly derivativeCreatorKrw: number;
  readonly platformKrw: number;
  readonly totalDistributedKrw: number;
}

export interface FandomLicenseLedgerEntry {
  readonly ledgerCode: string;
  readonly recordedDate: string;
  readonly workTitle: string;
  readonly derivativeProjectTitle: string;
  readonly derivativeCreatorName: string;
  readonly tierId: FandomLicenseTierId;
  readonly tierLabelKo: string;
  readonly unitsSold: number;
  readonly grossSalesKrw: number;
  readonly productionCostDeductionKrw: number;
  readonly netDistributableKrw: number;
  readonly shares: FandomRevenueSplitShares;
  readonly invariant: FandomSplitInvariantCheck;
  readonly status: FandomLedgerEntryStatus;
  readonly statusMessageKo: string;
  readonly payouts: FandomLedgerPayoutBreakdown;
}

export const FANDOM_LICENSE_TIERS: Readonly<Record<FandomLicenseTierId, FandomLicenseTierSpec>> = {
  "non-commercial-fanart": {
    id: "non-commercial-fanart",
    stageNumber: 1,
    labelKo: "1단계 · 비상업 팬아트",
    shortLabelKo: "비상업 팬아트",
    summaryKo: "SNS·커뮤니티 무료 공유 전용. 판매·후원 수익화 금지, 원작 출처 표기 필수.",
    maxUnitsAllowed: 0,
    maxGrossRevenueKrw: 0,
    commercialAllowed: false,
    defaultShares: {
      originalAuthorPercent: 0,
      studioPercent: 0,
      derivativeCreatorPercent: 100,
      platformPercent: 0,
    },
    rightsScopeKo: [
      "비영리 일러스트·팬만화·코스튬 공개 허용",
      "원작 제목 및 공식 작가 크레딧 표기 필수",
      "굿즈 판매·유료 멤버십 수익화 불가",
    ],
  },
  "approved-small-batch-goods": {
    id: "approved-small-batch-goods",
    stageNumber: 2,
    labelKo: "2단계 · 공식 승인 소량 굿즈",
    shortLabelKo: "공식 승인 소량 굿즈",
    summaryKo: "행사 부스·한정 통판용(최대 300개 / 매출 ₩5,000,000 이하). 공식 홀로그램 코드 발급.",
    maxUnitsAllowed: 300,
    maxGrossRevenueKrw: 5_000_000,
    commercialAllowed: true,
    defaultShares: {
      originalAuthorPercent: 15,
      studioPercent: 15,
      derivativeCreatorPercent: 60,
      platformPercent: 10,
    },
    rightsScopeKo: [
      "아크릴·엽서·키링 등 소량 제작 300개까지 공식 승인",
      "매출 500만 원 초과 시 3단계 공식 스핀오프 계약으로 승격",
      "제작 실비 공제 후 4자 분배율 합계 100% 원장 자동 정산",
    ],
  },
  "official-spinoff": {
    id: "official-spinoff",
    stageNumber: 3,
    labelKo: "3단계 · 공식 스핀오프",
    shortLabelKo: "공식 스핀오프",
    summaryKo: "외전 웹툰·단행본·공식 머천다이징 상업 계약. 매출 상한 없음, 글로벌 유통 지원.",
    maxUnitsAllowed: null,
    maxGrossRevenueKrw: null,
    commercialAllowed: true,
    defaultShares: {
      originalAuthorPercent: 25,
      studioPercent: 20,
      derivativeCreatorPercent: 45,
      platformPercent: 10,
    },
    rightsScopeKo: [
      "공식 세계관 외전 연재·단행본·디지털 굿즈 상업 출간 허용",
      "원작자·스튜디오 검수 완료 후 글로벌 플랫폼 동시 배급",
      "4자 분배 원장 투명 공개 및 회차·월별 정산서 발행",
    ],
  },
};

export const FANDOM_LICENSE_TIER_LIST: readonly FandomLicenseTierSpec[] = [
  FANDOM_LICENSE_TIERS["non-commercial-fanart"],
  FANDOM_LICENSE_TIERS["approved-small-batch-goods"],
  FANDOM_LICENSE_TIERS["official-spinoff"],
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deterministicFnv1aHex(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function validateFandomSplitInvariant(
  shares: FandomRevenueSplitShares,
): FandomSplitInvariantCheck {
  const values = [
    shares.originalAuthorPercent,
    shares.studioPercent,
    shares.derivativeCreatorPercent,
    shares.platformPercent,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return {
      valid: false,
      totalPercent: 0,
      deltaPercent: -100,
      errorKo: "각 당사자 분배율은 0% 이상 100% 이하 숫자여야 합니다.",
    };
  }
  const totalPercent = round2(values.reduce((acc, value) => acc + value, 0));
  const deltaPercent = round2(totalPercent - 100);
  if (Math.abs(deltaPercent) > 0.001) {
    const direction = deltaPercent > 0 ? `${deltaPercent}% 초과` : `${Math.abs(deltaPercent)}% 부족`;
    return {
      valid: false,
      totalPercent,
      deltaPercent,
      errorKo: `원작자·스튜디오·2차 창작자·플랫폼 분배 합계가 100%여야 합니다 (현재 ${totalPercent}%, ${direction}).`,
    };
  }
  return {
    valid: true,
    totalPercent: 100,
    deltaPercent: 0,
    errorKo: null,
  };
}

/**
 * 2차 창작자 몫을 제외한 3자 합을 기준으로 2차 창작자 비율을 보정해 합계 100%를 맞춘다.
 */
export function rebalanceFandomSplitShares(
  shares: FandomRevenueSplitShares,
): FandomRevenueSplitShares {
  const safe = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, round2(v))) : 0);
  const author = safe(shares.originalAuthorPercent);
  const studio = safe(shares.studioPercent);
  const platform = safe(shares.platformPercent);
  const fixedSum = round2(author + studio + platform);

  if (fixedSum <= 100) {
    return {
      originalAuthorPercent: author,
      studioPercent: studio,
      derivativeCreatorPercent: round2(100 - fixedSum),
      platformPercent: platform,
    };
  }

  const scale = 100 / fixedSum;
  const scaledAuthor = round2(author * scale);
  const scaledStudio = round2(studio * scale);
  const scaledPlatform = round2(100 - scaledAuthor - scaledStudio);
  return {
    originalAuthorPercent: scaledAuthor,
    studioPercent: scaledStudio,
    derivativeCreatorPercent: 0,
    platformPercent: Math.max(0, scaledPlatform),
  };
}

/**
 * 최대 잔여법(Largest Remainder Method)으로 1원 단위 반올림 오차 없이 총액을 분배한다.
 */
function distributeExactKrw(
  netDistributableKrw: number,
  shares: FandomRevenueSplitShares,
): FandomLedgerPayoutBreakdown {
  if (netDistributableKrw <= 0) {
    return {
      originalAuthorKrw: 0,
      studioKrw: 0,
      derivativeCreatorKrw: 0,
      platformKrw: 0,
      totalDistributedKrw: 0,
    };
  }

  const buckets = [
    { key: "author" as const, percent: shares.originalAuthorPercent },
    { key: "studio" as const, percent: shares.studioPercent },
    { key: "derivative" as const, percent: shares.derivativeCreatorPercent },
    { key: "platform" as const, percent: shares.platformPercent },
  ].map((entry) => {
    const exact = (netDistributableKrw * entry.percent) / 100;
    const floored = Math.floor(exact);
    return {
      key: entry.key,
      floored,
      remainder: exact - floored,
    };
  });

  let remaining = netDistributableKrw - buckets.reduce((sum, item) => sum + item.floored, 0);
  const sortedByRemainder = [...buckets].sort((a, b) => b.remainder - a.remainder);
  const bonusMap: Record<"author" | "studio" | "derivative" | "platform", number> = {
    author: 0,
    studio: 0,
    derivative: 0,
    platform: 0,
  };

  for (const item of sortedByRemainder) {
    if (remaining <= 0) break;
    bonusMap[item.key] += 1;
    remaining -= 1;
  }

  const originalAuthorKrw = (buckets[0]?.floored ?? 0) + bonusMap.author;
  const studioKrw = (buckets[1]?.floored ?? 0) + bonusMap.studio;
  const derivativeCreatorKrw = (buckets[2]?.floored ?? 0) + bonusMap.derivative;
  const platformKrw = (buckets[3]?.floored ?? 0) + bonusMap.platform;

  return {
    originalAuthorKrw,
    studioKrw,
    derivativeCreatorKrw,
    platformKrw,
    totalDistributedKrw: originalAuthorKrw + studioKrw + derivativeCreatorKrw + platformKrw,
  };
}

export function createFandomLicenseLedgerEntry(
  input: FandomLedgerEntryInput,
): FandomLicenseLedgerEntry {
  const tier = FANDOM_LICENSE_TIERS[input.tierId];
  const invariant = validateFandomSplitInvariant(input.shares);
  const unitsSold = Math.max(0, Math.round(Number.isFinite(input.unitsSold) ? input.unitsSold : 0));
  const grossSalesKrw = Math.max(
    0,
    Math.round(Number.isFinite(input.grossSalesKrw) ? input.grossSalesKrw : 0),
  );
  const productionCostDeductionKrw = Math.min(
    grossSalesKrw,
    Math.max(
      0,
      Math.round(
        Number.isFinite(input.productionCostDeductionKrw) ? input.productionCostDeductionKrw : 0,
      ),
    ),
  );
  const netDistributableKrw = Math.max(0, grossSalesKrw - productionCostDeductionKrw);
  const recordedDate = input.recordedDate.trim() || "2026-10-24";
  const workTitle = input.workTitle.trim() || "밤의 우편배달부";
  const derivativeProjectTitle = input.derivativeProjectTitle.trim() || "팬덤 2차 프로젝트";
  const derivativeCreatorName = input.derivativeCreatorName.trim() || "익명 창작자";

  const tierTag =
    tier.id === "non-commercial-fanart"
      ? "FAN"
      : tier.id === "approved-small-batch-goods"
        ? "GDS"
        : "SPN";
  const codeHash = deterministicFnv1aHex(
    `${recordedDate}|${workTitle}|${derivativeProjectTitle}|${derivativeCreatorName}|${tier.id}|${grossSalesKrw}|${unitsSold}`,
  ).slice(0, 6);
  const ledgerCode = `FIP-${tierTag}-${codeHash}`;

  const zeroPayouts: FandomLedgerPayoutBreakdown = {
    originalAuthorKrw: 0,
    studioKrw: 0,
    derivativeCreatorKrw: 0,
    platformKrw: 0,
    totalDistributedKrw: 0,
  };

  if (!invariant.valid) {
    return {
      ledgerCode,
      recordedDate,
      workTitle,
      derivativeProjectTitle,
      derivativeCreatorName,
      tierId: tier.id,
      tierLabelKo: tier.labelKo,
      unitsSold,
      grossSalesKrw,
      productionCostDeductionKrw,
      netDistributableKrw,
      shares: input.shares,
      invariant,
      status: "blocked-split-invariant",
      statusMessageKo: invariant.errorKo ?? "분배율 합계 100% 불변식 위반으로 원장 발급이 차단되었습니다.",
      payouts: zeroPayouts,
    };
  }

  if (!tier.commercialAllowed && (grossSalesKrw > 0 || unitsSold > 0)) {
    return {
      ledgerCode,
      recordedDate,
      workTitle,
      derivativeProjectTitle,
      derivativeCreatorName,
      tierId: tier.id,
      tierLabelKo: tier.labelKo,
      unitsSold,
      grossSalesKrw,
      productionCostDeductionKrw,
      netDistributableKrw: 0,
      shares: input.shares,
      invariant,
      status: "blocked-non-commercial-policy",
      statusMessageKo:
        "1단계 비상업 팬아트 라이선스에서는 유료 판매나 수익화가 금지됩니다. 2단계 공식 승인 소량 굿즈로 전환하세요.",
      payouts: zeroPayouts,
    };
  }

  if (
    tier.commercialAllowed &&
    ((tier.maxUnitsAllowed !== null && unitsSold > tier.maxUnitsAllowed) ||
      (tier.maxGrossRevenueKrw !== null && grossSalesKrw > tier.maxGrossRevenueKrw))
  ) {
    return {
      ledgerCode,
      recordedDate,
      workTitle,
      derivativeProjectTitle,
      derivativeCreatorName,
      tierId: tier.id,
      tierLabelKo: tier.labelKo,
      unitsSold,
      grossSalesKrw,
      productionCostDeductionKrw,
      netDistributableKrw,
      shares: input.shares,
      invariant,
      status: "requires-spinoff-upgrade",
      statusMessageKo:
        "소량 굿즈 허용 한도(300개 / ₩5,000,000)를 초과했습니다. 3단계 공식 스핀오프 계약으로 승격한 뒤 정산하세요.",
      payouts: distributeExactKrw(netDistributableKrw, input.shares),
    };
  }

  if (!tier.commercialAllowed) {
    return {
      ledgerCode,
      recordedDate,
      workTitle,
      derivativeProjectTitle,
      derivativeCreatorName,
      tierId: tier.id,
      tierLabelKo: tier.labelKo,
      unitsSold: 0,
      grossSalesKrw: 0,
      productionCostDeductionKrw: 0,
      netDistributableKrw: 0,
      shares: input.shares,
      invariant,
      status: "approved-non-commercial",
      statusMessageKo: "비상업 팬아트 공식 등록 완료 · 출처 표기 및 무료 공유 라이선스가 발급되었습니다.",
      payouts: zeroPayouts,
    };
  }

  return {
    ledgerCode,
    recordedDate,
    workTitle,
    derivativeProjectTitle,
    derivativeCreatorName,
    tierId: tier.id,
    tierLabelKo: tier.labelKo,
    unitsSold,
    grossSalesKrw,
    productionCostDeductionKrw,
    netDistributableKrw,
    shares: input.shares,
    invariant,
    status: "approved-active",
    statusMessageKo: "분배 합계 100% 불변식 검증 완료 · 투명 수익 쉐어 계약 원장이 생성되었습니다.",
    payouts: distributeExactKrw(netDistributableKrw, input.shares),
  };
}

export const DEFAULT_FANDOM_LEDGER_SEED: readonly FandomLicenseLedgerEntry[] = [
  createFandomLicenseLedgerEntry({
    workTitle: "밤의 우편배달부",
    derivativeProjectTitle: "우편함 아크릴 디오라마 한정판",
    derivativeCreatorName: "아틀리에 달빛",
    tierId: "approved-small-batch-goods",
    unitsSold: 180,
    grossSalesKrw: 3_600_000,
    productionCostDeductionKrw: 900_000,
    shares: FANDOM_LICENSE_TIERS["approved-small-batch-goods"].defaultShares,
    recordedDate: "2026-10-18",
  }),
  createFandomLicenseLedgerEntry({
    workTitle: "밤의 우편배달부",
    derivativeProjectTitle: "외전: 새벽 2시의 첫 번째 편지",
    derivativeCreatorName: "스튜디오 윤슬",
    tierId: "official-spinoff",
    unitsSold: 4_200,
    grossSalesKrw: 16_800_000,
    productionCostDeductionKrw: 2_800_000,
    shares: FANDOM_LICENSE_TIERS["official-spinoff"].defaultShares,
    recordedDate: "2026-10-22",
  }),
];

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function exportFandomLedgerCsv(entries: readonly FandomLicenseLedgerEntry[]): string {
  const header = [
    "원장코드",
    "등록일",
    "원작IP",
    "2차프로젝트",
    "2차창작자",
    "라이선스단계",
    "상태",
    "총매출(KRW)",
    "실비공제(KRW)",
    "분배대상순액(KRW)",
    "원작자몫(KRW)",
    "스튜디오몫(KRW)",
    "2차창작자몫(KRW)",
    "플랫폼몫(KRW)",
  ];
  const rows = entries.map((entry) =>
    [
      entry.ledgerCode,
      entry.recordedDate,
      entry.workTitle,
      entry.derivativeProjectTitle,
      entry.derivativeCreatorName,
      entry.tierLabelKo,
      entry.status,
      entry.grossSalesKrw,
      entry.productionCostDeductionKrw,
      entry.netDistributableKrw,
      entry.payouts.originalAuthorKrw,
      entry.payouts.studioKrw,
      entry.payouts.derivativeCreatorKrw,
      entry.payouts.platformKrw,
    ].map(escapeCsv).join(","),
  );
  return [header.map(escapeCsv).join(","), ...rows].join("\n");
}

export {
  DEFAULT_WEBNOVEL_SAMPLE,
  DIRECTOR_STYLE_OPTIONS,
  OMNIBUS_VIRTUAL_STUDIO_EVENT,
  buildOmnibusVirtualStudioPreset,
  directNovelToStoryboard,
  dispatchOmnibusStudioPreset,
} from "./storyboard-omnibus-bridge";
export type {
  DirectedStoryboardShot,
  OmnibusBlockingActorSlot,
  OmnibusVirtualStudioPresetPayload,
  RecommendedLensMm,
  Storyboard3dCameraBlocking,
  StoryboardCameraFraming,
  StoryboardDirectionPlan,
  StoryboardDirectorStyle,
  StoryboardLightingSpec,
  Vec3Meters,
} from "./storyboard-omnibus-bridge";
