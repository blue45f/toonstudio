import "./ai-teammate-and-search.css";

import { Search, Sparkles, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { SmartAssetSearchTabPanel } from "./SmartAssetSearchTabPanel";
import {
  AI_TEAMMATE_ROSTER,
  TEAM_SCALE_PRESETS,
  assembleAiTeammateSquad,
  getTeamScalePreset,
  toggleHumanRoleAssignment,
  type AiTeammateApprovalMode,
  type AiTeammateAssignment,
  type CreatorPipelineRoleId,
  type CreatorTeamScaleId,
} from "./ai-teammate-roster-engine";
import {
  recommendContextualAssetsForCut,
  searchStudioAssetsSmart,
  type CameraAngleFilter,
  type PaletteMoodId,
  type RecommendedAssetBundle,
  type SketchStrokeHint,
  type StudioSmartAssetItem,
} from "./visual-asset-smart-search-engine";

export type AiTeammateSearchHubTab = "teammates" | "search";

export interface StudioAiTeammateAndAssetSearchHubProps {
  readonly initialTab?: AiTeammateSearchHubTab;
  readonly initialTeamScale?: CreatorTeamScaleId;
  readonly initialCutSceneText?: string;
  readonly onInsertAsset?: (asset: StudioSmartAssetItem) => void;
  readonly onApplyBundle?: (bundle: RecommendedAssetBundle) => void;
  readonly onAssignTeammateQueue?: (assignment: AiTeammateAssignment) => void;
}

export function StudioAiTeammateAndAssetSearchHub({
  initialTab = "teammates",
  initialTeamScale = "solo",
  initialCutSceneText = "비 오는 밤 옥상 난간 고백씬",
  onInsertAsset,
  onApplyBundle,
  onAssignTeammateQueue,
}: StudioAiTeammateAndAssetSearchHubProps = {}) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<AiTeammateSearchHubTab>(initialTab);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // ── 탭 1: 규모별 AI 팀원 군단 상태
  const [teamScale, setTeamScale] = useState<CreatorTeamScaleId>(initialTeamScale);
  const [humanRoles, setHumanRoles] = useState<readonly CreatorPipelineRoleId[]>(
    () => getTeamScalePreset(initialTeamScale).defaultHumanRoles,
  );
  const [approvalOverrides, setApprovalOverrides] = useState<
    Readonly<Partial<Record<CreatorPipelineRoleId, AiTeammateApprovalMode>>>
  >({});

  const squadPlan = useMemo(
    () =>
      assembleAiTeammateSquad({
        teamScale,
        humanRoles,
        approvalModeOverrides: approvalOverrides,
      }),
    [teamScale, humanRoles, approvalOverrides],
  );

  // ── 탭 2: 차세대 스마트 소재 검색 상태
  const [query, setQuery] = useState<string>("");
  const [sketchStrokeHint, setSketchStrokeHint] = useState<SketchStrokeHint | null>(null);
  const [paletteMood, setPaletteMood] = useState<PaletteMoodId | null>(null);
  const [cameraAngle, setCameraAngle] = useState<CameraAngleFilter | null>(null);
  const [commercialSafeOnly, setCommercialSafeOnly] = useState<boolean>(true);

  const searchResult = useMemo(
    () =>
      searchStudioAssetsSmart({
        query,
        sketchStrokeHint,
        paletteMood,
        cameraAngle,
        commercialSafeOnly,
      }),
    [query, sketchStrokeHint, paletteMood, cameraAngle, commercialSafeOnly],
  );

  const contextualRecommendation = useMemo(
    () =>
      recommendContextualAssetsForCut({
        sceneText: query.trim() || initialCutSceneText,
        paletteMood,
        cameraAngle,
        commercialSafeOnly,
        limit: 3,
      }),
    [query, initialCutSceneText, paletteMood, cameraAngle, commercialSafeOnly],
  );

  const handleSelectTeamScale = (nextScale: CreatorTeamScaleId) => {
    const preset = getTeamScalePreset(nextScale);
    setTeamScale(nextScale);
    setHumanRoles(preset.defaultHumanRoles);
    setApprovalOverrides({});
    setStatusMessage(
      `${preset.label}(${preset.headcountBadge}) 기준으로 빈 공정 AI 팀원 구성을 맞췄습니다.`,
    );
  };

  const handleToggleHumanRole = (roleId: CreatorPipelineRoleId, roleLabel: string) => {
    const currentlyHuman = humanRoles.includes(roleId);
    const nextRoles = toggleHumanRoleAssignment(humanRoles, roleId);
    setHumanRoles(nextRoles);
    setStatusMessage(
      currentlyHuman
        ? `'${roleLabel}' 공정이 비어 전담 AI 팀원이 자동으로 합류했습니다.`
        : `'${roleLabel}' 공정을 사람 담당으로 전환해 AI 팀원을 대기 상태로 옮겼습니다.`,
    );
  };

  const handleToggleApprovalMode = (assignment: AiTeammateAssignment) => {
    const nextMode: AiTeammateApprovalMode =
      assignment.approvalMode === "auto-draft" ? "review-first" : "auto-draft";
    setApprovalOverrides((prev) => ({ ...prev, [assignment.roleId]: nextMode }));
    setStatusMessage(
      `${assignment.persona.personaName} 승인 모드를 ${
        nextMode === "auto-draft" ? "자동 초안" : "검토 우선"
      }으로 변경했습니다.`,
    );
  };

  const handleRunQueue = (assignment: AiTeammateAssignment) => {
    onAssignTeammateQueue?.(assignment);
    setStatusMessage(
      `${assignment.persona.personaName} 작업 큐 ${assignment.queue.length}건을 준비했습니다.`,
    );
  };

  const handleInsertAsset = (asset: StudioSmartAssetItem) => {
    onInsertAsset?.(asset);
    setStatusMessage(`'${asset.title}' 소재를 현재 컷에 삽입 요청했습니다.`);
  };

  const handleApplyBundle = (bundle: RecommendedAssetBundle) => {
    onApplyBundle?.(bundle);
    setStatusMessage(
      `'${bundle.bundleName}' 세트(${bundle.items.length}종)를 일괄 삽입 요청했습니다.`,
    );
  };

  const handleResetSearchFilters = () => {
    setQuery("");
    setSketchStrokeHint(null);
    setPaletteMood(null);
    setCameraAngle(null);
    setCommercialSafeOnly(true);
    setStatusMessage("스마트 소재 검색 필터를 기본(상업 안전 BOM)으로 초기화했습니다.");
  };

  const teammatesTabId = `${baseId}-tab-teammates`;
  const searchTabId = `${baseId}-tab-search`;
  const teammatesPanelId = `${baseId}-panel-teammates`;
  const searchPanelId = `${baseId}-panel-search`;
  const searchInputId = `${baseId}-smart-search-input`;

  return (
    <section
      className="ats-hub"
      aria-label="AI 팀원 군단 및 스마트 소재 검색 허브"
      data-testid="studio-ai-teammate-search-hub"
    >
      <header className="ats-header">
        <div>
          <p className="ats-eyebrow">
            <Sparkles className="size-4" aria-hidden="true" />
            TOONSTUDIO AI SQUAD · SMART ASSET KERNEL
          </p>
          <h2 className="ats-title">규모별 AI 팀원 로스터 &amp; 차세대 소재 검색 허브</h2>
          <p className="ats-subtitle">
            인원수에 따라 비어 있는 공정에만 전담 AI 보조작가를 배치하고, 자연어·실루엣·색감·앵글·권리 BOM으로 소재를 바로 찾습니다.
          </p>
        </div>
        <div className="ats-chip-row">
          <span className="ats-badge" data-tone="accent">
            AI 투입 <span className="ats-num">{squadPlan.aiCoverageCount}</span>/6
          </span>
          <span className="ats-badge" data-tone="good">
            상업 안전 소재 <span className="ats-num">{searchResult.hits.length}</span>건
          </span>
        </div>
      </header>

      <div className="ats-tablist" role="tablist" aria-label="허브 작업 영역 선택">
        <button
          id={teammatesTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === "teammates"}
          aria-controls={teammatesPanelId}
          className="ats-tab"
          onClick={() => setActiveTab("teammates")}
        >
          <Users className="size-4" aria-hidden="true" />
          <span>AI 팀원 군단</span>
          <span className="ats-badge ats-num">{squadPlan.aiCoverageCount}명</span>
        </button>
        <button
          id={searchTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === "search"}
          aria-controls={searchPanelId}
          className="ats-tab"
          onClick={() => setActiveTab("search")}
        >
          <Search className="size-4" aria-hidden="true" />
          <span>스마트 소재 검색</span>
          <span className="ats-badge ats-num">{searchResult.hits.length}건</span>
        </button>
      </div>

      {activeTab === "teammates" ? (
        <div
          id={teammatesPanelId}
          role="tabpanel"
          aria-labelledby={teammatesTabId}
          className="ats-section"
        >
          <div className="ats-panel-block">
            <div>
              <h3 className="ats-block-title">1. 창작 인원수 선택</h3>
              <p className="ats-block-caption">{squadPlan.preset.description}</p>
            </div>
            <div className="ats-scale-grid" role="group" aria-label="창작 인원수 선택">
              {TEAM_SCALE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="ats-scale-btn"
                  aria-pressed={teamScale === preset.id}
                  onClick={() => handleSelectTeamScale(preset.id)}
                >
                  <span className="ats-scale-head ats-num">
                    {preset.headcountBadge} · {preset.label}
                  </span>
                  <span className="ats-scale-sub">{preset.workflowModeLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ats-panel-block">
            <div>
              <h3 className="ats-block-title">2. 사람이 직접 맡는 공정 토글</h3>
              <p className="ats-block-caption">
                체크 해제된 빈 공정에만 전담 AI 팀원이 자동으로 투입됩니다.
              </p>
            </div>
            <div className="ats-chip-row" role="group" aria-label="사람 담당 공정 선택">
              {AI_TEAMMATE_ROSTER.map((persona) => {
                const isHumanOwned = humanRoles.includes(persona.roleId);
                return (
                  <button
                    key={persona.roleId}
                    type="button"
                    className="ats-chip"
                    aria-pressed={isHumanOwned}
                    onClick={() => handleToggleHumanRole(persona.roleId, persona.roleLabel)}
                  >
                    <span>{persona.roleLabel}</span>
                    <span className="ats-badge" data-tone={isHumanOwned ? "good" : "accent"}>
                      {isHumanOwned ? "사람 담당" : "AI 투입"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ats-kpi-grid" aria-label="AI 팀원 배정 요약">
            <div className="ats-kpi-card">
              <div className="ats-kpi-label">사람 담당 공정</div>
              <div className="ats-kpi-value ats-num">{squadPlan.humanCoverageCount} / 6 공정</div>
            </div>
            <div className="ats-kpi-card">
              <div className="ats-kpi-label">빈 공정 AI 투입</div>
              <div className="ats-kpi-value ats-num">{squadPlan.aiCoverageCount}명 자동 합류</div>
            </div>
            <div className="ats-kpi-card">
              <div className="ats-kpi-label">배정 작업 큐</div>
              <div className="ats-kpi-value ats-num">{squadPlan.totalQueueTaskCount}건 대기</div>
            </div>
            <div className="ats-kpi-card">
              <div className="ats-kpi-label">회당 예상 단축(추정)</div>
              <div className="ats-kpi-value ats-num">
                약 {squadPlan.totalEstimatedHoursSaved.toFixed(1)}시간
              </div>
            </div>
          </div>

          <div>
            <h3 className="ats-block-title">{squadPlan.headlineSummary}</h3>
          </div>

          {squadPlan.deployedTeammates.length === 0 ? (
            <div className="ats-panel-block">
              <p className="ats-block-title">모든 공정을 사람이 직접 맡고 있습니다</p>
              <p className="ats-block-caption">
                위에서 사람 담당 공정을 하나라도 해제하면 해당 빈 자리에 전담 AI 보조작가가 바로 합류합니다.
              </p>
            </div>
          ) : (
            <div className="ats-card-grid" data-testid="deployed-ai-teammates-grid">
              {squadPlan.deployedTeammates.map((assignment) => (
                <article
                  key={assignment.persona.id}
                  className="ats-teammate-card"
                  data-tone={assignment.persona.accentTone}
                  data-teammate-role={assignment.roleId}
                >
                  <div className="ats-teammate-head">
                    <div className="ats-sprite-frame">
                      <img
                        src={assignment.persona.spritePath}
                        alt=""
                        aria-hidden="true"
                        width={40}
                        height={40}
                        className="ats-sprite-img"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="m-0 text-sm font-extrabold text-fg">
                          {assignment.persona.personaName}
                        </h4>
                        <span className="ats-badge" data-tone="accent">
                          {assignment.persona.codename}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fg-2">{assignment.persona.summary}</p>
                    </div>
                  </div>

                  <div className="ats-chip-row">
                    <span
                      className="ats-badge"
                      data-tone={assignment.approvalMode === "auto-draft" ? "good" : "warn"}
                    >
                      {assignment.approvalMode === "auto-draft" ? "자동 초안" : "검토 우선"}
                    </span>
                    <span className="ats-badge ats-num">
                      예상 -{assignment.estimatedHoursSaved.toFixed(1)}시간
                    </span>
                  </div>

                  <ul
                    className="ats-queue-list"
                    aria-label={`${assignment.persona.personaName} 작업 큐`}
                  >
                    {assignment.queue.map((task) => (
                      <li key={task.id} className="ats-queue-item">
                        <span>{task.title}</span>
                        <span className="ats-num shrink-0 text-fg-2">
                          -{task.estimatedMinutesSaved}분
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="ats-card-actions">
                    <button
                      type="button"
                      className="ats-btn"
                      onClick={() => handleToggleApprovalMode(assignment)}
                    >
                      {assignment.approvalMode === "auto-draft"
                        ? "검토 우선으로 전환"
                        : "자동 초안으로 전환"}
                    </button>
                    <button
                      type="button"
                      className="ats-btn ats-btn-primary"
                      onClick={() => handleRunQueue(assignment)}
                    >
                      작업 큐 실행
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <SmartAssetSearchTabPanel
          panelId={searchPanelId}
          labelledById={searchTabId}
          searchInputId={searchInputId}
          query={query}
          sketchStrokeHint={sketchStrokeHint}
          paletteMood={paletteMood}
          cameraAngle={cameraAngle}
          commercialSafeOnly={commercialSafeOnly}
          searchResult={searchResult}
          contextualRecommendation={contextualRecommendation}
          onQueryChange={setQuery}
          onToggleSketchHint={(hint) =>
            setSketchStrokeHint((prev) => (prev === hint ? null : hint))
          }
          onTogglePaletteMood={(mood) =>
            setPaletteMood((prev) => (prev === mood ? null : mood))
          }
          onToggleCameraAngle={(angle) =>
            setCameraAngle((prev) => (prev === angle ? null : angle))
          }
          onToggleCommercialSafe={() => setCommercialSafeOnly((prev) => !prev)}
          onResetFilters={handleResetSearchFilters}
          onInsertAsset={handleInsertAsset}
          onApplyBundle={handleApplyBundle}
        />
      )}

      {statusMessage ? (
        <p role="status" aria-live="polite" className="ats-status-bar">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
