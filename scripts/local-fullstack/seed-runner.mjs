#!/usr/bin/env node
/**
 * 시드 러너: `cli.mjs seed`(또는 up)가 자식 프로세스로 실행한다. 직접 실행하지 않는다.
 *
 * - tsx 로더(`node --import <tsx>`)와 `TSX_TSCONFIG_PATH=apps/api/tsconfig.json` 아래에서 실행되어
 *   앱의 TypeScript 모듈(password.ts, auth.controller.ts)을 그대로 import 한다.
 * - 값은 환경변수로만 받고(인자·로그에 싣지 않음), 결과는 비밀값 없는 한 줄 JSON 으로 출력한다.
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

import { ENV_KEYS, REPOSITORY_ROOT } from "./lib/config.mjs";
import { assertLocalPostgresUrl } from "./lib/guard.mjs";
import { SEED_RESULT_PREFIX, seedTestUser } from "./lib/seed.mjs";

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

async function main() {
  const adminUrl = requiredEnvironment(ENV_KEYS.migrationDatabaseUrl);
  assertLocalPostgresUrl(adminUrl, ENV_KEYS.migrationDatabaseUrl);
  // 컨트롤러 모듈의 import 그래프가 모듈 로드 시점에 DATABASE_URL 을 요구한다(연결은 만들지 않는다).
  assertLocalPostgresUrl(requiredEnvironment("DATABASE_URL"), "DATABASE_URL");

  const apiRoot = join(REPOSITORY_ROOT, "apps", "api", "src");
  const password = await import(pathToFileURL(join(apiRoot, "server", "password.ts")).href);
  const controller = await import(pathToFileURL(join(apiRoot, "modules", "auth", "auth.controller.ts")).href);
  const deps = {
    hashPassword: password.hashPassword,
    verifyPassword: password.verifyPassword,
    passwordPolicyError: password.passwordPolicyError,
    isValidSignupEmail: controller.isValidSignupEmail ?? controller.default?.isValidSignupEmail,
  };
  for (const [name, value] of Object.entries(deps)) {
    if (typeof value !== "function") throw new Error(`앱 함수를 불러오지 못했습니다: ${name}`);
  }

  const client = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const result = await seedTestUser({
      client,
      desired: {
        id: requiredEnvironment(ENV_KEYS.testUserId),
        email: requiredEnvironment(ENV_KEYS.testEmail),
        password: requiredEnvironment(ENV_KEYS.testPassword),
      },
      deps,
    });
    process.stdout.write(`${SEED_RESULT_PREFIX}${JSON.stringify(result)}\n`);
  } finally {
    await client.end();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    // 오류 메시지에 비밀값이 들어가지 않도록 이름과 메시지만 출력한다(스택·쿼리 인자는 출력하지 않음).
    process.stderr.write(`시드 실패: ${error?.name ?? "Error"}: ${String(error?.message ?? error).slice(0, 400)}\n`);
    process.exit(1);
  },
);
