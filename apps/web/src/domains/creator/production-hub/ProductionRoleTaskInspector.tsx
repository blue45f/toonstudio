import { AlertTriangle, ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  PRODUCTION_ROLE_LABELS,
  eligibleAssignmentsForTask,
  productionTaskHasCurrentApprovedOutputs,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskGate,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";
import { previewProductionBoardMove } from "./production-board-move-preview";
import { productionProcessLabel, taskStatusLabel } from "./production-labels";
import { productionSurfacePath } from "./production-project-surfaces";
import { ProductionPill } from "./production-ui";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const REVIEW = new Set<ProductionTaskStatus>(["internal-review", "external-review", "conditionally-approved"]);
const CLOSED = new Set<ProductionTaskStatus>(["approved", "done", "cancelled", "out-of-scope"]);
const ProductionTaskOutputEntry = lazy(() => import("./ProductionTaskOutputEntry"));

function nextAction(status: ProductionTaskStatus): { ko: string; en: string; target: ProductionTaskStatus } | null {
  if (["draft", "needs-input", "blocked", "paused"].includes(status))
    return { ko: "입력 준비 완료", en: "Mark inputs ready", target: "ready" };
  if (status === "ready") return { ko: "작업 시작", en: "Start work", target: "in-progress" };
  if (status === "changes-requested") return { ko: "수정 작업 시작", en: "Start revision", target: "in-progress" };
  if (status === "in-progress") return { ko: "검수 요청", en: "Request review", target: "internal-review" };
  if (status === "approved") return { ko: "공정 완료", en: "Complete step", target: "done" };
  return null;
}

/** 정식 검수와 일반 상태 이동을 분리하고, 서버 저장 실패를 이 작업에 표시한다. */
export function ProductionRoleTaskInspector({ aggregate, task, gate, canEdit, execute, at }: {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly gate: ProductionTaskGate;
  readonly canEdit: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly at: string;
}) {
  const bt = useBilingual("ProductionRoleTaskInspector");
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = nextAction(task.status);
  const preview = action ? previewProductionBoardMove(aggregate, [task.id], action.target, at) : null;
  const gateReady = action?.target === "internal-review" ? gate.canRequestReview
    : action?.target === "in-progress" || action?.target === "ready" ? gate.blockers.length === 0 : true;
  const editable = canEdit && !CLOSED.has(task.status);
  const episodeId = task.scope.kind === "episode" ? task.scope.id
    : task.scope.ancestors.find((scope) => scope.kind === "episode")?.id;
  const reviewQuery = new URLSearchParams({ task: task.id });
  if (episodeId) reviewQuery.set("episode", episodeId);
  const reviewHref = productionSurfacePath(aggregate.projectId, "review", reviewQuery.toString());
  const name = (id: string) => {
    const assignment = aggregate.assignments.find((entry) => entry.id === id);
    return aggregate.parties.find((party) => party.id === assignment?.partyId)?.publicDisplayName ?? id;
  };
  const options = (kind: "owner" | "reviewer") => {
    const currentIds = kind === "owner" ? task.assignmentIds : task.reviewerAssignmentIds;
    const eligible = eligibleAssignmentsForTask({
      task, assignments: aggregate.assignments, departmentKey: gate.departmentKey, kind, at,
    });
    return [...new Map([...eligible, ...aggregate.assignments.filter((entry) => currentIds.includes(entry.id))]
      .map((entry) => [entry.id, entry])).values()];
  };
  const run = async (command: ProductionClientCommand, message: string) => {
    if (!canEdit || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await execute(command, message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : bt("저장하지 못했습니다. 다시 시도해 주세요.", "Could not save. Try again.")); }
    finally { pending.current = false; setBusy(false); }
  };
  const assign = (kind: "owner" | "reviewer", id: string) => {
    if (!editable) return;
    if (id && !eligibleAssignmentsForTask({ task, assignments: aggregate.assignments, departmentKey: gate.departmentKey, kind, at: new Date().toISOString() }).some((entry) => entry.id === id)) {
      setError(bt("지금 이 작업을 맡을 수 없는 담당자입니다. 역할·범위·계약 기간을 확인해 주세요.", "This assignment is no longer eligible. Check its role, scope and dates."));
      return;
    }
    const field = kind === "owner" ? "assignmentIds" : "reviewerAssignmentIds";
    const rest = task[field].slice(1).filter((value) => value !== id);
    void run({ type: "upsert-task-batch", tasks: [{ ...task, [field]: id ? [id, ...rest] : rest }], expectedTasks: [task] },
      bt("담당 배정을 저장했습니다.", "Assignment saved."));
  };
  const transition = (target: ProductionTaskStatus) => {
    const move = previewProductionBoardMove(aggregate, [task.id], target, new Date().toISOString());
    if (!move.allowed) { setError(move.reason); return; }
    void run({ type: "transition-task-batch", transitions: move.transitions },
      bt("작업 상태를 변경했습니다.", "Task status updated."));
  };
  const dependencies = task.dependencyTaskIds.map((id) => ({ id, task: aggregate.tasks.find((entry) => entry.id === id) }));
  return (
    <aside aria-label={bt("선택한 작업", "Selected task")} aria-busy={busy}
      className="rounded-2xl border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-accent">{productionProcessLabel(aggregate, task.processKey, bt)} · {episodeId ?? task.scope.id}</p>
          <h2 className="mt-1 text-lg font-black leading-6 text-fg">{task.title}</h2>
        </div>
        <ProductionPill>{taskStatusLabel(task.status, bt)}</ProductionPill>
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {[
          [bt("고정 입력", "Pinned inputs"), task.inputRevisionRefs.length],
          [bt("산출물", "Deliverables"), task.outputDeliverableIds.length],
          [bt("선행 작업", "Dependencies"), `${dependencies.filter((entry) => entry.task && ["approved", "done"].includes(entry.task.status) && productionTaskHasCurrentApprovedOutputs(entry.task, aggregate)).length}/${dependencies.length}`],
          [bt("예상 공수", "Estimated effort"), `${task.estimateHours?.likely ?? "—"}h`],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">{label}</dt><dd className="mt-1 font-bold text-fg">{value}</dd></div>)}
      </dl>
      <section className="mt-4 space-y-2" aria-label={bt("작업 게이트", "Task requirements")}>
        {gate.blockers.map((message) => <p key={message} className="flex gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs leading-5 text-fg"><LockKeyhole className="size-4 shrink-0" aria-hidden="true" />{message}</p>)}
        {gate.warnings.map((message) => <p key={message} className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-fg"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" />{message}</p>)}
        {preview && !preview.allowed ? <p className="text-xs leading-5 text-fg-2">{preview.reason}</p> : null}
      </section>
      <section className="mt-4 space-y-3" aria-label={bt("담당자 배정", "Assignments")}>
        {(["owner", "reviewer"] as const).map((kind) => <label key={kind} className="block text-xs font-bold text-fg">
          {kind === "owner" ? bt("주 담당자", "Primary assignee") : bt("주 검수자", "Primary reviewer")}
          <select aria-label={`${task.title} ${kind === "owner" ? bt("주 담당자", "Primary assignee") : bt("주 검수자", "Primary reviewer")}`}
            value={(kind === "owner" ? task.assignmentIds : task.reviewerAssignmentIds)[0] ?? ""}
            disabled={!editable || busy} onChange={(event) => assign(kind, event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <option value="">{bt("미정", "Unassigned")}</option>
            {options(kind).map((entry) => <option key={entry.id} value={entry.id}>{name(entry.id)} · {PRODUCTION_ROLE_LABELS[entry.roleType]}</option>)}
          </select>
        </label>)}
      </section>
      {dependencies.length ? <section className="mt-5"><h3 className="text-xs font-bold text-fg">{bt("선행 인수인계", "Upstream handoffs")}</h3>
        <ul className="mt-2 space-y-2">{dependencies.map((entry) => <li key={entry.id} className="rounded-xl border border-line bg-panel p-3 text-xs">
          <p className="font-semibold text-fg">{entry.task?.title ?? entry.id}</p>
          <p className="mt-1 text-fg-2">{entry.task ? taskStatusLabel(entry.task.status, bt) : bt("작업을 찾을 수 없음", "Task not found")}</p>
          {entry.task && ["approved", "done"].includes(entry.task.status) && !productionTaskHasCurrentApprovedOutputs(entry.task, aggregate)
            ? <p className="mt-1 text-warn">{bt("최신 승인본 확인 필요", "Current approved output required")}</p> : null}
        </li>)}</ul></section> : null}
      <section className="mt-5"><h3 className="text-xs font-bold text-fg">{bt("완료 기준", "Completion criteria")}</h3>
        <ul className="mt-2 space-y-2">{task.completionCriteria.map((criterion) => <li key={criterion} className="flex gap-2 rounded-lg bg-panel p-3 text-xs leading-5 text-fg-2"><CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />{criterion}</li>)}</ul>
      </section>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs leading-5 text-fg">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Suspense fallback={null}><ProductionTaskOutputEntry aggregate={aggregate} task={task} canEdit={canEdit} execute={execute} /></Suspense>
        {REVIEW.has(task.status) ? <Link to={reviewHref} className={buttonClass({ size: "sm" })}>{bt("고정 제출본 검수", "Review pinned submission")}<ArrowRight className="size-4" aria-hidden="true" /></Link> : null}
        {action ? <button type="button" disabled={!canEdit || busy || !preview?.allowed || !gateReady}
          className={buttonClass({ size: "sm" })} onClick={() => transition(action.target)}>{bt(action.ko, action.en)}<ArrowRight className="size-4" aria-hidden="true" /></button> : null}
        {REVIEW.has(task.status) ? <button type="button" disabled={!canEdit || busy} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => transition("changes-requested")}>{bt("수정 요청", "Request changes")}</button> : null}
        {["needs-input", "ready", "in-progress", "internal-review", "external-review", "conditionally-approved"].includes(task.status)
          ? <button type="button" disabled={!canEdit || busy} className={buttonClass({ variant: "ghost", size: "sm" })} onClick={() => transition("blocked")}>{bt("차단 처리", "Block task")}</button> : null}
      </div>
    </aside>
  );
}
