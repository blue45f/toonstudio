import {
  Activity,
  Globe2,
  UserCheck,
  UserMinus,
  Zap,
} from "lucide-react";

import {
  ABSENCE_REASON_LABELS,
  STAGE_LABELS,
  type AbsenceReason,
  type ActiveCutSlice,
  type BufferAndBurnoutAssessment,
  type RankedStandbyMatch,
  type TeamMemberHealthSnapshot,
} from "./hiatus-delay-prevention-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ABSENCE_REASONS: readonly AbsenceReason[] = [
  "illness",
  "injury",
  "personal_emergency",
  "unresponsive",
];

function sliceLockBadge(
  status: ActiveCutSlice["lockStatus"],
): { readonly tier: "green" | "amber" | "red" | "accent"; readonly ko: string; readonly en: string } {
  if (status === "completed_locked") return { tier: "green", ko: "완료 잠금", en: "Completed" };
  if (status === "released_sos") return { tier: "red", ko: "SOS 해제됨", en: "SOS Unlocked" };
  if (status === "transferred") return { tier: "green", ko: "대타 이관됨", en: "Transferred" };
  if (status === "micro_split") return { tier: "accent", ko: "마이크로 분할", en: "Micro-Split" };
  return { tier: "amber", ko: "작업 잠금", en: "Locked" };
}

export interface CrewRadarAndStandbyViewProps {
  readonly riskReport: BufferAndBurnoutAssessment;
  readonly members: readonly TeamMemberHealthSnapshot[];
  readonly slices: readonly ActiveCutSlice[];
  readonly activeSosSlice: ActiveCutSlice | null;
  readonly selectedAbsenceReason: AbsenceReason;
  readonly regionFilter: "all" | "domestic" | "global_sea";
  readonly currencyView: "KRW" | "USD";
  readonly rankedMatches: readonly RankedStandbyMatch[];
  readonly onChangeAbsenceReason: (reason: AbsenceReason) => void;
  readonly onDeclareAbsence: (memberId: string) => void;
  readonly onChangeRegionFilter: (filter: "all" | "domestic" | "global_sea") => void;
  readonly onToggleCurrency: () => void;
  readonly onTransferToStandby: (match: RankedStandbyMatch) => void;
}

export function CrewRadarAndStandbyView({
  riskReport,
  members,
  slices,
  activeSosSlice,
  selectedAbsenceReason,
  regionFilter,
  currencyView,
  rankedMatches,
  onChangeAbsenceReason,
  onDeclareAbsence,
  onChangeRegionFilter,
  onToggleCurrency,
  onTransferToStandby,
}: CrewRadarAndStandbyViewProps) {
  const bt = useBilingual("HiatusCrewRadarAndStandbyView");

  return (
    <div className="space-y-4">
      {/* 1. 멤버 건강·번아웃 레이더 & 1클릭 결원 선언 */}
      <section
        className="hshield-card space-y-3"
        data-testid="hshield-member-radar"
        aria-label={bt("팀원 번아웃 레이더 및 결원 선언", "Crew Burnout Radar & Absence Declaration")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Activity className="size-4 text-accent shrink-0" aria-hidden="true" />
              {bt("1. 팀원 건강·번아웃 레이더 & 1클릭 결원 SOS 선언", "1. Crew Burnout Radar & 1-Click Absence SOS")}
            </h3>
            <p className="mt-0.5 text-xs text-fg-2">
              {bt(
                "결원 선언 시 이미 완료된 컷은 무손실 잠금 보존하고, 미완료 컷 슬라이스만 즉시 해제해 대타 매칭으로 연결합니다.",
                "Declaring absence locks finished cuts losslessly and unlocks only unfinished cuts for instant standby takeover.",
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
            <span>{bt("결원 사유", "Absence Reason")}</span>
            <select
              className="hshield-select"
              aria-label={bt("결원 사유 선택", "Select absence reason")}
              value={selectedAbsenceReason}
              onChange={(event) => onChangeAbsenceReason(event.target.value as AbsenceReason)}
            >
              {ABSENCE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {bt(ABSENCE_REASON_LABELS[reason].ko, ABSENCE_REASON_LABELS[reason].en)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          {riskReport.memberRisks.map((member) => {
            const raw = members.find((m) => m.memberId === member.memberId);
            const isAbsent = member.status === "absent";
            return (
              <div key={member.memberId} className="hshield-subcard space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-fg">{member.name}</p>
                    <p className="text-xs text-fg-2 hshield-num">
                      {bt(STAGE_LABELS[member.stage].ko, STAGE_LABELS[member.stage].en)} ·{" "}
                      {bt(`일일 ${raw?.dailyCutVelocity ?? 0}컷`, `${raw?.dailyCutVelocity ?? 0} cuts/d`)} ·{" "}
                      {bt(`야근 ${raw?.overtimeHoursThisWeek ?? 0}h`, `OT ${raw?.overtimeHoursThisWeek ?? 0}h`)} ·{" "}
                      {bt(
                        `손목 ${raw?.wristFatigueScore ?? 0} / 목 ${raw?.neckFatigueScore ?? 0}`,
                        `Wrist ${raw?.wristFatigueScore ?? 0} / Neck ${raw?.neckFatigueScore ?? 0}`,
                      )}
                    </p>
                  </div>
                  <span className="hshield-badge" data-tier={member.alertTier}>
                    <span className="hshield-dot" aria-hidden="true" />
                    {isAbsent
                      ? bt("결원 (SOS)", "Absent (SOS)")
                      : bt(`번아웃 ${member.burnoutIndex}점`, `Burnout ${member.burnoutIndex}`)}
                  </span>
                </div>

                <div className="hshield-gauge-track" aria-hidden="true">
                  <div
                    className="hshield-gauge-fill"
                    data-tier={member.alertTier}
                    style={{ width: `${isAbsent ? 100 : member.burnoutIndex}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-fg-2">{bt(member.guidanceKo, member.guidanceEn)}</p>
                  <button
                    type="button"
                    className="hshield-btn"
                    data-variant="danger"
                    disabled={isAbsent}
                    data-testid={`hshield-declare-absent-${member.memberId}`}
                    onClick={() => onDeclareAbsence(member.memberId)}
                  >
                    <UserMinus className="size-4" aria-hidden="true" />
                    {isAbsent
                      ? bt("미완료 컷 해제됨", "Slice Unlocked")
                      : bt("결원 선언 · 컷 해제", "Declare Absent & Unlock")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 실시간 Cut-Slice 소유 현황 바 */}
        <div className="hshield-subcard space-y-2" data-testid="hshield-slice-strip">
          <p className="text-xs font-bold text-fg">
            {bt("실시간 Cut-Slice 잠금·이관 현황", "Live Cut-Slice Lock & Transfer Status")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {slices.map((slice) => {
              const badge = sliceLockBadge(slice.lockStatus);
              const total = slice.endCut - slice.startCut + 1;
              return (
                <div key={slice.sliceId} className="rounded-lg border border-line bg-canvas p-2 text-xs">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-bold text-fg hshield-num">
                      {slice.startCut}~{slice.endCut}컷 ({total})
                    </span>
                    <span className="hshield-badge" data-tier={badge.tier}>
                      {bt(badge.ko, badge.en)}
                    </span>
                  </div>
                  <p className="mt-1 text-fg-2">
                    {bt(STAGE_LABELS[slice.stage].ko, STAGE_LABELS[slice.stage].en)} ·{" "}
                    {slice.holderName ?? bt("대타 배정 대기", "Awaiting Standby")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. 10분 긴급 대타(SOS) 국내 + 동남아/글로벌 자동 매칭 & 1클릭 리스 이관 */}
      <section
        className="hshield-card space-y-3"
        data-testid="hshield-standby-matching"
        aria-label={bt("10분 긴급 대타 자동 매칭", "10-Minute Emergency Standby Matching")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Zap className="size-4 text-warn shrink-0" aria-hidden="true" />
              {bt(
                "2. 10분 긴급 대타(SOS) 자동 매칭 · 국내 + 동남아/글로벌 풀",
                "2. 10-Min Emergency Standby Pool (KR + SEA/Global)",
              )}
            </h3>
            <p className="mt-0.5 text-xs text-fg-2">
              {activeSosSlice
                ? bt(
                    `긴급 이관 대기 슬라이스: ${activeSosSlice.sliceId} (${activeSosSlice.startCut}~${activeSosSlice.endCut}컷 · ${STAGE_LABELS[activeSosSlice.stage].ko}) — 1클릭 리스 이관 + 인계 키트 동시 발송`,
                    `Awaiting SOS takeover: ${activeSosSlice.sliceId} (cuts ${activeSosSlice.startCut}-${activeSosSlice.endCut}, ${STAGE_LABELS[activeSosSlice.stage].en})`,
                  )
                : bt(
                    "현재 해제된 SOS 슬라이스가 없습니다. 위 팀원 카드에서 '결원 선언 · 컷 해제'를 누르면 1클릭 리스 이관이 활성화됩니다.",
                    "No unlocked SOS slice yet. Declare a member absent above to activate 1-click lease transfer.",
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="hshield-btn"
              aria-pressed={regionFilter === "all"}
              onClick={() => onChangeRegionFilter("all")}
            >
              <Globe2 className="size-4" aria-hidden="true" />
              {bt("국내+글로벌 전체", "All KR+Global")}
            </button>
            <button
              type="button"
              className="hshield-btn"
              aria-pressed={regionFilter === "domestic"}
              onClick={() => onChangeRegionFilter("domestic")}
            >
              {bt("국내(KR)", "Domestic (KR)")}
            </button>
            <button
              type="button"
              className="hshield-btn"
              aria-pressed={regionFilter === "global_sea"}
              onClick={() => onChangeRegionFilter("global_sea")}
            >
              {bt("동남아·글로벌", "SEA / Global")}
            </button>
            <button
              type="button"
              className="hshield-btn"
              aria-pressed={currencyView === "USD"}
              onClick={onToggleCurrency}
            >
              {currencyView === "KRW" ? "KRW (₩)" : "USD ($)"}
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-2">
          {rankedMatches.map((match, idx) => (
            <div
              key={match.candidate.artistId}
              className="hshield-subcard space-y-2"
              data-testid={`hshield-candidate-${match.candidate.artistId}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">
                    #{idx + 1} {match.candidate.name}{" "}
                    <span className="font-normal text-fg-2">
                      · {bt(match.candidate.regionLabelKo, match.candidate.regionLabelEn)}
                    </span>
                  </p>
                  <p className="text-xs text-fg-2 hshield-num">
                    {bt(
                      `작화 호환 ${match.styleCompatibilityScore}점 (ΔE ${match.oklchDeltaE} · 선폭차 ${match.lineWidthDeltaPx}px) · 투입 ${match.candidate.responseEtaMinutes}분`,
                      `Style ${match.styleCompatibilityScore} (ΔE ${match.oklchDeltaE}, Δpx ${match.lineWidthDeltaPx}) · ETA ${match.candidate.responseEtaMinutes}m`,
                    )}
                  </p>
                </div>
                <span
                  className="hshield-badge"
                  data-tier={match.canDeployInTenMinutes ? "green" : "amber"}
                >
                  <span className="hshield-dot" aria-hidden="true" />
                  {bt(`종합 ${match.totalScore}점`, `Score ${match.totalScore}`)}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-fg-2 hshield-num">
                  {currencyView === "KRW"
                    ? bt(
                        `예상 ${match.estimatedCompletionHours}h · ₩${match.estimatedTotalKrw.toLocaleString("ko-KR")} (시급 ₩${match.candidate.hourlyRateKrw.toLocaleString("ko-KR")})`,
                        `Est ${match.estimatedCompletionHours}h · ₩${match.estimatedTotalKrw.toLocaleString("en-US")}`,
                      )
                    : bt(
                        `예상 ${match.estimatedCompletionHours}h · $${match.estimatedTotalUsd.toLocaleString("en-US")} ($${match.candidate.hourlyRateUsd}/h)`,
                        `Est ${match.estimatedCompletionHours}h · $${match.estimatedTotalUsd.toLocaleString("en-US")} ($${match.candidate.hourlyRateUsd}/h)`,
                      )}
                </span>

                <button
                  type="button"
                  className="hshield-btn"
                  data-variant="good"
                  disabled={!activeSosSlice}
                  data-testid={`hshield-transfer-btn-${match.candidate.artistId}`}
                  onClick={() => onTransferToStandby(match)}
                >
                  <UserCheck className="size-4" aria-hidden="true" />
                  {bt("1클릭 리스 이관 + 키트 발송", "1-Click Lease & Send Kit")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
