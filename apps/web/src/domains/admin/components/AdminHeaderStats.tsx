import {
  Activity,
  DollarSign,
  Flag,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { adminFetch } from "./admin-client";

import { useT } from "@/shared/lib/i18n";

interface SystemHealthRes {
  status: string;
  database: { latencyMs: number };
  counts: {
    users: number;
    reviews: number;
    fanPosts: number;
    revenueEvents: number;
  };
  maintenance: { enabled: boolean };
}

interface TrafficPulseRes {
  generatedAt: string;
  activeVisitors: number;
  activeSessions: number;
  pageViews5m: number;
  pageViews30m: number;
}

interface AdminHeaderStatsProps {
  userId: string;
}

export function AdminHeaderStats({ userId }: AdminHeaderStatsProps) {
  const [health, setHealth] = useState<SystemHealthRes | null>(null);
  const [traffic, setTraffic] = useState<TrafficPulseRes | null>(null);
  const t = useT();

  useEffect(() => {
    let unmounted = false;
    const fetchPulse = async () => {
      const [healthResult, trafficResult] = await Promise.allSettled([
        adminFetch<SystemHealthRes>("/system/health", userId),
        adminFetch<TrafficPulseRes>("/traffic/pulse", userId),
      ]);
      if (unmounted) return;
      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
      }
      if (trafficResult.status === "fulfilled") {
        setTraffic(trafficResult.value);
      }
    };
    void fetchPulse();
    const interval = globalThis.setInterval(() => void fetchPulse(), 15_000);
    return () => {
      unmounted = true;
      globalThis.clearInterval(interval);
    };
  }, [userId]);

  if (!health) return null;

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line/80 bg-card/40 p-4 backdrop-blur-xl sm:grid-cols-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-good/20 bg-good/10 p-2.5 text-good">
          <Activity className="size-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-fg-3">
            {t("admin.stats.health")}
          </p>
          <p className="flex items-center gap-1.5 pt-0.5 text-xs font-bold text-fg">
            <span
              className={`size-2 rounded-full ${
                health.status === "healthy"
                  ? "animate-pulse bg-good"
                  : "bg-bad"
              }`}
            />
            {health.status === "healthy"
              ? t("admin.stats.healthy")
              : t("admin.stats.degraded")}
            <span className="font-mono text-[10px] text-fg-3">
              ({health.database.latencyMs}ms)
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cool/20 bg-cool/10 p-2.5 text-cool">
          <Radio className="size-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-fg-3">
            {t("admin.stats.activeVisitors")}
          </p>
          <p className="pt-0.5 text-xs font-bold text-fg">
            {traffic ? traffic.activeVisitors.toLocaleString() : "—"}
            <span className="ml-1 font-normal text-fg-3">
              / {traffic ? traffic.pageViews5m.toLocaleString() : "—"} pv
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-accent/20 bg-accent/10 p-2.5 text-accent">
          <DollarSign className="size-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-fg-3">
            {t("admin.stats.revenueEvents")}
          </p>
          <p className="pt-0.5 text-xs font-bold text-fg">
            {health.counts.revenueEvents.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cool/20 bg-cool/10 p-2.5 text-cool">
          <Flag className="size-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-fg-3">
            {t("admin.stats.usersCommunity")}
          </p>
          <p className="pt-0.5 text-xs font-bold text-fg">
            {health.counts.users.toLocaleString()} /{" "}
            {health.counts.fanPosts.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-warn/20 bg-warn/10 p-2.5 text-warn">
          <ShieldAlert className="size-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-fg-3">
            {t("admin.stats.maintenance")}
          </p>
          <p className="pt-0.5 text-xs font-bold text-fg">
            {health.maintenance.enabled ? (
              <span className="font-bold text-bad">
                {t("admin.stats.maintenanceOn")}
              </span>
            ) : (
              <span className="text-fg-2">
                {t("admin.stats.maintenanceOff")}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
