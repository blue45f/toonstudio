import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { AlertTriangle, CheckCircle2, Gauge, Info } from "lucide-react";
import { useMemo } from "react";

import {
  buildDeadlineRiskForecast,
  DEADLINE_RISK_BAND_LABELS,
  type DeadlineRiskBand,
} from "./production-deadline-risk-forecast";

import { cn } from "@/shared/lib/utils";

const BAND_STYLES: Readonly<Record<DeadlineRiskBand, string>> = {
  comfortable: "border-cool/35 bg-cool/10 text-cool",
  caution: "border-warn/40 bg-warn/10 text-warn",
  risk: "border-bad/40 bg-bad/10 text-bad",
  "insufficient-data": "border-line bg-raised text-fg-2",
};

/**
 * 마감 위험 예보 (REPORT T-1): 회차 운영 카드 안에서 지난 회차 실측과
 * 현재 진행 속도를 비교한 구간(여유/주의/위험)과 근거 수치를 함께 보여 준다.
 * 근거가 부족하면 구간 대신 그 사실을 표시한다. 확정 예측 문구는 쓰지 않는다.
 */
export function ProductionDeadlineRiskForecast({
  aggregate,
  episodeId,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
}) {
  const forecast = useMemo(
    () => buildDeadlineRiskForecast(aggregate, episodeId),
    [aggregate, episodeId],
  );
  if (!forecast) return null;
  const attention = forecast.band === "risk" || forecast.band === "caution";
  return (
    <section
      aria-label="마감 위험 예보"
      className="rounded-xl border border-line bg-panel p-3"
      data-testid="deadline-risk-forecast"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Gauge className="size-3.5 text-accent" aria-hidden="true" />
          마감 위험 예보
        </p>
        <span
          className={cn(
            "rounded-lg border px-2 py-1 text-[0.6875rem] font-black",
            BAND_STYLES[forecast.band],
          )}
        >
          {DEADLINE_RISK_BAND_LABELS[forecast.band]}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">
        {forecast.evidence.map((line) => (
          <li key={line} className="flex gap-2">
            {forecast.band === "insufficient-data" ? (
              <Info className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden="true" />
            ) : attention ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />
            )}
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-line/60 pt-2 text-[0.6875rem] leading-5 text-fg-3">
        {forecast.note}
      </p>
    </section>
  );
}
