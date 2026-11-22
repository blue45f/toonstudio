import "./hiatus-shield-os.css";

import {
  AlertTriangle,
  Clock,
  HeartPulse,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  assessBufferAndBurnoutRisk,
  buildStyleLockHandoffKit,
  createInitialHiatusShieldState,
  createStarterWeeklyVelocitySamples,
  declareMemberAbsenceAndReleaseSlices,
  evaluateHiatusCoachingSurface,
  forecastThreeWeekHiatusRisk,
  generateEmergencyDefenseScenarios,
  rankEmergencyStandbyArtists,
  splitBottleneckSliceIntoMicroSlices,
  transferSliceLeaseToStandby,
  verifyCutCoverageInvariant,
  type AbsenceReason,
  type BufferHealthTier,
  type DefenseScenarioCode,
  type DeterministicLocalClock,
  type HiatusShieldStudioState,
  type MicroSliceAssignee,
  type RankedStandbyMatch,
  type WeeklyCutVelocitySample,
} from "./hiatus-delay-prevention-engine";
import {
  MicroSliceAndDefenseCard,
  StyleLockHandoffKitCard,
} from "./HiatusHandoffAndDefenseViews";
import { CrewRadarAndStandbyView } from "./HiatusRadarAndStandbyViews";
import { HiatusVelocityForecastCard } from "./HiatusVelocityForecastCard";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioHiatusShieldPanelProps {
  readonly projectTitle?: string;
  readonly episodeId?: string;
  readonly episodeNumber?: number;
  readonly localClock?: DeterministicLocalClock;
  readonly initialContinuousWorkMinutes?: number;
  readonly weeklyVelocitySamples?: readonly WeeklyCutVelocitySample[];
}

const FIXED_OPS_NOW_ISO = "2026-11-21T15:00:00.000Z";
const DEFAULT_LOCAL_CLOCK: DeterministicLocalClock = { localHour: 15, localMinute: 0 };
const BUFFER_WEEK_OPTIONS: readonly number[] = [0, 1, 2, 3, 4];
const DEADLINE_HOUR_OPTIONS: readonly number[] = [12, 16, 24, 48];

function tierLabel(tier: BufferHealthTier): { readonly ko: string; readonly en: string } {
  if (tier === "green") return { ko: "안전 (GREEN)", en: "Safe (GREEN)" };
  if (tier === "amber") return { ko: "주의 (AMBER)", en: "Caution (AMBER)" };
  return { ko: "휴재 위험 (RED)", en: "Hiatus Risk (RED)" };
}

export function StudioHiatusShieldPanel({
  projectTitle = "밤의 우편배달부",
  episodeId = "ep-14",
  episodeNumber = 14,
  localClock,
  initialContinuousWorkMinutes = 50,
  weeklyVelocitySamples,
}: StudioHiatusShieldPanelProps) {
  const bt = useBilingual("StudioHiatusShieldPanel");

  const [state, setState] = useState<HiatusShieldStudioState>(() =>
    createInitialHiatusShieldState({
      projectTitle,
      episodeId,
      episodeNumber,
      nowIso: FIXED_OPS_NOW_ISO,
    }),
  );
  const [clockOverride, setClockOverride] = useState<DeterministicLocalClock | null>(null);
  const [continuousWorkMinutes, setContinuousWorkMinutes] = useState<number>(
    initialContinuousWorkMinutes,
  );
  const [acknowledgedBreakCycle, setAcknowledgedBreakCycle] = useState<number>(0);
  const [selectedAbsenceReason, setSelectedAbsenceReason] = useState<AbsenceReason>("injury");
  const [regionFilter, setRegionFilter] = useState<"all" | "domestic" | "global_sea">("all");
  const [currencyView, setCurrencyView] = useState<"KRW" | "USD">("KRW");
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const activeClock = clockOverride ?? localClock ?? DEFAULT_LOCAL_CLOCK;
  const resolvedVelocitySamples = useMemo(
    () => weeklyVelocitySamples ?? createStarterWeeklyVelocitySamples(),
    [weeklyVelocitySamples],
  );
  const velocityForecast = useMemo(
    () =>
      forecastThreeWeekHiatusRisk({
        samples: resolvedVelocitySamples,
        targetWeeklyCuts: state.targetTotalCuts,
        currentBufferWeeks: state.bufferWeeks,
      }),
    [resolvedVelocitySamples, state.targetTotalCuts, state.bufferWeeks],
  );
  const coachingSurface = useMemo(
    () =>
      evaluateHiatusCoachingSurface({
        continuousWorkMinutes,
        acknowledgedBreakCycle,
        clock: activeClock,
      }),
    [continuousWorkMinutes, acknowledgedBreakCycle, activeClock],
  );

  const completedCutsTotal = useMemo(
    () =>
      state.slices.reduce((sum, slice) => {
        if (slice.lockStatus === "completed_locked") {
          return sum + Math.max(0, slice.endCut - slice.startCut + 1);
        }
        return sum + Math.max(0, slice.completedCount);
      }, 0),
    [state.slices],
  );

  const remainingCutsTotal = Math.max(0, state.targetTotalCuts - completedCutsTotal);

  const standbyReliefStats = useMemo(() => {
    const transferredHolders = new Set(
      state.slices
        .filter((s) => s.lockStatus === "transferred" && s.holderId !== null)
        .map((s) => s.holderId as string),
    );
    let dailyCuts = 0;
    for (const artistId of transferredHolders) {
      const candidate = state.standbyPool.find((c) => c.artistId === artistId);
      if (candidate) dailyCuts += candidate.maxDailyCuts;
    }
    return {
      reliefDailyCuts: dailyCuts,
      coveredAbsenceCount: transferredHolders.size,
    };
  }, [state.slices, state.standbyPool]);

  const riskReport = useMemo(
    () =>
      assessBufferAndBurnoutRisk({
        episodeId: state.episodeId,
        episodeTitle: state.projectTitle,
        bufferWeeks: state.bufferWeeks,
        hoursUntilDeadline: state.hoursUntilDeadline,
        remainingCuts: remainingCutsTotal,
        targetTotalCuts: state.targetTotalCuts,
        members: state.members,
        reliefDailyCuts: standbyReliefStats.reliefDailyCuts,
        coveredAbsenceCount: standbyReliefStats.coveredAbsenceCount,
      }),
    [state, remainingCutsTotal, standbyReliefStats],
  );

  const coverageInvariant = useMemo(
    () => verifyCutCoverageInvariant(state.slices, state.targetTotalCuts),
    [state.slices, state.targetTotalCuts],
  );

  const activeSosSlice = useMemo(
    () => state.slices.find((slice) => slice.lockStatus === "released_sos") ?? null,
    [state.slices],
  );

  const standbyStage = activeSosSlice?.stage ?? "line";
  const standbyTargetCutCount = activeSosSlice
    ? activeSosSlice.endCut - activeSosSlice.startCut + 1
    : 25;

  const rankedMatches = useMemo(
    () =>
      rankEmergencyStandbyArtists({
        pool: state.standbyPool,
        neededStage: standbyStage,
        remainingCuts: standbyTargetCutCount,
        styleTarget: state.styleTarget,
        topN: 5,
        regionFilter,
      }),
    [state.standbyPool, state.styleTarget, standbyStage, standbyTargetCutCount, regionFilter],
  );

  const bottleneckSlice = useMemo(
    () =>
      state.slices.find(
        (slice) =>
          slice.lockStatus !== "completed_locked" &&
          slice.lockStatus !== "micro_split" &&
          slice.endCut - slice.startCut + 1 >= 18,
      ) ?? null,
    [state.slices],
  );

  const defenseReport = useMemo(
    () =>
      generateEmergencyDefenseScenarios({
        seriesTitle: state.projectTitle,
        episodeNumber: state.episodeNumber,
        hoursUntilDeadline: state.hoursUntilDeadline,
        remainingCuts: remainingCutsTotal,
        targetTotalCuts: state.targetTotalCuts,
        completedCuts: completedCutsTotal,
        availableTeamCutsPerHour: Math.max(0.5, riskReport.teamEffectiveDailyCuts / 8),
        standbyBoostCutsPerHour: (rankedMatches[0]?.candidate.maxDailyCuts ?? 16) / 8,
      }),
    [state, remainingCutsTotal, completedCutsTotal, riskReport.teamEffectiveDailyCuts, rankedMatches],
  );

  const handleDeclareAbsence = (memberId: string) => {
    const result = declareMemberAbsenceAndReleaseSlices({
      members: state.members,
      slices: state.slices,
      targetTotalCuts: state.targetTotalCuts,
      memberId,
      reason: selectedAbsenceReason,
      nowIso: FIXED_OPS_NOW_ISO,
    });
    setState((prev) => ({
      ...prev,
      members: result.members,
      slices: result.slices,
      auditLog: [result.auditEvent, ...prev.auditLog].slice(0, 8),
    }));
    setStatusFeedback(bt(result.auditEvent.summaryKo, result.auditEvent.summaryEn));
  };

  const handleTransferToStandby = (match: RankedStandbyMatch) => {
    const targetSlice = activeSosSlice;
    if (!targetSlice) {
      setStatusFeedback(
        bt("먼저 결원 멤버의 미완료 컷 잠금을 해제하세요.", "Unlock an absent member's slice first."),
      );
      return;
    }
    const nextKit = buildStyleLockHandoffKit({
      episodeId: state.episodeId,
      sliceId: targetSlice.sliceId,
      stage: targetSlice.stage,
      startCut: targetSlice.startCut,
      endCut: targetSlice.endCut,
      targetArtistId: match.candidate.artistId,
      targetArtistName: match.candidate.name,
      targetLineWidthPx: state.styleTarget.targetLineWidthPx,
      nowIso: FIXED_OPS_NOW_ISO,
    });
    const transferred = transferSliceLeaseToStandby({
      slices: state.slices,
      targetTotalCuts: state.targetTotalCuts,
      sliceId: targetSlice.sliceId,
      candidate: match.candidate,
      handoffKitId: nextKit.kitId,
      nowIso: FIXED_OPS_NOW_ISO,
    });
    if (!transferred.ok) {
      setStatusFeedback(bt(transferred.reasonKo, transferred.reasonEn));
      return;
    }
    setState((prev) => ({
      ...prev,
      slices: transferred.slices,
      activeHandoffKit: nextKit,
      auditLog: transferred.auditEvent
        ? [transferred.auditEvent, ...prev.auditLog].slice(0, 8)
        : prev.auditLog,
    }));
    setStatusFeedback(bt(transferred.reasonKo, transferred.reasonEn));
  };

  const handleSplitBottleneck = (sliceId: string) => {
    const topStandby = rankedMatches[0]?.candidate ?? state.standbyPool[0];
    const secondStandby = rankedMatches[1]?.candidate ?? state.standbyPool[1];
    const activeHelper = state.members.find((m) => m.status !== "absent" && m.stage !== "line");

    const assignees: MicroSliceAssignee[] = [
      {
        assigneeId: activeHelper?.memberId ?? "mem-flat-1",
        assigneeName: activeHelper?.name ?? "최도현 (잔여 팀원)",
        roleTagKo: "잔여 팀원 지원",
        roleTagEn: "Internal Team Support",
        region: "kr",
        cutsPerHour: 2.1,
      },
      {
        assigneeId: topStandby?.artistId ?? "sos-kr-01",
        assigneeName: topStandby?.name ?? "김하린",
        roleTagKo: "국내 긴급 대타",
        roleTagEn: "Domestic SOS Standby",
        region: topStandby?.region ?? "kr",
        cutsPerHour: (topStandby?.maxDailyCuts ?? 16) / 8,
      },
      {
        assigneeId: secondStandby?.artistId ?? "sos-vn-01",
        assigneeName: secondStandby?.name ?? "Nguyen Minh Anh",
        roleTagKo: "동남아·글로벌 긴급 대타",
        roleTagEn: "Global/SEA SOS Standby",
        region: secondStandby?.region ?? "sea_vn",
        cutsPerHour: (secondStandby?.maxDailyCuts ?? 18) / 8,
      },
    ];

    const split = splitBottleneckSliceIntoMicroSlices({
      slices: state.slices,
      sliceId,
      assignees,
      nowIso: FIXED_OPS_NOW_ISO,
    });
    if (!split.ok) return;

    const sizesText = split.microSlices.map((m) => `${m.cutCount}컷`).join("/");
    setState((prev) => ({
      ...prev,
      slices: split.updatedSlices,
      lastMicroSplit: split,
      auditLog: [
        {
          eventId: `sos-micro-${sliceId}`,
          occurredAtIso: FIXED_OPS_NOW_ISO,
          kind: "micro_split" as const,
          summaryKo: `병목 슬라이스 ${split.integrityCheck.totalOriginalCuts}컷 → 3인 병렬(${sizesText}) 분할 완료`,
          summaryEn: `Split ${split.integrityCheck.totalOriginalCuts} cuts into 3 parallel micro-slices (${sizesText})`,
        },
        ...prev.auditLog,
      ].slice(0, 8),
    }));
    setStatusFeedback(
      bt(
        `병목 ${split.integrityCheck.totalOriginalCuts}컷을 ${sizesText}으로 무중복 분할했습니다 (${split.parallelSpeedupFactor}배 단축).`,
        `Split ${split.integrityCheck.totalOriginalCuts} cuts into ${sizesText} with zero overlap (${split.parallelSpeedupFactor}x faster).`,
      ),
    );
  };

  const handleToggleForbiddenRule = (itemId: string) => {
    setState((prev) => {
      if (!prev.activeHandoffKit) return prev;
      return {
        ...prev,
        activeHandoffKit: {
          ...prev.activeHandoffKit,
          forbiddenChecklist: prev.activeHandoffKit.forbiddenChecklist.map((rule) =>
            rule.itemId === itemId ? { ...rule, checked: !rule.checked } : rule,
          ),
        },
      };
    });
  };

  const handleSelectDefense = (code: DefenseScenarioCode) => {
    setState((prev) => ({
      ...prev,
      selectedDefenseCode: code,
      auditLog: [
        {
          eventId: `sos-def-${code}-${prev.hoursUntilDeadline}`,
          occurredAtIso: FIXED_OPS_NOW_ISO,
          kind: "defense_selected" as const,
          summaryKo: `비상 연재 방어 ${code}안 확정 (마감 잔여 ${prev.hoursUntilDeadline}h)`,
          summaryEn: `Selected Emergency Defense Plan ${code} (${prev.hoursUntilDeadline}h left)`,
        },
        ...prev.auditLog,
      ].slice(0, 8),
    }));
    setStatusFeedback(
      bt(`비상 연재 방어 ${code}안을 활성화했습니다.`, `Activated Emergency Defense Plan ${code}.`),
    );
  };

  const handleCopyText = (payload: string, labelKo: string, labelEn: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload).catch(() => undefined);
    }
    setStatusFeedback(bt(labelKo, labelEn));
  };

  const handleReset = () => {
    setState(
      createInitialHiatusShieldState({
        projectTitle,
        episodeId,
        episodeNumber,
        nowIso: FIXED_OPS_NOW_ISO,
      }),
    );
    setClockOverride(null);
    setContinuousWorkMinutes(initialContinuousWorkMinutes);
    setAcknowledgedBreakCycle(0);
    setStatusFeedback(bt("휴재 방지 관제실을 초기 상태로 복원했습니다.", "Reset Hiatus Shield Control Room."));
  };

  const bufferBadge = tierLabel(riskReport.bufferTier);
  const overallBadge = tierLabel(riskReport.overallTier);

  return (
    <div
      className="hshield-root space-y-4"
      data-testid="studio-hiatus-shield-panel"
      aria-label={bt("웹툰 휴재·지각 제로 SOS 관제실", "Webtoon Zero-Hiatus SOS Control Room")}
    >
      {/* 상단 비축 원고 · 마감 위험도 대시보드 */}
      <section className="hshield-card space-y-3" data-testid="hshield-risk-dashboard">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="size-5 text-bad shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-black text-fg">
                {bt("휴재·지각 제로 SOS 관제실", "Zero-Hiatus & Delay Shield SOS")}
              </h3>
              <span
                className="hshield-badge"
                data-tier={riskReport.overallTier}
                data-testid="hshield-overall-tier"
              >
                <span className="hshield-dot" aria-hidden="true" />
                {bt(overallBadge.ko, overallBadge.en)}
              </span>
              <span
                className="hshield-badge"
                data-tier={coverageInvariant.preserved ? "green" : "red"}
                data-testid="hshield-coverage-badge"
              >
                {bt(
                  `컷 무결성 ${coverageInvariant.coveredCutCount}/${coverageInvariant.expectedTotalCuts} (중복 ${coverageInvariant.overlapCount}·누락 ${coverageInvariant.gapCount})`,
                  `Cuts ${coverageInvariant.coveredCutCount}/${coverageInvariant.expectedTotalCuts} (${coverageInvariant.overlapCount} dup / ${coverageInvariant.gapCount} gap)`,
                )}
              </span>
            </div>
            <p className="text-xs text-fg-2">
              {bt(
                `《${state.projectTitle}》 ${state.episodeNumber}화 · 완료 ${completedCutsTotal}컷 / 잔여 ${remainingCutsTotal}컷 · 팀 실효 속도 ${riskReport.teamEffectiveDailyCuts}컷/일`,
                `"${state.projectTitle}" Ep.${state.episodeNumber} · ${completedCutsTotal} done / ${remainingCutsTotal} left · ${riskReport.teamEffectiveDailyCuts} cuts/day`,
              )}
            </p>
          </div>

          <button type="button" className="hshield-btn" onClick={handleReset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {bt("관제실 초기화", "Reset Room")}
          </button>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="hshield-subcard space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg-2">{bt("비축 원고 건강도", "Buffer Stock Health")}</span>
              <span className="hshield-badge" data-tier={riskReport.bufferTier} data-testid="hshield-buffer-tier">
                <span className="hshield-dot" aria-hidden="true" />
                {bt(`${state.bufferWeeks}주 · ${bufferBadge.ko}`, `${state.bufferWeeks}w · ${bufferBadge.en}`)}
              </span>
            </div>
            <div className="hshield-gauge-track" aria-hidden="true">
              <div
                className="hshield-gauge-fill"
                data-tier={riskReport.bufferTier}
                style={{ width: `${Math.min(100, (state.bufferWeeks / 4) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-fg-3">
              {bt("3주+ 안전 / 1~2주 주의 / 0주 위험", "3w+ safe / 1-2w warn / 0w red")}
            </p>
          </div>

          <div className="hshield-subcard space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg-2">{bt("휴재 확률 예측", "Hiatus Probability")}</span>
              <span className="text-sm font-black text-fg hshield-num" data-testid="hshield-hiatus-prob">
                {riskReport.hiatusProbabilityPct}%
              </span>
            </div>
            <div className="hshield-gauge-track" aria-hidden="true">
              <div
                className="hshield-gauge-fill"
                data-tier={
                  riskReport.hiatusProbabilityPct >= 65
                    ? "red"
                    : riskReport.hiatusProbabilityPct >= 30
                      ? "amber"
                      : "green"
                }
                style={{ width: `${riskReport.hiatusProbabilityPct}%` }}
              />
            </div>
            <p className="text-xs text-fg-3">
              {bt(
                `미대체 결원 ${riskReport.uncoveredAbsenceCount}명 · 고피로 ${riskReport.highBurnoutMemberCount}명`,
                `${riskReport.uncoveredAbsenceCount} uncovered · ${riskReport.highBurnoutMemberCount} high burnout`,
              )}
            </p>
          </div>

          <div className="hshield-subcard space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-semibold text-fg-2">
                <Clock className="size-3.5" aria-hidden="true" />
                {bt("마감 D-Day 지연 예측", "Deadline Slip ETA")}
              </span>
              <span className="text-sm font-black text-fg hshield-num" data-testid="hshield-delay-hours">
                +{riskReport.projectedDelayHours}h
              </span>
            </div>
            <p className="text-xs text-fg-2 hshield-num">
              {bt(
                `예상 소요 ${riskReport.estimatedHoursNeeded}h / 마감 잔여 ${state.hoursUntilDeadline}h`,
                `Need ${riskReport.estimatedHoursNeeded}h / ${state.hoursUntilDeadline}h left`,
              )}
            </p>
          </div>

          <div className="hshield-subcard space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-semibold text-fg-2">
                <HeartPulse className="size-3.5" aria-hidden="true" />
                {bt("최고 번아웃 지수", "Peak Burnout Index")}
              </span>
              <span className="text-sm font-black text-fg hshield-num">
                {riskReport.maxBurnoutIndex}/100
              </span>
            </div>
            <div className="hshield-gauge-track" aria-hidden="true">
              <div
                className="hshield-gauge-fill"
                data-tier={
                  riskReport.maxBurnoutIndex >= 75
                    ? "red"
                    : riskReport.maxBurnoutIndex >= 50
                      ? "amber"
                      : "green"
                }
                style={{ width: `${riskReport.maxBurnoutIndex}%` }}
              />
            </div>
            <p className="text-xs text-fg-3">
              {bt("손목·목 피로 + 주간 야근 통합", "Wrist/neck + weekly overtime")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bt("비축 원고 주수 선택", "Select buffer weeks")}>
            <span className="text-xs font-bold text-fg-2">{bt("비축 원고:", "Buffer:")}</span>
            {BUFFER_WEEK_OPTIONS.map((weeks) => (
              <button
                key={weeks}
                type="button"
                className="hshield-btn"
                aria-pressed={state.bufferWeeks === weeks}
                onClick={() => setState((prev) => ({ ...prev, bufferWeeks: weeks }))}
              >
                {bt(`${weeks}주`, `${weeks}w`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bt("마감 잔여 시간 선택", "Select hours to deadline")}>
            <span className="text-xs font-bold text-fg-2">{bt("마감 잔여:", "Deadline:")}</span>
            {DEADLINE_HOUR_OPTIONS.map((hours) => (
              <button
                key={hours}
                type="button"
                className="hshield-btn"
                aria-pressed={state.hoursUntilDeadline === hours}
                onClick={() => setState((prev) => ({ ...prev, hoursUntilDeadline: hours }))}
              >
                {hours <= 16 ? bt(`${hours}h (위기)`, `${hours}h (Crisis)`) : `${hours}h`}
              </button>
            ))}
          </div>
        </div>

        {riskReport.earlyWarnings.length > 0 ? (
          coachingSurface.earlyWarningsCollapsedByDefault ? (
            <div
              className="hshield-silent-collapse"
              data-testid="hshield-early-warnings-collapsed"
              data-suppressed="silent_collapsed"
            >
              <p className="text-xs text-fg-2">
                {bt(
                  `심야 무음 모드(${coachingSurface.lateNightPolicy.formattedLocalTime}) · 조기 경보 ${riskReport.earlyWarnings.length}건이 팝업 없이 접혀 있습니다.`,
                  `Silent night mode (${coachingSurface.lateNightPolicy.formattedLocalTime}) · ${riskReport.earlyWarnings.length} early warnings silently collapsed.`,
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" data-testid="hshield-early-warnings">
              {riskReport.earlyWarnings.map((alert) => (
                <div key={alert.id} className="hshield-alert space-y-0.5" data-tier={alert.tier}>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    {bt(alert.titleKo, alert.titleEn)}
                  </p>
                  <p className="text-xs text-fg-2">{bt(alert.detailKo, alert.detailEn)}</p>
                </div>
              ))}
            </div>
          )
        ) : null}

        {statusFeedback ? (
          <div
            role="status"
            data-testid="hshield-status-toast"
            className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg"
          >
            {statusFeedback}
          </div>
        ) : null}
      </section>

      {/* 0. 로컬 이동평균(SMA/EMA) 3주 전 휴재 예측 · 50분 손목 휴식 · 00:00~06:00 심야 무음 억제 */}
      <HiatusVelocityForecastCard
        forecast={velocityForecast}
        samples={resolvedVelocitySamples}
        surface={coachingSurface}
        onChangeClockPreset={(nextClock) => setClockOverride(nextClock)}
        onChangeContinuousWorkMinutes={(mins) => {
          setContinuousWorkMinutes(mins);
          if (mins < 50) setAcknowledgedBreakCycle(0);
        }}
        onAcknowledgeWristBreak={(cycleIndex) => setAcknowledgedBreakCycle(cycleIndex)}
      />

      {/* 1. 팀원 번아웃 레이더 + 2. 10분 긴급 대타 매칭 */}
      <CrewRadarAndStandbyView
        riskReport={riskReport}
        members={state.members}
        slices={state.slices}
        activeSosSlice={activeSosSlice}
        selectedAbsenceReason={selectedAbsenceReason}
        regionFilter={regionFilter}
        currencyView={currencyView}
        rankedMatches={rankedMatches}
        onChangeAbsenceReason={setSelectedAbsenceReason}
        onDeclareAbsence={handleDeclareAbsence}
        onChangeRegionFilter={setRegionFilter}
        onToggleCurrency={() => setCurrencyView((prev) => (prev === "KRW" ? "USD" : "KRW"))}
        onTransferToStandby={handleTransferToStandby}
      />

      {/* 3. 10분 작화 통일 인계 키트 */}
      <StyleLockHandoffKitCard
        kit={state.activeHandoffKit}
        onToggleForbiddenRule={handleToggleForbiddenRule}
        onCopyText={handleCopyText}
      />

      {/* 4. 병목 슬라이스 8/8/9 분할 + 5. 3단계 비상 연재 방어 플랜 */}
      <MicroSliceAndDefenseCard
        bottleneckSlice={bottleneckSlice}
        microSplitResult={state.lastMicroSplit}
        defenseReport={defenseReport}
        selectedDefenseCode={state.selectedDefenseCode}
        onSplitBottleneck={handleSplitBottleneck}
        onSelectDefense={handleSelectDefense}
        onCopyText={handleCopyText}
      />
    </div>
  );
}
