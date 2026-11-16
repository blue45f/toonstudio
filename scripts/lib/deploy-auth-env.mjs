import { createHash } from "node:crypto";
import { chmodSync as fsChmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const GITHUB_REPO_SLUG = "blue45f/toonstudio";
export const GITHUB_DEPLOY_ENVIRONMENT = "production-deploy";
export const ONPOD_CANONICAL_APP = "toonstudio-api";
export const ONPOD_CANONICAL_ORIGIN = "https://toonstudio-api.onpod.ai";

/**
 * docs/operations/infrastructure-map.md 6.3절의 고정 비비밀 런타임 기본값.
 * DATABASE_URL은 onpod가 내부 호스트로 직접 관리하므로 절대 포함하지 않는다.
 */
export const ONPOD_BASE_NONSECRET_ENV = Object.freeze({
  PORT: "3000",
  NODE_ENV: "production",
  API_RUNTIME_ROLE: "full",
  NEST_API_HOST: "0.0.0.0",
  TZ: "Asia/Seoul",
  CATALOG_INGEST_MODE: "off",
  API_CORS_ALLOWED_ORIGINS: "https://www.toonstudio.cloud,https://toonstudio.cloud",
  CANONICAL_HOST: "www.toonstudio.cloud",
  WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
  OAUTH_REDIRECT_BASE_URL: "https://www.toonstudio.cloud",
  AUTH_TRUSTED_PROXY_ENABLED: "false",
  AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
  AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "2",
  AUTH_RATE_LIMIT_MODE: "single-instance-local",
  STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
  STUDIO_LIVE_VOICE_ENABLED: "false",
});

/** onpod-current 프로필에서 기대하는 핵심 설정(드리프트 방지). */
const EXPECTED_ONPOD_PROFILE = Object.freeze({
  NODE_ENV: "production",
  DATABASE_RUNTIME_ROLE_MODE: "single-owner",
  AUTH_RATE_LIMIT_MODE: "single-instance-local",
  AUTH_EDGE_CLIENT_IP_ENABLED: "true",
  STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
  TRAFFIC_ANALYTICS_STORE: "d1",
});

/** 32바이트 이상이어야 하는 핵심 런타임 환경변수 항목명 목록(실제 비밀값이 아닌 공개 식별자 목록). */
const REQUIRED_32BYTE_ENV_VAR_NAMES = Object.freeze([
  "AUTH_SESSION_SECRET",
  "AUTH_STATE_SECRET",
  "CLOUDFLARE_EDGE_ORIGIN_SECRET",
  "STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET",
  "TRAFFIC_ANALYTICS_D1_RPC_TOKEN",
]);

/** 절대 ONPOD_API_ENV_JSON 이나 공개 웹 빌드로 내보내면 안 되는 키. */
const FORBIDDEN_API_SYNC_KEYS = new Set([
  "DATABASE_URL",
  "ONPOD_DATABASE_URL",
  "ONPOD_DATABASE_URL_PUBLIC",
  "PRODUCTION_DATABASE_DIRECT_URL",
  "NEON_DATABASE_URL",
]);

/** 공개 빌드 변수로 동기화 가능한 안전한 VITE_* 허용 목록. */
export const ALLOWED_PUBLIC_BUILD_VARS = Object.freeze([
  "VITE_CATALOG_SOURCE",
  "VITE_STUDIO_LIVE_ORIGIN",
  "VITE_STUDIO_REALTIME_ORIGIN",
  "VITE_STUDIO_REALTIME_PROVIDER_ID",
  "VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH",
]);

export function isPlaceholderCredentialValue(value) {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^(?:<[^>]+>|your[-_].+|change[-_]?me.*|placeholder.*|todo|tbd|none|null|undefined|example.*)$/iu.test(trimmed)) {
    return true;
  }
  return /(?:change\.me|placeholder|insecure|dev\.only)/iu.test(trimmed);
}

export function secretFingerprint(value) {
  if (typeof value !== "string" || !value) return "empty";
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

export function redactSensitiveText(text) {
  if (typeof text !== "string" || !text) return "";
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+@/giu, "$1<masked>@")
    .replace(/\b(opk?_[A-Za-z0-9_]{4})[A-Za-z0-9_-]+/gu, "$1<masked>")
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{4})[A-Za-z0-9_]+/gu, "$1<masked>")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu, "$1<masked>")
    .replace(/\b1\/\/[A-Za-z0-9_-]{16,}/gu, "1//<masked>");
}

export function parseDotenvContent(source) {
  const values = Object.create(null);
  if (typeof source !== "string") return values;
  for (const rawLine of source.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eqIdx = withoutExport.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = withoutExport.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    let rawVal = withoutExport.slice(eqIdx + 1).trim();
    if (rawVal.startsWith('"') && rawVal.endsWith('"') && rawVal.length >= 2) {
      try {
        rawVal = JSON.parse(rawVal);
      } catch {
        rawVal = rawVal.slice(1, -1);
      }
    } else if (rawVal.startsWith("'") && rawVal.endsWith("'") && rawVal.length >= 2) {
      rawVal = rawVal.slice(1, -1);
    }
    values[key] = String(rawVal);
  }
  return values;
}

function readOptionalEnvFile(filePath) {
  if (!existsSync(filePath)) return { exists: false, values: Object.create(null) };
  return {
    exists: true,
    values: parseDotenvContent(readFileSync(filePath, "utf8")),
  };
}

export function loadLocalEnvMaps(rootDir) {
  const infraPath = join(rootDir, ".env.infrastructure.local");
  const prodLocalPath = join(rootDir, ".env.production.local");
  const prodTrackedPath = join(rootDir, ".env.production");
  return {
    infraPath,
    prodLocalPath,
    prodTrackedPath,
    infra: readOptionalEnvFile(infraPath),
    prodLocal: readOptionalEnvFile(prodLocalPath),
    prodTracked: readOptionalEnvFile(prodTrackedPath),
  };
}

function formatEnvValue(value) {
  if (!value) return "";
  if (/[\s#"']/u.test(value)) return JSON.stringify(value);
  return value;
}

/**
 * 기존 주석·순서·무관한 키를 보존하면서 지정된 키만 안전하게 갱신하고 권한 0600을 강제한다.
 */
export function upsertEnvFileEntries(envFilePath, entries) {
  const existingLines = existsSync(envFilePath)
    ? readFileSync(envFilePath, "utf8").split(/\r?\n/u)
    : [
        "# ToonStudio 로컬 전용 인프라·배포 시크릿 저장소 (.env.infrastructure.local)",
        "# Git 추적 제외(.gitignore) · 권한 0600 필수 · 값 출력 금지(AGENTS.md 9절)",
        "",
      ];

  const remainingKeys = new Set(Object.keys(entries));
  const updatedLines = existingLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) return line;
    const key = normalized.slice(0, eqIndex).trim();
    if (!Object.hasOwn(entries, key)) return line;
    remainingKeys.delete(key);
    return `${key}=${formatEnvValue(String(entries[key] ?? ""))}`;
  });

  for (const key of remainingKeys) {
    updatedLines.push(`${key}=${formatEnvValue(String(entries[key] ?? ""))}`);
  }

  const output = `${updatedLines.join("\n").replace(/\n+$/u, "")}\n`;
  writeFileSync(envFilePath, output, { encoding: "utf8", mode: 0o600 });
  try {
    fsChmodSync(envFilePath, 0o600);
  } catch {
    // 제한된 파일시스템에서는 writeFileSync mode로 충분하다.
  }
}

function validHttpsOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return false;
    if (["onrender.com", "vercel.app", "neon.tech"].some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    )) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isValidSecret32(value) {
  return (
    typeof value === "string"
    && value === value.trim()
    && Buffer.byteLength(value, "utf8") >= 32
    && !isPlaceholderCredentialValue(value)
  );
}

export function validateOnpodApiEnvMap(apiEnvMap) {
  const errors = [];
  if (!apiEnvMap || typeof apiEnvMap !== "object" || Array.isArray(apiEnvMap)) {
    return ["ONPOD_API_ENV_JSON 최상위 구조는 객체여야 합니다."];
  }
  const entries = Object.entries(apiEnvMap);
  if (entries.length === 0) {
    return ["ONPOD_API_ENV_JSON 항목이 비어 있습니다."];
  }
  for (const [key, value] of entries) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) {
      errors.push(`유효하지 않은 환경변수 이름: ${key}`);
      continue;
    }
    if (FORBIDDEN_API_SYNC_KEYS.has(key)) {
      errors.push(`DB 연결 문자열(${key})은 클라우드 환경변수 동기화 대상에 포함할 수 없습니다.`);
      continue;
    }
    if (/^(?:RENDER_|NEON_)/u.test(key)) {
      errors.push(`퇴역 공급자 키(${key})는 동기화 대상에 포함할 수 없습니다.`);
      continue;
    }
    if (typeof value !== "string" || value.includes("\0") || value.includes("\n") || value.includes("\r")) {
      errors.push(`단일 행 문자열이어야 하는 환경변수 형식 오류: ${key}`);
    }
  }
  for (const [key, expected] of Object.entries(EXPECTED_ONPOD_PROFILE)) {
    if (apiEnvMap[key] !== expected) {
      errors.push(`onpod-current 프로필 설정 불일치: ${key} (기대값: ${expected})`);
    }
  }
  for (const envVarName of REQUIRED_32BYTE_ENV_VAR_NAMES) {
    if (!isValidSecret32(apiEnvMap[envVarName])) {
      errors.push(`필수 32바이트 시크릿 누락 또는 형식 불충족: ${envVarName}`);
    }
  }
  if (
    apiEnvMap.STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET
    && apiEnvMap.STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET === apiEnvMap.STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET
  ) {
    errors.push("실시간 티켓 시크릿과 제어 시크릿은 서로 달라야 합니다.");
  }
  return errors;
}

/**
 * 로컬 .env 파일들로부터 GitHub Actions `production-deploy` Environment에 주입할
 * 비비밀 변수(Variables)와 비밀값(Secrets) 계획을 조립·검증한다.
 */
export function buildGitHubDeploySyncPlan(rootDir, { extraSecrets = {} } = {}) {
  const loaded = loadLocalEnvMaps(rootDir);
  const infra = loaded.infra.values;
  const prodLocal = loaded.prodLocal.values;
  const prodTracked = loaded.prodTracked.values;

  const warnings = [];
  const errors = [];
  const variables = Object.create(null);
  const secrets = Object.create(null);
  const missingSecrets = [];

  // 1. 비비밀 배포·공개 빌드 Variables
  const accountId = (infra.CLOUDFLARE_ACCOUNT_ID || prodLocal.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (/^[0-9a-f]{32}$/iu.test(accountId)) {
    variables.CLOUDFLARE_ACCOUNT_ID = accountId.toLowerCase();
  } else {
    errors.push("CLOUDFLARE_ACCOUNT_ID(32자리 16진수)를 .env.infrastructure.local에서 확인하지 못했습니다.");
  }

  variables.CORE_API_ORIGIN = ONPOD_CANONICAL_ORIGIN;
  variables.ONPOD_APP_NAME = ONPOD_CANONICAL_APP;
  variables.VITE_CATALOG_SOURCE = "static";

  const liveOrigin = (prodTracked.VITE_STUDIO_LIVE_ORIGIN || infra.VITE_STUDIO_LIVE_ORIGIN || "https://www.toonstudio.cloud").trim();
  const realtimeOrigin = (prodTracked.VITE_STUDIO_REALTIME_ORIGIN || infra.VITE_STUDIO_REALTIME_ORIGIN || "https://realtime.toonstudio.cloud").trim();
  if (!validHttpsOrigin(liveOrigin)) errors.push("VITE_STUDIO_LIVE_ORIGIN이 유효한 HTTPS origin이 아닙니다.");
  else variables.VITE_STUDIO_LIVE_ORIGIN = new URL(liveOrigin).origin;

  if (!validHttpsOrigin(realtimeOrigin)) errors.push("VITE_STUDIO_REALTIME_ORIGIN이 유효한 HTTPS origin이 아닙니다.");
  else variables.VITE_STUDIO_REALTIME_ORIGIN = new URL(realtimeOrigin).origin;

  variables.VITE_STUDIO_REALTIME_PROVIDER_ID = (
    prodTracked.VITE_STUDIO_REALTIME_PROVIDER_ID
    || infra.VITE_STUDIO_REALTIME_PROVIDER_ID
    || "cloudflare-realtime-v1"
  ).trim();
  variables.VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH = (
    prodTracked.VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH
    || infra.VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH
    || "true"
  ).trim();

  // 2. 공개 브라우저 키(Kakao JS SDK)
  const kakaoJsKey = (
    extraSecrets.VITE_KAKAO_JAVASCRIPT_KEY
    || prodLocal.VITE_KAKAO_JAVASCRIPT_KEY
    || infra.VITE_KAKAO_JAVASCRIPT_KEY
    || ""
  ).trim();
  if (!isPlaceholderCredentialValue(kakaoJsKey)) {
    secrets.VITE_KAKAO_JAVASCRIPT_KEY = kakaoJsKey;
  } else {
    missingSecrets.push("VITE_KAKAO_JAVASCRIPT_KEY");
    warnings.push("VITE_KAKAO_JAVASCRIPT_KEY가 없어 클라우드 웹 빌드에서 카카오 공유 SDK가 비활성화될 수 있습니다.");
  }

  // 3. Cloudflare 배포 API 토큰 (비대화형 CI 필수; 셸의 만료된 토큰 자동 폴백 금지)
  const cfApiToken = (extraSecrets.CLOUDFLARE_API_TOKEN || infra.CLOUDFLARE_API_TOKEN || "").trim();
  if (!isPlaceholderCredentialValue(cfApiToken)) {
    secrets.CLOUDFLARE_API_TOKEN = cfApiToken;
  } else {
    missingSecrets.push("CLOUDFLARE_API_TOKEN");
    warnings.push(
      "CLOUDFLARE_API_TOKEN이 .env.infrastructure.local에 없습니다. 정적 웹·R2 클라우드 배포 전 1회 등록이 필요합니다.",
    );
  }

  // 4. Onpod 앱 범위 제한 배포 토큰 (전권 ONPOD_TOKEN 자동 업로드 차단)
  const onpodDeployToken = (extraSecrets.ONPOD_DEPLOY_TOKEN || infra.ONPOD_DEPLOY_TOKEN || "").trim();
  if (!isPlaceholderCredentialValue(onpodDeployToken)) {
    if (infra.ONPOD_TOKEN && onpodDeployToken === infra.ONPOD_TOKEN.trim()) {
      errors.push(
        "ONPOD_DEPLOY_TOKEN이 계정 전권 ONPOD_TOKEN과 동일합니다. `pnpm run deploy:auth -- --provision-onpod-key`로 앱 전용 키를 분리하세요.",
      );
    } else {
      secrets.ONPOD_DEPLOY_TOKEN = onpodDeployToken;
    }
  } else {
    missingSecrets.push("ONPOD_DEPLOY_TOKEN");
    if (!isPlaceholderCredentialValue(infra.ONPOD_TOKEN || "")) {
      warnings.push(
        "전권 ONPOD_TOKEN은 보안 원칙상 GitHub Actions에 업로드하지 않습니다. `pnpm run deploy:auth -- --provision-onpod-key`로 toonstudio-api 전용 키를 발급하세요.",
      );
    } else {
      warnings.push("ONPOD_DEPLOY_TOKEN이 설정되지 않았습니다.");
    }
  }

  // 5. Onpod Core API 런타임 환경변수 번들(ONPOD_API_ENV_* -> ONPOD_API_ENV_JSON, DATABASE_URL 제외)
  const rawOnpodEntries = Object.keys(infra)
    .filter((key) => /^ONPOD_API_ENV_[A-Z0-9_]+$/u.test(key) && infra[key].trim() !== "")
    .sort((a, b) => a.localeCompare(b, "en"));

  let apiEnvKeyCount = 0;
  if (rawOnpodEntries.length > 0) {
    const mergedApiEnv = { ...ONPOD_BASE_NONSECRET_ENV };
    for (const prefixedKey of rawOnpodEntries) {
      const runtimeKey = prefixedKey.slice("ONPOD_API_ENV_".length);
      if (FORBIDDEN_API_SYNC_KEYS.has(runtimeKey)) continue;
      mergedApiEnv[runtimeKey] = infra[prefixedKey];
    }
    const sortedApiEnv = Object.fromEntries(
      Object.entries(mergedApiEnv).sort(([left], [right]) => left.localeCompare(right, "en")),
    );
    const validationErrors = validateOnpodApiEnvMap(sortedApiEnv);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
    } else {
      apiEnvKeyCount = Object.keys(sortedApiEnv).length;
      secrets.ONPOD_API_ENV_JSON = JSON.stringify(sortedApiEnv);
    }
  } else {
    missingSecrets.push("ONPOD_API_ENV_JSON");
  }

  // 6. Worker 짝 시크릿 (CORE_ORIGIN_SECRET / NEIS_API_KEY / REALTIME_* / ANALYTICS_RPC_TOKEN)
  const edgeSecret = (infra.ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET || "").trim();
  const explicitCoreOriginSecret = (infra.CORE_ORIGIN_SECRET || "").trim();
  if (edgeSecret && explicitCoreOriginSecret && edgeSecret !== explicitCoreOriginSecret) {
    errors.push("CLOUDFLARE_EDGE_ORIGIN_SECRET과 CORE_ORIGIN_SECRET 짝이 일치하지 않습니다.");
  } else {
    const resolvedOriginSecret = explicitCoreOriginSecret || edgeSecret;
    if (isValidSecret32(resolvedOriginSecret)) {
      secrets.CORE_ORIGIN_SECRET = resolvedOriginSecret;
    } else if (loaded.infra.exists) {
      missingSecrets.push("CORE_ORIGIN_SECRET");
    }
  }

  const neisKey = (infra.NEIS_API_KEY || infra.ONPOD_API_ENV_NEIS_API_KEY || "").trim();
  if (!isPlaceholderCredentialValue(neisKey)) {
    secrets.NEIS_API_KEY = neisKey;
  }

  const realtimeTicket = (
    infra.REALTIME_TICKET_SECRET
    || infra.ONPOD_API_ENV_STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET
    || ""
  ).trim();
  if (isValidSecret32(realtimeTicket)) {
    secrets.REALTIME_TICKET_SECRET = realtimeTicket;
  }

  const realtimeControl = (
    infra.REALTIME_CONTROL_SECRET
    || infra.ONPOD_API_ENV_STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET
    || ""
  ).trim();
  if (realtimeControl) {
    if (realtimeControl === realtimeTicket) {
      errors.push("REALTIME_CONTROL_SECRET은 REALTIME_TICKET_SECRET과 달라야 합니다.");
    } else if (isValidSecret32(realtimeControl)) {
      secrets.REALTIME_CONTROL_SECRET = realtimeControl;
    } else {
      errors.push("REALTIME_CONTROL_SECRET은 공백 패딩 없는 32바이트 이상이어야 합니다.");
    }
  }

  const analyticsToken = (
    infra.ANALYTICS_RPC_TOKEN
    || infra.ONPOD_API_ENV_TRAFFIC_ANALYTICS_D1_RPC_TOKEN
    || ""
  ).trim();
  if (isValidSecret32(analyticsToken)) {
    secrets.ANALYTICS_RPC_TOKEN = analyticsToken;
  }

  return {
    loadedFiles: {
      infrastructureLocal: loaded.infra.exists,
      productionLocal: loaded.prodLocal.exists,
      productionTracked: loaded.prodTracked.exists,
    },
    variables,
    secrets,
    secretNames: Object.keys(secrets).sort((a, b) => a.localeCompare(b, "en")),
    variableNames: Object.keys(variables).sort((a, b) => a.localeCompare(b, "en")),
    missingSecrets,
    apiEnvKeyCount,
    warnings,
    errors,
  };
}
