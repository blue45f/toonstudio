import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = join(repositoryRoot, "scripts/deploy-cloudflare-static.mjs");
const temporaryDirectories = [];

const approvedSha = "abcdef0123456789abcdef0123456789abcdef01";

function createFakeProcesses() {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-cloudflare-deploy-"));
  temporaryDirectories.push(directory);
  const commandLog = join(directory, "commands.ndjson");
  const preload = join(directory, "mock-processes.cjs");
  writeFileSync(
    preload,
    `const { appendFileSync } = require("node:fs");
const childProcess = require("node:child_process");
function log(entry) { appendFileSync(process.env.COMMAND_LOG, JSON.stringify(entry) + "\\n"); }
let tipReads = 0;
childProcess.execFileSync = (executable, args) => {
  log({ executable, args });
  if (executable === "gh") {
    if (process.env.FAKE_GH_FAILURE) throw new Error("GitHub unavailable");
    const path = args[1];
    const sha = process.env.FAKE_HEAD;
    if (path.endsWith("/git/ref/heads/main")) return process.env.FAKE_CANONICAL_HEAD ?? sha;
    if (path.includes("/actions/workflows/ci.yml/runs?")) {
      return JSON.stringify([{ workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", head_sha: sha, head_branch: "main", event: "push", run_number: 3, run_attempt: 1, status: "completed", conclusion: "success" }] }]);
    }
    if (path.endsWith("/actions/runs/7/attempts/1/jobs?per_page=100")) {
      return JSON.stringify([{ jobs: ["core", "verify"].map(name => ({ name, head_sha: sha, run_id: 7, run_attempt: 1, status: "completed", conclusion: process.env.FAKE_GATE_RESULT ?? "success" })) }]);
    }
    throw new Error("Unexpected GitHub API call");
  }
  if (executable !== "git") throw new Error("Unexpected executable");
  if (args.join(" ") === "ls-remote --exit-code origin refs/heads/main") {
    if (process.env.FAKE_ORIGIN_OFFLINE) throw new Error("Origin unavailable");
    ++tipReads;
    const current = tipReads >= Number(process.env.FAKE_ADVANCE_ON_READ) ? "b".repeat(40) : process.env.FAKE_HEAD;
    return current + "\\trefs/heads/main\\n";
  }
  if (args.join(" ") === "branch --show-current") return process.env.FAKE_BRANCH + "\\n";
  if (args.join(" ") === "status --porcelain") return process.env.FAKE_STATUS;
  if (args.join(" ") === "rev-parse HEAD") return process.env.FAKE_HEAD + "\\n";
  throw new Error("Unexpected git command");
};
let call = 0;
childProcess.spawnSync = (executable, args, options) => {
  log({ executable, args, catalogSource: options.env.VITE_CATALOG_SOURCE ?? null,
    staticAuth: !!options.env.CLOUDFLARE_API_TOKEN, debugLog: options.env.WRANGLER_WRITE_LOGS ?? null });
  if (executable !== "pnpm") throw new Error("Unexpected executable");
  return { status: ++call === Number(process.env.FAKE_FAIL_CALL) ? 17 : 0 };
};
for (const name of ["spawn", "exec", "execSync", "execFile", "fork"]) {
  childProcess[name] = () => { throw new Error("Unmocked process call: " + name); };
}
require("node:module").syncBuiltinESMExports();
`,
  );
  return { directory, preload, commandLog };
}

function runDeploy(environment = {}, args = [], files = {}, customDirectory = null) {
  const fake = customDirectory ?? createFakeProcesses();
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(fake.directory, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const result = spawnSync(process.execPath, ["--require", fake.preload, deployScript, ...args], {
    cwd: fake.directory,
    env: {
      COMMAND_LOG: fake.commandLog,
      FAKE_BRANCH: "main",
      FAKE_STATUS: "",
      FAKE_HEAD: approvedSha,
      CLOUDFLARE_CORE_API_ORIGIN: "https://core.example.test",
      ...environment,
    },
    encoding: "utf8",
  });
  const allCommands = existsSync(fake.commandLog)
    ? readFileSync(fake.commandLog, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    : [];
  return {
    result,
    allCommands,
    commands: allCommands.filter((command) => command.executable === "pnpm"),
    directory: fake.directory,
  };
}

function runProduction(environment = {}) {
  return runDeploy({
    TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-static-production",
    TOONSPECTRUM_APPROVED_MAIN_SHA: approvedSha,
    ...environment,
  }, ["--production"]);
}

const standingApprovalFile = {
  "deploy/cloudflare-static/STANDING_APPROVAL.json": JSON.stringify({
    scope: "cloudflare-static-production",
    grantedBy: "test-owner",
    grantedAt: "2026-10-13",
  }),
};

function runStandingProduction(environment = {}, files = standingApprovalFile) {
  const merged = { ...environment };
  delete merged.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL;
  delete merged.TOONSPECTRUM_APPROVED_MAIN_SHA;
  return runDeploy(merged, ["--production"], files);
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("Cloudflare static deployment origin contract", () => {
  it("passes validated workload origins to the Wrangler dry-run", () => {
    const { result, commands } = runDeploy({
      CLOUDFLARE_PUBLIC_READ_API_ORIGINS:
        "https://catalog-a.example.test,https://catalog-b.example.test",
      CLOUDFLARE_SOCIAL_API_ORIGIN: "https://social.example.test",
      CLOUDFLARE_PLAYGROUND_API_ORIGIN: "https://playground.example.test",
      CLOUDFLARE_ADMIN_API_ORIGIN: "https://admin.example.test",
      CLOUDFLARE_REALTIME_API_ORIGIN: "https://realtime.example.test",
      CLOUDFLARE_LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    });

    expect(result.status).toBe(0);
    expect(commands).toHaveLength(6);
    expect(commands[1]).toMatchObject({ catalogSource: "static" });
    expect(commands[2].args).toEqual(["run", "prepare:cloudflare-static-assets"]);
    expect(commands[3].args).toEqual(["exec", "node", "scripts/verify-static-service-worker.mjs"]);
    expect(commands[4].args).toEqual(["run", "sync:cloudflare-r2-assets:dry-run"]);
    expect(commands[5].args).toEqual(expect.arrayContaining([
      "exec",
      "wrangler",
      "deploy",
      "--dry-run",
      "CORE_API_ORIGIN:https://core.example.test",
      "PUBLIC_READ_API_ORIGINS:https://catalog-a.example.test,https://catalog-b.example.test",
      "SOCIAL_API_ORIGIN:https://social.example.test",
      "PLAYGROUND_API_ORIGIN:https://playground.example.test",
      "ADMIN_API_ORIGIN:https://admin.example.test",
      "REALTIME_API_ORIGIN:https://realtime.example.test",
      "LARGE_ASSET_ORIGIN:https://large-assets.example.test",
    ]));
  });

  it("rejects duplicate public read origins before invoking pnpm", () => {
    const { result, commands } = runDeploy({
      CLOUDFLARE_PUBLIC_READ_API_ORIGINS:
        "https://catalog.example.test,https://catalog.example.test",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "CLOUDFLARE_PUBLIC_READ_API_ORIGINS must not contain duplicate origins",
    );
    expect(commands).toEqual([]);
  });

  it("rejects insecure or path-bearing isolated authorities", () => {
    for (const origin of [
      "http://social.example.test",
      "https://social.example.test/private",
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
      "https://user:opaque@social.example.test",
    ]) {
      const { result, commands } = runDeploy({
        CLOUDFLARE_SOCIAL_API_ORIGIN: origin,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "CLOUDFLARE_SOCIAL_API_ORIGIN must be an HTTPS origin without credentials or a path",
      );
      expect(commands).toEqual([]);
    }
  });

  it("allows an explicit API catalog build for compatibility rollbacks", () => {
    const { result, commands } = runDeploy({ VITE_CATALOG_SOURCE: "api" });

    expect(result.status).toBe(0);
    expect(commands[1]).toMatchObject({ catalogSource: "api" });
  });

  it("rejects an unknown catalog source before invoking pnpm", () => {
    const { result, commands } = runDeploy({ VITE_CATALOG_SOURCE: "hybrid" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_CATALOG_SOURCE must be static or api");
    expect(commands).toEqual([]);
  });
});

describe("Cloudflare production release gates (all child process calls mocked)", () => {
  it.each([
    ["missing", undefined], ["empty", ""], ["short", "abcdef0"],
    ["branch", "main"], ["tag", "v1.0.0"], ["uppercase", approvedSha.toUpperCase()],
    ["suffix", `${approvedSha}suffix`], ["injection", `${approvedSha}; pnpm deploy`],
    ["leading whitespace", ` ${approvedSha}`], ["trailing whitespace", `${approvedSha} `],
    ["newline", `${approvedSha}\n`], ["nonhex", "g".repeat(40)],
  ])("rejects %s approved SHA before any process call", (_label, sha) => {
    const { result, commands, allCommands } = runProduction({ TOONSPECTRUM_APPROVED_MAIN_SHA: sha });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lowercase 40-hex SHA");
    expect(commands).toEqual([]);
    expect(allCommands).toEqual([]);
  });

  it.each([
    ["missing approval", { TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: undefined }, "MANUAL_DEPLOY_APPROVAL", 0],
    ["wrong approval", { TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "yes" }, "MANUAL_DEPLOY_APPROVAL", 0],
    ["non-main", { FAKE_BRANCH: "feature/release" }, "requires main", 1],
    ["detached", { FAKE_BRANCH: "" }, "requires main", 1],
    ["dirty tracked", { FAKE_STATUS: " M package.json\n" }, "clean worktree", 2],
    ["dirty staged", { FAKE_STATUS: "M  package.json\n" }, "clean worktree", 2],
    ["dirty untracked", { FAKE_STATUS: "?? new.txt\n" }, "clean worktree", 2],
    ["different HEAD", { FAKE_HEAD: "0".repeat(40) }, "HEAD to equal", 3],
  ])("rejects %s without invoking pnpm", (_label, environment, error, gitCount) => {
    const { result, commands, allCommands } = runProduction(environment);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(commands).toEqual([]);
    expect(allCommands).toHaveLength(gitCount);
  });

  it("preserves origin and catalog gates before pnpm in production", () => {
    for (const environment of [
      { CLOUDFLARE_CORE_API_ORIGIN: "" },
      { CLOUDFLARE_SOCIAL_API_ORIGIN: "http://insecure.test" },
      { VITE_CATALOG_SOURCE: "invalid" },
    ]) {
      const { result, commands } = runProduction(environment);
      expect(result.status).toBe(1);
      expect(commands).toEqual([]);
    }
  });

  it.each([
    ["origin 조회 실패", { FAKE_ORIGIN_OFFLINE: "true" }],
    ["GitHub API 조회 실패", { FAKE_GH_FAILURE: "true" }],
    ["현재 main 이동", { FAKE_ADVANCE_ON_READ: "1" }],
    ["다른 원격의 같은 로컬 HEAD", { FAKE_CANONICAL_HEAD: "c".repeat(40) }],
    ["정본 CI 실패", { FAKE_GATE_RESULT: "failure" }],
  ])("%s이면 로컬 빌드와 게시 명령을 시작하지 않는다", (_label, environment) => {
    const { result, commands } = runProduction(environment);
    expect(result.status).toBe(1);
    expect(commands).toEqual([]);
  });

  it.each([
    [2, "sync:cloudflare-r2-assets"],
    [3, "wrangler"],
  ])("게시 중 원격 main이 바뀌면 %s번째 확인에서 다음 쓰기를 차단한다", (check, command) => {
    const { result, commands } = runStandingProduction({ FAKE_ADVANCE_ON_READ: String(check) });
    expect(result.status).toBe(1);
    expect(commands.some((action) => action.args.includes(command))).toBe(false);
    expect(commands.some((action) => action.args.includes(check === 2 ? "build" : "sync:cloudflare-r2-assets"))).toBe(true);
  });

  it("binds clean main to the exact approved HEAD before all build and publication gates", () => {
    const { result, allCommands, commands } = runProduction();
    expect(result.status).toBe(0);
    expect(allCommands.slice(0, 3)).toEqual([
      { executable: "git", args: ["branch", "--show-current"] },
      { executable: "git", args: ["status", "--porcelain"] },
      { executable: "git", args: ["rev-parse", "HEAD"] },
    ]);
    expect(commands.map((command) => command.args)).toEqual([
      ["run", "generate:cloudflare-static-rules", "--", "--check"],
      ["run", "build"],
      ["run", "prepare:cloudflare-static-assets"],
      ["exec", "node", "scripts/verify-static-service-worker.mjs"],
      ["run", "sync:cloudflare-r2-assets"],
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        "deploy/cloudflare-static/wrangler.jsonc",
        "--var",
        "CORE_API_ORIGIN:https://core.example.test",
        "--var",
        `RELEASE_SHA:${approvedSha}`,
      ],
    ]);
  });

  it("로컬 OAuth는 R2를 실제 동기화하고 Worker CLI는 기본 프로필로 독립 실행한다", () => {
    const { result, commands } = runDeploy({
      CLOUDFLARE_ACCOUNT_ID: "1".repeat(32),
      CLOUDFLARE_API_TOKEN: "ignored-fixture",
    }, ["--production", "--wrangler-oauth"], standingApprovalFile);
    expect(result.status).toBe(0);
    expect(commands[4]).toMatchObject({
      args: ["run", "sync:cloudflare-r2-assets", "--wrangler-oauth"], staticAuth: false, debugLog: "false",
    });
    expect(commands[5]).toMatchObject({ staticAuth: false, debugLog: "false" });
    expect(commands[5].args.slice(0, 5)).toEqual(["exec", "wrangler", "deploy", "--env-file", "/dev/null"]);
    const explicit = runProduction({ CLOUDFLARE_API_TOKEN: "api-fixture" });
    expect(explicit.commands.slice(4).every((command) => command.staticAuth)).toBe(true);
    expect(explicit.commands[4].args).toEqual(["run", "sync:cloudflare-r2-assets"]);
  });

  it("CI 또는 계정이 없는 로컬 OAuth 요청은 배포 명령을 시작하지 않는다", () => {
    for (const env of [{ CI: "true" }, { GITHUB_ACTIONS: "true" }, {}]) {
      const { result, commands } = runDeploy(env, ["--production", "--wrangler-oauth"], standingApprovalFile);
      expect(result.status).toBe(1);
      expect(commands).toEqual([]);
    }
  });

  it("OAuth R2가 실패하면 Worker와 완료 원장을 건드리지 않는다", () => {
    const { result, commands, directory } = runDeploy({
      CLOUDFLARE_ACCOUNT_ID: "1".repeat(32), FAKE_FAIL_CALL: "5", TOONSPECTRUM_DEPLOY_LEDGER_DIR: "ledger",
    }, ["--production", "--wrangler-oauth"], standingApprovalFile);
    expect(result.status).toBe(17);
    expect(commands.at(-1).args).toEqual(["run", "sync:cloudflare-r2-assets", "--wrangler-oauth"]);
    expect(existsSync(join(directory, "ledger", "cloudflare-static", approvedSha + ".json"))).toBe(false);
  });

  it.each([1, 2, 3, 4, 5, 6])("stops after failing build/publication stage %i", (stage) => {
    const { result, commands } = runProduction({ FAKE_FAIL_CALL: String(stage) });
    expect(result.status).toBe(17);
    expect(commands).toHaveLength(stage);
  });

  it("deploys HEAD under standing approval without per-release env approval", () => {
    const { result, allCommands, commands } = runStandingProduction();
    expect(result.status).toBe(0);
    expect(allCommands.slice(0, 3)).toEqual([
      { executable: "git", args: ["branch", "--show-current"] },
      { executable: "git", args: ["status", "--porcelain"] },
      { executable: "git", args: ["rev-parse", "HEAD"] },
    ]);
    expect(commands).toHaveLength(6);
  });

  it.each([
    ["non-main", { FAKE_BRANCH: "feature/release" }, "requires main"],
    ["dirty worktree", { FAKE_STATUS: " M package.json\n" }, "clean worktree"],
  ])("keeps %s gates under standing approval", (_label, environment, error) => {
    const { result, commands } = runStandingProduction(environment);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(commands).toEqual([]);
  });

  it.each([
    ["broken JSON", "{not json"],
    ["wrong scope", JSON.stringify({ scope: "something-else" })],
  ])("fails closed on %s standing approval files", (_label, content) => {
    const { result, commands } = runStandingProduction({}, {
      "deploy/cloudflare-static/STANDING_APPROVAL.json": content,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("STANDING_APPROVAL.json");
    expect(commands).toEqual([]);
  });

  it("rejects an explicit wrong approval even when a standing file exists", () => {
    const { result, commands } = runDeploy({
      TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "yes",
    }, ["--production"], standingApprovalFile);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MANUAL_DEPLOY_APPROVAL");
    expect(commands).toEqual([]);
  });

  it("keeps nonproduction independent of approval, SHA, branch and status", () => {
    const { result, commands, allCommands } = runDeploy({
      TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "invalid",
      TOONSPECTRUM_APPROVED_MAIN_SHA: "invalid",
      FAKE_BRANCH: "feature/test",
      FAKE_STATUS: " M file",
    });
    expect(result.status).toBe(0);
    expect(allCommands).toEqual(commands);
    expect(commands[5].args).toContain("--dry-run");
  });

  it("rejects --skip-build when prebuilt dist artifacts are missing", () => {
    const { result, commands } = runDeploy({}, ["--production", "--skip-build"], standingApprovalFile);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--skip-build requires prebuilt dist/index.html and dist/.assetsignore");
    expect(commands).toEqual([]);
  });

  it.each([
    ["missing build-meta.json", {}, "proving the prebuilt dist SHA"],
    ["invalid build-meta.json", { "dist/.vite/build-meta.json": "{broken" }, "not valid JSON"],
    [
      "stale dist gitSha",
      { "dist/.vite/build-meta.json": JSON.stringify({ gitSha: "1".repeat(40), buildId: "stale01234567" }) },
      `to equal HEAD ${approvedSha}`,
    ],
  ])("rejects production --skip-build on %s before invoking pnpm", (_label, extraFiles, expectedError) => {
    const { result, commands } = runDeploy(
      {},
      ["--production", "--skip-build"],
      {
        ...standingApprovalFile,
        "dist/index.html": "<!doctype html><title>ok</title>",
        "dist/.assetsignore": "*.br\n",
        ...extraFiles,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
    expect(commands).toEqual([]);
  });

  it("supports --skip-build, --skip-r2-sync, and --profile when dist/.vite/build-meta.json matches HEAD", () => {
    const { result, commands } = runDeploy(
      { CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_CORE_API_ORIGIN: "" },
      ["--production", "--skip-build", "--skip-r2-sync", "--profile=onpod-current"],
      {
        ...standingApprovalFile,
        "config/deployment/environment-contract.json": JSON.stringify({
          profiles: {
            "onpod-current": {
              settings: { CORE_API_ORIGIN: "https://profile-core.example.test" },
            },
          },
        }),
        "dist/index.html": "<!doctype html><title>ok</title>",
        "dist/.assetsignore": "*.br\n",
        "dist/.vite/build-meta.json": JSON.stringify({ gitSha: approvedSha, buildId: "0123456789ab" }),
      },
    );
    expect(result.status).toBe(0);
    expect(commands.map((command) => command.args)).toEqual([
      ["run", "generate:cloudflare-static-rules", "--", "--check"],
      ["exec", "node", "scripts/verify-static-csp.mjs", "dist/index.html"],
      ["exec", "node", "scripts/verify-static-service-worker.mjs"],
      ["run", "sync:cloudflare-r2-assets:dry-run"],
      [
        "exec",
        "wrangler",
        "deploy",
        "--env-file",
        "/dev/null",
        "--config",
        "deploy/cloudflare-static/wrangler.jsonc",
        "--var",
        "CORE_API_ORIGIN:https://profile-core.example.test",
        "--var",
        `RELEASE_SHA:${approvedSha}`,
      ],
    ]);
  });

  it("records completed production deploy in .git ledger and blocks duplicate deploy of the same SHA", () => {
    const fake = createFakeProcesses();
    mkdirSync(join(fake.directory, ".git"), { recursive: true });
    const first = runDeploy(
      {
        TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-static-production",
        TOONSPECTRUM_APPROVED_MAIN_SHA: approvedSha,
      },
      ["--production"],
      {},
      fake,
    );
    expect(first.result.status).toBe(0);
    const ledgerFile = join(
      fake.directory,
      ".git/toonstudio-deploy-ledger/cloudflare-static",
      `${approvedSha}.json`,
    );
    expect(existsSync(ledgerFile)).toBe(true);

    writeFileSync(fake.commandLog, "");
    const duplicate = runDeploy(
      {
        TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-static-production",
        TOONSPECTRUM_APPROVED_MAIN_SHA: approvedSha,
      },
      ["--production"],
      {},
      fake,
    );
    expect(duplicate.result.status).toBe(1);
    expect(duplicate.result.stderr).toContain("duplicate production deploy blocked");
    expect(duplicate.commands).toEqual([]);
  });

  it("auto-reuses a complete verified dist/ matching clean production HEAD and skips redundant build", () => {
    const completeDistFiles = {
      ...standingApprovalFile,
      "dist/index.html": "<!doctype html><title>ok</title>",
      "dist/.assetsignore": "*.br\n",
      "dist/sw.js": 'const buildId = "0123456789ab";',
      "dist/.vite/manifest.json": JSON.stringify({ "index.html": { file: "assets/index.js" } }),
      "dist/.vite/build-meta.json": JSON.stringify({ gitSha: approvedSha, buildId: "0123456789ab" }),
      "dist/legal/THIRD_PARTY_NOTICES.generated.md": "# notices\n",
    };

    const { result, commands } = runDeploy({}, ["--production"], completeDistFiles);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("reusing prebuilt dist");
    expect(result.stdout).toContain("reused-verified-dist");
    expect(commands.map((command) => command.args)).toEqual([
      ["run", "generate:cloudflare-static-rules", "--", "--check"],
      ["exec", "node", "scripts/verify-static-csp.mjs", "dist/index.html"],
      ["exec", "node", "scripts/verify-static-service-worker.mjs"],
      ["run", "sync:cloudflare-r2-assets"],
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        "deploy/cloudflare-static/wrangler.jsonc",
        "--var",
        "CORE_API_ORIGIN:https://core.example.test",
        "--var",
        `RELEASE_SHA:${approvedSha}`,
      ],
    ]);
  });

  it("rebuilds dist/ when --force-build is passed even if verified dist/ matches HEAD", () => {
    const completeDistFiles = {
      ...standingApprovalFile,
      "dist/index.html": "<!doctype html><title>ok</title>",
      "dist/.assetsignore": "*.br\n",
      "dist/sw.js": 'const buildId = "0123456789ab";',
      "dist/.vite/manifest.json": JSON.stringify({ "index.html": { file: "assets/index.js" } }),
      "dist/.vite/build-meta.json": JSON.stringify({ gitSha: approvedSha, buildId: "0123456789ab" }),
      "dist/legal/THIRD_PARTY_NOTICES.generated.md": "# notices\n",
    };

    const { result, commands } = runDeploy({}, ["--production", "--force-build"], completeDistFiles);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("full-build");
    expect(commands.some((command) => command.args.includes("build"))).toBe(true);
    expect(commands.some((command) => command.args.includes("prepare:cloudflare-static-assets"))).toBe(true);
  });

  it.each([
    ["missing sw.js", { "dist/sw.js": null }, {}],
    ["missing third-party notices", { "dist/legal/THIRD_PARTY_NOTICES.generated.md": null }, {}],
    [
      "stale gitSha",
      { "dist/.vite/build-meta.json": JSON.stringify({ gitSha: "1".repeat(40), buildId: "0123456789ab" }) },
      {},
    ],
    [
      "malformed build-meta.json",
      { "dist/.vite/build-meta.json": "{not-json" },
      {},
    ],
    [
      "non-default VITE_CATALOG_SOURCE=api without matching metadata",
      {},
      { VITE_CATALOG_SOURCE: "api" },
    ],
  ])("falls back to full rebuild (fail-closed) on %s instead of auto-reusing dist/", (_label, overrides, env) => {
    const files = {
      ...standingApprovalFile,
      "dist/index.html": "<!doctype html><title>ok</title>",
      "dist/.assetsignore": "*.br\n",
      "dist/sw.js": 'const buildId = "0123456789ab";',
      "dist/.vite/manifest.json": JSON.stringify({ "index.html": { file: "assets/index.js" } }),
      "dist/.vite/build-meta.json": JSON.stringify({ gitSha: approvedSha, buildId: "0123456789ab" }),
      "dist/legal/THIRD_PARTY_NOTICES.generated.md": "# notices\n",
      ...overrides,
    };
    for (const [key, value] of Object.entries(files)) {
      if (value === null) delete files[key];
    }

    const { result, commands } = runDeploy(env, ["--production"], files);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("full-build");
    expect(commands.some((command) => command.args.includes("build"))).toBe(true);
  });

  it("rejects contradictory --skip-build and --force-build flags before running any command", () => {
    const { result, commands, allCommands } = runDeploy({}, ["--production", "--skip-build", "--force-build"], standingApprovalFile);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--skip-build and --force-build cannot be used together");
    expect(commands).toEqual([]);
    expect(allCommands).toEqual([]);
  });
});
