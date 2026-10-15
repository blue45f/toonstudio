import assert from "node:assert/strict";

import {
  FOREIGN_DATABASE_ENV_NAMES,
  GuardViolationError,
  assertEnvironmentSafe,
  assertLocalOrigin,
  assertLocalPostgresUrl,
  buildChildEnv,
  describeSecretLength,
  redactSecrets,
} from "./guard.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

// 테스트용 합성 자격증명. 리터럴 연결 문자열이 소스에 남지 않도록 조각을 조립한다.
const FAKE_USER = "harness_test_user";
const FAKE_PASSWORD = ["fake", "credential", "0123456789"].join("-");

function databaseUrl(host, suffix = "") {
  return ["postgresql://", FAKE_USER, ":", FAKE_PASSWORD, "@", host, suffix].join("");
}

describe("assertLocalPostgresUrl: 로컬 URL 허용", () => {
  it("127.0.0.1 과 localhost 만 허용하고 구성요소를 돌려준다", () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST"]) {
      const parsed = assertLocalPostgresUrl(databaseUrl(`${host}:55452`, "/toonstudio_local"), "TEST_URL");
      assert.equal(parsed.hostname, host.toLowerCase());
      assert.equal(parsed.port, 55452);
      assert.equal(parsed.database, "toonstudio_local");
      assert.equal(parsed.username, FAKE_USER);
      assert.equal(parsed.password, FAKE_PASSWORD);
    }
  });

  it("sslmode=disable 하나만 쿼리 파라미터로 허용한다", () => {
    assert.doesNotThrow(() =>
      assertLocalPostgresUrl(databaseUrl("127.0.0.1:55452", "/db?sslmode=disable"), "TEST_URL"),
    );
  });
});

describe("assertLocalPostgresUrl: 운영·원격 호스트는 즉시 중단", () => {
  const remoteHosts = [
    "aws-0-ap-northeast-2.pooler.supabase.com:5432",
    "ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech:5432",
    "db.example-project.supabase.co:5432",
    "dpg-abc123.oregon-postgres.render.com:5432",
    "www.toonstudio.cloud:5432",
    "10.0.0.5:5432",
    "192.168.0.10:55452",
    "0.0.0.0:55452",
    "127.0.0.2:55452",
    "[::1]:55452",
  ];
  for (const host of remoteHosts) {
    it(`${host.replace(/[a-z0-9-]+\./u, "…")} 거부`, () => {
      assert.throws(
        () => assertLocalPostgresUrl(databaseUrl(host, "/postgres"), "TOONSTUDIO_LOCAL_DATABASE_URL"),
        (error) => {
          assert.ok(error instanceof GuardViolationError);
          assert.match(error.message, /TOONSTUDIO_LOCAL_DATABASE_URL/u);
          // URL 원문·비밀번호·사용자 이름은 메시지에 절대 싣지 않는다.
          assert.ok(!error.message.includes(FAKE_PASSWORD), "비밀번호 노출");
          assert.ok(!error.message.includes(FAKE_USER), "사용자 이름 노출");
          return true;
        },
      );
    });
  }

  it("호스트 접미사·userinfo 위장을 거부한다", () => {
    for (const trick of [
      databaseUrl("127.0.0.1.evil.example:55452", "/db"),
      databaseUrl("localhost.evil.example:55452", "/db"),
      ["postgresql://", "127.0.0.1:55452", "@", "evil.example:5432", "/db"].join(""),
      databaseUrl("127.0.0.1%2eevil.example:55452", "/db"),
      databaseUrl("127.0.0.1,evil.example:55452", "/db"),
    ]) {
      assert.throws(() => assertLocalPostgresUrl(trick, "URL"), GuardViolationError, trick.length.toString());
    }
  });

  it("libpq/pg 가 호스트를 덮어쓸 수 있는 쿼리 파라미터를 거부한다", () => {
    for (const query of ["?host=evil.example", "?hostaddr=203.0.113.7", "?port=5432", "?service=prod", "?sslmode=require", "?options=-c%20x=1", "?host=%2Ftmp&sslmode=disable"]) {
      assert.throws(
        () => assertLocalPostgresUrl(databaseUrl("127.0.0.1:55452", `/db${query}`), "URL"),
        GuardViolationError,
        query,
      );
    }
  });

  it("형식이 잘못된 값·빈 값·다른 프로토콜을 거부하고 값을 출력하지 않는다", () => {
    assert.throws(() => assertLocalPostgresUrl("", "URL"), GuardViolationError);
    assert.throws(() => assertLocalPostgresUrl(undefined, "URL"), GuardViolationError);
    assert.throws(() => assertLocalPostgresUrl("not a url", "URL"), (error) => {
      assert.ok(!error.message.includes("not a url"));
      return error instanceof GuardViolationError;
    });
    assert.throws(() => assertLocalPostgresUrl(["mysql://", FAKE_USER, ":", FAKE_PASSWORD, "@127.0.0.1:55452/db"].join(""), "URL"), GuardViolationError);
    assert.throws(() => assertLocalPostgresUrl(databaseUrl("127.0.0.1", "/db"), "URL"), /포트/u);
    assert.throws(() => assertLocalPostgresUrl(["postgresql://", "127.0.0.1:55452/db"].join(""), "URL"), /사용자와 비밀번호/u);
    assert.throws(() => assertLocalPostgresUrl(databaseUrl("127.0.0.1:55452", "/"), "URL"), /데이터베이스/u);
    assert.throws(() => assertLocalPostgresUrl(databaseUrl("127.0.0.1:55452", "/db%ZZ"), "URL"), /퍼센트/u);
  });
});

describe("assertLocalOrigin", () => {
  it("http://127.0.0.1:포트 와 localhost 를 허용한다", () => {
    assert.deepEqual(assertLocalOrigin("http://127.0.0.1:4101", "API"), { origin: "http://127.0.0.1:4101", hostname: "127.0.0.1", port: 4101 });
    assert.equal(assertLocalOrigin("http://localhost:5273/", "WEB").origin, "http://localhost:5273");
  });

  it("운영 도메인·https·자격증명·경로 포함 origin 을 거부한다", () => {
    for (const value of [
      "https://www.toonstudio.cloud",
      "http://www.toonstudio.cloud:80",
      "https://127.0.0.1:4101",
      "http://127.0.0.1",
      "http://user:pw@127.0.0.1:4101",
      "http://127.0.0.1:4101/api",
      "http://127.0.0.1:4101/?x=1",
      "http://example.com:4101",
      "",
    ]) {
      assert.throws(() => assertLocalOrigin(value, "ORIGIN"), GuardViolationError, value);
    }
  });
});

describe("buildChildEnv: 허용 목록 환경", () => {
  const base = {
    PATH: "/usr/bin",
    HOME: "/home/tester",
    LANG: "C.UTF-8",
    DATABASE_URL: "must-not-leak",
    PRODUCTION_DATABASE_DIRECT_URL: "must-not-leak",
    MIGRATION_DATABASE_URL: "must-not-leak",
    PGPASSWORD: "must-not-leak",
    GH_TOKEN: "must-not-leak",
    GITHUB_TOKEN: "must-not-leak",
    AWS_SECRET_ACCESS_KEY: "must-not-leak",
    CLOUDFLARE_API_TOKEN: "must-not-leak",
    HTTPS_PROXY: "http://proxy.invalid:3128",
    NODE_EXTRA_CA_CERTS: "/etc/ssl/ca.pem",
    npm_config_registry: "https://registry.npmjs.org/",
    npm_config__authToken: "must-not-leak",
    NODE_OPTIONS: "--require=/evil.cjs",
    PLAYWRIGHT_BROWSERS_PATH: "/opt/pw",
  };

  it("기본 환경에는 PATH/HOME 등만 통과시키고 운영 자격증명·토큰은 제거한다", () => {
    const env = buildChildEnv({ base });
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.HOME, "/home/tester");
    for (const key of ["DATABASE_URL", "PRODUCTION_DATABASE_DIRECT_URL", "MIGRATION_DATABASE_URL", "PGPASSWORD", "GH_TOKEN", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "CLOUDFLARE_API_TOKEN", "NODE_OPTIONS", "HTTPS_PROXY"]) {
      assert.equal(env[key], undefined, `${key} 가 자식 환경으로 새면 안 됩니다`);
    }
    assert.ok(!Object.values(env).includes("must-not-leak"));
  });

  it("toolchain 모드는 프록시·CA·npm 설정만 추가로 통과시키고 토큰은 계속 제거한다", () => {
    const env = buildChildEnv({ base, toolchain: true });
    assert.equal(env.HTTPS_PROXY, "http://proxy.invalid:3128");
    assert.equal(env.NODE_EXTRA_CA_CERTS, "/etc/ssl/ca.pem");
    assert.equal(env.npm_config_registry, "https://registry.npmjs.org/");
    assert.equal(env.npm_config__authToken, undefined);
    assert.equal(env.GH_TOKEN, undefined);
  });

  it("passthrough 접두어(PLAYWRIGHT_*)와 명시 extra 를 반영하고 extra 가 우선한다", () => {
    const env = buildChildEnv({ base, passthrough: ["PLAYWRIGHT_*"], extra: { HOME: "/override", DATABASE_URL: "explicit-local" } });
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw");
    assert.equal(env.HOME, "/override");
    assert.equal(env.DATABASE_URL, "explicit-local");
  });

  it("기본은 로그에 색 코드가 섞이지 않도록 NO_COLOR 를 설정하고, noColor=false 면 설정하지 않는다", () => {
    assert.equal(buildChildEnv({ base }).NO_COLOR, "1");
    assert.equal(buildChildEnv({ base, noColor: false }).NO_COLOR, undefined);
  });

  it("loopback 은 프록시를 우회하도록 NO_PROXY 를 보장한다", () => {
    const env = buildChildEnv({ base: { PATH: "/usr/bin", NO_PROXY: "example.invalid" } });
    for (const entry of ["127.0.0.1", "localhost", "::1", "example.invalid"]) {
      assert.ok(env.NO_PROXY.split(",").includes(entry), entry);
    }
    assert.equal(env.no_proxy, env.NO_PROXY);
  });
});

describe("redactSecrets", () => {
  it("알려진 비밀값(원문·URL 인코딩)과 postgres URL 자격증명을 가린다", () => {
    const secret = "pa$$word/with+chars-123";
    const text = `연결 ${databaseUrl("127.0.0.1:55452", "/db")} 및 ${secret} 그리고 ${encodeURIComponent(secret)}`;
    const redacted = redactSecrets(text, [secret]);
    assert.ok(!redacted.includes(secret));
    assert.ok(!redacted.includes(encodeURIComponent(secret)));
    assert.ok(!redacted.includes(FAKE_PASSWORD));
    assert.ok(redacted.includes("[REDACTED]"));
  });

  it("짧은 값(6자 미만)은 일반 단어를 지우지 않도록 무시한다", () => {
    assert.equal(redactSecrets("abc 12345 def", ["12345", "abc"]), "abc 12345 def");
  });

  it("길이만 보고한다", () => {
    assert.equal(describeSecretLength("abcdef"), "길이 6");
    assert.equal(describeSecretLength(undefined), "길이 0");
  });
});

describe("assertEnvironmentSafe: 호출 셸에 있는 다른 도구의 DB 설정", () => {
  it("값이 없거나 비어 있거나 로컬 호스트면 통과한다(포트·자격증명이 없어도 된다)", () => {
    assert.doesNotThrow(() => assertEnvironmentSafe({}));
    assert.doesNotThrow(() => assertEnvironmentSafe({ DATABASE_URL: "", MIGRATION_DATABASE_URL: "   " }));
    assert.doesNotThrow(() => assertEnvironmentSafe({ DATABASE_URL: ["postgres://", "localhost/webdex"].join("") }));
    assert.doesNotThrow(() => assertEnvironmentSafe({ TEST_DATABASE_URL: databaseUrl("127.0.0.1:55432", "/webdex") }));
  });

  for (const name of FOREIGN_DATABASE_ENV_NAMES) {
    it(`${name} 가 원격 호스트면 변수 이름과 복구 방법을 알리며 중단하고 비밀번호는 노출하지 않는다`, () => {
      assert.throws(
        () => assertEnvironmentSafe({ [name]: databaseUrl("db.example-project.supabase.co:5432", "/postgres") }),
        (error) => {
          assert.ok(error instanceof GuardViolationError);
          assert.ok(error.message.includes(name), "변수 이름이 메시지에 있어야 한다");
          assert.match(error.message, /unset/u);
          assert.ok(!error.message.includes(FAKE_PASSWORD), "비밀번호 노출");
          assert.ok(!error.message.includes(FAKE_USER), "사용자 이름 노출");
          return true;
        },
      );
    });
  }

  it("호스트를 덮어쓰는 쿼리·userinfo 위장·형식 오류·postgres 가 아닌 프로토콜도 중단한다", () => {
    for (const value of [
      databaseUrl("127.0.0.1:55432", "/db?host=evil.example"),
      ["postgresql://", "127.0.0.1:55432", "@", "evil.example:5432", "/db"].join(""),
      "이건 URL 이 아님",
      ["mysql://", FAKE_USER, ":", FAKE_PASSWORD, "@127.0.0.1:3306/db"].join(""),
    ]) {
      assert.throws(() => assertEnvironmentSafe({ DATABASE_URL: value }), GuardViolationError, value.length.toString());
    }
  });
});
