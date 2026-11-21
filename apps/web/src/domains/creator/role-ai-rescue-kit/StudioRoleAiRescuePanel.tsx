import "./role-ai-rescue-kit.css";

import { Lock, Sparkles, Unlock, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { RESCUE_ENGINE_COST_KRW } from "./chore-rescue-ai-engine";
import {
  SEVEN_ROLE_PROFILES,
  calculateStudioTeamWeeklySavings,
  executeRoleAutopilot,
  getRoleProfile,
  toggleRoleStepManualLock,
  type RoleAutopilotRunResult,
  type WebtoonProductionRoleId,
} from "./seven-role-autopilot-engine";
import { StudioChoreRescueWorkbench } from "./StudioChoreRescueWorkbench";

function buildInitialRoleRuns(episodeCutCount: number): Readonly<Record<WebtoonProductionRoleId, RoleAutopilotRunResult>> {
  const entries = SEVEN_ROLE_PROFILES.map((profile) => [
    profile.roleId,
    executeRoleAutopilot({ roleId: profile.roleId, episodeCutCount }),
  ]);
  return Object.fromEntries(entries) as Record<WebtoonProductionRoleId, RoleAutopilotRunResult>;
}

/**
 * 웹툰 제작 7대 직군별 특화 AI 원클릭 자동화 · 6대 작가 노가다 박멸 AI 보정 스위트.
 */
export function StudioRoleAiRescuePanel() {
  const [selectedRoleId, setSelectedRoleId] = useState<WebtoonProductionRoleId>("lineart");
  const [episodeCutCount, setEpisodeCutCount] = useState<number>(64);
  const [lockedStepsByRole, setLockedStepsByRole] = useState<Readonly<Record<WebtoonProductionRoleId, readonly string[]>>>({
    writer: [],
    storyboard: [],
    lineart: [],
    bg3d: [],
    coloring: [],
    lettering: [],
    "pd-ad": [],
  });
  const [roleRuns, setRoleRuns] = useState<Readonly<Record<WebtoonProductionRoleId, RoleAutopilotRunResult>>>(() =>
    buildInitialRoleRuns(64),
  );
  const [roleRunNonce, setRoleRunNonce] = useState<number>(0);

  const activeRoleProfile = getRoleProfile(selectedRoleId);
  const activeRoleLocks = lockedStepsByRole[selectedRoleId];
  const activeRoleRun = roleRuns[selectedRoleId];

  const teamSavings = useMemo(
    () => calculateStudioTeamWeeklySavings(Object.values(roleRuns)),
    [roleRuns],
  );

  function handleRunActiveRoleAutopilot(
    nextRoleId: WebtoonProductionRoleId = selectedRoleId,
    nextCutCount: number = episodeCutCount,
    nextLocks: readonly string[] = lockedStepsByRole[nextRoleId],
  ) {
    const updated = executeRoleAutopilot({
      roleId: nextRoleId,
      episodeCutCount: nextCutCount,
      lockedStepIds: nextLocks,
    });
    setRoleRuns((prev) => ({ ...prev, [nextRoleId]: updated }));
    setRoleRunNonce((count) => count + 1);
  }

  function handleToggleStepLock(stepId: string) {
    const nextLocks = toggleRoleStepManualLock(activeRoleLocks, stepId);
    setLockedStepsByRole((prev) => ({ ...prev, [selectedRoleId]: nextLocks }));
    handleRunActiveRoleAutopilot(selectedRoleId, episodeCutCount, nextLocks);
  }

  function handleSelectRole(roleId: WebtoonProductionRoleId) {
    setSelectedRoleId(roleId);
    handleRunActiveRoleAutopilot(roleId, episodeCutCount, lockedStepsByRole[roleId]);
  }

  function handleCutCountChange(nextCount: number) {
    const safeCount = Number.isFinite(nextCount) ? Math.min(120, Math.max(30, Math.round(nextCount))) : 64;
    setEpisodeCutCount(safeCount);
    const recalculated = SEVEN_ROLE_PROFILES.map((profile) => [
      profile.roleId,
      executeRoleAutopilot({
        roleId: profile.roleId,
        episodeCutCount: safeCount,
        lockedStepIds: lockedStepsByRole[profile.roleId],
      }),
    ]);
    setRoleRuns(Object.fromEntries(recalculated) as Record<WebtoonProductionRoleId, RoleAutopilotRunResult>);
  }

  return (
    <section
      className="role-rescue-shell"
      data-testid="studio-role-ai-rescue-panel"
      aria-label="7대 직군별 특화 AI 자동화 및 6대 작가 노가다 박멸 보정 스위트"
    >
      <header className="role-rescue-header">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-fg">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              7대 직군별 AI 특화 자동화 · 6대 노가다 박멸 보정
            </h3>
            <span className="role-rescue-pill" data-tone="good">
              100% 무과금 ₩{RESCUE_ENGINE_COST_KRW} · 로컬 결정론 엔진
            </span>
          </div>
          <p className="text-xs leading-5 text-fg-2">
            직군을 고르면 원클릭 자동화와 주간 절감 시간을 즉시 계산합니다. 모든 보정은 수동 편집 레이어로 분리되며 잠근 단계는 덮어쓰지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="role-rescue-pill role-rescue-num" data-tone="cool" data-testid="team-weekly-savings-badge">
            7직군 합산 주 {teamSavings.totalWeeklySavedHours.toFixed(1)}시간 절감
          </span>
          <span className="role-rescue-pill role-rescue-num" data-testid="team-lock-summary-badge">
            월 약 {teamSavings.totalMonthlySavedHours.toFixed(1)}시간 · 잠금 {teamSavings.totalLockedStepCount}건
          </span>
        </div>
      </header>

      <div className="role-rescue-body">
        <section className="role-rescue-section" aria-label="7대 직군별 AI 워크벤치">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-fg">1. 웹툰 제작 7대 직군별 특화 AI 원클릭 자동화</h4>
              <p className="mt-0.5 text-xs text-fg-2">
                글작가 · 콘티 · 선화 · 배경3D · 채색 · 식자/번역 · PD/AD별 맞춤 자동 실행과 수동 오버라이드 잠금
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-fg-2">
              회차 컷 수
              <input
                type="number"
                min={30}
                max={120}
                step={2}
                value={episodeCutCount}
                onChange={(event) => handleCutCountChange(Number(event.target.value))}
                className="role-rescue-input role-rescue-num w-20"
                aria-label="회차 컷 수"
              />
            </label>
          </div>

          <div className="role-rescue-role-grid" role="group" aria-label="웹툰 제작 7대 직군 선택">
            {SEVEN_ROLE_PROFILES.map((profile) => {
              const selected = profile.roleId === selectedRoleId;
              const run = roleRuns[profile.roleId];
              return (
                <button
                  key={profile.roleId}
                  type="button"
                  className="role-rescue-chip"
                  data-testid={`role-chip-${profile.roleId}`}
                  aria-pressed={selected}
                  onClick={() => handleSelectRole(profile.roleId)}
                >
                  <span className="text-xs font-black text-fg">{profile.labelKo}</span>
                  <span className="text-[0.6875rem] text-fg-2">{profile.shortTagKo}</span>
                  <span className="role-rescue-num text-[0.6875rem] font-bold text-accent">
                    주 {run.estimatedWeeklySavedHours.toFixed(1)}시간 절감
                  </span>
                </button>
              );
            })}
          </div>

          <div className="role-rescue-card" data-testid="active-role-workbench">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-fg">
                  {activeRoleProfile.labelKo} 특화 AI 워크벤치
                  <span className="ml-2 role-rescue-pill role-rescue-num" data-tone="good" data-testid="active-role-saved-hours">
                    주 {activeRoleRun.estimatedWeeklySavedHours.toFixed(1)}시간 / 최대 {activeRoleRun.maxPossibleWeeklySavedHours.toFixed(1)}시간
                  </span>
                </p>
                <p className="mt-1 text-xs text-fg-2">{activeRoleProfile.focusKo}</p>
              </div>
              <button
                type="button"
                className="role-rescue-btn"
                data-variant="primary"
                data-testid="run-role-autopilot-btn"
                onClick={() => handleRunActiveRoleAutopilot()}
              >
                <Wand2 className="size-4" aria-hidden="true" />
                {activeRoleProfile.labelKo} 원클릭 자동화 실행
              </button>
            </div>

            <p className="text-xs font-semibold text-fg" role="status" data-testid="active-role-summary" data-run-nonce={roleRunNonce}>
              {activeRoleRun.deliverableSummaryKo}
            </p>

            <ul className="grid gap-2">
              {activeRoleRun.stepResults.map((step) => {
                const isLocked = step.status === "locked-manual";
                return (
                  <li
                    key={step.stepId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-2.5"
                    data-testid={`role-step-${step.stepId}`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-fg">{step.titleKo}</span>
                        <span className="role-rescue-pill role-rescue-num" data-tone={isLocked ? "warn" : "good"}>
                          {isLocked ? "수동 잠금 유지" : `자동 완료 · 주 ${step.savedHoursPerWeek.toFixed(1)}h`}
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-fg-2">{step.outputDetailKo}</p>
                    </div>
                    <button
                      type="button"
                      className="role-rescue-btn shrink-0"
                      data-lock="true"
                      data-testid={`lock-toggle-${step.stepId}`}
                      aria-pressed={isLocked}
                      onClick={() => handleToggleStepLock(step.stepId)}
                    >
                      {isLocked ? <Lock className="size-3.5" aria-hidden="true" /> : <Unlock className="size-3.5" aria-hidden="true" />}
                      {isLocked ? "수동 잠금 해제" : "수동 잠금"}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap gap-1.5">
              {activeRoleRun.metrics.highlightsKo.map((item) => (
                <span key={item} className="role-rescue-pill" data-tone="cool">
                  {item}
                </span>
              ))}
            </div>

            {activeRoleRun.metrics.endingHookOptions ? (
              <div className="rounded-xl border border-line bg-card p-2.5">
                <p className="text-xs font-bold text-fg">엔딩 훅 3안 비교</p>
                <ol className="mt-1 space-y-1 text-xs text-fg-2">
                  {activeRoleRun.metrics.endingHookOptions.map((hook) => (
                    <li key={hook}>{hook}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            {activeRoleRun.metrics.localizedLanguages ? (
              <div className="rounded-xl border border-line bg-card p-2.5">
                <p className="text-xs font-bold text-fg">
                  7개국어 현지화 · 일본 세로쓰기(타테가키) {activeRoleRun.metrics.japaneseVerticalReady ? "검증 통과" : "대기"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {activeRoleRun.metrics.localizedLanguages.map((lang) => (
                    <span key={lang} className="role-rescue-pill">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {activeRoleRun.metrics.platformSpecChecks ? (
              <div className="rounded-xl border border-line bg-card p-2.5" data-testid="pd-ad-platform-card">
                <p className="text-xs font-bold text-fg">
                  6대 플랫폼 규격 · 10분 대타 매칭({activeRoleRun.metrics.substituteMatchMinutes}분) · 화당 BEP{" "}
                  <span className="role-rescue-num">
                    {activeRoleRun.metrics.bepPerEpisodeKrw?.toLocaleString("ko-KR")}원 ({activeRoleRun.metrics.bepPaidUnlockCount?.toLocaleString("ko-KR")}건)
                  </span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {activeRoleRun.metrics.platformSpecChecks.map((spec) => (
                    <span key={spec.platformKo} className="role-rescue-pill role-rescue-num" data-tone="good">
                      {spec.platformKo} {spec.widthPx}px · {spec.statusKo}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <StudioChoreRescueWorkbench />
      </div>
    </section>
  );
}
