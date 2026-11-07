#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const AUDIT_ID = "project-roundtrip-audit-20261107";

const TRACKS = Object.freeze({
  a: {
    id: "track-a-roundtrip-migration",
    label: "Track A (합성 프로젝트 한글/Emoji/중첩 scene·layer/빈값/중복ID 왕복 및 마이그레이션 경계값)",
    testFile: `scripts/${AUDIT_ID}/track-a-roundtrip-migration/track-a-roundtrip-migration.test.ts`,
    fixtureFile: `scripts/${AUDIT_ID}/track-a-roundtrip-migration/synthetic-fixtures.ts`,
    docFile: `docs/${AUDIT_ID}/track-a-roundtrip-migration.md`,
  },
  b: {
    id: "track-b-fault-injection",
    label: "Track B (export/import 중 abort·quota 오류·손상 archive 원본 불변성 fault injection)",
    testFile: `scripts/${AUDIT_ID}/track-b-fault-injection/track-b-fault-injection.test.ts`,
    fixtureFile: `scripts/${AUDIT_ID}/track-b-fault-injection/fault-harness.ts`,
    docFile: `docs/${AUDIT_ID}/track-b-fault-injection.md`,
  },
});

const ALLOWED_PREFIXES = Object.freeze([
  `scripts/${AUDIT_ID}/`,
  `docs/${AUDIT_ID}/`,
]);

function parseArgs(argv) {
  let dryRun = false;
  let trackFilter = "all";
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--track=a" || arg === "--track=A") {
      trackFilter = "a";
    } else if (arg === "--track=b" || arg === "--track=B") {
      trackFilter = "b";
    } else if (arg === "--track=all") {
      trackFilter = "all";
    } else {
      throw new Error(`지원하지 않는 인자입니다: ${arg} (--dry-run | --track=a | --track=b | --track=all)`);
    }
  }
  return { dryRun, trackFilter };
}

function verifyReadOnlySourceBoundary() {
  const diffResult = spawnSync("git", ["status", "--porcelain=v1", "-uall"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (diffResult.error) throw diffResult.error;
  if (diffResult.status !== 0) {
    throw new Error(`git status 실행 실패: ${diffResult.stderr.trim()}`);
  }
  const lines = diffResult.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const violations = [];
  for (const line of lines) {
    const filePath = line.slice(3).trim().replace(/^"(.*)"$/u, "$1");
    if (!ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
      violations.push(filePath);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `기존 소스 READ-ONLY 경계 위반이 감지되었습니다:\n${violations.map((v) => `  - ${v}`).join("\n")}`,
    );
  }
  return lines.length;
}

function runTrackVitest(track) {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    const child = spawn(
      "pnpm",
      ["exec", "vitest", "run", "--maxWorkers=1", track.testFile],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        trackId: track.id,
        label: track.label,
        testFile: track.testFile,
        exitCode: code ?? 1,
        durationMs: Date.now() - startMs,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  const { dryRun, trackFilter } = parseArgs(process.argv.slice(2));
  const selectedTracks =
    trackFilter === "a"
      ? [TRACKS.a]
      : trackFilter === "b"
        ? [TRACKS.b]
        : [TRACKS.a, TRACKS.b];

  const changedCount = verifyReadOnlySourceBoundary();

  for (const track of selectedTracks) {
    for (const relPath of [track.testFile, track.fixtureFile]) {
      if (!existsSync(path.join(ROOT, relPath))) {
        throw new Error(`필수 감사 파일이 없습니다: ${relPath}`);
      }
    }
  }

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          auditId: AUDIT_ID,
          mode: "dry-run",
          readOnlyBoundaryVerified: true,
          changedAuditFilesCount: changedCount,
          tracks: selectedTracks.map((t) => ({
            id: t.id,
            testFile: t.testFile,
            fixtureFile: t.fixtureFile,
            docFile: t.docFile,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(
    `[${AUDIT_ID}] 2트랙 병렬 회귀 감사 시작 (트랙 수: ${selectedTracks.length}, READ-ONLY 경계 검증 통과)\n`,
  );

  const results = await Promise.all(selectedTracks.map((track) => runTrackVitest(track)));

  let hasFailure = false;
  for (const res of results) {
    process.stdout.write(`\n=== ${res.label} (${res.durationMs}ms, exit=${res.exitCode}) ===\n`);
    process.stdout.write(res.stdout);
    if (res.stderr.trim().length > 0) {
      process.stderr.write(res.stderr);
    }
    if (res.exitCode !== 0) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  } else {
    process.stdout.write(`\n[${AUDIT_ID}] 전 트랙 감사 통과 완료.\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
