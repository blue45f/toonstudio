/**
 * StudioWebtoonRolePipelineSubPanel.tsx
 *
 * 웹툰·만화 8단계 직군 세분화(글작가·각색작가·보조 글작가·콘티작가·3D 배경작가·배경 어시스턴트·
 * 선화작가·선화 어시스턴트·밑색 어시스턴트·명암 어시스턴트·효과 어시스턴트·식자 디자이너·편집자/PD),
 * 직군별 특화 메뉴 구성, 18종 레이어 그룹 RBAC 잠금 시뮬레이터 및 원클릭 공정 인계(Handoff) 워크벤치.
 */
import { useMemo, useState, type ReactElement } from "react";

import { studioSegmentChipClass } from "../studio-panel-ui";

import {
  createInitialRolePipelineHandoffState,
  evaluateRoleLayerEditGuard,
  executeOneClickStageHandoff,
  resolveRolePipelinePreset,
  WEBTOON_CANONICAL_LAYER_GROUPS,
  WEBTOON_E2E_ROLE_PIPELINE_STAGES,
  type WebtoonCanonicalLayerGroupId,
} from "./webtoon-role-pipeline-orchestrator";

import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";

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

export function StudioWebtoonRolePipelineSubPanel(): ReactElement {
  const [selectedRoleId, setSelectedRoleId] = useState<CreatorRoleId>("flat-color-assistant");
  const [selectedLayerGroup, setSelectedLayerGroup] =
    useState<WebtoonCanonicalLayerGroupId>("main-lineart");
  const [handoffState, setHandoffState] = useState(createInitialRolePipelineHandoffState);

  const rolePreset = useMemo(
    () => resolveRolePipelinePreset(selectedRoleId),
    [selectedRoleId],
  );

  const layerGuard = useMemo(
    () =>
      evaluateRoleLayerEditGuard({
        roleId: selectedRoleId,
        targetLayerGroup: selectedLayerGroup,
        isApprovedFrozen: handoffState.isEpisodeApprovedFrozen,
      }),
    [selectedRoleId, selectedLayerGroup, handoffState.isEpisodeApprovedFrozen],
  );

  const activeStageSpec = useMemo(
    () =>
      WEBTOON_E2E_ROLE_PIPELINE_STAGES.find((s) => s.id === handoffState.activeStageId) ??
      WEBTOON_E2E_ROLE_PIPELINE_STAGES[0]!,
    [handoffState.activeStageId],
  );

  return (
    <div data-testid="webtoon-role-pipeline-section" className="space-y-2.5 text-[0.66rem]">
      {/* 1. 세분화 직군 선택 바 (15개 핵심 직군 원클릭 전환) */}
      <div className="rounded border border-line bg-raised/40 p-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-fg">
            ① 세분화 직군 선택 (메인·글·각색·콘티·3D·선화/밑색/명암/효과/식자 어시·PD)
          </span>
          <span
            data-testid="role-pipeline-permission-badge"
            className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-accent"
          >
            {rolePreset.permissionBadgeKo}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {SPECIALIST_ROLES_QUICK_LIST.map((item) => (
            <button
              key={item.roleId}
              type="button"
              data-testid={`role-pipeline-select-${item.roleId}`}
              onClick={() => setSelectedRoleId(item.roleId)}
              className={studioSegmentChipClass(selectedRoleId === item.roleId)}
            >
              {item.shortLabelKo}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 선택 직군 특화 메뉴·커맨드바 구성 & 친숙한 벤치마크 도구 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded border border-line bg-raised/40 p-2">
          <div className="font-bold text-fg">
            ② [{rolePreset.roleLabelKo}] 맞춤 메뉴 & 상단 커맨드바 구성
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {rolePreset.tailoredMenusKo.map((menu) => (
              <span
                key={menu}
                className="rounded border border-accent/40 bg-accent-soft/30 px-1.5 py-0.5 font-semibold text-fg"
              >
                {menu}
              </span>
            ))}
          </div>
          <div className="mt-1.5 font-mono text-[0.6rem] text-fg-2">
            추천 작업공간: [{rolePreset.workspaceId}] · 커맨드바 슬롯:{" "}
            {rolePreset.recommendedCommandBarSlots.join(" → ")}
          </div>
          <div className="mt-0.5 text-[0.6rem] text-fg-3">
            내재화된 벤치마크 도구: {rolePreset.familiarTools.join(" · ")}
          </div>
        </div>

        {/* 3. 레이어 그룹 RBAC 최소권한 가드 시뮬레이터 */}
        <div className="rounded border border-line bg-raised/40 p-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-fg">
              ③ 레이어 그룹 최소권한(RBAC) 보호 매트릭스 (총 18종)
            </span>
            <span
              data-testid="role-layer-guard-status"
              className={`rounded px-1.5 py-0.5 font-mono text-[0.6rem] font-bold ${
                layerGuard.allowed
                  ? "bg-success/15 text-success"
                  : "bg-danger/15 text-danger"
              }`}
            >
              {layerGuard.allowed ? "편집 허용 (Unlocked)" : "RBAC 잠금 차단 (Locked)"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {WEBTOON_CANONICAL_LAYER_GROUPS.map((group) => {
              const isAllowedForRole = rolePreset.allowedLayerGroups.includes(group.id);
              const isSelected = selectedLayerGroup === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  data-testid={`role-layer-chip-${group.id}`}
                  onClick={() => setSelectedLayerGroup(group.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold transition-colors ${
                    isSelected
                      ? "border-accent bg-accent text-on-accent"
                      : isAllowedForRole
                        ? "border-success/40 bg-success/10 text-fg"
                        : "border-line bg-panel text-fg-3 opacity-75"
                  }`}
                >
                  {isAllowedForRole ? "🔓" : "🔒"} {group.labelKo}
                </button>
              );
            })}
          </div>
          <p
            data-testid="role-layer-guard-reason"
            className="mt-1.5 font-mono text-[0.6rem] text-fg-2"
          >
            {layerGuard.reasonKo}
          </p>
        </div>
      </div>

      {/* 4. 8단계 엔드투엔드 웹툰 제작 파이프라인 & 원클릭 공정 인계 */}
      <div className="rounded border border-line bg-raised/40 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold text-fg">
              ④ 8단계 웹툰 분업 파이프라인 & 원클릭 다음 공정 인계 (Upstream 자동 잠금)
            </span>
            <span
              data-testid="role-pipeline-active-stage-label"
              className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-accent"
            >
              현재 공정: {activeStageSpec.labelKo}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="role-pipeline-handoff-btn"
              onClick={() => {
                const next = executeOneClickStageHandoff(handoffState, {
                  actorRoleId: selectedRoleId,
                });
                setHandoffState(next);
                setSelectedRoleId(next.activeAssigneeRoleId);
              }}
              className="rounded bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent hover:bg-accent/90"
            >
              {handoffState.isEpisodeApprovedFrozen
                ? "전 공정 최종 승인 동결 완료"
                : "현재 공정 완료 · 다음 직군으로 원클릭 인계 →"}
            </button>
            <button
              type="button"
              data-testid="role-pipeline-reset-btn"
              onClick={() => setHandoffState(createInitialRolePipelineHandoffState())}
              className="rounded border border-line bg-card px-2 py-1 text-[0.6rem] text-fg-2 hover:text-fg"
            >
              초기화
            </button>
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
          {WEBTOON_E2E_ROLE_PIPELINE_STAGES.map((stage) => {
            const isCurrent = stage.id === handoffState.activeStageId;
            return (
              <div
                key={stage.id}
                className={`rounded border p-1.5 text-[0.58rem] ${
                  isCurrent
                    ? "border-accent bg-accent-soft/35 font-bold text-fg"
                    : "border-line bg-card/70 text-fg-2"
                }`}
              >
                <div>{stage.labelKo}</div>
                <div className="mt-0.5 font-mono text-[0.55rem] text-fg-3">
                  레이어 {stage.ownedLayerGroups.length}종 · {stage.workspaceId}
                </div>
              </div>
            );
          })}
        </div>

        {handoffState.handoffHistory.length > 0 ? (
          <div
            data-testid="role-pipeline-handoff-log"
            className="mt-1.5 font-mono text-[0.58rem] text-fg-2"
          >
            최근 인계 기록:{" "}
            {handoffState.handoffHistory[handoffState.handoffHistory.length - 1]?.noteKo} (누적
            잠금 레이어 {handoffState.frozenLayerGroups.length}종)
          </div>
        ) : null}
      </div>
    </div>
  );
}
