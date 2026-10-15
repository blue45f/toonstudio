import assert from "node:assert/strict";

import { SEED_RESULT_PREFIX, TEST_ACCOUNT_DISPLAY_NAME, parseSeedResult, seedTestUser } from "./seed.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const DESIRED = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "local-qa-0123abcd@toonstudio-local.test",
  password: "Zx9-fake-password-for-unit-test-0123456789",
};
const FAKE_HASH = "scrypt$v2$16384$8$1$64$fake-salt$fake-hash";

function fakeDependencies(overrides = {}) {
  const calls = { hash: 0, verify: 0 };
  return {
    calls,
    deps: {
      hashPassword: async () => {
        calls.hash += 1;
        return FAKE_HASH;
      },
      verifyPassword: async (password, stored) => {
        calls.verify += 1;
        return { valid: stored === FAKE_HASH, needsRehash: false };
      },
      passwordPolicyError: () => null,
      isValidSignupEmail: () => true,
      ...overrides,
    },
  };
}

function fakeClient(rows) {
  const queries = [];
  return {
    queries,
    query: async (text, values = []) => {
      queries.push({ text: text.replace(/\s+/gu, " ").trim(), values });
      if (/^SELECT/iu.test(text.trim())) return { rowCount: rows.length, rows };
      return { rowCount: 1, rows: [] };
    },
  };
}

describe("seedTestUser", () => {
  it("계정이 없으면 이메일 인증 완료 상태로 만든다(앱의 hashPassword 사용, 비밀번호는 SQL 본문에 없다)", async () => {
    const client = fakeClient([]);
    const { deps, calls } = fakeDependencies();
    const result = await seedTestUser({ client, desired: DESIRED, deps });
    assert.deepEqual(result, { action: "created", userId: DESIRED.id });
    assert.equal(calls.hash, 1);
    const insert = client.queries.find((query) => query.text.startsWith("INSERT INTO"));
    assert.ok(insert, "INSERT 가 실행되어야 한다");
    assert.match(insert.text, /"emailVerified"/u);
    assert.match(insert.text, /now\(\)/u);
    assert.deepEqual(insert.values, [DESIRED.id, TEST_ACCOUNT_DISPLAY_NAME, DESIRED.email, FAKE_HASH]);
    for (const query of client.queries) {
      assert.ok(!query.text.includes(DESIRED.password), "SQL 본문에 비밀번호가 들어가면 안 된다");
    }
    assert.deepEqual(client.queries.map((query) => query.text.split(" ")[0]), ["BEGIN", "SELECT", "INSERT", "COMMIT"]);
  });

  it("이미 정상이면 아무것도 바꾸지 않고 기존 사용자 ID 를 돌려준다", async () => {
    const existing = { id: "11111111-1111-4111-8111-111111111111", passwordHash: FAKE_HASH, emailVerified: new Date(), status: "active", role: "user" };
    const client = fakeClient([existing]);
    const { deps, calls } = fakeDependencies();
    const result = await seedTestUser({ client, desired: DESIRED, deps });
    assert.deepEqual(result, { action: "unchanged", userId: existing.id });
    assert.equal(calls.hash, 0);
    assert.ok(!client.queries.some((query) => /^(INSERT|UPDATE)/u.test(query.text)));
  });

  it("이메일 미인증·정지·비밀번호 불일치 계정은 정상 상태로 되돌린다", async () => {
    const broken = { id: "22222222-2222-4222-8222-222222222222", passwordHash: "scrypt$v2$other", emailVerified: null, status: "suspended", role: "admin" };
    const client = fakeClient([broken]);
    const { deps, calls } = fakeDependencies();
    const result = await seedTestUser({ client, desired: DESIRED, deps });
    assert.deepEqual(result, { action: "updated", userId: broken.id });
    assert.equal(calls.hash, 1);
    const update = client.queries.find((query) => query.text.startsWith("UPDATE"));
    assert.match(update.text, /"emailVerified" = COALESCE\("emailVerified", now\(\)\)/u);
    assert.match(update.text, /status = 'active'/u);
    assert.match(update.text, /role = 'user'/u);
    assert.deepEqual(update.values, [broken.id, FAKE_HASH]);
  });

  it("비밀번호 정책·길이·이메일 형식 검사를 앱 함수로 먼저 통과시킨다(실패 시 DB 에 접근하지 않음)", async () => {
    const client = fakeClient([]);
    await assert.rejects(
      () => seedTestUser({ client, desired: DESIRED, deps: fakeDependencies({ passwordPolicyError: () => "너무 짧아요" }).deps }),
      /정책/u,
    );
    await assert.rejects(
      () => seedTestUser({ client, desired: { ...DESIRED, password: "short-but-policy-ok" }, deps: fakeDependencies().deps }),
      /24자/u,
    );
    await assert.rejects(
      () => seedTestUser({ client, desired: DESIRED, deps: fakeDependencies({ isValidSignupEmail: () => false }).deps }),
      /isValidSignupEmail/u,
    );
    assert.equal(client.queries.length, 0);
  });

  it("쿼리 중 오류가 나면 롤백하고 오류를 그대로 전달한다", async () => {
    const queries = [];
    const client = {
      query: async (text) => {
        queries.push(text.trim().split(/\s+/u)[0]);
        if (/^SELECT/iu.test(text.trim())) throw new Error("연결 끊김");
        return { rowCount: 0, rows: [] };
      },
    };
    await assert.rejects(() => seedTestUser({ client, desired: DESIRED, deps: fakeDependencies().deps }), /연결 끊김/u);
    assert.deepEqual(queries, ["BEGIN", "SELECT", "ROLLBACK"]);
  });
});

describe("parseSeedResult", () => {
  it("러너의 마지막 결과 줄만 해석하고 잘못된 줄은 무시한다", () => {
    const stdout = `경고 줄\n${SEED_RESULT_PREFIX}${JSON.stringify({ action: "created", userId: "id-1" })}\n`;
    assert.deepEqual(parseSeedResult(stdout), { action: "created", userId: "id-1" });
    assert.equal(parseSeedResult(`${SEED_RESULT_PREFIX}{깨짐`), null);
    assert.equal(parseSeedResult(`${SEED_RESULT_PREFIX}${JSON.stringify({ action: "dropped", userId: "x" })}`), null);
    assert.equal(parseSeedResult(""), null);
  });
});
