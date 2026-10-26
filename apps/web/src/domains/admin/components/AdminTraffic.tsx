import {
  Activity,
  Clock3,
  Compass,
  Download,
  Eye,
  Globe2,
  Laptop,
  MousePointerClick,
  Radio,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  adminFetch,
  downloadTrafficOverviewCsv,
  formatNum,
  formatTrafficDateTime,
  formatTrafficDuration,
  formatTrafficMilliseconds,
  TRAFFIC_OVERVIEW_REFRESH_MS,
  TRAFFIC_PULSE_REFRESH_MS,
  TRAFFIC_RANGE_DAYS,
  TRAFFIC_RANGE_LABEL_KEYS,
  type AdminTrafficTranslator,
  type TrafficOverview,
  type TrafficPulse,
  type TrafficRangeDays,
  type TrafficSeriesPoint,
} from "./admin-client";
import {
  AdminCard,
  AdminEmptyState,
  AdminNotice,
  AdminSpinner,
} from "./admin-ui";
import {
  AdminTrafficSharing,
  TrafficBreakdownList,
  TrafficMetricCard,
  TrafficRecentStream,
  TrafficSourceList,
  TrafficTopPages,
} from "./AdminTrafficBreakdowns";
import { WebVitalsDashboardPage } from "../traffic/WebVitalsDashboardPage";

import { useI18n, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

function linePath(
  points: TrafficSeriesPoint[],
  accessor: (point: TrafficSeriesPoint) => number,
  width: number,
  height: number,
  maximum: number,
): string {
  if (!points.length) return "";
  return points
    .map((point, index) => {
      const x =
        points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - (accessor(point) / maximum) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrafficTrendChart({
  points,
  locale,
  t,
}: {
  points: TrafficSeriesPoint[];
  locale: string;
  t: AdminTrafficTranslator;
}) {
  const width = 760;
  const height = 220;
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [point.pageViews, point.visitors]),
  );
  const pageViewPath = linePath(
    points,
    (point) => point.pageViews,
    width,
    height,
    maximum,
  );
  const visitorPath = linePath(
    points,
    (point) => point.visitors,
    width,
    height,
    maximum,
  );

  return (
    <AdminCard className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-accent" />
            <h3 className="text-sm font-semibold text-fg">
              {t("admin.traffic.trend")}
            </h3>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[0.7rem] text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" />
              {t("admin.traffic.pageViewsLegend")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-cool" />
              {t("admin.traffic.visitorsLegend")}
            </span>
          </div>
        </div>
        {points.length ? (
          <p className="text-[0.7rem] text-fg-3">
            {formatTrafficDateTime(points[0]?.bucket, locale)} —{" "}
            {formatTrafficDateTime(points.at(-1)?.bucket, locale)}
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`-12 -12 ${width + 24} ${height + 24}`}
          className="h-56 min-w-[620px] w-full"
          role="img"
          aria-label={`${t("admin.traffic.trend")}: ${formatNum(
            points.reduce((sum, point) => sum + point.pageViews, 0),
          )} ${t("admin.traffic.pageViews")}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={0}
              x2={width}
              y1={height * ratio}
              y2={height * ratio}
              className="stroke-line"
              strokeWidth={1}
            />
          ))}
          <path
            d={pageViewPath}
            fill="none"
            className="stroke-accent"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={visitorPath}
            fill="none"
            className="stroke-cool"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => {
            const x =
              points.length === 1
                ? width / 2
                : (index / (points.length - 1)) * width;
            const y = height - (point.pageViews / maximum) * height;
            return (
              <circle
                key={`${point.bucket}-${index}`}
                cx={x}
                cy={y}
                r={points.length < 40 ? 3 : 1.5}
                className="fill-accent"
              >
                <title>
                  {formatTrafficDateTime(point.bucket, locale)} ·{" "}
                  {point.pageViews} {t("admin.traffic.pageViews")}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>

      <details className="mt-2 text-xs text-fg-3">
        <summary className="cursor-pointer select-none py-1">
          {t("admin.traffic.trend")} data
        </summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-card text-[0.7rem]">
              <tr>
                <th scope="col" className="px-3 py-2">{t("admin.traffic.time")}</th>
                <th scope="col" className="px-3 py-2">{t("admin.traffic.pageViews")}</th>
                <th scope="col" className="px-3 py-2">{t("admin.traffic.visitors")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.bucket} className="border-t border-line">
                  <td className="px-3 py-2">
                    {formatTrafficDateTime(point.bucket, locale)}
                  </td>
                  <td className="px-3 py-2">{formatNum(point.pageViews)}</td>
                  <td className="px-3 py-2">{formatNum(point.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </AdminCard>
  );
}

export function TrafficRealtimeBars({
  points,
  locale,
  t,
}: {
  points: TrafficSeriesPoint[];
  locale: string;
  t: AdminTrafficTranslator;
}) {
  const maximum = Math.max(1, ...points.map((point) => point.pageViews));
  return (
    <AdminCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-good" />
          <h3 className="text-sm font-semibold text-fg">
            {t("admin.traffic.realtime30m")}
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-good">
          <span className="size-1.5 animate-pulse rounded-full bg-good" />
          {t("admin.traffic.live")}
        </span>
      </div>
      <div
        className="mt-5 flex h-28 items-end gap-1"
        role="img"
        aria-label={t("admin.traffic.realtime30m")}
      >
        {points.length ? (
          points.map((point) => (
            <div
              key={point.bucket}
              className="group relative min-w-0 flex-1 rounded-t bg-accent/65 transition-colors hover:bg-accent"
              style={{
                height: `${Math.max(4, (point.pageViews / maximum) * 100)}%`,
              }}
            >
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-canvas px-2 py-1 text-[0.65rem] text-fg shadow-lg group-hover:block">
                {formatTrafficDateTime(point.bucket, locale)} ·{" "}
                {point.pageViews}
              </span>
            </div>
          ))
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-line text-xs text-fg-3">
            {t("admin.traffic.noData")}
          </div>
        )}
      </div>
      {points.length ? (
        <ul className="sr-only">
          {points.map((point) => (
            <li key={point.bucket}>
              {formatTrafficDateTime(point.bucket, locale)}: {point.pageViews}{" "}
              {t("admin.traffic.pageViews")}, {point.visitors}{" "}
              {t("admin.traffic.visitors")}
            </li>
          ))}
        </ul>
      ) : null}
    </AdminCard>
  );
}

const EMPTY_SHARING: TrafficOverview["sharing"] = {
  attempts: 0,
  opened: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  uniqueSharers: 0,
  attributedPageViews: 0,
  attributedVisitors: 0,
  attributedSessions: 0,
  channels: [],
  topContent: [],
};

function withPulse(
  overview: TrafficOverview,
  pulse: TrafficPulse,
): TrafficOverview {
  return {
    ...overview,
    generatedAt: pulse.generatedAt,
    status:
      overview.status === "live" || pulse.pageViews30m > 0
        ? "live"
        : "empty",
    realtime: {
      windowMinutes: pulse.windowMinutes,
      activeVisitors: pulse.activeVisitors,
      activeSessions: pulse.activeSessions,
      pageViews5m: pulse.pageViews5m,
      pageViews30m: pulse.pageViews30m,
      latestAt: pulse.latestAt,
    },
    realtimeSeries: pulse.series,
  };
}

export function AdminTraffic({ uid }: { uid: string }) {
  const t = useT();
  const locale = useI18n((state) => state.lang);
  const [days, setDays] = useState<TrafficRangeDays>(7);
  const [data, setData] = useState<TrafficOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [pulseError, setPulseError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const dataRef = useRef<TrafficOverview | null>(null);
  const overviewSequence = useRef(0);
  const pulseSequence = useRef(0);
  const emptyRefreshRequestedAt = useRef(0);

  const publishData = useCallback((next: TrafficOverview) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const loadOverview = useCallback(
    async (background = false) => {
      const sequence = ++overviewSequence.current;
      if (!background) setRefreshing(true);
      try {
        const next = await adminFetch<TrafficOverview>(
          `/traffic?days=${days}`,
          uid,
        );
        if (sequence !== overviewSequence.current) return;
        publishData(next);
        setOverviewError(null);
      } catch (caught) {
        if (sequence !== overviewSequence.current) return;
        setOverviewError(
          caught instanceof Error
            ? caught.message
            : t("admin.traffic.loadError"),
        );
      } finally {
        if (sequence === overviewSequence.current && !background) {
          setRefreshing(false);
        }
      }
    },
    [days, publishData, t, uid],
  );

  const loadPulse = useCallback(async () => {
    const sequence = ++pulseSequence.current;
    try {
      const pulse = await adminFetch<TrafficPulse>("/traffic/pulse", uid);
      if (sequence !== pulseSequence.current) return;
      const current = dataRef.current;
      if (current) publishData(withPulse(current, pulse));
      setPulseError(null);

      if (
        current?.status === "empty"
        && pulse.pageViews30m > 0
        && Date.now() - emptyRefreshRequestedAt.current > 30_000
      ) {
        emptyRefreshRequestedAt.current = Date.now();
        void loadOverview(true);
      }
    } catch (caught) {
      if (sequence !== pulseSequence.current) return;
      setPulseError(
        caught instanceof Error
          ? caught.message
          : t("admin.traffic.loadError"),
      );
    }
  }, [loadOverview, publishData, t, uid]);

  useEffect(() => {
    setOverviewError(null);
    void loadOverview();
    void loadPulse();
  }, [loadOverview, loadPulse]);

  useEffect(() => {
    if (!autoRefresh) return;
    const refreshWhenVisible = (task: () => void) => {
      if (document.visibilityState === "visible") task();
    };
    const pulseInterval = globalThis.setInterval(
      () => refreshWhenVisible(() => void loadPulse()),
      TRAFFIC_PULSE_REFRESH_MS,
    );
    const overviewInterval = globalThis.setInterval(
      () => refreshWhenVisible(() => void loadOverview(true)),
      TRAFFIC_OVERVIEW_REFRESH_MS,
    );
    return () => {
      globalThis.clearInterval(pulseInterval);
      globalThis.clearInterval(overviewInterval);
    };
  }, [autoRefresh, loadOverview, loadPulse]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([loadOverview(), loadPulse()]);
  }, [loadOverview, loadPulse]);

  const error = overviewError ?? pulseError;
  if (!data && !error) return <AdminSpinner />;
  if (!data && error) {
    return (
      <AdminNotice
        title={t("admin.traffic.loadError")}
        body={error}
        onRetry={() => void refreshAll()}
        retryLabel={t("admin.traffic.retry")}
      />
    );
  }
  if (!data) return null;

  const statusStale = Boolean(overviewError || pulseError);
  const coverage = data.totals.coverageStartAt
    ? `${t("admin.traffic.coverage")} ${formatTrafficDateTime(
        data.totals.coverageStartAt,
        locale,
      )}`
    : null;
  const sharing = data.sharing ?? EMPTY_SHARING;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-fg">
                {t("admin.traffic.title")}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
                  statusStale
                    ? "border-warn/40 text-warn"
                    : "border-good/30 text-good",
                )}
              >
                {statusStale ? (
                  <WifiOff className="size-3" />
                ) : (
                  <Wifi className="size-3" />
                )}
                {statusStale
                  ? t("admin.traffic.stale")
                  : t("admin.traffic.live")}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-3">
              {t("admin.traffic.desc")}
            </p>
            <p className="mt-2 text-[0.7rem] text-fg-3">
              {t("admin.traffic.lastUpdated")} {" "}
              {formatTrafficDateTime(data.generatedAt, locale)}
              {coverage ? ` · ${coverage}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-xl border border-line bg-canvas p-1"
              aria-label={t("admin.traffic.rangeLabel")}
            >
              {TRAFFIC_RANGE_DAYS.map((range) => (
                <button
                  type="button"
                  key={range}
                  onClick={() => setDays(range)}
                  aria-pressed={days === range}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    days === range
                      ? "bg-accent text-on-accent"
                      : "text-fg-3 hover:text-fg",
                  )}
                >
                  {t(TRAFFIC_RANGE_LABEL_KEYS[range])}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              aria-pressed={autoRefresh}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium",
                autoRefresh
                  ? "border-good/30 text-good"
                  : "border-line text-fg-3",
              )}
            >
              <Radio className={cn("size-3.5", autoRefresh && "animate-pulse")} />
              {t("admin.traffic.autoRefresh")}
            </button>
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-2 hover:border-accent/50 hover:text-fg disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
              {t("admin.traffic.refresh")}
            </button>
            <button
              type="button"
              onClick={() => downloadTrafficOverviewCsv(data)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-2 hover:border-accent/50 hover:text-fg"
            >
              <Download className="size-3.5" />
              {t("admin.traffic.export")}
            </button>
            <a
              href="#web-vitals"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-2 hover:border-accent/50 hover:text-fg"
            >
              <Activity className="size-3.5 text-accent" />
              {t("admin.webVitals.title", "웹 바이탈 실사용 성능")}
            </a>
          </div>
        </div>
        {statusStale ? (
          <p
            role="status"
            className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn"
          >
            {[overviewError, pulseError].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </header>

      {data.status === "empty" ? (
        <AdminEmptyState
          icon={<Radio className="size-8" />}
          title={t("admin.traffic.noData")}
          description={t("admin.traffic.noDataDesc")}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <TrafficMetricCard
              icon={<Radio className="size-4" />}
              label={t("admin.traffic.activeNow")}
              value={formatNum(data.realtime.activeVisitors)}
              detail={`${formatNum(data.realtime.activeSessions)} ${t(
                "admin.traffic.sessions",
              )}`}
              live
            />
            <TrafficMetricCard
              icon={<Eye className="size-4" />}
              label={t("admin.traffic.views5m")}
              value={formatNum(data.realtime.pageViews5m)}
              detail={`${formatNum(data.realtime.pageViews30m)} / 30m`}
              live
            />
            <TrafficMetricCard
              icon={<MousePointerClick className="size-4" />}
              label={t("admin.traffic.pageViews")}
              value={formatNum(data.totals.pageViews)}
              detail={formatTrafficMilliseconds(
                data.totals.averageLoadTimeMs,
              )}
            />
            <TrafficMetricCard
              icon={<Users className="size-4" />}
              label={t("admin.traffic.uniqueVisitors")}
              value={formatNum(data.totals.uniqueVisitors)}
              detail={`${formatNum(data.totals.returningVisitors)} ${t(
                "admin.traffic.returningVisitors",
              )}`}
            />
            <TrafficMetricCard
              icon={<Activity className="size-4" />}
              label={t("admin.traffic.sessions")}
              value={formatNum(data.totals.sessions)}
              detail={`${formatNum(data.engagement.engagedSessions)} ${t(
                "admin.traffic.engagedSessions",
              )}`}
            />
            <TrafficMetricCard
              icon={<TrendingUp className="size-4" />}
              label={t("admin.traffic.viewsPerSession")}
              value={Number(
                data.engagement.pageViewsPerSession || 0,
              ).toFixed(2)}
            />
            <TrafficMetricCard
              icon={<Timer className="size-4" />}
              label={t("admin.traffic.avgEngagement")}
              value={formatTrafficDuration(
                data.engagement.averageEngagedSeconds,
              )}
            />
            <TrafficMetricCard
              icon={<Clock3 className="size-4" />}
              label={t("admin.traffic.bounceRate")}
              value={`${Number(data.engagement.bounceRate || 0).toFixed(1)}%`}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.75fr)]">
            <TrafficTrendChart points={data.series} locale={locale} t={t} />
            <TrafficRealtimeBars
              points={data.realtimeSeries}
              locale={locale}
              t={t}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
            <TrafficTopPages pages={data.topPages} t={t} />
            <TrafficSourceList sources={data.sources} t={t} />
          </div>

          <AdminTrafficSharing sharing={sharing} t={t} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TrafficBreakdownList
              title={t("admin.traffic.devices")}
              icon={<Laptop className="size-4" />}
              items={data.devices}
              t={t}
            />
            <TrafficBreakdownList
              title={t("admin.traffic.browsers")}
              icon={<Compass className="size-4" />}
              items={data.browsers}
              t={t}
            />
            <TrafficBreakdownList
              title={t("admin.traffic.countries")}
              icon={<Globe2 className="size-4" />}
              items={data.countries}
              t={t}
            />
            <TrafficRecentStream
              items={data.recent}
              locale={locale}
              t={t}
            />
          </div>
        </>
      )}

      <section
        id="web-vitals"
        aria-label={t("admin.webVitals.title", "웹 바이탈 실사용 성능")}
        className="rounded-2xl border border-line bg-card p-4 sm:p-5"
      >
        <WebVitalsDashboardPage />
      </section>

      <aside className="flex items-start gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-xs leading-relaxed text-fg-3">
        <Wifi className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          {t("admin.traffic.privacy")} · {t("admin.traffic.retention")}{" "}
          {data.retentionDays}
          {t("admin.traffic.daysUnit")} · {t("admin.traffic.storage")}{" "}
          {data.storageMode
            .split(/[_-]+/)
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ") || data.storageMode}
        </p>
      </aside>
    </div>
  );
}
