import { AlertTriangle, Gauge, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApiResource } from "@/platform/use-api-resource";

import {
  formatWebVitalValue,
  webVitalRatingLabel,
  webVitalRatingTone,
} from "./web-vitals-format";
import type {
  WebVitalsAlert,
  WebVitalsPathSummary,
  WebVitalsReport,
} from "./web-vitals-types";

const RANGE_OPTIONS = [7, 30, 90] as const;

const TONE_CLASS: Record<"good" | "warn" | "bad" | "muted", string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  muted: "bg-slate-100 text-slate-500",
};

function AlertList({ alerts }: { alerts: WebVitalsAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="성능 회귀 경보" className="mt-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-red-700">
        <AlertTriangle className="h-5 w-5" aria-hidden />
        회귀 경보 {alerts.length}건
      </h2>
      <ul className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <li
            key={`${alert.path}-${alert.metric}-${alert.kind}`}
            className={
              alert.severity === "critical"
                ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
                : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            }
          >
            <span className="font-semibold">
              {alert.severity === "critical" ? "심각" : "주의"} · {alert.path} {alert.metric}
            </span>
            <span className="ml-2">{alert.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PathCard({ summary }: { summary: WebVitalsPathSummary }) {
  return (
    <section
      aria-label={`${summary.path} 성능 실측`}
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{summary.path}</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[
            summary.status === "pass"
              ? "good"
              : summary.status === "fail"
                ? "bad"
                : "muted"
          ]}`}
        >
          {summary.status === "pass"
            ? "기준 통과"
            : summary.status === "fail"
              ? "기준 미달"
              : "표본 부족"}
        </span>
      </header>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {summary.metrics.map((metric) => (
          <div key={metric.metric} className="rounded-xl bg-slate-50 px-3 py-3">
            <dt className="text-xs font-medium text-slate-500">
              {metric.metric} · p75
            </dt>
            <dd className="mt-1 text-lg font-bold">
              {formatWebVitalValue(metric.metric, metric.p75)}
            </dd>
            <dd className="mt-1">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[webVitalRatingTone(metric.rating)]}`}
              >
                {webVitalRatingLabel(metric.rating)}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                표본 {metric.samples}건
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * CWV 실측 대시보드 (G6 성능 실측 체계).
 *
 * 번들 게이트(랩 측정)와 별개로, 실제 방문자 브라우저에서 수집한 필드
 * 데이터만 보여 준다. 숫자는 서버 집계(p75·등급·회귀 판정)를 그대로
 * 표시하며, 표본이 부족하면 숫자를 만들지 않고 "표본 부족"으로 남긴다.
 * 회귀 경보는 페이지 최상단에 먼저 노출한다 — 대시보드를 열자마자
 * "느려진 곳이 있는가"에 답하는 것이 이 화면의 목적이다.
 */
export function WebVitalsDashboardPage() {
  const t = useT();
  const [days, setDays] = useState<number>(30);
  const { data, loading, error, reload } = useApiResource<WebVitalsReport>(
    `/api/admin/traffic/web-vitals?days=${days}`,
    t("adminWebVitals.error", "성능 실측을 불러오지 못했습니다."),
  );

  return (
    <Container>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Gauge className="h-6 w-6" aria-hidden />
          {t("adminWebVitals.title", "성능 실측 (Core Web Vitals)")}
        </h1>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={buttonClass({
                variant: days === option ? "solid" : "outline",
                size: "sm",
              })}
            >
              {option}일
            </button>
          ))}
          <button
            type="button"
            onClick={() => reload()}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden />
            새로고침
          </button>
        </div>
      </header>

      {loading && !data ? (
        <div role="status" aria-label="성능 실측 불러오는 중" className="mt-6 space-y-4">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">
            {t("adminWebVitals.loadFailed", "성능 실측을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")}
          </p>
          <button
            type="button"
            onClick={() => reload()}
            className={`${buttonClass({ variant: "solid", size: "sm" })} mt-4`}
          >
            다시 불러오기
          </button>
        </div>
      ) : data ? (
        <>
          <AlertList alerts={data.alerts} />
          {data.paths.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
              {t(
                "adminWebVitals.empty",
                "아직 수집된 실측 데이터가 없어요. 공개 페이지 방문이 쌓이면 여기에 표시됩니다.",
              )}
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {data.paths.map((summary) => (
                <PathCard key={summary.path} summary={summary} />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">
            최근 {data.windowDays}일 실측 · 직전 {data.windowDays}일과 비교해 회귀를 판정합니다 ·
            기준 LCP 2.5초 · CLS 0.1 · INP 200ms (p75)
          </p>
        </>
      ) : null}
    </Container>
  );
}
