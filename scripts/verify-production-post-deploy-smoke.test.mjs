const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_API_URL,
  DEFAULT_WEB_URL,
  SmokeUsageError,
  buildSafeRollbackGuidance,
  executePostDeploySmokeCli,
  parsePostDeploySmokeArgs,
  runProductionPostDeploySmoke,
} from "./verify-production-post-deploy-smoke.mjs";

const PREV_WORKER_VERSION = "4670c23c-f464-45d9-b34d-c747612d5790";
const PREV_API_SHA = "5294fcc693284c38563ed7773748bbd0b7b2822e";
const SCRIPT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "verify-production-post-deploy-smoke.mjs");

function createHealthyFetch(overrides = {}) {
  const requestedUrls = [];
  const fetchImpl = async (url, init) => {
    const href = String(url);
    requestedUrls.push({ url: href, redirect: init?.redirect });

    if (Object.hasOwn(overrides, href)) {
      const custom = overrides[href];
      return typeof custom === "function" ? custom(href, init) : custom;
    }

    if (href === `${DEFAULT_API_URL}/api/health/live`) {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (href === `${DEFAULT_API_URL}/api/health/ready`) {
      return new Response(JSON.stringify({ status: "ready" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (href === `${DEFAULT_WEB_URL}/` || href === `${DEFAULT_WEB_URL}/production`) {
      return new Response("<!doctype html><html><body>ToonStudio</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (href === `${DEFAULT_WEB_URL}/studio` || href === `${DEFAULT_WEB_URL}/studio/character`) {
      return new Response("<!doctype html><html><body>Studio</body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "credentialless",
        },
      });
    }
    return new Response("not found", { status: 404 });
  };

  return { fetchImpl, requestedUrls };
}

describe("verify-production-post-deploy-smoke", () => {
  describe("성공 케이스", () => {
    test("API live/ready 200 JSON과 4개 핵심 SPA 및 Studio COOP/COEP 헤더가 모두 정상이면 통과한다", async () => {
      const { fetchImpl, requestedUrls } = createHealthyFetch();
      const logs = [];
      const errors = [];

      const exitCode = await executePostDeploySmokeCli(
        [
          "--web-url", DEFAULT_WEB_URL,
          "--api-url", DEFAULT_API_URL,
          "--prev-worker-version", PREV_WORKER_VERSION,
          "--prev-api-sha", PREV_API_SHA,
        ],
        {
          fetchImpl,
          log: (line) => logs.push(line),
          errorLog: (line) => errors.push(line),
        },
      );

      assert.equal(exitCode, 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(
        requestedUrls.map((entry) => entry.url),
        [
          `${DEFAULT_API_URL}/api/health/live`,
          `${DEFAULT_API_URL}/api/health/ready`,
          `${DEFAULT_WEB_URL}/`,
          `${DEFAULT_WEB_URL}/studio`,
          `${DEFAULT_WEB_URL}/production`,
          `${DEFAULT_WEB_URL}/studio/character`,
        ],
      );
      assert.ok(requestedUrls.every((entry) => entry.redirect === "manual"));
      const output = logs.join("\n");
      assert.match(output, /결과: 통과 \(6\/6\)/u);
      assert.doesNotMatch(output, /롤백 명령/u);
    });

    test("Studio 경로에서 COEP require-corp 값도 유효한 교차 출처 격리 헤더로 인정한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_WEB_URL}/studio`]: () =>
          new Response("<html></html>", {
            status: 200,
            headers: {
              "cross-origin-opener-policy": "same-origin",
              "cross-origin-embedder-policy": "require-corp",
            },
          }),
      });

      const report = await runProductionPostDeploySmoke({
        fetchImpl,
        prevWorkerVersion: PREV_WORKER_VERSION,
        prevApiSha: PREV_API_SHA,
      });
      assert.equal(report.ok, true);
      assert.equal(report.failedCount, 0);
      assert.equal(report.rollback, null);
    });

    test("API 503 콜드스타트 후 재시도 옵션(--retries)으로 복구되면 통과한다", async () => {
      let readyCalls = 0;
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_API_URL}/api/health/ready`]: () => {
          readyCalls += 1;
          if (readyCalls === 1) {
            return new Response(JSON.stringify({ status: "not_ready" }), { status: 503 });
          }
          return new Response(JSON.stringify({ status: "ready" }), { status: 200 });
        },
      });

      const report = await runProductionPostDeploySmoke({
        fetchImpl,
        retries: 2,
        retryDelayMs: 0,
        sleepImpl: async () => undefined,
      });
      assert.equal(report.ok, true);
      assert.equal(readyCalls, 2);
      const readyCheck = report.checks.find((entry) => entry.path === "/api/health/ready");
      assert.equal(readyCheck?.attempts, 2);
    });
  });

  describe("COOP/COEP 누락 및 불일치 케이스", () => {
    test("/studio에서 Cross-Origin-Opener-Policy가 누락되면 종료 코드 1과 안전한 롤백 명령을 출력한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_WEB_URL}/studio`]: () =>
          new Response("<html></html>", {
            status: 200,
            headers: {
              "cross-origin-embedder-policy": "credentialless",
            },
          }),
      });

      const logs = [];
      const exitCode = await executePostDeploySmokeCli(
        [
          `--prev-worker-version=${PREV_WORKER_VERSION}`,
          `--prev-api-sha=${PREV_API_SHA}`,
        ],
        { fetchImpl, log: (line) => logs.push(line) },
      );

      assert.equal(exitCode, 1);
      const output = logs.join("\n");
      assert.match(output, /\[FAIL\] \/studio 교차 출처 격리 헤더 누락\/불일치/u);
      assert.match(output, /Cross-Origin-Opener-Policy=없음/u);
      assert.ok(output.includes(`wrangler versions deploy ${PREV_WORKER_VERSION}@100 --name toonspectrum-web --yes`));
      assert.ok(output.includes(`onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:${PREV_API_SHA}`));
      assert.doesNotMatch(output, /onpod\s+app\s+rollback/iu);
      assert.doesNotMatch(output, /--attach-db/iu);
    });

    test("/studio/character에서 Cross-Origin-Embedder-Policy가 누락되거나 잘못된 값이면 실패한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_WEB_URL}/studio/character`]: () =>
          new Response("<html></html>", {
            status: 200,
            headers: {
              "cross-origin-opener-policy": "same-origin",
              "cross-origin-embedder-policy": "unsafe-none",
            },
          }),
      });

      const report = await runProductionPostDeploySmoke({
        fetchImpl,
        prevWorkerVersion: PREV_WORKER_VERSION,
        prevApiSha: PREV_API_SHA,
      });

      assert.equal(report.ok, false);
      assert.equal(report.failedCount, 1);
      assert.equal(report.failures[0].path, "/studio/character");
      assert.equal(report.failures[0].errorCode, "COOP_COEP_HEADER_MISMATCH");
      assert.match(report.failures[0].message, /Cross-Origin-Embedder-Policy=unsafe-none/u);
      assert.ok(report.rollback);
    });
  });

  describe("API 헬스·SPA 실패 및 롤백 안내 케이스", () => {
    test("/api/health/ready 503 실패 시 종료 코드 1과 안전한 롤백 명령만 출력한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_API_URL}/api/health/ready`]: () =>
          new Response(JSON.stringify({ code: "SERVICE_NOT_READY", status: "not_ready" }), { status: 503 }),
      });

      const logs = [];
      const exitCode = await executePostDeploySmokeCli(
        [
          "--prev-worker-version", PREV_WORKER_VERSION,
          "--prev-api-sha", PREV_API_SHA,
        ],
        { fetchImpl, log: (line) => logs.push(line) },
      );

      assert.equal(exitCode, 1);
      const output = logs.join("\n");
      assert.match(output, /\[FAIL\] \/api\/health\/ready HTTP 503/u);
      assert.ok(output.includes(`wrangler versions deploy ${PREV_WORKER_VERSION}@100 --name toonspectrum-web --yes`));
      assert.ok(output.includes(`onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:${PREV_API_SHA}`));
      assert.doesNotMatch(output, /onpod\s+app\s+rollback/iu);
      assert.doesNotMatch(output, /--attach-db/iu);
      assert.doesNotMatch(output, /--env(?:-file)?\b/iu);
    });

    test("/api/health/live 비정상 JSON 또는 잘못된 status를 실패로 판정한다", async () => {
      const invalidJsonCase = createHealthyFetch({
        [`${DEFAULT_API_URL}/api/health/live`]: () => new Response("<html>error</html>", { status: 200 }),
      });
      const invalidJsonReport = await runProductionPostDeploySmoke({ fetchImpl: invalidJsonCase.fetchImpl });
      assert.equal(invalidJsonReport.ok, false);
      assert.equal(invalidJsonReport.failures[0].errorCode, "INVALID_JSON");

      const wrongStatusCase = createHealthyFetch({
        [`${DEFAULT_API_URL}/api/health/live`]: () =>
          new Response(JSON.stringify({ status: "degraded" }), { status: 200 }),
      });
      const wrongStatusReport = await runProductionPostDeploySmoke({ fetchImpl: wrongStatusCase.fetchImpl });
      assert.equal(wrongStatusReport.ok, false);
      assert.equal(wrongStatusReport.failures[0].errorCode, "UNEXPECTED_HEALTH_PAYLOAD");
    });

    test("/production 500 오류·리다이렉트·퇴역 Vercel 헤더·네트워크 오류를 각각 탐지한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_WEB_URL}/production`]: () => new Response("error", { status: 500 }),
        [`${DEFAULT_WEB_URL}/`]: () =>
          new Response(null, { status: 302, headers: { location: "https://other.invalid" } }),
        [`${DEFAULT_API_URL}/api/health/live`]: () => {
          throw new Error("socket hang up with sensitive-detail-not-logged");
        },
        [`${DEFAULT_API_URL}/api/health/ready`]: () =>
          new Response(JSON.stringify({ status: "ready" }), {
            status: 200,
            headers: { "x-vercel-id": "icn1::legacy" },
          }),
      });

      const report = await runProductionPostDeploySmoke({
        fetchImpl,
        prevWorkerVersion: PREV_WORKER_VERSION,
        prevApiSha: PREV_API_SHA,
      });

      assert.equal(report.ok, false);
      assert.equal(report.failedCount, 4);
      const codesByPath = Object.fromEntries(report.failures.map((item) => [item.path, item.errorCode]));
      assert.equal(codesByPath["/api/health/live"], "REQUEST_FAILED");
      assert.equal(codesByPath["/api/health/ready"], "RETIRED_VERCEL_ORIGIN");
      assert.equal(codesByPath["/"], "REDIRECT_NOT_ALLOWED");
      assert.equal(codesByPath["/production"], "HTTP_500");
      assert.equal(JSON.stringify(report).includes("sensitive-detail-not-logged"), false);
    });

    test("요청 타임아웃과 과대 JSON 응답(64KiB 초과)을 안전하게 실패 처리한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_API_URL}/api/health/live`]: () =>
          new Response(JSON.stringify({ status: "ok", pad: "x".repeat(70_000) }), { status: 200 }),
        [`${DEFAULT_API_URL}/api/health/ready`]: (_href, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          }),
      });

      const report = await runProductionPostDeploySmoke({
        fetchImpl,
        timeoutMs: 50,
        prevWorkerVersion: PREV_WORKER_VERSION,
        prevApiSha: PREV_API_SHA,
      });

      assert.equal(report.ok, false);
      const codesByPath = Object.fromEntries(report.failures.map((item) => [item.path, item.errorCode]));
      assert.equal(codesByPath["/api/health/live"], "RESPONSE_TOO_LARGE");
      assert.equal(codesByPath["/api/health/ready"], "REQUEST_TIMEOUT");
      assert.ok(report.rollback);
    });

    test("--json 출력 모드에서도 실패 시 롤백 안내와 종료 코드 1을 제공한다", async () => {
      const { fetchImpl } = createHealthyFetch({
        [`${DEFAULT_WEB_URL}/studio`]: () => new Response("<html></html>", { status: 502 }),
      });
      const logs = [];
      const exitCode = await executePostDeploySmokeCli(
        [
          "--json",
          "--prev-worker-version", PREV_WORKER_VERSION,
          "--prev-api-sha", PREV_API_SHA,
        ],
        { fetchImpl, log: (line) => logs.push(line) },
      );

      assert.equal(exitCode, 1);
      const parsed = JSON.parse(logs.join("\n"));
      assert.equal(parsed.ok, false);
      assert.equal(parsed.rollback.workerCommand, `wrangler versions deploy ${PREV_WORKER_VERSION}@100 --name toonspectrum-web --yes`);
      assert.equal(parsed.rollback.apiCommand, `onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:${PREV_API_SHA}`);
    });
  });

  describe("인자 검증 및 롤백 안전 가드", () => {
    test("이전 버전·SHA 미지정 시 안전한 자리표시자 명령을 생성하고 금지 명령을 포함하지 않는다", () => {
      const guidance = buildSafeRollbackGuidance();
      assert.equal(guidance.workerCommand, "wrangler versions deploy <prev-version-id>@100 --name toonspectrum-web --yes");
      assert.equal(guidance.apiCommand, "onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:<prev-sha>");
      assert.equal(guidance.hasExactWorkerVersion, false);
      assert.equal(guidance.hasExactApiSha, false);
      const serialized = JSON.stringify(guidance);
      assert.doesNotMatch(serialized, /onpod\s+app\s+rollback/iu);
      assert.doesNotMatch(serialized, /--attach-db/iu);
    });

    test("컷오버 이전 Render Worker 버전(70517470), 잘못된 SHA, 퇴역 원점, 셸 주입 입력을 거부한다", () => {
      assert.throws(
        () => parsePostDeploySmokeArgs(["--prev-worker-version", "70517470-1234-5678-9abc-def012345678"]),
        SmokeUsageError,
      );
      assert.throws(
        () => parsePostDeploySmokeArgs(["--prev-worker-version", "4670c23c; rm -rf /"]),
        SmokeUsageError,
      );
      assert.throws(
        () => parsePostDeploySmokeArgs(["--prev-api-sha", "not-a-sha"]),
        SmokeUsageError,
      );
      assert.throws(
        () => parsePostDeploySmokeArgs(["--api-url", "https://toonspectrum-core-api.onrender.com"]),
        SmokeUsageError,
      );
      assert.throws(
        () => parsePostDeploySmokeArgs(["--web-url", "http://www.toonstudio.cloud"]),
        SmokeUsageError,
      );
    });

    test("CLI 프로세스로 직접 실행 시 --help는 0, 잘못된 인자는 2로 종료한다", () => {
      const helpRun = spawnSync(process.execPath, [SCRIPT_PATH, "--help"], { encoding: "utf8" });
      assert.equal(helpRun.status, 0);
      assert.match(helpRun.stdout, /--prev-worker-version/u);

      const badRun = spawnSync(process.execPath, [SCRIPT_PATH, "--prev-api-sha", "bad"], { encoding: "utf8" });
      assert.equal(badRun.status, 2);
      assert.match(badRun.stderr, /소문자 40자리 16진수/u);
    });
  });
});
