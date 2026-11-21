import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";

import {
  apiHealthUrl,
  apiReadyUrl,
  assertDisposableSeedAllowed,
  buildDisposableApiEnv,
  buildIsolatedLocalEnv,
  buildPostgresPathEnv,
  disposableDatabaseUrl,
  disposableRuntimeDatabaseUrl,
  dockerContainerName,
  findAvailablePort,
  isRemoteDatabaseUrl,
  isTcpPortFree,
  LOCAL_TEST_DB_CONTAINER,
  LOCAL_TEST_DEFAULT_STORAGE_PORT,
  LOCAL_TEST_RUNTIME_PASSWORD,
  localClusterDir,
  parseLocalTestStackArgs,
  redactDatabaseUrl,
  resolvePostgresBinary,
  resolvePostgresBinaryDir,
  storageHealthUrl,
  webHealthUrl,
} from "./local-test-stack.mjs";

describe("local-test-stack args", () => {
  it("기본값은 DB 55432 + API 4001 + Web 5173 + Storage 59000", () => {
    assert.deepEqual(parseLocalTestStackArgs([]), {
      check: false,
      help: false,
      json: false,
      seed: false,
      seedOnly: false,
      studioSeed: false,
      resetDb: false,
      dbBackend: "auto",
      dbPort: 55432,
      apiPort: 4001,
      webPort: 5173,
      storagePort: LOCAL_TEST_DEFAULT_STORAGE_PORT,
    });
  });

  it("--check/--reset-db/--seed/--studio-seed/--json/4포트/백엔드를 파싱한다", () => {
    const parsed = parseLocalTestStackArgs([
      "--check",
      "--reset-db",
      "--seed",
      "--studio-seed",
      "--json",
      "--db-port",
      "55449",
      "--api-port",
      "4101",
      "--web-port=5273",
      "--storage-port=59100",
      "--db-backend=local",
    ]);
    assert.equal(parsed.check, true);
    assert.equal(parsed.resetDb, true);
    assert.equal(parsed.seed, true);
    assert.equal(parsed.studioSeed, true);
    assert.equal(parsed.seedOnly, false);
    assert.equal(parsed.json, true);
    assert.equal(parsed.dbPort, 55449);
    assert.equal(parsed.apiPort, 4101);
    assert.equal(parsed.webPort, 5273);
    assert.equal(parsed.storagePort, 59100);
    assert.equal(parsed.dbBackend, "local");
  });

  it("--seed-only와 --studio-seed는 seed 플래그도 함께 켠다", () => {
    const parsed = parseLocalTestStackArgs(["--seed-only", "--db-port=55445"]);
    assert.equal(parsed.seed, true);
    assert.equal(parsed.seedOnly, true);
    assert.equal(parsed.dbPort, 55445);

    const studio = parseLocalTestStackArgs(["--studio-seed", "--storage-port", "59011"]);
    assert.equal(studio.seed, true);
    assert.equal(studio.studioSeed, true);
    assert.equal(studio.storagePort, 59011);
  });

  it("잘못된 포트·포트 충돌·잘못된 백엔드·알 수 없는 인자를 거부한다", () => {
    assert.throws(() => parseLocalTestStackArgs(["--api-port", "0"]), /포트/);
    assert.throws(() => parseLocalTestStackArgs(["--web-port=99999"]), /포트/);
    assert.throws(() => parseLocalTestStackArgs(["--db-port", "abc"]), /포트/);
    assert.throws(() => parseLocalTestStackArgs(["--storage-port", "0"]), /포트/);
    assert.throws(() => parseLocalTestStackArgs(["--api-port=5173", "--web-port=5173"]), /포트 충돌/);
    assert.throws(() => parseLocalTestStackArgs(["--db-port=4001", "--api-port=4001"]), /포트 충돌/);
    assert.throws(() => parseLocalTestStackArgs(["--storage-port=4001", "--api-port=4001"]), /포트 충돌/);
    assert.throws(() => parseLocalTestStackArgs(["--db-backend=invalid"]), /auto, local, docker/);
    assert.throws(() => parseLocalTestStackArgs(["--unknown-flag"]), /알 수 없는 인자/);
  });
});

describe("local-test-stack url and safety guards", () => {
  it("헬스/준비성/스토리지 URL과 로컬 스토리지 API 환경을 조립한다", () => {
    assert.equal(apiHealthUrl(4001), "http://127.0.0.1:4001/api/health/live");
    assert.equal(apiReadyUrl(4001), "http://127.0.0.1:4001/api/health/ready");
    assert.equal(webHealthUrl(5173), "http://127.0.0.1:5173/");
    assert.equal(storageHealthUrl(59000), "http://127.0.0.1:59000/health");

    const apiEnv = buildDisposableApiEnv({
      environment: { PATH: "/usr/bin", R2_OBJECT_STORAGE_SECRET_ACCESS_KEY: "must-not-leak" },
      databaseUrl: disposableRuntimeDatabaseUrl(55439),
      apiPort: 4019,
      webPort: 5189,
      storageEndpoint: "http://127.0.0.1:59019",
      postgresBinDir: null,
    });
    assert.equal(apiEnv.LOCAL_OBJECT_STORAGE_ENDPOINT, "http://127.0.0.1:59019");
    assert.equal(apiEnv.R2_OBJECT_STORAGE_SECRET_ACCESS_KEY, undefined);
  });

  it("DB URL에서 자격증명을 마스킹한다", () => {
    // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- synthetic loopback fixture: this test exists to prove credentials are redacted, so it must carry a credentialed URL
    const redacted = redactDatabaseUrl("postgresql://pguser:s3cret@127.0.0.1:55432/postgres?sslmode=require");
    assert.ok(!redacted.includes("s3cret"), redacted);
    assert.ok(!redacted.includes("pguser"), redacted);
    assert.ok(redacted.includes("127.0.0.1:55432"), redacted);
    assert.equal(redactDatabaseUrl("not-a-url"), "(unparseable-url)");
  });

  it("원격 DB와 호스트 우회 쿼리를 fail-closed로 구분한다", () => {
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1:55432/db"), false);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@localhost/db"), false);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@[::1]:55432/db"), false);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@ep-xxx.neon.tech/db"), true);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@db.onpod.ai:5432/prod"), true);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1.evil.invalid:5432/db"), true);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1:55432/db?host=ep-xxx.neon.tech"), true);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1:55432/db?hostaddr=10.0.0.1"), true);
    assert.equal(isRemoteDatabaseUrl("http://127.0.0.1:55432/db"), true);
    assert.equal(isRemoteDatabaseUrl("not-a-url"), true);
  });

  it("--seed 안전 가드는 로컬 일회용 DB만 허용하고 원격·외부 DATABASE_URL을 차단한다", () => {
    assert.doesNotThrow(() =>
      assertDisposableSeedAllowed({
        databaseUrl: disposableDatabaseUrl(55439),
        managedDisposable: true,
        environmentDatabaseUrl: "",
      }),
    );

    assert.throws(
      () =>
        assertDisposableSeedAllowed({
          databaseUrl: disposableDatabaseUrl(55432),
          managedDisposable: false,
          environmentDatabaseUrl: "postgresql://u:p@ep-xxx.neon.tech/prod",
        }),
      /원격 DATABASE_URL/,
    );

    assert.throws(
      () =>
        assertDisposableSeedAllowed({
          databaseUrl: disposableDatabaseUrl(55432),
          managedDisposable: false,
          environmentDatabaseUrl: "postgresql://u:p@127.0.0.1:5432/custom",
        }),
      /외부 DATABASE_URL/,
    );

    assert.throws(
      () =>
        assertDisposableSeedAllowed({
          databaseUrl: "postgresql://u:p@db.onpod.ai:5432/prod",
          managedDisposable: true,
          environmentDatabaseUrl: "",
        }),
      /loopback/,
    );

    assert.throws(
      () =>
        assertDisposableSeedAllowed({
          databaseUrl: disposableDatabaseUrl(55432),
          managedDisposable: false,
          environmentDatabaseUrl: "",
        }),
      /로컬 일회용 DB/,
    );
  });

  it("disposable DB와 분리 런타임 역할 URL·경로가 포트별로 격리된다", () => {
    assert.equal(LOCAL_TEST_DB_CONTAINER, "toonstudio-local-test-db");
    assert.ok(LOCAL_TEST_RUNTIME_PASSWORD.length >= 24, "런타임 비밀번호는 부트스트랩 최소 24자 기준을 충족해야 한다");

    const defaultUrl = disposableDatabaseUrl();
    const customUrl = disposableDatabaseUrl(55439);
    const runtimeUrl = disposableRuntimeDatabaseUrl(55439);

    assert.ok(defaultUrl.includes("127.0.0.1:55432"), defaultUrl);
    assert.ok(customUrl.includes("127.0.0.1:55439"), customUrl);
    assert.ok(runtimeUrl.includes("toonstudio_runtime:"), runtimeUrl);
    assert.ok(runtimeUrl.includes("127.0.0.1:55439"), runtimeUrl);
    assert.equal(isRemoteDatabaseUrl(defaultUrl), false);
    assert.equal(isRemoteDatabaseUrl(runtimeUrl), false);

    assert.ok(localClusterDir().endsWith("toonstudio-local-test-pg"));
    assert.ok(localClusterDir(55439).endsWith("toonstudio-local-test-pg-55439"));
    assert.equal(dockerContainerName(), "toonstudio-local-test-db");
    assert.equal(dockerContainerName(55439), "toonstudio-local-test-db-55439");
  });
});

describe("local-test-stack postgres discovery and env isolation", () => {
  it("PATH가 비어 있어도 Homebrew postgresql@17 경로를 자동 탐지한다", () => {
    const existing = new Set([
      "/opt/homebrew/opt/postgresql@17/bin/initdb",
      "/opt/homebrew/opt/postgresql@17/bin/pg_ctl",
      "/opt/homebrew/opt/postgresql@17/bin/psql",
    ]);
    const dir = resolvePostgresBinaryDir({
      env: { PATH: "" },
      exists: (target) => existing.has(target),
    });
    assert.equal(dir, "/opt/homebrew/opt/postgresql@17/bin");
    assert.equal(
      resolvePostgresBinary("psql", { postgresBinDir: dir }),
      "/opt/homebrew/opt/postgresql@17/bin/psql",
    );
  });

  it("일부 바이너리만 있는 디렉터리는 건너뛰고 완전한 Postgres 디렉터리를 선택한다", () => {
    const existing = new Set([
      "/opt/homebrew/opt/postgresql@17/bin/psql",
      "/opt/homebrew/bin/initdb",
      "/opt/homebrew/bin/pg_ctl",
      "/opt/homebrew/bin/psql",
    ]);
    const dir = resolvePostgresBinaryDir({
      env: { PATH: "/usr/bin" },
      exists: (target) => existing.has(target),
    });
    assert.equal(dir, "/opt/homebrew/bin");
  });

  it("POSTGRES_BIN_DIR을 최우선으로 사용하고 바이너리가 없으면 null을 반환한다", () => {
    const customExisting = new Set([
      "/custom/pg/bin/initdb",
      "/custom/pg/bin/pg_ctl",
      "/custom/pg/bin/psql",
    ]);
    assert.equal(
      resolvePostgresBinaryDir({
        env: { POSTGRES_BIN_DIR: "/custom/pg/bin", PATH: "" },
        exists: (target) => customExisting.has(target),
      }),
      "/custom/pg/bin",
    );
    assert.equal(
      resolvePostgresBinaryDir({
        env: { PATH: "/usr/bin" },
        exists: () => false,
      }),
      null,
    );
  });

  it("buildPostgresPathEnv는 중복 없이 PostgreSQL 경로를 PATH 선두에 둔다", () => {
    const updated = buildPostgresPathEnv(
      { PATH: "/usr/bin:/opt/homebrew/opt/postgresql@17/bin:/bin" },
      "/opt/homebrew/opt/postgresql@17/bin",
    );
    assert.equal(updated.PATH, "/opt/homebrew/opt/postgresql@17/bin:/usr/bin:/bin");
  });

  it("buildIsolatedLocalEnv는 운영 비밀값과 외부 DB 변수를 제거한다", () => {
    const isolated = buildIsolatedLocalEnv(
      {
        PATH: "/usr/bin",
        HOME: "/Users/example",
        DATABASE_URL: "postgresql://prod:secret@db.onpod.ai:5432/prod",
        ONPOD_TOKEN: "should-not-leak",
        OPENAI_API_KEY: "should-not-leak",
        CLOUDFLARE_EDGE_ORIGIN_SECRET: "should-not-leak",
      },
      {
        API_LOCAL_ENV_FILE_ENABLED: "false",
        NEST_API_PORT: "4019",
      },
      { postgresBinDir: "/opt/homebrew/opt/postgresql@17/bin" },
    );
    assert.equal(isolated.HOME, "/Users/example");
    assert.equal(isolated.API_LOCAL_ENV_FILE_ENABLED, "false");
    assert.equal(isolated.NEST_API_PORT, "4019");
    assert.ok(isolated.PATH.startsWith("/opt/homebrew/opt/postgresql@17/bin"));
    assert.equal(isolated.DATABASE_URL, undefined);
    assert.equal(isolated.ONPOD_TOKEN, undefined);
    assert.equal(isolated.OPENAI_API_KEY, undefined);
    assert.equal(isolated.CLOUDFLARE_EDGE_ORIGIN_SECRET, undefined);
  });

  it("점유 중인 TCP 포트를 감지하고 다음 빈 포트를 선택한다", async () => {
    const blocker = createServer();
    await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    const busyPort = typeof address === "object" && address ? address.port : 0;
    try {
      assert.equal(await isTcpPortFree(busyPort), false);
      const freePort = await findAvailablePort(busyPort, { maxAttempts: 20 });
      assert.notEqual(freePort, busyPort);
      assert.equal(await isTcpPortFree(freePort), true);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
    assert.equal(await isTcpPortFree(busyPort), true);
  });
});
