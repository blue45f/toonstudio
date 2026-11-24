import { CheckCircle2, Sparkles, Timer, X } from "lucide-react";
import { memo, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_WEBTOON_WORK_STATUSES,
  type StudioCelebrationEvent,
  type StudioWebtoonWorkStatusId,
} from "../studio-virtual-space-work-status";
import "./space-work-status.css";

interface SparkParticleSpec {
  readonly id: string;
  readonly x: string;
  readonly y: string;
  readonly color: string;
}

const CELEBRATION_SPARKS: readonly SparkParticleSpec[] = Object.freeze([
  { id: "s1", x: "-92px", y: "-26px", color: "oklch(0.78 0.16 250)" },
  { id: "s2", x: "-54px", y: "-38px", color: "oklch(0.76 0.16 294)" },
  { id: "s3", x: "-14px", y: "-42px", color: "oklch(0.8 0.15 162)" },
  { id: "s4", x: "28px", y: "-40px", color: "oklch(0.84 0.15 84)" },
  { id: "s5", x: "68px", y: "-30px", color: "oklch(0.76 0.16 34)" },
  { id: "s6", x: "98px", y: "-12px", color: "oklch(0.78 0.16 210)" },
  { id: "s7", x: "-72px", y: "20px", color: "oklch(0.78 0.15 330)" },
  { id: "s8", x: "74px", y: "18px", color: "oklch(0.8 0.15 140)" },
]);

export interface SpaceWorkStatusBarProps {
  readonly activeStatusId: StudioWebtoonWorkStatusId | null;
  readonly onSelectStatus: (next: StudioWebtoonWorkStatusId) => void;
  readonly focusActive: boolean;
  readonly onStartFocusSprint: () => void;
  readonly onCompleteCheckpoint: () => void;
}

/**
 * 1탭 웹툰 업무 상태 배지 5종 + 25분 집중 스프린트 / 공정 체크포인트 완료 축하 바.
 * 2D 캔버스·3D 오버레이·로스터와 localStorage로 실시간 동기화된다.
 */
export const SpaceWorkStatusBar = memo(function SpaceWorkStatusBar({
  activeStatusId,
  onSelectStatus,
  focusActive,
  onStartFocusSprint,
  onCompleteCheckpoint,
}: SpaceWorkStatusBarProps) {
  const bt = useBilingual("SpaceWorkStatusBar");
  return (
    <div
      className="space-work-status-bar"
      data-testid="space-work-status-bar"
      data-active-work-status={activeStatusId ?? "none"}
      data-space-interactive="true"
      data-app-tooltip-exclude="true"
    >
      <div
        className="space-work-status-bar__group"
        role="group"
        aria-label={bt("웹툰 업무 상태", "Webtoon work status")}
      >
        {STUDIO_WEBTOON_WORK_STATUSES.map((item) => {
          const active = activeStatusId === item.id;
          const label = bt(item.labelKo, item.labelEn);
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`work-status-btn-${item.id}`}
              className="space-work-status-bar__chip shrink-0 whitespace-nowrap"
              aria-pressed={active}
              style={{ "--work-status-accent": item.accentOklch } as CSSProperties}
              onClick={() => onSelectStatus(item.id)}
            >
              <span className="space-work-status-bar__dot shrink-0" aria-hidden="true" />
              <span className="shrink-0" aria-hidden="true">{item.glyph}</span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </div>

      <span className="space-work-status-bar__divider" aria-hidden="true" />

      <div className="space-work-status-bar__group" role="group" aria-label={bt("집중 및 마감 체크", "Focus & milestone check")}>
        {!focusActive ? (
          <button
            type="button"
            data-testid="space-focus-sprint-btn"
            className="space-work-status-bar__action shrink-0 whitespace-nowrap"
            onClick={onStartFocusSprint}
            title={bt("25분 웹툰 집중 스프린트 시작", "Start a 25-minute webtoon focus sprint")}
          >
            <Timer size={14} className="shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">{bt("25분 집중", "25m focus")}</span>
          </button>
        ) : null}
        <button
          type="button"
          data-testid={focusActive ? "space-focus-complete-btn" : "space-milestone-check-btn"}
          className="space-work-status-bar__action space-work-status-bar__action--celebrate shrink-0 whitespace-nowrap"
          onClick={onCompleteCheckpoint}
          title={
            focusActive
              ? bt("집중 스프린트 완료하고 축하 연출 보기", "Complete focus sprint with celebration")
              : bt("현재 공정 체크포인트 완료 기록", "Record production checkpoint completion")
          }
        >
          <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">{focusActive ? bt("집중 완료", "Finish sprint") : bt("공정 체크", "Check off")}</span>
        </button>
      </div>
    </div>
  );
});

export interface SpaceCelebrationRibbonProps {
  readonly event: StudioCelebrationEvent | null;
  readonly onDismiss: () => void;
}

/**
 * 집중 스프린트 또는 공정 체크포인트 완료 시 노출되는 OKLCH 스펙트럼 축하 리본.
 * prefers-reduced-motion: reduce 환경에서는 움직이는 파티클을 숨기고 정적 리본만 표시한다.
 */
export const SpaceCelebrationRibbon = memo(function SpaceCelebrationRibbon({
  event,
  onDismiss,
}: SpaceCelebrationRibbonProps) {
  const bt = useBilingual("SpaceCelebrationRibbon");
  if (!event) return null;
  return (
    <div
      key={event.id}
      className="space-celebration-ribbon"
      data-testid="space-celebration-ribbon"
      data-celebration-kind={event.kind}
      data-space-interactive="true"
      role="status"
      aria-live="polite"
    >
      <div className="space-celebration-ribbon__sparks" aria-hidden="true">
        {CELEBRATION_SPARKS.map((spark) => (
          <span
            key={spark.id}
            className="space-celebration-ribbon__spark"
            style={
              {
                "--spark-x": spark.x,
                "--spark-y": spark.y,
                "--spark-color": spark.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span className="space-celebration-ribbon__icon" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <div className="space-celebration-ribbon__copy">
        <strong className="space-celebration-ribbon__title">{bt(event.titleKo, event.titleEn)}</strong>
        <p className="space-celebration-ribbon__detail">{bt(event.detailKo, event.detailEn)}</p>
      </div>
      <button
        type="button"
        className="space-celebration-ribbon__close"
        aria-label={bt("축하 안내 닫기", "Dismiss celebration")}
        onClick={onDismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
});
