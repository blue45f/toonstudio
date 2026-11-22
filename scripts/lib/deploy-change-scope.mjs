import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { resolveCommonGitDirectory } from "./local-deploy-ledger.mjs";

const SHA40_PATTERN = /^[0-9a-f]{40}$/u;

const SHARED_ROOT_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);

const API_SHARED_PACKAGES = [
  "packages/contracts/",
  "packages/core/",
  "packages/studio-format-gateway/",
  "packages/studio-project-model/",
];

const WEB_BUILD_AND_DEPLOY_SCRIPTS = new Set([
  "scripts/build-static-catalog.ts",
  "scripts/news-gen.ts",
  "scripts/generate-i18n-builtins.mjs",
  "scripts/generate-third-party-notices.mjs",
  "scripts/verify-static-csp.mjs",
  "scripts/cloudflare-static-rules.mjs",
  "scripts/prepare-cloudflare-static-assets.mts",
  "scripts/sync-cloudflare-r2-assets.mts",
  "scripts/plan-creator-bundle-deploy.mjs",
  "scripts/cloud-deploy-cloudflare.mjs",
  "scripts/verify-static-service-worker.mjs",
  "scripts/lib/static-gen-cache.mjs",
  "scripts/lib/html-text.mjs",
]);

const API_BUILD_AND_DEPLOY_SCRIPTS = new Set([
  "scripts/stage-api-workspace-runtime.mjs",
  "scripts/verify-api-runtime-imports.mjs",
  "scripts/verify-legal-policy-runtime.mjs",
  "scripts/verify-production-release-compatibility.mjs",
  "scripts/cloud-deploy-onpod.mjs",
]);

const WEB_CONFIG_FILES = new Set([
  "postcss.config.mjs",
  "tsconfig.json",
  "config/http-response-headers.json",
  "config/site-original-ost.production.json",
  "config/studio-plasticine-materials-source.json",
]);

function normalizeRepoPath(rawPath) {
  return String(rawPath ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "");
}

function isTestOrDocPath(file) {
  if (/(?:^|\/)__tests__\//u.test(file)) return true;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) return true;
  if (/\.md$/iu.test(file)) return true;
  if (file.startsWith("apps/api/test/")) return true;
  return false;
}

function isMigrationPath(file) {
  if (file.startsWith("apps/api/src/platform/database/migrations/")) return true;
  if (file.startsWith("apps/api/src/platform/database/schema/")) return true;
  if (/^apps\/api\/src\/platform\/database\/[^/]+\.schema\.ts$/u.test(file)) return true;
  if (file === "apps/api/drizzle.config.ts") return true;
  if (file === "config/production-migration-baseline.json") return true;
  if (file.startsWith("supabase/migrations/")) return true;
  return false;
}

/**
 * 변경된 파일 목록을 운영 배포 단위(web·api·apex·migrations)로 결정적 분류한다.
 * 공유 의존성(package.json·pnpm-lock.yaml·공유 workspace 패키지·카탈로그 스냅샷)은
 * fail-safe로 web·api 양쪽에 모두 반영한다.
 *
 * @param {readonly string[]} rawChangedFiles
 */
export function classifyDeployChangedFiles(rawChangedFiles) {
  const changedFiles = [...new Set(rawChangedFiles.map(normalizeRepoPath).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "en"),
  );

  const areas = {
    web: [],
    api: [],
    apex: [],
    migrations: [],
    shared: [],
    nonDeployable: [],
  };

  for (const file of changedFiles) {
    if (isMigrationPath(file)) {
      areas.migrations.push(file);
      if (file.startsWith("apps/api/")) {
        areas.api.push(file);
      }
      continue;
    }

    if (isTestOrDocPath(file)) {
      areas.nonDeployable.push(file);
      continue;
    }

    if (
      SHARED_ROOT_FILES.has(file)
      || file.startsWith("patches/")
      || file.startsWith("apps/api/data/")
      || file.startsWith("config/deployment/")
    ) {
      areas.shared.push(file);
      areas.web.push(file);
      areas.api.push(file);
      continue;
    }

    if (file.startsWith("deploy/cloudflare-apex-redirect/")) {
      areas.apex.push(file);
      continue;
    }

    if (API_SHARED_PACKAGES.some((prefix) => file.startsWith(prefix))) {
      areas.shared.push(file);
      areas.web.push(file);
      areas.api.push(file);
      continue;
    }

    if (
      file.startsWith("apps/web/")
      || file.startsWith("deploy/cloudflare-static/")
      || file.startsWith("packages/")
      || file === "data/related-info.json"
      || file.startsWith("data/asset-releases/")
      || file.startsWith("data/studio-assets/")
      || WEB_CONFIG_FILES.has(file)
      || /^config\/creator-bundle-.*\.json$/u.test(file)
      || /^tsconfig\.toonstudio-.*\.json$/u.test(file)
      || WEB_BUILD_AND_DEPLOY_SCRIPTS.has(file)
    ) {
      areas.web.push(file);
      continue;
    }

    if (
      file.startsWith("apps/api/")
      || file.startsWith("deploy/onpod/")
      || file.startsWith("deploy/trust/")
      || API_BUILD_AND_DEPLOY_SCRIPTS.has(file)
    ) {
      areas.api.push(file);
      continue;
    }

    areas.nonDeployable.push(file);
  }

  return {
    webChanged: areas.web.length > 0,
    apiChanged: areas.api.length > 0,
    apexChanged: areas.apex.length > 0,
    migrationsChanged: areas.migrations.length > 0,
    changedFiles,
    areas,
  };
}

/**
 * 로컬 배포 원장(`.git/toonstudio-deploy-ledger`)에서 targetSha 이전의 가장 최근 배포 SHA를 찾는다.
 */
export function findLatestLedgerDeploySha({ cwd, env = process.env, excludeSha = "" } = {}) {
  const configuredRoot = env.TOONSPECTRUM_DEPLOY_LEDGER_DIR?.trim();
  const ledgerRoot = configuredRoot
    ? path.resolve(cwd, configuredRoot)
    : (() => {
        const commonGitDir = resolveCommonGitDirectory(cwd);
        return commonGitDir ? path.join(commonGitDir, "toonstudio-deploy-ledger") : null;
      })();

  if (!ledgerRoot || !existsSync(ledgerRoot)) return null;

  let latest = null;
  for (const unitEntry of readdirSync(ledgerRoot, { withFileTypes: true })) {
    if (!unitEntry.isDirectory()) continue;
    const unitDir = path.join(ledgerRoot, unitEntry.name);
    for (const fileEntry of readdirSync(unitDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".json")) continue;
      const shaFromName = fileEntry.name.slice(0, -5);
      if (!SHA40_PATTERN.test(shaFromName) || shaFromName === excludeSha) continue;
      const filePath = path.join(unitDir, fileEntry.name);
      let recordedAtMs = statSync(filePath).mtimeMs;
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        const parsedMs = Date.parse(parsed?.recordedAt ?? "");
        if (Number.isFinite(parsedMs)) recordedAtMs = parsedMs;
      } catch {
        // 원장 파일 JSON 파싱 실패 시 mtime 기준 유지
      }
      if (!latest || recordedAtMs > latest.recordedAtMs) {
        latest = { sha: shaFromName, unit: unitEntry.name, recordedAtMs };
      }
    }
  }
  return latest;
}

/**
 * 비교 기준 SHA를 결정한다: 명시 `--base-sha` > 로컬 배포 원장 > 대상 커밋의 직전 부모(`targetSha^1`).
 */
export function resolveDeployBaseSha({
  rootDir,
  targetSha,
  explicitBaseSha = "",
  execEnv = process.env,
  execFileImpl = execFileSync,
} = {}) {
  if (explicitBaseSha) {
    if (!SHA40_PATTERN.test(explicitBaseSha)) {
      throw new Error("[deploy:cloud] `--base-sha`는 소문자 40자리 16진수 커밋 SHA여야 합니다.");
    }
    return { baseSha: explicitBaseSha, source: "explicit-base-sha" };
  }

  const fromLedger = findLatestLedgerDeploySha({
    cwd: rootDir,
    env: execEnv,
    excludeSha: targetSha,
  });
  if (fromLedger) {
    return { baseSha: fromLedger.sha, source: `local-deploy-ledger:${fromLedger.unit}` };
  }

  if (SHA40_PATTERN.test(targetSha ?? "")) {
    try {
      const parent = execFileImpl("git", ["rev-parse", `${targetSha}^1`], {
        cwd: rootDir,
        env: execEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (SHA40_PATTERN.test(parent)) {
        return { baseSha: parent, source: "parent-commit" };
      }
    } catch {
      // 얕은 클론이거나 대상 SHA가 로컬에 없음
    }
  }

  return { baseSha: "", source: "unavailable" };
}

/**
 * 두 SHA 사이의 변경 파일 목록을 조회한다(로컬 git diff 우선, 실패 시 GitHub compare API 폴백).
 */
export function resolveChangedFilesBetweenRefs({
  rootDir,
  baseSha,
  targetSha,
  repoSlug,
  execEnv = process.env,
  execFileImpl = execFileSync,
} = {}) {
  if (!SHA40_PATTERN.test(baseSha ?? "") || !SHA40_PATTERN.test(targetSha ?? "")) {
    return { ok: false, changedFiles: [], source: "invalid-sha" };
  }
  if (baseSha === targetSha) {
    return { ok: true, changedFiles: [], source: "identical-sha" };
  }

  try {
    const out = execFileImpl("git", ["diff", "--name-only", `${baseSha}..${targetSha}`], {
      cwd: rootDir,
      env: execEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    const files = out.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    return { ok: true, changedFiles: files, source: "git-diff" };
  } catch {
    // 얕은 클론·미fetch 커밋이면 GitHub compare API로 폴백
  }

  if (repoSlug) {
    try {
      const out = execFileImpl(
        "gh",
        ["api", `repos/${repoSlug}/compare/${baseSha}...${targetSha}`, "--jq", ".files[].filename"],
        {
          cwd: rootDir,
          env: execEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      const files = out.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
      return { ok: true, changedFiles: files, source: "github-compare" };
    } catch {
      // 원격 비교 실패 → fail-safe 처리
    }
  }

  return { ok: false, changedFiles: [], source: "unavailable" };
}

/**
 * 변경 영역 요약을 바탕으로 최소 비용·최소 범위의 배포 명령을 권고한다.
 */
export function buildRecommendedDeployCommand(scope) {
  const flags = [];
  if (scope.webChanged) flags.push("--web");
  if (scope.apexChanged) flags.push("--apex");
  if (scope.apiChanged) flags.push("--api-image");
  if (flags.length === 0) {
    return null;
  }
  return `pnpm run deploy:cloud -- ${flags.join(" ")} --watch`;
}

/**
 * `--smart` 옵션과 변경 영역 분류를 결합해 실제 실행할 배포 단위와 안전 건너뛰기 계획을 계산한다.
 */
export function planSmartDeploySelection({ requestedOptions, scope, unknownScope = false }) {
  const hasExplicitUnit = Boolean(
    requestedOptions.web
    || requestedOptions.apex
    || requestedOptions.apiImage
    || requestedOptions.apiOnpod
    || requestedOptions.syncApiEnv
    || requestedOptions.syncWorkerSecrets,
  );

  const effectiveOptions = { ...requestedOptions };
  const skippedUnits = [];
  const warnings = [];

  if (unknownScope) {
    if (!hasExplicitUnit) {
      return {
        effectiveOptions,
        selectedUnits: [],
        skippedUnits,
        warnings,
        shouldDispatch: false,
        blockedReason:
          "[deploy:cloud] --smart 대상 변경 범위를 확인하지 못했습니다. `--base-sha <40자리-sha>` 또는 명시 배포 플래그(`--web`, `--api-image` 등)를 지정하세요.",
      };
    }
    warnings.push("변경 범위를 확인하지 못해 안전하게 요청된 모든 배포 단위를 유지합니다.");
    return {
      effectiveOptions,
      selectedUnits: collectEnabledUnitNames(effectiveOptions),
      skippedUnits,
      warnings,
      shouldDispatch: true,
      blockedReason: "",
    };
  }

  if (hasExplicitUnit) {
    if (requestedOptions.web && !scope.webChanged) {
      if (requestedOptions.syncWorkerSecrets) {
        warnings.push("웹 코드 변경은 없으나 `--sync-worker-secrets` 요청으로 `--web` 단위를 유지합니다.");
      } else {
        effectiveOptions.web = false;
        skippedUnits.push({
          unit: "web",
          reason: "웹/정적 번들 관련 변경 없음 (Cloudflare 빌드·R2 Class A 쓰기 절약)",
        });
      }
    }
    if (requestedOptions.apex && !scope.apexChanged) {
      effectiveOptions.apex = false;
      skippedUnits.push({
        unit: "apex",
        reason: "Apex 리다이렉트 Worker 변경 없음",
      });
    }
    if (requestedOptions.apiImage && !scope.apiChanged) {
      effectiveOptions.apiImage = false;
      skippedUnits.push({
        unit: "apiImage",
        reason: "Core API 변경 없음 (GHCR 이미지 빌드·스토리지 절약)",
      });
    }
    if (requestedOptions.apiOnpod && !scope.apiChanged) {
      effectiveOptions.apiOnpod = false;
      skippedUnits.push({
        unit: "apiOnpod",
        reason: "Core API 변경 없음 (서울 onpod 이미지 교체 생략)",
      });
    }
  } else {
    effectiveOptions.web = Boolean(scope.webChanged);
    effectiveOptions.apex = Boolean(scope.apexChanged);
    effectiveOptions.apiImage = Boolean(scope.apiChanged);
    effectiveOptions.apiOnpod = Boolean(scope.apiChanged && requestedOptions.confirmOnpod);

    if (!scope.webChanged) {
      skippedUnits.push({
        unit: "web",
        reason: "웹/정적 번들 관련 변경 없음 (Cloudflare 빌드·R2 Class A 쓰기 절약)",
      });
    }
    if (!scope.apiChanged) {
      skippedUnits.push({
        unit: "api",
        reason: "Core API 변경 없음 (GHCR 이미지 빌드·onpod 교체 생략)",
      });
    } else if (!requestedOptions.confirmOnpod) {
      warnings.push(
        "Core API 변경이 감지되었으나 `--confirm-onpod`가 없어 상시 승인 범위인 GHCR 이미지 빌드(`--api-image`)만 예약합니다. 서울 onpod 반영까지 진행하려면 `--confirm-onpod`를 함께 지정하세요.",
      );
    }
  }

  if (scope.migrationsChanged) {
    warnings.push(
      "DB 스키마/마이그레이션 변경(`migrationsChanged=true`)이 감지되었습니다. `AGENTS.md` 8절에 따라 운영 DB 반영 절차를 별도로 확인하세요.",
    );
  }

  const selectedUnits = collectEnabledUnitNames(effectiveOptions);
  return {
    effectiveOptions,
    selectedUnits,
    skippedUnits,
    warnings,
    shouldDispatch: selectedUnits.length > 0,
    blockedReason: "",
  };
}

function collectEnabledUnitNames(options) {
  const units = [];
  if (options.web) units.push("web");
  if (options.apex) units.push("apex");
  if (options.apiImage) units.push("apiImage");
  if (options.apiOnpod) units.push("apiOnpod");
  if (options.syncApiEnv) units.push("syncApiEnv");
  if (options.syncWorkerSecrets) units.push("syncWorkerSecrets");
  return units;
}

/**
 * `--status`, `deploy:doctor`, `--smart` 출력용 변경 영역 진단 요약 줄 배열을 만든다.
 */
export function formatDeployScopeLines({
  baseSha = "",
  baseShaSource = "unavailable",
  targetSha = "",
  scope = null,
  unknownScope = false,
} = {}) {
  const lines = [];
  if (unknownScope || !scope) {
    lines.push("• 변경 영역 진단: 비교 기준 SHA 또는 git/GitHub diff를 조회하지 못했습니다 (`--base-sha <40자리-sha>` 지정 권장)");
    return lines;
  }

  const rangeLabel = baseSha && targetSha
    ? `${baseSha.slice(0, 12)}..${targetSha.slice(0, 12)} (${baseShaSource})`
    : baseShaSource;
  lines.push(
    `• 변경 영역 진단(${rangeLabel}, 파일 ${scope.changedFiles.length}건): webChanged=${scope.webChanged}, apiChanged=${scope.apiChanged}, apexChanged=${scope.apexChanged}, migrationsChanged=${scope.migrationsChanged}`,
  );

  const recommended = buildRecommendedDeployCommand(scope);
  if (recommended) {
    lines.push(`  권장 최소 배포 명령: ${recommended}`);
    if (scope.apiChanged) {
      lines.push("  (서울 onpod 반영 필요 시 별도 승인 후 `--api-onpod --confirm-onpod` 추가)");
    }
  } else {
    lines.push("  권장 조치: 배포 불필요 — 운영 배포 대상(web·api·apex) 변경 없음 (Actions 분수·R2·GHCR 절약)");
  }

  if (scope.migrationsChanged) {
    lines.push("  ⚠️ DB 마이그레이션/스키마 변경 감지 — 배포 전 운영 DB 적용 계획을 확인하세요.");
  }

  return lines;
}
