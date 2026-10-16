import assert from "node:assert/strict";

import { buildPerformanceFacts, classifyConsoleMessage, classifyRequestFailure, classifyResponse, shortenUrl } from "./measure-filters.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const context = { origin: "http://127.0.0.1:5273", devServer: true, isSparseMissing: (pathname) => pathname.startsWith("/vrm/") };

describe("measure-filters: 콘솔 분류", () => {
  it("네트워크 실패의 콘솔 반향은 요청 실패에서 세므로 오류에서 뺀다", () => {
    assert.equal(classifyConsoleMessage({ type: "error", text: "Failed to load resource: the server responded with a status of 404" }, context), "network-echo");
    assert.equal(classifyConsoleMessage({ type: "error", text: "TypeError: x is not a function" }, context), "error");
    assert.equal(classifyConsoleMessage({ type: "pageerror", text: "Uncaught" }, context), "error");
  });

  it("개발 서버 한정 경고는 개발 서버일 때만 제외한다", () => {
    const message = { type: "warning", text: "[LEASE_BUSY] 이 작품의 복구 저장소를" };
    assert.equal(classifyConsoleMessage(message, context), "dev-only");
    assert.equal(classifyConsoleMessage(message, { ...context, devServer: false }), "warning");
  });
});

describe("measure-filters: 네트워크 분류", () => {
  it("4xx·5xx 는 실패, 외부 origin·sparse 누락 자산은 측정 환경 한계로 제외한다", () => {
    assert.equal(classifyResponse({ status: 200, url: "http://127.0.0.1:5273/a" }, context), "ok");
    assert.equal(classifyResponse({ status: 403, url: "http://127.0.0.1:5273/api/x" }, context), "failure");
    assert.equal(classifyResponse({ status: 404, url: "http://127.0.0.1:5273/vrm/a.vrm" }, context), "environment-missing");
    assert.equal(classifyResponse({ status: 404, url: "http://127.0.0.1:5273/missing.png" }, context), "failure");
    assert.equal(classifyResponse({ status: 500, url: "https://cdn.example.com/a.css" }, context), "external");
  });

  it("취소된 요청은 실패가 아니다", () => {
    assert.equal(classifyRequestFailure({ url: "http://127.0.0.1:5273/api/x", errorText: "net::ERR_ABORTED" }, context), "aborted");
    assert.equal(classifyRequestFailure({ url: "http://127.0.0.1:5273/api/x", errorText: "net::ERR_CONNECTION_REFUSED" }, context), "failure");
    assert.equal(classifyRequestFailure({ url: "https://fonts.example.com/f.woff2", errorText: "net::ERR_NAME_NOT_RESOLVED" }, context), "external");
  });

  it("URL 은 origin 을 떼고 길이를 줄여 보고한다", () => {
    assert.equal(shortenUrl("http://127.0.0.1:5273/api/a?x=1"), "/api/a?x=1");
    assert.equal(shortenUrl(`http://127.0.0.1:5273/${"a".repeat(300)}`, 20).length, 21);
  });
});

describe("measure-filters: 성능 사실 정리", () => {
  it("오류·경고·실패 요청을 세고 제외한 항목의 개수를 남긴다", () => {
    const facts = buildPerformanceFacts({
      console: [
        { type: "error", text: "Failed to load resource: 404" },
        { type: "error", text: "Boom" },
        { type: "warning", text: "[LEASE_BUSY] x" },
        { type: "warning", text: "React warning" },
      ],
      responses: [
        { status: 403, url: "http://127.0.0.1:5273/api/a", method: "GET" },
        { status: 403, url: "http://127.0.0.1:5273/api/a", method: "GET" },
        { status: 404, url: "http://127.0.0.1:5273/vrm/a.vrm", method: "GET" },
      ],
      failures: [{ url: "http://127.0.0.1:5273/api/b", errorText: "net::ERR_ABORTED", method: "GET" }],
      metrics: { cls: 0.05, lcpMs: 1000, interactiveMs: 2000, longTaskMs: 10 },
      routeState: "ready",
    }, context);
    assert.equal(facts.consoleErrors, 1);
    assert.equal(facts.consoleWarnings, 1);
    assert.equal(facts.failedRequests, 1);
    assert.deepEqual(facts.details.ignored, { networkEchoConsoleErrors: 1, devOnlyConsoleWarnings: 1, externalOriginFailures: 0, sparseMissingAssets: 1, abortedRequests: 1 });
    assert.equal(facts.cls, 0.05);
  });
});
