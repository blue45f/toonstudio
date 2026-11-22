#!/usr/bin/env node
/**
 * 저장소 위생 자동 감사 CLI.
 *
 * 불필요한 임시/디버그 파일, 루트 설정 난립, 죽은/중복 package.json 스크립트,
 * 고아 스크립트(개인 경로·원샷 패처·깨진 상대 임포트·미참조 CLI),
 * assertion 0개·항상 참(tautology)·빈 블록 껍데기 테스트를 빠르게 탐지한다.
 *
 * 사용법:
 *   node scripts/audit-repo-hygiene.mjs
 *   node scripts/audit-repo-hygiene.mjs --check
 *   node scripts/audit-repo-hygiene.mjs --json
 *   node scripts/audit-repo-hygiene.mjs --root <dir> --check [--strict-orphans] [--max-root-files <N>]
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  auditHollowTests,
  auditOrphanScripts,
  auditPackageScripts,
  auditRootSprawl,
  auditTempAndDebugFiles,
  isVendorFile,
  stripCommentsAndStringBodies,
  TEST_FILE_RE,
} from "./lib/repo-hygiene-scanners.mjs";

export { stripCommentsAndStringBodies };

const execFileAsync = promisify(execFile);

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".turbo"]);
const TEXT_READ_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx",
  ".py", ".sh", ".zsh", ".bash", ".json", ".jsonc", ".yml", ".yaml", ".md", ".mdx", ".txt", "",
]);

export function parseCliArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    check: false,
    json: false,
    strictOrphans: false,
    maxRootFiles: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") options.check = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--strict-orphans") options.strictOrphans = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--root") {
      const value = argv[++i];
      if (!value) throw new Error("--root 옵션에는 디렉터리 경로가 필요합니다.");
      options.root = path.resolve(value);
    } else if (arg === "--max-root-files") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-root-files 옵션에는 양의 정수가 필요합니다.");
      }
      options.maxRootFiles = value;
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }
  return options;
}

function normalizePosix(filePath) {
  return filePath.split(path.sep).join("/").replace(/^\.\//u, "");
}

function walkFilesFallback(rootDir, currentDir = rootDir, out = []) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFilesFallback(rootDir, abs, out);
    } else if (entry.isFile()) {
      out.push(normalizePosix(path.relative(rootDir, abs)));
    }
  }
  return out;
}

export async function listRepositoryFiles(root) {
  if (existsSync(path.join(root, ".git"))) {
    try {
      const [trackedRes, statusRes] = await Promise.all([
        execFileAsync("git", ["ls-files", "-z"], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        }),
        execFileAsync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--no-renames"], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        }),
      ]);
      const fileSet = new Set(trackedRes.stdout.split("\0").filter(Boolean).map(normalizePosix));
      for (const entry of statusRes.stdout.split("\0").filter(Boolean)) {
        const code = entry.slice(0, 2);
        const rel = normalizePosix(entry.slice(3));
        if (code[0] === "D" || code[1] === "D") {
          fileSet.delete(rel);
        } else if (code === "??") {
          if (rel.endsWith("/")) {
            const absDir = path.join(root, rel);
            if (existsSync(absDir)) {
              for (const nested of walkFilesFallback(root, absDir, [])) fileSet.add(nested);
            }
          } else {
            fileSet.add(rel);
          }
        }
      }
      return [...fileSet].sort();
    } catch {
      // git 실행이 불가능한 격리 환경에서는 파일시스템 순회로 폴백한다.
    }
  }
  return walkFilesFallback(root).sort();
}

async function readFilesConcurrently(root, relPaths, concurrency = 96) {
  const contents = new Map();
  let cursor = 0;
  const workerCount = Math.min(concurrency, Math.max(1, relPaths.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < relPaths.length) {
      const rel = relPaths[cursor++];
      try {
        contents.set(rel, await readFile(path.join(root, rel), "utf8"));
      } catch {
        contents.set(rel, "");
      }
    }
  });
  await Promise.all(workers);
  return contents;
}

export async function auditRepoHygiene({
  root = DEFAULT_ROOT,
  strictOrphans = false,
  maxRootFiles = null,
} = {}) {
  const startedAt = performance.now();
  const files = await listRepositoryFiles(root);
  const testFiles = files.filter((rel) => TEST_FILE_RE.test(rel) && !isVendorFile(rel));

  const filesToRead = new Set(testFiles);
  for (const rel of files) {
    if (isVendorFile(rel)) continue;
    if (
      rel === "pnpm-lock.yaml"
      || rel === "THIRD_PARTY_NOTICES.md"
      || rel.startsWith("scripts/data/")
      || rel.startsWith("scripts/experiments/")
    ) {
      continue;
    }
    if (!TEXT_READ_EXTS.has(path.posix.extname(rel).toLowerCase())) continue;
    const isImportantContext =
      rel === "package.json"
      || rel.endsWith("/package.json")
      || !rel.includes("/")
      || rel.startsWith("scripts/")
      || rel.startsWith(".github/")
      || rel.startsWith(".husky/")
      || rel.startsWith("tools/")
      || rel.startsWith("deploy/")
      || rel.startsWith("config/");
    if (isImportantContext) filesToRead.add(rel);
  }

  const contents = await readFilesConcurrently(root, [...filesToRead]);
  const tempAndDebugFiles = auditTempAndDebugFiles(files, contents);
  const rootSprawl = auditRootSprawl(files);
  const packageScripts = auditPackageScripts(root, files, contents);
  const orphanScripts = auditOrphanScripts(root, files, contents);
  const hollowTests = auditHollowTests(testFiles, contents);

  const hardViolations = [];
  for (const item of tempAndDebugFiles) {
    hardViolations.push(`임시/디버그 파일: ${item.file} (${item.reason})`);
  }
  for (const item of packageScripts.missingPaths) {
    hardViolations.push(`죽은 스크립트 경로: ${item.manifest} [${item.script}] -> ${item.target}`);
  }
  for (const item of packageScripts.missingSubscripts) {
    hardViolations.push(`존재하지 않는 하위 스크립트: package.json [${item.script}] -> ${item.target}`);
  }
  for (const item of packageScripts.missingWorkspaceScripts) {
    hardViolations.push(`죽은 워크스페이스 스크립트: package.json [${item.script}] -> ${item.workspace}:${item.target} (${item.reason})`);
  }
  for (const item of packageScripts.duplicateCommands) {
    hardViolations.push(`중복 package.json 스크립트 명령: ${item.scripts.join(", ")}`);
  }
  for (const item of packageScripts.unusedAliasWrappers) {
    hardViolations.push(`미사용 중복 별칭 스크립트: package.json [${item.alias}] -> ${item.target}`);
  }
  for (const item of orphanScripts.deadOrphanScripts) {
    hardViolations.push(`죽은 고아 스크립트: ${item.file} (${item.reasons.join(", ")})`);
  }
  if (strictOrphans) {
    for (const file of orphanScripts.unreferencedTopLevelScripts) {
      hardViolations.push(`미참조 최상위 스크립트(--strict-orphans): ${file}`);
    }
  }
  for (const item of hollowTests.tautologyOnly) {
    hardViolations.push(`항상 참(tautology) 껍데기 테스트: ${item.file}`);
  }
  for (const item of hollowTests.zeroAssertions) {
    hardViolations.push(`assertion 0개 빈 테스트: ${item.file} (${item.reason})`);
  }
  for (const item of hollowTests.emptyBodies) {
    hardViolations.push(`빈 test/describe 블록: ${item.file} (${item.count}건)`);
  }
  for (const item of hollowTests.exclusiveOnly) {
    hardViolations.push(`방치된 .only 테스트: ${item.file} (${item.count}건)`);
  }
  for (const item of hollowTests.debugProbeTests) {
    hardViolations.push(`임시 debug/probe 테스트: ${item.file} (${item.lines}줄)`);
  }
  if (maxRootFiles !== null && rootSprawl.totalRootFiles > maxRootFiles) {
    hardViolations.push(`루트 파일 수 초과: ${rootSprawl.totalRootFiles}개 (상한 ${maxRootFiles}개)`);
  }

  return {
    ok: hardViolations.length === 0,
    durationMs: Math.round(performance.now() - startedAt),
    totalFiles: files.length,
    tempAndDebugFiles,
    rootSprawl,
    packageScripts,
    orphanScripts,
    hollowTests,
    hardViolations,
  };
}

export function formatHygieneReport(report) {
  const lines = [
    `[repo-hygiene] 저장소 위생 감사 완료 (${report.durationMs}ms, 전체 ${report.totalFiles.toLocaleString("en-US")}개 파일)`,
    `- 임시·디버그·개인경로 파일: ${report.tempAndDebugFiles.length}건`,
    `- 루트 파일 현황: 총 ${report.rootSprawl.totalRootFiles}개 (playwright=${report.rootSprawl.playwrightConfigs}, tsconfig=${report.rootSprawl.tsconfigFiles}, vitest=${report.rootSprawl.vitestFiles}, env=${report.rootSprawl.envFiles}, 중복설정쌍=${report.rootSprawl.duplicateConfigPairs.length})`,
    `- package.json 스크립트(${report.packageScripts.totalRootScripts}개): 죽은경로=${report.packageScripts.missingPaths.length}, 죽은하위스크립트=${report.packageScripts.missingSubscripts.length}, 죽은워크스페이스=${report.packageScripts.missingWorkspaceScripts.length}, 중복명령=${report.packageScripts.duplicateCommands.length}, 미사용별칭=${report.packageScripts.unusedAliasWrappers.length}`,
    `- scripts/ 위생(전체 ${report.orphanScripts.totalScripts}개, 최상위 ${report.orphanScripts.topLevelScripts}개): 죽은고아=${report.orphanScripts.deadOrphanScripts.length}건, 수동CLI후보(미참조 최상위)=${report.orphanScripts.unreferencedTopLevelScripts.length}건`,
    `- 테스트 위생(전체 ${report.hollowTests.scannedTestFiles.toLocaleString("en-US")}개): 항상참=${report.hollowTests.tautologyOnly.length}, assertion0=${report.hollowTests.zeroAssertions.length}, 빈블록=${report.hollowTests.emptyBodies.length}, only방치=${report.hollowTests.exclusiveOnly.length}, 디버그프로브=${report.hollowTests.debugProbeTests.length}`,
  ];
  if (report.rootSprawl.duplicateConfigPairs.length > 0) {
    lines.push(
      `  참고(루트 중복 설정 쌍): ${report.rootSprawl.duplicateConfigPairs.map((pair) => pair.join(" / ")).join(", ")}`,
    );
  }
  if (report.hardViolations.length > 0) {
    lines.push("", `위생 게이트 위반 ${report.hardViolations.length}건:`);
    for (const violation of report.hardViolations) lines.push(`  - ${violation}`);
    lines.push("", "복구 안내: 위 파일을 정리하거나 유효한 실행 경로에 연결한 뒤 `pnpm run audit:repo-hygiene:check`를 다시 실행하세요.");
  } else {
    lines.push("", "위생 게이트 통과: 차단 위반 0건.");
  }
  return lines.join("\n");
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "사용법: node scripts/audit-repo-hygiene.mjs [--check] [--json] [--strict-orphans] [--max-root-files <N>] [--root <dir>]",
    );
    return;
  }
  const report = await auditRepoHygiene(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatHygieneReport(report));
  if (options.check && !report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[repo-hygiene] 실행 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
