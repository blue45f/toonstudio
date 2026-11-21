import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildSmokeReport,
  extractSessionCookie,
  parseVerifyLocalFullStackArgs,
  resolveSmokePorts,
  SMOKE_DEFAULT_API_PORT,
  SMOKE_DEFAULT_DB_PORT,
  SMOKE_DEFAULT_STORAGE_PORT,
  SMOKE_DEFAULT_TIMEOUT_MS,
  SMOKE_DEFAULT_WEB_PORT,
  SMOKE_SEEDED_TABLES,
  validateDatabaseRowSummary,
} from "./verify-local-full-stack.mjs";

const { describe, it } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const RUNNER_PATH = fileURLToPath(new URL("./verify-local-full-stack.mjs", import.meta.url));

describe("verify-local-full-stack args", () => {
  it("기본 옵션을 파싱한다", () => {
    assert.deepEqual(parseVerifyLocalFullStackArgs([]), {
      help: false,
      json: false,
      skipWeb: false,
      dbPort: null,
      apiPort: null,
      webPort: null,
      storagePort: null,
      timeoutMs: SMOKE_DEFAULT_TIMEOUT_MS,
    });
  });

  it("명시적 4포트·타임아웃·플래그를 파싱한다", () => {
    const parsed = parseVerifyLocalFullStackArgs([
      "--db-port",
      "55441",
      "--api-port=4021",
      "--web-port",
      "5191",
      "--storage-port=59021",
      "--timeout-ms=90000",
      "--json",
      "--skip-web",
    ]);
    assert.equal(parsed.dbPort, 55441);
    assert.equal(parsed.apiPort, 4021);
    assert.equal(parsed.webPort, 5191);
    assert.equal(parsed.storagePort, 59021);
    assert.equal(parsed.timeoutMs, 90000);
    assert.equal(parsed.json, true);
    assert.equal(parsed.skipWeb, true);
  });

  it("포트 충돌·잘못된 범위·알 수 없는 인자를 거부한다", () => {
    assert.throws(() => parseVerifyLocalFullStackArgs(["--db-port", "4019", "--api-port", "4019"]), /포트 충돌/);
    assert.throws(() => parseVerifyLocalFullStackArgs(["--storage-port", "4019", "--api-port", "4019"]), /포트 충돌/);
    assert.throws(() => parseVerifyLocalFullStackArgs(["--web-port=0"]), /포트/);
    assert.throws(() => parseVerifyLocalFullStackArgs(["--storage-port=0"]), /포트/);
    assert.throws(() => parseVerifyLocalFullStackArgs(["--timeout-ms=100"]), /1000-900000/);
    assert.throws(() => parseVerifyLocalFullStackArgs(["--bogus"]), /알 수 없는 인자/);
  });
});

describe("verify-local-full-stack port resolution", () => {
  it("기본 포트가 비어 있으면 55439/4019/5189/59019를 선택한다", async () => {
    const ports = await resolveSmokePorts(
      {},
      {
        isTcpPortFree: async () => true,
        findAvailablePort: async (preferred) => preferred,
      },
    );
    assert.deepEqual(ports, {
      dbPort: SMOKE_DEFAULT_DB_PORT,
      apiPort: SMOKE_DEFAULT_API_PORT,
      webPort: SMOKE_DEFAULT_WEB_PORT,
      storagePort: SMOKE_DEFAULT_STORAGE_PORT,
    });
  });

  it("점유된 기본 포트를 건너뛰어 충돌 없는 4포트를 자동 선택한다", async () => {
    const busy = new Set([SMOKE_DEFAULT_DB_PORT, SMOKE_DEFAULT_API_PORT, SMOKE_DEFAULT_STORAGE_PORT]);
    const ports = await resolveSmokePorts(
      {},
      {
        isTcpPortFree: async (port) => !busy.has(port),
        findAvailablePort: async (preferred, { exclude }) => {
          let candidate = preferred;
          while (busy.has(candidate) || exclude.has(candidate)) candidate += 1;
          return candidate;
        },
      },
    );
    assert.equal(ports.dbPort, SMOKE_DEFAULT_DB_PORT + 1);
    assert.equal(ports.apiPort, SMOKE_DEFAULT_API_PORT + 1);
    assert.equal(ports.webPort, SMOKE_DEFAULT_WEB_PORT);
    assert.equal(ports.storagePort, SMOKE_DEFAULT_STORAGE_PORT + 1);
  });

  it("사용자가 고정 지정한 포트가 이미 사용 중이면 즉시 실패한다", async () => {
    await assert.rejects(
      () =>
        resolveSmokePorts(
          { apiPort: 4019 },
          {
            isTcpPortFree: async (port) => port !== 4019,
            findAvailablePort: async (preferred) => preferred,
          },
        ),
      /API 포트 4019가 이미 사용 중/,
    );
  });
});

describe("verify-local-full-stack helpers", () => {
  it("Set-Cookie 헤더에서 세션 쿠키 쌍과 HttpOnly 여부를 추출한다", () => {
    const extracted = extractSessionCookie([
      "toonstudio_session=synthetic-cookie-value; Path=/; HttpOnly; SameSite=Lax",
    ]);
    assert.deepEqual(extracted, {
      pair: "toonstudio_session=synthetic-cookie-value",
      httpOnly: true,
    });
    assert.equal(extractSessionCookie(["toonstudio_session=; Max-Age=0; Path=/"]), null);
    assert.equal(extractSessionCookie([]), null);
  });

  it("DB 테이블·행 수 정합성을 검증한다", () => {
    const validTableRows = Object.fromEntries(SMOKE_SEEDED_TABLES.map((name) => [name, 3]));
    assert.deepEqual(
      validateDatabaseRowSummary({
        publicTableCount: 245,
        tableRows: validTableRows,
      }),
      { ok: true, failures: [] },
    );

    const broken = validateDatabaseRowSummary({
      publicTableCount: 10,
      tableRows: { ...validTableRows, user: 0 },
    });
    assert.equal(broken.ok, false);
    assert.ok(broken.failures.some((msg) => msg.includes("public 테이블 수 부족")));
    assert.ok(broken.failures.some((msg) => msg.includes("user=0")));
  });

  it("스모크 리포트의 종합 ok 판정은 단계·검증·4포트 및 스토리지 정리 완료를 모두 요구한다", () => {
    const base = {
      startedAt: "2026-11-21T09:00:00.000Z",
      finishedAt: "2026-11-21T09:00:42.000Z",
      ports: { dbPort: 55439, apiPort: 4019, webPort: 5189, storagePort: 59019 },
      postgres: { binDir: "/opt/homebrew/opt/postgresql@17/bin", version: "PostgreSQL 17.11", backend: "local-cluster" },
      database: { url: "postgresql://***@127.0.0.1:55439/postgres", publicTableCount: 245, tableRows: { user: 15 } },
      storage: { endpoint: "http://127.0.0.1:59019", bucket: "studio-manuscripts", bytesVerified: 2112, deletedVerified: true },
      studioSeed: { teamMemberIds: ["studio-pd"], cutSliceCount: 9, idempotentVerified: true },
      steps: [{ name: "postgres_cluster", ok: true, durationMs: 1200 }],
      checks: [{ name: "api.health.ready", ok: true, durationMs: 20 }],
      cleanup: {
        clusterRemoved: true,
        storageRemoved: true,
        portsReleased: { db: true, api: true, web: true, storage: true },
      },
    };

    const passing = buildSmokeReport(base);
    assert.equal(passing.ok, true);
    assert.equal(passing.durationMs, 42_000);
    assert.equal(passing.zeroProductionCalls, true);
    assert.equal(passing.loopbackOnly, true);

    const leakedCleanup = buildSmokeReport({
      ...base,
      cleanup: {
        clusterRemoved: false,
        storageRemoved: true,
        portsReleased: { db: true, api: true, web: true, storage: true },
      },
    });
    assert.equal(leakedCleanup.ok, false);

    const leakedStoragePort = buildSmokeReport({
      ...base,
      cleanup: {
        clusterRemoved: true,
        storageRemoved: true,
        portsReleased: { db: true, api: true, web: true, storage: false },
      },
    });
    assert.equal(leakedStoragePort.ok, false);

    const failedCheck = buildSmokeReport({
      ...base,
      checks: [{ name: "api.health.ready", ok: false, durationMs: 20 }],
    });
    assert.equal(failedCheck.ok, false);
  });

  it("--help 실행이 종료 코드 0으로 한글 도움말을 출력한다", () => {
    const result = spawnSync(process.execPath, [RUNNER_PATH, "--help"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pnpm run local:test:smoke/u);
    assert.match(result.stdout, /127\.0\.0\.1/u);
  });
});
