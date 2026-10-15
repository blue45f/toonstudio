/**
 * Studio 진입 그래프 가드레일 — 사람이 읽는 보고서.
 *
 * 한 화면에 "무엇이 / 얼마나 / 어떤 import 한 줄이 끌어왔는지 / 어떻게 고치는지"가 보이도록 만든다.
 * 순수 함수(문자열 배열 반환)라 테스트가 출력 계약을 직접 검사한다.
 */
import { compareText } from "./studio-eager-graph.mjs";
import { TOTAL_BYTES_TOLERANCE } from "./studio-eager-graph-policy.mjs";

export const GUIDE_PATH = "docs/engineering/code-structure-and-bundle-patterns.md";
const TOP_FOLDERS = 10;

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`;
const count = (value) => value.toLocaleString("en-US");
const signedKib = (bytes) => `${bytes >= 0 ? "+" : "-"}${kib(Math.abs(bytes))}`;

/** 경로(진입점 → … → 대상)를 들여쓴 화살표 줄로 만든다. */
function formatPath(path, indent) {
  if (path.length === 0) return [`${indent}(경로를 찾지 못했습니다)`];
  return path.map((file, index) => `${indent}${index === 0 ? "  " : "→ "}${file}`);
}

/** 총 크기·앱 셸 크기 위반이 공유하는 본문: 기준선에 없던 모듈 수, 원인 import, 가장 큰 모듈의 최단 경로. */
function formatBytesViolation(violation, heading, newLabel) {
  const lines = [
    `${heading} 현재 ${mib(violation.current)} (${count(violation.current)} B) > 허용 ${count(violation.ceiling)} B`
    + ` (기준선 ${count(violation.baseline)} B + ${(violation.tolerance * 100).toFixed(0)}%)`,
    `  ${newLabel} ${count(violation.newModuleCount)}개가 ${kib(violation.newModuleBytes)} 를 더했습니다.`,
  ];
  if (violation.gateways.length > 0) {
    lines.push("  원인 import (이 한 줄이 새 모듈을 진입 그래프에 끌어왔습니다):");
    for (const gateway of violation.gateways.slice(0, 4)) {
      lines.push(`    ${gateway.from ?? "(진입점)"}  →  ${gateway.to}   [모듈 ${gateway.modules}개, ${kib(gateway.bytes)}]`);
    }
  }
  const [largest, ...others] = violation.newModules;
  if (largest) {
    lines.push(`  가장 큰 새 모듈: ${largest.file} (${kib(largest.bytes)})`, "  그 최단 경로:", ...formatPath(largest.path, "    "));
    for (const module of others.slice(0, 2)) lines.push(`  그 다음: ${module.file} (${kib(module.bytes)})`);
  }
  if (violation.folderDeltas?.length > 0) {
    lines.push(`  폴더별 증가: ${violation.folderDeltas.slice(0, 4).map(({ folder, delta }) => `${folder} ${signedKib(delta)}`).join(" · ")}`);
  }
  return lines;
}

const formatTotalBytes = (violation) => formatBytesViolation(violation, "[정적 도달 원본 크기 초과]", "기준선에 없던 모듈");
const formatAppShell = (violation) => [
  ...formatBytesViolation(
    violation,
    `[앱 셸(첫 진입점) 폐포 크기 초과] ${violation.entry.split("/").pop()}`,
    "기준선의 앱 셸 폐포에 없던 모듈",
  ),
  "  앱 셸 폐포는 모든 방문자가 첫 로드에서 받는 코드입니다. Studio·무거운 도메인은 라우트 경계의 import() 뒤에 두세요.",
];

function formatForbidden(violation) {
  const lines = [
    `[금지 도메인 정적 도달 증가] ${violation.prefix}: ${violation.baselineModules}개 → ${violation.currentModules}개`
    + ` (기준선에 없는 모듈 ${violation.addedCount}개)`,
  ];
  for (const cause of violation.causes) {
    const { gateway, crossing } = cause;
    const sameEdge = gateway && crossing && crossing.from === gateway.from && crossing.to === gateway.to;
    if (gateway?.from) {
      lines.push(`  원인 import: ${gateway.from}  →  ${gateway.to}   [모듈 ${cause.modules}개, ${kib(cause.bytes)}]`);
    }
    if (crossing && !sameEdge) {
      lines.push(`  ${gateway?.from ? "도메인 진입" : "원인 import"}: ${crossing.from}  →  ${crossing.to}${gateway?.from ? "" : `   [모듈 ${cause.modules}개, ${kib(cause.bytes)}]`}`);
    }
  }
  const shown = violation.added.slice(0, 3);
  for (const module of shown) lines.push(`  + ${module.file} (${kib(module.bytes)})`);
  if (violation.addedCount > shown.length) lines.push(`  … 외 ${violation.addedCount - shown.length}개`);
  if (shown[0]) lines.push("  가장 큰 모듈의 최단 경로:", ...formatPath(shown[0].path, "    "));
  return lines;
}

function formatLazy(violation) {
  const lines = [
    `[지연 선언이 정적으로도 도달해 무효화됨] 새로 ${violation.items.length}개 — import() 로 나눴지만 같은 모듈을 정적으로도 끌어와 분할 효과가 없습니다.`,
  ];
  const shown = violation.items.slice(0, 4);
  for (const item of shown) {
    lines.push(`  ${kib(item.bytes).padStart(10)}  ${item.file}`);
    lines.push(`      정적 import 한 파일: ${item.staticImporters[0]?.file ?? "?"}`);
    lines.push(`      동적 import 한 파일: ${item.dynamicImporters[0] ?? "?"}`);
  }
  if (violation.items.length > shown.length) lines.push(`  … 외 ${violation.items.length - shown.length}개`);
  if (shown[0]?.staticImporters[0]) lines.push("  첫 모듈을 정적으로 끌어온 최단 경로:", ...formatPath(shown[0].staticImporters[0].path, "    "));
  return lines;
}

/** 위반 한 건을 줄로 바꾼다. */
export function formatViolation(violation) {
  switch (violation.kind) {
    case "total-bytes": return formatTotalBytes(violation);
    case "app-shell-bytes": return formatAppShell(violation);
    case "entries-changed":
      return [
        `[진입점 목록 변경] 기준선 ${violation.baseline.join(", ")} → 현재 ${violation.current.join(", ")}`,
        "  의도한 변경이면 node scripts/check-studio-eager-graph.mjs --update-baseline --reason \"<사유>\" 로 다시 기록하세요.",
      ];
    case "forbidden-domain": return formatForbidden(violation);
    case "lazy-invalidated": return formatLazy(violation);
    case "baseline-incomplete":
      return [`[기준선에 없는 금지 도메인] ${violation.prefix} — node scripts/check-studio-eager-graph.mjs --update-baseline 으로 현재 도달 수를 기록하세요.`];
    default: return [`[알 수 없는 위반] ${JSON.stringify(violation)}`];
  }
}

export const FIX_GUIDE_LINES = Object.freeze([
  "고치는 방법",
  "  1) '원인 import' 한 줄을 사용자 의도 시점(도구 선택·패널 열기·내보내기 실행)에 실행되는 import() 로 바꾼다(lazyRetry 패턴).",
  "  2) 타입만 필요하면 `import type { X }` 를 쓴다. `import { type X }` 는 verbatimModuleSyntax 에서 `import \"…\"` 로 남아 모듈을 끌어온다.",
  "  3) 배럴(index.ts) 대신 필요한 파일을 직접 import 하고, 레지스트리는 지연 provider 맵으로 만든다.",
  "  4) 정적 의존이 정말 필요하면 --update-baseline --reason \"<사유>\" 로 수용하고 PR 에서 승인을 받는다.",
  `  가이드: ${GUIDE_PATH} (지연 로딩 패턴 · 배럴과 진입 그래프)`,
]);

function formatForbiddenCounts(measurement, baseline) {
  const reached = [];
  let clean = 0;
  for (const [prefix, current] of Object.entries(measurement.forbidden)) {
    const recorded = baseline?.forbiddenDomains?.[prefix]?.modules;
    if (current.modules === 0 && (recorded ?? 0) === 0) clean += 1;
    else reached.push(`${prefix.replace("apps/web/src/domains/", "")} ${current.modules}/${recorded ?? "-"}`);
  }
  return { reached, clean };
}

/** 통과·실패와 무관하게 항상 보여 주는 요약. */
export function formatSummary({ graph, measurement, baseline, verbose = false, compact = false }) {
  const lines = [];
  const entryLabel = Object.entries(measurement.entryTotals)
    .map(([entry, value]) => `${entry.split("/").pop()} ${count(value.modules)}개 ${mib(value.bytes)}`)
    .join(" / ");
  lines.push(
    `정적 도달 모듈 ${count(measurement.totals.modules)}개 · 원본 ${kib(measurement.totals.bytes)} (${mib(measurement.totals.bytes)})`
    + (baseline ? ` · 기준선 ${mib(baseline.totals.bytes)}, 허용 +${(TOTAL_BYTES_TOLERANCE * 100).toFixed(0)}% = ${mib(Math.floor(baseline.totals.bytes * (1 + TOTAL_BYTES_TOLERANCE)))}` : ""),
  );
  lines.push(`  진입점별: ${entryLabel}`);

  const folders = Object.entries(measurement.folders)
    .sort(([leftName, left], [rightName, right]) => right.bytes - left.bytes || compareText(leftName, rightName));
  if (!compact) {
    lines.push(`폴더별 용량 상위 ${verbose ? folders.length : TOP_FOLDERS}:`);
    for (const [folder, value] of folders.slice(0, verbose ? folders.length : TOP_FOLDERS)) {
      lines.push(`  ${kib(value.bytes).padStart(11)}  ${String(value.modules).padStart(4)}개  ${folder}`);
    }
  }

  const { reached, clean } = formatForbiddenCounts(measurement, baseline);
  lines.push(`금지 도메인 정적 도달(현재/기준선): ${reached.length > 0 ? reached.join(" · ") : "없음"}`
    + (clean > 0 ? ` · 도달 0인 도메인 ${clean}개` : ""));

  const lazyBytes = graph.lazyInvalidated.reduce((sum, item) => sum + item.bytes, 0);
  lines.push(`지연 무효화 모듈 ${graph.lazyInvalidated.length}개 (${kib(lazyBytes)})`
    + (baseline ? ` — 기준선 ${baseline.lazyInvalidated.length}개` : ""));
  const lazyShown = compact ? 0 : verbose ? graph.lazyInvalidated.length : 5;
  for (const item of graph.lazyInvalidated.slice(0, lazyShown)) {
    lines.push(`  ${kib(item.bytes).padStart(9)}  ${item.file}`);
    lines.push(`             ← 정적 import: ${item.staticImporters[0] ?? "?"}  / 동적 import: ${item.dynamicImporters[0] ?? "?"}`);
  }
  if (graph.lazyInvalidated.length > lazyShown && !compact) lines.push(`  … 외 ${graph.lazyInvalidated.length - lazyShown}개 (--verbose 로 전체)`);
  if (graph.unresolved.length > 0) lines.push(`해석하지 못한 지정자 ${graph.unresolved.length}개 (--verbose 로 목록)`);
  if (verbose && graph.opaqueDynamic > 0) {
    lines.push(`지정자가 리터럴이 아니라 간선으로 세지 못한 import() ${graph.opaqueDynamic}개`);
  }
  if (verbose) {
    for (const item of [...graph.unresolved].sort((left, right) => compareText(left.from, right.from))) {
      lines.push(`  해석 실패: ${item.from} → ${item.specifier}`);
    }
  }
  return lines;
}
