import { AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink, RefreshCw, Tag } from "lucide-react";

import type { PricingTransitionEvent, PricingTransitionKind } from "@/shared/lib/pricing-transition-timeline";
import { cn } from "@/shared/lib/utils";

export interface PriceTransitionTimelineProps {
  readonly events: readonly PricingTransitionEvent[];
  readonly loading?: boolean;
  readonly errorMessage?: string | null;
  readonly onRetry?: () => void;
  readonly onEnableAlert?: () => void;
  readonly alertEnabled?: boolean;
  readonly className?: string;
}

const BADGE_META: Record<PricingTransitionKind, { readonly label: string; readonly tone: string }> = {
  "free-conversion": { label: "무료 전환", tone: "bg-raised text-good" },
  "wait-free-conversion": { label: "기다무 전환", tone: "bg-accent-soft text-accent" },
  "subscription-added": { label: "구독 편입", tone: "bg-raised text-cool" },
  "completed-binge": { label: "완결 전환", tone: "bg-raised text-good" },
  "model-change": { label: "모델 변경", tone: "bg-raised text-fg-2" },
};

/**
 * 스냅샷 diff 기반 가격 모델 변동 · 무료 전환 타임라인.
 * 중첩 카드 없이 헤어라인 구분선과 의미 토큰만으로 표현하며, 모델 기준임을 정직하게 고지한다.
 */
export function PriceTransitionTimeline({
  events,
  loading = false,
  errorMessage = null,
  onRetry,
  onEnableAlert,
  alertEnabled = false,
  className,
}: PriceTransitionTimelineProps) {
  return (
    <section
      aria-label="무료 전환 및 이용 방식 변동 기록"
      data-testid="price-transition-timeline"
      className={cn("rounded-2xl border border-line bg-panel/45 p-4 text-fg", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-1.5">
          <Tag size={15} className="shrink-0 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
            무료 전환 · 이용 방식 타임라인
          </h3>
        </div>
        {onEnableAlert && (
          <button
            type="button"
            aria-pressed={alertEnabled}
            onClick={onEnableAlert}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              alertEnabled
                ? "bg-accent-soft text-accent"
                : "bg-raised text-fg-2 hover:text-fg",
            )}
          >
            {alertEnabled ? (
              <CheckCircle2 size={13} aria-hidden="true" />
            ) : (
              <Bell size={13} aria-hidden="true" />
            )}
            {alertEnabled ? "무료 전환 알림 켜짐" : "무료 전환 시 알림 받기"}
          </button>
        )}
      </header>

      {errorMessage ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-raised p-3 text-xs">
          <span className="flex items-center gap-2 text-bad">
            <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-medium text-fg hover:bg-canvas"
            >
              <RefreshCw size={13} aria-hidden="true" />
              다시 불러오기
            </button>
          )}
        </div>
      ) : loading ? (
        <div aria-busy="true" aria-label="변동 기록 불러오는 중" className="mt-3 space-y-2.5">
          {[0, 1].map((idx) => (
            <div key={idx} className="h-12 rounded-xl bg-raised/70 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="mt-3 space-y-1.5 py-2 text-xs text-fg-2">
          <p className="font-medium text-fg [word-break:keep-all]">
            최근 스냅샷 기준 무료 전환이나 이용 방식 변동이 없습니다.
          </p>
          <p className="leading-relaxed text-fg-3 [word-break:keep-all]">
            카탈로그 스냅샷이 갱신될 때 유료에서 기다무·무료로 바뀌거나 완결로 전환되면 이곳에 기록됩니다.
          </p>
        </div>
      ) : (
        <ol className="mt-2 divide-y divide-line/60">
          {events.map((event) => {
            const badge = BADGE_META[event.kind];
            return (
              <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-2 last:pb-1">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", badge.tone)}>
                      {badge.label}
                    </span>
                    <span className="inline-flex items-center gap-1 font-display text-[0.7rem] text-fg-3 tnum">
                      <Clock size={11} aria-hidden="true" />
                      {event.observedAt}
                    </span>
                    <span className="text-[0.7rem] text-fg-3">
                      {event.previousLabel} → <strong className="font-semibold text-fg">{event.currentLabel}</strong>
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                    {event.summaryKo}
                  </p>
                </div>
                {event.platformId && event.url && (
                  <a
                    href={`/api/go/${event.platformId}?to=${encodeURIComponent(event.url)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-raised px-3 text-xs font-medium text-fg hover:text-accent"
                  >
                    {event.platformName ?? event.platformId}
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-2.5 border-t border-line/50 pt-2 text-[0.66rem] leading-relaxed text-fg-3 [word-break:keep-all]">
        ※ 스냅샷 비교로 감지된 이용 방식(무료·기다무·유료·완결) 변동 기록입니다. 실제 프로모션과 단가는 제공 플랫폼에서 최종 확인하세요.
      </p>
    </section>
  );
}
