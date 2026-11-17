import { createServer } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { HealthCapabilitiesResponseSchema } from "../../apps/api/src/modules/health/health.dto";

import { createStudioOfflinePreviewServerFixture, installStudioOfflinePreviewFixture, studioOfflinePreviewCapabilities } from "./studio-offline-preview-fixture.mjs";

import type { BrowserContext, Request, Response, Route } from "playwright";

const ORIGIN = "http://127.0.0.1:4173";
const TICKET = `${ORIGIN}/api/studio-realtime/tickets`;
const HTTP_DENIED = "Failed to load resource: the server responded with a status of 401 (Unauthorized)";

async function fixture(origin = ORIGIN, serverFixture: ReturnType<typeof createStudioOfflinePreviewServerFixture> | null = null) {
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
  const installed = await installStudioOfflinePreviewFixture(context, origin, serverFixture);
  const emitResponse = (request: Request, status: number, headers: Record<string, string> = {}) => {
    const response = { request: () => request, url: () => request.url(), status: () => status, headers: () => headers } as Response;
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

async function withHttpFixture(run: (origin: string, owner: ReturnType<typeof createStudioOfflinePreviewServerFixture>) => Promise<void>) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback fixture 포트를 확인하지 못했습니다.");
  const origin = `http://127.0.0.1:${address.port}`;
  const owner = createStudioOfflinePreviewServerFixture(origin);
  server.on("request", (request, response) => owner.middleware(request, response, () => {
    response.statusCode = 502;
    response.end("unmocked upstream");
  }));
  try {
    await run(origin, owner);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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

  it("browser route 없이 실제 HTTP로 같은 세 계약을 제공하고 발급한 응답만 승인한다", async () => {
    await withHttpFixture(async (origin, owner) => {
      const installed = await fixture(origin, owner);
      const cases = [
        ["/api/health/capabilities", "GET", 200],
        ["/api/auth/session", "GET", 200],
        ["/api/studio-realtime/tickets", "POST", 401],
      ] as const;
      const receiptIds = new Set<string>();
      for (const [path, method, status] of cases) {
        const url = `${origin}${path}`;
        const response = await fetch(url, { method });
        expect(response.status).toBe(status);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        const receiptId = response.headers.get("x-toonstudio-offline-preview-receipt");
        expect(receiptId).toMatch(/^[0-9a-f-]{36}$/u);
        receiptIds.add(String(receiptId));
        const body: unknown = await response.json();
        if (path.endsWith("capabilities")) expect(HealthCapabilitiesResponseSchema.safeParse(body).success).toBe(true);
        else if (path.endsWith("session")) expect(body).toEqual({ authenticated: false, user: null });
        else expect(body).toEqual({ statusCode: 401, message: "Unauthorized" });
        const request = { url: () => url, method: () => method } as Request;
        installed.emitResponse(request, status, Object.fromEntries(response.headers));
        expect(installed.responses.at(-1)).toEqual({ url, method, status, transport: "http", receiptId });
      }
      expect(receiptIds.size).toBe(3);
      expect(installed.unexpectedResponses).toEqual([]);
      expect(installed.isExpectedConsole(HTTP_DENIED, `${origin}/api/studio-realtime/tickets`)).toBe(true);
    });
  });

  it("HTTP fixture도 query·다른 method·다른 경로를 기존 upstream으로 넘긴다", async () => {
    await withHttpFixture(async (origin) => {
      for (const [path, method] of [
        ["/api/health/capabilities?real=1", "GET"],
        ["/api/health/capabilities", "POST"],
        ["/api/studio-realtime/tickets", "GET"],
        ["/api/studio-realtime/tickets/", "POST"],
        ["/api/creator/works/save", "POST"],
      ]) {
        const response = await fetch(`${origin}${path}`, { method });
        expect(response.status).toBe(502);
        expect(response.headers.has("x-toonstudio-offline-preview-receipt")).toBe(false);
        expect(await response.text()).toBe("unmocked upstream");
      }
    });
    for (const origin of ["", "https://toonstudio.cloud", "http://example.com", `${ORIGIN}/studio`]) {
      expect(() => createStudioOfflinePreviewServerFixture(origin)).toThrow("직접 시작한 loopback");
    }
    const owner = createStudioOfflinePreviewServerFixture(ORIGIN);
    await expect(fixture("", owner)).rejects.toThrow("origin이 다릅니다");
    await expect(fixture("http://127.0.0.1:4174", owner)).rejects.toThrow("origin이 다릅니다");
  });

  it("HTTP receipt 누락·위조·origin/method/status/헤더 불일치를 숨기지 않는다", async () => {
    await withHttpFixture(async (origin, owner) => {
      const installed = await fixture(origin, owner);
      const url = `${origin}/api/studio-realtime/tickets`;
      const response = await fetch(url, { method: "POST" });
      await response.text();
      const headers = Object.fromEntries(response.headers);
      const invalid = [
        { url, method: "POST", status: 401, headers: {} },
        { url, method: "POST", status: 401, headers: { ...headers, "x-toonstudio-offline-preview-receipt": "forged" } },
        { url: `${url}?real=1`, method: "POST", status: 401, headers },
        { url: "https://toonstudio.cloud/api/studio-realtime/tickets", method: "POST", status: 401, headers },
        { url, method: "GET", status: 401, headers },
        { url, method: "POST", status: 502, headers },
        { url, method: "POST", status: 401, headers: { ...headers, "cache-control": "max-age=60" } },
        { url, method: "POST", status: 401, headers: { ...headers, "content-type": "text/plain" } },
      ];
      for (const item of invalid) {
        installed.emitResponse({ url: () => item.url, method: () => item.method } as Request, item.status, item.headers);
      }
      expect(installed.unexpectedResponses).toHaveLength(invalid.length);
      expect(installed.responses).toEqual([]);
      expect(installed.isExpectedConsole(HTTP_DENIED, url)).toBe(false);
    });
  });

  it("같은 HTTP receipt를 다른 Request identity에 재사용하지 않는다", async () => {
    await withHttpFixture(async (origin, owner) => {
      const installed = await fixture(origin, owner);
      const url = `${origin}/api/studio-realtime/tickets`;
      const response = await fetch(url, { method: "POST" });
      await response.text();
      const headers = Object.fromEntries(response.headers);
      const first = { url: () => url, method: () => "POST" } as Request;
      installed.emitResponse(first, 401, headers);
      expect(installed.isExpectedConsole(HTTP_DENIED, url)).toBe(true);
      installed.emitResponse({ url: () => url, method: () => "POST" } as Request, 401, headers);
      expect(installed.unexpectedResponses).toEqual([{ url, method: "POST", status: 401, expectedStatus: undefined }]);
      expect(installed.isExpectedConsole(HTTP_DENIED, url)).toBe(false);
    });
  });
});
