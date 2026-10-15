/**
 * 로컬 DB 스키마 준비.
 *
 * 운영 부트스트랩 스크립트(scripts/bootstrap-empty-production-database.mjs)를 "일회용 loopback DB"
 * 모드(--allow-loopback)로 호출한다. 이 스크립트 자체는 수정하지 않는다.
 *
 * 번호 SQL 마이그레이션만 순서대로 적용하는 별도 러너를 만들지 않은 이유(2026-10-15 확인):
 * - 0001~0019 는 Drizzle 기준 스키마에 이미 반영된 "역사적 기준선"이라, 빈 DB 에 번호 SQL 만 적용하면
 *   user/account 같은 기준 테이블이 없어 실패한다. 부트스트랩이 drizzle-kit 으로 기준 스키마를 만든 뒤 적용한다.
 * - /api/health/ready 가 "런타임 역할이 소유자가 아니며 테이블별 최소 권한만 가진다"는 ACL 까지 검사한다.
 *   그래서 마이그레이션 역할(소유자)과 런타임 역할을 분리하고 ACL 을 정규화하는 부트스트랩 경로가 필요하다.
 * 이 방식은 scripts/local-test-stack.mjs 와 e2e/run-market-live-e2e.mjs 가 이미 쓰는 경로와 같다.
 */

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assertLocalPostgresUrl, buildChildEnv, redactSecrets } from "./guard.mjs";

const BOOTSTRAP_SCRIPT = "scripts/bootstrap-empty-production-database.mjs";

export function bootstrapArguments({ runtimeRole, releaseSha, confirmation }) {
  if (!/^[0-9a-f]{40}$/u.test(releaseSha)) {
    throw new Error("릴리스 SHA 는 40자리 소문자 16진수여야 합니다.");
  }
  return [
    "--execute",
    "--allow-loopback",
    "--runtime-database-role", runtimeRole,
    "--release-sha", releaseSha,
    "--confirmation", confirmation,
  ];
}

/** git HEAD 의 40자리 SHA. 부트스트랩 원장에 기록되는 값일 뿐 배포 SHA 가 아니다. */
export function resolveReleaseSha(repositoryRoot, runCommand = spawnSync) {
  const result = runCommand("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const sha = result.status === 0 ? String(result.stdout).trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new Error("git HEAD SHA 를 확인하지 못했습니다. 저장소 안에서 실행하세요.");
  }
  return sha;
}

/** 부트스트랩이 지문을 계산하는 파일(스키마·마이그레이션·매니페스트)의 sha256. 스키마가 바뀌었는지 판단하는 용도. */
export async function computeSchemaFingerprint(repositoryRoot) {
  const module = await import(pathToFileURL(join(repositoryRoot, BOOTSTRAP_SCRIPT)).href);
  return module.loadBootstrapContract().fingerprint;
}

/**
 * 빈 로컬 DB 에 스키마와 번호 마이그레이션을 적용한다.
 * 출력은 비밀값을 가린 뒤 로그 파일에 남기고, 진행 상황은 "Applying …" 줄 수만 콜백으로 알린다.
 */
export async function runBootstrap({
  repositoryRoot,
  adminUrl,
  runtimePassword,
  runtimeRole,
  releaseSha,
  logPath,
  secrets = [],
  onProgress = () => undefined,
  timeoutMs = 20 * 60_000,
}) {
  assertLocalPostgresUrl(adminUrl, "마이그레이션 DB URL");
  const probe = spawnSync("psql", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (probe.error || probe.status !== 0) {
    throw new Error("psql(PostgreSQL 클라이언트)이 필요합니다. 설치한 뒤 다시 실행하세요(Debian/Ubuntu: apt install postgresql-client).");
  }
  const { EMPTY_DATABASE_BOOTSTRAP_CONFIRMATION, RUNTIME_DATABASE_PASSWORD_ENVIRONMENT_VARIABLE } =
    await import(pathToFileURL(join(repositoryRoot, BOOTSTRAP_SCRIPT)).href);
  const knownSecrets = [adminUrl, runtimePassword, ...secrets];
  const child = spawn(
    process.execPath,
    [
      join(repositoryRoot, BOOTSTRAP_SCRIPT),
      ...bootstrapArguments({
        runtimeRole,
        releaseSha,
        confirmation: EMPTY_DATABASE_BOOTSTRAP_CONFIRMATION,
      }),
    ],
    {
      cwd: repositoryRoot,
      env: buildChildEnv({
        extra: {
          MIGRATION_DATABASE_URL: adminUrl,
          [RUNTIME_DATABASE_PASSWORD_ENVIRONMENT_VARIABLE]: runtimePassword,
        },
      }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let applied = 0;
  let tail = "";
  const consume = (chunk) => {
    const text = redactSecrets(chunk.toString("utf8"), knownSecrets);
    appendFileSync(logPath, text, { mode: 0o600 });
    tail = (tail + text).slice(-1500);
    for (const line of text.split(/\r?\n/u)) {
      if (line.startsWith("Applying ")) {
        applied += 1;
        onProgress(applied, line);
      }
    }
  };
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, timedOut: true });
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, error });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });
  if (outcome.timedOut) {
    throw new Error(`스키마 준비가 ${Math.round(timeoutMs / 60_000)}분 안에 끝나지 않았습니다(로그: ${logPath}).`);
  }
  if (outcome.error || outcome.code !== 0) {
    throw new Error(
      `스키마 준비 실패(exit ${outcome.code ?? "?"}). DB 는 일회용이므로 'cli.mjs reset' 으로 다시 만들 수 있습니다.\n${tail.slice(-700)}`,
    );
  }
  return { applied, runtimeRole };
}
