/**
 * Studio 진입 그래프 가드레일 — 측정·기준선·래칫 판정.
 *
 * 래칫 규칙(모두 scripts/studio-eager-graph-baseline.json 대비):
 * 1. 총 정적 도달 원본 크기는 기준선의 +1%를 넘을 수 없다.
 * 2. 금지 도메인은 기준선에 기록된 모듈 집합에 없는 파일이 새로 도달할 수 없다(수가 같아도 교체는 막는다).
 * 3. 지연 선언이 정적으로도 도달해 무효화된 모듈은 기준선 목록에 없는 것이 새로 생길 수 없다.
 * 4. 앱 셸(첫 진입점) 폐포 크기도 기준선의 +1%를 넘을 수 없다. Studio 모듈을 앱 셸이 정적으로 끌어오면
 *    합집합 크기는 그대로인데 모든 방문자의 첫 로드가 무거워지므로 따로 막는다.
 * 줄이는 방향은 `--tighten` 으로만 기준선에 잠그고, 늘리는 방향은 `--update-baseline --reason` 으로만 수용한다.
 */
import { compareText, isUnder, summarizeFolders } from "./studio-eager-graph.mjs";
import { FORBIDDEN_DOMAINS, TOTAL_BYTES_TOLERANCE } from "./studio-eager-graph-policy.mjs";

export const BASELINE_SCHEMA = "toonstudio.studio-eager-graph-baseline/1";
export const BASELINE_NOTE = "scripts/check-studio-eager-graph.mjs 가 기록한 마지막 수용 측정값이다. 값은 손으로 고치지 말고 "
  + "`node scripts/check-studio-eager-graph.mjs --tighten`(줄어든 값만 잠금) 또는 "
  + "`--update-baseline --reason \"<사유>\"`(늘어난 값 수용, 사유는 registrations 에 남음)로 갱신한다. "
  + "modules 는 도달 모듈과 진입점 소속 비트(entries 순서: 1=앱 셸, 2=Studio 어댑터)다. "
  + "해설: docs/engineering/code-structure-and-bundle-patterns.md";
const MAX_REGISTRATIONS = 30;
const MAX_DESCRIBED_MODULES = 12;

/** 기준선 형식 오류·사용법 오류. CLI 가 종료 코드 2 로 구분한다. */
export class BaselineError extends Error {}

const sortedEntries = (record) => Object.entries(record).sort(([left], [right]) => compareText(left, right));
const sortedRecord = (record) => Object.fromEntries(sortedEntries(record));
const byteLabel = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const sameList = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

/** 그래프를 기준선과 비교 가능한 형태로 요약한다. `modules` 는 { 경로: 진입점 소속 비트마스크 } 다. */
export function measureGraph(graph, forbiddenDomains = FORBIDDEN_DOMAINS) {
  const forbidden = {};
  for (const { prefix } of forbiddenDomains) {
    const files = [...graph.modules.keys()].filter((file) => isUnder(file, prefix)).sort(compareText);
    forbidden[prefix] = {
      modules: files.length,
      bytes: files.reduce((sum, file) => sum + graph.modules.get(file).bytes, 0),
      files,
    };
  }
  const entryBit = new Map(graph.entries.map((entry, index) => [entry, 1 << index]));
  const maskOf = (record) => record.entries.reduce((mask, entry) => mask | entryBit.get(entry), 0);
  return {
    entries: [...graph.entries],
    totals: { ...graph.totals },
    entryTotals: sortedRecord(graph.entryTotals),
    folders: sortedRecord(Object.fromEntries(summarizeFolders(graph))),
    forbidden: sortedRecord(forbidden),
    lazyInvalidated: graph.lazyInvalidated
      .map(({ file, staticImporters }) => ({ file, staticImporter: staticImporters[0] ?? null }))
      .sort((left, right) => compareText(left.file, right.file)),
    modules: sortedRecord(Object.fromEntries([...graph.modules.values()].map((record) => [record.file, maskOf(record)]))),
  };
}

function expect(condition, message) {
  if (!condition) throw new BaselineError(`Studio 진입 그래프 기준선 형식 오류: ${message}`);
}

/** 기준선 JSON 을 검증한다. 손으로 고쳐 깨진 값은 조용히 통과시키지 않는다. */
export function validateBaseline(raw) {
  expect(raw && typeof raw === "object" && !Array.isArray(raw), "객체가 아닙니다");
  expect(raw.schema === BASELINE_SCHEMA, `schema 는 ${BASELINE_SCHEMA} 이어야 합니다(현재 ${JSON.stringify(raw.schema)})`);
  const isCount = (value) => Number.isInteger(value) && value >= 0;
  expect(Array.isArray(raw.entries) && raw.entries.length > 0 && raw.entries.every((entry) => typeof entry === "string"), "entries 는 진입점 경로 배열이어야 합니다");
  expect(isCount(raw.totals?.bytes) && isCount(raw.totals?.modules), "totals.bytes/modules 는 0 이상의 정수여야 합니다");
  expect(raw.forbiddenDomains && typeof raw.forbiddenDomains === "object", "forbiddenDomains 가 없습니다");
  for (const [prefix, domain] of Object.entries(raw.forbiddenDomains)) {
    expect(
      Array.isArray(domain.files) && domain.files.every((file) => typeof file === "string"),
      `forbiddenDomains.${prefix}.files 는 문자열 배열이어야 합니다`,
    );
    expect(domain.modules === domain.files.length, `forbiddenDomains.${prefix}.modules 가 files 길이와 다릅니다`);
  }
  expect(
    Array.isArray(raw.lazyInvalidated) && raw.lazyInvalidated.every((item) => typeof item?.file === "string"),
    "lazyInvalidated 는 { file } 배열이어야 합니다",
  );
  const maxMask = 2 ** raw.entries.length - 1;
  expect(
    raw.modules && typeof raw.modules === "object" && !Array.isArray(raw.modules)
      && Object.values(raw.modules).every((mask) => Number.isInteger(mask) && mask >= 1 && mask <= maxMask),
    "modules 는 { 경로: 진입점 소속 비트 } 객체여야 합니다",
  );
  expect(raw.folders && typeof raw.folders === "object", "folders 가 없습니다");
  return raw;
}

/** 경로에서 기준선에 없던 첫 노드와 그 직전 노드. "어떤 import 한 줄이 끌어왔나"의 답이다. */
export function findGateway(path, knownModules) {
  for (let index = 0; index < path.length; index += 1) {
    if (!knownModules.has(path[index])) return { from: index > 0 ? path[index - 1] : null, to: path[index] };
  }
  return null;
}

/** 경로에서 금지 도메인으로 처음 들어가는 간선. */
export function findCrossing(path, prefix) {
  for (let index = 1; index < path.length; index += 1) {
    if (isUnder(path[index], prefix) && !isUnder(path[index - 1], prefix)) return { from: path[index - 1], to: path[index] };
  }
  return null;
}

function summarizeGateways(newModules) {
  const gateways = new Map();
  for (const module of newModules) {
    if (!module.gateway) continue;
    const key = `${module.gateway.from ?? ""}\u0000${module.gateway.to}`;
    const entry = gateways.get(key) ?? { ...module.gateway, modules: 0, bytes: 0 };
    entry.modules += 1;
    entry.bytes += module.bytes;
    gateways.set(key, entry);
  }
  return [...gateways.values()].sort((left, right) => right.bytes - left.bytes || compareText(left.to, right.to));
}

/** 같은 원인 간선(새 import + 도메인 진입)으로 닿은 모듈을 묶어 "한 줄 고치면 되는 곳"을 줄여 보여 준다. */
function summarizeCauses(described) {
  const causes = new Map();
  for (const module of described) {
    const key = JSON.stringify([module.gateway?.from ?? null, module.gateway?.to ?? null, module.crossing?.from ?? null, module.crossing?.to ?? null]);
    const entry = causes.get(key) ?? { gateway: module.gateway, crossing: module.crossing, modules: 0, bytes: 0 };
    entry.modules += 1;
    entry.bytes += module.bytes;
    causes.set(key, entry);
  }
  return [...causes.values()].sort((left, right) => right.bytes - left.bytes);
}

function folderGrowth(measurement, baseline) {
  return sortedEntries(measurement.folders)
    .map(([folder, value]) => ({ folder, delta: value.bytes - (baseline.folders[folder]?.bytes ?? 0) }))
    .filter((item) => item.delta > 0)
    .sort((left, right) => right.delta - left.delta || compareText(left.folder, right.folder))
    .slice(0, 6);
}

/**
 * 측정값을 기준선과 비교한다.
 *
 * @param {{ measurement: ReturnType<typeof measureGraph>, baseline: object, graph: object, forbiddenDomains?: readonly {prefix: string}[], tolerance?: number }} input
 *   graph 는 새로 도달한 모듈의 크기(`modules`)·최단 경로(`shortestPath`, `pathIn`)·지연 무효화 목록을 제공한다.
 */
export function evaluateRatchet({
  measurement, baseline, graph, forbiddenDomains = FORBIDDEN_DOMAINS, tolerance = TOTAL_BYTES_TOLERANCE,
}) {
  const violations = [];
  const improvements = [];
  const knownModules = new Set(Object.keys(baseline.modules));
  const describe = (file, path = graph.shortestPath(file), known = knownModules) => ({
    file, bytes: graph.modules.get(file)?.bytes ?? 0, path, gateway: findGateway(path, known),
  });

  const entriesMatch = sameList(baseline.entries, measurement.entries);
  if (!entriesMatch) {
    violations.push({ kind: "entries-changed", baseline: baseline.entries, current: measurement.entries });
  }

  const ceiling = Math.floor(baseline.totals.bytes * (1 + tolerance));
  if (measurement.totals.bytes > ceiling) {
    const newModules = Object.keys(measurement.modules)
      .filter((file) => !knownModules.has(file))
      .map((file) => describe(file))
      .sort((left, right) => right.bytes - left.bytes || compareText(left.file, right.file));
    violations.push({
      kind: "total-bytes",
      current: measurement.totals.bytes,
      baseline: baseline.totals.bytes,
      ceiling,
      tolerance,
      newModuleCount: newModules.length,
      newModuleBytes: newModules.reduce((sum, module) => sum + module.bytes, 0),
      newModules: newModules.slice(0, MAX_DESCRIBED_MODULES),
      gateways: summarizeGateways(newModules).slice(0, 6),
      folderDeltas: folderGrowth(measurement, baseline),
    });
  } else if (measurement.totals.bytes < baseline.totals.bytes) {
    improvements.push(`총 정적 도달 원본 크기 ${byteLabel(baseline.totals.bytes - measurement.totals.bytes)} 감소`);
  }

  const appEntry = measurement.entries[0];
  const baselineApp = baseline.entryTotals?.[appEntry];
  const currentApp = measurement.entryTotals[appEntry];
  if (entriesMatch && baselineApp && currentApp) {
    const appCeiling = Math.floor(baselineApp.bytes * (1 + tolerance));
    if (currentApp.bytes > appCeiling) {
      const knownInApp = new Set(Object.entries(baseline.modules).filter(([, mask]) => (mask & 1) !== 0).map(([file]) => file));
      const members = Object.entries(measurement.modules)
        .filter(([file, mask]) => (mask & 1) !== 0 && !knownInApp.has(file))
        .map(([file]) => describe(file, graph.pathIn(appEntry, file), knownInApp))
        .sort((left, right) => right.bytes - left.bytes || compareText(left.file, right.file));
      violations.push({
        kind: "app-shell-bytes",
        entry: appEntry,
        current: currentApp.bytes,
        baseline: baselineApp.bytes,
        ceiling: appCeiling,
        tolerance,
        newModuleCount: members.length,
        newModuleBytes: members.reduce((sum, module) => sum + module.bytes, 0),
        newModules: members.slice(0, MAX_DESCRIBED_MODULES),
        gateways: summarizeGateways(members).slice(0, 6),
      });
    } else if (currentApp.bytes < baselineApp.bytes) {
      improvements.push(`앱 셸 폐포 ${byteLabel(baselineApp.bytes - currentApp.bytes)} 감소`);
    }
  }

  for (const { prefix } of forbiddenDomains) {
    const current = measurement.forbidden[prefix];
    const recorded = baseline.forbiddenDomains[prefix];
    if (!recorded) {
      violations.push({ kind: "baseline-incomplete", prefix });
      continue;
    }
    const known = new Set(recorded.files);
    const added = current.files.filter((file) => !known.has(file));
    if (added.length > 0) {
      const described = added
        .map((file) => {
          const module = describe(file);
          return { ...module, crossing: findCrossing(module.path, prefix) };
        })
        .sort((left, right) => right.bytes - left.bytes || compareText(left.file, right.file));
      violations.push({
        kind: "forbidden-domain",
        prefix,
        baselineModules: recorded.modules,
        currentModules: current.modules,
        addedCount: added.length,
        added: described.slice(0, MAX_DESCRIBED_MODULES),
        causes: summarizeCauses(described).slice(0, 4),
      });
    }
    const currentSet = new Set(current.files);
    const removed = recorded.files.filter((file) => !currentSet.has(file));
    if (removed.length > 0) improvements.push(`금지 도메인 ${prefix}: 모듈 ${removed.length}개가 진입 그래프에서 빠졌습니다`);
  }

  const knownLazy = new Set(baseline.lazyInvalidated.map((item) => item.file));
  const currentLazy = new Set(measurement.lazyInvalidated.map((item) => item.file));
  const addedLazy = graph.lazyInvalidated.filter((item) => !knownLazy.has(item.file));
  if (addedLazy.length > 0) {
    violations.push({
      kind: "lazy-invalidated",
      items: addedLazy.map((item) => ({
        file: item.file,
        bytes: item.bytes,
        dynamicImporters: item.dynamicImporters.slice(0, 3),
        staticImporters: item.staticImporters.slice(0, 3).map((importer) => describe(importer)),
      })),
    });
  }
  const fixedLazy = baseline.lazyInvalidated.filter((item) => !currentLazy.has(item.file));
  if (fixedLazy.length > 0) improvements.push(`지연 무효화 모듈 ${fixedLazy.length}개가 정상적으로 분리되었습니다`);

  return { violations, improvements };
}

function snapshot(measurement) {
  return {
    entries: measurement.entries,
    policy: { totalBytesTolerance: TOTAL_BYTES_TOLERANCE },
    totals: measurement.totals,
    entryTotals: measurement.entryTotals,
    forbiddenDomains: sortedRecord(measurement.forbidden),
    lazyInvalidated: measurement.lazyInvalidated,
    folders: measurement.folders,
    modules: measurement.modules,
  };
}

const ENTRIES_CHANGED_MESSAGE = "진입점 목록이 기준선과 다릅니다. 진입점이 바뀐 것이 의도라면 "
  + "`node scripts/check-studio-eager-graph.mjs --update-baseline --reason \"<사유>\"` 로 다시 기록하세요.";

/** `--tighten`: 줄어든 값만 기준선에 반영한다. 어떤 값도 늘리거나 새로 추가하지 않는다. */
export function tightenBaseline(baseline, measurement) {
  if (!sameList(baseline.entries, measurement.entries)) throw new BaselineError(ENTRIES_CHANGED_MESSAGE);
  const changes = [];
  const lower = (label, previous, current) => {
    if (current < previous) changes.push(`${label}: ${previous.toLocaleString("en-US")} → ${current.toLocaleString("en-US")}`);
    return Math.min(previous, current);
  };
  const next = structuredClone(baseline);
  next.totals = {
    modules: lower("총 모듈 수", baseline.totals.modules, measurement.totals.modules),
    bytes: lower("총 정적 도달 원본 바이트", baseline.totals.bytes, measurement.totals.bytes),
  };
  next.entryTotals = {};
  for (const [entry, value] of sortedEntries(baseline.entryTotals ?? {})) {
    const current = measurement.entryTotals[entry];
    next.entryTotals[entry] = current
      ? {
        modules: Math.min(value.modules, current.modules),
        bytes: lower(`진입점 ${entry.split("/").pop()} 원본 바이트`, value.bytes, current.bytes),
      }
      : value;
  }
  next.folders = {};
  for (const [folder, value] of sortedEntries(baseline.folders)) {
    const current = measurement.folders[folder];
    if (!current) continue;
    next.folders[folder] = { modules: Math.min(value.modules, current.modules), bytes: Math.min(value.bytes, current.bytes) };
  }
  next.forbiddenDomains = {};
  for (const [prefix, value] of sortedEntries(baseline.forbiddenDomains)) {
    const current = measurement.forbidden[prefix];
    if (!current) continue; // 정책에서 빠진 도메인은 기준선에서도 정리한다.
    const currentSet = new Set(current.files);
    const files = value.files.filter((file) => currentSet.has(file));
    if (files.length < value.modules) changes.push(`금지 도메인 ${prefix}: 모듈 ${value.modules} → ${files.length}`);
    next.forbiddenDomains[prefix] = { modules: files.length, bytes: Math.min(value.bytes, current.bytes), files };
  }
  const currentLazy = new Map(measurement.lazyInvalidated.map((item) => [item.file, item]));
  next.lazyInvalidated = baseline.lazyInvalidated
    .filter((item) => currentLazy.has(item.file))
    .map((item) => currentLazy.get(item.file));
  if (next.lazyInvalidated.length < baseline.lazyInvalidated.length) {
    changes.push(`지연 무효화 모듈: ${baseline.lazyInvalidated.length} → ${next.lazyInvalidated.length}`);
  }
  // 모듈 소속은 줄이는 방향만: 기준선에 있던 비트 중 지금도 닿는 비트만 남기고 새 모듈·새 비트는 추가하지 않는다.
  next.modules = {};
  for (const [file, mask] of sortedEntries(baseline.modules)) {
    const kept = mask & (measurement.modules[file] ?? 0);
    if (kept !== 0) next.modules[file] = kept;
  }
  return { baseline: next, changes };
}

/** 이전 기준선 대비 "늘어난" 항목. 비어 있으면 수용에 사유가 필요 없다. */
export function listIncreases(previous, measurement) {
  if (!previous) return ["최초 기준선 기록"];
  const increases = [];
  if (!sameList(previous.entries, measurement.entries)) increases.push("진입점 목록 변경");
  if (measurement.totals.bytes > previous.totals.bytes) {
    increases.push(`총 정적 도달 원본 +${byteLabel(measurement.totals.bytes - previous.totals.bytes)}`);
  }
  const appEntry = measurement.entries[0];
  const previousApp = previous.entryTotals?.[appEntry];
  const currentApp = measurement.entryTotals[appEntry];
  if (previousApp && currentApp && currentApp.bytes > previousApp.bytes) {
    increases.push(`앱 셸 폐포 +${byteLabel(currentApp.bytes - previousApp.bytes)}`);
  }
  for (const [prefix, current] of sortedEntries(measurement.forbidden)) {
    const recorded = previous.forbiddenDomains[prefix];
    if (!recorded) continue; // 정책에 새로 추가된 도메인의 첫 기록은 "현재 상태 기록"이지 증가가 아니다.
    const known = new Set(recorded.files);
    const added = current.files.filter((file) => !known.has(file)).length;
    if (added > 0) increases.push(`금지 도메인 ${prefix} +${added}개`);
  }
  const knownLazy = new Set(previous.lazyInvalidated.map((item) => item.file));
  const addedLazy = measurement.lazyInvalidated.filter((item) => !knownLazy.has(item.file)).length;
  if (addedLazy > 0) increases.push(`지연 무효화 모듈 +${addedLazy}개`);
  return increases;
}

/**
 * `--update-baseline`: 현재 측정값을 그대로 기준선으로 삼는다(양방향 수용).
 * 늘어난 항목이 있으면 `reason` 이 필수이며 기준선의 registrations 에 남는다.
 */
export function updateBaseline(previous, measurement, { reason, now = new Date() } = {}) {
  const increases = listIncreases(previous, measurement);
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (increases.length > 0 && trimmedReason === "") {
    throw new BaselineError(
      `기준선이 늘어나는 항목이 있어 사유가 필요합니다: ${increases.join(", ")}\n`
      + "  node scripts/check-studio-eager-graph.mjs --update-baseline --reason \"<왜 지연 로딩으로 막을 수 없는지>\"",
    );
  }
  const registrations = [...(previous?.registrations ?? [])];
  if (trimmedReason !== "") registrations.push({ date: now.toISOString().slice(0, 10), reason: trimmedReason, increases });
  const next = {
    schema: BASELINE_SCHEMA,
    note: BASELINE_NOTE,
    ...snapshot(measurement),
    registrations: registrations.slice(-MAX_REGISTRATIONS),
  };
  return { baseline: next, increases };
}
