/**
 * GitHub Actions `cloud-production-deploy.yml` 단일 `mode` 프리셋 해석기 및
 * `GITHUB_STEP_SUMMARY`(`webSha`·`apiSha`·`workerVersionId`·안전 롤백 명령) 포맷터.
 */
import { appendFileSync } from "node:fs";

import { ONPOD_CANONICAL_APP, redactSensitiveText } from "./deploy-auth-env.mjs";
import {
  classifyDeployChangedFiles,
  resolveChangedFilesBetweenRefs,
  resolveDeployBaseSha,
} from "./deploy-change-scope.mjs";

export const REQUIRED_ONPOD_CONFIRM_PHRASE = "CONFIRM-ONPOD-TOONSTUDIO-API";
export const WORKFLOW_DEPLOY_MODES = Object.freeze([
  "custom",
  "smart-release",
  "web-only",
  "api-only",
  "dry-run",
]);
export const SAFE_ONPOD_IMAGE_UPDATE_COMMAND =
  `onpod app update ${ONPOD_CANONICAL_APP} --image ghcr.io/blue45f/toonspectrum-core-api:<40자리-sha>`;
export const SAFE_ONPOD_WORKFLOW_COMMAND =
  `gh workflow run cloud-production-deploy.yml -f mode=api-only -f onpod_confirm=${REQUIRED_ONPOD_CONFIRM_PHRASE}`;

const SHA40_PATTERN = /^[0-9a-f]{40}$/u;
const WORKER_VERSION_PATTERN = /^[0-9a-f][0-9a-f-]{7,63}$/iu;
const PRE_CUTOVER_VERSION_PREFIX = "70517470";

/**
 * GitHub Actions `cloud-production-deploy.yml`의 최상단 `mode` 프리셋과
 * 기존 개별 boolean 입력(100% 하위 호환)을 단일 실행 계획으로 해석한다.
 */
export function resolveWorkflowModePlan({
  mode = "custom",
  deployWeb = false,
  deployApex = false,
  buildApiImage = false,
  deployApiOnpod = false,
  syncApiEnvOnpod = false,
  syncWorkerSecrets = false,
  onpodConfirm = "NONE",
  scopeInfo = null,
} = {}) {
  const normalizedMode = String(mode || "custom").trim();
  if (!WORKFLOW_DEPLOY_MODES.includes(normalizedMode)) {
    throw new Error(
      `[cloud-deploy:mode] 지원하지 않는 mode입니다: ${normalizedMode} (허용: ${WORKFLOW_DEPLOY_MODES.join(", ")})`,
    );
  }
  const hasOnpodConfirm = onpodConfirm === REQUIRED_ONPOD_CONFIRM_PHRASE;
  const notes = [];

  let effectiveDeployWeb = Boolean(deployWeb);
  let effectiveDeployApex = Boolean(deployApex);
  let effectiveBuildApiImage = Boolean(buildApiImage);
  let effectiveDeployApiOnpod = Boolean(deployApiOnpod);
  let effectiveSyncApiEnvOnpod = Boolean(syncApiEnvOnpod);
  let effectiveSyncWorkerSecrets = Boolean(syncWorkerSecrets);
  let smartNoop = false;

  if (normalizedMode === "dry-run") {
    if (
      effectiveDeployWeb
      || effectiveDeployApex
      || effectiveBuildApiImage
      || effectiveDeployApiOnpod
      || effectiveSyncApiEnvOnpod
      || effectiveSyncWorkerSecrets
    ) {
      throw new Error("[cloud-deploy:mode] mode=dry-run은 개별 배포 체크박스(deploy_web 등)와 함께 사용할 수 없습니다.");
    }
    notes.push("mode=dry-run: 실제 운영 변경 없이 웹 빌드·드라이런 계약만 검증합니다.");
  } else if (normalizedMode === "web-only") {
    if (effectiveBuildApiImage || effectiveDeployApiOnpod || effectiveSyncApiEnvOnpod) {
      throw new Error("[cloud-deploy:mode] mode=web-only는 API/onpod 체크박스와 함께 사용할 수 없습니다.");
    }
    effectiveDeployWeb = true;
    effectiveBuildApiImage = false;
    effectiveDeployApiOnpod = false;
    effectiveSyncApiEnvOnpod = false;
    notes.push("mode=web-only: Cloudflare 정적 웹 + R2 에셋만 운영 배포합니다.");
  } else if (normalizedMode === "api-only") {
    if (effectiveDeployWeb || effectiveDeployApex || effectiveSyncWorkerSecrets) {
      throw new Error("[cloud-deploy:mode] mode=api-only는 웹/Apex 체크박스와 함께 사용할 수 없습니다.");
    }
    effectiveDeployWeb = false;
    effectiveDeployApex = false;
    effectiveSyncWorkerSecrets = false;
    effectiveBuildApiImage = true;
    effectiveDeployApiOnpod = effectiveDeployApiOnpod || hasOnpodConfirm;
    if (effectiveDeployApiOnpod) {
      notes.push("mode=api-only + onpod_confirm: GHCR 불변 이미지 발행 후 서울 onpod(toonstudio-api)에 반영합니다.");
    } else {
      notes.push(
        `mode=api-only: 상시 승인 범위인 GHCR 불변 이미지만 발행합니다. 서울 onpod 반영까지 수행하려면 \`${SAFE_ONPOD_WORKFLOW_COMMAND}\`를 실행하세요.`,
      );
    }
  } else if (normalizedMode === "smart-release") {
    if (!scopeInfo || scopeInfo.unknownScope || !scopeInfo.scope) {
      throw new Error(
        "[cloud-deploy:mode] mode=smart-release의 변경 범위를 확인하지 못했습니다. `mode=web-only`/`mode=api-only`/`mode=custom`으로 명시 지정하세요.",
      );
    }
    const { scope } = scopeInfo;
    effectiveDeployWeb = Boolean(scope.webChanged || (deployWeb && syncWorkerSecrets));
    effectiveDeployApex = Boolean(scope.apexChanged);
    effectiveBuildApiImage = Boolean(scope.apiChanged);
    effectiveDeployApiOnpod = Boolean(scope.apiChanged && hasOnpodConfirm);
    effectiveSyncApiEnvOnpod = Boolean(syncApiEnvOnpod);
    effectiveSyncWorkerSecrets = Boolean(syncWorkerSecrets);

    if (scope.apiChanged && !hasOnpodConfirm) {
      notes.push(
        `Core API 변경이 감지되었으나 onpod_confirm이 없어 GHCR 이미지만 발행합니다. 서울 onpod 반영 시 \`${SAFE_ONPOD_WORKFLOW_COMMAND}\`를 실행하세요.`,
      );
    }
    if (scope.migrationsChanged) {
      notes.push("DB 스키마/마이그레이션 변경이 감지되었습니다. AGENTS.md 8절에 따라 운영 DB 반영 절차를 별도로 확인하세요.");
    }
    const anySmartSelected =
      effectiveDeployWeb
      || effectiveDeployApex
      || effectiveBuildApiImage
      || effectiveDeployApiOnpod
      || effectiveSyncApiEnvOnpod;
    if (!anySmartSelected) {
      smartNoop = true;
      notes.push("변경된 운영 배포 단위(web·api·apex)가 없어 실제 배포와 불필요한 웹 빌드를 건너뜁니다.");
    }
  }

  if (effectiveSyncWorkerSecrets && !effectiveDeployWeb) {
    throw new Error("[cloud-deploy:mode] sync_worker_secrets는 유효한 deploy_web 실행과 함께만 사용할 수 있습니다.");
  }

  if ((effectiveDeployApiOnpod || effectiveSyncApiEnvOnpod) && !hasOnpodConfirm) {
    throw new Error(
      `[cloud-deploy:mode] 서울 onpod 변경은 상시 승인 범위 밖이므로 onpod_confirm=${REQUIRED_ONPOD_CONFIRM_PHRASE} 선택이 필수입니다.`,
    );
  }

  const anyLiveDeploy = Boolean(
    effectiveDeployWeb
    || effectiveDeployApex
    || effectiveBuildApiImage
    || effectiveDeployApiOnpod
    || effectiveSyncApiEnvOnpod,
  );

  return {
    mode: normalizedMode,
    effectiveDeployWeb,
    effectiveDeployApex,
    effectiveBuildApiImage,
    effectiveDeployApiOnpod,
    effectiveSyncApiEnvOnpod,
    effectiveSyncWorkerSecrets,
    anyLiveDeploy,
    smartNoop,
    notes,
  };
}

export function extractShaFromImageRef(imageRef) {
  if (typeof imageRef !== "string") return null;
  const colonIndex = imageRef.lastIndexOf(":");
  if (colonIndex < 0) return null;
  const candidate = imageRef.slice(colonIndex + 1).trim();
  return SHA40_PATTERN.test(candidate) ? candidate : null;
}

function sanitizeWorkerVersionId(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || !WORKER_VERSION_PATTERN.test(trimmed)) return null;
  if (trimmed.toLowerCase().startsWith(PRE_CUTOVER_VERSION_PREFIX)) return null;
  return trimmed;
}

/**
 * `GITHUB_STEP_SUMMARY`에 기록할 크로스-LLM 통합 배포·스모크·안전 롤백 요약을 생성한다.
 * `webSha`, `apiSha`, `workerVersionId`와 안전한 복구 명령을 고정 형식으로 기록한다.
 */
export function formatReleaseStepSummary({
  mode = "custom",
  releaseSha = "",
  webSha = "",
  apiSha = "",
  apiImageSha = "",
  workerVersionId = "",
  previousWorkerVersionId = "",
  previousApiImage = "",
  smokeStatus = "skipped",
  smartNoop = false,
  notes = [],
} = {}) {
  const resolvedWebSha = SHA40_PATTERN.test(webSha) ? webSha : "not-deployed";
  const resolvedApiSha = SHA40_PATTERN.test(apiSha)
    ? apiSha
    : SHA40_PATTERN.test(apiImageSha)
      ? `image-only:${apiImageSha}`
      : "not-deployed";
  const resolvedWorkerVersionId = sanitizeWorkerVersionId(workerVersionId) ?? "not-deployed";
  const prevWorker = sanitizeWorkerVersionId(previousWorkerVersionId);
  const prevApiSha = extractShaFromImageRef(previousApiImage);

  const safeWebRollback = prevWorker
    ? `pnpm exec wrangler versions deploy ${prevWorker}@100 --name toonspectrum-web --yes`
    : "pnpm exec wrangler versions deploy <직전-정상-version-id>@100 --name toonspectrum-web --yes";
  const safeApiRollback = prevApiSha
    ? `onpod app update ${ONPOD_CANONICAL_APP} --image ghcr.io/blue45f/toonspectrum-core-api:${prevApiSha}`
    : SAFE_ONPOD_IMAGE_UPDATE_COMMAND;

  const lines = [
    "### 🚀 ToonStudio 클라우드 배포 통합 요약",
    "",
    "| 항목 | 값 |",
    "| --- | --- |",
    `| **mode** | \`${mode}\`${smartNoop ? " (변경 없음 · 스마트 건너뛰기)" : ""} |`,
    `| **releaseSha** | \`${releaseSha || "unknown"}\` |`,
    `| **webSha** | \`${resolvedWebSha}\` |`,
    `| **apiSha** | \`${resolvedApiSha}\` |`,
    `| **workerVersionId** | \`${resolvedWorkerVersionId}\` |`,
    `| **postDeploySmoke** | \`${smokeStatus}\` |`,
    "",
    "#### 안전 롤백 명령 (금지 명령 제외)",
    `- **Cloudflare 정적 웹:** \`${safeWebRollback}\``,
    `- **서울 onpod Core API:** \`${safeApiRollback}\``,
  ];

  if (Array.isArray(notes) && notes.length > 0) {
    lines.push("", "#### 참고 사항");
    for (const note of notes) {
      lines.push(`- ${redactSensitiveText(String(note))}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function parseBoolEnv(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function appendOutput(entries, env = process.env) {
  const outputPath = env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const body = Object.entries(entries)
    .map(([key, value]) => `${key}=${String(value ?? "").replace(/[\r\n]/gu, " ")}`)
    .join("\n");
  appendFileSync(outputPath, `${body}\n`, "utf8");
}

export function runResolveWorkflowPlanCli({ rootDir, env = process.env } = {}) {
  const mode = (env.INPUT_MODE || "custom").trim();
  const releaseSha = (env.RELEASE_SHA || "").trim();
  let scopeInfo = null;
  let scopeLine = "not-evaluated";

  if (mode === "smart-release") {
    const baseInfo = resolveDeployBaseSha({ rootDir, targetSha: releaseSha, execEnv: env });
    if (baseInfo.baseSha) {
      const diff = resolveChangedFilesBetweenRefs({
        rootDir,
        baseSha: baseInfo.baseSha,
        targetSha: releaseSha,
        repoSlug: env.GITHUB_REPOSITORY || "blue45f/toonstudio",
        execEnv: env,
      });
      if (diff.ok) {
        const scope = classifyDeployChangedFiles(diff.changedFiles);
        scopeInfo = {
          unknownScope: false,
          baseSha: baseInfo.baseSha,
          baseShaSource: baseInfo.source,
          diffSource: diff.source,
          scope,
        };
        scopeLine = `web=${scope.webChanged},api=${scope.apiChanged},apex=${scope.apexChanged},migrations=${scope.migrationsChanged},files=${scope.changedFiles.length}`;
      } else {
        scopeInfo = { unknownScope: true, baseSha: baseInfo.baseSha, baseShaSource: baseInfo.source, diffSource: diff.source, scope: null };
      }
    } else {
      scopeInfo = { unknownScope: true, baseSha: "", baseShaSource: baseInfo.source, diffSource: "unavailable", scope: null };
    }
  }

  const plan = resolveWorkflowModePlan({
    mode,
    deployWeb: parseBoolEnv(env.DEPLOY_WEB),
    deployApex: parseBoolEnv(env.DEPLOY_APEX),
    buildApiImage: parseBoolEnv(env.BUILD_API_IMAGE),
    deployApiOnpod: parseBoolEnv(env.DEPLOY_API_ONPOD),
    syncApiEnvOnpod: parseBoolEnv(env.SYNC_API_ENV_ONPOD),
    syncWorkerSecrets: parseBoolEnv(env.SYNC_WORKER_SECRETS),
    onpodConfirm: (env.ONPOD_CONFIRM || "NONE").trim(),
    scopeInfo,
  });

  appendOutput(
    {
      resolved_mode: plan.mode,
      effective_deploy_web: String(plan.effectiveDeployWeb),
      effective_deploy_apex: String(plan.effectiveDeployApex),
      effective_build_api_image: String(plan.effectiveBuildApiImage),
      effective_deploy_api_onpod: String(plan.effectiveDeployApiOnpod),
      effective_sync_api_env_onpod: String(plan.effectiveSyncApiEnvOnpod),
      effective_sync_worker_secrets: String(plan.effectiveSyncWorkerSecrets),
      any_live_deploy: String(plan.anyLiveDeploy),
      smart_noop: String(plan.smartNoop),
      scope_summary: scopeLine,
    },
    env,
  );

  // 호출측 bash 스크립트가 `$ANY_LIVE`로 즉시 받아 `release-required-ci.mjs`에 전달한다.
  process.stdout.write(`${plan.anyLiveDeploy ? "true" : "false"}\n`);
}

export function runWriteStepSummaryCli(env = process.env) {
  const summary = formatReleaseStepSummary({
    mode: (env.RESOLVED_MODE || "custom").trim(),
    releaseSha: (env.RELEASE_SHA || "").trim(),
    webSha: (env.WEB_SHA || "").trim(),
    apiSha: (env.API_SHA || "").trim(),
    apiImageSha: (env.API_IMAGE_SHA || "").trim(),
    workerVersionId: (env.WORKER_VERSION_ID || "").trim(),
    previousWorkerVersionId: (env.PREVIOUS_WORKER_VERSION_ID || "").trim(),
    previousApiImage: (env.PREVIOUS_API_IMAGE || "").trim(),
    smokeStatus: (env.SMOKE_STATUS || "skipped").trim(),
    smartNoop: parseBoolEnv(env.SMART_NOOP),
    notes: env.SCOPE_SUMMARY && env.SCOPE_SUMMARY !== "not-evaluated"
      ? [`변경 범위 분류: \`${env.SCOPE_SUMMARY}\``]
      : [],
  });
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, summary, "utf8");
  } else {
    process.stdout.write(summary);
  }
}
