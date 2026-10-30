import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { productionTaskAcceptsOutput, type ProductionProjectAggregate, type ProductionTask } from "@toonstudio/core/production";
import { getAuthSession, getAuthSessionRevision, listeners } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { taskOutputActorAssignments } from "./production-task-output-model";
import type { ProductionClientCommand } from "./production-api";
import { useTaskOutputAssignments } from "./use-task-output-assignments";
import { useScopedTaskOutputPurposes } from "./use-scoped-task-output-purposes";

const Dialog = lazy(() => import("./ProductionTaskOutputDialog"));
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };

/** 실제 계정의 제출 역할만 표시하며, 선택하기 전에는 원고 조회를 시작하지 않는다. */
export default function ProductionTaskOutputEntry({ aggregate, task, canEdit, execute }: {
  readonly aggregate: ProductionProjectAggregate; readonly task: ProductionTask | null | undefined;
  readonly canEdit: boolean; readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
}) {
  const bt = useBilingual("ProductionTaskOutputEntry");
  const authRevision = useSyncExternalStore(subscribe, getAuthSessionRevision, () => 0);
  const actorId = getAuthSession()?.user.id ?? null;
  const [openedScope, setOpenedScope] = useState<string | null>(null);
  const [purposeKey, setPurposeKey] = useState({ scope: "", key: "" });
  const assignments = useTaskOutputAssignments(aggregate, task, actorId);
  const scoped = useScopedTaskOutputPurposes(aggregate, task, actorId, authRevision, canEdit);
  const purpose = purposeKey.scope === scoped.scope ? scoped.choices.find((choice) => choice.key === purposeKey.key) : undefined;
  if (!task) return null;
  const scope = JSON.stringify([aggregate.projectId, aggregate.workId, task.id, actorId, authRevision]);
  const allowed = (canEdit || Boolean(purpose)) && productionTaskAcceptsOutput(task) && assignments.length > 0;
  return <>
    {!canEdit && scoped.choices.length ? <label className="text-xs text-fg-2">{bt("담당 제출 범위", "Assigned submission scope")}<select className="ml-2 min-h-11 rounded-lg border border-line bg-panel px-2" value={purpose?.key ?? ""} onChange={(event) => setPurposeKey({ scope: scoped.scope, key: event.target.value })}><option value="">{bt("제출할 담당 범위를 선택하세요", "Select the assigned scope to submit")}</option>{scoped.choices.map((choice) => <option key={choice.key} value={choice.key}>{task.title} · {choice.pageId}{choice.frameId ? ` / ${choice.frameId}` : ""}</option>)}</select></label> : null}
    {!canEdit && scoped.loading ? <span role="status" className="text-xs text-fg-2">{bt("담당 제출 배정을 확인하고 있습니다.", "Checking assigned submission access.")}</span> : null}
    {!canEdit && scoped.error ? <p role="alert" className="text-xs text-bad">{scoped.error}</p> : null}
    <button type="button" disabled={!allowed} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
      onClick={() => { if (allowed && taskOutputActorAssignments(aggregate, task, actorId, Date.now()).length) setOpenedScope(scope); }}>{bt("원고 제출", "Submit manuscript")}</button>
    {!productionTaskAcceptsOutput(task) ? <p className="text-xs text-fg-2">{bt("이 상태의 작업에는 새 원고를 제출할 수 없습니다. 허용되는 변경 요청으로 작업 상태를 전환하거나 후속 작업을 만드세요.", "This task does not accept new outputs. Use an allowed change request to transition it, or create a follow-up task.")}</p> : null}
    {openedScope === scope && actorId ? <Suspense fallback={<p role="status">{bt("원고 제출 도구를 여는 중입니다.", "Opening manuscript submission.")}</p>}>
      <Dialog key={scope} aggregate={aggregate} task={task} actorId={actorId} authRevision={authRevision} canEdit={canEdit} scopedPurpose={purpose} execute={execute} onClose={() => setOpenedScope(null)} />
    </Suspense> : null}
  </>;
}
