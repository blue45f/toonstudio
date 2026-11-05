import { describe, expect, it } from "vitest";

import { createCompanionPreviewApiDiagnostics } from "./studio-companion-preview-diagnostics";

const origin = "http://127.0.0.1:4179";
const ticketUrl = `${origin}/api/studio-realtime/tickets`;
function request(url = ticketUrl, method = "POST", resourceType = "fetch", errorText = "net::ERR_ABORTED") {
  return { url: () => url, method: () => method, resourceType: () => resourceType, failure: () => ({ errorText }) };
}
function consoleMessage(status: number, url: string) {
  return `Failed to load resource: the server responded with a status of ${status} (${status === 404 ? "Not Found" : "Bad Gateway"}) @ ${url}`;
}

describe("동일한 로컬 companion preview의 API 부재 진단", () => {
  it.each([
    "/api/health/capabilities", "/api/studio-realtime/tickets", "/api/analytics/traffic/page-view",
  ])("정확한 %s의 404를 원문 보존 대상으로 분류한다", (path) => {
    const api = createCompanionPreviewApiDiagnostics(origin), url = `${origin}${path}`;
    expect(api.observeResponse(request(url), 404, url)).toBe(true);
    expect(api.consoleUnavailable(consoleMessage(404, url))).toBe(true);
  });

  it("기존 readiness 502만 재사용하고 analytics 502는 새로 허용하지 않는다", () => {
    const api = createCompanionPreviewApiDiagnostics(origin);
    expect(api.observeResponse(request(), 502, ticketUrl)).toBe(true);
    expect(api.consoleUnavailable(consoleMessage(502, ticketUrl))).toBe(true);
    const analytics = `${origin}/api/analytics/traffic/page-view`;
    expect(api.observeResponse(request(analytics), 502, analytics)).toBe(false);
    expect(api.consoleUnavailable(consoleMessage(502, analytics))).toBe(false);
  });

  it.each([200, 401, 403, 500, 503])("응답 %s는 기존 auth 경로에서도 부재로 분류하지 않는다", (status) => {
    const api = createCompanionPreviewApiDiagnostics(origin), url = `${origin}/api/auth/session`;
    expect(api.observeResponse(request(url), status, url)).toBe(false);
    expect(api.consoleUnavailable(consoleMessage(status, url))).toBe(false);
  });

  it.each([
    `${ticketUrl}?retry=1`, `${ticketUrl}#fragment`, `${origin}/api/creator/works`,
    "http://127.0.0.1:4180/api/studio-realtime/tickets", "http://localhost:4179/api/studio-realtime/tickets",
    "https://127.0.0.1:4179/api/studio-realtime/tickets", "https://example.test/api/studio-realtime/tickets",
  ])("다른 URL %s는 분리하지 않는다", (url) => {
    const api = createCompanionPreviewApiDiagnostics(origin);
    expect(api.observeResponse(request(url), 404, url)).toBe(false);
    expect(api.consoleUnavailable(consoleMessage(404, url))).toBe(false);
  });

  it("사용자 정보가 붙은 URL은 동일 origin이어도 분리하지 않는다", () => {
    const url = new URL(ticketUrl);
    url.username = "fixture-user";
    url.password = "fixture-password";
    const api = createCompanionPreviewApiDiagnostics(origin);
    expect(api.observeResponse(request(url.href), 404, url.href)).toBe(false);
    expect(api.consoleUnavailable(consoleMessage(404, url.href))).toBe(false);
  });

  it("외부 preview 기준으로는 어떤 부재도 허용하지 않는다", () => {
    const url = "https://example.test/api/studio-realtime/tickets";
    const api = createCompanionPreviewApiDiagnostics("https://example.test");
    expect(api.observeResponse(request(url), 404, url)).toBe(false);
  });

  it.each([404, 502])("같은 POST/fetch Request의 %s 응답을 관측한 뒤 ERR_ABORTED만 분리한다", (status) => {
    const api = createCompanionPreviewApiDiagnostics(origin), original = request();
    expect(api.observedUnavailableAbort(original)).toBe(false);
    expect(api.observeResponse(original, status, ticketUrl)).toBe(true);
    expect(api.observedUnavailableAbort(original)).toBe(true);
    expect(api.observedUnavailableAbort(request())).toBe(false);
  });

  it("다른 선택 API의 실제 부재 응답도 티켓 취소의 근거로 재사용하지 않는다", () => {
    for (const path of ["/api/auth/session", "/api/health/capabilities"]) {
      const api = createCompanionPreviewApiDiagnostics(origin), value = request(`${origin}${path}`);
      expect(api.observeResponse(value, 404, `${origin}${path}`)).toBe(true);
      expect(api.observedUnavailableAbort(value)).toBe(false);
    }
  });

  it.each([
    ["GET", "fetch", "net::ERR_ABORTED"], ["POST", "xhr", "net::ERR_ABORTED"],
    ["POST", "fetch", "net::ERR_CONNECTION_RESET"],
  ])("다른 요청 조건 %s/%s/%s은 오류로 남긴다", (method, resourceType, errorText) => {
    const api = createCompanionPreviewApiDiagnostics(origin), value = request(ticketUrl, method, resourceType, errorText);
    expect(api.observeResponse(value, 404, ticketUrl)).toBe(true);
    expect(api.observedUnavailableAbort(value)).toBe(false);
  });

  it("이후 정상 응답이나 다른 response URL을 같은 요청의 부재 증거로 재사용하지 않는다", () => {
    const api = createCompanionPreviewApiDiagnostics(origin), value = request();
    api.observeResponse(value, 404, ticketUrl);
    expect(api.observeResponse(value, 200, ticketUrl)).toBe(false);
    expect(api.observedUnavailableAbort(value)).toBe(false);
    expect(api.observeResponse(value, 404, `${origin}/api/health/capabilities`)).toBe(false);
  });
});
