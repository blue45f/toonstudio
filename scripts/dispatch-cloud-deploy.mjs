#!/usr/bin/env node
/**
 * 로컬 `.env`가 전혀 없는 클라우드 환경(Codex Cloud, Codespaces, 원격 컨테이너 등)에서
 * GitHub Actions `cloud-production-deploy.yml`을 안전하게 조회·실행하는 진입점 (`pnpm run deploy:cloud`)
 *
 *   pnpm run deploy:cloud -- --status                           # origin/main CI 게이트 및 GitHub Environment 준비 상태 확인
 *   pnpm run deploy:cloud -- --dry-run                          # 원격 변경 없이 클라우드 빌드·드라이런 실행
 *   pnpm run deploy:cloud -- --web --watch                      # Cloudflare 정적 웹 + R2 운영 배포 실행
 *   pnpm run deploy:cloud -- --api-image --watch                # Core API 불변 GHCR 이미지 빌드·발행
 *   pnpm run deploy:cloud -- --api-onpod --confirm-onpod        # 서울 onpod Core API 이미지 교체(명시 승인 필요)
 *   pnpm run deploy:cloud -- --sync-api-env --confirm-onpod     # GitHub에 주입된 ONPOD_API_ENV_JSON을 onpod에 동기화
 */
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GITHUB_DEPLOY_ENVIRONMENT,
  GITHUB_REPO_SLUG,
  redactSensitiveText,
} from "./lib/deploy-auth-env.mjs";
import { REQUIRED_ONPOD_CONFIRM } from "./cloud-deploy-onpod.mjs";
import { inspectGitHubEnvironmentStatus } from "./setup-deploy-auth.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const ROOT = resolve(dirname(MODULE_PATH), "..");
export const CLOUD_DEPLOY_WORKFLOW_FILE = "cloud-production-deploy.yml";

function buildExecEnv(baseEnv = process.env) {
  const nodeBin = dirname(process.execPath);
  const existing = (baseEnv.PATH ?? "").split(delimiter).filter(Boolean);
  const mergedPath = [nodeBin, "/opt/homebrew/bin", "/usr/local/bin", ...existing].filter(
    (entry, index, list) => list.indexOf(entry) === index,
  );
  return { ...baseEnv, PATH: mergedPath.join(delimiter) };
}

export function parseCloudDispatchArgs(argv) {
  const out = {
    help: false,
    status: false,
    dryRun: false,
    web: false,
    apex: false,
    apiImage: false,
    apiOnpod: false,
    syncApiEnv: false,
    syncWorkerSecrets: false,
    confirmOnpod: false,
    watch: false,
    sha: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--status") out.status = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--web") out.web = true;
    else if (arg === "--apex") out.apex = true;
    else if (arg === "--api-image") out.apiImage = true;
    else if (arg === "--api-onpod") out.apiOnpod = true;
    else if (arg === "--sync-api-env") out.syncApiEnv = true;
    else if (arg === "--sync-worker-secrets") out.syncWorkerSecrets = true;
    else if (arg === "--confirm-onpod") out.confirmOnpod = true;
    else if (arg === "--watch") out.watch = true;
    else if (arg === "--sha" && argv[i + 1]) {
      out.sha = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith("--sha=")) {
      out.sha = arg.slice("--sha=".length).trim();
    } else {
      throw new Error("[deploy:cloud] 지원하지 않는 옵션입니다. `--help`로 사용법을 확인하세요(원문 미출력).");
    }
  }

  if (out.sha && !/^[0-9a-f]{40}$/u.test(out.sha)) {
    throw new Error("[deploy:cloud] `--sha`는 소문자 40자리 16진수 커밋 SHA여야 합니다.");
  }

  const anyMutating =
    out.web || out.apex || out.apiImage || out.apiOnpod || out.syncApiEnv || out.syncWorkerSecrets;
  if (out.dryRun && anyMutating) {
    throw new Error("[deploy:cloud] `--dry-run`은 실제 배포 플래그(`--web`, `--api-onpod` 등)와 함께 쓸 수 없습니다.");
  }
  if ((out.apiOnpod || out.syncApiEnv) && !out.confirmOnpod) {
    throw new Error(
      "[deploy:cloud] 서울 onpod 변경(`--api-onpod`, `--sync-api-env`)은 상시 승인 범위 밖이므로 `--confirm-onpod`를 명시해야 합니다.",
    );
  }
  if (out.syncWorkerSecrets && !out.web) {
    throw new Error("[deploy:cloud] `--sync-worker-secrets`는 `--web` 배포와 함께 실행하세요.");
  }

  if (!out.help && !out.status && !out.dryRun && !anyMutating) {
    out.status = true;
  }
  return out;
}

export function resolveOriginMainSha({
  rootDir = ROOT,
  execEnv = buildExecEnv(),
  repoSlug = GITHUB_REPO_SLUG,
  execFileImpl = execFileSync,
} = {}) {
  try {
    const out = execFileImpl(
      "gh",
      ["api", `repos/${repoSlug}/commits/heads/main`, "--jq", ".sha"],
      { cwd: rootDir, env: execEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (/^[0-9a-f]{40}$/u.test(out)) return out;
  } catch {
    // GitHub API 실패 시 로컬 git ls-remote 폴백
  }
  const lsRemote = execFileImpl("git", ["ls-remote", "origin", "refs/heads/main"], {
    cwd: rootDir,
    env: execEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const sha = lsRemote.split(/\s+/u)[0] || "";
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new Error("[deploy:cloud] 원격 origin/main의 40자리 SHA를 확인하지 못했습니다.");
  }
  return sha;
}

export function inspectCommitRequiredGates(
  sha,
  {
    rootDir = ROOT,
    execEnv = buildExecEnv(),
    repoSlug = GITHUB_REPO_SLUG,
    execFileImpl = execFileSync,
  } = {},
) {
  const raw = execFileImpl(
    "gh",
    ["api", `repos/${repoSlug}/commits/${sha}/check-runs?per_page=100`],
    { cwd: rootDir, env: execEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(raw);
  const runs = Array.isArray(parsed?.check_runs) ? parsed.check_runs : [];
  const gates = {};
  for (const gate of ["core", "verify"]) {
    const matching = runs
      .filter((r) => r?.name === gate && r?.app?.slug === "github-actions" && r?.status === "completed")
      .sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0));
    const last = matching.at(-1);
    gates[gate] = last?.conclusion ?? "missing";
  }
  return {
    sha,
    gates,
    allGreen: gates.core === "success" && gates.verify === "success",
  };
}

export function buildWorkflowDispatchFields(options, resolvedSha) {
  return {
    ref: resolvedSha,
    deploy_web: String(Boolean(options.web)),
    deploy_apex_redirect: String(Boolean(options.apex)),
    build_api_image: String(Boolean(options.apiImage)),
    deploy_api_onpod: String(Boolean(options.apiOnpod)),
    sync_api_env_onpod: String(Boolean(options.syncApiEnv)),
    sync_worker_secrets: String(Boolean(options.syncWorkerSecrets)),
    onpod_confirm: options.confirmOnpod ? REQUIRED_ONPOD_CONFIRM : "NONE",
  };
}

function printHelp(log = console.log) {
  log(
    [
      "사용법: pnpm run deploy:cloud -- [옵션]",
      "  --status                원격 origin/main SHA, 필수 CI(core·verify), GitHub Environment 준비 상태 조회(기본)",
      "  --dry-run               실제 배포 없이 클라우드 빌드 + Cloudflare/Onpod 드라이런 워크플로 실행",
      "  --web                   Cloudflare 정적 웹(toonspectrum-web) + R2 에셋 배포",
      "  --apex                  Cloudflare Apex 리다이렉트 Worker 배포",
      "  --api-image             Core API 불변 GHCR 이미지 빌드·발행",
      "  --api-onpod             서울 onpod(toonstudio-api) 이미지 교체 (`--confirm-onpod` 필수)",
      "  --sync-api-env          GitHub의 ONPOD_API_ENV_JSON을 onpod에 반영 (`--confirm-onpod` 필수, DATABASE_URL 보존)",
      "  --sync-worker-secrets   정적 Worker 시크릿(CORE_ORIGIN_SECRET·NEIS_API_KEY)도 함께 동기화 (`--web`과 함께)",
      "  --confirm-onpod         상시 승인 범위 밖인 onpod 변경 승인 명시",
      "  --sha <40자리-sha>      대상 origin/main SHA 명시 (생략 시 현재 origin/main 끝 SHA 자동 고정)",
      "  --watch                 워크플로 디스패치 직후 완료될 때까지 실행 상태 추적",
    ].join("\n"),
  );
}

function printCloudStatus({ rootDir = ROOT, execEnv = buildExecEnv(), targetSha = "" } = {}) {
  const originMainSha = resolveOriginMainSha({ rootDir, execEnv });
  const effectiveSha = targetSha || originMainSha;
  const ghEnv = inspectGitHubEnvironmentStatus({ rootDir, execEnv });
  let gateInfo;
  try {
    gateInfo = inspectCommitRequiredGates(effectiveSha, { rootDir, execEnv });
  } catch {
    gateInfo = null;
  }

  console.log("=== ToonStudio 무(無)-로컬-env 클라우드 배포 상태 (GitHub Actions 연동) ===");
  console.log(`• 원격 origin/main 최신 SHA: ${originMainSha}`);
  if (targetSha && targetSha !== originMainSha) {
    console.log(`• 지정한 SHA 일치 여부: 불일치 ❌ (지정=${targetSha})`);
  }
  if (gateInfo) {
    console.log(
      `• 필수 CI 체크(${effectiveSha.slice(0, 12)}): core=${gateInfo.gates.core}, verify=${gateInfo.gates.verify} (${gateInfo.allGreen ? "배포 가능 ✅" : "대기/실패 ⚠️"})`,
    );
  } else {
    console.log("• 필수 CI 체크: 조회 실패 (`gh auth login` 상태를 확인하세요)");
  }
  if (!ghEnv.ghReady) {
    console.log("• GitHub CLI 인증: 미로그인 ⚠️ (`GH_TOKEN` 주입 또는 `gh auth login` 필요)");
  } else if (!ghEnv.environmentExists) {
    console.log(`• GitHub Environment(\`${GITHUB_DEPLOY_ENVIRONMENT}\`): 미생성 ⚠️ (로컬 PC에서 \`pnpm run deploy:auth:sync\` 1회 실행)`);
  } else {
    const webReady =
      ghEnv.configuredVariables.includes("CLOUDFLARE_ACCOUNT_ID")
      && ghEnv.configuredSecrets.includes("CLOUDFLARE_API_TOKEN");
    const onpodReady = ghEnv.configuredSecrets.includes("ONPOD_DEPLOY_TOKEN");
    console.log(
      `• 클라우드 정적 웹 배포 준비(Cloudflare): ${webReady ? "준비됨 ✅" : "CLOUDFLARE_API_TOKEN 등록 필요 ⚠️"}`,
    );
    console.log(`• 클라우드 Core API 배포 준비(onpod): ${onpodReady ? "준비됨 ✅" : "ONPOD_DEPLOY_TOKEN 등록 필요 ⚠️"}`);
    console.log(`• 등록된 Environment Variables: ${ghEnv.configuredVariables.join(", ") || "없음"}`);
    console.log(`• 등록된 Environment Secrets: ${ghEnv.configuredSecrets.join(", ") || "없음"}`);
  }
}

function main() {
  const options = parseCloudDispatchArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const execEnv = buildExecEnv();
  if (options.status) {
    printCloudStatus({ execEnv, targetSha: options.sha });
    return;
  }

  const originMainSha = resolveOriginMainSha({ execEnv });
  const targetSha = options.sha || originMainSha;
  if (targetSha !== originMainSha) {
    throw new Error(
      `[deploy:cloud] 지정한 SHA(${targetSha})가 현재 origin/main 끝(${originMainSha})과 일치하지 않습니다.`,
    );
  }

  const gateStatus = inspectCommitRequiredGates(targetSha, { execEnv });
  if (!gateStatus.allGreen && !options.dryRun) {
    throw new Error(
      `[deploy:cloud] 대상 SHA(${targetSha})의 필수 CI가 아직 녹색이 아닙니다 (core=${gateStatus.gates.core}, verify=${gateStatus.gates.verify}).`,
    );
  }

  const fields = buildWorkflowDispatchFields(options, targetSha);
  const ghArgs = [
    "workflow",
    "run",
    CLOUD_DEPLOY_WORKFLOW_FILE,
    "--repo",
    GITHUB_REPO_SLUG,
    "--ref",
    "main",
    ...Object.entries(fields).flatMap(([key, value]) => ["-f", `${key}=${value}`]),
  ];

  execFileSync("gh", ghArgs, { cwd: ROOT, env: execEnv, stdio: "inherit" });
  console.log(
    `✅ 클라우드 배포 워크플로(${CLOUD_DEPLOY_WORKFLOW_FILE}) 실행 요청 완료 — 기준 SHA=${targetSha} (${options.dryRun ? "DRY-RUN" : "LIVE DISPATCH"})`,
  );

  if (options.watch) {
    spawnSync("gh", ["run", "list", "--repo", GITHUB_REPO_SLUG, "--workflow", CLOUD_DEPLOY_WORKFLOW_FILE, "--limit", "3"], {
      cwd: ROOT,
      env: execEnv,
      stdio: "inherit",
    });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  try {
    main();
  } catch (error) {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
