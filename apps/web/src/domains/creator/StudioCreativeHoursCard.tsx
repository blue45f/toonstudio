/**
 * Studio Creative Hours & Creator Wellness Card (창작 시간 및 예방형 인체공학 웰니스 카드)
 *
 * - 활성 작업 시간, 세션 시간, 누적 획 수, 작업 페이스(획/분)를 표시한다.
 * - 50분 이상 연속 작업 시 비차단 휴식·스트레칭 알림과 중립 자세 4대 체크리스트를 제공한다.
 */

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  HeartPulse,
  PauseCircle,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS,
  planSerializationBuffer,
  planShortsAudioCueSheet,
  StudioBeforeAfterShowcaseCard,
  type BeforeAfterShowcaseAsset,
  type BufferAlertLevel,
  type SerializationBufferInput,
  type WebtoonCutTimelineItem,
} from "./creator-promo-kit";
import {
  computeCreativeWorkStatistics,
  type CreativeWorkTimeTrackerState,
} from "./studio-creative-work-time-tracker";
import { formatNumber } from "@toonstudio/core/format";

export interface StudioCreativeHoursCardProps {
  readonly tracker: CreativeWorkTimeTrackerState;
  readonly onResetSession?: () => void;
  readonly className?: string;
  readonly serializationInput?: SerializationBufferInput;
  readonly shortsCuts?: readonly WebtoonCutTimelineItem[];
  readonly showcaseAsset?: BeforeAfterShowcaseAsset;
  readonly defaultPromoKitOpen?: boolean;
}

const POSTURE_CHECKS = [
  { id: "wrist", label: "손목 중립 각도 유지" },
  { id: "eye", label: "모니터 상단 시선 수평" },
  { id: "lumbar", label: "허리·어깨 중립 지지" },
  { id: "glare", label: "눈부심 저감 조명 확인" },
] as const;

const DEFAULT_SHORTS_SAMPLE_CUTS: readonly WebtoonCutTimelineItem[] = [
  {
    cutId: "sample-cut-1",
    cutNumber: 1,
    emotion: "tense",
    dialogues: [{ id: "d-1", speaker: "주인공", text: "오늘 밤 마감 전에는 반드시 끝낸다." }],
    sfx: [{ id: "s-1", label: "두근", presetId: "heartbeat-pulse" }],
  },
  {
    cutId: "sample-cut-2",
    cutNumber: 2,
    emotion: "action",
    dialogues: [{ id: "d-2", speaker: "어시", text: "배경 셰이더 1차 렌더 올렸습니다!" }],
    sfx: [{ id: "s-2", label: "스윽", presetId: "whoosh-pan" }],
  },
];

const BUFFER_ALERT_BADGE_CLASS: Readonly<Record<BufferAlertLevel, string>> = {
  green: "bg-good/20 text-good",
  amber: "bg-warn/20 text-warn",
  red: "bg-bad/20 text-bad",
};

export function StudioCreativeHoursCard({
  tracker,
  onResetSession,
  className = "",
  serializationInput,
  shortsCuts,
  showcaseAsset,
  defaultPromoKitOpen = false,
}: StudioCreativeHoursCardProps) {
  const promoSectionId = useId();
  const stats = computeCreativeWorkStatistics(tracker);
  const [checkedIds, setCheckedIds] = useState<readonly string[]>(["wrist", "eye"]);
  const [promoKitOpen, setPromoKitOpen] = useState(defaultPromoKitOpen);
  const sessionMinutes = Math.floor(tracker.sessionWorkTimeSeconds / 60);
  const breakRecommended = sessionMinutes >= 50 && !stats.isCurrentlyIdle;

  const bufferPlan = useMemo(() => {
    const fallbackCutsPerDay = Math.max(6, Math.min(24, Math.round(stats.strokesPerMinute / 2) + 8));
    const effectiveInput: SerializationBufferInput = serializationInput ?? {
      seriesTitle: tracker.projectId || "현재 연재작",
      nextEpisodeNumber: 1,
      cutsPerEpisode: 70,
      currentEpisodeCompletedCuts: 35,
      daysUntilDeadline: 5,
      publishCadenceDays: 7,
      stockpiledCompletedEpisodes: 1.5,
      recentVelocity: [
        { dateIso: "2026-11-20", completedCuts: fallbackCutsPerDay },
        { dateIso: "2026-11-21", completedCuts: fallbackCutsPerDay },
      ],
    };
    return planSerializationBuffer(effectiveInput);
  }, [serializationInput, stats.strokesPerMinute, tracker.projectId]);

  const shortsPlan = useMemo(
    () =>
      planShortsAudioCueSheet(shortsCuts ?? DEFAULT_SHORTS_SAMPLE_CUTS, {
        episodeTitle: `${bufferPlan.seriesTitle} ${bufferPlan.nextEpisodeNumber}화 숏폼`,
      }),
    [bufferPlan.nextEpisodeNumber, bufferPlan.seriesTitle, shortsCuts],
  );

  const activeShowcaseAsset = showcaseAsset ?? DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS[0];

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  return (
    <div
      data-studio-creative-hours-card
      className={`flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs text-fg break-keep [overflow-wrap:break-word] ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold leading-[1.4] tracking-[-0.01em] text-fg">
          <Clock className="size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
          <span>내 창작 시간 · 웰니스</span>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
            stats.isCurrentlyIdle
              ? "bg-warn/20 text-warn"
              : "bg-good/20 text-good"
          }`}
        >
          {stats.isCurrentlyIdle ? (
            <>
              <PauseCircle className="size-3" strokeWidth={1.5} aria-hidden="true" />
              <span>휴식 중</span>
            </>
          ) : (
            <>
              <PlayCircle className="size-3" strokeWidth={1.5} aria-hidden="true" />
              <span>작업 중</span>
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[0.72rem]">
        <div className="rounded-lg bg-panel/70 p-2.5">
          <span className="text-fg-3">총 누적 시간</span>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
            {stats.totalDurationFormatted}
          </div>
        </div>
        <div className="rounded-lg bg-panel/70 p-2.5">
          <span className="text-fg-3">이번 세션 시간</span>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-accent">
            {stats.sessionDurationFormatted}
          </div>
        </div>
        <div className="rounded-lg bg-panel/70 p-2.5">
          <span className="text-fg-3">총 획(스트로크) 수</span>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
            {formatNumber(stats.strokeCount)}회
          </div>
        </div>
        <div className="rounded-lg bg-panel/70 p-2.5">
          <div className="flex items-center gap-1 text-fg-3">
            <Flame className="size-3 text-warn" strokeWidth={1.5} aria-hidden="true" />
            <span>작업 페이스</span>
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
            {stats.strokesPerMinute} 획/분
          </div>
        </div>
      </div>

      {/* 예방형 창작자 인체공학 웰니스 영역 (중첩 보더 없이 헤어라인으로 분리) */}
      <div className="flex flex-col gap-2 border-t border-line/60 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg-2">
            <HeartPulse className="size-3.5 text-accent" strokeWidth={1.5} aria-hidden="true" />
            자세·손목 예방 체크
          </span>
          <span className="tabular-nums text-[0.68rem] text-fg-3">
            {checkedIds.length}/{POSTURE_CHECKS.length} 완료
          </span>
        </div>
        {breakRecommended ? (
          <p
            className="rounded-lg bg-warn/15 px-2.5 py-2 text-[0.72rem] font-medium leading-[1.55] tracking-[-0.01em] text-warn"
            role="status"
          >
            연속 {sessionMinutes}분 작업 중입니다. 5분간 손목·목 스트레칭을 권장합니다.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {POSTURE_CHECKS.map((item) => {
            const active = checkedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCheck(item.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[0.72rem] leading-[1.4] transition-colors duration-150 sm:min-h-9 ${
                  active
                    ? "bg-accent-soft text-accent font-semibold"
                    : "bg-panel/60 text-fg-2 hover:bg-raised"
                }`}
              >
                <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 연재 마감 버퍼 · 9:16 숏폼 큐 · 마켓 Before/After 시연 킷 */}
      <div className="flex flex-col gap-2 border-t border-line/60 pt-2.5">
        <button
          type="button"
          aria-expanded={promoKitOpen}
          aria-controls={promoSectionId}
          onClick={() => setPromoKitOpen((open) => !open)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-panel/70 px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg transition-colors duration-150 hover:bg-raised"
        >
          <span>연재 마감 버퍼 · 숏폼 큐 · 시연 카드</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${BUFFER_ALERT_BADGE_CLASS[bufferPlan.alertLevel]}`}
            >
              {bufferPlan.alertLabelKo}
            </span>
            {promoKitOpen ? (
              <ChevronUp className="size-3.5 text-fg-2" strokeWidth={1.6} aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5 text-fg-2" strokeWidth={1.6} aria-hidden="true" />
            )}
          </span>
        </button>

        {promoKitOpen ? (
          <div id={promoSectionId} data-creator-promo-kit-panel="true" className="flex flex-col gap-2.5">
            <div className="rounded-lg bg-panel/60 p-2.5 text-[0.72rem] leading-[1.5]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-fg">2주 전 마감 버퍼</span>
                <span className="tabular-nums text-fg-3">
                  비축 {bufferPlan.buffer.stockpiledBufferDays}일 · 주간 권장{" "}
                  {bufferPlan.recommendation.recommendedWeeklyCuts}컷
                </span>
              </div>
              <p className="mt-1 text-fg-2">{bufferPlan.alertHeadlineKo}</p>
              <p className="mt-1 text-[0.68rem] text-fg-3">{bufferPlan.noticeDraft.title}</p>
            </div>

            <div className="rounded-lg bg-panel/60 p-2.5 text-[0.72rem] leading-[1.5]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-fg">9:16 숏폼 · 로컬 오디오 큐</span>
                <span className="tabular-nums text-fg-3">
                  {shortsPlan.reels.length}편 · 자막 {shortsPlan.totalCues}건 · SFX{" "}
                  {shortsPlan.totalAudioStems}건
                </span>
              </div>
              <p className="mt-1 text-fg-2">
                총 {Math.round(shortsPlan.totalDurationMs / 100) / 10}초 · SRT/WebVTT/JSON 및 ₩0
                WebAudio 스템 준비 완료
              </p>
            </div>

            <StudioBeforeAfterShowcaseCard asset={activeShowcaseAsset} compact />
          </div>
        ) : null}
      </div>

      {onResetSession && (
        <div className="flex justify-end border-t border-line/40 pt-1.5">
          <button
            type="button"
            onClick={onResetSession}
            aria-label="세션 시간 초기화"
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent sm:min-h-9 sm:w-auto"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>세션 리셋</span>
          </button>
        </div>
      )}
    </div>
  );
}
