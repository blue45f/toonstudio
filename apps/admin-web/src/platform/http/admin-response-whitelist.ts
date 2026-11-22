/**
 * 독립 관리자(apps/admin-web) 진단·운영 API 응답 직렬화 화이트리스트 유틸리티.
 *
 * - 명시적으로 허용된 필드 스키마 외의 미등록 키와 민감 키(.env SECRET/TOKEN/PASSWORD/DATABASE_URL 등)를
 *   경계에서 원천 제거한다.
 * - 허용된 문자열 값 안에서도 내부 호스트(*.onpod.local, 127.0.0.1, localhost, 사설 대역)와
 *   사설 자격증명(DSN, Bearer/Basic, API 키, PEM 개인키)을 모두 마스킹한다.
 * - 브라우저 스토리지나 전역 상태를 참조하지 않는 순수 함수 모듈이다.
 */

export const REDACTED_CREDENTIAL = "<redacted-credential>";
export const REDACTED_INTERNAL_HOST = "<redacted-internal-host>";
export const REDACTED_ENV_KEY = "<redacted-env-key>";
export const REDACTED_ENV_ENTRY = "<redacted-env-entry>";

export const ADMIN_FORBIDDEN_ENV_KEY_TOKENS = [
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "PASSWD",
  "DATABASE_URL",
  "PRIVATE_KEY",
  "API_KEY",
  "CONNECTION_STRING",
  "ACCESS_KEY",
  "SERVICE_ROLE",
  "SIGNING_KEY",
  "CREDENTIAL",
  "AUTH_HEADER",
] as const;

const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const FORBIDDEN_EXACT_KEYS = new Set([
  "env",
  "dotenv",
  "processenv",
  "process_env",
  "secrets",
  "credentials",
  "dsn",
  "internalhost",
  "internal_host",
  "internalurl",
  "internal_url",
  "cookie",
  "cookies",
  "authorization",
]);

const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu;

const DSN_PATTERN =
  /(?:postgres(?:ql)?|mysql|mariadb|redis|rediss|mongodb(?:\+srv)?|amqps?):\/\/[^\s"'<>)]+/giu;

const URL_USERINFO_PATTERN = /https?:\/\/[^/\s"'<>@]+:[^/\s"'<>@]+@[^\s"'<>)]+/giu;

const AUTH_HEADER_PATTERN = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{4,}/giu;

const PROVIDER_CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}/gu,
  /\bpk_(?:live|test)_[A-Za-z0-9_-]{8,}/gu,
  /\bgh[pousr]_[A-Za-z0-9_]{8,}/gu,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/gu,
  /\bop[ku]?_[A-Za-z0-9_-]{6,}/gu,
  /\bAIza[0-9A-Za-z_-]{16,}/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}/gu,
  /\b1\/\/[A-Za-z0-9_-]{12,}/gu,
];

const INTERNAL_HOST_PATTERNS: readonly RegExp[] = [
  /https?:\/\/(?:[a-z0-9-]+\.)*onpod\.local(?::\d{1,5})?(?:\/[^\s"'<>)]*)?/giu,
  /\b(?:[a-z0-9-]+\.)+onpod\.local(?::\d{1,5})?\b/giu,
  /https?:\/\/(?:[a-z0-9-]+\.)+internal(?::\d{1,5})?(?:\/[^\s"'<>)]*)?/giu,
  /\b(?:[a-z0-9-]+\.)+internal(?::\d{1,5})?\b/giu,
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:\/[^\s"'<>)]*)?/giu,
  /\b(?:localhost|127\.0\.0\.1)(?::\d{1,5})?\b/giu,
  /\b0\.0\.0\.0:\d{1,5}\b/gu,
  /\[::1\](?::\d{1,5})?/gu,
  /https?:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d{1,5})?(?:\/[^\s"'<>)]*)?/giu,
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d{1,5})\b/gu,
];

const ENV_ASSIGNMENT_PATTERN =
  /\b(?:[A-Z][A-Z0-9_]*_)?(?:SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL|PRIVATE_KEY|API_KEY|CONNECTION_STRING|ACCESS_KEY|SERVICE_ROLE|SIGNING_KEY|ONPOD_API_ENV_[A-Z0-9_]+)(?:_[A-Z0-9_]+)?\s*=\s*[^\s"'<>),;]+/giu;

const ENV_KEY_NAME_PATTERNS: readonly RegExp[] = [
  /\bONPOD_API_ENV_[A-Z0-9_]+\b/gu,
  /\bDATABASE_URL(?:_[A-Z0-9_]+)?\b/giu,
  /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|CONNECTION_STRING|ACCESS_KEY|SERVICE_ROLE|SIGNING_KEY)[A-Z0-9_]*\b/gu,
  /\.env(?:\.[a-z0-9_-]+)+/giu,
];

export type AdminWhitelistField =
  | "string"
  | "number"
  | "boolean"
  | "nullable-string"
  | "nullable-number"
  | "string-array"
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "object"; readonly fields: AdminWhitelistSchema }
  | { readonly kind: "array"; readonly item: AdminWhitelistField };

export interface AdminWhitelistSchema {
  readonly [field: string]: AdminWhitelistField;
}

export interface AdminWhitelistProjectionResult {
  readonly data: Record<string, unknown>;
  readonly strippedKeyCount: number;
  readonly redactedFieldCount: number;
  readonly blockedCategories: readonly ("env-key" | "internal-host" | "prototype" | "unlisted")[];
}

export interface AdminDiagnosticSafetyAudit {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

/** 객체 키가 프로토타입 오염·.env 비밀키·내부 호스트 노출 위험 키인지 판정한다. */
export function isForbiddenAdminFieldKey(key: string): boolean {
  if (!key) return true;
  if (PROTOTYPE_POLLUTION_KEYS.has(key)) return true;
  const lower = key.toLowerCase();
  if (FORBIDDEN_EXACT_KEYS.has(lower)) return true;
  if (lower.startsWith("onpod_api_env_")) return true;
  const upper = key.toUpperCase();
  return ADMIN_FORBIDDEN_ENV_KEY_TOKENS.some((token) => upper.includes(token));
}

function classifyBlockedKey(key: string): "env-key" | "internal-host" | "prototype" | "unlisted" {
  if (PROTOTYPE_POLLUTION_KEYS.has(key)) return "prototype";
  const lower = key.toLowerCase();
  if (lower.includes("internalhost") || lower.includes("internal_host") || lower.includes("internalurl") || lower.includes("internal_url")) {
    return "internal-host";
  }
  if (isForbiddenAdminFieldKey(key)) return "env-key";
  return "unlisted";
}

/** 관리자 진단·오류·응답 문자열에서 .env 키 이름, 내부 호스트, 사설 자격증명을 완전히 마스킹한다. */
export function sanitizeAdminDiagnosticText(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  let scrubbed = input
    .replace(PEM_PRIVATE_KEY_PATTERN, REDACTED_CREDENTIAL)
    .replace(DSN_PATTERN, REDACTED_CREDENTIAL)
    .replace(URL_USERINFO_PATTERN, REDACTED_CREDENTIAL)
    .replace(AUTH_HEADER_PATTERN, REDACTED_CREDENTIAL);

  for (const pattern of PROVIDER_CREDENTIAL_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, REDACTED_CREDENTIAL);
  }
  for (const pattern of INTERNAL_HOST_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, REDACTED_INTERNAL_HOST);
  }
  scrubbed = scrubbed.replace(ENV_ASSIGNMENT_PATTERN, REDACTED_ENV_ENTRY);
  for (const pattern of ENV_KEY_NAME_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, REDACTED_ENV_KEY);
  }
  return scrubbed;
}

/**
 * API 응답 객체 전체를 재귀 순회하여 금지 키(.env 키, 프로토타입 키, 내부 호스트 키)를 제거하고
 * 모든 문자열 값에 민감 정보 마스킹을 적용한다.
 */
export function sanitizeAdminResponseValue<T>(value: T, maxDepth = 16): T {
  const seen = new WeakSet<object>();

  const walk = (current: unknown, depth: number): unknown => {
    if (typeof current === "string") return sanitizeAdminDiagnosticText(current);
    if (current === null || typeof current !== "object") return current;
    if (depth >= maxDepth || seen.has(current)) return null;
    seen.add(current);

    if (Array.isArray(current)) {
      return current.map((entry) => walk(entry, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      if (isForbiddenAdminFieldKey(key)) continue;
      if (entry === undefined) continue;
      out[key] = walk(entry, depth + 1);
    }
    return out;
  };

  return walk(value, 0) as T;
}

function projectFieldValue(
  raw: unknown,
  fieldSchema: AdminWhitelistField,
  counters: { strippedKeyCount: number; redactedFieldCount: number; categories: Set<"env-key" | "internal-host" | "prototype" | "unlisted"> },
): unknown {
  if (fieldSchema === "string") {
    if (typeof raw !== "string") return "";
    const cleaned = sanitizeAdminDiagnosticText(raw);
    if (cleaned !== raw) counters.redactedFieldCount += 1;
    return cleaned;
  }
  if (fieldSchema === "nullable-string") {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") return null;
    const cleaned = sanitizeAdminDiagnosticText(raw);
    if (cleaned !== raw) counters.redactedFieldCount += 1;
    return cleaned;
  }
  if (fieldSchema === "number") {
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  }
  if (fieldSchema === "nullable-number") {
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  if (fieldSchema === "boolean") {
    return typeof raw === "boolean" ? raw : false;
  }
  if (fieldSchema === "string-array") {
    if (!Array.isArray(raw)) return [];
    const items: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== "string") continue;
      const cleaned = sanitizeAdminDiagnosticText(entry);
      if (cleaned !== entry) counters.redactedFieldCount += 1;
      items.push(cleaned);
    }
    return items;
  }
  if (fieldSchema.kind === "enum") {
    if (typeof raw === "string" && fieldSchema.values.includes(raw)) return raw;
    return fieldSchema.values[0] ?? "";
  }
  if (fieldSchema.kind === "array") {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => projectFieldValue(entry, fieldSchema.item, counters));
  }
  return projectObject(raw, fieldSchema.fields, counters);
}

function projectObject(
  raw: unknown,
  schema: AdminWhitelistSchema,
  counters: { strippedKeyCount: number; redactedFieldCount: number; categories: Set<"env-key" | "internal-host" | "prototype" | "unlisted"> },
): Record<string, unknown> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

  for (const key of Object.keys(source)) {
    if (!Object.hasOwn(schema, key) || isForbiddenAdminFieldKey(key)) {
      counters.strippedKeyCount += 1;
      counters.categories.add(classifyBlockedKey(key));
    }
  }

  const projected: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (isForbiddenAdminFieldKey(key)) {
      counters.strippedKeyCount += 1;
      counters.categories.add(classifyBlockedKey(key));
      continue;
    }
    projected[key] = projectFieldValue(source[key], fieldSchema, counters);
  }
  return projected;
}

/**
 * 선언된 화이트리스트 스키마에 따라 관리자 진단·운영 페이로드를 엄격 투영한다.
 * 미등록 키와 금지 키는 전부 제거되며, 허용된 문자열은 민감 패턴 마스킹을 거친다.
 */
export function serializeWhitelistedAdminPayload(
  raw: unknown,
  schema: AdminWhitelistSchema,
): AdminWhitelistProjectionResult {
  const counters = {
    strippedKeyCount: 0,
    redactedFieldCount: 0,
    categories: new Set<"env-key" | "internal-host" | "prototype" | "unlisted">(),
  };
  const data = projectObject(raw, schema, counters);
  return {
    data,
    strippedKeyCount: counters.strippedKeyCount,
    redactedFieldCount: counters.redactedFieldCount,
    blockedCategories: [...counters.categories].sort(),
  };
}

/** 화이트리스트 투영과 직렬화 후 안전성 검증까지 마친 JSON 문자열을 반환한다. */
export function stringifyWhitelistedAdminPayload(
  raw: unknown,
  schema: AdminWhitelistSchema,
): string {
  const projected = serializeWhitelistedAdminPayload(raw, schema);
  const serialized = JSON.stringify(projected.data, null, 2);
  const audit = assertSafeAdminDiagnosticOutput(serialized);
  if (!audit.ok) {
    throw new Error(`관리자 응답 화이트리스트 안전성 검증에 실패했습니다(${audit.violations.join(", ")}).`);
  }
  return serialized;
}

function hasPatternMatch(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  const matched = pattern.test(text);
  pattern.lastIndex = 0;
  return matched;
}

/** 직렬화된 문자열에 .env 키, 내부 호스트, 사설 자격증명 잔재가 남아 있는지 fail-closed 검사한다. */
export function assertSafeAdminDiagnosticOutput(serialized: string): AdminDiagnosticSafetyAudit {
  const violations: string[] = [];
  if (hasPatternMatch(PEM_PRIVATE_KEY_PATTERN, serialized)) violations.push("pem-private-key");
  if (hasPatternMatch(DSN_PATTERN, serialized)) violations.push("database-dsn");
  if (hasPatternMatch(URL_USERINFO_PATTERN, serialized)) violations.push("url-credentials");
  if (hasPatternMatch(AUTH_HEADER_PATTERN, serialized)) violations.push("auth-header");
  if (PROVIDER_CREDENTIAL_PATTERNS.some((pattern) => hasPatternMatch(pattern, serialized))) {
    violations.push("provider-credential");
  }
  if (INTERNAL_HOST_PATTERNS.some((pattern) => hasPatternMatch(pattern, serialized))) {
    violations.push("internal-host");
  }
  if (
    hasPatternMatch(ENV_ASSIGNMENT_PATTERN, serialized)
    || ENV_KEY_NAME_PATTERNS.some((pattern) => hasPatternMatch(pattern, serialized))
  ) {
    violations.push("env-key");
  }
  return { ok: violations.length === 0, violations };
}

/** ops-dashboard · 배포 원장 · DB 133/133 통합 조회 카드용 정본 화이트리스트 스키마. */
export const ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA: AdminWhitelistSchema = {
  schemaVersion: "string",
  generatedAt: "string",
  sourceKind: { kind: "enum", values: ["baseline", "imported-ops-dashboard"] },
  mode: { kind: "enum", values: ["offline", "online", "baseline"] },
  overallStatus: { kind: "enum", values: ["ok", "degraded", "unknown"] },
  degradedReasons: "string-array",
  git: {
    kind: "object",
    fields: {
      branch: "nullable-string",
      headShortSha: "nullable-string",
      originMainShortSha: "nullable-string",
      headMatchesOriginMain: "boolean",
      clean: "boolean",
    },
  },
  deploymentLedger: {
    kind: "object",
    fields: {
      webProvider: "string",
      webUrl: "string",
      webResource: "string",
      apiProvider: "string",
      apiUrl: "string",
      apiResource: "string",
      databaseResource: "string",
      databaseEngine: "string",
      standingApprovalMode: "string",
      standingApprovalOk: "boolean",
      activeScopes: "string-array",
      onpodRequiresExplicitApproval: "boolean",
      retiredProviders: "string-array",
      forbiddenCommands: "string-array",
    },
  },
  migrations: {
    kind: "object",
    fields: {
      ok: "boolean",
      totalCount: "number",
      diskCount: "number",
      latestNumber: "nullable-string",
      latestName: "nullable-string",
      missingFilesCount: "number",
      unregisteredFilesCount: "number",
    },
  },
  liveHealth: {
    kind: "object",
    fields: {
      status: "string",
      passed: "number",
      total: "number",
      studioCoopCoepIsolated: "boolean",
    },
  },
  codeScanning: {
    kind: "object",
    fields: {
      status: "string",
      openAlertsCount: "nullable-number",
      truncated: "boolean",
      tools: "string-array",
    },
  },
  mobile3dAudit: {
    kind: "object",
    fields: {
      status: "string",
      actionableFailedRequests: "nullable-number",
      abortedRequests: "nullable-number",
      httpErrorCount: "nullable-number",
      generatedAt: "nullable-string",
    },
  },
};
