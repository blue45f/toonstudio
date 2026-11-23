/**
 * 탭 3: 맥락 인식 30초 인터랙티브 미션 가이드 · 무언(無言) 시각 코치마크 · 검색형 단축키/제스처 시뮬레이터 패널.
 */

import { useMemo, useState } from "react";

import {
  advanceInteractiveMissionStep,
  createInteractiveMissionProgress,
  resolveContextualGuideHint,
  searchInteractiveShortcutGuide,
  simulateShortcutOrGestureAction,
  STUDIO_INTERACTIVE_MISSIONS,
  type ShortcutPlatformFilter,
  type ShortcutSimulationFeedback,
  type StudioGuideMissionId,
  type StudioGuidePageContext,
} from "./interactive-guide-mission-engine";

export interface InteractiveGuideMissionTabPanelProps {
  readonly onNotify?: (message: string) => void;
}

const CONTEXT_PAGES: readonly { readonly page: StudioGuidePageContext; readonly labelKo: string }[] = [
  { page: "studio-canvas", labelKo: "드로잉 캔버스" },
  { page: "bg3d-stage", labelKo: "3D 배경 스테이지" },
  { page: "vrm-character", labelKo: "VRM 캐릭터·소품" },
  { page: "remotion-shorts", labelKo: "Remotion 숏폼" },
  { page: "multidevice-hub", labelKo: "멀티 디바이스" },
];

const PLATFORM_FILTERS: readonly { readonly value: ShortcutPlatformFilter; readonly labelKo: string }[] = [
  { value: "all", labelKo: "전체 기기" },
  { value: "desktop", labelKo: "데스크톱" },
  { value: "touch-ipad", labelKo: "터치·아이패드" },
  { value: "wearable-tv", labelKo: "워치·스마트TV" },
];

const VISUAL_CUE_LABELS: Readonly<Record<string, string>> = {
  "pulse-target": "대상 버튼 맥박 강조",
  "drag-arc": "궤적 곡선 시연",
  "snap-magnet": "자석 밀착 스냅",
  "timeline-scrub": "타임라인 비트 스크럽",
  "pair-radar": "로컬 페어링 레이더",
};

export function InteractiveGuideMissionTabPanel({
  onNotify,
}: InteractiveGuideMissionTabPanelProps) {
  const [selectedMissionId, setSelectedMissionId] = useState<StudioGuideMissionId>("beginner-first-cut");
  const [completedStepIds, setCompletedStepIds] = useState<readonly string[]>([]);
  const [contextPage, setContextPage] = useState<StudioGuidePageContext>("studio-canvas");
  const [dismissedHintIds, setDismissedHintIds] = useState<readonly string[]>([]);

  const [shortcutQuery, setShortcutQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<ShortcutPlatformFilter>("all");
  const [bindingMode, setBindingMode] = useState<"mac" | "windows" | "touch">("mac");
  const [simulationFeedback, setSimulationFeedback] = useState<ShortcutSimulationFeedback | null>(null);

  const selectedMission = useMemo(
    () =>
      STUDIO_INTERACTIVE_MISSIONS.find((item) => item.id === selectedMissionId) ??
      STUDIO_INTERACTIVE_MISSIONS[0],
    [selectedMissionId],
  );

  const missionProgress = useMemo(
    () => createInteractiveMissionProgress(selectedMissionId, completedStepIds),
    [completedStepIds, selectedMissionId],
  );

  const contextualHint = useMemo(
    () =>
      resolveContextualGuideHint({
        currentPage: contextPage,
        completedStepIds,
        dismissedHintIds,
      }),
    [completedStepIds, contextPage, dismissedHintIds],
  );

  const filteredShortcuts = useMemo(
    () => searchInteractiveShortcutGuide(shortcutQuery, platformFilter, "all"),
    [platformFilter, shortcutQuery],
  );

  const handleCompleteStep = (stepId?: string) => {
    const next = advanceInteractiveMissionStep(missionProgress, stepId);
    setCompletedStepIds((prev) => Array.from(new Set([...prev, ...next.completedStepIds])));
    onNotify?.(
      next.isComplete
        ? `${selectedMission?.titleKo ?? "체험 미션"} 3단계를 모두 마쳤습니다.`
        : `미션 진행률 ${next.completionPercent}% — 다음 단계로 넘어갔습니다.`,
    );
  };

  return (
    <div className="img-hub-grid" data-testid="interactive-guide-mission-panel">
      <div className="img-hub-grid img-hub-grid-2">
        <section className="img-hub-card" aria-labelledby="mission-heading">
          <div className="img-hub-section-head">
            <h3 id="mission-heading" className="img-hub-section-title">
              <img
                src="/assets/studio/vibrant-sprites/emblem-guide-map.webp"
                alt=""
                aria-hidden="true"
                className="img-hub-sprite-img"
              />
              5대 30초 체험 미션 (각 3단계)
            </h3>
            <span className="img-hub-badge img-hub-num" data-tone={missionProgress.isComplete ? "good" : "cool"}>
              {missionProgress.completionPercent}% · 남은 약 {missionProgress.remainingSecondsEstimate}초
            </span>
          </div>

          <div className="img-hub-pill-row" role="group" aria-label="30초 체험 미션 목록">
            {STUDIO_INTERACTIVE_MISSIONS.map((mission) => (
              <button
                key={mission.id}
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={mission.id === selectedMissionId}
                onClick={() => {
                  setSelectedMissionId(mission.id);
                  setContextPage(mission.pageContext);
                }}
              >
                <img src={mission.spritePath} alt="" aria-hidden="true" className="img-hub-sprite-img" />
                <span>{mission.badgeKo}</span>
              </button>
            ))}
          </div>

          {selectedMission ? (
            <>
              <div className="img-hub-subcard">
                <strong className="text-sm font-bold text-fg">{selectedMission.titleKo}</strong>
                <p className="img-hub-muted">{selectedMission.goalOutcomeKo}</p>
                <div className="img-hub-progress-track">
                  <div
                    className="img-hub-progress-fill"
                    style={{ width: `${missionProgress.completionPercent}%` }}
                  />
                </div>
              </div>

              <ol className="img-hub-step-list">
                {selectedMission.steps.map((step) => {
                  const done = missionProgress.completedStepIds.includes(step.id);
                  return (
                    <li key={step.id} className="img-hub-step-item" data-step-done={done}>
                      <div>
                        <strong className="text-sm font-bold text-fg">
                          {step.order}단계 · {step.titleKo}
                        </strong>
                        <p className="img-hub-muted">{step.microCueKo}</p>
                      </div>
                      <div className="img-hub-pill-row">
                        <span className="img-hub-kbd">{step.shortcutBadge}</span>
                        <span className="img-hub-badge">{VISUAL_CUE_LABELS[step.visualCue] ?? step.visualCue}</span>
                        <button
                          type="button"
                          className={done ? "img-hub-btn" : "img-hub-btn img-hub-btn-primary"}
                          onClick={() => handleCompleteStep(step.id)}
                        >
                          {done ? "완료됨" : "이 단계 체험"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="img-hub-pill-row">
                <button
                  type="button"
                  className="img-hub-btn img-hub-btn-primary"
                  disabled={missionProgress.isComplete}
                  onClick={() => handleCompleteStep()}
                >
                  {missionProgress.isComplete ? "30초 미션 완주 완료" : "다음 단계 바로 실행"}
                </button>
                <button
                  type="button"
                  className="img-hub-btn"
                  onClick={() => {
                    const stepIdsToClear = new Set(selectedMission.steps.map((s) => s.id));
                    setCompletedStepIds((prev) => prev.filter((id) => !stepIdsToClear.has(id)));
                    setDismissedHintIds([]);
                  }}
                >
                  미션 다시 체험
                </button>
              </div>
            </>
          ) : null}
        </section>

        <section className="img-hub-card" aria-labelledby="coachmark-heading">
          <div className="img-hub-section-head">
            <h3 id="coachmark-heading" className="img-hub-section-title">
              맥락 인식 단일 코치마크 (딱 1개 힌트)
            </h3>
            <span className="img-hub-badge" data-tone="good">무언 시각 시연</span>
          </div>

          <p className="img-hub-muted">
            현재 열린 페이지와 도구에 맞춰 화면을 가리지 않는 단 1개의 시각 힌트만 띄웁니다.
          </p>

          <div className="img-hub-pill-row" role="group" aria-label="시뮬레이션 페이지 맥락">
            {CONTEXT_PAGES.map((item) => (
              <button
                key={item.page}
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={contextPage === item.page}
                onClick={() => setContextPage(item.page)}
              >
                {item.labelKo}
              </button>
            ))}
          </div>

          {contextualHint ? (
            <div className="img-hub-coachmark" data-testid="contextual-single-coachmark">
              <div className="img-hub-section-head">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-fg">
                  <span className="img-hub-pulse-dot" aria-hidden="true" />
                  <img
                    src={contextualHint.spritePath}
                    alt=""
                    aria-hidden="true"
                    className="img-hub-sprite-img"
                  />
                  {contextualHint.headlineKo}
                </span>
                <span className="img-hub-kbd">{contextualHint.shortcutBadge}</span>
              </div>
              <p className="img-hub-muted">{contextualHint.microCueKo}</p>
              <div className="img-hub-pill-row">
                <span className="img-hub-badge">
                  시각 큐: {VISUAL_CUE_LABELS[contextualHint.visualCue] ?? contextualHint.visualCue}
                </span>
                <span className="img-hub-badge img-hub-num">약 {contextualHint.estimatedSeconds}초</span>
              </div>
              <div className="img-hub-pill-row">
                <button
                  type="button"
                  className="img-hub-btn img-hub-btn-primary"
                  onClick={() => handleCompleteStep(contextualHint.stepId)}
                >
                  힌트 따라 완료
                </button>
                <button
                  type="button"
                  className="img-hub-btn"
                  onClick={() => setDismissedHintIds((prev) => [...prev, contextualHint.hintId])}
                >
                  이 힌트 닫기
                </button>
              </div>
            </div>
          ) : (
            <div className="img-hub-subcard" data-testid="contextual-coachmark-empty">
              <strong className="text-sm font-bold text-fg">현재 페이지의 모든 시각 힌트를 마쳤습니다.</strong>
              <p className="img-hub-muted">방해되는 안내 없이 캔버스에 온전히 집중할 수 있습니다.</p>
            </div>
          )}
        </section>
      </div>

      <section className="img-hub-card" aria-labelledby="shortcut-sim-heading">
        <div className="img-hub-section-head">
          <h3 id="shortcut-sim-heading" className="img-hub-section-title">
            검색형 인터랙티브 단축키 · 제스처 시뮬레이터
          </h3>
          <span className="img-hub-badge img-hub-num">{filteredShortcuts.length}개 항목</span>
        </div>

        <div className="img-hub-grid img-hub-grid-2">
          <label className="text-xs font-bold text-fg-2">
            단축키·제스처 검색 (예: 붓, 실행취소, 3D, 워치, 2지)
            <input
              type="search"
              className="img-hub-input mt-1"
              value={shortcutQuery}
              placeholder="키워드나 단축키를 입력하세요"
              onChange={(event) => setShortcutQuery(event.target.value)}
            />
          </label>
          <div className="flex flex-col gap-2">
            <div className="img-hub-pill-row" role="group" aria-label="기기 필터">
              {PLATFORM_FILTERS.map((pf) => (
                <button
                  key={pf.value}
                  type="button"
                  className="img-hub-pill-btn"
                  aria-pressed={platformFilter === pf.value}
                  onClick={() => setPlatformFilter(pf.value)}
                >
                  {pf.labelKo}
                </button>
              ))}
            </div>
            <div className="img-hub-pill-row" role="group" aria-label="표시 바인딩 기준">
              {(["mac", "windows", "touch"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="img-hub-pill-btn"
                  aria-pressed={bindingMode === mode}
                  onClick={() => setBindingMode(mode)}
                >
                  {mode === "mac" ? "macOS 키" : mode === "windows" ? "Windows 키" : "터치·제스처"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {simulationFeedback ? (
          <div className="img-hub-coachmark" role="status" data-testid="shortcut-simulation-banner">
            <div className="img-hub-section-head">
              <strong className="text-sm font-bold text-fg">
                시연 실행: {simulationFeedback.titleKo} ({simulationFeedback.executedBindingLabel})
              </strong>
              <span className="img-hub-badge" data-tone="good">
                {simulationFeedback.latencyLabelKo}
              </span>
            </div>
            <p className="img-hub-muted">{simulationFeedback.canvasReactionKo}</p>
          </div>
        ) : null}

        <ul className="img-hub-step-list">
          {filteredShortcuts.map((entry) => {
            const combo =
              bindingMode === "touch"
                ? entry.gestureCueKo
                : bindingMode === "windows"
                  ? entry.winCombo
                  : entry.macCombo;
            return (
              <li key={entry.id} className="img-hub-step-item">
                <div>
                  <strong className="text-sm font-bold text-fg">{entry.titleKo}</strong>
                  <p className="img-hub-muted">{entry.effectSummaryKo}</p>
                </div>
                <div className="img-hub-pill-row">
                  <span className="img-hub-kbd">{combo}</span>
                  <button
                    type="button"
                    className="img-hub-btn"
                    onClick={() => {
                      const feedback = simulateShortcutOrGestureAction(entry.id, bindingMode);
                      setSimulationFeedback(feedback);
                      if (feedback) onNotify?.(`${feedback.titleKo} 시연을 실행했습니다.`);
                    }}
                  >
                    지금 시연
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
