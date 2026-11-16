#!/usr/bin/env node
/**
 * GitHub Actions 클라우드 배포용 Cloudflare 정적 웹·R2·Apex 리다이렉트 실행기
 *
 * 비밀값은 절대 출력하지 않으며, 배포 전 원격 활성 버전 ID와 RELEASE_SHA를 조회하여:
 * 1) 롤백 대상 버전을 아티팩트와 Step Summary에 기록하고
 * 2) 동일 40자리 SHA의 중복 배포를 자동 차단하며
 * 3) 배포 직후 /studio 교차 출처 격리 헤더 및 에지 출처 인증(edgeOriginAuth=enforced)을 검증한다.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GITHUB_DEPLOY_ENVIRONMENT,
  GITHUB_REPO_SLUG,
  ONPOD_CANONICAL_ORIGIN,
  isPlaceholderCredentialValue,
  redactSensitiveText,
} from "./lib/deploy-auth-env.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const ROOT = resolve(dirname(MODULE_PATH), "..");

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const STATIC_WORKER_NAME = "toonspectrum-web";
const PRE_CUTOVER_VERSION_PREFIX = "70517470";

function appendStepSummary(lines, env = process.env) {
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

export function parseCloudflareDeployArgs(argv) {
  let unit = "static-web";
  let dryRun = false;
  let syncWorkerSecrets = false;

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--sync-worker-secrets") syncWorkerSecrets = true;
    else if (arg.startsWith("--unit=")) unit = arg.slice("--unit=".length);
    else throw new Error("[cloud-deploy:cloudflare] 지원하지 않는 옵션입니다(원문 미출력).");
  }
  if (!["static-web", "apex-redirect"].includes(unit)) {
    throw new Error(`[cloud-deploy:cloudflare] 알 수 없는 배포 단위입니다: ${unit}`);
  }
  return { unit, dryRun, syncWorkerSecrets };
}

export function verifyPrebuiltStaticDist(rootDir, expectedSha) {
  if (!/^[0-9a-f]{40}$/u.test(expectedSha || "")) {
    throw new Error("[cloud-deploy:cloudflare] RELEASE_SHA는 소문자 40자리 16진수 SHA여야 합니다.");
  }
  for (const rel of ["dist/index.html", "dist/.assetsignore", "dist/sw.js", "dist/.vite/build-meta.json"]) {
    if (!existsSync(join(rootDir, rel))) {
      throw new Error(`[cloud-deploy:cloudflare] 사전 빌드 필수 산출물이 누락되었습니다: ${rel}`);
    }
  }
  const meta = JSON.parse(readFileSync(join(rootDir, "dist/.vite/build-meta.json"), "utf8"));
  if (meta?.gitSha !== expectedSha) {
    throw new Error(
      `[cloud-deploy:cloudflare] dist/.vite/build-meta.json의 gitSha(${String(meta?.gitSha ?? "missing")})가 RELEASE_SHA(${expectedSha})와 일치하지 않습니다.`,
    );
  }
  return meta;
}

export async function fetchActiveWorkerState(accountId, apiToken, scriptName = STATIC_WORKER_NAME, fetchImpl = fetch) {
  const headers = { authorization: `Bearer ${apiToken}` };
  const [deploymentsRes, settingsRes] = await Promise.all([
    fetchImpl(`${CLOUDFLARE_API}/accounts/${accountId}/workers/scripts/${scriptName}/deployments`, { headers }),
    fetchImpl(`${CLOUDFLARE_API}/accounts/${accountId}/workers/scripts/${scriptName}/settings`, { headers }),
  ]);

  if (!deploymentsRes.ok) {
    throw new Error(
      `[cloud-deploy:cloudflare] Cloudflare Worker 배포 이력 조회 실패 (HTTP ${deploymentsRes.status}). CLOUDFLARE_API_TOKEN의 Workers Scripts 권한을 확인하세요.`,
    );
  }
  if (!settingsRes.ok) {
    throw new Error(
      `[cloud-deploy:cloudflare] Cloudflare Worker 설정 조회 실패 (HTTP ${settingsRes.status}).`,
    );
  }

  const deploymentsBody = await deploymentsRes.json();
  const settingsBody = await settingsRes.json();
  const latestDeployment = deploymentsBody?.result?.deployments?.[0] ?? null;
  const activeVersionId = latestDeployment?.versions?.[0]?.version_id ?? null;
  const bindings = Array.isArray(settingsBody?.result?.bindings) ? settingsBody.result.bindings : [];
  const releaseShaBinding = bindings.find((b) => b?.name === "RELEASE_SHA" && b?.type === "plain_text");
  const activeReleaseSha = typeof releaseShaBinding?.text === "string" ? releaseShaBinding.text.trim() : null;

  return {
    deploymentId: latestDeployment?.id ?? null,
    activeVersionId,
    activeReleaseSha,
  };
}

export async function verifyLiveStaticWebSmoke(publicBaseUrl = "https://www.toonstudio.cloud", fetchImpl = fetch) {
  const studioRes = await fetchImpl(`${publicBaseUrl}/studio`, { redirect: "manual" });
  if (studioRes.status !== 200) {
    throw new Error(`[cloud-deploy:cloudflare] 배포 후 /studio 응답 오류: HTTP ${studioRes.status}`);
  }
  const coop = studioRes.headers.get("cross-origin-opener-policy") || "";
  const coep = studioRes.headers.get("cross-origin-embedder-policy") || "";
  if (coop !== "same-origin" || !["credentialless", "require-corp"].includes(coep)) {
    throw new Error(
      `[cloud-deploy:cloudflare] /studio 교차 출처 격리 헤더 누락 (COOP=${coop || "none"}, COEP=${coep || "none"})`,
    );
  }

  const providersRes = await fetchImpl(`${publicBaseUrl}/api/auth/providers`);
  if (providersRes.status !== 200) {
    throw new Error(`[cloud-deploy:cloudflare] /api/auth/providers 응답 오류: HTTP ${providersRes.status}`);
  }

  const capRes = await fetchImpl(`${publicBaseUrl}/api/health/capabilities`);
  if (capRes.status !== 200) {
    throw new Error(`[cloud-deploy:cloudflare] /api/health/capabilities 응답 오류: HTTP ${capRes.status}`);
  }
  const capBody = await capRes.json();
  if (capBody?.edgeOriginAuth !== "enforced") {
    throw new Error(
      `[cloud-deploy:cloudflare] 에지 출처 인증 상태 불일치: edgeOriginAuth=${String(capBody?.edgeOriginAuth ?? "missing")}`,
    );
  }

  return {
    studioStatus: studioRes.status,
    coop,
    coep,
    providersStatus: providersRes.status,
    edgeOriginAuth: capBody.edgeOriginAuth,
  };
}

function runCommandOrThrow(executable, args, { cwd = ROOT, env = process.env, input } = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    input,
    stdio: input !== undefined ? ["pipe", "inherit", "inherit"] : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`[cloud-deploy:cloudflare] 명령 실패 (종료 코드 ${result.status ?? 1}): ${executable}`);
  }
}

function writeMissingAuthSummary(env = process.env) {
  appendStepSummary(
    [
      "### ❌ Cloudflare 클라우드 배포 중단 (인증 시크릿 미설정)",
      "",
      `GitHub Environment \`${GITHUB_DEPLOY_ENVIRONMENT}\`에 \`CLOUDFLARE_API_TOKEN\` 또는 \`CLOUDFLARE_ACCOUNT_ID\`가 설정되어 있지 않습니다.`,
      "",
      "로컬 PC에서 아래 명령으로 한 번만 등록·동기화하면 이후 로컬 env가 없는 클라우드 환경에서도 바로 배포할 수 있습니다:",
      "```bash",
      "# 1) Workers Scripts:Edit + Workers R2 Storage:Edit 권한 토큰을 표준 입력으로 등록 후 GitHub에 동기화",
      "pnpm run deploy:auth -- --set-cloudflare-token --sync-github",
      "```",
      `또는 저장소 환경 설정(\`https://github.com/${GITHUB_REPO_SLUG}/settings/environments\`)의 \`${GITHUB_DEPLOY_ENVIRONMENT}\`에 \`CLOUDFLARE_API_TOKEN\` Secret을 추가해 주세요.`,
    ],
    env,
  );
}

async function runApexRedirect({ dryRun, env }) {
  runCommandOrThrow("pnpm", ["run", "verify:cloudflare-apex-redirect"], { env });
  if (dryRun) return;

  const token = (env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (isPlaceholderCredentialValue(token) || !/^[0-9a-f]{32}$/iu.test(accountId)) {
    writeMissingAuthSummary(env);
    throw new Error("[cloud-deploy:cloudflare] CLOUDFLARE_API_TOKEN 및 CLOUDFLARE_ACCOUNT_ID가 필요합니다.");
  }

  const uploadOut = execFileSync(
    "pnpm",
    ["exec", "wrangler", "versions", "upload", "--config", "deploy/cloudflare-apex-redirect/wrangler.jsonc"],
    { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const versionMatch = uploadOut.match(/Worker Version ID:\s*([0-9a-f-]{36})/iu);
  if (!versionMatch) {
    throw new Error("[cloud-deploy:cloudflare] Apex Worker Version ID를 업로드 결과에서 찾지 못했습니다.");
  }
  const newVersionId = versionMatch[1];
  runCommandOrThrow(
    "pnpm",
    [
      "exec",
      "wrangler",
      "versions",
      "deploy",
      `${newVersionId}@100`,
      "--yes",
      "--config",
      "deploy/cloudflare-apex-redirect/wrangler.jsonc",
    ],
    { env },
  );
  appendStepSummary(
    [
      "### ✅ Cloudflare Apex 리다이렉트 Worker 배포 완료",
      `- **신규 활성 Version ID:** \`${newVersionId}\``,
    ],
    env,
  );
}

async function runStaticWeb({ dryRun, syncWorkerSecrets, env }) {
  const releaseSha = (env.RELEASE_SHA || "").trim();
  const coreOrigin = new URL((env.CORE_API_ORIGIN || ONPOD_CANONICAL_ORIGIN).trim()).origin;

  verifyPrebuiltStaticDist(ROOT, releaseSha);
  runCommandOrThrow("pnpm", ["run", "generate:cloudflare-static-rules", "--", "--check"], { env });
  runCommandOrThrow("node", ["scripts/verify-static-csp.mjs", "dist/index.html"], { env });
  runCommandOrThrow("node", ["scripts/verify-static-service-worker.mjs"], { env });

  if (dryRun) {
    runCommandOrThrow("pnpm", ["run", "sync:cloudflare-r2-assets:dry-run"], { env });
    runCommandOrThrow(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--dry-run",
        "--config",
        "deploy/cloudflare-static/wrangler.jsonc",
        "--var",
        `CORE_API_ORIGIN:${coreOrigin}`,
        "--var",
        `RELEASE_SHA:${releaseSha}`,
      ],
      { env },
    );
    appendStepSummary(
      [
        "### ✅ Cloudflare 정적 웹 + R2 클라우드 드라이런 통과",
        `- **검증 SHA:** \`${releaseSha}\``,
        `- **대상 Core API Origin:** \`${coreOrigin}\``,
        "- **실제 운영 배포 여부:** 미실행 (`deployed: false`)",
      ],
      env,
    );
    return;
  }

  const token = (env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (isPlaceholderCredentialValue(token) || !/^[0-9a-f]{32}$/iu.test(accountId)) {
    writeMissingAuthSummary(env);
    throw new Error("[cloud-deploy:cloudflare] CLOUDFLARE_API_TOKEN 및 CLOUDFLARE_ACCOUNT_ID가 필요합니다.");
  }

  const remoteState = await fetchActiveWorkerState(accountId, token, STATIC_WORKER_NAME);
  if (remoteState.activeReleaseSha && remoteState.activeReleaseSha === releaseSha) {
    throw new Error(
      `[cloud-deploy:cloudflare] 동일 SHA 중복 배포 차단: ${STATIC_WORKER_NAME}에 이미 RELEASE_SHA=${releaseSha}가 활성 배포되어 있습니다.`,
    );
  }
  if (remoteState.activeVersionId?.startsWith(PRE_CUTOVER_VERSION_PREFIX)) {
    throw new Error("[cloud-deploy:cloudflare] 컷오버 이전 Worker 버전이 감지되어 배포를 중단합니다.");
  }

  const artifactDir = join(ROOT, "artifacts/cloud-deploy");
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, "cloudflare-rollback.json"),
    `${JSON.stringify(
      {
        unit: STATIC_WORKER_NAME,
        targetReleaseSha: releaseSha,
        previousVersionId: remoteState.activeVersionId,
        previousReleaseSha: remoteState.activeReleaseSha,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (syncWorkerSecrets) {
    const originSecret = (env.CORE_ORIGIN_SECRET || "").trim();
    if (!isPlaceholderCredentialValue(originSecret) && Buffer.byteLength(originSecret, "utf8") >= 32) {
      runCommandOrThrow(
        "pnpm",
        ["exec", "wrangler", "secret", "put", "CORE_ORIGIN_SECRET", "--config", "deploy/cloudflare-static/wrangler.jsonc"],
        { env, input: originSecret },
      );
    }
    const neisKey = (env.NEIS_API_KEY || "").trim();
    if (!isPlaceholderCredentialValue(neisKey)) {
      runCommandOrThrow(
        "pnpm",
        ["exec", "wrangler", "secret", "put", "NEIS_API_KEY", "--config", "deploy/cloudflare-static/wrangler.jsonc"],
        { env, input: neisKey },
      );
    }
  }

  runCommandOrThrow("pnpm", ["run", "sync:cloudflare-r2-assets"], { env });
  runCommandOrThrow(
    "pnpm",
    [
      "exec",
      "wrangler",
      "deploy",
      "--config",
      "deploy/cloudflare-static/wrangler.jsonc",
      "--var",
      `CORE_API_ORIGIN:${coreOrigin}`,
      "--var",
      `RELEASE_SHA:${releaseSha}`,
    ],
    { env },
  );

  const postDeployState = await fetchActiveWorkerState(accountId, token, STATIC_WORKER_NAME);
  const smoke = await verifyLiveStaticWebSmoke("https://www.toonstudio.cloud");

  appendStepSummary(
    [
      "### ✅ Cloudflare 정적 웹 + R2 운영 배포 및 사후 스모크 완료",
      `- **승인·반영 SHA (\`RELEASE_SHA\`):** \`${releaseSha}\``,
      `- **신규 활성 Worker Version ID:** \`${postDeployState.activeVersionId ?? "확인 필요"}\``,
      `- **직전 정상 롤백 대상 Version ID:** \`${remoteState.activeVersionId ?? "미기록"}\` (복구 명령: \`pnpm exec wrangler versions deploy ${remoteState.activeVersionId ?? "<version-id>"}@100 --name toonspectrum-web --yes\`)`,
      `- **사후 스모크:** \`/studio\` HTTP ${smoke.studioStatus} (\`COOP=${smoke.coop}\`, \`COEP=${smoke.coep}\`), \`/api/auth/providers\` HTTP ${smoke.providersStatus}, \`edgeOriginAuth=${smoke.edgeOriginAuth}\``,
    ],
    env,
  );
}

async function main() {
  const options = parseCloudflareDeployArgs(process.argv.slice(2));
  if (options.unit === "apex-redirect") {
    await runApexRedirect({ dryRun: options.dryRun, env: process.env });
    return;
  }
  await runStaticWeb({
    dryRun: options.dryRun,
    syncWorkerSecrets: options.syncWorkerSecrets,
    env: process.env,
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  main().catch((error) => {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
