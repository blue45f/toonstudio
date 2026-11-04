import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Coins, Sparkles, UsersRound } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { collabButton } from "./collaboration-ui";
import {
  type CrewDivisionTrackKey,
  DEFAULT_TRACK_MODES,
  simulateCrewDivisionPlan,
  type TrackExecutionMode,
} from "./collaboration-crew-division-planner-model";

export interface CollaborationCrewDivisionPlannerProps {
  readonly onSelectRoleFilter?: (role: string) => void;
}

export function CollaborationCrewDivisionPlanner({
  onSelectRoleFilter,
}: CollaborationCrewDivisionPlannerProps) {
  const bt = useBilingual("CollaborationCrewDivisionPlanner");
  const [targetCuts, setTargetCuts] = useState<number>(70);
  const [weeklyDeadlineHours, setWeeklyDeadlineHours] = useState<number>(96);
  const [trackModes, setTrackModes] =
    useState<Readonly<Record<CrewDivisionTrackKey, TrackExecutionMode>>>(DEFAULT_TRACK_MODES);

  const simulation = useMemo(
    () =>
      simulateCrewDivisionPlan({
        targetCuts,
        weeklyDeadlineHours,
        trackModes,
      }),
    [targetCuts, weeklyDeadlineHours, trackModes],
  );

  const handleToggleTrackMode = (key: CrewDivisionTrackKey) => {
    setTrackModes((prev) => ({
      ...prev,
      [key]: prev[key] === "creator-solo" ? "assistant-outsourced" : "creator-solo",
    }));
  };

  const handleApplyRecommendedDivision = () => {
    setTrackModes({
      story_board: "creator-solo",
      bg_3d: "assistant-outsourced",
      line_art: "assistant-outsourced",
      flat_color: "assistant-outsourced",
      shading_render: "assistant-outsourced",
      compositing_lettering: "creator-solo",
    });
  };

  return (
    <section
      aria-labelledby="crew-division-planner-heading"
      className="mt-8 rounded-3xl border border-line bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">DIVISION-OF-LABOR CREW SIMULATOR</p>
          <h2 id="crew-division-planner-heading" className="mt-1 text-lg font-bold text-fg sm:text-xl">
            {bt(
              "회차 마감 분업 시뮬레이터 · 어느 공정을 어시스턴트에게 맡길지 계산해 보세요",
              "Weekly Episode Division Simulator · Calculate Which Stages to Delegate",
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm">
            {bt(
              "목표 컷 수와 마감 가용 시간을 입력하고 6대 공정의 직접 수행/분업 여부를 전환하면, 메인 작가 작업 시간·총 리드타임·회차당 예상 외주비를 즉시 산출합니다.",
              "Set your weekly cut target and available hours, toggle solo vs. assistant delegation per stage, and preview creator load, critical path hours, and per-episode cost.",
            )}
          </p>
        </div>
        <button
          type="button"
          className={collabButton}
          onClick={handleApplyRecommendedDivision}
        >
          <Sparkles size={15} aria-hidden="true" />
          {bt("주간 연재 최적 분업 프리셋 적용", "Apply Optimal Weekly Serialization Preset")}
        </button>
      </div>

      {/* Controls + KPI Cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="rounded-2xl border border-line bg-raised p-3 text-xs font-medium text-fg-2">
          <span>{bt("회차 목표 컷 수", "Target Cuts / Episode")}</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={150}
              step={5}
              value={targetCuts}
              onChange={(e) => setTargetCuts(Number(e.target.value) || 70)}
              className="w-24 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm font-bold text-fg"
            />
            <span className="text-xs font-semibold text-fg-3">{bt("컷", "cuts")}</span>
          </div>
        </label>

        <label className="rounded-2xl border border-line bg-raised p-3 text-xs font-medium text-fg-2">
          <span>{bt("주간 마감 가용 시간", "Weekly Deadline Budget")}</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={24}
              max={168}
              step={4}
              value={weeklyDeadlineHours}
              onChange={(e) => setWeeklyDeadlineHours(Number(e.target.value) || 96)}
              className="w-24 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm font-bold text-fg"
            />
            <span className="text-xs font-semibold text-fg-3">{bt("시간", "hours")}</span>
          </div>
        </label>

        <div className="rounded-2xl border border-line bg-raised p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{bt("메인 작가 직접 투입 시간", "Main Creator Hours")}</span>
            <Clock size={14} className="text-accent" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-lg font-black text-fg">
            {simulation.totalCreatorHours}h
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-3">
            {bt(
              `어시 분업 ${simulation.totalAssistantHours}h 병렬 가동`,
              `Assistant parallel ${simulation.totalAssistantHours}h`,
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-raised p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{bt("마감 여유 버퍼 · 과부하 진단", "Deadline Buffer & Load")}</span>
            {simulation.burnoutRiskLevel === "safe" ? (
              <CheckCircle2 size={14} className="text-good" aria-hidden="true" />
            ) : (
              <AlertTriangle size={14} className="text-warn" aria-hidden="true" />
            )}
          </div>
          <p
            className={cn(
              "mt-1.5 text-lg font-black",
              simulation.burnoutRiskLevel === "overload"
                ? "text-bad"
                : simulation.burnoutRiskLevel === "caution"
                  ? "text-warn"
                  : "text-good",
            )}
          >
            {simulation.deadlineBufferHours >= 0
              ? `+${simulation.deadlineBufferHours}h`
              : `${simulation.deadlineBufferHours}h`}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-3">
            {simulation.burnoutRiskLevel === "overload"
              ? bt("마감 초과 위험 — 선화/채색 분업 권장", "Overload risk — delegate line/color")
              : simulation.burnoutRiskLevel === "caution"
                ? bt("주의 — 여유 버퍼 12시간 미만", "Caution — buffer under 12h")
                : bt("안전 — 주간 연재 안정권", "Safe — sustainable weekly pace")}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-raised p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{bt("회차당 예상 분업 외주비", "Est. Outsourcing / Ep")}</span>
            <Coins size={14} className="text-accent" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-lg font-black text-accent">
            {simulation.estimatedEpisodeOutsourcingKrw.toLocaleString("ko-KR")}{bt("원", " KRW")}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-3">
            {bt(
              `최대 병목: ${simulation.bottleneckTrack.labelKo}`,
              `Top bottleneck: ${simulation.bottleneckTrack.labelEn}`,
            )}
          </p>
        </div>
      </div>

      {/* 6-Track Interactive Delegation Matrix */}
      <div
        role="region"
        aria-labelledby="crew-division-matrix-caption"
        className="mt-4 overflow-x-auto rounded-2xl border border-line bg-raised/60"
      >
        <table className="w-full border-collapse text-left text-xs">
          <caption id="crew-division-matrix-caption" className="sr-only">
            {bt("웹툰 6대 공정별 직접 수행 대 어시스턴트 분업 비교표", "Webtoon 6-stage solo vs assistant delegation matrix")}
          </caption>
          <thead className="sticky top-0 z-10 border-b border-line bg-raised text-[0.6875rem] text-fg-3">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("분업 공정 트랙", "Division Track")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("수행 방식 전환", "Execution Mode")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("메인 작가 소요 시간", "Creator Hours")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("회차 외주 예산", "Episode Budget")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("맞춤 공고 필터 연결", "Match Gigs")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {simulation.rows.map((row) => {
              const isOutsourced = row.mode === "assistant-outsourced";
              return (
                <tr key={row.spec.key} className="hover:bg-panel/80">
                  <th scope="row" className="px-3 py-2.5 font-bold text-fg">
                    {bt(row.spec.labelKo, row.spec.labelEn)}
                  </th>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleTrackMode(row.spec.key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        isOutsourced
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line bg-panel text-fg-2 hover:border-accent/50",
                      )}
                    >
                      {isOutsourced
                        ? bt("어시스턴트 분업 (검수만 직접)", "Assistant Delegated (Review Only)")
                        : bt("메인 작가 단독 수행", "Creator Solo")}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-fg">
                    {row.creatorHours}h
                    {isOutsourced ? (
                      <span className="ml-1.5 text-[0.6875rem] font-normal text-good">
                        ({bt(`어시 ${row.assistantHours}h 분담`, `Assistant ${row.assistantHours}h`)})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-fg-2">
                    {row.episodeCostKrw > 0
                      ? `${row.episodeCostKrw.toLocaleString("ko-KR")}${bt("원", " KRW")}`
                      : bt("0원 (직접 수행)", "0 KRW (Solo)")}
                  </td>
                  <td className="px-3 py-2.5">
                    {onSelectRoleFilter ? (
                      <button
                        type="button"
                        onClick={() => onSelectRoleFilter(row.spec.boardRoleFilter)}
                        className="inline-flex items-center gap-1 font-semibold text-accent underline-offset-4 hover:underline"
                      >
                        <UsersRound size={13} aria-hidden="true" />
                        {bt("이 공정 파트너 공고 보기", "Filter gigs for this track")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        data-testid="collaboration-rea-handoff-sla-bar"
        className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-raised/75 px-4 py-3 text-xs text-fg-2"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <img
            src="/assets/site-experience/site-art-v1/motion-previews/atelier-pipeline-motion-640.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={56}
            height={32}
            className="h-8 w-14 shrink-0 rounded-md border border-line object-cover"
          />
          <span className="font-extrabold text-accent">
            {bt("KITSU · FTRACK · LINEAR · FIGJAM · CLICKUP 인계 SLA:", "KITSU · FTRACK · LINEAR · FIGJAM · CLICKUP SLA:")}
          </span>
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold">
            {bt("18개 레이어 RBAC 잠금 보호", "18-Layer RBAC Lock Guard")}
          </span>
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold">
            {bt("동시 분업 레이어 충돌 0건 검증", "Zero-Conflict Parallel Layer Check")}
          </span>
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold">
            {bt("ftrack 부서별 검수 플레이리스트 & FigJam 스탬프 투표", "ftrack Review Playlist & FigJam Stamp Vote")}
          </span>
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold">
            {bt("8단계 공정 핀포인트 레드라인 검수", "8-Stage Pinpoint Redline Review")}
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold text-good">
          {bt(
            `병목 공정(${simulation.bottleneckTrack.labelKo}) 우선 인계 권장`,
            `Priority handoff: ${simulation.bottleneckTrack.labelEn}`,
          )}
        </span>
      </div>
    </section>
  );
}
