/**
 * 툰스튜디오 아카데미 · 멀티 직군 작업 특화 · 8단계 분업·거버넌스 통합 허브.
 *
 * 4개 탭 구성:
 * 1. `roles`: 12대 웹툰 풀 직군 멀티 복수 선택, Calm 8슬롯 도구 레일, 자동 레이어 스택,
 *    빈 직군 AI 팀원 자동 보완, 출고 전 체크리스트, 이주 단축키 프리셋(CSP/Procreate/Photoshop/입문)
 * 2. `pipeline`: 8단계 표준 분업 파이프라인 & 컷 단위 바통 터치·자동 검수 게이트
 * 3. `governance`: 7단계 규모별 워크스페이스·팀·클래스·연합 거버넌스, 6역할 RBAC, 외주 샌드박스, 정산·SLA 병목
 * 4. `academy`: 6단계 비주얼 스킬 트리, 8층 레이어 X-Ray 원고 해부실, 목적별 역색인 처방전 8종, 단축키 리듬 트레이너
 */

import "./academy-and-roles.css";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Keyboard,
  Layers,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  ACADEMY_ROLES_SPRITE_PATHS,
  CALM_TOOL_RAIL_BUDGET,
  MIGRATION_SHORTCUT_PRESETS,
  ROLE_COMBO_QUICK_PRESETS,
  STUDIO_CREATOR_ROLE_ORDER,
  STUDIO_CREATOR_ROLES,
  composeMultiRoleWorkspace,
  type ShortcutMigrationPresetId,
  type StudioCreatorRoleId,
} from "./studio-role-specialization-engine";
import { StudioPipelineGovernanceBoard } from "./StudioPipelineGovernanceBoard";
import {
  ACADEMY_SKILL_TRACKS,
  SHORTCUT_RHYTHM_DRILLS,
  XRAY_MANUSCRIPT_LAYERS,
  computeAcademySkillTreeProgress,
  evaluateShortcutRhythmDrill,
  searchGoalFirstRecipes,
  summarizeXrayLayerStack,
} from "./toonstudio-academy-curriculum";

export type AcademyRoleCraftTabId = "roles" | "pipeline" | "governance" | "academy";

export interface StudioAcademyAndRoleCraftHubProps {
  readonly initialTab?: AcademyRoleCraftTabId;
  readonly initialRoles?: readonly StudioCreatorRoleId[];
  readonly initialShortcutPresetId?: ShortcutMigrationPresetId;
}

const HUB_TABS: readonly {
  readonly id: AcademyRoleCraftTabId;
  readonly labelKo: string;
  readonly spritePath: string;
}[] = Object.freeze([
  { id: "roles", labelKo: "멀티 직군 특화", spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemStudio },
  { id: "pipeline", labelKo: "8단계 분업·바통터치", spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction },
  { id: "governance", labelKo: "스튜디오 거버넌스·정산", spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemBg3d },
  { id: "academy", labelKo: "아카데미 스킬트리·X-Ray", spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemGuideMap },
]);

const SHORTCUT_PRESET_ORDER: readonly ShortcutMigrationPresetId[] = Object.freeze([
  "csp",
  "procreate",
  "photoshop",
  "beginner",
]);

export function StudioAcademyAndRoleCraftHub({
  initialTab = "roles",
  initialRoles = ["storyboard", "lineart", "flatting"],
  initialShortcutPresetId = "csp",
}: StudioAcademyAndRoleCraftHubProps): ReactElement {
  const [activeTab, setActiveTab] = useState<AcademyRoleCraftTabId>(initialTab);

  // ── 탭 1: 12종 멀티 직군 특화 상태 ──
  const [selectedRoles, setSelectedRoles] = useState<readonly StudioCreatorRoleId[]>(initialRoles);
  const [shortcutPresetId, setShortcutPresetId] =
    useState<ShortcutMigrationPresetId>(initialShortcutPresetId);
  const [enableAiBackfill, setEnableAiBackfill] = useState(true);

  const workspace = useMemo(
    () =>
      composeMultiRoleWorkspace(selectedRoles, {
        shortcutPresetId,
        maxToolSlots: CALM_TOOL_RAIL_BUDGET,
        enableAiBackfill,
      }),
    [enableAiBackfill, selectedRoles, shortcutPresetId],
  );

  // ── 탭 4: 아카데미 스킬트리 · X-Ray · 역색인 처방전 · 리듬 트레이너 상태 ──
  const [completedTrackIds, setCompletedTrackIds] = useState<readonly string[]>([
    "track-1-first-cut",
  ]);
  const [visibleXrayIds, setVisibleXrayIds] = useState<readonly string[]>(() =>
    XRAY_MANUSCRIPT_LAYERS.map((layer) => layer.id),
  );
  const [recipeQuery, setRecipeQuery] = useState("");
  const [activeDrillId, setActiveDrillId] = useState<string>(SHORTCUT_RHYTHM_DRILLS[0]!.id);
  const [drillCompletedSteps, setDrillCompletedSteps] = useState(0);

  const skillProgress = useMemo(
    () => computeAcademySkillTreeProgress(completedTrackIds),
    [completedTrackIds],
  );
  const xraySummary = useMemo(() => summarizeXrayLayerStack(visibleXrayIds), [visibleXrayIds]);
  const matchedRecipes = useMemo(() => searchGoalFirstRecipes(recipeQuery), [recipeQuery]);
  const activeDrill =
    SHORTCUT_RHYTHM_DRILLS.find((drill) => drill.id === activeDrillId) ??
    SHORTCUT_RHYTHM_DRILLS[0]!;
  const rhythmEval = useMemo(
    () =>
      evaluateShortcutRhythmDrill(
        activeDrill.id,
        drillCompletedSteps,
        Math.max(1800, drillCompletedSteps * 650),
      ),
    [activeDrill.id, drillCompletedSteps],
  );

  const toggleRole = (roleId: StudioCreatorRoleId): void => {
    setSelectedRoles((current) => {
      if (current.includes(roleId)) {
        return current.length > 1 ? current.filter((id) => id !== roleId) : current;
      }
      return [...current, roleId];
    });
  };

  const toggleTrackComplete = (trackId: string): void => {
    setCompletedTrackIds((current) =>
      current.includes(trackId) ? current.filter((id) => id !== trackId) : [...current, trackId],
    );
  };

  const toggleXrayLayer = (layerId: string): void => {
    setVisibleXrayIds((current) =>
      current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId],
    );
  };

  return (
    <section
      data-testid="studio-academy-and-role-craft-hub"
      aria-labelledby="arc-hub-title"
      className="arc-shell"
    >
      {/* 상단 헤더 & 3종 핵심 엠블럼 스프라이트 */}
      <header className="arc-header">
        <div className="arc-header-brand">
          <div className="arc-emblem-stack" aria-hidden="true">
            <img
              src={ACADEMY_ROLES_SPRITE_PATHS.emblemStudio}
              alt=""
              width={44}
              height={44}
              className="arc-emblem"
            />
            <img
              src={ACADEMY_ROLES_SPRITE_PATHS.emblemProduction}
              alt=""
              width={44}
              height={44}
              className="arc-emblem"
            />
            <img
              src={ACADEMY_ROLES_SPRITE_PATHS.emblemGuideMap}
              alt=""
              width={44}
              height={44}
              className="arc-emblem"
            />
          </div>
          <div>
            <p className="arc-kicker">12대 풀 직군 · 8단계 바통 터치 · 7단계 거버넌스 · 아카데미 X-Ray</p>
            <h2 id="arc-hub-title" className="arc-title">
              툰스튜디오 멀티 직군 특화 · 스튜디오 협업 거버넌스 · 아카데미 허브
            </h2>
            <p className="arc-subtitle">
              1인 작가부터 동아리·학원 클래스·30인+ 에이전시·스튜디오 연합 룸까지, 맡은 직군을 복수 선택해 작업대를
              즉시 합성하고 8단계 분업·정산·스킬 트리를 한 화면에서 검증합니다.
            </p>
          </div>
        </div>
        <span className="arc-pill arc-pill-accent arc-num">
          선택 직군 {workspace.coverageSummary.humanRoleCount} / {workspace.coverageSummary.totalStudioRoles} · 도구{" "}
          {workspace.coverageSummary.railSlotsUsed} / {workspace.coverageSummary.railBudgetCap}
        </span>
      </header>

      {/* 4대 핵심 탭 */}
      <div className="arc-tablist" role="tablist" aria-label="아카데미 및 직군·협업 허브 탭">
        {HUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-testid={`arc-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="arc-tab"
          >
            <img src={tab.spritePath} alt="" width={24} height={24} aria-hidden="true" className="arc-sprite-sm" />
            <span>{tab.labelKo}</span>
          </button>
        ))}
      </div>

      {/* 탭 1: 멀티 직군 특화 */}
      {activeTab === "roles" ? (
        <div data-testid="arc-panel-roles" className="arc-grid-2">
          <article className="arc-card" style={{ gridColumn: "1 / -1" }}>
            <div className="arc-section-head">
              <div>
                <h3 className="arc-section-title">12대 웹툰 풀 직군 멀티 선택 합집합 조합기</h3>
                <p className="arc-meta">
                  맡고 있는 직군을 복수로 누르면 Calm 8슬롯 도구 레일, 기본 레이어 스택, 빈자리 AI 팀원, 출고 체크리스트가 즉시 재합성됩니다.
                </p>
              </div>
              <button
                type="button"
                aria-pressed={enableAiBackfill}
                onClick={() => setEnableAiBackfill((v) => !v)}
                className="arc-chip"
              >
                <Sparkles size={14} aria-hidden="true" />
                빈 직군 AI 보완 {enableAiBackfill ? "켜짐" : "꺼짐"}
              </button>
            </div>

            {/* 빠른 프리셋 조합 */}
            <div className="arc-chip-row" role="group" aria-label="직군 조합 빠른 프리셋">
              {ROLE_COMBO_QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedRoles(preset.roles)}
                  className="arc-btn"
                >
                  {preset.labelKo}
                </button>
              ))}
            </div>

            {/* 12대 직군 멀티 선택 칩 */}
            <div className="arc-chip-row" role="group" aria-label="12대 웹툰 직군 복수 선택">
              {STUDIO_CREATOR_ROLE_ORDER.map((roleId) => {
                const role = STUDIO_CREATOR_ROLES[roleId];
                const pressed = workspace.selectedRoles.includes(roleId);
                return (
                  <button
                    key={roleId}
                    type="button"
                    data-testid={`role-toggle-${roleId}`}
                    aria-pressed={pressed}
                    onClick={() => toggleRole(roleId)}
                    className="arc-chip"
                  >
                    <img src={role.spritePath} alt="" width={24} height={24} aria-hidden="true" className="arc-sprite-sm" />
                    <span>{role.labelKo}</span>
                  </button>
                );
              })}
            </div>
          </article>

          {/* Calm 8슬롯 우선 도구 레일 */}
          <article className="arc-card">
            <div className="arc-section-head">
              <h3 className="arc-section-title">우선 도구 레일 (Calm 8슬롯 예산)</h3>
              <span data-testid="role-rail-budget-badge" className="arc-pill arc-pill-good arc-num">
                {workspace.primaryToolRailSlots.length} / {workspace.maxToolSlots} 슬롯
              </span>
            </div>
            <div className="arc-rail-grid">
              {workspace.primaryToolRailSlots.map((slot) => (
                <div key={slot.id} className="arc-tool-slot">
                  <img src={slot.spritePath} alt="" width={34} height={34} aria-hidden="true" className="arc-sprite-md" />
                  <div style={{ minWidth: 0 }}>
                    <div><strong>{slot.labelKo}</strong></div>
                    <span className="arc-kbd">{slot.shortcutHint}</span>
                  </div>
                </div>
              ))}
            </div>
            {workspace.overflowToolSlots.length > 0 ? (
              <p className="arc-meta arc-num">
                초과 도구 {workspace.overflowToolSlots.length}개는 캔버스 82%+ 시야를 지키기 위해 보조 서랍으로 자동 정리했습니다.
              </p>
            ) : null}
          </article>

          {/* 이주 작가 단축키 프리셋 */}
          <article className="arc-card">
            <div className="arc-section-head">
              <h3 className="arc-section-title">이주 작가 단축키 프리셋</h3>
              <Keyboard size={16} aria-hidden="true" />
            </div>
            <div className="arc-chip-row" role="group" aria-label="단축키 이주 프리셋">
              {SHORTCUT_PRESET_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`shortcut-preset-${id}`}
                  aria-pressed={shortcutPresetId === id}
                  onClick={() => setShortcutPresetId(id)}
                  className="arc-chip"
                >
                  {MIGRATION_SHORTCUT_PRESETS[id].labelKo}
                </button>
              ))}
            </div>
            <p className="arc-meta">{workspace.shortcutPreset.muscleMemoryTipKo}</p>
            <p className="arc-meta">{workspace.shortcutPreset.conflictNoteKo}</p>
            <ul className="arc-list">
              {workspace.prioritizedShortcuts.slice(0, 5).map((item) => (
                <li key={item.actionKo} className="arc-subcard">
                  <div className="arc-section-head">
                    <span>{item.actionKo}</span>
                    <kbd className="arc-kbd">{item.keys}</kbd>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          {/* 자동 합성 기본 레이어 스택 */}
          <article className="arc-card">
            <div className="arc-section-head">
              <h3 className="arc-section-title">기본 레이어 스택 자동 합성</h3>
              <Layers size={16} aria-hidden="true" />
            </div>
            <ul className="arc-list">
              {workspace.synthesizedLayerStack.slice(0, 8).map((layer) => (
                <li key={layer.id} className="arc-subcard">
                  <div className="arc-section-head">
                    <strong className="arc-num">{layer.name}</strong>
                    <span
                      className={
                        layer.accessMode === "editable"
                          ? "arc-pill arc-pill-good"
                          : layer.accessMode === "ai-assisted"
                            ? "arc-pill arc-pill-accent"
                            : "arc-pill"
                      }
                    >
                      {layer.accessMode === "editable"
                        ? `${layer.ownerRoleLabelKo} 편집`
                        : layer.accessMode === "ai-assisted"
                          ? "AI 자동 보완"
                          : "참조 잠금"}
                    </span>
                  </div>
                  <p className="arc-meta">{layer.purposeKo}</p>
                </li>
              ))}
            </ul>
          </article>

          {/* 빈 직군 AI 팀원 자동 보완 + 출고 전 체크리스트 */}
          <article className="arc-card">
            <div className="arc-section-head">
              <h3 className="arc-section-title">빈 직군 AI 팀원 보완 & 출고 체크리스트</h3>
              <span className="arc-pill arc-pill-accent arc-num">
                AI 보완 {workspace.aiBackfillAssignments.length}직군 · 주당 약 {workspace.totalEstimatedWeeklySavedHours}h 절감
              </span>
            </div>
            <ul className="arc-list">
              {workspace.aiBackfillAssignments.slice(0, 4).map((ai) => (
                <li key={ai.roleId} className="arc-subcard">
                  <div className="arc-section-head">
                    <strong>{ai.partnerNameKo}</strong>
                    <span className="arc-pill arc-num">-{ai.estimatedWeeklySavedHours}h/주</span>
                  </div>
                  <p className="arc-meta">{ai.roleLabelKo} 공백 보완: {ai.scopeKo}</p>
                </li>
              ))}
            </ul>
            <div className="arc-subcard">
              <strong>출고 전 필수 게이트 ({workspace.preExportChecklist.length}항목)</strong>
              <ul className="arc-list">
                {workspace.preExportChecklist.slice(0, 5).map((item) => (
                  <li key={item.id} className="arc-meta">• {item.textKo}</li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      ) : null}

      {/* 탭 2: 8단계 분업·바통터치 */}
      {activeTab === "pipeline" ? <StudioPipelineGovernanceBoard mode="pipeline" /> : null}

      {/* 탭 3: 스튜디오 거버넌스·정산 */}
      {activeTab === "governance" ? <StudioPipelineGovernanceBoard mode="governance" /> : null}

      {/* 탭 4: 아카데미 스킬트리 · X-Ray · 역색인 처방전 · 단축키 리듬 트레이너 */}
      {activeTab === "academy" ? (
        <div data-testid="arc-panel-academy" className="arc-grid-2">
          {/* 6단계 비주얼 스킬 트리 */}
          <article className="arc-card" style={{ gridColumn: "1 / -1" }}>
            <div className="arc-section-head">
              <div>
                <h3 className="arc-section-title">툰스튜디오 아카데미 · 6단계 비주얼 스킬 트리</h3>
                <p className="arc-meta">
                  완료 진도 <strong className="arc-num">{skillProgress.completedCount} / {skillProgress.totalTracks}</strong> ({skillProgress.completionPercent}%) ·
                  잔여 예상 학습 <strong className="arc-num">{skillProgress.totalRemainingMinutes}분</strong>
                </p>
              </div>
              <span className="arc-pill arc-pill-good arc-num">{skillProgress.completionPercent}% 완주</span>
            </div>
            <div className="arc-progress-track" aria-hidden="true">
              <div className="arc-progress-fill" style={{ width: `${skillProgress.completionPercent}%` }} />
            </div>
            <div className="arc-grid-3">
              {ACADEMY_SKILL_TRACKS.map((track) => {
                const done = completedTrackIds.includes(track.id);
                const unlocked = skillProgress.unlockedTrackIds.includes(track.id);
                return (
                  <div key={track.id} className="arc-subcard">
                    <div className="arc-section-head">
                      <img src={track.spritePath} alt="" width={34} height={34} aria-hidden="true" className="arc-sprite-md" />
                      <button
                        type="button"
                        data-testid={`academy-track-toggle-${track.id}`}
                        aria-pressed={done}
                        onClick={() => toggleTrackComplete(track.id)}
                        className="arc-chip"
                      >
                        <CheckCircle2 size={14} aria-hidden="true" />
                        {done ? "완료됨" : unlocked ? "완료 표시" : "선행 권장"}
                      </button>
                    </div>
                    <strong>{track.titleKo}</strong>
                    <p className="arc-meta">{track.subtitleKo}</p>
                    <p className="arc-meta arc-num">약 {track.estimatedMinutes}분 · 해금: {track.unlockedCapabilityKo}</p>
                  </div>
                );
              })}
            </div>
          </article>

          {/* 8층 레이어 X-Ray 원고 해부실 */}
          <article className="arc-card" data-testid="academy-xray-lab">
            <div className="arc-section-head">
              <div>
                <h3 className="arc-section-title">8층 레이어 X-Ray 원고 해부실</h3>
                <p className="arc-meta">
                  레이어를 한 층씩 켜고 끄며 프로 연재 원고의 3D→선화→밑색→명암→FX→식자 구조를 직접 해부합니다.
                </p>
              </div>
              <span className="arc-pill arc-pill-accent arc-num">
                표시 {xraySummary.visibleCount} / {xraySummary.totalLayers}층
              </span>
            </div>
            <div className="arc-xray-stack">
              {XRAY_MANUSCRIPT_LAYERS.map((layer) => {
                const visible = visibleXrayIds.includes(layer.id);
                return (
                  <div key={layer.id} className="arc-xray-row" data-visible={visible}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: 1 }}>
                      <img src={layer.spritePath} alt="" width={28} height={28} aria-hidden="true" className="arc-sprite-sm" />
                      <div style={{ minWidth: 0 }}>
                        <div>
                          <strong className="arc-num">{layer.titleKo}</strong>{" "}
                          <span className="arc-pill">{layer.blendMode} · {layer.defaultOpacityPercent}%</span>
                        </div>
                        <p className="arc-meta">{layer.anatomyInsightKo}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`xray-toggle-${layer.id}`}
                      aria-pressed={visible}
                      onClick={() => toggleXrayLayer(layer.id)}
                      className="arc-btn"
                    >
                      {visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                      {visible ? "표시 중" : "숨김"}
                    </button>
                  </div>
                );
              })}
            </div>
          </article>

          {/* 목적별 역색인 처방전 8종 + 단축키 리듬 트레이너 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <article className="arc-card" data-testid="academy-goal-recipes">
              <div className="arc-section-head">
                <h3 className="arc-section-title">목적별 역색인 처방전 (8종)</h3>
                <Search size={16} aria-hidden="true" />
              </div>
              <input
                type="search"
                value={recipeQuery}
                onChange={(event) => setRecipeQuery(event.currentTarget.value)}
                aria-label="해결하고 싶은 작업 고민 검색"
                placeholder="예: 역광, 선화 틈새, 외주, 숏폼, 번역, CSP..."
                className="arc-input"
              />
              <ul className="arc-list">
                {matchedRecipes.slice(0, 4).map((recipe) => (
                  <li key={recipe.id} className="arc-subcard">
                    <div className="arc-section-head">
                      <strong>{recipe.goalQuestionKo}</strong>
                      <span className="arc-pill arc-pill-good arc-num">{recipe.estimatedMinutes}분 처방</span>
                    </div>
                    <p className="arc-meta">1) {recipe.stepsKo[0]} · 2) {recipe.stepsKo[1]}</p>
                    <p className="arc-meta">{recipe.instantResultKo}</p>
                  </li>
                ))}
              </ul>
            </article>

            <article className="arc-card" data-testid="academy-rhythm-trainer">
              <div className="arc-section-head">
                <h3 className="arc-section-title">단축키 리듬 트레이너 ({MIGRATION_SHORTCUT_PRESETS[shortcutPresetId].labelKo})</h3>
                <span className="arc-pill arc-pill-accent arc-num">
                  {rhythmEval.gradeKo} · {rhythmEval.completedSteps}/{rhythmEval.totalSteps}박자
                </span>
              </div>
              <div className="arc-chip-row" role="group" aria-label="리듬 드릴 선택">
                {SHORTCUT_RHYTHM_DRILLS.map((drill) => (
                  <button
                    key={drill.id}
                    type="button"
                    aria-pressed={activeDrill.id === drill.id}
                    onClick={() => {
                      setActiveDrillId(drill.id);
                      setDrillCompletedSteps(0);
                    }}
                    className="arc-chip"
                  >
                    {drill.titleKo}
                  </button>
                ))}
              </div>
              <p className="arc-meta">{activeDrill.focusKo} (목표 {activeDrill.targetBpm} BPM)</p>
              <div className="arc-grid-4">
                {activeDrill.steps.map((step) => {
                  const hit = step.order <= drillCompletedSteps;
                  return (
                    <button
                      key={step.order}
                      type="button"
                      aria-pressed={hit}
                      onClick={() => setDrillCompletedSteps(step.order)}
                      className="arc-chip"
                    >
                      <span className="arc-kbd">{step.keyByPreset[shortcutPresetId]}</span>
                      <span>{step.actionKo}</span>
                    </button>
                  );
                })}
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
