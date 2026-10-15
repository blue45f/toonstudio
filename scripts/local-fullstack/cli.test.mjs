import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMANDS, UsageError, helpText, parseCliArguments } from "./cli.mjs";
import { ENV_KEYS } from "./lib/config.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "cli.mjs");

// 합성 값(리터럴 연결 문자열이 소스에 남지 않도록 조립한다).
const REMOTE_PASSWORD = "remote-password-0123456789abcdef";
const REMOTE_DATABASE_URL = ["postgresql://", "prod_user", ":", REMOTE_PASSWORD, "@", "prod-db.example-project.supabase.co:5432", "/postgres"].join("");
const UNRESOLVABLE_REMOTE_URL = ["postgresql://", "prod_user", ":", REMOTE_PASSWORD, "@", "prod-db.invalid:5432", "/postgres"].join("");

function createSandbox() {
  const directory = mkdtempSync(join(tmpdir(), "local-fullstack-cli-"));
  const envFile = join(directory, ".env.infrastructure.local");
  const stackDirectory = join(directory, "stack");
  return {
    directory,
    envFile,
    stackDirectory,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

/** 호출 셸의 환경을 물려받지 않는다: 실제 .env.infrastructure.local·스택을 건드릴 수 없게 격리한다. */
function runCli(sandbox, args, extraEnvironment = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: sandbox.directory,
      TOONSTUDIO_LOCAL_ENV_FILE: sandbox.envFile,
      TOONSTUDIO_LOCAL_STACK_DIR: sandbox.stackDirectory,
      ...extraEnvironment,
    },
  });
}

function listTree(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true }).map(String).sort();
}

describe("인자 해석", () => {
  it("명령과 옵션을 해석하고 값이 필요한 옵션의 누락을 거부한다", () => {
    const parsed = parseCliArguments(["up", "--dry-run", "--no-web", "--pg-port", "55500", "--api-port=4200", "--path", "/a", "--path", "/b"]);
    assert.equal(parsed.command, "up");
    assert.equal(parsed.options.dryRun, true);
    assert.equal(parsed.options.noWeb, true);
    assert.equal(parsed.options.pgPort, "55500");
    assert.equal(parsed.options.apiPort, "4200");
    assert.deepEqual(parsed.options.paths, ["/a", "/b"]);
    assert.throws(() => parseCliArguments(["up", "--pg-port"]), UsageError);
    assert.throws(() => parseCliArguments(["up", "--pg-port", "--dry-run"]), UsageError);
    assert.throws(() => parseCliArguments(["up", "--unknown"]), /알 수 없는 인자/u);
  });

  it("e2e 는 -- 뒤 인자를 Playwright 로 넘기고 smoke 는 자체 옵션을 그대로 받는다", () => {
    assert.deepEqual(parseCliArguments(["e2e", "--", "--headed", "--grep", "x"]).options.passthrough, ["--headed", "--grep", "x"]);
    assert.deepEqual(parseCliArguments(["smoke", "--skip-web", "--json"]).options.passthrough, ["--skip-web", "--json"]);
  });

  it("도움말에 모든 명령이 있고 운영 보호 문구가 포함된다", () => {
    const help = helpText();
    for (const name of Object.keys(COMMANDS)) assert.ok(help.includes(name), name);
    assert.match(help, /127\.0\.0\.1\/localhost/u);
  });
});

describe("CLI 기본 동작", () => {
  it("help 는 0, 알 수 없는 명령·옵션은 2 로 끝난다", () => {
    const sandbox = createSandbox();
    try {
      const help = runCli(sandbox, ["help"]);
      assert.equal(help.status, 0);
      assert.match(help.stdout, /사용법/u);
      assert.equal(runCli(sandbox, ["nope"]).status, 2);
      assert.equal(runCli(sandbox, ["up", "--nope"]).status, 2);
      assert.deepEqual(listTree(sandbox.directory), [], "도움말·오류는 어떤 파일도 만들지 않는다");
    } finally {
      sandbox.cleanup();
    }
  });

  it("up --dry-run 은 계획만 출력하고 파일·디렉터리를 만들지 않으며 값은 출력하지 않는다", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(sandbox, ["up", "--dry-run"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /dry-run/u);
      for (const key of Object.values(ENV_KEYS)) assert.ok(result.stdout.includes(key), key);
      assert.match(result.stdout, /길이 \d+\(비공개\)/u);
      assert.ok(!/postgresql:\/\/[^\s|]*@/u.test(result.stdout), "DB URL 원문이 출력되면 안 된다");
      assert.deepEqual(listTree(sandbox.directory), []);
    } finally {
      sandbox.cleanup();
    }
  });
});

describe("운영 보호: 로컬이 아닌 호스트면 어떤 부작용도 없이 즉시 중단(exit 3)", () => {
  const guardedCommands = [
    ["up", "--dry-run"],
    ["up"],
    ["db:start"],
    ["schema"],
    ["seed"],
    ["api:start"],
    ["web:start"],
    ["status"],
    ["e2e"],
  ];
  for (const command of guardedCommands) {
    it(`${command.join(" ")} — 환경변수의 운영 DB URL`, () => {
      const sandbox = createSandbox();
      try {
        const result = runCli(sandbox, command, {
          [ENV_KEYS.databaseUrl]: UNRESOLVABLE_REMOTE_URL,
          [ENV_KEYS.migrationDatabaseUrl]: UNRESOLVABLE_REMOTE_URL,
        });
        assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /운영 보호로 중단/u);
        // 접속을 시도했다면 DNS 오류(ENOTFOUND)가 났을 것이다. 가드가 먼저 막았는지 확인한다.
        assert.ok(!/ENOTFOUND|EAI_AGAIN|ECONNREFUSED/u.test(`${result.stdout}${result.stderr}`));
        assert.ok(!`${result.stdout}${result.stderr}`.includes(REMOTE_PASSWORD), "비밀번호가 출력되면 안 된다");
        assert.deepEqual(listTree(sandbox.directory), [], "스택 디렉터리·비밀 파일을 만들면 안 된다");
      } finally {
        sandbox.cleanup();
      }
    });
  }

  it("비밀 파일에 들어 있는 운영 DB URL 도 덮어쓰지 않고 중단하며 파일은 그대로다", () => {
    const sandbox = createSandbox();
    try {
      const original = `# 다른 작업의 값\nCLOUDFLARE_API_TOKEN=keep-me\n${ENV_KEYS.databaseUrl}=${REMOTE_DATABASE_URL}\n`;
      writeFileSync(sandbox.envFile, original, { mode: 0o600 });
      const before = statSync(sandbox.envFile).mtimeMs;
      for (const command of [["up"], ["up", "--rotate-secrets"], ["db:start"], ["seed"]]) {
        const result = runCli(sandbox, command);
        assert.equal(result.status, 3, `${command.join(" ")}: ${result.stderr}`);
        assert.ok(!`${result.stdout}${result.stderr}`.includes(REMOTE_PASSWORD));
      }
      assert.equal(readFileSync(sandbox.envFile, "utf8"), original);
      assert.equal(statSync(sandbox.envFile).mtimeMs, before);
      assert.ok(!existsSync(sandbox.stackDirectory));
    } finally {
      sandbox.cleanup();
    }
  });

  it("운영 도메인 origin 이면 로그인 자격증명을 보내는 스모크도 요청 전에 중단한다", () => {
    const sandbox = createSandbox();
    try {
      for (const key of [ENV_KEYS.apiOrigin, ENV_KEYS.webOrigin]) {
        const result = runCli(sandbox, ["smoke"], {
          [ENV_KEYS.apiOrigin]: key === ENV_KEYS.apiOrigin ? "https://www.toonstudio.cloud" : "http://127.0.0.1:4101",
          [ENV_KEYS.webOrigin]: key === ENV_KEYS.webOrigin ? "https://www.toonstudio.cloud" : "http://127.0.0.1:5273",
          [ENV_KEYS.testEmail]: "someone@toonstudio-local.test",
          [ENV_KEYS.testPassword]: "a-password-that-must-never-be-sent-0123",
          [ENV_KEYS.testUserId]: "00000000-0000-4000-8000-000000000000",
        });
        assert.equal(result.status, 3, `${key}: ${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /운영 보호/u);
        assert.ok(!`${result.stdout}${result.stderr}`.includes("must-never-be-sent"));
      }
    } finally {
      sandbox.cleanup();
    }
  });

  it("DB URL 의 query 로 호스트를 덮어쓰는 우회도 막는다", () => {
    const sandbox = createSandbox();
    try {
      const sneaky = ["postgresql://", "u", ":", REMOTE_PASSWORD, "@", "127.0.0.1:55452", "/db?host=prod-db.example-project.supabase.co"].join("");
      const result = runCli(sandbox, ["up", "--dry-run"], { [ENV_KEYS.databaseUrl]: sneaky });
      assert.equal(result.status, 3);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(REMOTE_PASSWORD));
    } finally {
      sandbox.cleanup();
    }
  });
});

describe("운영 보호: 호출 셸의 DATABASE_URL 등이 로컬이 아니면 시작하지 않는다(exit 3)", () => {
  const environmentNames = ["DATABASE_URL", "MIGRATION_DATABASE_URL", "PRODUCTION_DATABASE_DIRECT_URL", "TEST_DATABASE_URL"];
  const guardedCommands = [["up", "--dry-run"], ["up"], ["db:start"], ["schema"], ["seed"], ["api:start"], ["web:start"], ["status"], ["e2e"], ["smoke"]];

  for (const name of environmentNames) {
    it(`${name}=운영 호스트 — DB 접속·프로세스 기동 명령은 부작용 없이 중단`, () => {
      const sandbox = createSandbox();
      try {
        for (const command of guardedCommands) {
          const result = runCli(sandbox, command, { [name]: UNRESOLVABLE_REMOTE_URL });
          assert.equal(result.status, 3, `${command.join(" ")}: ${result.stdout}${result.stderr}`);
          assert.match(result.stderr, /운영 보호로 중단/u);
          assert.ok(result.stderr.includes(name), "어느 변수가 문제인지 알려야 한다");
          assert.match(result.stderr, /unset/u);
          assert.ok(!`${result.stdout}${result.stderr}`.includes(REMOTE_PASSWORD), "비밀번호가 출력되면 안 된다");
          assert.ok(!/ENOTFOUND|EAI_AGAIN|ECONNREFUSED/u.test(`${result.stdout}${result.stderr}`), "접속을 시도하면 안 된다");
        }
        assert.deepEqual(listTree(sandbox.directory), [], "스택 디렉터리·비밀 파일을 만들면 안 된다");
      } finally {
        sandbox.cleanup();
      }
    });
  }

  it("로컬 호스트의 DATABASE_URL 은 막지 않고, 중지·정리·진단 명령은 원격 값이 있어도 막지 않는다", () => {
    const sandbox = createSandbox();
    try {
      const local = ["postgresql://", "dev", ":", "dev-password-0123456789", "@127.0.0.1:55432/webdex"].join("");
      assert.equal(runCli(sandbox, ["up", "--dry-run"], { DATABASE_URL: local }).status, 0);
      for (const command of [["down"], ["reset", "--dry-run"], ["db:stop"], ["api:stop"], ["web:stop"]]) {
        const result = runCli(sandbox, command, { DATABASE_URL: UNRESOLVABLE_REMOTE_URL });
        assert.notEqual(result.status, 3, `${command.join(" ")}: ${result.stderr}`);
        assert.notEqual(result.status, 2, `${command.join(" ")}: ${result.stderr}`);
      }
    } finally {
      sandbox.cleanup();
    }
  });

  it("check 는 원격 DATABASE_URL 을 FAIL 행으로 보고하되 비밀번호는 출력하지 않는다", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(sandbox, ["check"], { DATABASE_URL: UNRESOLVABLE_REMOTE_URL });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /\| FAIL \| 환경변수 DB 설정 \|/u);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(REMOTE_PASSWORD));
      assert.deepEqual(listTree(sandbox.directory), [], "check 는 파일을 만들지 않는다");
    } finally {
      sandbox.cleanup();
    }
  });
});

describe("reset / down / leakcheck / status (격리 디렉터리)", () => {
  function prepareStack(sandbox) {
    mkdirSync(join(sandbox.stackDirectory, "pg", "data"), { recursive: true });
    mkdirSync(join(sandbox.stackDirectory, "logs"), { recursive: true });
    writeFileSync(join(sandbox.stackDirectory, "pg", "data", "PG_VERSION"), "17\n");
    writeFileSync(join(sandbox.stackDirectory, ".toonstudio-local-fullstack"), "marker\n");
  }

  const SECRET_PASSWORD = "Zy8-planted-test-password-0123456789";
  function writeHarnessEnv(sandbox, extraLines = []) {
    const lines = [
      "# 다른 서비스 값(보존되어야 함)",
      "OTHER_SERVICE_KEY=keep-me",
      `${ENV_KEYS.testEmail}=local-qa-deadbeef@toonstudio-local.test`,
      `${ENV_KEYS.testPassword}=${SECRET_PASSWORD}`,
      `${ENV_KEYS.testUserId}=00000000-0000-4000-8000-0000000000aa`,
      `${ENV_KEYS.apiOrigin}=http://127.0.0.1:4101`,
      `${ENV_KEYS.webOrigin}=http://127.0.0.1:5273`,
      ...extraLines,
      "",
    ];
    writeFileSync(sandbox.envFile, lines.join("\n"), { mode: 0o600 });
  }

  it("reset 은 --yes 없이는 아무것도 지우지 않는다(exit 2), --dry-run 은 0", () => {
    const sandbox = createSandbox();
    try {
      prepareStack(sandbox);
      const refused = runCli(sandbox, ["reset"]);
      assert.equal(refused.status, 2);
      assert.match(refused.stdout, /--yes/u);
      assert.ok(existsSync(join(sandbox.stackDirectory, "pg", "data", "PG_VERSION")));
      const dry = runCli(sandbox, ["reset", "--dry-run"]);
      assert.equal(dry.status, 0);
      assert.ok(existsSync(join(sandbox.stackDirectory, "pg", "data", "PG_VERSION")));
    } finally {
      sandbox.cleanup();
    }
  });

  it("reset --yes 는 표식이 있는 스택의 DB 데이터만 지우고 비밀 파일은 건드리지 않는다", () => {
    const sandbox = createSandbox();
    try {
      prepareStack(sandbox);
      writeHarnessEnv(sandbox);
      const before = readFileSync(sandbox.envFile, "utf8");
      const result = runCli(sandbox, ["reset", "--yes"]);
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
      assert.ok(!existsSync(join(sandbox.stackDirectory, "pg", "data")));
      assert.ok(existsSync(join(sandbox.stackDirectory, ".toonstudio-local-fullstack")), "표식·스택 디렉터리는 남긴다");
      assert.equal(readFileSync(sandbox.envFile, "utf8"), before);
    } finally {
      sandbox.cleanup();
    }
  });

  it("표식이 없는 디렉터리는 reset --yes 로도 지우지 않는다", () => {
    const sandbox = createSandbox();
    try {
      mkdirSync(join(sandbox.stackDirectory, "pg", "data"), { recursive: true });
      writeFileSync(join(sandbox.stackDirectory, "pg", "data", "PG_VERSION"), "17\n");
      const result = runCli(sandbox, ["reset", "--yes"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /표식/u);
      assert.ok(existsSync(join(sandbox.stackDirectory, "pg", "data", "PG_VERSION")));
    } finally {
      sandbox.cleanup();
    }
  });

  it("down 은 아무것도 실행 중이 아니면 0 으로 끝난다", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(sandbox, ["down"]);
      assert.equal(result.status, 0, result.stderr);
    } finally {
      sandbox.cleanup();
    }
  });

  it("leakcheck 는 로그에 심어 둔 비밀값을 찾아 키 이름만 보고하고(값은 출력하지 않음), 깨끗하면 0 이다", () => {
    const sandbox = createSandbox();
    try {
      prepareStack(sandbox);
      writeHarnessEnv(sandbox);
      const clean = runCli(sandbox, ["leakcheck"]);
      assert.equal(clean.status, 0, `${clean.stdout}${clean.stderr}`);
      assert.match(clean.stdout, /누출 없음/u);

      writeFileSync(join(sandbox.stackDirectory, "logs", "api.log"), `요청 실패: password=${SECRET_PASSWORD}\n`);
      const leaked = runCli(sandbox, ["leakcheck"]);
      assert.equal(leaked.status, 1);
      assert.match(leaked.stdout, new RegExp(ENV_KEYS.testPassword, "u"));
      assert.match(leaked.stdout, /1건/u);
      assert.ok(!`${leaked.stdout}${leaked.stderr}`.includes(SECRET_PASSWORD), "비밀값이 검사 결과에 출력되면 안 된다");

      const extra = join(sandbox.directory, "extra.txt");
      writeFileSync(extra, SECRET_PASSWORD);
      writeFileSync(join(sandbox.stackDirectory, "logs", "api.log"), "정상 로그\n");
      const viaPath = runCli(sandbox, ["leakcheck", "--path", extra]);
      assert.equal(viaPath.status, 1);
      assert.ok(viaPath.stdout.includes(extra));
    } finally {
      sandbox.cleanup();
    }
  });

  it("status 는 값 없이 키 개수·헬스만 보여 준다", () => {
    const sandbox = createSandbox();
    try {
      prepareStack(sandbox);
      writeHarnessEnv(sandbox);
      const result = runCli(sandbox, ["status", "--api-port", "4101", "--web-port", "5273"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /\| API \| 아니오 \|/u);
      assert.match(result.stdout, /기록된 비밀 키/u);
      assert.ok(!result.stdout.includes(SECRET_PASSWORD));
      assert.ok(!result.stdout.includes("local-qa-deadbeef"));
    } finally {
      sandbox.cleanup();
    }
  });
});
