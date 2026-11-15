import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ArrowRight, Clock3, Filter, RotateCcw, Sparkles, UserCheck } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  applyMyReviewTriageFiltersToSearch,
  buildMyReviewTargetCutHref,
  deriveMyReviewTriageQueue,
  parseMyReviewTriageFilters,
  type MyReviewTriageItem,
  type MyReviewTriageStatus,
  type MyReviewTriageStatusFilter,
} from "./production-my-review-triage-model";
import { ProductionPill, type ProductionTone } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

function statusTone(status: MyReviewTriageStatus): ProductionTone {
  switch (status) {
    case "changes-requested":
      return "danger";
    case "resubmitted":
      return "accent";
    case "awaiting-approval":
      return "warning";
  }
}

function statusLabel(status: MyReviewTriageStatus, bt: (ko: string, en: string) => string): string {
  switch (status) {
    case "changes-requested":
      return bt("수정요청", "Changes requested");
    case "resubmitted":
      return bt("재검수", "Re-review");
    case "awaiting-approval":
      return bt("승인 대기", "Awaiting approval");
  }
}

function dueBadgeLabel(dueDeltaHours: number | null, bt: (ko: string, en: string) => string): {
  readonly text: string;
  readonly urgent: boolean;
} {
  if (dueDeltaHours === null) {
    return { text: bt("일정 확인", "Check due"), urgent: false };
  }
  if (dueDeltaHours < 0) {
    const overdueHours = Math.abs(dueDeltaHours);
    return {
      text: overdueHours >= 24
        ? bt(`기한 지남 ${Math.ceil(overdueHours / 24)}일`, `${Math.ceil(overdueHours / 24)}d overdue`)
        : bt(`기한 지남 ${overdueHours}시간`, `${overdueHours}h overdue`),
      urgent: true,
    };
  }
  if (dueDeltaHours <= 24) {
    return {
      text: bt(`마감 ${Math.max(1, dueDeltaHours)}시간 전`, `${Math.max(1, dueDeltaHours)}h left`),
      urgent: true,
    };
  }
  return {
    text: bt(`D-${Math.ceil(dueDeltaHours / 24)}`, `D-${Math.ceil(dueDeltaHours / 24)}`),
    urgent: dueDeltaHours <= 72,
  };
}

export interface ProductionMyReviewTriageSectionProps {
  readonly aggregates: readonly ProductionProjectAggregate[];
  readonly roleLens: CreatorRoleLens;
  readonly viewerAssignmentIds?: readonly string[];
  readonly showProjectTitle?: boolean;
  readonly className?: string;
}

export function ProductionMyReviewTriageSection({
  aggregates,
  roleLens,
  viewerAssignmentIds,
  showProjectTitle = false,
  className,
}: ProductionMyReviewTriageSectionProps) {
  const bt = useBilingual("ProductionMyReviewTriageSection");
  const location = useLocation();
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [optimisticSearch, setOptimisticSearch] = useState<{
    readonly fromSearch: string;
    readonly search: string;
  } | null>(null);

  const effectiveSearch =
    optimisticSearch && optimisticSearch.fromSearch === location.search
      ? optimisticSearch.search
      : location.search;
  const latestSearchRef = useRef(effectiveSearch);
  latestSearchRef.current = effectiveSearch;

  const filters = useMemo(() => parseMyReviewTriageFilters(effectiveSearch), [effectiveSearch]);

  const queue = useMemo(
    () =>
      deriveMyReviewTriageQueue({
        aggregates,
        filters,
        roleLens,
        viewerAssignmentIds,
        now,
        bt,
      }),
    [aggregates, bt, filters, now, roleLens, viewerAssignmentIds],
  );

  const updateFilters = useCallback(
    (patch: Partial<{ readonly status: MyReviewTriageStatusFilter; readonly assignee: string }>) => {
      const baseParams = new URLSearchParams(
        latestSearchRef.current.startsWith("?") ? latestSearchRef.current.slice(1) : latestSearchRef.current,
      );
      const current = parseMyReviewTriageFilters(baseParams);
      const nextParams = applyMyReviewTriageFiltersToSearch(baseParams, {
        status: patch.status ?? current.status,
        assignee: patch.assignee ?? current.assignee,
      });
      const query = nextParams.toString();
      const nextSearch = query ? `?${query}` : "";
      latestSearchRef.current = nextSearch;
      setOptimisticSearch({ fromSearch: location.search, search: nextSearch });
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    },
    [location.pathname, location.search, navigate],
  );

  const statusButtons: readonly { readonly id: MyReviewTriageStatusFilter; readonly label: string; readonly count: number }[] = [
    { id: "all", label: bt("전체", "All"), count: queue.countsByStatus.all },
    { id: "changes-requested", label: bt("수정요청", "Changes requested"), count: queue.countsByStatus["changes-requested"] },
    { id: "resubmitted", label: bt("재검수", "Re-review"), count: queue.countsByStatus.resubmitted },
    { id: "awaiting-approval", label: bt("승인 대기", "Awaiting approval"), count: queue.countsByStatus["awaiting-approval"] },
  ];

  const hasActiveFilter = filters.status !== "all" || filters.assignee !== "all";
  const handleItemClick = useCallback(
    (item: MyReviewTriageItem) => {
      if (location.pathname === `/production/projects/${encodeURIComponent(item.projectId)}/review`) {
        requestAnimationFrame(() => {
          const workspace = globalThis.document?.querySelector<HTMLElement>("[data-production-review-workspace]");
          workspace?.scrollIntoView?.({ block: "start", behavior: "instant" as ScrollBehavior });
        });
      }
    },
    [location.pathname],
  );

  return (
    <section
      data-my-review-triage="true"
      data-triage-status={filters.status}
      data-triage-assignee={filters.assignee}
      aria-labelledby="my-review-triage-heading"
      className={cn("rounded-3xl border border-accent/30 bg-card p-4 shadow-sm sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {bt("마감 직전 검수 집중 큐", "Deadline review triage")}
          </p>
          <h2 id="my-review-triage-heading" className="mt-1 text-base font-black text-fg sm:text-lg">
            {bt("내가 처리할 검수", "Reviews to handle")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "수정요청·재검수·승인 대기와 담당자로 좁힌 뒤 대상 컷으로 바로 들어갑니다. 뒤로 가기를 누르면 선택한 필터가 그대로 유지됩니다.",
              "Filter by changes requested, re-review, awaiting approval, and assignee to open the exact target cut. Browser Back preserves your filters.",
            )}
          </p>
        </div>

        {hasActiveFilter ? (
          <button
            type="button"
            data-triage-reset="true"
            onClick={() => updateFilters({ status: "all", assignee: "all" })}
            className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-10 gap-1.5 text-xs" })}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {bt("필터 초기화", "Reset filters")}
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3">
        <div
          role="group"
          aria-label={bt("검수 상태 필터", "Review status filter")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <Filter className="mr-1 size-3.5 text-fg-3" aria-hidden="true" />
          {statusButtons.map((button) => {
            const active = filters.status === button.id;
            return (
              <button
                key={button.id}
                type="button"
                data-triage-status-btn={button.id}
                aria-pressed={active}
                onClick={() => updateFilters({ status: button.id })}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
                )}
              >
                <span>{button.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums",
                    active ? "bg-on-accent/20 text-on-accent" : "bg-raised text-fg-3",
                  )}
                >
                  {button.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-triage-my-only="true"
            aria-pressed={filters.assignee === "me"}
            onClick={() => updateFilters({ assignee: filters.assignee === "me" ? "all" : "me" })}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-accent",
              filters.assignee === "me"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-accent/40",
            )}
          >
            <UserCheck className="size-3.5" aria-hidden="true" />
            {bt(`내 담당만 (${queue.myCount})`, `Mine only (${queue.myCount})`)}
          </button>

          <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2">
            <span>{bt("담당자", "Assignee")}</span>
            <select
              aria-label={bt("검수 담당자 필터", "Review assignee filter")}
              data-triage-assignee-select="true"
              value={filters.assignee}
              onChange={(event) => updateFilters({ assignee: event.target.value })}
              className="max-w-52 bg-transparent font-bold text-fg outline-none"
            >
              <option value="all">{bt("전체 담당자", "All assignees")}</option>
              <option value="me">{bt(`내 담당만 (${queue.myCount})`, `Assigned to me (${queue.myCount})`)}</option>
              {queue.assigneeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {queue.filteredItems.length > 0 ? (
        <ul className="mt-4 grid gap-2.5 lg:grid-cols-2" data-triage-list="true">
          {queue.filteredItems.map((item) => {
            const due = dueBadgeLabel(item.dueDeltaHours, bt);
            const targetHref = buildMyReviewTargetCutHref(item, filters);
            return (
              <li key={item.id}>
                <Link
                  to={targetHref}
                  data-triage-item-id={item.id}
                  data-triage-item-status={item.status}
                  data-triage-target-cut={item.cutId}
                  onClick={() => handleItemClick(item)}
                  className="group flex h-full flex-col justify-between gap-3 rounded-2xl border border-line bg-panel p-3.5 outline-none transition-colors hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ProductionPill tone={statusTone(item.status)}>
                          {statusLabel(item.status, bt)}
                        </ProductionPill>
                        {showProjectTitle ? (
                          <ProductionPill tone="neutral">{item.projectTitle}</ProductionPill>
                        ) : null}
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-black text-accent">
                          {item.cutId}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
                          due.urgent ? "text-bad" : "text-fg-3",
                        )}
                      >
                        <Clock3 className="size-3.5" aria-hidden="true" />
                        {due.text}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-black text-fg group-hover:text-accent">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-fg-2">
                      {item.detail}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-xs">
                    <span className="truncate font-semibold text-fg-2">
                      {bt(`담당: ${item.primaryAssigneeLabel}`, `Owner: ${item.primaryAssigneeLabel}`)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-bold text-accent">
                      {bt(`${item.cutId} 대상 컷 열기`, `Open ${item.cutId}`)}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          data-triage-empty="true"
          className="mt-4 rounded-2xl border border-dashed border-line bg-panel p-5 text-center text-xs text-fg-2"
        >
          <p className="font-bold text-fg">
            {bt("선택한 상태·담당자 조건에 해당하는 검수 항목이 없습니다.", "No review items match the selected status and assignee filters.")}
          </p>
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={() => updateFilters({ status: "all", assignee: "all" })}
              className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-9 text-xs" })}
            >
              {bt("전체 검수 보기", "Show all reviews")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
