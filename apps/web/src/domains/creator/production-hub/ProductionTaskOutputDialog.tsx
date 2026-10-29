import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { PRODUCTION_STUDIO_DOCUMENT_ROLES, productionTaskAcceptsOutput, type ProductionProjectAggregate, type ProductionTask } from "@toonstudio/core/production";
import { getAuthSession, getAuthSessionRevision } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import { buildTaskOutputCommand, emptyTaskOutputDraft, taskOutputActorAssignments, taskOutputDocumentRoleLabel, type TaskOutputFormDraft } from "./production-task-output-model";
import { loadTaskOutputCaptureChoices, loadTaskOutputCapturePages, refreshTaskOutputCapturePage, type TaskOutputCaptureChoice, type TaskOutputCapturePages } from "./production-task-output-source";
import type { ProductionClientCommand, SubmitProductionTaskOutputClientCommand } from "./production-api";
import { refreshScopedTaskOutputPurpose, validateScopedTaskOutputSelection, type TaskOutputScopedPurpose } from "./production-task-output-scoped-purpose";
import { roleTypeLabel } from "./production-labels";
import { taskOutputRejectionDisposition } from "./production-task-output-rejection";
import { createTaskOutputSaveExpectation, hasConfirmedTaskOutputSave, type TaskOutputSaveExpectation } from "./production-task-output-save-confirmation";
import { useTaskOutputAssignments } from "./use-task-output-assignments";
import { ProductionTaskOutputRefreshContext } from "./production-task-output-refresh-context";

const FIELD = "mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
type Copy = ReturnType<typeof useBilingual>;
type ChoiceState = { readonly scope: string; readonly choices: readonly TaskOutputCaptureChoice[] | null; readonly error: string | null };

function CapturePicker({ workId, authRevision, title, disabled, showPreview = false, onVerified, bt }: {
  readonly workId: string; readonly authRevision: number; readonly title: string; readonly disabled: boolean;
  readonly showPreview?: boolean;
  readonly onVerified: Dispatch<SetStateAction<TaskOutputCapturePages | null>>; readonly bt: Copy;
}) {
  const scope = JSON.stringify([workId, authRevision]);
  const [attempt, retry] = useState(0), [selected, select] = useState("");
  const [state, setState] = useState<ChoiceState>({ scope, choices: null, error: null });
  const [pageError, setPageError] = useState<string | null>(null), [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<TaskOutputCapturePages | null>(null), [previewOrdinal, setPreviewOrdinal] = useState(0);
  const choices = state.scope === scope ? state.choices : null;
  const inputPage = checked?.pages.find((page) => page.ordinal === previewOrdinal) ?? checked?.pages[0];
  useEffect(() => {
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && getAuthSessionRevision() === authRevision;
    setState({ scope, choices: null, error: null });
    select(""); onVerified(null);
    void loadTaskOutputCaptureChoices(workId, { signal: controller.signal }).then((items) => {
      if (current()) setState({ scope, choices: items, error: null });
    }, (cause: unknown) => {
      if (current()) setState({ scope, choices: null, error: cause instanceof Error ? cause.message : bt("저장된 원고를 확인하지 못했습니다.", "Could not check saved manuscripts.") });
    });
    return () => controller.abort();
  }, [workId, authRevision, scope, attempt, onVerified, bt]);
  useEffect(() => {
    const controller = new AbortController();
    const choice = choices?.find((item) => item.key === selected);
    onVerified(null); setChecked(null); setPreviewOrdinal(0); setPageError(null); setChecking(Boolean(choice));
    if (choice) void loadTaskOutputCapturePages(choice, { signal: controller.signal }).then((pages) => {
      if (!controller.signal.aborted && getAuthSessionRevision() === authRevision) { onVerified(pages); setChecked(pages); setChecking(false); }
    }, (cause: unknown) => {
      if (!controller.signal.aborted && getAuthSessionRevision() === authRevision) {
        setChecking(false); setPageError(cause instanceof Error ? cause.message : bt("원고 페이지를 확인하지 못했습니다.", "Could not verify manuscript pages."));
      }
    });
    return () => controller.abort();
  }, [selected, choices, authRevision, onVerified, bt]);
  return <fieldset className="space-y-2 rounded-xl border border-line p-3" disabled={disabled}>
    <legend className="px-1 text-sm font-semibold">{title}</legend>
    <label className="block text-sm">{bt("저장된 검수 원고", "Saved review manuscript")}
      <select required className={FIELD} value={selected} onChange={(event) => { onVerified(null); select(event.target.value); }}>
        <option value="">{bt("원고를 명시적으로 선택하세요", "Select a manuscript")}</option>
        {choices?.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
      </select>
    </label>
    {state.error || pageError ? <p role="alert" className="text-sm text-bad">{state.error ?? pageError}</p> : null}
    {!choices && !state.error ? <p role="status" className="text-sm text-fg-2">{bt("저장 원고를 불러오고 있습니다.", "Loading saved manuscripts.")}</p> : null}
    {choices?.length === 0 ? <p role="status" className="text-sm text-fg-2">{bt("저장된 검수 원고가 없습니다. Studio에서 원고를 저장하고 고정 검수 이미지를 만든 뒤 다시 확인하세요.", "No saved review manuscript. Save in Studio and create a pinned review capture, then refresh.")}</p> : null}
    {checking ? <p role="status" className="text-sm text-fg-2">{bt("모든 페이지의 고정 원본과 좌표를 확인하고 있습니다.", "Checking every page against the pinned source.")}</p> : null}
    {showPreview && checked && inputPage ? <>
      <label className="block text-sm">{bt("입력 원고 미리 볼 페이지", "Input manuscript page to preview")}<select className={FIELD} value={inputPage.ordinal} onChange={(event) => setPreviewOrdinal(Number(event.target.value))}>
        {checked.pages.map((page) => <option key={page.pageId} value={page.ordinal}>{bt(`${page.ordinal + 1}페이지`, `Page ${page.ordinal + 1}`)}</option>)}
      </select></label>
      <img className="mx-auto block h-auto w-full max-w-md rounded-lg border border-line" src={inputPage.url}
        alt={bt(`최초 입력 원고 ${inputPage.ordinal + 1}페이지`, `Initial input manuscript page ${inputPage.ordinal + 1}`)} loading="lazy" decoding="async"
        onError={() => setPageError(bt("입력 이미지가 만료되었거나 불러오지 못했습니다. 저장 원고를 다시 확인하세요.", "The input image expired or could not load. Refresh the saved manuscript."))} />
    </> : null}
    <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => { onVerified(null); select(""); retry((value) => value + 1); }}>{bt("저장 원고 다시 확인", "Refresh saved manuscripts")}</button>
  </fieldset>;
}

function ScopeSelection({ source, draft, patch, onVerified, onError, bt }: {
  readonly source: TaskOutputCapturePages | null; readonly draft: TaskOutputFormDraft;
  readonly patch: (value: Partial<TaskOutputFormDraft>) => void; readonly onVerified: Dispatch<SetStateAction<TaskOutputCapturePages | null>>;
  readonly onError: (message: string) => void; readonly bt: Copy;
}) {
  const [ordinal, setOrdinal] = useState<number | null>(null), [failed, setFailed] = useState(false), [renewing, setRenewing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const page = source?.pages.find((item) => item.ordinal === ordinal) ?? source?.pages[0];
  const generation = useRef(0);
  const fence = useRef({ source, key: source?.choice.key ?? null, ordinal: page?.ordinal ?? null });
  useLayoutEffect(() => {
    generation.current += 1; controller.current?.abort(); controller.current = null;
    fence.current = { source, key: source?.choice.key ?? null, ordinal: page?.ordinal ?? null };
    setRenewing(false); setFailed(false);
    return () => { generation.current += 1; controller.current?.abort(); controller.current = null; };
  }, [source, page?.ordinal]);
  const toggle = (field: "pageIds" | "frameIds", id: string, checked: boolean) => patch({ [field]: checked ? [...draft[field], id] : draft[field].filter((value) => value !== id) });
  const renewImage = async () => {
    if (!source || !page || renewing || controller.current) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request; setRenewing(true);
    const epoch = generation.current, sourceKey = source.choice.key, pageOrdinal = page.ordinal;
    const sameScope = () => !request.signal.aborted && generation.current === epoch
      && fence.current.source === source && fence.current.key === sourceKey && fence.current.ordinal === pageOrdinal;
    const current = () => controller.current === request && sameScope();
    try {
      const fresh = await refreshTaskOutputCapturePage(source, page.ordinal, { signal: request.signal });
      if (!current()) return;
      onVerified((baseline) => sameScope() && baseline === source ? { ...source, pages: source.pages.map((item) => item.ordinal === fresh.ordinal ? fresh : item) } : baseline);
      setFailed(false);
    } catch (cause) {
      if (current()) { onVerified((baseline) => sameScope() && baseline === source ? null : baseline); onError(cause instanceof Error ? cause.message : bt("원고 이미지 접근을 확인하지 못했습니다.", "Could not verify access to the manuscript image.")); }
    } finally { if (current()) { controller.current = null; setRenewing(false); } }
  };
  return <fieldset className="space-y-2 rounded-xl border border-line p-3" disabled={!source}>
    <legend className="px-1 text-sm font-semibold">{bt("이 작업에 사용할 원고 범위", "Manuscript scope for this task")}</legend>
    <label className="block text-sm">{bt("사용 범위", "Selection scope")}
      <select required className={FIELD} value={draft.selectionMode} onChange={(event) => {
        const mode = event.target.value;
        if (mode === "" || mode === "document" || mode === "pages" || mode === "frames") patch({ selectionMode: mode, pageIds: [], frameIds: [] });
      }}>
        <option value="">{bt("사용 범위를 선택하세요", "Select a scope")}</option>
        <option value="document">{bt("전체 문서를 이 작업 원고로 사용", "Use the entire document for this task")}</option>
        <option value="pages">{bt("페이지를 직접 선택", "Select pages")}</option>
        <option value="frames">{bt("프레임을 직접 선택", "Select frames")}</option>
      </select>
    </label>
    {source ? <p className="text-xs text-fg-2">{bt(`고정 페이지 ${source.pages.length}개 · 저장 버전 ${source.sourceServerRevision}`, `${source.pages.length} pinned pages · saved revision ${source.sourceServerRevision}`)}</p> : null}
    {draft.selectionMode === "document" ? <p className="text-sm text-fg-2">{bt("문서 안의 모든 페이지를 이 작업의 제출 범위로 명시합니다.", "All document pages will be explicitly bound to this task output.")}</p> : null}
    {source && page ? <>
      <label className="block text-sm">{bt("미리 볼 원고 페이지", "Manuscript page to preview")}<select className={FIELD} value={page.ordinal} onChange={(event) => { generation.current += 1; controller.current?.abort(); controller.current = null; setRenewing(false); setFailed(false); setOrdinal(Number(event.target.value)); }}>
        {source.pages.map((item) => <option key={item.pageId} value={item.ordinal}>{bt(`${item.ordinal + 1}페이지`, `Page ${item.ordinal + 1}`)}</option>)}
      </select></label>
      <div className="relative mx-auto max-w-md overflow-hidden rounded-lg border border-line bg-canvas">
        {!failed ? <img key={page.url} src={page.url} alt={bt(`제출 원고 ${page.ordinal + 1}페이지`, `Output manuscript page ${page.ordinal + 1}`)} loading="lazy" decoding="async" className="block h-auto w-full" onError={() => setFailed(true)} /> : <p role="status" className="p-4 text-sm text-fg-2">{bt("이미지 주소가 만료되었거나 불러오지 못했습니다. 현재 페이지를 다시 확인하세요.", "The image expired or could not load. Refresh this page.")}</p>}
        {!failed && draft.selectionMode === "frames" ? <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-accent" viewBox={`0 0 ${page.mapping.page.width} ${page.mapping.page.height}`} preserveAspectRatio="none">
          {page.mapping.page.frames.map((frame, index) => { const chosen = draft.frameIds.includes(JSON.stringify([page.pageId, frame.id])); return <g key={frame.id}>
            {frame.polygon ? <polygon points={frame.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill="currentColor" fillOpacity={chosen ? 0.2 : 0} stroke="currentColor" strokeWidth={3} vectorEffect="non-scaling-stroke" />
              : <rect {...frame.bounds} fill="currentColor" fillOpacity={chosen ? 0.2 : 0} stroke="currentColor" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
            <text x={frame.bounds.x + 5} y={frame.bounds.y + 20} fill="currentColor" fontSize={18}>{index + 1}</text>
          </g>; })}
        </svg> : null}
      </div>
      <button type="button" disabled={renewing} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => { void renewImage(); }}>{renewing ? bt("페이지 접근 확인 중", "Checking page access") : bt("현재 페이지 이미지 다시 확인", "Refresh this page image")}</button>
      {draft.selectionMode === "frames" ? <fieldset><legend className="text-sm font-semibold">{bt(`${page.ordinal + 1}페이지의 프레임 선택`, `Select frames on page ${page.ordinal + 1}`)}</legend>
        <div className="flex flex-wrap gap-2 py-2">{page.frameIds.map((id, index) => { const key = JSON.stringify([page.pageId, id]), checked = draft.frameIds.includes(key); return <button key={key} type="button" aria-pressed={checked} className={buttonClass({ variant: checked ? "solid" : "outline", className: "min-h-11" })} onClick={() => toggle("frameIds", key, !checked)}>{bt(`프레임 ${index + 1}`, `Frame ${index + 1}`)}</button>; })}</div>
        {!page.frameIds.length ? <p className="text-sm text-fg-2">{bt("이 페이지에는 선택 가능한 저장 프레임이 없습니다.", "No saved frames are available on this page.")}</p> : null}
      </fieldset> : null}
    </> : null}
    {draft.selectionMode === "pages" ? <div className="max-h-64 overflow-y-auto rounded-lg bg-panel p-2">
      {source?.pages.map((item) => <label key={item.pageId} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.pageIds.includes(item.pageId)} onChange={(event) => toggle("pageIds", item.pageId, event.target.checked)} />{bt(`${item.ordinal + 1}페이지를 제출에 포함`, `Include page ${item.ordinal + 1}`)}</label>)}
    </div> : null}
  </fieldset>;
}

export interface ProductionTaskOutputDialogProps {
  readonly aggregate: ProductionProjectAggregate; readonly task: ProductionTask; readonly actorId: string;
  readonly authRevision: number; readonly canEdit: boolean;
  readonly scopedPurpose?: TaskOutputScopedPurpose;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>; readonly onClose: () => void;
}
export default function ProductionTaskOutputDialog({ aggregate, task, actorId, authRevision, canEdit, scopedPurpose, execute, onClose }: ProductionTaskOutputDialogProps) {
  const bt = useBilingual("ProductionTaskOutputDialog");
  const refresh = useContext(ProductionTaskOutputRefreshContext);
  const [draft, setDraft] = useState(() => ({ ...emptyTaskOutputDraft(), assignmentId: scopedPurpose?.assignmentId ?? "" })), [source, setSource] = useState<TaskOutputCapturePages | null>(null);
  const canSubmit = canEdit || Boolean(scopedPurpose);
  const [initialSource, setInitialSource] = useState<TaskOutputCapturePages | null>(null);
  const publishSource = useCallback<Dispatch<SetStateAction<TaskOutputCapturePages | null>>>((value) => {
    setSource(value);
    if (value === null) setDraft((old) => ({ ...old, selectionMode: "", pageIds: [], frameIds: [] }));
  }, []);
  const [ids] = useState(() => ({ submissionId: `submission:${crypto.randomUUID()}`, deliverableId: `deliverable:${crypto.randomUUID()}` }));
  const [busy, setBusy] = useState(false), [sealed, setSealed] = useState(false), [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false), checkingSave = useRef(false);
  const command = useRef<SubmitProductionTaskOutputClientCommand | null>(null), saving = useRef(false), composing = useRef(false);
  const expectedSave = useRef<TaskOutputSaveExpectation | null>(null);
  const scope = JSON.stringify([aggregate.projectId, aggregate.workId, task.id, actorId, authRevision]);
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const latestAggregate = useRef(aggregate);
  useLayoutEffect(() => { latestAggregate.current = aggregate; }, [aggregate]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useCallback(() => mounted.current && currentScope.current === scope && getAuthSessionRevision() === authRevision && getAuthSession()?.user.id === actorId, [scope, authRevision, actorId]);
  const assignments = useTaskOutputAssignments(aggregate, task, actorId);
  const acceptsOutput = productionTaskAcceptsOutput(task);
  const recordedSubmissionId = command.current?.submissionId;
  const recorded = Boolean(recordedSubmissionId && aggregate.submissions.some((item) => item.id === recordedSubmissionId));
  useEffect(() => {
    // 복구된 ACK는 이후의 상태·기간 변경보다 먼저 확인한다. 새로운 쓰기는 보내지 않는다.
    if (!busy && sealed && current() && expectedSave.current && hasConfirmedTaskOutputSave(aggregate, expectedSave.current)) onClose();
  }, [aggregate, busy, sealed, current, onClose]);
  const confirmSaved = async () => {
    if (!refresh || checkingSave.current || busy || !current()) return;
    checkingSave.current = true; setConfirming(true); setError(null);
    try {
      await refresh();
      if (current() && !(expectedSave.current && hasConfirmedTaskOutputSave(latestAggregate.current, expectedSave.current))) {
        setError(bt("원래 제출의 입력·선택 원고·작업 연결을 아직 모두 확인하지 못했습니다. 고정 내용은 유지됩니다. 최신 상태 확인을 다시 시도하거나 프로젝트의 제출 이력을 확인하세요.", "The original submission's inputs, selected manuscript and task link could not all be confirmed yet. Its fixed content is kept. Check the save status again or inspect the project's submission history."));
      }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : bt("저장 상태를 확인하지 못했습니다. 고정 내용을 유지한 채 다시 확인할 수 있습니다.", "Could not check the save status. The fixed content is kept for another check."));
    } finally { checkingSave.current = false; if (current()) setConfirming(false); }
  };
  const patch = (value: Partial<TaskOutputFormDraft>) => { if (!sealed) { setDraft((old) => ({ ...old, ...value })); setError(null); } };
  const submit = async () => {
    if (sealed && refresh) { await confirmSaved(); return; }
    if (saving.current || !canSubmit || !current()) return;
    saving.current = true; setBusy(true);
    try {
      if (command.current && aggregate.submissions.some((item) => item.id === command.current?.submissionId)) {
        if (expectedSave.current && hasConfirmedTaskOutputSave(aggregate, expectedSave.current)) onClose();
        else setError(bt("같은 제출 ID의 저장 기록이 있습니다. 원래 고정한 입력·원고 범위·작업 연결을 모두 확인하지 못해 다시 쓰지 않았습니다. 최신 프로젝트와 제출 이력을 확인하세요.", "A submission with the same ID is stored. Its original inputs, manuscript scope and task link could not all be confirmed, so no new write was sent. Check the latest project and submission history."));
        return;
      }
      if (!productionTaskAcceptsOutput(task)) throw new Error(bt("이 상태의 작업에는 새 원고를 제출할 수 없습니다. 허용되는 변경 요청으로 작업 상태를 전환하거나 후속 작업을 만드세요.", "This task does not accept new outputs. Use an allowed change request to transition it, or create a follow-up task."));
      const selectedPurpose = !canEdit && scopedPurpose && command.current === null ? await refreshScopedTaskOutputPurpose(scopedPurpose, aggregate, task, actorId) : null;
      if (!current()) return;
      const planned = command.current ?? buildTaskOutputCommand({ aggregate, task, actorId, draft, source, initialSource, ids, at: Date.now() });
      if (selectedPurpose) validateScopedTaskOutputSelection(selectedPurpose, planned);
      const body = command.current ?? { ...planned, ...(selectedPurpose ? { writeContext: selectedPurpose.context } : {}) };
      if (!taskOutputActorAssignments(aggregate, task, actorId, Date.now()).some((assignment) => assignment.id === body.submittedByAssignmentId)) throw new Error(bt("선택한 제출 역할이 더 이상 유효하지 않습니다.", "The selected submission assignment is no longer valid."));
      if (command.current === null) expectedSave.current = createTaskOutputSaveExpectation(aggregate, task, body, source, initialSource);
      command.current = body; saving.current = true; setSealed(true); setBusy(true); setError(null);
      await execute(body, bt("작업 산출물과 고정 원고 제출을 저장했습니다.", "Task output and pinned manuscript submitted."));
      if (current()) onClose();
    } catch (cause) {
      if (current()) {
        const disposition = taskOutputRejectionDisposition(cause, actorId, aggregate.projectId);
        if (disposition !== "sealed") { command.current = null; expectedSave.current = null; setSealed(false); }
        const message = cause instanceof Error ? cause.message : bt("제출하지 못했습니다. 선택한 내용은 유지됩니다.", "Submission failed. Your choices are preserved.");
        setError(disposition === "permission-denied" ? `${message} ${bt("현재 프로젝트와 원고 권한을 다시 확인하세요. 입력을 수정하거나 창을 닫을 수 있습니다.", "Recheck current project and manuscript access. You can edit the draft or close this dialog.")}` : message);
      }
    } finally { saving.current = false; if (current()) setBusy(false); }
  };
  return <ProductionWorkspaceDialog title={bt("작업 원고 제출", "Submit task manuscript")}
    description={bt("저장된 검수 원고를 이 작업에 명시적으로 연결합니다. 산출물 정의·작업 연결·첫 제출은 서버가 함께 저장합니다.", "Explicitly bind a saved review manuscript to this task. The server saves the output definition, task link and submission together.")}
    onClose={onClose} dirty={JSON.stringify(draft) !== JSON.stringify(emptyTaskOutputDraft()) || Boolean(source || initialSource) || sealed} busy={busy || confirming} wide>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!composing.current) void submit(); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
      <p className="text-sm font-semibold">{task.title}</p>
      {!acceptsOutput ? <p role="status" className="rounded-xl border border-warn/30 p-3 text-sm">{bt("이 상태의 작업에는 새 원고를 제출할 수 없습니다. 허용되는 변경 요청으로 작업 상태를 전환하거나 후속 작업을 만드세요. 입력 내용은 창을 닫기 전까지 유지됩니다.", "This task does not accept new outputs. Use an allowed change request to transition it, or create a follow-up task. Your draft is kept until you close this dialog.")}</p> : !assignments.length ? <p role="status" className="rounded-xl border border-warn/30 p-3 text-sm">{bt("현재 시각에 유효한 제출 역할이 없습니다. 담당 범위와 배정 기간을 확인하세요. 입력 내용은 창을 닫기 전까지 유지됩니다.", "No submission assignment is active at this time. Check its scope and assignment period. Your draft is kept until you close this dialog.")}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm">{error}</p> : null}
      <fieldset disabled={busy || confirming || sealed || !canSubmit} className="space-y-4">
        <label className="block text-sm">{bt("제출 역할", "Submission assignment")}<select required className={FIELD} value={draft.assignmentId} onChange={(event) => patch({ assignmentId: event.target.value })}>
          <option value="">{bt("내 연결 역할을 선택하세요", "Select your linked assignment")}</option>
          {assignments.filter((assignment) => canEdit || !scopedPurpose || assignment.id === scopedPurpose.assignmentId).map((assignment) => <option key={assignment.id} value={assignment.id}>{aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName} · {roleTypeLabel(assignment.roleType, bt)}</option>)}
        </select></label>
        <label className="block text-sm">{bt("문서 역할", "Document role")}<select required className={FIELD} value={draft.documentRole} onChange={(event) => { const value = PRODUCTION_STUDIO_DOCUMENT_ROLES.find((role) => role === event.target.value); patch({ documentRole: value ?? "" }); }}>
          <option value="">{bt("문서 역할을 선택하세요", "Select a document role")}</option>{PRODUCTION_STUDIO_DOCUMENT_ROLES.map((role) => <option key={role} value={role}>{taskOutputDocumentRoleLabel(role, bt)}</option>)}
        </select></label>
        <label className="block text-sm">{bt("제출할 산출물", "Output to submit")}<select required className={FIELD} value={draft.targetId} onChange={(event) => patch({ targetId: event.target.value })}>
          <option value="">{bt("산출물을 선택하세요", "Select an output")}</option>
          {aggregate.deliverables.filter((item) => task.outputDeliverableIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.type} · {item.expectedFormat}</option>)}
          <option value="new">{bt("새 산출물 정의와 함께 제출", "Define and submit a new output")}</option>
        </select></label>
        {draft.targetId === "new" ? <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <label className="text-sm">{bt("산출물 종류", "Output type")}<input required maxLength={120} className={FIELD} value={draft.newType} onChange={(event) => patch({ newType: event.target.value })} /></label>
          <label className="text-sm">{bt("예상 형식", "Expected format")}<input required maxLength={240} className={FIELD} value={draft.newFormat} onChange={(event) => patch({ newFormat: event.target.value })} /></label>
          <label className="text-sm sm:col-span-2">{bt("완료 기준 · 한 줄에 하나", "Completion criteria · one per line")}<textarea required maxLength={4000999} className={`${FIELD} min-h-24`} value={draft.criteria} onChange={(event) => patch({ criteria: event.target.value })} /></label>
        </div> : null}
        <CapturePicker workId={aggregate.workId} authRevision={authRevision} title={bt("제출 원고", "Output manuscript")} disabled={busy || sealed} onVerified={publishSource} bt={bt} />
        <ScopeSelection key={source?.choice.key ?? "empty-source"} source={source} draft={draft} patch={patch} onVerified={publishSource} onError={setError} bt={bt} />
        <label className="block text-sm">{bt("고정 입력 기준", "Pinned input basis")}<select required className={FIELD} value={draft.inputMode} onChange={(event) => { const value = event.target.value; if (value === "" || value === "current" || value === "approved-dependencies" || value === "initial-capture") patch({ inputMode: value }); }}>
          <option value="">{bt("입력 기준을 선택하세요", "Select an input basis")}</option>
          <option value="current" disabled={!task.inputRevisionRefs.length}>{bt("작업의 현재 고정 입력", "Task's current pinned inputs")}</option>
          <option value="approved-dependencies" disabled={!task.dependencyTaskIds.length}>{bt("선행 작업의 최신 승인 산출물", "Current approved outputs of dependencies")}</option>
          <option value="initial-capture" disabled={Boolean(task.inputRevisionRefs.length || task.outputDeliverableIds.length || task.dependencyTaskIds.length)}>{bt("최초 입력 원고를 별도로 선택", "Select an initial input manuscript separately")}</option>
        </select></label>
        {draft.inputMode === "initial-capture" ? <CapturePicker workId={aggregate.workId} authRevision={authRevision} title={bt("최초 입력 원고", "Initial input manuscript")} disabled={busy || sealed} showPreview onVerified={setInitialSource} bt={bt} /> : null}
      </fieldset>
      {sealed ? <p role="status" className="text-sm text-fg-2">{refresh ? bt("이 제출의 내용과 ID는 고정되어 있습니다. 저장 상태 확인은 원래 요청의 영수증으로 결과를 복구하며 새 제출을 만들지 않습니다.", "This submission's content and IDs are fixed. Checking the save status recovers the original request's receipt without creating another submission.") : bt("이 제출의 내용과 ID는 고정되어 있습니다. 응답을 확인하지 못한 저장은 프로젝트 최신 상태 확인으로 복구하고, 재시도는 같은 내용을 보냅니다.", "This submission's content and IDs are fixed. Recover unconfirmed saves by refreshing the project; retries send the same content.")}</p> : null}
      {recorded ? <p role="status" className="text-sm text-fg-2">{bt("같은 제출 ID의 저장 기록을 확인했습니다. 원래 입력·선택 원고·작업 연결이 모두 일치하면 창을 닫습니다. 일치 여부가 불명확하면 다시 쓰지 않고 고정 내용을 유지하므로 최신 제출 이력을 확인하세요.", "A record with the same submission ID was found. This dialog closes when its original inputs, selected manuscript and task link all match. An ambiguous result keeps the fixed content without sending another write; check the latest submission history.")}</p> : null}
      {sealed && refresh ? <button type="button" className={buttonClass({ className: "min-h-11" })} disabled={busy || confirming} onClick={() => { void confirmSaved(); }}>{confirming ? bt("저장 상태 확인 중", "Checking save status") : bt("저장 상태 확인", "Check save status")}</button>
        : <button type="submit" className={buttonClass({ className: "min-h-11" })} disabled={busy || confirming || recorded || !acceptsOutput || !canSubmit || !assignments.length || (!sealed && (!source || (draft.inputMode === "initial-capture" && !initialSource)))}>{busy ? bt("제출 응답 확인 중", "Waiting for submission acknowledgement") : sealed ? bt("같은 내용으로 다시 제출", "Retry the same submission") : bt("원고 제출 저장", "Save manuscript submission")}</button>}
    </form>
  </ProductionWorkspaceDialog>;
}
