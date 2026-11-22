#!/usr/bin/env node
/**
 * 배포 전 드리프트 프리플라이트 검증 유틸리티.
 *
 * 1) scripts/production-database-migrations.manifest 와
 *    apps/api/src/platform/database/migrations/*.sql 간의 누락·미등록·순서 드리프트 검증
 * 2) deploy/STANDING_APPROVAL.json 유효성 및 범위(fail-closed) 검증
 * 3) dist/.vite/build-meta.json 의 gitSha / buildId 일치 검증
 * 4) .env.infrastructure.local 키 존재 여부 점검(실제 값·길이는 절대 노출하지 않고 boolean/마스킹 상태만 반환)
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isPlaceholderCredentialValue, parseDotenvContent } from "./deploy-auth-env.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = resolve(dirname(MODULE_PATH), "../..");

export const SHA40_PATTERN = /^[0-9a-f]{40}$/u;
const BUILD_ID_PATTERN = /^[0-9a-f]{8,}$/u;
const DATE_YYYY_MM_DD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const KEBAB_SCOPE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
const FORBIDDEN_STANDING_SCOPE_PATTERN = /(?:adopt|repair|destructive)/u;
const CANONICAL_MIGRATION_PREFIX = "apps/api/src/platform/database/migrations/";
const CANONICAL_MIGRATION_FILENAME_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/u;
const CANONICAL_MIGRATION_PATH_PATTERN =
  /^apps\/api\/src\/platform\/database\/migrations\/(\d{4})_[a-z0-9_]+\.sql$/u;

export const REQUIRED_VERIFIED_DIST_FILES = Object.freeze([
  "dist/index.html",
  "dist/.assetsignore",
  "dist/sw.js",
  "dist/.vite/manifest.json",
  "dist/.vite/build-meta.json",
  "dist/legal/THIRD_PARTY_NOTICES.generated.md",
]);

/** 운영 배포에 필요한 .env.infrastructure.local 핵심 키 목록(이름만 유지, 값 보관 금지). */
export const DEFAULT_REQUIRED_INFRA_KEYS = Object.freeze([
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "ONPOD_DEPLOY_TOKEN",
  "ONPOD_API_ENV_AUTH_SESSION_SECRET",
  "ONPOD_API_ENV_AUTH_STATE_SECRET",
  "ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET",
  "ONPOD_API_ENV_STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET",
  "ONPOD_API_ENV_TRAFFIC_ANALYTICS_D1_RPC_TOKEN",
]);

/** 운영·장애 복구 시 함께 보관하는 선택 키 목록(이름만 유지, 값 보관 금지). */
export const DEFAULT_OPTIONAL_INFRA_KEYS = Object.freeze([
  "ONPOD_TOKEN",
  "ONPOD_DB_SLUG",
  "ONPOD_DATABASE_URL",
  "ONPOD_DATABASE_URL_PUBLIC",
  "CORE_ORIGIN_SECRET",
  "VITE_KAKAO_JAVASCRIPT_KEY",
  "ONPOD_API_ENV_PERSONAL_CLOUD_OAUTH_STATE_SECRET",
  "ONPOD_API_ENV_PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY",
]);

const asciiCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function isValidCalendarDate(raw) {
  if (typeof raw !== "string") return false;
  const match = DATE_YYYY_MM_DD_PATTERN.exec(raw);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function migrationDriftResult(overrides = {}) {
  return {
    ok: false,
    manifestCount: 0,
    diskCount: 0,
    missingFiles: [],
    unregisteredFiles: [],
    nonCanonicalFiles: [],
    invalidEntries: [],
    duplicateEntries: [],
    orderMismatches: [],
    sequenceGaps: [],
    issues: [],
    ...overrides,
  };
}

/**
 * scripts/production-database-migrations.manifest 와
 * apps/api/src/platform/database/migrations/*.sql 간의 누락·미등록·순서·연속성 드리프트를 점검한다.
 */
export function checkMigrationManifestDrift({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  manifestPath = join(rootDir, "scripts/production-database-migrations.manifest"),
  migrationDir = join(rootDir, "apps/api/src/platform/database/migrations"),
} = {}) {
  if (!existsSync(manifestPath)) {
    return migrationDriftResult({
      issues: ["migration manifest 파일이 없습니다: scripts/production-database-migrations.manifest"],
    });
  }
  if (!existsSync(migrationDir)) {
    return migrationDriftResult({
      issues: ["migration 디렉터리가 없습니다: apps/api/src/platform/database/migrations"],
    });
  }

  const issues = [];
  const manifestEntries = readFileSync(manifestPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (manifestEntries.length === 0) issues.push("migration manifest가 비어 있습니다.");

  const resolvedMigrationDir = resolve(migrationDir);
  const seenEntries = new Set();
  const duplicateSet = new Set();
  const invalidEntries = [];
  const validUniqueEntries = [];

  for (const entry of manifestEntries) {
    if (
      !CANONICAL_MIGRATION_PATH_PATTERN.test(entry)
      || !resolve(rootDir, entry).startsWith(`${resolvedMigrationDir}/`)
    ) {
      invalidEntries.push(entry);
    } else if (seenEntries.has(entry)) {
      duplicateSet.add(entry);
    } else {
      seenEntries.add(entry);
      validUniqueEntries.push(entry);
    }
  }
  const duplicateEntries = [...duplicateSet].sort(asciiCompare);

  const nonCanonicalFiles = [];
  const diskCanonicalEntries = [];
  const diskSqlNames = readdirSync(migrationDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".sql"))
    .map((dirent) => dirent.name)
    .sort(asciiCompare);

  for (const fileName of diskSqlNames) {
    const relative = `${CANONICAL_MIGRATION_PREFIX}${fileName}`;
    if (CANONICAL_MIGRATION_FILENAME_PATTERN.test(fileName)) diskCanonicalEntries.push(relative);
    else nonCanonicalFiles.push(relative);
  }

  const diskSet = new Set(diskCanonicalEntries);
  const manifestSet = new Set(validUniqueEntries);
  const missingFiles = validUniqueEntries.filter((entry) => !diskSet.has(entry)).sort(asciiCompare);
  const unregisteredFiles = diskCanonicalEntries.filter((entry) => !manifestSet.has(entry)).sort(asciiCompare);

  const sortedValid = [...validUniqueEntries].sort(asciiCompare);
  const orderMismatches = [];
  const sequenceGaps = [];
  validUniqueEntries.forEach((entry, index) => {
    if (entry !== sortedValid[index]) {
      orderMismatches.push({ index, expected: sortedValid[index], actual: entry });
    }
    const match = CANONICAL_MIGRATION_PATH_PATTERN.exec(entry);
    const actualSequence = match ? Number(match[1]) : null;
    if (actualSequence !== index + 1) {
      sequenceGaps.push({ index, expectedSequence: index + 1, actualSequence, entry });
    }
  });

  if (invalidEntries.length) issues.push(`형식 또는 경로 규칙을 위반한 manifest 항목 ${invalidEntries.length}건: ${invalidEntries.join(", ")}`);
  if (duplicateEntries.length) issues.push(`중복 등록된 manifest 항목 ${duplicateEntries.length}건: ${duplicateEntries.join(", ")}`);
  if (nonCanonicalFiles.length) issues.push(`네이밍 규칙(NNNN_name.sql)을 위반한 SQL 파일 ${nonCanonicalFiles.length}건: ${nonCanonicalFiles.join(", ")}`);
  if (missingFiles.length) issues.push(`manifest에 등록됐지만 디스크에 누락된 SQL 파일 ${missingFiles.length}건: ${missingFiles.join(", ")}`);
  if (unregisteredFiles.length) issues.push(`디스크에 존재하지만 manifest에 미등록된 SQL 파일 ${unregisteredFiles.length}건: ${unregisteredFiles.join(", ")}`);
  if (orderMismatches.length) {
    const first = orderMismatches[0];
    issues.push(`manifest 정렬 순서 드리프트 ${orderMismatches.length}건 (첫 불일치 #${first.index + 1}: 기대 ${first.expected}, 실제 ${first.actual})`);
  }
  if (sequenceGaps.length) {
    const first = sequenceGaps[0];
    issues.push(
      `migration 번호 연속성 드리프트 ${sequenceGaps.length}건 (첫 불일치 #${first.index + 1}: 기대 ${String(first.expectedSequence).padStart(4, "0")}, 실제 ${first.actualSequence === null ? "미확인" : String(first.actualSequence).padStart(4, "0")})`,
    );
  }

  return migrationDriftResult({
    ok: issues.length === 0,
    manifestCount: manifestEntries.length,
    diskCount: diskCanonicalEntries.length,
    missingFiles,
    unregisteredFiles,
    nonCanonicalFiles,
    invalidEntries,
    duplicateEntries,
    orderMismatches,
    sequenceGaps,
    issues,
  });
}

function standingApprovalResult(overrides = {}) {
  return {
    ok: false,
    mode: "explicit-approval-required",
    grantedAt: null,
    grantedBy: null,
    scopes: [],
    scopeAuthorized: null,
    staticApprovalValid: null,
    issues: [],
    ...overrides,
  };
}

/**
 * deploy/STANDING_APPROVAL.json(및 필요 시 deploy/cloudflare-static/STANDING_APPROVAL.json)의
 * 구조·보안 경계·요청 scope 포함 여부를 fail-closed로 검증한다.
 */
export function validateStandingApproval({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  approvalPath = join(rootDir, "deploy/STANDING_APPROVAL.json"),
  staticApprovalPath = join(rootDir, "deploy/cloudflare-static/STANDING_APPROVAL.json"),
  requiredScope = null,
  checkStaticApproval = true,
} = {}) {
  const scopeFallback = requiredScope ? false : null;
  if (!existsSync(approvalPath)) {
    return standingApprovalResult({
      scopeAuthorized: scopeFallback,
      issues: ["deploy/STANDING_APPROVAL.json이 없어 상시 승인을 적용할 수 없습니다(명시 승인 방식으로 fail-closed 복귀)."],
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(approvalPath, "utf8"));
  } catch {
    return standingApprovalResult({
      scopeAuthorized: scopeFallback,
      issues: ["deploy/STANDING_APPROVAL.json이 올바른 JSON 형식이 아닙니다(명시 승인 방식으로 fail-closed 복귀)."],
    });
  }
  if (!isPlainObject(parsed)) {
    return standingApprovalResult({
      scopeAuthorized: scopeFallback,
      issues: ["deploy/STANDING_APPROVAL.json 최상위 구조는 JSON 객체여야 합니다."],
    });
  }

  const issues = [];
  const grantedAt = typeof parsed.grantedAt === "string" ? parsed.grantedAt.trim() : null;
  const grantedBy = typeof parsed.grantedBy === "string" ? parsed.grantedBy.trim() : null;
  const note = typeof parsed.note === "string" ? parsed.note.trim() : "";

  if (!isValidCalendarDate(grantedAt)) issues.push("STANDING_APPROVAL.json의 grantedAt은 유효한 YYYY-MM-DD 날짜여야 합니다.");
  if (!grantedBy) issues.push("STANDING_APPROVAL.json의 grantedBy가 비어 있습니다.");
  if (note.length < 20) issues.push("STANDING_APPROVAL.json의 note는 20자 이상의 근거 설명이 필요합니다.");

  const scopes = [];
  if (!Array.isArray(parsed.scopes) || parsed.scopes.length === 0) {
    issues.push("STANDING_APPROVAL.json의 scopes는 비어 있지 않은 배열이어야 합니다.");
  } else {
    const seen = new Set();
    for (const scope of parsed.scopes) {
      if (typeof scope !== "string" || !KEBAB_SCOPE_PATTERN.test(scope)) {
        issues.push(`STANDING_APPROVAL.json에 유효하지 않은 scope 형식이 있습니다: ${String(scope)}`);
      } else if (seen.has(scope)) {
        issues.push(`STANDING_APPROVAL.json에 중복 scope가 있습니다: ${scope}`);
      } else if (scope === "production-database-migrations" || FORBIDDEN_STANDING_SCOPE_PATTERN.test(scope)) {
        issues.push(`파괴적 또는 금지된 scope(${scope})는 상시 승인 범위에 포함할 수 없습니다.`);
      } else {
        seen.add(scope);
        scopes.push(scope);
      }
    }
  }

  let staticApprovalValid = null;
  if (checkStaticApproval && (existsSync(staticApprovalPath) || requiredScope === "cloudflare-static-production")) {
    if (!existsSync(staticApprovalPath)) {
      staticApprovalValid = false;
      issues.push("deploy/cloudflare-static/STANDING_APPROVAL.json이 없어 정적 웹 상시 승인을 확인할 수 없습니다.");
    } else {
      try {
        const staticParsed = JSON.parse(readFileSync(staticApprovalPath, "utf8"));
        const staticIssues = [];
        if (!isPlainObject(staticParsed)) {
          staticIssues.push("정적 웹 상시 승인 파일 최상위 구조가 JSON 객체가 아닙니다.");
        } else {
          if (staticParsed.scope !== "cloudflare-static-production") staticIssues.push("정적 웹 상시 승인 파일의 scope가 cloudflare-static-production이 아닙니다.");
          if (!isValidCalendarDate(staticParsed.grantedAt)) staticIssues.push("정적 웹 상시 승인 파일의 grantedAt이 유효한 YYYY-MM-DD 날짜가 아닙니다.");
          if (typeof staticParsed.grantedBy !== "string" || !staticParsed.grantedBy.trim()) staticIssues.push("정적 웹 상시 승인 파일의 grantedBy가 비어 있습니다.");
          if (typeof staticParsed.scope === "string" && !scopes.includes(staticParsed.scope)) {
            staticIssues.push("정적 웹 상시 승인 scope가 루트 deploy/STANDING_APPROVAL.json의 scopes에 없습니다.");
          }
        }
        staticApprovalValid = staticIssues.length === 0;
        issues.push(...staticIssues);
      } catch {
        staticApprovalValid = false;
        issues.push("deploy/cloudflare-static/STANDING_APPROVAL.json이 올바른 JSON 형식이 아닙니다.");
      }
    }
  }

  let scopeAuthorized = null;
  if (requiredScope !== null && requiredScope !== undefined) {
    scopeAuthorized = typeof requiredScope === "string" && requiredScope.trim() !== "" && scopes.includes(requiredScope);
    if (!scopeAuthorized) {
      issues.push(
        `요청한 배포 단위(${String(requiredScope)})는 상시 승인 범위 밖입니다. 별도의 명시적 사용자 승인이 필요합니다.`,
      );
    }
  }

  const ok = issues.length === 0;
  return standingApprovalResult({
    ok,
    mode: ok ? "standing-approval" : "explicit-approval-required",
    grantedAt,
    grantedBy,
    scopes,
    scopeAuthorized,
    staticApprovalValid,
    issues,
  });
}

/**
 * dist/.vite/build-meta.json 의 gitSha·buildId·카탈로그 소스 및 필수 배포 산출물 존재 여부를 검증한다.
 */
export function validateBuildMetaSha({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  buildMetaPath = join(rootDir, "dist/.vite/build-meta.json"),
  expectedSha,
  expectedCatalogSource = null,
  requireDistArtifacts = false,
} = {}) {
  const issues = [];
  const missingArtifacts = requireDistArtifacts
    ? REQUIRED_VERIFIED_DIST_FILES.filter((rel) => !existsSync(join(rootDir, rel)))
    : [];

  if (!SHA40_PATTERN.test(expectedSha ?? "")) {
    issues.push("기준 expectedSha는 소문자 40자리 16진수 Git SHA여야 합니다.");
  }
  if (missingArtifacts.length > 0) {
    issues.push(`필수 빌드 산출물이 누락되었습니다: ${missingArtifacts.join(", ")}`);
  }
  if (!existsSync(buildMetaPath)) {
    issues.push("dist/.vite/build-meta.json 파일이 없습니다. 배포 대상 SHA로 웹 빌드를 먼저 실행하세요.");
    return { ok: false, expectedSha: expectedSha ?? null, actualSha: null, buildId: null, catalogSource: null, missingArtifacts, issues };
  }

  let meta;
  try {
    meta = JSON.parse(readFileSync(buildMetaPath, "utf8"));
  } catch {
    issues.push("dist/.vite/build-meta.json이 올바른 JSON 형식이 아닙니다. dist/를 다시 빌드하세요.");
    return { ok: false, expectedSha: expectedSha ?? null, actualSha: null, buildId: null, catalogSource: null, missingArtifacts, issues };
  }
  if (!isPlainObject(meta)) {
    issues.push("dist/.vite/build-meta.json 최상위 구조는 JSON 객체여야 합니다.");
    return { ok: false, expectedSha: expectedSha ?? null, actualSha: null, buildId: null, catalogSource: null, missingArtifacts, issues };
  }

  const actualSha = typeof meta.gitSha === "string" ? meta.gitSha.trim() : null;
  const buildId = typeof meta.buildId === "string" ? meta.buildId.trim() : null;
  const catalogSource = typeof meta.catalogSource === "string" ? meta.catalogSource.trim() : null;

  if (!SHA40_PATTERN.test(actualSha ?? "")) {
    issues.push("dist/.vite/build-meta.json의 gitSha가 유효한 40자리 소문자 SHA가 아닙니다.");
  } else if (SHA40_PATTERN.test(expectedSha ?? "") && actualSha !== expectedSha) {
    issues.push(`dist/.vite/build-meta.json의 gitSha(${actualSha})가 승인 대상 SHA(${expectedSha})와 일치하지 않습니다.`);
  }
  if (!BUILD_ID_PATTERN.test(buildId ?? "")) {
    issues.push("dist/.vite/build-meta.json의 buildId가 유효한 8자리 이상 16진수 문자열이 아닙니다.");
  }
  if (expectedCatalogSource !== null && expectedCatalogSource !== undefined) {
    if (catalogSource !== null && catalogSource !== expectedCatalogSource) {
      issues.push(`dist/.vite/build-meta.json의 catalogSource(${catalogSource})가 기대값(${expectedCatalogSource})과 다릅니다.`);
    } else if (catalogSource === null && expectedCatalogSource !== "static") {
      issues.push(`dist/.vite/build-meta.json에 catalogSource가 기록되지 않아 ${expectedCatalogSource} 모드를 보증할 수 없습니다.`);
    }
  }

  return { ok: issues.length === 0, expectedSha: expectedSha ?? null, actualSha, buildId, catalogSource, missingArtifacts, issues };
}

/**
 * .env.infrastructure.local 파일의 키 존재 여부만 점검한다.
 * 실제 비밀값·부분 문자열·길이·해시는 결과 객체와 로그 어디에도 포함하지 않는다.
 */
export function inspectInfrastructureEnvPresence({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  envPath = join(rootDir, ".env.infrastructure.local"),
  requiredKeys = DEFAULT_REQUIRED_INFRA_KEYS,
  optionalKeys = DEFAULT_OPTIONAL_INFRA_KEYS,
} = {}) {
  const issues = [];
  const warnings = [];
  const requiredSet = new Set(requiredKeys);
  const orderedKeys = [...new Set([...requiredKeys, ...optionalKeys])];

  if (!existsSync(envPath)) {
    return {
      ok: false,
      fileExists: false,
      envFile: ".env.infrastructure.local",
      permissionsSafe: null,
      totalKeyCount: 0,
      onpodApiEnvKeyCount: 0,
      keys: orderedKeys.map((key) => ({ key, required: requiredSet.has(key), present: false, maskedState: "missing", maskedValue: null })),
      missingRequiredKeys: [...requiredSet],
      placeholderRequiredKeys: [],
      issues: [".env.infrastructure.local 파일이 없습니다(로컬 시크릿 저장소 미구성)."],
      warnings,
    };
  }

  let permissionsSafe = null;
  if (process.platform !== "win32") {
    try {
      permissionsSafe = ((statSync(envPath).mode & 0o777) & 0o077) === 0;
      if (!permissionsSafe) {
        warnings.push(".env.infrastructure.local 파일 권한이 너무 넓습니다. `chmod 600 .env.infrastructure.local`로 소유자 전용 권한을 설정하세요.");
      }
    } catch {
      permissionsSafe = null;
    }
  }

  const parsedMap = parseDotenvContent(readFileSync(envPath, "utf8"));
  const allParsedKeys = Object.keys(parsedMap);
  const onpodApiEnvKeyCount = allParsedKeys.filter(
    (key) => /^ONPOD_API_ENV_[A-Z0-9_]+$/u.test(key) && !isPlaceholderCredentialValue(parsedMap[key]),
  ).length;

  const missingRequiredKeys = [];
  const placeholderRequiredKeys = [];
  const keys = orderedKeys.map((key) => {
    const required = requiredSet.has(key);
    if (!Object.hasOwn(parsedMap, key)) {
      if (required) missingRequiredKeys.push(key);
      return { key, required, present: false, maskedState: "missing", maskedValue: null };
    }
    if (isPlaceholderCredentialValue(parsedMap[key])) {
      if (required) placeholderRequiredKeys.push(key);
      return { key, required, present: false, maskedState: "placeholder", maskedValue: "<masked>" };
    }
    return { key, required, present: true, maskedState: "present", maskedValue: "<masked>" };
  });

  if (missingRequiredKeys.length) issues.push(`필수 인프라 키 누락 (${missingRequiredKeys.length}건): ${missingRequiredKeys.join(", ")}`);
  if (placeholderRequiredKeys.length) issues.push(`필수 인프라 키가 비어 있거나 자리표시자 값입니다 (${placeholderRequiredKeys.length}건): ${placeholderRequiredKeys.join(", ")}`);

  return {
    ok: issues.length === 0,
    fileExists: true,
    envFile: ".env.infrastructure.local",
    permissionsSafe,
    totalKeyCount: allParsedKeys.length,
    onpodApiEnvKeyCount,
    keys,
    missingRequiredKeys,
    placeholderRequiredKeys,
    issues,
    warnings,
  };
}

/** 배포 전 드리프트 항목과 .env.infrastructure.local 키 존재 여부를 통합 점검한다. */
export function runDeployPreflightDriftChecks({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  expectedSha = null,
  requiredScope = null,
  expectedCatalogSource = null,
  requireBuildMeta = false,
  requireDistArtifacts = false,
  requireInfraEnv = false,
  requiredInfraKeys = DEFAULT_REQUIRED_INFRA_KEYS,
  optionalInfraKeys = DEFAULT_OPTIONAL_INFRA_KEYS,
} = {}) {
  const migrationManifest = checkMigrationManifestDrift({ rootDir });
  const standingApproval = validateStandingApproval({ rootDir, requiredScope });
  const shouldCheckBuildMeta = Boolean(expectedSha) || requireBuildMeta;
  const buildMeta = shouldCheckBuildMeta
    ? validateBuildMetaSha({ rootDir, expectedSha, expectedCatalogSource, requireDistArtifacts })
    : { skipped: true, ok: true, expectedSha: null, actualSha: null, buildId: null, catalogSource: null, missingArtifacts: [], issues: [] };
  const infrastructureEnv = inspectInfrastructureEnvPresence({ rootDir, requiredKeys: requiredInfraKeys, optionalKeys: optionalInfraKeys });

  const blockingIssues = [
    ...migrationManifest.issues,
    ...standingApproval.issues,
    ...(shouldCheckBuildMeta ? buildMeta.issues : []),
    ...(requireInfraEnv ? infrastructureEnv.issues : []),
  ];

  return { ok: blockingIssues.length === 0, migrationManifest, standingApproval, buildMeta, infrastructureEnv, blockingIssues };
}

/** 비밀값을 절대 포함하지 않는 한글 프리플라이트 점검 요약 문자열을 생성한다. */
export function formatDeployPreflightDriftReport(report) {
  const lines = [
    `[deploy-preflight-drift] 종합 판정: ${report.ok ? "통과" : "차단"}`,
    `- DB migration manifest: ${report.migrationManifest.ok ? "통과" : "실패"} (manifest ${report.migrationManifest.manifestCount}건 / 디스크 ${report.migrationManifest.diskCount}건)`,
    `- 상시 승인(STANDING_APPROVAL): ${report.standingApproval.ok ? "통과" : "실패"} (모드=${report.standingApproval.mode}, scopes=${report.standingApproval.scopes.length}건)`,
    report.buildMeta.skipped
      ? "- 빌드 메타(dist/.vite/build-meta.json): 건너뜀 (--sha 미지정)"
      : `- 빌드 메타(dist/.vite/build-meta.json): ${report.buildMeta.ok ? "통과" : "실패"} (actual=${report.buildMeta.actualSha ?? "없음"})`,
    `- 인프라 env(.env.infrastructure.local): ${report.infrastructureEnv.fileExists ? (report.infrastructureEnv.ok ? "필수 키 충족(값 마스킹)" : "필수 키 누락(값 마스킹)") : "파일 없음"} (총 ${report.infrastructureEnv.totalKeyCount}키, ONPOD_API_ENV_* ${report.infrastructureEnv.onpodApiEnvKeyCount}키)`,
  ];

  if (report.infrastructureEnv.keys.length > 0) {
    lines.push("  키 존재 상태(실제 값 미출력):");
    for (const entry of report.infrastructureEnv.keys) {
      const state = entry.present ? "존재(<masked>)" : entry.maskedState === "placeholder" ? "자리표시자(<masked>)" : "누락";
      lines.push(`    - [${entry.required ? "필수" : "선택"}] ${entry.key}: ${state}`);
    }
  }
  if (report.infrastructureEnv.warnings.length > 0) {
    lines.push("경고:", ...report.infrastructureEnv.warnings.map((warning) => `  - ${warning}`));
  }
  if (report.blockingIssues.length > 0) {
    lines.push("차단 사유:", ...report.blockingIssues.map((issue) => `  - ${issue}`));
  }
  return lines.join("\n");
}

function parseCliArgs(argv) {
  const options = {
    rootDir: DEFAULT_REPOSITORY_ROOT,
    expectedSha: null,
    requiredScope: null,
    requireBuildMeta: false,
    requireDistArtifacts: false,
    requireInfraEnv: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--require-build-meta") options.requireBuildMeta = true;
    else if (arg === "--require-dist-artifacts") options.requireDistArtifacts = true;
    else if (arg === "--require-infra-env") options.requireInfraEnv = true;
    else if (arg === "--sha" || arg.startsWith("--sha=")) {
      const value = arg.includes("=") ? arg.slice("--sha=".length) : argv[++index];
      if (!value) throw new Error("--sha 옵션에는 40자리 소문자 SHA 값이 필요합니다.");
      options.expectedSha = value.trim();
    } else if (arg === "--scope" || arg.startsWith("--scope=")) {
      const value = arg.includes("=") ? arg.slice("--scope=".length) : argv[++index];
      if (!value) throw new Error("--scope 옵션에는 상시 승인 scope 이름이 필요합니다.");
      options.requiredScope = value.trim();
    } else if (arg === "--root" || arg.startsWith("--root=")) {
      const value = arg.includes("=") ? arg.slice("--root=".length) : argv[++index];
      if (!value) throw new Error("--root 옵션에는 디렉터리 경로가 필요합니다.");
      options.rootDir = resolve(value);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(
        "사용법: node scripts/lib/deploy-preflight-drift.mjs [--sha <40자리-sha>] [--scope <scope>] [--require-build-meta] [--require-dist-artifacts] [--require-infra-env] [--root <dir>] [--json]",
      );
    } else {
      const report = runDeployPreflightDriftChecks(options);
      console.log(options.json ? JSON.stringify(report, null, 2) : formatDeployPreflightDriftReport(report));
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[deploy-preflight-drift] 입력 오류: ${error instanceof Error ? error.message : "실행 실패"}`);
    process.exitCode = 2;
  }
}
