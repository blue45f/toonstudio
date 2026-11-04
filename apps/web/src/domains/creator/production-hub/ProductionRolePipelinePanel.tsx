import { useState } from "react";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { STUDIO_ROLE_PIPELINE_STAGES, STUDIO_ROLE_PIPELINE_ROLES, STUDIO_ROLE_PIPELINE_GROUP_IDS,
  STUDIO_ROLE_PIPELINE_GROUP_LABELS, StudioRolePipelineConfigurationSchema, type StudioRolePipelineConfiguration,
  type StudioRolePipelineGroupId } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedWritePolicy, StudioScopedWriteManagementCommand } from "@toonstudio/contracts/studio-scoped-write";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { roleTypeLabel, taskStatusLabel } from "./production-labels";

type Command = StudioScopedWriteManagementCommand["command"];
const FIELD = "mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-sm text-fg";

/** 계획 화면과 별개인 실제 프로젝트 정책이다. 기존 관리 요청의 CAS·복구 경계를 사용한다. */
export function ProductionRolePipelinePanel({ policy, aggregate, disabled, onCommand, workRevision }: {
  readonly policy: StudioScopedWritePolicy; readonly aggregate: ProductionProjectAggregate; readonly disabled: boolean;
  readonly onCommand: (command: Command) => void; readonly workRevision: number | null;
}) {
  const bt = useBilingual("ProductionRolePipelinePanel"), pipeline = policy.rolePipeline;
  const stageLabel = (id: string) => {
    const stage = STUDIO_ROLE_PIPELINE_STAGES.find((stage) => stage.id === id);
    return stage ? bt(stage.label, stage.id.replaceAll("-", " ")) : id;
  };
  const reworkRequired = Boolean(pipeline && (pipeline.history.length || pipeline.frozenStageIds.length || pipeline.approvedAt
    || pipeline.stageTasks.some((entry) => aggregate.tasks.some((task) => task.id === entry.taskId && ["conditionally-approved", "approved", "done"].includes(task.status)))));
  const canHandoff = policy.canManage || policy.rolePipelineAccess?.canHandoff === true;
  const [bindings, setBindings] = useState<StudioRolePipelineConfiguration["roleBindings"]>(() => pipeline?.roleBindings ?? []);
  const [mappings, setMappings] = useState<StudioRolePipelineConfiguration["groupMappings"]>(() => pipeline?.groupMappings ?? []);
  const [tasks, setTasks] = useState<StudioRolePipelineConfiguration["stageTasks"]>(() => pipeline?.stageTasks ?? []);
  const [acknowledged, acknowledge] = useState(false), [error, setError] = useState<string | null>(null);
  const [groupId, selectGroup] = useState<StudioRolePipelineGroupId>("story-notes"), [query, setQuery] = useState(""), [offset, setOffset] = useState(0);
  const targets = policy.targets.filter((target) => !target.revokedAt && target.definition.productionProjectId === aggregate.projectId);
  const matchingTargets = targets.filter(({ definition }) => `${definition.pageId} ${definition.frameId ?? ""} ${definition.layerId ?? ""} ${definition.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const assignments = aggregate.assignments.filter((assignment) => assignment.projectId === aggregate.projectId && assignment.status === "active"
    && aggregate.parties.some((party) => party.id === assignment.partyId && party.status === "active" && party.accountUserId));
  const submit = (restart: boolean) => {
    if (disabled || !acknowledged) return;
    const parsed = StudioRolePipelineConfigurationSchema.safeParse({ productionProjectId: aggregate.projectId, roleBindings: bindings,
      groupMappings: mappings, stageTasks: tasks });
    if (!parsed.success) { setError(bt("실제 역할 배정, 중복 없는 원고 매핑, 서로 다른 8개 공정 작업을 선택하세요.", "Choose actual role assignments, unique manuscript mappings and eight distinct stage tasks.")); return; }
    if (restart && !workRevision) { setError(bt("현재 저장 원고 버전을 다시 확인하세요.", "Refresh the saved manuscript revision.")); return; }
    setError(null);
    if (restart && workRevision) onCommand({ type: "restart-role-pipeline", configuration: parsed.data, expectedWorkRevision: workRevision });
    else onCommand({ type: "configure-role-pipeline", configuration: parsed.data });
  };
  const selectTarget = (groupId: StudioRolePipelineGroupId, targetId: string, checked: boolean) => {
    setMappings((previous) => {
      const chosen = new Set(previous.find((mapping) => mapping.groupId === groupId)?.targetIds ?? []);
      if (checked) chosen.add(targetId); else chosen.delete(targetId);
      return [...previous.filter((mapping) => mapping.groupId !== groupId), ...(chosen.size ? [{ groupId, targetIds: [...chosen] }] : [])];
    });
  };
  return <section aria-label={bt("실제 직군별 원고 보호", "Actual role-based manuscript protection")} className="space-y-3 rounded-xl border border-accent/30 p-3">
    <h3 className="font-bold">{bt("프로젝트 직군별 원고 보호", "Project role-based manuscript protection")}</h3>
    <p role="status" className="text-sm">{pipeline?.enabled ? bt("이 프로젝트의 원고 보호 켜짐", "Protection enabled for this project") : bt("이 프로젝트의 원고 보호 꺼짐 (기본값)", "Protection disabled for this project (default)")}</p>
    <p className="text-sm text-fg-2">{bt("아래에서 연결한 실제 원고만 보호합니다. 켜면 전체 편집자도 현재 직군 배정 없이 수정할 수 없으며, 인계·승인된 범위는 새 제작 작업으로 재개해야 합니다. 개인 작업 모드와 분업 계획은 권한을 부여하지 않습니다.", "Only explicitly mapped manuscripts are protected. Full editors also need a current role assignment; handed-off or approved scopes require new production tasks. Personal modes and planning previews never grant access.")}</p>
    {pipeline?.enabled ? <div className="space-y-2 rounded-lg border border-line p-2 text-sm">
      <p>{bt("현재 실제 공정", "Current actual stage")}: {stageLabel(pipeline.activeStageId)}</p>
      <p>{pipeline.approvedAt ? bt("최종 승인 잠금 — 재작업으로만 재개", "Final approval lock — restart through rework") : bt(`인계 완료 ${pipeline.frozenStageIds.length}단계`, `${pipeline.frozenStageIds.length} stages handed off`)}</p>
      <button type="button" className={buttonClass({ size: "sm" })} disabled={disabled || !canHandoff || Boolean(pipeline.approvedAt)}
        onClick={() => onCommand({ type: "handoff-role-pipeline", expectedProjectRevision: aggregate.revision })}>{bt("승인된 제출을 확인하고 실제 다음 공정으로 인계", "Verify approved submission and hand off to the next stage")}</button>
      {policy.canManage ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={disabled || reworkRequired}
        onClick={() => onCommand({ type: "disable-role-pipeline" })}>{bt("이 프로젝트의 보호 끄기", "Disable protection for this project")}</button> : null}
      <ul className="space-y-1">{pipeline.history.map((entry) => <li key={entry.mutationId}>{entry.createdAt} · {entry.kind === "restart" ? bt("재작업", "Rework") : bt("인계", "Handoff")} · {stageLabel(entry.fromStageId)} → {entry.toStageId ? stageLabel(entry.toStageId) : bt("최종 승인", "Final approval")}</li>)}</ul>
    </div> : null}
    {policy.canManage ? <>
    {reworkRequired ? <p role="status" className="text-sm text-warn">{bt("인계·승인된 기록을 보존합니다. 여덟 공정에 새 제작 작업을 연결한 뒤 재작업으로 재개하세요.", "Handoff and approval records are preserved. Link new tasks for all eight stages and restart through rework.")}</p> : null}
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-semibold">{bt("1. 실제 계정의 15개 제작 직군 연결", "1. Link actual accounts to 15 production roles")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{STUDIO_ROLE_PIPELINE_ROLES.map((role) => <label key={role.id} className="text-sm">{bt(role.label, role.id.replaceAll("-", " "))}
        <select multiple size={3} aria-label={`${bt("제작 직군", "Production role")} ${bt(role.label, role.id.replaceAll("-", " "))}`} className={FIELD} value={bindings.filter((binding) => binding.roleId === role.id).map((binding) => binding.assignmentId)}
          onChange={(event) => { const ids = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
            setBindings((previous) => [...previous.filter((binding) => binding.roleId !== role.id), ...ids.map((assignmentId) => ({ roleId: role.id, assignmentId }))]); }}>
          {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>
            {aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName} · {roleTypeLabel(assignment.roleType, bt)}
          </option>)}
        </select></label>)}</div>
    </fieldset>
    <fieldset disabled={disabled} className="space-y-2"><legend className="text-sm font-semibold">{bt("2. 18개 제작 레이어 그룹과 실제 등록 원고 연결", "2. Map 18 production layer groups to registered manuscripts")}</legend>
      <p className="text-xs text-fg-2">{bt("아래 기존 담당 범위 등록에서 실제 페이지·컷·레이어를 먼저 등록하세요. 한 실제 범위는 하나의 제작 그룹에만 연결할 수 있습니다.", "First register actual pages, frames and layers in range management below. A range can be mapped to one production group only.")}</p>
      <label className="block text-sm">{bt("연결할 제작 레이어 그룹", "Production layer group to map")}<select className={FIELD} value={groupId} onChange={(event) => {
        const id = STUDIO_ROLE_PIPELINE_GROUP_IDS.find((id) => id === event.target.value);
        if (id) { selectGroup(id); setOffset(0); }
      }}>{STUDIO_ROLE_PIPELINE_GROUP_IDS.map((id) => <option key={id} value={id}>{bt(STUDIO_ROLE_PIPELINE_GROUP_LABELS[id], id.replaceAll("-", " "))} · {mappings.find((entry) => entry.groupId === id)?.targetIds.length ?? 0}</option>)}</select></label>
      <label className="block text-sm">{bt("실제 원고 범위 찾기", "Find an actual manuscript range")}<input type="search" className={FIELD} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /></label>
      <fieldset className="max-h-80 overflow-auto rounded-lg border border-line p-2">
        <legend className="px-1 text-xs font-semibold">{bt(STUDIO_ROLE_PIPELINE_GROUP_LABELS[groupId], groupId.replaceAll("-", " "))}</legend>
        {matchingTargets.slice(offset, offset + 100).map((target) => {
          const selected = mappings.find((mapping) => mapping.groupId === groupId)?.targetIds.includes(target.definition.id) ?? false;
          const elsewhere = mappings.some((mapping) => mapping.groupId !== groupId && mapping.targetIds.includes(target.definition.id));
          return <label key={target.definition.id} className="flex min-h-11 items-center gap-2 break-all text-xs"><input type="checkbox" disabled={elsewhere}
            checked={selected} onChange={(event) => selectTarget(groupId, target.definition.id, event.target.checked)} />
            {target.definition.pageId} / {target.definition.layerId ?? target.definition.frameId ?? bt("페이지", "Page")} · {target.definition.id}
          </label>;
        })}{!matchingTargets.length ? <p className="text-xs">{bt("등록된 실제 원고 범위가 없습니다.", "No registered manuscript ranges.")}</p> : null}
      </fieldset>
      {matchingTargets.length > 100 ? <div className="flex gap-2"><button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>{bt("이전 범위", "Previous ranges")}</button>
        <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={offset + 100 >= matchingTargets.length} onClick={() => setOffset(offset + 100)}>{bt("다음 범위", "Next ranges")}</button></div> : null}
    </fieldset>
    <fieldset disabled={disabled} className="grid gap-2 sm:grid-cols-2"><legend className="text-sm font-semibold">{bt("3. 실제 8단계 제작 작업", "3. Eight actual production tasks")}</legend>
      {STUDIO_ROLE_PIPELINE_STAGES.map((stage, index) => <label key={stage.id} className="text-sm">{index + 1}. {bt(stage.label, stage.id.replaceAll("-", " "))}
        <select aria-label={`${bt("실제 공정", "Actual stage")} ${bt(stage.label, stage.id.replaceAll("-", " "))}`} className={FIELD} value={tasks.find((entry) => entry.stageId === stage.id)?.taskId ?? ""}
          onChange={(event) => setTasks((previous) => [...previous.filter((entry) => entry.stageId !== stage.id), ...(event.target.value ? [{ stageId: stage.id, taskId: event.target.value }] : [])])}>
          <option value="">{bt("실제 작업 선택", "Select an actual task")}</option>{aggregate.tasks.filter((task) => task.projectId === aggregate.projectId).map((task) => <option key={task.id} value={task.id}>{task.title} · {taskStatusLabel(task.status, bt)}</option>)}
        </select></label>)}
    </fieldset>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={acknowledged} onChange={(event) => acknowledge(event.target.checked)} />
      {bt("연결한 실제 범위에 전체 편집자도 포함하는 보호를 적용함을 확인했습니다.", "I understand protection includes full editors in the mapped scopes.")}</label>
    {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass({ size: "sm" })} disabled={disabled || !acknowledged || reworkRequired} onClick={() => submit(false)}>
      {pipeline?.enabled ? bt("실제 보호 연결 저장", "Save actual protection mappings") : bt("이 프로젝트의 원고 보호 켜기", "Enable protection for this project")}</button>
      {reworkRequired ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={disabled || !acknowledged || !workRevision} onClick={() => submit(true)}>{bt("새 제작 작업으로 재작업 시작", "Start rework with new production tasks")}</button> : null}
    </div>
    </> : null}
  </section>;
}
