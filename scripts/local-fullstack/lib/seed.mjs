/**
 * 시드 테스트 계정 로직(의존성 주입 가능 → 단위 테스트에서 가짜 DB 클라이언트로 검증).
 *
 * 운영에서는 이메일 가입이 꺼져 있어(disabled) 계정을 만들 수 없으므로, 로컬 DB 에 "이메일 인증 완료"
 * 일반 사용자 1명을 직접 만든다. 비밀번호 해시·정책·이메일 형식 검사는 앱의 실제 함수
 * (apps/api 의 hashPassword · passwordPolicyError · isValidSignupEmail)를 그대로 주입받아 쓴다.
 */

export const SEED_RESULT_PREFIX = "LOCAL_FULLSTACK_SEED_RESULT ";

export const TEST_ACCOUNT_DISPLAY_NAME = "Local QA";

/**
 * @param {object} options
 * @param {{ query: (text: string, values?: unknown[]) => Promise<{ rowCount: number | null, rows: any[] }> }} options.client
 * @param {{ id: string, email: string, password: string }} options.desired
 * @param {{
 *   hashPassword: (password: string) => Promise<string>,
 *   verifyPassword: (password: string, stored: string | null | undefined) => Promise<{ valid: boolean, needsRehash: boolean }>,
 *   passwordPolicyError: (password: string) => string | null,
 *   isValidSignupEmail: (email: string) => boolean,
 * }} options.deps
 * @returns {Promise<{ action: "created" | "updated" | "unchanged", userId: string }>}
 */
export async function seedTestUser({ client, desired, deps }) {
  const policyError = deps.passwordPolicyError(desired.password);
  if (policyError) throw new Error(`테스트 비밀번호가 앱의 비밀번호 정책을 통과하지 못했습니다: ${policyError}`);
  if (desired.password.length < 24) {
    throw new Error("테스트 비밀번호는 24자 이상이어야 합니다.");
  }
  if (!deps.isValidSignupEmail(desired.email)) {
    throw new Error("테스트 이메일이 앱의 가입 이메일 형식 검사(isValidSignupEmail)를 통과하지 못했습니다.");
  }

  await client.query("BEGIN");
  try {
    const found = await client.query(
      `SELECT id, "passwordHash", "emailVerified", status, role FROM "user" WHERE email = $1 FOR UPDATE`,
      [desired.email],
    );
    if ((found.rowCount ?? 0) === 0) {
      const passwordHash = await deps.hashPassword(desired.password);
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "passwordHash", "createdAt")
         VALUES ($1, $2, $3, now(), $4, now())`,
        [desired.id, TEST_ACCOUNT_DISPLAY_NAME, desired.email, passwordHash],
      );
      await client.query("COMMIT");
      return { action: "created", userId: desired.id };
    }

    const row = found.rows[0];
    const credential = await deps.verifyPassword(desired.password, row.passwordHash);
    const credentialCurrent = credential.valid && !credential.needsRehash;
    const healthy = credentialCurrent
      && row.emailVerified !== null
      && row.status === "active"
      && row.role === "user";
    if (healthy) {
      await client.query("COMMIT");
      return { action: "unchanged", userId: row.id };
    }

    const passwordHash = credentialCurrent ? row.passwordHash : await deps.hashPassword(desired.password);
    await client.query(
      `UPDATE "user"
         SET "passwordHash" = $2,
             "emailVerified" = COALESCE("emailVerified", now()),
             status = 'active',
             role = 'user',
             "deletedAt" = NULL,
             "suspendedAt" = NULL,
             "suspensionReason" = NULL
       WHERE id = $1`,
      [row.id, passwordHash],
    );
    await client.query("COMMIT");
    return { action: "updated", userId: row.id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** 시드 러너의 마지막 결과 줄을 해석한다(비밀값은 포함되지 않는다). */
export function parseSeedResult(stdout) {
  for (const line of String(stdout ?? "").split(/\r?\n/u).reverse()) {
    if (!line.startsWith(SEED_RESULT_PREFIX)) continue;
    try {
      const parsed = JSON.parse(line.slice(SEED_RESULT_PREFIX.length));
      if (
        ["created", "updated", "unchanged"].includes(parsed?.action)
        && typeof parsed?.userId === "string"
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}
