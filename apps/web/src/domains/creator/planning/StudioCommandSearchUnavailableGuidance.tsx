import { ArrowRight, Info } from "lucide-react";

import type {
  StudioSearchAlternativeIntent,
  StudioSearchUnavailabilityGuidance,
} from "./studio-command-search-unavailability";

export function StudioCommandSearchOptionUnavailableMeta({
  guidance,
}: {
  readonly guidance: StudioSearchUnavailabilityGuidance;
}) {
  return (
    <span className="mt-1 flex flex-col gap-0.5 text-[0.64rem] leading-snug">
      <span
        data-search-unavailable-reason="true"
        className="line-clamp-1 text-fg-2"
      >
        이유: {guidance.reason}
      </span>
      <span
        data-search-required-mode="true"
        className="line-clamp-1 font-medium text-accent"
      >
        {guidance.requiredMode}
      </span>
    </span>
  );
}

export function StudioCommandSearchUnavailableCallout({
  guidance,
  onRunAlternative,
}: {
  readonly guidance: StudioSearchUnavailabilityGuidance;
  readonly onRunAlternative: (intent: StudioSearchAlternativeIntent) => void;
}) {
  return (
    <div
      role="region"
      aria-label={`${guidance.entryLabel} 사용 조건 및 대안`}
      data-search-unavailable-callout="true"
      className="mt-2 rounded-xl border border-accent/35 bg-accent-soft/45 p-2.5 text-xs text-fg"
    >
      <div className="flex items-start gap-2">
        <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-fg">
            “{guidance.entryLabel}” — 현 상태에서 바로 열 수 없음
          </p>
          <p
            data-search-callout-reason="true"
            className="text-[0.7rem] leading-relaxed text-fg-2"
          >
            이유: {guidance.reason}
          </p>
          <p
            data-search-callout-required-mode="true"
            className="text-[0.68rem] font-semibold text-accent"
          >
            {guidance.requiredMode}
          </p>
          {guidance.alternatives.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {guidance.alternatives.map((alternative, idx) => (
                <button
                  key={alternative.label}
                  type="button"
                  data-search-alternative-action="true"
                  data-search-alternative-primary={idx === 0 ? "true" : undefined}
                  onClick={() => onRunAlternative(alternative)}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    idx === 0
                      ? "border-accent bg-accent text-on-accent hover:opacity-95"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                  }`}
                >
                  <span>{alternative.label}</span>
                  <ArrowRight size={12} aria-hidden />
                </button>
              ))}
              <span className="text-[0.62rem] text-fg-3">
                Alt+Enter 로 첫 대안 바로 이동
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
