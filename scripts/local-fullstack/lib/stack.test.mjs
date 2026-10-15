import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ENV_KEYS, REPOSITORY_ROOT } from "./config.mjs";
import { GuardViolationError } from "./guard.mjs";
import { buildApiEnvironment, buildWebEnvironment, resolveTsxLoader, resolveViteEntry, tailLog } from "./stack.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const DATABASE_PASSWORD = "runtime-password-abcdefghijklmnop";
const VALUES = {
  [ENV_KEYS.databaseUrl]: ["postgresql://", "toonstudio_local_runtime", ":", DATABASE_PASSWORD, "@127.0.0.1:55452/toonstudio_local"].join(""),
  [ENV_KEYS.apiOrigin]: "http://127.0.0.1:4101",
  [ENV_KEYS.webOrigin]: "http://127.0.0.1:5273",
  [ENV_KEYS.sessionSecret]: "session-secret-0123456789abcdef0123456789abcdef",
  [ENV_KEYS.stateSecret]: "state-secret-0123456789abcdef0123456789abcdef",
};

// 호출한 셸에 있을 수 있는 운영 자격증명·토큰(자식으로 새면 안 된다).
const HOSTILE_BASE = {
  PATH: "/usr/bin",
  HOME: "/home/tester",
  DATABASE_URL: "production-database-url-must-not-leak",
  PGPASSWORD: "production-password-must-not-leak",
  GH_TOKEN: "github-token-must-not-leak",
  PORT: "9999",
  API_CORS_ALLOWED_ORIGINS: "https://www.toonstudio.cloud",
  NODE_OPTIONS: "--require=/tmp/evil.cjs",
};

describe("buildApiEnvironment", () => {
  const env = buildApiEnvironment(VALUES, { base: HOSTILE_BASE, repositoryRoot: REPOSITORY_ROOT });

  it("로컬 값만 주입하고 호출 셸의 운영 자격증명·토큰·PORT·NODE_OPTIONS 는 전달하지 않는다", () => {
    assert.equal(env.DATABASE_URL, VALUES[ENV_KEYS.databaseUrl]);
    assert.equal(env.PGPASSWORD, undefined);
    assert.equal(env.GH_TOKEN, undefined);
    assert.equal(env.PORT, undefined, "PORT 가 있으면 NEST_API_PORT 를 덮어쓴다");
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.ok(!Object.values(env).some((value) => String(value).includes("must-not-leak")));
  });

  it("loopback 에만 바인딩하고 .env.local 자동 로드를 끈다", () => {
    assert.equal(env.NEST_API_HOST, "127.0.0.1");
    assert.equal(env.NEST_API_PORT, "4101");
    assert.equal(env.API_LOCAL_ENV_FILE_ENABLED, "false");
    assert.equal(env.NODE_ENV, "development");
    assert.equal(env.API_RUNTIME_ROLE, "full");
  });

  it("CORS 는 로컬 웹 origin 만, 외부 도메인은 포함하지 않는다", () => {
    assert.deepEqual(env.API_CORS_ALLOWED_ORIGINS.split(","), ["http://127.0.0.1:5273", "http://localhost:5273"]);
    assert.equal(env.WEB_APP_BASE_URL, "http://127.0.0.1:5273");
    assert.equal(env.OAUTH_REDIRECT_BASE_URL, "http://127.0.0.1:4101");
  });

  it("운영과 같은 이메일 비활성 상태, 로컬 단일 인스턴스 레이트리밋, loopback 프록시만 신뢰", () => {
    assert.equal(env.AUTH_EMAIL_PROVIDER, "disabled");
    assert.equal(env.AUTH_SOCIAL_DEMO_ENABLED, "false");
    assert.equal(env.AUTH_RATE_LIMIT_MODE, "single-instance-local");
    assert.equal(env.AUTH_TRUSTED_PROXY_ENABLED, "true");
    assert.equal(env.AUTH_TRUSTED_PROXY_IPS, "127.0.0.1,::1");
    assert.equal(env.AUTH_TRUSTED_CLIENT_IP_HEADER, "x-forwarded-for");
    assert.equal(env.AUTH_SESSION_SECRET, VALUES[ENV_KEYS.sessionSecret]);
    assert.equal(env.AUTH_STATE_SECRET, VALUES[ENV_KEYS.stateSecret]);
    assert.equal(env.STUDIO_LIVE_CLUSTER_ADAPTER, "memory");
  });

  it("tsx 가 apps/api 의 tsconfig(데코레이터 설정)를 쓰도록 고정한다", () => {
    assert.equal(env.TSX_TSCONFIG_PATH, join(REPOSITORY_ROOT, "apps", "api", "tsconfig.json"));
  });

  it("원격 DB URL·운영 origin 이면 환경을 만들기 전에 가드 오류", () => {
    const remoteDatabase = ["postgresql://", "u", ":", "remote-password-0123456789", "@", "db.example-project.supabase.co:5432", "/postgres"].join("");
    assert.throws(() => buildApiEnvironment({ ...VALUES, [ENV_KEYS.databaseUrl]: remoteDatabase }), GuardViolationError);
    assert.throws(() => buildApiEnvironment({ ...VALUES, [ENV_KEYS.apiOrigin]: "https://www.toonstudio.cloud" }), GuardViolationError);
    assert.throws(() => buildApiEnvironment({ ...VALUES, [ENV_KEYS.webOrigin]: "http://example.com:5273" }), GuardViolationError);
  });
});

describe("buildWebEnvironment", () => {
  it("Vite 프록시 대상(NEST_API_URL)을 로컬 API 로 지정하고 DB 값은 전달하지 않는다", () => {
    const env = buildWebEnvironment(VALUES, { base: HOSTILE_BASE });
    assert.equal(env.NEST_API_URL, "http://127.0.0.1:4101");
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.GH_TOKEN, undefined);
  });

  it("API origin 이 로컬이 아니면 프록시 대상으로 쓰지 않는다", () => {
    assert.throws(() => buildWebEnvironment({ ...VALUES, [ENV_KEYS.apiOrigin]: "https://www.toonstudio.cloud" }), GuardViolationError);
  });
});

describe("실행 파일 확인", () => {
  it("저장소의 tsx 로더와 vite 진입점을 찾는다", () => {
    assert.match(resolveTsxLoader(REPOSITORY_ROOT), /^file:\/\/.*tsx.*loader\.mjs$/u);
    assert.match(resolveViteEntry(REPOSITORY_ROOT), /vite[\\/]bin[\\/]vite\.js$/u);
    assert.throws(() => resolveViteEntry(join(tmpdir(), "definitely-not-a-repo-0xdeadbeef")), /pnpm install/u);
  });
});

describe("tailLog", () => {
  it("끝부분만 읽고 알려진 비밀값을 가린다", () => {
    const directory = mkdtempSync(join(tmpdir(), "local-fullstack-tail-"));
    try {
      const logPath = join(directory, "x.log");
      writeFileSync(logPath, `${"앞부분 ".repeat(1000)}\n연결 실패: ${DATABASE_PASSWORD} 사용\n`);
      const tail = tailLog(logPath, { bytes: 200, secrets: [DATABASE_PASSWORD] });
      assert.ok(tail.includes("[REDACTED]"));
      assert.ok(!tail.includes(DATABASE_PASSWORD));
      assert.equal(tailLog(join(directory, "missing.log")), "");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
