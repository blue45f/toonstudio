// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<(input: string, init: RequestInit) => Promise<Response>>(),
  location: { pathname: "/ranking", search: "", key: "initial" },
}));

vi.mock("@/platform/api", () => ({
  apiFetch: mocks.fetch,
  apiPath: (path: string) => path,
}));
vi.mock("react-router-dom", () => ({ useLocation: () => mocks.location }));
vi.mock("@/shared/lib/csrf", () => ({ withCsrfProtection: (init: RequestInit) => init }));
vi.mock("@/shared/lib/share", () => ({ TOONSPECTRUM_SHARE_EVENT: "toonstudio-share" }));

let visibility: DocumentVisibilityState;
let privacy: { onLine: boolean; doNotTrack: string; globalPrivacyControl: boolean };
const originalNavigationEntries = Object.getOwnPropertyDescriptor(performance, "getEntriesByType");

function heartbeatRequests() {
  return mocks.fetch.mock.calls
    .filter(([path]) => path.endsWith("/heartbeat"))
    .map(([, init]) => ({
      init,
      body: JSON.parse(String(init.body)) as { sessionId: string; path: string; engagedSeconds: number },
    }));
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function setVisibility(next: DocumentVisibilityState) {
  act(() => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_TRAFFIC_ANALYTICS_ENABLED", "true");
  visibility = "visible";
  privacy = { onLine: true, doNotTrack: "0", globalPrivacyControl: false };
  vi.stubGlobal("navigator", privacy);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  Object.defineProperty(performance, "getEntriesByType", { configurable: true, value: () => [] });
  localStorage.clear();
  sessionStorage.clear();
  mocks.location = { pathname: "/ranking", search: "", key: "initial" };
  mocks.fetch.mockReset().mockImplementation(async () => new Response(null, { status: 204 }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalNavigationEntries) {
    Object.defineProperty(performance, "getEntriesByType", originalNavigationEntries);
  } else {
    Reflect.deleteProperty(performance, "getEntriesByType");
  }
});

describe("트래픽 heartbeat의 표시 상태와 최종 스냅샷", () => {
  it("숨길 때 마지막 참여 시간을 보내고 숨겨진 동안 타이머와 전송을 멈춘다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { unmount } = render(<TrafficAnalyticsBridge />);
    await advance(65_000);
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([60]);

    setVisibility("hidden");
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([60, 65]);
    expect(vi.getTimerCount()).toBe(0);
    await advance(180_000);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    unmount();
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([60, 65]);
    expect(heartbeatRequests().every(({ init }) => init.keepalive === true)).toBe(true);
  });

  it("처음부터 숨겨진 탭은 주기 요청을 만들지 않고 표시 후 한 타이머만 시작한다", async () => {
    visibility = "hidden";
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    render(<TrafficAnalyticsBridge />);
    await advance(180_000);
    expect(heartbeatRequests()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    setVisibility("visible");
    await advance(30_000);
    setVisibility("visible");
    await advance(30_000);
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([60]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("표시 상태 복귀 후 숨겨진 시간을 제외한 참여 시간으로 재개한다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    render(<TrafficAnalyticsBridge />);
    await advance(7_000);
    setVisibility("hidden");
    await advance(180_000);
    setVisibility("visible");
    await advance(60_000);
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([7, 67]);
  });

  it("주기 전송과 hidden·pagehide·unmount가 겹쳐도 같은 스냅샷을 반복하지 않는다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { unmount } = render(<TrafficAnalyticsBridge />);
    await advance(60_000);
    setVisibility("hidden");
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    unmount();
    expect(heartbeatRequests()).toHaveLength(1);
    expect(heartbeatRequests()[0]?.body).toMatchObject({ path: "/ranking", engagedSeconds: 60 });
  });

  it("표시 중 unmount될 때 5초 이상 누적된 마지막 참여 시간을 보낸다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { unmount } = render(<TrafficAnalyticsBridge />);
    await advance(7_000);
    unmount();
    expect(heartbeatRequests()[0]?.body).toMatchObject({ path: "/ranking", engagedSeconds: 7 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pagehide 뒤 BFCache pageshow에서 타이머를 재개하고 떠나 있던 시간을 제외한다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    render(<TrafficAnalyticsBridge />);
    await advance(8_000);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await advance(120_000);
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([8]);
    expect(vi.getTimerCount()).toBe(0);

    act(() => { window.dispatchEvent(new Event("pageshow")); });
    await advance(60_000);
    expect(heartbeatRequests().map(({ body }) => body.engagedSeconds)).toEqual([8, 68]);
  });

  it("SPA 경로 전환과 제외 경로 진입 시 기존 참여 시간·페이지뷰 계약을 유지한다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { rerender } = render(<TrafficAnalyticsBridge />);
    await advance(7_000);
    mocks.location = { pathname: "/explore", search: "", key: "explore" };
    rerender(<TrafficAnalyticsBridge />);
    await advance(53_000);
    expect(heartbeatRequests()[0]?.body).toMatchObject({ path: "/explore", engagedSeconds: 60 });

    await advance(5_000);
    mocks.location = { pathname: "/admin", search: "", key: "admin" };
    rerender(<TrafficAnalyticsBridge />);
    await advance(60_000);
    expect(heartbeatRequests().map(({ body }) => [body.path, body.engagedSeconds]))
      .toEqual([["/explore", 60], ["/explore", 65]]);
    expect(mocks.fetch.mock.calls.filter(([path]) => path.endsWith("/page-view"))).toHaveLength(2);
  });

  it("참여 시간 증가 없이 경로를 재방문해도 같은 경로의 스냅샷을 중복 전송하지 않는다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { rerender } = render(<TrafficAnalyticsBridge />);
    await advance(7_000);
    for (const pathname of ["/admin", "/explore", "/admin", "/ranking", "/admin"]) {
      mocks.location = { pathname, search: "", key: pathname };
      rerender(<TrafficAnalyticsBridge />);
    }
    expect(heartbeatRequests().map(({ body }) => [body.path, body.engagedSeconds]))
      .toEqual([["/ranking", 7], ["/explore", 7]]);
  });
});

describe("트래픽 수집의 기존 중단 조건", () => {
  it.each(["dnt", "gpc", "disabled", "admin", "auth-callback"])("%s에서 전송하지 않는다", async (reason) => {
    if (reason === "dnt") privacy.doNotTrack = "1";
    if (reason === "gpc") privacy.globalPrivacyControl = true;
    if (reason === "disabled") vi.stubEnv("VITE_TRAFFIC_ANALYTICS_ENABLED", "false");
    if (reason === "admin") mocks.location.pathname = "/admin/traffic";
    if (reason === "auth-callback") mocks.location.pathname = "/auth/callback/provider";
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { unmount } = render(<TrafficAnalyticsBridge />);
    await advance(120_000);
    setVisibility("hidden");
    unmount();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("오프라인에서 생략한 스냅샷은 전송 완료로 취급하지 않는다", async () => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { unmount } = render(<TrafficAnalyticsBridge />);
    await advance(7_000);
    privacy.onLine = false;
    setVisibility("hidden");
    expect(heartbeatRequests()).toEqual([]);
    privacy.onLine = true;
    unmount();
    expect(heartbeatRequests()[0]?.body.engagedSeconds).toBe(7);
  });

  it.each(["5xx", "network"])("%s 실패 뒤 경로 전환과 heartbeat에서 재시도하지 않는다", async (failure) => {
    const { TrafficAnalyticsBridge } = await import("./TrafficAnalyticsBridge");
    const { rerender } = render(<TrafficAnalyticsBridge />);
    await advance(0);
    if (failure === "5xx") {
      mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    } else {
      mocks.fetch.mockRejectedValueOnce(new TypeError("collector unavailable"));
    }
    await advance(60_000);
    expect(heartbeatRequests()).toHaveLength(1);
    mocks.location = { pathname: "/explore", search: "", key: "explore" };
    rerender(<TrafficAnalyticsBridge />);
    await advance(120_000);
    setVisibility("hidden");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
