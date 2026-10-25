import { useMemo, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Coins,
  GalleryThumbnails,
  GitBranch,
  Plus,
  Table2,
  Users,
} from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  ASSISTANT_PAYMENT_STATUS_LABELS,
  ASSISTANT_WORK_ROLE_LABELS,
  PLATFORM_SUBMISSION_STATUS_LABELS,
  aggregateAssistantSettlementByPerson,
  computeAssistantLineItemAmountKrw,
  computeEpisodeSettlementRollup,
  filterAndSortContentCalendarRecords,
  shiftEpisodeTimelineWithDependencies,
  toggleGalleryVisibleProperty,
  type AssistantPaymentStatus,
  type AssistantPricingModel,
  type AssistantWorkRole,
  type GalleryCoverAspect,
  type GalleryCoverFormat,
  type GalleryVisibleProperty,
  type NotionCalendarViewMode,
  type NotionContentCalendarEpisodeRecord,
  type NotionGalleryViewConfig,
  type NotionTimelineViewConfig,
  type PlatformSubmissionStatus,
} from "./production-notion-content-calendar-model";

const INITIAL_CALENDAR_RECORDS: readonly NotionContentCalendarEpisodeRecord[] = [
  {
    episodeId: "ep-101",
    episodeNumber: 1,
    title: "1화 · 잿빛 성채의 귀환자",
    synopsisSummary: "북부 전선에서 생환한 카엘이 가문의 봉인검과 첫 조우한다.",
    startDateIso: "2026-10-20",
    deadlineDateIso: "2026-10-26",
    platformSubmissionStatus: "published",
    platformName: "네이버웹툰 · 화요연재",
    cutCount: 68,
    coverBadgeText: "1화 완결본 · 68컷",
    coverThemeTone: "emerald",
    dependencyEpisodeIds: [],
    assistantSettlements: [
      { id: "settle-101-1", assistantId: "asst-jihyun", assistantName: "김지현 (선화)", role: "lineart", pricingModel: "per-cut", unitRateKrw: 12000, cutOrPageCount: 68, bonusKrw: 0, paymentStatus: "paid" },
      { id: "settle-101-2", assistantId: "asst-minsu", assistantName: "박민수 (밑색·명암)", role: "coloring", pricingModel: "per-cut", unitRateKrw: 9000, cutOrPageCount: 68, bonusKrw: 30000, paymentStatus: "paid" },
    ],
  },
  {
    episodeId: "ep-102",
    episodeNumber: 2,
    title: "2화 · 심야의 검은 마탑",
    synopsisSummary: "마탑 지하 서고 침입 장면과 마도 병기 전투 씬이 중심인 회차.",
    startDateIso: "2026-10-27",
    deadlineDateIso: "2026-11-02",
    platformSubmissionStatus: "submitted",
    platformName: "네이버웹툰 · 화요연재",
    cutCount: 72,
    coverBadgeText: "2화 제출본 · 72컷",
    coverThemeTone: "indigo",
    dependencyEpisodeIds: ["ep-101"],
    assistantSettlements: [
      { id: "settle-102-1", assistantId: "asst-jihyun", assistantName: "김지현 (선화)", role: "lineart", pricingModel: "per-cut", unitRateKrw: 12000, cutOrPageCount: 72, bonusKrw: 20000, paymentStatus: "scheduled" },
      { id: "settle-102-2", assistantId: "asst-minsu", assistantName: "박민수 (밑색·명암)", role: "coloring", pricingModel: "per-cut", unitRateKrw: 9000, cutOrPageCount: 72, bonusKrw: 0, paymentStatus: "unpaid" },
      { id: "settle-102-3", assistantId: "asst-seoyeon", assistantName: "이서연 (배경·3D)", role: "background", pricingModel: "flat-episode", unitRateKrw: 280000, cutOrPageCount: 18, bonusKrw: 0, paymentStatus: "unpaid" },
    ],
  },
  {
    episodeId: "ep-103",
    episodeNumber: 3,
    title: "3화 · 황실 연회장의 암투",
    synopsisSummary: "황녀 셀레네와의 대면 및 귀족 파벌 간 정치 심리전.",
    startDateIso: "2026-11-03",
    deadlineDateIso: "2026-11-09",
    platformSubmissionStatus: "review-pending",
    platformName: "네이버웹툰 · 화요연재",
    cutCount: 65,
    coverBadgeText: "3화 검수중 · 65컷",
    coverThemeTone: "amber",
    dependencyEpisodeIds: ["ep-102"],
    assistantSettlements: [
      { id: "settle-103-1", assistantId: "asst-jihyun", assistantName: "김지현 (선화)", role: "lineart", pricingModel: "per-cut", unitRateKrw: 12000, cutOrPageCount: 65, bonusKrw: 0, paymentStatus: "unpaid" },
      { id: "settle-103-2", assistantId: "asst-seoyeon", assistantName: "이서연 (배경·3D)", role: "background", pricingModel: "flat-episode", unitRateKrw: 320000, cutOrPageCount: 24, bonusKrw: 30000, paymentStatus: "unpaid" },
    ],
  },
];

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR");
function formatKrw(amount: number): string {
  return `${KRW_FORMATTER.format(Math.round(amount))}원`;
}

const PROPERTY_LABELS: Readonly<Record<GalleryVisibleProperty, string>> = {
  deadline: "마감일",
  platformStatus: "플랫폼 제출 여부",
  settlementTotal: "어시스턴트 정산 총액",
  assistants: "투입 어시스턴트",
  cutCount: "컷 수",
};

export function ProductionNotionContentCalendarSuite() {
  const [records, setRecords] = useState<readonly NotionContentCalendarEpisodeRecord[]>(INITIAL_CALENDAR_RECORDS);
  const [viewMode, setViewMode] = useState<NotionCalendarViewMode>("gallery");
  const [statusFilter, setStatusFilter] = useState<PlatformSubmissionStatus | "all">("all");
  const [assistantFilter, setAssistantFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"deadline-asc" | "episode-asc" | "settlement-desc">("episode-asc");

  const [galleryConfig, setGalleryConfig] = useState<NotionGalleryViewConfig>({
    coverFormat: "thumbnail-cover",
    cardSize: "medium",
    coverAspect: "16:9",
    visibleProperties: ["deadline", "platformStatus", "settlementTotal", "assistants", "cutCount"],
  });

  const [timelineConfig, setTimelineConfig] = useState<NotionTimelineViewConfig>({
    showTableAlongside: true,
    separateStartAndEndDates: true,
    showDependencyArrows: true,
    avoidWeekendsOnShift: true,
  });

  const [targetEpisodeId, setTargetEpisodeId] = useState<string>("ep-103");
  const [newAssistantName, setNewAssistantName] = useState<string>("최유진 (식자)");
  const [newAssistantRole, setNewAssistantRole] = useState<AssistantWorkRole>("typesetting");
  const [newPricingModel, setNewPricingModel] = useState<AssistantPricingModel>("per-cut");
  const [newUnitRateKrw, setNewUnitRateKrw] = useState<number>(2500);
  const [newCutCount, setNewCutCount] = useState<number>(65);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const visibleRecords = useMemo(
    () => filterAndSortContentCalendarRecords(records, { statusFilter, assistantIdFilter: assistantFilter, searchQuery, sortBy }),
    [records, statusFilter, assistantFilter, searchQuery, sortBy],
  );
  const assistantRollups = useMemo(() => aggregateAssistantSettlementByPerson(records), [records]);
  const grandTotalSettlement = useMemo(
    () => records.reduce((acc, record) => acc + computeEpisodeSettlementRollup(record).totalSettlementKrw, 0),
    [records],
  );
  const grandUnpaidSettlement = useMemo(
    () => records.reduce((acc, record) => acc + computeEpisodeSettlementRollup(record).unpaidSettlementKrw, 0),
    [records],
  );

  const handleStatusChange = (episodeId: string, nextStatus: PlatformSubmissionStatus) => {
    setRecords((prev) => prev.map((r) => (r.episodeId === episodeId ? { ...r, platformSubmissionStatus: nextStatus } : r)));
    setFeedbackNotice(`회차(${episodeId}) 플랫폼 제출 상태를 '${PLATFORM_SUBMISSION_STATUS_LABELS[nextStatus]}'(으)로 변경했습니다.`);
  };

  const handlePaymentStatusChange = (episodeId: string, lineItemId: string, nextPaymentStatus: AssistantPaymentStatus) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.episodeId !== episodeId
          ? r
          : { ...r, assistantSettlements: r.assistantSettlements.map((l) => (l.id === lineItemId ? { ...l, paymentStatus: nextPaymentStatus } : l)) },
      ),
    );
    setFeedbackNotice(`정산 항목(${lineItemId}) 상태를 '${ASSISTANT_PAYMENT_STATUS_LABELS[nextPaymentStatus]}'(으)로 업데이트했습니다.`);
  };

  const handleShiftTimeline = (episodeId: string, deltaDays: number) => {
    setRecords((prev) => shiftEpisodeTimelineWithDependencies(prev, episodeId, deltaDays, timelineConfig.avoidWeekendsOnShift));
    setFeedbackNotice(`${episodeId} 및 후속 의존 회차 마감을 ${deltaDays > 0 ? `+${deltaDays}` : deltaDays}일(${timelineConfig.avoidWeekendsOnShift ? "주말 자동 회피" : "달력 기준"}) 이동했습니다.`);
  };

  const handleAddAssistantSettlement = () => {
    const cleanName = newAssistantName.trim();
    if (!cleanName) return;
    const assistantId = `asst-${cleanName.slice(0, 6).replace(/\s+/g, "-")}`;
    const newItem = {
      id: `settle-${targetEpisodeId}-${Date.now()}`,
      assistantId,
      assistantName: cleanName,
      role: newAssistantRole,
      pricingModel: newPricingModel,
      unitRateKrw: newUnitRateKrw,
      cutOrPageCount: newCutCount,
      bonusKrw: 0,
      paymentStatus: "unpaid" as const,
    };
    setRecords((prev) =>
      prev.map((r) => (r.episodeId === targetEpisodeId ? { ...r, assistantSettlements: [...r.assistantSettlements, newItem] } : r)),
    );
    setFeedbackNotice(`${targetEpisodeId}에 '${cleanName}' 정산(${formatKrw(computeAssistantLineItemAmountKrw(newItem))})을 추가했습니다.`);
  };

  return (
    <section
      aria-label="노션형 멀티뷰 콘텐츠 캘린더 및 어시스턴트 정산 데이터베이스"
      className="rounded-3xl border border-line bg-card p-5 shadow-sm space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <CalendarRange className="size-4" aria-hidden="true" />
            Notion Content Calendar &amp; Rollup Database
          </div>
          <h3 className="mt-1 text-xl font-black text-fg">
            콘텐츠 캘린더 · 플랫폼 제출 &amp; 어시스턴트 정산 롤업 뷰
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            갤러리 뷰와 타임라인 뷰를 전환하며 회차별 마감일, 플랫폼 제출 여부, 고용 어시스턴트별 컷당·정액 정산 금액을 한눈에 집계합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-panel p-1" role="group" aria-label="콘텐츠 캘린더 뷰 전환">
          <button
            type="button"
            aria-pressed={viewMode === "gallery"}
            onClick={() => setViewMode("gallery")}
            className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold", viewMode === "gallery" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")}
          >
            <GalleryThumbnails className="size-3.5" aria-hidden="true" />
            갤러리 뷰
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "timeline"}
            onClick={() => setViewMode("timeline")}
            className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold", viewMode === "timeline" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")}
          >
            <CalendarRange className="size-3.5" aria-hidden="true" />
            타임라인 뷰
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
            className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold", viewMode === "table" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")}
          >
            <Table2 className="size-3.5" aria-hidden="true" />
            정산 데이터베이스 표
          </button>
        </div>
      </header>

      {feedbackNotice ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-xs font-semibold text-fg">
          <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>{feedbackNotice}</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="text-[0.6875rem] font-bold text-fg-3">전체 회차 정산 총액 (SUM)</p>
          <p className="mt-1 text-xl font-black text-fg">{formatKrw(grandTotalSettlement)}</p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-2">총 {records.length}개 회차 · 어시스턴트 {assistantRollups.length}명</p>
        </div>
        <div className="rounded-2xl border border-warn/35 bg-warn/10 p-3.5">
          <p className="text-[0.6875rem] font-bold text-fg-3">미정산·이체 예정 잔액</p>
          <p className="mt-1 text-xl font-black text-warn">{formatKrw(grandUnpaidSettlement)}</p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-2">마감 검수 후 이체 대기 금액</p>
        </div>
        <div className="rounded-2xl border border-good/35 bg-good/10 p-3.5">
          <p className="text-[0.6875rem] font-bold text-fg-3">플랫폼 제출·발행 완료</p>
          <p className="mt-1 text-xl font-black text-good">
            {records.filter((r) => r.platformSubmissionStatus === "submitted" || r.platformSubmissionStatus === "published").length}/{records.length}화
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-2">정기 연재 세이브 원고 기준</p>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="text-[0.6875rem] font-bold text-fg-3">평균 컷당 외주 제작비</p>
          <p className="mt-1 text-xl font-black text-fg">
            {formatKrw(records.reduce((acc, r) => acc + r.cutCount, 0) > 0 ? grandTotalSettlement / records.reduce((acc, r) => acc + r.cutCount, 0) : 0)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-2">선화·채색·배경 롤업 합산 단가</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-3 text-xs">
        <label className="flex items-center gap-1.5 font-semibold text-fg-2">
          플랫폼 상태
          <select
            aria-label="콘텐츠 캘린더 플랫폼 상태 필터"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PlatformSubmissionStatus | "all")}
            className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            <option value="all">전체 상태</option>
            <option value="not-submitted">미제출</option>
            <option value="review-pending">플랫폼 검수 대기</option>
            <option value="submitted">제출 완료</option>
            <option value="published">연재 발행</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-fg-2">
          어시스턴트 필터
          <select
            aria-label="콘텐츠 캘린더 어시스턴트 필터"
            value={assistantFilter}
            onChange={(e) => setAssistantFilter(e.target.value)}
            className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            <option value="all">모든 어시스턴트</option>
            {assistantRollups.map((person) => (
              <option key={person.assistantId} value={person.assistantId}>{person.assistantName}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-fg-2">
          정렬
          <select
            aria-label="콘텐츠 캘린더 정렬 기준"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "deadline-asc" | "episode-asc" | "settlement-desc")}
            className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            <option value="episode-asc">회차 번호순</option>
            <option value="deadline-asc">마감일 임박순</option>
            <option value="settlement-desc">정산 금액 높은순</option>
          </select>
        </label>
        <input
          type="search"
          aria-label="콘텐츠 캘린더 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="회차 제목·시놉시스·어시스턴트 검색"
          className="min-h-8 min-w-48 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
        />
      </div>

      {viewMode === "gallery" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-fg">갤러리 카드 커버:</span>
              <select
                aria-label="갤러리 커버 포맷"
                value={galleryConfig.coverFormat}
                onChange={(e) => setGalleryConfig((prev) => ({ ...prev, coverFormat: e.target.value as GalleryCoverFormat }))}
                className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
              >
                <option value="thumbnail-cover">회차 썸네일 배너</option>
                <option value="page-synopsis">시놉시스 요약 프리뷰</option>
                <option value="none">커버 숨김</option>
              </select>
              <select
                aria-label="갤러리 커버 비율"
                value={galleryConfig.coverAspect}
                onChange={(e) => setGalleryConfig((prev) => ({ ...prev, coverAspect: e.target.value as GalleryCoverAspect }))}
                className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
              >
                <option value="16:9">16:9 와이드</option>
                <option value="4:3">4:3 스탠다드</option>
                <option value="1:1">1:1 정방형</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-fg-3">표시 속성:</span>
              {(Object.keys(PROPERTY_LABELS) as GalleryVisibleProperty[]).map((prop) => {
                const active = galleryConfig.visibleProperties.includes(prop);
                return (
                  <button
                    key={prop}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGalleryConfig((prev) => toggleGalleryVisibleProperty(prev, prop))}
                    className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-3")}
                  >
                    {PROPERTY_LABELS[prop]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {visibleRecords.map((record) => {
              const rollup = computeEpisodeSettlementRollup(record);
              return (
                <article key={record.episodeId} aria-label={`${record.title} 갤러리 카드`} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-xs">
                  {galleryConfig.coverFormat !== "none" ? (
                    <div className={cn("flex flex-col justify-between border-b border-line p-3.5", record.coverThemeTone === "emerald" ? "bg-good/15" : record.coverThemeTone === "amber" ? "bg-warn/15" : "bg-accent-soft")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-card/90 px-2 py-0.5 text-[0.6875rem] font-black text-fg">{record.coverBadgeText}</span>
                        <span className="text-[0.6875rem] font-semibold text-fg-2">{record.platformName}</span>
                      </div>
                      <p className="mt-2 text-xs text-fg-2">
                        {galleryConfig.coverFormat === "page-synopsis" ? record.synopsisSummary : `비율 ${galleryConfig.coverAspect} · 대표 썸네일 프리뷰`}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                    <div>
                      <h4 className="text-base font-black text-fg">{record.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-fg-2">{record.synopsisSummary}</p>
                    </div>
                    <dl className="space-y-1.5 border-t border-line pt-3 text-xs">
                      {galleryConfig.visibleProperties.includes("deadline") ? (
                        <div className="flex items-center justify-between"><dt className="text-fg-3">회차 마감일</dt><dd className="font-bold text-fg">{record.deadlineDateIso}</dd></div>
                      ) : null}
                      {galleryConfig.visibleProperties.includes("platformStatus") ? (
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-fg-3">플랫폼 제출</dt>
                          <dd>
                            <select
                              aria-label={`${record.title} 플랫폼 제출 상태`}
                              value={record.platformSubmissionStatus}
                              onChange={(e) => handleStatusChange(record.episodeId, e.target.value as PlatformSubmissionStatus)}
                              className="min-h-7 rounded-md border border-line bg-card px-2 text-xs font-bold text-fg"
                            >
                              {(Object.keys(PLATFORM_SUBMISSION_STATUS_LABELS) as PlatformSubmissionStatus[]).map((statusKey) => (
                                <option key={statusKey} value={statusKey}>{PLATFORM_SUBMISSION_STATUS_LABELS[statusKey]}</option>
                              ))}
                            </select>
                          </dd>
                        </div>
                      ) : null}
                      {galleryConfig.visibleProperties.includes("cutCount") ? (
                        <div className="flex items-center justify-between"><dt className="text-fg-3">원고 분량</dt><dd className="font-semibold text-fg">{record.cutCount}컷 (컷당 평균 {formatKrw(rollup.costPerCutKrw)})</dd></div>
                      ) : null}
                      {galleryConfig.visibleProperties.includes("settlementTotal") ? (
                        <div className="flex items-center justify-between"><dt className="text-fg-3">어시스턴트 정산 롤업</dt><dd className="font-black text-accent">{formatKrw(rollup.totalSettlementKrw)}</dd></div>
                      ) : null}
                      {galleryConfig.visibleProperties.includes("assistants") ? (
                        <div className="pt-1">
                          <dt className="text-fg-3 mb-1">투입 어시스턴트 내역</dt>
                          <dd className="space-y-1">
                            {record.assistantSettlements.map((line) => (
                              <div key={line.id} className="flex items-center justify-between rounded-lg bg-card px-2 py-1 text-[0.6875rem]">
                                <span className="truncate font-semibold text-fg">{line.assistantName}</span>
                                <span className="font-bold text-fg-2">{formatKrw(computeAssistantLineItemAmountKrw(line))} · {ASSISTANT_PAYMENT_STATUS_LABELS[line.paymentStatus]}</span>
                              </div>
                            ))}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "timeline" ? (
        <div className="space-y-3" data-testid="notion-timeline-view">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised px-3.5 py-2 text-xs">
            <label className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <input type="checkbox" checked={timelineConfig.showTableAlongside} onChange={(e) => setTimelineConfig((prev) => ({ ...prev, showTableAlongside: e.target.checked }))} />
              좌측 속성 표 함께 표시 (`timeline_toggle_show_table`)
            </label>
            <label className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <input type="checkbox" checked={timelineConfig.separateStartAndEndDates} onChange={(e) => setTimelineConfig((prev) => ({ ...prev, separateStartAndEndDates: e.target.checked }))} />
              시작일·마감일 구간 분리 (`toggle_timeline_separate_dates`)
            </label>
            <label className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <input type="checkbox" checked={timelineConfig.avoidWeekendsOnShift} onChange={(e) => setTimelineConfig((prev) => ({ ...prev, avoidWeekendsOnShift: e.target.checked }))} />
              의존 회차 일정 이동 시 주말 회피 (`avoid_weekends`)
            </label>
          </div>

          <div className="space-y-2">
            {visibleRecords.map((record) => {
              const rollup = computeEpisodeSettlementRollup(record);
              return (
                <div key={record.episodeId} className="grid gap-3 rounded-2xl border border-line bg-panel p-3.5 lg:grid-cols-[minmax(18rem,1fr)_minmax(0,1.6fr)]">
                  {timelineConfig.showTableAlongside ? (
                    <div className="border-b border-line pb-2 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-fg">{record.title}</span>
                        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-bold text-fg-2">
                          {PLATFORM_SUBMISSION_STATUS_LABELS[record.platformSubmissionStatus]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fg-2">정산 총액 {formatKrw(rollup.totalSettlementKrw)} · 어시스턴트 {rollup.assistantCount}명</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-52">
                      <div className="flex items-center justify-between text-xs font-semibold text-fg">
                        <span>{timelineConfig.separateStartAndEndDates ? `${record.startDateIso} → ${record.deadlineDateIso}` : `마감일: ${record.deadlineDateIso}`}</span>
                        {timelineConfig.showDependencyArrows && record.dependencyEpisodeIds.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[0.6875rem] text-accent">
                            <GitBranch className="size-3" aria-hidden="true" />선행: {record.dependencyEpisodeIds.join(", ")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-card border border-line">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(25, Math.min(100, rollup.paymentCompletionPercent || 45))}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => handleShiftTimeline(record.episodeId, 3)} className={buttonClass({ variant: "outline", size: "sm" })}>+3일 연쇄 이동</button>
                      <button type="button" onClick={() => handleShiftTimeline(record.episodeId, 7)} className={buttonClass({ variant: "outline", size: "sm" })}>+7일 연쇄 이동</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-line" data-testid="notion-table-view">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-raised text-fg-2">
              <tr>
                <th className="p-3 font-bold">회차</th>
                <th className="p-3 font-bold">마감일</th>
                <th className="p-3 font-bold">플랫폼 제출 여부</th>
                <th className="p-3 font-bold">컷 수</th>
                <th className="p-3 font-bold">어시스턴트 정산 내역</th>
                <th className="p-3 font-bold text-right">정산 롤업 합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {visibleRecords.map((record) => {
                const rollup = computeEpisodeSettlementRollup(record);
                return (
                  <tr key={record.episodeId}>
                    <td className="p-3 font-black text-fg">{record.title}</td>
                    <td className="p-3 font-semibold text-fg">{record.deadlineDateIso}</td>
                    <td className="p-3">
                      <span className="rounded-full border border-line bg-card px-2 py-0.5 font-bold">{PLATFORM_SUBMISSION_STATUS_LABELS[record.platformSubmissionStatus]}</span>
                    </td>
                    <td className="p-3">{record.cutCount}컷</td>
                    <td className="p-3 space-y-1">
                      {record.assistantSettlements.map((line) => (
                        <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-2 py-1">
                          <span>{line.assistantName} ({ASSISTANT_WORK_ROLE_LABELS[line.role]}) · {formatKrw(computeAssistantLineItemAmountKrw(line))}</span>
                          <select
                            aria-label={`${line.assistantName} ${record.episodeId} 정산 상태`}
                            value={line.paymentStatus}
                            onChange={(e) => handlePaymentStatusChange(record.episodeId, line.id, e.target.value as AssistantPaymentStatus)}
                            className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.6875rem] font-semibold"
                          >
                            <option value="unpaid">미정산</option>
                            <option value="scheduled">이체 예정</option>
                            <option value="paid">정산 완료</option>
                          </select>
                        </div>
                      ))}
                    </td>
                    <td className="p-3 text-right font-black text-accent">{formatKrw(rollup.totalSettlementKrw)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center gap-2 text-xs font-black text-fg">
            <Users className="size-4 text-accent" aria-hidden="true" />
            고용 어시스턴트별 누적 정산 롤업 (Group by Assistant)
          </div>
          <div className="mt-3 space-y-2">
            {assistantRollups.map((person) => (
              <div key={person.assistantId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3 text-xs">
                <div>
                  <p className="font-black text-fg">
                    {person.assistantName} <span className="font-semibold text-fg-3">· {ASSISTANT_WORK_ROLE_LABELS[person.primaryRole]}</span>
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-fg-2">참여 {person.episodeCount}개 회차 · 누적 {person.totalCutsAssigned}컷/장</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-fg">{formatKrw(person.totalAmountKrw)}</p>
                  <p className="text-[0.6875rem] text-fg-2">
                    지급 완료 {formatKrw(person.paidAmountKrw)} · <span className="font-bold text-warn">미정산 {formatKrw(person.unpaidAmountKrw)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center gap-2 text-xs font-black text-fg">
            <Coins className="size-4 text-accent" aria-hidden="true" />
            어시스턴트 회차 정산 항목 빠른 등록
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 text-xs">
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              대상 회차
              <select aria-label="정산 추가 대상 회차" value={targetEpisodeId} onChange={(e) => setTargetEpisodeId(e.target.value)} className="min-h-9 rounded-lg border border-line bg-card px-2 text-fg">
                {records.map((r) => <option key={r.episodeId} value={r.episodeId}>{r.title}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              어시스턴트 이름
              <input aria-label="신규 정산 어시스턴트 이름" value={newAssistantName} onChange={(e) => setNewAssistantName(e.target.value)} className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-fg" />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              담당 공정
              <select aria-label="신규 정산 담당 공정" value={newAssistantRole} onChange={(e) => setNewAssistantRole(e.target.value as AssistantWorkRole)} className="min-h-9 rounded-lg border border-line bg-card px-2 text-fg">
                {(Object.keys(ASSISTANT_WORK_ROLE_LABELS) as AssistantWorkRole[]).map((roleKey) => (
                  <option key={roleKey} value={roleKey}>{ASSISTANT_WORK_ROLE_LABELS[roleKey]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              정산 방식
              <select aria-label="신규 정산 단가 방식" value={newPricingModel} onChange={(e) => setNewPricingModel(e.target.value as AssistantPricingModel)} className="min-h-9 rounded-lg border border-line bg-card px-2 text-fg">
                <option value="per-cut">컷당 단가 × 작업 컷 수</option>
                <option value="flat-episode">회차당 고정 정액</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              단가 (원)
              <input type="number" aria-label="신규 정산 단가 금액" value={newUnitRateKrw} onChange={(e) => setNewUnitRateKrw(Number(e.target.value) || 0)} className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-fg" />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              작업 컷 수
              <input type="number" aria-label="신규 정산 작업 컷 수" value={newCutCount} onChange={(e) => setNewCutCount(Number(e.target.value) || 0)} className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-fg" />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-bold text-fg-2">
              예상 정산액: <strong className="text-accent">{formatKrw(newPricingModel === "per-cut" ? newUnitRateKrw * newCutCount : newUnitRateKrw)}</strong>
            </span>
            <button type="button" onClick={handleAddAssistantSettlement} className={buttonClass({ size: "sm" })}>
              <Plus className="size-3.5" aria-hidden="true" />정산 항목 추가
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
