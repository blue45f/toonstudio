#!/usr/bin/env node
/**
 * 트리 셰이킹 & 초기(Eager) 번들 다이어트 자동 분석기.
 *
 * `apps/web/src` 진입점(기본: `apps/web/index.html` 모듈 스크립트 + Studio 어댑터,
 * `scripts/check-studio-eager-graph.mjs`와 동일한 정적 도달 그래프 기준)에서
 * 정적(eager)으로 끌려 들어오는 다음 3가지 번들 비효율 후보를 AST로 정밀 분석한다.
 *
 *   1. barrel-reexport      — 대용량 배럴(`index.ts`·다중 re-export 허브)의 미사용/과잉 fanout re-export
 *   2. namespace-import     — `import * as` 네임스페이스 임포트(트리 셰이킹 차단·미사용 멤버)
 *   3. unused-static-import — 미사용 정적 임포트·타입 전용 사용·`import { type X }` 사이드이펙트 잔존
 *
 * 사용법:
 *   node scripts/analyze-bundle-treeshake.mjs [--json | --markdown] [--top <N>]
 *        [--min-bytes <N>] [--root <dir>] [--entry <path>]... [--output <path>]
 *
 * 종료 코드: 0 성공 / 2 인자·환경 오류.
 * `scripts/check-studio-eager-graph.mjs` 및 기준선 파일을 수정하지 않는 읽기 전용 분석기다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseModuleTreeshakeInfo } from "./lib/bundle-treeshake-ast.mjs";
import {
  buildEagerGraph,
  compareText,
  resolveStudioEntries,
} from "./lib/studio-eager-graph.mjs";
import { createModuleResolver, toPosix } from "./lib/studio-eager-graph-resolve.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TOP = 20;

const USAGE = [
  "사용법: node scripts/analyze-bundle-treeshake.mjs [--json | --markdown] [--top <N>]",
  "        [--min-bytes <N>] [--root <dir>] [--entry <path>]... [--output <path>]",
].join("\n");

class UsageError extends Error {}

function roundKiB(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

function targetIdOf(resolved) {
  if (resolved.kind === "module" || resolved.kind === "data") return resolved.file;
  if (resolved.kind === "external") return `external:${resolved.packageName}`;
  return null;
}

export function parseArguments(argv) {
  const options = {
    format: "markdown",
    top: DEFAULT_TOP,
    minBytes: 0,
    root: DEFAULT_ROOT,
    entries: [],
    output: null,
    help: false,
  };
  let formatSpecified = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${argument} 에는 값이 필요합니다.`);
      }
      index += 1;
      return value;
    };
    if (argument === "--json") {
      if (formatSpecified && options.format !== "json") {
        throw new UsageError("--json 과 --markdown 은 함께 쓸 수 없습니다.");
      }
      options.format = "json";
      formatSpecified = true;
    } else if (argument === "--markdown" || argument === "--md") {
      if (formatSpecified && options.format !== "markdown") {
        throw new UsageError("--json 과 --markdown 은 함께 쓸 수 없습니다.");
      }
      options.format = "markdown";
      formatSpecified = true;
    } else if (argument === "--top") {
      const raw = Number(takeValue());
      if (!Number.isInteger(raw) || raw < 1) throw new UsageError("--top 은 1 이상의 정수여야 합니다.");
      options.top = raw;
    } else if (argument === "--min-bytes") {
      const raw = Number(takeValue());
      if (!Number.isFinite(raw) || raw < 0) throw new UsageError("--min-bytes 는 0 이상의 숫자여야 합니다.");
      options.minBytes = Math.floor(raw);
    } else if (argument === "--root") {
      options.root = path.resolve(takeValue());
    } else if (argument === "--entry") {
      options.entries.push(toPosix(takeValue()).replace(/^\.\//u, ""));
    } else if (argument === "--output") {
      options.output = takeValue();
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new UsageError(`알 수 없는 인자: ${argument}`);
    }
  }
  return options;
}

/**
 * 정적 도달 그래프에 대해 트리 셰이킹·번들 다이어트 분석을 실행한다.
 *
 * @param {{ root?: string, entries?: string[], top?: number, minBytes?: number }} config
 */
export function analyzeBundleTreeshake({
  root = DEFAULT_ROOT,
  entries,
  top = DEFAULT_TOP,
  minBytes = 0,
} = {}) {
  const started = performance.now();
  const resolvedRoot = fs.realpathSync(root);
  const resolvedEntries = entries && entries.length > 0 ? entries : resolveStudioEntries(resolvedRoot);
  const resolver = createModuleResolver({ root: resolvedRoot });
  const graph = buildEagerGraph({ root: resolvedRoot, entries: resolvedEntries, resolver });

  const parsedModules = new Map();
  const staticAdjacency = new Map();

  for (const [file, record] of graph.modules) {
    if (record.kind !== "module") {
      staticAdjacency.set(file, []);
      continue;
    }
    const text = fs.readFileSync(path.join(resolvedRoot, file), "utf8");
    const info = parseModuleTreeshakeInfo(file, text, resolver);
    parsedModules.set(file, info);

    const targets = new Set();
    for (const imp of info.imports) {
      if (imp.resolved.kind === "module" || imp.resolved.kind === "data") targets.add(imp.resolved.file);
    }
    for (const re of info.reexports) {
      if (re.resolved.kind === "module" || re.resolved.kind === "data") targets.add(re.resolved.file);
    }
    staticAdjacency.set(file, [...targets]);
  }

  /** 단일 타깃에서 정적으로 도달 가능한 서브트리 바이트 수. */
  const subtreeCache = new Map();
  const subtreeStatsOf = (startFile) => {
    const cached = subtreeCache.get(startFile);
    if (cached) return cached;
    if (!graph.modules.has(startFile)) return { modules: 0, bytes: 0 };
    const seen = new Set([startFile]);
    const queue = [startFile];
    let bytes = 0;
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      bytes += graph.modules.get(current)?.bytes ?? 0;
      for (const next of staticAdjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const result = { modules: seen.size, bytes };
    subtreeCache.set(startFile, result);
    return result;
  };

  /**
   * 간선 제거·치환 시뮬레이션 BFS.
   * `removedEdges`: Set<`${from}->${to}`>
   * `replacedEdges`: Map<`${from}->${to}`, string[]>
   */
  const simulateGraphEdit = ({ removedEdges = new Set(), replacedEdges = new Map() } = {}) => {
    const seen = new Set();
    const queue = [];
    for (const entry of resolvedEntries) {
      if (!seen.has(entry)) {
        seen.add(entry);
        queue.push(entry);
      }
    }
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const next of staticAdjacency.get(current) ?? []) {
        const edgeKey = `${current}->${next}`;
        if (replacedEdges.has(edgeKey)) {
          for (const replacement of replacedEdges.get(edgeKey)) {
            if (graph.modules.has(replacement) && !seen.has(replacement)) {
              seen.add(replacement);
              queue.push(replacement);
            }
          }
          continue;
        }
        if (removedEdges.has(edgeKey)) continue;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    let droppedModules = 0;
    let droppedBytes = 0;
    for (const [file, record] of graph.modules) {
      if (!seen.has(file)) {
        droppedModules += 1;
        droppedBytes += record.bytes;
      }
    }
    return { droppedModules, droppedBytes };
  };

  /** 모듈의 export 심볼 → 출처 하위 모듈 매핑(배럴 체인 추적). */
  const exportOriginCache = new Map();
  const resolveExportOrigins = (file, visiting = new Set()) => {
    const cached = exportOriginCache.get(file);
    if (cached) return cached;
    if (visiting.has(file)) return new Map();
    visiting.add(file);
    const origins = new Map();
    const info = parsedModules.get(file);
    if (!info) return origins;

    for (const name of info.localValueExports.keys()) {
      origins.set(name, { immediateTarget: file, originFile: file });
    }
    for (const re of info.reexports) {
      if (re.resolved.kind !== "module") continue;
      const target = re.resolved.file;
      if (re.kind === "named") {
        for (const item of re.exportedNames) {
          origins.set(item.exportedName, { immediateTarget: target, originFile: target });
        }
      } else if (re.kind === "namespace" && re.namespaceName) {
        origins.set(re.namespaceName, { immediateTarget: target, originFile: target });
      } else if (re.kind === "star") {
        const nested = resolveExportOrigins(target, visiting);
        for (const [exportedName, meta] of nested) {
          if (exportedName === "default" || origins.has(exportedName)) continue;
          origins.set(exportedName, { immediateTarget: target, originFile: meta.originFile });
        }
      }
    }
    visiting.delete(file);
    exportOriginCache.set(file, origins);
    return origins;
  };

  const hasOtherStaticReferenceTo = (info, targetFile, excludePredicate) => {
    for (const imp of info.imports) {
      if (imp.resolved.file !== targetFile) continue;
      if (excludePredicate({ kind: "import", item: imp })) continue;
      return true;
    }
    for (const re of info.reexports) {
      if (re.resolved.file !== targetFile) continue;
      if (excludePredicate({ kind: "reexport", item: re })) continue;
      return true;
    }
    return false;
  };

  const barrelCandidates = [];
  const namespaceCandidates = [];
  const unusedCandidates = [];
  const combinedRemovedEdges = new Set();
  const combinedReplacedEdges = new Map();

  // 1. 미사용 정적 임포트 & `import * as` 네임스페이스 임포트 분석
  for (const [file, info] of parsedModules) {
    const shortestPath = graph.shortestPath(file);

    for (const imp of info.imports) {
      if (imp.isSideEffectOnly) continue;
      const target = targetIdOf(imp.resolved);
      if (!target) continue;
      const isFirstParty = imp.resolved.kind === "module" || imp.resolved.kind === "data";
      const subtree = isFirstParty ? subtreeStatsOf(target) : { modules: 0, bytes: 0 };

      if (imp.isInlineTypeOnly) {
        let saveableBytes = 0;
        let saveableModules = 0;
        if (isFirstParty && !hasOtherStaticReferenceTo(info, target, ({ kind, item }) => kind === "import" && item === imp)) {
          const edgeKey = `${file}->${target}`;
          const sim = simulateGraphEdit({ removedEdges: new Set([edgeKey]) });
          saveableBytes = sim.droppedBytes;
          saveableModules = sim.droppedModules;
          combinedRemovedEdges.add(edgeKey);
        }
        unusedCandidates.push({
          id: `unused:inline-type:${file}:${imp.line}:${target}`,
          category: "unused-static-import",
          subKind: "inline-type-only-import",
          file,
          line: imp.line,
          target,
          saveableBytes,
          saveableKiB: roundKiB(saveableBytes),
          savingsKind: isFirstParty ? "exact-graph" : "at-risk-external",
          saveableModules,
          pulledBytes: subtree.bytes,
          pulledKiB: roundKiB(subtree.bytes),
          shortestPath,
          symbols: imp.namedBindings.map((binding) => binding.importedName),
          recommendationKo: "`import { type ... }` 구문이 런타임 정적 import로 남습니다. `import type { ... }`으로 전환하세요.",
        });
        continue;
      }

      if (imp.namespaceBinding) {
        const nsName = imp.namespaceBinding;
        const nsStats = info.namespaceUsage.get(nsName) ?? { members: new Set(), dynamicUse: false };
        const idStats = info.usage.get(nsName) ?? { valueUses: 0, typeUses: 0 };
        const usedMembers = [...nsStats.members].sort(compareText);
        const completelyUnused = idStats.valueUses === 0 && idStats.typeUses === 0;
        const typeOnly = idStats.valueUses === 0 && idStats.typeUses > 0;

        let saveableBytes = 0;
        let saveableModules = 0;
        let savingsKind = isFirstParty ? "exact-graph" : "at-risk-external";
        let recommendationKo;

        if (completelyUnused || typeOnly) {
          if (isFirstParty && !hasOtherStaticReferenceTo(info, target, ({ kind, item }) => kind === "import" && item === imp)) {
            const edgeKey = `${file}->${target}`;
            const sim = simulateGraphEdit({ removedEdges: new Set([edgeKey]) });
            saveableBytes = sim.droppedBytes;
            saveableModules = sim.droppedModules;
            combinedRemovedEdges.add(edgeKey);
          }
          recommendationKo = typeOnly
            ? `\`* as ${nsName}\` 가 타입 위치에서만 쓰입니다. \`import type\`으로 전환하세요.`
            : `미사용 네임스페이스 임포트 \`* as ${nsName}\` 을 제거하세요.`;
        } else if (isFirstParty && !nsStats.dynamicUse && usedMembers.length > 0) {
          const targetInfo = parsedModules.get(target);
          if (targetInfo && targetInfo.reexports.length > 0) {
            const origins = resolveExportOrigins(target);
            const neededTargets = new Set();
            let allMappedToSubmodules = true;
            for (const member of usedMembers) {
              const origin = origins.get(member);
              if (!origin || origin.immediateTarget === target) {
                allMappedToSubmodules = false;
                break;
              }
              neededTargets.add(origin.immediateTarget);
            }
            if (allMappedToSubmodules && neededTargets.size > 0) {
              const sim = simulateGraphEdit({
                replacedEdges: new Map([[`${file}->${target}`, [...neededTargets]]]),
              });
              saveableBytes = sim.droppedBytes;
              saveableModules = sim.droppedModules;
              savingsKind = "exact-graph";
            }
          }
          if (saveableBytes === 0 && targetInfo && targetInfo.localValueExports.size > usedMembers.length) {
            let unusedDeclBytes = 0;
            for (const [expName, declBytes] of targetInfo.localValueExports) {
              if (!nsStats.members.has(expName)) unusedDeclBytes += declBytes;
            }
            saveableBytes = unusedDeclBytes;
            savingsKind = "estimated-declaration-share";
          }
          recommendationKo = `\`import * as ${nsName}\` 대신 실제 사용 멤버(${usedMembers.slice(0, 4).join(", ")}${usedMembers.length > 4 ? " 외" : ""})만 named import로 교체하세요.`;
        } else if (isFirstParty && nsStats.dynamicUse) {
          savingsKind = "at-risk-external";
          recommendationKo = `\`import * as ${nsName}\` 가 동적/값 전달로 사용돼 번들러 트리 셰이킹이 차단됩니다. 필요한 심볼만 명시적 named import로 분리하세요.`;
        } else {
          recommendationKo = `외부 패키지 \`${imp.specifier}\` 의 네임스페이스 임포트(\`* as ${nsName}\`)를 개별 named import로 전환하면 트리 셰이킹 효율이 개선됩니다.`;
        }

        namespaceCandidates.push({
          id: `namespace:${file}:${imp.line}:${nsName}:${target}`,
          category: "namespace-import",
          subKind: completelyUnused
            ? "unused-namespace-import"
            : nsStats.dynamicUse
              ? "dynamic-namespace-import"
              : "static-namespace-import",
          file,
          line: imp.line,
          target,
          namespaceName: nsName,
          usedMembers,
          dynamicUse: nsStats.dynamicUse,
          saveableBytes,
          saveableKiB: roundKiB(saveableBytes),
          savingsKind,
          saveableModules,
          pulledBytes: subtree.bytes,
          pulledKiB: roundKiB(subtree.bytes),
          shortestPath,
          symbols: usedMembers.length > 0 ? usedMembers : [`* as ${nsName}`],
          recommendationKo,
        });
        continue;
      }

      const valueBindings = [];
      if (imp.defaultBinding) valueBindings.push({ localName: imp.defaultBinding, importedName: "default" });
      for (const named of imp.namedBindings) {
        if (!named.isTypeOnly) valueBindings.push(named);
      }
      if (valueBindings.length === 0) continue;

      const unusedBindings = [];
      const typeOnlyBindings = [];
      let activeValueCount = 0;

      for (const binding of valueBindings) {
        const stats = info.usage.get(binding.localName) ?? { valueUses: 0, typeUses: 0 };
        if (stats.valueUses > 0) activeValueCount += 1;
        else if (stats.typeUses > 0) typeOnlyBindings.push(binding.localName);
        else unusedBindings.push(binding.localName);
      }

      if (activeValueCount === 0) {
        const isPureUnused = typeOnlyBindings.length === 0;
        let saveableBytes = 0;
        let saveableModules = 0;
        if (isFirstParty && !hasOtherStaticReferenceTo(info, target, ({ kind, item }) => kind === "import" && item === imp)) {
          const edgeKey = `${file}->${target}`;
          const sim = simulateGraphEdit({ removedEdges: new Set([edgeKey]) });
          saveableBytes = sim.droppedBytes;
          saveableModules = sim.droppedModules;
          combinedRemovedEdges.add(edgeKey);
        }
        unusedCandidates.push({
          id: `unused:${isPureUnused ? "dead" : "type-only"}:${file}:${imp.line}:${target}`,
          category: "unused-static-import",
          subKind: isPureUnused ? "unused-binding" : "type-only-usage",
          file,
          line: imp.line,
          target,
          saveableBytes,
          saveableKiB: roundKiB(saveableBytes),
          savingsKind: isFirstParty ? "exact-graph" : "at-risk-external",
          saveableModules,
          pulledBytes: subtree.bytes,
          pulledKiB: roundKiB(subtree.bytes),
          shortestPath,
          symbols: isPureUnused ? unusedBindings : [...typeOnlyBindings, ...unusedBindings],
          recommendationKo: isPureUnused
            ? `미사용 정적 임포트(${unusedBindings.join(", ")})를 제거해 정적 그래프 간선을 끊으세요.`
            : `타입 위치에서만 참조되는 임포트(${typeOnlyBindings.join(", ")})를 \`import type\`으로 전환하세요.`,
        });
      } else if (unusedBindings.length > 0) {
        unusedCandidates.push({
          id: `unused:partial:${file}:${imp.line}:${target}`,
          category: "unused-static-import",
          subKind: "partial-unused-binding",
          file,
          line: imp.line,
          target,
          saveableBytes: 0,
          saveableKiB: 0,
          savingsKind: isFirstParty ? "exact-graph" : "at-risk-external",
          saveableModules: 0,
          pulledBytes: subtree.bytes,
          pulledKiB: roundKiB(subtree.bytes),
          shortestPath,
          symbols: unusedBindings,
          recommendationKo: `부분 미사용 심볼(${unusedBindings.join(", ")})을 import 목록에서 제거하세요.`,
        });
      }
    }
  }

  // 2. 배럴(`index.ts` 및 re-export 허브) 정적 분석
  for (const [file, info] of parsedModules) {
    const moduleReexports = info.reexports.filter((re) => re.resolved.kind === "module");
    if (moduleReexports.length === 0) continue;

    const shortestPath = graph.shortestPath(file);
    const importers = graph.importersOf(file);
    const requestedSymbols = new Set();
    let anyOpaqueConsumer = false;
    const importerRequests = new Map();

    for (const importerFile of importers) {
      const impInfo = parsedModules.get(importerFile);
      if (!impInfo) {
        anyOpaqueConsumer = true;
        continue;
      }
      const perImporterSymbols = new Set();
      let importerOpaque = false;

      for (const imp of impInfo.imports) {
        if (imp.resolved.file !== file || imp.isInlineTypeOnly) continue;
        if (imp.isSideEffectOnly || imp.defaultBinding) {
          importerOpaque = true;
          continue;
        }
        if (imp.namespaceBinding) {
          const nsStats = impInfo.namespaceUsage.get(imp.namespaceBinding);
          if (!nsStats || nsStats.dynamicUse) {
            importerOpaque = true;
          } else {
            for (const member of nsStats.members) {
              perImporterSymbols.add(member);
              requestedSymbols.add(member);
            }
          }
          continue;
        }
        for (const named of imp.namedBindings) {
          if (named.isTypeOnly) continue;
          const stats = impInfo.usage.get(named.localName);
          if (stats && stats.valueUses === 0) continue;
          perImporterSymbols.add(named.importedName);
          requestedSymbols.add(named.importedName);
        }
      }

      for (const re of impInfo.reexports) {
        if (re.resolved.file !== file) continue;
        if (re.kind === "star" || re.kind === "namespace") {
          importerOpaque = true;
        } else {
          for (const item of re.exportedNames) {
            perImporterSymbols.add(item.originalName);
            requestedSymbols.add(item.originalName);
          }
        }
      }

      if (importerOpaque) anyOpaqueConsumer = true;
      importerRequests.set(importerFile, { symbols: perImporterSymbols, opaque: importerOpaque });
    }

    const origins = resolveExportOrigins(file);

    for (const re of moduleReexports) {
      const target = re.resolved.file;
      if (anyOpaqueConsumer) continue;
      if (hasOtherStaticReferenceTo(info, target, ({ kind, item }) => kind === "reexport" && item === re)) continue;

      let candidateSymbols = [];
      let isTargetUsed = false;
      if (re.kind === "named") {
        candidateSymbols = re.exportedNames.map((item) => item.exportedName);
        isTargetUsed = candidateSymbols.some((sym) => requestedSymbols.has(sym));
      } else if (re.kind === "namespace" && re.namespaceName) {
        candidateSymbols = [re.namespaceName];
        isTargetUsed = requestedSymbols.has(re.namespaceName);
      } else if (re.kind === "star") {
        const targetOrigins = resolveExportOrigins(target);
        candidateSymbols = [...targetOrigins.keys()].filter((sym) => sym !== "default").sort(compareText);
        isTargetUsed = candidateSymbols.some((sym) => requestedSymbols.has(sym));
      }

      if (!isTargetUsed) {
        const edgeKey = `${file}->${target}`;
        const sim = simulateGraphEdit({ removedEdges: new Set([edgeKey]) });
        const subtree = subtreeStatsOf(target);
        if (sim.droppedBytes > 0) combinedRemovedEdges.add(edgeKey);

        barrelCandidates.push({
          id: `barrel:unused-reexport:${file}:${re.line}:${target}`,
          category: "barrel-reexport",
          subKind: re.kind === "star" ? "unused-star-reexport" : "unused-named-reexport",
          file,
          line: re.line,
          target,
          isIndexFile: info.isIndexFile,
          reexportCount: moduleReexports.length,
          importerCount: importers.length,
          saveableBytes: sim.droppedBytes,
          saveableKiB: roundKiB(sim.droppedBytes),
          savingsKind: "exact-graph",
          saveableModules: sim.droppedModules,
          pulledBytes: subtree.bytes,
          pulledKiB: roundKiB(subtree.bytes),
          shortestPath,
          symbols: candidateSymbols.slice(0, 8),
          recommendationKo:
            sim.droppedBytes > 0
              ? `초기 진입 경로에서 미사용되는 re-export(\`${path.posix.basename(target)}\`)를 제거하거나 직접 leaf import로 분리하면 ${roundKiB(sim.droppedBytes)} KiB(${sim.droppedModules}개 모듈)를 즉시 절감할 수 있습니다.`
              : `이 배럴을 경유해 소비되지 않는 re-export(\`${path.posix.basename(target)}\`)입니다. 불필요한 배럴 결합을 정리하세요.`,
        });
      }
    }

    const isMultiBarrel = info.isIndexFile || moduleReexports.length >= 2;
    if (isMultiBarrel && importers.length > 0 && !anyOpaqueConsumer) {
      const replacedEdges = new Map();
      let bypassableImporters = 0;

      for (const [importerFile, req] of importerRequests) {
        if (req.opaque || req.symbols.size === 0) continue;
        const neededLeaves = new Set();
        let allResolvable = true;
        for (const sym of req.symbols) {
          const meta = origins.get(sym);
          if (!meta || meta.immediateTarget === file) {
            allResolvable = false;
            break;
          }
          neededLeaves.add(meta.originFile);
        }
        if (allResolvable && neededLeaves.size > 0 && neededLeaves.size < moduleReexports.length) {
          replacedEdges.set(`${importerFile}->${file}`, [...neededLeaves]);
          bypassableImporters += 1;
        }
      }

      if (bypassableImporters > 0) {
        const sim = simulateGraphEdit({ replacedEdges });
        if (sim.droppedBytes > 0) {
          for (const [edgeKey, targets] of replacedEdges) combinedReplacedEdges.set(edgeKey, targets);
        }
        const barrelSubtree = subtreeStatsOf(file);
        barrelCandidates.push({
          id: `barrel:fanout:${file}`,
          category: "barrel-reexport",
          subKind: info.isIndexFile ? "index-barrel-fanout" : "hub-barrel-fanout",
          file,
          line: 1,
          target: `${moduleReexports.length} re-exported module(s)`,
          isIndexFile: info.isIndexFile,
          reexportCount: moduleReexports.length,
          importerCount: importers.length,
          bypassableImporters,
          saveableBytes: sim.droppedBytes,
          saveableKiB: roundKiB(sim.droppedBytes),
          savingsKind: "exact-graph",
          saveableModules: sim.droppedModules,
          pulledBytes: barrelSubtree.bytes,
          pulledKiB: roundKiB(barrelSubtree.bytes),
          shortestPath,
          symbols: [...requestedSymbols].sort(compareText).slice(0, 8),
          recommendationKo:
            sim.droppedBytes > 0
              ? `배럴(\`${path.posix.basename(file)}\`, ${moduleReexports.length}개 re-export) 경유 importer ${bypassableImporters}건을 leaf 모듈 직접 import로 바꾸면 ${roundKiB(sim.droppedBytes)} KiB(${sim.droppedModules}개 모듈) 절감됩니다.`
              : `배럴(\`${path.posix.basename(file)}\`, ${moduleReexports.length}개 re-export, 서브트리 ${roundKiB(barrelSubtree.bytes)} KiB)을 ${bypassableImporters}개 모듈이 일부 심볼만 경유 import합니다. leaf 직접 import로 전환하면 초기 청크 결합도를 낮출 수 있습니다.`,
        });
      }
    }
  }

  const filterAndSort = (items) =>
    items
      .filter((item) => item.saveableBytes >= minBytes)
      .sort(
        (left, right) =>
          right.saveableBytes - left.saveableBytes ||
          right.pulledBytes - left.pulledBytes ||
          compareText(left.category, right.category) ||
          compareText(left.file, right.file) ||
          left.line - right.line ||
          compareText(left.target, right.target),
      );

  const sortedBarrels = filterAndSort(barrelCandidates);
  const sortedNamespaces = filterAndSort(namespaceCandidates);
  const sortedUnused = filterAndSort(unusedCandidates);
  const allCandidates = filterAndSort([...sortedBarrels, ...sortedNamespaces, ...sortedUnused]);

  const combinedExact = simulateGraphEdit({
    removedEdges: combinedRemovedEdges,
    replacedEdges: combinedReplacedEdges,
  });
  const estimatedExtraBytes = allCandidates
    .filter((item) => item.savingsKind === "estimated-declaration-share")
    .reduce((sum, item) => sum + item.saveableBytes, 0);

  return {
    tool: "analyze-bundle-treeshake",
    entries: resolvedEntries,
    elapsedMs: Math.round(performance.now() - started),
    graphSummary: {
      totalModules: graph.totals.modules,
      totalBytes: graph.totals.bytes,
      totalKiB: roundKiB(graph.totals.bytes),
      entryTotals: Object.fromEntries(
        Object.entries(graph.entryTotals).map(([entry, totals]) => [
          entry,
          { modules: totals.modules, bytes: totals.bytes, kiB: roundKiB(totals.bytes) },
        ]),
      ),
    },
    counts: {
      totalCandidates: allCandidates.length,
      barrelReexport: sortedBarrels.length,
      namespaceImport: sortedNamespaces.length,
      unusedStaticImport: sortedUnused.length,
    },
    exactGraphSaveableBytes: combinedExact.droppedBytes,
    exactGraphSaveableKiB: roundKiB(combinedExact.droppedBytes),
    exactGraphSaveableModules: combinedExact.droppedModules,
    estimatedTotalSaveableBytes: combinedExact.droppedBytes + estimatedExtraBytes,
    estimatedTotalSaveableKiB: roundKiB(combinedExact.droppedBytes + estimatedExtraBytes),
    topCandidates: allCandidates.slice(0, top),
    categories: {
      barrelReexports: sortedBarrels.slice(0, top),
      namespaceImports: sortedNamespaces.slice(0, top),
      unusedStaticImports: sortedUnused.slice(0, top),
    },
  };
}

function escapeMarkdownCell(text) {
  return String(text).replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

const CATEGORY_LABELS_KO = {
  "barrel-reexport": "배럴 re-export",
  "namespace-import": "네임스페이스(`* as`)",
  "unused-static-import": "미사용 정적 import",
};

export function formatMarkdownReport(report, { top = DEFAULT_TOP } = {}) {
  const lines = [
    "# 초기(Eager) 번들 트리 셰이킹 다이어트 리포트",
    "",
    `- **분석 대상 진입점**: ${report.entries.map((entry) => `\`${entry}\``).join(", ")}`,
    `- **정적 도달 그래프**: ${report.graphSummary.totalModules.toLocaleString("en-US")}개 모듈 · ${report.graphSummary.totalKiB.toFixed(1)} KiB (${report.elapsedMs}ms)`,
    `- **탐지 후보**: 총 ${report.counts.totalCandidates}건 (배럴 re-export ${report.counts.barrelReexport}건 · 네임스페이스 임포트 ${report.counts.namespaceImport}건 · 미사용 정적 임포트 ${report.counts.unusedStaticImport}건)`,
    `- **확정 그래프 절감 잠재량(중복 제거)**: **${report.exactGraphSaveableKiB.toFixed(1)} KiB** (${report.exactGraphSaveableModules}개 모듈) / 선언 단위 추정 포함 **${report.estimatedTotalSaveableKiB.toFixed(1)} KiB**`,
    "",
    `## 절감 가능 Top-${Math.min(top, report.topCandidates.length)} 순위`,
    "",
  ];

  if (report.topCandidates.length === 0) {
    lines.push("탐지된 트리 셰이킹·배럴 최적화 후보가 없습니다.");
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    "| 순위 | 유형 | 파일 | 대상 | 절감 가능 (KiB) | 서브트리 (KiB) | 권장 조치 |",
    "| ---: | --- | --- | --- | ---: | ---: | --- |",
  );

  for (let index = 0; index < Math.min(top, report.topCandidates.length); index += 1) {
    const item = report.topCandidates[index];
    const kindLabel = CATEGORY_LABELS_KO[item.category] ?? item.category;
    const location = `${item.file}:${item.line}`;
    const savingsLabel =
      item.savingsKind === "estimated-declaration-share"
        ? `~${item.saveableKiB.toFixed(1)}`
        : item.saveableKiB.toFixed(1);
    lines.push(
      `| ${index + 1} | ${escapeMarkdownCell(kindLabel)} | \`${escapeMarkdownCell(location)}\` | \`${escapeMarkdownCell(item.target)}\` | ${savingsLabel} | ${item.pulledKiB.toFixed(1)} | ${escapeMarkdownCell(item.recommendationKo)} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function main(argv = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      log(USAGE);
      return 0;
    }
    const report = analyzeBundleTreeshake({
      root: options.root,
      entries: options.entries.length > 0 ? options.entries : undefined,
      top: options.top,
      minBytes: options.minBytes,
    });
    const rendered =
      options.format === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatMarkdownReport(report, { top: options.top });
    if (options.output) {
      const outputPath = path.resolve(options.root, options.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, rendered, "utf8");
    }
    log(rendered.trimEnd());
    return 0;
  } catch (caught) {
    if (caught instanceof UsageError) error(`${caught.message}\n${USAGE}`);
    else error(caught instanceof Error ? caught.message : String(caught));
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
