/**
 * 임베디드 PostgreSQL(npm `embedded-postgres` 패키지의 바이너리) 설치·기동·중지.
 *
 * - 바이너리와 데이터 디렉터리는 모두 스택 디렉터리 아래에만 둔다(저장소 package.json/lockfile 은 건드리지 않는다).
 * - 127.0.0.1 에서만 listen 하고 unix 소켓은 만들지 않는다. 인증은 scram-sha-256.
 * - 일회용 로컬 DB 이므로 fsync=off 로 속도를 우선한다(비정상 종료 시 데이터가 깨질 수 있으며 reset 으로 다시 만든다).
 * - root 로 실행하면 PostgreSQL 이 거부하므로, 그 경우에만 `unshare -U`(사용자 네임스페이스)로 비root uid 에 매핑한다.
 */

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { assertLocalPostgresUrl, buildChildEnv, redactSecrets } from "./guard.mjs";
import { isProcessAlive, processMatches, spawnDetached, terminateProcess, waitFor } from "./processes.mjs";

const PLATFORM_PACKAGES = Object.freeze({
  "linux:x64": "linux-x64",
  "linux:arm64": "linux-arm64",
  "linux:arm": "linux-arm",
  "linux:ia32": "linux-ia32",
  "linux:ppc64": "linux-ppc64",
  "darwin:arm64": "darwin-arm64",
  "darwin:x64": "darwin-x64",
});

const DATABASE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;

export function embeddedPostgresPackageSuffix({ platform = process.platform, arch = process.arch } = {}) {
  return PLATFORM_PACKAGES[`${platform}:${arch}`] ?? null;
}

export function resolveBinaries(paths, { platform = process.platform, arch = process.arch } = {}) {
  const suffix = embeddedPostgresPackageSuffix({ platform, arch });
  if (!suffix) {
    throw new Error(
      `이 플랫폼(${platform}/${arch})은 embedded-postgres 바이너리 패키지가 없어 지원하지 않습니다. Linux x64 에서만 검증했습니다.`,
    );
  }
  const directory = join(paths.tools, "node_modules", "@embedded-postgres", suffix, "native", "bin");
  return Object.freeze({
    directory,
    initdb: join(directory, "initdb"),
    postgres: join(directory, "postgres"),
  });
}

export function installedEmbeddedVersion(paths) {
  try {
    const manifest = JSON.parse(
      readFileSync(join(paths.tools, "node_modules", "embedded-postgres", "package.json"), "utf8"),
    );
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

/**
 * embedded-postgres 를 스택 디렉터리의 tools/ 에 설치한다(이미 같은 버전이 있으면 건너뜀).
 * postinstall(심볼릭 링크 복원)이 필요하므로 --ignore-scripts 를 쓰지 않는다.
 * @returns {{ installed: boolean, binaries: ReturnType<typeof resolveBinaries> }}
 */
export function ensureEmbeddedPostgres({ paths, version, runCommand = spawnSync, platform, arch }) {
  const binaries = resolveBinaries(paths, { platform, arch });
  if (existsSync(binaries.postgres) && installedEmbeddedVersion(paths) === version) {
    return { installed: false, binaries };
  }
  mkdirSync(paths.tools, { recursive: true, mode: 0o700 });
  const manifestPath = join(paths.tools, "package.json");
  if (!existsSync(manifestPath)) {
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ name: "toonstudio-local-fullstack-tools", private: true, description: "로컬 풀스택 하네스 전용 도구(저장소 의존성 아님)" }, null, 2)}\n`,
    );
  }
  const result = runCommand(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--prefix", paths.tools, "--no-audit", "--no-fund", "--loglevel=error", "--save-exact", `embedded-postgres@${version}`],
    {
      env: buildChildEnv({ toolchain: true }),
      encoding: "utf8",
      timeout: 10 * 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    const detail = redactSecrets(`${result.stderr ?? ""}${result.error ? String(result.error) : ""}`).slice(-800);
    throw new Error(
      `embedded-postgres@${version} 설치에 실패했습니다. 네트워크/프록시를 확인한 뒤 다시 실행하세요.\n${detail}`,
    );
  }
  if (!existsSync(binaries.postgres)) {
    throw new Error(`설치는 끝났지만 PostgreSQL 바이너리를 찾지 못했습니다: ${binaries.directory}`);
  }
  for (const binary of [binaries.initdb, binaries.postgres]) chmodSync(binary, 0o755);
  return { installed: true, binaries };
}

// ── root 실행 우회 ───────────────────────────────────────────────────

/** /etc/passwd 에서 매핑할 비root 사용자(uid, gid)를 고른다. */
export function pickMappedIdentity(passwdText) {
  const candidates = [];
  for (const line of String(passwdText ?? "").split("\n")) {
    const fields = line.split(":");
    if (fields.length < 4) continue;
    const uid = Number(fields[2]);
    const gid = Number(fields[3]);
    if (Number.isInteger(uid) && Number.isInteger(gid) && uid > 0) candidates.push({ uid, gid });
  }
  return candidates.find(({ uid }) => uid >= 1000 && uid < 65_534)
    ?? candidates.find(({ uid }) => uid === 65_534)
    ?? { uid: 1000, gid: 1000 };
}

/**
 * root 면 `unshare -U --map-user/--map-group` 로 비root 로 보이게 감싼다. 비root 면 그대로 반환한다.
 * 사용자 네임스페이스 안에서도 파일 접근 권한은 원래 사용자의 것이므로 데이터 디렉터리 소유권 문제가 생기지 않는다.
 */
export function unprivilegedCommand(command, args, {
  uid = process.getuid?.() ?? 1,
  platform = process.platform,
  passwdText,
} = {}) {
  if (platform === "win32" || uid !== 0) return { command, args };
  const identity = pickMappedIdentity(passwdText ?? safeRead("/etc/passwd"));
  return {
    command: "unshare",
    args: ["-U", `--map-user=${identity.uid}`, `--map-group=${identity.gid}`, "--", command, ...args],
  };
}

function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** root 일 때 사용자 네임스페이스 우회가 실제로 동작하는지 확인한다. 실패 시 복구 방법을 안내하는 예외. */
export function assertCanRunPostgres({ runCommand = spawnSync } = {}) {
  const probe = unprivilegedCommand("id", ["-u"]);
  if (probe.command === "id") return { wrapped: false };
  const result = runCommand(probe.command, probe.args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
  const mapped = probe.args.find((argument) => argument.startsWith("--map-user="))?.slice("--map-user=".length);
  if (result.error || result.status !== 0 || String(result.stdout).trim() !== mapped) {
    throw new Error(
      "root 로는 PostgreSQL 을 실행할 수 없고, 사용자 네임스페이스 우회(unshare -U)도 이 환경에서 동작하지 않습니다. "
      + "비root 사용자로 다시 실행하거나, util-linux 의 unshare 와 사용자 네임스페이스(user.max_user_namespaces)를 허용하세요.",
    );
  }
  return { wrapped: true };
}

// ── 클러스터 생성·기동·중지 ──────────────────────────────────────────

export function postgresServerArguments({ dataDirectory, port }) {
  return [
    "-D", dataDirectory,
    "-p", String(port),
    "-c", "listen_addresses=127.0.0.1",
    "-c", "unix_socket_directories=",
    "-c", "fsync=off",
    "-c", "synchronous_commit=off",
    "-c", "full_page_writes=off",
    "-c", "max_connections=60",
    "-c", "shared_buffers=64MB",
    "-c", "timezone=UTC",
    "-c", "log_timezone=UTC",
    "-c", "log_min_messages=warning",
    "-c", "log_min_error_statement=panic",
    "-c", "log_statement=none",
    "-c", "log_connections=off",
    "-c", "log_disconnections=off",
  ];
}

export function initdbArguments({ dataDirectory, adminUser, passwordFile }) {
  return [
    "--pgdata", dataDirectory,
    "--username", adminUser,
    "--auth=scram-sha-256",
    "--pwfile", passwordFile,
    "--encoding=UTF8",
    "--locale=C",
    "--no-instructions",
  ];
}

export function clusterInitialized(paths) {
  return existsSync(join(paths.postgresData, "PG_VERSION"));
}

/** 새 클러스터를 만든다. 이미 있으면 아무것도 하지 않는다. */
export function initializeCluster({ paths, binaries, adminUser, adminPassword, runCommand = spawnSync }) {
  if (clusterInitialized(paths)) return { created: false };
  if (existsSync(paths.postgresData) && readdirSync(paths.postgresData).length > 0) {
    throw new Error(
      `PostgreSQL 데이터 디렉터리가 불완전합니다(${paths.postgresData}). 'node scripts/local-fullstack/cli.mjs reset' 으로 다시 만드세요.`,
    );
  }
  mkdirSync(paths.postgresData, { recursive: true, mode: 0o700 });
  mkdirSync(paths.postgresTemporary, { recursive: true, mode: 0o700 });
  const passwordFile = join(paths.postgresTemporary, `pw-${randomBytes(4).toString("hex")}`);
  writeFileSync(passwordFile, `${adminPassword}\n`, { mode: 0o600 });
  try {
    const wrapped = unprivilegedCommand(
      binaries.initdb,
      initdbArguments({ dataDirectory: paths.postgresData, adminUser, passwordFile }),
    );
    const result = runCommand(wrapped.command, wrapped.args, {
      env: buildChildEnv({ extra: { LC_ALL: "C" } }),
      encoding: "utf8",
      timeout: 180_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = redactSecrets(`${result.stdout ?? ""}${result.stderr ?? ""}`, [adminPassword]);
    writeFileSync(join(paths.logs, "postgres-initdb.log"), output, { mode: 0o600 });
    if (result.error || result.status !== 0) {
      throw new Error(`initdb 실패(자세한 내용: ${join(paths.logs, "postgres-initdb.log")}): ${output.slice(-500)}`);
    }
  } finally {
    rmSync(passwordFile, { force: true });
  }
  return { created: true };
}

export function readPostmasterPid(paths) {
  try {
    const first = readFileSync(join(paths.postgresData, "postmaster.pid"), "utf8").split("\n")[0];
    const pid = Number(first);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** 실행 중인 우리 postmaster 의 PID. 없으면 null. */
export function runningPostgresPid(paths, state) {
  for (const pid of [readPostmasterPid(paths), state?.pg?.pid]) {
    if (pid && processMatches(pid, "postgres")) return pid;
  }
  return null;
}

/** postgres 를 detached 로 띄운다(PID 는 postmaster 와 같다: unshare 는 fork 하지 않고 exec 한다). */
export function spawnPostgres({ paths, binaries, port, logDescriptor }) {
  const wrapped = unprivilegedCommand(
    binaries.postgres,
    postgresServerArguments({ dataDirectory: paths.postgresData, port }),
  );
  return spawnDetached({
    command: wrapped.command,
    args: wrapped.args,
    cwd: paths.postgresRoot,
    env: buildChildEnv({ extra: { LC_ALL: "C" } }),
    logDescriptor,
  });
}

export async function loadPg(paths) {
  try {
    return (await import("pg")).default;
  } catch {
    return createRequire(join(paths.tools, "package.json"))("pg");
  }
}

function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}

/** 가드를 통과한 로컬 URL 로만 연결한다. */
export async function connectLocal(paths, rawUrl, { database, label = "DB URL", timeoutMs = 5_000 } = {}) {
  assertLocalPostgresUrl(rawUrl, label);
  const pg = await loadPg(paths);
  const client = new pg.Client({
    connectionString: database ? withDatabase(rawUrl, database) : rawUrl,
    connectionTimeoutMillis: timeoutMs,
    application_name: "toonstudio-local-fullstack",
  });
  client.on("error", () => {
    // 종료 중 연결 오류는 호출자가 처리한다.
  });
  await client.connect();
  return client;
}

export async function waitForPostgres({ paths, adminUrl, timeoutMs = 90_000, isAlive = () => true }) {
  return waitFor(async () => {
    if (!isAlive()) return { ok: false, detail: "postgres 프로세스가 종료되었습니다(logs/postgres.log 확인)" };
    try {
      const client = await connectLocal(paths, adminUrl, { database: "postgres", label: "관리자 DB URL" });
      try {
        await client.query("SELECT 1");
      } finally {
        await client.end().catch(() => undefined);
      }
      return true;
    } catch (error) {
      // 28P01 = 비밀번호 불일치: 데이터 디렉터리가 다른 비밀번호로 만들어졌다는 뜻이라 기다려도 해결되지 않는다.
      if (error?.code === "28P01") {
        return {
          ok: false,
          fatal: true,
          detail: "관리자 비밀번호가 데이터 디렉터리와 맞지 않습니다. 'node scripts/local-fullstack/cli.mjs reset' 으로 데이터를 다시 만드세요.",
        };
      }
      return { ok: false, detail: String(error?.code ?? error?.message ?? error).slice(0, 120) };
    }
  }, { timeoutMs, intervalMs: 500, describe: "PostgreSQL 접속" });
}

export async function ensureDatabase({ paths, adminUrl, database }) {
  if (!DATABASE_NAME_PATTERN.test(database)) {
    throw new Error("데이터베이스 이름은 소문자·숫자·밑줄만 사용할 수 있습니다.");
  }
  const client = await connectLocal(paths, adminUrl, { database: "postgres", label: "관리자 DB URL" });
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (existing.rowCount > 0) return { created: false };
    await client.query(`CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8'`);
    return { created: true };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** public 스키마에 애플리케이션 객체가 하나라도 있으면 true(스키마 준비 여부 판단). */
export async function databaseHasApplicationObjects({ paths, adminUrl }) {
  const client = await connectLocal(paths, adminUrl, { label: "관리자 DB URL" });
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ) AS has_objects
    `);
    return result.rows[0]?.has_objects === true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** SIGINT(fast shutdown) → 실패 시 SIGQUIT → SIGKILL 순으로 postmaster 를 멈춘다. */
export async function stopPostgres({ paths, state }) {
  const pid = runningPostgresPid(paths, state);
  if (!pid) {
    const stale = readPostmasterPid(paths) ?? state?.pg?.pid;
    return stale && isProcessAlive(stale) ? "mismatch" : "not-running";
  }
  const first = await terminateProcess(pid, {
    needle: "postgres",
    group: false,
    signal: "SIGINT",
    graceMs: 40_000,
    forceSignal: "SIGQUIT",
  });
  if (first === "survived") {
    return terminateProcess(pid, { needle: "postgres", group: false, signal: "SIGKILL", graceMs: 5_000 });
  }
  return first;
}
