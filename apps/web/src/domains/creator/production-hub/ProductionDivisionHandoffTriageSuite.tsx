import { ArrowRight, ClipboardCheck, LoaderCircle, Play, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ProductionProjectAggregate, ProductionTaskStatus } from "@toonstudio/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import type { ProductionClientCommand } from "./production-api";
import { buildDivisionHandoffQueue, divisionQueueCandidateMatches, type DivisionQueueFilter } from "./production-division-handoff-queue";
import { previewProductionBoardMove } from "./production-board-move-preview";
import { productionAssignmentName, productionProcessLabel, submissionStatusLabel, taskStatusLabel } from "./production-labels";
import { ProductionEmptyState, ProductionPill, ProductionSectionCard } from "./production-ui";

export interface ProductionDivisionHandoffTriageSuiteProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string | null;
  readonly episodeLabel: string;
  readonly canEdit: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
}

function actionLabel(status: ProductionTaskStatus, bt: (ko: string, en: string) => string): string {
  if (status === "ready") return bt("인계 준비로 이동", "Mark ready for handoff");
  if (status === "in-progress") return bt("작업 시작·재개", "Start or resume work");
  if (status === "internal-review") return bt("내부 검수로 전달", "Send to internal review");
  return bt("승인본 인계 완료", "Complete approved handoff");
}

export function ProductionDivisionHandoffTriageSuite(props: ProductionDivisionHandoffTriageSuiteProps) {
  return <DivisionHandoffQueue key={`${props.aggregate.projectId}:${props.episodeId ?? "all"}`} {...props} />;
}

function DivisionHandoffQueue({ aggregate, episodeId, episodeLabel, canEdit, execute }: ProductionDivisionHandoffTriageSuiteProps) {
  const bt = useBilingual("ProductionDivisionHandoffQueue");
  const [filter, setFilter] = useState<DivisionQueueFilter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const entries = useMemo(() => buildDivisionHandoffQueue(aggregate, episodeId, new Date().toISOString()), [aggregate, episodeId]);
  const filters = [
    { id: "all", label: bt("전체", "All") },
    { id: "actionable", label: bt("다음 단계 확인", "Check next steps") },
    { id: "blocked", label: bt("차단·누락", "Blocked or missing info") },
    { id: "review", label: bt("검수 대기", "In review") },
  ] as const;
  const filterCounts = useMemo(() => {
    const counts: Record<DivisionQueueFilter, number> = { all: entries.length, actionable: 0, blocked: 0, review: 0 };
    for (const entry of entries) {
      if (divisionQueueCandidateMatches(entry, "actionable")) counts.actionable += 1;
      if (divisionQueueCandidateMatches(entry, "blocked")) counts.blocked += 1;
      if (divisionQueueCandidateMatches(entry, "review")) counts.review += 1;
    }
    return counts;
  }, [entries]);
  const words = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/u);
  const matches = entries.filter((entry) => divisionQueueCandidateMatches(entry, filter) && words.every((word) =>
    `${entry.task.title} ${productionProcessLabel(aggregate, entry.task.processKey, bt)} ${entry.task.assignmentIds.map((id) => productionAssignmentName(aggregate, id)).join(" ")}`.normalize("NFKC").toLocaleLowerCase().includes(word)));
  const move = async (id: string) => {
    if (!canEdit || busy.current) return;
    const entry = entries.find((item) => item.task.id === id);
    if (!entry?.action) return;
    const preview = previewProductionBoardMove(aggregate, [id], entry.action.target, new Date().toISOString());
    if (!preview.allowed) { setError(preview.reason); return; }
    busy.current = true; setPendingId(id); setError(null); setNotice(null);
    try {
      const message = bt(`${entry.task.title}: ${actionLabel(entry.action.target, bt)} 완료`, `${entry.task.title}: ${actionLabel(entry.action.target, bt)} completed`);
      await execute({ type: "transition-task-batch", transitions: preview.transitions }, message);
      if (mounted.current) setNotice(message);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : bt("저장하지 못했습니다. 현재 작업 상태를 확인한 뒤 다시 시도하세요.", "Could not save. Check the current task state and try again."));
    } finally {
      busy.current = false;
      if (mounted.current) setPendingId(null);
    }
  };
  return <ProductionSectionCard
    title={bt(`분업 인계 작업함 · ${episodeLabel}`, `Division handoff queue · ${episodeLabel}`)}
    description={bt("담당자, 선행 작업, 고정 입력 버전과 제출본을 확인하고 다음 공정으로 넘깁니다. 승인은 연결된 검수에서 기록합니다.", "Check owners, dependencies, pinned inputs and submissions before handing work on. Record approvals in the linked review.")}
    action={<ProductionPill tone="neutral">{bt(`작업 ${entries.length}개`, `${entries.length} tasks`)}</ProductionPill>}
  >
    <div data-testid="division-handoff-queue" className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={bt("인계 작업 필터", "Handoff task filters")}>
        {filters.map((item) => <button key={item.id} type="button" aria-label={`${item.label} ${filterCounts[item.id]}`} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setLimit(20); }}
          className={buttonClass({ variant: filter === item.id ? "solid" : "outline", className: "min-h-11 gap-2" })}>
          {item.label}<span className="tabular-nums">{filterCounts[item.id]}</span>
        </button>)}
      </div>
      <p className="text-xs text-fg-3">{bt("다음 단계 확인에는 이동 전 점검할 작업이 모입니다. 실제 이동 가능 여부는 각 작업의 조건으로 확인합니다.", "Check next steps lists tasks to inspect before moving. Each task's requirements determine whether it can move.")}</p>
      <label className="block text-xs font-semibold text-fg-2">
        {bt("작업·공정·담당자 검색", "Search tasks, processes or owners")}
        <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent" />
      </label>
      {!canEdit ? <p className="text-xs text-fg-2">{bt("조회 권한으로 열었습니다. 인계 상태 변경에는 프로젝트 편집 권한이 필요합니다.", "Opened with view access. Project edit permission is required to move work.")}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-fg">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-good/30 bg-good/10 p-3 text-sm text-fg">{notice}</p> : null}
      {matches.length ? <ul className="space-y-3">
        {matches.slice(0, limit).map((entry) => {
          const { task, action } = entry;
          const incomplete = entry.dependencies.filter((dependency) => !dependency.complete);
          const taskHref = new URLSearchParams({ openTask: task.id });
          if (entry.episodeId) taskHref.set("boardEpisode", entry.episodeId);
          const boardHref = `/production/projects/${encodeURIComponent(aggregate.projectId)}/production?${taskHref.toString()}`;
          const reviewQuery = new URLSearchParams({ task: task.id });
          if (entry.episodeId) reviewQuery.set("episode", entry.episodeId);
          const reviewHref = `/production/projects/${encodeURIComponent(aggregate.projectId)}/review?${reviewQuery.toString()}`;
          const inReview = divisionQueueCandidateMatches(entry, "review");
          return <li key={task.id} data-testid={`division-task-${task.id}`} className={cn("min-w-0 rounded-2xl border bg-panel p-4", incomplete.length || task.status === "blocked" ? "border-warn/40" : "border-line")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-accent">{productionProcessLabel(aggregate, task.processKey, bt)}</p>
                <h3 className="mt-1 break-words text-sm font-bold text-fg"><Link to={boardHref} className="outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">{task.title}</Link></h3>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-2"><UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                  {entry.activeAssignmentIds.length ? entry.activeAssignmentIds.map((id) => productionAssignmentName(aggregate, id)).join(" · ") : bt("유효한 담당자 배정 필요", "Assign an eligible owner")}
                </p>
              </div>
              <ProductionPill tone={task.status === "done" ? "success" : inReview ? "accent" : "neutral"}>{taskStatusLabel(task.status, bt)}</ProductionPill>
            </div>
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
              <div className="rounded-xl border border-line bg-card p-3">
                <p className="font-bold text-fg">{bt("받을 작업과 고정 입력", "Upstream work and pinned inputs")}</p>
                {entry.dependencies.length ? <ul className="mt-2 space-y-1.5">{entry.dependencies.map((dependency) => <li key={dependency.id}>
                  {dependency.task ? <Link to={`/production/projects/${encodeURIComponent(aggregate.projectId)}/production?openTask=${encodeURIComponent(dependency.id)}`} className="inline-flex min-h-11 items-center gap-1.5 break-words text-fg-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent">
                    <span aria-hidden="true">{dependency.complete ? "✓" : "→"}</span>{dependency.task.title} · {taskStatusLabel(dependency.task.status, bt)}
                    {!dependency.complete && ["approved", "done"].includes(dependency.task.status) ? <span className="text-warn">{bt("최신 승인본 확인 필요", "Check current approved outputs")}</span> : null}
                  </Link> : <p className="break-all text-bad">{bt("선행 작업을 찾을 수 없습니다", "Upstream task not found")}: {dependency.id}</p>}
                </li>)}</ul> : <p className="mt-2 text-fg-3">{bt("지정된 선행 작업 없음", "No upstream tasks specified")}</p>}
                <p className="mt-2 text-fg-2">{bt(`고정 입력 ${task.inputRevisionRefs.length}개`, `${task.inputRevisionRefs.length} pinned inputs`)}</p>
                {task.inputRevisionRefs.map((revision) => <p key={`${revision.id}:${revision.revision}:${revision.digest}`} className="mt-1 break-all font-mono text-[0.6875rem] text-fg-3">{revision.id} · r{revision.revision} · {revision.digest.slice(0, 12)}</p>)}
                {task.inputRevisionRefs.length > 0 && !entry.inputVersionsCurrent ? <p className="mt-2 text-warn">{bt("고정 입력이 선행 공정의 최신 승인본과 다릅니다. 작업 상세에서 입력 버전을 확인하세요.", "Pinned inputs differ from the upstream approved version. Check input versions in task details.")}</p> : null}
                {entry.uncheckedCount ? <p className="mt-2 text-warn">{bt(`미완료 체크 항목 ${entry.uncheckedCount}개`, `${entry.uncheckedCount} unchecked items`)}</p> : null}
              </div>
              <div className="rounded-xl border border-line bg-card p-3">
                <p className="font-bold text-fg">{bt("넘길 제출본과 검수 담당", "Deliverables and reviewers")}</p>
                {entry.outputs.length ? <ul className="mt-2 space-y-2">{entry.outputs.map((output) => <li key={output.id} className="break-words text-fg-2">
                  <p>{output.deliverable?.type ?? output.id} {output.deliverable ? `· ${output.deliverable.expectedFormat}` : bt("· 산출물 연결 확인 필요", "· Check deliverable link")}</p>
                  <p className="mt-1 text-fg-3">{output.current ? `r${output.current.revisionRef.revision} · ${submissionStatusLabel(output.current.status, bt)}` : bt("현재 제출본 없음", "No current submission")}</p>
                  {output.approved ? <p className="mt-1 text-good">{bt(`마지막 승인본 r${output.approved.revisionRef.revision}`, `Last approved r${output.approved.revisionRef.revision}`)}</p> : null}
                  {output.approved && output.current?.id !== output.approved.id ? <p className="mt-1 text-warn">{bt("현재 제출본은 승인본과 다릅니다.", "The current submission differs from the approved one.")}</p> : null}
                </li>)}</ul> : <p className="mt-2 text-fg-3">{bt("연결된 산출물 없음", "No linked deliverables")}</p>}
                <p className="mt-2 text-fg-2">{entry.activeReviewerIds.length ? entry.activeReviewerIds.map((id) => productionAssignmentName(aggregate, id)).join(" · ") : bt("유효한 검수자 미배정", "No eligible reviewer assigned")}</p>
                {task.dueAt ? <p className="mt-2 text-fg-3">{bt("마감", "Due")}: <time dateTime={task.dueAt}>{new Date(task.dueAt).toLocaleString()}</time></p> : null}
              </div>
            </div>
            {action && !action.preview.allowed ? <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-xs text-fg">{action.preview.reason}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {action ? <button type="button" disabled={!canEdit || pendingId !== null || !action.preview.allowed} onClick={() => void move(task.id)} className={buttonClass({ className: "min-h-11 gap-1.5" })}>
                {pendingId === task.id ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
                {actionLabel(action.target, bt)}
              </button> : null}
              {inReview ? <Link to={reviewHref} className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5" })}><ClipboardCheck className="size-4" aria-hidden="true" />{bt("제출본 검수 열기", "Open submission review")}</Link> : null}
              <Link to={boardHref} className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5" })}>{bt("작업 상세·배정", "Task details and assignments")}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </div>
          </li>;
        })}
      </ul> : <ProductionEmptyState title={entries.length ? bt("조건에 맞는 작업이 없습니다", "No matching tasks") : bt("분업 작업을 만들어 주세요", "Create division tasks")}
        description={entries.length ? bt("다른 필터를 선택하거나 검색어를 지워 주세요.", "Choose another filter or clear the search.") : bt("공정 보드에서 회차 작업을 만들고 담당자와 입력 버전을 연결하면 인계 상태가 여기에 표시됩니다.", "Create episode tasks on the process board, then connect owners and input revisions to see handoff status here.")}
        action={<Link to={`/production/projects/${encodeURIComponent(aggregate.projectId)}/production`} className={buttonClass({ variant: "outline", className: "min-h-11" })}>{bt("공정 보드 열기", "Open process board")}</Link>} />}
      {matches.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 20)} className={buttonClass({ variant: "outline", className: "min-h-11 w-full" })}>{bt(`작업 더 보기 · ${Math.min(limit, matches.length)}/${matches.length}`, `Show more tasks · ${Math.min(limit, matches.length)}/${matches.length}`)}</button> : null}
    </div>
  </ProductionSectionCard>;
}
