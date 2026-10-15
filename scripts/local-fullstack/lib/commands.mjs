/**
 * cli.mjs 의 명령 구현.
 *
 * 순서 원칙: (1) 값 읽기 → (2) 운영 보호 가드 → (3) 그 다음에야 파일 쓰기·프로세스 기동·DB 접속.
 * 그래서 호스트가 로컬이 아닌 값이 들어오면 어떤 부작용도 만들기 전에 중단한다.
 */

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  DEFAULTS,
  ENV_KEYS,
  EXIT,
  PROCESS_ENV,
  REPOSITORY_ROOT,
  SENSITIVE_ENV_KEYS,
  parsePort,
  resolveStackDirectory,
  stackPaths,
} from "./config.mjs";
import {
  applyEnvUpdates,
  assertGitIgnored,
  inspectEnvFile,
  readEnvFileText,
  writeEnvFileAtomic,
} from "./env-file.mjs";
import {
  assertEnvironmentSafe,
  assertLocalOrigin,
  assertLocalPostgresUrl,
  buildChildEnv,
  redactSecrets,
} from "./guard.mjs";
import {
  assertHarnessValuesLocal,
  collectSecretValues,
  loadHarnessValues,
  planHarnessEnv,
  summarizePlan,
} from "./harness-env.mjs";
import {
  assertCanRunPostgres,
  databaseHasApplicationObjects,
  embeddedPostgresPackageSuffix,
  ensureDatabase,
  ensureEmbeddedPostgres,
  initializeCluster,
  installedEmbeddedVersion,
  runningPostgresPid,
  spawnPostgres,
  stopPostgres,
  waitForPostgres,
} from "./postgres.mjs";
import { httpProbe, isPortFree, isProcessAlive, processMatches } from "./processes.mjs";
import { computeSchemaFingerprint, resolveReleaseSha, runBootstrap } from "./schema.mjs";
import { parseSeedResult } from "./seed.mjs";
import { ensureStackDirectories, hasStackMarker, openLog, patchState, readState, withStackLock } from "./state.mjs";
import {
  resolveTsxLoader,
  resolveViteEntry,
  startApi,
  startWeb,
  stopApi,
  stopWeb,
  tailLog,
  waitForApiReady,
} from "./stack.mjs";

const HARNESS_DIRECTORY = join(REPOSITORY_ROOT, "scripts", "local-fullstack");
const CLI_PATH = "node scripts/local-fullstack/cli.mjs";

let activeSecrets = [];

/** 최종 오류 출력용: 컨텍스트가 만들어진 뒤에는 알려진 비밀값을 가린다. */
export function redactForOutput(text) {
  return redactSecrets(text, activeSecrets);
}

function say(line = "") {
  process.stdout.write(`${redactForOutput(line)}\n`);
}

function warn(line) {
  process.stderr.write(`${redactForOutput(line)}\n`);
}

// ── 컨텍스트 ─────────────────────────────────────────────────────────

function portFromUrl(value) {
  try {
    const port = Number(new URL(String(value)).port);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

export function resolvePorts(options, environment, existing) {
  const pick = (flag, envName, fromExisting, fallback, label) => {
    const raw = flag ?? environment[envName] ?? fromExisting ?? fallback;
    return parsePort(raw, label);
  };
  return {
    pg: pick(options.pgPort, PROCESS_ENV.pgPort, portFromUrl(existing[ENV_KEYS.migrationDatabaseUrl]), DEFAULTS.pgPort, "PostgreSQL 포트"),
    api: pick(options.apiPort, PROCESS_ENV.apiPort, portFromUrl(existing[ENV_KEYS.apiOrigin]), DEFAULTS.apiPort, "API 포트"),
    web: pick(options.webPort, PROCESS_ENV.webPort, portFromUrl(existing[ENV_KEYS.webOrigin]), DEFAULTS.webPort, "웹 포트"),
  };
}

/** 읽기 전용: 값을 모으고 경로를 계산한다(부작용 없음). */
export function loadContext(options, environment = process.env) {
  const { values: existing, envFilePath, fileValues } = loadHarnessValues({ environment });
  const stackDirectory = resolveStackDirectory({ environment, envFileValues: fileValues });
  const paths = stackPaths(stackDirectory);
  const ports = resolvePorts(options, environment, existing);
  const context = { environment, existing, fileValues, envFilePath, paths, ports, stackDirectory };
  activeSecrets = collectSecretValues(existing).map((entry) => entry.value);
  return context;
}

/** 계획을 세우고 최종 가드까지 통과시킨다. 실패하면 GuardViolationError. */
export function planContext(context, options) {
  const plan = planHarnessEnv({
    existing: context.existing,
    persisted: context.fileValues,
    ports: context.ports,
    stackDirectory: context.stackDirectory,
    rotateSecrets: options.rotateSecrets,
  });
  assertHarnessValuesLocal(plan.values);
  activeSecrets = collectSecretValues(plan.values).map((entry) => entry.value);
  return plan;
}

/** 이미 값이 있어야 하는 명령(status/smoke/e2e/down 등)용: 값이 비어 있으면 안내한다. */
function requireValues(context) {
  assertHarnessValuesLocal(context.existing);
  for (const key of [ENV_KEYS.databaseUrl, ENV_KEYS.migrationDatabaseUrl, ENV_KEYS.apiOrigin, ENV_KEYS.testEmail, ENV_KEYS.testPassword]) {
    if (!context.existing[key]) {
      throw new Error(`${key} 가 없습니다. 먼저 '${CLI_PATH} up' 을 실행하세요.`);
    }
  }
  return context.existing;
}

function printPlan(plan, context) {
  say("| 키 | 조치 | 값 |");
  say("| --- | --- | --- |");
  for (const entry of summarizePlan(plan)) {
    const shown = entry.sensitive ? `길이 ${entry.length}(비공개)` : plan.values[entry.key];
    say(`| ${entry.key} | ${entry.action} | ${shown} |`);
  }
  say("");
  say(`포트: PostgreSQL ${context.ports.pg}, API ${context.ports.api}, 웹 ${context.ports.web}`);
}

function ensureEnvFile(context, plan) {
  const status = inspectEnvFile(context.envFilePath);
  if (plan.changedKeys.length === 0) {
    if (status.exists && !status.private) chmodSync(context.envFilePath, 0o600);
    return { written: false, added: [], replaced: [] };
  }
  assertGitIgnored(context.envFilePath);
  const updates = Object.fromEntries(plan.changedKeys.map((key) => [key, plan.values[key]]));
  const result = applyEnvUpdates(readEnvFileText(context.envFilePath), updates);
  writeEnvFileAtomic(context.envFilePath, result.text);
  const after = inspectEnvFile(context.envFilePath);
  if (after.mode !== "600") {
    throw new Error(`비밀 파일 권한이 600 이 아닙니다(${after.mode}). 파일 시스템 권한을 확인하세요.`);
  }
  return { written: true, ...result };
}

// ── 단계 구현 ────────────────────────────────────────────────────────

/** 파일·프로세스를 만들기 전에 필요한 도구가 있는지 한꺼번에 확인한다(빠른 실패). */
export function assertPrerequisites(paths, { noWeb = false } = {}) {
  const problems = [];
  if (!embeddedPostgresPackageSuffix()) {
    problems.push(`이 플랫폼(${process.platform}/${process.arch})용 embedded-postgres 바이너리가 없습니다(Linux x64 에서 검증).`);
  }
  const needed = [["psql", "psql(PostgreSQL 클라이언트)이 필요합니다(Debian/Ubuntu: apt install postgresql-client)."], ["git", "git 이 필요합니다."]];
  if (installedEmbeddedVersion(paths) !== DEFAULTS.embeddedPostgresVersion) {
    needed.push(["npm", "npm 이 필요합니다(embedded-postgres 설치)."]);
  }
  for (const [command, hint] of needed) {
    const result = spawnSync(command, ["--version"], { stdio: "ignore" });
    if (result.error || result.status !== 0) problems.push(hint);
  }
  try {
    assertCanRunPostgres();
  } catch (error) {
    problems.push(error.message);
  }
  for (const resolver of noWeb ? [resolveTsxLoader] : [resolveTsxLoader, resolveViteEntry]) {
    try {
      resolver(REPOSITORY_ROOT);
    } catch (error) {
      problems.push(error.message.includes("pnpm install") ? error.message : "tsx 로더를 찾지 못했습니다. 저장소 루트에서 'pnpm install' 을 먼저 실행하세요.");
    }
  }
  if (problems.length > 0) {
    throw new Error(`사전 조건을 만족하지 못해 시작하지 않습니다:\n- ${problems.join("\n- ")}\n(자세한 점검: ${CLI_PATH} check)`);
  }
}

async function ensurePostgresRunning(context, values) {
  const { paths } = context;
  const admin = assertLocalPostgresUrl(values[ENV_KEYS.migrationDatabaseUrl], ENV_KEYS.migrationDatabaseUrl);
  const { installed, binaries } = ensureEmbeddedPostgres({ paths, version: DEFAULTS.embeddedPostgresVersion });
  if (installed) say(`  embedded-postgres@${DEFAULTS.embeddedPostgresVersion} 설치 완료(${paths.tools})`);
  const wrapped = assertCanRunPostgres().wrapped;
  const created = initializeCluster({ paths, binaries, adminUser: admin.username, adminPassword: admin.password });
  if (created.created) say(`  새 PostgreSQL 클러스터 초기화${wrapped ? "(root → 사용자 네임스페이스 우회)" : ""}`);

  const state = readState(paths);
  let pid = runningPostgresPid(paths, state);
  if (pid) {
    if (state.pg?.port && state.pg.port !== admin.port) {
      throw new Error(
        `PostgreSQL 이 다른 포트(${state.pg.port})로 이미 실행 중입니다. '${CLI_PATH} down' 으로 멈춘 뒤 새 포트로 다시 시작하세요.`,
      );
    }
    say(`  PostgreSQL 재사용(PID ${pid}, 포트 ${admin.port})`);
  } else {
    if (!(await isPortFree(admin.port))) {
      throw new Error(`PostgreSQL 포트 ${admin.port} 를 다른 프로세스가 사용 중입니다. 정리하거나 --pg-port 로 다른 포트를 지정하세요.`);
    }
    const log = openLog(paths, "postgres", `PostgreSQL 시작 :${admin.port}`);
    try {
      ({ pid } = spawnPostgres({ paths, binaries, port: admin.port, logDescriptor: log.descriptor }));
    } finally {
      closeSync(log.descriptor);
    }
    patchState(paths, { pg: { pid, port: admin.port, startedAt: new Date().toISOString(), log: log.path } });
    say(`  PostgreSQL 시작(PID ${pid}, 127.0.0.1:${admin.port}, 로그 ${log.path})`);
  }
  const ready = await waitForPostgres({ paths, adminUrl: values[ENV_KEYS.migrationDatabaseUrl], isAlive: () => isProcessAlive(pid) });
  if (!ready.ok) {
    throw new Error(`${ready.detail}\n${tailLog(join(paths.logs, "postgres.log"), { secrets: activeSecrets })}`);
  }
  const database = await ensureDatabase({ paths, adminUrl: values[ENV_KEYS.migrationDatabaseUrl], database: admin.database });
  if (database.created) say(`  데이터베이스 ${admin.database} 생성`);
  return { pid, port: admin.port };
}

async function ensureSchemaPrepared(context, values) {
  const { paths } = context;
  const admin = assertLocalPostgresUrl(values[ENV_KEYS.migrationDatabaseUrl], ENV_KEYS.migrationDatabaseUrl);
  const runtime = assertLocalPostgresUrl(values[ENV_KEYS.databaseUrl], ENV_KEYS.databaseUrl);
  const populated = await databaseHasApplicationObjects({ paths, adminUrl: values[ENV_KEYS.migrationDatabaseUrl] });
  const fingerprint = await computeSchemaFingerprint(REPOSITORY_ROOT);
  const state = readState(paths);
  if (populated) {
    if (!state.schema) {
      throw new Error(
        `DB 에 객체가 있지만 스키마 준비 완료 기록이 없습니다(이전 시도가 중단됐을 수 있음). '${CLI_PATH} reset' 후 다시 'up' 하세요.`,
      );
    }
    if (state.schema.fingerprint !== fingerprint) {
      warn("  경고: 스키마·마이그레이션 지문이 DB 를 만들 때와 다릅니다(브랜치가 바뀐 경우). 오류가 나면 reset 후 다시 up 하세요.");
    } else {
      say("  스키마 준비됨(기존 DB 재사용)");
    }
    return { prepared: false };
  }
  say("  빈 DB 에 기준 스키마 + 번호 마이그레이션 적용 중(수 분 걸릴 수 있습니다)…");
  const releaseSha = resolveReleaseSha(REPOSITORY_ROOT);
  const logPath = join(paths.logs, "schema.log");
  writeFileSync(logPath, `--- ${new Date().toISOString()} 스키마 준비 시작 ---\n`, { mode: 0o600, flag: "a" });
  const result = await runBootstrap({
    repositoryRoot: REPOSITORY_ROOT,
    adminUrl: values[ENV_KEYS.migrationDatabaseUrl],
    runtimePassword: runtime.password,
    runtimeRole: runtime.username,
    releaseSha,
    logPath,
    secrets: activeSecrets,
    onProgress: (count) => {
      if (count % 20 === 0) say(`    마이그레이션 ${count}개 적용…`);
    },
  });
  patchState(paths, {
    schema: { preparedAt: new Date().toISOString(), releaseSha, fingerprint, database: admin.database, runtimeRole: runtime.username },
  });
  say(`  스키마 준비 완료(번호 마이그레이션 ${result.applied}개 적용 기록, 런타임 역할 ${runtime.username})`);
  return { prepared: true };
}

async function ensureSeedUser(context, values) {
  const { paths } = context;
  const secrets = activeSecrets;
  const loader = resolveTsxLoader(REPOSITORY_ROOT);
  const result = spawnSync(
    process.execPath,
    ["--import", loader, join(HARNESS_DIRECTORY, "seed-runner.mjs")],
    {
      cwd: join(REPOSITORY_ROOT, "apps", "api"),
      env: buildChildEnv({
        extra: {
          NODE_ENV: "development",
          API_LOCAL_ENV_FILE_ENABLED: "false",
          TSX_TSCONFIG_PATH: join(REPOSITORY_ROOT, "apps", "api", "tsconfig.json"),
          DATABASE_URL: values[ENV_KEYS.databaseUrl],
          [ENV_KEYS.migrationDatabaseUrl]: values[ENV_KEYS.migrationDatabaseUrl],
          [ENV_KEYS.testEmail]: values[ENV_KEYS.testEmail],
          [ENV_KEYS.testPassword]: values[ENV_KEYS.testPassword],
          [ENV_KEYS.testUserId]: values[ENV_KEYS.testUserId],
        },
      }),
      encoding: "utf8",
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logPath = join(paths.logs, "seed.log");
  writeFileSync(
    logPath,
    redactSecrets(`--- ${new Date().toISOString()} 시드 ---\n${result.stdout ?? ""}${result.stderr ?? ""}\n`, secrets),
    { mode: 0o600, flag: "a" },
  );
  const parsed = result.status === 0 ? parseSeedResult(result.stdout) : null;
  if (!parsed) {
    throw new Error(`시드 실패(로그 ${logPath}): ${redactSecrets(String(result.stderr ?? "").slice(-500), secrets)}`);
  }
  patchState(paths, { seed: { seededAt: new Date().toISOString(), action: parsed.action } });
  const label = { created: "생성", updated: "갱신", unchanged: "이미 정상(변경 없음)" }[parsed.action];
  say(`  시드 계정 ${label}(이메일 인증 완료 일반 사용자, 값은 출력하지 않음)`);
  return parsed;
}

function syncSeedUserId(context, plan, seedResult) {
  if (seedResult.userId === plan.values[ENV_KEYS.testUserId]) return plan;
  const values = { ...plan.values, [ENV_KEYS.testUserId]: seedResult.userId };
  const status = ensureEnvFile(context, { changedKeys: [ENV_KEYS.testUserId], values });
  say(`  DB 의 기존 사용자 ID 에 맞춰 ${ENV_KEYS.testUserId} 갱신(${status.written ? "기록됨" : "변경 없음"})`);
  return { ...plan, values };
}

// ── 명령 ─────────────────────────────────────────────────────────────

export async function commandCheck(options) {
  const context = loadContext(options);
  const rows = [];
  const add = (status, item, detail) => rows.push({ status, item, detail });
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add(nodeMajor >= 24 ? "OK" : "WARN", "Node.js", `${process.version} (저장소 요구: >=24.16.0)`);
  add(process.platform === "win32" ? "FAIL" : "OK", "플랫폼", `${process.platform}/${process.arch}`);
  const suffix = embeddedPostgresPackageSuffix();
  add(suffix ? "OK" : "FAIL", "임베디드 PostgreSQL 패키지", suffix ? `@embedded-postgres/${suffix}` : "이 플랫폼용 바이너리 없음");
  for (const [command, args, hint] of [["psql", ["--version"], "PostgreSQL 클라이언트 필요"], ["git", ["--version"], "git 필요"], ["npm", ["--version"], "npm 필요(embedded-postgres 설치)"]]) {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    add(result.status === 0 ? "OK" : "FAIL", command, result.status === 0 ? String(result.stdout).trim().split("\n")[0] : hint);
  }
  try {
    const { wrapped } = assertCanRunPostgres();
    add("OK", "PostgreSQL 실행 방식", wrapped ? "root → unshare -U 사용자 네임스페이스로 우회" : "일반 사용자로 직접 실행");
  } catch (error) {
    add("FAIL", "PostgreSQL 실행 방식", error.message);
  }
  for (const [label, resolver] of [["tsx 로더", () => resolveTsxLoader(REPOSITORY_ROOT)], ["vite", () => resolveViteEntry(REPOSITORY_ROOT)]]) {
    try {
      resolver();
      add("OK", label, "확인");
    } catch (error) {
      add("FAIL", label, error.message);
    }
  }
  const envStatus = inspectEnvFile(context.envFilePath);
  add(envStatus.exists && !envStatus.private ? "WARN" : "OK", "비밀 파일", `${context.envFilePath} (${envStatus.exists ? `권한 ${envStatus.mode}` : "아직 없음(up 이 생성)"})`);
  try {
    const ignored = assertGitIgnored(context.envFilePath);
    add("OK", "git 무시 여부", ignored.status);
  } catch (error) {
    add("FAIL", "git 무시 여부", error.message);
  }
  try {
    assertHarnessValuesLocal(context.existing);
    add("OK", "운영 보호 가드", "기존 DB URL·origin 이 모두 로컬(또는 값 없음)");
  } catch (error) {
    add("FAIL", "운영 보호 가드", error.message);
  }
  try {
    assertEnvironmentSafe(context.environment);
    add("OK", "환경변수 DB 설정", "DATABASE_URL 등이 없거나 로컬 호스트");
  } catch (error) {
    add("FAIL", "환경변수 DB 설정", error.message);
  }
  const state = readState(context.paths);
  for (const [label, port, running] of [
    ["PostgreSQL 포트", context.ports.pg, Boolean(runningPostgresPid(context.paths, state))],
    ["API 포트", context.ports.api, Boolean(state.api?.pid && processMatches(state.api.pid, "src/main.ts"))],
    ["웹 포트", context.ports.web, Boolean(state.web?.pid && processMatches(state.web.pid, "vite.js"))],
  ]) {
    const free = await isPortFree(port);
    add(free || running ? "OK" : "FAIL", label, free ? `${port} 비어 있음` : running ? `${port} 하네스가 사용 중` : `${port} 다른 프로세스가 사용 중`);
  }
  say("| 결과 | 항목 | 상세 |");
  say("| --- | --- | --- |");
  for (const row of rows) say(`| ${row.status} | ${row.item} | ${row.detail} |`);
  return rows.some((row) => row.status === "FAIL") ? EXIT.failure : EXIT.ok;
}

export async function commandUp(options) {
  const context = loadContext(options);
  const plan = planContext(context, options);
  say(options.dryRun ? "[dry-run] 하네스 계획(파일·프로세스를 만들지 않습니다)" : "로컬 풀스택 준비를 시작합니다.");
  say(`비밀 파일: ${context.envFilePath}`);
  say(`스택 디렉터리: ${context.stackDirectory}`);
  printPlan(plan, context);
  if (options.dryRun) {
    say("");
    say("실행 순서: ① 비밀 파일 기록(600) ② embedded-postgres 설치 ③ 클러스터 초기화·기동 ④ 스키마 준비 ⑤ 시드 계정 ⑥ API 기동·헬스 ⑦ 웹 기동·프록시 확인");
    return EXIT.ok;
  }
  assertPrerequisites(context.paths, { noWeb: options.noWeb });

  return withStackLock(context.paths, async () => {
    process.umask(0o077);
    ensureStackDirectories(context.paths);
    const envResult = ensureEnvFile(context, plan);
    say(envResult.written
      ? `[1/7] 비밀 파일 기록(권한 600, git 무시 확인): 추가 ${envResult.added.length}개, 갱신 ${envResult.replaced.length}개`
      : "[1/7] 비밀 파일 변경 없음(권한 600 확인)");
    let values = plan.values;

    say("[2/7] 임베디드 PostgreSQL 준비·기동");
    await ensurePostgresRunning(context, values);

    say("[3/7] 스키마 준비");
    await ensureSchemaPrepared(context, values);

    say("[4/7] 시드 테스트 계정");
    const seeded = await ensureSeedUser(context, values);
    values = syncSeedUserId(context, { ...plan, values }, seeded).values;

    say("[5/7] API 기동·헬스 대기");
    let state = readState(context.paths);
    const apiResult = await startApi({ paths: context.paths, repositoryRoot: REPOSITORY_ROOT, values, state, secrets: activeSecrets })
      .catch(async (error) => {
        await stopApi({ state: readState(context.paths) });
        throw error;
      });
    say(apiResult.reused ? `  API 재사용(PID ${apiResult.pid})` : `  API 시작(PID ${apiResult.pid}, 로그 ${apiResult.logPath}) — /api/health/live 정상`);
    await waitForApiReady({ values, logPath: apiResult.logPath ?? readState(context.paths).api?.log, secrets: activeSecrets });
    say("  /api/health/ready 정상(DB·스키마·ACL 검증 통과)");

    if (options.noWeb) {
      say("[6/7] 웹 기동 생략(--no-web)");
    } else {
      say("[6/7] 웹(Vite) 기동·프록시 확인");
      state = readState(context.paths);
      const webResult = await startWeb({ paths: context.paths, repositoryRoot: REPOSITORY_ROOT, values, state, secrets: activeSecrets })
        .catch(async (error) => {
          await stopWeb({ state: readState(context.paths) });
          throw error;
        });
      say(webResult.reused ? `  웹 재사용(PID ${webResult.pid})` : `  웹 시작(PID ${webResult.pid}, 로그 ${webResult.logPath}) — 프록시가 로컬 API 로 연결됨`);
    }

    say("[7/7] 완료");
    say("");
    say("로컬 풀스택이 준비되었습니다.");
    say(`  웹   ${values[ENV_KEYS.webOrigin]}${options.noWeb ? " (생략)" : ""}`);
    say(`  API  ${values[ENV_KEYS.apiOrigin]}  (/api/health/live, /api/health/ready)`);
    say(`  자격 ${context.envFilePath} 의 ${ENV_KEYS.testEmail} / ${ENV_KEYS.testPassword} (값은 출력하지 않습니다)`);
    say(`  스모크 ${CLI_PATH} smoke      브라우저 ${CLI_PATH} e2e      중지 ${CLI_PATH} down`);
    return EXIT.ok;
  });
}

export async function commandDown(options) {
  const context = loadContext(options);
  const state = readState(context.paths);
  if (options.dryRun) {
    say("[dry-run] 중지 대상: 웹, API, PostgreSQL(데이터는 보존)");
    return EXIT.ok;
  }
  if (!hasStackMarker(context.paths) && !existsSync(context.paths.state)) {
    say("실행 중인 하네스 구성요소가 없습니다(스택 디렉터리가 비어 있음).");
    return EXIT.ok;
  }
  return withStackLock(context.paths, async () => {
    const results = {
      웹: await stopWeb({ state }),
      API: await stopApi({ state }),
      PostgreSQL: await stopPostgres({ paths: context.paths, state }),
    };
    const labels = { "not-running": "실행 중 아님", stopped: "정상 종료", killed: "강제 종료", mismatch: "PID 불일치(다른 프로세스라 건드리지 않음)", survived: "종료되지 않음" };
    for (const [name, result] of Object.entries(results)) say(`  ${name}: ${labels[result] ?? result}`);
    patchState(context.paths, { web: null, api: null, pg: null });
    return Object.values(results).includes("survived") ? EXIT.failure : EXIT.ok;
  });
}

export async function commandStatus(options) {
  const context = loadContext(options);
  const state = readState(context.paths);
  const values = context.existing;
  assertHarnessValuesLocal(values);
  const rows = [];
  const pgPid = runningPostgresPid(context.paths, state);
  rows.push({ name: "PostgreSQL", running: Boolean(pgPid), pid: pgPid ?? "-", port: state.pg?.port ?? context.ports.pg, health: pgPid ? "프로세스 실행 중" : "-" });

  const probe = async (origin, path) => {
    if (!origin) return "-";
    const response = await httpProbe(`${origin}${path}`, { timeoutMs: 4_000 });
    return response ? `HTTP ${response.status}` : "응답 없음";
  };
  const apiPid = state.api?.pid && processMatches(state.api.pid, "src/main.ts") ? state.api.pid : null;
  const webPid = state.web?.pid && processMatches(state.web.pid, "vite.js") ? state.web.pid : null;
  const apiOrigin = values[ENV_KEYS.apiOrigin];
  const webOrigin = values[ENV_KEYS.webOrigin];
  rows.push({
    name: "API",
    running: Boolean(apiPid),
    pid: apiPid ?? "-",
    port: state.api?.port ?? context.ports.api,
    health: apiPid ? `live ${await probe(apiOrigin, "/api/health/live")}, ready ${await probe(apiOrigin, "/api/health/ready")}` : "-",
  });
  rows.push({
    name: "웹",
    running: Boolean(webPid),
    pid: webPid ?? "-",
    port: state.web?.port ?? context.ports.web,
    health: webPid ? `/ ${await probe(webOrigin, "/")}, 프록시 ${await probe(webOrigin, "/api/health/live")}` : "-",
  });
  say("| 구성요소 | 실행 | PID | 포트 | 헬스 |");
  say("| --- | --- | --- | --- | --- |");
  for (const row of rows) say(`| ${row.name} | ${row.running ? "예" : "아니오"} | ${row.pid} | ${row.port} | ${row.health} |`);
  const present = SENSITIVE_ENV_KEYS.filter((key) => values[key]);
  say("");
  say(`비밀 파일: ${context.envFilePath} (${inspectEnvFile(context.envFilePath).exists ? `권한 ${inspectEnvFile(context.envFilePath).mode}` : "없음"})`);
  say(`기록된 비밀 키 ${present.length}/${SENSITIVE_ENV_KEYS.length}개(값은 출력하지 않음): ${present.join(", ") || "(없음)"}`);
  say(`스키마: ${state.schema ? `준비됨(${state.schema.preparedAt})` : "미준비"}  시드: ${state.seed ? `${state.seed.action}(${state.seed.seededAt})` : "미실행"}`);
  return EXIT.ok;
}

export async function commandReset(options) {
  const context = loadContext(options);
  if (options.dryRun || !options.yes) {
    say(`[${options.dryRun ? "dry-run" : "확인 필요"}] reset 은 웹·API·PostgreSQL 을 중지하고 ${context.paths.postgresData} (임베디드 DB 데이터)와 스키마·시드 기록을 지웁니다.`);
    say(`  비밀 파일(${context.envFilePath})과 설치된 PostgreSQL 바이너리(${context.paths.tools})는 지우지 않습니다.${options.rotateSecrets ? " --rotate-secrets: 비밀값은 새로 만듭니다." : ""}`);
    if (!options.dryRun) say("  진행하려면 --yes 를 붙여 다시 실행하세요.");
    return options.dryRun ? EXIT.ok : EXIT.usage;
  }
  if (!hasStackMarker(context.paths)) {
    throw new Error(`이 디렉터리는 하네스가 만든 스택이 아닙니다(표식 파일 없음): ${context.paths.root}. 안전을 위해 삭제하지 않습니다.`);
  }
  assertSafeDeletionTarget(context.paths);
  const rotationPlan = options.rotateSecrets ? planContext(context, options) : null;
  return withStackLock(context.paths, async () => {
    const state = readState(context.paths);
    await stopWeb({ state });
    await stopApi({ state });
    const stopped = await stopPostgres({ paths: context.paths, state });
    if (stopped === "survived" || stopped === "mismatch") {
      throw new Error(`PostgreSQL 을 안전하게 멈추지 못해 데이터를 지우지 않았습니다(${stopped}).`);
    }
    rmSync(context.paths.postgresData, { recursive: true, force: true });
    patchState(context.paths, { web: null, api: null, pg: null, schema: null, seed: null });
    say("DB 데이터와 스키마·시드 기록을 삭제했습니다.");
    if (rotationPlan) {
      process.umask(0o077);
      const result = ensureEnvFile(context, rotationPlan);
      say(`비밀값을 새로 만들었습니다(키 ${result.added.length + result.replaced.length}개 갱신, 값은 출력하지 않음).`);
    }
    say(`다시 시작: ${CLI_PATH} up`);
    return EXIT.ok;
  });
}

function assertSafeDeletionTarget(paths) {
  const target = paths.postgresData;
  if (!target.startsWith(`${paths.root}/`) || target === paths.root) {
    throw new Error(`삭제 대상 경로가 스택 디렉터리 밖입니다: ${target}`);
  }
}

export async function commandDbStart(options) {
  const context = loadContext(options);
  const plan = planContext(context, options);
  assertPrerequisites(context.paths, { noWeb: true });
  return withStackLock(context.paths, async () => {
    process.umask(0o077);
    ensureStackDirectories(context.paths);
    ensureEnvFile(context, plan);
    await ensurePostgresRunning(context, plan.values);
    say("PostgreSQL 준비 완료.");
    return EXIT.ok;
  });
}

export async function commandDbStop(options) {
  const context = loadContext(options);
  const state = readState(context.paths);
  const result = await stopPostgres({ paths: context.paths, state });
  patchState(context.paths, { pg: null });
  say(`PostgreSQL: ${result}`);
  return result === "survived" ? EXIT.failure : EXIT.ok;
}

export async function commandSchema(options) {
  const context = loadContext(options);
  const values = requireValues(context);
  return withStackLock(context.paths, async () => {
    await ensurePostgresRunning(context, values);
    await ensureSchemaPrepared(context, values);
    return EXIT.ok;
  });
}

export async function commandSeed(options) {
  const context = loadContext(options);
  const values = requireValues(context);
  return withStackLock(context.paths, async () => {
    await ensurePostgresRunning(context, values);
    const seeded = await ensureSeedUser(context, values);
    syncSeedUserId(context, { values, changedKeys: [] }, seeded);
    return EXIT.ok;
  });
}

export async function commandApiStart(options) {
  const context = loadContext(options);
  const values = requireValues(context);
  return withStackLock(context.paths, async () => {
    const state = readState(context.paths);
    const result = await startApi({ paths: context.paths, repositoryRoot: REPOSITORY_ROOT, values, state, secrets: activeSecrets });
    await waitForApiReady({ values, logPath: result.logPath ?? state.api?.log, secrets: activeSecrets });
    say(`API 준비 완료(PID ${result.pid}, ${values[ENV_KEYS.apiOrigin]}).`);
    return EXIT.ok;
  });
}

export async function commandApiStop(options) {
  const context = loadContext(options);
  const result = await stopApi({ state: readState(context.paths) });
  patchState(context.paths, { api: null });
  say(`API: ${result}`);
  return result === "survived" ? EXIT.failure : EXIT.ok;
}

export async function commandWebStart(options) {
  const context = loadContext(options);
  const values = requireValues(context);
  assertLocalOrigin(values[ENV_KEYS.webOrigin] ?? "", ENV_KEYS.webOrigin);
  return withStackLock(context.paths, async () => {
    const result = await startWeb({ paths: context.paths, repositoryRoot: REPOSITORY_ROOT, values, state: readState(context.paths), secrets: activeSecrets });
    say(`웹 준비 완료(PID ${result.pid}, ${values[ENV_KEYS.webOrigin]}).`);
    return EXIT.ok;
  });
}

export async function commandWebStop(options) {
  const context = loadContext(options);
  const result = await stopWeb({ state: readState(context.paths) });
  patchState(context.paths, { web: null });
  say(`웹: ${result}`);
  return result === "survived" ? EXIT.failure : EXIT.ok;
}

/**
 * 자식 프로세스 출력을 "줄 단위"로 모아 비밀값을 가린 뒤 내보낸다(청크 경계에 걸린 값도 놓치지 않는다).
 * @param {NodeJS.WritableStream} target
 * @param {(text: string) => void} collect 가린 텍스트를 기록 파일용으로 모은다
 */
export function createRedactingForwarder(target, collect) {
  let pending = "";
  const emit = (text) => {
    const safe = redactForOutput(text);
    collect(safe);
    target.write(safe);
  };
  return {
    write(chunk) {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      if (lines.length > 0) emit(`${lines.join("\n")}\n`);
    },
    flush() {
      if (pending) emit(pending);
      pending = "";
    },
  };
}

export async function commandE2e(options) {
  const context = loadContext(options);
  const values = requireValues(context);
  assertLocalOrigin(values[ENV_KEYS.webOrigin] ?? "", ENV_KEYS.webOrigin);
  const web = await httpProbe(`${values[ENV_KEYS.webOrigin]}/`, { timeoutMs: 5_000 });
  if (web?.status !== 200) {
    throw new Error(`웹(${values[ENV_KEYS.webOrigin]})이 응답하지 않습니다. 먼저 '${CLI_PATH} up' 을 실행하세요.`);
  }
  ensureStackDirectories(context.paths);
  const require = createRequire(join(REPOSITORY_ROOT, "package.json"));
  const playwrightCli = require.resolve("@playwright/test/cli");
  const args = [
    playwrightCli,
    "test",
    "--config=playwright.local-fullstack.config.mjs",
    `--output=${join(context.paths.browser, "results")}`,
    ...options.passthrough,
  ];
  say(`브라우저 스모크 실행(Playwright): ${args.slice(1, 3).join(" ")}`);
  const child = spawn(process.execPath, args, {
    cwd: REPOSITORY_ROOT,
    env: buildChildEnv({
      passthrough: ["PLAYWRIGHT_*"],
      noColor: false,
      extra: {
        [PROCESS_ENV.e2eGate]: "1",
        [ENV_KEYS.testEmail]: values[ENV_KEYS.testEmail],
        [ENV_KEYS.testPassword]: values[ENV_KEYS.testPassword],
        [ENV_KEYS.webOrigin]: values[ENV_KEYS.webOrigin],
        [ENV_KEYS.apiOrigin]: values[ENV_KEYS.apiOrigin],
      },
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let transcript = "";
  const forwarders = [
    createRedactingForwarder(process.stdout, (text) => { transcript += text; }),
    createRedactingForwarder(process.stderr, (text) => { transcript += text; }),
  ];
  child.stdout.on("data", (chunk) => forwarders[0].write(chunk));
  child.stderr.on("data", (chunk) => forwarders[1].write(chunk));
  const code = await new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("close", (exitCode) => resolve(exitCode ?? 1));
  });
  for (const forwarder of forwarders) forwarder.flush();
  writeFileSync(join(context.paths.logs, "e2e.log"), transcript, { mode: 0o600 });
  if (code !== 0 && /Executable doesn't exist|browserType\.launch/u.test(transcript)) {
    warn("힌트: 브라우저가 없다면 'pnpm exec playwright install chromium' 을 실행하거나, 설치된 Chromium 경로를 PLAYWRIGHT_EXECUTABLE_PATH 로 지정하세요.");
  }
  return code === 0 ? EXIT.ok : EXIT.failure;
}

/** 로그·산출물에 비밀값이 남았는지 검사한다(값은 출력하지 않고 키 이름·건수만 보고). */
export function scanForSecrets({ secrets, targets }) {
  const findings = [];
  const visit = (path) => {
    let info;
    try {
      info = statSync(path);
    } catch {
      return;
    }
    if (info.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry === "node_modules" || entry === ".git") continue;
        visit(join(path, entry));
      }
      return;
    }
    if (!info.isFile() || info.size > 256 * 1024 * 1024) return;
    const content = readFileSync(path);
    for (const secret of secrets) {
      if (!secret.value || secret.value.length < 6) continue;
      let count = 0;
      let index = content.indexOf(secret.value);
      while (index !== -1) {
        count += 1;
        index = content.indexOf(secret.value, index + secret.value.length);
      }
      if (count > 0) findings.push({ path, key: secret.key, count });
    }
  };
  for (const target of targets) visit(target);
  return findings;
}

export async function commandLeakcheck(options) {
  const context = loadContext(options);
  const values = context.existing;
  const secrets = collectSecretValues(values);
  if (secrets.length === 0) {
    say("검사할 비밀값이 없습니다(비밀 파일에 TOONSTUDIO_LOCAL_* 키가 없음).");
    return EXIT.failure;
  }
  const targets = [context.paths.logs, context.paths.state, ...options.paths];
  const findings = scanForSecrets({ secrets, targets });
  say(`비밀값 누출 검사: 비밀 ${secrets.length}종(키: ${[...new Set(secrets.map((entry) => entry.key))].join(", ")}) × 대상 ${targets.length}곳`);
  if (findings.length === 0) {
    say("결과: 누출 없음(모든 대상에서 일치 0건).");
    return EXIT.ok;
  }
  for (const finding of findings) say(`  누출 의심: ${finding.path} — ${finding.key} ${finding.count}건`);
  say("결과: 누출 의심 발견. 해당 로그를 지우고 원인을 확인하세요.");
  return EXIT.failure;
}

