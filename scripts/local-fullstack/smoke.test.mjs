import assert from "node:assert/strict";
import { createServer } from "node:http";

import { ENV_KEYS } from "./lib/config.mjs";
import { GuardViolationError } from "./lib/guard.mjs";
import { SESSION_COOKIE_NAME, findSessionCookie, formatSmokeTable, runAuthSmoke, summarizeRows } from "./smoke.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ACCOUNT = {
  email: "local-qa-0badc0de@toonstudio-local.test",
  password: "Qm7-mock-account-password-0123456789",
  userId: "00000000-0000-4000-8000-00000000abcd",
};
const COOKIE_PREFIX = "mock-session-token-";

/**
 * 운영 API 의 계약(상태 코드·쿠키·CSRF·레이트리밋 문구)을 흉내 내는 로컬 서버.
 * 결함을 주입해 스모크가 FAIL 을 보고하는지도 검증한다.
 */
async function startMockApi(defects = {}) {
  let sessionVersion = 1;
  const buckets = new Map();
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    const send = (status, json, headers = {}) => {
      response.writeHead(status, { "content-type": "application/json", ...headers });
      response.end(JSON.stringify(json));
    };
    const cookieHeader = String(request.headers.cookie ?? "");
    const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
    const sessionValid = token === `${COOKIE_PREFIX}${sessionVersion}`;
    const csrfOk = request.headers["x-toonstudio-csrf"] === "1" && Boolean(request.headers.origin);
    const url = request.url ?? "";

    if (request.method === "GET" && url === "/api/health/live") return send(200, { status: "ok" });
    if (request.method === "GET" && url === "/api/health/ready") {
      return defects.notReady ? send(503, { status: "not_ready" }) : send(200, { status: "ready" });
    }
    if (request.method === "GET" && url === "/api/auth/providers") return send(200, { email: { available: false, reason: "disabled" } });
    if (request.method === "GET" && url === "/api/auth/session") {
      const authenticated = sessionValid || (defects.logoutDoesNotRevoke && Boolean(token));
      return authenticated
        ? send(200, { authenticated: true, user: { id: ACCOUNT.userId, name: "Local QA", email: ACCOUNT.email, image: null, role: "user" } })
        : send(200, { authenticated: false, user: null });
    }
    if (request.method === "POST" && url === "/api/auth/login") {
      if (!defects.noCsrf && !csrfOk) return send(403, { statusCode: 403, error: "Forbidden" });
      const ip = String(request.headers["x-forwarded-for"] ?? request.socket.remoteAddress);
      const count = (buckets.get(ip) ?? 0) + 1;
      buckets.set(ip, count);
      if (count > 10) return send(429, { error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." });
      const accepted = body.email === ACCOUNT.email && (body.password === ACCOUNT.password || defects.acceptsAnyPassword);
      if (!accepted) return send(401, { error: "이메일 또는 비밀번호를 확인해 주세요." });
      const attributes = defects.weakCookie ? "Path=/" : "Path=/; HttpOnly; SameSite=Lax";
      return send(201, { ok: true, user: { id: ACCOUNT.userId, email: ACCOUNT.email, name: "Local QA" } }, {
        "set-cookie": `${SESSION_COOKIE_NAME}=${COOKIE_PREFIX}${sessionVersion}; ${attributes}; Max-Age=2592000`,
      });
    }
    if (request.method === "POST" && url === "/api/auth/logout") {
      if (!csrfOk) return send(403, { statusCode: 403 });
      if (!defects.logoutDoesNotRevoke) sessionVersion += 1;
      return send(201, { ok: true }, { "set-cookie": `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    }
    return send(404, { error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function valuesFor(origin, overrides = {}) {
  return {
    [ENV_KEYS.apiOrigin]: origin,
    [ENV_KEYS.webOrigin]: origin,
    [ENV_KEYS.testEmail]: ACCOUNT.email,
    [ENV_KEYS.testPassword]: ACCOUNT.password,
    [ENV_KEYS.testUserId]: ACCOUNT.userId,
    ...overrides,
  };
}

const deterministic = (() => {
  let counter = 0;
  return () => ((counter += 1) % 97) / 97;
})();

async function runAgainst(defects, { state = { api: { trustedProxy: true } }, options = {} } = {}) {
  const api = await startMockApi(defects);
  try {
    return await runAuthSmoke({ values: valuesFor(api.origin), state, options, random: deterministic });
  } finally {
    await api.close();
  }
}

const statusOf = (rows, id) => rows.find((row) => row.id === id)?.status;

describe("runAuthSmoke: 정상 서버", () => {
  it("12개 항목이 모두 PASS 다", async () => {
    const rows = await runAgainst({});
    assert.deepEqual(rows.map((row) => row.id), [
      "health.live", "health.ready", "providers.email", "session.anonymous", "csrf.guard",
      "login.wrong-password", "login.success", "session.authenticated", "logout",
      "session.after-logout", "ratelimit.shape", "web.proxy",
    ]);
    assert.deepEqual(summarizeRows(rows), { total: 12, passed: 12, failed: 0, skipped: 0 });
  });

  it("출력 표에 이메일·비밀번호·사용자 ID·쿠키 값이 들어가지 않는다", async () => {
    const rows = await runAgainst({});
    const table = formatSmokeTable(rows, { secrets: [ACCOUNT.email, ACCOUNT.password, ACCOUNT.userId] });
    for (const forbidden of [ACCOUNT.email, ACCOUNT.password, ACCOUNT.userId, COOKIE_PREFIX]) {
      assert.ok(!table.includes(forbidden), `표에 비밀 값이 노출됨: ${forbidden.slice(0, 8)}…`);
      assert.ok(!JSON.stringify(rows).includes(forbidden), `행 데이터에 비밀 값이 노출됨: ${forbidden.slice(0, 8)}…`);
    }
    assert.match(table, /\| 1 \| PASS \|/u);
    assert.match(table, /요약: 전체 12개 중 PASS 12, FAIL 0, SKIP 0/u);
  });

  it("레이트리밋 프로브는 IP 버킷을 격리할 수 없으면 건너뛰고 옵션으로 끌 수 있다", async () => {
    const untrusted = await runAgainst({}, { state: {} });
    assert.equal(statusOf(untrusted, "ratelimit.shape"), "SKIP");
    const disabled = await runAgainst({}, { options: { ratelimitProbe: false } });
    assert.equal(statusOf(disabled, "ratelimit.shape"), "SKIP");
    const forced = await runAgainst({}, { state: {}, options: { ratelimitProbe: true } });
    assert.equal(statusOf(forced, "ratelimit.shape"), "PASS");
  });

  it("--skip-web 이면 프록시 확인을 건너뛰고, 문자열이면 그 사유를 표에 쓴다", async () => {
    const rows = await runAgainst({}, { options: { skipWeb: true } });
    assert.equal(statusOf(rows, "web.proxy"), "SKIP");
    assert.equal(summarizeRows(rows).failed, 0);
    const withReason = await runAgainst({}, { options: { skipWeb: "웹을 띄우지 않음" } });
    assert.equal(statusOf(withReason, "web.proxy"), "SKIP");
    assert.equal(withReason.find((row) => row.id === "web.proxy").detail, "웹을 띄우지 않음");
  });
});

/** 웹(Vite) 프록시를 흉내 내는 서버. 처음 failFirst 건은 503 으로 응답해 `up` 직후의 느린 개발 서버를 재현한다. */
async function startFlakyWeb({ failFirst = 0, alwaysFail = false } = {}) {
  let remaining = failFirst;
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    const send = (status, json) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(json));
    };
    if (alwaysFail || remaining > 0) {
      remaining -= 1;
      return send(503, { error: "기동 중" });
    }
    if (request.url === "/api/health/live") return send(200, { status: "ok" });
    if (request.url === "/api/auth/session") return send(200, { authenticated: false, user: null });
    return send(404, { error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    requests: () => requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function runWithWeb(web, options) {
  const api = await startMockApi({});
  try {
    return await runAuthSmoke({
      values: valuesFor(api.origin, { [ENV_KEYS.webOrigin]: web.origin }),
      state: { api: { trustedProxy: true } },
      options,
      random: deterministic,
    });
  } finally {
    await api.close();
  }
}

describe("runAuthSmoke: 웹 프록시 확인은 느린 기동을 견딘다", () => {
  it("처음 몇 번 응답하지 못해도 예산 안에서 재시도해 PASS 한다(거짓 FAIL 방지)", async () => {
    const web = await startFlakyWeb({ failFirst: 3 });
    try {
      const rows = await runWithWeb(web, { webProxyBudgetMs: 10_000, retryDelayMs: 20 });
      assert.equal(statusOf(rows, "web.proxy"), "PASS");
      assert.match(rows.find((row) => row.id === "web.proxy").detail, /3번째 시도에서 성공/u);
      assert.equal(summarizeRows(rows).failed, 0);
    } finally {
      await web.close();
    }
  });

  it("예산 안에 끝내 정상 응답이 없으면 시도 횟수와 마지막 사유를 담아 FAIL 한다", async () => {
    const web = await startFlakyWeb({ alwaysFail: true });
    try {
      const rows = await runWithWeb(web, { webProxyBudgetMs: 600, retryDelayMs: 100 });
      assert.equal(statusOf(rows, "web.proxy"), "FAIL");
      assert.match(rows.find((row) => row.id === "web.proxy").detail, /\d+번 시도했지만 \d+초 안에 정상 응답이 없음\(마지막: live HTTP 503/u);
      assert.ok(web.requests() >= 4, `재시도가 일어나야 한다(요청 ${web.requests()}건)`);
      assert.equal(summarizeRows(rows).failed, 1, "웹 프록시 한 항목만 FAIL 이어야 한다");
    } finally {
      await web.close();
    }
  });

  it("연결 자체가 거부되면 예외 사유를 기록하고 비밀값은 싣지 않는다", async () => {
    const web = await startFlakyWeb({});
    await web.close();
    const rows = await runWithWeb(web, { webProxyBudgetMs: 400, retryDelayMs: 50 });
    const row = rows.find((entry) => entry.id === "web.proxy");
    assert.equal(row.status, "FAIL");
    assert.match(row.detail, /예외/u);
    assert.ok(!row.detail.includes(ACCOUNT.password));
  });
});

describe("runAuthSmoke: 결함을 FAIL 로 잡아낸다", () => {
  it("잘못된 비밀번호를 받아들이는 서버", async () => {
    const rows = await runAgainst({ acceptsAnyPassword: true });
    assert.equal(statusOf(rows, "login.wrong-password"), "FAIL");
  });

  it("CSRF 를 강제하지 않는 서버", async () => {
    const rows = await runAgainst({ noCsrf: true });
    assert.equal(statusOf(rows, "csrf.guard"), "FAIL");
  });

  it("HttpOnly·SameSite 가 없는 쿠키", async () => {
    const rows = await runAgainst({ weakCookie: true });
    assert.equal(statusOf(rows, "login.success"), "FAIL");
  });

  it("로그아웃 후에도 이전 쿠키가 통하는 서버", async () => {
    const rows = await runAgainst({ logoutDoesNotRevoke: true });
    assert.equal(statusOf(rows, "session.after-logout"), "FAIL");
  });

  it("준비되지 않은 서버(ready 503)", async () => {
    const rows = await runAgainst({ notReady: true });
    assert.equal(statusOf(rows, "health.ready"), "FAIL");
  });

  it("연결할 수 없는 서버는 예외 대신 FAIL 행으로 보고한다", async () => {
    const api = await startMockApi({});
    const origin = api.origin;
    await api.close();
    const rows = await runAuthSmoke({ values: valuesFor(origin), state: {}, options: { skipWeb: true }, random: deterministic });
    assert.ok(rows.filter((row) => row.status === "FAIL").length >= 5);
    assert.ok(rows.every((row) => !row.detail.includes(ACCOUNT.password)));
  });
});

describe("runAuthSmoke: 운영 보호", () => {
  it("API origin 이 로컬이 아니면 요청을 한 번도 보내지 않고 중단한다(자격증명 전송 금지)", async () => {
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      throw new Error("호출되면 안 됩니다");
    };
    for (const origin of ["https://www.toonstudio.cloud", "http://example.com:4101", "http://127.0.0.1.evil.example:4101"]) {
      await assert.rejects(
        () => runAuthSmoke({ values: valuesFor(origin), fetchImpl }),
        GuardViolationError,
        origin,
      );
    }
    assert.equal(requests, 0);
  });

  it("웹 origin 이 로컬이 아니어도 중단한다", async () => {
    const api = await startMockApi({});
    try {
      await assert.rejects(
        () => runAuthSmoke({ values: valuesFor(api.origin, { [ENV_KEYS.webOrigin]: "https://www.toonstudio.cloud" }) }),
        GuardViolationError,
      );
    } finally {
      await api.close();
    }
  });

  it("계정 값이 없으면 안내 메시지와 함께 실패한다", async () => {
    await assert.rejects(
      () => runAuthSmoke({ values: { [ENV_KEYS.apiOrigin]: "http://127.0.0.1:4101" } }),
      /up/u,
    );
  });

  it("값이 전혀 없으면(아직 up 전) 운영 보호 위반이 아니라 up 안내로 실패하고 요청을 보내지 않는다", async () => {
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      throw new Error("호출되면 안 됩니다");
    };
    const error = await runAuthSmoke({ values: {}, fetchImpl }).then(() => null, (reason) => reason);
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof GuardViolationError), "비어 있는 값을 운영 보호 위반으로 보고하면 안 된다");
    assert.match(error.message, /up/u);
    assert.equal(requests, 0);
  });
});

describe("findSessionCookie", () => {
  it("세션 쿠키의 값과 속성을 소문자로 정규화해 읽는다", () => {
    const parsed = findSessionCookie([
      "other=1; Path=/",
      `${SESSION_COOKIE_NAME}=abc.def; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`,
    ]);
    assert.equal(parsed.value, "abc.def");
    assert.ok(parsed.attributes.includes("httponly"));
    assert.ok(parsed.attributes.includes("samesite=lax"));
    assert.equal(findSessionCookie(["other=1"]), null);
    assert.equal(findSessionCookie([]), null);
  });
});
