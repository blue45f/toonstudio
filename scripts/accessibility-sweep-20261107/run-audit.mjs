#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const OWNED_PREFIXES = [
  "scripts/accessibility-sweep-20261107/",
  "docs/accessibility-sweep-20261107/",
];

const TRACKS = {
  inventory: {
    id: "inventory",
    label: "전페이지 라우트 인벤토리(441건) 및 정적 접근성 계약·경계 Vitest 검증",
    command: [
      "pnpm",
      "exec",
      "vitest",
      "run",
      "scripts/accessibility-sweep-20261107/route-inventory-audit.test.ts",
    ],
  },
  browser: {
    id: "browser",
    label:
      "실제 브라우저(320/390/768/1440/200%/reduced-motion) 키보드 Tab·Escape·포커스 복귀·ARIA 스윕",
    command: [
      "node",
      "scripts/accessibility-sweep-20261107/browser-accessibility-sweep.mjs",
    ],
  },
};

function parseCliArgs(argv) {
  let dryRun = false;
  let track = "inventory";
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--track=")) {
      track = arg.slice("--track=".length).trim();
    }
  }
  if (track !== "all" && !(track in TRACKS)) {
    throw new Error(
      `지원하지 않는 --track 값입니다: ${track} (지원값: inventory, browser, all)`,
    );
  }
  return { dryRun, track };
}

function normalizeGitPath(rawPath) {
  return rawPath.trim().replace(/^"+|"+$/gu, "").replace(/\\/gu, "/");
}

export function verifyReadOnlySourceBoundary(repoRoot = REPO_ROOT) {
  const statusResult = spawnSync(
    "git",
    ["status", "--porcelain=v1", "-uall"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (statusResult.error) throw statusResult.error;
  if (statusResult.status !== 0) {
    throw new Error(`git status 실행 실패: ${statusResult.stderr.trim()}`);
  }

  const candidatePaths = new Set();
  for (const line of statusResult.stdout.split("\n")) {
    if (!line.trim()) continue;
    const body = line.slice(3).trim();
    if (body.includes(" -> ")) {
      for (const part of body.split(" -> ")) {
        candidatePaths.add(normalizeGitPath(part));
      }
    } else {
      candidatePaths.add(normalizeGitPath(body));
    }
  }

  const diffResult = spawnSync(
    "git",
    ["diff", "--name-only", "origin/main...HEAD"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (diffResult.status === 0) {
    for (const line of diffResult.stdout.split("\n")) {
      if (line.trim()) candidatePaths.add(normalizeGitPath(line));
    }
  }

  const ownedPaths = [];
  const violatingPaths = [];
  for (const relPath of [...candidatePaths].sort()) {
    if (OWNED_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
      ownedPaths.push(relPath);
    } else {
      violatingPaths.push(relPath);
    }
  }

  if (violatingPaths.length > 0) {
    throw new Error(
      `앱 구현 READ-ONLY 경계 위반 감지 (${violatingPaths.length}건): ${violatingPaths.join(", ")}`,
    );
  }

  return { ok: true, ownedPaths, violatingPaths };
}

function runMain() {
  const { dryRun, track } = parseCliArgs(process.argv.slice(2));
  const boundaryBefore = verifyReadOnlySourceBoundary(REPO_ROOT);

  const selectedTracks =
    track === "all" ? [TRACKS.inventory, TRACKS.browser] : [TRACKS[track]];

  const plan = {
    suite: "accessibility-sweep-20261107",
    dryRun,
    track,
    readOnlyBoundaryOk: boundaryBefore.ok,
    ownedFileCount: boundaryBefore.ownedPaths.length,
    tracks: selectedTracks.map((item) => ({
      id: item.id,
      label: item.label,
      command: item.command.join(" "),
    })),
  };

  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  for (const item of selectedTracks) {
    console.log(`\n[accessibility-sweep-20261107] ▶ ${item.label}`);
    const [cmd, ...args] = item.command;
    const res = spawnSync(cmd, args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: process.env,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      process.exitCode = res.status ?? 1;
      return;
    }
  }

  const boundaryAfter = verifyReadOnlySourceBoundary(REPO_ROOT);
  console.log(
    JSON.stringify(
      {
        suite: "accessibility-sweep-20261107",
        status: "PASS",
        readOnlyBoundaryOk: boundaryAfter.ok,
        ownedFileCount: boundaryAfter.ownedPaths.length,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runMain();
}
