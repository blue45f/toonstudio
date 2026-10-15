/**
 * 로컬 풀스택 하네스의 상수와 경로 계산.
 *
 * - 저장소 루트는 이 파일 위치에서 계산하므로 호출 위치(cwd)에 의존하지 않는다.
 * - 비밀값은 여기서 만들지 않는다. 키 이름·기본 포트·경로 규칙만 둔다.
 */

import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const ENV_FILE_NAME = ".env.infrastructure.local";
export const STACK_MARKER_NAME = ".toonstudio-local-fullstack";

/** .env.infrastructure.local 에 기록하는 키 이름. 값은 터미널·로그·문서에 출력하지 않는다. */
export const ENV_KEYS = Object.freeze({
  testEmail: "TOONSTUDIO_LOCAL_TEST_EMAIL",
  testPassword: "TOONSTUDIO_LOCAL_TEST_PASSWORD",
  testUserId: "TOONSTUDIO_LOCAL_TEST_USER_ID",
  databaseUrl: "TOONSTUDIO_LOCAL_DATABASE_URL",
  apiOrigin: "TOONSTUDIO_LOCAL_API_ORIGIN",
  webOrigin: "TOONSTUDIO_LOCAL_WEB_ORIGIN",
  migrationDatabaseUrl: "TOONSTUDIO_LOCAL_MIGRATION_DATABASE_URL",
  sessionSecret: "TOONSTUDIO_LOCAL_AUTH_SESSION_SECRET",
  stateSecret: "TOONSTUDIO_LOCAL_AUTH_STATE_SECRET",
  stackDir: "TOONSTUDIO_LOCAL_STACK_DIR",
});

/** 값 출력이 금지된 키(계정 식별자 포함). 이 값들은 누출 검사 대상이다. */
export const SENSITIVE_ENV_KEYS = Object.freeze([
  ENV_KEYS.testEmail,
  ENV_KEYS.testPassword,
  ENV_KEYS.testUserId,
  ENV_KEYS.databaseUrl,
  ENV_KEYS.migrationDatabaseUrl,
  ENV_KEYS.sessionSecret,
  ENV_KEYS.stateSecret,
]);

/** 프로세스 환경변수로 하네스 동작을 바꾸는 이름(비밀값 아님). */
export const PROCESS_ENV = Object.freeze({
  envFile: "TOONSTUDIO_LOCAL_ENV_FILE",
  stackDir: ENV_KEYS.stackDir,
  pgPort: "TOONSTUDIO_LOCAL_PG_PORT",
  apiPort: "TOONSTUDIO_LOCAL_API_PORT",
  webPort: "TOONSTUDIO_LOCAL_WEB_PORT",
  e2eGate: "TOONSTUDIO_LOCAL_FULLSTACK_E2E",
});

export const DEFAULTS = Object.freeze({
  // 운영·기존 개발 포트(4001/5173/55432, scripts/local-test-stack.mjs)와 겹치지 않는 값.
  pgPort: 55452,
  apiPort: 4101,
  webPort: 5273,
  databaseName: "toonstudio_local",
  adminRole: "toonstudio_local_admin",
  runtimeRole: "toonstudio_local_runtime",
  // 정확한 버전을 고정한다. 바꾸려면 README 의 "임베디드 PostgreSQL" 절도 함께 갱신한다.
  embeddedPostgresVersion: "17.10.0-beta.17",
  testEmailDomain: "toonstudio-local.test",
});

export const EXIT = Object.freeze({
  ok: 0,
  failure: 1,
  usage: 2,
  guard: 3,
});

export function parsePort(raw, label) {
  const text = String(raw ?? "").trim();
  if (!/^\d{1,5}$/u.test(text)) {
    throw new Error(`${label}: 1024-65535 사이의 정수 포트가 필요합니다.`);
  }
  const port = Number(text);
  if (port < 1024 || port > 65_535) {
    throw new Error(`${label}: 1024-65535 사이의 정수 포트가 필요합니다.`);
  }
  return port;
}

/**
 * 비밀 파일 위치. 기본은 주 작업트리의 .env.infrastructure.local 이다(AGENTS.md §9).
 * 링크된 git worktree 에서 실행해도 주 작업트리의 같은 파일을 가리키도록 git 공통 디렉터리를 따른다.
 */
export function resolveEnvFilePath({
  environment = process.env,
  repositoryRoot = REPOSITORY_ROOT,
  runGit = defaultRunGit,
} = {}) {
  const explicit = environment[PROCESS_ENV.envFile]?.trim();
  if (explicit) return resolve(explicit);
  try {
    const output = runGit(["rev-parse", "--git-common-dir"], repositoryRoot).trim();
    if (output) {
      const commonDirectory = resolve(repositoryRoot, output);
      if (basename(commonDirectory) === ".git") {
        return join(dirname(commonDirectory), ENV_FILE_NAME);
      }
    }
  } catch {
    // git 이 없거나 저장소가 아니면 저장소 루트로 폴백한다.
  }
  return join(repositoryRoot, ENV_FILE_NAME);
}

function defaultRunGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** 상태·로그·임베디드 PostgreSQL 데이터를 두는 디렉터리. */
export function resolveStackDirectory({
  environment = process.env,
  envFileValues = {},
  temporaryDirectory = tmpdir(),
} = {}) {
  const configured = environment[PROCESS_ENV.stackDir]?.trim()
    || envFileValues[ENV_KEYS.stackDir]?.trim();
  const directory = configured ? resolve(configured) : join(temporaryDirectory, "toonstudio-local-fullstack");
  assertSafeStackDirectory(directory);
  return directory;
}

/** 루트·홈·저장소 자체처럼 지우거나 덮으면 위험한 경로를 스택 디렉터리로 쓰지 못하게 한다. */
export function assertSafeStackDirectory(directory) {
  if (!isAbsolute(directory)) {
    throw new Error("스택 디렉터리는 절대 경로여야 합니다.");
  }
  const normalized = resolve(directory);
  const { root } = parse(normalized);
  const depth = normalized.slice(root.length).split(sep).filter(Boolean).length;
  const forbidden = new Set([root, resolve(homedir()), REPOSITORY_ROOT, resolve(tmpdir())]);
  if (depth < 2 || forbidden.has(normalized)) {
    throw new Error(
      `스택 디렉터리로 쓸 수 없는 경로입니다(${normalized}). 전용 하위 디렉터리를 지정하세요.`,
    );
  }
  return normalized;
}

export function stackPaths(stackDirectory) {
  return Object.freeze({
    root: stackDirectory,
    marker: join(stackDirectory, STACK_MARKER_NAME),
    state: join(stackDirectory, "state.json"),
    lock: join(stackDirectory, "lock"),
    tools: join(stackDirectory, "tools"),
    postgresRoot: join(stackDirectory, "pg"),
    postgresData: join(stackDirectory, "pg", "data"),
    postgresTemporary: join(stackDirectory, "pg", "tmp"),
    logs: join(stackDirectory, "logs"),
    browser: join(stackDirectory, "browser"),
  });
}
