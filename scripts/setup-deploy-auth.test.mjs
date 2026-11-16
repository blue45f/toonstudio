const { describe, test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GITHUB_DEPLOY_ENVIRONMENT,
  GITHUB_REPO_SLUG,
  buildGitHubDeploySyncPlan,
  parseDotenvContent,
  redactSensitiveText,
  upsertEnvFileEntries,
  validateOnpodApiEnvMap,
} from "./lib/deploy-auth-env.mjs";
import {
  extractScopedOnpodToken,
  parseAuthCliArgs,
  provisionScopedOnpodDeployKey,
  syncPlanToGitHubActions,
  verifyCloudflareApiToken,
} from "./setup-deploy-auth.mjs";

function withTempRoot(fn) {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-deploy-auth-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeSecret32(prefix) {
  return `${prefix}_`.padEnd(48, "a");
}

function writeSampleLocalEnv(rootDir, overrides = {}) {
  const edgeSecret = makeSecret32("edge_origin");
  const baseInfra = {
    CLOUDFLARE_ACCOUNT_ID: "cdead3a32be7e086fef1e1dac7c590fd",
    CLOUDFLARE_API_TOKEN: "cf_scoped_token_fixture_1234567890",
    ONPOD_TOKEN: "op_u_owner_full_access_token_do_not_upload_12345",
    ONPOD_DEPLOY_TOKEN: "op_k_app_scoped_toonstudio_api_only_9876543210",
    ONPOD_DATABASE_URL: `postgresql://${["fixture", "fixtureSecret"].join(":")}@toonstudio-db.db.onpod.local:5432/db?sslmode=no-verify`,
    ONPOD_API_ENV_DATABASE_RUNTIME_ROLE_MODE: "single-owner",
    ONPOD_API_ENV_AUTH_EDGE_CLIENT_IP_ENABLED: "true",
    ONPOD_API_ENV_TRAFFIC_ANALYTICS_STORE: "d1",
    ONPOD_API_ENV_AUTH_SESSION_SECRET: makeSecret32("session"),
    ONPOD_API_ENV_AUTH_STATE_SECRET: makeSecret32("state"),
    ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET: edgeSecret,
    ONPOD_API_ENV_STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: makeSecret32("realtime_ticket"),
    ONPOD_API_ENV_TRAFFIC_ANALYTICS_D1_RPC_TOKEN: makeSecret32("analytics_rpc"),
    ONPOD_API_ENV_NEIS_API_KEY: "neis_sample_key_fixture",
    VITE_ANTHROPIC_API_KEY: "sk-ant-dev-only-never-sync",
    ...overrides,
  };
  const infraLines = Object.entries(baseInfra)
    .filter(([, val]) => val !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  writeFileSync(join(rootDir, ".env.infrastructure.local"), `${infraLines.join("\n")}\n`, { mode: 0o600 });
  writeFileSync(join(rootDir, ".env.production.local"), "VITE_KAKAO_JAVASCRIPT_KEY=kakao_public_js_fixture\n", {
    mode: 0o600,
  });
  writeFileSync(
    join(rootDir, ".env.production"),
    [
      "VITE_STUDIO_LIVE_ORIGIN=https://www.toonstudio.cloud",
      "VITE_STUDIO_REALTIME_ORIGIN=https://realtime.toonstudio.cloud",
      "VITE_STUDIO_REALTIME_PROVIDER_ID=cloudflare-realtime-v1",
      "VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH=true",
    ].join("\n"),
  );
}

describe("deploy-auth-env 및 setup-deploy-auth 검증", () => {
  test("parseDotenvContent와 upsertEnvFileEntries는 주석을 보존하고 권한 0600을 유지한다", () => {
    withTempRoot((dir) => {
      const envPath = join(dir, ".env.infrastructure.local");
      writeFileSync(envPath, "# 상단 주석\nEXISTING_KEY=keep_me\nREPLACE_KEY=old\n", { mode: 0o644 });
      upsertEnvFileEntries(envPath, {
        REPLACE_KEY: "new value with spaces",
        ADDED_KEY: "clean_token",
      });
      const content = readFileSync(envPath, "utf8");
      assert.match(content, /^# 상단 주석/u);
      const parsed = parseDotenvContent(content);
      assert.equal(parsed.EXISTING_KEY, "keep_me");
      assert.equal(parsed.REPLACE_KEY, "new value with spaces");
      assert.equal(parsed.ADDED_KEY, "clean_token");
      if (process.platform !== "win32") {
        assert.equal(statSync(envPath).mode & 0o777, 0o600);
      }
    });
  });

  test("buildGitHubDeploySyncPlan은 허용된 변수·시크릿만 추출하고 DB URL·전권 토큰·개발용 VITE 비밀을 차단한다", () => {
    withTempRoot((dir) => {
      writeSampleLocalEnv(dir);
      const plan = buildGitHubDeploySyncPlan(dir);
      assert.deepEqual(plan.errors, []);
      assert.equal(plan.variables.CLOUDFLARE_ACCOUNT_ID, "cdead3a32be7e086fef1e1dac7c590fd");
      assert.equal(plan.variables.CORE_API_ORIGIN, "https://toonstudio-api.onpod.ai");
      assert.equal(plan.variables.ONPOD_APP_NAME, "toonstudio-api");
      assert.equal(plan.secrets.VITE_KAKAO_JAVASCRIPT_KEY, "kakao_public_js_fixture");
      assert.equal(plan.secrets.CLOUDFLARE_API_TOKEN, "cf_scoped_token_fixture_1234567890");
      assert.equal(plan.secrets.ONPOD_DEPLOY_TOKEN, "op_k_app_scoped_toonstudio_api_only_9876543210");
      assert.equal(plan.secrets.NEIS_API_KEY, "neis_sample_key_fixture");
      assert.equal(plan.variables.VITE_ANTHROPIC_API_KEY, undefined);
      assert.equal(plan.secrets.VITE_ANTHROPIC_API_KEY, undefined);
      assert.equal(plan.secrets.ONPOD_TOKEN, undefined);

      const apiEnv = JSON.parse(plan.secrets.ONPOD_API_ENV_JSON);
      assert.equal(apiEnv.DATABASE_URL, undefined);
      assert.equal(apiEnv.ONPOD_DATABASE_URL, undefined);
      assert.equal(apiEnv.DATABASE_RUNTIME_ROLE_MODE, "single-owner");
      assert.equal(apiEnv.CLOUDFLARE_EDGE_ORIGIN_SECRET, plan.secrets.CORE_ORIGIN_SECRET);
    });
  });

  test("ONPOD_DEPLOY_TOKEN이 전권 ONPOD_TOKEN과 같거나 출처 시크릿 짝이 다르면 오류로 차단한다", () => {
    withTempRoot((dir) => {
      writeSampleLocalEnv(dir, {
        ONPOD_DEPLOY_TOKEN: "op_u_owner_full_access_token_do_not_upload_12345",
        CORE_ORIGIN_SECRET: makeSecret32("mismatched_origin"),
      });
      const plan = buildGitHubDeploySyncPlan(dir);
      assert.ok(plan.errors.some((msg) => msg.includes("ONPOD_DEPLOY_TOKEN이 계정 전권 ONPOD_TOKEN과 동일")));
      assert.ok(plan.errors.some((msg) => msg.includes("짝이 일치하지 않습니다")));
    });
  });

  test("validateOnpodApiEnvMap은 DATABASE_URL 포함 및 퇴역 공급자 키를 거부한다", () => {
    const errors = validateOnpodApiEnvMap({
      NODE_ENV: "production",
      DATABASE_RUNTIME_ROLE_MODE: "single-owner",
      AUTH_RATE_LIMIT_MODE: "single-instance-local",
      AUTH_EDGE_CLIENT_IP_ENABLED: "true",
      STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
      TRAFFIC_ANALYTICS_STORE: "d1",
      DATABASE_URL: `postgresql://${["u", "p"].join(":")}@host/db`,
      RENDER_SERVICE_ID: "srv-retired",
      AUTH_SESSION_SECRET: makeSecret32("s1"),
      AUTH_STATE_SECRET: makeSecret32("s2"),
      CLOUDFLARE_EDGE_ORIGIN_SECRET: makeSecret32("s3"),
      STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: makeSecret32("s4"),
      TRAFFIC_ANALYTICS_D1_RPC_TOKEN: makeSecret32("s5"),
    });
    assert.ok(errors.some((msg) => msg.includes("DATABASE_URL")));
    assert.ok(errors.some((msg) => msg.includes("RENDER_SERVICE_ID")));
  });

  test("provisionScopedOnpodDeployKey는 앱 전용 키를 발급해 .env.infrastructure.local에 저장하고 재실행 시 재사용한다", () => {
    withTempRoot((dir) => {
      writeSampleLocalEnv(dir, { ONPOD_DEPLOY_TOKEN: "" });
      const calls = [];
      const minted = "op_k_minted_scoped_key_for_toonstudio_api_only_99999";
      const first = provisionScopedOnpodDeployKey({
        rootDir: dir,
        execFileImpl: (bin, args) => {
          calls.push([bin, args]);
          return `Created scoped key:\n  ${minted}\n`;
        },
      });
      assert.equal(first.created, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], "onpod");
      assert.ok(calls[0][1].includes("--app"));
      assert.ok(calls[0][1].includes("toonstudio-api"));

      const saved = parseDotenvContent(readFileSync(join(dir, ".env.infrastructure.local"), "utf8"));
      assert.equal(saved.ONPOD_DEPLOY_TOKEN, minted);

      const second = provisionScopedOnpodDeployKey({
        rootDir: dir,
        execFileImpl: () => {
          throw new Error("재사용 시 호출되면 안 됨");
        },
      });
      assert.equal(second.reused, true);
      assert.equal(second.created, false);
    });
  });

  test("syncPlanToGitHubActions는 stdin 파이프로만 시크릿을 업로드하며 --dry-run에서는 외부 호출을 하지 않는다", () => {
    withTempRoot((dir) => {
      writeSampleLocalEnv(dir);
      const plan = buildGitHubDeploySyncPlan(dir);

      let dryCalls = 0;
      const dryResult = syncPlanToGitHubActions(plan, {
        rootDir: dir,
        dryRun: true,
        log: () => {},
        execFileImpl: () => {
          dryCalls += 1;
          return "";
        },
      });
      assert.equal(dryResult.dryRun, true);
      assert.equal(dryCalls, 0);

      const liveCalls = [];
      const liveResult = syncPlanToGitHubActions(plan, {
        rootDir: dir,
        dryRun: false,
        log: () => {},
        execFileImpl: (bin, args, opts) => {
          liveCalls.push({ bin, args, hasStdin: typeof opts?.input === "string" && opts.input.length > 0 });
          if (args.includes("deployment-branch-policies") && !args.includes("POST")) {
            return JSON.stringify({ branch_policies: [] });
          }
          return "{}";
        },
      });
      assert.equal(liveResult.dryRun, false);
      assert.ok(liveResult.syncedVariables.includes("CLOUDFLARE_ACCOUNT_ID"));
      assert.ok(liveResult.syncedSecrets.includes("ONPOD_DEPLOY_TOKEN"));

      const secretSetCalls = liveCalls.filter((c) => c.args[0] === "secret" && c.args[1] === "set");
      assert.equal(secretSetCalls.length, plan.secretNames.length);
      for (const call of secretSetCalls) {
        assert.equal(call.hasStdin, true);
        assert.ok(call.args.includes(GITHUB_REPO_SLUG));
        assert.ok(call.args.includes(GITHUB_DEPLOY_ENVIRONMENT));
        // 명령행 인자에 실제 시크릿 원문이 절대 들어가면 안 된다.
        for (const secretVal of Object.values(plan.secrets)) {
          assert.ok(!call.args.includes(secretVal));
        }
      }
    });
  });

  test("verifyCloudflareApiToken과 redactSensitiveText, parseAuthCliArgs는 안전하게 동작한다", async () => {
    const okCheck = await verifyCloudflareApiToken("tok", "cdead3a32be7e086fef1e1dac7c590fd", async () => ({
      ok: true,
      status: 200,
    }));
    assert.equal(okCheck.ok, true);

    const failCheck = await verifyCloudflareApiToken("tok", "cdead3a32be7e086fef1e1dac7c590fd", async () => ({
      ok: false,
      status: 401,
    }));
    assert.equal(failCheck.ok, false);
    assert.match(failCheck.reason, /401/u);

    assert.equal(extractScopedOnpodToken("\u001b[32mopk_abcdef12345678901234567890\u001b[0m"), "opk_abcdef12345678901234567890");

    const redacted = redactSensitiveText(
      `postgres://${["admin", "mySecretPw"].join(":")}@db.onpod.local:5432/app opk_1234567890abcdef op_u_1234567890abcdef Bearer secret_jwt_token`,
    );
    assert.ok(!redacted.includes("mySecretPw"));
    assert.ok(!redacted.includes("567890abcdef"));
    assert.ok(!redacted.includes("secret_jwt_token"));

    assert.equal(parseAuthCliArgs(["--", "--sync-github", "--dry-run"]).dryRun, true);
    assert.throws(() => parseAuthCliArgs(["--unknown-secret=sensitive_marker"]), (err) => {
      assert.ok(!err.message.includes("sensitive_marker"));
      return true;
    });
  });
});
