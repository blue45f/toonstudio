/**
 * 소스 파일 크기 래칫 — 기준선 판정과 갱신.
 *
 * 규칙(scripts/source-file-size-baseline.json 대비):
 * (가) 기준선에 없는 파일은 상한(800줄)을 넘을 수 없다.
 * (나) 기준선에 기록된 초과 파일은 기록된 줄 수보다 늘 수 없다. 줄어들면 `--tighten` 으로 기준선만 낮출 수 있다.
 * (다) 기준선 목록에 없는 파일에 `// @ts-nocheck` 를 새로 둘 수 없다.
 * (라) `--update-baseline` 은 증가를 허용하지 않는다. 새 초과 파일을 등록할 때만 쓰며 사유(--reason)가 필수다.
 */
import { SOURCE_FILE_SIZE_LIMIT } from "./source-file-size-scan.mjs";

export const BASELINE_SCHEMA = "toonstudio.source-file-size-baseline/1";
export const BASELINE_NOTE = "scripts/check-source-file-size.mjs 의 래칫 기준선이다. files 는 상한(limit)을 넘는 기존 파일의 "
  + "기록 줄 수(늘릴 수 없음), tsNoCheck 는 `// @ts-nocheck` 가 허용된 기존 파일(늘릴 수 없음)이다. 값은 손으로 올리지 말고 "
  + "`node scripts/check-source-file-size.mjs --tighten`(줄어든 값만 잠금) 또는 "
  + "`--update-baseline --reason \"<사유>\"`(새 초과 파일 등록)로 갱신한다. 해설: docs/engineering/code-structure-and-bundle-patterns.md";
export const LINE_COUNT_RULE = "개행(LF) 개수, 마지막 줄이 개행 없이 끝나면 +1";
const MAX_REGISTRATIONS = 50;
const TOP_EXCESS_COUNT = 10;

/** 기준선 형식 오류·사용법 오류(종료 코드 2). */
export class BaselineError extends Error {}
/** 래칫이 갱신을 거부함 — 기록 줄 수 증가, 새 @ts-nocheck 등록(종료 코드 1). */
export class RefusedError extends Error {}

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export function validateBaseline(raw) {
  const fail = (message) => {
    throw new BaselineError(`소스 파일 크기 기준선 형식 오류: ${message}`);
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("객체가 아닙니다");
  if (raw.schema !== BASELINE_SCHEMA) fail(`schema 는 ${BASELINE_SCHEMA} 이어야 합니다(현재 ${JSON.stringify(raw.schema)})`);
  if (!Number.isInteger(raw.limit) || raw.limit < 1) fail("limit 는 1 이상의 정수여야 합니다");
  if (!raw.files || typeof raw.files !== "object" || Array.isArray(raw.files)) fail("files 는 { 경로: 줄 수 } 객체여야 합니다");
  for (const [file, lines] of Object.entries(raw.files)) {
    if (!Number.isInteger(lines) || lines <= raw.limit) fail(`files.${file} 는 limit(${raw.limit})을 넘는 정수여야 합니다(현재 ${JSON.stringify(lines)})`);
  }
  if (!Array.isArray(raw.tsNoCheck) || raw.tsNoCheck.some((file) => typeof file !== "string")) fail("tsNoCheck 는 경로 문자열 배열이어야 합니다");
  return raw;
}

/**
 * 측정값을 기준선과 비교한다.
 *
 * @param {{ measurements: {file: string, lines: number, tsNoCheck: boolean}[], baseline: {limit: number, files: Record<string, number>, tsNoCheck: string[]} }} input
 */
export function evaluateSizes({ measurements, baseline }) {
  const { limit } = baseline;
  const recordedTsNoCheck = new Set(baseline.tsNoCheck);
  const present = new Map(measurements.map((measurement) => [measurement.file, measurement]));
  const violations = [];
  const improvements = [];

  for (const { file, lines, tsNoCheck } of measurements) {
    const recorded = baseline.files[file];
    if (recorded === undefined) {
      if (lines > limit) violations.push({ kind: "new-over-limit", file, lines, limit });
    } else if (lines > recorded) {
      violations.push({ kind: "grew", file, lines, recorded, limit });
    } else if (lines < recorded) {
      improvements.push({ file, from: recorded, to: lines, removable: lines <= limit });
    }
    if (tsNoCheck && !recordedTsNoCheck.has(file)) violations.push({ kind: "new-ts-nocheck", file });
  }

  const stale = Object.keys(baseline.files).filter((file) => !present.has(file)).sort(compareText);
  const staleTsNoCheck = baseline.tsNoCheck.filter((file) => !present.get(file)?.tsNoCheck);

  const overLimit = measurements
    .filter((measurement) => measurement.lines > limit)
    .map((measurement) => ({ file: measurement.file, lines: measurement.lines, excess: measurement.lines - limit }))
    .sort((left, right) => right.excess - left.excess || compareText(left.file, right.file));
  const recordedExcess = Object.values(baseline.files).reduce((sum, lines) => sum + (lines - limit), 0);

  return {
    violations: violations.sort((left, right) => compareText(left.file, right.file) || compareText(left.kind, right.kind)),
    improvements: improvements.sort((left, right) => (right.from - right.to) - (left.from - left.to) || compareText(left.file, right.file)),
    stale,
    staleTsNoCheck,
    summary: {
      scanned: measurements.length,
      limit,
      overLimitFiles: overLimit.length,
      totalExcessLines: overLimit.reduce((sum, item) => sum + item.excess, 0),
      recordedExcessLines: recordedExcess,
      topExcess: overLimit.slice(0, TOP_EXCESS_COUNT),
      tsNoCheckFiles: measurements.filter((measurement) => measurement.tsNoCheck).length,
      recordedTsNoCheckFiles: baseline.tsNoCheck.length,
    },
  };
}

function sortedFiles(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareText(left, right)));
}

/**
 * 기준선을 다시 쓴다.
 *
 * - mode "tighten": 줄어든 값만 반영하고, 사라졌거나 상한 이하가 된 항목을 정리한다. 새 항목은 추가하지 않는다.
 * - mode "update": tighten 에 더해 새 초과 파일을 등록한다(사유 필수). 기존 항목을 늘리거나 새 @ts-nocheck 를
 *   등록하려는 시도는 거부한다. 기준선이 없으면(최초 기록) 현재 상태 전체를 기록한다.
 *
 * @returns {{ baseline: object, lowered: object[], dropped: string[], registered: string[], refused: string[] }}
 */
export function rewriteBaseline({ baseline, measurements, mode, reason = "", now = new Date(), limit = SOURCE_FILE_SIZE_LIMIT }) {
  const bootstrap = baseline === null;
  const effectiveLimit = baseline?.limit ?? limit;
  const trimmedReason = reason.trim();
  const current = new Map(measurements.map((measurement) => [measurement.file, measurement]));
  const files = {};
  const lowered = [];
  const dropped = [];
  const refused = [];

  for (const [file, recorded] of Object.entries(baseline?.files ?? {})) {
    const measurement = current.get(file);
    if (!measurement || measurement.lines <= effectiveLimit) {
      dropped.push(file);
    } else if (measurement.lines > recorded) {
      refused.push(`${file}: ${recorded} → ${measurement.lines}줄 (기록 줄 수를 늘릴 수 없습니다)`);
      files[file] = recorded;
    } else {
      if (measurement.lines < recorded) lowered.push({ file, from: recorded, to: measurement.lines });
      files[file] = measurement.lines;
    }
  }

  const registered = [];
  for (const measurement of measurements) {
    if (measurement.lines <= effectiveLimit || baseline?.files[measurement.file] !== undefined) continue;
    if (mode === "update") {
      files[measurement.file] = measurement.lines;
      registered.push(measurement.file);
    }
  }

  const recordedTsNoCheck = new Set(baseline?.tsNoCheck ?? []);
  const tsNoCheck = [];
  for (const measurement of measurements) {
    if (!measurement.tsNoCheck) continue;
    if (bootstrap || recordedTsNoCheck.has(measurement.file)) tsNoCheck.push(measurement.file);
    else refused.push(`${measurement.file}: 새 // @ts-nocheck 는 기준선에 등록할 수 없습니다`);
  }

  if (mode === "update" && refused.length > 0) {
    throw new RefusedError(`--update-baseline 은 증가를 허용하지 않습니다. 먼저 아래를 해소하세요:\n  - ${refused.join("\n  - ")}`);
  }
  const registersSomething = bootstrap || registered.length > 0;
  if (mode === "update" && registersSomething && trimmedReason === "") {
    throw new BaselineError(
      `새 초과 파일을 등록하려면 사유가 필요합니다(왜 ${effectiveLimit}줄 안으로 나눌 수 없는지): ${registered.slice(0, 3).join(", ") || "최초 기록"}\n`
      + "  node scripts/check-source-file-size.mjs --update-baseline --reason \"<사유>\"",
    );
  }

  const registrations = [...(baseline?.registrations ?? [])];
  if (mode === "update" && registersSomething) {
    registrations.push(bootstrap
      ? { date: now.toISOString().slice(0, 10), reason: trimmedReason, files: Object.keys(files).length, tsNoCheck: tsNoCheck.length }
      : { date: now.toISOString().slice(0, 10), reason: trimmedReason, files: registered.sort(compareText) });
  }

  return {
    baseline: {
      schema: BASELINE_SCHEMA,
      limit: effectiveLimit,
      lineCount: LINE_COUNT_RULE,
      note: BASELINE_NOTE,
      files: sortedFiles(files),
      tsNoCheck: tsNoCheck.sort(compareText),
      registrations: registrations.slice(-MAX_REGISTRATIONS),
    },
    lowered,
    dropped: dropped.sort(compareText),
    registered: registered.sort(compareText),
    refused,
  };
}
