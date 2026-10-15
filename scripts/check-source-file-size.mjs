#!/usr/bin/env node
/**
 * 소스 파일 크기 래칫 — 파일이 다시 커지는 것을 PR 시점에, 빌드 없이 몇 초 안에 막는다.
 *
 * 규칙: 새 파일/기준선 밖 파일은 800줄 이하, 기준선에 기록된 기존 초과 파일은 기록 줄 수보다 늘 수 없고,
 * 새 `// @ts-nocheck` 를 둘 수 없다(기존 파일은 scripts/source-file-size-baseline.json 목록).
 *
 *   node scripts/check-source-file-size.mjs                       검사(기본)
 *   node scripts/check-source-file-size.mjs --tighten             줄어든 값만 기준선에 잠금(정리 포함)
 *   node scripts/check-source-file-size.mjs --update-baseline --reason "<사유>"
 *                                                                 새 초과 파일 등록(증가는 거부, 최초 기록 포함)
 *   옵션: --dry-run 기준선을 쓰지 않고 변경 내용만 보기(--tighten/--update-baseline 과 함께),
 *         --json 기계 판독 출력, --root <dir>, --baseline <path>
 *
 * 종료 코드: 0 통과 / 1 래칫 위반 또는 갱신 거부 / 2 사용법·기준선·환경 오류.
 * 해설: docs/engineering/code-structure-and-bundle-patterns.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixGuideLines, formatSummary, formatViolations } from "./lib/source-file-size-report.mjs";
import {
  BaselineError, evaluateSizes, RefusedError, rewriteBaseline, validateBaseline,
} from "./lib/source-file-size-ratchet.mjs";
import { listCandidateFiles, measureSourceFiles, SOURCE_FILE_SIZE_LIMIT } from "./lib/source-file-size-scan.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASELINE = "scripts/source-file-size-baseline.json";
const USAGE = [
  "사용법: node scripts/check-source-file-size.mjs [--tighten | --update-baseline --reason \"<사유>\"]",
  "        [--dry-run] [--json] [--root <dir>] [--baseline <path>]",
].join("\n");

class UsageError extends Error {}

export function parseArguments(argv) {
  const options = {
    update: false, tighten: false, dryRun: false, json: false, reason: "", root: DEFAULT_ROOT, baseline: DEFAULT_BASELINE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${argument} 에는 값이 필요합니다.`);
      index += 1;
      return value;
    };
    if (argument === "--update-baseline") options.update = true;
    else if (argument === "--tighten") options.tighten = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--reason") options.reason = takeValue();
    else if (argument === "--root") options.root = path.resolve(takeValue());
    else if (argument === "--baseline") options.baseline = takeValue();
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new UsageError(`알 수 없는 인자: ${argument}`);
  }
  if (options.update && options.tighten) throw new UsageError("--update-baseline 과 --tighten 은 함께 쓸 수 없습니다.");
  if (options.reason && !options.update) throw new UsageError("--reason 은 --update-baseline 과 함께만 쓸 수 있습니다.");
  if (options.dryRun && !options.update && !options.tighten) throw new UsageError("--dry-run 은 --tighten 또는 --update-baseline 과 함께만 쓸 수 있습니다.");
  return options;
}

function readBaseline(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return validateBaseline(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    if (error instanceof BaselineError) throw error;
    throw new BaselineError(`기준선을 읽을 수 없습니다(${file}): ${error.message}`);
  }
}

function writeBaseline(file, baseline) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
}

function run(options, log) {
  const started = performance.now();
  const baselinePath = path.resolve(options.root, options.baseline);
  const measurements = measureSourceFiles(options.root, listCandidateFiles(options.root));
  let baseline = readBaseline(baselinePath);
  const relativeBaseline = path.relative(options.root, baselinePath) || options.baseline;

  if (options.update || options.tighten) {
    if (!baseline && !options.update) {
      throw new BaselineError(`기준선이 없습니다: ${relativeBaseline}\n  최초 기록: node scripts/check-source-file-size.mjs --update-baseline --reason "최초 기준선"`);
    }
    const result = rewriteBaseline({
      baseline, measurements, mode: options.update ? "update" : "tighten", reason: options.reason, limit: SOURCE_FILE_SIZE_LIMIT,
    });
    if (!options.dryRun) writeBaseline(baselinePath, result.baseline);
    baseline = result.baseline;
    log([
      `기준선을 ${options.update ? "갱신" : "낮춤"}${options.dryRun ? "(dry-run: 파일은 쓰지 않았습니다)" : "했습니다"}: ${relativeBaseline}`,
      `  낮춘 파일 ${result.lowered.length}개 · 정리한 항목 ${result.dropped.length}개 · 새로 등록 ${result.registered.length}개`,
      ...result.lowered.slice(0, 10).map((item) => `    ↓ ${item.file}: ${item.from.toLocaleString("en-US")} → ${item.to.toLocaleString("en-US")}줄`),
      ...result.registered.slice(0, 10).map((file) => `    + ${file}`),
    ].join("\n"));
    if (options.update) return 0;
  }
  if (!baseline) {
    throw new BaselineError(`기준선이 없습니다: ${relativeBaseline}\n  최초 기록: node scripts/check-source-file-size.mjs --update-baseline --reason "최초 기준선"`);
  }

  const evaluation = evaluateSizes({ measurements, baseline });
  const elapsedMs = Math.round(performance.now() - started);
  const failed = evaluation.violations.length > 0;
  if (options.json) {
    log(JSON.stringify({ ok: !failed, elapsedMs, ...evaluation }, null, 2));
    return failed ? 1 : 0;
  }

  const lines = [
    `소스 파일 크기 래칫 ${failed ? "실패" : "통과"} (상한 ${baseline.limit}줄 · 대상 ${evaluation.summary.scanned.toLocaleString("en-US")}개 · ${elapsedMs}ms)`,
  ];
  if (failed) {
    lines.push("", `위반 ${evaluation.violations.length}건`, ...formatViolations(evaluation.violations), "", ...fixGuideLines(baseline.limit));
  }
  lines.push("", ...formatSummary(evaluation));
  log(lines.join("\n"));
  return failed ? 1 : 0;
}

export function main(argv = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      log(USAGE);
      return 0;
    }
    return run(options, log);
  } catch (caught) {
    if (caught instanceof UsageError) {
      error(`${caught.message}\n${USAGE}`);
      return 2;
    }
    error(caught instanceof Error ? caught.message : String(caught));
    return caught instanceof RefusedError ? 1 : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
