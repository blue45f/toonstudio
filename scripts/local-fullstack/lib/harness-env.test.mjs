import assert from "node:assert/strict";

import { DEFAULTS, ENV_KEYS } from "./config.mjs";
import { GuardViolationError, assertLocalPostgresUrl } from "./guard.mjs";
import {
  assertHarnessValuesLocal,
  collectSecretValues,
  planHarnessEnv,
  summarizePlan,
} from "./harness-env.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

function sequentialRandom() {
  let counter = 0;
  const next = () => String((counter += 1)).padStart(2, "0");
  return {
    secret: (bytes) => `s${next()}-${"x".repeat(Math.max(0, bytes * 2 - 4))}`,
    hex: () => `abcd${next()}ef`.slice(0, 8),
    uuid: () => `00000000-0000-4000-8000-0000000000${next()}`,
  };
}

const PORTS = { pg: 55452, api: 4101, web: 5273 };
const STACK = "/tmp/local-fullstack-test-stack";

function plan(overrides = {}) {
  return planHarnessEnv({
    existing: {},
    ports: PORTS,
    stackDirectory: STACK,
    random: sequentialRandom(),
    ...overrides,
  });
}

describe("planHarnessEnv: 처음 실행", () => {
  const result = plan();

  it("규정된 모든 키를 생성한다", () => {
    assert.deepEqual(
      Object.keys(result.values).sort(),
      Object.values(ENV_KEYS).sort(),
    );
    assert.ok(Object.values(result.actions).every((action) => action === "생성"));
  });

  it("테스트 계정은 isValidSignupEmail 규칙을 만족하고 비밀번호는 24자 이상이다", () => {
    const email = result.values[ENV_KEYS.testEmail];
    assert.match(email, /^local-qa-[0-9a-f]{8}@toonstudio-local\.test$/u);
    assert.ok(email.length <= 254 && !/\s/u.test(email) && email.indexOf("@") === email.lastIndexOf("@"));
    assert.ok(result.values[ENV_KEYS.testPassword].length >= 24);
    assert.match(result.values[ENV_KEYS.testUserId], /^[0-9a-f-]{36}$/u);
  });

  it("DB URL 은 로컬 loopback·요청 포트이며 마이그레이션/런타임 역할이 분리된다", () => {
    const admin = assertLocalPostgresUrl(result.values[ENV_KEYS.migrationDatabaseUrl], "admin");
    const runtime = assertLocalPostgresUrl(result.values[ENV_KEYS.databaseUrl], "runtime");
    assert.equal(admin.hostname, "127.0.0.1");
    assert.equal(admin.port, PORTS.pg);
    assert.equal(admin.database, DEFAULTS.databaseName);
    assert.equal(admin.username, DEFAULTS.adminRole);
    assert.equal(runtime.username, DEFAULTS.runtimeRole);
    assert.notEqual(admin.username, runtime.username);
    assert.notEqual(admin.password, runtime.password);
    assert.doesNotThrow(() => assertHarnessValuesLocal(result.values));
  });

  it("origin 과 스택 디렉터리를 기록한다", () => {
    assert.equal(result.values[ENV_KEYS.apiOrigin], "http://127.0.0.1:4101");
    assert.equal(result.values[ENV_KEYS.webOrigin], "http://127.0.0.1:5273");
    assert.equal(result.values[ENV_KEYS.stackDir], STACK);
  });
});

describe("planHarnessEnv: 갱신 규칙(덮어쓰지 않는다)", () => {
  it("이미 유효한 값은 모두 유지하고 변경 키가 없다(멱등)", () => {
    const first = plan();
    const second = plan({ existing: first.values, random: sequentialRandom() });
    assert.deepEqual(second.values, first.values);
    assert.deepEqual(second.changedKeys, []);
    assert.ok(Object.values(second.actions).every((action) => action === "유지"));
  });

  it("포트만 바꾸면 URL·origin 의 포트만 갱신하고 비밀번호는 유지한다", () => {
    const first = plan();
    const moved = plan({ existing: first.values, ports: { pg: 55500, api: 4200, web: 5300 } });
    const before = assertLocalPostgresUrl(first.values[ENV_KEYS.databaseUrl], "before");
    const after = assertLocalPostgresUrl(moved.values[ENV_KEYS.databaseUrl], "after");
    assert.equal(after.port, 55500);
    assert.equal(after.password, before.password);
    assert.equal(moved.values[ENV_KEYS.testPassword], first.values[ENV_KEYS.testPassword]);
    assert.equal(moved.values[ENV_KEYS.apiOrigin], "http://127.0.0.1:4200");
    assert.equal(moved.actions[ENV_KEYS.databaseUrl], "갱신(포트)");
    assert.equal(moved.actions[ENV_KEYS.webOrigin], "갱신(포트)");
  });

  it("--rotate-secrets 는 비밀값과 DB 비밀번호만 새로 만들고 계정 이메일·ID 는 유지한다", () => {
    const first = plan();
    const rotated = plan({ existing: first.values, rotateSecrets: true });
    for (const key of [ENV_KEYS.testPassword, ENV_KEYS.sessionSecret, ENV_KEYS.stateSecret]) {
      assert.notEqual(rotated.values[key], first.values[key], key);
      assert.equal(rotated.actions[key], "회전");
    }
    assert.notEqual(rotated.values[ENV_KEYS.databaseUrl], first.values[ENV_KEYS.databaseUrl]);
    assert.notEqual(rotated.values[ENV_KEYS.migrationDatabaseUrl], first.values[ENV_KEYS.migrationDatabaseUrl]);
    assert.equal(rotated.values[ENV_KEYS.testEmail], first.values[ENV_KEYS.testEmail]);
    assert.equal(rotated.values[ENV_KEYS.testUserId], first.values[ENV_KEYS.testUserId]);
  });

  it("형식이 깨진 비밀값·이메일은 새로 만들고 정상 값은 건드리지 않는다", () => {
    const first = plan();
    const broken = plan({
      existing: { ...first.values, [ENV_KEYS.testPassword]: "short", [ENV_KEYS.testEmail]: "not-an-email" },
      random: sequentialRandom(),
    });
    assert.notEqual(broken.values[ENV_KEYS.testPassword], "short");
    assert.equal(broken.actions[ENV_KEYS.testPassword], "생성");
    assert.notEqual(broken.values[ENV_KEYS.testEmail], "not-an-email");
    assert.equal(broken.values[ENV_KEYS.sessionSecret], first.values[ENV_KEYS.sessionSecret]);
  });

  it("환경변수로만 지정된 값은 파일에 없으면 changedKeys 에 포함해 기록되게 한다", () => {
    const first = plan();
    const onlyInEnvironment = plan({ existing: first.values, persisted: { ...first.values, [ENV_KEYS.stackDir]: undefined } });
    assert.deepEqual(onlyInEnvironment.changedKeys, [ENV_KEYS.stackDir]);
  });
});

describe("planHarnessEnv: 운영 보호(원격 값은 새로 만들지 않고 중단)", () => {
  const remoteDatabase = ["postgresql://", "someone", ":", "secretvalue-0123456789", "@", "db.example-project.supabase.co:5432", "/postgres"].join("");

  it("기존 런타임 DB URL 이 원격이면 가드 오류", () => {
    assert.throws(
      () => plan({ existing: { [ENV_KEYS.databaseUrl]: remoteDatabase } }),
      (error) => {
        assert.ok(error instanceof GuardViolationError);
        assert.ok(!error.message.includes("secretvalue"), "비밀번호가 메시지에 노출됨");
        return true;
      },
    );
  });

  it("기존 마이그레이션 DB URL 이 원격이면 가드 오류(회전 모드에서도 동일)", () => {
    assert.throws(() => plan({ existing: { [ENV_KEYS.migrationDatabaseUrl]: remoteDatabase }, rotateSecrets: true }), GuardViolationError);
  });

  it("기존 origin 이 운영 도메인이면 가드 오류", () => {
    assert.throws(() => plan({ existing: { [ENV_KEYS.apiOrigin]: "https://www.toonstudio.cloud" } }), GuardViolationError);
    assert.throws(() => plan({ existing: { [ENV_KEYS.webOrigin]: "http://example.com:5273" } }), GuardViolationError);
  });

  it("assertHarnessValuesLocal 도 원격 값을 거부한다", () => {
    assert.throws(() => assertHarnessValuesLocal({ [ENV_KEYS.databaseUrl]: remoteDatabase }), GuardViolationError);
  });
});

describe("collectSecretValues / summarizePlan", () => {
  it("계정·세션 비밀·DB 비밀번호와 전체 URL 을 누출 검사 대상으로 모은다", () => {
    const { values } = plan();
    const secrets = collectSecretValues(values);
    const keys = secrets.map((entry) => entry.key);
    for (const expected of [ENV_KEYS.testEmail, ENV_KEYS.testPassword, ENV_KEYS.testUserId, ENV_KEYS.sessionSecret, ENV_KEYS.stateSecret, ENV_KEYS.databaseUrl, ENV_KEYS.migrationDatabaseUrl, `${ENV_KEYS.databaseUrl}(비밀번호)`, `${ENV_KEYS.migrationDatabaseUrl}(비밀번호)`]) {
      assert.ok(keys.includes(expected), expected);
    }
    assert.ok(secrets.every((entry) => entry.value.length > 0));
  });

  it("요약에는 길이와 민감 여부만 담는다(값은 담지 않는다)", () => {
    const { values, actions, changedKeys } = plan();
    const rows = summarizePlan({ values, actions, changedKeys });
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ["action", "key", "length", "sensitive"]);
    }
    assert.equal(rows.find((row) => row.key === ENV_KEYS.testPassword).sensitive, true);
    assert.equal(rows.find((row) => row.key === ENV_KEYS.apiOrigin).sensitive, false);
  });
});
