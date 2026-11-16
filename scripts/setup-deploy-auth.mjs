#!/usr/bin/env node
/**
 * ToonStudio 로컬 배포 설정 점검 및 GitHub Actions `production-deploy` 시크릿·변수 주입기
 *
 * 비밀값은 절대 stdout/stderr/로그에 출력하지 않으며(AGENTS.md 9절),
 * 모든 원격 시크릿 업로드는 `gh secret set` 표준 입력(stdin 파이프)으로만 전달한다.
 *
 *   pnpm run deploy:info                             # 로컬 설정 준비 상태만 점검 (네트워크·GitHub 조회 없음)
 *   pnpm run deploy:auth:check                       # 로컬 + GitHub `production-deploy` Environment 상태 점검
 *   pnpm run deploy:auth -- --provision-onpod-key    # toonstudio-api 전용 최소권한 키 발급 후 .env.infrastructure.local 저장
 *   pnpm run deploy:auth:sync -- --dry-run           # GitHub 주입 대상 변수·시크릿 이름만 사전 점검
 *   pnpm run deploy:auth:sync                        # 로컬 설정을 GitHub `production-deploy` Environment에 동기화
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import {
  GITHUB_DEPLOY_ENVIRONMENT,
  GITHUB_REPO_SLUG,
  ONPOD_CANONICAL_APP,
  buildGitHubDeploySyncPlan,
  isPlaceholderCredentialValue,
  loadLocalEnvMaps,
  redactSensitiveText,
  secretFingerprint,
  upsertEnvFileEntries,
} from "./lib/deploy-auth-env.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const ROOT = resolve(dirname(MODULE_PATH), "..");

const SUPPORTED_FLAGS = new Set([
  "--help",
  "-h",
  "--status",
  "--local-only",
  "--sync-github",
  "--dry-run",
  "--verify-remote",
  "--provision-onpod-key",
  "--force-rotate",
  "--set-cloudflare-token",
]);

function buildExecEnv(baseEnv = process.env) {
  const nodeBin = dirname(process.execPath);
  const existing = (baseEnv.PATH ?? "").split(delimiter).filter(Boolean);
  const mergedPath = [nodeBin, "/opt/homebrew/bin", "/usr/local/bin", ...existing].filter(
    (entry, index, list) => list.indexOf(entry) === index,
  );
  return { ...baseEnv, PATH: mergedPath.join(delimiter) };
}

export function parseAuthCliArgs(argv) {
  const filtered = argv.filter((arg) => arg !== "--");
  for (const arg of filtered) {
    if (!SUPPORTED_FLAGS.has(arg)) {
      throw new Error(
        "[deploy:auth] 지원하지 않는 옵션입니다. `--help`로 허용된 플래그를 확인하세요(인자 원문 미출력).",
      );
    }
  }
  const options = {
    help: filtered.includes("--help") || filtered.includes("-h"),
    status: filtered.includes("--status"),
    localOnly: filtered.includes("--local-only"),
    syncGithub: filtered.includes("--sync-github"),
    dryRun: filtered.includes("--dry-run"),
    verifyRemote: filtered.includes("--verify-remote"),
    provisionOnpodKey: filtered.includes("--provision-onpod-key"),
    forceRotate: filtered.includes("--force-rotate"),
    setCloudflareToken: filtered.includes("--set-cloudflare-token"),
  };
  if (options.localOnly && options.syncGithub) {
    throw new Error("[deploy:auth] `--local-only`와 `--sync-github`는 함께 사용할 수 없습니다.");
  }
  if (options.forceRotate && !options.provisionOnpodKey) {
    throw new Error("[deploy:auth] `--force-rotate`는 `--provision-onpod-key`와 함께만 사용할 수 있습니다.");
  }
  return options;
}

export async function verifyCloudflareApiToken(token, accountId, fetchImpl = fetch) {
  const cleanToken = (token || "").trim();
  const cleanAccount = (accountId || "").trim();
  if (!cleanToken) return { ok: false, reason: "토큰 비어 있음" };
  const headers = { authorization: `Bearer ${cleanToken}` };
  try {
    const r2Url = `https://api.cloudflare.com/client/v4/accounts/${cleanAccount}/r2/buckets/toonspectrum-public-assets/objects?per_page=1`;
    const workerUrl = `https://api.cloudflare.com/client/v4/accounts/${cleanAccount}/workers/scripts/toonspectrum-web/versions?per_page=1`;
    const [r2Res, workerRes] = await Promise.all([
      fetchImpl(r2Url, { headers }),
      fetchImpl(workerUrl, { headers }),
    ]);
    if (!r2Res.ok) {
      return { ok: false, reason: `R2 버킷 조회 권한 실패(HTTP ${r2Res.status})` };
    }
    if (!workerRes.ok) {
      return { ok: false, reason: `Workers 스크립트 조회 권한 실패(HTTP ${workerRes.status})` };
    }
    return { ok: true, reason: "Workers + R2 권한 확인됨" };
  } catch {
    return { ok: false, reason: "Cloudflare API 네트워크 연결 실패" };
  }
}

export function inspectGitHubEnvironmentStatus({
  rootDir = ROOT,
  execEnv = buildExecEnv(),
  repoSlug = GITHUB_REPO_SLUG,
  environmentName = GITHUB_DEPLOY_ENVIRONMENT,
  execFileImpl = execFileSync,
} = {}) {
  try {
    execFileImpl("gh", ["auth", "status"], {
      cwd: rootDir,
      env: execEnv,
      stdio: "ignore",
    });
  } catch {
    return {
      ghReady: false,
      environmentExists: false,
      configuredSecrets: [],
      configuredVariables: [],
    };
  }

  let environmentExists;
  try {
    execFileImpl(
      "gh",
      ["api", `repos/${repoSlug}/environments/${encodeURIComponent(environmentName)}`],
      { cwd: rootDir, env: execEnv, stdio: "ignore" },
    );
    environmentExists = true;
  } catch {
    environmentExists = false;
  }

  if (!environmentExists) {
    return {
      ghReady: true,
      environmentExists: false,
      configuredSecrets: [],
      configuredVariables: [],
    };
  }

  const parseFirstColumn = (output) =>
    String(output || "")
      .split(/\r?\n/u)
      .map((line) => line.trim().split(/\s+/u)[0])
      .filter((name) => Boolean(name) && name !== "NAME");

  let configuredSecrets;
  let configuredVariables;
  try {
    const secretOut = execFileImpl(
      "gh",
      ["secret", "list", "--repo", repoSlug, "--env", environmentName],
      { cwd: rootDir, env: execEnv, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    configuredSecrets = parseFirstColumn(secretOut);
  } catch {
    configuredSecrets = [];
  }

  try {
    const varOut = execFileImpl(
      "gh",
      ["variable", "list", "--repo", repoSlug, "--env", environmentName],
      { cwd: rootDir, env: execEnv, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    configuredVariables = parseFirstColumn(varOut);
  } catch {
    configuredVariables = [];
  }

  return {
    ghReady: true,
    environmentExists: true,
    configuredSecrets,
    configuredVariables,
  };
}

export function ensureGitHubDeployEnvironment({
  rootDir = ROOT,
  execEnv = buildExecEnv(),
  repoSlug = GITHUB_REPO_SLUG,
  environmentName = GITHUB_DEPLOY_ENVIRONMENT,
  execFileImpl = execFileSync,
} = {}) {
  const encodedEnv = encodeURIComponent(environmentName);
  execFileImpl(
    "gh",
    [
      "api",
      "--method",
      "PUT",
      `repos/${repoSlug}/environments/${encodedEnv}`,
      "--input",
      "-",
    ],
    {
      cwd: rootDir,
      env: execEnv,
      input: JSON.stringify({
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
      }),
      stdio: ["pipe", "ignore", "pipe"],
    },
  );

  // main 브랜치 전용 정책이 아직 없으면 등록한다.
  let hasMainPolicy;
  try {
    const rawPolicies = execFileImpl(
      "gh",
      ["api", `repos/${repoSlug}/environments/${encodedEnv}/deployment-branch-policies`],
      { cwd: rootDir, env: execEnv, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const parsed = JSON.parse(rawPolicies);
    const list = Array.isArray(parsed?.branch_policies) ? parsed.branch_policies : [];
    hasMainPolicy = list.some((item) => item?.name === "main");
  } catch {
    hasMainPolicy = false;
  }

  if (!hasMainPolicy) {
    execFileImpl(
      "gh",
      [
        "api",
        "--method",
        "POST",
        `repos/${repoSlug}/environments/${encodedEnv}/deployment-branch-policies`,
        "--input",
        "-",
      ],
      {
        cwd: rootDir,
        env: execEnv,
        input: JSON.stringify({ name: "main", type: "branch" }),
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
  }
}

export function extractScopedOnpodToken(rawOutput) {
  const stripped = stripVTControlCharacters(String(rawOutput || ""));
  const match = stripped.match(/\b(opk?_[A-Za-z0-9_-]{20,})\b/u);
  return match ? match[1] : null;
}

export function provisionScopedOnpodDeployKey({
  rootDir = ROOT,
  execEnv = buildExecEnv(),
  forceRotate = false,
  expiresDays = 90,
  execFileImpl = execFileSync,
} = {}) {
  const loaded = loadLocalEnvMaps(rootDir);
  const existingScoped = (loaded.infra.values.ONPOD_DEPLOY_TOKEN || "").trim();
  const ownerToken = (loaded.infra.values.ONPOD_TOKEN || "").trim();

  if (!forceRotate && !isPlaceholderCredentialValue(existingScoped) && existingScoped !== ownerToken) {
    return {
      created: false,
      reused: true,
      fingerprint: secretFingerprint(existingScoped),
      envFilePath: loaded.infraPath,
    };
  }

  const childEnv = {
    ...execEnv,
    ONPOD_NO_ERROR_REPORT: "1",
    ...(ownerToken ? { ONPOD_TOKEN: ownerToken } : {}),
  };

  const keyName = `github-actions-${ONPOD_CANONICAL_APP}-${new Date().toISOString().slice(0, 10)}`;
  let rawOut;
  try {
    rawOut = execFileImpl(
      "onpod",
      [
        "key",
        "add",
        "--name",
        keyName,
        "--app",
        ONPOD_CANONICAL_APP,
        "--expires-days",
        String(expiresDays),
      ],
      {
        cwd: rootDir,
        env: childEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    const safeDetail = redactSensitiveText(
      error instanceof Error ? `${error.message}` : "onpod CLI 오류",
    );
    throw new Error(
      `[deploy:auth] onpod 앱 전용 배포 키 발급에 실패했습니다. \`onpod whoami\` 로그인 상태를 확인하세요. (${safeDetail})`,
      { cause: error },
    );
  }

  const mintedToken = extractScopedOnpodToken(rawOut);
  if (!mintedToken) {
    throw new Error(
      "[deploy:auth] onpod key add 응답에서 앱 전용 토큰 형식을 감지하지 못했습니다(원문 미출력).",
    );
  }
  if (ownerToken && mintedToken === ownerToken) {
    throw new Error("[deploy:auth] 발급된 키가 전권 키와 동일하여 저장을 중단했습니다.");
  }

  upsertEnvFileEntries(loaded.infraPath, { ONPOD_DEPLOY_TOKEN: mintedToken });
  return {
    created: true,
    reused: false,
    keyName,
    expiresDays,
    fingerprint: secretFingerprint(mintedToken),
    envFilePath: loaded.infraPath,
  };
}

export function syncPlanToGitHubActions(
  plan,
  {
    rootDir = ROOT,
    execEnv = buildExecEnv(),
    repoSlug = GITHUB_REPO_SLUG,
    environmentName = GITHUB_DEPLOY_ENVIRONMENT,
    dryRun = false,
    execFileImpl = execFileSync,
    log = console.log,
  } = {},
) {
  if (plan.errors.length > 0) {
    throw new Error(
      `[deploy:auth] 로컬 설정 검증 오류가 있어 GitHub 동기화를 중단합니다:\n - ${plan.errors.join("\n - ")}`,
    );
  }

  if (dryRun) {
    log(`=== [DRY-RUN] GitHub Actions Environment (${environmentName}) 동기화 계획 ===`);
    log(`• 저장소: ${repoSlug} (main 브랜치 전용 정책)`);
    log(`• 동기화할 Variables (${plan.variableNames.length}개): ${plan.variableNames.join(", ")}`);
    log(
      `• 동기화할 Secrets (${plan.secretNames.length}개): ${plan.secretNames.join(", ")} (ONPOD_API_ENV_JSON 내부 키 ${plan.apiEnvKeyCount}개 포함)`,
    );
    if (plan.missingSecrets.length > 0) {
      log(`• 아직 로컬에 없는 선택/추후 등록 Secrets: ${plan.missingSecrets.join(", ")}`);
    }
    return { syncedVariables: [], syncedSecrets: [], dryRun: true };
  }

  ensureGitHubDeployEnvironment({
    rootDir,
    execEnv,
    repoSlug,
    environmentName,
    execFileImpl,
  });

  const syncedVariables = [];
  for (const name of plan.variableNames) {
    execFileImpl(
      "gh",
      [
        "variable",
        "set",
        name,
        "--repo",
        repoSlug,
        "--env",
        environmentName,
        "--body",
        plan.variables[name],
      ],
      { cwd: rootDir, env: execEnv, stdio: ["ignore", "ignore", "pipe"] },
    );
    syncedVariables.push(name);
  }

  const syncedSecrets = [];
  for (const name of plan.secretNames) {
    execFileImpl(
      "gh",
      ["secret", "set", name, "--repo", repoSlug, "--env", environmentName],
      {
        cwd: rootDir,
        env: execEnv,
        input: plan.secrets[name],
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    syncedSecrets.push(name);
  }

  log(
    `✅ GitHub Environment \`${environmentName}\`(${repoSlug}) 동기화 완료: Variables ${syncedVariables.length}개, Secrets ${syncedSecrets.length}개 (비밀값 미출력)`,
  );
  return { syncedVariables, syncedSecrets, dryRun: false };
}

export async function printDeployAuthStatus({
  rootDir = ROOT,
  localOnly = false,
  verifyRemote = false,
  execEnv = buildExecEnv(),
  log = console.log,
} = {}) {
  const plan = buildGitHubDeploySyncPlan(rootDir);
  const ghStatus = localOnly
    ? null
    : inspectGitHubEnvironmentStatus({ rootDir, execEnv });

  log("=== ToonStudio 로컬 ↔ GitHub Actions 클라우드 배포 설정 점검 (비밀값 미출력) ===");
  log(
    `• 로컬 env 파일 감지: .env.infrastructure.local=${plan.loadedFiles.infrastructureLocal ? "존재 ✅" : "없음 ⚠️"}, .env.production.local=${plan.loadedFiles.productionLocal ? "존재 ✅" : "없음"}, .env.production=${plan.loadedFiles.productionTracked ? "존재 ✅" : "없음 ⚠️"}`,
  );
  log(`• 준비된 클라우드 Variables (${plan.variableNames.length}개): ${plan.variableNames.join(", ") || "없음"}`);
  log(
    `• 준비된 클라우드 Secrets (${plan.secretNames.length}개): ${plan.secretNames.join(", ") || "없음"}${plan.apiEnvKeyCount > 0 ? ` (ONPOD_API_ENV_JSON ${plan.apiEnvKeyCount}개 키 포함)` : ""}`,
  );
  if (plan.missingSecrets.length > 0) {
    log(`• 미등록 로컬 Secrets: ${plan.missingSecrets.join(", ")}`);
  }

  if (verifyRemote) {
    const accountId = plan.variables.CLOUDFLARE_ACCOUNT_ID || "";
    if (plan.secrets.CLOUDFLARE_API_TOKEN && accountId) {
      const cfCheck = await verifyCloudflareApiToken(plan.secrets.CLOUDFLARE_API_TOKEN, accountId);
      log(`• 원격 Cloudflare 토큰 검증: ${cfCheck.ok ? `성공 ✅ (${cfCheck.reason})` : `실패 ❌ (${cfCheck.reason})`}`);
    } else if (process.env.CLOUDFLARE_API_TOKEN && accountId) {
      const shellCheck = await verifyCloudflareApiToken(process.env.CLOUDFLARE_API_TOKEN, accountId);
      if (!shellCheck.ok) {
        log(
          `• 주의 ⚠️: 부모 셸의 CLOUDFLARE_API_TOKEN이 유효하지 않습니다(${shellCheck.reason}). .env.infrastructure.local로 복사하지 않았습니다.`,
        );
      }
    }
  }

  if (localOnly) {
    log("• GitHub Environment 상태: 조회 생략 (`--local-only`)");
  } else if (!ghStatus?.ghReady) {
    log("• GitHub Environment 상태: 미검증 (`gh auth login` 필요)");
  } else if (!ghStatus.environmentExists) {
    log(`• GitHub Environment(\`${GITHUB_DEPLOY_ENVIRONMENT}\`): 아직 생성 전 ⚠️ (\`pnpm run deploy:auth:sync\`로 생성·주입)`);
  } else {
    log(
      `• GitHub Environment(\`${GITHUB_DEPLOY_ENVIRONMENT}\`) 등록 Variables (${ghStatus.configuredVariables.length}개): ${ghStatus.configuredVariables.join(", ") || "없음"}`,
    );
    log(
      `• GitHub Environment(\`${GITHUB_DEPLOY_ENVIRONMENT}\`) 등록 Secrets (${ghStatus.configuredSecrets.length}개): ${ghStatus.configuredSecrets.join(", ") || "없음"}`,
    );
  }

  for (const warning of plan.warnings) {
    log(`  ℹ️ ${warning}`);
  }
  for (const error of plan.errors) {
    log(`  ❌ ${error}`);
  }
}

function printHelp(log = console.log) {
  log(
    [
      "사용법: pnpm run deploy:auth -- [옵션]",
      "  --status                   로컬 env 및 GitHub `production-deploy` Environment 상태 점검",
      "  --local-only               GitHub 조회 없이 로컬 준비 상태만 확인 (`pnpm run deploy:info`)",
      "  --verify-remote            Cloudflare 토큰 권한 및 만료 셸 토큰 여부 원격 점검",
      "  --provision-onpod-key      onpod `toonstudio-api` 전용 최소권한 키 발급 및 .env.infrastructure.local 저장",
      "  --force-rotate             `--provision-onpod-key` 실행 시 기존 키가 있어도 새 앱 전용 키로 교체",
      "  --set-cloudflare-token     표준 입력(stdin)에서 CLOUDFLARE_API_TOKEN을 읽어 검증 후 로컬 저장",
      "  --sync-github              로컬 설정값들을 GitHub `production-deploy` Environment에 주입",
      "  --dry-run                  `--sync-github` 실행 시 원격 변경 없이 주입 계획만 출력",
    ].join("\n"),
  );
}

async function main() {
  const options = parseAuthCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const execEnv = buildExecEnv();

  if (options.setCloudflareToken) {
    const stdinToken = readFileSync(0, "utf8").trim();
    if (isPlaceholderCredentialValue(stdinToken)) {
      throw new Error("[deploy:auth] 표준 입력에서 유효한 CLOUDFLARE_API_TOKEN을 읽지 못했습니다.");
    }
    const loaded = loadLocalEnvMaps(ROOT);
    const accountId = (loaded.infra.values.CLOUDFLARE_ACCOUNT_ID || "").trim();
    if (!accountId) {
      throw new Error("[deploy:auth] .env.infrastructure.local에 CLOUDFLARE_ACCOUNT_ID가 먼저 설정되어야 합니다.");
    }
    const verification = await verifyCloudflareApiToken(stdinToken, accountId);
    if (!verification.ok) {
      throw new Error(
        `[deploy:auth] 입력된 CLOUDFLARE_API_TOKEN 권한 검증 실패(${verification.reason}). Workers Scripts:Edit + Workers R2 Storage:Edit 권한을 확인하세요.`,
      );
    }
    upsertEnvFileEntries(loaded.infraPath, { CLOUDFLARE_API_TOKEN: stdinToken });
    console.log(
      `✅ CLOUDFLARE_API_TOKEN 검증(${verification.reason}) 및 .env.infrastructure.local 저장 완료 (지문=${secretFingerprint(stdinToken)})`,
    );
  }

  if (options.provisionOnpodKey) {
    const result = provisionScopedOnpodDeployKey({
      rootDir: ROOT,
      execEnv,
      forceRotate: options.forceRotate,
    });
    if (result.created) {
      console.log(
        `✅ onpod 앱 전용 배포 키(${result.keyName}, 만료 ${result.expiresDays}일) 발급 및 .env.infrastructure.local 저장 완료 (지문=${result.fingerprint})`,
      );
    } else {
      console.log(`ℹ️ 기존 onpod 앱 전용 배포 키(ONPOD_DEPLOY_TOKEN, 지문=${result.fingerprint})를 재사용합니다.`);
    }
  }

  if (options.syncGithub) {
    const plan = buildGitHubDeploySyncPlan(ROOT);
    syncPlanToGitHubActions(plan, {
      rootDir: ROOT,
      execEnv,
      dryRun: options.dryRun,
    });
    if (!options.dryRun) {
      await printDeployAuthStatus({
        rootDir: ROOT,
        localOnly: false,
        verifyRemote: options.verifyRemote,
        execEnv,
      });
    }
    return;
  }

  await printDeployAuthStatus({
    rootDir: ROOT,
    localOnly: options.localOnly,
    verifyRemote: options.verifyRemote,
    execEnv,
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  main().catch((error) => {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
