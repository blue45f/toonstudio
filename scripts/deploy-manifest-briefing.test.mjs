import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import { classifyDeployChangedFiles } from "./lib/deploy-change-scope.mjs";
import {
  DEPLOY_BRIEFING_SCHEMA_VERSION,
  DEPLOY_MANIFEST_PATH,
  DEPLOY_MANIFEST_SCHEMA_VERSION,
  REQUIRED_ONPOD_CONFIRM_PHRASE,
  SAFE_LOCAL_OAUTH_WEB_COMMAND,
  SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
  WORKFLOW_DEPLOY_MODES,
  assertSafeDeployArguments,
  buildCloudflareTokenConflictGuidance,
  buildCrossLlmDeployBriefing,
  buildSelfHealingExecPath,
  formatReleaseStepSummary,
  inspectForbiddenDeployArguments,
  loadDeployManifest,
  resolveWorkflowModePlan,
  validateDeployManifest,
} from "./lib/deploy-manifest-briefing.mjs";
import {
  buildWorkflowDispatchFields,
  parseCloudDispatchArgs,
  printCloudStatus,
} from "./dispatch-cloud-deploy.mjs";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA_TARGET = "a".repeat(40);
const SHA_BASE = "b".repeat(40);
const PREV_SHA = "c".repeat(40);
const WORKER_VERSION_NEW = "f7c4540b-448e-4da4-86e2-ddc7a8642a42";
const WORKER_VERSION_PREV = "8d9e24ee-1111-4222-8333-444455556666";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-deploy-manifest-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("1. 기계 판독용 단일 정본 deploy/DEPLOY_MANIFEST.json 검증", () => {
  test("정본 매니페스트는 현역·퇴역·금지 명령·승인 정책·mode 프리셋 계약을 100% 충족하고 시크릿을 포함하지 않는다", () => {
    const manifest = loadDeployManifest(ROOT);
    assert.equal(manifest.schemaVersion, DEPLOY_MANIFEST_SCHEMA_VERSION);
    assert.deepEqual(validateDeployManifest(manifest), []);

    assert.equal(manifest.activeInfra["cloudflare-static"].url, "https://www.toonstudio.cloud");
    assert.equal(manifest.activeInfra["onpod-seoul-api"].url, "https://toonstudio-api.onpod.ai");
    assert.equal(manifest.activeInfra["onpod-seoul-db"].database, "toonstudio-db");

    const retiredIds = manifest.retiredInfra.map((item) => item.id);
    for (const id of ["vercel", "render", "supabase"]) {
      assert.ok(retiredIds.includes(id), `retiredInfra 누락: ${id}`);
    }

    const forbiddenCommands = manifest.forbiddenCommands.map((item) => item.command);
    for (const cmd of [
      "onpod app deploy --attach-db",
      "onpod app rollback",
      "onpod app rm",
      "onpod db rm",
    ]) {
      assert.ok(forbiddenCommands.includes(cmd), `forbiddenCommands 누락: ${cmd}`);
    }

    assert.equal(manifest.approvalPolicy.standingApprovalPath, "deploy/STANDING_APPROVAL.json");
    assert.ok(existsSync(join(ROOT, manifest.approvalPolicy.standingApprovalPath)));
    assert.deepEqual(manifest.workflow.modes, [...WORKFLOW_DEPLOY_MODES]);

    const raw = readFileSync(join(ROOT, DEPLOY_MANIFEST_PATH), "utf8");
    assert.doesNotMatch(raw, /(?:\boracle\b|\boci\b|deploy\/oci)/iu);
    assert.doesNotMatch(raw, /postgres(?:ql)?:\/\/[^:/@\s]+:[^@\s]+@/iu);
  });

  test("훼손되거나 시크릿이 혼입된 매니페스트는 validateDeployManifest에서 즉시 거부된다", () => {
    const valid = loadDeployManifest(ROOT);
    const broken = structuredClone(valid);
    broken.retiredInfra = [{ id: "vercel" }];
    broken.forbiddenCommands = [];
    broken.commands.leaked = "op_u_synthetic_leaked_token_1234567890";

    const issues = validateDeployManifest(broken);
    assert.ok(issues.some((i) => i.includes("render")));
    assert.ok(issues.some((i) => i.includes("supabase")));
    assert.ok(issues.some((i) => i.includes("--attach-db")));
    assert.ok(issues.some((i) => i.includes("민감 자격증명")));
  });
});

describe("2. deploy:doctor -- --json 크로스-LLM JSON 브리핑 & nextExactCommand 검증", () => {
  const greenGate = {
    sha: SHA_TARGET,
    runId: 777,
    runAttempt: 1,
    runStatus: "success",
    gates: { core: "success", verify: "success" },
    allGreen: true,
  };
  const readyGhEnv = {
    ghReady: true,
    environmentExists: true,
    configuredVariables: ["CLOUDFLARE_ACCOUNT_ID", "CORE_API_ORIGIN"],
    configuredSecrets: ["CLOUDFLARE_API_TOKEN", "ONPOD_DEPLOY_TOKEN"],
  };

  test("--json은 읽기 전용 진단에서만 허용되며 printCloudStatus가 단일 JSON 객체를 출력하고 시크릿을 절대 노출하지 않는다", async () => {
    const parsed = parseCloudDispatchArgs(["--status", "--check-local-oauth", "--json"]);
    assert.equal(parsed.status, true);
    assert.equal(parsed.localOAuth, true);
    assert.equal(parsed.json, true);

    for (const flag of ["--web", "--smart", "--dry-run", "--mode=web-only"]) {
      assert.throws(() => parseCloudDispatchArgs(["--json", flag]), /읽기 전용/u);
    }

    const fakeShellSecret = "cf_secret_shell_token_must_never_leak_9876543210";
    const lines = [];
    const briefing = await printCloudStatus({
      rootDir: ROOT,
      execEnv: { PATH: process.env.PATH, CLOUDFLARE_API_TOKEN: fakeShellSecret },
      targetSha: SHA_TARGET,
      baseSha: SHA_BASE,
      localOAuth: true,
      json: true,
      log: (line) => lines.push(line),
      resolveOriginMainShaImpl: () => SHA_TARGET,
      inspectGitHubEnvironmentStatusImpl: () => ({
        ghReady: true,
        environmentExists: true,
        configuredVariables: ["CLOUDFLARE_ACCOUNT_ID"],
        configuredSecrets: ["ONPOD_DEPLOY_TOKEN"],
      }),
      inspectCommitRequiredGatesImpl: () => greenGate,
      inspectDeployChangeScopeImpl: () => ({
        unknownScope: false,
        baseSha: SHA_BASE,
        baseShaSource: "explicit-base-sha",
        diffSource: "git-diff",
        scope: classifyDeployChangedFiles(["apps/web/src/domains/home/HomePage.tsx"]),
      }),
      resolveLocalCloudflareAccountIdImpl: () => "1".repeat(32),
      inspectLocalCloudflareOAuthImpl: async () => ({ auth: "oauth", workerStatus: 200, r2Status: 200 }),
      verifyCloudflareApiTokenImpl: async () => ({ ok: false, status: 401, reason: "HTTP 401" }),
    });

    assert.equal(lines.length, 1);
    const reparsed = JSON.parse(lines[0]);
    assert.equal(reparsed.schemaVersion, DEPLOY_BRIEFING_SCHEMA_VERSION);
    assert.equal(briefing.activeInfra["cloudflare-static"].url, "https://www.toonstudio.cloud");
    assert.equal(briefing.activeInfra["onpod-seoul-api"].url, "https://toonstudio-api.onpod.ai");
    assert.equal(briefing.activeInfra["onpod-seoul-db"].database, "toonstudio-db");
    assert.equal(briefing.changeScope.webChanged, true);
    assert.equal(briefing.changeScope.apiChanged, false);
    assert.equal(briefing.readiness.localOAuth.shellApiTokenPresent, true);
    assert.equal(briefing.readiness.localOAuth.shellApiTokenValid, false);
    assert.equal(briefing.readiness.localOAuth.shellTokenConflict, true);
    assert.equal(briefing.nextExactCommand, SAFE_LOCAL_OAUTH_WEB_COMMAND);
    assert.equal(briefing.workflowDispatchCommand, "gh workflow run cloud-production-deploy.yml -f mode=web-only");
    assert.ok(!lines[0].includes(fakeShellSecret), "셸 토큰 원문이 JSON에 노출되면 안 된다");
    assert.ok(!lines[0].includes("1".repeat(32)), "계정 ID 원문이 JSON에 노출되면 안 된다");
  });

  test("변경 영역과 CI 상태에 따라 nextExactCommand 및 workflowDispatchCommand를 정확히 결정한다", () => {
    const webCloud = buildCrossLlmDeployBriefing({
      rootDir: ROOT,
      originMainSha: SHA_TARGET,
      gateInfo: greenGate,
      ghEnv: readyGhEnv,
      scopeInfo: {
        unknownScope: false,
        baseSha: SHA_BASE,
        baseShaSource: "explicit-base-sha",
        diffSource: "git-diff",
        scope: classifyDeployChangedFiles(["apps/web/src/app/App.tsx"]),
      },
    });
    assert.equal(webCloud.readyToDeploy, true);
    assert.equal(webCloud.nextExactCommand, "pnpm run deploy:cloud -- --web --watch");
    assert.equal(webCloud.workflowDispatchCommand, "gh workflow run cloud-production-deploy.yml -f mode=web-only");

    const apiOnly = buildCrossLlmDeployBriefing({
      rootDir: ROOT,
      originMainSha: SHA_TARGET,
      gateInfo: greenGate,
      ghEnv: readyGhEnv,
      scopeInfo: {
        unknownScope: false,
        baseSha: SHA_BASE,
        baseShaSource: "explicit-base-sha",
        diffSource: "git-diff",
        scope: classifyDeployChangedFiles(["apps/api/src/modules/auth/auth.controller.ts"]),
      },
    });
    assert.equal(apiOnly.nextExactCommand, "pnpm run deploy:cloud -- --api-image --watch");
    assert.equal(
      apiOnly.workflowDispatchCommand,
      `gh workflow run cloud-production-deploy.yml -f mode=api-only -f onpod_confirm=${REQUIRED_ONPOD_CONFIRM_PHRASE}`,
    );

    const mixed = buildCrossLlmDeployBriefing({
      rootDir: ROOT,
      originMainSha: SHA_TARGET,
      gateInfo: greenGate,
      ghEnv: readyGhEnv,
      scopeInfo: {
        unknownScope: false,
        baseSha: SHA_BASE,
        baseShaSource: "explicit-base-sha",
        diffSource: "git-diff",
        scope: classifyDeployChangedFiles([
          "apps/web/src/app/App.tsx",
          "apps/api/src/main.ts",
        ]),
      },
    });
    assert.equal(mixed.workflowDispatchCommand, "gh workflow run cloud-production-deploy.yml -f mode=smart-release");
    assert.equal(mixed.nextExactCommand, "pnpm run deploy:cloud -- --web --api-image --watch");

    const docsOnly = buildCrossLlmDeployBriefing({
      rootDir: ROOT,
      originMainSha: SHA_TARGET,
      gateInfo: greenGate,
      ghEnv: readyGhEnv,
      scopeInfo: {
        unknownScope: false,
        baseSha: SHA_BASE,
        baseShaSource: "explicit-base-sha",
        diffSource: "git-diff",
        scope: classifyDeployChangedFiles(["docs/README.md"]),
      },
    });
    assert.equal(docsOnly.deploymentNeeded, false);
    assert.equal(docsOnly.nextExactCommand, "pnpm run deploy:status:origin");
    assert.equal(docsOnly.workflowDispatchCommand, null);

    const redCi = buildCrossLlmDeployBriefing({
      rootDir: ROOT,
      originMainSha: SHA_TARGET,
      gateInfo: { ...greenGate, gates: { core: "success", verify: "in_progress" }, allGreen: false },
      ghEnv: readyGhEnv,
      scopeInfo: { unknownScope: true, baseSha: "", baseShaSource: "unavailable", diffSource: "unavailable", scope: null },
    });
    assert.equal(redCi.readyToDeploy, false);
    assert.equal(redCi.nextExactCommand, "pnpm run deploy:doctor -- --json");
    assert.equal(redCi.workflowDispatchCommand, "gh workflow run cloud-production-deploy.yml -f mode=dry-run");
  });
});

describe("3. GitHub Actions cloud-production-deploy.yml 단일 mode 프리셋 및 요약 검증", () => {
  test("워크플로 최상단 입력으로 mode choice 5종이 선언되고 기존 boolean 입력과 100% 하위 호환된다", () => {
    const workflow = parseYaml(
      readFileSync(join(ROOT, ".github/workflows/cloud-production-deploy.yml"), "utf8"),
    );
    const inputs = workflow.on.workflow_dispatch.inputs;
    const inputNames = Object.keys(inputs);

    assert.equal(inputNames[0], "mode");
    assert.equal(inputs.mode.type, "choice");
    assert.equal(inputs.mode.default, "custom");
    assert.deepEqual(inputs.mode.options, [...WORKFLOW_DEPLOY_MODES]);

    for (const legacyBool of [
      "deploy_web",
      "deploy_apex_redirect",
      "build_api_image",
      "deploy_api_onpod",
      "sync_api_env_onpod",
      "sync_worker_secrets",
    ]) {
      assert.equal(inputs[legacyBool].type, "boolean");
      assert.equal(inputs[legacyBool].default, false);
    }

    assert.ok(workflow.jobs["release-summary"], "통합 스모크·요약 잡(release-summary)이 필요합니다");
    const summarySteps = workflow.jobs["release-summary"].steps ?? [];
    assert.ok(summarySteps.some((step) => String(step.run ?? "").includes("verify-production-post-deploy-smoke.mjs")));
    assert.ok(summarySteps.some((step) => String(step.run ?? "").includes("--write-step-summary")));

    const modeFields = buildWorkflowDispatchFields(
      parseCloudDispatchArgs(["--mode=smart-release"]),
      SHA_TARGET,
    );
    assert.equal(modeFields.mode, "smart-release");
    assert.equal(modeFields.ref, SHA_TARGET);
  });

  test("resolveWorkflowModePlan은 5종 mode와 명시 승인·충돌 차단을 정확히 계산한다", () => {
    const customWeb = resolveWorkflowModePlan({ mode: "custom", deployWeb: true });
    assert.equal(customWeb.effectiveDeployWeb, true);
    assert.equal(customWeb.anyLiveDeploy, true);

    const dryRun = resolveWorkflowModePlan({ mode: "dry-run" });
    assert.equal(dryRun.anyLiveDeploy, false);
    assert.equal(dryRun.smartNoop, false);
    assert.throws(() => resolveWorkflowModePlan({ mode: "dry-run", deployWeb: true }), /mode=dry-run/u);

    const webOnly = resolveWorkflowModePlan({ mode: "web-only" });
    assert.equal(webOnly.effectiveDeployWeb, true);
    assert.equal(webOnly.effectiveBuildApiImage, false);
    assert.throws(() => resolveWorkflowModePlan({ mode: "web-only", buildApiImage: true }), /mode=web-only/u);

    const apiImageOnly = resolveWorkflowModePlan({ mode: "api-only", onpodConfirm: "NONE" });
    assert.equal(apiImageOnly.effectiveBuildApiImage, true);
    assert.equal(apiImageOnly.effectiveDeployApiOnpod, false);

    const apiFull = resolveWorkflowModePlan({
      mode: "api-only",
      onpodConfirm: REQUIRED_ONPOD_CONFIRM_PHRASE,
    });
    assert.equal(apiFull.effectiveBuildApiImage, true);
    assert.equal(apiFull.effectiveDeployApiOnpod, true);
    assert.throws(() => resolveWorkflowModePlan({ mode: "api-only", deployWeb: true }), /mode=api-only/u);

    const smartWeb = resolveWorkflowModePlan({
      mode: "smart-release",
      scopeInfo: {
        unknownScope: false,
        scope: classifyDeployChangedFiles(["apps/web/src/domains/creator/Brush.tsx"]),
      },
    });
    assert.equal(smartWeb.effectiveDeployWeb, true);
    assert.equal(smartWeb.effectiveBuildApiImage, false);
    assert.equal(smartWeb.smartNoop, false);

    const smartNoop = resolveWorkflowModePlan({
      mode: "smart-release",
      scopeInfo: {
        unknownScope: false,
        scope: classifyDeployChangedFiles(["docs/README.md"]),
      },
    });
    assert.equal(smartNoop.smartNoop, true);
    assert.equal(smartNoop.anyLiveDeploy, false);

    assert.throws(
      () => resolveWorkflowModePlan({ mode: "smart-release", scopeInfo: { unknownScope: true, scope: null } }),
      /변경 범위를 확인하지 못했습니다/u,
    );
  });

  test("formatReleaseStepSummary와 CLI --write-step-summary는 webSha·apiSha·workerVersionId 및 안전 롤백 명령만 기록한다", () => {
    const markdown = formatReleaseStepSummary({
      mode: "smart-release",
      releaseSha: SHA_TARGET,
      webSha: SHA_TARGET,
      apiSha: SHA_TARGET,
      workerVersionId: WORKER_VERSION_NEW,
      previousWorkerVersionId: WORKER_VERSION_PREV,
      previousApiImage: `ghcr.io/blue45f/toonspectrum-core-api:${PREV_SHA}`,
      smokeStatus: "success",
    });

    assert.match(markdown, new RegExp(`\\*\\*webSha\\*\\* \\| \`${SHA_TARGET}\``, "u"));
    assert.match(markdown, new RegExp(`\\*\\*apiSha\\*\\* \\| \`${SHA_TARGET}\``, "u"));
    assert.match(markdown, new RegExp(`\\*\\*workerVersionId\\*\\* \\| \`${WORKER_VERSION_NEW}\``, "u"));
    assert.match(markdown, new RegExp(`wrangler versions deploy ${WORKER_VERSION_PREV}@100 --name toonspectrum-web --yes`, "u"));
    assert.match(markdown, new RegExp(`onpod app update toonstudio-api --image ghcr\\.io/blue45f/toonspectrum-core-api:${PREV_SHA}`, "u"));
    assert.doesNotMatch(markdown, /onpod app rollback|--attach-db/u);

    withTempDir((dir) => {
      const outputFile = join(dir, "github_output");
      const summaryFile = join(dir, "github_summary.md");
      const anyLive = execFileSync(
        process.execPath,
        [join(ROOT, "scripts/lib/deploy-manifest-briefing.mjs"), "--resolve-workflow-plan"],
        {
          env: {
            PATH: process.env.PATH,
            INPUT_MODE: "web-only",
            RELEASE_SHA: SHA_TARGET,
            GITHUB_OUTPUT: outputFile,
          },
          encoding: "utf8",
        },
      ).trim();
      assert.equal(anyLive, "true");
      const outputText = readFileSync(outputFile, "utf8");
      assert.match(outputText, /effective_deploy_web=true/u);
      assert.match(outputText, /resolved_mode=web-only/u);

      execFileSync(
        process.execPath,
        [join(ROOT, "scripts/lib/deploy-manifest-briefing.mjs"), "--write-step-summary"],
        {
          env: {
            PATH: process.env.PATH,
            RESOLVED_MODE: "web-only",
            RELEASE_SHA: SHA_TARGET,
            WEB_SHA: SHA_TARGET,
            WORKER_VERSION_ID: WORKER_VERSION_NEW,
            PREVIOUS_WORKER_VERSION_ID: WORKER_VERSION_PREV,
            SMOKE_STATUS: "success",
            GITHUB_STEP_SUMMARY: summaryFile,
          },
          encoding: "utf8",
        },
      );
      const summaryText = readFileSync(summaryFile, "utf8");
      assert.match(summaryText, /webSha/u);
      assert.match(summaryText, /apiSha/u);
      assert.match(summaryText, /workerVersionId/u);
    });
  });
});

describe("4. 로컬 PATH·OAuth 자가치유 및 위험/퇴역 명령 Fail-Closed 교정 가드 검증", () => {
  test("buildSelfHealingExecPath는 node·pnpm·onpod·Homebrew 경로를 중복 없이 선두에 배치한다", () => {
    const healed = buildSelfHealingExecPath({
      execPath: "/Users/example/.nvm/versions/node/v24.22.1/bin/node",
      env: { PATH: "/usr/bin:/bin:/opt/homebrew/bin", HOME: "/Users/example" },
    });
    const parts = healed.path.split(":");
    assert.equal(parts[0], "/Users/example/.nvm/versions/node/v24.22.1/bin");
    assert.ok(parts.includes("/Users/example/.local/share/pnpm"));
    assert.ok(parts.includes("/Users/example/.onpod/bin"));
    assert.ok(parts.includes("/opt/homebrew/bin"));
    assert.equal(parts.filter((p) => p === "/opt/homebrew/bin").length, 1);
  });

  test("퇴역 Render/Vercel 및 금지 --attach-db·onpod app rollback 인자는 즉시 fail-closed 차단되고 서울 onpod 교정 명령을 출력한다", () => {
    const cases = [
      [["--attach-db"], "FORBIDDEN_ONPOD_ATTACH_DB"],
      [["onpod", "app", "rollback"], "FORBIDDEN_ONPOD_ROLLBACK"],
      [["--rollback"], "FORBIDDEN_ONPOD_ROLLBACK"],
      [["onpod", "db", "rm", "toonstudio-db"], "FORBIDDEN_ONPOD_DESTRUCTIVE"],
      [["--render"], "RETIRED_PROVIDER_RENDER"],
      [["--profile=render-legacy"], "RETIRED_PROVIDER_RENDER"],
      [["--vercel"], "RETIRED_PROVIDER_VERCEL"],
      [["--core-origin=https://toonspectrum-core-api.onrender.com"], "RETIRED_ORIGIN_RENDER"],
    ];

    for (const [args, expectedCode] of cases) {
      const violation = inspectForbiddenDeployArguments(args);
      assert.equal(violation?.code, expectedCode);
      assert.throws(
        () => assertSafeDeployArguments(args, { context: "deploy:web" }),
        (error) => {
          assert.match(error.message, /fail-closed/u);
          assert.ok(error.message.includes(SAFE_ONPOD_IMAGE_UPDATE_COMMAND));
          return true;
        },
      );
      assert.throws(
        () => parseCloudDispatchArgs(args),
        (error) => {
          assert.ok(error.message.includes(SAFE_ONPOD_IMAGE_UPDATE_COMMAND));
          return true;
        },
      );
    }

    const guidance = buildCloudflareTokenConflictGuidance({
      hasShellToken: true,
      useLocalOAuth: false,
      localOAuthReady: true,
      accountIdConfigured: true,
    });
    assert.equal(guidance.conflictDetected, true);
    assert.equal(guidance.fallbackCommand, SAFE_LOCAL_OAUTH_WEB_COMMAND);
    assert.ok(guidance.lines.some((line) => line.includes(SAFE_LOCAL_OAUTH_WEB_COMMAND)));
  });

  test("deploy-cloudflare-static.mjs는 위험 인자·퇴역 Render 원점을 사전 차단하고, 셸 토큰 충돌 시 OAuth 폴백 및 안내를 제공한다", () => {
    withTempDir((dir) => {
      const deployScript = join(ROOT, "scripts/deploy-cloudflare-static.mjs");
      const commandLog = join(dir, "commands.ndjson");
      const preload = join(dir, "mock.cjs");
      writeFileSync(
        preload,
        `const { appendFileSync } = require("node:fs");
const cp = require("node:child_process");
function log(e) { appendFileSync(process.env.COMMAND_LOG, JSON.stringify(e) + "\\n"); }
cp.execFileSync = (bin, args) => {
  log({ bin, args });
  if (bin === "gh") {
    const p = args[1];
    const sha = process.env.FAKE_HEAD;
    if (p.endsWith("/git/ref/heads/main")) return sha;
    if (p.includes("/actions/workflows/ci.yml/runs?")) return JSON.stringify([{ workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", head_sha: sha, head_branch: "main", event: "push", run_number: 3, run_attempt: 1, status: "completed", conclusion: "success" }] }]);
    if (p.endsWith("/actions/runs/7/attempts/1/jobs?per_page=100")) return JSON.stringify([{ jobs: ["core", "verify"].map(name => ({ name, head_sha: sha, run_id: 7, run_attempt: 1, status: "completed", conclusion: "success" })) }]);
  }
  if (bin === "git") {
    if (args.join(" ") === "ls-remote --exit-code origin refs/heads/main") return process.env.FAKE_HEAD + "\\trefs/heads/main\\n";
    if (args.join(" ") === "branch --show-current") return "main\\n";
    if (args.join(" ") === "status --porcelain") return "";
    if (args.join(" ") === "rev-parse HEAD") return process.env.FAKE_HEAD + "\\n";
  }
  throw new Error("Unexpected execFileSync: " + bin);
};
let call = 0;
cp.spawnSync = (bin, args, opts) => {
  log({ bin, args, hasStaticToken: Boolean(opts.env.CLOUDFLARE_API_TOKEN) });
  return { status: ++call === Number(process.env.FAKE_FAIL_CALL) ? 17 : 0 };
};
require("node:module").syncBuiltinESMExports();
`,
      );
      mkdirSync(join(dir, "deploy/cloudflare-static"), { recursive: true });
      writeFileSync(
        join(dir, "deploy/cloudflare-static/STANDING_APPROVAL.json"),
        JSON.stringify({ scope: "cloudflare-static-production", grantedAt: "2026-10-13" }),
      );

      // 1) 위험 인자 및 퇴역 Render 원점은 프로세스 호출 0회로 즉시 fail-closed 차단
      for (const [args, envOverride] of [
        [["--production", "--attach-db"], {}],
        [["--production", "onpod", "app", "rollback"], {}],
        [["--production"], { CLOUDFLARE_CORE_API_ORIGIN: "https://toonspectrum-core-api.onrender.com" }],
      ]) {
        writeFileSync(commandLog, "");
        const res = spawnSync(process.execPath, ["--require", preload, deployScript, ...args], {
          cwd: dir,
          env: {
            PATH: process.env.PATH,
            COMMAND_LOG: commandLog,
            FAKE_HEAD: SHA_TARGET,
            CLOUDFLARE_CORE_API_ORIGIN: "https://toonstudio-api.onpod.ai",
            ...envOverride,
          },
          encoding: "utf8",
        });
        assert.equal(res.status, 1);
        assert.ok(res.stderr.includes(SAFE_ONPOD_IMAGE_UPDATE_COMMAND));
        assert.equal(readFileSync(commandLog, "utf8").trim(), "");
      }

      // 2) 자리표시자 셸 CLOUDFLARE_API_TOKEN + 로컬 계정 ID 존재 시 로컬 OAuth로 자동 격리 폴백
      writeFileSync(commandLog, "");
      const placeholderFallback = spawnSync(process.execPath, ["--require", preload, deployScript, "--production"], {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          COMMAND_LOG: commandLog,
          FAKE_HEAD: SHA_TARGET,
          CLOUDFLARE_CORE_API_ORIGIN: "https://toonstudio-api.onpod.ai",
          CLOUDFLARE_ACCOUNT_ID: "1".repeat(32),
          CLOUDFLARE_API_TOKEN: "placeholder-expired-token",
          TOONSPECTRUM_DEPLOY_LEDGER_DIR: join(dir, "ledger-placeholder"),
        },
        encoding: "utf8",
      });
      assert.equal(placeholderFallback.status, 0);
      assert.match(placeholderFallback.stdout, /로컬 Wrangler OAuth로 자동 격리 폴백/u);
      const placeholderCmds = readFileSync(commandLog, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.bin === "pnpm");
      assert.equal(placeholderCmds[4].hasStaticToken, false);
      assert.ok(placeholderCmds[4].args.includes("--wrangler-oauth"));
      assert.equal(placeholderCmds[5].hasStaticToken, false);

      // 3) 셸 토큰으로 게시 단계 실패 시 원문 비노출 + 명확한 OAuth 폴백 안내 출력
      writeFileSync(commandLog, "");
      const failedWithShellToken = spawnSync(process.execPath, ["--require", preload, deployScript, "--production"], {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          COMMAND_LOG: commandLog,
          FAKE_HEAD: SHA_TARGET,
          CLOUDFLARE_CORE_API_ORIGIN: "https://toonstudio-api.onpod.ai",
          CLOUDFLARE_API_TOKEN: "expired_secret_marker_must_not_appear",
          FAKE_FAIL_CALL: "5",
          TOONSPECTRUM_DEPLOY_LEDGER_DIR: join(dir, "ledger-fail"),
        },
        encoding: "utf8",
      });
      assert.equal(failedWithShellToken.status, 17);
      assert.ok(failedWithShellToken.stderr.includes(SAFE_LOCAL_OAUTH_WEB_COMMAND));
      assert.ok(!failedWithShellToken.stderr.includes("expired_secret_marker_must_not_appear"));
    });
  });
});

describe("5. 루트 AGENTS.md 5줄 배포 요약 카드 및 모든 LLM 어댑터 일관성 검증", () => {
  test("AGENTS.md 8절 최상단에 5줄 고정 LLM 공통 배포 요약 카드가 존재하고 어댑터들은 루트 문서를 참조만 한다", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    const section8Index = agents.indexOf("## 8. 운영 및 배포 정책");
    assert.ok(section8Index >= 0);
    const cardHeaderIndex = agents.indexOf("### LLM 공통 배포 요약 카드", section8Index);
    assert.ok(cardHeaderIndex > section8Index);
    assert.ok(cardHeaderIndex - section8Index < 40, "요약 카드는 8절 최상단에 위치해야 합니다");

    const cardBlock = agents.slice(cardHeaderIndex, agents.indexOf("\n\n", cardHeaderIndex));
    const numberedLines = cardBlock.split("\n").filter((line) => /^\d+\.\s+/u.test(line));
    assert.equal(numberedLines.length, 5, "LLM 공통 배포 요약 카드는 5줄 고정이어야 합니다");
    assert.match(cardBlock, /DEPLOY_MANIFEST\.json/u);
    assert.match(cardBlock, /pnpm run deploy:doctor -- --json/u);
    assert.match(cardBlock, /gh workflow run cloud-production-deploy\.yml -f mode=smart-release/u);
    assert.match(cardBlock, /onpod app deploy --attach-db/u);
    assert.match(cardBlock, /onpod app rollback/u);

    for (const adapter of [
      "CLAUDE.md",
      "GEMINI.md",
      ".github/copilot-instructions.md",
      ".cursor/rules/toonstudio.mdc",
      ".opencode/agent/toonstudio.md",
    ]) {
      const content = readFileSync(join(ROOT, adapter), "utf8");
      assert.ok(content.includes("AGENTS.md"), `${adapter}는 AGENTS.md를 참조해야 합니다`);
      assert.ok(!content.includes("DEPLOY_MANIFEST.json"), `${adapter}는 루트 정책을 복제하지 않고 참조해야 합니다`);
    }
  });
});
