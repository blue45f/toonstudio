import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { scopeContains, type ProductionProjectAggregate } from "@toonstudio/core/production";
import { StudioScopedWriteManagementCommandSchema, type StudioScopedEntity, type StudioScopedWriteManagementCommand,
  type StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { isAppApiError } from "@/platform/api-error";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioSharedDocument } from "../studio-shared-document-client";
import { getStudioTeam, type StudioTeamMember } from "../studio-team-client";
import { getStudioScopedWritePolicy, manageStudioScopedWritePolicy } from "../studio-collab/studio-scoped-write-client";
import { loadTaskOutputCaptureChoices, loadTaskOutputCapturePages, type TaskOutputCaptureChoice, type TaskOutputCapturePages } from "./production-task-output-source";
import { scopedDateTimeLocal, scopedManagementRequest, scopedManagementScopes, scopedSavedPages, type ScopedSavedPage } from "./studio-scoped-write-management-model";
import { clearScopedManagementRecovery, loadScopedManagementRecovery, saveScopedManagementRecovery } from "./studio-scoped-write-management-recovery";
import { useProductionReviewClock } from "./use-production-review-clock";

const FIELD = "mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const subscribe = (notify: () => void) => { const listener = () => notify(); listeners.add(listener); return () => { listeners.delete(listener); }; };
const activeTask = (status: string) => !["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"].includes(status);
const message = (error: unknown) => error instanceof Error ? error.message : "요청 결과를 확인하지 못했습니다.";
const entityKey = (entity: StudioScopedEntity) => `${entity.kind}:${entity.id}`;

/** 선택 이벤트의 시각 읽기를 부모의 파생 역할 목록과 다른 React 경계에 둔다. */
function ScopedAssignmentSelect({ label, placeholder, value, options, onSelect }: {
  readonly label: string; readonly placeholder: string; readonly value: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly onSelect: (id: string, selectedAt: number) => void;
}) {
  const change = (event: ChangeEvent<HTMLSelectElement>) => onSelect(event.currentTarget.value, Date.now());
  return <label className="text-sm">{label}<select required className={FIELD} value={value} onChange={change}>
    <option value="">{placeholder}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select></label>;
}

export function ProductionScopedWritePanel({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const revision = useSyncExternalStore(subscribe, getAuthSessionRevision, () => 0), actorId = getAuthUserId();
  if (!actorId) return <p role="alert">편집 범위를 관리하려면 로그인하세요.</p>;
  return <ScopedWritePanel key={JSON.stringify([aggregate.workId, aggregate.projectId, actorId, revision])}
    aggregate={aggregate} actorId={actorId} authRevision={revision} />;
}

function ScopedWritePanel({ aggregate, actorId, authRevision }: {
  readonly aggregate: ProductionProjectAggregate; readonly actorId: string; readonly authRevision: number;
}) {
  const bt = useBilingual("ProductionScopedWritePanel"), workId = aggregate.workId;
  const [policy, setPolicy] = useState<StudioScopedWritePolicy | null>(null), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [attempt, refresh] = useState(0), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(() => loadScopedManagementRecovery(actorId, workId));
  const pendingRef = useRef(pending), busyRef = useRef(false), mounted = useRef(true);
  const [choices, setChoices] = useState<readonly TaskOutputCaptureChoice[]>([]), [saved, setSaved] = useState<readonly ScopedSavedPage[]>([]);
  const [members, setMembers] = useState<readonly StudioTeamMember[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null), [captureKey, selectCapture] = useState("");
  const [capture, setCapture] = useState<TaskOutputCapturePages | null>(null), [checking, setChecking] = useState(false);
  const [pageId, selectPage] = useState(""), [frameId, selectFrame] = useState(""), [layerId, selectLayer] = useState("");
  const [entities, selectEntities] = useState<readonly string[]>([]), [taskId, selectTask] = useState(""), [scopeKey, selectScope] = useState("");
  const [entityQuery, searchEntities] = useState(""), [entityOffset, pageEntities] = useState(0);
  const [grantTargetId, selectGrantTarget] = useState(""), [grantTaskId, selectGrantTask] = useState(""), [assignmentId, selectAssignment] = useState("");
  const [startsAt, setStartsAt] = useState(() => scopedDateTimeLocal(new Date())), [endsAt, setEndsAt] = useState("");
  const now = Date.parse(useProductionReviewClock(aggregate.assignments,
    JSON.stringify([workId, aggregate.projectId, aggregate.revision, actorId, authRevision, aggregate.parties, policy?.policyVersion])));
  const current = useCallback(() => mounted.current && getAuthUserId() === actorId && getAuthSessionRevision() === authRevision, [actorId, authRevision]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setSourceError(null); setCapture(null); selectCapture("");
    void Promise.allSettled([getStudioScopedWritePolicy(workId, controller.signal), loadTaskOutputCaptureChoices(workId, { signal: controller.signal }),
      getStudioSharedDocument(workId, controller.signal), getStudioTeam(workId, controller.signal)]).then(([policyResult, choicesResult, documentResult, teamResult]) => {
      if (!current() || controller.signal.aborted) return;
      setLoading(false);
      if (policyResult.status === "fulfilled") setPolicy(policyResult.value); else { setPolicy(null); setError(message(policyResult.reason)); }
      if (choicesResult.status === "fulfilled") setChoices(choicesResult.value); else { setChoices([]); setSourceError(message(choicesResult.reason)); }
      if (documentResult.status === "fulfilled") {
        try { setSaved(scopedSavedPages(documentResult.value.document.doc)); } catch (cause) { setSaved([]); setSourceError(message(cause)); }
      } else { setSaved([]); setSourceError(message(documentResult.reason)); }
      if (teamResult.status === "fulfilled") setMembers(teamResult.value.members); else { setMembers([]); setSourceError(message(teamResult.reason)); }
    });
    return () => controller.abort();
  }, [workId, authRevision, attempt, current]);
  useEffect(() => {
    const controller = new AbortController(), choice = choices.find((entry) => entry.key === captureKey);
    setCapture(null); selectPage(""); selectFrame(""); selectLayer(""); selectEntities([]); setChecking(Boolean(choice));
    if (choice) void loadTaskOutputCapturePages(choice, { signal: controller.signal }).then((source) => {
      if (current() && !controller.signal.aborted) { setCapture(source); setChecking(false); }
    }, (cause: unknown) => { if (current() && !controller.signal.aborted) { setSourceError(message(cause)); setChecking(false); } });
    return () => controller.abort();
  }, [captureKey, choices, authRevision, current]);
  const run = async (request: StudioScopedWriteManagementCommand) => {
    if (busyRef.current || !current()) return;
    const parsed = StudioScopedWriteManagementCommandSchema.safeParse(request);
    if (!parsed.success) { setError(bt("작업·실제 원고 범위·배정 기간을 다시 확인하세요.", "Check the task, actual manuscript range and assignment period.")); return; }
    pendingRef.current = parsed.data; setPending(parsed.data);
    if (!saveScopedManagementRecovery(actorId, workId, parsed.data)) setNotice(bt("현재 탭은 요청 ID를 보존합니다. 브라우저 저장소를 사용할 수 없어 새로고침 전 결과를 확인하세요.", "This tab retains the request ID. Browser storage is unavailable; confirm the result before refreshing."));
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await manageStudioScopedWritePolicy(workId, parsed.data);
      if (!current()) return;
      setPolicy(result); pendingRef.current = null; setPending(null); clearScopedManagementRecovery(actorId, workId);
      setNotice(bt("요청 처리를 확인하고 현재 편집 정책을 불러왔습니다.", "Confirmed the request and loaded the current editing policy."));
    } catch (cause) {
      if (!current()) return;
      const rejected = isAppApiError(cause) && cause.status !== null && [400, 401, 403, 404, 409, 422].includes(cause.status);
      if (rejected) { pendingRef.current = null; setPending(null); clearScopedManagementRecovery(actorId, workId); refresh((value) => value + 1); }
      setError(rejected ? message(cause) : bt("응답을 확인하지 못했습니다. 아래에서 같은 요청의 결과를 확인하세요. 새 요청은 결과 확인 뒤 보낼 수 있습니다.", "The response is unknown. Check the same request below before sending another command."));
    } finally { busyRef.current = false; if (current()) setBusy(false); }
  };
  const commit = (command: StudioScopedWriteManagementCommand["command"]) => {
    if (!policy || pendingRef.current || !current()) return;
    void run(scopedManagementRequest(policy.policyVersion, command));
  };
  const tasks = aggregate.tasks.filter((task) => task.projectId === aggregate.projectId && activeTask(task.status));
  const task = tasks.find((task) => task.id === taskId), scopes = task ? scopedManagementScopes(aggregate, task.scope) : [];
  const selectedScope = scopes.find((entry) => entry.key === scopeKey) ?? scopes[0];
  const page = saved.find((entry) => entry.id === pageId), capturedPage = capture?.pages.find((entry) => entry.pageId === pageId);
  const frames = page?.entities.filter((entry) => entry.type === "frame" && capturedPage?.frameIds.includes(entry.id)) ?? [];
  const visibleEntities = [...(page?.groups ?? []), ...(page?.entities ?? []), ...(page?.surfaces ?? [])].filter((entry) => entry.id !== frameId
    && (!layerId || entry.kind === "surface" || entry.id === layerId || entry.groupId === layerId));
  const selectedKeys = new Set(entities);
  const selectedEntities = visibleEntities.filter((entry) => selectedKeys.has(entityKey(entry))).map(({ kind, id }) => ({ kind, id }));
  const matchingEntities = visibleEntities.filter((entry) => `${entry.label} ${entry.kind} ${entry.id}`.toLocaleLowerCase().includes(entityQuery.trim().toLocaleLowerCase()));
  const displayedEntities = matchingEntities.slice(entityOffset, entityOffset + 100);
  const targets = policy?.targets.filter((target) => target.revokedAt === null && target.definition.productionProjectId === aggregate.projectId) ?? [];
  const grantTarget = targets.find((target) => target.definition.id === grantTargetId), grantTask = tasks.find((task) => task.id === grantTaskId);
  const grantTasks = grantTarget ? tasks.filter((task) => scopeContains(task.scope, grantTarget.definition.scope)) : tasks;
  const assignments = aggregate.assignments.filter((assignment) => assignment.projectId === aggregate.projectId && assignment.status === "active"
    && (assignment.endsAt === null || Date.parse(assignment.endsAt) > now)
    && aggregate.parties.some((party) => party.id === assignment.partyId && party.status === "active" && party.accountUserId)
    && aggregate.parties.some((party) => party.id === assignment.partyId && members.some((member) => member.userId === party.accountUserId
      && member.status === "active" && (member.role === "viewer" || member.role === "commenter")))
    && (!grantTarget || scopeContains(assignment.scope, grantTarget.definition.scope)));
  const disabled = busy || pending !== null || !policy?.canManage;
  const resetIds = () => { selectFrame(""); selectLayer(""); selectEntities([]); pageEntities(0); searchEntities(""); };
  const changeAssignment = (id: string, selectedAt: number) => {
    selectAssignment(id);
    const role = assignments.find((entry) => entry.id === id);
    if (role) {
      setStartsAt(scopedDateTimeLocal(new Date(Math.max(Math.floor(selectedAt / 1000) * 1000, Math.ceil(Date.parse(role.startsAt) / 1000) * 1000))));
      setEndsAt(role.endsAt ? scopedDateTimeLocal(new Date(role.endsAt)) : "");
    }
  };
  return <section aria-label={bt("실제 담당 편집 권한 관리", "Actual scoped editing access management")} className="space-y-4">
    <p className="text-sm text-fg-2">{bt("열람·댓글 역할의 팀원에게 실제 페이지·컷·레이어 편집을 별도로 배정합니다. 표지·납품 이미지·공용 설정은 관리자 권한을 유지합니다.", "Assign specific pages, frames and layers to viewers and commenters. Cover, delivery images and shared settings retain manager access.")}</p>
    {loading ? <p role="status">{bt("현재 편집 배정을 확인하고 있습니다.", "Checking current editing assignments.")}</p> : null}
    {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-fg-2">{notice}</p> : null}
    <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={busy} onClick={() => refresh((value) => value + 1)}>{bt("현재 정책·저장 원고 다시 확인", "Refresh policy and saved manuscript")}</button>
    {pending ? <div className="rounded-xl border border-warn/40 bg-warn/10 p-3">
      <p className="text-sm">{bt("결과를 확인할 편집 권한 요청이 남아 있습니다.", "An editing access request still needs confirmation.")}</p>
      <p className="break-all text-xs text-fg-2">{pending.mutationId}</p>
      <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={busy || !policy?.canManage} onClick={() => void run(pending)}>{bt("같은 요청 결과 확인", "Check the same request")}</button>
    </div> : null}
    {policy && !policy.canManage ? <p role="status">{bt("현재 계정은 편집 범위를 관리할 수 없습니다.", "This account cannot manage editing ranges.")}</p> : null}
    {policy?.canManage ? <>
      <form className="space-y-3 rounded-xl border border-line p-3" onSubmit={(event) => {
        event.preventDefault(); if (!task || !page || !capturedPage || !capture || !selectedScope) return;
        commit({ type: "register-target", target: { id: `target-${crypto.randomUUID()}`, productionProjectId: aggregate.projectId,
          taskId: task.id, scope: selectedScope.scope, pageId: page.id, frameId: frameId || null, layerId: layerId || null,
          entities: selectedEntities, source: capture.choice.subject } });
      }}>
        <h3 className="text-sm font-bold">{bt("1. 실제 원고의 담당 범위 등록", "1. Register an actual manuscript range")}</h3>
        {sourceError ? <p role="alert" className="text-sm text-bad">{sourceError}</p> : null}
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{bt("등록 근거 작업", "Registration task")}<select required className={FIELD} value={taskId} onChange={(event) => { selectTask(event.target.value); selectScope(""); }}>
            <option value="">{bt("작업 선택", "Select task")}</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select></label>
          <label className="text-sm">{bt("제작 범위", "Production scope")}<select className={FIELD} value={selectedScope?.key ?? ""} onChange={(event) => selectScope(event.target.value)}>
            {scopes.map((scope) => <option key={scope.key} value={scope.key}>{scope.label}</option>)}
          </select></label>
          <label className="text-sm sm:col-span-2">{bt("저장된 검수 원고", "Saved review manuscript")}<select required className={FIELD} value={captureKey} onChange={(event) => selectCapture(event.target.value)}>
            <option value="">{bt("고정 검수 원고 선택", "Select a pinned manuscript")}</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select></label>
          <label className="text-sm">{bt("실제 페이지", "Actual page")}<select required className={FIELD} value={pageId} onChange={(event) => { selectPage(event.target.value); resetIds(); }}>
            <option value="">{bt("페이지 선택", "Select page")}</option>{capture?.pages.filter((page) => saved.some((entry) => entry.id === page.pageId)).map((page) => <option key={page.pageId} value={page.pageId}>{page.ordinal + 1} · {page.pageId}</option>)}
          </select></label>
          <label className="text-sm">{bt("실제 컷 프레임", "Actual frame")}<select className={FIELD} value={frameId} onChange={(event) => { selectFrame(event.target.value); selectEntities([]); pageEntities(0); }}>
            <option value="">{bt("페이지 범위", "Page range")}</option>{frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.label} · {frame.id}</option>)}
          </select></label>
          <label className="text-sm sm:col-span-2">{bt("실제 레이어 그룹", "Actual layer group")}<select className={FIELD} value={layerId} onChange={(event) => { selectLayer(event.target.value); selectEntities([]); pageEntities(0); }}>
            <option value="">{bt("선택한 페이지·컷의 개별 요소", "Individual elements in the selected page or frame")}</option>{page?.groups.map((group) => <option key={group.id} value={group.id}>{group.label} · {group.id}</option>)}
          </select></label>
        </fieldset>
        {checking ? <p role="status">{bt("고정 원고와 실제 페이지 연결을 확인하고 있습니다.", "Checking pinned manuscript and actual pages.")}</p> : null}
        <fieldset disabled={disabled || !page} className="max-h-72 space-y-1 overflow-auto rounded-lg border border-line p-2">
          <legend className="px-1 text-sm font-semibold">{bt("담당할 기존 레이어·요소", "Existing layers and elements to assign")}</legend>
          <label className="block text-sm">{bt("레이어·요소 이름 또는 실제 ID 찾기", "Find a layer or element by name or actual ID")}<input className={FIELD} type="search" value={entityQuery} onChange={(event) => { searchEntities(event.target.value); pageEntities(0); }} /></label>
          <p className="text-xs text-fg-2">{bt(`${selectedEntities.length}개 선택 · 검색 결과 ${matchingEntities.length}개`, `${selectedEntities.length} selected · ${matchingEntities.length} results`)}</p>
          {displayedEntities.map((entity) => <label key={entityKey(entity)} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedKeys.has(entityKey(entity))} disabled={entity.kind === "surface" && entity.consumerKeys?.some((key) => !selectedKeys.has(key))} onChange={(event) => {
              const selected = new Set(entities), keys = entity.kind === "group" ? [entityKey(entity), ...(page?.entities.filter((child) => child.groupId === entity.id).map(entityKey) ?? [])] : [entityKey(entity)];
              for (const key of keys) if (event.target.checked) selected.add(key); else selected.delete(key);
              for (const surface of page?.surfaces ?? []) if (surface.consumerKeys?.some((key) => !selected.has(key))) selected.delete(entityKey(surface));
              selectEntities([...selected]);
            }} />{entity.label}<span className="break-all text-xs text-fg-2">{entity.kind} · {entity.id}</span>
          </label>)}
          {matchingEntities.length > 100 ? <div className="flex gap-2">
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={entityOffset === 0} onClick={() => pageEntities((value) => Math.max(0, value - 100))}>{bt("이전 요소", "Previous elements")}</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={entityOffset + 100 >= matchingEntities.length} onClick={() => pageEntities((value) => value + 100)}>{bt("다음 요소", "Next elements")}</button>
          </div> : null}
          {!visibleEntities.length ? <p className="text-sm text-fg-2">{bt("페이지와 레이어를 선택하세요. 빈 범위도 새 원고 작업에 배정할 수 있습니다.", "Select a page and layer. Empty ranges can be assigned for new artwork.")}</p> : null}
        </fieldset>
        {capturedPage ? <img className="max-h-64 w-full rounded-lg border border-line object-contain" src={capturedPage.url} alt={bt("담당 범위를 확인할 전체 페이지 검수 이미지", "Full-page review image for checking the assigned range")} loading="lazy" /> : null}
        <p className="text-xs text-fg-2">{bt("제작 컷 번호와 실제 프레임 ID를 각각 선택합니다. 등록 시 선택한 검수본과 현재 저장 원고의 실제 ID·편집 경계를 함께 확인합니다.", "Select the production cut and actual frame separately. Registration checks IDs and editing boundaries in both the pinned and saved manuscripts.")}</p>
        <button type="submit" className={buttonClass({ size: "sm" })} disabled={disabled || !task || !page || !capture || checking || (selectedScope?.scope.kind === "cut" && !frameId)}>{bt("담당 원고 범위 등록", "Register manuscript range")}</button>
      </form>
      <form className="space-y-3 rounded-xl border border-line p-3" onSubmit={(event) => {
        event.preventDefault(); if (!grantTarget || !grantTask || !assignmentId) return;
        const start = new Date(startsAt), end = endsAt ? new Date(endsAt) : null;
        if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end <= start))) { setError(bt("유효한 시작·종료 시간을 선택하세요.", "Select a valid start and end time.")); return; }
        commit({ type: "grant", id: `grant-${crypto.randomUUID()}`, productionProjectId: aggregate.projectId, taskId: grantTask.id,
          assignmentId, targetIds: [grantTarget.definition.id], startsAt: start.toISOString(), endsAt: end?.toISOString() ?? null });
      }}>
        <h3 className="text-sm font-bold">{bt("2. 현재 공정의 실제 담당자에게 편집 배정", "2. Assign editing to the current process owner")}</h3>
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">{bt("등록 원고 범위", "Registered manuscript range")}<select required className={FIELD} value={grantTargetId} onChange={(event) => { selectGrantTarget(event.target.value); selectAssignment(""); selectGrantTask(""); }}>
            <option value="">{bt("범위 선택", "Select range")}</option>{targets.map((target) => <option key={target.definition.id} value={target.definition.id}>{target.definition.pageId} · {target.definition.frameId ?? target.definition.layerId ?? bt("페이지 전체", "Whole page")} · {target.definition.id}</option>)}
          </select></label>
          <label className="text-sm">{bt("현재 공정 작업", "Current process task")}<select required className={FIELD} value={grantTaskId} onChange={(event) => selectGrantTask(event.target.value)}>
            <option value="">{bt("작업 선택", "Select task")}</option>{grantTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select></label>
          <ScopedAssignmentSelect label={bt("실제 계정의 역할 배정", "Role assigned to an actual account")}
            placeholder={bt("담당자 선택", "Select assignee")} value={assignmentId} onSelect={changeAssignment}
            options={assignments.map((assignment) => { const party = aggregate.parties.find((entry) => entry.id === assignment.partyId);
              return { id: assignment.id, label: `${party?.publicDisplayName ?? ""} · ${assignment.roleType} · ${party?.accountUserId ?? ""}` }; })} />
          <label className="text-sm">{bt("편집 시작", "Editing starts")}<input required type="datetime-local" step="1" className={FIELD} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label className="text-sm">{bt("편집 종료 (선택)", "Editing ends (optional)")}<input type="datetime-local" step="1" className={FIELD} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        </fieldset>
        <p className="text-xs text-fg-2">{bt("현재 작품의 활성 열람·댓글 계정에만 배정할 수 있습니다. 기존 원고 귀속을 유지하며 다음 공정은 새 작업·역할 배정으로 연결합니다.", "Only active viewers and commenters can receive these grants. Artwork ownership stays stable; each next process uses a new task and role grant.")}</p>
        <button type="submit" className={buttonClass({ size: "sm" })} disabled={disabled || !grantTarget || !grantTask || !assignmentId}>{bt("담당 편집 배정", "Assign scoped editing")}</button>
      </form>
      <div className="space-y-2"><h3 className="text-sm font-bold">{bt("현재 배정과 회수", "Assignments and revocation")}</h3>
        {policy.grants.filter((grant) => grant.productionProjectId === aggregate.projectId).map((grant) => <div key={grant.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm">
          <span className="min-w-0 flex-1 break-all">{aggregate.tasks.find((task) => task.id === grant.taskId)?.title ?? grant.taskId} · {aggregate.parties.find((party) => party.accountUserId === grant.actorUserId)?.publicDisplayName ?? grant.actorUserId}
            <span className="block text-xs text-fg-2">{grant.startsAt} — {grant.endsAt ?? bt("역할 배정 기간까지", "Until role expiry")} · {grant.revokedAt ? bt("회수됨", "Revoked") : bt("기간과 현재 역할에 따라 적용", "Subject to current role and period")}</span></span>
          {!grant.revokedAt ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={disabled} onClick={() => commit({ type: "revoke-grant", grantId: grant.id })}>{bt("편집 배정 회수", "Revoke editing grant")}</button> : null}
        </div>)}
        {targets.map((target) => <div key={target.definition.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm">
          <span className="min-w-0 flex-1 break-all">{target.definition.pageId} · {target.definition.frameId ?? target.definition.layerId ?? bt("페이지 전체", "Whole page")}<span className="block text-xs text-fg-2">{target.definition.id}</span></span>
          <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={disabled} onClick={() => commit({ type: "revoke-target", targetId: target.definition.id })}>{bt("원고 범위 회수", "Revoke manuscript range")}</button>
        </div>)}
      </div>
    </> : null}
  </section>;
}
