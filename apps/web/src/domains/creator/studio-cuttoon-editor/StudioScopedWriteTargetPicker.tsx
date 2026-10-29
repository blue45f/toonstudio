import { useState, useSyncExternalStore } from "react";
import type { StudioScopedWriteRuntime } from "./runtime/useStudioScopedWriteRuntime";
import { useStudioTemporalClock } from "../studio-collab/use-studio-temporal-clock";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";

const noopSubscribe = () => () => {}, zero = () => 0;
export function StudioScopedWriteTargetPicker({ runtime, currentPageId, onPage, onDraw }: {
  readonly runtime: StudioScopedWriteRuntime; readonly currentPageId: string;
  readonly onPage: (pageId: string) => void; readonly onDraw: () => void;
}) {
  const bt = useBilingual("StudioScopedWriteTargetPicker"), authority = runtime.authority;
  const epoch = useSyncExternalStore(authority?.subscribe ?? noopSubscribe, authority?.getEpoch ?? zero, zero);
  const [error, setError] = useState<string | null>(null);
  const now = Date.parse(useStudioTemporalClock(runtime.policy?.grants ?? [],
    JSON.stringify([authority?.authScopeKey, authority?.workId, epoch, runtime.policy?.policyVersion, runtime.policy?.grants])));
  if (!authority || runtime.policy?.fullEdit || (!runtime.loading && !runtime.error && !runtime.policy?.scopedWrite)) return null;
  const targets = authority.availableTargets;
  const options = targets.flatMap((target) => (runtime.policy?.grants ?? []).filter((grant) => grant.actorUserId === authority.authScopeKey && grant.revokedAt === null && Date.parse(grant.startsAt) <= now && (grant.endsAt === null || now <= Date.parse(grant.endsAt)) && grant.targetIds.includes(target.definition.id)).map((grant) => ({ target, grant })));
  const value = authority.targetId && authority.grantId ? JSON.stringify([authority.targetId, authority.grantId]) : "";
  return <section aria-label={bt("담당 원고 편집", "Assigned manuscript editing")} className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs text-fg">
    <label>{bt("담당 작업과 원고 범위", "Assigned task and manuscript scope")}
      <select className="ml-2 min-h-11 rounded-lg border border-line bg-panel px-2" value={value} disabled={runtime.loading} onChange={(event) => {
        const choice = options.find(({ target, grant }) => JSON.stringify([target.definition.id, grant.id]) === event.target.value);
        try { authority.chooseTarget(choice?.target.definition.id ?? null, choice?.grant.id ?? null); setError(null); if (choice) onPage(choice.target.definition.pageId); }
        catch (cause) { setError(cause instanceof Error ? cause.message : bt("담당 범위를 선택하지 못했습니다.", "Could not select the assigned scope.")); }
      }}><option value="">{bt("범위를 명시적으로 선택하세요", "Select an assigned scope")}</option>
        {options.map(({ target, grant }) => <option key={`${grant.id}:${target.definition.id}`} value={JSON.stringify([target.definition.id, grant.id])}>{grant.taskId} · {target.definition.pageId}{target.definition.frameId ? ` / ${target.definition.frameId}` : ""}</option>)}
      </select>
    </label>
    <button type="button" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })} disabled={!authority.currentTarget || currentPageId !== authority.currentTarget.definition.pageId} onClick={onDraw}>{bt("이 범위에서 그리기", "Draw in this scope")}</button>
    <button type="button" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })} disabled={runtime.loading} onClick={() => void runtime.refresh()}>{bt("배정 다시 확인", "Refresh assignments")}</button>
    <span>{bt("공용 제목·페이지·커버는 읽기 전용입니다.", "Shared title, pages and cover remain read-only.")}</span>
    {runtime.loading ? <span role="status">{bt("담당 편집 권한을 확인하고 있습니다.", "Checking assigned editing access.")}</span> : null}
    {error || runtime.error ? <p role="alert" className="w-full text-bad">{error ?? runtime.error}</p> : null}
    {!runtime.loading && !options.length ? <p role="status">{bt("현재 유효한 편집 배정이 없습니다. 입력한 초안은 유지됩니다.", "There is no current editing assignment. Your draft is preserved.")}</p> : null}
  </section>;
}
