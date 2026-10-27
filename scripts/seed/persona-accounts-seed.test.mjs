import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ORGANIC_PERSONA_ACCOUNTS } from "./persona-accounts-catalog.mjs";
import {
  buildPersonaSeedPayloads,
  containsTestGiveaway,
  generateStrongOrganicPassword,
  hashPasswordV2,
  isValidSignupEmail,
  parseEnvContent,
  passwordPolicyError,
  resolveOrGeneratePersonaPasswords,
  seedPersonaAccounts,
  syncLocalAccountEnvFiles,
  validatePersonaCatalog,
  verifyPasswordV2,
} from "./persona-accounts-seed.mjs";

test("유기적 일반 유저·창작자 페르소나 카탈로그가 정책 및 테스트 흔적 금지 규칙을 통과한다", () => {
  assert.equal(ORGANIC_PERSONA_ACCOUNTS.length, 12);
  assert.equal(validatePersonaCatalog(ORGANIC_PERSONA_ACCOUNTS), true);

  const creatorCount = ORGANIC_PERSONA_ACCOUNTS.filter(
    (p) => p.creatorRoleProfile.primaryRole !== null,
  ).length;
  const readerCount = ORGANIC_PERSONA_ACCOUNTS.filter(
    (p) => p.creatorRoleProfile.primaryRole === null,
  ).length;
  assert.equal(creatorCount, 10);
  assert.equal(readerCount, 2);

  for (const persona of ORGANIC_PERSONA_ACCOUNTS) {
    assert.equal(isValidSignupEmail(persona.email), true);
    assert.equal(containsTestGiveaway(persona.name), false);
    assert.equal(containsTestGiveaway(persona.email), false);
    assert.equal(containsTestGiveaway(persona.bio), false);
  }
});

test("테스트/데모/QA 티가 나는 이름·이메일·소개글이 포함되면 카탈로그 검증이 거부한다", () => {
  const polluted = structuredClone(ORGANIC_PERSONA_ACCOUNTS);
  polluted[0].name = "테스트작가1";
  assert.throws(() => validatePersonaCatalog(polluted), /forbidden test-account giveaway/i);

  const pollutedEmail = structuredClone(ORGANIC_PERSONA_ACCOUNTS);
  pollutedEmail[1].email = "writer@toonstudio.dev";
  assert.throws(() => validatePersonaCatalog(pollutedEmail), /forbidden test-account giveaway/i);
});

test("scrypt v2 비밀번호 생성·정책 검증·해시 검증이 서버 계약과 일치한다", async () => {
  const pwd = generateStrongOrganicPassword();
  assert.equal(pwd.length, 24);
  assert.equal(passwordPolicyError(pwd), null);
  assert.notEqual(passwordPolicyError("short"), null);

  const hash = await hashPasswordV2(pwd);
  assert.match(hash, /^scrypt\$v2\$16384\$8\$1\$64\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPasswordV2(pwd, hash), true);
  assert.equal(await verifyPasswordV2(`${pwd}!wrong`, hash), false);
});

test("로컬 env 동기화가 기존 키를 보존하고 0600 권한 및 멱등 비밀번호를 유지한다", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "toonstudio-persona-env-"));
  try {
    const envPath = path.join(tmpDir, ".env.test-accounts.local");
    writeFileSync(envPath, 'EXISTING_INFRA_KEY="keep-me-intact"\n', { mode: 0o644 });

    const firstSync = syncLocalAccountEnvFiles({
      personas: ORGANIC_PERSONA_ACCOUNTS,
      envFiles: [envPath],
    });
    const mode = statSync(envPath).mode & 0o777;
    assert.equal(mode, 0o600);

    const parsedFirst = parseEnvContent(readFileSync(envPath, "utf8"));
    assert.equal(parsedFirst.get("EXISTING_INFRA_KEY"), "keep-me-intact");
    assert.equal(parsedFirst.get("TOONSTUDIO_ORGANIC_ACCOUNTS_COUNT"), "12");
    assert.equal(parsedFirst.get("TOONSTUDIO_ACCOUNT_SOLO_CREATOR_NAME"), "윤슬");

    const reusedPasswords = resolveOrGeneratePersonaPasswords(ORGANIC_PERSONA_ACCOUNTS, [envPath]);
    for (const persona of ORGANIC_PERSONA_ACCOUNTS) {
      assert.equal(
        reusedPasswords.get(persona.slug),
        firstSync.passwordBySlug.get(persona.slug),
      );
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("seedPersonaAccounts가 트랜잭션 내에서 계정을 반영하고 admin_member_test_accounts를 정리한다", async () => {
  const samplePersonas = ORGANIC_PERSONA_ACCOUNTS.slice(0, 2);
  const passwordBySlug = new Map(
    samplePersonas.map((p) => [p.slug, generateStrongOrganicPassword()]),
  );
  const payloads = await buildPersonaSeedPayloads(samplePersonas, passwordBySlug);

  const drySummary = await seedPersonaAccounts(null, payloads, { dryRun: true });
  assert.equal(drySummary.dryRun, true);
  assert.equal(drySummary.totalPersonas, 2);

  const executedSql = [];
  const mockClient = {
    async query(sql) {
      executedSql.push(sql.trim());
      if (sql.includes('SELECT id FROM public."user"')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("SELECT id FROM public.wallet_ledger_entry")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("INSERT INTO public.wallet_account")) {
        return { rowCount: 1, rows: [{ availableBalance: 10000 }] };
      }
      if (sql.includes("INSERT INTO public.wallet_lot")) {
        return { rowCount: 1, rows: [{ id: 1 }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };

  const applySummary = await seedPersonaAccounts(mockClient, payloads, { dryRun: false });
  assert.equal(applySummary.dryRun, false);
  assert.equal(applySummary.totalPersonas, 2);
  assert.equal(executedSql[0], "BEGIN");
  assert.equal(executedSql[executedSql.length - 1], "COMMIT");
  assert.equal(
    executedSql.some((s) => s.includes("DELETE FROM public.admin_member_test_accounts")),
    true,
  );
});
