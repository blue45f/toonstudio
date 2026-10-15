/**
 * 운영 보호 가드와 자식 프로세스 환경 구성.
 *
 * 이 하네스는 "내 컴퓨터의 loopback"만 대상으로 한다. 호스트가 127.0.0.1/localhost 가 아니면
 * DB 접속·자격증명 전송·프로세스 기동 전에 즉시 중단한다. 오류 메시지에는 URL 원문(자격증명 포함)을
 * 절대 싣지 않고 호스트 이름과 키 이름만 보고한다.
 */

export class GuardViolationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "GuardViolationError";
  }
}

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

// 운영·원격 서비스로 보이는 호스트를 더 친절하게 안내하기 위한 목록(차단 판정은 허용 목록으로만 한다).
const REMOTE_SERVICE_HOST_PATTERN =
  /(?:^|\.)(?:toonstudio\.cloud|supabase\.(?:co|com)|neon\.tech|onrender\.com|render\.com|vercel\.app|amazonaws\.com|rds\.[a-z0-9-]+\.amazonaws\.com|cloudflare\.com|workers\.dev)$/iu;

function describeHost(hostname) {
  return REMOTE_SERVICE_HOST_PATTERN.test(hostname)
    ? `운영·원격 서비스로 보이는 호스트(${hostname})`
    : `로컬이 아닌 호스트(${hostname || "비어 있음"})`;
}

/**
 * 로컬 PostgreSQL URL 만 허용한다.
 * - 호스트는 정확히 127.0.0.1 또는 localhost.
 * - libpq/node-postgres 가 호스트를 덮어쓸 수 있는 쿼리 파라미터(host, hostaddr, port, service 등)는 모두 거부.
 *   예외로 sslmode=disable 하나만 허용한다.
 * - strict=false 는 호스트·쿼리 규칙만 검사한다(호출 셸에 있는 다른 도구의 DB URL 처럼 포트·자격증명이 없을 수 있는 값용).
 * @returns {{ hostname: string, port: number, database: string, username: string, password: string }}
 */
export function assertLocalPostgresUrl(rawValue, label, { strict = true } = {}) {
  const text = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!text) {
    throw new GuardViolationError(`${label}: 값이 비어 있습니다.`);
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new GuardViolationError(`${label}: 올바른 URL 형식이 아닙니다(길이 ${text.length}, 값은 출력하지 않습니다).`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new GuardViolationError(`${label}: postgres:// 또는 postgresql:// URL 이어야 합니다.`);
  }
  const hostname = url.hostname.toLowerCase();
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new GuardViolationError(
      `${label}: ${describeHost(hostname)} 는 허용하지 않아 즉시 중단합니다. `
      + "이 하네스는 127.0.0.1/localhost 의 임베디드 PostgreSQL 에만 접속하며 운영 DB 에는 절대 접속하지 않습니다.",
    );
  }
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === "sslmode" && value.toLowerCase() === "disable") continue;
    throw new GuardViolationError(
      `${label}: 쿼리 파라미터 "${key}" 는 호스트·연결 방식을 바꿀 수 있어 허용하지 않습니다(sslmode=disable 만 허용).`,
    );
  }
  if (url.hash) {
    throw new GuardViolationError(`${label}: URL 조각(#)은 허용하지 않습니다.`);
  }
  const port = Number(url.port);
  const database = safeDecode(url.pathname.slice(1), label);
  const username = safeDecode(url.username, label);
  const password = safeDecode(url.password, label);
  if (strict) {
    if (!url.port || !Number.isInteger(port) || port < 1024 || port > 65_535) {
      throw new GuardViolationError(`${label}: 1024-65535 사이의 포트를 명시해야 합니다.`);
    }
    if (!database || database.includes("/")) {
      throw new GuardViolationError(`${label}: 데이터베이스 이름이 정확히 하나 필요합니다.`);
    }
    if (!username || !password) {
      throw new GuardViolationError(`${label}: 사용자와 비밀번호가 필요합니다.`);
    }
  }
  return { hostname, port, database, username, password };
}

/**
 * 호출 셸에 있을 수 있는 다른 도구의 DB 설정 변수. 이 하네스는 이 값들을 읽지도 자식에게 넘기지도 않지만,
 * 운영 자격증명이 들어 있는 셸에서 실행되는 일 자체를 막는다(DB 에 접속하거나 프로세스를 띄우는 명령에서 확인).
 */
export const FOREIGN_DATABASE_ENV_NAMES = Object.freeze([
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "PRODUCTION_DATABASE_DIRECT_URL",
  "TEST_DATABASE_URL",
  "STUDIO_LIVE_POSTGRES_URL",
  "STUDIO_LIVE_POSTGRES_INTEGRATION_URL",
  "STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL",
]);

/** FOREIGN_DATABASE_ENV_NAMES 중 값이 있는 변수가 로컬이 아닌 호스트를 가리키면 GuardViolationError. */
export function assertEnvironmentSafe(environment = process.env) {
  for (const name of FOREIGN_DATABASE_ENV_NAMES) {
    const value = environment[name];
    if (typeof value !== "string" || value.trim() === "") continue;
    try {
      assertLocalPostgresUrl(value, name, { strict: false });
    } catch (error) {
      if (error instanceof GuardViolationError) {
        throw new GuardViolationError(
          `${error.message} 이 하네스는 ${name} 를 사용하지 않지만, 운영 자격증명이 들어 있을 수 있는 셸에서는 실행하지 않습니다. `
          + `'unset ${name}' 후 다시 실행하세요.`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

function safeDecode(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new GuardViolationError(`${label}: 퍼센트 인코딩이 올바르지 않습니다(값은 출력하지 않습니다).`);
  }
}

/**
 * 로컬 HTTP origin 만 허용한다(스모크가 로그인 자격증명을 보내는 대상이므로 특히 중요하다).
 * @returns {{ origin: string, hostname: string, port: number }}
 */
export function assertLocalOrigin(rawValue, label) {
  const text = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!text) {
    throw new GuardViolationError(`${label}: 값이 비어 있습니다.`);
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new GuardViolationError(`${label}: 올바른 URL 형식이 아닙니다(길이 ${text.length}).`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:") {
    throw new GuardViolationError(`${label}: 로컬 하네스는 http:// origin 만 사용합니다.`);
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new GuardViolationError(
      `${label}: ${describeHost(hostname)} 에는 로그인 자격증명을 보내지 않으므로 즉시 중단합니다.`,
    );
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new GuardViolationError(`${label}: origin 은 scheme://host:port 형태여야 합니다.`);
  }
  const port = Number(url.port);
  if (!url.port || !Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new GuardViolationError(`${label}: 1024-65535 사이의 포트를 명시해야 합니다.`);
  }
  return { origin: `http://${hostname}:${port}`, hostname, port };
}

// ── 자식 프로세스 환경 ────────────────────────────────────────────────

const BASE_ENV_KEYS = Object.freeze([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TZ",
  "TMPDIR",
  "TERM",
]);

const TOOLCHAIN_ENV_KEYS = Object.freeze([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "CURL_CA_BUNDLE",
  "PNPM_HOME",
  "COREPACK_HOME",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
]);

const NPM_CONFIG_PATTERN = /^npm_config_/iu;
const NPM_CONFIG_SECRET_PATTERN = /(?:auth|token|password|secret|_key|cert(?!file))/iu;

const LOOPBACK_NO_PROXY = "127.0.0.1,localhost,::1";

function withLoopbackNoProxy(existing) {
  const entries = new Set(
    String(existing ?? "").split(",").map((entry) => entry.trim()).filter(Boolean),
  );
  for (const entry of LOOPBACK_NO_PROXY.split(",")) entries.add(entry);
  return [...entries].join(",");
}

/**
 * 자식 프로세스에 넘길 환경을 "허용 목록"으로 만든다.
 * 호출한 셸에 운영 DATABASE_URL·클라우드 토큰·GitHub 토큰 등이 있어도 API/웹/마이그레이션 프로세스로
 * 새지 않게 하고, 로컬용 값은 `extra` 로만 주입한다.
 *
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.base]
 * @param {Record<string, string>} [options.extra] 마지막에 덮어쓰는 명시 값
 * @param {boolean} [options.toolchain] npm 설치처럼 프록시·CA 설정이 필요한 도구용 허용 목록 포함
 * @param {readonly string[]} [options.passthrough] 추가로 통과시킬 변수 이름(접두어 `PLAYWRIGHT_*` 가능)
 * @param {boolean} [options.noColor] 로그에 색 코드가 섞이지 않도록 NO_COLOR 를 설정(기본 true).
 *        Playwright 는 워커에 FORCE_COLOR 를 설정해 Node 경고가 나므로 e2e 에서는 끈다.
 */
export function buildChildEnv({
  base = process.env,
  extra = {},
  toolchain = false,
  passthrough = [],
  noColor = true,
} = {}) {
  const environment = {};
  const allowed = new Set([...BASE_ENV_KEYS, ...(toolchain ? TOOLCHAIN_ENV_KEYS : []), ...passthrough]);
  for (const [key, value] of Object.entries(base)) {
    if (typeof value !== "string") continue;
    if (allowed.has(key)) {
      environment[key] = value;
      continue;
    }
    if (toolchain && NPM_CONFIG_PATTERN.test(key) && !NPM_CONFIG_SECRET_PATTERN.test(key)) {
      environment[key] = value;
      continue;
    }
    if (passthrough.some((entry) => entry.endsWith("*") && key.startsWith(entry.slice(0, -1)))) {
      environment[key] = value;
    }
  }
  environment.NO_PROXY = withLoopbackNoProxy(environment.NO_PROXY ?? base.NO_PROXY ?? base.no_proxy);
  environment.no_proxy = environment.NO_PROXY;
  if (noColor) environment.NO_COLOR = "1";
  return { ...environment, ...extra };
}

// ── 비밀값 마스킹 ────────────────────────────────────────────────────

const REDACTED = "[REDACTED]";

/** 알려진 비밀값(원문·URL 인코딩)과 postgres URL 자격증명을 가린다. */
export function redactSecrets(value, secrets = []) {
  let text = String(value ?? "");
  const candidates = new Set();
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 6) continue;
    candidates.add(secret);
    candidates.add(encodeURIComponent(secret));
  }
  for (const secret of [...candidates].sort((left, right) => right.length - left.length)) {
    text = text.split(secret).join(REDACTED);
  }
  return text.replace(/\b(postgres(?:ql)?:\/\/)[^\s/@]*@/giu, `$1${REDACTED}@`);
}

/** 길이만 보고하기 위한 요약. 값은 포함하지 않는다. */
export function describeSecretLength(value) {
  return `길이 ${String(value ?? "").length}`;
}
