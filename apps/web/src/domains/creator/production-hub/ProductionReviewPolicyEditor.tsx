import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { eligibleProductionReviewAssignments, REVIEW_LANES, type ProductionProjectAggregate, type ReviewPolicy, type ReviewPolicyLane } from "@toonstudio/core/production";
import { getAuthSession, getAuthSessionRevision, listeners } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import type { ProductionClientCommand } from "./production-api";
import { reviewLaneLabel, roleTypeLabel } from "./production-labels";
import { buildProductionReviewPolicy, productionReviewPolicyDraft, productionReviewPolicyScopes, productionReviewPolicyVoterCount } from "./production-review-policy-model";
import { taskOutputRejectionDisposition } from "./production-task-output-rejection";
import { useProductionReviewClock } from "./use-production-review-clock";

const FIELD = "mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm";
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
type Props = { readonly aggregate: ProductionProjectAggregate; readonly canManage: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>; readonly refresh?: () => Promise<void> };

/** 제작 정책은 Graph 검수 정책과 구분하며 실제 관리자 명령으로만 저장한다. */
export function ProductionReviewPolicyEditor(props: Props) {
  const bt = useBilingual("ProductionReviewPolicyEditor"), authRevision = useSyncExternalStore(subscribe, getAuthSessionRevision, () => 0);
  const actorId = getAuthSession()?.user.id ?? null, [selected, select] = useState<string | null>(null);
  const original = props.aggregate.reviewPolicies.find((policy) => policy.id === selected) ?? null;
  if (!props.canManage) return null;
  const scopeLabels = new Map(productionReviewPolicyScopes(props.aggregate).map((entry) => [entry.key, entry.label] as const));
  return <section className="rounded-2xl border border-line bg-card p-4" aria-label={bt("제작 검수 정책", "Production review policy")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">{bt("제작 검수 기준", "Production review rules")}</h2><p className="mt-1 text-sm text-fg-2">{bt("회차·산출물별 검수 역할, 독립 계정 정족수와 응답 기한을 정합니다.", "Set scoped reviewer roles, independent-account quorum and response deadlines.")}</p></div>
      <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => select("new")}>{bt("검수 기준 만들기", "Create review rules")}</button></div>
    <div className="mt-3 flex flex-wrap gap-2">{props.aggregate.reviewPolicies.map((policy) => <button key={policy.id} type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => select(policy.id)}>{scopeLabels.get(canonicalJson(policy.scope)) ?? policy.scope.id} · {policy.quorumBasis === "accounts" ? bt("계정 인원", "Accounts") : bt("역할표 기준 · 기존 정책", "Assignment votes · existing policy")}</button>)}</div>
    {selected && actorId && (selected === "new" || original) ? <PolicyForm key={JSON.stringify([props.aggregate.projectId, actorId, authRevision, selected])} {...props}
      original={original} actorId={actorId} authRevision={authRevision} onClose={() => select(null)} /> : null}
  </section>;
}
function PolicyForm({ aggregate, canManage, execute, refresh, original, actorId, authRevision, onClose }: Props & {
  readonly original: ReviewPolicy | null; readonly actorId: string; readonly authRevision: number; readonly onClose: () => void;
}) {
  const bt = useBilingual("ProductionReviewPolicyEditor.form"), [draft, setDraft] = useState(() => productionReviewPolicyDraft(aggregate, original));
  const [newId] = useState(() => `review-policy:${crypto.randomUUID()}`), [busy, setBusy] = useState(false), [sealed, setSealed] = useState(false), [error, setError] = useState<string | null>(null);
  const request = useRef<ReviewPolicy | null>(null), saving = useRef(false), mounted = useRef(true), baselineRevision = useRef(aggregate.revision), latest = useRef(aggregate);
  const originalSnapshot = useRef(original ? structuredClone(original) : null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { latest.current = aggregate; }, [aggregate]);
  const current = useCallback(() => mounted.current && getAuthSessionRevision() === authRevision && getAuthSession()?.user.id === actorId, [authRevision, actorId]);
  const confirmed = useCallback((value: ProductionProjectAggregate) => Boolean(request.current && value.projectId === aggregate.projectId
    && value.revision > baselineRevision.current && value.reviewPolicies.some((policy) => policy.id === request.current?.id && canonicalJson(policy) === canonicalJson(request.current))), [aggregate.projectId]);
  useEffect(() => { if (sealed && !busy && current() && confirmed(aggregate)) onClose(); }, [aggregate, sealed, busy, current, confirmed, onClose]);
  const at = useProductionReviewClock(aggregate.assignments), scopes = productionReviewPolicyScopes(aggregate), scope = scopes.find((entry) => entry.key === draft.scopeKey)?.scope;
  const eligible = scope ? eligibleProductionReviewAssignments(aggregate, scope, at) : [];
  const patch = (value: Partial<typeof draft>) => { if (!sealed) { setDraft((old) => ({ ...old, ...value })); setError(null); } };
  const updateLane = (lane: ReviewPolicyLane) => patch({ lanes: draft.lanes.map((entry) => entry.lane === lane.lane ? lane : entry) });
  const save = async () => {
    if (!current() || !canManage || saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      if (sealed) {
        if (!refresh) throw new Error(bt("프로젝트 최신 상태 확인으로 원래 요청의 저장 결과를 확인하세요. 입력 내용과 식별자는 유지됩니다.", "Refresh the project to check the original request. Its content and ID are kept."));
        await refresh();
        if (current() && !confirmed(latest.current)) setError(bt("원래 정책의 저장 결과를 아직 확인하지 못했습니다. 고정한 내용을 유지하며 최신 상태를 다시 확인할 수 있습니다.", "The original policy save is not confirmed yet. Its fixed content is kept for another status check."));
        return;
      }
      if (canonicalJson(original) !== canonicalJson(originalSnapshot.current)) throw new Error(bt("정책이 다른 변경으로 갱신되었습니다. 현재 내용을 확인한 뒤 편집창을 다시 열어 주세요. 입력 내용은 유지됩니다.", "The policy changed elsewhere. Check its current state and reopen this editor. Your current draft is preserved."));
      const policy = buildProductionReviewPolicy(aggregate, draft, original, newId, new Date().toISOString());
      request.current = structuredClone(policy); baselineRevision.current = aggregate.revision; setSealed(true);
      await execute({ type: "upsert-review-policy", policy }, bt("제작 검수 기준을 저장했습니다.", "Production review rules saved."));
      if (current()) onClose();
    } catch (cause) {
      if (current()) {
        if (taskOutputRejectionDisposition(cause, actorId, aggregate.projectId) !== "sealed") { request.current = null; setSealed(false); }
        setError(cause instanceof Error ? cause.message : bt("저장 결과를 확인하지 못했습니다. 입력 내용을 유지합니다.", "The save could not be confirmed. Your draft is kept."));
      }
    } finally { saving.current = false; if (current()) setBusy(false); }
  };
  const migrating = Boolean(original && (original.quorumBasis ?? "assignments") !== "accounts" && draft.quorumBasis === "accounts");
  return <ProductionWorkspaceDialog title={bt("제작 검수 기준 편집", "Edit production review rules")} description={bt("이 범위를 포함하는 현재 활성·계정 연결 역할만 새 정책에 지정할 수 있습니다.", "New policy assignments require active linked accounts whose scope contains this scope.")}
    onClose={onClose} busy={busy} dirty={sealed || canonicalJson(draft) !== canonicalJson(productionReviewPolicyDraft(aggregate, original))} wide>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      <fieldset disabled={busy || sealed || !canManage} className="space-y-4">
        <label className="block text-sm font-semibold">{bt("검수 정책 범위", "Review policy scope")}<select className={FIELD} value={draft.scopeKey} onChange={(event) => patch({ scopeKey: event.target.value })}>{scopes.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
        <label className="block text-sm font-semibold">{bt("정족수 집계 기준", "Quorum basis")}<select className={FIELD} value={draft.quorumBasis} onChange={(event) => patch({ quorumBasis: event.target.value === "assignments" ? "assignments" : "accounts", acknowledgeAccountMigration: false })}>
          <option value="accounts">{bt("서로 다른 연결 계정 인원", "Distinct linked accounts")}</option><option value="assignments">{bt("역할표 수 · 기존 방식", "Assignment votes · legacy")}</option></select></label>
        {original && original.quorumBasis === undefined ? <p className="rounded-xl border border-warn/30 p-3 text-sm">{bt("기존 정책은 역할표 기준입니다. 같은 사람의 여러 역할을 여러 표로 계산할 수 있습니다. 계정 인원 기준으로 바꾸면 계정 증명이 없는 기존 승인을 다시 확인해야 합니다.", "This existing policy counts assignment votes and may count multiple roles held by one person. Switching to account quorum requires reviewing older approvals without account evidence.")}</p> : null}
        {migrating ? <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={draft.acknowledgeAccountMigration} onChange={(event) => patch({ acknowledgeAccountMigration: event.target.checked })} />{bt("기존 승인 이력은 보존하며 계정 증명이 없는 승인은 새 검수로 재확인해야 함을 확인했습니다.", "I understand that historical decisions stay intact and approvals without account evidence require renewed review.")}</label> : null}
        <fieldset><legend className="text-sm font-semibold">{bt("검수 항목", "Review lanes")}</legend><div className="mt-2 flex flex-wrap gap-3">{REVIEW_LANES.map((lane) => <label key={lane} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.lanes.some((entry) => entry.lane === lane)} onChange={(event) => patch({ lanes: event.target.checked ? [...draft.lanes, { lane, eligibleAssignmentIds: [], requiredAssignmentIds: [], vetoAssignmentIds: [], quorum: 1, blocksPublication: true }] : draft.lanes.filter((entry) => entry.lane !== lane) })} />{reviewLaneLabel(lane, bt)}</label>)}</div></fieldset>
        {draft.lanes.map((lane) => <fieldset key={lane.lane} className="space-y-3 rounded-xl border border-line p-3"><legend className="px-1 font-semibold">{reviewLaneLabel(lane.lane, bt)}</legend>
          <label className="block text-sm">{bt("필요 승인 수", "Required approvals")}<input className={FIELD} type="number" min={1} required value={lane.quorum} onChange={(event) => updateLane({ ...lane, quorum: Number(event.target.value) })} /></label>
          <p className="text-xs text-fg-2">{scope ? bt(`선택한 유효 ${draft.quorumBasis === "accounts" ? "계정" : "역할"} ${productionReviewPolicyVoterCount(aggregate, scope, lane.eligibleAssignmentIds, draft.quorumBasis, at)}개`, `${productionReviewPolicyVoterCount(aggregate, scope, lane.eligibleAssignmentIds, draft.quorumBasis, at)} eligible ${draft.quorumBasis === "accounts" ? "accounts" : "assignments"} selected`) : ""}</p>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={lane.blocksPublication} onChange={(event) => updateLane({ ...lane, blocksPublication: event.target.checked })} />{bt("공개 전 필수 항목", "Required before publication")}</label>
          {!eligible.length ? <p className="text-sm text-fg-2">{bt("이 범위를 포함하는 활성·계정 연결 역할이 없습니다. 회차 범위로 좁히거나 팀 배정을 먼저 설정하세요.", "No active linked assignment covers this scope. Choose a narrower episode scope or configure team assignments first.")}</p> : null}
          {eligible.map((assignment) => { const chosen = lane.eligibleAssignmentIds.includes(assignment.id), name = aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName ?? assignment.id;
            const toggle = (field: "requiredAssignmentIds" | "vetoAssignmentIds", checked: boolean) => updateLane({ ...lane, [field]: checked ? [...lane[field], assignment.id] : lane[field].filter((id) => id !== assignment.id) });
            return <div key={assignment.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-panel p-2 text-sm"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={chosen} onChange={(event) => updateLane(event.target.checked ? { ...lane, eligibleAssignmentIds: [...lane.eligibleAssignmentIds, assignment.id] } : { ...lane, eligibleAssignmentIds: lane.eligibleAssignmentIds.filter((id) => id !== assignment.id), requiredAssignmentIds: lane.requiredAssignmentIds.filter((id) => id !== assignment.id), vetoAssignmentIds: lane.vetoAssignmentIds.filter((id) => id !== assignment.id) })} />{name} · {roleTypeLabel(assignment.roleType, bt)}</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!chosen} checked={lane.requiredAssignmentIds.includes(assignment.id)} onChange={(event) => toggle("requiredAssignmentIds", event.target.checked)} />{bt("필수 역할", "Required role")}</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!chosen} checked={lane.vetoAssignmentIds.includes(assignment.id)} onChange={(event) => toggle("vetoAssignmentIds", event.target.checked)} />{bt("거부권", "Veto")}</label></div>;
          })}
          {lane.eligibleAssignmentIds.some((id) => !eligible.some((entry) => entry.id === id)) ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => { const active = new Set(eligible.map((entry) => entry.id)); updateLane({ ...lane, eligibleAssignmentIds: lane.eligibleAssignmentIds.filter((id) => active.has(id)), requiredAssignmentIds: lane.requiredAssignmentIds.filter((id) => active.has(id)), vetoAssignmentIds: lane.vetoAssignmentIds.filter((id) => active.has(id)) }); }}>{bt("현재 자격 없는 과거 역할을 이 정책 선택에서 제거", "Remove roles no longer eligible from this policy selection")}</button> : null}
        </fieldset>)}
        <label className="block text-sm font-semibold">{bt("응답 기한 · 시간", "Response deadline · hours")}<input className={FIELD} type="number" min={1} max={8760} required value={draft.responseDueHours} onChange={(event) => patch({ responseDueHours: Number(event.target.value) })} /></label>
        <label className="block text-sm font-semibold">{bt("기한 경과 시 조치", "Action after deadline")}<select className={FIELD} value={draft.expiredReviewAction} onChange={(event) => { const value = event.target.value; if (value === "escalate" || value === "replace-reviewer" || value === "reschedule") patch({ expiredReviewAction: value }); }}><option value="escalate">{bt("제작 관리자에게 상신", "Escalate to production manager")}</option><option value="replace-reviewer">{bt("검수자 교체", "Replace reviewer")}</option><option value="reschedule">{bt("일정 재조정", "Reschedule")}</option></select></label>
      </fieldset>
      {sealed ? <p role="status" className="text-sm text-fg-2">{bt("원래 정책 내용과 ID를 고정했습니다. 상태 확인은 같은 요청의 결과를 복구하며 새 정책을 만들지 않습니다.", "The original policy content and ID are fixed. Status checks recover that request without creating another policy.")}</p> : null}
      <button type="submit" className={buttonClass()} disabled={busy || !canManage}>{busy ? bt("저장 결과 확인 중", "Checking save result") : sealed ? bt("저장 상태 확인", "Check save status") : bt("검수 기준 저장", "Save review rules")}</button>
    </form>
  </ProductionWorkspaceDialog>;
}
