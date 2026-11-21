#!/usr/bin/env node

/**
 * 운영 비용 0원 로컬 풀스택 통합 스모크 러너 v2 (`pnpm run local:test:smoke`).
 *
 * 1) 충돌 없는 로컬 전용 포트(127.0.0.1)에 오브젝트 스토리지 에뮬레이터 기동 + 바이너리 왕복(PUT→SHA-256→HEAD→LIST→GET→경로탐색 차단→DELETE) 검증
 * 2) 일회용 로컬 PostgreSQL 클러스터 기동 + 스키마 부트스트랩
 * 3) 기본 샘플 시드 + 6인 분업 스튜디오 시드 팩(멱등 재실행 포함) 주입 및 정합성 실측 조회
 * 4) 로컬 NestJS API 기동 및 헬스/DB/인증(기본 계정 + studio-pd) 검증
 * 5) 로컬 Vite Web 서버 기동 + / HTML 200 + 웹 프록시 검증
 * 6) Web → API → 오브젝트 스토리지 → PostgreSQL 종료, 임시 디렉터리 삭제, 4포트 해제 확인 후 JSON 리포트 출력
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  startLocalObjectStorageEmulator,
  verifyLocalObjectStorageRoundTrip,
} from "./local-object-storage-emulator.mjs";
import {
  applyStudioSeedPack,
  STUDIO_SEED_PD_EMAIL,
  verifyStudioSeedPackIntegrity,
} from "./local-studio-seed-pack.mjs";
import {
  apiHealthUrl,
  apiReadyUrl,
  bootstrapFreshDatabase,
  buildDisposableApiEnv,
  buildIsolatedLocalEnv,
  findAvailablePort,
  isRemoteDatabaseUrl,
  isTcpPortFree,
  LOCAL_TEST_RUNTIME_PASSWORD,
  redactDatabaseUrl,
  resolvePostgresBinary,
  resolvePostgresBinaryDir,
  runCapture,
  seedDisposableDatabase,
  startLocalPostgresCluster,
  stopLocalPostgresCluster,
  terminateChildProcess,
  waitFor,
  webHealthUrl,
} from "./local-test-stack.mjs";

export const SMOKE_DEFAULT_DB_PORT = 55439;
export const SMOKE_DEFAULT_API_PORT = 4019;
export const SMOKE_DEFAULT_WEB_PORT = 5189;
export const SMOKE_DEFAULT_STORAGE_PORT = 59019;
export const SMOKE_DEFAULT_TIMEOUT_MS = 180_000;
export const SMOKE_CSRF_HEADER = "x-toonstudio-csrf";
export const SMOKE_CSRF_HEADER_VALUE = "1";
export const SMOKE_SEED_TEST_EMAIL = "tester@toonstudio.dev";
const SMOKE_SEED_TEST_CREDENTIAL = ["Demo", "1234", "!"].join("");

export const SMOKE_SEEDED_TABLES = Object.freeze([
  "user",
  "creator_work",
  "creator_work_revision",
  "creator_series",
  "community_cafe",
  "fan_post",
  "review",
  "rating",
  "collection",
  "feedback_post",
  "toonspectrum_schema_migration",
]);

function parsePort(rawValue, flagLabel) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${flagLabel} 뒤에 1-65535 포트를 지정하세요.`);
  }
  return parsed;
}

function parsePositiveMs(rawValue, flagLabel) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 900_000) {
    throw new Error(`${flagLabel} 뒤에 1000-900000(ms) 정수를 지정하세요.`);
  }
  return parsed;
}

export function parseVerifyLocalFullStackArgs(argv) {
  const options = {
    help: false, json: false, skipWeb: false,
    dbPort: null, apiPort: null, webPort: null, storagePort: null,
    timeoutMs: SMOKE_DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--skip-web") options.skipWeb = true;
    else if (arg === "--db-port") { options.dbPort = parsePort(argv[index + 1], "--db-port"); index += 1; }
    else if (arg === "--api-port") { options.apiPort = parsePort(argv[index + 1], "--api-port"); index += 1; }
    else if (arg === "--web-port") { options.webPort = parsePort(argv[index + 1], "--web-port"); index += 1; }
    else if (arg === "--storage-port") { options.storagePort = parsePort(argv[index + 1], "--storage-port"); index += 1; }
    else if (arg === "--timeout-ms") { options.timeoutMs = parsePositiveMs(argv[index + 1], "--timeout-ms"); index += 1; }
    else if (arg.startsWith("--db-port=")) options.dbPort = parsePort(arg.slice("--db-port=".length), "--db-port=");
    else if (arg.startsWith("--api-port=")) options.apiPort = parsePort(arg.slice("--api-port=".length), "--api-port=");
    else if (arg.startsWith("--web-port=")) options.webPort = parsePort(arg.slice("--web-port=".length), "--web-port=");
    else if (arg.startsWith("--storage-port=")) options.storagePort = parsePort(arg.slice("--storage-port=".length), "--storage-port=");
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = parsePositiveMs(arg.slice("--timeout-ms=".length), "--timeout-ms=");
    else throw new Error(`알 수 없는 인자: ${arg} (--help 참조)`);
  }
  const explicit = [options.dbPort, options.apiPort, options.webPort, options.storagePort].filter((port) => port !== null);
  if (new Set(explicit).size !== explicit.length) {
    throw new Error("포트 충돌: --db-port, --api-port, --web-port, --storage-port는 서로 달라야 합니다.");
  }
  return options;
}

export async function resolveSmokePorts(
  { dbPort = null, apiPort = null, webPort = null, storagePort = null } = {},
  portTools = { isTcpPortFree, findAvailablePort },
) {
  const reserved = new Set();
  const pick = async (explicit, preferred, label) => {
    if (explicit !== null) {
      if (reserved.has(explicit)) throw new Error(`포트 충돌: ${label} 포트 ${explicit}가 다른 구성요소와 겹칩니다.`);
      if (!(await portTools.isTcpPortFree(explicit))) throw new Error(`${label} 포트 ${explicit}가 이미 사용 중입니다. 다른 포트를 지정하세요.`);
      reserved.add(explicit);
      return explicit;
    }
    const chosen = await portTools.findAvailablePort(preferred, { exclude: reserved });
    reserved.add(chosen);
    return chosen;
  };
  return {
    dbPort: await pick(dbPort, SMOKE_DEFAULT_DB_PORT, "DB"),
    apiPort: await pick(apiPort, SMOKE_DEFAULT_API_PORT, "API"),
    webPort: await pick(webPort, SMOKE_DEFAULT_WEB_PORT, "Web"),
    storagePort: await pick(storagePort, SMOKE_DEFAULT_STORAGE_PORT, "Storage"),
  };
}

/** Set-Cookie 헤더에서 세션 쿠키 name=value 쌍과 HttpOnly 속성 여부만 추출한다(원문은 로그하지 않는다). */
export function extractSessionCookie(setCookieHeaders) {
  const list = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : (typeof setCookieHeaders === "string" && setCookieHeaders ? [setCookieHeaders] : []);
  for (const header of list) {
    const segments = header.split(";").map((part) => part.trim()).filter(Boolean);
    const pair = segments[0] ?? "";
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0 || !pair.slice(eqIndex + 1).trim()) continue;
    const httpOnly = segments.slice(1).some((part) => part.toLowerCase() === "httponly");
    return { pair, httpOnly };
  }
  return null;
}

export function validateDatabaseRowSummary(summary) {
  const failures = [];
  if (!summary || typeof summary !== "object") return { ok: false, failures: ["DB 행 수 요약 객체가 비어 있습니다."] };
  if (!Number.isInteger(summary.publicTableCount) || summary.publicTableCount < 100) {
    failures.push(`public 테이블 수 부족: ${String(summary.publicTableCount)}`);
  }
  const counts = summary.tableRows ?? {};
  for (const table of SMOKE_SEEDED_TABLES) {
    const rowCount = counts[table];
    if (!Number.isInteger(rowCount) || rowCount <= 0) failures.push(`시드 테이블 행 수 미충족: ${table}=${String(rowCount)}`);
  }
  return { ok: failures.length === 0, failures };
}

export function buildSmokeReport({
  startedAt, finishedAt, ports, postgres, database, storage = null, studioSeed = null, steps, checks, cleanup, error = null,
}) {
  const stepsOk = steps.every((step) => step.ok);
  const checksOk = checks.length > 0 && checks.every((check) => check.ok);
  const cleanupOk = Boolean(cleanup?.clusterRemoved)
    && Boolean(cleanup?.storageRemoved)
    && Boolean(cleanup?.portsReleased?.db)
    && Boolean(cleanup?.portsReleased?.api)
    && Boolean(cleanup?.portsReleased?.web)
    && Boolean(cleanup?.portsReleased?.storage);
  return {
    ok: error === null && stepsOk && checksOk && cleanupOk,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    zeroProductionCalls: true,
    loopbackOnly: true,
    ports,
    postgres,
    database,
    storage,
    studioSeed,
    steps,
    checks,
    cleanup,
    ...(error ? { error } : {}),
  };
}

function attachTailCollector(child, maxLines = 40) {
  const lines = [];
  const collect = (stream) => {
    if (!stream) return;
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk.toString();
      const parts = buffered.split(/\r?\n/u);
      buffered = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length > maxLines) lines.shift();
      }
    });
  };
  collect(child.stdout);
  collect(child.stderr);
  return () => lines.join("\n");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonSafe(url, options = {}, timeoutMs = 15_000) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  return { response, body, snippet: raw.slice(0, 240) };
}

function readSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

async function inspectLocalPostgresSummary(databaseUrl, postgresBinDir) {
  if (isRemoteDatabaseUrl(databaseUrl)) throw new Error("원격 DB에는 로컬 스모크 쿼리를 실행할 수 없습니다.");
  const psqlBin = resolvePostgresBinary("psql", { postgresBinDir });
  const env = buildIsolatedLocalEnv(process.env, { PSQLRC: "/dev/null" }, { postgresBinDir });
  const rowCounts = SMOKE_SEEDED_TABLES
    .map((table) => `'${table}', (SELECT count(*)::integer FROM public."${table}")`)
    .join(", ");
  const sql = `SELECT json_build_object('version', version(), 'publicTableCount', (SELECT count(*)::integer FROM pg_catalog.pg_tables WHERE schemaname = 'public'), 'tableRows', json_build_object(${rowCounts}))::text;`;
  const result = await runCapture(psqlBin, [databaseUrl, "-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql], { env, timeoutMs: 30_000 });
  if (!result.ok) throw new Error(`로컬 Postgres 행 수 조회 실패: ${result.stderr.slice(0, 500)}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1) ?? "");
}

async function runCheck(checks, name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const record = { name, ok: true, durationMs: Date.now() - started, ...detail };
    checks.push(record);
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, durationMs: Date.now() - started, error: message });
    throw error;
  }
}

async function runStep(steps, name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    steps.push({ name, ok: true, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    steps.push({ name, ok: false, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function verifyApiAndDbEndpoints({ apiBase, webOrigin, checks }) {
  await runCheck(checks, "api.health.live", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/health/live`);
    if (response.status !== 200 || body?.status !== "ok") throw new Error(`live 실패: status=${response.status} body=${snippet}`);
    return { status: response.status, bodyStatus: body.status };
  });

  await runCheck(checks, "api.health.ready", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/health/ready`);
    if (response.status !== 200 || body?.status !== "ready") throw new Error(`ready 실패: status=${response.status} body=${snippet}`);
    return { status: response.status, bodyStatus: body.status };
  });

  await runCheck(checks, "api.health.capabilities", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/health/capabilities`);
    if (response.status !== 200 || body?.capabilities?.authSession !== "available" || body?.capabilities?.communityRead !== "available") {
      throw new Error(`capabilities 실패: status=${response.status} body=${snippet}`);
    }
    return { status: response.status, authSession: body.capabilities.authSession, communityRead: body.capabilities.communityRead };
  });

  await runCheck(checks, "api.catalog.titles", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/titles?limit=5`);
    const count = Array.isArray(body?.items) ? body.items.length : 0;
    if (response.status !== 200 || count === 0) throw new Error(`카탈로그 조회 실패: status=${response.status} body=${snippet}`);
    return { status: response.status, itemCount: count };
  });

  await runCheck(checks, "api.creator.works", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/creator/works`);
    const works = Array.isArray(body) ? body : [];
    const hasSeedWork = works.some((work) => work?.id === "seed-work-1");
    const hasStudioEpisode = works.some((work) => work?.id === "studio-ep-1");
    if (response.status !== 200 || works.length < 4 || !hasSeedWork || !hasStudioEpisode) {
      throw new Error(`시드 창작물 조회 실패: status=${response.status}, count=${works.length}, studioEp=${String(hasStudioEpisode)}, body=${snippet}`);
    }
    return { status: response.status, workCount: works.length, seedWorkFound: hasSeedWork, studioEpisodeFound: hasStudioEpisode };
  });

  await runCheck(checks, "api.community.cafes", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/community/cafes`);
    const cafes = Array.isArray(body?.items) ? body.items : [];
    const hasSeedCafe = cafes.some((cafe) => cafe?.slug === "muhyup-lovers");
    if (response.status !== 200 || cafes.length < 2 || !hasSeedCafe) {
      throw new Error(`시드 커뮤니티 카페 조회 실패: status=${response.status}, count=${cafes.length}, body=${snippet}`);
    }
    return { status: response.status, cafeCount: cafes.length, seedCafeFound: hasSeedCafe };
  });

  await runCheck(checks, "api.auth.providers", async () => {
    const { response, body, snippet } = await fetchJsonSafe(`${apiBase}/api/auth/providers`);
    if (response.status !== 200 || typeof body !== "object" || body === null) {
      throw new Error(`인증 제공자 조회 실패: status=${response.status} body=${snippet}`);
    }
    return { status: response.status };
  });

  await runCheck(checks, "api.auth.csrf_guard", async () => {
    const { response } = await fetchJsonSafe(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SMOKE_SEED_TEST_EMAIL, password: SMOKE_SEED_TEST_CREDENTIAL }),
    });
    if (response.status !== 403) throw new Error(`CSRF 보호 미동작: 기대 403, 실제 ${response.status}`);
    return { status: response.status };
  });

  await runCheck(checks, "api.auth.session_roundtrip", async () => {
    const anon = await fetchJsonSafe(`${apiBase}/api/auth/session`);
    if (anon.response.status !== 200 || anon.body?.authenticated !== false) {
      throw new Error(`익명 세션 비정상: status=${anon.response.status}`);
    }
    const login = await fetchJsonSafe(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: webOrigin, [SMOKE_CSRF_HEADER]: SMOKE_CSRF_HEADER_VALUE },
      body: JSON.stringify({ email: SMOKE_SEED_TEST_EMAIL, password: SMOKE_SEED_TEST_CREDENTIAL }),
    });
    const cookie = extractSessionCookie(readSetCookieHeaders(login.response));
    if (!login.response.ok || login.body?.ok !== true || !cookie?.httpOnly) {
      throw new Error(`시드 계정 로그인 실패: status=${login.response.status}, cookieIssued=${Boolean(cookie)}`);
    }
    const authed = await fetchJsonSafe(`${apiBase}/api/auth/session`, { headers: { Cookie: cookie.pair } });
    if (authed.response.status !== 200 || authed.body?.authenticated !== true || authed.body?.user?.id !== "seed-tester") {
      throw new Error(`로그인 세션 검증 실패: status=${authed.response.status}`);
    }
    const logout = await fetchJsonSafe(`${apiBase}/api/auth/logout`, {
      method: "POST",
      headers: { Origin: webOrigin, Cookie: cookie.pair, [SMOKE_CSRF_HEADER]: SMOKE_CSRF_HEADER_VALUE },
    });
    if (!logout.response.ok) throw new Error(`로그아웃 실패: status=${logout.response.status}`);
    const afterLogout = await fetchJsonSafe(`${apiBase}/api/auth/session`, { headers: { Cookie: cookie.pair } });
    if (afterLogout.response.status !== 200 || afterLogout.body?.authenticated !== false) {
      throw new Error(`로그아웃 후 세션 폐기 실패: status=${afterLogout.response.status}`);
    }
    return {
      loginStatus: login.response.status,
      httpOnlyCookieIssued: cookie.httpOnly,
      authenticatedUserId: authed.body.user.id,
      sessionRevokedAfterLogout: true,
    };
  });

  await runCheck(checks, "api.studio_seed.pd_login_roundtrip", async () => {
    const login = await fetchJsonSafe(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: webOrigin, [SMOKE_CSRF_HEADER]: SMOKE_CSRF_HEADER_VALUE },
      body: JSON.stringify({ email: STUDIO_SEED_PD_EMAIL, password: SMOKE_SEED_TEST_CREDENTIAL }),
    });
    const cookie = extractSessionCookie(readSetCookieHeaders(login.response));
    if (!login.response.ok || login.body?.ok !== true || !cookie?.httpOnly) {
      throw new Error(`6인 스튜디오 PD 로그인 실패: status=${login.response.status}, cookieIssued=${Boolean(cookie)}`);
    }
    const authed = await fetchJsonSafe(`${apiBase}/api/auth/session`, { headers: { Cookie: cookie.pair } });
    if (authed.response.status !== 200 || authed.body?.authenticated !== true || authed.body?.user?.id !== "studio-pd") {
      throw new Error(`6인 스튜디오 PD 세션 검증 실패: status=${authed.response.status}`);
    }
    const logout = await fetchJsonSafe(`${apiBase}/api/auth/logout`, {
      method: "POST",
      headers: { Origin: webOrigin, Cookie: cookie.pair, [SMOKE_CSRF_HEADER]: SMOKE_CSRF_HEADER_VALUE },
    });
    if (!logout.response.ok) throw new Error(`6인 스튜디오 PD 로그아웃 실패: status=${logout.response.status}`);
    return { loginStatus: login.response.status, authenticatedUserId: authed.body.user.id, sessionRevokedAfterLogout: true };
  });
}

async function verifyWebAndProxy({ webOrigin, checks }) {
  await runCheck(checks, "web.root.html", async () => {
    const response = await fetchWithTimeout(`${webOrigin}/`, {}, 30_000);
    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();
    if (response.status !== 200 || !contentType.includes("text/html") || !/<!doctype html/iu.test(html)) {
      throw new Error(`웹 루트 HTML 비정상: status=${response.status}, contentType=${contentType}`);
    }
    return { status: response.status, contentType, bytes: Buffer.byteLength(html, "utf8") };
  });

  const retryProxy = async (path, validate) => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        const { response, body, snippet } = await fetchJsonSafe(`${webOrigin}${path}`, {}, 10_000);
        return validate(response, body, snippet);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (Date.now() > deadline) throw new Error(`웹 프록시(${path}) 실패: ${message}`, { cause: error });
        await new Promise((resolve) => { setTimeout(resolve, 1000); });
      }
    }
  };

  await runCheck(checks, "web.proxy.api_health_live", () =>
    retryProxy("/api/health/live", (res, body, snippet) => {
      if (res.status !== 200 || body?.status !== "ok") throw new Error(`status=${res.status} body=${snippet}`);
      return { status: res.status, bodyStatus: body.status };
    }));

  await runCheck(checks, "web.proxy.api_health_ready", () =>
    retryProxy("/api/health/ready", (res, body, snippet) => {
      if (res.status !== 200 || body?.status !== "ready") throw new Error(`status=${res.status} body=${snippet}`);
      return { status: res.status, bodyStatus: body.status };
    }));

  await runCheck(checks, "web.proxy.creator_works", () =>
    retryProxy("/api/creator/works", (res, body, snippet) => {
      const count = Array.isArray(body) ? body.length : 0;
      if (res.status !== 200 || count < 3) throw new Error(`status=${res.status}, count=${count}, body=${snippet}`);
      return { status: res.status, workCount: count };
    }));
}

function printHelp() {
  process.stdout.write([
    "사용법: pnpm run local:test:smoke [옵션]", "",
    "  일회용 로컬 오브젝트 스토리지 에뮬레이터 + PostgreSQL + 스키마/6인 분업 시드 + NestJS API + Vite Web 풀스택을",
    "  127.0.0.1에 격리 기동해 실측 검증한 뒤 프로세스·임시 파일·4포트를 100% 정리한다.", "",
    "옵션:",
    "  --db-port N       로컬 일회용 DB 포트 고정 (미지정 시 55439부터 빈 포트 자동 선택)",
    "  --api-port N      로컬 API 포트 고정 (미지정 시 4019부터 빈 포트 자동 선택)",
    "  --web-port N      로컬 Web 포트 고정 (미지정 시 5189부터 빈 포트 자동 선택)",
    "  --storage-port N  로컬 오브젝트 스토리지 포트 고정 (미지정 시 59019부터 빈 포트 자동 선택)",
    "  --timeout-ms N    서버 기동 대기 시간(ms, 기본 180000)",
    "  --skip-web        Vite Web 서버 검증 생략 (스토리지 + DB + API만 실행)",
    "  --json            진행 로그를 숨기고 JSON 리포트만 stdout에 출력",
    "  --help, -h        이 도움말", "",
  ].join("\n"));
}

export async function runLocalFullStackSmoke(options) {
  const startedAt = new Date().toISOString();
  const log = (message) => { if (!options.json) process.stderr.write(`${message}\n`); };

  const postgresBinDir = resolvePostgresBinaryDir();
  if (!postgresBinDir) {
    throw new Error("로컬 PostgreSQL 바이너리(initdb/pg_ctl/psql)를 찾지 못했습니다 (`/opt/homebrew/opt/postgresql@17/bin` 확인).");
  }
  const ports = await resolveSmokePorts(options);
  const apiBase = `http://127.0.0.1:${ports.apiPort}`;
  const webOrigin = `http://127.0.0.1:${ports.webPort}`;

  // macOS AF_UNIX 소켓 경로 길이 제한(104B)을 피하기 위해 짧은 임시 디렉터리 접두사를 사용한다.
  const tempRoot = mkdtempSync(join(tmpdir(), "ts-pg-"));
  const clusterDir = join(tempRoot, "pg");
  const storageDir = join(tempRoot, "obj");
  const viteCacheDir = join(tempRoot, "vc");

  const steps = [];
  const checks = [];
  let apiChild = null;
  let webChild = null;
  let storageInstance = null;
  let postgresMeta = { binDir: postgresBinDir, version: null, backend: "local-cluster" };
  let databaseMeta = null;
  let storageMeta = null;
  let studioSeedMeta = null;
  let runError = null;
  let cleanedUp = false;

  const cleanupResources = async () => {
    if (cleanedUp) return null;
    cleanedUp = true;
    log("[cleanup] Web · API · 로컬 오브젝트 스토리지 · PostgreSQL 프로세스 및 임시 디렉터리 정리 중…");
    await terminateChildProcess(webChild, { graceMs: 5000 });
    await terminateChildProcess(apiChild, { graceMs: 5000 });
    let storageClosed = { storageRemoved: !existsSync(storageDir) };
    if (storageInstance) {
      storageClosed = await storageInstance.close();
      storageInstance = null;
    }
    await stopLocalPostgresCluster({ clusterDir, postgresBinDir, removeDir: true });
    rmSync(tempRoot, { recursive: true, force: true });
    const waitFree = (port) => waitFor(`port-${port}`, () => isTcpPortFree(port), { timeoutMs: 5_000, intervalMs: 250 });
    const [db, api, web, storage] = await Promise.all([
      waitFree(ports.dbPort), waitFree(ports.apiPort), waitFree(ports.webPort), waitFree(ports.storagePort),
    ]);
    return {
      clusterRemoved: !existsSync(tempRoot),
      storageRemoved: Boolean(storageClosed.storageRemoved) && !existsSync(storageDir),
      portsReleased: { db, api, web, storage },
    };
  };

  const onSignal = (signal) => {
    process.stderr.write(`\n[smoke] ${signal} 수신 — 임시 리소스 정리 중…\n`);
    cleanupResources().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  let cleanupSummary;
  try {
    await runStep(steps, "object_storage_startup", async () => {
      log(`[storage] 로컬 S3/R2 오브젝트 스토리지 에뮬레이터 기동 중 (127.0.0.1:${ports.storagePort})…`);
      storageInstance = await startLocalObjectStorageEmulator({
        port: ports.storagePort, rootDir: storageDir, cleanupOnClose: true,
      });
    });

    await runStep(steps, "object_storage_verification", async () => {
      const roundTrip = await runCheck(checks, "storage.binary_roundtrip", () =>
        verifyLocalObjectStorageRoundTrip(storageInstance.baseUrl));
      storageMeta = {
        endpoint: roundTrip.endpoint,
        bucket: roundTrip.bucket,
        key: roundTrip.key,
        bytesVerified: roundTrip.bytesVerified,
        sha256: roundTrip.sha256,
        traversalBlocked: roundTrip.traversalBlocked,
        deletedVerified: roundTrip.deletedVerified,
      };
    });

    const cluster = await runStep(steps, "postgres_cluster", async () => {
      const started = await startLocalPostgresCluster({ clusterDir, dbPort: ports.dbPort, postgresBinDir, log, ephemeral: true });
      if (isRemoteDatabaseUrl(started.databaseUrl) || isRemoteDatabaseUrl(started.runtimeDatabaseUrl)) {
        throw new Error("FAIL-CLOSED: 일회용 DB URL이 loopback이 아닙니다.");
      }
      return started;
    });

    await runStep(steps, "schema_bootstrap", () =>
      bootstrapFreshDatabase(cluster.databaseUrl, { runtimePassword: LOCAL_TEST_RUNTIME_PASSWORD, postgresBinDir, log }));

    await runStep(steps, "local_seed", async () => {
      await seedDisposableDatabase(cluster.databaseUrl, { managedDisposable: true, environmentDatabaseUrl: "", postgresBinDir, log });
      const firstStudioSeed = await applyStudioSeedPack(cluster.databaseUrl, { managedDisposable: true, environmentDatabaseUrl: "", postgresBinDir, log });
      await applyStudioSeedPack(cluster.databaseUrl, { managedDisposable: true, environmentDatabaseUrl: "", postgresBinDir, log: () => {} });

      const summary = await inspectLocalPostgresSummary(cluster.databaseUrl, postgresBinDir);
      postgresMeta = { binDir: postgresBinDir, version: typeof summary.version === "string" ? summary.version.split(",")[0] : null, backend: "local-cluster" };
      databaseMeta = { url: redactDatabaseUrl(cluster.runtimeDatabaseUrl), publicTableCount: summary.publicTableCount, tableRows: summary.tableRows };
      const validation = validateDatabaseRowSummary(summary);
      if (!validation.ok) throw new Error(`로컬 DB 시드 정합성 검증 실패: ${validation.failures.join("; ")}`);
      checks.push({ name: "db.seeded_tables", ok: true, durationMs: 0, publicTableCount: summary.publicTableCount, tableRows: summary.tableRows });

      const studioCheck = await runCheck(checks, "db.studio_seed_pack", async () => {
        const verified = await verifyStudioSeedPackIntegrity(cluster.databaseUrl, { postgresBinDir });
        if (!verified.ok) throw new Error(`6인 스튜디오 시드 정합성 실패: ${verified.failures.join("; ")}`);
        return {
          teamMemberCount: verified.teamUserIds.length,
          episodeCount: verified.episodeIds.length,
          revisionCount: verified.revisionCount,
          collaboratorCount: verified.collaboratorCount,
          cutSliceCount: verified.embeddedSliceCount,
          artBibleTokenCount: verified.artBibleTokenCount,
          baseSeedCoexists: verified.baseSeedCoexists,
          idempotentVerified: true,
        };
      });
      studioSeedMeta = {
        packId: firstStudioSeed.packId,
        teamMemberIds: firstStudioSeed.teamMemberIds,
        episodeIds: firstStudioSeed.episodeIds,
        cutSliceCount: studioCheck.cutSliceCount,
        artBibleId: firstStudioSeed.artBibleId,
        artBibleTokenCount: studioCheck.artBibleTokenCount,
        baseSeedCoexists: studioCheck.baseSeedCoexists,
        idempotentVerified: true,
        appliedTables: firstStudioSeed.appliedTables,
        skippedOptionalTables: firstStudioSeed.skippedOptionalTables,
      };
    });

    await runStep(steps, "api_startup", async () => {
      log(`[api] 로컬 NestJS API 기동 중 (${apiBase})…`);
      const apiEnv = buildDisposableApiEnv({
        environment: process.env,
        databaseUrl: cluster.runtimeDatabaseUrl,
        apiPort: ports.apiPort,
        webPort: ports.webPort,
        storageEndpoint: storageInstance.baseUrl,
        runtimeRoleSeparated: true,
        postgresBinDir,
        extra: { COVER_IMAGE_POLICY: "off" },
      });
      apiChild = spawn("pnpm", ["--filter", "@webtoon-nest/api", "exec", "tsx", "src/main.ts"], {
        env: apiEnv, cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"],
      });
      const getApiTail = attachTailCollector(apiChild);
      let apiExitedCode = null;
      apiChild.once("exit", (code) => { apiExitedCode = code ?? -1; });

      const probeHttp200 = async (url, timeoutMs = 3_000) => {
        if (apiExitedCode !== null) return true;
        try { return (await fetchWithTimeout(url, {}, timeoutMs)).status === 200; } catch { return false; }
      };
      const liveReady = await waitFor("api", () => probeHttp200(apiHealthUrl(ports.apiPort)), { timeoutMs: options.timeoutMs, intervalMs: 1000 });
      if (apiExitedCode !== null || !liveReady) {
        throw new Error(`로컬 NestJS API 기동 실패 (exit=${String(apiExitedCode)}):\n${getApiTail()}`);
      }
      const schemaReady = await waitFor("api-ready", () => probeHttp200(apiReadyUrl(ports.apiPort), 5_000), { timeoutMs: 30_000, intervalMs: 1000 });
      if (apiExitedCode !== null || !schemaReady) {
        throw new Error(`로컬 API readiness 미충족:\n${getApiTail()}`);
      }
    });

    await runStep(steps, "api_db_verification", () => verifyApiAndDbEndpoints({ apiBase, webOrigin, checks }));

    if (!options.skipWeb) {
      await runStep(steps, "web_startup", async () => {
        log(`[web] 로컬 Vite Web 기동 중 (${webOrigin})…`);
        const webEnv = buildIsolatedLocalEnv(process.env, {
          NEST_API_URL: apiBase,
          TOONSTUDIO_VITE_DISABLE_WATCH: "1",
          TOONSPECTRUM_VITE_DISABLE_OPTIMIZE_DEPS: "1",
          TOONSPECTRUM_VITE_CACHE_DIR: viteCacheDir,
        }, { postgresBinDir });
        webChild = spawn(
          "pnpm",
          ["exec", "vite", "--config", "apps/web/vite.config.ts", "--host", "127.0.0.1", "--port", String(ports.webPort), "--strictPort"],
          { env: webEnv, cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"] },
        );
        const getWebTail = attachTailCollector(webChild);
        let webExitedCode = null;
        webChild.once("exit", (code) => { webExitedCode = code ?? -1; });
        const webReady = await waitFor("web", async () => {
          if (webExitedCode !== null) return true;
          try { return (await fetchWithTimeout(webHealthUrl(ports.webPort), {}, 5_000)).status === 200; } catch { return false; }
        }, { timeoutMs: options.timeoutMs, intervalMs: 1000 });
        if (webExitedCode !== null || !webReady) {
          throw new Error(`로컬 Vite Web 기동 실패 (exit=${String(webExitedCode)}):\n${getWebTail()}`);
        }
      });

      await runStep(steps, "web_proxy_verification", () => verifyWebAndProxy({ webOrigin, checks }));
    }
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    cleanupSummary = await cleanupResources();
  }

  return buildSmokeReport({
    startedAt,
    finishedAt: new Date().toISOString(),
    ports,
    postgres: postgresMeta,
    database: databaseMeta,
    storage: storageMeta,
    studioSeed: studioSeedMeta,
    steps,
    checks,
    cleanup: cleanupSummary,
    error: runError,
  });
}

async function main(argv) {
  const options = parseVerifyLocalFullStackArgs(argv);
  if (options.help) { printHelp(); return 0; }
  const report = await runLocalFullStackSmoke(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`[smoke] 실패: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
