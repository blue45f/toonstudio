#!/usr/bin/env node
/**
 * 수정 효과 시뮬레이션과 시간 지표 하한. 보고서(report.json)의 측정 사실만 다시 채점하므로 브라우저·스택이 필요 없다.
 *
 * - what-if: 위반 유형 하나를 (선택한 라우트·뷰포트의) 칸에서 고쳤다고 가정하고 rubric.mjs 로 다시 채점해 합계가 얼마나 오르는지 계산한다.
 *   기준선 문서의 "영향 점수"가 이 계산이다. 점수 규칙은 바꾸지 않고 측정 사실만 바꿔 넣는다.
 * - 하한: 개발 서버라서 점수에서 뺀 시간 지표(CLS·LCP·화면 준비 시간·여정 소요 시간)를 모두 최악이라고 가정한 합계.
 *   시간 지표를 뺀 합계는 낙관 쪽 값이므로 점수는 [하한, 보고서 합계] 사이에 있다고 읽는다.
 *
 * 사용: node scripts/ux-audit/what-if.mjs <report.json> [--type 유형] [--routes a,b] [--viewports mobile,desktop]
 *                                          [--match 문자열] [--tap-floor 40] [--roadmap N] [--json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scoreCells, summarize } from "./aggregate.mjs";
import { RUBRIC, isNameRule } from "./rubric.mjs";

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const clone = (value) => JSON.parse(JSON.stringify(value));

export class WhatIfUsageError extends Error {}

/**
 * `--match` 는 문자열 조각이다. 명령행 인자로 정규식을 만들면 정규식 주입(CodeQL js/regex-injection)이라 쓰지 않고,
 * 대소문자를 무시한 부분 문자열 일치만 본다. 내부에서는 RegExp 처럼 `test()` 로 부른다.
 * @param {string} needle
 */
export function literalMatcher(needle) {
  const lowered = String(needle).toLowerCase();
  return { test: (text) => String(text ?? "").toLowerCase().includes(lowered), toString: () => String(needle) };
}

export const WHAT_IF_USAGE = [
  "사용법: node scripts/ux-audit/what-if.mjs <report.json> [옵션]",
  "",
  "  --type 유형          이 유형만 계산한다(예: tap-targets, focus-visibility, axe:scrollable-region-focusable). 기본: 보고서에 나온 모든 유형",
  "  --routes a,b         이 라우트 id 의 칸에서만 고쳤다고 가정한다(기본 전체)",
  "  --viewports mobile   이 뷰포트 id 의 칸에서만 고쳤다고 가정한다(기본 전체)",
  "  --match 문자열       포커스 표시 없음·겹침 유형에서 표본(요소·가린 요소)에 이 문자열이 들어 있는 것만 고쳤다고 가정한다(대소문자 무시, 정규식 아님)",
  "  --tap-floor 40|24    탭 대상 유형에서 이 크기(px) 이상인 컨트롤은 44px 로 올렸다고 가정한다(40 이면 40~44px 구간만 해소)",
  "  --roadmap N          회수 점수가 큰 유형부터 N개를 차례로 고쳤을 때의 누적 합계도 출력한다(기본 8, 0 이면 생략)",
  "  --json               표 대신 JSON 으로 출력한다",
  "  --help               이 도움말",
].join("\n");

/** @param {readonly string[]} argv */
export function parseWhatIfArguments(argv) {
  const options = { report: null, type: null, routeIds: [], viewportIds: [], match: null, tapFloor: null, roadmap: 8, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      if (options.report !== null) throw new WhatIfUsageError(`보고서는 하나만 지정할 수 있습니다: ${argument}`);
      options.report = argument;
      continue;
    }
    const name = argument.slice(2);
    if (name === "json" || name === "help") {
      options[name] = true;
      continue;
    }
    if (!["type", "routes", "viewports", "match", "tap-floor", "roadmap"].includes(name)) throw new WhatIfUsageError(`알 수 없는 옵션: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new WhatIfUsageError(`--${name} 에는 값이 필요합니다.`);
    index += 1;
    if (name === "type") options.type = value;
    else if (name === "routes") options.routeIds = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    else if (name === "viewports") options.viewportIds = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    else if (name === "match") options.match = literalMatcher(value);
    else if (name === "tap-floor") {
      options.tapFloor = Number(value);
      if (![24, 40].includes(options.tapFloor)) throw new WhatIfUsageError("--tap-floor 는 24 또는 40 이어야 합니다.");
    } else {
      options.roadmap = Number(value);
      if (!Number.isInteger(options.roadmap) || options.roadmap < 0) throw new WhatIfUsageError("--roadmap 은 0 이상의 정수여야 합니다.");
    }
  }
  if (!options.help && options.report === null) throw new WhatIfUsageError("보고서(report.json) 경로가 필요합니다.");
  if ((options.match || options.tapFloor) && options.type === null) throw new WhatIfUsageError("--match 와 --tap-floor 는 --type 과 함께 써야 합니다.");
  return options;
}

/** 채점 전 측정 사실만 남긴다(보고서의 칸에는 score 가 붙어 있다). */
export function stripScore(cell) {
  const copy = { ...cell };
  delete copy.score;
  return copy;
}

const SIMPLE_TYPES = new Set([
  "unnamed-controls", "heading-hierarchy", "landmarks", "focus-visibility", "keyboard-trap",
  "horizontal-scroll", "clipped-elements", "obscured-controls", "tap-targets",
  "raw-color-classes", "undeclared-tokens", "inline-colors",
  "console-errors", "console-warnings", "failed-requests", "route-readiness",
  "raw-keys", "empty-buttons", "english-sentences",
]);

/** 이 도구가 "고쳤다고 가정"할 수 있는 유형인지(axe:<규칙> 포함). 여정 항목과 화면 열기 실패는 지원하지 않는다. */
export function isSupportedType(type) {
  return typeof type === "string" && (SIMPLE_TYPES.has(type) || /^axe:[a-z0-9-]+$/u.test(type));
}

/**
 * 한 칸에서 유형의 위반을 없앤 복사본을 돌려준다. 해당 위반이 없던 칸은 사실이 그대로인 복사본이다.
 * @param {object} cell 채점 전 측정 사실
 * @param {string} type 위반 유형(rubric 항목 id 또는 axe:<규칙 id>)
 * @param {{ match?: { test(text: string): boolean } | null, tapFloor?: 24 | 40 | null }} [options]
 */
export function fixCell(cell, type, { match = null, tapFloor = null } = {}) {
  if (!isSupportedType(type)) throw new WhatIfUsageError(`지원하지 않는 유형: ${type}`);
  if (match && type !== "focus-visibility" && type !== "obscured-controls") throw new WhatIfUsageError("--match 는 focus-visibility 와 obscured-controls 에만 쓸 수 있습니다.");
  if (tapFloor && type !== "tap-targets") throw new WhatIfUsageError("--tap-floor 는 tap-targets 에만 쓸 수 있습니다.");
  const next = clone(stripScore(cell));
  const { a11y, responsive, visual, performance, copy } = next;
  if (type.startsWith("axe:")) {
    const ruleId = type.slice(4);
    if (a11y?.axe?.violations) a11y.axe.violations = a11y.axe.violations.filter((violation) => violation.id !== ruleId);
    return next;
  }
  switch (type) {
    case "unnamed-controls":
      if (a11y?.axe?.violations) a11y.axe.violations = a11y.axe.violations.filter((violation) => !isNameRule(violation.id));
      break;
    case "heading-hierarchy":
      if (a11y?.headings) Object.assign(a11y.headings, { h1Count: 1, skippedLevels: 0, emptyHeadings: 0 });
      break;
    case "landmarks":
      if (a11y?.landmarks) Object.assign(a11y.landmarks, { mainCount: 1, duplicateGroups: 0 });
      break;
    case "focus-visibility":
      if (a11y?.focus) {
        const hits = match ? (a11y.focus.missingSamples ?? []).filter((sample) => match.test(sample)).length : a11y.focus.noIndicator;
        a11y.focus.noIndicator = Math.max(0, a11y.focus.noIndicator - hits);
        if (!match && a11y.focus.tabStops === 0) a11y.focus.tabStops = 1;
      }
      break;
    case "keyboard-trap":
      if (a11y?.trap) a11y.trap.suspected = false;
      break;
    case "horizontal-scroll":
      if (responsive?.scroll) responsive.scroll.overflowPx = 0;
      break;
    case "clipped-elements":
      if (responsive?.clipped) responsive.clipped.count = 0;
      break;
    case "obscured-controls":
      if (responsive?.obscured) {
        const hits = match
          ? (responsive.obscured.samples ?? []).filter((sample) => match.test(`${sample.element ?? ""} ${sample.cover ?? ""}`)).length
          : responsive.obscured.count;
        responsive.obscured.count = Math.max(0, responsive.obscured.count - hits);
      }
      break;
    case "tap-targets":
      if (responsive?.tapTargets) {
        const tap = responsive.tapTargets;
        if (tapFloor === 40) tap.small44 = Math.min(tap.small44 ?? 0, tap.small40 ?? 0);
        else if (tapFloor === 24) tap.small44 = Math.min(tap.small44 ?? 0, tap.small24 ?? 0);
        else tap.small44 = 0;
      }
      break;
    case "raw-color-classes":
      if (visual?.rawColorClasses) visual.rawColorClasses.distinct = 0;
      break;
    case "undeclared-tokens":
      if (visual?.undeclaredTokens) visual.undeclaredTokens.distinct = 0;
      break;
    case "inline-colors":
      if (visual?.inlineColors) visual.inlineColors.elements = 0;
      break;
    case "console-errors":
      if (performance) performance.consoleErrors = 0;
      break;
    case "console-warnings":
      if (performance) performance.consoleWarnings = 0;
      break;
    case "failed-requests":
      if (performance) performance.failedRequests = 0;
      break;
    case "route-readiness":
      if (performance) performance.routeState = "ready";
      break;
    case "raw-keys":
      if (copy) Object.assign(copy, { rawKeys: 0, placeholderLeaks: 0 });
      break;
    case "empty-buttons":
      if (copy) copy.emptyButtons = 0;
      break;
    case "english-sentences":
      if (copy) copy.englishSentences = 0;
      break;
    default:
      break;
  }
  return next;
}

/** 보고서의 라우트 목록을 aggregate.summarize 가 받는 형식으로. 라벨·그룹은 화면별 점수 요약에서 가져온다. */
function routesOf(report) {
  const known = new Map(report.summary.routeScores.map((entry) => [entry.routeId, entry]));
  return report.plan.routes.map((route) => ({
    id: route.id,
    path: route.path,
    auth: route.auth,
    label: known.get(route.id)?.label ?? route.id,
    group: known.get(route.id)?.group ?? "",
  }));
}

/** 측정 사실(cells)을 보고서와 같은 조건으로 다시 채점해 요약을 돌려준다. */
export function rescore(report, cells, { timingTrusted = report.environment.timingTrusted, journeys = report.journeys } = {}) {
  const scoredCells = scoreCells(cells.map(stripScore), { timingTrusted });
  return summarize({ scoredCells, routes: routesOf(report), viewports: report.plan.viewports, journeyResults: journeys, timingTrusted });
}

/** 보고서에 나온 위반 유형 목록(영향 칸·화면·건수). */
export function violationTypes(report) {
  const groups = new Map();
  for (const cell of report.cells) {
    for (const violation of cell.score?.violations ?? []) {
      if (!(violation.lost > 0) || violation.type === "page-load-failed") continue;
      const group = groups.get(violation.type) ?? { type: violation.type, label: violation.label, category: violation.category, cells: 0, routeIds: new Set(), count: 0 };
      group.cells += 1;
      group.routeIds.add(cell.routeId);
      group.count += violation.count;
      groups.set(violation.type, group);
    }
  }
  return [...groups.values()].map((group) => ({ type: group.type, label: group.label, category: group.category, cells: group.cells, routes: group.routeIds.size, count: group.count }));
}

/**
 * 한 유형을 범위 안의 칸에서 고쳤다고 가정했을 때의 합계 변화.
 * @param {object} report
 * @param {string} type
 * @param {{ routeIds?: readonly string[], viewportIds?: readonly string[], match?: { test(text: string): boolean } | null, tapFloor?: 24 | 40 | null }} [scope]
 */
export function simulateFix(report, type, { routeIds = [], viewportIds = [], match = null, tapFloor = null } = {}) {
  const inScope = (cell) => (routeIds.length === 0 || routeIds.includes(cell.routeId)) && (viewportIds.length === 0 || viewportIds.includes(cell.viewportId));
  const baseTotal = rescore(report, report.cells).total;
  const cells = report.cells.map((cell) => (inScope(cell) ? fixCell(cell, type, { match, tapFloor }) : stripScore(cell)));
  const total = rescore(report, cells).total;
  return { type, cellsInScope: report.cells.filter(inScope).length, baseTotal, total, gain: round2(total - baseTotal) };
}

/** 보고서에 나온 모든 유형에 대해 회수 가능 점수를 계산해 큰 순서로 돌려준다(동점이면 유형 이름 순). 지원하지 않는 유형은 gain=null. */
export function computeWhatIf(report, scope = {}) {
  const rows = violationTypes(report).map((entry) => {
    if (!isSupportedType(entry.type)) return { ...entry, gain: null };
    return { ...entry, gain: simulateFix(report, entry.type, scope).gain };
  });
  return rows.sort((left, right) => (right.gain ?? -1) - (left.gain ?? -1) || left.type.localeCompare(right.type, "en"));
}

/** 회수 점수가 큰 유형부터 하나씩 더 고쳤을 때의 누적 합계. 상한·환산 때문에 단순 합과 다를 수 있다. */
export function computeRoadmap(report, rows, limit = 8) {
  let cells = report.cells.map(stripScore);
  const steps = [];
  for (const row of rows.filter((entry) => entry.gain !== null).slice(0, limit)) {
    cells = cells.map((cell) => fixCell(cell, row.type));
    steps.push({ type: row.type, label: row.label, total: rescore(report, cells).total });
  }
  return steps;
}

/**
 * 시간 지표(CLS·LCP·화면 준비 시간·여정 소요 시간)를 모두 최악이라고 가정해 다시 채점한 요약.
 * 개발 서버 측정에서는 이 값이 합계의 하한이다. 운영형 서버 측정(timingTrusted=true)에서는 보고서 합계가 이미 시간 지표를 포함한다.
 */
export function computeLowerBound(report) {
  const worstCells = report.cells.map(stripScore).map((cell) => ({
    ...cell,
    performance: cell.performance ? { ...cell.performance, cls: 9, lcpMs: 99_999, interactiveMs: 99_999 } : cell.performance,
  }));
  const worstJourneys = report.journeys.map((journey) => (journey.skipped ? journey : { ...journey, totalMs: 1_000_000_000 }));
  return rescore(report, worstCells, { timingTrusted: true, journeys: worstJourneys });
}

function fmt(value) {
  return value === null || value === undefined ? "-" : Number(value).toFixed(2);
}

/** 사람이 읽는 출력(Markdown 표). */
export function formatWhatIf(report, rows, roadmap, lowerBound, scope = {}) {
  const lines = [];
  lines.push(`보고서: ${report.generatedAt} · 커밋 ${String(report.git?.commit ?? "").slice(0, 12)} · 서버 ${report.environment.server}`);
  lines.push(`합계 ${fmt(report.summary.total)} / ${report.summary.measuredMax}` + (report.environment.timingTrusted ? "" : ` · 시간 지표를 모두 최악으로 가정한 하한 ${fmt(lowerBound.total)}`));
  const scopeText = [scope.routeIds?.length ? `라우트 ${scope.routeIds.join(",")}` : "", scope.viewportIds?.length ? `뷰포트 ${scope.viewportIds.join(",")}` : "", scope.match ? `표본 ${scope.match}` : "", scope.tapFloor ? `탭 대상 ${scope.tapFloor}px 이상은 해소` : ""].filter(Boolean).join(" · ");
  lines.push(`가정 범위: ${scopeText || "전체 칸"}`);
  lines.push("");
  lines.push("| 유형 | 영역 | 영향 칸 | 영향 화면 | 건수 합 | 합계 회수 점수 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(`| ${row.label} (${row.type}) | ${RUBRIC.categories[row.category]?.label ?? row.category} | ${row.cells} | ${row.routes} | ${row.count} | ${row.gain === null ? "계산 안 함" : `+${fmt(row.gain)}`} |`);
  }
  if (roadmap.length > 0) {
    lines.push("");
    lines.push("| 순서 | 추가로 고치는 유형 | 누적 합계 |");
    lines.push("| --- | --- | --- |");
    lines.push(`| 현재 | - | ${fmt(report.summary.total)} |`);
    roadmap.forEach((step, index) => lines.push(`| ${index + 1} | ${step.label} | ${fmt(step.total)} |`));
  }
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const options = parseWhatIfArguments(argv);
  if (options.help) {
    process.stdout.write(`${WHAT_IF_USAGE}\n`);
    return 0;
  }
  const report = JSON.parse(readFileSync(resolve(options.report), "utf8"));
  const scope = { routeIds: options.routeIds, viewportIds: options.viewportIds, match: options.match, tapFloor: options.tapFloor };
  const rows = options.type
    ? [{ ...(violationTypes(report).find((entry) => entry.type === options.type) ?? { type: options.type, label: options.type, category: "", cells: 0, routes: 0, count: 0 }), gain: simulateFix(report, options.type, scope).gain }]
    : computeWhatIf(report, scope);
  const roadmap = options.roadmap > 0 && !options.type && !options.match && !options.tapFloor && options.routeIds.length === 0 && options.viewportIds.length === 0 ? computeRoadmap(report, rows, options.roadmap) : [];
  const lowerBound = computeLowerBound(report);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ total: report.summary.total, lowerBound: lowerBound.total, rows, roadmap }, null, 2)}\n`);
  } else {
    process.stdout.write(formatWhatIf(report, rows, roadmap, lowerBound, scope));
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof WhatIfUsageError) {
      process.stderr.write(`${error.message}\n\n${WHAT_IF_USAGE}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`예기치 못한 오류: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
