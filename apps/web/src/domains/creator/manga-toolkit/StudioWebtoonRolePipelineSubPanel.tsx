/**
 * StudioWebtoonRolePipelineSubPanel.tsx
 *
 * 웹툰·만화 8단계 직군 세분화(글작가·각색작가·보조 글작가·콘티작가·3D 배경작가·배경 어시스턴트·
 * 선화작가·선화 어시스턴트·밑색 어시스턴트·명암 어시스턴트·효과 어시스턴트·식자 디자이너·편집자/PD),
 * 직군별 특화 메뉴 구성, 18종 그룹의 권한·동결 예시와 지역 공정 인계 계획. 실제 문서·권한을 변경하지 않는다.
 */
import { useId, useMemo, useState, type ReactElement } from "react";

import { studioSegmentChipClass } from "../studio-panel-ui";

import {
  createInitialRolePipelineHandoffState,
  evaluateParallelRoleCollaborationPair,
  evaluateRoleLayerEditGuard,
  evaluateRolePipelineHandoff,
  executeOneClickStageHandoff,
  resolveKritaColorizeAndMediBangCloudWorkflowGuide,
  resolveRolePipelinePreset,
  resolveStageDeliverableChecklist,
  WEBTOON_CANONICAL_LAYER_GROUPS,
  WEBTOON_E2E_ROLE_PIPELINE_STAGES,
  type WebtoonCanonicalLayerGroupId,
  type WebtoonPipelineStageId,
} from "./webtoon-role-pipeline-orchestrator";

import { creatorRoleDefinition, creatorText, type CreatorRoleId } from "@/shared/lib/creator-role-contract";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("StudioWebtoonRolePipelineSubPanel", ko, en);

const SPECIALIST_ROLES_QUICK_LIST: readonly {
  readonly roleId: CreatorRoleId;
  readonly shortLabelKo: string;
}[] = Object.freeze([
  { roleId: "story", shortLabelKo: "글작가" },
  { roleId: "adaptation", shortLabelKo: "각색·콘티대본" },
  { roleId: "associate-writer", shortLabelKo: "보조 글작가" },
  { roleId: "storyboard", shortLabelKo: "콘티·연출작가" },
  { roleId: "background", shortLabelKo: "3D 배경작가" },
  { roleId: "background-assistant", shortLabelKo: "배경 어시스턴트" },
  { roleId: "line-art", shortLabelKo: "메인 선화작가" },
  { roleId: "line-assistant", shortLabelKo: "선화 어시스턴트" },
  { roleId: "flat-color-assistant", shortLabelKo: "밑색 어시스턴트" },
  { roleId: "shading-assistant", shortLabelKo: "명암 어시스턴트" },
  { roleId: "effect-assistant", shortLabelKo: "효과·무빙툰 어시" },
  { roleId: "lettering", shortLabelKo: "식자 디자이너" },
  { roleId: "lettering-assistant", shortLabelKo: "식자 어시스턴트" },
  { roleId: "editor", shortLabelKo: "편집자·PD" },
  { roleId: "creator", shortLabelKo: "총괄 1인작가" },
]);

const MENU_EXAMPLES_EN: Readonly<Record<WebtoonPipelineStageId, readonly string[]>> = {
  "story-script": ["Script and lore reference", "Character sheet review", "CJK word budget", "Adaptation comparison"],
  "storyboard-conte": ["Vertical strip staging", "Panel spacing rhythm", "Camera shot planning", "Balloon planning"],
  "bg3d-spatial": ["Openings and mouldings", "Two-point perspective", "Interior cutaway", "LT pass planning"],
  "line-art-ink": ["Lead art review", "Vector intersection eraser", "Stroke correction", "Reference view"],
  "flat-color-mask": ["Gap-closing fill", "Character colour reference", "Part masks", "Unpainted-pixel review"],
  "shading-fx-post": ["Clipped cell shading", "Glow and atmospheric depth", "Speed lines", "Motion trigger planning"],
  "lettering-sfx": ["Face-aware balloon planning", "22px readability review", "Font pairing", "Localization lettering"],
  "pd-editorial-review": ["WT-* preflight", "Redline feedback", "Portal slicing", "Final freeze planning"],
};

export function StudioWebtoonRolePipelineSubPanel(): ReactElement {
  useBilingualI18nRevision();
  const scopeNoticeId = useId();
  const handoffReasonId = useId();
  const [selectedRoleId, setSelectedRoleId] = useState<CreatorRoleId>(
    () => createInitialRolePipelineHandoffState().activeAssigneeRoleId,
  );
  const [selectedLayerGroup, setSelectedLayerGroup] =
    useState<WebtoonCanonicalLayerGroupId>("story-notes");
  const [partnerRoleId, setPartnerRoleId] = useState<CreatorRoleId>("line-art");
  const [handoffState, setHandoffState] = useState(createInitialRolePipelineHandoffState);
  const rolePreset = useMemo(() => resolveRolePipelinePreset(selectedRoleId), [selectedRoleId]);
  const deliverableChecklist = useMemo(
    () => resolveStageDeliverableChecklist(rolePreset.stage.id),
    [rolePreset.stage.id],
  );
  const kritaMediBangGuide = useMemo(
    () => resolveKritaColorizeAndMediBangCloudWorkflowGuide(rolePreset.stage.id),
    [rolePreset.stage.id],
  );
  const parallelPair = useMemo(
    () => evaluateParallelRoleCollaborationPair(selectedRoleId, partnerRoleId),
    [selectedRoleId, partnerRoleId],
  );
  const guardFor = (group: WebtoonCanonicalLayerGroupId) => evaluateRoleLayerEditGuard({
    roleId: selectedRoleId,
    targetLayerGroup: group,
    isApprovedFrozen: handoffState.isEpisodeApprovedFrozen,
    frozenLayerGroups: handoffState.frozenLayerGroups,
  });
  const layerGuard = guardFor(selectedLayerGroup);
  const handoffGuard = evaluateRolePipelineHandoff(handoffState, selectedRoleId);
  const activeStage = WEBTOON_E2E_ROLE_PIPELINE_STAGES.find((stage) => stage.id === handoffState.activeStageId);
  const roleDefinition = creatorRoleDefinition(selectedRoleId);
  const roleLabel = bi(rolePreset.roleLabelKo, roleDefinition ? creatorText(roleDefinition.label, "en") : selectedRoleId);

  return (
    <section data-testid="webtoon-role-pipeline-section" aria-describedby={scopeNoticeId}
      aria-label={bi("분업 계획·권한 예시", "Production plan and permission preview")}
      className="space-y-2.5 text-[0.66rem]">
      <p id={scopeNoticeId} data-testid="role-pipeline-scope-notice" className="rounded border border-accent/30 bg-accent-soft/20 p-2 text-fg-2">
        {bi(
          "분업 계획·권한 예시입니다. 실제 원고·서버 권한·담당자·작업공간은 변경하지 않습니다. 이 탭을 떠나면 계획은 초기화됩니다.",
          "This is a production plan and permission preview. It does not change manuscripts, server permissions, assignees or workspaces. The plan resets when you leave this tab.",
        )}
      </p>
      <div className="rounded border border-line bg-raised/40 p-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-fg">{bi("① 예시 직군 선택", "1. Choose a preview role")}</span>
          <span data-testid="role-pipeline-permission-badge"
            className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-accent">
            {bi(rolePreset.permissionBadgeKo, `Permission example: ${rolePreset.canonWriteAccess}, ${rolePreset.allowedLayerGroups.length} planned groups`)}
          </span>
        </div>
        <div role="group" aria-label={bi("분업 예시 직군", "Production preview roles")} className="mt-1.5 flex flex-wrap gap-1">
          {SPECIALIST_ROLES_QUICK_LIST.map((item) => {
            const definition = creatorRoleDefinition(item.roleId);
            return (
              <button key={item.roleId} type="button" data-testid={`role-pipeline-select-${item.roleId}`}
                aria-pressed={selectedRoleId === item.roleId} onClick={() => setSelectedRoleId(item.roleId)}
                className={studioSegmentChipClass(selectedRoleId === item.roleId)}>
                {bi(item.shortLabelKo, definition ? creatorText(definition.label, "en") : item.roleId)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded border border-line bg-raised/40 p-2">
          <div className="font-bold text-fg">{bi(`② [${roleLabel}] 메뉴·커맨드바 구성 예시`, `2. [${roleLabel}] Menu and command bar examples`)}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {rolePreset.tailoredMenusKo.map((menu, index) => (
              <span key={menu} className="rounded border border-accent/40 bg-accent-soft/30 px-1.5 py-0.5 font-semibold text-fg">
                {bi(menu, MENU_EXAMPLES_EN[rolePreset.stage.id][index] ?? rolePreset.stage.id)}
              </span>
            ))}
          </div>
          <div className="mt-1.5 font-mono text-[0.6rem] text-fg-2">
            {bi("추천 작업공간 예시", "Workspace example")}: [{rolePreset.workspaceId}] · {bi("도구 슬롯 예시", "Command examples")}: {rolePreset.recommendedCommandBarSlots.join(" → ")}
          </div>
          <div className="mt-0.5 text-[0.6rem] text-fg-3">{bi("참고 도구", "Reference tools")}: {rolePreset.familiarTools.join(" · ")}</div>
          <div
            data-testid="role-pipeline-deliverable-checklist"
            className="mt-1.5 rounded border border-line bg-card/80 p-1.5 font-mono text-[0.57rem] text-fg-2"
          >
            {bi("인계 전 체크리스트", "Pre-handoff checklist")}: {deliverableChecklist.join(" · ")}
          </div>
          <div
            data-testid="role-pipeline-krita-medibang-workflow"
            className="mt-1 rounded border border-line bg-card/60 p-1.5 font-mono text-[0.56rem] text-fg-3"
          >
            {bi(kritaMediBangGuide.summaryKo, kritaMediBangGuide.summaryEn)}
          </div>
        </div>
        <div className="rounded border border-line bg-raised/40 p-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="font-bold text-fg">{bi("③ 그룹별 편집·동결 계획 예시 (18종)", "3. Edit and freeze preview (18 groups)")}</span>
            <span data-testid="role-layer-guard-status" role="status" aria-live="polite"
              className={`rounded px-1.5 py-0.5 font-mono text-[0.6rem] font-bold ${layerGuard.allowed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
              {layerGuard.allowed
                ? rolePreset.requiresLeadReview ? bi("계획상 제안 가능", "Proposal preview") : bi("계획상 편집 가능", "Edit preview")
                : bi("계획상 편집 제외", "Excluded from edit plan")}
            </span>
          </div>
          <div role="group" aria-label={bi("계획 대상 레이어 그룹", "Planned layer groups")} className="mt-1.5 flex flex-wrap gap-1">
            {WEBTOON_CANONICAL_LAYER_GROUPS.map((group) => {
              const guard = guardFor(group.id);
              const selected = selectedLayerGroup === group.id;
              return (
                <button key={group.id} type="button" data-testid={`role-layer-chip-${group.id}`}
                  aria-pressed={selected} onClick={() => setSelectedLayerGroup(group.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold transition-colors ${selected ? "border-accent bg-accent text-on-accent" : guard.allowed ? "border-success/40 bg-success/10 text-fg" : "border-line bg-panel text-fg-3 opacity-75"}`}>
                  <span aria-hidden="true">{guard.allowed ? "🔓" : "🔒"}</span>{" "}
                  {bi(group.labelKo, group.id.replaceAll("-", " "))}{" · "}
                  {guard.allowed ? bi("담당 예시", "planned") : bi("편집 제외", "excluded")}
                </button>
              );
            })}
          </div>
          <p data-testid="role-layer-guard-reason" className="mt-1.5 font-mono text-[0.6rem] text-fg-2">{bi(layerGuard.reasonKo, layerGuard.reasonEn)}</p>
        </div>
      </div>
      <div className="rounded border border-line bg-raised/40 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold text-fg">{bi("④ 8단계 공정 인계·이전 공정 동결 계획", "4. Eight-stage handoff and upstream freeze plan")}</span>
            <span data-testid="role-pipeline-active-stage-label" className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-accent">
              {activeStage ? bi(`현재 계획: ${activeStage.labelKo}`, `Current plan: Step ${activeStage.stepNumber} · ${activeStage.id}`) : bi("잘못된 공정 계획", "Invalid stage plan")}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button type="button" data-testid="role-pipeline-handoff-btn" disabled={!handoffGuard.allowed}
              aria-describedby={handoffReasonId}
              onClick={() => {
                const next = executeOneClickStageHandoff(handoffState, { actorRoleId: selectedRoleId });
                if (next === handoffState) return;
                setHandoffState(next);
                setSelectedRoleId(next.activeAssigneeRoleId);
              }}
              className="rounded bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
              {handoffState.isEpisodeApprovedFrozen
                ? bi("최종 동결 계획 완료", "Final freeze plan complete")
                : bi("다음 공정으로 인계 계획 →", "Plan next stage handoff →")}
            </button>
            <button type="button" data-testid="role-pipeline-reset-btn" onClick={() => {
              const initial = createInitialRolePipelineHandoffState();
              setHandoffState(initial);
              setSelectedRoleId(initial.activeAssigneeRoleId);
              setSelectedLayerGroup("story-notes");
            }} className="rounded border border-line bg-card px-2 py-1 text-[0.6rem] text-fg-2 hover:text-fg">
              {bi("계획 초기화", "Reset plan")}
            </button>
          </div>
        </div>
        <p id={handoffReasonId} data-testid="role-pipeline-handoff-reason" role="status" aria-live="polite" className="mt-1.5 text-fg-2">
          {bi(handoffGuard.reasonKo, handoffGuard.reasonEn)}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
          {WEBTOON_E2E_ROLE_PIPELINE_STAGES.map((stage) => (
            <div key={stage.id} aria-current={stage.id === handoffState.activeStageId ? "step" : undefined}
              className={`rounded border p-1.5 text-[0.58rem] ${stage.id === handoffState.activeStageId ? "border-accent bg-accent-soft/35 font-bold text-fg" : "border-line bg-card/70 text-fg-2"}`}>
              <div>{bi(stage.labelKo, `Step ${stage.stepNumber} · ${stage.id}`)}</div>
              <div className="mt-0.5 font-mono text-[0.55rem] text-fg-3">{bi("그룹", "Groups")} {stage.ownedLayerGroups.length} · {stage.workspaceId}</div>
            </div>
          ))}
        </div>
        {handoffState.handoffHistory.length > 0 ? (
          <div data-testid="role-pipeline-handoff-log" className="mt-1.5 font-mono text-[0.58rem] text-fg-2">
            {bi("최근 인계 계획", "Latest planned handoff")}: {bi(
              handoffState.handoffHistory[handoffState.handoffHistory.length - 1]?.noteKo ?? "",
              `${handoffState.handoffHistory.at(-1)?.fromStageId} → ${handoffState.handoffHistory.at(-1)?.toStageId}`,
            )} ({bi("계획상 동결 그룹", "Groups frozen in plan")} {handoffState.frozenLayerGroups.length})
          </div>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded border border-line bg-card/60 p-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-bold text-fg">
              {bi("⑤ 동시 협업 직군 레이어 충돌 시뮬레이션", "5. Parallel role layer conflict check")}
            </span>
            {(["background", "line-art", "flat-color-assistant", "lettering"] as const).map(
              (candidate) => (
                <button
                  key={candidate}
                  type="button"
                  data-testid={`role-parallel-partner-${candidate}`}
                  aria-pressed={partnerRoleId === candidate}
                  onClick={() => setPartnerRoleId(candidate)}
                  className={studioSegmentChipClass(partnerRoleId === candidate)}
                >
                  + {candidate}
                </button>
              ),
            )}
          </div>
          <span
            data-testid="role-pipeline-parallel-pair-status"
            className={`font-mono text-[0.57rem] ${parallelPair.conflictFree ? "text-success" : "text-danger"}`}
          >
            {bi(parallelPair.summaryKo, parallelPair.summaryEn)}
          </span>
        </div>
      </div>
    </section>
  );
}
