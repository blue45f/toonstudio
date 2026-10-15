#!/usr/bin/env node
/**
 * 로컬 풀스택 인증 스모크(API 수준).
 *
 *   node scripts/local-fullstack/smoke.mjs [--skip-web] [--no-ratelimit-probe] [--json]
 *
 * 헬스 → 익명 세션 → CSRF 경계 → 잘못된 비밀번호 거부 → 로그인(쿠키) → 세션이 시드 사용자 반환 →
 * 로그아웃 → 폐기된 쿠키 거부 → 레이트리밋(429) 응답 형태 → (웹이 떠 있으면) 프록시 경유 확인을
 * PASS/FAIL 표로 출력한다. 계정 이메일·비밀번호·사용자 ID·쿠키 값은 어디에도 출력하지 않는다.
 *
 * 로그인 자격증명을 보내는 대상이므로 API origin 이 loopback 이 아니면 요청 전에 중단한다.
 */

import { fileURLToPath } from "node:url";

import { ENV_KEYS, EXIT, SENSITIVE_ENV_KEYS, resolveStackDirectory, stackPaths } from "./lib/config.mjs";
import { collectSecretValues, loadHarnessValues } from "./lib/harness-env.mjs";
import { GuardViolationError, assertLocalOrigin, redactSecrets } from "./lib/guard.mjs";
import { readState } from "./lib/state.mjs";

export const SESSION_COOKIE_NAME = "toonstudio-auth-session";
const CSRF_HEADER = "x-toonstudio-csrf";
const GENERIC_LOGIN_ERROR = "이메일 또는 비밀번호를 확인해 주세요.";
const RATE_LIMIT_ERROR = "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
// TEST-NET-2(RFC 5737) 문서용 주소: 실제 클라이언트가 아니므로 레이트리밋 버킷을 격리하는 데만 쓴다.
const SYNTHETIC_IP_PREFIX = "198.51.100.";
const RATE_LIMIT_LOGIN_MAX_ATTEMPTS = 14;

// Nest 의 @Post 기본 응답 코드는 201 이다. 성공 판정은 200/201 모두 허용한다.
const isCreatedOrOk = (status) => status === 200 || status === 201;

function randomSyntheticIp(random) {
  return `${SYNTHETIC_IP_PREFIX}${1 + Math.floor(random() * 253)}`;
}

async function sendRequest(fetchImpl, method, url, { headers = {}, body, cookie, timeoutMs = 20_000 } = {}) {
  const requestHeaders = { ...headers };
  if (cookie) requestHeaders.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  const response = await fetchImpl(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 본문이 JSON 이 아니면 json 은 null.
  }
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return { status: response.status, json, text, setCookies };
}

export function findSessionCookie(setCookies) {
  for (const raw of setCookies) {
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator) === SESSION_COOKIE_NAME) {
      return {
        value: pair.slice(separator + 1),
        attributes: attributes.map((attribute) => attribute.toLowerCase()),
      };
    }
  }
  return null;
}

function describeJsonShape(json) {
  if (json === null || typeof json !== "object") return "JSON 아님";
  return `키 ${Object.keys(json).sort().join(",") || "(없음)"}`;
}

/**
 * @param {object} options
 * @param {Record<string, string>} options.values TOONSTUDIO_LOCAL_* 값(파일 또는 환경)
 * @param {{ api?: { trustedProxy?: boolean } }} [options.state]
 * @param {{ skipWeb?: boolean | string, ratelimitProbe?: boolean | "auto" }} [options.options] skipWeb 이 문자열이면 건너뛴 이유로 표에 쓴다
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.random]
 * @returns {Promise<Array<{ id: string, status: "PASS" | "FAIL" | "SKIP", title: string, detail: string }>>}
 */
export async function runAuthSmoke({
  values,
  state = {},
  options = {},
  fetchImpl = fetch,
  random = Math.random,
}) {
  const api = assertLocalOrigin(values[ENV_KEYS.apiOrigin], ENV_KEYS.apiOrigin);
  const web = values[ENV_KEYS.webOrigin] ? assertLocalOrigin(values[ENV_KEYS.webOrigin], ENV_KEYS.webOrigin) : null;
  const email = values[ENV_KEYS.testEmail];
  const password = values[ENV_KEYS.testPassword];
  const userId = values[ENV_KEYS.testUserId];
  if (!email || !password || !userId) {
    throw new Error(
      `${ENV_KEYS.testEmail}/${ENV_KEYS.testPassword}/${ENV_KEYS.testUserId} 가 필요합니다. 먼저 'node scripts/local-fullstack/cli.mjs up' 을 실행하세요.`,
    );
  }

  const rows = [];
  const record = (id, status, title, detail) => rows.push({ id, status, title, detail });
  const step = async (id, title, work) => {
    try {
      const outcome = await work();
      record(id, outcome.ok ? "PASS" : "FAIL", title, outcome.detail);
      return outcome;
    } catch (error) {
      record(id, "FAIL", title, `예외 ${error?.name ?? "Error"}: ${error?.cause?.code ?? error?.code ?? String(error?.message ?? "").slice(0, 80)}`);
      return { ok: false };
    }
  };
  const browserHeaders = (extra = {}) => ({
    origin: web?.origin ?? api.origin,
    [CSRF_HEADER]: "1",
    ...extra,
  });
  const syntheticIp = randomSyntheticIp(random);
  const isolatedHeaders = () => browserHeaders({ "x-forwarded-for": syntheticIp });
  let sessionCookie = null;

  await step("health.live", "API 생존 확인 GET /api/health/live", async () => {
    const response = await sendRequest(fetchImpl, "GET", `${api.origin}/api/health/live`);
    return { ok: response.status === 200 && response.json?.status === "ok", detail: `HTTP ${response.status}, ${describeJsonShape(response.json)}` };
  });

  await step("health.ready", "API 준비 확인 GET /api/health/ready (DB·스키마·ACL)", async () => {
    const response = await sendRequest(fetchImpl, "GET", `${api.origin}/api/health/ready`);
    return { ok: response.status === 200 && response.json?.status === "ready", detail: `HTTP ${response.status}, ${describeJsonShape(response.json)}` };
  });

  await step("providers.email", "이메일 가입 비활성 확인 GET /api/auth/providers", async () => {
    const response = await sendRequest(fetchImpl, "GET", `${api.origin}/api/auth/providers`);
    const email = response.json?.email;
    return {
      ok: response.status === 200 && typeof email === "object" && email !== null,
      detail: `HTTP ${response.status}, email.available=${String(email?.available)}${email?.reason ? `, reason=${String(email.reason)}` : ""}`,
    };
  });

  await step("session.anonymous", "익명 세션 GET /api/auth/session", async () => {
    const response = await sendRequest(fetchImpl, "GET", `${api.origin}/api/auth/session`);
    return {
      ok: response.status === 200 && response.json?.authenticated === false && response.json?.user === null,
      detail: `HTTP ${response.status}, authenticated=${String(response.json?.authenticated)}`,
    };
  });

  await step("csrf.guard", "CSRF 경계: 헤더·Origin 없는 로그인 POST 거부", async () => {
    const response = await sendRequest(fetchImpl, "POST", `${api.origin}/api/auth/login`, {
      headers: { "x-forwarded-for": syntheticIp },
      body: { email, password },
    });
    return {
      ok: response.status === 403 && findSessionCookie(response.setCookies) === null,
      detail: `HTTP ${response.status}(403 기대), 세션 쿠키 없음=${String(findSessionCookie(response.setCookies) === null)}`,
    };
  });

  await step("login.wrong-password", "잘못된 비밀번호 거부 POST /api/auth/login", async () => {
    const response = await sendRequest(fetchImpl, "POST", `${api.origin}/api/auth/login`, {
      headers: isolatedHeaders(),
      body: { email, password: `${password}-wrong` },
    });
    const noCookie = findSessionCookie(response.setCookies) === null;
    return {
      ok: response.status === 401 && response.json?.error === GENERIC_LOGIN_ERROR && noCookie,
      detail: `HTTP ${response.status}(401 기대), 일반화된 오류 문구=${String(response.json?.error === GENERIC_LOGIN_ERROR)}, 세션 쿠키 없음=${String(noCookie)}`,
    };
  });

  await step("login.success", "시드 계정 로그인 POST /api/auth/login", async () => {
    const response = await sendRequest(fetchImpl, "POST", `${api.origin}/api/auth/login`, {
      headers: isolatedHeaders(),
      body: { email, password },
    });
    sessionCookie = findSessionCookie(response.setCookies);
    const attributes = sessionCookie?.attributes ?? [];
    const hardened = attributes.includes("httponly") && attributes.includes("samesite=lax");
    const bodyOk = response.json?.ok === true && response.json?.user?.email === email;
    return {
      ok: isCreatedOrOk(response.status) && bodyOk && Boolean(sessionCookie?.value) && hardened,
      detail: `HTTP ${response.status}(200/201 기대), 본문 사용자 일치=${String(bodyOk)}, 세션 쿠키 발급=${String(Boolean(sessionCookie?.value))}, HttpOnly·SameSite=Lax=${String(hardened)}`,
    };
  });

  await step("session.authenticated", "로그인 세션이 시드 사용자 반환 GET /api/auth/session", async () => {
    if (!sessionCookie?.value) return { ok: false, detail: "로그인 단계가 쿠키를 받지 못해 건너뜀" };
    const response = await sendRequest(fetchImpl, "GET", `${api.origin}/api/auth/session`, { cookie: sessionCookie.value });
    const user = response.json?.user;
    const match = response.json?.authenticated === true && user?.email === email && user?.id === userId;
    return {
      ok: response.status === 200 && match && user?.role === "user",
      detail: `HTTP ${response.status}, 이메일·ID 일치=${String(match)}, role=${String(user?.role)}`,
    };
  });

  await step("logout", "로그아웃 POST /api/auth/logout", async () => {
    if (!sessionCookie?.value) return { ok: false, detail: "로그인 단계가 쿠키를 받지 못해 건너뜀" };
    const response = await sendRequest(fetchImpl, "POST", `${api.origin}/api/auth/logout`, {
      headers: isolatedHeaders(),
      cookie: sessionCookie.value,
    });
    const cleared = findSessionCookie(response.setCookies);
    const expired = cleared !== null && (cleared.value === "" || cleared.attributes.some((attribute) => attribute === "max-age=0" || attribute.startsWith("expires=thu, 01 jan 1970")));
    return {
      ok: isCreatedOrOk(response.status) && response.json?.ok === true && expired,
      detail: `HTTP ${response.status}(200/201 기대), ok=${String(response.json?.ok)}, 쿠키 만료 지시=${String(expired)}`,
    };
  });

  await step("session.after-logout", "로그아웃 후 이전 쿠키 거부(서버 측 세션 폐기)", async () => {
    if (!sessionCookie?.value) return { ok: false, detail: "로그인 단계가 쿠키를 받지 못해 건너뜀" };
    const response = await sendRequest(fetchImpl, "GET", `${api.origin}/api/auth/session`, { cookie: sessionCookie.value });
    return {
      ok: response.status === 200 && response.json?.authenticated === false && response.json?.user === null,
      detail: `HTTP ${response.status}, authenticated=${String(response.json?.authenticated)}`,
    };
  });

  const probeMode = options.ratelimitProbe ?? "auto";
  const probeAllowed = probeMode === true || (probeMode === "auto" && state?.api?.trustedProxy === true);
  if (!probeAllowed) {
    record(
      "ratelimit.shape",
      "SKIP",
      "레이트리밋 응답 형태(429)",
      probeMode === false
        ? "--no-ratelimit-probe 로 건너뜀"
        : "이 하네스가 띄운 API(loopback 프록시 신뢰)가 아니라 IP 버킷을 격리할 수 없어 건너뜀(--ratelimit-probe 로 강제 가능)",
    );
  } else {
    await step("ratelimit.shape", "레이트리밋 응답 형태: 반복 로그인 실패 → 429", async () => {
      const probeIp = randomSyntheticIp(random);
      const probeEmail = `ratelimit-probe-${Math.floor(random() * 1e9).toString(36)}@toonstudio-local.test`;
      const statuses = [];
      let limited = null;
      for (let attempt = 1; attempt <= RATE_LIMIT_LOGIN_MAX_ATTEMPTS; attempt += 1) {
        const response = await sendRequest(fetchImpl, "POST", `${api.origin}/api/auth/login`, {
          headers: browserHeaders({ "x-forwarded-for": probeIp }),
          body: { email: probeEmail, password: `${password}-probe` },
        });
        statuses.push(response.status);
        if (response.status === 429) {
          limited = { attempt, response };
          break;
        }
        if (response.status !== 401) break;
      }
      if (!limited) return { ok: false, detail: `429 가 나오지 않음(상태 순서 ${statuses.join(",")})` };
      const shapeOk = limited.response.json?.error === RATE_LIMIT_ERROR
        && findSessionCookie(limited.response.setCookies) === null;
      const beforeOk = statuses.slice(0, -1).every((status) => status === 401);
      return {
        ok: shapeOk && beforeOk,
        detail: `${limited.attempt}번째 시도에서 HTTP 429, 이전 ${limited.attempt - 1}회는 401=${String(beforeOk)}, 본문 {error} 문구 일치=${String(shapeOk)}, 쿠키 없음`,
      };
    });
  }

  if (options.skipWeb || !web) {
    const reason = typeof options.skipWeb === "string"
      ? options.skipWeb
      : options.skipWeb
        ? "--skip-web 으로 건너뜀"
        : "웹 origin 이 없음";
    record("web.proxy", "SKIP", "웹 프록시 경유 확인", reason);
  } else {
    await step("web.proxy", "웹(Vite) 프록시 경유 GET /api/health/live · /api/auth/session", async () => {
      const live = await sendRequest(fetchImpl, "GET", `${web.origin}/api/health/live`);
      const session = await sendRequest(fetchImpl, "GET", `${web.origin}/api/auth/session`);
      const liveOk = live.status === 200 && live.json?.status === "ok";
      const sessionOk = session.status === 200 && session.json?.authenticated === false;
      return {
        ok: liveOk && sessionOk,
        detail: `live HTTP ${live.status}, session HTTP ${session.status}(익명 응답=${String(sessionOk)})`,
      };
    });
  }

  return rows;
}

export function summarizeRows(rows) {
  const count = (status) => rows.filter((row) => row.status === status).length;
  return { total: rows.length, passed: count("PASS"), failed: count("FAIL"), skipped: count("SKIP") };
}

export function formatSmokeTable(rows, { secrets = [] } = {}) {
  const escapeCell = (value) => redactSecrets(String(value), secrets).replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = ["| # | 결과 | 항목 | 상세 |", "| --- | --- | --- | --- |"];
  rows.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.status} | ${escapeCell(row.title)} | ${escapeCell(row.detail)} |`);
  });
  const summary = summarizeRows(rows);
  lines.push("", `요약: 전체 ${summary.total}개 중 PASS ${summary.passed}, FAIL ${summary.failed}, SKIP ${summary.skipped}`);
  return lines.join("\n");
}

export async function runSmokeCli(argv) {
  const flags = new Set(argv);
  const known = new Set(["--skip-web", "--no-ratelimit-probe", "--ratelimit-probe", "--json", "--help"]);
  for (const flag of flags) {
    if (!known.has(flag)) {
      process.stderr.write(`알 수 없는 인자: ${flag} (--help 참조)\n`);
      return EXIT.usage;
    }
  }
  if (flags.has("--help")) {
    process.stdout.write(
      [
        "사용법: node scripts/local-fullstack/smoke.mjs [옵션]",
        "  --skip-web             웹(Vite) 프록시 확인을 건너뜁니다",
        "  --no-ratelimit-probe   반복 로그인 실패(429) 확인을 건너뜁니다",
        "  --ratelimit-probe      하네스가 띄우지 않은 API 에도 429 확인을 강제합니다(해당 IP 버킷이 10분간 소진됩니다)",
        "  --json                 표 대신 JSON 으로 출력합니다(비밀값 없음)",
        "",
      ].join("\n"),
    );
    return EXIT.ok;
  }
  const { values, fileValues } = loadHarnessValues();
  const stackDirectory = resolveStackDirectory({ environment: process.env, envFileValues: fileValues });
  const state = readState(stackPaths(stackDirectory));
  let rows;
  try {
    rows = await runAuthSmoke({
      values,
      state,
      options: {
        // --no-web 이나 외부 웹처럼 이 하네스가 웹을 띄우지 않았다면 프록시 확인은 건너뛴다.
        skipWeb: flags.has("--skip-web")
          ? true
          : state.web?.pid
            ? false
            : "이 하네스가 웹을 기동하지 않아 건너뜀(up --no-web 또는 외부 웹)",
        ratelimitProbe: flags.has("--no-ratelimit-probe") ? false : flags.has("--ratelimit-probe") ? true : "auto",
      },
    });
  } catch (error) {
    if (error instanceof GuardViolationError) {
      process.stderr.write(`스모크 중단(운영 보호): ${error.message}\n`);
      return EXIT.guard;
    }
    process.stderr.write(`스모크를 시작하지 못했습니다: ${error?.message ?? error}\n`);
    return EXIT.failure;
  }
  const secrets = collectSecretValues(values).map((entry) => entry.value);
  if (flags.has("--json")) {
    process.stdout.write(`${JSON.stringify({ rows, summary: summarizeRows(rows) }, null, 2)}\n`);
  } else {
    const emailLength = values[ENV_KEYS.testEmail]?.length ?? 0;
    const passwordLength = values[ENV_KEYS.testPassword]?.length ?? 0;
    process.stdout.write(
      [
        "ToonStudio 로컬 풀스택 인증 스모크",
        `API ${values[ENV_KEYS.apiOrigin]}  웹 ${values[ENV_KEYS.webOrigin] ?? "(없음)"}`,
        `시드 계정: 이메일 길이 ${emailLength}, 비밀번호 길이 ${passwordLength} (값은 출력하지 않습니다. 키: ${SENSITIVE_ENV_KEYS.slice(0, 3).join(", ")})`,
        "",
        formatSmokeTable(rows, { secrets }),
        "",
      ].join("\n"),
    );
  }
  return summarizeRows(rows).failed === 0 ? EXIT.ok : EXIT.failure;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSmokeCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`스모크 실패: ${error?.message ?? error}\n`);
      process.exit(EXIT.failure);
    },
  );
}

