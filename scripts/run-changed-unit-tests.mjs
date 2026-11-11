#!/usr/bin/env node
/**
 * 변경 범위 기반 빠른 단위 테스트 게이트 (pre-push 및 agent-harness 연동용).
 *
 * 배경: 전체 Vitest 스위트는 수천 개 파일을 실행하므로 로컬 pre-push 에서 전부 돌리면
 * 개발 피드백 루프가 마비된다. 반대로 단위 테스트를 아예 생략하면 깨진 테스트가 원격 CI까지
 * 올라간다. 이 스크립트는 이번 변경에서 수정·추가된 모듈과 짝을 이루는 단위 테스트만 선별해
 * 수 초~수십 초 안에 검증한다.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_VITEST_TARGETS = 36;

export function selectChangedUnitTestTargets(changedFiles, root = DEFAULT_ROOT) {
  const vitestTargets = new Set();
  const nodeTestTargets = new Set();

  const exists = (rel) => fs.existsSync(path.join(root, rel));

  for (const raw of changedFiles) {
    const file = raw.split(path.sep).join("/").replace(/^\.\//u, "");
    if (!exists(file)) continue;

    if (/^(?:scripts|tools)\/.*\.test\.mjs$/u.test(file)) {
      nodeTestTargets.add(file);
      continue;
    }

    if (
      /^(?:apps\/web|apps\/api|packages)\/.*\.test\.(?:ts|tsx)$/u.test(file)
      && !file.endsWith(".integration.test.ts")
      && !file.endsWith(".perf.test.ts")
    ) {
      vitestTargets.add(file);
      continue;
    }

    const sourceMatch = file.match(/^((?:apps\/web|apps\/api|packages)\/.+)\.(ts|tsx)$/u);
    if (sourceMatch && !sourceMatch[1].endsWith(".d")) {
      const stem = sourceMatch[1];
      for (const candidate of [`${stem}.test.ts`, `${stem}.test.tsx`]) {
        if (exists(candidate)) vitestTargets.add(candidate);
      }
    }
  }

  const sortedVitest = [...vitestTargets].sort((a, b) => a.localeCompare(b, "en"));
  const sortedNode = [...nodeTestTargets].sort((a, b) => a.localeCompare(b, "en"));

  return {
    nodeTestTargets: sortedNode,
    vitestTargets: sortedVitest.slice(0, MAX_VITEST_TARGETS),
    truncatedVitestCount: Math.max(0, sortedVitest.length - MAX_VITEST_TARGETS),
  };
}

function collectGitChangedFiles(root, { base, staged }) {
  const files = new Set();
  const git = (args) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

  if (staged) {
    const res = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"]);
    if (res.status === 0) {
      for (const item of res.stdout.split("\0").filter(Boolean)) files.add(item);
    }
    return [...files];
  }

  if (base) {
    const verify = git(["rev-parse", "--verify", "--quiet", base]);
    if (verify.status === 0) {
      const diff = git(["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`, "--"]);
      if (diff.status === 0) {
        for (const item of diff.stdout.split("\0").filter(Boolean)) files.add(item);
      }
    }
  }
  const unstaged = git(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"]);
  if (unstaged.status === 0) {
    for (const item of unstaged.stdout.split("\0").filter(Boolean)) files.add(item);
  }
  return [...files];
}

function runCommand(command, args, root) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function main(argv = process.argv.slice(2)) {
  const staged = argv.includes("--staged");
  const baseArg = argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) || "origin/main";
  const changed = collectGitChangedFiles(DEFAULT_ROOT, { base: baseArg, staged });
  const plan = selectChangedUnitTestTargets(changed, DEFAULT_ROOT);

  if (plan.nodeTestTargets.length === 0 && plan.vitestTargets.length === 0) {
    console.log("변경 범위 단위 테스트: 실행할 직접 대응 테스트가 없습니다 (통과).");
    return;
  }

  if (plan.nodeTestTargets.length > 0) {
    console.log(`변경 스크립트 테스트 실행 (${plan.nodeTestTargets.length}개)...`);
    runCommand(process.execPath, ["--test", ...plan.nodeTestTargets], DEFAULT_ROOT);
  }

  if (plan.vitestTargets.length > 0) {
    console.log(`변경 모듈 대응 Vitest 실행 (${plan.vitestTargets.length}개)...`);
    if (plan.truncatedVitestCount > 0) {
      console.log(`  (참고: 상한 초과 ${plan.truncatedVitestCount}개는 원격 CI 샤드에서 전체 검증합니다.)`);
    }
    runCommand("pnpm", ["exec", "vitest", "run", "--passWithNoTests", ...plan.vitestTargets], DEFAULT_ROOT);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
