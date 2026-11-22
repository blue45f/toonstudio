const { afterEach, describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_API_URL,
  DEFAULT_REPOSITORY_ROOT,
  DEFAULT_WEB_URL,
  OPS_DASHBOARD_SCHEMA_VERSION,
  collectOpsDashboard,
  formatOpsDashboardReport,
  sanitizeOpsText,
} from "./lib/ops-dashboard-core.mjs";
import {
  OpsDashboardUsageError,
  executeOpsDashboardCli,
  parseOpsDashboardArgs,
} from "./ops-dashboard.mjs";

const tempRoots = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempRepo({
  migrations = ["0001_init_ledger.sql", "0002_creator_work.sql", "0003_production_division_os.sql"],
  manifestOverride = null,
  standingApproval = {
    grantedAt: "2026-10-16",
    grantedBy: "저장소 소유자",
    note: "테스트용 상시 승인 파일 — 클라우드 정적 웹 및 GHCR 이미지 빌드 상시 승인 범위",
    scopes: [
      "cloudflare-static-production",
      "cloudflare-apex-redirect-production",
      "core-api-container-release",
      "render-core-api-image-deploy",
    ],
  },
  staticApproval = {
    grantedAt: "2026-10-13",
    grantedBy: "저장소 소유자",
    note: "정적 웹 상시 승인",
    scope: "cloudflare-static-production",
  },
  buildMeta = null,
  envLines = null,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-ops-dashboard-"));
  tempRoots.push(root);

  const migrationDir = join(root, "apps/api/src/platform/database/migrations");
  mkdirSync(migrationDir, { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const name of migrations) {
    writeFileSync(join(migrationDir, name), "-- test fixture\nSELECT 1;\n", "utf8");
  }
  const manifestLines = manifestOverride
    ?? migrations.map((name) => `apps/api/src/platform/database/migrations/${name}`);
  writeFileSync(
    join(root, "scripts/production-database-migrations.manifest"),
    `${manifestLines.join("\n")}\n`,
    "utf8",
  );

  mkdirSync(join(root, "deploy/cloudflare-static"), { recursive: true });
  if (standingApproval !== null) {
    writeFileSync(
      join(root, "deploy/STANDING_APPROVAL.json"),
      `${JSON.stringify(standingApproval, null, 2)}\n`,
      "utf8",
    );
  }
  if (staticApproval !== null) {
    writeFileSync(
      join(root, "deploy/cloudflare-static/STANDING_APPROVAL.json"),
      `${JSON.stringify(staticApproval)}\n`,
      "utf8",
    );
  }

  if (buildMeta !== null) {
    mkdirSync(join(root, "dist/.vite"), { recursive: true });
    writeFileSync(
      join(root, "dist/.vite/build-meta.json"),
      `${JSON.stringify(buildMeta, null, 2)}\n`,
      "utf8",
    );
  }

  if (envLines !== null) {
    const envPath = join(root, ".env.infrastructure.local");
    writeFileSync(envPath, `${envLines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(envPath, 0o600);
  }

  return root;
}

function createMockResponse({ status = 200, jsonBody = null, headers = {} } = {}) {
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const textPayload = jsonBody === null ? "<html>ok</html>" : JSON.stringify(jsonBody);
  return {
    status,
    headers: {
      get: (name) => headerMap.get(String(name).toLowerCase()) ?? null,
    },
    text: async () => textPayload,
    json: async () => (jsonBody === null ? JSON.parse(textPayload) : jsonBody),
    body: {
      cancel: async () => undefined,
    },
  };
}

function createHealthyMockExec({
  branch = "main",
  headSha = "a".repeat(40),
  originMainSha = "a".repeat(40),
  porcelain = "",
  recentRuns = null,
  jobs = null,
} = {}) {
  const runsPayload = recentRuns ?? [
    { id: 501, run_number: 501, run_attempt: 1, path: ".github/workflows/ci.yml", head_branch: "main", head_sha: originMainSha, event: "push", status: "completed", conclusion: "success", created_at: "2026-11-22T03:00:00Z" },
    { id: 500, run_number: 500, run_attempt: 1, path: ".github/workflows/ci.yml", head_branch: "main", head_sha: "b".repeat(40), event: "push", status: "completed", conclusion: "success", created_at: "2026-11-22T02:00:00Z" },
    { id: 499, run_number: 499, run_attempt: 1, path: ".github/workflows/ci.yml", head_branch: "feat/x", head_sha: "c".repeat(40), event: "pull_request", status: "completed", conclusion: "failure", created_at: "2026-11-22T01:00:00Z" },
    { id: 498, run_number: 498, run_attempt: 1, path: ".github/workflows/ci.yml", head_branch: "main", head_sha: "d".repeat(40), event: "push", status: "completed", conclusion: "success", created_at: "2026-11-22T00:00:00Z" },
    { id: 497, run_number: 497, run_attempt: 1, path: ".github/workflows/ci.yml", head_branch: "main", head_sha: "e".repeat(40), event: "push", status: "completed", conclusion: "success", created_at: "2026-11-21T23:00:00Z" },
  ];
  const jobsPayload = jobs ?? [
    { run_id: 501, run_attempt: 1, head_sha: originMainSha, name: "core", status: "completed", conclusion: "success" },
    { run_id: 501, run_attempt: 1, head_sha: originMainSha, name: "verify", status: "completed", conclusion: "success" },
  ];

  const calls = [];
  const execImpl = async (command, args) => {
    calls.push({ command, args });
    if (command === "git") {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: `${branch}\n` };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: `${headSha}\n` };
      if (args[0] === "rev-parse" && args[1] === "origin/main") return { stdout: `${originMainSha}\n` };
      if (args[0] === "status") return { stdout: porcelain };
    }
    if (command === "gh" && args[0] === "api") {
      const endpoint = args[1] ?? "";
      if (endpoint.includes("/actions/workflows/ci.yml/runs")) {
        return { stdout: JSON.stringify({ workflow_runs: runsPayload }) };
      }
      if (endpoint.includes("/jobs")) {
        return { stdout: JSON.stringify({ jobs: jobsPayload }) };
      }
    }
    throw new Error(`예기치 않은 명령 호출: ${command} ${args.join(" ")}`);
  };
  return { execImpl, calls };
}

function createHealthyMockFetch() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === `${DEFAULT_API_URL}/api/health/live`) {
      return createMockResponse({ status: 200, jsonBody: { status: "ok" } });
    }
    if (url === `${DEFAULT_API_URL}/api/health/ready`) {
      return createMockResponse({ status: 200, jsonBody: { status: "ready" } });
    }
    if (url === DEFAULT_WEB_URL) {
      return createMockResponse({ status: 200 });
    }
    if (url === `${DEFAULT_WEB_URL}/studio`) {
      return createMockResponse({
        status: 200,
        headers: {
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "credentialless",
        },
      });
    }
    throw new Error(`예기치 않은 URL: ${url}`);
  };
  return { fetchImpl, calls };
}

describe("ops-dashboard 통합 상태판 CLI", () => {
  test("실제 저장소에서 오프라인 모드로 실행하면 필수 섹션과 마이그레이션 원장을 정확히 보고한다", async () => {
    const report = await collectOpsDashboard({
      rootDir: DEFAULT_REPOSITORY_ROOT,
      offline: true,
    });

    assert.equal(report.schemaVersion, OPS_DASHBOARD_SCHEMA_VERSION);
    assert.equal(report.mode, "offline");
    assert.equal(report.git.ok, true);
    assert.ok(report.git.headSha && report.git.headSha.length === 40);
    assert.equal(report.migrations.ok, true);
    assert.ok(report.migrations.totalCount >= 133);
    assert.match(report.migrations.latestName ?? "", /^\d{4}_[a-z0-9_]+$/u);
    assert.equal(report.standingApproval.ok, true);
    assert.equal(report.standingApproval.mode, "standing-approval");
    assert.equal(report.liveHealth.skipped, true);
    assert.equal(report.ci.skipped, true);

    assert.equal(report.infrastructure.active.web.url, "https://www.toonstudio.cloud");
    assert.equal(report.infrastructure.active.api.url, "https://toonstudio-api.onpod.ai");
    assert.equal(report.infrastructure.active.database.resource, "toonstudio-db");
    const retiredIds = report.infrastructure.retired.map((entry) => entry.id);
    assert.ok(retiredIds.includes("vercel"));
    assert.ok(retiredIds.includes("render"));
    assert.ok(retiredIds.includes("supabase"));
    const forbidden = report.infrastructure.forbiddenCommands.map((entry) => entry.command);
    assert.ok(forbidden.includes("onpod app deploy --attach-db"));
    assert.ok(forbidden.includes("onpod app rollback"));
  });

  test("정상 온라인 모드에서 Git·인프라·마이그레이션·라이브 헬스·CI·상시 승인·빌드 메타를 3초 이내에 통합 수집한다", async () => {
    const sha = "a".repeat(40);
    const root = createTempRepo({
      buildMeta: { gitSha: sha, buildId: "12345678abcd", catalogSource: "static" },
      envLines: [
        "CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef",
        "CLOUDFLARE_API_TOKEN=fixture-cf-val-ok-1234567890",
        "ONPOD_DEPLOY_TOKEN=fixture-onpod-val-ok-1234567890",
        "ONPOD_API_ENV_AUTH_SESSION_SECRET=fixture-session-secret-0123456789abcdef",
        "ONPOD_API_ENV_AUTH_STATE_SECRET=fixture-state-secret-0123456789abcdef",
        "ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET=fixture-edge-secret-0123456789abcdef",
        "ONPOD_API_ENV_STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET=fixture-ticket-secret-0123456789abcdef",
        "ONPOD_API_ENV_TRAFFIC_ANALYTICS_D1_RPC_TOKEN=fixture-d1-secret-0123456789abcdef",
      ],
    });
    const { execImpl } = createHealthyMockExec({ headSha: sha, originMainSha: sha });
    const { fetchImpl, calls: fetchCalls } = createHealthyMockFetch();

    const report = await collectOpsDashboard({
      rootDir: root,
      offline: false,
      fetchImpl,
      execImpl,
      now: () => new Date("2026-11-22T04:15:00.000Z"),
    });

    assert.equal(report.overallStatus, "ok");
    assert.deepEqual(report.degradedReasons, []);
    assert.equal(report.generatedAt, "2026-11-22T04:15:00.000Z");
    assert.ok(report.durationMs < 3_000);
    assert.equal(fetchCalls.length, 4);

    assert.equal(report.git.branch, "main");
    assert.equal(report.git.clean, true);
    assert.equal(report.git.headMatchesOriginMain, true);

    assert.equal(report.migrations.ok, true);
    assert.equal(report.migrations.totalCount, 3);
    assert.equal(report.migrations.latestNumber, "0003");
    assert.equal(report.migrations.latestName, "0003_production_division_os");

    assert.equal(report.liveHealth.status, "healthy");
    assert.equal(report.liveHealth.ok, true);
    assert.equal(report.liveHealth.summary.passed, 4);
    assert.equal(report.liveHealth.headers.webStudio.coop, "same-origin");
    assert.equal(report.liveHealth.headers.webStudio.coep, "credentialless");
    assert.equal(report.liveHealth.headers.webStudio.isolated, true);

    assert.equal(report.ci.available, true);
    assert.equal(report.ci.status, "ok");
    assert.equal(report.ci.recent.total, 5);
    assert.equal(report.ci.recent.success, 4);
    assert.equal(report.ci.recent.failure, 1);
    assert.equal(report.ci.recent.successRatePct, 80);
    assert.equal(report.ci.originMain.allGreen, true);
    assert.deepEqual(report.ci.originMain.gates, { core: "success", verify: "success" });

    assert.equal(report.standingApproval.ok, true);
    assert.equal(report.buildMeta.status, "matched");
    assert.equal(report.buildMeta.matchesOriginMain, true);
    assert.equal(report.infrastructure.localEnv.fileExists, true);
    assert.equal(report.infrastructure.localEnv.requiredKeysSatisfied, true);

    const formatted = formatOpsDashboardReport(report);
    assert.match(formatted, /종합: 정상/u);
    assert.match(formatted, /0003_production_division_os/u);
    assert.match(formatted, /성공률 80%/u);
    assert.match(formatted, /onpod app deploy --attach-db/u);
    assert.match(formatted, /onpod app rollback/u);
  });

  test("부분 장애(API 503·COOP/COEP 누락·gh 미설치·build-meta SHA 불일치·워킹트리 변경)를 중단 없이 격리 보고한다", async () => {
    const originSha = "a".repeat(40);
    const staleSha = "f".repeat(40);
    const root = createTempRepo({
      buildMeta: { gitSha: staleSha, buildId: "abcdef123456" },
    });

    const execImpl = async (command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/test-branch\n" };
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: `${staleSha}\n` };
        if (args[0] === "rev-parse" && args[1] === "origin/main") return { stdout: `${originSha}\n` };
        if (args[0] === "status") return { stdout: " M scripts/ops-dashboard.mjs\n?? temp.txt\n" };
      }
      if (command === "gh") {
        const err = new Error("spawn gh ENOENT");
        err.code = "ENOENT";
        throw err;
      }
      throw new Error("unexpected");
    };

    const fetchImpl = async (url) => {
      if (url.endsWith("/api/health/live")) return createMockResponse({ status: 200, jsonBody: { status: "ok" } });
      if (url.endsWith("/api/health/ready")) return createMockResponse({ status: 503, jsonBody: { status: "degraded" } });
      if (url === DEFAULT_WEB_URL) return createMockResponse({ status: 200 });
      if (url.endsWith("/studio")) {
        return createMockResponse({ status: 200, headers: { "cross-origin-opener-policy": "unsafe-none" } });
      }
      throw new Error("unexpected url");
    };

    const report = await collectOpsDashboard({ rootDir: root, offline: false, execImpl, fetchImpl });

    assert.equal(report.overallStatus, "degraded");
    assert.equal(report.git.clean, false);
    assert.equal(report.git.dirtyCount, 2);
    assert.equal(report.liveHealth.status, "degraded");
    assert.equal(report.liveHealth.summary.passed, 2);
    assert.equal(report.liveHealth.summary.failed, 2);
    assert.equal(report.liveHealth.checks.find((c) => c.id === "apiReady")?.errorCode, "HTTP_503");
    assert.equal(report.liveHealth.checks.find((c) => c.id === "webStudio")?.errorCode, "COOP_COEP_HEADER_MISMATCH");
    assert.equal(report.ci.available, false);
    assert.equal(report.ci.status, "unavailable");
    assert.equal(report.buildMeta.status, "mismatch");
    assert.equal(report.buildMeta.matchesOriginMain, false);

    // 금지 명령이 권장 명령 목록에 절대 포함되지 않는다.
    for (const rec of report.recommendations) {
      assert.equal(rec.command.includes("--attach-db"), false);
      assert.equal(rec.command.includes("onpod app rollback"), false);
      assert.equal(rec.command.includes("--no-verify"), false);
    }
    assert.ok(report.recommendations.some((rec) => rec.command.includes("verify-production-post-deploy-smoke.mjs")));
    assert.ok(report.recommendations.some((rec) => rec.command === "pnpm run build"));
  });

  test("엔드포인트 타임아웃·퇴역 Vercel 헤더·상시 승인 누락·마이그레이션 드리프트를 정확히 탐지한다", async () => {
    const sha = "c".repeat(40);
    const root = createTempRepo({
      migrations: ["0001_init.sql", "0003_unregistered.sql"],
      manifestOverride: [
        "apps/api/src/platform/database/migrations/0001_init.sql",
        "apps/api/src/platform/database/migrations/0002_missing.sql",
      ],
      standingApproval: null,
      staticApproval: null,
    });
    const { execImpl } = createHealthyMockExec({ headSha: sha, originMainSha: sha });

    const fetchImpl = (url, init) => {
      if (url.endsWith("/api/health/live")) {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          }, { once: true });
        });
      }
      if (url.endsWith("/api/health/ready")) {
        return Promise.resolve(createMockResponse({ status: 200, jsonBody: { status: "ready" } }));
      }
      if (url === DEFAULT_WEB_URL) {
        return Promise.resolve(createMockResponse({ status: 200, headers: { "x-vercel-id": "icn1::stale" } }));
      }
      return Promise.resolve(createMockResponse({
        status: 200,
        headers: { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" },
      }));
    };

    const report = await collectOpsDashboard({
      rootDir: root,
      offline: false,
      timeoutMs: 250,
      execImpl,
      fetchImpl,
    });

    assert.equal(report.overallStatus, "degraded");
    assert.equal(report.migrations.ok, false);
    assert.equal(report.migrations.missingFilesCount, 1);
    assert.equal(report.migrations.unregisteredFilesCount, 1);
    assert.equal(report.standingApproval.ok, false);
    assert.equal(report.standingApproval.mode, "explicit-approval-required");
    assert.equal(report.liveHealth.checks.find((c) => c.id === "apiLive")?.errorCode, "REQUEST_TIMEOUT");
    assert.equal(report.liveHealth.checks.find((c) => c.id === "webRoot")?.errorCode, "RETIRED_VERCEL_ORIGIN");
    assert.equal(report.liveHealth.checks.find((c) => c.id === "webStudio")?.ok, true);
  });

  test("오프라인 모드(--offline)는 fetch와 gh를 단 한 번도 호출하지 않고 JSON 스키마를 반환한다", async () => {
    const sha = "d".repeat(40);
    const root = createTempRepo();
    const { execImpl, calls: execCalls } = createHealthyMockExec({ headSha: sha, originMainSha: sha });
    let fetchCalled = 0;
    const fetchImpl = async () => {
      fetchCalled += 1;
      return createMockResponse({ status: 200 });
    };

    const logs = [];
    const errors = [];
    const exitCode = await executeOpsDashboardCli(["--offline", "--json", "--root", root], {
      fetchImpl,
      execImpl,
      log: (line) => logs.push(line),
      errorLog: (line) => errors.push(line),
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(errors, []);
    assert.equal(fetchCalled, 0);
    assert.equal(execCalls.some((call) => call.command === "gh"), false);

    const parsed = JSON.parse(logs.join("\n"));
    for (const key of [
      "schemaVersion",
      "generatedAt",
      "mode",
      "overallStatus",
      "degradedReasons",
      "durationMs",
      "git",
      "infrastructure",
      "migrations",
      "liveHealth",
      "ci",
      "standingApproval",
      "buildMeta",
      "recommendations",
    ]) {
      assert.ok(Object.hasOwn(parsed, key), `JSON 필수 키 누락: ${key}`);
    }
    assert.equal(parsed.mode, "offline");
    assert.equal(parsed.liveHealth.skipped, true);
    assert.equal(parsed.ci.skipped, true);
  });

  test("시크릿 미노출 검증: .env 및 외부 오류 메시지에 포함된 sk-, postgres://, Bearer 등이 0건 노출된다", async () => {
    // 테스트 소스 자체가 secretlint에 걸리지 않도록 동적 조합으로 합성 시크릿을 만든다.
    const synthOpenAiKey = ["sk", "proj", "SyntheticLeakCheck9876543210"].join("-");
    const synthDsn = ["postgres", "://", "opsuser", ":", "SyntheticDbPass98765", "@toonstudio-db.db.onpod.ai:5432/toonstudio"].join("");
    const synthBearer = ["Bear", "er ", "SyntheticJwtTokenAlphaBetaGamma12345"].join("");
    const synthOnpodToken = ["op", "u", "SyntheticOnpodToken99887766"].join("_");
    const synthGhToken = ["ghp", "SyntheticGhToken112233445566"].join("_");

    const root = createTempRepo({
      envLines: [
        "CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef",
        `CLOUDFLARE_API_TOKEN=${synthOpenAiKey}`,
        `ONPOD_DEPLOY_TOKEN=${synthOnpodToken}`,
        `ONPOD_DATABASE_URL=${synthDsn}`,
        `ONPOD_API_ENV_AUTH_SESSION_SECRET=${synthBearer}`,
        "ONPOD_API_ENV_AUTH_STATE_SECRET=synthetic-state-fixture-0123456789abcdef",
        "ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET=synthetic-edge-fixture-0123456789abcdef",
        "ONPOD_API_ENV_STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET=synthetic-ticket-fixture-0123456789abcdef",
        "ONPOD_API_ENV_TRAFFIC_ANALYTICS_D1_RPC_TOKEN=synthetic-d1-fixture-0123456789abcdef",
      ],
    });

    const execImpl = async (command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "main\n" };
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: `${"e".repeat(40)}\n` };
        if (args[0] === "rev-parse" && args[1] === "origin/main") {
          throw new Error(`remote failed with ${synthDsn} and ${synthOpenAiKey} and ${synthBearer}`);
        }
        if (args[0] === "status") return { stdout: "" };
      }
      if (command === "gh") {
        throw new Error(`gh api failed auth=${synthBearer} token=${synthGhToken} key=${synthOpenAiKey}`);
      }
      throw new Error(`unexpected ${synthOnpodToken}`);
    };

    const fetchImpl = async () => {
      throw new Error(`fetch rejected ${synthDsn} ${synthBearer} ${synthOpenAiKey}`);
    };

    const report = await collectOpsDashboard({ rootDir: root, offline: false, execImpl, fetchImpl });
    const serializedJson = JSON.stringify(report);
    const formattedText = formatOpsDashboardReport(report);
    const combinedOutput = `${serializedJson}\n${formattedText}`;

    // 존재 여부(boolean)는 정상 반영되어야 한다.
    assert.equal(report.infrastructure.localEnv.fileExists, true);
    assert.equal(report.infrastructure.localEnv.requiredKeysSatisfied, true);
    const cfEntry = report.infrastructure.localEnv.keyPresence.find((k) => k.key === "CLOUDFLARE_API_TOKEN");
    assert.equal(cfEntry?.present, true);
    assert.equal(Object.hasOwn(cfEntry ?? {}, "maskedValue"), false);

    // 민감 패턴 및 합성 원본 문자열 누출 0건 검증
    for (const forbiddenNeedle of [
      "sk-",
      "postgres://",
      "postgresql://",
      "Bearer ",
      synthOpenAiKey,
      synthDsn,
      synthBearer,
      synthOnpodToken,
      synthGhToken,
      "SyntheticDbPass98765",
      "SyntheticJwtTokenAlphaBetaGamma12345",
    ]) {
      assert.equal(
        combinedOutput.includes(forbiddenNeedle),
        false,
        `민감 패턴이 출력에 노출되었습니다: ${forbiddenNeedle}`,
      );
    }

    // 단위 sanitizeOpsText 직접 검증
    const scrubbed = sanitizeOpsText(`err ${synthOpenAiKey} ${synthDsn} ${synthBearer} ${synthOnpodToken} ${synthGhToken}`);
    assert.equal(scrubbed.includes("sk-"), false);
    assert.equal(scrubbed.includes("postgres://"), false);
    assert.equal(scrubbed.includes("Bearer"), false);
    assert.equal(scrubbed.includes("Synthetic"), false);
  });

  test("origin/main 실행이 최근 5건에 없을 때 head_sha 쿼리로 폴백해 core/verify 상태를 판정한다", async () => {
    const originSha = "9".repeat(40);
    const root = createTempRepo();
    const { fetchImpl } = createHealthyMockFetch();

    const execImpl = async (command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "main\n" };
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: `${originSha}\n` };
        if (args[0] === "rev-parse" && args[1] === "origin/main") return { stdout: `${originSha}\n` };
        if (args[0] === "status") return { stdout: "" };
      }
      if (command === "gh" && args[0] === "api") {
        const endpoint = args[1] ?? "";
        if (endpoint.includes(`head_sha=${originSha}`)) {
          return {
            stdout: JSON.stringify({
              workflow_runs: [
                { id: 777, run_number: 777, run_attempt: 2, path: ".github/workflows/ci.yml", head_branch: "main", head_sha: originSha, event: "push", status: "completed", conclusion: "success" },
              ],
            }),
          };
        }
        if (endpoint.includes("/actions/workflows/ci.yml/runs?per_page=5")) {
          return {
            stdout: JSON.stringify({
              workflow_runs: [
                { id: 800, run_number: 800, run_attempt: 1, path: ".github/workflows/ci.yml", head_branch: "feat/pr", head_sha: "1".repeat(40), event: "pull_request", status: "completed", conclusion: "success" },
              ],
            }),
          };
        }
        if (endpoint.includes("/actions/runs/777/attempts/2/jobs")) {
          return {
            stdout: JSON.stringify({
              jobs: [
                { run_id: 777, run_attempt: 2, head_sha: originSha, name: "core", status: "completed", conclusion: "success" },
                { run_id: 777, run_attempt: 2, head_sha: originSha, name: "verify", status: "in_progress", conclusion: null },
              ],
            }),
          };
        }
      }
      throw new Error("unexpected");
    };

    const report = await collectOpsDashboard({ rootDir: root, offline: false, execImpl, fetchImpl });
    assert.equal(report.ci.originMain.runId, 777);
    assert.equal(report.ci.originMain.runAttempt, 2);
    assert.deepEqual(report.ci.originMain.gates, { core: "success", verify: "in_progress" });
    assert.equal(report.ci.originMain.allGreen, false);
  });

  test("CLI 옵션 파싱(--help, 잘못된 옵션, 퇴역 도메인 거부)을 안전하게 처리한다", async () => {
    const parsed = parseOpsDashboardArgs(["--json", "--offline", "--timeout-ms", "1500"]);
    assert.equal(parsed.json, true);
    assert.equal(parsed.offline, true);
    assert.equal(parsed.timeoutMs, 1500);

    assert.throws(() => parseOpsDashboardArgs(["--unknown-flag"]), OpsDashboardUsageError);
    assert.throws(() => parseOpsDashboardArgs(["--web-url", "https://legacy.vercel.app"]), OpsDashboardUsageError);
    assert.throws(() => parseOpsDashboardArgs(["--timeout-ms", "50"]), OpsDashboardUsageError);

    const helpLogs = [];
    const helpCode = await executeOpsDashboardCli(["--help"], { log: (line) => helpLogs.push(line) });
    assert.equal(helpCode, 0);
    assert.match(helpLogs.join("\n"), /사용법: node scripts\/ops-dashboard\.mjs/u);

    const errLogs = [];
    const errCode = await executeOpsDashboardCli(["--bad-flag"], { errorLog: (line) => errLogs.push(line) });
    assert.equal(errCode, 2);
    assert.match(errLogs.join("\n"), /입력 오류/u);
  });
});
