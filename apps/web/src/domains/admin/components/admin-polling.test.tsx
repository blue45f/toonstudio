// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "./AdminDashboard";
import { AdminHeaderStats } from "./AdminHeaderStats";
import { AdminTraffic } from "./AdminTraffic";
import type { TrafficOverview, TrafficPulse } from "./admin-client";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<(path: string, uid: string, init?: RequestInit) => Promise<unknown>>(),
  t: (key: string) => key,
}));
vi.mock("./admin-client", async (original) => ({
  ...await original<typeof import("./admin-client")>(),
  adminFetch: mocks.fetch,
}));
vi.mock("@/shared/lib/i18n", () => ({
  useT: () => mocks.t,
  useI18n: (select: (state: { lang: string }) => unknown) => select({ lang: "ko" }),
}));
vi.mock("../traffic/WebVitalsDashboardPage", () => ({ WebVitalsDashboardPage: () => null }));

const generatedAt = "2026-11-19T00:00:00.000Z";
const health = {
  status: "healthy", database: { status: "healthy", latencyMs: 3 },
  counts: { users: 12345, reviews: 0, fanPosts: 0, revenueEvents: 0 },
  maintenance: { enabled: false },
};
const pulse: TrafficPulse = {
  generatedAt, windowMinutes: 5, activeVisitors: 0, activeSessions: 0,
  pageViews5m: 0, pageViews30m: 0, latestAt: null, series: [],
};
const overview: TrafficOverview = {
  generatedAt, rangeDays: 7, bucketSeconds: 3600, status: "empty", storageMode: "d1", retentionDays: 90,
  privacy: { storesRawIp: false, storesQueryString: false, honorsBrowserPrivacySignals: true, adminPathsExcluded: true },
  realtime: pulse,
  totals: { pageViews: 0, uniqueVisitors: 0, sessions: 0, returningVisitors: 0, coverageStartAt: null, latestAt: null, averageLoadTimeMs: null },
  engagement: { engagedSessions: 0, bounceRate: 0, averageEngagedSeconds: 0, pageViewsPerSession: 0 },
  sharing: { attempts: 0, opened: 0, completed: 0, failed: 0, cancelled: 0, uniqueSharers: 0, attributedPageViews: 0, attributedVisitors: 0, attributedSessions: 0, channels: [], topContent: [] },
  series: [], realtimeSeries: [], topPages: [], sources: [], devices: [], browsers: [], countries: [], recent: [],
};
const dashboard = {
  updatedAt: generatedAt,
  users: { total: 1, activeLast7d: 0, activeLast30d: 0, admins: 1, creators: 0 },
  community: { fanPosts: 0, fanReplies: 0, reviewReplies: 0, reviews: 0, userActivity: 0 },
  monetization: { planCount: 0, activePlanCount: 0, campaignCount: 0, revenuePendingCents: 0, revenuePaidCents: 0, pendingEvents: 0, periodDays: 30 },
};
function response(path: string): unknown {
  if (path === "/system/health") return health;
  if (path === "/traffic/pulse") return pulse;
  if (path.startsWith("/traffic?")) return overview;
  if (path.startsWith("/dashboard?")) return dashboard;
  return { items: [] };
}
let visibility: DocumentVisibilityState;
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  mocks.fetch.mockReset();
  mocks.fetch.mockImplementation(async (path) => response(path));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function advance(milliseconds = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}
async function show(value: DocumentVisibilityState) {
  await act(async () => {
    visibility = value;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("관리자 화면의 폴링과 조회 취소", () => {
  it("Header는 숨김 최초 요청과 겹친 폴링을 막고 종료 시 진행 요청을 취소한다", async () => {
    visibility = "hidden";
    const view = render(<AdminHeaderStats userId="admin-a" />);
    await advance(60_000);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await show("visible");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    const pending: Array<{ signal?: AbortSignal | null; resolve: (value: unknown) => void }> = [];
    mocks.fetch.mockImplementation((_path, _uid, init) => new Promise((resolve) => {
      pending.push({ signal: init?.signal, resolve });
    }));
    await advance(45_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    await show("hidden");
    await advance(60_000);
    await show("visible");
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    view.unmount();
    expect(pending.every((request) => request.signal?.aborted)).toBe(true);
    await act(async () => { for (const request of pending) request.resolve(health); });
  });

  it("계정이 바뀌면 이전 Header 데이터를 표시하지 않고 새 계정으로 조회한다", async () => {
    const view = render(<AdminHeaderStats userId="admin-a" />);
    await advance();
    expect(screen.getByText("admin.stats.health")).toBeTruthy();
    const finishes: Array<(value: unknown) => void> = [];
    mocks.fetch.mockImplementation(() => new Promise((resolve) => { finishes.push(resolve); }));
    view.rerender(<AdminHeaderStats userId="admin-b" />);
    await advance();
    expect(screen.queryByText("admin.stats.health")).toBeNull();
    expect(mocks.fetch.mock.calls.slice(-2).every((call) => call[1] === "admin-b")).toBe(true);
    view.unmount();
    await act(async () => { for (const finish of finishes) finish(health); });
  });

  it("Dashboard는 기간 전환 시 이전 요청을 취소하고 늦은 오류로 새 화면을 덮지 않는다", async () => {
    const view = render(<AdminDashboard uid="admin-a" />);
    await advance();
    let failPrevious: (error: Error) => void = () => undefined;
    let previousSignal: AbortSignal | null | undefined;
    mocks.fetch.mockImplementation((path, _uid, init) => {
      if (path === "/dashboard?days=7") {
        previousSignal = init?.signal;
        return new Promise((_resolve, reject) => { failPrevious = reject; });
      }
      return Promise.resolve(response(path));
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7" } });
    await advance();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "90" } });
    await advance();
    expect(previousSignal?.aborted).toBe(true);
    await act(async () => { failPrevious(new Error("이전 기간의 오류")); });
    expect(screen.queryByText("이전 기간의 오류")).toBeNull();

    const count = mocks.fetch.mock.calls.length;
    await show("hidden");
    await advance(120_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(count);
    await show("visible");
    expect(mocks.fetch).toHaveBeenCalledTimes(count + 4);
    view.rerender(<AdminDashboard uid="admin-b" />);
    await advance();
    expect(mocks.fetch.mock.calls.slice(-4).every((call) => call[1] === "admin-b")).toBe(true);
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("30");
  });

  it("Traffic는 자동 갱신 OFF를 유지하면서 수동·기간 변경 조회를 허용한다", async () => {
    visibility = "hidden";
    render(<AdminTraffic uid="admin-a" />);
    await advance(60_000);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await show("visible");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "admin.traffic.autoRefresh" }));
    await advance();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await show("hidden");
    await show("visible");
    await advance(360_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "admin.traffic.refresh" }));
    await advance();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole("button", { name: "admin.traffic.range30" }));
    await advance();
    expect(mocks.fetch).toHaveBeenCalledTimes(6);
    expect(mocks.fetch).toHaveBeenCalledWith("/traffic?days=30", "admin-a", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    fireEvent.click(screen.getByRole("button", { name: "admin.traffic.autoRefresh" }));
    await advance(15_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(7);
    await show("hidden");
    await advance(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(7);
    await show("visible");
    expect(mocks.fetch).toHaveBeenCalledTimes(9);
  });
});
