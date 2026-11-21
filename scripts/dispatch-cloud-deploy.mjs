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
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GITHUB_DEPLOY_ENVIRONMENT,
  GITHUB_REPO_SLUG,
  redactSensitiveText,
} from "./lib/deploy-auth-env.mjs";
import { inspectReleaseCi } from "./release-required-ci.mjs";
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
    localOAuth: false,
    dryRun: false,
    web: false,
    apex: false,
    apiImage: false,
    apiOnpod: false,
    syncApiEnv: false,
    syncWorkerSecrets: false,
    confirmOnpod: false,
    watch: false,
    watchIntervalSec: 15,
    sha: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--status") out.status = true;
    else if (arg === "--check-local-oauth") out.localOAuth = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--web") out.web = true;
    else if (arg === "--apex") out.apex = true;
    else if (arg === "--api-image") out.apiImage = true;
    else if (arg === "--api-onpod") out.apiOnpod = true;
    else if (arg === "--sync-api-env") out.syncApiEnv = true;
    else if (arg === "--sync-worker-secrets") out.syncWorkerSecrets = true;
    else if (arg === "--confirm-onpod") out.confirmOnpod = true;
    else if (arg === "--watch") out.watch = true;
    else if (arg === "--watch-interval" && argv[i + 1]) {
      out.watchIntervalSec = Number(argv[i + 1].trim());
      i += 1;
    } else if (arg.startsWith("--watch-interval=")) {
      out.watchIntervalSec = Number(arg.slice("--watch-interval=".length).trim());
    } else if (arg === "--sha" && argv[i + 1]) {
      out.sha = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith("--sha=")) {
      out.sha = arg.slice("--sha=".length).trim();
    } else {
      throw new Error("[deploy:cloud] 지원하지 않는 옵션입니다. `--help`로 사용법을 확인하세요(원문 미출력).");
    }
  }

  if (!Number.isSafeInteger(out.watchIntervalSec) || out.watchIntervalSec < 5 || out.watchIntervalSec > 60) {
    throw new Error("[deploy:cloud] `--watch-interval`은 5~60초 사이의 정수여야 합니다.");
  }

  if (out.sha && !/^[0-9a-f]{40}$/u.test(out.sha)) {
    throw new Error("[deploy:cloud] `--sha`는 소문자 40자리 16진수 커밋 SHA여야 합니다.");
  }

  const anyMutating =
    out.web || out.apex || out.apiImage || out.apiOnpod || out.syncApiEnv || out.syncWorkerSecrets;
  if (out.localOAuth) {
    if (out.dryRun || anyMutating || out.watch) {
      throw new Error("[deploy:cloud] --check-local-oauth는 읽기 전용 상태 조회에서 사용할 수 있습니다.");
    }
    out.status = true;
  }
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
  return inspectReleaseCi(sha, { rootDir, execEnv, repoSlug, execFileImpl });
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
      "  --check-local-oauth     로컬 Wrangler 로그인으로 Worker 버전과 R2 객체 조회 (deploy:doctor)",
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
      "  --watch-interval <초>   --watch 폴링 간격(5~60초, 기본 15초)",
    ].join("\n"),
  );
}

async function printCloudStatus({ rootDir = ROOT, execEnv = buildExecEnv(), targetSha = "", localOAuth = false } = {}) {
  const originMainSha = resolveOriginMainSha({ rootDir, execEnv });
  const effectiveSha = targetSha || originMainSha;
  const ghEnv = inspectGitHubEnvironmentStatus({ rootDir, execEnv });
  let gateInfo;
  try {
    gateInfo = inspectCommitRequiredGates(effectiveSha, { rootDir, execEnv });
  } catch {
    gateInfo = null;
  }

  console.log(localOAuth ? "ToonStudio 운영 배포 진단" : "ToonStudio GitHub Actions 배포 상태");
  console.log(`• 원격 origin/main 최신 SHA: ${originMainSha}`);
  if (targetSha && targetSha !== originMainSha) {
    console.log(`• 지정한 SHA 일치 여부: 불일치 ❌ (지정=${targetSha})`);
  }
  if (gateInfo) {
    console.log(
      `• 필수 CI 체크(${effectiveSha.slice(0, 12)}, ci.yml main push #${gateInfo.runId ?? "없음"} 시도 ${gateInfo.runAttempt ?? "없음"}, ${gateInfo.runStatus}): core=${gateInfo.gates.core}, verify=${gateInfo.gates.verify} (${gateInfo.allGreen ? "배포 가능 ✅" : "대기/실패 ⚠️"})`,
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
  if (localOAuth) {
    const { inspectLocalCloudflareOAuth, resolveLocalCloudflareAccountId } = await import("./lib/cloudflare-local-oauth.mjs");
    const accountId = resolveLocalCloudflareAccountId(rootDir, execEnv);
    const { workerStatus, r2Status } = await inspectLocalCloudflareOAuth({ accountId, env: execEnv });
    console.log(`• 로컬 Wrangler OAuth 조회 — Worker 버전 ${workerStatus ?? "미확인"}, R2 객체 ${r2Status ?? "미확인"}`);
    if (workerStatus === 200 && r2Status === 200) {
      console.log("  로컬 웹·R2 배포 명령: pnpm run deploy:web -- --wrangler-oauth");
    } else {
      console.log("  로컬 CLOUDFLARE_ACCOUNT_ID와 Wrangler 로그인, 운영 Worker·R2 조회 권한을 확인하세요.");
    }
  }
}

/** 응답에서 받은 실행 ID만 추적한다. 응답 유실 시 배포 요청을 다시 보내지 않는다. */
export function dispatchCloudWorkflow(
  fields,
  { watch, watchIntervalSec = 15, rootDir = ROOT, execEnv = buildExecEnv(), exec = execFileSync, log = console.log },
) {
  const options = { cwd: rootDir, env: execEnv };
  const workflowUrl = `https://github.com/${GITHUB_REPO_SLUG}/actions/workflows/${CLOUD_DEPLOY_WORKFLOW_FILE}`;
  let response;
  try {
    const output = exec("gh", [
      "api", "--method", "POST", "-H", "X-GitHub-Api-Version: 2026-03-10",
      `repos/${GITHUB_REPO_SLUG}/actions/workflows/${CLOUD_DEPLOY_WORKFLOW_FILE}/dispatches`, "--input", "-",
    ], { ...options, encoding: "utf8", input: JSON.stringify({ ref: "main", inputs: fields }), stdio: ["pipe", "pipe", "pipe"] });
    response = JSON.parse(output);
  } catch {
    throw new Error(`[deploy:cloud] 배포 요청 결과를 확인하지 못했습니다. 재실행 전에 실행 기록을 확인하세요. ${workflowUrl}`);
  }
  const id = response?.workflow_run_id;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`[deploy:cloud] GitHub가 실행 ID를 반환하지 않았습니다. 실행 기록을 확인하세요. ${workflowUrl}`);
  }
  const runUrl = `https://github.com/${GITHUB_REPO_SLUG}/actions/runs/${id}`;
  log(`GitHub Actions 배포 요청 접수 · ${fields.ref} · ${runUrl}`);
  if (watch) {
    try {
      exec(
        "gh",
        ["run", "watch", String(id), "--repo", GITHUB_REPO_SLUG, "--exit-status", "--interval", String(watchIntervalSec)],
        { ...options, stdio: "inherit" },
      );
    } catch {
      throw new Error(`[deploy:cloud] 배포 작업의 성공을 확인하지 못했습니다. 현재 상태와 실패 단계를 확인하세요. ${runUrl}`);
    }
  }
  return runUrl;
}

async function main() {
  const options = parseCloudDispatchArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const execEnv = buildExecEnv();
  if (options.status) {
    await printCloudStatus({ execEnv, targetSha: options.sha, localOAuth: options.localOAuth });
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
      `[deploy:cloud] 대상 SHA(${targetSha})의 필수 CI가 아직 녹색이 아닙니다 (ci.yml main push ${gateStatus.runStatus}, core=${gateStatus.gates.core}, verify=${gateStatus.gates.verify}).`,
    );
  }

  const fields = buildWorkflowDispatchFields(options, targetSha);
  dispatchCloudWorkflow(fields, { watch: options.watch, watchIntervalSec: options.watchIntervalSec, execEnv });
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  main().catch((error) => {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
