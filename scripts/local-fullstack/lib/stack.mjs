/**
 * API(Nest)·웹(Vite) 프로세스 기동/중지와 헬스 대기.
 *
 * 환경은 허용 목록(buildChildEnv)으로만 만들고, 로컬용 값은 프로세스에만 주입한다(.env 파일을 쓰지 않는다).
 * API 는 NEST_API_HOST=127.0.0.1 로 loopback 에만 바인딩하고, 로컬 .env.local 자동 로드는 끈다.
 */

import { closeSync, existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ENV_KEYS, REPOSITORY_ROOT } from "./config.mjs";
import { assertLocalOrigin, assertLocalPostgresUrl, buildChildEnv, redactSecrets } from "./guard.mjs";
import {
  httpProbe,
  processMatches,
  spawnDetached,
  terminateProcess,
  waitFor,
  waitForPortFree,
} from "./processes.mjs";
import { openLog, patchState } from "./state.mjs";

const API_NEEDLE = "src/main.ts";
const WEB_NEEDLE = "vite.js";

export function resolveTsxLoader(repositoryRoot) {
  const require = createRequire(join(repositoryRoot, "apps", "api", "package.json"));
  return pathToFileURL(require.resolve("tsx")).href;
}

export function resolveViteEntry(repositoryRoot) {
  const path = join(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(path)) {
    throw new Error("vite 를 찾지 못했습니다. 저장소 루트에서 'pnpm install' 을 먼저 실행하세요.");
  }
  return path;
}

/** API 프로세스에 주입할 환경(비밀값 포함: 로그에 출력하지 않는다). */
export function buildApiEnvironment(values, { base = process.env, repositoryRoot = REPOSITORY_ROOT } = {}) {
  const api = assertLocalOrigin(values[ENV_KEYS.apiOrigin], ENV_KEYS.apiOrigin);
  const web = assertLocalOrigin(values[ENV_KEYS.webOrigin], ENV_KEYS.webOrigin);
  assertLocalPostgresUrl(values[ENV_KEYS.databaseUrl], ENV_KEYS.databaseUrl);
  return buildChildEnv({
    base,
    extra: {
      NODE_ENV: "development",
      // 저장소/상위의 .env.local(실제 운영 값이 있을 수 있음)을 자동으로 읽지 않는다.
      API_LOCAL_ENV_FILE_ENABLED: "false",
      API_RUNTIME_ROLE: "full",
      DATABASE_URL: values[ENV_KEYS.databaseUrl],
      NEST_API_HOST: "127.0.0.1",
      NEST_API_PORT: String(api.port),
      API_CORS_ALLOWED_ORIGINS: [`http://127.0.0.1:${web.port}`, `http://localhost:${web.port}`].join(","),
      WEB_APP_BASE_URL: web.origin,
      OAUTH_REDIRECT_BASE_URL: api.origin,
      AUTH_SESSION_SECRET: values[ENV_KEYS.sessionSecret],
      AUTH_STATE_SECRET: values[ENV_KEYS.stateSecret],
      // 로컬 단일 인스턴스 제한기. loopback 프록시의 X-Forwarded-For 만 신뢰해 스모크가 IP 버킷을 격리할 수 있게 한다.
      AUTH_RATE_LIMIT_MODE: "single-instance-local",
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "127.0.0.1,::1",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      // 운영과 같은 상태: 이메일 발송 미설정 → 이메일 가입 거부(시드 계정으로만 로그인).
      AUTH_EMAIL_PROVIDER: "disabled",
      AUTH_SOCIAL_DEMO_ENABLED: "false",
      TRAFFIC_ANALYTICS_STORE: "postgres",
      STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
      FEDERATED_DATA_PLANE_ENABLED: "false",
      COVER_IMAGE_POLICY: "off",
      // tsx 가 apps/api 의 데코레이터 설정(experimentalDecorators)을 쓰도록 고정한다.
      TSX_TSCONFIG_PATH: join(repositoryRoot, "apps", "api", "tsconfig.json"),
    },
  });
}

export function buildWebEnvironment(values, { base = process.env } = {}) {
  const api = assertLocalOrigin(values[ENV_KEYS.apiOrigin], ENV_KEYS.apiOrigin);
  return buildChildEnv({
    base,
    extra: {
      // apps/web/vite.config.ts 의 /api · /socket.io · /studio-live 프록시 대상.
      NEST_API_URL: api.origin,
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
  });
}

export function tailLog(path, { bytes = 2_500, secrets = [] } = {}) {
  try {
    const size = statSync(path).size;
    const text = readFileSync(path).subarray(Math.max(0, size - bytes)).toString("utf8");
    return redactSecrets(text, secrets);
  } catch {
    return "";
  }
}

// ── API ──────────────────────────────────────────────────────────────

export async function startApi({ paths, repositoryRoot, values, state, secrets }) {
  const api = assertLocalOrigin(values[ENV_KEYS.apiOrigin], ENV_KEYS.apiOrigin);
  if (state?.api?.pid && processMatches(state.api.pid, API_NEEDLE)) {
    if (state.api.port && state.api.port !== api.port) {
      throw new Error(`API 가 다른 포트(${state.api.port})로 이미 실행 중입니다. 'api:stop' 또는 'down' 으로 멈춘 뒤 다시 시작하세요.`);
    }
    return { reused: true, pid: state.api.pid, port: state.api.port ?? api.port };
  }
  if (!(await waitForPortFree(api.port))) {
    throw new Error(`API 포트 ${api.port} 를 다른 프로세스가 사용 중입니다. 해당 프로세스를 정리하거나 --api-port 로 다른 포트를 지정하세요.`);
  }
  const env = buildApiEnvironment(values, { repositoryRoot });
  const log = openLog(paths, "api", `API 시작 :${api.port}`);
  let child;
  try {
    child = spawnDetached({
      command: process.execPath,
      args: ["--import", resolveTsxLoader(repositoryRoot), API_NEEDLE],
      cwd: join(repositoryRoot, "apps", "api"),
      env,
      logDescriptor: log.descriptor,
    });
  } finally {
    closeSync(log.descriptor);
  }
  patchState(paths, {
    api: { pid: child.pid, port: api.port, startedAt: new Date().toISOString(), trustedProxy: true, log: log.path },
  });
  const live = await waitFor(async () => {
    if (!processMatches(child.pid, API_NEEDLE)) {
      return { ok: false, detail: `프로세스가 종료됨. 로그 끝부분:\n${tailLog(log.path, { secrets })}` };
    }
    const response = await httpProbe(`${api.origin}/api/health/live`, { timeoutMs: 3_000 });
    return response?.status === 200 && response.json?.status === "ok";
  }, { timeoutMs: 240_000, intervalMs: 1_000, describe: "API /api/health/live" });
  if (!live.ok) throw new Error(`${live.detail}\n(로그: ${log.path})`);
  return { reused: false, pid: child.pid, port: api.port, logPath: log.path };
}

export async function waitForApiReady({ values, logPath, secrets, timeoutMs = 120_000 }) {
  const api = assertLocalOrigin(values[ENV_KEYS.apiOrigin], ENV_KEYS.apiOrigin);
  let last = null;
  const ready = await waitFor(async () => {
    last = await httpProbe(`${api.origin}/api/health/ready`, { timeoutMs: 8_000 });
    return last?.status === 200 && last.json?.status === "ready";
  }, { timeoutMs, intervalMs: 2_000, describe: "API /api/health/ready" });
  if (!ready.ok) {
    const code = last?.json?.code ?? last?.json?.status ?? last?.status ?? "응답 없음";
    const tail = logPath ? tailLog(logPath, { bytes: 1_500, secrets }) : "";
    throw new Error(`${ready.detail} (마지막 응답: ${code})\n${tail}`);
  }
  return ready;
}

export async function stopApi({ state }) {
  const pid = state?.api?.pid;
  if (!pid) return "not-running";
  return terminateProcess(pid, { needle: API_NEEDLE, group: true, graceMs: 15_000 });
}

// ── 웹 ───────────────────────────────────────────────────────────────

export async function startWeb({ paths, repositoryRoot, values, state, secrets }) {
  const web = assertLocalOrigin(values[ENV_KEYS.webOrigin], ENV_KEYS.webOrigin);
  const api = assertLocalOrigin(values[ENV_KEYS.apiOrigin], ENV_KEYS.apiOrigin);
  if (state?.web?.pid && processMatches(state.web.pid, WEB_NEEDLE)) {
    if (state.web.port && state.web.port !== web.port) {
      throw new Error(`웹이 다른 포트(${state.web.port})로 이미 실행 중입니다. 'web:stop' 또는 'down' 으로 멈춘 뒤 다시 시작하세요.`);
    }
    return { reused: true, pid: state.web.pid, port: state.web.port ?? web.port };
  }
  if (!(await waitForPortFree(web.port))) {
    throw new Error(`웹 포트 ${web.port} 를 다른 프로세스가 사용 중입니다. 해당 프로세스를 정리하거나 --web-port 로 다른 포트를 지정하세요.`);
  }
  const log = openLog(paths, "web", `웹(Vite) 시작 :${web.port}`);
  let child;
  try {
    child = spawnDetached({
      command: process.execPath,
      args: [
        resolveViteEntry(repositoryRoot),
        "--config", "apps/web/vite.config.ts",
        "--host", "127.0.0.1",
        "--port", String(web.port),
        "--strictPort",
      ],
      cwd: repositoryRoot,
      env: buildWebEnvironment(values),
      logDescriptor: log.descriptor,
    });
  } finally {
    closeSync(log.descriptor);
  }
  patchState(paths, {
    web: { pid: child.pid, port: web.port, startedAt: new Date().toISOString(), log: log.path },
  });
  const served = await waitFor(async () => {
    if (!processMatches(child.pid, WEB_NEEDLE)) {
      return { ok: false, detail: `프로세스가 종료됨. 로그 끝부분:\n${tailLog(log.path, { secrets })}` };
    }
    const response = await httpProbe(`${web.origin}/`, { timeoutMs: 5_000 });
    return response?.status === 200;
  }, { timeoutMs: 180_000, intervalMs: 1_000, describe: "웹 /" });
  if (!served.ok) throw new Error(`${served.detail}\n(로그: ${log.path})`);
  // 프록시가 로컬 API 를 가리키는지 실제 요청으로 확인한다.
  const proxied = await waitFor(async () => {
    const response = await httpProbe(`${web.origin}/api/health/live`, { timeoutMs: 8_000 });
    return response?.status === 200 && response.json?.status === "ok";
  }, { timeoutMs: 60_000, intervalMs: 1_000, describe: `웹 프록시 /api/health/live → ${api.origin}` });
  if (!proxied.ok) throw new Error(`${proxied.detail}\n(로그: ${log.path})`);
  return { reused: false, pid: child.pid, port: web.port, logPath: log.path };
}

export async function stopWeb({ state }) {
  const pid = state?.web?.pid;
  if (!pid) return "not-running";
  return terminateProcess(pid, { needle: WEB_NEEDLE, group: true, graceMs: 10_000 });
}
