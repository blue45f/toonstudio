import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import process from "node:process";

import {
  buildStudio3dAuditMarkdown,
  classifyStudio3dFailedRequest,
  createInFlightRequestTracker,
  groupStudio3dFailedRequests,
  splitStudio3dFailedRequestGroups,
} from "./audit-studio-3d-production.mjs";
import { parseMobile3dAuditReportPayload } from "./ops-dashboard.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("in-flight 요청 추적기는 진입 전 진행 중인 워커·3D 청크가 모두 끝나고 안정 창을 넘길 때까지 대기한다", async () => {
  const emitter = new EventEmitter();
  const tracker = createInFlightRequestTracker(emitter);

  const workerReq = { url: () => "https://www.toonstudio.cloud/assets/studio-offline-branch.worker.js" };
  const bg3dReq = { url: () => "https://www.toonstudio.cloud/assets/StudioBackground3D.js" };
  emitter.emit("request", workerReq);
  emitter.emit("request", bg3dReq);
  assert.equal(tracker.pendingCount(), 2);

  setTimeout(() => emitter.emit("requestfinished", workerReq), 25);
  setTimeout(() => emitter.emit("requestfinished", bg3dReq), 55);

  const result = await tracker.waitForQuiescence({
    timeoutMs: 1_000,
    quietWindowMs: 60,
    pollIntervalMs: 10,
  });
  assert.equal(result.quiescent, true);
  assert.equal(result.initialPending, 2);
  assert.equal(result.drainedCount, 2);
  assert.equal(result.remainingPending, 0);
  assert.ok(result.elapsedMs >= 55);

  tracker.dispose();
  assert.equal(emitter.listenerCount("request"), 0);
  assert.equal(emitter.listenerCount("requestfinished"), 0);
  assert.equal(emitter.listenerCount("requestfailed"), 0);
});

test("in-flight 요청 추적기는 응답이 끝나지 않는 요청이 있으면 타임아웃 시 미완료 건수를 그대로 보고한다", async () => {
  const emitter = new EventEmitter();
  const tracker = createInFlightRequestTracker(emitter);
  emitter.emit("request", { url: () => "https://www.toonstudio.cloud/assets/stuck.glb" });

  const result = await tracker.waitForQuiescence({
    timeoutMs: 80,
    quietWindowMs: 40,
    pollIntervalMs: 10,
  });
  assert.equal(result.quiescent, false);
  assert.equal(result.initialPending, 1);
  assert.equal(result.remainingPending, 1);
  assert.equal(result.drainedCount, 0);
  tracker.dispose();
});

test("실패 요청 분리와 마크다운 리포트는 실제 네트워크·정책 오류를 유지한 채 비차단 ERR_ABORTED와 명확히 구분한다", () => {
  const failedRequests = [
    {
      url: "https://www.toonstudio.cloud/assets/studio-offline-branch.worker-CCO.js",
      method: "GET",
      resourceType: "script",
      error: "net::ERR_ABORTED",
      phase: "navigation-to-character",
    },
    {
      url: "https://www.toonstudio.cloud/assets/blocked.glb",
      method: "GET",
      resourceType: "fetch",
      error: "net::ERR_BLOCKED_BY_CSP",
      phase: "surface-settle",
    },
    {
      url: "https://www.toonstudio.cloud/assets/dns-fail.glb",
      method: "GET",
      resourceType: "fetch",
      error: "net::ERR_NAME_NOT_RESOLVED",
      phase: "character-webgl",
    },
  ];
  const policyItem = classifyStudio3dFailedRequest(failedRequests[1]);
  assert.equal(policyItem.category, "blocked-by-policy");
  assert.equal(policyItem.actionable, true);

  const dnsItem = classifyStudio3dFailedRequest(failedRequests[2]);
  assert.equal(dnsItem.category, "network-or-dns-error");
  assert.equal(dnsItem.actionable, true);

  const grouped = groupStudio3dFailedRequests(failedRequests, [
    { url: "https://www.toonstudio.cloud/assets/blocked.glb", status: 403 },
  ]);
  const split = splitStudio3dFailedRequestGroups(grouped);
  assert.equal(split.actionableGroups.length, 2);
  assert.equal(split.nonBlockingAbortedGroups.length, 1);

  const report = {
    schemaVersion: 2,
    generatedAt: "2026-11-23T02:00:00.000Z",
    url: "https://www.toonstudio.cloud/studio",
    summary: {
      navigationFailures: 0,
      pageErrors: 0,
      brokenImages: 0,
      upscaledImages: 0,
      blurryCanvases: 0,
      webglTargets: 1,
      threeDEntrypoints: 9,
    },
    failedRequestBreakdown: grouped,
    failures: [],
    targets: [
      {
        name: "mobile",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        openedSurface: { text: "3D 장면 만들기" },
        preNavigationSettle: {
          initialPending: 2,
          drainedCount: 2,
          remainingPending: 0,
          elapsedMs: 640,
          quiescent: true,
        },
        canvases: [],
        images: [],
        consoleErrors: [],
        pageErrors: [],
        failedRequests,
        failedRequestSummary: grouped,
        httpErrors: [{ url: "https://www.toonstudio.cloud/assets/blocked.glb", status: 403 }],
      },
    ],
  };

  const md = buildStudio3dAuditMarkdown(report);
  assert.match(md, /Actionable failed requests: 2 \(HTTP 4xx\/5xx: 1\)/u);
  assert.match(md, /Non-blocking aborted requests \(ERR_ABORTED\): 1/u);
  assert.match(md, /Pre-navigation settle: quiescent=true, drained=2, remaining=0, elapsed=640ms/u);
  assert.match(md, /### Actionable request failures/u);
  assert.match(md, /### Non-blocking aborted requests \(ERR_ABORTED\)/u);
  assert.match(md, /\[ACTIONABLE\]\[blocked-by-policy\]/u);
  assert.match(md, /\[ACTIONABLE\]\[network-or-dns-error\]/u);
  assert.match(md, /\[NON-BLOCKING\]\[aborted-navigation-or-prefetch\]/u);
  assert.match(md, /\[HTTP 403\] \/assets\/blocked\.glb/u);

  // ops-dashboard JSON 파서 호환성 보장
  const parsedOps = parseMobile3dAuditReportPayload(report);
  assert.equal(parsedOps.actionableFailedRequests, 2);
  assert.equal(parsedOps.abortedRequests, 1);
  assert.equal(parsedOps.httpErrorCount, 1);
});
