import { useEffect, useMemo, useState } from "react";
import type {
  TeamWorkspaceAuditEntry,
  TeamWorkspaceMember,
} from "@toonstudio/contracts/production-workspace";
import { getApiErrorMessage, httpStatus } from "@/platform/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getTeamAuditLog } from "./team-workspace-api";
import { ProductionAvatar } from "./production-ui";
import {
  EMPTY_TEAM_AUDIT_FILTER,
  isTeamAuditFilterActive,
  TEAM_AUDIT_ACTION_OPTIONS,
  teamAuditActionLabel,
  teamAuditQueryFromFilter,
  teamAuditTargetText,
  type TeamAuditFilterState,
} from "./team-workspace-audit-model";

const fieldClass = "min-h-11 rounded-lg border border-line bg-canvas px-3 text-fg";

type AuditPanelState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "error"; readonly message: string };

/**
 * 팀 감사 로그 활동 탭. production_team_audit를 읽는 관리자 전용 표면으로,
 * 누가 초대·제거·역할 변경·작품 연결을 했는지 기간·행위자·행위로 좁혀 볼 수 있다.
 * 서버도 관리자만 허용하므로(403), 비관리자에게는 이 패널 자체를 렌더하지 않는 것이
 * 상위 화면(TeamWorkspacePage 탭)의 책임이고, 여기서는 403을 안내 상태로도 처리한다.
 */
export function TeamWorkspaceAuditPanel({
  workspaceId,
  members,
}: {
  readonly workspaceId: string;
  readonly members: readonly TeamWorkspaceMember[];
}) {
  const bt = useBilingual("TeamWorkspaceAuditPanel");
  const [filter, setFilter] = useState<TeamAuditFilterState>(EMPTY_TEAM_AUDIT_FILTER);
  const [entries, setEntries] = useState<readonly TeamWorkspaceAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [state, setState] = useState<AuditPanelState>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const filterActive = isTeamAuditFilterActive(filter);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    setEntries([]);
    setNextCursor(null);
    void (async () => {
      try {
        const response = await getTeamAuditLog(workspaceId, teamAuditQueryFromFilter(filter));
        if (!active) return;
        setEntries(response.entries);
        setNextCursor(response.nextCursor);
        setState({ kind: "ready" });
      } catch (cause) {
        if (!active) return;
        if (httpStatus(cause) === 403) setState({ kind: "forbidden" });
        else setState({ kind: "error", message: await getApiErrorMessage(cause, bt("감사 로그를 불러오지 못했습니다.", "Couldn't load the audit log.")) });
      }
    })();
    return () => { active = false; };
  }, [bt, workspaceId, filter, refresh]);

  async function loadMore() {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await getTeamAuditLog(workspaceId, teamAuditQueryFromFilter(filter, nextCursor));
      setEntries((current) => [...current, ...response.entries]);
      setNextCursor(response.nextCursor);
    } catch (cause) {
      setState({ kind: "error", message: await getApiErrorMessage(cause, bt("감사 로그를 더 불러오지 못했습니다.", "Couldn't load more audit entries.")) });
    } finally {
      setLoadingMore(false);
    }
  }

  // 행위자 선택지: 현재 구성원에, 이미 불러온 기록에만 등장하는 지난 행위자(제외된 구성원 등)를 합친다.
  const actorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const member of members) byId.set(member.userId, member.displayName);
    for (const entry of entries) if (!byId.has(entry.actorUserId)) byId.set(entry.actorUserId, entry.actorDisplayName);
    return [...byId.entries()].map(([userId, displayName]) => ({ userId, displayName }));
  }, [members, entries]);

  return <section aria-labelledby="team-audit-title" className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="team-audit-title" className="text-lg font-bold">{bt("활동 · 감사 로그", "Activity · audit log")}</h2>
      <p className="text-xs text-fg-3">{bt("초대·제거·역할 변경·작품 연결처럼 팀 구성이 바뀐 기록만 쌓입니다. 기록은 지우거나 고칠 수 없습니다.", "Only team-changing events are recorded: invites, removals, role changes, and project links. Entries can't be edited or deleted.")}</p>
    </div>

    <form aria-label={bt("감사 로그 필터", "Audit log filters")} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("시작일", "From")}
        <input type="date" className={fieldClass} value={filter.fromDate} onChange={(event) => setFilter((current) => ({ ...current, fromDate: event.target.value }))} /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("종료일", "To")}
        <input type="date" className={fieldClass} value={filter.toDate} onChange={(event) => setFilter((current) => ({ ...current, toDate: event.target.value }))} /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("행위자", "Actor")}
        <select className={fieldClass} value={filter.actorUserId} onChange={(event) => setFilter((current) => ({ ...current, actorUserId: event.target.value }))}>
          <option value="">{bt("모든 구성원", "Everyone")}</option>
          {actorOptions.map((actor) => <option key={actor.userId} value={actor.userId}>{actor.displayName}</option>)}
        </select></label>
      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("행위", "Action")}
        <select className={fieldClass} value={filter.action} onChange={(event) => setFilter((current) => ({ ...current, action: event.target.value }))}>
          <option value="">{bt("모든 행위", "All actions")}</option>
          {TEAM_AUDIT_ACTION_OPTIONS.map((action) => <option key={action} value={action}>{bt(teamAuditActionLabel(action).ko, teamAuditActionLabel(action).en)}</option>)}
        </select></label>
    </form>
    {filterActive && <button type="button" className="mb-4 underline" onClick={() => setFilter(EMPTY_TEAM_AUDIT_FILTER)}>{bt("필터 초기화", "Clear filters")}</button>}

    {state.kind === "loading" && <p role="status">{bt("감사 로그를 불러오는 중입니다.", "Loading the audit log…")}</p>}
    {state.kind === "forbidden" && <p role="status" className="text-sm leading-6 text-fg-2">{bt("감사 로그는 팀 소유자·관리자만 확인할 수 있습니다.", "Only the team owner and admins can view the audit log.")}</p>}
    {state.kind === "error" && <div role="alert" className="rounded-xl border border-bad p-4">{state.message}
      <button type="button" className="ml-3 underline" onClick={() => setRefresh((value) => value + 1)}>{bt("다시 시도", "Retry")}</button></div>}

    {state.kind === "ready" && <>
      {entries.length === 0
        ? <p data-testid="team-audit-empty" className="text-sm leading-6 text-fg-2">{filterActive
          ? bt("조건에 맞는 기록이 없습니다. 기간이나 행위자를 넓혀 보세요.", "No entries match these filters. Widen the period or actor.")
          : bt("아직 기록된 활동이 없습니다. 구성원을 초대하거나 역할을 바꾸면 여기에 쌓입니다.", "No activity yet. Invites and role changes will appear here.")}</p>
        : <ol className="space-y-3">{entries.map((entry) => {
          const label = teamAuditActionLabel(entry.action);
          return <li key={entry.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
            <ProductionAvatar name={entry.actorDisplayName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm"><strong>{entry.actorDisplayName}</strong> · {bt(label.ko, label.en)}</p>
              <p className="mt-0.5 text-xs text-fg-3">{bt("대상", "Target")} {teamAuditTargetText(entry)} · {new Date(entry.occurredAt).toLocaleString(bt("ko-KR", "en-US"))}</p>
            </div>
            <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs text-fg-3">r{entry.revision}</span>
          </li>;
        })}</ol>}
      {nextCursor !== null && <button type="button" disabled={loadingMore} className={`${buttonClass({ variant: "outline" })} mt-4`} onClick={() => { void loadMore(); }}>
        {loadingMore ? bt("불러오는 중…", "Loading…") : bt("이전 기록 더 보기", "Load older entries")}</button>}
    </>}
  </section>;
}
