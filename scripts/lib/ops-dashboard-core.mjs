/**
 * 크로스-LLM 통합 운영 상태판 핵심 수집·진단·포맷 모듈.
 *
 * - 외부 호출(fetch, exec)은 모두 주입 가능하며 타임아웃·부분 실패 내성을 갖춘다.
 * - .env.infrastructure.local 값은 절대 노출하지 않고 존재 여부(boolean)만 반환하며,
 *   sk-, postgres://, Bearer 등 민감 문자열을 출력 전 전수 제거한다.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GITHUB_REPO_SLUG,
  ONPOD_CANONICAL_APP,
  ONPOD_CANONICAL_ORIGIN,
  redactSensitiveText,
} from "./deploy-auth-env.mjs";
import {
  SHA40_PATTERN,
  checkMigrationManifestDrift,
  inspectInfrastructureEnvPresence,
  validateBuildMetaSha,
  validateStandingApproval,
} from "./deploy-preflight-drift.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = resolve(dirname(MODULE_PATH), "../..");
export const OPS_DASHBOARD_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_WEB_URL = "https://www.toonstudio.cloud";
export const DEFAULT_API_URL = ONPOD_CANONICAL_ORIGIN;
export const DEFAULT_REPO_SLUG = GITHUB_REPO_SLUG;
export const DEFAULT_TIMEOUT_MS = 2_200;
const DEFAULT_GIT_MIN_TIMEOUT_MS = 5_000;

const MAX_JSON_BODY_BYTES = 65_536;
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const REQUIRED_CI_JOBS = Object.freeze(["core", "verify"]);
const RETIRED_STANDING_SCOPES = new Set(["render-core-api-image-deploy"]);
const RETIRED_HOST_SUFFIXES = Object.freeze(["onrender.com", "vercel.app", "neon.tech"]);
const ACCEPTED_COEP_VALUES = new Set(["credentialless", "require-corp"]);
const MIGRATION_ENTRY_PATTERN = /^(\d{4})_([a-z0-9_]+)$/u;
const FORBIDDEN_RECOMMENDED_COMMAND_PATTERN =
  /(?:\bonpod\s+app\s+rollback\b|--attach-db\b|--no-verify\b|--force\b)/iu;

export const ACTIVE_INFRASTRUCTURE = Object.freeze({
  web: Object.freeze({
    id: "cloudflare-static", provider: "Cloudflare Static", resource: "toonspectrum-web",
    url: DEFAULT_WEB_URL, region: "Global Edge", tier: "free", status: "current",
    notes: "Static Assets + Worker 게이트웨이 + R2(toonspectrum-public-assets)",
  }),
  api: Object.freeze({
    id: "seoul-onpod-api", provider: "Seoul onpod", resource: ONPOD_CANONICAL_APP,
    url: DEFAULT_API_URL, region: "Seoul", tier: "free", status: "current",
    notes: "단일 팟(cpu_micro), 30분 무요청 시 절전, 상시 승인 범위 밖(명시 승인 필요)",
  }),
  database: Object.freeze({
    id: "seoul-onpod-db", provider: "Seoul onpod", resource: "toonstudio-db",
    engine: "PostgreSQL 17", region: "Seoul", tier: "dev", status: "current",
    notes: "단일 소유자 역할(single-owner), 공개 5432 IP 허용목록 기본 차단",
  }),
  auxiliary: Object.freeze([
    Object.freeze({ id: "cloudflare-realtime", provider: "Cloudflare Worker + Durable Objects", resource: "realtime.toonstudio.cloud", url: "https://realtime.toonstudio.cloud", tier: "free", status: "current" }),
    Object.freeze({ id: "cloudflare-analytics", provider: "Cloudflare Worker + D1", resource: "toonspectrum-analytics", tier: "free", status: "current" }),
    Object.freeze({ id: "cloudflare-apex-redirect", provider: "Cloudflare Worker", resource: "toonstudio.cloud", url: "https://toonstudio.cloud", tier: "free", status: "current" }),
  ]),
});

export const RETIRED_INFRASTRUCTURE = Object.freeze([
  Object.freeze({ id: "vercel", status: "retired", retiredAt: null, reason: "런타임·설정·배포 워크플로 전면 퇴역, 재도입 금지" }),
  Object.freeze({ id: "render", status: "retired", retiredAt: "2026-10-23", reason: "toonspectrum-core-api 및 검증 정적 사이트 삭제 완료" }),
  Object.freeze({ id: "supabase", status: "retired", retiredAt: null, reason: "미사용(SUPABASE_OBJECT_STORAGE_ENABLED=false), 삭제는 소유자 직접 수행" }),
  Object.freeze({ id: "neon", status: "retired", retiredAt: "2026-10-22", reason: "소유자 삭제 완료, 복구 금지" }),
]);

export const FORBIDDEN_OPERATIONS = Object.freeze([
  Object.freeze({ command: "onpod app deploy --attach-db", severity: "critical", reason: "DB 비밀번호 강제 회전 및 기존 연결 중단 유발(이미지 교체는 onpod app update --image 사용)" }),
  Object.freeze({ command: "onpod app rollback", severity: "critical", reason: "직전 이미지·환경변수 세대 동시 복구로 드리프트 위험(이미지 지정 교체만 허용)" }),
  Object.freeze({ command: "onpod app update --env / --env-file", severity: "high", reason: "전체 환경변수를 덮어씀(단건 변경은 onpod app env set 사용)" }),
  Object.freeze({ command: "단기 유효 토큰 무단 변경·재발급", severity: "high", reason: "기존 provider secret 우선 재사용 및 .env.infrastructure.local 값 출력 금지" }),
  Object.freeze({ command: "git push --force / --no-verify", severity: "high", reason: "공유 브랜치 이력 파괴 및 검증 게이트 우회 금지" }),
]);

/** 민감 문자열(API 키, DB DSN, Bearer 토큰, onpod/GitHub 토큰)이 출력이나 JSON에 남지 않도록 완전히 치환한다. */
export function sanitizeOpsText(raw) {
  if (typeof raw !== "string" || !raw) return "";
  const scrubbed = raw
    .replace(/(?:postgres(?:ql)?|mysql|redis|rediss|mongodb(?:\+srv)?):\/\/[^\s"'<>)]+/giu, "<masked-dsn>")
    .replace(/\bsk-[A-Za-z0-9_-]{3,}/gu, "<masked-api-key>")
    .replace(/\bBearer\s+[^\s"'<>)]+/giu, "<masked-auth>")
    .replace(/\bopk?_[A-Za-z0-9_-]{4,}/gu, "<masked-onpod-token>")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{4,}/gu, "<masked-gh-token>")
    .replace(/\b1\/\/[A-Za-z0-9_-]{12,}/gu, "<masked-oauth-token>");
  return redactSensitiveText(scrubbed);
}

/** 객체·배열 내부의 모든 문자열을 재귀적으로 정제한다. */
export function sanitizeOpsValue(value) {
  if (typeof value === "string") return sanitizeOpsText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeOpsValue(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = sanitizeOpsValue(entry);
    return out;
  }
  return value;
}

export function validateHttpsOrigin(raw, label) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error(`${label} 값이 비어 있습니다. HTTPS 원점 주소를 지정하세요.`);
  let parsed;
  try { parsed = new URL(raw.trim()); } catch { throw new Error(`${label} 값이 유효한 URL 형식이 아닙니다.`); }
  if (
    parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== ""
    || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
  ) {
    throw new Error(`${label}은 자격증명·경로·쿼리·해시가 없는 HTTPS 원점(예: ${DEFAULT_WEB_URL})이어야 합니다.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (RETIRED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new Error(`${label}에 퇴역 호스트(${host})를 지정할 수 없습니다.`);
  }
  return parsed.origin;
}

export function buildExecEnv(baseEnv = process.env) {
  const existing = (baseEnv.PATH ?? "").split(delimiter).filter(Boolean);
  const merged = [dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", ...existing].filter(
    (entry, index, list) => list.indexOf(entry) === index,
  );
  return { ...baseEnv, PATH: merged.join(delimiter) };
}

export function defaultExecImpl(command, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      command, args,
      { cwd, env, encoding: "utf8", timeout: timeoutMs, killSignal: "SIGTERM", maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const wrapped = new Error(sanitizeOpsText(error.message || `${command} 실행 실패`));
          wrapped.code = error.code ?? null;
          wrapped.killed = Boolean(error.killed);
          wrapped.stderr = sanitizeOpsText(typeof stderr === "string" ? stderr : "");
          rejectPromise(wrapped);
          return;
        }
        resolvePromise({ stdout: typeof stdout === "string" ? stdout : "", stderr: typeof stderr === "string" ? stderr : "" });
      },
    );
  });
}

async function invokeExec(execImpl, command, args, options) {
  const result = await execImpl(command, args, options);
  if (typeof result === "string") return result;
  return result && typeof result === "object" && typeof result.stdout === "string" ? result.stdout : "";
}

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const lower = name.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === lower);
  return typeof match?.[1] === "string" ? match[1] : null;
}

async function cancelBodySafely(response) {
  try { await response?.body?.cancel?.(); } catch { /* 본문 정리 오류 무시 */ }
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("REQUEST_TIMEOUT");
      error.code = "REQUEST_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { ...init, signal: controller.signal })),
      timeoutPromise,
    ]);
    return { response, controller };
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedJson(response, signal) {
  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    let complete = false;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      while (!complete) {
        if (signal?.aborted) return { ok: false, errorCode: "REQUEST_TIMEOUT" };
        const { done, value } = await reader.read();
        complete = done;
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : Buffer.from(value);
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_JSON_BODY_BYTES) return { ok: false, errorCode: "RESPONSE_TOO_LARGE" };
        chunks.push(chunk);
      }
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (!complete) cancel();
      reader.releaseLock();
    }
    try { return { ok: true, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) }; }
    catch { return { ok: false, errorCode: "INVALID_JSON" }; }
  }
  if (typeof response?.text === "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BODY_BYTES) return { ok: false, errorCode: "RESPONSE_TOO_LARGE" };
    try { return { ok: true, value: JSON.parse(raw) }; } catch { return { ok: false, errorCode: "INVALID_JSON" }; }
  }
  if (typeof response?.json === "function") {
    try { return { ok: true, value: await response.json() }; } catch { return { ok: false, errorCode: "INVALID_JSON" }; }
  }
  return { ok: false, errorCode: "INVALID_JSON" };
}

/** Git 저장소 브랜치, HEAD SHA, origin/main SHA, 워킹트리 청결 여부를 수집한다. */
export async function collectGitStatus({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  execImpl = defaultExecImpl,
  execEnv = buildExecEnv(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  gitTimeoutMs = Math.max(timeoutMs, DEFAULT_GIT_MIN_TIMEOUT_MS),
} = {}) {
  const execOpts = { cwd: rootDir, env: execEnv, timeoutMs: gitTimeoutMs };
  const [branchRes, headRes, originMainRes, porcelainRes] = await Promise.allSettled([
    invokeExec(execImpl, "git", ["rev-parse", "--abbrev-ref", "HEAD"], execOpts),
    invokeExec(execImpl, "git", ["rev-parse", "HEAD"], execOpts),
    invokeExec(execImpl, "git", ["rev-parse", "origin/main"], execOpts),
    invokeExec(execImpl, "git", ["status", "--porcelain=v1"], execOpts),
  ]);

  const issues = [];
  let branch = null;
  let detachedHead = false;
  if (branchRes.status === "fulfilled") {
    const raw = branchRes.value.trim();
    detachedHead = raw === "HEAD";
    branch = detachedHead ? "HEAD (detached)" : (raw || null);
  } else {
    issues.push(`현재 브랜치 조회 실패: ${sanitizeOpsText(branchRes.reason?.message || "git 오류")}`);
  }

  const parseSha = (res, label) => {
    if (res.status !== "fulfilled") {
      issues.push(`${label} 조회 실패: ${sanitizeOpsText(res.reason?.message || "git 오류")}`);
      return null;
    }
    const sha = res.value.trim().toLowerCase();
    if (SHA40_PATTERN.test(sha)) return sha;
    issues.push(`${label} 형식이 40자리 16진수가 아닙니다.`);
    return null;
  };
  const headSha = parseSha(headRes, "HEAD SHA");
  const originMainSha = parseSha(originMainRes, "origin/main");

  let clean = null;
  let dirtyCount = null;
  const counts = { staged: 0, unstaged: 0, untracked: 0 };
  if (porcelainRes.status === "fulfilled") {
    const lines = porcelainRes.value.split(/\r?\n/u).filter(Boolean);
    dirtyCount = lines.length;
    clean = dirtyCount === 0;
    for (const line of lines) {
      const code = line.slice(0, 2);
      if (code === "??") counts.untracked += 1;
      else {
        if (code[0] && code[0] !== " ") counts.staged += 1;
        if (code[1] && code[1] !== " ") counts.unstaged += 1;
      }
    }
  } else {
    issues.push(`워킹트리 상태 조회 실패: ${sanitizeOpsText(porcelainRes.reason?.message || "git 오류")}`);
  }

  return {
    ok: Boolean(headSha && clean !== null),
    branch, detachedHead, headSha,
    headShortSha: headSha ? headSha.slice(0, 10) : null,
    originMainSha,
    originMainShortSha: originMainSha ? originMainSha.slice(0, 10) : null,
    headMatchesOriginMain: Boolean(headSha && originMainSha && headSha === originMainSha),
    clean, dirtyCount, counts, issues,
  };
}

/** DB 마이그레이션 원장 개수·최신 번호·드리프트 여부를 점검한다. */
export function collectMigrationStatus({ rootDir = DEFAULT_REPOSITORY_ROOT } = {}) {
  const manifestRel = "scripts/production-database-migrations.manifest";
  const manifestPath = join(rootDir, manifestRel);
  const base = {
    ok: false, manifestPath: manifestRel, totalCount: 0, diskCount: 0,
    latestNumber: null, latestName: null, latestPath: null,
    missingFilesCount: 0, unregisteredFilesCount: 0, issues: [],
  };
  try {
    const drift = checkMigrationManifestDrift({ rootDir });
    let latestPath = null;
    let latestName = null;
    let latestNumber = null;
    if (existsSync(manifestPath)) {
      const entries = readFileSync(manifestPath, "utf8").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
      if (entries.length > 0) {
        latestPath = entries[entries.length - 1];
        latestName = basename(latestPath, ".sql");
        latestNumber = MIGRATION_ENTRY_PATTERN.exec(latestName)?.[1] ?? null;
      }
    }
    return {
      ...base, ok: drift.ok, totalCount: drift.manifestCount, diskCount: drift.diskCount,
      latestNumber, latestName, latestPath,
      missingFilesCount: drift.missingFiles.length, unregisteredFilesCount: drift.unregisteredFiles.length,
      issues: drift.issues.map(sanitizeOpsText),
    };
  } catch (error) {
    return { ...base, issues: [`DB 마이그레이션 원장 점검 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "읽기 오류")}`] };
  }
}

/** .env.infrastructure.local 키 존재 여부만 boolean으로 요약한다(값·길이·해시 비노출). */
export function collectLocalEnvPresenceSummary({ rootDir = DEFAULT_REPOSITORY_ROOT } = {}) {
  try {
    const r = inspectInfrastructureEnvPresence({ rootDir });
    return {
      envFile: r.envFile, fileExists: Boolean(r.fileExists), permissionsSafe: r.permissionsSafe,
      requiredKeysSatisfied: Boolean(r.ok), totalKeyCount: r.totalKeyCount, onpodApiEnvKeyCount: r.onpodApiEnvKeyCount,
      missingRequiredCount: r.missingRequiredKeys.length, placeholderRequiredCount: r.placeholderRequiredKeys.length,
      missingRequiredKeys: [...r.missingRequiredKeys], placeholderRequiredKeys: [...r.placeholderRequiredKeys],
      keyPresence: r.keys.map((e) => ({ key: e.key, required: Boolean(e.required), present: Boolean(e.present) })),
      warnings: r.warnings.map(sanitizeOpsText),
    };
  } catch {
    return {
      envFile: ".env.infrastructure.local", fileExists: false, permissionsSafe: null, requiredKeysSatisfied: false,
      totalKeyCount: 0, onpodApiEnvKeyCount: 0, missingRequiredCount: 0, placeholderRequiredCount: 0,
      missingRequiredKeys: [], placeholderRequiredKeys: [], keyPresence: [],
      warnings: [".env.infrastructure.local 존재 여부 확인 중 오류가 발생했습니다(값 미출력)."],
    };
  }
}

/** deploy/STANDING_APPROVAL.json 유효성 및 dist/.vite/build-meta.json SHA 일치를 점검한다. */
export function collectApprovalAndBuildMeta({ rootDir = DEFAULT_REPOSITORY_ROOT, originMainSha = null, headSha = null } = {}) {
  const raw = validateStandingApproval({ rootDir });
  const standingApproval = {
    ok: raw.ok, mode: raw.mode, grantedAt: raw.grantedAt, grantedBy: raw.grantedBy, scopes: raw.scopes,
    activeScopes: raw.scopes.filter((scope) => !RETIRED_STANDING_SCOPES.has(scope)),
    retiredScopesPresent: raw.scopes.filter((scope) => RETIRED_STANDING_SCOPES.has(scope)),
    staticApprovalValid: raw.staticApprovalValid, onpodRequiresExplicitApproval: true,
    issues: raw.issues.map(sanitizeOpsText),
  };

  const expectedSha = originMainSha || headSha || null;
  if (!existsSync(join(rootDir, "dist/.vite/build-meta.json"))) {
    return {
      standingApproval,
      buildMeta: {
        exists: false, ok: false, status: "missing", expectedSha, actualSha: null, buildId: null,
        catalogSource: null, matchesOriginMain: false, matchesHead: false,
        issues: ["dist/.vite/build-meta.json 없음 (로컬 정적 빌드 미생성 또는 클라우드 빌드 전용 환경)"],
      },
    };
  }

  const v = validateBuildMetaSha({ rootDir, expectedSha: expectedSha ?? "0".repeat(40) });
  const ok = Boolean(expectedSha) && v.ok;
  return {
    standingApproval,
    buildMeta: {
      exists: true, ok, status: !v.actualSha ? "invalid" : ok ? "matched" : "mismatch",
      expectedSha, actualSha: v.actualSha, buildId: v.buildId, catalogSource: v.catalogSource,
      matchesOriginMain: Boolean(originMainSha && v.actualSha && v.actualSha === originMainSha),
      matchesHead: Boolean(headSha && v.actualSha && v.actualSha === headSha),
      issues: v.issues.map(sanitizeOpsText),
    },
  };
}

async function probeEndpoint({ id, kind, url, path, expectedStatus = null, requireCoopCoep = false, fetchImpl, timeoutMs }) {
  const started = performance.now();
  const base = kind === "api"
    ? { id, kind, url, path, ok: false, httpStatus: null, latencyMs: 0, expectedHealthStatus: expectedStatus, actualHealthStatus: null, errorCode: null, message: "" }
    : { id, kind, url, path, ok: false, httpStatus: null, latencyMs: 0, requireCoopCoep, coop: null, coep: null, coopCoepOk: false, errorCode: null, message: "" };
  const accept = kind === "api" ? "application/json" : "text/html,application/xhtml+xml,*/*;q=0.8";
  let controller = null;
  try {
    const fetched = await fetchWithTimeout(
      fetchImpl, url,
      { method: "GET", redirect: "manual", headers: { accept, "user-agent": "toonstudio-ops-dashboard/1" } },
      timeoutMs,
    );
    controller = fetched.controller;
    const { response } = fetched;
    const latencyMs = Math.round(performance.now() - started);
    if (!Number.isInteger(response?.status)) {
      return { ...base, latencyMs, errorCode: "INVALID_RESPONSE", message: `${path} HTTP 응답 형식이 올바르지 않습니다.` };
    }

    const coop = kind === "web" ? (getHeader(response.headers, "cross-origin-opener-policy")?.trim().toLowerCase() || null) : null;
    const coep = kind === "web" ? (getHeader(response.headers, "cross-origin-embedder-policy")?.trim().toLowerCase() || null) : null;
    const coopCoepOk = kind === "web" && coop === "same-origin" && Boolean(coep && ACCEPTED_COEP_VALUES.has(coep));
    const meta = kind === "web" ? { httpStatus: response.status, latencyMs, coop, coep, coopCoepOk } : { httpStatus: response.status, latencyMs };

    if (kind === "web" || response.status !== 200 || getHeader(response.headers, "x-vercel-id") !== null) {
      await cancelBodySafely(response);
    }
    if (getHeader(response.headers, "x-vercel-id") !== null) {
      return { ...base, ...meta, errorCode: "RETIRED_VERCEL_ORIGIN", message: `${path} 응답에 퇴역 Vercel 헤더(x-vercel-id)가 감지되었습니다.` };
    }
    if (response.status !== 200) {
      return { ...base, ...meta, errorCode: `HTTP_${response.status}`, message: `${path} HTTP ${response.status} 응답(기대 200)` };
    }

    if (kind === "api") {
      const parsed = await readBoundedJson(response, controller.signal);
      if (!parsed.ok) return { ...base, ...meta, errorCode: parsed.errorCode, message: `${path} JSON 파싱 실패(${parsed.errorCode})` };
      const body = parsed.value;
      const actual = body && typeof body === "object" && !Array.isArray(body) && typeof body.status === "string" ? sanitizeOpsText(body.status) : null;
      if (actual !== expectedStatus) {
        return { ...base, ...meta, actualHealthStatus: actual, errorCode: "UNEXPECTED_HEALTH_PAYLOAD", message: `${path} status 불일치(기대=${expectedStatus}, 실제=${actual ?? "없음"})` };
      }
      return { ...base, ...meta, ok: true, actualHealthStatus: actual, message: `${path} HTTP 200 (status=${actual})` };
    }

    if (requireCoopCoep && !coopCoepOk) {
      return { ...base, ...meta, errorCode: "COOP_COEP_HEADER_MISMATCH", message: `${path} COOP/COEP 헤더 불일치(COOP=${coop ?? "없음"}, COEP=${coep ?? "없음"})` };
    }
    const headerNote = coop || coep ? ` (COOP=${coop ?? "없음"}, COEP=${coep ?? "없음"})` : "";
    return { ...base, ...meta, ok: true, message: `${path} HTTP 200${headerNote}` };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const isTimeout = error?.code === "REQUEST_TIMEOUT" || error?.name === "AbortError";
    return {
      ...base, latencyMs,
      errorCode: isTimeout ? "REQUEST_TIMEOUT" : "REQUEST_FAILED",
      message: isTimeout ? `${path} 시간 초과(${timeoutMs}ms)` : `${path} 요청 실패(원문 비노출)`,
    };
  } finally {
    controller?.abort();
  }
}

/** Core API(/api/health/live, /api/health/ready)와 운영 웹(https://www.toonstudio.cloud, /studio)을 병렬 점검한다. */
export async function collectLiveHealth({
  webUrl = DEFAULT_WEB_URL,
  apiUrl = DEFAULT_API_URL,
  offline = false,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedWebUrl = validateHttpsOrigin(webUrl, "--web-url");
  const normalizedApiUrl = validateHttpsOrigin(apiUrl, "--api-url");
  const emptyHeaders = { webRoot: { coop: null, coep: null }, webStudio: { coop: null, coep: null, isolated: false } };

  if (offline) {
    return { skipped: true, reason: "offline", status: "skipped", ok: null, webUrl: normalizedWebUrl, apiUrl: normalizedApiUrl, summary: { total: 4, passed: 0, failed: 0 }, headers: emptyHeaders, checks: [] };
  }
  if (typeof fetchImpl !== "function") {
    return { skipped: false, reason: "fetch-unavailable", status: "down", ok: false, webUrl: normalizedWebUrl, apiUrl: normalizedApiUrl, summary: { total: 4, passed: 0, failed: 4 }, headers: emptyHeaders, checks: [] };
  }

  const checks = await Promise.all([
    probeEndpoint({ id: "apiLive", kind: "api", url: `${normalizedApiUrl}/api/health/live`, path: "/api/health/live", expectedStatus: "ok", fetchImpl, timeoutMs }),
    probeEndpoint({ id: "apiReady", kind: "api", url: `${normalizedApiUrl}/api/health/ready`, path: "/api/health/ready", expectedStatus: "ready", fetchImpl, timeoutMs }),
    probeEndpoint({ id: "webRoot", kind: "web", url: normalizedWebUrl, path: "/", requireCoopCoep: false, fetchImpl, timeoutMs }),
    probeEndpoint({ id: "webStudio", kind: "web", url: `${normalizedWebUrl}/studio`, path: "/studio", requireCoopCoep: true, fetchImpl, timeoutMs }),
  ]);

  const passed = checks.filter((entry) => entry.ok).length;
  const failed = checks.length - passed;
  const webRoot = checks.find((entry) => entry.id === "webRoot");
  const webStudio = checks.find((entry) => entry.id === "webStudio");
  return {
    skipped: false, reason: null,
    status: failed === 0 ? "healthy" : passed === 0 ? "down" : "degraded",
    ok: failed === 0, webUrl: normalizedWebUrl, apiUrl: normalizedApiUrl,
    summary: { total: checks.length, passed, failed },
    headers: {
      webRoot: { coop: webRoot?.coop ?? null, coep: webRoot?.coep ?? null },
      webStudio: { coop: webStudio?.coop ?? null, coep: webStudio?.coep ?? null, isolated: Boolean(webStudio?.coopCoepOk) },
    },
    checks,
  };
}

function summarizeRecentRuns(rawRuns) {
  const runs = rawRuns.slice(0, 5).map((run) => ({
    id: Number.isSafeInteger(run?.id) ? run.id : null,
    runNumber: Number.isSafeInteger(run?.run_number) ? run.run_number : null,
    headBranch: typeof run?.head_branch === "string" ? run.head_branch : null,
    headSha: typeof run?.head_sha === "string" ? run.head_sha.slice(0, 12) : null,
    event: typeof run?.event === "string" ? run.event : null,
    status: typeof run?.status === "string" ? run.status : "unknown",
    conclusion: typeof run?.conclusion === "string" ? run.conclusion : null,
    createdAt: typeof run?.created_at === "string" ? run.created_at : null,
  }));
  const completed = runs.filter((r) => r.status === "completed").length;
  const success = runs.filter((r) => r.status === "completed" && r.conclusion === "success").length;
  const failure = runs.filter((r) => r.status === "completed" && ["failure", "timed_out", "startup_failure"].includes(r.conclusion ?? "")).length;
  const other = Math.max(0, completed - success - failure);
  const decisive = success + failure;
  return {
    total: runs.length, completed, success, failure, other, inProgress: runs.length - completed,
    successRatePct: decisive > 0 ? Math.round((success / decisive) * 100) : null,
    runs,
  };
}

function selectOriginMainRun(runs, originMainSha) {
  return runs
    .filter((r) => r?.head_sha === originMainSha && r?.head_branch === "main" && r?.event === "push" && (!r?.path || r.path === CI_WORKFLOW_PATH))
    .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0) || (b.run_attempt ?? 0) - (a.run_attempt ?? 0))[0] ?? null;
}

function isGhUnavailableError(error) {
  const text = `${error?.message ?? ""} ${error?.stderr ?? ""}`.toLowerCase();
  return String(error?.code ?? "") === "ENOENT" || text.includes("not logged") || text.includes("gh auth login") || text.includes("http 401");
}

/** gh CLI를 통해 최근 ci.yml 5회 성공률과 origin/main의 core/verify 게이트 상태를 조회한다. */
export async function collectGitHubCiStatus({
  rootDir = DEFAULT_REPOSITORY_ROOT, repoSlug = DEFAULT_REPO_SLUG, originMainSha = null,
  offline = false, execImpl = defaultExecImpl, execEnv = buildExecEnv(),
  timeoutMs = DEFAULT_TIMEOUT_MS, recentRunsPromise = null,
} = {}) {
  if (offline) {
    return { skipped: true, reason: "offline", available: null, status: "skipped", repoSlug, recent: null, originMain: null, issues: [] };
  }
  const execOpts = { cwd: rootDir, env: execEnv, timeoutMs };
  const issues = [];

  let recentRawRuns;
  try {
    const rawJson = await (recentRunsPromise ?? invokeExec(execImpl, "gh", ["api", `repos/${repoSlug}/actions/workflows/ci.yml/runs?per_page=5`], execOpts));
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed?.workflow_runs)) throw new Error("ci.yml workflow_runs 응답 형식이 올바르지 않습니다.");
    recentRawRuns = parsed.workflow_runs;
  } catch (error) {
    const unavailable = isGhUnavailableError(error);
    return {
      skipped: false, reason: unavailable ? "gh-unavailable" : "gh-error", available: !unavailable,
      status: unavailable ? "unavailable" : "degraded", repoSlug, recent: null, originMain: null,
      issues: [unavailable ? "gh CLI 미설치 또는 미인증 상태 — GitHub CI 조회를 건너뛰었습니다." : `GitHub CI 최근 실행 조회 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "조회 오류")}`],
    };
  }

  const recent = summarizeRecentRuns(recentRawRuns);
  if (!originMainSha || !SHA40_PATTERN.test(originMainSha)) {
    return { skipped: false, reason: null, available: true, status: "ok", repoSlug, recent, originMain: null, issues: ["origin/main SHA를 알 수 없어 main push 게이트 조회를 건너뛰었습니다."] };
  }

  let matchedRun = selectOriginMainRun(recentRawRuns, originMainSha);
  if (!matchedRun) {
    try {
      const shaJson = await invokeExec(execImpl, "gh", ["api", `repos/${repoSlug}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${originMainSha}&per_page=5`], execOpts);
      const parsedSha = JSON.parse(shaJson);
      if (Array.isArray(parsedSha?.workflow_runs)) matchedRun = selectOriginMainRun(parsedSha.workflow_runs, originMainSha);
    } catch (error) {
      issues.push(`origin/main CI 실행 조회 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "조회 오류")}`);
    }
  }

  const gates = { core: "missing", verify: "missing" };
  let originMain = {
    sha: originMainSha, runId: matchedRun?.id ?? null, runNumber: matchedRun?.run_number ?? null,
    runAttempt: matchedRun?.run_attempt ?? null,
    runStatus: matchedRun ? (matchedRun.conclusion ?? matchedRun.status ?? "missing") : "missing",
    gates, allGreen: false,
  };

  if (matchedRun && Number.isSafeInteger(matchedRun.id) && Number.isSafeInteger(matchedRun.run_attempt ?? 1)) {
    const attempt = matchedRun.run_attempt ?? 1;
    try {
      const jobsJson = await invokeExec(execImpl, "gh", ["api", `repos/${repoSlug}/actions/runs/${matchedRun.id}/attempts/${attempt}/jobs?per_page=100`], execOpts);
      const parsedJobs = JSON.parse(jobsJson);
      const jobs = Array.isArray(parsedJobs?.jobs) ? parsedJobs.jobs.filter((j) => j?.run_id === matchedRun.id && j?.head_sha === originMainSha) : [];
      for (const jobName of REQUIRED_CI_JOBS) {
        const matches = jobs.filter((j) => j?.name === jobName);
        if (matches.length === 1) gates[jobName] = matches[0].status === "completed" ? (matches[0].conclusion ?? "missing") : (matches[0].status ?? "missing");
        else if (matches.length > 1) gates[jobName] = "ambiguous";
      }
      const allGreen = matchedRun.status === "completed" && matchedRun.conclusion === "success"
        && REQUIRED_CI_JOBS.every((jobName) => gates[jobName] === "success");
      originMain = { ...originMain, runAttempt: attempt, gates, allGreen };
    } catch (error) {
      gates.core = "unknown";
      gates.verify = "unknown";
      issues.push(`origin/main CI 잡(core/verify) 조회 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "조회 오류")}`);
    }
  }

  const ciDegraded = issues.length > 0 || originMain.runStatus === "failure" || gates.core === "failure" || gates.verify === "failure";
  return { skipped: false, reason: null, available: true, status: ciDegraded ? "degraded" : "ok", repoSlug, recent, originMain, issues };
}

/** 현재 수집 상태를 기반으로 즉시 실행 가능한 안전한 다음 권장 명령을 생성한다. */
export function buildNextRecommendations({ offline, git, migrations, liveHealth, ci, standingApproval, buildMeta }) {
  const recommendations = [];
  const push = (priority, reason, command) => {
    if (FORBIDDEN_RECOMMENDED_COMMAND_PATTERN.test(command)) throw new Error("금지 명령이 권장 목록에 포함되어 생성을 중단했습니다.");
    if (!recommendations.some((item) => item.command === command)) recommendations.push({ priority, reason, command });
  };

  if (git.clean === false) push("high", `워킹트리에 미커밋 변경 ${git.dirtyCount}건이 있습니다.`, "git status --short --branch");
  if (!migrations.ok) push("high", "DB 마이그레이션 원장과 SQL 파일 간 드리프트가 감지되었습니다.", "node scripts/lib/deploy-preflight-drift.mjs");
  if (!standingApproval.ok) push("high", "deploy/STANDING_APPROVAL.json 검증 실패로 명시 승인 방식(fail-closed)으로 동작합니다.", "node scripts/lib/deploy-preflight-drift.mjs --scope cloudflare-static-production");
  if (!offline && liveHealth.ok === false) push("high", "라이브 헬스 점검에 실패 항목이 있습니다(절전 복귀 503 포함 시 재시도 스모크 권장).", "node scripts/verify-production-post-deploy-smoke.mjs --retries 4 --retry-delay-ms 3000");
  if (!offline && ci.available && ci.originMain && !ci.originMain.allGreen) push("medium", `origin/main 필수 CI(core=${ci.originMain.gates.core}, verify=${ci.originMain.gates.verify})가 아직 녹색이 아닙니다.`, "pnpm run deploy:cloud -- --status");
  if (buildMeta.exists && !buildMeta.matchesOriginMain) push("medium", "dist/.vite/build-meta.json의 gitSha가 origin/main과 다릅니다. 로컬 배포 전 재빌드하거나 클라우드 배포를 사용하세요.", "pnpm run build");
  else if (!buildMeta.exists) push("info", "로컬 dist/.vite/build-meta.json이 없습니다. 로컬 정적 빌드 없이 GitHub Actions 클라우드 배포를 바로 점검할 수 있습니다.", "pnpm run deploy:cloud -- --status");
  if (standingApproval.ok && (!ci.originMain || ci.originMain.allGreen)) push("info", "상시 승인 범위(Cloudflare 정적 웹·GHCR API 이미지)의 변경 단위 자동 선별 배포 실행", "pnpm run deploy:cloud -- --smart --watch");
  if (offline) push("info", "오프라인 모드입니다. 실시간 라이브 헬스 및 GitHub CI 확인은 온라인 모드로 실행하세요.", "node scripts/ops-dashboard.mjs");
  return recommendations;
}

function evaluateOverallStatus({ git, migrations, liveHealth, ci, standingApproval, buildMeta }) {
  const degradedReasons = [];
  if (!git.ok) degradedReasons.push("Git 저장소 상태 조회 실패");
  if (!migrations.ok) degradedReasons.push("DB 마이그레이션 원장 드리프트 감지");
  if (!standingApproval.ok) degradedReasons.push("상시 승인(STANDING_APPROVAL.json) 검증 실패");
  if (!liveHealth.skipped && liveHealth.ok === false) degradedReasons.push(`라이브 헬스 실패 (${liveHealth.summary.failed}/${liveHealth.summary.total})`);
  if (!ci.skipped && ci.status === "degraded") degradedReasons.push("GitHub CI 조회 오류 또는 origin/main 게이트 실패");
  if (buildMeta.exists && buildMeta.status === "mismatch") degradedReasons.push("dist/.vite/build-meta.json SHA가 origin/main과 불일치");
  return { overallStatus: degradedReasons.length === 0 ? "ok" : "degraded", degradedReasons };
}

/** 크로스-LLM 통합 운영 상태판 전체 스냅샷을 병렬 수집한다. */
export async function collectOpsDashboard({
  rootDir = DEFAULT_REPOSITORY_ROOT, webUrl = DEFAULT_WEB_URL, apiUrl = DEFAULT_API_URL,
  repoSlug = DEFAULT_REPO_SLUG, offline = false, timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch, execImpl = defaultExecImpl, execEnv = buildExecEnv(), now = () => new Date(),
} = {}) {
  const startedAt = performance.now();
  const normalizedWebUrl = validateHttpsOrigin(webUrl, "--web-url");
  const normalizedApiUrl = validateHttpsOrigin(apiUrl, "--api-url");
  const generatedAt = now().toISOString();

  const recentRunsPromise = offline
    ? null
    : invokeExec(execImpl, "gh", ["api", `repos/${repoSlug}/actions/workflows/ci.yml/runs?per_page=5`], { cwd: rootDir, env: execEnv, timeoutMs });
  recentRunsPromise?.catch(() => undefined);

  const gitPromise = collectGitStatus({ rootDir, execImpl, execEnv, timeoutMs });
  const liveHealthPromise = collectLiveHealth({ webUrl: normalizedWebUrl, apiUrl: normalizedApiUrl, offline, fetchImpl, timeoutMs });
  const migrations = collectMigrationStatus({ rootDir });
  const localEnv = collectLocalEnvPresenceSummary({ rootDir });
  const git = await gitPromise;

  const ciPromise = collectGitHubCiStatus({
    rootDir, repoSlug, originMainSha: git.originMainSha, offline, execImpl, execEnv, timeoutMs, recentRunsPromise,
  });
  const { standingApproval, buildMeta } = collectApprovalAndBuildMeta({
    rootDir, originMainSha: git.originMainSha, headSha: git.headSha,
  });

  const [liveHealth, ci] = await Promise.all([liveHealthPromise, ciPromise]);
  const recommendations = buildNextRecommendations({ offline, git, migrations, liveHealth, ci, standingApproval, buildMeta });
  const { overallStatus, degradedReasons } = evaluateOverallStatus({ git, migrations, liveHealth, ci, standingApproval, buildMeta });

  return sanitizeOpsValue({
    schemaVersion: OPS_DASHBOARD_SCHEMA_VERSION, generatedAt, mode: offline ? "offline" : "online",
    overallStatus, degradedReasons, durationMs: Math.round(performance.now() - startedAt),
    git,
    infrastructure: { active: ACTIVE_INFRASTRUCTURE, retired: RETIRED_INFRASTRUCTURE, forbiddenCommands: FORBIDDEN_OPERATIONS, localEnv },
    migrations, liveHealth, ci, standingApproval, buildMeta, recommendations,
  });
}

/** 상태판 JSON 리포트를 크로스-LLM 및 운영자 가독성이 높은 한글 텍스트 브리핑으로 포맷한다. */
export function formatOpsDashboardReport(report) {
  const { active, retired, forbiddenCommands, localEnv } = report.infrastructure;
  const lines = [
    `[ToonStudio 운영 상태판] 종합: ${report.overallStatus === "ok" ? "정상" : "주의(부분 장애·확인 필요)"} · 모드: ${report.mode === "offline" ? "오프라인(--offline)" : "온라인"} · 소요: ${report.durationMs}ms`,
    `생성 시각: ${report.generatedAt}`,
  ];
  if (report.degradedReasons.length > 0) lines.push(`주의 사유: ${report.degradedReasons.join(" / ")}`);

  lines.push(
    "", "1. Git / 저장소",
    `  - 브랜치: ${report.git.branch ?? "미확인"} · HEAD: ${report.git.headShortSha ?? "미확인"} · origin/main: ${report.git.originMainShortSha ?? "미확인"} (${report.git.headMatchesOriginMain ? "일치" : "불일치"})`,
    `  - 워킹트리: ${report.git.clean === null ? "미확인" : report.git.clean ? "청결(clean)" : `변경 ${report.git.dirtyCount}건 (staged=${report.git.counts.staged}, unstaged=${report.git.counts.unstaged}, untracked=${report.git.counts.untracked})`}`,
    "", "2. 인프라 (현역 / 퇴역 / 금지 명령)",
    `  - 현역 웹: ${active.web.provider} (${active.web.url}, ${active.web.resource})`,
    `  - 현역 API: ${active.api.provider} (${active.api.url}, ${active.api.resource})`,
    `  - 현역 DB: ${active.database.provider} ${active.database.resource} (${active.database.engine}, ${active.database.tier})`,
    `  - 퇴역 공급자: ${retired.map((entry) => `${entry.id}(퇴역)`).join(", ")}`,
    `  - 금지 명령: ${forbiddenCommands.map((entry) => entry.command).join(" | ")}`,
    `  - 로컬 시크릿 저장소(.env.infrastructure.local): 존재=${localEnv.fileExists ? "예" : "아니오"}, 필수키 충족=${localEnv.requiredKeysSatisfied ? "예" : "아니오"}, 총 ${localEnv.totalKeyCount}키(값 비노출)`,
    "", "3. DB 마이그레이션 원장",
    `  - 상태: ${report.migrations.ok ? "정상(드리프트 0)" : "드리프트 감지"} · 총 ${report.migrations.totalCount}건 (디스크 ${report.migrations.diskCount}건) · 최신: ${report.migrations.latestName ?? "미확인"}`,
    "", "4. 라이브 헬스",
  );

  if (report.liveHealth.skipped) {
    lines.push("  - 건너뜀 (--offline 모드)");
  } else {
    lines.push(`  - 종합: ${report.liveHealth.status} (${report.liveHealth.summary.passed}/${report.liveHealth.summary.total} 통과)`);
    for (const check of report.liveHealth.checks) lines.push(`  - [${check.ok ? "PASS" : "FAIL"}] ${check.message} (${check.latencyMs}ms)`);
  }

  lines.push("", "5. GitHub CI (ci.yml)");
  if (report.ci.skipped) {
    lines.push("  - 건너뜀 (--offline 모드)");
  } else if (!report.ci.available) {
    lines.push(`  - 미가용: ${report.ci.issues[0] ?? "gh CLI 사용 불가"}`);
  } else {
    const recent = report.ci.recent;
    const rate = recent?.successRatePct === null || recent?.successRatePct === undefined ? "집계 불가" : `${recent.successRatePct}%`;
    const otherNote = recent?.other ? `, 취소/기타=${recent.other}` : "";
    lines.push(`  - 최근 ${recent?.total ?? 0}회: 성공률 ${rate} (성공=${recent?.success ?? 0}, 실패=${recent?.failure ?? 0}${otherNote}, 진행중=${recent?.inProgress ?? 0})`);
    if (report.ci.originMain) {
      const om = report.ci.originMain;
      lines.push(`  - origin/main(${om.sha.slice(0, 10)}): ${om.runStatus} · core=${om.gates.core}, verify=${om.gates.verify} (${om.allGreen ? "배포 가능" : "대기/실패"})`);
    }
  }

  lines.push(
    "", "6. 상시 승인 & 빌드 메타",
    `  - STANDING_APPROVAL.json: ${report.standingApproval.ok ? "유효" : "무효(fail-closed)"} · 모드=${report.standingApproval.mode} · 현행 범위=${report.standingApproval.activeScopes.join(", ") || "없음"} (onpod는 명시 승인 필요)`,
    `  - dist/.vite/build-meta.json: 상태=${report.buildMeta.status} · origin/main 일치=${report.buildMeta.matchesOriginMain ? "예" : "아니오"} · actual=${report.buildMeta.actualSha ? report.buildMeta.actualSha.slice(0, 10) : "없음"}`,
    "", "7. 다음 권장 명령",
    ...report.recommendations.map((item) => `  - [${item.priority.toUpperCase()}] ${item.command} — ${item.reason}`),
  );
  return sanitizeOpsText(lines.join("\n"));
}
