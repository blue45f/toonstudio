#!/usr/bin/env node
/**
 * 로컬 풀스택 하네스 CLI.
 *
 *   node scripts/local-fullstack/cli.mjs <명령> [옵션]
 *
 * 임베디드 PostgreSQL + API(Nest) + 웹(Vite)을 127.0.0.1 에만 띄우고, 이메일 인증이 끝난 시드 테스트 계정으로
 * 로그인 흐름을 검증한다. 운영 DB·운영 도메인에는 접속하지 않는다(README.md 참고).
 */

import { fileURLToPath } from "node:url";

import { EXIT } from "./lib/config.mjs";
import {
  commandApiStart,
  commandApiStop,
  commandCheck,
  commandDbStart,
  commandDbStop,
  commandDown,
  commandE2e,
  commandLeakcheck,
  commandReset,
  commandSchema,
  commandSeed,
  commandStatus,
  commandUp,
  commandWebStart,
  commandWebStop,
  redactForOutput,
} from "./lib/commands.mjs";
import { GuardViolationError, assertEnvironmentSafe } from "./lib/guard.mjs";
import { runSmokeCli } from "./smoke.mjs";

export const COMMANDS = Object.freeze({
  check: { run: commandCheck, summary: "환경 사전 점검(읽기 전용)" },
  up: { run: commandUp, summary: "DB 설치·기동 → 스키마 → 시드 계정 → API → 웹 → 헬스 대기(전체 시작)" },
  down: { run: commandDown, summary: "웹·API·PostgreSQL 중지(데이터 보존)" },
  status: { run: commandStatus, summary: "구성요소 상태와 헬스" },
  reset: { run: commandReset, summary: "중지 후 DB 데이터 삭제(--yes 필요, --rotate-secrets 로 비밀값 재생성)" },
  smoke: { run: null, summary: "API 인증 스모크(PASS/FAIL 표). 옵션은 smoke.mjs --help 참고" },
  e2e: { run: commandE2e, summary: "브라우저 인증 스모크(Playwright, 로컬 스택 필요)" },
  leakcheck: { run: commandLeakcheck, summary: "로그·상태 파일에 비밀값이 남았는지 검사(--path 로 대상 추가)" },
  "db:start": { run: commandDbStart, summary: "임베디드 PostgreSQL 설치·초기화·기동" },
  "db:stop": { run: commandDbStop, summary: "PostgreSQL 중지" },
  schema: { run: commandSchema, summary: "빈 DB 에 기준 스키마 + 번호 마이그레이션 적용" },
  seed: { run: commandSeed, summary: "이메일 인증 완료 시드 테스트 계정 생성·보정" },
  "api:start": { run: commandApiStart, summary: "API 기동 후 live/ready 대기" },
  "api:stop": { run: commandApiStop, summary: "API 중지" },
  "web:start": { run: commandWebStart, summary: "웹(Vite) 기동 후 프록시 확인" },
  "web:stop": { run: commandWebStop, summary: "웹 중지" },
});

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

// 중지·정리·진단 명령은 운영 자격증명이 환경에 있어도 막지 않는다(DB 에 접속하거나 프로세스를 띄우지 않는다).
export const ENVIRONMENT_GUARD_EXEMPT = new Set(["check", "down", "db:stop", "api:stop", "web:stop", "reset", "leakcheck"]);

const VALUE_FLAGS = new Map([
  ["--pg-port", "pgPort"],
  ["--api-port", "apiPort"],
  ["--web-port", "webPort"],
  ["--path", "paths"],
]);
const BOOLEAN_FLAGS = new Map([
  ["--dry-run", "dryRun"],
  ["--no-web", "noWeb"],
  ["--rotate-secrets", "rotateSecrets"],
  ["--yes", "yes"],
]);

export function parseCliArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    dryRun: false,
    noWeb: false,
    rotateSecrets: false,
    yes: false,
    pgPort: null,
    apiPort: null,
    webPort: null,
    paths: [],
    passthrough: [],
  };
  // smoke 는 자체 옵션을 가지고, e2e 는 `--` 뒤 인자를 Playwright 로 넘긴다.
  if (command === "smoke") return { command, options: { ...options, passthrough: rest } };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--") {
      options.passthrough = rest.slice(index + 1);
      break;
    }
    const [name, inline] = argument.includes("=") ? [argument.slice(0, argument.indexOf("=")), argument.slice(argument.indexOf("=") + 1)] : [argument, undefined];
    if (BOOLEAN_FLAGS.has(name) && inline === undefined) {
      options[BOOLEAN_FLAGS.get(name)] = true;
      continue;
    }
    if (VALUE_FLAGS.has(name)) {
      const value = inline ?? rest[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${name} 에는 값이 필요합니다.`);
      }
      if (inline === undefined) index += 1;
      const key = VALUE_FLAGS.get(name);
      if (key === "paths") options.paths.push(value);
      else options[key] = value;
      continue;
    }
    throw new UsageError(`알 수 없는 인자: ${argument}`);
  }
  return { command, options };
}

export function helpText() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    "사용법: node scripts/local-fullstack/cli.mjs <명령> [옵션]",
    "",
    "명령:",
    ...Object.entries(COMMANDS).map(([name, entry]) => `  ${name.padEnd(width)}  ${entry.summary}`),
    "",
    "공통 옵션:",
    "  --dry-run           계획만 출력하고 파일·프로세스를 만들지 않습니다(up, down, reset)",
    "  --pg-port N         PostgreSQL 포트(기본 55452)",
    "  --api-port N        API 포트(기본 4101)",
    "  --web-port N        웹 포트(기본 5273)",
    "  --no-web            up 에서 웹 기동을 생략합니다",
    "  --rotate-secrets    비밀값을 새로 만듭니다(reset 과 함께 사용)",
    "  --yes               reset 확인",
    "  --path <경로>       leakcheck 가 추가로 검사할 파일/디렉터리(반복 가능)",
    "",
    "환경변수: TOONSTUDIO_LOCAL_ENV_FILE(비밀 파일 경로), TOONSTUDIO_LOCAL_STACK_DIR(상태·로그·데이터 위치),",
    "          TOONSTUDIO_LOCAL_PG_PORT / _API_PORT / _WEB_PORT",
    "운영 DB·운영 도메인에는 접속하지 않습니다. 호스트가 127.0.0.1/localhost 가 아니면 즉시 중단합니다.",
    "",
  ].join("\n");
}

export async function main(argv) {
  process.umask(0o077);
  if (process.platform === "win32") {
    process.stderr.write("Windows 는 지원하지 않습니다(Linux/macOS 전용).\n");
    return EXIT.failure;
  }
  let parsed;
  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n\n${helpText()}`);
      return EXIT.usage;
    }
    throw error;
  }
  const { command, options } = parsed;
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(helpText());
    return EXIT.ok;
  }
  if (!Object.hasOwn(COMMANDS, command)) {
    process.stderr.write(`알 수 없는 명령: ${command}\n\n${helpText()}`);
    return EXIT.usage;
  }
  try {
    // 방어 심화: DATABASE_URL 등 다른 도구의 DB 설정이 로컬이 아닌 호스트를 가리키는 셸에서는 시작하지 않는다.
    if (!ENVIRONMENT_GUARD_EXEMPT.has(command)) assertEnvironmentSafe(process.env);
    if (command === "smoke") return await runSmokeCli(options.passthrough);
    return await COMMANDS[command].run(options);
  } catch (error) {
    if (error instanceof GuardViolationError) {
      process.stderr.write(`운영 보호로 중단합니다: ${redactForOutput(error.message)}\n`);
      return EXIT.guard;
    }
    process.stderr.write(`실패: ${redactForOutput(String(error?.message ?? error))}\n`);
    return EXIT.failure;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`예상하지 못한 오류: ${redactForOutput(String(error?.stack ?? error))}\n`);
      process.exit(EXIT.failure);
    },
  );
}
