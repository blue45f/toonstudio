import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  PRODUCTION_ROLE_TYPES,
  evaluateRoleAssignmentPermissionGuardrails,
  productionRolePermissionProfile,
  type ProductionProjectAggregate,
  type RoleAssignment,
} from "@toonstudio/core/production";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioTeam, type StudioTeamSnapshot } from "../studio-team-client";
import { ProductionCommandRevisionChangedError, type ProductionCommandExecutor } from "./production-command-execution";
import { loadProductionCommandRecovery } from "./production-command-recovery";
import { assignmentStatusLabel, projectAccessRoleLabel, roleTypeLabel } from "./production-labels";
import { taskOutputRejectionDisposition } from "./production-task-output-rejection";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import {
  buildProductionRoleSetupRequest, ProductionRoleSetupError, productionRoleSetupConfirmed,
  productionRoleSetupDraft, productionRoleSetupScopes, productionRoleSetupSelectMember, productionRoleSetupSelectParty,
  type ProductionRoleSetupDraft, type ProductionRoleSetupRequest,
} from "./production-collaboration-role-model";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canManage: boolean;
  /** useProductionProjectSession.executeStrict를 전달한다. */
  readonly execute: ProductionCommandExecutor;
  readonly refresh?: () => Promise<void>;
  readonly hasUnconfirmedCommand?: boolean;
}
type ScopedProps = Props & { readonly actorId: string; readonly authRevision: number };
const FIELD = "mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-base text-fg sm:text-sm";
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const PARTY_STATUSES = ["invited", "active", "paused", "ended"] as const;
const ROLE_STATUSES = ["invited", "onboarding", "active", "paused", "ending", "ended"] as const;

export function ProductionCollaborationRoleEditor(props: Props) {
  const authRevision = useSyncExternalStore(subscribe, getAuthSessionRevision, () => 0);
  const actorId = getAuthUserId();
  if (!props.canManage || !actorId) return null;
  return <RoleEditorScope key={JSON.stringify([props.aggregate.projectId, props.aggregate.workId, actorId, authRevision])}
    {...props} actorId={actorId} authRevision={authRevision} />;
}

function RoleEditorScope(props: ScopedProps) {
  const { aggregate, actorId, authRevision, canManage, refresh } = props;
  const bt = useBilingual("ProductionCollaborationRoleEditor");
  const [team, setTeam] = useState<StudioTeamSnapshot | null>(null), [loading, setLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [recovering, setRecovering] = useState(false);
  const [formTeam, setFormTeam] = useState<StudioTeamSnapshot | null>(null), [formOriginal, setFormOriginal] = useState<RoleAssignment | null>(null);
  const [recovery, setRecovery] = useState(() => loadProductionCommandRecovery(actorId, aggregate.projectId));
  const mounted = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const permission = useRef(canManage), checking = useRef(false);
  const memoryPending = useRef(props.hasUnconfirmedCommand === true);
  useLayoutEffect(() => { permission.current = canManage; }, [canManage]);
  useLayoutEffect(() => { memoryPending.current = props.hasUnconfirmedCommand === true; }, [props.hasUnconfirmedCommand]);
  useLayoutEffect(() => {
    // StrictMode 재설정도 이전 요청을 새 활성 수명으로 넘기지 않는다.
    ++generation.current; mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const current = useCallback(() => mounted.current && permission.current && getAuthUserId() === actorId
    && getAuthSessionRevision() === authRevision, [actorId, authRevision]);
  const loadTeam = useCallback(async (): Promise<StudioTeamSnapshot | null> => {
    if (!current()) return null;
    const own = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; abort.abort(); }, 15_000);
    setLoading(true); setRosterError(null);
    try {
      const value = await getStudioTeam(aggregate.workId, abort.signal);
      if (!current() || own !== generation.current || abort.signal.aborted) return null;
      if (value.workId !== aggregate.workId || value.viewer.userId !== actorId || value.viewer.status !== "active"
        || !value.viewer.capabilities.manageMembers || !["owner", "admin"].includes(value.viewer.role)) {
        throw new Error("현재 작품의 계정과 관리 권한을 확인하지 못했습니다.");
      }
      setTeam(value); return value;
    } catch {
      if (current() && own === generation.current && (timedOut || !abort.signal.aborted)) {
        setTeam(null); setRosterError(bt("현재 작품의 활성 팀 계정과 관리 권한을 확인하지 못했습니다. 작품 팀을 다시 확인해 주세요.", "Could not verify active accounts and management access for this work. Refresh the work team."));
      }
      return null;
    } finally { window.clearTimeout(timeout); if (current() && own === generation.current) setLoading(false); }
  }, [aggregate.workId, actorId, current, bt]);
  useEffect(() => { void loadTeam(); return () => { controller.current?.abort(); }; }, [loadTeam]);
  const open = (id: string) => {
    if (!current() || !team || loading || memoryPending.current) return;
    const pending = loadProductionCommandRecovery(actorId, aggregate.projectId);
    if (pending) { setRecovery(pending); setNotice(null); return; }
    const assignment = id === "new" ? null : aggregate.assignments.find((entry) => entry.id === id);
    if (id !== "new" && !assignment) return;
    setFormTeam(team); setFormOriginal(assignment ? structuredClone(assignment) : null); setSelected(id); setNotice(null);
  };
  const close = () => {
    if (!current()) return;
    setSelected(null); setRecovery(loadProductionCommandRecovery(actorId, aggregate.projectId));
  };
  const recover = async () => {
    if (!current() || checking.current || !refresh) return;
    checking.current = true; setRecovering(true); setNotice(null);
    try {
      // 원문 재전송·영수증 확인은 같은 session queue의 refresh가 소유한다.
      await refresh(); if (!current()) return;
      const pending = loadProductionCommandRecovery(actorId, aggregate.projectId);
      setRecovery(pending);
      setNotice(pending || memoryPending.current ? bt("원래 요청의 저장 결과를 아직 확인하지 못했습니다. 새 역할 요청은 보내지 않습니다.", "The original save is still unconfirmed. No new role request will be sent.")
        : bt("원래 요청의 저장 상태를 확인했습니다. 현재 역할 목록을 확인해 주세요.", "The original request was reconciled. Check the current role list."));
      await loadTeam();
    } catch { if (current()) setNotice(bt("원래 요청의 저장 상태를 확인하지 못했습니다. 입력과 복구 기록을 유지합니다.", "Could not reconcile the original request. Its input and recovery record are kept.")); }
    finally { checking.current = false; if (current()) setRecovering(false); }
  };
  const scopes = new Map(productionRoleSetupScopes(aggregate).map((entry) => [entry.key, entry.label]));
  return <section className="space-y-4" aria-label={bt("참여 계정·공정 역할 관리", "Account-linked production roles")}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{bt("참여 계정과 공정 역할", "Accounts and production roles")}</h2>
      <p className="mt-1 text-sm leading-6 text-fg-2">{bt("작품 팀의 실제 계정을 제작 참여자와 연결하고 담당 범위·기간을 정합니다. 원고 편집 권한과 결정권은 각 설정에서 따로 관리합니다.", "Link actual work-team accounts to production parties and set their scope and period. Manuscript access and decision authority have separate settings.")}</p></div>
      <button type="button" disabled={!team || loading || Boolean(recovery) || props.hasUnconfirmedCommand || recovering} className={buttonClass({ variant: "outline" })} onClick={() => open("new")}>{bt("공정 역할 추가", "Add production role")}</button></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={loading || recovering} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void loadTeam()}>{bt("작품 팀 다시 확인", "Refresh work team")}</button>
      {loading ? <p role="status" className="text-sm">{bt("실제 작품 팀 계정을 확인하고 있습니다.", "Checking actual work-team accounts.")}</p> : null}
      {team ? <p className="text-xs text-fg-2">{bt(`현재 작품 팀 활성 계정 ${team.members.filter((member) => member.status === "active").length}명`, `${team.members.filter((member) => member.status === "active").length} active work-team accounts`)}</p> : null}</div>
    {rosterError ? <p role="alert" className="text-sm text-bad">{rosterError}</p> : null}
    {recovery || props.hasUnconfirmedCommand ? <div className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-3"><p role="status" className="text-sm">{bt("응답을 확인하지 못한 이전 저장이 있습니다. 같은 세션의 원래 요청을 복구한 뒤 새 역할을 저장할 수 있습니다.", "A previous save is unconfirmed. Reconcile its original request in this session before saving another role.")}</p>
      <button type="button" disabled={!refresh || recovering} className={buttonClass({ variant: "outline" })} onClick={() => void recover()}>{bt("원래 저장 상태 확인", "Reconcile original save")}</button></div> : null}
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    {aggregate.assignments.length === 0 ? <p className="text-sm text-fg-2">{bt("아직 공정 역할이 없습니다. 작품 팀 계정을 확인한 뒤 첫 역할을 추가하세요.", "No production roles yet. Verify work-team accounts and add the first role.")}</p> : null}
    <ul className="space-y-2">{aggregate.assignments.map((assignment) => {
      const party = aggregate.parties.find((entry) => entry.id === assignment.partyId);
      const member = team?.members.find((entry) => entry.userId === party?.accountUserId && entry.status === "active");
      const name = party?.publicDisplayName || bt("참여자 확인 필요", "Party needs verification");
      const guardrail = evaluateRoleAssignmentPermissionGuardrails(assignment);
      return <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3"><div className="min-w-0"><p className="font-semibold">{name} · {roleTypeLabel(assignment.roleType, bt)}</p>
        <p className="mt-1 text-xs text-fg-2">{scopes.get(canonicalJson(assignment.scope)) ?? assignment.scope.id} · {assignmentStatusLabel(assignment.status, bt)} · {party?.accountUserId ? member ? bt("작품 팀 계정 연결", "Linked active account") : bt("연결 계정이 현재 작품 팀에 없음", "Linked account is outside this work team") : bt("계정 미연결", "No linked account")}</p>
        <p className="mt-1 text-[0.7rem] text-fg-3">{bt(`허용 레이어 그룹: ${guardrail.profile.allowedLayerGroups.join(", ")} · 설정집 권한: ${guardrail.profile.canonWriteAccess}`, `Allowed layers: ${guardrail.profile.allowedLayerGroups.join(", ")} · Canon access: ${guardrail.profile.canonWriteAccess}`)}</p>
        {guardrail.warnings.length > 0 ? <p className="mt-1 text-xs font-semibold text-warn">{guardrail.warnings[0]}</p> : null}</div>
        <button type="button" disabled={!party || !team || loading || Boolean(recovery) || props.hasUnconfirmedCommand || recovering} className={buttonClass({ variant: "outline", size: "sm" })} aria-label={bt(`${name} ${roleTypeLabel(assignment.roleType, bt)} 역할 편집`, `Edit ${name} ${roleTypeLabel(assignment.roleType, bt)} role`)} onClick={() => open(assignment.id)}>{bt("역할 편집", "Edit role")}</button></li>;
    })}</ul>
    {selected && formTeam && (selected === "new" || formOriginal) ? <RoleForm key={selected} {...props} original={formOriginal} team={team ?? formTeam} loadTeam={loadTeam} current={current} onClose={close} /> : null}
  </section>;
}

function RoleForm({ aggregate, canManage, execute, refresh, hasUnconfirmedCommand, original, team, loadTeam, current, onClose, actorId }: ScopedProps & {
  readonly original: RoleAssignment | null; readonly team: StudioTeamSnapshot;
  readonly loadTeam: () => Promise<StudioTeamSnapshot | null>; readonly current: () => boolean; readonly onClose: () => void;
}) {
  const bt = useBilingual("ProductionCollaborationRoleEditor.form");
  const [draft, setDraft] = useState<ProductionRoleSetupDraft | null>(() => {
    try {
      const initial = productionRoleSetupDraft(aggregate, original, team.members, new Date().toISOString());
      return original ? initial : { ...productionRoleSetupSelectMember(aggregate, initial, ""), scopeKey: "" };
    } catch { return null; }
  });
  const [ids] = useState(() => ({ party: `production-party:${crypto.randomUUID()}`, assignment: `production-role:${crypto.randomUUID()}` }));
  const [busy, setBusy] = useState(false), [sealed, setSealed] = useState(false), [denied, setDenied] = useState(false), [error, setError] = useState<string | null>(null);
  const initialDraft = useRef(draft), originalSnapshot = useRef(original ? structuredClone(original) : null);
  const request = useRef<ProductionRoleSetupRequest | null>(null), saving = useRef(false), latest = useRef(aggregate), mounted = useRef(true);
  const pendingElsewhere = useRef(hasUnconfirmedCommand === true);
  useLayoutEffect(() => { latest.current = aggregate; }, [aggregate]);
  useLayoutEffect(() => { pendingElsewhere.current = hasUnconfirmedCommand === true; }, [hasUnconfirmedCommand]);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const live = () => mounted.current && current();
  const confirmed = Boolean(request.current && productionRoleSetupConfirmed(aggregate, request.current));
  useEffect(() => { if (sealed && !busy && confirmed && current()) onClose(); }, [sealed, busy, confirmed, current, onClose]);
  const modelError = (cause: unknown) => {
    if (!(cause instanceof ProductionRoleSetupError)) return bt("역할 입력을 확인하지 못했습니다. 현재 프로젝트와 팀을 다시 확인해 주세요.", "Could not verify role input. Refresh the project and work team.");
    const messages = {
      member: bt("현재 작품 팀의 활성 계정을 선택하세요. 계정이 없는 기존 역할은 중지·종료할 수 있습니다.", "Choose an active work-team account. An existing role without an account can be paused or ended."),
      party: bt("이미 연결된 계정이나 기존 역할의 참여자는 바꿀 수 없습니다. 미연결 참여자를 명시적으로 선택해 연결하세요.", "A linked account or the party of an existing role cannot be replaced. Explicitly select an unlinked party to connect it."),
      role: bt("참여자 상태와 역할·역할 상태를 확인하세요.", "Check the party status, role and assignment status."),
      scope: bt("현재 프로젝트에 실제로 존재하는 담당 범위를 선택하세요.", "Choose an actual scope in the current project."),
      period: bt("유효한 시작 시각과 그 이후의 종료 시각을 입력하세요. 종료가 미정이면 비워 두세요.", "Enter a valid start and a later end, or leave the end empty when open-ended."),
      identity: bt("참여자 또는 역할 식별자가 충돌했습니다. 현재 목록을 확인하고 편집창을 다시 열어 주세요.", "A party or role ID conflicts. Inspect the current list and reopen the editor."),
      stale: bt("선택한 참여자·역할이 다른 변경으로 달라졌습니다. 입력을 유지했으며 현재 목록 확인 후 편집창을 다시 열어 주세요.", "The selected party or role changed elsewhere. Your draft is kept; inspect the current list and reopen the editor."),
      graph: bt("기존 결정권과 역할 연결을 함께 검증하지 못했습니다. 현재 목록을 다시 확인하세요.", "Could not validate existing authority and role links. Refresh the current list."),
    };
    return messages[cause.code];
  };
  const patch = (value: Partial<ProductionRoleSetupDraft>) => { if (!sealed && !busy && !denied && !hasUnconfirmedCommand) { setDraft((old) => old ? { ...old, ...value } : old); setError(null); } };
  const chooseMember = (uid: string) => { if (!draft || sealed || busy || denied || hasUnconfirmedCommand) return; try { setDraft(productionRoleSetupSelectMember(latest.current, draft, uid)); setError(null); } catch (cause) { setError(modelError(cause)); } };
  const chooseParty = (id: string) => { if (!draft || sealed || busy || denied || hasUnconfirmedCommand) return; try { setDraft(productionRoleSetupSelectParty(latest.current, draft, id || null)); setError(null); } catch (cause) { setError(modelError(cause)); } };
  const check = async () => {
    if (!live() || saving.current || !refresh) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await refresh(); if (!live()) return;
      if (sealed) {
        if (!request.current || !productionRoleSetupConfirmed(latest.current, request.current)) setError(bt("원래 역할 저장을 아직 확인하지 못했습니다. 원래 입력과 식별자를 유지하며 상태만 다시 확인할 수 있습니다.", "The original role save remains unconfirmed. Its input and IDs stay fixed while you recheck its status."));
      } else {
        const currentTeam = await loadTeam(); if (live() && currentTeam) setDenied(false);
      }
    } catch { if (live()) setError(bt("저장 상태를 확인하지 못했습니다. 원래 입력과 복구 기록을 유지합니다.", "Could not check the save. Original input and recovery records are kept.")); }
    finally { saving.current = false; if (live()) setBusy(false); }
  };
  const save = async () => {
    if (!live() || !canManage || !draft || saving.current || sealed || denied || pendingElsewhere.current) return;
    saving.current = true; setBusy(true); setError(null); let dispatched = false;
    try {
      const freshTeam = await loadTeam(); if (!live() || pendingElsewhere.current) return;
      if (!freshTeam) { setError(bt("저장 전에 현재 작품 팀 계정을 확인하지 못했습니다. 입력은 유지됩니다.", "Could not verify work-team accounts before saving. Your draft is kept.")); return; }
      const built = buildProductionRoleSetupRequest({ aggregate: latest.current, draft, members: freshTeam.members,
        original: originalSnapshot.current, newPartyId: ids.party, newAssignmentId: ids.assignment });
      if (!live() || pendingElsewhere.current) return;
      request.current = built; setSealed(true); dispatched = true;
      await execute(built.command, bt("참여 계정과 공정 역할을 저장했습니다.", "Account-linked production role saved."), { expectedRevision: built.baselineRevision });
      if (live() && !productionRoleSetupConfirmed(latest.current, built)) setError(bt("저장 응답을 받았습니다. 최신 역할 목록에서 원래 입력을 확인한 뒤 완료합니다.", "The save response arrived. Completion waits for the original input in the latest role list."));
    } catch (cause) {
      if (!live()) return;
      if (!dispatched) { setError(modelError(cause)); return; }
      if (cause instanceof ProductionCommandRevisionChangedError) {
        request.current = null; setSealed(false); setDenied(false);
        setError(bt("저장 요청을 보내기 전에 프로젝트 버전이 바뀌었습니다. 입력은 유지했으며 최신 내용을 검토한 뒤 다시 저장하세요.", "The project revision changed before this request was sent. Your draft is kept; review the latest state before explicitly saving again."));
        return;
      }
      const disposition = taskOutputRejectionDisposition(cause, actorId, aggregate.projectId);
      if (disposition !== "sealed") { request.current = null; setSealed(false); }
      setDenied(disposition === "permission-denied");
      setError(disposition === "permission-denied" ? bt("서버가 현재 관리 권한으로 역할 저장을 허용하지 않았습니다. 최신 권한과 작품 팀을 다시 확인하세요.", "The server denied role management. Refresh current access and the work team.")
        : disposition === "editable" ? bt("서버가 입력 또는 현재 버전과의 충돌을 확인했습니다. 입력을 유지했으며 최신 상태 확인 후 다시 검토할 수 있습니다.", "The server rejected input or detected a revision conflict. Your draft is kept for review after refreshing.")
        : bt("저장 응답을 확인하지 못했습니다. 원래 요청을 고정했으며 상태 확인만 할 수 있습니다.", "The save could not be confirmed. The original request is fixed; only reconciliation is available."));
    } finally { saving.current = false; if (live()) setBusy(false); }
  };
  const party = draft ? aggregate.parties.find((entry) => entry.id === draft.partyId) : null;
  const fixedAccount = Boolean(original && initialDraft.current?.partyBaseline?.accountUserId);
  const members = team.members.filter((member) => member.status === "active" && (!fixedAccount || member.userId === draft?.memberId));
  const hasSelectedMember = members.some((member) => member.userId === draft?.memberId);
  const availableParties = aggregate.parties.filter((entry) => original ? entry.id === original.partyId : entry.accountUserId === null || entry.accountUserId === draft?.memberId);
  const scopes = productionRoleSetupScopes(aggregate);
  return <ProductionWorkspaceDialog title={bt(original ? "공정 역할 편집" : "공정 역할 추가", original ? "Edit production role" : "Add production role")}
    description={bt("계정·참여자·역할·담당 범위와 기간을 명시합니다. 기존 역할 이력과 계약·크레딧·결정권은 보존합니다.", "Specify the account, party, role, scope and period. Role history, agreements, credits and authority are preserved.")}
    onClose={onClose} busy={busy} dirty={sealed || canonicalJson(draft) !== canonicalJson(initialDraft.current)}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {hasUnconfirmedCommand && !sealed ? <p role="status" className="text-sm text-fg-2">{bt("같은 프로젝트의 이전 요청이 아직 미확인입니다. 이 입력은 유지하며 최신 상태 확인으로 원래 요청부터 복구하세요.", "An earlier request for this project is unconfirmed. This draft is kept; refresh to reconcile the original request first.")}</p> : null}
      {!draft ? <p role="alert">{bt("현재 역할의 입력 기준을 확인하지 못했습니다. 목록을 새로 확인한 뒤 편집창을 다시 열어 주세요.", "Could not verify the role baseline. Refresh the list and reopen the editor.")}</p> : <fieldset disabled={busy || sealed || denied || hasUnconfirmedCommand || !canManage} className="space-y-4">
        <label className="block text-sm font-semibold">{bt("연결할 작품 팀 계정", "Work-team account")}<select className={FIELD} value={draft.memberId} disabled={fixedAccount} required={!original} onChange={(event) => chooseMember(event.target.value)}>
          <option value="">{bt(original ? "계정 미연결 · 기존 역할 중지·종료 가능" : "활성 작품 팀 계정 선택", original ? "Unlinked · existing role may be paused or ended" : "Choose an active work-team account")}</option>
          {!hasSelectedMember && draft.memberId ? <option value={draft.memberId}>{bt("기존 연결 계정 · 현재 작품 팀에 없음", "Existing linked account · outside current work team")}</option> : null}
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.name === member.userId ? bt(`이름 미등록 계정 ${member.userId.slice(-6)}`, `Unnamed account ${member.userId.slice(-6)}`) : member.name} · {projectAccessRoleLabel(member.role, bt)}</option>)}
        </select></label>
        <label className="block text-sm font-semibold">{bt("제작 참여자", "Production party")}<select className={FIELD} value={draft.partyId ?? ""} disabled={Boolean(original) || !draft.memberId} onChange={(event) => chooseParty(event.target.value)}>
          {!original ? <option value="">{bt("선택 계정으로 새 참여자 만들기", "Create a party for the selected account")}</option> : null}
          {availableParties.map((entry) => <option key={entry.id} value={entry.id}>{entry.publicDisplayName} · {entry.accountUserId === null ? bt("미연결 참여자", "Unlinked party") : bt("같은 계정 연결", "Same linked account")}</option>)}
        </select></label>
        {fixedAccount ? <p className="text-xs text-fg-2">{bt("이 역할의 연결 계정과 참여자는 바꿀 수 없습니다. 작품 팀에서 나간 계정의 역할도 중지·종료할 수 있습니다.", "This role's account and party cannot be replaced. Roles held by departed accounts may still be paused or ended.")}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">{bt("공정 역할", "Production role")}<select className={FIELD} value={draft.roleType} onChange={(event) => { const role = PRODUCTION_ROLE_TYPES.find((entry) => entry === event.target.value); if (role) patch({ roleType: role }); }}>{PRODUCTION_ROLE_TYPES.map((role) => <option key={role} value={role}>{roleTypeLabel(role, bt)}</option>)}</select></label>
          <label className="block text-sm font-semibold">{bt("실제 담당 범위", "Actual assignment scope")}<select className={FIELD} required value={draft.scopeKey} onChange={(event) => patch({ scopeKey: event.target.value })}><option value="">{bt("현재 프로젝트의 범위 선택", "Choose a scope in this project")}</option>{scopes.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label></div>
        {(() => {
          const roleProfile = productionRolePermissionProfile(draft.roleType);
          const selectedScopeEntry = scopes.find((entry) => entry.key === draft.scopeKey);
          const recommendedScopeEntry =
            scopes.find((entry) => entry.scope.kind === roleProfile.recommendedScopeKind)
            ?? scopes.find((entry) => entry.scope.kind === "episode")
            ?? scopes[0];
          const draftGuardrail = selectedScopeEntry
            ? evaluateRoleAssignmentPermissionGuardrails({
                roleType: draft.roleType,
                scope: selectedScopeEntry.scope,
                capabilities: original?.capabilities ?? roleProfile.defaultCapabilities,
                lead: draft.lead,
              })
            : null;
          return (
            <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft/20 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-fg">
                  {bt(
                    `${roleTypeLabel(draft.roleType, bt)} 최소권한·레이어 보호 기준`,
                    `${roleTypeLabel(draft.roleType, bt)} least-privilege & layer policy`,
                  )}
                </p>
                {recommendedScopeEntry ? (
                  <button
                    type="button"
                    className={buttonClass({ variant: "outline", size: "sm" })}
                    onClick={() =>
                      patch({
                        scopeKey: recommendedScopeEntry.key,
                        lead: roleProfile.category === "lead",
                      })
                    }
                  >
                    {bt("직군 최소권한 프리셋 적용", "Apply least-privilege preset")}
                  </button>
                ) : null}
              </div>
              <p className="leading-5 text-fg-2">{roleProfile.summaryKo}</p>
              <p className="text-[0.7rem] text-fg-3">
                {bt(
                  `권장 범위: ${roleProfile.recommendedScopeKind} · 허용 레이어 그룹: ${roleProfile.allowedLayerGroups.join(", ")} · 설정집 접근: ${roleProfile.canonWriteAccess}`,
                  `Recommended scope: ${roleProfile.recommendedScopeKind} · Allowed layers: ${roleProfile.allowedLayerGroups.join(", ")} · Canon: ${roleProfile.canonWriteAccess}`,
                )}
              </p>
              {draftGuardrail && draftGuardrail.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 p-2 text-warn">
                  {draftGuardrail.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })()}
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">{bt("역할 시작 · 내 시간대", "Role start · local time")}<input className={FIELD} type="datetime-local" required value={draft.startsAtLocal} onChange={(event) => patch({ startsAtLocal: event.target.value })} /></label>
          <label className="block text-sm font-semibold">{bt("역할 종료 · 내 시간대", "Role end · local time")}<input className={FIELD} type="datetime-local" value={draft.endsAtLocal} onChange={(event) => patch({ endsAtLocal: event.target.value })} /><span className="mt-1 block text-xs font-normal text-fg-2">{bt("비워 두면 종료일 미정", "Leave empty for an open-ended role")}</span></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">{bt("참여자 상태", "Party status")}<select className={FIELD} value={draft.partyStatus} onChange={(event) => { const status = PARTY_STATUSES.find((entry) => entry === event.target.value); if (status) patch({ partyStatus: status }); }}>{PARTY_STATUSES.map((status) => <option key={status} value={status}>{assignmentStatusLabel(status, bt)}</option>)}</select></label>
          <label className="block text-sm font-semibold">{bt("역할 상태", "Role status")}<select className={FIELD} value={draft.assignmentStatus} onChange={(event) => { const status = ROLE_STATUSES.find((entry) => entry === event.target.value); if (status) patch({ assignmentStatus: status }); }}>{ROLE_STATUSES.map((status) => <option key={status} value={status}>{assignmentStatusLabel(status, bt)}</option>)}</select></label></div>
        {party ? <p className="text-xs text-fg-2">{bt("참여자 상태는 같은 참여자의 다른 역할에도 적용됩니다. 역할 하나만 멈추려면 역할 상태를 바꾸세요.", "Party status affects that party's other roles too. Change role status to pause just this assignment.")}</p> : null}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.lead} onChange={(event) => patch({ lead: event.target.checked })} />{bt("이 담당 범위의 리드 역할", "Lead role for this scope")}</label>
        <p className="text-xs leading-6 text-fg-2">{original ? bt(`기존 capabilities ${original.capabilities.length}개, 계약 연결과 공개 크레딧을 유지합니다.`, `Preserves ${original.capabilities.length} existing capabilities, the agreement link and public credit.`) : bt("새 역할의 capabilities는 빈 배열로 저장합니다. 리드 표시는 원고 편집·승인·최종 결정권을 추가하지 않습니다.", "New roles have no capabilities. Lead status does not add manuscript editing, approval or final decision authority.")}</p>
      </fieldset>}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={!draft || busy || sealed || denied || hasUnconfirmedCommand || !canManage} className={buttonClass()}>{bt("공정 역할 저장", "Save production role")}</button>
        <button type="button" disabled={busy || !refresh} className={buttonClass({ variant: "outline" })} onClick={() => void check()}>{bt(sealed ? "원래 저장 상태 확인" : "최신 상태 확인", sealed ? "Reconcile original save" : "Refresh current state")}</button></div>
    </form>
  </ProductionWorkspaceDialog>;
}
