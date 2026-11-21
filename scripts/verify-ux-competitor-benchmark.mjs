#!/usr/bin/env node
/**
 * ToonStudio vs 경쟁사 6종(Clip Studio Paint · Canva Magic Studio · Figma · Tooning · Plotr · Procreate)
 * 10대 축(총 100점) 실측 UI/UX 정량 벤치마크 스코어링 러너.
 *
 * - ToonStudio 점수는 저장소 소스·CSS·컴포넌트·번들 진입 그래프·테스트·검증 스크립트를 직접 스캔해 실측한다.
 * - 경쟁사 6종 기준선은 공개 공식 구조 지표(public-structural-rubric)로 투명하게 정의하며 허구 수치를 배제한다.
 * - 95점 미만(또는 `--min-score <N>` 미만)이거나 경쟁사 대비 우위 미달 시 `BLOCKED` 판정과 함께
 *   구체적 개선 액션 목록을 콘솔 표 + JSON으로 출력하고 종료 코드 1을 반환한다.
 *
 * 사용법:
 *   node scripts/verify-ux-competitor-benchmark.mjs
 *   node scripts/verify-ux-competitor-benchmark.mjs --min-score 95
 *   node scripts/verify-ux-competitor-benchmark.mjs --json
 *   node scripts/verify-ux-competitor-benchmark.mjs --root <dir> --min-score 95 --write-json <path>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPETITOR_PROFILES,
  DEFAULT_MIN_SCORE,
  TOTAL_MAX_SCORE,
  UX_BENCHMARK_AXES,
  UX_BENCHMARK_SCHEMA_VERSION,
  computeCompetitorDeltas,
  round1,
  summarizeCompetitorBaselines,
  validateRubricIntegrity,
} from "./lib/ux-competitor-benchmark-rubric.mjs";
import { runAllAxisScanners } from "./lib/ux-competitor-benchmark-scanners.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = [
  "사용법: node scripts/verify-ux-competitor-benchmark.mjs",
  "        [--min-score <0..100>] [--json] [--root <dir>] [--write-json <path>] [--help]",
].join("\n");

class UsageError extends Error {}

export function parseArguments(argv) {
  const options = {
    minScore: DEFAULT_MIN_SCORE,
    json: false,
    root: DEFAULT_ROOT,
    writeJson: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${arg} 옵션에는 값이 필요합니다.`);
      }
      index += 1;
      return value;
    };
    if (arg === "--min-score") {
      const raw = takeValue();
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > TOTAL_MAX_SCORE) {
        throw new UsageError(`--min-score 값은 0~${TOTAL_MAX_SCORE} 사이 숫자여야 합니다: ${raw}`);
      }
      options.minScore = parsed;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      options.root = path.resolve(takeValue());
    } else if (arg === "--write-json") {
      options.writeJson = path.resolve(takeValue());
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new UsageError(`알 수 없는 인자: ${arg}`);
    }
  }
  return options;
}

export function evaluateUxCompetitorBenchmark({
  root = DEFAULT_ROOT,
  minScore = DEFAULT_MIN_SCORE,
  eagerGraphOverride = null,
} = {}) {
  const rubricCheck = validateRubricIntegrity();
  if (!rubricCheck.ok) {
    throw new Error(`루브릭 무결성 오류: ${rubricCheck.errors.join("; ")}`);
  }

  const startedAt = performance.now();
  const axes = runAllAxisScanners(root, { eagerGraphOverride });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const totalScore = round1(axes.reduce((sum, axis) => sum + axis.score, 0));
  const deltas = computeCompetitorDeltas(axes);
  const baselines = summarizeCompetitorBaselines();

  const improvementActions = axes
    .flatMap((axis) => axis.remediations)
    .sort((a, b) => b.potentialGain - a.potentialGain || a.axisOrder - b.axisOrder);

  const meetsMinScore = totalScore >= minScore;
  const beatsAllOverall = deltas.beatsAllCompetitorsOverall;
  const ok = meetsMinScore && beatsAllOverall;
  const verdict = ok ? "PASS" : "BLOCKED";

  const blockReasons = [];
  if (!meetsMinScore) {
    blockReasons.push(
      `실측 총점 ${totalScore.toFixed(1)}점이 최소 게이트 기준 ${minScore.toFixed(1)}점 미만입니다 (부족분 ${round1(minScore - totalScore).toFixed(1)}점).`,
    );
  }
  if (!beatsAllOverall) {
    const trailing = deltas.overall
      .filter((entry) => entry.delta <= 0)
      .map((entry) => `${entry.competitorName}(${entry.delta >= 0 ? "+" : ""}${entry.delta.toFixed(1)})`);
    blockReasons.push(`일부 경쟁사 대비 우위 미달: ${trailing.join(", ")}`);
  }

  return {
    schema: UX_BENCHMARK_SCHEMA_VERSION,
    verdict,
    ok,
    elapsedMs,
    minScore,
    blockReasons,
    toonStudio: {
      measurementMode: "measured-from-repository",
      totalScore,
      maxScore: TOTAL_MAX_SCORE,
      passingAxisCount: axes.filter((axis) => axis.status === "PASS").length,
      axisCount: axes.length,
      axes,
    },
    competitors: baselines.competitors,
    deltas,
    improvementActions,
    methodology: {
      toonStudio: "저장소 실제 소스·CSS·컴포넌트·라우트·진입 그래프·스크립트 직접 정적 스캔 실측",
      competitors: "공개 공식 문서 및 배포 구조 기반 10대 축 구조적 능력 루브릭 (허구 설문·추정치 0건)",
      axes: UX_BENCHMARK_AXES.map((axis) => ({
        order: axis.order,
        id: axis.id,
        titleKo: axis.titleKo,
        maxScore: axis.maxScore,
      })),
    },
  };
}

function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60);
    width += wide ? 2 : 1;
  }
  return width;
}

function padEndDisplay(text, targetWidth) {
  const str = String(text);
  const missing = Math.max(0, targetWidth - displayWidth(str));
  return `${str}${" ".repeat(missing)}`;
}

function padStartDisplay(text, targetWidth) {
  const str = String(text);
  const missing = Math.max(0, targetWidth - displayWidth(str));
  return `${" ".repeat(missing)}${str}`;
}

function formatDelta(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}`;
}

export function formatConsoleReport(report) {
  const lines = [];
  const { toonStudio, deltas, improvementActions } = report;

  lines.push("================================================================================");
  lines.push(
    `ToonStudio vs 경쟁사 6종 UI/UX 실측 벤치마크 [${report.verdict}] (${report.elapsedMs}ms)`,
  );
  lines.push(
    `실측 총점: ${toonStudio.totalScore.toFixed(1)} / ${toonStudio.maxScore}  |  게이트 기준: >= ${report.minScore.toFixed(1)}  |  최상위 경쟁사(${deltas.highestCompetitor.name} ${deltas.highestCompetitor.totalScore.toFixed(1)}) 대비: ${formatDelta(deltas.deltaVsHighestCompetitor)}`,
  );
  lines.push("================================================================================");

  if (report.blockReasons.length > 0) {
    lines.push("");
    lines.push("[BLOCKED 사유]");
    for (const reason of report.blockReasons) {
      lines.push(`  - ${reason}`);
    }
  }

  lines.push("");
  lines.push("[1] 10대 실측 평가 축 & 경쟁사 6종 대비 점수표 (각 축 10점 만점)");
  const axisHeader = [
    padEndDisplay("축", 26),
    padStartDisplay("Toon", 6),
    ...COMPETITOR_PROFILES.map((c) => padStartDisplay(c.shortName, 9)),
    padStartDisplay("Δ최고경쟁", 9),
    padStartDisplay("상태", 7),
  ].join(" | ");
  lines.push(axisHeader);
  lines.push("-".repeat(displayWidth(axisHeader)));

  for (const row of deltas.perAxis) {
    const axisResult = toonStudio.axes.find((item) => item.axisId === row.axisId);
    const label = `${String(row.order).padStart(2, "0")}. ${row.shortKo}`;
    const line = [
      padEndDisplay(label, 26),
      padStartDisplay(row.toonStudioScore.toFixed(1), 6),
      ...COMPETITOR_PROFILES.map((c) =>
        padStartDisplay(row.byCompetitor[c.id].score.toFixed(1), 9),
      ),
      padStartDisplay(formatDelta(row.deltaVsBestCompetitor), 9),
      padStartDisplay(axisResult?.status === "PASS" ? "PASS" : "IMPROVE", 7),
    ].join(" | ");
    lines.push(line);
  }

  lines.push("");
  lines.push("[2] 경쟁사 6종 종합 점수 대비 격차(Delta)");
  const compHeader = [
    padEndDisplay("경쟁 제품", 22),
    padStartDisplay("기준선", 8),
    padStartDisplay("ToonStudio", 10),
    padStartDisplay("격차(Delta)", 11),
    padStartDisplay("우위 판정", 9),
  ].join(" | ");
  lines.push(compHeader);
  lines.push("-".repeat(displayWidth(compHeader)));
  for (const item of deltas.overall) {
    lines.push(
      [
        padEndDisplay(item.competitorName, 22),
        padStartDisplay(item.competitorTotal.toFixed(1), 8),
        padStartDisplay(item.toonStudioTotal.toFixed(1), 10),
        padStartDisplay(formatDelta(item.delta), 11),
        padStartDisplay(item.leadStatus, 9),
      ].join(" | "),
    );
  }

  lines.push("");
  if (improvementActions.length === 0) {
    lines.push("[3] 개선 필요 액션 목록: 0건 (10대 축 전수 만점 · 압도적 우위 검증 완료)");
  } else {
    lines.push(`[3] 95점 목표 달성을 위한 구체적 개선 액션 목록 (${improvementActions.length}건, 회복 가능 점수순)`);
    for (const [idx, action] of improvementActions.entries()) {
      const filesText = action.targetFiles.length > 0 ? ` [대상: ${action.targetFiles.join(", ")}]` : "";
      lines.push(
        `  ${idx + 1}. [축 ${action.axisOrder} · +${action.potentialGain.toFixed(1)}점] ${action.checkLabelKo}`,
      );
      lines.push(`     → ${action.actionKo}${filesText}`);
    }
  }

  lines.push("");
  lines.push("[측정 투명성]");
  lines.push(`  - ToonStudio: ${report.methodology.toonStudio}`);
  lines.push(`  - 경쟁사 6종: ${report.methodology.competitors}`);
  return lines.join("\n");
}

function buildCompactJsonSummary(report) {
  return {
    schema: report.schema,
    verdict: report.verdict,
    ok: report.ok,
    minScore: report.minScore,
    toonStudioTotal: report.toonStudio.totalScore,
    highestCompetitor: {
      name: report.deltas.highestCompetitor.name,
      score: report.deltas.highestCompetitor.totalScore,
      delta: report.deltas.deltaVsHighestCompetitor,
    },
    axisScores: Object.fromEntries(
      report.toonStudio.axes.map((axis) => [axis.axisId, axis.score]),
    ),
    competitorDeltas: Object.fromEntries(
      report.deltas.overall.map((entry) => [
        entry.competitorId,
        { competitorTotal: entry.competitorTotal, delta: entry.delta, leadStatus: entry.leadStatus },
      ]),
    ),
    improvementActionCount: report.improvementActions.length,
    improvementActions: report.improvementActions,
  };
}

export function main(argv = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      log(USAGE);
      return 0;
    }
    const report = evaluateUxCompetitorBenchmark({
      root: options.root,
      minScore: options.minScore,
    });

    if (options.writeJson) {
      fs.mkdirSync(path.dirname(options.writeJson), { recursive: true });
      fs.writeFileSync(options.writeJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    if (options.json) {
      log(JSON.stringify(report, null, 2));
    } else {
      log(formatConsoleReport(report));
      log("");
      log("[4] JSON 요약");
      log(JSON.stringify(buildCompactJsonSummary(report), null, 2));
    }
    return report.ok ? 0 : 1;
  } catch (caught) {
    if (caught instanceof UsageError) {
      error(`${caught.message}\n${USAGE}`);
      return 2;
    }
    error(`벤치마크 실행 오류: ${caught instanceof Error ? caught.message : String(caught)}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
