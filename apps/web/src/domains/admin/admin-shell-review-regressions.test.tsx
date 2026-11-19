// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, useCallback, useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "./components/AdminDashboard";
import { AdminHeaderStats } from "./components/AdminHeaderStats";
import { AdminTraffic } from "./components/AdminTraffic";
import type { TrafficOverview, TrafficPulse } from "./components/admin-client";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { api } from "@/platform/api";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<(path: string, uid: string, init?: RequestInit) => Promise<unknown>>(),
  t: (key: string) => key,
}));
vi.mock("./components/admin-client", async (original) => ({
  ...await original<typeof import("./components/admin-client")>(),
  adminFetch: mocks.fetch,
}));
vi.mock("@/shared/lib/i18n", () => ({
  useT: () => mocks.t,
  useI18n: (select: (state: { lang: string }) => unknown) => select({ lang: "ko" }),
}));
vi.mock("./traffic/WebVitalsDashboardPage", () => ({ WebVitalsDashboardPage: () => null }));

// 화면 mock과 별개로 요청·수명주기 계약은 실제 클라이언트 구현을 검증한다.
const {
  adminFetch,
  adminFetchText,
  ADMIN_READ_TIMEOUT_MS,
  startAdminVisiblePolling,
  useAdminReadTask,
} = await vi.importActual<typeof import("./components/admin-client")>("./components/admin-client");

const appSource = readFileSync(
  join(process.cwd(), "apps/web/src/app/App.tsx"),
  "utf8",
);
const routerSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/router/AdminRouter.tsx"),
  "utf8",
);
const paletteSource = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/domains/admin/components/AdminQuickPalette.tsx",
  ),
  "utf8",
);
const shellSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/shell/AdminShell.tsx"),
  "utf8",
);
const shellCssSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/shell/admin-visual-v2.css"),
  "utf8",
);
const communitySource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/AdminCommunityPage.tsx"),
  "utf8",
);

describe("admin shell review regressions", () => {
  it("retains authentication and public-site actions outside the authorized shell", () => {
    expect(routerSource).toContain("<AuthMenuShell />");
    expect(routerSource).toContain('href="/"');
  });

  it("sets the KMAS one-shot latch only when the deferred request begins", () => {
    const runIndex = appSource.indexOf("const run = () =>");
    const latchIndex = appSource.indexOf("kmasEntryMergeStarted = true", runIndex);
    expect(runIndex).toBeGreaterThan(-1);
    expect(latchIndex).toBeGreaterThan(runIndex);
  });

  it("portals the command palette to the document body", () => {
    expect(paletteSource).toContain("createPortal(");
    expect(paletteSource).toContain("document.body");
  });

  it("keeps a public-site exit visible at mobile widths", () => {
    expect(shellSource).toContain("aria-label={copy.openPublicSite}");
    // 모바일에서도 44px 이상 터치 타깃을 유지한다.
    expect(shellSource).toContain('className="inline-flex min-h-11 min-w-11');
  });

  it("provides the completed admin gate to embedded legacy pages", () => {
    expect(routerSource).toContain("<AdminGateOverrideProvider value={gateState}>");
  });

  it("상속받은 전역 중립 토큰을 관리자 셸 CSS가 자체 값으로 재정의하지 않는다", () => {
    // 중립 표면·전경·경계는 @theme 토큰을 상속해야 테마·고대비 설정을 따라간다.
    // 셸이 --color-canvas 등을 다시 정의하면 관리자만 별도 팔레트로 이탈한다.
    expect(shellCssSource).not.toMatch(
      /--color-(canvas|panel|card|raised|line|line-strong|fg|fg-2|fg-3)\s*:/,
    );
  });

  it("관리자 셸 내부 공지가 #main-content에 게이트 여백과 배경을 입히지 않는다", () => {
    expect(shellCssSource).toContain(
      '#main-content:has([data-admin-notice="true"]):not(:has([data-admin-shell="true"]))',
    );
    expect(shellCssSource).not.toMatch(
      /#main-content:has\(\[data-admin-notice="true"\]\)\s*\{/,
    );
  });

  it("관리자 상태 색이 팔레트 클래스 대신 의미 토큰을 쓴다", () => {
    // 상태(정상·경고·위험·정보)는 good/warn/bad/cool 토큰으로만 표현한다.
    const componentFiles = [
      "AdminSecurity.tsx",
      "AdminHeaderStats.tsx",
      "AdminPromos.tsx",
      "AdminToast.tsx",
      "AdminReports.tsx",
      "AdminBusinessVerifications.tsx",
      "../traffic/WebVitalsDashboardPage.tsx",
    ];
    for (const file of componentFiles) {
      const source = readFileSync(
        join(process.cwd(), "apps/web/src/domains/admin/components", file),
        "utf8",
      );
      expect(source, file).not.toMatch(/(?:rose|emerald|amber|cyan|red|slate)-\d{3}/);
    }
  });

  it("mounts the dedicated Creator Market board inside the existing admin gate", () => {
    expect(communitySource).toContain(
      'import { CreatorMarketplaceModerationBoard } from "./components/CreatorMarketplaceModerationBoard";',
    );
    const adminGate = communitySource.indexOf('gate.kind === "admin"');
    const creatorMarketBoard = communitySource.indexOf("<CreatorMarketplaceModerationBoard />");
    const legacyAssetBoard = communitySource.indexOf("<AssetModerationBoard />");

    expect(adminGate).toBeGreaterThan(-1);
    expect(creatorMarketBoard).toBeGreaterThan(adminGate);
    expect(legacyAssetBoard).toBeGreaterThan(creatorMarketBoard);
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}

function login(id = "admin-1", role = "admin") {
  persistSession({ user: { id, role, name: null, email: null, image: null }, token: null });
}

describe("관리자 GET 요청의 공유·기한·인증 경계", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    login();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    persistSession(null);
  });

  it("진행 중인 동일 조회는 한 번 전송하고 각 호출자에게 별도 JSON 객체를 돌려준다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValue(pending.promise as ReturnType<typeof api.raw>);
    const first = adminFetch<{ count: number }>("/traffic/pulse", "admin-1");
    const second = adminFetch<{ count: number }>("/traffic/pulse", "admin-1");
    const text = adminFetchText("/traffic/pulse", "admin-1");
    await Promise.resolve();
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0]?.[1]).toMatchObject({ timeout: 30_000, totalTimeout: 30_000, retry: 0 });
    pending.resolve(Response.json({ count: 3 }));
    const [left, right, string] = await Promise.all([first, second, text]);
    expect(left).toEqual({ count: 3 });
    expect(left).not.toBe(right);
    expect(string).toBe('{"count":3}');

    raw.mockResolvedValueOnce(Response.json({ count: 4 }));
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toEqual({ count: 4 });
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("다른 계정·조회 조건·헤더는 진행 중이어도 공유하지 않는다", async () => {
    const raw = vi.spyOn(api, "raw");
    for (let index = 0; index < 4; index += 1) raw.mockResolvedValueOnce(Response.json({ count: 1 }));
    await Promise.all([
      adminFetch("/traffic?days=7", "admin-1"),
      adminFetch("/traffic?days=30", "admin-1"),
      adminFetch("/traffic?days=7", "admin-2"),
      adminFetch("/traffic?days=7", "admin-1", { headers: { Accept: "text/plain" } }),
    ]);
    expect(raw).toHaveBeenCalledTimes(4);
  });

  it("한 화면의 취소는 같은 조회를 기다리는 다른 화면에 전파하지 않는다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValue(pending.promise as ReturnType<typeof api.raw>);
    const controller = new AbortController();
    const first = adminFetch("/system/health", "admin-1", { signal: controller.signal });
    const firstResult = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = adminFetch("/system/health", "admin-1");
    await Promise.resolve();
    controller.abort();
    await firstResult;
    expect(raw.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    pending.resolve(Response.json({ status: "healthy" }));
    await expect(second).resolves.toEqual({ status: "healthy" });
  });

  it("마지막 호출자가 취소하면 전송을 중단하고 즉시 새 조회를 허용한다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(pending.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(Response.json({ count: 2 }));
    const controller = new AbortController();
    const first = adminFetch("/traffic/pulse", "admin-1", { signal: controller.signal });
    const result = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await result;
    expect(raw.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toEqual({ count: 2 });
    expect(raw).toHaveBeenCalledTimes(2);
    pending.resolve(Response.json({ count: 1 }));
  });

  it.each(["headers", "body"])("%s 수신이 멈춰도 30초 뒤 실패하고 다음 요청으로 복구한다", async (stage) => {
    const pending = deferred<Response>();
    const body = deferred<string>();
    const response = new Response(null);
    vi.spyOn(response, "text").mockReturnValue(body.promise);
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(
      (stage === "headers" ? pending.promise : Promise.resolve(response)) as ReturnType<typeof api.raw>,
    ).mockResolvedValueOnce(Response.json({ recovered: true }));
    const result = expect(adminFetch("/dashboard", "admin-1")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(ADMIN_READ_TIMEOUT_MS);
    await result;
    expect(raw.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await expect(adminFetch("/dashboard", "admin-1")).resolves.toEqual({ recovered: true });
    pending.resolve(Response.json({ stale: true }));
    body.resolve('{"stale":true}');
  });

  it.each(["logout", "switch", "role"])("%s 뒤 이전 인증 세대의 성공 응답을 전달하지 않는다", async (change) => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(pending.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(Response.json({ current: true }));
    const first = adminFetch("/system/health", "admin-1");
    const result = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    if (change === "logout") persistSession(null);
    else login(change === "switch" ? "admin-2" : "admin-1", change === "role" ? "user" : "admin");
    const second = adminFetch("/system/health", change === "switch" ? "admin-2" : "admin-1");
    pending.resolve(Response.json({ stale: true }));
    await result;
    await expect(second).resolves.toEqual({ current: true });
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("전송 전에 취소된 호출은 네트워크를 시작하지 않는다", async () => {
    const raw = vi.spyOn(api, "raw");
    const controller = new AbortController();
    controller.abort();
    await expect(adminFetch("/traffic/pulse", "admin-1", { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(raw).not.toHaveBeenCalled();
  });

  it("빈 응답과 잘못된 JSON의 기존 계약을 유지한다", async () => {
    vi.spyOn(api, "raw").mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(" "))
      .mockResolvedValueOnce(new Response("not json"));
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toBeUndefined();
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toBeUndefined();
    await expect(adminFetch("/traffic/pulse", "admin-1")).rejects.toMatchObject({ status: 502 });
  });

  it("쓰기 요청은 공유하거나 자동 재시도하지 않고 FormData 헤더를 보존한다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(pending.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const body = new FormData();
    body.set("file", "fixture");
    const first = adminFetch("/imports", "admin-1", { method: "POST", body });
    const second = adminFetch("/imports", "admin-1", { method: "POST", body });
    expect(raw).toHaveBeenCalledTimes(2);
    for (const call of raw.mock.calls) {
      expect(call[1]?.retry).toBe(0);
      expect(call[1]?.timeout).toBeUndefined();
      expect(call[1]?.headers).toEqual(new Headers());
    }
    pending.resolve(new Response(null, { status: 204 }));
    await Promise.all([first, second]);
  });

  it("쓰기 완료 후 새로고침은 쓰기 전에 시작한 GET 응답을 공유하지 않는다", async () => {
    const previous = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(previous.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ enabled: false }));
    const oldRead = adminFetch("/promos", "admin-1");
    await Promise.resolve();
    await adminFetch("/promos/fixture", "admin-1", { method: "DELETE" });
    await expect(adminFetch("/promos", "admin-1")).resolves.toEqual({ enabled: false });
    expect(raw).toHaveBeenCalledTimes(3);
    previous.resolve(Response.json({ enabled: true }));
    await expect(oldRead).resolves.toEqual({ enabled: true });
  });

  it.each([401, 403])("HTTP %s의 권한 오류를 성공 응답이나 공유 캐시로 바꾸지 않는다", async (status) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(
      { message: "관리자 권한을 확인해 주세요." }, { status },
    ));
    await expect(adminFetch("/me", "admin-1")).rejects.toMatchObject({
      name: "AdminApiError", status, message: "관리자 권한을 확인해 주세요.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("관리자 화면의 폴링과 조회 취소", () => {
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

describe("관리자 가시성과 조회 수명주기 회귀", () => {
  let visibility: DocumentVisibilityState;
  const stops: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => {
    cleanup();
    for (const stop of stops.splice(0)) stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  function show(value: DocumentVisibilityState) {
    visibility = value;
    document.dispatchEvent(new Event("visibilitychange"));
  }

  describe("관리자 가시성 폴링", () => {
    it("숨겨진 탭에서는 타이머도 요청도 시작하지 않고 복귀에서 한 번 갱신한다", async () => {
      visibility = "hidden";
      const task = vi.fn();
      stops.push(startAdminVisiblePolling(task, 15_000));
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(task).not.toHaveBeenCalled();
      show("visible");
      show("visible");
      expect(task).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(task).toHaveBeenCalledTimes(2);
      show("hidden");
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(task).toHaveBeenCalledTimes(2);
      show("visible");
      expect(task).toHaveBeenCalledTimes(3);
    });

    it("자동 갱신이 없으면 첫 가시 조회만 수행하고 종료 후에는 복귀하지 않는다", async () => {
      visibility = "hidden";
      const task = vi.fn();
      const stop = startAdminVisiblePolling(task, null);
      stops.push(stop);
      show("visible");
      show("hidden");
      show("visible");
      await vi.advanceTimersByTimeAsync(300_000);
      expect(task).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      stop();
      show("hidden");
      show("visible");
      expect(task).toHaveBeenCalledTimes(1);
    });

    it("초기 조회와 분리된 주기는 시작 시 중복 호출하지 않고 복귀에서는 갱신한다", async () => {
      const task = vi.fn();
      stops.push(startAdminVisiblePolling(task, 60_000, false));
      expect(task).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(task).toHaveBeenCalledTimes(1);
      show("hidden");
      show("visible");
      expect(task).toHaveBeenCalledTimes(2);
    });
  });

  describe("관리자 읽기 수명주기", () => {
    it("조회가 진행 중이면 수동·주기 호출을 합치고 완료 후 다음 요청을 허용한다", async () => {
      let finish: () => void = () => undefined;
      const task = vi.fn((_signal: AbortSignal) => new Promise<void>((resolve) => { finish = resolve; }));
      const { result } = renderHook(() => useAdminReadTask(task));
      const first = result.current();
      expect(result.current()).toBe(first);
      await act(async () => { await Promise.resolve(); });
      expect(task).toHaveBeenCalledTimes(1);
      await act(async () => { finish(); await first; });
      const next = result.current();
      await act(async () => { await Promise.resolve(); });
      expect(task).toHaveBeenCalledTimes(2);
      await act(async () => { finish(); await next; });
    });

    it("조회 조건 변경과 종료는 각각 이전 요청의 신호를 취소한다", async () => {
      const requests: Array<{ signal: AbortSignal; finish: () => void }> = [];
      const task = vi.fn((signal: AbortSignal, _key: string) => new Promise<void>((resolve) => {
        requests.push({ signal, finish: resolve });
      }));
      const { result, rerender, unmount } = renderHook(({ query }) => useAdminReadTask(
        useCallback((signal: AbortSignal) => task(signal, query), [query]),
      ), { initialProps: { query: "user-a:7" } });
      const first = result.current();
      await act(async () => { await Promise.resolve(); });
      rerender({ query: "user-a:30" });
      expect(requests[0]?.signal.aborted).toBe(true);
      const next = result.current();
      await act(async () => { await Promise.resolve(); });
      expect(requests[1]?.signal.aborted).toBe(false);
      unmount();
      expect(requests[1]?.signal.aborted).toBe(true);
      for (const request of requests) request.finish();
      await Promise.all([first, next]);
    });

    it("StrictMode 재설정 뒤에도 취소된 읽기를 재사용하지 않는다", async () => {
      const signals: AbortSignal[] = [];
      const task = vi.fn(async (signal: AbortSignal) => { signals.push(signal); });
      const { unmount } = renderHook(() => {
        const run = useAdminReadTask(task);
        useEffect(() => { void run(); }, [run]);
      }, {
        wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
      });
      await act(async () => { await Promise.resolve(); });
      expect(task).toHaveBeenCalledTimes(1);
      expect(signals[0]?.aborted).toBe(false);
      unmount();
    });
  });
});
