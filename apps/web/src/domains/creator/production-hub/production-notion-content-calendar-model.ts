/**
 * REA 역공학 기반 노션(Notion) 멀티뷰 콘텐츠 캘린더 및 어시스턴트 정산 롤업 도메인 모델
 * - Evidence: ev_a6a2d4aba21dbfd286465527cc4ac72e01db957fa9c249375b610de3aef938df,
 *   ev_c8da9620ea35f52260b80dec5cb3f8f1f13b0cfaff9f6f4bcb266e6dc20b0b5d
 * - 클린룸 구현: CollectionView(Gallery/Timeline/Table), PropertiesStore 롤업/수식 집계,
 *   주말 회피 의존성 일정 시프트(update_dependency_date_shift_avoid_weekends)
 */

export type NotionCalendarViewMode = "gallery" | "timeline" | "table";

export type PlatformSubmissionStatus =
  | "not-submitted"
  | "review-pending"
  | "submitted"
  | "published";

export type AssistantWorkRole =
  | "storyboard"
  | "lineart"
  | "coloring"
  | "background"
  | "typesetting";

export type AssistantPricingModel = "per-cut" | "flat-episode";

export type AssistantPaymentStatus = "unpaid" | "scheduled" | "paid";

export interface AssistantSettlementLineItem {
  readonly id: string;
  readonly assistantId: string;
  readonly assistantName: string;
  readonly role: AssistantWorkRole;
  readonly pricingModel: AssistantPricingModel;
  readonly unitRateKrw: number;
  readonly cutOrPageCount: number;
  readonly bonusKrw: number;
  readonly paymentStatus: AssistantPaymentStatus;
}

export interface NotionContentCalendarEpisodeRecord {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly synopsisSummary: string;
  readonly startDateIso: string;
  readonly deadlineDateIso: string;
  readonly platformSubmissionStatus: PlatformSubmissionStatus;
  readonly platformName: string;
  readonly cutCount: number;
  readonly coverBadgeText: string;
  readonly coverThemeTone: "indigo" | "emerald" | "amber" | "rose";
  readonly dependencyEpisodeIds: readonly string[];
  readonly assistantSettlements: readonly AssistantSettlementLineItem[];
}

export type GalleryCoverFormat = "thumbnail-cover" | "page-synopsis" | "none";
export type GalleryCardSize = "small" | "medium" | "large";
export type GalleryCoverAspect = "16:9" | "4:3" | "1:1";
export type GalleryVisibleProperty =
  | "deadline"
  | "platformStatus"
  | "settlementTotal"
  | "assistants"
  | "cutCount";

export interface NotionGalleryViewConfig {
  readonly coverFormat: GalleryCoverFormat;
  readonly cardSize: GalleryCardSize;
  readonly coverAspect: GalleryCoverAspect;
  readonly visibleProperties: readonly GalleryVisibleProperty[];
}

export interface NotionTimelineViewConfig {
  readonly showTableAlongside: boolean;
  readonly separateStartAndEndDates: boolean;
  readonly showDependencyArrows: boolean;
  readonly avoidWeekendsOnShift: boolean;
}

export interface EpisodeSettlementRollup {
  readonly episodeId: string;
  readonly totalSettlementKrw: number;
  readonly paidSettlementKrw: number;
  readonly unpaidSettlementKrw: number;
  readonly costPerCutKrw: number;
  readonly assistantCount: number;
  readonly paymentCompletionPercent: number;
}

export interface AssistantPersonRollupSummary {
  readonly assistantId: string;
  readonly assistantName: string;
  readonly primaryRole: AssistantWorkRole;
  readonly episodeCount: number;
  readonly totalCutsAssigned: number;
  readonly totalAmountKrw: number;
  readonly paidAmountKrw: number;
  readonly unpaidAmountKrw: number;
}

export interface ContentCalendarFilterOptions {
  readonly statusFilter?: PlatformSubmissionStatus | "all";
  readonly assistantIdFilter?: string | "all";
  readonly searchQuery?: string;
  readonly sortBy?: "deadline-asc" | "episode-asc" | "settlement-desc";
}

export const PLATFORM_SUBMISSION_STATUS_LABELS: Readonly<
  Record<PlatformSubmissionStatus, string>
> = {
  "not-submitted": "미제출",
  "review-pending": "플랫폼 검수 대기",
  submitted: "제출 완료",
  published: "연재 발행",
};

export const ASSISTANT_WORK_ROLE_LABELS: Readonly<Record<AssistantWorkRole, string>> = {
  storyboard: "콘티",
  lineart: "선화",
  coloring: "밑색·채색",
  background: "배경·3D",
  typesetting: "식자·후보정",
};

export const ASSISTANT_PAYMENT_STATUS_LABELS: Readonly<
  Record<AssistantPaymentStatus, string>
> = {
  unpaid: "미정산",
  scheduled: "이체 예정",
  paid: "정산 완료",
};

/**
 * 어시스턴트 개별 정산 라인 아이템의 금액(KRW)을 수식으로 계산한다.
 */
export function computeAssistantLineItemAmountKrw(
  item: AssistantSettlementLineItem,
): number {
  const safeRate = Math.max(0, Math.round(item.unitRateKrw));
  const safeCount = Math.max(0, Math.round(item.cutOrPageCount));
  const safeBonus = Math.max(0, Math.round(item.bonusKrw));
  if (item.pricingModel === "per-cut") {
    return safeRate * safeCount + safeBonus;
  }
  return safeRate + safeBonus;
}

/**
 * 노션 Rollup(`sum`, `count`, `percent_not_empty`) 및 Formula 방식으로
 * 단일 회차의 어시스턴트 정산 총액·미정산액·컷당 단가를 집계한다.
 */
export function computeEpisodeSettlementRollup(
  record: NotionContentCalendarEpisodeRecord,
): EpisodeSettlementRollup {
  let totalSettlementKrw = 0;
  let paidSettlementKrw = 0;
  let unpaidSettlementKrw = 0;
  let paidCount = 0;

  for (const line of record.assistantSettlements) {
    const amount = computeAssistantLineItemAmountKrw(line);
    totalSettlementKrw += amount;
    if (line.paymentStatus === "paid") {
      paidSettlementKrw += amount;
      paidCount += 1;
    } else {
      unpaidSettlementKrw += amount;
    }
  }

  const assistantCount = record.assistantSettlements.length;
  const costPerCutKrw =
    record.cutCount > 0 ? Math.round(totalSettlementKrw / record.cutCount) : 0;
  const paymentCompletionPercent =
    assistantCount > 0 ? Math.round((paidCount / assistantCount) * 100) : 100;

  return {
    episodeId: record.episodeId,
    totalSettlementKrw,
    paidSettlementKrw,
    unpaidSettlementKrw,
    costPerCutKrw,
    assistantCount,
    paymentCompletionPercent,
  };
}

/**
 * 전체 회차에 걸친 고용 어시스턴트별 정산 금액을 그룹 롤업한다.
 */
export function aggregateAssistantSettlementByPerson(
  records: readonly NotionContentCalendarEpisodeRecord[],
): readonly AssistantPersonRollupSummary[] {
  const byAssistant = new Map<
    string,
    {
      assistantId: string;
      assistantName: string;
      primaryRole: AssistantWorkRole;
      episodes: Set<string>;
      totalCutsAssigned: number;
      totalAmountKrw: number;
      paidAmountKrw: number;
      unpaidAmountKrw: number;
    }
  >();

  for (const record of records) {
    for (const line of record.assistantSettlements) {
      const amount = computeAssistantLineItemAmountKrw(line);
      const existing = byAssistant.get(line.assistantId);
      if (existing) {
        existing.episodes.add(record.episodeId);
        existing.totalCutsAssigned += line.cutOrPageCount;
        existing.totalAmountKrw += amount;
        if (line.paymentStatus === "paid") {
          existing.paidAmountKrw += amount;
        } else {
          existing.unpaidAmountKrw += amount;
        }
      } else {
        byAssistant.set(line.assistantId, {
          assistantId: line.assistantId,
          assistantName: line.assistantName,
          primaryRole: line.role,
          episodes: new Set([record.episodeId]),
          totalCutsAssigned: line.cutOrPageCount,
          totalAmountKrw: amount,
          paidAmountKrw: line.paymentStatus === "paid" ? amount : 0,
          unpaidAmountKrw: line.paymentStatus === "paid" ? 0 : amount,
        });
      }
    }
  }

  return [...byAssistant.values()]
    .map((entry) => ({
      assistantId: entry.assistantId,
      assistantName: entry.assistantName,
      primaryRole: entry.primaryRole,
      episodeCount: entry.episodes.size,
      totalCutsAssigned: entry.totalCutsAssigned,
      totalAmountKrw: entry.totalAmountKrw,
      paidAmountKrw: entry.paidAmountKrw,
      unpaidAmountKrw: entry.unpaidAmountKrw,
    }))
    .sort((left, right) => right.totalAmountKrw - left.totalAmountKrw);
}

function shiftIsoDateSkippingWeekends(
  dateIso: string,
  deltaDays: number,
  avoidWeekends: boolean,
): string {
  const parsed = new Date(`${dateIso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return dateIso;
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);

  if (avoidWeekends) {
    const dayOfWeek = parsed.getUTCDay();
    if (dayOfWeek === 6) {
      // 토요일이면 월요일(+2일)로 이동
      parsed.setUTCDate(parsed.getUTCDate() + (deltaDays >= 0 ? 2 : -1));
    } else if (dayOfWeek === 0) {
      // 일요일이면 월요일(+1일) 또는 금요일(-2일)로 이동
      parsed.setUTCDate(parsed.getUTCDate() + (deltaDays >= 0 ? 1 : -2));
    }
  }
  return parsed.toISOString().slice(0, 10);
}

/**
 * 노션 타임라인의 `update_dependency_date_shift_avoid_weekends` 동작에 맞춰
 * 대상 회차와 그에 의존하는 후속 회차들의 시작일·마감일을 연쇄 시프트한다.
 */
export function shiftEpisodeTimelineWithDependencies(
  records: readonly NotionContentCalendarEpisodeRecord[],
  targetEpisodeId: string,
  deltaDays: number,
  avoidWeekends: boolean,
): readonly NotionContentCalendarEpisodeRecord[] {
  if (deltaDays === 0) return records;

  const affectedIds = new Set<string>([targetEpisodeId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const record of records) {
      if (affectedIds.has(record.episodeId)) continue;
      if (record.dependencyEpisodeIds.some((depId) => affectedIds.has(depId))) {
        affectedIds.add(record.episodeId);
        expanded = true;
      }
    }
  }

  return records.map((record) => {
    if (!affectedIds.has(record.episodeId)) return record;
    return {
      ...record,
      startDateIso: shiftIsoDateSkippingWeekends(
        record.startDateIso,
        deltaDays,
        avoidWeekends,
      ),
      deadlineDateIso: shiftIsoDateSkippingWeekends(
        record.deadlineDateIso,
        deltaDays,
        avoidWeekends,
      ),
    };
  });
}

/**
 * 갤러리 카드에 노출할 속성 토글 (`gallery_properties`)
 */
export function toggleGalleryVisibleProperty(
  config: NotionGalleryViewConfig,
  property: GalleryVisibleProperty,
): NotionGalleryViewConfig {
  const exists = config.visibleProperties.includes(property);
  if (exists && config.visibleProperties.length <= 1) {
    return config;
  }
  return {
    ...config,
    visibleProperties: exists
      ? config.visibleProperties.filter((item) => item !== property)
      : [...config.visibleProperties, property],
  };
}

/**
 * 노션 QueryStore / PageSortStore 방식의 콘텐츠 캘린더 필터 및 정렬
 */
export function filterAndSortContentCalendarRecords(
  records: readonly NotionContentCalendarEpisodeRecord[],
  options: ContentCalendarFilterOptions,
): readonly NotionContentCalendarEpisodeRecord[] {
  const statusFilter = options.statusFilter ?? "all";
  const assistantIdFilter = options.assistantIdFilter ?? "all";
  const normalizedQuery = (options.searchQuery ?? "").trim().toLocaleLowerCase("ko-KR");
  const sortBy = options.sortBy ?? "episode-asc";

  const filtered = records.filter((record) => {
    if (statusFilter !== "all" && record.platformSubmissionStatus !== statusFilter) {
      return false;
    }
    if (
      assistantIdFilter !== "all" &&
      !record.assistantSettlements.some((item) => item.assistantId === assistantIdFilter)
    ) {
      return false;
    }
    if (normalizedQuery) {
      const matchesTitle = record.title.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
      const matchesSynopsis = record.synopsisSummary
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery);
      const matchesAssistant = record.assistantSettlements.some((item) =>
        item.assistantName.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
      );
      if (!matchesTitle && !matchesSynopsis && !matchesAssistant) {
        return false;
      }
    }
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (sortBy === "deadline-asc") {
      return left.deadlineDateIso.localeCompare(right.deadlineDateIso);
    }
    if (sortBy === "settlement-desc") {
      const leftTotal = computeEpisodeSettlementRollup(left).totalSettlementKrw;
      const rightTotal = computeEpisodeSettlementRollup(right).totalSettlementKrw;
      return rightTotal - leftTotal;
    }
    return left.episodeNumber - right.episodeNumber;
  });
}
