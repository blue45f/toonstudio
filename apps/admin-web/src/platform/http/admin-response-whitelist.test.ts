import { describe, expect, it } from "vitest";

import {
  ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA,
  REDACTED_CREDENTIAL,
  REDACTED_ENV_ENTRY,
  REDACTED_ENV_KEY,
  REDACTED_INTERNAL_HOST,
  assertSafeAdminDiagnosticOutput,
  isForbiddenAdminFieldKey,
  sanitizeAdminDiagnosticText,
  sanitizeAdminResponseValue,
  serializeWhitelistedAdminPayload,
  stringifyWhitelistedAdminPayload,
} from "./admin-response-whitelist";

// 테스트 파일 자체가 secretlint에 걸리지 않도록 합성 시크릿을 동적으로 조립한다.
const SYNTH_DSN = ["postgres", "://", "opsuser", ":", "SyntheticDbPass123", "@toonstudio-db.db.onpod.local:5432/toonstudio"].join("");
const SYNTH_OPENAI_KEY = ["sk", "proj", "SyntheticSecretCheck99887766"].join("-");
const SYNTH_BEARER = ["Bear", "er ", "SyntheticJwtPayloadAlphaBeta99"].join("");
const SYNTH_GH_TOKEN = ["ghp", "SyntheticGithubToken11223344"].join("_");
const SYNTH_ONPOD_TOKEN = ["opk", "SyntheticOnpodToken55667788"].join("_");
const SYNTH_PEM = [
  "-----BEGIN PRIVATE KEY-----",
  "MIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEA",
  "-----END PRIVATE KEY-----",
].join("\n");

describe("admin-response-whitelist (#115)", () => {
  it("금지 키(.env 키, 내부 호스트 키, 프로토타입 오염 키)를 정확히 판별한다", () => {
    for (const key of [
      "DATABASE_URL",
      "AUTH_SESSION_SECRET",
      "ONPOD_DEPLOY_TOKEN",
      "POSTGRES_PASSWORD",
      "CLOUDFLARE_API_TOKEN",
      "ONPOD_API_ENV_FOO",
      "internalHost",
      "internal_url",
      "env",
      "secrets",
      "__proto__",
      "constructor",
      "prototype",
    ]) {
      expect(isForbiddenAdminFieldKey(key), key).toBe(true);
    }

    for (const safeKey of ["status", "revision", "webUrl", "migrations", "openAlertsCount"]) {
      expect(isForbiddenAdminFieldKey(safeKey), safeKey).toBe(false);
    }
  });

  it("문자열에서 .env 키 이름, 내부 호스트(*.onpod.local, 127.0.0.1, localhost), 사설 자격증명을 완전히 마스킹한다", () => {
    const raw = [
      `dsn=${SYNTH_DSN}`,
      `apiKey=${SYNTH_OPENAI_KEY}`,
      `auth=${SYNTH_BEARER}`,
      `gh=${SYNTH_GH_TOKEN}`,
      `onpod=${SYNTH_ONPOD_TOKEN}`,
      "internal=toonstudio-db.db.onpod.local:5432",
      "loopback=http://127.0.0.1:4174/api/health",
      "local=http://localhost:3000/admin",
      "ipv6=http://[::1]:8787/internal",
      "private=http://10.0.0.12:5432/db",
      "envLine=DATABASE_URL=fake-inline-val",
      "envNames=AUTH_SESSION_SECRET, ONPOD_DEPLOY_TOKEN, ADMIN_PASSWORD, .env.infrastructure.local",
      SYNTH_PEM,
      "publicOk=https://www.toonstudio.cloud https://toonstudio-api.onpod.ai",
    ].join(" | ");

    const sanitized = sanitizeAdminDiagnosticText(raw);

    expect(sanitized).toContain(REDACTED_CREDENTIAL);
    expect(sanitized).toContain(REDACTED_INTERNAL_HOST);
    expect(sanitized).toContain(REDACTED_ENV_ENTRY);
    expect(sanitized).toContain(REDACTED_ENV_KEY);
    // 정상 공개 운영 URL은 보존한다.
    expect(sanitized).toContain("https://www.toonstudio.cloud");
    expect(sanitized).toContain("https://toonstudio-api.onpod.ai");

    for (const forbidden of [
      "postgres://",
      "SyntheticDbPass123",
      "sk-proj-",
      "SyntheticJwtPayloadAlphaBeta99",
      "ghp_",
      "opk_",
      "onpod.local",
      "127.0.0.1",
      "localhost",
      "[::1]",
      "10.0.0.12",
      "DATABASE_URL",
      "AUTH_SESSION_SECRET",
      "ONPOD_DEPLOY_TOKEN",
      "ADMIN_PASSWORD",
      ".env.infrastructure.local",
      "BEGIN PRIVATE KEY",
    ]) {
      expect(sanitized.includes(forbidden), `유출 감지: ${forbidden}`).toBe(false);
    }

    const audit = assertSafeAdminDiagnosticOutput(sanitized);
    expect(audit).toEqual({ ok: true, violations: [] });
  });

  it("응답 객체 재귀 정제 시 금지 키를 삭제하고 순환 참조에서도 안전하게 종료한다", () => {
    const payload: Record<string, unknown> = {
      status: "ok",
      message: "DB 점검 완료 (연결 대상 toonstudio-db.db.onpod.local:5432 / localhost:5432)",
      DATABASE_URL: SYNTH_DSN,
      AUTH_SESSION_SECRET: "hidden-secret",
      ONPOD_DEPLOY_TOKEN: SYNTH_ONPOD_TOKEN,
      DB_PASSWORD: "hidden-password",
      internalHost: "toonstudio-db.db.onpod.local:5432",
      env: { SECRET_KEY: "abc" },
      nested: {
        allowedNote: `오류 원문: ${SYNTH_BEARER} via 127.0.0.1:8080`,
        apiToken: "should-be-dropped",
      },
    };
    payload.self = payload;

    const cleaned = sanitizeAdminResponseValue(payload);
    expect(cleaned.status).toBe("ok");
    expect(cleaned.DATABASE_URL).toBeUndefined();
    expect(cleaned.AUTH_SESSION_SECRET).toBeUndefined();
    expect(cleaned.ONPOD_DEPLOY_TOKEN).toBeUndefined();
    expect(cleaned.DB_PASSWORD).toBeUndefined();
    expect(cleaned.internalHost).toBeUndefined();
    expect(cleaned.env).toBeUndefined();
    expect(cleaned.self).toBeNull();
    expect((cleaned.nested as Record<string, unknown>).apiToken).toBeUndefined();

    const serialized = JSON.stringify(cleaned);
    expect(assertSafeAdminDiagnosticOutput(serialized)).toEqual({ ok: true, violations: [] });
  });

  it("화이트리스트 스키마 투영은 선언되지 않은 필드와 민감 필드를 모두 차단하고 안전 JSON을 생성한다", () => {
    const dirtyInput = {
      schemaVersion: "1.0.0",
      generatedAt: "2026-11-23T05:00:00.000Z",
      sourceKind: "imported-ops-dashboard",
      mode: "online",
      overallStatus: "ok",
      degradedReasons: ["DATABASE_URL 누락 의심 · 127.0.0.1:5432 접속 불가"],
      DATABASE_URL: SYNTH_DSN,
      ONPOD_DEPLOY_TOKEN: SYNTH_ONPOD_TOKEN,
      extraDebugDump: { internalHost: "toonstudio-db.db.onpod.local:5432" },
      git: {
        branch: "main",
        headShortSha: "abcdef1234",
        originMainShortSha: "abcdef1234",
        headMatchesOriginMain: true,
        clean: true,
      },
      deploymentLedger: {
        webProvider: "Cloudflare Static",
        webUrl: "https://www.toonstudio.cloud",
        webResource: "toonspectrum-web",
        apiProvider: "Seoul onpod",
        apiUrl: "https://toonstudio-api.onpod.ai",
        apiResource: "toonstudio-api",
        databaseResource: "toonstudio-db",
        databaseEngine: "PostgreSQL 17",
        internalHost: "toonstudio-db.db.onpod.local:5432",
        standingApprovalMode: "standing-approval",
        standingApprovalOk: true,
        activeScopes: ["cloudflare-static-production", "core-api-container-release"],
        onpodRequiresExplicitApproval: true,
        retiredProviders: ["vercel", "render", "supabase", "neon"],
        forbiddenCommands: ["onpod app deploy --attach-db", "onpod app rollback"],
      },
      migrations: {
        ok: true,
        totalCount: 133,
        diskCount: 133,
        latestNumber: "0133",
        latestName: "0133_production_division_os",
        missingFilesCount: 0,
        unregisteredFilesCount: 0,
      },
      liveHealth: {
        status: "healthy",
        passed: 4,
        total: 4,
        studioCoopCoepIsolated: true,
      },
      codeScanning: {
        status: "ok",
        openAlertsCount: 0,
        truncated: false,
        tools: ["CodeQL"],
      },
      mobile3dAudit: {
        status: "ok",
        actionableFailedRequests: 0,
        abortedRequests: 2,
        httpErrorCount: 0,
        generatedAt: "2026-11-23T04:00:00.000Z",
      },
    };

    const result = serializeWhitelistedAdminPayload(dirtyInput, ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA);
    expect(result.strippedKeyCount).toBe(4);
    expect(result.redactedFieldCount).toBe(1);
    expect(result.blockedCategories).toEqual(["env-key", "internal-host", "unlisted"]);

    const json = stringifyWhitelistedAdminPayload(dirtyInput, ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA);
    expect(assertSafeAdminDiagnosticOutput(json)).toEqual({ ok: true, violations: [] });
    expect(json).not.toContain("DATABASE_URL");
    expect(json).not.toContain("ONPOD_DEPLOY_TOKEN");
    expect(json).not.toContain("onpod.local");
    expect(json).not.toContain("127.0.0.1");
    expect(json).not.toContain("extraDebugDump");
    expect(json).toContain("0133_production_division_os");
    expect(json).toContain("https://www.toonstudio.cloud");
  });

  it("assertSafeAdminDiagnosticOutput는 반복 호출에서도 정규식 상태(lastIndex)가 흔들리지 않는다", () => {
    const unsafe = "host=toonstudio-db.db.onpod.local:5432 key=DATABASE_URL";
    const first = assertSafeAdminDiagnosticOutput(unsafe);
    const second = assertSafeAdminDiagnosticOutput(unsafe);
    expect(first.ok).toBe(false);
    expect(second).toEqual(first);
    expect(first.violations).toContain("internal-host");
    expect(first.violations).toContain("env-key");
  });
});
