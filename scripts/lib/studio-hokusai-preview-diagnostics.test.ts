import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectBrowserDiagnostics, mergeDiagnostics } from "./studio-hokusai-preview-diagnostics";

const origin = "http://127.0.0.1:4179", studioUrl = `${origin}/studio/canvas`;
const ticketUrl = `${origin}/api/studio-realtime/tickets`;
const credentialUrl = new URL(ticketUrl);
credentialUrl.username = "fixture-user";
credentialUrl.password = "fixture-password";
function request(url = ticketUrl, method = "POST", resourceType = "fetch", errorText = "net::ERR_ABORTED") {
  return { url: () => url, method: () => method, resourceType: () => resourceType, failure: () => ({ errorText }) };
}
function response(page: EventEmitter, value: ReturnType<typeof request>, status = 502, url = value.url()) {
  page.emit("response", { request: () => value, status: () => status, url: () => url });
}
function consoleError(page: EventEmitter, url: string, status = 502) {
  page.emit("console", {
    type: () => "error", location: () => ({ url }),
    text: () => `Failed to load resource: the server responded with a status of ${status} (${status === 502 ? "Bad Gateway" : "fixture"})`,
  });
}
function setup(owned = true, base = studioUrl) {
  const page = new EventEmitter(), diagnostics = collectBrowserDiagnostics(page, "fixture", base, owned);
  return { page, diagnostics };
}

describe("자신이 실행한 Hokusai 정적 preview의 API 부재 기록", () => {
  it.each(["/api/health/ready", "/api/health/capabilities", "/api/studio-realtime/tickets"])(
    "정확한 %s 502와 console 원문을 실제 API 통과와 구분해 보존한다", (path) => {
      const { page, diagnostics } = setup(), url = `${origin}${path}`, value = request(url);
      response(page, value); consoleError(page, url);
      expect(diagnostics.consoleErrors).toEqual([]);
      expect(diagnostics.fiveHundredResponses).toEqual([]);
      expect(diagnostics.staticPreviewApiUnavailable).toEqual({ apiVerified: false, observations: [
        { kind: "response", raw: `fixture: 502 ${url}` },
        { kind: "console-error", raw: `fixture: Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ ${url}` },
      ] });
    },
  );

  it("관측한 동일 POST/fetch Request의 취소 원문만 별도 기록한다", () => {
    const { page, diagnostics } = setup(), value = request();
    response(page, value); page.emit("requestfailed", value);
    expect(diagnostics.requestFailures).toEqual([]);
    expect(diagnostics.staticPreviewApiUnavailable?.observations).toContainEqual({ kind: "request-failure", raw: `fixture: POST ${ticketUrl}: net::ERR_ABORTED` });
  });

  it.each([false, undefined])("소유권 %s인 외부 preview에는 새 예외를 허용하지 않는다", (owned) => {
    const page = new EventEmitter(), diagnostics = owned === undefined
      ? collectBrowserDiagnostics(page, "fixture", studioUrl)
      : collectBrowserDiagnostics(page, "fixture", studioUrl, owned);
    const value = request(); response(page, value); consoleError(page, ticketUrl); page.emit("requestfailed", value);
    expect(diagnostics.staticPreviewApiUnavailable).toBeUndefined();
    expect(diagnostics.fiveHundredResponses).toHaveLength(1);
    expect(diagnostics.consoleErrors).toHaveLength(1);
    expect(diagnostics.requestFailures).toHaveLength(1);
  });

  it.each([404, 401, 403, 500, 503])("응답 %s는 새 API 부재가 아니며 취소도 실패로 남긴다", (status) => {
    const { page, diagnostics } = setup(), value = request();
    response(page, value, status); consoleError(page, ticketUrl, status); page.emit("requestfailed", value);
    expect(diagnostics.staticPreviewApiUnavailable).toBeUndefined();
    expect(diagnostics.consoleErrors).toHaveLength(1);
    expect(diagnostics.requestFailures).toHaveLength(1);
  });

  it.each([
    `${ticketUrl}?retry=1`, `${ticketUrl}#fragment`, `${origin}/api/creator/works`,
    `${ticketUrl}/`, credentialUrl.href,
    "http://127.0.0.1:4180/api/studio-realtime/tickets", "http://localhost:4179/api/studio-realtime/tickets",
    "https://127.0.0.1:4179/api/studio-realtime/tickets", "https://example.test/api/studio-realtime/tickets",
  ])("URL %s의 오류는 그대로 실패로 남긴다", (url) => {
    const { page, diagnostics } = setup(), value = request(url);
    response(page, value); consoleError(page, url); page.emit("requestfailed", value);
    expect(diagnostics.staticPreviewApiUnavailable).toBeUndefined();
    expect(diagnostics.fiveHundredResponses).toHaveLength(1);
    expect(diagnostics.consoleErrors).toHaveLength(1);
    expect(diagnostics.requestFailures).toHaveLength(1);
  });

  it.each([`${studioUrl}?fixture=1`, `${studioUrl}#fragment`, "https://example.test/studio/canvas"])(
    "기준 URL %s가 잘못되면 소유권을 주장해도 새 예외를 열지 않는다", (base) => {
      const { page, diagnostics } = setup(true, base), value = request();
      response(page, value); page.emit("requestfailed", value);
      expect(diagnostics.staticPreviewApiUnavailable).toBeUndefined();
      expect(diagnostics.requestFailures).toHaveLength(1);
    },
  );

  it("응답 전 취소와 같은 URL의 다른 Request는 실패로 남긴다", () => {
    const { page, diagnostics } = setup(), observed = request();
    page.emit("requestfailed", observed);
    response(page, observed); page.emit("requestfailed", request());
    expect(diagnostics.requestFailures).toHaveLength(2);
    expect(diagnostics.staticPreviewApiUnavailable?.observations).toHaveLength(1);
  });

  it.each(["/api/health/ready", "/api/health/capabilities"])("%s의 502는 ticket 취소의 근거가 아니다", (path) => {
    const { page, diagnostics } = setup(), value = request(`${origin}${path}`);
    response(page, value); page.emit("requestfailed", value);
    // ready의 기존 legacy 규칙은 그대로 두며 새 분리 기록에는 취소를 추가하지 않는다.
    expect(diagnostics.staticPreviewApiUnavailable?.observations).toHaveLength(1);
    if (path.endsWith("capabilities")) expect(diagnostics.requestFailures).toHaveLength(1);
  });

  it("경고와 pageerror는 새 API 부재로 분리하지 않는다", () => {
    const { page, diagnostics } = setup();
    page.emit("console", { type: () => "warning", text: () => "Failed to load resource: the server responded with a status of 502 (Bad Gateway)", location: () => ({ url: ticketUrl }) });
    page.emit("pageerror", new Error("fixture runtime failure"));
    expect(diagnostics.staticPreviewApiUnavailable).toBeUndefined();
    expect(diagnostics.consoleWarnings).toHaveLength(1);
    expect(diagnostics.pageErrors).toHaveLength(1);
  });

  it.each([["GET", "fetch", "net::ERR_ABORTED"], ["POST", "xhr", "net::ERR_ABORTED"], ["POST", "fetch", "net::ERR_CONNECTION_RESET"]])(
    "요청 조건 %s/%s/%s의 실패는 분리하지 않는다", (method, type, error) => {
      const { page, diagnostics } = setup(), value = request(ticketUrl, method, type, error);
      response(page, value); page.emit("requestfailed", value);
      expect(diagnostics.requestFailures).toHaveLength(1);
      expect(diagnostics.staticPreviewApiUnavailable?.observations).toHaveLength(1);
    },
  );

  it.each([200, 404, 500])("뒤따른 %s 응답은 예전 502를 취소의 근거로 재사용하지 않는다", (status) => {
    const { page, diagnostics } = setup(), value = request();
    response(page, value); response(page, value, status); page.emit("requestfailed", value);
    expect(diagnostics.requestFailures).toHaveLength(1);
  });

  it("response의 URL과 Request URL이 다르면 취소를 허용하지 않는다", () => {
    const { page, diagnostics } = setup(), value = request(`${origin}/api/creator/works`);
    response(page, value, 502, ticketUrl); page.emit("requestfailed", value);
    expect(diagnostics.staticPreviewApiUnavailable).toBeUndefined();
    expect(diagnostics.requestFailures).toHaveLength(1);
  });

  it("기존 다섯 배열 fixture와 원문 합치기를 그대로 지원한다", () => {
    const target = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [], fiveHundredResponses: [] };
    const { page, diagnostics } = setup(); response(page, request());
    mergeDiagnostics(target, diagnostics);
    expect(target).toMatchObject({ consoleErrors: [], requestFailures: [], staticPreviewApiUnavailable: { apiVerified: false, observations: diagnostics.staticPreviewApiUnavailable?.observations } });
  });

  it("entry가 외부 origin과 실제 child 소유권을 분리해 수집기에 전달한다", () => {
    const source = readFileSync(new URL("../verify-studio-hokusai-live-integration.mts", import.meta.url), "utf8");
    expect(source).toContain('const preview: ChildProcess | null = externalOrigin\n    ? null');
    expect(source).toContain("const ownedStaticPreview = preview !== null && preview.exitCode === null && preview.signalCode === null");
    expect(source).toContain("collectBrowserDiagnostics(page, scenario.presetId, studioUrl, ownedStaticPreview)");
  });
});
