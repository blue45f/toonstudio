import { AlertTriangle, ArrowRight, CheckCircle2, CloudOff, Loader2 } from "lucide-react";

import { useServiceCapabilityState } from "@/platform/service-capability-state";
import Link from "@/shared/navigation/router-link";
import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringHubStatusStrip", ko, en);

function formatCheckedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const locale = getActiveI18nLocale().startsWith("en") ? "en-US" : "ko-KR";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(timestamp);
}

/**
 * 기술 허브 상단 상태 스트립. 서비스 상태 스토어의 실제 확인 결과만 보여준다.
 * 아직 확인된 보고서가 없으면 정상이라고 말하지 않고 확인 전 상태와 상태 페이지 동선을 보여준다.
 */
export function EngineeringHubStatusStrip() {
  useBilingualI18nRevision();
  const state = useServiceCapabilityState();
  const report = state.report;
  const capabilities = report ? Object.values(report.capabilities) : [];
  const limitedCount = capabilities.filter((value) => value !== "available").length;

  let icon: typeof CheckCircle2;
  let iconClassName: string;
  let headline: string;
  let detail: string;
  if (report && state.status === "available") {
    icon = CheckCircle2;
    iconClassName = "text-good";
    headline = bi("전체 서비스 정상", "All services operational");
    detail = String(formatI18nTemplate(String(bi("{value0}개 기능 모두 사용 가능", "All {value0} capabilities are available")), { value0: capabilities.length }));
  } else if (report) {
    icon = AlertTriangle;
    iconClassName = "text-warn";
    headline = bi("일부 온라인 기능 제한 중", "Some online capabilities are limited");
    detail = limitedCount > 0
      ? String(formatI18nTemplate(String(bi("{value0}개 중 {value1}개 기능 제한 중", "{value1} of {value0} capabilities are limited")), { value0: capabilities.length, value1: limitedCount }))
      : bi("기능별 상태는 상태 페이지에서 확인할 수 있습니다.", "See per-capability status on the status page.");
  } else if (state.checking) {
    icon = Loader2;
    iconClassName = "animate-spin text-accent motion-reduce:animate-none";
    headline = bi("서비스 상태를 확인하고 있습니다", "Checking service status");
    detail = bi("확인이 끝나면 이 자리에 최신 상태가 표시됩니다.", "The latest status will appear here once the check completes.");
  } else {
    icon = CloudOff;
    iconClassName = "text-fg-3";
    headline = bi("서비스 상태를 아직 확인하지 못했습니다", "Service status has not been checked yet");
    detail = bi("확인 없이 정상이라고 말하지 않습니다. 상태 페이지에서 최신 확인 결과를 볼 수 있습니다.", "We never claim health without a check. See the latest result on the status page.");
  }
  const Icon = icon;

  return (
    <section
      aria-label={bi("서비스 상태 요약", "Service status summary")}
      className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl border border-line/70 bg-panel/70 px-5 py-4 shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon size={20} className={`shrink-0 ${iconClassName}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-black text-fg">{headline}</p>
          <p className="mt-0.5 text-xs leading-5 text-fg-3">{detail}</p>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        {report ? (
          <span className="text-xs font-bold text-fg-3">
            {bi("최근 확인", "Last checked")}{" "}
            <time dateTime={report.checkedAt}>{formatCheckedAt(report.checkedAt)}</time>
          </span>
        ) : null}
        {report?.incidentId ? (
          <span className="font-mono text-xs text-fg-3">
            {bi("장애 ID", "Incident ID")} {report.incidentId}
          </span>
        ) : null}
        <Link
          href="/status"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-card px-3.5 py-2 text-xs font-black text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {bi("상태 자세히 보기", "View status details")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
