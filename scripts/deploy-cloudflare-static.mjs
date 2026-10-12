#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STANDING_APPROVAL_PATH = "deploy/cloudflare-static/STANDING_APPROVAL.json";

const mode = process.argv.includes("--production") ? "production" : "dry-run";
const approval = process.env.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL;
const rawOrigin = process.env.CLOUDFLARE_CORE_API_ORIGIN
  ?? (mode === "dry-run" ? "https://core.invalid" : "");

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
  if (approvedSha) {
    if (head !== approvedSha) fail("production deploy requires HEAD to equal TOONSPECTRUM_APPROVED_MAIN_SHA");
  } else {
    console.log(`standing deploy approval (${standing.grantedAt ?? "undated"}) applies — deploying HEAD ${head} without per-release approval`);
  }
}

const staticCatalogSource = process.env.VITE_CATALOG_SOURCE?.trim() || "static";
if (staticCatalogSource !== "static" && staticCatalogSource !== "api") {
  fail("VITE_CATALOG_SOURCE must be static or api");
}

for (const command of [
  {
    executable: "pnpm",
    args: ["run", "generate:cloudflare-static-rules", "--", "--check"],
  },
  {
    executable: "pnpm",
    args: ["run", "build"],
    environment: {
      ...process.env,
      VITE_CATALOG_SOURCE: staticCatalogSource,
    },
  },
  {
    executable: "pnpm",
    args: ["run", "prepare:cloudflare-static-assets"],
  },
  {
    // sw.js가 빠진 dist는 /sw.js를 SPA HTML로 응답해 PWA 업데이트 안내를 멈추게 한다.
    executable: "pnpm",
    args: ["exec", "node", "scripts/verify-static-service-worker.mjs"],
  },
  {
    executable: "pnpm",
    args: [
      "run",
      mode === "production"
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
      "--config",
      "deploy/cloudflare-static/wrangler.jsonc",
      ...routeVariables,
    ],
  },
]) {
  const result = spawnSync(command.executable, command.args, {
    stdio: "inherit",
    env: command.environment ?? process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
