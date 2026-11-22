#!/usr/bin/env node
/**
 * GitHub Actions 클라우드 배포용 서울 onpod Core API(`toonstudio-api`) 실행기
 *
 * 안전 불변식:
 * - `--attach-db` 및 `onpod app rollback`, `--env` 전체 교체를 절대 실행하지 않는다(DB 비밀번호 회전·출처 비밀 파손 방지).
 * - 이미지 교체는 `onpod app update <app> --image ghcr.io/blue45f/toonspectrum-core-api:<40자리-sha>`만 사용한다.
 * - 런타임 환경변수 동기화(`--sync-env`)는 `DATABASE_URL`을 제외한 검증된 맵만 `onpod app env set`으로 전달하며,
 *   인자·응답 원문을 로그에 절대 출력하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GITHUB_DEPLOY_ENVIRONMENT,
  GITHUB_REPO_SLUG,
  ONPOD_CANONICAL_APP,
  ONPOD_CANONICAL_ORIGIN,
  isPlaceholderCredentialValue,
  redactSensitiveText,
  validateOnpodApiEnvMap,
} from "./lib/deploy-auth-env.mjs";
import { parseRenderCoreOrigin, verifyRenderCoreOrigin } from "./verify-render-core-origin.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const ROOT = resolve(dirname(MODULE_PATH), "..");

export const REQUIRED_ONPOD_CONFIRM = "CONFIRM-ONPOD-TOONSTUDIO-API";
const IMAGE_REPO = "ghcr.io/blue45f/toonspectrum-core-api";

function appendStepSummary(lines, env = process.env) {
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function appendStepOutput(entries, env = process.env) {
  const outputPath = env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(entries).map(
    ([key, value]) => `${key}=${String(value ?? "").replace(/[\r\n]/gu, " ")}`,
  );
  appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

export function parseOnpodDeployArgs(argv) {
  let updateImage = false;
  let syncEnv = false;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--update-image") updateImage = true;
    else if (arg === "--sync-env") syncEnv = true;
    else if (arg === "--dry-run") dryRun = true;
    else throw new Error("[cloud-deploy:onpod] 지원하지 않는 옵션입니다(원문 미출력).");
  }
  if (!updateImage && !syncEnv && !dryRun) {
    throw new Error("[cloud-deploy:onpod] `--update-image`, `--sync-env`, `--dry-run` 중 최소 하나가 필요합니다.");
  }
  return { updateImage, syncEnv, dryRun };
}

export function validateOnpodGateInputs({
  releaseSha,
  confirmPhrase,
  deployToken,
  requireConfirm = true,
}) {
  if (!/^[0-9a-f]{40}$/u.test(releaseSha || "")) {
    throw new Error("[cloud-deploy:onpod] RELEASE_SHA는 소문자 40자리 16진수 SHA여야 합니다.");
  }
  if (requireConfirm && confirmPhrase !== REQUIRED_ONPOD_CONFIRM) {
    throw new Error(
      `[cloud-deploy:onpod] onpod는 상시 승인 범위 밖이므로 명시 승인 문구(${REQUIRED_ONPOD_CONFIRM})가 필요합니다.`,
    );
  }
  if (isPlaceholderCredentialValue(deployToken)) {
    throw new Error("[cloud-deploy:onpod] ONPOD_DEPLOY_TOKEN이 설정되지 않았습니다.");
  }
}

export function inspectOnpodAppStatus(appName, childEnv, execFileImpl = execFileSync) {
  let raw;
  try {
    raw = execFileImpl("onpod", ["app", "status", appName, "--json"], {
      cwd: ROOT,
      env: childEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `[cloud-deploy:onpod] onpod app status 조회 실패: ${redactSensitiveText(error instanceof Error ? error.message : "CLI 오류")}`,
      { cause: error },
    );
  }
  const startIdx = raw.indexOf("{");
  const endIdx = raw.lastIndexOf("}");
  if (startIdx < 0 || endIdx < startIdx) {
    throw new Error("[cloud-deploy:onpod] onpod app status JSON 응답을 파싱하지 못했습니다.");
  }
  const parsed = JSON.parse(raw.slice(startIdx, endIdx + 1));
  return {
    name: parsed?.name ?? appName,
    state: parsed?.state ?? "unknown",
    image: typeof parsed?.image === "string" ? parsed.image.trim() : null,
    previousImage: typeof parsed?.previous_image === "string" ? parsed.previous_image.trim() : null,
    url: typeof parsed?.url === "string" ? parsed.url.trim() : ONPOD_CANONICAL_ORIGIN,
    plan: parsed?.plan ?? "unknown",
    freeTier: Boolean(parsed?.free_tier),
  };
}

export function applyOnpodEnvJson(appName, rawJson, childEnv, execFileImpl = execFileSync) {
  if (isPlaceholderCredentialValue(rawJson)) {
    throw new Error("[cloud-deploy:onpod] ONPOD_API_ENV_JSON 시크릿이 비어 있습니다.");
  }
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("[cloud-deploy:onpod] ONPOD_API_ENV_JSON이 유효한 JSON 형식이 아닙니다(원문 미출력).");
  }
  const validationErrors = validateOnpodApiEnvMap(parsed);
  if (validationErrors.length > 0) {
    throw new Error(
      `[cloud-deploy:onpod] ONPOD_API_ENV_JSON 계약 검증 실패:\n - ${validationErrors.join("\n - ")}`,
    );
  }

  const kvPairs = Object.entries(parsed)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, value]) => `${key}=${value}`);

  try {
    execFileImpl("onpod", ["app", "env", "set", appName, ...kvPairs], {
      cwd: ROOT,
      env: childEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `[cloud-deploy:onpod] onpod app env set 실행 실패 (키 ${kvPairs.length}개, 값 미출력)`,
      { cause: error },
    );
  }
  return { appliedKeyCount: kvPairs.length };
}

export async function verifyLiveOnpodOrigin(
  originUrl = ONPOD_CANONICAL_ORIGIN,
  fetchImpl = fetch,
  { onAttempt, verifyHealthImpl = verifyRenderCoreOrigin } = {},
) {
  const origin = parseRenderCoreOrigin(originUrl).origin;
  const health = await verifyHealthImpl({ origin, fetchImpl, onAttempt });
  let directRes;
  try {
    directRes = await fetchImpl(`${origin}/api/auth/providers`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("[cloud-deploy:onpod] 원점 무인증 호출 검증에 실패했습니다. 네트워크 상태와 출처 인증 설정을 점검하세요.");
  }
  // 상태 코드만 검사한다. 본문 정리 지연·오류가 검증을 막거나 원문을 노출하지 않게 한다.
  void directRes.body?.cancel().catch(() => undefined);
  if (directRes.status !== 403) {
    throw new Error(
      `[cloud-deploy:onpod] 원점 무인증 직접 호출이 403으로 차단되지 않았습니다 (HTTP ${directRes.status}). CLOUDFLARE_EDGE_ORIGIN_SECRET 설정을 점검하세요.`,
    );
  }
  return { directAuthStatus: directRes.status, health };
}

function statusEvidence(status) {
  if (!status) return null;
  const safeText = (value) => typeof value === "string"
    ? redactSensitiveText(value).replace(/[\r\n]/gu, " ").slice(0, 1_024)
    : null;
  return {
    state: safeText(status.state),
    image: safeText(status.image),
    previousImage: safeText(status.previousImage),
    plan: safeText(status.plan),
    freeTier: status.freeTier === true,
  };
}

export async function verifyOnpodDeployment({
  appName,
  originUrl,
  targetImage,
  requireTargetImage,
  beforeStatus,
  childEnv,
  artifactDir = join(ROOT, "artifacts/cloud-deploy"),
  env = process.env,
  inspectStatusImpl = inspectOnpodAppStatus,
  verifyOriginImpl = verifyLiveOnpodOrigin,
}) {
  const evidence = {
    app: appName,
    origin: parseRenderCoreOrigin(originUrl).origin,
    targetImage,
    recordedAt: new Date().toISOString(),
    result: "pending",
    beforeStatus: statusEvidence(beforeStatus),
    afterUpdateStatus: null,
    finalStatus: null,
    healthAttempts: [],
    directAuthStatus: null,
    failureStage: null,
  };
  mkdirSync(artifactDir, { recursive: true });
  const persist = () => writeFileSync(
    join(artifactDir, "onpod-verification.json"),
    `${JSON.stringify({ ...evidence, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  persist();

  let stage = "status_after_update";
  let afterStatus;
  let smoke;
  try {
    afterStatus = inspectStatusImpl(appName, childEnv);
    evidence.afterUpdateStatus = statusEvidence(afterStatus);
    persist();
    stage = "origin_verification";
    try {
      smoke = await verifyOriginImpl(originUrl, globalThis.fetch, {
        onAttempt: (attempt) => {
          evidence.healthAttempts.push(attempt);
          persist();
          console.log(`[cloud-deploy:onpod] 상태 확인 ${JSON.stringify(attempt)}`);
        },
      });
      evidence.directAuthStatus = smoke.directAuthStatus;
    } finally {
      // 기동 대기 중 상태가 바뀔 수 있으므로 성공·실패 모두 최종 상태를 다시 기록한다.
      try {
        afterStatus = inspectStatusImpl(appName, childEnv);
        evidence.finalStatus = statusEvidence(afterStatus);
      } catch {
        evidence.finalStatusReadFailed = true;
      }
      persist();
    }

    stage = "final_image_identity";
    if (!evidence.finalStatus) {
      throw new Error("[cloud-deploy:onpod] 최종 실행 이미지 조회에 실패했습니다. onpod app status로 상태를 확인하세요.");
    }
    if (requireTargetImage && afterStatus.image !== targetImage) {
      throw new Error("[cloud-deploy:onpod] 최종 실행 이미지가 대상 이미지와 일치하지 않거나 확인되지 않았습니다. onpod-verification.json을 확인하세요.");
    }
    evidence.result = "success";
    persist();
    return { afterStatus, smoke };
  } catch (error) {
    evidence.result = "failure";
    evidence.failureStage = stage;
    persist();
    appendStepSummary([
      "### ❌ 서울 onpod Core API 사후 검증 실패",
      `- **대상 이미지:** \`${targetImage}\``,
      `- **교체 직후 관측 이미지:** \`${evidence.afterUpdateStatus?.image ?? "미확인"}\``,
      `- **최종 관측 이미지:** \`${evidence.finalStatus?.image ?? "미확인"}\``,
      `- **실패 단계:** \`${stage}\``,
      `- **상태 확인 횟수:** ${evidence.healthAttempts.length}회`,
      "- **진단 기록:** `onpod-verification.json` (시각·상태·이미지·HTTP 시도 기록)",
      "- 이미지 재교체나 롤백은 실행하지 않았습니다. 진단 기록을 확인한 뒤 복구 여부를 별도로 결정하세요.",
    ], env);
    throw error;
  }
}

function writeMissingOnpodAuthSummary(env = process.env) {
  appendStepSummary(
    [
      "### ❌ 서울 onpod 클라우드 배포 중단 (`ONPOD_DEPLOY_TOKEN` 미설정)",
      "",
      `GitHub Environment \`${GITHUB_DEPLOY_ENVIRONMENT}\`에 \`ONPOD_DEPLOY_TOKEN\` 시크릿이 없습니다.`,
      "",
      "로컬 PC에서 아래 한 줄을 실행하면 `toonstudio-api` 전용 최소권한 키가 발급되어 GitHub에 주입됩니다:",
      "```bash",
      "pnpm run deploy:auth -- --provision-onpod-key --sync-github",
      "```",
      `저장소 환경 설정: \`https://github.com/${GITHUB_REPO_SLUG}/settings/environments\``,
    ],
    env,
  );
}

async function main() {
  const options = parseOnpodDeployArgs(process.argv.slice(2));
  const releaseSha = (process.env.RELEASE_SHA || "").trim();
  const appName = (process.env.ONPOD_APP_NAME || ONPOD_CANONICAL_APP).trim();
  const originUrl = parseRenderCoreOrigin(process.env.CORE_API_ORIGIN || ONPOD_CANONICAL_ORIGIN).origin;
  const targetImage = `${IMAGE_REPO}:${releaseSha}`;

  if (options.dryRun) {
    if (!/^[0-9a-f]{40}$/u.test(releaseSha)) {
      throw new Error("[cloud-deploy:onpod] RELEASE_SHA는 소문자 40자리 16진수 SHA여야 합니다.");
    }
    appendStepSummary(
      [
        "### ✅ 서울 onpod Core API 클라우드 드라이런 계획 확인",
        `- **대상 앱:** \`${appName}\` (\`${originUrl}\`)`,
        `- **대상 이미지:** \`${targetImage}\``,
        "- **실제 운영 배포 여부:** 미실행 (`deployed: false`)",
      ],
      process.env,
    );
    return;
  }

  const deployToken = (process.env.ONPOD_DEPLOY_TOKEN || "").trim();
  if (isPlaceholderCredentialValue(deployToken)) {
    writeMissingOnpodAuthSummary(process.env);
  }

  validateOnpodGateInputs({
    releaseSha,
    confirmPhrase: (process.env.ONPOD_CONFIRM || "").trim(),
    deployToken,
    requireConfirm: true,
  });

  const childEnv = {
    ...process.env,
    ONPOD_TOKEN: deployToken,
    ONPOD_NO_ERROR_REPORT: "1",
  };
  delete childEnv.ONPOD_DEPLOY_TOKEN;
  delete childEnv.ONPOD_API_ENV_JSON;

  const beforeStatus = inspectOnpodAppStatus(appName, childEnv);
  if (options.updateImage && !options.syncEnv && beforeStatus.image === targetImage) {
    throw new Error(
      `[cloud-deploy:onpod] 동일 SHA 중복 배포 차단: ${appName}에 이미 ${targetImage} 이미지가 실행 중입니다.`,
    );
  }

  const artifactDir = join(ROOT, "artifacts/cloud-deploy");
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, "onpod-rollback.json"),
    `${JSON.stringify(
      {
        app: appName,
        targetImage,
        previousLiveImage: beforeStatus.image,
        previousRecordedImage: beforeStatus.previousImage,
        plan: beforeStatus.plan,
        freeTier: beforeStatus.freeTier,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  let syncedKeyCount = 0;
  if (options.syncEnv) {
    const syncResult = applyOnpodEnvJson(appName, process.env.ONPOD_API_ENV_JSON || "", childEnv);
    syncedKeyCount = syncResult.appliedKeyCount;
    console.log(`✅ ${appName} 런타임 환경변수 ${syncedKeyCount}개 반영 완료 (DATABASE_URL 및 기존 시크릿 보존)`);
  }

  if (options.updateImage) {
    try {
      const updateOut = execFileSync("onpod", ["app", "update", appName, "--image", targetImage], {
        cwd: ROOT,
        env: childEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      console.log(redactSensitiveText(updateOut));
    } catch (error) {
      throw new Error(
        `[cloud-deploy:onpod] 이미지 교체 실패(${targetImage}). 롤백 대상: ${beforeStatus.image ?? "미확인"}`,
        { cause: error },
      );
    }
  }

  const { afterStatus, smoke } = await verifyOnpodDeployment({
    appName, originUrl, targetImage, requireTargetImage: options.updateImage,
    beforeStatus, childEnv,
  });

  appendStepOutput(
    {
      api_sha: options.updateImage ? releaseSha : "",
      active_api_image: afterStatus.image ?? "",
      previous_api_image: beforeStatus.image ?? "",
    },
    process.env,
  );

  appendStepSummary(
    [
      "### ✅ 서울 onpod Core API 배포 및 원점 사후 스모크 완료",
      `- **대상 앱:** \`${appName}\` (\`${originUrl}\`, 플랜=\`${afterStatus.plan}\`, 무료=\`${afterStatus.freeTier}\`)`,
      `- **현재 실행 이미지:** \`${afterStatus.image ?? "미확인"}\``,
      `- **직전 정상 롤백 대상 이미지:** \`${beforeStatus.image ?? "미기록"}\` (복구 명령: \`onpod app update ${appName} --image ${beforeStatus.image ?? "<이전-SHA-이미지>"}\`, \`onpod app rollback\` 사용 금지)`,
      ...(options.syncEnv ? [`- **동기화한 런타임 환경변수 수:** ${syncedKeyCount}개 (\`DATABASE_URL\` 보존)`] : []),
      `- **원점 사후 스모크:** \`/api/health/live\` 200, \`/api/health/ready\` 200, 원점 무인증 직접 호출 HTTP ${smoke.directAuthStatus} 차단 확인`,
    ],
    process.env,
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  main().catch((error) => {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
