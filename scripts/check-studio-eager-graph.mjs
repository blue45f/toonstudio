#!/usr/bin/env node
/**
 * Studio 진입 그래프 래칫 — 빌드 없이 PR 시점에 번들 성장의 원인을 드러낸다.
 *
 * 앱 진입(apps/web/index.html 의 module script)과 Studio 어댑터(studio-legacy-editor-adapter.tsx)에서
 * 정적 import / export-from 만 따라가 "첫 청크 그래프에 동기로 묶이는 1부 모듈"을 계산하고
 * scripts/studio-eager-graph-baseline.json 보다 나빠지면 실패한다. 위반에는 어떤 import 한 줄이
 * 모듈을 끌어왔는지(최단 경로)가 함께 나온다.
 *
 *   node scripts/check-studio-eager-graph.mjs                       검사(기본)
 *   node scripts/check-studio-eager-graph.mjs --tighten             줄어든 값만 기준선에 잠금
 *   node scripts/check-studio-eager-graph.mjs --update-baseline --reason "<사유>"
 *                                                                  늘어난 값을 사유와 함께 수용(최초 기록 포함)
 *   옵션: --dry-run 기준선을 쓰지 않고 변경 내용만 보기(--tighten/--update-baseline 과 함께),
 *         --verbose 전체 표, --json 기계 판독 출력, --root <dir>, --baseline <path>
 *
 * 종료 코드: 0 통과 / 1 래칫 위반 / 2 사용법·기준선·환경 오류.
 * 정책: 번들 바이트는 텔레메트리지만(scripts/check-studio-bundle.mjs 상단 정책 주석) 그리기 입력 경로 밖의
 * 정적 성장은 PR 에서 보이게 한다. 드로잉 핫패스(브러시·포인터·합성)는 이 가드레일의 개선 대상이 아니다.
 * 해설: docs/engineering/code-structure-and-bundle-patterns.md
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEagerGraph } from "./lib/studio-eager-graph.mjs";
import {
  BASELINE_NOTE, BaselineError, evaluateRatchet, measureGraph, tightenBaseline, updateBaseline, validateBaseline,
} from "./lib/studio-eager-graph-ratchet.mjs";
import { FIX_GUIDE_LINES, formatSummary, formatViolation } from "./lib/studio-eager-graph-report.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASELINE = "scripts/studio-eager-graph-baseline.json";
const USAGE = [
  "사용법: node scripts/check-studio-eager-graph.mjs [--tighten | --update-baseline --reason \"<사유>\"]",
  "        [--dry-run] [--verbose] [--json] [--root <dir>] [--baseline <path>]",
].join("\n");

class UsageError extends Error {}

export function parseArguments(argv) {
  const options = {
    update: false, tighten: false, dryRun: false, verbose: false, json: false, reason: "", root: DEFAULT_ROOT, baseline: DEFAULT_BASELINE,
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
    else if (argument === "--verbose") options.verbose = true;
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
    throw new BaselineError(`기준선을 읽을 수 없습니다(${path.relative(process.cwd(), file) || file}): ${error.message}`);
  }
}

function writeBaseline(file, baseline) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
}

function currentCommit(root) {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "알 수 없음";
  }
}

function run(options, log) {
  const started = performance.now();
  const baselinePath = path.resolve(options.root, options.baseline);
  const graph = buildEagerGraph({ root: options.root });
  const measurement = measureGraph(graph);
  const elapsedMs = Math.round(performance.now() - started);
  let baseline = readBaseline(baselinePath);

  if (options.update) {
    const result = updateBaseline(baseline, measurement, { reason: options.reason });
    if (!options.dryRun) writeBaseline(baselinePath, result.baseline);
    log(`기준선을 갱신${options.dryRun ? "합니다(dry-run: 파일은 쓰지 않았습니다)" : "했습니다"}: ${path.relative(options.root, baselinePath)}`
      + ` (${measurement.totals.modules}개 모듈, 기준 커밋 ${currentCommit(options.root)}, ${elapsedMs}ms)`);
    if (result.increases.length > 0) log(`  사유와 함께 수용한 증가: ${result.increases.join(", ")}`);
    return 0;
  }
  if (!baseline) {
    throw new BaselineError(
      `기준선이 없습니다: ${options.baseline}\n  최초 기록: node scripts/check-studio-eager-graph.mjs --update-baseline --reason "최초 기준선"`,
    );
  }

  const tightenedChanges = [];
  if (options.tighten) {
    const tightened = tightenBaseline(baseline, measurement);
    if (!options.dryRun) writeBaseline(baselinePath, { ...tightened.baseline, note: BASELINE_NOTE });
    tightenedChanges.push(...tightened.changes);
    baseline = tightened.baseline;
  }

  const evaluation = evaluateRatchet({ measurement, baseline, graph });
  const failed = evaluation.violations.length > 0;
  if (options.json) {
    log(JSON.stringify({
      ok: !failed,
      elapsedMs,
      totals: measurement.totals,
      entryTotals: measurement.entryTotals,
      forbidden: Object.fromEntries(Object.entries(measurement.forbidden).map(([prefix, value]) => [prefix, value.modules])),
      lazyInvalidated: measurement.lazyInvalidated.length,
      opaqueDynamicImports: graph.opaqueDynamic,
      violations: evaluation.violations,
      improvements: evaluation.improvements,
    }, null, 2));
    return failed ? 1 : 0;
  }

  const lines = [`Studio 진입 그래프 래칫 ${failed ? "실패" : "통과"} (정적 import 만 · 빌드 없음 · ${elapsedMs}ms)`];
  if (failed) {
    lines.push("", `위반 ${evaluation.violations.length}건`);
    for (const violation of evaluation.violations) lines.push("", ...formatViolation(violation));
    lines.push("", ...FIX_GUIDE_LINES);
  }
  lines.push("", ...formatSummary({ graph, measurement, baseline, verbose: options.verbose, compact: failed && !options.verbose }));
  if (tightenedChanges.length > 0) {
    lines.push("", `기준선을 ${options.dryRun ? "낮출 수 있습니다(dry-run: 파일은 쓰지 않았습니다)" : "낮췄습니다"}: ${tightenedChanges.join(" · ")}`);
  } else if (evaluation.improvements.length > 0 && !options.tighten) {
    lines.push("", `개선됨: ${evaluation.improvements.join(" · ")}`, "  기준선에 잠그려면: node scripts/check-studio-eager-graph.mjs --tighten");
  }
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
    if (caught instanceof UsageError) error(`${caught.message}\n${USAGE}`);
    else error(caught instanceof Error ? caught.message : String(caught));
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
