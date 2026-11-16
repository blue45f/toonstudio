import { describe, expect, it, vi } from "vitest";

import { HealthCapabilitiesResponseSchema } from "../../apps/api/src/modules/health/health.dto";

import { installStudioOfflinePreviewFixture, studioOfflinePreviewCapabilities } from "./studio-offline-preview-fixture.mjs";

import type { BrowserContext, Request, Response, Route } from "playwright";

const ORIGIN = "http://127.0.0.1:4173";
const TICKET = `${ORIGIN}/api/studio-realtime/tickets`;
const HTTP_DENIED = "Failed to load resource: the server responded with a status of 401 (Unauthorized)";

async function fixture(origin = ORIGIN) {
  const registrations: { match: (url: URL) => boolean; handle: (route: Route) => Promise<unknown> }[] = [];
  const observers: ((response: Response) => void)[] = [];
  const context = {
    route: vi.fn<BrowserContext["route"]>(async (matcher, handler) => {
      if (typeof matcher !== "function") throw new Error("명시적 URL matcher가 필요합니다.");
      registrations.push({ match: matcher, handle: (route) => Promise.resolve(handler(route, route.request())) });
    }),
    on: vi.fn((event: "response", observer: (response: Response) => void) => {
      expect(event).toBe("response");
      observers.push(observer);
    }),
  };
  const installed = await installStudioOfflinePreviewFixture(context, origin);
  const emitResponse = (request: Request, status: number) => {
    const response = { request: () => request, url: () => request.url(), status: () => status } as Response;
    for (const observer of observers) observer(response);
  };
  const invoke = async (url: string, method: string) => {
    const request = { url: () => url, method: () => method } as Request;
    // Playwright는 fulfill 완료 전에 response를 보낼 수 있다. 같은 identity를 유지한다.
    const fulfill = vi.fn(async ({ status = 200 }: NonNullable<Parameters<Route["fulfill"]>[0]>) => emitResponse(request, status));
    const fallback = vi.fn();
    const registration = registrations.find(({ match }) => match(new URL(url)));
    if (registration) await registration.handle({ request: () => request, fulfill, fallback } as unknown as Route);
    else fallback();
    return { request, fulfill, fallback };
  };
  return { ...installed, context, registrations, emitResponse, invoke };
}

describe("소유한 offline preview API 경계", () => {
  it("실제 health DTO를 만족하며 cloud·협업을 사용할 수 있다고 주장하지 않는다", () => {
    const report = studioOfflinePreviewCapabilities(new Date("2026-11-16T00:00:00Z"));
    expect(HealthCapabilitiesResponseSchema.parse(report)).toEqual(report);
    expect(report.capabilities.studioLocalEditing).toBe("available");
    expect(report.capabilities.studioCloudSave).toBe("unavailable");
    expect(report.capabilities.realtimeCollaboration).toBe("unavailable");
    expect(report.status).toBe("degraded");
  });

  it("소유하지 않은 실제 서버에는 route를 설치하지 않는다", async () => {
    const { context, mode } = await fixture("");
    expect(mode).toBe("live-api");
    expect(context.route).not.toHaveBeenCalled();
    for (const origin of ["https://toonstudio.cloud", "http://example.com", `${ORIGIN}/studio`, `${ORIGIN}/?offline=1`, "http://user@localhost:4173"]) {
      await expect(installStudioOfflinePreviewFixture(context, origin)).rejects.toThrow("직접 시작한 loopback");
    }
  });

  it("정확한 origin·경로·query 경계 밖의 요청을 가로채지 않는다", async () => {
    const { registrations } = await fixture();
    const { match } = registrations[0];
    expect(match(new URL(TICKET))).toBe(true);
    for (const url of [`${TICKET}?room=real`, `${TICKET}/`, "http://127.0.0.1:4174/api/health/capabilities", `${ORIGIN}/api/creator/works/save`, "https://toonstudio.cloud/api/health/capabilities"]) {
      expect(match(new URL(url)), url).toBe(false);
    }
  });

  it("GET capabilities·guest session과 POST 입장권 거절만 응답한다", async () => {
    const installed = await fixture();
    expect(installed.isExpectedConsole(HTTP_DENIED, TICKET)).toBe(false);
    const { invoke } = installed;
    const health = await invoke(`${ORIGIN}/api/health/capabilities`, "GET");
    expect(HealthCapabilitiesResponseSchema.safeParse(JSON.parse(String(health.fulfill.mock.calls[0][0].body))).success).toBe(true);
    const session = await invoke(`${ORIGIN}/api/auth/session`, "GET");
    expect(JSON.parse(String(session.fulfill.mock.calls[0][0].body))).toEqual({ authenticated: false, user: null });
    const denied = await invoke(TICKET, "POST");
    expect(denied.fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    const otherMethod = await invoke(TICKET, "GET");
    expect(otherMethod.fallback).toHaveBeenCalledOnce();
    expect(otherMethod.fulfill).not.toHaveBeenCalled();
    expect(installed.isExpectedConsole(HTTP_DENIED, TICKET)).toBe(true);
    expect(installed.isExpectedConsole(HTTP_DENIED.replace("401", "502"), TICKET)).toBe(false);
    expect(installed.isExpectedConsole("Unhandled exception", TICKET)).toBe(false);
    expect(installed.isExpectedConsole(HTTP_DENIED, `${TICKET}?room=real`)).toBe(false);
    expect(installed.isExpectedConsole(HTTP_DENIED, "https://toonstudio.cloud/api/studio-realtime/tickets")).toBe(false);
    expect(installed.unexpectedResponses).toEqual([]);
  });

  it("정상 POST 401 뒤 같은 URL의 GET 401을 별개 요청 실패로 보존한다", async () => {
    const installed = await fixture();
    await installed.invoke(TICKET, "POST");
    expect(installed.isExpectedConsole(HTTP_DENIED, TICKET)).toBe(true);
    const fallback = await installed.invoke(TICKET, "GET");
    installed.emitResponse(fallback.request, 401);
    expect(installed.isExpectedConsole(HTTP_DENIED, TICKET)).toBe(false);
    expect(installed.unexpectedResponses).toEqual([{ url: TICKET, method: "GET", status: 401, expectedStatus: undefined }]);
  });

  it.each([
    [TICKET, "POST", 502],
    [`${TICKET}?room=real`, "POST", 401],
    ["https://toonstudio.cloud/api/studio-realtime/tickets", "POST", 401],
    ["http://127.0.0.1:4174/api/auth/session", "GET", 502],
    [`${ORIGIN}/api/health/capabilities`, "GET", 502],
  ])("fulfill하지 않은 요청 또는 상태 불일치를 숨기지 않는다: %s %s %s", async (url, method, status) => {
    const installed = await fixture();
    await installed.invoke(TICKET, "POST");
    const otherRequest = { url: () => url, method: () => method } as Request;
    installed.emitResponse(otherRequest, status);
    expect(installed.unexpectedResponses).toEqual([{ url, method, status, expectedStatus: undefined }]);
  });

  it("같은 URL·메서드여도 다른 Request identity의 401은 허용하지 않는다", async () => {
    const installed = await fixture();
    await installed.invoke(TICKET, "POST");
    installed.emitResponse({ url: () => TICKET, method: () => "POST" } as Request, 401);
    expect(installed.unexpectedResponses).toHaveLength(1);
    expect(installed.isExpectedConsole(HTTP_DENIED, TICKET)).toBe(false);
  });

  it("fixture가 예상한 응답이라도 실제 502로 바뀌면 실패를 기록한다", async () => {
    const installed = await fixture();
    const health = await installed.invoke(`${ORIGIN}/api/health/capabilities`, "GET");
    installed.emitResponse(health.request, 502);
    expect(installed.unexpectedResponses).toEqual([{
      url: `${ORIGIN}/api/health/capabilities`, method: "GET", status: 502, expectedStatus: 200,
    }]);
  });

  it("실패한 fulfill을 기대 응답으로 기록하지 않는다", async () => {
    const installed = await fixture();
    const request = { url: () => TICKET, method: () => "POST" } as Request;
    await expect(installed.registrations[0].handle({
      request: () => request,
      fulfill: async () => { throw new Error("fixture 전달 실패"); },
    } as unknown as Route)).rejects.toThrow("fixture 전달 실패");
    installed.emitResponse(request, 401);
    expect(installed.responses).toEqual([]);
    expect(installed.isExpectedConsole(HTTP_DENIED, TICKET)).toBe(false);
    expect(installed.unexpectedResponses).toHaveLength(1);
  });

  it("외부 서버 모드에서도 보호 API 오류를 실제 응답 그대로 남긴다", async () => {
    const installed = await fixture("");
    const url = "https://toonstudio.cloud/api/health/capabilities";
    installed.emitResponse({ url: () => url, method: () => "GET" } as Request, 502);
    expect(installed.unexpectedResponses).toEqual([{ url, method: "GET", status: 502, expectedStatus: undefined }]);
    expect(installed.responses).toEqual([]);
  });
});
