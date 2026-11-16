const { describe, test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

import {
  fetchActiveWorkerState,
  verifyLiveStaticWebSmoke,
  verifyPrebuiltStaticDist,
} from "./cloud-deploy-cloudflare.mjs";
import {
  REQUIRED_ONPOD_CONFIRM,
  applyOnpodEnvJson,
  inspectOnpodAppStatus,
  validateOnpodGateInputs,
} from "./cloud-deploy-onpod.mjs";
import {
  buildWorkflowDispatchFields,
  parseCloudDispatchArgs,
} from "./dispatch-cloud-deploy.mjs";
import {
  CANONICAL_CLOUD_DEPLOY_WORKFLOW,
  validateReleaseWorkflows,
} from "./release-workflow-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_SHA = "a".repeat(40);

function withTempRoot(fn) {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-cloud-runners-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validApiEnvJson() {
  const s32 = (p) => `${p}_`.padEnd(48, "z");
  return JSON.stringify({
    NODE_ENV: "production",
    DATABASE_RUNTIME_ROLE_MODE: "single-owner",
    AUTH_RATE_LIMIT_MODE: "single-instance-local",
    AUTH_EDGE_CLIENT_IP_ENABLED: "true",
    STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
    TRAFFIC_ANALYTICS_STORE: "d1",
    AUTH_SESSION_SECRET: s32("sess"),
    AUTH_STATE_SECRET: s32("state"),
    CLOUDFLARE_EDGE_ORIGIN_SECRET: s32("edge"),
    STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: s32("rt"),
    TRAFFIC_ANALYTICS_D1_RPC_TOKEN: s32("d1"),
  });
}

describe("클라우드 배포 실행기 및 정본 워크플로 정책 검증", () => {
  test("verifyPrebuiltStaticDist는 build-meta.json의 gitSha 일치 여부를 엄격히 검사한다", () => {
    withTempRoot((dir) => {
      mkdirSync(join(dir, "dist/.vite"), { recursive: true });
      writeFileSync(join(dir, "dist/index.html"), "<!doctype html>");
      writeFileSync(join(dir, "dist/.assetsignore"), "*.br\n");
      writeFileSync(join(dir, "dist/sw.js"), "// sw");
      writeFileSync(join(dir, "dist/.vite/build-meta.json"), JSON.stringify({ gitSha: SAMPLE_SHA }));

      const meta = verifyPrebuiltStaticDist(dir, SAMPLE_SHA);
      assert.equal(meta.gitSha, SAMPLE_SHA);
      assert.throws(() => verifyPrebuiltStaticDist(dir, "b".repeat(40)), /일치하지 않습니다/u);
    });
  });

  test("fetchActiveWorkerState와 verifyLiveStaticWebSmoke는 버전·RELEASE_SHA·격리 헤더·출처 인증을 검증한다", async () => {
    const state = await fetchActiveWorkerState("cdead3a32be7e086fef1e1dac7c590fd", "tok", "toonspectrum-web", async (url) => {
      if (url.endsWith("/deployments")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              deployments: [{ id: "dep-1", versions: [{ version_id: "f7c4540b-448e-4da4-86e2-ddc7a8642a42" }] }],
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            bindings: [{ name: "RELEASE_SHA", type: "plain_text", text: SAMPLE_SHA }],
          },
        }),
      };
    });
    assert.equal(state.activeVersionId, "f7c4540b-448e-4da4-86e2-ddc7a8642a42");
    assert.equal(state.activeReleaseSha, SAMPLE_SHA);

    const smoke = await verifyLiveStaticWebSmoke("https://www.toonstudio.cloud", async (url) => {
      if (url.endsWith("/studio")) {
        return {
          status: 200,
          headers: new Map([
            ["cross-origin-opener-policy", "same-origin"],
            ["cross-origin-embedder-policy", "credentialless"],
          ]),
        };
      }
      if (url.endsWith("/api/auth/providers")) {
        return { status: 200, headers: new Map() };
      }
      return {
        status: 200,
        headers: new Map(),
        json: async () => ({ edgeOriginAuth: "enforced" }),
      };
    });
    assert.equal(smoke.edgeOriginAuth, "enforced");
  });

  test("validateOnpodGateInputs와 applyOnpodEnvJson, inspectOnpodAppStatus는 명시 승인과 안전한 인자 배열을 강제한다", () => {
    assert.throws(
      () => validateOnpodGateInputs({ releaseSha: SAMPLE_SHA, confirmPhrase: "NONE", deployToken: "op_k_123" }),
      /명시 승인 문구/u,
    );
    assert.doesNotThrow(() =>
      validateOnpodGateInputs({
        releaseSha: SAMPLE_SHA,
        confirmPhrase: REQUIRED_ONPOD_CONFIRM,
        deployToken: "op_k_123",
      }),
    );

    const status = inspectOnpodAppStatus("toonstudio-api", {}, () =>
      `🆕 update banner\n${JSON.stringify({ name: "toonstudio-api", state: "running", image: `ghcr.io/blue45f/toonspectrum-core-api:${SAMPLE_SHA}`, plan: "free", free_tier: true })}`,
    );
    assert.equal(status.image, `ghcr.io/blue45f/toonspectrum-core-api:${SAMPLE_SHA}`);

    let capturedArgs = null;
    const applied = applyOnpodEnvJson("toonstudio-api", validApiEnvJson(), {}, (bin, args) => {
      assert.equal(bin, "onpod");
      capturedArgs = args;
      return "";
    });
    assert.equal(applied.appliedKeyCount, 11);
    assert.deepEqual(capturedArgs.slice(0, 4), ["app", "env", "set", "toonstudio-api"]);
    assert.ok(!capturedArgs.some((entry) => entry.startsWith("DATABASE_URL=")));
  });

  test("dispatch-cloud-deploy는 onpod 변경 시 승인 플래그를 요구하고 정확한 workflow_dispatch 필드를 만든다", () => {
    assert.deepEqual(parseCloudDispatchArgs([]).status, true);
    assert.deepEqual(parseCloudDispatchArgs(["--", "--status"]).status, true);
    assert.throws(() => parseCloudDispatchArgs(["--api-onpod"]), /--confirm-onpod/u);
    assert.throws(() => parseCloudDispatchArgs(["--sync-worker-secrets"]), /--web/u);

    const parsed = parseCloudDispatchArgs(["--web", "--api-onpod", "--confirm-onpod", `--sha=${SAMPLE_SHA}`]);
    const fields = buildWorkflowDispatchFields(parsed, SAMPLE_SHA);
    assert.deepEqual(fields, {
      ref: SAMPLE_SHA,
      deploy_web: "true",
      deploy_apex_redirect: "false",
      build_api_image: "false",
      deploy_api_onpod: "true",
      sync_api_env_onpod: "false",
      sync_worker_secrets: "false",
      onpod_confirm: REQUIRED_ONPOD_CONFIRM,
    });
  });

  test("정본 cloud-production-deploy.yml은 정책을 통과하되 안전 게이트 훼손이나 타 워크플로 퍼블리셔는 차단한다", () => {
    assert.deepEqual(validateReleaseWorkflows(ROOT), []);

    const canonicalSource = readFileSync(join(ROOT, CANONICAL_CLOUD_DEPLOY_WORKFLOW), "utf8");
    const pkgSource = readFileSync(join(ROOT, "package.json"), "utf8");

    // 1) push 자동 트리거 추가 시 차단
    withTempRoot((dir) => {
      mkdirSync(join(dir, ".github/workflows"), { recursive: true });
      writeFileSync(join(dir, "package.json"), pkgSource);
      const mutated = parse(canonicalSource);
      mutated.on.push = { branches: ["main"] };
      writeFileSync(join(dir, CANONICAL_CLOUD_DEPLOY_WORKFLOW), stringify(mutated));
      const issues = validateReleaseWorkflows(dir);
      assert.ok(issues.some((i) => i.includes("trigger exclusively on workflow_dispatch")));
    });

    // 2) environment: production-deploy 제거 시 차단
    withTempRoot((dir) => {
      mkdirSync(join(dir, ".github/workflows"), { recursive: true });
      writeFileSync(join(dir, "package.json"), pkgSource);
      const mutated = parse(canonicalSource);
      delete mutated.jobs["cloudflare-web"].environment;
      writeFileSync(join(dir, CANONICAL_CLOUD_DEPLOY_WORKFLOW), stringify(mutated));
      const issues = validateReleaseWorkflows(dir);
      assert.ok(issues.some((i) => i.includes("requires environment 'production-deploy'")));
    });

    // 3) 다른 워크플로에서 cloud-deploy-cloudflare.mjs / cloud-deploy-onpod.mjs 실행 시 차단
    withTempRoot((dir) => {
      mkdirSync(join(dir, ".github/workflows"), { recursive: true });
      writeFileSync(join(dir, "package.json"), pkgSource);
      writeFileSync(
        join(dir, ".github/workflows/rogue.yml"),
        stringify({
          on: "workflow_dispatch",
          jobs: {
            rogue: {
              "runs-on": "ubuntu-latest",
              steps: [
                { run: "node scripts/cloud-deploy-cloudflare.mjs --unit=static-web" },
                { run: "node scripts/cloud-deploy-onpod.mjs --update-image" },
              ],
            },
          },
        }),
      );
      const issues = validateReleaseWorkflows(dir);
      assert.equal(issues.length, 2);
      assert.ok(issues.some((i) => i.includes("forbidden (Cloudflare)")));
      assert.ok(issues.some((i) => i.includes("forbidden (Onpod)")));
    });
  });
});
