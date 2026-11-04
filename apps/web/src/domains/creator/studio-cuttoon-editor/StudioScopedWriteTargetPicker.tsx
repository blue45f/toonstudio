import { useState, useSyncExternalStore } from "react";
import type { StudioScopedWriteRuntime } from "./runtime/useStudioScopedWriteRuntime";
import { useStudioTemporalClock } from "../studio-collab/use-studio-temporal-clock";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";

const noopSubscribe = () => () => {}, zero = () => 0;
export function StudioScopedWriteTargetPicker({ runtime, currentPageId, onPage, onDraw, onLayer }: {
  readonly runtime: StudioScopedWriteRuntime; readonly currentPageId: string;
  readonly onPage: (pageId: string) => void; readonly onDraw: () => void;
  readonly onLayer?: (layerId: string | null, frameId: string | null) => void;
}) {
  const bt = useBilingual("StudioScopedWriteTargetPicker"), authority = runtime.authority;
  const epoch = useSyncExternalStore(authority?.subscribe ?? noopSubscribe, authority?.getEpoch ?? zero, zero);
  const [error, setError] = useState<string | null>(null);
  const now = Date.parse(useStudioTemporalClock(runtime.policy?.grants ?? [],
    JSON.stringify([authority?.authScopeKey, authority?.workId, epoch, runtime.policy?.policyVersion, runtime.policy?.grants])));
  if (!authority || (runtime.policy?.fullEdit && !runtime.policy.rolePipeline?.enabled) || (!runtime.loading && !runtime.error && !runtime.policy?.scopedWrite && !runtime.policy?.rolePipeline?.enabled)) return null;
  const targets = authority.availableTargets;
  const options = targets.flatMap((target) => authority.grantsForTarget(target.definition.id).filter((grant) => Date.parse(grant.startsAt) <= now && (grant.endsAt === null || now <= Date.parse(grant.endsAt))).map((grant) => ({ target, grant })));
  const value = authority.targetId && authority.grantId ? JSON.stringify([authority.targetId, authority.grantId]) : "";
  return <section aria-label={bt("담당 원고 편집", "Assigned manuscript editing")} className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs text-fg">
    <label>{bt("담당 작업과 원고 범위", "Assigned task and manuscript scope")}
      <select className="ml-2 min-h-11 rounded-lg border border-line bg-panel px-2" value={value} disabled={runtime.loading} onChange={(event) => {
        const choice = options.find(({ target, grant }) => JSON.stringify([target.definition.id, grant.id]) === event.target.value);
        try { authority.chooseTarget(choice?.target.definition.id ?? null, choice?.grant.id ?? null); setError(null); if (choice) {
          onPage(choice.target.definition.pageId); onLayer?.(choice.target.definition.layerId === "page-root" ? null : choice.target.definition.layerId, choice.target.definition.frameId);
        } }
        catch (cause) { setError(cause instanceof Error ? cause.message : bt("담당 범위를 선택하지 못했습니다.", "Could not select the assigned scope.")); }
      }}><option value="">{bt("범위를 명시적으로 선택하세요", "Select an assigned scope")}</option>
        {options.map(({ target, grant }) => <option key={`${grant.id}:${target.definition.id}`} value={JSON.stringify([target.definition.id, grant.id])}>{grant.taskId} · {target.definition.pageId}{target.definition.frameId ? ` / ${target.definition.frameId}` : ""}</option>)}
      </select>
    </label>
    <button type="button" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })} disabled={!authority.currentTarget || currentPageId !== authority.currentTarget.definition.pageId} onClick={() => {
      const target = authority.currentTarget;
      if (target) { onLayer?.(target.definition.layerId === "page-root" ? null : target.definition.layerId, target.definition.frameId); onDraw(); }
    }}>{bt("이 범위에서 그리기", "Draw in this scope")}</button>
    <button type="button" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })} disabled={runtime.loading} onClick={() => void runtime.refresh()}>{bt("배정 다시 확인", "Refresh assignments")}</button>
    <span>{runtime.policy?.fullEdit ? bt("연결한 원고는 현재 직군 배정과 인계·승인 잠금을 따릅니다. 다른 범위는 기존 편집 권한을 유지합니다.", "Mapped manuscripts follow current role assignments and handoff or approval locks. Other scopes retain existing editing access.") : bt("공용 제목·페이지·커버는 읽기 전용입니다.", "Shared title, pages and cover remain read-only.")}</span>
    {runtime.policy?.rolePipelineAccess?.frozenTargetIds.length ? <p role="status" className="w-full text-warn">{bt("인계·승인되어 잠긴 원고 범위가 있습니다. 제작 관리에서 새 작업으로 재개하세요.", "Some scopes are locked after handoff or approval. Start new rework tasks in production management.")}</p> : null}
    {runtime.loading ? <span role="status">{bt("담당 편집 권한을 확인하고 있습니다.", "Checking assigned editing access.")}</span> : null}
    {error || runtime.error ? <p role="alert" className="w-full text-bad">{error ?? runtime.error}</p> : null}
    {!runtime.loading && !options.length ? <p role="status">{bt("현재 유효한 편집 배정이 없습니다. 입력한 초안은 유지됩니다.", "There is no current editing assignment. Your draft is preserved.")}</p> : null}
  </section>;
}
