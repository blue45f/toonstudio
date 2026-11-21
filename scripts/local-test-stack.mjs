#!/usr/bin/env node

/**
 * 로컬 테스트 스택 실행기 (`pnpm local:test`, `pnpm local:test:seed`, `pnpm local:test:check`).
 *
 * 안전 규칙 (FAIL-CLOSED):
 * - `.env` / `.env.infrastructure.local` 파일을 절대 수정·출력·커밋하지 않는다.
 * - 원격 DATABASE_URL(Neon/onpod/Supabase 등)에는 db:push/bootstrap/seed/reset을 절대 실행하지 않는다.
 * - `--seed`는 이 스크립트가 직접 생성·관리하는 로컬 일회용 DB(127.0.0.1)에서만 허용한다.
 * - disposable DB의 자식 프로세스에는 허용 목록 기반의 격리된 로컬 환경만 전달한다.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export const LOCAL_TEST_DEFAULT_API_PORT = 4001;
export const LOCAL_TEST_DEFAULT_WEB_PORT = 5173;
export const LOCAL_TEST_DB_CONTAINER = "toonstudio-local-test-db";
export const LOCAL_TEST_DB_PORT = 55432;
export const LOCAL_TEST_DB_PASSWORD = "toonstudio-local-test";
export const LOCAL_TEST_RUNTIME_PASSWORD = "toonstudio-local-test-runtime-role";
export const LOCAL_TEST_POSTGRES_IMAGE = "postgres:16-alpine";
export const LOCAL_TEST_PG_CLUSTER_DIRNAME = "toonstudio-local-test-pg";
export const LOCAL_TEST_RUNTIME_ROLE = "toonstudio_runtime";
export const LOCAL_TEST_BOOTSTRAP_CONFIRMATION = "BOOTSTRAP-EMPTY-TOONSPECTRUM-DATABASE";

export const LOCAL_TEST_POSTGRES_CANDIDATE_DIRS = Object.freeze([
  "/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql@16/bin",
  "/opt/homebrew/opt/postgresql@18/bin", "/usr/local/opt/postgresql@17/bin",
  "/usr/local/opt/postgresql@16/bin", "/opt/homebrew/bin", "/usr/local/bin",
  "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin",
]);

const REQUIRED_POSTGRES_BINARIES = Object.freeze(["initdb", "pg_ctl", "psql"]);
const LIBPQ_HOST_OVERRIDE_PARAMS = new Set(["host", "hostaddr", "service"]);
const SAFE_HOST_ENV_KEYS = Object.freeze([
  "PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE",
  "TERM", "TZ", "NODE_OPTIONS", "COREPACK_HOME", "PNPM_HOME", "NVM_DIR",
  "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
]);

function parsePortValue(rawValue, flagLabel) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${flagLabel} 뒤에 1-65535 포트를 지정하세요.`);
  }
  return parsed;
}

function parseDbBackendValue(rawValue, flagLabel) {
  if (rawValue !== "auto" && rawValue !== "local" && rawValue !== "docker") {
    throw new Error(`${flagLabel} 값은 auto, local, docker 중 하나여야 합니다.`);
  }
  return rawValue;
}

export function parseLocalTestStackArgs(argv) {
  const options = {
    check: false, help: false, json: false, seed: false, seedOnly: false, resetDb: false,
    dbBackend: "auto", dbPort: LOCAL_TEST_DB_PORT, apiPort: LOCAL_TEST_DEFAULT_API_PORT, webPort: LOCAL_TEST_DEFAULT_WEB_PORT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--seed") options.seed = true;
    else if (arg === "--seed-only") { options.seed = true; options.seedOnly = true; }
    else if (arg === "--reset-db") options.resetDb = true;
    else if (arg === "--api-port") { options.apiPort = parsePortValue(argv[index + 1], "--api-port"); index += 1; }
    else if (arg === "--web-port") { options.webPort = parsePortValue(argv[index + 1], "--web-port"); index += 1; }
    else if (arg === "--db-port") { options.dbPort = parsePortValue(argv[index + 1], "--db-port"); index += 1; }
    else if (arg === "--db-backend") { options.dbBackend = parseDbBackendValue(argv[index + 1], "--db-backend"); index += 1; }
    else if (arg.startsWith("--api-port=")) options.apiPort = parsePortValue(arg.slice("--api-port=".length), "--api-port=");
    else if (arg.startsWith("--web-port=")) options.webPort = parsePortValue(arg.slice("--web-port=".length), "--web-port=");
    else if (arg.startsWith("--db-port=")) options.dbPort = parsePortValue(arg.slice("--db-port=".length), "--db-port=");
    else if (arg.startsWith("--db-backend=")) options.dbBackend = parseDbBackendValue(arg.slice("--db-backend=".length), "--db-backend=");
    else throw new Error(`알 수 없는 인자: ${arg} (--help 참조)`);
  }
  if (options.apiPort === options.webPort || options.apiPort === options.dbPort || options.webPort === options.dbPort) {
    throw new Error(`포트 충돌: --db-port(${options.dbPort}), --api-port(${options.apiPort}), --web-port(${options.webPort})는 서로 달라야 합니다.`);
  }
  return options;
}

/** 로그용 마스킹. 자격증명·쿼리를 지우고 호스트/DB명만 남긴다. */
export function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "***";
    parsed.password = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "(unparseable-url)";
  }
}

/** 원격(Neon/onpod/Supabase 등) URL이거나 호스트 우회 쿼리가 있으면 true. */
export function isRemoteDatabaseUrl(url) {
  try {
    const parsed = new URL(String(url ?? "").trim());
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") return true;
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") return true;
    for (const [key] of parsed.searchParams) {
      if (LIBPQ_HOST_OVERRIDE_PARAMS.has(key.toLowerCase())) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** `--seed`가 로컬 일회용 DB(127.0.0.1)만 대상으로 하는지 fail-closed 검증한다. */
export function assertDisposableSeedAllowed({ databaseUrl, managedDisposable, environmentDatabaseUrl = "" }) {
  const externalUrl = String(environmentDatabaseUrl ?? "").trim();
  if (externalUrl) {
    if (isRemoteDatabaseUrl(externalUrl)) {
      throw new Error(`원격 DATABASE_URL에는 --seed를 실행할 수 없습니다 (차단됨: ${redactDatabaseUrl(externalUrl)}).`);
    }
    throw new Error(
      `외부 DATABASE_URL(${redactDatabaseUrl(externalUrl)})이 설정되어 있어 --seed를 차단했습니다. `
      + "--seed는 이 스크립트가 직접 생성한 로컬 일회용 DB(127.0.0.1)에서만 실행할 수 있습니다.",
    );
  }
  if (!managedDisposable) {
    throw new Error("이 스크립트가 생성한 로컬 일회용 DB가 아니므로 --seed를 실행할 수 없습니다.");
  }
  if (!databaseUrl || isRemoteDatabaseUrl(databaseUrl)) {
    throw new Error(`로컬 loopback DB URL이 아니므로 --seed를 차단했습니다 (${redactDatabaseUrl(databaseUrl)}).`);
  }
}

/** Homebrew postgresql@17 및 PATH에서 initdb/pg_ctl/psql 바이너리 디렉터리를 자동 탐지한다. */
export function resolvePostgresBinaryDir({
  env = process.env,
  exists = existsSync,
  candidateDirs = LOCAL_TEST_POSTGRES_CANDIDATE_DIRS,
} = {}) {
  const searchDirs = [];
  const seen = new Set();
  const pushDir = (dir) => {
    const trimmed = typeof dir === "string" ? dir.trim() : "";
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    searchDirs.push(trimmed);
  };
  pushDir(env.POSTGRES_BIN_DIR);
  for (const dir of candidateDirs) pushDir(dir);
  for (const dir of String(env.PATH ?? "").split(delimiter)) pushDir(dir);
  for (const dir of searchDirs) {
    if (REQUIRED_POSTGRES_BINARIES.every((bin) => exists(join(dir, bin)))) return dir;
  }
  return null;
}

export function resolvePostgresBinary(binaryName, options = {}) {
  const binDir = options.postgresBinDir ?? resolvePostgresBinaryDir(options);
  return binDir ? join(binDir, binaryName) : binaryName;
}

export function buildPostgresPathEnv(baseEnv = process.env, postgresBinDir = resolvePostgresBinaryDir({ env: baseEnv })) {
  if (!postgresBinDir) return { ...baseEnv };
  const parts = String(baseEnv.PATH ?? "").split(delimiter).filter(Boolean);
  if (parts[0] === postgresBinDir) return { ...baseEnv };
  return { ...baseEnv, PATH: [postgresBinDir, ...parts.filter((entry) => entry !== postgresBinDir)].join(delimiter) };
}

/** 외부 클라우드·운영 비밀값 유입을 막기 위해 허용 목록 키만 추려 자식 프로세스 환경을 만든다. */
export function buildIsolatedLocalEnv(
  baseEnv = process.env,
  overrides = {},
  { postgresBinDir = resolvePostgresBinaryDir({ env: baseEnv }) } = {},
) {
  const isolated = {};
  for (const key of SAFE_HOST_ENV_KEYS) {
    if (baseEnv[key] !== undefined) isolated[key] = baseEnv[key];
  }
  return { ...buildPostgresPathEnv(isolated, postgresBinDir), ...overrides };
}

export function buildDisposableApiEnv({
  environment = process.env,
  databaseUrl,
  apiPort,
  webPort,
  runtimeRoleSeparated = true,
  postgresBinDir = resolvePostgresBinaryDir({ env: environment }),
  extra = {},
}) {
  return buildIsolatedLocalEnv(environment, {
    NODE_ENV: "development",
    API_LOCAL_ENV_FILE_ENABLED: "false",
    NEST_API_HOST: "127.0.0.1",
    NEST_API_PORT: String(apiPort),
    DATABASE_URL: databaseUrl,
    ...(runtimeRoleSeparated ? {} : { DATABASE_RUNTIME_ROLE_MODE: "single-owner" }),
    WEB_APP_BASE_URL: `http://127.0.0.1:${webPort}`,
    API_CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
    AUTH_RATE_LIMIT_MODE: "single-instance-local",
    AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
    STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
    AUTH_SESSION_SECRET: randomBytes(32).toString("hex"),
    AUTH_STATE_SECRET: randomBytes(32).toString("hex"),
    ...extra,
  }, { postgresBinDir });
}

export function apiHealthUrl(apiPort) { return `http://127.0.0.1:${apiPort}/api/health/live`; }
export function apiReadyUrl(apiPort) { return `http://127.0.0.1:${apiPort}/api/health/ready`; }
export function webHealthUrl(webPort) { return `http://127.0.0.1:${webPort}/`; }
export function disposableDatabaseUrl(dbPort = LOCAL_TEST_DB_PORT) {
  return `postgresql://postgres:${LOCAL_TEST_DB_PASSWORD}@127.0.0.1:${dbPort}/postgres`;
}
export function disposableRuntimeDatabaseUrl(dbPort = LOCAL_TEST_DB_PORT) {
  return `postgresql://${LOCAL_TEST_RUNTIME_ROLE}:${LOCAL_TEST_RUNTIME_PASSWORD}@127.0.0.1:${dbPort}/postgres`;
}
export function localClusterDir(dbPort = LOCAL_TEST_DB_PORT) {
  return join(tmpdir(), dbPort === LOCAL_TEST_DB_PORT ? LOCAL_TEST_PG_CLUSTER_DIRNAME : `${LOCAL_TEST_PG_CLUSTER_DIRNAME}-${dbPort}`);
}
export function dockerContainerName(dbPort = LOCAL_TEST_DB_PORT) {
  return dbPort === LOCAL_TEST_DB_PORT ? LOCAL_TEST_DB_CONTAINER : `${LOCAL_TEST_DB_CONTAINER}-${dbPort}`;
}

export function isTcpPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function findAvailablePort(preferredPort, { exclude = new Set(), maxAttempts = 50, host = "127.0.0.1" } = {}) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (candidate > 65535) break;
    if (!exclude.has(candidate) && await isTcpPortFree(candidate, host)) return candidate;
  }
  throw new Error(`사용 가능한 로컬 포트를 찾지 못했습니다 (시작 포트 ${preferredPort}).`);
}

export async function probeOk(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function runCapture(command, args, options = {}) {
  const { timeoutMs = 0, ...spawnOptions } = options;
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = timeoutMs > 0
      ? setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: String(error) });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) resolve({ ok: false, code, stdout, stderr: `${stderr}\n(timed out after ${timeoutMs}ms)` });
      else resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

export async function waitFor(_label, probe, { timeoutMs, intervalMs, onTimeout }) {
  const started = Date.now();
  for (;;) {
    if (await probe()) return true;
    if (Date.now() - started > timeoutMs) { onTimeout?.(); return false; }
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
}

export async function terminateChildProcess(child, { graceMs = 5000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const killGroup = (signal) => {
    if (typeof child.pid === "number" && child.pid > 0) {
      try { process.kill(-child.pid, signal); return; } catch { /* 폴백 */ }
    }
    try { child.kill(signal); } catch { /* 이미 종료 */ }
  };
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardKillTimer);
      clearTimeout(fallbackTimer);
      resolve();
    };
    child.once("close", finish);
    child.once("exit", finish);
    killGroup("SIGTERM");
    const hardKillTimer = setTimeout(() => killGroup("SIGKILL"), graceMs);
    hardKillTimer.unref();
    const fallbackTimer = setTimeout(finish, graceMs + 2000);
    fallbackTimer.unref();
  });
}

function streamPrefixed(child, label, outputStream = process.stdout) {
  const pump = (stream, target) => {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length > 0) target.write(`[${label}] ${line}\n`);
      }
    });
  };
  if (child.stdout) pump(child.stdout, outputStream);
  if (child.stderr) pump(child.stderr, process.stderr);
}

async function dockerAvailable() {
  return (await runCapture("docker", ["info", "--format", "{{.ServerVersion}}"], { timeoutMs: 5_000 })).ok;
}

export async function stopLocalPostgresCluster({
  clusterDir,
  postgresBinDir = resolvePostgresBinaryDir(),
  removeDir = false,
}) {
  if (!clusterDir || !existsSync(clusterDir)) return { stopped: true, removed: false };
  const pgCtlBin = resolvePostgresBinary("pg_ctl", { postgresBinDir });
  const env = buildIsolatedLocalEnv(process.env, { LC_ALL: "C", LANG: "C" }, { postgresBinDir });
  if (existsSync(join(clusterDir, "postmaster.pid"))) {
    const fastStop = await runCapture(pgCtlBin, ["-D", clusterDir, "stop", "-m", "fast", "-w", "-t", "30"], { env, timeoutMs: 35_000 });
    if (!fastStop.ok) {
      await runCapture(pgCtlBin, ["-D", clusterDir, "stop", "-m", "immediate", "-w", "-t", "15"], { env, timeoutMs: 20_000 });
    }
  }
  if (removeDir) rmSync(clusterDir, { recursive: true, force: true });
  return { stopped: true, removed: removeDir && !existsSync(clusterDir) };
}

export async function startLocalPostgresCluster({
  clusterDir,
  dbPort = LOCAL_TEST_DB_PORT,
  resetDb = false,
  postgresBinDir = resolvePostgresBinaryDir(),
  log = (msg) => process.stdout.write(`${msg}\n`),
  ephemeral = false,
}) {
  if (!postgresBinDir) {
    throw new Error(
      "로컬 PostgreSQL 바이너리(initdb/pg_ctl/psql)를 찾을 수 없습니다. "
      + "macOS에서는 `brew install postgresql@17` 또는 `POSTGRES_BIN_DIR=/opt/homebrew/opt/postgresql@17/bin`을 확인하세요.",
    );
  }
  const initdbBin = resolvePostgresBinary("initdb", { postgresBinDir });
  const pgCtlBin = resolvePostgresBinary("pg_ctl", { postgresBinDir });
  const psqlBin = resolvePostgresBinary("psql", { postgresBinDir });
  // macOS Homebrew PostgreSQL 17의 CoreFoundation 로케일 멀티스레드 오류 방지를 위해 C 로케일로 고정한다.
  const pgEnv = buildIsolatedLocalEnv(process.env, { LC_ALL: "C", LANG: "C" }, { postgresBinDir });
  const versionFile = join(clusterDir, "PG_VERSION");
  const pidFile = join(clusterDir, "postmaster.pid");
  const logFile = join(clusterDir, "local-test-stack.log");

  if (resetDb && existsSync(clusterDir)) {
    log("[db] --reset-db: 기존 로컬 클러스터 제거 중…");
    await stopLocalPostgresCluster({ clusterDir, postgresBinDir, removeDir: true });
  }
  const initialized = existsSync(versionFile);
  if (!initialized) {
    if (existsSync(clusterDir) && !ephemeral) {
      throw new Error(`로컬 클러스터 경로가 이미 있지만 초기화가 안 됐습니다: ${clusterDir} (--reset-db로 재생성 가능)`);
    }
    if (!(await isTcpPortFree(dbPort))) {
      throw new Error(`로컬 DB 포트 ${dbPort}가 이미 사용 중입니다. --db-port로 다른 포트를 지정하세요.`);
    }
    log(`[db] disposable 로컬 postgres 클러스터 초기화 중 (${clusterDir}, ${postgresBinDir})…`);
    const created = await runCapture(
      initdbBin,
      ["-D", clusterDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C", "--no-sync"],
      { env: pgEnv, timeoutMs: 120_000 },
    );
    if (!created.ok) throw new Error(`로컬 postgres 초기화 실패:\n${created.stderr.slice(0, 1000)}`);
  }

  const running = existsSync(pidFile)
    && (await runCapture(pgCtlBin, ["-D", clusterDir, "status"], { env: pgEnv, timeoutMs: 10_000 })).ok;
  if (!running) {
    if (!(await isTcpPortFree(dbPort))) {
      throw new Error(`로컬 DB 포트 ${dbPort}가 이미 사용 중입니다. --db-port로 다른 포트를 지정하세요.`);
    }
    const pgOptions = [
      `-h 127.0.0.1 -p ${dbPort} -k ${clusterDir}`,
      "-c listen_addresses=127.0.0.1",
      ...(ephemeral ? ["-c fsync=off -c synchronous_commit=off -c full_page_writes=off"] : []),
    ].join(" ");
    const started = await runCapture(
      pgCtlBin,
      ["-D", clusterDir, "-o", pgOptions, "-l", logFile, "-w", "-t", "60", "start"],
      { env: pgEnv, timeoutMs: 90_000 },
    );
    if (!started.ok) {
      const logTail = existsSync(logFile) ? `\n[pg.log]\n${readFileSync(logFile, "utf8").slice(-1000)}` : "";
      throw new Error(`로컬 postgres 시작 실패 (포트 ${dbPort}):\n${started.stderr.slice(0, 1000)}${logTail}`);
    }
  } else {
    log("[db] 기존 로컬 클러스터 재사용 중…");
  }

  if (!initialized) {
    const secured = await runCapture(
      psqlBin,
      [`postgresql://postgres@127.0.0.1:${dbPort}/postgres`, "-c", `ALTER ROLE postgres PASSWORD '${LOCAL_TEST_DB_PASSWORD}'`],
      { env: pgEnv, timeoutMs: 30_000 },
    );
    if (!secured.ok) throw new Error(`로컬 클러스터 비밀번호 설정 실패:\n${secured.stderr.slice(0, 500)}`);
  }

  return {
    databaseUrl: disposableDatabaseUrl(dbPort), runtimeDatabaseUrl: disposableRuntimeDatabaseUrl(dbPort),
    fresh: !initialized, reused: initialized, backend: "local-cluster", detail: clusterDir, dbPort, postgresBinDir,
  };
}

async function ensureDockerPostgres({ resetDb, dbPort, log }) {
  const container = dockerContainerName(dbPort);
  const status = (await runCapture("docker", ["ps", "-a", "--filter", `name=^${container}$`, "--format", "{{.Status}}"], { timeoutMs: 10_000 })).stdout.trim();
  if (resetDb && status) {
    log("[db] --reset-db: 기존 컨테이너 제거 중…");
    await runCapture("docker", ["rm", "-f", container], { timeoutMs: 30_000 });
  }
  const waitPgReady = (timeoutMs) =>
    waitFor("db", async () => (await runCapture("docker", ["exec", container, "pg_isready", "-U", "postgres"], { timeoutMs: 5_000 })).ok, { timeoutMs, intervalMs: 2000 });
  const result = (fresh) => ({
    databaseUrl: disposableDatabaseUrl(dbPort),
    runtimeDatabaseUrl: disposableRuntimeDatabaseUrl(dbPort),
    fresh, reused: !fresh, backend: "docker", detail: container, dbPort, postgresBinDir: resolvePostgresBinaryDir(),
  });
  if (resetDb || !status) {
    if (!(await isTcpPortFree(dbPort))) throw new Error(`로컬 DB 포트 ${dbPort}가 이미 사용 중입니다. --db-port로 다른 포트를 지정하세요.`);
    log(`[db] disposable postgres 생성 중 (${LOCAL_TEST_POSTGRES_IMAGE}, 포트 ${dbPort})…`);
    const created = await runCapture("docker", [
      "run", "-d", "--name", container, "-p", `127.0.0.1:${dbPort}:5432`,
      "-e", `POSTGRES_PASSWORD=${LOCAL_TEST_DB_PASSWORD}`, "-e", "POSTGRES_DB=postgres",
      "--label", "toonstudio.local-test-stack=true", LOCAL_TEST_POSTGRES_IMAGE,
    ], { timeoutMs: 120_000 });
    if (!created.ok) throw new Error(`disposable postgres 생성 실패:\n${created.stderr.slice(0, 1000)}`);
    if (!(await waitPgReady(120_000))) throw new Error("disposable postgres가 120초 안에 준비되지 않았습니다.");
    return result(true);
  }
  if (!status.startsWith("Up")) {
    log("[db] 기존 컨테이너 시작 중…");
    await runCapture("docker", ["start", container], { timeoutMs: 30_000 });
    if (!(await waitPgReady(60_000))) throw new Error("기존 postgres 컨테이너가 60초 안에 준비되지 않았습니다.");
  }
  return result(false);
}

async function ensureDisposablePostgres({ resetDb, dbPort, dbBackend, log }) {
  const postgresBinDir = resolvePostgresBinaryDir();
  if (dbBackend === "local") {
    return startLocalPostgresCluster({ clusterDir: localClusterDir(dbPort), dbPort, resetDb, postgresBinDir, log });
  }
  if (dbBackend === "docker") {
    if (!(await dockerAvailable())) throw new Error("--db-backend=docker가 지정됐지만 Docker 데몬에 연결할 수 없습니다.");
    return ensureDockerPostgres({ resetDb, dbPort, log });
  }
  if (await dockerAvailable()) return ensureDockerPostgres({ resetDb, dbPort, log });
  if (postgresBinDir) {
    log(`[db] Docker 미사용 — 로컬 PostgreSQL(${postgresBinDir}) 클러스터로 진행합니다.`);
    return startLocalPostgresCluster({ clusterDir: localClusterDir(dbPort), dbPort, resetDb, postgresBinDir, log });
  }
  throw new Error(
    "DATABASE_URL이 없고 Docker·로컬 PostgreSQL도 사용할 수 없습니다.\n"
    + "  1) macOS Homebrew: `brew install postgresql@17` (Docker 없이 로컬 클러스터 자동 생성)\n"
    + "  2) Docker 실행 후 재시도\n"
    + "  3) DATABASE_URL=postgresql://… pnpm local:test (사용자 DB 사용, 스키마·시드 미변경)",
  );
}

export async function bootstrapFreshDatabase(
  databaseUrl,
  { runtimePassword = LOCAL_TEST_RUNTIME_PASSWORD, postgresBinDir = resolvePostgresBinaryDir(), log = (msg) => process.stdout.write(`${msg}\n`) } = {},
) {
  if (isRemoteDatabaseUrl(databaseUrl)) throw new Error(`원격 DB URL에는 부트스트랩을 실행할 수 없습니다 (${redactDatabaseUrl(databaseUrl)}).`);
  const sha = (await runCapture("git", ["rev-parse", "HEAD"], { timeoutMs: 10_000 })).stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("HEAD SHA를 확인하지 못해 disposable DB 부트스트랩을 중단합니다.");
  log("[db] 새로 만든 disposable DB에 스키마+마이그레이션+런타임 역할 ACL 적용 중…");
  const bootstrapped = await runCapture("pnpm", [
    "db:bootstrap:production-empty", "--", "--execute", "--allow-loopback",
    "--runtime-database-role", LOCAL_TEST_RUNTIME_ROLE, "--release-sha", sha, "--confirmation", LOCAL_TEST_BOOTSTRAP_CONFIRMATION,
  ], {
    env: buildIsolatedLocalEnv(process.env, { CI: "1", MIGRATION_DATABASE_URL: databaseUrl, BOOTSTRAP_RUNTIME_DATABASE_PASSWORD: runtimePassword }, { postgresBinDir }),
    cwd: process.cwd(),
    timeoutMs: 600_000,
  });
  if (!bootstrapped.ok) throw new Error(`disposable DB 부트스트랩 실패 (--reset-db로 재생성 가능):\n${(bootstrapped.stdout + bootstrapped.stderr).slice(-1500)}`);
  return { sha };
}

const SEED_REVISION_BACKFILL_SQL = [
  'INSERT INTO public."creator_work_revision" ("workId", "revision", "snapshot", "createdAt")',
  'SELECT w."id", w."revision", jsonb_build_object(',
  "  'titleId', w.\"titleId\", 'title', w.\"title\", 'description', COALESCE(w.\"description\", ''),",
  "  'cover', COALESCE(w.\"cover\", ''), 'tags', COALESCE(w.\"tags\", '[]'::jsonb),",
  "  'format', COALESCE(w.\"format\", 'cuttoon'), 'pages', COALESCE(w.\"pages\", '[]'::jsonb),",
  "  'doc', COALESCE(w.\"doc\", '{}'::jsonb), 'status', COALESCE(w.\"status\", 'draft'),",
  "  'seriesId', w.\"seriesId\", 'episodeNo', w.\"episodeNo\",",
  "  'challengeId', w.\"challengeId\", 'remixFromId', w.\"remixFromId\"",
  '), COALESCE(w."updatedAt", w."createdAt", CURRENT_TIMESTAMP)',
  'FROM public."creator_work" AS w ON CONFLICT ("workId", "revision") DO NOTHING;',
].join("\n");

export async function seedDisposableDatabase(
  databaseUrl,
  { managedDisposable = false, environmentDatabaseUrl = "", postgresBinDir = resolvePostgresBinaryDir(), log = (msg) => process.stdout.write(`${msg}\n`) } = {},
) {
  assertDisposableSeedAllowed({ databaseUrl, managedDisposable, environmentDatabaseUrl });
  log(`[db] 로컬 disposable DB에 샘플 시드 주입 중 (${redactDatabaseUrl(databaseUrl)})…`);
  const seeded = await runCapture("pnpm", ["db:seed"], {
    env: buildIsolatedLocalEnv(process.env, { DATABASE_URL: databaseUrl, API_LOCAL_ENV_FILE_ENABLED: "false" }, { postgresBinDir }),
    cwd: process.cwd(),
    timeoutMs: 180_000,
  });
  if (!seeded.ok) throw new Error(`로컬 disposable DB 시드 실패:\n${(seeded.stdout + seeded.stderr).slice(-1500)}`);
  // seed.ts가 삽입한 creator_work 행에 대응하는 creator_work_revision 불변식을 멱등 보정한다.
  const psqlBin = resolvePostgresBinary("psql", { postgresBinDir });
  const backfill = await runCapture(
    psqlBin,
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", SEED_REVISION_BACKFILL_SQL],
    { env: buildIsolatedLocalEnv(process.env, { PSQLRC: "/dev/null" }, { postgresBinDir }), timeoutMs: 30_000 },
  );
  if (!backfill.ok) throw new Error(`시드 creator_work_revision 보정 실패:\n${backfill.stderr.slice(0, 1000)}`);
  return { ok: true, output: seeded.stdout.trim() };
}

async function prepareDisposableDatabase({ resetDb, dbPort, dbBackend, seed, envDatabaseUrl, log }) {
  const ensured = await ensureDisposablePostgres({ resetDb, dbPort, dbBackend, log });
  if (ensured.fresh) await bootstrapFreshDatabase(ensured.databaseUrl, { postgresBinDir: ensured.postgresBinDir, log });
  if (seed) {
    await seedDisposableDatabase(ensured.databaseUrl, {
      managedDisposable: true, environmentDatabaseUrl: envDatabaseUrl, postgresBinDir: ensured.postgresBinDir, log,
    });
  }
  return ensured;
}

async function canConnectWithPsql(databaseUrl, postgresBinDir) {
  const psqlBin = resolvePostgresBinary("psql", { postgresBinDir });
  const env = buildIsolatedLocalEnv(process.env, { PSQLRC: "/dev/null" }, { postgresBinDir });
  const result = await runCapture(psqlBin, [databaseUrl, "-Atq", "-c", "SELECT 1"], { env, timeoutMs: 10_000 });
  return result.ok && result.stdout.trim() === "1";
}

function printHelp() {
  process.stdout.write([
    "사용법: pnpm local:test [옵션]",
    "",
    "  로컬 PostgreSQL(Homebrew postgresql@17 자동 탐지 또는 Docker) + API(Nest) + Web(Vite) 스택을 기동한다.",
    "",
    "옵션:",
    "  --check                 기동 없이 스택 상태만 확인 (CI/게이트용, 미충족 시 exit 1)",
    "  --seed                  disposable 로컬 DB(127.0.0.1)에 스키마 적용 후 샘플 시드 1회 주입",
    "  --seed-only             disposable 로컬 DB 준비+시드만 수행하고 즉시 종료",
    "  --json                  상태 요약을 JSON으로 stdout에 출력 (진행 로그는 stderr)",
    "  --db-port N             disposable DB 포트 (기본 55432)",
    "  --api-port N            API 포트 (기본 4001)",
    "  --web-port N            Web 포트 (기본 5173)",
    "  --db-backend M          disposable DB 백엔드 (auto | local | docker, 기본 auto)",
    "  --reset-db              disposable DB 클러스터/컨테이너를 버리고 새로 만든다",
    "  --help, -h              이 도움말",
    "",
    "안전 규칙:",
    "  - DATABASE_URL이 지정되면 스키마·시드를 절대 건드리지 않으며 --seed는 즉시 차단한다.",
    "  - .env / .env.infrastructure.local 파일은 수정하거나 출력하지 않는다.",
    "",
  ].join("\n"));
}

async function printCheckReport({ apiPort, webPort, dbPort, json }) {
  const apiUrl = apiHealthUrl(apiPort);
  const readyUrl = apiReadyUrl(apiPort);
  const webUrl = webHealthUrl(webPort);
  const probe = async (url) => (await probeOk(url, 10_000)) || (await probeOk(url, 10_000));
  const [apiOk, readyOk, webOk] = await Promise.all([probe(apiUrl), probe(readyUrl), probe(webUrl)]);
  const localBinDir = resolvePostgresBinaryDir();
  const payload = {
    ok: apiOk && webOk,
    ports: { db: dbPort, api: apiPort, web: webPort },
    urls: { apiHealth: apiUrl, apiReady: readyUrl, web: webUrl, canvas: `http://127.0.0.1:${webPort}/studio/canvas` },
    checks: { apiLive: apiOk, apiReady: readyOk, web: webOk },
    postgres: { localBinDir, available: Boolean(localBinDir) },
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload.ok;
  }
  const lines = [
    "로컬 테스트 스택 상태:",
    `  API  ${apiUrl} → ${apiOk ? "정상" : "미기동"} (ready=${readyOk ? "정상" : "미준비"})`,
    `  Web  ${webUrl} → ${webOk ? "정상" : "미기동"}`,
    `  PG   ${localBinDir ?? "(미탐지)"} (port=${dbPort})`,
    ...(apiOk && webOk ? [`  Canvas http://127.0.0.1:${webPort}/studio/canvas`] : []),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return payload.ok;
}

async function main(argv, environment = process.env) {
  const options = parseLocalTestStackArgs(argv);
  if (options.help) { printHelp(); return 0; }
  if (options.check) return (await printCheckReport(options)) ? 0 : 1;

  const log = (message) => (options.json ? process.stderr : process.stdout).write(`${message}\n`);
  const envDatabaseUrl = environment.DATABASE_URL?.trim() || "";
  if (options.seed && envDatabaseUrl) {
    assertDisposableSeedAllowed({ databaseUrl: envDatabaseUrl, managedDisposable: false, environmentDatabaseUrl: envDatabaseUrl });
  }

  if (options.seedOnly) {
    const ensured = await prepareDisposableDatabase({ ...options, envDatabaseUrl, log });
    const summary = {
      ok: true,
      mode: "seed-only",
      db: { backend: ensured.backend, port: ensured.dbPort, fresh: ensured.fresh, reused: ensured.reused, url: redactDatabaseUrl(ensured.databaseUrl), seeded: true },
    };
    if (options.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    else log(`[db] 로컬 disposable DB 시드 완료 (${summary.db.url}, 포트 ${ensured.dbPort})`);
    return 0;
  }

  const children = [];
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    log(`\n[stack] ${signal} 수신 — 자식 프로세스 종료 중…`);
    for (const child of children) void terminateChildProcess(child, { graceMs: 4000 });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  const trackChild = (child, label) => {
    children.push(child);
    child.on("close", (code) => {
      if (!stopping && code !== 0 && code !== null) {
        process.stderr.write(`[stack] ${label} 프로세스가 종료됨 (code ${code}) — 스택을 중단합니다.\n`);
        shutdown(`${label}_EXIT`);
        process.exit(1);
      }
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const started = [];
  const reused = [];
  let dbSummary = null;
  const apiUrl = apiHealthUrl(options.apiPort);

  if (await probeOk(apiUrl)) {
    reused.push(`API :${options.apiPort}`);
    if (options.seed) {
      const ensured = await prepareDisposableDatabase({ ...options, envDatabaseUrl, log });
      dbSummary = { backend: ensured.backend, port: ensured.dbPort, url: redactDatabaseUrl(ensured.databaseUrl), seeded: true };
    }
  } else {
    if (!(await isTcpPortFree(options.apiPort))) {
      throw new Error(`API 포트 ${options.apiPort}가 이미 다른 프로세스에 의해 점유되었습니다. --api-port로 다른 포트를 지정하세요.`);
    }
    let apiEnv;
    if (envDatabaseUrl) {
      log(`[db] 사용자 DATABASE_URL 사용 (${redactDatabaseUrl(envDatabaseUrl)}, 스키마 미변경${isRemoteDatabaseUrl(envDatabaseUrl) ? " — 원격 DB이므로 seed/push 금지" : ""})`);
      dbSummary = { backend: "external", port: null, url: redactDatabaseUrl(envDatabaseUrl), seeded: false };
      apiEnv = {
        ...environment,
        DATABASE_URL: envDatabaseUrl,
        NEST_API_PORT: String(options.apiPort),
        API_CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${options.webPort},http://localhost:${options.webPort}`,
      };
    } else {
      const ensured = await prepareDisposableDatabase({ ...options, envDatabaseUrl, log });
      const runtimeRoleOk = await canConnectWithPsql(ensured.runtimeDatabaseUrl, ensured.postgresBinDir);
      const effectiveApiDbUrl = runtimeRoleOk ? ensured.runtimeDatabaseUrl : ensured.databaseUrl;
      const backendLabel = ensured.backend === "docker" ? "docker postgres" : "로컬 postgres 클러스터";
      log(`[db] ${ensured.fresh ? `disposable ${backendLabel} 신규 생성+스키마 적용` : "기존 disposable DB 재사용"} (${redactDatabaseUrl(effectiveApiDbUrl)}${options.seed ? ", 시드 완료" : ""})`);
      dbSummary = {
        backend: ensured.backend, port: ensured.dbPort, fresh: ensured.fresh, reused: ensured.reused,
        url: redactDatabaseUrl(effectiveApiDbUrl), runtimeRoleSeparated: runtimeRoleOk, seeded: options.seed,
      };
      apiEnv = buildDisposableApiEnv({
        environment,
        databaseUrl: effectiveApiDbUrl,
        apiPort: options.apiPort,
        webPort: options.webPort,
        runtimeRoleSeparated: runtimeRoleOk,
        postgresBinDir: ensured.postgresBinDir,
      });
    }
    log(`[api] Nest API 기동 중 (포트 ${options.apiPort})…`);
    const api = spawn("pnpm", ["--filter", "@webtoon-nest/api", "dev"], {
      env: apiEnv, cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    trackChild(api, "api");
    streamPrefixed(api, "api", options.json ? process.stderr : process.stdout);
    if (!(await waitFor("api", () => probeOk(apiUrl), { timeoutMs: 240_000, intervalMs: 2500 }))) {
      shutdown("API_TIMEOUT");
      throw new Error(`API가 240초 안에 준비되지 않았습니다 (${apiUrl}).`);
    }
    started.push(`API :${options.apiPort}`);
  }

  const webUrl = webHealthUrl(options.webPort);
  if (await probeOk(webUrl)) {
    reused.push(`Web :${options.webPort}`);
  } else {
    if (!(await isTcpPortFree(options.webPort))) {
      shutdown("WEB_PORT_CONFLICT");
      throw new Error(`Web 포트 ${options.webPort}가 이미 다른 프로세스에 의해 점유되었습니다. --web-port로 다른 포트를 지정하세요.`);
    }
    log(`[web] Vite 기동 중 (포트 ${options.webPort})…`);
    const web = spawn("pnpm", ["dev", "--port", String(options.webPort)], {
      env: { ...environment, NEST_API_URL: `http://127.0.0.1:${options.apiPort}` },
      cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    trackChild(web, "web");
    streamPrefixed(web, "web", options.json ? process.stderr : process.stdout);
    if (!(await waitFor("web", () => probeOk(webUrl), { timeoutMs: 300_000, intervalMs: 2500 }))) {
      shutdown("WEB_TIMEOUT");
      throw new Error(`Web이 300초 안에 준비되지 않았습니다 (${webUrl}).`);
    }
    started.push(`Web :${options.webPort}`);
  }

  const readySummary = {
    ok: true, started, reused,
    ports: { db: options.dbPort, api: options.apiPort, web: options.webPort },
    urls: { apiHealth: apiUrl, apiReady: apiReadyUrl(options.apiPort), web: webUrl, canvas: `http://127.0.0.1:${options.webPort}/studio/canvas` },
    db: dbSummary,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(readySummary, null, 2)}\n`);
  } else {
    process.stdout.write([
      "", "로컬 테스트 스택 준비 완료:",
      `  시작: ${started.length > 0 ? started.join(", ") : "(없음, 전부 재사용)"}`,
      `  재사용: ${reused.length > 0 ? reused.join(", ") : "(없음)"}`,
      `  API   ${readySummary.urls.apiHealth}`, `  Ready ${readySummary.urls.apiReady}`,
      `  Web   ${readySummary.urls.web}`, `  Canvas ${readySummary.urls.canvas}`,
      "  종료: Ctrl+C (disposable DB는 유지되어 다음 실행에 재사용, 초기화: --reset-db)", "",
    ].join("\n"));
  }
  await new Promise(() => undefined);
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => { process.stderr.write(`[stack] 실패: ${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); },
  );
}
