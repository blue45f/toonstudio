import { useMemo, useState } from "react";
import { ProductionPmsCastingQuotaViewSection } from "./ProductionPmsCastingQuotaViewSection";
import {
  WEBTOON_ASSISTANT_ROLE_CATALOG,
  calculateReverseEpisodeSchedule,
  detectStatusAutomationCycles,
  evaluateStatusAutomationRules,
  formatStudioHandoverFileName,
  shiftDependentAssistantTasks,
  simulateSerializationBufferHealth,
  validateStudioHandoverPackage,
  type AssistantCutTaskItem,
  type AssistantStageSpeedSpec,
  type StatusAutomationRule,
  type WebtoonAssistantRole,
} from "./production-pms-blueprint-model";

const INITIAL_ASSISTANT_TASKS: readonly AssistantCutTaskItem[] = [
  {
    id: "task-ep12-lineart",
    episodeNumber: 12,
    cutRangeLabel: "CUT001-020",
    cutCount: 20,
    role: "lineart",
    assigneeId: "asst-line-1",
    assigneeName: "김선화 어시",
    status: "wip",
    dueDateIso: "2026-10-27",
    dependencyTaskIds: [],
    latestFileName: "NORTH_EP012_CUT001-020_lineart_v02.clip",
    latestPreviewUrl: "https://cdn.toonstudio.io/previews/ep12-cut1-20-lineart-v2.png",
    inputFileName: "NORTH_EP012_CUT001-020_storyboard_v01.clip",
    inputPreviewUrl: null,
    readyForRole: null,
  },
  {
    id: "task-ep12-bg3d",
    episodeNumber: 12,
    cutRangeLabel: "CUT001-020",
    cutCount: 20,
    role: "background-3d",
    assigneeId: "asst-bg-1",
    assigneeName: "박배경 어시",
    status: "wip",
    dueDateIso: "2026-10-27",
    dependencyTaskIds: [],
    latestFileName: "NORTH_EP012_CUT001-020_background-3d_v01.cs3o",
    latestPreviewUrl: "https://cdn.toonstudio.io/previews/ep12-cut1-20-bg3d-v1.png",
    inputFileName: null,
    inputPreviewUrl: null,
    readyForRole: null,
  },
  {
    id: "task-ep12-flatting",
    episodeNumber: 12,
    cutRangeLabel: "CUT001-020",
    cutCount: 20,
    role: "flatting",
    assigneeId: "asst-flat-1",
    assigneeName: "이밑색 어시",
    status: "todo",
    dueDateIso: "2026-10-28",
    dependencyTaskIds: ["task-ep12-lineart"],
    latestFileName: null,
    latestPreviewUrl: null,
    inputFileName: null,
    inputPreviewUrl: null,
    readyForRole: null,
  },
  {
    id: "task-ep12-shading",
    episodeNumber: 12,
    cutRangeLabel: "CUT001-020",
    cutCount: 20,
    role: "shading",
    assigneeId: "asst-shade-1",
    assigneeName: "최명암 어시",
    status: "todo",
    dueDateIso: "2026-10-29",
    dependencyTaskIds: ["task-ep12-flatting", "task-ep12-bg3d"],
    latestFileName: null,
    latestPreviewUrl: null,
    inputFileName: null,
    inputPreviewUrl: null,
    readyForRole: null,
  },
  {
    id: "task-ep12-retouch",
    episodeNumber: 12,
    cutRangeLabel: "CUT001-020",
    cutCount: 20,
    role: "retouch-lettering",
    assigneeId: "asst-retouch-1",
    assigneeName: "정보정 어시",
    status: "todo",
    dueDateIso: "2026-10-30",
    dependencyTaskIds: ["task-ep12-shading"],
    latestFileName: null,
    latestPreviewUrl: null,
    inputFileName: null,
    inputPreviewUrl: null,
    readyForRole: null,
  },
];

const DEFAULT_AUTOMATION_RULES: readonly StatusAutomationRule[] = [
  {
    id: "rule-lineart-to-flatting",
    triggerMode: "status",
    sourceRole: "lineart",
    sourceTriggerStatus: "done",
    targetRole: "flatting",
    targetAppliedStatus: "ready",
    copyLatestPreview: true,
  },
  {
    id: "rule-flatting-to-shading",
    triggerMode: "status",
    sourceRole: "flatting",
    sourceTriggerStatus: "done",
    targetRole: "shading",
    targetAppliedStatus: "ready",
    copyLatestPreview: true,
  },
  {
    id: "rule-shading-to-retouch",
    triggerMode: "status",
    sourceRole: "shading",
    sourceTriggerStatus: "done",
    targetRole: "retouch-lettering",
    targetAppliedStatus: "ready",
    copyLatestPreview: true,
  },
];

const DEFAULT_STAGE_SPEED_SPECS: readonly AssistantStageSpeedSpec[] = [
  { role: "lineart", minutesPerCut: 20, dailyWorkHours: 8, stageOrderGroup: 1 },
  { role: "background-3d", minutesPerCut: 15, dailyWorkHours: 8, stageOrderGroup: 1 },
  { role: "flatting", minutesPerCut: 12, dailyWorkHours: 8, stageOrderGroup: 2 },
  { role: "shading", minutesPerCut: 22, dailyWorkHours: 8, stageOrderGroup: 3 },
  { role: "retouch-lettering", minutesPerCut: 10, dailyWorkHours: 8, stageOrderGroup: 4 },
];

export function ProductionPmsBlueprintSuite() {
  const [tasks, setTasks] = useState<readonly AssistantCutTaskItem[]>(INITIAL_ASSISTANT_TASKS);
  const [handoverRole, setHandoverRole] = useState<WebtoonAssistantRole>("lineart");
  const [handoverFileName, setHandoverFileName] = useState<string>(
    formatStudioHandoverFileName({
      workCode: "NORTH",
      episodeNumber: 12,
      cutStart: 1,
      cutEnd: 20,
      role: "lineart",
      version: 3,
      extension: "clip",
    }),
  );
  const [checkedChecklist, setCheckedChecklist] = useState<readonly string[]>(
    WEBTOON_ASSISTANT_ROLE_CATALOG.lineart.requiredChecklist,
  );
  const [automationNotice, setAutomationNotice] = useState<string | null>(null);

  const [releaseDateIso, setReleaseDateIso] = useState<string>("2026-11-06");
  const [episodeCutCount, setEpisodeCutCount] = useState<number>(60);
  const [includeWeekends, setIncludeWeekends] = useState<boolean>(false);
  const [savedBufferEpisodes, setSavedBufferEpisodes] = useState<number>(3);
  const [weeklyCapacityEpisodes, setWeeklyCapacityEpisodes] = useState<number>(0.8);

  const handoverValidation = useMemo(
    () =>
      validateStudioHandoverPackage({
        fileName: handoverFileName,
        expectedRole: handoverRole,
        latestExistingVersion: 2,
        checkedChecklistItems: checkedChecklist,
      }),
    [checkedChecklist, handoverFileName, handoverRole],
  );

  const cycleWarnings = useMemo(
    () => detectStatusAutomationCycles(DEFAULT_AUTOMATION_RULES),
    [],
  );

  const reverseSchedule = useMemo(
    () =>
      calculateReverseEpisodeSchedule({
        releaseDateIso,
        todayIso: "2026-10-26",
        cutCount: episodeCutCount,
        includeWeekends,
        stageSpecs: DEFAULT_STAGE_SPEED_SPECS,
      }),
    [episodeCutCount, includeWeekends, releaseDateIso],
  );

  const bufferSimulation = useMemo(
    () =>
      simulateSerializationBufferHealth({
        initialBufferEpisodes: savedBufferEpisodes,
        weeklyReleaseEpisodes: 1,
        weeklyTeamCapacityEpisodes: weeklyCapacityEpisodes,
        safetyThresholdEpisodes: 2,
        weeksToSimulate: 6,
      }),
    [savedBufferEpisodes, weeklyCapacityEpisodes],
  );

  const handleCompleteLineartWithAutomation = () => {
    const result = evaluateStatusAutomationRules({
      tasks,
      rules: DEFAULT_AUTOMATION_RULES,
      changedTaskId: "task-ep12-lineart",
      nextStatus: "done",
    });
    setTasks(result.updatedTasks);
    setAutomationNotice(
      result.handoffSummaries.join(" / ") || "선화 완료 처리됨 (후속 자동 전이 없음)",
    );
  };

  const handleShiftLineartDelay = () => {
    setTasks((prev) =>
      shiftDependentAssistantTasks({
        tasks: prev,
        anchorTaskId: "task-ep12-lineart",
        deltaDays: 2,
      }),
    );
    setAutomationNotice(
      "선화(task-ep12-lineart) 마감을 +2일 연기하고 종속된 밑색·명암·후보정 일정을 연쇄 이동했습니다.",
    );
  };

  return (
    <section
      aria-label="웹툰 스튜디오 다중 어시스턴트 블루프린트 및 제작 관리(PMS) 통합 스위트"
      data-testid="production-pms-blueprint-suite"
      className="mt-4 space-y-4 rounded-2xl border border-line bg-card p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div>
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
            Multi-Assistant Blueprint &amp; PMS Engine
          </p>
          <h3 className="mt-0.5 text-base font-black text-fg">
            어시스턴트 협업 파일 인계 · 맞춤 역산 캘린더 · 에셋 캐스팅 · 쿼터 · 노션형 다중 뷰 DB
          </h3>
          <p className="mt-0.5 text-xs text-fg-2">
            선화·밑색·명암·3D배경·후보정 분업 파일 네이밍 검증과 Kitsu형 상태 자동화, 툰메이트형 역산 스케줄러, 노션형 다중 뷰 롤업을 통합 지원합니다.
          </p>
        </div>
        <span
          data-testid="pms-automation-cycle-guard-badge"
          className="rounded-full border border-good/35 bg-good/10 px-2.5 py-1 text-[0.6875rem] font-bold text-good"
        >
          자동화 순환 참조 {cycleWarnings.length}건
        </span>
      </header>

      {automationNotice ? (
        <div
          role="status"
          data-testid="pms-automation-status-banner"
          className="rounded-xl border border-accent/35 bg-accent-soft px-3 py-2 text-xs font-semibold text-fg"
        >
          {automationNotice}
        </div>
      ) : null}

      {/* 1. 파일 인계 규칙 검증기 & Kitsu형 Status Automation */}
      <div className="grid gap-3 rounded-xl border border-line bg-panel p-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs font-bold text-fg">
              1. 어시스턴트 파일명·레이어 인계 검증기
            </strong>
            <span
              data-testid="handover-validation-badge"
              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${
                handoverValidation.valid
                  ? "bg-good/15 text-good"
                  : "bg-bad/15 text-bad"
              }`}
            >
              {handoverValidation.valid ? "인계 규격 통과" : "인계 규격 위반"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="인계 공정 역할 선택"
              data-testid="handover-role-select"
              value={handoverRole}
              onChange={(e) => {
                const nextRole = e.target.value as WebtoonAssistantRole;
                setHandoverRole(nextRole);
                setCheckedChecklist(WEBTOON_ASSISTANT_ROLE_CATALOG[nextRole].requiredChecklist);
              }}
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              {Object.values(WEBTOON_ASSISTANT_ROLE_CATALOG).map((meta) => (
                <option key={meta.role} value={meta.role}>
                  {meta.labelKo}
                </option>
              ))}
            </select>
            <input
              aria-label="인계 파일명 입력"
              data-testid="handover-filename-input"
              value={handoverFileName}
              onChange={(e) => setHandoverFileName(e.target.value)}
              className="min-w-60 flex-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg"
            />
          </div>
          {handoverValidation.errors.length > 0 ? (
            <ul
              data-testid="handover-error-list"
              className="list-disc pl-4 text-[0.6875rem] text-bad"
            >
              {handoverValidation.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}
          {handoverValidation.warnings.length > 0 ? (
            <ul
              data-testid="handover-warning-list"
              className="list-disc pl-4 text-[0.6875rem] text-warn"
            >
              {handoverValidation.warnings.map((warn) => (
                <li key={warn}>{warn}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-line pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs font-bold text-fg">
              Kitsu형 공정 상태 자동 전이 &amp; 프리뷰 자동 인계
            </strong>
            <button
              type="button"
              data-testid="trigger-lineart-done-automation-btn"
              onClick={handleCompleteLineartWithAutomation}
              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-on-accent"
            >
              선화 완료(done) → 밑색 자동 Ready + 파일 인계
            </button>
          </div>
          <p className="text-[0.6875rem] text-fg-2">
            선화 완료 시 후속 밑색 공정이 자동으로 <code>ready</code>로 바뀌며 선화 최신 <code>.clip</code> 파일과 프리뷰가 밑색 입력 슬롯에 자동 복사됩니다.
          </p>
        </div>
      </div>

      {/* 2. 툰메이트형 맞춤 자동 역산 캘린더 & 세이브 원고 버퍼 시뮬레이터 */}
      <div className="grid gap-3 rounded-xl border border-line bg-panel p-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs font-bold text-fg">
              2. 툰메이트형 연재 마감일 역산 자동 캘린더 (선화∥3D배경 병렬 반영)
            </strong>
            <span
              data-testid="reverse-schedule-kickoff-badge"
              className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-bold text-fg"
            >
              최소 착수일: {reverseSchedule.earliestKickoffDateIso} (총 {reverseSchedule.totalWorkDaysOnCriticalPath}영업일)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span>연재 마감:</span>
              <input
                type="date"
                aria-label="연재 마감일 입력"
                data-testid="reverse-release-date-input"
                value={releaseDateIso}
                onChange={(e) => setReleaseDateIso(e.target.value)}
                className="rounded border border-line bg-card px-2 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>회차 컷수:</span>
              <input
                type="number"
                aria-label="회차 컷수 입력"
                data-testid="reverse-cut-count-input"
                min={10}
                max={150}
                value={episodeCutCount}
                onChange={(e) => setEpisodeCutCount(Number(e.target.value) || 60)}
                className="w-16 rounded border border-line bg-card px-2 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={includeWeekends}
                onChange={(e) => setIncludeWeekends(e.target.checked)}
              />
              <span>주말 작업 포함</span>
            </label>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {reverseSchedule.stageSlots.map((slot) => (
              <div
                key={slot.role}
                data-testid={`reverse-slot-${slot.role}`}
                className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[0.6875rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>{slot.labelKo}</span>
                  <span>
                    {slot.requiredHours}h ({slot.requiredWorkDays}일)
                  </span>
                </div>
                <p className="text-fg-3">
                  {slot.startDateIso} ~ {slot.dueDateIso}{" "}
                  {slot.isCriticalPath ? "· 임계경로(Critical)" : "· 병렬여유"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-line pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs font-bold text-fg">
              세이브 원고 버퍼 소진 시뮬레이터 (6주 예측)
            </strong>
            <span
              data-testid="buffer-simulation-summary-badge"
              className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-bold text-fg"
            >
              {bufferSimulation.firstDepletedWeek
                ? `${bufferSimulation.firstDepletedWeek}주차 세이브 고갈 위험`
                : bufferSimulation.firstWarningWeek
                  ? `${bufferSimulation.firstWarningWeek}주차 안전선(2화) 하회`
                  : "6주간 세이브 안정"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <span>현재 세이브(화):</span>
              <input
                type="number"
                aria-label="현재 세이브 원고 수"
                data-testid="buffer-initial-input"
                min={0}
                max={20}
                value={savedBufferEpisodes}
                onChange={(e) => setSavedBufferEpisodes(Number(e.target.value) || 0)}
                className="w-14 rounded border border-line bg-card px-2 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>주간 팀 완성량(화):</span>
              <input
                type="number"
                step="0.1"
                aria-label="주간 팀 완성량"
                data-testid="buffer-capacity-input"
                value={weeklyCapacityEpisodes}
                onChange={(e) => setWeeklyCapacityEpisodes(Number(e.target.value) || 0.5)}
                className="w-16 rounded border border-line bg-card px-2 py-0.5 text-xs"
              />
            </label>
          </div>
          <div className="grid grid-cols-6 gap-1 text-center text-[0.6875rem]">
            {bufferSimulation.points.map((pt) => (
              <div
                key={pt.weekNumber}
                className="rounded border border-line bg-card p-1.5"
              >
                <div className="font-bold text-fg">{pt.weekNumber}주차</div>
                <div className="text-fg-2">{pt.remainingBufferEpisodes}화</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ProductionPmsCastingQuotaViewSection
        tasks={tasks}
        onShiftLineartDelay={handleShiftLineartDelay}
      />
    </section>
  );
}
