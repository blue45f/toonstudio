import { CalendarClock, Check, Columns2, Send } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";
import { reviewLaneLabel, taskStatusLabel } from "./production-labels";
import { getAuthSession, getAuthSessionRevision } from "@/domains/auth/public/session/auth-session-state";
import { taskOutputRejectionDisposition } from "./production-task-output-rejection";
import { useProductionReviewClock } from "./use-production-review-clock";
import { ProductionEmptyState, ProductionPill, ProductionSectionCard } from "./production-ui";
import {
  addLocalDays,
  buildTaskReviewPath,
  buildReviewRequestPlan,
  confirmsReviewRequest,
  createReviewRequestDraft,
  deriveReviewRequestEpisodes,
  deriveReviewRequestReviewers,
  deriveReviewRequestTasks,
  REVIEW_REQUEST_CHECKPOINTS,
  reviewRequestIssueLabel,
  toLocalDateInputValue,
  validateReviewRequestDraft,
  type ReviewRequestDraft,
  type ProductionReviewRequestPlan,
} from "./review-request-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const DUE_PRESETS: readonly { readonly days: number; readonly label: { readonly ko: string; readonly en: string } }[] = [
  { days: 0, label: { ko: "오늘", en: "Today" } },
  { days: 1, label: { ko: "내일", en: "Tomorrow" } },
  { days: 3, label: { ko: "3일 뒤", en: "In 3 days" } },
  { days: 7, label: { ko: "7일 뒤", en: "In 7 days" } },
];

/**
 * 검수 요청 한 화면 폼.
 *
 * 대상(회차·검수자·항목)·마감·체크포인트를 단계 없이 한 화면에서 정해 바로 보낸다.
 * 기존 제작 작업에 검수자를 배정하고 현재 제출본을 검수하도록 요청한다.
 * 받는 사람의 통합 작업함은 같은 작업의 현재 제출본으로 연결된다.
 */
export function ProductionReviewRequestForm({
  aggregate,
  execute,
  canEdit,
  refresh,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly refresh?: () => Promise<void>;
}) {
  const bt = useBilingual("ProductionReviewRequestForm");
  const episodes = useMemo(() => deriveReviewRequestEpisodes(aggregate), [aggregate]);
  const [draft, setDraft] = useState<ReviewRequestDraft>(() => createReviewRequestDraft(episodes[0]?.episodeId ?? "", new Date()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sentEpisodeId, setSentEpisodeId] = useState<string | null>(null);
  const [sentTaskId, setSentTaskId] = useState<string | null>(null), [sealed, setSealed] = useState(false);
  const [requestId, nextRequestId] = useState(() => `review-request:${crypto.randomUUID()}`), request = useRef<ProductionReviewRequestPlan | null>(null);
  const [actor] = useState(() => ({ id: getAuthSession()?.user.id ?? null, revision: getAuthSessionRevision() }));
  const mounted = useRef(true), latest = useRef(aggregate);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { latest.current = aggregate; }, [aggregate]);
  const current = useCallback(() => mounted.current && actor.revision === getAuthSessionRevision() && actor.id === (getAuthSession()?.user.id ?? null), [actor]);
  const at = useProductionReviewClock(aggregate.assignments), tasks = deriveReviewRequestTasks(aggregate, draft.episodeId);
  const selectedTask = tasks.find((task) => task.id === draft.taskId);
  const taskCanRequest = selectedTask && ["in-progress", "internal-review"].includes(selectedTask.status);
  const sending = useRef(false);

  const reviewers = useMemo(
    () => deriveReviewRequestReviewers(aggregate, draft.episodeId, draft.taskId, at),
    [aggregate, draft.episodeId, draft.taskId, at],
  );
  const reviewer = reviewers.find((entry) => entry.assignmentId === draft.reviewerAssignmentId) ?? null;

  // 회차를 바꾸면 이전 회차에서만 자격이 있던 검수자·항목 선택을 조용히 남기지 않고 정리한다.
  useEffect(() => {
    if (sealed) return;
    setDraft((current) => {
      if (!current.reviewerAssignmentId) return current;
      const nextReviewer = reviewers.find((entry) => entry.assignmentId === current.reviewerAssignmentId);
      if (!nextReviewer) return { ...current, reviewerAssignmentId: "", lane: "" };
      if (current.lane && !nextReviewer.lanes.includes(current.lane)) {
        return { ...current, lane: nextReviewer.lanes[0] ?? "" };
      }
      return current;
    });
  }, [reviewers, sealed]);

  const acknowledge = useCallback(() => {
    if (!request.current || !current()) return;
    setSentTaskId(request.current.task.id); setSentEpisodeId(draft.episodeId); request.current = null; setSealed(false); setError(""); nextRequestId(`review-request:${crypto.randomUUID()}`);
  }, [current, draft.episodeId]);
  useEffect(() => { if (sealed && !pending && current() && request.current && confirmsReviewRequest(aggregate, request.current)) acknowledge(); }, [aggregate, sealed, pending, current, acknowledge]);

  const issues = validateReviewRequestDraft(draft, new Date());
  const firstIssue = issues[0];
  const blocked = !canEdit || pending || issues.length > 0 || !taskCanRequest;

  const patch = (next: Partial<ReviewRequestDraft>) => {
    if (sealed) return;
    setSentEpisodeId(null);
    setSentTaskId(null);
    setDraft((current) => ({ ...current, ...next }));
  };

  const toggleCheckpoint = (id: (typeof REVIEW_REQUEST_CHECKPOINTS)[number]["id"]) => {
    patch({
      checkpointIds: draft.checkpointIds.includes(id)
        ? draft.checkpointIds.filter((entry) => entry !== id)
        : [...draft.checkpointIds, id],
    });
  };

  const submit = async () => {
    if ((!sealed && blocked) || sending.current || !current()) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      if (sealed) {
        if (!refresh) throw new Error(bt("최신 프로젝트에서 원래 검수 요청의 결과를 확인하세요. 선택 내용은 유지됩니다.", "Check the original review request in the latest project. Your choices are preserved."));
        await refresh();
        if (current() && request.current && confirmsReviewRequest(latest.current, request.current)) acknowledge();
        else if (current()) setError(bt("원래 검수 요청의 현재 작업·제출본을 아직 확인하지 못했습니다. 선택 내용을 고정한 채 다시 확인할 수 있습니다.", "The original request's task and current submissions are not confirmed yet. Its fixed choices are kept for another status check."));
        return;
      }
      const plan = buildReviewRequestPlan(aggregate, draft, { id: requestId, localize: bt, at: new Date().toISOString() });
      request.current = structuredClone(plan); setSealed(true);
      await execute(plan.command, bt("현재 제출본의 검수 요청을 보냈습니다.", "Review requested for the current submissions."));
      if (current()) acknowledge();
    } catch (cause) {
      if (current()) {
        if (actor.id && taskOutputRejectionDisposition(cause, actor.id, aggregate.projectId) !== "sealed") { request.current = null; setSealed(false); }
        setError(cause instanceof Error ? cause.message : bt("검수 요청을 보내지 못했습니다. 입력 내용은 그대로 있습니다.", "Could not send the request. Your input was preserved."));
      }
    } finally {
      sending.current = false;
      if (current()) setPending(false);
    }
  };

  return (
    <ProductionSectionCard
      title={bt("검수 요청", "Request a review")}
      description={bt(
        "실제 작업의 현재 제출본과 입력을 유지하고 검수자·마감·체크포인트를 추가합니다. 받은 사람은 작업에 연결된 현재 원고를 검수합니다.",
        "Keep the existing task's current submissions and inputs while adding reviewers, a due date and checkpoints. The reviewer opens the manuscripts linked to that task.",
      )}
    >
      {episodes.length === 0 ? (
        <ProductionEmptyState
          title={bt("검수 정책이 있는 회차가 없습니다", "No episodes with a review policy")}
          description={bt("회차에 검수 정책을 정하면 그 회차를 대상으로 검수 요청을 보낼 수 있습니다.", "Set a review policy on an episode to request a review for it.")}
        />
      ) : (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <fieldset disabled={!canEdit || pending || sealed} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block text-sm font-semibold">
              {bt("대상 회차", "Episode")}
              <select
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                value={draft.episodeId}
                disabled={!canEdit || pending}
                onChange={(event) => patch({ episodeId: event.target.value, taskId: "", reviewerAssignmentId: "", lane: "" })}
              >
                <option value="">{bt("검수할 회차 선택", "Select an episode to review")}</option>
                {episodes.map((episode) => (
                  <option key={episode.episodeId} value={episode.episodeId}>
                    {bt(episode.label.ko, episode.label.en)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">{bt("현재 원고를 검수할 작업", "Task whose manuscripts need review")}<select className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm" value={draft.taskId} onChange={(event) => patch({ taskId: event.target.value, reviewerAssignmentId: "", lane: "" })} required>
              <option value="">{bt("실제 작업 선택", "Select an existing task")}</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {taskStatusLabel(task.status, bt)}</option>)}</select></label>
            <label className="block text-sm font-semibold">
              {bt("검수자", "Reviewer")}
              <select
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                value={draft.reviewerAssignmentId}
                disabled={!canEdit || pending}
                onChange={(event) => {
                  const next = reviewers.find((entry) => entry.assignmentId === event.target.value);
                  patch({ reviewerAssignmentId: event.target.value, lane: next?.lanes[0] ?? "" });
                }}
              >
                <option value="">{bt("검수자 선택", "Choose a reviewer")}</option>
                {reviewers.map((entry) => (
                  <option key={entry.assignmentId} value={entry.assignmentId}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4 text-fg-3" aria-hidden="true" />
                {bt("마감", "Due")}
              </span>
              <input
                type="date"
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                value={draft.dueDate}
                disabled={!canEdit || pending}
                onChange={(event) => patch({ dueDate: event.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bt("마감 빠른 선택", "Due date shortcuts")}>
            {DUE_PRESETS.map((preset) => {
              const value = toLocalDateInputValue(addLocalDays(new Date(), preset.days));
              return (
                <button
                  key={preset.days}
                  type="button"
                  aria-pressed={draft.dueDate === value}
                  disabled={!canEdit || pending}
                  onClick={() => patch({ dueDate: value })}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-xs font-semibold disabled:opacity-50",
                    draft.dueDate === value ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                >
                  {bt(preset.label.ko, preset.label.en)}
                </button>
              );
            })}
          </div>

          {reviewer ? (
            <fieldset>
              <legend className="text-sm font-semibold">{bt("검수 항목", "Review lane")}</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reviewer.lanes.map((lane) => (
                  <button
                    key={lane}
                    type="button"
                    aria-pressed={draft.lane === lane}
                    disabled={!canEdit || pending}
                    onClick={() => patch({ lane })}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-semibold disabled:opacity-50",
                      draft.lane === lane ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised",
                    )}
                  >
                    {reviewLaneLabel(lane, bt)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset>
            <legend className="text-sm font-semibold">{bt("체크포인트", "Checkpoints")}</legend>
            <p className="mt-1 text-xs text-fg-3">{bt("검수자가 반드시 확인할 항목입니다. 검수 작업의 완료 조건으로 남습니다.", "What the reviewer must check. Saved as the request's completion criteria.")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REVIEW_REQUEST_CHECKPOINTS.map((checkpoint) => {
                const selected = draft.checkpointIds.includes(checkpoint.id);
                return (
                  <button
                    key={checkpoint.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!canEdit || pending}
                    onClick={() => toggleCheckpoint(checkpoint.id)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold disabled:opacity-50",
                      selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised",
                    )}
                  >
                    {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    {bt(checkpoint.label.ko, checkpoint.label.en)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-sm font-semibold">
            {bt("요청 메모 (선택)", "Note (optional)")}
            <textarea
              className="mt-2 w-full resize-y rounded-xl border border-line bg-card p-3 text-sm leading-6"
              rows={2}
              maxLength={500}
              value={draft.note}
              disabled={!canEdit || pending}
              onChange={(event) => patch({ note: event.target.value })}
              placeholder={bt("예: 이번 회차는 봉투 문양 노출 순서만 집중해서 봐 주세요.", "e.g. Please focus on the envelope motif reveal order in this episode.")}
            />
          </label>
          {selectedTask ? <p className="text-sm text-fg-2">{bt(`고정 입력 ${selectedTask.inputRevisionRefs.length}개 · 현재 산출물 ${selectedTask.outputDeliverableIds.length}개를 그대로 사용합니다.`, `${selectedTask.inputRevisionRefs.length} pinned inputs and ${selectedTask.outputDeliverableIds.length} outputs are preserved.`)}</p> : null}
          {selectedTask && !taskCanRequest ? <p role="status" className="text-sm text-warn">{bt("작업 보드에서 입력을 준비하고 작업을 시작한 뒤 요청하세요. 상태를 자동으로 건너뛰지 않습니다.", "Prepare inputs and start work on the task board before requesting review. No workflow states are skipped.")} <Link to={`/production/projects/${encodeURIComponent(aggregate.projectId)}/production?task=${encodeURIComponent(selectedTask.id)}`}>{bt("선택한 작업 열기", "Open selected task")}</Link></p> : null}
          </fieldset>

          {!canEdit ? (
            <p role="status" className="text-sm text-fg-2">{bt("편집 권한이 있어야 검수 요청을 보낼 수 있습니다.", "You need edit access to send a review request.")}</p>
          ) : firstIssue ? (
            <p role="status" className="text-sm text-fg-2">{reviewRequestIssueLabel(firstIssue, bt)}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-bad">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={buttonClass()} disabled={pending || (!sealed && blocked)}>
              <Send size={16} aria-hidden="true" />
              {pending ? bt("저장 결과 확인 중…", "Checking save result…") : sealed ? bt("저장 상태 확인", "Check save status") : bt("검수 요청 보내기", "Send review request")}
            </button>
            {reviewer && draft.lane ? (
              <ProductionPill tone="accent">
                {bt(`${reviewer.displayName} · ${reviewLaneLabel(draft.lane, bt)}`, `${reviewer.displayName} · ${reviewLaneLabel(draft.lane, bt)}`)}
              </ProductionPill>
            ) : null}
          </div>

          {sealed ? <p role="status" className="text-sm text-fg-2">{bt("원래 작업·제출본·명령을 고정했습니다. 상태 확인은 원래 요청을 복구하며 새 검수 작업을 만들지 않습니다.", "The original task, submissions and command are fixed. Status checks recover that request without creating another review task.")}</p> : null}
          {sentEpisodeId && sentTaskId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-good/35 bg-good/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Check className="size-4 text-good" aria-hidden="true" />
                {bt("검수 요청을 보냈습니다. 받는 사람의 '내 검수'에 바로 뜹니다.", "Request sent. It now appears in the reviewer's inbox.")}
              </p>
              <Link
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
                to={buildTaskReviewPath(aggregate.projectId, sentTaskId, sentEpisodeId)}
              >
                <Columns2 className="size-4" aria-hidden="true" />
                {bt("비교 검수로 열기", "Open in compare review")}
              </Link>
            </div>
          ) : null}
        </form>
      )}
    </ProductionSectionCard>
  );
}
