#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { delimiter, dirname, resolve } from "node:path";

import {
  assertNoDuplicateDeploy,
  recordCompletedDeploy,
  resolveLocalDeployLedgerPath,
} from "./lib/local-deploy-ledger.mjs";

const STANDING_APPROVAL_PATH = "deploy/cloudflare-static/STANDING_APPROVAL.json";
const ENVIRONMENT_CONTRACT_PATH = "config/deployment/environment-contract.json";
const BUILD_META_PATH = "dist/.vite/build-meta.json";

const mode = process.argv.includes("--production") ? "production" : "dry-run";
const skipBuild = process.argv.includes("--skip-build");
const skipR2Sync = process.argv.includes("--skip-r2-sync");
const useStandingProfile = process.argv.includes("--standing-profile");
const coreOriginArg = process.argv
  .find((argument) => argument.startsWith("--core-origin="))
  ?.slice("--core-origin=".length);
const profileArg = process.argv
  .find((argument) => argument.startsWith("--profile="))
  ?.slice("--profile=".length)
  ?? (useStandingProfile ? "onpod-current" : undefined);
const approval = process.env.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL;

const OPTIONAL_SINGLE_ORIGINS = [
  ["CLOUDFLARE_SOCIAL_API_ORIGIN", "SOCIAL_API_ORIGIN"],
  ["CLOUDFLARE_PLAYGROUND_API_ORIGIN", "PLAYGROUND_API_ORIGIN"],
  ["CLOUDFLARE_ADMIN_API_ORIGIN", "ADMIN_API_ORIGIN"],
  ["CLOUDFLARE_REALTIME_API_ORIGIN", "REALTIME_API_ORIGIN"],
  ["CLOUDFLARE_LARGE_ASSET_ORIGIN", "LARGE_ASSET_ORIGIN"],
];
const MAX_PUBLIC_READ_ORIGINS = 8;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readProfileCoreOrigin(profileName) {
  if (!profileName) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(process.cwd(), ENVIRONMENT_CONTRACT_PATH), "utf8"));
  } catch {
    fail(`Failed to read ${ENVIRONMENT_CONTRACT_PATH} for --profile=${profileName}`);
  }
  const profile = parsed?.profiles?.[profileName];
  if (!profile) {
    fail(`Unknown deployment profile: ${profileName}`);
  }
  const origin = profile?.settings?.CORE_API_ORIGIN;
  if (typeof origin !== "string" || origin.trim() === "") {
    fail(`Deployment profile ${profileName} does not define CORE_API_ORIGIN`);
  }
  return origin.trim();
}

const rawOrigin = coreOriginArg
  ?? readProfileCoreOrigin(profileArg)
  ?? process.env.CLOUDFLARE_CORE_API_ORIGIN
  ?? (mode === "dry-run" ? "https://core.invalid" : "");

function parseOrigin(raw, environmentName) {
  let origin;
  try {
    origin = new URL(raw);
  } catch {
    fail(`${environmentName} must be an absolute HTTPS origin`);
  }
  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) {
    fail(`${environmentName} must be an HTTPS origin without credentials or a path`);
  }
  return origin.origin;
}

function optionalOriginVariable(environmentName, workerName) {
  const raw = process.env[environmentName]?.trim();
  if (!raw) return [];
  return ["--var", `${workerName}:${parseOrigin(raw, environmentName)}`];
}

function publicReadOriginVariable() {
  const environmentName = "CLOUDFLARE_PUBLIC_READ_API_ORIGINS";
  const raw = process.env[environmentName]?.trim();
  if (!raw) return [];
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0
    || values.length > MAX_PUBLIC_READ_ORIGINS
    || values.some((value) => value === "")
  ) {
    fail(`${environmentName} must contain 1-${MAX_PUBLIC_READ_ORIGINS} comma-separated HTTPS origins`);
  }
  const origins = values.map((value) => parseOrigin(value, environmentName));
  if (new Set(origins).size !== origins.length) {
    fail(`${environmentName} must not contain duplicate origins`);
  }
  return ["--var", `PUBLIC_READ_API_ORIGINS:${origins.join(",")}`];
}

const coreOrigin = parseOrigin(rawOrigin, "CLOUDFLARE_CORE_API_ORIGIN");
const routeVariables = [
  "--var",
  `CORE_API_ORIGIN:${coreOrigin}`,
  ...publicReadOriginVariable(),
  ...OPTIONAL_SINGLE_ORIGINS.flatMap(([environmentName, workerName]) =>
    optionalOriginVariable(environmentName, workerName)),
];

function readStandingApproval() {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), STANDING_APPROVAL_PATH), "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${STANDING_APPROVAL_PATH} is not valid JSON; delete it or fix it to restore deploys`);
  }
  if (parsed?.scope !== "cloudflare-static-production") {
    fail(`${STANDING_APPROVAL_PATH} has an unexpected scope; delete it or fix it to restore deploys`);
  }
  return parsed;
}

let productionHead = null;
let productionApprovalMode = null;
let productionLedgerPath = null;

if (mode === "production") {
  // 상시 승인 모드(2026-10-13 저장소 소유자 결정): 명시적 승인 env가 없으면
  // 저장소에 기록된 상시 승인 파일을 대신 인정하고 HEAD를 승인 SHA로 간주한다.
  // main·clean worktree·검증 게이트는 그대로 유지되며, 파일이 없거나 깨지면
  // 기존 명시 승인 방식으로 fail-closed 복귀한다.
  let approvedSha = null;
  let standing = null;
  if (approval === "cloudflare-static-production") {
    const configured = process.env.TOONSPECTRUM_APPROVED_MAIN_SHA;
    if (configured?.length !== 40 || !/^[0-9a-f]{40}$/u.test(configured)) {
      fail("production deploy requires TOONSPECTRUM_APPROVED_MAIN_SHA as a lowercase 40-hex SHA");
    }
    approvedSha = configured;
  } else if (approval === undefined || approval === "") {
    const found = readStandingApproval();
    if (!found) {
      fail("production deploy requires TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production or a valid deploy/cloudflare-static/STANDING_APPROVAL.json");
    }
    standing = found;
  } else {
    fail("production deploy requires TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production");
  }
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  if (branch !== "main") fail(`production deploy requires main (current: ${branch || "detached"})`);
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status !== "") fail("production deploy requires a clean worktree");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/u.test(head)) {
    fail("production deploy requires HEAD to resolve to a lowercase 40-hex SHA");
  }
  if (approvedSha) {
    if (head !== approvedSha) fail("production deploy requires HEAD to equal TOONSPECTRUM_APPROVED_MAIN_SHA");
    productionApprovalMode = "manual";
  } else {
    console.log(`standing deploy approval (${standing.grantedAt ?? "undated"}) applies — deploying HEAD ${head} without per-release approval`);
    productionApprovalMode = "standing";
  }
  productionHead = head;
  productionLedgerPath = resolveLocalDeployLedgerPath({
    cwd: process.cwd(),
    env: process.env,
    unit: "cloudflare-static",
    sha: head,
  });
  try {
    assertNoDuplicateDeploy(productionLedgerPath, "cloudflare-static", head);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  routeVariables.push("--var", `RELEASE_SHA:${head}`);
}

const staticCatalogSource = process.env.VITE_CATALOG_SOURCE?.trim() || "static";
if (staticCatalogSource !== "static" && staticCatalogSource !== "api") {
  fail("VITE_CATALOG_SOURCE must be static or api");
}

if (skipBuild) {
  if (
    !existsSync(resolve(process.cwd(), "dist/index.html"))
    || !existsSync(resolve(process.cwd(), "dist/.assetsignore"))
  ) {
    fail("--skip-build requires prebuilt dist/index.html and dist/.assetsignore");
  }
  if (mode === "production") {
    const buildMetaPath = resolve(process.cwd(), BUILD_META_PATH);
    if (!existsSync(buildMetaPath)) {
      fail(`--skip-build in production requires ${BUILD_META_PATH} proving the prebuilt dist SHA`);
    }
    let buildMeta;
    try {
      buildMeta = JSON.parse(readFileSync(buildMetaPath, "utf8"));
    } catch {
      fail(`${BUILD_META_PATH} is not valid JSON; rebuild dist before production deploy`);
    }
    if (buildMeta?.gitSha !== productionHead) {
      fail(
        `--skip-build requires ${BUILD_META_PATH} gitSha (${String(buildMeta?.gitSha ?? "missing")}) to equal HEAD ${productionHead}`,
      );
    }
  }
}

const childHome = process.env.HOME?.includes("/.gemini/")
  ? userInfo().homedir
  : process.env.HOME;
const nodeBinDirectory = dirname(process.execPath);
const existingPathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
const normalizedPathEntries = [
  nodeBinDirectory,
  "/opt/homebrew/bin",
  ...existingPathEntries,
].filter((entry, index, list) => list.indexOf(entry) === index);
const baseChildEnvironment = {
  ...process.env,
  PATH: normalizedPathEntries.join(delimiter),
  ...(childHome ? { HOME: childHome } : {}),
};
const useWranglerOAuthIsolation = skipR2Sync && !process.env.CLOUDFLARE_API_TOKEN?.trim();

const pipelineCommands = [
  {
    executable: "pnpm",
    args: ["run", "generate:cloudflare-static-rules", "--", "--check"],
  },
  ...(skipBuild
    ? [
        {
          executable: "pnpm",
          args: ["exec", "node", "scripts/verify-static-csp.mjs", "dist/index.html"],
        },
      ]
    : [
        {
          executable: "pnpm",
          args: ["run", "build"],
          environment: {
            ...baseChildEnvironment,
            VITE_CATALOG_SOURCE: staticCatalogSource,
          },
        },
        {
          executable: "pnpm",
          args: ["run", "prepare:cloudflare-static-assets"],
        },
      ]),
  {
    // sw.js가 빠진 dist는 /sw.js를 SPA HTML로 응답해 PWA 업데이트 안내를 멈추게 한다.
    executable: "pnpm",
    args: ["exec", "node", "scripts/verify-static-service-worker.mjs"],
  },
  {
    executable: "pnpm",
    args: [
      "run",
      mode === "production" && !skipR2Sync
        ? "sync:cloudflare-r2-assets"
        : "sync:cloudflare-r2-assets:dry-run",
    ],
  },
  {
    executable: "pnpm",
    args: [
      "exec",
      "wrangler",
      "deploy",
      ...(mode === "dry-run" ? ["--dry-run"] : []),
      ...(useWranglerOAuthIsolation ? ["--env-file", "/dev/null"] : []),
      "--config",
      "deploy/cloudflare-static/wrangler.jsonc",
      ...routeVariables,
    ],
    environment: useWranglerOAuthIsolation
      ? { ...baseChildEnvironment, WRANGLER_WRITE_LOGS: "false" }
      : baseChildEnvironment,
  },
];

for (const command of pipelineCommands) {
  const result = spawnSync(command.executable, command.args, {
    stdio: "inherit",
    env: command.environment ?? baseChildEnvironment,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === "production" && productionHead) {
  recordCompletedDeploy(productionLedgerPath, {
    unit: "cloudflare-static",
    sha: productionHead,
    approvalMode: productionApprovalMode,
    coreOrigin,
  });
}
